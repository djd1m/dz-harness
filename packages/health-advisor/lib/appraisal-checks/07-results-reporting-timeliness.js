'use strict';
// C7 — results-reporting-timeliness. primaryCompletionDateStruct.date + 12 months vs the presence
// of registry results (hasResults). Worded as ELAPSED TIME, NEVER as a legal determination (I-9:
// whether any reporting statute applies to this trial is a legal question this tool does not
// answer). `now` is an EXPLICIT parameter, defaulted by the runner — never read inside this check:
// a check that reads the wall clock is not deterministic and its fixture test rots on a date
// boundary. Pure — no I/O.

const { isBundle, makeFinding, actualDateReason } = require('../appraisal-core.js');
const { isCalendarDate } = require('../appraisal.js');

const DOMAIN = 'results-reporting-timeliness';

const CLOSED_STATUSES = Object.freeze(['COMPLETED', 'TERMINATED']);
const WINDOW_DAYS = 365;

// TOTAL over actualDateReason's refusals (CA-1 QE F4) — a new reason cannot render as `undefined`.
const COMPLETION_DATE_REFUSALS = Object.freeze({
  'field-absent': 'the registry record carries no primary completion date',
  'field-estimated-not-actual': 'the primary completion date is ESTIMATED — a plan, not an observation',
  'field-not-recorded-as-actual': 'the registry record does not state the primary completion date as ACTUAL; elapsed time measured from an unlabelled date is elapsed time from an unknown event',
  'date-not-a-calendar-date': 'the recorded primary completion date has ISO shape but names no day on the calendar',
});

