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

export const REQE_SCHEMA = 'reqe-due-1';

export const REQE_SCOPE =
  'scope: debt is emitted only when Step-8 QE actually ran on the coder’s own family under the ' +
  'usage override; settling requires a graded cross-family report (fail-closed); nothing re-runs QE ' +
  'automatically.';

export type ModelFamily = 'claude' | 'openai';

/** Family classification shared with the workflow's acFamOf (codex/gpt/openai markers ⇒ openai).
 * DELIBERATELY binary over the workflow's own CONTROLLED vocabulary (coderUsed ∈ claude | codex |
 * codex-fallback; qeReviewerUsed ∈ claude | codex) — this is never fed arbitrary model ids, so the
 * claude default is the correct reading of "not a codex marker", not a fail-open (Codex QE #11,
 * accepted with this documentation). */
export function modelFamily(spec: string | null | undefined): ModelFamily {
  return /codex|gpt|openai/i.test(String(spec ?? '')) ? 'openai' : 'claude';
}

export interface ReqeEmitDecision {
  emit: boolean;
  reason: string;
}

/** Emit iff the QE stage label carries the workflow's ' (usage-switched)' marker AND the reviewer
 * family equals the coder family. Marker-only (cross-family survived the switch) or same-family
 * WITHOUT the marker (the codex-unavailable Claude belt — degraded loudly at run time, not a
 * limit-pressure artifact) both create NO debt. */
export function shouldEmitReqeDebt(input: {
  coderUsed: string | null | undefined;
  qeReviewerUsed: string | null | undefined;
  qeModelLabel: string | null | undefined;
}): ReqeEmitDecision {
  const switched = /\(usage-switched\)/.test(String(input.qeModelLabel ?? ''));
  const coderFam = modelFamily(input.coderUsed);
  const qeFam = modelFamily(input.qeReviewerUsed);
  if (switched && coderFam === qeFam) {
    return {
      emit: true,
      reason:
        'usage-switched self-review: Step-8 QE ran on the coder’s own family (' + coderFam +
        ') under the limit override — the cross-model guard was suspended (FR-2.9)',
    };
  }
  if (switched) return { emit: false, reason: 'usage-switched but QE stayed cross-family (' + qeFam + ' vs coder ' + coderFam + ')' };
  if (coderFam === qeFam) return { emit: false, reason: 'same-family without the usage override (belt degrade — logged loudly at run time; out of re-QE-debt scope)' };
  return { emit: false, reason: 'cross-family QE ran' };
}

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
export function buildReqeDebt(input: {
  slug: string;
  coderUsed: string | null | undefined;
  qeReviewerUsed: string | null | undefined;
  qeGrade: string | null | undefined;
  reason: string;
  emittedAt?: string | null;
}): ReqeDebt {
  return {
    schema: REQE_SCHEMA,
    slug: input.slug,
    coderFamily: modelFamily(input.coderUsed),
    qeFamily: modelFamily(input.qeReviewerUsed),
    qeGrade: input.qeGrade == null || String(input.qeGrade).trim() === '' ? null : String(input.qeGrade).trim(),
    reason: input.reason,
    emittedAt: input.emittedAt ?? null,
  };
}

/** Parse + validate a debt file's text. null = not a valid debt (the caller reports it as
 * malformed — a corrupt debt file is NAMED, never silently dropped). */
export function parseReqeDebt(text: string): ReqeDebt | null {
  let raw: unknown;
  try {
    raw = JSON.parse(String(text ?? ''));
  } catch {
    return null;
  }
  const d = raw as Partial<ReqeDebt>;
  if (!d || typeof d !== 'object') return null;
  if (d.schema !== REQE_SCHEMA) return null;
  if (typeof d.slug !== 'string' || d.slug.trim() === '') return null;
  if (d.coderFamily !== 'claude' && d.coderFamily !== 'openai') return null;
  if (d.qeFamily !== 'claude' && d.qeFamily !== 'openai') return null;
  if (typeof d.reason !== 'string' || d.reason.trim() === '') return null;
  return {
    schema: REQE_SCHEMA,
    slug: d.slug,
    coderFamily: d.coderFamily,
    qeFamily: d.qeFamily,
    qeGrade: typeof d.qeGrade === 'string' && d.qeGrade.trim() !== '' ? d.qeGrade.trim() : null,
    reason: d.reason,
    emittedAt: typeof d.emittedAt === 'string' && d.emittedAt.trim() !== '' ? d.emittedAt : null,
    runStamp: typeof d.runStamp === 'string' && d.runStamp.trim() !== '' ? d.runStamp : null,
  };
}

export interface ReqeBrief {
  reviewFamily: ModelFamily;
  header: string;
  instructions: readonly string[];
  codexCmdTemplate: string | null;
}

/** The ready-to-run cross-family review brief. Review family = the OTHER family than the CODER
 * (reviewing with the other-than-reviewer family would let a codex-coded, codex-reviewed run be
 * "re-reviewed" by codex again). */
