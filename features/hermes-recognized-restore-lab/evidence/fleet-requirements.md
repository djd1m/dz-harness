# Step 9 Fleet L — независимая requirements/traceability проверка

Дата подготовки: 2026-11-10. Роль: requirements validation. Область: только синтетический offline restore lab.

**Вердикт: PENDING / NOT TESTED.** Это матрица обязательных проверок будущего final fleet, а не QE реализации. Runtime сейчас изменяется; код и тесты не анализировались и не запускались. Ни один PASS, coverage или full-pipeline GO этим документом не утверждается. После сообщения ведущего о settled-коде потребуется привязать каждую строку к конкретному assertion и фактическому результату на установленной ревизии. До этого наличие имени теста в плане не является покрытием.

## Основание

Прочитаны `01_requirements.md`, `03_adr/001-bind-one-intent-to-one-target.md`, `03.5_ideation_report.md`, `04_domain_model.md`, `05_architecture.md`, `06_implementation_plan.md` текущей feature. Нормативные уточнения ADR и W1–W5 включены ниже отдельно, чтобы укрупнённый FR не скрывал пропущенный acceptance assertion. A1–A6 в требованиях используются как ссылки, но в прочитанных документах не имеют самостоятельных определений; матрица опирается на сформулированные FR/NFR/AC и не выдумывает содержание A1–A6.

## Матрица FR/NFR → обязательная проверка

У всех строк статус **PENDING / NOT TESTED**. Колонка «доказательство» задаёт требуемые наблюдения, а не сообщает полученный результат.

