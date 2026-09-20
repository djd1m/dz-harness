/**
 * Generic native AgentDB indexer — the reusable primitive behind Option C's learnings-mirror
 * AND the book-knowledge-digitizer's KB indexer (ADR-001 v2, `features/book-knowledge-digitizer`).
 *
 * Writes rows NATIVELY via the project's `better-sqlite3`, replicating `ReasoningBank`'s exact
 * schema (`reasoning_patterns` + `pattern_embeddings`, embed text `${taskType}: ${text}`) so the
 * `agentdb` MCP server's `agentdb_pattern_search` reads what we write. `agentdb` is used ONLY for
 * its `EmbeddingService` — never its `createDatabase` (hardwired to sql.js, whose whole-file save
 * corrupts concurrent native-WAL writers; QE P1). Best-effort: never throws, returns an honest
 * error string when the deps are absent.
 *
 * @packageDocumentation
 */
import { type SnapshotRotationReport } from './agentdb-snapshot-rotation.js';
import { type SnapshotMethod } from './agentdb-snapshot.js';
import { type EmbedDtype } from './embedding-config.js';
/** One record to index. `text` is stored as `approach` AND embedded (`${taskType}: ${text}`). */
export interface AgentdbRow {
    readonly taskType: string;
    readonly text: string;
    /** Stored as `success_rate`; clamped to [0,1]. Use the REAL signal, never a fabricated 1.0. */
    readonly score: number;
    readonly tags?: readonly string[];
    readonly metadata?: Record<string, unknown>;
    readonly uses?: number;
    readonly avgReward?: number;
}
/** Outcome of {@link indexPatternsToAgentdb}. `generationBumped`/`generationReason` are present only
 * when a store write actually happened (`indexed > 0`) — FR-4: a failed counter write NEVER fails
 * the indexing call itself, it is only reported so a caller (`dz doctor`, telemetry) can see it.
 *
 * Fix-round 1 (CRITICAL, item 1a): `indexed`/`generationBumped`/`generationReason` and `error` are
 * NOT mutually exclusive. A failure AFTER the row commit (today, only `writeEmbedManifest` throwing)
 * reports the REAL `indexed` count and the REAL bump outcome alongside `error` — it never collapses
 * back to `{indexed: 0, error}` once rows are already on disk. Collapsing to `indexed: 0` after a
 * real commit was the CRITICAL finding: a caller reading `indexed === 0` as "nothing happened" would
 * skip its own rescue-bump logic even though the store had genuinely changed — an under-bump C-1
 * forbids. */
export interface AgentdbIndexResult {
    readonly indexed: number;
    readonly error?: string | undefined;
    readonly generationBumped?: boolean;
    readonly generationReason?: string;
}
/** Resolve the shared store path: explicit opt → AGENTDB_PATH env → `<project>/.dz/agentdb.db`. */
export declare function resolveAgentdbPath(projectRoot: string, dbPath?: string): string;
/**
 * Create (or verify) an EMPTY AgentDB-schema store at `resolveAgentdbPath(projectRoot, dbPath)`,
 * without indexing any rows (AM-4, feature `setup-installs-apply-leg`, dz-harness-hub issue #10
 * defect 4).
 *
 * WHY THIS EXISTS: before this, `.dz/agentdb.db` came into being only as a side effect of the
 * SessionEnd/PreCompact writer's first `dz consolidate` — so a project that had run
 * `dz setup --memory agentdb` but not yet completed one full session had `memory.backend=agentdb`
 * configured with NO database file at all, and any lesson taught in that window before the first
 * consolidate had nothing to mirror into (the apply leg's daemon reads THIS file — see
 * `dz-embed-daemon.mjs`). `dz setup`'s "Install apply-leg" step now calls this directly so the
 * store exists from the moment setup finishes, not from the moment a session happens to end.
 *
 * SYNCHRONOUS deliberately: `runSetup` is a synchronous function (a `child_process.execSync`
 * install already precedes every write it does), and creating an empty schema needs only
 * `better-sqlite3` — never the async `EmbeddingService` {@link indexPatternsToAgentdb} loads for a
 * real write. Reuses {@link REASONING_BANK_SCHEMA} verbatim — the ONE schema string every writer in
 * this module execs — so this path can never drift into declaring a second, competing schema.
 *
 * Best-effort, like every setup step: a project without `better-sqlite3` installed yet (or one
 * whose native binary is unusable) gets `{ok:false, error}` and setup reports it in the step detail
 * rather than throwing — the writer/daemon still self-heal on the next session either way.
 */
