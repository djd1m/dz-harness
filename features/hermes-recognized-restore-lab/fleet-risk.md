# Step 9 Reference — risk-based testing

2026-11-10. Статус: **PENDING — матрица до завершения реализации**. Роль risk
выполняется независимым reviewer; это не запуск внешнего AQE fleet. Прочитаны
`01_requirements.md`, `03_adr/001-bind-one-intent-to-one-target.md`,
`03.5_ideation_report.md`, `04_domain_model.md`, `05_architecture.md` и
`06_implementation_plan.md`. ADR имеет статус Proposed для synthetic lab.
Незавершённый runtime, tests и actual integration не проверялись; PASS/GO
реализации, production restore и power-loss гарантия здесь не заявляются.

## Оракулы и обязательные свидетельства

Для каждой строки ниже нужен воспроизводимый тест с точкой вмешательства,
реальным результатом команды, состоянием файлов после вмешательства и после
явного reopen. Считать фактические вызовы core `save` и ID по устойчивому
свидетельству, а не только по финальному числу operations: повторный save на
том же ID тоже нарушение. Для multi-item batch проверять, что после первой
ошибки следующий item не запускался. Отдельно фиксировать durable state и
выведенный результат: невозможность записать held означает unknown, даже если
на диске сохранился старый valid envelope.

`SIGKILL` проверяет смерть процесса и восстановление после неё, но не моделирует
ошибку `fsync` и не удаляет page cache. Отдельные тесты должны возвращать ошибку
из каждого существенного syscall/barrier, включая случай видимых новых bytes
при неподтверждённой durability. Для каждого семейства нужны независимые
наблюдения отсутствия повторного save, нового ID, receipt/index/activation,
изменения старого export и ложного sealed. Отсутствие runtime/image — failure,
а не skipped success.

## Матрица риска

