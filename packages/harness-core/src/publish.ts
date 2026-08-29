/**
 * Automated publish — discovers changed packages, bumps patch versions,
 * builds, and publishes to npm.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join as pathJoin, relative as pathRelative, resolve as pathResolve } from 'node:path';

import { decidePublishSigning, decidePostSigningVerification } from './publish-signing.js';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

import { claimCheck } from './claim-check.js';

/** Result for a single package publish attempt. */
export interface PublishResult {
  readonly name: string;
  readonly oldVersion: string;
  readonly newVersion: string;
  readonly status: 'published' | 'skipped' | 'error';
  readonly error?: string | undefined;
  /**
   * Pre-publish claim-check summary for this package's README, present only when the
   * opt-in `claimCheck` gate ran (`'warn'`/`'block'`). Additive: absent by default so an
   * unmodified `publishPackages` call is byte-compatible with pre-gate behavior.
   */
  readonly claimCheck?: { readonly findings: number; readonly high: number } | undefined;
}

/** Full publish report. */
export interface PublishReport {
  readonly packages: readonly PublishResult[];
  readonly published: number;
  readonly skipped: number;
  readonly errors: number;
  readonly dryRun: boolean;
}

/** Is `p` inside `dir`? Used to refuse a signing key that lives in the repository working tree. */
function isInsideDir(p: string, dir: string): boolean {
  const rel = pathRelative(pathResolve(dir), pathResolve(p));
  return rel !== '' && !rel.startsWith('..') && !pathResolve(p).startsWith('..');
}

/** Bump patch version: 0.3.11 → 0.3.12 */
export function bumpPatch(version: string): string {
  // Parse the core x.y.z, tolerating a 2-part "x.y" (treated as x.y.0) and a
  // prerelease/build suffix (e.g. "1.2.3-beta.2"). A prerelease bumps to its
  // release (x.y.z), which semver-orders ABOVE the prerelease — never below it,
  // and never silently drops to a lower number (audit #12).
  const core = (version.split('+')[0] ?? version).split('-');
  const hasPrerelease = core.length > 1;
  const nums = (core[0] ?? '').split('.');
  const major = parseInt(nums[0] ?? '0', 10) || 0;
  const minor = parseInt(nums[1] ?? '0', 10) || 0;
  const patch = parseInt(nums[2] ?? '0', 10) || 0;
  // Releasing a prerelease keeps the same x.y.z (it outranks the prerelease);
  // a normal release bumps the patch.
  return hasPrerelease ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
}

