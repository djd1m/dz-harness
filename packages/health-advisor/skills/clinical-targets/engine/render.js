'use strict';

// render.js — the ONLY module in this engine allowed to hold target-claim wording.
//
// Two exports can emit «выше цели» / «ниже цели»: `renderTargetStatement` and `renderDivergence`.
// Both accept ONLY a branded `TargetStatement` (claim.js), which cannot be constructed without both
// numbers + a citation + the non-diagnosis framing. Every other state renders in its OWN vocabulary
// and structurally cannot reach the claim path.
//
// The one-way rule (05_architecture.md §3): render never re-computes and never judges. Every line
// below is a FIELD of a LabReadout/TargetStatement, not a sentence someone remembered to write —
// which is why a missing citation is a crash in a test rather than a quiet omission in a report.

const { isTargetStatement, makeTargetStatement, ABOVE, BELOW } = require('./claim.js');
const { quantity, formatWithStep, roundToStep, NOT_COMPARABLE, AT, ON_TARGET } = require('./units.js');
const { APPLIES, DOES_NOT_APPLY, UNKNOWN_CONTEXT } = require('./applicability.js');
const {
  WITHIN, BELOW_REFERENCE, ABOVE_REFERENCE, NO_REFERENCE, UNKNOWN_ANALYTE,
} = require('./acl-lab-results.js');

// A DETECTION AID, not the enforcement mechanism (05_architecture.md §6.3): a lexicon is a list,
// and a list is the shape this repo keeps getting burned by. The guarantee is the brand check
// below; this array exists so tests and callers can scan output.
const CLAIM_LEXICON = Object.freeze([
  'выше цели', 'ниже цели', 'above target', 'below target',
]);

const DIRECTION_PHRASE = Object.freeze({ [ABOVE]: 'выше цели', [BELOW]: 'ниже цели' });

function requireStatement(stmt, fn) {
  if (!isTargetStatement(stmt)) {
    throw new TypeError(
      `${fn}: refuses anything but a branded TargetStatement — target-claim wording may not be ` +
      'assembled from raw numbers (D-12)',
    );
  }
}

// ── formatting helpers (pure, data-driven — no unit or analyte name is enumerated in code) ──────
function fmt(value, unit, analyte) {
  const step = analyte.reportingSteps[unit];
  const v = step ? roundToStep(value, step) : value;
  return `${formatWithStep(v, step || 0.01)} ${unit}`;
}

function inUnit(q, unit, converter) {
  const c = converter.convert(q, unit);
  if (c.kind === NOT_COMPARABLE) return null;
  return fmt(c.value, unit, q.analyte);
}

function describeBound(bounds, analyte, converter, unit) {
  const parts = [];
  if (bounds.lo) {
    const q = quantity(bounds.lo.value, bounds.lo.unit, analyte);
    parts.push(`${bounds.loInclusive ? '≥' : '>'}${inUnit(q, unit, converter) || fmt(bounds.lo.value, bounds.lo.unit, analyte)}`);
  }
  if (bounds.hi) {
    const q = quantity(bounds.hi.value, bounds.hi.unit, analyte);
    parts.push(`${bounds.hiInclusive ? '≤' : '<'}${inUnit(q, unit, converter) || fmt(bounds.hi.value, bounds.hi.unit, analyte)}`);
  }
  return parts.join(' и ');
}

function citationLine(citation) {
  return `Порог: «${citation.quote}» — ${citation.organization}, ${citation.documentTitle}, ` +
    `раздел ${citation.section}, ${citation.year} [evidence: ${citation.evidenceClass}]`;
}

// ── the two claim-bearing renderers (brand-checked) ────────────────────────────────────────────

function renderTargetStatement(stmt) {
  requireStatement(stmt, 'renderTargetStatement');
  const phrase = DIRECTION_PHRASE[stmt.direction];
  const lines = [];
  const both = stmt.observationInThresholdUnit
    ? `${stmt.observationDisplay} (${stmt.observationInThresholdUnit})`
    : stmt.observationDisplay;
  lines.push(`  Цель из руководства: ${stmt.thresholdDisplay} → ${phrase.toUpperCase()}${stmt.deltaDisplay ? ` на ${stmt.deltaDisplay}` : ''}`);
  lines.push(`  Ваше значение ${phrase}: ${both} против ${stmt.thresholdDisplay}.`);
  lines.push(`  ${citationLine(stmt.citation)}`);
  lines.push(`  Кому адресован порог: ${stmt.applicabilityNote}`);
  lines.push(`  ${stmt.framing}`);
  return lines.join('\n');
}

