export type ConfirmationFileGateResult =
  | { readonly verdict: 'pass'; readonly checked: readonly string[] }
  | { readonly verdict: 'fail'; readonly missing: readonly string[] }
  | { readonly verdict: 'skipped'; readonly reason: 'no-adr' }
  | { readonly verdict: 'refused'; readonly reason: string };

export type ConfirmationFileExists = (path: string) => boolean;

const CONFIRMATION_HEADING = '## Confirmation';
const TEST_FILE_TOKEN = /[A-Za-z0-9@._*-]+(?:\/[A-Za-z0-9@._*-]+)+\.(?:[cm]?[jt]sx?|py|sh)/g;

function confirmationSections(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line === CONFIRMATION_HEADING || line.startsWith(`${CONFIRMATION_HEADING} `)) {
      starts.push(index);
    }
  }
  if (starts.length !== 1) return [];
  const start = starts[0] as number;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^## (?!#)\S/.test(lines[index] ?? '')) {
      end = index;
      break;
    }
  }
  return [lines.slice(start + 1, end).join('\n')];
}

function testPaths(section: string): string[] {
  const paths: string[] = [];
  for (const match of section.matchAll(TEST_FILE_TOKEN)) {
    const path = match[0];
    const testNamed = /(?:^|\/)(?:test|tests)\//.test(path)
      || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)
      || /(?:^|\/)[A-Za-z0-9@._-]+-test\.(?:py|sh)$/.test(path);
    if (testNamed && !paths.includes(path)) paths.push(path);
  }
  return paths;
}

/**
 * Pure Step-8 policy. The caller owns filesystem access and injects a predicate that returns true
 * only for a readable regular file. Throwing is a named refusal, never laundered into a skip.
 */
export function checkConfirmationFiles(
  adrTexts: readonly string[],
  exists: ConfirmationFileExists,
): ConfirmationFileGateResult {
  if (adrTexts.length === 0) return { verdict: 'skipped', reason: 'no-adr' };

  const paths: string[] = [];
  for (let index = 0; index < adrTexts.length; index++) {
    const sections = confirmationSections(adrTexts[index] ?? '');
    if (sections.length !== 1) {
      return { verdict: 'refused', reason: `ADR ${index + 1} has no unique readable Confirmation section` };
    }
    const parsed = testPaths(sections[0] as string);
    if (parsed.length === 0) {
      return { verdict: 'refused', reason: `ADR ${index + 1} Confirmation contains no parseable test path` };
    }
    for (const path of parsed) {
      if (path.includes('*')) {
        return { verdict: 'refused', reason: `cannot inspect ${path}: test path is not literal` };
      }
      if (!paths.includes(path)) paths.push(path);
    }
  }

  const missing: string[] = [];
  for (const path of paths) {
    try {
      if (!exists(path)) missing.push(path);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { verdict: 'refused', reason: `cannot inspect ${path}: ${detail}` };
    }
  }
  return missing.length > 0
    ? { verdict: 'fail', missing }
    : { verdict: 'pass', checked: paths };
}
