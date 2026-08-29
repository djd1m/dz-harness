'use strict';

// lock.js — THE ONLY home of mutual exclusion for case-state (ADR-007, from AM-11).
//
// IT CONTAINS NO LOCKING LOGIC OF ITS OWN. It calls `withStoreLock` from
// packages/@dzhechkov/harness-core/src/store-lock.ts — the implementation that survived an
// independent F-grade review (stale-break deleting a successor's live lock; "unparseable means
// dead"; age mistaken for liveness; a timeout that was not a deadline; a lock that was not
// store-wide). The value being reused is that review, not the lines. A second lock in this
// repository would re-earn all five findings, and the sixth would be fixed in only one of them.
//
// WHY A LOCK AT ALL, GIVEN THE ATOMIC WRITE. They answer DIFFERENT failures, and conflating them is
// exactly the mistake AM-11 caught:
//   • temp-file + rename  → answers a TORN READ: no reader ever sees a half-written file.
//   • this lock           → answers a LOST UPDATE: no writer ever discards another writer's record.
// Both stores are read-modify-write: two overlapping `record()` calls each load N and write N+1,
// the second rename wins, one record is gone, and BOTH processes exit 0. Atomicity cannot see that.
//
// REFUSAL IS LOUD, ALWAYS. There is no third resolution step, no `catch` that proceeds unlocked,
// and no environment variable that disables the lock. `learning_bridge.py`'s "absent ⇒ behaves
// exactly as before and says so once" is the right policy for a missing LEARNING loop and the wrong
// one here: a missing learning loop costs learning; a missing lock costs a record, silently.
// Every future patch that wants a `catch` around loadHarnessCore() is arguing with this paragraph,
// and test/case-state-store-mutual-exclusion.test.js part (3) is written to fail the day it lands.

const { AsyncLocalStorage } = require('node:async_hooks');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SPECIFIER = '@dzhechkov/harness-core';
const ENV_VAR = 'HA_CASE_LOCK_MODULE';
const DEFAULT_TIMEOUT_MS = 10000;
const LOCK_SCOPE_DIRNAME = '.case-state';

class CaseLockEscapeError extends Error {
  constructor(message) { super(message); this.name = 'CaseLockEscapeError'; this.code = 'ECASELOCKESCAPE'; }
}

/**
 * The case directory as the FILESYSTEM sees it, not as the string spells it. `path.resolve` is a
 * lexical operation: it folds `..` and `.` but knows nothing about symlinks, so two different
 * strings can name one directory and one string can name a directory somewhere else entirely.
 * Every lock-scope decision in this file is taken on the REAL path, so that a symlinked case dir is
 * NORMALISED (same case ⇒ same lock) rather than treated as a second, independent case.
 */
function realCaseDir(caseDir) {
  const abs = path.resolve(caseDir);
  // Only ENOENT means "not created yet". EACCES / ELOOP / ENOTDIR are real answers about a path
  // that EXISTS and cannot be trusted — swallowing them would substitute a lexical identity for a
  // filesystem one, which is the shape-for-validity mistake this file exists to refuse (S-6).
  try { return fs.realpathSync(abs); } catch (err) { if (err.code !== 'ENOENT') throw err; /* not created yet — resolve what DOES exist */ }

  // A DIRECTORY THAT DOES NOT EXIST YET STILL HAS A REAL PATH: its deepest EXISTING ancestor's real
  // path, plus the components that are still missing.
  //
  // Returning the LEXICAL path here made the pre-creation answer disagree with the post-creation
  // one, and `withCaseLock` re-asserts the scope AFTER harness-core creates it — so a brand-new case
  // under a symlinked parent (`/work -> /srv/work`) was refused with `CaseLockEscapeError`
  // ("SYMLINK escape … Nothing was written") and then SUCCEEDED on an identical retry, because by
  // then the directory existed and both answers agreed. MEASURED across a six-layout battery: that
  // one layout refused and the other five were accepted. A false alarm that vanishes on retry is
  // worse than a hard failure — it is training to ignore the message that also reports the real
  // escape. On macOS `/tmp/new-case` reproduces it (`/tmp -> /private/tmp`).
  //
  // The escape check itself is UNCHANGED: `assertLockRootIsItself` still compares `realpath(root)`
  // with `root` bytewise. Only its input is now the resolved path in the not-yet-created case, so
  // the comparison answers the same question before and after creation. NOT MEASURED, and therefore
  // not claimed: bind-mounted aliases and case-insensitive filesystems (`mount --bind` and
  // `mkfs.vfat` are unavailable in this environment) — a bytewise comparison of two spellings that
  // name one directory is REASONED to be the remaining gap there, not proven.
  const missing = [];
  let cursor = abs;
  for (;;) {
    const parent = path.dirname(cursor);
    if (parent === cursor) return abs;                    // reached the root with nothing resolvable
    missing.unshift(path.basename(cursor));
    try { return path.join(fs.realpathSync(parent), ...missing); } catch (err) { if (err.code !== 'ENOENT') throw err; cursor = parent; }
  }
}

