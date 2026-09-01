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
  readonly raw: string;
}

export type AmendmentVerdict =
  | 'resolved'
  | 'placeholder'
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
  | 'superseded'
  | 'unnamed'
  | 'no-file-named'
  | 'file-missing'
  | 'name-absent-in-file';

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
 * Template placeholders that reach shipped reports. A stub read as an ordinary unresolvable id lets
 * the author believe they merely mistyped a name, so it earns its own verdict (acid case A1).
 */
const PLACEHOLDER_IDS = new Set(['test_name', 'test-name', '<test>', '<test_name>', 'tbd', 'todo', 'name']);

/**
 * Below this many normalised characters an id is too short to match anything meaningfully: the
 * substring rule ADR-002 accepts would fire on unrelated prose. Guards the degenerate case the ADR
 * names as its known false-positive risk.
 */
export const MIN_MATCHABLE_ID_LENGTH = 8;

/** Case- and separator-folded form. Authors write ids in prose (`a_b_c`); test titles are sentences. */
/**
 * Every `it()` / `test()` / `describe()` title in a test file. Empty when none parse.
 *
 * Comments are stripped FIRST. A commented-out `it('deny admin writes')` is not a test, and counting
 * it would leave open the very forgery the title basis exists to close — the cross-family reviewer's
 * two-comment-line attack in a slightly better costume. Table forms (`test.each([…])('…')`) carry an
 * argument list between the modifier and the title, so the pattern allows one.
 */
export function extractTestTitles(body: string): string[] {
  const code = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const out: string[] = [];
  // The modifier-argument group admits ONE level of nested parens: `it.skipIf(!existsSync(BIN))`
  // carries a call inside the guard, and the flat `[^()]{0,200}` failed on it — so every title in
  // a file whose tests were guarded that way was invisible, and `dz amendment-check` reported
  // `searched 1 test title(s)` over a nine-test file (MEASURED 2026-08-24 on the name-check
  // feature; worked around there by de-guarding the tests, fixed here at the extractor).
  const re = /\b(?:it|test|describe)(?:\.\w+)*(?:\s*\((?:[^()]|\([^()]*\)){0,200}\))?\s*(?:`[^`]*`)?\s*\(\s*(['"`])([\s\S]{1,300}?)\1/g;
  for (let m = re.exec(code); m !== null; m = re.exec(code)) if (m[2]) out.push(m[2]);
  return out;
}

export function normalizeTestId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Row starts, in BOTH shapes the corpus actually contains: a bullet (`- **AM-1 (…):**`) and a table
 * cell (`| **AM-40** |`). A format LEGEND — the literal `AM-N` with an `N` that is not a digit, as in
 * `features/ha-consilium/03.5_ideation_report.md` — is deliberately NOT a row: counting a legend as
 * an amendment would open this feature by falsely accusing a feature that did nothing wrong.
 */
// The bullet is OPTIONAL, and `AM-CP-N` is a row like any other. MEASURED 2026-08-25: requiring a
// bullet drops 104 of the corpus's 347 real amendment rows out of the check entirely, and a
// bullet-less row made this tool return `not-established` — which the pipeline's own gate text calls
// "NEVER a pass". C6 has always treated the bullet as optional; this is that half of the contract.
const ROW_START = /^(?:[-*|]\s*)?\*{0,2}AM-(?:CP-)?(\d+)/gm;

/** The `## Amendments` section body, or null when the document has none (acid case A5). */
export function amendmentSection(md: string): string | null {
  const m = /^ {0,3}#{2,4}\s+Amendments\b[^\n]*\n/m.exec(md);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = md.slice(start);
  const next = /^ {0,3}#{2,4}\s+\S/m.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

/** `## Amendments` present but recording nothing to check — distinct from the section being absent. */
export function planSaysNoAmendments(planMd: string): boolean {
  const sec = amendmentSection(planMd);
  if (sec === null) return false;
  return /^\s*(none|n\/a|нет)\b/i.test(sec.trim());
}

export function parseAmendments(md: string): AmendmentRow[] {
  const section = amendmentSection(md);
  if (section === null) return [];
  const starts: { index: number; num: string }[] = [];
  ROW_START.lastIndex = 0;
  for (let m = ROW_START.exec(section); m !== null; m = ROW_START.exec(section)) {
    starts.push({ index: m.index, num: (m[1] ?? m[2]) as string });
  }
  const rows: AmendmentRow[] = [];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i] as { index: number; num: string };
    const end = i + 1 < starts.length ? (starts[i + 1] as { index: number }).index : section.length;
    const raw = section.slice(s.index, end);
    rows.push({ id: `AM-${s.num}`, testIds: extractTestIds(raw), file: extractFile(raw), raw });
  }
  return rows;
}

