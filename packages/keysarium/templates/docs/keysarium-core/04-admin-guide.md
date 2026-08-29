# Руководство администратора @dzhechkov/keysarium-core

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


Практическое руководство по администрированию, мониторингу и обслуживанию фреймворка keysarium-core. Описывает управление модулями, памятью, воркерами, dream cycles, witness chain, trust tiers и резервным копированием.

---

## 1. Управление модулями

### Инвентаризация

Пакет `@dzhechkov/keysarium-core` содержит 6 модулей (19 файлов):

| Модуль | Файлы | Назначение |
|--------|-------|-----------|
| `governance/` | 3 | Constitution (инварианты), shard protocol, checkpoint/promise protocol |
| `memory/` | 3 | memory_query/store, reward tracking, dream engine |
| `orchestration/` | 4 | Queen protocol, 6 топологий, воркеры, model routing |
| `verification/` | 3 | Witness chain, judge attestation, audit trail |
| `trust-tiers/` | 2 | 4-уровневая классификация, протокол повышения |
| `platform/` | 4 | Реестр адаптеров + шаблоны (Cursor, OpenCode, Copilot) |

### Проверка здоровья модулей

Для проверки целостности модулей убедитесь, что все файлы на месте:

```bash
# Перечислить все файлы core-пакета
ls packages/@dzhechkov/keysarium-core/governance/
ls packages/@dzhechkov/keysarium-core/memory/
ls packages/@dzhechkov/keysarium-core/orchestration/
ls packages/@dzhechkov/keysarium-core/verification/
ls packages/@dzhechkov/keysarium-core/trust-tiers/
ls packages/@dzhechkov/keysarium-core/platform/
```

