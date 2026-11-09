# Архитектура

Hermes register(ctx) → Python tools → изолированный Node/CLI → temporary SQLite snapshot.
Существующее ядро health-advisor и Claude-интеграция не меняются.
Файлы рабочей карты читаются через openat с O_NOFOLLOW по всем компонентам пути.
Полученный текст — недоверенные данные источника. Ошибки JSON не включают stderr или секреты.