function unknownFinding(reason, detail) {
  return makeFinding({
    domain: DOMAIN,
    verdict: 'unknown',
    evidence: [{ quote: `${reason}: ${detail}`, locator: null }],
    refutable_by: 'an ACTUAL primary completion date and a results-posting record in the registry',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

function daysBetween(isoA, isoB) {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  return Math.floor((b - a) / 86400000);
}

// ── C3-6 (round 3): registry strings are SHAPE-GATED before they enter this check's own prose ──
// The C-3 reorder put the results-posted branch first, and that branch copied
// `resultsFirstSubmitDate` into its quote UNCHANGED — `'50%'` there made makeFinding throw
// (bare-percentage gate) and the uncaught TypeError aborted the whole appraisal. A registry value
// this check cannot vouch the shape of is OMITTED from its prose, never quoted into it.

/** ISO-shaped (year / year-month / year-month-day) or nothing — the only forms quoted as a date. */
function isoDateShaped(value) {
  return typeof value === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
}

/** `ctgov:<id>` only when the id actually has NCT shape; the generic source name otherwise. */
function ctgovLocator(reg) {
  return (typeof reg.nctId === 'string' && /^NCT\d+$/i.test(reg.nctId)) ? `ctgov:${reg.nctId}` : 'ctgov-v2';
}

/** Registry status tokens are single UPPER_SNAKE words; anything else is not quoted as one. */
function statusForProse(status) {
  if (typeof status !== 'string' || status.length === 0) return '(absent)';
  return /^[A-Za-z_-]+$/.test(status) ? status : '(not a recognized status value)';
}

function evaluate(bundle, { now } = {}) {
  if (!isBundle(bundle)) return null;
  const reg = bundle.sources && bundle.sources.ctgovV2;
  if (!reg || reg.answered === false) {
    return unknownFinding('registry-record-absent', 'no trustworthy registry linkage resolved for this subject');
  }
  if (!CLOSED_STATUSES.includes(reg.overallStatus)) {
    // C3-6: the status is quoted only when it has status SHAPE — junk is named, not reproduced
    return unknownFinding('check-not-applicable',
      `the study status is ${statusForProse(reg.overallStatus)} — the reporting window is measured from completion of a closed study`);
  }
  // CA-1 QE round 2, C-3 — RESULTS-POSTED IS A DATE-FREE BRANCH and runs ABOVE every date gate.
  // Verified live (NCT00840749): a month-precision completion date put this branch behind the
  // day-precision gate, returning unknown for a study whose results are plainly posted. The branch
  // performs no date arithmetic, so the ACTUAL / calendar / precision gates have nothing to protect
  // here; they still guard every path below that DOES arithmetic. STRICT `=== true` — null or any
  // non-boolean stays on the gated path and can never read as "results posted".
  if (reg.hasResults === true) {
    return makeFinding({
      domain: DOMAIN,
      verdict: 'no-concern',
      evidence: [{
        // C3-6: the submit date rides into this quote only when it is DATE-SHAPED — '50%' here
        // used to throw at makeFinding and abort the run
        quote: `results are posted in the registry${isoDateShaped(reg.resultsFirstSubmitDate) ? ` (first submitted ${reg.resultsFirstSubmitDate})` : ''}`,
        locator: ctgovLocator(reg),
      }],
      refutable_by: 'a registry correction withdrawing the posted results',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  }
  // CA-1 QE F4 — the ONE `=== 'ACTUAL'` rule, replacing `!== 'ESTIMATED'`: `type: null` used to
  // reach the concern branch and render "the recorded null primary completion date".
  const pcd = reg.primaryCompletionDateStruct;
  const pcdReason = actualDateReason(pcd);
  if (pcdReason !== null) {
    return unknownFinding(pcdReason, COMPLETION_DATE_REFUSALS[pcdReason]);
  }
  if (typeof now !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(now)) {
    return unknownFinding('field-absent', 'no observation date was supplied to measure elapsed time against');
  }
  // CA-1 QE F4 — the shape test `^\d{4}-\d{2}-\d{2}` accepted '2026-99-99', Date.parse returned NaN,
  // and `NaN > WINDOW_DAYS` is false, so the run fell through to no-concern reading "NaN days …
  // inside the 12-month window". An arithmetic result that is not a number is not a small number.
  if (!isCalendarDate(now.slice(0, 10))) {
    return unknownFinding('date-not-a-calendar-date',
      `the supplied observation date (${now.slice(0, 10)}) has ISO shape but names no day on the calendar; elapsed days cannot be counted`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pcd.date)) {
    return unknownFinding('not-orderable-at-available-precision',
      `the primary completion date (${pcd.date}) is not day-precise; elapsed days cannot be counted`);
  }
  // CA-1 QE F4 — `hasResults !== true` treated EVERY non-true value as "no results posted", so
  // `hasResults: null` (the registry did not say) produced the concern "the registry shows no
  // posted results". Absence of a statement is not a statement of absence. (`=== true` short-
  // circuited above — C-3; only an explicit `false` may reach the elapsed-time arithmetic.)
  if (reg.hasResults !== false) {
    return unknownFinding('field-absent',
      `the registry record does not say whether results are posted (hasResults: ${String(reg.hasResults)})`);
  }
  const elapsed = daysBetween(pcd.date, now.slice(0, 10));
  /* istanbul ignore next -- both operands are calendar-validated above; the belt stays because a
     non-number reaching either verdict branch is exactly the F4 defect class */
  if (!Number.isFinite(elapsed)) {
    return unknownFinding('date-not-a-calendar-date',
      `elapsed days between ${pcd.date} and ${now.slice(0, 10)} are not computable`);
  }
  if (elapsed > WINDOW_DAYS) {
    const months = Math.floor(elapsed / 30);
    return makeFinding({
      domain: DOMAIN,
      verdict: 'concern',
      evidence: [{
        quote: `about ${months} months have elapsed since the recorded ${pcd.type} primary completion date ${pcd.date}, and the registry shows no posted results`,
        locator: ctgovLocator(reg),
      }],
      refutable_by: 'results published in the registry or a journal, or a registry-recorded extension for this trial',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  }
  return makeFinding({
    domain: DOMAIN,
    verdict: 'no-concern',
    evidence: [{
      quote: `${elapsed} days since the recorded ${pcd.type} primary completion date ${pcd.date} — inside the 12-month window; no results posted yet`,
      locator: ctgovLocator(reg),
    }],
    refutable_by: 'the window elapsing without posted results',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

module.exports = { domain: DOMAIN, evaluate, WINDOW_DAYS };
