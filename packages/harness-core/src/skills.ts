/**
 * Skill discovery + loading — the consolidated filesystem loader.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { ClaudeSkillFrontmatterSchema, parseSkillDocument } from '@dzhechkov/core';
import type { CanonicalSkill, SkillAsset } from '@dzhechkov/core';

/** A discovered skill — id plus its description, for listings. */
export interface SkillSummary {
  readonly id: string;
  readonly description: string;
}

/** Detailed skill info. */
export interface SkillInfo {
  readonly id: string;
  readonly description: string;
  readonly name: string;
  readonly trustTier: number | undefined;
  readonly version: string | number | undefined;
  readonly assetCount: number;
  readonly assetPaths: string[];
  readonly frontmatter: Record<string, unknown>;
}

/**
 * Read one asset file, choosing the encoding that round-trips losslessly.
 *
 * Text files are read as `utf-8`. Binary files (detected by a NUL byte or a
 * byte sequence that does not survive a `utf-8` decode/encode round-trip) are
 * read as `base64` so {@link applyEmitResult} writes them back byte-for-byte.
 * Without this, binary assets (PNGs, fonts, archives) were silently mangled by
 * a hardcoded `utf-8` read while `verify` still reported `ok`.
 */
function readAssetContent(path: string): { encoding: 'utf-8' | 'base64'; content: string } {
  const buf = readFileSync(path);
  // NUL byte is a strong, cheap signal of binary content.
  if (buf.includes(0)) {
    return { encoding: 'base64', content: buf.toString('base64') };
  }
  // Round-trip through utf-8: if decoding then re-encoding changes the bytes,
  // the file is not valid utf-8 (e.g. latin-1 / arbitrary binary) and must be
  // preserved as base64.
  const decoded = buf.toString('utf-8');
  if (!Buffer.from(decoded, 'utf-8').equals(buf)) {
    return { encoding: 'base64', content: buf.toString('base64') };
  }
  return { encoding: 'utf-8', content: decoded };
}

