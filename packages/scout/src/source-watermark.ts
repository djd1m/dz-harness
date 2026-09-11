/**
 * Состояние разведки: до какого места дочитан каждый источник, и что изменилось со вчера.
 *
 * ЗАЧЕМ. Сегодняшняя память сравнивает выборку с выборкой. Если источник не ответил, его находки
 * просто исчезают из выборки — и разность объявляет их пропавшими из мира. Ложное «пропало» стоит
 * дороже пропущенной новости: человек читает разность как факт о мире, а это факт о нашей сети.
 *
 * ЗАЗЕМЛЕНИЕ. «Высоконагруженные приложения», гл. 11, с. 548–550 (KU `ddia-ch11-016-ku08`) даёт
 * два несущих требования, и оба выполнены здесь дословно:
 *   1. Неидемпотентную обработку делают идемпотентной, СОХРАНЯЯ СМЕЩЕНИЕ последнего обработанного
 *      сообщения во внешнем хранилище — повторный прогон тогда не применяется дважды. Наша отметка
 *      прочтения и есть это смещение.
 *   2. Побочные эффекты и СДВИГ СМЕЩЕНИЯ фиксируются АТОМАРНО, всё или ничего. Отсюда `commitRun`:
 *      отметка не может быть записана отдельно от результата, иначе сбой между двумя записями даёт
 *      либо потерянный день, либо повторно объявленные новости.
 * Книга требует ОГРАЖДЕНИЯ при подозрении на второго писателя — это `withRunLock`.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SourceHealth } from './sources/index.js';

/**
 * Окно перекрытия: отметка ставится РАНЬШЕ последней находки на эту величину.
 *
 * ЗАЧЕМ. Источник показывает запись не в момент её появления в мире, а когда её проиндексирует.
 * Отметка, поставленная ровно на последнюю находку, отрезала бы позднюю запись навсегда и молча.
 * Цена перекрытия — повторный показ, и он гасится устойчивым тождеством находки; цена его
 * отсутствия — потеря без следа. Поэтому перекрытие безопасно, а его отсутствие нет.
 *
 * [FIELD, n=1] Шесть часов выбраны полевым основанием, не измерением. При первом наблюдении
 * поздней индексации за пределами окна величина пересматривается — это записано в ADR-001.
 */
export const OVERLAP_MS = 6 * 60 * 60 * 1000;

/** Отметка прочтения одной пары «источник × запрос». */
export interface SourceWatermark {
  readonly sourceId: string;
  readonly queryId: string;
  /** Момент, ДО КОТОРОГО источник дочитан целиком (уже с вычтенным перекрытием). */
  readonly through: string;
  /** Когда отметку продвинули. */
  readonly advancedAt: string;
  /** ЧЕМ подтверждено продвижение. Двух значений хватает, потому что доказательств ровно два. */
  readonly evidence: 'complete' | 'valid-empty';
}

/** Итог одного обращения к источнику. */
export interface SourceRunOutcome {
  readonly sourceId: string;
  readonly queryId: string;
  /** Четыре исхода из `sources/index.ts`: продвигает отметку ТОЛЬКО `ok`. */
  readonly health: SourceHealth;
  readonly observedAt: string;
  /** Самая поздняя дата появления среди находок; `'none'` — источник ответил и ничего не показал. */
  readonly latestAppearedAt: string | 'none';
}

/** Состояние отметок целиком. Схема названа в самих данных: их читает следующий прогон. */
export interface WatermarkState {
  readonly schema: 'scout-watermarks/1';
  readonly marks: Readonly<Record<string, SourceWatermark>>;
}

export function emptyWatermarkState(): WatermarkState {
  return { schema: 'scout-watermarks/1', marks: {} };
}

/**
 * Ключ пары.
 *
 * ПОЧЕМУ КОДИРОВАНИЕ, А НЕ РАЗДЕЛИТЕЛЬ. Любой разделитель — дефис, двоеточие, даже нулевой символ —
 * неоднозначен, если он может встретиться ВНУТРИ частей: `('a\0b','c')` и `('a','b\0c')` дали бы
 * ОДИН ключ, то есть тихо смешали бы дочитанность двух разных пар. Это назвал независимый ревьюер
 * 2026-09-03, и он прав: типы идентификаторов ничего не запрещают. `JSON.stringify` кодирует
 * границу однозначно, потому что экранирует всё, что могло бы её подделать.
 *
 * ПОБОЧНО И ВАЖНО: такой ключ всегда начинается с `[`, поэтому он НИКОГДА не равен `__proto__` —
 * а присваивание `marks['__proto__'] = …` меняло бы прототип вместо записи, и отметка молча не
 * сохранялась бы.
 */
