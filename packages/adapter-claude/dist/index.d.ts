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
import type { Adapter } from '@dzhechkov/core';
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_CLAUDE_VERSION = "0.1.0";
/**
 * The Claude Code adapter — a faithful, lossless implementation of the core
 * `Adapter` contract. `compile` and `verify` are pure: they never touch the
 * filesystem.
 */
export declare const claudeAdapter: Adapter;
export { compileToClaudeFiles } from './compile.js';
export { verifyClaudeEmit } from './verify.js';
export { claudeIntegrationAdapter, planClaudeIntegrations } from './integrations.js';
//# sourceMappingURL=index.d.ts.map