'use strict';

// render.js — the ONLY module in engine/ that emits interpretation or caveat wording
// (05_architecture.md §5.5), and it is TOTAL over ConditionState × CompanionState × interpretable.
//
// Two rules the shape enforces:
//
//   (b) the caveat travels INSIDE the rendered interpretation, not beside it. There is no public
//       accessor for the interpretation text alone, so a downstream renderer cannot drop a "notes"
//       section and be left holding a bare conclusion.
//   (c) withholding changes the engine's own aggregates, so when anything was suppressed the
//       engine's `patient_summary` is NOT surfaced verbatim; the guard emits its own partition
//       line instead. "Pattern analysis did not fire" must never read as "no pattern is present".
//
// CONCLUSION_TERMS is the third-party engine's VERDICT vocabulary — the words with which a value
// is judged. The withheld register must contain none of them: a requirement is not a verdict.
// (A claim that an artefact is indistinguishable from a genuine finding is a statement about the
// MEASUREMENT, not a verdict about this patient's value, and is allowed in the withheld register.)

const { CONDITION_STATES, COMPANION_STATES, WITHHELD_REASONS, UNKNOWN } = require('./conditions.js');

const CONCLUSION_TERMS = Object.freeze([
  'low', 'high', 'normal', 'low-normal', 'elevated', 'decreased', 'deficient',
  'critical', 'abnormal', 'warrants evaluation', 'within range', 'out of range',
]);

/** Every CONCLUSION_TERM present in `text`, matched on word boundaries. */
function conclusionTermsIn(text) {
  const found = [];
  for (const term of CONCLUSION_TERMS) {
    const re = new RegExp('(^|[^\\w-])' + term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^\\w-]|$)', 'i');
    if (re.test(String(text))) found.push(term);
  }
  return found;
}

class RenderUnknownState extends Error {
  constructor(what, value) {
    super('render(): unhandled ' + what + ': ' + JSON.stringify(value) + ' — render must be total over the vocabulary');
    this.name = 'RenderUnknownState';
  }
}

function stateLine(state) {
  switch (state) {
    case CONDITION_STATES.VERIFIED:
      return 'sampling conditions were checked and recorded';
    case CONDITION_STATES.UNKNOWN:
      return 'pre-analytical status unknown — the check ran and could not establish the conditions';
    case CONDITION_STATES.VIOLATED:
      return 'sampling conditions were checked and a distorting factor was present';
    default:
      throw new RenderUnknownState('ConditionState', state);
  }
}

function companionLine(companionState) {
  switch (companionState) {
    case COMPANION_STATES.SATISFIED:
      return 'companion analytes present';
    case COMPANION_STATES.MISSING:
      return 'companion analyte missing';
    case COMPANION_STATES.UNENCODED:
      return 'no companion rule encoded for this analyte (that is not the same as "none needed")';
    default:
      throw new RenderUnknownState('CompanionState', companionState);
  }
}

function reasonLine(reason) {
  switch (reason) {
    case WITHHELD_REASONS.COMPANION_MISSING:
      return 'withheld — a required companion analyte is absent, so this value cannot be interpreted alone';
    case WITHHELD_REASONS.REPEAT_REQUIRED:
      return 'withheld — a first value beneath the documented band is repeated before anything is concluded from it';
    case WITHHELD_REASONS.CONFOUNDER_WITHHOLD:
      return 'withheld — a recorded distorting factor was present at sampling';
    case WITHHELD_REASONS.ENGINE_UNAVAILABLE:
      return 'withheld — the interpretation engine could not be reached; this is not a finding of "nothing found"';
    case WITHHELD_REASONS.UNRECOGNISED_VARIANT:
      return 'withheld — this analyte name is not one the registry declares, but it shares its identifying ' +
        'term with an analyte that IS gated; an undeclared spelling is not interpreted more freely than a declared one';
    case WITHHELD_REASONS.UNIT_UNCOMPARABLE:
      return 'withheld — this value cannot be placed against its documented reference band in the unit reported, ' +
        'so whether it sits beneath the band is undecided rather than answered "no"';
    default:
      throw new RenderUnknownState('withheld_reason', reason);
  }
}

