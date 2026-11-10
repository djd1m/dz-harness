# Проверка существующей индексации

Backlog: не заведено — shared dz store guard unreadable; store не ремонтировался.

Сценарий `integrations/hermes-health/tests/index_acceptance_check.py` работает
только на собственной временной технической карте. Входящие данные и credentials
не использует. Production volumes не монтируются. Команда воспроизведения:

```bash
sudo docker run --init --rm --network none --user 1000:1001 \
  --tmpfs /test:rw,exec,mode=0700,uid=1000,gid=1001 \
  -e HOME=/test -e TMPDIR=/test \
  -v "$PWD/integrations/hermes-health:/checks:ro" \
  --entrypoint python \
  sha256:c872058e59ba94c4ee7af4389da04845b4ae029351fbd49da11492ba942e6961 \
  /checks/tests/index_acceptance_check.py
```

Образ локально закреплён; не обещается его доступность из публичного registry.
`exec` нужен shell wrapper для dz в временном каталоге search; первоначальный
прогон с noexec отказал, рабочий поиск не менялся. Python SQLite connections
закрываются явно: context manager сам по себе завершает транзакцию, но не connection.
Перед fault injection создаётся отдельный SQLite backup через Backup API.

Измеренный результат: 5 chunks, известный источник найден по точному SHA;
повтор сохранил точное мультимножество text полей records (IDs/metadata не сравнивались); удалённый record восстановился после
повтора ingest; исходный документ остался прежним; изменение источника привело
к stale_index_source. Скрытая namespace дала path_denied.

Границы: это existing runtime, не новый managed index API. Использован допустимый
CLI kind=conclusion для технического test document: машинного kind в текущем CLI
нет. Текст явно unverified; это не доказательство native статуса в index metadata.
Удаление SQLite record не моделирует SIGKILL между транзакциями. Не проверены
concurrent writers, vector-index consistency, lost response и atomicity всех
хранилищ. Полный FR-6 ночного плана этим ещё не закрыт.
