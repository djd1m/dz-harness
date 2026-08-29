# Требования к инфраструктуре Product Keysarium 2026

## Содержание

1. [Обзор](#1-обзор)
2. [Аппаратные требования](#2-аппаратные-требования)
3. [Программное обеспечение](#3-программное-обеспечение)
4. [Сетевые требования](#4-сетевые-требования)
5. [API и аутентификация](#5-api-и-аутентификация)
6. [Хранилище данных](#6-хранилище-данных)
7. [Поддерживаемые операционные системы](#7-поддерживаемые-операционные-системы)
8. [Опциональные компоненты](#8-опциональные-компоненты)
9. [Облачные варианты развёртывания](#9-облачные-варианты-развёртывания)
10. [CI/CD и автоматизация](#10-cicd-и-автоматизация)
11. [Оценка стоимости](#11-оценка-стоимости)
12. [Масштабирование и лимиты](#12-масштабирование-и-лимиты)
13. [Чеклист готовности](#13-чеклист-готовности)

---

## 1. Обзор

Product Keysarium 2026 -- это интерактивный инструмент на базе Claude Code CLI, предназначенный для проведения AI-исследований на кейсариумах и хакатонах. Система не требует серверной инфраструктуры: вся работа выполняется локально на машине пользователя, а вычисления делегируются в Anthropic API через облако.

### Архитектурная схема

```
┌─────────────────────────────────────────────────┐
│           Машина пользователя                   │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │  Claude Code CLI                          │  │
│  │  ├── .claude/commands/ (slash-команды)     │  │
│  │  ├── .claude/skills/   (скиллы)           │  │
│  │  └── researches/       (артефакты)        │  │
│  └──────────────┬────────────────────────────┘  │
│                 │ HTTPS (443)                    │
└─────────────────┼───────────────────────────────┘
                  │
          ┌───────▼───────┐     ┌──────────────────┐
          │ Anthropic API │     │  Веб (поиск,     │
          │ (LLM)         │     │  источники)      │
          └───────────────┘     └──────────────────┘
```

---

## 2. Аппаратные требования

### 2.1. Минимальные требования

| Компонент | Минимум | Рекомендуется | Примечание |
|-----------|---------|---------------|------------|
| **CPU** | 2 ядра | 4+ ядра | Многоядерность важна для Agent Swarm |
| **RAM** | 4 ГБ | 8+ ГБ | Node.js + Claude Code + браузер |
| **Диск** | 1 ГБ свободно | SSD, 5+ ГБ | HDD значительно замедляет I/O операции |
| **Экран** | 80x24 терминал | Широкий терминал 120+ символов | Для удобного чтения Checkpoint-ов |

### 2.2. Оптимальная конфигурация

Для комфортной работы на кейсариуме/хакатоне рекомендуется:

```
CPU:      4+ ядер (Intel i5/i7/AMD Ryzen 5/7 или Apple M1+)
RAM:      16 ГБ (параллельные агенты + браузер + IDE)
Диск:     SSD NVMe, 10+ ГБ свободно
Сеть:     Стабильный интернет 10+ Мбит/с
Терминал: iTerm2 / Windows Terminal / Alacritty
```

### 2.3. Почему SSD важен

Claude Code активно работает с файловой системой:
- Чтение SKILL.md файлов при каждой фазе (~30 файлов)
- Создание и обновление артефактов исследования (~15-20 файлов)
- Работа с git для версионирования
- На HDD эти операции могут добавлять 2-5 секунд на каждое обращение к диску

---

## 3. Программное обеспечение

### 3.1. Обязательное ПО

| Компонент | Версия | Команда проверки | Назначение |
|-----------|--------|------------------|------------|
| **Node.js** | 18+ (рекомендуется 20+) | `node --version` | Среда выполнения Claude Code |
| **npm** | 9+ | `npm --version` | Менеджер пакетов |
| **git** | 2.20+ | `git --version` | Управление версиями |
| **Claude Code CLI** | Актуальная | `claude --version` | Основной инструмент |

### 3.2. Установка обязательного ПО

```bash
# === Node.js через nvm (рекомендуемый способ) ===
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc   # или source ~/.zshrc для macOS
nvm install 20
nvm use 20
node --version     # v20.x.x

# === Git ===
# Ubuntu/Debian
sudo apt update && sudo apt install -y git

# macOS
brew install git

# === Claude Code CLI ===
npm install -g @anthropic-ai/claude-code
claude --version
```

### 3.3. Проверка всех зависимостей одной командой

```bash
#!/bin/bash
# check-deps.sh — проверка всех зависимостей

echo "=== Проверка зависимостей Product Keysarium 2026 ==="
echo ""

# Node.js
if command -v node &> /dev/null; then
    NODE_VER=$(node --version)
    NODE_MAJOR=$(echo $NODE_VER | cut -d. -f1 | tr -d 'v')
    if [ "$NODE_MAJOR" -ge 18 ]; then
        echo "[OK] Node.js $NODE_VER"
    else
        echo "[!!] Node.js $NODE_VER — требуется v18+"
    fi
else
    echo "[FAIL] Node.js не установлен"
fi

# npm
if command -v npm &> /dev/null; then
    echo "[OK] npm $(npm --version)"
else
    echo "[FAIL] npm не установлен"
fi

# git
if command -v git &> /dev/null; then
    echo "[OK] git $(git --version | awk '{print $3}')"
else
    echo "[FAIL] git не установлен"
fi

# Claude Code
if command -v claude &> /dev/null; then
    echo "[OK] Claude Code $(claude --version 2>/dev/null || echo 'установлен')"
else
    echo "[FAIL] Claude Code не установлен (npm install -g @anthropic-ai/claude-code)"
fi

# API Key
if [ -n "$ANTHROPIC_API_KEY" ]; then
    echo "[OK] ANTHROPIC_API_KEY установлен (${ANTHROPIC_API_KEY:0:10}...)"
else
    echo "[!!] ANTHROPIC_API_KEY не установлен"
fi

# Python (опционально)
if command -v python3 &> /dev/null; then
    echo "[OK] Python $(python3 --version | awk '{print $2}') (опционально)"
    python3 -c "import cryptography" 2>/dev/null && echo "     [OK] cryptography установлен" || echo "     [--] cryptography не установлен (опционально)"
    python3 -c "import nacl" 2>/dev/null && echo "     [OK] pynacl установлен" || echo "     [--] pynacl не установлен (опционально)"
else
    echo "[--] Python не установлен (опционально, для ed25519)"
fi

echo ""
echo "=== Проверка завершена ==="
```

Сохраните и запустите:

```bash
chmod +x check-deps.sh
./check-deps.sh
```

---

## 4. Сетевые требования

### 4.1. Обязательные сетевые подключения

| Сервис | Домен | Порт | Протокол | Трафик (на исследование) |
|--------|-------|------|----------|--------------------------|
| **Anthropic API** | `api.anthropic.com` | 443 | HTTPS/TLS 1.2+ | ~5-15 МБ |
| **Anthropic Auth** | `auth.anthropic.com` | 443 | HTTPS/TLS 1.2+ | ~100 КБ |

### 4.2. Требования к каналу связи

| Параметр | Минимум | Рекомендуется |
|----------|---------|---------------|
| **Скорость (download)** | 1 Мбит/с | 10+ Мбит/с |
| **Скорость (upload)** | 0.5 Мбит/с | 5+ Мбит/с |
| **Латентность до API** | < 500 мс | < 100 мс |
| **Стабильность** | Допускаются кратковременные разрывы | Стабильное соединение |

### 4.3. Сетевые подключения для фаз исследования

Фазы Discovery (Phase 0) и Research (Phase 2) используют веб-поиск. Это требует дополнительного доступа:

| Категория | Примеры доменов | Фазы |
|-----------|----------------|------|
| **Поисковые системы** | google.com, bing.com | Phase 0, 2 |
| **Новости и аналитика** | reuters.com, bloomberg.com, rbc.ru | Phase 0, 2 |
| **Академические** | arxiv.org, scholar.google.com, pubmed.gov | Phase 2 |
| **Технические** | github.com, stackoverflow.com | Phase 2, 4 |
| **Бизнес-данные** | crunchbase.com, pitchbook.com | Phase 0 |
| **Регуляторные** | cbr.ru (ЦБ), consultant.ru, garant.ru | Phase 2 (банки) |

### 4.4. Корпоративный файрвол

Если вы работаете из корпоративной сети, убедитесь, что следующие домены разрешены:

```
# Обязательные (без них инструмент не работает)
api.anthropic.com:443
auth.anthropic.com:443

# Рекомендуемые (для полноценного исследования)
*.google.com:443
*.bing.com:443
github.com:443
*.githubusercontent.com:443
```

### 4.5. Настройка прокси

```bash
# HTTP/HTTPS прокси
export HTTPS_PROXY="http://proxy.company.com:8080"
export HTTP_PROXY="http://proxy.company.com:8080"
export NO_PROXY="localhost,127.0.0.1,.internal.company.com"

# SOCKS5 прокси (если поддерживается)
export HTTPS_PROXY="socks5://proxy.company.com:1080"

# Прокси с аутентификацией
export HTTPS_PROXY="http://user:password@proxy.company.com:8080"
```

### 4.6. Оценка трафика

| Фаза | Трафик API (приблизительно) | Трафик веб-поиска |
|------|---------------------------|-------------------|
| Phase 0: Discovery | 1-2 МБ | 2-5 МБ |
| Phase 1: Explore | 0.5-1 МБ | --- |
| Phase 2: Research | 2-4 МБ | 5-15 МБ |
| Phase 2.5: CJM Proto | 1-2 МБ | 1-3 МБ |
| Phase 3: Solve | 1-2 МБ | --- |
| Phase 4: Architecture | 1-2 МБ | --- |
| Phase 5: Presentation | 2-3 МБ | --- |
| Phase 6: Packaging | 0.5 МБ | --- |
| **Итого** | **~9-16 МБ** | **~8-23 МБ** |

---

## 5. API и аутентификация

### 5.1. Получение API-ключа

1. Зарегистрируйтесь на [console.anthropic.com](https://console.anthropic.com)
2. Перейдите в раздел **Settings > API Keys**
3. Создайте новый ключ с описательным именем (например, `keysarium-2026-team`)
4. Скопируйте ключ (формат: `sk-ant-api03-...`)

### 5.2. Уровни API-доступа

| Tier | Лимит запросов/мин | Лимит токенов/мин | Подходит для |
|------|-------------------|-------------------|-------------|
| **Free** | 5 | 20,000 | Тестирование |
| **Build (Tier 1)** | 50 | 40,000 | 1 исследование |
| **Build (Tier 2)** | 1,000 | 80,000 | Команда 2-3 чел. |
| **Scale (Tier 3)** | 2,000 | 160,000 | Команда 5+ чел. |
| **Scale (Tier 4)** | 4,000 | 400,000 | Параллельные исследования |

> **Рекомендация для кейсариума/хакатона:** Tier 2 (Build) достаточен для одной команды из 2-3 человек, работающих последовательно. Для параллельных исследований (`/parallel-research`) рекомендуется Tier 3+.

### 5.3. Оценка потребления токенов на исследование

| Фаза | Input-токены | Output-токены | Всего токенов |
|------|-------------|---------------|--------------|
| Phase 0: Discovery | 50,000-80,000 | 15,000-25,000 | 65,000-105,000 |
| Phase 1: Explore | 20,000-30,000 | 5,000-10,000 | 25,000-40,000 |
| Phase 2: Research | 80,000-150,000 | 30,000-50,000 | 110,000-200,000 |
| Phase 2.5: CJM Proto | 40,000-70,000 | 20,000-35,000 | 60,000-105,000 |
| Phase 3: Solve | 50,000-80,000 | 20,000-30,000 | 70,000-110,000 |
| Phase 4: Architecture | 40,000-60,000 | 15,000-25,000 | 55,000-85,000 |
| Phase 5: Presentation | 60,000-100,000 | 40,000-60,000 | 100,000-160,000 |
| Phase 6: Packaging | 15,000-25,000 | 5,000-10,000 | 20,000-35,000 |
| **Итого** | **355,000-595,000** | **150,000-245,000** | **505,000-840,000** |

> **Среднее потребление:** ~650,000 токенов на одно полное исследование. С учётом итераций (`углуби`, повторные запуски) -- до 1,000,000 токенов.

### 5.4. Безопасность API-ключа

```bash
# НЕ ДЕЛАЙТЕ ТАК:
git add .env                    # Никогда не коммитьте .env
echo $ANTHROPIC_API_KEY         # Не выводите ключ в логи CI/CD

# ДЕЛАЙТЕ ТАК:
# 1. Используйте переменные окружения
export ANTHROPIC_API_KEY="sk-ant-..."

# 2. Или файл .env (он в .gitignore)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# 3. Или менеджер секретов
# macOS Keychain:
security add-generic-password -a "$USER" -s "anthropic-api-key" -w "sk-ant-..."
export ANTHROPIC_API_KEY=$(security find-generic-password -a "$USER" -s "anthropic-api-key" -w)

# Linux (GNOME Keyring через secret-tool):
secret-tool store --label="Anthropic API Key" service anthropic key api <<< "sk-ant-..."
export ANTHROPIC_API_KEY=$(secret-tool lookup service anthropic key api)
```

---

## 6. Хранилище данных

### 6.1. Размер одного исследования

```
Типичный размер артефактов одного исследования:

00_product_discovery.md         ~15-30 КБ
01_case_brief.md                ~5-10 КБ
02_research_findings.md         ~20-50 КБ
02.5_trend_brief.md             ~10-20 КБ
03_solution_strategy.md         ~15-30 КБ
04_architecture.md              ~10-25 КБ
05_presentation_content.md      ~10-20 КБ
06_speaker_script.md            ~8-15 КБ
07_qa_preparation.md            ~5-10 КБ
08_executive_summary.md         ~3-8 КБ
prototype/cjm-prototype.jsx    ~5-15 КБ
diagrams/*.mermaid (4 файла)   ~2-8 КБ
README.md                       ~3-5 КБ
─────────────────────────────────────────
Итого на исследование:         ~111-266 КБ (~150-300 КБ)
```

> **Примечание:** Фактический размер может быть больше, если фазы перезапускались с доработками или если исследование включает дополнительные артефакты. В среднем стоит закладывать **~50 МБ на исследование** с учётом git-истории, промежуточных файлов и кэша.

### 6.2. Размер репозитория

```
Базовый репозиторий (без исследований):   ~2-5 МБ
  .claude/skills/                          ~1-3 МБ
  .claude/commands/                        ~50-100 КБ
  Прочее (CLAUDE.md, docs, и т.д.)        ~100-500 КБ

С исследованиями:
  1 исследование:                          +50 МБ (с git-историей)
  5 исследований:                          +250 МБ
  10 исследований:                         +500 МБ
  20 исследований:                         +1 ГБ
```

### 6.3. Рекомендации по хранению

```bash
# Проверка текущего размера
du -sh .
du -sh researches/*/

# Архивирование завершённых исследований
tar -czf archive/bank_case_2026-03-01.tar.gz researches/bank_case/
rm -rf researches/bank_case/

# Git GC для оптимизации репозитория
git gc --aggressive --prune=now
```

---

## 7. Поддерживаемые операционные системы

### 7.1. Матрица совместимости

| ОС | Версия | Поддержка | Примечания |
|----|--------|-----------|------------|
| **Linux (Ubuntu)** | 20.04+ | Полная | Основная платформа разработки |
| **Linux (Debian)** | 11+ | Полная | |
| **Linux (Fedora)** | 36+ | Полная | |
| **Linux (Arch)** | Rolling | Полная | |
| **macOS** | 12+ (Monterey) | Полная | Intel и Apple Silicon |
| **Windows** | 10/11 | Через WSL2 | Нативный Windows не поддерживается |
| **ChromeOS** | Linux (Beta) | Ограниченная | Через Linux-контейнер |

### 7.2. Linux

```bash
# Универсальная установка для Linux
# 1. Node.js через nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20

# 2. Git (обычно предустановлен)
sudo apt install -y git    # Debian/Ubuntu
sudo dnf install -y git    # Fedora
sudo pacman -S git         # Arch

# 3. Claude Code
npm install -g @anthropic-ai/claude-code
```

### 7.3. macOS

```bash
# 1. Xcode Command Line Tools (включает git)
xcode-select --install

# 2. Homebrew (если не установлен)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 3. Node.js
brew install node@20

# 4. Claude Code
npm install -g @anthropic-ai/claude-code
```

### 7.4. Windows (через WSL2)

```powershell
# === PowerShell (от имени администратора) ===

# 1. Установка WSL2
wsl --install

# 2. Перезагрузка компьютера
# 3. После перезагрузки откройте Ubuntu из меню Пуск

# === Внутри WSL2 (Ubuntu) ===

# 4. Обновление системы
sudo apt update && sudo apt upgrade -y

# 5. Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20

# 6. Claude Code
npm install -g @anthropic-ai/claude-code

# 7. Клонирование и работа
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"
claude
```

> **Важно для Windows:** Product Keysarium 2026 **не работает** в нативном CMD или PowerShell. Используйте только WSL2 с Ubuntu или другим Linux-дистрибутивом.

---

## 8. Опциональные компоненты

### 8.1. Python 3.8+ для ed25519-верификации

Скрипты криптографической верификации источников в фазе Research (Phase 2) используют Python:

```bash
# Установка Python
sudo apt install -y python3 python3-pip    # Ubuntu/Debian
brew install python3                        # macOS

# Установка зависимостей
pip install cryptography pynacl

# Или через виртуальное окружение
python3 -m venv .venv
source .venv/bin/activate
pip install cryptography pynacl

# Проверка
python3 -c "
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
key = Ed25519PrivateKey.generate()
print('Ed25519 работает корректно')
"
```

> **Примечание:** Ed25519-верификация -- это расширенная функция скилла `goap-research-ed25519`. Без Python исследования будут работать, но без криптографической верификации цепочек цитирования.

### 8.2. Mermaid CLI (для рендеринга диаграмм)

Фазы Phase 3 и Phase 4 создают диаграммы в формате Mermaid (.mermaid). Для их рендеринга в PNG/SVG:

```bash
# Установка Mermaid CLI
npm install -g @mermaid-js/mermaid-cli

# Рендеринг диаграммы
mmdc -i diagrams/architecture-c4.mermaid -o diagrams/architecture-c4.png

# Рендеринг всех диаграмм
for f in researches/*/diagrams/*.mermaid; do
    mmdc -i "$f" -o "${f%.mermaid}.png"
done
```

### 8.3. jq (для работы с JSON)

```bash
# Полезно для анализа артефактов и метаданных
sudo apt install -y jq    # Ubuntu/Debian
brew install jq            # macOS
```

---

## 9. Облачные варианты развёртывания

### 9.1. GitHub Codespaces

GitHub Codespaces предоставляет полноценную среду разработки в облаке.

```bash
# 1. Откройте репозиторий на GitHub
# 2. Нажмите "Code" > "Codespaces" > "Create codespace on main"
# 3. В терминале Codespace:

# Установка Claude Code
npm install -g @anthropic-ai/claude-code

# Установка API-ключа (через GitHub Secrets или вручную)
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"

# Запуск
claude
```

**Рекомендуемый тип машины для Codespaces:**

| Тип | vCPU | RAM | Стоимость/час | Подходит для |
|-----|------|-----|--------------|-------------|
| 2-core | 2 | 8 ГБ | $0.18 | Одиночное исследование |
| 4-core | 4 | 16 ГБ | $0.36 | Параллельные агенты |
| 8-core | 8 | 32 ГБ | $0.72 | Параллельные исследования |

Файл конфигурации `.devcontainer/devcontainer.json`:

```json
{
    "name": "Product Keysarium 2026",
    "image": "mcr.microsoft.com/devcontainers/javascript-node:20",
    "features": {
        "ghcr.io/devcontainers/features/python:1": {
            "version": "3.11"
        }
    },
    "postCreateCommand": "npm install -g @anthropic-ai/claude-code && pip install cryptography pynacl",
    "remoteEnv": {
        "ANTHROPIC_API_KEY": "${localEnv:ANTHROPIC_API_KEY}"
    },
    "hostRequirements": {
        "cpus": 4,
        "memory": "8gb",
        "storage": "32gb"
    }
}
```

### 9.2. Gitpod

```bash
# 1. Откройте: https://gitpod.io/#https://github.com/djd1m/dz-harness-hub
# 2. В терминале Gitpod:

npm install -g @anthropic-ai/claude-code
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"
claude
```

Файл конфигурации `.gitpod.yml`:

```yaml
image:
  file: .gitpod.Dockerfile

tasks:
  - name: Setup
    init: |
      npm install -g @anthropic-ai/claude-code
      pip install cryptography pynacl
    command: |
      echo "Product Keysarium 2026 готов к работе"
      echo "Установите ANTHROPIC_API_KEY и запустите: claude"

vscode:
  extensions:
    - bierner.markdown-mermaid
```

### 9.3. AWS Cloud9

```bash
# 1. Создайте Cloud9 environment (t3.medium или лучше)
# 2. В терминале Cloud9:

# Обновление Node.js
nvm install 20
nvm use 20

# Установка Claude Code
npm install -g @anthropic-ai/claude-code

# Клонирование репозитория
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub

# API-ключ (рекомендуется через AWS Secrets Manager)
export ANTHROPIC_API_KEY="sk-ant-ваш-ключ"

# Запуск
claude
```

**Рекомендуемые типы инстансов AWS:**

| Тип | vCPU | RAM | Стоимость/час | Подходит для |
|-----|------|-----|--------------|-------------|
| `t3.medium` | 2 | 4 ГБ | ~$0.04 | Минимальный |
| `t3.large` | 2 | 8 ГБ | ~$0.08 | Рекомендуемый |
| `t3.xlarge` | 4 | 16 ГБ | ~$0.17 | Для параллельной работы |

### 9.4. Сравнение облачных платформ

| Критерий | GitHub Codespaces | Gitpod | AWS Cloud9 |
|----------|------------------|--------|------------|
| **Настройка** | Простая | Простая | Средняя |
| **Стоимость** | $0.18-0.72/час | Free tier + $0.36/час | $0.04-0.17/час |
| **Интеграция с Git** | Нативная | Нативная | Ручная |
| **Латентность** | Низкая | Низкая | Зависит от региона |
| **Персистентность** | До 30 дней простоя | 14 дней | Постоянная |
| **Доступ к сети** | Полный | Полный | Настраиваемый (VPC) |

---

## 10. CI/CD и автоматизация

### 10.1. Общий подход

Product Keysarium 2026 -- **интерактивный инструмент**, поэтому CI/CD для основного пайплайна не требуется. Однако CI/CD можно использовать для:

- Автоматического harvest после коммита исследования
- Валидации структуры артефактов
- Рендеринга Mermaid-диаграмм в PNG
- Линтинга markdown-файлов

### 10.2. GitHub Actions: автоматический harvest

```yaml
# .github/workflows/harvest.yml
name: Auto Harvest

on:
  push:
    paths:
      - 'researches/**/README.md'

jobs:
  harvest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Run Harvest
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          # Определяем изменённое исследование
          CHANGED=$(git diff --name-only HEAD~1 HEAD | grep 'researches/' | head -1 | cut -d/ -f2)
          if [ -n "$CHANGED" ]; then
            echo "Harvesting: researches/$CHANGED/"
            claude --print "/harvest researches/$CHANGED/"
          fi

      - name: Commit harvest results
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add TOOLKIT_HARVEST.md
          git diff --cached --quiet || git commit -m "chore: auto-harvest knowledge"
          git push
```

### 10.3. GitHub Actions: валидация артефактов

```yaml
# .github/workflows/validate.yml
name: Validate Research Structure

on:
  pull_request:
    paths:
      - 'researches/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate research structure
        run: |
          for dir in researches/*/; do
            echo "Проверка: $dir"

            # Обязательные файлы
            for file in README.md; do
              if [ ! -f "$dir$file" ]; then
                echo "  [FAIL] Отсутствует: $file"
                exit 1
              else
                echo "  [OK] $file"
              fi
            done

            # Обязательные директории
            for subdir in prototype diagrams; do
              if [ ! -d "$dir$subdir" ]; then
                echo "  [WARN] Отсутствует директория: $subdir/"
              else
                echo "  [OK] $subdir/"
              fi
            done

            # Проверка Phase 2.5 (обязательна)
            if [ -f "${dir}03_solution_strategy.md" ] && [ ! -f "${dir}prototype/cjm-prototype.jsx" ]; then
              echo "  [FAIL] Phase 3 есть, но Phase 2.5 (CJM Prototype) отсутствует!"
              exit 1
            fi

            # Проверка Executive Summary (обязателен)
            if [ -f "${dir}05_presentation_content.md" ] && [ ! -f "${dir}08_executive_summary.md" ]; then
              echo "  [FAIL] Презентация есть, но Executive Summary отсутствует!"
              exit 1
            fi
          done

          echo "Все проверки пройдены"
```

### 10.4. GitHub Actions: рендеринг Mermaid-диаграмм

```yaml
# .github/workflows/render-diagrams.yml
name: Render Mermaid Diagrams

on:
  push:
    paths:
      - 'researches/**/diagrams/*.mermaid'

jobs:
  render:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Mermaid CLI
        run: npm install -g @mermaid-js/mermaid-cli

      - name: Render diagrams
        run: |
          for f in researches/*/diagrams/*.mermaid; do
            if [ -f "$f" ]; then
              echo "Рендеринг: $f"
              mmdc -i "$f" -o "${f%.mermaid}.png" -w 1200
            fi
          done

      - name: Commit rendered diagrams
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add researches/*/diagrams/*.png
          git diff --cached --quiet || git commit -m "chore: render mermaid diagrams"
          git push
```

---

## 11. Оценка стоимости

### 11.1. Стоимость токенов по моделям

Цены актуальны на март 2026 года. Проверяйте актуальные цены на [anthropic.com/pricing](https://www.anthropic.com/pricing).

| Модель | Input (за 1M токенов) | Output (за 1M токенов) | Рекомендация |
|--------|----------------------|----------------------|-------------|
| **Claude Sonnet** | $3 | $15 | Основной выбор (баланс цена/качество) |
| **Claude Opus** | $15 | $75 | Для сложных банковских/enterprise кейсов |
| **Claude Haiku** | $0.25 | $1.25 | Не рекомендуется (недостаточная глубина) |

### 11.2. Стоимость одного исследования по фазам

**На модели Claude Sonnet (рекомендуемая):**

| Фаза | Input-токены | Output-токены | Стоимость input | Стоимость output | Итого |
|------|-------------|---------------|-----------------|------------------|-------|
| Phase 0 | 65,000 | 20,000 | $0.20 | $0.30 | **$0.50** |
| Phase 1 | 25,000 | 7,500 | $0.08 | $0.11 | **$0.19** |
| Phase 2 | 115,000 | 40,000 | $0.35 | $0.60 | **$0.95** |
| Phase 2.5 | 55,000 | 27,500 | $0.17 | $0.41 | **$0.58** |
| Phase 3 | 65,000 | 25,000 | $0.20 | $0.38 | **$0.58** |
| Phase 4 | 50,000 | 20,000 | $0.15 | $0.30 | **$0.45** |
| Phase 5 | 80,000 | 50,000 | $0.24 | $0.75 | **$0.99** |
| Phase 6 | 20,000 | 7,500 | $0.06 | $0.11 | **$0.17** |
| **Итого** | **475,000** | **197,500** | **$1.45** | **$2.96** | **$4.41** |

**С учётом итераций (множитель x1.5):** ~$6.60 за исследование

**На модели Claude Opus:**

| Сценарий | Стоимость (Sonnet) | Стоимость (Opus) |
|----------|-------------------|-----------------|
| Минимальное исследование | ~$3.50 | ~$17.50 |
| Типичное исследование | ~$4.50 | ~$22.50 |
| С итерациями и доработками | ~$6.50 | ~$33.00 |
| Глубокое исследование | ~$10.00 | ~$50.00 |

### 11.3. Стоимость для команды на хакатоне

| Сценарий | Кол-во исследований | Модель | Стоимость |
|----------|---------------------|--------|-----------|
| 1 команда, 1 кейс | 1 | Sonnet | ~$5-7 |
| 1 команда, 2 кейса (parallel) | 2 | Sonnet | ~$10-14 |
| 3 команды, по 1 кейсу | 3 | Sonnet | ~$15-21 |
| 1 команда, 1 кейс (глубокий) | 1 | Opus | ~$25-50 |
| Тренировка (5 пробных запусков) | 5 | Sonnet | ~$25-35 |

### 11.4. Стоимость облачных сред

| Платформа | Тип | Стоимость/час | За 8 часов хакатона |
|-----------|-----|--------------|---------------------|
| GitHub Codespaces | 4-core | $0.36 | $2.88 |
| Gitpod | Standard | $0.36 | $2.88 |
| AWS Cloud9 | t3.large | $0.08 | $0.64 |
| Локальная машина | --- | $0 | $0 |

### 11.5. Общий бюджет на кейсариум/хакатон

```
Типичный бюджет (1 команда, 1 кейс, Claude Sonnet):
  API Anthropic:                    ~$5-7
  Облачная среда (опционально):     ~$3 (8 часов Codespaces)
  ─────────────────────────────────────────
  Итого:                            ~$5-10

Расширенный бюджет (3 команды, 2 кейса каждая, Claude Sonnet):
  API Anthropic:                    ~$60-85
  Облачные среды (3 x Codespaces): ~$9
  ─────────────────────────────────────────
  Итого:                            ~$70-95
```

---

## 12. Масштабирование и лимиты

### 12.1. Лимиты Claude Code

| Параметр | Значение | Примечание |
|----------|----------|------------|
| Контекстное окно | 200K токенов | Включает CLAUDE.md + скиллы + историю |
| Максимальный output | 8,192 токенов за запрос | Claude Code автоматически разбивает |
| Число шагов агента | Настраивается (`CLAUDE_MAX_TURNS`) | По умолчанию достаточно |

### 12.2. Лимиты файловой системы

| Параметр | Лимит | Рекомендация |
|----------|-------|-------------|
| Размер одного файла | Нет жёсткого лимита | Артефакты < 100 КБ |
| Количество файлов в исследовании | ~15-20 | Стандартный набор артефактов |
| Вложенность директорий | Нет лимита | Не более 3 уровней |

### 12.3. Параллельность

| Сценарий | Agent Swarm | Rate Limit (Tier 2) | Рекомендация |
|----------|-------------|---------------------|-------------|
| 1 исследование, последовательно | 1 агент | Достаточно | Базовый режим |
| 1 исследование, параллельные фазы | 2-3 агента | Достаточно | `/casarium` с Agent Swarm |
| 2 исследования параллельно | 4-6 агентов | На границе | `/parallel-research` |
| 3+ исследования параллельно | 6+ агентов | Tier 3+ нужен | Только с высоким tier |

### 12.4. Рекомендации по масштабированию

```bash
# Мониторинг использования токенов
# Проверяйте расход на console.anthropic.com > Usage

# Оптимизация потребления токенов:
# 1. Используйте "ускорь" для Quick Mode в менее критичных фазах
# 2. Запускайте отдельные фазы вместо полного пайплайна для тестирования
# 3. Начинайте с Sonnet, переключайтесь на Opus только для глубокого анализа
# 4. Используйте /harvest для переиспользования знаний между исследованиями
```

---

## 13. Чеклист готовности

Используйте этот чеклист перед началом работы на кейсариуме/хакатоне.

### За день до мероприятия

```
[ ] Node.js 18+ установлен и работает
[ ] Git установлен и настроен
[ ] Claude Code CLI установлен (npm install -g @anthropic-ai/claude-code)
[ ] API-ключ Anthropic получен и проверен
[ ] Репозиторий клонирован
[ ] /new-research test — работает
[ ] Тестовое исследование удалено
[ ] Интернет-соединение стабильно
[ ] API Anthropic доступен (нет блокировок файрвола)
[ ] Достаточно кредитов на аккаунте Anthropic (~$10-15 на кейс)
[ ] Терминал настроен (ширина 120+, UTF-8)
[ ] (Опционально) Python + cryptography для ed25519
[ ] (Опционально) Mermaid CLI для рендеринга диаграмм
```

### В день мероприятия

```
[ ] API-ключ в переменной окружения
[ ] Claude Code запускается без ошибок
[ ] Slash-команды доступны (/casarium, /new-research, и т.д.)
[ ] Текст кейса подготовлен
[ ] Тайминг определён (сколько часов на кейс)
[ ] Команда знает, как работать с Checkpoint-ами
[ ] Запасной план: отдельные фазы, если пайплайн прервётся
```

### Быстрая проверка (1 минута)

```bash
cd dz-harness-hub
node --version && git --version && claude --version && echo "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:+SET}" && echo "Всё готово!"
```
