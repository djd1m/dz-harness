# Hybrid retrieval experiment — 2026-11-10

Scope: offline development experiment; production advisor, renderer and catalog stay fixed. Feature-ADR S research slice: requirements → plan → executable probe → measured review. A production architecture decision follows evidence, not this experiment. Reuse `currentCatalog`, `retrieve`, `selectScenarios`, `dialogueContract`, approved presentation and course map. Dependencies confined to the experiment package, locked versions. No E2B.

Freeze at least 60 new questions before retrieval execution. Labels authored with knowledge of approved scenarios, without seeing new search results; this is a development holdout, not an external independent benchmark. Do not tune after scores. Include all 32 scenarios, English paraphrases, exact names, partial/multi-intent and unsupported/ambiguous requests.

Compare existing lexical, semantic cosine, Orama lexical/hybrid, LanceDB FTS/hybrid at top5 using identical positive document text and identical BGE-M3 embeddings. No exclusion/limitation text in retrieval document; it remains visible to existing selector. Orama native hybrid has its own scoring; record defaults. LanceDB RRF default. No assertion that engine defaults are equivalent.

Measure covered-case recall@5, all-required-in-top5, MRR, exact-ID and language slices. Negative retrieval lists are not final recommendation errors. Run the same cheap selector on baseline and best hybrid for decision/ID-set checks; false full recommendations and false abstentions reported separately. Do not certify nuanced missingParts meaning from exact-ID checks alone.

Budgets set before results: one embedding request for catalog + batched questions (3 batch + 5 single-query latency calls (8 total)); up to 128 selector calls, <= $0.50 projected charge, fail stop on unpriced/missing usage after first paid response; no automatic retries. sequential paid calls, 60s provider timeout. Reuse existing key through environment; never persist key/provider raw errors. Do not reset website trial ledgers: this separate experiment records its own calls and cost.

Performance: local warm retrieval p95 <=100ms on this 32-record corpus; query embedding p95 <=1500ms from 5 single-query probes; record failure rather than claim production throughput. Record cold init, memory, index size; embedding batches are not individual-request latency. Quality gate: no lower covered recall or exact-ID retrieval than baseline, no increase in false full recommendations. These are pilot gates, not statistical assurance.

Operations: fresh index roundtrip and revision/dimension checks; no production fallback implementation in this slice. Freeze hashes and record code/library/model versions. Before committing, code-critic review and factual review of report. No site deployment.
