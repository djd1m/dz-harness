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
export declare function assertTempRootClean(tmp: string, fs?: TempRootFs, log?: (message: string) => void): void;
//# sourceMappingURL=temp-root-guard.d.ts.map