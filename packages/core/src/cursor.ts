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
import { yamlScalar } from './yaml-scalar.js';

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
export function renderCursorMdc(skill: CanonicalSkill): string {
  const description = skill.frontmatter.description.trim();

  // A skill MAY carry an explicit Cursor glob scope in its (loose) frontmatter;
  // when absent we omit `globs` entirely → a general, unscoped rule.
  const rawGlobs = (skill.frontmatter as { globs?: unknown }).globs;
  const globs = typeof rawGlobs === 'string' && rawGlobs.trim().length > 0 ? rawGlobs.trim() : undefined;

  // `document.body` is the verbatim content AFTER the source frontmatter fence.
  // Drop only leading blank lines so the body sits cleanly under our frontmatter.
  const body = skill.document.body.replace(/^(?:\r?\n)+/, '');

  const front = ['---', `description: ${yamlScalar(description)}`];
  if (globs !== undefined) front.push(`globs: ${yamlScalar(globs)}`);
  front.push('alwaysApply: false', '---');

  return `${front.join('\n')}\n\n${body}`;
}
