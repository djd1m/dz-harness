/**
 * Vector Tier — the SEMANTIC half of the dz self-learning pattern store
 * (`features/dz-rvf-vector-bridge`, ADR-001 "Option A extended").
 *
 * One PORT ({@link VectorEngine}) with two adapters behind it:
 *
 * - **AgentdbVectorEngine** (default) — reuses the `.dz/agentdb.db` ReasoningBank store the
 *   consolidate Option-C mirror already writes (`agentdb-index.ts`), so semantic recall reads
 *   the vectors that exist today. Zero new dependencies: `agentdb`/`better-sqlite3` are
 *   dynamically resolved from the PROJECT, never imported at module top level.
 * - **RvfVectorEngine** (opt-in, `memory.vector.engine = "rvf"`) — the portable single-file
 *   VECTOR form (`.dz/memory/patterns.rvf` + `.idmap.json`/`.manifest.json` sidecars) via a
 *   lazily imported `@ruvector/rvf`. Never a `dependencies` entry (at most a documentation-only
 *   `peerDependenciesMeta`).
 *
 * HONEST-ERROR CONTRACT (load-bearing, Invariant I-1): every function in this module returns an
 * honest `{ …, error?: string }` receipt and NEVER throws or hangs — engine absence, a failed
 * embed, a locked DB, or a timeout all degrade to today's exact lexical behavior. The lexical
 * store (`patterns.sqlite`/`patterns.json`) is the SOURCE OF TRUTH; the vector tier is a
 * best-effort MIRROR that can be rebuilt from it at any time (`dz consolidate` backfill), and a
 * vector hit whose lexical twin is gone is DROPPED, never resurrected (Invariant V-1).
 *
 * Constraint 7 (QR-10, field-diagnosis discipline): when lexical and vector counts diverge,
 * **rule out local DB corruption before blaming the mirror** — check `dz doctor`'s store health
 * first; the mirror's own divergence line (`dz vector status`) reports BOTH counts plus the
 * `dz consolidate` backfill hint, and is informational, never an error.
 *
 * Both engine calls (read `search` AND write `upsert`/`listIds`) are wall-time bounded
 * ({@link DEFAULT_VECTOR_TIMEOUT_MS}); a write-side timeout (e.g. a first-run embedding-model
 * download) lands the batch in `.dz/mirror-pending.json` and never blocks `dz teach` (NC1).
 *
 * @packageDocumentation
 */
import type { DreamPattern, MemoryRecord } from '@dzhechkov/memory';
import { type PatternRecord, type RecallHit } from './patterns.js';
import { type BanditRecallReport } from './lesson-payoff.js';
/** Which adapter sits behind the port. */
export type VectorEngineKind = 'agentdb' | 'rvf';
/** `memory.vector.engine` config modes (`.dz/config.json`). Absent/corrupt ⇒ `auto`. */
export type VectorEngineMode = 'auto' | 'agentdb' | 'rvf' | 'off';
/** One record on its way into the vector store (the ACL between dz records and engines). */
export interface VectorEntry {
    /** Join key back to the lexical store — the canonical `MemoryRecord.id` (`teach:…`/`dream:…`). */
    readonly dzId: string;
    /** The text that gets embedded (as `${taskType}: ${text}`) and stored. */
    readonly text: string;
    /** REAL reward signal in [0,1] — never a fabricated 1.0. */
    readonly score: number;
    /** ReasoningBank task_type: `dz-teach` for taught patterns, `dz-learning` for consolidate dreams. */
    readonly taskType: string;
    readonly tags?: readonly string[] | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
    readonly uses?: number | undefined;
    readonly avgReward?: number | undefined;
}
/** One semantic search hit — a POINTER into the lexical store, never a pattern by itself. */
export interface VectorHit {
    readonly dzId: string;
    /** Cosine similarity (or engine-native score), higher = closer. */
    readonly similarity: number;
    readonly text?: string | undefined;
}
/** Honest outcome of a mirror attempt. Never thrown — always returned. */
export interface MirrorReceipt {
    /** Entries newly written to the vector store this call. */
    readonly mirrored: number;
    /** Entries skipped by the noise gate or the dzId dedup (already mirrored — I-5). */
    readonly skipped: number;
    /** Entries parked in `.dz/mirror-pending.json` for the next consolidate to heal (I-3). */
    readonly queued: number;
    readonly engine?: VectorEngineKind | undefined;
    readonly error?: string | undefined;
}
/** One precomputed vector to upsert by its content-addressed `dzId` (the `dz vector import` row). */
export interface ImportVectorRow {
    readonly dzId: string;
    readonly vector: Float32Array;
    readonly text: string;
    readonly taskType: string;
    readonly score: number;
    readonly metadata?: Record<string, unknown> | undefined;
}
/** The engine PORT — both adapters implement exactly this surface (04 §4.1). */
/**
 * Is this engine's `similarity` a real cosine, or only good enough to RANK by?
 *
 * `agentdb` computes a magnitude-normalised cosine over the stored vectors, so its number is
 * comparable and lives in the space the recall floors were calibrated in. The `rvf` adapter returns
 * `-distance` — unbounded, and the metric is not established — so its number may only order rows.
 * Printing it beside a 0.38 cosine floor would hand the reader a figure that looks calibrated and is
 * not; that is the one lie this feature must not tell (ADR, features/recall-true-closeness).
 */
