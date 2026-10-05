/**
 * Sibling-drift gate — feature `publish-sibling-drift-gate`, ADR-001 (Decision 1).
 *
 * `rewriteWorkspaceSpecs` (publish.ts) pins a sibling `workspace:^`/`workspace:~`/`workspace:*`
 * dependency to the EXACT version currently on disk. That version may be published on the
 * registry carrying an OLDER build than the workspace — the sibling changed without a version
 * bump. The pinned range then resolves at install time to a package that does not match the
 * workspace's current behavior, and a fresh `npm install` reproduces whatever regressed.
 *
 * Detection (ADR-001, Decision 1, alternative А3 — accepted): hash every file under the
 * published tarball's `dist/**` plus its `package.json` (with `version`/`gitHead`/`_*` fields
 * stripped, since those legitimately differ between the registry copy and the workspace copy),
 * and compare against the same hash of the workspace copy. Any difference is drift. A published
 * `dist/index.js` missing an export the workspace's `dist/index.js` declares is surfaced as a
 * SECOND, more readable signal (`missingExports`) — the exact shape of the 2026-09-13 incident
 * ("does not provide an export named …") — but the hash comparison is the load-bearing check:
 * it also catches behavior changes that keep every export name intact.
 *
 * Network access is NOT this module's concern (NFR-2: pure, no network, fixture-testable):
 * `fetchPublished` is injected. The CLI implementation packs the sibling from the registry via
 * `npm pack <name>@<version>` into a temp dir; tests inject a local directory. A fetch that
 * returns `null` (offline, 404, timeout) is reported as `'unavailable'` — never silently treated
 * as `'same'` (the "a gate that infers a pass from silence breaks on the next failure path"
 * lesson): the caller decides whether `'unavailable'` blocks or is overridden.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, isAbsolute } from 'node:path';
import { judgeReleaseCohortAudit } from './release-package-audit.js';
import { rewriteWorkspaceSpecs } from './pack-artifact.js';
import { hashPackBytes, verifyManifest, isSafeManifestPath, type SignedManifest } from './sign.js';

export type SiblingDriftStatus = 'same' | 'drift' | 'unavailable';

/**
 * AM-6 (feature publish-gate-audit-durable): which mechanism produced BOTH sides' file inventory
 * for this comparison — named on every result, never left implicit. `'npm-pack'`: the caller
 * injected {@link DetectSiblingDriftOptions.localInventory} (the CLI's `npm pack --dry-run --json`
 * via {@link parseNpmPackInventory}); the workspace side is exactly what npm will ship, and the
 * published side is hashed by a FULL recursive walk of the already-unpacked tarball (AM-1 — the
 * two sides must be symmetric: "every file npm put there" on one side, "every file npm will put
 * there" on the other). `'readdir-approximation'`: no provider was injected — BOTH sides fall back
 * to the pre-existing `dist`/`files`/`bin` walk ({@link shippedInventoryDirs}), which stays
 * symmetric by construction (same function, same rules, both sides) but can miss a file
 * `.npmignore` excludes or include one npm would never ship.
 */
export type InventorySource = 'pack-artifact' | 'npm-pack' | 'pnpm-pack' | 'readdir-approximation';

export interface SiblingDriftResult {
  readonly name: string;
  readonly version: string;
  readonly status: SiblingDriftStatus;
  /** Relative paths (dist/** or package.json) whose hash differs, or is present on only one side. */
  readonly changedFiles: readonly string[];
  /** Export names the workspace's dist/index.js declares that the published one lacks (А2, secondary signal). */
  readonly missingExports: readonly string[];
  /** Unavailable reason or diagnostic for a verified/declined owner-branding comparison. */
  readonly reason?: string;
  /**
   * AM-6: named per-result (not merely per-call) because `detectSiblingDrift` short-circuits to
   * `'unavailable'` before ever reaching the hashing step for some entries — those still carry the
   * source that WOULD have been used, so a reader never has to guess.
   */
  readonly inventorySource: InventorySource;
  /** Verified directional policy class; SAME here does not mean byte-identical. */
  readonly classification?: 'owner-branding-only' | 'retained-registered-binding';
}

export interface FetchedPublished {
  /** Directory holding the extracted published tarball (contains dist/, package.json). */
  readonly dir: string;
}

/** Fetch the published build of `name@version`. `null` = unavailable (network/404/timeout). */
export type FetchPublished = (name: string, version: string) => FetchedPublished | null;

