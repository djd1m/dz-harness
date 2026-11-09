# План native adapter slice

Inputs read: `03_adr/001-confirm-unverified-draft.md`, `05_architecture.md`, `integrations/hermes-health/{pdf_draft.py,intake_confirm.py,health_plugin.py,__init__.py}`, core recognized ADR и `/tmp/hermes-night-contract-audit.md`.

## Goal and order

Tier L из-за доверенного command context, durable state и отдельного core процесса. Этапы независимы по gate: sidecar → proposal → confirm/reconcile → synthetic integration/QE. Индекс и production install не начинаются в этой feature.

## Tasks

1. TASK-1 (ADR-001, FR-1, A1, A4): sidecar `draft-provenance-1` как last completion marker, private/no-follow, exact MD/source/workspace binding; старые draft отказаны. Tests `integrations/hermes-health/tests/test_pdf_draft.py` и `integrations/hermes-health/tests/test_recognized_confirm.py` на crash/incomplete, tamper, symlink, status, quota и прежние MD/HTML artifacts.
2. TASK-2 (ADR-001, FR-2, FR-5, A1, A4): отдельный HMAC proposal store, TTL, immutable opid, owner/workspace/runtime/source/draft binding, prepare без map write. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` на replay/conflict, чужой owner, private perms, state corruption, full source/draft recheck.
3. TASK-3 (ADR-001, FR-3, FR-4, A2, A3): registered gateway commands и write-disabled default; durable intent, bounded stdin core CLI, status/read summary reconciliation, no blind retry. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` на model cannot confirm, cron denial, identity mismatch, timeout/crash/receipt write failure/core committed, replay only same opid.
4. TASK-4 (ADR-001, FR-6, FR-8, A4): маркировка всех результатов unverified/not_requested, отсутствие текста в logs и отказ от blanket dot access/search. Tests `integrations/hermes-health/tests/test_recognized_confirm.py` и `integrations/hermes-health/tests/test_health_plugin.py` на schema/registered tools and commands, no `source_get` read for hidden core path.
5. TASK-5 (ADR-001, FR-7, A5): capability/version pin installed test runtime, actual synthetic source and core CLI end-to-end `integrations/hermes-health/tests/integration_recognized_confirm.py`; synthetic routing coverage в fake gateway dispatch; real transport acceptance НЕ установлена, package docs/skill. Runtime unavailable или skipped test не PASS; затем независимое QE другой моделью.

## Risks and explicit refusals

Нет trusted gateway ContextVars/transport, sidecar отсутствует или расходится, source/runtime drift, core CLI capability отсутствует, durable receipt не записан, core outcome ambiguous → named refusal/reconciliation; не говорить `saved` без core readback. Existing intake schema/store не смешивать. Search/read recognized и отдельный index retry требуют следующего ADR.

## Amendments

Независимый challenge `/tmp/recognized-adapter-challenge.md` принят до реализации. Slice строго synthetic-only: fake dispatch не доказывает human command transport; production transport не принят, production enable/install запрещены. Default write flag выключен. Capability mapping финализируется после settled core, до integration code.

| ID | Решение и task | Confirmation test |
| --- | --- | --- |
| AM-1 (C1) | TASK-3/5: exact closed request только operation_id, entry_id, source_sha256, source_bytes, text, engine{name,version}; workspace отдельный argv. Отдельный pin recognized CLI/store и всех load-bearing dependencies; strict capability/status schema, full binding compare. | → test `test_core_contract_strict` in `integrations/hermes-health/tests/test_recognized_confirm.py` |
| AM-2 (C2) | TASK-3/5: command-only dispatch boundary плюс trusted ContextVars; модель не имеет confirm surface. Все handler ошибки поглощаются фиксированным refusal, не LLM fallback. Real transport gate остаётся NOT ESTABLISHED. | → test `test_model_cannot_confirm` in `integrations/hermes-health/tests/test_recognized_confirm.py` |
| AM-3 (C3) | TASK-2/3: стабильный lock на read→intent→core→verify→receipt; после intent никакого нового save/opid. Recovery не требует draft и не применяет TTL. | → test `test_concurrent_confirm` in `integrations/hermes-health/tests/test_recognized_confirm.py` |
| AM-4 (C4) | TASK-2: отдельные root/key/lock/schema, отказ ancestor/physical alias с intake/workspace/draft. Closed bounded JSON с duplicate/type/unknown refusal, finite clock; no-follow regular single-link private files. | → test `test_store_isolation` in `integrations/hermes-health/tests/test_recognized_confirm.py` |
| AM-5 (C5) | TASK-3: full-duplex selector stdin chunking/output drain, один monotonic deadline, aggregate output bound, process-group kill/reap. До spawn max text 2 MiB/raw JSON 16 MiB; UTF-8 no surrogate/NUL. | → test `test_runner_backpressure` in `integrations/hermes-health/tests/test_recognized_confirm.py` |
| AM-6 (C6) | TASK-1/2: fsync MD/HTML→exclusive sidecar/fsync→child dir fsync→root fsync→eligible. Sidecar closed schema; manifest ROW binding. Payload весь rendered draft.md. Один bounded no-follow fd snapshot hash/bytes/send. | → test `test_sidecar_completion` in `integrations/hermes-health/tests/test_pdf_draft.py` |
| AM-7 (C7) | TASK-4: unverified/untrusted/not_requested на всех summary; никакого read exception/autoindex/text в summary/errors. Integrity не clinical verification; saved не searchable. | → test `test_no_index` in `integrations/hermes-health/tests/test_recognized_confirm.py` |

