'use strict';
// C2 — cites-retracted-work (ADR-008/AM-9). The resolution-rule order is LOAD-BEARING:
//   1. a qualifying retraction FOUND         => concern      (a positive survives partial failure)
//   2. unresolved lookups remain             => unknown / index-coverage-partial (NEVER no-concern)
//   3. an UNORDERABLE date pair remains      => unknown      (NEVER concern, NEVER no-concern)
//   4. nothing to check (total === 0)        => unknown / check-not-applicable
//   5. everything checked, everything ordered, nothing found => no-concern
// Temporal guard (QE GAP-1/GAP-2 closure): ordering is decided by the SHARED KERNEL's
// precision-aware comparison (lib/registry-edit-timing.js, imported from ../appraisal.js BY
// REFERENCE) — ONE definition of date ordering in this package, never a second naive one. A
// 'concern' requires the retraction to be STRICTLY before this work's publication at the coarsest
// precision both dates carry; a pair the data cannot order (a year- or month-precision date, an
// absent date on either side) is 'unknown' — never an accusation, never a clean bill.
// Citation-context escape hatch: refutable_by always names it. Pure — no I/O.

const { isBundle, makeFinding, UNKNOWN_REASONS } = require('../appraisal-core.js');
const { editAfterPrimaryCompletion, timingUnknownReason } = require('../appraisal.js');

const DOMAIN = 'cites-retracted-work';

// The kernel's reason vocabulary answers a different question than UNKNOWN_REASONS; the mapping is
// declared ONCE, here, and is TOTAL over the reasons the scalar predicate can emit — an unmapped
// kernel reason is a THROW, never a default (same discipline as 04-05).
// Kernel argument order is (publicationDate, retractionDate): 'yes' = publication strictly after
// retraction = the retraction predates this work; so 'edit-date-absent' means the PUBLICATION date
// is absent and 'primary-completion-date-absent' means the RETRACTION date is absent.
const KERNEL_REASON_MAP = Object.freeze({
  'edit-date-absent': 'field-absent',
  'primary-completion-date-absent': 'field-absent',
  'same-day-not-orderable': 'not-orderable-at-available-precision',
  'same-month-not-orderable': 'not-orderable-at-available-precision',
  'same-year-not-orderable': 'not-orderable-at-available-precision',
  // CA-1 QE F1 — a date-shaped string that names no day on the calendar is UNORDERABLE, never a
  // verdict input. The map stays TOTAL over the kernel's reasons; an unmapped reason still throws.
  'date-not-a-calendar-date': 'date-not-a-calendar-date',
});

function mapKernelReason(reason) {
  const mapped = KERNEL_REASON_MAP[reason];
  if (!mapped || !UNKNOWN_REASONS.includes(mapped)) {
    throw new TypeError(`unmapped kernel timing reason in check 2: ${String(reason)}`);
  }
  return mapped;
}