export type SimilarityKind = 'cosine' | 'rank-only';
export interface VectorEngine {
    readonly kind: VectorEngineKind;
    /** Absent means `rank-only`: an engine must SAY its number is a cosine to have it shown as one. */
    readonly similarityKind?: SimilarityKind;
    upsert(entries: readonly VectorEntry[]): Promise<{
        indexed: number;
        error?: string | undefined;
    }>;
    search(query: string, limit: number): Promise<{
        hits: VectorHit[];
        error?: string | undefined;
    }>;
    listIds(): Promise<{
        ids: string[];
        error?: string | undefined;
    }>;
    /**
     * Ids of the PATTERN scope only — the task types `lexicalMirrorable` counts. Optional: an engine
     * that cannot narrow reports nothing and the caller degrades to `orphaned: undefined`, never to a
     * fabricated zero. Exists because `listIds()` deliberately enumerates the OWNED SUPERSET, which
     * also holds `dz-backlog` ideas — and reporting that number beside a pattern-only count once led a
     * reader to conclude half the index was orphaned when none of it was (ADR-001).
     */
    listPatternIds?(): Promise<{
        ids: string[];
        error?: string | undefined;
    }>;
    /** Portable single-file checkpoint (RVF adapter only — `dz vector export`). */
    exportCheckpoint?(dest: string): Promise<{
        error?: string | undefined;
    }>;
    /**
     * Write precomputed `{ dzId, vector }` rows by id (`dz vector import`) — UPSERT-BY-dzId, never a
     * blind whole-store overwrite. Optional (like {@link VectorEngine.exportCheckpoint}): an engine
     * that cannot take a precomputed vector reports an honest reason; import degrades, never throws.
     */
    importVectors?(rows: readonly ImportVectorRow[]): Promise<{
        imported: number;
        error?: string | undefined;
    }>;
}
/** Outcome of {@link resolveVectorEngine}: an engine, or an honest reason why not. */
export interface ResolvedVectorEngine {
    readonly engine?: VectorEngine | undefined;
    readonly reason?: string | undefined;
}
/** Recall mode: `hybrid` (default), `semantic` (`--semantic`, 2× vector weight), `lexical` (`--no-semantic`). */
export type HybridRecallMode = 'hybrid' | 'semantic' | 'lexical';
/** One merged recall hit (RRF-scored). `pattern` ALWAYS comes from the lexical store (V-1). */
export interface HybridHit {
    readonly pattern: PatternRecord;
    readonly backend: RecallHit['backend'];
    /** Reciprocal-rank-fusion score (ranking only — NOT the pattern's reward). */
    readonly score: number;
    /** lesson-quarantine: set only for a quarantined hit — display marks ⚠q, ranking was damped. */
    readonly quarantined?: boolean;
    /**
     * Raw closeness from the semantic leg, when the engine reports a genuine cosine. ABSENT for a
     * lexical-only hit and for an engine whose score is not a cosine — the honest display there is a
     * dash, never a substitute number. On a `both` hit this is the SEMANTIC leg's cosine, which
     * explains less of the ordering than it may appear to: the list is ranked by RRF plus learning
     * signals, not by this.
     */
    readonly similarity?: number;
}
/** Outcome of {@link recallHybrid}. With no engine this is content-identical to `recallPatterns`. */
export interface HybridRecall {
    readonly hits: HybridHit[];
    readonly lexicalBackend: 'sqlite' | 'json';
    readonly vectorEngine: VectorEngineKind | 'none';
    /** Why the vector tier did not participate (engine absent / disabled). */
    readonly vectorReason?: string | undefined;
    /** Engine was present but the search failed/timed out — lexical results returned instead. */
    readonly vectorError?: string | undefined;
    /**
     * How many candidates the engine RETURNED for this query. Zero on every lexical-only path.
     *
     * This and `semanticRanked` exist so the OUTPUT can state what the run did instead of what the
     * config allows. Every false claim this feature removed came from deriving a statement about the
     * run from `vectorEngine !== 'none'`, which is engine RESOLVABILITY (ADR-001).
     */
    readonly semanticCandidates: number;
    /**
     * How many of those candidates survived the orphan drop and entered the merge — the honest test of
     * "did a vector rank anything". It can be 0 while `semanticCandidates` is positive: an engine that
     * returns only ids the lexical store no longer has has participated in nothing.
     */
    readonly semanticRanked: number;
    /**
     * The bandit payoff explanation (feature lesson-bandit-rerank, FR-8/AC-11) — PRESENT only when
     * `memory.learning.banditRerank` is armed, ABSENT otherwise (not `null`, not `{}`): its mere
     * presence tells a reader the feature ran. `armsConsidered` describes the POST-cut list, and
     * `moved` — the honest headline — counts the candidates whose position the term actually changed.
     * An armed, silent re-ranker is indistinguishable from a broken one, which is why this exists.
     */
    readonly bandit?: BanditRecallReport | undefined;
    /** Present ONLY when `deferExposures` was requested and the bandit ran. Call it with the ids the
     * caller actually printed; until it is called, no exposure has been recorded for this recall. */
    readonly commitExposures?: ((shownDzIds: readonly string[]) => void) | undefined;
}
/**
 * How many of `mirrorable` are absent from the mirror, given the set of ids the mirror and the
 * pending queue account for.
 *
 * A record counts as mirrored under EITHER key, because there are two write seams and they do NOT
 * agree: `patternVectorEntry` (teach) writes the CONTENT-addressed `patternRecordId`, while
 * `memoryRecordVectorEntry` (backfill/dream) writes the record's own `r.id`. MEASURED on the real
 * store (2026-08-22): 270 of 272 records have the same value for both, and the 2 that differ — a
 * `dream:` record and one re-keyed teach record — are mirrored under their OWN id. Joining on the
 * derived key alone reported them as an unpaid debt and advised a reindex with nothing to do.
 *
 * Pure and exported so the divergent case is testable without a store: a `dream:`-prefixed id can
 * never equal `patternRecordId`, which always yields `teach:<hash>`.
 */
