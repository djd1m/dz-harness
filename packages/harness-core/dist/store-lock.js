/**
 * Cross-process exclusive lock for the JSON pattern store — built on `proper-lockfile`.
 *
 * WHY THIS EXISTS. The JSON backend writes ATOMICALLY (temp file + rename), so no reader
 * ever sees a torn file. That is a different property from the one needed here. A teach is
 * a read-modify-write: load every record, add one, write them all back. Two teaches that
 * overlap both load the same N records, and each writes back N+1 — the second rename wins
 * and the first lesson is gone. BOTH processes report success, so a lost lesson is silent.
 * Atomicity prevents corruption; only mutual exclusion prevents a lost update.
 *
 * The SQLite backend has its own transaction locking and does not go through here.
 *
 * WHY `proper-lockfile` AND NOT THE PREVIOUS HAND-ROLLED LOCK. An independent review
 * (Codex gpt-5.6-sol) graded the hand-rolled `wx`-file lock F. Its findings, and how this
 * implementation answers them:
 *
 * 1. *Stale-break deleted a successor's live lock* — the old code `rmSync`'d a lock file
 *    by PATHNAME after deciding it was stale, so two waiters breaking the same stale lock
 *    could delete each other's freshly created locks in a cascade. `proper-lockfile`
 *    acquires with an atomic `mkdir`, and a waiter that breaks a stale lock retries with
 *    staleness DISABLED, so per acquisition attempt it can remove at most the one lock it
 *    observed as stale — never a successor's fresh lock in a loop. The residual
 *    microsecond window (stat-stale → holder replaced → rmdir) is closed by DETECTION:
 *    every holder heartbeats its lock's mtime and treats a foreign mtime as ECOMPROMISED,
 *    which {@link withStoreLock} converts into a loud error instead of a silent lost
 *    update. (This is also the model the RVF spec uses for `.rvf` writer locks:
 *    single-writer advisory lock file + ownership verification before unlink —
 *    `ruvector/docs/research/rvf/spec/09-concurrency-versioning.md`.)
 *
 * 2. *"Unparseable means dead" deleted live locks* — there is no lock BODY to parse any
 *    more. The lock is a directory; its existence is the lock, so the empty-file /
 *    half-written-file misclassification class is structurally gone.
 *
 * 3. *Age was mistaken for liveness* — staleness is now filesystem mtime plus a HEARTBEAT:
 *    the holder refreshes the lock's mtime on a timer (every `staleMs / 2`, ≥ 1s), so a
 *    holder slower than `staleMs` is never broken while alive, and a crashed holder's lock
 *    stops being refreshed and is reclaimed after `staleMs`. Nothing trusts a
 *    self-reported timestamp, so a forged far-future `ts` can no longer block forever.
 *    NOTE: the heartbeat runs on the event loop, so a SYNCHRONOUS critical section longer
 *    than `staleMs` could still be observed as stale — keep {@link withStoreLockSync}
 *    bodies short (they are: single-file JSON rewrites) or raise `staleMs`.
 *
 * 4. *The timeout was not an acquisition deadline* — the retry loops below compute a real
 *    deadline (`now + timeoutMs`), re-check it after EVERY sleep, clamp the last sleep to
 *    the remaining budget, and never acquire after the deadline has passed.
 *
 * 5. *The lock was not store-wide* — every JSON-tier writer in `patterns.ts` now runs
 *    under this lock (see the writer inventory in that module).
 *
 * On timeout this THROWS ({@link StoreLockTimeoutError}) rather than proceeding unlocked.
 * Proceeding would restore exactly the silent lost-update this exists to stop, and a teach
 * that failed loudly can be retried — one that vanished cannot.
 *
 * MIGRATION: the pre-`proper-lockfile` implementation left a regular FILE at
 * `.dz/store.lock`; the library's lock is a DIRECTORY at the same path. A leftover file
 * from a crashed old process is removed only once it is older than `staleMs` — a fresh
 * one is honoured as held, same as any other lock.
 */
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { lockSync } from 'proper-lockfile';
/** A lock whose HEARTBEAT stopped this long ago is presumed abandoned (crashed holder). */
export const STALE_LOCK_MS = 30_000;
/** Give up waiting after this long and say so, rather than blocking a CLI forever. */
export const LOCK_TIMEOUT_MS = 10_000;
/** `proper-lockfile` silently clamps `stale` up to this minimum. */
const MIN_STALE_MS = 2_000;
/** Highest accepted environment override; keeps proper-lockfile's heartbeat timer in range. */
const MAX_STALE_MS = 600_000;
/** Path of the lock guarding a project's pattern store (a DIRECTORY when held). */
export function storeLockPath(projectRoot) {
    return join(projectRoot, '.dz', 'store.lock');
}
/** Acquisition gave up at the deadline. Nothing was written; the operation can be retried. */
export class StoreLockTimeoutError extends Error {
    code = 'ELOCKTIMEOUT';
    constructor(lockPath, waitedMs) {
        super(`the pattern store at ${lockPath} stayed locked for ${waitedMs}ms — ` +
            'another dz process is still writing. Nothing was written; retry.');
        this.name = 'StoreLockTimeoutError';
    }
}
/**
 * The holder detected that its lock was broken out from under it (ECOMPROMISED) — e.g. a
 * waiter reclaimed the lock after this process was suspended past `staleMs`. The critical
 * section DID run, but it may have raced another writer, so the operation must be treated
 * as failed and retried (store writes are idempotent by deterministic record id).
 */
