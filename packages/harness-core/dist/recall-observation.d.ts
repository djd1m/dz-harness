export declare const RECALL_OBSERVATION_MAX_BYTES = 65536;
export declare const RECALL_OBSERVATION_MAX_SESSIONS = 32;
export declare const RECALL_OBSERVATION_MAX_ITEMS = 16;
export declare const RECALL_OBSERVATION_TTL_MS: number;
export declare const RECALL_OBSERVATION_CLOCK_SKEW_MS = 30000;
export declare const RECALL_EMISSION_TIMEOUT_MS = 50;
export type RecallProducer = 'claude-hook' | 'codex-hook';
type Reason = 'pending' | 'daemon-unavailable' | 'core-unavailable' | 'selection-failed' | 'telemetry-unavailable' | 'session-unavailable' | 'project-unavailable' | 'store-unavailable' | 'observation-unavailable' | 'invalid-selector' | 'turn-mismatch' | 'stale' | 'unsafe-source' | 'unreadable' | 'corrupt' | 'oversize';
type SelectionReason = 'selected-by-policy' | 'selection-empty' | 'no-candidates' | 'empty-prompt';
export type RecallSelection = {
    readonly state: 'known';
    readonly count: number;
    readonly items: readonly {
        readonly id: string;
        readonly reason: 'selected-by-policy';
    }[];
    readonly unaddressableCount: number;
    readonly reason: SelectionReason;
    readonly quarantinedExcluded?: number;
} | {
    readonly state: 'unknown';
    readonly reason: Reason;
};
export type RecallEmission = {
    readonly state: 'emitted';
    readonly count: number;
    readonly eventId: string;
} | {
    readonly state: 'not-emitted';
    readonly count: 0;
    readonly reason: 'no-selected-context' | 'render-failed';
} | {
    readonly state: 'unknown';
    readonly reason: 'pending' | 'emit-failed' | 'telemetry-unavailable';
};
interface Identity {
    readonly projectAlias: string;
    readonly producer: RecallProducer;
    readonly sessionAlias: string;
    readonly turnAlias?: string;
    readonly knowledgeStoreAlias?: string;
}
interface Slot extends Identity {
    readonly sequence: number;
    readonly eventId: string;
    readonly startedAt: number;
    readonly updatedAt: number;
    readonly selected: RecallSelection;
    readonly emitted: RecallEmission;
}
export type RecallObservationEvent = Pick<Slot, 'projectAlias' | 'producer' | 'sessionAlias' | 'sequence' | 'eventId'>;
declare const hostUnknown: () => {
    readonly state: "unknown";
    readonly reason: "host-ack-unavailable";
};
export type RecallObservation = (Omit<Slot, 'sequence'> & {
    readonly version: 1;
    readonly availability: 'observed';
    readonly reason: 'last-observed';
    readonly hostConfirmation: ReturnType<typeof hostUnknown>;
}) | {
    readonly version: 1;
    readonly availability: 'unknown';
    readonly reason: Reason;
    readonly projectAlias?: string;
    readonly sessionAlias?: string;
    readonly selected: {
        readonly state: 'unknown';
        readonly reason: Reason;
    };
    readonly emitted: {
        readonly state: 'unknown';
        readonly reason: 'telemetry-unavailable';
    };
    readonly hostConfirmation: ReturnType<typeof hostUnknown>;
};
export interface RecallObservationSelector {
    readonly producer?: RecallProducer;
    readonly sessionId?: unknown;
    readonly turnId?: unknown;
    /** Explicit project-scoped alias, independent of feature-ADR run identity. */
    readonly sessionAlias?: string;
}
export interface BeginRecallObservationInput extends RecallObservationSelector {
    readonly producer: RecallProducer;
    readonly knowledgeStoreRoot?: string;
}
/** Find an invoking project without crossing its repository boundary or the home directory. */
export declare function resolveRecallObservationProjectRoot(start: string): string | undefined;
/** Raw session identity never enters storage; a tuple is domain-separated and unambiguous. */
export declare function recallSessionAlias(projectRoot: string, runtime: RecallProducer, sessionId: unknown): string | undefined;
/** Throws on telemetry failure; generated hooks swallow only at their observation boundary. */
export declare function beginRecallObservation(projectRoot: string, input: BeginRecallObservationInput, now?: number): RecallObservationEvent | undefined;
export declare function updateRecallSelection(projectRoot: string, event: RecallObservationEvent, input: {
    readonly hits: readonly {
        readonly dzId?: unknown;
    }[];
    readonly reason?: SelectionReason;
    readonly quarantinedExcluded?: number;
} | {
    readonly unknown: 'daemon-unavailable' | 'core-unavailable' | 'selection-failed';
}, now?: number): boolean;
export declare function updateRecallEmission(projectRoot: string, event: RecallObservationEvent, result: 'emitted' | 'render-failed' | 'no-selected-context' | 'emit-failed' | 'pending', now?: number): boolean;
/** No locks, pruning, directory creation, database opens or host assertion imports. */
export declare function readRecallObservation(projectRoot: string, selector?: RecallObservationSelector, now?: number): RecallObservation;
/** Pure renderer tolerates hostile callers; it never renders caller-provided acknowledgment. */
export declare function renderRecallObservationLine(observation: unknown): string;
export declare function renderRecallObservationDetails(observation: RecallObservation): readonly string[];
export interface RecallOutputSink {
    write(text: string, callback: (error?: Error | null) => void): unknown;
    on?(event: 'error', callback: (error: Error) => void): unknown;
    off?(event: 'error', callback: (error: Error) => void): unknown;
}
/** A write's boolean return says backpressure, never completion; deadline/error remains unknown. */
export declare function writeRecallEnvelope(text: string, sink?: RecallOutputSink, timeoutMs?: number): Promise<'emitted' | 'emit-failed' | 'pending'>;
export {};
//# sourceMappingURL=recall-observation.d.ts.map