'use strict';

// registry.js — loads the DATA (confounders, companions, reference bands, universal slots),
// runs every entry through schema.js, and enforces MONOTONICITY:
//
//     requiredSlotsFor(analyte)  ⊇  UNIVERSAL_REQUIRED_SLOTS      for every analyte, always
//
// An entry may only ADD requirements. An entry that tries to EXEMPT its analyte from a universal
// slot is rejected at load. Without this, "extending" the registry would be a way to turn it into
// an allowlist by adding exemptions — the attack §3.1 of the architecture is built to survive.
//
// This is the ONLY module in engine/ that touches the filesystem, and it does so only at load
// time. `evaluate()` and `render()` are pure.

const fs = require('node:fs');
const path = require('node:path');

const { UNIVERSAL_REQUIRED_SLOTS, SLOTS } = require('./conditions.js');
const { validateConfounder, validateCompanion, validateReferenceBand, validateDocumentSignal, RegistryEntryInvalid } = require('./schema.js');
const { canonicalKey, distinguishingTokens } = require('./analyte-name.js');

const DEFAULT_REGISTRY_DIR = path.join(__dirname, '..', 'registry');

class MonotonicityViolation extends Error {
  constructor(analyte, missing) {
    super(
      'registry monotonicity violated for analyte ' + JSON.stringify(analyte) +
      ': a registry entry drops the universal slot(s) ' + missing.join(', ') +
      '. An entry may only ADD requirements, never exempt an analyte from the universal bundle.'
    );
    this.name = 'MonotonicityViolation';
    this.analyte = analyte;
    this.missing = missing;
  }
}

class RegistryFileInvalid extends Error {
  constructor(file, problem) {
    super('registry file ' + file + ': ' + problem);
    this.name = 'RegistryFileInvalid';
    this.file = file;
  }
}

/**
 * Analyte ids compare by their CANONICAL KEY — the deduplicated, sorted token set left after
 * `analyte-name.js` folds away case, whitespace, word order, punctuation and parenthetical
 * decoration.
 *
 * It used to be `trim → lowercase → collapse whitespace`, which is EQUALITY dressed as
 * normalisation: `Testosterone, Total` and `Total testosterone (T)` compared unequal to
 * `Total Testosterone` and walked straight past the gate (QE F3, MEASURED). See analyte-name.js
 * for why the fix is split between code (orthography), data (translation) and a fail-closed rule
 * (everything else).
 */
function normalizeAnalyte(name) {
  return canonicalKey(name);
}

function readJson(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return null; // an absent data file is legal — see T9
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new RegistryFileInvalid(file, 'not valid JSON — ' + err.message);
  }
}

function entriesOf(file, doc, key) {
  if (doc === null) return [];
  if (doc === undefined || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new RegistryFileInvalid(file, 'expected an object with a `' + key + '` array');
  }
  const list = doc[key];
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new RegistryFileInvalid(file, '`' + key + '` must be an array');
  return list;
}

/**
 * loadRegistry({dirs}) → Registry
 *
 * `dirs` defaults to the shipped `registry/` directory. Every dir contributes entries; an absent
 * or empty dir contributes none — and the guard still gates on the universal bundle, because that
 * floor is code (conditions.js), not data.
 */
