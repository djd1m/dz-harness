# Hermes medical: read-only аудит recognized и third-brain

Дата: 2026-11-09. Проверены исходники в `/home/dz-user/dz-harness-health-core` и публичной проекции `/home/dz-user/dz-harness-health-plugin`. Прочитаны core `AGENTS.md` и `.claude/rules/cross-runtime-concurrency.md`. Единственная запись аудитора — этот отчёт. Код, commits, backlog, worktrees, базы, Docker, `/srv`, `/root`, `auth.json` не изменялись и не использовались. Patient workspaces не открывались. Тесты не запускались: ниже перечислены существующие проверки, а не результаты их выполнения.

## Главный вывод

В исследованных исходниках health-advisor нет обнаруженного API/CLI `recognized`, который сохраняет произвольный НЕПРОВЕРЕННЫЙ распознанный текст по source `entry_id` и выдаёт подтверждение повторного чтения. Есть проверяемая привязка первоисточника и отдельный CLI `third-brain ingest` для уже существующего файла. Эти две возможности нельзя выдавать за готовый контракт сохранения OCR. HTTP-сервис за пределами этих checkout данным аудитом не исследован; отсутствие найденного endpoint здесь не доказывает его отсутствие в deployment.

`third-brain` уже поддерживает dry-run, изолированный brain, проверку anchors, детерминированные chunks, дедупликацию точного текста и громкие отказы. Однако подтверждение записи основано на CLI counters, а не на повторном чтении всех ожидаемых записей и сравнении их digest. Нет транзакции recognized+index, удаления/replacement старой версии или rollback конкретной операции.

## Исходники и существующие контракты

В последующих путях `HA` означает `core/packages/@dzhechkov/health-advisor`, `PUB` — `plugin/packages/health-advisor` (абсолютные корни указаны выше).

| Поверхность | Контракт и источник |
|---|---|
| Source identity | `HA/lib/source-anchor.js`, `HA/lib/source-anchor-store.js`: anchor несёт identity и digest, не содержание OCR. `stampFromManifest({workspace, entryId})` ищет строку `sources/manifest.json`; `resolveAnchor(anchor,{workspace,caseDir})` проверяет привязку case/workspace, metadata, containment raw-zone, существование regular file, байты и SHA-256. `verified:true` означает целостность первоисточника, не достоверность распознавания. |
| Layout | `HA/lib/workspace-layout.js:27`: `sources`, `research`, `analysis`, `doctors`; manifest/raw/log и отдельный `.health-brain`. Машинного recognized layout/store здесь нет. |
| CLI | `HA/bin/health-advisor.js:522`, `HA/skills/third-brain/engine/cli.js`: `ingest <doc.md> --case <slug> --kind <kind> --date <YYYY-MM-DD> [--anchor <entry_id>]… [--workspace <dir>] [--dry-run] [--json]`; также `search` и `backlinks`. Это локальный CLI/JS API, не HTTP. |
| План | `HA/skills/third-brain/engine/plan.js`: UTF-8 текст, нормализация CRLF/CR в LF, детерминированный chunk budget 1200 символов; `doc_id = sha256(doc_sha256 + NUL + workspace-relative doc_path).slice(0,16)`. `doc_sha256` считается по исходным байтам. |
| Header | Там же: `ha-doc-1 doc_id=… case=… kind=… date=… chunk=n/m doc_sha256=… doc_path=… anchors=…`. Нет поля verification_status/OCR engine/revision/source text hash. Anchorless документы допустимы, sentinel `anchors=-`. |
| Пакет записи | `HA/skills/third-brain/engine/write.js`: record `pattern = header + body`, domain `health-research`, type `lesson-learned`, reward `0.8`; настоящее kind живёт в header. Дополнительные произвольные metadata не имеют гарантированного прохода через importer. |
| Привязка | `write.js:175`: все anchors stamp+resolve до записи; ошибка одного отвергает ingest. Это связь документа с источником, но не storage-key, не уникальность recognized revision и не доказательство правильности OCR. |
| Исполнение | `write.js:518`: Python `base/skills/base/goap-research-ed25519/scripts/learning_bridge.py ingest-documents --payload … --project … --json`. Payload внутри workspace `.health-brain/.ingest-tmp`, mode 0600, удаляется в finally; workspace lock охватывает bridge. |
| Изоляция | Bridge `:1146`: distinctness на realpath, self-ignore brain, canary маршрутизации, счётчики до/после. Запись через `dz teach --from-json … --project <workspace>/.health-brain --no-mirror`. Обход lesson-format gate намеренный: документ может содержать identifiers; защита здесь — сегрегация store. |
| Dry-run | `write.js:444`: построение плана/проверка anchors; нет spawn, payload, LOG. Не доказывает доступность или успешную запись downstream brain. |
| Результат | `write.js:624`: `ok,mode,doc_id,doc_sha256,doc_path,case,kind,date,chunks,hard,passage_lengths,anchors,written,skipped,brain,before,after`. Отказ именованный; timeout прямо означает неизвестно, успели ли записи попасть. |
| Поиск | `engine/search.js:153`: `dz recall <query> --domain health-research --limit N --project <workspace>/.health-brain --json`; lexical passages с полным body, потом фильтр header. Нет фильтра verified/unverified. |
| Backlinks | `search.js:194`: exhaustive `recall --all --json --include-domain health-research`, doc_id, distinct chunk numbers/missing, variants, union anchors; каждый anchor вновь проверяется. Это проверка coverage/provenance, не сравнение body всех chunks с ожидаемым plan. |

