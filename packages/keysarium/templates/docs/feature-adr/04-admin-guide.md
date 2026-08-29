# Руководство администратора @dzhechkov/skills-feature-adr

Практическое руководство для тимлидов и администраторов проектов по установке, настройке, мониторингу и сопровождению пакета `@dzhechkov/skills-feature-adr` -- 9-шагового адаптивного pipeline для разработки фич с Complexity Router (S/M/L/XL).

---

## 1. Управление компонентами

### Инвентаризация компонентов

Пакет устанавливает следующие компоненты в целевой проект:

| Компонент | Путь | Содержимое |
|-----------|------|------------|
| **SKILL.md** | `.claude/skills/feature-adr/SKILL.md` | Оркестратор pipeline (trigger-паттерны, DAG шагов, переменные) |
| **9 модулей** | `.claude/skills/feature-adr/modules/00-08` | Протокол для каждого шага pipeline |
| **4 reference-файла** | `.claude/skills/feature-adr/references/` | `complexity-matrix.md`, `adr-template.md`, `c4-template.md`, `qe-checklist.md` |
| **1 пример** | `.claude/skills/feature-adr/examples/` | `sample-feature-output.md` -- образец выхода для M-tier фичи |
| **Команда** | `.claude/commands/feature-adr.md` | Slash-команда `/feature-adr` |
| **Governance shard** | `.claude/shards/feature-adr.shard.md` | Quality gates, model routing, promise tags по шагам |
| **Правила** | `.claude/rules/feature-adr-conventions.md` | Конвенции именования, выходной директории, интеграции |

Манифест установки хранится в `.skills-feature-adr.json` в корне проекта. Он содержит версию пакета, список установленных компонентов и перечень всех файлов.

### Проверка здоровья установки

Команда `doctor` выполняет набор проверок целостности:

```bash
npx @dzhechkov/skills-feature-adr doctor
```

Проверки включают:

| Проверка | Что проверяется |
|----------|-----------------|
| Files exist | Все файлы из манифеста присутствуют на диске |
| Feature ADR skill pack | SKILL.md, количество модулей и references |
| Pipeline modules (9 steps) | Наличие всех 9 модулей `00-complexity-router.md` ... `08-qe.md` |
| Feature ADR command | Наличие `feature-adr*.md` в `.claude/commands/` |
| Feature ADR rules | Наличие `feature-adr*.md` в `.claude/rules/` |
| Keysarium integration | Обнаружение `.keysarium.json` (standalone или integrated mode) |

При обнаружении проблем `doctor` выводит конкретные рекомендации по исправлению. Типичное решение -- запуск `update` для восстановления отсутствующих файлов.

### Список установленных компонентов

```bash
npx @dzhechkov/skills-feature-adr list
```

Выводит таблицу с колонками: название компонента, статус (OK / Missing / Not installed), количество файлов. Также показывает интеграции с Keysarium и BTO, если обнаружены.

---

## 2. Настройка Complexity Router

Complexity Router (Step 0) классифицирует фичу по 6 измерениям и определяет tier (S/M/L/XL).

### Настройка весов измерений

Оценка по умолчанию суммирует баллы по 6 измерениям с равным весом:

| Измерение | Диапазон баллов |
|-----------|-----------------|
| Files affected | 1-4 |
| Domains touched | 1-4 |
| New integrations | 1-4 |
| Breaking changes | 1-4 |
| New data models | 1-4 |
| Cross-cutting concerns | 1-4 |

Суммарный балл определяет tier: S (6-8), M (9-13), L (14-19), XL (20-24).

Для настройки под ваш проект отредактируйте `references/complexity-matrix.md`, изменив пороговые значения или добавив вес-множитель к определенным измерениям. Например, если в вашем проекте cross-cutting concern -- это всегда серьезная задача, увеличьте его вес:

```
Cross-cutting concerns: score * 1.5 (rounded up)
```

### Добавление override-правил

Стандартные override-правила заданы в `modules/00-complexity-router.md`:

