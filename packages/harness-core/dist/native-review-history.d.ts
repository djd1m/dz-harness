import { validateNativePostCiEvidence } from './native-post-ci-evidence.js';
export declare const NATIVE_QE_HISTORY_API_VERSION = 1;
export declare const NATIVE_QE_CONTINUATION_API_VERSION = 1;
export declare const NATIVE_QE_POST_CI_CORRECTION_API_VERSION = 2;
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
    ownerApproval?: unknown;
    correctionEvidence?: {
        evidencePath: string;
        evidence: any;
    };
};
type Host = {
    schema: string;
    phase: string;
    reviewers: {
        id: string;
        family: string;
    }[];
    snapshot: Snapshot;
    conditions: unknown[];
    reviewSeen: boolean;
    rework: boolean;
    changedPaths: string[];
};
type Approval = {
    schema: string;
    approvalId: string;
    owner: string;
    decision: string;
    evidenceSource: string;
    projectRoot: string;
    featurePath: string;
    journalId: string;
    sequence: number;
    eventDigest: string;
    cycleId: string;
    revision: string;
    targetRevision: string;
};
type Correction = {
    approval: Approval & {
        evidenceDigest: string;
    };
    evidencePath: string;
    evidence: any;
    predecessorHost: Host;
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
    continuationVersion: number;
    postCiCorrectionVersion: number;
    validateEvidence: typeof validateNativePostCiEvidence;
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
        eventDigest: string;
        snapshot: Snapshot;
        postCiCorrection: {
            capacity: number;
            used: boolean;
            targetRevision: string | null;
            evidence: Correction | null;
            anchorSequence: number | null;
            anchorEventDigest: string | null;
        };
        checkpointDigest: unknown;
        continuation: {
            capacity: number;
            used: boolean;
            targetRevision: string | null;
        };
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
        continuation: boolean;
        checkpointDigest: string | null;
        postCiCorrection?: any;
        deadline?: () => void;
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
        eventDigest: string;
        snapshot: Snapshot;
        postCiCorrection: {
            capacity: number;
            used: boolean;
            targetRevision: string | null;
            evidence: Correction | null;
            anchorSequence: number | null;
            anchorEventDigest: string | null;
        };
        checkpointDigest: unknown;
        continuation: {
            capacity: number;
            used: boolean;
            targetRevision: string | null;
        };
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