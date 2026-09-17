/**
 * cross-family-control-branch (ADR-001, tier M): the pure core of `dz control-review` and
 * `dz score --by-family` — normalization, matching, diffing and ledger aggregation for the
 * measurement of foreign-unique findings between two INDEPENDENT reviews of the same tree.
 *
 * PURE, deliberately: no node:fs / node:child_process import here (NFR-1, guarded by
 * test/core-boundary.test.ts). Every file read, subprocess spawn or hash computation belongs to
 * the CLI (`dz control-review`), same as every other core module (qe-findings.ts, qe-bridge.ts).
 *
 * Context (ADR-001): every review in the run-cost ledger and every qe-bridge signoff is ONE
 * direction over one tree — there was no observation of whether the OTHER family finds what the
 * coder's own family misses. This module answers that by diffing two closed-vocabulary finding
 * lists (Codex's `## Findings ledger` table, Claude's qe-bridge signoff) over the SAME scope.
 *
 * ── Fix round 1 (codex-r1-verdict.txt, Grade C, 17 findings) — the vocabulary shift ──────────────
 * Round 1 called an automatic title/location match "matched" — an OVERLAP claim. Codex r1 finding 1
 * proved that claim false with two real counter-examples (a 4/6-token false pair; two unrelated
 * findings in the same file three lines apart). The fix is not a smarter matcher — a smarter matcher
 * still guesses — it is an honest vocabulary: automatic pairs are **candidates**, never overlap.
 * Only a human adjudication produces a **confirmed** pair. Every output (`ControlDiff`, the ledger
 * row, `dz score --by-family`) now keeps FOUR buckets apart: `confirmed`, `candidate`, `onlyCodex`,
 * `onlyClaude` — and the word "overlap"/"matched" is reserved for `confirmed` alone.
 */
import { type QeSeverity, type QeStatus } from './qe-findings.js';
/**
 * The Codex control brief and the Claude qe-bridge signoff both speak the informal
 * critical/major/minor vocabulary (`buildBridgePrompt`'s own brief text: "a severity
 * (critical/major/minor)"). This maps that vocabulary onto the CLOSED `QeSeverity` dictionary
 * qe-findings.ts already defines — `critical`→`CRITICAL`, `major`→`HIGH`, `minor`→`LOW` — and
 * refuses (returns `null`) anything else, case/whitespace-insensitive. The CALLER decides what a
 * refusal means (A4: the finding is written into a `refused` bucket with a named reason, never
 * coerced to the nearest known value — coercion here would make the resulting severity tally
 * unprovable, the same argument qe-findings.ts already makes for its own closed dictionaries).
 */
export declare function normalizeBridgeSeverity(s: string): QeSeverity | null;
/**
 * Lowercase, strip punctuation/backticks (anything that is not a Unicode letter or digit becomes
 * a separator), split on whitespace, keep tokens of length >= 3, deduplicate, sort. The resulting
 * token SET is what `matchFindings`/`dedupeWithinFamily` compare with Jaccard similarity — a
 * bag-of-words match, not a substring one, so word order never matters.
 */
