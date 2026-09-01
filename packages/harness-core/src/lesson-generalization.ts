import { createHash } from 'node:crypto';

export type LessonForm = 'specific' | 'class';
export type LessonMatchedForm = 'specific' | 'class' | 'both';

export interface LessonFormsInput {
  readonly specific: string;
  readonly classForm?: string;
  readonly classAdvisory?: string;
}

export interface LessonFormRankedHit<T> {
  readonly key: string;
  readonly value: T;
  readonly matchedForm: LessonForm;
}

export interface MergedLessonFormHit<T> {
  readonly key: string;
  readonly value: T;
  readonly matchedForm: LessonMatchedForm;
  readonly score: number;
}

export function normalizeLessonForms(specific: string, classInput?: unknown): LessonFormsInput {
  if (classInput === undefined || (typeof classInput === 'string' && classInput.trim() === '')) {
    return { specific };
  }
  if (typeof classInput !== 'string') {
    return { specific, classAdvisory: 'class form must be text; the specific lesson was kept' };
  }
  return { specific, classForm: classInput.trim() };
}

function normalizedText(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('und').replace(/\s+/gu, ' ').trim();
}

function escapedLiteral(value: string): string {
  return normalizedText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

export function validateClassTemplate(
  specific: string,
  classTemplate: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const slot = /:([A-Za-z][A-Za-z0-9_-]*)/g;
  const parts: string[] = [];
  let slots = 0;
  let cursor = 0;
  for (const match of classTemplate.matchAll(slot)) {
    const index = match.index ?? 0;
    const literal = classTemplate.slice(cursor, index);
    if (literal.includes(':')) return { ok: false, reason: 'invalid :slot name' };
    parts.push(escapedLiteral(literal), '(.+?)');
    slots += 1;
    cursor = index + match[0].length;
  }
  const tail = classTemplate.slice(cursor);
  if (tail.includes(':')) return { ok: false, reason: 'invalid :slot name' };
  if (slots === 0) return { ok: false, reason: 'class form must contain at least one :slot' };
  parts.push(escapedLiteral(tail));
  try {
    return new RegExp(`^${parts.join('')}$`, 'u').test(normalizedText(specific))
      ? { ok: true }
      : { ok: false, reason: 'class form does not syntactically cover the specific lesson' };
  } catch {
    return { ok: false, reason: 'class form contains an invalid template' };
  }
}

export function lessonPairIdOf(specific: string, classTemplate: string, ts: string): string {
  const digest = createHash('sha256')
    .update(`${specific}\u0000${classTemplate}\u0000${ts}`)
    .digest('hex')
    .slice(0, 16);
  return `lesson-pair:${digest}`;
}

export function mergeLessonMatchedForms(
  left: LessonMatchedForm | undefined,
  right: LessonMatchedForm | undefined,
): LessonMatchedForm | undefined {
  if (left === undefined) return right;
  if (right === undefined || left === right) return left;
  return 'both';
}

export function mergeLessonFormHits<T>(
  specificHits: readonly LessonFormRankedHit<T>[],
  classHits: readonly LessonFormRankedHit<T>[],
  limit: number,
): MergedLessonFormHit<T>[] {
  interface Acc { value: T; specific: boolean; classForm: boolean; score: number }
  const merged = new Map<string, Acc>();
  const add = (hit: LessonFormRankedHit<T>, rank: number): void => {
    const current = merged.get(hit.key) ?? { value: hit.value, specific: false, classForm: false, score: 0 };
    if (hit.matchedForm === 'specific') current.specific = true;
    else current.classForm = true;
    current.score += 1 / (60 + rank + 1);
    merged.set(hit.key, current);
  };
  specificHits.forEach(add);
  classHits.forEach(add);
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : merged.size;
  return [...merged.entries()]
    .sort((a, b) => b[1].score - a[1].score || a[0].localeCompare(b[0]))
    .slice(0, safeLimit)
    .map(([key, hit]) => ({
      key,
      value: hit.value,
      matchedForm: hit.specific && hit.classForm ? 'both' : hit.classForm ? 'class' : 'specific',
      score: hit.score,
    }));
}
