/**
 * Публичный снимок бэклога: порождение, а не фильтрация.
 *
 * ЗАЧЕМ. Владелец хочет страницу «как строится харнесс в режиме реального времени». Наружу уходит
 * производное от приватного стора, где каждая из 675 записей несёт полный текст задачи. Тексты не
 * должны покидать машину никогда.
 *
 * ГЛАВНОЕ РЕШЕНИЕ (ADR-001), и оно объясняет форму всего файла: публичный объект НЕ ПРОВЕРЯЕТСЯ
 * после сборки — он СОБИРАЕТСЯ здесь, перечислением разрешённых агрегатов, и приватное поле просто
 * ни разу не читается на пути к выходу. Разница практическая: проверяющий поверх готового файла
 * ловит то, о чём мы подумали, и пропускает поле, которое добавят завтра. Порождение не пропускает
 * ничего, потому что не знает о существовании остального.
 *
 * ФУНКЦИЯ ЧИСТАЯ: два входа — записи и дата, — ни файловой системы, ни часов. Отсюда три свойства
 * сразу: проверяется без файловой системы; одинаковый вход даёт байт-идентичный выход; и её нельзя
 * сузить вызовом, потому что сужать нечем (INV-4).
 *
 * ИНВАРИАНТ, А НЕ ПЕРЕЧЕНЬ: наружу не уходит величина, ПРИВЯЗАННАЯ К ОДНОЙ ЗАПИСИ.
 *
 * Прежняя редакция перечисляла запрещённое — максимум, минимум, процентили — и была неполна:
 * медиана при НЕЧЁТНОМ числе записей тоже есть значение ровно одной записи, а перечисление её не
 * называло. Правило, сформулированное перечислением, всегда неполно, и неполнота читается как
 * разрешение. Переформулировано 2026-09-03 решением владельца, пока в публичном ряду была ОДНА
 * точка: после второй смена формулировки развела бы историю надвое.
 *
 * ЧЕСТНАЯ ГРАНИЦА: правило ОПИСЫВАЕТ, а не запрещает. Медиана при нечётном числе записей остаётся
 * значением одной записи, и инвариант это честно покрывает — но не предотвращает. Исполнение
 * машиной (отказ, если центральное значение разделяют менее MIN_GROUP записей) — отдельная работа,
 * запись бэклога a72bb268.
 *
 * Максимум по определению есть значение РОВНО ОДНОЙ записи, то есть та же группа размера один,
 * ради запрета которой написано правило малых групп. Состязательный рой нашёл это до реализации: 31,33 дня —
 * тяжёлый выброс на фоне медианы в 2 дня, он переиздавался бы неизменным месяцами и стал бы
 * устойчивым отпечатком одной идеи в каждом снимке. Вместо них — медиана и гистограмма по корзинам,
 * и порог применяется к каждой корзине.
 */

/** Версия схемы. Живёт В КАЖДОЙ точке ряда, а не только в корне: точка годичной давности должна
 * читаться новым кодом без потерь (AM-6). */
export const PUBLIC_SCHEMA = 'backlog-public/1' as const;

/** Порог малой группы. Два — минимум, при котором счётчик перестаёт быть указателем на одну запись. */
export const MIN_GROUP = 2;

/** Корзины времени до терминального состояния, в днях. Границы измерены, а не выбраны: на 288
 * терминальных записях наполнение 120 · 62 · 84 · 3 · 19, корзин меньше порога ноль. */
export const TTT_BUCKETS: readonly (readonly [string, number, number])[] = [
  ['<1', 0, 1], ['1-3', 1, 3], ['3-7', 3, 7], ['7-14', 7, 14], ['14+', 14, Infinity],
];

/** Приватная запись — ровно те поля, которые функция вправе читать. Текста среди них НЕТ. */
export interface PrivateRecord {
  readonly status: string;
  readonly createdTs?: string | undefined;
  readonly statusTs?: string | undefined;
  readonly effort?: number | undefined;
  readonly goalId?: string | null | undefined;
}

/** Коды отказа — закрытый список. Отказ всегда назван, никогда не молчалив. */
export type RefusalCode =
  | 'FORBIDDEN_FIELD' | 'SMALL_GROUP' | 'DERIVABLE_SMALL_GROUP' | 'UNSAFE_DELTA' | 'SCHEMA_DRIFT';