export declare function ensureAgentdbSchema(projectRoot: string, dbPath?: string): {
    readonly ok: boolean;
    readonly error?: string;
};
/**
 * FR-2/FR-3 (`store-generation-counter`): the store's write-generation counter, read back. A
 * missing file (a store that predates this feature, or one that has never been written through
 * {@link bumpStoreGeneration}) reads as `0` — the compatibility floor {@link getOrOpenEngine}'s
 * caller compares against, never an error. A corrupt/non-numeric file degrades the same way (best
 * effort — a bad counter must never crash a read path), never a throw. AM-5: the content must match
 * {@link STRICT_GENERATION} exactly — `Number.parseInt`'s leading-digits-only tolerance is NOT used
 * to decide validity, only to convert an already-validated string.
 */
export declare function readStoreGeneration(projectRoot: string, dbPath?: string): number;
/** Fix-round 1, item 5: `String(err)` itself can throw if `err` carries a poisoned `toString` (or
 * `Error.prototype.message` getter). `bumpStoreGeneration`'s "never throws" contract (FR-4) is
 * ABSOLUTE, so every place in this function that turns a caught error into a string goes through
 * this ONE protected helper — never a bare `err instanceof Error ? err.message : String(err)`.
 * Exported test-only (same convention as {@link needsRescueBump}/{@link resetAgentdbEmbedderCache}).
 */
export declare function safeErrorMessage(err: unknown): string;
export declare function bumpStoreGeneration(projectRoot: string, dbPath?: string, 
/** T2: the ONLY signature extension the plan permits — injectable wall clock, default `Date.now`,
 * so AC-3 (a rolled-back system clock) can be reproduced without touching the real clock. */
now?: () => number): {
    readonly ok: true;
    readonly generation: number;
} | {
    readonly ok: false;
    readonly error: string;
};
/**
 * Index `rows` into the shared AgentDB vector store. Returns `{indexed:0}` for an empty input and
 * `{indexed:0, error}` when `agentdb`/`better-sqlite3` cannot be resolved from the project.
 */
export declare function indexPatternsToAgentdb(projectRoot: string, rows: readonly AgentdbRow[], opts?: {
    dbPath?: string;
}): Promise<AgentdbIndexResult>;
/**
 * The RECALL/search default task_types. Deliberately EXCLUDES `dz-backlog`: `dz recall` (and
 * feature-adr Step-0) must never surface raw backlog ideas as if they were earned lessons (ADR-005).
 */
/**
 * The PATTERN scope — the task types a learned-pattern count covers. Exported so `dz vector status`
 * can report a mirrored count comparable to its lexical one; the lifecycle superset below is for
 * ownership, and reporting IT beside a pattern count once led a reader to conclude half the index
 * was orphaned when none of it was.
 */
export declare const DZ_PATTERN_TASK_TYPES: readonly ["dz-teach", "dz-learning"];
/**
 * The dz-owned task_types for LIFECYCLE scans (id enumeration + reindex ownership) — a SUPERSET of
 * the recall default that ALSO owns `dz-backlog` (smart-backlog, ADR-001/005). Reindex must re-embed
 * these on a model bump (else backlog rows rot in a stale embedding space), and id-scans must see them
 * (mirror idempotency). Kept SEPARATE from {@link DZ_TASK_TYPES} so ownership never leaks ideas into
 * lesson recall: search defaults to DZ_TASK_TYPES, lifecycle to DZ_OWNED_TASK_TYPES.
 */