export function watermarkKey(sourceId: string, queryId: string): string {
  return JSON.stringify([sourceId, queryId]);
}

/** Отметку одной пары нельзя продвигать итогом ДРУГОЙ пары: это ошибка вызывающего, не данных. */
export class WatermarkPairMismatchError extends Error {
  override readonly name = 'WatermarkPairMismatchError';
  constructor(expected: string, got: string) {
    super(`отметка пары ${expected} не может быть продвинута итогом пары ${got}`);
  }
}

/**
 * Продвинуть отметку по итогу обращения.
 *
 * ПРАВИЛО, дословно: `ok` двигает, все остальные исходы НЕ двигают вообще; отметка никогда не едет
 * назад; при отсутствующей отметке неудачный исход её не выдумывает. Возвращается ровно прежнее
 * значение (в том числе `undefined`), чтобы у вызывающего не было соблазна счесть отказ пустым
 * успехом.
 */
export function advanceWatermark(
  current: SourceWatermark | undefined,
  outcome: SourceRunOutcome,
): SourceWatermark | undefined {
  if (current !== undefined
    && (current.sourceId !== outcome.sourceId || current.queryId !== outcome.queryId)) {
    throw new WatermarkPairMismatchError(
      watermarkKey(current.sourceId, current.queryId),
      watermarkKey(outcome.sourceId, outcome.queryId));
  }
  if (outcome.health !== 'ok') return current;

  const evidence = outcome.latestAppearedAt === 'none' ? 'valid-empty' : 'complete';
  const anchor = outcome.latestAppearedAt === 'none' ? outcome.observedAt : outcome.latestAppearedAt;
  const anchorMs = Date.parse(anchor);
  const observedMs = Date.parse(outcome.observedAt);
  // Неразобранная дата — не доказательство. Ровно так же и дата, которая после вычитания окна
  // выпадает из диапазона, представимого датой: `toISOString` на ней БРОСАЕТ, и отказ источника
  // превратился бы в падение всего прогона.
  if (!Number.isFinite(anchorMs) || !Number.isFinite(observedMs)) return current;

  const targetMs = anchorMs - OVERLAP_MS;
  const currentMs = current ? Date.parse(current.through) : Number.NEGATIVE_INFINITY;
  const throughMs = Number.isFinite(currentMs) ? Math.max(currentMs, targetMs) : targetMs;
  if (!isRepresentableDate(throughMs)) return current;

  // ВРЕМЯ ПОДТВЕРЖДЕНИЯ ТОЖЕ НЕ ЕДЕТ НАЗАД. Иначе более старый (например, переигранный) итог
  // сдвигал бы `advancedAt` в прошлое, и отметка, стоящая на месте, выглядела бы обновлённой
  // задним числом.
  const advancedAtMs = current
    ? Math.max(Date.parse(current.advancedAt) || Number.NEGATIVE_INFINITY, observedMs)
    : observedMs;

  return {
    sourceId: outcome.sourceId,
    queryId: outcome.queryId,
    through: new Date(throughMs).toISOString(),
    advancedAt: new Date(advancedAtMs).toISOString(),
    evidence,
  };
}

/** Диапазон, который `Date` вообще умеет представить: ±8.64e15 мс от эпохи. */
function isRepresentableDate(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= 8.64e15;
}

/** Применить итоги всех источников к состоянию. Пара, по которой доказательства нет, не появляется. */
export function applyOutcomes(state: WatermarkState, outcomes: readonly SourceRunOutcome[]): WatermarkState {
  const marks: Record<string, SourceWatermark> = { ...state.marks };
  for (const o of outcomes) {
    const key = watermarkKey(o.sourceId, o.queryId);
    const next = advanceWatermark(marks[key], o);
    if (next) marks[key] = next;
  }
  return { schema: 'scout-watermarks/1', marks };
}

/**
 * Корзины разности.
 *
 * КОРЗИНЫ «УДАЛЕНО» ЗДЕСЬ НЕТ И НЕ БУДЕТ без подтверждения (надгробие, 404): отсутствие в выборке
 * не есть доказательство удаления. Это то же «отсутствие квитанции — не успех», сказанное про мир.
 */
export const DIFF_BUCKETS = ['new', 'updated', 'newly-matched', 'not-observed'] as const;
export type DiffBucket = (typeof DIFF_BUCKETS)[number];

/** Наблюдённая единица. Тождество отделено от содержимого намеренно: меняется второе, не первое. */
export interface ObservedItem {
  /**
   * Устойчивое тождество ВНУТРИ источника — переживает переиндексацию и повторный показ.
   *
   * Именно внутри: два источника вправе выдать одинаковую строку (например, оба знают репозиторий
   * `a/b`). Поэтому единица опознаётся ПАРОЙ «источник + тождество», а не одним `id`. Иначе запись
   * одного источника гасила бы исчезновение записи другого — назвал независимый ревьюер 2026-09-03.
   */
  readonly id: string;
  readonly sourceId: string;
  /** Подошла ли находка под наш критерий В ЭТОМ прогоне. */
  readonly matched: boolean;
  /** Что меняется при изменении содержимого. */
  readonly fingerprint: string;
}