export declare function countUnmirrored(mirrorable: readonly MemoryRecord[], accounted: ReadonlySet<string>): number;
/** Field observability for `dz vector status` (I-2/I-5 in the field). */
export interface VectorTierStatus {
    readonly mode: VectorEngineMode;
    readonly kind?: VectorEngineKind | undefined;
    readonly available: boolean;
    readonly reason?: string | undefined;
    readonly embeddingModel?: string | undefined;
    readonly lexicalTotal: number;
    readonly lexicalMirrorable: number;
    /**
     * How many MIRRORABLE RECORDS are in the vector store, counted in the same scope
     * `lexicalMirrorable` counts — so the two may be read as a pair.
     *
     * `undefined` when the engine cannot report per-scope counts: under the narrower meaning this
     * field now carries, the unnarrowed store total is NOT an answer to the question it asks.
     */
    readonly mirrored?: number | undefined;
    readonly pending: number;
    /**
     * Whether the mirror WRITER is enabled — `vectorMirrorEnabled()`'s own answer, reported separately
     * from `available`, which is about the ENGINE. Conflating the two is what let an unconfigured
     * project print a fully-healthy status line over a dead writer (ADR-001).
     */
    readonly mirrorWriterEnabled: boolean;
    /** WHY it is on or off — so the surface printing it cannot invent a cause (see mirrorWriterReason). */
    readonly mirrorWriterState: MirrorWriterState;
    /**
     * Vectors of OTHER dz-owned task types (today: `dz-backlog`). Reported separately so a store of N
     * vectors can be fully accounted for, and never folded into `mirrored`, which must stay comparable
     * to `lexicalMirrorable`. `undefined` when the engine cannot narrow its listing.
     */
    readonly mirroredOther?: number | undefined;
    /**
     * Pattern-scope vectors matching NO record under either key — the real meaning of "orphan", and
     * until this feature nothing computed it. `undefined` when the engine cannot narrow its listing.
     */
    readonly orphaned?: number | undefined;
    /**
     * Mirrorable records present in NEITHER the mirror NOR the pending queue — an exact set difference
     * over ids, so an orphan vector can never make it negative.
     *
     * The name is deliberately `unmirrored`, not `unqueued`: the difference proves only that a record
     * is not in the mirror NOW. A vector that was written and later deleted, or a pending entry that
     * was cleared, is indistinguishable from one never offered — so claiming "never queued" would
     * overstate what was measured (raised by cross-family review, 2026-08-22).
     *
     * `undefined` means UNKNOWN — no engine, or an engine whose `listIds()` failed. It never means zero.
     */
    readonly unmirrored?: number | undefined;
}
/** Wall-time bound applied to EVERY engine call, read and write legs alike (ADR R1 + NC1). */
export declare const DEFAULT_VECTOR_TIMEOUT_MS = 10000;
/** Default cosine cutoff for near-duplicate clustering (`--threshold` / config overrides). */
export declare const DEFAULT_HARMONIZE_THRESHOLD = 0.92;
export declare const REINFORCE_RRF_CAP: number;
/**
 * The bandit payoff term's bound (ADR-001 D-2). Deliberately the SAME constant the reinforcement and
 * SAFLA-delta terms use, not a new one: it keeps the "a learning signal is worth less than one RRF
 * rank step" invariant those terms already established, and makes the joint excursion of two payoff
 * terms auditable as exactly `2 × CAP`. Payoff reorders near-ties; it cannot overturn a real
 * relevance gap.
 */
