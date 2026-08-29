'use strict';
// ha-ca1 ACL — the SOLE call site of the UNDOCUMENTED registry-history endpoint (ADR-004; the
// /api/int/ URL below appears in exactly this one file — grepped by the suite). Exports
// readHistory() -> HistoryProjection and NO predicate (AM-13): this file contains no date
// comparison of any kind; the comparison lives in the shared kernel, lib/registry-edit-timing.js.
//
// Shape canary (ADR-004): the four top-level keys are asserted with expected types BEFORE
// translating. A mismatch or a non-2xx answer degrades to {available:false, reason:
// 'endpoint-unavailable', observedKeys} — NEVER a throw. Losing this endpoint costs 1 of 6
// domains and nothing else.

const HISTORY_ENDPOINT_TEMPLATE = 'https://clinicaltrials.gov/api/int/studies/{nct}/history';

function historyUrlFor(nct) {
  return HISTORY_ENDPOINT_TEMPLATE.replace('{nct}', String(nct).toUpperCase());
}

function unavailable(observedKeys, detail) {
  return {
    available: false,
    reason: 'endpoint-unavailable',
    observedKeys: observedKeys || [],
    detail: detail || null,
  };
}

/** The canary — pure, exported so the projection of a FIXTURE goes through the same gate. */
function projectHistoryPayload(payload, sourceUrl) {
  if (!payload || typeof payload !== 'object') return unavailable([], 'non-object payload');
  const observedKeys = Object.keys(payload);
  if (!Array.isArray(payload.changes)) return unavailable(observedKeys, 'changes: not an array');
  if (!payload.originalData || typeof payload.originalData !== 'object') {
    return unavailable(observedKeys, 'originalData: not an object');
  }
  if (!payload.lastUpdateVersions || typeof payload.lastUpdateVersions !== 'object') {
    return unavailable(observedKeys, 'lastUpdateVersions: not an object');
  }
  if (typeof payload.outcomesUpdateCount !== 'number') {
    return unavailable(observedKeys, 'outcomesUpdateCount: not a number');
  }
  return {
    available: true,
    changes: payload.changes,
    originalData: payload.originalData,
    lastUpdateVersions: payload.lastUpdateVersions,
    outcomesUpdateCount: payload.outcomesUpdateCount,
    // the projection lib/registry-comparison.js's buildTimeline() reads as registry.history
    ok: true,
    changeDates: payload.changes
      .filter((c) => c && typeof c === 'object' && typeof c.date === 'string')
      .map((c) => ({ version_date: c.date, source_url: sourceUrl || null })),
  };
}

/**
 * readHistory(nct, {get}) -> HistoryProjection — a PROJECTION, never a predicate (AM-13), never a
 * verdict. `get` is the injected transport function; this module performs no I/O of its own.
 */
async function readHistory(nct, { get } = {}) {
  if (typeof get !== 'function') return unavailable([], 'no transport supplied');
  const url = historyUrlFor(nct);
  let obs;
  try {
    obs = await get(url);
  } catch (err) {
    return unavailable([], String(err && err.message ? err.message : err));
  }
  if (!obs || obs.answered !== true) {
    return unavailable([], obs && obs.detail ? obs.detail : 'unanswered');
  }
  let payload;
  try {
    payload = JSON.parse(obs.body);
  } catch {
    return unavailable([], 'body is not JSON');
  }
  return projectHistoryPayload(payload, url);
}

module.exports = { readHistory, projectHistoryPayload, historyUrlFor };
