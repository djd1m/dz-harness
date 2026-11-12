# Independent code review

Scope: reusable `integrations/hybrid-retrieval/{index,service,openrouter}.mjs`, package/readme and `snapshot.test.mjs`; advisor `{hybrid-advisor,hybrid-advisor.test,preview-server,dialogue}.mjs`; existing selector/trusted presentation boundary and approved ADRs. Reviewer did not author implementation. Applied code-critic skill; no tests or paid calls run by reviewer.

Verdict after focused closure: no outstanding code findings in reviewed scope. Original findings and their closure are retained below. Final retrieval-window verification is separate from the preserved 90-call run.

## God-object growth (BLOCKING)
None.

## Security violations (BLOCKING / HIGH)
None identified in reviewed scope. Transport only supplies IDs; host-owned records/presentation remain authoritative.

## Architectural concerns (HIGH / MEDIUM)
**HIGH — integrity failure becomes availability fallback.** `integrations/hybrid-retrieval/service.mjs` error mapping (about lines 37–41) sends `SNAPSHOT_CORRUPT` as HTTP 503. `integrations/skill-advisor-catalog/hybrid-advisor.mjs` (about line 29) treats every 5xx as `search-unavailable` and returns lexical success without inspecting the typed body. The core explicitly raises `SNAPSHOT_CORRUPT` when search scores are invalid, so this is an actual defined error path, not a speculative category. It contradicts the ADR's integrity-fail-closed boundary. Give integrity errors a distinct nonavailability status and prove it survives the real service/adapter boundary; retain fallback for genuine availability failures.

## Anti-pattern violations
No additional findings.

## Type / contract issues
No additional merge-blocking finding. See suggestion for malformed primitives.

## Edge-case sweep
Reviewed overwrite/concurrent builder locking, revision mismatch, corrupt stored rows, vector bounds, body limits/deadlines, and closed snapshot behavior. Search lifetime belongs to caller and is documented. Crash leftovers are explicitly owned manual cleanup. No new defect beyond integrity transport identified.

## Test quality
**MEDIUM — exact top-five/order contract lacks independent oracle.** `snapshot.test.mjs` first test (about lines 33–50) assigns `expected = await snapshot.search(apple)` and compares reopened instances to it. It asserts only the first ID, and the tie case again compares instances without asserting ID ordering. This would pass with consistently wrong fusion ranks/tie ordering. Add a deliberately conflicting lexical/vector fixture and independently calculated expected RRF order, including the tie IDs. Existing tests provide meaningful real-Lance, corruption, HTTP and external npm-tarball coverage; they are not mocked substitutes.

## Process / done-ness gaps
Final live evaluation artifact not yet available (`evaluation/context.json` only). Therefore no claim that x38 semantic failure is repaired. Independent source audit previously confirmed Context includes alternatives and the added generic instruction preserves outcome boundaries. Review actual x38 and n01–n06 outputs when results arrive.

## Production safety
No public deployment assessed or authorized by this review. Candidate README explicitly bounds native support to Linux x64 glibc/Node24, so no cross-platform promise is inferred. Core and optional provider import boundaries remain separate. Container/site runtime is another reviewer's scope.

## Suggestions only (LOW)
`openrouter.mjs` accesses `body.data` after JSON parsing and sorts/accesses data entries without guarding null entries; `hybrid-advisor.mjs` accesses hit.id without guarding null hits. Malformed primitives therefore escape as raw TypeError instead of the advertised typed embedding/integrity errors. Current handler still fails closed, so this is not an availability or disclosure defect. Guard record shapes before property access if preserving the typed public API contract.

## Open questions for the parent
None beyond pending live semantic evidence.

## Skipped checks
No runtime tests/lint/typecheck (critic is read-only); parent reports 7 real-Lance and 45 advisor regressions passing. No production deployment, container hardening audit, or independent population-quality inference. Project architecture/vision.md and architecture/degradations.md are absent; used feature requirements/ADRs and candidate README boundaries.

## Focused semantic/helper follow-up

Read completed `/var/lib/aicoding/advisor-hybrid-service-20261110/evaluation-v2/results.json` and individual answers against frozen `new-questions.json`, the historical questions, and affected trusted cards. 90/90 outputs valid, 87 strict correct: historical 61/64, fresh hybrid 12/12, fresh semantic 12/12, known x38 repeats 2/2. Original x38 plus both repeats recommend only meta-capture-adr with no missingParts. n01–n06 pass in both retrieval modes, including alternatives/rejected-option paraphrases and missing-rationale oversight. Rendered n01 preserves human review and already-decided boundaries. n07 correctly routes undecided architecture/implementation to feature-adr, not capture-adr. n08 money transfer, n09 actual production migration and n10 airfare payment remain exact missingParts; n09 rendered text explicitly limits migration to planning. n11 abstains; n12 asks task-object. No observed broadening in tested negative boundaries, no keyword override. Equal semantic results mean the context fix cannot be credited to hybrid fusion.

