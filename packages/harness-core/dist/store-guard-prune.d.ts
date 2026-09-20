export type StoreGuardPruneBucket = 'stale-temp' | 'live' | 'gone-outside-tmp' | 'unreadable';
export interface StoreGuardPruneEntry {
    readonly file: string;
    readonly project: string | null;
    readonly bytes: number;
    readonly bucket: StoreGuardPruneBucket;
}
export interface StoreGuardPrunePlan {
    readonly entries: readonly StoreGuardPruneEntry[];
    readonly counts: Readonly<Record<StoreGuardPruneBucket, number>>;
    readonly reclaimableBytes: number;
}
export interface StoreGuardPruneDeps {
    readonly exists: (path: string) => boolean;
    readonly tmpDirs: readonly string[];
}
export declare function planStoreGuardPrune(input: readonly {
    readonly file: string;
    readonly bytes: number;
    readonly text: string;
}[], deps: StoreGuardPruneDeps): StoreGuardPrunePlan;
//# sourceMappingURL=store-guard-prune.d.ts.map