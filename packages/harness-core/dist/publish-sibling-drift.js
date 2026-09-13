/**
 * Sibling-drift gate — feature `publish-sibling-drift-gate`, ADR-001 (Decision 1).
 *
 * `rewriteWorkspaceSpecs` (publish.ts) pins a sibling `workspace:^`/`workspace:~`/`workspace:*`
 * dependency to the EXACT version currently on disk. That version may be published on the
 * registry carrying an OLDER build than the workspace — the sibling changed without a version
 * bump. The pinned range then resolves at install time to a package that does not match the
 * workspace's current behavior, and a fresh `npm install` reproduces whatever regressed.
 *
 * Detection (ADR-001, Decision 1, alternative А3 — accepted): hash every file under the
 * published tarball's `dist/**` plus its `package.json` (with `version`/`gitHead`/`_*` fields
 * stripped, since those legitimately differ between the registry copy and the workspace copy),
 * and compare against the same hash of the workspace copy. Any difference is drift. A published
 * `dist/index.js` missing an export the workspace's `dist/index.js` declares is surfaced as a
 * SECOND, more readable signal (`missingExports`) — the exact shape of the 2026-09-13 incident
 * ("does not provide an export named …") — but the hash comparison is the load-bearing check:
 * it also catches behavior changes that keep every export name intact.
 *
 * Network access is NOT this module's concern (NFR-2: pure, no network, fixture-testable):
 * `fetchPublished` is injected. The CLI implementation packs the sibling from the registry via
 * `npm pack <name>@<version>` into a temp dir; tests inject a local directory. A fetch that
 * returns `null` (offline, 404, timeout) is reported as `'unavailable'` — never silently treated
 * as `'same'` (the "a gate that infers a pass from silence breaks on the next failure path"
 * lesson): the caller decides whether `'unavailable'` blocks or is overridden.
 *
 * @packageDocumentation
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
function listFilesRecursive(root, dir) {
    if (!existsSync(dir))
        return [];
    const out = [];
    for (const entry of readdirSync(dir).sort()) {
        const abs = join(dir, entry);
        const st = statSync(abs);
        if (st.isDirectory())
            out.push(...listFilesRecursive(root, abs));
        else
            out.push(relative(root, abs));
    }
    return out;
}
function sha256(data) {
    return createHash('sha256').update(data).digest('hex');
}
/** package.json normalized for comparison: strip fields that legitimately differ (version, gitHead, npm-internal `_*`). */
function normalizedPackageJsonText(dir) {
    const p = join(dir, 'package.json');
    if (!existsSync(p))
        return undefined;
    try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'));
        const kept = {};
        for (const key of Object.keys(raw).sort()) {
            if (key === 'version' || key === 'gitHead' || key.startsWith('_'))
                continue;
            kept[key] = raw[key];
        }
        return JSON.stringify(kept);
    }
    catch {
        return undefined;
    }
}
/** Hash every dist/** file (by content) plus the normalized package.json, keyed by a stable relative path. */
function hashTree(dir) {
    const map = new Map();
    const distDir = join(dir, 'dist');
    for (const rel of listFilesRecursive(distDir, distDir)) {
        map.set(join('dist', rel), sha256(readFileSync(join(distDir, rel))));
    }
    const pkgNorm = normalizedPackageJsonText(dir);
    if (pkgNorm !== undefined)
        map.set('package.json', sha256(pkgNorm));
    return map;
}
function extractExportNames(source) {
    const names = new Set();
    for (const m of source.matchAll(/export\s+(?:const|function|class|async\s+function)\s+([A-Za-z0-9_$]+)/g)) {
        names.add(m[1]);
    }
    for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part.trim().split(/\s+as\s+/).pop()?.trim();
            if (name)
                names.add(name);
        }
    }
    return names;
}
/** А2 (ADR-001, rejected as the sole signal, kept as a readable second signal). */
function missingExportNames(publishedDir, workspaceDir) {
    const pubIndex = join(publishedDir, 'dist', 'index.js');
    const wsIndex = join(workspaceDir, 'dist', 'index.js');
    if (!existsSync(pubIndex) || !existsSync(wsIndex))
        return [];
    const pubExports = extractExportNames(readFileSync(pubIndex, 'utf-8'));
    const wsExports = extractExportNames(readFileSync(wsIndex, 'utf-8'));
    return [...wsExports].filter((n) => !pubExports.has(n)).sort();
}
/**
 * For every `workspace:`-declared dependency of a package that is NOT part of `batch` (i.e. will
 * be pinned to whatever is already on the registry, not published fresh in this run), compare the
 * build that will be pinned against the workspace copy. Pure: all IO (fetch, fs) is either
 * injected or scoped to reading local dist/package.json files — no network call is made here.
 */
export function detectSiblingDrift(opts) {
    const results = [];
    const seen = new Set();
    const entries = [...Object.entries(opts.dependencies ?? {}), ...Object.entries(opts.peerDependencies ?? {})];
    for (const [dep, spec] of entries) {
        if (!String(spec).startsWith('workspace:'))
            continue;
        if (seen.has(dep))
            continue;
        seen.add(dep);
        if (opts.batch.has(dep))
            continue; // publishes fresh in this batch — nothing stale to drift from
        const version = opts.workspaceVersions.get(dep);
        const workspaceDir = opts.workspaceDirs.get(dep);
        if (version === undefined || workspaceDir === undefined)
            continue; // not a workspace package we know about
        const fetched = opts.fetchPublished(dep, version);
        if (fetched === null) {
            results.push({
                name: dep,
                version,
                status: 'unavailable',
                changedFiles: [],
                missingExports: [],
                reason: `could not fetch ${dep}@${version} from the registry (network unavailable or the version was not found)`,
            });
            continue;
        }
        const publishedHashes = hashTree(fetched.dir);
        const workspaceHashes = hashTree(workspaceDir);
        const allKeys = new Set([...publishedHashes.keys(), ...workspaceHashes.keys()]);
        const changed = [];
        for (const key of allKeys) {
            if (publishedHashes.get(key) !== workspaceHashes.get(key))
                changed.push(key);
        }
        changed.sort();
        if (changed.length === 0) {
            results.push({ name: dep, version, status: 'same', changedFiles: [], missingExports: [] });
        }
        else {
            results.push({
                name: dep,
                version,
                status: 'drift',
                changedFiles: changed,
                missingExports: missingExportNames(fetched.dir, workspaceDir),
            });
        }
    }
    return results;
}
//# sourceMappingURL=publish-sibling-drift.js.map