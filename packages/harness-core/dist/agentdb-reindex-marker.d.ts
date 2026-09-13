/**
 * The agentdb snapshot lock + reindex-in-progress marker (feature `agentdb-snapshot-lock`,
 * FR-1..FR-4; fix-round AM-1..AM-4/AM-7 after Codex review Grade D).
 *
 * WHY. Snapshot creation (in `reindexAgentdbRows`), snapshot rotation (`rotatePreReindexSnapshots`,
 * including `dz brain snapshots --prune`) and snapshot restore (`restoreSqliteSnapshot` via
 * `reindexAgentdbRows`'s rollback) are three writers of ONE directory with no mutual exclusion: a
 * concurrent `rotate --keep 0` can delete the very snapshot family a live reindex is relying on as
 * its undo point, with only a 10-minute grace period standing in the way.
 *
 * {@link withAgentdbSnapshotLock} is a thin, dbFile-addressed wrapper over `withNamedLockSync`: the
 * lock lives at `<dirname(dbFile)>/.dz/locks/agentdb-snapshot.lock` — a pure function of the
 * database's OWN directory, never of the caller's cwd, so a project store and the home brain each
 * get their own lock (AC-5) regardless of where `dz` happens to be invoked from. AM-7: it defaults
 * `staleMs` to {@link AGENTDB_SNAPSHOT_LOCK_STALE_MS} (5 minutes) rather than named-lock's ordinary
 * 30-second default — MEASURED (lead, this fix round): `VACUUM INTO` on the owner's hub store
 * (8.45 MB) took 96 ms, so 5 minutes leaves roughly 3000x headroom while staying inside
 * named-lock's own 600 000 ms environment-override ceiling. A caller doing something unusually
 * large may still override via `opts.staleMs`.
 *
 * The critical section this lock guards must stay SHORT and SYNCHRONOUS — file operations only
 * (`VACUUM INTO` / copies / unlink / restore). MEASURED (named-lock.ts round-2, reused verbatim
 * here): a 6s synchronous body under a 2s stale threshold let a THIRD process break in while the
 * second was still inside its own critical section — a long body doesn't just block callers, it
 * breaks the lock's own guarantee. The actual re-embedding (network/CPU-bound `EmbeddingService`
 * calls, row writes) therefore runs OUTSIDE this lock — see `reindexAgentdbRows`.
 *
 * {@link writeReindexMarker} / {@link clearReindexMarker} / {@link readLiveReindexMarkers} implement
 * the SECOND protection this feature adds — a "reindex is currently in flight" marker file beside
 * the database, so a family a live reindex just created is protected from rotation for the
 * DURATION of the reindex, not merely for the few milliseconds the snapshot lock itself is held
 * (the embedding phase can run for a while, unlocked, per FR-2). The marker's liveness is judged by
 * `startedAt` (a wall-clock age, {@link REINDEX_MARKER_TTL_MS}), never by `pid` — a pid is recorded
 * for operator debugging only; a live pid on a different host, or a recycled pid, proves nothing
 * ("pid is not authority over liveness" — the same lesson `store-lock.ts`/`named-lock.ts` already
 * encode for lock staleness). A marker older than the TTL is treated as abandoned: it protects
 * nothing, and rotation removes it, recording why in the report's `notes` — that is an honest
 * observation about a stale marker, never a scan error.
 *
 * AM-1 (fix-round): {@link writeReindexMarker} creates the marker file EXCLUSIVELY
 * (`openSync(path, 'wx')`) and stamps it with an ownership `token` (16 random hex chars). A LIVE
 * marker already at that path (another reindex genuinely in flight) refuses this call outright —
 * `{ ok: false, error }`, no snapshot ever taken for the refused call. A marker at or past the TTL
 * is treated as abandoned and replaced. {@link clearReindexMarker} is compare-and-delete: it removes
 * the marker only when the caller's `token` matches the one on disk, so a process can never tear
 * down a marker it does not own (`{ cleared: false, reason }` otherwise). The narrow race this
 * leaves — two `writeReindexMarker` calls racing the exclusive-create step itself — cannot happen
 * in practice: every caller in this codebase invokes it from INSIDE the very snapshot lock this
 * module also provides (see `reindexAgentdbRows`), so at most one writer is ever in this function
 * at a time.
 *
 * @packageDocumentation
 */
import type { StoreLockOptions } from './store-lock.js';
/** A marker older than this is abandoned — its family is no longer protected (FR-3). `pid` is
 * recorded for operator debugging only and is NEVER consulted to decide liveness. */
export declare const REINDEX_MARKER_TTL_MS: number;
/** AM-7: MEASURED (lead, this fix round) — `VACUUM INTO` on the hub's 8.45 MB agentdb store took
 * 96 ms. 5 minutes is ~3000x that, and stays inside named-lock's 600 000 ms override ceiling. A
 * base whose snapshot genuinely needs longer than this needs external coordination, not a bigger
 * default — see the README. */
