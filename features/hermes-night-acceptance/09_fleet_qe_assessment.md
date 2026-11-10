# Итог четырёх ролей fleet

**Синтетический кандидат проверен; формальный полный pipeline — NEEDS_REMEDIATION.**
Это не отказ работающих тестов и не разрешение production. Нативный инструмент
discrimination не умеет классифицировать Python unittest; его результат
`CANNOT_ISOLATE` сохранён. Исторические нарушения порядка некоторых pre-code
шагов нельзя исправить ретроспективным переименованием отчётов.

## Состав проверки

| Роль | Артефакт | Результат |
| --- | --- | --- |
| Traceability | fleet-traceability-risk.md | Начальная матрица FR, затем уточнение ниже |
| Risk | fleet-risk.md | Ограничения synthetic scope отделены от deployment blockers |
| Integration | fleet-integration.md | Actual adapter → core → index, одинаковый operation ID, поиск, повтор без записи |
| Regression | fleet-regression.md | После одной remediation-итерации выполнены фиксированные coverage thresholds |

Четыре отдельные роли выполнялись разными агентами волнами: доступно четыре
concurrency slots вместе с главным агентом. Это не одновременный запуск четырёх
дочерних агентов в одном сообщении. Выбор plain/Codex и независимого Codex другой
модели задан владельцем; reviewer использовал gpt-6-astra. Установка aqe runtime
или использование его memory/fleet API не заявляются.

## Трассируемость на момент синтеза

| FR | Реализованный результат | Доказательство |
| --- | --- | --- |
| 1 | Отдельный restore выбранного offsite snapshot, hashes/integrity | 04_restore_results.md |
| 2 | Новый Hermes home, discovery/validation и реальный synthetic search | 04_restore_results.md, 07_lab_runbook.md |
| 3 | Offline OAuth owner, отказ при неоднозначном refresh | hermes-oauth-offline-lab/08_qe_report.md |
| 4 | Immutable unverified core + отдельное подтверждение gateway handler | core PR126 и hermes-recognized-confirm/08_qe_report.md |
| 5 | Idempotency, durable intent/reconciliation, crash windows | Adapter integration и core QE |
| 6 | Отдельная операторская индексация, полный SQLite readback и known-source search | Index PR37/08_qe_report.md; evidence/combined_integration.py |
| 7 | Независимое QE, meaningful negative tests и remediation coverage gap | Четыре fleet reports; adapter/09_negative_controls.md |
| 8 | Раздельные draft PR, runbook и итоговый отчёт с границами допуска | PR126, PR36, PR37; 10_final_report.md |

Таблица закрывает работу лабораторной итерации и не расширяет требования до
production delivery. Первоначальные 5/8 chains в traceability report сохранены
как промежуточная оценка; позднейшие index/QE/docs evidence добавлены выше.

## Исправленные пробелы

MEASURED по coverage report `fleet-regression-evidence/coverage.json`, git commit
`7e52bef`: после14 дополнительных тестов полный suite109 PASS и actual CLI
integration PASS. Новый модуль:428/432 statements,181/186 branches. Все четыре
заранее определённые критические группы превысили порог90 по обеим метрикам.
Исходный недостаточный coverage report сохранён; denominator не уменьшался.

MEASURED по `../hermes-recognized-confirm/evidence/manual-negative-controls.json`:
для трёх конкретных отключённых защит baseline PASS, mutant assertion FAIL.
Это доказательство чувствительности выбранных тестов, не замена отсутствующему
нативному классификатору Python и не полная mutation campaign.

## Оставшиеся ограничения

- Native discrimination: NOT ESTABLISHED; требуется поддерживаемый Python runner
  с различением assertion/setup failure либо явно согласованный альтернативный
  процесс. Вывод инструмента не замаскирован TAP-обёрткой.
- Parent DDD/план и первоначальный index test admission частично оформлены после
  первых действий. Это отражённое process deviation, не успешный pre-code gate.
- Shared dz backlog/recall store unreadable; не сбрасывали его ради зелёного
  статуса. История сохранена в Git, успешная запись в backlog не заявляется.
- Установка на рабочую карту требует отдельного recovery/rebind для новых
  recognized artifacts после переноса на другой inode/path, настоящего
  Mattermost round-trip и проверки private Hermes API на выбранной версии.
- Same-UID shell не ограничен model-tool API. OAuth остаётся fake-provider lab;
  общий реальный refresh-owner не внедрялся. Index рассчитан на одного оператора,
  не обещает общую транзакцию, rollback или vector readiness.

Численный риск-взвешенный coverage по всем подсистемам не вычислялся: нет
измеренной истории change frequency/bug history. Python coverage нельзя выдавать
за coverage Node core, OAuth или индекса. Полный CI ядра отражается отдельно в
итоговом отчёте; ручные проверки не подменяют его.
