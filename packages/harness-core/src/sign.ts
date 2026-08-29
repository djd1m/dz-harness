/**
 * `dz sign` / `dz verify` — Ed25519 tamper-evidence for a skill pack.
 *
 * SCOPE, stated once so a green check mark cannot overstate itself (recalled lesson, security,
 * 2026-07-06): *"Verifying a signature against a public key EMBEDDED in the same signed object proves
 * nothing about issuer identity. Trust must bind issuer -> a PINNED out-of-band key. Ed25519 gives
 * provenance/tamper-evidence, never truthfulness."*
 *
 * So: `verifyManifest` takes the public key as a REQUIRED PARAMETER. There is no default, no fallback,
 * and no lookup inside the pack. A `pubkey.pem` sitting in the pack is data, not a key.
 *
 * Zero dependencies: `node:crypto`, `node:fs`, `node:path`.
 */

import { createHash, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, openSync, fstatSync, closeSync, constants as fsConstants } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const MANIFEST_NAME = '.dz-manifest.json';
export const SBOM_NAME = 'sbom.json';
/** v3 preserves order-sensitive package.json condition maps while canonicalising packer noise. */
export const MANIFEST_VERSION = 3;

export interface ManifestEntry {
  readonly path: string;
  readonly sha256: string;
}

export interface Manifest {
  readonly version: number;
  readonly pack: string;
  readonly files: readonly ManifestEntry[];
}

export interface SignedManifest {
  readonly manifest: Manifest;
  /** base64 Ed25519 signature over `canonicalizeManifest(manifest.files)`. */
  readonly signature: string;
}

export interface VerifyFailure {
  readonly path: string;
  readonly reason: string;
}

export interface VerifyResult {
  readonly ok: boolean;
  readonly failures: readonly VerifyFailure[];
}


/** CycloneDX 1.5 JSON for current output. Canonical JSON digests are always explicitly labelled. */
export function buildSbom(manifest: Manifest): Sbom {
  return buildSbomEnvelope(manifest, false);
}

/** Compatibility-only decoder target for v1 packs that historically mislabeled package.json. */
function buildLegacySbomV1(manifest: Manifest): Sbom {
  return buildSbomEnvelope(manifest, true);
}

/**
 * Files the PACKER REWRITES, so their bytes are not stable across two packs of the same unchanged
 * tree — hashing them raw makes a signature that can never verify.
 *
 * MEASURED 2026-08-22: three consecutive `pnpm pack` runs of an unchanged `@dzhechkov/harness-core`
 * (14 dependencies) produced THREE different `package.json` digests; the same three runs of
 * `@dzhechkov/memory` (zero dependencies) produced one. The difference is the ORDER of dependency
 * keys. So a package with dependencies could never satisfy its own signature: the signer packs once,
 * the publisher packs again, and the consumer receives the second one.
 *
 * These files are therefore hashed in a CANONICAL form — parsed, keys sorted, stable separators.
 * HONEST LIMIT: key order, insignificant whitespace, and negative-zero spelling become invisible to
 * the signature. JavaScript can distinguish negative zero with `Object.is`, but JSON/pnpm round-trips
 * normalize it to zero; tolerating that packer rewrite is explicit here. The alternative — excusing
 * `package.json` from signing altogether — would
 * leave the dependency pins and the bin map unsigned, which is the opposite of a fix. The two
 * differences that remain unsafe across parsers — duplicate keys and precision-losing/non-finite numbers — are
 * refused canonicalisation outright; see `canonicalisationIsFaithful`.
 */
const CANONICALISED_PACK_FILES: ReadonlySet<string> = new Set(['package.json']);

/** Recursive, key-sorted JSON — the same bytes for any key order the packer chooses. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJson((value as Record<string, unknown>)[k])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * v3 package.json canonical form. pnpm may reorder ordinary object keys, but Node's conditional
 * `exports`/`imports` objects are first-match maps and TypeScript consumers can likewise observe
 * `typesVersions` order. Preserve every descendant object order under those roots while sorting
 * ordinary metadata keys. This authenticates entry-point semantics without reintroducing pnpm's
 * nondeterministic dependency-key ordering.
 */
