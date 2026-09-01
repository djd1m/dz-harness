#!/usr/bin/env node
'use strict';

const { createHash } = require('node:crypto');
const {
  EFFECT_ORDER,
  normalizePatientValues,
  rankAcceptableOptions,
} = require('./patient-values.js');

const SOLVE_ENVELOPE_SCHEMA = 'solve-envelope-v1';
const SOLVE_DOCUMENT_SCHEMA = 'solve-advice-document-v1';
const VALUES_DOCTOR_BOUNDARY = 'Patient values may change the order of clinically acceptable options, but they do not replace a doctor or cancel indications, contraindications, red flags, or urgent-care advice; discuss treatment decisions with a qualified clinician.';
const MEDICAL_DISCLAIMER = 'Данный документ носит информационно-аналитический характер и не является медицинской рекомендацией. Все решения по лечению должны приниматься лечащим врачом.';
const HEADINGS = Object.freeze({
  en: Object.freeze({
    title: 'Solve Advice',
    urgent: 'Urgent and Safety Information',
    clinical: 'Clinical Indications and Contraindications',
    requiresClinician: 'Requires Clinician Options',
    contraindicated: 'Contraindicated Options',
    ranked: 'Ranked Acceptable Options',
    values: 'Patient Values Considered',
    ranking: 'How Patient Values Changed the Ranking',
    conflicts: 'Preference–Indication Conflicts',
    nextSteps: 'Uncertainties and Next Steps',
    boundary: 'Important Boundary',
  }),
  ru: Object.freeze({
    title: 'Рекомендации по выбору',
    urgent: 'Срочная информация и безопасность',
    clinical: 'Показания и противопоказания',
    requiresClinician: 'Варианты, требующие решения врача',
    contraindicated: 'Противопоказанные варианты',
    ranked: 'Ранжированные клинически допустимые варианты',
    values: 'Учтённые ценности пациента',
    ranking: 'Как ценности пациента изменили порядок',
    conflicts: 'Конфликты предпочтений и показаний',
    nextSteps: 'Неопределённости и следующие шаги',
    boundary: 'Важное ограничение',
  }),
});

class SolveAdviceError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'SolveAdviceError';
    this.code = code;
    this.path = path;
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value, path) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    throw new SolveAdviceError('not_json_compatible', path, 'value must be JSON-compatible');
  }
}

function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function assertArray(value, path) {
  if (!Array.isArray(value)) throw new SolveAdviceError('invalid_array', path, 'expected an array');
}

function assertNonEmpty(value, path) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SolveAdviceError('missing_required_text', path, 'expected a non-empty string');
  }
}

function validateEnvelope(envelope) {
  if (!isRecord(envelope)) throw new SolveAdviceError('invalid_envelope', 'solve_envelope', 'expected an object');
  if (envelope.schema !== SOLVE_ENVELOPE_SCHEMA) {
    throw new SolveAdviceError('unsupported_schema', 'solve_envelope.schema', `expected ${SOLVE_ENVELOPE_SCHEMA}`);
  }
  if (!isRecord(envelope.clinical)) {
    throw new SolveAdviceError('invalid_clinical', 'solve_envelope.clinical', 'expected an object');
  }
  for (const field of ['emergency_actions', 'red_flags', 'contraindications', 'indications', 'options']) {
    assertArray(envelope.clinical[field], `solve_envelope.clinical.${field}`);
  }
  assertArray(envelope.uncertainties, 'solve_envelope.uncertainties');
  assertArray(envelope.next_steps, 'solve_envelope.next_steps');
  const ids = new Set();
  const acceptableRanks = new Set();
  envelope.clinical.options.forEach((option, index) => {
    const path = `solve_envelope.clinical.options[${index}]`;
    if (!isRecord(option)) throw new SolveAdviceError('invalid_option', path, 'expected an object');
    assertNonEmpty(option.option_id, `${path}.option_id`);
    if (ids.has(option.option_id)) throw new SolveAdviceError('duplicate_option_id', `${path}.option_id`, 'option_id must be unique');
    ids.add(option.option_id);
    if (!['acceptable', 'contraindicated', 'requires_clinician'].includes(option.clinical_status)) {
      throw new SolveAdviceError('invalid_clinical_status', `${path}.clinical_status`, 'status is not declared');
    }
    if (!isRecord(option.indication)) {
      throw new SolveAdviceError('invalid_indication', `${path}.indication`, 'expected an object');
    }
    if (!['indicated', 'conditional', 'not_indicated'].includes(option.indication.status)) {
      throw new SolveAdviceError('invalid_indication_status', `${path}.indication.status`, 'status is not declared');
    }
    if (option.clinical_status === 'acceptable') {
      if (!Number.isInteger(option.baseline_rank) || option.baseline_rank < 1) {
        throw new SolveAdviceError('invalid_baseline_rank', `${path}.baseline_rank`, 'acceptable option rank must be a positive integer');
      }
      if (acceptableRanks.has(option.baseline_rank)) {
        throw new SolveAdviceError('duplicate_baseline_rank', `${path}.baseline_rank`, 'acceptable option rank must be unique');
      }
      acceptableRanks.add(option.baseline_rank);
    }
  });
}

