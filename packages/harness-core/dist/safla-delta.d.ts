/**
 * SAFLA Delta-Evaluation for dz lesson ranking (rUv-scout #2).
 *
 * Port of `safla/core/delta_evaluation.py` (grounded via search_ruvnet). SAFLA ranks a thing by the
 * MEASURED CHANGE in its payoff over time — a slope — as a context-adaptive weighted sum of four temporal
 * deltas. dz's lesson store ranks by a LEVEL (uses/recency/reward); this adds the slope.
 *
 * ADR-001 (features/safla-delta-eval): the four-delta STRUCTURE is preserved verbatim so the port is
 * auditable against the source; only the deltas dz can MEASURE (performance, efficiency, stability) are
 * driven by real signals. Capability is structurally 0 for a lesson (a lesson gains no "capabilities") and
 * its weight is RENORMALIZED away — never fabricated. Every function here is total: no input throws.
 */
/** The raw SAFLA evaluation inputs (one snapshot). Fields absent → treated as their neutral default. */
export interface DeltaInput {
    readonly reward?: number;
    readonly tokensUsed?: number;
    readonly throughput?: number;
    readonly resourcesUsed?: number;
    readonly variance?: number;
    readonly capabilities?: number;
}
/** The four per-axis deltas (SAFLA `DeltaMetrics`). */
export interface DeltaMetrics {
    readonly performance: number;
    readonly efficiency: number;
    readonly stability: number;
    readonly capability: number;
}
/** SAFLA `AdaptiveWeights`. */
export interface AdaptiveWeights {
    readonly performance: number;
    readonly efficiency: number;
    readonly stability: number;
    readonly capability: number;
}
/** SAFLA defaults (delta_evaluation.py `AdaptiveWeights`). */
export declare const DEFAULT_WEIGHTS: AdaptiveWeights;
/** `(reward − prev_reward) / max(tokens_used, 1e-8)`. */
export declare function performanceDelta(cur: DeltaInput, prev: DeltaInput): number;
/** `(throughput − prev_throughput) / max(resources_used, 1e-8)`. */
export declare function efficiencyDelta(cur: DeltaInput, prev: DeltaInput): number;
/** `prev_variance − variance` — variance REDUCTION is positive (lower variance is better). */
export declare function stabilityDelta(cur: DeltaInput, prev: DeltaInput): number;
/** `capabilities − prev_capabilities`. Structurally 0 for a dz lesson (ADR-001). */
export declare function capabilityDelta(cur: DeltaInput, prev: DeltaInput): number;
/** SAFLA `AdaptiveWeights.adjust_for_context` — same four re-tilts, else the defaults. */
export declare function adjustForContext(context: string | null | undefined): AdaptiveWeights;
/**
 * Renormalize weights over the axes that carry a real signal (ADR-001, FR-4). `active.capability=false`
 * (the dz default) redistributes the capability weight across the others so the effective weights still
 * sum to 1 — the inert axis is neither fabricated nor silently value-dropped. Degenerate all-inactive →
 * the input is returned unchanged (never divide by 0).
 */
export declare function renormalizeOverActive(w: AdaptiveWeights, active?: Partial<Record<keyof AdaptiveWeights, boolean>>): AdaptiveWeights;
/** SAFLA `total_delta` — the weighted sum (batch_weighted_sum in the source). */
export declare function deltaEvaluate(cur: DeltaInput, prev: DeltaInput, weights?: AdaptiveWeights): number;
/** One reinforce event from `.dz/sessions.jsonl` (`{ts, uses}`), plus the record's current reward. */
export interface ReinforceEvent {
    /** Epoch millis. */
    readonly t: number;
    readonly uses: number;
}
/** A lesson's ranking input: its reinforce history (oldest→newest) + current reward in [0,1]. */
export interface LessonHistory {
    readonly id: string;
    readonly reward: number;
    /** Reinforce events, any order (sorted internally). */
    readonly events: readonly ReinforceEvent[];
}
/** A lesson's delta score + whether it is a prune candidate (FR-5). */
export interface LessonDelta {
    readonly id: string;
    readonly delta: number;
    /** True iff the delta is ≤ 0 over the window AND there was enough history to judge. */
    readonly pruneCandidate: boolean;
    /** False when < 2 events — an UNKNOWN slope scored a neutral 0, not a penalty (FR-3). */
    readonly hasSignal: boolean;
}
/**
 * Score one lesson by SAFLA delta from its reinforce history (FR-1/3/4). Maps dz signals onto the source:
 * efficiency = Δuses/Δdays (raw recall rate); performance = reward·(Δuses/Δdays) (reward-weighted rate,
 * carried via `throughput`); stability = variance reduction across interval rates (needs ≥3 events);
 * capability = 0 (renormalized out). < 2 events → neutral 0 (unknown slope).
 */
export declare function lessonDeltaFromHistory(lesson: LessonHistory, weights?: AdaptiveWeights): LessonDelta;
/** Rank lessons by SAFLA delta, highest slope first. Lessons with no signal (delta 0) sort as neutral. */
export declare function rankLessonsByDelta(lessons: readonly LessonHistory[], weights?: AdaptiveWeights): readonly LessonDelta[];
//# sourceMappingURL=safla-delta.d.ts.map