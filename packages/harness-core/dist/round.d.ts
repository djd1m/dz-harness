/**
 * A focused work round. The module owns decisions only: callers inject observed state, time,
 * lesson ids, ledger writing/reading and pid liveness. In particular, this file never imports a
 * filesystem or process API; the CLI owns `.dz/rounds/` and the witnessed ledger writer.
 */
import type { QeBridgeCost } from './review-cost.js';
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
    /** experiment-instrument FR-1/FR-3 (ADR-001): minted once at `openRound` — `--task` when given
     * (validated), else `slug@startedAt`. Optional at the TYPE level, not because a fresh round ever
     * omits it, but because a state file written before this feature landed has no such key on disk;
     * `closeRound` derives the same default for that legacy case and names the source (A4/A5). */
    readonly taskId?: string;
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
     *  (no explicit `--reviewer`) — `elapsedMs / 60000`, rounded to 1 decimal. review-cost-ledger
     *  fix-round-1 #1/#2 (ADR-001 п.2 amended): also present when an EXPLICIT `--reviewer` AGREES with
     *  the sidecar's own `gradedBy` (`reviewSource:'flag+qe-bridge'` below names that case). */
    readonly reviewMinutes?: number;
    /** measurement-integrity FR-7: present ONLY alongside `reviewMinutes` — names where `reviewer` and
     *  `reviewMinutes` came from, so a reader never confuses a sidecar-sourced figure for a flag.
     *  review-cost-ledger fix-round-1 #1/#2 (ADR-001 п.2 amended): `'qe-bridge'` when `reviewer` was
     *  FILLED from the sidecar (no `--reviewer` flag); `'flag+qe-bridge'` when an explicit `--reviewer`
     *  AGREES with the sidecar's own `gradedBy` (case-insensitive `family:model` equality, or a
     *  family-only flag matching the sidecar's family) — the flag's IDENTITY is confirmed by the
     *  sidecar, so its price/minutes are attributed too. A DISAGREEING explicit `--reviewer` is refused
     *  outright (`closeRound` never reaches row-building for that case) — never silently ignored. */
    readonly reviewSource?: 'qe-bridge' | 'flag+qe-bridge';
    /** experiment-instrument FR-1/FR-3 (ADR-001): the task identity this round's state carried (or, for
     *  a legacy state with no `taskId` on disk, the same `slug@startedAt` default `openRound` would have
     *  minted — always present, never null: a round always has a slug and a startedAt). */
    readonly taskId?: string;
    /** experiment-instrument A4/A5: present ONLY when `taskId` above was DERIVED here rather than read
     *  from the state file — i.e. the state predates this feature. A fresh round never carries this. */
    readonly taskIdSource?: 'derived-legacy';
    /** experiment-instrument FR-3/A2: the git sha `dz round close` resolved at close time (cli-only —
     *  the core never shells out), present only for a FINISHED outcome (`shipped|refuted`). */
    readonly shipSha?: string | null;
    /** experiment-instrument FR-3/A2: same timestamp as this row's own close (`closedAt`), present only
     *  alongside `shipSha` — the anchor "when was this shipped", not a duplicate of `date`. */
    readonly shippedAt?: string;
    /** experiment-instrument A2: present only when `shipSha` is `null` for a finished outcome — why the
     *  sha could not be resolved (e.g. "not a git repository", "git failed: …"). */
    readonly shipShaReason?: string;
    /** experiment-instrument r1-5 (Codex r1 HIGH #5, ADR-001 amended): `HEAD` alone does not identify
     *  what was actually shipped when the worktree carries uncommitted changes — this hub's own tree is
     *  ALWAYS dirty with unrelated files, so a clean-tree requirement was rejected; instead the row
     *  names the limit. `true` when `git status --porcelain` was non-empty at close time, `false` when
     *  empty, present only for a FINISHED outcome, alongside `shipSha`. */
    readonly shipTreeDirty?: boolean;
    /** experiment-instrument r1-5: present ONLY when `shipTreeDirty` above could not be determined (the
     *  `git status --porcelain` probe itself failed) — the same "never a bare unexplained gap" rule
     *  `shipShaReason` already follows, for the sibling probe. */
    readonly shipTreeDirtyReason?: string;
    /** review-cost-ledger FR-2/A2 (ADR-001 п.1-2): the qe-bridge reviewer's OWN price, from the stdout
     *  sidecar — present only when {@link reviewerCostSource} is `'qe-bridge-stdout'` (a usable price
     *  was found) or `'unavailable'` (present with the reviewer known but the price is not — `null` in
     *  that case, never omitted: NFR-4, "nothing is guessed"). */
    readonly reviewerCostUsd?: number | null;
    /** review-cost-ledger FR-2/A2: sum of the four token components below, present only alongside a
     *  successful {@link reviewerCostUsd} (`reviewerCostSource:'qe-bridge-stdout'`). fix-round-1 #5
     *  (Codex r1 HIGH #5): `null` — never a silently-zeroed sum — when the sidecar's own
     *  `tokens.tokensPartial` was `true` (at least one component was missing from the source JSON): an
     *  incomplete sum read as an exact zero is indistinguishable from a genuine zero-token review, which
     *  is the defect this field exists to avoid. */
    readonly reviewerTokens?: number | null;
    /** review-cost-ledger FR-2/A2: the same four components broken out, present only alongside a
     *  successful {@link reviewerCostUsd}. fix-round-1 #5: `partial:true` when the sidecar's `total`
     *  above is `null` for the reason described there — the four components themselves are still the
     *  real (possibly zero-substituted) values, only the aggregate is withheld. */
    readonly reviewerTokensBreakdown?: {
        readonly input: number;
        readonly output: number;
        readonly cacheCreation: number;
        readonly cacheRead: number;
        readonly partial?: true;
    };
    /** review-cost-ledger FR-2/A2/A3: `'qe-bridge-stdout'` when {@link reviewerCostUsd} is a real,
     *  parsed price; `'unavailable'` when a reviewer is known but no usable price could be found (the
     *  Codex limit, an unreadable/absent/unparseable stdout sidecar, or — fix-round-1 #2 — a sidecar
     *  price that exists but is NOT tied to this row's reviewer). Present ONLY in the same branch as
     *  {@link reviewMinutes}/{@link reviewSource} above (`reviewSource` is `'qe-bridge'` or
     *  `'flag+qe-bridge'`) — WITH two named exceptions, neither of which ever yields an `'ok'` price:
     *  (a) a Codex reviewer supplied via `--reviewer` with no matching signoff still gets `'unavailable'`
     *  + a reason naming the limit (ADR-001 п.3/FR-4); (b) an explicit `--reviewer` alongside a sidecar
     *  that carries a REAL cost record but is NOT tied to it (empty `gradedBy`, i.e. never fills
     *  `reviewer` and never agrees with it either) also gets `'unavailable'` — fix-round-1 #2 (Codex r1
     *  CRITICAL #2): an untied sidecar price, even `status:'ok'`, is NEVER attributed to an explicit
     *  reviewer it was not written for; a DISAGREEING sidecar (real `gradedBy`, does not match the flag)
     *  is refused outright by `closeRound` before any row is built at all (fix-round-1 #1/BLOCKER). */
    readonly reviewerCostSource?: 'qe-bridge-stdout' | 'unavailable';
    /** review-cost-ledger FR-2/A3: present ONLY alongside `reviewerCostSource:'unavailable'` — the
     *  status text explaining WHY (never a bare unexplained gap, same discipline as `shipShaReason`). */
    readonly reviewerCostReason?: string;
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
    /** review-cost-ledger FR-2/T3 (ADR-001 п.1): the reviewer's own price, read by the CALLER (the cli
     *  — `readQeBridgeCostSidecar`, T3) from the signoff's `rawStdoutFile` and parsed by
     *  `parseQeBridgeStdoutCost` (T1). `round.ts` never opens a file itself, same discipline as
     *  `gradedBy`/`elapsedMs` above. Absent when the caller never attempted a cost lookup at all
     *  (distinct from `{status:'absent'}`, which means a lookup WAS attempted and found nothing). */
    readonly cost?: QeBridgeCost;
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
    /** experiment-instrument FR-1 (ADR-001): explicit task identity for this round. Absent ⇒
     * `slug@startedAt` (minted below); present but invalid (empty, >120 chars, control characters) ⇒
     * refused (A1) — never silently substituted with the default. */
    readonly task?: string | undefined;
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
    /** experiment-instrument FR-3/A2/NFR-3: the git sha the CLI resolved (`git rev-parse HEAD`) — the
     *  core never shells out, so this always arrives as data, `null` when it could not be resolved.
     *  Only consulted for a FINISHED outcome (`shipped|refuted`); ignored otherwise. */
    readonly shipSha?: string | null | undefined;
    /** experiment-instrument A2: why `shipSha` is `null` (e.g. "not a git repository", "git failed: …")
     *  — required to explain a null sha on a finished outcome, ignored when `shipSha` is non-null. */
    readonly shipShaReason?: string | undefined;
    /** experiment-instrument r1-5: whether `git status --porcelain` in `projectRoot` was non-empty at
     *  close time (cli-resolved, same discipline as `shipSha` — the core never shells out). Ignored for
     *  an unfinished outcome, same as `shipSha`. */
    readonly shipTreeDirty?: boolean | undefined;
    /** experiment-instrument r1-5: why `shipTreeDirty` could not be determined — required only when the
     *  probe itself failed (`shipTreeDirty` absent), ignored otherwise. */
    readonly shipTreeDirtyReason?: string | undefined;
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
/**
 * experiment-instrument FR-1/FR-3 (ADR-001 D-A): the single source every OTHER writer (an auto ledger
 * row, a qe-bridge signoff, a control-review row) consults to find this slug's task identity —
 * never guessed, never minted here. `states` is whatever the CALLER already read as "currently open
 * round state files for this slug" (the cli walks `.dz/rounds/<slug>-*.json`); this function does not
 * touch a filesystem and does not assume the caller pre-filtered by slug, so it filters again itself.
 *
 * `unreadableStateCount` (r1-2, Codex r1 HIGH #2) is how many FILENAMES the caller found matching this
 * slug's pattern that it could NOT parse into a `RoundState` — a corrupt or half-written state file is
 * never silent absence; it means the true open-round count for this slug is UNKNOWN, not zero.
 *
 * - Any unreadable candidate exists AND no readable one does ⇒ `{taskId: null, source: 'unavailable'}`
 *   — a round MAY be open here, but its state cannot be read (r1-2).
 * - Any unreadable candidate exists ALONGSIDE at least one readable one ⇒ `{taskId: null, source:
 *   'ambiguous'}` — the readable one might not be the only genuinely open round (r1-2).
 * - Zero candidates at all (readable or not) ⇒ `{taskId: null, source: 'no-open-round'}` — no open
 *   round, nothing to fill from (A4).
 * - Two or more readable matches, no unreadable ones ⇒ `{taskId: null, source: 'ambiguous'}` — which
 *   one is authoritative is not decidable here; a NULL is the honest answer, never "the latest wins" (A5).
 * - Exactly one readable match, no unreadable ones ⇒ its `taskId` when the state carries one
 *   (`source: 'open-round'`), or the SAME `slug@startedAt` default `openRound`/`closeRound` would
 *   derive for a legacy state missing the field on disk — labelled `source: 'derived-legacy'` (r1-1,
 *   Codex r1 CRITICAL #1: this used to report `'open-round'` for an invented value, indistinguishable
 *   from a value the round itself actually minted).
 */
export declare function readOpenRoundTaskId(states: readonly RoundState[], slug: string, unreadableStateCount?: number): {
    readonly taskId: string | null;
    readonly source: 'open-round' | 'derived-legacy' | 'no-open-round' | 'ambiguous' | 'unavailable';
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