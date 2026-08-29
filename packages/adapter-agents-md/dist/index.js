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
import { assertSafeId, renderAgentsMdSection } from '@dzhechkov/core';
/** The single, root-level file every AGENTS.md-aware tool reads. */
export const AGENTS_MD_PATH = 'AGENTS.md';
/** Package version. Kept in sync with `package.json`. */
export const ADAPTER_AGENTS_MD_VERSION = '0.1.0';
/**
 * The `AGENTS.md` adapter — an intentionally **lossy**, **flattening**
 * {@link Adapter}. `compile` renders ONE skill as a plain-Markdown section at
 * `AGENTS.md`; the ops layer aggregates + merges these into the real file.
 */
export const agentsMdAdapter = {
    platform: 'agents-md',
    compile(skill, ctx) {
        // Defend at the adapter boundary — ids are not guaranteed safe at this layer.
        try {
            assertSafeId(skill.id);
        }
        catch (err) {
            return Promise.reject(err instanceof Error ? err : new Error(String(err)));
        }
        const files = [
            {
                path: AGENTS_MD_PATH,
                encoding: 'utf-8',
                content: renderAgentsMdSection(skill),
            },
        ];
        const lossy = `agents-md is a lossy target: "${skill.id}" is flattened into a plain-Markdown ` +
            `section of a single root-level AGENTS.md (YAML frontmatter, progressive disclosure, ` +
            `and per-skill file boundaries are dropped; scripts/ and other assets are not carried).`;
        if (ctx.strict === true) {
            return Promise.reject(new Error(`adapter-agents-md: refusing lossy compile under strict mode — ${lossy}`));
        }
        return Promise.resolve({ files, warnings: [lossy] });
    },
    verify(emit) {
        const errors = [];
        // Carry the lossy-compile warning(s) through so `dz verify --target agents-md`
        // never reports skills as clean with no loss notice (mirrors copilot).
        const warnings = [...emit.warnings];
        const file = emit.files.find((f) => f.path === AGENTS_MD_PATH);
        if (!file) {
            errors.push(`no ${AGENTS_MD_PATH} was emitted`);
        }
        else {
            if (file.content.trim().length === 0) {
                errors.push(`${AGENTS_MD_PATH} is empty`);
            }
            // AGENTS.md is PLAIN Markdown — it must NOT open with a YAML frontmatter fence.
            if (/^﻿?---[ \t]*\r?\n/.test(file.content)) {
                errors.push(`${AGENTS_MD_PATH} must be plain Markdown with no leading "---" frontmatter fence`);
            }
        }
        return Promise.resolve({ ok: errors.length === 0, errors, warnings });
    },
};
//# sourceMappingURL=index.js.map