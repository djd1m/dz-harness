/**
 * qe-findings-record (ADR-001, tier M): machine-readable Step-8 verdict + findings ledger.
 *
 * Two prior facts drove this (Step 0, `00_complexity_assessment.md`): scoring reads review PROSE
 * with a regex (`readQeGrade` in score.ts) and 41 of 100 feature reports came back `ambiguous`
 * because a report that was fixed after review states two grades in prose — a real fact about the
 * report, not a parser bug. Findings were not read at all: `dz score` could say "cross-model QE ran"
 * but never how many BLOCKER/HIGH findings it raised or what happened to them.
 *
 * This module adds ONE machine-readable surface on top of the prose, never replacing it:
 *  - `QE-VERDICT: <A|A-|A+|B|B+|B-|C|C+|C-|D>` — a single line, the source of truth when present.
 *  - a `Findings ledger` table under the EXACT header `QE_FINDINGS_HEADER`, closed dictionaries for
 *    Severity/Status/Author. A row outside the dictionary is REFUSED, never coerced to the nearest
 *    known value (ADR-001 D2) — that would make the resulting severity/status tally unprovable.
 *  - an empty (header-only) table is `hollow: true` — worse than no table at all (ADR-001 D3, the
 *    same principle as the mutation table's `present-unproven` in score.ts).
 *
 * Absence of either surface is NOT an error: 406 pre-existing reports carry neither, and this module
 * reports `{status:'absent'}` for them exactly as it always will (ADR-001 D4, NFR-1).
 *
 * fix-round-1 (codex-r1-verdict, Grade C, findings 1/2/5/6/7): a machine artifact recognised inside
 * fenced/indented code, a blockquote or an HTML comment is not a machine artifact — a review that
 * QUOTES the format as an example must not be read as the report's own verdict/table. Both scans
 * below run over TEXT MASKED THE SAME WAY as `amendment-trace.ts` (`maskMarkdown`), plus one block
 * kind that shared masker does not cover — blockquotes — added here as the minimal local pass the
 * ADR calls for. Masking blanks a line to spaces of the SAME LENGTH, so every line number reported
 * in `refused`/`QeVerdictInvalidLine` still points at the real line in the ORIGINAL text.
 *
 * The findings table is additionally accepted ONLY under the single, top-level `## Findings ledger`
 * heading (finding 1); a table found anywhere else is refused `outside ledger section`, never parsed.
 *
 * PURE, deliberately: no node:fs import here (NFR-2, guarded by test/core-boundary.test.ts). File
 * reads belong to the CLI / the calling agent, same as every other core module.
 */
export declare const QE_SEVERITIES: readonly ["BLOCKER", "CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];
export type QeSeverity = (typeof QE_SEVERITIES)[number];
export declare const QE_STATUSES: readonly ["confirmed", "fixed", "partial", "refuted", "named-limit", "open"];
export type QeStatus = (typeof QE_STATUSES)[number];
export declare const QE_AUTHORS: readonly ["codex", "claude", "lead"];
export type QeAuthor = (typeof QE_AUTHORS)[number];
/** The ONE exact heading a producer must write and a reader must find — see score.ts's own
 *  comment on why this is a single shared constant rather than two strings that can drift apart. */
export declare const QE_FINDINGS_HEADER = "| Finding | Severity | Status | Round | Author | Title |";
/** The section a Findings ledger table must live directly under — fix-round-1 finding 1: a table
 *  found anywhere else (before this heading, after the section ends, or with no/duplicate heading)
 *  is `refused` as `outside ledger section`, never parsed as the real ledger. */
export declare const QE_LEDGER_HEADING = "## Findings ledger";
/** `QE-VERDICT: B`, `QE-VERDICT: A-`, `QE-VERDICT: A+` — a whole line, nothing trailing but
 *  whitespace. Only A-D (FR-1); this is deliberately narrower than score.ts's prose GRADE_RE, which
 *  also accepts E/F and looser punctuation because prose is written by hand. */
export declare const QE_VERDICT_RE: RegExp;
/** Every `QE-VERDICT:` line found, normalised, IN DOCUMENT ORDER (duplicates included — the caller
 *  decides whether repeats of the SAME grade still count as ambiguous; ADR-001 D1 says they do:
 *  "две строки — ambiguous, никогда «последняя побеждает»"). Scans MASKED text (fix-round-1 finding
 *  1): a `QE-VERDICT:` line inside a fenced/indented code block, a blockquote or an HTML comment is
 *  an EXAMPLE, not the report's own verdict, and must never be counted. */
export declare function readQeVerdictLines(md: string): string[];
export interface QeVerdictInvalidLine {
    /** 1-based line number in the ORIGINAL (unmasked) text. */
    readonly line: number;
    /** The raw line text, exactly as written (from the original, unmasked text). */
    readonly text: string;
}
/**
 * fix-round-1 finding 2: lines that LOOK LIKE a `QE-VERDICT:` declaration (any case, any leading
 * whitespace, with or without the colon) but do not match the strict grammar — `QE-VERDICT: B – final`
 * (en dash + trailing prose), wrong case, a missing colon, a grade outside A-D. Masked the same way as
 * `readQeVerdictLines` — a malformed EXAMPLE inside a fence/quote/comment is still not a real attempt.
 * A genuinely valid line is never reported here (it belongs to `readQeVerdictLines` instead).
 */
export declare function findInvalidQeVerdictLines(md: string): readonly QeVerdictInvalidLine[];
export interface QeFindingRow {
    readonly finding: string;
    readonly severity: QeSeverity;
    readonly status: QeStatus;
    readonly round: number;
    readonly author: QeAuthor;
    readonly title: string;
}
export interface QeFindingsRefusedRow {
    /** 1-based line number in the source text the refused row (or duplicate/misplaced table header)
     *  starts at. */
    readonly line: number;
    /** The raw line text, exactly as written. */
    readonly text: string;
    /** Why the row (or table) was refused — human-readable, not a code. */
    readonly reason: string;
}
export interface QeFindingsSummary {
    readonly bySeverity: Readonly<Record<string, number>>;
    readonly byStatus: Readonly<Record<string, number>>;
    readonly total: number;
}
export type QeFindingsResult = {
    readonly status: 'absent';
} | {
    readonly status: 'present';
    /** Header-only table (no data rows at all, valid or refused) — worse than no table (D3). */
    readonly hollow: boolean;
    /** accepted | accepted-hollow (header only) | rejected-only (every table was refused) — lead delta after Codex r2 */
    readonly tableStatus: 'accepted' | 'accepted-hollow' | 'rejected-only';
    readonly rows: readonly QeFindingRow[];
    readonly refused: readonly QeFindingsRefusedRow[];
    readonly summary: QeFindingsSummary;
};
export declare function parseQeFindings(md: string): QeFindingsResult;
//# sourceMappingURL=qe-findings.d.ts.map