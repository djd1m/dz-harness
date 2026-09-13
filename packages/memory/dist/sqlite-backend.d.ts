/**
 * `SqliteBackend` — production-scale memory backend using better-sqlite3.
 *
 * Write-through persistence (every `put` is durable), WAL mode for concurrency,
 * and indexed columns for efficient queries. Handles 100k+ records where
 * JsonFileBackend degrades.
 *
 * @packageDocumentation
 */
import type { MemoryBackend, MemoryQuery, MemoryRecord } from './backend.js';
import type { OpenReadOnlyOptions, ReadOnlyStore } from './sqlite-readonly.js';
/** FTS5 query — matching records with their relevance rank (lower = better). */
export declare const FTS5_SEARCH_SQL = "\n  SELECT mr.*, fts.rank AS _rank FROM memory_fts fts\n  JOIN memory_records mr ON mr.rowid = fts.rowid\n  WHERE memory_fts MATCH ?\n  ORDER BY fts.rank\n";
export declare const FTS5_SEARCH_SKILL_SQL = "\n  SELECT mr.*, fts.rank AS _rank FROM memory_fts fts\n  JOIN memory_records mr ON mr.rowid = fts.rowid\n  WHERE memory_fts MATCH ? AND mr.skill_id = ?\n  ORDER BY fts.rank\n";
export declare const ALL_SQL = "SELECT * FROM memory_records";
export declare const COUNT_SQL = "SELECT COUNT(*) as cnt FROM memory_records";
export declare const BY_SKILL_SQL = "SELECT * FROM memory_records WHERE skill_id = ?";
/**
 * The FTS5-ranked / keyword-overlap search decision, extracted from `querySync` so a
 * read-only backend (which prepares the same statements but never runs `INIT_SQL`/`FTS5_SQL`)
 * can share it byte-for-byte instead of forking its own copy. A forked copy is exactly the
 * class of bug documented above (lines 24-29): a reader whose ranking diverges from the
 * writer's silently regresses recall. Behaviorally IDENTICAL to the body it replaced — same
 * sort order, same `stemOf` prefixes, same `relevance > 0` filter, same `terms.length > 0`
 * branch. `@internal` — exported only so `sqlite-readonly.ts` can call it; not part of the
 * package's public surface (see `index.ts`, which does not re-export it).
 *
 * @internal
 */
export declare function searchPreparedRecords(stmts: {
    fts?: any;
    ftsSkill?: any;
    all: any;
    bySkill: any;
}, hasFts5: boolean, query: MemoryQuery): MemoryRecord[];
/** Options for SqliteBackend. */
export interface SqliteBackendOptions {
    /** Path to the SQLite database file. */
    readonly filePath: string;
}
/**
 * SQLite-backed memory store. Write-through, WAL mode, indexed.
 *
 * Requires `better-sqlite3` at runtime — use via {@link SqliteProbe} in the
 * cascade to gracefully fall back when the native module is unavailable.
 */
export declare class SqliteBackend implements MemoryBackend {
    readonly name = "sqlite";
    private readonly db;
    private readonly upsertStmt;
    private readonly deleteStmt;
    private readonly allStmt;
    private readonly countStmt;
    private readonly bySkillStmt;
    private readonly ftsSearchStmt;
    private readonly ftsSearchSkillStmt;
    private readonly hasFts5;
    constructor(db: any);
    /** Open (or create) a SQLite database at the given path. */
    static open(filePath: string): SqliteBackend;
    /**
     * Open a SQLite database for READING ONLY (ADR-001, Решение 2). Never runs `INIT_SQL`,
     * `FTS5_SQL`, or the FTS rebuild — the writer's `constructor` above stays untouched byte
     * for byte. Presence of the FTS5 table is discovered by reading `sqlite_master`, not by
     * attempting to (re)create it. `put`/`putMany`/`remove`/`removeSync` on the returned store
     * throw `read-only backend: <method> is not available`.
     */
    static openReadOnly(filePath: string, opts?: OpenReadOnlyOptions): ReadOnlyStore;
    put(record: MemoryRecord): Promise<void>;
    query(query: MemoryQuery): Promise<MemoryRecord[]>;
    /**
     * Synchronous {@link SqliteBackend.query}. Same FTS5-ranked / keyword-fallback
     * logic, no Promise — better-sqlite3 is physically synchronous, so a hot sync
     * path (a recommender / `dz recall`) can query the store without an async ripple.
     */
    querySync(query: MemoryQuery): MemoryRecord[];
    all(): Promise<MemoryRecord[]>;
    /** Synchronous {@link SqliteBackend.all}. */
    allSync(): MemoryRecord[];
    remove(id: string): Promise<void>;
    /** Synchronous {@link SqliteBackend.remove}. Write-through (durable immediately); the FTS5 delete trigger keeps the index in sync. */
    removeSync(id: string): void;
    count(): Promise<number>;
    /** Batch insert records within a transaction (for bulk loading). */
    putMany(records: readonly MemoryRecord[]): void;
    /** Close the database connection. */
    close(): void;
}
/** Convert a raw SQLite row to a MemoryRecord. */
export declare function rowToRecord(row: any): MemoryRecord;
//# sourceMappingURL=sqlite-backend.d.ts.map