function magnitudeText(m) {
  if (!m) return '';
  const ci = Array.isArray(m.ci) ? ' (CI ' + m.ci[0] + '…' + m.ci[1] + ' ' + m.unit + ')' : '';
  const at = m.at ? ' at ' + m.at : '';
  const qualifier = m.qualifier ? m.qualifier + ' ' : '';
  return qualifier + m.value + ' ' + m.unit + ci + at;
}

function sourceText(s) {
  if (!s) return '';
  return s.kind + ': ' + s.citation;
}

function findingLines(finding) {
  const lines = [];
  lines.push(
    '      factor ' + finding.confounder_id + ' (' + finding.condition_slot + ') ' +
    finding.direction + ' this analyte by ' + magnitudeText(finding.effect_magnitude) +
    ' [' + sourceText(finding.source) + ']'
  );
  if (finding.indistinguishable_from) {
    lines.push(
      '      indistinguishable along ' + finding.indistinguishable_from.axis.join('/') + ': ' +
      finding.indistinguishable_from.claim
    );
  }
  return lines;
}

function conditionsBlock(conditions) {
  if (!conditions || typeof conditions.get !== 'function') return ['  sampling conditions: not supplied'];
  const lines = ['  sampling conditions:'];
  for (const slot of conditions.constructor.SLOTS || []) {
    const v = conditions.get(slot);
    lines.push('    ' + slot + ': ' + (v === UNKNOWN ? 'UNKNOWN' : JSON.stringify(v)));
  }
  return lines;
}

function valueLabel(o) {
  const unit = o.unit ? ' ' + o.unit : '';
  return o.analyte_id + ' = ' + String(o.value) + unit;
}

/**
 * render(readout | mergedReadout) → string
 *
 * The single wording surface. Accepts the guard's own readout (no engine involved) or a
 * MergedReadout produced by attach(). Every observation it prints carries an audit; there is no
 * branch that prints an interpretation without one.
 */