- Любое измерение = XL (4 балла) -- минимальный tier L
- Breaking changes > 0 -- минимальный tier M
- Пользователь явно задал tier -- использовать его

Для добавления проект-специфичных override-правил добавьте секцию в `modules/00-complexity-router.md`:

```markdown
### Project-Specific Overrides

- Любая миграция БД → минимальный tier M
- Изменения в модуле auth → минимальный tier L
- Фичи с изменением публичного API → минимальный tier M
```

### Пример: "В нашем проекте любая миграция БД -- это минимум M-tier"

Добавьте в секцию Override Rules файла `modules/00-complexity-router.md`:

```markdown
- If feature involves database migration (new migration file, schema change) → minimum tier is M
  Rationale: DB migrations require ADR (step 3), architecture review (step 5), and full QE
```

После этого Complexity Router будет автоматически повышать tier при обнаружении миграций.

---

## 3. Настройка шагов

### Кастомизация модулей

Каждый шаг pipeline определен в отдельном файле `modules/0N-*.md`. Модули можно настраивать под специфику проекта. Ключевые точки настройки:

| Модуль | Что можно настроить |
|--------|---------------------|
| `01-requirements.md` | Формат требований, обязательные секции (NFR, constraints) |
| `03-adr.md` | Шаблон ADR, обязательные секции, минимальное число альтернатив |
| `05-architecture.md` | Уровни C4 диаграмм, обязательные виды (sequence, deployment) |
| `06-implementation-plan.md` | Формат задач, поля (estimate, assignee, priority) |
| `07-code.md` | Конвенции кода, обязательные паттерны, запрещенные практики |
| `08-qe.md` | Глубина проверок по tiers, обязательные категории review |

### Добавление проектных ADR-шаблонов

Файл `references/adr-template.md` содержит базовый шаблон ADR. Для адаптации под проект:

1. Откройте `references/adr-template.md`
2. Добавьте обязательные секции вашей команды (например, `## Security Impact`, `## Migration Plan`)
3. Добавьте примеры, специфичные для вашего домена

### Настройка QE-чеклистов

Файл `references/qe-checklist.md` определяет проверки по категориям и tiers. Для адаптации:

1. Добавьте проект-специфичные проверки в нужную категорию (Security, Performance, Compatibility)
2. Настройте глубину проверок по tiers в таблице `Tier-Specific Depth`
3. Добавьте свои severity-правила, если стандартные (BLOCKER / WARNING / SUGGESTION) не подходят

### Настройка quality gate thresholds

Quality gates определены в governance shard (`feature-adr.shard.md`). Можно ужесточить или ослабить пороги:

```markdown
## Step-Level Quality Gates (customized)

| Step | Gate |
|------|------|
| 3 | Every ADR has >= 3 alternatives (project policy: raised from 2) |
| 8 | Test coverage >= 80% for L/XL tiers (project policy) |
```

---

## 4. Управление артефактами

### Выходная директория

Все артефакты создаются в `features/<feature-slug>/`. Эта директория не пересекается с `researches/` (которая используется только pipeline `/casarium`).

### Именование slug

- Формат: `kebab-case`, только латинские символы
- Максимальная длина: 40 символов
- Примеры: `add-user-auth`, `refactor-payment-flow`, `migrate-to-postgres`
- Запрещено: даты, номера тикетов в slug (размещайте их внутри артефактов)

### Именование файлов

Все артефакты используют нумерованный префикс, соответствующий номеру шага:

```
features/<feature-slug>/
  00_complexity_assessment.md
  01_requirements.md
  02_research.md                    # только L/XL
  03_adr/
    001-<decision-slug>.md          # M+, нумерация сквозная
    002-<decision-slug>.md
  04_domain_model.md                # только L/XL
  05_architecture.md                # M+
  06_implementation_plan.md
  07_code_changes/
    change_manifest.md
  08_qe_report.md
  diagrams/
    architecture-c4.mermaid         # M+
    sequence-<flow-name>.mermaid
    domain-model.mermaid            # L/XL
  README.md
```