export class StoreLockCompromisedError extends Error {
    code = 'ECOMPROMISED';
    constructor(lockPath, cause) {
        super(`the pattern store lock at ${lockPath} was compromised while held (${cause.message}) — retry the operation.`);
        this.name = 'StoreLockCompromisedError';
    }
}
const defaultTimeoutMs = () => {
    const env = Number(process.env['DZ_STORE_LOCK_TIMEOUT_MS']);
    return Number.isFinite(env) && env > 0 ? env : LOCK_TIMEOUT_MS;
};
export function resolveStaleMs() {
    const env = Number(process.env['DZ_STORE_LOCK_STALE_MS']);
    return Number.isFinite(env) && env > 0 && env <= MAX_STALE_MS ? env : STALE_LOCK_MS;
}
const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });
/** Synchronous sleep without spinning (Atomics.wait on a throwaway buffer). */
const sleepSync = (ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};
/**
 * Remove a REGULAR-FILE lock left by the pre-`proper-lockfile` implementation, but only
 * once it is stale — a fresh legacy lock belongs to a live old-version process and is
 * honoured. (Never deletes a directory: that is a live library lock.)
 */
function clearStaleLegacyLockFile(lockPath, staleMs) {
    try {
        const st = statSync(lockPath);
        if (st.isFile() && Date.now() - st.mtimeMs >= staleMs)
            rmSync(lockPath, { force: true });
    }
    catch { /* gone already — fine */ }
}
/**
 * One acquisition attempt. Returns `'held'` when someone else holds the lock (retry later);
 * throws on real I/O errors. `mkdir`-based, so creation is atomic; staleness is heartbeat
 * mtime, and the library's own stale-break retries with staleness disabled (see header §1).
 */
function tryAcquire(projectRoot, staleMs, onCompromised) {
    const lockPath = storeLockPath(projectRoot);
    try {
        const release = lockSync(resolve(projectRoot, '.dz', 'store'), {
            lockfilePath: lockPath,
            stale: staleMs,
            realpath: false, // the guarded resource is a concept, not an existing file
            onCompromised,
        });
        return {
            release: () => {
                try {
                    release();
                }
                catch { /* ERELEASED after a compromise — the lock is no longer ours to remove */ }
            },
            compromise: () => undefined,
        };
    }
    catch (err) {
        const code = err.code;
        if (code === 'ELOCKED')
            return 'held';
        if (code === 'ENOTDIR') {
            // A stale legacy FILE lock: the library can only rmdir directories. Clear it (only
            // if actually stale) and report 'held' so the caller's loop retries.
            clearStaleLegacyLockFile(lockPath, staleMs);
            return 'held';
        }
        throw err;
    }
}
function resolveOpts(opts) {
    return {
        staleMs: Math.max(opts.staleMs ?? resolveStaleMs(), MIN_STALE_MS),
        timeoutMs: opts.timeoutMs ?? defaultTimeoutMs(),
        pollMs: opts.pollMs ?? 25,
    };
}
/**
 * Run `fn` while holding the store lock, releasing it however `fn` ends.
 *
 * Throws {@link StoreLockTimeoutError} when the lock cannot be acquired by the deadline
 * (nothing has run), and {@link StoreLockCompromisedError} when the lock was broken while
 * `fn` ran (it DID run, but may have raced — retry; store writes are idempotent).
 */
export async function withStoreLock(projectRoot, fn, opts = {}) {
    const { staleMs, timeoutMs, pollMs } = resolveOpts(opts);
    mkdirSync(join(projectRoot, '.dz'), { recursive: true });
    const started = Date.now();
    const deadline = started + timeoutMs;
    let compromised;
    const onCompromised = (e) => { compromised = e; };
    for (;;) {
        const got = tryAcquire(projectRoot, staleMs, onCompromised);
        if (got !== 'held') {
            let result;
            try {
                result = await fn();
            }
            finally {
                got.release();
            }
            if (compromised !== undefined)
                throw new StoreLockCompromisedError(storeLockPath(projectRoot), compromised);
            return result;
        }
        const now = Date.now();
        if (now >= deadline)
            throw new StoreLockTimeoutError(storeLockPath(projectRoot), now - started);
        await sleep(Math.min(pollMs, deadline - now));
    }
}
/**
 * Synchronous {@link withStoreLock}, for the store's synchronous writers (prune / remove).
 * Same deadline and failure semantics. The heartbeat cannot fire while `fn` blocks the
 * event loop, so keep bodies well under `staleMs` (they are: single-file JSON rewrites).
 *
 * CAVEAT: do not contend with an ASYNC `withStoreLock` holder in the SAME process — the
 * sync wait blocks the event loop that would release that holder, so the wait can only
 * end in the loud {@link StoreLockTimeoutError} (never a lost update). Cross-process
 * contention, the case this lock exists for, is unaffected.
 */
export function withStoreLockSync(projectRoot, fn, opts = {}) {
    const { staleMs, timeoutMs, pollMs } = resolveOpts(opts);
    mkdirSync(join(projectRoot, '.dz'), { recursive: true });
    const started = Date.now();
    const deadline = started + timeoutMs;
    let compromised;
    const onCompromised = (e) => { compromised = e; };
    for (;;) {
        const got = tryAcquire(projectRoot, staleMs, onCompromised);
        if (got !== 'held') {
            let result;
            try {
                result = fn();
            }
            finally {
                got.release();
            }
            if (compromised !== undefined)
                throw new StoreLockCompromisedError(storeLockPath(projectRoot), compromised);
            return result;
        }
        const now = Date.now();
        if (now >= deadline)
            throw new StoreLockTimeoutError(storeLockPath(projectRoot), now - started);
        sleepSync(Math.min(pollMs, deadline - now));
    }
}
//# sourceMappingURL=store-lock.js.map