| ID | Требования | Обязательная проверка и критерий | Требуемое доказательство |
| --- | --- | --- | --- |
| RV-01 | FR-1 | Каждый plan/apply/reconcile независимо повторяет проверку export, внешнего descriptor и отдельного key. После успешного plan изменить каждый вход по очереди: последующая команда отказывает. Подмена готовым verifier report не даёт write authority. | Отдельные assertions по трём командам, ноль save и запрещённых target writes при invalid input. |
| RV-02 | FR-1, AC-1 | Принимается только saved_unverified + artifact_observed=true; иной state, ambiguity, несколько source workspace identities отказывают весь batch, включая случай invalid item после valid item. | Negative matrix и счётчик save=0 для всего batch. |
| RV-03 | FR-2 | plan выдаёт bounded summary и стабильный digest независимой immutable projection. apply и reconcile без полного digest, с неверным digest, с прежним digest после изменения входов отказывают. | Assert отказа и отсутствия save/несанкционированного transition; independent digest oracle. |
| RV-04 | FR-2, FR-8 | Успешные и ошибочные stdout/stderr не содержат text, owner, absolute paths, key/MAC; fixed codes/counts/digests/states ограничены по объёму. Operator action означает только локальное действие. | Canary-проверки утечек во всех ветках, включая subprocess failure/timeout; проверка документации. |
| RV-05 | FR-3, NFR-1 | Новый target имеет иной realpath/dev/ino identity, не вложен и не alias export/descriptor/key/source. Все ancestors/root, ownership/mode/nlink/no-follow проверены; source manifest/raw byte-identical. | Negative matrix symlink/hardlink/overlap/modes/foreign object/source mutation; identity до и после barrier. |
| RV-06 | FR-3 | До первого apply target строго source-only: нет recognized, receipts, index, core lock namespace, .restore-lab. plan не создаёт control root. Source file/dir/target parent durability завершается до claim/intent/save. | Снимок namespace до/после plan; ordered syscall/event trace; fault на каждом source barrier даёт save=0. |
| RV-07 | FR-3, AC-2 | Только target-anchored .restore-lab; произвольный control path недоступен. Два реальных процесса на паузах mkdir/control fsync, lock creation/flock и claim не получают двух владельцев. Inode lock стабилен, lock удерживается весь apply/reconcile. | Process-based race tests, счётчик core saves/новых IDs, отсутствие cleanup чужого namespace. |
| RV-08 | FR-3, FR-4; W1 | Immutable exclusive claim durable до exclusive initial intent. Claim без intent, intent без claim, corrupt claim, другой batch и leftover temp блокируют восстановление/новый batch. Нет auto-repair. | Crash/fault до/после claim/intent; побайтовая сохранность обнаруженных файлов и save=0 при reopen. |
| RV-09 | FR-4 | Независимо воспроизвести ID derivation: domain prefix, 4-byte unsigned big-endian UTF-8 length, точный порядок семи полей. Все IDs rc-<32 lowercase hex>, deterministic bijection, не равны старым. Collision/существующий ID отказывают без reseed. | Независимый golden vector и collision injection; полный mapping durable до первого save. |
| RV-10 | FR-4, FR-7; W5 | Закрытые схемы envelope/claim/mapping/items/actions/seal; exact canonical UTF-8 JSON + LF. Reject duplicate/unknown keys, bool вместо int, NaN, control/NUL/surrogate, noncanonical decimal/digest/JSON, нарушение лимитов и combinations. | Boundary matrix: 64 KiB, 1–32 items, ≤64 actions, ≤4096 UTF-8 bytes path, числовой безопасный диапазон; валидные границы отдельно от overflow. |
| RV-11 | FR-2, FR-4; W5 | Immutable projection ровно из десяти полей строится заново из независимых входов; mutable state не подменяет mapping/target/runtime/source. source digest исключает разрешённые control/scaffold, но namespace scan продолжает отказывать на extras. | Tamper каждого immutable поля; успешный reopen после легального scaffold; отказ на extra object. |
| RV-12 | FR-5, NFR-2 | Только установленный pinned Node core CLI. Проверяются Node binary, package JS/JSON/native closure и capabilities, а не один CLI hash. Каждый mismatch и недоступный read/CLI/runtime отказывают до save. | Изолированные tamper fixtures по компонентам closure, actual installed path/identity в bounded evidence. |
| RV-13 | FR-5 | Durable whole-envelope planned→attempting и batch→applying происходят до каждого save; generation растёт ровно на один за transition, предыдущие actions append-only. Ошибка atomic transition исключает save/следующий item. | Ordered trace; crash/fsync/rename fault на каждой границе; чтение версии на диске, без доверия in-memory state. |
| RV-14 | FR-5, AC-1 | Core получает исходный strict UTF-8 text, exact entry/hash/bytes/engine и новый ID. Проверяются independently reconstructed 14-field request tuple, request_sha256, canonical metadata, artifact и core status/read. | Exact-byte/source assertions, adversarial wrong tuple с тем же text hash; old metadata/artifacts/receipts/export неизменны. |
| RV-15 | FR-6 | observed разрешён только после exact readback, полного file/operation/parent/source barrier и повторной exact проверки. Failed/unknown fsync не становится observed только из-за наличия bytes. | Fault каждого barrier и tamper между readback/barrier; batch останавливается после первого error. |
| RV-16 | FR-6; W1 | После неизвестного fsync повторный apply не принимает найденную версию как committed. Только explicit reconcile с digest: fsync intent/control, reread envelope/claim, затем items. | Crash после rename до parent fsync, попытка apply и отдельный reconcile; отказ на ambiguity/leftover temp. |
| RV-17 | FR-6; W4 | Каждая строка state matrix ниже проверена отдельным assertion; reconcile никогда не save, apply запускает только planned после допустимого reopen. | Save spy/process log по каждой строке и повторному запуску; неизменный mapping/ID. |
| RV-18 | FR-7 | Seal в том же atomic envelope только после всех observed, повторного exact readback и barrier всех items. Проверены plan/inventory/target/observations digest и mapping binding через plan. Partial/unknown/unsealed не готов. | Independent seal oracle, tamper каждой binding, crash seal transition, отсутствие standalone seal/mapping authority. |
| RV-19 | FR-7; W4 | Sealed exact batch проверяется идемпотентно без save; sealed drift отказывает без переписывания прежнего seal. | Сравнение envelope/seal bytes и save count до/после повторных apply/reconcile и tamper. |
| RV-20 | FR-8 | Подпроцесс bounded по stdin/stdout/stderr/timeout, process group прекращён при timeout/overflow. Нет shell, наследования secret env, network, gateway/index/search/activation и автоматического удаления rollback. | Timeout/output-limit fixtures; child liveness и отсутствие второго save; offline integration и проверки namespace/calls. |
| RV-21 | NFR-1 | При недоступном file fsync/directory fsync/atomic rename/RENAME_NOREPLACE/local same-filesystem предположении нет обхода и core save. Initial intent никогда не replaces existing intent; update только под lock. | Capability/fault negatives и сохранность заранее существующего intent. |

## Полная матрица состояний для RV-17