export interface PublicSnapshot {
  readonly schema: typeof PUBLIC_SCHEMA;
  readonly snapshotDate: string;
  readonly totals: { readonly records: number; readonly terminal: number };
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly effortCounts: Readonly<Record<string, number>>;
  /** `null` — разрез пропущен целиком; причина рядом. Пропуск ОДНОГО разреза вместо отказа всей
   * публикации: иначе одна цель с единственной записью делает фичу непубликуемой (AM-4). */
  readonly categoryCounts: Readonly<Record<string, number>> | null;
  readonly categorySkipReason: string | null;
  readonly ttt: {
    readonly medianDays: number | null;
    readonly buckets: Readonly<Record<string, number>>;
  };
  /** Положительная квитанция: молчание успехом не считается (FR-9). */
  readonly receipt: {
    readonly checkedFields: number;
    readonly checkedGroups: number;
    readonly appliedRules: readonly string[];
  };
}

export type BuildResult =
  | { readonly ok: true; readonly snapshot: PublicSnapshot }
  | { readonly ok: false; readonly code: RefusalCode; readonly reason: string };

/** Терминальность — ЯВНЫЙ предикат, а не «есть отметка времени».
 *
 * До 2026-09-03 «есть statusTs» было тождественно «запись терминальна» — 288 из 288. Починка
 * отметки времени в тот день эту тождественность разрушила: `roulette --commit` и `enrich` теперь
 * тоже её ставят. Неявный фильтр по наличию отметки МОЛЧА включил бы записи в работе и испортил
 * метрику в день собственного исправления. */
const TERMINAL = new Set(['shipped', 'dropped']);
const isTerminal = (r: PrivateRecord): boolean => TERMINAL.has(r.status);

const KNOWN_STATUS = new Set(['new', 'enriched', 'in-progress', 'shipped', 'dropped']);

function daysBetween(a: string, b: string): number | null {
  const t0 = Date.parse(a), t1 = Date.parse(b);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
  const d = (t1 - t0) / 86_400_000;
  return d >= 0 ? d : null;
}

/** Слить группы ниже порога в `other`; вернуть `null`, если и корзина оказалась мала. */
function collapseSmall(counts: Record<string, number>): { counts: Record<string, number>; skip: string | null } {
  const small = Object.entries(counts).filter(([, n]) => n < MIN_GROUP);
  if (small.length === 0) return { counts, skip: null };
  const otherSum = small.reduce((s, [, n]) => s + n, 0);
  if (otherSum < MIN_GROUP) {
    return {
      counts,
      skip: `разрез пропущен: ${small.length} групп(ы) ниже порога ${MIN_GROUP}, их сумма ${otherSum} тоже ниже порога`,
    };
  }
  const kept: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts)) if (n >= MIN_GROUP) kept[k] = n;
  kept.other = otherSum;
  return { counts: kept, skip: null };
}

/**
 * Построить публичный снимок.
 *
 * @param records разобранные приватные записи — читаются ТОЛЬКО поля `PrivateRecord`
 * @param snapshotDate дата снимка, `YYYY-MM-DD`; ВХОД, а не обращение к часам (ADR-003)
 */
