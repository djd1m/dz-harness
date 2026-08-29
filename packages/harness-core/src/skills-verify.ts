/**
 * `dz skills-verify` — does a project's `.claude/skills/` actually REGISTER?
 *
 * Origin (feature skills-verify, ADR-001): `@dzhechkov/health-advisor` 1.2.0 shipped to npm with zero
 * skills registering while its layout test was green — the test asserted a PROXY (files on disk), not
 * the PROPERTY (registration). This module makes the property observable.
 *
 * Two layers:
 *   L1 `scanSkillsLayout`  — instant, no Claude session: which names CAN register, plus the three
 *                            layout shapes that produced the 1.2.0 defect.
 *   L2 `parseInitFacts`    — the authoritative listing, parsed from the `system/init` event of
 *      + `classifyRegistration`  `claude -p --output-format stream-json --verbose`. No model prose.
 *
 * FAIL-CLOSED: anything that prevents an honest observation yields `inconclusive`, never `pass`.
 */

import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

// ── Layer 1: static layout scan ─────────────────────────────────────

/** The three non-registrable shapes, all observed in the health-advisor 1.2.0 defect. */
export type SkillIssueKind =
  | 'no-skill-md'          // a skill dir with no SKILL.md at depth 1 → never registers
  | 'buried-skill-md'      // a SKILL.md at depth >= 2 → the loader does not scan that deep
  | 'plugin-manifest-trap'; // .claude-plugin/plugin.json under .claude/skills → does NOT auto-register

export interface SkillLayoutFinding {
  readonly dir: string;
  readonly kind: SkillIssueKind;
  readonly detail: string;
}

export interface StaticScan {
  /** The project this scan describes — evidence from another project must not be believed (QE4 #4). */
  readonly projectDir: string;
  readonly skillsRoot: string;
  readonly exists: boolean;
  /** Names that CAN register: a dir with SKILL.md exactly one level deep. */
  readonly registrable: readonly string[];
  /** Load-blocking problems: these make the verdict FAIL. */
  readonly findings: readonly SkillLayoutFinding[];
  /**
   * Reported but NOT failing. A `.claude-plugin/plugin.json` under `.claude/skills` did not register
   * in measured practice (MEASURED — reproducer: `dz skills-verify` against the published
   * health-advisor 1.2.0, whose skills were absent from a live session listing), but the layout class
   * may be supported under conditions this gate cannot observe (workspace trust). Telling the user is
   * right; failing their build over it is over-claiming.
   */
  readonly advisories: readonly SkillLayoutFinding[];
  /**
   * Plugin-shaped containers and the skill names they would provide. The layout alone cannot say
   * whether such a container loads (that depends on client support and workspace trust), so the
   * verdict ASKS THE SESSION: if none of a container's candidate names appear in the live listing,
   * it did not register and that is a failure (QE4 #1 — without this, making the container advisory
   * re-opened the vacuous pass and the gate stopped catching health-advisor 1.2.0).
   */
  readonly containers: readonly {
    readonly dir: string;
    /** Absolute path of the container — matched against `init.plugins[].path` (QE5 #1). */
    readonly path: string;
    /** The name the container's OWN manifest declares (may differ from the dir name — QE5 #1b). */
    readonly manifestName: string | null;
    /** Skill names it would provide: discovered on disk AND declared by the manifest (QE5 #4). */
    readonly candidates: readonly string[];
    /** True when the dir ALSO has a depth-1 SKILL.md — a single-skill plugin (QE5 #2). */
    readonly alsoBare: boolean;
  }[];
  /**
   * Set when the scan could not complete (unreadable dir, `.claude/skills` is a file, …). A failed
   * scan must NOT read as "a clean empty project" — the classifier turns this into `inconclusive`
   * (Codex QE #4).
   */
  readonly scanError?: string;
}

// Bounded on purpose: deep enough for every real layout seen (extended/<name>/, skills/<name>/,
// base/<dep>/), shallow enough not to walk a whole tree. A SKILL.md below this bound is not seen —
// a stated limit, not a silent one (QE6 #9).
const MAX_BURIED_DEPTH = 6;

function findBuriedSkillMd(dir: string, depth: number, acc: string[], errors: string[]): void {
  if (depth > MAX_BURIED_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (error) {
    // A subtree we cannot read is unknown territory, not proven-clean territory (QE2 #1).
    errors.push(`cannot read ${dir}: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '__pycache__' || name.startsWith('.')) continue;
    const full = join(dir, name);
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch (error) {
      errors.push(`cannot stat ${full}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (isDir) {
      findBuriedSkillMd(full, depth + 1, acc, errors);
    } else if (name === 'SKILL.md' && depth >= 2) {
      acc.push(full);
    }
  }
}

function hasPluginManifest(dir: string): boolean {
  return existsSync(join(dir, '.claude-plugin', 'plugin.json'));
}

/**
 * Read a container's own `.claude-plugin/plugin.json`: the name it DECLARES and the skill paths it
 * declares. A manifest may point at a custom path deeper than the on-disk walk, which otherwise left
 * the container with zero candidates and restored a vacuous PASS (QE5 #4).
 */
function readContainerManifest(dir: string): { name: string | null; declared: string[] } {
  try {
    const raw = readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8');
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const name = typeof obj.name === 'string' && obj.name ? obj.name : null;
    const declared = Array.isArray(obj.skills)
      ? obj.skills
          .filter((x): x is string => typeof x === 'string')
          .map((rel) => basename(rel.replace(/\/+$/, '')))
          .filter(Boolean)
      : [];
    return { name, declared };
  } catch {
    return { name: null, declared: [] }; // unreadable/!JSON: the manifest's INTENT still counts
  }
}

/**
 * Does this directory look like it was INTENDED as a skill? A dir with no markdown at all is
 * ordinary content (`scripts/`, `bin/`, `templates/`) — calling it a failed skill is a false FAIL
 * (Codex QE5 #7). MEASURED: naively flagging every dir marked ~40 healthy directories across 9
 * npx-toolkit packages (reproducer: the pack survey in features/skills-verify/08_qe_report.md).
 */
export function looksLikeSkillDir(dir: string): boolean {
  const walk = (d: string, depth: number): boolean => {
    if (depth > 2) return false;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      return false;
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = join(d, name);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        // A DIRECTORY named SKILL.md is a botched skill file, not ordinary content — clear intent.
        if (name === 'SKILL.md') return true;
        if (walk(full, depth + 1)) return true;
      } else if (name.toLowerCase().endsWith('.md')) {
        return true;
      }
    }
    return false;
  };
  return walk(dir, 1);
}

