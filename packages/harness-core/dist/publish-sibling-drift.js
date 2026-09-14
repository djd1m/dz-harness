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
import { join, relative, isAbsolute } from 'node:path';
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
/**
 * C-1/AM-4: `npm pack --dry-run --json` is a real subprocess call — the CLI caches its result per
 * absolute directory for the lifetime of ONE `dz publish` run (not per package being checked), so
 * a run that checks the same sibling from more than one dependent package packs it only once. Core
 * itself never runs the subprocess or owns the cache (core-boundary import ratchet) — this parser
 * is the pure half only.
 *
 * Parses `npm pack --dry-run --json`'s stdout (an array with one element; `files[]` holds
 * `{path,size,mode}` per shipped path, plus `integrity`/`shasum`/`entryCount`) into the exact set of
 * relative paths npm intends to ship, honouring `.npmignore`/`files`/default-ignore exactly the way
 * a real `npm publish` would. A failure to run, parse, or make sense of the shape — including a
 * malformed individual `files[]` element (AM-5: a corrupt entry is a reason to say the WHOLE
 * inventory is untrustworthy, never a file to silently drop) — is `{ unavailable: reason }`: an
 * input this gate cannot read is a reason to say so, never a silent "nothing to compare".
 */
export function parseNpmPackInventory(stdout) {
    try {
        const parsed = JSON.parse(stdout);
        const entry = Array.isArray(parsed) ? parsed[0] : undefined;
        const files = entry !== null && typeof entry === 'object' ? entry['files'] : undefined;
        if (!Array.isArray(files))
            return { unavailable: 'npm pack --dry-run --json returned no files[] array' };
        // AM-5 (Codex round-1 finding 6, medium): a malformed element used to be `.filter()`ed out
        // silently — a `files[]` entry npm itself always shapes as `{path,size,mode}` should never fail
        // to parse; if one DOES (missing/non-string `path`, or a non-object element), that is a signal
        // this output cannot be trusted, not a single file to quietly drop from the comparison. Say so.
        const paths = [];
        for (let i = 0; i < files.length; i++) {
            const f = files[i];
            if (f === null || typeof f !== 'object') {
                return { unavailable: `npm pack --dry-run --json files[${i}] is not an object (got ${JSON.stringify(f)})` };
            }
            const path = f['path'];
            if (typeof path !== 'string' || path === '') {
                return { unavailable: `npm pack --dry-run --json files[${i}].path is missing or not a non-empty string (got ${JSON.stringify(path)})` };
            }
            paths.push(path);
        }
        return { paths };
    }
    catch (err) {
        return { unavailable: `npm pack --dry-run --json output could not be parsed: ${err.message.split('\n')[0]}` };
    }
}
/** Hash exactly the paths `npm pack` names (package.json normalized separately, as {@link hashTree} does). */
/**
 * Codex round-2 (2026-09-14) new findings 1+2: a listed path that is absent, a directory, absolute,
 * or that climbs out of `dir` via `..` used to be SKIPPED silently — a comparison over a listing
 * the tree does not match is not a comparison, it is `unavailable`; and an inventory must never
 * read outside the package directory. Thrown here, turned into an `unavailable` result by the caller.
 */
class InventoryListingError extends Error {
}
function hashTreeFromPaths(dir, paths, manifest) {
    const map = new Map();
    for (const rel of paths) {
        if (rel === 'package.json')
            continue; // normalized below, not hashed raw
        if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
            throw new InventoryListingError(`inventory path "${rel}" is absolute or leaves the package directory`);
        }
        const abs = join(dir, rel);
        if (!existsSync(abs))
            throw new InventoryListingError(`inventory path "${rel}" does not exist in the workspace copy`);
        if (statSync(abs).isDirectory())
            throw new InventoryListingError(`inventory path "${rel}" is a directory, not a file`);
        map.set(rel, sha256(readFileSync(abs)));
    }
    map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
    return map;
}
/**
 * AM-1: hash EVERY file under `dir` (the already-unpacked published tarball) — the literal "full
 * recursive walk of what npm put there" the amendment names, used ONLY as the symmetric partner to
 * {@link hashTreeFromPaths} (i.e. only when a `localInventory` provider is injected). `dir` here is
 * always an extracted tarball, never the workspace tree, so there is no `.npmignore` to consult:
 * everything that exists on disk is, by construction, exactly what npm shipped.
 */
function hashTreeFull(dir, manifest) {
    const map = new Map();
    for (const rel of listFilesRecursive(dir, dir)) {
        if (rel === 'package.json')
            continue; // normalized below, not hashed raw
        map.set(rel, sha256(readFileSync(join(dir, rel))));
    }
    map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
    return map;
}
/**
 * package.json PARSED and validated. `null` (never `undefined`) means "this side cannot be built
 * at all" — AM-3: a missing or unparseable manifest on EITHER side must surface as `unavailable`,
 * never as an empty/omitted comparison field that a hash-mismatch loop could silently read as
 * "nothing differs here".
 */
