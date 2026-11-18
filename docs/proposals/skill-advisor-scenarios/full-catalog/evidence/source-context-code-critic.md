# Independent code critic — ADR-003 source-context candidate

Pre-trial source review only. No source edits, tests, paid calls or held-out queries read. Scope: new source-context builder/tests, shared source reader, answer/dialogue/live/evaluation plumbing, selector output cap and site assembly. Prior ADR-002 review remains applicable to grouping. Actual logs read: context-tests-final.log 65/65, context-hybrid-tests.log 9/9, context-assembly-container-tests.log 4/4 (assembly plus disposable-container checks). These are deterministic checks, not real semantic acceptance.

Verdict: **one HIGH budget-accounting defect to fix before the controlled paid trial**. No source/render security defect identified. No release approval.

## God-object growth (BLOCKING)
None.

## Security violations (BLOCKING / HIGH)
No new source access or rendering violation found. Shared readCatalogSource retains repository containment, absolute/traversal rejection and realpath checks. Context chooses a source already recorded on the candidate, checks its captured hash at startup, caches literal text and performs no request-time filesystem/network fetch. Primary SKILL takes precedence over README; the current one-skill-per-atomic schema keeps that mapping unambiguous. Context is supplied only as candidate JSON data, not system instructions. Host materialization still rejects unknown IDs and rendering uses approved presentation/link fields. The malicious-source test checks deterministic confinement; it appropriately does not claim immunity to semantic misselection of a valid ID.

## Architectural concerns (HIGH / MEDIUM)
None identified. New module is small and reuses canonical source access/stemming. Both actual liveAnswer and the trial construct the context cache once. Assembly includes source-context.mjs and already copies the captured sources. Existing selector/model/service/state boundaries remain intact. Request ranking operates in memory; no new runtime provider or source lookup.

## Anti-pattern violations
**HIGH — Unknown paid cost is silently treated as zero, invalidating the new aggregate admission ceiling.** `integrations/skill-advisor-catalog/full-evaluate.mjs:65–87`, consuming `selector.mjs:20–31`. The new requestCostCeiling admits a call only while known spend plus that ceiling fits $0.50, but after a timeout, an unreadable HTTP JSON response, or a successful response with missing usage, the driver adds `row.usage?.cost ?? 0` and continues. A provider can have completed and charged a timed-out request; selectScenarios has no receipt on that path. The next call reuses all supposedly unspent budget because the previous ceiling was never retained. Repeated paid receipt-less failures therefore break the explicitly named aggregate budget even though every individual admission check passes. This is traced through actual exception propagation, not a hypothetical unknown caller. Preserve an upper-bound reservation for unconfirmed spend separately from actual reported cost, or persist the unknown-cost failure and stop further paid work until reconciled. Validate received cost as a finite nonnegative number before releasing the reservation. Add a focused test using a provider timeout/no-usage result to prove a later call cannot consume the same allowance. No live failure was induced by the reviewer.

## Type / contract issues
No additional material finding. Canonical source reader rename is consistently applied to manifest/source reads. Optional sourceContext parameter preserves historical consumers; actual current runtime and evaluator opt into it. Output cap 1800 is shared with evaluation calculation rather than duplicated. Context quotes remain literal and at most 900 characters each, at most two per card, with at most 15 cards from existing grouping.

## Edge-case sweep
Inspected missing/stale/escaping source rejection at startup; unknown scenario ID; no lexical match; primary-source precedence; source-instruction text; malformed model output; provider timeout/missing cost; optional contract callers; and packaging dependency inclusion. The substantive failure is the unknown-cost accounting path above. Source/file failure does not silently degrade to stale context.

## Test quality
Three new context tests exercise actual builder -> request contract -> selector materialization -> renderer with source-shaped malicious data, plus missing/hash/path failures. Existing full suite passes in the inspected logs. No new deterministic test currently establishes the modified aggregate budgeting behavior under unknown spend. That specific missing test accompanies the real defect above, not a request for broad extra barriers.

## Process / done-ness gaps
The further 74-call stage is authorized by ADR-003 and remains pending; prior failed outcomes are preserved. Code checks alone do not establish its semantic thresholds, manual74 audit, or production readiness. The private receipt source-boundary-review.json records the adapter progressive-disclosure limitation correction; this source review did not re-author its prose or inspect hidden cases.

## Production safety
No quota/reset/signing-key/runtime-provider change found. Snapshot and existing source record hashes continue to bind the candidate; context configuration is code-bound in evaluation hashes. The new full-evaluate metadata fetch is offline trial pricing lookup, not visitor-time network I/O. Its request cost upper bound uses the actual augmented contract JSON, system text, shared output maximum, verified pricing and padding; fixing unknown-spend handling is required for that bound to survive failed requests.

## Suggestions only (LOW)
`source-context.mjs:35`: the tail fallback bypasses the >=900 start-distance used by ranked selection. If the first selected window starts 700 characters before the last window, adding the tail produces a 200-character overlap. ADR-003 calls the selected windows nonredundant. Reuse the same separation predicate when adding fallback windows, choosing a different eligible window or returning one. This does not violate the total cap or literal/source isolation, but wastes part of the constrained evidence budget.

## Skipped checks (transparency)
No tests, network calls or benchmark probes executed by this reviewer. Current provider prices were not independently fetched; reviewed the runtime pricing lookup/validation and accounting code. No held-out queries or new outcomes inspected. Did not repeat every semantic source review. Did not establish production pair rollback/public-state continuity or any paid-stage result. Native quality conditions/receipts remain untouched by this pre-trial review.