Ожидаемые файлы по модулям:
- **governance/** -- `constitution.md`, `shard-protocol.md`, `checkpoint-protocol.md`
- **memory/** -- `memory-protocol.md`, `reward-tracker.md`, `dream-engine.md`
- **orchestration/** -- `queen-protocol.md`, `topology-selection.md`, `background-workers.md`, `model-routing.md`
- **verification/** -- `witness-chain.md`, `judge-attestation.md`, `audit-trail.md`
- **trust-tiers/** -- `tier-system.md`, `promotion-protocol.md`
- **platform/** -- `adapter-registry.md`, `templates/`

### Добавление пользовательских инвариантов

Инварианты определяются в `governance/constitution.md`. Для добавления доменных инвариантов:

1. Создайте файл `governance/constitution-{domain}.md`.
2. Нумеруйте новые инварианты начиная с `INV-100` (чтобы избежать конфликтов с core).
3. Используйте формат: Rule, Enforcement, On violation (HALT/WARN/RETRY), Rationale.

Пример для банковского домена:

```markdown
### INV-100: Data Perimeter
**Rule:** Данные клиентов не покидают контур безопасности.
**Enforcement:** Все LLM-вызовы только к on-premise моделям.
**On violation:** HALT -- нарушение ФЗ-152.
```

### Создание governance shards для новых стадий

Governance shards хранятся в директории shards вашего пайплайна. Каждый shard содержит: time budget, prerequisites (upstream promise tags), skill to load, stage-specific rules, quality gates, promise tag, anti-patterns.

Для создания нового shard:
1. Скопируйте шаблон из `governance/shard-protocol.md`.
2. Заполните stage-specific правила и quality gates.
3. Укажите time budget (% от общего времени пайплайна).
4. Сохраните как `{stage-id}.shard.md` в директории shards.
5. Рекомендуемый размер -- не более 100 строк для оптимального использования контекста.

---

## 2. Управление памятью

### Структура директории

```
.keysarium/memory/
├── config.json                          # Глобальная конфигурация
├── _patterns/
│   └── domain-patterns.json             # Обнаруженные паттерны
├── _stats/
│   └── reward-summary.json              # Агрегированная статистика
└── {domain}/                            # banking | retail | enterprise | healthcare
    └── {case-slug}/
        └── {phase}_{timestamp}.json     # Индивидуальные reward-записи
```

### Параметры config.json

Создается автоматически при первом доступе со значениями по умолчанию:

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `retention_days` | 90 | Срок хранения записей (дни). 0 = бессрочно |
| `max_results_per_query` | 10 | Макс. записей в ответе memory_query() |
| `enabled` | true | Включение/выключение системы памяти |
| `known_domains` | 4 домена | Список известных доменов |
| `reward_levels` | 4 уровня | Маппинг меток на числовые значения (1.0/0.7/0.3/0.0) |

### Протокол очистки (purge)

**Автоматическая очистка:** при каждом вызове `memory_query()` система сканирует запрошенный домен и удаляет записи, где `expires_at < текущая_дата`.

**Ручная очистка:** удалите директорию `.keysarium/memory/` целиком для полного сброса:

```bash
rm -rf .keysarium/memory/
```

При следующем вызове `memory_store()` директория будет создана заново.

### Мониторинг размера и количества записей

```bash
# Количество записей по доменам
find .keysarium/memory/ -name "phase-*.json" | wc -l

# Размер директории памяти
du -sh .keysarium/memory/

# Записи по конкретному домену
find .keysarium/memory/banking/ -name "*.json" | wc -l
```

### Устранение неполадок памяти

| Симптом | Причина | Решение |
|---------|---------|---------|
| memory_query() возвращает пустой список | Директория не существует или нет записей | Нормально при первом запуске; запустите пайплайн для сбора данных |
| Corrupted JSON при чтении | Прерванная запись, битый файл | Система автоматически пропускает битые файлы с логом warning. Удалите поврежденный файл вручную |
| Все записи expired | `retention_days` слишком мал | Увеличьте `retention_days` в config.json или установите 0 для отключения |
| Ошибка записи (permissions) | Нет прав на запись в `.keysarium/` | Проверьте права: `chmod -R u+w .keysarium/memory/` |
| config.json отсутствует | Первый запуск или был удален | Система использует значения по умолчанию автоматически |

### Резервное копирование и восстановление памяти

Для ручного бэкапа:

```bash
tar czf keysarium-memory-backup-$(date +%Y%m%d).tar.gz .keysarium/memory/
```

Восстановление:

```bash
tar xzf keysarium-memory-backup-YYYYMMDD.tar.gz
```

---

## 3. Управление воркерами

### Типы воркеров и маршрутизация моделей

| Тип | Модель | Описание |
|-----|--------|----------|
| `consolidate` | sonnet | Сканирование исследований, извлечение паттернов |
| `export-brain` | haiku | Фоновый экспорт brain в `.keysarium/exports/` |
| `health-check` | haiku | Проверка trust tiers, поиск устаревших данных |
| `pattern-analysis` | sonnet | Анализ трендов reward-данных |
| `dream-cycle` | sonnet | Построение concept graph, генерация инсайтов |

Никогда не используйте opus для фоновых воркеров -- они выполняют рутинные задачи.

### Ограничения параллельности

Максимум одновременных воркеров: **3**. При превышении лимита новый запуск будет отклонен. Проверяйте активных воркеров через `/workers status`.

### Управление реестром

Файл `registry.json` расположен в `.keysarium/workers/registry.json`. Только оркестратор (`/workers` команда) имеет право записи в реестр. Воркеры пишут только в свой `status.json` в своей рабочей директории. Это предотвращает конфликты записи.

### Правила изоляции воркеров

6 ключевых правил изоляции:

1. **Только своя директория:** воркеры пишут только в `.keysarium/workers/{worker_id}/`.
2. **Нет модификации данных проекта:** запрещена запись в `researches/` и `features/`.
3. **Нет модификации конфигурации:** запрещена запись в `.claude/`, `CLAUDE.md` и корневые файлы.
4. **Запрет под-агентов:** воркеры не могут порождать дочерних агентов.
5. **Read-only доступ к проекту:** воркеры могут читать любые файлы для анализа.
6. **Дельта для ревью:** результаты записываются как дельта (например, `harvest-delta.md`), а пользователь решает, применять ли их.

### Мониторинг статуса воркеров

```bash
# Проверить реестр
cat .keysarium/workers/registry.json

# Проверить статус конкретного воркера
cat .keysarium/workers/wkr-XXXXXXXX-XXXXXX-TYPE/status.json
```

Либо используйте команду `/workers status` для форматированного вывода. Статусы воркеров: `starting`, `running`, `completing`, `completed`, `failed`, `stop-requested`, `stopped`.

### Остановка воркеров

Остановка запрашивается через файл-флаг `stop-requested`:

```
/workers stop <worker_id>
```

Оркестратор создает пустой файл `.keysarium/workers/{id}/stop-requested`. Воркер проверяет его между основными операциями и завершается gracefully. Если воркер не остановился, Agent tool timeout (~10 минут) завершит его принудительно.

### Обработка ошибок

- Максимум **2 повторных попытки** на запрос. Каждая попытка создает нового воркера с новым ID.
- После 2 неудач -- статус `permanently failed`. Требуется ручной перезапуск.
- Ошибки логируются в `.keysarium/workers/{id}/error.log`.

### Очистка старых директорий воркеров

При вызове `/workers status` записи старше **24 часов** со статусом `completed`, `failed` или `stopped` автоматически удаляются из реестра. Для ручной очистки директорий:

```bash
# Найти и удалить директории воркеров старше 24 часов
find .keysarium/workers/ -maxdepth 1 -name "wkr-*" -mtime +1 -exec rm -rf {} +
```

---

## 4. Dream Cycles

### Управление trigger state

Файл `.keysarium/insights/trigger-state.json` хранит состояние триггеров:

```json
{
  "version": "1.0",
  "last_dream_completed_at": "2026-03-01T12:00:00Z",
  "last_dream_id": "dream-20260301-120000",
  "records_since_last_dream": 0,
  "pending_events": [],
  "config": {
    "time_threshold_minutes": 60,
    "volume_threshold": 20,
    "event_triggers_enabled": true
  }
}
```

### 3 типа триггеров

| Триггер | Порог по умолчанию | Описание |
|---------|-------------------|----------|
| **Time** | 60 минут | Прошло больше N минут с последнего dream cycle |
| **Volume** | 20 записей | Накоплено N новых reward-записей |
| **Event** | любое событие | Сбой quality gate, завершение кейса |

Приоритет при совпадении: event > volume > time.

### Политика хранения

Максимум **10 dream-файлов** в `.keysarium/insights/`. Ретенция применяется в конце каждого dream cycle (Step 5) и при вызове `/dream clear`. Файл `trigger-state.json` не подлежит удалению -- это состояние, а не результат.

### Ручной и автоматический запуск

**Ручной запуск:** `/dream run` -- запускает dream cycle немедленно, независимо от триггеров.

**Автоматический триггер:** при старте нового пайплайна (`/casarium` или `/feature-adr`) оркестратор проверяет триггеры и предлагает запуск. Это рекомендательный механизм -- запуск без подтверждения пользователя не происходит.

### Интерпретация dream insights

Инсайты классифицируются по типам:

| Тип | Источник | Применение |
|-----|---------|------------|
| `performance` | Кросс-доменное сравнение фаз | Корректировка time budget |
| `effectiveness` | Skill-domain mismatch | Выбор альтернативного скилла |
| `anti_pattern` | Корреляция фаз | Улучшение upstream фазы |

Каждый инсайт содержит `confidence` (0..1) и `impact` (low/medium/high). Фокусируйтесь на инсайтах с confidence >= 0.5 и impact high/medium.

### Очистка старых инсайтов

```
/dream clear
```

Удаляет все dream-файлы, кроме 10 самых свежих. `trigger-state.json` сохраняется.

---

## 5. Witness Chain и Audit Trail

### Расположение файлов цепочки

Каждое исследование имеет собственную независимую цепочку: `researches/<slug>/.witness-chain.json`. Цепочка инициализируется в Phase 0 с genesis record (previous_hash = NULL_HASH из 64 нулей).

### Восстановление цепочки после легитимных правок

Если артефакт изменен по запросу пользователя на чекпоинте:

1. Пересчитывается хеш измененного артефакта с тем же previous_hash.
2. Обновляется запись в `.witness-chain.json`.
3. Пересчитываются **все последующие записи** (каскадный rehash).
4. Обновляется `last_updated`.
5. Ремонт логируется в массиве `chain_repairs`:

```json
{
  "chain_repairs": [{
    "repaired_at": "2026-03-01T11:30:00Z",
    "sequence": 2,
    "artifact": "02_research_findings.md",
    "reason": "User requested additional research depth",
    "records_rehashed": 3
  }]
}
```

### Протокол верификации

Запустите `/verify-chain researches/<slug>/` для полной проверки цепочки. Алгоритм:

1. Загрузить `.witness-chain.json`.
2. Для каждой записи: прочитать артефакт, вычислить SHA-256(content + previous_hash), сравнить с записанным хешем.
3. Если все совпадают -- `PASS`. Если нет -- список сломанных звеньев с причинами.

### Структура Audit Trail

```
{audit-root}/
├── audit-log.json                # Мастер-лог всех событий
├── witness-chains/
│   └── {project-slug}.json       # Цепочки по проектам
├── attestations/
│   └── {evaluation-id}.json      # Аттестации по оценкам
└── decisions/
    └── {decision-id}.json        # Записи решений
```

10 типов событий: `artifact_created`, `artifact_verified`, `artifact_modified`, `evaluation_started`, `evaluation_completed`, `checkpoint_reached`, `checkpoint_approved`, `checkpoint_revised`, `reward_stored`, `decision_made`.

### Хранение

Audit trail хранится **бессрочно** -- на весь срок жизни проекта. Он не подчиняется правилам expiration из memory protocol.

### Заметки по регуляторному соответствию

**Банковский домен:** witness chain обеспечивает аудиторский след для соответствия ФЗ-152 и требованиям ЦБ. Сбой создания цепочки в банковском домене генерирует WARNING на чекпоинте.

**Медицинский домен:** audit trail обеспечивает прослеживаемость решений (ФЗ-323) и доказательство human oversight.

Для обоих доменов: `.witness-chain.json` и `.judge-attestations.json` коммитятся в git (не добавляйте их в `.gitignore`).

---

## 6. Trust Tiers

### Оценка текущего уровня

Чек-лист для определения tier скилла:

```
[ ] SKILL.md существует                                        --> Tier 0 минимум
[ ] SKILL.md содержит полную документацию протокола             --> Tier 0
[ ] references/ ИЛИ modules/ ИЛИ structured output             --> Tier 1
[ ] Оценка мульти-судейской панелью >= 7.0                     --> Tier 2
[ ] Детерминистический eval test suite существует и проходит    --> Tier 3
[ ] Оценка панелью >= 8.5                                      --> Tier 3
```

### Процесс повышения

**Tier 0 --> Tier 1 (структурная проверка, без оценки):**
- Добавьте `references/` (2+ примера) или `modules/` или structured output format.
- Убедитесь, что SKILL.md содержит полный протокол.

**Tier 1 --> Tier 2 (мульти-судейская оценка):**
- Запустите `/bto-test .claude/skills/<name>/`.
- Панель из 3 судей (Domain Expert 0.4, Critic 0.3, Completeness Auditor 0.3).
- Средний балл >= 7.0, ни один судья не ниже 5.0.
- Запишите `trust_tier: 2`, `bto_score`, `bto_date` в metadata скилла.

**Tier 2 --> Tier 3 (верифицированный):**
- Создайте детерминистический eval test suite (минимум 5 тест-кейсов).
- Все тесты должны проходить воспроизводимо.
- Балл панели >= 8.5.

### Триггеры понижения (demotion)

| Триггер | Результат |
|---------|----------|
| Eval тесты перестали проходить | Tier 3 --> Tier 2 |
| Повторная оценка ниже порога | Tier 2 --> Tier 1 |
| Удалены references/modules | Tier 1 --> Tier 0 |

Понижение логируется с причиной и датой в promotion history скилла.

### Мониторинг здоровья скиллов

Используйте health-check воркер (`/workers start health-check`) для автоматической проверки всех скиллов. Воркер использует модель haiku и выполняет структурные проверки.

### Перенос tier между проектами

При импорте скилла из другого проекта (через `/brain-import`), импортированный tier -- это рекомендация. Варианты принятия:
1. Принять as-is (доверять источнику).
2. Потребовать ре-оценку (проверить локально).
3. Понизить на один уровень (консервативный подход).

---

## 7. Мониторинг и здоровье системы

### Health-check воркер

Запуск: `/workers start health-check`. Модель: haiku. Выполняет:
- Проверку trust tiers всех скиллов.
- Поиск устаревших данных в `.keysarium/memory/`.
- Проверку структурной целостности конфигурации.
- Отчет записывается в `.keysarium/workers/{id}/output/health-report.json`.

### Аналитика через /learning-stats

Команда `/learning-stats` вычисляет и выводит:

- **Средний reward по фазам** -- таблица с avg, runs, trend по каждой фазе.
- **Разбивка по доменам** -- avg, cases, bottleneck phase для каждого домена.
- **Эффективность скиллов** -- avg reward и лучший домен для каждого скилла.
- **Обнаруженные паттерны** -- паттерны с confidence > 0.5 и actionable advice.

Фильтрация: `/learning-stats --domain banking --phase 2`.

### Ключевые метрики

| Метрика | Источник | Значимость |
|---------|---------|-----------|
| Overall average reward | `reward-summary.json` | Общее здоровье пайплайна |
| Per-phase bottleneck | `domain_averages.bottleneck_phase` | Фаза, требующая внимания |
| Per-domain patterns | `domain-patterns.json` | Доменные особенности |
| Trend (improving/stable/degrading) | reward-tracker algorithm | Динамика качества |

### Тревожные сигналы

| Сигнал | Порог | Действие |
|--------|-------|----------|
| Degrading trend по фазе | newer_avg - older_avg < -0.15 | Исследовать причину, проверить скиллы |
| Высокое число итераций | avg iterations > 2.0 для фазы | Пересмотреть подход к фазе в домене |
| Низкий avg reward по домену | < 0.5 | Рассмотреть доменные шаблоны и скиллы |
| Все записи expired | 0 valid records | Увеличить retention_days или создать свежие данные |

---

## 8. Резервное копирование

### Что нужно бэкапить

| Что | Путь | Приоритет |
|-----|------|----------|
| Данные памяти | `.keysarium/memory/` | Высокий |
| Dream insights | `.keysarium/insights/` | Средний |
| Witness chains | `researches/*/.witness-chain.json` | Высокий |
| Judge attestations | `.judge-attestations.json` (рядом с оценками) | Средний |
| Реестр воркеров | `.keysarium/workers/registry.json` | Низкий |

### Полный бэкап

```bash
tar czf keysarium-backup-$(date +%Y%m%d).tar.gz \
  .keysarium/ \
  researches/*/.witness-chain.json \
  researches/*/.judge-attestations.json
