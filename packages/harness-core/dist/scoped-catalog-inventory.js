/** Explicit package scope and its shared registry projection. No ambient discovery. */
import { createHash } from 'node:crypto';
import { basename, isAbsolute, relative, sep } from 'node:path';
import { buildRegistryFromCarriers } from './registry.js';
/**
 * Packages and ordered carrier references are explicit. Repeated physical copies retain their
 * diagnostic paths, while identical package/version/artifact identities count once. Supplying
 * normalized occurrences selects the same process-free aggregation used by captured evidence.
 */
export function buildScopedCatalogInventory(input) {
    const packages = input.packages.map((pkg) => ({ ...pkg, occurrences: [] }));
    const roots = new Map(input.packages.map((pkg, index) => [pkg.dir, index]));
    if (roots.size !== input.packages.length)
        throw new Error('catalog: duplicate physical package root');
    const seenCarriers = new Set();
    const carriers = input.carriers.map((carrier) => {
        const index = roots.get(carrier.dir);
        if (index === undefined)
            throw new Error(`catalog: carrier has no package: ${carrier.dir}`);
        const pkg = input.packages[index];
        const pack = carrier.pack ?? basename(pkg.name);
        if (seenCarriers.has(pack))
            throw new Error(`catalog: duplicate carrier identity: ${pack}`);
        seenCarriers.add(pack);
        return { ...pkg, pack };
    });
    const registry = buildRegistryFromCarriers(input.cwd, carriers, (carrier, occurrence) => {
        packages[roots.get(carrier.dir)].occurrences.push(occurrence);
    });
    // Package-local facts must include non-discoverable copies too. Each scan is explicit, and
    // normalized facts can be aggregated without touching the filesystem.
    for (let index = 0; index < packages.length; index += 1) {
        if (input.carriers.some((carrier) => carrier.dir === packages[index].dir))
            continue;
        const pkg = input.packages[index];
        buildRegistryFromCarriers(input.cwd, [{ ...pkg, pack: basename(pkg.name) }], (_carrier, occurrence) => {
            packages[index].occurrences.push(occurrence);
        });
    }
    const memberships = packages.map((pkg) => ({
        name: pkg.name, version: pkg.version, artifact: pkg.artifact ?? null, dir: isAbsolute(pkg.dir) ? relative(input.cwd, pkg.dir).split(sep).join('/') : pkg.dir,
        private: pkg.private === true,
        occurrences: pkg.occurrences,
        ids: [...new Set(pkg.occurrences.map((occurrence) => occurrence.id))].sort(),
        layouts: [...new Set(pkg.occurrences.map((occurrence) => occurrence.layout))].sort(),
    }));
    const rows = input.carriers.map((carrier) => {
        const pkg = memberships[roots.get(carrier.dir)];
        return { ...pkg, pack: carrier.pack ?? basename(pkg.name), skills: pkg.ids.length };
    }).sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
    const winners = registry.entries.map(({ id, pack, category }) => ({ id, pack, category }));
    const canonical = {
        packages: memberships,
        carriers: carriers.map(({ dir, pack }) => ({ dir: isAbsolute(dir) ? relative(input.cwd, dir).split(sep).join('/') : dir, pack })), winners,
    };
    return {
        packages: memberships, carriers: canonical.carriers, rows, registry,
        totalPackages: new Set(input.packages.map((pkg) => JSON.stringify([pkg.name, pkg.version, pkg.artifact ?? null]))).size,
        totalCarriers: registry.totalPacks, totalSkills: registry.totalSkills,
        categories: registry.categories,
        membershipDigest: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
    };
}
//# sourceMappingURL=scoped-catalog-inventory.js.map