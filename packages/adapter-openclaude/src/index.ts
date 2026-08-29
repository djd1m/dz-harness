/**
 * `@dzhechkov/adapter-openclaude` — the OpenClaude platform adapter.
 *
 * Implements the [`@dzhechkov/core`](../core) `Adapter` contract for the
 * `openclaude` platform: it compiles a `CanonicalSkill` into the
 * `.openclaude/skills/<id>/` layout OpenClaude scans.
 *
 * OpenClaude (gitlawb/openclaude, 28K+ stars) is an open-source coding-agent
 * CLI that supports multiple LLM providers. It discovers skills from
 * `.claude/skills/` (project-level, same as Claude Code) and
 * `~/.openclaude/skills/` (user-level). This adapter targets the project-level
 * `.openclaude/skills/` path for explicit OpenClaude installations.
 *
 * @packageDocumentation
 */

import { emitSkillTree, verifySkillTree } from '@dzhechkov/core';
import type { Adapter, CanonicalSkill, CompileContext, EmitResult, VerifyResult } from '@dzhechkov/core';

/** The directory OpenClaude scans for project skills. */
export const OPENCLAUDE_SKILLS_ROOT = '.openclaude/skills';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_OPENCLAUDE_VERSION = '0.1.0';

/** The OpenClaude adapter — a lossless `Adapter` implementation. */
export const openclaudeAdapter: Adapter = {
  platform: 'openclaude',
  async compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    return emitSkillTree(skill, { skillsRoot: OPENCLAUDE_SKILLS_ROOT, strict: ctx.strict === true });
  },
  async verify(emit: EmitResult): Promise<VerifyResult> {
    return verifySkillTree(emit, { skillsRoot: OPENCLAUDE_SKILLS_ROOT });
  },
};
