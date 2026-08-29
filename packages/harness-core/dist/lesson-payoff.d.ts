/**
 * Lesson Payoff — the anti-corruption layer around the vendored bandit engine
 * (feature lesson-bandit-rerank; ADR-001 / ADR-002 / ADR-003, domain model §6).
 *
 * WHAT THIS OWNS. One question: *how often did THIS lesson, in THIS kind of situation, actually
 * resolve a problem?* It knows a lesson only as an opaque `ArmKey` (its `dzId`). It never reads
 * lesson text, never writes to the pattern store, never decides candidate membership, and never
 * touches quarantine state (INV-9).
 *
 * WHY AN ACL WHEN WE OWN THE COPY. Vendoring gives us the FILE, not the LANGUAGE. The engine's
 * only counter-advancing method (`recordReward`) also moves the Beta parameters, so there is no way
 * to tell it "a pull happened, no evidence either way". Our domain MUST be able to say that: an
 * EXPOSURE is not a REWARD (INV-2 — the defect cross-model QE already removed once from
 * `patterns.ts`, where recall-hit telemetry was silently promoting every viewed lesson). So the
 * exposure counter lives in OUR envelope, beside the engine payload, and INV-2 is true by DATA
 * LAYOUT rather than by call-site discipline: there is no field in `bandit.contexts` an exposure is
 * allowed to touch.
 *
 * DETERMINISM (ADR-001 D-2 / D-7, reaffirmed by ADR-003's P5). The default payoff term is the
 * POSTERIOR MEAN `alpha/(alpha+beta)`, mapped to `[-1,+1]`, using ONLY `getArmStats` — never
 * `selectArm`, never `rerank`. Both of those Thompson-SAMPLE (`Math.random()` on every zero-pull
 * arm), which would make two identical recalls disagree, defeat the byte-identity proof, and hand
 * quarantined lessons a random lift. `05_architecture.md` §3 and `04_domain_model.md` §6.2 sketch an
 * order-projection over `rerank()` instead; that draft is refuted by ADR-003's P5 ("with
 * `banditExploration` absent, no `Math.random()` is consumed on the recall path"), which `rerank`
 * cannot satisfy. The ADRs are the decision record and they win; this file implements them, and the
 * bound the order-projection was chosen for is preserved exactly — the term is in `[-1,+1]` by
 * construction, so the caller's cap is an EXACT bound.
 *
 * FAILURE POSTURE (NFR-5 / INV-7). Every read here degrades to "no term applied, honest reason
 * recorded"; every write degrades to "this reward was dropped, counted, and logged". Nothing in
 * this module may throw into `hybridRecall` or `reinforcePattern`.
 */
import { type SerializedBanditState } from './lesson-bandit.js';
import { type MemoryLearningConfig } from './patterns.js';
/** OUR envelope version — distinct from the engine's own `version` field (architecture §7.2). */
export declare const BANDIT_STATE_SCHEMA = 1;
/**
 * The named lock guarding the state file. It resolves to `<projectRoot>/.dz/locks/lesson-bandit.lock`,
 * i.e. the lock sits in the SAME `.dz` that holds the store — two worktrees pointing at one brain
 * therefore share one lock, which is the only placement that serializes the right writers.
 */
export declare const BANDIT_LOCK_NAME = "lesson-bandit";
export declare function banditStateDir(projectRoot: string): string;
/**
 * `<projectRoot>/.dz/lesson-bandit/state.json` (plan §0 D0-1 — the ADRs' worked examples say
 * `.dz/memory/bandit-state.json`; ADR-002's FR-2 already hedges "or equivalent path under `.dz/`",
 * and requirements/domain-model/architecture all key on this one).
 */
export declare function banditStatePath(projectRoot: string): string;
export interface ResolvedBanditConfig {
    /** `memory.learning.banditRerank === true`. Absent/invalid ⇒ false ⇒ this context is never built. */
    readonly enabled: boolean;
    /** What the config ASKED for, before the `enabled` gate. */
    readonly explorationRequested: boolean;
    /** Effective exploration: requested AND armed. `explore` without `rerank` is a no-op (ADR-003). */
    readonly exploration: boolean;
}
export declare function resolveBanditConfig(projectRoot: string, cfg?: MemoryLearningConfig): ResolvedBanditConfig;
/**
 * ContextKey (domain model §3.3) — the coarse situation bucket a recall happened in, derived from
 * the resolved recall domain (the axis `dz recall --domain` already boosts on). COARSE on purpose:
 * with a per-query key every arm would sit at `pulls === 0` forever and the term would be noise.
 * Normalising constructor, so two spellings of one domain cannot fork a posterior.
 */