export declare const BANDIT_RRF_CAP: number;
/** One record in the harmonize pool — a lexical-store record mapped to its dzId + reward + ts. */
export interface HarmonizeItem {
    readonly dzId: string;
    readonly text: string;
    readonly reward: number;
    readonly ts: string;
    readonly taskType: string;
}
/** One near-duplicate cluster: the surviving keeper + the members that would be / were dropped. */
export interface HarmonizeCluster {
    readonly keep: {
        readonly dzId: string;
        readonly text: string;
        readonly reward: number;
        readonly ts: string;
    };
    readonly drops: readonly {
        readonly dzId: string;
        readonly text: string;
        readonly reward: number;
        readonly cos: number;
    }[];
}
/** Outcome of {@link harmonizeVectorStore}. */
export interface HarmonizeReport {
    readonly mode: 'dry-run' | 'apply';
    /** Resolved engine kind, or `'none'` when there is no engine. */
    readonly engine: string;
    /** True when semantic dedup was unavailable and the store was harmonized by EXACT text only. */
    readonly fellBackToExact: boolean;
    readonly threshold: number;
    readonly clusters: readonly HarmonizeCluster[];
    /** Number of clusters (size ≥ 2) — one keeper survives per cluster. */
    readonly kept: number;
    /** Total non-keeper members (previewed in dry-run, removed on `--apply`). */
    readonly dropped: number;
    /** Singleton (non-duplicate) patterns — NEVER touched. */
    readonly unique: number;
    /** Backup path written before an `--apply` drop (restorable via `dz teach --from-json`). */
    readonly backupPath?: string | undefined;
    /** Honest reason on failure (e.g. a backup write failed and the drop was aborted). */
    readonly error?: string | undefined;
}
/** Options for {@link harmonizeVectorStore}. */
export interface HarmonizeOptions extends VectorServiceOptions {
    /** Perform the drop (default `false` — dry-run previews and writes nothing). */
    readonly apply?: boolean | undefined;
    /** Cosine cutoff in `(0, 1]`; overrides config + the {@link DEFAULT_HARMONIZE_THRESHOLD} default. */
    readonly threshold?: number | undefined;
    /**
     * Inject an embedder (tests): a function ⇒ semantic path with these embeddings; `null` ⇒ force the
     * exact-text fallback; `undefined` ⇒ resolve the project's agentdb embedder.
     */
    readonly embed?: ((text: string) => Promise<Float32Array>) | null | undefined;
}
/** Outcome of {@link importRvfCheckpoint}. */
export interface ImportReport {
    /** Vectors upserted by dzId (new + replaced). */
    readonly imported: number;
    /** Source dzIds skipped because no local pattern exists (text must be imported first). */
    readonly skippedOrphans: number;
    /** Resolved target engine kind, or `'none'`. */
    readonly engine: string;
    /** The source `.rvf` path. */
    readonly source: string;
    readonly error?: string | undefined;
}
/** Options for {@link importRvfCheckpoint}. */
export interface ImportOptions extends VectorServiceOptions {
    /** Inject the source `{ dzId, vector }` rows (tests) — bypasses the `.rvf`/idmap file reads. */
    readonly sourceRows?: readonly {
        readonly dzId: string;
        readonly vector: Float32Array;
    }[] | undefined;
    /** Inject an embedder (tests) for the local-text re-embed; else the project's agentdb embedder. */
    readonly embed?: ((text: string) => Promise<Float32Array>) | undefined;
}
export interface ReindexVectorReport {
    readonly reembedded: number;
    readonly model?: string;
    readonly version?: number;
    readonly backupPath?: string;
    readonly error?: string;
    /**
     * Task types this reindex does NOT own, whose vectors therefore remain in the previous embedding
     * space (e.g. `book-knowledge`, rebuilt by `dz brain reindex`). Safe — every read path filters by
     * task type, so no query compares across spaces — but the caller must SAY SO rather than leave it
     * silent, since a mixed store looks healthy right up until someone widens a query.
     */
    readonly staleTaskTypes?: readonly string[];
    /**
     * smart-backlog honest-skip status. Set ONLY on the non-agentdb-engine path: backlog code never touches
     * the shared manifest, so under a non-agentdb engine NOTHING is reindexed — `backlog:'skipped'` +
     * `generic:'skipped'` + a non-empty `error` say so (overall success is never claimed). Unset on the full
     * agentdb reindex path (which owns and re-embeds dz-backlog together with the other types) — behavior for
     * every other caller is unchanged.
     */
    readonly backlog?: 'skipped';
    readonly generic?: 'skipped';
}
export type TeachGuardResult = {
    readonly action: 'teach';
    readonly reason?: string;
} | {
    readonly action: 'reinforce';
    readonly dzId: string;
    readonly cosine: number;
};
/**
 * Bound `promise` to `ms` wall-clock milliseconds. On timeout, resolve with `onTimeout()`
 * instead — the underlying operation keeps running detached (its eventual write is later
 * deduplicated by dzId), but the CALLER's latency is bounded. A rejection also resolves via
 * `onTimeout()` (honest-error contract: this wrapper never throws). The timer is cleared /
 * unref'd so a fast path never keeps the process alive.
 */
