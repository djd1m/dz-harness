/**
 * `@dzhechkov/adapter-gemini` — the `GEMINI.md` platform adapter.
 *
 * `GEMINI.md` is the canonical context file read by the **Gemini CLI** and
 * **Gemini Code Assist**: a SINGLE, root-level, PLAIN-Markdown file — NO YAML
 * frontmatter, NO per-skill directory. Gemini loads it hierarchically
 * (`~/.gemini/GEMINI.md` → workspace root → subdirectories, concatenated
 * nearest-wins); dz emits the workspace-root `GEMINI.md`.
 *
 * Structurally this is `AGENTS.md` with a different filename — so it reuses the
 * exact same `core` machinery. Like {@link https://github.com/features/copilot |
 * copilot} and `agents-md` it is an intentionally **lossy** adapter (frontmatter
 * + progressive disclosure + per-skill file boundaries are flattened away).
 * UNLIKE copilot — which emits one instruction file PER skill — `GEMINI.md` is
 * ONE file for ALL selected skills. This adapter's `compile` therefore emits
 * just the rendered SECTION for a single skill at path `GEMINI.md`; the
 * aggregation across skills and the merge-not-overwrite into any user-authored
 * `GEMINI.md` happens at the operations layer via `core`'s {@link mergeGeminiMd}.
 *
 * Per the {@link Adapter} contract, loss surfaces as a warning; under `strict`
 * it throws. The canonical skill stays the lossless source of truth.
 *
 * @packageDocumentation
 */
import type { Adapter } from '@dzhechkov/core';
/** The single, root-level file the Gemini CLI / Code Assist reads. */
export declare const GEMINI_MD_PATH = "GEMINI.md";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_GEMINI_VERSION = "0.1.0";
/**
 * The `GEMINI.md` adapter — an intentionally **lossy**, **flattening**
 * {@link Adapter}. `compile` renders ONE skill as a plain-Markdown section at
 * `GEMINI.md`; the ops layer aggregates + merges these into the real file.
 */
export declare const geminiAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map