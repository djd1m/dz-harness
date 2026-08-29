'use strict';

// units.js — the shared kernel: conversion + the comparator's ADMISSION DECISION.
// (04_domain_model.md §3.2 / §3.4; 05_architecture.md §4.1.)
//
// GRAMMAR here, CONTENT in registry/units.json + registry/analytes/*.json:
//   • dimensions and their bases                      → code (this file)
//   • the cross-dimension rule (mass ↔ substance ONLY via molar mass) → code, ONE branch
//   • unit names, factors, molar masses, quanta, steps → data
// There is deliberately NO analyte name anywhere in this file (AM-4 grep-guard, T-5).
//
// AM-17: `ng/dL` is mass-over-volume. Filing it with `nmol/L` under `substance-conc` would make
// the branch below — the only place `molarMass_g_per_mol` is ever read — UNREACHABLE for the
// testosterone pair, and the only repair inside that wrong model is a per-analyte factor smuggled
// into a unit row, which K-3 (`schema.js::makeUnit`) refuses.

const MASS_CONC = 'mass-conc';
const SUBSTANCE_CONC = 'substance-conc';

const ABOVE = 'ABOVE';
const BELOW = 'BELOW';
const AT = 'AT';
const ON_TARGET = 'ON_TARGET';
const NOT_COMPARABLE = 'NOT_COMPARABLE';

