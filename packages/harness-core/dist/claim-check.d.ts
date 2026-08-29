/** A single untagged/overstated-claim finding. The pure engine sees only text — no `file` field. */
export interface ClaimFinding {
    readonly severity: 'high' | 'medium';
    readonly line: number;
    readonly excerpt: string;
    readonly reason: string;
    readonly suggestion: string;
}
/** Result of a claim-check pass over one block of text. */
export interface ClaimCheckResult {
    readonly ok: boolean;
    readonly findings: ClaimFinding[];
}
/**
 * Is the 1-based `line` inside a fenced code block within `text`?
 *
 * OWNED HERE, re-exported by `claim-check-hook-policy.ts`. The engine skips fenced lines; the hook
 * exempts them from its deny path. Two implementations of "inside a fence" would drift; one cannot.
 *
 * CommonMark allows BOTH ``` and ~~~ fences, and a fence closes only on its OWN marker — a ``` inside
 * a ~~~ block is literal content, not a toggle. A naive toggle counter that accepts either marker
 * mis-tracks nesting, so track the open marker instead. Never throws.
 */
export declare function isFenced(text: string, line: number): boolean;
/**
 * Lint a block of text for untagged or overstated accuracy claims.
 * Pure and never-throws: a non-string or empty input returns `{ ok: true, findings: [] }`.
 */
export declare function claimCheck(text: string): ClaimCheckResult;
/** Convenience: a one-line human summary for CLI output. */
export declare function summarize(result: ClaimCheckResult): string;
export type FailOn = 'high' | 'medium' | 'none';
export interface ClaimTextDecision {
    readonly kind: 'error' | 'run';
    readonly reason?: string;
}
/** Empty / whitespace-only / non-string ⇒ error. A real paragraph ⇒ run. */
export declare function decideClaimCheckText(text: unknown): ClaimTextDecision;
/** Severity counts, so a caller can gate without re-walking the findings. */
export declare function severityCounts(result: ClaimCheckResult): {
    high: number;
    medium: number;
};
/**
 * Whether a run RESULT trips the caller's threshold. Reporting only — never throws, never converts the
 * fail-closed empty case (which is handled earlier by `decideClaimCheckText`) into a pass.
 *   'high'   ⇒ gated iff any high finding
 *   'medium' ⇒ gated iff any high OR medium finding
 *   'none'   ⇒ never gated
 */
export declare function isGated(result: ClaimCheckResult, failOn: FailOn): boolean;
//# sourceMappingURL=claim-check.d.ts.map