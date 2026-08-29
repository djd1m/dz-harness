/**
 * `dz recap` — what was done over a day, a week or a month.
 *
 * This module is PURE: no filesystem, no network, and — load-bearing — no clock. The window arrives
 * as a parameter, because a window you cannot pin in a test is a window whose arithmetic errors you
 * cannot catch. MEASURED in this project 2026-08-22: an agent's timestamp was off by a YEAR, the
 * query returned 15 530 "hits" for a "week", and nothing about the output looked wrong.
 *
 * Its second job is refusing. Half of an honest report is declining to answer what the data cannot
 * support, and those refusals live here as behaviour — types that cannot express a quarter, a
 * decision function that names the real span in days, and a three-state section verdict where
 * "the source said nothing" and "the source was not read" can never collapse into one zero.
 *
 * See features/dz-recap/03_adr/ for the decisions and the measurements behind them.
 */

/** The only horizons this project has the data for. A quarter or a year is NOT SPELLABLE (ADR-001). */
export type RecapHorizon = 'day' | 'week' | 'month';

/** Horizons a user may ASK for — recognised so they are refused loudly, never swallowed. */
export type RefusedHorizon = 'quarter' | 'half-year' | 'year';

export const REFUSED_HORIZONS: readonly RefusedHorizon[] = ['quarter', 'half-year', 'year'];

export const RECAP_HORIZONS: readonly RecapHorizon[] = ['day', 'week', 'month'];

const HORIZON_DAYS: Readonly<Record<RecapHorizon, number>> = { day: 1, week: 7, month: 30 };
const REFUSED_DAYS: Readonly<Record<RefusedHorizon, number>> = { quarter: 90, 'half-year': 182, year: 365 };

export interface RecapWindow {
  readonly horizon: RecapHorizon;
  /** Inclusive ISO date (YYYY-MM-DD) of the first day in the window. */
  readonly startIso: string;
  /** Inclusive ISO date of the last day — the anchor. */
  readonly endIso: string;
  readonly days: number;
}

const DAY_MS = 86_400_000;

function isoDay(value: string): string {
  return value.slice(0, 10);
}

/**
 * Does this calendar day exist?
 *
 * `Date.parse` ROLLS OVER an impossible day — 2026-02-31 becomes 2026-03-03 — so a NaN check alone
 * lets a nonexistent date behave like a real one. It bit twice: once producing a reversed window
 * (round 1) and once letting a record dated 2026-02-31 be counted inside a March window (round 10,
 * cross-family QE, codex gpt-5.6-sol, 2026-08-22).
 */
function isRealIsoDay(day: string): boolean {
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === day;
}

/**
 * The window for a horizon, anchored on an EXPLICIT date. Never reads the clock.
 * `atIso` may be a full timestamp; only its date part is used.
 */
export function recapWindow(horizon: RecapHorizon, atIso: string): RecapWindow {
  const end = isoDay(atIso);
  const endMs = Date.parse(`${end}T00:00:00.000Z`);
  if (Number.isNaN(endMs)) throw new Error(`recapWindow: not an ISO date: ${JSON.stringify(atIso)}`);
  // A NaN check is not enough: `Date.parse` ROLLS OVER an impossible day, so '2026-02-31' parses to
  // 2026-03-03 and produced a window whose start was AFTER its end — an internally reversed window
  // that reported on nothing and said nothing about it (cross-family QE, codex gpt-5.6-sol,
  // 2026-08-22, grade F finding 1). The date must survive the round trip to be that date.
  if (new Date(endMs).toISOString().slice(0, 10) !== end) {
    throw new Error(`recapWindow: no such date: ${JSON.stringify(atIso)}`);
  }
  const days = HORIZON_DAYS[horizon];
  const startMs = endMs - (days - 1) * DAY_MS;
  return { horizon, startIso: new Date(startMs).toISOString().slice(0, 10), endIso: end, days };
}

