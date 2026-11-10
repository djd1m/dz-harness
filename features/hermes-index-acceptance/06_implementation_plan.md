# План интеграционного сценария

## Goal state

Измерить repeat/recovery/search существующего third-brain на закрытой технической карте.

## Tasks

- TASK-1 FR-1 FR-2: создать технический документ из нескольких chunks, ingest реальным CLI, проверить SQLite records и поиск, повторить ingest и сравнить набор.
- TASK-2 FR-3 FR-4 A1: удалить один record в отдельной тестовой SQLite через транзакцию; повторить ingest; сверить набор и source SHA; изменить source и проверить stale refusal.
- TASK-3 FR-5: отдельный документ в скрытой recognized namespace; измерить ingest и search refusal без ослабления read policy. Сохранить пределы в результате.

## Dependency order

TASK-1 -> TASK-2 -> TASK-3.

## Risks

Изолированная SQLite mutation моделирует частичный индекс, не потерю питания или многопроцессный write. Реальные медицинские данные не используются. Runtime закреплённый; новая версия core здесь не тестируется.

EXPECTED_CODE_TARGETS:
- integrations/hermes-health/tests/index_acceptance_check.py
