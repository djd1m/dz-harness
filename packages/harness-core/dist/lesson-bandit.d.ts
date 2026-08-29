/**
 * VENDORED — contextual Thompson-Sampling bandit (feature lesson-bandit-rerank, ADR-001 D-1).
 *
 * Upstream: agentdb@3.0.0-alpha.20 — dist/src/backends/rvf/SolverBandit.js
 * Licence:  MIT, Copyright (c) 2024-2025 ruv
 * Vendored: 2026-08-26. 215 lines, ZERO imports (both re-verified at copy time:
 *           `wc -l` → 215, `grep -cE 'require|^import'` → 0).
 * SHA-256:  0199299fb60ef67afa030182185894c950126038398032349fe3618d910f6d7d
 *           (of the upstream .js at copy time; pinned by lesson-bandit-vendor.test.ts)
 * Reason:   the path is NOT in agentdb's package.json "exports" map (verified 2026-08-26);
 *           a deep import of a private path in a 3.0.0-alpha prerelease can change silently,
 *           and a ranking feature that quietly stops ranking looks exactly like one that works.
 *
 * Do not edit logic. Re-vendor from upstream and re-diff instead.
 *
 * WHAT CHANGED relative to the upstream .js, and nothing else:
 *   · `class SolverBandit` → `class LessonBandit` (ADR-001 D-1: one name, no alias);
 *   · TYPES added (field declarations, method signatures, the three exported interfaces);
 *   · `armKeys[0]` → `armKeys[0]!` and `ctx.get(armKey)` → `!` — required by this package's
 *     `noUncheckedIndexedAccess`; the emitted arithmetic is unchanged.
 * The Jöhnk / Marsaglia-Tsang samplers, the `a<=1 && b<=1 ⇒ Math.random()` short-circuit, the
 * exploration bonus and the cost EMA are preserved verbatim — the MEASURED API behaviour (200
 * pulls on a 0.85-vs-0.15 pair → 100/100 correct picks) is a property of exactly this arithmetic.
 *
 * THIS FILE MUST STAY IMPORT-FREE (NFR-2 / C-7 / INV-6) — asserted by a repo test.
 */
/** Beta posterior + bookkeeping for one `(ContextKey, ArmKey)` pair. */
export interface ArmStats {
    alpha: number;
    beta: number;
    pulls: number;
    totalReward: number;
    costEma: number;
}
/** Engine hyperparameters. This feature passes the vendored defaults through untouched. */
export interface BanditConfig {
    costWeight: number;
    costDecay: number;
    explorationBonus: number;
}
/** The engine's own JSON-safe state. `version` belongs to the vendored copy, never to our envelope. */
export interface SerializedBanditState {
    version: number;
    config: BanditConfig;
    contexts: Record<string, Record<string, ArmStats>>;
}
/** Aggregate counters over every context. */
export interface BanditAggregateStats {
    contexts: number;
    totalArms: number;
    totalPulls: number;
    totalReward: number;
}
/**
 * Thompson Sampling bandit with contextual arms.
 *
 * Usage:
 *   const bandit = new LessonBandit();
 *   const arm = bandit.selectArm('code_review', ['skill-a', 'skill-b', 'skill-c']);
 *   // ... execute the selected arm ...
 *   bandit.recordReward('code_review', arm, 0.85);
 */
export declare class LessonBandit {
    private contexts;
    private readonly config;
    constructor(config?: Partial<BanditConfig>);
    /**
     * Select the best arm for a given context using Thompson Sampling.
     *
     * For each candidate arm, samples from its Beta(alpha, beta) distribution
     * and subtracts a cost penalty. Returns the arm with the highest score.
     * Unknown arms get an exploration bonus.
     */
    selectArm(contextKey: string, armKeys: readonly string[]): string;
    /**
     * Record the outcome of pulling an arm.
     *
     * @param contextKey - The context bucket (e.g., task type)
     * @param armKey - The arm that was pulled (e.g., skill name)
     * @param reward - Success signal in [0, 1]
     * @param cost - Optional cost signal (latency, tokens, etc.)
     */
    recordReward(contextKey: string, armKey: string, reward: number, cost?: number): void;
    /**
     * Rerank a list of candidates using bandit scores.
     * Returns indices sorted by Thompson-sampled score (best first).
     */
    rerank(contextKey: string, armKeys: readonly string[]): string[];
    /** Get arm stats for a specific context */
    getArmStats(contextKey: string, armKey: string): ArmStats | null;
    /** Get aggregate statistics */
    getStats(): BanditAggregateStats;
    /** Serialize to JSON-safe state */
    serialize(): SerializedBanditState;
    /**
     * Restore from serialized state.
     *
     * STATIC (C-2). A first draft that called it as an instance method threw `TypeError`; the
     * signature here makes the static call the only one that compiles.
     */
    static deserialize(state: SerializedBanditState): LessonBandit;
    /** Reset all learned state */
    reset(): void;
    /**
     * Sample from Beta(a, b) using the Jöhnk algorithm.
     * Fast approximation for typical bandit parameters.
     */
    private sampleBeta;
    /**
     * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
     */
    private sampleGamma;
    /** Box-Muller normal sample */
    private sampleNormal;
}
//# sourceMappingURL=lesson-bandit.d.ts.map