/** `superseded by AM-N` / `AM-CP-N` — the retraction form C6 has always accepted. */
const SUPERSEDED = /superseded by AM-(?:CP-)?\d+/i;

/** `→ test \`a\`` and the two-id shape `→ tests \`a\` and \`b\`` — both are in the corpus. */
function extractTestIds(raw: string): string[] {
  const out: string[] = [];
  // Both arrows. C6 accepted `->` from the start and this file only accepted `→`, so an ASCII row
  // read as `unnamed` here while passing there — an accident of two authors, not a decision.
  const re = /(?:\u2192|->)\s*tests?\s+`([^`]+)`(?:\s*(?:and|и)\s*`([^`]+)`)?/g;
  for (let m = re.exec(raw); m !== null; m = re.exec(raw)) {
    if (m[1]) out.push(m[1].trim());
    if (m[2]) out.push(m[2].trim());
  }
  return out;
}

/**
 * The `in \`<path>\`` half, which in real reports frequently opens the line AFTER the id. A pattern
 * that cannot cross a newline finds almost nothing here — measured while writing this: three
 * successive shell-written extractors returned 108, 111 and 13 rows over the identical corpus.
 */
function extractFile(raw: string): string | null {
  const m = /(?:\u2192|->)\s*tests?\s+`[^`]+`(?:\s*(?:and|и)\s*`[^`]+`)?[\s\S]{0,40}?\bin\s+`([^`]+)`/.exec(raw);
  return m && m[1] ? m[1].trim() : null;
}

export function resolveAmendments(
  rows: readonly AmendmentRow[],
  opts: { readFile: (p: string) => string | null },
): AmendmentResolution[] {
  const out: AmendmentResolution[] = [];
  for (const row of rows) {
    // A retraction is checked BEFORE the missing-pointer branch: a row that says it was superseded
    // is not a row that forgot its test.
    if (SUPERSEDED.test(row.raw)) {
      out.push({ id: row.id, testId: null, file: row.file, verdict: 'superseded', detail: 'the plan retracted this amendment and named its successor' });
      continue;
    }
    if (row.testIds.length === 0) {
      out.push({
        id: row.id,
        testId: null,
        file: row.file,
        verdict: 'unnamed',
        detail: 'the row carries no `→ test` token — an amendment with no pointer is not a passing amendment',
      });
      continue;
    }
    for (const testId of row.testIds) {
      out.push(resolveOne(row, testId, opts.readFile));
    }
  }
  return out;
}

function resolveOne(
  row: AmendmentRow,
  testId: string,
  readFile: (p: string) => string | null,
): AmendmentResolution {
  const base = { id: row.id, testId, file: row.file };
  if (PLACEHOLDER_IDS.has(testId.trim().toLowerCase())) {
    return { ...base, verdict: 'placeholder', detail: `\`${testId}\` is a template placeholder, not a test name` };
  }
  if (row.file === null) {
    return { ...base, verdict: 'no-file-named', detail: 'the row names a test id but no file to find it in' };
  }
  const body = readFile(row.file);
  if (body === null) {
    return { ...base, verdict: 'file-missing', detail: `\`${row.file}\` does not exist or cannot be read` };
  }
  const needle = normalizeTestId(testId);
  if (needle.length < MIN_MATCHABLE_ID_LENGTH) {
    return {
      ...base,
      verdict: 'name-absent-in-file',
      detail: `\`${testId}\` normalises to ${needle.length} characters — below the ${MIN_MATCHABLE_ID_LENGTH}-character floor, so a match would prove nothing`,
    };
  }
  // An existing FILE never stands in for an existing TEST (ADR-002) — and neither does an existing
  // COMMENT. Matching the whole file body is forgeable with two comment lines whose letters happen to
  // spell the id, so the basis is the file's TEST TITLES. Falling back to the body when none parse is
  // stated in the detail rather than done quietly: a silent fallback restores the hole it closes.
  const titles = extractTestTitles(body);
  const basis = titles.length > 0 ? titles.map(normalizeTestId).join('\n') : normalizeTestId(body);
  const basisNote = titles.length > 0 ? `${titles.length} test title(s)` : 'the whole file body — NO test titles parsed, so this match is weaker';
  if (!basis.includes(needle)) {
    return {
      ...base,
      verdict: 'name-absent-in-file',
      detail: `\`${row.file}\` exists but no test in it is named \`${testId}\` (searched ${basisNote})`,
    };
  }
  return { ...base, verdict: 'resolved', detail: `found in \`${row.file}\` (searched ${basisNote})` };
}

