'use strict';

// profile.js — load a profile, and FOLD it to an explicit as-of date (ADR-002).
//
// THE RULE THIS FILE EXISTS FOR: "current" is never stored, it is computed. `foldAsOf(profile,
// asOf)` picks, per analyte, the observation with the greatest `observedOn <= asOf`. Rows newer
// than `asOf` are invisible — that is what makes a past conclusion reproducible.
//
// THERE IS NO `Date.now()` IN THIS FILE, and no default for `asOf` (ADR-002 D3, plan R-9,
// grep-asserted by test/case-state-profile-diff.test.js). An implicit clock is an undeclared input,
// and an undeclared input makes "which generation of the value is this" unanswerable.
//
// There is also no analyte name and no metric name in this file — both are DATA (ADR-002 D5).

const fs = require('node:fs');
const path = require('node:path');

const {
  ProfileRequiredError, ProfileUnreadableError, AmbiguousObservationError, DateNotObservedError,
  parseIsoDate, readJson, validateProfile, loadRequiredSections, SHIPPED_REGISTRY_DIR,
} = require('./schema.js');
const { freezeAnchor } = require('./source-anchor.js');

// Module-private brand. `derive()` accepts ONLY an object carrying it, so two values folded at
// different as-of dates can never reach one formula (ADR-002 D4).
const FOLD_BRAND = Symbol('case-state/Fold');
const DAY_MS = 86400000;

/** Read + parse + validate a profile file. Every failure is a NAMED throw, never a degraded load. */
function loadProfile(profilePath, opts = {}) {
  if (typeof profilePath !== 'string' || profilePath.trim() === '') {
    throw new ProfileRequiredError('a profile path is required — there is no session without a profile (ADR-001 §2)');
  }
  const abs = path.resolve(profilePath);
  if (!fs.existsSync(abs)) throw new ProfileUnreadableError(`profile not found: ${abs}`);
  const profile = readJson(abs, ProfileUnreadableError);
  validateProfile(profile, abs, { required: opts.required || loadRequiredSections(opts) });
  return Object.freeze({ profile, sourcePath: abs });
}

/** Every distinct observation date in the profile, ascending. */
function observationDates(profile) {
  return [...new Set(profile.labs.map((r) => r.observedOn))].sort();
}

/**
 * Fold to `asOf`. Same-date ties are an ERROR unless exactly one row carries `supersedes` —
 * silent last-write-wins would lose a measurement without saying so (ADR-002 §2).
 */
