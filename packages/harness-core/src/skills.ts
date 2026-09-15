/**
 * Skill discovery + loading — the consolidated filesystem loader.
 *
 * @packageDocumentation
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

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

/**
 * One filesystem entry skipped during skill asset discovery, named so nothing
 * vanishes silently (feature `skills-walk-symlinks-and-junk`, FR-1/FR-2). `path`
 * is the entry's own path (not its symlink target); `reason` is a short,
 * stable, human-readable tag: `'junk file (<pattern>)'` (e.g. `'junk file
 * (*.pyc)'` — fix-round 1 HIGH-1(b): the pattern that matched, not just the
 * verdict), `'junk directory (<name>)'`, `'broken symlink'`, `'symlink escapes
 * the skill directory'` (fix-round 1 AM-8), `'symlink cycle — directory
 * already visited'`, or `'unreadable directory (<errno message>)'` (fix-round
 * 1 MEDIUM-3).
 */
export interface SkippedEntry {
  readonly path: string;
  readonly reason: string;
}

/** The result of {@link walkFiles}: the real assets found, plus everything skipped. */
export interface SkillWalkResult {
  readonly files: readonly string[];
  readonly skipped: readonly SkippedEntry[];
}

/**
 * Directory names that never carry legitimate skill assets — build/cache artifacts a
 * skill author does not intend to ship. **This list IS the published contract for "what
 * counts as junk"** (fix-round 1 HIGH-1(a), REFUTED-by-contract — see
 * `packages/@dzhechkov/harness-core/README.md`, "What counts as junk"): a skill cannot
 * ship a directory bearing one of these exact names as an asset, on purpose or by
 * accident — that is the deliberate, documented trade the design makes, not an
 * oversight to be widened into content-sniffing heuristics. NOT a whitelist of allowed
 * directories: any OTHER name (including a dotdir the author added on purpose) is
 * walked as usual — filtering a user's own files is not this list's job (FR-2,
 * requirements AC-1).
 */
export const SKILL_JUNK_DIRS: ReadonlySet<string> = new Set([
  '__pycache__', // Python bytecode cache
  'node_modules', // an accidentally-vendored dependency tree
  '.git', // VCS metadata
  '__MACOSX', // macOS zip-archive resource-fork sidecar directory (fix-round 1 MEDIUM-2)
  '.pytest_cache', // pytest's cache directory (fix-round 1 MEDIUM-2)
  '.mypy_cache', // mypy's cache directory (fix-round 1 MEDIUM-2)
]);

/** Exact junk filenames skipped during skill asset discovery (FR-2). */
export const SKILL_JUNK_FILES: ReadonlySet<string> = new Set([
  '.DS_Store', // macOS Finder folder metadata
  'Thumbs.db', // Windows Explorer thumbnail cache
]);

/** Junk filename SUFFIXES skipped during skill asset discovery (FR-2). */
const SKILL_JUNK_FILE_SUFFIXES: readonly string[] = [
  '.pyc', // Python bytecode
  '.pyo', // Python optimized bytecode
  '.swp', // Vim swap file
  '.swo', // Vim swap file, second form left after a crash recovery (fix-round 1 MEDIUM-2)
  // A trailing `~` (editor backup) is deliberately NOT on this list (Codex r2 HIGH, lead
  // decision): it is the one pattern a legitimate asset name can plausibly end with
  // (`notes~`), and FR-2's list is conservative by contract — a false positive here would
  // silently drop a real asset, which AC-1 forbids. Backup files ending in `~` ship as assets.
];

/** Junk filename PREFIXES skipped during skill asset discovery (fix-round 1 MEDIUM-2). */
const SKILL_JUNK_FILE_PREFIXES: readonly string[] = [
  '.#', // Emacs lock file (e.g. `.#notes.txt`), left behind by an unclean editor exit
];

