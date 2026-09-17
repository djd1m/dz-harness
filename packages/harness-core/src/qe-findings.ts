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

import { maskMarkdown } from './markdown-masker.js';

export const QE_SEVERITIES = ['BLOCKER', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type QeSeverity = (typeof QE_SEVERITIES)[number];

export const QE_STATUSES = ['confirmed', 'fixed', 'partial', 'refuted', 'named-limit', 'open'] as const;
export type QeStatus = (typeof QE_STATUSES)[number];

export const QE_AUTHORS = ['codex', 'claude', 'lead'] as const;
export type QeAuthor = (typeof QE_AUTHORS)[number];

/** The ONE exact heading a producer must write and a reader must find — see score.ts's own
 *  comment on why this is a single shared constant rather than two strings that can drift apart. */
export const QE_FINDINGS_HEADER = '| Finding | Severity | Status | Round | Author | Title |';

/** The section a Findings ledger table must live directly under — fix-round-1 finding 1: a table
 *  found anywhere else (before this heading, after the section ends, or with no/duplicate heading)
 *  is `refused` as `outside ledger section`, never parsed as the real ledger. */
export const QE_LEDGER_HEADING = '## Findings ledger';

/** `QE-VERDICT: B`, `QE-VERDICT: A-`, `QE-VERDICT: A+` — a whole line, nothing trailing but
 *  whitespace. Only A-D (FR-1); this is deliberately narrower than score.ts's prose GRADE_RE, which
 *  also accepts E/F and looser punctuation because prose is written by hand. */
export const QE_VERDICT_RE = /^QE-VERDICT:\s*([A-D][+−-]?)\s*$/m;

/** Any line that OPENS a verdict declaration — any case, any leading whitespace, with or without the
 *  colon — checked separately from `QE_VERDICT_RE`'s strict grammar (fix-round-1 finding 2): this is
 *  what lets `readQeGrade` tell "no verdict was ever attempted" (legacy prose fallback allowed) apart
 *  from "a verdict was attempted and is malformed" (fallback forbidden — the report must say `invalid`
 *  rather than silently reading a stale prose grade). */
const QE_VERDICT_LOOKALIKE_RE = /^\s*QE-VERDICT\b/i;

/** U+2212 (minus sign) and the ASCII hyphen spell the same grade sign — the same normalisation
 *  score.ts's `normaliseGradeSign` applies to prose grades, duplicated here (not imported) so this
 *  module never depends on score.ts and stays the leaf of the dependency graph. */
function normaliseVerdictSign(grade: string): string {
  return grade.replace('−', '-');
}

/** A leading Markdown blockquote marker (CommonMark: up to 3 leading spaces, then `>`).
 *  `maskMarkdown` (the canonical shared masker, also used by amendment-trace.ts) does not mask
 *  blockquotes — only fences, indented code and HTML comments — so this ONE missing block kind is
 *  added here as the minimal local pass fix-round-1 calls for, with the same blank-to-spaces
 *  contract (line count and every other line's length never change). */
const BLOCKQUOTE_RE = /^ {0,3}>/;
/** CommonMark block starters that INTERRUPT a paragraph (so they can never be a lazy continuation
 *  of a blockquote): ATX heading, thematic break, fenced code, table row, list item, HTML block. */
const BLOCK_STARTER_RE = /^ {0,3}(?:#{1,6}(?:\s|$)|(?:[-*_])(?: *[-*_]){2,} *$|```|~~~|\||(?:[-*+]|\d{1,9}[.)])\s|<)/;

/**
 * qe-findings-lazy-blockquote (backlog baba20e3b1c14060): a `>` line only opens the mask — a
 * CommonMark blockquote paragraph can continue onto a FOLLOWING line that carries no `>` marker at
 * all (a "lazy continuation"), and that unmarked line still belongs to the quote. The original
 * single-line `.map()` masked only lines that themselves started with `>`, so a `QE-VERDICT: X` or
 * `## Findings ledger` line written as the *second* line of a quoted example (no blank line, no
 * `>`) was left unmasked and misread as the report's own artifact.
 *
 * Fix: a small two-state line machine (in-quote / not-in-quote). Once a `>` line is seen, every
 * following line is ALSO masked until the first blank line (a line with no non-whitespace
 * character) or end-of-input — the blank line is the ONLY terminator (a deliberate
 * over-approximation of strict CommonMark, which also lets a block-starting line such as an ATX
 * heading end a paragraph early: `01_requirements.md` FR-4 / acid A2 require the opposite, that a
 * `## Findings ledger` heading glued to a quote with no blank separation stays masked, so the
 * ambiguous case is read fail-closed as "still inside the quote" rather than as a real heading).
 * A line already blanked by an earlier pass (fence/indented-code/HTML-comment) has no
 * non-whitespace character either, so it is read as blank and CLOSES an open run rather than
 * extending it — the existing already-masked invariant (line 90-93 above) holds unchanged.
 */
function maskBlockquotes(md: string): string {
  let inQuote = false;
  return md
    .split('\n')
    .map((line) => {
      if (BLOCKQUOTE_RE.test(line)) {
        inQuote = true;
        return ' '.repeat(line.length);
      }
      if (!inQuote) return line;
      if (!/\S/.test(line)) {
        inQuote = false; // FR-2: a blank line always ends the lazy-continuation run
        return line;
      }
      if (BLOCK_STARTER_RE.test(line)) {
        // FR-1 clause (b), lead delta after Step 8 (F1/F2): a line that STARTS A NEW BLOCK — ATX
        // heading, thematic break, fence, table row, list item, HTML block — interrupts the quoted
        // paragraph per CommonMark, so it is NOT a lazy continuation: it and everything after it
        // are outside the quote. Without this, a real `## Findings ledger` heading or a real table
        // glued under a `> note` line vanished into a SILENT `absent` — exactly the near-miss-vs-
        // absent failure this module exists to prevent.
        inQuote = false;
        return line;
      }
      return ' '.repeat(line.length); // FR-1: lazy continuation — still inside the quote
    })
    .join('\n');
}

/** The one masking pass both scans below share: fenced code, 4-space indented code and HTML
 *  comments (the canonical masker) plus blockquotes (the local addition above). Blockquote masking
 *  runs SECOND on purpose — a `>` line already blanked by the canonical pass (inside a fence) is all
 *  spaces and can never spuriously match `BLOCKQUOTE_RE` again; a live blockquote outside any fence
 *  is exactly what still needs masking. */
/** Lead delta after Codex r2 (#1 PARTIAL): HTML `<blockquote>…</blockquote>` regions are masked too
 *  (same-length blanking, newlines kept) — a quoted example inside them must not count. */
function maskHtmlBlockquotes(md: string): string {
  return md.replace(/<blockquote\b[\s\S]*?<\/blockquote>/gi, (m) => m.replace(/[^\n]/g, ' '));
}

function maskForScan(md: string): string {
  return maskBlockquotes(maskHtmlBlockquotes(maskMarkdown(md, { indentedCode: true, inlineComments: true })));
}

/** Every `QE-VERDICT:` line found, normalised, IN DOCUMENT ORDER (duplicates included — the caller
 *  decides whether repeats of the SAME grade still count as ambiguous; ADR-001 D1 says they do:
 *  "две строки — ambiguous, никогда «последняя побеждает»"). Scans MASKED text (fix-round-1 finding
 *  1): a `QE-VERDICT:` line inside a fenced/indented code block, a blockquote or an HTML comment is
 *  an EXAMPLE, not the report's own verdict, and must never be counted. */
export function readQeVerdictLines(md: string): string[] {
  const found: string[] = [];
  const masked = maskForScan(md);
  const re = new RegExp(QE_VERDICT_RE.source, QE_VERDICT_RE.flags.includes('m') ? 'gm' : 'g');
  for (const m of masked.matchAll(re)) {
    found.push(normaliseVerdictSign(m[1] as string));
  }
  return found;
}

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
export function findInvalidQeVerdictLines(md: string): readonly QeVerdictInvalidLine[] {
  const masked = maskForScan(md);
  const maskedLines = masked.split('\n');
  const originalLines = md.split('\n');
  const strict = new RegExp(QE_VERDICT_RE.source);
  const out: QeVerdictInvalidLine[] = [];
  for (let i = 0; i < maskedLines.length; i++) {
    const line = maskedLines[i] as string;
    if (!QE_VERDICT_LOOKALIKE_RE.test(line)) continue;
    if (strict.test(line)) continue; // grammatically valid — readQeVerdictLines already has it
    out.push({ line: i + 1, text: originalLines[i] as string });
  }
  return out;
}

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

export type QeFindingsResult =
  | { readonly status: 'absent' }
  | {
      readonly status: 'present';
      /** Header-only table (no data rows at all, valid or refused) — worse than no table (D3). */
      readonly hollow: boolean;
      /** accepted | accepted-hollow (header only) | rejected-only (every table was refused) — lead delta after Codex r2 */
      readonly tableStatus: 'accepted' | 'accepted-hollow' | 'rejected-only';
      readonly rows: readonly QeFindingRow[];
      readonly refused: readonly QeFindingsRefusedRow[];
      readonly summary: QeFindingsSummary;
    };

const SEVERITY_SET: ReadonlySet<string> = new Set(QE_SEVERITIES);
const STATUS_SET: ReadonlySet<string> = new Set(QE_STATUSES);
const AUTHOR_SET: ReadonlySet<string> = new Set(QE_AUTHORS);

/** A markdown table separator row, e.g. `|---|---|---|---|---|---|` or `| --- | :--- | ---: |`. */
const SEPARATOR_RE = /^\|[\s:|-]+\|$/;

/** A top-level Markdown heading (`#` through `######`, ATX-style) — used to close a `## Findings
 *  ledger` section at the next heading of any level, same as a reader would read the document. */
const TOP_LEVEL_HEADING_RE = /^#{1,6}\s/;

/** Splits the INSIDE of a `| a | b | c |` row on top-level `|` boundaries: a `\|` is a literal pipe
 *  (never a boundary — fix-round-1 finding 5), and a `|` inside a single-backtick inline-code span is
 *  never a boundary either (`` `a|b` `` stays one cell). Deliberately minimal — not a full CommonMark
 *  table parser; nested/nested-backtick edge cases are out of scope. */
function splitTableCells(inner: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inCode = false;
  let codeFence = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i] as string;
    if (ch === '\\' && inner[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '`') {
      // Lead delta after Codex r2 (#5 PARTIAL): a code span opens with N backticks and closes only
      // with a run of the SAME length — ``a|b`` must not flip twice on its double backticks.
      let run = 0;
      while (inner[i + run] === '`') run++;
      if (!inCode) { inCode = true; codeFence = run; }
      else if (run === codeFence) { inCode = false; codeFence = 0; }
      current += '`'.repeat(run);
      i += run - 1;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/** Splits `| a | b | c |` into `['a', 'b', 'c']`, trimmed. Returns null when the line does not open
 *  and close with a pipe (not a table row at all) or has the wrong column count for this table. */
function splitRow(line: string, expectedCols: number): string[] | null {
  const t = line.trim();
  if (!t.startsWith('|') || !t.endsWith('|')) return null;
  const cells = splitTableCells(t.slice(1, -1));
  if (cells.length !== expectedCols) return null;
  return cells;
}

function parseRound(raw: string): number | null {
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 ? n : null;
}

/** Walks a table's body from just below its header (same rules as the real parse loop: an optional
 *  separator row, then rows starting with `|` until a blank line, a new header, or a non-table line)
 *  and counts how many row lines it contains — WITHOUT validating a single cell. Used only to make a
 *  refusal (duplicate or misplaced table) NAME how much was ignored (fix-round-1 finding 6), never to
 *  parse the rejected table's content. */
function countIgnoredRows(lines: readonly string[], headerIdx: number): number {
  let cursor = headerIdx + 1;
  if (cursor < lines.length && SEPARATOR_RE.test((lines[cursor] as string).trim())) cursor++;
  let count = 0;
  while (cursor < lines.length) {
    const trimmed = (lines[cursor] as string).trim();
    if (trimmed === '') break;
    if (trimmed === QE_FINDINGS_HEADER) break;
    if (!trimmed.startsWith('|')) break;
    count++;
    cursor++;
  }
  return count;
}

export function parseQeFindings(md: string): QeFindingsResult {
  const lines = md.split('\n');
  const maskedLines = maskForScan(md).split('\n');

  // fix-round-1 finding 1: locate the single top-level `## Findings ledger` heading (masked-aware —
  // a heading quoted inside a fence/blockquote/comment does not count). Zero or more-than-one such
  // headings means there is NO section a table can be "under", and every table found is refused.
  const headingIdxs: number[] = [];
  for (let i = 0; i < maskedLines.length; i++) {
    if ((maskedLines[i] as string).trim() === QE_LEDGER_HEADING) headingIdxs.push(i);
  }
  let sectionStart = -1;
  let sectionEnd = -1;
  if (headingIdxs.length === 1) {
    sectionStart = (headingIdxs[0] as number) + 1;
    sectionEnd = maskedLines.length;
    for (let i = sectionStart; i < maskedLines.length; i++) {
      if (TOP_LEVEL_HEADING_RE.test(maskedLines[i] as string)) {
        sectionEnd = i;
        break;
      }
    }
  }
  const inSection = (idx: number): boolean => sectionStart >= 0 && idx >= sectionStart && idx < sectionEnd;
  const noSectionReason =
    headingIdxs.length === 0
      ? `no '${QE_LEDGER_HEADING}' heading in the report`
      : headingIdxs.length > 1
        ? `${headingIdxs.length} '${QE_LEDGER_HEADING}' headings found — the heading must be unique`
        : '';

  // Header-row detection is ALSO masked-aware (finding 1): a `QE_FINDINGS_HEADER` line inside a
  // fence/indented block/blockquote/HTML comment is example text, never even a candidate.
  const headerIdxs: number[] = [];
  for (let i = 0; i < maskedLines.length; i++) {
    if ((maskedLines[i] as string).trim() === QE_FINDINGS_HEADER) headerIdxs.push(i);
  }
  if (headerIdxs.length === 0) {
    // Lead delta (dogfooding the lead's own 08, 2026-09-17 02:08 UTC): a pipe-table sitting DIRECTLY
    // under the single ledger heading whose header row is NOT the canonical one used to parse as
    // `absent` — indistinguishable from "no ledger at all". It is a table the author MEANT as the
    // ledger, so it is refused LOUDLY with the expected header spelled out (`rejected-only`).
    if (sectionStart >= 0) {
      for (let i = sectionStart; i < sectionEnd; i++) {
        const t = (maskedLines[i] as string).trim();
        if (t === '') continue;
        if (t.startsWith('|')) {
          return {
            status: 'present',
            hollow: false,
            tableStatus: 'rejected-only',
            rows: [],
            refused: [{ line: i + 1, text: lines[i] as string, reason: `non-canonical header row: expected exactly '${QE_FINDINGS_HEADER}'` }],
            summary: { bySeverity: {}, byStatus: {}, total: 0 },
          };
        }
        break;
      }
    }
    return { status: 'absent' };
  }

  const rows: QeFindingRow[] = [];
  const refused: QeFindingsRefusedRow[] = [];
  let sawAnyRowLine = false;
  let acceptedOne = false;

  // Lead delta after Codex r2 (#1 PARTIAL): the table must sit DIRECTLY under the heading — only
  // blank lines between `## Findings ledger` and the header row; prose in between disqualifies it.
  const directlyUnderHeading = (idx: number): boolean => {
    if (sectionStart < 0 || idx < sectionStart) return false;
    for (let i = sectionStart; i < idx; i++) if ((maskedLines[i] as string).trim() !== '') return false;
    return true;
  };
  for (const headerIdx of headerIdxs) {
    const accept = !acceptedOne && inSection(headerIdx) && directlyUnderHeading(headerIdx);
    if (!accept) {
      const ignored = countIgnoredRows(lines, headerIdx);
      const ignoredNote = ignored > 0 ? ` (${ignored} row(s) ignored)` : '';
      const reason = inSection(headerIdx) && acceptedOne
        ? `duplicate table: a Findings ledger table already appeared earlier in this report${ignoredNote}`
        : inSection(headerIdx)
          ? `not directly under the heading: prose sits between '${QE_LEDGER_HEADING}' and the table${ignoredNote}`
          : `outside ledger section: ${noSectionReason || `must appear directly under the single '${QE_LEDGER_HEADING}' heading`}${ignoredNote}`;
      refused.push({ line: headerIdx + 1, text: lines[headerIdx] as string, reason });
      continue;
    }
    acceptedOne = true;

    let cursor = headerIdx + 1;
    // Optional separator row right after the header.
    if (cursor < lines.length && SEPARATOR_RE.test((lines[cursor] as string).trim())) cursor++;

    while (cursor < lines.length) {
      const raw = lines[cursor] as string;
      const trimmed = raw.trim();
      if (trimmed === '') break; // a blank line ends the table
      if (trimmed === QE_FINDINGS_HEADER) break; // a second header starts a NEW (duplicate) table
      if (!trimmed.startsWith('|')) break; // a non-table line ends the table
      sawAnyRowLine = true;
      const cells = splitRow(raw, 6);
      if (cells === null) {
        refused.push({ line: cursor + 1, text: raw, reason: 'malformed row: expected 6 columns' });
        cursor++;
        continue;
      }
      const [finding, severity, status, roundRaw, author, title] = cells as [string, string, string, string, string, string];
      const reasons: string[] = [];
      if (finding === '' || /\s/.test(finding)) reasons.push(`Finding id ${JSON.stringify(finding)} must be a non-empty token with no whitespace`);
      if (!SEVERITY_SET.has(severity)) reasons.push(`severity ${JSON.stringify(severity)} not in dictionary`);
      if (!STATUS_SET.has(status)) reasons.push(`status ${JSON.stringify(status)} not in dictionary`);
      const round = parseRound(roundRaw);
      if (round === null) reasons.push(`round ${JSON.stringify(roundRaw)} is not an integer >= 1`);
      if (!AUTHOR_SET.has(author)) reasons.push(`author ${JSON.stringify(author)} not in dictionary`);
      if (reasons.length > 0) {
        refused.push({ line: cursor + 1, text: raw, reason: reasons.join('; ') });
      } else {
        rows.push({
          finding,
          severity: severity as QeSeverity,
          status: status as QeStatus,
          round: round as number,
          author: author as QeAuthor,
          title,
        });
      }
      cursor++;
    }
  }

  const bySeverity: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  for (const r of rows) {
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  }

  // Lead delta after Codex r2 (new MEDIUM #2): `hollow` means an ACCEPTED table with no rows — a
  // report whose only tables were refused has no accepted table at all (`rejected-only`).
  const tableStatus: 'accepted' | 'accepted-hollow' | 'rejected-only' = !acceptedOne ? 'rejected-only' : (sawAnyRowLine ? 'accepted' : 'accepted-hollow');
  return {
    status: 'present',
    hollow: tableStatus === 'accepted-hollow',
    tableStatus,
    rows,
    refused,
    summary: { bySeverity, byStatus, total: rows.length },
  };
}