| AM-8 | FR-2/3/4/7: measured gaps закрыть реальными отрицательными snapshot/runtime/config fixtures, malformed prepare/command и failure receipt recovery. Проверять no core save, неизменный opid, uncertainty/privacy и owner cancel; source и critical90% threshold не менять. | → test `test_prepare_refuses_unbound_source_without_receipt` in `integrations/hermes-health/tests/test_recognized_confirm.py` |

### Tests-only remediation по measured fleet coverage

Дополнительные confirmations: `test_snapshot_rejects_source_and_workspace_drift`, `test_runtime_rejects_missing_or_linked_code`, `test_reconcile_pin_drift_and_receipt_failure_stay_uncertain`. Финальное измерение выполняет независимый fleet reviewer на settled test bytes.

### Таблица переходов и ограничение crash модели

| Исходное состояние | Событие | Следующее состояние / действие |
| --- | --- | --- |
| prepared | TTL до intent истёк | expired, без core save |
| prepared | owner cancel | cancelled, без core save |
| prepared | valid confirm, flag on, pin/source current | durable committing, ровно один core save |
| committing | verified full core summary и receipt fsync | saved_unverified |
| committing | timeout/crash/receipt failure/unknown core result | reconciliation_required (либо оставшийся durable committing) |
| committing/reconciliation_required | confirm/status | только core status прежнего opid; present+binding → saved_unverified; иначе reconciliation_required |
| saved_unverified | confirm/status | только повторная core status проверка; drift/unknown → reconciliation_required с persisted-artifact indication |
| cancelled/expired | confirm/status | terminal, без core save |
| committing/reconciliation_required/saved_unverified | cancel | отказ cancellation_after_intent; history сохраняется |

Status сериализован тем же lock. После intent TTL/draft deletion не блокируют readback. Source/runtime drift запрещают новый write, но не означают absent. `present_unverified` после restart означает наблюдаемую целостность в process-crash модели, не доказательство прежнего parent fsync/power-loss durability. absent_at_read_time/incomplete/unavailable/corrupt остаются reconciliation, без retry. Ошибка compensation receipt не скрывает ambiguity.

### Закрытый sidecar contract

`draft-provenance-1`: schema, draft_id (opaque grammar), workspace {path,dev,ino}, source {entry_id,path,logical_path,sha256,bytes}, draft {sha256,bytes}, engine {name,version}, parser_status (ok|partial_text). Source row identity — exact entry_id/stored path/logical_path/hash/bytes; перестановка других manifest rows не меняет identity. Размер sidecar ≤16 KiB; строки bounded, integer sizes nonnegative/nonbool, unknown/duplicate/missing keys отказаны. Sidecar приватен и отсутствует в artifacts. Ошибка последнего fsync может оставить видимый marker; следующий процесс полностью revalidates snapshot, а не выводит durability из наличия файла.

### Mapping adapter/core v1

Executable `<HEALTH_NODE>`; argv `<runtime>/node_modules/@dzhechkov/health-advisor/lib/recognized-cli.js capabilities` без stdin/workspace. Exact response `{schema:"ha-recognized-capabilities-1",version:1,request_schema:"ha-recognized-save-1",experimental:true,capabilities:["immutable-opid","exact-source-binding","unverified-only","status-no-text"]}`. Save/status argv `.../recognized-cli.js save|status --workspace ABS`; stdin save closed AM-1 request, status `{operation_id}`. `read` запрещён adapter. Status summary обязателен с source entry/hash/bytes, text hash/bytes, engine, operation/request hash, trust/label/index и created_at; workspace связывается canonical adapter receipt и exact argv (core summary workspace не содержит). Error фиксированный allowlist code + optional artifact_presence/current_source_integrity, никогда stderr. Core candidate experimental, runtime pin включает recognized CLI/store, source-anchor и lock transitive dependencies; отсутствие capability отказывает.

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
