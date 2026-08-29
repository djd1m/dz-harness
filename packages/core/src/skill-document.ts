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
  constructor(message: string) {
    super(message);
    this.name = 'SkillDocumentError';
  }
}

/**
 * A `SKILL.md` file split into verbatim slices.
 *
 * - {@link SkillDocument.frontmatter} — the file prefix through the closing
 *   `---` fence (BOM and fences included).
 * - {@link SkillDocument.body} — everything after, verbatim.
 * - {@link SkillDocument.frontmatterYaml} — the inner YAML text only, a
 *   substring of `frontmatter`, ready to hand to a YAML parser.
 *
 * `frontmatter + body` always reproduces the original file byte-for-byte.
 */
export interface SkillDocument {
  /** File prefix through the closing fence — BOM + `---` fences included. */
  readonly frontmatter: string;
  /** The YAML text between the fences (no fences). For parsing, not emit. */
  readonly frontmatterYaml: string;
  /** Everything after the closing fence, verbatim. */
  readonly body: string;
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
export function parseSkillDocument(text: string): SkillDocument {
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
export function serializeSkillDocument(doc: SkillDocument): string {
  return doc.frontmatter + doc.body;
}
