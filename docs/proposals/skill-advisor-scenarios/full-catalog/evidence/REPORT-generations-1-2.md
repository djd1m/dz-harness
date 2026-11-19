# Full-source catalog candidate, 18 November 2026

**Draft / release NO-GO. The public advisor has not been changed.** All package and skill-path coverage checks pass; answer quality does not yet pass the frozen acceptance contract.

## Source coverage

Pinned upstream source: `a2af2732b01d516966e076db77c35902f5e72ac1`. All57 exact package versions were observed on npm. Captured tarball SHA512 integrity and byte matching confirm312 shipped SKILL.md occurrences across37 packages. The other20 packages receive supporting library/adapter/tool scenarios with no invented skill identifiers. There are332 records.312 paths include duplicated skill carriers; they are not312 unique skill names. Canonical registry discovers306 occurrences; independent archive/file-walk equality also includes6 auxiliary layouts.

Each record and short presentation has an independent model review bound to its canonical SHA256. This is documentation verification, not execution certification, signature authentication, medical validation or proof of unrestricted task coverage. Missing site courses never exclude a package.

## Frozen trials

| Measure | First generation | Second generation | Release criterion |
|---|---:|---:|---:|
| Positive held-out package retrieval@5 |50/57|54/57|at least52/57|
| Held-out selector, including controls/compounds |39/57|49/57|at least52/57|
| Familiar production regressions |0/3|1/3|3/3|
| Unsupported/underspecified controls |12/12|12/12|0 false full recommendations|
| Compound partial cases |2/2|2/2|both explicitly disclose unsupported part|
| Selector calls / provider errors |60 /0|60 /0|errors retained in denominators|

Second-generation positive-only selection is35/43. All synthetic questions, labels and reports are now published as **exposed evaluation/regression evidence**, not a future independent held-out set. Corpus1 preceded scenario authoring; a separate fresh reviewer adjudicated its labels blind to outcomes. Corpus2 was produced by that same independent reviewer, outcome-blind, without access to authored scenarios; it is not a new author. First results were retained. Generic package context, projection-bound index identity,14 source-reviewed role corrections and minimal-shortlist intent guidance were applied before freezing generation2. No per-query routing exceptions were added. Both used the existing inexpensive `anthropic/claude-haiku-5.5` selector and BGE-M3 embeddings. Recorded total provider spend, including both document embeddings and both trials: **$0.085171377**. No quota/counter/key reset, provider change or third automatic round.

The automatic scorer checks decision and complete acceptable package sets. It does not establish semantic correctness of all60 answers. Independent manual audit of25 second-trial answers confirmed the12 controls and2 compound disclosures, and identified genuine end-to-end failures; it does not certify the other35 answers. Frozen metrics were not rewritten after that audit. Some extra relevant package selections also expose label granularity limitations, which remain reported as failures in the locked metric.

## Remaining work

The book request now retrieves `skills-book-digitizer`, but stage-specific cards can crowd out its end-to-end `digitize-book` orchestrator. A useful partial result therefore still misses the actual requested outcome. The already-distilled-book regression also fails. Full source coverage is not equivalent to reliable end-to-end routing.

Next architecture work should represent package-level workflows and distinguish stage/whole-workflow matching generically, retain atomic skill evidence, and validate unsupported boundaries. Avoid a book-keyword exception or simply widening prompt claims. Independently review coverage labels/alternative combinations and freeze new outcome-blind cases before further quality claims. No rollout until selection and critical regressions pass; public state and old index remain authoritative.

## Reproduce and refresh

```sh
node --test integrations/skill-advisor-catalog/*.test.mjs
npm test --prefix integrations/hybrid-retrieval
node integrations/skill-advisor-catalog/refresh-catalog.mjs --check
python3 integrations/skill-advisor-catalog/tools/capture-publication.py "$PWD" /absolute/new-publication.json
node integrations/skill-advisor-catalog/draft-catalog.mjs /absolute/new-publication.json /absolute/new-drafts-output docs/proposals/skill-advisor-scenarios/full-catalog/drafts.json
```

Drafting NEVER produces approval receipts. A changed record/presentation needs real independent review of its exact hashes. A new version/path requires fresh publication evidence and updated inventory. CI on package/integration/catalog changes and site assembly fail on drift; there is no scheduled autonomous approval/deployment. Site assembly copies an explicit allowlist and supplies already published aicoding.space courses. Its manifest distinguishes catalog revision from search revision, which also binds projected text.

Existing host integration is reused from PR30, head `c9554264319d2762a2666e9403f25924b3ad15b2`, ported to current flattened main. Historical evaluator fixtures retain their old identities and correctly refuse stale sources on current main; they are not full-catalog acceptance tests.

Contract verification:56 advisor tests,9 real hybrid/snapshot tests,3 assembly tests,1 disposable real-container suite passed. The container suite tests isolation, fixture search and state continuity with a dummy answer factory; real-provider trials above are separate. No live public-state handoff, live rollback or full60-answer semantic certification is claimed.