/** Is this instant inside the window? Compared in UTC, never as strings (ADR/AM-5). */
export function withinWindow(w: RecapWindow, isoInstant: string): boolean {
  // A record dated on a day that does not exist is not a record about any day in this window. Left
  // to `Date.parse` alone, 2026-02-31 rolls to 2026-03-03 and would be counted in a March window
  // (round 10) — a count backed by a date nobody could have written.
  if (!isRealIsoDay(isoDay(isoInstant))) return false;
  const t = Date.parse(isoInstant);
  if (Number.isNaN(t)) return false;
  const from = Date.parse(`${w.startIso}T00:00:00.000Z`);
  const to = Date.parse(`${w.endIso}T00:00:00.000Z`) + DAY_MS;
  return t >= from && t < to;
}

export interface HorizonDecision {
  readonly action: 'report' | 'refuse';
  readonly reason: string;
}

/**
 * May we report over the requested horizon at all?
 *
 * `spanDays` is the age of the LONGEST record we actually hold. Asking for a year over 174 days of
 * data is not a thin report — it is an invented one, so it is refused and the real span is named.
 */
export function decideHorizon(input: { requested: string; spanDays: number }): HorizonDecision {
  const req = input.requested.trim().toLowerCase();
  // An unknown span is NOT a span of zero. Coercing NaN to 0 made the refusal say "we hold 0",
  // which is a claim about the records; all we know is that we could not measure them (round 14,
  // codex gpt-5.6-sol, 2026-08-22). The refusal itself was already correct — only its reason lied.
  const known = Number.isFinite(input.spanDays);
  const span = known ? Math.max(0, Math.floor(input.spanDays)) : 0;
  const held = known ? `${span} day(s)` : 'an unmeasurable amount';
  if (!known) {
    return { action: 'refuse', reason: `the span of the records could not be measured, so no horizon can be supported — ${JSON.stringify(input.spanDays)} is not a number of days` };
  }
  // `in` walks the PROTOTYPE CHAIN, so `'constructor'` and `'toString'` passed as supported
  // horizons and the reason came back as `function Object() { [native code] } day(s)` — a report
  // authorised for a horizon that does not exist (round 11, codex gpt-5.6-sol, 2026-08-22).
  if (RECAP_HORIZONS.includes(req as RecapHorizon)) {
    const need = HORIZON_DAYS[req as RecapHorizon];
    if (span < need) {
      return {
        action: 'refuse',
        reason: `a ${req} needs ${need} day(s) of records and we hold ${held} — reporting it would invent the difference`,
      };
    }
    return { action: 'report', reason: `${req}: ${need} day(s) against ${span} day(s) of records` };
  }
  if ((REFUSED_HORIZONS as readonly string[]).includes(req)) {
    const need = REFUSED_DAYS[req as RefusedHorizon];
    // The reason is DERIVED from the span, never asserted. The first version hardcoded "there is
    // exactly one complete quarter" — true of this repository on the day it was written, false for
    // any other span, and printed verbatim even when the records held a single day (cross-family QE
    // round 5, codex gpt-5.6-sol, 2026-08-22). A refusal that over-claims is the same defect as a
    // report that over-claims.
    // TWO DIFFERENT refusals, and conflating them made the message false in one of them (round 6):
    // with 180 days of records a quarter is NOT short of data, so "it would invent the difference"
    // claimed a difference that does not exist. The horizon is refused BY DESIGN — this tool reports
    // day, week and month — and only sometimes ALSO short of data.
    if (span < need) {
      return {
        action: 'refuse',
        reason: `a ${req} needs about ${need} days of records and the longest record here spans ${span} day(s), so reporting it would invent the difference`,
      };
    }
    // Round 7: the previous wording asserted that "the sections here begin on DIFFERENT dates" —
    // true of this repository, but NOT DERIVABLE from anything this function receives. It is given
    // a horizon and a span; a reason built from anything else is a claim its own inputs cannot
    // support, which is the very failure this module exists to prevent. So it says only that, and
    // the design rationale lives where the evidence for it lives (ADR-001, and each section's own
    // data-start date in the report).
    return {
      action: 'refuse',
      reason: `a ${req} is not a supported horizon — this reports a day, a week or a month. The records span ${span} day(s)`,
    };
  }
  return { action: 'refuse', reason: `unknown horizon ${JSON.stringify(input.requested)} — use --day, --week or --month` };
}

