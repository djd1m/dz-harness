# ADR-001: привязать один durable intent к одному offline target

## Status

Proposed. Решение относится только к синтетической лаборатории; пересмотреть после fault injection и независимой проверки. Не является принятым migration contract.

## Context

Старый core tuple и HMAC receipt привязаны к прежним workspace/runtime. Read-only verifier доказал внутреннюю согласованность ограниченного synthetic export, но его результат `executable:false`. B5 требует устойчивого mapping и правил crash/replay; `present` после core rename не гарантирует fsync parent.

## Decision drivers и варианты

Высокий приоритет: отсутствие ложного commit, old evidence immutable, закрытый target; средний: воспроизводимый restart. Рассмотрены (A) in-place rewrite старого tuple/receipt — отвергнуто из-за подмены свидетельства; (B) несколько независимых intent/mapping/seal файлов — отвергнуто из-за отсутствия общей atomic границы; (C) один versioned envelope + новый core save — выбран для offline эксперимента. Специальный restore API core отложен: это меняет доверенный product contract.

## Decision

`plan` заново проверяет export/descriptor/key, source-only target и installed runtime closure, строит deterministic mapping и digest. `apply --confirm-plan-digest <64 hex>` требует совпадения с показанным планом и берёт target lock; то же подтверждение требуется при отдельном `reconcile`. Локальная запись operator action в envelope удостоверяет только факт нового вызова команды, не личность и не историческое согласие.

Один private `intent.json` на том же local filesystem содержит закрытую схему ниже. Новый ID — `rc-` + первые 32 hex SHA-256 над ASCII `hermes-restore-op-v1\0` и последовательностью полей `snapshot_id,inventory_sha256,batch_id,target.realpath,target.dev,target.ino,old_id`; каждое поле кодируется UTF-8 с префиксом ровно 4 байта unsigned big-endian длины. Collision со старым/другим/new existing ID — отказ. Envelope создаётся и меняется temp `O_EXCL|O_NOFOLLOW` → write → fsync(file) → atomic rename → fsync(parent); initial rename обязан быть `RENAME_NOREPLACE` на Linux и не может заменить существующий intent, update rename допускает replace только под stable lock. Нет поддержки этой операции/dir fsync — отказ до core save; ошибка на любом шаге даёт unknown/fail-stop.

До intent source-only target сверяется с export по exact manifest/raw bytes и проходит fsync каждого source file, каталогов снизу вверх и target parent. Перед каждым core save durable `item=attempting`; после вызова actual pinned core CLI и exact readback новый fsync barrier охватывает artifact/metadata files, operation dir, operations/recognized parents и target source files/dirs, затем durable `item=observed`. После crash `attempting+present` требует **явного** reconcile с тем же digest, нового exact readback и полного barrier; это новое подтверждение текущих bytes, не утверждение о прежнем durable commit. Absent/staging/corrupt или неуспешный barrier оставляет held, никогда blind retry. `reconcile` не вызывает save; только новый explicit `apply` запускает оставшиеся `planned` после успешного reopen. Seal — следующая durable версия того же envelope после readback и barrier всех items; содержит plan/inventory/mapping/target/digests. Любой copied/stale/tampered seal отказывается.

## Закрытая схема и canonical bytes (W5)

Все JSON object имеют **ровно** перечисленные поля, duplicate/unknown keys запрещены. Encoding envelope: `json.dumps(...,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)` в UTF-8 + один LF; на reopen bytes должны совпасть с переизданным encoding. Строки не содержат NUL/surrogate/control; digest — 64 lowercase hex, ID — 32 lowercase hex с нужным prefix, bytes/count/generation — JSON integer (не bool) в безопасном диапазоне; envelope ≤64 KiB, items 1–32, actions ≤64, path ≤4096 UTF-8 bytes. Фиксированные schema values версионируются без fallback.

