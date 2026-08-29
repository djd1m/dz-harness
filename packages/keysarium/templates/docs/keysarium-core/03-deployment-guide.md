# Руководство по развёртыванию @dzhechkov/keysarium-core

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Установка](#2-установка)
3. [Конфигурация](#3-конфигурация)
4. [Первый запуск](#4-первый-запуск)
5. [Интеграция в существующий проект](#5-интеграция-в-существующий-проект)
6. [Верификация установки](#6-верификация-установки)
7. [Обновление](#7-обновление)
8. [Удаление](#8-удаление)

---

## 1. Предварительные требования

Перед установкой убедитесь, что на вашей машине присутствуют следующие инструменты.

### 1.1. Node.js >= 16.0.0

Node.js необходим для установки пакета через npm.

```bash
# Проверка версии
node --version
# Ожидаемый вывод: v16.x.x или выше (рекомендуется v20+)

npm --version
# Ожидаемый вывод: 8.x.x или выше
```

Если Node.js не установлен, используйте nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### 1.2. npm или yarn

Любой из двух пакетных менеджеров подходит для установки. npm поставляется вместе с Node.js. Для yarn:

```bash
npm install -g yarn
yarn --version
```

### 1.3. sha256sum или shasum (для witness chain)

Модуль верификации (`verification/witness-chain.md`) использует SHA-256 для построения хеш-цепочки. Убедитесь, что одна из утилит доступна:

```bash
# Linux (обычно предустановлен)
sha256sum --version

# macOS (shasum предустановлен)
shasum -a 256 --version

# Проверка доступности любой из двух
if command -v sha256sum &>/dev/null; then
  echo "sha256sum доступен"
elif command -v shasum &>/dev/null; then
  echo "shasum доступен"
else
  echo "ОШИБКА: SHA-256 утилита не найдена"
fi
```

Если ни одна утилита не найдена (редкий случай), установите coreutils:

```bash
# Ubuntu/Debian
sudo apt install coreutils

# macOS (shasum входит в стандартную поставку)
```

### 1.4. AI-платформа

keysarium-core -- протокольный фреймворк для AI-агентов. Для его использования нужна одна из платформ:

| Платформа | Установка | Примечание |
|-----------|-----------|------------|
| Claude Code CLI | `npm install -g @anthropic-ai/claude-code` | Нативная поддержка |
| Cursor | [cursor.sh](https://cursor.sh) | Через `/init-platform --platform cursor` |
| OpenCode | [opencode.dev](https://opencode.dev) | Через `/init-platform --platform opencode` |
| GitHub Copilot | Расширение VS Code | Через `/init-platform --platform copilot` |

---

## 2. Установка

### 2.1. Как npm-зависимость (standalone)

Установка только ядра -- для создания собственного пайплайна:

```bash
npm install @dzhechkov/keysarium-core
```

### 2.2. Совместно с Keysarium (исследовательский пайплайн)

Для работы с 7-фазным пайплайном AI-исследований:

```bash
npm install @dzhechkov/keysarium @dzhechkov/keysarium-core
```

### 2.3. Совместно с BTO (оценка и оптимизация)

Для мульти-агентной оценки скиллов и артефактов:

```bash
npm install @dzhechkov/skills-bto @dzhechkov/keysarium-core
```

### 2.4. Совместно с Feature ADR (разработка фич)

Для адаптивной разработки фич с 9-шаговым пайплайном:

```bash
npm install @dzhechkov/skills-feature-adr @dzhechkov/keysarium-core
```

### 2.5. Из Git-репозитория

Если вам нужна последняя версия из исходников:

```bash
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub/packages/@dzhechkov/keysarium-core/

# Проверка содержимого
ls -la
# Ожидаемые директории: governance/ memory/ orchestration/
#                       verification/ trust-tiers/ platform/
```

---

## 3. Конфигурация

keysarium-core использует файловую конфигурацию в директории `.keysarium/`. Все файлы создаются автоматически при первом обращении, но вы можете настроить их заранее.

### 3.1. Memory -- `.keysarium/memory/config.json`

Управляет протоколом `memory_query()` / `memory_store()`:

```json
{
  "version": "1.0",
  "retention_days": 90,
  "max_results_per_query": 10,
  "enabled": true,
  "known_domains": [],
  "reward_levels": {
    "excellent": 1.0,
    "good": 0.7,
    "needs_work": 0.3,
    "failed": 0.0
  }
}
```

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `retention_days` | 90 | Срок хранения записей (0 -- хранить вечно) |
| `max_results_per_query` | 10 | Максимум результатов в `memory_query()` |
| `enabled` | true | Включить/выключить подсистему памяти |
| `reward_levels` | см. выше | Шкала оценок от failed (0.0) до excellent (1.0) |

### 3.2. Workers -- `.keysarium/workers/registry.json`

Управляет фоновыми воркерами:

```json
{
  "version": "1.0",
  "max_concurrent": 3,
  "active_workers": []
}
```

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `max_concurrent` | 3 | Максимум одновременно работающих воркеров |

### 3.3. Dream -- `.keysarium/insights/trigger-state.json`

Управляет триггерами dream cycle (фоновый анализ паттернов):

```json
{
  "version": "1.0",
  "records_since_last_dream": 0,
  "last_dream_timestamp": null,
  "triggers": {
    "time_threshold_hours": 168,
    "volume_threshold_records": 20
  },
  "events": []
}
```

| Параметр | По умолчанию | Описание |
|----------|-------------|----------|
| `time_threshold_hours` | 168 (7 дней) | Минимальное время между dream cycle |
| `volume_threshold_records` | 20 | Количество записей для автоматического триггера |

### 3.4. Trust Tiers

Тиры доверия настраиваются через метаданные в файлах `SKILL.md` каждого скилла. Специального файла конфигурации нет -- классификация определяется структурой скилла:

| Tier | Требования к структуре |
|------|----------------------|
| Tier 0 (Advisory) | Только `SKILL.md` |
| Tier 1 (Structured) | `SKILL.md` + `references/` или `modules/` |
| Tier 2 (Validated) | Tier 1 + оценка `/bto-test` >= 7.0 |
| Tier 3 (Verified) | Tier 2 + детерминистические eval-тесты |

### 3.5. Platform

Адаптеры платформ описаны в `platform/adapter-registry.md`. Шаблоны для генерации конфигов находятся в `platform/templates/`:

- `cursor.md` -- генерация `.cursorrules`
- `opencode.md` -- генерация `.opencode/`
- `copilot.md` -- генерация `.github/copilot-instructions.md`

---

## 4. Первый запуск

Пошаговое руководство для запуска вашего первого пайплайна на базе keysarium-core.

### Шаг 1. Установка пакета

```bash
mkdir my-pipeline && cd my-pipeline
npm init -y
npm install @dzhechkov/keysarium-core
```

### Шаг 2. Загрузка конституции

При старте пайплайна агент должен прочитать файл `governance/constitution.md` для загрузки универсальных инвариантов:

```
node_modules/@dzhechkov/keysarium-core/governance/constitution.md
```

Конституция определяет правила, которые никогда не могут быть нарушены (целостность артефактов, обязательность checkpoints, изоляция агентов).

### Шаг 3. Создание governance shards

Создайте shard-файлы для каждого этапа вашего пайплайна по протоколу из `governance/shard-protocol.md`. Пример shard-файла:

```markdown
# Stage: Data Collection

## Time Budget: 15%
## Skill: data-collector
## Prerequisites: none
## Quality Gate: all sources verified
## Promise Tag: DATA_COLLECTED
```

### Шаг 4. Определение promise tags

Назначьте каждому этапу свой promise tag по протоколу из `governance/checkpoint-protocol.md`:

| Этап | Promise Tag |
|------|-------------|
| Сбор данных | `DATA_COLLECTED` |
| Анализ | `ANALYSIS_COMPLETE` |
| Генерация отчёта | `REPORT_READY` |

### Шаг 5. Настройка памяти (опционально)

Создайте директорию и конфигурацию:

```bash
mkdir -p .keysarium/memory
cat > .keysarium/memory/config.json << 'EOF'
{
  "version": "1.0",
  "retention_days": 90,
  "max_results_per_query": 10,
  "enabled": true,
  "known_domains": [],
  "reward_levels": {
    "excellent": 1.0,
    "good": 0.7,
    "needs_work": 0.3,
    "failed": 0.0
  }
}
EOF
```

Если вы пропустите этот шаг, конфигурация будет создана автоматически при первом вызове `memory_store()`.

### Шаг 6. Запуск первого этапа пайплайна

Запустите AI-агента (Claude Code, Cursor и т.д.) в директории проекта. Агент должен:

1. Прочитать `constitution.md` -- загрузить инварианты
2. Прочитать shard текущего этапа -- загрузить правила этапа
3. Вызвать `memory_query()` -- загрузить исторические паттерны
4. Выполнить работу этапа
5. Показать checkpoint и дождаться подтверждения
6. Вызвать `memory_store()` с оценкой результата

### Шаг 7. Проверка witness chain

После завершения этапа убедитесь, что запись в хеш-цепочке создана:

```bash
# Проверка наличия файла цепочки
cat .witness-chain.json

# Ожидаемая структура (первый записанный этап):
# {
#   "chain": [
#     {
#       "sequence": 0,
#       "phase": "data-collection",
#       "artifact": "01_data_report.md",
#       "hash": "sha256:a1b2c3...",
#       "previous_hash": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
#       "timestamp": "2026-03-02T10:00:00Z",
#       "promise_tag": "DATA_COLLECTED"
#     }
#   ]
# }
```

---

## 5. Интеграция в существующий проект

### 5.1. Для Claude Code

Скопируйте протоколы в структуру `.claude/`:

```bash
# Скопировать governance shards
cp -r node_modules/@dzhechkov/keysarium-core/governance/ .claude/core/governance/

# Скопировать протоколы памяти
cp -r node_modules/@dzhechkov/keysarium-core/memory/ .claude/core/memory/

# Скопировать оркестрацию
cp -r node_modules/@dzhechkov/keysarium-core/orchestration/ .claude/core/orchestration/

# Скопировать верификацию
cp -r node_modules/@dzhechkov/keysarium-core/verification/ .claude/core/verification/
```

Затем добавьте в ваш `CLAUDE.md` ссылки на загрузку этих протоколов при старте пайплайна.

### 5.2. Для Cursor

Используйте генератор платформенных конфигов:

```bash
# В Claude Code
/init-platform --platform cursor
```

Это создаст файл `.cursorrules` на основе шаблона `platform/templates/cursor.md` с адаптированными протоколами keysarium-core.

### 5.3. Для OpenCode

```bash
/init-platform --platform opencode
```

Создаст директорию `.opencode/` с конфигурацией на основе `platform/templates/opencode.md`.

### 5.4. Для GitHub Copilot

```bash
/init-platform --platform copilot
```

Создаст файл `.github/copilot-instructions.md` на основе `platform/templates/copilot.md`.

---

## 6. Верификация установки

### 6.1. Проверка количества модулей

Пакет содержит 19 файлов протоколов (без учёта `package.json` и `README.md`):

```bash
# Подсчёт .md файлов в пакете
find node_modules/@dzhechkov/keysarium-core -name "*.md" | wc -l
# Ожидаемый результат: 19

# Или при установке из git:
find packages/@dzhechkov/keysarium-core -name "*.md" | wc -l
# Ожидаемый результат: 19
```

Распределение по модулям:

| Модуль | Файлов | Файлы |
|--------|--------|-------|
| governance | 3 | constitution.md, shard-protocol.md, checkpoint-protocol.md |
| memory | 3 | memory-protocol.md, reward-tracker.md, dream-engine.md |
| orchestration | 4 | queen-protocol.md, topology-selection.md, background-workers.md, model-routing.md |
| verification | 3 | witness-chain.md, judge-attestation.md, audit-trail.md |
| trust-tiers | 2 | tier-system.md, promotion-protocol.md |
| platform | 4 | adapter-registry.md, templates/cursor.md, templates/opencode.md, templates/copilot.md |

### 6.2. Проверка sha256sum

```bash
# Создайте тестовый файл и проверьте хеширование
echo "test witness chain" > /tmp/test-artifact.md

if command -v sha256sum &>/dev/null; then
  sha256sum /tmp/test-artifact.md
elif command -v shasum &>/dev/null; then
  shasum -a 256 /tmp/test-artifact.md
fi

# Ожидаемый результат: 64-символьный hex-хеш + имя файла
rm /tmp/test-artifact.md
```

### 6.3. Тест протокола памяти

Создайте тестовую запись и выполните запрос:

```bash
# Создание структуры
mkdir -p .keysarium/memory/test-domain/test-project

# Создание тестовой записи
cat > .keysarium/memory/test-domain/test-project/stage-0_20260302T120000Z.json << 'EOF'
{
  "version": "1.0",
  "stage": "stage-0",
  "domain": "test-domain",
  "project": "test-project",
  "reward": 1.0,
  "reward_label": "excellent",
  "promise_tag": "TEST_COMPLETE",
  "timestamp": "2026-03-02T12:00:00Z",
  "patterns_loaded": 0,
  "context": {
    "description": "Тестовая запись для верификации установки"
  }
}
EOF

# Проверка: файл создан и корректен
cat .keysarium/memory/test-domain/test-project/stage-0_20260302T120000Z.json

# Очистка после теста
rm -rf .keysarium/memory/test-domain/
```

### 6.4. Тест witness chain

```bash
# Создание тестового артефакта
echo "# Test Artifact" > /tmp/test-witness.md

# Вычисление хеша
if command -v sha256sum &>/dev/null; then
  HASH=$(sha256sum /tmp/test-witness.md | awk '{print $1}')
else
  HASH=$(shasum -a 256 /tmp/test-witness.md | awk '{print $1}')
fi

NULL_HASH="0000000000000000000000000000000000000000000000000000000000000000"

# Создание genesis-записи
cat > /tmp/test-chain.json << EOF
{
  "chain": [
    {
      "sequence": 0,
      "phase": "test",
      "artifact": "test-witness.md",
      "hash": "sha256:${HASH}",
      "previous_hash": "sha256:${NULL_HASH}",
      "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
      "promise_tag": "TEST_VERIFIED"
    }
  ]
}
EOF

# Проверка: цепочка создана
cat /tmp/test-chain.json

# Верификация: повторный хеш должен совпасть
if command -v sha256sum &>/dev/null; then
  VERIFY=$(sha256sum /tmp/test-witness.md | awk '{print $1}')
else
  VERIFY=$(shasum -a 256 /tmp/test-witness.md | awk '{print $1}')
fi

if [ "$HASH" = "$VERIFY" ]; then
  echo "Witness chain: верификация пройдена"
else
  echo "ОШИБКА: хеши не совпадают"
fi

# Очистка
rm /tmp/test-witness.md /tmp/test-chain.json
```

---

## 7. Обновление

### 7.1. Обновление через npm

```bash
npm update @dzhechkov/keysarium-core
```

Для обновления до конкретной версии:

```bash
npm install @dzhechkov/keysarium-core@latest
```

### 7.2. Проверка версии

Текущая версия указана в `index.md` (таблица Protocol Version History):

```bash
# Проверка версии пакета
cat node_modules/@dzhechkov/keysarium-core/package.json | grep '"version"'
# Ожидаемый вывод: "version": "1.0.0"

# Проверка версии протоколов
head -5 node_modules/@dzhechkov/keysarium-core/index.md
# Строка: > Manifest of all modules in @dzhechkov/keysarium-core v1.0.0
```

### 7.3. Совместимость схем

Все JSON-схемы в пакете содержат поле `"version": "1.0"`. При обновлении проверьте совместимость:

```bash
# Проверка версии схемы в ваших конфигурационных файлах
cat .keysarium/memory/config.json | grep '"version"'
# Должно совпадать с версией протокола в пакете
```

Если версия схемы в пакете изменилась (например, `"1.0"` -> `"2.0"`), прочтите CHANGELOG на предмет миграции. Мажорные изменения схем сопровождаются инструкцией по миграции.

### 7.4. Обновление из Git

```bash
cd dz-harness-hub
git fetch origin
git pull origin main

# Проверка обновлений в core
git log --oneline -5 -- packages/@dzhechkov/keysarium-core/
```

---

## 8. Удаление

### 8.1. Удаление npm-пакета

```bash
npm uninstall @dzhechkov/keysarium-core
```

Если keysarium-core установлен совместно с другими пакетами:

```bash
# Удаление всего стека
npm uninstall @dzhechkov/keysarium @dzhechkov/keysarium-core

# Или только BTO
npm uninstall @dzhechkov/skills-bto @dzhechkov/keysarium-core

# Или только Feature ADR
npm uninstall @dzhechkov/skills-feature-adr @dzhechkov/keysarium-core
```

### 8.2. Очистка рабочих данных

Директория `.keysarium/` содержит данные, накопленные в процессе работы: память, воркеры, инсайты. Если они больше не нужны:

```bash
# Просмотр содержимого перед удалением
du -sh .keysarium/
ls -la .keysarium/

# Удаление всех рабочих данных
rm -rf .keysarium/
```

> **Внимание:** Удаление `.keysarium/memory/` уничтожит все накопленные паттерны обучения. Если вы планируете использовать keysarium-core в будущем, рассмотрите экспорт через `/brain-export` перед удалением.

### 8.3. Удаление платформенных конфигов

Если вы генерировали конфиги через `/init-platform`, удалите их вручную:

```bash
# Cursor
rm -f .cursorrules

# OpenCode
rm -rf .opencode/

# GitHub Copilot
rm -f .github/copilot-instructions.md
```
