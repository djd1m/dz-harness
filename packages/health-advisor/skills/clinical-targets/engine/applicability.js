'use strict';

// applicability.js — three-valued context matcher (04_domain_model.md §4.4, D-4/D-5).
//
// GRAMMAR lives here; CONTENT (fields, values, populations) lives in registry/targets/*.json.
// The operators below are the closed grammar: a new guideline that needs a genuinely new operator
// is a CODE change, and that line is stated in 05_architecture.md §4 rather than smuggled in as
// "just add data".
//
// There is deliberately NO analyte name anywhere in this file (AM-4 grep-guard, T-5).

const SATISFIED = 'SATISFIED';
const VIOLATED = 'VIOLATED';
const UNKNOWN = 'UNKNOWN';

const APPLIES = 'APPLIES';
const DOES_NOT_APPLY = 'DOES_NOT_APPLY';
const UNKNOWN_CONTEXT = 'UNKNOWN_CONTEXT';

// The closed operator grammar. `schema.js` validates a predicate's `op` against this set at
// CONSTRUCTION time, so an unknown operator is a load error, never a silent non-match at runtime.
const PREDICATE_OPS = Object.freeze(['anyOf', 'includes', 'range', 'equals']);

// A field is UNKNOWN when it is absent, null/undefined, or explicitly the string "unknown".
// D-5: there is no default patient context. "Not stated" is never "not present".
function isUnknownValue(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim().toLowerCase() === 'unknown') return true;
  return false;
}

function matchPredicate(predicate, context) {
  const ctx = context && typeof context === 'object' ? context : {};
  const field = predicate.field;
  const present = Object.prototype.hasOwnProperty.call(ctx, field);
  const raw = present ? ctx[field] : undefined;

  if (!present || isUnknownValue(raw)) return UNKNOWN;

  switch (predicate.op) {
    case 'equals':
      return raw === predicate.value ? SATISFIED : VIOLATED;

    case 'anyOf': {
      const allowed = Array.isArray(predicate.value) ? predicate.value : [predicate.value];
      return allowed.includes(raw) ? SATISFIED : VIOLATED;
    }

    case 'includes': {
      // The context field must be a LIST. A present-but-empty list is a KNOWN "no" (VIOLATED),
      // not an unknown — "мы спросили, и списка условий нет" differs from "мы не спрашивали".
      if (!Array.isArray(raw)) return UNKNOWN;
      return raw.includes(predicate.value) ? SATISFIED : VIOLATED;
    }

    case 'range': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return UNKNOWN;
      const spec = predicate.value && typeof predicate.value === 'object' ? predicate.value : {};
      if (Number.isFinite(spec.min) && n < spec.min) return VIOLATED;
      if (Number.isFinite(spec.max) && n > spec.max) return VIOLATED;
      return SATISFIED;
    }

    default:
      // Unreachable through schema.js (it rejects unknown ops at construction). Fail CLOSED if a
      // caller hand-builds a predicate: an operator we cannot evaluate is never "applies".
      return UNKNOWN;
  }
}

// D-4 aggregation, in a FIXED order:
//   1. any VIOLATED  ⇒ DOES_NOT_APPLY  (a known mismatch outranks an unknown — otherwise one
//                                       missing field could park a definite mismatch in a softer state)
//   2. else any UNKNOWN ⇒ UNKNOWN_CONTEXT, carrying the missing field names
//   3. else ⇒ APPLIES
// A target with NO predicates never reaches here through `loadRegistry` — `schema.js` refuses it at
// construction (G3). This is the second belt, for a target hand-built in code that skipped the
// schema: an empty requirement list is not «matches everyone», it is «nobody said who this is
// for», so it fails CLOSED into UNKNOWN_CONTEXT. Same reasoning as claim.js re-validating a
// citation it was told was already checked — the layer below never trusts the layer above.
const NO_SCOPE_FIELD = 'кому адресован порог (в цели не указаны условия применимости)';

function evaluateApplicability(target, context) {
  const requires = (target && target.applicability && target.applicability.requires) || [];
  if (requires.length === 0) {
    return Object.freeze({ state: UNKNOWN_CONTEXT, missingFields: Object.freeze([NO_SCOPE_FIELD]) });
  }
  const missingFields = [];
  let sawViolation = false;

  for (const predicate of requires) {
    const r = matchPredicate(predicate, context);
    if (r === VIOLATED) sawViolation = true;
    else if (r === UNKNOWN && !missingFields.includes(predicate.field)) missingFields.push(predicate.field);
  }

  if (sawViolation) return Object.freeze({ state: DOES_NOT_APPLY, missingFields: Object.freeze([]) });
  if (missingFields.length > 0) {
    return Object.freeze({ state: UNKNOWN_CONTEXT, missingFields: Object.freeze(missingFields.slice()) });
  }
  return Object.freeze({ state: APPLIES, missingFields: Object.freeze([]) });
}

module.exports = {
  SATISFIED,
  VIOLATED,
  UNKNOWN,
  APPLIES,
  DOES_NOT_APPLY,
  UNKNOWN_CONTEXT,
  PREDICATE_OPS,
  NO_SCOPE_FIELD,
  matchPredicate,
  evaluateApplicability,
};
