/**
 * Whether `dz publish` must re-sign a pack before packing it (feature `sign-after-bump`).
 *
 * `dz publish` never signed. It BUMPS the version and REWRITES the README, while
 * `.dz-manifest.json` stays whatever an operator signed by hand at some earlier moment — so
 * publish's own mutations invalidate it and the tarball ships an inventory that disagrees with its
 * contents on at least `package.json` and `README.md`. MEASURED 2026-08-18 on a live published
 * package: a recipient running `dz doctor --require-signing` sees TAMPERED.
 *
 * It became urgent on 2026-08-21, when the packaged trust root was restored. Until then a consumer's
 * verifier reported `trust root: none` and checked nothing, so stale signatures were invisible. From
 * the next release onward the verifier WORKS — and without this it greets every user with a false
 * alarm indistinguishable from a real compromise.
 *
 * Pure: facts in, verdict out. The caller owns the filesystem and the key.
 */

export type PublishSigningVerdict =
  /** the pack is signed and the key is usable — re-sign after the bump, before packing */
  | 're-sign'
  /** the pack carries no manifest: it was never signed, and publish must not grant it a signature */
  | 'skip-unsigned-pack'
  /** dry run: sign nothing, write nothing */
  | 'skip-dry-run'
  /** --bump-only: no tarball is produced, so no signature can reach anyone */
  | 'skip-bump-only'
  /** re-signed, but the result does not verify against the trust root — publish must STOP */
  | 'refuse-unverified-after-signing'
  /** the pack is signed but no usable key is present — publishing would ship a stale inventory */
  | 'refuse-no-key'
  /** the key lives inside the repository working tree */
  | 'refuse-key-inside-tree';

export interface PublishSigningDecision {
  readonly verdict: PublishSigningVerdict;
  /** True for every refusal — pre-sign and post-sign alike: publish must STOP rather than ship a stale or unverifiable manifest. */
  readonly blocking: boolean;
  readonly reason: string;
}

const ok = (verdict: PublishSigningVerdict, reason: string): PublishSigningDecision => ({ verdict, blocking: false, reason });
const stop = (verdict: PublishSigningVerdict, reason: string): PublishSigningDecision => ({ verdict, blocking: true, reason });

export function decidePublishSigning(input: {
  /** Does the pack already carry a `.dz-manifest.json`? */
  packHasManifest: boolean;
  /** The resolved key path, or null when none was supplied or found. */
  keyPath: string | null;
  keyExists: boolean;
  /**
   * True when the resolved key path is inside the repository working tree. The CALLER must resolve
   * symlinks before computing this — a pure function cannot canonicalise a path, and a link pointing
   * into the tree would otherwise pass (cross-family review, 2026-08-21).
   */
  keyInsideTree: boolean;
  dryRun: boolean;
  /** `--bump-only` produces no tarball, so nothing signed or unsigned can reach a consumer. */
  bumpOnly?: boolean;
}): PublishSigningDecision {
  // A6 — the default path must stay inert. Checked FIRST: a dry run must not refuse either, or it
  // would report a failure for a publish that was never going to happen.
  if (input.dryRun) return ok('skip-dry-run', 'dry run — nothing is signed and nothing is written');

  // No tarball, no recipient: refusing here would block a bump for a signature nobody will receive.
  if (input.bumpOnly === true) return ok('skip-bump-only', '--bump-only — no tarball is produced, so no signature can reach anyone');

  // A5 — a pack that was never signed must not silently acquire a signature. Signing is a claim about
  // provenance, and publish is not the place to start making one nobody asked for.
  if (!input.packHasManifest) {
    return ok('skip-unsigned-pack', 'this pack carries no .dz-manifest.json — it was never signed, and publish does not start signing it now');
  }

  // A3 — a private key inside the tree is one `git add` away from being published. Refuse before any
  // read of it: the check is about the PATH, not about what the file contains.
  if (input.keyInsideTree) {
    return stop('refuse-key-inside-tree', 'the signing key resolves to a path INSIDE the repository — a leaked signing key is not revertible');
  }

  // A2 — the pack is signed, so a consumer WILL verify it. Publishing now ships an inventory the
  // bump has already invalidated, and under a working trust root that reads as TAMPERED. Refusing is
  // the smaller harm, and the message names the remedy.
  if (input.keyPath === null || !input.keyExists) {
    return stop(
      'refuse-no-key',
      'this pack is signed but no signing key is available, so publishing would ship a manifest the version bump already invalidated — pass --sign-key <path outside the repo>, or unsign the pack deliberately',
    );
  }

  return ok('re-sign', 'signed pack with a usable key — re-sign after the bump and README sync, before packing');
}

