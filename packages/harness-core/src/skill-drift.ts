/**
 * Intra-monorepo skill-drift guard.
 *
 * The same skill is physically duplicated across many monorepo packages
 * (`packages/@dzhechkov/*​/<skill>/` + `.claude/skills/<skill>/`). A fix applied to ONE copy
 * silently leaves the others broken — this is exactly how a CRITICAL `goap-research-ed25519`
 * self-signed-forgery exploit shipped in 10 of 12 copies, and how a `brutal-honesty-review`
 * `set -e` crash reached the PUBLISHED `@dzhechkov/skills-qe`. Both were found only by accident.
 *
 * `dz sync-upstream` only checks against EXTERNAL repos and is structurally blind to this class of
 * drift. This module is the intra-monorepo complement:
 *
 *   • `sweepSkillDrift(root)`        — detector: which shared skills byte-differ between copies.
 *   • `syncCanonicalSkill(root, s)`  — healer: overwrite every copy from `skills-meta/<skill>`.
 *
 * Both are PURE functions that return plain data — no printing, no `process.exit`, no throwing on
 * the "canonical missing" / "drift found" business cases. The CLI layer owns exit codes and I/O.
 * Dependency-free: `node:fs` / `node:path` / `node:crypto` only.
 *
 * @packageDocumentation
 */

import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, resolve, dirname, basename, sep } from 'node:path';
import { createHash } from 'node:crypto';

import { DEV_SKILL_ROOT, SKILL_INSTALL_ROOTS, TARGET_ENRICHMENT_ASSETS } from './skill-install-roots.js';

/** One shared skill whose copies byte-differ (`driftFiles > 0`). */
export interface DriftedSkill {
  /** Skill dir basename (e.g. `goap-research-ed25519`). */
  readonly name: string;
  /** How many locations hold this skill. */
  readonly copies: number;
  /** # relative paths where the copies disagree (≥1 ⇒ drift). */
  readonly driftFiles: number;
  /** Size of the union of relative file paths across all copies. */
  readonly totalFiles: number;
  /** # (copy × relative-path) pairs where the file is absent from a copy. */
  readonly missingFiles: number;
  /** Absolute paths of every copy — lets a human / `--json` consumer jump to the drifted dirs. */
  readonly locations: readonly string[];
}

/** Options for {@link sweepSkillDrift}. */
export interface SweepOptions {
  /**
   * Which copies to compare.
   * - `'packages'` (the CI-gate default): PUBLISHED package copies only (`packages/`). The dogfood
   *   `.claude/skills/<skill>` dev copies are excluded — the repo's own `dz sync` test treats them as
   *   "legitimately lagging" the published version, so counting them makes the gate red-on-arrival.
   *   The dangerous drift (goap, brutal-honesty) was always between PUBLISHED packages.
   * - `'installs'` (what the `no-skill-drift` HARD rule uses): packages + every per-target install
   *   root EXCEPT {@link DEV_SKILL_ROOT}. Machine-generated installs have no licence to lag, so
   *   holding them to byte-identity is a gate that can actually be satisfied — unlike `'all'`,
   *   which includes the hand-edited dev tree and is therefore red-on-arrival as a gate.
   * - `'all'`: packages + EVERY per-target skills install root ({@link SKILL_INSTALL_ROOTS}) — the
   *   raw sweep the audit script does. A root that is absent, or present without a `SKILL.md`,
   *   contributes nothing, so this is inert for a repo that installs only one target.
   */
  readonly scope?: 'packages' | 'installs' | 'all';
  /** Skill basenames whose drift is ACCEPTED (documented intentional forks) — reported separately, never counted as gate drift. */
  readonly allowlist?: readonly string[];
}

/** Result of a read-only intra-monorepo drift sweep. */
export interface SweepResult {
  /** # skills present in ≥2 locations (within scope). */
  readonly duplicated: number;
  /** Skills that byte-differ AND are not allowlisted, sorted by `driftFiles` desc — the gate keys on this. */
  readonly drifted: readonly DriftedSkill[];
  /** Skills that byte-differ but are allowlisted (intentional) — surfaced for transparency, not gated. */
  readonly allowlisted: readonly DriftedSkill[];
}

