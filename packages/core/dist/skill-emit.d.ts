/**
 * Skill-tree emit + verify — the platform-neutral engine behind every adapter.
 *
 * All four target platforms (Claude Code, Codex, OpenCode, Hermes) consume the
 * same agentskills.io skill directory; they differ only in the root directory
 * they scan. So the emit logic lives here once, parameterised by `skillsRoot`,
 * and each `@dzhechkov/adapter-*` package is a thin wrapper that supplies its
 * platform's root. See `features/extended-a-migration/g4-adapters-research.md`.
 *
 * @packageDocumentation
 */
import type { EmitResult, VerifyResult } from './adapter.js';
import type { CanonicalSkill } from './skill.schema.js';
/** A skill id must be a single, safe path segment. Exported so every adapter
 * (incl. non-skill-tree ones like copilot) can share one id-safety contract. */
export declare function assertSafeId(id: string): void;
/** Normalise an asset path to a forward-slash, project-relative, traversal-free
 * form. Exported so adapters that compose their own paths can reuse it. */
export declare function normalizeAssetPath(rawPath: string): string;
/** Options for {@link emitSkillTree}. */
export interface EmitSkillTreeOptions {
    /** The skills root for the target platform, e.g. `.claude/skills`. */
    readonly skillsRoot: string;
    /** When true, a frontmatter-name / directory mismatch throws instead of warning. */
    readonly strict?: boolean;
}
/**
 * Emit a {@link CanonicalSkill} as an agentskills.io skill directory under
 * `skillsRoot`. **Pure** — returns the files to write, never touches the
 * filesystem, and the same input always yields the same output. The `SKILL.md`
 * content is the skill's document text verbatim, so emit is lossless.
 *
 * @throws if the skill id or an asset path is unsafe, or — in `strict` mode —
 * if the frontmatter `name` does not match the skill directory.
 */
export declare function emitSkillTree(skill: CanonicalSkill, options: EmitSkillTreeOptions): EmitResult;
/** Options for {@link verifySkillTree}. */
export interface VerifySkillTreeOptions {
    /** The skills root the emitted SKILL.md is expected to live under. */
    readonly skillsRoot: string;
}
/**
 * Structurally validate an {@link EmitResult}: exactly one `SKILL.md`, a
 * parseable document envelope, only safe relative paths, located under
 * `skillsRoot`. Carries `emit.warnings` through.
 */
export declare function verifySkillTree(emit: EmitResult, options: VerifySkillTreeOptions): VerifyResult;
//# sourceMappingURL=skill-emit.d.ts.map