/**
 * Cursor `.mdc` rendering — the transforming layer behind the `cursor` adapter.
 *
 * Cursor (cursor.com/docs/context/rules) reads **project rules** from
 * `.cursor/rules/<id>.mdc` — one file PER rule. The extension MUST be `.mdc`;
 * a plain `.md` file in that directory is IGNORED. Each file is YAML frontmatter
 * with exactly three keys Cursor understands —
 *
 *   - `description` — a short summary Cursor shows / uses to decide relevance,
 *   - `globs` — an OPTIONAL file-glob scope (omitted here → a general rule),
 *   - `alwaysApply` — a boolean; `false` makes the rule **agent-requested**
 *     (pulled in on demand) rather than always-on —
 *
 * followed by the skill body as Markdown.
 *
 * This is a **transforming** projection (like copilot): our canonical
 * `SKILL.md` frontmatter — which carries ~26 project-local keys (`name`,
 * `trust_tier`, `version`, …) — is replaced by Cursor's own 3-key frontmatter,
 * so the emit is NOT byte-identical to the source and the `cursor` target is
 * excluded from the cross-adapter byte-identical equivalence suite. The loss is
 * surfaced by the adapter as a warning, never silently.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill } from './skill.schema.js';
/**
 * Render ONE Cursor `.mdc` rule file's content for a {@link CanonicalSkill}:
 * a three-key YAML frontmatter block (`description`, optional `globs`,
 * `alwaysApply: false`) followed by the skill's Markdown body. NONE of the
 * canonical/dz-only frontmatter keys are carried through — this is the
 * transforming projection. Deterministic: same skill → same string.
 *
 * `globs` is emitted only when the source skill declares a non-empty `globs`
 * string in its frontmatter; otherwise it is omitted so the rule is a general
 * (unscoped) one, per Cursor's convention.
 */
export declare function renderCursorMdc(skill: CanonicalSkill): string;
//# sourceMappingURL=cursor.d.ts.map