| До команды / наблюдение | Обязательное ожидаемое поведение |
| --- | --- |
| planned + absent без staging | reconcile оставляет planned и не save; отдельный apply может начать durable attempting→save. |
| planned + present/staging/corrupt | held/refusal; batch stop, save=0. |
| attempting + exact present | apply не save; отдельный reconcile делает полный новый barrier и только затем observed. |
| attempting + absent/staging/drift/corrupt/unknown | held/refusal; ни retry, ни нового ID, ни следующего item. |
| observed + exact present | reread/barrier; save=0. |
| observed + mismatch | held; следующий item не запускается. |
| held + любой факт | refusal/наблюдение, без automatic transition или save. |
| sealed + exact seal/items | идемпотентная проверка; save=0. |
| sealed + mismatch | refusal, прежний seal не переписан. |
| Невозможно durable записать held | report unknown; на диске может остаться прежнее состояние, но продолжение batch запрещено. |

Отдельно обязательны forbidden combinations item/batch/seal, leftover .staging и store.lock, unknown generation и чужие operations. Проверка «exception raised» недостаточна без проверок количества save, состояния следующего item и сохранности mapping.

## Матрица acceptance criteria

| Критерий | Минимальный фактический acceptance evidence | Связь |
| --- | --- | --- |
| AC-1 | Реальная synthetic adapter→installed core→export→restore→new core status/read цепочка на новом inode, 1–2 items; exact text/source/tuple, новые IDs, old export/receipt byte-identical. Отдельные trust/identity negatives до save. | RV-01–06, RV-09, RV-12–14 |
| AC-2 | Fault matrix initial claim/intent, attempting transition, core staging/rename/parent fsync, readback/observed/seal; реальные два процесса, tamper; для каждого исхода measured saves/IDs, held/unknown, отсутствие blind retry. Happy path не заменяет эту матрицу. | RV-07–11, RV-13, RV-15–19, RV-21 |
| AC-3 | Запуск integration_actual.py только в pinned offline image с recorded image/runtime identity и exact командами. Missing image/runtime приводит к nonzero explicit failure, а не skip/PASS. Проверки no receipt replay/index/activation относятся и к target, и к сохранности исходного evidence. | RV-12, RV-14, RV-20 |

## Acceptance assertions, которые легко потерять

1. Не только успешный reconcile attempting+present, но отказ повторного apply до reconcile после неизвестной durability. Валидный JSON/generation/present bytes не являются commit evidence.
2. Claim без intent после crash запрещает новый batch; создание другого batch/control namespace не является восстановлением.
3. У source barrier есть target parent; у operation barrier — все parents и target sources; exact bytes проверяются повторно после barrier.
4. Изменение второго item останавливает весь batch; durable ошибка held не разрешает третий save. Для этого нужен multi-item fixture.
5. Core status present и text hash недостаточны: неверный request tuple/source/engine при том же тексте обязан отказать.
6. Boundary/canonical schema negatives должны покрывать nested fields, duplicate keys и bool-as-int, а не только лишнее top-level поле.
7. Разрешённый scaffold не меняет source projection, но не расширяет allowlist до произвольных .recognized-write/recognized объектов.
8. Sealed drift сохраняет старый seal; error-handler не переписывает sealed batch в held.
9. Runtime closure tamper в не-CLI файле и отсутствие actual read должны проверяться отдельно от общего runtime mismatch.
10. Actual image отсутствует: explicit failure; mock/unit PASS не подменяет AC-3. No network должно следовать из фактического execution environment, а не имени «offline».
11. Plan должен быть read-only и redacted; negative subprocess stderr тоже redacted. Stable lock inode не заменяется при retry/reopen.
12. Reconcile save=0 проверяется во всех состояниях, а не только happy path; остановка process group проверяет оставшихся дочерних процессов после timeout.

## Завершение final fleet

После settled-кода для каждой RV/AC строки добавить точные test/assertion locations, команду, exit status и evidence artifact. Отсутствующий assertion обозначить GAP; непрогнанный — NOT TESTED; ограниченную модель fsync/process-crash описать явно. Не считать Python K1/native discrimination автоматически установленными, не объявлять внешний AQE fleet, production DRP, historical approval, production writer freeze или физическую power-loss устойчивость. Текущая работа — только подготовка независимой requirements роли; финальный verdict остаётся PENDING.
