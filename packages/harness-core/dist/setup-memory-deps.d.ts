export declare const MEMORY_DEFAULTS: {
    readonly agentdb: "3.0.0-alpha.20";
    readonly 'better-sqlite3': "11.10.0";
};
export interface MemoryDependencyResult {
    readonly ready: boolean;
    readonly changedManifest: boolean;
    readonly changedLock: boolean;
    readonly detail: string;
}
export declare function supportedMemoryVersion(name: keyof typeof MEMORY_DEFAULTS, value: unknown): value is string;
export declare function probeMemoryNative(root: string): string | null;
export declare function reconcileMemoryDependencies(projectRoot: string, repair?: boolean): MemoryDependencyResult;
//# sourceMappingURL=setup-memory-deps.d.ts.map