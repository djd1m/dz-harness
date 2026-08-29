/**
 * Compile step — `CanonicalSkill` into the Claude Code file layout.
 *
 * A thin wrapper over `@dzhechkov/core`'s platform-neutral `emitSkillTree`
 * engine: Claude Code's skill format *is* the agentskills.io standard, so the
 * only Claude-specific thing here is the skills root.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill, CompileContext, EmitResult } from '@dzhechkov/core';
/** The directory Claude Code scans for project skills. */
export declare const CLAUDE_SKILLS_ROOT = ".claude/skills";
/**
 * Compile a canonical skill into the files Claude Code expects, under
 * `.claude/skills/<id>/`. Pure; see {@link emitSkillTree}.
 */
export declare function compileToClaudeFiles(skill: CanonicalSkill, ctx: CompileContext): EmitResult;
//# sourceMappingURL=compile.d.ts.map