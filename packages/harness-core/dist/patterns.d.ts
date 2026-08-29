/**
 * Learn-loop read path — the synchronous reader that closes the write-only
 * "learn" loop (audit finding #2).
 *
 * `dz teach` writes {@link PatternRecord} lines to `.dz/patterns.jsonl` and the
 * session hooks write {@link SessionRecord} lines to `.dz/sessions.jsonl`, but
 * nothing read them back. This module is that read half: it loads the records
 * (graceful + retention-trimmed) and turns matching patterns into a bounded,
 * monotonic ranking boost for `recommend()`.
 *
 * Design constraints (see features/wire-learn-loop/):
 * - **Synchronous** — keeps `recommend()` sync (no Promise/async ripple).
 * - **No `@dzhechkov/memory` import** — Tier 1 is dependency-free by design.
 * - **Graceful** — absent/empty/corrupt store yields `[]` / zero boost, never throws.
 * - **Shared schema** — {@link PatternRecord}/{@link SessionRecord} are the single
 *   source of truth, imported by the writers (`cmdTeach`, session hooks) so a
 *   field rename is a compile error, not a silently re-muted loop.
 *
 * @packageDocumentation
 */
import { type MemoryRecord, type DreamPattern } from '@dzhechkov/memory';
/** A learned pattern as written by `dz teach` to `.dz/patterns.jsonl`. */
export interface PatternRecord {
    /** The pattern / rule text. */
    readonly pattern: string;
    /** Classification: actionable rule, a success pattern, or a lesson learned. */
    readonly type: 'rule' | 'success-pattern' | 'lesson-learned';
    /** Reward signal in [0, 1]. */
    readonly reward: number;
    /** Domain tag (e.g. "performance", "api", "general"). */
    readonly domain: string;
    /** ISO-8601 timestamp the record was written. */
    readonly ts: string;
    /** Origin of the record (e.g. "dz-teach"). */
    readonly source: string;
}
/** A session lifecycle event as written by the session hooks to `.dz/sessions.jsonl`. */
export interface SessionRecord {
    /** Session lifecycle event. */
    readonly event: 'start' | 'end';
    /** ISO-8601 timestamp. */
    readonly ts: string;
    /** Set when the record was written via the agentdb-backend hook's JSONL fallback. */
    readonly backend?: 'agentdb';
}
/** Maximum total boost a learned-pattern set can add to one skill's score. */
export declare const BOOST_CAP = 50;
/** Store backend selection mode (Tier-3). */
export type SqliteBackendMode = 'auto' | 'json' | 'sqlite';
/** Resolved learning config from `.dz/config.json` (defaults applied). */
export interface LearningConfig {
    /** Days to keep records at read time; `0` = keep forever. */
    readonly retentionDays: number;
    /** Whether `recommend()` should apply the learned-pattern boost. Absent ⇒ true. */
    readonly recommendBoost: boolean;
    /** Store backend: `auto` = SQLite if available else JSON; `json`/`sqlite` force. Absent ⇒ `auto`. */
    readonly sqliteBackend: SqliteBackendMode;
}
export interface MemoryLearningConfig {
    readonly backend: 'native' | 'off' | 'ruvector-gnn';
    readonly onRecallHits: boolean;
    readonly usesSat: number;
    readonly halfLifeDays: number;
    readonly reinforceThreshold: number;
    /**
     * SAFLA delta re-rank (rUv-scout #2 Phase 3). When true, recall blends each lesson's payoff SLOPE
     * (from its reinforce history) into the re-rank as a bounded ± term — rising lessons nudge up, stale
     * ones nudge down. Default FALSE: absent config is byte-identical to the reinforce-only re-rank.
     */
    readonly deltaRerank: boolean;
    /**
     * Lesson quarantine (feature lesson-quarantine, ADR-001). When true, a freshly taught lesson is
     * a HYPOTHESIS, not knowledge: marked `qStatus: 'quarantined'`, excluded from the auto-inject
     * hook, damped + ⚠q-marked in interactive recall, and promoted only by an EARNED signal
     * (reinforce or an explicit `dz recall --promote`). Default FALSE: absent config is
     * byte-identical to today.
     */
    readonly quarantine: boolean;
    /** Interactive-recall rank damp for quarantined hits, (0,1]; default 0.5. */
    readonly quarantineDamp: number;
    /** Days after which an unreinforced quarantined lesson is an EXPIRY CANDIDATE (informational). */
    readonly quarantineExpireDays: number;
    /**
     * Bandit payoff re-rank (feature lesson-bandit-rerank, ADR-001). When true, recall adds a BOUNDED
     * term derived from each lesson's measured payoff posterior — "has this lesson ever actually
     * helped", the axis similarity cannot answer. ADDITIVE alongside {@link deltaRerank}, never a
     * replacement, and capped at the same `REINFORCE_RRF_CAP`: similarity still decides WHICH lessons
     * are candidates; the bandit only reorders WITHIN them. Default FALSE: absent config is
     * byte-identical to today — no file read, no file written, no term applied.
     */
    readonly banditRerank: boolean;
    /**
     * Bandit EXPLORATION (feature lesson-bandit-rerank, ADR-003). When true, an arm with no evidence
     * may receive a bounded trial lift so it can accumulate some. This deliberately weakens the
     * view-does-not-promote posture, so it SHIPS DISARMED and is a separate flag: enabling payoff
     * re-ranking must never silently mean "start surfacing unproven lessons". Quarantined lessons are
     * NEVER explored in any configuration. Default FALSE; `true` with `banditRerank: false` is a
     * warned no-op.
     */
    readonly banditExploration: boolean;
}
/**
 * Read the `learning` block of `.dz/config.json`, applying defaults. Never throws —
 * a missing or corrupt config yields the defaults (retention 90d, boost on, store auto).
 */