| Объект | Ровно эти поля и значения |
| --- | --- |
| Envelope | `schema="hermes-restore-intent-1"`, `batch_id` (32 hex), `snapshot_id` (32 hex), `inventory_sha256`, `descriptor_sha256`, `source_workspace`, `target`, `target_source_sha256`, `runtime_sha256`, `mapping`, `plan_sha256`, `generation`, `batch_state`, `items`, `actions`, `seal` (null до seal). |
| `source_workspace`, `target` | Каждый ровно `{realpath,dev,ino}`; dev/ino — canonical decimal strings (`0` либо без ведущих нулей); realpath — exact absolute string. Если старые операции имеют разные source workspace identities, весь batch отказывается. |
| `mapping[]` | Отсортирован по `old_id`; row ровно `{old_id,new_id,entry_id,logical_path,stored_at,source_sha256,source_bytes,text_sha256,text_bytes,engine}`; `engine` ровно `{name,version}`. Ожидаемые values выводятся заново из проверенного export, не из envelope. |
| `items[]` | Та же сортировка и cardinality, row ровно `{old_id,state,observation}`; state `planned/attempting/observed/held`, observation null кроме observed. |
| `observation` | Ровно `{request_sha256,text_sha256,text_bytes,source_sha256,source_bytes}` из нового core read + exact files; digest/bytes сравниваются с mapping. |
| `actions[]` | Append-only row ровно `{kind,plan_sha256,at}`; kind `apply/reconcile`, `at` UTC timestamp. Запись означает локальный явный вызов с подтверждением показанного digest, не удостоверяет личность. Предыдущие actions неизменны. |
| `seal` | Только при `batch_state=sealed`, ровно `{plan_sha256,inventory_sha256,target,observations_sha256}`; последний digest — SHA-256 canonical отсортированного `items[].observation` без LF. |

Immutable projection содержит ровно `schema,batch_id,snapshot_id,inventory_sha256,descriptor_sha256,source_workspace,target,target_source_sha256,runtime_sha256,mapping`; `plan_sha256=SHA256(canonical(projection))`, где canonical здесь тот же JSON encoding **без LF**. `target_source_sha256` — SHA-256 canonical отсортированного списка exact `{path,bytes,sha256,mode}` target source files и `{path,mode}` directories, не сырых data вместо их проверки. На reopen projection независимо строится из descriptor/export, вновь проверенного target/source/runtime и явно выбранного batch ID; сравнивается целиком, затем digest. `generation` начинается 0 и при каждом atomic transition растёт ровно на 1; сам по себе rollback не обнаруживает.

## Control root, reopen и команды (W1, W3–W5)

**Единственный** control root вычисляется из target identity: `<target-realpath>/.restore-lab`. Нет пользовательского `--control`, поэтому два оператора одного target не могут выбрать разные lock namespaces. До первого `apply` target обязан быть строго source-only, `.restore-lab` отсутствует; первый оператор под проверенным target fd создаёт `.restore-lab` через `mkdir` с `0700`, fsync target directory, затем `lock` regular `0600`, `nlink=1`, `O_EXCL` и fsync lock+control directory. Если конкурент увидел промежуточный root без готового lock, он отказывает и не создаёт второй namespace; повтор возможен только после явного operator inspection. Существующий готовый lock открывается без follow, проверяются owner/mode/nlink/inode; `flock` держится на всём `apply`/`reconcile`, inode lock никогда не заменяется/удаляется. После init `.restore-lab` — **одно явно разрешённое исключение** из source-only target profile, private и на том же filesystem; export/descriptor/key не вложены в target и не alias с ним. Недоступная или перемещённая target identity, иной путь к тому же inode/bind mount или незакрытая target directory — отказ. Это сознательная конкретизация W5 в пользу target-anchored claim; отдельный произвольный control root запрещён.

В `.restore-lab` допустимы только `lock`, один `claim.json`, один `intent.json` и **не более одного** expected temp `.intent.tmp.<batch_id>.<generation>` во время активного atomic transition. На reopen любой leftover temp — held/refusal, без cleanup. `claim.json` — immutable closed `{schema="hermes-restore-claim-1",batch_id,plan_sha256,target}`; создаётся `O_EXCL`, file+directory fsync **до** intent; это запрет другого batch при crash до intent, не второй mapping. Если claim есть без intent, intent без claim, unreadable/corrupt/multiple temp, claim другого batch либо target уже содержит чужую operation — fail-stop, без нового batch/auto-repair. Initial intent создаётся только через `RENAME_NOREPLACE` из exclusive temp, никогда replace существующего intent.