export declare function normalizeFindingTitle(t: string): string[];
export interface ControlFinding {
    readonly family: 'codex' | 'claude';
    readonly id: string;
    readonly severity: QeSeverity;
    readonly title: string;
    readonly file?: string;
    readonly line?: number;
    readonly status?: QeStatus;
}
export interface MatchPair {
    readonly a: string;
    readonly b: string;
    readonly rule: 'title-jaccard' | 'file-line';
    readonly score: number;
}
/**
 * Deterministic MAXIMUM-CARDINALITY matching between two finding lists, sum-of-score as the
 * secondary objective (ADR-001, amended after Codex r1 finding 2 — greedy-by-score needlessly
 * drops valid pairs: titles `A1/B1="alpha beta gamma delta"`, `A2="gamma delta"`,
 * `B2="alpha beta"` greedily keep only A1–B1 and lose two genuine pairs A1–B2/A2–B1).
 *
 * Solved as a weighted bipartite ASSIGNMENT (Hungarian): a real candidate edge costs
 * `-(BONUS + score)` with `BONUS = 1 + min(rows, cols)`; a non-candidate edge costs `0`. Lead delta
 * after Codex r2 (new HIGH #1): a bonus of `1` did NOT make cardinality dominant — two score-1 edges
 * (weight 4) beat three score-0.25 edges (weight 3.75). Since every score is <= 1, the total score of
 * ANY matching is < min(rows, cols) + 1 = BONUS, so one extra edge always outweighs any score
 * difference: cardinality first, total score second, in one assignment.
 *
 * Two rules propose CANDIDATES (never confirmed overlap — Codex r1 finding 1: an automatic pair,
 * however matched, is a candidate for lead adjudication, printed as such everywhere it travels):
 *  - title Jaccard >= `opts.jaccard` (default 0.5) on tokens of length >= 3, AND a compatible file
 *    (r1-1: a file that DISAGREES between the two findings disqualifies an otherwise-good title
 *    match — two findings about the "same" defect in two different files are two defects);
 *  - same file with `|line delta| <= opts.lineSlack` (default 3) AND title Jaccard >=
 *    `opts.fileLineJaccard` (default 0.2) — r1-1's second counter-example: same file, adjacent
 *    lines, ZERO shared vocabulary used to pair for free; a location match now needs SOME
 *    corroborating text, not just proximity.
 * A pair meeting neither rule's threshold is never proposed — "below-threshold titles stay
 * unique" remains the load-bearing property this module protects.
 */
export declare function matchFindings(a: readonly ControlFinding[], b: readonly ControlFinding[], opts?: {
    readonly jaccard?: number;
    readonly lineSlack?: number;
    readonly fileLineJaccard?: number;
}): {
    readonly pairs: readonly MatchPair[];
};
/**
 * A5: collapse near-duplicate findings WITHIN one reviewer's own list (Jaccard >= 0.8 on titles,
 * a tighter threshold than cross-family matching since these are the SAME reviewer restating
 * itself, e.g. across multiple table rows). The first occurrence in list order is kept; every
 * later near-duplicate is recorded in `collapsed` rather than silently dropped.
 *
 * r1-3 (Codex r1 finding 3): collapsing on title tokens ALONE let two DISTINCT defects with the
 * same generic title ("missing null check in parser") in two different files collapse into one —
 * a real defect silently lost. A location disagreement now blocks the collapse: two findings only
 * collapse when their files are COMPATIBLE (both absent, or identical) — same rule `matchFindings`
 * applies across families, applied here within one.
 */
export declare function dedupeWithinFamily(list: readonly ControlFinding[], jaccardThreshold?: number): {
    readonly kept: ControlFinding[];
    readonly collapsed: ReadonlyArray<{
        readonly kept: string;
        readonly dropped: string;
    }>;
};
/**
 * Explicit lead adjudication, read from `--adjudicate <file>`: named `pairs` OVERRIDE the
 * automatic match for the ids they name (in either direction — a pair may correct a wrong auto
 * match or supply one the automatic rule missed) and become CONFIRMED overlap. `none` marks
 * findings the lead has confirmed have NO counterpart in the other family (excluded from the
 * automatic pool, so they land in `onlyCodex`/`onlyClaude` on purpose rather than by omission).
 *
 * r1-5 (Codex r1 finding 5): `none` entries are now FAMILY-QUALIFIED (`"codex:<id>"` /
 * `"claude:<id>"`) — a bare id like `"1"` used to apply to BOTH families whenever they happened to
 * share an id, silently excluding the wrong finding from the automatic pool. A bare legacy entry
 * is refused outright, not guessed.
 */
