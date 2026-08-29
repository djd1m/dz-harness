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
export class LessonBandit {
  private contexts = new Map<string, Map<string, ArmStats>>();
  private readonly config: BanditConfig;

  constructor(config?: Partial<BanditConfig>) {
    this.config = {
      costWeight: config?.costWeight ?? 0.01,
      costDecay: config?.costDecay ?? 0.1,
      explorationBonus: config?.explorationBonus ?? 0.1,
    };
  }

  /**
   * Select the best arm for a given context using Thompson Sampling.
   *
   * For each candidate arm, samples from its Beta(alpha, beta) distribution
   * and subtracts a cost penalty. Returns the arm with the highest score.
   * Unknown arms get an exploration bonus.
   */
  selectArm(contextKey: string, armKeys: readonly string[]): string {
    if (armKeys.length === 0)
      throw new Error('No arms provided');
    if (armKeys.length === 1)
      return armKeys[0]!;
    const ctx = this.contexts.get(contextKey);
    let bestArm = armKeys[0]!;
    let bestScore = -Infinity;
    for (const arm of armKeys) {
      const stats = ctx?.get(arm);
      let score: number;
      if (!stats || stats.pulls === 0) {
        // Unknown arm: sample from uniform + exploration bonus
        score = Math.random() + this.config.explorationBonus;
      }
      else {
        // Thompson sample from Beta(alpha, beta)
        const sample = this.sampleBeta(stats.alpha, stats.beta);
        score = sample - stats.costEma * this.config.costWeight;
      }
      if (score > bestScore) {
        bestScore = score;
        bestArm = arm;
      }
    }
    return bestArm;
  }

  /**
   * Record the outcome of pulling an arm.
   *
   * @param contextKey - The context bucket (e.g., task type)
   * @param armKey - The arm that was pulled (e.g., skill name)
   * @param reward - Success signal in [0, 1]
   * @param cost - Optional cost signal (latency, tokens, etc.)
   */
  recordReward(contextKey: string, armKey: string, reward: number, cost?: number): void {
    if (!this.contexts.has(contextKey)) {
      this.contexts.set(contextKey, new Map());
    }
    const ctx = this.contexts.get(contextKey)!;
    if (!ctx.has(armKey)) {
      ctx.set(armKey, { alpha: 1, beta: 1, pulls: 0, totalReward: 0, costEma: 0 });
    }
    const arm = ctx.get(armKey)!;
    // Update Beta distribution
    const r = Math.max(0, Math.min(1, reward));
    arm.alpha += r;
    arm.beta += (1 - r);
    arm.pulls++;
    arm.totalReward += r;
    // Update cost EMA
    if (cost !== undefined) {
      arm.costEma = arm.costEma * (1 - this.config.costDecay) + cost * this.config.costDecay;
    }
  }

  /**
   * Rerank a list of candidates using bandit scores.
   * Returns indices sorted by Thompson-sampled score (best first).
   */
  rerank(contextKey: string, armKeys: readonly string[]): string[] {
    if (armKeys.length <= 1)
      return [...armKeys];
    const ctx = this.contexts.get(contextKey);
    const scored = armKeys.map((arm) => {
      const stats = ctx?.get(arm);
      let score: number;
      if (!stats || stats.pulls === 0) {
        score = Math.random() + this.config.explorationBonus;
      }
      else {
        score = this.sampleBeta(stats.alpha, stats.beta) - stats.costEma * this.config.costWeight;
      }
      return { arm, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.arm);
  }

  /** Get arm stats for a specific context */
  getArmStats(contextKey: string, armKey: string): ArmStats | null {
    return this.contexts.get(contextKey)?.get(armKey) ?? null;
  }

  /** Get aggregate statistics */
  getStats(): BanditAggregateStats {
    let totalArms = 0, totalPulls = 0, totalReward = 0;
    for (const ctx of this.contexts.values()) {
      totalArms += ctx.size;
      for (const arm of ctx.values()) {
        totalPulls += arm.pulls;
        totalReward += arm.totalReward;
      }
    }
    return { contexts: this.contexts.size, totalArms, totalPulls, totalReward };
  }

  /** Serialize to JSON-safe state */
  serialize(): SerializedBanditState {
    const contexts: Record<string, Record<string, ArmStats>> = {};
    for (const [ctxKey, arms] of this.contexts) {
      contexts[ctxKey] = {};
      for (const [armKey, stats] of arms) {
        contexts[ctxKey]![armKey] = { ...stats };
      }
    }
    return { version: 1, config: { ...this.config }, contexts };
  }

  /**
   * Restore from serialized state.
   *
   * STATIC (C-2). A first draft that called it as an instance method threw `TypeError`; the
   * signature here makes the static call the only one that compiles.
   */
  static deserialize(state: SerializedBanditState): LessonBandit {
    const bandit = new LessonBandit(state.config);
    for (const [ctxKey, arms] of Object.entries(state.contexts)) {
      const ctx = new Map<string, ArmStats>();
      for (const [armKey, stats] of Object.entries(arms)) {
        ctx.set(armKey, { ...stats });
      }
      bandit.contexts.set(ctxKey, ctx);
    }
    return bandit;
  }

  /** Reset all learned state */
  reset(): void {
    this.contexts.clear();
  }

  // ─── Private ───

  /**
   * Sample from Beta(a, b) using the Jöhnk algorithm.
   * Fast approximation for typical bandit parameters.
   */
  private sampleBeta(a: number, b: number): number {
    // For a=1, b=1 (uniform): just return Math.random()
    if (a <= 1 && b <= 1)
      return Math.random();
    // Jöhnk's algorithm for general Beta
    if (a < 1 && b < 1) {
      for (let iter = 0; iter < 1000; iter++) {
        const u = Math.random();
        const v = Math.random();
        const x = Math.pow(u, 1 / a);
        const y = Math.pow(v, 1 / b);
        if (x + y <= 1)
          return x / (x + y);
      }
      return Math.random(); // fallback (extremely unlikely)
    }
    // For larger parameters, use Gamma ratio
    const ga = this.sampleGamma(a);
    const gb = this.sampleGamma(b);
    return ga / (ga + gb);
  }

  /**
   * Sample from Gamma(shape, 1) using Marsaglia & Tsang's method.
   */
  private sampleGamma(shape: number): number {
    if (shape < 1) {
      return this.sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    const d = shape - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (let iter = 0; iter < 1000; iter++) {
      let x: number, v: number;
      do {
        x = this.sampleNormal();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x))
        return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v)))
        return d * v;
    }
    return d; // fallback (extremely unlikely)
  }

  /** Box-Muller normal sample */
  private sampleNormal(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
