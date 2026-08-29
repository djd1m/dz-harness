# Registry vs publication — registered and published primary outcome, side by side

This reference belongs to the `@dzhechkov/health-advisor` package (slice CA-2,
`ha-ca2-registry-vs-publication`). It tells an agent how to place a trial's **registered** primary
outcome next to its **published** primary outcome, with the registry record's edit dates, so a human
reader can compare the two texts themselves.

**Invoke through the installed package, never through a relative path inside this skill
directory.** The engine modules (`lib/registry-linkage.js`, `lib/registry-comparison.js`,
`lib/registry-edit-timing.js`) ship in the npm package and are **not** copied into a flat skill
install — resolve them from `@dzhechkov/health-advisor`:

```js
const { resolveLinkage } = require('@dzhechkov/health-advisor/lib/registry-linkage.js');
const { buildComparison, renderComparison } = require('@dzhechkov/health-advisor/lib/registry-comparison.js');
```

## What this surface will never do

- It never decides whether an outcome was switched — it presents the two texts for the reader's own
  comparison, with a disclosure saying exactly that.
- It never says a trial was not registered — absence of a resolvable link renders as
  `no-registry-linkage`, a property of the indexes consulted.
- It never scores, ranks, highlights, or computes any relation between the two texts.
- It never posts, uploads, or writes anything off the machine — the modules contain no network
  construct at all (verified by a deny-list scan in the package's test suite).

## Protocol (retrieval is out of process — the modules never fetch)

1. **Identifier first, in the cascade order** (never out of it):
   1. PubMed `DataBankList` (NCBI `efetch`, `db=pubmed&rettype=xml`) — the registration field.
   2. Europe PMC annotations (`annotationsByArticleIds?articleIds=MED:<pmid>&type=Accession%20Numbers&format=JSON`)
      — keep the `section` of each hit.
   3. The article's own metadata and text (the modules extract `NCT\d{8}` / `ISRCTN\d{8}` with a
      fresh pattern per call).
   Crossref `clinical-trial-number` may **corroborate** an id but never resolves one — its coverage
   is orders of magnitude below PubMed's.
2. **Registry record second**, only for a resolved canonical id: ClinicalTrials.gov v2
   `GET /studies/{nctId}` (the package's `clinicaltrials-database` skill queries this endpoint), or
   the ISRCTN export otherwise. Hand the modules the **raw** record — the existing Python helper's
   summary exposes neither the outcomes nor `primaryCompletionDate`.
3. **Build and render**: `resolveLinkage(article)` → `buildComparison({linkage, registry, article})`
   → `renderComparison(record)`. The record carries both texts verbatim with locators, the registry
   timeline as dated facts, and a tri-state `edit_after_primary_completion` (`yes` / `no` /
   `unknown` — same-day, partial, and `ESTIMATED` completion dates are `unknown`, with a reason).
4. **Version history is optional and reported, never filled in**: per-version outcome history comes
   only from the package's registry-history source when that source is available; until then the
   timeline dates the record's **last edit**, not an edit to the outcome field, and the rendered
   output says so.
5. **Read-only.** Fetch with plain GET requests, write nothing off the machine, contact no one.

## Honest limits

- A registry record edited after its primary completion date is **not** evidence of wrongdoing;
  records are routinely updated for administrative reasons. The rendered timeline carries this
  disclosure unconditionally.
- Wording routinely differs between a registry entry and a paper without the outcome having
  changed. The tool renders both texts and draws no conclusion.
- `unknown` is a first-class answer. Missing linkage, missing dates, and unreachable registries all
  render as `unknown` with a named reason — treat that as the finding, not as something to paper
  over.
