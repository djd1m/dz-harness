'use strict';

// evaluate.js — observations × conditions × registry → GuardReadout + AdmissionTicket.
//
// Pure: no filesystem, no network, no subprocess, no import of the third-party engine. The
// decision of what may be interpreted is taken BEFORE anything is handed downstream, because the
// third-party engine mints its interpretation string the instant a value enters it
// (05_architecture.md F4) — post-filtering its output is not "before".
//
// There is deliberately NO options parameter. `evaluate` has arity 3 and ignores anything else:
// a safety check the caller can narrow is not a safety check, so there is no `skipGuard`, no
// `skipCompanions`, no `force`.

const {
  SamplingConditions, UNKNOWN, CONDITION_STATES, COMPANION_STATES, WITHHELD_REASONS,
} = require('./conditions.js');
const predicate = require('./predicate.js');
const { normalizeAnalyte } = require('./registry.js');
const units = require('./units.js');
const ticketing = require('./ticket.js');

class GuardUsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GuardUsageError';
  }
}

const REASONS = Object.freeze({
  NOT_SUPPLIED: 'conditions-not-supplied',
  NOT_REGISTERED: 'analyte-not-registered',
  CONFOUNDER_FIRED: 'confounder-predicate-satisfied',
  CONFUSABLE_WITH_GATED: 'name-confusable-with-a-gated-analyte',
  BAND_UNCOMPARABLE: 'value-cannot-be-placed-against-its-band',
});

function normalizeObservation(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new GuardUsageError('observation must be an object {analyte_id, value, unit}');
  }
  const analyte_id = raw.analyte_id !== undefined ? raw.analyte_id : raw.test_name;
  if (typeof analyte_id !== 'string' || analyte_id.trim() === '') {
    throw new GuardUsageError('observation is missing `analyte_id`');
  }
  return {
    analyte_id: analyte_id.trim(),
    value: raw.value,
    unit: typeof raw.unit === 'string' ? raw.unit : null,
  };
}

function findingOf(entry) {
  return Object.freeze({
    confounder_id: entry.id,
    condition_slot: entry.condition_slot,
    direction: entry.direction,
    action: entry.action,
    effect_magnitude: entry.effect_magnitude,
    source: entry.source,
    indistinguishable_from: entry.indistinguishable_from || null,
  });
}

/**
 * evaluate(observations, conditions, registry) → { readout, ticket }
 */
