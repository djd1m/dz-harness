'use strict';
// ha-ca2-registry-vs-publication (ADR-001 + ADR-003's record) — the RegistryComparison record and
// its renderer. This module decides WHAT IS RENDERED; it computes NOTHING from the content of both
// sides at once (K-9 — the load-bearing prohibition, tested by T-5's pair invariance), and it never
// fetches (architecture §1.1d). The record is an adjacency, not a judgement.

const fs = require('node:fs');
const path = require('node:path');

const {
  NO_LINKAGE_DISCLOSURE,
  findUnsupportedRegistryTokens,
} = require('./registry-linkage.js');

// AM-9 / K-16 / ADR-004: the post-completion-edit predicate is IMPORTED, never declared here.
// `registry-edit-timing.js` is the shared kernel (Branch B of the §5.6 handoff table — CA-1 was
// measurably absent when this slice landed). The re-export below is BY REFERENCE, so
// owner.editAfterPrimaryCompletion === consumer.editAfterPrimaryCompletion holds (T-12 identity).
const {
  TIMELINE_KEYS,
  TIMING_COMPARISON,
  TIMELINE_UNKNOWN_REASONS,
  TIMING_DISCLOSURE,
  editAfterPrimaryCompletion,
  timingUnknownReason,
} = require('./registry-edit-timing.js');

const COMPARISON_KEYS = Object.freeze([
  'trial_id',
  'id_provenance',
  'registered_primary',
  'published_primary',
  'registry_timeline',
  'coverage',
  'unknown_reason',
]);

const COMPARISON_COVERAGE = Object.freeze([
  'both-retrieved',
  'registry-only',
  'article-only',
  'neither',
]);

const COMPARISON_UNKNOWN_REASONS = Object.freeze([
  'no-registry-linkage',
  'registry-not-consulted',
  'registry-unreachable',
  'registry-record-has-no-primary-outcome',
  'article-primary-outcome-not-extractable',
  'full-text-unavailable',
]);

// The two blocklists over OUR OWN generated wording (ADR-001 clause 6, ADR-003 clause 4). These are
// the banned-vocabulary DEFINITIONS — the one place these words may appear in this file.
const FORBIDDEN_COMPARISON_CONCLUSIONS = Object.freeze([
  'switched', 'swapped', 'substituted', 'outcome switching', 'mismatch', 'discrepancy',
  'undisclosed', 'concealed', 'failed to report',
]);

const FORBIDDEN_TIMING_INTENT = Object.freeze([
  'retrospectively changed', 'changed after seeing', 'post-hoc switch', 'moved the goalposts',
  'after unblinding',
]);

// ADR-001 §Decision clause 6 — one definition, rendered with every comparison surface.
const COMPARISON_DISCLOSURE =
  'These two texts are shown for your own comparison. This tool does not decide whether they ' +
  'describe the same outcome; wording routinely differs without an outcome having changed.';

// K-15 weak-evidence label — rendered whenever per-version history is unavailable.
const WEAK_EVIDENCE_LABEL =
  'per-version outcome history: not available — this dates the record\'s LAST edit, not an edit ' +
  'to the outcome field; the tool cannot tell from this data which field changed.';

// AM-11 / K-19 / architecture §5.2 clause 2 — the CA-1 vocabulary import, behind a PRESENCE PROBE,
// never a try/catch. If the file is present the require() runs UNGUARDED: a broken CA-1 throws
// loudly instead of being laundered into "absent" (err.code cannot tell the two apart for a thin
// re-export). Legitimate absence narrows the union AND marks the run incomplete (T-5.3 + T-14).
// G1 (QE re-check): the probe checks the CONTRACT, not just the file — a CA-1 that EXISTS but no
// longer exports FORBIDDEN_INTENT_TERMS as an array is a BROKEN contract and throws loudly here,
// never `complete: true` over a silently narrowed union (the fourth T-14 twin).
const CA1_CONTRACT = path.join(__dirname, 'appraisal.js');
let intentTerms = null;
let degraded_reason = null;
if (fs.existsSync(CA1_CONTRACT)) {
  ({ FORBIDDEN_INTENT_TERMS: intentTerms } = require(CA1_CONTRACT)); // UNGUARDED — must throw loudly
  if (!Array.isArray(intentTerms)) {
    throw new TypeError(
      `CA-1 contract violated: ${CA1_CONTRACT} exists but does not export FORBIDDEN_INTENT_TERMS `
      + 'as an array — refusing to report a complete vocabulary union over a silently narrowed one (G1)');
  }
} else {
  degraded_reason = 'ca1-appraisal-absent';
}
const VOCABULARY_SOURCE = Object.freeze({
  union: Object.freeze([
    ...FORBIDDEN_COMPARISON_CONCLUSIONS,
    ...FORBIDDEN_TIMING_INTENT,
    ...(intentTerms || []),
  ]),
  complete: intentTerms !== null,
  degraded_reason,
});