export interface DetectSiblingDriftOptions {
  readonly dependencies: Record<string, string> | undefined;
  /** pnpm rewrites `workspace:` in peerDependencies too (mirrors findUnpublishedWorkspaceFloors). */
  readonly peerDependencies?: Record<string, string> | undefined;
  /** AM-3: ships and pins exactly like `dependencies` — checked the same way. */
  readonly optionalDependencies?: Record<string, string> | undefined;
  /** name -> version on DISK, for every package in the workspace. */
  readonly workspaceVersions: ReadonlyMap<string, string>;
  /** name -> absolute package dir on disk, for every package in the workspace. */
  readonly workspaceDirs: ReadonlyMap<string, string>;
  /** Names being published in THIS batch — they publish fresh, so drift cannot be measured against them. */
  readonly batch: ReadonlySet<string>;
  readonly fetchPublished: FetchPublished;
  /**
   * FR-3 (feature publish-gate-audit-durable): the LOCAL (workspace) package's shipped-file
   * inventory, asked from npm instead of approximated by walking `dist`/`files`/`bin` by hand —
   * `.npmignore` and nested ignore rules make the hand-rolled walk wrong in both directions (a file
   * npm will never ship can still be read off disk, producing a false drift). No production default
   * lives in THIS module — core stays pure (never spawns `npm`, per the core-boundary import
   * ratchet). The CLI runs `npm pack --dry-run --json` and hands the stdout to
   * {@link parseNpmPackInventory}, then passes the resulting closure here; a caller that injects
   * nothing (`undefined`) makes `detectSiblingDrift` fall back to the named
   * `'readdir-approximation'` {@link InventorySource} on BOTH sides (AM-1) — never a silent "no
   * drift".
   */
  readonly localInventory?: LocalInventory;
  /** Label for the injected provider (default 'npm-pack'); CLI uses 'pack-artifact'. */
  readonly localInventorySource?: InventorySource;
  /** Repository trust root, supplied externally; never read from either artifact. */
  readonly trustedPublicKeyPem?: string;
  /** Structural validation seam only; normal CLI additionally requires its completed invocation-owned object. */
  readonly retainedBindingProof?: {
    readonly version: 1; readonly phase: 'preview' | 'final'; readonly batch: readonly string[];
    readonly head: string; readonly refs: readonly { ref: string; oid: string }[];
    readonly workspaceVersions: readonly (readonly [string, string])[];
    readonly adapters: Readonly<Record<string, {
      sourceSha256: string; localTreeSha256: string; registryTreeSha256: string; registryIntegrity: string;
      version: string; localFloor: string; registeredFloor: string; creation: string;
      history: readonly { oid: string; blob: string | null; literal: string | null; boundary: boolean }[];
    }>>;
    readonly baseline: { roots: Parameters<typeof judgeReleaseCohortAudit>[0]; evidence: unknown };
    readonly candidate: { roots: Parameters<typeof judgeReleaseCohortAudit>[0]; evidence: unknown };
    readonly digest: string;
  };

}

function listFilesRecursive(root: string, dir: string, strictPacked = false): string[] {
  try {
    if (!existsSync(dir)) { if (strictPacked) throw new InventoryListingError('missing packed tree'); return []; }
    if (strictPacked && !lstatSync(dir).isDirectory()) throw new InventoryListingError('packed directory is a symlink or unsupported entry');
    const out: string[] = []; const seen = new Set<string>();
    for (const entry of readdirSync(dir).sort()) {
      const abs = join(dir, entry); const path = relative(root, abs);
      const st = strictPacked ? lstatSync(abs) : statSync(abs);
      if (strictPacked) {
        if (!isSafeManifestPath(path) || seen.has(path.toLowerCase())) throw new InventoryListingError('noncanonical or aliased packed path: ' + path);
        seen.add(path.toLowerCase());
        if (!st.isDirectory() && !st.isFile()) throw new InventoryListingError('symlink or special packed entry: ' + path);
      }
      if (st.isDirectory()) out.push(...listFilesRecursive(root, abs, strictPacked));
      else out.push(path);
    }
    return out;
  } catch (error) {
    if (strictPacked && !(error instanceof InventoryListingError)) throw new InventoryListingError('physical packed inventory unreadable: ' + String(error));
    throw error;
  }
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

// ── FR-3 (feature publish-gate-audit-durable): ask npm, don't approximate ──────────────────────

/** The exact set of relative paths `npm pack` will ship for a package — no `.npmignore` guessing. */
export interface PackInventory {
  readonly paths: readonly string[];
}

/** `npm pack --dry-run --json` could not be run or answered in a shape this code cannot use. */
export interface PackInventoryUnavailable {
  readonly unavailable: string;
}

/**
 * Lead fix after the fix-round's live dry-run (2026-09-14 01:02): the workspace side PACKED BY THE
 * LIVE TRANSPORT (`pnpm pack`) and unpacked into `packedDir`. pnpm synthesises a LICENSE from the
 * workspace root into the tarball of a package whose own tree has none; `npm pack --dry-run --json`
 * never lists that file, so a `paths` inventory read every such sibling as "LICENSE only in the
 * published copy" — 2 false drifts (harness-presets, scout) on a tree unchanged since publication.
 * A packed tree is hashed by the SAME full walk as the published side, symmetric by construction.
 */
export interface PackedTree {
  readonly packedDir: string;
  /** Exact files from packArtifact().files; old providers may omit this. */
  readonly paths?: readonly string[];
}

export type LocalInventoryResult = PackInventory | PackedTree | PackInventoryUnavailable;

/** Ask what npm would ship for the package rooted at `dir`. Injected in tests (no subprocess). */
export type LocalInventory = (dir: string) => LocalInventoryResult;

/**
 * C-1/AM-4: `npm pack --dry-run --json` is a real subprocess call — the CLI caches its result per
 * absolute directory for the lifetime of ONE `dz publish` run (not per package being checked), so
 * a run that checks the same sibling from more than one dependent package packs it only once. Core
 * itself never runs the subprocess or owns the cache (core-boundary import ratchet) — this parser
 * is the pure half only.
 *
 * Parses `npm pack --dry-run --json`'s stdout (an array with one element; `files[]` holds
 * `{path,size,mode}` per shipped path, plus `integrity`/`shasum`/`entryCount`) into the exact set of
 * relative paths npm intends to ship, honouring `.npmignore`/`files`/default-ignore exactly the way
 * a real `npm publish` would. A failure to run, parse, or make sense of the shape — including a
 * malformed individual `files[]` element (AM-5: a corrupt entry is a reason to say the WHOLE
 * inventory is untrustworthy, never a file to silently drop) — is `{ unavailable: reason }`: an
 * input this gate cannot read is a reason to say so, never a silent "nothing to compare".
 */
export function parseNpmPackInventory(stdout: string): LocalInventoryResult {
  try {
    const parsed: unknown = JSON.parse(stdout);
    const entry = Array.isArray(parsed) ? (parsed[0] as unknown) : undefined;
    const files = entry !== null && typeof entry === 'object' ? (entry as Record<string, unknown>)['files'] : undefined;
    if (!Array.isArray(files)) return { unavailable: 'npm pack --dry-run --json returned no files[] array' };
    // AM-5 (Codex round-1 finding 6, medium): a malformed element used to be `.filter()`ed out
    // silently — a `files[]` entry npm itself always shapes as `{path,size,mode}` should never fail
    // to parse; if one DOES (missing/non-string `path`, or a non-object element), that is a signal
    // this output cannot be trusted, not a single file to quietly drop from the comparison. Say so.
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f === null || typeof f !== 'object') {
        return { unavailable: `npm pack --dry-run --json files[${i}] is not an object (got ${JSON.stringify(f)})` };
      }
      const path = (f as Record<string, unknown>)['path'];
      if (typeof path !== 'string' || path === '') {
        return { unavailable: `npm pack --dry-run --json files[${i}].path is missing or not a non-empty string (got ${JSON.stringify(path)})` };
      }
      paths.push(path);
    }
    return { paths };
  } catch (err) {
    return { unavailable: `npm pack --dry-run --json output could not be parsed: ${(err as Error).message.split('\n')[0]}` };
  }
}

