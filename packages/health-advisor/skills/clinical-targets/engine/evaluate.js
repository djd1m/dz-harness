'use strict';

// evaluate.js — the merge point: one measurement, one reference reading, N target readings.
// (04_domain_model.md §5, D-6…D-11.)
//
// This is a merge that CANNOT LOSE A NUMBER, which is the whole feature:
//   D-6  the reference reading is never replaced, suppressed or summarised away;
//   D-9  divergence is COMPUTED (reference WITHIN ∧ some applicable target ABOVE/BELOW), never authored;
//   D-10 ALL applicable targets are kept, deterministically ordered — no silent pick of a favourite.
//
// There is deliberately NO analyte name anywhere in this file (AM-4 grep-guard, T-5).

const { evaluateApplicability, APPLIES, UNKNOWN_CONTEXT, DOES_NOT_APPLY } = require('./applicability.js');
const { quantity, ABOVE, BELOW, AT, ON_TARGET, NOT_COMPARABLE } = require('./units.js');
const { WITHIN, NO_REFERENCE } = require('./acl-lab-results.js');

const WITHIN_REFERENCE_BUT_OFF_TARGET = 'WITHIN_REFERENCE_BUT_OFF_TARGET';
const OUTSIDE_REFERENCE_AND_OFF_TARGET = 'OUTSIDE_REFERENCE_AND_OFF_TARGET';
const OUTSIDE_REFERENCE_BUT_ON_TARGET = 'OUTSIDE_REFERENCE_BUT_ON_TARGET';
const NONE = 'NONE';

const CONFLICTING_TARGETS = 'CONFLICTING_TARGETS';

// Deterministic order (D-10): stricter first, ties broken by targetId so the order can never depend
// on filesystem enumeration.
function strictnessKey(target, analyte, converter) {
  const canon = (edge) => {
    if (!edge) return null;
    const q = converter.convert(quantity(edge.value, edge.unit, analyte), analyte.canonicalUnit);
    return q.kind === NOT_COMPARABLE ? null : q.value;
  };
  const hi = canon(target.bounds.hi);
  const lo = canon(target.bounds.lo);
  return [hi === null ? Number.POSITIVE_INFINITY : hi, lo === null ? Number.POSITIVE_INFINITY : -lo];
}

function orderTargets(targets, analyte, converter) {
  return targets.slice().sort((a, b) => {
    const ka = strictnessKey(a, analyte, converter);
    const kb = strictnessKey(b, analyte, converter);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    if (ka[1] !== kb[1]) return ka[1] - kb[1];
    return a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0;
  });
}

// acl: the object returned by `acl-lab-results.js::fromCoworkerRow`
function evaluate(acl, registry, patientContext) {
  const base = {
    analyteResolution: acl.analyteResolution,
    rawName: acl.rawName,
    observation: acl.observation,
    reference: acl.reference,
    targetReadings: [],
    notes: [],
    divergence: { present: false, kind: NONE },
  };

  if (!acl.observation) {
    // D-11: UNKNOWN_ANALYTE ⇒ no target lookup, no claim, no thrown error.
    return Object.freeze({ ...base, targetReadings: Object.freeze([]), notes: Object.freeze([]) });
  }

  const analyte = acl.observation.analyte;
  const converter = registry.converter;
  const targets = orderTargets(registry.targetsFor(analyte.analyteId), analyte, converter);

  const targetReadings = targets.map((target) => {
    const applicability = evaluateApplicability(target, patientContext);
    if (applicability.state !== APPLIES) {
      // A target whose context does not match, or cannot be known, is REPORTED — never silently
      // evaluated anyway, and never silently dropped (AC-5).
      return Object.freeze({
        target,
        applicability: applicability.state,
        missingFields: applicability.missingFields,
        comparison: null,
        delta: null,
      });
    }
    const result = converter.compareToBounds(acl.observation, target.bounds);
    return Object.freeze({
      target,
      applicability: APPLIES,
      missingFields: Object.freeze([]),
      comparison: result.comparison,
      delta: result.delta,
      edges: result.edges,
    });
  });

  const claimable = targetReadings.filter(
    (r) => r.applicability === APPLIES && (r.comparison === ABOVE || r.comparison === BELOW),
  );

  const notes = [];
  if (claimable.some((r) => r.comparison === ABOVE) && claimable.some((r) => r.comparison === BELOW)) {
    // Opposing directions: both are kept and both are shown. No resolution is invented.
    notes.push(CONFLICTING_TARGETS);
  }

  // D-9 — computed, never authored.
  let kind = NONE;
  const offTarget = claimable.length > 0;
  if (acl.reference.state === WITHIN && offTarget) kind = WITHIN_REFERENCE_BUT_OFF_TARGET;
  else if (acl.reference.state !== WITHIN && acl.reference.state !== NO_REFERENCE && offTarget) {
    kind = OUTSIDE_REFERENCE_AND_OFF_TARGET;
  } else if (
    acl.reference.state !== WITHIN && acl.reference.state !== NO_REFERENCE &&
    targetReadings.some((r) => r.applicability === APPLIES && r.comparison === ON_TARGET)
  ) {
    kind = OUTSIDE_REFERENCE_BUT_ON_TARGET;
  }

  return Object.freeze({
    ...base,
    targetReadings: Object.freeze(targetReadings),
    notes: Object.freeze(notes),
    divergence: Object.freeze({
      present: kind === WITHIN_REFERENCE_BUT_OFF_TARGET || kind === OUTSIDE_REFERENCE_AND_OFF_TARGET,
      kind,
    }),
  });
}

module.exports = {
  WITHIN_REFERENCE_BUT_OFF_TARGET,
  OUTSIDE_REFERENCE_AND_OFF_TARGET,
  OUTSIDE_REFERENCE_BUT_ON_TARGET,
  NONE,
  CONFLICTING_TARGETS,
  APPLIES,
  DOES_NOT_APPLY,
  UNKNOWN_CONTEXT,
  AT,
  ON_TARGET,
  NOT_COMPARABLE,
  orderTargets,
  evaluate,
};
