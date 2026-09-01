/**
 * `@dzhechkov/core` — the foundation package of the DZ cross-platform harness.
 *
 * It defines three platform-neutral things every other package builds on:
 *
 * - the **canonical skill schema** (`skill.schema.ts`) — the agentskills.io
 *   standard plus the permissive Claude Code superset used by this repo's skills;
 * - the **hooks schema** (`hooks.schema.ts`) — the shape of lifecycle hooks;
 * - the **adapter contract** (`adapter.ts`) — the interface every
 *   `@dzhechkov/adapter-*` package implements to emit a platform-specific tree.
 *
 * @packageDocumentation
 */
/** Package version. Kept in sync with `package.json`. */
export const CORE_VERSION = '0.1.0';
export * from './skill-document.js';
export * from './skill.schema.js';
export * from './hooks.schema.js';
export * from './integration.schema.js';
export * from './adapter.js';
export * from './skill-emit.js';
export * from './agents-md.js';
export * from './cursor.js';
export * from './windsurf.js';
export * from './yaml-scalar.js';
//# sourceMappingURL=index.js.map