export declare const AGENTDB_SNAPSHOT_LOCK_STALE_MS = 300000;
/** The reindex-in-progress marker written beside the database while a reindex is running. */
export interface ReindexMarker {
    /** The `<ms>` timestamp of THIS reindex's pre-reindex snapshot family — the value rotation must
     * protect while the marker is live. AM-4: `null` when the reindex's `backupPath` does not match
     * the standard `<db>.pre-reindex-<ms>.bak` family shape (a non-standard target names no family,
     * so it is never a rotation candidate in the first place). */
    readonly ms: number | null;
    /** Operator-debugging only — never consulted for liveness (pid is not authority). */
    readonly pid: number;
    /** Wall-clock start time (`Date.now()`); liveness = `now - startedAt < REINDEX_MARKER_TTL_MS`. */
    readonly startedAt: number;
    /** AM-1: ownership token (16 random hex chars) — {@link clearReindexMarker} removes the marker
     * only when the caller presents this exact token back. */
    readonly token: string;
    /** AM-4: the reindex's actual backup path, always recorded — the only way to identify the
     * snapshot a `ms: null` marker is protecting (an operator debugging a stuck non-standard target
     * has nothing else to go on). */
    readonly backupPath?: string;
    /** Lead edit after re-review (Codex D): set by {@link markReindexMarkerRecoveryRequired} when a
     * rollback FAILED. Such a marker never expires — its family stays protected and every new reindex
     * of this store is refused until an operator restores the snapshot and removes the marker. */
    readonly requiresRecovery?: boolean;
    readonly recoveryNote?: string;
}
/** The marker's path — always beside the database, never in a separate directory. */
export declare function reindexMarkerPath(dbFile: string): string;
/**
 * AM-4: recompute a marker's `ms` from the ACTUAL backup path's filename — decoupled from whatever
 * internal `ms` variable a caller used to build a DEFAULT `backupPath`. A caller-supplied
 * `opts.backupPath` that does not end in the standard `.pre-reindex-<digits>.bak` shape (or whose
 * digits overflow a safe integer) names no family at all, so it maps to `null` — such a target is
 * never a rotation candidate, and the marker must not claim to protect one.
 */
export declare function msFromBackupPath(backupPath: string): number | null;
/**
 * Run `fn` while holding the agentdb snapshot lock for `dbFile` — a pure function of the
 * database's own directory (AC-5), never of `process.cwd()`. Propagates `NamedLockTimeoutError`
 * (FR-4): a caller that cannot acquire the lock by the deadline must report the failure explicitly,
 * never proceed unlocked and never silently skip its work. AM-7: `staleMs` defaults to
 * {@link AGENTDB_SNAPSHOT_LOCK_STALE_MS} unless the caller names its own.
 */
export declare function withAgentdbSnapshotLock<T>(dbFile: string, fn: () => T, opts?: StoreLockOptions): T;
/**
 * AM-1: write the reindex-in-progress marker EXCLUSIVELY. A marker already at this path that is
 * still LIVE (younger than {@link REINDEX_MARKER_TTL_MS}) refuses this write outright —
 * `{ ok: false, error }` naming the marker path, with no snapshot ever attempted by the caller for
 * this call (the caller checks `ok` BEFORE touching the database — see `reindexAgentdbRows`). A
 * marker that is missing, unreadable/corrupt, or past the TTL is replaced. The written marker
 * carries a fresh ownership `token`; only {@link clearReindexMarker} presenting that SAME token may
 * remove it.
 */
export declare function writeReindexMarker(dbFile: string, marker: {
    readonly ms: number | null;
    readonly pid: number;
    readonly startedAt: number;
    readonly backupPath?: string;
}): {
    ok: true;
    token: string;
} | {
    ok: false;
    error: string;
};
/**
 * Lead edit after re-review (Codex D, finding 1): a marker left behind by a FAILED rollback must not
 * quietly expire after the TTL — the snapshot it names may be the only good copy of the store. The
 * owner (token) rewrites the marker atomically (tmp + rename) with `requiresRecovery: true`; from
 * then on {@link readLiveReindexMarkers} protects its family without expiry and
 * {@link writeReindexMarker} refuses every new reindex until an operator removes the marker.
 * Call it under the snapshot lock, like every other marker mutation.
 */
export declare function markReindexMarkerRecoveryRequired(dbFile: string, token: string, recoveryNote: string): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
/**
 * AM-1: compare-and-delete. Removes the marker ONLY when its `token` matches the one on disk — a
 * caller can never tear down a marker it does not own. Absence of the marker file is treated as an
 * already-cleared success (idempotent). Called from `reindexAgentdbRows`'s cleanup on every path
 * that does NOT leave a failed rollback behind (AM-3) — "absence of a receipt is not success" cuts
 * the other way here too: a marker left behind after its owner finished would falsely protect a
 * family forever (until the TTL), so ownership-checked removal must still run unconditionally on
 * every path that is safe to clear.
 */
export declare function clearReindexMarker(dbFile: string, token: string): {
    cleared: true;
} | {
    cleared: false;
    reason: string;
};
/**
 * Read the marker beside `dbFile` and classify it: a marker younger than
 * {@link REINDEX_MARKER_TTL_MS} protects its `ms` (FR-3) — but ONLY when `ms` is an actual number
 * (AM-4: a `ms: null` marker names no family, so it protects nothing, live or not). A marker at or
 * past the TTL is abandoned — it is removed here (rotation must not act on stale-but-still-present
 * state on its NEXT call). AM-6: the note reports "ignored and removed" ONLY once `rmSync` actually
 * succeeded; a removal failure (e.g. a permission error) is reported as "ignored, removal failed:
 * <err>" — never silently claimed as removed. No marker, or a marker this function cannot parse
 * (corrupt / missing fields), yields `{ protectedMs: [], notes: [] }` — never a throw: a malformed
 * marker must not abort rotation, and it also cannot honestly claim to protect anything.
 */
export declare function readLiveReindexMarkers(dbFile: string, now?: number): {
    protectedMs: number[];
    notes: string[];
};
//# sourceMappingURL=agentdb-reindex-marker.d.ts.map