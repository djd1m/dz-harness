# Документация @dzhechkov/p-replicator

Полный комплект документации к npm-пакету `@dzhechkov/p-replicator` —
toolkit для AI-assisted разработки в Claude Code (Vibe Coding).

## Что это

`p-replicator` устанавливает в проект готовый набор `.claude/`-инструментов:
**11 slash-команд**, **10 skills**, **4 агента**, **6 правил**, **7 hook-скриптов**
и `settings.json` с pre-configured хуками. Главная команда `/replicate`
проводит проект через 5-фазный pipeline (Discovery → Planning → Validation →
Toolkit Generation → Finalize), генерирует SPARC-документацию и project-specific
артефакты.

## Навигация

| Раздел | Описание |
|---|---|
| [01_quickstart.md](./01_quickstart.md) | Установка, первый запуск, проверка |
| [02_user_guide.md](./02_user_guide.md) | Все команды и workflow с примерами |
| [03_admin_guide.md](./03_admin_guide.md) | Настройка hooks, settings.json, statusline, insights |
| [04_api_reference.md](./04_api_reference.md) | CLI-флаги, схемы манифеста, roadmap, state |
| [05_architecture.md](./05_architecture.md) | Архитектура: pre-shipped vs generated, SSOT, hooks |
| [06_troubleshooting.md](./06_troubleshooting.md) | Решение типичных проблем |
| [07_changelog.md](./07_changelog.md) | История версий 1.3.x → 1.5.x |

## Языки

- 🇷🇺 [Документация на русском](./README.md) (вы здесь)
- 🇬🇧 [English documentation](../eng/README.md)

## Версия

`@dzhechkov/p-replicator@1.5.0` (последняя стабильная). См. история всех
изменений в `../../CHANGELOG.md` (авторитетный источник).

## Быстрый старт

```bash
cd ваш-проект
npx @dzhechkov/p-replicator init
claude                              # открыть Claude Code
/replicate "описание вашего продукта"
```

После завершения `/replicate` запустите `/run mvp` для автономной сборки фич
из roadmap'а или `/start` для bootstrap'а scaffold'а.

## Связанные репозитории

- npm: https://www.npmjs.com/package/@dzhechkov/p-replicator
- GitHub: https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator
- Issues: https://github.com/djd1m/dz-harness-hub/issues

## Companion-документация (внутри пакета)

- `../../CHANGELOG.md` — история версий
- `../../KNOWN_LIMITATIONS.md` — открытые задачи на улучшение (7 пунктов)
- `../../MULTIPLATFORM_ROADMAP.md` — roadmap поддержки Codex/OpenCode/KiloCode
- `../../README.md` — короткое user-facing intro
