/** Symptoms of text already damaged by shell expansion; these are warnings, never refusals. */
export type MangleKind = 'teach' | 'backlog';
export type MangleSymptom = {
  kind: 'empty-substitution-hole' | 'dangling-arrow' | 'empty-brackets' | 'short-for-kind';
  /** UTF-16 code-unit index, as used by JavaScript strings (not a UTF-8 byte offset). */
  at: number;
  excerpt: string;
};

const TEACH_MIN_CHARS = 40;
const BACKLOG_MIN_CHARS = 20;

export function detectMangledText(text: string, kind: MangleKind): readonly MangleSymptom[] {
  // Literal backticks and $( are NOT symptoms: the shell left those characters intact.
  const symptoms: MangleSymptom[] = [];
  const add = (kind: MangleSymptom['kind'], at: number): void => {
    symptoms.push({ kind, at, excerpt: text.slice(at, at + 40) });
  };
  const holes = /(?<=\S) {2,}(?=\S)|(?<=\S) +(?=[.,)»;:])/g;
  const arrows = /(?:→|->)[\s\p{P}]*?(?=[.!?。！？]|$)/gu;
  const brackets = /\(\s*\)|\[\s*\]|\{\s*\}|«\s*»|"\s*"|'\s*'/g;
  for (const match of text.matchAll(holes)) add('empty-substitution-hole', match.index);
  for (const match of text.matchAll(arrows)) add('dangling-arrow', match.index);
  for (const match of text.matchAll(brackets)) add('empty-brackets', match.index);
  if (text.trim().length < (kind === 'teach' ? TEACH_MIN_CHARS : BACKLOG_MIN_CHARS)) {
    add('short-for-kind', 0);
  }
  return symptoms.sort((a, b) => a.at - b.at);
}
