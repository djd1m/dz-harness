# Независимый QE: recognized index lab

Дата: 2026-11-09. Reviewer: отдельный Codex gpt-6-astra; автор реализации — другой агент/модель. Пользователь разрешил этот формат независимого review. Код и тесты reviewer не изменял.

**Вердикт: PASS только для operator-only synthetic lab по ADR B1–B4.** Блокирующих дефектов в проверенном срезе не обнаружено. Это не разрешение production, не завершение родительского L-плана и не подтверждение общего Hermes search/transport, DRP или клинической достоверности.

## Проверенные байты

Рабочее дерево `/home/dz-user/dz-harness-health-index-lab`, базовый HEAD `0da811d94812d5df588e193208068f03adafbb73`; новые файлы среза на момент review ещё не были частью этого HEAD. Authority snapshot — SHA-256 ниже, а не только Git revision.

| Файл в `integrations/hermes-health/experiments/recognized-index/` | SHA-256 |
| --- | --- |
| `index_lab.js` | `32a72c887c73b21721e04d7f3d945864f7338757a42eb5a5477196c45b2eca30` |
| `test_index_lab.py` | `86d02f9b73171841a628dbf75a89421301221c7be6c72abe04080c5c0dfa936a` |
| `integration_smoke.py` | `88feb93a23d2f885cd11e13c331285fbd8caeac739ba99837a5bdb409ec09140` |
| `README.md`, финальный русский текст | `5fd5572d012a988018a37ac79f5615cc128b8359656077a56666e4c6fe94cd6d` |

Dependency — принятый core `1dbdcaed0`, read-only overlay из `/home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor`. Проверенные core hashes: `lib/recognized-store.js` = `14dc9770bcdec8465fd85adc5d54aa52e577f3618d898c919db9d3fa93100ff3`; `lib/recognized-cli.js` = `00a1bdb0fcdafb6c92609b5d1356f7acedf542e570314da760e941fb08aa0395`.

## Независимо измеренные результаты

- MEASURED: `test_index_lab.py` — **15/15 PASS, 0 skip**, 102.199 s. Лог `/tmp/recognized-index-qe-tests.log`.
- MEASURED: `integration_smoke.py` — PASS, полный ожидаемый набор **18** фрагментов, настоящий ingest и search, неизменные protected source/artifact hashes. Authority `native-readonly-sqlite-v2`. Лог `/tmp/recognized-index-qe-smoke.log`.
- MEASURED: supplemental default recall вернул **0**, explicit `--include-domain health-research` — **18**. Ноль default recall не принят за отсутствие записей: полноту доказывает SQLite snapshot.
- MEASURED: дополнительный reviewer probe через временный preload seam менял score одной строки **после настоящего ingest**. Получен `index_unknown`, `coverage:conflict`, `writes_may_exist:true`; protected hashes не изменились. После явного восстановления score отдельный reconcile подтвердил complete.
- MEASURED: отдельный post-ingest seam изменял исходный synthetic source после записи. Получен `index_unknown`, `code:source_drift`, `writes_may_exist:true`. Это моделирование interleaving, не тест двух одновременно работающих операторов.
- MEASURED: удержание WAL write lock оставило readonly snapshot доступным, попытка ingest закончилась `index_unknown/write_unproven`. Первоначальное ожидание reviewer о preflight refusal было неверно для WAL; этот probe не считается доказательством отказа на нечитаемой locked БД. Попытка переключить journal mode для другого lock probe не прошла setup (`database is locked`) и также не засчитана.

Запуски выполнены на image `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`, `--network none --user 1000:1001 --read-only --init`, private executable tmpfs `/tmp` mode0700 uid1000/gid1001, `HOME=TMPDIR=/tmp`. Integration смонтирован read-only в `/plugin`, core overlay — в установленный package path. `HA_CASE_LOCK_MODULE` указывал на установленный `harness-core/dist/index.js`; PATH включал `/opt/health-node22/bin` и runtime `.bin`. Entry point `python3`; выполнены `/plugin/experiments/recognized-index/test_index_lab.py` и `integration_smoke.py`. Production mounts, credentials, сеть и реальные медицинские данные не использовались.

## Что проверено в реализации и assertions

B1: native SQLite обязателен, missing/corrupt/unknown schema не превращаются в пустой index. Нет recall/JSON fallback и неявной инициализации БД. Snapshot проверяет schema v2, integrity, ownership/path, DB/WAL/SHM sizes, count и aggregate text/metadata bound до полной материализации. Read-only здесь логический: возможна работа SQLite с sidecars.

B2: сравнивается полное мультимножество pattern/domain/type/reward. Тесты реально меняют case, body, type, domain, score; проверяют duplicate pattern и duplicate metadata keys. IDs/timestamps не заявлены частью semantic equality. Exact subset retry восстанавливает два отсутствующих фрагмента без повторного core save; полный набор даёт no-op. Malformed related headers не скрываются из сравнения.

B3: результат ingest не является доказательством полноты. Postflight snapshot и core provenance выполняются после попытки записи; exception после фактически успешного ingest остаётся unknown даже при complete. Только новый reconcile даёт новое положительное наблюдение. Дополнительные probes проверили конфликт и source drift в интервале после записи. Нет автоматического retry/rollback, общей транзакции или гарантии неизменности после возврата.

B4: все команды требуют заранее созданный strict sentinel, private owned confined temp root и workspace; apply дополнительно требует execute, synthetic-confirm и точный digest плана. CLI не создаёт marker и не принимает произвольный artifact path. Current source/artifact binding проверяется через accepted core. Guard защищает от случайного выбора карты, не обнаруживает PHI и не является криптографической авторизацией.

Проверен настоящий `search-known`: точные header/body ожидаемого passage плюс повторная provenance проверка. Вывод не содержит synthetic document body и сохраняет `НЕПРОВЕРЕНО`, `human_verification:not_established`, `content_trust:untrusted_document`. Hidden path остаётся запрещён в общем `HealthTools.read`; новый product tool не зарегистрирован. Core receipt сохраняет `index_status:not_requested`.

## Ограничения signoff

Один оператор и private synthetic fixture — часть контракта. Reviewer probes не доказывают конкурентную serializability, power-loss durability или все OS/SQLite lock modes. Внешний SIGKILL не может вернуть квитанцию; требуется reconcile. Тестовый timeout 120 s не задаёт production SLA. Не проверены vector readiness, semantic coverage, реальное gateway/Mattermost transport или распознавание медицинского документа.

Core binding realpath/dev/inode по-прежнему может отвергнуть скопированную/восстановленную карту: нужен отдельный deliberate recovery/rebind contract до production. Старые restore evidence не подтверждают restore нового recognized namespace. Изменения тем же UID между path checks вне модели lab. Формальный parent L fleet/process assessment остаётся отдельным этапом.

Checkpoint lead: проверенные файлы сохранены коммитом `84b8ef9`; SHA-256 выше остаются authority snapshot. После QE исходники и тесты не менялись.
