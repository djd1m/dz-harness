# План native adapter slice

Inputs read: `03_adr/001-confirm-unverified-draft.md`, `05_architecture.md`, `integrations/hermes-health/{pdf_draft.py,intake_confirm.py,health_plugin.py,__init__.py}`, core recognized ADR и `/tmp/hermes-night-contract-audit.md`.

## Goal and order

Tier L из-за доверенного command context, durable state и отдельного core процесса. Этапы независимы по gate: sidecar → proposal → confirm/reconcile → synthetic integration/QE. Индекс и production install не начинаются в этой feature.

## Tasks

1. TASK-1 (ADR-001, FR-1, A1, A4): sidecar `draft-provenance-1` как last completion marker, private/no-follow, exact MD/source/workspace binding; старые draft отказаны. Tests `integrations/hermes-health/tests/test_pdf_draft.py` и `integrations/hermes-health/tests/test_recognized_confirm.py` на crash/incomplete, tamper, symlink, status, quota и прежние MD/HTML artifacts.
2. TASK-2 (ADR-001, FR-2, FR-5, A1, A4): отдельный HMAC proposal store, TTL, immutable opid, owner/workspace/runtime/source/draft binding, prepare без map write. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` на replay/conflict, чужой owner, private perms, state corruption, full source/draft recheck.
3. TASK-3 (ADR-001, FR-3, FR-4, A2, A3): registered gateway commands и write-disabled default; durable intent, bounded stdin core CLI, status/read summary reconciliation, no blind retry. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` на model cannot confirm, cron denial, identity mismatch, timeout/crash/receipt write failure/core committed, replay only same opid.
4. TASK-4 (ADR-001, FR-6, FR-8, A4): маркировка всех результатов unverified/not_requested, отсутствие текста в logs и отказ от blanket dot access/search. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` и `integrations/hermes-health/tests/test_health_plugin.py` на schema/registered tools and commands, no `source_get` read for hidden core path.
5. TASK-5 (ADR-001, FR-7, A5): capability/version pin installed test runtime, actual synthetic source and core CLI end-to-end `integrations/hermes-health/tests/integration_recognized_confirm.py`; command transport acceptance в fake gateway dispatch, package docs/skill. Runtime unavailable или skipped test не PASS; затем независимое QE другой моделью.

## Risks and explicit refusals

Нет trusted gateway ContextVars/transport, sidecar отсутствует или расходится, source/runtime drift, core CLI capability отсутствует, durable receipt не записан, core outcome ambiguous → named refusal/reconciliation; не говорить `saved` без core readback. Existing intake schema/store не смешивать. Search/read recognized и отдельный index retry требуют следующего ADR.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/pdf_draft.py
- integrations/hermes-health/recognized_confirm.py
- integrations/hermes-health/health_plugin.py
- integrations/hermes-health/__init__.py
- integrations/hermes-health/plugin.yaml
- integrations/hermes-health/README.md
- integrations/hermes-health/skills/health-read/SKILL.md
- integrations/hermes-health/tests/test_pdf_draft.py
- integrations/hermes-health/tests/test_recognized_confirm.py
- integrations/hermes-health/tests/test_health_plugin.py
- integrations/hermes-health/tests/integration_recognized_confirm.py
