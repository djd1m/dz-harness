import { maskMarkdown } from './markdown-masker.js';
export const RELEASE_LINE_RE = /`harness-core v(\d+\.\d+\.\d+)` · `harness-cli v(\d+\.\d+\.\d+)`/;
export function findReleaseLine(text) {
    const lines = text.split('\n');
    // A closed leading opt-in is metadata, not an HTML example block. Blank only
    // that exact marker before masking, retaining offsets and all enclosing blocks.
    const maskInput = text.replace(/^ {0,3}<!-- dz:version -->/gm, (marker) => ' '.repeat(marker.length));
    const visible = String(maskMarkdown(maskInput, { unclosed: 'hide' })).split('\n');
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        // A joint pair is structural history until the author opts this physical line in.
        // Masked examples cannot supply current metadata to the writer, report, or guard.
        if (!line.includes('<!-- dz:version -->') || !RELEASE_LINE_RE.test(visible[index]))
            continue;
        const parsed = parseReleaseLine(line);
        if (parsed !== null) {
            return { index, line, core: parsed.tokens[0].version, cli: parsed.tokens[1].version, ...parsed };
        }
    }
    return null;
}
export function rewriteReleaseLine(text, versionsOrCore, cli) {
    const versions = typeof arguments[1] === 'string'
        ? { 'harness-core': versionsOrCore, 'harness-cli': cli }
        : versionsOrCore;
    const found = findReleaseLine(text);
    if (found === null)
        return null;
    let line = found.line;
    // Tokens are ordered by start; work from the right so length changes preserve earlier offsets.
    for (let index = found.tokens.length - 1; index >= 0; index--) {
        const token = found.tokens[index];
        if (!Object.hasOwn(versions, token.name))
            continue;
        const versionStart = token.end - 1 - token.version.length;
        line = line.slice(0, versionStart) + versions[token.name] + line.slice(token.end - 1);
    }
    const lines = text.split('\n');
    lines[found.index] = line;
    return lines.join('\n');
}
export function shortPackageName(name) {
    return name.replace(/^@[^/]+\//, '');
}
/**
 * A generic RELEASE-LINE token: a backtick-quoted `<pkg-short-name> vX` pair, anywhere on a line —
 * the shape `RELEASE_LINE_RE` names for the joint `harness-core`/`harness-cli` pair, generalised to
 * ANY package name (feature publish-readme-stamp-scope, FR-1a) so a per-package README's own status
 * line — `` `harness-core vX` · `harness-cli vY` · `memory vZ` `` and similar — is recognised as a
 * release-line shape whatever packages it names, not only the original two, and however many trail
 * after the first pair (an extra `` · `memory vZ` `` segment needs no bespoke regex of its own).
 */
export const GENERIC_RELEASE_TOKEN_RE = /`[a-z][a-z0-9-]*\s+v\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?`/;
export function parseReleaseLine(line) {
    const joint = RELEASE_LINE_RE.exec(line);
    if (joint === null)
        return null;
    // Keep the original sticky chain boundary: prose ends the release line's permission.
    const chainTail = new RegExp(`(?:\\s*·\\s*${GENERIC_RELEASE_TOKEN_RE.source})*`, 'y');
    chainTail.lastIndex = joint.index + joint[0].length;
    const tail = chainTail.exec(line);
    const chainEnd = joint.index + joint[0].length + (tail?.[0].length ?? 0);
    const tokens = [];
    const chain = line.slice(joint.index, chainEnd);
    for (const match of chain.matchAll(new RegExp(GENERIC_RELEASE_TOKEN_RE.source, 'g'))) {
        const [name, version] = match[0].slice(1, -1).split(/\s+v/);
        const start = joint.index + match.index;
        tokens.push({ name: name, version: version, start, end: start + match[0].length });
    }
    return { tokens, chainEnd, wrapped: /\s*·\s*$/.test(line.slice(chainEnd)) };
}
/** A marked current joint chain grants token permission only through its structural boundary. */
export function isReleaseLineToken(line, start, end) {
    const p = findReleaseLine(line);
    return p !== null && p.tokens[0].start <= start && end <= p.chainEnd;
}
//# sourceMappingURL=release-line.js.map