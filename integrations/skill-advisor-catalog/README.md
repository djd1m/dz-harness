# Source-grounded advisor host integration

Reusable host-side advisor/search integration ported from PR30 (head `c9554264319d2762a2666e9403f25924b3ad15b2`) onto current package sources. It is not installed by `dz init` or published as an npm package. This source port does not itself deploy a website, activate services or schedule refreshes.

## Current full catalog

The captured generation under `docs/proposals/skill-advisor-scenarios/full-catalog/` accounts for 57 packages and 312 shipped SKILL.md occurrences, with 369 reviewed records including 37 package-workflow overviews and 20 supporting-package records. The source capture is pinned to `a2af2732b01d516966e076db77c35902f5e72ac1`. Counts describe this captured source generation, not arbitrary user-task coverage or proof that the skills have executed. Source identity, exact publication evidence and approval hashes are retained with the generation.

```sh
node integrations/skill-advisor-catalog/refresh-catalog.mjs --check
node integrations/skill-advisor-catalog/cli.mjs search 'Развернуть приложение на Cloud.ru'
node --test integrations/skill-advisor-catalog/*.test.mjs
npm test --prefix integrations/hybrid-retrieval
```

These commands make no paid provider calls. The search CLI returns candidates. The host supplies approved candidates to an ID-only selector and materializes approved presentations; generated model prose is discarded. Course links are a separate verified mapping: absence of a course does not exclude a package. Supporting libraries and adapters have package records without invented skill IDs.

## Review and refresh

Authors prepare source-grounded scenario and presentation drafts. Independent reviewers approve the exact record and presentation hashes. `draft-catalog.mjs` creates drafts only: it NEVER grants automatic approval. Source-byte, package-version, inventory and approval drift must be corrected by capturing and independently reviewing a replacement generation.

`refresh-catalog.mjs --check` compares the current package/source inventory with the captured inventory, validates the complete approved catalog, checks its presentations and constructs the full source projection offline to enforce its 10,000-document ceiling. Missing, stale or unreviewed records fail the check; a smaller approved subset is not a successful full-generation refresh. A previously published generation must remain intact while its replacement is prepared.

The package-change gate is defined in `.github/workflows/advisor-catalog.yml`. It checks package sources, integration code and catalog data on pushes and pull requests with Node 24 and offline tests. CI verifies source/receipt consistency, not semantic correctness or reviewer identity. A failing drift gate intentionally requires a reviewed replacement generation. Automated capture/publication tooling and a scheduled production refresh are forthcoming; this workflow performs neither publishing nor paid evaluations.

## Historical evaluations

`evaluate.mjs`, `answer-evaluate.mjs` and `acceptance-evaluate.mjs` load the frozen A/B/C catalog through `historical-catalog.mjs`, preserving the old scenario IDs and presentations. They do not evaluate the 369-record generation and cannot establish its coverage, retrieval quality or deployment readiness. Historical source hashes remain enforced: if those source files have changed, the old evaluation refuses rather than pretending to validate current sources.

```sh
# Historical retrieval only; choose a new report name.
node integrations/skill-advisor-catalog/evaluate.mjs --suite regression --output my-historical-retrieval.json
```

Adding `--model` to `evaluate.mjs` explicitly enables a paid historical selector trial. `answer-evaluate.mjs --run` and `acceptance-evaluate.mjs --run` are also paid opt-in historical drivers. They require a securely supplied `OPENROUTER_API_KEY` and refuse existing reports. Never commit credentials. Historical question/label hashes and failed usage evidence remain preserved; these small development sets are not held-out full-catalog evidence.

[Historical first iteration](../../docs/proposals/skill-advisor-scenarios/REPORT.md) · [Iteration 2](../../docs/proposals/skill-advisor-scenarios/ITERATION-2.md) · [Short-answer iteration](../../docs/proposals/skill-advisor-scenarios/ITERATION-3.md)

## Host runtime boundaries

`answer.mjs` and `dialogue.mjs` retain host-owned selection contracts, partial fit, abstention and targeted clarification. Never accept a selection contract from model output. Semantic completeness remains probabilistic even when ID validation succeeds.

Gateway mode (`start-preview.py --gateway`) requires the persistent `ADVISOR_REQUEST_LEDGER`. Production assembly must preserve quota/history state, signing identity, provider limits and isolation. A catalog refresh does not authorize resetting these controls. The immutable catalog/presentation and Lance generation must be validated and switched together by the deployment host; no active index is updated in place by this integration.

## Full-catalog candidate status

[Full-source coverage and frozen trial report](../../docs/proposals/skill-advisor-scenarios/full-catalog/REPORT.md):57 packages,312 shipped skill-file occurrences,369 source-bound scenarios. Release remains NO-GO after the fifth controlled trial: one compound semantic failure and unresolved native lineage remain; all preceding trials are preserved; do not deploy this candidate merely because source/contract tests pass. `full-evaluate.mjs` accepts an independently frozen label corpus, an immutable matching snapshot, a NEW output filename and a key-file path; `--selector` explicitly enables paid calls. Published trial corpora are exposed regression evidence, never new held-out data. The automated scorer is not a semantic audit.

## Bounded primary-source retrieval

The optional production factory indexes approved summaries plus hash-verified literal source windows in one immutable Lance generation (8,926 documents in this capture). Internal chunk IDs map only to approved host-owned scenarios; they are never selectable package IDs. Up to 100 validated raw hits collapse to at most five distinct packages, each with its overview and up to two atomic cards. The selector receives up to two 900-character source witnesses per card; rendering remains approved host prose and links. Private retrieval traces are evaluation evidence, not public query logs. Availability fallback uses the same source projection and canonical lexical scorer; integrity mismatches do not fall back.

A scoped uncertain goal may receive a source-backed discovery package and an honest next action, per the owner's prospective policy. Unsupported outcomes still require no-match or explicit partial. Old clarification-only trial scores are unchanged. The newer corpus includes decision-specific package sets; semantic reviewers must still reject irrelevant extras even when a mechanical complete-target match succeeds.

`full-evaluate.mjs INPUT SNAPSHOT NEW_OUTPUT KEY_FILE --selector --prior-cost=NUMBER --budget=0.75` opts into a bounded paid trial. The budget includes known prior spend plus unresolved conservative reservations, input-sensitive pre-call admission and failed attempts. Missing usage never counts as a free request. No failed rows are silently retried. The maximum budget is an evaluation guard, not a replacement for the deployment's standing key and visitor/network limits.