/**
 * How the canonical was resolved for a {@link syncCanonicalSkill} run.
 * - `from`        — an explicit `--from <dir>` was supplied.
 * - `skills-meta` — no `--from`; `skills-meta/<skill>` exists and was used.
 * - `auto`        — no explicit canonical; the WRITE path auto-detected the most-complete copy
 *                   (opt-in `--auto` ONLY — never a bare default).
 * - `none`        — no canonical could be resolved. `--check` still runs a canonical-free peer
 *                   comparison; a bare write refuses (safe-by-default).
 */
export type CanonicalSource = 'from' | 'skills-meta' | 'auto' | 'none';

/** Options for {@link syncCanonicalSkill}. */
export interface SyncCanonicalOptions {
  /** Report drift only, write NOTHING (CI mode). */
  readonly check?: boolean;
  /** Override the canonical source dir (default: `skills-meta/<skill>`). */
  readonly from?: string;
  /**
   * Opt-in for the WRITE path ONLY: when no `--from`/`skills-meta` canonical exists, auto-detect the
   * most-complete copy as canonical instead of refusing. A HEURISTIC — the CLI prints a loud warning
   * naming the pick + the exact overwrite list. Never affects the read-only `check` path.
   */
  readonly auto?: boolean;
}

/** Result of a canonical-wins sync (or a `check:true` dry-run / canonical-free peer check). */
export interface SyncResult {
  /** Resolved canonical dir (abs). Empty `''` in canonical-free peer / refuse modes. */
  readonly canonical: string;
  /** Whether a canonical source dir was resolved. `false` ⇒ `resolvedFrom === 'none'`. */
  readonly canonicalExists: boolean;
  /** How the canonical resolved: `from` | `skills-meta` | `auto` | `none`. */
  readonly resolvedFrom: CanonicalSource;
  /** # copies compared — non-canonical copies in resolved modes; ALL peers in canonical-free mode. */
  readonly copies: number;
  /** # copies overwritten (0 when `check:true`, in peer mode, or when a bare write refuses). */
  readonly synced: number;
  /** # copies/files that differ (from canonical in resolved modes; between peers in canonical-free mode). */
  readonly drifted: number;
  /** Abs paths of copies written (empty when `check:true` / peer / refuse — proves no writes). */
  readonly wrote: readonly string[];
}

const SKILL_MANIFEST = 'SKILL.md';
const IGNORED_ENTRIES = new Set(['node_modules', '__pycache__', '.DS_Store', 'run-history.json']);

/** md5 of a file's bytes (identical to both prototype scripts ⇒ identical drift verdicts). */
function md5(path: string): string {
  return createHash('md5').update(readFileSync(path)).digest('hex');
}

/** Recursive file list under `dir`; skips `node_modules` / `__pycache__` / `.DS_Store`. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (IGNORED_ENTRIES.has(entry)) continue;
    const p = join(dir, entry);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * Byte-compare a set of skill copies against EACH OTHER (canonical-free). Builds the union of
 * relative file paths across every copy, hashes each `(copy × rel)`, and counts how many relative
 * paths disagree (`driftFiles`) and how many `(copy × rel)` pairs are absent from a copy
 * (`missingFiles`). `driftFiles > 0` ⇔ the copies are NOT byte-identical to one another.
 *
 * This is the exact per-skill comparison {@link sweepSkillDrift} performs; it is extracted verbatim
 * so BOTH the CI sweep AND the canonical-free `sync-canonical --check` share one implementation and
 * yield the same verdict. Behavior-preserving refactor — no numbers change.
 */
/**
 * Is this skill-dir-relative path a TARGET ENRICHMENT asset ({@link TARGET_ENRICHMENT_ASSETS})?
 *
 * Such a file exists in ONE copy by design — `dz init --enrich` writes it into the install tree and
 * the canonical never has it. Counting it as drift makes the gate unsatisfiable; removing it during
 * a heal destroys valid output. Compared with POSIX separators so a Windows `relative()` still matches.
 */