/** The one line a caller prints, in the shape the other gates use. */
export function publishSigningLine(pack: string, d: PublishSigningDecision): string {
  return `publish signing (${pack}): ${d.verdict.toUpperCase()} — ${d.reason}`;
}


/**
 * The verdict AFTER re-signing, and the reason this feature does not try to enumerate pre-conditions.
 *
 * Cross-family review (2026-08-21) showed the pre-flight checks could not be made sufficient: a key
 * that EXISTS may be the WRONG key, an unreadable file, a public key, or the wrong algorithm — and any
 * of those produces a pack that a consumer's trust root rejects, which is the exact harm this feature
 * exists to prevent, recreated by the fix. Enumerating those states is a losing game.
 *
 * So the guard is the OUTCOME: after re-signing, verify the pack against the trust root the CONSUMER
 * will use. A pack that does not verify must not be published, whatever the reason. This is
 * measure-don't-assume applied to our own repair.
 */
export function decidePostSigningVerification(input: {
  /** Did `verifyManifest(pack, manifest, trustRootPem)` return ok? */
  verifiesAgainstTrustRoot: boolean;
  /** False when no trust root is available to verify against at all. */
  trustRootPresent: boolean;
  /** The pack the caller intended to verify. */
  pack?: string;
  /** The pack the verification actually ran against. A mismatch is a refusal, not a pass. */
  verifiedPack?: string;
}): PublishSigningDecision {
  // Cross-family review, round 2: this function took two bare booleans, so a caller could assert a
  // PASS obtained from a different pack (or a different trust root) and get a non-blocking verdict.
  // Binding the claim to its subject is the cheapest half of that fix; the whole fix is verifying the
  // TARBALL rather than the source tree, which is filed as the next step.
  if (input.pack !== undefined && input.verifiedPack !== undefined && input.pack !== input.verifiedPack) {
    return stop(
      'refuse-unverified-after-signing',
      `the verification ran against \`${input.verifiedPack}\` but the pack being published is \`${input.pack}\` — a pass about another artifact is not a pass`,
    );
  }
  if (!input.trustRootPresent) {
    // Not established is not a pass: we cannot claim the signature is good, and we must not pretend.
    return stop(
      'refuse-unverified-after-signing',
      'the pack was re-signed but there is no trust root to verify the result against — publishing would ship a signature nobody here could check',
    );
  }
  if (!input.verifiesAgainstTrustRoot) {
    return stop(
      'refuse-unverified-after-signing',
      'the pack was re-signed but does not verify against the trust root — most likely the WRONG signing key; publishing it would hand every consumer a TAMPERED verdict',
    );
  }
  return ok('re-sign', 're-signed and verified against the trust root the consumer will use');
}

