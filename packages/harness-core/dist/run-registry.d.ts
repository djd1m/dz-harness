export declare const RUN_REGISTRY_BLOB_VERSION = "1.0.0";
export type RunEvent = {
    event: 'started' | 'heartbeat' | 'finished';
    runId: string;
    ts: string;
    kind?: string;
    slug?: string;
    pid?: number;
    parentRunId?: string;
    outcome?: string;
    reason?: string;
    truncated?: boolean;
};
export type RegisteredRun = RunEvent & {
    heartbeat?: string;
    finished?: string;
};
export type RunLiveness = {
    state: 'live' | 'orphaned' | 'inconclusive' | 'stalled';
    reason: string;
};
export type RunRegistry = {
    status: 'readable' | 'missing' | 'inconclusive';
    reason?: string;
    runs: RegisteredRun[];
    events?: RunEvent[];
};
export type RunRegistryIO = {
    append(path: string, line: string): void;
    read(path: string): string;
    mkdir(dir: string): void;
};
export type PidProbe = (pid: number) => boolean | null;
export declare function probePid(pid: number, kill?: (pid: number, signal: 0) => unknown): boolean | null;
export declare function validateRunEvent(raw: unknown): asserts raw is RunEvent;
export declare function appendRunEvent(root: string, ev: RunEvent, io: RunRegistryIO): void;
export declare function readRunRegistry(root: string, io: RunRegistryIO): RunRegistry;
export declare function liveness(run: RegisteredRun | undefined, now: number, probe?: PidProbe, opts?: {
    stallMs?: number;
}): RunLiveness;
export declare function liveParents(registry: RunRegistry, now: number, probe?: PidProbe, opts?: {
    stallMs?: number;
}): Array<{
    runId: string;
    parentRunId?: string;
    liveness: RunLiveness;
}>;
/** Pure shell command assembly; projected into the Workflow sandbox by the blob generator. */
export declare function runRecordCommand(dz: string, root: string, event: string, runId: string, slug: string, pid: number | null, parentRunId: string | null, outcome: string): string;
/** Confirmed absence alone permits a terminal event; callers append the returned events. */
export declare function settleDeadRuns(registry: RunRegistry, now: number, probe?: PidProbe): RunEvent[];
/** Keep whole histories, using the newest event's timestamp rather than the start time. */
export declare function planRegistryArchive(registry: RunRegistry, opts: {
    now: number;
    retentionMs: number;
    probe: PidProbe;
}): {
    archive: RunEvent[];
    keep: RunEvent[];
};
//# sourceMappingURL=run-registry.d.ts.map