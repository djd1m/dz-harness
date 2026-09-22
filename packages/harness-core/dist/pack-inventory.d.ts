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