/** Hash exactly the paths `npm pack` names (package.json normalized separately, as {@link hashTree} does). */
/**
 * Codex round-2 (2026-09-14) new findings 1+2: a listed path that is absent, a directory, absolute,
 * or that climbs out of `dir` via `..` used to be SKIPPED silently — a comparison over a listing
 * the tree does not match is not a comparison, it is `unavailable`; and an inventory must never
 * read outside the package directory. Thrown here, turned into an `unavailable` result by the caller.
 */
class InventoryListingError extends Error {}

function hashTreeFromPaths(dir: string, paths: readonly string[], manifest: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const rel of paths) {
    if (rel === 'package.json') continue; // normalized below, not hashed raw
    if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
      throw new InventoryListingError(`inventory path "${rel}" is absolute or leaves the package directory`);
    }
    const abs = join(dir, rel);
    if (!existsSync(abs)) throw new InventoryListingError(`inventory path "${rel}" does not exist in the workspace copy`);
    if (statSync(abs).isDirectory()) throw new InventoryListingError(`inventory path "${rel}" is a directory, not a file`);
    map.set(rel, sha256(readFileSync(abs)));
  }
  map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
  return map;
}

/**
 * AM-1: hash EVERY file under `dir` (the already-unpacked published tarball) — the literal "full
 * recursive walk of what npm put there" the amendment names, used ONLY as the symmetric partner to
 * {@link hashTreeFromPaths} (i.e. only when a `localInventory` provider is injected). `dir` here is
 * always an extracted tarball, never the workspace tree, so there is no `.npmignore` to consult:
 * everything that exists on disk is, by construction, exactly what npm shipped.
 */
function hashTreeFull(dir: string, manifest: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const rel of listFilesRecursive(dir, dir)) {
    if (rel === 'package.json') continue; // normalized below, not hashed raw
    map.set(rel, sha256(readFileSync(join(dir, rel))));
  }
  map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
  return map;
}

/**
 * package.json PARSED and validated. `null` (never `undefined`) means "this side cannot be built
 * at all" — AM-3: a missing or unparseable manifest on EITHER side must surface as `unavailable`,
 * never as an empty/omitted comparison field that a hash-mismatch loop could silently read as
 * "nothing differs here".
 */
