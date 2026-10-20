/**
 * `@dzhechkov/adapter-cursor` — the Cursor platform adapter.
 *
 * Cursor (cursor.com/docs/context/rules) reads **project rules** from
 * `.cursor/rules/` — one `.mdc` file PER rule. The extension MUST be `.mdc`; a
 * plain `.md` file in that directory is IGNORED. Each file is YAML frontmatter
 * with three Cursor keys (`description`, optional `globs`, `alwaysApply`)
 * followed by a Markdown body.
 *
 * Like {@link https://github.com/features/copilot | copilot} this is an
 * intentionally **transforming** adapter: our canonical `SKILL.md` frontmatter
 * (~26 project-local keys) is replaced by Cursor's own 3-key frontmatter, so the
 * emit is NOT byte-identical to the source. It is therefore EXCLUDED from the
 * cross-adapter byte-identical equivalence suite (which only covers the lossless
 * per-skill tree adapters). Unlike copilot's always-on instruction file, a
 * Cursor rule emitted with `alwaysApply: false` is **agent-requested** — pulled
 * in on demand rather than injected into every turn.
 *
 * Per the {@link Adapter} contract the transform loss surfaces as a **warning**;
 * under `strict` the adapter **throws**. The canonical skill stays the lossless
 * source of truth — recompiling to `claude` is still full fidelity.
 *
 * @packageDocumentation
 */
import type { Adapter } from '@dzhechkov/core';
/** The directory Cursor scans for project rules. */
export declare const CURSOR_RULES_ROOT = ".cursor/rules";
/** Package version. Kept in sync with `package.json`. */
export declare const ADAPTER_CURSOR_VERSION = "0.1.0";
/**
 * The Cursor adapter — an intentionally **transforming** {@link Adapter}.
 *
 * `compile` emits ONE `.mdc` rule file per skill at `.cursor/rules/<id>.mdc`
 * (Cursor ignores a `.md` file in that directory); the file is Cursor's 3-key
 * frontmatter plus the skill body, produced by core's `renderCursorMdc`.
 */
export declare const cursorAdapter: Adapter;
//# sourceMappingURL=index.d.ts.map