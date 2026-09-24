/** One staged artifact for signing, publication and sibling drift. Linux/macOS tar. */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packedTarballName } from './packed-install-smoke.js';
export class UnknownWorkspaceSpecError extends Error {
    constructor(dependency, spec) {
        super(`Unknown workspace dependency spec for ${dependency}: ${spec}; supply a version and use workspace:*, workspace:^ or workspace:~`);
        this.name = 'UnknownWorkspaceSpecError';
    }
}
export function rewriteWorkspaceSpecs(pkgJsonText, siblingVersions) {
    const pkg = JSON.parse(pkgJsonText);
    const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];
    for (const field of fields) {
        const candidate = pkg[field];
        if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate))
            continue;
        const table = candidate;
        for (const [dep, spec] of Object.entries(table)) {
            if (typeof spec !== 'string')
                continue;
            const match = /^workspace:([*^~])$/.exec(spec);
            const version = siblingVersions.get(dep);
            if (match === null) {
                if (spec.startsWith('workspace:') || spec.startsWith('catalog:')) {
                    throw new UnknownWorkspaceSpecError(dep, spec);
                }
                continue;
            }
            if (version === undefined)
                continue;
            const marker = match[1];
            table[dep] = marker === '*' ? version : `${marker}${version}`;
        }
    }
    return JSON.stringify(pkg, null, 2) + '\n';
}
/** Current pins, read afresh so a later sign sees a sibling's new version. */
export function readWorkspaceVersions(repoRoot) {
    const scope = join(repoRoot, 'packages', '@dzhechkov');
    const versions = new Map();
    if (!existsSync(scope))
        return versions;
    for (const entry of readdirSync(scope).sort()) {
        const manifest = join(scope, entry, 'package.json');
        if (!existsSync(manifest))
            continue;
        const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
        if (typeof pkg.name === 'string' && typeof pkg.version === 'string')
            versions.set(pkg.name, pkg.version);
    }
    return versions;
}
// POSIX shell argument quoting: paths may contain spaces, quotes, dollars or backticks.
export function packArtifact(opts) {
    const pkgDir = resolve(opts.pkgDir);
    const destDir = resolve(opts.destDir);
    const manifestPath = join(pkgDir, 'package.json');
    const original = readFileSync(manifestPath);
    try {
        const staged = JSON.parse(rewriteWorkspaceSpecs(original.toString('utf8'), opts.pinVersions));
        // The public rewrite helper historically leaves a known shorthand without a pin unchanged.
        // An artifact must never ship that unresolved value, even when its caller supplied an incomplete map.
        for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies']) {
            const table = staged[field];
            if (table === null || typeof table !== 'object' || Array.isArray(table))
                continue;
            for (const [dependency, value] of Object.entries(table)) {
                if (typeof value === 'string' && /^workspace:[*^~]$/.test(value)) {
                    throw new UnknownWorkspaceSpecError(dependency, value);
                }
            }
        }
        const scripts = staged['scripts'];
        if (scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts)) {
            delete scripts['prepublishOnly'];
        }
        const name = staged['name'];
        const version = staged['version'];
        if (typeof name !== 'string' || typeof version !== 'string')
            throw new Error(`Missing package name/version in ${manifestPath}`);
        mkdirSync(destDir, { recursive: true });
        writeFileSync(manifestPath, JSON.stringify(staged, null, 2) + '\n');
        const execOptions = { cwd: pkgDir, stdio: 'pipe', encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 };
        // The command shape is a CONTRACT: publish's test fake admits exactly this template — double-quoted
        // via JSON.stringify, verbatim from the publish.ts template it replaced (publish-confirm-seam.test.ts).
        opts.exec(`npm pack . --pack-destination ${JSON.stringify(destDir)}`, execOptions);
        const tgzPath = join(destDir, packedTarballName(name, version));
        const listing = opts.exec(`tar -tzf ${JSON.stringify(tgzPath)}`, execOptions);
        const files = listing.split(/\r?\n/).filter(p => p !== '' && !p.endsWith('/')).map(p => p.replace(/^package\//, '')).sort();
        const sha256 = createHash('sha256').update(readFileSync(tgzPath)).digest('hex');
        return { tgzPath, sha256, files };
    }
    finally {
        writeFileSync(manifestPath, original);
    }
}
//# sourceMappingURL=pack-artifact.js.map