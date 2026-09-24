export type ExecLike = (command: string, options: {
    cwd: string;
    stdio: 'pipe';
    encoding: 'utf-8';
    maxBuffer: number;
}) => string;
export interface PackArtifactResult {
    readonly tgzPath: string;
    readonly sha256: string;
    readonly files: readonly string[];
}
export declare class UnknownWorkspaceSpecError extends Error {
    constructor(dependency: string, spec: string);
}
export declare function rewriteWorkspaceSpecs(pkgJsonText: string, siblingVersions: ReadonlyMap<string, string>): string;
/** Current pins, read afresh so a later sign sees a sibling's new version. */
export declare function readWorkspaceVersions(repoRoot: string): ReadonlyMap<string, string>;
export declare function packArtifact(opts: {
    pkgDir: string;
    destDir: string;
    exec: ExecLike;
    pinVersions: ReadonlyMap<string, string>;
}): PackArtifactResult;
//# sourceMappingURL=pack-artifact.d.ts.map