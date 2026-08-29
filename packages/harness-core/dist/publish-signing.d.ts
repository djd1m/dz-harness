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
're-sign'
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
export declare function decidePublishSigning(input: {
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
}): PublishSigningDecision;
/** The one line a caller prints, in the shape the other gates use. */
export declare function publishSigningLine(pack: string, d: PublishSigningDecision): string;
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
export declare function decidePostSigningVerification(input: {
    /** Did `verifyManifest(pack, manifest, trustRootPem)` return ok? */
    verifiesAgainstTrustRoot: boolean;
    /** False when no trust root is available to verify against at all. */
    trustRootPresent: boolean;
    /** The pack the caller intended to verify. */
    pack?: string;
    /** The pack the verification actually ran against. A mismatch is a refusal, not a pass. */
    verifiedPack?: string;
}): PublishSigningDecision;
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
export declare class UnusableInventoryError extends Error {
}
export declare function decideSignableSet(input: {
    /** What the signable walk found on disk (manifest and SBOM already excluded). */
    signable: readonly string[];
    /** What `npm pack` says the tarball will contain, `package/`-prefix already stripped. */
    packed: readonly string[];
    /** Names the manifest never covers because they are written after signing. */
    selfNames?: readonly string[];
}): SignableSetDecision;
/** One line naming both asymmetries, because a count alone tells an author nothing to act on. */
export declare function signableSetLine(pack: string, d: SignableSetDecision): string;
//# sourceMappingURL=publish-signing.d.ts.map