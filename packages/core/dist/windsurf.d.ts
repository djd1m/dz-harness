/**
 * Windsurf rule rendering — the transforming layer behind the `windsurf` adapter.
 *
 * Windsurf (the Codeium/Cognition agent IDE) reads **workspace rules** from
 * `.windsurf/rules/<id>.md` — one file PER rule. Unlike Cursor (whose directory
 * demands the `.mdc` extension), Windsurf reads **plain `.md`**. Each file is
 * YAML frontmatter with the keys Windsurf understands —
 *
 *   - `trigger` — the activation mode: one of
 *     `always_on | manual | model_decision | glob`. We emit `model_decision`
 *     (the agent pulls the rule in on demand when it judges it relevant — the
 *     analogue of Cursor's `alwaysApply: false`),
 *   - `description` — a short summary Windsurf shows / uses to decide relevance,
 *   - `globs` — an OPTIONAL file-glob scope (omitted here → a general rule; only
 *     meaningful when `trigger: glob`) —
 *
 * followed by the skill body as Markdown.
 *
 * This is a **transforming** projection (like cursor/copilot): our canonical
 * `SKILL.md` frontmatter — which carries ~26 project-local keys (`name`,
 * `trust_tier`, `version`, …) — is replaced by Windsurf's own frontmatter, so the
 * emit is NOT byte-identical to the source and the `windsurf` target is excluded
 * from the cross-adapter byte-identical equivalence suite. The loss is surfaced
 * by the adapter as a warning, never silently.
 *
 * NOTE (out of scope): some Windsurf/Devin builds (Cognition's rebrand) also read
 * `.devin/rules/`. We emit only `.windsurf/rules/*.md`, which every current
 * Windsurf/Devin build reads.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill } from './skill.schema.js';
/**
 * Render ONE Windsurf `.md` rule file's content for a {@link CanonicalSkill}:
 * a YAML frontmatter block (`trigger: model_decision`, `description`, optional
 * `globs`) followed by the skill's Markdown body. NONE of the canonical/dz-only
 * frontmatter keys are carried through — this is the transforming projection.
 * Deterministic: same skill → same string.
 *
 * The single structural difference from `renderCursorMdc` is the frontmatter key
 * set: Windsurf uses an activation `trigger` where Cursor uses `alwaysApply`.
 *
 * `globs` is emitted only when the source skill declares a non-empty `globs`
 * string in its frontmatter; otherwise it is omitted so the rule is a general
 * (unscoped) one.
 */
export declare function renderWindsurfMd(skill: CanonicalSkill): string;
//# sourceMappingURL=windsurf.d.ts.map