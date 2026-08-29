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

/** Numeric guard from the source (`max(·, 1e-8)`). */
const EPS = 1e-8;

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
export const DEFAULT_WEIGHTS: AdaptiveWeights = {
  performance: 0.4,
  efficiency: 0.3,
  stability: 0.2,
  capability: 0.1,
};

const n = (x: number | undefined, d = 0): number => (typeof x === 'number' && isFinite(x) ? x : d);

// ── The four deltas, faithful to safla/core/delta_evaluation.py ──────────────

/** `(reward − prev_reward) / max(tokens_used, 1e-8)`. */
export function performanceDelta(cur: DeltaInput, prev: DeltaInput): number {
  return (n(cur.reward) - n(prev.reward)) / Math.max(n(cur.tokensUsed, 1), EPS);
}
/** `(throughput − prev_throughput) / max(resources_used, 1e-8)`. */
export function efficiencyDelta(cur: DeltaInput, prev: DeltaInput): number {
  return (n(cur.throughput) - n(prev.throughput)) / Math.max(n(cur.resourcesUsed, 1), EPS);
}
/** `prev_variance − variance` — variance REDUCTION is positive (lower variance is better). */
export function stabilityDelta(cur: DeltaInput, prev: DeltaInput): number {
  return n(prev.variance) - n(cur.variance);
}
/** `capabilities − prev_capabilities`. Structurally 0 for a dz lesson (ADR-001). */
export function capabilityDelta(cur: DeltaInput, prev: DeltaInput): number {
  return n(cur.capabilities) - n(prev.capabilities);
}

/** SAFLA `AdaptiveWeights.adjust_for_context` — same four re-tilts, else the defaults. */
export function adjustForContext(context: string | null | undefined): AdaptiveWeights {
  const c = (context ?? '').toLowerCase();
  if (c.includes('performance')) return { performance: 0.6, efficiency: 0.2, stability: 0.1, capability: 0.1 };
  if (c.includes('efficiency')) return { performance: 0.2, efficiency: 0.6, stability: 0.1, capability: 0.1 };
  if (c.includes('stability')) return { performance: 0.2, efficiency: 0.1, stability: 0.6, capability: 0.1 };
  if (c.includes('capability')) return { performance: 0.1, efficiency: 0.1, stability: 0.2, capability: 0.6 };
  return DEFAULT_WEIGHTS;
}

/**
 * Renormalize weights over the axes that carry a real signal (ADR-001, FR-4). `active.capability=false`
 * (the dz default) redistributes the capability weight across the others so the effective weights still
 * sum to 1 — the inert axis is neither fabricated nor silently value-dropped. Degenerate all-inactive →
 * the input is returned unchanged (never divide by 0).
 */
export function renormalizeOverActive(
  w: AdaptiveWeights,
  active: Partial<Record<keyof AdaptiveWeights, boolean>> = { capability: false },
): AdaptiveWeights {
  const on = (k: keyof AdaptiveWeights): boolean => active[k] !== false;
  const sum = (['performance', 'efficiency', 'stability', 'capability'] as const)
    .reduce((s, k) => s + (on(k) ? w[k] : 0), 0);
  if (sum <= EPS) return w;
  return {
    performance: on('performance') ? w.performance / sum : 0,
    efficiency: on('efficiency') ? w.efficiency / sum : 0,
    stability: on('stability') ? w.stability / sum : 0,
    capability: on('capability') ? w.capability / sum : 0,
  };
}

/** SAFLA `total_delta` — the weighted sum (batch_weighted_sum in the source). */
export function deltaEvaluate(cur: DeltaInput, prev: DeltaInput, weights: AdaptiveWeights = DEFAULT_WEIGHTS): number {
  const m: DeltaMetrics = {
    performance: performanceDelta(cur, prev),
    efficiency: efficiencyDelta(cur, prev),
    stability: stabilityDelta(cur, prev),
    capability: capabilityDelta(cur, prev),
  };
  return (
    weights.performance * m.performance +
    weights.efficiency * m.efficiency +
    weights.stability * m.stability +
    weights.capability * m.capability
  );
}

// ── dz adapter: reinforce history → a lesson's delta score ───────────────────

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

const DAY_MS = 86_400_000;

/**
 * Score one lesson by SAFLA delta from its reinforce history (FR-1/3/4). Maps dz signals onto the source:
 * efficiency = Δuses/Δdays (raw recall rate); performance = reward·(Δuses/Δdays) (reward-weighted rate,
 * carried via `throughput`); stability = variance reduction across interval rates (needs ≥3 events);
 * capability = 0 (renormalized out). < 2 events → neutral 0 (unknown slope).
 */
export function lessonDeltaFromHistory(
  lesson: LessonHistory,
  weights: AdaptiveWeights = DEFAULT_WEIGHTS,
): LessonDelta {
  const ev = [...lesson.events].filter((e) => typeof e.t === 'number' && isFinite(e.t)).sort((a, b) => a.t - b.t);
  if (ev.length < 2) return { id: lesson.id, delta: 0, pruneCandidate: false, hasSignal: false };

  const reward = Math.min(1, Math.max(0, n(lesson.reward)));
  // Per-interval recall rates (uses gained per day).
  const rates: number[] = [];
  for (let i = 1; i < ev.length; i++) {
    const dUses = ev[i]!.uses - ev[i - 1]!.uses;
    const dDays = Math.max((ev[i]!.t - ev[i - 1]!.t) / DAY_MS, EPS);
    rates.push(dUses / dDays);
  }
  const curRate = rates[rates.length - 1]!;
  const prevRate = rates.length >= 2 ? rates[rates.length - 2]! : 0;

  // Variance of rates over the window (stability needs ≥2 rates i.e. ≥3 events; else 0 = no signal).
  const variance = (xs: number[]): number => {
    if (xs.length < 2) return 0;
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
  };
  const curVar = variance(rates);
  const prevVar = variance(rates.slice(0, -1));

  // dz mapping (ADR-001): efficiency = raw recall-rate change; performance = reward-weighted rate change;
  // stability = variance REDUCTION of the rates; capability = 0 (structurally absent for a lesson).
  const w = renormalizeOverActive(weights, { capability: false });
  const m: DeltaMetrics = {
    performance: reward * (curRate - prevRate),
    efficiency: curRate - prevRate,
    stability: prevVar - curVar,
    capability: 0,
  };
  const delta =
    w.performance * m.performance + w.efficiency * m.efficiency + w.stability * m.stability + w.capability * m.capability;

  return { id: lesson.id, delta, pruneCandidate: delta <= 0, hasSignal: true };
}

/** Rank lessons by SAFLA delta, highest slope first. Lessons with no signal (delta 0) sort as neutral. */
export function rankLessonsByDelta(
  lessons: readonly LessonHistory[],
  weights: AdaptiveWeights = DEFAULT_WEIGHTS,
): readonly LessonDelta[] {
  return lessons.map((l) => lessonDeltaFromHistory(l, weights)).sort((a, b) => b.delta - a.delta);
}
