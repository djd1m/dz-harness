'use strict';

// schema.js — the ONLY module allowed to decide whether a registry row is valid.
// (04_domain_model.md §4.1 D-1, §4.2 D-3, §3.1 K-3, §5.1 D-14.)
//
// Everything here THROWS. A malformed row is a construction-time error, never a warning, never a
// row that loads "degraded". Keeping the rules in one file is what makes T-10's discrimination
// proof cheap: there is exactly one guard to remove.

const { PREDICATE_OPS } = require('./applicability.js');

const DIMENSIONS = Object.freeze(['mass-conc', 'substance-conc', 'ratio']);
const EVIDENCE_CLASSES = Object.freeze(['FETCH_VERIFIED', 'LISTING_ONLY', 'ASSERTED']);

// D-1: the six fields a citation cannot exist without.
const REQUIRED_CITATION_FIELDS = Object.freeze([
  'organization', 'documentTitle', 'year', 'section', 'quote', 'populationScope',
]);

// K-3: a unit row is analyte-independent BY CONSTRUCTION — exactly these keys, nothing else.
// Any extra key is the door through which a per-analyte factor would walk in (AM-17).
const UNIT_ROW_KEYS = Object.freeze(['unit', 'dimension', 'factorToBase']);

// D-14: the registry may never hold a reference interval. These key names (case-insensitive) are
// refused on an analyte row, so the target registry and coworker.py cannot drift — only one of
// them holds the concept at all.
const REFERENCE_INTERVAL_KEYS = Object.freeze([
  'low', 'high', 'reflow', 'refhigh', 'referencerange', 'reference_range',
  'referenceinterval', 'reference_interval', 'refrange', 'ref_range',
]);

function isBlank(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  return false;
}

function requireFields(spec, fields, where) {
  const missing = fields.filter((f) => isBlank(spec[f]));
  if (missing.length > 0) {
    throw new TypeError(`${where}: missing or blank required field(s): ${missing.join(', ')}`);
  }
}

function requirePositiveNumber(v, what, where) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new TypeError(`${where}: ${what} must be a finite positive number, got ${JSON.stringify(v)}`);
  }
}

// ── Citation (D-1) ─────────────────────────────────────────────────────────────────────────────
// A target without a citation is not a degraded target — it is not a target.
// THIS IS THE GUARD T-10 REMOVES to prove the invariant is load-bearing. It has exactly one home.
function makeCitation(spec, where = 'citation') {
  const src = spec && typeof spec === 'object' ? spec : {};

  // ── T-10 DISCRIMINATION TARGET: comment out the next line to prove T-1/T-8 go red. ──
  requireFields(src, REQUIRED_CITATION_FIELDS, where);
  // ── end guard ──

  const evidenceClass = src.evidenceClass === undefined ? 'ASSERTED' : src.evidenceClass;
  if (!EVIDENCE_CLASSES.includes(evidenceClass)) {
    throw new TypeError(`${where}: evidenceClass must be one of ${EVIDENCE_CLASSES.join('|')}`);
  }

  return Object.freeze({
    organization: src.organization,
    documentTitle: src.documentTitle,
    year: src.year,
    section: src.section,
    quote: src.quote,
    populationScope: src.populationScope,
    evidenceClass,
    url: src.url === undefined ? null : src.url,
    retrievedAt: src.retrievedAt === undefined ? null : src.retrievedAt,
  });
}

// ── Bounds (D-3) ───────────────────────────────────────────────────────────────────────────────
// `{lo?, hi?, loInclusive, hiInclusive}` expresses <, <=, >, >= AND band targets in one shape, so a
// band never forces a code edit (this supersedes ADR-002's two-value `direction` enum — AM-10).
function makeBoundEdge(edge, where) {
  if (edge === undefined || edge === null) return null;
  if (typeof edge !== 'object') throw new TypeError(`${where}: bound edge must be {value, unit}`);
  if (typeof edge.value !== 'number' || !Number.isFinite(edge.value)) {
    throw new TypeError(`${where}: bound value must be a finite number, got ${JSON.stringify(edge.value)}`);
  }
  if (isBlank(edge.unit)) throw new TypeError(`${where}: bound edge needs a unit`);
  return Object.freeze({ value: edge.value, unit: edge.unit });
}

