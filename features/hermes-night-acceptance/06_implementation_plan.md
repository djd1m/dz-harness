# Порядок исполнения и завершения

Inputs read: 01_requirements.md; 02_baseline.md; 02_contract_audit.md; 04_domain_model.md; 05_architecture.md; child ADR и challenge.

## Goal state

Reviewable PR с воспроизводимыми доказательствами восстановления, offline OAuth,
подтверждаемого сохранения непроверенного текста и отдельной индексации. Production
остаётся прежним. Непройденные gates явно перечислены в итоговом отчёте.

## Tasks

- TASK-1 FR-1 FR-2 A5: restore и чистая установка; evidence 04_restore_results.md. Завершённый административный этап, не новый installer.
- TASK-2 FR-3 A1 A2: child hermes-oauth-offline-lab — ADR, K1/K2, fake-provider implementation, независимое QE.
- TASK-3 FR-4 FR-5 A3: core health-recognized-unverified — grammar/source/replay/crash contract, tests; затем отдельный gateway adapter по собственному плану.
- TASK-4 FR-6 A4: измерить существующий index recovery в hermes-index-acceptance; затем по результатам реализовать отдельную управляемую операцию без повторения save.
- TASK-5 FR-7: независимый QE каждого среза, parent traceability/risk/integration/regression fleet review, устранение blockers.
- TASK-6 FR-8: документы и шаблоны, частые commits/push, draft PR; финальный отчёт с exact tested HEAD и открытыми ограничениями.

## Dependency order

TASK-1 и TASK-2 независимы; TASK-3 core -> adapter -> TASK-4 managed index.
Эксперимент существующего index допускается параллельно core. TASK-5 после
соответствующего кода; TASK-6 обновляется по ходу и завершается после проверки.

## Risks и границы

Это parent orchestration plan, code targets находятся в child plans. Он дописан
после первых административных проверок и OAuth среза: не выдавать этот документ
за их предшествующий gate. Initial test index acceptance target/context admission
выполнен после первого черновика теста; отклонение отмечено, дальнейшие правки
выполняются после admitted/complete. Нельзя ретроспективно заявлять pre-code gate.

Отсутствующий shared dz backlog store не ремонтируется; waiver в README.
Не создавать реальный OAuth broker, не обновлять Hermes, не размораживать source.
