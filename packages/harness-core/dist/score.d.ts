/**
 * `dz score --slug <feature>` — score a feature-adr RUN's process discipline (feature dz-score,
 * Reading C of `features/dz-score/PROPOSAL.md`, chosen by the user 2026-07-28).
 *
 * It scores the PROCESS, not the code: were the ADR's safety properties given a named test? was
 * discrimination proven? did cross-model QE happen and what did it say? was the work verified live?
 * did the READMEs travel in the same change? did the learning loop run?
 *
 * Readings A (repo dashboard) and B (skill scoring) were rejected in the proposal: A invites
 * Goodharting the gates, B would be a fourth scoring surface. C is hard to game — the only way to
 * score well is to actually run the discipline.
 *
 * DESCRIPTIVE-ONLY, permanently: the command never gates, never exits non-zero on a low score.
 * The health-advisor 1.2.0 run is the reference case: its QE report marked the registration
 * criterion "✅ (mechanism)" with no live evidence — this scorecard exists to make that visible.
 *
 * Discriminators were chosen from a SURVEY of the 132 real runs on disk (34/77 ADRs carry a
 * Confirmation section; 31/75 QE reports carry MEASURED markers) — not guessed.
 *
 * PURE: the CLI reads the artifact files; this module only classifies.
 */
export type DisciplineVerdict = 'pass' | 'partial' | 'absent';
export interface DisciplineScore {
    readonly id: string;
    readonly title: string;
    readonly verdict: DisciplineVerdict;
    /** The line of evidence the verdict rests on — a scorecard must show its work. */
    readonly evidence: string;
}
export interface RunScorecard {
    readonly slug: string;
    readonly disciplines: readonly DisciplineScore[];
    /** Extracted cross-model grade, when one exists (e.g. "A−", "C"). */
    readonly qeGrade: string | null;
    /**
     * F30а-3, ADDITIVE: present when the run's artifacts carry a structured mutation table. Optional
     * on purpose — every scorecard written before this field existed stays a valid RunScorecard, and
     * `scoreAggregateRowFrom` keeps accepting rows without it. A run with no table reports `absent`
     * rather than omitting the field, so "the gate never ran" and "an older scorer wrote this row"
     * stay distinguishable.
     */
    readonly mutationEvidence?: MutationEvidence;
    readonly passed: number;
    readonly total: number;
    readonly summary: string;
}
/** The artifact texts of one run, keyed by RELATIVE path under `features/<slug>/`. */
/**
 * The exact heading Step 5 asks for, and the exact heading the check looks for — ONE constant, so
 * the two cannot disagree by editing.
 *
 * This is not tidiness. A recalled lesson at 0.90 relevance records the same defect already shipped
 * once here: "a generator prompt and its QE gate MUST agree on section vocabulary — Step-3's Write
 * instruction listed legacy ADR sections while the injected brief listed the current ones." A prompt
 * asking for one heading while a check greps another produces a gate that fails every honest run,
 * and a gate that fails every honest run gets switched off.
 *
 * The sandboxed workflow cannot import, so it carries this string INLINE; a test asserts the inline
 * literal equals this export, which turns "remember to update both" into a red test.
 */
export declare const OBSERVABILITY_SECTION = "Observability";
/**
 * Does an architecture artifact answer how the shipped feature will be watched?
 *
 * THREE outcomes, and the third is why this is usable at all:
 *  - `answered`      — the section is there.
 *  - `nothing-to-observe` — the section is there and says the feature emits nothing at runtime. A
 *    pure refactor or a CI-only gate genuinely does; a checker that cannot express a true fact is a
 *    checker people disable. The requirement is that the question is ANSWERED, not that it is yes.
 *  - `absent`        — no section. WARN-shaped by design: 107 architecture files predate this
 *    requirement, and a blocking verdict on day one would redden every re-run of every past feature.
 *
 * Honest limit, stated in ADR-002: nothing here verifies that a `nothing-to-observe` claim is TRUE.
 * The pipeline now asks. It does not ensure.
 */
export declare function observabilityAnswer(architectureMarkdown: string | undefined | null): 'answered' | 'nothing-to-observe' | 'empty' | 'absent';
export type RunArtifacts = Readonly<Record<string, string>>;
/**
 * F30а-3 — structured mutation evidence.
 *
 * `discrimination` has always scored PROSE: a sentence the author writes about their own work.
 * "None of the mutants survived" scores identically whether three mutations ran or zero did, which
 * makes the strongest discipline in the pipeline rest on the weakest kind of evidence. The mutation
 * gate already emits a five-valued verdict per registry entry, and only `PROVEN` is proof — so a
 * table carrying those verdicts can be COUNTED instead of believed.
 *
 * The design is defined by what it REFUSES. A table that looks like evidence and proves nothing is
 * worse than no table, because it buys the appearance of rigour: the empty one, the header-only one,
 * the one whose every row is INCONCLUSIVE. Each of those returns a non-proving status and is NAMED
 * in the scorecard evidence, never silently treated as corroboration.
 */