Historical mismatches retained: x01 no-match; x16 adds qe-generate-tests to expected refactor-only; x18 returns partial for reconstruction/friction. x16 is a strict extra-ID mismatch, not demonstrated unsafe full coverage: both selected cards support testing/refactoring. x18's actual card promises hypotheses/prototype, not verified customer behavior; report the mismatch without claiming unconditional source-backed complete coverage. These are development/regression observations, not population accuracy or proof of deterministic repair.

Focused helper review: explicit responseModelIds allowlist keeps provider aliases application-owned, default helper strict, arbitrary models rejected. Observed canonical/Parasail alias correction is appropriately bounded. At time of read, embedding-model error usage fields were copied raw unlike sanitized success receipts; requested identical sanitization. Null-body/null-before-sort guards remain a low typed-error contract suggestion. Advisor null-hit guard is now present. No implementation edits by reviewer.

## Final focused code closure

- HIGH integrity transport: closed by mapping SNAPSHOT_CORRUPT to HTTP409 and independently checking integrity error codes in the bounded advisor error-body parser, even if a proxy sends503. Read dedicated service409 and adapter503 regression cases. Genuine availability fallback remains explicit.
- MEDIUM ranking oracle: closed by a seven-document fixture with independently asserted lexical/vector branch rankings, hand-calculated RRF(k60, zero-based) scores and explicit returned-ID tie ordering. The final implementation passes requested limit directly to native Lance, restoring the measured five-candidate branch window. README explicitly limits tie sorting to returned members; native tied-cutoff membership is not represented as global deterministic ID ordering.
- LOW malformed primitives/usage: provider body and entries are guarded before sorting; advisor hits guarded before ID access; success and embedding-model error receipts share numeric/range sanitization. Explicit response model aliases remain narrowly application-configured.
- Fix-delta audit: read changed parser, status mapping, query window, oracle, guards and documentation. No new concrete defect identified. No tests run by critic; parent/core author owns final execution evidence.

The previously audited 90-call evaluation used the earlier all-document fusion window and must remain preserved as that version's evidence. Restoring native five-candidate branch windows can change retrieval/model inputs; do not describe those 90 calls as execution of final code. Parent is performing distinct final-window x01/fresh12 verification and recording final code hashes. Semantic instruction/source approvals are unchanged.

Reviewed final focus hashes:
- `integrations/hybrid-retrieval/index.mjs`: `9d81f45a055882e5eef689f315f31c7e558d27b5e7694aa50650d6da7cac9d50`
- `integrations/hybrid-retrieval/service.mjs`: `918c6b69051a78f8b887c50591f7234f760ecb54b6c0d418a9b65f16b685fb9d`
- `integrations/hybrid-retrieval/openrouter.mjs`: `c369a7bc7ae02a4ea0bb49ee31a1bd6e776855a94ee83334d56e07185a042d25`
- `integrations/hybrid-retrieval/snapshot.test.mjs`: `2e0056fbcb63ad22f4c859f474519a2a07383c50ad6aa1a3b7b47758e28c1eb4`
- `integrations/skill-advisor-catalog/hybrid-advisor.mjs`: `30fafbfdafd3a3ed56434335835575674ced89b17e9442dba355dd4104953dce`
- `integrations/skill-advisor-catalog/hybrid-advisor.test.mjs`: `ec6db178fc9ba61d3ae81fa4b5ae7492eb6d69ddb6a566b6d5769732155cf50e`

## Final QE receipt

Independently verified all30 prepared manifest entries for QE revision `6632822fd26f78295c93d02e5450deea248e8268aef745a1883068ca54726290` and final14 evidence code hashes. Inspected all final14 decisions/missingParts against frozen cases, final54/54 labelled retrieval coverage over64, actual live hybrid answer and copied-ledger deltas, site/container test records and08 report. Report correctly separates earlier90-window evidence and final14, preserves failures/unknown costs, and has no unsupported meta-course link or public deployment claim. No remaining concrete findings. Own clean `qe-primary` owner-exception receipt written with prepared nonce/revision; no tests or paid calls run by reviewer.