### Нумерация ADR

ADR нумеруются последовательно внутри фичи: `001-*.md`, `002-*.md` и т.д. Формат slug -- `kebab-case` с описанием решения. Примеры:

- `001-choose-message-queue.md`
- `002-auth-strategy.md`
- `003-database-schema-approach.md`

### Именование диаграмм

Используйте описательный `kebab-case`: `architecture-c4.mermaid`, `sequence-payment-flow.mermaid`, `domain-model.mermaid`.

### Архивирование завершенных фич

После завершения фичи и слияния PR артефакты в `features/<slug>/` остаются как документация. Для архивирования:

```bash
# Перемещение в архив
mkdir -p features/_archive
mv features/<slug> features/_archive/<slug>
```

### Очистка незавершенных фич

Если pipeline был прерван и фича не будет доработана:

```bash
# Удаление артефактов незавершенной фичи
rm -rf features/<slug>
```

Незавершенные фичи не влияют на работу pipeline -- каждый запуск `/feature-adr` создает новую директорию.

---

## 5. Управление качеством

### Quality gates по шагам

Каждый шаг pipeline имеет формальный quality gate, который должен быть пройден перед переходом к следующему шагу:

| Шаг | Quality Gate | Tier |
|-----|-------------|------|
| 0 -- Complexity Router | Tier обоснован баллами по 6 измерениям, override-правила проверены | All |
| 1 -- Requirements | Все требования имеют acceptance criteria | M+ |
| 2 -- Research | Исследования верифицированы, нет hallucinated источников | L/XL |
| 3 -- ADR | Каждый ADR содержит >= 2 альтернатив с trade-off анализом | M+ |
| 4 -- DDD | Доменная модель совместима с существующей кодовой базой | L/XL |
| 5 -- Architecture | Mermaid-диаграммы синтаксически корректны | M+ |
| 6 -- Implementation Plan | Зависимости задач формируют валидный DAG (нет циклов) | All |
| 7 -- Code | Код следует конвенциям кодовой базы проекта | All |
| 8 -- QE | Нет BLOCKER-находок, все MUST-требования имеют статус PASS | All |

### Детализация по шагам

**Step 0 (Complexity Router):** Tier должен быть обоснован конкретными баллами по каждому измерению. Пользователь может повысить или понизить tier на checkpoint.

**Step 1 (Requirements):** Для M+ tiers каждое функциональное требование должно иметь формулировку acceptance criteria, пригодную для верификации на Step 8.

**Step 2 (Research):** Для L/XL tiers все ссылки на аналоги и паттерны должны быть верифицируемы. Применяется принцип PARANOID mode.

**Step 3 (ADR):** Минимум 2 альтернативы на каждый ADR. Каждая альтернатива содержит pros/cons и trade-off анализ. Выбранный вариант обоснован.

**Step 4 (DDD):** Доменная модель не противоречит существующим bounded contexts в кодовой базе. Ubiquitous language согласован.

**Step 5 (Architecture):** Все Mermaid-диаграммы рендерятся без ошибок. Компоненты на диаграммах соответствуют ADR-решениям.

**Step 6 (Implementation Plan):** Граф зависимостей задач -- валидный DAG. Нет циклических зависимостей. Каждая задача привязана к файлам.

**Step 7 (Code):** Код проходит линтер и type checker проекта. Соблюдаются существующие паттерны именования и структуры.

**Step 8 (QE):** Финальная проверка: ни один BLOCKER не остается открытым, все MUST-требования из Step 1 верифицированы с результатом PASS.

---

## 6. Мониторинг

### Отслеживание completion rate

Отслеживайте долю фич, прошедших pipeline до конца (Step 8 с вердиктом READY FOR MERGE). Регулярно проверяйте директорию `features/`:

```bash
# Подсчет завершенных фич (содержат 08_qe_report.md)
find features/ -name "08_qe_report.md" | wc -l

# Подсчет незавершенных (содержат 00_ но не 08_)
for d in features/*/; do
  [ -f "$d/00_complexity_assessment.md" ] && [ ! -f "$d/08_qe_report.md" ] && echo "$d"
done
```