function acceptableOptions(envelope) {
  return envelope.clinical.options.filter((option) => option.clinical_status === 'acceptable');
}

function acceptableProjection(options) {
  return options.map((option) => ({
    option_id: option.option_id,
    baseline_rank: option.baseline_rank,
    attributes: cloneJson(option.attributes || {}, `option.${option.option_id}.attributes`),
  }));
}

function baselineRanking(options) {
  const baselineIds = options.slice()
    .sort((a, b) => a.baseline_rank - b.baseline_rank || a.option_id.localeCompare(b.option_id))
    .map((option) => option.option_id);
  return deepFreeze({ baseline_ids: baselineIds, adjusted_ids: baselineIds, option_effects: [], changes: [] });
}

function sameMembers(left, right) {
  if (left.length !== right.length) return false;
  const counts = new Map();
  for (const id of left) counts.set(id, (counts.get(id) || 0) + 1);
  for (const id of right) {
    if (!counts.has(id)) return false;
    const next = counts.get(id) - 1;
    if (next === 0) counts.delete(id);
    else counts.set(id, next);
  }
  return counts.size === 0;
}

function causalValueIdsForDemotion(optionId, baselineIds, adjustedIds, preferences, effects) {
  const baselinePosition = new Map(baselineIds.map((id, index) => [id, index]));
  const adjustedPosition = new Map(adjustedIds.map((id, index) => [id, index]));
  const effectByPair = new Map(effects.map((effect) => [
    `${effect.value_id}\u0000${effect.option_id}`,
    effect.effect,
  ]));
  const causalIds = new Set();
  for (const overtakingId of baselineIds) {
    if (baselinePosition.get(overtakingId) <= baselinePosition.get(optionId) ||
        adjustedPosition.get(overtakingId) >= adjustedPosition.get(optionId)) continue;
    for (const preference of preferences) {
      const overtakingEffect = effectByPair.get(`${preference.id}\u0000${overtakingId}`);
      const demotedEffect = effectByPair.get(`${preference.id}\u0000${optionId}`);
      if (EFFECT_ORDER[overtakingEffect] === EFFECT_ORDER[demotedEffect]) continue;
      if (EFFECT_ORDER[overtakingEffect] < EFFECT_ORDER[demotedEffect]) causalIds.add(preference.id);
      break;
    }
  }
  return preferences.map((preference) => preference.id).filter((id) => causalIds.has(id));
}

