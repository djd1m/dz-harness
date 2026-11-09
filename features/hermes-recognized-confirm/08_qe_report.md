# Независимый QE: synthetic recognized-confirm adapter

**PASS для ограниченного synthetic adapter scope.** Незакрытых блокирующих source defects на проверенных bytes не найдено. Real Mattermost transport acceptance **NOT ESTABLISHED**; production enable/install/publish не разрешаются. Общий parent plan и L Step9 fleet этим отчётом не закрыты.

Reviewer gpt-6-astra, другой Codex model относительно coder по явному выбору владельца (plain/Codex). Прочитаны feature ADR/requirements/domain model/architecture/plan, challenge C1–C7, amendments AM1–7, change manifest, code/tests, package README и health-read documentation. Это review реализации, не formal cross-family panel. Reviewer не менял source/tests, не commit/push; единственная проектная запись — этот отчёт.

## Измеренные результаты

MEASURED на settled tree после finite-float correction:

| Проверка reviewer | Результат |
| --- | --- |
| MEASURED: все plugin Python `test_*.py` в pinned image | 95 tests PASS, 0 fail/skip; 35.705 s; exit0 |
| `integration_recognized_confirm.py` в том же image + candidate core overlay | 1 integration test PASS, 28.645 s; exit0; внутри пять отдельных SIGKILL сценариев |
| Независимый strict JSON probe: nested escaped duplicate key, ±1e999, NUL | Каждый отказан фиксированным Refusal |
| Full-duplex probe: 2 MiB stdin, child сначала пишет 60 KiB stderr, затем читает stdin | Завершён; child вернул точный input byte count, stderr не возвращён |
| Early child exit до потребления 1 MiB stdin | Санитизированный `recognized_core_unavailable` |
| Настоящая инъекция directory fsync failure после replace committing receipt | Core calls=0, видимый receipt `committing`; следующий confirm выполняет только status и возвращает reconciliation_required |

Полные reviewer logs: `/tmp/recognized-adapter-qe-regression.log`, `/tmp/recognized-adapter-qe-integration.log`. Дополнительные probes исполнялись inline с temporary synthetic fixtures и mocks только на fault seam; данные/сентинелы документов не выводились. Host probes не заменяли установленный CLI integration.

Воспроизводимая команда regression:

```bash
sudo -n docker run --rm --init --network none --user 1000:1001 \
  --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
  -e HOME=/test -e TMPDIR=/test -e PYTHONPATH=/opt/hermes -e HERMES_HOME=/test/hermes \
  -v /home/dz-user/dz-harness-health-plugin/integrations/hermes-health:/plugin:ro \
  -v /home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor:/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor:ro \
  --entrypoint python3 \
  sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961 \
  -m unittest discover -s /plugin/tests -p 'test_*.py'
```

Для integration та же команда, последние аргументы заменить на `/plugin/tests/integration_recognized_confirm.py`. Никаких production volumes/auth, медицинских оригиналов или сети. Candidate core package overlay read-only; synthetic map/state живут в private tmpfs. Container writable layer disposable; это не production установка. Actual intake создаёт manifest, actual standalone CLI делает save/status; broker response подменён synthetic extracted text. Actual pypdf broker execution этим integration не проверяется.

## C1–C7 / FR traceability