export declare function contextKeyFor(domain?: string | null | undefined): string;
/** A confirmation happened: this lesson demonstrably helped. */
export interface RewardEvent {
    readonly dzId: string;
    readonly contextKey: string;
    readonly reward: number;
    readonly ts: string;
}
/** A lesson was merely SEEN in a recall result. Carries no reward mass, by construction. */
export interface ExposureEvent {
    readonly dzId: string;
    readonly contextKey: string;
    readonly ts: string;
}
/**
 * Build a {@link RewardEvent}, clamping reward into `[0,1]` at the domain boundary (INV-8/AC-7).
 *
 * A NON-FINITE reward (`NaN`, `Infinity`) is REJECTED (`null`), not coerced: `clamp01(NaN)` is
 * `NaN`, which would poison `alpha`; and coercing it to `0` would be worse still — `reward: 0` moves
 * `beta`, i.e. it records evidence the lesson FAILED. Dropping is the only fail-safe direction.
 */
export declare function makeRewardEvent(dzId: string, contextKey: string, reward: number, ts: string): RewardEvent | null;
/**
 * Translate one upstream learning sample into exactly one domain event (domain model §5).
 *
 * `kind:'merge'` and every UNRECOGNISED kind are DROPPED — a sample kind added upstream tomorrow
 * defaults to *ignored*, never to *rewarded*. That asymmetry is the whole point of translating
 * rather than subscribing.
 */
export declare function classifySignal(sample: {
    readonly kind: string;
    readonly dzId: string;
    readonly reward?: number | undefined;
    readonly ts: string;
}, contextKey: string): {
    readonly type: 'reward';
    readonly event: RewardEvent;
} | {
    readonly type: 'exposure';
    readonly event: ExposureEvent;
} | null;
/** The single bounded number the ranker gets for one candidate (domain model §3.5). */
export interface PayoffTerm {
    readonly dzId: string;
    /** In `[-1,+1]` BEFORE the caller's cap. */
    readonly term: number;
    readonly basis: 'posterior' | 'unknown-arm' | 'explored';
}
export interface BanditStateEnvelope {
    readonly schemaVersion: number;
    /** Verbatim `LessonBandit.serialize()` output — nested untouched so a re-vendor stays a diff. */
    readonly bandit: SerializedBanditState;
    /** OUR projection. INV-2 lives here: an exposure moves this map and nothing in `bandit`. */
    readonly exposures: Record<string, Record<string, number>>;
    /** OUR projection (ADR-003 §4) — trial impressions, kept separate from confirmed reward. */
    readonly explorePulls: Record<string, Record<string, number>>;
    readonly updatedAt: string;
}
export type BanditLoadReason = 'absent' | 'future-schema' | 'malformed' | `corrupt: ${string}`;
export declare function freshBanditEnvelope(now?: string): BanditStateEnvelope;
/**
 * Read the state envelope. **Never throws** (INV-7): every failure yields a FRESH empty envelope
 * plus an honest `reason`, and recall proceeds with no payoff axis.
 *
 * This function is READ-ONLY — it does not delete, repair, or rename anything. `dz recall` is not
 * the right process to destroy state, and the read path is lock-free (§7.4), so a rename here would
 * race every concurrent recall. Quarantining a corrupt file happens once, inside the WRITE
 * transaction, where a write is expected and the lock is held (see {@link mutateBanditState}).
 */
export declare function loadBanditState(projectRoot: string): {
    readonly state: BanditStateEnvelope;
    readonly reason?: BanditLoadReason;
};
export interface BanditWriteOutcome {
    readonly ok: boolean;
    readonly reason?: string;
}
/**
 * Record a genuine confirmation (ADR-001 D-5). This is the ONLY operation that moves reward mass.
 * Called from `reinforcePattern`'s non-exposure branch, AFTER the store lock is released.
 */
export declare function recordReward(projectRoot: string, event: RewardEvent): BanditWriteOutcome;
/**
 * Record that lessons were merely SEEN (INV-2 / AC-2).
 *
 * ONE locked transaction per RECALL, not per hit (architecture §4) — `limit` transactions per recall
 * would hold the lock far more often than the work justifies.
 *
 * **No engine call happens here, at any reward value, including `0`.** `recordReward(ctx, arm, 0)`
 * adds `beta += 1`: it is evidence the lesson FAILED. Penalising a lesson for being read is the
 * mirror image of the promote-by-view defect this invariant exists to prevent.
 *
 * `exploredDzIds` are the arms that received a trial lift on this recall (ADR-003 §4) — counted in
 * their own projection, never in `alpha`/`beta`, and never touching `qStatus`.
 */
