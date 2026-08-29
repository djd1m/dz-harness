'use strict';
// ha-ca1 ACL — PubMed E-utilities. Two payload shapes: an esearch result (count + idlist) and an
// esummary/efetch record (PublicationTypeList). Checked against RETRACTION_LABEL_ALIASES.pubmed —
// the label-trap constant (ADR-002): PubMed's live label differs from Europe PMC's, and the wrong
// spelling returns count 0 with HTTP 200 (the SILENT ZERO). AuthorList is DROPPED (I-11).

const { RETRACTION_LABEL_ALIASES } = require('../appraisal-core.js');

function matchesPubmedLabel(label) {
  const l = String(label || '').toLowerCase();
  return RETRACTION_LABEL_ALIASES.pubmed.some((a) => a.toLowerCase() === l);
}

/**
 * translatePubmed(payload) -> { source, answered:true, noticeCount, notices[], publicationTypes[] }
 * An esearch count of 0 is an HONEST empty answer — never a throw (the silent zero is a data
 * state, and pretending it is an error would hide the exact trap ADR-002 maps).
 */
function translatePubmed(payload) {
  const out = {
    source: 'pubmed',
    answered: true,
    noticeCount: 0,
    notices: [],
    publicationTypes: [],
  };
  if (payload && payload.esearchresult && typeof payload.esearchresult === 'object') {
    const count = Number(payload.esearchresult.count);
    out.noticeCount = Number.isFinite(count) ? count : 0;
    const ids = Array.isArray(payload.esearchresult.idlist) ? payload.esearchresult.idlist : [];
    out.notices = out.noticeCount > 0
      ? ids.map((id) => ({ source: 'pubmed', class: 'retraction', rawType: 'esearch-hit', noticePmid: String(id), date: null }))
      : [];
    return out;
  }
  const types = (payload && Array.isArray(payload.PublicationTypeList)) ? payload.PublicationTypeList
    : (payload && payload.result && Array.isArray(payload.result.pubtype)) ? payload.result.pubtype
      : [];
  out.publicationTypes = types.map(String);
  const hits = out.publicationTypes.filter((t) => matchesPubmedLabel(t));
  out.noticeCount = hits.length;
  out.notices = hits.map((t) => ({ source: 'pubmed', class: 'retraction', rawType: t, date: null }));
  // I-11: AuthorList is DROPPED — never read, never carried.
  return out;
}

module.exports = { translatePubmed, matchesPubmedLabel };