function canonicalRanking(ranking, expectedBaseline, normalized, emergencySkipped) {
  if (!isRecord(ranking)) throw new SolveAdviceError('invalid_ranking', 'ranking', 'expected an object');
  assertArray(ranking.baseline_ids, 'ranking.baseline_ids');
  assertArray(ranking.adjusted_ids, 'ranking.adjusted_ids');
  if (emergencySkipped && ranking.adjusted_ids.some((id, index) => id !== expectedBaseline[index])) {
    throw new SolveAdviceError(
      'emergency_ranking_effect',
      'ranking.adjusted_ids',
      'emergency path cannot reorder the clinical baseline',
    );
  }
  if (new Set(ranking.baseline_ids).size !== ranking.baseline_ids.length ||
      new Set(ranking.adjusted_ids).size !== ranking.adjusted_ids.length ||
      !sameMembers(ranking.baseline_ids, ranking.adjusted_ids) ||
      !sameMembers(ranking.baseline_ids, expectedBaseline)) {
    throw new SolveAdviceError('non_permutation', 'ranking.adjusted_ids', 'adjusted IDs must be a duplicate-free full permutation of the acceptable baseline');
  }
  if (ranking.baseline_ids.some((id, index) => id !== expectedBaseline[index])) {
    throw new SolveAdviceError('baseline_mismatch', 'ranking.baseline_ids', 'baseline must equal the clinical default order');
  }
  const validValueIds = new Set(normalized.ranking_preferences.map((value) => value.id));
  const effects = Array.isArray(ranking.option_effects) ? ranking.option_effects : [];
  const seenEffects = new Set();
  for (const [index, effect] of effects.entries()) {
    if (!isRecord(effect) || !expectedBaseline.includes(effect.option_id) || !validValueIds.has(effect.value_id)) {
      throw new SolveAdviceError('invalid_ranking_effect', `ranking.option_effects[${index}]`, 'effect must reference an acceptable option and applied value');
    }
    if (!['supports', 'neutral', 'conflicts', 'not_evaluable'].includes(effect.effect)) {
      throw new SolveAdviceError('invalid_ranking_effect', `ranking.option_effects[${index}].effect`, 'effect is not declared');
    }
    if (typeof effect.reason !== 'string' || effect.reason.trim() === '') {
      throw new SolveAdviceError('invalid_ranking_effect', `ranking.option_effects[${index}].reason`, 'effect reason must be visible');
    }
    const effectKey = `${effect.value_id}\u0000${effect.option_id}`;
    if (seenEffects.has(effectKey)) {
      throw new SolveAdviceError('duplicate_ranking_effect', `ranking.option_effects[${index}]`, 'value and option pair must be unique');
    }
    seenEffects.add(effectKey);
  }
  if (emergencySkipped && effects.length > 0) {
    throw new SolveAdviceError(
      'emergency_ranking_effect',
      'ranking.option_effects',
      'emergency path cannot apply patient-value effects',
    );
  }
  if (!emergencySkipped) {
    const expectedEffectCount = validValueIds.size * expectedBaseline.length;
    if (effects.length !== expectedEffectCount) {
      throw new SolveAdviceError('incomplete_ranking_effects', 'ranking.option_effects', 'every applied value must explain every acceptable option');
    }
    for (const valueId of validValueIds) {
      for (const optionId of expectedBaseline) {
        if (!seenEffects.has(`${valueId}\u0000${optionId}`)) {
          throw new SolveAdviceError('incomplete_ranking_effects', 'ranking.option_effects', `missing effect for ${valueId} and ${optionId}`);
        }
      }
    }
  }
  const adjustedPosition = new Map(ranking.adjusted_ids.map((id, index) => [id, index + 1]));
  const changes = ranking.baseline_ids.flatMap((optionId, index) => {
    const before = index + 1;
    const after = adjustedPosition.get(optionId);
    return before === after ? [] : [{
      option_id: optionId,
      before_position: before,
      after_position: after,
      delta: before - after,
      reason_value_ids: after > before
        ? causalValueIdsForDemotion(
          optionId,
          ranking.baseline_ids,
          ranking.adjusted_ids,
          normalized.ranking_preferences,
          effects,
        )
        : normalized.ranking_preferences.map((preference) => preference.id),
    }];
  });
  return deepFreeze({
    baseline_ids: [...ranking.baseline_ids],
    adjusted_ids: [...ranking.adjusted_ids],
    option_effects: effects.map((effect) => ({
      value_id: effect.value_id,
      option_id: effect.option_id,
      effect: effect.effect,
      reason: String(effect.reason || ''),
    })),
    changes,
  });
}