| ID / приоритет / контракт | Вмешательство и варианты | Требуемый исход / доказательство | Проверка |
| --- | --- | --- | --- |
| R01 / P0 / FR-4–6, W1 | Ошибка write/fsync(temp), initial `RENAME_NOREPLACE`, update rename, fsync(control); отдельно SIGKILL до/после каждого барьера claim, initial intent, attempting, observed, seal. | Save возможен только после успешного file+directory fsync attempting; неопределённость прекращает batch. Visible valid JSON/generation не доказательство commit. После unknown запрещено продолжение по in-memory state; при неизвестном held report unknown. Только explicit reconcile принимает единственную версию через новый barrier и повторное чтение. | PENDING |
| R02 / P0 / FR-3–4, W1 | Claim существует, intent отсутствует/обрезан; intent без claim; left-over temp; исчезновение имени после unknown; новый batch ID или повторный apply. | Ни нового intent, ни reseed, ни save/cleanup. Claim/intent ambiguity остаётся refusal/held. Initial creation не заменяет существующий intent. Проверить старые bytes и namespace. | PENDING |
| R03 / P0 / FR-3, W3 | Два реальных процесса одного target; остановки после mkdir, target fsync, создания lock, lock fsync, flock и claim. Первый погибает; второй получает готовый либо промежуточный namespace. | Один stable lock inode и единственный target-anchored namespace. Незавершённый root отказывается, конкурент его не достраивает/не удаляет. Под lock повторяются source/identity checks. Не более одного save для item; иной batch не выигрывает после claim. | PENDING |
| R04 / P0 / FR-3,6, W3 | Target raw/manifest изменён после plan, перед claim, между проверкой и save, перед/во время/после barrier; неполная copy, лишний объект, неверные mode/owner/nlink. | До save — отказ; при уже начатом save — fail-stop/held, без observed/seal. Exact bytes и весь closed namespace проверяются повторно. Source file/dirs/target parent fsync предшествуют intent; unsigned marker ничего не разрешает. | PENDING |
| R05 / P0 / FR-3, I2 | Same source/target inode, symlink ancestor/root/file, hardlink raw/control, overlapping roots, descriptor/key/export внутри target, изменённые realpath/dev/ino; alias к target. | Отказ до save и до недопустимых target writes; fd/no-follow проверки и identity до/после barrier. Bind-mount/same-UID hostile сценарии не выдаются за доказанные, если недоступны модели. | PENDING |
| R06 / P0 / FR-5–6, W2 | Core timeout, exception, malformed/truncated/oversized result; SIGKILL до save, в staging, после rename до parent fsync. Проверить attempting+absent/staging/corrupt/exact present. | Никогда blind retry. Absent/staging/corrupt — held. Exact present допускает observed только отдельным reconcile с readback, полным новым barrier core files/dirs/parents и source, затем повторной exact проверкой. Reconcile не вызывает save. | PENDING |
| R07 / P0 / FR-6–7, I4–5 | Ошибка fsync каждого artifact/metadata/operation/ancestor/source объекта при readback или final seal; изменение bytes между readback и barrier; status present при неверном request fingerprint. | Ни observed, ни sealed без всех успешных барьеров и exact нового tuple/files. Present/hash текста недостаточно. Ошибка после durable observed, но до seal, не считается готовым batch. | PENDING |
| R08 / P0 / FR-7, W4–5 | Seal/envelope скопирован на новый target; stale mapping/runtime/inventory; tamper observation/digest; drift после sealed. | Независимо восстановленная immutable projection и target identity отвергают copy/stale. Sealed drift даёт refusal без перезаписи прежнего seal. Exact sealed повторно проверяется, без save. | PENDING |
| R09 / P0 / FR-4, W5 | ID collision со старым ID, другим new ID, existing operation; неверный length prefix/order/Unicode; иной batch/runtime/source identity; неизвестные/duplicate keys, bool вместо integer, noncanonical bytes и превышение лимитов. | Закрытая схема и независимый mapping совпадают целиком; collision — отказ без reseed. Один atomic envelope сохраняет mapping и допустимые item/batch combinations; generation не представляется защитой от rollback. | PENDING |
| R10 / P0 / FR-1,5, NFR-2 | Changed export/descriptor/key; forged prior verifier report; state не saved_unverified либо artifact_observed=false; CLI файл совпал, но Node/package/capabilities изменены. | Каждая команда заново проверяет trust inputs и полную runtime closure; prior report не write authority. Refusal до save. Actual installed CLI, а не stub, создаёт exact source/text на новом ID/inode. | PENDING |
| R11 / P1 / FR-2,8 | Ошибки чтения/JSON/path/subprocess, malicious stderr/stdout, секретные canary в source/key/owner/absolute paths; неверный/укороченный confirm digest. | stdout и stderr ограничены и sanitized на всех ветках; canary/key/MAC/text/path/owner отсутствуют, traceback и raw subprocess output не выходят наружу. Только full matching digest разрешает apply/reconcile. Fault seams недоступны в CLI. | PENDING |
| R12 / P0 / AC-1–3, I1,I6 | Успех и любой отказ multi-item batch; reopen; repeated apply/reconcile; pinned offline actual integration. | Старые export/artifacts/receipts byte-identical, новые operations unverified; нет receipt replay/index/activation/сети. Тест должен явно проверять каждый эффект. Нет successful skip при отсутствии установленного pinned runtime. | PENDING |

## Полнота состояний и пределы итогового решения

Обязательна вся таблица ADR: planned+absent допускает будущий explicit apply;
planned+present/staging/corrupt блокирует его; attempting+present требует нового
reconcile barrier; attempting+absent/staging/corrupt становится held;
observed+exact только повторно проверяется; observed+mismatch становится held;
held не выходит автоматически; sealed+exact не save; sealed+drift не
перезаписывается. Проверить atomic переход первого item вместе с batch state,
mixed multi-item cases и прекращение обработки при первой ошибке.

После сигнала ведущего о завершённой реализации эта роль сопоставит конкретные
тесты, code paths и actual proof с R01–R12, запишет команды/результаты и gaps.
До этого каждая строка — требование к evidence, не утверждение о покрытии.
Непроверенный P0 остаётся приёмочным пробелом; mock-only core не закрывает AC-3.
Даже успешная matrix ограничена cooperating offline processes/local FS и не
доказывает physical power-loss durability, historical operator authority,
production writer freeze или DRP.
