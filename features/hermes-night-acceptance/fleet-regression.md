# Fleet: анализ регрессий ночного кандидата

**Итог роли после tests-only remediation: regression suite и измеренные coverage gates PASS для synthetic adapter.** Native discrimination machine gate **NOT ESTABLISHED**; общий feature pipeline/fleet этим результатом не закрыт. Первое измерение выявило coverage GAP; история и точная перепроверка сохранены ниже. Это отдельный Regression Impact Analyzer, plain Codex по выбору владельца, не итог всех четырёх ролей fleet.

## Метод и граница

CLAIMED (methodology): Прочитаны `modules/09-fleet-qe.md`, pinned `qe-ref-regression-testing/REFERENCE.md` и `qe-ref-qe-coverage-analysis/REFERENCE.md` (upstream 0a6de058). Применён reference protocol; aqe runtime, schema validator, memory services не заявляются. История coverage в vendored reference отсутствует по контракту; не создана фиктивная история.

Diff: baseline `5141b6b` → settled adapter bytes из `hermes-recognized-confirm/08_qe_report.md`. Все 11 SHA-256 файлов этого отчёта независимо пересчитаны и совпали. Core overlay HEAD `1dbdcaed063540bafa629d5da9622b4f09728127`; runtime image `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`. Изменения документации других агентов не меняют эту byte identity.

## Change-based selection

| Класс | Изменение / зависимость | Обязательная проверка и evidence |
| --- | --- | --- |
| mustRun | Новый `recognized_confirm.py`: state machine, stdin runner, binding, lock, HMAC, reconciliation | `test_recognized_confirm.py` и actual `integration_recognized_confirm.py`; новые unit cases не заменяют реальный installed core |
| mustRun | `pdf_draft.py`: provenance sidecar, дополнительные fsync, cleanup; меняется общий producer черновиков | `test_pdf_draft.py`: completion, collision, partial write, directory/file fsync, socket framing, source drift |
| mustRun | `__init__.py`, `health_plugin.py`, `plugin.yaml`: новая регистрация и публичный model prepare | `test_health_plugin.py`, plugin doctor/audit и fresh-home install: schema/registrations, read-only/hidden artifact denial, bounded subprocess |
| mustRun | Неизменённый `intake_confirm.py` теперь экспортирует identity/private-directory helpers новому adapter | `test_intake_confirm.py`: gateway ContextVars, cron/user/profile denial, durable state; это транзитивная зависимость, поэтому исключение по одному diff было бы ошибкой |
| shouldRun | `intake_preview.py`, общие manifest/source validation, zip/inbox contracts | `test_intake_preview.py`: технические источники, manifest/input drift, freeze; включён в 95-test sweep |
| shouldRun | Core `recognized-store.js`, `recognized-cli.js`, existing core contracts | Изолированный core QE 35 PASS принят как внешний evidence; actual CLI overlay дополнительно вызывается integration. Core JS coverage этим Python tracer не измеряется |
| shouldRun | Runtime discovery и read/search integrity после регистрации нового tool | `/tmp/hermes-night-candidate-clean.log`: 7 tools, doctor/audit, actual CLI integration_check PASS; обнаружено предупреждение private `gateway.session_context` API |
| mustRun отдельно для parent | OAuth experiment, managed index lab; оба находятся в parent scope | `experiments/tests/test_night_oauth_lab.py` не попадает в discovery `/plugin/tests`; index acceptance также отдельный executable. Их отдельные QE evidence нужны родительскому fleet; 95 PASS не включают эти suite |
| canSkip для adapter | Несвязанные UI, site/docs build, другие plugin packages | Нет runtime/import зависимости в рассмотренном diff; это scope exclusion, не утверждение об их исправности |
| canSkip в этой лаборатории | Production gateway restart, real OAuth refresh, настоящая медицинская карта и внешний transport | Не разрешены этой synthetic приёмкой; реальные deployment/transport guarantees остаются недоказанными |

CLAIMED (methodology): Quick suite состоит из direct changed suites плюс транзитивного intake-confirm. Extended добавляет preview/read integration/fresh install. Выбран весь небольшой plugin Python regression set: экономия 70–90% из примера протокола здесь не измерялась и не заявляется. Нельзя ради этого целевого процента выкинуть shared identity или producer sidecar проверки.

## Неявные зависимости и публичный контракт

