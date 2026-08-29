/**
 * re-QE debt — the pure half of `dz reqe` (backlog 6b40e667, goal honest-quality).
 *
 * The cross-model-QE guard ("the model that writes code must not self-review") is an ADR-named
 * safety property of the feature-adr pipeline. The usage-adaptive override consciously SUSPENDS it
 * (FR-2.9): at >= threshold usage every remaining stage — including Step-8 QE — switches to Codex,
 * so coder and reviewer become the SAME family. The rule doc said "run an independent re-QE after
 * limits reset" — a human instruction on the weakest detection layer. This module turns it into a
 * DEBT with a lifecycle:
 *
 *   emit   — the workflow records features/<slug>/.fa-state/reqe-due.json when Step-8 actually ran
 *            same-family under the override (not on every switch — a switch before Step 8 that
 *            still got cross-family QE creates no debt);
 *   list   — `dz reqe` scans the debts; `dz usage` surfaces the count so the moment limits free up
 *            is the moment the debt is visible;
 *   brief  — `dz reqe --slug <s>` prints a ready cross-family review brief (the OTHER family than
 *            the coder);
 *   settle — `dz reqe --slug <s> --done --report <file>` clears the debt FAIL-CLOSED: only against
 *            an existing, non-trivial report that names a grade; the settlement is appended to
 *            08_qe_report.md so the artifact trail closes.
 *
 * HONEST SCOPE: nothing here re-runs QE automatically (no background spend — the human decides);
 * the same-family CLAUDE belt fallback (codex unavailable) is out of scope by design — it is
 * already logged loudly at run time and is not a limit-pressure artifact; runs from before this
 * feature carry no marker and are UNDETERMINABLE, not debt-free.
 */
export declare const REQE_SCHEMA = "reqe-due-1";
export declare const REQE_SCOPE: string;
export type ModelFamily = 'claude' | 'openai';
/** Family classification shared with the workflow's acFamOf (codex/gpt/openai markers ⇒ openai).
 * DELIBERATELY binary over the workflow's own CONTROLLED vocabulary (coderUsed ∈ claude | codex |
 * codex-fallback; qeReviewerUsed ∈ claude | codex) — this is never fed arbitrary model ids, so the
 * claude default is the correct reading of "not a codex marker", not a fail-open (Codex QE #11,
 * accepted with this documentation). */
export declare function modelFamily(spec: string | null | undefined): ModelFamily;
export interface ReqeEmitDecision {
    emit: boolean;
    reason: string;
}
/** Emit iff the QE stage label carries the workflow's ' (usage-switched)' marker AND the reviewer
 * family equals the coder family. Marker-only (cross-family survived the switch) or same-family
 * WITHOUT the marker (the codex-unavailable Claude belt — degraded loudly at run time, not a
 * limit-pressure artifact) both create NO debt. */
export declare function shouldEmitReqeDebt(input: {
    coderUsed: string | null | undefined;
    qeReviewerUsed: string | null | undefined;
    qeModelLabel: string | null | undefined;
}): ReqeEmitDecision;
export interface ReqeDebt {
    schema: typeof REQE_SCHEMA;
    slug: string;
    coderFamily: ModelFamily;
    qeFamily: ModelFamily;
    qeGrade: string | null;
    reason: string;
    emittedAt: string | null;
    /** The emitting run's identity (the workflow's qe inputHash). Lets a LATER run on the same slug
     * emit a fresh debt even though an older settlement exists, while the SAME run's resume never
     * re-opens a debt its settlement already covered (Codex QE round-2 #2). Optional: debts from
     * before this field settle normally. */
    runStamp?: string | null;
}
/** Build the debt record (the workflow serializes this; emittedAt is stamped by the writer agent's
 * shell `date`, so the sandbox needs no Date). */
export declare function buildReqeDebt(input: {
    slug: string;
    coderUsed: string | null | undefined;
    qeReviewerUsed: string | null | undefined;
    qeGrade: string | null | undefined;
    reason: string;
    emittedAt?: string | null;
}): ReqeDebt;
/** Parse + validate a debt file's text. null = not a valid debt (the caller reports it as
 * malformed — a corrupt debt file is NAMED, never silently dropped). */
export declare function parseReqeDebt(text: string): ReqeDebt | null;
export interface ReqeBrief {
    reviewFamily: ModelFamily;
    header: string;
    instructions: readonly string[];
    codexCmdTemplate: string | null;
}
/** The ready-to-run cross-family review brief. Review family = the OTHER family than the CODER
 * (reviewing with the other-than-reviewer family would let a codex-coded, codex-reviewed run be
 * "re-reviewed" by codex again). */
export declare function buildReqeBrief(debt: ReqeDebt, artifactsDir: string): ReqeBrief;
export interface ReqeSettlement {
    ok: boolean;
    error: string | null;
    grade: string | null;
    epilogue: string | null;
}
/** Extract the verdict grade from a report, or null. LINE-ANCHORED and range-proof (Codex QE #7):
 * the boilerplate phrase `GRADE A-F` must not read as grade A, so a letter followed by a dash and
 * another grade letter is rejected; and the grade must head its line (a quoted "do not assign
 * GRADE A" mid-paragraph is not a verdict). Conflicting distinct grades ⇒ null (ambiguous). */
export declare function extractReportGrade(text: string): string | null;
/** FAIL-CLOSED settlement validation: the report must be non-trivial (>= 200 chars of substance)
 * and must NAME exactly one line-anchored grade. A settlement that cannot cite its evidence is
 * refused — clearing a debt against an empty file would re-open the exact hole this feature closes.
 * HONEST LIMIT (documented, not hidden): the validator proves the settlement is PROCEDURALLY sound
 * (a distinct, graded report exists); it cannot prove which model authored the text — attribution
 * stays with the human running the brief. */
export declare function settleReqeDebt(debt: ReqeDebt, reportText: string, reportPath: string): ReqeSettlement;
/** Render the debt list for `dz reqe` / the `dz usage` surfacing line. */
export declare function renderReqeList(debts: readonly ReqeDebt[], malformed: number): string[];
//# sourceMappingURL=reqe.d.ts.map