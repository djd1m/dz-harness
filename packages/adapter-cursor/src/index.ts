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

import { assertSafeId, renderCursorMdc } from '@dzhechkov/core';
import type {
  Adapter,
  CanonicalSkill,
  CompileContext,
  EmitResult,
  SkillAsset,
  VerifyResult,
} from '@dzhechkov/core';

/** The directory Cursor scans for project rules. */
export const CURSOR_RULES_ROOT = '.cursor/rules';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_CURSOR_VERSION = '0.1.0';

/**
 * The Cursor adapter — an intentionally **transforming** {@link Adapter}.
 *
 * `compile` emits ONE `.mdc` rule file per skill at `.cursor/rules/<id>.mdc`
 * (Cursor ignores a `.md` file in that directory); the file is Cursor's 3-key
 * frontmatter plus the skill body, produced by core's `renderCursorMdc`.
 */
export const cursorAdapter: Adapter = {
  platform: 'cursor',
  compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    // Defend at the adapter boundary — ids are not guaranteed safe at this layer.
    try {
      assertSafeId(skill.id);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const files: SkillAsset[] = [
      {
        // MUST be `.mdc` — a `.md` file in `.cursor/rules/` is ignored by Cursor.
        path: `${CURSOR_RULES_ROOT}/${skill.id}.mdc`,
        encoding: 'utf-8',
        content: renderCursorMdc(skill),
      },
    ];

    const lossy =
      `cursor is a transforming target: "${skill.id}" is emitted as a .cursor/rules/${skill.id}.mdc ` +
      `project rule with Cursor's 3-key frontmatter (description, optional globs, alwaysApply: false) — ` +
      `the canonical SKILL.md frontmatter is replaced (not byte-identical) and scripts/ and other assets are not carried.`;
    if (ctx.strict === true) {
      return Promise.reject(new Error(`adapter-cursor: refusing transforming compile under strict mode — ${lossy}`));
    }
    return Promise.resolve({ files, warnings: [lossy] });
  },

  verify(emit: EmitResult): Promise<VerifyResult> {
    const errors: string[] = [];
    // Carry the transform warning(s) through so `dz verify --target cursor` never
    // reports skills as clean with no loss notice (mirrors copilot/agents-md).
    const warnings: string[] = [...emit.warnings];

    // Require a real `<root>/<id>.mdc` (NOT .md) with a non-empty id segment.
    const root = CURSOR_RULES_ROOT.replace(/[.]/g, '\\.');
    const mdcRe = new RegExp(`^${root}/[^/]+\\.mdc$`);
    const rule = emit.files.find((f) => mdcRe.test(f.path));
    if (!rule) {
      errors.push(`no ${CURSOR_RULES_ROOT}/<id>.mdc rule file was emitted`);
    } else {
      if (rule.content.trim().length === 0) {
        errors.push(`${rule.path} is empty`);
      }
      // Check `description` ONLY inside the leading frontmatter block, not the body.
      const fm = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(rule.content);
      if (!fm || !/^description:/m.test(fm[1] ?? '')) {
        errors.push(`${rule.path} is missing the leading description frontmatter`);
      }
    }

    return Promise.resolve({ ok: errors.length === 0, errors, warnings });
  },
};
