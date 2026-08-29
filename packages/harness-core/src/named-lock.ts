/**
 * Named advisory locks — `.dz/locks/<name>.lock` (feature qe-bridge-claude, ADR-001 D4-A).
 *
 * WHY. The pattern store already has a cross-process lock (`store-lock.ts`), but it guards ONE
 * resource. Other read-modify-write surfaces in this repo have the same lost-update shape and no
 * guard — the first of them being the `$CODEX_HOME/hooks.json` merge writer, whose race was
 * ACCEPTED as a degradation with an explicit exit condition naming this leg
 * (`architecture/degradations.md`). A read-modify-write that two processes interleave loses one
 * side's addition, and BOTH report success — atomicity (temp+rename) prevents corruption; only
 * mutual exclusion prevents a lost update.
 *
 * WHAT THIS IS. The same `proper-lockfile` machinery as `withStoreLockSync`: atomic `mkdir`
 * acquisition, heartbeat-refreshed staleness (age alone is never liveness), a real acquisition
 * DEADLINE, and a LOUD throw on timeout rather than proceeding unlocked — proceeding would restore
 * exactly the silent lost update this exists to stop. It is emphatically NOT the hand-rolled `wx`
 * file lock that an independent review graded F (`store-lock.ts:14-31`).
 *
 * WHY A MIRROR AND NOT A CALL. `store-lock.ts` keeps its internals private and this feature's
 * out-of-scope fence forbids changing the store lock's semantics, so the ~40 lines of acquisition
 * machinery are mirrored here rather than extracted. The duplication is deliberate and is a named
 * unification candidate; the options type, the stale/timeout defaults and the environment override
 * are IMPORTED from `store-lock.ts`, so the two cannot drift apart on their contract.
 *
 * HONEST LIMIT. This is an ADVISORY lock: it serializes writers that TAKE it. A foreign process
 * that never heard of it writes whenever it likes. For `hooks.json` the pre-existing mitigations
 * (foreign entries preserved byte-for-byte, timestamped backup, atomic temp+rename) remain the
 * backstop for that case, and the rule doc says so in as many words.
 */

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { lockSync } from 'proper-lockfile';

import { LOCK_TIMEOUT_MS, resolveStaleMs } from './store-lock.js';
import type { StoreLockOptions } from './store-lock.js';

/** `proper-lockfile` silently clamps `stale` up to this minimum. */
const MIN_STALE_MS = 2_000;

/** Lock names are filenames: one bounded, lowercase, path-free component. */
const SAFE_LOCK_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isSafeLockName(name: string): boolean {
  return typeof name === 'string' && SAFE_LOCK_NAME.test(name);
}

/** Path of a named lock (a DIRECTORY while held). Throws on an unsafe name — a lock whose path a
 * caller can steer is not a lock. */
export function namedLockPath(projectRoot: string, name: string): string {
  if (!isSafeLockName(name)) {
    throw new NamedLockNameError(name);
  }
  return join(projectRoot, '.dz', 'locks', `${name}.lock`);
}

export class NamedLockNameError extends Error {
  readonly code = 'ELOCKNAME';
  constructor(name: string) {
    super(
      `invalid lock name ${JSON.stringify(name)} — a lock name must match ${String(SAFE_LOCK_NAME)} ` +
      '(one lowercase path-free component); a name carrying a separator would place the lock outside .dz/locks/',
    );
    this.name = 'NamedLockNameError';
  }
}

/** Acquisition gave up at the deadline. Nothing ran; the operation can be retried. */
export class NamedLockTimeoutError extends Error {
  readonly code = 'ELOCKTIMEOUT';
  constructor(lockPath: string, waitedMs: number) {
    super(
      `the lock at ${lockPath} stayed held for ${waitedMs}ms — another process is still inside the ` +
      'guarded section. Nothing was written; retry.',
    );
    this.name = 'NamedLockTimeoutError';
  }
}

/** The lock was broken out from under the holder while `fn` ran: it DID run, but may have raced. */
export class NamedLockCompromisedError extends Error {
  readonly code = 'ECOMPROMISED';
  constructor(lockPath: string, cause: Error) {
    super(`the lock at ${lockPath} was compromised while held (${cause.message}) — retry the operation.`);
    this.name = 'NamedLockCompromisedError';
  }
}