function decimalsOf(step) {
  const s = String(step);
  if (s.includes('e') || s.includes('E')) {
    const exp = Number(s.split(/[eE]/)[1]);
    return exp < 0 ? Math.abs(exp) : 0;
  }
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

// Round to a DECLARED reporting step (K-2: equality is claimed at the precision the domain reports
// in, never bit-exact float equality).
function roundToStep(value, step) {
  const scaled = Math.round(value / step) * step;
  return Number(scaled.toFixed(Math.min(Math.max(decimalsOf(step), 0), 12)));
}

function notComparable(reason) {
  return Object.freeze({ kind: NOT_COMPARABLE, reason });
}

function quantity(value, unit, analyte) {
  // K-1: a Quantity never exists without its analyte — a bare number with a unit cannot be
  // converted across dimensions and must not pretend it can.
  if (!analyte || !analyte.analyteId) {
    throw new TypeError('quantity(): a Quantity cannot exist without its analyte (K-1)');
  }
  return Object.freeze({ kind: 'QUANTITY', value, unit, analyte });
}

function createUnitConverter(unitTable) {
  const table = unitTable instanceof Map ? unitTable : new Map(Object.entries(unitTable || {}));

  function unitOf(name) {
    return table.get(name) || null;
  }

  // convert(q, toUnitName) → Quantity | {kind:'NOT_COMPARABLE'}
  function convert(q, toUnitName) {
    if (!q || q.kind === NOT_COMPARABLE) return notComparable('source is not a quantity');
    const from = unitOf(q.unit);
    const to = unitOf(toUnitName);
    if (!from) return notComparable(`unknown unit: ${q.unit}`);
    if (!to) return notComparable(`unknown unit: ${toUnitName}`);

    // 1) same dimension — a pure factor ratio, analyte-independent.
    if (from.dimension === to.dimension) {
      return quantity((q.value * from.factorToBase) / to.factorToBase, toUnitName, q.analyte);
    }

    // 2) mass-conc ↔ substance-conc — ONLY via the analyte's molar mass. This is the single place
    //    `molarMass_g_per_mol` is read in the whole engine.
    const crossesMassSubstance =
      (from.dimension === MASS_CONC && to.dimension === SUBSTANCE_CONC) ||
      (from.dimension === SUBSTANCE_CONC && to.dimension === MASS_CONC);

    if (crossesMassSubstance) {
      const M = q.analyte && q.analyte.molarMass_g_per_mol;
      if (!Number.isFinite(M) || M <= 0) {
        // Never a guess, never a lookup table.
        return notComparable('mass ↔ substance conversion needs the analyte\'s molarMass_g_per_mol');
      }
      if (from.dimension === MASS_CONC) {
        const gPerL = q.value * from.factorToBase;          // → g/L (mass base)
        const mmolPerL = (gPerL / M) * 1000;                // → mmol/L (substance base)
        return quantity(mmolPerL / to.factorToBase, toUnitName, q.analyte);
      }
      const mmolPerL = q.value * from.factorToBase;         // → mmol/L
      const gPerL = (mmolPerL * M) / 1000;                  // → g/L
      return quantity(gPerL / to.factorToBase, toUnitName, q.analyte);
    }

    // 3) any other dimension pair (e.g. ratio ↔ mass-conc) is not a conversion this engine models.
    return notComparable(`no conversion between ${from.dimension} and ${to.dimension}`);
  }

  // Display projection: the value in `unit`, rounded to that unit's DECLARED reporting step.
  function display(q, unitName) {
    const target = unitName || q.unit;
    const converted = convert(q, target);
    if (converted.kind === NOT_COMPARABLE) return null;
    const step = q.analyte.reportingSteps[target];
    const value = step ? roundToStep(converted.value, step) : converted.value;
    return { value, unit: target, text: `${formatWithStep(value, step)} ${target}` };
  }

  function canonical(q) {
    return convert(q, q.analyte.canonicalUnit);
  }

  // ── ThresholdComparator (§3.4) ───────────────────────────────────────────────────────────────
  // The admission decision is MADE, not left to a bare float relation:
  //   |obs − bound| ≤ reportingQuantum / 2  ⇒  AT ("на пороге в пределах точности") — not above,
  //   not below. A value sitting exactly on a guideline bound does NOT license «выше цели».
  function compare(observation, bound) {
    const analyte = observation.analyte;
    const obs = canonical(observation);
    const bnd = canonical(bound);
    if (obs.kind === NOT_COMPARABLE) return { comparison: NOT_COMPARABLE, reason: obs.reason };
    if (bnd.kind === NOT_COMPARABLE) return { comparison: NOT_COMPARABLE, reason: bnd.reason };

    const tolerance = analyte.reportingQuantum / 2;
    const delta = obs.value - bnd.value;
    if (Math.abs(delta) <= tolerance) return { comparison: AT, delta, tolerance };
    return { comparison: delta > 0 ? ABOVE : BELOW, delta, tolerance };
  }

  // Bounds-level evaluation. Calls the SAME `compare()` per present edge, so a band target
  // (`{lo, hi}`) works with zero new code (T-3b / AM-10).
  //
  // The reading is expressed as a TARGET VIOLATION, not as a raw relation: for a hi-only target a
  // value comfortably under the bound is ON_TARGET, not "BELOW" — otherwise D-9's divergence rule
  // would flag every on-target patient. (Documented refinement of the D-8/D-9 comparison grammar;
  // see 07_code_changes/change_manifest.md.)
  function compareToBounds(observation, bounds, opts) {
    const analyte = observation.analyte;
    const edges = {};
    if (bounds.hi) {
      edges.hi = compare(observation, quantity(bounds.hi.value, bounds.hi.unit, analyte));
    }
    if (bounds.lo) {
      edges.lo = compare(observation, quantity(bounds.lo.value, bounds.lo.unit, analyte));
    }

    const values = Object.values(edges);
    if (values.some((e) => e.comparison === NOT_COMPARABLE)) {
      const bad = values.find((e) => e.comparison === NOT_COMPARABLE);
      return { comparison: NOT_COMPARABLE, edges, reason: bad.reason };
    }
    if (edges.hi && edges.hi.comparison === ABOVE) return { comparison: ABOVE, edges, delta: edges.hi.delta };
    if (edges.lo && edges.lo.comparison === BELOW) return { comparison: BELOW, edges, delta: edges.lo.delta };
    if (values.some((e) => e.comparison === AT)) {
      const at = values.find((e) => e.comparison === AT);
      return { comparison: AT, edges, delta: at.delta };
    }
    return { comparison: ON_TARGET, edges, delta: null };
    // (`opts` is reserved; kept unused so the signature stays honest about what it uses today.)
  }

  return Object.freeze({
    units: table,
    unitOf,
    convert,
    canonical,
    display,
    compare,
    compareToBounds,
  });
}

function formatWithStep(value, step) {
  const d = step ? decimalsOf(step) : 0;
  return value.toFixed(d);
}

module.exports = {
  MASS_CONC,
  SUBSTANCE_CONC,
  ABOVE,
  BELOW,
  AT,
  ON_TARGET,
  NOT_COMPARABLE,
  decimalsOf,
  roundToStep,
  formatWithStep,
  quantity,
  createUnitConverter,
};
