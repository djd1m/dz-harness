# Minimal prompt-isolation review

Approved the removal of the new general instruction paragraph. Current compact-dialogue diff against origin/main only changes contrast splitting and bounded meta-followup extraction; system instruction text is restored. No new source concern introduced by this removal.

Inspected compare-existing-inputs.mjs and its report:23/23 old-case model input objects compare equal and system instructions compare equal, using the same saved real-search trace hits for both source roots. This establishes deterministic input equivalence for those23 captured retrieval traces. It does not rerun search/provider or establish identical model outcomes; the selector token ceiling is still2400 rather than1800. Preserve that distinction in release evidence. The old source root is explicitly named in the replay, so keep its provenance with the receipt.

A fresh exact-candidate public startup/restart phase is sufficient for this instruction-only final delta when retained three-phase rehearsal already establishes old/new policy-state compatibility against the same old production image and unchanged quota modules, mount/index identity and resource configuration. Bind the fresh smoke and10-case focused acceptance to final context-minimal bytes; do not reuse rejected low-effort image/receipts. No request for repeating unchanged three-phase checks.

No edits to runtime source, tests or paid calls by reviewer.

---

# Final 2400-token/default-reasoning source review

No outstanding concrete code defect found in current diff. Optional reasoningEffort and preview low-effort opt-in are removed; preview-server and selector request construction retain baseline provider-default reasoning. Selector's only new change is MAX_OUTPUT_TOKENS 1800 -> 2400 and explanation of observed reasoning-induced truncation; request ceiling assertion is updated. Existing timeout, no retries, finish_reason checks, schema/materialization validation and quota policy remain unchanged. Negative-guard repairs and bounded source-grounded dialogue retrieval changes remain accepted.

This approves source quality, not semantic release readiness. Rejected low-effort evidence must not authorize deployment. Require the newly frozen default-reasoning/2400-case run, independent semantic acceptance and rebuilt context/smoke bound to these bytes. Raising the cap permits at most 600 additional output/reasoning tokens per selector call; it does not guarantee completion or semantic correctness.

Reviewed selector SHA256: 461e50f8c9d7d7363262e632c514ef17de52c2b6630ff38acd2ca6bcc02f9670

Read-only review; no tests, code edits or paid calls. Final semantic cross-validation awaits that report.

---

# Final source review — low-reasoning candidate

Verdict: no outstanding concrete code-quality findings in the current seven-file diff against origin/main. Both reported negative-scope regressions are resolved: expanded verbs share guards and prior делай/разрабатывай forms remain recognized. Latest explicit implementation can supersede old negative history. Earlier findings below are retained as review history, not current blockers.

Reviewed selector and preview additions: reasoningEffort is optional, absence retains prior request shape, supported values are checked before provider invocation, and only the known Haiku 5.5 live caller opts into low. Schema plus reasoning parameters require provider support; the 1800-token cap, timeout, no-retry behavior, finish_reason rejection, JSON parsing and materialization validation remain unchanged. The request-contract test checks emitted low/absent parameter shapes and rejects invalid values without invoking the provider. No new capability claims or result-validation bypass appear.

Parent reports 132 passing tests and supplied observed truncation evidence plus provider capability verification. Reviewer did not independently execute tests or call external services. Low effort is a reduction in reasoning allocation, not a guarantee against truncation or semantic errors; current frozen-source 33-case acceptance and independent semantic review remain required before claiming the reported dialogue bug resolved. No additional code changes or tests requested by this review.

Reviewed runtime file hashes:

- implementation-query.mjs: ca37876fb0aaab789c25172fedbfecb7819ba91ea8ab633a49a7a3910f5312c0
- compact-dialogue.mjs: 07cab788ed3a4687d6c854f07d1b1ffa1490539b921942b8b113233c6dde146d
- hybrid-advisor.mjs: 9f4f370464e3235f1bea6ac0f6458620d46cac100aeaed8b9ef1dccd75870d98
- selector.mjs: cb0e7caf23c569f65b62906e759fefc465e31a7b9e25ea76f0daaa036058e7ba
- preview-server.mjs: 88bda852b736c85caee4accae95b35c4aa4000c10a5b3e817779fc8523bb8a1d

