'use strict';

// schema.js — the STRUCTURAL RULE of the registry (05_architecture.md §3.2).
//
// The list of analytes is DATA. The obligation that every entry state HOW BIG the effect is and
// WHERE the number came from is CODE, and it is enforced by THROWING at load time — not by a
// warning, not by review. Delete every entry from `confounders.json` and the guard still gates on
// the universal bundle (registry.js + conditions.js); delete `effect_magnitude` from ONE entry and
// the package refuses to load. That asymmetry is what keeps this registry out of the
// "перечисление в одежде allowlist" class.
//
// Do NOT invent PubMed identifiers to satisfy `source`. `source.kind: 'field-case'` exists so a
// figure that comes from a field observation can be recorded honestly. In a package that runs
// paranoid mode by default, a fabricated citation is a worse defect than the gap it papers over.

const { SLOTS } = require('./conditions.js');
const { isValidPredicate } = require('./predicate.js');

class RegistryEntryInvalid extends Error {
  constructor(kind, id, problem) {
    super('invalid ' + kind + ' entry ' + JSON.stringify(id === undefined ? '<no id>' : id) + ': ' + problem);
    this.name = 'RegistryEntryInvalid';
    this.entryKind = kind;
    this.entryId = id;
    this.problem = problem;
  }
}