function verbatim(value) {
  return typeof value === 'string' ? value : null;
}

/** Registered primary outcomes, VERBATIM (K-7): no normalization, case-folding, whitespace
 *  collapsing or truncation — plus the locator pair source_url + retrieved_at (K-8). */
function extractRegisteredPrimary(registry) {
  if (!registry || typeof registry !== 'object' || registry.unreachable === true) return [];
  const source_url = verbatim(registry.source_url);
  const retrieved_at = verbatim(registry.retrieved_at);
  const raw = registry.raw;
  if (raw && raw.protocolSection) {
    const outcomes = (raw.protocolSection.outcomesModule
      && Array.isArray(raw.protocolSection.outcomesModule.primaryOutcomes))
      ? raw.protocolSection.outcomesModule.primaryOutcomes : [];
    return outcomes.map((o) => ({
      measure: verbatim(o.measure),
      time_frame: verbatim(o.timeFrame),
      description: verbatim(o.description),
      source_url,
      retrieved_at,
    }));
  }
  if (Array.isArray(registry.registered_primary)) {
    return registry.registered_primary.map((o) => ({
      measure: verbatim(o.measure),
      time_frame: verbatim(o.time_frame),
      description: verbatim(o.description),
      source_url: verbatim(o.source_url) || source_url,
      retrieved_at: verbatim(o.retrieved_at) || retrieved_at,
    }));
  }
  return [];
}

/** Published primary outcomes, VERBATIM with locator (K-7, K-8). */
function extractPublishedPrimary(article) {
  if (!article || typeof article !== 'object' || !Array.isArray(article.published_primary)) return [];
  return article.published_primary.map((o) => ({
    text: verbatim(o.text),
    locator: verbatim(o.locator),
  }));
}

function extractTimelineDates(registry) {
  const raw = registry && registry.raw;
  if (raw && raw.protocolSection && raw.protocolSection.statusModule) {
    const s = raw.protocolSection.statusModule;
    return {
      primary_completion_date: (s.primaryCompletionDateStruct && verbatim(s.primaryCompletionDateStruct.date)) || null,
      completion_date_type: (s.primaryCompletionDateStruct && verbatim(s.primaryCompletionDateStruct.type)) || null,
      record_first_posted: (s.studyFirstPostDateStruct && verbatim(s.studyFirstPostDateStruct.date)) || null,
      record_last_update_posted: (s.lastUpdatePostDateStruct && verbatim(s.lastUpdatePostDateStruct.date)) || null,
    };
  }
  const t = (registry && registry.timeline) || {};
  return {
    primary_completion_date: verbatim(t.primary_completion_date),
    completion_date_type: verbatim(t.completion_date_type),
    record_first_posted: verbatim(t.record_first_posted),
    record_last_update_posted: verbatim(t.record_last_update_posted),
  };
}

/** ADR-003's registry timeline. `primary_outcome_versions` comes from CA-1's readHistory() ACL
 *  ONLY (architecture §3.3) — this slice performs no history probe and ships null until CA-1 lands. */
function buildTimeline(registry) {
  const dates = extractTimelineDates(registry);
  const history = registry && registry.history;
  const primary_outcome_versions = (history && history.ok === true && Array.isArray(history.changeDates))
    ? history.changeDates.map((d) => ({ version_date: verbatim(d.version_date || d), source_url: verbatim(d.source_url) }))
    : null;
  const opts = { completionDateType: dates.completion_date_type };
  const edit = dates.record_last_update_posted;
  const value = editAfterPrimaryCompletion(edit, dates.primary_completion_date, opts);
  // G6 (QE re-check): value and reason come from the SAME kernel call and can never disagree
  // (registry-edit-timing.js's own docstring). `timing_unknown_reason` names the cause of an
  // 'unknown' VALUE and nothing else; the evidence-quality fact "no per-version history" is carried
  // by `primary_outcome_versions === null`, which the renderer surfaces as WEAK_EVIDENCE_LABEL —
  // one field never carries both unknown-cause and evidence-quality.
  const reason = timingUnknownReason(edit, dates.primary_completion_date, opts);
  return {
    primary_completion_date: dates.primary_completion_date,
    record_first_posted: dates.record_first_posted,
    record_last_update_posted: dates.record_last_update_posted,
    primary_outcome_versions,
    edit_after_primary_completion: value,
    timing_unknown_reason: reason,
  };
}