### Мониторинг распределения tiers

Анализируйте распределение tiers в `00_complexity_assessment.md`:

- Слишком много XL -- возможно, фичи недостаточно декомпозированы
- Слишком много S -- возможно, команда обходит полноценный pipeline для средних фич
- Оптимальное распределение зависит от проекта, но типично: 20% S, 50% M, 25% L, 5% XL

### Анализ итераций на checkpoint

Если на одном и том же шаге пользователь регулярно запрашивает доработку (2+ итерации), это сигнализирует о проблемах:

- Частые итерации на Step 0: Complexity Router нуждается в калибровке
- Частые итерации на Step 3: ADR-шаблон недостаточно полный
- Частые итерации на Step 7: Конвенции кода недостаточно задокументированы
- Частые итерации на Step 8: Quality gate слишком строгий или требования размыты

### Типичные паттерны обратной связи

| Паттерн | Причина | Действие |
|---------|---------|----------|
| "Повысь tier" на Step 0 | Router занижает сложность | Добавить override-правило |
| "Добавь альтернативу" на Step 3 | Недостаточно альтернатив | Увеличить минимум в gate |
| "Не соответствует конвенциям" на Step 7 | Конвенции не описаны | Дополнить `07-code.md` |
| "Исправь blocker" на Step 8 | QE находит проблемы | Ужесточить gate на Step 7 |

---

## 7. Интеграция с CI/CD

### QE-отчет в code review

Файл `08_qe_report.md` содержит структурированный отчет: количество тестов, review findings по severity, покрытие acceptance criteria. Используйте его в PR:

```markdown
## QE Summary (from features/<slug>/08_qe_report.md)
- Tests: 42/42 passed
- Review: 0 blockers, 2 warnings, 5 suggestions
- Requirements: 8/8 covered
- Verdict: READY FOR MERGE
```

### ADR-файлы как часть PR-документации

Включайте ADR-файлы из `features/<slug>/03_adr/` в PR как обоснование архитектурных решений. Ревьюеры получают контекст: какие альтернативы рассматривались, почему выбран данный подход.

### Архитектурные диаграммы в технической документации

Mermaid-диаграммы из `features/<slug>/diagrams/` рендерятся нативно в GitHub, GitLab и большинстве систем документации. Копируйте или ссылайтесь на них из технической документации проекта.

### Implementation plan как описание PR

Файл `06_implementation_plan.md` содержит декомпозицию задач с зависимостями. Используйте его как описание PR или как чеклист для self-review:

```markdown
## Implementation Checklist
- [x] Task 1: Create migration (files: db/migrations/...)
- [x] Task 2: Add domain model (files: src/models/...)
- [x] Task 3: Implement API endpoint (files: src/api/...)
- [x] Task 4: Add tests (files: tests/...)
```

---

## 8. Масштабирование

### Параллельный запуск нескольких pipeline

Несколько `/feature-adr` pipeline могут работать параллельно, если каждый использует уникальный slug. Каждый pipeline создает изолированную директорию `features/<slug>/` и не конфликтует с другими.

Ограничения при параллельной работе:
- Код в Step 7 может изменять одни и те же файлы в разных pipeline -- координируйте на уровне git-веток
- Нумерация ADR независима внутри каждой фичи -- глобального реестра нет

### Командные конвенции для slug

Установите командные правила именования slug:

```
<team-prefix>-<feature-description>
```

Примеры:
- `payments-add-stripe-webhook`
- `auth-migrate-to-oauth2`
- `ui-redesign-dashboard`

Это облегчает навигацию по `features/` при большом числе фич.

### Нумерация ADR между фичами

ADR нумеруются локально внутри `features/<slug>/03_adr/`. Если вам нужна глобальная нумерация ADR в проекте, заведите центральный реестр (`docs/adrs/` или аналогичный) и копируйте ADR из `features/` после завершения pipeline.

