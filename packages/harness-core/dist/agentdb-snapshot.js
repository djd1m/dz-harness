/**
 * Consistent sqlite snapshot + restore for the pre-reindex undo point (feature
 * `snapshot-wal-consistency`, FR-1..FR-4; fix round AM-1..AM-4).
 *
 * A WAL-mode sqlite database's committed data can live in TWO files: the main `dbFile` and its
 * `-wal` sidecar (frames not yet checkpointed into the main file). The snapshot this module
 * replaces was a bare `copyFileSync(dbFile, backupPath)` — one file, no `-wal` — so a reindex that
 * ran while any writer held the WAL open (autocheckpoint disabled, or simply a live connection
 * between commits) copied a "backup" that was MISSING committed rows. MEASURED (scratch repro,
 * 2026-09-13, `node` + real `better-sqlite3`): a schema + one row checkpointed, then a second row
 * inserted on a connection kept open (`wal_autocheckpoint = 0`) — `copyFileSync` alone yields a
 * backup with 1 row; `VACUUM INTO` on a fresh read-only connection to the SAME live db yields 2.
 * The live db's main file hash and `-wal` size are unchanged before/after the `VACUUM INTO` (the
 * read-only connection never checkpoints or writes) — the safety property NFR-2 names.
 *
 * {@link snapshotSqliteDatabase} (FR-1/FR-2) takes the snapshot through `VACUUM INTO` on a fresh
 * READ-ONLY connection — one self-contained output file with every committed transaction, WAL
 * frames included. If `VACUUM INTO` cannot run (older sqlite, a locked/foreign file, no free disk)
 * — or a caller forces it for a test — it falls back to copying `dbFile` plus its `-wal` sibling
 * (present and non-empty) to `backupPath`/`backupPath-wal`; still strictly better than the old
 * single-file copy, and the fallback is never silent: `method`/`note` name it honestly so a report
 * downstream (`reindexAgentdbRows`'s `snapshotMethod`) never claims a guarantee it did not get.
 *
 * **AM-1 (fix round).** Codex review, Grade C: reusing a `backupPath` left a stale `-wal`/`-shm`
 * sidecar from an EARLIER, unrelated snapshot family sitting next to the new one; `restoreSqliteSnapshot`
 * used to decide whether to restore `-wal` by checking whether `backupPath-wal` merely EXISTS, so that
 * stale sidecar could ride along onto a `vacuum-into` restore that never produced a matching `-wal` of
 * its own. Fixed two ways: `snapshotSqliteDatabase` now clears any `backupPath-wal`/`-shm` sidecar
 * BEFORE either strategy writes anything, and again right after a successful `VACUUM INTO` (whose
 * output is one self-contained file and must never be shadowed); `restoreSqliteSnapshot` now takes the
 * `method` the caller already knows and restores `-wal` ONLY when `method === 'copy+wal'` — never by
 * re-deriving it from file presence.
 *
 * **AM-2 (fix round).** The old WAL-size probe was `existsSync` + best-effort `statSync` inside a
 * `catch { walSize = 0 }` — ANY stat failure (`EACCES`, `EIO`, a raced deletion) was silently read as
 * "no WAL", so a snapshot could report the honest-sounding `method: 'copy'` while actually having
 * skipped a WAL it could not even check. {@link statSizeIfExists} now calls `statSync` directly and
 * treats only a confirmed `ENOENT` as "does not exist" — every other error propagates and aborts the
 * whole snapshot, so `reindexAgentdbRows` reports "snapshot failed", never a falsely-successful `copy`.
 *
 * **AM-4 (fix round).** `snapshotSqliteDatabase` used to happily write into (overwrite) an existing
 * `backupPath`, silently discarding whatever it held — including, combined with AM-1's stale-sidecar
 * bug, a backup that looked complete but carried a wrong-generation `-wal`. It now refuses up front
 * (before `VACUUM INTO` or any copy) when `backupPath` already exists and is non-empty.
 *
 * {@link restoreSqliteSnapshot} (FR-4) is the paired rollback. MEASURED (same repro): copying the
 * old main file back over `dbFile` WITHOUT removing a `-wal` left over from the aborted operation
 * — reopening the "restored" db returned ZERO rows, not the restored one, because sqlite replayed
 * the stale WAL frames (a since-superseded DELETE) on top of the reverted main file. Removing
 * `dbFile-wal`/`dbFile-shm` as part of the restore fixed this: the reopened db then returned
 * exactly the restored row. The caller MUST close its own write connection to `dbFile` before
 * calling this — restoring a file sqlite still holds open is undefined behaviour.
 *
 * **AM-3 (fix round).** `restoreSqliteSnapshot` used to return `void` — a failing `copyFileSync`/
 * `rmSync` inside it threw straight out of the best-effort `rollback()` wrapper in
 * `agentdb-index.ts`, which swallowed it in an empty `catch` and reported nothing: "absence of a
 * receipt is not success" applies to a rollback exactly as much as to a forward operation. It now
 * returns `{ ok: true } | { ok: false, error }` so the caller can name a failed rollback as failed,
 * never as restored.
 *
 * @packageDocumentation
 */
