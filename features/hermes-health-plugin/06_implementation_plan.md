# План реализации

Inputs read: 03_adr/001-isolate-read-tools.md, 05_architecture.md, 01_requirements.md; установленный Hermes 0.22.2.

- T1 (ADR-001, FR-1, AC-2): plugin.yaml, регистрация инструментов и навыка; README с диапазоном проверенных версий и отдельным каталогом public mirror.
- T2 (FR-2, NFR-1): ограниченный subprocess, очищенное окружение, закреплённые Node/CLI и snapshot SQLite. Поиск сверяет источники.
- T3 (FR-3, FR-4): confinement, ограниченное чтение текста, manifest/hash validation; никаких clinical-confirmed по одному хешу.
- T4 (NFR-2, AC-1): синтетические tests/test_health_plugin.py и tests/integration_check.py в integrations/hermes-health; тестирование через настоящий plugin doctor/validate в изолированном контейнере без credentials.
- T5 (AC-2): независимый review, исправления, PR без деплоя непроверенных операций записи.

- T6 (ADR-002, FR-5, AC-3, NFR-1): preview-модуль с ограниченным inbox, снимком входа, настоящим intake CLI во временной карте, проверкой результата и дубликатов.
- T7 (AC-1, AC-3, NFR-2): синтетический integration preview и независимое ревью. Рабочий плагин 0.1 не заменять до отдельной приёмки.

## Amendments
AM-1 (QCSD): не возвращать устаревший текст. Confirmation: altered source rejected → test `test_stale_source` in `integrations/hermes-health/tests/test_health_plugin.py`.
AM-2 (QCSD): запретить symlink на любом компоненте. Confirmation: escape refused → test `test_symlink_escape` in `integrations/hermes-health/tests/test_health_plugin.py`.
AM-3 (QCSD): ограничить subprocess и не наследовать secrets/NODE_OPTIONS. Confirmation: bound enforced → test `test_subprocess_bounds` in `integrations/hermes-health/tests/test_health_plugin.py`.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/plugin.yaml
- integrations/hermes-health/__init__.py
- integrations/hermes-health/health_plugin.py
- integrations/hermes-health/intake_preview.py
- integrations/hermes-health/skills/health-read/SKILL.md
- integrations/hermes-health/README.md
- integrations/hermes-health/tests/test_health_plugin.py
- integrations/hermes-health/tests/integration_check.py
- integrations/hermes-health/tests/acceptance_check.py
- integrations/hermes-health/tests/test_intake_preview.py