/**
 * The RegistryComparison record (ADR-001). Keys ⊆ COMPARISON_KEYS, always.
 * `coverage` is a total function of WHICH SIDES ARE PRESENT — never of what either side says
 * (K-10; presence and cardinality are properties of the lists, not of the texts).
 *
 * NOTE for callers: `coverage` is a fact about retrieval; `!== 'both-retrieved'` is not a finding.
 */
function buildComparison({ linkage = null, registry = null, article = null } = {}) {
  const registered_primary = extractRegisteredPrimary(registry);
  const published_primary = extractPublishedPrimary(article);

  const registryRetrieved = registry !== null && typeof registry === 'object' && registry.unreachable !== true;
  const registrySide = registryRetrieved && registered_primary.length > 0;
  const articleSide = published_primary.length > 0;

  let coverage;
  if (registrySide && articleSide) coverage = 'both-retrieved';
  else if (registrySide) coverage = 'registry-only';
  else if (articleSide) coverage = 'article-only';
  else coverage = 'neither';

  let unknown_reason = null;
  if (coverage !== 'both-retrieved') {
    if (!registrySide) {
      if (linkage === null) unknown_reason = 'no-registry-linkage';
      else if (registry && registry.unreachable === true) unknown_reason = 'registry-unreachable';
      else if (registryRetrieved) unknown_reason = 'registry-record-has-no-primary-outcome';
      // G5 (QE re-check): linkage resolved but NO registry envelope was ever supplied — nothing was
      // fetched, so nothing can be claimed ABOUT the registry. 'registry-unreachable' is reserved
      // for an envelope that RECORDS a failed attempt (unreachable === true); this is a fact about
      // the run, not the registry.
      else unknown_reason = 'registry-not-consulted';
    } else if (!articleSide) {
      const hasText = article && (typeof article.fullText === 'string' || typeof article.abstract === 'string');
      unknown_reason = hasText ? 'article-primary-outcome-not-extractable' : 'full-text-unavailable';
    }
  }

  let id_provenance;
  if (linkage !== null) {
    id_provenance = {
      source: linkage.id_provenance.source,
      section: verbatim(linkage.id_provenance.section),
      link_basis: linkage.link_basis,
    };
  } else {
    id_provenance = {
      source: null,
      section: null,
      link_basis: null,
      unsupported_registry_tokens: findUnsupportedRegistryTokens(article),
    };
  }

  const record = {
    trial_id: linkage !== null ? linkage.trial_id : null,
    id_provenance,
    registered_primary,
    published_primary,
    registry_timeline: registryRetrieved ? buildTimeline(registry) : null,
    coverage,
    unknown_reason,
  };
  assertComparisonWellFormed(record);
  return record;
}

/** Fail-closed (K-11): throws on any malformed record. */
function assertComparisonWellFormed(record) {
  if (!record || typeof record !== 'object') throw new TypeError('record must be an object');
  for (const key of Object.keys(record)) {
    if (!COMPARISON_KEYS.includes(key)) {
      throw new TypeError(`record key not in COMPARISON_KEYS: ${key}`);
    }
  }
  if (!COMPARISON_COVERAGE.includes(record.coverage)) {
    throw new TypeError(`record.coverage not in COMPARISON_COVERAGE: ${String(record.coverage)}`);
  }
  if (record.coverage !== 'both-retrieved' && (record.unknown_reason === null || record.unknown_reason === undefined)) {
    throw new TypeError(`record.unknown_reason is required when coverage is '${record.coverage}'`);
  }
  if (record.unknown_reason !== null && record.unknown_reason !== undefined
      && !COMPARISON_UNKNOWN_REASONS.includes(record.unknown_reason)) {
    throw new TypeError(`record.unknown_reason not in COMPARISON_UNKNOWN_REASONS: ${String(record.unknown_reason)}`);
  }
  for (const o of record.registered_primary || []) {
    if (!o.source_url || !o.retrieved_at) {
      throw new TypeError('every registered_primary statement requires source_url + retrieved_at (K-8)');
    }
  }
  for (const o of record.published_primary || []) {
    if (!o.locator) {
      throw new TypeError('every published_primary statement requires a locator (K-8)');
    }
  }
  if (record.registry_timeline !== null && record.registry_timeline !== undefined) {
    for (const key of Object.keys(record.registry_timeline)) {
      if (!TIMELINE_KEYS.includes(key)) {
        throw new TypeError(`registry_timeline key not in TIMELINE_KEYS: ${key}`);
      }
    }
    if (!TIMING_COMPARISON.includes(record.registry_timeline.edit_after_primary_completion)) {
      throw new TypeError('registry_timeline.edit_after_primary_completion not in TIMING_COMPARISON');
    }
  }
}

