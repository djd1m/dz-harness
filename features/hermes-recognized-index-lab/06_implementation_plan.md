# План operator-only recognized index lab

Inputs read: `03_adr/001-operator-index-reconcile.md`, `05_architecture.md`, core recognized ADR, `packages/health-advisor/skills/third-brain/engine/{cli,plan,write,search}.js`, `/tmp/hermes-night-contract-audit.md`.

## Tasks

1. TASK-1 (ADR-001, FR-1, FR-2, A3, A5): synthetic sentinel/confined lab root/explicit flags и core opid read/status/provenance validation; tests `integrations/hermes-health/experiments/recognized-index/test_index_lab.py` на realpath/symlink, no marker, absent/drift/corrupt opid, no save/intake invocation.
2. TASK-2 (ADR-001, FR-3, FR-4, A3): deterministic expected patterns через `buildRecords` и direct JS `write.ingest` API с `kind=machine-unverified`, fixed date/case/anchor, exact artifact bytes/path; tests `integrations/hermes-health/experiments/recognized-index/test_index_lab.py` на no clinical kind, stable plan digest, source/artifact/case drift, original artifact unchanged.
3. TASK-3 (ADR-001, FR-5, A1, A2): bounded exhaustive readback и full exact pattern/header/body comparison; prove SQLite snapshot completeness/schema/native fail-closed on fixture beyond ordinary limit before apply. Tests `integrations/hermes-health/experiments/recognized-index/test_index_lab.py` и `integrations/hermes-health/experiments/recognized-index/integration_smoke.py` на truncation/unknown schema/variants/extras/partial/timeout, no false indexed result.
4. TASK-4 (ADR-001, FR-6, A1, A2): explicit reconcile names missing expected subset, only exact-subset allows operator retry with same digest; test importer exact-pattern dedup and no duplicate after partial in `integrations/hermes-health/experiments/recognized-index/integration_smoke.py`. No auto retry, no rollback/delete.
5. TASK-5 (ADR-001, FR-7, FR-8, A4): known-source real search, match exact expected hit and current core provenance, label unverified; test hidden-path HealthTools deny remains and no blanket dot access in `integrations/hermes-health/experiments/recognized-index/test_index_lab.py`. Documentation and independent challenge/QE; no production use.

## Gates

Core recognized tests/QE and runtime capability pass first. The runtime must support `write.ingest` direct API, `buildRecords`, exact dedup and complete bounded readonly SQLite v2 snapshot (no recall/JSON fallback); inability to prove any is `readback_unproven` and blocks apply. Actual integration smoke on synthetic source must execute, not skip. No service/journal is needed for this operator-only experiment; lab result is time-scoped and does not mutate core index status.

## Amendments

- AM-1 (B1): strict SQLite native/schema/read-down gate → test `test_backend_refusal` in `integrations/hermes-health/experiments/recognized-index/test_index_lab.py`.
- AM-2 (B2): multiset and record metadata → test `test_variants_conflict` in `integrations/hermes-health/experiments/recognized-index/test_index_lab.py`.
- AM-3 (B3): partial/reconcile without save → test `test_partial_retry` in `integrations/hermes-health/experiments/recognized-index/test_index_lab.py`.
- AM-4 (B4): private confined sentinel → test `test_sentinel_refusal` in `integrations/hermes-health/experiments/recognized-index/test_index_lab.py`.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/experiments/recognized-index/index_lab.js
- integrations/hermes-health/experiments/recognized-index/test_index_lab.py
- integrations/hermes-health/experiments/recognized-index/integration_smoke.py
- integrations/hermes-health/experiments/recognized-index/README.md