function loadRegistry(opts = {}) {
  const dirs = Array.isArray(opts.dirs) && opts.dirs.length > 0 ? opts.dirs : [DEFAULT_REGISTRY_DIR];

  const confounders = [];
  const companions = [];
  const referenceBands = [];
  const documentSignalEntries = [];
  const universalExtra = new Set();

  for (const dir of dirs) {
    const uFile = path.join(dir, 'universal.json');
    const universal = readJson(uFile);
    if (universal !== null) {
      const slots = universal.required_slots;
      if (slots !== undefined) {
        if (!Array.isArray(slots)) throw new RegistryFileInvalid(uFile, '`required_slots` must be an array');
        for (const s of slots) {
          if (!SLOTS.includes(s)) throw new RegistryFileInvalid(uFile, 'unknown slot in `required_slots`: ' + String(s));
          universalExtra.add(s);
        }
      }
    }

    const cFile = path.join(dir, 'confounders.json');
    for (const e of entriesOf(cFile, readJson(cFile), 'confounders')) confounders.push(validateConfounder(e));

    const kFile = path.join(dir, 'companions.json');
    for (const e of entriesOf(kFile, readJson(kFile), 'companions')) companions.push(validateCompanion(e));

    const bFile = path.join(dir, 'reference-bands.json');
    for (const e of entriesOf(bFile, readJson(bFile), 'reference_bands')) referenceBands.push(validateReferenceBand(e));

    const dFile = path.join(dir, 'document-signals.json');
    for (const e of entriesOf(dFile, readJson(dFile), 'document_signals')) documentSignalEntries.push(validateDocumentSignal(e));
  }

  const universalSlots = Object.freeze([...new Set([...UNIVERSAL_REQUIRED_SLOTS, ...universalExtra])]);

  const confoundersFor = (analyte) => {
    const a = normalizeAnalyte(analyte);
    return confounders.filter((e) => e.applies_to.some((x) => normalizeAnalyte(x) === a));
  };
  const companionFor = (analyte) => {
    const a = normalizeAnalyte(analyte);
    return companions.find(
      (e) => normalizeAnalyte(e.analyte) === a || e.aliases.some((x) => normalizeAnalyte(x) === a)
    ) || null;
  };
  const bandFor = (analyte) => {
    const a = normalizeAnalyte(analyte);
    return referenceBands.find(
      (e) => normalizeAnalyte(e.analyte) === a ||
        (Array.isArray(e.aliases) && e.aliases.some((x) => normalizeAnalyte(x) === a))
    ) || null;
  };

  /**
   * The required-slot set for one analyte. An entry MAY declare `required_slots` — its own full
   * required set — which is exactly the shape a shrinking entry takes; the monotonicity check
   * below rejects any such declaration that drops a universal slot.
   */
  const requiredSlotsFor = (analyte) => {
    const overrides = [];
    const adds = new Set();
    for (const e of confoundersFor(analyte)) {
      adds.add(e.condition_slot);
      if (Array.isArray(e.required_slots)) overrides.push(e.required_slots);
    }
    for (const e of [companionFor(analyte), bandFor(analyte)]) {
      if (e && Array.isArray(e.required_slots)) overrides.push(e.required_slots);
    }
    const base = overrides.length > 0 ? new Set(overrides.flat()) : new Set(universalSlots);
    for (const s of adds) base.add(s);
    return [...base];
  };

  const knows = (analyte) =>
    confoundersFor(analyte).length > 0 || companionFor(analyte) !== null || bandFor(analyte) !== null;

  // ── the fail-closed leg of the F3 fix: an unknown name must not be SAFER than a known one ──
  //
  // A GATING entry is one that can cause a value to be withheld: a companion entry with a
  // non-empty `requires`, a confounder whose action is `withhold`, or any reference band (the
  // repeat gate). Every DISTINGUISHING token of every name such an entry declares becomes a
  // gating term.
  //
  // An analyte the registry does not know, but whose distinguishing tokens intersect that set, is
  // CONFUSABLE with a gated analyte — a spelling nobody declared, of something that is gated. It
  // is refused rather than admitted. This is narrow on purpose: it fires only on names that share
  // a term with a gated entry, so it does not quietly turn the registry into an allowlist (an
  // unrelated unregistered analyte is still admitted with its caveat, ADR-002/T9).
  const gatingTerms = new Set();
  const addGatingTerms = (names) => {
    for (const name of names) for (const token of distinguishingTokens(name)) gatingTerms.add(token);
  };
  for (const e of companions) {
    if (Array.isArray(e.requires) && e.requires.length > 0) addGatingTerms([e.analyte, ...e.aliases]);
  }
  for (const e of confounders) {
    if (e.action === 'withhold') addGatingTerms(e.applies_to);
  }
  for (const e of referenceBands) addGatingTerms([e.analyte, ...(e.aliases || [])]);

  /**
   * The gating terms `analyte` shares with a gated entry, or `[]`.
   *
   * Empty for anything the registry KNOWS — a known analyte is handled by its own entries, and
   * this rule exists only for the names no entry claims.
   */
  const confusableWith = (analyte) => {
    if (knows(analyte)) return [];
    return [...new Set(distinguishingTokens(analyte).filter((t) => gatingTerms.has(t)))];
  };

  // ── monotonicity, enforced at load over every analyte any entry mentions ──────────────────
  const mentioned = new Set();
  for (const e of confounders) for (const a of e.applies_to) mentioned.add(a);
  for (const e of companions) { mentioned.add(e.analyte); for (const a of e.aliases) mentioned.add(a); }
  for (const e of referenceBands) { mentioned.add(e.analyte); for (const a of (e.aliases || [])) mentioned.add(a); }
  for (const analyte of mentioned) {
    const required = new Set(requiredSlotsFor(analyte));
    const missing = universalSlots.filter((s) => !required.has(s));
    if (missing.length > 0) throw new MonotonicityViolation(analyte, missing);
  }

  return Object.freeze({
    dirs: Object.freeze([...dirs]),
    universalSlots,
    confounders: Object.freeze(confounders),
    companions: Object.freeze(companions),
    referenceBands: Object.freeze(referenceBands),
    documentSignalEntries: Object.freeze(documentSignalEntries),
    documentSignals: () => documentSignalEntries,
    confoundersFor,
    companionFor,
    bandFor,
    requiredSlotsFor,
    knows,
    confusableWith,
    gatingTerms: Object.freeze([...gatingTerms].sort()),
    normalizeAnalyte,
  });
}

module.exports = {
  loadRegistry,
  normalizeAnalyte,
  DEFAULT_REGISTRY_DIR,
  MonotonicityViolation,
  RegistryFileInvalid,
  RegistryEntryInvalid,
};