export interface Adjudication {
    readonly pairs: ReadonlyArray<{
        readonly codex: string | number;
        readonly claude: string | number;
    }>;
    readonly none: readonly string[];
}
export interface ControlDiffBySeverity {
    readonly confirmed: Readonly<Record<string, number>>;
    readonly candidate: Readonly<Record<string, number>>;
    readonly onlyCodex: Readonly<Record<string, number>>;
    readonly onlyClaude: Readonly<Record<string, number>>;
}
export interface ControlDiff {
    /** Adjudicated pairs ONLY — the sole bucket allowed to be called "overlap"/"matched" anywhere
     *  this diff travels (r1-1). */
    readonly confirmed: ReadonlyArray<{
        readonly codex: string;
        readonly claude: string;
    }>;
    /** Automatic pairs — a LOWER-BOUND CANDIDATE, never confirmed overlap, until a lead adjudicates. */
    readonly candidate: ReadonlyArray<{
        readonly codex: string;
        readonly claude: string;
        readonly rule: MatchPair['rule'];
        readonly score: number;
    }>;
    readonly onlyCodex: readonly string[];
    readonly onlyClaude: readonly string[];
    readonly bySeverity: ControlDiffBySeverity;
    readonly matchRule: string;
    readonly adjudicated: boolean;
    readonly collapsed: {
        readonly codex: number;
        readonly claude: number;
    };
}
/** A7: an adjudication naming an id neither list carries is a RESULT, never a thrown exception —
 *  the CLI must be able to print the reason and exit 1, not crash. */
