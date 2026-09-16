export const RELEASE_LINE_RE = /`harness-core v(\d+\.\d+\.\d+)` · `harness-cli v(\d+\.\d+\.\d+)`/;

export interface ReleaseLineMatch {
  readonly index: number;
  readonly line: string;
  readonly core: string;
  readonly cli: string;
}

export function findReleaseLine(text: string): ReleaseLineMatch | null {
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const match = RELEASE_LINE_RE.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      return { index, line, core: match[1], cli: match[2] };
    }
  }
  return null;
}

export function rewriteReleaseLine(text: string, core: string, cli: string): string | null {
  const found = findReleaseLine(text);
  if (found === null) return null;
  const lines = text.split('\n');
  lines[found.index] = found.line.replace(
    RELEASE_LINE_RE,
    `\`harness-core v${core}\` · \`harness-cli v${cli}\``,
  );
  return lines.join('\n');
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

/**
 * Is the OLD-VERSION occurrence at `[start, end)` in `line` sitting inside a `` `<name> vX` ``
 * backtick token? A POSITIVE override for `planReadmeVersionSync`'s citation heuristic: a token
 * this shape matches is a release-line stamp, never a historical citation, even where it sits next
 * to punctuation ("/", "on ") the citation heuristic would otherwise read as a citation cue.
 */
export function isReleaseLineToken(line: string, start: number, end: number): boolean {
  // Codex r2 HIGH (lead): a `` `<name> vX` `` token is a release-line stamp ONLY on a line that carries
  // the JOINT release-line shape (`RELEASE_LINE_RE`); an isolated `` `memory v0.8.25` `` in a
  // historical sentence is history and must not move.
  // Codex r3 HIGH (lead): the permission is the joint pair PLUS the CONTIGUOUS ` · `<name> vX``
  // chain that follows it — not the whole line. `` `harness-core vX` · `harness-cli vY` — historically
  // `memory vZ` `` moves the first two and keeps the third (prose broke the chain).
  const joint = RELEASE_LINE_RE.exec(line);
  if (joint === null) return false;
  const chainTail = new RegExp(`(?:\\s*·\\s*${GENERIC_RELEASE_TOKEN_RE.source})*`, 'y');
  chainTail.lastIndex = joint.index + joint[0].length;
  const tail = chainTail.exec(line);
  const chainEnd = joint.index + joint[0].length + (tail?.[0].length ?? 0);
  return joint.index <= start && end <= chainEnd;
}
