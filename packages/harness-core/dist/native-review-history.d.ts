export declare const NATIVE_QE_HISTORY_API_VERSION = 1;
type Artifact = {
    path: string;
    digest: string | null;
};
type Snapshot = {
    nonce: string;
    revision: string;
    manifest: Artifact[];
};
type Origin = {
    reviewer: string;
    family: string;
};
type Proposal = {
    host: unknown;
    snapshot: Snapshot;
    origins: Origin[];
    receiptDigest: string | null;
    reason: string | null;
    observationDigest: string;
    result: Record<string, unknown>;
    admission: boolean;
};
type Fault = (cut: string) => void;
/** A versioned capability supplied to the CLI-owned installed helper. No generic counter writes. */
export declare function createNativeQeHistoryApi(options: {
    projectRoot: string;
    featurePath: string;
    fault?: Fault;
    now?: () => number;
}): {
    version: number;
    projectRoot: string;
    featurePath: string;
    read(): {
        source: string;
        history: string;
        status: string;
        ceiling: number;
        rounds: number;
        failedAttempts: {
            eventId: string;
            cycleId: string;
            reason: string | null;
        }[];
        journalId: string;
        cycleId: string;
        nonce: string;
        revision: string;
        sequence: number;
        stopReason: string | null;
        locations: {
            journal: string;
            head: string;
            host: string;
            bridge: string;
        };
    } | {
        source: string;
        history: string;
        status: string;
        verdict: string;
        ceiling: number;
        reasons: string[];
        notEstablishedReason: string;
        partialCommit: boolean;
        locations: {
            journal: string;
            head: string;
            host: string;
            bridge: string;
        };
    };
    transact(action: string, observe: (state: null | {
        snapshot: Snapshot;
        witnessed: boolean;
        rounds: number;
        cycleId: string;
    }) => Proposal): {
        source: string;
        history: string;
        status: string;
        verdict: string;
        ceiling: number;
        reasons: string[];
        notEstablishedReason: string;
        partialCommit: boolean;
        locations: {
            journal: string;
            head: string;
            host: string;
            bridge: string;
        };
    } | {
        replayed: boolean;
        source: string;
        history: string;
        status: string;
        ceiling: number;
        rounds: number;
        failedAttempts: {
            eventId: string;
            cycleId: string;
            reason: string | null;
        }[];
        journalId: string;
        cycleId: string;
        nonce: string;
        revision: string;
        sequence: number;
        stopReason: string | null;
        locations: {
            journal: string;
            head: string;
            host: string;
            bridge: string;
        };
    };
};
export {};
//# sourceMappingURL=native-review-history.d.ts.map