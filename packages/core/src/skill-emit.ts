/**
 * Skill-tree emit + verify — the platform-neutral engine behind every adapter.
 *
 * All four target platforms (Claude Code, Codex, OpenCode, Hermes) consume the
 * same agentskills.io skill directory; they differ only in the root directory
 * they scan. So the emit logic lives here once, parameterised by `skillsRoot`,
 * and each `@dzhechkov/adapter-*` package is a thin wrapper that supplies its
 * platform's root. See `features/extended-a-migration/g4-adapters-research.md`.
 *
 * @packageDocumentation
 */

import type { EmitResult, VerifyResult } from './adapter.js';
import { parseSkillDocument, serializeSkillDocument, SkillDocumentError } from './skill-document.js';
import type { CanonicalSkill, SkillAsset } from './skill.schema.js';

/** A skill id must be a single, safe path segment. Exported so every adapter
 * (incl. non-skill-tree ones like copilot) can share one id-safety contract. */
export function assertSafeId(id: string): void {
  if (id.length === 0 || id === '.' || id === '..' || /[\\/]/.test(id)) {
    throw new Error(`skill-emit: invalid skill id ${JSON.stringify(id)}`);
  }
}

/** Normalise an asset path to a forward-slash, project-relative, traversal-free
 * form. Exported so adapters that compose their own paths can reuse it. */
export function normalizeAssetPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    normalized.length === 0 ||
    normalized.startsWith('/') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`skill-emit: unsafe asset path ${JSON.stringify(rawPath)}`);
  }
  return normalized;
}

/** Options for {@link emitSkillTree}. */
export interface EmitSkillTreeOptions {
  /** The skills root for the target platform, e.g. `.claude/skills`. */
  readonly skillsRoot: string;
  /** When true, a frontmatter-name / directory mismatch throws instead of warning. */
  readonly strict?: boolean;
}

/**
 * Emit a {@link CanonicalSkill} as an agentskills.io skill directory under
 * `skillsRoot`. **Pure** — returns the files to write, never touches the
 * filesystem, and the same input always yields the same output. The `SKILL.md`
 * content is the skill's document text verbatim, so emit is lossless.
 *
 * @throws if the skill id or an asset path is unsafe, or — in `strict` mode —
 * if the frontmatter `name` does not match the skill directory.
 */
export function emitSkillTree(skill: CanonicalSkill, options: EmitSkillTreeOptions): EmitResult {
  assertSafeId(skill.id);

  const warnings: string[] = [];
  const skillDir = `${options.skillsRoot}/${skill.id}`;

  const { name } = skill.frontmatter;
  if (name !== undefined && name !== skill.id) {
    const message = `frontmatter name ${JSON.stringify(name)} does not match skill directory ${JSON.stringify(skill.id)}`;
    if (options.strict === true) throw new Error(`skill-emit: ${message}`);
    warnings.push(message);
  }

  const files: SkillAsset[] = [
    {
      path: `${skillDir}/SKILL.md`,
      encoding: 'utf-8',
      content: serializeSkillDocument(skill.document),
    },
  ];
  for (const asset of skill.assets) {
    files.push({
      path: `${skillDir}/${normalizeAssetPath(asset.path)}`,
      encoding: asset.encoding,
      content: asset.content,
    });
  }
  return { files, warnings };
}

/** Matches a `SKILL.md` file at any directory depth. */
const SKILL_MD = /(?:^|\/)SKILL\.md$/;

/** Options for {@link verifySkillTree}. */
export interface VerifySkillTreeOptions {
  /** The skills root the emitted SKILL.md is expected to live under. */
  readonly skillsRoot: string;
}

/**
 * Structurally validate an {@link EmitResult}: exactly one `SKILL.md`, a
 * parseable document envelope, only safe relative paths, located under
 * `skillsRoot`. Carries `emit.warnings` through.
 */
export function verifySkillTree(emit: EmitResult, options: VerifySkillTreeOptions): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [...emit.warnings];

  for (const file of emit.files) {
    if (file.path.startsWith('/')) {
      errors.push(`emitted path must be relative: ${file.path}`);
    }
    if (file.path.split('/').includes('..')) {
      errors.push(`emitted path must not contain "..": ${file.path}`);
    }
  }

  const skillMds = emit.files.filter((file) => SKILL_MD.test(file.path));
  if (skillMds.length === 0) {
    errors.push('emit contains no SKILL.md');
  } else if (skillMds.length > 1) {
    errors.push(`emit contains ${skillMds.length} SKILL.md files, expected exactly one`);
  } else {
    const skillMd = skillMds[0]!;
    if (skillMd.encoding !== 'utf-8') {
      errors.push(`SKILL.md must be utf-8 encoded, got ${skillMd.encoding}`);
    }
    try {
      parseSkillDocument(skillMd.content);
    } catch (error) {
      const reason = error instanceof SkillDocumentError ? error.message : String(error);
      errors.push(`SKILL.md is not a valid document: ${reason}`);
    }
    if (!skillMd.path.includes(`${options.skillsRoot}/`)) {
      warnings.push(`SKILL.md is outside ${options.skillsRoot}/: ${skillMd.path}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