/** Compare two x.y.z(-pre) versions by their core triple: >0 if a>b, <0 if a<b. */
export function compareVersions(a: string, b: string): number {
  const core = (v: string): number[] => ((v.split('+')[0] ?? v).split('-')[0] ?? '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a0 = 0, a1 = 0, a2 = 0] = core(a);
  const [b0 = 0, b1 = 0, b2 = 0] = core(b);
  return a0 - b0 || a1 - b1 || a2 - b2;
}

/**
 * The version already published to npm for `name`, or `undefined` if the package
 * has never been published (or npm is unreachable). Used to bump from
 * max(local, published) so a locally-reverted version can't collide (audit #10).
 */
function publishedVersion(name: string): string | undefined {
  try {
    const out = execSync(`npm view ${name} version`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8', timeout: 20000 }).trim();
    return /^\d+\.\d+\.\d+/.test(out) ? out : undefined;
  } catch {
    return undefined; // 404 (never published) or offline → fall back to local
  }
}

/** The higher of the local version and the npm-published version (audit #10). */
function maxPublished(name: string, localVersion: string): string {
  const pub = publishedVersion(name);
  return pub !== undefined && compareVersions(pub, localVersion) > 0 ? pub : localVersion;
}

// ── workspace-floor preflight (feature workspace-dep-protocol, Codex P1) ─────
//
// Sibling deps are declared `workspace:^`, and pnpm rewrites them at pack time to `^<the sibling's
// DISK version>`. That version is not necessarily PUBLISHED: `--bump-only` stages versions on disk,
// and a later `--filter`ed publish of just the dependent would ship a floor nobody can install —
// the publish itself succeeds, and every consumer `npm install` then fails with ETARGET. Staged is
// not shipped; this preflight makes the difference a refusal instead of a broken release.

/**
 * Pure half: which `workspace:`-declared deps of a package would pack to a floor that is neither
 * being published in this batch nor already on the registry?
 *
 * Fail-closed by design: a probe that cannot answer (offline, 404) reports the floor as
 * unpublished — a publish needs the network anyway, and refusing beats shipping ETARGET.
 */
export function findUnpublishedWorkspaceFloors(opts: {
  readonly dependencies: Record<string, string> | undefined;
  /** pnpm rewrites `workspace:` in peerDependencies at pack time too (Codex P2) — same hazard. */
  readonly peerDependencies?: Record<string, string> | undefined;
  /** name → version on DISK, for every package in the workspace (what pnpm packs the floor from). */
  readonly workspaceVersions: ReadonlyMap<string, string>;
  /**
   * Names whose publish has LANDED (or, in a dry-run preview, would land) BEFORE this package.
   * Static batch membership is not enough (Codex P1): a sibling that failed its own gates earlier
   * in the batch has no published floor, and its dependents must fall through to the probe.
   */
  readonly batch: ReadonlySet<string>;
  readonly probe: (name: string, version: string) => boolean;
}): { name: string; version: string }[] {
  const missing: { name: string; version: string }[] = [];
  const seen = new Set<string>();
  // Sections are inspected INDEPENDENTLY, never object-merged: a plain peer range for the same
  // sibling would overwrite a `workspace:^` dependency entry in a spread, and pnpm still rewrites
  // the dependency section — the protocol in EITHER section makes the floor pack from disk.
  const entries = [...Object.entries(opts.dependencies ?? {}), ...Object.entries(opts.peerDependencies ?? {})];
  for (const [dep, spec] of entries) {
    if (!String(spec).startsWith('workspace:')) continue;
    if (seen.has(dep)) continue;
    seen.add(dep);
    if (opts.batch.has(dep)) continue; // publishes before this package (deps-first order)
    const version = opts.workspaceVersions.get(dep);
    if (version === undefined) {
      // A workspace: spec naming a package that is not in the workspace — pnpm pack would die on
      // it anyway, but die HERE with a name, not mid-batch.
      missing.push({ name: dep, version: '(not in workspace)' });
      continue;
    }
    if (!opts.probe(dep, version)) missing.push({ name: dep, version });
  }
  return missing;
}

/** Registry probe: is exactly `name@version` published? Empty output / 404 / offline ⇒ no. */
function versionPublished(name: string, version: string): boolean {
  try {
    const out = execSync(`npm view ${name}@${version} version`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf-8', timeout: 20000 }).trim();
    return out === version;
  } catch {
    return false;
  }
}

/**
 * `execSync` throws an Error whose `.message` is only `Command failed: <cmd>` — the child's real output
 * (the `npm ERR!` lines that say WHY a publish failed) sits on `.stdout` / `.stderr` and was being
 * dropped, so a failed release read as an undiagnosable dead end (observed: a provenance publish failed
 * in CI with nothing but "Command failed"). Fold the captured output into the reported error.
 */
export function formatPublishError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as Error & { stdout?: unknown; stderr?: unknown };
  const captured = [e.stdout, e.stderr]
    .map((x) => (x == null ? '' : String(x).trim()))
    .filter(Boolean)
    .join('\n');
  return captured ? `${e.message}\n${captured}` : e.message;
}


// ── npm provenance (ADR-001, publish-provenance) ────────────────────────────
//
// Provenance is minted from a GitHub OIDC token during the publish job. There is no private key for us
// to hold, leak, or rotate. It COMPLEMENTS the Ed25519 pack signature rather than superseding it: the
// key was generated on 2026-07-19 and the packs carry `.dz-manifest.json`, which is why publish must
// re-sign after its own bump (feature `sign-after-bump`).
// It can only be produced where a token can be minted, so the DECISION belongs to the environment, and
// the decision is a pure function whose output is the exact argv a test can assert.

export type ProvenanceMode = 'auto' | 'on' | 'off';

/**
 * The facts that mean an OIDC token can actually be minted.
 *
 * Cross-model review (codex exec, 2026-07-10): GitHub sets BOTH `ACTIONS_ID_TOKEN_REQUEST_URL` and
 * `ACTIONS_ID_TOKEN_REQUEST_TOKEN` when `permissions: id-token: write` is granted. Checking only the
 * URL would pass `--provenance` in a job where minting then fails.
 *
 * Honest limit: presence is not proof that a token can be minted (a stale or unreachable URL still
 * looks capable). npm fails loudly in that case; this guard only prevents the failure we can foresee.
 */
export function environmentCanMintProvenance(env: NodeJS.ProcessEnv): boolean {
  const nonEmpty = (v: string | undefined): boolean => typeof v === 'string' && v.length > 0;
  return (
    env.GITHUB_ACTIONS === 'true' &&
    nonEmpty(env.ACTIONS_ID_TOKEN_REQUEST_URL) &&
    nonEmpty(env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
  );
}

export interface ProvenanceDecision {
  readonly useProvenance: boolean;
  readonly reason: string;
}

/**
 * `on` in an environment that cannot mint a token is an ERROR, not a downgrade: failing before the batch
 * starts beats failing halfway through 45 packages.
 *
 * `off` is an escape hatch for a registry outage, and it says so out loud — a safety check the caller can
 * quietly narrow is not a safety check.
 */
export function decideProvenance(mode: ProvenanceMode, env: NodeJS.ProcessEnv): ProvenanceDecision {
  const capable = environmentCanMintProvenance(env);
  if (mode === 'off') {
    return { useProvenance: false, reason: 'provenance disabled explicitly (--no-provenance)' };
  }
  if (mode === 'on') {
    if (!capable) {
      throw new Error(
        'dz publish: --provenance requires GITHUB_ACTIONS=true and ACTIONS_ID_TOKEN_REQUEST_URL ' +
          '(an OIDC token cannot be minted here) — refusing to start the batch',
      );
    }
    return { useProvenance: true, reason: 'provenance forced on (--provenance)' };
  }
  return capable
    ? { useProvenance: true, reason: 'provenance auto-enabled: GitHub Actions with an OIDC token' }
    : { useProvenance: false, reason: 'provenance auto-disabled: no OIDC token in this environment' };
}

/** The exact command. A test asserts this string; nothing is assembled inline at the call site. */
export function publishArgv(mode: ProvenanceMode, env: NodeJS.ProcessEnv): string {
  const base = 'pnpm publish --access public --no-git-checks';
  return decideProvenance(mode, env).useProvenance ? base + ' --provenance' : base;
}

/** Discover all publishable @dzhechkov packages. */
export function discoverPackages(monorepoRoot: string): { name: string; dir: string; version: string }[] {
  const baseDir = join(monorepoRoot, 'packages', '@dzhechkov');
  if (!existsSync(baseDir)) return [];

  return readdirSync(baseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const pkgPath = join(baseDir, e.name, 'package.json');
      if (!existsSync(pkgPath)) return undefined;
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { name: string; version: string };
      return { name: pkg.name, dir: join(baseDir, e.name), version: pkg.version };
    })
    .filter((p): p is { name: string; dir: string; version: string } => p !== undefined);
}

/**
 * Find skill directories that exist on disk but are NOT covered by the package's
 * `files` whitelist — i.e. skills that would be **silently dropped** from the
 * published npm tarball (a `dz install` would not deliver them).
 *
 * A pack with no `files` array publishes everything, so nothing is missing. When a
 * `files` array is present, npm only ships the listed paths. A skill dir (`<name>/SKILL.md`)
 * is covered iff either its directory is selected, or EVERY regular file currently under that
 * skill has an exact/ancestor entry. Merely listing `SKILL.md` is not enough: that would let a
 * closed per-file allowlist silently drop a referenced script. Returns the sorted list of
 * incomplete skill directory names (empty = complete).
 */
export function findUnpackagedSkills(packDir: string): string[] {
  const pkgPath = join(packDir, 'package.json');
  if (!existsSync(pkgPath)) return [];
  let files: unknown;
  try {
    files = (JSON.parse(readFileSync(pkgPath, 'utf-8')) as { files?: unknown }).files;
  } catch {
    return [];
  }
  if (!Array.isArray(files)) return []; // no whitelist → npm ships everything
  const entries = files.map((f) => String(f).replace(/^\.\//, '').replace(/\/$/, ''));
  const covered = new Set(entries);
  // npm-packlist applies `!` entries as exclusions after positive selectors. Modelling that
  // precedence incompletely would be a false-complete publish decision, so any negation makes every
  // on-disk skill an offender. Authors can replace it with an explicit positive closure.
  const hasNegatedSelector = entries.some((entry) => entry.startsWith('!'));
  // Support the simple `*` path patterns used by the repository. Unsupported glob syntax covers
  // nothing instead of disabling the entire guard; an explicit directory selector is the cure.
  // Slash-less patterns are deliberately unsupported: npm applies them at multiple depths, while
  // this guard's `*` is one path-segment only. `**` is likewise unsupported rather than silently
  // degraded to `*`. Treating either as complete would therefore fail open.
  const globSelectors = entries.flatMap((entry) => {
    if (!entry.includes('/') || !entry.includes('*') || entry.includes('**') || /[?[\]{}!]/.test(entry)) return [];
    const source = entry.split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[^/]*');
    return [new RegExp(`^${source}$`)];
  });

  const skillFiles = (skillName: string): string[] => {
    const root = join(packDir, skillName);
    const out: string[] = [];
    const visit = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const absolute = join(dir, entry.name);
        if (entry.isDirectory()) visit(absolute);
        else out.push(pathRelative(packDir, absolute).split('\\').join('/'));
      }
    };
    visit(root);
    return out;
  };
  const selected = (path: string): boolean => {
    const parts = path.split('/');
    for (let length = parts.length; length > 0; length--) {
      if (covered.has(parts.slice(0, length).join('/'))) return true;
    }
    return globSelectors.some((selector) => selector.test(path));
  };

  return readdirSync(packDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(packDir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .filter((name) => hasNegatedSelector || !skillFiles(name).every(selected))
    .sort();
}

/** The `@dzhechkov/*` workspace dependency names declared by a package (deps + peer). */
function workspaceDeps(dir: string): string[] {
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})].filter((n) =>
      n.startsWith('@dzhechkov/'),
    );
  } catch {
    return [];
  }
}