function readManifest(dir: string): Record<string, unknown> | null {
  const p = join(dir, 'package.json');
  if (!existsSync(p)) return null;
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8'));
    return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Readonly exception for two original, fully verified artifact trees. Every other delta refuses. */
function classifyOwnerBrandingDelta(
  localDir: string, registryDir: string, name: string, version: string,
  publicKey: string | undefined, declaredPaths: readonly string[] | undefined, retained?: { localFloor: string; registeredFloor: string },
): { accepted: boolean; coverageVerified: boolean; changedFiles: string[]; reason: string } {
  let coverageVerified = false;
  const decline = (detail: string) => ({ accepted: false, coverageVerified, changedFiles: [], reason: 'owner-branding not proven: ' + detail });
  if (!publicKey) return decline('no trusted external public key');
  try {
    for (const dir of [localDir, registryDir]) {
      for (const path of ['.dz-manifest.json', 'sbom.json', 'package.json', 'README.md']) {
        if (!lstatSync(join(dir, path)).isFile()) return decline('original metadata is not a regular file');
      }
    }
    const localSignedBytes = readFileSync(join(localDir, '.dz-manifest.json'), 'utf8');
    const registrySignedBytes = readFileSync(join(registryDir, '.dz-manifest.json'), 'utf8');
    const localSigned = JSON.parse(localSignedBytes) as SignedManifest;
    const registrySigned = JSON.parse(registrySignedBytes) as SignedManifest;
    // No projected/re-signed object reaches the verifier. Both untouched inventories and SBOMs first.
    if (!verifyManifest(localDir, localSigned, publicKey).ok || !verifyManifest(registryDir, registrySigned, publicKey).ok) return decline('original signature, SBOM or full signed inventory failed verification');
    for (const [signed, bytes] of [[localSigned, localSignedBytes], [registrySigned, registrySignedBytes]] as const) {
      const serializations = [JSON.stringify(signed), JSON.stringify(signed, null, 2)];
      if (!serializations.some(text => bytes === text || bytes === text + '\n')) return decline('manifest serialization has unexplained or ambiguous bytes');
      if (Buffer.from(signed.signature, 'base64').toString('base64') !== signed.signature) return decline('signature encoding is not canonical');
    }
    const paths = listFilesRecursive(localDir, localDir, true).sort();
    const registryPaths = listFilesRecursive(registryDir, registryDir, true).sort();
    if (JSON.stringify(paths) !== JSON.stringify(registryPaths)) return decline('artifact file sets differ');
    if (declaredPaths !== undefined && JSON.stringify([...declaredPaths].sort()) !== JSON.stringify(paths)) return decline('declared packed inventory is incomplete or duplicated');
    // Installed/source verifier exclusions are not packed-artifact signing coverage.
    // Every physical regular leaf is authenticated; only the two validated ROOT metadata files self-exempt.
    for (const [signed, physical] of [[localSigned, paths], [registrySigned, registryPaths]] as const) {
      const signedPaths = signed.manifest.files.map(entry => entry.path).sort();
      if (signedPaths.some(path => !isSafeManifestPath(path) || path === '.dz-manifest.json' || path === 'sbom.json')) return decline('invalid signed leaf or generated-root self-reference');
      const expected = physical.filter(path => path !== '.dz-manifest.json' && path !== 'sbom.json');
      if (JSON.stringify(signedPaths) !== JSON.stringify(expected)) return decline('physical packed leaves are not fully covered by the signed inventory');
    }
    coverageVerified = true;
    const localPkgBytes = readFileSync(join(localDir, 'package.json'));
    const registryPkgBytes = readFileSync(join(registryDir, 'package.json'));
    const localPkg = JSON.parse(localPkgBytes.toString('utf8')) as Record<string, unknown>;
    const registryPkg = JSON.parse(registryPkgBytes.toString('utf8')) as Record<string, unknown>;
    if (localPkg['name'] !== name || registryPkg['name'] !== name || localPkg['version'] !== version || registryPkg['version'] !== version) return decline('package identity/version does not bind both artifacts');
    const source = 'https://github.com/djd1m/dz-harness/tree/main/packages/' + name;
    if (localPkg['homepage'] !== 'https://aicoding.space' || !['https://aicoding.space', source + '#readme'].includes(String(registryPkg['homepage']))) return decline('homepage is not the exact directional owner policy');
    const projectedPkg: Record<string, unknown> = { ...localPkg, homepage: registryPkg['homepage'] };
    if (retained !== undefined) {
      const left = localPkg['dependencies'] as Record<string, unknown> | undefined;
      const right = registryPkg['dependencies'] as Record<string, unknown> | undefined;
      if (!left || !right || left['@dzhechkov/core'] !== retained.localFloor || right['@dzhechkov/core'] !== retained.registeredFloor) return decline('retained exact dependency binding contradicts originals');
      projectedPkg['dependencies'] = { ...left, '@dzhechkov/core': right['@dzhechkov/core'] };
    }

    // Existing v3 canonical handling preserves order-sensitive exports/imports; no dependency values omitted.
    if (hashPackBytes('package.json', Buffer.from(JSON.stringify(projectedPkg))) !== hashPackBytes('package.json', registryPkgBytes)) return decline('packed metadata differs beyond homepage (including dependency values)');
    const stamp = 'Site: https://aicoding.space · Source: ' + source;
    const stripTopStamp = (bytes: Buffer, required: boolean): Buffer | undefined => {
      const text = bytes.toString('utf8'); if (!Buffer.from(text).equals(bytes)) return undefined;
      const lines = text.split('\n');
      const stamps = lines.filter(line => line.startsWith('Site: ') || line.includes(' · Source: '));
      if (stamps.length === 0) return required ? undefined : bytes;
      if (stamps.length !== 1 || !/^# [^\r\n]+$/.test(lines[0] ?? '') || lines[1] !== '' || lines[2] !== stamp || lines[3] !== '') return undefined;
      // Remove only the inserted blank/stamp framing; retain every other byte including trailing newlines.
      return Buffer.from(lines[0] + '\n' + lines.slice(3).join('\n'));
    };
    const localReadme = readFileSync(join(localDir, 'README.md'));
    const registryReadme = readFileSync(join(registryDir, 'README.md'));
    const localRest = stripTopStamp(localReadme, true), registryRest = stripTopStamp(registryReadme, false);
    if (!localRest || !registryRest || !localRest.equals(registryRest)) return decline('README differs beyond the one exact top owner stamp');
    const admitted = new Set<string>();
    if (!localReadme.equals(registryReadme)) admitted.add('README.md');
    if (hashPackBytes('package.json', localPkgBytes, localSigned.manifest.version) !== hashPackBytes('package.json', registryPkgBytes, registrySigned.manifest.version)) admitted.add('package.json');
    if (admitted.size === 0) return decline('no admitted branding leaf changed');
    const canonical = (value: unknown): string => Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : value !== null && typeof value === 'object' ? '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}' : JSON.stringify(value);
    const projectManifest = (signed: SignedManifest) => ({ ...signed, signature: '<verified-original>', manifest: { ...signed.manifest, files: [...signed.manifest.files].sort((a, b) => a.path.localeCompare(b.path)).map(entry => ({ ...entry, sha256: admitted.has(entry.path) ? '<admitted-digest>' : entry.sha256 })) } });
    if (canonical(projectManifest(localSigned)) !== canonical(projectManifest(registrySigned))) return decline('unexplained signed-manifest field or digest change');
    const projectSbom = (dir: string, signed: SignedManifest) => {
      const sbom = JSON.parse(readFileSync(join(dir, 'sbom.json'), 'utf8'));
      for (const component of sbom.components) {
        if (!admitted.has(component.name)) continue;
        const digest = signed.manifest.files.find(entry => entry.path === component.name)?.sha256;
        for (const hash of component.hashes ?? []) if (hash.alg === 'SHA-256' && hash.content === digest) hash.content = '<admitted-digest>';
        for (const prop of component.properties ?? []) if (['dz:canonical-json-sha256-v1', 'dz:canonical-json-sha256-v2'].includes(prop.name) && prop.value === digest) prop.value = '<admitted-digest>';
      }
      return sbom;
    };
    if (canonical(projectSbom(localDir, localSigned)) !== canonical(projectSbom(registryDir, registrySigned))) return decline('unexplained SBOM field or digest change');
    const changedFiles: string[] = [];
    for (const path of paths) {
      const left = readFileSync(join(localDir, path)), right = readFileSync(join(registryDir, path));
      if (left.equals(right)) continue;
      if (!admitted.has(path) && !['.dz-manifest.json', 'sbom.json'].includes(path)) return decline('other shipped bytes changed: ' + path);
      changedFiles.push(path);
    }
    return { accepted: true, coverageVerified, changedFiles, reason: 'owner-branding-only: both original signatures/full inventories verified; exact owner leaves and corresponding manifest/SBOM digests only' };
  } catch { return decline('artifact proof is missing, unreadable or malformed'); }
}

function classifyRetainedBindingDelta(opts: DetectSiblingDriftOptions, localDir: string, registryDir: string, sourceDir: string, name: string, version: string, paths: readonly string[] | undefined): ReturnType<typeof classifyOwnerBrandingDelta> | undefined {
  const proof = opts.retainedBindingProof;
  if (!proof) return undefined;
  const decline = (reason: string) => ({ accepted: false, coverageVerified: true, changedFiles: [], reason: 'retained registered binding not proven: ' + reason });
  try {
    const roots = ['harness-core', 'harness-cli', 'skills-meta', 'keysarium', 'skills-feature-adr'].map(n => '@dzhechkov/' + n).sort();
    const adapters = ['adapter-agents-md', 'adapter-claude', 'adapter-codex', 'adapter-copilot', 'adapter-cursor', 'adapter-gemini', 'adapter-hermes', 'adapter-openclaude', 'adapter-opencode', 'adapter-windsurf'].map(n => '@dzhechkov/' + n).sort();
    if (proof.version !== 1 || !['preview', 'final'].includes(proof.phase) || JSON.stringify([...opts.batch].sort()) !== JSON.stringify(roots) || JSON.stringify([...proof.batch].sort()) !== JSON.stringify(roots) || !adapters.includes(name) || opts.batch.has(name) || JSON.stringify(Object.keys(proof.adapters).sort()) !== JSON.stringify(adapters)) return decline('batch or literal adapter identity differs');
    const canonical = (v: unknown): string => Array.isArray(v) ? '[' + v.map(canonical).join(',') + ']' : v !== null && typeof v === 'object' ? '{' + Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => JSON.stringify(k) + ':' + canonical(value)).join(',') + '}' : JSON.stringify(v);
    const { digest, ...payload } = proof; if (sha256(canonical(payload)) !== digest || !/^[a-f0-9]{40,64}$/.test(proof.head) || proof.refs.length === 0 || proof.refs.some(r => !/^[a-f0-9]{40,64}$/.test(r.oid))) return decline('snapshot/digest incomplete');
    const baselineExecution = proof.baseline.evidence as Record<string, unknown>, candidateExecution = proof.candidate.evidence as Record<string, unknown>;
    if (canonical(baselineExecution.platform) !== canonical(candidateExecution.platform) || baselineExecution.npmVersion !== candidateExecution.npmVersion) return decline('host/npm identity differs across cohorts');
    const baseline = judgeReleaseCohortAudit(proof.baseline.roots, proof.baseline.evidence), candidate = judgeReleaseCohortAudit(proof.candidate.roots, proof.candidate.evidence);
    if (baseline.status !== 'clean' || candidate.status !== 'clean' || !baseline.graph || !candidate.graph) return decline('fresh five-root cohorts are not both clean and complete');
    for (const adapter of adapters) { const fact = proof.adapters[adapter]; if (!fact || ![baseline.graph, candidate.graph].every(graph => graph.some(node => node.name === adapter && !node.selectedRoot && node.installed && node.version === fact.version && node.integrity === fact.registryIntegrity && node.declarations.dependencies?.['@dzhechkov/core'] === fact.registeredFloor && node.edges.some((edge: any) => edge.table === 'dependencies' && edge.name === '@dzhechkov/core' && graph.some(target => target.path === edge.target && !target.selectedRoot && target.version === fact.registeredFloor))))) return decline('all ten registered adapter bindings must occur in both complete graphs'); }
    const project = (graph: readonly Record<string, any>[]) => graph.map(node => {
      if (!node.selectedRoot) return node;
      const expectedPath = 'node_modules/' + node.name; if (node.path !== expectedPath || !roots.includes(node.name)) throw new Error('selected projection is not a root occurrence');
      const declarations = Object.fromEntries(Object.entries(node.declarations).map(([table, values]) => [table, Object.fromEntries(Object.entries(values as Record<string, string>).map(([dep, spec]) => [dep, node.edges.some((edge: any) => edge.table === table && edge.name === dep && edge.target === 'node_modules/' + dep && roots.includes(dep)) ? '<selected-root-step>' : spec]))]));
      return { ...node, version: '<provided-root>', resolved: '<provided-root>', integrity: '<provided-root>', declarations, edges: node.edges.map((edge: any) => ({ ...edge, spec: roots.includes(edge.name) && edge.target === 'node_modules/' + edge.name ? '<selected-root-step>' : edge.spec })) };
    });
    if (canonical(project(baseline.graph)) !== canonical(project(candidate.graph)) || canonical(baseline.optionalAbsences) !== canonical(candidate.optionalAbsences)) return decline('unselected graph, occurrence, edge or omission differs');
    const record = proof.adapters[name]; if (!record) return decline('adapter record missing'); const sourceBytes = readFileSync(join(sourceDir, 'package.json'));
    hashPackBytes('package.json', sourceBytes); const source = JSON.parse(sourceBytes.toString('utf8'));
    if (sha256(sourceBytes) !== record.sourceSha256 || source.name !== name || source.version !== version || source.dependencies?.['@dzhechkov/core'] !== 'workspace:*' || record.version !== version || !/^[a-f0-9]{40,64}$/.test(record.creation) || !record.history.some(row => row.oid === record.creation && !row.boundary) || record.history.length === 0 || record.history.length > 2048 || record.history.some(row => !/^[a-f0-9]{40,64}$/.test(row.oid) || (row.boundary ? row.literal !== null || row.blob !== null : row.literal !== 'workspace:*' || !/^[a-f0-9]{40,64}$/.test(row.blob ?? '')))) return decline('current source or complete declaration history differs');
    if (JSON.stringify([...opts.workspaceVersions].sort()) !== JSON.stringify([...proof.workspaceVersions].sort())) return decline('captured workspace materialization map changed');
    const expected = JSON.parse(rewriteWorkspaceSpecs(sourceBytes.toString('utf8'), new Map(proof.workspaceVersions))); if (expected.scripts) delete expected.scripts.prepublishOnly;
    const actual = readFileSync(join(localDir, 'package.json')); if (hashPackBytes('package.json', Buffer.from(JSON.stringify(expected))) !== hashPackBytes('package.json', actual)) return decline('source-to-packed materialization differs');
    const treeHash = (dir: string) => sha256(canonical(listFilesRecursive(dir, dir, true).sort().map(path => [path, sha256(readFileSync(join(dir, path)))])));
    if (treeHash(localDir) !== record.localTreeSha256 || treeHash(registryDir) !== record.registryTreeSha256 || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(record.registryIntegrity) || !/^\d+\.\d+\.\d+$/.test(record.registeredFloor) || record.localFloor === record.registeredFloor || expected.dependencies?.['@dzhechkov/core'] !== record.localFloor) return decline('artifact/SRI/exact-floor binding differs');
    const verified = classifyOwnerBrandingDelta(localDir, registryDir, name, version, opts.trustedPublicKeyPem, paths, { localFloor: record.localFloor, registeredFloor: record.registeredFloor });
    if (!verified.accepted) return verified;
    return { ...verified, reason: `retained-registered-binding: registered core ${record.registeredFloor} retained; workspace materializes ${record.localFloor}; fresh cohort/source/artifact proof ${proof.digest}; historical release gitHead not established` };
  } catch { return decline('source/artifact/graph proof unreadable or inconsistent'); }
}

/** package.json normalized for comparison: strip fields that legitimately differ (version, gitHead, npm-internal `_*`). */
function normalizedPackageJsonText(raw: Record<string, unknown>): string {
  // Lead edit after the live dry-run on the hub (2026-09-13 10:40): the packer strips
  // `scripts.prepublishOnly`, drops devDependencies/publishConfig and rewrites `workspace:` specs to
  // pinned versions — every freshly published sibling read as "1 file drifted". Compare only what
  // shapes the SHIPPED behavior: entry points, bins, files, engines, and dependency NAMES (values
  // are the workspace-floor preflight's business, not this gate's).
  //
  // AM-4: `imports`/`browser`/`sideEffects`/`man` added — each one changes what a consumer actually
  // resolves or ships, exactly like `main`/`exports`/`bin` already did; omitting them was a real gap
  // the round-1 review named (finding 4), not a stylistic nicety.
  const SHIPPING_FIELDS = [
    'name', 'type', 'main', 'module', 'types', 'exports', 'imports', 'browser', 'sideEffects', 'man',
    'bin', 'files', 'engines', 'os', 'cpu',
  ];
  const DEP_TABLES = ['dependencies', 'peerDependencies', 'optionalDependencies'];
  const kept: Record<string, unknown> = {};
  for (const key of SHIPPING_FIELDS) if (key in raw) kept[key] = raw[key];
  for (const key of DEP_TABLES) {
    const table = raw[key];
    if (table !== null && typeof table === 'object') kept[key] = Object.keys(table as Record<string, unknown>).sort();
  }
  return JSON.stringify(kept);
}

/** Every relative path (from `dir`) that a `bin` field in a parsed manifest resolves to. */
function binPaths(raw: Record<string, unknown>): string[] {
  const bin = raw['bin'];
  if (typeof bin === 'string') return [bin.replace(/^\.\//, '')];
  if (bin !== null && typeof bin === 'object' && !Array.isArray(bin)) {
    return Object.values(bin as Record<string, unknown>)
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.replace(/^\.\//, ''));
  }
  return [];
}

/**
 * AM-4: the round-1 gate hashed only `dist/**` — a changed bin script, template, or other
 * top-level asset that ships (declared in `package.json#files`, or the `bin` target itself) was
 * invisible to the drift check even though npm ships it byte-for-byte. This is a documented,
 * honest APPROXIMATION of "the whole tarball inventory" (the literal ADR wording), not a full
 * re-implementation of npm's pack-time file-inclusion rules (`.npmignore`, default excludes,
 * nested `.gitignore`): it walks `dist/**` (unconditional — the common case) plus every path
 * named in `files` (directories walked recursively, files hashed directly) plus every resolved
 * `bin` target, deduplicated. A package with no `files` field declared keeps exactly the
 * pre-amendment `dist/**`-only scope, named here rather than silently pretended-away.
 */
function shippedInventoryDirs(dir: string, raw: Record<string, unknown>): string[] {
  const rels = new Set<string>(['dist']);
  const files = raw['files'];
  if (Array.isArray(files)) {
    for (const entry of files) {
      if (typeof entry === 'string' && entry.trim() !== '') rels.add(entry.replace(/^\.\//, '').replace(/\/+$/, ''));
    }
  }
  for (const bin of binPaths(raw)) rels.add(bin);
  return [...rels].filter((rel) => existsSync(join(dir, rel)));
}

/** Hash the shipped inventory (AM-4) plus the normalized package.json, keyed by a stable relative path. */
function hashTree(dir: string, manifest: Record<string, unknown>): Map<string, string> {
  const map = new Map<string, string>();
  for (const rel of shippedInventoryDirs(dir, manifest)) {
    const abs = join(dir, rel);
    if (statSync(abs).isDirectory()) {
      for (const sub of listFilesRecursive(abs, abs)) map.set(join(rel, sub), sha256(readFileSync(join(abs, sub))));
    } else {
      map.set(rel, sha256(readFileSync(abs)));
    }
  }
  map.set('package.json', sha256(normalizedPackageJsonText(manifest)));
  return map;
}

function extractExportNames(source: string): Set<string> {
  const names = new Set<string>();
  for (const m of source.matchAll(/export\s+(?:const|function|class|async\s+function)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]!);
  }
  for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** А2 (ADR-001, rejected as the sole signal, kept as a readable second signal). */
function missingExportNames(publishedDir: string, workspaceDir: string): string[] {
  const pubIndex = join(publishedDir, 'dist', 'index.js');
  const wsIndex = join(workspaceDir, 'dist', 'index.js');
  if (!existsSync(pubIndex) || !existsSync(wsIndex)) return [];
  const pubExports = extractExportNames(readFileSync(pubIndex, 'utf-8'));
  const wsExports = extractExportNames(readFileSync(wsIndex, 'utf-8'));
  return [...wsExports].filter((n) => !pubExports.has(n)).sort();
}

/**
 * For every `workspace:`-declared dependency of a package that is NOT part of `batch` (i.e. will
 * be pinned to whatever is already on the registry, not published fresh in this run), compare the
 * build that will be pinned against the workspace copy. Pure: all IO (fetch, fs) is either
 * injected or scoped to reading local dist/package.json files — no network call is made here.
 */
export function detectSiblingDrift(opts: DetectSiblingDriftOptions): SiblingDriftResult[] {
  const results: SiblingDriftResult[] = [];
  const seen = new Set<string>();
  // AM-6: named ONCE per call — every result below (including the short-circuited `unavailable`
  // ones) carries the source that is or would have been used for this comparison.
  const inventorySource: InventorySource = opts.localInventory !== undefined ? (opts.localInventorySource ?? 'npm-pack') : 'readdir-approximation';
  // AM-3: `optionalDependencies` ships and pins EXACTLY like `dependencies`/`peerDependencies` —
  // checking only the first two let a stale optional sibling through untouched (round-1 finding 3).
  const entries = [
    ...Object.entries(opts.dependencies ?? {}),
    ...Object.entries(opts.peerDependencies ?? {}),
    ...Object.entries(opts.optionalDependencies ?? {}),
  ];
  for (const [dep, spec] of entries) {
    if (!String(spec).startsWith('workspace:')) continue;
    if (seen.has(dep)) continue;
    seen.add(dep);
    if (opts.batch.has(dep)) continue; // publishes fresh in this batch — nothing stale to drift from
    const version = opts.workspaceVersions.get(dep);
    const workspaceDir = opts.workspaceDirs.get(dep);
    // AM-3: a `workspace:`-spec'd dependency this caller does not recognize used to be silently
    // SKIPPED — an input this gate cannot build is a HARD gate that cannot say "same", never a
    // quiet pass-through (round-1 finding 3: pnpm would die packing it anyway; die here, named).
    if (version === undefined || workspaceDir === undefined) {
      results.push({
        name: dep,
        version: version ?? '(not in workspace)',
        status: 'unavailable',
        changedFiles: [],
        missingExports: [],
        reason: `${dep} is declared workspace:-protocol but is not a known workspace package`,
        inventorySource,
      });
      continue;
    }

    const fetched = opts.fetchPublished(dep, version);
    if (fetched === null) {
      results.push({
        name: dep,
        version,
        status: 'unavailable',
        changedFiles: [],
        missingExports: [],
        reason: `could not fetch ${dep}@${version} from the registry (network unavailable or the version was not found)`,
        inventorySource,
      });
      continue;
    }

    // AM-3: a missing/unparseable package.json on EITHER side must not silently drop out of the
    // comparison (the old `hashTree` simply omitted the key, which — with an empty/matching
    // `dist/**` on both sides — could report `same` about an input that was never actually read).
    if (opts.localInventory !== undefined && inventorySource === 'pack-artifact') {
      try {
        listFilesRecursive(fetched.dir, fetched.dir, true);
        if (!lstatSync(workspaceDir).isDirectory()) throw new InventoryListingError('workspace artifact root is a symlink or unsupported entry');
        if (!lstatSync(join(fetched.dir, 'package.json')).isFile() || !lstatSync(join(workspaceDir, 'package.json')).isFile()) throw new InventoryListingError('package metadata is not a regular file');
      } catch (error) {
        results.push({ name: dep, version, status: 'unavailable', changedFiles: [], missingExports: [], reason: 'physical packed admission failed: ' + String(error), inventorySource });
        continue;
      }
    }
    const publishedManifest = readManifest(fetched.dir);
    const workspaceManifest = readManifest(workspaceDir);
    if (publishedManifest === null || workspaceManifest === null) {
      const side = publishedManifest === null ? 'the published tarball' : 'the workspace copy';
      results.push({
        name: dep,
        version,
        status: 'unavailable',
        changedFiles: [],
        missingExports: [],
        reason: `${dep}@${version}: package.json in ${side} is missing or not valid JSON — cannot compare`,
        inventorySource,
      });
      continue;
    }

    // FR-3/AM-1: the LOCAL package's inventory comes from npm, not from a hand-rolled dist/files/bin
    // walk — `.npmignore` (and nested ignore rules) can exclude a file this gate would otherwise walk
    // straight into, producing a false drift about a file npm was never going to ship. AM-1 (Codex
    // review, round-1 finding 3, high): the two sides must stay SYMMETRIC. With a provider injected,
    // the workspace side is npm's OWN shipped-path list; the published side must then be hashed by a
    // FULL recursive walk of the already-unpacked tarball (every file npm actually put there —
    // README/LICENSE included, since npm auto-packs those regardless of `files`), not the narrower
    // `dist`/`files`/`bin` approximation `hashTree` uses — that approximation would silently OMIT an
    // auto-packed README/LICENSE from the published side while the workspace side (via real `npm
    // pack`) correctly includes them, reading as a false "only in workspace" drift. WITHOUT a
    // provider, core has no way to ask npm on either side, so it degrades to the SAME approximation
    // on BOTH sides (symmetry preserved, just cruder) — a named approximation, never a subprocess.
    let localPackedDir: string | undefined;
    let localPackedPaths: readonly string[] | undefined;
    let workspaceHashes: Map<string, string>;
    let publishedHashes: Map<string, string>;
    if (opts.localInventory !== undefined) {
      const localResult = opts.localInventory(workspaceDir);
      if ('unavailable' in localResult) {
        results.push({
          name: dep,
          version,
          status: 'unavailable',
          changedFiles: [],
          missingExports: [],
          reason: `${dep}@${version}: local package inventory unavailable (${localResult.unavailable})`,
          inventorySource,
        });
        continue;
      }
      if ('packedDir' in localResult) { localPackedDir = localResult.packedDir; localPackedPaths = localResult.paths; }
      try {
        if ('packedDir' in localResult && inventorySource === 'pack-artifact') {
          const physical = listFilesRecursive(localResult.packedDir, localResult.packedDir, true).sort();
          if (localResult.paths !== undefined && (!Array.isArray(localResult.paths) || localResult.paths.some(path => !isSafeManifestPath(path)) || JSON.stringify([...localResult.paths].sort()) !== JSON.stringify(physical))) throw new InventoryListingError('declared packed inventory is not the complete canonical physical leaf set');
        }
        workspaceHashes = 'packedDir' in localResult
          ? localResult.paths !== undefined
            ? hashTreeFromPaths(localResult.packedDir, localResult.paths, workspaceManifest)
            : hashTreeFull(localResult.packedDir, workspaceManifest)
          : hashTreeFromPaths(workspaceDir, localResult.paths, workspaceManifest);
      } catch (err) {
        if (!(err instanceof InventoryListingError)) throw err;
        results.push({
          name: dep,
          version,
          status: 'unavailable',
          changedFiles: [],
          missingExports: [],
          reason: `${dep}@${version}: local package inventory unusable (${err.message})`,
          inventorySource,
        });
        continue;
      }
      publishedHashes = hashTreeFull(fetched.dir, publishedManifest);
    } else {
      workspaceHashes = hashTree(workspaceDir, workspaceManifest);
      publishedHashes = hashTree(fetched.dir, publishedManifest);
    }

    const allKeys = new Set<string>([...publishedHashes.keys(), ...workspaceHashes.keys()]);
    const changed: string[] = [];
    for (const key of allKeys) {
      if (publishedHashes.get(key) !== workspaceHashes.get(key)) changed.push(key);
    }
    changed.sort();

    const branding = (changed.length > 0 || opts.trustedPublicKeyPem !== undefined) && localPackedDir !== undefined && inventorySource === 'pack-artifact'
      ? classifyOwnerBrandingDelta(localPackedDir, fetched.dir, dep, version, opts.trustedPublicKeyPem, localPackedPaths)
      : undefined;
    const retained = !branding?.accepted && localPackedDir !== undefined && inventorySource === 'pack-artifact'
      ? classifyRetainedBindingDelta(opts, localPackedDir, fetched.dir, workspaceDir, dep, version, localPackedPaths) : undefined;
    if (retained?.accepted) {
      results.push({ name: dep, version, status: 'same', classification: 'retained-registered-binding', changedFiles: retained.changedFiles, missingExports: [], reason: retained.reason, inventorySource });
      continue;
    }
    if (opts.trustedPublicKeyPem !== undefined && branding !== undefined && !branding.coverageVerified) {
      results.push({ name: dep, version, status: 'unavailable', changedFiles: changed, missingExports: [], reason: branding.reason, inventorySource });
      continue;
    }
    if (branding?.accepted) {
      results.push({ name: dep, version, status: 'same', classification: 'owner-branding-only', changedFiles: branding.changedFiles, missingExports: [], reason: branding.reason, inventorySource });
      continue;
    }

    if (changed.length === 0) {
      results.push({ name: dep, version, status: 'same', changedFiles: [], missingExports: [], inventorySource });
    } else {
      results.push({
        name: dep,
        version,
        status: 'drift',
        changedFiles: changed,
        ...(branding !== undefined ? { reason: branding.reason } : {}),
        missingExports: missingExportNames(fetched.dir, workspaceDir),
        inventorySource,
      });
    }
  }
  return results;
}


/** Named drift evidence for both the publish BLOCKED line and its durable audit row. */
export function formatDriftFiles(changedFiles: readonly string[], source: InventorySource, max = 5): string {
  const shown = changedFiles.slice(0, Math.max(0, max));
  const remaining = changedFiles.length - shown.length;
  const names = [...shown, ...(remaining > 0 ? [`… (+${remaining} more)`] : [])].join(', ');
  return `${names || '(no changed files)'} [source: ${source}]`;
}