const ORDER_SENSITIVE_PACKAGE_ROOTS = new Set(['exports', 'imports', 'typesVersions']);
function stablePackageJsonV2(value: unknown, preserveOrder = false, atRoot = true): string {
  if (Array.isArray(value)) return '[' + value.map((item) => stablePackageJsonV2(item, preserveOrder, false)).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!preserveOrder) keys.sort();
    return '{' + keys.map((key) => {
      const childPreservesOrder = preserveOrder || (atRoot && ORDER_SENSITIVE_PACKAGE_ROOTS.has(key));
      return JSON.stringify(key) + ':' + stablePackageJsonV2(record[key], childPreservesOrder, false);
    }).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * Is this JSON text one whose PARSED value is a faithful stand-in for its BYTES?
 *
 * Canonical hashing deliberately ignores key order and whitespace — differences no consumer can
 * observe. Two differences are NOT of that kind, and a cross-family review (codex `gpt-5.6-sol`,
 * 2026-08-22) named both:
 *
 *  - DUPLICATE KEYS. `{"bin":"evil","bin":"signed"}` parses to the signed value in every JavaScript
 *    parser (last wins), so it would hash as clean — while a first-wins parser in another language
 *    reads `evil` from the same signed bytes.
 *  - LOSSY NUMBERS. `9007199254740993` parses to `...992`, a long decimal can collapse to a shorter
 *    value, and `1e999` becomes `Infinity` before JSON serialization turns it into `null`.
 *
 * Neither is reachable through `pnpm pack` — this is a guard against a hand-crafted artifact, not
 * against the packer. Current/v3 generation refuses either form instead of producing an SBOM that
 * could mislabel a raw-byte fallback as a canonical digest. Consumer verification returns a mismatch
 * for the same refusal because its no-follow hashing wrapper maps this throw to `null`.
 */
function normalizedJsonNumber(literal: string): string | null {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!match || !Number.isFinite(Number(literal))) return null;
  const negative = match[1] === '-';
  const fraction = match[3] ?? '';
  let digits = `${match[2]}${fraction}`.replace(/^0+/, '');
  // pnpm/JSON round-trips collapse every mathematical negative zero spelling to `0`.
  if (digits === '') return '0';
  let exponent = Number(match[4] ?? '0') - fraction.length;
  if (!Number.isSafeInteger(exponent)) return null;
  while (digits.endsWith('0')) { digits = digits.slice(0, -1); exponent += 1; }
  return `${negative ? '-' : ''}${digits}e${exponent}`;
}

function canonicalisationIsFaithful(text: string): boolean {
  const scopes: Array<Set<string> | null> = []; // Set = inside an object, null = inside an array
  let i = 0;
  while (i < text.length) {
    const c = text.charAt(i);
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text.charAt(j) !== '"') j += text.charAt(j) === '\\' ? 2 : 1;
      if (j >= text.length) return false; // unterminated — JSON.parse will reject it anyway
      let key: string;
      try {
        key = JSON.parse(text.slice(i, j + 1)) as string;
      } catch {
        return false;
      }
      i = j + 1;
      let k = i;
      while (k < text.length && /\s/.test(text.charAt(k))) k++;
      const scope = scopes[scopes.length - 1];
      if (text.charAt(k) === ':' && scope instanceof Set) {
        if (scope.has(key)) return false;
        scope.add(key);
      }
      continue;
    }
    if (c === '{') { scopes.push(new Set()); i++; continue; }
    if (c === '[') { scopes.push(null); i++; continue; }
    if (c === '}' || c === ']') { scopes.pop(); i++; continue; }
    if (c === '-' || (c >= '0' && c <= '9')) {
      const start = i;
      while (i < text.length && /[-+0-9eE.]/.test(text.charAt(i))) i++;
      const lit = text.slice(start, i);
      // Compare exact decimal values after removing insignificant spelling differences. This keeps
      // `1`, `1.0`, and `1e0` equivalent while rejecting IEEE-754 rounding, overflow and underflow.
      const exact = normalizedJsonNumber(lit);
      const parsed = normalizedJsonNumber(String(Number(lit)));
      if (exact === null || parsed === null || exact !== parsed) return false;
      continue;
    }
    i++;
  }
  return true;
}

