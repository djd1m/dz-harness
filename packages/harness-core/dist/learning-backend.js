import { writeFileSync } from 'node:fs';
import { readMemoryLearningConfig, readReinforcementState, reinforcePattern, } from './patterns.js';
export const DEFAULT_REINFORCE_THRESHOLD = 0.95;
export function isLearningSignalBackend(v) {
    if (typeof v !== 'object' || v === null)
        return false;
    const o = v;
    return ['enhance', 'addSample', 'train', 'clearSamples', 'saveModel', 'loadModel', 'getStats', 'reset']
        .every((k) => typeof o[k] === 'function');
}
export class NoopLearningBackend {
    enhance(candidates) {
        return new Float32Array(candidates.length);
    }
    addSample() { }
    async train() { return { trained: false, flushed: 0, failed: 0 }; }
    clearSamples() { }
    async saveModel(path) {
        writeFileSync(path, JSON.stringify({ backend: 'off', note: 'NoopLearningBackend has no model state' }, null, 2));
    }
    async loadModel() { }
    getStats() {
        return { enabled: false, backend: 'off', samplesCollected: 0, lastTrainingTime: null, flushedTotal: 0, failedTotal: 0 };
    }
    reset() { }
}
export class NativeReinforcementBackend {
    projectRoot;
    opts;
    samples = [];
    flushedTotal = 0;
    failedTotal = 0;
    lastTrainingTime = null;
    constructor(projectRoot, opts = { usesSat: 64, halfLifeDays: 30 }) {
        this.projectRoot = projectRoot;
        this.opts = opts;
    }
    enhance(candidates, ctx) {
        const out = new Float32Array(candidates.length);
        const now = ctx.now ?? Date.now();
        for (let i = 0; i < candidates.length; i += 1) {
            const st = candidates[i].reinforcement;
            out[i] = st === undefined ? 0 : this.signal(st, now);
        }
        return out;
    }
    addSample(sample) {
        this.samples.push(sample);
    }
    async train() {
        const batch = this.samples.splice(0);
        let flushed = 0;
        let failed = 0;
        let error;
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
            if (r.ok)
                flushed += 1;
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
    clearSamples() {
        this.samples.splice(0);
    }
    async saveModel(path) {
        writeFileSync(path, JSON.stringify({ backend: 'native', note: 'state lives in .dz/memory records' }, null, 2));
    }
    async loadModel() { }
    getStats() {
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
    reset() {
        this.samples.splice(0);
        this.flushedTotal = 0;
        this.failedTotal = 0;
        this.lastTrainingTime = null;
    }
    signal(state, now) {
        if (state.uses <= 0)
            return 0;
        const usesSat = Math.max(2, this.opts.usesSat);
        const freq = Math.min(1, Math.log1p(state.uses) / Math.log1p(usesSat));
        const t = state.lastUsedTs !== undefined ? Date.parse(state.lastUsedTs) : Number.NaN;
        const halfLifeMs = Math.max(1, this.opts.halfLifeDays) * 86_400_000;
        const age = Number.isFinite(t) ? Math.max(0, now - t) : halfLifeMs;
        const recency = 0.5 + 0.5 * Math.exp(-age / halfLifeMs);
        return Math.max(0, Math.min(1, freq * recency));
    }
}
export function resolveLearningBackend(projectRoot, config = readMemoryLearningConfig(projectRoot)) {
    try {
        const cfg = config;
        if (cfg.backend === 'off')
            return new NoopLearningBackend();
        const advisory = cfg.backend === 'ruvector-gnn'
            ? 'memory.learning.backend="ruvector-gnn" is reserved; falling back to native reinforcement'
            : undefined;
        return new NativeReinforcementBackend(projectRoot, {
            usesSat: cfg.usesSat,
            halfLifeDays: cfg.halfLifeDays,
            ...(advisory !== undefined ? { advisory } : {}),
        });
    }
    catch {
        return new NativeReinforcementBackend(projectRoot);
    }
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
export function applyLearningSignalsWithTerms(hits, backend, candidates, cap, terms = []) {
    const signals = backend.enhance(candidates, { kind: 'recall', cap });
    return hits
        .map((hit, i) => {
        let extra = 0;
        for (const t of terms) {
            const raw = t.byIndex[i];
            if (typeof raw !== 'number' || !Number.isFinite(raw))
                continue;
            const squashed = (t.squash ?? Math.tanh)(raw);
            if (Number.isFinite(squashed))
                extra += t.cap * squashed;
        }
        return { hit, adjusted: hit.score + cap * (signals[i] ?? 0) + extra, i };
    })
        .sort((a, b) => b.adjusted - a.adjusted || a.i - b.i)
        .map((x) => x.hit);
}
export function applyLearningSignals(hits, backend, candidates, cap) {
    return applyLearningSignalsWithTerms(hits, backend, candidates, cap, []);
}
/**
 * {@link applyLearningSignals} plus a bounded ± SAFLA-delta term (rUv-scout #2 Phase 3). `deltaByIndex[i]`
 * is candidate `i`'s raw payoff SLOPE (0 when it has no slope signal); each is squashed through `tanh`
 * (any slope → [-1, 1]) and applied at `deltaCap`, so a rising lesson nudges UP and a stale one DOWN
 * without a single big-slope lesson dominating the lexical/vector base rank. With `deltaByIndex` all-zero
 * this is byte-identical to {@link applyLearningSignals} (the re-rank is off by default, gated by config).
 */
export function applyLearningSignalsWithDelta(hits, backend, candidates, cap, deltaByIndex, deltaCap) {
    return applyLearningSignalsWithTerms(hits, backend, candidates, cap, [
        { id: 'delta', byIndex: deltaByIndex, cap: deltaCap },
    ]);
}
//# sourceMappingURL=learning-backend.js.map