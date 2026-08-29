/**
 * `@dzhechkov/adapter-copilot` — the GitHub Copilot platform adapter.
 *
 * Unlike the five lossless skill-tree adapters (claude/codex/opencode/hermes/
 * openclaude), GitHub Copilot does NOT scan a `.../skills/` directory. It
 * auto-reads repo instructions from `.github/instructions/*.instructions.md`
 * (each with an `applyTo` glob). So a skill maps onto an **instruction file**,
 * not a skill tree — making this the harness's first **intentionally lossy**
 * adapter:
 *
 *   - no progressive disclosure (the instruction is always-on, `applyTo: "**"`),
 *   - `scripts/` become reference-only assets (Copilot can't execute them),
 *   - no skill-invocation command (Copilot has none).
 *
 * Per the {@link Adapter} contract, loss is surfaced as a warning; under
 * `strict` it throws instead. The canonical skill remains the lossless source —
 * re-compiling to `claude` is still full fidelity.
 *
 * See `docs/research/metaharness-analysis.md` §8 and `features/copilot-target/`.
 *
 * @packageDocumentation
 */
import type { Adapter } from '@dzhechkov/core';
/** Directory Copilot auto-reads path-scoped instruction files from. */
export declare const COPILOT_INSTRUCTIONS_ROOT = ".github/instructions";
/** Where a skill's bundled assets land (reference-only — Copilot can't execute them). */
export declare const COPILOT_ASSETS_ROOT = ".github/copilot-skills";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_COPILOT_VERSION = "0.1.0";
/**
 * The GitHub Copilot adapter — an intentionally **lossy** {@link Adapter}.
 *
 * Emits one always-on instruction file per skill plus reference-only assets.
 */
export declare const copilotAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map