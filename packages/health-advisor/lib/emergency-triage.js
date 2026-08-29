'use strict';

// emergency-triage.js — the DETERMINISTIC threshold comparator (INV-10/INV-10b precondition,
// INV-11b, INV-12-adjacent). Pure comparison against the machine-readable registry; NO clinical
// judgement lives here — the registry row's `action` decides, never the comparator:
//
//   INV-11b: `action` is READ from the row, never inferred from magnitude. A row with no action
//   (or an unknown one) fails the WHOLE registry load — defaulting either way would silently
//   invent clinical policy from a data gap.
//
// The closed-world limit is part of EVERY result, including a clean one (B1, architecture §8):
// an empty hit list means "nothing in the 12-row table fired", NEVER "no emergency".

class ThresholdRegistryError extends Error {
  constructor(message) { super(message); this.name = 'ThresholdRegistryError'; }
}

const ACTIONS = Object.freeze(['ambulance', 'doctor_24h']);

/** Identity for analyte matching: first word, lowercased — "Калий (K+)" ≡ "Калий". */
function analyteKey(label) {
  return String(label).trim().split(/\s+/)[0].toLowerCase();
}

/** Validate a parsed registry document. Throws on ANY bad row — the load is all-or-nothing. */
function loadThresholdRegistry(doc) {
  if (typeof doc !== 'object' || doc === null || !Array.isArray(doc.rows)) {
    throw new ThresholdRegistryError('threshold registry must be an object with rows[]');
  }
  for (const row of doc.rows) {
    const name = row && row.analyte ? row.analyte : JSON.stringify(row);
    if (!row || typeof row.analyte !== 'string' || row.analyte.trim() === '') throw new ThresholdRegistryError(`registry row without an analyte: ${name}`);
    if (!ACTIONS.includes(row.action)) {
      throw new ThresholdRegistryError(`registry row "${name}" has no valid action (got ${JSON.stringify(row.action)}) — a missing action is a LOAD ERROR, not a default: defaulting either way silently invents clinical policy from a data gap (INV-11b)`);
    }
    if (typeof row.unit !== 'string' || row.unit.trim() === '') throw new ThresholdRegistryError(`registry row "${name}" has no unit`);
    if (!Array.isArray(row.bounds) || row.bounds.length < 1 || row.bounds.length > 2) throw new ThresholdRegistryError(`registry row "${name}" must carry 1-2 bounds`);
    for (const b of row.bounds) {
      if (!b || (b.operator !== '<' && b.operator !== '>') || typeof b.threshold !== 'number' || !Number.isFinite(b.threshold)) {
        throw new ThresholdRegistryError(`registry row "${name}" has a malformed bound ${JSON.stringify(b)}`);
      }
    }
  }
  return doc;
}

const CLOSED_WORLD_NOTE = (n) =>
  `closed-world result: this compares ONLY against the ${n}-row emergency table — an empty hit list means "nothing in the table fired", never "no emergency"`;

/**
 * evaluateTriage(profileLabs, registryDoc) → {hits, skipped, route, closed_world_note}
 *   profileLabs: [{analyte, value:number|string, unit}]
 *   route: 'emergency_immediate' | 'emergency_urgent' | null — from row ACTIONS only.
 * A lab whose unit does not byte-match the registry row's unit is NOT compared silently — it is
 * reported in skipped[] (comparing across units would be a silent wrong answer in either direction).
 */
function evaluateTriage(profileLabs, registryDoc) {
  const registry = loadThresholdRegistry(registryDoc);
  const byKey = new Map(registry.rows.map((r) => [analyteKey(r.analyte), r]));
  const hits = [];
  const skipped = [];
  for (const lab of profileLabs || []) {
    const row = byKey.get(analyteKey(lab.analyte));
    if (!row) continue; // not in the closed world — the note says exactly what that does and does not mean
    if (String(lab.unit) !== row.unit) {
      skipped.push({ analyte: row.analyte, reason: 'unit_mismatch', lab_unit: String(lab.unit), registry_unit: row.unit, detail: 'not compared — a cross-unit comparison would be a silent wrong answer in either direction' });
      continue;
    }
    const value = Number(lab.value);
    if (!Number.isFinite(value)) {
      skipped.push({ analyte: row.analyte, reason: 'non_numeric_value', lab_value: String(lab.value), detail: 'not compared — could not read the value as a number' });
      continue;
    }
    const fired = row.bounds.find((b) => (b.operator === '<' ? value < b.threshold : value > b.threshold));
    if (fired) {
      hits.push({ analyte: row.analyte, value, unit: row.unit, bound: fired, action: row.action, significance: row.significance || null, source: row.source || null });
    }
  }
  const route = hits.some((h) => h.action === 'ambulance')
    ? 'emergency_immediate'
    : hits.some((h) => h.action === 'doctor_24h') ? 'emergency_urgent' : null;
  return { hits, skipped, route, closed_world_note: CLOSED_WORLD_NOTE(registry.rows.length) };
}

module.exports = { loadThresholdRegistry, evaluateTriage, analyteKey, ThresholdRegistryError, ACTIONS };