---

# Fix-round re-review

Original broadened-verb finding is resolved for Напиши/Реализуй/Develop/code, including latest explicit clarification superseding old negative history. Read added controls; parent reports 131 passing tests, reviewer did not execute them.

**MEDIUM — Preserve previously supported negative wording.** implementation-query.mjs negatedCreate now derives only from createVerbs, dropping old explicit `не делай` handling because `делай` is not among positive stems. Concrete request `Хочу создать сайт. Не делай сайт, только объясни варианты` now matches create via создать and emits frontend implementation expansion, whereas the old guard returned null. Retain this existing negative form (positive recognition need not expand). This is the only outstanding concrete finding; other three-file changes remain accepted on source review. Final real-model acceptance is pending and belongs to the separate reviewer.

No code edits, tests, lint or paid calls.

---

# Independent code-critic review

Scope: four-file working diff against origin/main in the dialogue candidate harness. Applied /root/.codex/skills/code-critic/SKILL.md. Read-only source review; no code edits, tests, lint or provider calls.

## God-object growth (BLOCKING)

None. Changed runtime files are 17, 136 and 86 lines.

## Security violations (BLOCKING / HIGH)

None found. No credential, admission, state, network trust or provider retry changes.

## Architectural concerns (HIGH / MEDIUM)

None beyond the retrieval contract regression below. Added vocabulary selects shipped source passages; the dedicated-carrier preference requires the same skill ID and SKILL.md hash, so it does not invent a capability or hardcode feature-adr as a match.

## Anti-pattern violations

None found.

## Type / contract issues

**MEDIUM — Expanded positive recognition bypasses unchanged negative guards.** `integrations/skill-advisor-catalog/implementation-query.mjs`, lines 2 and 13–15. The new positive expression accepts напиши/написа*, реализ*, develop and code, but test-only and negated-operation guards still recognize the previous narrower verb set. Reading the branches establishes that `Напиши тесты для backend API` and `Не реализуй backend, только объясни варианты` now return the backend development-pipeline expansion; previously both returned null. These requests explicitly ask for tests or disallow implementation, yet the new path injects an implementation carrier at the front of retrieval and adds implementation passages to compact selection. This violates the existing documented negative-scope contract and creates the same irrelevant-workflow recommendation pressure this fix is intended to remove. Align negative/test-only detection with the newly recognized forms, preserving latest clarification semantics.

## Edge-case sweep

The Russian contrast `а не только фронтенд` now remains within its clause. Anaphoric follow-up removal is bounded to skill-selection questions, preserves a standalone-question fallback, and leaves the full original query available to model intent selection. Latest frontend-only expansion can suppress old backend vocabulary. Raw remote-result validation and existing grouping/action candidate caps are unchanged. No mutation/delete/concurrency state is introduced. Negative new verb forms above are the actual uncovered edge case; no runtime reproduction was run under the assigned read-only scope.

## Test quality

New tests exercise real source projection and candidate selection, mocking only remote retrieval/embedding. They demonstrate retained development workflow, primary implementation passages and specific follow-up clause handling. Existing negative controls only cover Создай/Create and therefore do not cover new positive verb entrances identified above. Add those concrete controls as part of the fix, not source-string assertions.

## Process / done-ness gaps

Parent owns full-suite and real-model verification, currently in progress; this review does not claim those results. Final report must reproduce backend follow-up selection rather than equating retained candidates with a successful user answer.

## Production safety

No quota, key, signing, state-schema or backend deployment configuration changes in this diff.

## Suggestions only (LOW)

None.

## Skipped checks (transparency: what you intentionally did not check, why)

Did not execute tests, lint, imports or model calls, per reviewer instructions. Did not modify code. Architecture vision/degradations files are absent in this candidate (no architecture directory); applied skill principles and the stated retrieval/negative-history invariants. No review of unrelated repository changes or deployment artifacts.
