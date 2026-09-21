/** Pure parsing and classification for one `dz round exec` subprocess receipt. */
export type RoundExecOutcome = 'done' | 'timeout' | 'session-limit' | 'model-refused' | 'failed' | 'empty';
export interface RoundExecLedgerRow {
    readonly stage: 'round-exec';
    readonly slug: string;
    readonly round: number;
    readonly coder: string;
    readonly minutes: number;
    readonly tokens: number | null;
    readonly agents: 1;
    readonly outcome: RoundExecOutcome;
    readonly exitCode: number | null;
    readonly bytes: number;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly log: string;
    readonly brief: string;
}
export declare function parseCodexTokens(logText: string): number | null;
export declare function classifyRoundExecOutcome(input: {
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly bytes: number;
    /** How the run ENDED: the limit/refusal signatures are end-state facts, so they read the tail. */
    readonly tail: string;
    /**
     * The WHOLE log, when the caller has it. The turn marker is not an end-state fact — it is the last
     * `\ncodex\n` ANYWHERE in the log — and a fixed tail window cannot hold it: MEASURED 2026-09-20 on
     * three real rounds, Codex's final answer ran 12–20 KB (it quotes runner output), so the marker sat
     * at ~95% of the file and fell outside the caller's 4 KB tail. All three runs had landed their files
     * and were green, and all three were recorded `failed`. Defaults to `tail` for callers that only
     * have the window.
     */
    readonly fullText?: string;
}): RoundExecOutcome;
export declare function buildRoundExecRow(input: {
    readonly slug: string;
    readonly round: number;
    readonly model: string;
    readonly effort: string;
    readonly minutes: number;
    readonly tokens: number | null;
    readonly outcome: RoundExecOutcome;
    readonly exitCode: number | null;
    readonly bytes: number;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly log: string;
    readonly brief: string;
}): RoundExecLedgerRow;
//# sourceMappingURL=round-exec.d.ts.map