## Что именно доказывает текущая идемпотентность

`core/packages/@dzhechkov/harness-cli/src/cli.ts:4574–4667` импортирует records по одному; дедупликация для legacy records — точный `pattern` (с header), существующие records не перезаписываются. Следовательно:

- Те же bytes/path/metadata/anchor order → те же patterns → повтор обычно `written:0`, `skipped:m`.
- Изменённый текст или путь → новый doc_id, старые записи остаются.
- Изменённые kind/date/anchors → другой pattern даже при прежнем doc_id; могут сосуществовать варианты. `backlinks` явно учитывает это.
- Это не идемпотентность по source entry_id или request id и не единственная активная версия источника.
- Комментарий и тест `third-brain-idempotent-dedup.test.js` прямо говорят, что reconciliation старых records отложен.

## Существенные ограничения receipt, audit и rollback

1. Bridge `learning_bridge.py:1219–1258` парсит строки `Imported …` и `Skipped …`, затем сравнивает общий count delta только при `written > 0`. В нём нет проверки `written + skipped == len(payload)` и нет readback всех конкретных patterns. `Skipped` у importer объединяет duplicates и invalid entries. Сгенерированный план обычно валиден, но такой receipt не является общим доказательством сохранения точного OCR-текста.
2. Importer делает `await recordPattern` в цикле. Ошибка/timeout после части цикла допускает частичную запись. `write_unverified` не означает rollback или «ничего не изменено».
3. `appendLog` в `write.js:145–160` ловит ошибки и возвращает false; основной ingest не превращает отсутствие log в отказ. Поэтому обещание «каждая попытка гарантированно журналируется» сильнее реализации при ошибке файловой системы.
4. `backlinks` проверяет номера chunks совокупно по doc_id, а не отдельно по каждой metadata-версии; coverage не доказывает целостность каждой версии.
5. `chunk()` сохраняет lead/sep для математически точной сборки планом, но в pattern уходит только passage.text. Нельзя обещать byte-exact восстановление исходного файла из одного brain без сохранённого исходника/разделителей.
6. Budget: `limits.js` — outer 120000 ms; Python — два `_brain_count(...45s)` и teach 30s плюс canary/local gates. Комментарий «30+45=75 <120» пропускает второй count. В худшем случае бюджет не имеет заявленного запаса; timeout остаётся возможным unknown outcome. Нужна отдельная проверка реальной общей суммы, не доверие комментарию.
7. `--no-mirror` выключает автоматическую vector mirror запись: текущий ingest не даёт контракта «семантический индекс готов». Отдельные vector операции требуют собственного контроля и доказательства.
8. Нет third-brain delete/unindex/reconcile/rollback CLI. Лог не хранит точный список новых record IDs и before-images, необходимых для безопасной компенсации конкретной операции.

## Что требуется для заявленного recognized flow (требования, не разработанный API)