export declare function readLearningConfig(projectRoot: string): LearningConfig;
export declare function readMemoryLearningConfig(projectRoot: string): MemoryLearningConfig;
/** Options for the loaders (clock is injectable so retention is testable). */
export interface LoadOptions {
    /** "Now" in epoch ms used for the retention window. Defaults to `Date.now()`. */
    readonly now?: number;
}
/**
 * Load taught patterns from `.dz/patterns.jsonl`. Graceful (absent ⇒ `[]`),
 * per-line corruption-tolerant, drops out-of-range rewards, and applies the
 * configured retention window at read time (never mutates the file on disk).
 */
export declare function loadPatterns(projectRoot: string, opts?: LoadOptions): PatternRecord[];
/**
 * Load session lifecycle events from `.dz/sessions.jsonl`. Same I/O discipline
 * as {@link loadPatterns}; retention applied for consistency.
 */
export declare function loadSessions(projectRoot: string, opts?: LoadOptions): SessionRecord[];
/**
 * Compute the ranking boost a set of learned patterns contributes to one skill.
 *
 * Monotonic (≥ 0 — only ever raises a skill's score) and bounded by
 * {@link BOOST_CAP}, so a large `patterns.jsonl` nudges but never dominates or
 * inverts keyword scoring. An empty pattern set yields exactly `0` — the
 * graceful invariant that keeps `recommend()` deterministic when memory is empty.
 */
export declare function computePatternBoost(skillId: string, description: string, patterns: readonly PatternRecord[]): number;
/**
 * Public alias of the deterministic store id for a taught pattern — the vector tier's dzId
 * join key (D4/V-2): the SAME content always maps to the SAME id, so a re-mirror dedups to 0.
 */
export declare function patternRecordId(p: PatternRecord): string;
/** Public alias of {@link patternIdentity} — the logical-identity key the hybrid merge dedups on. */
export declare function patternIdentityOf(p: PatternRecord): string;
/** Anti-corruption mapping: harness `PatternRecord` → canonical `MemoryRecord`. */
export declare function patternToRecord(p: PatternRecord): MemoryRecord;
/** Anti-corruption mapping: canonical `MemoryRecord` → harness `PatternRecord`. */
export declare function recordToPattern(r: MemoryRecord): PatternRecord;
/**
 * Quarantine state of a learned record (feature lesson-quarantine, ADR-001). Carried in the SAME
 * record metadata as reinforcement state — no schema migration, no second store. ABSENCE of the
 * field = promoted (every pre-feature record is grandfathered), and AM-1 fail-safe points TOWARD
 * knowledge: any unparseable/unknown `qStatus` reads as promoted — a metadata glitch must never
 * isolate a proven lesson (the conservative side here is NOT quarantining).
 */
