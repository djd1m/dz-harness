'use strict';
// ha-ca1 — acquisition composition (Seam A): builds ONE frozen, BRANDED SourceRecordBundle from the
// six ACL outputs + snapshot dates + linkage provenance. Checks read ONLY this shape; a fixture IS
// a bundle, which is why CI never touches the network. The brand (BUNDLE_BRAND) is what makes the
// foreign-input rule structural (04 §5.6): a non-branded input to any check returns null, never a
// verdict, never a throw.

const fs = require('node:fs');

const { BUNDLE_BRAND } = require('./appraisal-core.js');
const { translateCrossrefWork } = require('./appraisal-acl/crossref.js');
const { translatePubmed } = require('./appraisal-acl/pubmed.js');
const { translateEuropePmc } = require('./appraisal-acl/europepmc.js');
const { translateCtgovStudy } = require('./appraisal-acl/ctgov-v2.js');
const { readHistory, projectHistoryPayload } = require('./appraisal-acl/ctgov-history.js');
const { lookupViaCrossref, loadCsvIndex, applyCsvIndexToReferences } = require('./appraisal-acl/retraction-index.js');

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}

function assemble({ subject, linkage, sources, snapshotDates, observedAt }) {
  return deepFreeze({
    __bundle: BUNDLE_BRAND,
    subject: subject || null,
    linkage: linkage || null, // absent => registry checks answer unknown/registry-record-absent (I-8)
    sources: sources || {},
    snapshotDates: snapshotDates || {},
    observedAt: observedAt || null,
  });
}

/**
 * QE GAP-5 closure: an answered observation whose body is NOT JSON (an HTTP-200 HTML maintenance
 * page — the exact shape registry-history-adapter-fails-unknown.test.js exercises for the history
 * endpoint) degrades to the SAME unanswered shape a transport failure produces. ADR-004's contract
 * — losing one endpoint costs one source and nothing else — now holds on all four live paths; the
 * whole appraisal is never lost to one source's malformed body.
 */
function translateAnswered(obs, translate, sourceName) {
  if (obs.answered !== true) return { source: sourceName, answered: false, reason: obs.reason };
  let payload;
  try {
    payload = JSON.parse(obs.body);
  } catch {
    return { source: sourceName, answered: false, reason: 'endpoint-unavailable' };
  }
  return translate(payload);
}

/**
 * Live acquisition (never run by the test suite): fetch what the supplied identifiers allow via the
 * injected transport, translate through the ACLs, compose one frozen branded bundle. Linkage is
 * only ever user-supplied or record-carried — NEVER a title match (I-8).
 */
