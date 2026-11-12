# Traceability

FR-1,NFR-4 → Second consumer scenario → ADR-001 → TASK-1/TASK-5 → real tarball unrelated corpus.
FR-2 → Snapshot identity scenario → ADR-001 → TASK-1/TASK-5 → stale/model/dim/content and atomic build tests.
FR-3 → Search outage scenario → ADR-001 → TASK-3 → adapter availability fallback vs integrity failure tests.
FR-4 → Supported context scenario → ADR-003 → TASK-2 → frozen new-questions and source-owned record approval + model review.
FR-5,NFR-1,NFR-2 → Containers scenario → ADR-002 → TASK-4 → real Docker isolation and ledgers; site HTTP callback tests.
NFR-3 → previous audited experiment + every scenario → all ADRs → TASK-5 → source hashes, retained failures, cross-model review.

Repository ownership: harness repo owns reusable package, catalog approvals and runtime adapter; aicoding-site candidate owns API callback integration and container packaging. Site source targets: scripts/lib/advisor-http.mjs; deploy/advisor-containers/{Dockerfile.search,Dockerfile.advisor,compose.yml,start-advisor.mjs,prepare.mjs,containers.test.mjs,README.md}. Main checkout untouched. No new public route or analytics/widget modification in this slice.