/** True when `name` matches a documented junk-file pattern (FR-2). */
export function isSkillJunkFile(name: string): boolean {
  if (SKILL_JUNK_FILES.has(name)) return true;
  if (SKILL_JUNK_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))) return true;
  return SKILL_JUNK_FILE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * The ONE decision point `walkFiles` calls to ask "is this entry junk?" — a directory
 * check and a file check both funnel through here so a single mutation can prove (or
 * disprove) that junk filtering, as a whole, is wired in (registry entry
 * `walk-filters-junk`). Splitting this into two never-both-mutated call sites would let
 * a mutation of just one half pass unnoticed while the other half still filtered.
 */
function isJunkEntry(name: string, kind: 'file' | 'directory'): boolean {
  return kind === 'directory' ? SKILL_JUNK_DIRS.has(name) : isSkillJunkFile(name);
}

/**
 * Which junk PATTERN `name` matched — used to build a `reason` that NAMES the pattern,
 * not just the verdict (fix-round 1 HIGH-1(b): `'junk file (*.pyc)'`, never a bare
 * `'junk file'`). Kept separate from {@link isJunkEntry} (the one go/no-go point the
 * `walk-filters-junk` mutation targets) so a mutation of the decision does not also
 * have to fake this label to stay silent.
 */
function junkPatternLabel(name: string, kind: 'file' | 'directory'): string {
  if (kind === 'directory') return name;
  if (SKILL_JUNK_FILES.has(name)) return name;
  for (const suffix of SKILL_JUNK_FILE_SUFFIXES) {
    if (name.endsWith(suffix)) return `*${suffix}`;
  }
  for (const prefix of SKILL_JUNK_FILE_PREFIXES) {
    if (name.startsWith(prefix)) return `${prefix}*`;
  }
  return name; // unreachable when isJunkEntry(name, kind) is true; kept total, not partial.
}

/**
 * True when `targetRealPath` lies within `rootRealDir` — refuses a symlink whose
 * resolved target escapes the skill directory (lead item AM-8: `assets/secret ->
 * /etc/hostname`, or `-> ../../..`, must never be followed and bundled as an asset).
 * Uses `relative()` plus a leading-`..`/absolute check rather than a lexical
 * `startsWith`, the SAME idiom as `containedUnderRoot` in
 * `packages/@dzhechkov/harness-cli/src/cli.ts` (read-only reference for technique) —
 * a lexical string-prefix check is fooled by a sibling directory that happens to share
 * the root as a text prefix (root `/a/b` vs. target `/a/bc`).
 */