export declare function withVectorTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T>;
/** Text that must never be embedded: bare-approval echoes + tool telemetry (V-3 / ADR-002). */
export declare function isVectorNoise(text: string): boolean;
/**
 * ACL: taught {@link PatternRecord} → {@link VectorEntry}. Returns `undefined` for noise (the
 * ingest gate — I-6). Score is the record's REAL reward, never a fabricated 1.0.
 */
export declare function patternVectorEntry(p: PatternRecord, source?: string, opts?: {
    quarantined?: boolean;
}): VectorEntry | undefined;
/**
 * ACL: harvested {@link DreamPattern} → {@link VectorEntry}. Byte-compatible with the
 * pre-feature consolidate mirror rows (same task_type `dz-learning`, same tags, `dreamId`
 * preserved in metadata — NFR-7); `dzId` is additive.
 */
export declare function dreamVectorEntry(d: DreamPattern): VectorEntry | undefined;
/** ACL: stored {@link MemoryRecord} → {@link VectorEntry} (the consolidate-backfill mapper). */
export declare function memoryRecordVectorEntry(r: MemoryRecord): VectorEntry | undefined;
/** Read `memory.vector.engine` from `.dz/config.json`. Absent/corrupt ⇒ `auto` (never throws). */
export declare function readVectorEngineMode(projectRoot: string): VectorEngineMode;
/**
 * Read `memory.vector.harmonizeThreshold` from `.dz/config.json`. Absent/corrupt/out-of-range ⇒
 * {@link DEFAULT_HARMONIZE_THRESHOLD} (never throws). `--threshold` overrides this at the call site.
 */
