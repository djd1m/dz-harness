import { type ReinforcementState, type MemoryLearningConfig } from './patterns.js';
export declare const DEFAULT_REINFORCE_THRESHOLD = 0.95;
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
    train(opts?: {
        readonly maxMs?: number;
    }): Promise<TrainingResult>;
    clearSamples(): void;
    saveModel(path: string): Promise<void>;
    loadModel(path: string): Promise<void>;
    getStats(): LearningSignalStats;
    reset(): void;
}
export declare function isLearningSignalBackend(v: unknown): v is LearningSignalBackend;
export declare class NoopLearningBackend implements LearningSignalBackend {
    enhance(candidates: readonly SignalCandidate[]): Float32Array;
    addSample(): void;
    train(): Promise<TrainingResult>;
    clearSamples(): void;
    saveModel(path: string): Promise<void>;
    loadModel(): Promise<void>;
    getStats(): LearningSignalStats;
    reset(): void;
}
export declare class NativeReinforcementBackend implements LearningSignalBackend {
    private readonly projectRoot;
    private readonly opts;
    private readonly samples;
    private flushedTotal;
    private failedTotal;
    private lastTrainingTime;
    constructor(projectRoot: string, opts?: {
        readonly usesSat: number;
        readonly halfLifeDays: number;
        readonly advisory?: string;
    });
    enhance(candidates: readonly SignalCandidate[], ctx: EnhanceContext): Float32Array;
    addSample(sample: LearningSample): void;
    train(): Promise<TrainingResult>;
    clearSamples(): void;
    saveModel(path: string): Promise<void>;
    loadModel(): Promise<void>;
    getStats(): LearningSignalStats;
    reset(): void;
    private signal;
}
export declare function resolveLearningBackend(projectRoot: string, config?: MemoryLearningConfig): LearningSignalBackend;
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
export declare function applyLearningSignalsWithTerms<H extends {
    readonly score: number;
}>(hits: readonly H[], backend: LearningSignalBackend, candidates: readonly SignalCandidate[], cap: number, terms?: readonly RerankTerm[]): H[];
export declare function applyLearningSignals<H extends {
    readonly score: number;
}>(hits: readonly H[], backend: LearningSignalBackend, candidates: readonly SignalCandidate[], cap: number): H[];
/**
 * {@link applyLearningSignals} plus a bounded ± SAFLA-delta term (rUv-scout #2 Phase 3). `deltaByIndex[i]`
 * is candidate `i`'s raw payoff SLOPE (0 when it has no slope signal); each is squashed through `tanh`
 * (any slope → [-1, 1]) and applied at `deltaCap`, so a rising lesson nudges UP and a stale one DOWN
 * without a single big-slope lesson dominating the lexical/vector base rank. With `deltaByIndex` all-zero
 * this is byte-identical to {@link applyLearningSignals} (the re-rank is off by default, gated by config).
 */
export declare function applyLearningSignalsWithDelta<H extends {
    readonly score: number;
}>(hits: readonly H[], backend: LearningSignalBackend, candidates: readonly SignalCandidate[], cap: number, deltaByIndex: readonly number[], deltaCap: number): H[];
//# sourceMappingURL=learning-backend.d.ts.map