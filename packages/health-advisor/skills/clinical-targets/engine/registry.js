'use strict';

// registry.js — loads the DATA (units, analytes, targets) and indexes it.
//
// There is NO allowlist of analytes here: the loader accepts any `analyteId` the data names, and
// `dirs` is the injection seam that makes "extensible by data only" a TEST (T-5) rather than a
// promise. There is deliberately NO analyte name anywhere in this file (AM-4 grep-guard).
//
// Fail-closed: one malformed row aborts the whole load, naming the file. A registry that silently
// skips the row it could not parse is a registry that quietly loses a citation.

const fs = require('node:fs');
const path = require('node:path');

const { makeUnit, makeAnalyte, makeClinicalTarget } = require('./schema.js');
const { createUnitConverter } = require('./units.js');

const SHIPPED_REGISTRY_DIR = path.join(__dirname, 'registry');

function readJson(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    throw new Error(`registry: cannot read ${file}: ${err.message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`registry: ${file} is not valid JSON: ${err.message}`);
  }
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => path.join(dir, f));
}

function loadRegistry(opts = {}) {
  const dirs = [SHIPPED_REGISTRY_DIR, ...(opts.dirs || [])];

  const units = new Map();
  const analytes = new Map();
  const aliasIndex = new Map();
  const targetsByAnalyte = new Map();
  const targets = [];

  for (const dir of dirs) {
    // ── units ────────────────────────────────────────────────────────────────────────────────
    const unitsFile = path.join(dir, 'units.json');
    if (fs.existsSync(unitsFile)) {
      const rows = readJson(unitsFile);
      if (!Array.isArray(rows)) throw new Error(`registry: ${unitsFile} must be a JSON array of unit rows`);
      rows.forEach((row, i) => {
        const unit = makeUnit(row, `${unitsFile}[${i}]`);
        units.set(unit.unit, unit);
      });
    }

    // ── analytes ─────────────────────────────────────────────────────────────────────────────
    for (const file of listJson(path.join(dir, 'analytes'))) {
      const analyte = makeAnalyte(readJson(file), file);
      analytes.set(analyte.analyteId, analyte);
      const names = [analyte.analyteId, analyte.displayName, ...analyte.aliases];
      for (const name of names) {
        if (typeof name !== 'string' || name.trim() === '') continue;
        aliasIndex.set(name.trim().toLowerCase(), analyte.analyteId);
      }
    }
  }

  // Targets load AFTER every analyte in every dir, so an injected target may reference an injected
  // analyte regardless of directory order.
  for (const dir of dirs) {
    for (const file of listJson(path.join(dir, 'targets'))) {
      const target = makeClinicalTarget(readJson(file), file);
      if (!analytes.has(target.analyteId)) {
        throw new Error(`registry: ${file} targets unknown analyteId "${target.analyteId}"`);
      }
      targets.push(target);
      const list = targetsByAnalyte.get(target.analyteId) || [];
      list.push(target);
      targetsByAnalyte.set(target.analyteId, list);
    }
  }

  // Every unit an analyte declares must exist in the unit table — otherwise a display step or a
  // canonical unit would resolve to NOT_COMPARABLE at runtime, far from the row that caused it.
  for (const analyte of analytes.values()) {
    const declared = new Set([analyte.canonicalUnit, ...Object.keys(analyte.reportingSteps)]);
    for (const u of declared) {
      if (!units.has(u)) {
        throw new Error(`registry: analyte "${analyte.analyteId}" declares unknown unit "${u}"`);
      }
    }
  }

  const converter = createUnitConverter(units);

  return Object.freeze({
    dirs: Object.freeze(dirs.slice()),
    units,
    analytes,
    targets: Object.freeze(targets.slice()),
    converter,
    analyteIds: () => [...analytes.keys()],
    analyte: (analyteId) => analytes.get(analyteId) || null,
    resolveAlias(name) {
      if (typeof name !== 'string') return null;
      const id = aliasIndex.get(name.trim().toLowerCase());
      return id ? analytes.get(id) : null;
    },
    aliasesOf: (analyteId) => {
      const a = analytes.get(analyteId);
      return a ? [a.analyteId, a.displayName, ...a.aliases] : [];
    },
    allNames: () => [...aliasIndex.keys()],
    targetsFor: (analyteId) => (targetsByAnalyte.get(analyteId) || []).slice(),
  });
}

module.exports = { loadRegistry, SHIPPED_REGISTRY_DIR };
