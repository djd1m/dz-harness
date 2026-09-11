/**
 * Журнал переходов статуса — append-only, по строке на переход.
 *
 * ЗАЧЕМ. Запись бэклога хранит РОВНО ОДИН переход: поле `statusTs` перезаписывается на каждом
 * следующем. Промежуточные переходы, повторные открытия и время, проведённое в каждом статусе,
 * стираются по построению. Измерено 2026-09-02: из 663 записей отметку несут 288, и все 288 —
 * терминальные; «сколько идея пробыла в работе» невычислимо ни для одной.
 *
 * ПОЧЕМУ ЭТО СРОЧНО, а не «когда дойдут руки». Прошлое невосстановимо: каждый день без журнала
 * навсегда вычитается из будущей аналитики. Панель можно построить когда угодно — данные для неё
 * набираются только с того дня, когда начали писать.
 *
 * ЧЕГО ЭТОТ ФАЙЛ НЕ ДЕЛАЕТ. Он не восстанавливает историю задним числом и не пытается: 12 случайных
 * снимков дают 99 переходов, но снимки нерегулярны и делались при СЛИЯНИИ, то есть в моменты,
 * коррелирующие с активностью. Восстановленное из них — отдельный слой с собственной пометкой, а
 * не строки этого журнала.
 *
 * ФОРМАТ. JSONL: одна строка — один переход, дозапись без чтения всего файла. Порча одной строки
 * не делает нечитаемым остальное — ровно поэтому не JSON-массив.
 */

import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Одна строка журнала: кто, откуда, куда, когда и по какой причине. */
export interface TransitionRow {
  /** Идентификатор записи бэклога. */
  readonly id: string;
  /** Статус ДО перехода. `null` — запись только что создана. */
  readonly from: string | null;
  readonly to: string;
  /** ISO-время. Передаётся ВЫЗЫВАЮЩИМ, а не берётся из часов: иначе функция нечистая и невоспроизводима. */
  readonly ts: string;
  /** Причина, если её назвали. Свободный текст: здесь он уместен, это летопись, а не гейт. */
  readonly reason?: string | undefined;
  /** Чем вызван переход: имя команды. Отвечает на вопрос «кто это сделал». */
  readonly by?: string | undefined;
}

/** Путь журнала. Рядом с самим бэклогом, чтобы переезд стора не разлучил их. */
export function transitionLogPath(projectRoot: string): string {
  return join(projectRoot, '.dz', 'backlog', 'status-log.jsonl');
}

/**
 * Дозаписать переход. НИКОГДА не бросает: журнал — наблюдение, а не гейт, и его поломка не должна
 * ронять команду, которая меняла статус. Возвращает признак успеха, чтобы вызывающий мог сказать
 * вслух, если запись не легла — молчаливая потеря наблюдения хуже громкой.
 */
export function appendTransition(projectRoot: string, row: TransitionRow): boolean {
  try {
    const p = transitionLogPath(projectRoot);
    mkdirSync(dirname(p), { recursive: true });
    appendFileSync(p, `${JSON.stringify(row)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Прочитать журнал. Битая строка ПРОПУСКАЕТСЯ, а не роняет чтение: файл дозаписывается конкурентно,
 * и оборванная последняя строка — нормальное состояние, а не повод потерять всю летопись.
 */
export function readTransitions(projectRoot: string): readonly TransitionRow[] {
  const p = transitionLogPath(projectRoot);
  if (!existsSync(p)) return [];
  const out: TransitionRow[] = [];
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line) as TransitionRow;
      if (typeof r?.id === 'string' && typeof r?.to === 'string' && typeof r?.ts === 'string') out.push(r);
    } catch { /* битая строка пропускается */ }
  }
  return out;
}
