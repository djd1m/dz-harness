# Verified candidate report — 2026-11-10

## Outcome
Reusable hybrid search package and advisor adapter implemented; two isolated Docker candidates verified. Public deployment remains excluded. Source code and scenario approvals are reviewable in GitHub.

## Changes
- Standalone generic snapshot API: buildSnapshot/openSnapshot/search, injected lexicalizer, explicit revision/model/dimension/content identity, real persisted-content verification and atomic immutable publication. No DZ data or model key required by core.
- Optional embedding provider adapter separate from native core. OpenRouter BGE-M3 may echo canonical BAAI/bge-m3 or Parasail's parasail-bge-m3: verified [official provider listing](https://openrouter.ai/baai/bge-m3/pricing) and endpoint metadata; only explicitly configured response model IDs accepted, actual ID/usage retained. Unknown model IDs still fail. Native package profile excludes unused model/image integrations, audit0 known vulnerabilities.
- Advisor sends query+vector to private search and attaches host-approved records to returned IDs. Availability timeouts/dependencies use explicit lexical fallback; corrupt/stale identity or invalid records fail closed, including mislabeled503 corruption. No untrusted remote explanations/courses rendered.
- Capture-ADR card now quotes what Context contains and explains its already-supported alternatives; independent approval/presentation hashes regenerated for affected card only. Generic instruction clarifies outcome subparts without expanding scenario boundaries. Current32 approved cards/no exclusions, revision9ab051f6be0f6ad8d465f2258ce2171b3e06ce6a1a8546341bd4f12bacfe7bd0.
- Site HTTP supports direct answer injection while retaining earlier proxy path. Container advisor applies both canonical ledgers once, rejects missing state; search gets no key, only internal network and read-only index. Both nonroot/ROroot/dropcaps/limitedresources. Static site image and dependencies unchanged.

## Final verification
- 47/47 catalog/selector/renderer/HTTP/ledger/adapter regressions passed.
- 9/9 real native module tests passed, including unrelated npm-tarball HTTP consumer, immutable/concurrent builds, actual disk corruption, identity/vector rejection and independent RRF ranking oracle.
- 11/11 site transport/admission/socket/callback tests passed.
- Real Docker test passed with actual candidate Caddy fragment, private-network denial, read-only Lance, UID/caps/resource assertions, two-ledger restart/crash recovery and unaffected static route.
- Separate actual provider path: advisor container HTTP→embedding→search container→Haiku→trusted renderer returned200/recommend/skills-meta for original English ADR task; course URLs remain governed by the unchanged verified mapping; skills-meta has no verified course link and this response correctly has courseUrl:null. Test COPY of model attempts3→4 and admission1→2, originals untouched. No HTTP host port was published. This provider check starts at advisor API; Caddy was independently tested with a nonpaid factory, not claimed as a live browser test.
- Both temporary live containers stopped, temporary key copy removed; original ten containers still running.
- K2 PASS, OpenSpec1.17.0 strict validate PASS; independent cross-model code review and site container critic closed their findings. Final QE convergence receipt is recorded separately.

## Semantic evaluation and retained failures
The first paid12-question embedding batch was rejected because a provider echoed parasail-bge-m3. That failed response's usage was not captured: its exact cost is unknown, not zero. A single diagnostic11-token response and a second12-question batch captured usage/model metadata. The second batch's vectors were reused after explicit alias verification rather than charged again. Embedding receipt/error metadata is sanitized.

An earlier90-call development run (historical64 + new12 with hybrid and semantic + two known repeats) had90 valid responses and87 strict matches. Its window was expanded to the whole corpus, which caused x01 to lose its card; this is a retained failed integration configuration. x16 supplied an additional useful test scenario and x18 has a disputed factual-CJM label. Neither is silently relabeled to improve scores. All12 fresh questions passed BOTH retrieval variants, so no fusion-specific quality claim follows. Original x38 plus two repeats passed; no keyword or renderer override was introduced.

Final code restores the native requested candidate window of the successful earlier experiment. Real HTTP search parity over64 questions finds complete relevant sets for54/54 labelled cases. A separately recorded final14-call run (x01, new12, x38) passed14/14. This is targeted verification, not a replacement claim that a whole final64-answer run occurred. New source/context guard changes during the earlier run affect validation/error boundaries, not its successful prompt; per-run code hashes distinguish actual versions.

Recorded provider-reported costs for the90-call run (including reused12-vector batch) are$0.068593289; final14calls$0.011006523. Additional diagnostic single costs$0.00000011. The first failed response and live API response do not expose complete per-call billing receipts here; total billed cost remains unverified. Projected additional check budget$0.30 was not exhausted; no claim of changing provider key quota is made.

## Limits and next deployment boundary
Development sets are catalog-aware; they do not establish population accuracy. Native cutoff ties are owned by Lance; final returned score/ID order is stable, not an invented global tie-membership guarantee. Snapshot currently bounded to10000 records with flat vector scans; only small corpora tested. Provider weights/version stability is external. No availability/SLA/load test or public abuse guarantee. Existing global30/10day/5s/oneactive counters limit requests; embedding adds a paid operation per request, dollar quota remains provider-owned. Crash-lock recovery requires verified stopped owners; no automatic unlock/reset.

Production wiring, public UI activation, live TLS rollback rehearsal and npm publication remain separate actions. Candidate containers/packages are complete and tested; they are not installed as permanent services.