function isContained(rootRealDir: string, targetRealPath: string): boolean {
  if (targetRealPath === rootRealDir) return true;
  const rel = relative(rootRealDir, targetRealPath);
  // Codex r2 MEDIUM (lead fix): only a `..` COMPONENT escapes — a file legitimately named
  // `..asset` yields rel === '..asset', which is inside the root.
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * Recursively list every real, non-junk file under `dir`, resolving symlinks to
 * their targets and guarding against symlink cycles.
 *
 * A `Dirent` from `readdirSync` answers `false` to BOTH `isDirectory()` and
 * `isFile()` for a symlink entry — trusting those two checks alone silently drops
 * every symlinked asset (MEASURED: 2 of 4 fixture assets vanished, exit 0). This
 * resolves each symlink with `statSync` (which follows the link) before deciding
 * whether it names a file or a directory.
 *
 * Cycle guard: each directory's `realpath` is recorded in `seenRealDirs` while
 * it is being walked and REMOVED again when its walk returns — the set is the
 * chain of ANCESTORS on the current recursion path, not every directory ever
 * visited. A directory (reached directly or through a symlink) whose real path is
 * already on that chain ends the walk there instead of recursing — this is what
 * stops `a -> ..` from hanging (AC-2; registry entry `walk-guards-cycles`). Two
 * non-cyclic aliases of the same directory (`alias1 -> shared`, `alias2 -> shared`)
 * are BOTH walked under their own logical paths (Codex r2 HIGH, lead fix): an
 * alias is not a cycle, and the earlier visited-set semantics silently dropped the
 * second one as if it were.
 *
 * Containment guard (lead item AM-8): every symlink's resolved target is checked
 * against `rootRealDir` — the real path of the directory the OUTERMOST call was
 * given (the skill directory itself, for every caller in this file) — before it is
 * followed. A symlink whose target resolves outside that root is skipped, named,
 * never bundled as an asset; `rootRealDir` is threaded through every recursive call
 * so a nested symlinked directory is still checked against the ORIGINAL skill root,
 * not against whichever subdirectory happens to be walking it.
 *
 * `readdirSync` failure (fix-round 1 MEDIUM-3) — e.g. an unreadable directory whose
 * own `realpath` still resolved — produces a named `skipped` entry, same as an
 * unresolvable `realpathSync`; it never throws out of this function or out of
 * {@link loadSkillFromDir}.
 */
export function walkFiles(
  dir: string,
  seenRealDirs: Set<string> = new Set<string>(),
  rootRealDir?: string,
): SkillWalkResult {
  const files: string[] = [];
  const skipped: SkippedEntry[] = [];

  let realDir: string;
  try {
    realDir = realpathSync(dir);
  } catch (error) {
    skipped.push({ path: dir, reason: `unreadable directory (${error instanceof Error ? error.message : String(error)})` });
    return { files, skipped };
  }
  if (seenRealDirs.has(realDir)) {
    skipped.push({ path: dir, reason: 'symlink cycle — directory already visited' });
    return { files, skipped };
  }
  seenRealDirs.add(realDir);
  const root = rootRealDir ?? realDir;

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    skipped.push({ path: dir, reason: `unreadable directory (${error instanceof Error ? error.message : String(error)})` });
    seenRealDirs.delete(realDir);
    return { files, skipped };
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);

    if (entry.isSymbolicLink()) {
      let target;
      try {
        target = statSync(full); // follows the link
      } catch {
        skipped.push({ path: full, reason: 'broken symlink' });
        continue;
      }
      let resolvedReal: string;
      try {
        resolvedReal = realpathSync(full);
      } catch {
        // statSync just followed this same link successfully, so this is very unlikely
        // (a race with something deleting the target); treat it the same as broken.
        skipped.push({ path: full, reason: 'broken symlink' });
        continue;
      }
      if (!isContained(root, resolvedReal)) {
        skipped.push({ path: full, reason: 'symlink escapes the skill directory' });
        continue;
      }
      if (target.isDirectory()) {
        if (isJunkEntry(entry.name, 'directory')) {
          skipped.push({ path: full, reason: `junk directory (${junkPatternLabel(entry.name, 'directory')})` });
          continue;
        }
        const nested = walkFiles(full, seenRealDirs, root);
        files.push(...nested.files);
        skipped.push(...nested.skipped);
      } else if (target.isFile()) {
        if (isJunkEntry(entry.name, 'file')) {
          skipped.push({ path: full, reason: `junk file (${junkPatternLabel(entry.name, 'file')})` });
          continue;
        }
        files.push(full);
      } else {
        skipped.push({ path: full, reason: 'symlink target is neither a file nor a directory' });
      }
      continue;
    }

    if (entry.isDirectory()) {
      if (isJunkEntry(entry.name, 'directory')) {
        skipped.push({ path: full, reason: `junk directory (${junkPatternLabel(entry.name, 'directory')})` });
        continue;
      }
      const nested = walkFiles(full, seenRealDirs, root);
      files.push(...nested.files);
      skipped.push(...nested.skipped);
    } else if (entry.isFile()) {
      if (isJunkEntry(entry.name, 'file')) {
        skipped.push({ path: full, reason: `junk file (${junkPatternLabel(entry.name, 'file')})` });
        continue;
      }
      files.push(full);
    } else {
      skipped.push({ path: full, reason: 'not a regular file, directory, or symlink' });
    }
  }

  // Ancestor-chain semantics (see the cycle-guard doc above): this directory's walk is
  // over, so a sibling alias of it must be allowed to walk it again under its own path.
  seenRealDirs.delete(realDir);
  return { files, skipped };
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
    // Codex r3 (lead fix): the SKILL.md containment check guards EVERY public reader, not
    // only loadSkillFromDir/getSkillInfo — an escaping SKILL.md symlink is refused here too.
    assertSkillMdContained(join(skillsDir, id), join(skillsDir, id, 'SKILL.md'), id);
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
    // Codex r3 (lead fix): never read an ESCAPING SKILL.md even for a diagnostic snippet —
    // the first line of a file outside the skill directory is not ours to print.
    assertSkillMdContained(join(skillsDir, id), path, id);
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
      // Codex r3 (lead fix): refused BEFORE the read; the throw lands in `failures` below.
      assertSkillMdContained(join(skillsDir, id), join(skillsDir, id, 'SKILL.md'), id);
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
/**
 * Codex r2 CRITICAL (lead fix, AM-8 completed): the walk's containment guard runs AFTER
 * `SKILL.md` has already been read, so a `SKILL.md` that is itself a symlink escaping
 * the skill directory (`SKILL.md -> /etc/motd`, `-> ../../outside.md`) was followed and
 * installed regardless. `SKILL.md` is mandatory, so an escaping one cannot be "skipped" —
 * the whole skill is REFUSED with a named reason, never loaded from outside its directory.
 * An in-tree `SKILL.md` symlink (a real file elsewhere inside the same skill directory)
 * still loads. Returns nothing; throws on escape.
 */
