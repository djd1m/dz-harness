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
import type { GuardOp } from './guard.js';
import { type PromotionAcceptanceEvidence, type PromotionRunEvidence } from './guard-promotion.js';
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
    readonly op?: GuardOp;
    readonly verdict: string;
    readonly rules: readonly string[];
    readonly violations?: readonly {
        readonly rule: string;
        readonly contentAnchor?: string;
    }[];
    /**
     * 1-based position of this record among the log's non-empty lines — the ONLY thing that can place
     * it relative to a chain defect. Absent when the caller read the rows without a chain.
     */
    readonly chainLine?: number;
}
export type FunnelEvidenceSource<T> = {
    readonly status: 'measured';
    readonly rows: readonly T[];
} | {
    readonly status: 'not-measured';
    readonly reason: string;
};
/**
 * Where the guard journal's chain damage sits, so a PERIOD can be judged instead of the whole FILE.
 *
 * A log damaged once in March and unbroken since is not evidence against September's rows, and
 * refusing to measure September because of March is the same "verdict answers a different question"
 * defect the chain headline was fixed for (backlog b38dd3ba, MEASURED 2026-09-21: 28 defects, all
 * before a run of 1169 unbroken records, suppressed BOTH measured months).
 */
export interface GuardAuditChainWindow {
    /** First non-empty line of the current unbroken run: one past the last defect. */
    readonly runFrom: number;
    /** Total defects in the file. Zero means the window imposes nothing. */
    readonly defects: number;
}
export interface LessonToRuleFunnelFacts {
    readonly promotionRuns: FunnelEvidenceSource<PromotionRunEvidence>;
    readonly guardAudits: FunnelEvidenceSource<GuardEvent>;
    readonly guardAuditChain?: GuardAuditChainWindow;
    readonly promotionAcceptances?: readonly PromotionAcceptanceEvidence[];
    readonly truncatedPromotionPeriods?: readonly string[];
    readonly acceptanceHistoryComplete?: boolean;
}
export type LessonToRuleStage = 'eligible' | 'attempted' | 'accepted' | 'executions';
export type FunnelStageMeasurement = {
    readonly status: 'measured';
    readonly value: number;
} | {
    readonly status: 'not-measured';
    readonly reason: string;
};
export interface LessonToRuleFunnelPeriod {
    readonly period: string;
    readonly eligible: FunnelStageMeasurement;
    readonly attempted: FunnelStageMeasurement;
    readonly accepted: FunnelStageMeasurement;
    readonly executions: FunnelStageMeasurement;
}
export interface LessonToRuleFunnelFinding {
    readonly predecessor: LessonToRuleStage;
    readonly stage: LessonToRuleStage;
    readonly fromPeriod: string;
    readonly toPeriod: string;
    readonly counts: readonly {
        readonly period: string;
        readonly predecessor: number;
        readonly successor: number;
    }[];
}
export interface LessonToRuleFunnelReport {
    readonly periods: readonly LessonToRuleFunnelPeriod[];
    readonly findings: readonly LessonToRuleFunnelFinding[];
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
    /** Prospective route observations; absence is explicit NOT MEASURED, never an empty funnel. */
    readonly lessonToRule?: LessonToRuleFunnelFacts;
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
    /**
     * WHERE the defects sit relative to the log's current unbroken run, and HOW MUCH of a run that is.
     * Without this a bare `FAILED` over a log whose damage is entirely historical reads as "today's
     * numbers are garbage", while `dz chain` over the SAME file says "healed … verdicts over those are
     * sound" — MEASURED 2026-09-20 on `.dz/guard-audit.jsonl`: 28 defects, all before the current run,
     * 1095 unbroken records after them; one instrument printed FAILED, the other healed, both exit 0
     * (backlog 79ce6262). Neither was lying; neither named its WINDOW. `event-chain.ts` says it
     * outright: a caller that reports soundness without printing the run size overclaims on its behalf,
     * and the same holds for a caller that reports damage without printing where the damage sits.
     */
    readonly defectsBeforeRun: number;
    readonly defectsInRun: number;
    /** Records in the current unbroken run — the evidence behind any "sound for today" reading. */
    readonly runRecords: number;
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
    readonly lessonToRuleFunnel: LessonToRuleFunnelReport;
    /** The one-line honest answer. */
    readonly verdict: string;
}
export declare function assembleLessonToRuleFunnel(facts: LessonToRuleFunnelFacts, nowTs: string): LessonToRuleFunnelReport;
export declare function assembleCompoundingReport(facts: CompoundingFacts): CompoundingReport;
/**
 * The HEADLINE verdict over every evidence log — three-valued, because two values lied.
 *
 * MEASURED 2026-09-21 on `.dz/guard-audit.jsonl`: 28 defects, the LAST of them dated 2026-09-05,
 * followed by more than a thousand unbroken records. The old headline read
 * "CORRUPT — the numbers above are computed from a damaged log", which is true of the FILE'S
 * HISTORY and false about the numbers it was printed next to. The distinction already existed one
 * function below, in {@link chainVerdictPhrase}; it simply never reached the line a reader sees
 * first. That is the same defect class this report exists to find: a verdict answering a different
 * question than the one it appears to answer.
 */
