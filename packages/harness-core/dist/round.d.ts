/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */
declare const ROUND_OUTCOMES: readonly ["shipped", "refuted", "blocked", "abandoned"];
type RoundOutcome = typeof ROUND_OUTCOMES[number];
export interface RoundState {
    readonly slug: string;
    readonly round: number;
    readonly topic: string;
    readonly startedAt: string;
    readonly pid: number;
    readonly ownerKind: 'explicit' | 'parent' | 'exec' | 'run';
    readonly ownerRun?: string;
    readonly run?: string;
    readonly recalled: readonly string[];
    readonly execs?: readonly RoundExecState[];
}
export interface RoundExecState {
    readonly startedAt: string;
    readonly endedAt: string;
    readonly exitCode: number | null;
    readonly outcome: import('./round-exec.js').RoundExecOutcome;
    readonly tokens: number | null;
}
/** Additive row shape accepted by the existing run-cost ledger readers. */
export interface RoundLedgerRow {
    readonly slug: string;
    readonly stage: 'round';
    readonly tier: null;
    readonly coder: string | null;
    readonly reviewer: string | null;
    readonly lead: null;
    readonly minutes: number | null;
    readonly agents: number | null;
    readonly tokens: number | null;
    readonly grade: null;
    readonly outcome: RoundOutcome;
    readonly reason: string | null;
    readonly round: number;
    readonly lessons: readonly string[];
    readonly noNewKnowledge: string | null;
    readonly note: string;
    readonly date: null;
    readonly costIn?: 'stages';
    /** round-state-lock (lead edit after Codex re-review): identity of the state instance this row
     * closes — lets a retried `close` detect its own earlier row regardless of the clock. */
    readonly stateId?: string;
}
type RoundRefusal = {
    readonly ok: false;
    readonly exit: 1 | 2;
    readonly reason: string;
};
export declare function openRound(input: {
    readonly slug: string;
    readonly round: number;
    readonly topic: string;
    readonly startedAt: string;
    readonly ownerPid: number;
    readonly ownerKind: 'explicit' | 'parent' | 'run';
    readonly ownerRun?: string | undefined;
    readonly run?: string | undefined;
    readonly recalled: readonly string[];
    readonly existing: RoundState | null;
    readonly force: boolean;
    readonly existingOwnerAlive: boolean | null;
    readonly isRunAlive: (runId: string) => boolean | null;
}): {
    readonly ok: true;
    readonly state: RoundState;
    readonly archiveExisting: boolean;
} | RoundRefusal;
export declare function closeRound(input: {
    readonly state: RoundState;
    readonly outcome: string;
    readonly reason?: string | undefined;
    readonly lessons?: readonly string[];
    readonly noNewKnowledge?: string | undefined;
    readonly tokens?: number | undefined;
    readonly agents?: number | undefined;
    readonly coder?: string | undefined;
    readonly reviewer?: string | undefined;
    readonly note?: string | undefined;
    readonly noCost?: boolean | undefined;
    readonly closedAt: string;
    readonly knownLessonIds: readonly string[];
    readonly stateId?: string | undefined;
}, io: {
    readonly writeLedger: (row: RoundLedgerRow) => unknown;
    readonly readLedgerTail: () => string;
}): {
    readonly ok: true;
    readonly row: RoundLedgerRow;
    readonly marker: string;
} | RoundRefusal;
export declare function listRounds(states: readonly RoundState[], input: {
    readonly now: number;
    readonly olderThanMinutes: number;
    readonly isPidAlive: (pid: number) => boolean | null;
    readonly isRunAlive: (runId: string) => boolean | null;
}): Array<{
    readonly state: RoundState;
    readonly ageMinutes: number;
    readonly pidAlive: boolean | null;
}>;
export {};
//# sourceMappingURL=round.d.ts.map