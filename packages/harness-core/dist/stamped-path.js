/**
 * Pure on purpose: harness-core's IO ratchet (test/core-boundary.test.ts) counts files that import node:fs — callers that
 * already do IO pass their own `exists` / `write` (MEASURED 2026-09-25: a default `existsSync` here tripped it, 65 → 66).
 */
/**
 * Return the first unused stamped path, adding a counter suffix on collision.
 * check-then-act: safe within one process or under a lock; for unlocked cross-process writers use writeUniqueStampedFile
 */
export function uniqueStampedPath(base, stamp, exists) {
    let candidate = `${base}${stamp}`;
    for (let n = 1; exists(candidate); n += 1)
        candidate = `${base}${stamp}-${n}`;
    return candidate;
}
/** Atomically create a stamped file, trying at most 1000 candidates on EEXIST. */
export function writeUniqueStampedFile(base, stamp, data, write) {
    for (let n = 0; n < 1000; n += 1) {
        const candidate = n === 0 ? `${base}${stamp}` : `${base}${stamp}-${n}`;
        try {
            write(candidate, data, { flag: 'wx' });
            return candidate;
        }
        catch (error) {
            if (error?.code !== 'EEXIST')
                throw error;
        }
    }
    const error = new Error(`No free stamped file after 1000 attempts: ${base}${stamp}`);
    error.name = 'UniqueStampedFileExhaustedError';
    throw error;
}
//# sourceMappingURL=stamped-path.js.map