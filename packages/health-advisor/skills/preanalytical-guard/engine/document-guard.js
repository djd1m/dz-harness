'use strict';

// document-guard.js — ADR-001 (doc 17). The COMPOSABLE document-signal layer.
//
// base evaluate() is deliberately arity-3 and takes NO options: "a safety check the caller can
// narrow is not a safety check". Document signals only ever ADD restrictions (a blocking question),
// never remove a gate, so they belong in a SEPARATE, composable layer — the same shape as attach():
// run the base guard, then merge the document-header signals on top. evaluate() is never touched, and
// index.js keeps its five-name surface.
//
//   evaluateWithDocumentSignals(observations, conditions, registry, documentHeader)
//     → { readout, ticket }   (documentHeader absent ⇒ byte-identical to evaluate())
//
// A fired `question` signal drives every affected analyte to conditions_unknown (NEVER violated) and
// withholds it as `document_signal_pending`: a blocking question about the draw is unanswered, so the
// value waits for the answer, not for a proven violation. The blocking questions are emitted as
// `answer_question` requirements carrying `open-questions-v1`-shaped records for the caller to open in the questions ledger.

const { evaluate } = require('./evaluate.js');
const { CONDITION_STATES, WITHHELD_REASONS } = require('./conditions.js');
const { evaluateDocumentSignals } = require('./document-signals.js');
const ticketing = require('./ticket.js');

const DOCUMENT_SIGNAL_REASON = 'document-signal-question-open';
// conditions_unknown is a downgrade from verified but NOT from violated — a proven violation is a
// stronger, more specific statement than an open question, so it is never softened to unknown.
const STATE_RANK = { [CONDITION_STATES.VERIFIED]: 0, [CONDITION_STATES.UNKNOWN]: 1, [CONDITION_STATES.VIOLATED]: 2 };

function isoDateOf(value) {
  const s = typeof value === 'string' ? value : (value && typeof value.toString === 'function' ? value.toString() : '');
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : undefined;
}

function evaluateWithDocumentSignals(observations, conditions, registry, documentHeader) {
  const base = evaluate(observations, conditions, registry);
  if (documentHeader === undefined || documentHeader === null) return base;

  const observedAnalyteIds = base.readout.observations.map((o) => o.analyte_id);
  const lowBandAnalyteIds = base.readout.observations
    .filter((o) => o.audit && o.audit.band_placement === 'under')
    .map((o) => o.analyte_id);
  const openedOn = isoDateOf(conditions.get('collected_at'));

  const ds = evaluateDocumentSignals(documentHeader, registry, { observedAnalyteIds, lowBandAnalyteIds, openedOn });
  if (ds.signals.length === 0) return base; // matched nothing → base unchanged

  // index fired signals per analyte, remembering the disposition. A `question` signal WITHHOLDS
  // (blocking); a `caveat` signal only ANNOTATES (interpretable unchanged) — F1.
  const signalsByAnalyte = new Map();
  for (const sig of ds.signals) {
    for (const a of sig.affected) {
      if (!signalsByAnalyte.has(a)) signalsByAnalyte.set(a, []);
      signalsByAnalyte.get(a).push({ signal_id: sig.id, field: sig.field, disposition: sig.disposition, source: sig.source });
    }
  }
  const blocks = (fired) => fired.some((f) => f.disposition === 'question');

  const observations2 = base.readout.observations.map((o) => {
    const fired = signalsByAnalyte.get(o.analyte_id);
    if (!fired || fired.length === 0) return o;
    // state: raise to at least UNKNOWN, never lower a VIOLATED
    const withholding = blocks(fired);
    // a `question` signal raises state to at least UNKNOWN; a `caveat`-only signal annotates but
    // does not change the condition state. A proven VIOLATED is never softened either way.
    const state = (withholding && STATE_RANK[o.audit.state] < STATE_RANK[CONDITION_STATES.UNKNOWN])
      ? CONDITION_STATES.UNKNOWN : o.audit.state;
    const reasons = Object.freeze([...new Set([...o.audit.reasons, DOCUMENT_SIGNAL_REASON])]);
    const audit = Object.freeze({ ...o.audit, state, reasons, document_signals: Object.freeze(fired) });
    // interpretability: only a blocking QUESTION withholds — a MORE SPECIFIC existing withhold wins
    // (it already names a concrete defect). A `caveat`-only signal never lowers interpretability.
    const interpretable = withholding ? false : o.interpretable;
    const withheld_reason = (withholding && o.interpretable) ? WITHHELD_REASONS.DOCUMENT_SIGNAL_PENDING : o.withheld_reason;
    return Object.freeze({ analyte_id: o.analyte_id, value: o.value, unit: o.unit, audit, interpretable, withheld_reason });
  });

  const answerRequirements = ds.signals
    .filter((sig) => sig.disposition === 'question')
    .map((sig) => Object.freeze({
      kind: 'answer_question',
      analyte_id: null,
      companion_id: null,
      because: sig.question ? sig.question.question : ('a blocking question is due but could not be dated: ' + sig.question_omitted),
      magnitude: null,
      source: sig.source || null,
      // the open-questions-v1-shaped record, ready for the ledger's open() — or null with a reason
      // when collected_at gave no date to stamp it (F2: a withhold is never a silent dead-end).
      question: sig.question || null,
      question_pending_reason: sig.question ? null : sig.question_omitted,
    }));

  const suppressed = observations2.filter((o) => !o.interpretable).map((o) => o.analyte_id);
  const readout = Object.freeze({
    produced_at: base.readout.produced_at,
    conditions: base.readout.conditions,
    observations: Object.freeze(observations2),
    requirements: Object.freeze([...base.readout.requirements, ...answerRequirements]),
    unencoded: base.readout.unencoded,
    suppressed: Object.freeze([...new Set(suppressed)]),
    document_questions: Object.freeze(ds.questions),
  });
  const ticket = ticketing.mint(observations2.filter((o) => o.interpretable).map((o) => o.analyte_id), readout);
  return { readout, ticket };
}

module.exports = { evaluateWithDocumentSignals, DOCUMENT_SIGNAL_REASON };
