/**
 * Skill registry — indexes all skills across skill packs for search and discovery.
 *
 * Scans `packages/@dzhechkov/skills-*` directories, reads SKILL.md frontmatter,
 * and builds a searchable index.
 *
 * @packageDocumentation
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync, type Dirent } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve every `@dzhechkov` base directory that may hold `skills-*` packs, for a given
 * working directory. Ordered by precedence (first wins on pack-name collision):
 *
 *   1. `<cwd>/packages/@dzhechkov`      — monorepo/dev checkout (source of truth)
 *   2. `<cwd>/node_modules/@dzhechkov`  — project-local npm install
 *   3. self-location                    — where THIS module (harness-core) is installed,
 *      walking up for any `@dzhechkov` ancestor and each `node_modules/@dzhechkov`.
 *
 * Step 3 is what makes a **global** `dz` install work: when `dz` runs in a project that does
 * not itself depend on the skill packs, the packs sit next to the installed `harness-core`
 * (e.g. `.../harness-cli/node_modules/@dzhechkov/skills-*`), a location the cwd-relative
 * scans (1, 2) never reach. Returns only directories that exist, de-duplicated, in order.
 */
export function skillPackBaseDirs(cwd: string): string[] {
  const bases: string[] = [];
  const add = (dir: string): void => {
    if (!bases.includes(dir)) bases.push(dir);
  };

  // Extra @scopes and local pack roots from `.dz/config.json` (ADR-001 v2): makes packs in other
  // npm scopes (e.g. a private @mybooks registry) OR arbitrary local dirs first-class for
  // discovery — the path for generated book packs distributed privately, not via public @dzhechkov.
  const { skillScopes, skillDirs } = readSkillDiscoveryConfig(cwd);
  const scopes = ['@dzhechkov', ...skillScopes];

  for (const scope of scopes) add(join(cwd, 'packages', scope));
  for (const scope of scopes) add(join(cwd, 'node_modules', scope));

  // Self-location: harness-core is co-installed with the skill packs (siblings under the same
  // scope dir, or one `node_modules` hop away). Walk up for each configured scope.
  try {
    let dir = dirname(fileURLToPath(import.meta.url)); // .../@dzhechkov/harness-core/dist
    for (let depth = 0; depth < 8; depth += 1) {
      for (const scope of scopes) {
        if (basename(dir) === scope) add(dir);
        add(join(dir, 'node_modules', scope));
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // import.meta.url unavailable (unexpected in ESM) — cwd scans still apply.
  }

  // Arbitrary local pack roots (each directly contains `skills-*` dirs). Resolved against cwd.
  for (const d of skillDirs) add(resolve(cwd, d));

  return bases.filter((dir) => existsSync(dir));
}

/** Read `discovery.skillScopes[]` / `discovery.skillDirs[]` from `.dz/config.json` (empty on any error). */
function readSkillDiscoveryConfig(cwd: string): { skillScopes: string[]; skillDirs: string[] } {
  try {
    const cfg = JSON.parse(readFileSync(join(cwd, '.dz', 'config.json'), 'utf-8')) as {
      discovery?: { skillScopes?: unknown; skillDirs?: unknown };
    };
    const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    return { skillScopes: arr(cfg.discovery?.skillScopes), skillDirs: arr(cfg.discovery?.skillDirs) };
  } catch {
    return { skillScopes: [], skillDirs: [] };
  }
}

/** List `skills-*` pack directories across all base dirs, de-duplicated by pack name (first wins). */
export function discoverSkillPackDirs(cwd: string): { pack: string; dir: string }[] {
  const seen = new Set<string>();
  const out: { pack: string; dir: string }[] = [];
  for (const base of skillPackBaseDirs(cwd)) {
    for (const e of readdirSync(base, { withFileTypes: true })) {
      // pnpm links workspace/`node_modules` packages as SYMLINKS, so `isDirectory()` is false for
      // them and every pack would be skipped — a verifier that checks nothing (cross-model review,
      // 2026-07-10). Follow a symlink at the PACK-ROOT level only; file hashing below still refuses
      // to follow symlinks (O_NOFOLLOW).
      const isPackDir =
        e.isDirectory() ||
        (e.isSymbolicLink() && (() => { try { return statSync(join(base, e.name)).isDirectory(); } catch { return false; } })());
      if (isPackDir && e.name.startsWith('skills-') && !seen.has(e.name)) {
        seen.add(e.name);
        out.push({ pack: e.name, dir: join(base, e.name) });
      }
    }
  }
  return out;
}

/**
 * Every pack whose SIGNATURE should be checked: the skill packs above, PLUS any directory in the same
 * base dirs that carries a `.dz-manifest.json`, whatever it is called.
 *
 * A separate function on purpose (ADR-001). `discoverSkillPackDirs` answers "which skill packs are
 * here?" and the `skills-` prefix is a roughly correct answer to THAT. Signature verification asks a
 * different question, and there the prefix is simply wrong: MEASURED 2026-08-21 — 52 signed packs on
 * disk, 26 in the verdict, exactly half invisible, including `keysarium`, `health-advisor`,
 * `harness-core`, `harness-cli` and all ten adapters. `keysarium` drifted from its own signature that
 * same day and the tool said nothing; it was found by a hand-written hash comparison.
 *
 * The UNION rather than a replacement: enumerating only manifest-bearing directories would silently
 * drop the `unsigned` verdict for a `skills-*` pack that carries no manifest — turning "unsigned" into
 * "absent", which is the same class of silence this fixes.
 */
export function discoverVerifiablePackDirs(cwd: string): { pack: string; dir: string }[] {
  const out: { pack: string; dir: string }[] = [];
  // Keyed on the RESOLVED path: a globally-installed `dz` reaches its own bundled packs as well as the
  // project's, and one directory counted twice inflates exactly the coverage number this exists to
  // make honest.
  const seen = new Set<string>();
  const add = (pack: string, dir: string): void => {
    // realpath, not resolve: pnpm links workspace packages into `node_modules` as SYMLINKS, so the
    // SAME pack is reachable under several paths. MEASURED 2026-08-21 — 78 entries over 52 real
    // directories, fourteen of them counted three times. `resolve` normalises a path; only `realpath`
    // answers "is this the same directory".
    let key: string;
    try {
      key = realpathSync(dir);
    } catch {
      key = resolve(dir);
    }
    if (seen.has(key)) return;
    seen.add(key);
    // Return the RESOLVED path. A symlink is a name, not an object: reporting the link would make the
    // verdict describe something a later swap can redirect, and would leave two names for one pack
    // depending on which was seen first (cross-family review, 2026-08-21).
    out.push({ pack, dir: key });
  };
  // An unreadable base must not abort the enumeration: the skill-pack scan does not catch its own
  // readdir, so without this a single permission error hides EVERY pack — a silence far worse than the
  // one this function was written to remove.
  try {
    for (const p of discoverSkillPackDirs(cwd)) add(p.pack, p.dir);
  } catch {
    /* fall through to the manifest scan, which catches per-base */
  }
  for (const base of skillPackBaseDirs(cwd)) {
    let entries: Dirent[];
    try {
      entries = readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const dir = join(base, e.name);
      const isDir =
        e.isDirectory() ||
        (e.isSymbolicLink() &&
          (() => {
            try {
              return statSync(dir).isDirectory();
            } catch {
              return false;
            }
          })());
      if (!isDir) continue;
      // Presence of the manifest is the whole test — an unexpected one is a FACT to be judged, not
      // noise to be filtered by name. But it must be a FILE: `existsSync` is true for a DIRECTORY
      // named `.dz-manifest.json`, which would let any directory declare its parent verifiable
      // (cross-family review, 2026-08-21).
      let hasManifest = false;
      try {
        hasManifest = statSync(join(dir, '.dz-manifest.json')).isFile();
      } catch {
        hasManifest = false;
      }
      if (hasManifest) add(e.name, dir);
    }
  }
  return out;
}

/** A single skill in the registry. */
export interface RegistryEntry {
  readonly id: string;
  readonly pack: string;
  readonly description: string;
  readonly trustTier: number;
  readonly hasSchema: boolean;
  readonly hasEvals: boolean;
  readonly lineCount: number;
  readonly category: string;
}

/** The full registry. */
export interface Registry {
  readonly entries: readonly RegistryEntry[];
  readonly totalSkills: number;
  readonly totalPacks: number;
  readonly categories: readonly string[];
}

/** Extract description from SKILL.md frontmatter. */
function extractFrontmatter(content: string): { description: string; trustTier: number } {
  const tierMatch = /^trust_tier:\s*(\d)/m.exec(content);
  return {
    description: extractDescription(content),
    trustTier: tierMatch ? parseInt(tierMatch[1] ?? '1', 10) : 1,
  };
}

/**
 * Read the `description:` value from YAML frontmatter. Handles two shapes:
 *   description: plain or "quoted" text          → inline value on the same line
 *   description: >   (also >- >+ | |- |+ and an  → YAML block scalar; the text
 *                     optional indent digit)        lives on the following, more-
 *                                                   indented lines
 * Block scalars are folded to a single space-joined line for registry display,
 * so the previous regex-only reader no longer captures the bare `>`/`|` marker.
 */
function extractDescription(content: string): string {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => /^\s*description:/.test(l));
  if (idx === -1) return '';
  const keyLine = lines[idx] ?? '';
  const keyIndent = keyLine.length - keyLine.trimStart().length;
  const inline = keyLine.slice(keyLine.indexOf(':') + 1).trim();

  // Block scalar indicator (`>`/`|` + optional chomping/indent chars): gather the
  // following lines that are indented deeper than the key, until the block dedents.
  if (/^[|>][+-]?\d?$/.test(inline)) {
    const body: string[] = [];
    for (let i = idx + 1; i < lines.length; i += 1) {
      const line = lines[i] ?? '';
      if (line.trim() === '') {
        body.push('');
        continue;
      }
      const indent = line.length - line.trimStart().length;
      if (indent <= keyIndent) break; // dedent → next key or end of frontmatter
      body.push(line.trim());
    }
    return body.join(' ').replace(/\s+/g, ' ').trim();
  }

  // Inline value — strip a single pair of surrounding quotes if present.
  return inline.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
}

/** Infer category from pack name. */
function categoryFromPack(pack: string): string {
  if (pack.includes('devops')) return 'devops';
  if (pack.includes('web3')) return 'web3';
  if (pack.includes('mcp')) return 'mcp';
  if (pack.includes('qe')) return 'qe';
  if (pack.includes('academic')) return 'academic';
  if (pack.includes('ecc')) return 'ecc';
  if (pack.includes('meta')) return 'meta';
  if (pack.includes('reasoning')) return 'reasoning';
  if (pack.includes('news')) return 'news';
  if (pack.includes('bto')) return 'bto';
  if (pack.includes('health')) return 'health';
  // Product & design cluster (ADR-0002)
  if (pack.includes('taste') || pack.includes('cloner')) return 'design';
  if (
    pack.includes('pm') ||
    pack.includes('idea2prd') ||
    pack.includes('reverse-engineering') ||
    pack.includes('presentation') ||
    // decision-mockups: an owner-facing decision page is stakeholder communication, the same
    // cluster as PRDs and presentations — not design, and not a QE artifact.
    pack.includes('decision-mockups') ||
    // package-story-page: a story page that explains one package to non-specialists is stakeholder
    // communication by the same rationale as decision-mockups — and its own README separates it
    // from the tutorial-course sibling, so it is not 'learning'.
    pack.includes('story')
  )
    return 'product';
  // Digitized-book knowledge packs (ADR-001 book-knowledge-digitizer) — `skills-book-*` and named
  // digitizer outputs like `skills-12factor` (The Twelve-Factor App). Future digitized public packs
  // (e.g. AOSA) should be added here or carry a `book`/digitized marker.
  if (pack.includes('book') || pack.includes('12factor')) return 'knowledge';
  // Course/tutorial manufacturing (skills-tutorial-factory: package → Head-First edu-site course).
  if (pack.includes('tutorial')) return 'learning';
  return 'other';
}

/**
 * Build the registry from every `skills-*` pack discovered across all base dirs
 * ({@link skillPackBaseDirs}) — monorepo `packages/@dzhechkov`, project-local
 * `node_modules/@dzhechkov`, **and** the CLI's own install location. This is why
 * `dz registry` works for a globally-installed `dz`, not only inside the monorepo.
 */
export function buildRegistry(cwd: string): Registry {
  const entries: RegistryEntry[] = [];
  const packs = discoverSkillPackDirs(cwd);

  for (const { pack, dir: packDir } of packs) {
    const skillDirs = readdirSync(packDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(packDir, e.name, 'SKILL.md')));

    for (const skill of skillDirs) {
      const skillMdPath = join(packDir, skill.name, 'SKILL.md');
      const content = readFileSync(skillMdPath, 'utf-8');
      const { description, trustTier } = extractFrontmatter(content);

      entries.push({
        id: skill.name,
        pack,
        description,
        trustTier,
        hasSchema: existsSync(join(packDir, skill.name, 'schemas', 'output.json')),
        hasEvals: existsSync(join(packDir, skill.name, 'evals')),
        lineCount: content.split('\n').length,
        category: categoryFromPack(pack),
      });
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));
  const categories = [...new Set(entries.map((e) => e.category))].sort();

  return {
    entries,
    totalSkills: entries.length,
    totalPacks: packs.length,
    categories,
  };
}

/** Search registry by query (matches id and description, case-insensitive). */
export function searchRegistry(registry: Registry, query: string): readonly RegistryEntry[] {
  const q = query.toLowerCase();
  return registry.entries.filter(
    (e) => e.id.toLowerCase().includes(q) || e.description.toLowerCase().includes(q) || e.category.includes(q),
  );
}

/** Filter registry by category. */
export function filterByCategory(registry: Registry, category: string): readonly RegistryEntry[] {
  return registry.entries.filter((e) => e.category === category);
}
