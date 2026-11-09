# Fleet Integration Integrity Checker

Независимый review границ core → adapter → operator index, 2026-11-09 UTC.
Результат: **PASS для проверенной синтетической цепочки; WARN по полноте recovery**.
Это вклад Agent 3 в Step 9, не общий fleet verdict и не разрешение deployment.

Методика: `modules/09-fleet-qe.md`, pinned
`qe-ref-enterprise-integration-testing/REFERENCE.md` и
`qe-ref-qe-coverage-analysis/REFERENCE.md` из feature-adr, upstream
`0a6de058575cbe292afe220df105cc74120f7674`. Reference mode: aqe runtime,
SAP/browser инструменты и автоматический coverage analyzer не запускались.

## Проверенный scope

- Adapter: `/home/dz-user/dz-harness-health-plugin/integrations/hermes-health/recognized_confirm.py`, SHA256 `05b4022f2ee785f53c2236314578ca874fd9408d4e65730ba19a88cdacfba366`.
- Core: `/home/dz-user/dz-harness-health-recognized`, HEAD `1dbdcaed063540bafa629d5da9622b4f09728127`; `lib/recognized-store.js` SHA256 `14dc9770bcdec8465fd85adc5d54aa52e577f3618d898c919db9d3fa93100ff3`.
- Index: `/home/dz-user/dz-harness-health-index-lab`, HEAD при проверке `84b8ef9446bac5ae12ac78f88fb50ebd007d80dc`; `integrations/hermes-health/experiments/recognized-index/index_lab.js` SHA256 `32a72c887c73b21721e04d7f3d945864f7338757a42eb5a5477196c45b2eca30` (хеш файла определяет проверенную рабочую версию).

Production, credentials, PHI, network tests и реальные Mattermost сообщения исключены. Core package и оба consumer mount read-only. Runtime image закреплён ниже. Product source не менялся; добавлена только acceptance evidence после компонентных review.

## Контракты и консистентность

| Граница | Проверка | Вывод |
|---|---|---|
| Draft → prepare | Adapter проверяет завершённый sidecar, source/draft digest, runtime/workspace binding; prepare не создаёт recognized artifact | Сохранение требует отдельного handler confirm |
| Adapter → core | `core_run`, `CAPABILITY`, `verify_core`: exact capabilities, bounded stdin JSON, operation ID, source bytes/hash, UTF-8 digest/length, engine, canonical artifact path и request fingerprint | Producer/consumer согласованы; corrupt public binding не сохраняет success |
| Identity | `proposal_id == operation_id`; fingerprint включает schema, workspace realpath/dev/inode, source anchor/path/hash/bytes, draft hash/bytes, engine | Повтор привязан к той же операции и карте, не к произвольному тексту |
| Core → index | `runtime`, `makePlan`: capabilities, readUnverifiedRecognition, actual source integrity, artifact text digest/length, immutable operation, `index_status:not_requested` | Нет индексации несуществующей/дрейфовавшей операции |
| Index → third-brain | `buildRecords` и `ingest` одного core package; deterministic path/date/kind/anchor, plan digest до явного apply | Existing header контракт используется без расширения third-brain CLI |
| DB → index receipt | Native readonly SQLite v2 snapshot; exact multiset pattern/domain/type/reward; malformed, duplicate, variant и unavailable backend не дают полноту | CLI counters и recall не являются authority |
| Trust → search | `kind=machine-unverified`; каждый lab response содержит НЕПРОВЕРЕНО, untrusted_document, not_established; search-known требует полной сверки и exact known header/body | Reachability известного фрагмента, не clinical verification и не semantic completeness |
| Index → adapter status | Индексация не меняет core receipt или adapter state | `saved_unverified` + `index_status:not_requested` остаются корректны; lab выдаёт отдельное наблюдение `indexed_unverified_at_check_time` |

Зависимости направлены от adapter/index к core. Core recognized не импортирует adapter или index. Index — отдельный operator CLI; adapter не вызывает index. Циклической зависимости в проверенных модулях нет. Автоматического save→index перехода нет. Интеграционный fixture связывает их только явными действиями оператора. Общая транзакция отсутствует.

## Новая фактическая combined проверка

Причина дополнительного теста: существующий adapter integration заканчивается после save/status, а index integration начинает с прямого core.save. Их отдельный PASS не доказывает потребление артефакта, созданного через adapter.

[combined_integration.py](evidence/combined_integration.py) использует настоящий synthetic intake ZIP/PDF, реальные Hermes ContextVars, `HealthTools`, prepare и direct command handler confirm, standalone core CLI, index CLI, existing ingest и native SQLite. Подменён только ответ parser broker на вымышленный технический текст; фактический pypdf broker и gateway transport этим тестом не проверяются.