function foldAsOf(loaded, asOf) {
  const profile = loaded && loaded.profile ? loaded.profile : loaded;
  const sourcePath = (loaded && loaded.sourcePath) || null;
  if (parseIsoDate(asOf) === null) throw new DateNotObservedError(String(asOf), observationDates(profile));

  const byAnalyte = new Map();
  for (const row of profile.labs) {
    if (row.observedOn > asOf) continue;                       // ISO dates compare lexicographically
    const prev = byAnalyte.get(row.analyteId);
    if (prev === undefined || row.observedOn > prev.observedOn) { byAnalyte.set(row.analyteId, row); continue; }
    if (row.observedOn === prev.observedOn) {
      const rowWins = row.supersedes !== undefined;
      const prevWins = prev.supersedes !== undefined;
      if (rowWins === prevWins) {
        throw new AmbiguousObservationError(
          `two observations of "${row.analyteId}" are dated ${row.observedOn} and neither declares "supersedes" — ` +
          'silent last-write-wins would lose a measurement (ADR-002 §2)'
        );
      }
      if (rowWins) byAnalyte.set(row.analyteId, row);
    }
  }

  // NULL-PROTOTYPE, like facts.js's record maps (QE G1). A plain literal here defeated the guard
  // twice over: `fold.analytes['constructor']` resolved along Object.prototype, so readAnalyte's
  // `row === undefined` check minted a receipt for an analyte that is not in the profile; and an
  // analyteId of `__proto__` was assigned as a PROTOTYPE — readable, yet invisible to every
  // consumer that enumerates keys. Both faces are closed by making every entry an own property.
  const analytes = Object.create(null);
  for (const [id, row] of [...byAnalyte.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    // ONE NAMED FIELD, NEVER `...row` (feature ha-manifest-provenance, architecture §4.C). The fold
    // exists BECAUSE it is a projection at an explicit as-of; spreading the row would carry
    // `supersedes` and every future row key into it and turn the projection into a row copy — the
    // exact failure class FORBIDDEN_ROW_KEYS exists to prevent.
    //
    // `null`, NEVER an absent key, once inside the fold (D4). On disk an un-anchored row has no
    // `source_anchor` at all and is byte-identical to a pre-feature profile; inside the fold and the
    // receipt the key is always present, so a JSON round-trip of a fold has the same key set for an
    // anchored and an un-anchored corpus. That stability is the portability seam.
    //
    // The tie-break above picked a ROW; the anchor rides on whichever row won, so a superseded
    // observation's anchor can never surface. No new branch, no second policy.
    analytes[id] = Object.freeze({
      analyteId: id,
      value: row.value,
      unit: row.unit,
      observedOn: row.observedOn,
      sourceAnchor: row.source_anchor === undefined ? null : freezeAnchor(row.source_anchor),
    });
  }
  return Object.freeze({ [FOLD_BRAND]: true, asOf, sourcePath, analytes: Object.freeze(analytes) });
}

function isFold(x) { return x !== null && typeof x === 'object' && x[FOLD_BRAND] === true; }

/** Assert `date` is one the profile actually observed — no nearest-match guessing (ADR-002 §5). */
function requireObservedDate(profile, date) {
  const available = observationDates(profile);
  if (!available.includes(date)) throw new DateNotObservedError(date, available);
}

// ── derived metrics — the formula is DATA, the evaluator is four structural ops ────────────────
const OPS = Object.freeze({
  divide: (a, b) => (b === 0 ? null : a / b),
  multiply: (a, b) => a * b,
  add: (a, b) => a + b,
  subtract: (a, b) => a - b,
});

function loadMetrics(opts = {}) {
  const dirs = [SHIPPED_REGISTRY_DIR, ...(opts.dirs || [])];
  const byId = new Map();
  for (const dir of dirs) {
    const file = path.join(dir, 'derived-metrics.json');
    if (!fs.existsSync(file)) continue;
    const data = readJson(file, ProfileUnreadableError);
    const rows = data.metrics;
    if (!Array.isArray(rows)) throw new ProfileUnreadableError(`${file}: "metrics" must be an array`);
    rows.forEach((m, i) => {
      if (typeof m.id !== 'string' || m.id.trim() === '') throw new ProfileUnreadableError(`${file}[${i}]: "id" must be a non-empty string`);
      if (!Array.isArray(m.inputs) || m.inputs.length === 0) throw new ProfileUnreadableError(`${file}[${i}]: "inputs" must be a non-empty array`);
      if (m.formula === null || typeof m.formula !== 'object') throw new ProfileUnreadableError(`${file}[${i}]: "formula" must be an object`);
      byId.set(m.id, Object.freeze({ ...m, inputs: Object.freeze([...m.inputs]) }));
    });
  }
  return byId;
}

function evalNode(node, fold, metricId) {
  if (node === null || typeof node !== 'object') throw new ProfileUnreadableError(`metric ${metricId}: malformed formula node`);
  if (Object.prototype.hasOwnProperty.call(node, 'const')) {
    if (!Number.isFinite(node.const)) throw new ProfileUnreadableError(`metric ${metricId}: "const" must be a finite number`);
    return node.const;
  }
  if (Object.prototype.hasOwnProperty.call(node, 'analyte')) {
    const row = fold.analytes[node.analyte];
    return row === undefined ? null : row.value;
  }
  const op = OPS[node.op];
  if (op === undefined) throw new ProfileUnreadableError(`metric ${metricId}: unknown formula op "${node.op}"`);
  const a = evalNode(node.a, fold, metricId);
  const b = evalNode(node.b, fold, metricId);
  if (a === null || b === null) return null;
  const out = op(a, b);
  return Number.isFinite(out) ? out : null;
}

/**
 * `derive(fold, metricId)` — accepts ONLY a branded fold, never loose values, so a fresh HDL and a
 * six-month-old TG cannot reach the same ratio (ADR-002 D4). Returns `null` for `value` when an
 * input is absent from the fold; "unknown" is a state, never a substituted default.
 */
function derive(fold, metricId, opts = {}) {
  if (!isFold(fold)) {
    throw new TypeError(
      'derive() accepts only a fold produced by foldAsOf() — passing loose values would let two ' +
      'different as-of dates into one formula (ADR-002 §4)'
    );
  }
  const metrics = opts.metrics || loadMetrics(opts);
  const metric = metrics.get(metricId);
  if (metric === undefined) throw new ProfileUnreadableError(`unknown derived metric "${metricId}"`);
  const missing = metric.inputs.filter((id) => fold.analytes[id] === undefined);

  // ADR-001 (fb3c9d93): a derived metric claims ONE draw, but foldAsOf takes each analyte's LATEST
  // value — cross-draw operands pair into a correct-but-meaningless number. Compare their observedOn.
  const operandObservedOn = {};
  for (const id of metric.inputs) if (fold.analytes[id] !== undefined) operandObservedOn[id] = fold.analytes[id].observedOn;
  const drawConsistent = missing.length > 0 ? null : new Set(Object.values(operandObservedOn)).size <= 1;
  // missingInputs nulls first; requireSameDraw nulls cross-draw too (D4). Default OFF = as before.
  let value = null;
  let invalidReason = null;
  if (missing.length > 0) { /* value stays null */ }
  else if (opts.requireSameDraw && drawConsistent === false) invalidReason = 'operands_span_draws';
  else value = evalNode(metric.formula, fold, metricId);
  return Object.freeze({
    metricId, label: metric.label || metricId, unit: metric.unit || null,
    // `inputs` is REPORTED, not only consumed: a derived value is a claim about the analytes it was
    // computed from, and a caller that must gate on them (session.derive does) should not have to
    // re-read the registry to learn what they were. `missingInputs` alone names only the absent ones.
    value, asOf: fold.asOf, inputs: Object.freeze([...metric.inputs]), missingInputs: Object.freeze(missing),
    operandObservedOn: Object.freeze({ ...operandObservedOn }), drawConsistent, invalidReason, // ADR-001
  });
}

module.exports = {
  FOLD_BRAND, DAY_MS,
  loadProfile, foldAsOf, isFold, observationDates, requireObservedDate,
  loadMetrics, derive,
};
