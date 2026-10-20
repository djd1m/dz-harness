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
import type { Adapter } from '@dzhechkov/core';
/** The directory Hermes Agent scans for skills (conventionally under `~/`). */
export declare const HERMES_SKILLS_ROOT = ".hermes/skills";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_HERMES_VERSION = "0.1.0";
/** The Hermes Agent adapter — a lossless `Adapter` implementation. */
export declare const hermesAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map