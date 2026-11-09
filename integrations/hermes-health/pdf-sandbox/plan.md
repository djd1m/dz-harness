# План host broker

1. Зафиксировать двоичный протокол AF_UNIX: uint32 big endian длина (1..8 MiB), затем PDF; ответ uint32 + UTF-8 JSON до 1 MiB. Один запрос на соединение, последовательная обработка, таймаут чтения.
2. Broker проверяет закреплённый sha256 образ, запускает только фиксированный worker с ограничениями Docker и удаляет уникально именованный контейнер в finally, включая смерть docker client.
3. Worker pypdf 7.0.0 получает только stdin, извлекает максимум 50 страниц; JSON проходит строгую проверку broker.
4. Синтетические unittest: framing, усечение, таймаут, лимиты, неверный JSON/engine, fake Docker cleanup. Документировать host boundary и systemd, без prod изменений.
