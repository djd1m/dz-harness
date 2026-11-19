# Independent code critic — prospective label matcher and projection refresh

Read-only focused review. Inspected evaluation-matching.mjs, its three tests, actual full-evaluate call site, existing materializer and refresh-catalog. Read only corpus scoring metadata and aggregate structural facts; no new task text, provider output or trial5 outcome inspected. No tests/provider calls/source edits performed.

Verdict: **no new material defect identified in this delta.** Prospective matching follows the frozen metadata; it does not establish semantic relevance of extra packages. Previous NO-GO acceptance conditions remain open.

## God-object growth (BLOCKING)
None.

## Security violations (BLOCKING / HIGH)
None. Matcher is evaluation-only and cannot alter host-approved IDs, context or rendering. Actual materialization rejects recommend/partial with zero scenario IDs and forbids IDs for clarify/no-match before evaluation matching runs.

## Architectural concerns (HIGH / MEDIUM)
None. Decision-specific sets override generic sets; a decision omitted from an existing decision-specific map is rejected rather than falling back. Prospective complementary-package handling is explicitly activated by the frozen fifth-trial marker, not by answer content or a post-result rule.

## Anti-pattern violations
None identified. No retry, model invocation or outcome-based relabeling is introduced.

## Type / contract issues
Verified without reading task text that the first four corpus files have neither the fifth-trial marker nor any decision-specific row maps. For those actual historical shapes, matchesSelection is algebraically the previous predicate: allowed decision AND an exact complete package set. No historical report is rewritten by this change.

The fifth corpus has the marker, four decision-specific rows, and zero recommend branches whose accepted target set is empty. Its SHA256 is59175b188227fe4f91715f06efb66c8b6cd5da31c0f1e38e596d3fb92fb4feef, matching the supplied frozen identity. Therefore empty recommend cannot pass this corpus even independently of the upstream materializer. Empty target sets retain exact matching, so a no-match empty set cannot be satisfied by unrelated nonempty output. A nonempty set must still be fully included; an extra package alone cannot replace the target.

The helper is not a standalone malformed-label validator: arbitrary labels declaring an empty recommend set could admit it in isolation. That is not the actual frozen corpus or runtime flow and is not a defect claim here.

## Edge-case sweep
Inspected allowed-versus-unsupported decision, missing decision-specific key, empty output, nonempty output against empty target, complete target plus complement, complement without target, and historical exact-set mode. Test fixtures directly cover the important cross-product, empty-target and historical-compatibility behaviors.

## Test quality
Three new tests assert observable booleans for decision-specific behavior, empty no-match protection and prospective-versus-historical matching. Reviewer did not execute them or infer a passing run from presence alone.

## Process / done-ness gaps
`row.correct` now establishes a mechanical package/decision match under the frozen contract. It does NOT prove an added package is source-relevant: even an unrelated extra alongside a valid target satisfies this helper's set test. This limitation is deliberate in the supplied scoring contract and remains the independent semantic audit's responsibility. Likewise `row.falseFull` based on this boolean is a mechanical control flag, not a substitute for auditing unsupported complements/claims. Final acceptance must retain that distinction; this review does not declare semantic correctness or a new trial pass.

## Production safety
Refresh-catalog now constructs the actual context/projection after source and approval validation. The existing10000-document check therefore runs during offline refresh, rather than letting a source expansion fail only at runtime. This introduces no visitor-time I/O and does not alter records or receipts.

Read runtime-smoke-blocks-v2/report.json: successful default runtime with369 records/8926 snapshot rows, identity5f3f0f2c160fd00df167539c8a465d6dd42f8ca79a8523917af2e7154a24fcd9,100 raw search hits, unpaid403 origin rejection, unchanged disposable state after restart, zero paid calls, dummy key and untouched live public state. This supplies the actual large-generation success evidence missing from block-memory-code-critic.md. It is a bounded runtime smoke, not a load/SLA guarantee, production state proof or semantic evaluation. The parent reports the unchanged advisor256MiB/.5CPU and search512MiB/1CPU limits; this JSON itself records outcomes and image names, not those resource values.

## Suggestions only (LOW)
None additional.

## Skipped checks (transparency)
No new tests, benchmarks, provider calls, hidden queries or outcomes read. No full independent semantic audit performed. No corpus changes or historical score rewriting. No native receipt or prior NO-GO condition changed.
