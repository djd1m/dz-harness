/** Pure decisions for the Step-7.5 Codex companion liveness barrier. */
export declare const DEFAULT_CODE_LANDING_CEILING_MS = 7200000;
export declare const CODE_LANDING_CEILING_ENV = "DZ_FEATURE_ADR_CODE_LANDING_CEILING_MS";
export type CodeLandingLivenessVerdict = 'coder-running' | 'landed' | 'genuinely-not-landed' | 'exited-without-edits' | 'dead-worker' | 'inconclusive';
export type CodeLandingLivenessReason = 'recorded-pid-alive' | 'recorded-pid-absent' | 'terminal-companion' | 'ceiling-exceeded' | 'companion-probe-error' | 'unparseable-companion-status' | 'recorded-pid-unavailable' | 'git-evidence-unavailable' | 'reported-zero-touched-files';
export interface CodeLandingLivenessInput {
    readonly companionStatus: unknown;
    readonly recordedPidAlive: boolean | null;
    readonly targetsChanged: boolean | null;
    readonly elapsedMs: number;
    readonly ceilingMs: number;
    /**
     * How many files the companion job itself REPORTED writing (`result.touchedFiles.length`), or
     * null when the record could not be read. Zero from a cleanly-terminated job is a different
     * event from "the window expired": the coder finished and wrote nothing, which is what happens
     * when it asks a question a non-interactive dispatch cannot answer. Folding the two together
     * hides the only cure that works — answer the gate and re-dispatch.
     */
    readonly reportedTouchedFiles?: number | null;
}
export interface CodeLandingLivenessDecision {
    readonly verdict: CodeLandingLivenessVerdict;
    readonly reason: CodeLandingLivenessReason;
}
export declare function decideCodeLandingLiveness(input: CodeLandingLivenessInput): CodeLandingLivenessDecision;
export declare function extractCodexCompanionJobId(text: unknown): string | null;
export interface CodeLandingLivenessProbe {
    readonly companionStatus: string;
    readonly recordedPidAlive: boolean | null;
    readonly targetsChanged: boolean | null;
    readonly elapsedMs: number;
    readonly ceilingMs: number;
    readonly startMs: number;
    readonly reportedTouchedFiles: number | null;
}
export declare function parseCodeLandingLivenessSignal(text: unknown): CodeLandingLivenessProbe | null;
//# sourceMappingURL=feature-adr-landing.d.ts.map