function readManifest(dir) {
    const p = join(dir, 'package.json');
    if (!existsSync(p))
        return null;
    try {
        const raw = JSON.parse(readFileSync(p, 'utf-8'));
        return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
    }
    catch {
        return null;
    }
}
/** package.json normalized for comparison: strip fields that legitimately differ (version, gitHead, npm-internal `_*`). */
function normalizedPackageJsonText(raw) {
    // Lead edit after the live dry-run on the hub (2026-09-13 10:40): the packer strips
    // `scripts.prepublishOnly`, drops devDependencies/publishConfig and rewrites `workspace:` specs to
    // pinned versions — every freshly published sibling read as "1 file drifted". Compare only what
    // shapes the SHIPPED behavior: entry points, bins, files, engines, and dependency NAMES (values
    // are the workspace-floor preflight's business, not this gate's).
    //
    // AM-4: `imports`/`browser`/`sideEffects`/`man` added — each one changes what a consumer actually
    // resolves or ships, exactly like `main`/`exports`/`bin` already did; omitting them was a real gap
    // the round-1 review named (finding 4), not a stylistic nicety.
    const SHIPPING_FIELDS = [
        'name', 'type', 'main', 'module', 'types', 'exports', 'imports', 'browser', 'sideEffects', 'man',
        'bin', 'files', 'engines', 'os', 'cpu',
    ];
    const DEP_TABLES = ['dependencies', 'peerDependencies', 'optionalDependencies'];
    const kept = {};
    for (const key of SHIPPING_FIELDS)
        if (key in raw)
            kept[key] = raw[key];
    for (const key of DEP_TABLES) {
        const table = raw[key];
        if (table !== null && typeof table === 'object')
            kept[key] = Object.keys(table).sort();
    }
    return JSON.stringify(kept);
}
/** Every relative path (from `dir`) that a `bin` field in a parsed manifest resolves to. */
function binPaths(raw) {
    const bin = raw['bin'];
    if (typeof bin === 'string')
        return [bin.replace(/^\.\//, '')];
    if (bin !== null && typeof bin === 'object' && !Array.isArray(bin)) {
        return Object.values(bin)
            .filter((v) => typeof v === 'string')
            .map((v) => v.replace(/^\.\//, ''));
    }
    return [];
}
/**
 * AM-4: the round-1 gate hashed only `dist/**` — a changed bin script, template, or other
 * top-level asset that ships (declared in `package.json#files`, or the `bin` target itself) was
 * invisible to the drift check even though npm ships it byte-for-byte. This is a documented,
 * honest APPROXIMATION of "the whole tarball inventory" (the literal ADR wording), not a full
 * re-implementation of npm's pack-time file-inclusion rules (`.npmignore`, default excludes,
 * nested `.gitignore`): it walks `dist/**` (unconditional — the common case) plus every path
 * named in `files` (directories walked recursively, files hashed directly) plus every resolved
 * `bin` target, deduplicated. A package with no `files` field declared keeps exactly the
 * pre-amendment `dist/**`-only scope, named here rather than silently pretended-away.
 */
function shippedInventoryDirs(dir, raw) {
    const rels = new Set(['dist']);
    const files = raw['files'];
    if (Array.isArray(files)) {
        for (const entry of files) {
            if (typeof entry === 'string' && entry.trim() !== '')
                rels.add(entry.replace(/^\.\//, '').replace(/\/+$/, ''));
        }
    }
    for (const bin of binPaths(raw))
        rels.add(bin);
    return [...rels].filter((rel) => existsSync(join(dir, rel)));
}
/** Hash the shipped inventory (AM-4) plus the normalized package.json, keyed by a stable relative path. */
function hashTree(dir, manifest) {
    const map = new Map();
    for (const rel of shippedInventoryDirs(dir, manifest)) {
        const abs = join(dir, rel);
        if (statSync(abs).isDirectory()) {
            for (const sub of listFilesRecursive(abs, abs))
                map.set(join(rel, sub), sha256(readFileSync(join(abs, sub))));
        }
        else {
            map.set(rel, sha256(readFileSync(abs)));
        }
    }
    map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
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
    // AM-6: named ONCE per call — every result below (including the short-circuited `unavailable`
    // ones) carries the source that is or would have been used for this comparison.
    const inventorySource = opts.localInventory !== undefined ? (opts.localInventorySource ?? 'npm-pack') : 'readdir-approximation';
    // AM-3: `optionalDependencies` ships and pins EXACTLY like `dependencies`/`peerDependencies` —
    // checking only the first two let a stale optional sibling through untouched (round-1 finding 3).
    const entries = [
        ...Object.entries(opts.dependencies ?? {}),
        ...Object.entries(opts.peerDependencies ?? {}),
        ...Object.entries(opts.optionalDependencies ?? {}),
    ];
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
        // AM-3: a `workspace:`-spec'd dependency this caller does not recognize used to be silently
        // SKIPPED — an input this gate cannot build is a HARD gate that cannot say "same", never a
        // quiet pass-through (round-1 finding 3: pnpm would die packing it anyway; die here, named).
        if (version === undefined || workspaceDir === undefined) {
            results.push({
                name: dep,
                version: version ?? '(not in workspace)',
                status: 'unavailable',
                changedFiles: [],
                missingExports: [],
                reason: `${dep} is declared workspace:-protocol but is not a known workspace package`,
                inventorySource,
            });
            continue;
        }
        const fetched = opts.fetchPublished(dep, version);
        if (fetched === null) {
            results.push({
                name: dep,
                version,
                status: 'unavailable',
                changedFiles: [],
                missingExports: [],
                reason: `could not fetch ${dep}@${version} from the registry (network unavailable or the version was not found)`,
                inventorySource,
            });
            continue;
        }
        // AM-3: a missing/unparseable package.json on EITHER side must not silently drop out of the
        // comparison (the old `hashTree` simply omitted the key, which — with an empty/matching
        // `dist/**` on both sides — could report `same` about an input that was never actually read).
        const publishedManifest = readManifest(fetched.dir);
        const workspaceManifest = readManifest(workspaceDir);
        if (publishedManifest === null || workspaceManifest === null) {
            const side = publishedManifest === null ? 'the published tarball' : 'the workspace copy';
            results.push({
                name: dep,
                version,
                status: 'unavailable',
                changedFiles: [],
                missingExports: [],
                reason: `${dep}@${version}: package.json in ${side} is missing or not valid JSON — cannot compare`,
                inventorySource,
            });
            continue;
        }
        // FR-3/AM-1: the LOCAL package's inventory comes from npm, not from a hand-rolled dist/files/bin
        // walk — `.npmignore` (and nested ignore rules) can exclude a file this gate would otherwise walk
        // straight into, producing a false drift about a file npm was never going to ship. AM-1 (Codex
        // review, round-1 finding 3, high): the two sides must stay SYMMETRIC. With a provider injected,
        // the workspace side is npm's OWN shipped-path list; the published side must then be hashed by a
        // FULL recursive walk of the already-unpacked tarball (every file npm actually put there —
        // README/LICENSE included, since npm auto-packs those regardless of `files`), not the narrower
        // `dist`/`files`/`bin` approximation `hashTree` uses — that approximation would silently OMIT an
        // auto-packed README/LICENSE from the published side while the workspace side (via real `npm
        // pack`) correctly includes them, reading as a false "only in workspace" drift. WITHOUT a
        // provider, core has no way to ask npm on either side, so it degrades to the SAME approximation
        // on BOTH sides (symmetry preserved, just cruder) — a named approximation, never a subprocess.
        let workspaceHashes;
        let publishedHashes;
        if (opts.localInventory !== undefined) {
            const localResult = opts.localInventory(workspaceDir);
            if ('unavailable' in localResult) {
                results.push({
                    name: dep,
                    version,
                    status: 'unavailable',
                    changedFiles: [],
                    missingExports: [],
                    reason: `${dep}@${version}: local package inventory unavailable (${localResult.unavailable})`,
                    inventorySource,
                });
                continue;
            }
            try {
                workspaceHashes = 'packedDir' in localResult
                    ? hashTreeFull(localResult.packedDir, workspaceManifest)
                    : hashTreeFromPaths(workspaceDir, localResult.paths, workspaceManifest);
            }
            catch (err) {
                if (!(err instanceof InventoryListingError))
                    throw err;
                results.push({
                    name: dep,
                    version,
                    status: 'unavailable',
                    changedFiles: [],
                    missingExports: [],
                    reason: `${dep}@${version}: local package inventory unusable (${err.message})`,
                    inventorySource,
                });
                continue;
            }
            publishedHashes = hashTreeFull(fetched.dir, publishedManifest);
        }
        else {
            workspaceHashes = hashTree(workspaceDir, workspaceManifest);
            publishedHashes = hashTree(fetched.dir, publishedManifest);
        }
        const allKeys = new Set([...publishedHashes.keys(), ...workspaceHashes.keys()]);
        const changed = [];
        for (const key of allKeys) {
            if (publishedHashes.get(key) !== workspaceHashes.get(key))
                changed.push(key);
        }
        changed.sort();
        if (changed.length === 0) {
            results.push({ name: dep, version, status: 'same', changedFiles: [], missingExports: [], inventorySource });
        }
        else {
            results.push({
                name: dep,
                version,
                status: 'drift',
                changedFiles: changed,
                missingExports: missingExportNames(fetched.dir, workspaceDir),
                inventorySource,
            });
        }
    }
    return results;
}
//# sourceMappingURL=publish-sibling-drift.js.map