export type DiscoveryDiff = { readonly [B in DiffBucket]: readonly string[] };

/**
 * Разность двух наблюдений.
 *
 * НЕСУЩЕЕ ПРАВИЛО (ADR-001, Д6): единица, чей источник НЕ в состоянии `ok`, не может попасть в
 * «не наблюдалось» ни при каких условиях. Источник, о состоянии которого ничего не сказано,
 * считается НЕ ответившим — застава закрывается по умолчанию: молчание о состоянии не есть
 * разрешение объявлять пропажу.
 */
export function diffDiscoveries(
  previous: readonly ObservedItem[],
  current: readonly ObservedItem[],
  health: Readonly<Record<string, SourceHealth>>,
): DiscoveryDiff {
  const identity = (i: ObservedItem) => JSON.stringify([i.sourceId, i.id]);
  const before = new Map(previous.map((i) => [identity(i), i]));
  const now = new Map(current.map((i) => [identity(i), i]));

  const fresh: string[] = [];
  const updated: string[] = [];
  const newlyMatched: string[] = [];
  const notObserved: string[] = [];

  for (const item of current) {
    if (!item.matched) continue;
    const prev = before.get(identity(item));
    if (!prev) fresh.push(item.id);
    else if (!prev.matched) newlyMatched.push(item.id);
    else if (prev.fingerprint !== item.fingerprint) updated.push(item.id);
  }

  for (const item of previous) {
    if (!item.matched) continue;
    if (now.has(identity(item))) continue;
    // ЗДЕСЬ ЖИВЁТ ЗАПРЕТ ЛОЖНЫХ ИСЧЕЗНОВЕНИЙ, и он спрашивает СОБСТВЕННОЕ свойство.
    // Обычное чтение `health[id]` видит и УНАСЛЕДОВАННОЕ: объект с подделанным прототипом
    // (`{ __proto__: { down: 'ok' } }`) объявлял бы упавший источник ответившим — то есть застава,
    // закрытая по умолчанию, открывалась бы данными. Найдено кросс-семейным ревью 2026-09-03.
    if (!Object.hasOwn(health, item.sourceId)) continue;
    if (health[item.sourceId] !== 'ok') continue;
    notObserved.push(item.id);
  }

  return { new: fresh, updated, 'newly-matched': newlyMatched, 'not-observed': notObserved };
}

/** То, что фиксируется одной записью: результат И отметки вместе, никогда порознь. */
export interface CommittedRun {
  readonly state: WatermarkState;
  readonly items: readonly ObservedItem[];
}

const RUN_FILE = 'run.json';

/**
 * Зафиксировать прогон АТОМАРНО ДЛЯ ЧИТАТЕЛЯ.
 *
 * Порядок несущий: сначала СЕРИАЛИЗОВАТЬ целиком, потом записать во временный файл в ТОМ ЖЕ
 * каталоге, потом одним `rename` заменить прежний. Читатель видит либо прежний документ целиком,
 * либо новый целиком — половины не существует.
 *
 * ЧТО ЭТО НЕ ЗНАЧИТ, чтобы обещание не читалось шире, чем верно (уточнено по ревью 2026-09-03):
 *   • это НЕ переживание сбоя питания: `fsync` здесь нет, и после потери питания на диске может
 *     не оказаться ни нового документа, ни старого;
 *   • сериализация — не единственное место отказа: запись, переименование и уборка тоже падают;
 *   • сама по себе она НЕ исключает второго писателя. Взаимное исключение — дело `withRunLock`,
 *     и вызывающий обязан обернуть фиксацию в него.
 */
export function commitRun(dir: string, run: CommittedRun): void {
  mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(run, null, 2);          // сериализация ДО любой записи на диск
  // Имя временного файла уникально не только по процессу: два рабочих потока одного процесса
  // имеют ОДИН pid и затирали бы файл друг друга.
  const tmp = join(dir, `${RUN_FILE}.tmp-${process.pid}-${++tmpCounter}`);
  try {
    writeFileSync(tmp, body, 'utf8');
    renameSync(tmp, join(dir, RUN_FILE));
  } finally {
    rmSync(tmp, { force: true });
  }
}

let tmpCounter = 0;

/**
 * Прочитать зафиксированный прогон.
 *
 * Отсутствие файла и БИТЫЙ файл дают одно и то же: `undefined` — «прогона нет». Возвращать пустой
 * прогон было бы хуже молчания: пустота читается как «источники ответили и ничего не нашли».
 */
