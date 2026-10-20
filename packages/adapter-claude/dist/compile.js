/**
 * Compile step — `CanonicalSkill` into the Claude Code file layout.
 *
 * A thin wrapper over `@dzhechkov/core`'s platform-neutral `emitSkillTree`
 * engine: Claude Code's skill format *is* the agentskills.io standard, so the
 * only Claude-specific thing here is the skills root.
 *
 * @packageDocumentation
 */
import { emitSkillTree } from '@dzhechkov/core';
/** The directory Claude Code scans for project skills. */
export const CLAUDE_SKILLS_ROOT = '.claude/skills';
/**
 * Compile a canonical skill into the files Claude Code expects, under
 * `.claude/skills/<id>/`. Pure; see {@link emitSkillTree}.
 */
export function compileToClaudeFiles(skill, ctx) {
    return emitSkillTree(skill, { skillsRoot: CLAUDE_SKILLS_ROOT, strict: ctx.strict === true });
}
//# sourceMappingURL=compile.js.map