export function buildPublicSnapshot(records: readonly PrivateRecord[], snapshotDate: string): BuildResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
    return { ok: false, code: 'SCHEMA_DRIFT', reason: `дата снимка обязана быть YYYY-MM-DD, получено «${snapshotDate}»` };
  }

  const statusCounts: Record<string, number> = {};
  const effortCounts: Record<string, number> = {};
  const goalCounts: Record<string, number> = {};
  const tttDays: number[] = [];

  for (const r of records) {
    if (!KNOWN_STATUS.has(r.status)) {
      // Неизвестный статус — отказ, а не тихий пропуск: молчание превратило бы новое состояние
      // в невидимое, и счётчики перестали бы сходиться с итогом без единого сообщения.
      return { ok: false, code: 'SCHEMA_DRIFT', reason: `неизвестный статус «${r.status}» — схема разошлась с данными` };
    }
    statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1;
    const e = String(r.effort ?? 'нет');
    effortCounts[e] = (effortCounts[e] ?? 0) + 1;
    const g = r.goalId ?? 'нет';
    goalCounts[g] = (goalCounts[g] ?? 0) + 1;

    // ЯВНЫЙ фильтр терминальности — см. комментарий к isTerminal.
    if (isTerminal(r) && r.createdTs && r.statusTs) {
      const d = daysBetween(r.createdTs, r.statusTs);
      if (d !== null) tttDays.push(d);
    }
  }

  const effort = collapseSmall(effortCounts);
  if (effort.skip !== null) {
    return { ok: false, code: 'SMALL_GROUP', reason: `разрез по усилию: ${effort.skip}` };
  }

  const goals = collapseSmall(goalCounts);

  // Гистограмма: порог применяется к КАЖДОЙ корзине, потому что корзина — такая же группа.
  const buckets: Record<string, number> = {};
  for (const [name, lo, hi] of TTT_BUCKETS) buckets[name] = tttDays.filter((d) => d >= lo && d < hi).length;
  const smallBucket = Object.entries(buckets).find(([, n]) => n > 0 && n < MIN_GROUP);
  if (smallBucket) {
    return {
      ok: false, code: 'SMALL_GROUP',
      reason: `корзина «${smallBucket[0]}» содержит ${smallBucket[1]} запись(и) — ниже порога ${MIN_GROUP}`,
    };
  }

  const sorted = [...tttDays].sort((a, b) => a - b);
  // Медиана по определению, а не «средний по счёту элемент». При ЧЁТНОМ числе значений средних
  // два, и медиана — их полусумма; `sorted[floor(n/2)]` брал верхний из них.
  //
  // Это не педантизм, у ошибки была цена в приватности. Верхний центральный элемент — значение
  // РОВНО ОДНОЙ записи, то есть та же группа размера один, ради запрета которой написано правило
  // малых групп (см. шапку). Полусумма двух РАЗНЫХ центральных значений значением ни одной записи
  // не является — и это единственная форма, в которой правка что-то даёт приватности. Оговорка
  // несущая: когда два центральных значения СОВПАДАЮТ, полусумма равна им же, и медиана снова есть
  // значение записей (тест A3 показывает ровно это). Найдено кросс-семейным ревью 2026-09-03:
  // прежняя редакция комментария обещала больше, чем делает код.
  // ИЗМЕРЕНО 2026-09-03 на живом сторе: n = 304, центральные 1,9879 и 2,0147, публиковалось 2,01
  // (значение одной записи), истинная медиана — 2,00.
  //
  // ЧЕСТНАЯ ГРАНИЦА, чтобы её не пришлось искать заново: при НЕЧЁТНОМ n медиана по-прежнему есть
  // значение одной записи — это свойство самого определения, а не дефект.
  //
  // СТРОКА КВИТАНЦИИ ЭТО ТЕПЕРЬ ПОКРЫВАЕТ: 2026-09-03 она переформулирована инвариантом «наружу не
  // уходит величина, привязанная к одной записи» вместо прежнего перечисления. Правка сделана в тот
  // же день сознательно — в публичном ряду была ОДНА точка, и после второй смена формулировки
  // развела бы историю надвое.
  //
  // НО ПОКРЫВАЕТ — НЕ ЗНАЧИТ ЗАПРЕЩАЕТ. Правило описывает, машина его не исполняет: медиана при
  // нечётном n уходит наружу как была. Заслон малой группы на саму медиану — запись a72bb268.
  const median = sorted.length === 0
    ? null
    : Number(((sorted.length % 2 === 1
        ? sorted[(sorted.length - 1) / 2]!
        : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2)).toFixed(2));

  const snapshot: PublicSnapshot = {
    schema: PUBLIC_SCHEMA,
    snapshotDate,
    totals: { records: records.length, terminal: records.filter(isTerminal).length },
    statusCounts,
    effortCounts: effort.counts,
    categoryCounts: goals.skip === null ? goals.counts : null,
    categorySkipReason: goals.skip,
    ttt: { medianDays: median, buckets },
    receipt: {
      checkedFields: Object.keys(statusCounts).length + Object.keys(effort.counts).length
        + (goals.skip === null ? Object.keys(goals.counts).length : 0) + Object.keys(buckets).length,
      checkedGroups: Object.keys(effort.counts).length + Object.keys(goals.counts).length + Object.keys(buckets).length,
      appliedRules: [
        `MIN_GROUP=${MIN_GROUP}`,
        'терминальность по статусу, не по наличию отметки',
        'наружу не уходит величина, привязанная к одной записи',
        ...(goals.skip !== null ? ['разрез по целям пропущен'] : []),
      ],
    },
  };
  return { ok: true, snapshot };
}

