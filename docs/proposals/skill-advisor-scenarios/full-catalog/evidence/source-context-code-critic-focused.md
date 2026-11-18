# Focused Code Critic — ADR-003 fixes

Verdict: **previous HIGH unknown-spend accounting finding resolved in the inspected implementation; no new material defect found in this fix delta.** This clears that code objection to the authorized controlled trial, not release acceptance or semantic quality. No new trial outcome was read or inferred.

## God-object growth (BLOCKING)
None. Cost accounting is a tiny dedicated helper.

## Security violations (BLOCKING / HIGH)
None newly identified. The fix touches offline evaluation accounting and bounded context selection, not public authorization, keys or runtime state.

## Architectural concerns (HIGH / MEDIUM)
None. evaluationAttemptCost classifies a finite nonnegative numeric cost as observed; every missing/malformed receipt retains the entire pre-call ceiling as reserved spend. The helper is explicitly imported by the actual evaluator and included in codeHashes.

## Anti-pattern violations
The HIGH from source-context-code-critic.md is resolved. The report initializes unknownCostReserve to zero. The real selector success/error flow always reaches evaluationAttemptCost after an attempted call, adds observed spend to cost and unknown spend to unknownCostReserve, then persists the row/accounting. Both subsequent admission and aggregate checks include known cost + unknownCostReserve + priorCost; the next request also includes its own ceiling. Thus timeout/unreadable JSON/missing usage no longer release headroom. Known zero is accepted only as a finite numeric receipt. Missing or malformed embedding usage stops before further paid work, while an embedding exception also terminates the driver; neither proceeds into a free-call loop. Reserved spend remains explicitly separate from reported actual spend.

## Type / contract issues
No new issue. The reservation helper rejects invalid/negative reservations. Malformed cost examples cover null, strings, NaN, infinity and negatives. Source fallback now applies the same >=900-character start separation as ranked selection, so it cannot append the overlapping tail identified in the previous LOW suggestion. Returning one eligible window remains within the at-most-two contract.

## Edge-case sweep
Focused inspection covered repeated unknown-cost failures, actual zero, small observed cost releasing only unused headroom, invalid reservation, embedding unknown-cost termination, selector materialization/render exceptions and source tail adjacent to an already selected chunk. Unknown costs are conservative reservations, not claimed actual charges. No paid retry was introduced.

## Test quality
Read evaluation-budget.test.mjs: malformed/missing receipt matrix plus repeated-failure admission-headroom example. Traced the helper through the actual driver's initialization, calls, accumulation and next-call guard, rather than assuming isolated helper assertions prove wiring. Read context-tests-final.log: 67/67 pass. Reviewer executed no tests. Existing source-context isolation tests remain present.

## Process / done-ness gaps
No new trial or release claim. Prior failed quality evidence remains unchanged. Controlled real outcomes and the independent semantic audit are still required.

## Production safety
Read runtime-smoke-v4.log: default runtime reports 369 catalog/snapshot records, 20 raw search hits, unpaid origin rejection 403, unchanged disposable state after restart, zero paid calls, dummy provider key and untouched live public state. Its workflow-candidate image identity is evidence for that named runtime smoke; it is not evidence of a new paid source-context outcome or live deployment. No such claim is made here.

## Suggestions only (LOW)
None additional. Previous tail-overlap suggestion is fixed.

## Skipped checks (transparency)
No source/test edits, tests, provider calls or new outcomes inspected. Did not re-run the full original code audit, fetch model pricing, certify provider billing ceilings externally, or exercise live public state/rollout. Inspected the targeted fixes and their immediate consumers. No native release condition was altered.
