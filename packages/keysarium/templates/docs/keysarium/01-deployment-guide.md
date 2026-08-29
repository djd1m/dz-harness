# Руководство по развёртыванию Product Keysarium 2026

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Клонирование репозитория](#2-клонирование-репозитория)
3. [Настройка Claude Code](#3-настройка-claude-code)
4. [Проверка установки](#4-проверка-установки)
5. [Первое исследование — пошаговое руководство](#5-первое-исследование--пошаговое-руководство)
6. [Переменные окружения](#6-переменные-окружения)
7. [Сетевые требования](#7-сетевые-требования)
8. [Обновление скиллов](#8-обновление-скиллов)
9. [Многопользовательская настройка](#9-многопользовательская-настройка)
10. [Устранение неполадок](#10-устранение-неполадок)

---

## 1. Предварительные требования

Перед установкой убедитесь, что на вашей машине установлено следующее программное обеспечение.

### 1.1. Git

Git необходим для клонирования репозитория и управления версиями исследований.

```bash
# Проверка установки git
git --version
# Ожидаемый вывод: git version 2.x.x

# Установка на Ubuntu/Debian
sudo apt update && sudo apt install -y git

# Установка на macOS (через Homebrew)
brew install git

# Установка на Windows (через winget)
winget install Git.Git
```

### 1.2. Node.js 18+

Node.js необходим для работы Claude Code CLI.

```bash
# Проверка версии Node.js
node --version
# Ожидаемый вывод: v18.x.x или выше (рекомендуется v20+)

# Проверка версии npm
npm --version
# Ожидаемый вывод: 9.x.x или выше

# Установка через nvm (рекомендуемый способ)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20

# Установка на Ubuntu/Debian (через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка на macOS
brew install node@20
```

### 1.3. Claude Code CLI

Claude Code -- это официальный CLI-инструмент от Anthropic для работы с Claude.

```bash
# Установка Claude Code CLI глобально
npm install -g @anthropic-ai/claude-code

# Проверка установки
claude --version

# Если возникает ошибка прав доступа при глобальной установке
sudo npm install -g @anthropic-ai/claude-code
# Либо настройте npm prefix:
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

### 1.4. API-ключ Anthropic

Для работы Claude Code необходим API-ключ Anthropic.

1. Перейдите на [console.anthropic.com](https://console.anthropic.com)
2. Зарегистрируйте аккаунт или войдите в существующий
3. Перейдите в раздел **API Keys**
4. Нажмите **Create Key**
5. Скопируйте ключ (он начинается с `sk-ant-`)
6. Сохраните ключ в безопасном месте -- он показывается только один раз

> **Важно:** Для полного пайплайна одного исследования потребуется примерно 500K--1M токенов. Убедитесь, что на вашем аккаунте достаточно кредитов. Подробнее см. [04-infrastructure-requirements.md](./04-infrastructure-requirements.md).

### 1.5. Python 3.8+ (опционально)

Python необходим только для скриптов ed25519-верификации в фазе Research.

```bash
# Проверка установки Python
python3 --version

# Установка зависимостей для ed25519-верификации
pip install cryptography pynacl --break-system-packages

# Либо через виртуальное окружение (рекомендуется)
python3 -m venv .venv
source .venv/bin/activate
pip install cryptography pynacl
```

---

## 2. Клонирование репозитория

### 2.1. Стандартное клонирование

```bash
# Клонирование по HTTPS
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub

# Либо по SSH (если настроены SSH-ключи)
git clone git@github.com:djd1m/dz-harness-hub.git
cd dz-harness-hub
```

### 2.2. Проверка структуры

После клонирования убедитесь, что структура репозитория корректна:

```bash
# Проверка ключевых директорий и файлов
ls -la
# Ожидаемые файлы и директории:
#   CLAUDE.md
#   TOOLKIT_HARVEST.md
#   .claude/
#   researches/
#   docs/

# Проверка скиллов
ls .claude/skills/
# Ожидаемый вывод:
#   bto/
#   explore/
#   feature-adr/
#   frontend-design/
#   goap-research-ed25519/
#   presentation-storyteller/
#   problem-solver-enhanced/
#   reverse-engineering-unicorn/

# Проверка slash-команд
ls .claude/commands/
# Ожидаемый вывод (основные команды):
#   casarium.md, new-research.md, parallel-research.md
#   discovery.md, explore-case.md, research.md
#   cjm-prototype.md, solve.md, architecture-phase.md
#   presentation.md, harvest.md
#   brain-export.md, brain-import.md
#   bto.md, bto-build.md, bto-test.md, bto-optimize.md
#   feature-adr.md, init-platform.md
#   workers.md, dream.md, learning-stats.md, verify-chain.md
```

---

## 3. Настройка Claude Code

### 3.1. Настройка API-ключа

Установите API-ключ Anthropic в переменную окружения:

```bash
# Временная установка (для текущей сессии)
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ-здесь"

# Постоянная установка (добавьте в ~/.bashrc или ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-ваш-ключ-здесь"' >> ~/.bashrc
source ~/.bashrc

# Для macOS (zsh)
echo 'export ANTHROPIC_API_KEY="sk-ant-ваш-ключ-здесь"' >> ~/.zshrc
source ~/.zshrc
```

> **Безопасность:** Никогда не коммитьте API-ключ в репозиторий. Файл `.env` уже добавлен в `.gitignore`. Вы также можете использовать файл `.env` в корне проекта:

```bash
# Создание файла .env (не коммитится в git)
echo 'ANTHROPIC_API_KEY=sk-ant-ваш-ключ-здесь' > .env
```

### 3.2. Настройка модели (опционально)

Claude Code по умолчанию использует модель Claude Sonnet. Для более глубокого анализа можно переключиться на Claude Opus:

```bash
# Установка модели через переменную окружения
export CLAUDE_MODEL="claude-sonnet-4-20250514"

# Или для Opus (больше токенов, глубже анализ)
export CLAUDE_MODEL="claude-opus-4-20250514"
```

### 3.3. Первый запуск

```bash
# Перейдите в директорию проекта
cd dz-harness-hub

# Запустите Claude Code
claude

# Claude Code автоматически прочитает CLAUDE.md и загрузит контекст проекта
# Вы увидите приглашение к вводу
```

---

## 4. Проверка установки

### 4.1. Базовая проверка

```bash
# 1. Запустите Claude Code в директории проекта
cd dz-harness-hub
claude

# 2. В интерфейсе Claude Code выполните:
/new-research test

# Ожидаемый результат:
# ═══════════════════════════════════════════════════════
# Исследование создано: researches/test/
#
# Для запуска полного пайплайна:
#   /casarium [текст кейса]
#
# Для запуска отдельных фаз:
#   /discovery, /explore-case, /research, /cjm-prototype,
#   /solve, /architecture-phase, /presentation
#
# Все артефакты будут сохранены в researches/test/
# ═══════════════════════════════════════════════════════
```

### 4.2. Проверка созданной структуры

```bash
# Проверьте, что директория исследования создана
ls researches/test/
# Ожидаемый вывод:
#   README.md
#   prototype/
#   diagrams/

# Проверьте содержимое README
cat researches/test/README.md
```

### 4.3. Удаление тестового исследования

```bash
# После проверки удалите тестовое исследование
rm -rf researches/test/
```

### 4.4. Проверка доступности slash-команд

В интерфейсе Claude Code введите `/` и нажмите Tab для просмотра доступных команд. Должны отображаться:

- `/casarium` -- полный пайплайн (7 фаз)
- `/new-research` -- создание нового исследования
- `/parallel-research` -- параллельный запуск нескольких кейсов
- `/discovery` -- Phase 0: Product Discovery
- `/explore-case` -- Phase 1: Explore Case
- `/research` -- Phase 2: Research
- `/cjm-prototype` -- Phase 2.5: CJM Prototype
- `/solve` -- Phase 3: Solve
- `/architecture-phase` -- Phase 4: Architecture
- `/presentation` -- Phase 5: Presentation
- `/harvest` -- извлечение знаний
- `/brain-export`, `/brain-import` -- портативные знания
- `/feature-adr` -- адаптивная разработка фич (9 шагов)
- `/bto`, `/bto-build`, `/bto-test`, `/bto-optimize` -- Build-Test-Optimize
- `/init-platform` -- мульти-платформенная генерация конфигов
- `/workers` -- управление фоновыми воркерами
- `/dream` -- Dream Cycles (анализ паттернов)
- `/learning-stats` -- аналитика обучения
- `/verify-chain` -- верификация witness chain

---

## 5. Первое исследование -- пошаговое руководство

### 5.1. Подготовка текста кейса

Подготовьте описание кейса для исследования. Пример:

```
Крупный российский банк хочет автоматизировать работу контакт-центра
с помощью AI. Ежемесячно обрабатывается 2 млн обращений, среднее
время обработки — 8 минут. Цель: сократить время обработки на 40%
и повысить CSAT с 72% до 85%. Бюджет: 50 млн руб., срок: 6 месяцев.
Ограничения: ФЗ-152, данные не могут покидать контур банка.
```

### 5.2. Запуск полного пайплайна

```bash
# Запустите Claude Code
cd dz-harness-hub
claude

# Запустите полный пайплайн
/casarium Крупный российский банк хочет автоматизировать работу контакт-центра с помощью AI. Ежемесячно обрабатывается 2 млн обращений, среднее время обработки — 8 минут. Цель: сократить время обработки на 40% и повысить CSAT с 72% до 85%. Бюджет: 50 млн руб., срок: 6 месяцев. Ограничения: ФЗ-152, данные не могут покидать контур банка.
```

### 5.3. Прохождение фаз

Пайплайн проведёт вас через 7 фаз. После каждой фазы вы увидите Checkpoint:

```
═══════════════════════════════════════════════════════
CHECKPOINT 0: Product Discovery Complete
[Сводка результатов]
Файл: 00_product_discovery.md
• "ок" — следующая фаза
• "углуби [раздел]" — доработать
═══════════════════════════════════════════════════════
```

**Доступные команды на каждом Checkpoint:**

| Команда | Действие |
|---------|----------|
| `ок` | Перейти к следующей фазе |
| `углуби [раздел]` | Доработать конкретный аспект |
| `превью [X]` | Просмотреть документ |
| `время [N]` | Установить общий тайминг (часов) |
| `ускорь` | Быстрый режим текущей фазы |
| `wow` | Добавить нестандартный элемент |
| `выбираю A/B/C/D` | Выбрать вариант CJM (Phase 2.5) |
| `объедини A+D` | Создать гибрид CJM (Phase 2.5) |

### 5.4. Ожидаемые артефакты

По завершении пайплайна в директории `researches/<slug>/` будут созданы:

```
researches/bank_kc_automation/
├── 00_product_discovery.md         # Phase 0: JTBD, конкуренты, ROI
├── 01_case_brief.md                # Phase 1: Бриф кейса
├── 02_research_findings.md         # Phase 2: Результаты исследования
├── 02.5_trend_brief.md             # Phase 2.5: Тренды и CJM
├── 03_solution_strategy.md         # Phase 3: Стратегия решения
├── 04_architecture.md              # Phase 4: Архитектура
├── 05_presentation_content.md      # Phase 5: Контент презентации
├── 06_speaker_script.md            # Phase 5: Скрипт спикера
├── 07_qa_preparation.md            # Phase 5: Подготовка к Q&A
├── 08_executive_summary.md         # Phase 5: Executive Summary
├── prototype/
│   └── cjm-prototype.jsx          # Phase 2.5: Прототип CJM
├── diagrams/
│   ├── architecture-c4.mermaid    # Phase 4: C4-диаграмма
│   ├── sequence-main-flow.mermaid # Phase 4: Sequence-диаграмма
│   ├── process-as-is.mermaid      # Phase 3: Процесс AS-IS
│   └── process-to-be.mermaid      # Phase 3: Процесс TO-BE
└── README.md                       # Phase 6: Итоговый README
```

### 5.5. Запуск отдельных фаз

Если вам нужно запустить только конкретную фазу:

```bash
# Сначала создайте исследование
/new-research Автоматизация контакт-центра банка

# Затем запустите нужную фазу
/discovery
# После checkpoint: ок
/explore-case
# И так далее...
```

### 5.6. Извлечение знаний после завершения

```bash
# Запустите harvest для конкретного исследования
/harvest researches/bank_kc_automation/

# Или для всех исследований
/harvest all
```

---

## 6. Переменные окружения

| Переменная | Обязательная | Описание | Пример |
|------------|-------------|----------|--------|
| `ANTHROPIC_API_KEY` | Да | API-ключ Anthropic | `sk-ant-api03-...` |
| `CLAUDE_MODEL` | Нет | Модель Claude для использования | `claude-sonnet-4-20250514` |
| `CLAUDE_MAX_TURNS` | Нет | Максимальное число шагов агента | `100` |
| `HTTPS_PROXY` | Нет | Прокси для HTTPS-соединений | `http://proxy:8080` |
| `HTTP_PROXY` | Нет | Прокси для HTTP-соединений | `http://proxy:8080` |
| `NO_PROXY` | Нет | Домены, исключённые из проксирования | `localhost,127.0.0.1` |

### Пример файла .env

```bash
# /home/user/dz-harness-hub/.env
# Этот файл НЕ коммитится в git

ANTHROPIC_API_KEY=sk-ant-api03-ваш-ключ-здесь
CLAUDE_MODEL=claude-sonnet-4-20250514
```

---

## 7. Сетевые требования

### 7.1. Обязательный доступ

Claude Code требует доступ к API Anthropic через интернет:

| Сервис | Хост | Порт | Протокол | Назначение |
|--------|------|------|----------|------------|
| Anthropic API | `api.anthropic.com` | 443 | HTTPS | Основной API |
| Anthropic Auth | `auth.anthropic.com` | 443 | HTTPS | Аутентификация |

### 7.2. Доступ для фаз исследования

Фазы Research (Phase 2) и Discovery (Phase 0) используют веб-поиск для сбора данных:

| Сервис | Назначение | Фаза |
|--------|------------|------|
| Поисковые системы | Поиск аналогов, конкурентов, трендов | Phase 0, 2 |
| Новостные сайты | Актуальные данные по рынку | Phase 0, 2 |
| Академические базы | Научные публикации | Phase 2 |
| GitHub | Код и документация open-source решений | Phase 2, 4 |

### 7.3. Работа через корпоративный прокси

```bash
# Настройка прокси
export HTTPS_PROXY="http://corporate-proxy.example.com:8080"
export HTTP_PROXY="http://corporate-proxy.example.com:8080"
export NO_PROXY="localhost,127.0.0.1"

# Настройка прокси для git (если требуется)
git config --global http.proxy "http://corporate-proxy.example.com:8080"
git config --global https.proxy "http://corporate-proxy.example.com:8080"

# Настройка прокси для npm (если требуется)
npm config set proxy "http://corporate-proxy.example.com:8080"
npm config set https-proxy "http://corporate-proxy.example.com:8080"
```

### 7.4. Офлайн-режим

Без доступа к интернету:
- Фазы Phase 0 (Discovery) и Phase 2 (Research) будут ограничены -- веб-поиск недоступен
- Фазы Phase 1, 2.5, 3, 4, 5 работают полностью на основе уже собранных данных
- API Anthropic **обязателен** для всех фаз -- полностью офлайн режим невозможен

---

## 8. Обновление скиллов

### 8.1. Обновление из основного репозитория

```bash
cd dz-harness-hub

# Получить последние изменения
git fetch origin

# Обновить текущую ветку
git pull origin main

# Проверить обновлённые скиллы
ls -la .claude/skills/
```

### 8.2. Структура скиллов

Каждый скилл -- это директория в `.claude/skills/` со следующей структурой:

```
.claude/skills/<skill-name>/
├── SKILL.md              # Основной файл инструкций (обязателен)
├── references/           # Справочные материалы
│   ├── *.md              # Документация и шаблоны
│   └── ...
├── examples/             # Примеры использования (если есть)
│   └── *.md
└── modules/              # Модули скилла (если есть)
    └── *.md
```

### 8.3. Добавление кастомных скиллов

```bash
# Создайте директорию для нового скилла
mkdir -p .claude/skills/my-custom-skill/references

# Создайте основной файл SKILL.md
cat > .claude/skills/my-custom-skill/SKILL.md << 'EOF'
# My Custom Skill

## Описание
Описание вашего скилла...

## Инструкции
Инструкции для Claude Code...
EOF

# Обновите ссылку в CLAUDE.md при необходимости
```

### 8.4. Обновление slash-команд

Slash-команды хранятся в `.claude/commands/` и загружаются автоматически при запуске Claude Code:

```bash
# Проверка доступных команд
ls .claude/commands/

# Обновление команды — просто отредактируйте файл
nano .claude/commands/casarium.md
```

---

## 9. Многопользовательская настройка

### 9.1. Принцип изоляции

Каждый пользователь работает со своей **собственной копией** репозитория. Это обеспечивает:

- Изоляцию исследований между участниками
- Независимые API-ключи
- Отсутствие конфликтов при параллельной работе

### 9.2. Настройка для команды

```bash
# === Пользователь 1 (Алиса) ===
git clone https://github.com/djd1m/dz-harness-hub.git ~/alice-keysarium
cd ~/alice-keysarium
export ANTHROPIC_API_KEY="sk-ant-alice-key"
claude

# === Пользователь 2 (Борис) ===
git clone https://github.com/djd1m/dz-harness-hub.git ~/boris-keysarium
cd ~/boris-keysarium
export ANTHROPIC_API_KEY="sk-ant-boris-key"
claude

# === Пользователь 3 (Вера) ===
git clone https://github.com/djd1m/dz-harness-hub.git ~/vera-keysarium
cd ~/vera-keysarium
export ANTHROPIC_API_KEY="sk-ant-vera-key"
claude
```

### 9.3. Общий API-ключ для команды

Если команда использует один API-ключ, учитывайте:

- **Rate limits:** Anthropic API имеет ограничения по числу запросов в минуту
- **Стоимость:** Один полный пайплайн потребляет ~500K-1M токенов
- **Параллельность:** При одновременной работе нескольких пользователей возможны задержки из-за rate limits

```bash
# Рекомендация: создайте общий .env файл и скопируйте каждому пользователю
cat > /shared/keysarium.env << 'EOF'
ANTHROPIC_API_KEY=sk-ant-team-key
CLAUDE_MODEL=claude-sonnet-4-20250514
EOF

# Каждый пользователь копирует к себе
cp /shared/keysarium.env ~/my-keysarium/.env
```

### 9.4. Объединение результатов

После завершения параллельных исследований результаты можно собрать:

```bash
# Скопировать исследование Алисы в общий репозиторий
cp -r ~/alice-keysarium/researches/bank_case/ ~/shared-results/alice_bank_case/

# Скопировать исследование Бориса
cp -r ~/boris-keysarium/researches/retail_case/ ~/shared-results/boris_retail_case/

# Или используйте git для слияния через отдельные ветки
cd ~/alice-keysarium
git checkout -b alice/bank-case
git add researches/bank_case/
git commit -m "Исследование: автоматизация КЦ банка"
git push origin alice/bank-case
```

---

## 10. Устранение неполадок

### 10.1. Claude Code не запускается

```bash
# Проблема: command not found: claude
# Решение: убедитесь, что Claude Code установлен глобально
npm list -g @anthropic-ai/claude-code

# Если не установлен:
npm install -g @anthropic-ai/claude-code

# Если npm bin не в PATH:
export PATH="$(npm config get prefix)/bin:$PATH"
```

### 10.2. Ошибка аутентификации API

```bash
# Проблема: 401 Unauthorized
# Проверьте, что API-ключ установлен
echo $ANTHROPIC_API_KEY
# Должен выводить: sk-ant-...

# Проверьте, что ключ валиден (тестовый запрос)
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"test"}]}' \
  | head -c 200
```

### 10.3. Slash-команды не видны

```bash
# Проблема: /casarium не распознаётся
# Убедитесь, что вы в корневой директории проекта
pwd
# Должен быть: /path/to/dz-harness-hub

# Проверьте наличие файлов команд
ls .claude/commands/
# Должны быть: casarium.md, new-research.md, и т.д.

# Перезапустите Claude Code
# Выйдите из текущей сессии и запустите заново
claude
```

### 10.4. Ошибки сети / таймауты

```bash
# Проблема: Network error / Timeout
# Проверьте подключение к API
curl -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/v1/messages

# Если используете прокси, проверьте настройки
echo $HTTPS_PROXY
echo $HTTP_PROXY

# Увеличьте таймаут (если поддерживается)
export CLAUDE_API_TIMEOUT=120000
```

### 10.5. Исследование прервалось на середине

Если пайплайн прервался (потеря соединения, закрытие терминала):

```bash
# 1. Проверьте, какие артефакты уже созданы
ls researches/<slug>/

# 2. Запустите Claude Code заново
claude

# 3. Продолжите с нужной фазы
# Например, если Phase 0-2 выполнены, запустите Phase 2.5:
/cjm-prototype
```

### 10.6. Недостаточно токенов / кредитов

```bash
# Проблема: Insufficient credits / Rate limit exceeded

# Проверьте баланс на console.anthropic.com
# Рекомендации по экономии токенов:
# 1. Используйте Claude Sonnet вместо Opus для менее критичных фаз
# 2. Используйте команду "ускорь" для Quick Mode
# 3. Запускайте отдельные фазы вместо полного пайплайна
```

### 10.7. Python-зависимости для ed25519

```bash
# Проблема: ModuleNotFoundError: No module named 'cryptography'
pip install cryptography pynacl

# Если нет pip:
sudo apt install python3-pip  # Ubuntu/Debian
brew install python3           # macOS

# Проверка установки
python3 -c "from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey; print('OK')"
```

### 10.8. Нехватка места на диске

```bash
# Каждое исследование занимает ~50 МБ
# Проверьте свободное место
df -h .

# Очистите завершённые исследования
# ВНИМАНИЕ: убедитесь, что данные уже сохранены/извлечены
du -sh researches/*/
# Удалите ненужные
rm -rf researches/old_research/
```

### 10.9. Windows: запуск через WSL2

```bash
# 1. Установите WSL2
wsl --install

# 2. Запустите Ubuntu в WSL
wsl

# 3. Установите Node.js внутри WSL
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20

# 4. Установите Claude Code
npm install -g @anthropic-ai/claude-code

# 5. Клонируйте репозиторий и работайте как в Linux
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"
claude
```

---

## Быстрая шпаргалка

```bash
# Полная установка за 5 минут:
npm install -g @anthropic-ai/claude-code          # 1. Установка CLI
git clone <repo-url> && cd dz-harness-hub  # 2. Клонирование
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"         # 3. API-ключ
claude                                              # 4. Запуск
/new-research test                                  # 5. Проверка
/casarium [текст кейса]                             # 6. Работа!
/feature-adr [описание фичи]                    # 7. Разработка фич
/bto-test .claude/skills/my-skill/               # 8. Оценка скилла
```
