'use strict';
// ha-ca1 ACL — the retraction index behind TWO adapters, one interface (ADR-008/AM-9):
//   crossref-per-doi (DEFAULT) — one bounded GET per reference DOI via the injected transport
//   local-csv (opt-in, --retraction-csv) — a user-supplied Retraction Watch snapshot slice
// Both emit the SAME IndexCoverage shape:
//   { adapter, retractedDois: Set, retractionDates: {doi: date}, reasons: {doi: [raw codes]},
//     checked, total, unresolved: [{doi, reason}], snapshotDate }
// AM-9's asymmetry is applied by check 2, not here: this module reports coverage; it never verdicts.

const { translateCrossrefWork } = require('./crossref.js');

/**
 * CA-1 QE F5 — the EARLIEST dated retraction notice, not the first one the array happens to list.
 * `.find()` returned whichever notice came first in Crossref's array; MEASURED, a work carrying a
 * 2021 notice ahead of a genuine 2015 one reported 2021, and a work published 2020-06-15 then
 * ordered as "retracted after publication" — a real retraction that predates the citing work,
 * silently dropped to no-concern. Array order is not chronology.
 * Notices WITHOUT a date never shadow a dated one (an undated notice cannot win a date comparison,
 * and letting it win would erase the only orderable evidence there is); a work whose only notices
 * are undated is still recorded as retracted, with no date, which the kernel then refuses to order.
 */
function earliestRetractionNotice(notices) {
  const retractions = (Array.isArray(notices) ? notices : []).filter((n) => n && n.class === 'retraction');
  if (retractions.length === 0) return null;
  const dated = retractions.filter((n) => typeof n.date === 'string' && n.date.length > 0);
  if (dated.length === 0) return retractions[0];
  // ISO date-strings truncated to a common precision compare lexicographically — the same ordering
  // rule the shared kernel uses, never `new Date(a) < new Date(b)`.
  return dated.reduce((best, n) => (n.date < best.date ? n : best));
}

/**
 * CA-1 QE F5 — an HTTP 200 is a statement about the TRANSPORT, not about the answer. MEASURED:
 * `{"status":"error"}` parsed cleanly, incremented `checked`, and counted as coverage of a
 * reference nobody looked at. Crossref stamps every real works/{doi} body with `status: "ok"` and a
 * `message` object; anything else is a body we cannot read, which is `unresolved`, not clean.
 */
function isReadableCrossrefEnvelope(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (payload.status !== undefined && payload.status !== 'ok') return false;
  return !!payload.message && typeof payload.message === 'object';
}