const defaultTimeoutMs = (): number => {
  const env = Number(process.env['DZ_STORE_LOCK_TIMEOUT_MS']);
  return Number.isFinite(env) && env > 0 ? env : LOCK_TIMEOUT_MS;
};

/** Synchronous sleep without spinning (Atomics.wait on a throwaway buffer). */
const sleepSync = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function resolveOpts(opts: StoreLockOptions): { staleMs: number; timeoutMs: number; pollMs: number } {
  return {
    staleMs: Math.max(opts.staleMs ?? resolveStaleMs(), MIN_STALE_MS),
    timeoutMs: opts.timeoutMs ?? defaultTimeoutMs(),
    pollMs: opts.pollMs ?? 25,
  };
}

interface Acquired {
  /** Releases the lock. Returns `'released'` when it was ours, `'stolen'` when it was not (nothing
   * removed, exit-time removal disarmed) and `'stolen-undisarmed'` when it was not ours AND the
   * exit-time removal could not be disarmed — a gap the caller must hear about. */
  readonly release: () => 'released' | 'stolen' | 'stolen-undisarmed';
}

/**
 * DISARMING THE LIBRARY'S EXIT HANDLER (round-2 CRITICAL C2, second mechanism).
 *
 * `proper-lockfile` registers a process-exit handler that `rmdirSync`s every lock still in its
 * internal map — unconditionally, with no ownership check (lockfile.js: "Remove acquired locks on
 * exit"). So even after this module refuses to remove a stolen lock, the holder's PROCESS EXIT
 * removed the successor's live lock a moment later. MEASURED: process C then acquired the lock while
 * B was still inside its critical section.
 *
 * The map is reachable through the library's own `getLocks()` accessor. It is not re-exported by the
 * package index, so this is a deep import — guarded by a runtime shape check, and NEVER silent: if
 * the accessor is missing (a future version moved it), the compromise error says the exit-time
 * removal could not be disarmed, so the gap is reported rather than assumed away.
 */
const lockfileInternals: { getLocks?: () => Record<string, unknown> } = (() => {
  try {
    const req = createRequire(import.meta.url);
    const mod = req('proper-lockfile/lib/lockfile.js') as { getLocks?: unknown };
    return typeof mod.getLocks === 'function' ? { getLocks: mod.getLocks as () => Record<string, unknown> } : {};
  } catch {
    return {};
  }
})();

/** Drop a lock we no longer own from the library's exit-time removal list. Returns false when the
 * accessor is unavailable — the caller says so out loud. */
function disarmExitRemoval(resourceKey: string): boolean {
  const get = lockfileInternals.getLocks;
  if (get === undefined) return false;
  try {
    const locks = get();
    if (Object.prototype.hasOwnProperty.call(locks, resourceKey)) delete locks[resourceKey];
    return true;
  } catch {
    return false;
  }
}

/**
 * OWNERSHIP TOKEN (round-2 CRITICAL C2). `proper-lockfile`'s release is unconditional: it clears its
 * timer and removes the lock directory, without checking that the directory is still the one it
 * created. That is safe while the heartbeat runs — but a SYNCHRONOUS critical section blocks the
 * event loop, so the heartbeat cannot fire, a waiter is entitled to break the stale lock, and the
 * original holder then deletes its SUCCESSOR's live lock on the way out.
 *
 * MEASURED (2026-08-19, three real processes, reproducer in named-lock.test.ts / red-green.md):
 * with a 6s synchronous body under a 2s stale threshold, process C acquired the lock while B was
 * still inside its critical section — mutual exclusion gone, silently.
 *
 * The fix: stamp a random token BESIDE the lock directory at acquisition and verify it at release. A
 * lock that no longer carries our token is somebody else's, and we do not touch it — we report the
 * compromise loudly instead. (The marker lives beside, not inside: `proper-lockfile` removes the
 * lock with a plain `rmdir`, so a file within it would make every release silently fail and leak the
 * lock — MEASURED, the first draft of this fix did exactly that and the suite went red.)
 */
function ownerMarkerPath(lockPath: string): string {
  return lockPath + '.owner';
}

