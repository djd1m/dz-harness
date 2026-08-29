'use strict';
// OWNERSHIP (ADR-004, as amended by ha-ca1 AM-13): this is the ONE definition of the
// post-completion-edit fact in this package. CA-1 (lib/appraisal-checks/…) imports it; it does not
// re-implement it. Deleting this module in favour of a CA-1-internal definition is allowed; keeping
// BOTH is the NFR-2 violation ADR-004 exists to prevent.
//
// Slice-agnostic shared kernel (feature ha-ca2-registry-vs-publication, ADR-003 shape as relocated by
// ADR-004; extended in place by ha-ca1-deterministic-appraisal AM-14): ISO date-strings in, one of
// three words out. This module mentions no consumer.

const TIMELINE_KEYS = Object.freeze([
  'primary_completion_date',
  'record_first_posted',
  'record_last_update_posted',
  'primary_outcome_versions',
  'edit_after_primary_completion',
  'timing_unknown_reason',
]);

const TIMING_COMPARISON = Object.freeze(['yes', 'no', 'unknown']);

const TIMELINE_UNKNOWN_REASONS = Object.freeze([
  'primary-completion-date-absent',
  'edit-date-absent',
  // AM-15 (ha-ca1): NARROWED, not removed — now means "history payload retrieved, but it carries no
  // version record for the requested field". The endpoint-not-answering state is 'endpoint-unavailable'.
  'record-history-unavailable',
  'same-day-not-orderable',
  // AM-14 A2 (ha-ca1): an ESTIMATED completion date is present-but-a-plan, not absent.
  'field-estimated-not-actual',
  // AM-14 A3 (ha-ca1): the history source did not answer — reachable only via
  // changedAfterPrimaryCompletion, never via the scalar predicate (which has no notion of a fetch).
  'endpoint-unavailable',
  // AM-14 A1 (ha-ca1): a tie at the coarsest precision both dates carry is not orderable.
  'same-month-not-orderable',
  'same-year-not-orderable',
  // CA-1 QE F1: the string has ISO SHAPE but names no day on the calendar (2021-02-29, 2020-13,
  // 2020-00, 2020-02-31, 2020-99-99). A shape check is not a validity check; such a string is
  // UNORDERABLE, never an orderable value — ordering it manufactures the accusation this slice
  // exists to prevent.
  'date-not-a-calendar-date',
]);

// ADR-003 §Decision clause 3 — one definition, rendered with EVERY timeline surface, unconditionally.
const TIMING_DISCLOSURE =
  'Registry records are routinely updated after the primary completion date for reasons unrelated ' +
  'to the outcome (administrative, recruitment, sponsor, results posting). The timing above is a ' +
  'dated fact; this tool draws no conclusion about why an edit was made.';

const DAY_STRING_RE_SOURCE = '^\\d{4}-\\d{2}-\\d{2}$';

/** A full-precision ISO day-string (YYYY-MM-DD), or null. */
function toDayString(value) {
  if (typeof value !== 'string') return null;
  return new RegExp(DAY_STRING_RE_SOURCE).test(value) ? value : null;
}

// AM-14 A1 (ha-ca1): a PARTIAL ISO date (YYYY or YYYY-MM) is now orderable at ITS OWN precision.
// Parse any of the three precisions; anything else is not a date.
const PARTIAL_DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

// CA-1 QE F1 — SHAPE IS NOT VALIDITY. PARTIAL_DATE_RE validates digits; the calendar decides which
// digit strings name a day that exists. Computed arithmetically (no `new Date`, which silently
// ROLLS OVER: Date.UTC(2021, 1, 29) is 2021-03-01, and years 0-99 are remapped to 1900+).
const DAYS_IN_MONTH = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y, month) {
  return (month === 2 && isLeapYear(y)) ? 29 : DAYS_IN_MONTH[month - 1];
}

/** true when `raw` has ISO date SHAPE — says nothing about whether that date exists. */
function hasDateShape(raw) {
  return typeof raw === 'string' && PARTIAL_DATE_RE.test(raw);
}

/**
 * true when a shaped ISO string names a real calendar date AT ITS OWN PRECISION:
 *   YYYY        — year >= 0001 (C-5: the civil calendar has no year 0)
 *   YYYY-MM     — month in 01..12
 *   YYYY-MM-DD  — day in 01..(days in that month of that year, leap-aware)
 * Returns false for anything without the shape.
 */