// `arithmetic` is for a figure that is DERIVED rather than observed — a molar-mass unit
// conversion, say. It still has to state its derivation in `citation`, because a wrong factor
// mis-gates every value in that unit silently; it just must not masquerade as a measurement.
const SOURCE_KINDS = Object.freeze(['literature', 'field-case', 'vendor-documented', 'arithmetic']);
const DIRECTIONS = Object.freeze(['decreases', 'increases', 'either']);
const ACTIONS = Object.freeze(['caveat', 'withhold']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNonEmptyString = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonEmptyArrayOfStrings = (v) =>
  Array.isArray(v) && v.length > 0 && v.every(isNonEmptyString);

function requireSource(kind, id, source) {
  if (!isObject(source)) throw new RegistryEntryInvalid(kind, id, 'missing `source` — every entry must cite something');
  if (!SOURCE_KINDS.includes(source.kind)) {
    throw new RegistryEntryInvalid(kind, id, '`source.kind` must be one of ' + SOURCE_KINDS.join(' | '));
  }
  if (!isNonEmptyString(source.citation)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `source.citation`');
  }
}

/**
 * `required_slots`, when an entry declares one, must name REAL slots.
 *
 * QE F5 (MEASURED 2026-08-05): `SamplingConditions.of()` rejects an unknown key and
 * `condition_slot` is checked against `SLOTS`, but `required_slots` was accepted verbatim — so
 * `['collected_at', 'fasting_state', 'fast_washout_hrs']` LOADED, and the typo then either
 * produced a phantom requirement or blew up far from its cause at evaluate time. A slot name is a
 * closed vocabulary and a typo in one is a deterministic, layer-1 defect: it belongs in a throw at
 * load, not in a surprise during a run.
 */
function requireSlotNames(kind, id, field, slots) {
  if (slots === undefined) return;
  if (!Array.isArray(slots)) {
    throw new RegistryEntryInvalid(kind, id, '`' + field + '` must be an array of slot names when present');
  }
  for (const slot of slots) {
    if (!SLOTS.includes(slot)) {
      throw new RegistryEntryInvalid(
        kind, id,
        '`' + field + '` names an unknown slot ' + JSON.stringify(slot) +
        ' — a typo here silently changes what is required. Slots: ' + SLOTS.join(', ')
      );
    }
  }
}

function requireMagnitude(kind, id, field, magnitude) {
  if (!isObject(magnitude)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `' + field + '` — an entry that cannot say how big the effect is cannot be constructed');
  }
  if (typeof magnitude.value !== 'number' || !Number.isFinite(magnitude.value)) {
    throw new RegistryEntryInvalid(kind, id, '`' + field + '.value` must be a finite number');
  }
  if (!isNonEmptyString(magnitude.unit)) {
    throw new RegistryEntryInvalid(kind, id, '`' + field + '.unit` is required');
  }
  if (magnitude.ci !== undefined) {
    const ci = magnitude.ci;
    const ok = Array.isArray(ci) && ci.length === 2 && ci.every((n) => typeof n === 'number' && Number.isFinite(n));
    if (!ok) throw new RegistryEntryInvalid(kind, id, '`' + field + '.ci` must be [lo, hi] numbers when present');
  }
}

/** `confounders.json` entry — what distorts an analyte, by how much, on whose say-so. */
function validateConfounder(entry) {
  const kind = 'confounder';
  if (!isObject(entry)) throw new RegistryEntryInvalid(kind, undefined, 'entry is not an object');
  const id = entry.id;
  if (!isNonEmptyString(id)) throw new RegistryEntryInvalid(kind, id, 'missing `id`');
  if (!isNonEmptyArrayOfStrings(entry.applies_to)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `applies_to` (analyte ids — data, not the rule)');
  }
  if (!SLOTS.includes(entry.condition_slot)) {
    throw new RegistryEntryInvalid(kind, id, '`condition_slot` must be one of the sampling-condition slots: ' + SLOTS.join(', '));
  }
  if (!isValidPredicate(entry.predicate)) {
    throw new RegistryEntryInvalid(kind, id, '`predicate` must use the fixed operator vocabulary (predicate.js)');
  }
  if (!DIRECTIONS.includes(entry.direction)) {
    throw new RegistryEntryInvalid(kind, id, '`direction` must be one of ' + DIRECTIONS.join(' | '));
  }
  requireMagnitude(kind, id, 'effect_magnitude', entry.effect_magnitude);
  requireSource(kind, id, entry.source);
  if (!ACTIONS.includes(entry.action)) {
    throw new RegistryEntryInvalid(kind, id, '`action` must be one of ' + ACTIONS.join(' | '));
  }
  if (entry.indistinguishable_from !== undefined) {
    const ind = entry.indistinguishable_from;
    if (!isObject(ind) || !isNonEmptyArrayOfStrings(ind.axis) || !isNonEmptyString(ind.claim)) {
      throw new RegistryEntryInvalid(kind, id, '`indistinguishable_from` needs {axis: [..], claim: ".."}');
    }
  }
  requireSlotNames(kind, id, 'required_slots', entry.required_slots);
  return entry;
}

/** `companions.json` entry — which analytes are not interpretable alone. */
function validateCompanion(entry) {
  const kind = 'companion';
  if (!isObject(entry)) throw new RegistryEntryInvalid(kind, undefined, 'entry is not an object');
  const id = entry.id;
  if (!isNonEmptyString(id)) throw new RegistryEntryInvalid(kind, id, 'missing `id`');
  if (!isNonEmptyString(entry.analyte)) throw new RegistryEntryInvalid(kind, id, 'missing `analyte`');
  if (!Array.isArray(entry.aliases)) throw new RegistryEntryInvalid(kind, id, 'missing `aliases` (may be empty, must be present)');
  if (!isNonEmptyArrayOfStrings(entry.requires)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `requires` — a companion entry that requires nothing blocks nothing');
  }
  if (entry.recommends !== undefined && !Array.isArray(entry.recommends)) {
    throw new RegistryEntryInvalid(kind, id, '`recommends` must be an array when present');
  }
  // `requires_aliases` — the companion SIDE of the QE F3 fix. `analyte-name.js` already folds
  // orthography, so this exists only for the names it cannot derive: translations and genuinely
  // different terms for the same companion. A key that names nothing in `requires` is a typo that
  // would silently satisfy nothing, so it throws.
  if (entry.requires_aliases !== undefined) {
    if (!isObject(entry.requires_aliases)) {
      throw new RegistryEntryInvalid(kind, id, '`requires_aliases` must be an object {requiredId: [names]}');
    }
    for (const required of Object.keys(entry.requires_aliases)) {
      if (!entry.requires.includes(required)) {
        throw new RegistryEntryInvalid(
          kind, id,
          '`requires_aliases` names ' + JSON.stringify(required) + ', which is not in `requires` (' +
          entry.requires.join(', ') + ') — an alias set for a companion this entry does not require ' +
          'satisfies nothing'
        );
      }
      if (!isNonEmptyArrayOfStrings(entry.requires_aliases[required])) {
        throw new RegistryEntryInvalid(kind, id, '`requires_aliases[' + JSON.stringify(required) + ']` must be a non-empty array of names');
      }
    }
  }
  if (!isObject(entry.effect) || !isNonEmptyString(entry.effect.kind) || !isNonEmptyString(entry.effect.consequence)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `effect` {kind, consequence} — the cost of the miss must be stated');
  }
  requireSource(kind, id, entry.source);
  requireSlotNames(kind, id, 'required_slots', entry.required_slots);
  return entry;
}

/**
 * `reference-bands.json` entry — the "is this value under the band?" threshold used by the
 * repeat gate. It is VENDOR-DOCUMENTED (read out of the third-party engine's own documentation),
 * never obtained by running the engine: the guard must decide BEFORE anything is sent downstream.
 */
function validateReferenceBand(entry) {
  const kind = 'reference-band';
  if (!isObject(entry)) throw new RegistryEntryInvalid(kind, undefined, 'entry is not an object');
  const id = entry.id;
  if (!isNonEmptyString(id)) throw new RegistryEntryInvalid(kind, id, 'missing `id`');
  if (!isNonEmptyString(entry.analyte)) throw new RegistryEntryInvalid(kind, id, 'missing `analyte`');
  if (typeof entry.low_below !== 'number' || !Number.isFinite(entry.low_below)) {
    throw new RegistryEntryInvalid(kind, id, '`low_below` must be a finite number');
  }
  if (!isNonEmptyString(entry.unit)) throw new RegistryEntryInvalid(kind, id, 'missing `unit`');
  requireSource(kind, id, entry.source);
  // The repeat requirement must be able to state a magnitude and a source; without them the
  // Requirement object could not be constructed (05_architecture.md §5.1, property 2).
  if (!isObject(entry.repeat_normalisation)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `repeat_normalisation` {magnitude, source}');
  }
  requireMagnitude(kind, id, 'repeat_normalisation.magnitude', entry.repeat_normalisation.magnitude);
  requireSource(kind, id, entry.repeat_normalisation.source);
  requireSlotNames(kind, id, 'required_slots', entry.required_slots);

  // `unit_conversions` — the fix for QE F2. Same house rule as every other figure in this
  // registry: a number that changes a gate's decision states where it came from. A wrong factor
  // here mis-gates every value reported in that unit and does it silently, so the provenance is
  // MANDATORY the moment any conversion is declared.
  if (entry.unit_conversions !== undefined) {
    if (!isObject(entry.unit_conversions)) {
      throw new RegistryEntryInvalid(kind, id, '`unit_conversions` must be an object {unit: factor}');
    }
    const units = Object.keys(entry.unit_conversions);
    if (units.length === 0) {
      throw new RegistryEntryInvalid(kind, id, '`unit_conversions` is present but empty — omit it instead');
    }
    for (const unit of units) {
      if (!isNonEmptyString(unit)) throw new RegistryEntryInvalid(kind, id, '`unit_conversions` keys must be unit strings');
      const factor = entry.unit_conversions[unit];
      if (typeof factor !== 'number' || !Number.isFinite(factor) || factor <= 0) {
        throw new RegistryEntryInvalid(
          kind, id,
          '`unit_conversions[' + JSON.stringify(unit) + ']` must be a finite POSITIVE multiplier ' +
          'into `unit` (' + entry.unit + ')'
        );
      }
    }
    if (!isObject(entry.unit_conversions_source)) {
      throw new RegistryEntryInvalid(
        kind, id,
        'missing `unit_conversions_source` — a conversion factor decides whether the repeat gate ' +
        'fires, so it carries provenance like every other figure here'
      );
    }
    requireSource(kind, id, entry.unit_conversions_source);
  }
  return entry;
}

// ── ADR-001 (doc 17): `document-signals.json` entry — fires on the document HEADER, not a slot ──
//
// A DIFFERENT KIND from a confounder: it keys on the text of a recognized document's header field
// (facility/orderer/method/equipment), not on a patient-declared `condition_slot`, and its
// disposition vocabulary is its OWN (`question|caveat`) — the frozen confounder ACTIONS grammar is
// untouched. `question` is the load-bearing case: it makes affected analytes conditions_unknown
// (never violated) and opens a BLOCKING question.
const DOCUMENT_FIELDS = Object.freeze(['facility', 'orderer', 'method', 'equipment']);
const DISPOSITIONS = Object.freeze(['question', 'caveat']);

function validateDocumentSignal(entry) {
  const kind = 'document-signal';
  if (!isObject(entry)) throw new RegistryEntryInvalid(kind, undefined, 'entry is not an object');
  const id = entry.id;
  if (!isNonEmptyString(id)) throw new RegistryEntryInvalid(kind, id, 'missing `id`');
  if (!DOCUMENT_FIELDS.includes(entry.field)) {
    throw new RegistryEntryInvalid(kind, id, '`field` must be one of ' + DOCUMENT_FIELDS.join(' | '));
  }
  if (!isNonEmptyArrayOfStrings(entry.match)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `match` — a signal that matches nothing fires nothing (non-empty string patterns)');
  }
  if (typeof entry.affects_independence !== 'boolean') {
    throw new RegistryEntryInvalid(kind, id, '`affects_independence` must be a boolean');
  }
  // `applies_to` is either the wildcard "*" or a non-empty list of analyte ids.
  if (entry.applies_to !== '*' && !isNonEmptyArrayOfStrings(entry.applies_to)) {
    throw new RegistryEntryInvalid(kind, id, '`applies_to` must be "*" or a non-empty array of analyte ids');
  }
  if (!DISPOSITIONS.includes(entry.disposition)) {
    throw new RegistryEntryInvalid(kind, id, '`disposition` must be one of ' + DISPOSITIONS.join(' | '));
  }
  if (!isNonEmptyString(entry.question_text)) {
    throw new RegistryEntryInvalid(kind, id, 'missing `question_text` — the blocking question the reader must answer');
  }
  if (entry.requires_low_band !== undefined && typeof entry.requires_low_band !== 'boolean') {
    throw new RegistryEntryInvalid(kind, id, '`requires_low_band` must be a boolean when present');
  }
  requireSource(kind, id, entry.source);
  return entry;
}

module.exports = {
  validateConfounder,
  validateCompanion,
  validateReferenceBand,
  validateDocumentSignal,
  RegistryEntryInvalid,
  SOURCE_KINDS,
  DIRECTIONS,
  ACTIONS,
  DOCUMENT_FIELDS,
  DISPOSITIONS,
};

