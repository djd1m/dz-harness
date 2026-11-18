# Independent final code critic — embedding budget persistence fix

Read-only focused review of evaluation-budget.mjs, its new tests and full-evaluate wiring, building on the completed source/projection/runtime reviews. No edits, test runs, provider calls or new evaluation performed.

Verdict: **the embedding admission/persistence defect is corrected in the inspected code; no new material defect identified.** This is code-quality review, not release acceptance or formal native QE closure.

## God-object growth (BLOCKING)
None. The helper remains a small offline evaluation concern.

## Security violations (BLOCKING / HIGH)
None new. Production provider, quota/signing state, source boundaries and runtime implementation are unchanged by this fix.

## Architectural concerns (HIGH / MEDIUM)
None. full-evaluate obtains model-specific embedding pricing from the official embeddings metadata endpoint before the paid batch loop, stores the observation and passes it to the single shared batch guard. The helper includes prompt bytes, overhead, maximal supplied price tiers, request price, margin and fixed allowance in a pre-call reservation. It uses the existing unknown/observed accounting classifier rather than another inconsistent receipt policy.

## Anti-pattern violations
The reported defect—recording charged embeddings only after a budget throw—no longer exists on this path. Admission checks known spend, prior spend, existing unknown reservations and the new batch estimate before provider invocation. The helper adds/persists the reservation before invoking client.embed. On success it settles valid observed cost or retains unknown reservation, persists the resulting totals, THEN throws for unknown spend or budget overrun. On provider error it likewise records valid attached usage or preserves the reservation, persists, and rethrows, so the driver cannot proceed to another paid batch. A persistence error before invocation prevents the paid call. The driver has no catch that converts these failures into a continued batch loop.

Known overrun is durably visible even if a provider receipt exceeds the estimate; estimates are not an external billing guarantee. Missing/malformed receipt does not become zero committed spend. This addresses both normal and exceptional paths without adding retry or resetting prior state.

## Type / contract issues
Pricing checks reject missing/nonfinite/nonpositive prompt rates and nonfinite/negative request rates. The actual caller supplies validated finite priorCost/budgetLimit and initialized cost/unknownCostReserve. Receipt cost must be finite, numeric and nonnegative; malformed values retain the conservative reservation. Text input remains bounded by the existing embedding client's validation. No runtime API contract changes.

## Edge-case sweep
Read the actual helper/driver flow for admission refusal, persistence before provider call, known success, known overrun, error with known usage, error without receipt, unknown successful receipt and error propagation stopping later paid work. The new helper is included in evaluation codeHashes via evaluation-budget; the shared driver import actually uses it for every query-embedding batch.

## Test quality
Read embedding-budget-fix-tests.log:5/5 pass. Three new meaningful tests establish no provider invocation when admission fails; persisted known overrun before refusal; and a durable pre-call reservation followed by unknown-error retention or known-error settlement. The two prior accounting tests remain. Reviewer ran no tests. These mocked-provider tests appropriately isolate billing-response/error behavior without spending money.

## Process / done-ness gaps
Independently SHA256-hashed full-evaluate-v5-executed.mjs:35c9fb817e4a3d5e3199cfb473d756ae4661acfc32877a0d46613aa01a1d9520. It matches evaluation-source-blocks.json codeHashes.full-evaluate. The completed report is therefore explicitly attributed to its archived executed evaluator, not falsely relabeled as having used this later fix.

From that unchanged completed report: run cost0.16962129900000011 + priorCost0.36494991 + current unknownCostReserve0 =0.5345712090000001 (rounded0.534571209), below its recorded0.75 allowance. PriorCost is the caller's carried accounting total; earlier unknown reservation must remain included as previously documented. The current helper fix does not rerun or rewrite these historical receipts.

The parent reports an all74 semantic audit with71 fits, no fabricated outputs or actual false-full outcomes, but incomplete compoundC02 and discoveryN11/N12 errors; frozen automatic results remain separate. This code review does not re-score or independently certify that audit. It grants no release-quality pass. Missing formal native history cannot be repaired by resetting lineage, and this report does not substitute for formal QE closure.

## Production safety
Only offline evaluator/helper/tests changed. Existing actual8926-row default-runtime smoke remains the separate runtime evidence. No additional paid work, production deployment, key/quota reset or live public-state mutation was done by this reviewer.

## Suggestions only (LOW)
None additional.

## Skipped checks (transparency)
Did not fetch current pricing, run tests/builds, repeat semantic audit, call providers or exercise production. Reviewed helper/control-flow and supplied test log; verified archived evaluator hash and aggregate numeric accounting only. Prior code reviews cover unchanged source projection/render boundaries. No native conditions or release gates modified.
