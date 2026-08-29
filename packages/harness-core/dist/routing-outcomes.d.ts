/**
 * Learned cost-optimal model routing (feature learned-cost-routing, ADR-001) — the `auto-cost` spec.
 *
 * A per-stage model router that learns which model actually SUCCEEDS at a stage (fewest retries = lowest true
 * cost). The SELECTOR is PURE over an injected store snapshot (mirrors the shipped rUv `MetaHarnessRouter`,
 * `open-claude-code/v2/src/optimize/router.mjs`: cheapest model clearing a 0.7 success bar, else a cheapest-
 * first chain for escalate-on-fail — the `cve-bench/.../model-chain.mjs` pattern). The store is a thin JSON
 * layer under `.dz/` (top-level ESM fs; a lazy require() is undefined at runtime — the R1 footgun).
 *
 * Storage is JSON, not SQLite: `better-sqlite3` is not a harness-core dep, `.dz/` already persists JSON state,
 * and the grounded reference is emphatically zero-dependency (ADR-073 "pure-TS path is dependency-free").
 *
 * SAFETY PROPERTIES (ADR-001, load-bearing, each pinned by a test):
 *   1. §3 — `selectAutoCost('qe', …, {family})` ranks ONLY the cross-family of the coder → a model that wrote
 *      code can NEVER self-QE (the named cross-model-QE invariant).
 *   2. §2 — a stage that PRODUCED an artifact but FAILED the downstream gate is recorded as a FAILURE at its
 *      key (`finalizeOutcome(..., false)`), down-ranking that model — success ≠ "returned something".
 *   3. §1 — the same store snapshot yields the same pick (deterministic); no `auto-cost` spec ⇒ nothing here
 *      is touched (byte-identical, opt-in).
 */
export type Family = 'claude' | 'openai';
export interface ModelRung {
    readonly id: string;
    readonly costRank: number;
    readonly family: Family;
}
/**
 * KNOWN model set, cheapest→dearest. `costRank` is a COARSE relative ordering (an estimate from conservative
 * public list prices — the router.mjs precedent, "not fabricated metrics"); only the ORDER is load-bearing.
 * gpt-5.6-ready: adding a rung is a data-only edit. Kept consistent with KNOWN_CODEX / CLAUDE_NAMES in
 * feature-adr-routing.ts.
 */
export declare const COST_LADDER: readonly ModelRung[];
export interface OutcomeStats {
    readonly attempts: number;
    readonly successes: number;
    readonly successRate: number;
}
export type StatsFor = (model: string) => OutcomeStats;
export interface AutoCostOpts {
    readonly ladder?: readonly ModelRung[];
    readonly qualityBar?: number;
    readonly minSamples?: number;
    readonly family?: Family;
}
export interface AutoCostPick {
    readonly model: string;
    readonly chain: readonly string[];
    readonly evidence: string;
    readonly metBar: boolean;
}
/**
 * PURE selection (ADR §1). Strategy (b), bar 0.7: pick the CHEAPEST model that has ≥`minSamples` attempts AND
 * a learned success-rate ≥ bar at this key; if NONE has proven itself, return the cheapest rung (cold-start)
 * with the full cheapest-first `chain` so the caller escalates on real failure (never a pre-emptive jump to a
 * dear model). Deterministic given the snapshot. `family` restricts the ladder (qe cross-family guard).
 */
export declare function selectAutoCost(stage: string, tier: string, statsFor: StatsFor, opts?: AutoCostOpts): AutoCostPick;
/** The next rung after a failed model in the chain (FR-5 escalate-on-fail); null at the top. */
export declare function nextInChain(chain: readonly string[], failedModel: string): string | null;
export interface OutcomeRow {
    attempts: number;
    successes: number;
    provisional?: number;
}
export interface OutcomeStore {
    readonly rows: Record<string, OutcomeRow>;
}
export declare const ROUTING_OUTCOMES_PATH = ".dz/routing-outcomes.json";
/** Load the outcome store; absent/corrupt/unreadable → empty (never throws). */
export declare function loadOutcomes(repoRoot: string): OutcomeStore;
/** Build the injected StatsFor for a (stage, tier) from a loaded snapshot. PURE. */
export declare function statsForKey(store: OutcomeStore, stage: string, tier: string): StatsFor;
/**
 * Record a PROVISIONAL outcome (i): the stage produced a non-empty artifact / did not die. Bumps `provisional`
 * and, for a gate-less stage, this weak signal counts toward attempts+successes (weak-provisional decision).
 * `weakCredit=false` for gated stages — the real (ii) credit lands in finalizeOutcome.
 */
export declare function recordProvisional(repoRoot: string, stage: string, tier: string, model: string, weakCredit?: boolean): void;
/**
 * Finalize the AUTHORITATIVE outcome (ii) from the downstream gate, attributed back to the (stage, model)
 * that produced the artifact. A produced-but-gate-FAILED run records a FAILURE (attempts+1, successes+0) —
 * success is NOT "returned something" (ADR §2, load-bearing).
 */
export declare function finalizeOutcome(repoRoot: string, stage: string, tier: string, model: string, success: boolean): void;
/** Human-readable learned table for `dz routing`. Deterministic (sorted). */
export declare function renderOutcomes(store: OutcomeStore, filterStage?: string): string;
//# sourceMappingURL=routing-outcomes.d.ts.map