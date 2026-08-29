/**
 * `dz compounding` — does the learning loop actually PAY? (feature compounding, scout C2)
 *
 * Ported from rUv's darwin-mode (`security/compounding.ts`, `security/ablation.ts`,
 * `bench/{stats,promotion}.ts`) with an honesty split the port map demanded:
 *   - the STATS machinery ports verbatim (seeded mulberry32, bootstrap lower-95, decidePromotion,
 *     the min-n >= 5 rule — darwin's own FDR calibration shows n=3 gives a 33% false-discovery rate);
 *   - darwin's MEASUREMENT legs do NOT port: its FP-drop leg ignores the passed corpus (a fixture),
 *     `withoutMemory` is hard-coded 0, and "warm" is injected state — theatrical, exactly what this
 *     repo's claim-check culture forbids. The measurements here are dz-native, over data that exists.
 *
 * The report NEVER fakes a verdict: a gate without enough samples says INSUFFICIENT_DATA — after the
 * 2026-07-28 inventory found the apply-leg log dead for 19 days, "no data" is a finding, not a pass.
 *
 * Everything here is PURE: callers gather facts (files, store rows); this module only computes.
 */
/** Deterministic PRNG — same seed, same stream, byte-identical reports. */
export declare function mulberry32(seed: number): () => number;
export declare const BOOTSTRAP_RESAMPLES = 5000;
/** Below this many samples PER ARM a comparison is noise: darwin's own FDR calibration measured a
 *  0.332 empirical false-discovery rate at n=3. */
export declare const MIN_SAMPLES_PER_ARM = 5;
export interface BootstrapDelta {
    readonly meanDelta: number;
    /** 2.5th percentile of the resampled deltas — the promotion decision reads THIS, not the mean. */
    readonly lower95: number;
    readonly samples: number;
}
/** Paired bootstrap over per-item deltas (b[i] - a[i]). */
export declare function bootstrapDelta(a: readonly number[], b: readonly number[], seed?: number): BootstrapDelta | null;
export type PromotionVerdict = 'promote' | 'reject' | 'insufficient-data';
/** Darwin's decision rule: a positive mean is not enough — the LOWER bound must clear zero. */
export declare function decidePromotion(delta: BootstrapDelta | null, minDelta?: number): PromotionVerdict;
export interface LessonRow {
    readonly dzId: string;
    readonly uses: number;
    readonly quarantined: boolean;
    readonly reward: number | null;
}
export interface UsageEvent {
    readonly dzId: string;
    readonly ts: string;
    readonly query?: string;
    readonly runId?: string;
    /** One id per PROMPT: the hook writes one row per injected hit (up to 3 per prompt), and counting
     *  rows as independent replay pairs fabricated readiness (Codex #1). */
    readonly eventId?: string;
    /** A truncated query cannot reproduce the original recall — it must not count (Codex #3). */
    readonly queryTruncated?: boolean;
}
export interface ReplayInstance {
    /** Stable per-PROMPT key — one prompt is one instance, however many lessons it injected. */
    readonly id: string;
    readonly query: string;
    /** Exactly the lesson texts the apply leg injected for this prompt — the WARM arm's only delta. */
    readonly lessons: readonly string[];
    /**
     * Pre-registered slice label (e.g. `task` / `conversational`). `null` until a human assigns it —
     * nothing here invents a classification, because a class assigned AFTER outcomes are known is
     * not a pre-registration.
     */
    readonly class: string | null;
}
/**
 * The ONE definition of "a replayable pair": the readiness gate below COUNTS these and
 * `dz epoch-replay --emit` EMITS these. A second copy would let readiness say 12 while the runner
 * emits 9, silently — the drift class this repo keeps catching.
 *
 * Rules: a prompt with no query cannot be replayed; a TRUNCATED query is a prefix, not the prompt;
 * one prompt = one instance (the hook writes one row per injected hit, up to 3 per prompt).
 */
