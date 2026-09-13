/**
 * Small, shared helpers for the READ-ONLY sqlite paths (`book-kb.ts`, `agentdb-index.ts`,
 * `patterns.ts`) — feature `readonly-residuals`.
 *
 * Two residuals fixed here (`features/readonly-residuals/01_requirements.md`):
 *
 * FR-1. `applyReadonlyPragmas` closes a handle that was already opened by
 * `openSqliteReadOnly` (`@dzhechkov/memory`) if the follow-up `busy_timeout` pragma throws.
 * Before this helper existed, `book-kb.ts`/`agentdb-index.ts` called `db.pragma(...)`
 * directly on the handle's `db`, outside any `try` — a pragma failure left BOTH the native
 * connection and a tmp-copy directory (ADR-001 ladder rung 2) leaked, because `handle.cleanup()`
 * is only wired into the `close()` this code never reaches.
 *
 * FR-2. `classifySqliteReadFailure` tells apart "the native module isn't installed here"
 * (silent JSON fallback, unchanged behaviour) from "the store file itself is unreadable"
 * (corrupt file, permission failure, …) — the second case used to be swallowed by the same
 * bare `catch {}` in `patterns.ts`, so a corrupted `patterns.sqlite` silently looked like
 * "fewer lessons" instead of "the store broke". `warnOnce` prints that second case exactly
 * once per process, on stderr, without changing the JSON-fallback data path.
 */
function closeQuietly(db) {
    try {
        db.close();
    }
    catch {
        // already failing on the caller's side — a close failure here must not mask the real cause
    }
}
/**
 * Run `fn()` and swallow any exception it throws — used for `handle.cleanup()` in the
 * pragma-failure path (fix round 1, MEDIUM #2): a throwing `cleanup()` must not replace the
 * original pragma error the caller is already in the middle of rethrowing.
 */
function cleanupQuietly(fn) {
    try {
        fn();
    }
    catch {
        // the pragma failure is the error of record — a cleanup failure here must not mask it
    }
}
/**
 * Run `db.pragma('busy_timeout = 5000')` on an already-opened read-only handle. If the pragma
 * throws, the connection is closed and `handle.cleanup()` is called (removing a tmp-copy
 * directory, ADR-001 rung 2) BEFORE rethrowing — so a pragma failure never leaks either the
 * native connection or the temporary copy. Both `close()` and `cleanup()` are individually
 * guarded (`closeQuietly` / `cleanupQuietly`, fix round 1, MEDIUM #2) so that EITHER one throwing
 * still lets the original pragma cause reach the caller with the db path attached, and both are
 * still attempted exactly once each regardless of which one (if any) throws.
 */
export function applyReadonlyPragmas(handle, path) {
    try {
        handle.db.pragma('busy_timeout = 5000'); // harmless on a readonly connection — kept for parity with the writer opener
    }
    catch (err) {
        closeQuietly(handle.db);
        cleanupQuietly(() => handle.cleanup());
        const cause = err instanceof Error ? err.message : String(err);
        throw new Error(`failed to prepare ${path} for reading: ${cause}`);
    }
}
/**
 * Loader-specific signatures of "the `better-sqlite3` native module itself could not be loaded"
 * (fix round 1, MEDIUM #1 — narrows the classifier after Codex review found the previous bare
 * `/better-sqlite3/.test(msg)` swallowed `better-sqlite3: file is not a database`, a genuine
 * corruption, as if the module were merely absent). Each pattern names a load-time failure mode,
 * never a runtime/data failure that merely happens to mention the package name.
 */
const NATIVE_LOADER_PATTERNS = [
    /Cannot find module ['"]?better-sqlite3/,
    /better-sqlite3 is unavailable/,
    /Could not locate the bindings file/,
    /was compiled against a different Node\.js version/,
    /invalid ELF header/,
    /NODE_MODULE_VERSION/,
];
/**
 * Classify an error caught around `SqliteBackend.openReadOnly` (or an equivalent opener):
 * `'native-unavailable'` only when the failure is genuinely about `better-sqlite3` failing to
 * LOAD — either `code === 'MODULE_NOT_FOUND'` with `better-sqlite3` named in the message or
 * `requireStack` (a bare `MODULE_NOT_FOUND` for an unrelated module is NOT this — it is a
 * different bug and must not be hidden as "native unavailable"), or the message matches one of
 * the {@link NATIVE_LOADER_PATTERNS} native-module-loader signatures (missing module, ABI/version
 * mismatch, corrupt/foreign binary). The existing silent JSON fallback is correct here, nothing
 * changes. Anything else — a corrupt file (`file is not a database`), a permission failure, a
 * genuinely unreadable store — is `'store-unreadable'`: still falls back to JSON (FR-2 does not
 * change returned data), but the caller is expected to warn once via {@link warnOnce}.
 */
export function classifySqliteReadFailure(err) {
    const code = err?.code;
    const msg = err instanceof Error ? err.message : String(err);
    const requireStackRaw = err?.requireStack;
    const requireStack = Array.isArray(requireStackRaw) ? requireStackRaw.join('\n') : '';
    if (code === 'MODULE_NOT_FOUND' && (/better-sqlite3/.test(msg) || /better-sqlite3/.test(requireStack))) {
        return 'native-unavailable';
    }
    if (NATIVE_LOADER_PATTERNS.some((re) => re.test(msg)))
        return 'native-unavailable';
    return 'store-unreadable';
}
const warnedKeys = new Set();
/**
 * Write `text` to stderr the first time this exact `key` is seen in this process, and never
 * again. Used to surface a `'store-unreadable'` classification exactly once per store path per
 * process, instead of once per read call.
 */
export function warnOnce(key, text) {
    if (warnedKeys.has(key))
        return;
    warnedKeys.add(key);
    try {
        process.stderr.write(`${text}\n`);
    }
    catch {
        // a closed/broken stderr must not break the caller's fallback
    }
}
//# sourceMappingURL=sqlite-read-helpers.js.map