function makeBounds(spec, where = 'bounds') {
  const src = spec && typeof spec === 'object' ? spec : {};
  const lo = makeBoundEdge(src.lo, `${where}.lo`);
  const hi = makeBoundEdge(src.hi, `${where}.hi`);
  if (lo === null && hi === null) {
    throw new TypeError(`${where}: at least one of lo/hi must be present (D-3)`);
  }
  return Object.freeze({
    lo,
    hi,
    loInclusive: src.loInclusive === undefined ? true : Boolean(src.loInclusive),
    hiInclusive: src.hiInclusive === undefined ? true : Boolean(src.hiInclusive),
  });
}

// ── Unit (K-3) ─────────────────────────────────────────────────────────────────────────────────
function makeUnit(spec, where = 'unit') {
  const src = spec && typeof spec === 'object' ? spec : {};
  const extra = Object.keys(src).filter((k) => !UNIT_ROW_KEYS.includes(k));
  if (extra.length > 0) {
    throw new TypeError(
      `${where}: a unit row is analyte-independent by construction (K-3); unexpected key(s): ${extra.join(', ')}`,
    );
  }
  requireFields(src, ['unit', 'dimension'], where);
  if (!DIMENSIONS.includes(src.dimension)) {
    throw new TypeError(`${where}: dimension must be one of ${DIMENSIONS.join('|')}, got ${src.dimension}`);
  }
  requirePositiveNumber(src.factorToBase, 'factorToBase', where);
  return Object.freeze({ unit: src.unit, dimension: src.dimension, factorToBase: src.factorToBase });
}

// ── Analyte (D-14, K-1's data half) ────────────────────────────────────────────────────────────
function makeAnalyte(spec, where = 'analyte') {
  const src = spec && typeof spec === 'object' ? spec : {};

  // D-14: the registry never carries a reference interval.
  const offending = Object.keys(src).filter((k) => REFERENCE_INTERVAL_KEYS.includes(k.toLowerCase()));
  if (offending.length > 0) {
    throw new TypeError(
      `${where}: the target registry may never carry a reference interval (D-14); ` +
      `refused key(s): ${offending.join(', ')}. Reference intervals belong to the lab report / coworker.py.`,
    );
  }

  requireFields(src, ['analyteId', 'canonicalUnit'], where);
  requirePositiveNumber(src.reportingQuantum, 'reportingQuantum', where);

  const steps = src.reportingSteps;
  if (!steps || typeof steps !== 'object' || Object.keys(steps).length === 0) {
    throw new TypeError(`${where}: reportingSteps must be a non-empty {unit -> step} map`);
  }
  for (const [unit, step] of Object.entries(steps)) {
    requirePositiveNumber(step, `reportingSteps[${unit}]`, where);
  }
  if (!Object.prototype.hasOwnProperty.call(steps, src.canonicalUnit)) {
    throw new TypeError(`${where}: reportingSteps must declare a step for the canonical unit ${src.canonicalUnit}`);
  }
  if (src.molarMass_g_per_mol !== undefined) {
    requirePositiveNumber(src.molarMass_g_per_mol, 'molarMass_g_per_mol', where);
  }
  if (!Array.isArray(src.aliases)) throw new TypeError(`${where}: aliases must be an array`);

  return Object.freeze({
    analyteId: src.analyteId,
    displayName: isBlank(src.displayName) ? src.analyteId : src.displayName,
    canonicalUnit: src.canonicalUnit,
    molarMass_g_per_mol: src.molarMass_g_per_mol === undefined ? null : src.molarMass_g_per_mol,
    reportingQuantum: src.reportingQuantum,
    reportingSteps: Object.freeze({ ...steps }),
    aliases: Object.freeze(src.aliases.slice()),
  });
}