export interface QuarantineState {
    readonly quarantined: boolean;
    readonly quarantinedAt?: string;
}
export declare function readQuarantineState(r: MemoryRecord): QuarantineState;
export declare function encodeQuarantineState(ts: string): Record<string, string>;
export interface ReinforcementState {
    readonly uses: number;
    readonly lastUsedTs?: string;
    readonly avgReward: number;
    readonly mergedFrom: readonly string[];
}
export declare function readReinforcementState(r: MemoryRecord): ReinforcementState;
export declare function encodeReinforcementState(state: ReinforcementState): Record<string, string>;
/**
 * Read every unified-store record WITH its canonical store id (`teach:…`/`dream:…`) — the
 * vector tier's backfill diff + dzId→record resolution surface. Graceful: `[]` on any failure.
 */
export declare function loadStoreRecords(projectRoot: string): MemoryRecord[];
export interface ReinforcePatternResult {
    readonly ok: boolean;
    readonly dzId?: string;
    readonly uses?: number;
    readonly error?: string;
    /** The reward value actually observed for this reinforcement, clamped to [0,1]. */
    readonly reward?: number;
}
export declare function reinforcePattern(projectRoot: string, dzIdOrText: string, opts?: {
    reward?: number;
    ts?: string;
    mergedFrom?: readonly string[];
    exposure?: boolean;
    domain?: string;
}): Promise<ReinforcePatternResult>;
export declare function updateReinforcementState(projectRoot: string, dzId: string, state: ReinforcementState): Promise<ReinforcePatternResult>;
/** Result of a promotion (dz recall --promote). */
export interface PromoteResult {
    readonly ok: boolean;
    readonly promoted: readonly string[];
    readonly notFound: readonly string[];
    readonly notQuarantined: readonly string[];
    readonly error?: string;
}
/**
 * FR-6b: EXPLICIT promotion — lift quarantine from the named records. The other earned path is
 * reinforcement ({@link reinforcePattern} clears the state as part of confirming the lesson).
 * There is deliberately NO exposure-based auto-promotion: `uses` grows from recall HITS, and
 * promoting by exposure would be a self-fulfilling prophecy (ADR).
 */
export declare function promotePatterns(projectRoot: string, dzIds: readonly string[]): Promise<PromoteResult>;
/** One quarantined-and-stale record, surfaced for review (informational — FR-7). */
export interface QuarantineExpiryCandidate {
    readonly dzId: string;
    readonly text: string;
    readonly quarantinedAt: string;
    readonly ageDays: number;
}
/**
 * FR-7 (informational-first, per the recalled decay-vs-noise lesson): quarantined records older
 * than `expireDays` with ZERO reinforcement are EXPIRY CANDIDATES — reported, never auto-deleted.
 * Deletion happens only through {@link pruneQuarantinePatterns} (explicit, snapshotted).
 */
export declare function quarantineExpiryCandidates(projectRoot: string, expireDays: number, now?: Date): QuarantineExpiryCandidate[];
/**
 * Destructive half of expiry — a SEPARATE, explicit gate (never coupled to --prune-noise; AM-3).
 * Dry-run by default; a live run snapshots the store first ({@link snapshotStore}) then removes
 * exactly the expiry candidates via {@link removePatternsByIds}.
 */
export declare function pruneQuarantinePatterns(projectRoot: string, opts: {
    dryRun?: boolean;
    expireDays: number;
    now?: Date;
}): {
    candidates: QuarantineExpiryCandidate[];
    removed: number;
    snapshot?: string;
    error?: string;
};
export interface StoreStats {
    readonly total: number;
    readonly perDomain: Record<string, number>;
    readonly topUses: readonly {
        dzId: string;
        uses: number;
        pattern: string;
        domain: string;
        reward: number;
    }[];
    readonly exactDupGroups: number;
    readonly reinforceEvents: number;
    readonly teachEvents: number;
}
/** One lesson's slope row in the delta report. */
export interface LessonDeltaRow {
    readonly dzId: string;
    readonly pattern: string;
    readonly domain: string;
    readonly delta: number;
    readonly pruneCandidate: boolean;
}
/** SAFLA-delta ranking over the store's reinforce history. INFORMATIONAL — deletes nothing (ADR-001). */
export interface LessonDeltaReport {
    /** Lessons with the strongest positive payoff slope (still paying off), highest first. */
    readonly rising: readonly LessonDeltaRow[];
    /** Lessons whose slope is ≤ 0 with enough history to judge — stale prune CANDIDATES (never deleted here). */
    readonly stale: readonly LessonDeltaRow[];
    /** How many lessons had ≥ 2 reinforce events (enough to compute a slope). */
    readonly scored: number;
}
/** {@link lessonDeltaReport}: top rising + stale prune-candidates (informational, deletes nothing). */
export declare function lessonDeltaReport(projectRoot: string, opts?: {
    topN?: number;
}): LessonDeltaReport;
/** dzId → payoff-slope delta, for the recall re-rank (Phase 3). Only lessons with slope signal appear. */
export declare function lessonDeltaMap(projectRoot: string): Map<string, number>;
export declare function storeStats(projectRoot: string): StoreStats;
/** Read the unified store as `PatternRecord[]`. Graceful — any failure yields `[]`. */
export declare function loadStorePatternsSync(projectRoot: string): PatternRecord[];
/**
 * Persist a taught pattern to the unified store (async — runs in `dz teach`).
 * Routes through the selected backend (SQLite when available, else JSON — the
 * cascade). On first write it idempotently folds the legacy `.dz/patterns.jsonl`
 * AND any existing JSON store into the chosen backend (deterministic ids ⇒ no
 * duplicates), so migrating JSON→SQLite never loses or doubles a record, and the
 * JSON file is never deleted. Returns the total record count after the write.
 */