function tryAcquire(
  projectRoot: string,
  name: string,
  staleMs: number,
  onCompromised: (e: Error) => void,
): Acquired | 'held' {
  const lockPath = namedLockPath(projectRoot, name);
  const resourceKey = resolve(projectRoot, '.dz', 'locks', name);
  try {
    const release = lockSync(resourceKey, {
      lockfilePath: lockPath,
      stale: staleMs,
      realpath: false, // the guarded resource is a concept, not an existing file
      onCompromised,
    });
    const token = randomBytes(16).toString('hex');
    let ino: number | null = null;
    try {
      writeFileSync(ownerMarkerPath(lockPath), token, { mode: 0o600 });
      ino = statSync(lockPath).ino;
    } catch { /* an unwritable lock dir: fall back to inode-only evidence below */ }
    return {
      release: (): 'released' | 'stolen' | 'stolen-undisarmed' => {
        let ours = false;
        try {
          const seen = readFileSync(ownerMarkerPath(lockPath), 'utf8');
          const sameIno = ino === null ? true : statSync(lockPath).ino === ino;
          ours = seen === token && sameIno;
        } catch {
          ours = false; // gone, or unreadable — either way not provably ours
        }
        if (!ours) {
          // NEVER remove a lock directory we cannot prove is ours — including at process exit.
          return disarmExitRemoval(resourceKey) ? 'stolen' : 'stolen-undisarmed';
        }
        // Load-bearing order: remove our marker while the directory still excludes waiters. If we
        // unlock first, a successor can acquire and publish its marker before our cleanup runs.
        try {
          rmSync(ownerMarkerPath(lockPath), { force: true });
        } catch { /* best effort: a stale marker is overwritten by the next holder anyway */ }
        try {
          release();
        } catch { /* ERELEASED after a compromise — the lock is no longer ours to remove */ }
        return 'released';
      },
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ELOCKED') return 'held';
    throw err;
  }
}

/**
 * Run `fn` while holding the named lock, releasing it however `fn` ends.
 *
 * Throws {@link NamedLockTimeoutError} when the lock cannot be acquired by the deadline (nothing
 * has run) and {@link NamedLockCompromisedError} when the lock was broken while `fn` ran. The
 * heartbeat cannot fire while a synchronous `fn` blocks the event loop, so keep bodies well under
 * `staleMs` — the same caveat `withStoreLockSync` carries.
 */
export function withNamedLockSync<T>(
  projectRoot: string,
  name: string,
  fn: () => T,
  opts: StoreLockOptions = {},
): T {
  const lockPath = namedLockPath(projectRoot, name); // validates the name BEFORE any mkdir
  const { staleMs, timeoutMs, pollMs } = resolveOpts(opts);
  mkdirSync(join(projectRoot, '.dz', 'locks'), { recursive: true });
  const started = Date.now();
  const deadline = started + timeoutMs;
  let compromised: Error | undefined;
  const onCompromised = (e: Error): void => { compromised = e; };
  for (;;) {
    const got = tryAcquire(projectRoot, name, staleMs, onCompromised);
    if (got !== 'held') {
      let result: T;
      let outcome: 'released' | 'stolen' | 'stolen-undisarmed' = 'released';
      try {
        result = fn();
      } finally {
        outcome = got.release();
      }
      if (outcome !== 'released') {
        throw new NamedLockCompromisedError(
          lockPath,
          compromised ??
            new Error(
              'the lock directory no longer carries this holder\u2019s ownership token; a waiter may have broken it ' +
              'as stale, or another holder\u2019s release may have removed it. The current holder left the observed ' +
              'lock untouched; THIS run must be treated as having raced and retried.' +
              (outcome === 'stolen-undisarmed'
                ? ' WARNING: proper-lockfile\u2019s exit-time lock removal could NOT be disarmed (its getLocks() accessor ' +
                  'is unavailable in this version), so this process may still remove the successor\u2019s lock when it exits.'
                : ''),
            ),
        );
      }
      if (compromised !== undefined) throw new NamedLockCompromisedError(lockPath, compromised);
      return result;
    }
    const now = Date.now();
    if (now >= deadline) throw new NamedLockTimeoutError(lockPath, now - started);
    sleepSync(Math.min(pollMs, deadline - now));
  }
}