/**
 * Hash the bytes of one pack file. A packer-rewritten file is hashed canonically; everything else
 * byte-for-byte. Unparseable, ambiguous, or precision-losing root `package.json` bytes are refused:
 * a current/v3 signer must never emit a raw digest under a canonical-digest SBOM label.
 */
export function hashPackBytes(relPath: string, bytes: Buffer, manifestVersion = MANIFEST_VERSION): string {
  const rel = relPath.split(sep).join('/');
  if (CANONICALISED_PACK_FILES.has(rel)) {
    try {
      const text = bytes.toString('utf-8');
      if (!canonicalisationIsFaithful(text)) throw new Error('not canonicalisable');
      const parsed = JSON.parse(text) as unknown;
      const canonical = manifestVersion >= 3 ? stablePackageJsonV2(parsed) : stableJson(parsed);
      return createHash('sha256').update(Buffer.from(canonical, 'utf-8')).digest('hex');
    } catch (error) {
      throw new Error(`refusing non-canonicalisable ${rel}: ${String((error as Error)?.message ?? error)}`);
    }
  }
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * sha256 of a file's bytes, hex. Follows symlinks — used only when building a manifest we control.
 * Canonical pack rewriting is opt-in through the explicit root-relative path. Omitting `relPath`
 * hashes raw bytes, so an unrelated nested file merely named `package.json` is never relaxed.
 */
export function hashFile(absPath: string, relPath?: string, manifestVersion = MANIFEST_VERSION): string {
  return hashPackBytes(relPath ?? '', readFileSync(absPath), manifestVersion);
}

/**
 * Round-2 review (codex exec): `lstat` then `readFile` is a TOCTOU window — the path can be swapped
 * for a symlink between the two calls. Open ONCE with `O_NOFOLLOW`, `fstat` the descriptor, and read
 * from that same descriptor. The bytes hashed are the bytes the stat described.
 *
 * Returns `null` when the path is not a regular file, or is a symlink.
 */
export function hashRegularFileNoFollow(absPath: string, relPath?: string, manifestVersion = MANIFEST_VERSION): string | null {
  let fd: number | undefined;
  try {
    fd = openSync(absPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    if (!fstatSync(fd).isFile()) return null;
    // Canonicalise the bytes ALREADY READ from this descriptor — never re-open, or the TOCTOU
    // window this function exists to close would be reopened by the fix.
    return hashPackBytes(relPath ?? '', readFileSync(fd), manifestVersion);
  } catch {
    return null; // ELOOP on a symlink, ENOENT, EACCES — all fail closed
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/** Read one regular file through the same no-follow descriptor used by hashing. */
export function readRegularFileNoFollow(absPath: string, expectedLength?: number | readonly number[]): Buffer | null {
  let fd: number | undefined;
  try {
    fd = openSync(absPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    const allowedLengths = Array.isArray(expectedLength) ? expectedLength : expectedLength === undefined ? null : [expectedLength];
    if (!stat.isFile() || (allowedLengths !== null && !allowedLengths.includes(stat.size))) return null;
    const bytes = readFileSync(fd);
    if (allowedLengths !== null && !allowedLengths.includes(bytes.length)) return null;
    return bytes;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

/**
 * Cross-model security review (codex exec, 2026-07-10) — a SIGNED manifest is not a TRUSTED manifest.
 * Its own contents are attacker-controlled until the signature checks out, and even then they must be
 * structurally sane before they touch the filesystem.
 *
 *   - `join(root, '../../etc/passwd')` escaped the pack (traversal).
 *   - a newline in a path makes the canonical `<hex>  <path>\n` encoding ambiguous.
 *   - duplicate paths make canonical bytes depend on input order — the sort is not a total order.
 *   - a non-string `path` threw inside `hashFile` instead of failing closed.
 */
const SAFE_MANIFEST_PATH = /^[A-Za-z0-9._-][A-Za-z0-9._/-]*$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function isSafeManifestPath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0 || p.length > 4096) return false;
  if (!SAFE_MANIFEST_PATH.test(p)) return false;          // no control chars, no backslash, no leading /
  if (p.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')) return false;
  return true;
}

/** Returns an error message, or `null` when the entry list is structurally sound. */
export function checkManifestEntries(files: unknown): string | null {
  if (!Array.isArray(files)) return 'manifest has no file list';
  if (files.length === 0) return 'manifest signs nothing';
  const seen = new Set<string>();
  for (const f of files) {
    if (!f || typeof f !== 'object') return 'manifest entry is not an object';
    const { path: pth, sha256 } = f as { path?: unknown; sha256?: unknown };
    if (!isSafeManifestPath(pth)) return 'manifest entry has an unsafe path: ' + JSON.stringify(pth);
    if (typeof sha256 !== 'string' || !SHA256_HEX.test(sha256)) return 'manifest entry has a malformed sha256 for ' + pth;
    // Round-2 review: an exact-string `seen` set misses collisions on case-insensitive filesystems
    // (`Readme` vs `README`). Unicode normalization (`e\u0301.txt` vs `é.txt`) cannot arise: paths are
    // ASCII-only by `SAFE_MANIFEST_PATH`, and a non-ASCII path is refused before it reaches here. An
    // NFC check here would be unreachable code pretending to be a guard.
    const fold = pth.toLowerCase();
    if (seen.has(fold)) return 'manifest lists ' + pth + ' twice (case/unicode fold) — canonical bytes would depend on order';
    seen.add(fold);
  }
  return null;
}

/**
 * State-entry names that may be excluded from BOTH walks. node_modules/.git:
 * installed deps / VCS metadata. `.agentic-qe`/`.dz`: LOCAL RUNTIME STATE entries (learning DBs, RVF
 * stores, witness keys) that background workers create inside pack cwds — gitignored, machine-
 * specific, never shipped. Signing them made 19 packs verify green LOCALLY (files present, hashes
 * match) and TAMPERED in CI (clean checkout lacks the gitignored state) — found live on GH run
 * #103, 2026-07-19. State is not content; the walks must never see it.
 */
const EXCLUDED_STATE_NAMES = new Set(['node_modules', '.git', '.agentic-qe', '.dz']);

function isExcludedStateEntry(entry: {
  name: string;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): boolean {
  if (!EXCLUDED_STATE_NAMES.has(entry.name)) return false;
  // A worktree's `.git` is commonly a regular pointer file, and workspace/local-state entries may be
  // symlinks. They remain VCS/dependency/runtime state. A same-named ordinary file other than `.git`
  // is package content and must stay visible.
  if (entry.name === '.git') return true;
  return entry.isDirectory() || entry.isSymbolicLink();
}

/** Generated metadata FILES are self-excluded only at the pack root; directories remain content. */
function isRootGeneratedMetadata(relDir: string, name: string, isFile: boolean): boolean {
  return isFile && relDir === '' && (name === MANIFEST_NAME || name === SBOM_NAME);
}

/** Every file under `root`, POSIX-relative, excluding the manifest and the SBOM themselves. */
export function listPackFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // Role-classified state entries are unsigned territory BY DESIGN (see EXCLUDED_STATE_NAMES). The SIGN and VERIFY
      // walks MUST share these exclusions: an asymmetry here false-TAMPERs every pnpm workspace
      // pack whose node_modules holds symlinks (found live arming task #36 — 10 of 23 packs).
      if (isExcludedStateEntry(e)) continue;
      if (isRootGeneratedMetadata(rel, e.name, e.isFile())) continue;
      const abs = join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(abs, r);
      // NOT else-isFile: a symlink (or other non-file) OUTSIDE role-classified state must stay VISIBLE to the
      // verify sweep — it fails as "present but not signed" / "is a symlink" (R3-4: a smuggled symlink is a
      // finding, not something to silently ignore). Only EXCLUDED_STATE_NAMES entries are exempt territory.
      else out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * The SIGN-side file list: same exclusions as {@link listPackFiles}, but REGULAR FILES ONLY — `dz sign`
 * never signs a symlink (hashing one would follow it outside the pack). The verify sweep intentionally
 * sees MORE than this (symlinks/specials outside node_modules), so a smuggled entry fails verification.
 */
export function listSignablePackFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, rel: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (isExcludedStateEntry(e)) continue;
      if (isRootGeneratedMetadata(rel, e.name, e.isFile())) continue;
      const abs = join(dir, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) out.push(r);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * The bytes that get signed (FR-7). Sorted by path, LF endings, no trailing whitespace, and no
 * dependence on JSON key order — a signature must not depend on how a serialiser felt that day.
 * Format is `sha256sum`-compatible: `<hex>  <path>\n`.
 */
export function canonicalizeManifest(files: readonly ManifestEntry[]): Buffer {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const body = sorted.map((f) => f.sha256 + '  ' + f.path + '\n').join('');
  return Buffer.from(body, 'utf8');
}

/**
 * The bytes actually signed. Cross-model review (2026-07-10) found `pack` and `version` were carried
 * in the manifest but NOT covered by the signature: an attacker could relabel a signed pack. Nothing
 * is signed yet, so the format can change today. It can never change once packs are in the wild.
 */
export function canonicalizeSigned(manifest: Manifest): Buffer {
  const header = 'dz-manifest\nversion ' + String(manifest.version) + '\npack ' + manifest.pack + '\n';
  return Buffer.concat([Buffer.from(header, 'utf8'), canonicalizeManifest(manifest.files)]);
}

/** Build a manifest for `files` (paths relative to `root`, POSIX separators). */
export function buildManifest(root: string, pack: string, files: readonly string[]): Manifest {
  const entries = files.map((rel) => ({
    path: rel.split(sep).join('/'),
    sha256: hashFile(join(root, rel), rel),
  }));
  return { version: MANIFEST_VERSION, pack, files: entries };
}

/** A freshly-generated Ed25519 signing keypair as PEM strings (pkcs8 private / spki public). */
export interface SigningKeypair {
  /** pkcs8 PEM — the PRIVATE key. NEVER commit this; it belongs OUTSIDE the repo (~/.dz/keys/dz.key). */
  readonly privateKey: string;
  /** spki PEM — the PUBLIC key. Commit this as the `keys/dz.pub` trust root. */
  readonly publicKey: string;
}

/**
 * Generate a fresh Ed25519 keypair for `dz sign --init`. The private key is returned for the CLI to write
 * OUTSIDE the repo (the CLI enforces `assertKeyOutsideTree`); the public key is printed for the operator to
 * commit as `keys/dz.pub`. Ed25519 gives tamper-evidence, never truthfulness (the recalled scope lesson).
 */
export function generateSigningKeypair(): SigningKeypair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

export function signManifest(manifest: Manifest, privateKeyPem: string): SignedManifest {
  // Defence in depth (round-2 review): `pack` is interpolated into a newline-delimited signed header.
  // `verifyManifest` already refuses an unsafe pack name, so an ambiguous header could never verify —
  // but refusing to CREATE one is cheaper than reasoning about why it cannot be exploited.
  if (!isSafeManifestPath(manifest.pack)) throw new Error('refusing to sign an unsafe pack name: ' + JSON.stringify(manifest.pack));
  if (!Number.isInteger(manifest.version)) throw new Error('refusing to sign a non-integer manifest version');
  const structural = checkManifestEntries(manifest.files);
  if (structural) throw new Error('refusing to sign a malformed manifest: ' + structural);
  const key = createPrivateKey(privateKeyPem);
  const sig = cryptoSign(null, canonicalizeSigned(manifest), key);
  return { manifest, signature: sig.toString('base64') };
}

/**
 * FR-8 / risk R1: every degenerate input FAILS CLOSED. Absence must never read as success — that is the
 * failure mode that turns a security tool into a lie.
 *
 * `pubKeyPem` is required. It comes from the repo, never from `root`.
 */
/**
 * Round-2 review killed the `expectedFiles` option: a caller could NARROW the added-file check and
 * silently allow an unsigned `evil.js` to sit in the pack. A safety option that a caller may disable
 * is not a safety option. The pack is always scanned.
 */
export function verifyManifest(
  root: string,
  signed: SignedManifest | null | undefined,
  pubKeyPem: string,
): VerifyResult {
  const fail = (path: string, reason: string): VerifyResult => ({ ok: false, failures: [{ path, reason }] });

  if (!signed || typeof signed !== 'object') return fail(MANIFEST_NAME, 'no manifest');
  const { manifest, signature } = signed;
  if (!manifest || typeof manifest !== 'object') return fail(MANIFEST_NAME, 'manifest is missing');
  if (typeof manifest.version !== 'number' || !Number.isInteger(manifest.version)) {
    return fail(MANIFEST_NAME, 'manifest version is not an integer');
  }
  if (![1, 2, MANIFEST_VERSION].includes(manifest.version)) {
    return fail(MANIFEST_NAME, `unsupported manifest version ${manifest.version}`);
  }
  if (!isSafeManifestPath(manifest.pack)) {
    return fail(MANIFEST_NAME, 'manifest pack name is unsafe: ' + JSON.stringify(manifest.pack));
  }
  const structural = checkManifestEntries(manifest.files);
  if (structural) return fail(MANIFEST_NAME, structural);
  if (typeof signature !== 'string' || signature.length === 0) {
    return fail(MANIFEST_NAME, 'manifest is unsigned');
  }
  if (typeof pubKeyPem !== 'string' || pubKeyPem.length === 0) {
    return fail(MANIFEST_NAME, 'no public key supplied — refusing to verify');
  }

  // The signature first: if the manifest itself was rewritten, its file list is not evidence.
  let sigOk = false;
  try {
    sigOk = cryptoVerify(
      null,
      canonicalizeSigned(manifest),
      createPublicKey(pubKeyPem),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return fail(MANIFEST_NAME, 'signature is malformed');
  }
  if (!sigOk) return fail(MANIFEST_NAME, 'signature does not verify against the pinned key');

  const failures: VerifyFailure[] = [];
  const sbomFailure = verifySbomAgainstManifest(root, manifest);
  if (sbomFailure !== null) failures.push({ path: SBOM_NAME, reason: sbomFailure });
  for (const entry of manifest.files) {
    const abs = join(root, entry.path);
    if (!existsSync(abs)) {
      failures.push({ path: entry.path, reason: 'listed in the manifest but absent' });
      continue;
    }
    // One open, O_NOFOLLOW, fstat the descriptor, hash from it: no symlink follow, no TOCTOU window.
    const digest = hashRegularFileNoFollow(abs, entry.path, manifest.version);
    if (digest === null) {
      failures.push({ path: entry.path, reason: 'is a symlink, not a regular file, unreadable, or outside the canonical JSON domain — refusing to hash it' });
      continue;
    }
    if (digest !== entry.sha256) {
      failures.push({ path: entry.path, reason: 'content does not match its signed hash' });
    }
  }

  // Bidirectional, always: hashing only what the manifest lists lets an attacker ADD a file.
  const present = listPackFiles(root);
  const listed = new Set(manifest.files.map((f) => f.path));
  for (const rel of present) {
    const p = rel.split(sep).join('/');
    if (!listed.has(p)) failures.push({ path: p, reason: 'present in the pack but not signed' });
  }

  return { ok: failures.length === 0, failures };
}

/**
 * FR-5, the one irreversible mistake. `.gitignore` covers `*.pem` and `*.key` and nothing else — a key
 * written as `signing-key.json` would be committed without complaint. Refuse by location, not by name.
 */
export function isInsideTree(keyPath: string, repoRoot: string): boolean {
  const key = resolve(keyPath);
  const root = resolve(repoRoot);
  if (key === root) return true;
  const rel = relative(root, key);
  // `relative` yields '' for the root itself, a '..'-prefixed path for anything outside, and an
  // absolute path when the two share no root. Anything else is inside.
  if (rel === '') return true;
  if (rel === '..' || rel.startsWith('..' + sep)) return false;
  if (isAbsolute(rel)) return false;
  return true;
}

export function assertKeyOutsideTree(keyPath: string, repoRoot: string): void {
  if (isInsideTree(keyPath, repoRoot)) {
    throw new Error(
      'refusing to write a private key inside the repository working tree: ' +
        resolve(keyPath) +
        ' (a leaked signing key cannot be reverted — it means a new key and re-signing every pack)',
    );
  }
}

export interface SbomComponent {
  readonly type: 'file';
  readonly name: string;
  /** Raw file-byte digests only. A canonical JSON verification digest must never masquerade here. */
  readonly hashes?: readonly { readonly alg: 'SHA-256'; readonly content: string }[];
  /** Explicit verification-digest metadata for packer-rewritten JSON such as package.json. */
  readonly properties?: readonly { readonly name: string; readonly value: string }[];
}

export interface Sbom {
  readonly bomFormat: 'CycloneDX';
  readonly specVersion: '1.5';
  readonly version: number;
  readonly metadata: { readonly component: { readonly type: 'library'; readonly name: string } };
  readonly components: readonly SbomComponent[];
}

function buildSbomEnvelope(manifest: Manifest, legacyV1PackageHash: boolean): Sbom {
  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    version: 1,
    metadata: { component: { type: 'library', name: manifest.pack } },
    components: [...manifest.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map((f) =>
      !legacyV1PackageHash && CANONICALISED_PACK_FILES.has(f.path)
        ? {
            type: 'file' as const,
            name: f.path,
            properties: [
              { name: 'dz:digest-basis', value: manifest.version >= 3
                ? 'package-json-ordered-conditions-v2' : 'recursive-key-sorted-json-v1' },
              { name: manifest.version >= 3
                ? 'dz:canonical-json-sha256-v2' : 'dz:canonical-json-sha256-v1', value: f.sha256 },
            ],
          }
        : {
            type: 'file' as const,
            name: f.path,
            hashes: [{ alg: 'SHA-256' as const, content: f.sha256 }],
          }),
  };
}

/**
 * ADR-003: SBOM authenticity is acyclic. The SBOM is not self-hashed; instead its sole canonical
 * value is derived from the already signature-authenticated manifest and compared byte-for-byte.
 */
export function verifySbomAgainstManifest(root: string, manifest: Manifest): string | null {
  if (![1, 2, MANIFEST_VERSION].includes(manifest.version)) {
    return `unsupported manifest version ${manifest.version}`;
  }
  const expected = JSON.stringify(buildSbom(manifest), null, 2) + '\n';
  const accepted = manifest.version === 1
    ? [expected, JSON.stringify(buildLegacySbomV1(manifest), null, 2) + '\n']
    : [expected];
  const bytes = readRegularFileNoFollow(join(root, SBOM_NAME), [...new Set(accepted.map((value) => Buffer.byteLength(value)))]);
  if (bytes === null) return 'missing, symlinked, not a regular file, or has a non-canonical byte length';
  const actual = bytes.toString('utf8');
  if (!canonicalisationIsFaithful(actual)) return 'JSON is malformed, ambiguous, or precision-losing';
  try {
    JSON.parse(actual);
  } catch {
    return 'JSON is malformed';
  }
  return accepted.includes(actual) ? null : 'content does not equal canonical CycloneDX derived from the signed manifest';
}

// ── The publish gate (FR-4), as a pure decision ─────────────────────────────
//
// The operator's decision was "the publish gate BLOCKS". Reality intervened: with no trust root
// committed, refusing to publish an unsigned pack refuses to publish anything, forever — a gate that
// blocks on nothing. You cannot verify against a key you do not have.
//
// So the gate's strictness is a function of the trust root's existence, and that is stated out loud:
//   - trust root present  → every pack MUST verify. A missing or failing manifest blocks the release.
//   - trust root absent   → packs publish UNSIGNED, and the CLI says so on every run. `--require-signing`
//                           turns that into a refusal for anyone who wants the strict posture today.

export type PublishGateAction = 'block' | 'publish-unsigned' | 'publish-verified';

export interface PublishGateInput {
  readonly trustRootPresent: boolean;
  readonly manifestPresent: boolean;
  readonly verifyOk: boolean;
  readonly requireSigning: boolean;
  /**
   * The artifact could not be produced (the packer failed), so nothing was compared against the
   * signature. Distinct from `verifyOk: false`, which means a comparison RAN and disagreed — the
   * gate blocks either way, but only an honest reason tells the operator which one to fix.
   */
  readonly artifactUnavailable?: boolean;
}

export interface PublishGateDecision {
  readonly action: PublishGateAction;
  readonly reason: string;
}

export function decidePublishGate(input: PublishGateInput): PublishGateDecision {
  if (!input.trustRootPresent) {
    if (input.requireSigning) {
      return { action: 'block', reason: 'no trust root (keys/dz.pub) and --require-signing was passed' };
    }
    return {
      action: 'publish-unsigned',
      reason: 'no trust root committed (keys/dz.pub) — packs publish UNSIGNED and unverifiable',
    };
  }
  if (!input.manifestPresent) {
    return { action: 'block', reason: 'trust root is present but the pack carries no signature manifest' };
  }
  if (input.artifactUnavailable === true) {
    return {
      action: 'block',
      reason: 'the artifact could not be packed, so its signature was never checked against what ships',
    };
  }
  if (!input.verifyOk) {
    return { action: 'block', reason: 'the pack does not match its signed manifest' };
  }
  return { action: 'publish-verified', reason: 'manifest verified against the pinned key' };
}

// ── The consumer-side apply-leg (ADR-001, verify-apply-leg) ─────────────────
//
// A verifier nobody runs is a signature nobody checks. These two pure functions carry the whole
// security content of `dz doctor` / `dz upgrade`; the CLI bodies only print and exit.

export type PackVerdict = 'verified' | 'unsigned' | 'tampered' | 'no-trust-root' | 'source-tree';

export interface TrustRootCandidates {
  /** `--pubkey <path>`, if the caller passed one and it exists. */
  readonly explicit?: string | undefined;
  /** `keys/dz.pub` in the repository, if present. */
  readonly repo?: string | undefined;
  /** The key shipped inside harness-cli — the verifier vouching for OTHER packs. */
  readonly packaged?: string | undefined;
}

export interface TrustRoot {
  readonly source: 'explicit' | 'repo' | 'packaged';
  readonly path: string;
}

/**
 * Precedence, explicit and pure: `--pubkey` > repo `keys/dz.pub` > the packaged key.
 * Never derived from the pack under verification.
 */
export function resolveTrustRoot(c: TrustRootCandidates): TrustRoot | null {
  if (c.explicit) return { source: 'explicit', path: c.explicit };
  if (c.repo) return { source: 'repo', path: c.repo };
  if (c.packaged) return { source: 'packaged', path: c.packaged };
  return null;
}

export type PolicyAction = 'ok' | 'report' | 'fail';

export interface PolicyDecision {
  readonly action: PolicyAction;
  readonly reason: string;
}

/**
 * The whole feature, as a table:
 *
 * | verdict        | requireSigning off | on   |
 * |----------------|--------------------|------|
 * | verified       | ok                 | ok   |
 * | unsigned       | report             | fail |
 * | tampered       | FAIL               | FAIL |
 * | no-trust-root  | report             | fail |
 * | source-tree    | report             | report |
 *
 * `source-tree` was added on 2026-08-21, when the manifest began describing the PUBLISHED TARBALL
 * rather than the working tree. Those are two different objects — `pnpm publish` re-serialises
 * package.json and rewrites `workspace:*` — so a source checkout CANNOT be hash-verified against a
 * tarball-scoped manifest, and calling that TAMPERED is a false alarm. It is not `verified` either:
 * nothing was established. It stays `report` even under `--require-signing`, because the honest
 * remedy is to verify the artifact (`dz verify-pack` packs and checks the tarball), not to fail a
 * developer's checkout for being a checkout.
 *
 * `tampered` is fatal in both columns; `no-trust-root` is never success. That is the load-bearing
 * property. Today every pack is `unsigned` or `no-trust-root` — the leg is wired, not armed.
 */
export function decideVerifyPolicy(verdict: PackVerdict, requireSigning: boolean): PolicyDecision {
  if (verdict === 'source-tree') {
    return {
      action: 'report',
      reason: 'source checkout — its manifest describes the published tarball, which this tree is not; run `dz verify-pack` to check the artifact',
    };
  }
  if (verdict === 'tampered') {
    return { action: 'fail', reason: 'pack does not match its signed manifest' };
  }
  if (verdict === 'verified') {
    return { action: 'ok', reason: 'verified against the pinned key' };
  }
  if (verdict === 'no-trust-root') {
    return requireSigning
      ? { action: 'fail', reason: 'no trust root available and --require-signing was passed' }
      : { action: 'report', reason: 'no trust root available — nothing could be verified' };
  }
  return requireSigning
    ? { action: 'fail', reason: 'pack is unsigned and --require-signing was passed' }
    : { action: 'report', reason: 'pack is unsigned — not verified' };
}
