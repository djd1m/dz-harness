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
export const AGENTS_MD_BLOCK_BEGIN = '<!-- dz:skills BEGIN (managed by dz — do not edit) -->';
/** Closing marker of the dz-managed block inside an `AGENTS.md`. */
export const AGENTS_MD_BLOCK_END = '<!-- dz:skills END -->';
/** Opening marker of the independent dz-managed policy block in `AGENTS.md`. */
export const POLICY_BLOCK_BEGIN = '<!-- dz:policies BEGIN (managed by dz — do not edit) -->';
/** Closing marker of the independent dz-managed policy block in `AGENTS.md`. */
export const POLICY_BLOCK_END = '<!-- dz:policies END -->';

/** Preamble written above the managed block when creating a fresh `AGENTS.md`. */
const AGENTS_MD_PREAMBLE =
  'This file gives AI coding agents shared, always-on context for this repo. ' +
  'The section below is managed by dz — edit your own notes outside the fenced block.';

/** Preamble written above the managed block when creating a fresh `GEMINI.md`. */
const GEMINI_MD_PREAMBLE =
  'This file gives the Gemini CLI / Code Assist shared, always-on context for this repo. ' +
  'The section below is managed by dz — edit your own notes outside the fenced block.';

/**
 * Render a single {@link CanonicalSkill} as one PLAIN-Markdown section:
 * a `## <name>` heading, the description as a sentence, then the skill body.
 * NO YAML frontmatter and NO per-skill file boundary — this is the lossy,
 * flattening projection. Deterministic: same skill → same string.
 */
export function renderAgentsMdSection(skill: CanonicalSkill): string {
  const name = skill.frontmatter.name ?? skill.id;
  const description = skill.frontmatter.description.trim();
  // Present the description as a sentence — add terminal punctuation if absent.
  const sentence = /[.!?]$/.test(description) ? description : `${description}.`;
  const body = skill.document.body.trim();

  const parts = [`## ${name}`, sentence];
  if (body.length > 0) parts.push(body);
  return parts.join('\n\n');
}

/** Build the dz-managed block (markers + sections) from rendered sections. */
function buildManagedBlock(sections: readonly string[], beginMarker: string, endMarker: string): string {
  const inner = sections.join('\n\n').trim();
  const middle = inner.length > 0 ? `\n${inner}\n` : '\n';
  return `${beginMarker}${middle}${endMarker}`;
}

/**
 * The single-file fresh-file identity that varies between managed-Markdown
 * targets: `AGENTS.md` vs `GEMINI.md` differ ONLY in the fresh-file `# <title>`
 * heading and the preamble sentence. Everything else — the fenced `dz:skills`
 * markers, in-place replace, append-if-no-fence, and malformed lone-BEGIN
 * re-fence — is shared byte-for-byte across both.
 */
interface ManagedMarkdownIdentity {
  /** The fresh-file `# <title>` heading (e.g. `AGENTS.md`, `GEMINI.md`). */
  readonly title: string;
  /** The preamble sentence written above the managed block on a fresh file. */
  readonly preamble: string;
  /** Fence pair owned by this projection. Defaults preserve the existing dz:skills bytes. */
  readonly beginMarker?: string;
  readonly endMarker?: string;
  /** Where a missing or misplaced block is inserted. Existing targets retain append semantics by default. */
  readonly placement?: 'append' | 'after-preamble';
}

/**
 * Build or replace the dz-managed block inside a single-file managed-Markdown
 * target (`AGENTS.md`, `GEMINI.md`, …), preserving all user content OUTSIDE the
 * fence. The ONLY value that varies between targets is the fresh-file
 * title/preamble ({@link ManagedMarkdownIdentity}); the merge algorithm is
 * shared. Both {@link mergeAgentsMd} and {@link mergeGeminiMd} thin-wrap this.
 *
 * - `existing === null` → a fresh file: `# <title>` + preamble + managed block.
 * - existing WITH the fence → replace ONLY the fenced block; every other byte
 *   (before and after the fence) is kept exactly.
 * - existing WITHOUT the fence → append the managed block, keeping the user's
 *   file verbatim above it (never overwrite a hand-authored file).
 * - existing with a lone BEGIN and NO END (malformed) → re-fence conservatively:
 *   emit a well-formed managed block and preserve the trailing content below it,
 *   so no user content is ever silently dropped.
 *
 * Idempotent for any fixed identity: `merge(merge(x, s), s) === merge(x, s)`.
 */