1. `recognized_confirm` импортирует `gateway_identity`, `workspace_identity`, `open_private_directory` из intake-confirm, `private_root` из pdf-draft, `Refusal` из health-plugin. Обратного top-level cycle не введено: HealthTools использует lazy import. Private Hermes ContextVars остаются version-sensitive, несмотря на pinned image PASS.
2. Runtime pin включает весь node_modules code tree и Node binary; смена транзитивной зависимости, inode/path workspace или runtime byte требует deliberate rebind/recovery. Restore старого snapshot не покрывает восстановление новых receipts.
3. PDF draft producer теперь пишет третий внутренний файл `provenance.json`, но возвращает только MD/HTML artifacts; sidecar publication/cleanup/fsync влияет и на прежний draft flow.
4. Plugin публично добавляет один model tool и три trusted commands. Confirm не model tool; реальная доставка новых recognized commands Mattermost transport остаётся отдельным acceptance gap.
5. Новый saved artifact hidden и unverified. Read/search wrappers должны продолжать отрицать скрытый путь; indexing не выполняется этим adapter, и его failure не должен повторять save.
6. Store quota способна блокировать status/reconciliation; pin обхода namespace сортирует rglob до file-count cap. Это эксплуатационные ограничения, не покрытые нагрузочным тестом гарантий восстановления.

## Независимая проверка evidence

Прочитаны исходные `/tmp/recognized-adapter-qe-regression.log` (95 PASS, 35.705 s), `/tmp/recognized-adapter-qe-integration.log` (1 PASS, 28.645 s) и fresh-home log. В source integration реально проверяет пять SIGKILL windows через fork/waitpid/signaled assertions; сравнивает actual artifact с draft bytes, запрещает hidden source_get, не создаёт `.health-brain`, проверяет late drift/replay и owner fields. Broker extraction подменён synthetic reply; commands вызываются через handler, поэтому это не real pypdf и не transport dispatch.

Для новых данных, а не повторения PASS, самостоятельно выполнены instrumented candidate 95 tests (PASS, 38.508 s) и baseline 70 tests (PASS, 36.812 s). Контейнеры disposable, network none, uid1000:1001, HOME/TMPDIR в tmpfs; source/core read-only. Никаких production/auth/PHI mounts. Coverage.py 7.6.12 распакован только в `/tmp`, wheel SHA-256 `bda1c5f347550c359f841d6614fb8ca42ae5cb0b74d39f8a1e204815ebe25750`; `COVERAGE_CORE=pytrace`, native wheel extension не используется Python3.14. Метод Python statements/branches; не измеряет Node/subprocess coverage и не гарантирует flush убитых SIGKILL дочерних процессов. Assertion/crash evidence сохраняет отдельную роль.