/**
 * A directory registers only if `SKILL.md` is a regular FILE. `existsSync` also answers true for a
 * DIRECTORY named SKILL.md, which registers nothing yet suppressed every other check (QE2 #4).
 */
function hasSkillFile(dir: string): boolean {
  try {
    return statSync(join(dir, 'SKILL.md')).isFile();
  } catch {
    return false; // ENOENT, or a dangling symlink: either way it cannot register
  }
}

/**
 * Walk `<projectDir>/.claude/skills/` and report what can register and what cannot.
 * Deterministic, needs no Claude session — safe for CI.
 */
export function scanSkillsLayout(projectDir: string): StaticScan {
  const skillsRoot = join(resolve(projectDir), '.claude', 'skills');
  // `existsSync` also answers false for a DANGLING SYMLINK — that is a broken tree, not an absent
  // one, and must not scan as "clean" (QE2 #1). lstat distinguishes the two.
  let rootLink: ReturnType<typeof lstatSync> | null = null;
  try {
    rootLink = lstatSync(skillsRoot);
  } catch (error) {
    // Only ENOENT means "genuinely absent". ENOTDIR/EACCES mean the tree is BROKEN or unreadable —
    // reporting that as an empty-and-clean project is a route to a false PASS (QE3 #3).
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      return {
        skillsRoot, projectDir: resolve(projectDir), exists: true, registrable: [], findings: [], advisories: [], containers: [],
        scanError: `cannot stat ${skillsRoot}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    // ENOENT on .claude/skills can also mean .claude itself is a FILE or unreadable — check it.
    const claudeDir = join(resolve(projectDir), '.claude');
    try {
      const st = lstatSync(claudeDir);
      // A SYMLINK must be followed: a dangling `.claude` link is a broken tree, not an absent one.
      if (st.isSymbolicLink() && !existsSync(claudeDir)) {
        return {
          skillsRoot, projectDir: resolve(projectDir), exists: true, registrable: [], findings: [], advisories: [], containers: [],
          scanError: `${claudeDir} is a dangling symlink`,
        };
      }
      if (!st.isDirectory() && !st.isSymbolicLink()) {
        return {
          skillsRoot, projectDir: resolve(projectDir), exists: true, registrable: [], findings: [], advisories: [], containers: [],
          scanError: `${claudeDir} is not a directory`,
        };
      }
    } catch (claudeError) {
      const cCode = (claudeError as NodeJS.ErrnoException).code;
      if (cCode !== 'ENOENT') {
        return {
          skillsRoot, projectDir: resolve(projectDir), exists: true, registrable: [], findings: [], advisories: [], containers: [],
          scanError: `cannot stat ${claudeDir}: ${claudeError instanceof Error ? claudeError.message : String(claudeError)}`,
        };
      }
    }
    return { skillsRoot, projectDir: resolve(projectDir), exists: false, registrable: [], findings: [], advisories: [], containers: [] }; // genuinely absent
  }
  if (rootLink.isSymbolicLink() && !existsSync(skillsRoot)) {
    return {
      skillsRoot,
      projectDir: resolve(projectDir),
      exists: true,
      registrable: [],
      findings: [],
      advisories: [],
      containers: [],
      scanError: `${skillsRoot} is a dangling symlink`,
    };
  }

  // `.claude/skills` must BE a directory. A file there scans as "empty and clean" otherwise (QE #4).
  try {
    if (!statSync(skillsRoot).isDirectory()) {
      return { skillsRoot, projectDir: resolve(projectDir), exists: true, registrable: [], findings: [], advisories: [], containers: [], scanError: `${skillsRoot} is not a directory` };
    }
  } catch (error) {
    return {
      skillsRoot,
      projectDir: resolve(projectDir),
      exists: true,
      registrable: [],
      findings: [],
      advisories: [],
      containers: [],
      scanError: `cannot stat ${skillsRoot}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const registrable: string[] = [];
  const findings: SkillLayoutFinding[] = [];
  const advisories: SkillLayoutFinding[] = [];
  const containers: {
    dir: string;
    path: string;
    manifestName: string | null;
    candidates: string[];
    alsoBare: boolean;
  }[] = [];
  const scanErrors: string[] = [];

  let entries: string[] = [];
  try {
    entries = readdirSync(skillsRoot);
  } catch (error) {
    // An unreadable root is NOT an empty project — say so, so the verdict can be inconclusive.
    return {
      skillsRoot,
      projectDir: resolve(projectDir),
      exists: true,
      registrable: [],
      findings: [],
      advisories: [],
      containers: [],
      scanError: `cannot read ${skillsRoot}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  for (const name of entries) {
    if (name.startsWith('.')) continue; // hidden/backup dirs are not skills
    const dir = join(skillsRoot, name);
    let isDir = false;
    try {
      isDir = statSync(dir).isDirectory();
    } catch (error) {
      // An entry we cannot stat is unknown, not absent — record it so the verdict stays honest.
      scanErrors.push(`cannot stat ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    // A `SKILL.md` sitting directly in `.claude/skills/` registers nothing, whether it is a FILE or
    // a DIRECTORY — the directory form previously slipped into the ordinary branch (QE6 #6).
    if (name === 'SKILL.md') {
      findings.push({
        dir: '.',
        kind: 'no-skill-md',
        detail: 'SKILL.md sits directly in .claude/skills/ — a skill must live in its own directory to register',
      });
      continue;
    }
    if (!isDir) {
      if (name === 'SKILL.md') {
        findings.push({
          dir: '.',
          kind: 'no-skill-md',
          detail: 'SKILL.md sits directly in .claude/skills/ — a skill must live in its own directory to register',
        });
      }
      continue;
    }

    const registers = hasSkillFile(dir);
    // A manifest makes this a plugin CONTAINER even when it ALSO has a depth-1 SKILL.md — that is a
    // single-skill plugin, whose skills are namespaced, so expecting the bare name false-FAILs (QE5 #2).
    // It did not register in measured practice, but the class may be supported under workspace
    // trust — so the WHOLE container is advisory. Emitting the generic `no-skill-md` /
    // `buried-skill-md` findings for it killed the layout anyway, which was the over-claim (QE4 #1).
    const isPluginContainer = hasPluginManifest(dir);
    const bucket = isPluginContainer ? advisories : findings;

    if (registers && !isPluginContainer) {
      registrable.push(name);
    } else if (registers && isPluginContainer) {
      // A single-skill plugin: it has a depth-1 SKILL.md AND a manifest, so it registers NAMESPACED.
      // Expecting the bare directory name here was a false FAIL (QE5 #2); the container check below
      // accepts either form.
    } else {
      // A dir with no markdown was never meant to be a skill — advisory, not a failure (QE5 #7).
      const intended = looksLikeSkillDir(dir);
      (isPluginContainer || !intended ? advisories : findings).push({
        dir: name,
        kind: 'no-skill-md',
        detail: isPluginContainer
          ? `${name}/ is a plugin-shaped container (advisory): it has no depth-1 SKILL.md, so it registers only if the client loads it as a plugin`
          : intended
            ? `no SKILL.md at ${name}/SKILL.md — this directory cannot register`
            : `${name}/ holds no markdown (advisory): it looks like ordinary content, not a skill that failed to register`,
      });
    }

    // A plugin manifest under .claude/skills does NOT auto-register (plugins load from the
    // marketplace only). This is the exact false premise that shipped health-advisor 1.2.0.
    // Only a report when the dir registers NOTHING: a dir with its own depth-1 SKILL.md registers
    // fine and a stray manifest beside it is inert, not a blocker (Codex QE #8).
    if (isPluginContainer) {
      // What would this container provide? Names found on disk UNION names its manifest declares —
      // a manifest may point at a custom path deeper than the walk, which previously left the
      // container with zero candidates and let it slip through (QE5 #4).
      const inner: string[] = [];
      findBuriedSkillMd(dir, 1, inner, scanErrors);
      const manifest = readContainerManifest(dir);
      const candidates = [
        ...new Set([
          ...inner.map((f) => basename(join(f, '..'))),
          ...manifest.declared,
          ...(registers ? [manifest.name ?? name] : []), // the single-skill plugin's own skill (QE5 #2)
        ]),
      ];
      containers.push({
        dir: name,
        path: dir,
        manifestName: manifest.name,
        candidates,
        alsoBare: registers,
      });
      advisories.push({
        dir: name,
        kind: 'plugin-manifest-trap',
        detail: `${name}/.claude-plugin/plugin.json did not register in measured practice (advisory, not a failure) — a plugin normally loads from the marketplace; if you meant these to register, install it as a plugin or use bare skills`,
      });
    }

    // SKILL.md files buried too deep never register (health-advisor 1.2.0: extended/<name>/SKILL.md).
    //
    // FALSE-POSITIVE GUARD (found by dogfooding this gate on a healthy project): a dir that DOES
    // register may legitimately bundle nested SKILL.md files as its own resources — health-advisor
    // 1.2.1 co-locates its base deps under the master exactly so they do NOT register. Only a dir
    // that registers NOTHING while hiding SKILL.md files inside is the 1.2.0 defect shape.
    if (registers && !isPluginContainer) {
      const nested: string[] = [];
      findBuriedSkillMd(dir, 1, nested, scanErrors);
      if (nested.length > 0) {
        advisories.push({
          dir: name,
          kind: 'buried-skill-md',
          detail:
            `${name}/ bundles ${nested.length} nested SKILL.md file(s) as resources — they do NOT register ` +
            `(correct for co-located dependencies; a real skill placed there would be invisible)`,
        });
      }
    }

    if (!registers) {
      const buried: string[] = [];
      findBuriedSkillMd(dir, 1, buried, scanErrors);
      for (const path of buried) {
        bucket.push({
          dir: name,
          kind: 'buried-skill-md',
          detail: `${path.slice(skillsRoot.length + 1)} is 2+ levels deep in a directory that registers nothing — the loader scans one level, so it never registers`,
        });
      }
    }
  }

  return {
    skillsRoot,
    projectDir: resolve(projectDir),
    exists: true,
    registrable: registrable.sort(),
    findings,
    advisories,
    containers,
    ...(scanErrors.length ? { scanError: scanErrors.join('; ') } : {}),
  };
}

// ── Layer 2: the authoritative init-event listing ───────────────────

export interface InitPlugin {
  readonly name: string;
  readonly version?: string;
  /** Where the plugin was loaded FROM — the only identity that cannot be spoofed by a name (QE5 #1). */
  readonly path?: string;
  /** e.g. `telegram@claude-plugins-official`, `health-advisor@skills-dir`. */
  readonly source?: string;
}

export interface InitFacts {
  /** Registered skill names. `null` means the key was ABSENT (schema drift) — never "none". */
  readonly skills: readonly string[] | null;
  /**
   * Registered slash-command names, e.g. `loop-designer:init` (MEASURED on Claude Code 2.1.233: the
   * `system/init` event carries a `slash_commands` array, and a plugin command registers under
   * `<plugin>:<file basename>` — its frontmatter `name:` does NOT rename it).
   *
   * `null` means the key was ABSENT or not all strings — schema drift, never "no commands". A
   * plugin whose commands silently failed to load and a Claude Code build that stopped emitting the
   * key are indistinguishable from `[]`, so `[]` is never synthesised here.
   */
  readonly slashCommands: readonly string[] | null;
  readonly plugins: readonly InitPlugin[];
  /** False when the `plugins` key was absent or not an array — unreadable, not empty (QE6 #7). */
  readonly pluginsReadable: boolean;
  /** The project the session actually read — the built-in control. */
  readonly cwd: string | null;
  readonly clientVersion: string | null;
}

/**
 * Parse the `system/init` event out of a `--output-format stream-json` stream. PURE: takes the raw
 * text, returns facts, does no IO. Returns `null` when no init event is present (→ inconclusive).
 */
/**
 * The first init event's facts. Use ONLY for "has the event arrived yet?" during streaming —
 * `classifyRegistration` deliberately does NOT accept bare facts, because the count must travel
 * with them (a caller that forgot to pass `initEventCount` got a free PASS — QE2 #2).
 */
export function parseInitFacts(streamText: string): InitFacts | null {
  return parseAllInitFacts(streamText)[0] ?? null;
}



/**
 * Every `system/init` event in the stream. More than one means the observations may CONTRADICT each
 * other (Codex QE #7) — the classifier refuses to pick a winner and returns `inconclusive`.
 */
export function parseAllInitFacts(streamText: string): InitFacts[] {
  return parseStream(streamText).events;
}

/** What a stream actually contained — facts, cardinality AND parse integrity, produced together. */
export interface StreamParse {
  readonly events: InitFacts[];
  /** A line that LOOKED like a JSON object but did not parse — possibly a truncated init (QE3 #2). */
  readonly malformedObjectLines: number;
}

function parseStream(streamText: string): StreamParse {
  const found: InitFacts[] = [];
  let malformed = 0;
  for (const raw of streamText.split('\n')) {
    const line = raw.trim();
    if (!line || line[0] !== '{') continue;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // A truncated `{"type":"system","subtype":"init",…` silently disappeared here, so a
      // contradictory second event could be dropped and the first one believed (QE3 #2).
      malformed += 1;
      continue;
    }
    if (obj.type !== 'system' || obj.subtype !== 'init') continue;

    // The listing is authoritative or it is nothing: a partially-unparseable `skills` array (a
    // non-string element) must NOT be silently narrowed to the strings it happens to contain —
    // that turned an unreadable listing into a PASS (Codex QE #1). ABSENT key ≠ empty list (ADR SP-3).
    const rawSkills = obj.skills;
    const skills = Array.isArray(rawSkills)
      ? rawSkills.every((s) => typeof s === 'string')
        ? (rawSkills as string[])
        : null
      : null;

    // Same treatment as `skills`, for the same reason: an ABSENT key is unreadable schema, and a
    // partially-unparseable array must not be narrowed to the strings it happens to contain.
    const rawCommands = obj.slash_commands;
    const slashCommands = Array.isArray(rawCommands)
      ? rawCommands.every((s) => typeof s === 'string')
        ? (rawCommands as string[])
        : null
      : null;

    const rawPlugins = obj.plugins;
    // An ABSENT or non-array `plugins` key is unreadable schema, not proof that nothing loaded —
    // with containers present that difference decides FAIL vs INCONCLUSIVE (QE6 #7).
    const pluginsReadable = Array.isArray(rawPlugins);
    const plugins: InitPlugin[] = Array.isArray(rawPlugins)
      ? rawPlugins
          .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
          .map((p) => {
            const name = typeof p.name === 'string' ? p.name : '(unnamed)';
            // exactOptionalPropertyTypes: omit a field rather than set it to undefined.
            return {
              name,
              ...(typeof p.version === 'string' ? { version: p.version } : {}),
              ...(typeof p.path === 'string' ? { path: p.path } : {}),
              ...(typeof p.source === 'string' ? { source: p.source } : {}),
            };
          })
      : [];

    found.push({
      skills,
      slashCommands,
      plugins,
      pluginsReadable,
      // An empty or relative cwd testifies to nothing — `resolve("")` silently becomes the caller's
      // own cwd and can forge a match (Codex QE #6). Only an absolute path counts as evidence.
      cwd: typeof obj.cwd === 'string' && obj.cwd !== '' && isAbsolute(obj.cwd) ? obj.cwd : null,
      clientVersion: typeof obj.claude_code_version === 'string' ? obj.claude_code_version : null,
    });
  }
  return { events: found, malformedObjectLines: malformed };
}

// ── Verdict ─────────────────────────────────────────────────────────

export type RegistrationVerdict = 'pass' | 'fail' | 'inconclusive';

export interface RegistrationControls {
  /** Did the session read the target project? `null` when unknown (no init / no cwd). */
  readonly cwdMatched: boolean | null;
  /** Was the `skills` key present at all? A missing key is schema drift, not "nothing registered". */
  readonly skillsListPresent: boolean;
  /** Same question for `slash_commands`. `false` when absent/unreadable — never "no commands". */
  readonly commandsListPresent: boolean;
}

export interface RegistrationResult {
  readonly verdict: RegistrationVerdict;
  readonly reason: string;
  readonly expected: readonly string[];
  readonly missing: readonly string[];
  /** The `--expect-commands` set this verdict was measured against (empty when not asked). */
  readonly expectedCommands: readonly string[];
  /** Expected commands absent from the live `slash_commands` listing. */
  readonly missingCommands: readonly string[];
  readonly registeredCount: number | null;
  readonly clientVersion: string | null;
  readonly plugins: readonly InitPlugin[];
  readonly controls: RegistrationControls;
  readonly layout: readonly SkillLayoutFinding[];
  /** Reported, never fatal — see StaticScan.advisories. Rendering them is the policy (QE4 #5). */
  readonly advisories: readonly SkillLayoutFinding[];
}

/**
 * The complete evidence bundle. Every piece is REQUIRED and travels together: the previous shape let
 * a caller omit the scan error, the layout, the provenance check or the event count and get a free
 * PASS (Codex QE3 #1/#2/#4/#5). There is exactly one door into the verdict, and it is this one.
 */
export interface RegistrationEvidence {
  readonly projectDir: string;
  /** The WHOLE static scan (carries its own scanError + findings) — not hand-picked fields. */
  readonly scan: StaticScan;
  /** The probe outcome: either the raw stream, or the reason there is none. */
  readonly probe: { readonly ok: true; readonly stream: string } | { readonly ok: false; readonly error: string };
  /**
   * Did we actually look for same-named skills OUTSIDE this project, and what did we find?
   * `checked: false` ⇒ inconclusive: unperformed provenance discovery is not evidence of uniqueness.
   */
  readonly provenance: { readonly checked: boolean; readonly ambiguous: readonly string[] };
  /** Explicit `--expect` list; when absent the expectation is the scan's registrable set. */
  readonly expected?: readonly string[];
  /**
   * Explicit `--expect-commands` list, e.g. `loop-designer:init`. Absent/empty ⇒ commands are not
   * part of this vehicle's expectation (a bare skill has no commands BY DESIGN — ADR-003 D-2 — so
   * demanding them there would be a false FAIL, not a stronger gate).
   */
  readonly expectedCommands?: readonly string[];
}

export interface SkillsVerifyOptions {
  /** Must CANONICALISE (realpath) so symlinked project paths compare equal; may throw. */
  readonly resolvePath?: (p: string) => string;
}

/**
 * The single entry point. PURE apart from the injected resolver. Fail-closed by construction: `pass`
 * is reachable only from a completed scan, a probe that produced EXACTLY ONE well-formed init event
 * from THIS project, a fully-readable skills listing, a performed provenance check with no ambiguity,
 * and zero load-blocking layout findings.
 */
export function verifyRegistration(evidence: RegistrationEvidence, options: SkillsVerifyOptions = {}): RegistrationResult {
  // A JavaScript caller can hand us an incomplete object; a crash is not a verdict (QE4 #7).
  const bad = (reason: string): RegistrationResult => ({
    verdict: 'inconclusive',
    reason,
    expected: [],
    missing: [],
    expectedCommands: [],
    missingCommands: [],
    registeredCount: null,
    clientVersion: null,
    plugins: [],
    advisories: [],
    controls: { cwdMatched: null, skillsListPresent: false, commandsListPresent: false },
    layout: [],
  });
  if (!evidence || typeof evidence !== 'object') return bad('no evidence supplied');
  if (!evidence.scan || !evidence.probe || !evidence.provenance || typeof evidence.projectDir !== 'string') {
    return bad('incomplete evidence (scan, probe, provenance and projectDir are all required)');
  }
  // …and the scan must be SHAPED like a scan: a partial object crashed on `layout.length` (QE6 #8).
  const sc = evidence.scan as Partial<StaticScan>;
  if (!Array.isArray(sc.findings) || !Array.isArray(sc.registrable) || !Array.isArray(sc.advisories) || !Array.isArray(sc.containers)) {
    return bad('malformed scan (findings, registrable, advisories and containers must all be arrays)');
  }
  const { projectDir, scan, probe, provenance } = evidence;
  // The contract is CANONICAL identity: a lexical `resolve` alone reports a symlinked project as a
  // different one and turns a correct registration into `inconclusive` (QE4 #3).
  const resolvePath =
    options.resolvePath ??
    ((p: string) => {
      try {
        return realpathSync(p);
      } catch {
        return resolve(p);
      }
    });
  const expected = evidence.expected ?? scan.registrable;
  // Unlike `expected`, this has NO fallback to a discovered set: there is nothing on disk that
  // proves which command names a session should surface, and a guessed expectation is how a gate
  // starts passing for the wrong reason. Not asked ⇒ not checked, and the report says so.
  const expectedCommands = evidence.expectedCommands ?? [];
  const layout = scan.findings;

  const fail = (
    verdict: RegistrationVerdict,
    reason: string,
    extra: Partial<RegistrationResult> = {},
  ): RegistrationResult => ({
    expected,
    expectedCommands,
    missingCommands: [],
    layout,
    advisories: scan.advisories,
    plugins: [],
    clientVersion: null,
    missing: [],
    registeredCount: null,
    controls: { cwdMatched: null, skillsListPresent: false, commandsListPresent: false },
    ...extra,
    verdict,
    reason,
  });

  // 1. The scan must describe THIS project, and must have completed.
  let scanIsOurs: boolean;
  try {
    scanIsOurs = resolvePath(scan.projectDir) === resolvePath(projectDir);
  } catch {
    scanIsOurs = scan.projectDir === projectDir;
  }
  if (!scanIsOurs) {
    return fail('inconclusive', `the layout scan describes ${scan.projectDir}, not ${projectDir} — evidence from another project`);
  }
  if (scan.scanError !== undefined) return fail('inconclusive', `layout scan failed: ${scan.scanError}`);

  // 1b. A load-blocking layout finding is DETERMINISTIC evidence — it needs no session at all.
  //     Evaluating it only after the probe meant a definite failure degraded to `inconclusive`
  //     whenever `claude` was missing (Codex QE5 #5).
  if (layout.length > 0) {
    return fail('fail', `${layout.length} layout problem(s) can never register — proven from the layout alone`, {
      missing: [],
    });
  }

  // 2. The probe must have produced a stream.
  if (!probe.ok) return fail('inconclusive', `probe failed: ${probe.error}`);

  // 3. Parsing must be intact and the evidence must be singular.
  const parsed = parseStream(probe.stream);
  if (parsed.malformedObjectLines > 0) {
    return fail(
      'inconclusive',
      `${parsed.malformedObjectLines} malformed JSON line(s) in the stream — a truncated event may be hiding contradictory evidence`,
    );
  }
  if (parsed.events.length !== 1) {
    return fail(
      'inconclusive',
      parsed.events.length === 0
        ? 'no system/init event in the stream — could not observe registration'
        : `${parsed.events.length} init events in one stream — contradictory observations, refusing to pick one`,
    );
  }
  const facts = parsed.events[0]!;
  const withFacts = { plugins: facts.plugins, clientVersion: facts.clientVersion };

  // 4. The cwd control: the session must have read THIS project.
  if (facts.cwd === null) {
    return fail('inconclusive', 'init event carried no usable absolute cwd — cannot confirm the session read this project', withFacts);
  }
  let cwdMatched: boolean;
  try {
    cwdMatched = resolvePath(facts.cwd) === resolvePath(projectDir);
  } catch (error) {
    return fail(
      'inconclusive',
      `cannot resolve the paths to compare (${error instanceof Error ? error.message : String(error)}) — the cwd control could not run`,
      withFacts,
    );
  }
  if (!cwdMatched) {
    return fail('inconclusive', `session read ${facts.cwd}, not ${projectDir} — its listing does not describe this project`, {
      ...withFacts,
      registeredCount: facts.skills?.length ?? null,
      controls: { cwdMatched: false, skillsListPresent: facts.skills !== null, commandsListPresent: facts.slashCommands !== null },
    });
  }

  // 5. The listing must be readable in full.
  if (facts.skills === null) {
    return fail('inconclusive', 'the init listing has no readable `skills` array (absent or not all strings) — cannot read it', {
      ...withFacts,
      controls: { cwdMatched: true, skillsListPresent: false, commandsListPresent: facts.slashCommands !== null },
    });
  }

  // 5b. …and so must the COMMAND listing, whenever commands were expected. An absent
  //     `slash_commands` key is schema drift, exactly like an absent `skills` key: treating it as
  //     `[]` would report "your five commands did not register" on a Claude Code build that simply
  //     stopped emitting the key, and treating it as "fine" would pass a plugin whose commands
  //     really are missing. Neither is observable ⇒ inconclusive.
  if (expectedCommands.length > 0 && facts.slashCommands === null) {
    return fail(
      'inconclusive',
      'the init listing has no readable `slash_commands` array (absent or not all strings) — command registration cannot be observed',
      { ...withFacts, controls: { cwdMatched: true, skillsListPresent: true, commandsListPresent: false } },
    );
  }

  const controls: RegistrationControls = { cwdMatched: true, skillsListPresent: true, commandsListPresent: facts.slashCommands !== null };
  const registered = new Set(facts.skills);
  const missing = expected.filter((name) => !registered.has(name));
  const registeredCommands = new Set(facts.slashCommands ?? []);
  const missingCommands = expectedCommands.filter((name) => !registeredCommands.has(name));
  const common = { ...withFacts, expectedCommands, missingCommands, registeredCount: facts.skills.length, controls };

  // 6. Load-blocking layout problems fail on their own — one healthy skill must not mask them.
  if (layout.length > 0) {
    return {
      expected,
      layout,
      advisories: scan.advisories,
      ...common,
      missing,
      verdict: 'fail',
      reason:
        expected.length === 0
          ? `nothing can register: ${layout.length} layout problem(s) and no registrable skill directory`
          : `${layout.length} layout problem(s) can never register (alongside ${expected.length} expected skill(s))`,
    };
  }

  // 6b. A plugin-shaped container must be ATTRIBUTED, then its skills must actually be listed.
  //
  //     Identity is `path`/`source`, never the display name: matching by name both passed a broken
  //     container that shared a name with an unrelated marketplace plugin AND failed a correct
  //     container whose directory name differs from the name its manifest declares (Codex QE5 #1).
  //     And a loaded plugin is not proof its skills registered — a misconfigured skill can be absent
  //     from the authoritative listing while the plugin itself loads fine (QE5 #3).
  if (scan.containers.length > 0 && !facts.pluginsReadable) {
    return fail('inconclusive', 'the init event carried no readable `plugins` list — a container cannot be attributed', {
      ...common,
      missing,
    });
  }

  const containerProblems: string[] = [];
  const verifiedContainers: string[] = [];
  for (const c of scan.containers) {
    const loaded = facts.plugins.find((p) => {
      if (typeof p.path === 'string' && p.path) {
        try {
          if (resolvePath(p.path) === resolvePath(c.path)) return true; // strongest: same directory
        } catch {
          /* an unresolvable path is simply not a match */
        }
      }
      // A skills-directory plugin reports `<declared-name>@skills-dir`; fall back to that, then to
      // the declared name itself. The container's DIRECTORY name is never used as identity.
      if (c.manifestName) {
        if (p.source === `${c.manifestName}@skills-dir`) return true;
        if (p.name === c.manifestName && (p.source ?? '').endsWith('@skills-dir')) return true;
      }
      return false;
    });

    if (!loaded) {
      containerProblems.push(
        `${c.dir}/ declares a plugin${c.manifestName ? ` (${c.manifestName})` : ''} that did not load — ` +
          `${c.candidates.length} skill(s) inside would register nowhere`,
      );
      continue;
    }
    // It loaded. We deliberately DO NOT verify its individual skills here.
    //
    // Doing so requires reproducing Claude Code's command-name resolution: a plugin skill's
    // frontmatter `name` replaces the final command segment, and a manifest's `skills` field may be a
    // string or point at a directory of children. That contract is undocumented-to-us and moving, and
    // six review rounds showed every attempt to model it produced a NEW false verdict. A narrow
    // promise kept exactly beats a broad promise kept unreliably — so the gate reports the gap
    // instead of guessing (see the advisory below and the README).
    verifiedContainers.push(`${c.dir}/ → plugin "${loaded.name}" loaded`);
  }
  if (containerProblems.length > 0) {
    return {
      expected,
      layout,
      advisories: scan.advisories,
      ...common,
      missing,
      verdict: 'fail',
      reason: `${containerProblems.length} plugin container problem(s) — ${containerProblems.join('; ')}`,
    };
  }

  // 7. Provenance must have been CHECKED, and must be unambiguous.
  if (!provenance.checked) {
    return fail('inconclusive', 'provenance was not checked — a same-named skill outside this project would forge a pass', {
      ...common,
    });
  }
  const ambiguousExpected = expected.filter((name) => provenance.ambiguous.includes(name) && registered.has(name));
  if (ambiguousExpected.length > 0 && missing.length === 0) {
    return fail(
      'inconclusive',
      `${ambiguousExpected.length} expected name(s) also exist outside this project (${ambiguousExpected.join(', ')}) — ` +
        'the listing carries names, not provenance, so registration cannot be attributed to this project',
      { ...common },
    );
  }

  const containerAdvisories: SkillLayoutFinding[] = verifiedContainers.map((v) => ({
    dir: v.split('/')[0] ?? v,
    kind: 'plugin-manifest-trap' as const,
    detail: `${v} — its individual skills are NOT verified: a plugin skill's command name depends on frontmatter this gate does not model`,
  }));
  const allAdvisories = [...scan.advisories, ...containerAdvisories];

  if (missing.length > 0 || missingCommands.length > 0) {
    const parts: string[] = [];
    if (missing.length > 0) parts.push(`${missing.length} of ${expected.length} expected skill(s) did NOT register`);
    if (missingCommands.length > 0) {
      parts.push(`${missingCommands.length} of ${expectedCommands.length} expected command(s) did NOT register (${missingCommands.join(', ')})`);
    }
    return {
      expected,
      layout,
      advisories: allAdvisories,
      ...common,
      missing,
      verdict: 'fail',
      reason: parts.join('; '),
    };
  }

  return {
    expected,
    layout,
    advisories: allAdvisories,
    ...common,
    missing: [],
    verdict: 'pass',
    reason:
      expected.length === 0 && expectedCommands.length === 0
        ? 'nothing was expected to register; the session listing was read successfully'
        : `all ${expected.length} expected skill(s)` +
          (expectedCommands.length > 0 ? ` and all ${expectedCommands.length} expected command(s)` : '') +
          ' are registered',
  };
}

/** Exit code contract: pass=0, fail=1, inconclusive=2 (distinct so CI can treat it separately). */
export function registrationExitCode(verdict: RegistrationVerdict, strict = false): number {
  if (verdict === 'pass') return 0;
  if (verdict === 'fail') return 1;
  return strict ? 1 : 2;
}

const VERDICT_LABEL: Record<RegistrationVerdict, string> = {
  pass: 'PASS',
  fail: 'FAIL',
  inconclusive: 'INCONCLUSIVE',
};

export function renderRegistrationReport(result: RegistrationResult, scan?: StaticScan): string {
  const out: string[] = [];
  out.push(`dz skills-verify: ${VERDICT_LABEL[result.verdict]} — ${result.reason}`);

  if (scan) {
    out.push(
      `  layout: ${scan.registrable.length} registrable skill dir(s) under ${scan.skillsRoot}` +
        (scan.exists ? '' : ' (missing)'),
    );
  }
  if (result.registeredCount !== null) {
    out.push(
      `  session: ${result.registeredCount} skill(s) registered` +
        (result.clientVersion ? ` · client ${result.clientVersion}` : '') +
        (result.plugins.length ? ` · ${result.plugins.length} plugin(s) loaded` : ''),
    );
  }
  if (result.missing.length) {
    out.push('  MISSING (expected but not registered):');
    for (const name of result.missing) out.push(`    - ${name}`);
  }
  if (result.expectedCommands.length) {
    out.push(
      `  commands: ${result.expectedCommands.length} expected` +
        (result.controls.commandsListPresent ? '' : ' · slash_commands listing UNREADABLE'),
    );
    for (const name of result.missingCommands) out.push(`    - MISSING ${name}`);
  }
  if (result.layout.length) {
    out.push('  layout problems (these can never register):');
    for (const f of result.layout) out.push(`    [${f.kind}] ${f.detail}`);
  }
  if (result.advisories.length) {
    out.push('  advisories (reported, not failures):');
    for (const f of result.advisories) out.push(`    [${f.kind}] ${f.detail}`);
  }
  if (result.verdict === 'inconclusive') {
    out.push('  (inconclusive is never a pass — it means registration could not be observed honestly)');
  }
  return out.join('\n');
}

/**
 * The names a plugin's OWN manifest says its commands and skills should register under, so a
 * `--plugin-dir` gate run can default its expectation to the manifest instead of to a hand-typed
 * list that drifts from it.
 *
 * The naming rules are MEASURED, not assumed (Claude Code 2.1.233, fixture probe 2026-08-17):
 *   · a command registers as `<plugin>:<file basename without .md>` — its frontmatter `name:` does
 *     NOT rename it (a fixture declaring `name: renamed-second` registered as `probeplug:second`);
 *   · a skill registers as `<plugin>:<directory basename>` — likewise not its frontmatter name.
 *
 * Returns `null` when the manifest is missing/unreadable/nameless: an unreadable manifest must not
 * silently become an EMPTY expectation, which is the shape that passes without checking anything.
 */
export function declaredPluginSurface(pluginDir: string): { name: string; skills: string[]; commands: string[] } | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf8')) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = typeof obj.name === 'string' && obj.name ? obj.name : null;
  if (name === null) return null;
  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string') : [];
  const skills = list(obj.skills).map((rel) => `${name}:${basename(rel.replace(/\/+$/, ''))}`);
  const commands = list(obj.commands).map((rel) => `${name}:${basename(rel).replace(/\.md$/i, '')}`);
  return { name, skills, commands };
}

// ── The publish-time guard fact ─────────────────────────────────────

/**
 * Scan a PACKAGE directory for skill dirs that could never register.
 *
 * Discriminator (MEASURED before it was chosen — a naive "every dir needs SKILL.md" rule flagged ~40
 * healthy directories across 9 npx-toolkit packages, and a markdown-based one still flagged `docs/`):
 *   1. a package counts as a SKILL PACK only if it already has at least one `<dir>/SKILL.md`;
 *   2. inside it, a dir is broken only when a `SKILL.md` EXISTS somewhere inside but not at depth 1.
 * That second rule is unambiguous — the skill file is there, just where nothing will load it (exactly
 * health-advisor 1.2.0). A dir with no SKILL.md anywhere is ordinary content, not a failed skill.
 */
export function findNonRegistrableSkillDirs(packDir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(packDir);
  } catch {
    return [];
  }
  const dirs: string[] = [];
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    const full = join(packDir, name);
    try {
      if (statSync(full).isDirectory()) dirs.push(name);
    } catch {
      /* unreadable entries are not evidence of a defect */
    }
  }
  const isSkillPack = dirs.some((d) => hasSkillFile(join(packDir, d)));
  if (!isSkillPack) return [];
  return dirs
    .filter((d) => {
      const full = join(packDir, d);
      if (hasSkillFile(full)) return false; // registers fine
      const buried: string[] = [];
      findBuriedSkillMd(full, 1, buried, []);
      return buried.length > 0; // a SKILL.md exists, but nothing will load it from there
    })
    .sort();
}

