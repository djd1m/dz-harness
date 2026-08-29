/**
 * `@dzhechkov/adapter-opencode` — the OpenCode platform adapter.
 *
 * Implements the [`@dzhechkov/core`](../core) `Adapter` contract for the
 * `opencode` platform: it compiles a `CanonicalSkill` into the
 * `.opencode/skills/<id>/` layout OpenCode scans.
 *
 * OpenCode consumes the agentskills.io skill directory natively, so this
 * adapter is a lossless, thin wrapper over `core`'s `emitSkillTree`.
 *
 * @packageDocumentation
 */

import { emitSkillTree, verifySkillTree } from '@dzhechkov/core';
import type { Adapter, CanonicalSkill, CompileContext, EmitResult, VerifyResult } from '@dzhechkov/core';

/** The directory OpenCode scans for project skills. */
export const OPENCODE_SKILLS_ROOT = '.opencode/skills';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_OPENCODE_VERSION = '0.1.0';

/** The OpenCode adapter — a lossless `Adapter` implementation. */
export const opencodeAdapter: Adapter = {
  platform: 'opencode',
  async compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    return emitSkillTree(skill, { skillsRoot: OPENCODE_SKILLS_ROOT, strict: ctx.strict === true });
  },
  async verify(emit: EmitResult): Promise<VerifyResult> {
    return verifySkillTree(emit, { skillsRoot: OPENCODE_SKILLS_ROOT });
  },
};
