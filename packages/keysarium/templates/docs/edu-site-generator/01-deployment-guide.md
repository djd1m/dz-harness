# Руководство по развёртыванию @dzhechkov/skills-edu-site

## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Методы установки](#2-методы-установки)
3. [Установка с помощью npx](#3-установка-с-помощью-npx)
4. [Автономная установка (standalone)](#4-автономная-установка-standalone)
5. [Установка рядом с Keysarium](#5-установка-рядом-с-keysarium)
6. [Проверка установки](#6-проверка-установки)
7. [Первый запуск — пошаговое руководство](#7-первый-запуск--пошаговое-руководство)
8. [Установка зависимостей и сборка сгенерированного сайта](#8-установка-зависимостей-и-сборка-сгенерированного-сайта)
9. [Интеграция с @dzhechkov/keysarium](#9-интеграция-с-dzhechkokeysarium)
10. [Обновление и удаление](#10-обновление-и-удаление)
11. [Устранение неполадок](#11-устранение-неполадок)

---

## 1. Предварительные требования

Перед установкой убедитесь, что на вашей машине установлено следующее программное обеспечение.

### 1.1. Node.js 16+

`@dzhechkov/skills-edu-site` требует Node.js версии 16 или выше. Рекомендуется использовать Node.js 20 LTS.

```bash
# Проверка установленной версии
node --version
# Ожидаемый вывод: v16.x.x или выше (рекомендуется v20+)

npm --version
# Ожидаемый вывод: 8.x.x или выше
```

Если Node.js не установлен или версия ниже требуемой:

```bash
# Установка через nvm (рекомендуемый способ, все платформы)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
nvm alias default 20

# Установка на Ubuntu/Debian (через NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Установка на macOS (через Homebrew)
brew install node@20
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Установка на Windows (через winget)
winget install OpenJS.NodeJS.LTS
```

### 1.2. Claude Code CLI

`@dzhechkov/skills-edu-site` устанавливает скиллы и команды в проект Claude Code. Сам Claude Code CLI должен быть установлен и настроен.

```bash
# Установка Claude Code CLI глобально
npm install -g @anthropic-ai/claude-code

# Проверка установки
claude --version
# Ожидаемый вывод: claude/x.x.x

# Если возникает ошибка прав доступа при глобальной установке:
# Способ 1: использование sudo (только для Linux/macOS)
sudo npm install -g @anthropic-ai/claude-code

# Способ 2: настройка npm prefix (рекомендуется, без sudo)
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g @anthropic-ai/claude-code
```

### 1.3. npm

npm используется как менеджер пакетов для установки зависимостей сгенерированного SPA-приложения (React, Vite, TailwindCSS v4, Zustand).

```bash
# npm устанавливается автоматически вместе с Node.js
npm --version
# Ожидаемый вывод: 8.x.x или выше (рекомендуется npm 10+)

# Если npm устарел — обновите:
npm install -g npm@latest
```

### 1.4. Git (опционально, но рекомендуется)

Git необходим для управления версиями и для деплоя на GitHub Pages через GitHub Actions.

```bash
# Проверка установки
git --version

# Установка на Ubuntu/Debian
sudo apt install -y git

# Установка на macOS
brew install git

# Базовая настройка (если git установлен впервые)
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

### 1.5. GitHub аккаунт (для деплоя на GitHub Pages)

Для автоматического деплоя сгенерированного сайта на GitHub Pages потребуется:

1. Аккаунт на [github.com](https://github.com)
2. Репозиторий, в который будет загружен сгенерированный проект
3. Включённый GitHub Pages в настройках репозитория (Settings > Pages > Source: GitHub Actions)

---

## 2. Методы установки

Пакет `@dzhechkov/skills-edu-site` можно установить тремя способами в зависимости от вашего сценария использования:

| Метод | Когда использовать | Команда |
|-------|-------------------|---------|
| **npx (разовая установка)** | Быстрый старт без глобальной установки | `npx @dzhechkov/skills-edu-site init` |
| **Глобальная установка** | Частое использование в нескольких проектах | `npm install -g @dzhechkov/skills-edu-site` |
| **Рядом с Keysarium** | Уже установлен `@dzhechkov/keysarium` | `npx @dzhechkov/skills-edu-site init` (определяет keysarium автоматически) |

Во всех случаях команда `init` копирует одни и те же файлы в проект. Разница только в том, как запускается CLI.

---

## 3. Установка с помощью npx

`npx` позволяет запустить пакет без предварительной установки. Это рекомендуемый способ для первого знакомства с пакетом.

### 3.1. Перейдите в директорию проекта

```bash
# Перейдите в корень проекта, куда нужно установить edu-site skill
cd /path/to/your-project

# Убедитесь, что вы в правильной директории
pwd
ls
```

Директория проекта должна содержать файлы вашего проекта Claude Code (или быть пустой, если создаёте новый проект).

### 3.2. Запустите установку

```bash
npx @dzhechkov/skills-edu-site init
```

CLI отобразит баннер и план установки:

```
+------------------------------------------------------+
|   DZ-SKILLS-EDU-SITE -- Educational SPA Generator      |
|   Gamified learning sites with React + Vite + Tailwind |
+------------------------------------------------------+

  Installation plan:

  + Edu-Site Skill (.claude/skills/edu-site-generator/)
  + Edu-Site Commands (.claude/commands/edu-site*.md)
  + Edu-Site Rules (.claude/rules/edu-site-*.md)

  [1/3] Installing Edu-Site Skill...
  [2/3] Installing Edu-Site Commands...
  [3/3] Installing Edu-Site Rules...

  Created .edu-site-skills.json manifest

  Edu-Site skill pack installed!

  Installed components:
    - Edu-Site Skill (.claude/skills/edu-site-generator/)
    - Edu-Site Commands (.claude/commands/edu-site*.md)
    - Edu-Site Rules (.claude/rules/edu-site-*.md)

  Next steps:
    1. Open Claude Code in this directory
    2. Provide documentation or topic to generate a learning site
    3. The 8-step pipeline will create a complete SPA:
       Content Analysis -> Course Structure -> Data Generation ->
       Scaffold -> Components -> Gamification -> Deploy -> Verification
```

### 3.3. Предпросмотр без записи (dry-run)

Если хотите узнать, что именно будет установлено, не записывая файлы:

```bash
npx @dzhechkov/skills-edu-site init --dry-run
```

Команда покажет план установки и завершится без изменений.

### 3.4. Принудительная перезапись (force)

Если edu-site skill уже установлен и вы хотите заменить файлы свежими из пакета:

```bash
npx @dzhechkov/skills-edu-site init --force
```

> **Внимание:** `--force` перезапишет существующие файлы edu-site. Ваши пользовательские модификации будут утеряны. Сначала сделайте бэкап или зафиксируйте изменения в git.

---

## 4. Автономная установка (standalone)

Если вы планируете использовать edu-site генератор регулярно и не хотите каждый раз запускать `npx`, установите пакет глобально.

### 4.1. Глобальная установка

```bash
npm install -g @dzhechkov/skills-edu-site

# Проверка установки
skills-edu-site --version
# или
npx @dzhechkov/skills-edu-site --version
```

### 4.2. Инициализация в проекте

После глобальной установки перейдите в проект и запустите:

```bash
cd /path/to/your-project
skills-edu-site init
```

Или по-прежнему через npx (будет использована кешированная локальная версия):

```bash
npx @dzhechkov/skills-edu-site init
```

### 4.3. Структура установленных файлов

После `init` в корне проекта появятся следующие файлы и директории:

```
your-project/
+-- .edu-site-skills.json                         <- Манифест установки
+-- .claude/
    +-- skills/
    |   +-- edu-site-generator/
    |       +-- SKILL.md                           <- Основной оркестратор
    |       +-- modules/
    |       |   +-- 01-content-analysis.md         <- Шаг 1: Анализ контента
    |       |   +-- 02-course-structure.md         <- Шаг 2: Структура курса
    |       |   +-- 03-data-generation.md          <- Шаг 3: Генерация данных
    |       |   +-- 04-scaffold.md                 <- Шаг 4: Scaffolding проекта
    |       |   +-- 05-components.md               <- Шаг 5: React-компоненты
    |       |   +-- 06-gamification.md             <- Шаг 6: Геймификация
    |       |   +-- 07-deploy.md                   <- Шаг 7: Деплой (GitHub Pages)
    |       |   +-- 08-verification.md             <- Шаг 8: Верификация
    |       +-- references/
    |       |   +-- exercise-types.md              <- 6 типов упражнений
    |       |   +-- component-patterns.md          <- Паттерны React-компонентов
    |       |   +-- tailwind-v4-guide.md           <- Справочник TailwindCSS v4
    |       |   +-- zustand-patterns.md            <- Паттерны Zustand store
    |       |   +-- achievement-templates.md       <- Шаблоны достижений
    |       +-- examples/
    |           +-- sample-sections.js             <- Пример файла sections.js
    |           +-- sample-exercises.js            <- Пример файла exercises.js
    +-- commands/
    |   +-- edu-site.md                            <- /edu-site -- полный пайплайн
    +-- rules/
        +-- edu-site-conventions.md                <- Правила генерации
```

Манифест `.edu-site-skills.json` записывает версию, список компонентов и все установленные файлы. Он используется командами `update`, `remove`, `list` и `doctor`.

---

## 5. Установка рядом с Keysarium

`@dzhechkov/skills-edu-site` разработан для совместной работы с `@dzhechkov/keysarium`. При установке в проект, где уже есть Keysarium, edu-site автоматически определяет это и интегрируется.

### 5.1. Определение Keysarium

Команда `init` ищет файл `.keysarium.json` в корне проекта. Если он найден — edu-site выводит сообщение об интеграции:

```
  +--------------------------------------------------+
  | @dzhechkov/keysarium detected!                     |
  | Version: 1.0.0                                    |
  | Edu-Site will integrate with existing setup.      |
  | Shared directories: .claude/commands, rules       |
  +--------------------------------------------------+
```

### 5.2. Порядок установки с Keysarium

Рекомендуемый порядок установки (если оба пакета устанавливаются с нуля):

```bash
# Шаг 1: Установите Keysarium первым
npx @dzhechkov/keysarium init

# Шаг 2: Установите edu-site поверх
npx @dzhechkov/skills-edu-site init
```

Edu-site добавит свои файлы в уже существующие директории `.claude/commands/` и `.claude/rules/`, не затрагивая файлы Keysarium.

### 5.3. Разделение файлов (изоляция)

Оба пакета используют соглашение об именовании, чтобы не конфликтовать:

| Пакет | Команды | Правила | Скиллы |
|-------|---------|---------|--------|
| Keysarium | `casarium.md`, `discovery.md`, ... | `agent-swarm.md`, `checkpoint-protocol.md`, ... | keysarium-скиллы |
| Edu-Site | `edu-site.md` | `edu-site-conventions.md` | `edu-site-generator/` |

Все файлы edu-site начинаются с префикса `edu-site`. Пересечений нет.

---

## 6. Проверка установки

### 6.1. Команда doctor

Запустите `doctor` для проверки здоровья установки сразу после `init`:

```bash
npx @dzhechkov/skills-edu-site doctor
```

Пример вывода при здоровой установке:

```
  Running health checks for @dzhechkov/skills-edu-site v1.0.0...

  - Files exist              -- All 16 manifest files present
  - Edu-Site skill pack      -- SKILL.md present, 8 module(s) in skill pack
  - Edu-Site commands        -- 1 command(s): edu-site.md
  - Edu-Site rules           -- 1 rule(s): edu-site-conventions.md
  - References               -- 5 reference file(s) present
  - Examples                 -- 2 example file(s) present
  - Keysarium integration   -- Active (Keysarium v1.0.0)

  7/7 checks passed -- Edu-Site installation is healthy!
```

### 6.2. Команда list

Для просмотра установленных компонентов с детальным перечнем файлов:

```bash
npx @dzhechkov/skills-edu-site list
```

### 6.3. Проверка в Claude Code

Откройте Claude Code в директории проекта и убедитесь, что команда edu-site доступна:

```bash
# Откройте Claude Code в директории проекта
claude

# Внутри Claude Code проверьте доступность команды
/edu-site --help
```

---

## 7. Первый запуск -- пошаговое руководство

Этот раздел проводит вас через полный пайплайн генерации образовательного SPA-приложения.

### 7.1. Сценарий

Мы создадим интерактивный обучающий сайт по документации CLI-инструмента, используя 8-шаговый пайплайн.

### 7.2. Подготовка входных данных

Edu-site генератор принимает различные типы входных данных:

| Тип входа | Пример |
|-----------|--------|
| URL документации | `https://docs.example.com/cli-reference` |
| Локальный файл | `./docs/cli-guide.md` |
| Вставленный текст | Прямой текст в чат Claude Code |
| Описание темы | "Обучение основам Docker для начинающих разработчиков" |

### 7.3. Запуск пайплайна

В Claude Code введите:

```
/edu-site https://docs.example.com/cli-reference
```

Или с текстовым описанием:

```
/edu-site "Создай обучающий сайт по основам Git: базовые команды, ветвление, слияние, работа с удалёнными репозиториями"
```

### 7.4. 8-шаговый пайплайн

Пайплайн состоит из 8 последовательных шагов:

**Шаг 1: Content Analysis (Анализ контента)**

Claude Code анализирует предоставленные материалы, определяет язык (ru/en автоматически), выделяет ключевые темы, концепции и терминологию.

```
Step 1/8: Content Analysis
Detected language: en
Topics identified: 12
Key concepts: 34
Estimated sections: 5
```

**Шаг 2: Course Structure (Структура курса)**

На основе анализа формируется иерархия секций, определяется порядок изучения и зависимости между темами.

```
Step 2/8: Course Structure
Sections planned:
  1. Getting Started (3 exercises)
  2. Core Commands (5 exercises)
  3. Branching (4 exercises)
  4. Merging (3 exercises)
  5. Remote Repositories (4 exercises)
Total exercises: 19
```

**Шаг 3: Data Generation (Генерация данных)**

Генерируются 4 файла данных: `sections.js`, `exercises.js`, `quizQuestions.js`, `achievements.js`. Каждый содержит структурированные данные для работы приложения.

```
Step 3/8: Data Generation
Files planned:
  - src/data/sections.js (5 sections, 24 subsections)
  - src/data/exercises.js (19 exercises, 6 types)
  - src/data/quizQuestions.js (25 questions for final test)
  - src/data/achievements.js (12 achievements)
```

**Шаг 4: Scaffold (Каркас проекта)**

Создаётся структура проекта: Vite конфиг, TailwindCSS v4 настройка, package.json со всеми зависимостями, index.html с SEO-тегами.

```
Step 4/8: Scaffold
Created:
  - package.json (React 19, Vite, TailwindCSS v4, Zustand)
  - vite.config.js (base path for GitHub Pages)
  - index.html (OG tags, JSON-LD schema)
  - tailwind.config.js / app.css (theme configuration)
  - .github/workflows/deploy.yml (GitHub Actions)
```

**Шаг 5: Components (React-компоненты)**

Генерируются все React-компоненты: макет (Header, Footer, Sidebar), интерактивные упражнения (6 типов), общие компоненты (Toast, ProgressBar, Badge), страницы (Home, Section, FinalTest, Results).

```
Step 5/8: Components
Generated:
  - Layout: Header, Footer, Sidebar, Navigation
  - Interactive: Quiz, Flashcards, Matching, DragToOrder,
                 CommandBuilder, ScenarioGame
  - Common: Toast, ProgressBar, Badge, AchievementPopup
  - Pages: HomePage, SectionPage, FinalTestPage, ResultsPage
  Total: 22 components
```

**Шаг 6: Gamification (Геймификация)**

Настраивается Zustand store с persist middleware (localStorage), система достижений, подсчёт очков, progress tracking.

```
Step 6/8: Gamification
Configured:
  - Zustand store with persist middleware
  - Points system: +10 per exercise, +5 bonus for streak
  - 12 achievements with unlock criteria
  - Progress tracking per section
  - Toast notifications for achievements
```

**Шаг 7: Deploy (Деплой)**

Генерируется GitHub Actions workflow для автоматического деплоя на GitHub Pages. Настраивается корректный base path в Vite конфиге.

```
Step 7/8: Deploy
Created:
  - .github/workflows/deploy.yml
  - Vite base path: /<repository-name>/
  - GitHub Pages configuration ready
```

**Шаг 8: Verification (Верификация)**

Проверяется корректность всех сгенерированных файлов: структура проекта, импорты, наличие всех данных, валидность JSX.

```
Step 8/8: Verification
Checks:
  - All imports resolve: PASS
  - Data file structure: PASS
  - Component hierarchy: PASS
  - Router configuration: PASS
  - Build simulation: PASS

  All 5 checks passed!
```

### 7.5. Результат

По завершении пайплайна вы получите полностью рабочий проект в указанной директории:

```
generated-site/
+-- package.json
+-- vite.config.js
+-- index.html
+-- tailwind.config.js
+-- src/
|   +-- App.jsx
|   +-- main.jsx
|   +-- app.css
|   +-- data/
|   |   +-- sections.js
|   |   +-- exercises.js
|   |   +-- quizQuestions.js
|   |   +-- achievements.js
|   +-- components/
|   |   +-- layout/
|   |   +-- interactive/
|   |   +-- common/
|   |   +-- sections/
|   +-- pages/
|   +-- store/
|   |   +-- useStore.js
|   +-- hooks/
+-- .github/
    +-- workflows/
        +-- deploy.yml
```

---

## 8. Установка зависимостей и сборка сгенерированного сайта

После генерации проекта необходимо установить зависимости и выполнить сборку.

### 8.1. Установка зависимостей

```bash
cd generated-site/
npm install
```

Это установит все зависимости из `package.json`:

| Зависимость | Версия | Назначение |
|-------------|--------|------------|
| react | ^19.0.0 | UI-библиотека |
| react-dom | ^19.0.0 | DOM-рендеринг |
| react-router-dom | ^7.0.0 | Маршрутизация SPA |
| zustand | ^5.0.0 | State management |
| @tailwindcss/vite | ^4.0.0 | TailwindCSS v4 интеграция с Vite |
| tailwindcss | ^4.0.0 | CSS-фреймворк |
| vite | ^6.0.0 | Сборщик |
| @vitejs/plugin-react | ^4.0.0 | React-плагин для Vite |

### 8.2. Запуск dev-сервера

```bash
npm run dev
```

Откройте `http://localhost:5173` в браузере. Вы увидите главную страницу образовательного сайта с навигацией по секциям.

### 8.3. Production-сборка

```bash
npm run build
```

Собранные файлы появятся в директории `dist/`. Размер: примерно 200-500 КБ в зависимости от объёма контента.

### 8.4. Предпросмотр production-сборки

```bash
npm run preview
```

Откройте предложенный URL для проверки production-версии локально.

### 8.5. Деплой на GitHub Pages

```bash
# Инициализируйте git (если ещё нет)
git init
git add .
git commit -m "Initial commit: generated edu site"

# Добавьте remote и push
git remote add origin https://github.com/your-username/your-repo.git
git push -u origin main
```

После push GitHub Actions автоматически запустит workflow `deploy.yml`, который:
1. Установит зависимости (`npm install`)
2. Соберёт проект (`npm run build`)
3. Задеплоит `dist/` на GitHub Pages

Сайт будет доступен по адресу `https://your-username.github.io/your-repo/`.

---

## 9. Интеграция с @dzhechkov/keysarium

### 9.1. Автоматическое определение

При запуске `npx @dzhechkov/skills-edu-site init` в директории, где уже установлен Keysarium (есть файл `.keysarium.json`), edu-site автоматически определяет это и интегрируется.

Проверить интеграцию можно через `doctor`:

```bash
npx @dzhechkov/skills-edu-site doctor
```

Строка `Keysarium integration` в выводе покажет статус:
- `Active (Keysarium v1.0.0)` — интеграция активна
- `Not installed (standalone edu-site mode)` — edu-site работает автономно

### 9.2. Использование в пайплайне Keysarium

Edu-site генератор может быть использован как дополнительный инструмент в Keysarium пайплайне для создания обучающих материалов по результатам исследования:

```
# После завершения исследования — создать обучающий сайт по его результатам
/edu-site researches/my-case/02_research_findings.md

# Создать обучающий сайт по документации разрабатываемого продукта
/edu-site "Обучение работе с [название продукта из кейса]"
```

### 9.3. Параллельное использование команд

После установки обоих пакетов в Claude Code доступны команды обоих пайплайнов одновременно:

```
# Keysarium команды
/casarium      /discovery     /explore-case  /research
/cjm-prototype /solve         /architecture-phase /presentation

# Edu-Site команда
/edu-site
```

Конфликтов между командами нет.

---

## 10. Обновление и удаление

### 10.1. Обновление установки

Для обновления edu-site до последней версии:

```bash
npx @dzhechkov/skills-edu-site update
```

Команда `update`:
1. Читает манифест `.edu-site-skills.json`, определяет установленные компоненты
2. Сравнивает текущие файлы с шаблонами нового пакета
3. Показывает diff по каждому изменённому файлу
4. Запрашивает подтверждение перед обновлением

```bash
# Предпросмотр изменений без записи
npx @dzhechkov/skills-edu-site update --dry-run
```

> **Рекомендация:** Перед обновлением зафиксируйте текущее состояние в git:
> ```bash
> git add .claude/ .edu-site-skills.json
> git commit -m "snapshot before skills-edu-site update"
> ```

### 10.2. Удаление установки

```bash
npx @dzhechkov/skills-edu-site remove
```

Команда `remove` удаляет только файлы, перечисленные в манифесте. Файлы Keysarium (если они есть в тех же директориях) не затрагиваются. После удаления манифест `.edu-site-skills.json` также удаляется.

> **Важно:** Ранее сгенерированные сайты (в отдельных директориях) НЕ удаляются командой `remove`. Удаляются только файлы скилла из `.claude/`.

---

## 11. Устранение неполадок

### 11.1. Ошибка: "Edu-Site skill pack is already installed"

```
WARN  Edu-Site skill pack is already installed in this directory.
      Run @dzhechkov/skills-edu-site update to update, or use --force to overwrite.
```

**Причина:** Файл `.edu-site-skills.json` уже существует в директории.

**Решение:**
```bash
# Вариант 1: обновить существующую установку
npx @dzhechkov/skills-edu-site update

# Вариант 2: принудительно перезаписать
npx @dzhechkov/skills-edu-site init --force
```

### 11.2. Ошибки Vite при сборке (npm run build)

```
Error: Could not resolve "./components/interactive/Quiz" from "src/App.jsx"
```

**Причина:** Отсутствует файл компонента или неверный путь импорта.

**Решение:**
1. Убедитесь, что пайплайн завершился без ошибок (все 8 шагов показали PASS)
2. Проверьте структуру директории `src/components/`:
```bash
find src/components -name "*.jsx" | sort
```
3. Если файл действительно отсутствует — повторно запустите `/edu-site` с теми же входными данными

### 11.3. Ошибки TailwindCSS v4

```
Error: Cannot find module 'tailwindcss'
```

**Причина:** Зависимости не установлены или установлена несовместимая версия TailwindCSS.

**Решение:**
```bash
# Убедитесь, что зависимости установлены
npm install

# Если проблема сохраняется — очистите кеш и переустановите
rm -rf node_modules package-lock.json
npm install
```

**Ошибка:** `@tailwindcss/vite requires TailwindCSS v4`

```bash
# Проверьте версию TailwindCSS
npm ls tailwindcss

# Должна быть v4.x.x
# Если версия ниже — обновите:
npm install tailwindcss@latest @tailwindcss/vite@latest
```

### 11.4. Ошибка: отсутствуют зависимости при npm install

```
npm ERR! peer dep missing: react@^19.0.0
```

**Решение:**
```bash
# Установите с флагом --legacy-peer-deps если есть конфликты
npm install --legacy-peer-deps

# Или обновите Node.js до версии 20+ и npm до 10+
nvm install 20
nvm use 20
npm install
```

### 11.5. GitHub Pages показывает 404

**Причина 1:** Неверный base path в `vite.config.js`.

**Решение:**
Откройте `vite.config.js` и проверьте значение `base`:
```javascript
// Должно совпадать с именем вашего репозитория
export default defineConfig({
  base: '/your-repo-name/',
  // ...
})
```

Если репозиторий имеет формат `username.github.io` (user site), base должен быть `/`:
```javascript
export default defineConfig({
  base: '/',
  // ...
})
```

**Причина 2:** GitHub Actions workflow не настроен.

**Решение:**
1. Перейдите в Settings > Pages в вашем репозитории
2. В Source выберите "GitHub Actions"
3. Убедитесь, что файл `.github/workflows/deploy.yml` существует
4. Сделайте push — workflow запустится автоматически

**Причина 3:** React Router не настроен для GitHub Pages.

SPA требует обработки всех маршрутов через `index.html`. Сгенерированный проект использует `HashRouter` вместо `BrowserRouter`, что корректно работает с GitHub Pages без дополнительной конфигурации сервера.

### 11.6. Сайт отображается без стилей

**Причина:** TailwindCSS v4 CSS не подключён или не собирается.

**Решение:**
Проверьте, что в `src/main.jsx` (или `src/main.js`) есть импорт CSS:
```javascript
import './app.css'
```

Проверьте, что `src/app.css` содержит директиву TailwindCSS v4:
```css
@import "tailwindcss";
```

### 11.7. Zustand store не сохраняет прогресс после перезагрузки страницы

**Причина:** Persist middleware не настроен или localStorage недоступен.

**Решение:**
Проверьте `src/store/useStore.js`:
```javascript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set) => ({
      // ... state
    }),
    {
      name: 'edu-site-storage', // key в localStorage
    }
  )
)
```

Убедитесь, что localStorage доступен (не заблокирован настройками браузера или режимом инкогнито).

### 11.8. Команда /edu-site не отображается в Claude Code

**Причина 1:** Вы не в директории проекта, где установлен edu-site.

**Решение:**
```bash
# Убедитесь, что Claude Code запущен в правильной директории
ls .edu-site-skills.json
# Если файл не найден — перейдите в правильную директорию и запустите claude снова
```

**Причина 2:** Claude Code был открыт до установки edu-site.

**Решение:** Закройте и снова откройте Claude Code.

### 11.9. Ошибка при генерации: "Could not fetch documentation URL"

**Причина:** URL недоступен, сайт требует авторизации, или присутствует anti-bot защита.

**Решение:**
```bash
# Вариант 1: скачайте контент вручную и передайте как файл
curl -o docs.md https://docs.example.com/cli-reference
/edu-site ./docs.md

# Вариант 2: вставьте текст напрямую в чат Claude Code
/edu-site "Вот текст документации: [вставьте текст]"

# Вариант 3: используйте описание темы
/edu-site "Обучение работе с CLI-инструментом Example: команды init, build, deploy"
```

### 11.10. Таблица кодов выхода CLI

| Код | Значение |
|-----|---------|
| `0` | Успешное выполнение |
| `1` | Ошибка (неверные аргументы, файлы не найдены, проверки не пройдены) |

При коде выхода `1` в `doctor` — прочитайте раздел "Fix suggestions" в выводе. При коде `1` в `init` или `update` — прочитайте сообщение об ошибке и следуйте инструкциям.