async function buildBundle({ doi, pmid, nct, retractionCsvPath, now, transport } = {}) {
  const get = transport.get;
  const sources = {};
  const snapshotDates = {};
  const observedAt = now || new Date().toISOString().slice(0, 10);

  if (doi) {
    const obs = await get(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
    sources.crossref = translateAnswered(obs, translateCrossrefWork, 'crossref');
    snapshotDates.crossref = observedAt;
    const epmc = await get(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=DOI:%22${encodeURIComponent(doi)}%22&format=json`);
    sources.europepmc = translateAnswered(epmc, translateEuropePmc, 'europe-pmc');
    snapshotDates.europepmc = observedAt;
  }
  if (pmid || doi) {
    const term = pmid ? `${pmid}[pmid]` : `"${doi}"[doi]`;
    const pm = await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`${term} AND "Retraction Notice"[pt]`)}`);
    sources.pubmed = translateAnswered(pm, translatePubmed, 'pubmed');
    snapshotDates.pubmed = observedAt;
  }
  if (nct) {
    const st = await get(`https://clinicaltrials.gov/api/v2/studies/${encodeURIComponent(String(nct).toUpperCase())}`);
    sources.ctgovV2 = translateAnswered(st, translateCtgovStudy, 'ctgov-v2');
    snapshotDates.ctgovV2 = observedAt;
    sources.ctgovHistory = await readHistory(nct, { get });
    snapshotDates.ctgovHistory = observedAt;
  }
  const referenceDois = (sources.crossref && Array.isArray(sources.crossref.referenceDois))
    ? sources.crossref.referenceDois : [];
  if (referenceDois.length > 0) {
    if (retractionCsvPath) {
      const index = loadCsvIndex(fs.readFileSync(retractionCsvPath, 'utf8'), { snapshotDate: observedAt });
      sources.retractionIndex = applyCsvIndexToReferences(index, referenceDois);
    } else {
      sources.retractionIndex = await lookupViaCrossref(referenceDois, { get, snapshotDate: observedAt });
    }
    snapshotDates.retractionIndex = observedAt;
  }

  const linkage = nct
    ? { nct: String(nct).toUpperCase(), provenance: 'user-supplied' }
    : null;
  const subject = {
    kind: doi ? 'doi' : (pmid ? 'pmid' : 'nct'),
    value: doi ? String(doi).toLowerCase() : (pmid ? String(pmid).replace(/\D/g, '') : String(nct).toUpperCase()),
  };
  return assemble({ subject, linkage, sources, snapshotDates, observedAt });
}

/**
 * Test/offline entry: compose the SAME branded shape from fixture payloads (parsed JSON objects or
 * file paths). A bundle from fixtures and a bundle built via the live path are shape-identical by
 * construction — both go through the same ACLs and the same assemble().
 */
function bundleFromFixtures({
  subject, linkage, crossref, pubmed, europepmc, ctgovV2, ctgovHistory, retractionIndex,
  snapshotDate, observedAt,
} = {}) {
  const load = (x) => (typeof x === 'string' ? JSON.parse(fs.readFileSync(x, 'utf8')) : x);
  const sources = {};
  const snapshotDates = {};
  const stamp = snapshotDate || '2026-08-05';
  if (crossref !== undefined && crossref !== null) {
    sources.crossref = translateCrossrefWork(load(crossref));
    snapshotDates.crossref = stamp;
  }
  if (pubmed !== undefined && pubmed !== null) {
    sources.pubmed = translatePubmed(load(pubmed));
    snapshotDates.pubmed = stamp;
  }
  if (europepmc !== undefined && europepmc !== null) {
    sources.europepmc = translateEuropePmc(load(europepmc));
    snapshotDates.europepmc = stamp;
  }
  if (ctgovV2 !== undefined && ctgovV2 !== null) {
    sources.ctgovV2 = translateCtgovStudy(load(ctgovV2));
    snapshotDates.ctgovV2 = stamp;
  }
  if (ctgovHistory !== undefined && ctgovHistory !== null) {
    const payload = load(ctgovHistory);
    // fixtures encoding a transport-level failure carry {__unanswered: true}
    sources.ctgovHistory = (payload && payload.__unanswered === true)
      ? { available: false, reason: 'endpoint-unavailable', observedKeys: [], detail: payload.detail || 'unanswered' }
      : projectHistoryPayload(payload, 'fixture://ctgov-history');
    snapshotDates.ctgovHistory = stamp;
  }
  if (retractionIndex !== undefined && retractionIndex !== null) {
    const raw = load(retractionIndex);
    sources.retractionIndex = {
      adapter: raw.adapter || 'crossref-per-doi',
      retractedDois: new Set((raw.retractedDois || []).map((d) => String(d).toLowerCase())),
      retractionDates: raw.retractionDates || {},
      reasons: raw.reasons || {},
      checked: raw.checked || 0,
      total: raw.total || 0,
      unresolved: raw.unresolved || [],
      snapshotDate: raw.snapshotDate || stamp,
    };
    snapshotDates.retractionIndex = stamp;
  }
  return assemble({
    subject: subject || null,
    linkage: linkage !== undefined ? linkage : (sources.ctgovV2 && sources.ctgovV2.nctId
      ? { nct: sources.ctgovV2.nctId, provenance: 'user-supplied' } : null),
    sources,
    snapshotDates,
    observedAt: observedAt || stamp,
  });
}

module.exports = { buildBundle, bundleFromFixtures, assemble };