function isCalendarDate(raw) {
  if (typeof raw !== 'string') return false;
  const m = PARTIAL_DATE_RE.exec(raw);
  if (m === null) return false;
  const year = Number(m[1]);
  // CA-1 QE round 2, C-5 — THE YEAR FLOOR. The leap arithmetic was right (0 % 400 === 0), so
  // 0000-02-29 slid through as a "leap day" of a year the civil calendar does not contain. Year 1
  // is the first civil year; ISO 8601's astronomical year 0000 names no year a registry can record.
  // (Still no `new Date` — it rolls invalid dates over and remaps years 0-99.)
  if (year < 1) return false;
  if (m[2] === undefined) return true;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  if (m[3] === undefined) return true;
  const day = Number(m[3]);
  return day >= 1 && day <= daysInMonth(year, month);
}

/**
 * { value: normalised string, precision: 1|2|3 } (year|month|day), or null.
 * null for BOTH "not a date-shaped string" and "date-shaped but not on the calendar" — callers that
 * must tell those apart ask hasDateShape(). Returning a precision for 2021-02-29 would hand the
 * comparison an orderable value for a day that does not exist (CA-1 QE F1).
 */
function toDatePrecision(raw) {
  if (typeof raw !== 'string') return null;
  const m = PARTIAL_DATE_RE.exec(raw);
  if (m === null) return null;
  if (!isCalendarDate(raw)) return null;
  const precision = m[3] ? 3 : (m[2] ? 2 : 1);
  return { value: raw, precision };
}

/** Truncate an ISO date-string to a precision (1=YYYY, 2=YYYY-MM, 3=YYYY-MM-DD). */
function truncateToPrecision(value, precision) {
  return value.slice(0, precision === 1 ? 4 : (precision === 2 ? 7 : 10));
}

const TIE_REASON_BY_PRECISION = Object.freeze({
  1: 'same-year-not-orderable',
  2: 'same-month-not-orderable',
  3: 'same-day-not-orderable',
});

/**
 * The reason the post-completion-edit fact is 'unknown' for these inputs, or null when it is
 * orderable. Owned here, beside the predicate, so value and reason can never disagree.
 * Row order (ADR-003 rows, as amended by ha-ca1 AM-14 A1/A2; CA-1 QE F1 adds the calendar rows):
 *   edit date-shaped but not on the calendar         -> 'date-not-a-calendar-date'      (F1)
 *   edit absent/unparseable                          -> 'edit-date-absent'
 *   completion type ESTIMATED                        -> 'field-estimated-not-actual'   (A2)
 *   completion date-shaped but not on the calendar   -> 'date-not-a-calendar-date'      (F1)
 *   completion absent/unparseable                    -> 'primary-completion-date-absent'
 *   tie at the coarsest precision both sides carry   -> 'same-{day,month,year}-not-orderable' (A1/X9)
 *   otherwise                                        -> null (orderable: 'yes' or 'no')
 */
function timingUnknownReason(editDate, primaryCompletionDate, { completionDateType } = {}) {
  const edit = toDatePrecision(editDate);
  if (edit === null) {
    return hasDateShape(editDate) ? 'date-not-a-calendar-date' : 'edit-date-absent';
  }
  if (completionDateType === 'ESTIMATED') return 'field-estimated-not-actual';
  const completion = toDatePrecision(primaryCompletionDate);
  if (completion === null) {
    return hasDateShape(primaryCompletionDate) ? 'date-not-a-calendar-date' : 'primary-completion-date-absent';
  }
  const precision = Math.min(edit.precision, completion.precision);
  const a = truncateToPrecision(edit.value, precision);
  const b = truncateToPrecision(completion.value, precision);
  if (a === b) return TIE_REASON_BY_PRECISION[precision];
  return null;
}

/**
 * The ONE declaration of the post-completion-edit fact (ADR-004 clause 1). Returns exactly one of
 * TIMING_COMPARISON. Comparison happens at the COARSEST precision present on either side (ha-ca1
 * AM-14 A1): '2020-01-15' vs '2019-06' compares '2020-01' vs '2019-06' -> 'yes'. A tie at the
 * compared precision is NOT "after" and is NOT orderable -> 'unknown'. ISO strings truncated to a
 * common precision are compared lexicographically — correct for YYYY[-MM[-DD]] and deliberately NOT
 * `new Date(a) > new Date(b)`, which silently "orders" partial and same-day inputs.
 *
 * NOTE for every consumer: a result !== 'yes' must not be read as "not edited after completion" —
 * 'unknown' is a first-class value carrying its own reason, and collapsing it to a boolean
 * manufactures a claim the data does not make (ADR-003 clause 6).
 */
