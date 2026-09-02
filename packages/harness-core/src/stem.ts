/**
 * Dependency-free lexical normalization shared by registry search and recommend.
 * It deliberately handles only the measured RU/EN inflection cases; semantic
 * similarity and paraphrases belong to the separate recall/advisor tier.
 */

const CYRILLIC_TOKEN = /^\p{Script=Cyrillic}+$/u;
const LATIN_TOKEN = /^\p{Script=Latin}+$/u;

const CYRILLIC_SUFFIXES = [
  'иями',
  'иях', 'иям', 'ией', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими',
  'ях', 'ах', 'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ие', 'ые',
  'ом', 'ем', 'ам', 'ям', 'ов', 'ев', 'ью', 'ья', 'ье', 'ия', 'ии',
  'и', 'ы', 'а', 'я', 'о', 'е', 'у', 'ю', 'ь',
] as const;

function canonicalize(text: string): string {
  return text.normalize('NFC').toLowerCase().replaceAll('ё', 'е');
}

/** Unicode-aware word split without JavaScript's ASCII-only word-boundary escape. */
export function tokenize(text: string): string[] {
  return canonicalize(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function stemCyrillic(token: string): string {
  for (const suffix of CYRILLIC_SUFFIXES) {
    if (!token.endsWith(suffix)) continue;
    const candidate = token.slice(0, -suffix.length);
    if (candidate.length < 3) continue;

    // Short nouns ending in a base vowel are the precision trap behind тест/тесто
    // and права/правка. Plural и/ы still normalize тесты→тест, while a one-letter
    // case/gender tail is stripped only from a longer lexical base.
    if (suffix.length === 1 && suffix !== 'и' && suffix !== 'ы' && suffix !== 'ь'
      && candidate.length < 5) continue;
    return candidate;
  }
  return token;
}

function replaceSuffix(token: string, suffix: string, replacement: string): string | undefined {
  if (!token.endsWith(suffix)) return undefined;
  const candidate = token.slice(0, -suffix.length) + replacement;
  return candidate.length >= 3 ? candidate : undefined;
}

function stemLatin(token: string): string {
  const ies = replaceSuffix(token, 'ies', 'y');
  if (ies !== undefined) return ies;
  const sses = replaceSuffix(token, 'sses', 'ss');
  if (sses !== undefined) return sses;
  const sis = replaceSuffix(token, 'sis', 's');
  if (sis !== undefined) return sis;
  const ses = replaceSuffix(token, 'ses', 's');
  if (ses !== undefined) return ses;

  if (token.endsWith('es')) {
    const preceding = token.at(-3);
    if (preceding !== 'i' && preceding !== 's') {
      const es = replaceSuffix(token, 'es', '');
      if (es !== undefined) return es;
    }
  }
  if (token.endsWith('s')) {
    const preceding = token.at(-2);
    if (preceding !== 's' && preceding !== 'u' && preceding !== 'i' && preceding !== 'y') {
      const s = replaceSuffix(token, 's', '');
      if (s !== undefined) return s;
    }
  }
  return token;
}

/** Lowercase one token and remove at most one conservative inflectional suffix. */
export function stemToken(token: string): string {
  const normalized = canonicalize(token);
  if (CYRILLIC_TOKEN.test(normalized)) return stemCyrillic(normalized);
  if (LATIN_TOKEN.test(normalized)) return stemLatin(normalized);
  return normalized;
}

/** Tokenize and stem a text with the shared RU/EN rules. */
export function stems(text: string): string[] {
  return tokenize(text).map(stemToken);
}
