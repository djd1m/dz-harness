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
export declare function discoverSkillPackDirs(cwd: string): {
    pack: string;
    dir: string;
}[];
/**
 * Every directory that CARRIES skills a user can invoke — the catalogue question.
 *
 * A third enumerator on purpose, by the same ADR-001 reasoning that split signature verification
 * from pack discovery. `discoverSkillPackDirs` answers "which SKILL PACKS are here?" and the
 * `skills-` prefix is the right answer to THAT — AM-1 pins it, and widening it would let a plugin
 * be counted as a pack. This function asks something else: "what can the assistant actually offer
 * the user?" — and there the prefix is wrong.
 *
 * MEASURED 2026-09-01: 41 skill names existed on disk and were absent from `dz registry` —
 * every medical skill of `health-advisor` (31 SKILL.md), plus keysarium, p-replicator,
 * design-thinking, trip-planner, evidence-wiki. That gap is not "fewer results": `skill-advisor`
 * must check a name against this catalogue and treat an unlisted one as a fabrication, so an
 * invisible skill turns a hallucination guard into a ban on naming the right answer — asked about
 * blood tests, a live session answered "there is no medical skill in the DZ catalogue" with 31 of
 * them on disk. An authoritative denial of existence is worse than an empty result: it closes the
 * question.
 *
 * The double-count AM-1 guards against is handled where it belongs — `buildRegistry` dedupes by
 * skill id, so a skill reachable through both its canon and a plugin is listed once.
 */
export declare function discoverSkillCarryingDirs(cwd: string): {
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
    /**
     * Repo-relative path of the skill directory. Stored rather than reconstructed: a skill lives in
     * one of three layouts (pack root, `skills/`, `templates/.claude/skills/`), so `<pack>/<id>` is
     * a guess that silently breaks for two of them — the plugin generator built exactly that guess
     * and produced unresolvable paths the moment the catalogue learned the other layouts.
     */
    readonly path?: string;
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