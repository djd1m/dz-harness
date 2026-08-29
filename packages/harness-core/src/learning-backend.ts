import { writeFileSync } from 'node:fs';

import {
  readMemoryLearningConfig,
  readReinforcementState,
  reinforcePattern,
  type ReinforcementState,
  type MemoryLearningConfig,
} from './patterns.js';

export const DEFAULT_REINFORCE_THRESHOLD = 0.95;

export type LearningBackendMode = 'native' | 'off' | 'ruvector-gnn';
export type LearningSampleKind = 'recall-hit' | 'reinforce' | 'merge';

export interface SignalCandidate {
  readonly dzId: string;
  readonly score: number;
  readonly reinforcement?: ReinforcementState | undefined;
}

export interface EnhanceContext {
  readonly kind: 'recall' | 'recommend';
  readonly now?: number;
  readonly cap?: number;
}

export interface LearningSample {
  readonly dzId: string;
  readonly kind: LearningSampleKind;
  readonly reward?: number;
  readonly ts: string;
  /** The recall domain this sample happened in, when the caller knows it. Threaded through to the
   * bandit so a confirmation lands in the SAME context bucket the recall read from — without it a
   * `dz recall --domain <x>` hit confirmed later writes to `general`, and `<x>` never sees it, which
   * leaves domain-scoped re-ranking permanently inert (cross-family QE, gpt-5.6-sol). */
  readonly domain?: string;
}

export interface TrainingResult {
  readonly trained: boolean;
  readonly flushed: number;
  readonly failed: number;
  readonly error?: string;
}

export interface LearningSignalStats {
  readonly enabled: boolean;
  readonly backend: string;
  readonly samplesCollected: number;
  readonly lastTrainingTime: number | null;
  readonly flushedTotal: number;
  readonly failedTotal: number;
  readonly advisory?: string;
}

export interface LearningSignalBackend {
  enhance(candidates: readonly SignalCandidate[], ctx: EnhanceContext): Float32Array;
  addSample(sample: LearningSample): void;
  train(opts?: { readonly maxMs?: number }): Promise<TrainingResult>;
  clearSamples(): void;
  saveModel(path: string): Promise<void>;
  loadModel(path: string): Promise<void>;
  getStats(): LearningSignalStats;
  reset(): void;
}

export function isLearningSignalBackend(v: unknown): v is LearningSignalBackend {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return ['enhance', 'addSample', 'train', 'clearSamples', 'saveModel', 'loadModel', 'getStats', 'reset']
    .every((k) => typeof o[k] === 'function');
}

export class NoopLearningBackend implements LearningSignalBackend {
  enhance(candidates: readonly SignalCandidate[]): Float32Array {
    return new Float32Array(candidates.length);
  }
  addSample(): void { /* no-op kill switch */ }
  async train(): Promise<TrainingResult> { return { trained: false, flushed: 0, failed: 0 }; }
  clearSamples(): void { /* no-op */ }
  async saveModel(path: string): Promise<void> {
    writeFileSync(path, JSON.stringify({ backend: 'off', note: 'NoopLearningBackend has no model state' }, null, 2));
  }
  async loadModel(): Promise<void> { /* no-op */ }
  getStats(): LearningSignalStats {
    return { enabled: false, backend: 'off', samplesCollected: 0, lastTrainingTime: null, flushedTotal: 0, failedTotal: 0 };
  }
  reset(): void { /* no-op */ }
}

export class NativeReinforcementBackend implements LearningSignalBackend {
  private readonly samples: LearningSample[] = [];
  private flushedTotal = 0;
  private failedTotal = 0;
  private lastTrainingTime: number | null = null;

  constructor(
    private readonly projectRoot: string,
    private readonly opts: { readonly usesSat: number; readonly halfLifeDays: number; readonly advisory?: string } = { usesSat: 64, halfLifeDays: 30 },
  ) {}