export type SectionStatus = 'full' | 'partial' | 'unavailable';

export interface SectionVerdict {
  readonly status: SectionStatus;
  /** The date this source's records begin — computed from the source itself, never hardcoded. */
  readonly dataStart: string | null;
  readonly note: string;
}

/**
 * Does this source cover the whole window?
 *
 * `dataStart: null` means the source was NOT READ — a different fact from "read, and empty".
 * Collapsing the two is how a report says "nothing happened" about a week it could not see.
 */
export function sectionStatus(input: { dataStart: string | null; windowStart: string; windowEnd?: string }): SectionVerdict {
  if (input.dataStart === null) {
    return { status: 'unavailable', dataStart: null, note: 'source not read — this section says nothing, which is not the same as zero' };
  }
  const start = isoDay(input.dataStart);
  // Round 13: an impossible `dataStart` (2026-02-31) was accepted and reported as covering the
  // whole window. A date that does not exist cannot support a coverage claim — the same rule
  // already applied to the window anchor and to record membership, now applied here too.
  if (!isRealIsoDay(start)) {
    return { status: 'unavailable', dataStart: null, note: `the recorded start date ${JSON.stringify(input.dataStart)} is not a real date — this section cannot be trusted to cover anything` };
  }
  if (start <= isoDay(input.windowStart)) {
    return { status: 'full', dataStart: start, note: `records cover the whole window (from ${start})` };
  }
  // Round 8 (codex gpt-5.6-sol, 2026-08-22): the note said the records begin "inside the window",
  // which this function could not know — it was never given the window's END. Two consequences:
  // the wording now claims only what the inputs support, and when the end IS supplied, records
  // that begin after it are reported as covering nothing rather than as a partial view.
  const end = input.windowEnd === undefined ? null : isoDay(input.windowEnd);
  if (end !== null && start > end) {
    return { status: 'unavailable', dataStart: start, note: `records only begin ${start}, after this window ends — this source says nothing about it` };
  }
  const where = end === null ? 'after this window starts' : 'inside the window';
  return { status: 'partial', dataStart: start, note: `records only begin ${start}, ${where} — everything before that is unknown, not absent` };
}

export interface ForbiddenMetric {
  readonly name: string;
  /** The measurement that disqualifies it. A bare ban decays into a word list. */
  readonly reason: string;
}

/**
 * Measures of the INSTRUMENT, not of the work (ADR-003). Each will be proposed again precisely
 * because each is a one-liner to compute, so each carries the measurement that refutes it.
 */
export const FORBIDDEN_METRICS: readonly ForbiddenMetric[] = [
  { name: 'commit count', reason: 'this project mandates a commit per logical change; 1318 commits over 66 active days measures compliance with that rule, not output (MEASURED 2026-08-22)' },
  { name: 'lines changed', reason: 'generated artifacts dominate — 352 of 1318 commits are docs, and one pipeline run writes 8-10 files before a line of product code exists' },
  { name: 'token spend', reason: 'self-declared an estimate, once wrong sixfold, covers 17 days, and 20 of 86 ledger rows carry no number by construction' },
  { name: 'learning event volume', reason: '640 in May against 10454 in August, but the sources are post-edit and post-command hooks: the curve measures when hooks were installed' },
  { name: 'inventory counts', reason: 'skills, packages and tests only ever grow, so they can only ever flatter' },
  { name: 'learned lesson count', reason: 'already refuted by this project’s own dz compounding: 54% of the pool has never been read by anyone' },
];

// ── the report ──────────────────────────────────────────────────────────────

/**
 * A delivery, with the grade its report STATES.
 *
 * A discriminated union, not a status plus a nullable field: the pair `{gradeStatus: 'unique',
 * grade: null}` used to be spellable, and it printed `1 carry a grade …: null×1` — a count of
 * graded deliveries backed by no grade (cross-family QE round 4, codex gpt-5.6-sol, 2026-08-22).
 * The union makes that pair a compile error, and `normaliseDelivery` catches it at runtime for
 * callers who reach this from JavaScript.
 */