import { copyFileSync, existsSync, rmSync, statSync } from 'node:fs';
/** Escape `path` as a single-quoted sqlite string literal (double any embedded `'`). */
function sqlQuote(path) {
    return `'${path.replace(/'/g, "''")}'`;
}
/**
 * AM-2: the size of `path`, or `undefined` when it does not exist — but ONLY on a confirmed
 * `ENOENT`. Any other stat error (`EACCES`, `EIO`, a raced deletion mid-call, …) propagates to the
 * caller instead of being folded into "does not exist": a snapshot that cannot even determine
 * whether a `-wal` sidecar exists must abort, not silently report the weaker `copy` method as if it
 * had made an informed choice.
 */
function statSizeIfExists(path) {
    try {
        return statSync(path).size;
    }
    catch (err) {
        if (err?.code === 'ENOENT')
            return undefined;
        throw err;
    }
}
/**
 * AM-4: refuse to snapshot into an existing, non-empty `backupPath` — silently overwriting it would
 * discard whatever it held (possibly itself a valid undo point) with no trace. An existing but EMPTY
 * file is not a real prior snapshot and is allowed through untouched.
 */
function assertBackupTargetFree(backupPath) {
    const size = statSizeIfExists(backupPath);
    if (size !== undefined && size > 0) {
        throw new Error(`snapshot target exists and is non-empty: ${backupPath}`);
    }
}
/**
 * AM-1: remove any `-wal`/`-shm` sidecar already sitting at `backupPath` — a leftover from an
 * earlier, unrelated snapshot family that happened to reuse this name. Called BEFORE either strategy
 * below writes anything, and again immediately after a successful `VACUUM INTO` (whose output is one
 * self-contained file that must never be shadowed by a stale sidecar from a previous attempt at the
 * same path).
 */
function clearBackupSidecars(backupPath) {
    rmSync(`${backupPath}-wal`, { force: true });
    rmSync(`${backupPath}-shm`, { force: true });
}
function copyWithWal(dbFile, backupPath, note) {
    // AM-2: statSync directly; only a confirmed ENOENT means "no -wal to copy" — any other stat error
    // propagates out of this function (and out of snapshotSqliteDatabase) as a thrown exception.
    // Lead edit after re-review: the stat runs BEFORE the main file is copied, so a stat failure leaves
    // no half-written target behind (which AM-4 would otherwise refuse on the retry).
    const walSize = statSizeIfExists(`${dbFile}-wal`) ?? 0;
    copyFileSync(dbFile, backupPath);
    if (walSize > 0) {
        copyFileSync(`${dbFile}-wal`, `${backupPath}-wal`);
        return { method: 'copy+wal', note };
    }
    return { method: 'copy', note };
}
/**
 * Take a consistent snapshot of `dbFile` into `backupPath` (FR-1/FR-2). Default: open `dbFile`
 * READ-ONLY and run `VACUUM INTO <backupPath>` — one output file holding every committed
 * transaction (including `-wal` frames), with no write to the live database (NFR-2 — MEASURED:
 * main-file hash and `-wal` size are unchanged across the call). On any failure — an older sqlite
 * without `VACUUM INTO`, a locked file, no disk space — or when `opts.strategy` forces it (tests),
 * falls back to `copyFileSync(dbFile, backupPath)` plus a copy of `dbFile-wal` to `backupPath-wal`
 * when the WAL sibling exists and is non-empty; `method` is `'copy+wal'` when the sibling was
 * copied, `'copy'` when there was none to copy. `note` names the fallback reason (FR-2) — set even
 * for a forced-strategy test call, so a caller never has to guess why the fast path was skipped.
 * The read-only connection opened for `VACUUM INTO` is always closed before returning.
 *
 * Throws (no snapshot taken, or an incomplete one left in a fully-cleared state) when: `backupPath`
 * already names an existing, non-empty file (AM-4); or a `-wal` stat probe hits a non-ENOENT error
 * (AM-2, inside the fallback path). Never silently overwrites, never mis-reports a lesser guarantee
 * as a stronger one.
 */