export declare function recordPattern(projectRoot: string, p: PatternRecord, opts?: {
    quarantine?: boolean;
}): Promise<number>;
/** Outcome of a {@link recallPatterns} ranked search (or a hybrid merge — see `vector-tier.ts`). */
export interface RecallHit {
    /** The matched pattern. */
    readonly pattern: PatternRecord;
    /**
     * Backend that produced the ranking: `sqlite` = FTS5, `json` = keyword overlap;
     * `vector`/`both` appear ONLY in `recallHybrid` output (`recallPatterns` itself never
     * emits them — it stays the sync lexical baseline, AC-5).
     */
    readonly backend: 'sqlite' | 'json' | 'vector' | 'both';
    /** lesson-quarantine: set (true) only for a quarantined hit — display marks it ⚠q and ranking damps/sinks it. */
    readonly quarantined?: boolean;
}
/**
 * Ranked recall over the store (Tier-3): SQLite **FTS5** full-text ranking when
 * available, else JSON keyword-overlap. The synchronous CLI analogue of semantic
 * recall — note it is *lexical*, not vector similarity (true embedding/HNSW recall
 * lives in the `agentdb-memory` MCP skill, MCP-host only). Graceful: `[]` on failure.
 */
export declare function recallPatterns(projectRoot: string, query: string, limit?: number): RecallHit[];
/** Where transcripts come from when `--sessions-dir` isn't given. */
export type SessionsSource = 'explicit' | 'dz-sessions' | 'claude-transcripts' | 'none';
/**
 * Deterministic id for a harvested dream pattern — keyed by its content, NOT by
 * `Date.now()` (as the package's `dreamPatternToRecord` is). Re-consolidating the
 * same transcripts is therefore an idempotent upsert, never a duplicate.
 */
export declare function dreamRecordId(d: DreamPattern): string;
/** Outcome of a {@link consolidateSessions} run. */
export interface ConsolidateResult {
    /** Directory scanned for transcripts. */
    readonly sessionsDir: string;
    /** How `sessionsDir` was chosen (explicit flag, .dz/sessions, or auto-discovered host transcripts). */
    readonly source: SessionsSource;
    /** Patterns harvested from the transcripts this run. */
    readonly harvested: number;
    /** Records newly added to the store (idempotent re-runs add 0). */
    readonly added: number;
    /** New watermark (max processed timestamp), or the prior one if nothing harvested. */
    readonly watermark: string | undefined;
    /** Learnings mirrored into the AgentDB vector index this run (Option C; 0 when mirroring is off/unavailable). */
    readonly mirrored: number;
    /** Why mirroring was skipped or partial (honest label; undefined when fully mirrored or intentionally off). */
    readonly mirrorError?: string | undefined;
}
/** Options for {@link consolidateSessions}. */
export interface ConsolidateOptions {
    /** Transcript directory to scan. When omitted, auto-discovered (`.dz/sessions`, then the host Claude-Code transcript dir). */
    readonly sessionsDir?: string;
    /**
     * Mirror this run's harvested learnings into the AgentDB vector index (Option C, ADR-003).
     * Default: auto — mirrors when `.dz/config.json` says `memory.backend === 'agentdb'` and the
     * project has `agentdb` + `better-sqlite3` installed. Pass `false` to disable (`--no-mirror`).
     */
    readonly mirrorAgentdb?: boolean;
}
/** Dreams that carry a GENUINE reusable reward signal — the vector-mirror ingest gate.
 * Excludes (a) tool-use telemetry ("Tool X invoked during session", hardcoded score) and
 * (b) every insight `isNoiseInsight` rejects — notably bare-approval checkpoint echoes
 * ("ok", "продолжай"), which are reward signal, not a recallable pattern. Mirroring either
 * would recreate the pollution ADR-002 eliminated, so it is filtered at INGEST here — not
 * merely swept later by the retro-prune (scout #3). Exported: the vector tier's text-level
 * gate (`isVectorNoise` in `vector-tier.ts`) applies the identical predicate. */