/* ================================================================== */
/*  ЗАСТАВА НА ВЫХОДЕ (ADR-004) — независимая проверка финальных байтов */
/* ================================================================== */

/**
 * Разобрать то, что СЕЙЧАС уйдёт наружу, и отказать, если что-то не так.
 *
 * ЗАЧЕМ ОТДЕЛЬНАЯ ФУНКЦИЯ, если выше уже есть порождение. Порождение защищает СВОЙ выход. Как
 * только появится второй путь наружу — а он появляется всегда, — эта гарантия его не покроет.
 * Прецедент сработал 2026-08-30: сессионный хук засеял приватный ключ в каталог сборки за секунды
 * до пуша, и починкой стала проверка ПО СОДЕРЖИМОМУ выходного дерева, а не доверие сборщику.
 *
 * ПОЧЕМУ СВОЙ ПЕРЕЧЕНЬ, А НЕ ИМПОРТ СХЕМЫ. Если бы застава брала перечень у генератора, одна
 * ошибка проходила бы обе проверки сразу. Копия — сознательное дублирование; их расхождение
 * ловится тестом и потому становится громким, а не тихим.
 *
 * ПЕРЕСЕЧЬ ЕЁ НЕЛЬЗЯ: один аргумент, никаких флагов. Проверка, которую вызывающий может ослабить,
 * проверкой не является.
 */

/** Собственная копия перечня. НЕ импортируется из схемы выше — см. комментарий. */
const EGRESS_ALLOWED_KEYS: readonly string[] = [
  'schema', 'snapshotDate', 'totals', 'statusCounts', 'effortCounts',
  'categoryCounts', 'categorySkipReason', 'ttt', 'receipt',
];

export type EgressVerdict =
  | { readonly ok: true; readonly checkedKeys: number; readonly checkedGroups: number }
  | { readonly ok: false; readonly code: RefusalCode; readonly reason: string };