/**
 * Which files a pack's manifest must cover — the ones the CONSUMER receives, not the ones the author
 * happens to have on disk.
 *
 * MEASURED 2026-08-21 by a live install of the published `harness-cli@0.6.1`: with the trust root
 * restored, six packs reported TAMPERED. Two causes, and only one of them was the version bump.
 * The other: `skills-devops` signs 127 files including `CHANGELOG.md` and a test file, while its
 * `files[]` ships neither — so the recipient's verifier reports "listed in the manifest but absent",
 * permanently, no matter when we sign. A manifest that describes the author's disk instead of the
 * artifact is a signature over the wrong thing.
 *
 * The reverse direction matters more and was never checked at all: a file that SHIPS but is not in
 * the manifest is an UNSIGNED file inside a signed pack, and nothing would have said so.
 */
export interface SignableSetDecision {
  /** The files to sign: present on disk AND in the published tarball. */
  readonly sign: readonly string[];
  /** On disk, signed today, but never shipped — the cause of "listed in the manifest but absent". */
  readonly droppedNotPublished: readonly string[];
  /** SHIPPED but not signable — an unsigned file inside a signed pack. Reported LOUDLY. */
  readonly publishedButUnsigned: readonly string[];
}

/** A packed inventory we refuse to reason about at all — the caller must fix the probe, not proceed. */
export class UnusableInventoryError extends Error {}

/**
 * Reject an inventory before it can be trusted. Every state here was fail-open until cross-family
 * review named them (2026-08-21): an EMPTY list read as "nothing ships" and silently signed nothing,
 * duplicates were erased by Set construction, and `./x`, `../outside`, `/abs` were compared literally
 * so a traversal path could match on both sides and pass.
 */
function assertUsableInventory(packed: readonly string[]): void {
  if (packed.length === 0) {
    throw new UnusableInventoryError('the packed inventory is EMPTY — a failed or truncated probe is not the same as a pack that ships nothing');
  }
  const seen = new Set<string>();
  for (const p of packed) {
    if (p !== p.trim() || p === '') throw new UnusableInventoryError(`packed path is blank or padded: ${JSON.stringify(p)}`);
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) throw new UnusableInventoryError(`packed path is absolute: ${p}`);
    if (p.startsWith('./') || p.includes('../') || p.includes('\\')) throw new UnusableInventoryError(`packed path is not a normal POSIX relative path: ${p}`);
    const key = p.toLowerCase();
    if (seen.has(key)) throw new UnusableInventoryError(`packed inventory contains a duplicate or case-collision: ${p}`);
    seen.add(key);
  }
}

export function decideSignableSet(input: {
  /** What the signable walk found on disk (manifest and SBOM already excluded). */
  signable: readonly string[];
  /** What `npm pack` says the tarball will contain, `package/`-prefix already stripped. */
  packed: readonly string[];
  /** Names the manifest never covers because they are written after signing. */
  selfNames?: readonly string[];
}): SignableSetDecision {
  assertUsableInventory(input.packed);
  const self = new Set(input.selfNames ?? ['.dz-manifest.json', 'sbom.json']);
  const packedSet = new Set(input.packed.filter((p) => !self.has(p)));
  const signableSet = new Set(input.signable.filter((p) => !self.has(p)));
  const sign = [...signableSet].filter((p) => packedSet.has(p)).sort();
  const droppedNotPublished = [...signableSet].filter((p) => !packedSet.has(p)).sort();
  const publishedButUnsigned = [...packedSet].filter((p) => !signableSet.has(p)).sort();
  return { sign, droppedNotPublished, publishedButUnsigned };
}

/** One line naming both asymmetries, because a count alone tells an author nothing to act on. */
export function signableSetLine(pack: string, d: SignableSetDecision): string {
  const parts = [`${d.sign.length} signed`];
  if (d.droppedNotPublished.length > 0) parts.push(`${d.droppedNotPublished.length} on disk but never shipped (${d.droppedNotPublished.slice(0, 3).join(', ')})`);
  if (d.publishedButUnsigned.length > 0) parts.push(`${d.publishedButUnsigned.length} SHIPPED BUT UNSIGNED (${d.publishedButUnsigned.slice(0, 3).join(', ')})`);
  return `signable set (${pack}): ${parts.join(' · ')}`;
}