const ZERO_COUNTS: Record<AmendmentVerdict, number> = {
  resolved: 0,
  placeholder: 0,
  superseded: 0,
  unnamed: 0,
  'no-file-named': 0,
  'file-missing': 0,
  'name-absent-in-file': 0,
};

export function decideAmendmentOutcome(input: {
  sectionPresent: boolean;
  rows: readonly AmendmentRow[];
  resolutions: readonly AmendmentResolution[];
  planSaysNone: boolean;
  readError?: string | null;
  /** Ideation amendments the plan fails to carry — absent, or reworded under the same id. */
  missingFromPlan?: readonly { id: string; kind: 'dropped' | 'subject-changed' }[];
}): AmendmentDecision {
  const counts: Record<AmendmentVerdict, number> = { ...ZERO_COUNTS };
  for (const r of input.resolutions) counts[r.verdict]++;
  const reasons: string[] = [];

  // Inputs we could not read are never a verdict about the feature (acid case A7).
  if (input.readError) {
    return { outcome: 'not-established', exit: 3, reasons: [`inputs unreadable: ${input.readError}`], counts };
  }
  // Absence is a skip with a stated reason, never a pass and never a silent zero (acid case A5).
  if (!input.sectionPresent) {
    return {
      outcome: 'skip',
      exit: 0,
      reasons: ['no `## Amendments` section — nothing to check (this is an absence, not a pass)'],
      counts,
    };
  }
  // The whole class this feature removes: a check that silently checked nothing (AM-1, acid case A7).
  if (input.rows.length === 0) {
    return {
      outcome: 'not-established',
      exit: 3,
      reasons: [
        'the `## Amendments` section is present but ZERO rows parsed — the grammar matched nothing, which is not the same as nothing being wrong',
      ],
      counts,
    };
  }
  // Ideation carries rows while the plan records "None" — this is HIGH-2 itself (acid case A6).
  // Discovered while closing HIGH-2: the pointers belong in the PLAN. Step 6's own instruction is
  // "carry AM-N into 06_implementation_plan.md verbatim", and the ideation report is a historical
  // artifact — editing its rows to match tests that were named later would be rewriting the record
  // rather than closing the trail. So the plan's rows are authoritative when present, and the rule
  // that keeps that honest is coverage: an ideation amendment the plan never mentions is a DROPPED
  // amendment, which is the renegotiating-away failure in a quieter form.
  for (const gap of input.missingFromPlan ?? []) {
    reasons.push(
      gap.kind === 'dropped'
        ? `${gap.id} is an amendment in 03.5_ideation_report.md that 06_implementation_plan.md never carries — an amendment dropped in planning is one nobody can audit`
        : `${gap.id} appears in both documents but the plan describes a DIFFERENT change — "carry verbatim" means the subject survives; only the test pointer may be renamed`,
    );
  }
  if (input.planSaysNone) {
    reasons.push(
      `the ideation report carries ${input.rows.length} amendment row(s) while 06_implementation_plan.md records \`## Amendments: None\` — the amendments were renegotiated away, and an amendment nobody can resolve is one nobody can audit`,
    );
  }
  for (const r of input.resolutions) {
    // `superseded` is an OUTCOME, not a defect: the plan retracted the amendment and said so. It is
    // reported in the counts and never becomes a reason, which is the whole point — refusing
    // retraction is what produced the false failures this change removes.
    if (r.verdict !== 'resolved' && r.verdict !== 'superseded') reasons.push(`${r.id} → ${r.verdict}: ${r.detail}`);
  }
  return { outcome: reasons.length > 0 ? 'fail' : 'pass', exit: reasons.length > 0 ? 1 : 0, reasons, counts };
}

