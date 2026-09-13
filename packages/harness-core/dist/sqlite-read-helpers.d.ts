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
/** Minimal shape `applyReadonlyPragmas` needs from an `openSqliteReadOnly` handle. */
export interface PragmaTarget {
    readonly db: {
        pragma: (sql: string) => void;
        close: () => void;
    };
    readonly cleanup: () => void;
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
export declare function applyReadonlyPragmas(handle: PragmaTarget, path: string): void;
/** Which of the two known catch-all reasons a store-opener failure names. */
export type SqliteReadFailureKind = 'native-unavailable' | 'store-unreadable';
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
export declare function classifySqliteReadFailure(err: unknown): SqliteReadFailureKind;
/**
 * Write `text` to stderr the first time this exact `key` is seen in this process, and never
 * again. Used to surface a `'store-unreadable'` classification exactly once per store path per
 * process, instead of once per read call.
 */
export declare function warnOnce(key: string, text: string): void;
//# sourceMappingURL=sqlite-read-helpers.d.ts.map