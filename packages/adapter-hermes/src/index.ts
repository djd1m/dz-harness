/**
 * `@dzhechkov/adapter-hermes` — the Hermes Agent (Nous Research) platform adapter.
 *
 * Implements the [`@dzhechkov/core`](../core) `Adapter` contract for the
 * `hermes` platform: it compiles a `CanonicalSkill` into the
 * `.hermes/skills/<id>/` layout Hermes Agent scans.
 *
 * Hermes skills are agentskills.io-compatible, so this adapter is a lossless,
 * thin wrapper over `core`'s `emitSkillTree`.
 *
 * @packageDocumentation
 */

import { emitSkillTree, verifySkillTree } from '@dzhechkov/core';
import type { Adapter, CanonicalSkill, CompileContext, EmitResult, VerifyResult } from '@dzhechkov/core';

/** The directory Hermes Agent scans for skills (conventionally under `~/`). */
export const HERMES_SKILLS_ROOT = '.hermes/skills';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_HERMES_VERSION = '0.1.0';

/** The Hermes Agent adapter — a lossless `Adapter` implementation. */
export const hermesAdapter: Adapter = {
  platform: 'hermes',
  async compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    return emitSkillTree(skill, { skillsRoot: HERMES_SKILLS_ROOT, strict: ctx.strict === true });
  },
  async verify(emit: EmitResult): Promise<VerifyResult> {
    return verifySkillTree(emit, { skillsRoot: HERMES_SKILLS_ROOT });
  },
};