export declare function isMirrorableLearning(d: DreamPattern): boolean;
/** Outcome of a {@link pruneNoisePatterns} run. */
export interface PruneNoiseResult {
    /** Records removed from the lexical store (SQLite tier + JSON tier, summed). Counted, not removed, on a dry run. */
    readonly lexicalRemoved: number;
    /** Rows removed from the AgentDB vector mirror (`reasoning_patterns` + their embeddings). Counted, not removed, on a dry run. */
    readonly vectorRemoved: number;
    /** `true` ⇒ nothing was deleted; the counts and `candidates` describe what a live run WOULD delete. */
    readonly dryRun?: boolean;
    /** Exactly which records matched — the receipt. Present in both modes. */
    readonly candidates?: readonly {
        readonly id: string;
        readonly text: string;
    }[];
    /** Honest reason when part of the prune could not run (best-effort — never throws). */
    readonly error?: string;
}
/**
 * RETRO-PRUNE of learning-store noise. Removes records the OLD harvester wrote before the
 * noise gate existed — tool-invocation telemetry and system-wrapper "user responses", as
 * defined by `isNoiseInsight` from `@dzhechkov/memory` (the shared prune contract) — from:
 *
 * 1. the **lexical** store (the same SQLite/JSON tiers `loadPatterns`/`consolidateSessions`
 *    use — both tiers are swept, since a migrated store can hold copies in each), and
 * 2. the **vector** mirror (`.dz/agentdb.db` `reasoning_patterns` rows with
 *    `task_type = 'dz-learning'`, plus their `pattern_embeddings`).
 *
 * Best-effort and idempotent: any tier that can't be pruned contributes an honest `error`
 * instead of throwing; a re-run removes 0.
 */
export declare function pruneNoisePatterns(projectRoot: string, opts?: {
    dryRun?: boolean;
}): PruneNoiseResult;
/** Outcome of {@link removePatternsByIds}. */
export interface RemovePatternsResult {
    /** Records removed across the SQLite + JSON tiers (summed). */
    readonly removed: number;
    /** Honest reason when a tier could not be swept (best-effort — never throws). */
    readonly error?: string;
}
/**
 * Remove store records by an EXPLICIT set of store ids ({@link patternRecordId}/`MemoryRecord.id`),
 * across BOTH lexical tiers — byte-for-byte the {@link pruneNoisePatterns} sweep, but keyed on an
 * id set instead of the `isNoiseInsight` predicate. This is harmonize `--apply`'s drop path: only
 * the named ids are touched; keepers and singletons are never removed. Best-effort and idempotent
 * (a re-run over an already-removed set removes 0); an empty/unknown set is a no-op. Never throws.
 */
export declare function removePatternsByIds(projectRoot: string, ids: ReadonlySet<string>): RemovePatternsResult;
/** Outcome of {@link snapshotStore}. */
export interface SnapshotStoreResult {
    /** Where the snapshot was written. */
    readonly path: string;
    /** Number of patterns captured. */
    readonly count: number;
    /** Honest reason on failure — the caller (harmonize `--apply`) aborts the drop when set. */
    readonly error?: string;
}
/**
 * Write a restorable, `dz recall --all --json`-shaped snapshot of the WHOLE lexical store to
 * `dest` (a `PatternRecord[]` JSON array — the exact input `dz teach --from-json` consumes). This
 * is harmonize `--apply`'s pre-mutation BACKUP: a failed snapshot returns `{ error }` so the caller
 * aborts the drop and never leaves a partial mutation. Restore with `dz teach --from-json <dest>`
 * (exact-text dedup re-adds only the dropped rows; survivors are skipped). Never throws.
 */
export declare function snapshotStore(projectRoot: string, dest: string): SnapshotStoreResult;
export declare function consolidateSessions(projectRoot: string, opts?: ConsolidateOptions): Promise<ConsolidateResult>;
//# sourceMappingURL=patterns.d.ts.map