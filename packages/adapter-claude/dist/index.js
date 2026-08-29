/**
 * `@dzhechkov/adapter-claude` — the Claude Code platform adapter.
 *
 * Implements the [`@dzhechkov/core`](../core) `Adapter` contract for the
 * `claude` platform: it compiles a `CanonicalSkill` into the
 * `.claude/skills/<id>/` file layout Claude Code expects.
 *
 * Claude Code is the *native* skill format (agentskills.io), so this adapter is
 * a faithful, lossless emitter — the byte-identity baseline the other,
 * potentially lossy, adapters are measured against.
 *
 * @packageDocumentation
 */
import { compileToClaudeFiles } from './compile.js';
import { verifyClaudeEmit } from './verify.js';
/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_CLAUDE_VERSION = '0.1.0';
/**
 * The Claude Code adapter — a faithful, lossless implementation of the core
 * `Adapter` contract. `compile` and `verify` are pure: they never touch the
 * filesystem.
 */
export const claudeAdapter = {
    platform: 'claude',
    async compile(skill, ctx) {
        return compileToClaudeFiles(skill, ctx);
    },
    async verify(emit) {
        return verifyClaudeEmit(emit);
    },
};
export { compileToClaudeFiles } from './compile.js';
export { verifyClaudeEmit } from './verify.js';
//# sourceMappingURL=index.js.map