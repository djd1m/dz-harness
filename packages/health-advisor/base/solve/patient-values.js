'use strict';

const PATIENT_VALUES_SCHEMA = 'patient-values-v1';
const FRESHNESS_DAYS = 30;
const ALLOWED_TOP_LEVEL = new Set(['schema', 'as_of', 'preferences', 'life_context']);
const ALLOWED_PREFERENCE = new Set(['id', 'kind', 'dimension', 'value', 'priority', 'statement', 'reason']);
const ALLOWED_LIFE_CONTEXT = new Set(['pregnancy_intent']);
const PREGNANCY_INTENTS = new Set(['planning', 'pregnant', 'not_planning', 'unknown']);
const COST_BANDS = new Set(['low', 'moderate', 'high', 'unknown']);
const EFFECT_ORDER = Object.freeze({ supports: 0, neutral: 1, not_evaluable: 1, conflicts: 2 });

class PatientValuesUsageError extends Error {
  constructor(code, path, message) {
    super(`${code} at ${path}: ${message}`);
    this.name = 'PatientValuesUsageError';
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

function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : parsed;
}

function freshnessOf(rawAsOf, solveAsOf) {
  if (solveAsOf === undefined) {
    return {
      current: false,
      applicable: dateOnly(rawAsOf) !== null,
      code: 'freshness_unknown',
      missingSolveAsOf: true,
    };
  }
  const source = dateOnly(rawAsOf);
  const solve = dateOnly(solveAsOf);
  if (!source || !solve) return { current: false, applicable: false, code: 'freshness_unknown' };
  const ageDays = Math.floor((solve.getTime() - source.getTime()) / 86400000);
  if (ageDays < 0) return { current: false, applicable: false, code: 'freshness_future' };
  if (ageDays > FRESHNESS_DAYS) return { current: false, applicable: false, code: 'freshness_stale' };
  return { current: true, applicable: true, code: null };
}

function warning(path, code, message) {
  return deepFreeze({ path, code, message });
}

function preferenceShapeErrors(value, index) {
  const base = `patient_values.preferences[${index}]`;
  const errors = [];
  if (!isRecord(value)) return [warning(base, 'wrong_type', 'preference must be an object')];
  for (const key of Object.keys(value)) {
    if (!ALLOWED_PREFERENCE.has(key)) errors.push(warning(`${base}.${key}`, 'unknown_field', 'field is not declared by patient-values-v1'));
  }
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(value.id)) {
    errors.push(warning(`${base}.id`, 'invalid_id', 'id must be a non-empty canonical token'));
  }
  if (!Number.isInteger(value.priority) || value.priority < 1) {
    errors.push(warning(`${base}.priority`, 'invalid_priority', 'priority must be a positive integer'));
  }
  if (typeof value.statement !== 'string' || value.statement.trim() === '') {
    errors.push(warning(`${base}.statement`, 'invalid_statement', 'statement must be a non-empty string'));
  }
  if (value.reason !== undefined && value.reason !== null && typeof value.reason !== 'string') {
    errors.push(warning(`${base}.reason`, 'wrong_type', 'reason must be a string or null'));
  }
  const combination = `${value.kind}|${value.dimension}`;
  if (combination === 'avoid|drug_class') {
    if (typeof value.value !== 'string' || !/^[a-z0-9][a-z0-9_-]*$/.test(value.value)) {
      errors.push(warning(`${base}.value`, 'unsupported_value', 'drug_class value must be a canonical token'));
    }
  } else if (combination === 'prefer|treatment_approach') {
    if (value.value !== 'non_pharmacological') {
      errors.push(warning(`${base}.value`, 'unsupported_value', 'supported treatment approach is non_pharmacological'));
    }
  } else if (combination === 'constraint|cost') {
    if (value.value !== 'critical') {
      errors.push(warning(`${base}.value`, 'unsupported_value', 'supported cost constraint is critical'));
    }
  } else {
    errors.push(warning(`${base}.kind`, 'unsupported_combination', 'kind and dimension are not a supported pair'));
  }
  return errors;
}

