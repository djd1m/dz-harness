declare const SCHEMA: "fa-decision-recall-1";
export type DecisionRecallKind = 'adr-alternative-selection' | 'plan-route-selection';
export type DecisionRecallStage = 'step-3' | 'step-6';
export type DecisionRecallOutcomeName = 'success' | 'empty' | 'timeout' | 'command-error' | 'parse-error' | 'transport-error';
export interface DecisionRecallContext {
    readonly schema: typeof SCHEMA;
    readonly slug: string;
    readonly stage: DecisionRecallStage;
    readonly decisionKind: DecisionRecallKind;
    readonly banditContext: string;
    readonly query: string;
    readonly summary: string;
    readonly digest: string;
    readonly logicalDecisionId: string;
}
export interface DecisionRecallFrame {
    readonly status: 'success' | 'timeout' | 'command-error' | 'transport-error';
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
}
export interface DecisionRecallSelection {
    readonly rank: number;
    readonly lessonRef: string;
    readonly identityWitness: string;
    readonly pattern: string;
    readonly domain: string;
    readonly reward: number;
    readonly relevance: number | null;
    readonly similarity: number | null;
}
export interface DecisionRecallOutcome {
    readonly outcome: DecisionRecallOutcomeName;
    readonly selected: DecisionRecallSelection[];
    readonly promptBlock: string;
    readonly error: string | null;
}
export declare function buildDecisionContext(opts: {
    slug: string;
    decisionKind: DecisionRecallKind;
    description: string;
    tier?: string;
    codeHint?: string;
    upstreamDigest?: string;
}): DecisionRecallContext;
export declare function parseDecisionRecallFrame(text: unknown): DecisionRecallFrame | null;
export declare function normalizeDecisionRecall(frame: DecisionRecallFrame | null): DecisionRecallOutcome;
interface EventBase {
    readonly schema: typeof SCHEMA;
    readonly slug: string;
    readonly logicalDecisionId: string;
    readonly attemptId: string;
    readonly stage: DecisionRecallStage;
    readonly decisionKind: DecisionRecallKind;
    readonly ts: string;
}
export type DecisionRecallEvent = EventBase & ({
    readonly event: 'entered';
    readonly context: {
        summary: string;
        digest: string;
        banditContext: string;
    };
} | {
    readonly event: 'recalled';
    readonly outcome: DecisionRecallOutcomeName;
    readonly selected: DecisionRecallSelection[];
    readonly error: string | null;
} | {
    readonly event: 'applied';
    readonly artifact: string;
    readonly dispositions: DecisionRecallDisposition[];
} | {
    readonly event: 'owner-label';
    readonly owner: string;
    readonly relevance: 'relevant' | 'irrelevant' | 'unknown';
    readonly repeatObserved: 'yes' | 'no' | 'unknown';
    readonly repeatLessonRefs: string[];
    readonly preventedRepeat: 'yes' | 'no' | 'unknown';
    readonly evidence: string | null;
});
export interface DecisionRecallDisposition {
    readonly lessonRef: string;
    readonly status: 'applied' | 'not-applied' | 'unknown';
    readonly evidence: string | null;
}
export interface DecisionRecallApplicationProbe {
    readonly established: boolean;
    readonly dispositions: DecisionRecallDisposition[];
}
export declare function decisionRecallEnterCmd(fdirAbs: string, context: DecisionRecallContext): string;
export declare function decisionRecallAppendCmd(fdirAbs: string, event: DecisionRecallEvent): string | null;
export declare function decisionRecallRunCmd(opts: {
    dzBin: string;
    brain: string;
    slug: string;
    context: DecisionRecallContext;
    timeoutSeconds?: number;
}): string;
export declare function decisionRecallApplicationProbeCmd(artifactAbs: string, lessonRefs: readonly string[]): string;
export declare function parseDecisionRecallApplicationProbe(text: unknown, lessonRefs: readonly string[]): DecisionRecallApplicationProbe;
export interface MergedDecisionRecallAttempt {
    readonly logicalDecisionId: string;
    readonly attemptId: string;
    readonly counted: boolean;
    readonly reason: 'ok' | 'missing-entered' | 'missing-recalled' | 'event-conflict' | 'identity-conflict';
    readonly entered: Extract<DecisionRecallEvent, {
        event: 'entered';
    }> | null;
    readonly recalled: Extract<DecisionRecallEvent, {
        event: 'recalled';
    }> | null;
    readonly applied: Extract<DecisionRecallEvent, {
        event: 'applied';
    }> | null;
    readonly ownerLabel: Extract<DecisionRecallEvent, {
        event: 'owner-label';
    }> | null;
}
export interface MergedDecisionRecallDecision {
    readonly logicalDecisionId: string;
    readonly attempts: MergedDecisionRecallAttempt[];
    readonly selectedAttempt: MergedDecisionRecallAttempt | null;
}
export interface MergedDecisionRecallEvents {
    readonly attempts: MergedDecisionRecallAttempt[];
    readonly decisions: MergedDecisionRecallDecision[];
    readonly malformedLines: number;
    readonly unsupportedLines: number;
}
export declare function mergeDecisionRecallEvents(input: readonly unknown[] | string): MergedDecisionRecallEvents;
export interface DecisionRecallRatio {
    readonly numerator: number;
    readonly denominator: number;
}
export interface DecisionRecallMetrics {
    readonly eligibleDecisions: number;
    readonly receiptedDecisions: number;
    readonly uncountedDecisions: number;
    readonly missingReceipts: number;
    readonly attempts: number;
    readonly conflictingAttempts: number;
    readonly emptyDecisions: number;
    readonly hitDecisions: number;
    readonly errorDecisions: number;
    readonly selectedLessons: number;
    readonly appliedLessons: number;
    readonly notAppliedLessons: number;
    readonly unknownApplications: number;
    readonly ownerLabelledDecisions: number;
    readonly relevantDecisions: number;
    readonly repeatOpportunityDecisions: number;
    readonly repeatHitDecisions: number;
    readonly preventedRepeatDecisions: number;
    readonly irrelevantInjections: number;
    readonly malformedEvents: number;
    readonly unsupportedEvents: number;
    readonly receiptCoverage: DecisionRecallRatio;
    readonly applicationShare: DecisionRecallRatio;
    readonly ownerLabelCoverage: DecisionRecallRatio;
    readonly relevantDecisionShare: DecisionRecallRatio;
    readonly repeatHitRate: DecisionRecallRatio;
}
export declare function reduceDecisionRecallMetrics(merged: MergedDecisionRecallEvents, eligibleLogicalDecisionIds?: readonly string[]): DecisionRecallMetrics;
export declare function summarizeDecisionRecallReceipts(input: readonly unknown[] | string, eligibleLogicalDecisionIds?: readonly string[]): DecisionRecallMetrics;
export {};
//# sourceMappingURL=feature-adr-decision-recall.d.ts.map