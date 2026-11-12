# Лаборатория индексации непроверенного текста

CLI только для оператора и закреплённого Node 22 / health-advisor runtime.
Это не инструмент Hermes и не production-интеграция. Используется исключительно
вымышленный технический текст. Sentinel предотвращает случайную работу с
непомеченным каталогом, но не распознаёт медицинские данные и не разрешает их
обработку. Сеть, credentials, production volumes, автоматические intake/save/retry
не нужны и не поддерживаются.

Оператор заранее создаёт принадлежащий ему private каталог0700 внутри `/tmp`
или `/var/tmp`, отдельный непосредственный дочерний workspace0700, настоящий
каталог технических источников, принятую immutable unverified операцию и
существующую SQLite third-brain БД. Символические ссылки в пути запрещены.
Лаборатория не создаёт отсутствующую БД. В корне lab нужен обычный собственный
файл0600 с одной жёсткой ссылкой `.health-index-lab-synthetic`, ровно с такими ключами:

```json
{"schema":"hermes-recognized-index-lab-1","workspace":"/tmp/private-lab/workspace","nonce":"0123456789abcdef0123456789abcdef"}
```

Общие явные аргументы всех команд:

```sh
NODE=/opt/health-node22/bin/node
LAB=integrations/hermes-health/experiments/recognized-index/index_lab.js
$NODE "$LAB" plan --lab-root /tmp/private-lab --workspace /tmp/private-lab/workspace --operation-id op-one --case synthetic
$NODE "$LAB" apply --lab-root /tmp/private-lab --workspace /tmp/private-lab/workspace --operation-id op-one --case synthetic --execute --synthetic-confirm --expect-plan-sha256 FULL_DIGEST_FROM_PLAN
$NODE "$LAB" reconcile --lab-root /tmp/private-lab --workspace /tmp/private-lab/workspace --operation-id op-one --case synthetic
$NODE "$LAB" search-known --lab-root /tmp/private-lab --workspace /tmp/private-lab/workspace --operation-id op-one --case synthetic --query unique_synthetic_term
```

`status` эквивалентен `reconcile`. `plan` проверяет core artifact и источник,
но не утверждает полноту БД; остальные команды открывают строгий native
read-only SQLite v2 snapshot. Отсутствующая, повреждённая, заблокированная БД,
неизвестная схема или недоступный backend дают `readback_unproven`, а не пустой
список. Пути native module и core package закреплены в experiment и не задаются
вызывающим. Core capabilities проверяются до чтения артефакта. Повторно
используются `buildRecords` и прямой `write.ingest` без изменения core package
или регистрации нового third-brain CLI kind. Kind фиксирован: `machine-unverified`.

Полнота — точное мультимножество pattern, domain, type и reward всех фрагментов.
Пределы SQLite: 10 000 строк, 32 MiB совокупного текста/metadata, по128 MiB для
DB/WAL/SHM. Повторяющиеся ключи metadata, повреждённые заголовки документа,
дубликаты и варианты pattern исключают успешный результат. Нет fallback через
recall/JSON. Входной argv ограничен16 KiB, JSON-ответ —2 MiB. Текст артефакта
не выводится: только hashes, IDs, количества и маркировка `НЕПРОВЕРЕНО`.

Явный apply для `none` или `exact_subset` выполняет одну полную детерминированную
попытку ingest. Полный preflight означает no-op. Исключение, ненулевой код или
таймаут всегда означают `index_unknown`, даже при полном postflight. Затем нужна
отдельная команда `reconcile` и, если уместно, явный apply с тем же digest плана.
Хеши недостающих записей определяют подмножество. Нет автоматического retry,
удаления, rollback, активации ревизии или гарантии vector readiness. Убитый извне
процесс не выдаёт квитанцию: результат считается неизвестным, нужен reconcile.
Тестовый harness ограничивает дочерний процесс120 секундами; это не production SLA.

Требуется один оператор на private fixture. Существующая блокировка ingest
не создаёт общей транзакции preflight/ingest/postflight/проверки источника.
Параллельные изменения могут вызвать отказ после частичной записи; durable
глобальная полнота не обещается. Враждебные изменения тем же UID между проверками
путей вне модели лаборатории. Read-only SQLite означает логическое чтение:
открытие WAL-БД может обслуживать временные WAL/SHM sidecars. Побитовая
неизменность всей файловой системы не заявляется. Источники и immutable recognized
файлы отдельно проверяются на неизменность. Core receipt сохраняет
`index_status:not_requested`; копирование/restore workspace по-прежнему учитывает
realpath/dev/inode binding и может потребовать отдельно спроектированный rebind.

`search-known` сначала требует полной сверки, затем проверяет точные header/body
ожидаемого результата и текущий источник. Это достижимость известного фрагмента,
не семантическая полнота и не клиническая достоверность. Общий запрет скрытых
путей в Hermes сохранён.

Smoke дополнительно наблюдает `dz recall --all`: штатное исключение медицинского
домена скрывает `health-research`. Только явный synthetic fixture export
`--include-domain health-research` сравнивается с полным набором (>10 фрагментов).
Ни один из вызовов recall не является основанием вывода о полноте в самой лаборатории.

## Проверка

`test_index_lab.py` и `integration_smoke.py` требуют настоящий закреплённый runtime;
отсутствие зависимостей — ошибка, а не skip. Fixture выполняет настоящий intake
технического ZIP и core save до начала проверки lab; SQLite заполняется существующим
ingest. Перед изменением SQLite для имитации отказов выполняется SQLite backup.

Image: `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`,
сеть отключена, UID/GID1000:1001, root и candidate mounts read-only,
исполняемое private временное хранилище внутри `/tmp`. Принятый core package
монтируется read-only в `/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor`;
сохраняются harness-core и native better-sqlite3 из image. Задайте
`HA_CASE_LOCK_MODULE=/opt/health-advisor-runtime/node_modules/@dzhechkov/harness-core/dist/index.js`,
добавьте `/opt/health-node22/bin` и runtime `node_modules/.bin` в PATH.
Запустите `python3 test_index_lab.py`, затем `python3 integration_smoke.py`.
Общий runtime не пересобирается, production mounts не используются.