function render(readout) {
  if (readout === null || typeof readout !== 'object' || !Array.isArray(readout.observations)) {
    throw new RenderUnknownState('readout', readout);
  }
  const out = [];
  out.push('PRE-ANALYTICAL GUARD — ' + (readout.produced_at || 'unknown time'));
  out.push(...conditionsBlock(readout.conditions));
  out.push('');

  const admitted = readout.observations.filter((o) => o.interpretable);
  const withheld = readout.observations.filter((o) => !o.interpretable);

  out.push('ADMITTED (' + admitted.length + ')');
  if (admitted.length === 0) out.push('  none');
  for (const o of admitted) {
    if (!o.audit) throw new RenderUnknownState('observation without an audit', o.analyte_id);
    out.push('  - ' + valueLabel(o));
    out.push('      ' + stateLine(o.audit.state) + '; ' + companionLine(o.audit.companion_state));

    const engineText = o.engine && o.engine.interpretation ? o.engine.interpretation : null;
    const caveats = [];
    const unknownSlots = Object.keys(o.audit.observed).filter((s) => o.audit.observed[s] === 'unknown');
    if (unknownSlots.length > 0) {
      caveats.push(
        'sampling conditions unknown (' + unknownSlots.join(', ') + ') — ' +
        'this reading may be shifted by an unmeasured factor and the shift cannot be separated from a real change'
      );
    }
    if (o.audit.reasons.includes('analyte-not-registered')) {
      caveats.push('no pre-analytical profile is encoded for this analyte, so nothing about it has been ruled out');
    }
    for (const f of o.audit.findings) {
      caveats.push(
        'recorded factor ' + f.confounder_id + ' ' + f.direction + ' this analyte by ' +
        magnitudeText(f.effect_magnitude) + ' [' + sourceText(f.source) + ']' +
        (f.indistinguishable_from
          ? '; along ' + f.indistinguishable_from.axis.join('/') + ' — ' + f.indistinguishable_from.claim
          : '')
      );
    }
    if (o.engine && o.engine.reference_encoded === false) {
      caveats.push('the engine holds no reference band for this analyte, so its verdict is unevaluable rather than reassuring');
    }

    if (engineText) {
      // Rule (b): interpretation and caveat are ONE string. Not two fields, not two sections.
      out.push('      ' + engineText + (caveats.length ? ' — CAVEAT: ' + caveats.join(' | ') : ''));
    } else if (caveats.length) {
      out.push('      CAVEAT: ' + caveats.join(' | '));
    }
  }

  out.push('');
  out.push('WITHHELD (' + withheld.length + ')');
  if (withheld.length === 0) out.push('  none');
  for (const o of withheld) {
    if (!o.audit) throw new RenderUnknownState('observation without an audit', o.analyte_id);
    out.push('  - ' + valueLabel(o));
    out.push('      ' + reasonLine(o.withheld_reason));
    out.push('      ' + stateLine(o.audit.state) + '; ' + companionLine(o.audit.companion_state));
    for (const f of o.audit.findings) out.push(...findingLines(f));
  }

  const reqs = Array.isArray(readout.requirements) ? readout.requirements : [];
  out.push('');
  out.push('REQUIRED BEFORE ANY CONCLUSION (' + reqs.length + ')');
  if (reqs.length === 0) out.push('  none');
  for (const r of reqs) {
    if (r.kind === 'order_companion') {
      out.push('  - order ' + r.companion_id + ' alongside ' + r.analyte_id);
    } else if (r.kind === 'repeat') {
      out.push('  - repeat ' + r.analyte_id + ' before drawing any conclusion from it');
    } else if (r.kind === 'declare_analyte') {
      out.push('  - declare ' + r.analyte_id + ' in the registry (or correct its spelling) before interpreting it');
    } else if (r.kind === 'state_unit') {
      out.push('  - report the unit of ' + r.analyte_id + ', or declare its conversion, before interpreting it');
    } else {
      throw new RenderUnknownState('Requirement.kind', r.kind);
    }
    out.push('      why: ' + r.because);
    if (r.magnitude) out.push('      magnitude: ' + magnitudeText(r.magnitude));
    // A requirement raised by a STRUCTURAL rule cites no figure, so it carries no source. Printing
    // an empty `source:` line would read as a missing citation rather than an absent one.
    if (r.source) out.push('      source: ' + sourceText(r.source));
  }

  const unencoded = Array.isArray(readout.unencoded) ? readout.unencoded : [];
  if (unencoded.length > 0) {
    out.push('');
    out.push('NO PRE-ANALYTICAL PROFILE ENCODED (' + unencoded.length + '): ' + unencoded.join(', '));
    out.push('  these analytes were audited against the universal bundle only — unencoded is not cleared');
  }

  // Rule (c): suppression is visible, and the engine's own summary is not passed through.
  const total = typeof readout.total_observed === 'number' ? readout.total_observed : readout.observations.length;
  const suppressed = Array.isArray(readout.suppressed) ? readout.suppressed : [];
  out.push('');
  if (suppressed.length > 0) {
    out.push(
      'PARTITION: pattern analysis ran on ' + (total - suppressed.length) + ' of ' + total +
      ' values; ' + suppressed.length + ' withheld pending: ' + suppressed.join(', ')
    );
    out.push('  cross-test aggregates were computed over the reduced set, so a pattern that did not fire is not a pattern that is absent');
  } else {
    out.push('PARTITION: all ' + total + ' values were audited and admitted');
    if (readout.engine_aggregates && readout.engine_aggregates.patient_summary) {
      out.push('  engine summary: ' + readout.engine_aggregates.patient_summary);
    }
  }

  if (readout.engine_available === false) {
    out.push('  the interpretation engine was unavailable for this run; nothing here is a finding of absence');
  }

  return out.join('\n');
}

module.exports = { render, CONCLUSION_TERMS, conclusionTermsIn, RenderUnknownState };