/**
 * Topologically order a publish set so every package is published AFTER its
 * `@dzhechkov` workspace dependencies **that are also in the set** (dependencies first).
 *
 * Why this matters: the loop bumps a package's version in its own package.json right
 * before publishing it, and `pnpm publish` rewrites a dependent's `workspace:*` to the
 * dependency's version *as it stands on disk at that moment*. If a dependent (harness-cli)
 * is published before its dependency (harness-core) is bumped, it pins the STALE version —
 * exactly the bug that shipped harness-cli@0.3.122 depending on harness-core@0.3.37 (which
 * lacked a newly-added export), crashing on startup. Deps-first ordering guarantees the
 * dependency is already bumped on disk when the dependent is published.
 *
 * Cycles (which the monorepo should not have) fall back to stable input order.
 */
export function orderByDependencies<T extends { name: string; dir: string }>(pkgs: T[]): T[] {
  const inSet = new Map(pkgs.map((p) => [p.name, p]));
  const deps = new Map(pkgs.map((p) => [p.name, workspaceDeps(p.dir).filter((d) => inSet.has(d))]));
  const ordered: T[] = [];
  const done = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    if (done.has(name) || visiting.has(name)) return; // done, or cycle → skip re-entry
    visiting.add(name);
    for (const d of deps.get(name) ?? []) visit(d);
    visiting.delete(name);
    if (!done.has(name)) {
      done.add(name);
      const p = inSet.get(name);
      if (p) ordered.push(p);
    }
  };
  for (const p of pkgs) visit(p.name);
  return ordered;
}