function detectConflicts(clinical, normalized, ranking) {
  const conflicts = [];
  const preferenceById = new Map(normalized.ranking_preferences.map((preference) => [preference.id, preference]));
  const optionById = new Map(clinical.options.map((option) => [option.option_id, option]));
  const demotions = ranking.changes.filter((change) => change.after_position > change.before_position);
  for (const change of demotions) {
    const option = optionById.get(change.option_id);
    if (!option || option.indication.status !== 'indicated') continue;
    for (const valueId of change.reason_value_ids) {
      const preference = preferenceById.get(valueId);
      if (!preference) continue;
      const path = `clinical.options.${option.option_id}`;
      assertNonEmpty(option.indication.rationale, `${path}.indication.rationale`);
      assertNonEmpty(option.indication.consequence_of_declining, `${path}.indication.consequence_of_declining`);
      if (!Array.isArray(option.evidence_refs) || option.evidence_refs.length === 0 ||
          option.evidence_refs.some((reference) => typeof reference !== 'string' || reference.trim() === '')) {
        throw new SolveAdviceError('incomplete_conflict', `${path}.evidence_refs`, 'refused indicated option needs evidence references');
      }
      conflicts.push(deepFreeze({
        value_id: preference.id,
        option_id: option.option_id,
        option_title: option.title || option.option_id,
        preference_statement: preference.statement,
        indication_rationale: option.indication.rationale,
        consequence_of_declining: option.indication.consequence_of_declining,
        evidence_refs: [...option.evidence_refs],
      }));
    }
  }
  return conflicts;
}

function mergeSolveAdvice(envelope, normalizedPatientValues, rankingResult, options = {}) {
  validateEnvelope(envelope);
  if (!isRecord(normalizedPatientValues) || !Array.isArray(normalizedPatientValues.ranking_preferences)) {
    throw new SolveAdviceError('invalid_patient_values', 'normalized_patient_values', 'use normalizePatientValues first');
  }
  const sourceClinicalIntegrity = digest(envelope.clinical);
  const clinical = cloneJson(envelope.clinical, 'solve_envelope.clinical');
  const acceptable = acceptableOptions(envelope)
    .slice()
    .sort((a, b) => a.baseline_rank - b.baseline_rank || a.option_id.localeCompare(b.option_id));
  const expectedBaseline = acceptable.map((option) => option.option_id);
  const ranking = canonicalRanking(
    rankingResult,
    expectedBaseline,
    normalizedPatientValues,
    options.emergencySkipped === true,
  );
  const optionById = new Map(acceptable.map((option) => [option.option_id, option]));
  const rankedAcceptable = ranking.adjusted_ids.map((id) => cloneJson(optionById.get(id), `option.${id}`));
  const conflicts = detectConflicts(clinical, normalizedPatientValues, ranking);
  if (digest(clinical) !== sourceClinicalIntegrity) {
    throw new SolveAdviceError('clinical_integrity_mismatch', 'solve_envelope.clinical', 'clinical hierarchy changed during merge');
  }
  return deepFreeze({
    schema: SOLVE_DOCUMENT_SCHEMA,
    locale: envelope.locale === 'ru' ? 'ru' : 'en',
    patient_values: normalizedPatientValues,
    clinical,
    clinical_integrity: sourceClinicalIntegrity,
    ranking,
    ranked_acceptable_options: rankedAcceptable,
    conflicts,
    emergency_values_skipped: options.emergencySkipped === true,
    uncertainties: cloneJson(envelope.uncertainties, 'solve_envelope.uncertainties'),
    next_steps: cloneJson(envelope.next_steps, 'solve_envelope.next_steps'),
    boundary: VALUES_DOCTOR_BOUNDARY,
  });
}

