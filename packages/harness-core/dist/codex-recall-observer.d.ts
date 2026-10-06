import { type HooksListHookMetadata, type ManagedEntry } from './codex-hooks.js';
export declare const CODEX_RECALL_OBSERVER_VERSION = "0.160.1";
export declare const CODEX_RECALL_OBSERVER_MAX_RECORDS = 32;
export declare const CODEX_RECALL_OBSERVER_MAX_TURNS = 16;
export declare const CODEX_RECALL_OBSERVER_MAX_ITEMS = 32;
export declare const CODEX_RECALL_OBSERVER_MAX_RETAINED_BYTES = 1048576;
export declare const codexRecallObject: (v: unknown) => v is Record<string, unknown>;
export type CodexRecallUnknownReason = 'pending' | 'unsupported-runtime' | 'hook-unverified' | 'context-unavailable' | 'attribution-unavailable' | 'scope-invalidated' | 'disconnected' | 'stream-invalid' | 'limit-exceeded' | 'ambiguous-context';
export interface CodexRecallAccountedInput {
    readonly epoch: number;
    readonly threadAlias: string;
    readonly turnAlias: string;
    readonly itemAlias: string;
    readonly responseAlias: string;
    readonly eventId: string;
    /** This is the entire host context item's attribution; a merged item may include sibling hooks. */
    readonly contextItemInputTokens: number;
    readonly contextDigest: string;
    readonly coverage: 'full' | 'partial';
    readonly completeLessonIds: readonly string[];
    readonly unknownLessonIds: readonly string[];
    readonly unaddressableCount: number;
}
export interface CodexRecallObserverSnapshot {
    readonly schema: 'codex-recall-observer/1';
    readonly observerId: string;
    readonly label: 'recorded-local-experimental';
    readonly runtime: string | null;
    readonly connection: 'connected' | 'disconnected';
    readonly epoch: number;
    readonly updatedAt: number;
    readonly currentStage: 'unknown' | 'hook-completed' | 'context-recorded' | 'accounted-input';
    readonly current: {
        readonly state: 'unknown';
        readonly reason: CodexRecallUnknownReason;
    } | {
        readonly state: 'accounted-input';
        readonly record: CodexRecallAccountedInput;
    };
    readonly historical: readonly CodexRecallAccountedInput[];
}
/** Callers feed only their owned child stdout. Persisted DTOs never feed this authority path. */
export declare class CodexRecallObserver {
    readonly observerId: string;
    private readonly nonce;
    private runtime;
    private handler;
    private epoch;
    private connected;
    private reason;
    private current;
    private currentStage;
    private currentScope;
    private readonly records;
    private readonly turns;
    private readonly invalidated;
    private readonly closed;
    private disabled;
    constructor(observerId: string, nonce: string);
    setRuntime(version: string | null): void;
    /** A new request/turn has no current accounting until its own evidence arrives. */
    beginTurn(): void;
    /** Uniqueness includes source/key/command, generated helper verified separately by the owner. */
    setHooks(hooks: readonly HooksListHookMetadata[], entries: readonly ManagedEntry[], registryPath: string): void;
    /** Invalidate before forwarding lifecycle requests, including those that ultimately fail. */
    invalidate(): void;
    disconnect(): void;
    fail(reason: CodexRecallUnknownReason): void;
    snapshot(now?: number): CodexRecallObserverSnapshot;
    private turn;
    private ambiguous;
    consume(event: unknown): void;
    private checkMemory;
}
//# sourceMappingURL=codex-recall-observer.d.ts.map