function emptyNormalized(state, warnings = []) {
  return deepFreeze({
    schema: PATIENT_VALUES_SCHEMA,
    state,
    ranking_preferences: [],
    clinical_context: { pregnancy_intent: 'unknown' },
    considered: [],
    stale: [],
    warnings,
  });
}

function normalizePatientValues(raw, options = {}) {
  if (raw === undefined) return emptyNormalized('absent');
  if (raw === null) return emptyNormalized('empty');
  if (!isRecord(raw)) {
    return emptyNormalized('malformed', [
      warning('patient_values', 'wrong_type', 'patient_values must be an object or null'),
    ]);
  }

  const warnings = [];
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      warnings.push(warning(`patient_values.${key}`, 'unknown_field', 'field is not declared by patient-values-v1'));
    }
  }
  if (raw.schema !== PATIENT_VALUES_SCHEMA) {
    warnings.push(warning('patient_values.schema', 'unsupported_schema', `expected ${PATIENT_VALUES_SCHEMA}`));
    return emptyNormalized('malformed', warnings);
  }
  const preferences = Array.isArray(raw.preferences) ? raw.preferences : [];
  if (!Array.isArray(raw.preferences)) {
    warnings.push(warning('patient_values.preferences', 'wrong_type', 'preferences must be an array'));
  }
  const lifeContext = isRecord(raw.life_context) ? raw.life_context : {};
  if (!isRecord(raw.life_context)) {
    warnings.push(warning('patient_values.life_context', 'wrong_type', 'life_context must be an object'));
  }
  for (const key of Object.keys(lifeContext)) {
    if (!ALLOWED_LIFE_CONTEXT.has(key)) {
      warnings.push(warning(`patient_values.life_context.${key}`, 'unknown_field', 'field is not declared by patient-values-v1'));
    }
  }

  const ids = new Map();
  const priorities = new Map();
  for (const value of preferences) {
    if (!isRecord(value)) continue;
    if (typeof value.id === 'string') ids.set(value.id, (ids.get(value.id) || 0) + 1);
    if (Number.isInteger(value.priority)) priorities.set(value.priority, (priorities.get(value.priority) || 0) + 1);
  }

  const freshness = freshnessOf(raw.as_of, options.solveAsOf);
  if (freshness.missingSolveAsOf) {
    warnings.push(warning(
      'solve_envelope.as_of',
      'freshness_unknown',
      'Freshness is unknown — supply solve_envelope.as_of; dated patient values are applied provisionally',
    ));
  } else if (freshness.code) {
    warnings.push(warning(
      'patient_values.as_of',
      freshness.code,
      freshness.code === 'freshness_stale'
        ? `values are older than ${FRESHNESS_DAYS} days and require reconfirmation`
        : 'values require a valid current as_of date before they can be reused',
    ));
  } else if (raw.as_of !== undefined && !dateOnly(raw.as_of)) {
    warnings.push(warning('patient_values.as_of', 'invalid_date', 'as_of must be a real YYYY-MM-DD date'));
  }

  const rankingPreferences = [];
  const considered = [];
  const stale = [];
  preferences.forEach((value, index) => {
    const errors = preferenceShapeErrors(value, index);
    if (isRecord(value) && ids.get(value.id) > 1) {
      errors.push(warning(`patient_values.preferences[${index}].id`, 'duplicate_id', 'id must be unique'));
    }
    if (isRecord(value) && priorities.get(value.priority) > 1) {
      errors.push(warning(`patient_values.preferences[${index}].priority`, 'duplicate_priority', 'priority must be unique'));
    }
    if (errors.length > 0) {
      warnings.push(...errors);
      return;
    }
    const normalized = deepFreeze({
      id: value.id,
      kind: value.kind,
      dimension: value.dimension,
      value: value.value,
      priority: value.priority,
      statement: value.statement,
      reason: value.reason ?? null,
    });
    if (freshness.applicable) rankingPreferences.push(normalized);
    else stale.push(deepFreeze({ path: `patient_values.preferences[${index}]`, id: value.id, code: freshness.code }));
    considered.push(deepFreeze({
      id: value.id,
      statement: value.statement,
      usage: 'ranking',
      status: freshness.current ? 'accepted' : freshness.applicable ? 'freshness_unknown' : 'stale',
    }));
  });

  let pregnancyIntent = 'unknown';
  const rawPregnancy = lifeContext.pregnancy_intent;
  if (rawPregnancy !== undefined && !PREGNANCY_INTENTS.has(rawPregnancy)) {
    warnings.push(warning(
      'patient_values.life_context.pregnancy_intent',
      'unsupported_value',
      'pregnancy_intent must be planning, pregnant, not_planning, or unknown',
    ));
  } else if (rawPregnancy !== undefined && rawPregnancy !== 'unknown') {
    considered.push(deepFreeze({
      id: 'pregnancy_intent',
      statement: `pregnancy_intent=${rawPregnancy}`,
      usage: 'clinical_context',
      status: freshness.current ? 'accepted' : freshness.applicable ? 'freshness_unknown' : 'stale',
    }));
    if (freshness.applicable) pregnancyIntent = rawPregnancy;
    else stale.push(deepFreeze({
      path: 'patient_values.life_context.pregnancy_intent',
      id: 'pregnancy_intent',
      code: freshness.code,
    }));
  }

  rankingPreferences.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const hasSuppliedValue = preferences.length > 0 || (rawPregnancy !== undefined && rawPregnancy !== 'unknown');
  const validCount = considered.length;
  const state = freshness.missingSolveAsOf && validCount > 0
    ? 'freshness_unknown'
    : !hasSuppliedValue && warnings.length === 0
    ? 'empty'
    : warnings.length === 0 && stale.length === 0
      ? 'populated'
      : validCount > 0
        ? 'mixed'
        : 'malformed';

  return deepFreeze({
    schema: PATIENT_VALUES_SCHEMA,
    state,
    as_of: dateOnly(raw.as_of) ? raw.as_of : null,
    ranking_preferences: rankingPreferences,
    clinical_context: { pregnancy_intent: pregnancyIntent },
    considered,
    stale,
    warnings,
  });
}

