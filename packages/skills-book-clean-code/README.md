# Clean Code — приватный набор навыков

9 навыков и 259 проверенных единиц знаний по утверждённому охвату: главы 1–17 и приложение A. Каждое правило связано со страницами источника; PDF и OCR-корпус в пакет не входят.

## Usage scenarios

Из корня репозитория установите весь локальный набор одной командой:

```sh
dz init --target claude-code --skills-dir ./books/clean-code/pack/skills-book-clean-code --no-hooks --no-integrations
```

Для Codex замените цель на `codex`. После установки опишите задачу обычными словами: «Используй подходящие навыки Clean Code для этой задачи: …». Агент выберет навык по ситуации. Проверка маршрутизации снижает риск неправильного выбора, но не гарантирует каждый ответ.

### Понятные имена и функции

RU: «Помоги уточнить имена и разделить ответственность этой функции». EN: “Clarify these names and separate this function's responsibilities.”
Работают `clean-code-intent-and-comment-contract` и `clean-code-function-contracts`: агент проверяет намерение, параметры и скрытые эффекты.

### Осторожный рефакторинг старого кода

RU: «Упрости этот старый модуль, сохранив поведение и опираясь на проверки». EN: “Simplify this legacy module while preserving behavior and checking it with tests.”
`clean-code-legacy-refactoring-loop` ведёт небольшие проверяемые изменения; разработка новой функции остаётся задачей основного feature-пайплайна.

### Общее состояние нескольких потоков

RU: «Проверь составные операции с общими данными и условия взаимной блокировки». EN: “Check compound shared-state operations and deadlock conditions.”
`clean-code-concurrency-safety` помогает разложить операции, выбрать защиту и проверить прогресс потоков.

## Что установлено

- clean-code-intent-and-comment-contract
- clean-code-source-layout
- clean-code-function-contracts
- clean-code-object-data-ownership
- clean-code-error-and-boundary-handling
- clean-code-test-suite-feedback
- clean-code-legacy-refactoring-loop
- clean-code-architecture-assembly
- clean-code-concurrency-safety

У каждого навыка есть `references/knowledge.md` с полными назначенными KU. Дополнительная SQLite-база находится в `brain/clean-code.sqlite`; это лексическая переносимая копия, векторы не включены. После явного решения о переносе в общий brain её можно импортировать командой `dz brain add --from-pack <путь-к-пакету>`. Такая загрузка меняет долговременный межпроектный brain и не выполнена при сборке.

Для Copilot инструкции постоянно активны: устанавливайте только нужное подмножество. Набор остаётся private; установка и публикация — разные действия. Проверки качества и smoke-install записываются в отчёт CP4 рядом с пакетом.
