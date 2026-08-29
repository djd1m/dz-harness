// SPDX-2.3 (Software Package Data Exchange) SBOM (Software Bill of Materials) generator for a pack.
//
// Ported from `agent-harness-generator/scripts/sbom.mjs` (RuvNet, MIT). Emits an SPDX-2.3 dependency inventory
// from a `package-lock.json` (npm v1 or v2/v3), falling back to `package.json` dependency ranges when no lockfile
// is present. PURE: operates over injected JSON + an injected `created` timestamp (no wall-clock → deterministic;
// packages sorted by name). The CLI (`dz sbom`) reads the files and writes the output.
/** A valid SPDXID tail is `[a-zA-Z0-9.-]+`; map `@scope/name` → `scope-name`. */
function spdxId(name) {
    return 'SPDXRef-Package-' + name.replace(/^@/, '').replace(/[^a-zA-Z0-9.-]+/g, '-');
}
/** purl (package URL) for an npm dep: scope becomes a url-encoded namespace. */
function npmPurl(name, version) {
    const v = version && version !== 'NOASSERTION' ? `@${version}` : '';
    if (name.startsWith('@')) {
        const slash = name.indexOf('/');
        if (slash > 0) {
            const scope = encodeURIComponent(name.slice(0, slash)); // %40scope
            return `pkg:npm/${scope}/${name.slice(slash + 1)}${v}`;
        }
    }
    return `pkg:npm/${name}${v}`;
}
function licenseOf(v) {
    if (typeof v === 'string' && v.length > 0)
        return v;
    if (v && typeof v === 'object' && typeof v.type === 'string')
        return v.type;
    return 'NOASSERTION';
}
/** Extract deps from a lockfile (npm v2/v3 `packages` map, or v1 `dependencies` tree) or a package.json. */
function extractDeps(input) {
    const out = new Map();
    const add = (name, version, license, dev) => {
        if (!name)
            return;
        const key = `${name}@${version}`;
        if (!out.has(key))
            out.set(key, { name, version, license, dev });
    };
    const lock = input.lock;
    // npm v2/v3: flat `packages` map keyed by node_modules path ("" = root, skip it).
    if (lock && lock.packages && typeof lock.packages === 'object') {
        for (const [path, meta] of Object.entries(lock.packages)) {
            if (path === '' || !path.includes('node_modules/'))
                continue;
            const m = meta;
            if (m.dev && !input.includeDev)
                continue;
            const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
            add(name, typeof m.version === 'string' ? m.version : 'NOASSERTION', licenseOf(m.license), !!m.dev);
        }
        return [...out.values()];
    }
    // npm v1: nested `dependencies` tree.
    if (lock && lock.dependencies && typeof lock.dependencies === 'object') {
        const walk = (deps) => {
            for (const [name, meta] of Object.entries(deps)) {
                const m = meta;
                if (m.dev && !input.includeDev)
                    continue;
                add(name, typeof m.version === 'string' ? m.version : 'NOASSERTION', licenseOf(m.license), !!m.dev);
                if (m.dependencies)
                    walk(m.dependencies);
            }
        };
        walk(lock.dependencies);
        return [...out.values()];
    }
    // fallback: package.json ranges (no resolved versions).
    const pkg = input.pkg;
    if (pkg) {
        for (const [name, range] of Object.entries(pkg.dependencies ?? {}))
            add(name, String(range), 'NOASSERTION', false);
        if (input.includeDev)
            for (const [name, range] of Object.entries(pkg.devDependencies ?? {}))
                add(name, String(range), 'NOASSERTION', true);
    }
    return [...out.values()];
}
/** Build an SPDX-2.3 SBOM document. Pure + deterministic (injected `created`; packages sorted by name+version). */
export function buildSbom(input) {
    const deps = extractDeps({ lock: input.lock, pkg: input.pkg, includeDev: !!input.includeDev })
        .sort((a, b) => (a.name === b.name ? (a.version < b.version ? -1 : 1) : a.name < b.name ? -1 : 1));
    const packages = deps.map((d) => ({
        SPDXID: spdxId(`${d.name}-${d.version}`),
        name: d.name,
        versionInfo: d.version,
        downloadLocation: 'NOASSERTION',
        licenseConcluded: d.license,
        licenseDeclared: d.license,
        externalRefs: [{ referenceCategory: 'PACKAGE-MANAGER', referenceType: 'purl', referenceLocator: npmPurl(d.name, d.version) }],
    }));
    return {
        spdxVersion: 'SPDX-2.3',
        dataLicense: 'CC0-1.0',
        SPDXID: 'SPDXRef-DOCUMENT',
        name: `${input.name}-sbom`,
        documentNamespace: input.namespace ?? `urn:dz:sbom:${input.name.replace(/^@/, '').replace(/[^a-zA-Z0-9.-]+/g, '-')}`,
        creationInfo: { created: input.created, creators: ['Tool: dz-sbom'] },
        packages,
        relationships: packages.map((p) => ({ spdxElementId: 'SPDXRef-DOCUMENT', relationshipType: 'DESCRIBES', relatedSpdxElement: p.SPDXID })),
    };
}
/** Shape check for `--validate-only`: returns the problems (empty ⇒ valid SPDX-2.3 skeleton). */
export function validateSbom(doc) {
    const problems = [];
    const d = doc;
    if (!d || typeof d !== 'object')
        return ['not an object'];
    if (d.spdxVersion !== 'SPDX-2.3')
        problems.push('spdxVersion must be SPDX-2.3');
    if (d.SPDXID !== 'SPDXRef-DOCUMENT')
        problems.push('SPDXID must be SPDXRef-DOCUMENT');
    if (!Array.isArray(d.packages))
        problems.push('packages must be an array');
    if (!d.creationInfo || typeof d.creationInfo.created !== 'string')
        problems.push('creationInfo.created missing');
    return problems;
}
//# sourceMappingURL=sbom.js.map