function buildSolveAdvice(envelope, dependencies = {}) {
  validateEnvelope(envelope);
  const rawValues = Object.prototype.hasOwnProperty.call(envelope, 'patient_values')
    ? envelope.patient_values
    : undefined;
  const normalized = normalizePatientValues(rawValues, { solveAsOf: envelope.as_of });
  const acceptable = acceptableOptions(envelope);
  const emergencySkipped = envelope.clinical.emergency_actions.length > 0;
  let ranking;
  if (emergencySkipped) {
    ranking = baselineRanking(acceptable);
  } else {
    const ranker = dependencies.rankAcceptableOptions || rankAcceptableOptions;
    ranking = ranker(acceptableProjection(acceptable), normalized);
  }
  return mergeSolveAdvice(envelope, normalized, ranking, { emergencySkipped });
}

function expectedConflicts(document, ranking) {
  return detectConflicts(document.clinical, document.patient_values, ranking);
}

function validateDocument(document) {
  if (!isRecord(document) || document.schema !== SOLVE_DOCUMENT_SCHEMA) {
    throw new SolveAdviceError('invalid_document', 'solve_advice', 'document must come from buildSolveAdvice');
  }
  if (document.boundary !== VALUES_DOCTOR_BOUNDARY) {
    throw new SolveAdviceError('missing_doctor_boundary', 'solve_advice.boundary', 'the values-specific doctor boundary is mandatory');
  }
  if (document.clinical_integrity !== digest(document.clinical)) {
    throw new SolveAdviceError('clinical_integrity_mismatch', 'solve_advice.clinical', 'clinical hierarchy changed after merge');
  }
  const acceptable = document.clinical.options
    .filter((option) => option.clinical_status === 'acceptable')
    .sort((a, b) => a.baseline_rank - b.baseline_rank || a.option_id.localeCompare(b.option_id));
  const ranking = canonicalRanking(
    document.ranking,
    acceptable.map((option) => option.option_id),
    document.patient_values,
    document.emergency_values_skipped === true,
  );
  const expected = expectedConflicts(document, ranking);
  const actual = Array.isArray(document.conflicts) ? document.conflicts : [];
  const key = (conflict) => `${conflict.value_id}|${conflict.option_id}|${conflict.indication_rationale}|${conflict.consequence_of_declining}`;
  if (expected.length !== actual.length || expected.some((conflict, index) => key(conflict) !== key(actual[index]))) {
    throw new SolveAdviceError('incomplete_conflict', 'solve_advice.conflicts', 'every refused indicated option requires both preference and clinical cost');
  }
  const optionById = new Map(acceptable.map((option) => [option.option_id, option]));
  return {
    ranking,
    rankedAcceptableOptions: ranking.adjusted_ids.map((id) => optionById.get(id)),
    conflicts: expected,
  };
}

function textOf(value) {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return String(value);
  return value.text || value.action || value.title || value.label || value.option_id || JSON.stringify(value);
}

function listSection(lines, title, rows, emptyText) {
  lines.push(`## ${title}`);
  if (rows.length === 0) lines.push(`- ${emptyText}`);
  else for (const row of rows) lines.push(`- ${textOf(row)}`);
  lines.push('');
}

function rankingPositions(ranking) {
  return {
    before: new Map(ranking.baseline_ids.map((id, index) => [id, index + 1])),
    after: new Map(ranking.adjusted_ids.map((id, index) => [id, index + 1])),
  };
}

function hasClinicalDisclosure(option) {
  const indication = option.indication || {};
  return indication.status === 'indicated' ||
    (typeof indication.rationale === 'string' && indication.rationale.trim() !== '') ||
    (typeof indication.consequence_of_declining === 'string' && indication.consequence_of_declining.trim() !== '');
}