function assertRankableOption(raw, index, ids, ranks) {
  const path = `acceptable_options[${index}]`;
  if (!isRecord(raw)) throw new PatientValuesUsageError('invalid_option', path, 'option must be an object');
  if (typeof raw.option_id !== 'string' || raw.option_id.trim() === '') {
    throw new PatientValuesUsageError('invalid_option_id', `${path}.option_id`, 'option_id must be non-empty');
  }
  if (ids.has(raw.option_id)) {
    throw new PatientValuesUsageError('duplicate_option_id', `${path}.option_id`, 'option_id must be unique');
  }
  if (!Number.isInteger(raw.baseline_rank) || raw.baseline_rank < 1) {
    throw new PatientValuesUsageError('invalid_baseline_rank', `${path}.baseline_rank`, 'baseline_rank must be a positive integer');
  }
  if (ranks.has(raw.baseline_rank)) {
    throw new PatientValuesUsageError('duplicate_baseline_rank', `${path}.baseline_rank`, 'baseline_rank must be unique');
  }
  if (!isRecord(raw.attributes)) {
    throw new PatientValuesUsageError('invalid_attributes', `${path}.attributes`, 'attributes must be an object');
  }
  ids.add(raw.option_id);
  ranks.add(raw.baseline_rank);
}

function classifyEffect(option, preference) {
  const attrs = option.attributes;
  if (preference.kind === 'avoid' && preference.dimension === 'drug_class') {
    const classes = Array.isArray(attrs.drug_classes) ? attrs.drug_classes : [];
    const matches = classes.includes(preference.value);
    return {
      effect: matches ? 'conflicts' : 'neutral',
      reason: matches
        ? `matches avoided drug class ${preference.value}`
        : `does not match avoided drug class ${preference.value}`,
    };
  }
  if (preference.kind === 'prefer' && preference.dimension === 'treatment_approach') {
    const approaches = Array.isArray(attrs.treatment_approaches) ? attrs.treatment_approaches : [];
    if (approaches.length === 0) return { effect: 'not_evaluable', reason: 'treatment approach is not recorded' };
    const matches = approaches.includes(preference.value);
    return {
      effect: matches ? 'supports' : 'neutral',
      reason: matches
        ? `matches preferred treatment approach ${preference.value}`
        : `does not match preferred treatment approach ${preference.value}`,
    };
  }
  if (preference.kind === 'constraint' && preference.dimension === 'cost') {
    if (!COST_BANDS.has(attrs.cost_band) || attrs.cost_band === 'unknown') {
      return { effect: 'not_evaluable', reason: 'cost band is not evaluable' };
    }
    if (attrs.cost_band === 'low') return { effect: 'supports', reason: 'low cost supports the critical cost constraint' };
    if (attrs.cost_band === 'high') return { effect: 'conflicts', reason: 'high cost conflicts with the critical cost constraint' };
    return { effect: 'neutral', reason: 'moderate cost is neutral for the critical cost constraint' };
  }
  throw new PatientValuesUsageError('unsupported_preference', `preference.${preference.id}`, 'normalizer emitted an unsupported preference');
}