  enhance(candidates: readonly SignalCandidate[], ctx: EnhanceContext): Float32Array {
    const out = new Float32Array(candidates.length);
    const now = ctx.now ?? Date.now();
    for (let i = 0; i < candidates.length; i += 1) {
      const st = candidates[i]!.reinforcement;
      out[i] = st === undefined ? 0 : this.signal(st, now);
    }
    return out;
  }

  addSample(sample: LearningSample): void {
    this.samples.push(sample);
  }

  async train(): Promise<TrainingResult> {
    const batch = this.samples.splice(0);
    let flushed = 0;
    let failed = 0;
    let error: string | undefined;
    for (const sample of batch) {
      // lesson-quarantine (CRITICAL, cross-model QE): a `recall-hit` sample is EXPOSURE, not
      // confirmation — it must update reinforcement stats WITHOUT lifting quarantine. Only an
      // explicit `reinforce` sample promotes (the ADR's no-promotion-by-exposure invariant).
      const r = await reinforcePattern(this.projectRoot, sample.dzId, {
        ts: sample.ts,
        ...(sample.reward !== undefined ? { reward: sample.reward } : {}),
        ...(sample.kind === 'recall-hit' ? { exposure: true } : {}),
        ...(sample.domain !== undefined ? { domain: sample.domain } : {}),
      });
      if (r.ok) flushed += 1;
      else {
        failed += 1;
        error = r.error;
      }
    }
    this.flushedTotal += flushed;
    this.failedTotal += failed;
    this.lastTrainingTime = Date.now();
    return { trained: batch.length > 0, flushed, failed, ...(error !== undefined ? { error } : {}) };
  }

  clearSamples(): void {
    this.samples.splice(0);
  }

  async saveModel(path: string): Promise<void> {
    writeFileSync(path, JSON.stringify({ backend: 'native', note: 'state lives in .dz/memory records' }, null, 2));
  }
  async loadModel(): Promise<void> { /* native state lives in the store */ }

  getStats(): LearningSignalStats {
    return {
      enabled: true,
      backend: 'native',
      samplesCollected: this.samples.length,
      lastTrainingTime: this.lastTrainingTime,
      flushedTotal: this.flushedTotal,
      failedTotal: this.failedTotal,
      ...(this.opts.advisory !== undefined ? { advisory: this.opts.advisory } : {}),
    };
  }

  reset(): void {
    this.samples.splice(0);
    this.flushedTotal = 0;
    this.failedTotal = 0;
    this.lastTrainingTime = null;
  }

  private signal(state: ReinforcementState, now: number): number {
    if (state.uses <= 0) return 0;
    const usesSat = Math.max(2, this.opts.usesSat);
    const freq = Math.min(1, Math.log1p(state.uses) / Math.log1p(usesSat));
    const t = state.lastUsedTs !== undefined ? Date.parse(state.lastUsedTs) : Number.NaN;
    const halfLifeMs = Math.max(1, this.opts.halfLifeDays) * 86_400_000;
    const age = Number.isFinite(t) ? Math.max(0, now - t) : halfLifeMs;
    const recency = 0.5 + 0.5 * Math.exp(-age / halfLifeMs);
    return Math.max(0, Math.min(1, freq * recency));
  }
}

export function resolveLearningBackend(projectRoot: string, config: MemoryLearningConfig = readMemoryLearningConfig(projectRoot)): LearningSignalBackend {
  try {
    const cfg = config;
    if (cfg.backend === 'off') return new NoopLearningBackend();
    const advisory = cfg.backend === 'ruvector-gnn'
      ? 'memory.learning.backend="ruvector-gnn" is reserved; falling back to native reinforcement'
      : undefined;
    return new NativeReinforcementBackend(projectRoot, {
      usesSat: cfg.usesSat,
      halfLifeDays: cfg.halfLifeDays,
      ...(advisory !== undefined ? { advisory } : {}),
    });
  } catch {
    return new NativeReinforcementBackend(projectRoot);
  }
}