Каждый reopen под lock заново проверяет namespace и exact envelope/claim/input. После неизвестного прошлого `fsync` **только явный** `reconcile --confirm-plan-digest` может принять найденную единственную допустимую версию: повторный `fsync(intent file)`, `fsync(control root)`, повторное чтение/сравнение envelope и claim, затем предметная проверка items. Если имени intent нет либо bytes/version/claim неоднозначны, это held; отсутствие имени не разрешает другой batch. Ошибка перехода запрещает использовать in-memory state для продолжения. Предположение для `planned`: core save не мог начаться, пока file+directory fsync версии `attempting` не вернулись успешно. `apply` после подтверждения полного плана запускает только `planned`; `reconcile` лишь наблюдает, заново барьерит exact present и переводит в `observed/held`, без save. `sealed` никогда не переписывается при drift: команда возвращает refusal, прежний seal остаётся свидетельством. При ошибке одного item batch становится `held` только если durable update удался; иначе report unknown и никакой следующий item не запускается.

| Item/batch до команды | Факт | `reconcile` | Новый `apply` после reopen |
| --- | --- | --- | --- |
| `planned` / planned или applying | absent, без staging | Оставить planned | Может начать `attempting→save` |
| `planned` | present/staging/corrupt | Held, stop batch | Запрещён |
| `attempting` | exact present | Exact readback + полный W2 barrier → observed | Сначала требуется отдельный reconcile; save запрещён |
| `attempting` | absent/staging/drift/corrupt | Held, stop batch | Запрещён |
| `observed` | exact present | Повторить readback/barrier, оставить observed | Save запрещён |
| `observed` | mismatch | Held, stop batch | Запрещён |
| `held` | любой | Только refusal/наблюдение; нет авто-перехода | Запрещён |
| `sealed` / sealed | exact seal и все items | Идемпотентная проверка | Save запрещён |
| `sealed` / sealed | mismatch | Refusal без перезаписи seal | Запрещён |

Допустимые combinations: `batch=planned` ↔ все items planned; `batch=applying` ↔ хотя бы один attempting/observed и ни одного held; `batch=held` ↔ минимум один held, остальные не запускаются; `batch=sealed` ↔ все observed и non-null seal. При syscall unknown, когда даже held нельзя durable записать, batch-state на диске остаётся прежним, а команда возвращает unknown и прекращается. После первого item error batch останавливается. Target recognized начально **отсутствует**; после core save разрешены только `.restore-lab`, штатные core `recognized/.machine-unverified/operations/<mapped-id>/{artifact.md,metadata.json}` и core lock scaffold `.recognized-write/.dz` (directories, exact private owner/mode из pinned runtime). `.recognized-write/.dz/store.lock` — directory только при живом core save; остаток после завершения или crash — held до отдельного разбора. Возможная `.staging-<id>-<24 hex>` также причина held. Receipts, index, extra operations и прочие объекты отказывают. Target source-only preflight **до создания control root** требует closed inventory exact source entries, ownership/mode/nlink/no-follow, отсутствующего recognized и core lock namespace, durable copy-ready barrier, а не неподписанного marker. `target.realpath/dev/ino` проверяется до и после этого barrier и при каждом reopen.

## Consequences

Положительно: один mapping и одна target identity, старые receipts не replay, частичный batch остаётся изолированным. Цена: лишние fsync и ручное reconcile; даже sealed synthetic batch не активирует gateway, индекс или карту. Local filesystem и отсутствие других writers — предпосылки, не доказательства production freeze. Если barrier невозможно безопасно выполнить, item остаётся held и experiment не достигает seal.

## Confirmation

`integrations/hermes-health/experiments/recognized-restore-lab/test_restore_lab.py`: `test_intent_before_first_save`, `test_attempting_present_requires_reconcile_barrier`, `test_attempting_absent_is_held`, `test_source_target_alias_and_collision_refused`, `test_seal_requires_full_readback`, `test_concurrent_claim_one_owner`. `integrations/hermes-health/experiments/recognized-restore-lab/integration_actual.py`: installed pinned CLI создаёт новый unverified operation с exact bytes/source на новом inode; old receipt/export неизменны. Эти имена — план тестов, пока не выполненные результаты.
