'use strict';

// index.js — the public API of the clinical-targets engine (the ONLY import surface).
//
// A clinical TARGET is not a laboratory REFERENCE INTERVAL:
//   • a reference interval says where most of a population sits — it is descriptive, and it comes
//     from the measuring lab;
//   • a target says where THIS patient should sit given a documented context — it is clinical, it
//     comes from a named guideline, and it is only ever admissible together with both numbers, a
//     citation of its source, and an explicit non-diagnosis framing.
//
// The engine keeps the two side by side forever and computes their DIVERGENCE as a field, so
// «в референсе, но выше цели» cannot be lost in prose.

const schema = require('./schema.js');
const units = require('./units.js');
const applicability = require('./applicability.js');
const claim = require('./claim.js');
const render = require('./render.js');
const acl = require('./acl-lab-results.js');
const evaluateMod = require('./evaluate.js');
const { loadRegistry, SHIPPED_REGISTRY_DIR } = require('./registry.js');

// One convenience path: coworker.py rows + a patient context → rendered markdown.
// Keeps the one-way flow (ACL → evaluate → render); nothing here re-computes or re-judges.
function interpretRows(rows, opts = {}) {
  const registry = opts.registry || loadRegistry({ dirs: opts.dirs || [] });
  const patientContext = opts.patientContext;
  const labReport = opts.labReport || {};

  const readouts = (rows || []).map((row) => {
    const key = String(row && row.test_name);
    const parsed = acl.fromCoworkerRow(row, { registry, labReportInterval: labReport[key] });
    return evaluateMod.evaluate(parsed, registry, patientContext);
  });

  return {
    registry,
    readouts,
    markdown: readouts.map((r) => render.renderReadout(r, registry.converter)).join('\n\n'),
  };
}

module.exports = {
  loadRegistry,
  SHIPPED_REGISTRY_DIR,
  interpretRows,
  schema,
  units,
  applicability,
  claim,
  render,
  acl,
  evaluate: evaluateMod.evaluate,
  evaluateModule: evaluateMod,
};
