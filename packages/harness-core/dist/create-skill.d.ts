/**
 * Skill scaffolder — creates a complete SKILL.md directory structure.
 *
 * Generates: SKILL.md (agentskills.io frontmatter), schemas/output.json,
 * scripts/validate-config.json. Optionally: evals/, references/.
 *
 * @packageDocumentation
 */
/** Options for skill creation. */
export interface CreateSkillOptions {
    /** Skill id (kebab-case directory name). */
    readonly name: string;
    /** One-line description for SKILL.md frontmatter. */
    readonly description: string;
    /** Parent directory where skill dir will be created. Default: `.claude/skills`. */
    readonly skillsDir?: string | undefined;
    /** Include evals/ directory with template. */
    readonly withEvals?: boolean | undefined;
    /** Include references/ directory. */
    readonly withReferences?: boolean | undefined;
    /** Trust tier (1-3). Default: 1. */
    readonly trustTier?: number | undefined;
    /** Generate BTO-compatible eval templates with 3-layer benchmarks. */
    readonly bto?: boolean | undefined;
}
/** Result of skill creation. */
export interface CreateSkillResult {
    readonly skillDir: string;
    readonly filesCreated: readonly string[];
    readonly alreadyExists: boolean;
}
/**
 * Create a new skill directory with all required files.
 *
 * Returns the list of created files. If the skill directory already exists,
 * returns `alreadyExists: true` and creates nothing.
 */
export declare function createSkill(opts: CreateSkillOptions): CreateSkillResult;
//# sourceMappingURL=create-skill.d.ts.map