/** Recursively list every file under `dir`. */
function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Return the ids of every `<skillsDir>/<id>/SKILL.md`, sorted. */
export function discoverSkillIds(skillsDir: string): string[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(skillsDir, entry.name, 'SKILL.md')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Discover every skill in `skillsDir`, returning id + description.
 *
 * **Throws on the first unloadable skill — deliberately, and permanently.** This is a
 * published export; silently turning it into a skip-and-collect function would downgrade
 * every unknown third-party consumer from fail-closed to fail-silent without their
 * consent (an incomplete catalogue reported as complete). Callers that want a partial
 * listing ask for one by name: {@link listSkillsDetailed}. A pinned regression test
 * asserts this function still throws, so a future "helpful" refactor cannot quietly
 * erase the strict variant. (feature dz-cli-defects, ADR-001 as amended by AM-6.)
 */
export function listSkills(skillsDir: string): SkillSummary[] {
  return discoverSkillIds(skillsDir).map((id) => {
    const document = parseSkillDocument(readFileSync(join(skillsDir, id, 'SKILL.md'), 'utf-8'));
    const frontmatter = ClaudeSkillFrontmatterSchema.parse(parseYaml(document.frontmatterYaml));
    return { id, description: frontmatter.description };
  });
}

// ---------------------------------------------------------------------------
// Skip-and-collect (feature dz-cli-defects, D1)
//
// The parser (`@dzhechkov/core/src/skill-document.ts`) is handed only TEXT, so its
// message can never carry a path. `describeSkillLoadFailure` is the ONE place that
// turns a pathless throw into a named failure — every consumer calls it, so "named,
// never anonymous" has one implementation and one test.
// ---------------------------------------------------------------------------

/** How much of the offending file's first line is echoed back to the user. */
export const SKILL_FAILURE_FIRST_LINE_MAX = 100;

/** One skill directory that could not be loaded. Named, so a log is actionable. */
export interface SkillLoadFailure {
  /** The skill id (its directory name), e.g. `bto`. */
  readonly id: string;
  /** ABSOLUTE path to the offending `SKILL.md`. */
  readonly path: string;
  /** The caught error's message, verbatim — the classifier stays out of the loader. */
  readonly reason: string;
  /**
   * First line of the source text, trimmed and capped at
   * {@link SKILL_FAILURE_FIRST_LINE_MAX}; `''` when the file is unreadable. Echoing it
   * is what turns the message into a FIX — the user sees the H1 and knows to add the
   * frontmatter fence.
   */
  readonly firstLine: string;
}

/** A listing that separates what parsed from what did not. */
export interface SkillListing {
  /** Sorted by id — same order, same shape as {@link listSkills} produces today. */
  readonly skills: readonly SkillSummary[];
  /** Sorted by id. Empty when every skill loaded. */
  readonly failures: readonly SkillLoadFailure[];
}

/**
 * Attribute any skill-load throw to a file. Shared by every consumer
 * (`listSkillsDetailed`, `runInit`, `runInitSingleFileMd`, `runSync`).
 *
 * Best-effort on the first line: an unreadable file yields `''` rather than a second
 * throw — this helper runs on an error path and must never become one.
 */
export function describeSkillLoadFailure(
  skillsDir: string,
  id: string,
  error: unknown,
): SkillLoadFailure {
  const path = join(skillsDir, id, 'SKILL.md');
  let firstLine = '';
  try {
    const raw = readFileSync(path, 'utf-8');
    const line = (raw.split('\n', 1)[0] ?? '').replace(/\r$/, '').trim();
    firstLine =
      line.length > SKILL_FAILURE_FIRST_LINE_MAX
        ? `${line.slice(0, SKILL_FAILURE_FIRST_LINE_MAX)}…`
        : line;
  } catch {
    firstLine = '';
  }
  return {
    id,
    path,
    reason: error instanceof Error ? error.message : String(error),
    firstLine,
  };
}

/**
 * Discover every skill in `skillsDir`, separating the ones that parsed from the ones
 * that did not. One broken `SKILL.md` never hides the rest.
 *
 * Catch policy: **every** error per id, not only `SkillDocumentError` — an `EACCES`, a
 * YAML syntax error and a Zod schema rejection are all equally "this one skill is
 * unusable". The `reason` is the caught message verbatim.
 */
export function listSkillsDetailed(skillsDir: string): SkillListing {
  const skills: SkillSummary[] = [];
  const failures: SkillLoadFailure[] = [];
  for (const id of discoverSkillIds(skillsDir)) {
    try {
      const document = parseSkillDocument(readFileSync(join(skillsDir, id, 'SKILL.md'), 'utf-8'));
      const frontmatter = ClaudeSkillFrontmatterSchema.parse(parseYaml(document.frontmatterYaml));
      skills.push({ id, description: frontmatter.description });
    } catch (error) {
      failures.push(describeSkillLoadFailure(skillsDir, id, error));
    }
  }
  return { skills, failures };
}

/**
 * Render a `SkillLoadFailure[]` as the diagnostic block a CLI writes to **stderr**.
 *
 * One helper, two rendering modes, chosen by the CALLER — never by the helper sniffing
 * the path. `dz list` / `dz sync` print absolute paths (the user can act on those);
 * `dz install` passes `relativeTo` = the downloaded package root, because a
 * `node_modules/**` absolute path is not something the user can act on.
 *
 * Returns `[]` for an empty input, so callers can splice it unconditionally.
 */
export function formatSkillLoadFailures(
  failures: readonly SkillLoadFailure[],
  opts: { readonly relativeTo?: string } = {},
): string[] {
  if (failures.length === 0) return [];
  const lines = [`⚠ ${failures.length} skill(s) skipped (unparseable SKILL.md):`];
  for (const failure of failures) {
    const shown =
      opts.relativeTo !== undefined
        ? relative(opts.relativeTo, failure.path).split('\\').join('/')
        : failure.path;
    lines.push(`  ${shown}`);
    lines.push(`    ${failure.reason}`);
    if (failure.firstLine !== '') lines.push(`    (line 1: ${JSON.stringify(failure.firstLine)})`);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// The SECOND failure kind (fix round 1, QE F4)
//
// A load failure and an APPLY failure are different accusations. The first says
// "this SKILL.md is broken"; the second says "this skill is fine, the target could
// not be written". Funnelling both through `describeSkillLoadFailure` produced a
// message that contradicted its own body — an `EEXIST: mkdir …/.claude/skills/alpha`
// rendered under the header "unparseable SKILL.md", quoting `line 1: "---"` (a VALID
// fence) as its evidence and naming the innocent SOURCE file (MEASURED 2026-08-18).
// Driver D2 ("every failure must name its subject") is worse than unmet when the
// subject named is the wrong artifact.
// ---------------------------------------------------------------------------

/**
 * One skill that LOADED cleanly but could not be compiled for, or written to, the
 * target. The subject is the TARGET, never the source `SKILL.md`.
 */
export interface SkillApplyFailure {
  /** The skill id (its directory name). */
  readonly id: string;
  /** The caught error's message, verbatim. */
  readonly reason: string;
}

/**
 * Render a `SkillApplyFailure[]` as the diagnostic block a CLI writes to **stderr**.
 *
 * Deliberately a DIFFERENT header from {@link formatSkillLoadFailures}: the two kinds
 * point the user at two different files, and a shared header is what let a write
 * failure masquerade as a parse failure.
 *
 * Returns `[]` for an empty input, so callers can splice it unconditionally.
 */
export function formatSkillApplyFailures(failures: readonly SkillApplyFailure[]): string[] {
  if (failures.length === 0) return [];
  const lines = [`✗ ${failures.length} skill(s) failed to install (compile/write error):`];
  for (const failure of failures) {
    lines.push(`  ${failure.id}`);
    lines.push(`    ${failure.reason}`);
  }
  return lines;
}

/** Get detailed info about a single skill without loading all assets. */
export function getSkillInfo(skillsDir: string, id: string): SkillInfo | undefined {
  const skillDir = join(skillsDir, id);
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return undefined;
  const document = parseSkillDocument(readFileSync(skillMdPath, 'utf-8'));
  const fm = parseYaml(document.frontmatterYaml) as Record<string, unknown>;
  const parsed = ClaudeSkillFrontmatterSchema.parse(fm);
  const assetPaths = walkFiles(skillDir)
    .filter((p) => p !== skillMdPath)
    .map((p) => relative(skillDir, p).split('\\').join('/'))
    .sort();
  return {
    id,
    description: parsed.description,
    name: parsed.name ?? id,
    trustTier: fm['trust_tier'] as number | undefined,
    version: parsed.version as string | number | undefined,
    assetCount: assetPaths.length,
    assetPaths,
    frontmatter: fm,
  };
}

/**
 * Load one `<skillsDir>/<id>/` directory into a {@link CanonicalSkill}: its
 * `SKILL.md` document plus every other file as a bundled asset.
 *
 * @throws if the skill directory has no `SKILL.md`.
 */
export function loadSkillFromDir(skillsDir: string, id: string): CanonicalSkill {
  const skillDir = join(skillsDir, id);
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new Error(`skill not found: ${JSON.stringify(id)} (looked in ${skillsDir})`);
  }
  const document = parseSkillDocument(readFileSync(skillMdPath, 'utf-8'));
  const frontmatter = ClaudeSkillFrontmatterSchema.parse(parseYaml(document.frontmatterYaml));
  const assets: SkillAsset[] = walkFiles(skillDir)
    .filter((path) => path !== skillMdPath)
    .map((path) => {
      const { encoding, content } = readAssetContent(path);
      return {
        path: relative(skillDir, path).split('\\').join('/'),
        encoding,
        content,
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
  return { id, frontmatter, document, assets };
}