export declare const DZ_OWNED_TASK_TYPES: readonly ["dz-teach", "dz-learning", "dz-backlog"];
/** One semantic hit over the dz rows of the shared store. */
export interface AgentdbSearchHit {
    /** `reasoning_patterns.id` (store-internal). */
    readonly patternId: number;
    /** dz join key from row metadata (`dzId`, falling back to the consolidate mirror's `dreamId`). */
    readonly dzId?: string | undefined;
    readonly text: string;
    /** Cosine similarity vs the embedded query, in [-1, 1]. */
    readonly similarity: number;
    /** The row's stored `success_rate` (the REAL reward at mirror time). */
    readonly score: number;
}
/** Outcome of {@link searchAgentdbPatterns}. Honest: absent deps/store yield `error`, never a throw. */
export interface AgentdbSearchResult {
    readonly hits: AgentdbSearchHit[];
    readonly error?: string | undefined;
}
type Embedder = {
    embed: (t: string) => Promise<Float32Array>;
} | {
    error: string;
};
/** Test-only (and future warm-start) reset — callers (`vector-tier.ts`, `backlog.ts`) are unaffected. */
export declare function resetAgentdbEmbedderCache(): void;
/** `entries` = cached keys right now — a SUCCESSFUL pipeline or an IN-FLIGHT initialization (the promise is
 * cached before it settles, FR-4; a failed one is evicted, FR-3); `initializations` = pipelines actually
 * started since the last reset. (Codex round-1, 2026-09-14: the earlier wording said "successful" only.)
 * `pipelinesBuilt` (fix round 1, F6) = the count of REAL pipeline-construction primitives that actually
 * ran (`pipeline()` or `EmbeddingService.initialize()`), never merely the number of times the resolver
 * was entered — see {@link embedderCachePipelinesBuilt}'s own doc comment for why the two can diverge. */
export declare function getAgentdbEmbedderCacheStats(): {
    entries: number;
    initializations: number;
    pipelinesBuilt: number;
};
/**
 * C-3 (`embed-daemon-memory`): the SAME resolution order the daemon's own `resolveDeps` uses
 * (`.claude/helpers/dz-embed-daemon.mjs`) — project `package.json` first, then `agentdb`'s own
 * declared dependency (possibly hoisted elsewhere) — so core and the daemon agree on which install
 * of transformers they find, in a monorepo or a plain install alike. Each candidate root is
 * confirmed by {@link findAncestorWithModule} BEFORE `require.resolve` is trusted (see its own doc
 * comment for why the plain try/catch this replaced was not safe under this package's test runner).
 *
 * Exported (fix round 1, F4, same convention as {@link safeErrorMessage}/{@link resetAgentdbEmbedderCache}):
 * `embedder-single-owner.test.ts`'s live-dep skip gate needs the SAME resolution order the production
 * code uses to decide, BEFORE running, whether a live embedder failure is a dependency gap (named skip)
 * or a real defect (must fail) — a text-matching heuristic on the error message cannot tell those apart.
 */
export declare function resolveTransformersModule(projectRoot: string): {
    url: string;
} | {
    error: string;
};
/**
 * D2 (`embed-daemon-memory`): the dtype a QUERY/write is embedded with is the STORE's own dtype
 * (its manifest) when the store already exists, falling back to the CONFIGURED dtype only for a
 * store that does not exist yet (its first-ever write picks up the config). This is the ONE place
 * that decision is made — {@link resolveAgentdbEmbedder} calls it so every caller (search, an
 * ordinary incremental index) agrees; `reindexAgentdbRows` is the sole exception (T2/plan): it
 * stamps the manifest with the NEW configured dtype BEFORE it re-embeds, so by the time this
 * function runs during a reindex the manifest already names the new dtype — config and manifest
 * necessarily agree at that point, which is what makes reindex "the one place dtype changes".
 */
export declare function resolveStoreEmbedDtype(projectRoot: string, dbPath?: string): EmbedDtype | {
    error: string;
};
/**
 * Resolve the shared embedder from the PROJECT (same dynamic-resolution discipline as
 * {@link indexPatternsToAgentdb}); every dz call site uses the same resolved model/dtype so query
 * and row vectors stay in the same space. Cached per process — see {@link embedderCache} above.
 *
 * Fix round 1 (F1, doc correction — the prior wording was misleading): `dbPath` is passed straight
 * to {@link resolveStoreEmbedDtype}, which calls {@link resolveAgentdbPath}`(projectRoot, dbPath)` —
 * and THAT function already returns the project's DEFAULT store path (`<project>/.dz/agentdb.db`,
 * or `AGENTDB_PATH`) when `dbPath` is omitted, not "no path". So an omitted `dbPath` still reads the
 * default store's OWN manifest when one exists; the CONFIGURED dtype is used only as the fallback
 * for a store that has no manifest yet (i.e. does not exist, or predates this feature) — never as
 * the default behaviour for "no dbPath given".
 */