/**
 * Whether the report's OWN numbers may be trusted, as a value the caller can turn into an exit code.
 *
 * Backlog 79ce6262 named the defect: the report printed "the numbers above are computed from a
 * damaged log" and exited 0 anyway — a tool announcing its own output untrustworthy and reporting
 * success. That record offered two lawful cures and asked which applies. Both do, on different
 * branches, and only the three-valued verdict lets them coexist: damage BEHIND the current run
 * narrows the WORDING (the numbers stand, exit 0), damage INSIDE it makes the numbers genuinely
 * unreliable and must reach the exit code.
 *
 * `'trusted'` ⇒ 0. `'unreliable'` ⇒ a non-zero the caller chooses — the run succeeded, the verdict
 * cannot be relied on, which is this repository's INCONCLUSIVE shape, not its failure shape.
 */
export declare function chainTrust(chains: readonly EvidenceChainHealth[]): 'trusted' | 'unreliable';
export declare function chainHeadline(chains: readonly EvidenceChainHealth[]): string;
/**
 * The verdict phrase for one evidence log, with its WINDOW named. A bare `FAILED` over damage that an
 * unbroken run has already followed is true of the FILE and misleading about TODAY — see
 * {@link EvidenceChainHealth.defectsBeforeRun}.
 */
export declare function chainVerdictPhrase(c: EvidenceChainHealth): string;
export declare function renderCompoundingReport(r: CompoundingReport): string;
export interface LessonOutcomeRow {
    readonly lessons?: readonly string[];
    readonly outcome?: string;
    readonly grade?: string | null;
    readonly slug?: string;
    readonly stage?: string;
}
export interface LessonOutcomeCounters {
    pairs: number;
    shipped: number;
    refuted: number;
    blocked: number;
    other: number;
    graded: number;
    grades: Record<string, number>;
}
export interface LessonOutcomeCoverage {
    readonly lessonsWithOutcome: number;
    readonly pairsTotal: number;
    readonly pairsUngraded: number;
    readonly duplicateRowsDropped: number;
}
export interface JoinedLessonOutcomes {
    readonly perLesson: ReadonlyMap<string, LessonOutcomeCounters>;
    readonly totals: LessonOutcomeCounters;
    readonly coverage: LessonOutcomeCoverage;
}
/**
 * Считает пары «урок ↔ исход работы» из уже прочитанных строк леджера.
 * unknown допускает мусор после разбора JSON; поля проверяются перед использованием.
 * Неизвестный или отсутствующий исход попадает в other, пустой грейд — в пары без грейда.
 * Буквы грейдов сохраняются как категории, без перевода в единый балл пользы.
 * Полные JSON-дубликаты строк и повторные id внутри одной строки не умножают пары.
 */
export declare function joinLessonOutcomes(rows: readonly unknown[]): JoinedLessonOutcomes;
/**
 * Размер стора передаёт вызывающий код: в строках леджера этого знаменателя нет.
 * Для доли покрытия набор joined должен относиться к урокам этого стора.
 * Без знаменателя доля остаётся неизвестной, а не превращается в 100%.
 */
export declare function renderLessonOutcomes(joined: JoinedLessonOutcomes, storeLessonCount?: number): string;
//# sourceMappingURL=compounding.d.ts.map