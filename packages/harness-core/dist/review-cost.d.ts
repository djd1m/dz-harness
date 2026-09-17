/**
 * review-cost-ledger T1/FR-1/A1 (ADR-001 п.1): a pure parser for the qe-bridge reviewer's own cost
 * receipt — the last non-empty line of the Claude CLI's raw stdout, which (for every observed
 * signoff) is a JSON object carrying `total_cost_usd`, `usage.*`, `duration_ms`, `num_turns`.
 *
 * Deliberately narrow and honest: absence of a price is never silently read as a price of zero.
 * `status:'absent'` (no non-empty line at all) and `status:'unparseable'` (a line that IS present
 * but does not parse into a usable cost) are each their own outcome — never collapsed into `ok`, and
 * never guessed. This module owns no filesystem access (NFR-2): the caller (the cli) reads the
 * stdout sidecar file and hands its TEXT in here.
 */
/** The four cost-bearing token components, plus their sum. `tokensPartial` is present (`true`) only
 *  when at least one component was missing/unusable in the source JSON and was substituted with 0 —
 *  never silently blended with a genuine zero. */
export interface QeBridgeCostTokens {
    readonly input: number;
    readonly output: number;
    readonly cacheCreation: number;
    readonly cacheRead: number;
    readonly total: number;
    readonly tokensPartial?: true;
}
/**
 * `ok` — a usable price was found. `absent` — no non-empty line to read at all (an empty/whitespace
 * stdout, or a caller who never had one to offer); `reason` is OPTIONAL here because the parser
 * itself never has anything more specific to say about a literal absence, but a CALLER (the cli's
 * `readQeBridgeCostSidecar`, T3) may attach its own known reason to a synthesized `absent` (e.g. "no
 * qe-bridge signoff for this round") without inventing a THIRD status for that case. `unparseable` —
 * a non-empty last line existed but did not yield a valid cost (not JSON, not an object, no numeric
 * `total_cost_usd`, or a negative/NaN one) — `reason` is mandatory here, naming what failed.
 */
export type QeBridgeCost = {
    readonly status: 'ok';
    readonly costUsd: number;
    readonly tokens: QeBridgeCostTokens;
    readonly durationMs: number | null;
    readonly numTurns: number | null;
} | {
    readonly status: 'absent';
    readonly reason?: string;
} | {
    readonly status: 'unparseable';
    readonly reason: string;
};
/**
 * `text` is the full raw stdout of a qe-bridge reviewer invocation (Claude CLI, `--output-format
 * json`-shaped result line). The COST line is always the LAST non-empty line — Claude CLI streams
 * intermediate events first and finishes with one `type:"result"` object carrying the run's totals.
 */
export declare function parseQeBridgeStdoutCost(text: string): QeBridgeCost;
//# sourceMappingURL=review-cost.d.ts.map