function isEnrichmentAsset(rel: string, copyDir: string): boolean {
  const owner = TARGET_ENRICHMENT_ASSETS[rel.split(sep).join('/')];
  if (owner === undefined) return false;
  // The exemption is only valid inside the root that OWNS the asset. Elsewhere the same filename is
  // a misplaced extra file, and waving it through would make the sweep report clean while the healer
  // preserved it. ANCHORED at the skill dir, not searched across the whole absolute path: a repo that
  // itself lives under a directory containing `/.agents/skills/` would otherwise have every copy in
  // it — packages included — classified as codex-owned (cross-family review, 2026-08-25).
  const posix = copyDir.split(sep).join('/');
  return posix.endsWith('/' + owner + '/' + posix.split('/').slice(-1)[0]);
}

/**
 * The canonical's own file list, with every enrichment-asset NAME removed regardless of where the
 * canonical came from. A canonical picked by `--auto` (or handed in with `--from`) can itself be an
 * enriched install copy; propagating its target-specific metadata into the package and other target
 * copies is never correct, and the exemption above would then stop it ever being cleaned up.
 */
function withoutEnrichmentNames(rels: readonly string[]): string[] {
  return rels.filter((r) => TARGET_ENRICHMENT_ASSETS[r.split(sep).join('/')] === undefined);
}

function comparePeers(copies: readonly string[]): { driftFiles: number; missingFiles: number; totalFiles: number } {
  const relFiles = new Set<string>();
  for (const c of copies) for (const f of walk(c)) {
    const rel = relative(c, f);
    if (isEnrichmentAsset(rel, c)) continue;
    relFiles.add(rel);
  }

  let driftFiles = 0;
  let missingFiles = 0;
  for (const rel of relFiles) {
    const hashes = new Set<string>();
    for (const c of copies) {
      const p = join(c, rel);
      if (existsSync(p)) hashes.add(md5(p));
      else {
        missingFiles++;
        hashes.add('__MISSING__');
      }
    }
    if (hashes.size > 1) driftFiles++;
  }
  return { driftFiles, missingFiles, totalFiles: relFiles.size };
}

/**
 * Deterministic auto-pick of a canonical from a set of copies: the copy with the MOST files wins,
 * tie-broken lexicographically on sorted path (so the same drift always auto-picks the same
 * canonical, across runs and machines). "Most complete" is a HEURISTIC, not a correctness oracle —
 * hence it is only ever reached behind an explicit `--auto` opt-in plus a loud warning.
 */
function pickMostComplete(copies: readonly string[]): string {
  // Enrichment assets do not make a copy more COMPLETE — they make it a target install. Counting
  // them would let an enriched copy win the heuristic on files no other copy is supposed to have.
  const size = (d: string): number => withoutEnrichmentNames(walk(d).map((p) => relative(d, p))).length;
  return [...copies].sort().reduce((best, c) => (size(c) > size(best) ? c : best));
}

/**
 * Resolve WHICH dir is canonical for a sync/check run, and HOW it resolved. Precedence is identical
 * for read and write paths:
 *   1. `opts.from`            → `'from'`
 *   2. `skills-meta/<skill>`  → `'skills-meta'`
 *   3. `opts.auto` (write)    → `'auto'` (most-complete copy)
 *   4. otherwise              → `'none'` (no canonical — `--check` compares copies to each other;
 *                               a bare write refuses)
 */
function resolveCanonical(
  root: string,
  skill: string,
  copies: readonly string[],
  opts: SyncCanonicalOptions,
): { canonical: string | null; resolvedFrom: CanonicalSource } {
  if (opts.from !== undefined) return { canonical: resolve(opts.from), resolvedFrom: 'from' };
  const meta = join(root, 'packages/@dzhechkov/skills-meta', skill);
  if (existsSync(meta)) return { canonical: meta, resolvedFrom: 'skills-meta' };
  if (opts.auto === true && copies.length >= 1) return { canonical: pickMostComplete(copies), resolvedFrom: 'auto' };
  return { canonical: null, resolvedFrom: 'none' };
}

/**
 * Every skill dir (a dir containing `SKILL.md`) under `packages/` + every per-target install root
 * in {@link SKILL_INSTALL_ROOTS}, excluding `node_modules` / `__pycache__`. Originally ported from
 * `scripts/drift-sweep-skills.mjs`, which searched `.claude/skills` alone — see ADR-001
 * (skill-copy-discovery) for why one hardcoded root let the Codex install drift unseen.
 */
