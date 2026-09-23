/**
 * Automated publish — discovers changed packages, bumps patch versions,
 * builds, and publishes to npm.
 *
 * @packageDocumentation
 */

import { maskMarkdown } from './markdown-masker.js';
import { existsSync, readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import { join as pathJoin, relative as pathRelative, resolve as pathResolve, isAbsolute as pathIsAbsolute, sep as pathSep } from 'node:path';

import { decidePublishSigning, decidePostSigningVerification } from './publish-signing.js';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
// Structural twin of node's ExecSyncOptionsWithStringEncoding — a type-only import of node:child_process
// still counts as an IO import for the core-boundary ratchet (measured 66 → 67), so the shape is spelled here.
type ExecSyncOptionsWithStringEncoding = NonNullable<Parameters<typeof execSync>[1]> & { encoding: 'utf-8' };
// node:crypto is NOT in the core-boundary ratchet's tracked module list (fs/child_process/https
// only) — a read-only digest of bytes already produced by THIS process is not the kind of external
// I/O the ratchet polices, so this import is free with respect to it (verified against
// `core-boundary.ts`'s `countIoImports` module list).
import { createHash } from 'node:crypto';

import { claimCheck } from './claim-check.js';
import { findReleaseLine, rewriteReleaseLine, isReleaseLineToken, shortPackageName } from './release-line.js';
import { packedTarballName } from './packed-install-smoke.js';

export type ProbeOutcome = {
  readonly attempt: number;
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
  readonly ms: number;
};

// MEASURED 2026-09-10: registry answered E404 for ~3 min (19 probes); earlier the same day > 5 min.
export const REGISTRY_PROBE_BUDGET = 90;
export const REGISTRY_PROBE_INTERVAL_MS = 10_000;

export type RegistryProbe =
  | { kind: 'published'; version: string; scripted?: true }
  | { kind: 'never-published'; scripted?: true }
  | { kind: 'unknown'; reason: string; scripted?: true };

/**
 * Scripted registry seam for tests that spawn the REAL bin and therefore cannot inject `exec`
 * (first-publish-not-offline AM-A; same shape as `WF_RUN_DISPATCH_SCRIPT_ENV`). Value: path to a JSON
 * file `{ "<name>": "<x.y.z>" | "E404" | "<npm code>" }`. When set, no `npm view` runs at all and EVERY
 * row carries `probeOverride: true` — a scripted plan can never read as a verified one.
 */
export const PUBLISH_PROBE_SCRIPT_ENV = 'DZ_PUBLISH_PROBE_SCRIPT';

/** Result for a single package publish attempt. */
export interface PublishResult {
  readonly name: string;
  readonly oldVersion: string;
  readonly newVersion: string;
  readonly status: 'published' | 'skipped' | 'error';
  readonly firstPublish?: boolean;
  readonly probe?: RegistryProbe['kind'];
  /** Present (true) only when `DZ_PUBLISH_PROBE_SCRIPT` answered instead of the registry. */
  readonly probeOverride?: boolean;
  readonly error?: string | undefined;
  /** Live publish only: how many registry probes were needed to confirm the exact new version. */
  readonly registryProbes?: number | undefined;
  /** Live publish only: complete evidence from every registry receipt probe. */
  readonly probeLog?: readonly ProbeOutcome[] | undefined;
  /**
   * Pre-publish claim-check summary for this package's README, present only when the
   * opt-in `claimCheck` gate ran (`'warn'`/`'block'`). Additive: absent by default so an
   * unmodified `publishPackages` call is byte-compatible with pre-gate behavior.
   */
  readonly claimCheck?: { readonly findings: number; readonly high: number } | undefined;
  /**
   * FR-3 (feature publish-readme-stamp-scope): a preview of what `planReadmeVersionSync` would do
   * (dry-run) or already did (live) to this package's own README.md — never silent about the
   * lock-step sync. `lines` are the 1-based line numbers actually rewritten; `skippedHistorical` is
   * a TOKEN count (changelog-region entries + tokens outside every recognised ALLOWLIST shape), not
   * a line count; `historyLines` names WHERE those kept-as-history tokens sit (fix-round 1, Codex
   * HIGH: "history has only an aggregate count, not locations"). Absent when the package has no
   * README.md, or on an 'error' result where the sync never ran/mattered.
   */
  readonly readmeSync?: {
    readonly rewrittenLines: number;
    readonly lines: readonly number[];
    readonly skippedHistorical: number;
    readonly historyLines: readonly number[];
  } | undefined;
  /**
   * DRY-RUN ONLY, and the reason it exists is a measured incident. A dry run short-circuits
   * BEFORE build, sign and pack (see the `opts.dryRun` branch below), so the package's own
   * `prepublishOnly` gate never executes. On 2026-09-02 a clean dry run was read as evidence that
   * publication would succeed; the real gate was RED — a stale signature baseline plus six
   * `__pycache__/*.pyc` files already signed into the manifest. A preview that names only what it
   * DID check reads as a pass for everything it skipped, which is the same failure class as a gate
   * that infers success from silence. So a dry-run result carries the list of gates it did NOT run,
   * and the CLI prints it. Absent on a real publish, where every gate actually ran.
   */
  readonly notVerified?: readonly string[] | undefined;
  /**
   * AM-1 (feature publish-sibling-drift-gate): sha256 of the EXACT tarball bytes that were
   * packed-install-smoked AND handed to `npm publish` — present only when `opts.packedTransport`
   * was used for a live (non-dry-run) publish. Printed and audited so "the smoke tested the same
   * bytes that shipped" is a checkable claim, not an architectural assertion.
   */
  readonly sha256?: string | undefined;
}

/**
 * One package's packed, smoke-eligible artifact — the unit `opts.packedTransport.smoke` receives
 * (AM-1). Produced ONCE per package, after its OWN bump/build/sign steps, from a package.json
 * whose `workspace:` specs are already resolved to each sibling's PINNED version (the same
 * transformation `rewriteWorkspaceSpecs` performs) — so the tarball is exactly what `npm publish
 * <tgzPath>` will later ship, byte for byte.
 */
export interface PackedTarballArtifact {
  readonly name: string;
  readonly newVersion: string;
  readonly tgzPath: string;
  readonly sha256: string;
}

export interface PackedTransportSmokeVerdict {
  readonly ok: boolean;
  readonly reason?: string | undefined;
}

/** Positive read-back evidence returned by the configured public-mirror command. */
export interface MirrorReceipt {
  readonly manifestUrl: string;
  readonly confirmedAt: string;
  readonly waitedMs: number;
}

/**
 * State of the optional post-publish mirror epilogue. This is report data only: harness-core does
 * not execute the hook or perform mirror I/O.
 */
export interface MirrorEpilogue {
  readonly status: 'confirmed' | 'unconfirmed' | 'skipped' | 'not-configured';
  readonly command: string;
  readonly commit?: string | undefined;
  readonly receipt?: MirrorReceipt | undefined;
  readonly error?: string | undefined;
  readonly reason?: string | undefined;
  readonly warning?: string | undefined;
}

export interface ReleaseLineReport {
  readonly path: string;   // 'README.md' | 'packages/@dzhechkov/harness-cli/README.md'
  readonly rewritten: readonly { readonly name: string; readonly from: string; readonly to: string }[];
  readonly kept: readonly { readonly name: string; readonly version: string }[];
  readonly wrapped: boolean;
}

/** Full publish report. */
export interface PublishReport {
  readonly packages: readonly PublishResult[];
  readonly published: number;
  readonly skipped: number;
  readonly errors: number;
  readonly dryRun: boolean;
  /** Repo-relative README paths whose first joint core/CLI release line was rewritten. */
  readonly releaseLineSynced: readonly string[];
  readonly releaseLineReport: readonly ReleaseLineReport[];
  /** Post-publication sync failures are warnings: registry-confirmed packages cannot be unpublished. */
  readonly warnings?: readonly string[] | undefined;
  /** CLI-owned command-hook outcome after a live publish; no transport logic lives in core. */
  readonly mirror?: MirrorEpilogue | undefined;
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

type PublishExec = (command: string, options: ExecSyncOptionsWithStringEncoding) => string;

/** Only explicit npm absence signals establish that a package has never been published. */
export function classifyRegistryProbe(stderr: string, message: string): RegistryProbe {
  const detail = `${stderr}\n${message}`;
  if (/\bcode E404\b/.test(detail) || /\b404 Not Found\b/.test(detail) || /is not in this registry/.test(detail)) {
    return { kind: 'never-published' };
  }
  const reason = /npm error code (\S+)/.exec(detail)?.[1]
    ?? stderr.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length > 0)
    ?? message;
  return { kind: 'unknown', reason };
}

function scriptedProbe(name: string): RegistryProbe | undefined {
  const scriptPath = process.env[PUBLISH_PROBE_SCRIPT_ENV];
  if (typeof scriptPath !== 'string' || scriptPath === '') return undefined;
  let table: Record<string, unknown>;
  try {
    table = JSON.parse(readFileSync(scriptPath, 'utf-8')) as Record<string, unknown>;
  } catch (err) {
    return { kind: 'unknown', reason: `scripted probe unreadable: ${err instanceof Error ? err.message : String(err)}`, scripted: true };
  }
  const answer = table[name];
  if (typeof answer !== 'string') return { kind: 'unknown', reason: `scripted probe has no entry for ${name}`, scripted: true };
  if (/^\d+\.\d+\.\d+/.test(answer)) return { kind: 'published', version: answer, scripted: true };
  if (answer === 'E404') return { kind: 'never-published', scripted: true };
  return { kind: 'unknown', reason: answer, scripted: true };
}

function probeRegistry(name: string, exec: PublishExec = execSync): RegistryProbe {
  const scripted = scriptedProbe(name);
  if (scripted !== undefined) return scripted;
  try {
    const out = exec(`npm view ${name} version --prefer-online`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', timeout: 20000 }).trim();
    return /^\d+\.\d+\.\d+/.test(out)
      ? { kind: 'published', version: out }
      : { kind: 'unknown', reason: 'unparsable npm view output' };
  } catch (err) {
    const error = err as { stderr?: unknown; message?: unknown } | null | undefined;
    return classifyRegistryProbe(String(error?.stderr ?? ''), String(error?.message ?? ''));
  }
}

/** The higher of the local version and the npm-published version (audit #10). */
function maxPublished(name: string, localVersion: string, exec: PublishExec = execSync): string {
  const probe = probeRegistry(name, exec);
  return probe.kind === 'published' && compareVersions(probe.version, localVersion) > 0 ? probe.version : localVersion;
}

// ── workspace-floor preflight (feature workspace-dep-protocol, Codex P1) ─────
//
// Sibling deps are declared `workspace:^`, and pnpm rewrites them at pack time to `^<the sibling's
// DISK version>`. That version is not necessarily PUBLISHED: `--bump-only` stages versions on disk,
// and a later `--filter`ed publish of just the dependent would ship a floor nobody can install —
// the publish itself succeeds, and every consumer `npm install` then fails with ETARGET. Staged is
// not shipped; this preflight makes the difference a refusal instead of a broken release.

/**
 * Mirror pnpm's package-time expansion of the three shorthand workspace dependency specs.
 * Pure by construction: callers provide both the source bytes and the sibling version table.
 */
export function rewriteWorkspaceSpecs(
  pkgJsonText: string,
  siblingVersions: ReadonlyMap<string, string>,
): string {
  const pkg = JSON.parse(pkgJsonText) as Record<string, unknown>;
  const fields = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'] as const;
  for (const field of fields) {
    const candidate = pkg[field];
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) continue;
    const table = candidate as Record<string, unknown>;
    for (const [dep, spec] of Object.entries(table)) {
      if (typeof spec !== 'string') continue;
      const match = /^workspace:([*^~])$/.exec(spec);
      const version = siblingVersions.get(dep);
      if (match === null || version === undefined) continue;
      const marker = match[1]!;
      table[dep] = marker === '*' ? version : `${marker}${version}`;
    }
  }
  return JSON.stringify(pkg, null, 2) + '\n';
}

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

/** Registry probe: preserve the complete answer while checking for the exact `name@version`. */
export function probeVersion(
  name: string,
  version: string,
  exec: PublishExec = execSync,
): Omit<ProbeOutcome, 'attempt'> {
  const started = Date.now();
  try {
    const out = exec(`npm view ${name}@${version} version --prefer-online`, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8', timeout: 20000 });
    return { ok: out.trim() === version, stdout: out, stderr: '', code: 0, ms: Date.now() - started };
  } catch (err) {
    const failure = err as Error & { status?: number | null; stdout?: unknown; stderr?: unknown };
    return {
      ok: false,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? failure.message),
      code: failure.status ?? null,
      ms: Date.now() - started,
    };
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

/** Match substrings against package identity and path without including the checkout root. */
export function matchesPublishFilter(
  pkg: { name: string; dir: string },
  filter: string,
  monorepoRoot: string,
): boolean {
  const normalizedFilter = filter.replace(/\\/g, '/');
  const relativeDir = pathRelative(pathResolve(monorepoRoot), pathResolve(pkg.dir));
  // A foreign path must not reintroduce checkout ancestors into the match.
  const outsideRoot = relativeDir === '..' || relativeDir.startsWith(`..${pathSep}`) || pathIsAbsolute(relativeDir);
  // Only Windows spells separators with a backslash. On POSIX a backslash is a legal character
  // INSIDE a directory name, so rewriting it here would invent a separator the filesystem does
  // not have and over-select that package — the same class as the root-substring defect.
  const comparableDir = pathSep === '\\' ? relativeDir.replace(/\\/g, '/') : relativeDir;
  return pkg.name.includes(normalizedFilter)
    || (!outsideRoot && comparableDir.includes(normalizedFilter));
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

/** One README line the sync touched: 1-based line number, and the line before/after the rewrite. */
export interface ReadmeSyncRewrite {
  readonly line: number;
  readonly before: string;
  readonly after: string;
}

/** The report `planReadmeVersionSync` returns — never silent about what it did and did not touch. */
export interface ReadmeVersionSyncPlan {
  readonly text: string;
  readonly rewritten: readonly ReadmeSyncRewrite[];
  /** Count of OLD-VERSION token OCCURRENCES left untouched as history (changelog region + every
   *  token outside every recognised ALLOWLIST shape — FR-1). */
  readonly skippedHistorical: number;
  /** The 1-based line numbers carrying at least one of those kept-as-history tokens (fix-round 1,
   *  Codex HIGH: "history has only an aggregate count, not locations; rewritten lines have
   *  numbers"). Deduplicated and sorted ascending — a line with two skipped tokens appears once. */
  readonly historyLines: readonly number[];
}

/**
 * A line carrying this HTML comment opts BACK IN to rewriting, overriding both the changelog-region
 * protection and the allowlist below — the author's explicit "this token is a stamp, not history"
 * (AC-3).
 */
const DZ_VERSION_MARKER = '<!-- dz:version -->';

/**
 * Shape 4 of the allowlist (fix-round 1 design): the `dz publish` CLI's own example line, quoted
 * verbatim in a README — `dz publish: tarball <name>@X sha256:…`. In practice every occurrence of
 * this line is ALSO caught by shape 3 (the version always follows `<name>@`), so this predicate is
 * mostly documentation of intent — named explicitly because the design brief calls it out as its own
 * recognised shape, not an accident of shape 3's reach.
 */
// Codex r2 HIGH (lead): the tarball example line grants NO whole-line permission any more — its
// only stampable token is `<name>@X`, which shape 3 (install/pin) already recognises; a trailing
// `measured on X` on the same example line stays history.

/**
 * Shape 2 of the allowlist: a current-release FOOTER PREFIX — a short declarative label stamping the
 * package's OWN current version (`Status: `, `Current release: `, `Current status: `, `Released as `),
 * optionally preceded by a list marker or bold-open, with the label being the ENTIRE prefix up to the
 * token — `Status: vX is current.` allows `vX` because nothing but the label sits before it. This is
 * deliberately POSITION-AWARE (tested against the text before the token, not "does this line contain
 * the word somewhere"): a line that opens with a footer label but cites an UNRELATED older version
 * later in the same sentence — `Current release: 1.0.0. (Previous release (v1.1.0 / v1.0.0) …)` —
 * must allow only the first token, not the second one sitting deep in a citation. `Previous release
 * (vA / vB)` itself never matches at all: it opens with "Previous", not "release".
 */
// Codex r2 HIGH (lead): exactly the three settled footer labels, at line start, colon required —
// `Status:`, `Version:`, `Current release:` (optional bold / list marker). `Note: X`, `Released X`
// and every other label stay history.
// The settled label set (Codex r2 HIGH, lead): `Status:`, `Version:`, `Current release:`,
// `Current status:` (colon required, optional bold / list marker) and the original footer
// sentence `Released as vX` — the shapes the 2026-08-25 tests pin. `Note: X`, `Released X on …`,
// `Status as of X` and every other label are history.
const FOOTER_STAMP_PREFIX_RE = /^\s*(?:[-*+]\s+)?(?:(?:\*\*)?(?:status|version|current release|current status)(?::\*\*|\*\*:|:)|released as)\s*$/i;

/**
 * Shape 6 of the allowlist: a shields.io-style badge URL segment — `badge/npm-v0.7.7-…` or
 * `badge/version-0.7.7-…`. Scoped to the literal `/badge/` marker (not a bare "-v" anywhere) so an
 * unrelated hyphenated token elsewhere on the line is never mistaken for a badge.
 */
// Codex r2 HIGH (lead): a badge segment counts only inside a shields.io badge URL, not any `/badge/` path.
const BADGE_SEGMENT_RE = /img\.shields\.io\/badge\/[\w.%-]*$/i;

/**
 * Shape 3 of the allowlist: an install/dependency-pin context. Either the token is immediately
 * preceded by `@` (`npm i @dzhechkov/harness-core@0.7.6`, the tarball example's `<name>@X`), or it
 * sits in the JSON-pin shape `"<package-name>": "X"` (a `package.json`/lockfile-style dependency pin
 * quoted in prose) — the design brief's "for the JSON-pin form accept `\": \"` before the token when
 * the key is a package name".
 */
function isInstallPinContext(line: string, tokenStart: number): boolean {
  // Codex r2 HIGH (lead): `@X` counts only as `<name>@X` — a package-name character must precede the
  // `@` (`thing@0.8.25`, `@scope/name@0.8.25`); a bare `see @0.8.25` stays history.
  if (line[tokenStart - 1] === '@' && /[A-Za-z0-9._-]/.test(line[tokenStart - 2] ?? '')) return true;
  const before = line.slice(0, tokenStart);
  return /"[@A-Za-z0-9][\w./-]*"\s*:\s*"$/.test(before);
}

/**
 * FR-1 (POSITIVE ALLOWLIST, not a denylist — Codex fix-round 1, 2026-09-15). Outside a changelog
 * region, an old-version token occurrence rewrites ONLY when it sits in one of six recognised
 * shapes — the lock-step feature this sync exists for, and NOTHING beyond it. Every shape NOT named
 * here defaults to HISTORY, whatever prose it is written in: the previous design (a denylist of
 * three named citation phrases — "on X", "X alike", "/ vX") was corruptible by construction, because
 * ANY new prose shape citing the outgoing version ("since X", "measured against X", "X behaviour", a
 * bare "X" in a sentence) rewrote by default until someone thought to deny it too. An allowlist has
 * no such gap: an unrecognised shape is history by default, not by enumeration.
 *
 *  1. a release-line token — `` `harness-core vX` · `harness-cli vY` `` and any generalised
 *     `` `<name> vX` `` on the same line, including a trailing `` · `memory vZ` `` segment
 *     (release-line.ts `isReleaseLineToken`/`GENERIC_RELEASE_TOKEN_RE`).
 *  2. a current-release FOOTER prefix (`FOOTER_STAMP_PREFIX_RE`) — position-aware, so only the
 *     token immediately after the label is allowed.
 *  3. an install/dependency-pin context (`isInstallPinContext`).
 *  4. the `dz publish: tarball <name>@X sha256:…` example line (`TARBALL_EXAMPLE_LINE_RE`).
 *  5. (handled by the caller, not here) a `<!-- dz:version -->` marker forces the rewrite outright,
 *     overriding this predicate AND the changelog-region protection (AC-3).
 *  6. a shields badge URL segment (`BADGE_SEGMENT_RE`).
 */
function isAllowlistedRewriteContext(line: string, tokenStart: number, versionEnd: number): boolean {
  if (isReleaseLineToken(line, tokenStart, versionEnd)) return true; // shape 1
  if (FOOTER_STAMP_PREFIX_RE.test(line.slice(0, tokenStart))) return true; // shape 2
  if (isInstallPinContext(line, tokenStart)) return true; // shape 3 (also covers the tarball example's `<name>@X`)
  if (BADGE_SEGMENT_RE.test(line.slice(0, tokenStart))) return true; // shape 6 (shields.io only)
  return false;
}

/**
 * Plan how a README's OLD-VERSION tokens would move to NEW-VERSION — a pure function, no I/O.
 *
 * FR-1 (allowlist, not denylist). Outside a changelog region (FR-2: EVERY entry-shaped run, not
 * only the first — see `changelogRegion`), a token rewrites ONLY when `isAllowlistedRewriteContext`
 * recognises its shape; every other token — historical prose of ANY form — is left untouched by
 * default. A `<!-- dz:version -->` marker on the line forces the rewrite regardless of either
 * protection (AC-3).
 *
 * FR-3 (never silent): every rewritten line is reported with its line number and before/after text;
 * every token left untouched as history is counted AND located, whether the reason was the
 * changelog region or simply not matching any allowlist shape.
 */
export function planReadmeVersionSync(
  text: string,
  oldVersion: string,
  newVersion: string,
): ReadmeVersionSyncPlan {
  const escaped = oldVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const token = new RegExp(`(^|[^0-9A-Za-z.])(v?)${escaped}(?![0-9])(?!\\.[0-9])`, 'g');
  const lines = text.split('\n');
  const history = changelogRegion(lines);
  const rewritten: ReadmeSyncRewrite[] = [];
  const historyLineSet = new Set<number>();
  let skippedHistorical = 0;

  const outLines = lines.map((line, i) => {
    const forced = line.includes(DZ_VERSION_MARKER);
    const lineIsHistory = history.has(i) && !forced;
    let touched = false;
    const after = line.replace(token, (full: string, sep: string, vPrefix: string, offset: number) => {
      const tokenStart = offset + sep.length; // includes the optional 'v' — allowlist shapes need it
      const versionStart = tokenStart + vPrefix.length;
      const versionEnd = versionStart + oldVersion.length;
      const allowed = forced || (!lineIsHistory && isAllowlistedRewriteContext(line, tokenStart, versionEnd));
      if (!allowed) {
        skippedHistorical++;
        historyLineSet.add(i + 1);
        return full;
      }
      touched = true;
      return `${sep}${vPrefix}${newVersion}`;
    });
    if (touched) rewritten.push({ line: i + 1, before: line, after });
    return after;
  });

  return {
    text: outLines.join('\n'),
    rewritten,
    skippedHistorical,
    historyLines: [...historyLineSet].sort((a, b) => a - b),
  };
}

/**
 * Sync a package's own README to a freshly-bumped version — a thin, atomic-write wrapper around
 * `planReadmeVersionSync`. Returns the pre-sync README text for failure restore, or undefined when
 * nothing was rewritten (same contract as before this function grew a real plan underneath it —
 * `dz publish`'s report reads the plan via `planReadmeVersionSync` directly; this wrapper's return
 * value stays exactly what its callers already depend on).
 *
 * Bootstrap invariant: exact-token matching MAINTAINS sync but cannot REPAIR pre-existing drift
 * (a footer already one release behind contains a token != oldVersion and is skipped). Bring the
 * footer to the current package.json version once; the mechanism owns it from then on.
 */
export function syncReadmeVersion(dir: string, oldVersion: string, newVersion: string): string | undefined {
  const readmePath = join(dir, 'README.md');
  if (!existsSync(readmePath)) return undefined;
  const original = readFileSync(readmePath, 'utf-8');
  const plan = planReadmeVersionSync(original, oldVersion, newVersion);
  if (plan.text === original) return undefined;
  // Atomic: a write interrupted after truncation would leave a half-written README in the tarball
  // (cross-family review). temp + rename makes a partial file impossible.
  const tmp = readmePath + '.sync-tmp';
  writeFileSync(tmp, plan.text);
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
 *  another checker on the same day).
 *
 *  Scoping is DELEGATED to the canonical masker, not re-implemented. The local version this replaces
 *  tracked only the marker CHARACTER and closed on any run of three or more, ignoring CommonMark's
 *  rule that a closing fence may not be SHORTER than the opening one. MEASURED 2026-09-20: in a
 *  README whose entry body quotes a markdown example as ````markdown … ```` , the inner ``` closed
 *  the outer block early, the quoted `## Status` became visible, the region ENDED there, and the
 *  body line below — `В `1.2.2` эта строка тела …` — lost protection. That is exactly the
 *  2026-08-25 incident this function exists to stop: a record's body relabelled forward and shipped
 *  to npm. `unclosed: 'hide'` preserves the local version's policy — an unclosed opener masks to
 *  end of file, which is also the CommonMark reading.
 */
function maskFences(lines: readonly string[]): string[] {
  return String(maskMarkdown(lines.join('\n'), { unclosed: 'hide' })).split('\n');
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
 *
 * MEASURED 2026-09-15 (00_complexity_assessment.md, feature publish-readme-stamp-scope): this
 * function protected only the FIRST such run. A second `## Status` heading further down the SAME
 * README opens a SECOND entry-shaped run (`memory` 0.2.21/0.2.22 sat under a later `## Status`,
 * after an earlier `0.1.0` entry whose region had already ended) — and that second run was bare,
 * so its entries got relabelled by the next bump exactly like the 2026-08-25 incident this function
 * was written to stop. FR-2: EVERY entry-shaped run in the document is protected, not only the
 * first — the scan restarts after each run ends instead of stopping there.
 */
export function changelogRegion(lines: readonly string[]): Set<number> {
  const out = new Set<number>();
  const masked = maskFences(lines);
  let i = 0;
  while (i < masked.length) {
    if (!ANY_ENTRY.test(masked[i] as string)) { i++; continue; }
    const start = i;
    // REJECTED design, recorded so it is not retried: "sync the FIRST entry, protect the rest". It
    // looks like it restores the lock-step for the current release, and it is unsafe in exactly the
    // case that produced the bug — an author who bumps WITHOUT adding a new entry has the previous
    // release's entry sitting first, and syncing it relabels that release's contents to the new
    // version. The whole region stays protected; writing the newest heading is the author's job, and
    // the prompt for it is that the version they type is the version they are about to publish.
    while (i < masked.length && !(i > start && REGION_END.test(masked[i] as string))) {
      out.add(i);
      i++;
    }
    // `i` now sits on the heading that ended this run (or at EOF) — NOT consumed, so the outer loop
    // re-examines it: a heading is never itself an entry, but the very next line under it can open a
    // brand-new run, which is exactly the second-`## Status` case above.
  }
  return out;
}

/** Publish packages that have changes since last publish. */
export function publishPackages(
  monorepoRoot: string,
  opts: {
    dryRun?: boolean | undefined;
    filter?: string[] | undefined;
    /** Exact CLI-selected batch; an empty list means no targets. Discovery remains unfiltered. */
    targetNames?: readonly string[] | undefined;
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
     * publishes. Injecting a probe also arms this floor preflight under dry-run. The package's
     * own registry classification runs in both live and dry-run modes independently.
     */
    probeFloor?: ((name: string, version: string) => boolean) | undefined;
    /** Subprocess injection for tests; the default is Node's synchronous executor. */
    exec?: PublishExec | undefined;
    /** Post-publish receipt probe. The default asks npm for exactly `name@version`. */
    probe?: ((name: string, version: string) => boolean | Omit<ProbeOutcome, 'attempt'>) | undefined;
    /** Pause injection between receipt probes. The default blocks for the requested milliseconds. */
    sleep?: ((milliseconds: number) => void) | undefined;
    /**
     * AM-1 (feature publish-sibling-drift-gate). OPT-IN — omitted (the default), this function is
     * byte-identical to its pre-amendment self: every package still publishes via `pnpm publish`
     * FROM ITS DIRECTORY (`publishArgv`), exactly as every existing test of this function expects.
     *
     * When provided, the transport for THIS call's batch changes: each package is packed ONCE
     * (after its own bump/build/sign, workspace: specs resolved to each sibling's PINNED version —
     * a landed batch sibling's NEW version, an out-of-batch sibling's disk version, mirroring what
     * `rewriteWorkspaceSpecs`/pnpm itself would resolve), collected, and `smoke` is called with
     * EVERY package's packed artifact before ANY of them is published. Only on `smoke.ok === true`
     * does each artifact get `npm publish <tgzPath>` — the exact bytes that were smoked (a sha256
     * recheck immediately before that call refuses on any mismatch, defending the "same bytes"
     * claim against anything that could touch the tarball in between).
     */
    packedTransport?: {
      /** Absolute, pre-created directory to write tarballs into (this function never mkdirs it). */
      readonly packDestDir: string;
      /** Judge the WHOLE batch's packed artifacts together — nothing publishes until this passes. */
      readonly smoke: (artifacts: readonly PackedTarballArtifact[]) => PackedTransportSmokeVerdict;
    } | undefined;
  } = {},
): PublishReport {
  // Decide ONCE, before the batch: `--provenance` in an incapable environment must fail here, not on
  // package 7 of 45 (recalled lesson: a failed publish that retries with a bump orphans version numbers).
  const publishCmd = publishArgv(opts.provenance ?? 'auto', process.env);
  const exec = opts.exec ?? execSync;
  const probe = opts.probe ?? ((name: string, version: string) => probeVersion(name, version, exec));
  const sleep = opts.sleep ?? ((milliseconds: number): void => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
  });

  if (opts.filter?.some((filter) => filter.length === 0)) {
    throw new Error('publish: --filter requires non-empty package-name substrings (empty would match ALL packages)');
  }

  const packages = discoverPackages(monorepoRoot);
  const results: PublishResult[] = [];
  const registryProbes = new Map<string, RegistryProbe>();
  const matching = opts.filter && opts.filter.length > 0
    ? packages.filter((p) => opts.filter!.some((f) => matchesPublishFilter(p, f, monorepoRoot)))
    : packages;
  const filtered = opts.targetNames === undefined
    ? matching
    : matching.filter((p) => opts.targetNames!.includes(p.name));
  // Publish dependencies before dependents so pnpm rewrites workspace:* to the
  // freshly-bumped version, never a stale one (the harness-cli@0.3.122 breakage).
  const ordered = orderByDependencies(filtered);

  // Workspace-floor preflight inputs: the full workspace version map (what pnpm would pack each
  // floor from), and the names whose publish has LANDED so far in this run — grown as the loop
  // proceeds, never assumed from batch membership (Codex P1: a sibling that failed its own gates
  // has no published floor, and static membership would still have covered its dependents).
  const workspaceVersions = new Map(packages.map((p) => [p.name, p.version]));
  const landedInBatch = new Set<string>();
  const failedInBatch = new Set<string>();
  const armFloorPreflight = opts.bumpOnly !== true && (opts.dryRun !== true || opts.probeFloor !== undefined);
  const probeFloor = opts.probeFloor ?? ((name: string, version: string) => probeVersion(name, version).ok);

  // AM-1 (packedTransport): sibling pins for the packing-only rewrite, updated to each package's
  // NEW version the moment its OWN bump lands — a dependent packed LATER in this same batch must
  // pin to what its dependency will actually ship, not the stale value captured before the loop
  // (mirrors what a real `pnpm pack` reads: the dependency's on-disk package.json, already bumped).
  const pinVersions = new Map(workspaceVersions);
  interface PendingPacked {
    readonly name: string;
    readonly dir: string;
    readonly oldVersion: string;
    readonly newVersion: string;
    readonly tgzPath: string;
    readonly sha256: string;
    readonly pkgJsonPath: string;
    readonly originalPkgJson: string;
    readonly readmePath: string;
    readonly originalReadme: string | undefined;
    readonly claimCheckSummary: { findings: number; high: number } | undefined;
    /** FR-3 (fix-round 1): carried through the two-pass packed transport so the readme-sync report
     *  reaches the FINAL 'published'/'error' result too — not only the pass-1 optimistic entry. */
    readonly readmeSyncSummary: PublishResult['readmeSync'];
  }
  const pendingPacked: PendingPacked[] = [];

  /**
   * The registry receipt-probe loop, factored out so the packedTransport pass (below) reuses it
   * identically to the existing per-package publish path — including the "no receipt is not
   * success" throw itself, so there is exactly ONE place in this file that decides that.
   */
  function confirmPublished(name: string, version: string, probeLog: ProbeOutcome[]): { registryProbes: number } {
    let registryProbes = 0;
    let confirmed = false;
    while (registryProbes < REGISTRY_PROBE_BUDGET) {
      registryProbes++;
      const probed = probe(name, version);
      const outcome: Omit<ProbeOutcome, 'attempt'> = typeof probed === 'boolean'
        ? { ok: probed, stdout: '', stderr: '', code: null, ms: 0 }
        : probed;
      probeLog.push({ attempt: registryProbes, ...outcome });
      if (outcome.ok) {
        confirmed = true;
        break;
      }
      if (registryProbes < REGISTRY_PROBE_BUDGET) sleep(REGISTRY_PROBE_INTERVAL_MS);
    }
    if (!confirmed) {
      const last = probeLog[probeLog.length - 1]!;
      const output = last.stderr || last.stdout;
      const firstLine = output.split(/\r?\n/, 1)[0]?.trim() || '(empty)';
      throw new Error(
        `registry did not confirm ${name}@${version} after ${registryProbes} probes ` +
        `(${Math.round(registryProbes * REGISTRY_PROBE_INTERVAL_MS / 60_000)} min); ` +
        `last probe: code ${String(last.code)}, ${last.ms}ms, ${firstLine}`,
      );
    }
    return { registryProbes };
  }

  function sha256File(path: string): string {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  }

  for (const pkg of ordered) {
    const oldVersion = pkg.version;
    const pkgJsonPath = join(pkg.dir, 'package.json');
    const originalPkgJson = readFileSync(pkgJsonPath, 'utf-8');
    const manifest = JSON.parse(originalPkgJson) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };
    const workspaceDependencies = [
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ];
    const failedDependency = workspaceDependencies.find((dep) => failedInBatch.has(dep));
    if (failedDependency !== undefined) {
      const reason = results.find((result) => result.name === failedDependency && result.status === 'error')?.error
        ?? 'unknown error';
      const failedVersion = workspaceVersions.get(failedDependency);
      const floor = failedVersion === undefined ? '' : `; failed workspace floor ${failedDependency}@${failedVersion}`;
      results.push({
        name: pkg.name,
        oldVersion,
        newVersion: oldVersion,
        status: 'error',
        error: `dependency ${failedDependency} failed in this batch: ${reason}${floor}`,
      });
      failedInBatch.add(pkg.name);
      continue;
    }
    // Both modes establish registry state before planning: absence keeps the disk version,
    // uncertainty refuses a bump, and an existing release bumps from max(local, published).
    const registryProbe = probeRegistry(pkg.name, exec);
    registryProbes.set(pkg.name, registryProbe);
    if (registryProbe.kind === 'unknown') {
      results.push({
        name: pkg.name, oldVersion, newVersion: oldVersion,
        status: opts.dryRun ? 'skipped' : 'error',
        probe: 'unknown',
        error: opts.dryRun
          ? `NOT ESTABLISHED (registry unreachable: ${registryProbe.reason})`
          : `registry unreachable: ${registryProbe.reason} — cannot tell "never published" from "offline"; not bumping blind`,
      });
      if (!opts.dryRun) failedInBatch.add(pkg.name);
      continue;
    }
    const plan = {
      base: registryProbe.kind === 'published' && compareVersions(registryProbe.version, oldVersion) > 0
        ? registryProbe.version : oldVersion,
      firstPublish: registryProbe.kind === 'never-published',
      probe: registryProbe.kind,
    };
    const newVersion = plan.firstPublish ? oldVersion : bumpPatch(plan.base);

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
      failedInBatch.add(pkg.name);
      continue;
    }

    // Workspace-floor preflight (Codex P1, feature workspace-dep-protocol): a `workspace:^` dep
    // packs to `^<sibling's DISK version>` — refuse if that floor is neither in this batch nor on
    // the registry, or the publish succeeds and every consumer install dies with ETARGET.
    if (armFloorPreflight) {
      const unpublishedFloors = findUnpublishedWorkspaceFloors({ dependencies: manifest.dependencies, peerDependencies: manifest.peerDependencies, workspaceVersions, batch: landedInBatch, probe: probeFloor });
      if (unpublishedFloors.length > 0) {
        results.push({
          name: pkg.name,
          oldVersion,
          newVersion,
          status: 'error',
          error: `workspace floor(s) not published: ${unpublishedFloors.map((f) => `${f.name}@${f.version}`).join(', ')}. Publish the sibling(s) first or include them in --filter — a staged disk version is not a shipped one.`,
        });
        failedInBatch.add(pkg.name);
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
            failedInBatch.add(pkg.name);
            continue;
          }
        } catch {
          /* unreadable README never blocks the gate itself */
        }
      }
    }

    // FR-3 (feature publish-readme-stamp-scope): preview the README sync BEFORE the dry-run
    // short-circuit, so `--dry-run` shows what the live sync would do — never silent about it, the
    // same reasoning as the claim-check gate just above. Reading the README never blocks publish;
    // an unreadable README simply carries no readmeSync summary.
    let readmeSyncSummary: PublishResult['readmeSync'];
    try {
      const readmePath = join(pkg.dir, 'README.md');
      if (existsSync(readmePath)) {
        const text = readFileSync(readmePath, 'utf-8');
        const plan = planReadmeVersionSync(text, oldVersion, newVersion);
        readmeSyncSummary = {
          rewrittenLines: plan.rewritten.length,
          lines: plan.rewritten.map((r) => r.line),
          skippedHistorical: plan.skippedHistorical,
          historyLines: plan.historyLines,
        };
      }
    } catch {
      /* unreadable README never blocks publish or this preview */
    }

    if (opts.dryRun) {
      // NOT a statement that the package would publish cleanly — only that the gates checked ABOVE
      // this line passed. Everything below it (build, re-sign, pack, the package's own
      // `prepublishOnly`, the registry's publish receipt) is untouched by a dry run and named as such.
      const NOT_VERIFIED_BY_DRY_RUN = Object.freeze([
        'prepublishOnly пакета (его собственный гейт публикации)',
        'сборка dist из исходников',
        'пере-подпись манифеста после бампа',
        'содержимое тарбола (npm pack)',
        'ответ реестра npm',
      ]);
      results.push({
        name: pkg.name, oldVersion, newVersion, status: 'skipped',
        claimCheck: claimCheckSummary,
        readmeSync: readmeSyncSummary,
        notVerified: NOT_VERIFIED_BY_DRY_RUN,
      });
      landedInBatch.add(pkg.name);
      continue;
    }

    let originalReadme: string | undefined;
    const probeLog: ProbeOutcome[] = [];
    try {
      // Bump version in package.json
      writeFileSync(pkgJsonPath, originalPkgJson.replace(`"version": "${oldVersion}"`, `"version": "${newVersion}"`));
      // Keep the package's README version footer in lock-step with the bump, so the version
      // shown on npmjs.com always matches the published package (no more manual off-by-one).
      originalReadme = syncReadmeVersion(pkg.dir, oldVersion, newVersion);

      if (opts.bumpOnly) {
        // FR-3 fix-round 1 (Codex HIGH): the readme-sync summary was previously attached only to the
        // dry-run and main-live paths — --bump-only silently omitted it even though `syncReadmeVersion`
        // just ran two lines above. Reuse the SAME preview computed before the dry-run branch: it is a
        // pure function of the same pre-sync text and the same old/new versions, so it already
        // describes exactly what the write above just did.
        results.push({ name: pkg.name, oldVersion, newVersion, status: 'published', claimCheck: claimCheckSummary, readmeSync: readmeSyncSummary });
        continue;
      }

      // Build if has build script
      if (manifest.scripts?.['build']) {
        const buildOptions = { cwd: pkg.dir, stdio: 'pipe' as const, encoding: 'utf-8' as const };
        if (opts.exec) opts.exec('pnpm build', buildOptions);
        else execSync('pnpm build', buildOptions);
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
        failedInBatch.add(pkg.name);
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
          failedInBatch.add(pkg.name);
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
          failedInBatch.add(pkg.name);
          try { writeFileSync(pkgJsonPath, originalPkgJson); } catch { /* best-effort restore */ }
          if (originalReadme !== undefined) {
            try { writeFileSync(pathJoin(pkg.dir, 'README.md'), originalReadme); } catch { /* best-effort restore */ }
          }
          continue;
        }
      }

      if (opts.packedTransport !== undefined) {
        // AM-1: pack ONCE, from a package.json whose workspace: specs are already resolved to each
        // sibling's PINNED version — the SAME transformation `rewriteWorkspaceSpecs` performs — so
        // the tarball about to be smoked is exactly what `npm publish <tgzPath>` ships. Lifecycle
        // scripts already ran during the `build` step above; `prepublishOnly` is dropped here to
        // mirror what pnpm itself strips at pack time (the manifest-freshness guard, cli.ts, does
        // the identical transformation for verification — this is that same convention, now used
        // to actually PRODUCE the artifact rather than merely check one).
        const bumpedText = readFileSync(pkgJsonPath, 'utf-8'); // already carries newVersion
        const rewritten = JSON.parse(rewriteWorkspaceSpecs(bumpedText, pinVersions)) as Record<string, unknown>;
        const scripts = rewritten['scripts'];
        if (scripts !== null && typeof scripts === 'object' && !Array.isArray(scripts)) {
          delete (scripts as Record<string, unknown>)['prepublishOnly'];
        }
        const stagedText = JSON.stringify(rewritten, null, 2) + '\n';
        let tgzPath: string;
        let digest: string;
        writeFileSync(pkgJsonPath, stagedText);
        try {
          const packOptions = { cwd: pkg.dir, stdio: 'pipe' as const, encoding: 'utf-8' as const };
          if (opts.exec) opts.exec(`npm pack . --pack-destination ${JSON.stringify(opts.packedTransport.packDestDir)}`, packOptions);
          else execSync(`npm pack . --pack-destination ${JSON.stringify(opts.packedTransport.packDestDir)}`, packOptions);
          tgzPath = join(opts.packedTransport.packDestDir, packedTarballName(pkg.name, newVersion));
          digest = sha256File(tgzPath);
        } finally {
          // The COMMITTED tree keeps `workspace:` specs (only the version bump is meant to stick) —
          // the rewrite above is packing-only and is undone here regardless of pack's outcome.
          writeFileSync(pkgJsonPath, bumpedText);
        }
        pendingPacked.push({
          name: pkg.name,
          dir: pkg.dir,
          oldVersion,
          newVersion,
          tgzPath,
          sha256: digest,
          pkgJsonPath,
          originalPkgJson,
          readmePath: pathJoin(pkg.dir, 'README.md'),
          originalReadme,
          claimCheckSummary,
          readmeSyncSummary,
        });
        pinVersions.set(pkg.name, newVersion);
        // Optimistic, mirroring the dry-run branch above: this package WILL land once the
        // batch-wide smoke (after the loop) passes — a dependent packed later in this same batch
        // must not re-probe its floor on the registry for an artifact that simply hasn't
        // published YET (a staged disk version is not a shipped one — but a PACKED one, pending a
        // batch-wide smoke that the dependent itself is also waiting on, is not "unpublished" in
        // the sense this preflight polices). Corrected back to `failedInBatch` after the loop if
        // the smoke actually rejects the batch.
        landedInBatch.add(pkg.name);
        continue;
      }

      // Publish
      const publishOptions = {
        cwd: pkg.dir,
        stdio: 'pipe' as const,
        encoding: 'utf-8' as const,
        env: { ...process.env },
      };
      if (opts.exec) opts.exec(publishCmd, publishOptions);
      else execSync(publishCmd, publishOptions);

      const { registryProbes } = confirmPublished(pkg.name, newVersion, probeLog);

      results.push({ name: pkg.name, oldVersion, newVersion, status: 'published', registryProbes, probeLog, claimCheck: claimCheckSummary, readmeSync: readmeSyncSummary });
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
        ...(probeLog.length > 0 ? { probeLog } : {}),
        claimCheck: claimCheckSummary,
      });
      failedInBatch.add(pkg.name);
    }
  }

  // AM-1 (packedTransport, pass 2): every packable package in the batch has now been bumped,
  // built, signed and packed into a real tarball — nothing has been published yet. Judge the
  // WHOLE batch together (the packed-install smoke needs every batch tarball installed at once,
  // exactly like a fresh user would receive them) BEFORE any of them ships.
  if (opts.packedTransport !== undefined && pendingPacked.length > 0) {
    // Lead edit after Codex re-review (finding 1): the transport is ONE transaction — a batch that
    // lost any package before packing (an earlier error) is never smoked or published partially, and
    // a smoke that THROWS rolls every pending package back exactly like a failed verdict.
    const rollbackAll = (reason: string): void => {
      for (const p of pendingPacked) {
        try { writeFileSync(p.pkgJsonPath, p.originalPkgJson); } catch { /* best-effort restore */ }
        if (p.originalReadme !== undefined) {
          try { writeFileSync(p.readmePath, p.originalReadme); } catch { /* best-effort restore */ }
        }
        results.push({
          name: p.name, oldVersion: p.oldVersion, newVersion: p.newVersion, status: 'error',
          error: reason, claimCheck: p.claimCheckSummary,
        });
        failedInBatch.add(p.name);
        landedInBatch.delete(p.name);
      }
      pendingPacked.length = 0;
    };
    if (failedInBatch.size > 0) {
      rollbackAll(`batch incomplete before smoke (${[...failedInBatch].join(', ')} failed earlier) — nothing published`);
    }
    let smokeVerdict: { ok: boolean; reason?: string | undefined } = { ok: false, reason: 'smoke did not run' };
    if (pendingPacked.length > 0) {
      try {
        smokeVerdict = opts.packedTransport.smoke(
          pendingPacked.map((p) => ({ name: p.name, newVersion: p.newVersion, tgzPath: p.tgzPath, sha256: p.sha256 })),
        );
      } catch (err) {
        smokeVerdict = { ok: false, reason: `smoke threw: ${formatPublishError(err)}` };
      }
    }
    if (pendingPacked.length === 0) {
      /* already rolled back above */
    } else if (!smokeVerdict.ok) {
      for (const p of pendingPacked) {
        try { writeFileSync(p.pkgJsonPath, p.originalPkgJson); } catch { /* best-effort restore */ }
        if (p.originalReadme !== undefined) {
          try { writeFileSync(p.readmePath, p.originalReadme); } catch { /* best-effort restore */ }
        }
        results.push({
          name: p.name,
          oldVersion: p.oldVersion,
          newVersion: p.newVersion,
          status: 'error',
          error: `packed install smoke failed: ${smokeVerdict.reason ?? '(no detail)'}`,
          claimCheck: p.claimCheckSummary,
        });
        failedInBatch.add(p.name);
        landedInBatch.delete(p.name); // correct the pass-1 optimistic assumption
      }
    } else {
      let transportFailed = false;
      for (const p of pendingPacked) {
        const probeLog: ProbeOutcome[] = [];
        // Lead edit after Codex re-review (finding 2): after the first transport/receipt failure the
        // REST of the batch is not published — a dependant must never land on top of a failed sibling.
        if (transportFailed) {
          try { writeFileSync(p.pkgJsonPath, p.originalPkgJson); } catch { /* best-effort restore */ }
          if (p.originalReadme !== undefined) {
            try { writeFileSync(p.readmePath, p.originalReadme); } catch { /* best-effort restore */ }
          }
          results.push({
            name: p.name, oldVersion: p.oldVersion, newVersion: p.newVersion, status: 'error',
            error: 'skipped: an earlier package in this batch failed to publish — dependants are not published on top of a failed sibling',
            claimCheck: p.claimCheckSummary,
          });
          failedInBatch.add(p.name);
          landedInBatch.delete(p.name);
          continue;
        }
        try {
          // Defends the "same bytes" claim against anything that could touch the tarball between
          // the pack step and this publish call (AM-1: "a digest mismatch between smoke and
          // publish is BLOCKED", made a real, checked code path rather than an architectural
          // argument that the two steps happen to read the same file).
          const currentDigest = sha256File(p.tgzPath);
          if (currentDigest !== p.sha256) {
            throw new Error(
              `tarball digest changed between smoke and publish for ${p.name}@${p.newVersion} ` +
              `(smoked ${p.sha256}, about to publish ${currentDigest}) — refusing`,
            );
          }
          const publishOptions = { cwd: p.dir, stdio: 'pipe' as const, encoding: 'utf-8' as const, env: { ...process.env } };
          const npmPublishCmd = `npm publish ${JSON.stringify(p.tgzPath)} --access public${publishCmd.includes('--provenance') ? ' --provenance' : ''}`;
          if (opts.exec) opts.exec(npmPublishCmd, publishOptions);
          else execSync(npmPublishCmd, publishOptions);

          const { registryProbes } = confirmPublished(p.name, p.newVersion, probeLog);
          results.push({
            name: p.name, oldVersion: p.oldVersion, newVersion: p.newVersion, status: 'published',
            registryProbes, probeLog, claimCheck: p.claimCheckSummary, sha256: p.sha256,
            readmeSync: p.readmeSyncSummary, // FR-3 fix-round 1: the third publish path that was silent
          });
          // landedInBatch already carries p.name from pass 1 (optimistic) — now confirmed for real.
        } catch (err) {
          try { writeFileSync(p.pkgJsonPath, p.originalPkgJson); } catch { /* best-effort restore */ }
          if (p.originalReadme !== undefined) {
            try { writeFileSync(p.readmePath, p.originalReadme); } catch { /* best-effort restore */ }
          }
          results.push({
            name: p.name, oldVersion: p.oldVersion, newVersion: p.newVersion, status: 'error',
            error: formatPublishError(err), ...(probeLog.length > 0 ? { probeLog } : {}), claimCheck: p.claimCheckSummary,
          });
          failedInBatch.add(p.name);
          landedInBatch.delete(p.name);
          transportFailed = true;
        }
      }
    }
  }

  const releaseLineSynced: string[] = [];
  const releaseLineReport: ReleaseLineReport[] = [];
  const warnings: string[] = [];
  const versions: Record<string, string> = {};
  for (const result of results.filter((result) => result.status === 'published')) {
    versions[shortPackageName(result.name)] = result.newVersion;
  }
  // Dry-run marks would-publish packages skipped, but records successful planning in landedInBatch.
  const planned: Record<string, string> = opts.dryRun === true ? {} : versions;
  if (opts.dryRun === true) {
    for (const result of results) {
      if (landedInBatch.has(result.name) && result.error === undefined) {
        planned[shortPackageName(result.name)] = result.newVersion;
      }
    }
  }
  const syncReleaseLine = Object.keys(versions).length > 0 && opts.dryRun !== true && opts.bumpOnly !== true;
  if (Object.keys(planned).length > 0 && opts.bumpOnly !== true) {
    const readmes = [
      { path: 'README.md', absolute: pathJoin(monorepoRoot, 'README.md') },
      {
        path: 'packages/@dzhechkov/harness-cli/README.md',
        absolute: pathJoin(monorepoRoot, 'packages', '@dzhechkov', 'harness-cli', 'README.md'),
      },
    ] as const;
    for (const readme of readmes) {
      try {
        const original = readFileSync(readme.absolute, 'utf8');
        const found = findReleaseLine(original);
        if (found === null) {
          // A repo without a joint release line is the NORMAL case for every consumer monorepo —
          // only a run that was actually about to WRITE has something to report here. The report-only
          // pass (dry-run) records an empty plan and says nothing, which is what keeps `dz publish`'s
          // output free of the word the FR-11 proxy watches for (cli.test.ts, "independent of the
          // release feature"). MEASURED 2026-09-22: widening the gate without this made every dry-run
          // in a line-less repo print a release-line warning.
          if (syncReleaseLine) warnings.push(`release-line sync skipped ${readme.path}: release line not found`);
          continue;
        }
        const rewritten: { name: string; from: string; to: string }[] = [];
        const kept: { name: string; version: string }[] = [];
        for (const token of found.tokens) {
          if (Object.hasOwn(planned, token.name) && planned[token.name] !== token.version) {
            rewritten.push({ name: token.name, from: token.version, to: planned[token.name]! });
          } else {
            kept.push({ name: token.name, version: token.version });
          }
        }
        releaseLineReport.push({ path: readme.path, rewritten, kept, wrapped: found.wrapped });
        const updated = rewriteReleaseLine(original, planned);
        if (!syncReleaseLine || updated === null || updated === original) continue;
        const tmp = readme.absolute + '.sync-tmp';
        writeFileSync(tmp, updated);
        renameSync(tmp, readme.absolute);
        releaseLineSynced.push(readme.path);
      } catch (error) {
        // Same rule as the not-found branch above: only the pass that was actually going to WRITE
        // reports. A README that does not exist at all is the normal state of a consumer monorepo,
        // and a report-only pass must not turn that into a warning naming the release line
        // (FR-11 proxy, harness-cli/test/cli.test.ts — MEASURED 2026-09-22: ENOENT on both READMEs
        // of a tmp fixture made every dry-run print two release-line warnings).
        if (syncReleaseLine) warnings.push(`release-line sync failed ${readme.path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    // Decorate every final path, including packed transport and gate failures. A dependency
    // blocked before its own probe has unknown registry state; keep the deps-first short circuit.
    packages: results.map((result) => {
      const registryProbe = registryProbes.get(result.name);
      return {
        ...result,
        probe: registryProbe?.kind ?? 'unknown',
        ...(registryProbe?.kind === 'never-published' ? { firstPublish: true } : {}),
        ...(registryProbe?.scripted === true ? { probeOverride: true } : {}),
      };
    }),
    published: results.filter((r) => r.status === 'published').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    errors: results.filter((r) => r.status === 'error').length,
    dryRun: opts.dryRun === true,
    releaseLineSynced,
    releaseLineReport,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}
