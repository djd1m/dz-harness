/**
 * Pure on purpose: harness-core's IO ratchet (test/core-boundary.test.ts) counts files that import node:fs — callers that
 * already do IO pass their own `exists` / `write` (MEASURED 2026-09-25: a default `existsSync` here tripped it, 65 → 66).
 */
export type StampedWrite = (path: string, data: string | Uint8Array, options: {
    flag: 'wx';
}) => void;
/**
 * Return the first unused stamped path, adding a counter suffix on collision.
 * check-then-act: safe within one process or under a lock; for unlocked cross-process writers use writeUniqueStampedFile
 */
export declare function uniqueStampedPath(base: string, stamp: string, exists: (p: string) => boolean): string;
/** Atomically create a stamped file, trying at most 1000 candidates on EEXIST. */
export declare function writeUniqueStampedFile(base: string, stamp: string, data: string | Uint8Array, write: StampedWrite): string;
//# sourceMappingURL=stamped-path.d.ts.map