Одна operation проходит prepare → confirm → core immutable artifact → explicit plan/apply → repeat no-op → reconcile → search-known → adapter status. Проверены совпадение operation ID, сохранение unverified labels, точный artifact/draft, отсутствие текста в save summary, совпадение record IDs при повторе, `write_attempted:false`, неизменные SHA256 всех sources/recognized файлов и неизменная семантика core index_status.

**MEASURED — фактический результат: 1 test PASS, 13.691 s, 1 expected chunk**, exit 0.
Лог: [combined_integration.txt](evidence/combined_integration.txt).
SHA256 fixture: `81a3cef5097124fd6f68ac2fbb57c4164a6138595eb3f70203b9c0e94756d945`.
Это дополнительное post-review integration evidence, не замена компонентным suite.

Воспроизведение из root repo:

```sh
sudo -n docker run --rm --init --network none --user 1000:1001 \
  --tmpfs /tmp:rw,exec,mode=1777 \
  --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
  -e HOME=/test -e TMPDIR=/tmp -e PYTHONPATH=/opt/hermes:/plugin/tests \
  -e HERMES_HOME=/test/hermes \
  -e HA_CASE_LOCK_MODULE=/opt/health-advisor-runtime/node_modules/@dzhechkov/harness-core/dist/index.js \
  -e PATH=/opt/health-node22/bin:/opt/health-advisor-runtime/node_modules/.bin:/usr/local/bin:/usr/bin:/bin \
  -v /home/dz-user/dz-harness-health-plugin/integrations/hermes-health:/plugin:ro \
  -v /home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor:/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor:ro \
  -v /home/dz-user/dz-harness-health-index-lab/integrations/hermes-health/experiments/recognized-index:/lab:ro \
  -v /home/dz-user/dz-harness-health-plugin/features/hermes-night-acceptance/evidence/combined_integration.py:/combined.py:ro \
  --entrypoint python3 \
  sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961 /combined.py
```

## Recovery и существующие evidence

Прочитаны adapter `08_qe_report.md` и integration source: 95 unit tests плюс actual CLI integration с пятью SIGKILL окнами; это ранее выполненное независимое evidence, не повторный прогон этого reviewer. Durable intent до save, reconciliation после неизвестного исхода, восстановление без исходного draft и source drift после save проверяются там. Неизвестный исход не превращается в blind повтор save.

MEASURED по прочитанным журналам index (git commit 84b8ef9) `/tmp/recognized-index-qe-tests.log`: 15 tests PASS/102.199 s и `/tmp/recognized-index-qe-smoke.log`: 18 expected records, explicit health-research export 18, обычный recall 0. Source test cases включают partial_retry, ambiguous_write_never_success, partial_exception, source/artifact drift, backend/schema/native refusal, variants и malformed header. Это компонентное evidence; окончательный index QE PASS записан в его `08_qe_report.md` (PR37).

Index не обещает rollback: exception/timeout после попытки записи даёт index_unknown даже при полном postflight; затем требуется отдельный reconcile, явный apply только для none/exact_subset. Источники и recognized immutable artifact сохраняются. Замена revision, удаление, компенсационная транзакция и автоматический retry не реализованы и не заявлены. SIGKILL индексного процесса в новой combined проверке не выполнялся.

Root fresh-home evidence `/tmp/hermes-night-candidate-clean.log` показывает 7 registrations и integration_check PASS; одновременно содержит warning о private `gateway.session_context` imports. Это совместимость с данным pinned runtime, не гарантия будущих версий Hermes.

## Оставшиеся gaps и границы допуска

| Приоритет | Gap | Следующее действие |
|---|---|---|
| High / deployment block | Restore/rebind recognized на другой realpath/dev/inode не спроектирован; текущий fail-closed binding не переносим автоматически | Step 3/7/8: deliberate recovery/rebind контракт и тест restore в новой filesystem |
| High / transport acceptance gap | Direct handlers + ContextVars не доказывают доставку, owner identity и command routing в реальном Mattermost | Отдельная санкционированная transport acceptance до включения gateway write |
| Medium / recovery WARN | Нет общей core+index транзакции и rollback/revision activation; parallel writers и внешнее убийство index не покрыты combined тестом | Сохранить single-operator synthetic scope; расширять recovery только при расширении требований |
| Medium / runtime coupling | Private ContextVars и exact core/SQLite contract pin | Compatibility gate при любой смене Hermes/core/native schema |

Новый adapter остаётся disabled-default/synthetic-only; index остаётся operator-only. Source binding/trust проверены на всех звеньях выполненной цепочки; несоответствий API или данных в этой цепочке не найдено. На непроверенные критические сценарии этот вывод не распространяется. Инструментальные line/branch coverage и риск-взвешенный процент здесь не измерялись; подсчёт тестов не подменяет coverage. Shared coverage получает приоритетные gaps выше; числовые веса 0.3/0.25/0.25/0.2 без change-frequency/bug-history evidence не вычислялись. Полнота compensation gate остаётся WARN, transport и DR препятствуют расширению допуска до production.
