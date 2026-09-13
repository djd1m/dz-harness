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
    readonly tail: string;
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