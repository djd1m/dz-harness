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

import { assertSafeId, renderGeminiMdSection } from '@dzhechkov/core';
import type {
  Adapter,
  CanonicalSkill,
  CompileContext,
  EmitResult,
  SkillAsset,
  VerifyResult,
} from '@dzhechkov/core';

/** The single, root-level file the Gemini CLI / Code Assist reads. */
export const GEMINI_MD_PATH = 'GEMINI.md';

/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_GEMINI_VERSION = '0.1.0';

/**
 * The `GEMINI.md` adapter — an intentionally **lossy**, **flattening**
 * {@link Adapter}. `compile` renders ONE skill as a plain-Markdown section at
 * `GEMINI.md`; the ops layer aggregates + merges these into the real file.
 */
export const geminiAdapter: Adapter = {
  platform: 'gemini',
  compile(skill: CanonicalSkill, ctx: CompileContext): Promise<EmitResult> {
    // Defend at the adapter boundary — ids are not guaranteed safe at this layer.
    try {
      assertSafeId(skill.id);
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }

    const files: SkillAsset[] = [
      {
        path: GEMINI_MD_PATH,
        encoding: 'utf-8',
        content: renderGeminiMdSection(skill),
      },
    ];

    const lossy =
      `gemini is a lossy target: "${skill.id}" is flattened into a plain-Markdown ` +
      `section of a single root-level GEMINI.md (YAML frontmatter, progressive disclosure, ` +
      `and per-skill file boundaries are dropped; scripts/ and other assets are not carried).`;
    if (ctx.strict === true) {
      return Promise.reject(new Error(`adapter-gemini: refusing lossy compile under strict mode — ${lossy}`));
    }
    return Promise.resolve({ files, warnings: [lossy] });
  },

  verify(emit: EmitResult): Promise<VerifyResult> {
    const errors: string[] = [];
    // Carry the lossy-compile warning(s) through so `dz verify --target gemini`
    // never reports skills as clean with no loss notice (mirrors agents-md).
    const warnings: string[] = [...emit.warnings];

    const file = emit.files.find((f) => f.path === GEMINI_MD_PATH);
    if (!file) {
      errors.push(`no ${GEMINI_MD_PATH} was emitted`);
    } else {
      if (file.content.trim().length === 0) {
        errors.push(`${GEMINI_MD_PATH} is empty`);
      }
      // GEMINI.md is PLAIN Markdown — it must NOT open with a YAML frontmatter fence.
      if (/^﻿?---[ \t]*\r?\n/.test(file.content)) {
        errors.push(`${GEMINI_MD_PATH} must be plain Markdown with no leading "---" frontmatter fence`);
      }
    }

    return Promise.resolve({ ok: errors.length === 0, errors, warnings });
  },
};
