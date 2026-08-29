/**
 * Hold-out validated skill optimization (feature bto-optimize-holdout, ADR-001).
 *
 * Strengthens the EXISTING `/bto-optimize` skill from within with dspy-MIPROv2 rigor (grounded in the shipped
 * `dspy.ts/src/optimize/miprov2.ts`: propose → minibatch-tune → validate on held-out → best). The current BTO
 * loop selects the highest score on the SAME eval it tuned on — which games the LLM judge panel (Goodhart).
 * This engine adds what it lacks: a deterministic tune/holdout split, a hard budget cap, a weakest-dimension
 * objective, and a **no-regress-on-HOLD-OUT** winner selector. All functions are PURE over injected judge
 * scores + text (no LLM, no clock, no random); candidate-prose generation and judging stay skill-side.
 *
 * SAFETY PROPERTIES (ADR-001, load-bearing, each pinned by a test):
 *   1. §2 — `selectWinner` accepts a candidate ONLY on the HOLD-OUT scores (weakest dim improves + no other
 *      dim / the aggregate regresses beyond `tolerance`). A candidate that wins on `tune` but regresses on
 *      `holdout` is REJECTED — this defeats judge-gaming. `tune` never decides acceptance.
 *   2. §? — `budgetPlan` NEVER returns a plan exceeding `maxJudgeRuns`: it shrinks candidates/rounds to fit
 *      and reports what it trimmed, so the loop can never run a surprise-cost number of judge passes.
 *   3. §3 — the engine NEVER writes a file (only renders a diff + returns a decision); `proseScopeOk` rejects
 *      a candidate that touches frontmatter or structural headings (augment-not-clobber).
 */
export type BtoDimension = 'METHODOLOGY' | 'DEPTH' | 'CORRECTNESS' | 'USABILITY' | 'ROBUSTNESS';
export declare const BTO_DIMENSIONS: readonly BtoDimension[];
export type DimScores = Record<BtoDimension, number>;
export interface ScenarioSplit {
    readonly tune: readonly string[];
    readonly holdout: readonly string[];
}
/**
 * Partition scenario ids into tune/holdout DETERMINISTICALLY (no clock/random): sort by id, then interleave —
 * every k-th id (k = round(1/holdoutRatio)) goes to holdout. Guarantees ≥1 on each side when ≥2 ids exist.
 * Same input → byte-identical split.
 */
export declare function splitScenarios(ids: readonly string[], holdoutRatio?: number): ScenarioSplit;
export interface BudgetInput {
    readonly candidates: number;
    readonly rounds: number;
    readonly tuneCount: number;
    readonly holdoutCount: number;
}
export interface BudgetPlan {
    readonly candidates: number;
    readonly rounds: number;
    readonly tuneRuns: number;
    readonly holdoutRuns: number;
    readonly totalRuns: number;
    readonly cap: number;
    readonly withinCap: boolean;
    readonly trimmed?: string;
}
/** Documented default cap (configurable — NOT a magic constant): a single L2 judge pass per scenario per
 *  candidate is the unit; 24 keeps a 5-candidate × ~4-scenario tune + holdout validation comfortably bounded. */
export declare const DEFAULT_MAX_JUDGE_RUNS = 24;
/**
 * Judge-run accounting: tune scoring = candidates × rounds × tuneCount; holdout validation = 1 (top-1) ×
 * holdoutCount. If the total exceeds `maxJudgeRuns`, SHRINK — first `rounds` to 1, then `candidates` — until it
 * fits, and report what was trimmed. Never returns an over-cap plan (safety property 2).
 */
export declare function budgetPlan(input: BudgetInput, maxJudgeRuns?: number): BudgetPlan;
/** Every one of the 5 BTO dimensions must be a valid score for a DimScores to be usable. */
export declare function validDimScores(s: unknown): s is DimScores;
export declare function aggregate(s: DimScores): number;
/** The lowest-scoring dimension (the bottleneck to lift). Deterministic tie-break by BTO_DIMENSIONS order. */
export declare function weakestDimension(s: DimScores): BtoDimension;
export interface Candidate {
    readonly id: string;
    readonly prose: string;
    readonly tune: DimScores;
    readonly holdout: DimScores;
}
export interface WinnerResult {
    readonly winner: string | null;
    readonly reason: string;
    readonly weakest: BtoDimension;
    readonly deltas?: Record<string, number>;
}
/**
 * Accept a candidate ONLY on the HOLD-OUT scores (ADR §2): the baseline's weakest dimension must improve by > 0
 * AND no other dimension AND the aggregate may regress by more than `tolerance` (default 0 = strict). Candidates
 * are considered in descending TUNE-aggregate order (the minibatch rank — dspy's search), but acceptance reads
 * only holdout, so a tune-winner that regresses on holdout is rejected. Deterministic; returns the first
 * candidate that passes, or null with a reason.
 */
export declare function selectWinner(baseline: {
    readonly holdout: DimScores;
}, candidates: readonly Candidate[], opts?: {
    tolerance?: number;
}): WinnerResult;
/** Only directive PROSE may change (Phase-1): frontmatter + the set of ALL markdown structural markers must be
 *  identical. A candidate that alters them (incl. CRLF, tab-ATX, empty-ATX, setext) is rejected (augment-not-clobber). */
export declare function proseScopeOk(original: string, candidate: string): {
    ok: boolean;
    reason: string;
};
/** A minimal deterministic unified-ish line diff for the confirm gate (pure). */
export declare function renderProseDiff(original: string, candidate: string): string;
/** Read a scenario-id list: JSON array, or newline/comma-separated. Absent/unreadable → []. */
export declare function readScenarioIds(path: string): string[];
//# sourceMappingURL=bto-optimize.d.ts.map