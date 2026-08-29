'use strict';

// acl-lab-results.js — the ANTI-CORRUPTION LAYER, and the only file in engine/ that knows the
// third-party JSON shape.
//
// It does NOT import, spawn or otherwise couple to the third-party engine: it builds an input
// object and parses an output object. The agent runs the engine between the two (see SKILL.md).
// That keeps `npm test` free of Python and keeps the third-party tree untouched and unimported.
//
// Two honesty rules this layer owns:
//
//   1. the engine reads ONLY `sex` out of `patient_context` (05_architecture.md F3 —
//      `coworker.py:303-360`). Its documentation also lists a `fasting` boolean; the code never
//      reads it. This layer must not pretend otherwise, so every other key the caller supplies is
//      returned in `ignored_context_keys` instead of being quietly forwarded.
//   2. `reference_range: "-inf - inf"` means the engine has NO band for that analyte. That is
//      `reference_encoded: false`, not a clean result. (The `-inf` defect itself is owned by
//      another slice; this layer only refuses to let it read as "normal".)

/** The only patient_context key the third-party engine actually consumes. */
const SUPPORTED_PATIENT_CONTEXT_KEYS = Object.freeze(['sex']);

const UNBOUNDED_RANGE = /-?inf\s*-\s*inf/i;

/** Build the engine's input from the ADMITTED observations only. Withheld values never appear. */
function toEngineInput(readout, patientContext = {}) {
  const ctx = patientContext && typeof patientContext === 'object' ? patientContext : {};
  const results = readout.observations
    .filter((o) => o.interpretable)
    .map((o) => ({ test_name: o.analyte_id, value: o.value, unit: o.unit }));

  const patient_context = {};
  for (const key of SUPPORTED_PATIENT_CONTEXT_KEYS) {
    if (Object.prototype.hasOwnProperty.call(ctx, key)) patient_context[key] = ctx[key];
  }
  const ignored_context_keys = Object.keys(ctx).filter((k) => !SUPPORTED_PATIENT_CONTEXT_KEYS.includes(k));

  return { results, patient_context, ignored_context_keys };
}

/** The analyte id the engine used for one interpretation row. */
function analyteIdOf(row) {
  if (row === null || typeof row !== 'object') return null;
  const name = row.test_name !== undefined ? row.test_name : row.analyte_id;
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
}

/** True when the payload is not a usable engine response (missing, malformed, errored). */
function isUnavailable(json) {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return true;
  if (json.error !== undefined && json.error !== null) return true;
  return !Array.isArray(json.interpretations);
}

/** Normalise one interpretation row into the shape the merge and the render use. */
function fromEngineRow(row) {
  const range = typeof row.reference_range === 'string' ? row.reference_range : null;
  return Object.freeze({
    analyte_id: analyteIdOf(row),
    status: typeof row.status === 'string' ? row.status : null,
    interpretation: typeof row.interpretation === 'string' ? row.interpretation : null,
    description: typeof row.description === 'string' ? row.description : null,
    reference_range: range,
    // An unbounded range is an ABSENT band, never a clean one.
    reference_encoded: range !== null && !UNBOUNDED_RANGE.test(range),
  });
}

function fromEngineOutput(json) {
  if (isUnavailable(json)) return [];
  return json.interpretations.map(fromEngineRow);
}

/** The engine's own cross-test aggregates. Surfacing them is gated by the render (§5.4c). */
function aggregatesOf(json) {
  if (isUnavailable(json)) return { patient_summary: null, patterns: [], abnormal_count: null };
  return {
    patient_summary: typeof json.patient_summary === 'string' ? json.patient_summary : null,
    patterns: Array.isArray(json.patterns) ? json.patterns : [],
    abnormal_count: typeof json.abnormal_count === 'number' ? json.abnormal_count : null,
  };
}

module.exports = {
  toEngineInput,
  fromEngineOutput,
  fromEngineRow,
  aggregatesOf,
  analyteIdOf,
  isUnavailable,
  SUPPORTED_PATIENT_CONTEXT_KEYS,
};