### Общие reference-материалы

Если несколько команд используют `@dzhechkov/skills-feature-adr`, синхронизируйте кастомизации reference-файлов:

1. Храните кастомизированные `references/` в отдельном git-репозитории
2. Используйте `scripts/sync-templates.js` для обновления шаблонов
3. Или зафиксируйте кастомизации в `references/` и исключите их из `update` (см. раздел 10)

---

## 9. Кастомизация для домена

### Банковский домен

Добавьте в `modules/03-adr.md` обязательную секцию:

```markdown
### Mandatory ADR Section: Security & Compliance
- [ ] ФЗ-152 impact assessment
- [ ] ФСТЭК requirements addressed
- [ ] On-premise deployment constraints documented
- [ ] Data residency compliance verified
- [ ] HITL policy for AI components defined
```

Рекомендации:
- В Step 5 (Architecture): all LLM components -- on-premise (GigaChat, YandexGPT, open-source)
- В Step 8 (QE): обязательный security review с фокусом на данные клиентов
- Override-правило: любая фича с доступом к ПДн -- минимум tier L

### Домен здравоохранения

Добавьте в `references/qe-checklist.md`:

```markdown
## Healthcare-Specific Checks
- [ ] ФЗ-323 compliance verified
- [ ] Patient data isolation confirmed
- [ ] HITL mandatory for all clinical decisions
- [ ] AI explainability documented for medical personnel
- [ ] Medical device regulation applicability assessed
```

### Ритейл и E-commerce

Дополните `modules/01-requirements.md`:

```markdown
### Retail-Specific NFR
- Latency budget: define max response time (target < 200ms for recommendations)
- A/B testing plan: how the feature will be validated in production
- Personalization vs. privacy balance: GDPR/ФЗ-152 compliance
- Seasonality handling: behavior during peak load
```

В Step 8 (QE) добавьте: нагрузочное тестирование для L/XL tiers, проверку latency budget.

### Enterprise и B2B

Дополните `references/adr-template.md`:

```markdown
## Change Management
- User training requirements
- Rollout strategy (big bang / phased / feature flag)
- Rollback plan

## SLA Impact
- Uptime requirements affected
- Performance SLA changes
- Support team notification
```

Override-правило: фичи с изменением публичного API или интеграций с legacy-системами -- минимум tier L.

---

## 10. Обновление и миграция

### Команда update

```bash
npx @dzhechkov/skills-feature-adr update
```

Команда сравнивает установленные файлы с текущей версией шаблонов и показывает diff:

- `+ N file(s) to add` -- новые файлы, которых не было в предыдущей версии
- `~ N file(s) to update` -- измененные файлы с новым содержимым
- `= N file(s) unchanged` -- файлы без изменений

Для предварительного просмотра без записи:

```bash
npx @dzhechkov/skills-feature-adr update --dry-run
```

### Версионирование шаблонов

Версия пакета записывается в манифест `.skills-feature-adr.json`. При обновлении:
1. `version` обновляется до текущей версии пакета
2. `updatedAt` фиксирует дату обновления
3. `files` перестраивается на основе актуального содержимого

### Сохранение кастомизаций при обновлении

Команда `update` **перезаписывает** измененные файлы. Если вы кастомизировали модули или references:

**Стратегия 1: Backup и merge**
```bash
# Перед обновлением
cp -r .claude/skills/feature-adr/modules .claude/skills/feature-adr/modules.bak
npx @dzhechkov/skills-feature-adr update
# Вручную перенесите кастомизации из .bak
diff .claude/skills/feature-adr/modules/ .claude/skills/feature-adr/modules.bak/
```

**Стратегия 2: Git diff**
```bash
git stash
npx @dzhechkov/skills-feature-adr update
git diff  # Посмотрите, что изменилось
git stash pop  # Верните свои кастомизации
# Разрешите конфликты
```

**Стратегия 3: Отдельные файлы для кастомизаций**