/**
 * Sync a package's own README to a freshly-bumped version: every exact occurrence of the OLD
 * version token (optionally `v`-prefixed, word-bounded) becomes the new one.
 *
 * This kills the perpetual footer off-by-one: publish bumps package.json DURING publishing, so a
 * hand-synced "vX.Y.Z" status line was always one release behind on npmjs.com (or required
 * pre-setting the future version by hand). Exact-old-token matching keeps every other version
 * string (dependency pins, historical notes, examples citing other releases) untouched.
 * Returns the pre-sync README text for failure restore, or undefined when nothing was rewritten.
 *
 * Bootstrap invariant: exact-token matching MAINTAINS sync but cannot REPAIR pre-existing drift
 * (a footer already one release behind contains a token != oldVersion and is skipped). Bring the
 * footer to the current package.json version once; the mechanism owns it from then on.
 */
export function syncReadmeVersion(dir: string, oldVersion: string, newVersion: string): string | undefined {
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) return undefined;
  const original = readFileSync(readmePath, 'utf-8');
  const escaped = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(^|[^0-9A-Za-z.])(v?)${escaped}(?![0-9])(?!\\.[0-9])`, 'g');
  const lines = original.split('\n');
  const history = changelogRegion(lines);
  const updated = lines
    .map((line, i) => (history.has(i) ? line : line.replace(token, `$1$2${newVersion}`)))
    .join('\n');
  if (updated === original) return undefined;
  // Atomic: a write interrupted after truncation would leave a half-written README in the tarball
  // (cross-family review). temp + rename makes a partial file impossible.
  const tmp = readmePath + '.sync-tmp';
  writeFileSync(tmp, updated);
  renameSync(tmp, readmePath);
  return original;
}

/**
 * Is this line a CHANGELOG ENTRY for `version` — the heading that documents what that release was?
 *
 * The reason this predicate exists is a falsification measured on 2026-08-25. `syncReadmeVersion`
 * rewrote EVERY occurrence of the outgoing version, and its own comment claimed that "historical
 * notes citing other releases" stayed untouched. That is true for every version EXCEPT the one that
 * matters most: the entry describing the release being superseded. Publishing 0.7.6 → 0.7.7 rewrote
 * the `0.7.6` changelog heading to `0.7.7`, so the README shipped to npm claimed the previous
 * release's contents belonged to the new one — and it had been doing so for several releases, with
 * four headings in one file collapsed onto a single version.
 *
 * The shape is unambiguous in these READMEs: an entry opens its line with the version in backticks,
 * followed by an em- or en-dash. A footer sentence, a badge, an install example or a dependency pin
 * never looks like that, so the lock-step feature keeps working everywhere it was meant to.
 */
export function isChangelogEntryLine(line: string, version: string): boolean {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^\\s{0,3}\`v?${escaped}\`[^\\n]{0,80}?[—–-]`).test(line);
}

