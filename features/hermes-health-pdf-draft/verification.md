# Проверка кандидата PDF draft

Режим plain, кодирование Codex; независимый обзор отдельным gpt-6-astra.
Полный feature-adr delivery gate не заявляется. dz statusline использован для
отметки этапа; результаты тестов ниже получены командами, не выведены из панели.

- 67/67 тестов плагина в закреплённом образе Hermes, сеть отключена,
  исходники смонтированы readonly, рабочая карта не смонтирована.
- 14/14 тестов broker: framing, лимиты, malformed JSON, flags и cleanup.
- Реальный Docker broker: технический PDF -> ok + ожидаемый текст;
  повреждённые bytes -> invalid_pdf; timeout -> timeout, оставшихся sandbox нет.
- Полный synthetic broker + адаптер: 2 файла MD/HTML, хеши совпали,
  права0600, исходный manifest не изменился.

## Воспроизведение интеграции

```bash
sudo python3 integrations/hermes-health/pdf-sandbox/integration_smoke.py \
  --parser-image sha256:89499635ad081bd68531310f4d2088ebfd24507ac344601aba9ab2cac298c5b3 \
  --hermes-image sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961
```

Используется локальный Docker daemon; тест не запускает рабочий gateway.
Имена образов выше — фактически проверенные локальные IDs этой установки.
Сборка на другом хосте должна отдельно зафиксировать полученный immutable ID.

## Независимый обзор

Итог: PASS в согласованном объёме QE, см. review.md. После исправления QE-1
независимо пройдены 12 adapter tests и 14 broker tests; implementation не изменён.

## Runtime isolation

Проверен реальный worker image с флагами broker: UID65534, NoNewPrivs=1,
CapEff=0, connect к внешнему IP возвращает ENETUNREACH (101), memory.max=268435456,
pids.max=32. /workspace/medical и /var/run/docker.sock отсутствуют. Image-declared
Volumes=null. Отдельные ephemeral проверки не запускали рабочий gateway.

Первый plugin doctor при прямом mount всего checkout не прошёл из-за прав
служебного ops/backup-health.sh. Сформирован пакет только runtime Python-файлов,
plugin.yaml и skills, без ops/experiments/venv. Повторный doctor: PASS, 6 tools.
plugin validate: PASS; известное предупреждение private ContextVars API относится
к подтверждаемому intake, Hermes0.22.2 закреплён.

## Пилот в медицинском Hermes, 2026-11-09

Установлен curated plugin0.4.0, doctor:6 tools PASS, validate PASS с прежним
предупреждением private ContextVars API подтверждаемого intake. Image Hermes
не менялся. Broker systemd root:GID1001, Unix socket0660 в постоянном каталоге0750;
Docker socket в Hermes отсутствует. Шаблон unit приведён к этому способу хранения.
При первой проверке сразу после start socket ещё не появился: Type=simple не
гарантирует готовность. Повторная проверка и последующие проверки соединения успешны.

Согласованный технический PDF из рабочего manifest: созданы MD/HTML, SHA-256
артефактов и права0600 проверены; текст соответствует техническому документу.
Это проверка вызова tool напрямую, не принятие моделью команды через чат.
Оба файла реально загружены и опубликованы в приватном Mattermost-канале через
API бота. Получение пользователем отдельно не подтверждено.

После restart broker обработка через существующий bind mount успешна.
OCR, индекс и статусы человеческой проверки не менялись. PDF без текстового
слоя, >8MiB, >50 страниц и выход за лимиты не обрабатываются этим шагом.

После отдельного restart Hermes повторный технический вызов также успешен.
Рабочий manifest содержит123 записи, SHA-256 совпадает со снимком до установки.
Оставшихся контейнеров health-pdf-* после проверок нет. Для восстановления
сохранены plugin, broker, unit и parser image archive (47,869,952 байта) с SHA-256;
откат сохраняет карту/receipts/историю. Полный clean-host restore этого релиза
ещё не проверялся; не смешивать его с ранее проверенным восстановлением карты.

Архив parser image загружен через docker image load: восстановлен ожидаемый
immutable ID. Подтверждены эффективные NoNewPrivileges=yes, ProtectSystem=strict,
ProtectHome=yes, RestrictAddressFamilies=AF_UNIX у broker. В mounts Hermes только
home, карта, архивы и broker socket parent; Docker socket не передан.
