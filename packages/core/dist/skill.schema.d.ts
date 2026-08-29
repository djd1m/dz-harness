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
export declare const SKILL_NAME_PATTERN: RegExp;
/** Strict `name` field — agentskills.io constraints (1-64 chars, kebab-case). */
export declare const canonicalSkillName: z.ZodString;
/** Strict `description` field — agentskills.io constraints (1-1024 chars). */
export declare const canonicalSkillDescription: z.ZodString;
/**
 * The exact agentskills.io frontmatter standard: `name` and `description`
 * required; `license`, `compatibility`, `metadata`, `allowed-tools` optional.
 * Unknown keys are rejected — this is the portable contract.
 *
 * Note: the standard also requires `name` to equal the parent directory name.
 * That cross-file constraint cannot be expressed on the frontmatter alone; it
 * is enforced by the skill loader, not by this schema.
 */
export declare const CanonicalSkillFrontmatterSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodString;
    license: z.ZodOptional<z.ZodString>;
    compatibility: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    'allowed-tools': z.ZodOptional<z.ZodString>;
}, z.core.$strict>;
/** A frontmatter object validated against the strict agentskills.io standard. */
export type CanonicalSkillFrontmatter = z.infer<typeof CanonicalSkillFrontmatterSchema>;
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
export declare const ClaudeSkillFrontmatterSchema: z.ZodObject<{
    description: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    license: z.ZodOptional<z.ZodString>;
    compatibility: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    'allowed-tools': z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodArray<z.ZodString>]>>;
    when_to_use: z.ZodOptional<z.ZodString>;
    'argument-hint': z.ZodOptional<z.ZodString>;
    'disable-model-invocation': z.ZodOptional<z.ZodBoolean>;
    'user-invocable': z.ZodOptional<z.ZodBoolean>;
    model: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
    capabilities: z.ZodOptional<z.ZodObject<{
        network: z.ZodOptional<z.ZodBoolean>;
        shell: z.ZodOptional<z.ZodBoolean>;
        'file-write': z.ZodOptional<z.ZodBoolean>;
        dangerous: z.ZodOptional<z.ZodBoolean>;
        limits: z.ZodOptional<z.ZodObject<{
            toolTimeoutMs: z.ZodOptional<z.ZodNumber>;
            maxToolCallsPerTurn: z.ZodOptional<z.ZodNumber>;
            requireApprovalForDangerous: z.ZodOptional<z.ZodBoolean>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$loose>;
/** A frontmatter object validated against the permissive Claude Code superset. */
export type ClaudeSkillFrontmatter = z.infer<typeof ClaudeSkillFrontmatterSchema>;
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
//# sourceMappingURL=skill.schema.d.ts.map