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
    /** experiment-envelope FR-3(в): the envelope the pipeline built after its Step-0 router, carried
     * unchanged through `round open --envelope` into `closeRound`'s ledger row. Opaque here (never
     * interpreted by round.ts) — validated once, at `openRound`, and trusted from then on. */
    readonly envelope?: unknown;
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
    /** measurement-integrity FR-7: was always `null` before this feature — `shipped|refuted` now
     *  requires a real grade; `blocked|abandoned` still writes `null` (a review that never finished has
     *  nothing to grade). */
    readonly grade: string | null;
    readonly outcome: RoundOutcome;
    readonly reason: string | null;
    readonly round: number;
    readonly lessons: readonly string[];
    readonly noNewKnowledge: string | null;
    readonly note: string;
    readonly date: null;
    readonly costIn?: 'stages';
    /** experiment-envelope FR-3(в): copied verbatim from the state that closed this round, when present. */
    readonly envelope?: unknown;
    /** round-state-lock (lead edit after Codex re-review): identity of the state instance this row
     * closes — lets a retried `close` detect its own earlier row regardless of the clock. */
    readonly stateId?: string;
    /** measurement-integrity FR-7: present ONLY when `reviewer` was filled from the qe-bridge sidecar
     *  (no explicit `--reviewer`) — `elapsedMs / 60000`, rounded to 1 decimal. */
    readonly reviewMinutes?: number;
    /** measurement-integrity FR-7: present ONLY alongside `reviewMinutes` — names where `reviewer` and
     *  `reviewMinutes` came from, so a reader never confuses a sidecar-sourced figure for a flag. */
    readonly reviewSource?: 'qe-bridge';
}
/**
 * measurement-integrity FR-7: the qe-bridge cross-model-review signoff for THIS round — read by the
 * CLI from `features/<slug>/.fa-state/qe-bridge/signoff-*.json`, selected by matching `slug` AND
 * falling inside THIS round's own `[startedAt, closedAt]` interval (fix-round-1/F9, Codex r1 HIGH
 * #9 — the CLI-side lookup, `findQeBridgeSignoffForRound`, is what enforces that; multiple qualifying
 * signoffs there are an AMBIGUITY refusal, never "the latest wins"), passed in here as DATA.
 * `closeRound` never opens a file.
 */
export interface RoundReviewSidecar {
    /** Who graded it — family + model, e.g. `codex:gpt-5.6-sol`. */
    readonly gradedBy: string;
    readonly elapsedMs: number;
    /** The sidecar's OWN verdict, when it carries one — checked against `--grade` for a conflict. */
    readonly grade?: string | null;
    /** measurement-integrity fix-round-1/F9: the slug this signoff was written FOR — carried through so
     *  a reader of the eventual ledger row can independently confirm it was not another slug's file. */
    readonly slug?: string;
    /** measurement-integrity fix-round-1/F9: the qe-bridge review's OWN internal run id (from the
     *  signoff filename, `signoff-<runId>.json`) — a DIFFERENT id space from `RoundState.run` (which
     *  names a feature-adr pipeline run); carried for traceability/audit, never used as a join key. */
    readonly runId?: string | null;
    /** measurement-integrity fix-round-1/F9: when this signoff was emitted — the timestamp
     *  `findQeBridgeSignoffForRound` uses to confirm it falls inside THIS round's own interval. */
    readonly emittedAt?: string;
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
    /** experiment-envelope FR-3(в)/AC-5: when present, validated BEFORE anything else — an invalid
     * envelope refuses the open (exit 2) with the validator's own reason, same as any other malformed
     * input to this command. Absent stays absent (round open without --envelope is unaffected). */
    readonly envelope?: unknown;
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
    /** measurement-integrity FR-7: `A`, `A-`, `B+`, … — mandatory for `shipped|refuted`, a
     *  warned-and-dropped no-op for `blocked|abandoned`. */
    readonly grade?: string | undefined;
    /** measurement-integrity FR-7: the qe-bridge signoff for this slug, read by the CALLER. */
    readonly reviewSidecar?: RoundReviewSidecar | undefined;
}, io: {
    readonly writeLedger: (row: RoundLedgerRow) => unknown;
    readonly readLedgerTail: () => string;
}): {
    readonly ok: true;
    readonly row: RoundLedgerRow;
    readonly marker: string;
    readonly warnings: readonly string[];
} | RoundRefusal;
/**
 * measurement-integrity fix-round-1/F8 (Codex r1 CRITICAL #8): validate an ALREADY-WRITTEN ledger
 * row against the CURRENT schema's `shipped|refuted require a grade` rule (ADR-001 D5 / FR-7).
 *
 * This exists for exactly one caller: `dz round close`'s idempotent-retry path. When the predicted
 * marker (or `stateId`) is already found in the ledger tail, the CLI used to skip `closeRound`
 * ENTIRELY and delete the round's state file — so an OLD row written before FR-7 shipped (`shipped`
 * with `grade: null`, the exact defect this feature exists to close) could be "recognised as already
 * closed" and the state removed without ever being checked against the rule that is supposed to be
 * mandatory. This function is that missing check, run on the ALREADY-FOUND row before the CLI is
 * allowed to treat the retry as a success.
 *
 * Deliberately NARROW: it re-checks only the ONE FR-7 invariant (a schema rule with a proving test),
 * not every field `closeRound` validates on the FIRST write (grade format, envelope shape, …) — those
 * were already enforced when the row was ORIGINALLY written; re-validating them here would either
 * duplicate that logic or silently drift from it. Pure, never throws.
 */
export declare function validateClosedRoundLedgerRow(row: unknown): {
    readonly ok: true;
} | {
    readonly ok: false;
    readonly reason: string;
};
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