/**
 * Amendment traceability — the deterministic half of the Step-8 amendment gate (ADR-001).
 *
 * The gate used to be a paragraph of prompt text asking the QE agent to confirm that every `AM-N`
 * row names a real test. That is layer 4 on the cost-of-detection ladder, and the recalled lesson at
 * reward 1.00 says what happens next: a safety property that lives only in a prompt disappears with
 * the next prompt. `features/qe-scoped-review/08_qe_report.md` recorded the outcome — five ids named,
 * none existing, and the plan writing `## Amendments: None`.
 *
 * Everything here is PURE: text in, verdicts out, file access through an injected reader (NFR-1).
 * The CLI owns I/O and the exit code; this module owns the grammar and the rules.
 *
 * NOT PROVEN HERE: that a resolved test is non-vacuous. `dz discrimination-check` owns "would this
 * test still pass with the protection deleted" (non-goal NG-1, acid case A8). A checker that implied
 * it proved vacuity would be the same lie in a new place.
 */
/** One `AM-N` row as it appears in a `## Amendments` section. */
export interface AmendmentRow {
    readonly id: string;
    readonly testIds: readonly string[];
    readonly file: string | null;
    /** The row's literal text, fenced examples included — what the author wrote. */
    readonly raw: string;
    /**
     * The same slice with non-rendered regions (fenced blocks, HTML comments) blanked out, same
     * length, so an index means the same byte in both. EVERY semantic read goes through this one —
     * pointers, retraction, subject — because an EXAMPLE inside a row's block is not that row's
     * answer.
     *
     * OPTIONAL, and that is a compatibility promise rather than sloppiness: round 4 made it REQUIRED
     * and thereby broke every downstream constructor of a row the previous release accepted — a
     * TypeScript consumer stopped compiling, and a legacy or deserialised row reaching
     * `amendmentsMissingFromPlan` threw `TypeError: Cannot read properties of undefined (reading
     * 'split')` (MEASURED 2026-09-06, Codex cross-family review round 5, P1). Every read goes through
     * `rowScan()`, which falls back to `raw` — the honest degradation for a row that was built
     * without a mask and therefore has no masked text to offer.
     *
     * MEASURED 2026-09-06 (Codex cross-family review round 4, P2): row starts were found in the mask
     * while the text was sliced from the original, so a testless `AM-1` followed by a fenced
     * `AM-2 … → test \`x\` in \`x.ts\`` example borrowed the example's pointer, resolved, and the
     * gate answered `pass` with exit 0. Finding in the mask and reading past it is not masking.
     */
    readonly scan?: string;
}
export type AmendmentVerdict = 'resolved' | 'placeholder'
/**
 * The plan RETRACTED this amendment and named its successor. A first-class outcome, never a
 * failure: a plan is allowed to change its mind, and until 2026-08-25 this checker had no concept
 * of it at all (`grep superseded` over this file returned nothing), so a legitimately retracted
 * amendment read as `unnamed` and failed the run. C6 has accepted the form since it was written —
 * this is the half of the contract that was missing here.
 *
 * Honest limit, stated in ADR-001: nothing verifies that the named successor EXISTS, or that the
 * retraction was justified. Refusing retraction outright is what produced the false failures.
 */
 | 'superseded' | 'unnamed' | 'no-file-named' | 'file-missing' | 'name-absent-in-file';
export interface AmendmentResolution {
    readonly id: string;
    readonly testId: string | null;
    readonly file: string | null;
    readonly verdict: AmendmentVerdict;
    readonly detail: string;
}
export type AmendmentOutcome = 'pass' | 'fail' | 'skip' | 'not-established';
export interface AmendmentDecision {
    readonly outcome: AmendmentOutcome;
    /** Derived FROM the outcome — one mapping, never two (AM-3, acid case A3/A7). */
    readonly exit: 0 | 1 | 3;
    readonly reasons: readonly string[];
    readonly counts: Readonly<Record<AmendmentVerdict, number>>;
}
/**
 * Below this many normalised characters an id is too short to match anything meaningfully: the
 * substring rule ADR-002 accepts would fire on unrelated prose. Guards the degenerate case the ADR
 * names as its known false-positive risk.
 */
export declare const MIN_MATCHABLE_ID_LENGTH = 8;
/** Case- and separator-folded form. Authors write ids in prose (`a_b_c`); test titles are sentences. */
/**
 * Every `it()` / `test()` / `describe()` title in a test file. Empty when none parse.
 *
 * Comments are stripped FIRST. A commented-out `it('deny admin writes')` is not a test, and counting
 * it would leave open the very forgery the title basis exists to close — the cross-family reviewer's
 * two-comment-line attack in a slightly better costume. Table forms (`test.each([…])('…')`) carry an
 * argument list between the modifier and the title, so the pattern allows one.
 */
