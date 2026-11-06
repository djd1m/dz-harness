type Digest = {
    path: string;
    sha256: string;
};
type ToolIdentity = Digest & {
    version?: string;
    name?: string;
};
interface BaselineBuildRun {
    order: number;
    packageDir: string;
    baseSha: string;
    cwd: string;
    argv: string[];
    manifest: Digest;
    config: Digest;
    runtime: ToolIdentity;
    typescriptPackage: ToolIdentity;
    entrypoint: Digest;
    implementation: Digest;
    stdout: string;
    stderr: string;
    exitCode: number | null;
    signal: string | null;
    captureComplete: boolean;
    captureError: string | null;
    outputs: Digest[];
}
interface BaselineBuildReceipt {
    requested: string[];
    baseSha: string;
    status: 'prepared' | 'refused' | 'failed';
    detail?: string;
    budget: {
        timeoutMs: number;
        maxPackages: number;
        maxInventory: number;
        maxMetadataBytes: number;
        maxCaptureBytesPerStream: number;
    };
    capture: {
        stdoutBytes: number;
        stderrBytes: number;
        complete: boolean;
    };
    inventoryEntries: number;
    metadataBytes: number;
    dependencyPreparation: unknown;
    inputs: {
        packageDir: string;
        files: Digest[];
    }[];
    runs: BaselineBuildRun[];
}
/** This helper is private to discrimination-check; every refusal remains a nonmeasurement. */
export declare function prepareDiscriminationBaselineBuild(args: {
    sourceRoot: string;
    baselineRoot: string;
    baseSha: string;
    selection: string;
    dependencyPreparation: unknown;
    timeoutMs: number;
}): BaselineBuildReceipt;
export {};
//# sourceMappingURL=discrimination-baseline-build.d.ts.map