```

### Brain export как портативный бэкап

```
/brain-export all
```

Экспортирует в JSON-контейнер: metadata скиллов, domain patterns, research summaries, harvest patterns, pipeline metrics, top dream insights. Индивидуальные reward-записи не экспортируются (слишком объемно) -- только агрегаты.

### Восстановление из brain import

```
/brain-import path/to/keysarium-brain.json
```

Стратегия импорта: merge-not-overwrite. Существующие данные не перезаписываются, новые добавляются. Trust tiers из импорта трактуются как рекомендации.

---

## 9. Устранение неполадок

### Проблемы с памятью

| Симптом | Причина | Решение |
|---------|---------|---------|
| `memory_query()` всегда пустой | Нет директории `.keysarium/memory/` | Нормально при первом запуске. Пройдите хотя бы один кейс |
| Corrupted JSON при чтении | Прерванная запись | Удалите поврежденный файл. Система пропустит его автоматически |
| Все записи expired | Низкий `retention_days` | Измените `retention_days` в `config.json` (0 = бессрочно) |
| Неизвестный домен | Домен не в `known_domains` | Записи сохраняются в `unknown/`. Добавьте домен в config.json |
| memory_store() не записывает | Ошибка прав файловой системы | `chmod -R u+w .keysarium/memory/` |

### Проблемы с воркерами

| Симптом | Причина | Решение |
|---------|---------|---------|
| Воркер "зависает" (status: running дольше 10 мин) | Превышен timeout Agent tool | Воркер автоматически завершится. Проверьте `error.log` |
| "Maximum concurrent workers reached" | 3 воркера уже активны | Дождитесь завершения или остановите лишних: `/workers stop <id>` |
| Isolation violation (запись вне `.keysarium/workers/`) | Ошибка в шаблоне воркера | Проверьте и исправьте шаблон в `lib/worker-templates/` |
| Registry.json рассинхронизирован | Воркер завершился аварийно | `/workers status` автоматически обновит реестр из status.json файлов |
| Воркер не останавливается | Не проверяет stop-requested | Дождитесь timeout (~10 мин) для принудительного завершения |

### Проблемы с witness chain

| Симптом | Причина | Решение |
|---------|---------|---------|
| "Hash mismatch" при верификации | Артефакт изменен после хеширования | Запустите repair: пересчитайте хеш и каскад downstream |
| "sha256sum: command not found" | Нет утилиты хеширования | Установите coreutils. На macOS используется `shasum -a 256` |
| Permission error при записи цепочки | Нет прав на запись в директорию | `chmod u+w researches/<slug>/` |
| "File not found" при верификации | Артефакт удален или перемещен | Восстановите файл из git или бэкапа |
| Нет `.witness-chain.json` | Phase 0 не создала genesis | Пайплайн продолжит работу (graceful degradation), но цепочка отсутствует |

### Проблемы с dream cycles

| Симптом | Причина | Решение |
|---------|---------|---------|
| Триггеры не срабатывают | `trigger-state.json` отсутствует или сброшен | Будет создан с defaults при следующем memory_store() |
| "insufficient_data" при /dream run | Менее 5 valid reward-записей | Проведите больше кейсов для накопления данных |
| Stale insights (устаревшие) | Dream cycle не запускался давно | Запустите `/dream run` вручную |
| `trigger-state.json` corrupted | Прерванная запись | Удалите файл -- будет пересоздан с defaults |
| Dream cycle завершился с "no_data" | `.keysarium/memory/` не существует | Сначала соберите reward-данные через пайплайн |
| Слишком много dream-файлов | Ретенция не сработала | `/dream clear` принудительно очистит до 10 файлов |
