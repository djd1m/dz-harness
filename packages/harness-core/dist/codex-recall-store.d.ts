import { type CodexRecallObserverSnapshot } from './codex-recall-observer.js';
export declare const CODEX_RECALL_SNAPSHOT_MAX_BYTES = 65536;
export declare const CODEX_RECALL_SNAPSHOT_TTL_MS = 86400000;
/** Allocate exclusively; collisions never overwrite another observer. No .dz creation. */
export declare function createCodexRecallSnapshotWriter(projectRoot: string, observerId: string): (snapshot: CodexRecallObserverSnapshot) => void;
export type CodexRecallRecordedStatus = {
    readonly state: 'unknown';
    readonly reason: 'invalid-selector' | 'unavailable' | 'unsafe-or-corrupt' | 'stale';
} | {
    readonly state: 'recorded';
    readonly observation: CodexRecallObserverSnapshot;
};
/** Bounded no-follow read; reconstruct the allowlist, never expose arbitrary stored keys. */
export declare function readCodexRecallObserverSnapshot(projectRoot: string, observerId: unknown, now?: number): CodexRecallRecordedStatus;
//# sourceMappingURL=codex-recall-store.d.ts.map