Вместо модификации стандартных файлов, добавляйте проект-специфичные расширения в отдельные файлы (например, `references/qe-checklist-project.md`) и ссылайтесь на них из модулей. Так `update` не затронет ваши кастомизации.

### Миграция между мажорными версиями

При мажорном обновлении (1.x -> 2.x) возможны breaking changes:
1. Прочитайте CHANGELOG в репозитории пакета
2. Запустите `update --dry-run` для оценки масштаба изменений
3. Запустите `doctor` после обновления для проверки целостности
4. Проверьте кастомизации -- структура модулей или reference-файлов могла измениться

---

## 11. Устранение неполадок

### Таблица типичных проблем

| Проблема | Причина | Решение |
|----------|---------|---------|
| Неверная классификация tier | Complexity Router неточно оценил измерения | На checkpoint Step 0 используйте "повысь" / "понизь" для явной коррекции. Добавьте override-правило в `modules/00-complexity-router.md` |
| Отсутствует ADR (нет `03_adr/`) | Step 3 пропущен для M-tier | Проверьте `{ACTIVE_STEPS}` в `00_complexity_assessment.md`. Для M-tier Step 3 должен быть в списке. Если нет -- перезапустите с явным tier M |
| QE находит BLOCKER-ы | Код не проходит quality gate | Откройте `08_qe_report.md`, найдите BLOCKER-записи. Исправьте каждую и запросите "повтори QE" |
| Конфликт параллельных агентов | Два агента пишут в один файл | Проверьте file write isolation. Для L/XL tiers агенты работают параллельно только на разных шагах (2||3, 4||5) или разных модулях (Step 7). Если конфликт -- перезапустите шаг |
| Pipeline прерван на середине | Сессия завершилась или произошла ошибка | Pipeline можно перезапустить с последнего checkpoint. Существующие артефакты не будут потеряны. Запустите `/feature-adr` и укажите продолжение с нужного шага |
| `doctor` показывает missing files | Файлы удалены или повреждены | Запустите `npx @dzhechkov/skills-feature-adr update` для восстановления |
| Mermaid-диаграммы не рендерятся | Синтаксическая ошибка в `.mermaid` | Quality gate Step 5 должен это ловить. Если пропущен -- откройте файл в Mermaid Live Editor и исправьте |
| Манифест поврежден | `.skills-feature-adr.json` содержит невалидный JSON | Удалите файл и запустите `npx @dzhechkov/skills-feature-adr init` заново |
| `update` перезаписал кастомизации | Не сделан backup перед обновлением | Восстановите из git: `git checkout -- .claude/skills/feature-adr/`. См. раздел 10 о стратегиях сохранения кастомизаций |
| Governance shard не загружается | Файл `feature-adr.shard.md` отсутствует | Запустите `doctor`, затем `update` для восстановления. Shard критичен для quality gates и model routing |
| Step 7 генерирует код, не соответствующий стилю проекта | Конвенции кода не описаны | Дополните `modules/07-code.md` примерами и конвенциями вашего проекта |

### Полное удаление и переустановка

Если ничего не помогает:

```bash
# Удаление
npx @dzhechkov/skills-feature-adr remove

# Чистая установка
npx @dzhechkov/skills-feature-adr init
```

Команда `remove` удаляет все файлы, перечисленные в манифесте, и сам манифест. Директория `features/` с артефактами фич не затрагивается.

---

## Краткая справка по командам

| Команда | Назначение |
|---------|-----------|
| `npx @dzhechkov/skills-feature-adr init` | Установка пакета в проект |
| `npx @dzhechkov/skills-feature-adr doctor` | Проверка здоровья установки |
| `npx @dzhechkov/skills-feature-adr list` | Список установленных компонентов |
| `npx @dzhechkov/skills-feature-adr update` | Обновление до последней версии |
| `npx @dzhechkov/skills-feature-adr update --dry-run` | Предпросмотр обновления |
| `npx @dzhechkov/skills-feature-adr remove` | Удаление из проекта |
| `/feature-adr [описание фичи]` | Запуск pipeline (в Claude Code) |
