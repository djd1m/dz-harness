# Исследование локальных контрактов

Исследование ограничено репозиторием и синтетической средой; production/auth/medical данные не читались.

`pdf_draft.py` уже проверяет source SHA/bytes и пишет приватные MD/HTML через exclusive no-follow fds с fsync. Его результат не имеет immutable provenance; новый sidecar добавляет completion marker, но видимый marker сам по себе не доказывает прошлый fsync.

`intake_confirm.py` содержит task-local gateway identity и private HMAC store patterns. Его runtime pin относится к intake; новый adapter не может использовать его как recognized runtime evidence. Существующее recovery intake не выполняет требуемый recognized readback. Reuse ограничен identity/private-directory idioms; receipt/key/lock/state machine отдельные.

`health_plugin.py` запрещает dot-path чтение и ограничивает subprocess output, но runner использует DEVNULL stdin. Поэтому exact draft snapshot требует нового full-duplex bounded runner. Generic read/search не расширяются.

Core `recognized-cli.js` — экспериментальный standalone administrative CLI, не gateway consent API. Контракт capabilities/save/status приведён в плане после сверки с core исполнителем. Фактический installed candidate test обязателен отдельно от mock; production transport acceptance не следует из регистрации handler.

Независимый challenge C1–C7 перенесён в amendments плана с тестами. Никакой внешний поиск не нужен для закрытого локального ABI; unsettled candidate требует повторной проверки перед runtime acceptance.
