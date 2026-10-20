/**
 * `@dzhechkov/adapter-agents-md` — the `AGENTS.md` platform adapter.
 *
 * `AGENTS.md` is the emerging cross-tool convention read by ~15 agents (Cursor,
 * Zed, Warp, Aider, goose, Gemini CLI, RooCode, Kilo, Junie, Trae, Augment,
 * Devin, pi, Windsurf, …): a SINGLE, root-level, PLAIN-Markdown file — NO YAML
 * frontmatter, NO per-skill directory.
 *
 * Like {@link https://github.com/features/copilot | copilot} this is an
 * intentionally **lossy** adapter (frontmatter + progressive disclosure +
 * per-skill file boundaries are flattened away). UNLIKE copilot — which emits
 * one instruction file PER skill — AGENTS.md is ONE file for ALL selected
 * skills. This adapter's `compile` therefore emits just the rendered SECTION for
 * a single skill at path `AGENTS.md`; the aggregation across skills and the
 * merge-not-overwrite into any user-authored AGENTS.md happens at the
 * operations layer via `core`'s {@link mergeAgentsMd}.
 *
 * Per the {@link Adapter} contract, loss surfaces as a warning; under `strict`
 * it throws. The canonical skill stays the lossless source of truth.
 *
 * @packageDocumentation
 */
import type { Adapter } from '@dzhechkov/core';
/** The single, root-level file every AGENTS.md-aware tool reads. */
export declare const AGENTS_MD_PATH = "AGENTS.md";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_AGENTS_MD_VERSION = "0.1.0";
/**
 * The `AGENTS.md` adapter — an intentionally **lossy**, **flattening**
 * {@link Adapter}. `compile` renders ONE skill as a plain-Markdown section at
 * `AGENTS.md`; the ops layer aggregates + merges these into the real file.
 */
export declare const agentsMdAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map