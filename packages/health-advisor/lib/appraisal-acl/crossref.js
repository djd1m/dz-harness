'use strict';
// ha-ca1 ACL — Crossref works/{doi}. Translates the foreign schema into the domain's vocabulary and
// DROPS every person-name field at the boundary (I-11: message.author[] is never carried forward).
// Pure translation: no I/O in this file.

// Crossref notice direction (04 §3.2, MEASURED): `updated-by` hangs off the RETRACTED WORK;
// `update-to` off the NOTICE. We read the subject's record, so `updated-by` is the signal.
// CA-1 QE F5 — MATCH THE STEM, NOT ONE INFLECTION. `t.includes('retraction')` is a substring test
// dressed as a classifier: MEASURED, 'Retracted' (Crossref's own past-participle spelling),
// 'Withdrawal' and 'Removal' all fell through to 'other', and 'other' is not carried as a notice at
// all — so a retracted work read CLEAN. The retraction-class stems below are the ones Crossref's
// update-type vocabulary actually uses for a withdrawn work; 'retract' covers retraction/retracted/
// partial_retraction, 'withdraw' covers withdrawal/withdrawn, 'remov' covers removal/removed.
const RETRACTION_TYPE_STEMS = Object.freeze(['retract', 'withdraw', 'remov']);
const CONCERN_TYPE_STEMS = Object.freeze(['concern']);
const CORRECTION_TYPE_STEMS = Object.freeze(['correction', 'corrected', 'erratum', 'errata', 'corrigendum']);

function classifyNoticeType(rawType) {
  const t = String(rawType || '').toLowerCase();
  // concern FIRST: 'expression of concern' must never be read as a retraction, and no concern
  // spelling contains a retraction stem, so the order is a tie-break, not a hierarchy
  if (CONCERN_TYPE_STEMS.some((s) => t.includes(s))) return 'expression-of-concern';
  if (RETRACTION_TYPE_STEMS.some((s) => t.includes(s))) return 'retraction';
  if (CORRECTION_TYPE_STEMS.some((s) => t.includes(s))) return 'correction';
  return 'other';
}

function issuedDateOf(message) {
  const parts = message && message.issued && Array.isArray(message.issued['date-parts'])
    ? message.issued['date-parts'][0] : null;
  if (!Array.isArray(parts) || parts.length === 0) return null;
  const [y, m, d] = parts;
  let out = String(y);
  if (m) out += `-${String(m).padStart(2, '0')}`;
  if (d) out += `-${String(d).padStart(2, '0')}`;
  return out;
}

function toNotice(u) {
  return {
    source: 'crossref',
    rawType: typeof u.type === 'string' ? u.type : null,
    class: classifyNoticeType(u.type),
    date: (u.updated && Array.isArray(u.updated['date-parts']) && Array.isArray(u.updated['date-parts'][0]))
      ? u.updated['date-parts'][0].map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, '0'))).join('-')
      : null,
    noticeDoi: typeof u.DOI === 'string' ? u.DOI.toLowerCase() : null,
    label: typeof u.label === 'string' ? u.label : null,
  };
}

/**
 * translateCrossrefWork(payload) -> { source, doi, notices[], updateTo[], referenceDois[],
 *                                     publicationDate }
 *
 * CA-1 QE F5 — `update-to` is now CARRIED, on its own field, and deliberately NOT folded into
 * `notices`. The direction matters and it is the accuse-direction: `updated-by` hangs off the
 * RETRACTED WORK, `update-to` off the NOTICE. A record whose only retraction link is `update-to`
 * is the record OF a retraction — it retracts something else. Merging it into `notices` would let
 * a retraction notice be reported as a retracted work, which is the exact class of error this
 * slice exists to prevent. Exposing it separately means the information is no longer silently
 * dropped, without anyone being accused by the fix.
 * OPEN (recorded, not guessed): a genuine retraction that Crossref records ONLY on the notice side
 * is still not detected by `updated-by`. That is an UNDER-detection — the safe direction — and
 * closing it needs a second lookup (resolve `update-to[].DOI` and check it names this work), which
 * is a live-network design decision, not a translation fix.
 */
function translateCrossrefWork(payload) {
  const message = (payload && payload.message && typeof payload.message === 'object')
    ? payload.message : {};
  const updatedBy = Array.isArray(message['updated-by']) ? message['updated-by'] : [];
  const updateTo = Array.isArray(message['update-to']) ? message['update-to'] : [];
  const notices = updatedBy.map(toNotice);
  const referenceDois = (Array.isArray(message.reference) ? message.reference : [])
    .map((r) => (typeof r.DOI === 'string' ? r.DOI.toLowerCase() : null))
    .filter((d) => d !== null);
  // I-11: author[] is DROPPED here — nothing person-named leaves this function.
  return {
    source: 'crossref',
    doi: typeof message.DOI === 'string' ? message.DOI.toLowerCase() : null,
    notices,
    updateTo: updateTo.map(toNotice),
    referenceDois,
    publicationDate: issuedDateOf(message),
  };
}

module.exports = {
  translateCrossrefWork,
  classifyNoticeType,
  RETRACTION_TYPE_STEMS,
  CONCERN_TYPE_STEMS,
};
