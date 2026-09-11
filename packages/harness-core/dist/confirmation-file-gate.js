const CONFIRMATION_HEADING = '## Confirmation';
const TEST_FILE_TOKEN = /[A-Za-z0-9@._*-]+(?:\/[A-Za-z0-9@._*-]+)+\.(?:[cm]?[jt]sx?|py|sh)/g;
function confirmationSections(text) {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const starts = [];
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index] ?? '';
        if (line === CONFIRMATION_HEADING || line.startsWith(`${CONFIRMATION_HEADING} `)) {
            starts.push(index);
        }
    }
    if (starts.length !== 1)
        return [];
    const start = starts[0];
    let end = lines.length;
    for (let index = start + 1; index < lines.length; index++) {
        if (/^## (?!#)\S/.test(lines[index] ?? '')) {
            end = index;
            break;
        }
    }
    return [lines.slice(start + 1, end).join('\n')];
}
function testPaths(section) {
    const paths = [];
    for (const match of section.matchAll(TEST_FILE_TOKEN)) {
        const path = match[0];
        const testNamed = /(?:^|\/)(?:test|tests)\//.test(path)
            || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)
            || /(?:^|\/)[A-Za-z0-9@._-]+-test\.(?:py|sh)$/.test(path);
        if (testNamed && !paths.includes(path))
            paths.push(path);
    }
    return paths;
}
/**
 * Pure Step-8 policy. The caller owns filesystem access and injects a predicate that returns true
 * only for a readable regular file. Throwing is a named refusal, never laundered into a skip.
 */
export function checkConfirmationFiles(adrTexts, exists) {
    if (adrTexts.length === 0)
        return { verdict: 'skipped', reason: 'no-adr' };
    const paths = [];
    for (let index = 0; index < adrTexts.length; index++) {
        const sections = confirmationSections(adrTexts[index] ?? '');
        if (sections.length !== 1) {
            return { verdict: 'refused', reason: `ADR ${index + 1} has no unique readable Confirmation section` };
        }
        const parsed = testPaths(sections[0]);
        if (parsed.length === 0) {
            return { verdict: 'refused', reason: `ADR ${index + 1} Confirmation contains no parseable test path` };
        }
        for (const path of parsed) {
            if (path.includes('*')) {
                return { verdict: 'refused', reason: `cannot inspect ${path}: test path is not literal` };
            }
            if (!paths.includes(path))
                paths.push(path);
        }
    }
    const missing = [];
    for (const path of paths) {
        try {
            if (!exists(path))
                missing.push(path);
        }
        catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            return { verdict: 'refused', reason: `cannot inspect ${path}: ${detail}` };
        }
    }
    return missing.length > 0
        ? { verdict: 'fail', missing }
        : { verdict: 'pass', checked: paths };
}
//# sourceMappingURL=confirmation-file-gate.js.map