export declare function resolveAgentdbEmbedder(projectRoot: string, dbPath?: string): Promise<Embedder>;
/**
 * Cosine similarity in [-1, 1] over two embeddings. Exported (was file-private) so
 * `harmonizeVectorStore` scores near-duplicate pairs with the IDENTICAL math the semantic search
 * path uses — one cosine implementation, no drift between search and harmonize.
 */
export declare function cosineSimilarity(a: Float32Array, b: Float32Array): number;
/**
 * Semantic search over the dz rows of the shared AgentDB store: embed the query, brute-force
 * cosine over `pattern_embeddings` BLOBs (`Float32Array`), top-K. Brute force is deliberate —
 * the pool is O(10²–10³), and a scan has zero index-maintenance/drift risk while the MCP
 * server writes the same file (WAL). READONLY open + `busy_timeout 5000` (ADR R5). Honest:
 * `{hits:[], error}` on any unavailability, never a throw.
 */
export declare function searchAgentdbPatterns(projectRoot: string, query: string, opts?: {
    limit?: number;
    dbPath?: string;
    taskTypes?: readonly string[];
    reindexHint?: string;
}): Promise<AgentdbSearchResult>;
/**
 * READONLY scan of the dz join keys (`metadata.dzId` / `dreamId`) already mirrored into the
 * shared store — the I-5 dedup + `dz vector status` observability primitive. Needs only
 * `better-sqlite3` (no embedder). Honest `{ids:[], error}` on unavailability.
 */
export declare function listAgentdbDzIds(projectRoot: string, opts?: {
    dbPath?: string;
    taskTypes?: readonly string[];
}): Promise<{
    ids: string[];
    error?: string | undefined;
}>;
/**
 * Read the rows that ACTUALLY EXIST IN THE STORE for a task_type, as re-indexable {@link AgentdbRow}s
 * (their stored `approach` text + score/uses/reward/tags/metadata, dzId preserved). This is the correct
 * source for a REINDEX: a reindex re-embeds what is physically in the store to the new model — reading it
 * back from the store (not reconstructing from a sidecar file like ideas.jsonl) means an empty/unreadable
 * sidecar can never leave real store rows un-re-embedded and stale under an advanced manifest (HIGH-G).
 * Readonly, best-effort ({rows:[]} on absent/unavailable), never throws.
 */
export declare function readAgentdbRowsByTaskType(projectRoot: string, taskType: string, opts?: {
    dbPath?: string;
}): {
    rows: AgentdbRow[];
    error?: string;
};
/** One precomputed vector to upsert by its content-addressed `dzId`. */
export interface AgentdbImportRow {
    /** Join key — the canonical `MemoryRecord.id`; the upsert key. */
    readonly dzId: string;
    /** The embedding to store VERBATIM (the checkpoint's space, preserved). */
    readonly vector: Float32Array;
    /** Pattern text (`approach`) — used only when INSERTing a dzId not yet present. */
    readonly text: string;
    readonly taskType: string;
    /** Stored as `success_rate` on insert; clamped to [0,1]. */
    readonly score: number;
    readonly metadata?: Record<string, unknown>;
}
/**
 * UPSERT precomputed vectors into the shared AgentDB store, keyed on `metadata.dzId` — the write
 * half of `dz vector import`. For each row: look up the existing `reasoning_patterns` row for the
 * dzId; if found, REPLACE its `pattern_embeddings` BLOB in place (never a new row); if absent,
 * INSERT both the pattern row (`approach = text`, `metadata.dzId`) and its embedding. The vector is
 * stored VERBATIM. NON-DESTRUCTIVE: only the imported dzIds are inserted/replaced — every other
 * dzId's vector and pattern are left untouched (no blind table overwrite). Idempotent — re-importing
 * the same dzIds REPLACEs in place, adding 0 rows. Same dynamic `better-sqlite3` resolve + WAL +
 * `busy_timeout 5000` as {@link indexPatternsToAgentdb}. Best-effort: honest `{ error }`, never a throw.
 */