function unknownFinding(reason, detail, evidenceTail) {
  return makeFinding({
    domain: DOMAIN,
    verdict: 'unknown',
    evidence: [{ quote: `${reason}: ${detail}`, locator: null }, ...(evidenceTail || [])],
    refutable_by: 'a complete resolution of the reference list against a current retraction index',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

function unorderableQuote(u, pubDate) {
  return {
    quote: `cited work has a retraction record${u.retractionDate ? ` dated ${u.retractionDate}` : ' carrying no retraction date'};`
      + ` the pair (retraction ${u.retractionDate || '(absent)'}, publication ${pubDate || '(absent)'}) cannot be ordered`
      + ` at the precision the data carries (${u.kernelReason}) — listed, not ordered`,
    locator: `doi:${u.doi}`,
  };
}

function evaluate(bundle) {
  if (!isBundle(bundle)) return null;
  const s = bundle.sources || {};
  const index = s.retractionIndex;
  if (!index) return unknownFinding('index-unavailable', 'no retraction index was available for this run');
  const pubDate = s.crossref && typeof s.crossref.publicationDate === 'string'
    ? s.crossref.publicationDate : null;

  const retracted = [...(index.retractedDois || new Set())];
  const qualifying = [];
  const nonQualifying = []; // ordered: retraction NOT before publication — listed, never accused
  const unorderable = [];   // the data cannot order the pair — never a concern, never a clean bill
  for (const doi of retracted) {
    const rDate = index.retractionDates ? index.retractionDates[doi] : undefined;
    // ONE ordering definition: the kernel. 'yes' = publication strictly after retraction at the
    // coarsest common precision = the cited work was retracted BEFORE this work was published.
    const order = editAfterPrimaryCompletion(pubDate, rDate);
    if (order === 'yes') {
      qualifying.push({ doi, retractionDate: rDate });
    } else if (order === 'no') {
      nonQualifying.push({ doi, retractionDate: rDate });
    } else {
      unorderable.push({
        doi,
        retractionDate: typeof rDate === 'string' ? rDate : null,
        kernelReason: timingUnknownReason(pubDate, rDate),
      });
    }
  }
  const coverageQuote = `index coverage: checked ${index.checked} of ${index.total} cited DOIs`
    + `${index.unresolved.length > 0 ? `, ${index.unresolved.length} unresolved` : ''}`
    + `${index.snapshotDate ? `, snapshot ${index.snapshotDate}` : ''} (adapter: ${index.adapter})`;

  if (qualifying.length > 0) {
    const evidence = qualifying.map((q) => ({
      quote: `cited work retracted ${q.retractionDate}, before this work's publication date ${pubDate}`,
      locator: `doi:${q.doi}`,
    }));
    // rules-ADR-003 posture: a reason code is a VERBATIM quotation with ownership attribution —
    // never an input to the verdict, never mapped to severity, never paraphrased.
    for (const q of qualifying) {
      const codes = (index.reasons && index.reasons[q.doi]) || [];
      for (const code of codes) {
        evidence.push({
          quote: `retraction reason, quoted verbatim from the Retraction Watch record: "${code}"`,
          locator: `doi:${q.doi}`,
        });
      }
    }
    // an unorderable pair alongside a positive is still SHOWN — listed, never silently absorbed
    for (const u of unorderable) evidence.push(unorderableQuote(u, pubDate));
    evidence.push({ quote: coverageQuote, locator: index.adapter });
    return makeFinding({
      domain: DOMAIN,
      verdict: 'concern',
      evidence,
      refutable_by: 'the citation context — a work may cite a retracted study to discuss its retraction; the passage citing it decides',
      tier: 'A',
      author_response_state: 'not-contacted',
    });
  }
  if ((index.unresolved || []).length > 0) {
    return unknownFinding('index-coverage-partial',
      `${index.unresolved.length} of ${index.total} cited DOIs could not be resolved; nothing retracted found in the resolved part — which is a claim about our coverage, not about the references`);
  }
  // CA-1 QE F4 — the clean bill used to rest on `unresolved.length === 0` ALONE, so an index
  // reporting `checked: 0 of 2` with an empty unresolved list rendered no-concern over TWO
  // references nobody looked at. Two independent numbers describe this coverage; the verdict must
  // read both, and neither may be a non-number.
  if (!Number.isFinite(index.checked) || !Number.isFinite(index.total)) {
    return unknownFinding('index-coverage-partial',
      `the retraction index reports no countable coverage (checked: ${String(index.checked)}, total: ${String(index.total)}) — coverage that cannot be counted cannot be a clean bill`);
  }
  if (index.checked !== index.total) {
    return unknownFinding('index-coverage-partial',
      `the retraction index checked ${index.checked} of ${index.total} cited DOIs and listed no unresolved lookups; the ${index.total - index.checked} unaccounted references are a hole in our coverage, not a statement about them`);
  }
  if (unorderable.length > 0) {
    // GAP-1/GAP-2: an ordering the data cannot support is neither an accusation nor a clean bill.
    const tail = unorderable.map((u) => unorderableQuote(u, pubDate));
    tail.push({ quote: coverageQuote, locator: index.adapter });
    return unknownFinding(mapKernelReason(unorderable[0].kernelReason),
      `${unorderable.length} cited retraction record(s) could not be ordered against this work's publication date at the precision the data carries — an unorderable pair is never a concern and never a clean bill`,
      tail);
  }
  if (!index.total || index.total === 0) {
    return unknownFinding('check-not-applicable', 'the record carries no cited DOIs to resolve');
  }
  const evidence = [{ quote: coverageQuote, locator: index.adapter }];
  for (const nq of nonQualifying) {
    evidence.push({
      quote: `cited work has a retraction record dated ${nq.retractionDate}, not before this work's publication date ${pubDate} — listed, not a concern`,
      locator: `doi:${nq.doi}`,
    });
  }
  return makeFinding({
    domain: DOMAIN,
    verdict: 'no-concern',
    evidence,
    refutable_by: 'a retraction of any cited work dated before this work was published, in a fresher index snapshot',
    tier: 'A',
    author_response_state: 'not-contacted',
  });
}

module.exports = { domain: DOMAIN, evaluate, KERNEL_REASON_MAP };