export declare function readHarmonizeThreshold(projectRoot: string): number;
/**
 * Should `dz teach` attempt the best-effort vector mirror at all? True when the project opted
 * into the agentdb memory backend (`memory.backend === 'agentdb'`, the same gate consolidate
 * uses — D3) or explicitly configured a vector engine. A fresh, unconfigured project returns
 * `false`, so its `dz teach` output stays byte-identical to the pre-feature baseline (AC-1).
 */
export declare function vectorMirrorEnabled(projectRoot: string): boolean;
/** Why the mirror writer is on or off — a CLOSED set, so a caller cannot invent a cause. */
export type MirrorWriterState = 'on'
/** No `.dz/config.json` at all — an unconfigured project, which is the normal quiet case. */
 | 'no-config'
/** The config exists but could not be read or parsed. */
 | 'config-unreadable'
/** The config is readable and simply does not enable a mirror. */
 | 'not-enabled'
/** The config explicitly turns the vector tier off. */
 | 'engine-off';
/**
 * The mirror writer's state AND its real cause.
 *
 * Every failure used to collapse into `false`, and the one message printed above it named ONE
 * specific cause: "no memory.backend=agentdb". MEASURED 2026-08-24 with a config that sets
 * `memory.vector.engine: "off"` — the status line correctly said OFF and then blamed a setting the
 * config did not mention. A diagnosis that names the wrong cause sends the reader to fix something
 * that is not broken, which is worse than saying nothing.
 */
export declare function mirrorWriterReason(projectRoot: string): {
    enabled: boolean;
    state: MirrorWriterState;
};
/** The sentence a reader can act on, for each state. */
export declare function mirrorWriterExplanation(state: MirrorWriterState): string;
export declare function resolveVectorEngine(projectRoot: string): ResolvedVectorEngine;
/** Options shared by the mirror/recall services. `engine: null` force-disables (tests). */
export interface VectorServiceOptions {
    readonly engine?: VectorEngine | null | undefined;
    readonly timeoutMs?: number | undefined;
}
/**
 * Mirror prepared {@link VectorEntry}s into the vector store — **the single write seam** that
 * teach, `teach --from-json`, consolidate, and the backfill all route through (QR-6). The
 * lexical write is ALWAYS already durable before this runs (I-3). Semantics:
 *
 * 1. noise-gate the entries (I-6), merge with the pending queue (dedup by dzId),
 * 2. nothing to do ⇒ `{mirrored:0}` with NO error and no queue file,
 * 3. engine absent ⇒ park the batch in the queue + honest reason (heals on the next consolidate),
 * 4. dedup against `engine.listIds()` (I-5 idempotency — a re-mirror adds 0 rows),
 * 5. time-bounded `engine.upsert` (NC1); failure/timeout ⇒ queue + `sessions.jsonl` note.
 *
 * NEVER throws; the caller's exit code is unaffected by any outcome here (I-1).
 */
export declare function mirrorEntriesToVector(projectRoot: string, entries: readonly VectorEntry[], opts?: VectorServiceOptions): Promise<MirrorReceipt>;
/** Convenience seam for taught patterns: ACL-map + delegate to {@link mirrorEntriesToVector}. */
export declare function mirrorPatternsToVector(projectRoot: string, patterns: readonly PatternRecord[], source?: string, opts?: VectorServiceOptions): Promise<MirrorReceipt>;
/**
 * Eventual consistency (FR-2): diff `lexical dzIds ∖ engine.listIds()` and mirror the missing
 * set (bounded batch) + drain the pending queue. Run by `dz consolidate` after the watermark
 * write, so a teach-time mirror failure heals on the next consolidate (AC-3). Engine absent ⇒
 * silent no-op (the absent tier is a state, not an error).
 */