function evaluate(observations, conditions, registry) {
  if (!Array.isArray(observations)) throw new GuardUsageError('evaluate(): `observations` must be an array');
  if (!(conditions instanceof SamplingConditions)) {
    throw new GuardUsageError('evaluate(): `conditions` must be a SamplingConditions — build it with SamplingConditions.of()');
  }
  if (!registry || typeof registry.requiredSlotsFor !== 'function') {
    throw new GuardUsageError('evaluate(): `registry` must come from loadRegistry()');
  }

  const present = new Set(observations.map((o) => normalizeAnalyte(normalizeObservation(o).analyte_id)));

  const guarded = [];
  const requirements = [];
  const unencoded = [];
  const suppressed = [];

  for (const raw of observations) {
    const obs = normalizeObservation(raw);
    const analyte = obs.analyte_id;

    // ── Q1: the universal gate. Analyte-independent, answered before any registry lookup. ──
    const required = registry.requiredSlotsFor(analyte);
    const observed = {};
    const reasons = [];
    let anyUnknown = false;
    for (const slot of required) {
      if (conditions.get(slot) === UNKNOWN) { observed[slot] = 'unknown'; anyUnknown = true; }
      else observed[slot] = 'satisfied';
    }
    if (anyUnknown) reasons.push(REASONS.NOT_SUPPLIED);

    // ── Q2: the registry REFINES. It can only ever make the gate more specific. ──
    const findings = [];
    for (const entry of registry.confoundersFor(analyte)) {
      const slotValue = conditions.get(entry.condition_slot);
      if (slotValue === UNKNOWN) continue; // already accounted for by Q1
      if (!predicate.test(entry.predicate, slotValue)) continue;
      findings.push(findingOf(entry));
      observed[entry.condition_slot] = 'violated';
    }
    if (findings.length > 0) reasons.push(REASONS.CONFOUNDER_FIRED);

    const registered = registry.knows(analyte);
    let confusableTerms = [];
    if (!registered) {
      unencoded.push(analyte);
      reasons.push(REASONS.NOT_REGISTERED);
      // QE F3, the fail-closed leg. An unregistered name that shares a distinguishing term with a
      // GATED analyte is a spelling nobody declared of something that is gated — refuse it rather
      // than let it past. Without this an unknown name is strictly safer to interpret than a known
      // one, which is the inversion the review measured.
      confusableTerms = typeof registry.confusableWith === 'function' ? registry.confusableWith(analyte) : [];
      if (confusableTerms.length > 0) reasons.push(REASONS.CONFUSABLE_WITH_GATED);
    }

    // ── companion sufficiency (§4.3) ──
    const companionEntry = registry.companionFor(analyte);
    let companion_state = COMPANION_STATES.UNENCODED;
    let missingCompanions = [];
    if (companionEntry) {
      // A required companion is satisfied by ANY of its declared names (QE F3, companion side):
      // the role file spells this one «ГСПГ (SHBG)», so a batch reporting either must count.
      const aliasesOf = (required) => {
        const declared = companionEntry.requires_aliases && companionEntry.requires_aliases[required];
        return [required, ...(Array.isArray(declared) ? declared : [])];
      };
      missingCompanions = companionEntry.requires.filter(
        (c) => !aliasesOf(c).some((name) => present.has(normalizeAnalyte(name)))
      );
      companion_state = missingCompanions.length > 0 ? COMPANION_STATES.MISSING : COMPANION_STATES.SATISFIED;
    }

    // ── the repeat gate: decided against a VENDOR-DOCUMENTED band, never by asking the engine ──
    //
    // QE F2: the comparison is UNIT-AWARE. It used to be a bare `obs.value < band.low_below`
    // across a `nmol/L` band and an observation carrying its own unit, so `230 ng/dL` (≈8 nmol/L)
    // cleared a `<12 nmol/L` gate. `placeAgainstBand` is three-valued precisely so that "we could
    // not tell" has somewhere to go other than "not under the band".
    const band = registry.bandFor(analyte);
    const placement = band === null ? null : units.placeAgainstBand(band, obs.value, obs.unit);
    const bandUncomparable = placement === 'uncomparable';
    if (bandUncomparable) reasons.push(REASONS.BAND_UNCOMPARABLE);
    // UNKNOWN `is_repeat` is NOT a repeat: the safe reading of "we do not know" is "not yet repeated".
    const repeatNeeded = placement === 'under' && conditions.get('is_repeat') !== true;

    // ── the audit state: violated > unknown > verified (most restrictive wins) ──
    // A value that cannot be placed against its own band is `unknown`, not `verified`: the check
    // RAN and could not complete, which is exactly what that state means.
    let state = CONDITION_STATES.VERIFIED;
    if (findings.length > 0) state = CONDITION_STATES.VIOLATED;
    else if (anyUnknown || !registered || bandUncomparable) state = CONDITION_STATES.UNKNOWN;

    // ── requirements are collected independently of which reason ends up being reported ──
    if (companion_state === COMPANION_STATES.MISSING) {
      for (const companionId of missingCompanions) {
        requirements.push(Object.freeze({
          kind: 'order_companion',
          analyte_id: analyte,
          companion_id: companionId,
          because: companionEntry.effect.consequence,
          magnitude: null,
          source: companionEntry.source,
        }));
      }
    }
    if (confusableTerms.length > 0) {
      requirements.push(Object.freeze({
        kind: 'declare_analyte',
        analyte_id: analyte,
        companion_id: null,
        because: 'this name is not one the registry declares, but ' + confusableTerms.join('/') +
          ' identifies an analyte that IS gated. Declare the name in registry/companions.json (or ' +
          'correct the spelling) — an undeclared spelling must not be interpreted more freely than ' +
          'a declared one',
        magnitude: null,
        source: null,
      }));
    }
    if (bandUncomparable) {
      requirements.push(Object.freeze({
        kind: 'state_unit',
        analyte_id: analyte,
        companion_id: null,
        because: 'this value cannot be placed against the documented ' + band.unit + ' band' +
          (obs.unit ? ' from unit ' + JSON.stringify(obs.unit) : ' with no unit recorded') +
          ', so whether it sits beneath the band — and therefore whether a repeat is owed — is ' +
          'undecided. Report the unit, or declare its conversion in registry/reference-bands.json',
        magnitude: null,
        source: null,
      }));
    }
    if (repeatNeeded) {
      requirements.push(Object.freeze({
        kind: 'repeat',
        analyte_id: analyte,
        companion_id: null,
        because: 'a first value beneath the documented band repeats before it concludes anything — ' +
          'up to ' + Math.abs(band.repeat_normalisation.magnitude.value) + ' ' +
          band.repeat_normalisation.magnitude.unit + ' of such values return inside the band on a plain repeat, untreated',
        magnitude: band.repeat_normalisation.magnitude,
        source: band.repeat_normalisation.source,
      }));
    }

    // ── the gate: unrecognised-variant > companion > confounder-withhold > uncomparable > repeat ──
    //
    // `unrecognised_variant` leads because it is the most fundamental refusal: we do not know WHAT
    // this is, only that its name belongs to something gated. Nothing below it can be evaluated
    // for a name no entry claims, so the ordering is descriptive rather than a real contest.
    let interpretable = true;
    let withheld_reason = null;
    const withholdingFinding = findings.find((f) => f.action === 'withhold') || null;
    if (confusableTerms.length > 0) {
      interpretable = false;
      withheld_reason = WITHHELD_REASONS.UNRECOGNISED_VARIANT;
    } else if (companion_state === COMPANION_STATES.MISSING) {
      interpretable = false;
      withheld_reason = WITHHELD_REASONS.COMPANION_MISSING;
    } else if (withholdingFinding) {
      interpretable = false;
      withheld_reason = WITHHELD_REASONS.CONFOUNDER_WITHHOLD;
    } else if (bandUncomparable) {
      interpretable = false;
      withheld_reason = WITHHELD_REASONS.UNIT_UNCOMPARABLE;
    } else if (repeatNeeded) {
      interpretable = false;
      withheld_reason = WITHHELD_REASONS.REPEAT_REQUIRED;
    }

    const audit = Object.freeze({
      required: Object.freeze([...required]),
      observed: Object.freeze({ ...observed }),
      state,
      reasons: Object.freeze([...new Set(reasons)]),
      findings: Object.freeze(findings),
      companion_state,
      missing_companions: Object.freeze([...missingCompanions]),
      // Which gated terms this undeclared name shares (QE F3), and where the value sat relative
      // to its band (QE F2). Both are `[]` / `null` for the ordinary case.
      confusable_with: Object.freeze([...confusableTerms]),
      band_placement: placement,
    });

    guarded.push(Object.freeze({
      analyte_id: analyte,
      value: obs.value,
      unit: obs.unit,
      audit,
      interpretable,
      withheld_reason,
    }));

    if (!interpretable) suppressed.push(analyte);
  }

  const readout = Object.freeze({
    produced_at: new Date().toISOString(),
    conditions,
    observations: Object.freeze(guarded),
    requirements: Object.freeze(dedupeRequirements(requirements)),
    unencoded: Object.freeze([...new Set(unencoded)]),
    suppressed: Object.freeze(suppressed),
  });

  const ticket = ticketing.mint(guarded.filter((g) => g.interpretable).map((g) => g.analyte_id), readout);
  return { readout, ticket };
}

function dedupeRequirements(list) {
  const seen = new Set();
  const out = [];
  for (const r of list) {
    const key = r.kind + '|' + r.analyte_id + '|' + (r.companion_id || '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

module.exports = { evaluate, GuardUsageError, REASONS };
