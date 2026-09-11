/** Existing Markdown day files; no migration or alternate event store. */
export const JOURNAL_KINDS = ['decision', 'verdict', 'run', 'error', 'block'] as const;
export type JournalKind = typeof JOURNAL_KINDS[number];
const labels: Record<JournalKind, string> = {
  decision: 'решение', verdict: 'вердикт', run: 'запуск', error: 'ошибка', block: 'блокировка',
};
export interface JournalEvent { time: string; kind: JournalKind; text: string; ref: string }
export type JournalLine = ({ status: 'parsed'; raw: string } & JournalEvent) | { status: 'unparsed'; raw: string };
export interface JournalIo { read(path: string): string; append(path: string, body: string): void }

export function formatLine(event: JournalEvent): string {
  if (!JOURNAL_KINDS.includes(event.kind)) throw new Error(`Категория: ${JOURNAL_KINDS.join(', ')}`);
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(event.time)) throw new Error('Время должно быть HH:MM UTC');
  if (!event.text.trim() || /[\r\n\0]/.test(event.text + event.ref) || event.ref.includes('·')) {
    throw new Error('Текст и след должны занимать одну строку; след не содержит ·');
  }
  return `- ${event.time} · ${labels[event.kind]}: ${event.text.trim()} · ${event.ref.trim()}`;
}

export function parseLine(raw: string): JournalLine {
  const unparsed = { status: 'unparsed', raw } as const;
  const first = raw.indexOf('·'); const last = raw.lastIndexOf('·');
  if (first < 0 || last === first) return unparsed;
  const time = /^- ((?:[01]\d|2[0-3]):[0-5]\d)\s*$/.exec(raw.slice(0, first))?.[1];
  const body = raw.slice(first + 1, last).trim(); const colon = body.indexOf(':');
  if (!time || colon < 0) return unparsed;
  const category = body.slice(0, colon).trim();
  const kind = JOURNAL_KINDS.find(k => category === k || category === labels[k]
    || (k === 'decision' && category.startsWith('решение владельца'))
    || (k === 'error' && category === 'ошибка ведущего')
    || (k === 'run' && ['падение', 'запуск / падение'].includes(category)));
  if (!kind || !body.slice(colon + 1).trim()) return unparsed;
  return { status: 'parsed', raw, time, kind, text: body.slice(colon + 1).trim(), ref: raw.slice(last + 1).trim() };
}

/** Inclusive UTC window ending on at; week means the trailing seven calendar days. */
export function selectWindow(days: readonly string[], at: string, week: boolean): string[] {
  const end = new Date(`${at}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(at) || !Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== at) {
    throw new Error('Дата должна быть существующим днём YYYY-MM-DD');
  }
  const start = new Date(end.getTime() - (week ? 6 : 0) * 86400000).toISOString().slice(0, 10);
  return days.filter(day => day >= start && day <= at).sort();
}

/** The receipt is based on bytes read AFTER append, never on append returning normally. */
export function appendWitnessed(io: JournalIo, path: string, line: string): void {
  io.append(path, `${line}\n`);
  try {
    if (!io.read(path).endsWith(`${line}\n`)) throw new Error('хвост не совпадает');
  } catch (error) {
    throw new Error(`Запись не засвидетельствована: ${String(error)}`);
  }
}
