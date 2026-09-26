export type PackerId = 'npm' | 'pnpm';
export type InventorySource = 'tarball' | 'npm-dry-run' | 'cache' | 'fallback-walk';
export type PackExec = (cmd: string, opts: {
    readonly cwd: string;
    readonly timeoutMs: number;
}) => {
    readonly stdout: string;
    readonly stderr: string;
};
export type ChunkReader = (absolutePath: string, chunkBytes: number) => Iterable<Buffer>;
export interface ListPublishInventoryOptions {
    readonly packer?: PackerId;
    readonly tgzPath?: string;
    readonly exec?: PackExec;
    readonly cacheDir?: string;
    readonly timeoutMs?: number;
}
export interface PublishInventory {
    readonly files: readonly string[];
    readonly source: InventorySource;
    readonly reason?: string;
    readonly packer: PackerId;
    readonly packerVersion: string | null;
}
export interface PublishSecretSeams {
    readonly listInventory?: typeof listPublishInventory;
    readonly reader?: ChunkReader;
    readonly tgzPathFor?: (dir: string) => string | undefined;
}
/**
 * Share of NUL bytes above which a sample is binary. MEASURED 2026-09-21 (backlog d3841a3b): one NUL in
 * 19 628 bytes of TypeScript made the old `includes(0)` sniff skip a packed TEXT file from the no-secrets scan.
 */
export declare const NUL_RATIO = 0.01;
/**
 * PURE binary sniff over the first bytes of a file: `true` iff NUL bytes exceed `NUL_RATIO` of the sample length.
 * Empty ⇒ text. ONLY NULs count (fix round 1, F1): the rule this replaces skipped on a NUL and nothing else, so a
 * criterion over other control bytes or UTF-8 validity would SKIP files the old rule SCANNED — a latin-1 source with
 * a secret, a text with \x01 separators — and that is a fail-open regression. One NUL in 8 KiB is text and gets
 * scanned; UTF-16 (about half NULs) is binary as before; a PNG with few NULs is scanned — harmless, the scan is read-only.
 */
export declare function looksBinarySample(sample: Buffer): boolean;
/** Scan the publish inventory as streams, retaining every coverage gap by name. */
export declare function gatherPublishSecretFacts(root: string, packageDirs: readonly string[], seams?: PublishSecretSeams): {
    readonly secretFindings: readonly {
        label: string;
        name: string;
    }[];
    readonly secretScan: {
        skipped: number;
        skippedPaths: string[];
        scanned: number;
        inventory: string;
    };
};
/** Reject malformed or empty listings so they cannot suppress scanning. */
export declare function parseNpmPackListing(stdout: string): readonly string[] | null;
/** Versioned key over packer identity, package metadata bytes, and the signable file walk. */
export declare function computeInventoryCacheKey(packageRoot: string, packer: PackerId, packerVersion: string): string;
/** Reuse the read buffer, yielding copies that remain valid after subsequent reads. */
export declare function readFileChunks(absolutePath: string, chunkBytes?: number): Iterable<Buffer>;
/** Prefer the supplied artifact, then a tree/version cache, then stdout from the packer. */
export declare function listPublishInventory(packageRoot: string, opts?: ListPublishInventoryOptions): PublishInventory;
//# sourceMappingURL=pack-inventory.d.ts.map