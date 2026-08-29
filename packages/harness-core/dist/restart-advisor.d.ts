/**
 * Deterministic, advisory-only policy for recognising a trailing low-grade QE streak.
 *
 * This module is intentionally value-in/value-out. The CLI owns filesystem reads, path confinement,
 * defaults, and presentation; the core owns parsing, corroboration, policy, and the decision record.
 */
export declare const RESTART_ADVISOR_SCHEMA: "restart-advisor/1";
export declare const RESTART_ADVISOR_MAX_EVIDENCE = 20;
export declare const RESTART_ADVISOR_MAX_DIAGNOSTICS = 20;
export type RestartGrade = 'A' | 'B' | 'C' | 'D' | 'F';
export type RestartThreshold = 'C' | 'D';
export type RestartSource = 'checkpoints' | 'training-pairs' | 'none';
export type RestartPolicyOrigin = 'default' | 'flag' | 'caller';
export type RestartRecommendation = 'RESTART_CODE_STAGE' | 'NO_RESTART_RECOMMENDATION' | 'NOT_ESTABLISHED' | 'INVALID_INPUT';
export type RestartReason = 'TRAILING_STREAK_AT_OR_BELOW_THRESHOLD' | 'TRAILING_STREAK_INTERRUPTED' | 'INSUFFICIENT_TRAILING_EVIDENCE' | 'OPAQUE_TRAILING_EVIDENCE' | 'ROUND_GAP' | 'NO_QE_HISTORY' | 'SOURCE_CONFLICT' | 'SOURCE_EVIDENCE_INVALID' | 'POLICY_INVALID' | 'INPUT_INVALID';
export interface RestartNormalizedRound {
    readonly round: number;
    readonly line: number;
    readonly grade: RestartGrade | null;
    readonly problem: 'UNSUPPORTED_GRADE' | 'MALFORMED_JSON' | 'INVALID_RECORD' | null;
}
export interface ParsedRestartHistory {
    readonly source: Exclude<RestartSource, 'none'>;
    readonly present: boolean;
    readonly recordsRead: number;
    readonly qeCandidates: number;
    readonly identityMode: 'none' | 'explicit' | 'implicit' | 'mixed';
    readonly rounds: readonly RestartNormalizedRound[];
    readonly diagnostics: readonly string[];
    readonly fatal: boolean;
}
export interface RestartDecisionInput {
    readonly history: readonly RestartNormalizedRound[];
    readonly threshold?: RestartThreshold;
    readonly rounds?: number;
}
export interface RestartDecision {
    readonly recommendation: RestartRecommendation;
    readonly recommendRestart: boolean;
    readonly autoAction: false;
    readonly trailingAtOrBelow: number;
    readonly reason: RestartReason;
    readonly evidence: readonly RestartNormalizedRound[];
}
export interface RestartAdvisorInput {
    readonly slug: string;
    readonly checkpointsJsonl?: string | null;
    readonly trainingPairsJsonl?: string | null;
    /** I/O boundary failures already converted to deterministic, operator-visible diagnostics. */
    readonly readDiagnostics?: readonly string[];
    /** CLI/input-boundary refusals that must remain one versioned INVALID_INPUT result. */
    readonly inputErrors?: readonly string[];
}
export interface RestartAdvisorPolicy {
    readonly threshold?: RestartThreshold;
    readonly rounds?: number;
    readonly thresholdOrigin?: RestartPolicyOrigin;
    readonly roundsOrigin?: RestartPolicyOrigin;
}
export interface RestartAdvice {
    readonly schema: typeof RESTART_ADVISOR_SCHEMA;
    readonly slug: string;
    readonly source: RestartSource;
    readonly sourcePath: string | null;
    readonly inspectedPaths: readonly string[];
    readonly corroborated: boolean;
    readonly policy: {
        readonly threshold: RestartThreshold | null;
        readonly thresholdOrigin: RestartPolicyOrigin;
        readonly rounds: number | null;
        readonly roundsOrigin: RestartPolicyOrigin;
    };
    readonly counts: {
        readonly recordsRead: number;
        readonly qeCandidates: number;
        readonly normalizedRounds: number;
        readonly trailingAtOrBelow: number;
    };
    readonly evidence: readonly RestartNormalizedRound[];
    readonly evidenceSummary: {
        readonly total: number;
        readonly returned: number;
        readonly truncated: boolean;
    };
    readonly diagnostics: readonly string[];
    readonly diagnosticsSummary: {
        readonly total: number;
        readonly returned: number;
        readonly truncated: boolean;
    };
    readonly recommendation: RestartRecommendation;
    readonly recommendRestart: boolean;
    readonly autoAction: false;
    readonly trailingAtOrBelow: number;
    readonly reason: RestartReason;
    readonly decisionLogLine: string;
}
export declare function parseCheckpointQeHistory(jsonl: string | null | undefined): ParsedRestartHistory;
export declare function parseTrainingPairQeHistory(jsonl: string | null | undefined): ParsedRestartHistory;
export declare function decideRestartRecommendation(input: RestartDecisionInput): RestartDecision;
export declare function renderRestartDecisionLog(advice: RestartAdvice): string;
export declare function adviseRestart(input: RestartAdvisorInput, policy?: RestartAdvisorPolicy): RestartAdvice;
//# sourceMappingURL=restart-advisor.d.ts.map