/**
 * Renders the record by ITERATING COMPARISON_KEYS — an allowlist by construction (K-12): a key the
 * allowlist does not name is never rendered, and a key the record does not carry renders nothing.
 * The two lists render as separate, independently numbered blocks — position and cardinality only,
 * never content-derived layout (K-9: column padding computed from the other side's text widths
 * would already be a function of both contents).
 */
function renderComparison(record) {
  assertComparisonWellFormed(record);
  const lines = [];
  for (const key of COMPARISON_KEYS) {
    const value = record[key];
    switch (key) {
      case 'trial_id':
        lines.push(`Registry <-> publication — ${value !== null && value !== undefined ? value : 'no registry linkage resolved'}`);
        break;
      case 'id_provenance':
        if (value && value.source !== null && value.source !== undefined) {
          const sec = value.section ? `, section=${value.section}` : '';
          lines.push(`  link basis: ${value.link_basis}   (${value.source}${sec})`);
        } else {
          lines.push(`  ${NO_LINKAGE_DISCLOSURE}`);
          const tokens = (value && value.unsupported_registry_tokens) || [];
          for (const t of tokens) {
            lines.push(`  identifier-shaped token found (registry not supported by this tool): ${t.token}   [${t.registry}, ${t.locator}]`);
          }
        }
        break;
      case 'registered_primary':
        if (Array.isArray(value) && value.length > 0) {
          const head = value[0];
          const retrieved = head.retrieved_at ? `, retrieved ${head.retrieved_at}` : '';
          lines.push(`  REGISTERED (registry record${retrieved})`);
          value.forEach((o, i) => {
            lines.push(`  ${i + 1}. ${o.measure !== null && o.measure !== undefined ? o.measure : ''}`);
            if (o.time_frame) lines.push(`     time frame: ${o.time_frame}`);
            if (o.description) lines.push(`     description: ${o.description}`);
            if (o.source_url) lines.push(`     ${o.source_url}`);
          });
        }
        break;
      case 'published_primary':
        if (Array.isArray(value) && value.length > 0) {
          lines.push('  PUBLISHED (article)');
          value.forEach((o, i) => {
            lines.push(`  ${i + 1}. ${o.text !== null && o.text !== undefined ? o.text : ''}`);
            if (o.locator) lines.push(`     locator: ${o.locator}`);
          });
        }
        break;
      case 'registry_timeline':
        if (value !== null && value !== undefined) {
          lines.push('  registry timeline');
          if (value.primary_completion_date) lines.push(`    primary completion date:   ${value.primary_completion_date}`);
          if (value.record_first_posted) lines.push(`    record first posted:       ${value.record_first_posted}`);
          if (value.record_last_update_posted) lines.push(`    record last update posted: ${value.record_last_update_posted}`);
          lines.push(`    edit after primary completion: ${value.edit_after_primary_completion}`);
          if (value.timing_unknown_reason) lines.push(`    timing unknown reason: ${value.timing_unknown_reason}`);
          if (value.primary_outcome_versions === null || value.primary_outcome_versions === undefined) {
            lines.push(`    ${WEAK_EVIDENCE_LABEL}`);
          } else {
            for (const v of value.primary_outcome_versions) {
              lines.push(`    outcome-field version dated: ${v.version_date}${v.source_url ? `   ${v.source_url}` : ''}`);
            }
          }
          lines.push(`    ${TIMING_DISCLOSURE}`);
        }
        break;
      case 'coverage':
        lines.push(`  coverage: ${value}`);
        break;
      case 'unknown_reason':
        if (value !== null && value !== undefined) lines.push(`  unknown reason: ${value}`);
        break;
      /* istanbul ignore next -- COMPARISON_KEYS is frozen; no other key exists */
      default:
        break;
    }
  }
  lines.push('');
  lines.push(`  ${COMPARISON_DISCLOSURE}`);
  return lines.join('\n');
}

module.exports = {
  COMPARISON_KEYS,
  COMPARISON_COVERAGE,
  COMPARISON_UNKNOWN_REASONS,
  COMPARISON_DISCLOSURE,
  FORBIDDEN_COMPARISON_CONCLUSIONS,
  FORBIDDEN_TIMING_INTENT,
  WEAK_EVIDENCE_LABEL,
  VOCABULARY_SOURCE,
  // Re-exported BY REFERENCE from the shared kernel (never declared here — AM-9/K-16/ADR-004):
  TIMELINE_KEYS,
  TIMING_COMPARISON,
  TIMELINE_UNKNOWN_REASONS,
  TIMING_DISCLOSURE,
  editAfterPrimaryCompletion,
  buildComparison,
  renderComparison,
  assertComparisonWellFormed,
};