// ── ApplicabilityContext (§4.3) ────────────────────────────────────────────────────────────────
// FAIL-CLOSED on an EMPTY predicate list (QE finding G3, 2026-08-05). This used to default a
// missing `applicability` to `{requires: []}`, which `evaluateApplicability` then reported as
// APPLIES for every patient — including one whose context is entirely unknown. MEASURED on an
// injected row with `"applicability": {}` and patient context `{}`: «ВЫШЕ ЦЕЛИ на 56 mg/dL» plus
// «Ваш контекст сверен по полям: без ограничений — совпадение подтверждено», having checked
// nothing. That is the exact harm ADR-003 exists to prevent, reachable through the data-only
// extension path ADR-004 promises to non-programmers.
//
// The rejection is at LOAD, the strongest layer that can express it: every citation already
// carries a REQUIRED `populationScope`, so a threshold always has a population, and a population
// that cannot be written as at least one predicate is a row whose scope nobody has thought about.
// «Applies to everyone» is not expressible by omission here — by design.
function makeApplicability(spec, where = 'applicability') {
  const src = spec && typeof spec === 'object' ? spec : {};
  const requires = src.requires === undefined ? [] : src.requires;
  if (!Array.isArray(requires)) throw new TypeError(`${where}: requires must be an array`);
  if (requires.length === 0) {
    throw new TypeError(
      `${where}: a target needs at least one applicability predicate (G3, fail-closed). A row with ` +
      'no predicates matches every patient — including one whose context is entirely unknown — and ' +
      'would render «совпадение подтверждено» having checked nothing. State the population the ' +
      'threshold was written for.',
    );
  }
  const out = requires.map((p, i) => {
    const at = `${where}.requires[${i}]`;
    if (!p || typeof p !== 'object') throw new TypeError(`${at}: predicate must be an object`);
    requireFields(p, ['field', 'op'], at);
    if (!PREDICATE_OPS.includes(p.op)) {
      throw new TypeError(`${at}: op must be one of ${PREDICATE_OPS.join('|')}, got ${p.op}`);
    }
    if (p.value === undefined) throw new TypeError(`${at}: predicate needs a value`);
    return Object.freeze({ field: p.field, op: p.op, value: p.value });
  });
  return Object.freeze({ requires: Object.freeze(out) });
}

// ── ClinicalTarget ─────────────────────────────────────────────────────────────────────────────
function makeClinicalTarget(spec, where = 'target') {
  const src = spec && typeof spec === 'object' ? spec : {};
  requireFields(src, ['targetId', 'analyteId', 'framingNote'], where);

  const citation = makeCitation(src.citation, `${where}(${src.targetId || '?'}).citation`);
  const bounds = makeBounds(src.bounds, `${where}(${src.targetId || '?'}).bounds`);
  const applicability = makeApplicability(src.applicability, `${where}(${src.targetId || '?'}).applicability`);

  const evidenceClass = src.evidenceClass === undefined ? citation.evidenceClass : src.evidenceClass;
  if (!EVIDENCE_CLASSES.includes(evidenceClass)) {
    throw new TypeError(`${where}: evidenceClass must be one of ${EVIDENCE_CLASSES.join('|')}`);
  }

  return Object.freeze({
    targetId: src.targetId,
    analyteId: src.analyteId,
    bounds,
    applicability,
    citation,
    evidenceClass,
    framingNote: src.framingNote,
  });
}

module.exports = {
  DIMENSIONS,
  EVIDENCE_CLASSES,
  REQUIRED_CITATION_FIELDS,
  UNIT_ROW_KEYS,
  REFERENCE_INTERVAL_KEYS,
  isBlank,
  makeCitation,
  makeBounds,
  makeUnit,
  makeAnalyte,
  makeApplicability,
  makeClinicalTarget,
};
