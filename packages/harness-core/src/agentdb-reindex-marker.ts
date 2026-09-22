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
 * {@link withAgentdbSnapshotLock} is a thin, dbFile-addressed wrapper over `withDirLockSync`: the
 * lock lives at `<dirname(dbFile)>/.dz-locks/agentdb-snapshot.lock` (or the pre-existing legacy `.dz/locks` path) — a pure function of the
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

import { closeSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname } from 'node:path';

import { withDirLockSync } from './named-lock.js';
import type { StoreLockOptions } from './store-lock.js';

/** A marker older than this is abandoned — its family is no longer protected (FR-3). `pid` is
 * recorded for operator debugging only and is NEVER consulted to decide liveness. */
export const REINDEX_MARKER_TTL_MS = 60 * 60 * 1000;

/** AM-7: MEASURED (lead, this fix round) — `VACUUM INTO` on the hub's 8.45 MB agentdb store took
 * 96 ms. 5 minutes is ~3000x that, and stays inside named-lock's 600 000 ms override ceiling. A
 * base whose snapshot genuinely needs longer than this needs external coordination, not a bigger
 * default — see the README. */
export const AGENTDB_SNAPSHOT_LOCK_STALE_MS = 300_000;

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
export function reindexMarkerPath(dbFile: string): string {
  return `${dbFile}.reindex-inprogress.json`;
}

/**
 * AM-4: recompute a marker's `ms` from the ACTUAL backup path's filename — decoupled from whatever
 * internal `ms` variable a caller used to build a DEFAULT `backupPath`. A caller-supplied
 * `opts.backupPath` that does not end in the standard `.pre-reindex-<digits>.bak` shape (or whose
 * digits overflow a safe integer) names no family at all, so it maps to `null` — such a target is
 * never a rotation candidate, and the marker must not claim to protect one.
 */
export function msFromBackupPath(backupPath: string): number | null {
  const match = /\.pre-reindex-(\d+)\.bak$/.exec(basename(backupPath));
  if (match === null) return null;
  const ms = Number(match[1]);
  return Number.isSafeInteger(ms) ? ms : null;
}

/**
 * Run `fn` while holding the agentdb snapshot lock for `dbFile` — a pure function of the
 * database's own directory (AC-5), never of `process.cwd()`. Propagates `NamedLockTimeoutError`
 * (FR-4): a caller that cannot acquire the lock by the deadline must report the failure explicitly,
 * never proceed unlocked and never silently skip its work. AM-7: `staleMs` defaults to
 * {@link AGENTDB_SNAPSHOT_LOCK_STALE_MS} unless the caller names its own.
 */
export function withAgentdbSnapshotLock<T>(
  dbFile: string,
  fn: () => T,
  opts: StoreLockOptions = {},
): T {
  return withDirLockSync(dirname(dbFile), 'agentdb-snapshot', fn, {
    staleMs: AGENTDB_SNAPSHOT_LOCK_STALE_MS,
    ...opts,
  });
}

/** Read + best-effort-parse the marker at `path`; `undefined` on any missing/unreadable/corrupt
 * field — callers treat that identically to "no marker" or "not provably live", never as live. */
function tryReadStartedAt(path: string): number | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ReindexMarker>;
    return typeof parsed.startedAt === 'number' && Number.isFinite(parsed.startedAt) ? parsed.startedAt : undefined;
  } catch {
    return undefined;
  }
}

/**
 * AM-1: write the reindex-in-progress marker EXCLUSIVELY. A marker already at this path that is
 * still LIVE (younger than {@link REINDEX_MARKER_TTL_MS}) refuses this write outright —
 * `{ ok: false, error }` naming the marker path, with no snapshot ever attempted by the caller for
 * this call (the caller checks `ok` BEFORE touching the database — see `reindexAgentdbRows`). A
 * marker that is missing, unreadable/corrupt, or past the TTL is replaced. The written marker
 * carries a fresh ownership `token`; only {@link clearReindexMarker} presenting that SAME token may
 * remove it.
 */
export function writeReindexMarker(
  dbFile: string,
  marker: { readonly ms: number | null; readonly pid: number; readonly startedAt: number; readonly backupPath?: string },
): { ok: true; token: string } | { ok: false; error: string } {
  const path = reindexMarkerPath(dbFile);
  const token = randomBytes(8).toString('hex'); // 16 hex chars
  const full: ReindexMarker = { ...marker, token };
  const content = `${JSON.stringify(full)}\n`;

  const tryCreate = (): boolean => {
    let fd: number;
    try {
      fd = openSync(path, 'wx'); // exclusive create — EEXIST if a marker is already there
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
      throw err;
    }
    try {
      writeFileSync(fd, content);
    } finally {
      closeSync(fd);
    }
    return true;
  };

  if (tryCreate()) return { ok: true, token };

  const existing = tryReadMarker(path);
  if (existing?.requiresRecovery === true) {
    return { ok: false, error: `recovery required: a previous reindex of this store failed to roll back — restore ${existing.backupPath ?? 'its snapshot'} manually, then remove marker ${path}` };
  }
  const existingStartedAt = tryReadStartedAt(path);
  const live = existingStartedAt !== undefined && Date.now() - existingStartedAt < REINDEX_MARKER_TTL_MS;
  if (live) {
    return { ok: false, error: `reindex already in progress (marker ${path})` };
  }
  // Stale, missing-field, or unparseable — treated as abandoned and replaced.
  rmSync(path, { force: true });
  if (!tryCreate()) {
    // Practically unreachable (nothing else writes this path outside this module's own lock), but
    // never silently claim success over an unexplained race.
    return { ok: false, error: `reindex already in progress (marker ${path})` };
  }
  return { ok: true, token };
}