export function buildReqeBrief(debt: ReqeDebt, artifactsDir: string): ReqeBrief {
  const reviewFamily: ModelFamily = debt.coderFamily === 'openai' ? 'claude' : 'openai';
  const files = [
    artifactsDir + '/07_code_changes/change_manifest.md',
    artifactsDir + '/08_qe_report.md',
    artifactsDir + '/03_adr/',
  ];
  const instructions = [
    'Independent re-QE for "' + debt.slug + '": the recorded Step-8 review ran on the coder’s own family (' + debt.coderFamily + ') under the usage override' + (debt.qeGrade ? ' and graded ' + debt.qeGrade : '') + '.',
    'Review with the ' + reviewFamily.toUpperCase() + ' family (the OTHER family than the coder — the suspended guard, restored).',
    'Read: ' + files.join(' , ') + ' plus every file the change manifest lists.',
    'Adversarially verify: correctness, edge cases, the ADR-named load-bearing property HAS a test, and whether the same-family review missed anything.',
    'Output: GRADE A-F + numbered findings with file:line and severity; write the report to ' + artifactsDir + '/08b_reqe_report.md.',
    'Then settle the debt: dz reqe --slug ' + debt.slug + ' --done --report ' + artifactsDir + '/08b_reqe_report.md',
  ];
  const codexCmdTemplate = reviewFamily === 'openai'
    ? 'codex exec -m <probed-id> -c model_reasoning_effort="high" --sandbox read-only "<the brief above>" < /dev/null   # probe the id first: ids are account-specific'
    : null;
  return {
    reviewFamily,
    header: 're-QE brief for ' + debt.slug + ' (' + (debt.emittedAt ?? 'emitted: unknown') + ')',
    instructions,
    codexCmdTemplate,
  };
}

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
export function extractReportGrade(text: string): string | null {
  // the lookahead rejects RANGES in punctuation form (A-F, A/F) AND word form (A through F,
  // A to F) — Codex QE round-2 #6: 'GRADE A through F' must not read as grade A
  const matches = [...String(text ?? '').matchAll(/^\s*(?:\*{0,2}#{0,4}\s*)?GRADE\s*[:=—–-]?\s*([A-F])\b(?!\s*(?:[-–—/]|through|to|thru)\s*[A-F]\b)/gim)];
  const distinct = new Set(matches.map((m) => (m[1] ?? '').toUpperCase()).filter((g) => g !== ''));
  if (distinct.size !== 1) return null;
  return [...distinct][0] ?? null;
}

/** FAIL-CLOSED settlement validation: the report must be non-trivial (>= 200 chars of substance)
 * and must NAME exactly one line-anchored grade. A settlement that cannot cite its evidence is
 * refused — clearing a debt against an empty file would re-open the exact hole this feature closes.
 * HONEST LIMIT (documented, not hidden): the validator proves the settlement is PROCEDURALLY sound
 * (a distinct, graded report exists); it cannot prove which model authored the text — attribution
 * stays with the human running the brief. */
export function settleReqeDebt(debt: ReqeDebt, reportText: string, reportPath: string): ReqeSettlement {
  const text = String(reportText ?? '');
  if (text.trim().length < 200) {
    return { ok: false, error: 'report too small to be a review (< 200 chars of substance) — refusing to settle', grade: null, epilogue: null };
  }
  const grade = extractReportGrade(text);
  if (grade === null) {
    return { ok: false, error: 'report names no unambiguous line-anchored GRADE (A-F) — text without exactly one verdict grade is not a verdict; refusing to settle', grade: null, epilogue: null };
  }
  const reviewFamily: ModelFamily = debt.coderFamily === 'openai' ? 'claude' : 'openai';
  const epilogue = [
    '',
    '---',
    '',
    '## re-QE settlement (cross-model debt cleared)',
    '',
    'The original Step-8 review ran on the coder’s own family (' + debt.coderFamily + ') under the',
    'usage override (' + debt.reason + '). An independent ' + reviewFamily.toUpperCase() + '-family re-QE was performed:',
    '',
    '- report: `' + reportPath + '`',
    '- re-QE grade: **' + grade + '**' + (debt.qeGrade ? ' (same-family grade on record: ' + debt.qeGrade + ')' : ''),
    '- settled via `dz reqe --done` (fail-closed: an existing graded report is required).',
    '',
  ].join('\n');
  return { ok: true, error: null, grade, epilogue };
}

/** Render the debt list for `dz reqe` / the `dz usage` surfacing line. */
export function renderReqeList(debts: readonly ReqeDebt[], malformed: number): string[] {
  const lines: string[] = [];
  if (debts.length === 0 && malformed === 0) {
    lines.push('dz reqe: no re-QE debts — every recorded run kept cross-model QE (or none used the usage override).');
  } else {
    lines.push('dz reqe — ' + debts.length + ' unsettled re-QE debt(s):');
    for (const d of debts) {
      lines.push('  ' + d.slug + '  coder=' + d.coderFamily + ' qe=' + d.qeFamily + (d.qeGrade ? ' grade=' + d.qeGrade : '') + (d.emittedAt ? '  ' + d.emittedAt : '') + '  → dz reqe --slug ' + d.slug);
    }
  }
  if (malformed > 0) lines.push('  ' + malformed + ' malformed debt file(s) skipped (named, never silent).');
  lines.push(REQE_SCOPE);
  return lines;
}
