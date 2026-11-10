# Синтетическая restore lab для recognized

`restore_lab.py` выполняет ограниченный offline эксперимент над **синтетическим** export, внешними trusted descriptor и исходным HMAC key, уже поддержанными read-only verifier. Новый target создаётся оператором заранее как private source-only workspace с точными `sources/manifest.json` и raw bytes. Команда не подключает gateway, индекс, поиск, live карту или production данные и не переносит старую receipt в новый target.

```bash
python3 restore_lab.py plan --snapshot /private/snapshot --descriptor /private/external/descriptor.json --key /private/external/key.bin --target /private/new-map --batch-id <32-hex> --node /opt/health-node22/bin/node --runtime /opt/health-advisor-runtime
python3 restore_lab.py apply --snapshot /private/snapshot --descriptor /private/external/descriptor.json --key /private/external/key.bin --target /private/new-map --batch-id <32-hex> --node /opt/health-node22/bin/node --runtime /opt/health-advisor-runtime --confirm-plan-digest <64-hex>
python3 restore_lab.py reconcile --snapshot /private/snapshot --descriptor /private/external/descriptor.json --key /private/external/key.bin --target /private/new-map --batch-id <32-hex> --node /opt/health-node22/bin/node --runtime /opt/health-advisor-runtime --confirm-plan-digest <64-hex>
```

`plan` заново проверяет export, source-only target и pinned runtime closure и возвращает digest без target mapping и текстов. `apply` требует явного совпадения digest, фиксирует target-anchored `.restore-lab` claim/intent и новые детерминированные IDs до core save. `reconcile` отдельно перечитывает уже начатые операции и никогда не вызывает save. Seal означает только текущий точный readback с новым файловым durability barrier в synthetic local filesystem. Он не доказывает прежний power-loss commit, историческое согласие человека или медицинскую достоверность.

Установленный Node core CLI запускается абсолютными путями без shell и с ограничениями stdin/stdout/stderr, timeout и очищенным окружением. Runtime closure включает package JS/JSON/native bytes, Node executable и capabilities и должна совпасть с external `expected_runtime`. Old export остаётся неизменным. При отказе/неизвестном исходе команда останавливается; нет blind retry, удаления partial target или автоматической activation.

Unit tests используют fake core только для fault injection:

```bash
python3 -B -m unittest discover -s integrations/hermes-health/experiments/recognized-restore-lab -p test_restore_lab.py -v
```

`integration_actual.py` требует закреплённый offline image с `/opt/health-node22/bin/node`, `/opt/health-advisor-runtime` и synthetic Hermes test dependencies. Отсутствие runtime — ошибка, не skipped success. Авторский итоговый прогон выполнен с ранее проверенным candidate image digest `sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961` и read-only core overlay checkout `2c5614ea0`:

```bash
sudo -n docker run --rm --init --network none --user 1000:1001 \
  --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
  -e HOME=/test -e TMPDIR=/test -e PYTHONPATH=/opt/hermes:/opt/hermes/hermes_cli -e HERMES_HOME=/test/hermes \
  -v /home/dz-user/dz-harness-health-restore-lab/integrations/hermes-health:/lab:ro \
  -v /home/dz-user/dz-harness-health-recognized/packages/@dzhechkov/health-advisor:/opt/health-advisor-runtime/node_modules/@dzhechkov/health-advisor:ro \
  --entrypoint python3 sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961 \
  /lab/experiments/recognized-restore-lab/integration_actual.py
```

Результат авторского запуска: 1 integration test PASS; actual adapter→core старой synthetic операции, новый installed core save/read на другом inode, exact text/source, sealed intent, old export неизменен, новая receipt/index/activation отсутствуют. Три отдельных SIGKILL boundary probes: после durable attempting → explicit reconcile держит batch `held`; после core return и перед seal → explicit reconcile заново барьерит текущие bytes и получает `sealed`. Это process-crash модель на локальном tmpfs, не доказательство физического power loss. Независимая QE остаётся отдельной проверкой.
