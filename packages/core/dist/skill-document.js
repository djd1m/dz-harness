/**
 * `SKILL.md` document model — the lossless text envelope.
 *
 * A `SKILL.md` file is a YAML frontmatter block fenced by `---` lines, followed
 * by a Markdown body. Parsing YAML to an object and re-emitting it can **never**
 * be byte-identical (key order, quote style, `>`/`|` scalar folding, indentation
 * and comments are all lost). So this module never re-serialises: it splits the
 * file into verbatim slices whose concatenation reproduces the original exactly.
 *
 * Invariant: `parseSkillDocument(t).frontmatter + parseSkillDocument(t).body === t`
 * for every `t` that parses, and therefore
 * `serializeSkillDocument(parseSkillDocument(t)) === t`.
 *
 * @packageDocumentation
 */
/** Thrown when a string is not a structurally valid `SKILL.md` document. */
export class SkillDocumentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'SkillDocumentError';
    }
}
/** Opening fence: `---` at file start, optional trailing spaces, then EOL. */
const OPENING_FENCE = /^---[ \t]*\r?\n/;
/** Closing fence: `---` at a line start, optional trailing spaces, EOL or EOF. */
const CLOSING_FENCE = /^---[ \t]*\r?(?:\n|$)/m;
/**
 * Split a `SKILL.md` file's text into its verbatim {@link SkillDocument} slices.
 *
 * @throws {@link SkillDocumentError} if the text has no opening fence or the
 * frontmatter fence is never closed.
 */
export function parseSkillDocument(text) {
    const hasBom = text.charCodeAt(0) === 0xfeff;
    const bomLength = hasBom ? 1 : 0;
    const afterBom = hasBom ? text.slice(1) : text;
    const opening = OPENING_FENCE.exec(afterBom);
    if (opening === null) {
        throw new SkillDocumentError('SKILL.md must begin with a "---" frontmatter fence');
    }
    const yamlStart = opening[0].length;
    const tail = afterBom.slice(yamlStart);
    const closing = CLOSING_FENCE.exec(tail);
    if (closing === null) {
        throw new SkillDocumentError('SKILL.md frontmatter fence is never closed');
    }
    const closingStart = yamlStart + closing.index;
    const closingEnd = closingStart + closing[0].length;
    const splitAt = bomLength + closingEnd;
    return {
        frontmatter: text.slice(0, splitAt),
        frontmatterYaml: afterBom.slice(yamlStart, closingStart),
        body: text.slice(splitAt),
    };
}
/**
 * Reassemble a {@link SkillDocument} into file text. The inverse of
 * {@link parseSkillDocument}: `serialize(parse(t)) === t`.
 */
export function serializeSkillDocument(doc) {
    return doc.frontmatter + doc.body;
}
//# sourceMappingURL=skill-document.js.map