export function assertPublicSafe(bytes: string): EgressVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes);
  } catch {
    return { ok: false, code: 'SCHEMA_DRIFT', reason: 'финальные байты не разбираются как JSON' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, code: 'SCHEMA_DRIFT', reason: 'публичный снимок обязан быть объектом' };
  }
  const obj = parsed as Record<string, unknown>;

  // ОБЯЗАТЕЛЬНЫЕ ПОЛЯ: пустой объект — НЕ чистый снимок.
  //
  // Найдено кросс-семейным ревью (Codex gpt-5.6-sol, вердикт F, 2026-09-03): первая редакция
  // возвращала `{ok:true, checkedKeys:0}` на `'{}'`. Это ровно та форма, против которой написан
  // весь модуль: проверка выводила «чисто» из ОТСУТСТВИЯ данных, а не из их проверки.
  for (const required of EGRESS_ALLOWED_KEYS) {
    if (!(required in obj)) {
      return { ok: false, code: 'SCHEMA_DRIFT', reason: `обязательное поле «${required}» отсутствует — неполный снимок не считается чистым` };
    }
  }

  // РЕКУРСИВНЫЙ обход, а не только верхний уровень.
  //
  // Та же проверка (вердикт F) воспроизвела утечку: `{"receipt":{"text":"ПРИВАТНЫЙ ТЕКСТ"}}`
  // проходила, потому что застава смотрела ТОЛЬКО верхние ключи, а `receipt` в перечне разрешён.
  // Дыра существовала в каждом разрешённом поле — ttt, totals, любом. Белый список верхнего уровня
  // не является белым списком: он проверяет имена дверей, не заглядывая в комнаты.
  // Перечень покрывает ВСЁ ДЕРЕВО, а не только корень. Первая починка проверяла лишь ФОРМУ
  // вложенного имени («похоже на техническое») — и короткий приватный текст под именем `text`
  // проезжал: имя техничное, строка короче порога. Форма имени ничего не гарантирует; гарантирует
  // только перечень. Ключи-ДАННЫЕ (имена статусов, целей, корзин) перечислить нельзя — они
  // приходят из данных, — поэтому для них поле объявлено словарём, и проверяется ЗНАЧЕНИЕ: число.
  const NESTED: Readonly<Record<string, readonly string[] | 'dictionary-of-numbers'>> = {
    totals: ['records', 'terminal'],
    ttt: ['medianDays', 'buckets'],
    'ttt.buckets': TTT_BUCKETS.map(([n]) => n),
    receipt: ['checkedFields', 'checkedGroups', 'appliedRules'],
    statusCounts: ['new', 'enriched', 'in-progress', 'shipped', 'dropped'],
    effortCounts: ['1', '2', '3', '4', '5', 'нет', 'other'],
    // ЕДИНСТВЕННЫЙ словарь с неперечислимыми ключами: имена целей приходят из данных владельца и
    // заранее неизвестны. Третий проход ревью показал, почему это опасно: ИМЯ КЛЮЧА само есть
    // канал — `{"statusCounts":{"PRIVATE_TASK_TEXT":2}}` проходил, потому что проверялись только
    // форма имени и тип значения. Статусы, усилия и корзины перечислимы, и теперь перечислены.
    // Для целей форма имени — единственная защита, и она названа слабой прямо здесь.
    categoryCounts: 'dictionary-of-numbers',
  };
  const DICT_KEY_RE = /^[A-Za-z0-9_<>+.-]{1,60}$/;

  // СВОБОДНАЯ СТРОКА — ЭТО КАНАЛ, даже короткая и даже в разрешённом поле.
  //
  // Второй канал, названный тем же ревью: `receipt.appliedRules` — массив строк, и порог длины в
  // 200 символов пропускал приватный текст, если он короче. Порог ловит ПРОЗУ, но не ловит
  // короткое сообщение, а утечке достаточно короткого. Поэтому строковые значения проверяются не
  // длиной, а ПРИНАДЛЕЖНОСТЬЮ: каждое из них либо перечислено, либо имеет машинную форму.
  const ALLOWED_RULE = /^(MIN_GROUP=\d+|терминальность по статусу, не по наличию отметки|наружу не уходит величина, привязанная к одной записи|разрез по целям пропущен)$/;
  const ALLOWED_STRING_AT: Readonly<Record<string, RegExp>> = {
    schema: /^backlog-public\/1$/,
    snapshotDate: /^\d{4}-\d{2}-\d{2}$/,
    categorySkipReason: /^разрез пропущен: \d+ групп\(ы\) ниже порога \d+, их сумма \d+ тоже ниже порога$/,
    'receipt.appliedRules': ALLOWED_RULE,
  };
  const walk = (node: unknown, at: string, depth: number): EgressVerdict | null => {
    if (depth > 6) return { ok: false, code: 'SCHEMA_DRIFT', reason: `слишком глубокая вложенность в ${at}` };
    if (node === null || typeof node === 'number' || typeof node === 'boolean') return null;
    if (typeof node === 'string') {
      // Место строки определяет, что ей разрешено. Строка там, где строк не ждут, — отказ; строка
      // не той формы там, где ждут, — тоже отказ. Длина остаётся вторым рубежом.
      const base = at.replace(/\[\d+\]$/, '');
      const pattern = ALLOWED_STRING_AT[base];
      if (pattern === undefined) {
        return { ok: false, code: 'FORBIDDEN_FIELD', reason: `строка в ${at} — это поле не объявлено строковым, значит не публикуется` };
      }
      if (!pattern.test(node)) {
        return { ok: false, code: 'FORBIDDEN_FIELD', reason: `строка в ${at} не соответствует объявленной форме: «${node.slice(0, 60)}»` };
      }
      if (node.length > 200) {
        return { ok: false, code: 'FORBIDDEN_FIELD', reason: `строка в ${at} длиной ${node.length} — публичный снимок не носит прозу` };
      }
      return null;
    }
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const bad = walk(node[i], `${at}[${i}]`, depth + 1);
        if (bad) return bad;
      }
      return null;
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        if (at === '' && !EGRESS_ALLOWED_KEYS.includes(k)) {
          return { ok: false, code: 'FORBIDDEN_FIELD', reason: `ключ «${k}» отсутствует в перечне разрешённых` };
        }
        if (at !== '') {
          const rule = NESTED[at];
          if (rule === undefined) {
            return { ok: false, code: 'FORBIDDEN_FIELD', reason: `поле ${at} не объявлено в перечне вложенных — его содержимое не проверяется, значит не публикуется` };
          }
          if (rule === 'dictionary-of-numbers') {
            if (!DICT_KEY_RE.test(k)) {
              return { ok: false, code: 'FORBIDDEN_FIELD', reason: `ключ словаря «${k}» в ${at} не похож на имя группы` };
            }
            if (typeof v !== 'number' || !Number.isFinite(v)) {
              return { ok: false, code: 'FORBIDDEN_FIELD', reason: `${at}.${k} — словарь счётчиков не носит ничего, кроме чисел` };
            }
          } else if (!rule.includes(k)) {
            return { ok: false, code: 'FORBIDDEN_FIELD', reason: `вложенный ключ «${k}» в ${at} отсутствует в перечне разрешённых` };
          }
        }
        const bad = walk(v, at === '' ? k : `${at}.${k}`, depth + 1);
        if (bad) return bad;
      }
      return null;
    }
    return { ok: false, code: 'SCHEMA_DRIFT', reason: `неожиданный тип в ${at}` };
  };
  const deep = walk(obj, '', 0);
  if (deep) return deep;

  // ПРОВЕРЯТЬ НАДО БАЙТЫ, А НЕ РАЗОБРАННЫЙ ОБЪЕКТ — и это второй урок того же ревью.
  //
  // Найдено кросс-семейным ревью (вердикт F, второй проход): вход с ДУБЛИРУЮЩИМ ключом
  // `{"receipt":{"text":"ПРИВАТНЫЙ ТЕКСТ"},"receipt":{...}}` проходил. JSON.parse оставляет
  // ПОСЛЕДНИЙ `receipt`, обход видит чистый объект и говорит «чисто» — а наружу уезжают ОБА,
  // потому что наружу уезжает строка, а не объект.
  //
  // Общая форма ошибки: проверяющий смотрел не на тот объект. Наружу уходят БАЙТЫ, значит
  // проверять надо байты. Способ: сериализовать разобранное обратно и сверить с исходным — всё,
  // что разбор проглотил (дубликаты ключей, лишние пробелы, комментарии), даст расхождение.
  const canonical = JSON.stringify(obj);
  if (canonical !== bytes.trim()) {
    return {
      ok: false,
      code: 'SCHEMA_DRIFT',
      reason: 'байты не совпадают с их же разбором — в них есть то, чего разбор не видит '
        + `(дубликат ключа, лишнее форматирование): ${bytes.trim().length} байт против ${canonical.length}`,
    };
  }

  // Каждая опубликованная группа не ниже порога. Проверяется ПО СОДЕРЖИМОМУ, а не по вере в то,
  // что генератор уже посчитал.
  let groups = 0;
  for (const field of ['statusCounts', 'effortCounts', 'categoryCounts'] as const) {
    const v = obj[field];
    if (v === null || v === undefined) continue;
    if (typeof v !== 'object') {
      return { ok: false, code: 'SCHEMA_DRIFT', reason: `поле ${field} обязано быть объектом счётчиков` };
    }
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n !== 'number' || !Number.isFinite(n)) {
        return { ok: false, code: 'SCHEMA_DRIFT', reason: `счётчик ${field}.${k} не число` };
      }
      if (n > 0 && n < MIN_GROUP) {
        return { ok: false, code: 'SMALL_GROUP', reason: `${field}.${k} = ${n} — ниже порога ${MIN_GROUP}` };
      }
      groups += 1;
    }
  }

  // Производная малая группа: если итог минус сумма опубликованных даёт остаток ниже порога, то
  // этот остаток восстанавливается ВЫЧИТАНИЕМ, и публиковать его нельзя даже неявно.
  const totals = obj.totals as { records?: unknown } | undefined;
  const total = typeof totals?.records === 'number' ? totals.records : null;
  if (total !== null) {
    for (const field of ['statusCounts', 'effortCounts'] as const) {
      const v = obj[field] as Record<string, number> | null | undefined;
      if (!v) continue;
      const sum = Object.values(v).reduce((s, n) => s + n, 0);
      const remainder = total - sum;
      if (remainder > 0 && remainder < MIN_GROUP) {
        return {
          ok: false, code: 'DERIVABLE_SMALL_GROUP',
          reason: `${field}: итог ${total} минус сумма ${sum} даёт ${remainder} — группа восстанавливается вычитанием`,
        };
      }
    }
  }

  return { ok: true, checkedKeys: Object.keys(obj).length, checkedGroups: groups };
}

