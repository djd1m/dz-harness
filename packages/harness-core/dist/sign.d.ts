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
export declare const MANIFEST_NAME = ".dz-manifest.json";
export declare const SBOM_NAME = "sbom.json";
/** v3 preserves order-sensitive package.json condition maps while canonicalising packer noise. */
export declare const MANIFEST_VERSION = 3;
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
export declare function buildSbom(manifest: Manifest): Sbom;
/**
 * Hash the bytes of one pack file. A packer-rewritten file is hashed canonically; everything else
 * byte-for-byte. Unparseable, ambiguous, or precision-losing root `package.json` bytes are refused:
 * a current/v3 signer must never emit a raw digest under a canonical-digest SBOM label.
 */
export declare function hashPackBytes(relPath: string, bytes: Buffer, manifestVersion?: number): string;
/**
 * sha256 of a file's bytes, hex. Follows symlinks — used only when building a manifest we control.
 * Canonical pack rewriting is opt-in through the explicit root-relative path. Omitting `relPath`
 * hashes raw bytes, so an unrelated nested file merely named `package.json` is never relaxed.
 */
export declare function hashFile(absPath: string, relPath?: string, manifestVersion?: number): string;
/**
 * Round-2 review (codex exec): `lstat` then `readFile` is a TOCTOU window — the path can be swapped
 * for a symlink between the two calls. Open ONCE with `O_NOFOLLOW`, `fstat` the descriptor, and read
 * from that same descriptor. The bytes hashed are the bytes the stat described.
 *
 * Returns `null` when the path is not a regular file, or is a symlink.
 */
export declare function hashRegularFileNoFollow(absPath: string, relPath?: string, manifestVersion?: number): string | null;
/** Read one regular file through the same no-follow descriptor used by hashing. */
export declare function readRegularFileNoFollow(absPath: string, expectedLength?: number | readonly number[]): Buffer | null;
export declare function isSafeManifestPath(p: unknown): p is string;
/** Returns an error message, or `null` when the entry list is structurally sound. */
export declare function checkManifestEntries(files: unknown): string | null;
/** Every file under `root`, POSIX-relative, excluding the manifest and the SBOM themselves. */
export declare function listPackFiles(root: string): string[];
/**
 * The SIGN-side file list: same exclusions as {@link listPackFiles}, but REGULAR FILES ONLY — `dz sign`
 * never signs a symlink (hashing one would follow it outside the pack). The verify sweep intentionally
 * sees MORE than this (symlinks/specials outside node_modules), so a smuggled entry fails verification.
 */
export declare function listSignablePackFiles(root: string): string[];
/**
 * The bytes that get signed (FR-7). Sorted by path, LF endings, no trailing whitespace, and no
 * dependence on JSON key order — a signature must not depend on how a serialiser felt that day.
 * Format is `sha256sum`-compatible: `<hex>  <path>\n`.
 */
export declare function canonicalizeManifest(files: readonly ManifestEntry[]): Buffer;
/**
 * The bytes actually signed. Cross-model review (2026-07-10) found `pack` and `version` were carried
 * in the manifest but NOT covered by the signature: an attacker could relabel a signed pack. Nothing
 * is signed yet, so the format can change today. It can never change once packs are in the wild.
 */
export declare function canonicalizeSigned(manifest: Manifest): Buffer;
/** Build a manifest for `files` (paths relative to `root`, POSIX separators). */
export declare function buildManifest(root: string, pack: string, files: readonly string[]): Manifest;
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
export declare function generateSigningKeypair(): SigningKeypair;
export declare function signManifest(manifest: Manifest, privateKeyPem: string): SignedManifest;
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
export declare function verifyManifest(root: string, signed: SignedManifest | null | undefined, pubKeyPem: string): VerifyResult;
/**
 * FR-5, the one irreversible mistake. `.gitignore` covers `*.pem` and `*.key` and nothing else — a key
 * written as `signing-key.json` would be committed without complaint. Refuse by location, not by name.
 */
export declare function isInsideTree(keyPath: string, repoRoot: string): boolean;
export declare function assertKeyOutsideTree(keyPath: string, repoRoot: string): void;
export interface SbomComponent {
    readonly type: 'file';
    readonly name: string;
    /** Raw file-byte digests only. A canonical JSON verification digest must never masquerade here. */
    readonly hashes?: readonly {
        readonly alg: 'SHA-256';
        readonly content: string;
    }[];
    /** Explicit verification-digest metadata for packer-rewritten JSON such as package.json. */
    readonly properties?: readonly {
        readonly name: string;
        readonly value: string;
    }[];
}
export interface Sbom {
    readonly bomFormat: 'CycloneDX';
    readonly specVersion: '1.5';
    readonly version: number;
    readonly metadata: {
        readonly component: {
            readonly type: 'library';
            readonly name: string;
        };
    };
    readonly components: readonly SbomComponent[];
}
/**
 * ADR-003: SBOM authenticity is acyclic. The SBOM is not self-hashed; instead its sole canonical
 * value is derived from the already signature-authenticated manifest and compared byte-for-byte.
 */
export declare function verifySbomAgainstManifest(root: string, manifest: Manifest): string | null;
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
export declare function decidePublishGate(input: PublishGateInput): PublishGateDecision;
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
export declare function resolveTrustRoot(c: TrustRootCandidates): TrustRoot | null;
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
export declare function decideVerifyPolicy(verdict: PackVerdict, requireSigning: boolean): PolicyDecision;
//# sourceMappingURL=sign.d.ts.map