export declare function importVectorsToAgentdb(projectRoot: string, rows: readonly AgentdbImportRow[], opts?: {
    dbPath?: string;
}): Promise<{
    imported: number;
    error?: string;
}>;
/**
 * lesson-quarantine: mark mirrored rows as promoted after a promotion — the hook daemon reads ONLY
 * this mirror's metadata, so a promoted lesson must stop being excluded there while retaining its
 * quarantine history. Best-effort, same custody model as {@link bumpAgentdbUses} (missing db/deps ⇒ no-op).
 */
export declare function clearAgentdbQuarantine(projectRoot: string, dzIds: readonly string[], opts?: {
    dbPath?: string;
}): {
    cleared: number;
    error?: string;
};
/**
 * DELETE mirrored rows by `metadata.dzId` (pattern + its embedding), optionally scoped to a task_type
 * set. The write-half of a structured-store removal: when `harmonize --apply` drops ideas from
 * `ideas.jsonl`, their `dz-backlog` vectors must be pruned too, or a later semantic search matches an
 * ORPHAN dzId that no longer has a structured record (smart-backlog HIGH-A). Best-effort, same custody
 * model as {@link clearAgentdbQuarantine} (missing db/deps ⇒ no-op). Never throws.
 */
export declare function deleteAgentdbByDzIds(projectRoot: string, dzIds: readonly string[], opts?: {
    dbPath?: string;
    taskTypes?: readonly string[];
}): {
    deleted: number;
    error?: string;
};
export declare function bumpAgentdbUses(projectRoot: string, dzIds: readonly string[], opts?: {
    dbPath?: string;
    reward?: number;
}): {
    bumped: number;
    error?: string;
};
/**
 * Fix-round 1 (CRITICAL, item 1b — the belt): whether {@link reindexAgentdbRows} must run its own
 * rescue bump, given the DELETE's own observed `changes` count and the nested
 * {@link indexPatternsToAgentdb} call's result. Exported test-only (same convention as
 * {@link resetAgentdbEmbedderCache}) so the DECISION can be exercised directly and deterministically,
 * independent of forcing a real concurrent bump-lock race.
 *
 * `!nestedBumped && (deleteChanges > 0 || indexed.indexed > 0 || indexed.error !== undefined)`:
 * - `deleteChanges > 0` — the DELETE genuinely removed rows; the store changed regardless of the
 *   nested call's outcome.
 * - `indexed.indexed > 0` — the nested call committed rows itself but its OWN bump failed
 *   (`generationBumped: false`) or was never attempted.
 * - `indexed.error !== undefined` — the nested call's post-write state is UNKNOWN (item 1a: an error
 *   here may still carry accurate `indexed`/`generationBumped` facts, but a caller must not assume a
 *   future error path will). C-1: when in doubt, bump — an extra bump only over-invalidates a cache
 *   (safe), a missed one serves stale data (not safe).
 */
export declare function needsRescueBump(deleteChanges: number, indexed: AgentdbIndexResult): boolean;
export declare function reindexAgentdbRows(projectRoot: string, rows: readonly AgentdbRow[], opts?: {
    dbPath?: string;
    taskTypes?: readonly string[];
    backupPath?: string;
    keepSnapshots?: number;
    /** Force the fallback snapshot path — test-only injection for AC-2 (FR-2). */
    snapshotStrategy?: 'vacuum-into' | 'copy+wal';
    /** agentdb-snapshot-lock: test/tuning-only override for the snapshot-lock acquisition deadline
     * — omitted, the lock uses its ordinary default timeout. */
    lockTimeoutMs?: number;
}): Promise<{
    reembedded: number;
    model?: string;
    version?: number;
    backupPath?: string;
    error?: string;
    /** Task types left in the OLD embedding space because this reindex does not own them. */
    staleTaskTypes?: string[];
    /** Pre-reindex snapshot rotation outcome — present ONLY on a successful reindex (FR-6). */
    snapshots?: SnapshotRotationReport;
    /** How the pre-reindex snapshot was actually taken — always named when a snapshot ran (FR-2). */
    snapshotMethod?: SnapshotMethod;
    /** Present only for a fallback method — the reason `vacuum-into` did not run (FR-2). */
    snapshotNote?: string;
    /** AM-3: present whenever a rollback was attempted — 'restored' is the only success signal. */
    rollback?: 'restored' | 'failed';
    /** AM-3: present only when `rollback === 'failed'` — why the restore did not fully complete. */
    rollbackError?: string;
}>;
export {};
//# sourceMappingURL=agentdb-index.d.ts.map