## Первое измерение до remediation: покрытие и delta

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/integration.txt`): Actual integration под tracer: **1 PASS, 88.559 s**. Source-only метрики ниже исключают tests/experiments; `covered_lines / num_statements` и `covered_branches / num_branches` показаны отдельно. Поле coverage.py `percent_covered` смешивает statements и branches и не используется как line coverage.

| Модуль | Baseline 70 unit: statements | Candidate 95 unit + integration: statements | Candidate branches |
| --- | --- | --- | --- |
| `__init__.py` | 17/19 (89.47%) | 20/22 (90.91%) | 6/6 (100.00%) |
| `health_plugin.py` | 187/231 (80.95%) | 190/234 (81.20%) | 59/82 (71.95%) |
| `intake_confirm.py` | 273/299 (91.30%) | 273/299 (91.30%) | 80/102 (78.43%) |
| `intake_preview.py` | 95/102 (93.14%) | 95/102 (93.14%) | 33/40 (82.50%) |
| `pdf_draft.py` | 194/209 (92.82%) | 203/218 (93.12%) | 73/86 (84.88%) |
| `recognized_confirm.py` | новый | 387/432 (89.58%) | 143/186 (76.88%) |

Порог **80% нового recognized adapter: PASS (89.58% statements)**. Baseline modified modules statement percentages не ухудшены в combined suite; branches также не уменьшились. Для одинакового unit-only сравнения HealthTools временно падает с 80.95% до 80.34%, потому что новый forwarding method вызывается actual integration, а не unit; combined закрывает этот добавленный путь. Это сравнение при одном candidate runtime overlay, не историческая воспроизводимость прежнего runtime. JS core coverage и OAuth/index labs coverage не измерены.

Critical paths определены из FR/challenges, а не по удобно покрытым функциям. Для каждого пути denominator — все исполнимые statements перечисленных функций (включая отрицательные safety guards); общий код может входить в несколько путей. Карта FR ниже — adapter FR из его требований/C1–C7.

| Critical path / требование | Функции | Statements | Missing lines |
| --- | --- | --- | --- |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): Consent, FR2/3 C2 | `prepare command command_handler` | 64/73 (87.67%) | 402, 405, 407, 411, 470, 483, 490, 491, 492 |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): Durable intent/HMAC/recovery, FR4/5 C3/C4 | `private_read RecognizedStore state_store reconcile command` | 141/163 (86.50%) | 171, 174, 247, 252, 257, 259, 289, 291, 295, 298, 312, 323, 333, 337, 449, 458, 459, 470, 483, 490, 491, 492 |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): Exact source/runtime binding, FR4/7 C1/C6 | `strict_json validate_sidecar snapshot runtime_identity prepare verify_core` | 127/148 (85.81%) | 37, 193, 196, 198, 206, 213, 222, 226, 229, 235, 354, 361, 366, 370, 374, 380, 385, 402, 405, 407, 411 |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): Bounded subprocess/privacy, FR4 C5 | `bounded_input_run core_run strict_json` | 96/99 (96.97%) | 37, 46, 124 |

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): До remediation ветви этих же групп: consent 23/30 (76.67%), durability 49/68 (72.06%), binding 56/78 (71.79%), privacy 45/48 (93.75%). Arc принадлежит группе по исходной строке. Pinned Step9 говорит «critical paths 90%», не определяя отдельный branch denominator; здесь для консервативного закрытия gate требуются **оба statements и branches ≥90%** по неизменным FR-группам. Пороги не ослабляются.

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/pre-remediation-coverage.json`): Итого три критических пути ниже 90%; общие 89.58% нового файла не заменяют этот gate. Branch coverage 76.88% нового adapter отдельно показывает оставшиеся альтернативы. Высокое покрытие не доказывает достаточность assertions; mutation/fuzz/exhaustive syscall/power-loss не выполнялись.

## Выявленные remediation gaps (Step 8, исторический список)

- **G-REG-1, consent (high):** `prepare` 402/405/407/411 — mismatched expected hash/entry, core-невалидный generic catalog ID, отсутствующий logical source, non-finite clock. `command` 470/483/490–492 — malformed action/id, non-finite clock, успешный cancel до intent. Проверять отказ без core save и отсутствие новой durable operation; для cancel — replay/status остаётся cancelled и save не вызывается.
- **G-REG-2, durable state (high):** private_read171/174 — неверные mode/link/owner/type/size и read growth; store247/252/257/259 — отсутствующая config, relative isolation root, same-inode alias, state внутри git. load289/291/295/298 — HMAC-valid, но schema/boolean/owner/workspace/runtime/clock invalid; key333/337 — receipt при потерянном key и short key; lock323 unsafe lock; quota312 aggregate bytes. Использовать реальные temp files где возможно, bounded mock только syscall seam. Assert stable Refusal и no core call; существующие receipts не теряются.
- **G-REG-3, recovery (high):** reconcile449 — runtime mismatch при committing/saved;458–459 — failure записать reconciliation result. Проверять отсутствие save retry, сохранение conservative state, последующий status использует тот же opid. Это важнее увеличения coverage happy-path повторениями.
- **G-REG-4, binding (high):** sidecar193/196/198 — bad source fields/logical path/workspace absolute path; snapshot206/213/222/226/229/235 — bad draft ID, permissions, workspace/draft binding, catalog row mismatch, changed source bytes, empty/NUL draft с согласованным sidecar hash. Assert no proposal/core write.
- **G-REG-5, installed runtime (high):** runtime_identity354/361/366/370/374/380/385 — missing/symlink runtime, code symlink, file-count/aggregate-byte cap, missing mandatory module, unsafe Node file, capabilities mismatch. Маленький synthetic installed tree допустим; cap checks через bounded mocked metadata/read seam, не гигабайтные fixtures. Не подменять всю runtime_identity, иначе coverage gap останется.

