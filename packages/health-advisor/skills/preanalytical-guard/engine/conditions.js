'use strict';

// SamplingConditions — the ONE atomic bundle of pre-analytical conditions, and the single
// declaration site of the three-valued condition vocabulary.
//
// Two distinctions this module makes STRUCTURAL (05_architecture.md §4.1):
//
//   1. an ABSENT key is a programming error and THROWS; `UNKNOWN` is a recorded clinical fact
//      ("we asked, the patient does not know"). This is what makes "we never collected the
//      conditions" impossible to spell as "the conditions were fine".
//   2. `UNKNOWN` is a truthy VALUE, never `null`/`undefined`/`''`. A falsy sentinel is swallowed
//      by the first `if (x)` somebody writes.
//
// The ConditionState literals are declared HERE and nowhere else in engine/ — the package has
// already been burned by two definitions of one predicate inside a single gate (the apoB bug).
// `preanalytical-guard.test.js :: T10` is the layer-1 grep that keeps it that way.

/** The recorded-but-not-known value. Truthy on purpose. */
const UNKNOWN = Object.freeze({
  __preanalytical_unknown: true,
  toString() { return 'UNKNOWN'; },
  toJSON() { return 'UNKNOWN'; },
});

/** Every slot of the bundle. `of()` requires ALL of them — that is the atomicity rule. */
const SLOTS = Object.freeze([
  'collected_at',            // ISO-8601 datetime | UNKNOWN — time-of-day derives from this
  'fasting_state',           // 'fasted' | 'fed' | UNKNOWN
  'fasting_hours',           // number | UNKNOWN
  'fast_washout_hours',      // number | UNKNOWN — hours since the END of a prolonged fast
  'exertion_washout_hours',  // number | UNKNOWN — tracked, NOT yet quantified (see references/)
  'sleep_hours_7d_mean',     // number | UNKNOWN
  'is_repeat',               // boolean | UNKNOWN
]);

// The universal floor lives in CODE, not in `registry/universal.json`, on purpose: the registry is
// DATA and may be empty, replaced or overridden by a caller-supplied dir. If the floor were data,
// deleting the data would silently disarm the gate — the exact "перечисление в одежде allowlist"
// defect this slice is built to avoid. `universal.json` may only ADD to this set (registry.js
// unions the two and enforces monotonicity).
const UNIVERSAL_REQUIRED_SLOTS = Object.freeze(['collected_at', 'fasting_state']);

/** The three-valued condition audit (05_architecture.md §4.2). Declared once, imported everywhere. */
const CONDITION_STATES = Object.freeze({
  VERIFIED: 'conditions_verified',
  UNKNOWN: 'conditions_unknown',
  VIOLATED: 'conditions_violated',
});

/** Companion sufficiency (§4.3). `unencoded` is NOT `satisfied`. */
const COMPANION_STATES = Object.freeze({
  SATISFIED: 'satisfied',
  MISSING: 'missing',
  UNENCODED: 'unencoded',
});

/** Why an admitted observation was withheld from interpretation. `null` = it was not. */
const WITHHELD_REASONS = Object.freeze({
  COMPANION_MISSING: 'companion_missing',
  REPEAT_REQUIRED: 'repeat_required',
  CONFOUNDER_WITHHOLD: 'confounder_withhold',
  ENGINE_UNAVAILABLE: 'engine_unavailable',
  // The name is not one the registry knows, but its distinguishing terms belong to a GATED
  // analyte. Added after QE F3 measured the asymmetry it closes: an unlisted spelling of total
  // testosterone was reaching the engine while every listed spelling was withheld — an UNKNOWN
  // name was strictly SAFER to interpret than a known one.
  UNRECOGNISED_VARIANT: 'unrecognised_variant',
  // The value cannot be placed against its reference band — no unit, an unrecognised unit, or a
  // non-numeric value. Added after QE F2 measured `230 ng/dL` (≈8 nmol/L) clearing a `<12 nmol/L`
  // repeat gate because the two numbers were compared without their units.
  UNIT_UNCOMPARABLE: 'unit_uncomparable',
  // A document HEADER signal (facility/orderer/method — ADR-001, doc 17) opened a BLOCKING question
  // about how the sample was drawn. The conditions are UNKNOWN, not VIOLATED: we do not yet know the
  // draw was bad, only that a question about it is unanswered. Interpretation waits for the answer.
  // Applied by the composable document-guard layer, never by base evaluate() (which stays arity-3).
  DOCUMENT_SIGNAL_PENDING: 'document_signal_pending',
});

class PartialConditionsBundle extends Error {
  constructor(message) {
    super(message);
    this.name = 'PartialConditionsBundle';
  }
}

class SamplingConditions {
  constructor(values) {
    this._values = Object.freeze({ ...values });
    Object.freeze(this);
  }

  /**
   * TOTAL constructor. Throws unless EVERY slot key is present.
   * Use `UNKNOWN` for a slot that was asked about and is not known.
   */
  static of(obj) {
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      throw new PartialConditionsBundle(
        'SamplingConditions.of() needs an object carrying all ' + SLOTS.length + ' slots'
      );
    }
    const missing = SLOTS.filter((s) => !Object.prototype.hasOwnProperty.call(obj, s));
    if (missing.length > 0) {
      throw new PartialConditionsBundle(
        'SamplingConditions.of(): partial bundle — missing slot(s): ' + missing.join(', ') +
        '. A missing key is a programming error; record "asked, not known" as SamplingConditions.UNKNOWN.'
      );
    }
    const unknownKeys = Object.keys(obj).filter((k) => !SLOTS.includes(k));
    if (unknownKeys.length > 0) {
      throw new PartialConditionsBundle(
        'SamplingConditions.of(): unknown slot(s): ' + unknownKeys.join(', ')
      );
    }
    const values = {};
    for (const slot of SLOTS) values[slot] = obj[slot];
    return new SamplingConditions(values);
  }

  /** Every slot UNKNOWN — the honest bundle for "we did not ask". Still a complete bundle. */
  static allUnknown() {
    const o = {};
    for (const slot of SLOTS) o[slot] = UNKNOWN;
    return SamplingConditions.of(o);
  }

  get(slot) {
    if (!SLOTS.includes(slot)) throw new PartialConditionsBundle('unknown slot: ' + String(slot));
    return this._values[slot];
  }

  isUnknown(slot) {
    return this.get(slot) === UNKNOWN;
  }

  toJSON() {
    const out = {};
    for (const slot of SLOTS) out[slot] = this._values[slot] === UNKNOWN ? 'UNKNOWN' : this._values[slot];
    return out;
  }
}

SamplingConditions.UNKNOWN = UNKNOWN;
SamplingConditions.SLOTS = SLOTS;
SamplingConditions.STATES = CONDITION_STATES;
SamplingConditions.COMPANION_STATES = COMPANION_STATES;
SamplingConditions.WITHHELD_REASONS = WITHHELD_REASONS;
SamplingConditions.UNIVERSAL_REQUIRED_SLOTS = UNIVERSAL_REQUIRED_SLOTS;
SamplingConditions.PartialConditionsBundle = PartialConditionsBundle;

module.exports = {
  SamplingConditions,
  UNKNOWN,
  SLOTS,
  UNIVERSAL_REQUIRED_SLOTS,
  CONDITION_STATES,
  COMPANION_STATES,
  WITHHELD_REASONS,
  PartialConditionsBundle,
};
