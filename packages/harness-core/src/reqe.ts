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
 *            same-family after a usage switch, failed probe, fallback or explicit QE pin;
 *            a review that stayed cross-family creates no debt;
 *   list   — `dz reqe` scans the debts; `dz usage` surfaces the count so the moment limits free up
 *            is the moment the debt is visible;
 *   brief  — `dz reqe --slug <s>` prints a ready cross-family review brief (the OTHER family than
 *            the coder);
 *   settle — `dz reqe --slug <s> --done --report <file>` clears the debt FAIL-CLOSED: only against
 *            an existing, non-trivial report that names a grade; the settlement is appended to
 *            08_qe_report.md so the artifact trail closes.
 * The two-part verdict reports new and prior findings separately; blocked new findings signal CLI exit 3.
 *
 * HONEST SCOPE: nothing here re-runs QE automatically (no background spend — the human decides);
 * routing-off runs are excluded by configuration. Old checkpoints without bridge facts or a usage
 * marker are UNDETERMINABLE and explicitly degraded.
 */

import { buildReqeVerdict, type ReqeVerdict } from './reqe-verdict.js';

export const REQE_SCHEMA = 'reqe-due-1';

export const REQE_SCOPE =
  'scope: same-family Step-8 QE records cause=usage-switched, probe-failed, same-family-fallback ' +
  'or same-family-pinned; routing OFF is excluded by configuration; settling requires a graded ' +
  'cross-family report (fail-closed); nothing re-runs QE automatically.';

export type ReqeCause = 'usage-switched' | 'probe-failed' | 'same-family-fallback' | 'same-family-pinned';
export type ReqeRungState = 'pending' | 'dispatched' | 'probe-failed' | 'refused-before-dispatch';
export interface ReqeBridgeFacts {
  happened: boolean | null;
  rungState: ReqeRungState | null;
  rungReason: string | null;
  decline: string | null;
}
export interface ReqeEmitInput {
  coderUsed: string | null | undefined;
  qeReviewerUsed: string | null | undefined;
  qeModelLabel: string | null | undefined;
  routingRequested: boolean | null | undefined;
  bridge?: ReqeBridgeFacts | null;
}

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
  cause: ReqeCause | null;
  degraded: boolean;
}

/** Families are authoritative; routing OFF is an explicit exclusion. For same-family reviews,
 * classify usage overrides before probe failures, fallbacks and explicit pins. Missing checkpoint
 * facts and unknown rung states stay visibly degraded rather than inventing a cause. */
export function shouldEmitReqeDebt(input: ReqeEmitInput): ReqeEmitDecision {
  const coderFam = modelFamily(input.coderUsed);
  const qeFam = modelFamily(input.qeReviewerUsed);
  if (coderFam !== qeFam) {
    return { emit: false, cause: null, degraded: false, reason: 'cross-family QE ran' };
  }
  if (input.routingRequested === false) {
    return { emit: false, cause: null, degraded: false,
      reason: 'same-family by configuration (cross-family never requested)' };
  }
  if (/\(usage-switched\)/.test(String(input.qeModelLabel ?? ''))) {
    return {
      emit: true, cause: 'usage-switched', degraded: false,
      reason:
        'usage-switched self-review: Step-8 QE ran on the coder’s own family (' + coderFam +
        ') under the limit override — the cross-model guard was suspended (FR-2.9)',
    };
  }
  if (input.bridge?.rungState === 'probe-failed') {
    return { emit: true, cause: 'probe-failed', degraded: false,
      reason: 'codex probe found no usable id; review ran on the coder’s own family (' + coderFam + ')' };
  }
  if (input.bridge?.rungState === 'dispatched' || input.bridge?.rungState === 'refused-before-dispatch' ||
      input.qeReviewerUsed === 'codex-fallback') {
    return { emit: true, cause: 'same-family-fallback', degraded: false,
      reason: 'same-family fallback: ' + (input.bridge?.decline ?? input.bridge?.rungReason ?? 'cross-family reviewer unavailable') +
        '; review ran on the coder’s own family (' + coderFam + ')' };
  }
  if (input.bridge == null) {
    return { emit: false, cause: null, degraded: true,
      reason: "cause undeterminable (pre-change checkpoint) — re-run with resume:'never' to classify" };
  }
  if (input.routingRequested === true && input.bridge.rungState === 'pending') {
    return { emit: true, cause: 'same-family-pinned', degraded: false,
      reason: 'same-family by explicit qe pin (args.models.qe) while cross-family routing was requested' };
  }
  return { emit: false, cause: null, degraded: true,
    reason: 'cause undeterminable (unknown rung state or routing request)' };
}

