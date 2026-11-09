# Ночная приёмка и развитие Hermes

Начало: 2026-11-09 22:29 UTC. Плановое окно: до 2026-11-10 06:29 UTC.
Режим: plain, feature-adr Reference; код Codex, независимое QE другой моделью.

## Границы

Рабочая карта/статусы и frozen source не меняются. Нет merge PR и обновления
production Hermes. Restore только в отдельную закрытую среду. Новые recognized
и index операции — технические документы. Секреты и PHI не попадают в Git/логи.

## Этапы

1. Аудит состояния, PR и резервных копий — выполнен; baseline и contract audit сохранены.
2. Чистая загрузка плагина в закреплённом runtime + restore S3 c48c1a01 — выполнены. 123 источника, 7 SQLite integrity_check; полный rebuild хоста не заявляется.
3. OAuth ADR и синтетический прототип — выполнены; 17 тестов и независимое QE PASS в ограниченном offline scope. Production не подключён.
4. Core recognized — 35 тестов и независимое QE PASS в synthetic scope; PR dz-harness-hub#126. Gateway adapter реализуется и проверяется отдельно; общий шаг ещё не завершён.
5. Existing index experiment PASS (5 chunks, repeat/recovery/stale), но hidden namespace недоступна HealthTools. Новый operator-only index lab реализуется в изолированной ветке, не принят.
6. OAuth, existing index и core прошли отдельные QE; adapter/index lab и общий fleet review ожидают завершения.
7. Документы и draft PR #36 созданы; финальный отчёт и остальные этапы в работе.

PR: https://github.com/djd1m/dz-harness/pull/36
Коммит проверенного OAuth lab и restore evidence: f130128.
Backlog: не заведено — dz store guard отказал из-за unreadable shared store; отказ записан, shared store не ремонтировали.

План — ориентир, а не свидетельство выполнения. Не завершать этап по времени
без доказательств. Непройденные проверки отражать явно.


## Новые ограничения для deployment

- Core request fingerprint включает realpath/dev/inode: восстановление на новую
  файловую систему требует отдельного deliberate recovery/rebind. Это блокирует
  production deployment нового recognized, но не уничтожает исходные байты.
- `dz recall --all` может вернуть [] при backend failure; index lab переходит на
  strict readonly SQLite authority с schema/native gate, без JSON fallback.
- Реальная доставка новых gateway-команд в Mattermost пока не принималась.
- Оба существующих контейнера hermes-me/hermes-dz-health прошли read-only
  OpenAI usage probe HTTP200 около22:45UTC; это не проверка следующего refresh.

Core PR: https://github.com/djd1m/dz-harness-hub/pull/126
Core implementation commit: 68e1eaf7b; evidence/docs: 1dbdcaed0.
