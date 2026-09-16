export declare const RELEASE_LINE_RE: RegExp;
export interface ReleaseLineMatch {
    readonly index: number;
    readonly line: string;
    readonly core: string;
    readonly cli: string;
}
export declare function findReleaseLine(text: string): ReleaseLineMatch | null;
export declare function rewriteReleaseLine(text: string, core: string, cli: string): string | null;
/**
 * A generic RELEASE-LINE token: a backtick-quoted `<pkg-short-name> vX` pair, anywhere on a line —
 * the shape `RELEASE_LINE_RE` names for the joint `harness-core`/`harness-cli` pair, generalised to
 * ANY package name (feature publish-readme-stamp-scope, FR-1a) so a per-package README's own status
 * line — `` `harness-core vX` · `harness-cli vY` · `memory vZ` `` and similar — is recognised as a
 * release-line shape whatever packages it names, not only the original two, and however many trail
 * after the first pair (an extra `` · `memory vZ` `` segment needs no bespoke regex of its own).
 */
export declare const GENERIC_RELEASE_TOKEN_RE: RegExp;
/**
 * Is the OLD-VERSION occurrence at `[start, end)` in `line` sitting inside a `` `<name> vX` ``
 * backtick token? A POSITIVE override for `planReadmeVersionSync`'s citation heuristic: a token
 * this shape matches is a release-line stamp, never a historical citation, even where it sits next
 * to punctuation ("/", "on ") the citation heuristic would otherwise read as a citation cue.
 */
export declare function isReleaseLineToken(line: string, start: number, end: number): boolean;
//# sourceMappingURL=release-line.d.ts.map