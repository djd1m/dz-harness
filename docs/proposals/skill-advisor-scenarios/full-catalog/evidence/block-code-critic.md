# Independent code critic — full primary-source block projection

Read-only review of source-projection, source-context, search, package-retrieval, hybrid-advisor, evaluator/budget helper and site prepare, including their immediate selector-input consumers. No tests, provider calls, source edits, hidden cases or fresh outcomes accessed. Previous NO-GO quality conditions are preserved.

Verdict: **no new BLOCKING/HIGH/MEDIUM implementation defect identified in the final inspected delta.** The initially undefined budgetLimit was a known in-progress host fix; re-read confirms it is now declared and validated before output reservation. This is source review, not release approval or proof of large-generation runtime performance. Do not start a fresh paid run until the remaining technical verification is complete.

## God-object growth (BLOCKING)
None. Projection ownership remains a small application module; generic Lance code does not acquire application semantics.

## Security violations (BLOCKING / HIGH)
None found. Source block IDs are derived from owner ID, captured source hash and offset. Projection resolves remote IDs through its own owner map; remote text/evidence is ignored. Every raw ID is checked for existence/duplication and finite score before owner collapse or package truncation, including discarded lower-ranked hits. Unknown source owners and duplicate projection IDs fail. Preferred quotes are checked against the candidate's captured primary path/hash/exact offset/substrings before entering selector context. No remote evidence can substitute for the trusted block. Materializer and renderer still expose approved scenario IDs/presentations, not source block IDs or arbitrary source prose.

## Architectural concerns (HIGH / MEDIUM)
None. Both hybrid and lexical availability fallback operate on the same bounded source projection, resolve to the same scenario owners and use the same grouping. Repeated blocks collapse by owner before the first-five-package and two-atomic-per-package rules. The final selector surface remains at most15 cards, with at most2 nonoverlapping900-character excerpts per card. Raw candidate bound is now100, which is within the existing service's1–100 limit; the64KB response reader accommodates100 fixed-length source IDs and scores. A highly concentrated raw100 remains a possible recall limitation and is diagnosed; the code does not invent missing packages to claim five-package coverage.

The lexical projection prepares stems/document-frequency once at startup rather than rebuilding all8926 projected documents for every request. New runtime startup builds one context and one projection; that same context reaches liveAnswer, avoiding a second cache there. No request-time file or network source fetch is introduced.

## Anti-pattern violations
None new. Prior unknown-paid-cost fix remains wired: actual finite nonnegative receipt cost is recorded separately from conservative unknown reservation, and both count in later admission checks. No automatic selector retry is added.

## Type / contract issues
Runtime, build and evaluator use `advisorIdentity(catalog, projection.documents)`, so the actual full projection bytes determine snapshot identity. The default helper still supports summary-only fixtures, but production createHybridAnswer explicitly passes the full projection; prepare and full-evaluate do likewise. Site allowlist includes source-projection and source-context. Summary and block IDs coexist without duplication, and blocks cannot escape their approved owner.

Re-read evaluator's final flag parser: budgetLimit is declared from --budget (default .5), finite/positive and bounded at .75; priorCost must be finite/nonnegative and below that limit. Admission/post-call checks use the same budgetLimit. This resolves the known undefined-variable/incomplete-parser interim state seen at review start. CLI help text still omits --budget, a minor documentation issue only.

## Edge-case sweep
Inspected repeated owner hits, summary plus block for same owner, overview enrichment, discarded sixth package, empty lexical hits, remote unknown/duplicate IDs, forged quote fields, preferred evidence from another owner, stale source hashes, projection over10000 rows and source/summary identity changes. Hash/presentation validation remains upstream of runtime projection. Every returned source excerpt remains tied to its actual primary source; unrelated atomic quotes are not reassigned to an enriched overview.

## Test quality
Read block-tests-final.log:70/70 pass; block-hybrid-tests.log:9/9 pass. New source-projection tests include actual Lance HTTP source-only retrieval, lexical source-only fallback, owner collapse, forged remote prose ignored, unknown trailing raw ID rejection, duplicate IDs, unknown owners and preferred-source isolation. These are useful integration checks rather than source-string assertions. The tests use a small fixture and do not establish production-scale latency or peak memory; reviewer ran none.

## Process / done-ness gaps
block-index-receipt.json reports8926 documents, ready status and identity5f3f0f2c160fd00df167539c8a465d6dd42f8ca79a8523917af2e7154a24fcd9. Source projection enforces the existing10000-document cap. This is successful offline index evidence, not successful advisor/search operation under container resource limits or semantic evaluation.

The same receipt records known aggregate spend .364499542 plus unresolved reservation .000422068. The next evaluator takes only one incoming prior-cost number, so that value must conservatively include both (at least .36492161 for this receipt alone), plus any later spend/reserve. Do not drop prior unknown reservations when crossing from embedding build to evaluation. This is a concrete handoff obligation, not an additional service or gate.

## Production safety
The scale rises from369 to8926 projected documents. Advisor retains literal source windows and a prepared lexical corpus; search retains the Lance snapshot and performs exact vector/FTS retrieval. Compose still sets advisor256MiB/0.5CPU and search512MiB/1CPU, and hybrid timeout remains2s. No request-time reparse of all source documents occurs, but source inspection cannot prove peak memory or elapsed time within those limits. The existing technical check should use this actual large generation and default runtime, including an unpaid query/availability fallback, rather than citing the previous369-document smoke as equivalent. No new framework/container is needed. No live public-state or production rollout evidence is claimed here.

The owner's discovery-package recommendation policy is reflected in dialogue instructions; this review does not reinstate the superseded prohibition or treat an explicitly relevant discovery package as inherently wrong. Actual semantics still require the independent outcome audit.

## Suggestions only (LOW)
Include --budget in evaluator usage text. No further code changes requested by this review.

## Skipped checks (transparency)
Did not run tests, builds, benchmarks, embedding/selector calls or a live/default runtime. Did not inspect held-out queries or new outcomes. Did not re-audit source semantic approvals or generic Lance internals beyond relevant limit/identity contracts. Large-generation runtime memory/latency and final amended driver execution are not established by the earlier test logs. No native receipt or prior quality condition was changed.
