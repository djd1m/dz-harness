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
import type { Adapter } from '@dzhechkov/core';
/** The directory OpenClaude scans for project skills. */
export declare const OPENCLAUDE_SKILLS_ROOT = ".openclaude/skills";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_OPENCLAUDE_VERSION = "0.1.0";
/** The OpenClaude adapter — a lossless `Adapter` implementation. */
export declare const openclaudeAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map