function mergeManagedMarkdown(
  existing: string | null,
  sections: readonly string[],
  identity: ManagedMarkdownIdentity,
): string {
  const beginMarker = identity.beginMarker ?? AGENTS_MD_BLOCK_BEGIN;
  const endMarker = identity.endMarker ?? AGENTS_MD_BLOCK_END;
  const block = buildManagedBlock(sections, beginMarker, endMarker);

  const insertManagedBlock = (text: string): string => {
    if (identity.placement === 'after-preamble') {
      // Truncation removes the tail, so always-on policy belongs before every
      // other dz fence whether this is the first emit or a layout repair.
      const firstDzFence = text.indexOf('<!-- dz:');
      if (firstDzFence !== -1) {
        const prefix = text.slice(0, firstDzFence);
        const separator = prefix.length === 0 || prefix.endsWith('\n\n') ? '' : prefix.endsWith('\n') ? '\n' : '\n\n';
        return `${prefix}${separator}${block}\n\n${text.slice(firstDzFence).replace(/^\n+/, '')}`;
      }
      const afterTitle = text.indexOf('\n\n');
      const afterPreamble = afterTitle === -1 ? -1 : text.indexOf('\n\n', afterTitle + 2);
      if (afterPreamble !== -1) {
        const insertAt = afterPreamble + 2;
        return `${text.slice(0, insertAt)}${block}\n\n${text.slice(insertAt)}`;
      }
    }
    const separator = text.length === 0 ? '' : text.endsWith('\n') ? '\n' : '\n\n';
    return `${text}${separator}${block}\n`;
  };

  if (existing === null) {
    return `# ${identity.title}\n\n${identity.preamble}\n\n${block}\n`;
  }

  const beginIdx = existing.indexOf(beginMarker);
  if (beginIdx === -1) {
    return insertManagedBlock(existing);
  }

  const endSearch = existing.indexOf(endMarker, beginIdx + beginMarker.length);
  const before = existing.slice(0, beginIdx);

  if (endSearch === -1) {
    // Malformed region: a BEGIN marker with NO matching END. We cannot know
    // where the dz-managed region was meant to close, so anything after the
    // lone BEGIN marker may be hand-authored user content. Rather than drop it
    // (which would silently lose data), re-fence conservatively: emit a
    // well-formed managed block, then preserve the trailing content BELOW it
    // (append-below semantics). Re-running the merge then finds a well-formed
    // fence and takes the normal in-place-replace path.
    const trailing = existing.slice(beginIdx + beginMarker.length).replace(/^\n+/, '');
    const suffix = trailing.length > 0 ? `\n\n${trailing}` : '';
    return `${before}${block}${suffix}`;
  }

  const after = existing.slice(endSearch + endMarker.length);
  if (identity.placement === 'after-preamble') {
    const firstDzFence = existing.indexOf('<!-- dz:');
    if (firstDzFence !== -1 && firstDzFence < beginIdx) {
      // Preserve every byte outside the owned fence, but repair an old layout
      // that put always-on policy behind another truncatable dz projection.
      return insertManagedBlock(`${before}${after}`);
    }
  }
  // Replace ONLY the fenced block, keeping user content on both sides verbatim.
  return `${before}${block}${after}`;
}

/**
 * Build or replace the dz-managed block inside an `AGENTS.md`, preserving all
 * user content OUTSIDE the fence. Thin wrapper over {@link mergeManagedMarkdown}
 * with the `AGENTS.md` title + preamble — behaviour is byte-identical to the
 * pre-refactor implementation.
 *
 * Idempotent: `mergeAgentsMd(mergeAgentsMd(x, s), s) === mergeAgentsMd(x, s)`.
 */
export function mergeAgentsMd(existing: string | null, sections: readonly string[]): string {
  return mergeManagedMarkdown(existing, sections, {
    title: 'AGENTS.md',
    preamble: AGENTS_MD_PREAMBLE,
  });
}

/**
 * Build or replace the independent always-on policy fence in `AGENTS.md`.
 * This is deliberately only an identity wrapper over the one merge algorithm.
 */
export function mergePolicyBlock(existing: string | null, sections: readonly string[]): string {
  return mergeManagedMarkdown(existing, sections, {
    title: 'AGENTS.md',
    preamble: AGENTS_MD_PREAMBLE,
    beginMarker: POLICY_BLOCK_BEGIN,
    endMarker: POLICY_BLOCK_END,
    placement: 'after-preamble',
  });
}

/**
 * Render a single {@link CanonicalSkill} as one plain-Markdown section for a
 * `GEMINI.md`. Identical projection to {@link renderAgentsMdSection} — `GEMINI.md`
 * and `AGENTS.md` share the exact same frontmatter-free `## <name>` section
 * shape — re-exported under a GEMINI name for symmetry at call sites.
 */
export const renderGeminiMdSection = renderAgentsMdSection;

/**
 * Build or replace the dz-managed block inside a `GEMINI.md` — the single,
 * root-level, plain-Markdown file read by the Gemini CLI / Code Assist.
 * Thin wrapper over {@link mergeManagedMarkdown} with the `GEMINI.md` title +
 * preamble; it shares the AGENTS.md merge/preserve/idempotency behaviour
 * byte-for-byte, differing only in the fresh-file heading.
 *
 * Idempotent: `mergeGeminiMd(mergeGeminiMd(x, s), s) === mergeGeminiMd(x, s)`.
 */
export function mergeGeminiMd(existing: string | null, sections: readonly string[]): string {
  return mergeManagedMarkdown(existing, sections, {
    title: 'GEMINI.md',
    preamble: GEMINI_MD_PREAMBLE,
  });
}
