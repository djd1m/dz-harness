## Problem

The native skill-advisor can return valid registry names and installation commands while explanations contain unsupported capability/absence claims. A structural pass must not imply editorial approval.

Observed with harness-cli 0.8.61, skills-meta 0.9.75, OpenCode 1.19.4 in E2B and OpenRouter Haiku. Repeated synthetic consultations were reviewed against the actual provider sources read by the runtime; this is a small reproducible smoke set, not a general model benchmark.

## Reproduction examples

Ask: «Нужно исследовать GitHub-проекты и сохранить проверяемые ссылки на источники. Подбери первый набор навыков и объясни ограничения.»

Observed explanation: the research skill requires manual human verification. The selected source instead says “Cross-check claims through ordinary source evaluation”; it does not assign all checks to a human. Another caveat extrapolated publisher-signing limitations from medical-source examples to all GitHub sources without evidence.

Ask for GitHub-to-Cloud.ru deployment, checks and maintenance. Some answers say canary-watch cannot notify external systems despite its optional Slack/Discord webhook. Another answer says github-actions only provides a one-shot check despite its scheduled maintenance/health-check capability.

## Expected behavior / acceptance

- Ground each rationale and caveat in the exact selected provider variant, including complementary picks.
- Distinguish not selected, not configured, unverified and proven absent.
- Do not infer no capability from a catalog description or incomplete source excerpt.
- Evaluate semantic claims separately from registry/schema checks, against held-out questions as well as these regressions.
- A host requiring editorial acceptance must withhold answers on failed/incomplete review; review itself remains fallible and needs independent evaluation.

Local candidate adds source-bound review and preserves failed outputs; no npm release or broad readiness claim is made. Candidate evidence paths: docs/proposals/skill-advisor-opencode/evidence-haiku-v12.json, evidence-haiku-v13.json and semantic-review.md (prepared locally, not yet pushed).
