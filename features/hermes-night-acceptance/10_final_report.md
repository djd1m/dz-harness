# Отчёт ночной лабораторной итерации Hermes

Статус: тестовый кандидат подготовлен и прошёл независимые компонентные проверки.
Рабочий Hermes не обновлён, новая запись recognized и индексация в нём не включены.
Полный формальный feature-adr pipeline не объявлен зелёным: ограничения инструмента
Python discrimination и исторического порядка шагов перечислены в09_fleet_qe_assessment.md.

Начало работ:2026-11-09 22:29 UTC. Согласованное окно:до2026-11-10 06:29 UTC.
Окно не является свидетельством восьми отработанных часов; финальное время будет
зафиксировано после проверки повторного CI.

## Результат

| Подсистема | Проверено | Граница |
| --- | --- | --- |
| Offsite S3 restore | Snapshot c48c1a01:123 источника manifest поSHA/размеру,7 SQLite integrity checks,2 image archives поSHA | Отдельный root0700 каталог; без запуска восстановленного gateway и без клинической проверки |
| Чистая установка candidate | Новый Hermes home, enable/doctor/validate,7 tools, настоящий synthetic ingest/search | Текущий pinned image, не новый VPS/rebuild; private ContextVars warning остаётся |
| OAuth | Fake-provider single-owner lab,17 тестов и независимое QE | Реальные токены и refresh не используются; production broker не установлен |
| Core recognized |35 тестов, immutable operation ID, source binding, unverified status, replay/status | Административный API сам не доказывает согласие; dev/inode binding ограничивает restore |
| Gateway adapter |109 regression tests, actual installed CLI integration с5SIGKILL сценариями | Подтверждение через trusted handler проверено в лаборатории; настоящий Mattermost transport новых команд не принят |
| Index lab |15 тестов,18 фрагментов, реальный поиск, partial retry, conflict/drift probes | Operator-only; строгая SQLite сверка; нет automatic save retry, rollback или vector readiness |
| Сквозная цепочка | Prepare → confirm → core → отдельный index → repeat no-op → reconcile → search | Один технический источник; parser response подменён техническим текстом, внешняя доставка не проверяется |
| Чувствительность тестов |3 baseline PASS и3 mutant assertion FAIL при отключении отдельных защит | Только выбранные guards; native discrimination остаётся NOT ESTABLISHED |

MEASURED: coverage нового Python adapter —428/432 statements и181/186 branches,
по `fleet-regression-evidence/coverage.json` на git commit `7e52bef`. Измерение
не распространяется на Node core/OAuth/index и не означает медицинскую точность.

## Где находятся результаты

- Родительская итерация и adapter: https://github.com/djd1m/dz-harness/pull/36
- Отдельный index experiment: https://github.com/djd1m/dz-harness/pull/37
- Core recognized: https://github.com/djd1m/dz-harness-hub/pull/126
- Воспроизводимый запуск:07_lab_runbook.md.
- Четыре роли аудита:09_fleet_qe_assessment.md и fleet-*.md.
- Восстановленная копия на хабе:
  `/var/tmp/corp-restore/hermes-night-20261109/srv/hermes-dz-health`.
  Содержит приватные данные, доступroot0700; её содержимое не публикуется.

Точные source hashes и команды находятся в компонентных QE reports. Проверенные
core source bytes сохранены в1dbdcaed0; последующий2c5614ea0 исправляет только
две сгенерированные строки корневого README и добавляет CI evidence.
Index source84b8ef9, QE8faf5b2, machine evidence5576c35. Adapter source2172a56;
дополнительные тесты7e52bef, runtime source не изменён.

## CI и состояние поставки

Первый общий CI core остановился на устаревшем generated catalog README.
Это воспроизводилось и на базе PR, и на candidate; package manifests и inventory
совпадали. Исправлены только version row и membership digest. Изолированный
канонический generator check после исправления PASS. Повторный GitHub run:
https://github.com/djd1m/dz-harness-hub/actions/runs/42721354665

Статус повторного CI: ожидается финальный результат. Не считать PR готовым к
слиянию на основании одного focused check. PR остаются draft, ни один не merge.
Зависимости от прежних draft PR33/35 сохранены; цепочку нужно рассмотреть целиком.

## Что сохранено и что не менялось

Рабочая карта, её статусы и frozen исходный VPS не изменялись этой итерацией.
Рабочие контейнеры не пересоздавались. Установленный health image остаётся
`sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`.
Действующие hermes-me и hermes-dz-health наблюдались запущенными; read-only OAuth
usage probe ранее в этой итерации вернулHTTP200 для обоих. Это не проверка
следующего refresh и не гарантия срока действия подписки.

Секреты и медицинские документы не включены в PR. Тесты используют вымышленные
технические материалы. Проверка настоящего backup ограничивалась hashes,
размерами и целостностью SQLite внутри закрытого каталога.

## Следующий этап перед production

1. Спроектировать и проверить recovery/rebind recognized на новом path/inode,
   включая восстановление private receipt/HMAC state из backup.
2. Принять новые команды на настоящем Mattermost в отдельной технической среде;
   проверить identity, доставку, повтор и отказ без записи.
3. Согласовать способ закрытия Python discrimination gate; текущий инструмент
   честно вернул CANNOT_ISOLATE, ручные mutants не выдаются за его PASS.
4. После review цепочки PR отдельно решить о внедрении. OAuth broker и индексацию
   не включать автоматически вместе с adapter.

Rollback рабочей системы не требуется: новые изменения в неё не применялись.
Для тестовой неопределённой операции используется status/reconcile прежнего
operation ID; квитанции/артефакты не удаляются ради повторного запуска.