export function readCommittedRun(dir: string): CommittedRun | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(dir, RUN_FILE), 'utf8'));
  } catch {
    return undefined;
  }
  // РАЗБИРАЕТСЯ — НЕ ЗНАЧИТ ПОДХОДИТ. `JSON.parse` принимает `null`, число и объект любой формы;
  // приведение типом их бы пропустило, и следующий прогон читал бы чужой документ как своё
  // состояние. Проверяется ФОРМА, а не полное содержимое: этого достаточно, чтобы отличить наш
  // документ от постороннего, и не превращает чтение в схему-валидатор.
  if (!isCommittedRun(parsed)) return undefined;
  return parsed;
}

function isCommittedRun(v: unknown): v is CommittedRun {
  if (typeof v !== 'object' || v === null) return false;
  const { state, items } = v as { state?: unknown; items?: unknown };
  if (!Array.isArray(items)) return false;
  if (typeof state !== 'object' || state === null) return false;
  const { schema, marks } = state as { schema?: unknown; marks?: unknown };
  return schema === 'scout-watermarks/1' && typeof marks === 'object' && marks !== null;
}

/** Второй писатель по той же паре. Названная ошибка, а не молчаливая порча состояния. */
export class ConcurrentRunError extends Error {
  override readonly name = 'ConcurrentRunError';
  constructor(readonly key: string) {
    super(`прогон по «${key}» уже идёт: второй писатель отказан, состояние не тронуто`);
  }
}

/** Тело замка обязано быть синхронным — см. `withRunLock`. */
export class AsyncLockBodyError extends Error {
  override readonly name = 'AsyncLockBodyError';
  constructor(key: string) {
    super(`тело замка «${key}» вернуло обещание: замок снимается по выходу из функции, `
      + `то есть асинхронная работа шла бы БЕЗ него. Возьмите замок внутри синхронного участка.`);
  }
}

/**
 * Возраст, после которого замок считается брошенным.
 *
 * ЗАЧЕМ ВООБЩЕ. Процесс, убитый сигналом, не выполняет уборку: каталог-замок остаётся, и БЕЗ этого
 * порога каждый следующий прогон получал бы «уже идёт» ВЕЧНО — механизм защиты превратился бы в
 * вечную блокировку. Ровно этот сценарий назвал независимый ревьюер 2026-09-03.
 */
export const LOCK_STALE_MS = 30 * 60 * 1000;

/**
 * Взаимное исключение писателей по паре.
 *
 * ЧЕСТНОЕ НАЗВАНИЕ: это МЬЮТЕКС, а не ограждение (fencing). Ограждение требует растущей метки,
 * которая не даёт старому писателю зафиксировать результат после того, как его замок отобрали;
 * такой метки здесь нет. Прежняя редакция называла это ограждением со ссылкой на книгу — и это
 * было преувеличением обещания, а не описанием кода.
 *
 * Замок — КАТАЛОГ: его создание атомарно на всех файловых системах, в отличие от пары «проверить,
 * потом создать», между которыми успевает второй писатель.
 */
export function withRunLock<T>(dir: string, key: string, fn: () => T): T {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, `.lock-${Buffer.from(key).toString('hex')}`);
  try {
    mkdirSync(lock);
  } catch (err) {
    // Не всякий отказ `mkdir` — конкуренция. Право доступа и ошибка файловой системы, названные
    // «уже идёт», отправили бы чинить не то место.
    if ((err as { code?: unknown }).code !== 'EEXIST') throw err;
    if (!reclaimIfStale(lock)) throw new ConcurrentRunError(key);
    try { mkdirSync(lock); } catch { throw new ConcurrentRunError(key); }
  }
  let result: T;
  try {
    result = fn();
  } finally {
    release(lock);
  }
  // Проверяется ПОСЛЕ снятия замка: обещание уже вернулось, работа под замком не идёт, и молчать
  // об этом хуже, чем отказать — вызывающий считал бы себя защищённым.
  if (typeof (result as { then?: unknown } | undefined)?.then === 'function') {
    throw new AsyncLockBodyError(key);
  }
  return result;
}

function release(lock: string): void {
  try { rmSync(lock, { recursive: true, force: true }); } catch { /* замок уже снят */ }
}

/** Брошенный замок отбирается; живой — никогда. Возраст читается у самого каталога-замка. */
function reclaimIfStale(lock: string): boolean {
  let ageMs: number;
  try {
    ageMs = Date.now() - statSync(lock).mtimeMs;
  } catch {
    return true;   // замка уже нет — препятствия нет
  }
  if (ageMs < LOCK_STALE_MS) return false;
  release(lock);
  return true;
}
