# Лаборатория индексации непроверенного текста

Статус: реализована и независимо проверена на синтетической карте: 15 тестов,
поиск по18 фрагментам и дополнительные проверки конфликтов после записи — PASS.
Индексация запускается отдельно от сохранения recognized operation.
Нет gateway command, production service, таймера, production install или publish.

Код и план: commit `84b8ef9`, draft PR37 djd1m/dz-harness.
Результаты и ограничения: `08_qe_report.md`.

Backlog: не заведено — shared dz store guard unreadable, не ремонтировали.