function rankAcceptableOptions(acceptableOptions, normalizedPatientValues) {
  if (!Array.isArray(acceptableOptions)) {
    throw new PatientValuesUsageError('invalid_options', 'acceptable_options', 'expected an array');
  }
  if (!isRecord(normalizedPatientValues) || !Array.isArray(normalizedPatientValues.ranking_preferences)) {
    throw new PatientValuesUsageError('invalid_patient_values', 'normalized_patient_values', 'use normalizePatientValues first');
  }
  const ids = new Set();
  const ranks = new Set();
  acceptableOptions.forEach((option, index) => assertRankableOption(option, index, ids, ranks));
  const baseline = acceptableOptions.slice().sort(
    (a, b) => a.baseline_rank - b.baseline_rank || a.option_id.localeCompare(b.option_id),
  );
  const effectsByOption = new Map(baseline.map((option) => [option.option_id, new Map()]));
  const optionEffects = [];
  for (const preference of normalizedPatientValues.ranking_preferences) {
    for (const option of baseline) {
      const classified = classifyEffect(option, preference);
      const row = deepFreeze({
        value_id: preference.id,
        option_id: option.option_id,
        effect: classified.effect,
        reason: classified.reason,
      });
      effectsByOption.get(option.option_id).set(preference.id, row);
      optionEffects.push(row);
    }
  }
  const adjusted = baseline.slice().sort((left, right) => {
    for (const preference of normalizedPatientValues.ranking_preferences) {
      const a = effectsByOption.get(left.option_id).get(preference.id).effect;
      const b = effectsByOption.get(right.option_id).get(preference.id).effect;
      if (EFFECT_ORDER[a] !== EFFECT_ORDER[b]) return EFFECT_ORDER[a] - EFFECT_ORDER[b];
    }
    return left.baseline_rank - right.baseline_rank || left.option_id.localeCompare(right.option_id);
  });
  const baselineIds = baseline.map((option) => option.option_id);
  const adjustedIds = adjusted.map((option) => option.option_id);
  const after = new Map(adjustedIds.map((id, index) => [id, index + 1]));
  const changes = baselineIds.flatMap((optionId, index) => {
    const beforePosition = index + 1;
    const afterPosition = after.get(optionId);
    if (beforePosition === afterPosition) return [];
    return [deepFreeze({
      option_id: optionId,
      before_position: beforePosition,
      after_position: afterPosition,
      delta: beforePosition - afterPosition,
      // A neutral option may still move because a sibling is supported or conflicts. The reason for
      // a permutation is therefore the complete ordered rule set, not only this option's own cells.
      reason_value_ids: normalizedPatientValues.ranking_preferences.map((preference) => preference.id),
    })];
  });
  return deepFreeze({
    baseline_ids: baselineIds,
    adjusted_ids: adjustedIds,
    option_effects: optionEffects,
    changes,
  });
}

module.exports = {
  PATIENT_VALUES_SCHEMA,
  FRESHNESS_DAYS,
  EFFECT_ORDER,
  PatientValuesUsageError,
  normalizePatientValues,
  rankAcceptableOptions,
};
