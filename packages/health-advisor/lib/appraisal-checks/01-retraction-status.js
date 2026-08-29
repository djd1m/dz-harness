'use strict';
// C1 — retraction-status (ADR-002). Union of Crossref updated-by[], PubMed (RETRACTION_LABEL_ALIASES
// .pubmed) and Europe PMC (RETRACTION_LABEL_ALIASES['europe-pmc']) notices — union, NEVER pick
// (04 §5.1 R1): a notice from ANY source is a concern, with per-source attribution and any class
// disagreement NAMED in evidence. One answering source's silence is NOT a clean bill (R2):
// no-concern requires >= 2 independent sources answering, both reporting none. Pure — no I/O.

const { isBundle, makeFinding } = require('../appraisal-core.js');

const DOMAIN = 'retraction-status';

function unknownFinding(reason, detail) {
  return makeFinding({
    domain: DOMAIN,
    verdict: 'unknown',
    evidence: [{ quote: `${reason}: ${detail}`, locator: null }],
    refutable_by: 'any answering publisher or index record for this identifier',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

function evaluate(bundle) {
  if (!isBundle(bundle)) return null;
  const s = bundle.sources || {};
  const candidates = [s.crossref, s.pubmed, s.europepmc].filter((x) => x !== undefined && x !== null);
  if (candidates.length === 0) {
    return unknownFinding('field-absent', 'no publication identifier was available to look up');
  }
  // CA-1 QE F4 — `answered !== false` treated an EMPTY OBJECT as a source that answered: three `{}`
  // rendered "no notice reported by 3 independent sources (, , )" — a clean bill attributed to three
  // sources with no names. A flag is not a record. An answering source is one that carries the two
  // things this check reads: its own NAME and a notices ARRAY. (The ACLs are asymmetric by design —
  // pubmed/europepmc stamp `answered: true`, crossref does not — so the positive test is on the
  // PAYLOAD, which every real translator produces, not on a flag only some of them set.)
  const answered = candidates.filter((x) => x.answered !== false
    && typeof x.source === 'string' && x.source.trim().length > 0
    && Array.isArray(x.notices));
  if (answered.length === 0) {
    return unknownFinding('endpoint-unavailable',
      'no publication-record source returned a readable record (a source name and a notices list)');
  }
  const notices = [];
  for (const src of answered) {
    for (const n of (src.notices || [])) {
      if (n.class === 'retraction' || n.class === 'expression-of-concern') notices.push(n);
    }
  }
  if (notices.length > 0) {
    const classes = [...new Set(notices.map((n) => n.class))];
    const evidence = notices.map((n) => ({
      quote: `${n.class} notice: ${n.rawType || 'unlabelled'}${n.date ? `, dated ${n.date}` : ''}`,
      locator: `${n.source}${n.noticeDoi ? `:${n.noticeDoi}` : ''}${n.noticePmid ? `:pmid/${n.noticePmid}` : ''}`,
    }));
    if (classes.length > 1) {
      evidence.push({
        quote: `sources disagree on notice class (${classes.join(' vs ')}); the strongest class observed is reported`,
        locator: 'cross-source comparison',
      });
    }
    return makeFinding({
      domain: DOMAIN,
      verdict: 'concern',
      evidence,
      refutable_by: 'the publisher record, if this identifier resolves to a different work than the one appraised',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  }
  if (answered.length === 1) {
    // R2 — one source's silence is not a clean bill
    return unknownFinding('single-source-only',
      `only one source (${answered[0].source}) answered, and it reports no notices`);
  }
  return makeFinding({
    domain: DOMAIN,
    verdict: 'no-concern',
    evidence: [{
      quote: `no retraction or expression-of-concern notice reported by ${answered.length} independent sources (${answered.map((a) => a.source).join(', ')})`,
      locator: 'cross-source union',
    }],
    refutable_by: 'a publisher notice or index record dated after these snapshots',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

module.exports = { domain: DOMAIN, evaluate };