function findSkillDirs(root: string, scope: 'packages' | 'installs' | 'all' = 'all'): string[] {
  const dirs: string[] = [];
  // Roots are ANCHORED at the repo root — never a recursive search for `*/skills`. A stale agent
  // worktree under `.claude/worktrees/<id>/` holds a full second copy of `packages/`,
  // `.claude/skills` AND `.agents/skills`; a recursive sweep would report every skill in the repo
  // as drifting against a checkout nobody maintains, and the healer would be entitled to WRITE
  // into it (ADR-001, Option C rejected on exactly this measurement).
  const installRoots = scope === 'installs'
    ? SKILL_INSTALL_ROOTS.filter((r) => r !== DEV_SKILL_ROOT)
    : SKILL_INSTALL_ROOTS;
  const roots = scope === 'packages'
    ? [join(root, 'packages')]
    : [join(root, 'packages'), ...installRoots.map((r) => join(root, ...r.split('/')))];
  const stack = roots.filter((p) => existsSync(p));
  while (stack.length) {
    const d = stack.pop() as string;
    let entries: string[];
    try {
      entries = readdirSync(d);
    } catch {
      continue;
    }
    // Drift-guard scope = SKILL.md-bearing dirs ONLY. `templates/docs/<name>/` mirrors carry
    // skill-shaped NAMES but are rendered/derived documentation (no SKILL.md) and are therefore
    // intentionally excluded — they are not skill definitions, so there is nothing to keep in sync.
    // (Verified: no `packages/**/templates/docs/**` dir carries a SKILL.md. See ADR-001, D1.)
    if (entries.includes(SKILL_MANIFEST)) dirs.push(d);
    for (const e of entries) {
      if (IGNORED_ENTRIES.has(e)) continue;
      const p = join(d, e);
      try {
        if (statSync(p).isDirectory()) stack.push(p);
      } catch {
        /* skip unreadable entries */
      }
    }
  }
  return dirs;
}

/**
 * Detect intra-monorepo skill drift: find every skill duplicated across ≥2 locations and report
 * which copies byte-differ. Pure port of `scripts/drift-sweep-skills.mjs`.
 *
 * `result.drifted.length === 0` is the exact condition the CI gate keys on.
 */