| Challenge / FR | Source и реальные assertions | Вывод |
| --- | --- | --- |
| C1 / FR4,7: schema, installed capability/runtime pin | `core_run` closed save/status mapping; no read/ingest verb; `runtime_identity` hashes installed JS/JSON/native modules и Node; `verify_core` пересчитывает core canonical request hash с workspace dev/ino/logical path. Integration использует actual accepted core и искажает text hash/bytes/request hash/engine/index status | PASS для candidate runtime; version/capabilities не подменяются наличием файла checkout |
| C2 / FR2,3: consent boundary | Registry открывает только model prepare; private command authority + trusted ContextVars; tests no-model-confirm, no authority, mismatched owner, handler exception containment; integration меняет все identity fields; existing intake/context regression включает cron denial | PASS synthetic API boundary. Python private object не является sandbox против same-UID shell. Настоящая доставка Mattermost команды не доказана |
| C3 / FR4: durable intent/reconcile | Неблокирующий стабильный flock охватывает read→intent→core→receipt; concurrent confirm/cancel/status получают busy. После intent только status прежнего opid; cancel отказан. Tests timeout, final receipt write failure, TTL expiry, draft deletion, runtime/source drift; пять process deaths + independent post-replace fsync probe | PASS process-crash/observed-state scope; no blind save повтор |
| C4 / FR5: HMAC/state isolation | Separate schema/key/lock/name; state root disjoint с workspace/drafts/intake, aliases отказаны; private/no-follow/single-link reads, HMAC, strict duplicate/finite JSON; tests tamper, hardlink/FIFO/0644, quota/isolation | PASS scoped local store. Same-UID hostile writer вне модели |
| C5 / FR4: bounded stdin/privacy | Selector одновременно writes stdin и drains stdout/stderr, aggregate cap, monotonic deadline, killpg/reap; text UTF-8 byte bound before spawn; tests backpressure, fork descendants, stderr privacy, multibyte boundaries; own 2 MiB/60 KiB probe | PASS проверенных сценариев; raw stderr/text не возвращается пользователю |
| C6 / FR1,2: sidecar/snapshot continuity | `provenance.json` пишется после MD/HTML, fsync sidecar/child/root; only MD/HTML artifacts. Tests completion, fsync failures, malformed sidecar, read-then-overwrite: отправляется проверенный byte snapshot, следующий snapshot отказывает | PASS; весь rendered MD — payload, не чистый parser text. Source binding включает stored/logical paths, exact digest/size |
| C7 / FR6,8: trust/no-index/no hidden read | Summary и command errors labelled unverified/untrusted/not_requested; actual artifact exact draft bytes; no `.health-brain` created; hidden source_get denied; core adapter read/ingest refused | PASS. Saved не означает indexed/searchable/clinically verified |

AM1–7 имеют реальные именованные тесты в плане. Reviewer проверил их наличие и исполнил suite; это не утверждение о самостоятельно исполненных `dz amendment-check`/`discrimination-check` machine receipts — их процессная оценка остаётся у lead/fleet.

## Реальные crash сценарии integration

1. SIGKILL до сохранения committing → status остаётся prepared, save не подтверждён.
2. SIGKILL после durable committing до core → reconciliation_required, без автоматического save.
3. SIGKILL перед final saved receipt при уже сохранённом core artifact → status reconciles saved_unverified.
4. SIGKILL после final saved receipt → status saved_unverified.
5. SIGKILL после replace saved receipt до его directory fsync → status saved_unverified при наблюдаемом intact core artifact.

Последний результат не доказывает, что прежний fsync прошёл; он соответствует явно ограниченной process-crash модели. Power loss, физический отказ носителя и все возможные syscall windows не исследованы исчерпывающе.

## Неблокирующие замечания и ограничения