/**
 * One bounded re-rank term in the pipeline {@link applyLearningSignalsWithTerms} applies
 * (feature lesson-bandit-rerank, architecture §6).
 *
 * WHY THIS EXISTS. `memory.learning.deltaRerank` is not a re-rank hook: it is a boolean that
 * switches on ONE computation and selects between exactly two call sites. Reusing it for a second
 * payoff signal would force one of two bad shapes — two independent features behind one switch, or
 * a third `applyLearningSignalsWith…` function (and a fourth after that). A term LIST is the shape
 * that stops growing.
 */
export interface RerankTerm {
  /** `'delta'` | `'bandit'` — travels into the observability record. */
  readonly id: string;
  /** Raw per-candidate value, positionally aligned with `hits`/`candidates`. */
  readonly byIndex: readonly number[];
  /** Absolute bound on THIS term's contribution to a score. */
  readonly cap: number;
  /** Default `Math.tanh` (any magnitude → [-1,1]). A pre-bounded term passes identity. */
  readonly squash?: (v: number) => number;
}

/**
 * The one scoring pipeline: `adjusted = hit.score + cap*signal[i] + Σ_t t.cap * squash(t.byIndex[i])`,
 * stable-sorted with the original index as tie-break.
 *
 * With `terms: []` this is {@link applyLearningSignals} in behaviour; with one `'delta'` term it is
 * {@link applyLearningSignalsWithDelta}. Both remain exported as thin wrappers, so every existing
 * caller and test is untouched — the widening is additive at the API level too.
 *
 * A non-finite raw value contributes 0 and never NaN-poisons the sort (the guard the delta function
 * already carried; generalising it would have been the easiest place to drop it).
 */
export function applyLearningSignalsWithTerms<H extends { readonly score: number }>(
  hits: readonly H[],
  backend: LearningSignalBackend,
  candidates: readonly SignalCandidate[],
  cap: number,
  terms: readonly RerankTerm[] = [],
): H[] {
  const signals = backend.enhance(candidates, { kind: 'recall', cap });
  return hits
    .map((hit, i) => {
      let extra = 0;
      for (const t of terms) {
        const raw = t.byIndex[i];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
        const squashed = (t.squash ?? Math.tanh)(raw);
        if (Number.isFinite(squashed)) extra += t.cap * squashed;
      }
      return { hit, adjusted: hit.score + cap * (signals[i] ?? 0) + extra, i };
    })
    .sort((a, b) => b.adjusted - a.adjusted || a.i - b.i)
    .map((x) => x.hit);
}

export function applyLearningSignals<H extends { readonly score: number }>(
  hits: readonly H[],
  backend: LearningSignalBackend,
  candidates: readonly SignalCandidate[],
  cap: number,
): H[] {
  return applyLearningSignalsWithTerms(hits, backend, candidates, cap, []);
}

/**
 * {@link applyLearningSignals} plus a bounded ± SAFLA-delta term (rUv-scout #2 Phase 3). `deltaByIndex[i]`
 * is candidate `i`'s raw payoff SLOPE (0 when it has no slope signal); each is squashed through `tanh`
 * (any slope → [-1, 1]) and applied at `deltaCap`, so a rising lesson nudges UP and a stale one DOWN
 * without a single big-slope lesson dominating the lexical/vector base rank. With `deltaByIndex` all-zero
 * this is byte-identical to {@link applyLearningSignals} (the re-rank is off by default, gated by config).
 */
export function applyLearningSignalsWithDelta<H extends { readonly score: number }>(
  hits: readonly H[],
  backend: LearningSignalBackend,
  candidates: readonly SignalCandidate[],
  cap: number,
  deltaByIndex: readonly number[],
  deltaCap: number,
): H[] {
  return applyLearningSignalsWithTerms(hits, backend, candidates, cap, [
    { id: 'delta', byIndex: deltaByIndex, cap: deltaCap },
  ]);
}