export declare function recordExposures(projectRoot: string, events: readonly ExposureEvent[], exploredDzIds?: readonly string[], meta?: {
    readonly moved?: number;
    readonly arms?: number;
}): BanditWriteOutcome;
export interface PayoffTerms {
    /** Keyed by `dzId`. An arm absent from `armKeys` is NEVER present here (INV-4 / AC-4). */
    readonly terms: ReadonlyMap<string, PayoffTerm>;
    /** `null` when the state loaded cleanly; otherwise the honest degradation reason (§10). */
    readonly reason: BanditLoadReason | null;
    /** Arms with `pulls === 0` — "no measured payoff yet". */
    readonly unknownArms: number;
    /** Arms that received a trial lift on this call (0 unless exploration is armed). */
    readonly explored: readonly string[];
    /** The ids behind `unknownArms`, so a downstream cut can narrow that counter too. */
    readonly unknownDzIds: readonly string[];
}
/**
 * Project the posterior for each arm into a bounded term (ADR-001 D-2). **Lock-free** (§7.4): the
 * writer's final step is a rename, so a reader sees the whole old document or the whole new one,
 * never a partial; a reader that loses the race by microseconds ranks with a state one reward stale,
 * which is a ranking hint, not a fact.
 *
 * ```
 * term = (alpha/(alpha+beta) - 0.5) * 2   ∈ [-1,+1]     when pulls > 0   ('posterior')
 * term = 0                                              when pulls === 0 ('unknown-arm')
 * ```
 * `pulls === 0 ⇒ 0` is the cold start ADR-001 accepts on purpose: no evidence ⇒ no nudge, and
 * crucially no RANDOM lift. `Math.random()` is reached only when `opts.exploration` is true, and
 * then only for a NON-QUARANTINED zero-pull arm (ADR-003 P5/P6) — quarantined lessons are excluded
 * here as a SET RELATION, in addition to the ranker's own arm-list filter upstream.
 *
 * Never throws (NFR-5): any failure yields an empty map plus a reason.
 */
export declare function payoffTermsFor(projectRoot: string, contextKey: string, armKeys: readonly string[], opts?: {
    readonly exploration?: boolean;
    readonly quarantined?: ReadonlySet<string>;
    readonly rng?: () => number;
}): PayoffTerms;
/**
 * The per-query explanation carried on `HybridRecall` when the feature is armed. When disarmed the
 * whole field is ABSENT (not `null`, not `{}`) — its mere presence tells a reader the feature ran.
 */
export interface BanditRecallReport {
    readonly contextKey: string;
    /** POST-cut count: exactly the arms that were reordered and survived to the caller (FR-8/AC-11). */
    readonly armsConsidered: number;
    /** Arms filtered out before the engine ever saw them (INV-3). */
    readonly quarantinedExcluded: number;
    /** `pulls === 0` — no measured payoff yet. */
    readonly unknownArms: number;
    /** Candidates whose position changed against the same ranking WITHOUT the bandit term. */
    readonly moved: number;
    /** Exploration state and how many arms received a trial lift (ADR-003 D5 — a stochastic ranking
     * is never presented as a deterministic one). */
    readonly exploration: boolean;
    readonly explored: number;
    readonly reason: BanditLoadReason | null;
    /** The POST-cut arm ids, so a further truncation downstream can narrow this report honestly. */
    readonly armDzIds: readonly string[];
    readonly movedDzIds: readonly string[];
    /** Ids behind `unknownArms` and `explored`, so a downstream cut narrows EVERY list-dependent
     * counter, not just two of four. */
    readonly unknownDzIds: readonly string[];
    readonly exploredDzIds: readonly string[];
    /** The two rankings `moved` was derived from. Kept because `moved` cannot be narrowed by
     * intersection: whether a SURVIVING candidate still changed position is a fact about the order
     * AFTER the dropped candidates are removed, and only a recomputation can answer it. */
    readonly beforeOrder: readonly string[];
    readonly afterOrder: readonly string[];
}
/**
 * Narrow a report to the hits a caller actually PRINTED. `dz recall` over-fetches under `--domain`
 * and truncates again, so the un-narrowed count would describe a PRE-cut list the reader never saw —
 * the exact dishonesty FR-8/AC-11 names.
 */
export declare function narrowBanditReport(report: BanditRecallReport, shownDzIds: readonly string[]): BanditRecallReport;
export interface BanditHealth {
    readonly present: boolean;
    readonly verdict: 'INSUFFICIENT_DATA' | 'OK';
    readonly reason: BanditLoadReason | null;
    readonly updatedAt: string | null;
    readonly contexts: number;
    readonly armsTotal: number;
    /** Arms with ANY measured payoff (`alpha > 1`). Zero means the payoff axis is empty. */
    readonly armsWithReward: number;
    readonly totalPulls: number;
    readonly totalReward: number;
    readonly exposureTotal: number;
    readonly explorePullTotal: number;
    readonly rewardEvents: number;
    readonly exposureEvents: number;
    readonly banditWriteErrors: number;
    /** Mean `moved / armsConsidered` over logged recalls; `null` when nothing was logged. */
    readonly movedRate: number | null;
}
/** Read-only health snapshot from the state file + `sessions.jsonl`. Never throws. */
export declare function banditStats(projectRoot: string): BanditHealth;
/** Text rendering of {@link banditStats} for `dz compounding`. Pure. */
export declare function renderBanditHealth(h: BanditHealth): string;
//# sourceMappingURL=lesson-payoff.d.ts.map