/**
 * The lock's `projectRoot`: a case-state-OWNED subdirectory of the case dir, never the case dir
 * itself (QE G5, AM-13 sub-claim c). harness-core computes its lock path as
 * `<projectRoot>/.dz/store.lock` — so a case whose profile happens to sit at a directory that is
 * also a `dz` project root would otherwise contend for the very lock file `dz teach` uses for its
 * pattern store: unrelated cross-tool interference, and a `.dz/` directory minted inside a
 * patient's case folder as a side effect. Namespacing under `.case-state/` makes the resolved lock
 * path `<caseDir>/.case-state/.dz/store.lock`.
 *
 * THE NON-COLLISION GUARANTEE IS ABOUT THE RESOLVED PATH, AND IT IS ENFORCED, NOT ASSERTED.
 * A previous revision of this docstring claimed the namespaced path "can never equal (nor be
 * path-prefixed by) any project's own `.dz/store.lock`" and derived that claim from `path.join`
 * alone. That is false against a symlink, and it was MEASURED false — reproducer: `caseDir=/tmp/case`
 * with `/tmp/case/.case-state -> /tmp/pattern-project`; `withCaseLock` acquired successfully,
 * `realpath` of the namespaced lock file was `…/pattern-project/.dz/store.lock` (SAME INODE as that
 * project's own lock), and `readdir(caseDir)` showed nothing but the symlink — the lock was entirely
 * OUTSIDE the case directory. harness-core passes `realpath:false` to proper-lockfile and
 * `mkdirSync(…, {recursive:true})` follows symlinked intermediates, so nothing downstream catches it.
 * Both halves of the guarantee — no collision, and the lock lives inside the case dir — failed on
 * that one input.
 *
 * So the scope directory must RESOLVE TO ITSELF. A `.case-state` that is a symlink, or that resolves
 * anywhere other than `<realCaseDir>/.case-state`, is a REFUSAL (`CaseLockEscapeError`) rather than
 * an alternative location: a redirected lock is indistinguishable from a held one, which is the
 * silent lost update ADR-007 exists to prevent.
 *
 * HONEST LIMIT: this is a check, so it has a window. Between this call and harness-core's `mkdir`
 * another process could replace the directory with a symlink. `withCaseLock` therefore re-asserts
 * the same property AFTER acquisition and BEFORE running the caller's `fn`, which narrows the window
 * to one that cannot produce a WRITE through a redirected lock. It does not claim to close it.
 */
function caseLockRoot(caseDir, scopeDirname = LOCK_SCOPE_DIRNAME) {
  const root = path.join(realCaseDir(caseDir), scopeDirname);
  assertLockRootIsItself(root);
  return root;
}

function assertLockRootIsItself(root) {
  let entry;
  // ENOENT only: absent ⇒ harness-core creates a real dir. Any OTHER failure (EACCES, ELOOP,
  // ENOTDIR) is an existing path answering "you may not know what I am" — never a green light (S-6).
  try { entry = fs.lstatSync(root); } catch (err) { if (err.code !== 'ENOENT') throw err; return; }
  if (entry.isSymbolicLink()) {
    throw new CaseLockEscapeError(
      `the case lock scope ${root} is a SYMLINK. The lock would be taken on its target, outside the ` +
      'case directory, and could silently coincide with another project\'s .dz/store.lock (ADR-007). ' +
      'Nothing was written. Remove the symlink and let case-state own a real directory there.'
    );
  }
  let real;
  try { real = fs.realpathSync(root); } catch (err) { if (err.code !== 'ENOENT') throw err; return; }
  if (real !== root) {
    throw new CaseLockEscapeError(
      `the case lock scope ${root} resolves to ${real} — it is reached through a symlink, so the lock ` +
      'would not be inside the case directory it claims to protect (ADR-007). Nothing was written.'
    );
  }
}

