/**
 * Skill registry — indexes all skills across skill packs for search and discovery.
 *
 * Scans `packages/@dzhechkov/skills-*` directories, reads SKILL.md frontmatter,
 * and builds a searchable index.
 *
 * @packageDocumentation
 */
/**
 * Resolve every `@dzhechkov` base directory that may hold `skills-*` packs, for a given
 * working directory. Ordered by precedence (first wins on pack-name collision):
 *
 *   1. `<cwd>/packages/@dzhechkov`      — monorepo/dev checkout (source of truth)
 *   2. `<cwd>/node_modules/@dzhechkov`  — project-local npm install
 *   3. self-location                    — where THIS module (harness-core) is installed,
 *      walking up for any `@dzhechkov` ancestor and each `node_modules/@dzhechkov`.
 *
 * Step 3 is what makes a **global** `dz` install work: when `dz` runs in a project that does
 * not itself depend on the skill packs, the packs sit next to the installed `harness-core`
 * (e.g. `.../harness-cli/node_modules/@dzhechkov/skills-*`), a location the cwd-relative
 * scans (1, 2) never reach. Returns only directories that exist, de-duplicated, in order.
 */
export declare function skillPackBaseDirs(cwd: string): string[];
/** List `skills-*` pack directories across all base dirs, de-duplicated by pack name (first wins). */
export declare function discoverSkillPackDirs(cwd: string): {
    pack: string;
    dir: string;
}[];
/**
 * Every pack whose SIGNATURE should be checked: the skill packs above, PLUS any directory in the same
 * base dirs that carries a `.dz-manifest.json`, whatever it is called.
 *
 * A separate function on purpose (ADR-001). `discoverSkillPackDirs` answers "which skill packs are
 * here?" and the `skills-` prefix is a roughly correct answer to THAT. Signature verification asks a
 * different question, and there the prefix is simply wrong: MEASURED 2026-08-21 — 52 signed packs on
 * disk, 26 in the verdict, exactly half invisible, including `keysarium`, `health-advisor`,
 * `harness-core`, `harness-cli` and all ten adapters. `keysarium` drifted from its own signature that
 * same day and the tool said nothing; it was found by a hand-written hash comparison.
 *
 * The UNION rather than a replacement: enumerating only manifest-bearing directories would silently
 * drop the `unsigned` verdict for a `skills-*` pack that carries no manifest — turning "unsigned" into
 * "absent", which is the same class of silence this fixes.
 */
export declare function discoverVerifiablePackDirs(cwd: string): {
    pack: string;
    dir: string;
}[];
/** A single skill in the registry. */
export interface RegistryEntry {
    readonly id: string;
    readonly pack: string;
    readonly description: string;
    readonly trustTier: number;
    readonly hasSchema: boolean;
    readonly hasEvals: boolean;
    readonly lineCount: number;
    readonly category: string;
}
/** The full registry. */
export interface Registry {
    readonly entries: readonly RegistryEntry[];
    readonly totalSkills: number;
    readonly totalPacks: number;
    readonly categories: readonly string[];
}
/**
 * Build the registry from every `skills-*` pack discovered across all base dirs
 * ({@link skillPackBaseDirs}) — monorepo `packages/@dzhechkov`, project-local
 * `node_modules/@dzhechkov`, **and** the CLI's own install location. This is why
 * `dz registry` works for a globally-installed `dz`, not only inside the monorepo.
 */
export declare function buildRegistry(cwd: string): Registry;
/** Search registry by query (matches id and description, case-insensitive). */
export declare function searchRegistry(registry: Registry, query: string): readonly RegistryEntry[];
/** Filter registry by category. */
export declare function filterByCategory(registry: Registry, category: string): readonly RegistryEntry[];
//# sourceMappingURL=registry.d.ts.map