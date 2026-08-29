'use strict';
// ha-ca1 ACL — Europe PMC search/annotations. Reads pubTypeList.pubType[] (checked against
// RETRACTION_LABEL_ALIASES['europe-pmc'] — the LEGACY spelling that PubMed answers with count 0)
// and commentCorrectionList.commentCorrection[] (typed 'Retraction in' / 'Expression of concern in').
// authorList is DROPPED at this boundary (I-11).

const { RETRACTION_LABEL_ALIASES } = require('../appraisal-core.js');

function matchesEuropePmcLabel(label) {
  const l = String(label || '').toLowerCase();
  return RETRACTION_LABEL_ALIASES['europe-pmc'].some((a) => a.toLowerCase() === l);
}

function classifyCommentCorrection(type) {
  const t = String(type || '').toLowerCase();
  if (t.startsWith('retraction')) return 'retraction';
  if (t.includes('concern')) return 'expression-of-concern';
  if (t.includes('correction') || t.includes('erratum')) return 'correction';
  return 'other';
}

/** translateEuropePmc(payload) -> { source, answered:true, notices[], publicationTypes[] } */
function translateEuropePmc(payload) {
  const result = (payload && payload.result && typeof payload.result === 'object') ? payload.result
    : (payload && typeof payload === 'object') ? payload : {};
  const pubTypes = (result.pubTypeList && Array.isArray(result.pubTypeList.pubType))
    ? result.pubTypeList.pubType.map(String) : [];
  const notices = [];
  for (const t of pubTypes) {
    if (matchesEuropePmcLabel(t)) {
      notices.push({ source: 'europe-pmc', class: 'retraction', rawType: t, date: null });
    }
  }
  const ccList = (result.commentCorrectionList
    && Array.isArray(result.commentCorrectionList.commentCorrection))
    ? result.commentCorrectionList.commentCorrection : [];
  for (const cc of ccList) {
    const cls = classifyCommentCorrection(cc.type);
    if (cls === 'retraction' || cls === 'expression-of-concern') {
      notices.push({
        source: 'europe-pmc',
        class: cls,
        rawType: typeof cc.type === 'string' ? cc.type : null,
        date: typeof cc.note === 'string' ? cc.note : null,
        noticeId: cc.id !== undefined ? String(cc.id) : null,
      });
    }
  }
  // I-11: authorList is DROPPED — never read, never carried.
  return { source: 'europe-pmc', answered: true, notices, publicationTypes: pubTypes };
}

module.exports = { translateEuropePmc, matchesEuropePmcLabel };