// The divergence is the single most misreadable sentence this engine can emit — «внутри референса,
// но выше цели» IS the patient's wrong conclusion, stated. It used to be a bare one-line marker:
// target-claim vocabulary carrying NONE of the four parts, exempted from the safety sweep by its
// own `claim: true` flag (QE finding G1). It is now the claim statement WITH a headline, so the
// property holds for it exactly as it holds for `renderTargetStatement` — no exemption, nothing to
// erode. `renderReadout` renders the diverging reading THROUGH this function instead of
// `renderTargetStatement`, so the block gains a line rather than repeating four.
function renderDivergence(stmt) {
  requireStatement(stmt, 'renderDivergence');
  return `  ⚠ РАСХОЖДЕНИЕ: значение внутри референсного интервала, но ${DIRECTION_PHRASE[stmt.direction]}:\n` +
    renderTargetStatement(stmt);
}

// ── the non-claim renderers — each in its OWN vocabulary ────────────────────────────────────────

function renderNoReference() {
  return '  Референс лаборатории: не указан. Это НЕ «в пределах нормы» — сравнивать не с чем.';
}

function renderReferenceLine(readout) {
  const ref = readout.reference;
  if (!ref || ref.state === NO_REFERENCE || !ref.interval) return renderNoReference();
  const analyte = readout.observation.analyte;
  const iv = ref.interval;
  const bare = (v) => {
    const step = analyte.reportingSteps[iv.unit];
    return formatWithStep(step ? roundToStep(v, step) : v, step || 0.01);
  };
  const lo = iv.lo === null ? '−∞' : bare(iv.lo);
  const hi = iv.hi === null ? `+∞ ${iv.unit}` : `${bare(iv.hi)} ${iv.unit}`;
  const verdict = {
    [WITHIN]: 'В ПРЕДЕЛАХ РЕФЕРЕНСА',
    [BELOW_REFERENCE]: 'НИЖЕ РЕФЕРЕНСНОГО ИНТЕРВАЛА',
    [ABOVE_REFERENCE]: 'ВЫШЕ РЕФЕРЕНСНОГО ИНТЕРВАЛА',
  }[ref.state] || 'СОСТОЯНИЕ НЕ ОПРЕДЕЛЕНО';
  return `  Референс лаборатории: ${lo} – ${hi} (источник: ${iv.origin}) → ${verdict}`;
}

function renderUnknownContext(reading) {
  const fields = (reading.missingFields || []).join(', ');
  return `  Цель «${reading.target.targetId}» существует, но неизвестно, относится ли она к вам — ` +
    `не хватает данных: ${fields || 'контекст не указан'}. Порог НЕ применён.`;
}

function renderNotApplicable(reading) {
  return `  Цель «${reading.target.targetId}» к вам не относится: ваш контекст не совпал с тем, ` +
    `для кого порог написан (${reading.target.citation.populationScope}). Порог НЕ применён.`;
}

function renderAtThreshold(reading) {
  return `  Цель «${reading.target.targetId}»: значение на пороге в пределах точности измерения — ` +
    'не выносим суждения ни в одну сторону.';
}

function renderOnTarget(reading) {
  return `  Цель «${reading.target.targetId}»: значение укладывается в порог.`;
}

function renderNotComparable(reading) {
  return `  Цель «${reading.target.targetId}»: сравнение невозможно — значение и порог не удаётся ` +
    'привести к одной единице с имеющимися данными.';
}

function renderUnknownAnalyte(readout) {
  return `«${readout.rawName}»: показатель не распознан. Ни один порог не применялся — ` +
    'мы не угадываем, какой это анализ.';
}

// ── the assembled block (the contract T-6/T-8 assert against; 05_architecture.md §3.1) ──────────