function clinicalOptionText(option) {
  const indication = option.indication;
  const parts = [
    `${option.title || option.option_id} (${option.option_id}); indication=${indication.status}: ${indication.rationale || 'not stated'}`,
  ];
  if (typeof indication.consequence_of_declining === 'string' && indication.consequence_of_declining.trim() !== '') {
    parts.push(`consequence of declining: ${indication.consequence_of_declining}`);
  }
  return parts.join('; ');
}

function renderSolveAdvice(document) {
  const verified = validateDocument(document);
  const ranking = verified.ranking;
  const headings = HEADINGS[document.locale === 'ru' ? 'ru' : 'en'];
  const requiresClinician = document.clinical.options.filter(
    (option) => option.clinical_status === 'requires_clinician' && hasClinicalDisclosure(option),
  );
  const urgentRequiresClinician = requiresClinician.filter((option) =>
    option.indication.status === 'indicated' ||
    (typeof option.indication.consequence_of_declining === 'string' &&
      option.indication.consequence_of_declining.trim() !== ''),
  );
  const contraindicated = document.clinical.options.filter(
    (option) => option.clinical_status === 'contraindicated' && hasClinicalDisclosure(option),
  );
  const out = [];
  out.push(`# ${headings.title}`);
  out.push('');
  out.push(`## ${headings.urgent}`);
  const urgent = [...document.clinical.emergency_actions, ...document.clinical.red_flags];
  if (urgent.length === 0 && urgentRequiresClinician.length === 0) {
    out.push('- No urgent action or red flag was supplied by the clinical lane.');
  }
  else for (const row of urgent) out.push(`- ${textOf(row)}`);
  for (const option of urgentRequiresClinician) out.push(`- Requires clinician: ${clinicalOptionText(option)}`);
  out.push('');

  out.push(`## ${headings.clinical}`);
  if (document.clinical.indications.length === 0) out.push('- No separate indication row was supplied.');
  else for (const row of document.clinical.indications) out.push(`- Indication: ${textOf(row)}`);
  if (document.clinical.contraindications.length === 0) out.push('- No contraindication row was supplied.');
  else for (const row of document.clinical.contraindications) out.push(`- Contraindication: ${textOf(row)}`);
  out.push('');

  listSection(
    out,
    headings.requiresClinician,
    requiresClinician.map(clinicalOptionText),
    'No option requiring clinician review was supplied.',
  );
  listSection(
    out,
    headings.contraindicated,
    contraindicated.map(clinicalOptionText),
    'No contraindicated option with clinical detail was supplied.',
  );

  out.push(`## ${headings.ranked}`);
  if (verified.rankedAcceptableOptions.length === 0) out.push('- No clinically acceptable option was supplied.');
  verified.rankedAcceptableOptions.forEach((option, index) => {
    out.push(`${index + 1}. ${option.title || option.option_id} (${option.option_id}); indication=${option.indication.status}: ${option.indication.rationale || 'not stated'}`);
  });
  out.push('');

  out.push(`## ${headings.values}`);
  if (document.patient_values.state === 'absent') {
    out.push('- No patient values were provided.');
  } else if (document.patient_values.state === 'empty') {
    out.push('- Patient values were provided, but no ranking preferences were present.');
  }
  for (const value of document.patient_values.considered) {
    out.push(`- ${value.id}: “${value.statement}” — ${value.usage}; ${value.status}.`);
  }
  for (const stale of document.patient_values.stale) {
    out.push(`- ${stale.path}: requires reconfirmation before it may affect ranking or clinical context.`);
  }
  for (const item of document.patient_values.warnings) {
    out.push(`- PATIENT VALUES INPUT WARNING — ${item.path}: ${item.code} — ${item.message}.`);
  }
  if (document.patient_values.considered.length === 0 &&
      document.patient_values.warnings.length === 0 &&
      !['absent', 'empty'].includes(document.patient_values.state)) {
    out.push('- No validated patient value was available to apply.');
  }
  out.push('');

  out.push(`## ${headings.ranking}`);
  if (document.emergency_values_skipped) {
    out.push('- Patient values were not applied because urgent routing took priority.');
  }
  const positions = rankingPositions(ranking);
  const titleById = new Map(document.clinical.options.map((option) => [option.option_id, option.title || option.option_id]));
  for (const optionId of ranking.baseline_ids) {
    const effects = ranking.option_effects.filter((effect) => effect.option_id === optionId);
    const reasons = effects.length === 0
      ? 'no applicable patient-value effect'
      : effects.map((effect) => `${effect.value_id}: ${effect.effect} (${effect.reason})`).join('; ');
    out.push(`- ${titleById.get(optionId)}: position ${positions.before.get(optionId)} → ${positions.after.get(optionId)}; ${reasons}.`);
  }
  if (ranking.changes.length === 0) out.push('- No option changed rank.');
  out.push('');

  out.push(`## ${headings.conflicts}`);
  if (verified.conflicts.length === 0) out.push('- No refused indicated option was detected.');
  for (const conflict of verified.conflicts) {
    out.push(`- Preference “${conflict.preference_statement}” contributed to moving indicated option “${conflict.option_title}” (${conflict.option_id}) lower in the acceptable-option order.`);
    out.push(`  - Indication remains: ${conflict.indication_rationale}.`);
    out.push(`  - Clinical consequence of declining: ${conflict.consequence_of_declining}.`);
    out.push(`  - Evidence: ${conflict.evidence_refs.join(', ')}.`);
  }
  out.push('');

  listSection(out, headings.nextSteps, document.uncertainties, 'No additional uncertainty was supplied.');
  if (document.next_steps.length > 0) {
    out.splice(out.length - 1, 0, ...document.next_steps.map((step) => `- Next step: ${textOf(step)}`));
  }
  out.push(`## ${headings.boundary}`);
  out.push(document.boundary);
  out.push('');
  out.push(MEDICAL_DISCLAIMER);
  return out.join('\n');
}

