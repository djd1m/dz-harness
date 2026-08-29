'use strict';

// acl-lab-results.js — ANTI-CORRUPTION LAYER over `skills/lab-results/coworker.py`'s JSON.
//
// coworker.py is a proprietary third-party file. It is never imported, never executed from here and
// never edited; the two sides meet at DATA. Four rules, each with a test (05_architecture.md §5.1):
//
//   • `reference_range: "-inf - inf"` (the MEASURED sentinel) or absent ⇒ NO_REFERENCE — never
//     WITHIN, and never «в норме». This neutralises the measured harm: coworker reports an analyte
//     it has no interval for as `status: normal` and counts it as normal in the patient summary.
//   • the foreign `status` field is DISCARDED. State is derived from the interval we can see.
//   • a `test_name` with no alias match ⇒ UNKNOWN_ANALYTE; no target lookup, no claim, no guess.
//   • a lab-report interval supplied by the patient OUTRANKS coworker's. There is no
//     `origin: 'engine'` — the registry holds no intervals at all (D-14).

const { quantity, NOT_COMPARABLE } = require('./units.js');

const WITHIN = 'WITHIN';
const BELOW_REFERENCE = 'BELOW';
const ABOVE_REFERENCE = 'ABOVE';
const NO_REFERENCE = 'NO_REFERENCE';

const RESOLVED = 'RESOLVED';
const UNKNOWN_ANALYTE = 'UNKNOWN_ANALYTE';

const RANGE_RE = /^\s*([+-]?inf|[+-]?\d+(?:\.\d+)?)\s*-\s*([+-]?inf|[+-]?\d+(?:\.\d+)?)\s*$/i;

function parseEdge(token) {
  if (/inf$/i.test(token)) return null; // unbounded on this side
  const n = Number(token);
  return Number.isFinite(n) ? n : null;
}

// "66 - 133" → {lo:66, hi:133}; "-inf - inf" → null (no interval at all).
function parseReferenceRange(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(RANGE_RE);
  if (!m) return null;
  const lo = parseEdge(m[1]);
  const hi = parseEdge(m[2]);
  if (lo === null && hi === null) return null;
  return { lo, hi };
}

function intervalState(observation, interval, converter) {
  if (!interval) return NO_REFERENCE;
  const obs = converter.convert(observation, observation.analyte.canonicalUnit);
  if (obs.kind === NOT_COMPARABLE) return NO_REFERENCE;

  const toCanonical = (v) => {
    if (v === null || v === undefined) return null;
    const q = converter.convert(quantity(v, interval.unit, observation.analyte), observation.analyte.canonicalUnit);
    return q.kind === NOT_COMPARABLE ? null : q.value;
  };
  const lo = toCanonical(interval.lo);
  const hi = toCanonical(interval.hi);

  if (lo !== null && obs.value < lo) return BELOW_REFERENCE;
  if (hi !== null && obs.value > hi) return ABOVE_REFERENCE;
  if (lo === null && hi === null) return NO_REFERENCE;
  return WITHIN;
}

// row: { test_name, value, unit, reference_range?, status? }  ← coworker.py's shape, verbatim
// opts: { registry, labReportInterval? }  labReportInterval = { lo?, hi?, unit }
function fromCoworkerRow(row, opts = {}) {
  const registry = opts.registry;
  const src = row && typeof row === 'object' ? row : {};
  const rawName = src.test_name;

  const analyte = registry.resolveAlias(rawName);
  if (!analyte) {
    // D-11: never guess which analyte a lab string means.
    return Object.freeze({
      analyteResolution: UNKNOWN_ANALYTE,
      rawName,
      rawValue: src.value,
      rawUnit: src.unit,
      observation: null,
      reference: Object.freeze({ state: NO_REFERENCE, interval: null }),
    });
  }

  const observation = quantity(Number(src.value), src.unit, analyte);

  const labReport = opts.labReportInterval;
  let interval = null;
  let origin = 'none';
  if (labReport && (Number.isFinite(labReport.lo) || Number.isFinite(labReport.hi))) {
    interval = {
      lo: Number.isFinite(labReport.lo) ? labReport.lo : null,
      hi: Number.isFinite(labReport.hi) ? labReport.hi : null,
      unit: labReport.unit || src.unit,
    };
    origin = 'lab-report';
  } else {
    const parsed = parseReferenceRange(src.reference_range);
    if (parsed) {
      interval = { lo: parsed.lo, hi: parsed.hi, unit: src.unit };
      origin = 'coworker';
    }
  }

  const state = intervalState(observation, interval, registry.converter);

  return Object.freeze({
    analyteResolution: RESOLVED,
    rawName,
    rawValue: src.value,
    rawUnit: src.unit,
    observation,
    reference: Object.freeze({
      state,
      interval: interval ? Object.freeze({ ...interval, origin }) : null,
    }),
  });
}

module.exports = {
  WITHIN,
  BELOW_REFERENCE,
  ABOVE_REFERENCE,
  NO_REFERENCE,
  RESOLVED,
  UNKNOWN_ANALYTE,
  parseReferenceRange,
  fromCoworkerRow,
};
