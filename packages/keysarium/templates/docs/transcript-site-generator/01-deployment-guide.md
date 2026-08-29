# Руководство по развёртыванию @dzhechkov/skills-transcript-site

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


## Содержание

1. [Предварительные требования](#1-предварительные-требования)
2. [Методы установки](#2-методы-установки)
3. [Установка с помощью npx](#3-установка-с-помощью-npx)
4. [Автономная установка (standalone)](#4-автономная-установка-standalone)
5. [Установка рядом с Keysarium](#5-установка-рядом-с-keysarium)
6. [Проверка установки](#6-проверка-установки)
7. [Первый запуск — пошаговое руководство](#7-первый-запуск--пошаговое-руководство)
8. [Интеграция с @dzhechkov/keysarium](#8-интеграция-с-dzhechkokeysarium)
9. [Обновление и удаление](#9-обновление-и-удаление)
10. [Устранение неполадок](#10-устранение-неполадок)

---

## 1. Предварительные требования

Перед установкой убедитесь, что на вашей машине установлено следующее программное обеспечение.

### 1.1. Node.js 16+

`@dzhechkov/skills-transcript-site` требует Node.js версии 16 или выше. Рекомендуется использовать Node.js 20 LTS.

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

`@dzhechkov/skills-transcript-site` устанавливает скиллы и команды в проект Claude Code. Сам Claude Code CLI должен быть установлен и настроен.

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

### 1.3. API-ключ Anthropic

Для работы Claude Code и генерации transcript-сайтов необходим API-ключ Anthropic.

1. Перейдите на [console.anthropic.com](https://console.anthropic.com)
2. Зарегистрируйте аккаунт или войдите в существующий
3. В разделе **API Keys** нажмите **Create Key**
4. Скопируйте ключ (он начинается с `sk-ant-`) — он показывается только один раз
5. Установите переменную окружения:

```bash
# Временно (для текущей сессии терминала)
export ANTHROPIC_API_KEY="sk-ant-..."

# Постоянно (добавьте в ~/.bashrc или ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

> **Токены и стоимость:** Полный 6-шаговый пайплайн генерации transcript-сайта потребляет примерно 30-60K токенов. Основной расход: Input Analysis (~5K), Content Parsing (~8K), Site Generation (~15K), Interactivity (~10K), Deploy (~3K), Verification (~5K). Стоимость зависит от длины транскрипта: короткий подкаст (~15 мин) ~30K токенов, длинная конференция (~2 часа) ~80K токенов.

### 1.4. yt-dlp (опционально, для YouTube)

Для извлечения транскриптов из YouTube-видео используется `yt-dlp`. Если вы планируете работать только с текстовыми транскриптами — этот шаг не обязателен.

```bash
# Проверка установки
yt-dlp --version

# Установка на Ubuntu/Debian
sudo apt install -y yt-dlp

# Установка на macOS (через Homebrew)
brew install yt-dlp

# Установка через pip (кроссплатформенный способ)
pip install yt-dlp

# Установка через pipx (изолированное окружение, рекомендуется)
pipx install yt-dlp

# Обновление до последней версии (yt-dlp обновляется часто)
yt-dlp -U
```

`yt-dlp` поддерживает автоматическое извлечение субтитров, метаданных и thumbnail-ов из YouTube. Если `yt-dlp` не установлен, скилл предложит вставить текст транскрипта вручную.

### 1.5. Git (опционально, но рекомендуется)

Git необходим для GitHub Pages деплоя и версионирования сгенерированных сайтов.

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

### 1.6. Современный браузер

Для просмотра и тестирования сгенерированных сайтов. Сайт использует Tailwind CSS Play CDN и современные JS-фичи (IntersectionObserver, Clipboard API, CSS custom properties).

Поддерживаемые браузеры:
- Chrome / Chromium 90+
- Firefox 90+
- Safari 15+
- Edge 90+

---

## 2. Методы установки

Пакет `@dzhechkov/skills-transcript-site` можно установить тремя способами в зависимости от вашего сценария использования:

| Метод | Когда использовать | Команда |
|-------|-------------------|---------|
| **npx (разовая установка)** | Быстрый старт без глобальной установки | `npx @dzhechkov/skills-transcript-site init` |
| **Глобальная установка** | Частое использование в нескольких проектах | `npm install -g @dzhechkov/skills-transcript-site` |
| **Рядом с Keysarium** | Уже установлен `@dzhechkov/keysarium` | `npx @dzhechkov/skills-transcript-site init` (определяет keysarium автоматически) |

Во всех случаях команда `init` копирует одни и те же файлы в проект. Разница только в том, как запускается CLI.

---

## 3. Установка с помощью npx

`npx` позволяет запустить пакет без предварительной установки. Это рекомендуемый способ для первого знакомства с пакетом.

### 3.1. Перейдите в директорию проекта

```bash
# Перейдите в корень проекта, куда нужно установить transcript-site
cd /path/to/your-project

# Убедитесь, что вы в правильной директории
pwd
ls
```

Директория проекта должна содержать файлы вашего проекта Claude Code (или быть пустой, если создаёте новый проект).

### 3.2. Запустите установку

```bash
npx @dzhechkov/skills-transcript-site init
```

CLI отобразит баннер и план установки:

```
+=====================================================+
|  TRANSCRIPT-SITE-GENERATOR                          |
|  Interactive transcript websites from text/YouTube  |
|  Pure static HTML + Tailwind CDN + vanilla JS       |
+=====================================================+

  Installation plan:

  + Transcript Site Skill (.claude/skills/transcript-site-generator/)
  + Transcript Site Commands (.claude/commands/transcript-site*.md)
  + Transcript Site Rules (.claude/rules/transcript-site-*.md)

  [1/3] Installing Transcript Site Skill...
  [2/3] Installing Transcript Site Commands...
  [3/3] Installing Transcript Site Rules...

  Created .transcript-site-skills.json manifest

  Transcript Site skill pack installed!

  Installed components:
    + Transcript Site Skill (.claude/skills/transcript-site-generator/)
    + Transcript Site Commands (.claude/commands/transcript-site*.md)
    + Transcript Site Rules (.claude/rules/transcript-site-*.md)

  Next steps:
    1. Open Claude Code in this directory
    2. Run /transcript-site [YouTube URL or text] for the full pipeline
    3. Generated site will be in docs/ (ready for GitHub Pages)
```

### 3.3. Предпросмотр без записи (dry-run)

Если хотите узнать, что именно будет установлено, не записывая файлы:

```bash
npx @dzhechkov/skills-transcript-site init --dry-run
```

Команда покажет план установки и завершится без изменений.

### 3.4. Принудительная перезапись (force)

Если скилл уже установлен и вы хотите заменить файлы свежими из пакета:

```bash
npx @dzhechkov/skills-transcript-site init --force
```

> **Внимание:** `--force` перезапишет существующие файлы скилла. Ваши пользовательские модификации будут утеряны. Сначала сделайте бэкап или зафиксируйте изменения в git.

### 3.5. Указание выходной директории

По умолчанию сгенерированные сайты записываются в `docs/` (стандартная директория для GitHub Pages). Для изменения:

```bash
npx @dzhechkov/skills-transcript-site init --output-dir public/
```

Это изменит значение по умолчанию в конфигурации скилла.

---

## 4. Автономная установка (standalone)

Если вы планируете использовать transcript-site-generator регулярно и не хотите каждый раз запускать `npx`, установите пакет глобально.

### 4.1. Глобальная установка

```bash
npm install -g @dzhechkov/skills-transcript-site

# Проверка установки
skills-transcript-site --version
# или
npx @dzhechkov/skills-transcript-site --version
```

### 4.2. Инициализация в проекте

После глобальной установки перейдите в проект и запустите:

```bash
cd /path/to/your-project
skills-transcript-site init
```

Или по-прежнему через npx (будет использована кешированная локальная версия):

```bash
npx @dzhechkov/skills-transcript-site init
```

### 4.3. Структура установленных файлов

После `init` в корне проекта появятся следующие файлы и директории:

```
your-project/
+-- .transcript-site-skills.json            <-- Манифест установки
+-- .claude/
    +-- skills/
    |   +-- transcript-site-generator/
    |       +-- SKILL.md                    <-- Основной оркестратор 6-шагового пайплайна
    |       +-- modules/
    |       |   +-- input-analysis.md       <-- Шаг 1: анализ входных данных
    |       |   +-- content-parsing.md      <-- Шаг 2: парсинг контента
    |       |   +-- site-generation.md      <-- Шаг 3: генерация HTML
    |       |   +-- interactivity.md        <-- Шаг 4: интерактивность (JS)
    |       |   +-- deploy.md               <-- Шаг 5: деплой конфигурация
    |       |   +-- verification.md         <-- Шаг 6: верификация
    |       +-- references/
    |       |   +-- html-template.md        <-- Базовый HTML шаблон
    |       |   +-- tailwind-config.md      <-- Конфигурация Tailwind CDN
    |       |   +-- seo-checklist.md        <-- SEO чеклист (OG, JSON-LD, Twitter)
    |       |   +-- accessibility-guide.md  <-- A11y руководство
    |       +-- examples/
    |           +-- sample-podcast.md       <-- Пример: подкаст-транскрипт
    |           +-- sample-youtube.md       <-- Пример: YouTube-видео
    +-- commands/
    |   +-- transcript-site.md              <-- /transcript-site -- полный пайплайн
    |   +-- transcript-site-generate.md     <-- /transcript-site-generate -- только HTML
    |   +-- transcript-site-deploy.md       <-- /transcript-site-deploy -- только деплой
    +-- rules/
        +-- transcript-site-quality.md      <-- Правила качества для генерируемых сайтов
```

Манифест `.transcript-site-skills.json` записывает версию, список компонентов и все установленные файлы. Он используется командами `update`, `remove`, `list` и `doctor`.

---

## 5. Установка рядом с Keysarium

`@dzhechkov/skills-transcript-site` разработан для совместной работы с `@dzhechkov/keysarium`. При установке в проект, где уже есть Keysarium, скилл автоматически определяет это и интегрируется.

### 5.1. Определение Keysarium

Команда `init` ищет файл `.keysarium.json` в корне проекта. Если он найден — выводится сообщение об интеграции:

```
  +--------------------------------------------------+
  | @dzhechkov/keysarium detected!                    |
  | Version: 1.0.0                                    |
  | Transcript Site will integrate with Keysarium.    |
  | Shared directories: .claude/commands, rules       |
  +--------------------------------------------------+
```

### 5.2. Порядок установки с Keysarium

Рекомендуемый порядок установки (если оба пакета устанавливаются с нуля):

```bash
# Шаг 1: Установите Keysarium первым
npx @dzhechkov/keysarium init

# Шаг 2: Установите Transcript Site поверх
npx @dzhechkov/skills-transcript-site init
```

Transcript Site добавит свои файлы в уже существующие директории `.claude/commands/` и `.claude/rules/`, не затрагивая файлы Keysarium.

### 5.3. Разделение файлов (изоляция)

Оба пакета используют соглашение об именовании, чтобы не конфликтовать:

| Пакет | Команды | Правила | Скиллы |
|-------|---------|---------|--------|
| Keysarium | `casarium.md`, `discovery.md`, ... | `agent-swarm.md`, `checkpoint-protocol.md`, ... | `explore/`, `goap-research-ed25519/`, ... |
| Transcript Site | `transcript-site.md`, `transcript-site-generate.md`, `transcript-site-deploy.md` | `transcript-site-quality.md` | `transcript-site-generator/` |

Все файлы Transcript Site начинаются с префикса `transcript-site`. Пересечений нет.

### 5.4. Использование после установки Keysarium

После установки обоих пакетов в Claude Code доступны команды обоих пайплайнов одновременно:

```
# Keysarium команды
/casarium      /discovery     /explore-case  /research
/cjm-prototype /solve         /architecture-phase /presentation

# Transcript Site команды
/transcript-site           /transcript-site-generate   /transcript-site-deploy
```

Конфликтов между командами нет. Можно, например, использовать `/transcript-site` для создания интерактивного сайта из транскрипта подкаста, а `/casarium` — для полного исследования AI-кейса.

### 5.5. Генерация сайтов для исследований Keysarium

Типичный сценарий совместного использования — превращение артефактов Keysarium в интерактивные веб-сайты:

```
# Создать сайт из executive summary исследования
/transcript-site researches/my-case/08_executive_summary.md

# Создать сайт из презентации
/transcript-site researches/my-case/05_presentation_content.md
```

---

## 6. Проверка установки

### 6.1. Команда doctor

Запустите `doctor` для проверки здоровья установки сразу после `init`:

```bash
npx @dzhechkov/skills-transcript-site doctor
```

Пример вывода при здоровой установке:

```
  Running health checks for @dzhechkov/skills-transcript-site v1.0.0...

  + Files exist              -- All 15 manifest files present
  + Skill pack               -- SKILL.md present, 6 modules, 4 references, 2 examples
  + Commands                 -- 3 command(s): transcript-site.md, transcript-site-generate.md, transcript-site-deploy.md
  + Rules                    -- 1 rule(s): transcript-site-quality.md
  + yt-dlp                   -- Found (v2024.12.06)
  + Keysarium integration    -- Active (Keysarium v1.0.0)

  6/6 checks passed -- Transcript Site installation is healthy!
```

Если `yt-dlp` не найден, doctor покажет предупреждение (не ошибку):

```
  ! yt-dlp                   -- Not found (YouTube extraction unavailable)
                                Install: pip install yt-dlp
```

### 6.2. Команда list

Для просмотра установленных компонентов с детальным перечнем файлов:

```bash
npx @dzhechkov/skills-transcript-site list
```

Вывод:

```
  @dzhechkov/skills-transcript-site v1.0.0

  Skill:
    .claude/skills/transcript-site-generator/SKILL.md (12.4 KB)
    .claude/skills/transcript-site-generator/modules/input-analysis.md (4.2 KB)
    .claude/skills/transcript-site-generator/modules/content-parsing.md (5.1 KB)
    .claude/skills/transcript-site-generator/modules/site-generation.md (8.3 KB)
    .claude/skills/transcript-site-generator/modules/interactivity.md (6.7 KB)
    .claude/skills/transcript-site-generator/modules/deploy.md (3.2 KB)
    .claude/skills/transcript-site-generator/modules/verification.md (3.8 KB)

  References:
    .claude/skills/transcript-site-generator/references/html-template.md (5.5 KB)
    .claude/skills/transcript-site-generator/references/tailwind-config.md (2.1 KB)
    .claude/skills/transcript-site-generator/references/seo-checklist.md (3.4 KB)
    .claude/skills/transcript-site-generator/references/accessibility-guide.md (2.8 KB)

  Examples:
    .claude/skills/transcript-site-generator/examples/sample-podcast.md (4.0 KB)
    .claude/skills/transcript-site-generator/examples/sample-youtube.md (5.2 KB)

  Commands:
    .claude/commands/transcript-site.md (3.5 KB)
    .claude/commands/transcript-site-generate.md (2.8 KB)
    .claude/commands/transcript-site-deploy.md (2.0 KB)

  Rules:
    .claude/rules/transcript-site-quality.md (4.1 KB)

  Total: 15 files, 81.1 KB
```

### 6.3. Проверка в Claude Code

Откройте Claude Code в директории проекта и убедитесь, что команды доступны:

```bash
# Откройте Claude Code в директории проекта
claude

# Внутри Claude Code проверьте доступность команд
# (просто введите в чате)
/transcript-site --help
```

---

## 7. Первый запуск -- пошаговое руководство

Этот раздел проводит вас через полный 6-шаговый пайплайн: от YouTube URL до готового сайта на GitHub Pages.

### 7.1. Сценарий A: YouTube URL

Мы создадим интерактивный сайт из транскрипта YouTube-видео.

#### Шаг 0: Подготовка

Убедитесь, что `yt-dlp` установлен:

```bash
yt-dlp --version
```

Выберите YouTube-видео с субтитрами (авто-сгенерированные тоже подходят).

#### Шаг 1: Запуск пайплайна

В Claude Code введите:

```
/transcript-site https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

Claude Code выполнит 6-шаговый пайплайн автоматически.

#### Шаг 2: Input Analysis (Анализ входных данных)

```
====================================================
Step 1/6: INPUT ANALYSIS
Source type: YouTube URL
Video ID: dQw4w9WgXcQ

Extracting metadata via yt-dlp...
  Title: "Example Video Title"
  Duration: 15:42
  Channel: Example Channel
  Upload date: 2025-06-15
  Language detected: en
  Subtitles: auto-generated (en)

Extracting transcript...
  Transcript length: 2,847 words
  Estimated sections: 8-12

Checkpoint 1/6: Input Analysis Complete
+ "ok" -- next step
+ "[feedback]" -- adjust
====================================================
```

Ответьте `ok` для продолжения.

#### Шаг 3: Content Parsing (Парсинг контента)

```
====================================================
Step 2/6: CONTENT PARSING
Input: 2,847 words transcript

Detected speakers: 2 (Speaker A, Speaker B)
Sections identified: 10
  1. Introduction (0:00-1:23)
  2. Topic Overview (1:23-3:45)
  3. Main Discussion Part 1 (3:45-6:12)
  ...

Timestamps mapped: 42 anchor points
Key quotes extracted: 8

Checkpoint 2/6: Content Parsing Complete
+ "ok" -- next step
+ "split [section]" -- split a section
+ "merge [sections]" -- merge sections
====================================================
```

#### Шаг 4: Site Generation (Генерация HTML)

```
====================================================
Step 3/6: SITE GENERATION
Template: YouTube transcript (with embed)
Theme: default (indigo)
Language: en

Generating HTML structure...
  index.html (48 KB)
  - Tailwind CSS CDN loaded
  - YouTube iframe embed with enablejsapi=1
  - Table of contents with 10 sections
  - 42 timestamp links with data-seek attributes
  - Speaker labels with color coding
  - SEO meta tags (OG, Twitter Card, JSON-LD VideoObject)

Checkpoint 3/6: Site Generation Complete
Files created: docs/index.html
+ "ok" -- next step
+ "change theme [color]" -- adjust color scheme
+ "add [feature]" -- add feature
====================================================
```

#### Шаг 5: Interactivity (Интерактивность)

```
====================================================
Step 4/6: INTERACTIVITY
Adding interactive features...

  + Search (Ctrl+K): debounced input, highlighted results
  + Dark mode toggle: localStorage persistence
  + Table of Contents: IntersectionObserver scroll-spy
  + Back-to-top button: appears on scroll > 300px
  + Copy quote buttons: Clipboard API with feedback
  + YouTube sync: timestamp clicks trigger seekTo()
  + Progress bar: reading progress indicator
  + Stats: word count, reading time, section count
  + Print stylesheet: clean print layout

All features: vanilla JS, no build step, event delegation

Checkpoint 4/6: Interactivity Complete
Files created: docs/index.html (updated, 62 KB)
+ "ok" -- next step
+ "remove [feature]" -- disable a feature
====================================================
```

#### Шаг 6: Deploy (Деплой)

```
====================================================
Step 5/6: DEPLOY CONFIGURATION
Target: GitHub Pages (docs/ folder)

Generated:
  docs/index.html       -- Main transcript page
  docs/robots.txt       -- Search engine configuration
  docs/sitemap.xml      -- Sitemap for SEO

GitHub Pages setup:
  1. Push docs/ to your repository
  2. Go to Settings > Pages
  3. Source: "Deploy from a branch"
  4. Branch: main, folder: /docs
  5. Site will be live at https://<user>.github.io/<repo>/

Checkpoint 5/6: Deploy Configuration Complete
+ "ok" -- next step
+ "custom domain [domain]" -- configure custom domain
====================================================
```

#### Шаг 7: Verification (Верификация)

```
====================================================
Step 6/6: VERIFICATION

HTML validation:
  + Valid HTML5 structure
  + All tags properly closed
  + No deprecated attributes

JS validation:
  + No syntax errors
  + Event delegation verified (no inline handlers)
  + escapeHtml/escapeRegex functions present

CSS validation:
  + Tailwind CDN loaded correctly
  + Dark mode classes present
  + Print stylesheet included

SEO validation:
  + Open Graph tags present (og:title, og:description, og:image)
  + Twitter Card tags present
  + JSON-LD structured data present
  + Canonical URL set

Accessibility validation:
  + Skip-nav link present
  + ARIA roles on navigation and main content
  + Keyboard navigation for search (Escape to close)
  + Alt text on images

Performance:
  + Total HTML size: 62 KB (under 100 KB target)
  + No external JS dependencies (except Tailwind CDN)
  + No render-blocking resources

All checks passed!

====================================================
PIPELINE COMPLETE

Transcript site generated successfully!

Output: docs/index.html (62 KB)
  - 10 sections, 42 timestamps, 8 key quotes
  - YouTube embed with sync
  - Search, dark mode, TOC, copy quotes
  - SEO: OG + Twitter Cards + JSON-LD
  - Ready for GitHub Pages deployment

To preview locally:
  open docs/index.html

To deploy:
  git add docs/
  git commit -m "add transcript site"
  git push
====================================================
```

### 7.2. Сценарий B: Текстовый транскрипт

Если у вас нет YouTube URL, вставьте текст транскрипта напрямую:

```
/transcript-site

Вставьте текст транскрипта:
---
[00:00] Host: Welcome to the podcast...
[00:15] Guest: Thank you for having me...
...
---
```

Или укажите путь к файлу:

```
/transcript-site /path/to/transcript.txt
```

Пайплайн идентичен, за исключением YouTube-специфичных шагов:
- Шаг 1 определит source type как `text` или `file`
- Шаг 3 не добавит YouTube embed
- Шаг 4 не добавит timestamp-sync с видео
- Всё остальное (search, dark mode, TOC, copy, SEO) работает так же

### 7.3. Сценарий C: Комбинированный (текст + YouTube)

Можно указать и URL, и текст (если авто-извлечённые субтитры неточны):

```
/transcript-site https://youtube.com/watch?v=... --text /path/to/corrected-transcript.txt
```

Скилл использует предоставленный текст для контента, а YouTube URL — для embed и метаданных.

---

## 8. Интеграция с @dzhechkov/keysarium

### 8.1. Автоматическое определение

При запуске `npx @dzhechkov/skills-transcript-site init` в директории, где уже установлен Keysarium (есть файл `.keysarium.json`), скилл автоматически выводит сообщение об интеграции и настраивается соответствующим образом.

Проверить интеграцию можно через `doctor`:

```bash
npx @dzhechkov/skills-transcript-site doctor
```

Строка `Keysarium integration` в выводе покажет статус:
- `Active (Keysarium v1.0.0)` — интеграция активна
- `Not installed (standalone mode)` — скилл работает автономно

### 8.2. Совместные сценарии

| Сценарий | Команда |
|---------|---------|
| Сайт из executive summary | `/transcript-site researches/<slug>/08_executive_summary.md` |
| Сайт из транскрипта конференции | `/transcript-site https://youtube.com/watch?v=...` |
| Сайт из speaker script | `/transcript-site researches/<slug>/06_speaker_script.md` |
| Оценка сгенерированного сайта | `/bto-test docs/index.html` |

### 8.3. Параллельное использование

Все команды доступны одновременно в одной сессии Claude Code. Пример workflow:

```
# Шаг 1: Исследование кейса
/casarium [описание кейса]

# Шаг 2: После завершения исследования — создать сайт из результатов
/transcript-site researches/my-case/05_presentation_content.md

# Шаг 3: Оценить сайт через BTO
/bto-test docs/index.html
```

---

## 9. Обновление и удаление

### 9.1. Обновление установки

Для обновления Transcript Site до последней версии:

```bash
npx @dzhechkov/skills-transcript-site update
```

Команда `update`:
1. Читает манифест `.transcript-site-skills.json`, определяет установленные компоненты
2. Сравнивает текущие файлы с шаблонами нового пакета
3. Показывает diff по каждому изменённому файлу
4. Запрашивает подтверждение перед обновлением

```bash
# Предпросмотр изменений без записи
npx @dzhechkov/skills-transcript-site update --dry-run
```

> **Рекомендация:** Перед обновлением зафиксируйте текущее состояние в git:
> ```bash
> git add .claude/ .transcript-site-skills.json
> git commit -m "snapshot before skills-transcript-site update"
> ```

### 9.2. Удаление установки

```bash
npx @dzhechkov/skills-transcript-site remove
```

Команда `remove` удаляет только файлы, перечисленные в манифесте. Файлы Keysarium (если они есть в тех же директориях) не затрагиваются. Сгенерированные сайты в `docs/` НЕ удаляются — они являются продуктом работы, а не частью установки.

После удаления манифест `.transcript-site-skills.json` также удаляется.

---

## 10. Устранение неполадок

### 10.1. Ошибка: "yt-dlp not found"

```
WARN  yt-dlp is not installed or not in PATH.
      YouTube URL provided but cannot extract transcript.
```

**Причина:** `yt-dlp` не установлен или не доступен в `PATH`.

**Решение:**

```bash
# Вариант 1: установить yt-dlp
pip install yt-dlp

# Вариант 2: установить через brew (macOS)
brew install yt-dlp

# Вариант 3: вставить транскрипт вручную
# При запуске /transcript-site без yt-dlp скилл предложит
# вставить текст транскрипта вручную

# Проверить, что yt-dlp виден из PATH
which yt-dlp
yt-dlp --version
```

Если `yt-dlp` установлен через pip, убедитесь, что Python `bin/` директория в `PATH`:

```bash
# Найти расположение yt-dlp
python -m site --user-base
# Добавить bin/ в PATH (Linux/macOS)
export PATH="$HOME/.local/bin:$PATH"
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

### 10.2. Ошибка: "node not found" или устаревшая версия

```
ERROR  Node.js is required but not found, or version is below 16.
```

**Решение:**

```bash
# Установить через nvm (рекомендуется)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### 10.3. Большой транскрипт: chunking

```
WARN  Transcript is very large (15,000+ words).
      Consider chunking into multiple pages.
```

**Причина:** Транскрипты длиннее 15,000 слов генерируют HTML файлы больше 200 KB, что замедляет загрузку.

**Решение:**

Скилл предложит два варианта:
1. **Single page с lazy loading:** Контент ниже viewport загружается по мере скролла. Работает для транскриптов до 30,000 слов.
2. **Multi-page:** Транскрипт разбивается по секциям на отдельные HTML-страницы с навигацией. Рекомендуется для транскриптов свыше 30,000 слов.

Для принудительного выбора стратегии:

```
/transcript-site [source] --chunking single
/transcript-site [source] --chunking multi
```

### 10.4. GitHub Pages 404

После деплоя сайт показывает 404.

**Причина 1:** GitHub Pages не настроен на директорию `docs/`.

**Решение:**
1. Перейдите в Settings > Pages в репозитории
2. Source: "Deploy from a branch"
3. Branch: `main` (или ваша ветка), Folder: `/docs`
4. Нажмите Save
5. Подождите 1-2 минуты, пока GitHub обработает деплой

**Причина 2:** Файл `docs/index.html` не зафиксирован в git.

**Решение:**
```bash
git add docs/
git commit -m "add transcript site"
git push origin main
```

**Причина 3:** Репозиторий приватный (GitHub Pages для приватных репо требует GitHub Pro).

**Решение:** Сделайте репозиторий публичным или используйте GitHub Pro/Team/Enterprise.

### 10.5. YouTube video не имеет субтитров

```
WARN  No subtitles found for video dQw4w9WgXcQ.
      Auto-generated captions not available.
```

**Решение:**

```bash
# Проверить доступность субтитров вручную
yt-dlp --list-subs https://youtube.com/watch?v=VIDEO_ID

# Если субтитров нет — используйте текстовый ввод
/transcript-site
# Затем вставьте транскрипт вручную
```

Для видео без субтитров можно использовать сторонние сервисы для транскрипции (Whisper, AssemblyAI, etc.), затем подать результат как текст.

### 10.6. Tailwind CDN не загружается (оффлайн)

```
WARN  Tailwind CSS Play CDN requires internet connection.
      Site will render without styles if opened offline.
```

**Решение для оффлайн-использования:**

Скилл может сгенерировать инлайн-стили вместо CDN:

```
/transcript-site [source] --tailwind inline
```

Это увеличит размер HTML на ~15-20 KB, но сайт будет работать полностью оффлайн.

### 10.7. Кодировка текста: кракозябры

**Причина:** Входной файл не в UTF-8.

**Решение:**

```bash
# Проверить кодировку файла
file transcript.txt

# Конвертировать в UTF-8
iconv -f WINDOWS-1251 -t UTF-8 transcript.txt > transcript-utf8.txt

# Использовать конвертированный файл
/transcript-site transcript-utf8.txt
```

### 10.8. Команды /transcript-site* не отображаются в Claude Code

**Причина 1:** Claude Code запущен не в директории проекта.

**Решение:**
```bash
ls .transcript-site-skills.json
# Если файл не найден — перейдите в правильную директорию
```

**Причина 2:** Claude Code был открыт до установки скилла.

**Решение:** Закройте и снова откройте Claude Code.

### 10.9. Dark mode не переключается

**Причина:** JavaScript заблокирован в браузере или CSP заголовки блокируют inline-скрипты.

**Решение:** Убедитесь, что JavaScript включён. Если используете CSP, добавьте `'unsafe-inline'` для скриптов или используйте nonce (скилл поддерживает конфигурацию CSP).

### 10.10. Таблица кодов выхода CLI

| Код | Значение |
|-----|---------|
| `0` | Успешное выполнение |
| `1` | Ошибка (неверные аргументы, файлы не найдены, проверки не пройдены) |

При коде выхода `1` в `doctor` — прочитайте раздел "Fix suggestions" в выводе. При коде `1` в `init` или `update` — прочитайте сообщение об ошибке и следуйте инструкциям.

### 10.11. Полезные диагностические команды

```bash
# Полная диагностика
npx @dzhechkov/skills-transcript-site doctor

# Проверка yt-dlp
yt-dlp --version
yt-dlp --list-subs https://youtube.com/watch?v=VIDEO_ID

# Проверка Node.js
node --version
npm --version

# Проверка Claude Code
claude --version

# Проверка файлов скилла
ls -la .claude/skills/transcript-site-generator/
ls -la .claude/commands/transcript-site*.md

# Проверка сгенерированного сайта
ls -la docs/
wc -c docs/index.html  # размер в байтах
```
