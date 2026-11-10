# Независимый QE: существующая индексация, S-срез

**PASS в ограниченном scope синтетического эксперимента существующего runtime.** Общий ночной план, новый core recognized contract и managed gateway index этим не приняты.

Проверены requirements, plan, реальные assertions `integrations/hermes-health/tests/index_acceptance_check.py` и parent process deviation. После изменения с SQLite Backup API выполнен независимый полный прогон; затем lead исправил два замечания reviewer и явно разрешил повторную проверку новых bytes. Код reviewer не менял.

Проверенный SHA-256 финального теста: `327bdd40e727e0fd9e1591327a427c7489a564b9db74231e6b1ff8b93d3142c6`.

## Исполнение

```bash
sudo -n docker run --rm --init --network none --user 1000:1001 \
  --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
  -e HOME=/test -e TMPDIR=/test \
  -v /home/dz-user/dz-harness-health-plugin/integrations/hermes-health:/checks:ro \
  --entrypoint python \
  sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961 \
  /checks/tests/index_acceptance_check.py
```

MEASURED: первичный и финальный прогон после двух точечных поправок — exit 0; final output: 5 chunks, repeat_exact_text_multiset/recovery/source-unchanged/stale-refusal passed, hidden_error=path_denied. Обычный Docker без sudo перед этим отказал на socket permission; контейнер при той попытке не запустился. Только synthetic technical workspace в tmpfs; сеть отключена; production volumes/auth не подключались. `python` запускался без `-O`, assertions действовали. Первичный lead log `/tmp/hermes-index-acceptance.log` дал совпадающий результат, но verdict основан также на собственных запусках.

## Traceability

| Требование | Реальная проверка | Результат |
| --- | --- | --- |
| FR-1 | CLI ingest exit0; `len(baseline)>1`; `HealthTools.search` возвращает конкретный `recognized/technical.md` с SHA исходного файла | PASS, 5 chunks; это известный источник, не просто count |
| FR-2 | Повторный ingest, sorted list всех `memory_records.text` точно равен baseline | PASS; проверяется multiset текстов с учётом числа дубликатов |
| FR-3 | SQLite Backup API перед fault; integrity_check=ok и text multiset backup равен baseline; DELETE одного text, count уменьшился ровно на 1; повтор ingest восстанавливает весь baseline text multiset | PASS; удалённый chunk восстановлен, остальные тексты не изменены |
| FR-4 | После повторов/recovery SHA исходника неизменен, marker `human_verification: not_established` сохранён; после намеренной подмены source поиск возвращает `stale_index_source` | PASS |
| FR-5 | Отдельный hidden document, реальный ingest, search отказывает; политика не ослаблялась | В собственном run `hidden_error=path_denied`; поиск hidden namespace остаётся unsupported |

## Неблокирующие замечания и ограничения

1. `rows()` читает только колонку `text`: точное совпадение текстового multiset, **не** неизменность record IDs, timestamps, других metadata или физического layout SQLite. По замечанию reviewer lead переименовал output в `repeat_exact_text_multiset`. Recovery аналогично не доказывает сохранение старого ID удалённого chunk. FR-2/3 узкого среза этим удовлетворены.
2. Изначально hidden assertion принимал любой `not ok`. Lead исправил по замечанию reviewer: теперь требуются одновременно точный `path_denied` и `not ok`; произвольная runtime error не проходит этот gate.
3. Baseline получен из первого ingest, не из независимого expected chunk plan. Тест доказывает восстановление наблюдавшегося набора, но не изначальную полноту/правильность chunking. Search проверяет один известный hit до recovery; поиск после recovery отдельно не вызывается.
4. Marker проверяется в исходном файле, а не в каждом passage/search hit. Не доказана его передача в каждый chunk или структурированный verification field результата поиска.
5. Manifest пуст, source anchors отсутствуют; документ создан непосредственно тестом. Нет human gateway confirm, immutable recognized save/revision provenance, trust-marker propagation во всех chunks или готового managed index API. Hidden namespace нового recognized layout пока недоступна через search; обходить это запрещение не следует.
6. DELETE одной записи в отдельной SQLite — контролируемое логическое повреждение, не crash/power-loss/timeout или конкурентный writer. Retry здесь повторяет весь idempotent ingest. Не доказаны selective missing-only retry, atomic multi-chunk write, vector mirror, rollback или index_unknown/reconcile contract. Backup проверен как snapshot, но восстановление рабочей DB из backup не выполнялось: recovery делался ingest.
7. Assertions исполняются только без Python optimization. Run с `-O` не может считаться приёмкой этого файла. Тест не выполняет production intake/save, поэтому нельзя на основании его отсутствующих вызовов заключать, что будущий gateway orchestration не повторяет intake при сбое.

Parent `06_implementation_plan.md` явно сообщает, что target/context admission данного теста состоялся после первого draft. Reviewer не выдаёт это за pre-code gate и не снимает deviation своим PASS. Не проводился аудит всех feature-adr machine receipts или закрытие parent L fleet.

Незакрытых блокирующих дефектов для измерительного S-среза не найдено. Для принятия parent FR-6 всё ещё нужны отдельные managed-operation, exact recognized revision/index provenance и end-to-end failure/reconciliation доказательства.
