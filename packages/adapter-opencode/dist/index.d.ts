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
import type { Adapter } from '@dzhechkov/core';
/** The directory OpenCode scans for project skills. */
export declare const OPENCODE_SKILLS_ROOT = ".opencode/skills";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_OPENCODE_VERSION = "0.1.0";
/** The OpenCode adapter — a lossless `Adapter` implementation. */
export declare const opencodeAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map