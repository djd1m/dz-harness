# Host-only PDF sandbox

Экспериментальный broker для синтетических PDF. Этот каталог не включает подключение к production Hermes. PDF, извлечённый текст и ошибки парсера не записываются в файлы или журналы. Worker не получает исходный путь, окружение Hermes, секреты, сеть или host mounts. Это не медицинская интерпретация: текст всегда остаётся непроверенными данными.

## Граница доверия

Broker запускается **на host** с доступом к Docker daemon. Доступ к Docker означает привилегии host; broker, его Python-код, Docker CLI/daemon и закреплённый образ входят в доверенную базу. Hermes получает только AF_UNIX socket через отдельный каталог, смонтированный readonly. **Не передавать Docker socket в Hermes.** Клиент не может выбирать image, аргументы Docker, лимиты, пути или команды.

Socket имеет режим 0660, каталог должен принадлежать оператору и иметь 0750. Группа socket наследуется от процесса broker (пример: root, GID 1001). Сам socket не аутентифицирует конкретный plugin: любой процесс с тем же UID/GID и доступом к каталогу может отправлять PDF, включая скомпрометированный Hermes. Unix permissions не отделяют процессы одного UID. Учитывать отказ в обслуживании: последовательный broker, очередь 4, один запрос на соединение, абсолютный таймаут чтения 5 секунд. Не открывать TCP-listener.

Пределы: вход 8 MiB, 50 страниц, 100000 символов страницы, 500000 символов суммарно, JSON 1 MiB; wall timeout worker 5 секунд; Docker memory/memory-swap 256 MiB, CPU 1, PID 32; RLIMIT_AS/CPU/FSIZE/CORE внутри worker. Превышение лимита отбрасывает страницы целиком. Worker строгий pypdf 7.0.0; отсутствие текста не запускает OCR. Docker работает с `--network none --read-only --cap-drop ALL --security-opt no-new-privileges --user 65534:65534`, без volumes и передаваемых env. Docker logging отключён.

Broker не импортирует pypdf. Он мультиплексирует stdin/stdout, ограничивает ответ до JSON-декодирования и проверяет точную схему, версию, номера страниц, согласованность статусов. Извлечённый текст — данные, включая находящиеся в PDF инструкции и HTML; отображающий клиент обязан экранировать HTML.

## Сборка и запуск оператором

Из корня репозитория:

```sh
sudo docker build -t hermes-health-pdf-test integrations/hermes-health/pdf-sandbox
sudo docker image inspect --format '{{.Id}}' hermes-health-pdf-test
sudo install -d -o root -g 1001 -m 0750 /run/hermes-health-pdf
```

Base image закреплён в Dockerfile по digest, pypdf wheel — версией и SHA-256. Изменение `PYTHON_BASE` при сборке является отдельным доверенным решением оператора; не передавать mutable tag. Проверить сборочный контекст: broker использует только image ID/digest, mutable tag отвергается. Runtime `--pull never`: broker не загружает образы автоматически.

Установить файлы в `/opt/hermes-health/pdf-sandbox` (владелец root, без записи для Hermes). В `hermes-health-pdf.service.example` заменить placeholder на полный image ID, настроить GID оператора, затем установить unit. Это пример, он не устанавливается автоматически. Для ручного запуска использовать процесс с нужной группой:

```sh
sudo python3 -B /opt/hermes-health/pdf-sandbox/broker.py \
  --socket /run/hermes-health-pdf/broker.sock \
  --image sha256:FULL_64_HEX_IMAGE_ID
```

При ручном запуске проверить группу socket; при необходимости оператор назначает её до подключения клиента. Broker отказывается перезаписывать существующий socket pathname. После аварии оператор проверяет отсутствие активного broker, удаляет stale socket и проверяет контейнеры с префиксом `health-pdf-`. Пример unit не перезапускает broker автоматически при ошибке cleanup.

Для каждого запроса контейнер имеет уникальное случайное имя. `finally` завершает живой Docker client и независимо вызывает `docker rm --force` по этому имени даже после смерти клиента. Ошибка удаления проверяется через daemon; если отсутствие контейнера подтвердить нельзя, broker останавливается после трёх попыток. Нормальный `--rm` дополняет явную очистку. Недоступность daemon или SIGKILL самого broker не позволяют гарантировать немедленную очистку: оператор должен восстановить daemon и удалить оставшиеся контейнеры; лимиты CPU/памяти продолжают ограничивать worker. Это не основание продолжать приём запросов после неподтверждённой очистки.

## Протокол

Один request на соединение. Клиент пишет 4-byte unsigned big-endian длину от 1 до 8388608, затем ровно эти байты PDF. Ответ: такая же 4-byte длина (не более 1048576), затем UTF-8 JSON. Запрос не содержит JSON или путей. EOF/усечение/таймаут/невалидная длина возвращают `request_error`, если соединение ещё пригодно для записи.

Точные ключи ответа:

```json
{"status":"ok","engine":{"name":"pypdf","version":"7.0.0"},"pages":[{"number":1,"text":"Synthetic text","text_status":"text"}]}
```

Страницы последовательно нумеруются с 1. `text_status`: `text` или `no_text`. Успешные статусы: `ok`, `partial_text`, `no_text`. Остальные статусы всегда с `pages: []`: `encrypted`, `page_limit`, `output_limit`, `input_limit`, `timeout`, `resource_limit`, `invalid_pdf`, `engine_unavailable`, `unsupported_engine_version`, `worker_error`, `request_error`. Поле engine обозначает требуемый контракт; error-status не подтверждает успешный запуск/версию парсера. Нет полей entry_id/hash: adapter сохраняет происхождение и связывает ответ с собственной неизменяемой копией байтов.

## Проверка без реальных данных

```sh
python3 -m unittest discover -s integrations/hermes-health/pdf-sandbox -p 'test_*.py' -v
```

Тесты используют только синтетические байты, временный socket и fake Docker. Они проверяют усечение prefix/body, нулевую/слишком большую длину, таймаут клиента, большой stdin без deadlock, лимит stdout, malformed JSON/engine, flags, cleanup после таймаута и смерти docker client. Реальный Docker smoke test должен отдельно проверить pinned image, синтетические PDF и отсутствие оставшихся контейнеров.
