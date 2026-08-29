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

import { existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
// The backlog dedup embed form (PURE, zero-dep — no cycle): dz-backlog rows must be embedded in the
// SAME bounded form the dedup query uses, including through the reindex path.
import { BACKLOG_TASK_TYPE, dedupEmbedText } from './backlog-embed.js';
import {
  currentEmbedManifest,
  guardEmbedSpace,
  readEmbedManifest,
  resolveEmbedModel,
  writeEmbedManifest,
} from './embedding-config.js';

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

/** Outcome of {@link indexPatternsToAgentdb}. */
export interface AgentdbIndexResult {
  readonly indexed: number;
  readonly error?: string | undefined;
}

interface NativeDb {
  pragma: (s: string) => void;
  exec: (s: string) => void;
  prepare: (q: string) => {
    run: (...a: unknown[]) => { lastInsertRowid: number | bigint };
    get: (...a: unknown[]) => unknown;
  };
  transaction: <T>(fn: (...a: unknown[]) => T) => (...a: unknown[]) => T;
  close: () => void;
}

/** Resolve the shared store path: explicit opt → AGENTDB_PATH env → `<project>/.dz/agentdb.db`. */
export function resolveAgentdbPath(projectRoot: string, dbPath?: string): string {
  if (dbPath !== undefined && dbPath !== '') return dbPath;
  const env = process.env['AGENTDB_PATH'];
  return env !== undefined && env !== '' ? env : join(projectRoot, '.dz', 'agentdb.db');
}

/** ReasoningBank's schema, verbatim — so the MCP server reads exactly what we insert. */
const REASONING_BANK_SCHEMA = `CREATE TABLE IF NOT EXISTS reasoning_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER DEFAULT (strftime('%s', 'now')),
  task_type TEXT NOT NULL,
  approach TEXT NOT NULL,
  success_rate REAL NOT NULL DEFAULT 0.0,
  uses INTEGER DEFAULT 0,
  avg_reward REAL DEFAULT 0.0,
  tags TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_patterns_task_type ON reasoning_patterns(task_type);
CREATE INDEX IF NOT EXISTS idx_patterns_success_rate ON reasoning_patterns(success_rate);
CREATE INDEX IF NOT EXISTS idx_patterns_uses ON reasoning_patterns(uses);
CREATE TABLE IF NOT EXISTS pattern_embeddings (
  pattern_id INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL,
  FOREIGN KEY (pattern_id) REFERENCES reasoning_patterns(id) ON DELETE CASCADE
);`;

/**
 * Index `rows` into the shared AgentDB vector store. Returns `{indexed:0}` for an empty input and
 * `{indexed:0, error}` when `agentdb`/`better-sqlite3` cannot be resolved from the project.
 */
export async function indexPatternsToAgentdb(
  projectRoot: string,
  rows: readonly AgentdbRow[],
  opts: { dbPath?: string } = {},
): Promise<AgentdbIndexResult> {
  if (rows.length === 0) return { indexed: 0 };
  let sqliteUrl: string;
  let agentdbDir: string;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
    agentdbDir = dirname(req.resolve('agentdb'));
  } catch {
    return { indexed: 0, error: 'agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)' };
  }
  try {
    const { default: Database } = (await import(sqliteUrl)) as { default: new (p: string) => NativeDb };
    const { EmbeddingService } = (await import(pathToFileURL(join(agentdbDir, 'controllers', 'EmbeddingService.js')).href)) as {
      EmbeddingService: new (o: object) => { initialize: () => Promise<void>; embed: (t: string) => Promise<Float32Array> };
    };
    const model = resolveEmbedModel(projectRoot);
    if ('error' in model) return { indexed: 0, error: model.error };
    const emb = new EmbeddingService({
      model: model.model,
      dimension: model.dim,
      provider: 'transformers',
      // agentdb >= 3.0.0-alpha.20 refuses UNREGISTERED models without an explicit role policy
      // (its built-in registry knows all-MiniLM-L6-v2 but not our multilingual variant — grounded
      // in dist/src/controllers/EmbeddingService.js:53). paraphrase-multilingual-MiniLM is a
      // SYMMETRIC sentence-transformer (no query/passage instruction prefixes), so the policy is
      // {kind:'symmetric'} — the same one the registry assigns its own symmetric models. On
      // alpha.18 the extra field is ignored; without it alpha.20 threw and the vector tier fell
      // to lexical SILENTLY (mirror writes answered {indexed:0, error} — measured 2026-08-24).
      rolePolicy: { kind: 'symmetric' },
    } as never);
    await emb.initialize();

    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
      db.exec(REASONING_BANK_SCHEMA);
      const guard = guardEmbedSpace({
        storePath: dbFile,
        configured: model,
        hasRows: embeddingRowCount(db) > 0,
        reindexHint: 'dz vector reindex',
      });
      if (!guard.ok) return { indexed: 0, error: guard.error };
      const insPattern = db.prepare('INSERT INTO reasoning_patterns (task_type, approach, success_rate, uses, avg_reward, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const insEmb = db.prepare('INSERT OR REPLACE INTO pattern_embeddings (pattern_id, embedding) VALUES (?, ?)');
      // Embeddings are async (can't run inside better-sqlite3's sync transaction) — compute them
      // ALL first, then commit the writes atomically (QE P2: a mid-loop failure must not leave a
      // partial batch reported as indexed:0).
      const prepared: Array<{ row: AgentdbRow; vec: Float32Array }> = [];
      // dz-backlog rows use the BOUNDED dedup embed form (backlog-embed.ts) — the same form the
      // dedup query and `mirrorIdeaVector` use, so a `dz vector reindex` lands backlog rows in the
      // space they are queried in. Every other task type keeps the classic `${taskType}: ${text}`.
      for (const row of rows) {
        const embedText = row.taskType === BACKLOG_TASK_TYPE ? dedupEmbedText(row.text) : `${row.taskType}: ${row.text}`;
        prepared.push({ row, vec: await emb.embed(embedText) });
      }
      const commit = db.transaction(() => {
        for (const { row, vec } of prepared) {
          const r = insPattern.run(
            row.taskType,
            row.text,
            Math.max(0, Math.min(1, Number.isFinite(row.score) ? row.score : 0)),
            Number.isFinite(row.uses) ? Math.max(0, Math.floor(row.uses ?? 0)) : 0,
            Number.isFinite(row.avgReward) ? Math.max(0, Math.min(1, row.avgReward ?? 0)) : 0.0,
            row.tags ? JSON.stringify(row.tags) : null,
            row.metadata ? JSON.stringify(row.metadata) : null,
          );
          insEmb.run(Number(r.lastInsertRowid), Buffer.from(vec.buffer));
        }
        return prepared.length;
      });
      const indexed = commit() as number;
      writeEmbedManifest(dbFile, currentEmbedManifest(model, guard.manifest.version, 'agentdb'));
      return { indexed };
    } finally {
      db.close();
    }
  } catch (err) {
    return { indexed: 0, error: `index failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ------------------------------------------------------------------ */
/*  READ half (dz-rvf-vector-bridge FR-3): semantic search + id scan   */
/* ------------------------------------------------------------------ */

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
export const DZ_PATTERN_TASK_TYPES = ['dz-teach', 'dz-learning'] as const;
const DZ_TASK_TYPES = DZ_PATTERN_TASK_TYPES;

/**
 * The dz-owned task_types for LIFECYCLE scans (id enumeration + reindex ownership) — a SUPERSET of
 * the recall default that ALSO owns `dz-backlog` (smart-backlog, ADR-001/005). Reindex must re-embed
 * these on a model bump (else backlog rows rot in a stale embedding space), and id-scans must see them
 * (mirror idempotency). Kept SEPARATE from {@link DZ_TASK_TYPES} so ownership never leaks ideas into
 * lesson recall: search defaults to DZ_TASK_TYPES, lifecycle to DZ_OWNED_TASK_TYPES.
 */
export const DZ_OWNED_TASK_TYPES = ['dz-teach', 'dz-learning', 'dz-backlog'] as const;

/** Minimal READONLY better-sqlite3 surface used by the read half. */
interface ReadonlyDb {
  pragma: (s: string) => void;
  prepare: (q: string) => { all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown };
  close: () => void;
}

type ReadonlyDbCtor = new (p: string, o?: { readonly?: boolean }) => ReadonlyDb;

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

const DEPS_MISSING = 'agentdb/better-sqlite3 not installed in project (run: dz setup --memory agentdb)';

/**
 * Resolve agentdb's `EmbeddingService` from the PROJECT (same dynamic-resolution discipline as
 * {@link indexPatternsToAgentdb}); every dz call site uses the same resolved model so query and row
 * vectors stay in the same space.
 */
export async function resolveAgentdbEmbedder(
  projectRoot: string,
): Promise<{ embed: (t: string) => Promise<Float32Array> } | { error: string }> {
  let agentdbDir: string;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    agentdbDir = dirname(req.resolve('agentdb'));
  } catch {
    return { error: DEPS_MISSING };
  }
  try {
    const { EmbeddingService } = (await import(pathToFileURL(join(agentdbDir, 'controllers', 'EmbeddingService.js')).href)) as {
      EmbeddingService: new (o: object) => { initialize: () => Promise<void>; embed: (t: string) => Promise<Float32Array> };
    };
    const model = resolveEmbedModel(projectRoot);
    if ('error' in model) return { error: model.error };
    const emb = new EmbeddingService({
      model: model.model,
      dimension: model.dim,
      provider: 'transformers',
      // agentdb >= 3.0.0-alpha.20 refuses UNREGISTERED models without an explicit role policy
      // (its built-in registry knows all-MiniLM-L6-v2 but not our multilingual variant — grounded
      // in dist/src/controllers/EmbeddingService.js:53). paraphrase-multilingual-MiniLM is a
      // SYMMETRIC sentence-transformer (no query/passage instruction prefixes), so the policy is
      // {kind:'symmetric'} — the same one the registry assigns its own symmetric models. On
      // alpha.18 the extra field is ignored; without it alpha.20 threw and the vector tier fell
      // to lexical SILENTLY (mirror writes answered {indexed:0, error} — measured 2026-08-24).
      rolePolicy: { kind: 'symmetric' },
    } as never);
    await emb.initialize();
    return { embed: (t: string) => emb.embed(t) };
  } catch (err) {
    return { error: `embedder init failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** `absent: true` = no store file yet — an EMPTY mirror is a state, not an error (backfill relies on this). */
function openReadonly(projectRoot: string, dbPath?: string): { db: ReadonlyDb } | { absent: true } | { error: string } {
  const dbFile = resolveAgentdbPath(projectRoot, dbPath);
  if (!existsSync(dbFile)) return { absent: true };
  let Database: ReadonlyDbCtor;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as ReadonlyDbCtor;
  } catch {
    return { error: DEPS_MISSING };
  }
  try {
    const db = new Database(dbFile, { readonly: true }); // WAL readers are safe next to the MCP server
    db.pragma('busy_timeout = 5000');
    return { db };
  } catch (err) {
    return { error: `open failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function hasDzTables(db: ReadonlyDb): boolean {
  const t = (name: string): boolean =>
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
  return t('reasoning_patterns') && t('pattern_embeddings');
}

function embeddingRowCount(db: { prepare: (q: string) => { get: (...a: unknown[]) => unknown } }): number {
  const row = db.prepare('SELECT COUNT(*) AS n FROM pattern_embeddings').get() as { n?: unknown } | undefined;
  return typeof row?.n === 'number' ? row.n : 0;
}

/**
 * Cosine similarity in [-1, 1] over two embeddings. Exported (was file-private) so
 * `harmonizeVectorStore` scores near-duplicate pairs with the IDENTICAL math the semantic search
 * path uses — one cosine implementation, no drift between search and harmonize.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i += 1) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function dzIdOf(metadataJson: unknown): string | undefined {
  if (typeof metadataJson !== 'string' || metadataJson === '') return undefined;
  try {
    const meta = JSON.parse(metadataJson) as Record<string, unknown>;
    const id = meta['dzId'] ?? meta['dreamId'] ?? meta['kuId'] ?? meta['ku_id'];
    return typeof id === 'string' ? id : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Semantic search over the dz rows of the shared AgentDB store: embed the query, brute-force
 * cosine over `pattern_embeddings` BLOBs (`Float32Array`), top-K. Brute force is deliberate —
 * the pool is O(10²–10³), and a scan has zero index-maintenance/drift risk while the MCP
 * server writes the same file (WAL). READONLY open + `busy_timeout 5000` (ADR R5). Honest:
 * `{hits:[], error}` on any unavailability, never a throw.
 */
export async function searchAgentdbPatterns(
  projectRoot: string,
  query: string,
  opts: { limit?: number; dbPath?: string; taskTypes?: readonly string[]; reindexHint?: string } = {},
): Promise<AgentdbSearchResult> {
  const limit = Math.max(1, opts.limit ?? 10);
  const opened = openReadonly(projectRoot, opts.dbPath);
  if ('absent' in opened) return { hits: [] }; // nothing mirrored yet — zero semantic hits, honestly
  if ('error' in opened) return { hits: [], error: opened.error };
  const { db } = opened;
  try {
    if (!hasDzTables(db)) return { hits: [] };
    const taskTypes = opts.taskTypes ?? DZ_TASK_TYPES;
    const placeholders = taskTypes.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `SELECT p.id, p.approach, p.success_rate, p.metadata, e.embedding
         FROM reasoning_patterns p JOIN pattern_embeddings e ON e.pattern_id = p.id
         WHERE p.task_type IN (${placeholders})`,
      )
      .all(...taskTypes) as Array<{ id: number; approach: string; success_rate: number; metadata: string | null; embedding: Buffer }>;
    const model = resolveEmbedModel(projectRoot);
    if ('error' in model) return { hits: [], error: model.error };
    const guard = guardEmbedSpace({
      storePath: resolveAgentdbPath(projectRoot, opts.dbPath),
      configured: model,
      hasRows: rows.length > 0,
      reindexHint: opts.reindexHint ?? 'dz vector reindex',
    });
    if (!guard.ok) return { hits: [], error: guard.error };
    const emb = await resolveAgentdbEmbedder(projectRoot);
    if ('error' in emb) return { hits: [], error: emb.error };
    let qvec: Float32Array;
    try {
      qvec = await emb.embed(query);
    } catch (err) {
      return { hits: [], error: `query embed failed: ${err instanceof Error ? err.message : String(err)}` };
    }
    const scored: AgentdbSearchHit[] = rows.map((r) => {
      const vec = new Float32Array(r.embedding.buffer, r.embedding.byteOffset, Math.floor(r.embedding.byteLength / 4));
      return {
        patternId: r.id,
        dzId: dzIdOf(r.metadata),
        text: r.approach,
        similarity: cosineSimilarity(qvec, vec),
        score: r.success_rate,
      };
    });
    scored.sort((a, b) => b.similarity - a.similarity || a.patternId - b.patternId);
    return { hits: scored.slice(0, limit) };
  } catch (err) {
    return { hits: [], error: `search failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
}

/**
 * READONLY scan of the dz join keys (`metadata.dzId` / `dreamId`) already mirrored into the
 * shared store — the I-5 dedup + `dz vector status` observability primitive. Needs only
 * `better-sqlite3` (no embedder). Honest `{ids:[], error}` on unavailability.
 */
export async function listAgentdbDzIds(
  projectRoot: string,
  opts: { dbPath?: string; taskTypes?: readonly string[] } = {},
): Promise<{ ids: string[]; error?: string | undefined }> {
  const opened = openReadonly(projectRoot, opts.dbPath);
  if ('absent' in opened) return { ids: [] }; // empty mirror — everything is backfillable
  if ('error' in opened) return { ids: [], error: opened.error };
  const { db } = opened;
  try {
    if (!hasDzTables(db)) return { ids: [] };
    // LIFECYCLE scan ⇒ the OWNED superset (incl. dz-backlog) so idea ids are visible for mirror
    // idempotency + `dz vector status`. Recall/search still defaults to the narrower DZ_TASK_TYPES.
    const taskTypes = opts.taskTypes ?? DZ_OWNED_TASK_TYPES;
    const placeholders = taskTypes.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT metadata FROM reasoning_patterns WHERE task_type IN (${placeholders})`)
      .all(...taskTypes) as Array<{ metadata: string | null }>;
    const ids = new Set<string>();
    for (const r of rows) {
      const id = dzIdOf(r.metadata);
      if (id !== undefined) ids.add(id);
    }
    return { ids: [...ids] };
  } catch (err) {
    return { ids: [], error: `id scan failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
}

/**
 * Read the rows that ACTUALLY EXIST IN THE STORE for a task_type, as re-indexable {@link AgentdbRow}s
 * (their stored `approach` text + score/uses/reward/tags/metadata, dzId preserved). This is the correct
 * source for a REINDEX: a reindex re-embeds what is physically in the store to the new model — reading it
 * back from the store (not reconstructing from a sidecar file like ideas.jsonl) means an empty/unreadable
 * sidecar can never leave real store rows un-re-embedded and stale under an advanced manifest (HIGH-G).
 * Readonly, best-effort ({rows:[]} on absent/unavailable), never throws.
 */
export function readAgentdbRowsByTaskType(
  projectRoot: string,
  taskType: string,
  opts: { dbPath?: string } = {},
): { rows: AgentdbRow[]; error?: string } {
  const opened = openReadonly(projectRoot, opts.dbPath);
  if ('absent' in opened) return { rows: [] };
  if ('error' in opened) return { rows: [], error: opened.error };
  const { db } = opened;
  try {
    if (!hasDzTables(db)) return { rows: [] };
    const raw = db
      .prepare('SELECT approach, success_rate, uses, avg_reward, tags, metadata FROM reasoning_patterns WHERE task_type = ?')
      .all(taskType) as Array<{ approach: string; success_rate: number; uses: number; avg_reward: number; tags: string | null; metadata: string | null }>;
    const rows: AgentdbRow[] = raw.map((r) => {
      let metadata: Record<string, unknown> | undefined;
      if (typeof r.metadata === 'string' && r.metadata !== '') {
        try {
          const m = JSON.parse(r.metadata) as unknown;
          if (m !== null && typeof m === 'object') metadata = m as Record<string, unknown>;
        } catch {
          /* drop unparseable metadata */
        }
      }
      let tags: string[] | undefined;
      if (typeof r.tags === 'string' && r.tags !== '') {
        try {
          const t = JSON.parse(r.tags) as unknown;
          if (Array.isArray(t)) tags = t.filter((x): x is string => typeof x === 'string');
        } catch {
          /* drop unparseable tags */
        }
      }
      return {
        taskType,
        text: r.approach,
        score: r.success_rate,
        uses: r.uses,
        avgReward: r.avg_reward,
        ...(tags !== undefined ? { tags } : {}),
        ...(metadata !== undefined ? { metadata } : {}),
      };
    });
    return { rows };
  } catch (err) {
    return { rows: [], error: `row scan failed: ${err instanceof Error ? err.message : String(err)}` };
  } finally {
    db.close();
  }
}

/* ------------------------------------------------------------------ */
/*  IMPORT half (dz-vector-harmonize-import M0.4): upsert-by-dzId       */
/* ------------------------------------------------------------------ */

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

/** Minimal better-sqlite3 surface the upsert path uses (run + get + transaction). */
interface UpsertDb {
  pragma: (s: string) => void;
  exec: (s: string) => void;
  prepare: (q: string) => {
    run: (...a: unknown[]) => { lastInsertRowid: number | bigint };
    get: (...a: unknown[]) => unknown;
  };
  transaction: <T>(fn: () => T) => () => T;
  close: () => void;
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
export async function importVectorsToAgentdb(
  projectRoot: string,
  rows: readonly AgentdbImportRow[],
  opts: { dbPath?: string } = {},
): Promise<{ imported: number; error?: string }> {
  if (rows.length === 0) return { imported: 0 };
  let sqliteUrl: string;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
  } catch {
    return { imported: 0, error: DEPS_MISSING };
  }
  try {
    const { default: Database } = (await import(sqliteUrl)) as { default: new (p: string) => UpsertDb };
    const model = resolveEmbedModel(projectRoot);
    if ('error' in model) return { imported: 0, error: model.error };
    // MED-C: the store manifest guards the MODEL, but a per-vector guard was missing — a malformed or
    // TOCTOU vector (wrong length / NaN / ±Infinity) would be stamped compatible. Fail CLOSED and LOUD:
    // reject the whole batch if any vector's dimensionality ≠ the store dim or any component is non-finite,
    // so a vector can only enter the store bound to the model+dim the manifest names.
    for (const row of rows) {
      if (!(row.vector instanceof Float32Array) || row.vector.length !== model.dim) {
        return { imported: 0, error: `vector validation failed for ${row.dzId}: length ${row.vector?.length} != store dim ${model.dim}` };
      }
      for (let i = 0; i < row.vector.length; i += 1) {
        if (!Number.isFinite(row.vector[i])) {
          return { imported: 0, error: `vector validation failed for ${row.dzId}: non-finite component at index ${i}` };
        }
      }
    }
    const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
    mkdirSync(dirname(dbFile), { recursive: true }); // better-sqlite3 won't create the parent dir
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000'); // wait out a brief MCP-server write lock instead of failing
      db.exec(REASONING_BANK_SCHEMA);
      const guard = guardEmbedSpace({
        storePath: dbFile,
        configured: model,
        hasRows: embeddingRowCount(db) > 0,
        reindexHint: 'dz vector reindex',
      });
      if (!guard.ok) return { imported: 0, error: guard.error };
      const findByDzId = db.prepare("SELECT id FROM reasoning_patterns WHERE json_extract(metadata, '$.dzId') = ?");
      const insPattern = db.prepare('INSERT INTO reasoning_patterns (task_type, approach, success_rate, uses, avg_reward, tags, metadata) VALUES (?, ?, ?, ?, ?, ?, ?)');
      const upsertEmb = db.prepare('INSERT OR REPLACE INTO pattern_embeddings (pattern_id, embedding) VALUES (?, ?)');
      const commit = db.transaction(() => {
        let imported = 0;
        for (const row of rows) {
          const buf = Buffer.from(row.vector.buffer, row.vector.byteOffset, row.vector.byteLength);
          const existing = findByDzId.get(row.dzId) as { id: number } | undefined;
          if (existing !== undefined) {
            upsertEmb.run(existing.id, buf); // REPLACE the embedding in place — never a duplicate row
          } else {
            const meta = { ...(row.metadata ?? {}), dzId: row.dzId };
            const r = insPattern.run(
              row.taskType, row.text, Math.max(0, Math.min(1, Number.isFinite(row.score) ? row.score : 0)), 0, 0.0,
              null, JSON.stringify(meta),
            );
            upsertEmb.run(Number(r.lastInsertRowid), buf);
          }
          imported += 1;
        }
        return imported;
      });
      const imported = commit();
      writeEmbedManifest(dbFile, currentEmbedManifest(model, guard.manifest.version, 'agentdb'));
      return { imported };
    } finally {
      db.close();
    }
  } catch (err) {
    return { imported: 0, error: `import failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * lesson-quarantine: clear the `qStatus` marker from mirrored rows after a promotion — the hook
 * daemon reads ONLY this mirror's metadata, so a promoted lesson must stop being excluded there
 * too. Best-effort, same custody model as {@link bumpAgentdbUses} (missing db/deps ⇒ no-op).
 */
export function clearAgentdbQuarantine(
  projectRoot: string,
  dzIds: readonly string[],
  opts: { dbPath?: string } = {},
): { cleared: number; error?: string } {
  if (dzIds.length === 0) return { cleared: 0 };
  const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
  if (!existsSync(dbFile)) return { cleared: 0 };
  let Database: new (p: string) => UpsertDb;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as new (p: string) => UpsertDb;
  } catch {
    return { cleared: 0, error: DEPS_MISSING };
  }
  try {
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.exec(REASONING_BANK_SCHEMA);
      const stmt = db.prepare(
        "UPDATE reasoning_patterns SET metadata = json_remove(metadata, '$.qStatus', '$.quarantinedAt') WHERE json_extract(metadata, '$.dzId') = ? AND json_extract(metadata, '$.qStatus') = 'quarantined'",
      );
      const tx = db.transaction(() => {
        let cleared = 0;
        for (const dzId of dzIds) {
          const r = stmt.run(dzId);
          cleared += Number((r as unknown as { changes?: number }).changes ?? 0);
        }
        return cleared;
      });
      return { cleared: tx() };
    } finally {
      db.close();
    }
  } catch (err) {
    return { cleared: 0, error: `quarantine clear failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * DELETE mirrored rows by `metadata.dzId` (pattern + its embedding), optionally scoped to a task_type
 * set. The write-half of a structured-store removal: when `harmonize --apply` drops ideas from
 * `ideas.jsonl`, their `dz-backlog` vectors must be pruned too, or a later semantic search matches an
 * ORPHAN dzId that no longer has a structured record (smart-backlog HIGH-A). Best-effort, same custody
 * model as {@link clearAgentdbQuarantine} (missing db/deps ⇒ no-op). Never throws.
 */
export function deleteAgentdbByDzIds(
  projectRoot: string,
  dzIds: readonly string[],
  opts: { dbPath?: string; taskTypes?: readonly string[] } = {},
): { deleted: number; error?: string } {
  if (dzIds.length === 0) return { deleted: 0 };
  const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
  if (!existsSync(dbFile)) return { deleted: 0 };
  let Database: new (p: string) => UpsertDb;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as new (p: string) => UpsertDb;
  } catch {
    return { deleted: 0, error: DEPS_MISSING };
  }
  try {
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.exec(REASONING_BANK_SCHEMA);
      const scope = opts.taskTypes !== undefined && opts.taskTypes.length > 0;
      const scopeSql = scope ? ` AND task_type IN (${opts.taskTypes!.map(() => '?').join(', ')})` : '';
      const findIds = db.prepare(`SELECT id FROM reasoning_patterns WHERE json_extract(metadata, '$.dzId') = ?${scopeSql}`) as unknown as {
        all: (...a: unknown[]) => { id: number }[];
      };
      const delEmb = db.prepare('DELETE FROM pattern_embeddings WHERE pattern_id = ?');
      const delPat = db.prepare('DELETE FROM reasoning_patterns WHERE id = ?');
      const tx = db.transaction(() => {
        let deleted = 0;
        for (const dzId of dzIds) {
          const rows = scope ? findIds.all(dzId, ...opts.taskTypes!) : findIds.all(dzId);
          for (const { id } of rows) {
            delEmb.run(id);
            delPat.run(id);
            deleted += 1;
          }
        }
        return deleted;
      });
      return { deleted: tx() };
    } finally {
      db.close();
    }
  } catch (err) {
    return { deleted: 0, error: `delete by dzId failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export function bumpAgentdbUses(
  projectRoot: string,
  dzIds: readonly string[],
  opts: { dbPath?: string; reward?: number } = {},
): { bumped: number; error?: string } {
  if (dzIds.length === 0) return { bumped: 0 };
  const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
  if (!existsSync(dbFile)) return { bumped: 0 };
  let Database: new (p: string) => UpsertDb;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    Database = req('better-sqlite3') as new (p: string) => UpsertDb;
  } catch {
    return { bumped: 0, error: DEPS_MISSING };
  }
  try {
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.exec(REASONING_BANK_SCHEMA);
      const stmt = db.prepare(
        opts.reward !== undefined
          ? "UPDATE reasoning_patterns SET uses = uses + 1, avg_reward = ((avg_reward * uses) + ?) / (uses + 1) WHERE json_extract(metadata, '$.dzId') = ?"
          : "UPDATE reasoning_patterns SET uses = uses + 1 WHERE json_extract(metadata, '$.dzId') = ?",
      );
      const tx = db.transaction(() => {
        let bumped = 0;
        for (const dzId of dzIds) {
          const r = opts.reward !== undefined
            ? stmt.run(Math.max(0, Math.min(1, opts.reward)), dzId)
            : stmt.run(dzId);
          bumped += Number((r as unknown as { changes?: number }).changes ?? 0);
        }
        return bumped;
      });
      return { bumped: tx() };
    } finally {
      db.close();
    }
  } catch (err) {
    return { bumped: 0, error: `uses bump failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function reindexAgentdbRows(
  projectRoot: string,
  rows: readonly AgentdbRow[],
  opts: { dbPath?: string; taskTypes?: readonly string[]; backupPath?: string } = {},
): Promise<{
  reembedded: number;
  model?: string;
  version?: number;
  backupPath?: string;
  error?: string;
  /** Task types left in the OLD embedding space because this reindex does not own them. */
  staleTaskTypes?: string[];
}> {
  const dbFile = resolveAgentdbPath(projectRoot, opts.dbPath);
  const backupPath = opts.backupPath ?? `${dbFile}.pre-reindex-${Date.now()}.bak`;
  if (existsSync(dbFile)) {
    try {
      const { copyFileSync } = await import('node:fs');
      copyFileSync(dbFile, backupPath);
      if (existsSync(`${dbFile}.embed-manifest.json`)) {
        copyFileSync(`${dbFile}.embed-manifest.json`, `${backupPath}.embed-manifest.json`);
      }
    } catch (err) {
      return { reembedded: 0, backupPath, error: `snapshot failed — reindex aborted: ${err instanceof Error ? err.message : String(err)}` };
    }
  }
  let sqliteUrl: string;
  try {
    const req = createRequire(join(projectRoot, 'package.json'));
    sqliteUrl = pathToFileURL(req.resolve('better-sqlite3')).href;
  } catch {
    return { reembedded: 0, backupPath, error: DEPS_MISSING };
  }
  const model = resolveEmbedModel(projectRoot);
  if ('error' in model) return { reembedded: 0, backupPath, error: model.error };
  const oldVersion = readEmbedManifest(dbFile)?.version ?? 1;
  const version = Math.max(oldVersion + 1, 2);

  /**
   * Undo a half-done reindex. The DELETE has already run and the manifest may already name the new
   * model, so leaving the store as-is would be WORSE than before we started: a manifest that claims a
   * space the rows are not in. Restore both from the snapshot taken above. Best-effort and never
   * throws — the caller is already returning an error.
   */
  const rollback = async (): Promise<void> => {
    try {
      const { copyFileSync } = await import('node:fs');
      if (existsSync(backupPath)) copyFileSync(backupPath, dbFile);
      const manifestBak = `${backupPath}.embed-manifest.json`;
      if (existsSync(manifestBak)) copyFileSync(manifestBak, `${dbFile}.embed-manifest.json`);
    } catch {
      /* the snapshot path is still reported to the caller */
    }
  };

  let stale: string[] = [];
  try {
    const { default: Database } = (await import(sqliteUrl)) as { default: new (p: string) => UpsertDb };
    mkdirSync(dirname(dbFile), { recursive: true });
    const db = new Database(dbFile);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('busy_timeout = 5000');
      db.exec(REASONING_BANK_SCHEMA);
      const taskTypes = opts.taskTypes ?? DZ_TASK_TYPES;
      const placeholders = taskTypes.map(() => '?').join(', ');
      // Task types this reindex does NOT own. Their vectors stay in the OLD embedding space while the
      // manifest below starts naming the new one. That is safe only because every read path filters by
      // task type (`searchAgentdbPatterns` defaults to DZ_TASK_TYPES; the brain reads its own store),
      // so no query ever compares across spaces. We report them so the caller can tell the user which
      // sibling reindex still has to run — silently leaving them would be the trap.
      stale = foreignTaskTypesWithEmbeddings(db, taskTypes);
      const delEmb = db.prepare(`DELETE FROM pattern_embeddings WHERE pattern_id IN (SELECT id FROM reasoning_patterns WHERE task_type IN (${placeholders}))`);
      const delPat = db.prepare(`DELETE FROM reasoning_patterns WHERE task_type IN (${placeholders})`);
      const tx = db.transaction(() => {
        delEmb.run(...taskTypes);
        delPat.run(...taskTypes);
      });
      tx();
    } finally {
      db.close();
    }

    // Stamp the NEW manifest BEFORE re-indexing. `indexPatternsToAgentdb` runs `guardEmbedSpace`,
    // which refuses to write when the manifest names a different model — so with the old manifest
    // still in place, reindex (the documented cure for exactly that mismatch) is refused by the very
    // guard it exists to satisfy, and its own error message tells you to run itself. Stamping first
    // makes the cure reachable; `rollback()` restores both file and manifest if the re-embed fails,
    // so a mid-way failure can never leave a manifest that lies about the rows.
    writeEmbedManifest(dbFile, currentEmbedManifest(model, version, 'agentdb'));

    const indexed = await indexPatternsToAgentdb(projectRoot, rows, { dbPath: dbFile });
    if (indexed.error !== undefined) {
      await rollback();
      return { reembedded: 0, backupPath, error: indexed.error };
    }
    return {
      reembedded: indexed.indexed,
      model: model.model,
      version,
      backupPath,
      ...(stale.length > 0 ? { staleTaskTypes: stale } : {}),
    };
  } catch (err) {
    await rollback();
    return { reembedded: 0, backupPath, error: `reindex failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * Task types present in the store (with embeddings) that this reindex does not rebuild. Pure read,
 * never throws — an unreadable store simply reports none.
 */
function foreignTaskTypesWithEmbeddings(db: unknown, owned: readonly string[]): string[] {
  try {
    // `UpsertDb` (the write-side surface) does not declare `all()`, but the live better-sqlite3
    // statement has it. Narrow here rather than widening the shared write interface.
    const q = db as { prepare: (s: string) => { all: (...a: unknown[]) => unknown[] } };
    const rows = q
      .prepare(
        `SELECT DISTINCT p.task_type AS t FROM reasoning_patterns p
           JOIN pattern_embeddings e ON e.pattern_id = p.id`,
      )
      .all() as Array<{ t?: unknown }>;
    return rows
      .map((r) => (typeof r.t === 'string' ? r.t : ''))
      .filter((t) => t !== '' && !owned.includes(t))
      .sort();
  } catch {
    return [];
  }
}