// ── "is the lock actually held right now?" ────────────────────────────────────────────────────
//
// `saveFacts` / `saveQuestions` are EXPORTED and synchronous, and they used to write
// unconditionally. MEASURED — reproducer: pre-create `<caseLockRoot>/.dz/store.lock` so that
// `withCaseLock` genuinely refuses with `StoreLockTimeoutError`, then call either saver directly:
// both wrote their file anyway. That is exactly the lost update the lock exists to prevent,
// reachable from the public API, and no amount of "every write site is lexically inside a
// withCaseLock callback" grepping can see it — the grep proves where the CALLS are, not that a
// caller outside this package took the lock. So the property gets a RUNTIME home as well.
//
// HELD-NESS IS SCOPED TO THE ASYNC CONTEXT THAT ACQUIRED THE LOCK, NOT TO THE PROCESS (F-4).
//
// It was a process-global `Map`, so the question the gate actually answered was "is ANY code in
// this pid inside a `withCaseLock` for this scope?" — and every unrelated writer in the process
// answered YES on someone else's lock. MEASURED, in ONE process:
//   holder:   withCaseLock('/tmp/case', …) loads the store, then awaits
//   outsider: a sibling promise — no lock — loadFacts → add record B → saveFacts   ⇒ ADMITTED
//   holder:   resumes and saves its pre-outsider snapshot                          ⇒ ADMITTED
//   both return successfully; the final store holds ONLY the holder's records. B is gone.
// That is the lost update ADR-007 exists to prevent, reached through the public API, and the
// refusal message below promised the caller that holding `withCaseLock` was sufficient — true only
// for the holder. `isCaseLockHeld`'s "by THIS process" docstring was semi-honest about the
// mechanism; it did not make the gate correct, so the MECHANISM changed rather than the wording.
//
// HELD-NESS IS TWO QUESTIONS, AND BOTH ARE ASKED (F3-1). `AsyncLocalStorage` answers WHO: the
// store is established inside the acquisition and is visible to that callback and everything it
// awaits, while a sibling promise created outside it has no store at all and is refused. But ALS
// propagates into EVERY descendant async resource — a `setTimeout`, `setImmediate`,
// `queueMicrotask` or `process.nextTick` scheduled inside the callback still carries the store
// AFTER the lock is released. MEASURED: a deferred `saveFacts` of a stale snapshot, executed after
// release while a second writer had taken the lock and added record B, was ADMITTED — final store
// one record, B lost, both writers exit 0. The round-2 context copy made release "structural",
// which really meant NOTHING ended held-ness at release time at all.
//
// So each acquisition also mints a GRANT — `{ live: true }` — and release is the explicit
// invalidation of that grant in a `finally` (which neither a throw nor an early return can skip).
// The map answers "was this context minted by the acquisition?"; the grant answers "is that
// acquisition still open?". A descendant scheduled inside the callback but executed after release
// still finds the key — and finds its grant dead. A sibling with no store never gets that far. Both
// failure modes are refused at once; the holder's own awaited work sees a live grant throughout.
//
// HONEST LIMITS, stated rather than implied:
//   • This is still an IN-PROCESS gate. Cross-process exclusion is the file lock in harness-core;
//     this only decides whether a caller in THIS process may write. Both are required.
//   • Code the holder itself calls — however deep, across as many awaits as it likes — IS the
//     holder and is admitted. That is the intent, not a hole.
//   • A same-scope NESTED acquisition is unreachable: harness-core's file lock is not reentrant, so
//     it blocks to the timeout. The map therefore never needs to count.
//   • A microtask queued at the callback's very tail can run BEFORE the `finally` invalidates the
//     grant — at that instant the file lock is still physically held, so the write it admits is
//     inside the critical section, not after it. What is closed is held-ness OUTLIVING the lock:
//     once the grant is dead, no descendant writes, ever.
const HELD = new AsyncLocalStorage();

// THE KEY IS (DIRECTORY, SCOPE), NOT DIRECTORY ALONE — because 1.7.0 introduced a SECOND scope in the
// same directory (health-advisor 1.7.0, `intake-archive`, scopeDirname '.intake'). If the key were the
// directory only, holding the `.intake` lock would report the `.case-state` lock as held, and
// `assertCaseLockHeld` — the write precondition that exists to refuse an unlocked writer — would admit
// a case-state write on the strength of an entirely different lock. Two scopes, two keys.
//
// The DEFAULT is byte-identical for every pre-existing caller: `heldKey(dir)` reads the same
// `realCaseDir(dir)` it always did, with the case-state scope name appended, and the appended name is
// the same for every call site that does not pass one.
// The two parts are JSON-ENCODED rather than joined with a separator character: a path may legally
// contain any byte except '/' and NUL, so any chosen separator makes ("/a<sep>b", "c") and ("/a",
// "b<sep>c") collide for SOME input. An encoding injective by construction has no such input — and it
// keeps a raw control byte out of this file, where it would be invisible to every diff and review.
function heldKey(caseDir, scopeDirname = LOCK_SCOPE_DIRNAME) {
  return JSON.stringify([realCaseDir(caseDir), scopeDirname]);
}

