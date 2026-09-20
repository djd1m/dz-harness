/**
 * Fetching a PUBLISHED sibling for the drift gate — behind a seam, so its temp-dir cleanup can be
 * proved by BEHAVIOUR instead of by reading cli.ts.
 *
 * Why this file exists (backlog 4355783440). The production branch runs `npm pack <name>@<version>`
 * over the network, and the only seam that existed (`siblingDriftFetcher`) REPLACES that branch
 * wholesale — so the leak this cleanup prevents was unreachable through it by construction. The
 * cleanup was therefore pinned by a wiring guard that reads cli.ts and asserts three structural
 * facts. That guard is not decorative (three mutations redden it), but it checks the SHAPE of the
 * source, and shape-checking tests broke three times in one day on a legitimate rewording.
 *
 * MEASURED 2026-09-19, the leak itself: 116 `dz-sibling-drift-*` directories at ~18 MB each
 * survived the runs. That is a PRODUCTION path, so it accumulated on the operator's disk.
 *
 * The load-bearing property, and the reason `onTempDir` is a separate callback rather than a
 * return value: the directory is registered for cleanup BEFORE the first call that can throw. A
 * fetch that dies inside `npm pack` still leaves a directory behind, and registering it only on
 * the happy path is exactly how the 2 GB accumulated.
 */
/**
 * `null` means "could not fetch", for EVERY reason: a failing `npm pack`, a tarball that never
 * appeared, a failing extraction. The drift gate reads that as `unavailable` and says so rather
 * than inventing a verdict — an absent published copy is not evidence of no drift.
 */
export function fetchPublishedViaNpmPack(name, version, deps) {
    try {
        const tmp = deps.makeTempDir();
        // BEFORE the first throwing call — see the header. Moving this line below `run` reintroduces
        // the measured leak, and `sibling-drift-fetch.test.ts` fails when it moves.
        deps.onTempDir(tmp);
        deps.run(`npm pack ${name}@${version} --pack-destination ${JSON.stringify(tmp)}`);
        const tarball = deps.listDir(tmp).find((f) => f.endsWith('.tgz'));
        if (tarball === undefined)
            return null;
        deps.run(`tar -xzf ${JSON.stringify(deps.join(tmp, tarball))} -C ${JSON.stringify(tmp)}`);
        return { dir: deps.join(tmp, 'package') };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=sibling-drift-fetch.js.map