// ── Layer 3 (ADVISORY): is the registered content model-ACTIONABLE? ─────────
//
// Registration is not usability. `dz skills-verify` proves a skill is in the session's listing —
// deterministically, from the init event. It cannot prove the skill's CONTENT is coherent enough for
// a model to act on: the health-advisor 1.2.1 verification needed a third manual step (invoke it, see
// that it loaded its own SKILL.md and knew its delegate). This layer automates that step.
//
// It is ADVISORY BY CONSTRUCTION and always will be: the answer comes from a model, so it can never
// fail a build or promote a verdict. Ported from rUv's `verify-harness-live.mjs` (ADR-044), whose
// doc-comment names the same gap: shape-valid ≠ model-actionable.

/** Build the content probe. Deliberately asks for EVIDENCE (a quoted heading), not a yes/no. */
export function buildContentProbePrompt(expected: readonly string[], sample = 6): string {
  const names = expected.slice(0, sample);
  return [
    'Diagnostic only — do NOT perform any task and do not ask questions.',
    `For each of these skills, say whether you can see it: ${names.join(', ')}.`,
    'Then pick ONE you can see, load it, and quote its first section heading VERBATIM.',
    'Answer as: SEEN: <comma-separated names> | QUOTE: <the heading>',
  ].join('\n');
}

