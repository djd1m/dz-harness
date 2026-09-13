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

import { createRequire } from 'node:module';
import { existsSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import type { MemoryQuery, MemoryRecord } from './backend.js';
import {
  searchPreparedRecords,
  FTS5_SEARCH_SQL,
  FTS5_SEARCH_SKILL_SQL,
  ALL_SQL,
  COUNT_SQL,
  BY_SKILL_SQL,
  rowToRecord,
} from './sqlite-backend.js';

const require = createRequire(import.meta.url);

/** Constructor shape `openSqliteReadOnly` needs from `better-sqlite3` (or a caller-supplied one). */
type DatabaseCtor = new (p: string, o?: { readonly?: boolean; fileMustExist?: boolean }) => any;

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

function defaultDatabaseCtor(): DatabaseCtor {
  // Dynamic require — better-sqlite3 must be available at runtime, same discipline as
  // `SqliteBackend.open` (sqlite-backend.ts).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('better-sqlite3');
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Step-1 → step-2 trigger: ONLY a can't-open-the-file failure retries as a copy. */
function isCantOpenError(err: unknown): boolean {
  const code = (err as { code?: string } | undefined)?.code;
  const msg = errorMessage(err);
  return code === 'SQLITE_CANTOPEN' || /unable to open database file/i.test(msg);
}

/** A cheap, real read — the WAL "can't create -shm/-wal here" failure surfaces on a query, not on open. */
function probe(db: any): void {
  db.prepare('SELECT count(*) AS n FROM sqlite_master').get();
}

function closeQuietly(db: any): void {
  try {
    db.close();
  } catch {
    // already failing on the caller's side — a close failure here must not mask the real cause
  }
}

function removeQuietly(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best-effort — the honest-failure path below still reports the real cause
  }
}

/**
 * Open `filePath` for reading only, climbing the ladder described above.
 *
 * Deliberately does NOT: `mkdirSync` any directory, run any DDL/DML, set `journal_mode` or
 * `synchronous`, or check `existsSync` itself (FR-5 keeps that check with the caller, before this
 * is called — `fileMustExist: true` below is only the second line of defence against a race).
 */
export function openSqliteReadOnly(filePath: string, opts?: OpenReadOnlyOptions): ReadOnlyHandle {
  const Database = opts?.Database ?? defaultDatabaseCtor();

  // Step 1 — in place.
  let inPlaceDb: any | undefined;
  try {
    inPlaceDb = new Database(filePath, { readonly: true, fileMustExist: true });
    probe(inPlaceDb);
    return { db: inPlaceDb, source: 'in-place', cleanup: () => {} };
  } catch (stepOneErr) {
    if (inPlaceDb !== undefined) closeQuietly(inPlaceDb);
    if (!isCantOpenError(stepOneErr)) {
      throw new Error(`failed to open ${filePath} for reading: ${errorMessage(stepOneErr)}`);
    }

    // Step 2 — copy into a fresh tmp directory.
    let tmpDir: string | undefined;
    let copyDb: any | undefined;
    try {
      tmpDir = mkdtempSync(join(tmpdir(), 'dz-ro-'));
      const dest = join(tmpDir, basename(filePath));
      copyFileSync(filePath, dest);
      const walSource = `${filePath}-wal`;
      if (existsSync(walSource)) {
        copyFileSync(walSource, `${dest}-wal`);
      }
      // `-shm` is intentionally NOT copied — it is derived and SQLite recreates it; a stale one
      // next to a fresh copy is worse than none (ADR-001, Решение 1, ступень 2).
      copyDb = new Database(dest, { readonly: true, fileMustExist: true });
      probe(copyDb);
      const dir = tmpDir;
      return {
        db: copyDb,
        source: 'tmp-copy',
        cleanup: () => removeQuietly(dir),
      };
    } catch (stepTwoErr) {
      // `copyDb` may have opened successfully and THEN failed in `probe()` — an unclosed handle
      // here leaks a file descriptor and, on a platform that refuses to delete an open file,
      // leaves the tmp directory behind too. Close before removing (fix round 1, HIGH #1).
      if (copyDb !== undefined) closeQuietly(copyDb);
      if (tmpDir !== undefined) removeQuietly(tmpDir);
      throw new Error(`failed to open ${filePath} for reading: ${errorMessage(stepTwoErr)}`);
    }
  }
}

/** The read-only surface a caller gets back from {@link openSqliteReadOnly} + the search logic. */
export interface ReadOnlyStore {
  querySync(query: MemoryQuery): MemoryRecord[];
  allSync(): MemoryRecord[];
  countSync(): number;
  close(): void;
}

/** `sqlite_master` lookup used to discover FTS5 presence WITHOUT attempting to (re)create it. */
const FTS5_TABLE_PRESENT_SQL = `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'`;

/**
 * `ReadOnlyStore` over a {@link ReadOnlyHandle}. Prepares the SAME statement text
 * `SqliteBackend`'s writer constructor prepares (imported, not forked) and shares its search
 * logic via `searchPreparedRecords` — so a reader can never rank differently than the writer.
 * Runs NO `INIT_SQL`, NO `FTS5_SQL`, NO FTS rebuild; discovers FTS5 by reading `sqlite_master`.
 * Mutating methods throw — this store has no `put`/`remove` sibling by construction, not by
 * convention.
 */
export class SqliteReadOnlyStore implements ReadOnlyStore {
  private readonly handle: ReadOnlyHandle;
  private readonly hasFts5: boolean;
  private readonly ftsSearchStmt: any | undefined;
  private readonly ftsSearchSkillStmt: any | undefined;
  private readonly allStmt: any;
  private readonly countStmt: any;
  private readonly bySkillStmt: any;

  constructor(handle: ReadOnlyHandle) {
    this.handle = handle;
    const db = handle.db;
    const ftsRow = db.prepare(FTS5_TABLE_PRESENT_SQL).get() as { name?: string } | undefined;
    this.hasFts5 = ftsRow?.name === 'memory_fts';
    if (this.hasFts5) {
      this.ftsSearchStmt = db.prepare(FTS5_SEARCH_SQL);
      this.ftsSearchSkillStmt = db.prepare(FTS5_SEARCH_SKILL_SQL);
    }
    this.allStmt = db.prepare(ALL_SQL);
    this.countStmt = db.prepare(COUNT_SQL);
    this.bySkillStmt = db.prepare(BY_SKILL_SQL);
  }

  querySync(query: MemoryQuery): MemoryRecord[] {
    return searchPreparedRecords(
      { fts: this.ftsSearchStmt, ftsSkill: this.ftsSearchSkillStmt, all: this.allStmt, bySkill: this.bySkillStmt },
      this.hasFts5,
      query,
    );
  }

  allSync(): MemoryRecord[] {
    return this.allStmt.all().map(rowToRecord);
  }

  countSync(): number {
    return this.countStmt.get().cnt as number;
  }

  /** `db.close()` first, THEN `handle.cleanup()` in `finally` — the tmp-copy must be removed even if `close()` throws. */
  close(): void {
    try {
      this.handle.db.close();
    } finally {
      this.handle.cleanup();
    }
  }

  put(): never {
    throw new Error('read-only backend: put is not available');
  }

  putMany(): never {
    throw new Error('read-only backend: putMany is not available');
  }

  remove(): never {
    throw new Error('read-only backend: remove is not available');
  }

  removeSync(): never {
    throw new Error('read-only backend: removeSync is not available');
  }
}
