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
//# sourceMappingURL=score.d.ts.map