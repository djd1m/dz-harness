# Traceability and checks

| Requirement | OpenSpec requirement + scenario in openspec/changes/advisor-preview-readiness/specs/advisor-dialogue/spec.md | Decision | Tasks | Verification |
|---|---|---|---|---|
| FR-1 | clarify and follow up | ADR-001 | TASK-1,4 | dialogue and browser follow-up tests |
| FR-2 | partial coverage | ADR-001 | TASK-1,4 | reviewed output, partial/clarify tests |
| FR-3 | frozen evaluation | ADR-001 | TASK-2,4 | report input hashes and retained failures |
| NFR-1 | invalid or stale data | ADR-001 | TASK-1,4 | catalog, URL and legacy regression tests |
| NFR-2 | exhausted budget or unavailable provider | ADR-001 | TASK-2,4,5 | preview-server tests, provider failure tests |
| NFR-3 | unauthorized browser and cross-origin requests | ADR-001 | TASK-3,5 | access-candidate/gateway-test.mjs; local authentication/Origin negative checks |
| NFR-4 | changed reviewed text | ADR-001 | TASK-3,4 | hash/receipt validation and independent review |

This matrix maps requirements to checks; actual outcomes and deployment limitations are recorded in the final report. The earlier specs/preview.md is planning history; the canonical machine-validated change lives under openspec/changes/advisor-preview-readiness.