/* ================================================================== */
/*  ПРАВИЛО РАЗНОСТЕЙ (ADR-003, AM-2/AM-3/AM-7)                        */
/* ================================================================== */

/**
 * Столбец, изменившийся между снимками ровно на единицу, не обновляется.
 *
 * ЗАЧЕМ. Правило малых групп защищает ОДИН снимок. Ряд из 365 снимков в год защищён им лишь
 * частично: читатель, сравнивая вчера и сегодня, видит, что какая-то группа выросла на единицу, и
 * это привязывает одну реальную запись к одному дню и одной категории. Состязательный рой назвал
 * это накоплением: каждый выпуск отдаёт немного, а бюджет за год нигде не назван.
 *
 * ПОТОЛОК ОТСРОЧКИ — ТРИ ДНЯ, и без него правило само себя ломает. Столбец, меняющийся по единице
 * каждый день, не обновился бы НИКОГДА: читатель год смотрел бы на замороженное число. После трёх
 * отсрочек столбец публикуется агрегатом за весь отложенный период.
 *
 * ЧТО ПОТОЛОК НА САМОМ ДЕЛЕ ДАЁТ — исправлено 2026-09-03, прежняя редакция утверждала неверное.
 * Здесь было написано, что разность за три дня «уже не единица». ИЗМЕРЕНО на восстановленной
 * истории (37 дней, репродьюсер features/dashboard-date-layers/03_adr/001-delta-cost-sim.mjs):
 * 6 из 6 агрегатных публикаций несли разность РОВНО 1. Столбец, простоявший три дня без движения
 * и сдвинувшийся на единицу на четвёртый, даёт агрегат, равный единице.
 * Гарантию даёт НЕ величина разности, а ШИРИНА ОКНА: движение привязывается к четырём дням, а не
 * к одному, и перестаёт указывать на конкретный день. Это слабее прежнего обещания и честнее его.
 *
 * ЧТО ЭТО НЕ ЛОВИТ, названо честно: правило смотрит на СОСЕДНИЕ снимки. Читатель, сравнивший
 * снимок недельной давности с сегодняшним, увидит недельную разность, и если она равна единице,
 * правило её не заметило. Защита здесь — сама длина окна: неделя связывает запись с неделей, а не
 * с днём, и это уже не указание.
 */
