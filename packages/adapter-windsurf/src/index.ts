/**
 * `@dzhechkov/adapter-windsurf` — the Windsurf platform adapter.
 *
 * Windsurf (the Codeium/Cognition agent IDE) reads **workspace rules** from
 * `.windsurf/rules/` — one `.md` file PER rule. Unlike Cursor (whose directory
 * demands a `.mdc` extension), Windsurf reads **plain Markdown** (`.md`). Each
 * file is YAML frontmatter with Windsurf's keys — an activation `trigger` (one of
 * `always_on | manual | model_decision | glob`), a `description`, and an optional
 * `globs` scope — followed by a Markdown body.
 *
 * This is essentially the {@link https://cursor.com | cursor} adapter with a
 * different directory + `.md` extension + Windsurf's `trigger` frontmatter in
 * place of Cursor's `alwaysApply`. Like cursor/copilot it is an intentionally
 * **transforming** adapter: our canonical `SKILL.md` frontmatter (~26
 * project-local keys) is replaced by Windsurf's own frontmatter, so the emit is
 * NOT byte-identical to the source. It is therefore EXCLUDED from the
 * cross-adapter byte-identical equivalence suite (which only covers the lossless
 * per-skill tree adapters). We emit `trigger: model_decision` — the rule is
 * **agent-requested** (pulled in on demand when the model judges it relevant)
 * rather than injected into every turn.
 *
 * Per the {@link Adapter} contract the transform loss surfaces as a **warning**;
 * under `strict` the adapter **throws**. The canonical skill stays the lossless
 * source of truth — recompiling to `claude` is still full fidelity.
 *
 * NOTE (out of scope): some Windsurf/Devin builds (Cognition's rebrand) also read
 * `.devin/rules/`. We emit only `.windsurf/rules/*.md`, which every current
 * Windsurf/Devin build reads.
 *
 * @packageDocumentation
 */

import { assertSafeId, renderWindsurfMd } from '@dzhechkov/core';
import type {
  Adapter,
  CanonicalSkill,
  CompileContext,
  EmitResult,
  SkillAsset,
  VerifyResult,
} from '@dzhechkov/core';

/** The directory Windsurf scans for workspace rules. */
export const WINDSURF_RULES_ROOT = '.windsurf/rules';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_WINDSURF_VERSION = '0.1.0';

/**
 * The Windsurf adapter — an intentionally **transforming** {@link Adapter}.
 *
 * `compile` emits ONE `.md` rule file per skill at `.windsurf/rules/<id>.md`
 * (Windsurf reads plain `.md`, unlike Cursor's `.mdc`); the file is Windsurf's
 * `trigger`/`description`/optional-`globs` frontmatter plus the skill body,
 * produced by core's `renderWindsurfMd`.
 */
export const windsurfAdapter: Adapter = {
  platform: 'windsurf',
  compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    // Defend at the adapter boundary — ids are not guaranteed safe at this layer.
    try {
      assertSafeId(skill.id);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const files: SkillAsset[] = [
      {
        // Plain `.md` — Windsurf reads `.windsurf/rules/*.md` (NOT `.mdc`).
        path: `${WINDSURF_RULES_ROOT}/${skill.id}.md`,
        encoding: 'utf-8',
        content: renderWindsurfMd(skill),
      },
    ];

    const lossy =
      `windsurf is a transforming target: "${skill.id}" is emitted as a .windsurf/rules/${skill.id}.md ` +
      `workspace rule with Windsurf's frontmatter (trigger, description, optional globs) — ` +
      `the canonical SKILL.md frontmatter is replaced (not byte-identical) and scripts/ and other assets are not carried.`;
    if (ctx.strict === true) {
      return Promise.reject(new Error(`adapter-windsurf: refusing transforming compile under strict mode — ${lossy}`));
    }
    return Promise.resolve({ files, warnings: [lossy] });
  },

  verify(emit: EmitResult): Promise<VerifyResult> {
    const errors: string[] = [];
    // Carry the transform warning(s) through so `dz verify --target windsurf` never
    // reports skills as clean with no loss notice (mirrors copilot/agents-md/cursor).
    const warnings: string[] = [...emit.warnings];

    // Require a real `<root>/<id>.md` with a non-empty id segment.
    const root = WINDSURF_RULES_ROOT.replace(/[.]/g, '\\.');
    const mdRe = new RegExp(`^${root}/[^/]+\\.md$`);
    const rule = emit.files.find((f) => mdRe.test(f.path));
    if (!rule) {
      errors.push(`no ${WINDSURF_RULES_ROOT}/<id>.md rule file was emitted`);
    } else {
      if (rule.content.trim().length === 0) {
        errors.push(`${rule.path} is empty`);
      }
      // The load-bearing check: assert an activation `trigger:` key exists ONLY
      // inside the leading frontmatter block, not the body. Without a valid
      // trigger Windsurf cannot decide when to activate the rule.
      const fm = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(rule.content);
      const front = fm?.[1] ?? '';
      if (!fm || !/^trigger:/m.test(front)) {
        errors.push(`${rule.path} is missing the leading trigger frontmatter`);
      } else if (!/^description:/m.test(front)) {
        errors.push(`${rule.path} is missing the leading description frontmatter`);
      }
    }

    return Promise.resolve({ ok: errors.length === 0, errors, warnings });
  },
};
