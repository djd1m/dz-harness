/**
 * model-recommender (backlog a9c3dd5c, function 3) — the PURE half of `dz routing recommend`.
 *
 * NOT a fifth analyzer (ADR-001 D1): this module HARVESTS per-stage (model → success) samples out of
 * the harness's own workflow records (and imported run-meta sidecars) and hands them to the EXISTING
 * `selectAutoCost` brain in routing-outcomes.ts — the same brain the `auto-cost` plan spec reads. The
 * store that brain trusts (`.dz/routing-outcomes.json`) had never been fed before this feature.
 *
 * Honesty rules, load-bearing:
 *  - The ONLY grade a record carries is RUN-level. Attributing it to every stage's model is an
 *    INFERENCE, and the printed basis states the rule rather than implying it (ADR-001 D2).
 *  - Cross-family QE is UNREPRESENTABLE, not filtered: the qe pick is computed with the family
 *    parameter forced to the cross of the code pick's family (ADR-001 D3).
 *  - `--apply` idempotency lives here as a pure plan (`planFeed`): double-feeding the same runs
 *    would manufacture confidence the data does not contain (ADR-001 D4).
 *
 * No fs, no clock, no randomness — the CLI reads records and does the I/O.
 */
import { type AutoCostPick, type Family } from './routing-outcomes.js';
/** success ⇔ grade ≥ this floor. DATA, exported, and printed in every basis (FR-4). */
export declare const GRADE_SUCCESS_FLOOR = "B";
export declare function gradeIsSuccess(grade: string): boolean;
export interface HarvestSample {
    readonly runId: string;
    readonly ts: string | null;
    readonly tier: string;
    readonly stage: string;
    /** Normalized to a COST_LADDER rung id (e.g. `codex:gpt-5.5:xhigh (usage-switched)` → `gpt-5.5`). */
    readonly model: string;
    readonly success: boolean;
    readonly grade: string;
}
export interface Harvest {
    readonly samples: HarvestSample[];
    readonly runsUsed: number;
    readonly window: {
        min: string;
        max: string;
    } | null;
    /** Records that contributed nothing, by WHY — printed in the basis, never silent (FR-7). */
    readonly skipped: {
        noResult: number;
        noModels: number;
        noGrade: number;
        unknownModel: number;
    };
    /** The attribution rule, stated for the reader of every recommendation. */
    readonly rule: string;
}
/** `codex:gpt-5.5:xhigh (usage-switched)` → `gpt-5.5`; claude ids pass through; unknown → null. */
export declare function normalizeModelId(raw: unknown): string | null;
/** Harvest per-stage samples from already-read records (live harness records AND the `runMeta.records`
 * of imported run-meta sidecars — they are the same shape by construction). */
export declare function harvestStageOutcomes(records: readonly unknown[]): Harvest;
export interface StageRecommendation {
    readonly stage: string;
    /** The spec string for `args.models` — claude rung ids pass through; openai rungs render as `codex:<id>:high`. */
    readonly spec: string;
    readonly pick: AutoCostPick;
    readonly family: Family;
    readonly samples: number;
    /** `selectAutoCost` met its quality bar on ≥minSamples — otherwise this is cold-start, SAID. */
    readonly insufficientData: boolean;
}
export interface Recommendation {
    readonly perStage: StageRecommendation[];
    readonly basis: {
        readonly runsUsed: number;
        readonly window: Harvest['window'];
        readonly rule: string;
        readonly skipped: Harvest['skipped'];
        readonly crossFamilyNote: string;
        readonly unfed: {
            readonly count: number;
            readonly runIds: string[];
        };
        readonly freshness: 'current' | 'stale' | 'unfed';
    };
}
/** Recommend per stage over the harvested samples (optionally one tier's slice). */
export declare function recommendModels(harvest: Harvest, opts?: {
    tier?: string;
    qualityBar?: number;
    minSamples?: number;
    alreadyFed?: readonly string[];
}): Recommendation;
export interface FeedPlan {
    /** Samples whose runId has not been fed before — the CLI calls finalizeOutcome for each. */
    readonly toFeed: HarvestSample[];
    readonly skippedRuns: string[];
    /** The new fed-set the CLI persists after feeding. */
    readonly fedAfter: string[];
}
/** One shared definition of the telemetry/store gap, used by recommendation, apply and guard. */
export declare function unfedRuns(samples: readonly HarvestSample[], alreadyFed: readonly string[]): string[];
/** A run feeds ONCE. Double-feeding the same telemetry manufactures confidence the data does not
 * contain — the second `--apply` must feed 0 and say which runs it skipped. */
export declare function planFeed(samples: readonly HarvestSample[], alreadyFed: readonly string[]): FeedPlan;
//# sourceMappingURL=model-recommender.d.ts.map