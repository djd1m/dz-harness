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
import type { StoreLockOptions } from './store-lock.js';
export declare function isSafeLockName(name: string): boolean;
/** Path of a named lock (a DIRECTORY while held). Throws on an unsafe name — a lock whose path a
 * caller can steer is not a lock. */
export declare function namedLockPath(projectRoot: string, name: string): string;
export declare class NamedLockNameError extends Error {
    readonly code = "ELOCKNAME";
    constructor(name: string);
}
/** Acquisition gave up at the deadline. Nothing ran; the operation can be retried. */
export declare class NamedLockTimeoutError extends Error {
    readonly code = "ELOCKTIMEOUT";
    constructor(lockPath: string, waitedMs: number);
}
/** The lock was broken out from under the holder while `fn` ran: it DID run, but may have raced. */
export declare class NamedLockCompromisedError extends Error {
    readonly code = "ECOMPROMISED";
    constructor(lockPath: string, cause: Error);
}
/**
 * Run `fn` while holding the named lock, releasing it however `fn` ends.
 *
 * Throws {@link NamedLockTimeoutError} when the lock cannot be acquired by the deadline (nothing
 * has run) and {@link NamedLockCompromisedError} when the lock was broken while `fn` ran. The
 * heartbeat cannot fire while a synchronous `fn` blocks the event loop, so keep bodies well under
 * `staleMs` — the same caveat `withStoreLockSync` carries.
 */
export declare function withNamedLockSync<T>(projectRoot: string, name: string, fn: () => T, opts?: StoreLockOptions): T;
//# sourceMappingURL=named-lock.d.ts.map