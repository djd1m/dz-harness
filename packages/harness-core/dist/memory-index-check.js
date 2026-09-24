import { Buffer } from 'node:buffer';
export const MEMORY_INDEX_MAX_BYTES = 24_000;
export const MEMORY_INDEX_MAX_LINE_CHARS = 200;
// Hook support is a lexical heuristic, not proof that a hook's meaning is preserved.
// Calibration history on the real index (108 judged lines): 2026-09-23 the coder measured a live
// minimum of 0 at L83/L85/L114 and 15 lines under 0.5 — 14 were Russian hooks over English files
// or other word forms (knowledge present), one (L76) linked the WRONG file. The lead rewrote those
// hooks with words from their files; 2026-09-24 the live minimum is 0.5 exactly (5 lines at the
// boundary, QE F2). The threshold stays the contract's 0.5; a hook at the boundary passes
// (`support < min` fails), so the margin there is thin by construction.
export const MEMORY_INDEX_MIN_HOOK_SUPPORT = 0.5;
/** Pure check: callers supply the index and sibling Markdown files (excluding MEMORY.md). */
export function checkMemoryIndex(input) {
    const { indexText, files, limits } = input;
    const maxBytes = limits?.maxBytes ?? MEMORY_INDEX_MAX_BYTES;
    const maxLineChars = limits?.maxLineChars ?? MEMORY_INDEX_MAX_LINE_CHARS;
    const minHookSupport = limits?.minHookSupport ?? MEMORY_INDEX_MIN_HOOK_SUPPORT;
    const bytes = Buffer.byteLength(indexText, 'utf8');
    const findings = [];
    if (bytes > maxBytes) {
        findings.push({ kind: 'over-size', detail: `${bytes} bytes exceeds maximum ${maxBytes}` });
    }
    // Count physical lines; a final newline terminates a line, rather than adding one.
    const lines = indexText === '' ? [] : indexText.split(/\r?\n/u);
    if (lines.at(-1) === '')
        lines.pop();
    const indexed = new Map();
    for (const [offset, text] of lines.entries()) {
        const line = offset + 1;
        // String length measures UTF-16 code units, not bytes or Unicode code points.
        if (text.length > maxLineChars) {
            findings.push({ kind: 'long-line', line, detail: `${text.length} UTF-16 code units exceeds maximum ${maxLineChars}` });
        }
        const match = /^- \[(.*?)\]\((.*?)\)\s*—\s*(.*)$/u.exec(text);
        if (match === null)
            continue;
        const file = match[2];
        const previous = indexed.get(file);
        if (previous !== undefined) {
            findings.push({ kind: 'duplicate-link', line, file, detail: `already linked on line ${previous}` });
        }
        else {
            indexed.set(file, line);
        }
        const content = files.get(file);
        if (content === undefined) {
            findings.push({ kind: 'broken-link', line, file, detail: 'linked file is absent' });
            continue;
        }
        const tokens = (match[3].split(';', 1)[0].match(/[\p{L}\p{N}]{4,}/gu) ?? []).map(token => token.toLowerCase());
        // Fewer than three tokens are too short for this heuristic to judge.
        if (tokens.length < 3)
            continue;
        const lowerContent = content.toLowerCase();
        const missing = tokens.filter(token => !lowerContent.includes(token));
        const supported = tokens.length - missing.length;
        const support = supported / tokens.length;
        if (support < minHookSupport) {
            findings.push({
                kind: 'unsupported-hook', line, file,
                detail: `hook support ${support} (${supported}/${tokens.length}) below minimum ${minHookSupport}; missing tokens: ${missing.join(', ')}`,
            });
        }
    }
    for (const file of [...files.keys()].sort()) {
        if (!indexed.has(file))
            findings.push({ kind: 'unindexed-file', file, detail: 'file has no index entry' });
    }
    // Whole-index findings precede line findings; ties use kind, then file order.
    findings.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)
        || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0)
        || ((a.file ?? '') < (b.file ?? '') ? -1 : (a.file ?? '') > (b.file ?? '') ? 1 : 0));
    return { bytes, lines: lines.length, findings };
}
//# sourceMappingURL=memory-index-check.js.map