/**
 * Is the lock for `caseDir` (in `scopeDirname`, default the case-state scope) held by the CURRENT
 * async context (the code path that took it), by an acquisition that is STILL OPEN (its grant has not
 * been invalidated by release)?
 */
function isCaseLockHeld(caseDir, scopeDirname = LOCK_SCOPE_DIRNAME) {
  const scopes = HELD.getStore();
  if (scopes === undefined) return false;
  const grant = scopes.get(heldKey(caseDir, scopeDirname));
  return grant !== undefined && grant.live === true;
}

/**
 * THE WRITE PRECONDITION. Every store write asserts it; there is no flag that skips it, and it
 * refuses loudly rather than warning — a missing lock costs a record, silently.
 */
function assertCaseLockHeld(caseDir, where, scopeDirname = LOCK_SCOPE_DIRNAME) {
  if (isCaseLockHeld(caseDir, scopeDirname)) return;
  throw new CaseLockUnavailableError(
    `${where} was called WITHOUT the case lock for ${heldKey(caseDir, scopeDirname)}. The atomic write answers a ` +
    'torn read; only the lock answers a LOST UPDATE, and an unlocked writer discards a concurrent ' +
    'writer\'s record while both processes exit 0 (ADR-007). Route the write through ' +
    'facts.record() / questions.answer() / questions.withdraw() / questions.open(), or hold ' +
    'lock.withCaseLock(caseDir, …) around it — from inside THAT call: another part of this process ' +
    'holding the same lock does not admit this write. Nothing was written.'
  );
}

/**
 * How long to WAIT for the lock before refusing loudly. `DZ_STORE_LOCK_TIMEOUT_MS` is harness-core's
 * own documented ops/test knob for exactly this, and honouring it here reuses that contract instead
 * of re-specifying it. Read the guarantee carefully: this knob can only change how long the caller
 * WAITS before `StoreLockTimeoutError`. It can never mean "stop waiting and write anyway" — there is
 * no code path in this file that writes, and a non-finite or non-positive value falls back to the
 * 10 s of ADR-007 §1 rather than to zero. Shortening it makes the refusal come SOONER, never softer.
 */
function timeoutMs() {
  const env = Number(process.env['DZ_STORE_LOCK_TIMEOUT_MS']);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS;
}

class CaseLockUnavailableError extends Error {
  constructor(detail) {
    super(
      `case-state cannot acquire a store lock, so it refuses to write (ADR-007 §3). ${detail}\n` +
      `  remedy 1 — make "${SPECIFIER}" resolvable from ${__dirname} (a repo checkout or a node_modules install);\n` +
      `  remedy 2 — set ${ENV_VAR} to the ABSOLUTE path of harness-core's dist/index.js (the documented\n` +
      '             escape hatch for a detached installed-skill copy, which has no node_modules at all).\n' +
      '  Nothing was written. The store is byte-identical.'
    );
    this.name = 'CaseLockUnavailableError';
    this.code = 'ECASELOCKUNAVAILABLE';
  }
}

/**
 * Resolve harness-core in exactly two documented steps, in order. No third step.
 *
 * ADR-007 §1 wrote step 1 as `createRequire(__filename).resolve(SPECIFIER)`. MEASURED 2026-08-05 —
 * reproducer: a CJS file inside this package running
 * `createRequire(__filename).resolve('@dzhechkov/harness-core')` — that throws
 * ERR_PACKAGE_PATH_NOT_EXPORTED, because harness-core's `exports` map declares an `import`
 * condition only (04_domain_model.md M-12). The step's INTENT — "resolve the package where it is
 * installed" — is unchanged; only the resolver is, from the CJS one that cannot reach an ESM-only
 * exports map to the ESM one that can. Recorded here rather than adjusted silently.
 */
