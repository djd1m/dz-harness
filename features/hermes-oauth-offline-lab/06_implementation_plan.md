# План offline OAuth lab

Inputs read: 03_adr/001-single-owner.md; 05_architecture.md; planner /tmp/hermes-night-oauth-plan.md.

## Goal state

Лабораторная модель демонстрирует один refresh при конкуренции и отказ от
опасного retry после неопределённого исхода. Нет production интеграции.

## Tasks

- TASK-1 (ADR-001, FR-1, FR-2, A3): реализовать fake provider ledger и owner access-only в experiments/night_oauth_lab.py. TEST test_copied_grant_conflicts и test_processes_refresh_once.
- TASK-2 (ADR-001, FR-3, FR-4, A1, A2): durable pending marker, state commit, crash/ambiguous/revoked ошибки. TEST test_ambiguous_is_not_retried и test_result_commit_failure_blocks_after_restart.
- TASK-3 (FR-5): synthetic unit/multiprocessing tests paths/permissions/corruption/expiry/access-only/crash/injected fsync failure. TEST test_private_state_and_sanitized_errors.
- TASK-4 (FR-6): README ограничений и независимое QE; исправить blockers, не внедрять в работающий Hermes.

## Dependency order

TASK-1 -> TASK-2 -> TASK-3 -> TASK-4. Тесты можно писать перед реализацией.

## Checkpoints

K1 имена, K2 план, QCSD замечания до code; после реализации actual tests и
независимый reviewer. Не называть synthetic доказательства проверкой OpenAI.

## Risks

flock только local FS; разные filesystem paths/копии state — разные owners;
тест не даёт гарантию network-FS или физического power-loss. Никаких shell/env
секретов. Fake provider не принимает реальные grants и сетевые endpoints.

## Amendments

- AM-1 (QCSD C1/C2): durable pending marker до refresh и явная граница unlink-dir-fsync. Confirmation: отказ нового процесса при failed result fsync → test `test_result_commit_failure_blocks_after_restart` in `integrations/hermes-health/experiments/tests/test_night_oauth_lab.py`.
- AM-2 (QCSD C3): любой provider exception после intent блокирует retry. Confirmation: нет повторного вызова → test `test_ambiguous_is_not_retried` in `integrations/hermes-health/experiments/tests/test_night_oauth_lab.py`.
- AM-3 (QCSD C4/C5/C6): локальный отдельный flock inode и общий fake provider ledger; symlink refusal. Confirmation: один refresh → test `test_processes_refresh_once` in `integrations/hermes-health/experiments/tests/test_night_oauth_lab.py`.
- AM-4 (QCSD C7/C8/C9): нет reset API, strict JSON/expiry/private state и fixed error codes. Confirmation: приватность/отказ → test `test_private_state_and_sanitized_errors` in `integrations/hermes-health/experiments/tests/test_night_oauth_lab.py`.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/experiments/night_oauth_lab.py
- integrations/hermes-health/experiments/tests/test_night_oauth_lab.py
- integrations/hermes-health/experiments/oauth-lab-README.md
