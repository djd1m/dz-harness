Независимый QE Hermes PDF draft — финальная перепроверка 2026-11-09

**Окончательный verdict: PASS в согласованном объёме QE кандидата. QE-1 закрыт; открытых blocker нет.** Прежний HOLD снят. Это результат независимого обзора и synthetic tests с отдельно атрибутированным integration evidence parent; полный featureADR gate и production deployment не заявляются.

Финальная проверка ограничена изменениями после HOLD: исправлением `tests/test_pdf_draft.py`, добавленными failure cases, двумя запрошенными suites и актуальным [verification.md](verification.md). Полный обзор implementation повторно не проводился. SHA-256 `pdf_draft.py`, `__init__.py`, `health_plugin.py`, `pdf-sandbox/broker.py`, `contract.py`, `worker.py` и Dockerfile совпали с проверенным срезом HOLD. `test_broker.py` также не изменился.

Implementation reviewer не менял. Docker/root-процессы, production, публикация и commit не выполнялись. Medical, auth/env-файлы, секреты и посторонние проекты не читались; внешняя сеть не использовалась. `/tmp/.git` не изменялся и в финальной проверке не исследовался. Все новые temporary fixtures размещались в `/var/tmp`.

**Закрытие finding QE-1 — P2, ложноположительный negative test.**

Первоначальная проблема: `TemporaryDirectory()` попадал под `/tmp/.git`, поэтому valid root, root с режимом 0755 и symlink root одинаково возвращали `drafts_inside_git`. Проверка только `ok == False` могла ошибочно подтвердить защиту, до которой выполнение не доходило. В прежнем срезе это относилось к `tests/test_pdf_draft.py:31,112–123`; implementation корректно отказывал раньше остальных проверок.

Исправление проверено чтением актуального теста и исполнением:

- `integrations/hermes-health/tests/test_pdf_draft.py:31–39`: HEALTH_TEST_TMP, проверка absolute/existing directory и отсутствия `.git` у предков, cleanup через addCleanup. Для прогона выбран `/var/tmp`; preflight прошёл.
- `:55–62`: перед каждым тестом проходит полный successful baseline с двумя artifacts, затем fixtures очищаются. Ошибка инфраструктуры теперь останавливает setup, а не превращается в успешный negative case.
- `:89–98,108–117,128–152`: проверяются точные ответы/ошибки для arguments, integrity, schema, permissions, workspace/Git containment, traversal, suffix/size и symlink. Для symlink используется предусмотренный API общий `unavailable_or_invalid_source`; он больше не маскируется `drafts_inside_git`.
- `:154–163`: quota и занятый flock действительно достигаются и дают `drafts_quota_exceeded` / `drafts_busy_retry`.
- `:165–174`: детерминированная collision сохраняет существующие файлы побайтно и не создаёт лишних artifacts.
- `:176–188`: отказ каждого из четырёх вызовов fsync приводит к отказу операции и удалению artifacts; остаётся только lock file.
- `:190–217`: после фактической частичной записи семи байтов и synthetic OSError новые artifacts удалены, прежние файлы сохранены.

QE-1 закрыт без изменения или ослабления implementation. Новых defects в проверенных изменениях не обнаружено. Ранее замеченные отсутствие engine provenance в документах и устаревшее ожидание списка tools были закрыты и перепроверены ещё до HOLD; повторный обзор этих неизменённых участков не выполнялся.

**Непосредственно выполнено reviewer в финальном проходе.**

Из `/home/dz-user/dz-harness-health-plugin`, с очищенным окружением и разрешёнными local synthetic sockets/files:

```sh
env -i PATH=/usr/bin:/bin HEALTH_TEST_TMP=/var/tmp TMPDIR=/var/tmp python3 -B -m unittest discover -s integrations/hermes-health/tests -p test_pdf_draft.py -v
env -i PATH=/usr/bin:/bin HEALTH_TEST_TMP=/var/tmp TMPDIR=/var/tmp python3 -B -m unittest discover -s integrations/hermes-health/pdf-sandbox -p test_broker.py -v
```

| Suite | Результат и граница |
| --- | --- |
| test_pdf_draft.py | **12/12 PASS**, 0.154 s. Реальные local filesystem writes и AF_UNIX framing; adapter extraction reply подменён synthetic fixture. Проверены safe artifacts/permissions/hash, escaping, integrity/drift, schema, partial/no_text/error statuses, unsafe paths, quota/lock, collision, partial-write/fsync cleanup. |
| test_broker.py | **14/14 PASS**, 1.331 s. Реальные AF_UNIX framing/timeout и subprocess fake Docker; входные/выходные лимиты, mutable image rejection, flags, bad JSON/version, cleanup после timeout/client death. Реальный Docker не запускался. |