export type Delivery =
  | { readonly slug: string; readonly createdIso: string; readonly gradeStatus: 'unique'; readonly grade: string }
  | { readonly slug: string; readonly createdIso: string; readonly gradeStatus: 'ambiguous' | 'none' | 'no-report'; readonly grade: null };

/** A `unique` with no usable grade is not a graded delivery; it is a report we could not read. */
function normaliseDelivery(d: Delivery): Delivery {
  if (d.gradeStatus === 'unique' && (typeof d.grade !== 'string' || d.grade.trim() === '')) {
    return { slug: d.slug, createdIso: d.createdIso, gradeStatus: 'none', grade: null };
  }
  return d;
}

export interface Publish {
  readonly pkg: string;
  readonly version: string;
  readonly iso: string;
}

export interface GuardRun {
  readonly iso: string;
  readonly verdict: string;
  readonly rules: readonly string[];
}

export interface ReuseFacts {
  readonly dataStart: string | null;
  readonly eventsInWindow: number;
  readonly lessonsEverRecalled: number;
  readonly lessonsTotal: number;
}

export interface SourceFacts<T> {
  readonly dataStart: string | null;
  readonly items: readonly T[];
}

export interface RecapFacts {
  readonly window: RecapWindow;
  /** The longest record we hold, in days — what `decideHorizon` judges against. */
  readonly spanDays: number;
  /** `null` means NOT READ. An empty `items` means read-and-empty. The type keeps them apart. */
  readonly deliveries: SourceFacts<Delivery> | null;
  readonly publishes: SourceFacts<Publish> | null;
  readonly guard: SourceFacts<GuardRun> | null;
  readonly reuse: ReuseFacts | null;
  /** Feature dirs on disk that git has never seen — the report is blind to them, and says so. */
  readonly uncommittedSlugs: readonly string[];
}

export interface RecapSection {
  readonly id: 'deliveries' | 'publishes' | 'discipline' | 'reuse';
  readonly title: string;
  readonly verdict: SectionVerdict;
  readonly lines: readonly string[];
}

export interface RecapReport {
  readonly window: RecapWindow;
  readonly spanDays: number;
  readonly sections: readonly RecapSection[];
  readonly caveats: readonly string[];
}

/**
 * The window narrowed to what this source's records actually cover.
 *
 * Round 3 of the cross-family review (codex gpt-5.6-sol, 2026-08-22): labelling the covered range
 * was not enough while the COUNT was still taken over the whole window. An item dated inside the
 * window but before the records begin was counted, under a label promising a later range — an
 * unsupported number wearing an honest caption. Filtering on the narrowed window makes the count
 * and the caption agree BY CONSTRUCTION, which no assertion can undo.
 */
function coveredWindow(v: SectionVerdict, w: RecapWindow): RecapWindow {
  if (v.status !== 'partial' || v.dataStart === null) return w;
  const startIso = v.dataStart > w.startIso ? v.dataStart : w.startIso;
  const days = Math.round((Date.parse(`${w.endIso}T00:00:00Z`) - Date.parse(`${startIso}T00:00:00Z`)) / DAY_MS) + 1;
  return { horizon: w.horizon, startIso, endIso: w.endIso, days: Math.max(0, days) };
}

const UNAVAILABLE_LINES: readonly string[] = ['not read — this section cannot say anything about this window'];

function emptyOrUnavailable(v: SectionVerdict, emptyLine: string): string[] {
  return v.status === 'unavailable' ? [...UNAVAILABLE_LINES] : [emptyLine];
}

/**
 * The safety property, enforced at ONE place rather than trusted at four.
 *
 * A source with no `dataStart` was NOT READ, and a section that was not read must not present
 * counts — whatever items happen to sit alongside. The first version branched on `items.length`
 * first, so `{dataStart: null, items: [...]}` printed "1 feature directory created" under an
 * `unavailable` verdict: unsupported numbers, which is exactly what this feature exists to prevent
 * (cross-family QE, codex gpt-5.6-sol, 2026-08-22, grade F finding 2).
 */