function editAfterPrimaryCompletion(editDate, primaryCompletionDate, opts = {}) {
  const reason = timingUnknownReason(editDate, primaryCompletionDate, opts);
  if (reason !== null) return 'unknown';
  const edit = toDatePrecision(editDate);
  const completion = toDatePrecision(primaryCompletionDate);
  const precision = Math.min(edit.precision, completion.precision);
  return truncateToPrecision(edit.value, precision) > truncateToPrecision(completion.value, precision)
    ? 'yes' : 'no';
}

/**
 * AM-14 A3/A4 (ha-ca1) — the field-filtered entry point over a registry-history projection.
 * `changedAfterPrimaryCompletion({ history, primaryCompletionDateStruct, fieldFilter })`
 *   -> { answer: 'yes'|'no'|'unknown', reason: <TIMELINE_UNKNOWN_REASONS>|null, evidence: [] }
 *
 * ONE implementation, TWO entry points: this function SELECTS the relevant change dates (via
 * `fieldFilter` over `history.lastUpdateVersions` + `history.changes[]`) and FOLDS each through the
 * scalar `editAfterPrimaryCompletion`. It performs no date comparison of its own — that is what
 * keeps the declaration count at exactly 1 (T-12).
 */
function changedAfterPrimaryCompletion({ history, primaryCompletionDateStruct, fieldFilter } = {}) {
  if (!history || typeof history !== 'object' || history.available === false) {
    // A3: the history source did not answer. Never 'no' — absence of the log is not absence of edits.
    return { answer: 'unknown', reason: 'endpoint-unavailable', evidence: [] };
  }
  const versions = (history.lastUpdateVersions && typeof history.lastUpdateVersions === 'object')
    ? history.lastUpdateVersions : {};
  const changes = Array.isArray(history.changes) ? history.changes : [];
  const filter = typeof fieldFilter === 'function'
    ? fieldFilter
    : (name) => Array.isArray(fieldFilter) && fieldFilter.includes(name);

  const selected = [];
  for (const field of Object.keys(versions)) {
    if (!filter(field)) continue;
    const idx = versions[field];
    const version = (typeof idx === 'number' && changes[idx] && typeof changes[idx] === 'object')
      ? changes[idx] : null;
    if (version && typeof version.date === 'string') {
      selected.push({ field, date: version.date });
    }
  }
  if (selected.length === 0) {
    // AM-15's NARROWED meaning: history retrieved, but no version record for the requested field.
    return { answer: 'unknown', reason: 'record-history-unavailable', evidence: [] };
  }

  const pcd = primaryCompletionDateStruct && typeof primaryCompletionDateStruct === 'object'
    ? primaryCompletionDateStruct.date : null;
  const opts = {
    completionDateType: primaryCompletionDateStruct && typeof primaryCompletionDateStruct === 'object'
      ? primaryCompletionDateStruct.type : undefined,
  };

  const evidence = [];
  let sawUnknownReason = null;
  let sawYes = false;
  let sawNo = false;
  for (const { field, date } of selected) {
    const answer = editAfterPrimaryCompletion(date, pcd, opts);
    evidence.push({ field, date, answer });
    if (answer === 'yes') sawYes = true;
    else if (answer === 'no') sawNo = true;
    else if (sawUnknownReason === null) sawUnknownReason = timingUnknownReason(date, pcd, opts);
  }
  if (sawYes) return { answer: 'yes', reason: null, evidence };
  if (sawUnknownReason !== null) return { answer: 'unknown', reason: sawUnknownReason, evidence };
  if (sawNo) return { answer: 'no', reason: null, evidence };
  /* istanbul ignore next -- selected.length > 0 guarantees one of the three branches above */
  return { answer: 'unknown', reason: 'record-history-unavailable', evidence };
}

module.exports = {
  TIMELINE_KEYS,
  TIMING_COMPARISON,
  TIMELINE_UNKNOWN_REASONS,
  TIMING_DISCLOSURE,
  editAfterPrimaryCompletion,
  timingUnknownReason,
  changedAfterPrimaryCompletion,
  // CA-1 QE F1 — exported so every consumer that needs "is this a real date?" asks the ONE
  // calendar definition instead of writing a second regex (the defect this closes).
  hasDateShape,
  isCalendarDate,
};
