'use strict';
// C3 — registration-timing. studyFirstSubmitDate vs startDateStruct.date where type === 'ACTUAL'.
// An ESTIMATED start date is an intention, not an observation: arithmetic on it is forbidden
// (unknown / field-estimated-not-actual). Ordering is decided by the SHARED KERNEL's
// precision-aware comparison (lib/registry-edit-timing.js via ../appraisal.js, BY REFERENCE — QE
// GAP-9 closure): a tie at the coarsest precision both dates carry is NOT "on or before" — it is
// unorderable, and unorderable is 'unknown', never 'no-concern' and never 'concern'.
// Pure — no I/O, no clock.

const {
  isBundle, makeFinding, UNKNOWN_REASONS, actualDateReason,
} = require('../appraisal-core.js');
const { editAfterPrimaryCompletion, timingUnknownReason } = require('../appraisal.js');

const DOMAIN = 'registration-timing';

// The detail text for each way actualDateReason can refuse the start date — TOTAL over what it
// returns, so a new refusal reason cannot render as `undefined`.
const START_DATE_REFUSALS = Object.freeze({
  'field-absent': 'the registry record carries no start date',
  'field-estimated-not-actual': 'the start date is ESTIMATED — a plan, not an observation',
  'field-not-recorded-as-actual': 'the registry record does not state the start date as ACTUAL; arithmetic on an unlabelled date would report an observation the record never made',
  'date-not-a-calendar-date': 'the recorded start date has ISO shape but names no day on the calendar',
});

// TOTAL over the reasons the scalar predicate can emit here — an unmapped reason is a THROW.
// Kernel argument order is (studyFirstSubmitDate, startDate): 'yes' = submitted strictly after the
// start = retrospective; 'edit-date-absent' = submit date unparseable; 'primary-completion-date-
// absent' = start date unparseable.
const KERNEL_REASON_MAP = Object.freeze({
  'edit-date-absent': 'field-absent',
  'primary-completion-date-absent': 'field-absent',
  'same-day-not-orderable': 'not-orderable-at-available-precision',
  'same-month-not-orderable': 'not-orderable-at-available-precision',
  'same-year-not-orderable': 'not-orderable-at-available-precision',
  // CA-1 QE F1 — a date-shaped string that names no day on the calendar is UNORDERABLE, never a
  // verdict input. The map stays TOTAL over the kernel's reasons; an unmapped reason still throws.
  'date-not-a-calendar-date': 'date-not-a-calendar-date',
});

function mapKernelReason(reason) {
  const mapped = KERNEL_REASON_MAP[reason];
  if (!mapped || !UNKNOWN_REASONS.includes(mapped)) {
    throw new TypeError(`unmapped kernel timing reason in check 3: ${String(reason)}`);
  }
  return mapped;
}

function unknownFinding(reason, detail) {
  return makeFinding({
    domain: DOMAIN,
    verdict: 'unknown',
    evidence: [{ quote: `${reason}: ${detail}`, locator: null }],
    refutable_by: 'an ACTUAL start date and a first-submitted date in the registry record',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

function evaluate(bundle) {
  if (!isBundle(bundle)) return null;
  const reg = bundle.sources && bundle.sources.ctgovV2;
  if (!reg || reg.answered === false) {
    return unknownFinding('registry-record-absent', 'no trustworthy registry linkage resolved for this subject');
  }
  // CA-1 QE F4 — the ONE `=== 'ACTUAL'` rule. Rejecting only 'ESTIMATED' let `type: null` through,
  // and the concern then read "after the recorded ACTUAL start date" about a date the registry
  // never labelled ACTUAL. The rule also refuses a date-shaped string that is not on the calendar
  // (F1) BEFORE any arithmetic touches it.
  const start = reg.startDateStruct;
  const startReason = actualDateReason(start);
  if (startReason !== null) {
    return unknownFinding(startReason, START_DATE_REFUSALS[startReason]);
  }
  const submit = reg.studyFirstSubmitDate;
  if (typeof submit !== 'string') {
    return unknownFinding('field-absent', 'the registry record carries no first-submitted date');
  }
  // ONE ordering definition: the kernel (QE GAP-9 closure). 'yes' = submitted strictly after the
  // recorded ACTUAL start at the coarsest common precision = retrospective registration.
  const order = editAfterPrimaryCompletion(submit, start.date);
  if (order === 'unknown') {
    const kernelReason = timingUnknownReason(submit, start.date);
    return unknownFinding(mapKernelReason(kernelReason),
      `registration first submitted ${submit} and the recorded ACTUAL start date ${start.date} cannot be ordered at the precision the record carries (${kernelReason}) — a tie is never read as prospective and never as retrospective`);
  }
  if (order === 'yes') {
    return makeFinding({
      domain: DOMAIN,
      verdict: 'concern',
      evidence: [{
        quote: `registration first submitted ${submit}, after the recorded ACTUAL start date ${start.date}`,
        locator: reg.nctId ? `ctgov:${reg.nctId}` : 'ctgov-v2',
      }],
      refutable_by: 'an earlier registration record for the same trial in this or another primary registry',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  }
  return makeFinding({
    domain: DOMAIN,
    verdict: 'no-concern',
    evidence: [{
      quote: `registration first submitted ${submit}, before the recorded ACTUAL start date ${start.date}`,
      locator: reg.nctId ? `ctgov:${reg.nctId}` : 'ctgov-v2',
    }],
    refutable_by: 'a registry correction moving either date',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

module.exports = { domain: DOMAIN, evaluate, KERNEL_REASON_MAP };
