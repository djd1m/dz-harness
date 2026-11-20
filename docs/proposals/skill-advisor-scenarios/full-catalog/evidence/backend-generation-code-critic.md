# Final vocabulary refinement

Accepted removal of New API endpoint from the compact concept expansion. Remaining Code generation / Step 7 / CODE_CHANGES terms still come from the verified shipped primary source and focus the existing bounded passage-ranking mechanism on execution evidence. No new defect found; prior source review conclusions remain. Final exact-source two-answer semantic review pending completion of generation-verified.live.json; no success receipt issued from partial data.

# Generation-evidence independent code-critic review

Verdict: no concrete code defect found in the three-file diff against origin/main. Approved for focused acceptance; this is not a claim the public dialogue now passes.

## God-object growth (BLOCKING)
None; bounded vocabulary changes only.

## Security violations (BLOCKING / HIGH)
None; no secrets, trust boundaries, quota state or provider behavior touched.

## Architectural concerns (HIGH / MEDIUM)
None. Backend expansion adds documented code-generation vocabulary, then existing ranking selects primary source passages. Verified dedicated feature-adr source at packages/skills-feature-adr/templates/.claude/skills/feature-adr/SKILL.md matches the approved catalog SHA256 and contains Code generation, CODE_CHANGES and New API endpoint. This does not fabricate implementation capability or rewrite selected source text.

## Anti-pattern violations
None found. No retry, silent fallback or new generic execution claims.

## Type / contract issues
None. No prompt/schema/provider-parameter changes. Existing seven-passage per-card cap and source-bound response validation remain unchanged.

## Edge-case sweep
Existing negation/auxiliary-output guards, latest-only frontend restriction and retrieval candidate caps are untouched. Passage expansion can alter ranking, so exact old-case input equivalence and focused answer review remain the relevant behavioral evidence. No mutation, restart or schema-migration path introduced.

## Test quality
New assertion inspects actual emitted primary passages, rather than merely asserting the candidate survived. Parent reports original code failed this regression; reviewer did not execute tests. Seeing Code generation/CODE_CHANGES is necessary evidence delivery, not proof final model conclusion is correct.

## Process / done-ness gaps
No done claim accepted yet. Require focused paid answers to show backend is not falsely classified as unsupported, preserving genuine unresolved constraints; current live first fix must not be described as this unreleased second fix.

## Production safety
No resource cap, index identity, quota, credential, state or release-controller change.

## Suggestions only (LOW)
None.

## Skipped checks (transparency: what you intentionally did not check, why)
No tests, lint, imports, model/provider calls or source edits performed per instructions. Review limited to actual three-file diff and primary-source grounding. Counterfactual old-case replay and final model semantics belong to parent/acceptance review.

Reviewed file hashes:
- compact-dialogue.mjs: e154eb0351a1fb0f1d256bd9cc10bd3ed5391608372122ec1b6ca069f529f408
- implementation-query.mjs: b575a158ff3cc61ae8fd33f2a45e05466dff0d2f806c6e6e51a8212cd6ef08cf
- implementation-query.test.mjs: 24668f562572441e9fc50ee8c2d9eb80ce8872a42dc1671624c691328dec32cb