function cliFailure(error, usage) {
  const code = error && typeof error.code === 'string' ? error.code : usage ? 'unreadable_input' : 'internal_refusal';
  const path = error && typeof error.path === 'string' ? error.path : 'solve_envelope';
  process.stderr.write(`patient-values result=refused reason=${code} path=${path}\n`);
  process.exitCode = usage ? 2 : 1;
}

function runCli(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    cliFailure({ code: 'invalid_json', path: 'stdin' }, true);
    return;
  }
  try {
    const document = buildSolveAdvice(payload);
    const markdown = renderSolveAdvice(document);
    process.stdout.write(`${markdown}\n`);
    process.stderr.write(
      `patient-values result=emitted considered=${document.patient_values.considered.length}` +
      ` rank_changes=${document.ranking.changes.length} conflicts=${document.conflicts.length}` +
      ` warnings=${document.patient_values.warnings.length}\n`,
    );
  } catch (error) {
    cliFailure(error, false);
  }
}

module.exports = {
  SOLVE_ENVELOPE_SCHEMA,
  SOLVE_DOCUMENT_SCHEMA,
  VALUES_DOCTOR_BOUNDARY,
  MEDICAL_DISCLAIMER,
  SolveAdviceError,
  buildSolveAdvice,
  mergeSolveAdvice,
  renderSolveAdvice,
  runCli,
};

if (require.main === module) {
  if (process.argv.length > 2) {
    cliFailure({ code: 'unexpected_argument', path: 'argv' }, true);
  } else {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { input += chunk; });
    process.stdin.on('error', () => cliFailure({ code: 'stdin_error', path: 'stdin' }, true));
    process.stdin.on('end', () => runCli(input));
  }
}
