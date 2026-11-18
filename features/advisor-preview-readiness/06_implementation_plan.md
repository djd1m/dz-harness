# Implementation plan

Inputs read: 03_adr, 05_architecture, 01_requirements.

- TASK-1: Implement bounded dialogue and reviewed responses under ADR-001, covering FR-1, FR-2 and NFR-1.
- TASK-2: Evaluate frozen cases and preserve error visibility under ADR-001, covering FR-3 and NFR-2.
- TASK-3: Document and independently review secure browser access design under ADR-001, covering NFR-3 and NFR-4; no deployment in this task.
- TASK-4: Test prior context, refusal, invalid selections, failure and limits; verify legacy regressions and provenance under ADR-001 (FR-1, FR-2, FR-3, NFR-1, NFR-2, NFR-4).

- TASK-5: Confirm ADR-001 using `integrations/skill-advisor-catalog/dialogue.test.mjs` and `integrations/skill-advisor-catalog/preview-server.test.mjs`; gateway authentication remains unimplemented and must be independently verified before exposure.

- TASK-6: Persist reserved call counts using a single-process lock; reject corrupt or unavailable ledger and test restarts, exhaustion and contention (NFR-2, NFR-3, ADR-001).

EXPECTED_CODE_TARGETS:
- integrations/skill-advisor-catalog/request-ledger.mjs
- integrations/skill-advisor-catalog/dialogue.mjs
- integrations/skill-advisor-catalog/acceptance-evaluate.mjs
- integrations/skill-advisor-catalog/selector.mjs
- integrations/skill-advisor-catalog/preview-server.mjs
- integrations/skill-advisor-catalog/preview/app.js
- integrations/skill-advisor-catalog/preview/index.html
- integrations/skill-advisor-catalog/preview/style.css