export type ContentProbeVerdict = 'coherent' | 'partial' | 'unusable' | 'unreadable';

export interface ContentProbeResult {
  readonly verdict: ContentProbeVerdict;
  readonly seen: readonly string[];
  readonly missing: readonly string[];
  readonly quote: string | null;
  readonly note: string;
}

/**
 * Classify the probe answer. PURE. Never upgrades anything: the worst it says is "unusable", and even
 * that is reported, never enforced. An empty or unparseable answer is `unreadable`, NOT a pass —
 * the same fail-closed instinct as the deterministic layer, applied to a much weaker signal.
 */
export function classifyContentProbe(answer: unknown, expected: readonly string[]): ContentProbeResult {
  const text = typeof answer === 'string' ? answer.trim() : '';
  if (text === '') {
    return { verdict: 'unreadable', seen: [], missing: expected.slice(), quote: null, note: 'the probe returned nothing' };
  }
  const lower = text.toLowerCase();
  const seen = expected.filter((n) => lower.includes(n.toLowerCase()));
  const missing = expected.filter((n) => !seen.includes(n));
  const m = /quote:\s*(.+)/i.exec(text);
  const quote = m?.[1]?.trim() || null;

  if (seen.length === 0) {
    return { verdict: 'unusable', seen, missing, quote, note: 'the model named none of the expected skills' };
  }
  if (quote === null) {
    return {
      verdict: 'partial',
      seen,
      missing,
      quote,
      note: 'skills were named but nothing was quoted — naming a skill is not proof its content loaded',
    };
  }
  return {
    verdict: seen.length === expected.length ? 'coherent' : 'partial',
    seen,
    missing,
    quote,
    note:
      seen.length === expected.length
        ? 'every probed skill was named and one was quoted from its own content'
        : `${seen.length}/${expected.length} probed skills were named; one was quoted`,
  };
}

export function renderContentProbe(r: ContentProbeResult): string {
  const out = [`  content probe (ADVISORY, model-mediated — never a gate): ${r.verdict} — ${r.note}`];
  if (r.quote) out.push(`    quoted: "${r.quote.slice(0, 100)}"`);
  if (r.missing.length) out.push(`    not named: ${r.missing.join(', ')}`);
  return out.join('\n');
}