export interface ReqeDebt {
  schema: typeof REQE_SCHEMA;
  cause: ReqeCause;
  bridge?: ReqeBridgeFacts | null;
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
  cause: ReqeCause;
  bridge?: ReqeBridgeFacts | null;
  runStamp?: string | null;
}): ReqeDebt {
  return {
    schema: REQE_SCHEMA,
    cause: input.cause,
    ...(input.bridge === undefined ? {} : { bridge: input.bridge }),
    slug: input.slug,
    coderFamily: modelFamily(input.coderUsed),
    qeFamily: modelFamily(input.qeReviewerUsed),
    qeGrade: input.qeGrade == null || String(input.qeGrade).trim() === '' ? null : String(input.qeGrade).trim(),
    reason: input.reason,
    emittedAt: input.emittedAt ?? null,
    runStamp: input.runStamp ?? null,
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
  if (d.cause !== undefined && d.cause !== 'usage-switched' && d.cause !== 'probe-failed' &&
      d.cause !== 'same-family-fallback' && d.cause !== 'same-family-pinned') return null;
  return buildReqeDebt({
    slug: d.slug,
    coderUsed: d.coderFamily,
    qeReviewerUsed: d.qeFamily,
    qeGrade: typeof d.qeGrade === 'string' ? d.qeGrade : null,
    reason: d.reason,
    cause: d.cause ?? 'usage-switched',
    ...(d.bridge === undefined ? {} : {
      bridge: d.bridge && typeof d.bridge === 'object' && !Array.isArray(d.bridge) ? d.bridge : null,
    }),
    emittedAt: typeof d.emittedAt === 'string' && d.emittedAt.trim() !== '' ? d.emittedAt : null,
    runStamp: typeof d.runStamp === 'string' && d.runStamp.trim() !== '' ? d.runStamp : null,
  });
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
    'Independent re-QE for "' + debt.slug + '": the recorded Step-8 review ran on the coder’s own family (' + debt.coderFamily + '); cause=' + debt.cause + (debt.qeGrade ? ' and graded ' + debt.qeGrade : '') + '.',
    'Review with the ' + reviewFamily.toUpperCase() + ' family (the OTHER family than the coder — the suspended guard, restored).',
    'Read: ' + files.join(' , ') + ' plus every file the change manifest lists.',
    'Adversarially verify: correctness, edge cases, the ADR-named load-bearing property HAS a test, and whether the same-family review missed anything.',
    'Output: GRADE A-F + numbered findings with file:line and severity; write the report to ' + artifactsDir + '/08b_reqe_report.md.',
    'Also list every finding of the same-family 08_qe_report.md by number under a "## Prior findings" heading, one line each: <n>: closed|open — <reason>.',
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
  verdict: ReqeVerdict | null;
}

/** Extract the verdict grade from a report, or null. LINE-ANCHORED and range-proof (Codex QE #7):
 * the boilerplate phrase `GRADE A-F` must not read as grade A, so a letter followed by a dash and
 * another grade letter is rejected; and the grade must head its line (a quoted "do not assign
 * GRADE A" mid-paragraph is not a verdict). Conflicting distinct grades ⇒ null (ambiguous). */
export function extractReportGrade(text: string): string | null {
  // the lookahead rejects RANGES in punctuation form (A-F, A/F) AND word form (A through F,
  // A to F) — Codex QE round-2 #6: 'GRADE A through F' must not read as grade A
  // bridge-grade-grammar (backlog ddf83072): the rest of the instrument already speaks in modifiers —
  // `dz round close --grade B-` is accepted and `dz recap` tallies `A-×21` — so a review that writes
  // `GRADE B-` must be readable here too. The modifier is allowed ONLY when a letter does not follow
  // it, because `GRADE A-F` is a RANGE (the boilerplate "GRADE A-F + findings"), not an A-minus.
  // The dash class below is the UNICODE dash family, not just the ASCII hyphen (Codex review HIGH #2):
  // a reviewer's editor turns `A-F` into `A−F` (U+2212) or `A‐F` (U+2010) without asking, and a range
  // written that way used to read as a bare `A`. Any dash-family character following the letter means
  // the text is not a plain grade, so the extractor refuses instead of guessing which half was meant —
  // the same rule that makes `GRADE B-Critical` null. A modifier is only ever its ASCII form (`+`, `-`).
  //   hyphen-minus - | hyphen ‐ | non-breaking ‑ | figure ‒ | en – | em — | horizontal bar ― | minus −
  const matches = [...String(text ?? '').matchAll(/^\s*(?:\*{0,2}#{0,4}\s*)?GRADE\s*[:=‐-―−-]?\s*([A-F](?:[+-](?![ \t]*[A-F]\b))?)(?![A-Za-z])(?![ \t]*[-‐-―−])(?!\s*(?:through|to|thru)\s*[A-F]\b)/gim)];
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
    return { ok: false, error: 'report too small to be a review (< 200 chars of substance) — refusing to settle', grade: null, epilogue: null, verdict: null };
  }
  const grade = extractReportGrade(text);
  if (grade === null) {
    return { ok: false, error: 'report names no unambiguous line-anchored GRADE (A-F) — text without exactly one verdict grade is not a verdict; refusing to settle', grade: null, epilogue: null, verdict: null };
  }
  const verdict = buildReqeVerdict(text);
  const { counts, findings, prior } = verdict;
  const priorSummary = prior.kind === 'closed' ? `closed (${prior.closed}/${prior.total})`
    : prior.kind === 'open' ? `open(${prior.open.length}) of ${prior.total}` : 'unassessed';
  const mismatch = findings.kind === 'accepted' && findings.declared !== null && findings.declared !== findings.rows
    ? ` (declared ${findings.declared}, parsed ${findings.rows})` : '';
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
    `- new findings: ${verdict.new} — BLOCKER ${counts.blocker}, HIGH ${counts.high}, MEDIUM ${counts.medium}, LOW ${counts.low}, unknown ${counts.unknown} (rows ${verdict.rows})${mismatch}`,
    `- prior findings: ${priorSummary}`,
    ...(findings.kind === 'accepted' ? [] : [
      `- findings: unclassified (${findings.kind === 'absent' ? 'absent' : `rejected: ${findings.reason}`})`,
    ]),
    ...verdict.blocking.map((row) => `- ${row.severity} — ${row.title}${row.where === null ? '' : ` (${row.where})`}`),
    '- severities and prior-finding status as declared by the reviewer; dz reqe counts them, it does not judge them.',
    '- settled via `dz reqe --done` (fail-closed: an existing graded report is required).',
    '',
  ].join('\n');
  return { ok: true, error: null, grade, epilogue, verdict };
}

/** Render the debt list for `dz reqe` / the `dz usage` surfacing line. */
export function renderReqeList(debts: readonly ReqeDebt[], malformed: number): string[] {
  const lines: string[] = [];
  if (debts.length === 0 && malformed === 0) {
    lines.push('dz reqe: no re-QE debts — no unsettled machine debts recorded.');
  } else {
    lines.push('dz reqe — ' + debts.length + ' unsettled re-QE debt(s):');
    for (const d of debts) {
      lines.push('  ' + d.slug + '  coder=' + d.coderFamily + ' qe=' + d.qeFamily + (d.qeGrade ? ' grade=' + d.qeGrade : '') + (d.emittedAt ? '  ' + d.emittedAt : '') + ' cause=' + d.cause + '  → dz reqe --slug ' + d.slug);
    }
  }
  if (malformed > 0) lines.push('  ' + malformed + ' malformed debt file(s) skipped (named, never silent).');
  lines.push(REQE_SCOPE);
  return lines;
}


/** Stable keys, including zero counts, for the dz usage JSON output. */
export function countReqeByCause(debts: readonly ReqeDebt[]): Record<ReqeCause, number> {
  const counts: Record<ReqeCause, number> = {
    'usage-switched': 0, 'probe-failed': 0, 'same-family-fallback': 0, 'same-family-pinned': 0,
  };
  for (const debt of debts) counts[debt.cause] += 1;
  return counts;
}