export declare function backfillVectorMirror(projectRoot: string, opts?: VectorServiceOptions & {
    readonly batchLimit?: number | undefined;
}): Promise<MirrorReceipt>;
/** One ranked pattern feeding the RRF merge (exported so the merge is unit-testable pure). */
export interface RankedPattern {
    readonly id: string;
    readonly pattern: PatternRecord;
    readonly backend: RecallHit['backend'];
    /**
     * The semantic leg's raw closeness, when the engine reports a real cosine. Rides ALONGSIDE the RRF
     * score and never enters the ranking maths — four things depend on RRF magnitude (the reinforce
     * cap, quarantine damping, the learning uplift, and an ADR-level note in backlog.ts), so this is a
     * sibling field, never a repurposing.
     */
    readonly similarity?: number;
}
/**
 * Reciprocal Rank Fusion merge: `score(p) = Σ 1/(60 + rank)` over the lists containing `p`
 * (semantic ranks weighted by `semanticWeight`). Dedup by id; `backend: 'both'` when a pattern
 *
 * Ordering: fused score, then EVIDENCE (`both` before lexical-only before semantic-only), then id.
 * When `semanticWeight > 1` the lexical top-1 is guaranteed a place in the result, taken from the
 * last seat unless that seat holds a `both` hit. See `features/semantic-keeps-exact-hits`.
 *
 * appears in both lists. DETERMINISTIC (AC-6): ties break on id, so fixed inputs always yield
 * the same ordering. Pure — no I/O.
 */
export declare function mergeHybridHits(lexical: readonly RankedPattern[], semantic: readonly RankedPattern[], opts: {
    readonly limit: number;
    readonly semanticWeight?: number | undefined;
}): HybridHit[];
/**
 * Hybrid recall (FR-3): lexical `recallPatterns` FIRST (always, sync, UNCHANGED — AC-5), then a
 * time-bounded semantic leg merged via RRF. Degradation contract (I-1): with no engine — or on
 * any engine error/timeout — the returned hits are CONTENT-IDENTICAL to plain `recallPatterns`
 * output, with the honest `vectorReason`/`vectorError` alongside. A vector hit whose dzId no
 * longer resolves in the lexical store is DROPPED (V-1 — pruned patterns never resurrect, QR-4).
 */
export declare function recallHybrid(projectRoot: string, query: string, opts?: VectorServiceOptions & {
    readonly limit?: number | undefined;
    readonly mode?: HybridRecallMode | undefined;
    /** Defer bandit EXPOSURE recording to the caller (default false ⇒ byte-identical to today).
     * A caller that over-fetches and truncates again — `dz recall --domain` does — must set this and
     * then call `commitExposures(shownDzIds)`, or hits nobody ever saw are counted as seen. */
    readonly deferExposures?: boolean | undefined;
    /**
     * The resolved recall domain (the axis `dz recall --domain` already boosts on). It becomes the
     * bandit's ContextKey (FR-5) — coarse on purpose, so posteriors accumulate instead of every arm
     * sitting at `pulls === 0` forever. Absent ⇒ `general`; it changes nothing while disarmed.
     */
    readonly domain?: string | undefined;
}): Promise<HybridRecall>;
export declare function teachGuard(projectRoot: string, text: string, opts?: VectorServiceOptions & {
    readonly reward?: number | undefined;
    readonly threshold?: number | undefined;
}): Promise<TeachGuardResult>;
/** Field observability: engine availability + mirrored-vs-lexical counts + queue size. */
export declare function vectorTierStatus(projectRoot: string, opts?: VectorServiceOptions): Promise<VectorTierStatus>;
export declare function reindexVectorStore(projectRoot: string, opts?: VectorServiceOptions): Promise<ReindexVectorReport>;
/**
 * Deterministic keeper INDEX within a near-dup cluster (a TOTAL order over fixed inputs — NFR-7):
 * (1) highest reward → (2) longer / more-specific text → (3) newer `ts` → (4) `dzId` (stable
 * final tiebreak). Pure — no I/O. The keeper survives; the other members are the drop set.
 */
