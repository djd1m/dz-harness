export const RELEASE_LINE_RE = /`harness-core v(\d+\.\d+\.\d+)` · `harness-cli v(\d+\.\d+\.\d+)`/;
export function findReleaseLine(text) {
    const lines = text.split('\n');
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
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
/**
 * Is the OLD-VERSION occurrence at `[start, end)` in `line` sitting inside a `` `<name> vX` ``
 * backtick token? A POSITIVE override for `planReadmeVersionSync`'s citation heuristic: a token
 * this shape matches is a release-line stamp, never a historical citation, even where it sits next
 * to punctuation ("/", "on ") the citation heuristic would otherwise read as a citation cue.
 */
export function isReleaseLineToken(line, start, end) {
    // Codex r2 HIGH (lead): a `` `<name> vX` `` token is a release-line stamp ONLY on a line that carries
    // the JOINT release-line shape (`RELEASE_LINE_RE`); an isolated `` `memory v0.8.25` `` in a
    // historical sentence is history and must not move.
    // Codex r3 HIGH (lead): the permission is the joint pair PLUS the CONTIGUOUS ` · `<name> vX``
    // chain that follows it — not the whole line. `` `harness-core vX` · `harness-cli vY` — historically
    // `memory vZ` `` moves the first two and keeps the third (prose broke the chain).
    const p = parseReleaseLine(line);
    return p !== null && p.tokens[0].start <= start && end <= p.chainEnd;
}
//# sourceMappingURL=release-line.js.map