export function sweepSkillDrift(root: string, opts: SweepOptions = {}): SweepResult {
  const scope = opts.scope ?? 'all';
  const allow = new Set(opts.allowlist ?? []);

  // Group skill dirs by basename → Map<name, locations[]>.
  const byName = new Map<string, string[]>();
  for (const d of findSkillDirs(root, scope)) {
    const name = basename(d);
    const list = byName.get(name);
    if (list) list.push(d);
    else byName.set(name, [d]);
  }

  let duplicated = 0;
  const drifted: DriftedSkill[] = [];
  const allowlisted: DriftedSkill[] = [];

  for (const [name, unsorted] of [...byName.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    if (unsorted.length < 2) continue;
    duplicated++;
    const copies = [...unsorted].sort();

    // Per-skill byte-comparison of every copy against each other (extracted to `comparePeers`
    // so the canonical-free `sync-canonical --check` reuses the EXACT same logic).
    const { driftFiles, missingFiles, totalFiles } = comparePeers(copies);

    if (driftFiles > 0) {
      const entry: DriftedSkill = {
        name,
        copies: copies.length,
        driftFiles,
        totalFiles,
        missingFiles,
        locations: copies,
      };
      (allow.has(name) ? allowlisted : drifted).push(entry);
    }
  }

  const byDrift = (a: DriftedSkill, b: DriftedSkill): number => b.driftFiles - a.driftFiles;
  drifted.sort(byDrift);
  allowlisted.sort(byDrift);
  return { duplicated, drifted, allowlisted };
}

/**
 * Heal one skill: treat the resolved canonical (`--from` → `skills-meta/<skill>` → `--auto`
 * most-complete copy) as authoritative and overwrite every other copy in the monorepo, proving
 * byte-identity. Pure port of `scripts/sync-canonical-skill.mjs`, extended with a canonical-free path.
 *
 * `check:true` writes NOTHING (`wrote` stays empty) and only reports the drift count.
 * Default overwrites drifting copies; a subsequent {@link sweepSkillDrift} then reports 0 drift.
 *
 * When NO canonical resolves (`resolvedFrom === 'none'` — no `--from`, no `skills-meta`, no `--auto`):
 *   • `check:true` → CANONICAL-FREE peer check: `drifted` = # files that differ ACROSS the copies
 *     (byte-identical copies ⇒ `drifted === 0`). Reuses {@link comparePeers} — the exact sweep logic.
 *   • write (bare) → REFUSES: returns `wrote:[]`, `synced:0`, mutates NOTHING. Safe-by-default: the
 *     tool never guesses a canonical for a write, because a wrong pick destroys the good copy. The
 *     operator must pass `--from`, run `--check`, or opt in to `--auto` (which the CLI announces).
 *
 * This function never throws / never `process.exit`s — the CLI owns exit codes, printing, and the
 * loud `--auto` warning.
 */
export function syncCanonicalSkill(root: string, skill: string, opts: SyncCanonicalOptions = {}): SyncResult {
  const check = opts.check === true;

  // The healer/checker operates on EXACTLY what the detector sees (same roots via findSkillDirs) —
  // otherwise a copy could be silently healed but never gated, or vice-versa.
  const allCopies = findSkillDirs(root, 'all')
    .filter((d) => basename(d) === skill)
    .sort();

  const { canonical, resolvedFrom } = resolveCanonical(root, skill, allCopies, opts);

  // No canonical resolved → asymmetric read/write handling (ADR-001 D3/D4).
  if (canonical === null) {
    if (check) {
      // CANONICAL-FREE peer check: are the copies byte-identical to EACH OTHER? (<2 ⇒ vacuously so.)
      const drifted = allCopies.length < 2 ? 0 : comparePeers(allCopies).driftFiles;
      return { canonical: '', canonicalExists: false, resolvedFrom, copies: allCopies.length, synced: 0, drifted, wrote: [] };
    }
    // Bare WRITE with no resolvable canonical → REFUSE. Mutates nothing (`wrote:[]` proves it).
    return { canonical: '', canonicalExists: false, resolvedFrom, copies: allCopies.length, synced: 0, drifted: 0, wrote: [] };
  }

  const canonFiles = withoutEnrichmentNames(walk(canonical).map((p) => relative(canonical, p))).sort();

  // Every <skill>/ dir except the canonical itself.
  const copies = allCopies.filter((d) => relative(canonical, d) !== '');

  let drifted = 0;
  let synced = 0;
  const wrote: string[] = [];

  for (const copy of copies) {
    // Target ENRICHMENT assets are excluded from the copy's file set entirely: they exist in the
    // install tree by design, the canonical never has them, and both the drift verdict and the
    // removal pass below must leave them alone.
    const copyFiles = new Set(walk(copy).map((p) => relative(copy, p)).filter((f) => !isEnrichmentAsset(f, copy)));
    let differs = false;
    // Extra files in the copy not present in canonical ⇒ drift.
    for (const f of copyFiles) if (!canonFiles.includes(f)) differs = true;
    for (const f of canonFiles) {
      const src = join(canonical, f);
      const dst = join(copy, f);
      if (!existsSync(dst) || md5(src) !== md5(dst)) differs = true;
    }
    if (!differs) continue;
    drifted++;

    if (check) continue; // report only — write NOTHING

    // Overwrite: remove extra files, then copy every canonical file byte-for-byte.
    for (const f of copyFiles) if (!canonFiles.includes(f)) rmSync(join(copy, f));
    for (const f of canonFiles) {
      const src = join(canonical, f);
      const dst = join(copy, f);
      mkdirSync(dirname(dst), { recursive: true });
      writeFileSync(dst, readFileSync(src));
    }
    synced++;
    wrote.push(copy);
  }

  return { canonical, canonicalExists: true, resolvedFrom, copies: copies.length, synced, drifted, wrote };
}