Повторить instrumented unit + integration после meaningful test additions, пересчитать тот же FR-defined denominator и source/test hashes. Coverage evidence: [coverage.json](fleet-regression-evidence/coverage.json), [reproduce.sh](fleet-regression-evidence/reproduce.sh), [unit log](fleet-regression-evidence/tests.txt), [baseline log](fleet-regression-evidence/baseline-tests.txt), [integration log](fleet-regression-evidence/integration.txt). Baseline reproduces by mounting `git archive 5141b6b integrations/hermes-health` at `/plugin` and using separate `COVERAGE_FILE`; никаких checkout/reset source не выполнялось.

Родительские restore/OAuth/index/production transport требования этот regression report не закрывает. Core 35 PASS — проверенный внешний log, не мой повторный Node run. Суммарный fleet COMPLETE и production readiness не заявлены.

## Повторная независимая проверка после remediation

Coder добавил 14 meaningful tests (AM-8), source не менялся. Я прочитал diff: проверки содержат no-core-call, no-new-receipt, terminal cancellation, unchanged opid/conservative status assertions; snapshot и runtime negatives работают с настоящими temporary filesystem fixtures. Runtime cap проверен на 32769 distinct empty JS files и девяти sparse 16 MiB files. Эти проверки не являются только вызовом строк ради процента.

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/remediation-run.txt`): Повтор в том же pinned image и том же Python tracer: **109 tests PASS, 52.432 s**; actual installed-CLI integration с пятью SIGKILL scenarios **1 PASS, 83.840 s**. Source `recognized_confirm.py` остаётся SHA-256 `05b4022f2ee785f53c2236314578ca874fd9408d4e65730ba19a88cdacfba366`; tests теперь `4e803601355437b856bada092fb118234f4c64ae2caa13975d717f39c6d862b8`. Прежний hash tests в 08 QE относится к 95-test checkpoint, а не к расширенному suite. Остальные 10 файлов из exact-byte table не менялись на момент финальной проверки.

Новый adapter: **428/432 statements (99.07%)**, **181/186 branches (97.31%)**. New-code 80% gate пройден по обеим метрикам. Modified module coverage относительно измеренного baseline сохранено; речь о Python modules, не о Node core/OAuth/index.

FR-defined critical groups остались теми же, denominator не уменьшался:

| CLAIMED (protocol requirement): Critical path | Statements | Branches | Gate ≥90% обе метрики |
| --- | --- | --- | --- |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): Consent FR2/3 C2 | 73/73 | 30/30 | PASS |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): Durability FR4/5 C3/C4 | 161/163 (98.77%) | 65/68 (95.59%) | PASS |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): Binding FR4/7 C1/C6 | 148/148 | 78/78 | PASS |
| MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): Privacy C5 | 97/99 (97.98%) | 46/48 (95.83%) | PASS |

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): Оставшиеся statement gaps:46 runner input type/size guard,124 core status request shape guard,174 private file growth после stat,257 same-inode isolation alias. Дополнительная missing branch340→342 — cleanup при lock open failure. Это явный остаточный риск, а не заявление exhaustive coverage; critical groups всё же проходят фиксированный 90% threshold. Same-UID hostile filesystem mutation и все syscall races вне принятой модели, но дальнейшие isolated negative tests полезны.

MEASURED (git commit 7e52bef; coverage report `fleet-regression-evidence/coverage.json`): [G-REG-1..5] remediation закрывает обязательный coverage threshold и существенно расширяет negative assertions; не утверждается выполнение каждого возможного boundary combination. Историческое недостаточное покрытие сохранено в [pre-remediation-coverage.json](fleet-regression-evidence/pre-remediation-coverage.json), текущее — [coverage.json](fleet-regression-evidence/coverage.json), независимый повтор — [remediation-run.txt](fleet-regression-evidence/remediation-run.txt). Ранее linked `tests.txt`/`integration.txt` остаются evidence первого измерения.

CLAIMED (reported by lead): Lead отдельно запустил native `dz discrimination-check` с явным Python unittest runner и base5141b6b: получен `CANNOT_ISOLATE / unrecognised-runner-output`, потому что classifier ожидает Node TAP/Vitest (`/tmp/hermes-adapter-discrimination.json`). Этот host invocation не pinned-container gate. Нельзя подменить результат fabricated TAP wrapper или объявить meaningful negative tests эквивалентом machine receipt. **Discrimination NOT ESTABLISHED** остаётся инструментальным/процессным ограничением для parent synthesis; regression/coverage PASS не делает весь framework all-green.
