# План реализации после K2/design review

Статус: design only; runtime implementation не начата. 
Inputs read: upstream ADR-003 и challenge B1–B5, actual `recognized-store.js`, `recognized_confirm.py`, 01_requirements.md, 03_adr/001-offline-verifier.md и 05_architecture.md. Реализация разрешена владельцем; до кода требуется успешный K2 и проверка дизайна ведущим. Только declared files ниже; без commit/push, writer, production, секретов и иных repo.

## T1 — закрытый вход и безопасное чтение (ADR-001, FR-1, FR-2, NFR-1, B1/3/4)

Standalone Python CLI читает export, trusted descriptor и 32-byte key private fd-relative. Проверяет roots/ancestors, ownership/mode/nlink/no-follow, non-overlap/aliases, строгий JSON и пределы глубины/размера. Descriptor exact schema/digests/owner/runtime; inventory exact schema/version/snapshot_id, sorted unique entries и полное directory/file membership, включая пустые directories. Сверяет actual tree, modes, sizes, hashes в обе стороны; исключённые key/lock/pending/staging объекты не проходят. Никаких writes, subprocess или network.

## T2 — реальные форматы и семантика (FR-3, FR-4, B2)

Реализовать JS `JSON.stringify` compatible canonical core metadata/tuple для допустимого подмножества, exact 14-field tuple и request digest. Реализовать Python adapter `encode` compatible HMAC. Строгие manifest rows и raw bytes, `entry_id` derivation, различие logical `row.path` и physical `row.stored_at`, sidecar/source/workspace/draft, exact owner/runtime external descriptor. Только completed `saved_unverified + artifact_observed=true`, exact one-to-one operation/receipt. Любая ошибка выдаёт bounded allowlisted refusal без входных bytes/path/owner/key/MAC. Отчёт всегда `executable:false`, без target/mapping.

## T3 — synthetic fixtures и adversarial matrix (FR-5, AC-1)

Fixture generator создаёт **реальные** core metadata encoding и adapter receipt MAC на заранее созданном offline export, descriptor/key отдельно. Positive fixture переносится на другой path/inode и проходит verifier; старый core direct-read при новой identity не объявляется успешным. Snapshot tree before/after сравнивается byte-for-byte, включая inventory, descriptor/key и directory membership. Негативные тесты: подмена inventory/snapshot ID/key digest/key bytes/MAC; duplicate/unknown JSON fields и version; missing/extra files и empty dirs, symlink/hardlink/mode/owner/alias/path traversal/limits; source/raw/artifact/metadata mismatch; orphan/multiple IDs; each forbidden receipt state и false flag; owner/runtime/workspace/engine/tuple/source logical vs stored_at mismatch. Для semantic binding tests менять fixture и **переиздавать inventory digest/descriptor**, а если нужно — заново подписывать receipt, чтобы отказ происходил на T2, не на раннем hash gate. Фиксировать конкретный refusal code и отсутствие executable plan для каждого.

## T4 — evidence и review

Запустить targeted tests без live Hermes/core save. Независимый QE другой моделью после реализации, затем только релевантный rerun. Документировать воспроизводимую команду и ограничения. K1 `dz name-check` сейчас **NOT ESTABLISHED**: workspace scanner не инспектирует Python; manual `rg` по текущим runtime именам дал notfound, что не заменяет K1. Повторить manual name check по итоговым четырём файлам и честно оставить K1 статус, если scanner всё ещё не поддерживает Python. B5, target ownership и whole-store freeze не входят в этот этап.

- T5 / FR-5 / AC-1: Проверить экспорт из настоящего synthetic adapter→core в pinned Docker image с отключённой сетью; integration script `integrations/hermes-health/experiments/recognized-recovery/integration_actual.py`. Это проверка совместимости форматов, не production restore.

## Assessment

Доказательство ограничено input validation на synthetic offline fixture. Runtime hash в receipt фиксирует историческую строку, но не доступность старого runtime. Inventory completeness ограничена описанным export profile и доверенным descriptor; она не доказывает момент freeze или историческое human approval. Никакого нового provenance и применения результата нет.

## Amendments

2026-11-10: внесены B1–B4 уточнения из upstream independent challenge и текущего K2 design review. Это не заявление, что QE или implementation согласованы.

После первичной QE: targeted regression по QE-1 — invalid manifest `media_type/ingested_at/archive_id/source.*` после reseal; QE-2 — receipt workspace `float/bool` после re-HMAC/reseal; QE-3 — inventory mode `448.0` с обновлённым descriptor digest; QE-4 — повторные unsafe-root вызовы и `/proc/self/fd` без роста; QE-5 — отсутствующий key даёт отдельный `key_missing`; QE-6 — README на русском. Обход каталога заменить bounded `os.scandir(fd)` с ранним счётчиком. После исправлений повторить unit suite и actual installed-format integration; затем независимая QE новой версии.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/experiments/recognized-recovery/recovery_verifier.py
- integrations/hermes-health/experiments/recognized-recovery/test_recovery_verifier.py
- integrations/hermes-health/experiments/recognized-recovery/fixtures.py
- integrations/hermes-health/experiments/recognized-recovery/README.md
- integrations/hermes-health/experiments/recognized-recovery/integration_actual.py