export type MutationEvidenceStatus = 'proven' | 'present-unproven' | 'malformed' | 'absent';
export interface MutationEvidence {
    readonly status: MutationEvidenceStatus;
    /** Rows whose verdict is exactly PROVEN. */
    readonly proven: number;
    /** Data rows found under the header (0 for the header-only table). */
    readonly rows: number;
    /** The line the verdict rests on — evidence must show its work. */
    readonly evidence: string;
}
export declare function readMutationEvidence(text: string): MutationEvidence;
export type GradeReadStatus = 'unique' | 'ambiguous' | 'none';
export interface GradeReading {
    readonly status: GradeReadStatus;
    /** The grade, ONLY when the report names one unambiguously. */
    readonly grade: string | null;
    /** Every distinct grade found, normalised — what makes an `ambiguous` verdict inspectable. */
    readonly found: readonly string[];
}
/**
 * Read the review grade a report states — and refuse to guess when it states more than one.
 *
 * The obvious rules are both WRONG, and both were measured before this was written (ADR-002):
 * FIRST match returns the round-1 grade of a report that was later fixed; LAST match returns a
 * section heading naming the pre-fix grade, or a sentence quoting a grade in prose. Across 154
 * real reports the two disagree in 14 files, and in `crossrt-2-codex-hooks` NEITHER is right —
 * its true verdict is an all-caps `GRADE A` the old regex could not see at all.
 *
 * So: a grade is reported only when every occurrence agrees. Otherwise the caller is told the
 * report is ambiguous, which is a fact about the report, not a missing number.
 */
export declare function readQeGrade(qeText: string): GradeReading;
export declare function extractQeGrade(qeText: string): string | null;
export declare function scoreRun(slug: string, artifacts: RunArtifacts): RunScorecard;
export declare function renderScorecard(card: RunScorecard): string;
/** The append-only projection of one immutable `score-<qeHash>.json` receipt. */
export interface ScoreAggregateRow {
    readonly ts: string;
    readonly slug: string;
    readonly qeHash: string;
    readonly passed: number;
    readonly total: number;
    readonly qeGrade: string | null;
    readonly disciplines: readonly {
        readonly id: string;
        readonly verdict: DisciplineVerdict;
    }[];
    /**
     * F30а-3, ADDITIVE: rows PROVEN by the mutation gate, when the scorecard carried a table.
     * `undefined` means the scorecard had no mutation field at all — which is NOT the same as `0`
     * (a table that ran and proved nothing). Every row written before this field existed keeps
     * parsing: the aggregate must never lose its history to a schema change.
     */
    readonly mutationProven?: number;
}
export interface ScoreReceiptInput {
    readonly content: string;
    readonly qeHash: string;
    /** Supplied by the impure caller. Receipt projection never reads a clock. */
    readonly ts: string;
}
/**
 * Parse one score receipt into the deliberately small aggregate schema.
 *
 * The caller owns I/O and supplies `ts`; this function is deterministic for the same input. A
 * syntactically valid but internally inconsistent scorecard is unreadable evidence, not a row the
 * aggregate should silently bless.
 */
export declare function scoreReceiptToAggregateRow(input: ScoreReceiptInput): ScoreAggregateRow;
/** Read only valid aggregate rows; event-chain verification separately names malformed lines. */
export declare function readScoreAggregateRows(text: string): ScoreAggregateRow[];
/** Keep the first occurrence of each `(slug, qeHash)` pair not already present in the aggregate. */
export declare function dedupeScoreAggregateRows(candidates: readonly ScoreAggregateRow[], existing: readonly ScoreAggregateRow[]): ScoreAggregateRow[];
export type ScoreAggregateVerdict = 'REPORTED' | 'INSUFFICIENT_DATA';
export interface ScoreDisciplineAggregate {
    readonly id: string;
    readonly pass: number;
    readonly partial: number;
    readonly absent: number;
}
export interface ScoreGradeAggregate {
    readonly grade: string | null;
    readonly count: number;
}
export interface ScoreAggregateReport {
    readonly verdict: ScoreAggregateVerdict;
    readonly receipts: number;
    readonly appended: number;
    readonly unreadable: number;
    /** Repo-relative receipt paths: unreadable evidence is always named, never only counted. */
    readonly unreadableReceipts: readonly string[];
    readonly disciplines: readonly ScoreDisciplineAggregate[];
    readonly grades: readonly ScoreGradeAggregate[];
}
/** Fold the aggregate into an advisory report. No readable rows is a third state, never success. */
export declare function buildScoreAggregateReport(rows: readonly ScoreAggregateRow[], unreadableReceipts: readonly string[], appended: number): ScoreAggregateReport;
export declare function renderScoreAggregateReport(report: ScoreAggregateReport): string;
//# sourceMappingURL=score.d.ts.map