export type ControlDiffResult = ({
    readonly ok: true;
} & ControlDiff) | {
    readonly ok: false;
    readonly reason: string;
};
export declare function diffFamilyFindings(codex: readonly ControlFinding[], claude: readonly ControlFinding[], adjudication?: Adjudication): ControlDiffResult;
export interface ControlLedgerRow {
    readonly slug: string;
    readonly stage: 'control';
    readonly runId: string;
    /** Who wrote the code under review — the same family this control run's `--coder-family` (and
     *  qe-bridge's own recorded debt) named. Decides which half's `onlyX` count is FOREIGN. */
    readonly coderFamily: 'codex' | 'claude';
    readonly scope: readonly string[];
    readonly treeShaBefore: string;
    readonly treeShaAfterClaude: string;
    readonly treeShaAfterCodex: string;
    readonly codexGrade: string | null;
    readonly claudeGrade: string | null;
    readonly confirmed: number;
    readonly candidate: number;
    readonly onlyCodex: number;
    readonly onlyClaude: number;
    readonly bySeverity: ControlDiffBySeverity;
    readonly matchRule: string;
    readonly adjudicated: boolean;
    readonly collapsed: {
        readonly codex: number;
        readonly claude: number;
    };
    /** r1-8: findings refused for cause (an unnormalizable severity, an out-of-scope file) are
     *  recorded DURABLY here, in the ledger row itself — never only in a best-effort convenience
     *  file written after the ledger, which a witnessed-reread gate never protects. */
    readonly refused: {
        readonly claude: number;
        readonly codex: number;
        readonly reasons: readonly string[];
    };
    /** false whenever ANY finding was refused for cause (`refused.claude + refused.codex > 0`) —
     *  the row still measures something real, but it is an INCOMPLETE measurement, printed as such. */
    readonly complete: boolean;
    readonly tokens: number | null;
    readonly minutes: number | null;
}
export interface BuildControlRowInput {
    readonly slug: string;
    readonly runId: string;
    readonly coderFamily: 'codex' | 'claude';
    readonly scope: readonly string[];
    readonly tree: {
        readonly before: string;
        readonly afterClaude: string;
        readonly afterCodex: string;
    };
    readonly codex: {
        readonly accepted: boolean;
        readonly grade: string | null;
    };
    readonly claude: {
        readonly accepted: boolean;
        readonly grade: string | null;
    };
    readonly diff: ControlDiff;
    readonly refused?: {
        readonly claude?: number;
        readonly codex?: number;
        readonly reasons?: readonly string[];
    };
    readonly tokens?: number | null;
    readonly minutes?: number | null;
}
export type BuildControlRowResult = {
    readonly ok: true;
    readonly row: ControlLedgerRow;
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Refuses (never throws) on:
 *  - an empty scope (nothing was reviewed);
 *  - either required half missing, malformed, or carrying an EMPTY object where a real result was
 *    required (the empty-required-object lesson);
 *  - either half lacking an accepted findings table (A1) — an accepted-HOLLOW half (a genuine
 *    zero-findings verdict) is fine; a half whose only table was rejected, or that has none, is not;
 *  - a tree-hash drift across EITHER half (A2) — the claude half compares `before` to
 *    `afterClaude`, the codex half compares `afterClaude` to `afterCodex`; a control whose halves
 *    did not see the identical tree writes NO ledger row.
 * Unnormalizable-severity / out-of-scope findings do NOT refuse the row outright (they are a
 * partial-measurement fact, not a total failure) — they land in `refused`/`complete:false` instead.
 */
export declare function buildControlRow(input: BuildControlRowInput): BuildControlRowResult;
/**
 * experiment-instrument FR-4/A6 (ADR-001): a `stage:'control'` row `dz control-review` writes when
 * the run REFUSED before producing a diff — the failure-leaves-a-row half of the ADR's safety
 * property. Distinguished from {@link ControlLedgerRow} by `outcome:'refused'`, which a successful
 * row never carries; the two schemas share nothing else structurally on purpose — a refused run has
 * no diff, no tree hashes, no grades to validate.
 */
export interface ControlRefusedRow {
    readonly slug: string;
    readonly stage: 'control';
    readonly outcome: 'refused';
    /** Which half was responsible: the claude review, the codex review, or neither (a setup/tree/
     *  aggregation failure that belongs to neither half specifically). */
    readonly half: 'claude' | 'codex' | 'setup';
    readonly reason: string;
    readonly runId: string;
    /** Known only when the coder family was determined before the refusal — absent for the earliest
     *  failures (the claude half itself failing before it can report which family it reviewed). When
     *  present, the SAME `bucket(coderFamily, reviewerOfInterest)` a successful control row uses. */
    readonly coderFamily?: 'codex' | 'claude';
    readonly minutes: number | null;
}
export interface ParsedControlRows {
    readonly rows: readonly ControlLedgerRow[];
    /** experiment-instrument FR-4/A6: `stage:'control'` rows with `outcome:'refused'` — a run that
     *  never produced a diff. Schema-validated (`isValidControlRefusedRow`) the same way `rows` is;
     *  one that fails validation is `unreadable`, same as a malformed successful row. */
    readonly refusedRows: readonly ControlRefusedRow[];
    readonly roundRows: readonly Record<string, unknown>[];
    readonly fullRows: readonly Record<string, unknown>[];
    /** A8: a line that is not parseable JSON, or parses to something that is not a plain object, or
     *  is a `stage:'control'` row that fails FULL schema validation (r1-12), is counted here — never
     *  silently skipped and never crashing the aggregate. A well-formed line whose `stage` this
     *  module does not read (plan/impl/fix/loop-run/round-exec/the header comment row) is NOT
     *  unreadable: it was read fine, this module simply has nothing to do with it. */
    readonly unreadable: number;
}
/**
 * Reads every line of a run-cost-ledger.jsonl body, classifying `stage:'control'` rows (this
 * feature's own, fully schema-validated — r1-12), `stage:'round'` and `stage:'full'` rows (the two
 * existing per-review stages `aggregateByFamily` reads for its per-pair table), and counting
 * everything unreadable (A8).
 */
export declare function parseControlRows(lines: readonly string[]): ParsedControlRows;
export interface FamilyPairAggregate {
    readonly n: number;
    readonly grades: Readonly<Record<string, number>>;
    readonly shippedShare: number | 'unknown';
    /** r1-14: round/full rows for this pair with an EXPLICIT non-shipped outcome (refuted/blocked/
     *  abandoned) — named separately so a reader never mistakes "excluded from draftToShipped" for
     *  "no data". */
    readonly notShipped: number;
    readonly fixRounds: {
        readonly n: number;
        readonly mean: number | 'unknown';
    };
    readonly foreignUnique: {
        /** r1-13: the count of `stage:'control'` rows folded into THIS pair — `0` means every other
         *  field below is `'unknown'`, never a fabricated non-observation. */
        readonly n: number;
        /** Lead delta after Codex r2 (question d / new HIGH #2): control rows with `complete:false`
         *  (refused entries) are COUNTED here and EXCLUDED from every measured figure below — an
         *  incomplete measurement never contaminates the totals, and its presence marks the whole
         *  aggregate `incomplete`. */
        readonly incompleteRuns: number;
        readonly bySeverity: Readonly<Record<string, number>> | 'unknown';
        /** Foreign-unique FINDINGS (summed) from complete control rows that were NOT adjudicated — a
         *  candidate-only figure. `'unknown'` only when `n===0`. (Codex r2 new HIGH #3: these used to
         *  count ROWS under a findings label; the row counts now live in `autoRuns`/`adjudicatedRuns`.) */
        readonly auto: number | 'unknown';
        /** Foreign-unique FINDINGS (summed) from complete control rows a lead DID adjudicate — the
         *  trustworthy figure. `'unknown'` only when `n===0`. */
        readonly adjudicated: number | 'unknown';
        readonly autoRuns: number | 'unknown';
        readonly adjudicatedRuns: number | 'unknown';
    };
    readonly refutedShare: {
        readonly n: number;
        readonly value: number | 'unknown';
    };
    readonly costPerConfirmed: {
        readonly n: number;
        readonly value: number | 'unknown';
    };
    readonly draftToShipped: ReadonlyArray<{
        readonly slug: string;
        readonly first: string;
        readonly final: string;
        readonly finals: number;
    }>;
    /** experiment-instrument FR-4/A6: `stage:'control'` rows refused for THIS pair (attributed by a
     *  known `coderFamily` on the refused row) — a real cost line (the run was attempted and failed),
     *  never counted in `n` (which measures completed reviews). */
    readonly refusedRuns: number;
}
export interface FamilyAggregate {
    /** Keyed `<coderFamily>:<reviewerFamily>`, e.g. `codex:claude`. */
    readonly pairs: Readonly<Record<string, FamilyPairAggregate>>;
    /** A8: true when `parsed.unreadable > 0` — the aggregate is honest about what it could not read. */
    readonly incomplete: boolean;
    /** control rows with `complete:false` — excluded from the measured figures (r2 delta) */
    readonly incompleteControlRows: number;
    /** A6: the raw count of `stage:'control'` rows folded in — `0` means every `foreignUnique`
     *  figure below is a true, honestly-printed absence, not a fabricated non-observation. */
    readonly controlRows: number;
    /** experiment-instrument FR-4/A6: EVERY `stage:'control'` refused row seen, attributed or not —
     *  the total accounting figure `refusedRuns` (per pair) can never exceed, and the gap between the
     *  sum of per-pair `refusedRuns` and this total is exactly how many refusals had no determinable
     *  coderFamily (the earliest failures — printed here rather than silently dropped). */
    readonly refusedControlRows: number;
}
/**
 * `dz score --by-family`'s aggregate: per (coder family, reviewer family) pair, how many rounds
 * ran, their grade distribution, `shippedShare`/`notShipped`, mean `fixRounds`, the FOREIGN-unique
 * findings measured by `control` rows for that pair's cross-family direction (split `auto` vs
 * `adjudicated`, r1-1/r1-13), `refutedShare` and `costPerConfirmed` from `full` rows' findings
 * tables, and `draftToShipped` — the earliest known verdict for a slug (a qe-bridge signoff, or
 * this run's own claude-half grade) next to its final SHIPPED `round`/`full` grade for that exact
 * (slug, family-pair) key (r1-14). Every ratio is `'unknown'`, never a fabricated `0`, when its
 * denominator is zero (NFR-4: absent data is reported as absent).
 */
export declare function aggregateByFamily(parsed: ParsedControlRows, signoffs?: ReadonlyArray<{
    readonly slug: string;
    readonly emittedAt: string;
    readonly grade: string;
    readonly coderFamily: string;
}>): FamilyAggregate;
//# sourceMappingURL=cross-family-control.d.ts.map