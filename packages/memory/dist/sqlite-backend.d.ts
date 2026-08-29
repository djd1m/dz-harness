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
//# sourceMappingURL=sqlite-backend.d.ts.map