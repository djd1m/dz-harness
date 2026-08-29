/**
 * Canonical skill frontmatter schema — the two-layer Zod model the whole
 * harness validates `SKILL.md` files against.
 *
 * The {@link https://agentskills.io/specification | Agent Skills open standard}
 * defines six frontmatter fields. Claude Code consumes that standard and adds
 * its own optional fields, and this repository's skills additionally carry a
 * number of project-local keys. A single strict schema therefore cannot serve
 * both "is this a portable, standard-compliant skill?" and "does every existing
 * `SKILL.md` parse?". So there are two layers:
 *
 * - {@link CanonicalSkillFrontmatterSchema} — the strict agentskills.io
 *   standard. Used by the portable/canonical layer and by non-Claude adapters.
 * - {@link ClaudeSkillFrontmatterSchema} — the standard relaxed, plus Claude
 *   Code extensions, plus passthrough of unknown keys, so every existing
 *   `SKILL.md` validates without edits (per ADR-001: we never fix user skills).
 *
 * Verified against the spec in
 * `features/extended-a-migration/agentskills-spec-verification.md`.
 *
 * @packageDocumentation
 */

import { z } from 'zod';

import type { SkillDocument } from './skill-document.js';

/**
 * agentskills.io `name` rule: lowercase alphanumeric segments joined by single
 * hyphens. Forbids uppercase, leading/trailing hyphens, and consecutive hyphens.
 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Strict `name` field — agentskills.io constraints (1-64 chars, kebab-case). */
export const canonicalSkillName = z
  .string()
  .min(1, 'name must not be empty')
  .max(64, 'name must be at most 64 characters')
  .regex(
    SKILL_NAME_PATTERN,
    'name must be lowercase alphanumeric joined by single hyphens, with no leading, trailing, or consecutive hyphens',
  );

/** Strict `description` field — agentskills.io constraints (1-1024 chars). */
export const canonicalSkillDescription = z
  .string()
  .min(1, 'description must not be empty')
  .max(1024, 'description must be at most 1024 characters');

// ---------------------------------------------------------------------------
// Layer 1 — canonical agentskills.io standard (strict)
// ---------------------------------------------------------------------------

/**
 * The exact agentskills.io frontmatter standard: `name` and `description`
 * required; `license`, `compatibility`, `metadata`, `allowed-tools` optional.
 * Unknown keys are rejected — this is the portable contract.
 *
 * Note: the standard also requires `name` to equal the parent directory name.
 * That cross-file constraint cannot be expressed on the frontmatter alone; it
 * is enforced by the skill loader, not by this schema.
 */
export const CanonicalSkillFrontmatterSchema = z.strictObject({
  name: canonicalSkillName,
  description: canonicalSkillDescription,
  license: z.string().min(1).optional(),
  compatibility: z
    .string()
    .min(1, 'compatibility must not be empty')
    .max(500, 'compatibility must be at most 500 characters')
    .optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  'allowed-tools': z.string().optional(),
});

/** A frontmatter object validated against the strict agentskills.io standard. */
export type CanonicalSkillFrontmatter = z.infer<typeof CanonicalSkillFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Layer 2 — Claude Code superset (permissive)
// ---------------------------------------------------------------------------

/**
 * The permissive layer. Every existing `.claude/skills/*\/SKILL.md` in this
 * repository must validate against it without edits.
 *
 * Only one invariant is enforced: a non-empty `description` (the harness relies
 * on it for skill discovery). `name` is optional — Claude Code falls back to the
 * directory name. A handful of common Claude Code extension fields are typed for
 * downstream convenience; every other key (the ~26 project-local conventions
 * such as `trust_tier`, `validation`, `tags`, `dependencies`) is preserved
 * untouched via the loose object's passthrough behaviour.
 *
 * Deliberately *not* enforced here: `description` length, `name` casing/length.
 * The canonical layer enforces those when producing standard-compliant output;
 * forcing them here would reject valid existing skills.
 */
export const ClaudeSkillFrontmatterSchema = z.looseObject({
  /** Required: the primary skill-discovery signal. */
  description: z.string().min(1, 'description must not be empty'),
  /** Optional: Claude Code falls back to the skill's directory name. */
  name: z.string().min(1).optional(),
  // --- standard optional fields (kept loose) ---
  license: z.string().optional(),
  compatibility: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  /** agentskills.io allows a space-separated string; Claude Code also a list. */
  'allowed-tools': z.union([z.string(), z.array(z.string())]).optional(),
  // --- common Claude Code extension fields ---
  when_to_use: z.string().optional(),
  'argument-hint': z.string().optional(),
  'disable-model-invocation': z.boolean().optional(),
  'user-invocable': z.boolean().optional(),
  model: z.string().optional(),
  /** Project-local convention; the standard places version under `metadata`. */
  version: z.union([z.string(), z.number()]).optional(),
  /**
   * Project-local: coarse self-declared side-effect surface (advisory). Keys
   * mirror `dz mcp-scan`'s capability vocabulary. `limits` is inert today,
   * reserved for a future runtime default-deny layer. See
   * features/capability-manifest/.
   */
  capabilities: z
    .object({
      network: z.boolean().optional(),
      shell: z.boolean().optional(),
      'file-write': z.boolean().optional(),
      dangerous: z.boolean().optional(),
      limits: z
        .object({
          toolTimeoutMs: z.number().optional(),
          maxToolCallsPerTurn: z.number().optional(),
          requireApprovalForDangerous: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

/** A frontmatter object validated against the permissive Claude Code superset. */
export type ClaudeSkillFrontmatter = z.infer<typeof ClaudeSkillFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Composite skill model
// ---------------------------------------------------------------------------

/** A file bundled alongside `SKILL.md` (`scripts/`, `references/`, `assets/`). */
export interface SkillAsset {
  /** Path relative to the skill directory, e.g. `scripts/extract.py`. */
  readonly path: string;
  /** Text payloads use `utf-8`; binary payloads are `base64`-encoded. */
  readonly encoding: 'utf-8' | 'base64';
  /** File content, decoded according to {@link SkillAsset.encoding}. */
  readonly content: string;
}

/**
 * A fully-loaded skill: a stable id, validated frontmatter, the raw `SKILL.md`
 * document, and any bundled assets. This is the unit a platform adapter
 * (`@dzhechkov/adapter-*`) compiles.
 *
 * `frontmatter` is typed as the permissive {@link ClaudeSkillFrontmatter} — the
 * canonical source skills in this repository are Claude Code superset skills.
 * `document` carries the verbatim file text so adapters can emit losslessly;
 * the Markdown body is `document.body`.
 */
export interface CanonicalSkill {
  /** Stable identifier — the skill's directory name. */
  readonly id: string;
  /** Parsed, validated frontmatter (permissive Claude Code superset layer). */
  readonly frontmatter: ClaudeSkillFrontmatter;
  /** The raw `SKILL.md` document — verbatim text, enabling lossless emit. */
  readonly document: SkillDocument;
  /** Bundled files from `scripts/`, `references/`, `assets/`. */
  readonly assets: readonly SkillAsset[];
}