export type DeltaOutcome =
  | { readonly action: 'publish'; readonly value: number }
  | { readonly action: 'hold'; readonly heldDays: number; readonly reason: string }
  | { readonly action: 'publish-aggregated'; readonly value: number; readonly overPeriodDays: number };

/**
 * Потолок отсрочки в днях. Три — минимум, при котором ОКНО становится четырёхдневным и движение
 * перестаёт указывать на один день. НЕ «минимум, при котором разность больше единицы»: так было
 * написано до 2026-09-03 и это опровергнуто измерением (6 из 6 агрегатов несли разность ровно 1).
 */
export const HOLD_CAP_DAYS = 3;

/**
 * @param previous значение столбца в ПОСЛЕДНЕМ опубликованном снимке
 * @param current значение сейчас
 * @param heldDays сколько дней этот столбец уже отложен
 */
export function applyDeltaRule(previous: number | null, current: number, heldDays: number): DeltaOutcome {
  if (previous === null) return { action: 'publish', value: current };
  const delta = Math.abs(current - previous);
  if (delta !== 1) return { action: 'publish', value: current };
  if (heldDays >= HOLD_CAP_DAYS) {
    return {
      action: 'publish-aggregated', value: current, overPeriodDays: heldDays + 1,
    };
  }
  return {
    action: 'hold', heldDays: heldDays + 1,
    reason: `разность ровно 1 — столбец отложен, чтобы движение не указывало на одну запись (отсрочка ${heldDays + 1} из ${HOLD_CAP_DAYS})`,
  };
}
