/**
 * A single, shared opener for READ-ONLY SQLite access (ADR-001,
 * `features/store-readonly-reads/03_adr/001-read-opener-ladder-in-place-then-tmp-copy.md`).
 *
 * `{ readonly: true }` alone does not read a WAL database on a directory that cannot be written
 * to: the wal-mode reader still needs to create (or find) `-shm`/`-wal` next to the file, and on
 * a read-only-mounted directory that create fails with `unable to open database file` — MEASURED
 * 2026-09-12 against better-sqlite3 11.10.0 / SQLite 3.49.2 (`chattr +i` on a `/var/tmp`
 * directory holding a checkpointed WAL database). `openSqliteReadOnly` climbs a three-step ladder
 * instead of assuming step 1 always works:
 *
 *   1. **In place.** `{ readonly: true, fileMustExist: true }`, then a real read (the WAL error
 *      surfaces on the first query, not on open) — this is what a live writer on the same host
 *      gets: it sees uncheckpointed rows too.
 *   2. **Copy.** Only on `SQLITE_CANTOPEN` / "unable to open database file": copy the database
 *      (+ its `-wal`, if any — never `-shm`, which is derived and recreated) into a fresh
 *      `mkdtemp` directory and open THAT read-only.
 *   3. **Honest failure.** Any other error, or step 2 itself failing, throws — naming the path
 *      and the original cause. Never a swallowed `{ hits: [] }`.
 *
 * @packageDocumentation
 */
import type { MemoryQuery, MemoryRecord } from './backend.js';
/** Constructor shape `openSqliteReadOnly` needs from `better-sqlite3` (or a caller-supplied one). */
type DatabaseCtor = new (p: string, o?: {
    readonly?: boolean;
    fileMustExist?: boolean;
}) => any;
/** The handle returned by {@link openSqliteReadOnly}. */
export interface ReadOnlyHandle {
    /** better-sqlite3 `Database`, opened read-only. */
    readonly db: any;
    /** Which rung of the ladder answered: the file itself, or a temporary copy of it. */
    readonly source: 'in-place' | 'tmp-copy';
    /** Removes the temporary copy's directory. No-op for `'in-place'`. Idempotent — safe to call more than once. */
    readonly cleanup: () => void;
}
/** Options for {@link openSqliteReadOnly}. */
export interface OpenReadOnlyOptions {
    /**
     * The `better-sqlite3` constructor to use. Callers that resolve their own copy of the native
     * module (`book-kb.ts`, `agentdb-index.ts` — both resolve from the TARGET project, not from
     * this package) MUST pass it here rather than let this opener resolve its own: a silently
     * different native-module instance is the same class of bug as "the tool in PATH decides the
     * verdict". Omitted only by callers that are fine with the memory package's own resolution
     * (`SqliteBackend.openReadOnly`, which resolves via `createRequire(import.meta.url)` — the same
     * resolution `SqliteBackend.open` already uses).
     */
    readonly Database?: DatabaseCtor;
}
/**
 * Open `filePath` for reading only, climbing the ladder described above.
 *
 * Deliberately does NOT: `mkdirSync` any directory, run any DDL/DML, set `journal_mode` or
 * `synchronous`, or check `existsSync` itself (FR-5 keeps that check with the caller, before this
 * is called — `fileMustExist: true` below is only the second line of defence against a race).
 */
export declare function openSqliteReadOnly(filePath: string, opts?: OpenReadOnlyOptions): ReadOnlyHandle;
/** The read-only surface a caller gets back from {@link openSqliteReadOnly} + the search logic. */
export interface ReadOnlyStore {
    querySync(query: MemoryQuery): MemoryRecord[];
    allSync(): MemoryRecord[];
    countSync(): number;
    close(): void;
}
/**
 * `ReadOnlyStore` over a {@link ReadOnlyHandle}. Prepares the SAME statement text
 * `SqliteBackend`'s writer constructor prepares (imported, not forked) and shares its search
 * logic via `searchPreparedRecords` — so a reader can never rank differently than the writer.
 * Runs NO `INIT_SQL`, NO `FTS5_SQL`, NO FTS rebuild; discovers FTS5 by reading `sqlite_master`.
 * Mutating methods throw — this store has no `put`/`remove` sibling by construction, not by
 * convention.
 */
export declare class SqliteReadOnlyStore implements ReadOnlyStore {
    private readonly handle;
    private readonly hasFts5;
    private readonly ftsSearchStmt;
    private readonly ftsSearchSkillStmt;
    private readonly allStmt;
    private readonly countStmt;
    private readonly bySkillStmt;
    constructor(handle: ReadOnlyHandle);
    querySync(query: MemoryQuery): MemoryRecord[];
    allSync(): MemoryRecord[];
    countSync(): number;
    /** `db.close()` first, THEN `handle.cleanup()` in `finally` — the tmp-copy must be removed even if `close()` throws. */
    close(): void;
    put(): never;
    putMany(): never;
    remove(): never;
    removeSync(): never;
}
export {};
//# sourceMappingURL=sqlite-readonly.d.ts.map