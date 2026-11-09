# Skill advisor team — bounded correction, 2026-11-09

## Requirements and scope

User authorized redesign with BTO and a GitHub PR. Preserve live catalog discovery,
native OpenCode installation and generic Claude usage. Recommend a short first set
with source-grounded explanations and host-verified course links when provided.
Do not deploy the website, publish npm or install a new E2B runtime.

## Evidence

The three earlier Haiku/Claude Code consultations passed mechanical checks but
contained unsupported capability claims. A fresh corrective editor fixed several
claims while expanding explanations by 13–62% and introducing a false claim that
Cloud.ru credentials must always be requested from the user (the skill first checks
environment/configuration). These are development examples, not a held-out benchmark.
See ../skill-advisor-opencode/runtime-comparison/editor-experiment.json.

## ADR: bounded team with immutable host evidence

Alternatives: (1) one enlarged advisor prompt, (2) always-on editor, (3) selector,
independent reviewer and one conditional repair with renewed review.
Choose (3): avoid rewriting already acceptable advice and revalidate new claims.
Tradeoff: extra latency/model cost, plus possible reviewer false negatives. No claim
of guaranteed factual accuracy. Same-model separate sessions are possible but are
not cross-model validation. Model selection belongs to the host.

Reuse check-opencode-advice.mjs for catalog/installation and check-advice-review.mjs
for request/source/claim binding; do not duplicate those boundaries. Add a small
injected-callback orchestration helper, not another service or model client.

## Sequence and traceability

| Requirement | Implementation | Verification |
|---|---|---|
| Original intent and frozen evidence | Host userTask + snapshots in bound request | Changed task/source invalidates review |
| Independent responsibilities | Skill team protocol + separate host callbacks | Cross-model artifact review; host isolation documented |
| Correct new editor mistakes | Fresh request/review after one repair | Old approval, failed second review withheld |
| Short first set | Max 2 picks, 2 gaps, 180 explanation words by default | Boundary/overlength tests |
| Bounded execution | One repair, per-stage deadlines, no external actions | Call counts, timeout/failure tests |
| Native portability | Progressive skill references; OpenCode-specific helper | Existing native tests, dz list/info |

Build → BTO benchmark (preconditions, golden structure, deterministic checks,
consistency probes, size metrics) → independent cross-model review → targeted
optimization → final tests → push branch and PR. Record unavailable layers honestly;
no trust-tier promotion or production-readiness claim from structural tests.