function tryReadMarker(path: string): Partial<ReindexMarker> | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return parsed !== null && typeof parsed === 'object' ? (parsed as Partial<ReindexMarker>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Lead edit after re-review (Codex D, finding 1): a marker left behind by a FAILED rollback must not
 * quietly expire after the TTL — the snapshot it names may be the only good copy of the store. The
 * owner (token) rewrites the marker atomically (tmp + rename) with `requiresRecovery: true`; from
 * then on {@link readLiveReindexMarkers} protects its family without expiry and
 * {@link writeReindexMarker} refuses every new reindex until an operator removes the marker.
 * Call it under the snapshot lock, like every other marker mutation.
 */
export function markReindexMarkerRecoveryRequired(
  dbFile: string,
  token: string,
  recoveryNote: string,
): { ok: true } | { ok: false; reason: string } {
  const path = reindexMarkerPath(dbFile);
  const existing = tryReadMarker(path);
  if (existing === undefined) return { ok: false, reason: `marker at ${path} is missing or unreadable` };
  if (existing.token !== token) return { ok: false, reason: `marker at ${path} is owned by a different token` };
  const full = { ...existing, requiresRecovery: true, recoveryNote };
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(full)}\n`);
    renameSync(tmp, path);
    return { ok: true };
  } catch (err) {
    try { rmSync(tmp, { force: true }); } catch { /* best-effort */ }
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * AM-1: compare-and-delete. Removes the marker ONLY when its `token` matches the one on disk — a
 * caller can never tear down a marker it does not own. Absence of the marker file is treated as an
 * already-cleared success (idempotent). Called from `reindexAgentdbRows`'s cleanup on every path
 * that does NOT leave a failed rollback behind (AM-3) — "absence of a receipt is not success" cuts
 * the other way here too: a marker left behind after its owner finished would falsely protect a
 * family forever (until the TTL), so ownership-checked removal must still run unconditionally on
 * every path that is safe to clear.
 */
export function clearReindexMarker(
  dbFile: string,
  token: string,
): { cleared: true } | { cleared: false; reason: string } {
  const path = reindexMarkerPath(dbFile);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { cleared: true };
    return { cleared: false, reason: `cannot read marker: ${err instanceof Error ? err.message : String(err)}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { cleared: false, reason: 'marker is not owned by this token (unparseable marker content)' };
  }
  const owner = parsed !== null && typeof parsed === 'object' ? (parsed as { token?: unknown }).token : undefined;
  if (owner !== token) {
    return { cleared: false, reason: `marker at ${path} is owned by a different token` };
  }
  try {
    rmSync(path, { force: true });
    return { cleared: true };
  } catch (err) {
    return { cleared: false, reason: `removal failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

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
export function readLiveReindexMarkers(
  dbFile: string,
  now: number = Date.now(),
): { protectedMs: number[]; notes: string[] } {
  const path = reindexMarkerPath(dbFile);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { protectedMs: [], notes: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { protectedMs: [], notes: [] };
  }
  if (parsed === null || typeof parsed !== 'object') return { protectedMs: [], notes: [] };
  const { ms, startedAt } = parsed as Partial<ReindexMarker>;
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) {
    return { protectedMs: [], notes: [] };
  }
  const hasFamily = typeof ms === 'number' && Number.isFinite(ms);
  if ((parsed as Partial<ReindexMarker>).requiresRecovery === true) {
    const label = hasFamily ? `ms=${ms}` : 'ms=(none — non-standard backupPath)';
    return { protectedMs: hasFamily ? [ms] : [], notes: [`recovery-required reindex marker (${label}) protects its family without expiry — restore the snapshot manually, then remove ${path}`] };
  }
  if (now - startedAt < REINDEX_MARKER_TTL_MS) {
    return { protectedMs: hasFamily ? [ms] : [], notes: [] };
  }
  // AM-6: only claim "removed" once `rmSync` actually succeeded.
  let removalError: string | undefined;
  try {
    rmSync(path, { force: true });
  } catch (err) {
    removalError = err instanceof Error ? err.message : String(err);
  }
  const label = hasFamily ? `ms=${ms}` : 'ms=(none — non-standard backupPath)';
  const note = removalError === undefined
    ? `stale reindex marker (${label}, startedAt=${new Date(startedAt).toISOString()}) ignored and removed`
    : `stale reindex marker (${label}, startedAt=${new Date(startedAt).toISOString()}) ignored, removal failed: ${removalError}`;
  return { protectedMs: [], notes: [note] };
}
