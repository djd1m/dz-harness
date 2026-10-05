/** Derived stage usage only. Source IO and independent witnesses belong to cost-ledger.ts. */
import { MODEL_PRICES } from './cost-scoring.js';
import { canonicalStage } from './feature-adr-stage-canon.js';
import { fnv1a64 } from './feature-adr-checkpoints.js';
import { parseModelSpec, resolveLedgerModelProvenance } from './run-records.js';

type RecordRow = Record<string, unknown>;
const record = (v: unknown): v is RecordRow => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
const text = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v : null;
const tokenFields = ['tokensTotal', 'tokensIn', 'tokensOut', 'tokensCacheRead', 'tokensCacheWrite', 'tokensReasoning'] as const;

function price(row: RecordRow, dimensions: Record<typeof tokenFields[number], number | null>) {
  const model = text(row['model']); const normalized = model?.toLowerCase().replace(/^[a-z0-9-]+\//, '') ?? '';
  let tableKey = Object.keys(MODEL_PRICES).filter((key) => normalized.startsWith(key)).sort((a, b) => b.length - a.length)[0] ?? null;
  if (!tableKey && ['sonnet', 'opus', 'haiku'].includes(normalized)) tableKey = 'claude-' + normalized;
  let matchKind: 'exact' | 'family-estimate' | 'unknown' = tableKey === null ? 'unknown'
    : tableKey === normalized && !tableKey.includes('claude') ? 'exact' : 'family-estimate';
  let rate = tableKey === null ? null : MODEL_PRICES[tableKey]!;
  let source = 'MODEL_PRICES static snapshot';
  const prices = record(row['prices']) ? row['prices'] : null;
  const matches = prices && record(prices['matches']) ? prices['matches'] : null;
  const table = prices && record(prices['table']) ? prices['table'] : null;
  if (prices) {
    // Never silently reprice a historical snapshot using today's table or its alias spelling.
    rate = null; matchKind = 'unknown'; tableKey = null; source = 'persisted snapshot lacking applicable match provenance';
    for (const alias of [model, text(row['coder']), text(row['reviewer'])]) {
      if (!alias || !model || !table || !matches || !record(table[alias]) || !record(matches[alias])) continue;
      const aliasModel = parseModelSpec(alias)?.model ?? alias;
      if (aliasModel !== model) continue;
      const proposed = table[alias]; const match = matches[alias];
      const key = text(match['tableKey']); const kind = match['kind'];
      if (key === null || !['exact', 'family-estimate'].includes(String(kind))) continue;
      if (kind === 'exact' && (key !== model || key.includes('claude'))) continue;
      if (kind === 'family-estimate' && !(normalized.startsWith(key) || ('claude-' + normalized).startsWith(key))) continue;
      if (['prompt', 'completion', 'cachedInput', 'cacheCreation'].every((field) => typeof proposed[field] === 'number' && Number.isFinite(proposed[field]) && (proposed[field] as number) >= 0)) {
        rate = proposed as unknown as NonNullable<typeof rate>; matchKind = kind as 'exact' | 'family-estimate'; tableKey = key; source = 'persisted declared ' + matchKind + ' snapshot'; break;
      }
    }
  }
  const { tokensIn: input, tokensOut: output, tokensCacheRead: read, tokensCacheWrite: write } = dimensions;
  const semantics = row['inputCacheSemantics'];
  let amount: number | null = null;
  if (rate && input !== null && output !== null && read !== null && write !== null) {
    const plainInput = semantics === 'includes-cache-read-write' ? input - read - write
      : semantics === 'excludes-cache-read-write' ? input : null;
    if (plainInput !== null && plainInput >= 0) amount = plainInput * rate.prompt + output * rate.completion + read * rate.cachedInput + write * rate.cacheCreation;
  }
  if (amount !== null && (!Number.isFinite(amount) || (Array.isArray(row['usageDiagnostics']) && row['usageDiagnostics'].some((v) => typeof v === 'string' && /invalid|mismatch|conflict|exceeds|overflow/.test(v))))) amount = null;
  return { estimatedCostUsd: matchKind === 'exact' ? amount : null, familyEstimatedCostUsd: matchKind === 'family-estimate' ? amount : null,
    pricingKnown: matchKind === 'exact' && amount !== null,
    pricingReason: matchKind === 'unknown' ? 'unknown-model-rate' : amount === null ? 'incomplete-priceable-mix' : matchKind === 'family-estimate' ? 'family-rate-is-not-exact-model' : null,
    priceMatch: { tableKey, matchKind, source, version: text(prices?.['version']) ?? (prices ? 'persisted-version-not-recorded' : 'MODEL_PRICES-unversioned'),
      capturedAt: text(prices?.['snapshotAt']), fingerprint: fnv1a64(JSON.stringify(prices ?? MODEL_PRICES)), current: false, billed: false } };
}

type RoutingInput = Parameters<typeof buildStageUsageReport>[0];
type RoutingAttempt = { ordinal: number; model: string | null; family: 'openai' | 'claude'; wrapperInvoked: boolean;
  outcome: 'answered' | 'failed' | 'rejected'; reason: string; selected: boolean };
type RoutingStage = { evidenceKey: string; dispatchSeq: number; plannedModel: string | null;
  plannedModelSource: 'plan-declared' | 'plan-omitted' | 'unavailable' | 'not-recorded'; requestedModel: string | null;
  probeId: string | null; linkStatus: string };
type RoutingProbe = { probeId: string; runId: string; family: 'openai' | 'claude'; source: string;
  selectedModel: string | null; complete: boolean; totalConsidered: number; attempts: RoutingAttempt[] };
const safeRoutingModel = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value);
const routingId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
const routingRun = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,128}$/.test(value) && value !== '.' && value !== '..';
const routingFamily = (value: unknown): value is 'openai' | 'claude' => value === 'openai' || value === 'claude';
const exactRoutingKeys = (value: unknown, keys: readonly string[]): value is RecordRow => record(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  && Reflect.ownKeys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const routingAbsenceReasons = ['producer-not-recorded', 'id-factory-missing'];
const routingErrorReasons = ['id-factory-invalid', 'provenance-invalid', 'candidate-model-invalid', 'wrapper-result-invalid', 'selected-model-invalid'];

function validateRoutingAttempts(value: unknown, family: unknown, selectedModel: unknown): { complete: boolean; totalConsidered: number; attempts: RoutingAttempt[] } | null {
  if (!exactRoutingKeys(value, ['schema', 'complete', 'totalConsidered', 'attempts']) || value['schema'] !== 'wf-probe-attempts-1'
    || typeof value['complete'] !== 'boolean' || !routingFamily(family) || (selectedModel !== null && !safeRoutingModel(selectedModel))) return null;
  const total = count(value['totalConsidered']);
  const attempts = value['attempts'];
  if (total === null || total === 0 || !Array.isArray(attempts) || attempts.length !== Math.min(total, 32) || value['complete'] !== (total <= 32)) return null;
  const safe: RoutingAttempt[] = [];
  for (const [index, a] of attempts.entries()) {
    if (!exactRoutingKeys(a, ['ordinal', 'model', 'family', 'wrapperInvoked', 'outcome', 'reason', 'selected']) || a['ordinal'] !== index + 1
      || a['family'] !== family || typeof a['wrapperInvoked'] !== 'boolean' || typeof a['selected'] !== 'boolean') return null;
    const rejected = family === 'claude' && !a['wrapperInvoked'] && !a['selected'] && a['model'] === null && a['outcome'] === 'rejected' && a['reason'] === 'invalid-candidate';
    const answered = a['wrapperInvoked'] && a['selected'] && safeRoutingModel(a['model']) && a['outcome'] === 'answered' && a['reason'] === 'answered';
    const failed = a['wrapperInvoked'] && !a['selected'] && safeRoutingModel(a['model']) && a['outcome'] === 'failed'
      && ['timeout', 'spawn-error', 'no-exit-code', 'exit-nonzero', 'unexpected-response'].includes(a['reason'] as string);
    if (!(rejected || answered || failed)) return null;
    safe.push({ ordinal: index + 1, model: a['model'] as string | null, family, wrapperInvoked: a['wrapperInvoked'],
      outcome: a['outcome'] as RoutingAttempt['outcome'], reason: a['reason'] as string, selected: a['selected'] });
  }
  const selected = safe.filter(a => a.selected);
  if (!value['complete'] ? selected.length !== 0 : selectedModel === null ? selected.length !== 0
    : selected.length !== 1 || selected[0]?.ordinal !== total || selected[0]?.model !== selectedModel) return null;
  return { complete: value['complete'], totalConsidered: total, attempts: safe };
}

function routingStageIdentity(row: RecordRow): { evidenceKey: string; dispatchSeq: number } | null {
  const seq = count(row['dispatchSeq']);
  if (seq === null || seq === 0 || !routingRun(row['runId'])) return null;
  const evidenceKey = JSON.stringify(['wf-dispatch', row['runId'], seq]);
  if (Object.hasOwn(row, 'evidenceKey') && row['evidenceKey'] !== evidenceKey) return null;
  return { evidenceKey, dispatchSeq: seq };
}

/** Routing uses raw bounded evidence, independently of numerical first-wins normalization. */
function projectRoutingProvenance(input: RoutingInput) {
  const diagnostics = new Set<string>();
  let defect = false;
  let partial = false;
  let scopeInvalid = false;
  let scopeIncomplete = false;
  const mark = (reason: string, severity: 'defect' | 'partial' = 'partial') => {
    diagnostics.add(reason);
    if (severity === 'defect') defect = true; else partial = true;
  };
  const metadataInvalid = (reason = 'metadata-invalid') => mark(reason, 'defect');
  const sourceMap: Record<string, [string, 'defect' | 'partial']> = {
    'inventory-truncated': ['source-truncated', 'partial'], 'source-input-too-large': ['source-too-large', 'partial'],
    'missing-or-unreadable-source': ['source-unreadable', 'partial'], 'malformed-record': ['source-malformed', 'defect'],
    'malformed-budget-schema': ['source-malformed', 'defect'],
    'inventory-run-state-unavailable-or-foreign': ['source-scope-incomplete', 'partial'],
    'inventory-trace-binding-unavailable': ['source-scope-incomplete', 'partial'],
  };
  const invalidSources = ['source-outside-root-or-nonregular', 'source-symlink', 'source-changed-during-read',
    'inventory-trace-binding-mismatch', 'inventory-trace-invalid', 'inventory-workflow-projection-identity-invalid',
    'inventory-workflow-projection-identity-mismatch', 'foreign-project-root', 'foreign-trace-run', 'unknown-source',
    'source-selection-ambiguous', 'source-selection-conflicting-run-dir', 'workflow-source-missing-or-ambiguous', 'fa-run-selection-ambiguous-or-unidentified'];
  for (const diagnostic of input.diagnostics ?? []) {
    if (typeof diagnostic !== 'string' || diagnostic.length === 0) continue;
    const name = diagnostic.split(':', 1)[0]!;
    const mapping = invalidSources.includes(name) ? ['source-scope-invalid', 'defect'] as const : sourceMap[name];
    if (mapping) { mark(mapping[0], mapping[1]); scopeInvalid ||= mapping[0] === 'source-scope-invalid'; scopeIncomplete ||= mapping[1] === 'partial'; }
    else { mark('source-diagnostic-unmapped'); scopeIncomplete = true; }
  }
  const maximum = input.maxRecords ?? 100000;
  if (input.rows.length > maximum || (input.expected?.length ?? 0) > maximum) { mark('source-truncated'); scopeIncomplete = true; }
  const rawRows = input.rows.slice(0, maximum);
  const invalidNormalizedKeys = new Set<string>();
  const stageMaps = new Map<string, { raw: RecordRow; tuple: string; conflict: boolean; legacy: boolean; valid: boolean; modelInvalid: boolean }>();
  const probeMaps = new Map<string, { raw: RecordRow; tuple: string; conflict: boolean; valid: boolean; reason: string | null; summary: RoutingProbe | null }>();
  let hasNew = false;
  let hasLegacy = false;
  if (input.sourceKind === 'workflow-budget') {
    if (!routingRun(input.runId)) { mark('source-scope-invalid', 'defect'); scopeInvalid = true; }
    if (input.expected === undefined) { mark('source-scope-incomplete'); scopeIncomplete = true; }
    for (const raw of rawRows) {
      if (raw['kind'] === 'probe') {
        const keys = ['probeId', 'probeProvenance', 'probeSource', 'probeObservationReason'];
        const present = keys.map(key => Object.hasOwn(raw, key));
        if (present.every(value => !value)) { hasLegacy ||= raw['runId'] === input.runId; continue; }
        hasNew ||= raw['runId'] === input.runId;
        const reason = raw['probeObservationReason'];
        const modelValid = raw['model'] === null || safeRoutingModel(raw['model']);
        const reasonValid = reason === null || (typeof reason === 'string' && [...routingAbsenceReasons, ...routingErrorReasons].includes(reason));
        const idValid = raw['probeId'] === null || routingId(raw['probeId']);
        const sourceValid = raw['probeSource'] === 'dispatcher-child-seam' || raw['probeSource'] === 'scripted-dispatcher';
        const provenance = reason === null ? validateRoutingAttempts(raw['probeProvenance'], raw['family'], raw['model']) : null;
        const valid = present.every(Boolean) && routingRun(raw['runId']) && routingFamily(raw['family']) && idValid && sourceValid && modelValid && reasonValid
          && (reason === null ? routingId(raw['probeId']) && provenance !== null : raw['probeProvenance'] === null);
        const supplied = raw['probeProvenance'];
        const unsafeAttemptModel = record(supplied) && Array.isArray(supplied['attempts']) && supplied['attempts'].slice(0, 32).some(a => record(a)
          && Object.hasOwn(a, 'model') && a['model'] !== null && !safeRoutingModel(a['model']));
        if (!valid) metadataInvalid(modelValid && !unsafeAttemptModel ? 'metadata-invalid' : 'model-invalid');
        else if (typeof reason === 'string') mark(reason, routingErrorReasons.includes(reason) ? 'defect' : 'partial');
        else if (provenance && !provenance.complete) mark('attempts-truncated');
        if (!routingId(raw['probeId'])) continue;
        const summary: RoutingProbe | null = valid && reason === null && provenance !== null ? {
          probeId: raw['probeId'], runId: raw['runId'] as string, family: raw['family'] as RoutingProbe['family'], source: raw['probeSource'] as string,
          selectedModel: raw['model'] as string | null, complete: provenance.complete, totalConsidered: provenance.totalConsidered, attempts: provenance.attempts,
        } : null;
        // Rejected metadata is one closed marker: never traverse, copy or stringify its raw payload.
        const tuple = JSON.stringify(valid
          ? ['valid', raw['runId'], raw['family'], raw['model'], raw['probeSource'], reason, provenance]
          : ['invalid']);
        const old = probeMaps.get(raw['probeId']);
        if (old && old.tuple !== tuple) { old.conflict = true; metadataInvalid('identity-conflict'); }
        else if (!old) probeMaps.set(raw['probeId'], { raw, tuple, conflict: false, valid, reason: typeof reason === 'string' ? reason : null, summary });
      } else if (raw['kind'] === 'stage') {
        const identity = routingStageIdentity(raw);
        if (!identity || raw['runId'] !== input.runId) {
          metadataInvalid();
          const key = text(raw['evidenceKey']) ?? (count(raw['dispatchSeq']) !== null ? JSON.stringify(['wf-dispatch', raw['runId'], raw['dispatchSeq']]) : null);
          if (key !== null) invalidNormalizedKeys.add(key);
          continue;
        }
        const keys = ['plannedModel', 'plannedModelSource', 'probeId'];
        const present = keys.map(key => Object.hasOwn(raw, key));
        const legacy = present.every(value => !value);
        hasLegacy ||= legacy; hasNew ||= !legacy;
        const plan = raw['plannedModel'];
        const source = raw['plannedModelSource'];
        const requestValid = raw['requestedModel'] === null || safeRoutingModel(raw['requestedModel']);
        const planValid = source === 'plan-declared' ? safeRoutingModel(plan) : (source === 'plan-omitted' || source === 'unavailable') && plan === null;
        const valid = legacy || present.every(Boolean) && requestValid && planValid && routingFamily(raw['family']) && (raw['probeId'] === null || routingId(raw['probeId']));
        const modelInvalid = !legacy && (!requestValid || (source === 'plan-declared' && !safeRoutingModel(plan)) || source === 'unavailable');
        if (!valid || modelInvalid) metadataInvalid(modelInvalid ? 'model-invalid' : 'metadata-invalid');
        const tuple = JSON.stringify(legacy
          ? ['legacy', routingFamily(raw['family']) ? raw['family'] : null, safeRoutingModel(raw['requestedModel']) ? raw['requestedModel'] : null]
          : valid ? ['valid', raw['family'], raw['requestedModel'], plan, source, raw['probeId']] : ['invalid']);
        const old = stageMaps.get(identity.evidenceKey);
        if (old && old.tuple !== tuple) { old.conflict = true; metadataInvalid('identity-conflict'); }
        else if (!old) stageMaps.set(identity.evidenceKey, { raw, tuple, conflict: false, legacy, valid, modelInvalid });
      } else metadataInvalid();
    }
    for (const expected of (input.expected ?? []).slice(0, maximum)) {
      const identity = routingStageIdentity(expected);
      if (!identity || expected['runId'] !== input.runId) { metadataInvalid(); continue; }
      if (!stageMaps.has(identity.evidenceKey)) { mark('expected-dispatch-missing'); scopeIncomplete = true; }
    }
  }
  if (hasNew && hasLegacy) mark('not-recorded');
  const stages: RoutingStage[] = [];
  for (const [evidenceKey, stage] of [...stageMaps].sort(([a], [b]) => a.localeCompare(b))) {
    const raw = stage.raw;
    const referenced = routingId(raw['probeId']) ? probeMaps.get(raw['probeId']) : undefined;
    let linkStatus = 'linked';
    if (stage.conflict || referenced?.conflict) linkStatus = 'identity-conflict';
    else if (scopeInvalid || !stage.valid || stage.modelInvalid || referenced && (!referenced.valid || referenced.reason !== null && routingErrorReasons.includes(referenced.reason))) linkStatus = 'invalid';
    else if (stage.legacy) linkStatus = 'not-recorded';
    else if (referenced && referenced.raw['runId'] !== input.runId) linkStatus = 'foreign-probe';
    else if (referenced && referenced.raw['family'] !== raw['family']) linkStatus = 'family-mismatch';
    else if (referenced?.summary && (referenced.summary.selectedModel === null || referenced.summary.selectedModel !== raw['requestedModel'])) linkStatus = 'selection-mismatch';
    else if (raw['probeId'] !== null && !referenced) linkStatus = 'missing-probe';
    else if (raw['probeId'] === null || referenced?.reason !== null && referenced?.reason !== undefined) linkStatus = 'probe-unavailable';
    else if (scopeIncomplete) linkStatus = 'scope-incomplete';
    const suppress = ['identity-conflict', 'invalid', 'foreign-probe', 'family-mismatch', 'selection-mismatch'].includes(linkStatus);
    if (suppress) metadataInvalid(linkStatus === 'invalid' ? 'metadata-invalid' : linkStatus);
    else if (linkStatus !== 'linked' && linkStatus !== 'not-recorded') mark(linkStatus === 'scope-incomplete' ? 'source-scope-incomplete' : linkStatus);
    const identity = routingStageIdentity(raw)!;
    stages.push({ evidenceKey, dispatchSeq: identity.dispatchSeq, plannedModel: suppress || stage.legacy ? null : raw['plannedModel'] as string | null,
      plannedModelSource: suppress ? 'unavailable' : stage.legacy ? 'not-recorded' : raw['plannedModelSource'] as RoutingStage['plannedModelSource'],
      requestedModel: suppress || stage.legacy ? null : raw['requestedModel'] as string | null,
      probeId: !suppress && (linkStatus === 'linked' || linkStatus === 'scope-incomplete') ? raw['probeId'] as string : null, linkStatus });
  }
  const probes = [...probeMaps.values()].filter(probe => !scopeInvalid && !probe.conflict && probe.summary && probe.raw['runId'] === input.runId)
    .map(probe => probe.summary!).sort((a, b) => a.probeId.localeCompare(b.probeId));
  if (!hasNew) diagnostics.add('not-recorded');
  const status = defect ? 'defect' : partial ? 'partial' : hasNew ? 'observed' : 'not-recorded';
  const exposedStages = hasNew || defect ? stages : [];
  const stageFields = new Map(stages.map(stage => [stage.evidenceKey, {
    plannedModel: stage.plannedModel, plannedModelSource: stage.plannedModelSource, probeId: stage.probeId,
  }]));
  for (const key of invalidNormalizedKeys) stageFields.set(key, { plannedModel: null, plannedModelSource: 'unavailable', probeId: null });
  return { report: { schema: 'routing-provenance-1', status, probes: probes.length ? probes : null,
    stages: exposedStages.length ? exposedStages : null, diagnostics: [...diagnostics].sort() }, stageFields };
}

/** All amounts remain source-specific; inventory never substitutes for a numeric witness. */
export function buildStageUsageReport(input: {
  sourceKind: string; sourcePath: string; runId: string | null; rows: readonly RecordRow[];
  expected?: readonly RecordRow[]; witnesses?: readonly RecordRow[]; moneyObservations?: readonly RecordRow[];
  diagnostics?: readonly string[]; sourceDiagnostics?: readonly string[]; maxRecords?: number;
}) {
  const diagnostics = [...(input.diagnostics ?? [])]; const sourceDiagnostics = [...(input.sourceDiagnostics ?? [])];
  const maximum = input.maxRecords ?? 100000;
  if (input.rows.length > maximum) diagnostics.push('inventory-truncated');
  const originalKeys = new Set(input.rows.map((v) => text(v['evidenceKey']) ?? (count(v['dispatchSeq']) !== null ? JSON.stringify(['wf-dispatch', v['runId'], v['dispatchSeq']]) : null)));
  const witnessOnly: RecordRow[] = (input.witnesses ?? []).filter((v) => !originalKeys.has(text(v['evidenceKey']))).map((v) => ({ ...v, runId: input.runId, stage: null, phase: null, stepId: null, unassignedSource: true }));
  const normalized = [...input.rows, ...witnessOnly].slice(0, maximum).map((raw, index) => {
    const identity = resolveLedgerModelProvenance(raw);
    const { model, family } = identity;
    diagnostics.push(...identity.diagnostics);
    const phase = text(raw['phase']);
    const stage = input.sourceKind === 'workflow-budget' ? phase ?? text(raw['stage']) ?? text(raw['stepId']) : text(raw['stage']) ?? phase ?? text(raw['stepId']);
    const dimensions = Object.fromEntries(tokenFields.map((key) => [key, count(raw[key])])) as Record<typeof tokenFields[number], number | null>;
    if (raw['tokensTotal'] === undefined && raw['tokens'] !== undefined) dimensions.tokensTotal = count(raw['tokens']);
    for (const key of tokenFields) if (raw[key] != null && count(raw[key]) === null) diagnostics.push('invalid-count:' + index + ':' + key);
    const dispatchSeq = count(raw['dispatchSeq']);
    const evidenceKey = text(raw['evidenceKey']) ?? (input.sourceKind === 'workflow-budget' && dispatchSeq !== null
      ? JSON.stringify(['wf-dispatch', raw['runId'], dispatchSeq]) : null);
    const metadata = { phase, role: text(raw['role']), attempt: count(raw['attempt']), dispatchSeq, itemKey: text(raw['itemKey']),
      stepId: text(raw['stepId']), tier: text(raw['tier']), mode: text(raw['mode']) };
    const missingReasons = Object.entries({ model, family, stage, evidenceKey, ...metadata }).filter(([, value]) => value === null).map(([key]) => key + ':not-recorded');
    const basis = text(raw['reportedTotalBasis']) ?? (raw['tokensOutSource'] === 'budget.spent' ? 'output-only' : 'unknown');
    const priced = price({ ...raw, model, usageDiagnostics: [...(Array.isArray(raw['usageDiagnostics']) ? raw['usageDiagnostics'] : []), ...identity.diagnostics] }, dimensions);
    const reportedCostUsd = typeof raw['reportedCostUsd'] === 'number' && Number.isFinite(raw['reportedCostUsd']) && raw['reportedCostUsd'] >= 0 ? raw['reportedCostUsd'] : null;
    const usageDiagnostics = Array.isArray(raw['usageDiagnostics']) ? raw['usageDiagnostics'].filter((v): v is string => typeof v === 'string') : [];
    diagnostics.push(...usageDiagnostics.map((v) => 'usage:' + v));
    const rawSource = record(raw['usageSource']) ? raw['usageSource'] : null;
    const usageSource = rawSource ? Object.fromEntries(['schema', 'scope', 'threadId', 'turnId', 'receiptId'].map((key) => [key, text(rawSource[key])])) : null;
    const estimate = record(raw['estimate']) ? { tokens: count(raw['estimate']['tokens']),
      costUsd: typeof raw['estimate']['costUsd'] === 'number' && Number.isFinite(raw['estimate']['costUsd']) ? raw['estimate']['costUsd'] : null,
      method: text(raw['estimate']['method']), source: text(raw['estimate']['source']), capturedAt: text(raw['estimate']['capturedAt']) } : null;
    return { sourceKind: input.sourceKind, evidenceKey, runId: text(raw['runId']), stage, stageCanonical: canonicalStage(stage ?? '').stage,
      model, family, modelProvenance: identity.modelProvenance, requestedModel: text(raw['requestedModel']), totalDerivation: text(raw['totalDerivation']) ?? 'not-recorded', ...metadata, ...dimensions, reportedTotalBasis: basis, inputCacheSemantics: text(raw['inputCacheSemantics']) ?? 'unknown',
      usageSource, reportedCostUsd, billedCostUsd: null, billedCostReason: 'not-observed',
      estimate, estimateReason: estimate === null ? 'not-recorded' : null,
      ...priced, missingReasons, outcome: text(raw['outcome']), usageDiagnostics, unassignedSource: raw['unassignedSource'] === true };
  });
  type Normalized = typeof normalized[number];
  const unique = new Map<string, Normalized>(); const owners = new Map<string, Set<string>>(); const conflicts = new Set<string>();
  const unkeyed: Normalized[] = [];
  const payload = (row: Normalized) => JSON.stringify([row.model, row.family, ...tokenFields.map((k) => row[k]), row.reportedTotalBasis, row.inputCacheSemantics, row.reportedCostUsd]);
  for (const row of normalized) {
    if (input.runId !== null && row.runId !== input.runId) { diagnostics.push('foreign-run'); continue; }
    if (row.evidenceKey === null) { diagnostics.push('missing-evidence-identity'); unkeyed.push(row); continue; }
    const prior = unique.get(row.evidenceKey);
    if (prior && payload(prior) !== payload(row)) { conflicts.add(row.evidenceKey); diagnostics.push('conflicting-duplicate:' + row.evidenceKey); }
    else unique.set(row.evidenceKey, prior ?? row);
    const claim = JSON.stringify([row.stage, row.attempt, row.stepId, row.itemKey, row.role]);
    const set = owners.get(row.evidenceKey) ?? new Set<string>(); set.add(claim); owners.set(row.evidenceKey, set);
  }
  const expected = input.expected === undefined ? null : new Map(input.expected.map((v) => [text(v['evidenceKey']) ?? JSON.stringify(['wf-dispatch', v['runId'], v['dispatchSeq']]), v]));
  const rows = [...unique.values()].filter((row) => {
    if (expected && !expected.has(row.evidenceKey!)) { diagnostics.push('foreign-evidence:' + row.evidenceKey); return false; }
    const trace = expected?.get(row.evidenceKey!);
    if (trace) for (const key of ['runId', 'stepId', 'itemKey', 'attempt', 'model', 'phase'] as const) {
      if (trace[key] != null && trace[key] !== (key === 'model' ? (row.requestedModel ?? row.model) : row[key])) diagnostics.push('inventory-identity-mismatch:' + key);
    }
    return !conflicts.has(row.evidenceKey!);
  }).concat(unkeyed);
  const sum = (values: readonly number[]): number | null => {
    const total = values.reduce((n, v) => n + v, 0); if (!Number.isSafeInteger(total)) { diagnostics.push('aggregate-overflow'); return null; } return total;
  };
  const bases = [...new Set(rows.filter((row) => row.tokensTotal !== null).map((row) => row.reportedTotalBasis))];
  const compatible = bases.length <= 1;
  if (!compatible) diagnostics.push('incompatible-total-bases');
  const metric = bases[0] === 'raw-inclusive' ? 'raw-tokens' : bases[0] === 'uncached-display' ? 'uncached-display-tokens' : bases[0] === 'weighted-input-equivalent' ? 'weighted-input-equivalent' : 'source-reported-total';
  const known = compatible ? sum(rows.map((row) => row.tokensTotal).filter((v): v is number => v !== null)) : null;
  const expectedMissing = expected ? [...expected.keys()].filter((key) => !originalKeys.has(key) || conflicts.has(key)) : [];
  const missingTotals = rows.filter((row) => row.tokensTotal === null).length + expectedMissing.length;
  const inventoryComplete = expected !== null && expectedMissing.length === 0 && unkeyed.length === 0
    && !diagnostics.some((d) => /inventory|foreign|malformed|truncated|unreadable|missing-source/.test(d));
  const witnesses = new Map((input.witnesses ?? []).map((v) => [text(v['evidenceKey']), v]));
  let witnessComplete = rows.length > 0 && rows.every((row) => row.evidenceKey !== null && witnesses.has(row.evidenceKey));
  for (const row of rows) {
    const witness = witnesses.get(row.evidenceKey); if (!witness) continue;
    if (count(witness['tokensTotal']) !== row.tokensTotal || witness['reportedTotalBasis'] !== row.reportedTotalBasis) sourceDiagnostics.push('source-amount-mismatch:' + row.evidenceKey);
  }
  if (sourceDiagnostics.length) witnessComplete = false;
  const sourceVerification = { status: sourceDiagnostics.length ? 'defect' : witnessComplete ? 'verified' : 'unavailable', diagnostics: sourceDiagnostics,
    reason: witnessComplete ? null : sourceDiagnostics.length ? 'source-conflict' : 'no-independent-same-scope-amount-witness' };
  const accounted = compatible ? sum(rows.filter((row) => row.stage !== null).map((row) => row.tokensTotal).filter((v): v is number => v !== null)) : null;
  const unaccounted = compatible && known !== null && accounted !== null ? known - accounted : null;
  const doubled = compatible ? sum(rows.map((row) => (owners.get(row.evidenceKey ?? '')?.size ?? 1) > 1 ? (row.tokensTotal ?? 0) : 0)) : null;
  if (doubled !== null && doubled > 0) diagnostics.push('double-attribution');
  // Monetary scope is independent of token expansion: never allocate a parent amount to responses.
  const moneyInputs = input.moneyObservations ?? rows.map((row) => ({ id: row.evidenceKey,
    runId: row.runId, scope: JSON.stringify([input.sourceKind, row.runId, row.evidenceKey]), basis: 'provider-reported', amount: row.reportedCostUsd }));
  const money = new Map<string, { id: string; runId: string | null; scope: string; basis: string; amount: number | null }>();
  const moneyConflicts = new Set<string>(); let moneyUnknown = moneyInputs.length === 0;
  for (const raw of moneyInputs.slice(0, maximum)) {
    const id = text(raw['id']); const scope = text(raw['scope']); const basis = text(raw['basis']); const runId = text(raw['runId']);
    if (input.runId !== null && runId !== input.runId) { diagnostics.push('money-foreign-run'); moneyUnknown = true; continue; }
    const amount = typeof raw['amount'] === 'number' && Number.isFinite(raw['amount']) && raw['amount'] >= 0 ? raw['amount'] : null;
    if (raw['amount'] != null && amount === null) diagnostics.push('money-invalid-amount');
    if (!id || !scope || !basis) { diagnostics.push('money-identity-unavailable'); moneyUnknown = true; continue; }
    const observation = { id, runId, scope, basis, amount }; const prior = money.get(id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(observation)) { diagnostics.push('money-conflict:' + id); moneyConflicts.add(id); }
    else money.set(id, prior ?? observation);
  }
  if (moneyInputs.length > maximum) { diagnostics.push('money-inventory-truncated'); moneyUnknown = true; }
  const moneyObservations = [...money.values()].filter((v) => !moneyConflicts.has(v.id));
  moneyUnknown ||= moneyObservations.some((v) => v.amount === null);
  const knownReported = moneyObservations.reduce((n, v) => n + (v.amount ?? 0), 0);
  if (!Number.isFinite(knownReported)) { diagnostics.push('money-overflow'); moneyUnknown = true; }
  const moneyDefect = diagnostics.some((d) => /^money-(conflict|foreign|invalid|overflow)/.test(d));
  const reportedCostCoverage = { status: moneyDefect ? 'defect' : moneyUnknown ? 'unavailable' : 'complete',
    reason: moneyDefect ? 'conflicting-or-invalid-money-observation' : moneyUnknown ? 'reported-money-or-scope-not-recorded' : null };
  const quantitativeDefect = diagnostics.some((d) => /conflict|foreign|mismatch|invalid|overflow|double-attribution|malformed|exceeds|cumulative-reset/.test(d)) || sourceDiagnostics.length > 0;
  const totalComplete = compatible && missingTotals === 0 && inventoryComplete && rows.length > 0 && !quantitativeDefect;
  const moneySum = (values: readonly number[]): number | null => { const total = values.reduce((n,v) => n + v, 0); return Number.isFinite(total) ? total : null; };
  const knownEstimated = moneySum(rows.map((r) => r.estimatedCostUsd).filter((n): n is number => n !== null));
  const pricingComplete = rows.length > 0 && rows.every((r) => r.pricingKnown) && totalComplete;
  const conservation = { status: quantitativeDefect ? 'DEFECT' : totalComplete ? 'BALANCED' : 'INSUFFICIENT_DATA', scope: 'reported receipt attribution; not independent source verification', metric };
  const dimensionCoverage = Object.fromEntries(tokenFields.map((key) => [key, { known: rows.filter((r) => r[key] !== null).length, unknown: rows.filter((r) => r[key] === null).length + expectedMissing.length }]));
  const routing = projectRoutingProvenance(input);
  return { routingProvenance: routing.report, schema: 'stage-usage-1', sourceKind: input.sourceKind, sourcePath: input.sourcePath, runId: input.runId, metric: compatible ? metric : 'incompatible-metrics',
    rows: rows.map(row => ({ ...row, ...(routing.stageFields.get(row.evidenceKey ?? '') ?? { plannedModel: null, plannedModelSource: 'not-recorded', probeId: null }) })), verdict: conservation.status, complete: totalComplete && witnessComplete && pricingComplete,
    knownRunTotalTokens: known, knownAccountedTokens: accounted, knownUnaccountedTokens: unaccounted,
    stageTokensSum: accounted !== null && doubled !== null ? accounted + doubled : null, doubleAttributedTokens: doubled,
    runTotalTokens: totalComplete ? known : null, sourceVerifiedTotalTokens: witnessComplete && totalComplete ? known : null,
    conservation, reconciliation: conservation, inventory: { status: inventoryComplete ? 'complete' : expected === null ? 'unavailable' : 'incomplete', expected: expected?.size ?? null, missing: expectedMissing, observed: rows.length },
    sourceVerification, dimensionCoverage, pricingCoverage: { complete: pricingComplete, unknown: rows.filter((r) => !r.pricingKnown).length },
    estimatedCostUsd: pricingComplete ? knownEstimated : null, knownEstimatedCostUsd: knownEstimated,
    familyEstimatedCostUsd: rows.length > 0 && rows.every((r) => r.familyEstimatedCostUsd !== null) ? moneySum(rows.map((r) => r.familyEstimatedCostUsd!)) : null,
    knownFamilyEstimatedCostUsd: moneySum(rows.map((r) => r.familyEstimatedCostUsd).filter((v): v is number => v !== null)),
    moneyObservations, reportedCostCoverage, knownReportedCostUsd: Number.isFinite(knownReported) ? knownReported : null,
    reportedCostUsd: reportedCostCoverage.status === 'complete' ? knownReported : null,
    billedCostUsd: null, billedCostReason: 'not-observed', diagnostics: [...new Set(diagnostics)],
    metrics: Object.fromEntries(bases.map((basis) => [basis, { knownSubtotal: sum(rows.filter((r) => r.reportedTotalBasis === basis).map((r) => r.tokensTotal).filter((v): v is number => v !== null)) }])),
    scope: 'observed local receipts; static estimates are not current prices or billed amounts' };
}