// Build the branded statement for one APPLIES + ABOVE/BELOW reading. Returns null for every other
// state, so no other state can reach the claim path.
function statementFor(readout, reading, converter) {
  if (reading.applicability !== APPLIES) return null;
  if (reading.comparison !== ABOVE && reading.comparison !== BELOW) return null;

  const analyte = readout.observation.analyte;
  const displayUnit = analyte.reportingSteps[readout.observation.unit] ? readout.observation.unit : analyte.canonicalUnit;
  const observationDisplay = inUnit(readout.observation, displayUnit, converter);
  const canonicalDisplay = displayUnit === analyte.canonicalUnit
    ? null
    : inUnit(readout.observation, analyte.canonicalUnit, converter);

  const thresholdDisplay = displayUnit === analyte.canonicalUnit
    ? describeBound(reading.target.bounds, analyte, converter, analyte.canonicalUnit)
    : `${describeBound(reading.target.bounds, analyte, converter, displayUnit)} ` +
      `(${describeBound(reading.target.bounds, analyte, converter, analyte.canonicalUnit)})`;

  // delta comes from the comparator, in canonical units; shown in the display unit.
  let deltaDisplay = null;
  if (Number.isFinite(reading.delta)) {
    const deltaCanonical = quantity(Math.abs(reading.delta), analyte.canonicalUnit, analyte);
    deltaDisplay = inUnit(deltaCanonical, displayUnit, converter);
  }

  const matched = reading.target.applicability.requires.map((p) => p.field).join(', ');
  return makeTargetStatement({
    observationDisplay,
    observationInThresholdUnit: canonicalDisplay,
    thresholdDisplay,
    deltaDisplay,
    direction: reading.comparison,
    citation: reading.target.citation,
    framing: reading.target.framingNote,
    applicabilityNote: `${reading.target.citation.populationScope}. Ваш контекст сверен по полям: ` +
      `${matched || 'без ограничений'} — совпадение подтверждено.`,
    analyteDisplayName: analyte.displayName,
  });
}

function renderReadout(readout, converterArg) {
  if (readout.analyteResolution === UNKNOWN_ANALYTE) return renderUnknownAnalyte(readout);

  const analyte = readout.observation.analyte;
  const converter = converterArg || readout.converter || (readout.registry && readout.registry.converter);
  if (!converter) {
    throw new TypeError('renderReadout: needs the registry converter (attach it as readout.converter)');
  }

  const displayUnit = analyte.reportingSteps[readout.observation.unit] ? readout.observation.unit : analyte.canonicalUnit;
  const head = inUnit(readout.observation, displayUnit, converter);
  const canonical = displayUnit === analyte.canonicalUnit ? null : inUnit(readout.observation, analyte.canonicalUnit, converter);

  const lines = [`${analyte.displayName}: ${head}${canonical ? ` (${canonical})` : ''}`];
  lines.push(renderReferenceLine(readout));

  const statements = [];
  const claimLines = [];   // index into `lines` of each claim block, so the divergence can REPLACE
  for (const reading of readout.targetReadings) {
    if (reading.applicability === UNKNOWN_CONTEXT) { lines.push(renderUnknownContext(reading)); continue; }
    if (reading.applicability === DOES_NOT_APPLY) { lines.push(renderNotApplicable(reading)); continue; }
    if (reading.comparison === AT) { lines.push(renderAtThreshold(reading)); continue; }
    if (reading.comparison === ON_TARGET) { lines.push(renderOnTarget(reading)); continue; }
    if (reading.comparison === NOT_COMPARABLE) { lines.push(renderNotComparable(reading)); continue; }
    const stmt = statementFor(readout, reading, converter);
    statements.push(stmt);
    lines.push(renderTargetStatement(stmt));
    claimLines.push(lines.length - 1);
  }

  // The divergence headline belongs INSIDE the statement it diverges from, never beside it: a
  // standalone ⚠ line is a target claim with none of the four parts (G1). Replacing the block keeps
  // the numbers, the citation and the frame attached to the warning exactly once.
  if (readout.divergence && readout.divergence.present && statements.length > 0) {
    lines[claimLines[0]] = renderDivergence(statements[0]);
  }
  if ((readout.notes || []).includes('CONFLICTING_TARGETS')) {
    lines.push('  ⚠ Пороги из разных источников указывают в разные стороны — показаны оба, ' +
      'выбор между ними за врачом.');
  }
  return lines.join('\n');
}

module.exports = {
  CLAIM_LEXICON,
  renderTargetStatement,
  renderDivergence,
  renderNoReference,
  renderReferenceLine,
  renderUnknownContext,
  renderNotApplicable,
  renderAtThreshold,
  renderOnTarget,
  renderNotComparable,
  renderUnknownAnalyte,
  renderReadout,
};

// NOTE: `statementFor` is deliberately NOT exported. It is the bridge from a LabReadout to a
// branded TargetStatement, and exporting it would hand callers a way to obtain the claim path
// without going through `renderReadout`. It is exercised end-to-end through `renderReadout`.

