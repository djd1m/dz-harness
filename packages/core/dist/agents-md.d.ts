/**
 * `AGENTS.md` rendering + merge helpers — the flattening layer behind the
 * `agents-md` adapter.
 *
 * `AGENTS.md` is the emerging cross-tool convention (Cursor, Zed, Warp, Aider,
 * goose, Gemini CLI, RooCode, Kilo, Junie, Trae, Augment, Devin, pi, Windsurf,
 * …): a **single**, **root-level**, **plain-Markdown** file — NO YAML
 * frontmatter, NO per-skill directory. Unlike the skill-tree adapters (one dir
 * per skill) and unlike copilot (one instruction file per skill), one AGENTS.md
 * holds ALL selected skills.
 *
 * Because AGENTS.md is frequently **hand-authored**, this module never
 * overwrites: {@link mergeAgentsMd} owns only a fenced, dz-managed block and
 * preserves every byte of the user's own content outside it. The per-skill
 * flattening ({@link renderAgentsMdSection}) drops frontmatter and file
 * boundaries — that loss is surfaced by the adapter as a warning, never
 * silently.
 *
 * @packageDocumentation
 */
import type { CanonicalSkill } from './skill.schema.js';
/** Opening marker of the dz-managed block inside an `AGENTS.md`. */
export declare const AGENTS_MD_BLOCK_BEGIN = "<!-- dz:skills BEGIN (managed by dz \u2014 do not edit) -->";
/** Closing marker of the dz-managed block inside an `AGENTS.md`. */
export declare const AGENTS_MD_BLOCK_END = "<!-- dz:skills END -->";
/** Opening marker of the independent dz-managed policy block in `AGENTS.md`. */
export declare const POLICY_BLOCK_BEGIN = "<!-- dz:policies BEGIN (managed by dz \u2014 do not edit) -->";
/** Closing marker of the independent dz-managed policy block in `AGENTS.md`. */
export declare const POLICY_BLOCK_END = "<!-- dz:policies END -->";
/**
 * Render a single {@link CanonicalSkill} as one PLAIN-Markdown section:
 * a `## <name>` heading, the description as a sentence, then the skill body.
 * NO YAML frontmatter and NO per-skill file boundary — this is the lossy,
 * flattening projection. Deterministic: same skill → same string.
 */
export declare function renderAgentsMdSection(skill: CanonicalSkill): string;
/**
 * Build or replace the dz-managed block inside an `AGENTS.md`, preserving all
 * user content OUTSIDE the fence. Thin wrapper over {@link mergeManagedMarkdown}
 * with the `AGENTS.md` title + preamble — behaviour is byte-identical to the
 * pre-refactor implementation.
 *
 * Idempotent: `mergeAgentsMd(mergeAgentsMd(x, s), s) === mergeAgentsMd(x, s)`.
 */
export declare function mergeAgentsMd(existing: string | null, sections: readonly string[]): string;
/**
 * Build or replace the independent always-on policy fence in `AGENTS.md`.
 * This is deliberately only an identity wrapper over the one merge algorithm.
 */
export declare function mergePolicyBlock(existing: string | null, sections: readonly string[]): string;
/**
 * Render a single {@link CanonicalSkill} as one plain-Markdown section for a
 * `GEMINI.md`. Identical projection to {@link renderAgentsMdSection} — `GEMINI.md`
 * and `AGENTS.md` share the exact same frontmatter-free `## <name>` section
 * shape — re-exported under a GEMINI name for symmetry at call sites.
 */
export declare const renderGeminiMdSection: typeof renderAgentsMdSection;
/**
 * Build or replace the dz-managed block inside a `GEMINI.md` — the single,
 * root-level, plain-Markdown file read by the Gemini CLI / Code Assist.
 * Thin wrapper over {@link mergeManagedMarkdown} with the `GEMINI.md` title +
 * preamble; it shares the AGENTS.md merge/preserve/idempotency behaviour
 * byte-for-byte, differing only in the fresh-file heading.
 *
 * Idempotent: `mergeGeminiMd(mergeGeminiMd(x, s), s) === mergeGeminiMd(x, s)`.
 */
export declare function mergeGeminiMd(existing: string | null, sections: readonly string[]): string;
//# sourceMappingURL=agents-md.d.ts.map