/** The one line every caller reads last, in the K2 gate's own shape so the two read alike. */
export function amendmentVerdictLine(d: AmendmentDecision): string {
  const label = d.outcome === 'not-established' ? 'NOT-ESTABLISHED' : d.outcome.toUpperCase();
  const head = `amendment traceability: ${label}`;
  const tail =
    d.outcome === 'pass'
      ? `${d.counts.resolved} row(s) resolved`
      : (d.reasons[0] ?? 'no reason recorded');
  return `${head} — ${tail}`;
}

/** Printed on every run: this checker does NOT prove a resolved test discriminates (NG-1, A8). */
export const AMENDMENT_VACUITY_NOTE =
  'note: this checks that each amendment RESOLVES to a real test, not that the test is non-vacuous — `dz discrimination-check` owns vacuity.';


/**
 * The amendment's own text with the `→ test …` pointer clause and markdown furniture removed — what
 * "carry AM-N into the plan verbatim" is actually about. The POINTER may legitimately change (tests
 * are named later than ideation guesses); the SUBJECT may not.
 */
export function amendmentSubject(raw: string): string {
  // BOTH arrows, for the same reason extractTestIds accepts both: the corpus carries `->` and `→`
  // from two authors, and splitting on only one leaves the whole Confirmation sentence inside the
  // "subject". Two documents that word their Confirmation differently — which they are entitled to,
  // since only the SUBJECT must survive verbatim — then read as a subject change. MEASURED
  // 2026-08-30 on os-matrix-pack-smoke: all 9 amendments resolved to real tests, yet all 9 reported
  // "the plan describes a DIFFERENT change"; the ideation used `->` throughout.
  // The pointer region starts at `Confirmation:` — everything from there on is HOW the amendment is
  // proven (which fixture, which arrow form, which test name), and the rule says only the pointer may
  // differ between the two documents. Splitting at the arrow alone left the Confirmation PROSE inside
  // the subject, so two documents describing the same fixture in different words read as a subject
  // change. Both arrows are still handled, for corpora that omit the `Confirmation:` lead-in.
  const withoutPointer = raw.split(/Confirmation\s*:/i)[0]?.split(/(?:\u2192|->)\s*tests?\s/)[0] ?? '';
  // Strip ONLY the row's furniture: bullet/table marks, the bold id, an optional `(source)` tag and
  // a colon. An earlier version consumed up to 80 characters after the id, which ate the SUBJECT
  // itself whenever a row carried no `(source):` tag — the checker then compared two truncations
  // and called honest rows a mismatch.
  const stripped = withoutPointer.replace(/^[\s|*\-]*\**AM-\d+\**\s*(?:\([^)]{0,80}\))?\s*:?\s*/, '');
  return normalizeTestId(stripped);
}

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
export function amendmentsMissingFromPlan(
  ideationRows: readonly AmendmentRow[],
  planRows: readonly AmendmentRow[],
): PlanCoverageGap[] {
  const byId = new Map(planRows.map((r) => [r.id, r]));
  const gaps: PlanCoverageGap[] = [];
  for (const row of ideationRows) {
    const planRow = byId.get(row.id);
    if (planRow === undefined) {
      gaps.push({ id: row.id, kind: 'dropped' });
      continue;
    }
    const want = amendmentSubject(row.raw);
    const got = amendmentSubject(planRow.raw);
    // Containment either way: a plan may append a note ("closes HIGH-2"), and ideation may be the
    // longer prose. What it may not do is describe a different change.
    if (want.length >= MIN_MATCHABLE_ID_LENGTH && !got.includes(want) && !want.includes(got)) {
      gaps.push({ id: row.id, kind: 'subject-changed' });
    }
  }
  return gaps;
}
