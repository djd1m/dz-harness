'use strict';

// document-signals.js — ADR-001 (doc 17). PURE evaluation of the recognized-document HEADER against
// the `document-signals.json` registry. No I/O, no clock: every input (header, observed analytes,
// which analytes sit under their band, the date) is passed in, so the caller (evaluate.js) owns the
// filesystem and the clock and this module stays a total, testable function.
//
// A signal fires on the TEXT of a header field, NOT on a patient-declared condition_slot. Its
// `question` disposition is the load-bearing case: it makes affected analytes conditions_unknown
// (never violated — see evaluate.js) AND emits a BLOCKING question shaped for the
// `open-questions-v1` ledger, which the caller hands to the questions ledger's open(). UNKNOWN, not VIOLATED, is
// the honest state: we do not yet know the sampling was bad — a question about it is unanswered.

const crypto = require('node:crypto');
const { canonicalKey } = require('./analyte-name.js');

/** normalize header/pattern text for substring matching: NFC, lowercase, collapse whitespace, trim. */
function normalizeText(s) {
  return String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** deterministic 12-hex question id from the signal id + its resolved scope (stable across runs). */
function questionId(signalId, scope) {
  const h = crypto.createHash('sha256').update(signalId + '|' + [...scope].sort().join(',')).digest('hex');
  return 'docsig:' + h.slice(0, 12);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * evaluateDocumentSignals(header, registry, opts) → { signals, affectedAnalytes:Set, questions:[] }
 *
 * header: { facility?, orderer?, method?, equipment? } (any subset; a field absent never matches).
 * opts.observedAnalyteIds: string[] — the analytes actually present in this batch (resolves "*").
 * opts.lowBandAnalyteIds: string[] — analytes placed UNDER their reference band (for requires_low_band).
 * opts.openedOn: 'YYYY-MM-DD' — the date to stamp the question with (evaluate passes collected_at's date).
 * opts.documentPresent: boolean — reserved for the filed "facility unknown" follow-up; unused here.
 *
 * A signal with disposition 'question' whose resolved scope is non-empty emits one blocking question.
 */
function evaluateDocumentSignals(header, registry, opts = {}) {
  const observed = Array.isArray(opts.observedAnalyteIds) ? opts.observedAnalyteIds : [];
  const lowBand = new Set((Array.isArray(opts.lowBandAnalyteIds) ? opts.lowBandAnalyteIds : []).map(canonicalKey));
  const openedOn = opts.openedOn;
  const entries = (registry && typeof registry.documentSignals === 'function') ? registry.documentSignals() : [];

  const observedByKey = new Map(observed.map((a) => [canonicalKey(a), a]));
  const signals = [];
  const questions = [];
  const affectedAnalytes = new Set();

  for (const entry of entries) {
    const fieldText = normalizeText(header ? header[entry.field] : undefined);
    if (fieldText.length === 0) continue;
    const matched = entry.match.some((p) => fieldText.includes(normalizeText(p)));
    if (!matched) continue;

    // resolve scope: "*" → every observed analyte; a list → observed analytes whose canonical key
    // matches a listed name. requires_low_band narrows to analytes actually under their band.
    let scopeIds;
    if (entry.applies_to === '*') {
      scopeIds = [...observed];
    } else {
      const listKeys = new Set(entry.applies_to.map(canonicalKey));
      scopeIds = [...observedByKey.entries()].filter(([k]) => listKeys.has(k)).map(([, a]) => a);
    }
    if (entry.requires_low_band === true) {
      scopeIds = scopeIds.filter((a) => lowBand.has(canonicalKey(a)));
    }
    scopeIds = [...new Set(scopeIds)]; // F3: duplicate observed ids must not duplicate the scope
    if (scopeIds.length === 0) continue; // nothing observed to attach the question to

    for (const a of scopeIds) affectedAnalytes.add(a);
    const signal = { id: entry.id, field: entry.field, disposition: entry.disposition, affects_independence: entry.affects_independence, affected: scopeIds, source: entry.source };

    // Only a `question` disposition opens a blocking question. A dated header yields a full
    // open-questions-v1 record; an UNDATED one (collected_at UNKNOWN) still fires the signal but
    // cannot form a valid ledger record — it carries `question_omitted` so the composition emits a
    // VISIBLE pending requirement instead of a silent dead-end withhold (F2). A `caveat` disposition
    // annotates without blocking and opens no question (F1).
    if (entry.disposition === 'question') {
      if (ISO_DATE_RE.test(String(openedOn))) {
        const q = Object.freeze({
          id: questionId(entry.id, scopeIds),
          question: entry.question_text,
          scope: [...scopeIds],
          blocking: true,
          status: 'open',
          opened_on: openedOn,
          trigger_date: openedOn, // due immediately — the signal is already on the form
          origin: { kind: 'document-signal', signal_id: entry.id, field: entry.field, source: entry.source },
        });
        signal.question = q;
        questions.push(q);
      } else {
        signal.question_omitted = 'no valid openedOn (YYYY-MM-DD) supplied — a blocking question cannot be dated';
      }
    }
    signals.push(signal);
  }

  return { signals, affectedAnalytes, questions };
}

module.exports = { evaluateDocumentSignals, normalizeText, questionId };
