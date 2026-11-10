# План реализации restore lab после проверки дизайна

Inputs read: `features/hermes-recognized-restore-lab/03_adr/001-bind-one-intent-to-one-target.md`, `05_architecture.md`, `01_requirements.md`, `04_domain_model.md`, upstream B1–B5 challenge, actual core `recognized-store.js`, verifier и adapter runtime identity. Статус: **precode; ни один gate/тест здесь не объявлен выполненным**. Код разрешён только после K1/K2 и review B5, с учётом новых замечаний reviewer. Не менять production, verifier или старые receipts.

## Goal state и порядок

Текущее состояние: read-only verifier с 19 unit tests и actual synthetic adapter→core integration в базовом PR38; core copy на новый inode отказывает. Цель: один sealed offline synthetic target с новыми ID и exact text/source, при fault injection — held вместо ложного commit. Последовательность: specification/ADR → precode review → tests/implementation → actual integration → независимый QE и релевантный rerun. Процент coverage без измерения не задаётся.

- TASK-1 (FR-1, FR-2, FR-3, NFR-1, A1, A3; ADR-001): реализовать строгие `plan`/target preflight, повторную B1–B4 проверку, source byte match и source durability barrier. Confirmation `test_invalid_export_refuses_before_target_write`, `test_target_source_only_and_alias_refusal`.
- TASK-2 (FR-4, FR-5, A2, A6; ADR-001): deterministic ID/bijection/collision, pinned runtime closure и bounded actual core CLI. До save durable single-envelope intent и `attempting`; no receipt replay. Confirmation `test_intent_before_first_save`, `test_mapping_collision_refuses`, `test_runtime_mismatch_refuses`.
- TASK-3 (FR-6, FR-7, A4, A5; ADR-001): exact readback, fsync barrier и durable observed/seal; explicit reconcile с plan digest, held для absent/staging/unknown. Внедрить fault seams только в тестовом процессе. Confirmation `test_attempting_present_requires_reconcile_barrier`, `test_attempting_absent_is_held`, `test_seal_requires_full_readback`, `test_unknown_fsync_fail_stop`.
- TASK-4 (FR-8, NFR-2, AC-1, AC-2, A1, A2, A3, A4, A5, A6): adversarial tests: crashes на каждом rename/fsync и core staging/parent fsync, concurrent claim, mapping/source/target tamper, sanitized output, export unchanged. Confirmation `test_concurrent_claim_one_owner`, `test_no_receipt_index_or_activation`, `test_no_blind_retry_after_timeout`.
- TASK-5 (AC-3, FR-5, FR-8): actual installed-format integration в offline pinned image: 1–2 синтетические adapter→core операции, export и свежий target на новом inode; проверка нового core read, exact bytes/source, неизменного export/receipt и seal. Записать команды, версии и пределы в README. Отсутствие pinned image/runtime — явный failure. Confirmation `integrations/hermes-health/experiments/recognized-restore-lab/integration_actual.py` с отчётом о каждом asserted property, не фиктивный PASS.
- TASK-6 (AC-1, AC-2, AC-3): выполнить K1/K2 до кода; после кода targeted tests, actual integration и независимый QE **другой моделью Codex** согласно разрешению владельца, затем только нужный rerun. Для Tier L провести четыре роли Step 9 Reference (requirements/traceability, risk, integration, regression) волнами и записать отдельные evidence/verdict; не заявлять запуск внешнего AQE fleet. Статусы gate записывать по факту; Python K1 и native discrimination могут остаться NOT ESTABLISHED, не превращать это в full-pipeline GO. Никакой production acceptance/DRP waiver.

## Риски и stop conditions

При `attempting+present` без полноценного post-crash fsync barrier — held; readback сам по себе недостаточен. Если установленный CLI/read, closure identity, directory fsync или cooperative target lock недоступны, implementation не обходит контракт. Не использовать core save на реальном workspace. Возможность восстановить данные в production здесь не проверяется.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/experiments/recognized-restore-lab/restore_lab.py
- integrations/hermes-health/experiments/recognized-restore-lab/test_restore_lab.py
- integrations/hermes-health/experiments/recognized-restore-lab/integration_actual.py
- integrations/hermes-health/experiments/recognized-restore-lab/README.md
