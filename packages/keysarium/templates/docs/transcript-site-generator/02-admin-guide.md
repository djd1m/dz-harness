# Руководство администратора @dzhechkov/skills-transcript-site

Это руководство описывает управление, настройку и обслуживание Transcript Site skill pack. Предназначено для администраторов, которые управляют компонентами скилла, настраивают пайплайн генерации, конфигурируют языковые настройки, SEO и безопасность.

---

## Содержание

1. [Управление компонентами скилла](#1-управление-компонентами-скилла)
2. [Конфигурация пайплайна (6 шагов)](#2-конфигурация-пайплайна-6-шагов)
3. [Языковая конфигурация](#3-языковая-конфигурация)
4. [SEO конфигурация](#4-seo-конфигурация)
5. [YouTube интеграция](#5-youtube-интеграция)
6. [Управление выходной директорией](#6-управление-выходной-директорией)
7. [Tailwind CDN vs self-hosted](#7-tailwind-cdn-vs-self-hosted)
8. [Dark mode конфигурация](#8-dark-mode-конфигурация)
9. [Print stylesheet управление](#9-print-stylesheet-управление)
10. [Производительность и большие транскрипты](#10-производительность-и-большие-транскрипты)
11. [Безопасность](#11-безопасность)

---

## 1. Управление компонентами скилла

### 1.1. Текущие компоненты

После установки Transcript Site включает следующие компоненты:

| Компонент | Путь | Назначение |
|-----------|------|------------|
| Skill | `.claude/skills/transcript-site-generator/` | Основной оркестратор: загружается командами |
| SKILL.md | `.claude/skills/transcript-site-generator/SKILL.md` | Точка входа, документирует все шесть модулей |
| Модуль Input Analysis | `.claude/skills/transcript-site-generator/modules/input-analysis.md` | Шаг 1: определение source type, извлечение метаданных |
| Модуль Content Parsing | `.claude/skills/transcript-site-generator/modules/content-parsing.md` | Шаг 2: разбиение на секции, определение спикеров |
| Модуль Site Generation | `.claude/skills/transcript-site-generator/modules/site-generation.md` | Шаг 3: генерация HTML, Tailwind, SEO meta |
| Модуль Interactivity | `.claude/skills/transcript-site-generator/modules/interactivity.md` | Шаг 4: search, TOC, dark mode, YouTube sync |
| Модуль Deploy | `.claude/skills/transcript-site-generator/modules/deploy.md` | Шаг 5: GitHub Pages, robots.txt, sitemap |
| Модуль Verification | `.claude/skills/transcript-site-generator/modules/verification.md` | Шаг 6: HTML/JS/CSS/SEO/a11y проверки |
| HTML шаблон | `.claude/skills/transcript-site-generator/references/html-template.md` | Базовая структура HTML |
| Tailwind конфиг | `.claude/skills/transcript-site-generator/references/tailwind-config.md` | Конфигурация Tailwind Play CDN |
| SEO чеклист | `.claude/skills/transcript-site-generator/references/seo-checklist.md` | Полный чеклист SEO-тегов |
| A11y руководство | `.claude/skills/transcript-site-generator/references/accessibility-guide.md` | Чеклист доступности |
| Пример подкаста | `.claude/skills/transcript-site-generator/examples/sample-podcast.md` | Пример: подкаст |
| Пример YouTube | `.claude/skills/transcript-site-generator/examples/sample-youtube.md` | Пример: YouTube видео |
| Команда /transcript-site | `.claude/commands/transcript-site.md` | Полный пайплайн |
| Команда /transcript-site-generate | `.claude/commands/transcript-site-generate.md` | Только генерация HTML |
| Команда /transcript-site-deploy | `.claude/commands/transcript-site-deploy.md` | Только деплой конфигурация |
| Правила качества | `.claude/rules/transcript-site-quality.md` | Автоматически применяемые правила |

### 1.2. Проверка компонентов

```bash
# Полная диагностика установки
npx @dzhechkov/skills-transcript-site doctor

# Листинг установленных файлов
npx @dzhechkov/skills-transcript-site list
```

### 1.3. Обновление отдельных компонентов

Команда `update` обновляет все компоненты из последней версии пакета. Для обновления отдельного файла:

```bash
# Шаг 1: просмотрите diff без применения
npx @dzhechkov/skills-transcript-site update --dry-run

# Шаг 2: скопируйте нужный файл из шаблонов пакета вручную
node -e "console.log(require.resolve('@dzhechkov/skills-transcript-site/package.json').replace('package.json', 'templates/'))"
```

### 1.4. Добавление пользовательских расширений

Для добавления собственных ссылочных материалов без изменения базовых файлов пакета создайте файлы с собственными именами:

```
.claude/skills/transcript-site-generator/references/
+-- html-template.md               <-- базовый (не изменять)
+-- tailwind-config.md              <-- базовый
+-- seo-checklist.md                <-- базовый
+-- accessibility-guide.md          <-- базовый
+-- custom-theme-corporate.md       <-- ваш файл (не перезапишется при update)
+-- custom-seo-banking.md           <-- ваш файл
```

### 1.5. Структура скилл-директории

Полная структура скилла:

```
.claude/skills/transcript-site-generator/
+-- SKILL.md                              <-- Оркестратор 6-шагового пайплайна
+-- modules/
|   +-- input-analysis.md                 <-- Шаг 1: source detection, yt-dlp, language
|   +-- content-parsing.md                <-- Шаг 2: sections, speakers, timestamps
|   +-- site-generation.md                <-- Шаг 3: HTML template, Tailwind, SEO
|   +-- interactivity.md                  <-- Шаг 4: search, TOC, dark mode, sync
|   +-- deploy.md                         <-- Шаг 5: GitHub Pages, robots, sitemap
|   +-- verification.md                   <-- Шаг 6: HTML/JS/CSS/SEO/a11y checks
+-- references/
|   +-- html-template.md                  <-- Базовая HTML-структура
|   +-- tailwind-config.md                <-- Tailwind Play CDN конфигурация
|   +-- seo-checklist.md                  <-- OG, Twitter Cards, JSON-LD
|   +-- accessibility-guide.md            <-- Skip-nav, ARIA, keyboard nav
+-- examples/
    +-- sample-podcast.md                 <-- Пример: подкаст-транскрипт
    +-- sample-youtube.md                 <-- Пример: YouTube-видео
```

---

## 2. Конфигурация пайплайна (6 шагов)

### 2.1. Архитектура пайплайна

Transcript Site использует линейный 6-шаговый пайплайн. Каждый шаг является предусловием для следующего:

```
Step 1        Step 2          Step 3           Step 4           Step 5       Step 6
INPUT     --> CONTENT     --> SITE          --> INTERACTIVITY --> DEPLOY  --> VERIFICATION
ANALYSIS      PARSING         GENERATION                         CONFIG
```

**Ключевое правило:** Каждый шаг завершается checkpoint-ом. Пользователь может дать обратную связь или подтвердить продолжение.

### 2.2. Customization points по шагам

| Шаг | Параметры настройки | Файл конфигурации |
|-----|-------------------|--------------------|
| Step 1 | yt-dlp опции, language detection override | `modules/input-analysis.md` |
| Step 2 | Section splitting strategy, speaker detection | `modules/content-parsing.md` |
| Step 3 | Theme color, HTML template, SEO tags | `modules/site-generation.md`, `references/html-template.md` |
| Step 4 | Feature toggles (search, dark mode, copy, stats) | `modules/interactivity.md` |
| Step 5 | Output directory, deploy target | `modules/deploy.md` |
| Step 6 | Verification strictness, custom checks | `modules/verification.md` |

### 2.3. Отключение шагов

Для пропуска отдельных шагов (не рекомендуется, но возможно):

```
/transcript-site [source] --skip-deploy     # Пропустить шаг 5
/transcript-site [source] --skip-verify     # Пропустить шаг 6
```

Шаги 1-4 являются обязательными и не могут быть пропущены.

### 2.4. Изменение порядка исполнения

Порядок шагов фиксирован и не подлежит изменению. Данные передаются последовательно: output каждого шага является input следующего.

Цепочка данных:

```
Step 1 output: { sourceType, metadata, rawTranscript, language }
Step 2 output: { sections[], speakers[], timestamps[], quotes[] }
Step 3 output: { htmlContent, cssConfig, seoTags }
Step 4 output: { htmlWithJS, features[] }
Step 5 output: { deployConfig, robotsTxt, sitemap }
Step 6 output: { validationReport, status }
```

---

## 3. Языковая конфигурация

### 3.1. Автоматическое определение языка

Шаг 1 (Input Analysis) автоматически определяет язык транскрипта:

- **YouTube URL:** Язык берётся из метаданных субтитров (поле `lang`)
- **Текстовый ввод:** Эвристика по частотности символов и стоп-слов
- **Файл:** Анализ первых 500 слов

Поддерживаемые языки: `ru` (русский), `en` (английский), `de`, `fr`, `es`, `pt`, `ja`, `zh`, `ko`.

### 3.2. Override языка

Для принудительной установки языка:

```
/transcript-site [source] --lang ru
/transcript-site [source] --lang en
```

### 3.3. UI String Tables

Интерфейс сгенерированного сайта (кнопки, подписи, placeholder-ы) переводится автоматически.

Таблица строк для русского (`ru`):

| Ключ | Значение |
|------|---------|
| `search.placeholder` | "Поиск по транскрипту... (Ctrl+K)" |
| `search.no_results` | "Ничего не найдено" |
| `search.results_count` | "Найдено: {count}" |
| `toc.title` | "Содержание" |
| `dark_mode.toggle` | "Тёмная тема" |
| `copy.button` | "Скопировать" |
| `copy.success` | "Скопировано!" |
| `back_to_top` | "Наверх" |
| `stats.words` | "слов" |
| `stats.reading_time` | "мин. чтения" |
| `stats.sections` | "разделов" |
| `print.title` | "Версия для печати" |

Таблица строк для английского (`en`):

| Ключ | Значение |
|------|---------|
| `search.placeholder` | "Search transcript... (Ctrl+K)" |
| `search.no_results` | "No results found" |
| `search.results_count` | "Found: {count}" |
| `toc.title` | "Table of Contents" |
| `dark_mode.toggle` | "Dark mode" |
| `copy.button` | "Copy" |
| `copy.success` | "Copied!" |
| `back_to_top` | "Back to top" |
| `stats.words` | "words" |
| `stats.reading_time` | "min read" |
| `stats.sections` | "sections" |
| `print.title` | "Print version" |

### 3.4. Добавление нового языка

Для добавления поддержки нового языка создайте пользовательский reference-файл:

```
.claude/skills/transcript-site-generator/references/custom-strings-ja.md
```

Формат:

```markdown
# UI Strings: Japanese (ja)

| Key | Value |
|-----|-------|
| search.placeholder | "... (Ctrl+K)" |
| ...
```

Затем при вызове укажите:

```
/transcript-site [source] --lang ja --strings references/custom-strings-ja.md
```

### 3.5. Двуязычные сайты

Для генерации сайта с двуязычным интерфейсом:

```
/transcript-site [source] --lang ru --ui-lang en
```

Контент будет на русском (определён из транскрипта), а интерфейс (кнопки, лейблы) — на английском.

---

## 4. SEO конфигурация

### 4.1. Open Graph теги

Шаг 3 (Site Generation) автоматически генерирует OG-теги:

```html
<meta property="og:title" content="[Title from metadata or first section]">
<meta property="og:description" content="[First 200 chars of transcript]">
<meta property="og:type" content="article">
<meta property="og:url" content="[canonical URL]">
<meta property="og:image" content="[YouTube thumbnail or placeholder]">
<meta property="og:locale" content="[detected language]">
<meta property="og:site_name" content="[repository name]">
```

Для YouTube-источников `og:image` автоматически берётся из thumbnail видео (maxresdefault.jpg).

### 4.2. Twitter Card теги

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="[Title]">
<meta name="twitter:description" content="[Description]">
<meta name="twitter:image" content="[Image URL]">
```

### 4.3. JSON-LD Structured Data

Для YouTube-транскриптов генерируется `VideoObject`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "[Title]",
  "description": "[Description]",
  "thumbnailUrl": "[Thumbnail URL]",
  "uploadDate": "[Upload date ISO-8601]",
  "duration": "[Duration ISO-8601]",
  "embedUrl": "https://www.youtube.com/embed/[VIDEO_ID]",
  "transcript": "[Full transcript text]"
}
</script>
```

Для текстовых транскриптов генерируется `Article`:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Title]",
  "description": "[Description]",
  "datePublished": "[Date]",
  "wordCount": [word count],
  "articleBody": "[Full transcript text]"
}
</script>
```

### 4.4. Настройка SEO

Для override SEO-параметров:

```
/transcript-site [source] --title "Custom Title" --description "Custom description" --image "https://example.com/og-image.jpg"
```

Для полного контроля создайте файл конфигурации:

```json
{
  "seo": {
    "title": "My Transcript",
    "description": "A detailed transcript of...",
    "image": "https://example.com/image.png",
    "canonical": "https://example.com/transcript/",
    "locale": "ru_RU",
    "twitter_creator": "@username"
  }
}
```

Передайте путь через:

```
/transcript-site [source] --seo-config seo.json
```

### 4.5. robots.txt и sitemap.xml

Шаг 5 (Deploy) автоматически генерирует:

**robots.txt:**
```
User-agent: *
Allow: /
Sitemap: https://[user].github.io/[repo]/sitemap.xml
```

**sitemap.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://[user].github.io/[repo]/</loc>
    <lastmod>[current date]</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

---

## 5. YouTube интеграция

### 5.1. yt-dlp конфигурация

Шаг 1 использует `yt-dlp` для извлечения данных из YouTube. Параметры по умолчанию:

```bash
# Извлечение субтитров
yt-dlp --write-auto-sub --sub-lang en,ru --skip-download --print-json [URL]

# Извлечение только метаданных
yt-dlp --dump-json [URL]
```

Для изменения параметров yt-dlp отредактируйте `modules/input-analysis.md`, секция "YouTube Extraction Protocol".

### 5.2. Приоритет субтитров

Порядок приоритета при выборе субтитров:

1. Ручные субтитры на определённом языке (`--lang`)
2. Ручные субтитры на языке видео
3. Авто-сгенерированные субтитры на определённом языке
4. Авто-сгенерированные субтитры на языке видео
5. Fallback: предложить пользователю вставить текст вручную

### 5.3. YouTube iframe API

Сгенерированный сайт использует YouTube iframe API для синхронизации:

```html
<iframe
  id="yt-player"
  src="https://www.youtube.com/embed/[VIDEO_ID]?enablejsapi=1&origin=[ORIGIN]"
  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
  allowfullscreen
></iframe>
```

Параметр `enablejsapi=1` обязателен для работы `seekTo()`.

### 5.4. Timestamp формат

Временные метки в транскрипте конвертируются в `data-seek` атрибуты:

```html
<a href="#" data-seek="125" class="timestamp-link text-indigo-600 hover:underline">
  [2:05]
</a>
```

JavaScript обработчик (event delegation через `data-seek`):

```javascript
document.addEventListener('click', function(e) {
  const seekTarget = e.target.closest('[data-seek]');
  if (seekTarget) {
    e.preventDefault();
    const seconds = parseInt(seekTarget.dataset.seek);
    player.seekTo(seconds, true);
  }
});
```

### 5.5. Отключение YouTube embed

Для генерации сайта без YouTube embed (только текст, даже при наличии URL):

```
/transcript-site [URL] --no-embed
```

Временные метки останутся как текст, но без интерактивной синхронизации с видео.

---

## 6. Управление выходной директорией

### 6.1. Директория по умолчанию

По умолчанию: `docs/` — стандартная директория для GitHub Pages.

### 6.2. Изменение директории

При инициализации:

```bash
npx @dzhechkov/skills-transcript-site init --output-dir public/
```

При запуске пайплайна:

```
/transcript-site [source] --output docs/my-transcript/
```

### 6.3. Структура выходных файлов

```
docs/
+-- index.html          <-- Основная страница транскрипта
+-- robots.txt          <-- Конфигурация для поисковых роботов
+-- sitemap.xml         <-- Карта сайта
```

При multi-page chunking:

```
docs/
+-- index.html          <-- Главная страница с навигацией
+-- section-01.html     <-- Секция 1
+-- section-02.html     <-- Секция 2
+-- ...
+-- robots.txt
+-- sitemap.xml
```

### 6.4. Очистка выходной директории

Скилл НЕ очищает директорию автоматически. Если вы перегенерируете сайт:

```bash
# Очистить вручную перед перегенерацией
rm docs/index.html docs/robots.txt docs/sitemap.xml

# Или через пайплайн с флагом
/transcript-site [source] --clean
```

Флаг `--clean` удалит только файлы, сгенерированные скиллом (по манифесту), не затрагивая пользовательские файлы в `docs/`.

### 6.5. Множественные сайты в одном репозитории

Для нескольких транскриптов в одном репозитории:

```
/transcript-site [source1] --output docs/podcast-ep1/
/transcript-site [source2] --output docs/podcast-ep2/
/transcript-site [source3] --output docs/conference-talk/
```

Каждый сайт будет независим и доступен по своему пути на GitHub Pages.

---

## 7. Tailwind CDN vs self-hosted

### 7.1. Tailwind Play CDN (по умолчанию)

По умолчанию сгенерированные сайты используют Tailwind CSS Play CDN:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script>
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          primary: {
            50: '#eef2ff',
            // ... full palette
            900: '#312e81'
          }
        }
      }
    }
  }
</script>
```

**Преимущества Play CDN:**
- Нет шага сборки
- Нет node_modules
- Автоматическая обработка всех utility classes
- Конфигурация в JS-объекте прямо в HTML

**Ограничения Play CDN:**
- Требует подключения к интернету при первой загрузке
- Не рекомендуется для production (по документации Tailwind)
- ~300 KB загрузки (кешируется браузером)

### 7.2. Self-hosted Tailwind (production)

Для production-окружений рекомендуется self-hosted Tailwind:

```
/transcript-site [source] --tailwind inline
```

Этот режим:
1. Определяет используемые utility classes в HTML
2. Генерирует минифицированный CSS только с нужными классами
3. Инлайнит CSS в `<style>` тег
4. Убирает зависимость от CDN

Результат: ~10-20 KB инлайн CSS вместо ~300 KB CDN загрузки.

### 7.3. Сравнение режимов

| Параметр | Play CDN | Self-hosted (inline) |
|----------|----------|---------------------|
| Интернет при просмотре | Требуется (первая загрузка) | Не требуется |
| Шаг сборки | Нет | Нет (генерируется скиллом) |
| Размер HTML | ~50 KB + ~300 KB CDN | ~70 KB (всё включено) |
| Кастомизация | tailwind.config в JS | Ограничена сгенерированными классами |
| Production-ready | Нет (по документации Tailwind) | Да |

### 7.4. Переключение режимов

Для существующего сайта:

```
/transcript-site-generate [source] --tailwind inline  # Перегенерировать с inline CSS
/transcript-site-generate [source] --tailwind cdn      # Перегенерировать с CDN
```

---

## 8. Dark mode конфигурация

### 8.1. Реализация

Dark mode реализован через CSS-класс `dark` на элементе `<html>`:

```html
<html lang="en" class="">
  <!-- class="dark" добавляется при активации -->
```

Tailwind утилиты:

```html
<body class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
```

### 8.2. Кнопка переключения

```html
<button id="dark-mode-toggle" aria-label="Toggle dark mode"
        class="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
  <svg id="icon-sun" class="hidden dark:block w-5 h-5">...</svg>
  <svg id="icon-moon" class="block dark:hidden w-5 h-5">...</svg>
</button>
```

### 8.3. Persistence через localStorage

```javascript
// При загрузке страницы
if (localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}

// При переключении
function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}
```

### 8.4. Порядок приоритетов

1. Явная настройка в localStorage (`theme: 'dark'` или `theme: 'light'`)
2. Системная настройка (`prefers-color-scheme: dark`)
3. По умолчанию: light

### 8.5. Отключение dark mode

```
/transcript-site [source] --no-dark-mode
```

Убирает кнопку переключения, все `dark:` утилиты и localStorage логику.

### 8.6. Кастомные цвета dark mode

Для изменения палитры dark mode отредактируйте `references/tailwind-config.md`:

```javascript
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Кастомная палитра для dark mode
        dark: {
          bg: '#0f172a',      // вместо gray-900
          text: '#e2e8f0',    // вместо gray-100
          accent: '#818cf8'   // вместо indigo-400
        }
      }
    }
  }
}
```

---

## 9. Print stylesheet управление

### 9.1. Print-специфичные стили

Сгенерированные сайты включают print stylesheet для корректной печати:

```html
<style media="print">
  @media print {
    /* Скрыть интерактивные элементы */
    #dark-mode-toggle,
    #search-container,
    #back-to-top,
    .copy-button,
    .timestamp-link,
    #yt-player,
    nav { display: none !important; }

    /* Типографика для печати */
    body {
      font-size: 11pt;
      line-height: 1.5;
      color: #000;
      background: #fff;
    }

    /* Разрывы страниц */
    h2 { page-break-before: always; }
    h2:first-of-type { page-break-before: avoid; }
    blockquote { page-break-inside: avoid; }

    /* Показать URL-ы ссылок */
    a[href]::after { content: " (" attr(href) ")"; }
  }
</style>
```

### 9.2. Отключение print stylesheet

```
/transcript-site [source] --no-print-styles
```

### 9.3. Кастомизация print стилей

Для изменения print стилей добавьте кастомный reference:

```
.claude/skills/transcript-site-generator/references/custom-print.md
```

Укажите при генерации:

```
/transcript-site [source] --print-styles references/custom-print.md
```

---

## 10. Производительность и большие транскрипты

### 10.1. Рекомендации по размеру

| Размер транскрипта | Стратегия | Ожидаемый размер HTML |
|-------------------|-----------|---------------------|
| До 5,000 слов | Single page, без chunking | ~30-50 KB |
| 5,000 - 15,000 слов | Single page, рекомендуется lazy TOC | ~50-100 KB |
| 15,000 - 30,000 слов | Single page с lazy loading контента | ~100-200 KB |
| Более 30,000 слов | Multi-page chunking | ~50 KB на страницу |

### 10.2. Chunking стратегия

При chunking транскрипт разбивается по секциям (определённым в Шаге 2). Каждая секция или группа секций становится отдельной HTML-страницей.

Настройки chunking в `modules/content-parsing.md`:

```markdown
## Chunking Configuration

- max_words_per_page: 10000
- min_words_per_page: 2000
- split_strategy: by_section  (альтернатива: by_word_count)
- navigation: prev/next + TOC on each page
```

### 10.3. Оптимизация поиска для больших транскриптов

Для транскриптов свыше 10,000 слов поиск использует debounce (300ms) и ограничивает количество подсвеченных результатов до 50 для предотвращения зависания DOM.

Настраиваемые параметры в `modules/interactivity.md`:

```markdown
## Search Configuration

- debounce_ms: 300
- max_highlights: 50
- min_query_length: 2
- case_sensitive: false
```

### 10.4. Lazy loading для длинных страниц

При single-page стратегии для транскриптов свыше 15,000 слов:

- Контент ниже 3-го viewport загружается через `IntersectionObserver`
- Placeholder-ы заменяются реальным контентом при приближении к viewport
- Первоначальная загрузка: только первые 5,000 слов + все заголовки секций

### 10.5. Метрики производительности

Шаг 6 (Verification) проверяет:

| Метрика | Порог | Действие при превышении |
|---------|-------|------------------------|
| HTML размер | < 200 KB | Предложить chunking |
| DOM nodes | < 5,000 | Предложить lazy loading |
| JS execution time (estimated) | < 100ms | Упростить search logic |
| First paint (estimated) | < 1s | Уменьшить inline CSS |

---

## 11. Безопасность

### 11.1. XSS предотвращение

Весь пользовательский контент (транскрипт, метаданные, спикеры) проходит через `escapeHtml()` перед вставкой в DOM:

```javascript
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
```

Поисковые запросы дополнительно проходят через `escapeRegex()`:

```javascript
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
```

### 11.2. Event delegation через data-* атрибуты

Сгенерированные сайты НЕ используют inline event handlers (`onclick`, `onload`, etc.). Вся интерактивность реализована через event delegation:

```javascript
// Правильно: event delegation
document.addEventListener('click', function(e) {
  const copyBtn = e.target.closest('[data-copy]');
  if (copyBtn) {
    // handle copy
  }

  const seekBtn = e.target.closest('[data-seek]');
  if (seekBtn) {
    // handle YouTube seek
  }
});
```

Это позволяет использовать строгий CSP без `'unsafe-inline'` для скриптов.

### 11.3. SRI (Subresource Integrity) хеши

Для Tailwind CDN и Font Awesome CDN генерируются SRI хеши:

```html
<script src="https://cdn.tailwindcss.com"
        integrity="sha384-[hash]"
        crossorigin="anonymous"></script>

<link rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
      integrity="sha384-[hash]"
      crossorigin="anonymous">
```

SRI гарантирует, что CDN-ресурсы не были модифицированы.

### 11.4. Content Security Policy (CSP)

Рекомендуемый CSP для сгенерированных сайтов:

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.tailwindcss.com https://www.youtube.com;
  style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com;
  frame-src https://www.youtube.com;
  img-src 'self' https://i.ytimg.com https://img.youtube.com data:;
  connect-src 'self';
">
```

CSP включается по умолчанию. Для отключения:

```
/transcript-site [source] --no-csp
```

### 11.5. postMessage origin restriction

При использовании YouTube iframe API, обработчик `message` событий проверяет origin:

```javascript
window.addEventListener('message', function(event) {
  if (event.origin !== 'https://www.youtube.com') return;
  // handle message
});
```

Это предотвращает XSS через iframe postMessage от сторонних доменов.

### 11.6. Чеклист безопасности

Шаг 6 (Verification) включает следующие проверки безопасности:

| Проверка | Описание |
|---------|---------|
| SEC-01 | Нет inline event handlers (onclick, onload, onerror) |
| SEC-02 | escapeHtml() вызывается для всего пользовательского контента |
| SEC-03 | escapeRegex() вызывается для поисковых запросов |
| SEC-04 | Event delegation через data-* атрибуты |
| SEC-05 | SRI хеши на всех CDN-ресурсах |
| SEC-06 | CSP meta-тег присутствует |
| SEC-07 | postMessage origin проверяется |
| SEC-08 | Нет eval(), innerHTML с пользовательскими данными, document.write() |

### 11.7. Безопасность для банковского домена

При обнаружении банковского контекста в транскрипте (ключевые слова: банк, ФЗ-152, ЦБ, персональные данные) скилл автоматически:

1. Применяет максимально строгий CSP
2. Убирает все внешние CDN-зависимости (inline всё)
3. Добавляет disclaimer о конфиденциальности
4. Предлагает self-hosted вместо GitHub Pages

Это поведение наследуется из Keysarium domain-specific rules.