function sectionLines(v: SectionVerdict, window: RecapWindow, compute: (scope: string) => string[]): string[] {
  if (v.status === 'unavailable') return [...UNAVAILABLE_LINES];
  if (v.status === 'partial') {
    // Round 2 of the same review found the identical honesty failure one level up: a `partial`
    // section printed WHOLE-WINDOW counts, and a zero read as "nothing happened all week" when the
    // first days of the week simply have no records. A count here is supported only over the range
    // the records actually cover, so it is labelled with that range and never with the window.
    const covered = `${v.dataStart as string} … ${window.endIso}`;
    return [
      `these numbers cover ONLY ${covered} — ${window.startIso} to the day before ${v.dataStart as string} has no records, so it is unknown, not zero`,
      ...compute(`the covered range (${covered})`),
    ];
  }
  return compute('this window');
}

export function buildRecap(facts: RecapFacts): RecapReport {
  const ws = facts.window.startIso;
  const we = facts.window.endIso;
  const sections: RecapSection[] = [];

  // 1. Deliveries
  {
    const v = sectionStatus({ dataStart: facts.deliveries?.dataStart ?? null, windowStart: ws, windowEnd: we });
    const covered = coveredWindow(v, facts.window);
    const items = (facts.deliveries?.items ?? []).map(normaliseDelivery).filter((d) => withinWindow(covered, d.createdIso));
    const graded = items.filter((d): d is Extract<Delivery, { gradeStatus: 'unique' }> => d.gradeStatus === 'unique');
    const ambiguous = items.filter((d) => d.gradeStatus === 'ambiguous');
    const ungraded = items.filter((d) => d.gradeStatus === 'none' || d.gradeStatus === 'no-report');
    const lines = sectionLines(v, facts.window, (scope) => items.length === 0
      ? emptyOrUnavailable(v, `no feature directories were created in ${scope}`)
      : [
          `${items.length} feature director${items.length === 1 ? 'y' : 'ies'} created in ${scope}`,
          `${graded.length} carry a grade an independent review stated unambiguously${graded.length > 0 ? `: ${tally(graded.map((d) => d.grade))}` : ''}`,
          `${ambiguous.length} have a report that states MORE THAN ONE grade — reported as ambiguous, never guessed`,
          `${ungraded.length} have no letter grade in their report, or no report at all`,
          'cadence is not value: this counts deliveries, not what they were worth',
        ]);
    sections.push({ id: 'deliveries', title: 'Deliveries', verdict: v, lines });
  }

  // 2. Publishes
  {
    const v = sectionStatus({ dataStart: facts.publishes?.dataStart ?? null, windowStart: ws, windowEnd: we });
    const covered = coveredWindow(v, facts.window);
    const items = (facts.publishes?.items ?? []).filter((p) => withinWindow(covered, p.iso));
    const pkgs = new Set(items.map((p) => p.pkg));
    const lines = sectionLines(v, facts.window, (scope) => items.length === 0
      ? emptyOrUnavailable(v, `no versions were accepted by the registry in ${scope}`)
      : [
          `${items.length} version(s) accepted by the registry across ${pkgs.size} package(s) in ${scope}`,
          'timestamps are the registry’s own — this is the one record here nobody local can backdate',
        ]);
    sections.push({ id: 'publishes', title: 'Publishes', verdict: v, lines });
  }

  // 3. Discipline — DESCRIBES, never compares (ADR-004)
  {
    const v = sectionStatus({ dataStart: facts.guard?.dataStart ?? null, windowStart: ws, windowEnd: we });
    const covered = coveredWindow(v, facts.window);
    const runs = (facts.guard?.items ?? []).filter((g) => withinWindow(covered, g.iso));
    const byVerdict = new Map<string, number>();
    const byRule = new Map<string, number>();
    for (const r of runs) {
      byVerdict.set(r.verdict, (byVerdict.get(r.verdict) ?? 0) + 1);
      for (const rule of r.rules) byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    }
    const lines = sectionLines(v, facts.window, (scope) => runs.length === 0
      ? emptyOrUnavailable(v, `no gate runs were recorded in ${scope}`)
      : [
          `${runs.length} gate run(s) in ${scope}: ${[...byVerdict.entries()].map(([k, n]) => `${k} ${n}`).join(', ')}`,
          byRule.size === 0
            ? `no rule was violated in ${scope}`
            : `violations by rule: ${[...byRule.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ')}`,
        ]);
    // The caveat is mandatory for every section that HAS data — but not for one that has none.
    // Round 9 (codex gpt-5.6-sol, 2026-08-22): pushed unconditionally, an unread section claimed "a
    // missing rule was never violated or did not yet exist", when with no log a missing rule may
    // simply have fired unseen; and "this section describes the window" was false of a section
    // describing nothing. A caveat that over-claims is still an over-claim.
    if (v.status !== 'unavailable') {
      // The caveat must be exactly as strong as the coverage. On a PARTIAL section a missing rule
      // has a THIRD possible history — violated in the part these records do not reach — and the
      // two-option wording denied it (round 12, codex gpt-5.6-sol, 2026-08-22).
      lines.push(v.status === 'partial'
        ? 'a rule missing from this list was never violated in the covered range, did not yet exist, or was violated before these records begin — the log records a rule only when it fires, so it cannot tell those apart'
        : 'a rule missing from this list was either never violated or did not yet exist — the log records a rule only when it fires, so it cannot tell those apart');
      lines.push('this section describes the records it has; it deliberately computes no comparison between periods');
    }
    sections.push({ id: 'discipline', title: 'Discipline', verdict: v, lines });
  }

  // 4. Knowledge reuse
  {
    const v = sectionStatus({ dataStart: facts.reuse?.dataStart ?? null, windowStart: ws, windowEnd: we });
    const r = facts.reuse;
    // `eventsInWindow` arrives ALREADY aggregated over the requested window, so unlike every other
    // section it cannot be re-filtered to the covered range here. A partial reuse section therefore
    // withholds the event count rather than captioning it with a range it does not match.
    const lines = sectionLines(v, facts.window, (scope) => r === null || r.lessonsTotal === 0
      ? emptyOrUnavailable(v, `no lessons are stored, so there is nothing to reuse in ${scope}`)
      : [
          v.status === 'partial'
            ? 'the recall-event count is withheld: it was aggregated over the whole window, which these records do not cover'
            : `${r.eventsInWindow} recall event(s) in ${scope}`,
          `${r.lessonsEverRecalled} of ${r.lessonsTotal} stored lessons have ever been read (${Math.round((r.lessonsEverRecalled / r.lessonsTotal) * 100)}%)`,
          'this is a ratio with a hostile denominator: storing more unread lessons makes it worse, not better',
        ]);
    sections.push({ id: 'reuse', title: 'Knowledge reuse', verdict: v, lines });
  }

  const caveats: string[] = [];
  if (facts.uncommittedSlugs.length > 0) {
    caveats.push(`${facts.uncommittedSlugs.length} feature director${facts.uncommittedSlugs.length === 1 ? 'y is' : 'ies are'} not committed yet and therefore invisible to this report: ${facts.uncommittedSlugs.join(', ')}`);
  }
  caveats.push('none of the following is computed here, and each carries the measurement that disqualifies it: ' + FORBIDDEN_METRICS.map((m) => m.name).join(', '));

  return { window: facts.window, spanDays: facts.spanDays, sections, caveats };
}

function tally(values: readonly string[]): string {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k}×${n}`).join(' ');
}

/** The human rendering. `--json` prints the SAME `RecapReport` — one structure, two spellings (FR-6). */
export function renderRecap(report: RecapReport): string[] {
  const out: string[] = [];
  out.push(`dz recap — ${report.window.horizon}: ${report.window.startIso} … ${report.window.endIso} (${report.window.days} day(s))`);
  out.push(`records held: ${report.spanDays} day(s)`);
  for (const s of report.sections) {
    out.push('');
    out.push(`${s.title}  [${s.verdict.status}]${s.verdict.dataStart !== null ? ` · records from ${s.verdict.dataStart}` : ''}`);
    out.push(`  ${s.verdict.note}`);
    for (const l of s.lines) out.push(`  · ${l}`);
  }
  out.push('');
  for (const c of report.caveats) out.push(`! ${c}`);
  return out;
}
