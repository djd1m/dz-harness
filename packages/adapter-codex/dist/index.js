/**
 * `@dzhechkov/adapter-codex` — the OpenAI Codex CLI platform adapter.
 *
 * Implements the [`@dzhechkov/core`](../core) `Adapter` contract for the
 * `codex` platform: it compiles a `CanonicalSkill` into the
 * `.agents/skills/<id>/` layout Codex CLI scans.
 *
 * Codex consumes the agentskills.io skill directory natively (since Dec 2025),
 * so this adapter is a lossless, thin wrapper over `core`'s `emitSkillTree`.
 *
 * @packageDocumentation
 */
import { emitSkillTree, verifySkillTree } from '@dzhechkov/core';
/** The directory Codex CLI scans for project skills. */
export const CODEX_SKILLS_ROOT = '.agents/skills';
/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_CODEX_VERSION = '0.1.0';
/** The OpenAI Codex CLI adapter — a lossless `Adapter` implementation. */
export const codexAdapter = {
    platform: 'codex',
    async compile(skill, ctx) {
        return emitSkillTree(skill, { skillsRoot: CODEX_SKILLS_ROOT, strict: ctx.strict === true });
    },
    async verify(emit) {
        return verifySkillTree(emit, { skillsRoot: CODEX_SKILLS_ROOT });
    },
};
//# sourceMappingURL=index.js.map