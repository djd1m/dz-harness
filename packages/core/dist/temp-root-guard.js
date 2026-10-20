import * as nodeFs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const consequences = {
    'dz-store': 'Tests inherit this store and locks, and the destructive-guard helper becomes active for every directory below this ancestor.',
    'git-empty': 'An empty .git is not a repository boundary; dz root finders skip it (census-guarded) — warned, not refused.',
    'git-broken': 'A broken .git is not a repository boundary; dz root finders skip it (census-guarded) — warned, not refused.',
    'git-real': 'Tests would anchor to a real repository and inherit its store and locks.',
};
const hazardSeverity = {
    'dz-store': 'blocking',
    'git-real': 'blocking',
    unreadable: 'blocking',
    'git-empty': 'advisory',
    'git-broken': 'advisory',
};
function unreadable(path, error) {
    const reason = (error instanceof Error ? error.message : String(error)).split(/\r?\n/u, 1)[0];
    return { path, kind: 'unreadable', consequence: `This path cannot be checked for inherited project state (${reason}).` };
}
function scanTempRoot(tmp, fs) {
    let realpath;
    try {
        realpath = fs.realpathSync(tmp);
    }
    catch (error) {
        return { hazards: [unreadable(resolve(tmp), error)], realpath: resolve(tmp), count: 0 };
    }
    const hazards = [];
    let count = 0;
    for (let node = realpath;; node = dirname(node)) {
        count += 1;
        let entries = [];
        try {
            entries = fs.readdirSync(node);
        }
        catch (error) {
            if (error.code !== 'ENOENT')
                hazards.push(unreadable(node, error));
        }
        for (const name of ['.dz', '.git']) {
            if (!entries.includes(name))
                continue;
            const path = join(node, name);
            try {
                const directory = fs.lstatSync(path).isDirectory();
                let kind;
                if (name === '.dz') {
                    if (!directory)
                        continue;
                    kind = 'dz-store';
                }
                else if (directory) {
                    const gitEntries = fs.readdirSync(path);
                    kind = gitEntries.length === 0 ? 'git-empty' : gitEntries.includes('HEAD') ? 'git-real' : 'git-broken';
                }
                else {
                    kind = fs.readFileSync(path, 'utf8').startsWith('gitdir:') ? 'git-real' : 'git-broken';
                }
                hazards.push({ path, kind, consequence: consequences[kind] });
            }
            catch (error) {
                // An entry seen by readdir but no longer inspectable is not established clean.
                hazards.push(unreadable(path, error));
            }
        }
        if (dirname(node) === node)
            break;
    }
    return { hazards, realpath, count };
}
export function findTempRootHazards(tmp, fs = nodeFs) {
    return scanTempRoot(tmp, fs).hazards;
}
export function isBlockingHazard({ kind }) {
    return hazardSeverity[kind] === 'blocking';
}
/**
 * Hazards in `after` whose (path, kind) pair is absent from `before`, in `after` order. Pure: no
 * fs, neither input touched. The post-run check feeds it the pre-run and post-run scans so only a
 * hazard CREATED during the run is attributed to it (feature temp-root-post-run-check, FR-1).
 */
export function diffTempRootHazards(before, after) {
    const seen = new Set(before.map(({ path, kind }) => `${path}\u0000${kind}`));
    return after.filter(({ path, kind }) => !seen.has(`${path}\u0000${kind}`));
}
export function assertTempRootClean(tmp, fs = nodeFs, log = console.error) {
    const { hazards, realpath, count } = scanTempRoot(tmp, fs);
    const blocking = hazards.filter(({ kind }) => hazardSeverity[kind] === 'blocking');
    const advisory = hazards.filter(({ kind }) => hazardSeverity[kind] === 'advisory');
    if (blocking.length > 0) {
        log(`dz tmp-root: REFUSED — ${blocking[0].path} — ${blocking[0].kind} (${hazards.length} hazard(s)); a test runner may report this as "No test files found" — it is this refusal, not your filter. remedy: move the entry aside or point TMPDIR at a clean root — this guard never deletes anything`);
        throw new Error([
            'dz tmp-root: refused — unsafe temp-root ancestor chain',
            ...hazards.map(({ path, kind, consequence }) => `${path} — ${kind} — ${consequence}`),
            'remedy: move the entry aside or point TMPDIR at a clean root — this guard never deletes anything',
        ].join('\n'));
    }
    for (const { path, kind } of advisory) {
        log(`dz tmp-root: WARN — ${path} — ${kind} — not a repository boundary; no dz root finder adopts a .git without HEAD (census: harness-core test/root-finder-census.test.ts)`);
    }
    log(`dz tmp-root: clean — ${count} ancestor(s) of ${realpath} checked`);
    // The advisory hazards it just warned about — the post-run check diffs against exactly this
    // scan, so the pre-run chain is walked once (temp-root-post-run-check FR-3).
    return hazards;
}
//# sourceMappingURL=temp-root-guard.js.map