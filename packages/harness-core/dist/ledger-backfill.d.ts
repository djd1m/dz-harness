/**
 * Fill the run-cost ledger's missing numbers from the host's own workflow record.
 *
 * THE DEFECT THIS CLOSES (MEASURED 2026-08-25). `.dz/feature-adr/run-cost-ledger.jsonl` had 87 rows:
 * 66 hand-typed rows carried `tokens`/`minutes`, and ALL 20 rows written automatically by the
 * pipeline carried `tokens:null, minutes:null, agents:null`. So "what did this feature cost" was
 * answerable only for runs a human retyped — 76% of the data was manual transcription.
 *
 * The numbers were never MISSING. They sit in the Claude Code host's workflow record (per-agent
 * `tokens` and `durationMs`, verified to sum to the record's own total), and `deriveCostLedger`
 * already reads them. The sandboxed workflow legitimately cannot: it has no filesystem and never
 * sees the completion notification, which is why it writes `null` rather than an estimate — the
 * right call, and the reason this join belongs on the dz side, AFTER the run.
 *
 * FOUR RULES, each one a test:
 *  1. A derived number is MARKED ({@link LEDGER_FILL_SOURCE}). A number we computed must never be
 *     indistinguishable from a number the operator asserted.
 *  2. A non-null value is NEVER overwritten. The operator's number is their claim about their run;
 *     ours is a derivation. When they disagree, theirs stands and the disagreement is reported.
 *  3. A row we cannot fill is REPORTED, never silently skipped — no `runId`, or a `runId` with no
 *     host record, comes back named. Silence would read as "nothing left to fill".
 *  4. Every other field and the row ORDER survive byte-for-byte. This rewrites an append-only log;
 *     the only defensible rewrite is one that changes exactly the fields it says it changes.
 *
 * @packageDocumentation
 */
/** Marks a value this module derived from the host record rather than one a human typed. */
export declare const LEDGER_FILL_SOURCE = "host-record";
/**
 * HOW the row was matched to a host record. This is not decoration: the two are different strengths
 * of evidence and a reader must be able to tell them apart.
 *
 *  - `runId` — the row named the run. Exact.
 *  - `slug`  — the row named only the feature, and exactly ONE host run carried that slug. A feature
 *    run twice has two runs with one slug, and attributing one run's spend to the other row would be
 *    a fabrication, so an ambiguous slug is REFUSED rather than resolved to the first match.
 */
export type LedgerFillKey = 'runId' | 'slug';
/** The facts lookup returns this when the row's key matches MORE THAN ONE host run. */
export declare const AMBIGUOUS: "ambiguous";
/** What the host record knows about one run. `null` for a field the record itself did not carry. */
export interface RunCostFacts {
    readonly tokens: number | null;
    readonly minutes: number | null;
    readonly agents: number | null;
}
/** One row's outcome. `filled` lists the field names that changed — empty means nothing did. */
export interface LedgerBackfillRow {
    readonly index: number;
    readonly runId: string | null;
    /** The row's feature slug, used as the fallback join key when it names no run. */
    readonly slug: string | null;
    /** Which key actually matched, when something was filled. */
    readonly key: LedgerFillKey | null;
    readonly filled: readonly string[];
    /** Why nothing was filled. `null` when something was. */
    readonly skipped: 'no-join-key' | 'no-host-record' | 'ambiguous-slug' | 'shared-run-claim' | 'already-complete' | 'malformed-line' | 'host-record-empty' | null;
}
export interface LedgerBackfillPlan {
    /** The ledger's lines after the fill — same count, same order, one JSON object per line. */
    readonly lines: readonly string[];
    readonly rows: readonly LedgerBackfillRow[];
    readonly filledRows: number;
    /** Fields whose existing value DISAGREES with the derived one. Reported, never overwritten. */
    readonly disagreements: readonly {
        index: number;
        field: string;
        existing: number;
        derived: number;
    }[];
}
/**
 * Plan the fill. PURE: takes the ledger's raw lines and a runId→facts lookup, returns the new lines.
 * Nothing is read or written here — the caller owns the file and the atomic replace.
 */
export declare function planLedgerBackfill(input: {
    readonly lines: readonly string[];
    /**
     * Resolve one join key to the host record's numbers. Returns {@link AMBIGUOUS} when the key
     * matches more than one run — the caller must NOT collapse that to "no record": one is "we have
     * nothing", the other is "we have too much to choose honestly", and only the second is a defect
     * in the ledger's own key.
     */
    readonly facts: (key: LedgerFillKey, value: string) => RunCostFacts | typeof AMBIGUOUS | null;
}): LedgerBackfillPlan;
/** A candidate host run, as {@link CostLedgerRunRef} exposes it. */
export interface LedgerRunCandidate {
    readonly runId: string;
    readonly slug: string | null;
    readonly startedAtMs: number | null;
}
/**
 * Resolve the run a ledger row is being written FOR, at write time.
 *
 * This is the fix for the root defect behind the whole backfill: the sandboxed workflow has no
 * access to its own run id — it is not in `args` and not a sandbox global — so a row it writes can
 * never name one, and 16 of 20 automatic rows carried no join key at all (MEASURED 2026-08-25).
 *
 * The command that APPENDS the row does run on the host, where the records live, so it can answer
 * the question the sandbox cannot. Resolving here rather than afterwards is strictly better: at
 * write time the run is IN FLIGHT and is simply the newest one for that slug, while an hour later
 * the same slug may have several and the choice becomes a guess.
 *
 * Refuses rather than guesses in every unclear case:
 *  - no slug, or no candidate for it → `null`;
 *  - the newest candidate is TIED with another on `startedAtMs`, or has no timestamp at all → `null`,
 *    because "newest" is then not a fact;
 *  - a row that already names a run keeps it — resolution never overwrites.
 */
export declare function resolveLedgerRunId(row: {
    readonly runId?: unknown;
    readonly slug?: unknown;
}, runs: readonly LedgerRunCandidate[]): string | null;
//# sourceMappingURL=ledger-backfill.d.ts.map