Итого финального прохода: **26/26 PASS**, без skips/errors/failures. Предыдущие EPERM и запрет записи под `/tmp/.git` больше не препятствуют этим проверкам; marker не удалялся, защита не обходилась. Старые 15 PASS test_health_plugin и 12 PASS reviewer probes относятся к предыдущему проходу, в 26 не включены и повторно не запускались.

**Evidence parent — принято для итоговой оценки, самостоятельно не воспроизводилось reviewer.**

В прочитанном `verification.md` зафиксированы:

- 67/67 plugin tests в pinned Hermes image с отключённой сетью, readonly исходниками и без рабочей карты; 14/14 broker tests.
- Реальный Docker broker: технический PDF → ok с ожидаемым текстом; повреждённые bytes → invalid_pdf; timeout → timeout, sandbox leftovers отсутствуют.
- Полный synthetic broker + adapter: два файла MD/HTML, совпавшие хеши, права 0600, неизменённый исходный manifest.
- Runtime isolation реального worker: UID 65534, NoNewPrivs=1, CapEff=0, network connect → ENETUNREACH (101), memory.max=268435456, pids.max=32, отсутствие map и Docker socket, image-declared Volumes=null.
- Doctor curated runtime package: PASS, 6 tools; plugin validate: PASS. Первоначальный отказ doctor при mount всего checkout из-за прав ops/backup-health.sh не выдаётся за успешный; результат относится к пакету runtime Python/plugin.yaml/skills. Предупреждение private ContextVars API относится к существующему intake с pinned Hermes 0.22.2.

Дополнительно в запросе на финальную перепроверку пользователь передал evidence parent о real image synthetic cases: русский текст на двух страницах → ok с совпавшим текстом; mixed → partial_text; encrypted → encrypted; scan → no_text. В прочитанном срезе `verification.md` эти четыре результата отдельно не перечислены; они атрибутируются сообщению пользователя, а не собственному прогону reviewer или изученным raw logs.

Проверенные parent локальные image IDs из `verification.md`: parser `sha256:89499635ad081bd68531310f4d2088ebfd24507ac344601aba9ab2cac298c5b3`, Hermes `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961`. Reviewer не запускал приведённую там sudo/Docker-команду, не инспектировал daemon/images и не проверял raw integration logs.

**Граница окончательного verdict.**

Совместно с предыдущим статическим обзором неизменённого implementation собственные 26 PASS закрывают QE-1 и прежние пробелы local socket/private-write evidence. Реальная parser isolation, качество извлечения синтетических PDF и уничтожение реальных контейнеров подтверждаются отчётом parent, не независимым повторением reviewer. Административная trust boundary broker/Docker/operator и ограничение Unix permissions для одного UID/GID сохраняются. Этот PASS не утверждает доказанность всех race/crash-сценариев, установки systemd/Unix socket в production или доставки файлов в Mattermost. Эти операции в reviewer scope не входили; открытого blocker для согласованного QE кандидата нет.

Срез финальной проверки, SHA-256:

```text
pdf_draft.py                  14ad7d8cb37c7ced2d57494908ab4b1b539d086c329c0aa16cde31c63b703ad0
__init__.py                   3c91f1182490deeadf9e660e6fca69285a39986c2f926f5ca36fb59f24df4380
health_plugin.py              272910a783a4901ff17d963b3916d81cb23f8885df1feb56545a13e21250090e
pdf-sandbox/broker.py         cb7de52992b5a7fdb9cbc3278c0654ebc49f40910bc6442349cd37fc5e60ac2b
pdf-sandbox/contract.py       024180f4e2ad0c4f8121ac8ee407c3848547768f4bc74377527c61947bd7f586
pdf-sandbox/worker.py         9ad57920be621e7f93dd3942f8c09565d8633694752e294b8a5f556c04f6fbdd
pdf-sandbox/Dockerfile        496c0bbaa55ff955be6d9a1d3b4120f8d6ddc75b82c321bf76ba7cfaa134b8d1
pdf-sandbox/test_broker.py    b8f7db2678c638ca1426816d396c83d3a1a56420617624afe022ef9563f4b686
tests/test_pdf_draft.py       ce9978fc9d6dec7ce74c9267802d7155966924f0d4f9f26f4c1876d4c7ce9555
verification.md              07b2a57f7c5df7f33d67d5e2b52b78c6ebc7aa93cf58ceeb52bf4a28bc9a3225
```