- Отдельный контракт сохранения по `(workspace/case, source entry_id, recognition revision)` с обязательным status `unverified`/«НЕПРОВЕРЕНО». Нельзя переносить `verified:true` anchor на достоверность OCR.
- При записи проверить существующий source anchor и expected source hash; не принимать произвольный destination path от клиента. Версионировать schema и точные UTF-8 bytes/text SHA-256; хранить provenance OCR, время и исходную привязку отдельно от модели/анализа.
- Сохранение должно быть самостоятельной операцией: `saved` после atomic commit + повторного чтения/digest; `indexed` — отдельное состояние и явная операция. Ошибка индекса не отменяет молча сохранённый текст.
- На повторный запрос с тем же operation/idempotency key и hash возвращать прежний receipt; другое содержимое с тем же ключом — конфликт. Защита от параллельных writer через lock/CAS revision.
- Dry-run/plan индексирования должен фиксировать source entry_id, revision, content hash, будущие record IDs и chunk hashes. Apply проверяет, что утверждённая revision не изменилась.
- Receipt индекса: проверить readback полного ожидаемого набора records и hash bodies; сохранить operation_id, created/skipped IDs, previous active revision, journal status. При timeout иметь `unknown/reconciliation_required`, а не success или автоматический retry без reconciliation.
- Поиск должен сохранять и показывать статус НЕПРОВЕРЕНО в каждом passage; предусмотреть фильтр/политику доступа к unverified и запрет молчаливого превращения в clinical fact.
- Rollback/unindex должен затрагивать только records данной operation/revision, не shared/dedup records другой операции; при обновлении переключать active revision и явно supersede старую. Отдельно определить, сохраняется ли immutable recognized artifact после unindex (рекомендуемый контракт: да).

## Существующие тесты, пригодные для будущей проверки

Все пути ниже — `HA/test/`; существование и содержание отдельных тестов проверены чтением, green-статус не заявляется.

- Source integrity: `anchor-resolver-never-writes.test.js`, `anchor-resolver-refuses-cross-case.test.js`, `anchor-write-refuses-conflict-and-missing-row.test.js`, `anchor-carries-no-content.test.js`.
- План/identity: `third-brain-chunking-is-lossless-and-deterministic.test.js`, `third-brain-doc-id-identity.test.js`, `third-brain-header-contract.test.js`, `third-brain-header-chunk-numbering.test.js`.
- Persistence/dedup: `third-brain-write-verified-or-refused.test.js`, `third-brain-idempotent-dedup.test.js`, `third-brain-ingest-serialized-and-log-honest.test.js`, `third-brain-log-contract.test.js`.
- Safety/bounds: `third-brain-anchor-fail-closed.test.js`, `third-brain-payload-containment.test.js`, `third-brain-ingest-refuses-shared-brain-target.test.js`, `third-brain-no-mirror-pinned.test.js`, `third-brain-timeout-budget-coherent.test.js`.
- Readback: `third-brain-backlinks-completeness.test.js`, `third-brain-backlinks-resolver-refusal-named.test.js`, `third-brain-search-scoped-to-health-brain.test.js`, `third-brain-live-cycle.test.js`.
- `third-brain-idempotent-dedup.test.js` использует `requireLiveTools(t)` и может skip без runtime; наличие файла не является выполненной интеграционной проверкой.

Не найдены отдельные тесты recognized-save/readback, unverified-status propagation, request-id/CAS, source-entry revision conflict, crash между save/index, atomic replace, rollback конкретного ingest и reconciliation unknown outcome. Нужны синтетические fixtures без patient data; runtime-проверки в этой ночной read-only задаче не производились.

## Parity core/public и воспроизведение аудита

Побайтовым сравнением `Path.read_bytes()` проверены: `skills/third-brain/engine/{cli,plan,write,search}.js`, `base/skills/base/goap-research-ed25519/scripts/learning_bridge.py`, `lib/source-anchor-store.js`, `lib/source-anchor.js` — соответствующие core/public файлы одинаковы. Это не утверждение полного parity пакетов.

`bin/health-advisor.js` различается: core знает `--expect-manifest-sha256` и `--capabilities`, public — нет (diff двух файлов). Это относится к соседнему intake контракту; third-brain engine в сравнённой области одинаков.

Поиск: `rg -n 'recognized|entry_id'` в health-advisor lib/third-brain/test, список source paths через `rg --files`, затем чтение конкретных JS/Python исходников; дополнительный filename search с `--hidden`, исключая `.git`/`node_modules`. HTTP recognized handler среди просмотренных source paths не найден. Поиск не включал игнорируемые файлы через `--no-ignore` и не выходил в deployment; поэтому это честная граница вывода.

Backlog не заведён: пользовательская read-only инструкция запрещает репозиторные записи и имеет приоритет над общей AGENTS.md рекомендацией. Независимый review другим семейством/моделью предстоит отдельно; этот документ — исходный аудит, не signoff.
