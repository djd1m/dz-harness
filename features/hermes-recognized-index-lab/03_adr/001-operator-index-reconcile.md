> Исполняемое уточнение B1–B4 ниже имеет приоритет над первоначальным вариантом readback через recall.

# ADR-001: отдельная управляемая индексация immutable unverified operation

Статус: design для operator-only synthetic lab, 2026-11-09. Зависимость: принятый core `saveUnverifiedRecognition`/`readUnverifiedRecognition` и установленный lab runtime. Индекс не запускается при core save или gateway confirm.

## Context

Core сохраняет exact `recognized/.machine-unverified/operations/<opid>/artifact.md`, source binding и `verification_status:unverified`, `index_status:not_requested`. Existing third-brain `write.ingest` умеет deterministic chunks/patterns, dedup exact pattern и per-workspace ingest lock. Но `third-brain` CLI разрешает `kind` только `consultation|trend|synthesis|conclusion`; ни один вариант не обозначает машинный непроверенный текст. JS `write.ingest` проверяет непустой kind и `buildRecords` экспортирован. Его CLI counters, `backlinks` и `--no-mirror` не доказывают точное сохранение всех chunk bodies или vector readiness. При timeout могла сохраниться часть records. Current Hermes `HealthTools.read` отказывает на hidden `.machine-unverified` пути.

## Alternatives

| Вариант | Решение |
| --- | --- |
| A. Передать artifact в existing third-brain CLI как `consultation`/другой разрешённый kind | Отклонён: клиническое имя создаёт ложный статус; CLI не поддерживает `machine-unverified`. |
| B. Добавить новый kind в основной CLI и подключить Hermes search | Отложен: меняет общий product/search contract и требует отдельного gating во всех adapters. |
| C. Operator-only wrapper поверх `write.ingest` JS API с `kind=machine-unverified`, exact readback и real search | Выбран для синтетического lab. Не меняет core artifact и не регистрирует gateway/product tool. |
| D. Прямой read-only SQLite query к `memory_records` | Выбран после B1 challenge как authority с обязательным schema/version/native gate; fallback запрещён. |

## Decision

CLI verbs `plan`, `apply`, `status`/`reconcile`, `search-known` принимают synthetic workspace, opid и explicit bounded case slug. Все verbs требуют оператором созданный **заранее** owned regular sentinel `.health-index-lab-synthetic` с schema и confined `--lab-root`; symlink/root mismatch, отсутствующий marker или карта вне root — отказ. Это защита от случайного запуска на реальной карте, не криптографическая авторизация. `apply` дополнительно требует `--execute --synthetic-confirm --expect-plan-sha256 <full digest>`. Ни план, ни status/search не вызывают save/intake/ingest. CLI не создаёт sentinel, production service, journal или timer.

План читает core `readUnverifiedRecognition(workspace,opid,{includeText:true})` и summary/status, требует current source valid, exact text SHA/bytes и immutable artifact path under exact namespace. Не принимает arbitrary document path. `write.ingest` должен читать **тот же файл**, без префикса, перепаковки или нового index document. Date берётся из immutable core `created_at` в UTC YYYY-MM-DD, `case` — явный whitespace-free slug, включённый в plan digest; изменённый case на том же doc_id становится metadata variant и конфликтом. Один source anchor = сохранённый source `entry_id`, повторно разрешённый. `kind=machine-unverified` во всех ожидаемых `ha-doc-1` headers; пользовательский output помечает `НЕПРОВЕРЕНО`. `buildRecords` строит точный expected set, включая domain/type/reward и полный pattern; plan digest связывает opid, core request digest, artifact SHA/path, source binding, case/date/kind и ordered hashes всех patterns. Timestamps не меняют pattern identity и не используются как доказательство.

`apply` перед записью заново вычисляет план и сверяет digest, проверяет current source/artifact. Preflight exhaustive readback различает `none`, `exact_subset`, `complete`, `conflict/unknown`. `complete` → no-op с повторной проверкой. `none` или `exact_subset` → один явный `write.ingest` того же immutable файла/metadata; при subset повторяется весь детерминированный batch, полагаясь на проверенную exact-pattern dedup importer, а не на CLI skipped count. После ответа либо timeout обязательно новый exhaustive readback и core status. Только полное соответствие каждого ожидаемого pattern и отсутствие extra record с тем же doc_id/другим header даёт `indexed_unverified_at_check_time`. При timeout или неполном readback — `index_unknown`/`partial`, никогда `indexed`. Никакой автоматической повторной попытки: оператор сначала вызывает `reconcile`, изучает exact missing subset и затем отдельно `apply` с тем же plan digest. Если readback недоступен, усечён, schema неизвестна, обнаружен unexpected/variant record или core drift — отказ. Удаление/rollback здесь не поддержано.