/** Crossref DOIs are case-insensitive; comparison is on the lowered form. */
function sameDoi(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

/**
 * Default adapter: resolve each cited DOI against Crossref works/{doi} via the injected `get`.
 * A lookup that does not answer joins `unresolved` — never a silent drop (AM-9).
 *
 * OPEN QUESTION (recorded, NOT guessed — it needs the live API and CI never touches the network):
 * the URL below is built with encodeURIComponent, which percent-encodes the '/' that every DOI
 * carries: `10.1000/ref.a` becomes `.../works/10.1000%2Fref.a` (MEASURED locally — the string the
 * adapter builds). Whether api.crossref.org resolves a percent-encoded slash on that path segment
 * is a LIVE-NETWORK fact this suite cannot settle. If it 404s, every default lookup lands in
 * `unresolved` — the SAFE direction (coverage-partial, never a false clean bill) — but the default
 * adapter would then resolve nothing at all, and only the opt-in --retraction-csv path would work.
 *   REPRODUCER (run against the live API, not in CI):
 *     curl -sS -o /dev/null -w '%{http_code}\n' 'https://api.crossref.org/works/10.1000%2F182'
 *     curl -sS -o /dev/null -w '%{http_code}\n' 'https://api.crossref.org/works/10.1000/182'
 *   A 404 on the first and 200 on the second settles it; the fix would be to encode the DOI
 *   segment-wise (leaving '/' literal) rather than whole.
 */
async function lookupViaCrossref(referenceDois, { get, snapshotDate } = {}) {
  const dois = Array.isArray(referenceDois) ? referenceDois : [];
  const retractedDois = new Set();
  const retractionDates = {};
  const reasons = {};
  const unresolved = [];
  let checked = 0;
  await Promise.all(dois.map(async (doi) => {
    let obs;
    try {
      obs = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    } catch (err) {
      unresolved.push({ doi, reason: 'endpoint-unavailable' });
      return;
    }
    if (!obs || obs.answered !== true) {
      unresolved.push({ doi, reason: 'endpoint-unavailable' });
      return;
    }
    let payload;
    try {
      payload = JSON.parse(obs.body);
    } catch {
      unresolved.push({ doi, reason: 'endpoint-unavailable' });
      return;
    }
    if (!isReadableCrossrefEnvelope(payload)) {
      unresolved.push({ doi, reason: 'endpoint-unavailable' });
      return;
    }
    const record = translateCrossrefWork(payload);
    // CA-1 QE F5 — the answer must be about the QUESTION. The returned message.DOI was never
    // compared to the one asked for, so a redirect, a cache mix-up or a mistyped fixture would
    // silently attribute another work's retraction record (or another work's CLEAN record) to this
    // reference. An answer about a different DOI is not an answer about this one.
    if (!sameDoi(record.doi, doi)) {
      unresolved.push({ doi, reason: 'identifier-mismatch' });
      return;
    }
    checked += 1;
    const retraction = earliestRetractionNotice(record.notices);
    if (retraction) {
      retractedDois.add(doi.toLowerCase());
      if (retraction.date) retractionDates[doi.toLowerCase()] = retraction.date;
    }
  }));
  return {
    adapter: 'crossref-per-doi',
    retractedDois,
    retractionDates,
    reasons,
    checked,
    total: dois.length,
    unresolved,
    snapshotDate: snapshotDate || null,
  };
}

/**
 * Opt-in adapter: build the index from a Retraction Watch CSV slice. Reason codes are carried as
 * OPAQUE, verbatim strings (rules-ADR-003 posture) — never interpreted, never mapped to severity.
 * A malformed row still contributes its DOI when the DOI parses; an unparseable row shows up in
 * `unresolved` — NEVER a thrown error, NEVER a silently-dropped row (AM-4).
 */
/**
 * RFC-4180-aware field split for ONE row (QE GAP-4 closure): a quoted field may contain commas and
 * escaped quotes (""); the surrounding quotes are stripped so a reason rendered as a VERBATIM
 * quotation really is verbatim — never truncated at an embedded comma, never carrying a stray '"'.
 * HONEST LIMIT (recorded): rows are split on newlines BEFORE this runs, so a quoted field
 * containing a literal newline still breaks into two rows — the fragments fail the DOI test and
 * land in `unresolved`, a VISIBLE loss (AM-4's rule), never a silently wrong quote.
 */
function splitCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i += 1; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"' && cur === '') {
      inQuotes = true;
    } else if (ch === ',') {
      cols.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function loadCsvIndex(csvText, { snapshotDate } = {}) {
  const retractedDois = new Set();
  const retractionDates = {};
  const reasons = {};
  const unresolved = [];
  const lines = String(csvText || '').split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.slice(1); // header
  for (const line of rows) {
    const cols = splitCsvLine(line);
    const doi = (cols[0] || '').trim().toLowerCase();
    if (!/^10\./.test(doi)) {
      unresolved.push({ doi: doi || '(unparseable row)', reason: 'field-absent' });
      continue;
    }
    retractedDois.add(doi);
    const date = (cols[1] || '').trim();
    if (date) retractionDates[doi] = date;
    const reason = (cols[2] || '').trim();
    // verbatim-or-'unclassified' with the raw code kept — never dropped, never interpreted
    reasons[doi] = reason ? [reason] : ['unclassified'];
  }
  return {
    adapter: 'local-csv',
    retractedDois,
    retractionDates,
    reasons,
    checked: retractedDois.size,
    total: retractedDois.size,
    unresolved,
    snapshotDate: snapshotDate || null,
  };
}

/**
 * Resolve a reference list against a loaded CSV index -> the same IndexCoverage shape the default
 * adapter emits. The CSV's own parse losses propagate into `unresolved` (AM-4): a row the loader
 * could not read is honestly a coverage hole, never a silent clean result.
 */
function applyCsvIndexToReferences(index, referenceDois) {
  const dois = Array.isArray(referenceDois) ? referenceDois : [];
  const retractedDois = new Set();
  const retractionDates = {};
  const reasons = {};
  for (const doi of dois) {
    const d = String(doi).toLowerCase();
    if (index.retractedDois.has(d)) {
      retractedDois.add(d);
      if (index.retractionDates[d]) retractionDates[d] = index.retractionDates[d];
      if (index.reasons[d]) reasons[d] = index.reasons[d];
    }
  }
  return {
    adapter: 'local-csv',
    retractedDois,
    retractionDates,
    reasons,
    checked: dois.length,
    total: dois.length,
    unresolved: index.unresolved.slice(),
    snapshotDate: index.snapshotDate,
  };
}

module.exports = {
  lookupViaCrossref,
  loadCsvIndex,
  applyCsvIndexToReferences,
  splitCsvLine,
  earliestRetractionNotice,
  isReadableCrossrefEnvelope,
};
