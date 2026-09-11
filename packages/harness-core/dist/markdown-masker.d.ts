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
export declare function maskMarkdown(md?: string, { unclosed, indentedCode, inlineComments, onMasked, onDisputed, }?: {
    unclosed?: string | undefined;
    indentedCode?: boolean | undefined;
    inlineComments?: boolean | undefined;
    onMasked?: ((_line?: number) => void) | undefined;
    onDisputed?: ((_line?: number) => void) | undefined;
}): string;
//# sourceMappingURL=markdown-masker.d.ts.map