/**
 * An entry heading for ANY version — the shape that opens a changelog record.
 *
 * Deliberately TOLERANT (cross-family review): a prerelease or build suffix, a list marker, deeper
 * indentation or an unusual dash must still be recognised, because a MISS fails OPEN — no region
 * detected means everything is rewritten, which is the original falsification returning.
 */
const ANY_ENTRY = /^\s*(?:[-*+]\s*)?`v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.]+)?`[^\n]{0,120}?[—–‒−-]/;

/** A heading that ENDS the changelog region: `#` or `##` only. A `### Fixed` subsection inside a
 *  changelog must not end it, or every entry below that subsection loses protection. */
const REGION_END = /^ {0,3}#{1,2}\s/;

/** Blank out fenced-code lines while PRESERVING line numbering, so a `## Status` or an entry-shaped
 *  line inside an example neither starts nor ends the region (the same fence blindness was found in
 *  another checker on the same day). */
function maskFences(lines: readonly string[]): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const open = /^ {0,3}(```+|~~~+)/.exec(line);
    if (fence === null && open !== null && open[1] !== undefined) { fence = open[1][0] as string; out.push(''); continue; }
    if (fence !== null) {
      out.push('');
      if (new RegExp('^ {0,3}' + fence + '{3,}\\s*$').test(line)) fence = null;
      continue;
    }
    out.push(line);
  }
  return out;
}

/**
 * The line indices of the CHANGELOG REGION: from the first entry heading to the next markdown
 * heading (or end of file). Every line in it is history and is never version-rewritten.
 *
 * Protecting only the entry's own LINE was not enough, and the gap was visible on npm within the
 * hour: `skills-feature-adr`'s entry for the Step-7 blocker fix opened with its heading and then
 * said in PROSE "`1.5.2` shipped a workflow that called three helpers it never defined". Two
 * successive publishes rewrote that citation forward, and the shipped README ended up claiming the
 * same version both introduced the bug and fixed it. A record's body is as much a record as its
 * title.
 *
 * The region ENDS at the next heading rather than at end-of-file on purpose: two of these READMEs
 * carry ordinary sections after Status, and over-protecting them would silently stop the lock-step
 * sync where it is still wanted.
 */
export function changelogRegion(lines: readonly string[]): Set<number> {
  const out = new Set<number>();
  const masked = maskFences(lines);
  const start = masked.findIndex((l) => ANY_ENTRY.test(l));
  if (start < 0) return out;
  // REJECTED design, recorded so it is not retried: "sync the FIRST entry, protect the rest". It
  // looks like it restores the lock-step for the current release, and it is unsafe in exactly the
  // case that produced the bug — an author who bumps WITHOUT adding a new entry has the previous
  // release's entry sitting first, and syncing it relabels that release's contents to the new
  // version. The whole region stays protected; writing the newest heading is the author's job, and
  // the prompt for it is that the version they type is the version they are about to publish.
  for (let i = start; i < masked.length; i++) {
    if (i > start && REGION_END.test(masked[i] as string)) break;
    out.add(i);
  }
  return out;
}

/** Publish packages that have changes since last publish. */
export function publishPackages(
  monorepoRoot: string,
  opts: {
    dryRun?: boolean | undefined;
    filter?: string[] | undefined;
    bumpOnly?: boolean | undefined;
    /**
     * Path to the Ed25519 signing key, OUTSIDE the repository. A pack that carries a
     * `.dz-manifest.json` must be re-signed after publish's own bump and README sync, or the tarball
     * ships an inventory it already invalidated. Absent + a signed pack ⇒ publish REFUSES that pack.
     */
    signKey?: string | undefined;
    /**
     * How to actually re-sign. Injected rather than imported so this module stays free of the CLI's
     * manifest writer, and so a test can observe the call without touching a real key.
     */
    reSign?: ((packDir: string, keyPath: string) => void) | undefined;
    /**
     * Verify the pack against the trust root a CONSUMER would use, after re-signing. Injected for the
     * same reason as `reSign`: this module stays free of the verifier, and a test can drive both
     * outcomes without a real key.
     */
    verifyAfterSign?: ((packDir: string) => { ok: boolean; trustRootPresent: boolean; pack?: string }) | undefined;
    /**
     * Pre-publish claim-check gate over each package's README (ADR-001). Default `'warn'`:
     * records the finding count on the result but NEVER changes publish status — additive, so the
     * existing publish path and its tests are unaffected. `'error'` flips ONLY a package with a
     * `high` finding to `status: 'error'`, leaving the rest of the batch unaffected. `'off'`
     * disables the gate entirely (no `claimCheck` field is emitted).
     */
    claimGate?: 'off' | 'warn' | 'error' | undefined;
    /** ADR-001: `auto` (default) decides from the environment; `on` fails where it cannot work. */
    provenance?: ProvenanceMode | undefined;
    /**
     * Floor probe injection for the workspace-floor preflight (see
     * `findUnpublishedWorkspaceFloors`). Default: a real `npm view` probe, which runs only on LIVE
     * publishes — dry-run stays offline, matching `maxPublished`. Injecting a probe also arms the
     * preflight under dry-run, which is how the wiring test drives it without network.
     */
    probeFloor?: ((name: string, version: string) => boolean) | undefined;
  } = {},
): PublishReport {
  // Decide ONCE, before the batch: `--provenance` in an incapable environment must fail here, not on
  // package 7 of 45 (recalled lesson: a failed publish that retries with a bump orphans version numbers).
  const publishCmd = publishArgv(opts.provenance ?? 'auto', process.env);

  const packages = discoverPackages(monorepoRoot);
  const results: PublishResult[] = [];
  const filtered = opts.filter && opts.filter.length > 0
    ? packages.filter((p) => opts.filter!.some((f) => p.name.includes(f) || p.dir.includes(f)))
    : packages;
  // Publish dependencies before dependents so pnpm rewrites workspace:* to the
  // freshly-bumped version, never a stale one (the harness-cli@0.3.122 breakage).
  const ordered = orderByDependencies(filtered);

  // Workspace-floor preflight inputs: the full workspace version map (what pnpm would pack each
  // floor from), and the names whose publish has LANDED so far in this run — grown as the loop
  // proceeds, never assumed from batch membership (Codex P1: a sibling that failed its own gates
  // has no published floor, and static membership would still have covered its dependents).
  const workspaceVersions = new Map(packages.map((p) => [p.name, p.version]));
  const landedInBatch = new Set<string>();
  const armFloorPreflight = opts.bumpOnly !== true && (opts.dryRun !== true || opts.probeFloor !== undefined);
  const probeFloor = opts.probeFloor ?? versionPublished;

  for (const pkg of ordered) {
    const oldVersion = pkg.version;
    // Bump from max(local, npm-published) so a locally-reverted version can't
    // collide with an already-published one (audit #10). Dry-run stays offline
    // (local only) to keep previews fast and network-free.
    const base = opts.dryRun ? oldVersion : maxPublished(pkg.name, oldVersion);
    const newVersion = bumpPatch(base);

    // Preflight: refuse to publish a pack whose `files` whitelist would silently
    // drop a skill dir from the tarball (the bug that shipped skills-meta without
    // audit/skill-advisor, skills-devops without problem-management, etc.). Block
    // even on dry-run so previews surface it too.
    const unpackaged = findUnpackagedSkills(pkg.dir);
    if (unpackaged.length > 0) {
      results.push({
        name: pkg.name,
        oldVersion,
        newVersion,
        status: 'error',
        error: `would drop ${unpackaged.length} skill(s) not in package.json "files": ${unpackaged.join(', ')}. Add them to "files" before publishing.`,
      });
      continue;
    }

    // Workspace-floor preflight (Codex P1, feature workspace-dep-protocol): a `workspace:^` dep
    // packs to `^<sibling's DISK version>` — refuse if that floor is neither in this batch nor on
    // the registry, or the publish succeeds and every consumer install dies with ETARGET.
    if (armFloorPreflight) {
      const manifest = JSON.parse(readFileSync(join(pkg.dir, 'package.json'), 'utf-8')) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
      const unpublishedFloors = findUnpublishedWorkspaceFloors({ dependencies: manifest.dependencies, peerDependencies: manifest.peerDependencies, workspaceVersions, batch: landedInBatch, probe: probeFloor });
      if (unpublishedFloors.length > 0) {
        results.push({
          name: pkg.name,
          oldVersion,
          newVersion,
          status: 'error',
          error: `workspace floor(s) not published: ${unpublishedFloors.map((f) => `${f.name}@${f.version}`).join(', ')}. Publish the sibling(s) first or include them in --filter — a staged disk version is not a shipped one.`,
        });
        continue;
      }
    }

    // Pre-publish claim-check gate. Default `'warn'` per ADR-001: publishing SURFACES a
    // README's untagged claims by default, but `'warn'` NEVER changes publish status, so the
    // existing publish path is unaffected. `'error'` fails only THIS package when it carries a
    // high-severity claim; `'off'` disables the gate entirely (no `claimCheck` field emitted).
    // Runs BEFORE the dry-run short-circuit so `--dry-run` previews surface what a live publish
    // would. Reading the README never blocks the gate itself — unreadable ⇒ "no findings".
    const claimGate = opts.claimGate ?? 'warn';
    let claimCheckSummary: { findings: number; high: number } | undefined;
    if (claimGate !== 'off') {
      const readmePath = join(pkg.dir, 'README.md');
      if (existsSync(readmePath)) {
        try {
          const text = readFileSync(readmePath, 'utf-8');
          const result = claimCheck(text);
          const high = result.findings.filter((f) => f.severity === 'high').length;
          claimCheckSummary = { findings: result.findings.length, high };
          if (claimGate === 'error' && high > 0) {
            results.push({
              name: pkg.name,
              oldVersion,
              newVersion,
              status: 'error',
              error: `claim-check: ${high} high-severity claim(s) in README.md — tag MEASURED with a reproducer or CLAIMED/SYNTHETIC before publishing.`,
              claimCheck: claimCheckSummary,
            });
            continue;
          }
        } catch {
          /* unreadable README never blocks the gate itself */
        }
      }
    }

    if (opts.dryRun) {
      results.push({ name: pkg.name, oldVersion, newVersion, status: 'skipped', claimCheck: claimCheckSummary });
      landedInBatch.add(pkg.name); // preview: this package passed its gates and WOULD land
      continue;
    }

    const pkgJsonPath = join(pkg.dir, 'package.json');
    const originalPkgJson = readFileSync(pkgJsonPath, 'utf-8');
    let originalReadme: string | undefined;
    try {
      // Bump version in package.json
      writeFileSync(pkgJsonPath, originalPkgJson.replace(`"version": "${oldVersion}"`, `"version": "${newVersion}"`));
      // Keep the package's README version footer in lock-step with the bump, so the version
      // shown on npmjs.com always matches the published package (no more manual off-by-one).
      originalReadme = syncReadmeVersion(pkg.dir, oldVersion, newVersion);

      if (opts.bumpOnly) {
        results.push({ name: pkg.name, oldVersion, newVersion, status: 'published', claimCheck: claimCheckSummary });
        continue;
      }

      // Build if has build script
      const parsed = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { scripts?: Record<string, string> };
      if (parsed.scripts?.['build']) {
        execSync('pnpm build', { cwd: pkg.dir, stdio: 'pipe', encoding: 'utf-8' });
      }

      // Re-sign AFTER the bump, the README sync and the build, and BEFORE the tarball is built.
      // publish MUTATES the pack — a signature taken at any earlier moment describes files that no
      // longer exist, and the tarball then ships an inventory that disagrees with its own contents.
      // MEASURED 2026-08-18 on a live published package: a recipient running `dz doctor
      // --require-signing` sees TAMPERED. Harmless while consumers had no trust root; from the
      // release that restores it, a false alarm indistinguishable from a real compromise.
      const signing = decidePublishSigning({
        packHasManifest: existsSync(pathJoin(pkg.dir, '.dz-manifest.json')),
        keyPath: opts.signKey ?? null,
        keyExists: opts.signKey !== undefined && existsSync(opts.signKey),
        keyInsideTree: opts.signKey !== undefined && isInsideDir(opts.signKey, monorepoRoot),
        dryRun: opts.dryRun ?? false,
        bumpOnly: opts.bumpOnly ?? false,
      });
      if (signing.blocking) {
        results.push({ name: pkg.name, oldVersion, newVersion, status: 'error', error: signing.reason, claimCheck: claimCheckSummary });
        try { writeFileSync(pkgJsonPath, originalPkgJson); } catch { /* best-effort restore */ }
        if (originalReadme !== undefined) {
          try { writeFileSync(pathJoin(pkg.dir, 'README.md'), originalReadme); } catch { /* best-effort restore */ }
        }
        continue;
      }
      if (signing.verdict === 're-sign') {
        // Re-sign, then VERIFY THE OUTCOME against the trust root the consumer will use. Enumerating
        // pre-conditions (key present? outside the tree?) cannot be made sufficient — an existing key
        // may be the WRONG key, unreadable, a public key, or the wrong algorithm, and each of those
        // ships a pack the consumer rejects, recreating the very harm this fixes (cross-family review,
        // 2026-08-21). Measure the result instead.
        let verified = false;
        let trustRootPresent = false;
        let verifiedPack: string | undefined;
        // Snapshot the manifest and SBOM: if the post-sign verification refuses, the tree must not be
        // left holding a signature we just decided not to stand behind (round-2 review, finding 7).
        const manifestPath = pathJoin(pkg.dir, '.dz-manifest.json');
        const sbomPath = pathJoin(pkg.dir, 'sbom.json');
        const priorManifest = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf-8') : null;
        const priorSbom = existsSync(sbomPath) ? readFileSync(sbomPath, 'utf-8') : null;
        const restoreSignature = (): void => {
          try { if (priorManifest !== null) writeFileSync(manifestPath, priorManifest); } catch { /* best-effort */ }
          try { if (priorSbom !== null) writeFileSync(sbomPath, priorSbom); } catch { /* best-effort */ }
        };
        try {
          opts.reSign?.(pkg.dir, opts.signKey as string);
          const check = opts.verifyAfterSign?.(pkg.dir);
          trustRootPresent = check?.trustRootPresent ?? false;
          verified = check?.ok ?? false;
          verifiedPack = check?.pack;
        } catch (err) {
          restoreSignature();
          results.push({ name: pkg.name, oldVersion, newVersion, status: 'error', error: `re-signing failed: ${(err as Error).message}`, claimCheck: claimCheckSummary });
          try { writeFileSync(pkgJsonPath, originalPkgJson); } catch { /* best-effort restore */ }
          if (originalReadme !== undefined) {
            try { writeFileSync(pathJoin(pkg.dir, 'README.md'), originalReadme); } catch { /* best-effort restore */ }
          }
          continue;
        }
        const after = decidePostSigningVerification({
          verifiesAgainstTrustRoot: verified,
          trustRootPresent,
          pack: pkg.name,
          ...(verifiedPack === undefined ? {} : { verifiedPack }),
        });
        if (after.blocking) {
          restoreSignature();
          results.push({ name: pkg.name, oldVersion, newVersion, status: 'error', error: after.reason, claimCheck: claimCheckSummary });
          try { writeFileSync(pkgJsonPath, originalPkgJson); } catch { /* best-effort restore */ }
          if (originalReadme !== undefined) {
            try { writeFileSync(pathJoin(pkg.dir, 'README.md'), originalReadme); } catch { /* best-effort restore */ }
          }
          continue;
        }
      }

      // Publish
      execSync(publishCmd, {
        cwd: pkg.dir,
        stdio: 'pipe',
        encoding: 'utf-8',
        env: { ...process.env },
      });

      results.push({ name: pkg.name, oldVersion, newVersion, status: 'published', claimCheck: claimCheckSummary });
      landedInBatch.add(pkg.name); // only an ACTUAL publish covers dependents (Codex P1)
    } catch (err) {
      // The version was written BEFORE build+publish; on any failure restore the
      // original package.json (and README, if we rewrote its version) so a failed
      // attempt doesn't orphan/skip a version number (audit #4). pnpm rewrites
      // workspace:* deps in-place during publish, so restore the captured text.
      try { writeFileSync(pkgJsonPath, originalPkgJson); } catch { /* best-effort restore */ }
      if (originalReadme !== undefined) {
        try { writeFileSync(join(pkg.dir, 'README.md'), originalReadme); } catch { /* best-effort restore */ }
      }
      results.push({
        name: pkg.name,
        oldVersion,
        newVersion,
        status: 'error',
        error: formatPublishError(err),
        claimCheck: claimCheckSummary,
      });
    }
  }

  return {
    packages: results,
    published: results.filter((r) => r.status === 'published').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    dryRun: opts.dryRun === true,
  };
}