export function snapshotSqliteDatabase(Database, dbFile, backupPath, opts = {}) {
    assertBackupTargetFree(backupPath); // AM-4 — before any write, on either strategy
    clearBackupSidecars(backupPath); // AM-1 — clean slate before either strategy writes anything
    if (opts.strategy === 'copy+wal') {
        return copyWithWal(dbFile, backupPath, 'snapshotStrategy=copy+wal forced by caller');
    }
    try {
        const db = new Database(dbFile, { readonly: true });
        try {
            db.exec(`VACUUM INTO ${sqlQuote(backupPath)}`);
        }
        finally {
            db.close();
        }
        clearBackupSidecars(backupPath); // AM-1 — VACUUM INTO's output never has a matching -wal of its own
        return { method: 'vacuum-into' };
    }
    catch (err) {
        return copyWithWal(dbFile, backupPath, `VACUUM INTO failed: ${err instanceof Error ? err.message : String(err)}`);
    }
}
/**
 * Restore `dbFile` from a snapshot taken by {@link snapshotSqliteDatabase} (FR-4). The caller MUST
 * close its write connection to `dbFile` BEFORE calling this — this restore is a plain file copy,
 * not a sqlite-mediated rollback, and a live handle can reintroduce exactly the frames being undone.
 *
 * `method` is the EXACT {@link SnapshotMethod} the paired `snapshotSqliteDatabase` call returned
 * (AM-1) — never re-derived from whether `backupPath-wal` happens to exist on disk, which a stale
 * sidecar from an unrelated earlier snapshot at the same path could satisfy. Copies `backupPath`
 * over `dbFile`; when `method === 'copy+wal'`, also restores `backupPath-wal` to `dbFile-wal`.
 * Otherwise (`'vacuum-into'` or `'copy'`, neither of which produced a matching `-wal` of its own) any
 * LIVE `dbFile-wal` — left over from the operation being undone — is removed instead: MEASURED,
 * leaving it in place made a reopened "restored" db replay that WAL's frames (a since-superseded
 * write) on top of the reverted main file, returning zero rows instead of the restored set.
 * `dbFile-shm` is always removed — its offsets are valid only for the `-wal` that no longer matches.
 *
 * Returns `{ ok: true }`, or `{ ok: false, error }` (AM-3) when any step throws — a caller that
 * reported a failed restore as a successful one would leave the store worse than before rollback was
 * attempted, with nothing on record to say so.
 */
export function restoreSqliteSnapshot(dbFile, backupPath, method) {
    try {
        if (!existsSync(backupPath))
            return { ok: false, error: `snapshot missing at ${backupPath}` };
        copyFileSync(backupPath, dbFile);
        if (method === 'copy+wal') {
            copyFileSync(`${backupPath}-wal`, `${dbFile}-wal`);
        }
        else {
            rmSync(`${dbFile}-wal`, { force: true });
        }
        rmSync(`${dbFile}-shm`, { force: true });
        return { ok: true };
    }
    catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}
//# sourceMappingURL=agentdb-snapshot.js.map