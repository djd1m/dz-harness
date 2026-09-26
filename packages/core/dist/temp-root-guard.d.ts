export type HazardKind = 'dz-store' | 'git-empty' | 'git-broken' | 'git-real' | 'unreadable';
export interface Hazard {
    readonly path: string;
    readonly kind: HazardKind;
    readonly consequence: string;
}
export interface TempRootFs {
    realpathSync(path: string): string;
    readdirSync(path: string): readonly string[];
    lstatSync(path: string): {
        isDirectory(): boolean;
    };
    readFileSync(path: string, encoding: 'utf8'): string;
}
export declare function findTempRootHazards(tmp: string, fs?: TempRootFs): readonly Hazard[];
export declare function isBlockingHazard({ kind }: Hazard): boolean;
/**
 * Hazards in `after` whose (path, kind) pair is absent from `before`, in `after` order. Pure: no
 * fs, neither input touched. The post-run check feeds it the pre-run and post-run scans so only a
 * hazard CREATED during the run is attributed to it (feature temp-root-post-run-check, FR-1).
 */
export declare function diffTempRootHazards(before: readonly Hazard[], after: readonly Hazard[]): readonly Hazard[];
export declare function assertTempRootClean(tmp: string, fs?: TempRootFs, log?: (message: string) => void): readonly Hazard[];
//# sourceMappingURL=temp-root-guard.d.ts.map