async function loadHarnessCore() {
  let firstError;
  try {
    return await import(SPECIFIER);
  } catch (err) {
    firstError = err;
  }

  const override = process.env[ENV_VAR];
  if (override !== undefined && override !== '') {
    if (!path.isAbsolute(override)) {
      throw new CaseLockUnavailableError(`${ENV_VAR}=${override} is not an absolute path.`);
    }
    try {
      return await import(pathToFileURL(override).href);
    } catch (err) {
      throw new CaseLockUnavailableError(
        `"${SPECIFIER}" did not resolve (${firstError.code || firstError.message}) and ` +
        `${ENV_VAR}=${override} did not load either (${err.code || err.message}).`
      );
    }
  }

  throw new CaseLockUnavailableError(
    `"${SPECIFIER}" did not resolve (${firstError.code || firstError.message}) and ${ENV_VAR} is not set.`
  );
}

/**
 * Run `fn` holding the case's store lock. `caseDir` is the directory the stores live in.
 *
 * `StoreLockTimeoutError` (nothing ran) and `StoreLockCompromisedError` (it ran and may have raced)
 * propagate VERBATIM from harness-core — never caught, never downgraded to a warning.
 *
 * `scopeDirname` (1.7.0) NAMES THE SCOPE, AND ITS DEFAULT IS THE ONLY BEHAVIOUR THAT EXISTED BEFORE.
 * A second, unrelated writer now shares these directories — `intake-archive` takes
 * `withCaseLock(<ws>/sources, fn, { scopeDirname: '.intake' })` — and it must NOT contend with a
 * case-state write in the same workspace: they protect different files and serialising them against
 * each other would be a lock that costs concurrency and buys nothing. Every existing call site passes
 * no options and is byte-identical (test/case-state-one-case-one-lock-scope.test.js and
 * test/case-state-lock-isolation-and-dependency.test.js are the proof, unchanged).
 *
 * WHAT THE PARAMETER CANNOT DO: it cannot weaken the lock. It changes WHICH lock is taken, never
 * whether one is taken; `assertLockRootIsItself` refuses a symlinked scope under any name, and there is
 * still no code path in this file that writes and no flag that proceeds unlocked.
 */
async function withCaseLock(caseDir, fn, { scopeDirname = LOCK_SCOPE_DIRNAME } = {}) {
  if (typeof caseDir !== 'string' || caseDir.trim() === '') {
    throw new TypeError('withCaseLock(caseDir, fn): caseDir must be a non-empty path');
  }
  if (typeof scopeDirname !== 'string' || scopeDirname.trim() === '' || scopeDirname.includes('/') || scopeDirname.includes(path.sep)) {
    // A scope name with a separator in it would relocate the lock out of the directory it claims to
    // protect — the same escape `assertLockRootIsItself` refuses for symlinks, reachable through a
    // parameter instead of through the filesystem.
    throw new TypeError(`withCaseLock(caseDir, fn, {scopeDirname}): scopeDirname must be a single path component, got ${JSON.stringify(scopeDirname)}`);
  }
  const mod = await loadHarnessCore();
  if (typeof mod.withStoreLock !== 'function') {
    throw new CaseLockUnavailableError(`the resolved module exports no withStoreLock() (got ${typeof mod.withStoreLock}).`);
  }
  const root = caseLockRoot(caseDir, scopeDirname); // refuses a symlinked scope BEFORE anything is taken
  const key = heldKey(caseDir, scopeDirname);
  return mod.withStoreLock(root, async () => {
    // Re-assert AFTER acquisition and BEFORE `fn` runs: harness-core has just created the scope, so
    // a symlink swapped in during the window above is caught here, while the store is still
    // untouched. This narrows the race to one that cannot produce a write through a redirected lock.
    assertLockRootIsItself(root);
    // A COPY of whatever this context already holds, plus this scope's fresh GRANT. The copy keeps
    // the WHO structural (the caller's map is simply the one that was there before, so a nested
    // different-scope hold cannot clear the outer one); the grant makes release EXPLICIT: the
    // `finally` below invalidates it the moment `fn` settles — throw or return alike — so a
    // descendant async resource that carries this map into the world after release finds the key
    // and a DEAD grant, and is refused (F3-1). Inherited entries are shared by reference on
    // purpose: when an OUTER acquisition releases, its grant dies in every copy at once.
    const scopes = new Map(HELD.getStore() || []);
    const grant = { live: true };
    scopes.set(key, grant);
    try {
      return await HELD.run(scopes, () => fn());
    } finally {
      grant.live = false;
    }
  }, { timeoutMs: timeoutMs() });
}

module.exports = {
  withCaseLock, loadHarnessCore, caseLockRoot, realCaseDir,
  isCaseLockHeld, assertCaseLockHeld,
  CaseLockUnavailableError, CaseLockEscapeError,
  SPECIFIER, ENV_VAR, DEFAULT_TIMEOUT_MS, LOCK_SCOPE_DIRNAME, timeoutMs,
};
