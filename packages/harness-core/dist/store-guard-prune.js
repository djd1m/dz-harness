import { sep } from 'node:path';
/**
 * A temp-root candidate that authorizes deletion must be a REAL directory path, never the filesystem
 * root or an empty string. MEASURED 2026-09-20 (cross-family review, P1): `TMPDIR=/` makes
 * `os.tmpdir()` return the single character `"/"` (node strips a trailing slash only when the path is
 * longer than one character), and `isUnder` then matches EVERY absolute path — so every
 * `gone-outside-tmp` mark, which FR-3 exists to protect, would be classified `stale-temp` and deleted.
 * A degenerate candidate authorizes nothing and is dropped here, in the pure half, where it is testable.
 */
function isUsableTmpDir(tmpDir) {
    const trimmed = tmpDir.trim();
    return trimmed.length > 1 && trimmed !== sep && trimmed !== '/';
}
function isUnder(project, tmpDir) {
    const prefix = tmpDir.endsWith(sep) ? tmpDir : `${tmpDir}${sep}`;
    return project === tmpDir || project.startsWith(prefix);
}
export function planStoreGuardPrune(input, deps) {
    const counts = {
        'stale-temp': 0,
        live: 0,
        'gone-outside-tmp': 0,
        unreadable: 0,
    };
    let reclaimableBytes = 0;
    const entries = input.map(({ file, bytes, text }) => {
        let value;
        try {
            value = JSON.parse(text);
        }
        catch {
            counts.unreadable += 1;
            return { file, project: null, bytes, bucket: 'unreadable' };
        }
        if (typeof value !== 'object' || value === null
            || typeof value.project !== 'string'
            || value.project.length === 0) {
            counts.unreadable += 1;
            return { file, project: null, bytes, bucket: 'unreadable' };
        }
        const project = value.project;
        const bucket = deps.exists(project)
            ? 'live'
            : deps.tmpDirs.filter(isUsableTmpDir).some((tmpDir) => isUnder(project, tmpDir))
                ? 'stale-temp'
                : 'gone-outside-tmp';
        counts[bucket] += 1;
        if (bucket === 'stale-temp')
            reclaimableBytes += bytes;
        return { file, project, bytes, bucket };
    });
    return { entries, counts, reclaimableBytes };
}
//# sourceMappingURL=store-guard-prune.js.map