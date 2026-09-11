/**
 * Canonical Markdown block masker; copied byte-for-byte as markdown-masker.mjs beside K2.
 * Keep this file valid JavaScript (inferred TS types, no build needed by the copy).
 *
 * CommonMark fences and type-2 HTML comments; same UTF-16 length and newline positions.
 * Inline code cannot open an HTML block. HTML delimiters within a block are consumed left to
 * right, including close/reopen on one line. This is not a complete CommonMark parser.
 *
 * Reader policies are deliberate: amendment-trace restores unclosed blocks; brief/K2 hide them.
 * Four-space code is still unsupported by default. ONLY brief keeps its pre-existing policy.
 * Containers, tab indentation and HTML block types other than comments remain unsupported.
 * Callbacks expose line facts; callers own semantic diagnostics and list-barrier representation.
 */
export function maskMarkdown(md = '', { unclosed = 'restore', indentedCode = false, inlineComments = false, onMasked = (_line = 0) => { }, onDisputed = (_line = 0) => { }, } = {}) {
    const lines = md.split('\n');
    const out = lines.slice();
    const masked = lines.map(() => false);
    let state = 'text';
    let marker = '';
    let markerLength = 0;
    let openedAt = -1;
    let nestedOpener = false;
    let disputed = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const blank = () => { out[i] = ' '.repeat(line.length); masked[i] = true; };
        if (state === 'fence') {
            blank();
            const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
            if (close) {
                const run = close[1] ?? '';
                if (run[0] === marker && run.length >= markerLength) {
                    state = 'text';
                    openedAt = -1;
                }
            }
            continue;
        }
        if (state === 'text') {
            const fence = /^ {0,3}(`{3,}|~{3,})([^\n]*)$/.exec(line);
            if (fence && !(fence[1]?.[0] === '`' && fence[2]?.includes('`'))) {
                const run = fence[1] ?? '';
                state = 'fence';
                marker = run[0] ?? '';
                markerLength = run.length;
                openedAt = i;
                blank();
                continue;
            }
            if (indentedCode && /^ {4,}/.test(line)) {
                blank();
                continue;
            }
        }
        // Outside HTML only a block opener counts: code-spanned delimiters in prose are inert.
        // Inside HTML, backticks are literal and do not protect a delimiter.
        const htmlStart = /^ {0,3}<!--/.test(line);
        const wasDisputed = disputed;
        // Ambiguity is diagnostic state, never permission to scan otherwise-visible prose.
        // Brief deliberately keeps that diagnostic across blocks until the author's outer close;
        // block-only readers must not hide an unrelated arrow or opener because it is pending.
        if (state === 'html' || htmlStart || inlineComments) {
            let maskLine = state === 'html' || htmlStart;
            const tokens = [...line.matchAll(/`+|<!--|-->/g)];
            for (let t = 0; t < tokens.length; t++) {
                const token = tokens[t];
                if (!token)
                    continue;
                if (token[0][0] === '`') {
                    // Code spans require an EXACT matching run; a shorter embedded run is literal.
                    // HTML blocks treat backticks literally. Inline-comment support is brief's existing
                    // policy; other readers only enter this scan at a block opener or while disputed.
                    if (state !== 'html') {
                        const end = tokens.findIndex((next, j) => j > t && next[0] === token[0]);
                        if (end >= 0)
                            t = end;
                    }
                    continue;
                }
                if (token[0] === '<!--') {
                    if (state === 'html')
                        nestedOpener = true;
                    else {
                        state = 'html';
                        openedAt = i;
                    }
                    maskLine = true;
                }
                else if (state === 'html') {
                    state = 'text';
                    openedAt = -1;
                    if (nestedOpener) {
                        disputed = true;
                        nestedOpener = false;
                    }
                }
                else if (disputed) {
                    disputed = false;
                    maskLine = true;
                }
            }
            if (maskLine)
                blank();
        }
        if (wasDisputed || disputed)
            onDisputed(i);
    }
    if (openedAt >= 0 && unclosed === 'restore') {
        for (let i = openedAt; i < lines.length; i++) {
            out[i] = lines[i] ?? '';
            masked[i] = false;
        }
    }
    for (let i = 0; i < masked.length; i++)
        if (masked[i])
            onMasked(i);
    return out.join('\n');
}
//# sourceMappingURL=markdown-masker.js.map