function assertSkillMdContained(skillDir: string, skillMdPath: string, id: string): void {
  if (!lstatSync(skillMdPath).isSymbolicLink()) return;
  const rootReal = realpathSync(skillDir);
  const targetReal = realpathSync(skillMdPath);
  if (!isContained(rootReal, targetReal)) {
    throw new Error(
      `skill ${JSON.stringify(id)}: SKILL.md is a symlink escaping the skill directory (-> ${targetReal}) — refused`,
    );
  }
}

export function getSkillInfo(skillsDir: string, id: string): SkillInfo | undefined {
  const skillDir = join(skillsDir, id);
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return undefined;
  assertSkillMdContained(skillDir, skillMdPath, id);
  const document = parseSkillDocument(readFileSync(skillMdPath, 'utf-8'));
  const fm = parseYaml(document.frontmatterYaml) as Record<string, unknown>;
  const parsed = ClaudeSkillFrontmatterSchema.parse(fm);
  const assetPaths = walkFiles(skillDir)
    .files.filter((p) => p !== skillMdPath)
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
 * A {@link CanonicalSkill} plus, optionally, the {@link SkippedEntry} list
 * {@link loadSkillFromDir} collected while walking the skill's directory. The
 * field is additive and optional — a `CanonicalSkill`-typed caller (every
 * adapter, every existing consumer) sees exactly the shape it always saw;
 * only a caller that reads `.skipped` learns about junk/broken-symlink skips.
 */
export type LoadedSkill = CanonicalSkill & { readonly skipped?: readonly SkippedEntry[] };

/**
 * Load one `<skillsDir>/<id>/` directory into a {@link CanonicalSkill}: its
 * `SKILL.md` document plus every other file as a bundled asset. Junk entries
 * and broken/cyclic symlinks encountered along the way are named in
 * `.skipped` (feature `skills-walk-symlinks-and-junk`, FR-1/FR-2) — omitted
 * entirely when nothing was skipped, never a silent drop.
 *
 * @throws if the skill directory has no `SKILL.md`.
 */
export function loadSkillFromDir(skillsDir: string, id: string): LoadedSkill {
  const skillDir = join(skillsDir, id);
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) {
    throw new Error(`skill not found: ${JSON.stringify(id)} (looked in ${skillsDir})`);
  }
  assertSkillMdContained(skillDir, skillMdPath, id);
  const document = parseSkillDocument(readFileSync(skillMdPath, 'utf-8'));
  const frontmatter = ClaudeSkillFrontmatterSchema.parse(parseYaml(document.frontmatterYaml));
  const walk = walkFiles(skillDir);
  const assets: SkillAsset[] = walk.files
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
  return walk.skipped.length > 0
    ? { id, frontmatter, document, assets, skipped: walk.skipped }
    : { id, frontmatter, document, assets };
}