export declare function selectClusterKeeper(members: readonly HarmonizeItem[]): number;
/**
 * SEMANTIC dedup of the learned-pattern store (`dz vector harmonize` / `dz teach --harmonize`) —
 * **NON-DESTRUCTIVE by contract**. Finds near-duplicate PAIRS via pairwise cosine over the embedder
 * both adapters share (θ default {@link DEFAULT_HARMONIZE_THRESHOLD}), union-finds them into clusters,
 * and within each cluster KEEPs the highest-signal member ({@link selectClusterKeeper}), dropping the
 * rest. Modes:
 *
 * - **dry-run (default)**: previews the clusters and returns — writes NOTHING (the store is
 *   byte-identical after).
 * - **`--apply`**: writes a restorable backup FIRST (`.dz/memory/patterns.pre-harmonize.json`); a
 *   failed backup ABORTS the drop (no partial mutation). Then removes the non-keepers from BOTH
 *   lexical tiers via {@link removePatternsByIds}. A UNIQUE (singleton) pattern is NEVER a drop.
 *
 * Degrades honestly: with no engine/embedder it falls back to EXACT-text dedup + a `fellBackToExact`
 * note, exits without throwing (dry-run still writes nothing). Reversal: `dz teach --from-json <backup>`.
 */
export declare function harmonizeVectorStore(projectRoot: string, opts?: HarmonizeOptions): Promise<HarmonizeReport>;
/**
 * Ingest an external `.rvf` checkpoint's vectors into THIS project's vector store, **UPSERT-BY-dzId,
 * NON-DESTRUCTIVE** (`dz vector import <file.rvf>`). The `.idmap.json` sidecar is the dzId authority
 * (the shipped `@ruvector/rvf` SDK exposes no vector read-out — see rUv `rvf-backend-blocker.md`), so
 * for each checkpoint dzId that exists in the LOCAL lexical store the vector is reproduced by
 * re-embedding the local text (D7 — under the manifest guard the same model over the same text yields
 * the checkpoint's vector) and upserted by dzId via {@link VectorEngine.importVectors}. dzIds absent
 * locally are ORPHANS — skipped + counted (their text must be imported first via `dz teach --from-json`).
 *
 * Non-destructive: only the imported dzIds are inserted/replaced; re-importing the same file adds 0
 * duplicates and deletes nothing. A model/dim manifest mismatch is REFUSED (no cross-space merge). All
 * failure modes return an honest `{ error }`, never a throw.
 */
export declare function importRvfCheckpoint(projectRoot: string, source: string, opts?: ImportOptions): Promise<ImportReport>;
interface RvfStoreHandle {
    ingest: (id: string, vec: Float32Array) => Promise<unknown> | unknown;
    query: (vec: Float32Array, k: number) => Promise<unknown> | unknown;
    close?: (() => Promise<void> | void) | undefined;
    exportCheckpoint?: ((dest: string) => Promise<unknown> | unknown) | undefined;
}
/**
 * Open a `@ruvector/rvf` store, pinned to the REAL published SDK surface (grounded in
 * ruvector/npm/packages/rvf/src/index.ts + a live linux-x64 smoke against @ruvector/rvf@0.2.3):
 * the canonical class is `RvfDatabase` with `create(path, { dimensions })` → `ingestBatch([{id,
 * vector}])` → `query(vector, k)` returning `[{ id, distance }]` → `close()`. A few tolerant
 * fallbacks (add/insert, search) keep older/alt shapes working; anything unrecognized returns an
 * HONEST error (the D8 no-go evidence), never a throw. NOTE: RVF stores the vector under the `id`
 * we pass (= the dzId), so no slot↔id mapping is needed — the query result's `id` IS the dzId.
 */
export declare function openRvfStore(mod: Record<string, unknown>, path: string, dimensions: number): Promise<RvfStoreHandle | {
    error: string;
}>;
export {};
//# sourceMappingURL=vector-tier.d.ts.map