Readback authority: strict SQLite snapshot, как определено поправкой B1 ниже. `dz recall --all` не используется для решения о записи.

`search-known` после full readback делает реальный `third-brain search(query,{workspace})` по уникальному synthetic term, проверяет hit `doc_id`, `doc_sha256`, `doc_path`, `kind`, `anchors`, chunk/body против expected pattern и **снова** core read/status source/artifact. Output — `НЕПРОВЕРЕНО`, `human_verification:not_established`, `content_trust:untrusted_document`; найденный hit доказывает достижимость одного известного passage, не semantic coverage. Отсутствие hit не доказывает отсутствие index data. Current `HealthTools.search` на этот hidden path не работает; не добавлять blanket dot allowance. Future narrow read-only adapter может открывать только точный namespace после core status provenance, отдельно от этого CLI.

### Amendments B1–B4: strict SQLite lab authority

B1: Источник полноты — закрытый snapshot read-only SQLite в закреплённом runtime,
не `dz recall --all`: последний может вернуть [] при ошибке backend. Native
better-sqlite3 обязателен, нет JSON fallback. База должна уже существовать после
явного seed fixture; lab её не инициализирует. Schema user_version=2, таблица
memory_records с id/skill_id/text/score/outcome/timestamp/metadata; integrity_check=ok;
regular owned files, no symlink brain/DB, размер DB/WAL до128MiB каждый,
не более10000 записей, совокупный text/metadata до32MiB. Неизвестная schema,
corrupt/missing/locked native backend → readback_unproven до ingest. Read-only
SQLite snapshot даёт полную выборку. `recall --all` лишь дополнительная сверка,
не authority и не fallback. Bound wrappers: input16KiB, output2MiB, outer test
процесс120s; source/text bounds задаёт core. Lab не production SLA.

B2: exact multiset строк pattern и domain/type/reward, каждая ожидаемая ровно
один раз. Дубли, другой case/header/body/domain/type/reward → conflict. Любая
неразбираемая запись ha-doc/с тем же doc_id или artifact path → unproven/conflict,
не молчаливое исключение. Обычные несвязанные записи допускаются. IDs/timestamps
не входят в semantic equality. Metadata duplicate keys отвергаются.

B3: timeout/nonzero write всегда index_unknown даже при полном readback; отдельный
status/reconcile может доказать complete как новое наблюдение. Нет автоматического
retry и rollback. Single operator на private synthetic fixture — явное условие;
межпроцессная транзакция preflight/apply/postflight не обещается. После каждого
apply повторяются readback и core provenance. Изменившийся источник — refusal,
записи могли остаться. Core save/intake в lab отсутствуют.

B4: root обязан быть private owned directory под /tmp или /var/tmp, отдельный
workspace child, без aliases. Sentinel regular0600 nlink1, schema
hermes-recognized-index-lab-1, workspace realpath и32hex nonce, strictkeys.
Программа его не создаёт. Это защита от случайного использования непомеченной
карты, а НЕ detector PHI. Оператор обязан создавать только синтетические данные.
Общие /, /home, /tmp, /var/tmp какlabroot запрещены.


## Consequences and limits

No new artifact bytes, no autoindex on save, no repeated save/intake on index failure, no vector index claim. Исходный core receipt остаётся `index_status:not_requested`: lab output — наблюдение на момент проверки, не изменение core metadata. `write.ingest` может оставить partial records; `index_unknown` не означает rollback. Lab ограничен synthetic workspace; production readiness, global locking, unindex/replacement и качество распознавания не доказаны.

## Confirmation

`integrations/hermes-health/experiments/recognized-index/test_index_lab.py` проверяет sentinel/flags, exact plan, unsupported clinical kinds, no write for plan/status, source/artifact drift, partial/timeout, exact subset retry, extras/variants conflict и отсутствие повторного save/intake. `integrations/hermes-health/experiments/recognized-index/integration_smoke.py` выполняет реальный runtime ingest/recall/search на synthetic fixture с уникальным term, включая `--all` over ordinary limit и core status readback; skip/unavailable не PASS. Независимый challenge/review проверяет выводы; этот ADR не signoff.


