# Implementation plan
Inputs read: 01_requirements, 03_adr, 05_architecture, prior hybrid experiment and existing socket candidate.

Goal: reusable search and two-container advisor candidate, verified end to end, never enabling public page.
- TASK-1: Under ADR-001 implement standalone generic snapshot module and HTTP wrapper with pinned lean dependencies; FR-1, FR-2, NFR-1, NFR-4. Verify real second corpus, tarball import, stale/dim rejection, immutable atomic build with test.mjs.
- TASK-2: Under ADR-003 expose source-supported ADR context and improve generic instructions, obtaining independent record approval; FR-4, NFR-3. Freeze new questions, preserve original score and boundaries. Rebuild only affected source approval and index; no keyword-specific answer override.
- TASK-3: Under ADR-001 implement embedding helper and advisor retrieval adapter with explicit bounded timeout/fallback; FR-3, NFR-2, NFR-3. Reuse selectScenarios/renderDialogue and canonical fetch boundaries; test failures without paid mocks replacing real Lance integration.
- TASK-4: Under ADR-002 add site HTTP answer injection and isolated container assembly/Compose candidates; FR-5, NFR-1, NFR-2. Reuse site admission, preserve exact budget/state format. Test real two-container topology, origins, body bounds, queue/limits and search isolation. No changes to production Docker/Caddy. Preserve both existing ledgers with explicit existence preflight and exactly one reservation each; use writable parent-dir mounts with mapped UID, unpaid health, revision handshake, per-stage deadlines and active-until-settled behavior. Test these against real directories and restart.
- TASK-5: Confirm ADR-001 using integrations/hybrid-retrieval/snapshot.test.mjs and npm tarball consumer; ADR-002 using deploy/advisor-containers/containers.test.mjs plus site API tests; ADR-003 using integrations/skill-advisor-catalog/hybrid-advisor.test.mjs and frozen model checks. Cover FR-1, FR-2, FR-3, FR-4, FR-5, NFR-1, NFR-2, NFR-3, NFR-4. Cross-model code/semantic review and focused fixes, push both candidate branches, stop owned test containers/servers.

Dependency order: TASK-1 and source review TASK-2 → TASK-3 → TASK-4 → TASK-5. No independent architectural requirement deferred. Publication and npm release excluded by owner scope.
EXPECTED_CODE_TARGETS:
- integrations/hybrid-retrieval/index.mjs
- integrations/hybrid-retrieval/openrouter.mjs
- integrations/hybrid-retrieval/service.mjs
- integrations/hybrid-retrieval/snapshot.test.mjs
- integrations/skill-advisor-catalog/hybrid-advisor.mjs
- integrations/skill-advisor-catalog/hybrid-advisor.test.mjs
- integrations/skill-advisor-catalog/dialogue.mjs
- integrations/skill-advisor-catalog/preview-server.mjs
- integrations/skill-advisor-catalog/cli.mjs
- docs/proposals/skill-advisor-scenarios/catalog/part-c.json
- docs/proposals/skill-advisor-scenarios/catalog/reviews-c.json
- docs/proposals/skill-advisor-scenarios/presentation.json
- docs/proposals/skill-advisor-scenarios/presentation-reviews.json