- `artifact_observed` становится true после успешного status reconciliation, а не сразу после валидного save ack. Поэтому save success + последующая невозможность status может дать `not_established`, хотя ack уже был. Это консервативная индикация, не ложное absent, не повторный save; будущему UX полезно различать acknowledged и independently observed. Ранее успешно reconciled artifact сохраняет `previously_observed_unverified` при позднем drift.
- Quota применяется при входе в store и к status/reconcile: заполненный store блокирует эти команды, требует operator maintenance. Regression это явно фиксирует. Не обещать автоматический recovery при исчерпанной quota; не удалять receipts для blind retry.
- `runtime_identity` сортирует `rglob` список до file-count cap. Ограничены bytes прочитанных code files и число eligible files, но не вся работа обхода/материализации namespace. Здесь runtime — доверенный установленный package tree; это не доказательство resource isolation против произвольного огромного/меняющегося runtime directory.
- Synthetic write flag — deployment default и scope convention, не доказательство, что карта содержит только synthetic данные. Любой операторский enable на реальной карте требует отдельной приёмки. Exact runtime hashes подразумевают стабильное дерево; same-UID concurrent replacement исключён из модели.
- Большинство state unit tests mock runtime identity/snapshot; actual integration восполняет installed CLI/real ContextVars/core storage, но вызывает handler напрямую. Fake registration/direct handler и реальные ContextVars не равны real Mattermost dispatch acceptance.
- Строгие typed boundary checks хорошо покрыты основными отрицательными сценариями, но не exhaustive fuzzing всех nested schema типов. Не измерялись максимальный resident memory, все descendant race windows, длительная нагрузка, cross-host/NFS, реальные legacy writers или все ошибки диска.
- Core identity содержит workspace realpath/dev/ino. Restore на новый inode/path требует deliberate recovery/rebind contract; adapter это не решает. Предыдущий S3 restore старой карты не является тестом restore новых recognized artifacts.
- Общая гарантия «Hermes/модель не может писать карту» не заявляется: при доступном shell/terminal same UID может обходить Python API. Принят только запрет confirm в model-facing tools данного plugin.

## Exact reviewed bytes

Git HEAD при фиксации отчёта: `2172a56f1b32381369443c40c3c94f0b208aaa46`; authority review — hashes ниже, поскольку commit checkpoint мог добавляться без изменения source. Paths относительны `integrations/hermes-health/`.

| Файл | SHA-256 |
| --- | --- |
| recognized_confirm.py | `05b4022f2ee785f53c2236314578ca874fd9408d4e65730ba19a88cdacfba366` |
| pdf_draft.py | `3acdeee91064572a35c9ebfcd301c0216b9fa5067c8fef3c2596ea0206b2037d` |
| __init__.py | `d19b018199019cbb723504c0514e158b99f4b694d73ac5dce2471f58247cdafc` |
| health_plugin.py | `3ba85a33d7f000a178cbc062d2db9a42fbd60c567084b79d308847cf392350dd` |
| plugin.yaml | `3b0cede6c3f89b0417b0105b75cf38fec57c3c7c8e482f98685dc09e637a19c8` |
| tests/test_recognized_confirm.py | `10bc935aa6a891a1843206be2054b9f6c7b8dab1365738160fdf761c1fa49091` |
| tests/integration_recognized_confirm.py | `1dad565a29ba3228d1861636c5a12dda02c882541077626fbc0f4585310c1ea6` |
| tests/test_pdf_draft.py | `622f75b8bd0644783ca40b9f0e7566fab6ee8369b32796bc09142c162260847d` |
| tests/test_health_plugin.py | `a0ff9fea92713a5c4bcef9ce62b49f41a4c39d3f970274499468fcfa0502eb82` |
| README.md | `2e951992a41406bfcf6dd740b28b62e384b03092e3e90ec7664620c5bf9c233c` |
| MEASURED SHA-256: (git commit 2172a56) skills/health-read/SKILL.md | `7957d4d3c87ffb566de7e483c79ed1a4fc4a7d510fdc9675614e1c5d662e354f` |

MEASURED SHA-256 и проверенные тесты: (git commit 2172a56) accepted candidate core source dependency: store `14dc9770bcdec8465fd85adc5d54aa52e577f3618d898c919db9d3fa93100ff3`, CLI `00a1bdb0fcdafb6c92609b5d1356f7acedf542e570314da760e941fb08aa0395`, отдельный core QE — 35 tests PASS. Не изменялся этим review.

Границы K1 native Python sweep и target/context admission изложены change manifest; focused QE не переписывает их в более сильный pre-code/process PASS. Следующий обязательный gate для L — самостоятельный fleet с traceability/risk/integration/regression evidence. Production transport, managed indexing и recovery/rebind остаются открытыми задачами.