export declare function replayableInstances(usage: readonly UsageEvent[], lessonText?: ReadonlyMap<string, string>): ReplayInstance[];
export interface GuardEvent {
    readonly ts: string;
    readonly verdict: string;
    readonly rules: readonly string[];
}
/**
 * A raw evidence log, handed over verbatim so the chain verdict has exactly ONE definition
 * (`verifyEventChainText`) instead of a CLI-side copy that can drift from it — the drift class this
 * repo keeps catching. Absent ⇒ the report simply has no chain line.
 */
export interface EvidenceLogFact {
    /** Display label, e.g. `.dz/recall-usage.jsonl`. */
    readonly log: string;
    readonly text: string;
}
export interface CompoundingFacts {
    readonly lessons: readonly LessonRow[];
    readonly usage: readonly UsageEvent[];
    readonly guard: readonly GuardEvent[];
    readonly nowTs: string;
    /** The evidence logs themselves — verified as hash chains (feature event-chain, ADR-001). */
    readonly evidenceLogs?: readonly EvidenceLogFact[];
    /** Depth of the command-invocation corpus. `null` means no readable log, never zero-by-default. */
    readonly cmdUsageDepthDays?: number | null;
}
export interface PoolPayoff {
    readonly total: number;
    /** Ever surfaced by the APPLY leg (hook injection) — the strict payoff bar. */
    readonly injectedEver: number;
    /** Touched by ANY recall path (store `uses` counter). */
    readonly touchedEver: number;
    readonly neverTouched: number;
    readonly quarantined: number;
    /** Fraction of the pool that is write-only under the strict bar. */
    readonly writeOnlyRatio: number;
}
export interface GuardRuleTrajectory {
    readonly rule: string;
    readonly firstHalfViolations: number;
    readonly secondHalfViolations: number;
    readonly firstHalfAudits: number;
    readonly secondHalfAudits: number;
    /** Improvement is judged on the RATE (violations per audit), not raw counts: ten violations in a
     *  hundred early audits vs one in one late audit is a WORSENING, not progress (Codex #7). */
    readonly improved: boolean;
}
export type ReadinessVerdict = 'ready' | 'insufficient-data';
export interface ReplayReadiness {
    /** UNIQUE, untruncated prompt events — the pairs a cold-vs-warm replay needs. */
    readonly replayablePairs: number;
    readonly minNeeded: number;
    /** READINESS only. `promote`/`reject` exist solely after a real cold/warm A-B has been run and
     *  bootstrapped — readiness must never look like a result (Codex #1). */
    readonly verdict: ReadinessVerdict;
    readonly note: string;
}
/** Per-log chain health — an INSTRUMENTATION fact about the evidence, not a learning verdict. */
export interface EvidenceChainHealth {
    readonly log: string;
    readonly ok: boolean;
    readonly chained: number;
    /** Records written before chaining existed: LEGAL, and honestly reported as uncovered. */
    readonly preChainPrefix: number;
    readonly defects: number;
    readonly defectKinds: readonly string[];
}
export interface InstrumentationHealth {
    readonly lastUsageTs: string | null;
    readonly gapDays: number | null;
    /** True when the newest usage record is recent enough to trust the leg is alive. */
    readonly applyLegLive: boolean;
    /** One entry per evidence log handed in. Empty when no logs were provided. */
    readonly chains: readonly EvidenceChainHealth[];
    /** True when every provided log verifies. Vacuously true when none were provided — that is why
     *  {@link EvidenceChainHealth} carries the counts: "no logs" must not read like "all clean". */
    readonly chainsOk: boolean;
    /** Independent observer for deadwood's fail-open write leg; null means no readable evidence. */
    readonly cmdUsageDepthDays: number | null;
}
export interface CompoundingReport {
    readonly pool: PoolPayoff;
    readonly guardTrajectory: readonly GuardRuleTrajectory[];
    readonly replay: ReplayReadiness;
    readonly instrumentation: InstrumentationHealth;
    /** The one-line honest answer. */
    readonly verdict: string;
}
export declare function assembleCompoundingReport(facts: CompoundingFacts): CompoundingReport;
export declare function renderCompoundingReport(r: CompoundingReport): string;
//# sourceMappingURL=compounding.d.ts.map