export declare function extractTestTitles(body: string): string[];
export declare function normalizeTestId(s: string): string;
/** Every distinct amendment id mentioned in `text`, in first-seen order. */
export declare function amendmentIdsIn(text: string): string[];
/**
 * Does `text` mention `id` AS AN ID? `AM-10` is not a mention of `AM-1`, and `AM-CP-1` is not a
 * mention of `AM-1` — both are what a `String.includes` check answers wrongly.
 */
export declare function mentionsAmendmentId(text: string, id: string): boolean;
/**
 * How many RENDERED `## Amendments` sections the document opens. More than one is a document that
 * contradicts itself, and until 2026-09-06 the FIRST one answered for all of them: a stale
 * `## Amendments: None` left above the real section made the explicit-none branch exit 0 while the
 * real section's unresolved rows were never parsed (Codex round 6, P2 — MEASURED `skip`, exit 0).
 */
/** Where the document contradicts its own "no amendments" declaration. */
export interface AmendmentAmbiguity {
    /** 1-based line in the ORIGINAL document. */
    readonly line: number;
    /** the offending line, trimmed and capped — evidence, not a hint. */
    readonly text: string;
}
/**
 * The FAIL-CLOSED half of the explicit-none contract (Codex cross-family review round 7).
 *
 * Seven rounds produced one outcome again and again: an ambiguous document answering `skip`/exit 0.
 * Each round closed the parser hole that round's fixture used — and the next fixture used the next
 * hole. This function stops paying that toll by inverting the burden: a declaration of "no
 * amendments" is honoured ONLY IF the rendered document carries no amendment-shaped content below
 * it. Anything AM-like with zero parsed rows means the PARSER and the DOCUMENT disagree, and the
 * honest verdict for a disagreement is NOT-ESTABLISHED, never a pass and never a skip.
 *
 * Scanned in the block-scanned text, so fenced examples and HTML comments are already out; scanned
 * from the section heading DOWN, which is deliberately more than "below the declaration" — the
 * conservative direction here is to see more, because every miss is an exit 0.
 */
export declare function amendmentDeclarationAmbiguity(md: string): AmendmentAmbiguity | null;
export declare function amendmentSectionCount(md: string): number;
/** The `## Amendments` section body, or null when the document has none (acid case A5). */
export declare function amendmentSection(md: string): string | null;
/** `## Amendments` present but recording nothing to check — distinct from the section being absent. */
export declare function planSaysNoAmendments(planMd: string): boolean;
export declare function parseAmendments(md: string): AmendmentRow[];
export declare function resolveAmendments(rows: readonly AmendmentRow[], opts: {
    readFile: (p: string) => string | null;
}): AmendmentResolution[];
export declare function decideAmendmentOutcome(input: {
    sectionPresent: boolean;
    rows: readonly AmendmentRow[];
    resolutions: readonly AmendmentResolution[];
    planSaysNone: boolean;
    readError?: string | null;
    /** Ideation amendments the plan fails to carry — absent, or reworded under the same id. */
    missingFromPlan?: readonly {
        id: string;
        kind: 'dropped' | 'subject-changed';
    }[];
    /**
     * How many RENDERED `## Amendments` sections the inputs open (`amendmentSectionCount`). Optional
     * for backward compatibility — absent means "not measured", never "exactly one".
     */
    sectionCount?: number;
    /**
     * Amendment-shaped content found below the section heading in RENDERED text
     * (`amendmentDeclarationAmbiguity`). Optional for backward compatibility — absent means "not
     * measured". Present WITH zero parsed rows is the fail-closed trigger: parser and document
     * disagree, so the run is inconclusive rather than skipped.
     */
    ambiguity?: {
        readonly line: number;
        readonly text: string;
    } | null;
}): AmendmentDecision;
/** The one line every caller reads last, in the K2 gate's own shape so the two read alike. */
export declare function amendmentVerdictLine(d: AmendmentDecision): string;
/** Printed on every run: this checker does NOT prove a resolved test discriminates (NG-1, A8). */
export declare const AMENDMENT_VACUITY_NOTE = "note: this checks that each amendment RESOLVES to a real test, not that the test is non-vacuous \u2014 `dz discrimination-check` owns vacuity.";
/**
 * The amendment's own text with the `→ test …` pointer clause and markdown furniture removed — what
 * "carry AM-N into the plan verbatim" is actually about. The POINTER may legitimately change (tests
 * are named later than ideation guesses); the SUBJECT may not.
 */
export declare function amendmentSubject(raw: string): string;
export interface PlanCoverageGap {
    readonly id: string;
    readonly kind: 'dropped' | 'subject-changed';
}
/**
 * Ideation amendments the plan fails to carry: either absent outright, or present under the same id
 * with a DIFFERENT subject. Cross-family review (Codex gpt-5.6-sol, 2026-08-21) found the second
 * case: comparing ids alone let a plan swap "deny unauthenticated deletes" for "render footer" under
 * the same `AM-1` and still pass.
 */
export declare function amendmentsMissingFromPlan(ideationRows: readonly AmendmentRow[], planRows: readonly AmendmentRow[]): PlanCoverageGap[];
//# sourceMappingURL=amendment-trace.d.ts.map