# Hermes — ночная приёмка

Основной статус:00_status.md; требования:01_requirements.md; исходное
состояние:02_baseline.md. Ветка feat/hermes-health-night-acceptance.

Backlog: не заведено — dz backlog add отказал через store guard: vector store
unreadable (2026-11-09). Не сбрасывали guard и не создавали пустую БД поверх
существующей. Вместо успешной записи backlog зафиксирован этот явный waiver;
сама задача сохранена здесь и в активной цели сессии.

`dz recall` также сообщил unreadable store: отсутствие совпадений не трактуется
как успешный поиск по истории. Статус feature-adr записывается через dz statusline;
это не означает прохождения gates. Reference mode, plain, Codex coding;
независимое QE другой Codex-моделью — явное предпочтение владельца.
