import { type FeatureAdrObservation, type FeatureAdrSelector, type LearningStoreRowCounts, type RecallObservation } from '@dzhechkov/harness-core';
interface FrameData {
    readonly observation: FeatureAdrObservation;
    readonly learning: readonly string[];
    readonly branch?: string;
    readonly recallObservation?: RecallObservation;
}
export interface StatuslineWatchOptions {
    readonly projectRoot: string;
    readonly brainRoot: string;
    readonly selector?: FeatureAdrSelector;
    readonly intervalSeconds?: number;
    readonly recallSessionAlias?: string;
}
/** All lifecycle resources have test seams; production never touches stdin. */
export interface StatuslineWatchIo {
    readonly isTTY?: boolean;
    readonly dimensions?: () => {
        readonly columns?: number;
        readonly rows?: number;
    };
    readonly write?: (text: string) => void;
    readonly writeErr?: (text: string) => void;
    readonly now?: () => number;
    readonly schedule?: (callback: () => void, delayMs: number) => unknown;
    readonly cancel?: (timer: unknown) => void;
    readonly subscribe?: (event: 'SIGINT' | 'SIGTERM' | 'resize' | 'error', callback: (error?: unknown) => void) => () => void;
    readonly readCounts?: (root: string) => LearningStoreRowCounts;
    readonly branch?: () => string | undefined;
    readonly refresh?: (now: number) => FrameData | Promise<FrameData>;
}
/** Serial, bounded companion watch; cancellation=0, broken output=1, usage=2. */
export declare function watchStatusline(options: StatuslineWatchOptions, io?: StatuslineWatchIo): Promise<number>;
export {};
//# sourceMappingURL=statusline-watch.d.ts.map