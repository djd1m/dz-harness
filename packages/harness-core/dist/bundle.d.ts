/**
 * Emit minimal, self-contained skill bundles for a generic external consumer
 * (e.g. a LangGraph app that loads skills via its own `load_skill`).
 *
 * A bundle is the portable agentskills.io skill directory — `SKILL.md`
 * (YAML frontmatter + instructions, verbatim) plus `references/`, `scripts/`,
 * and `assets/` — with the dz-internal QA artifacts (`schemas/`, `evals/`,
 * `sources.json`) stripped. No `manifest.json` is written (the consumer builds
 * its own file-manifest on load); the skill describes instructions + resources,
 * not graph nodes.
 *
 * @packageDocumentation
 */
/** Options for {@link bundleSkills}. */
export interface BundleOptions {
    /** Skill ids to bundle. */
    readonly ids: readonly string[];
    /** Directories to resolve the ids from (first match wins). */
    readonly skillsDirs: readonly string[];
    /** Root to write bundles under — each lands at `<outRoot>/skills/<id>/`. */
    readonly outRoot: string;
    /** Overwrite existing files. */
    readonly force?: boolean;
}
/** Per-skill outcome of {@link bundleSkills}. */
export interface BundledSkill {
    readonly id: string;
    readonly written: number;
    readonly skipped: number;
    readonly warnings: readonly string[];
}
/** Outcome of {@link bundleSkills}. */
export interface BundleResult {
    readonly bundled: BundledSkill[];
    /** Ids not found in any `skillsDirs`. */
    readonly missing: string[];
}
/**
 * Resolve each id from `skillsDirs`, emit it as a minimal bundle under
 * `<outRoot>/skills/<id>/`, and write it to disk. Idempotent (skips existing
 * files unless `force`). Returns what was written + any unresolved ids.
 */
export declare function bundleSkills(opts: BundleOptions): BundleResult;
//# sourceMappingURL=bundle.d.ts.map