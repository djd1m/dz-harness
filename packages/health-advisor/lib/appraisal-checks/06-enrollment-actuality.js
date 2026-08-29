'use strict';
// C6 — enrollment-reporting-fidelity. A COMPLETED/TERMINATED study still reporting an ESTIMATED
// enrollment count is a transparency fact about the record; a recruiting study with an ESTIMATED
// count is ordinary (check-not-applicable). Pure — no I/O, no clock.

const { isBundle, makeFinding } = require('../appraisal-core.js');

const DOMAIN = 'enrollment-reporting-fidelity';

const CLOSED_STATUSES = Object.freeze(['COMPLETED', 'TERMINATED']);

function unknownFinding(reason, detail) {
  return makeFinding({
    domain: DOMAIN,
    verdict: 'unknown',
    evidence: [{ quote: `${reason}: ${detail}`, locator: null }],
    refutable_by: 'an ACTUAL enrollment count in the registry record',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

function evaluate(bundle) {
  if (!isBundle(bundle)) return null;
  const reg = bundle.sources && bundle.sources.ctgovV2;
  if (!reg || reg.answered === false) {
    return unknownFinding('registry-record-absent', 'no trustworthy registry linkage resolved for this subject');
  }
  const info = reg.enrollmentInfo;
  if (!info || typeof info.type !== 'string') {
    return unknownFinding('field-absent', 'the registry record carries no enrollment type');
  }
  // CA-1 QE F4 — the closing `return no-concern` was the DEFAULT branch for every type that is not
  // 'ESTIMATED', so `type: 'UNKNOWN'` rendered "enrollment is recorded as UNKNOWN … no concern" —
  // a clean bill read off a field that says it does not know. Only the two values the registry
  // actually defines are assessable; anything else is unassessed, not clean.
  const status = reg.overallStatus;
  if (info.type !== 'ACTUAL' && info.type !== 'ESTIMATED') {
    return unknownFinding('field-not-recorded-as-actual',
      `the registry record reports the enrollment type as "${info.type}", which is neither ACTUAL nor ESTIMATED — the record does not say whether this count was observed`);
  }
  if (info.type === 'ESTIMATED') {
    if (CLOSED_STATUSES.includes(status)) {
      return makeFinding({
        domain: DOMAIN,
        verdict: 'concern',
        evidence: [{
          quote: `overall status is ${status} but the enrollment count (${info.count === null ? 'n/a' : info.count}) is still ESTIMATED — the record reports a plan for a study that has ended`,
          locator: reg.nctId ? `ctgov:${reg.nctId}` : 'ctgov-v2',
        }],
        refutable_by: 'a registry update recording the ACTUAL enrollment for this trial',
        tier: 'A',
        author_response_state: 'not-contacted',
      });
    }
    return unknownFinding('check-not-applicable',
      `the study status is ${status || '(absent)'} — an ESTIMATED count on an ongoing study is ordinary`);
  }
  return makeFinding({
    domain: DOMAIN,
    verdict: 'no-concern',
    evidence: [{
      quote: `enrollment is recorded as ${info.type} (${info.count === null ? 'n/a' : info.count}) with overall status ${status || '(absent)'}`,
      locator: reg.nctId ? `ctgov:${reg.nctId}` : 'ctgov-v2',
    }],
    refutable_by: 'a registry correction changing the enrollment type or count',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

module.exports = { domain: DOMAIN, evaluate };
