# Руководство администратора @dzhechkov/skills-edu-site

Это руководство описывает управление, настройку и обслуживание edu-site skill pack. Предназначено для администраторов, которые управляют компонентами скилла, настраивают пайплайн генерации, конфигурируют типы упражнений, тему оформления, систему достижений и параметры деплоя.

---

## Содержание

1. [Управление компонентами](#1-управление-компонентами)
2. [Конфигурация пайплайна (8 шагов)](#2-конфигурация-пайплайна-8-шагов)
3. [Конфигурация типов упражнений](#3-конфигурация-типов-упражнений)
4. [Конфигурация языка (ru/en)](#4-конфигурация-языка-ruen)
5. [Конфигурация Vite](#5-конфигурация-vite)
6. [Кастомизация TailwindCSS v4 темы](#6-кастомизация-tailwindcss-v4-темы)
7. [Конфигурация Zustand store](#7-конфигурация-zustand-store)
8. [Конфигурация системы достижений](#8-конфигурация-системы-достижений)
9. [Конфигурация финального теста](#9-конфигурация-финального-теста)
10. [SEO-конфигурация](#10-seo-конфигурация)
11. [Оптимизация производительности](#11-оптимизация-производительности)

---

## 1. Управление компонентами

### 1.1. Текущие компоненты

После установки edu-site включает следующие компоненты:

| Компонент | Путь | Назначение |
|-----------|------|------------|
| Edu-Site Skill | `.claude/skills/edu-site-generator/` | Основной оркестратор: загружается командой |
| SKILL.md | `.claude/skills/edu-site-generator/SKILL.md` | Точка входа, документирует все 8 модулей |
| Модуль Content Analysis | `.claude/skills/edu-site-generator/modules/01-content-analysis.md` | Анализ входных данных |
| Модуль Course Structure | `.claude/skills/edu-site-generator/modules/02-course-structure.md` | Планирование структуры курса |
| Модуль Data Generation | `.claude/skills/edu-site-generator/modules/03-data-generation.md` | Генерация файлов данных |
| Модуль Scaffold | `.claude/skills/edu-site-generator/modules/04-scaffold.md` | Создание каркаса проекта |
| Модуль Components | `.claude/skills/edu-site-generator/modules/05-components.md` | Генерация React-компонентов |
| Модуль Gamification | `.claude/skills/edu-site-generator/modules/06-gamification.md` | Настройка геймификации |
| Модуль Deploy | `.claude/skills/edu-site-generator/modules/07-deploy.md` | Конфигурация деплоя |
| Модуль Verification | `.claude/skills/edu-site-generator/modules/08-verification.md` | Верификация проекта |
| Справочник упражнений | `.claude/skills/edu-site-generator/references/exercise-types.md` | 6 типов упражнений |
| Паттерны компонентов | `.claude/skills/edu-site-generator/references/component-patterns.md` | React-паттерны |
| Справочник TailwindCSS v4 | `.claude/skills/edu-site-generator/references/tailwind-v4-guide.md` | TailwindCSS v4 API |
| Паттерны Zustand | `.claude/skills/edu-site-generator/references/zustand-patterns.md` | State management |
| Шаблоны достижений | `.claude/skills/edu-site-generator/references/achievement-templates.md` | Шаблоны ачивок |
| Команда /edu-site | `.claude/commands/edu-site.md` | Полный пайплайн |
| Правила генерации | `.claude/rules/edu-site-conventions.md` | Автоматически применяемые правила |

### 1.2. Проверка компонентов

```bash
# Полная диагностика установки
npx @dzhechkov/skills-edu-site doctor

# Листинг установленных файлов
npx @dzhechkov/skills-edu-site list
```

### 1.3. Обновление отдельных компонентов

Команда `update` обновляет все компоненты из последней версии пакета. Для обновления отдельного файла:

```bash
# Шаг 1: просмотрите diff без применения
npx @dzhechkov/skills-edu-site update --dry-run

# Шаг 2: при необходимости скопируйте нужный файл из шаблона пакета
node -e "console.log(require.resolve('@dzhechkov/skills-edu-site/package.json').replace('package.json', 'templates/'))"
```

### 1.4. Добавление пользовательских расширений

Для добавления собственных ссылочных материалов без изменения базовых файлов пакета создайте файлы с уникальными именами:

```
.claude/skills/edu-site-generator/references/
+-- exercise-types.md              <- базовый (не изменять)
+-- component-patterns.md          <- базовый
+-- tailwind-v4-guide.md           <- базовый
+-- zustand-patterns.md            <- базовый
+-- achievement-templates.md       <- базовый
+-- custom-exercise-type.md        <- ваш пользовательский файл
+-- custom-theme-palette.md        <- ваш пользовательский файл
```

### 1.5. Структура скилл-директории

Полная структура скилла edu-site-generator:

```
.claude/skills/edu-site-generator/
+-- SKILL.md                              <- Оркестратор: 8 шагов, зависимости, quick start
+-- modules/
|   +-- 01-content-analysis.md            <- Анализ контента: URL, файлы, текст
|   +-- 02-course-structure.md            <- Иерархия секций, порядок изучения
|   +-- 03-data-generation.md             <- sections.js, exercises.js, quizQuestions.js, achievements.js
|   +-- 04-scaffold.md                    <- Vite + React + TailwindCSS v4 + Zustand каркас
|   +-- 05-components.md                  <- Layout, interactive, common, pages
|   +-- 06-gamification.md               <- Zustand store, points, achievements, progress
|   +-- 07-deploy.md                      <- GitHub Actions, base path, Pages
|   +-- 08-verification.md               <- Import check, data validation, build test
+-- references/
|   +-- exercise-types.md                 <- 6 типов: Quiz, Flashcards, Matching, DragToOrder, CommandBuilder, ScenarioGame
|   +-- component-patterns.md             <- React 19 паттерны, hooks, composition
|   +-- tailwind-v4-guide.md              <- v4 syntax, @theme, CSS-first config
|   +-- zustand-patterns.md               <- persist, slices, selectors
|   +-- achievement-templates.md          <- Шаблоны достижений по категориям
+-- examples/
    +-- sample-sections.js                <- Пример структуры секций
    +-- sample-exercises.js               <- Пример упражнений всех 6 типов
```

---

## 2. Конфигурация пайплайна (8 шагов)

### 2.1. Архитектура пайплайна

Edu-site использует линейный 8-шаговый пайплайн. Каждый шаг зависит от результата предыдущего:

```
Step 1        Step 2          Step 3           Step 4
CONTENT   ->  COURSE      ->  DATA         ->  SCAFFOLD
ANALYSIS      STRUCTURE       GENERATION       (Vite project)

Step 5        Step 6          Step 7           Step 8
COMPONENTS -> GAMIFICATION -> DEPLOY        -> VERIFICATION
(React)       (Zustand)      (GitHub Pages)    (checks)
```

### 2.2. Шаг 1: Content Analysis

**Модуль:** `modules/01-content-analysis.md`

**Настраиваемые параметры:**

| Параметр | Значение по умолчанию | Описание |
|----------|----------------------|----------|
| `max_url_depth` | 3 | Глубина обхода ссылок при парсинге URL |
| `language_detection` | `auto` | Автоопределение языка (`auto`, `ru`, `en`) |
| `min_content_length` | 500 символов | Минимальная длина контента для анализа |
| `max_topics` | 20 | Максимальное число тем для извлечения |

Для изменения параметров отредактируйте секцию `## Configuration` в `01-content-analysis.md`.

### 2.3. Шаг 2: Course Structure

**Модуль:** `modules/02-course-structure.md`

**Настраиваемые параметры:**

| Параметр | Значение по умолчанию | Описание |
|----------|----------------------|----------|
| `max_sections` | 8 | Максимальное число секций |
| `min_exercises_per_section` | 2 | Минимум упражнений в секции |
| `max_exercises_per_section` | 6 | Максимум упражнений в секции |
| `difficulty_progression` | `linear` | Нарастание сложности (`linear`, `stepped`) |

### 2.4. Шаг 3: Data Generation

**Модуль:** `modules/03-data-generation.md`

Генерирует 4 JavaScript-файла с данными:

| Файл | Содержимое | Формат |
|------|-----------|--------|
| `sections.js` | Секции курса с описаниями, иконками | `export const sections = [...]` |
| `exercises.js` | Упражнения всех 6 типов | `export const exercises = [...]` |
| `quizQuestions.js` | Вопросы финального теста | `export const quizQuestions = [...]` |
| `achievements.js` | Достижения с критериями | `export const achievements = [...]` |

**Настройка формата данных:**

По умолчанию данные экспортируются как ES-модули (`.js` файлы с `export`). Если вам нужен другой формат, отредактируйте секцию `## Output Format` в `03-data-generation.md`.

### 2.5. Шаг 4: Scaffold

**Модуль:** `modules/04-scaffold.md`

Создаёт каркас проекта Vite + React + TailwindCSS v4. Параметры:

| Параметр | Значение по умолчанию | Описание |
|----------|----------------------|----------|
| `react_version` | `19` | Версия React |
| `vite_version` | `6` | Версия Vite |
| `tailwind_version` | `4` | Версия TailwindCSS |
| `zustand_version` | `5` | Версия Zustand |
| `router` | `HashRouter` | Тип роутера (HashRouter для GitHub Pages) |

### 2.6. Шаг 5: Components

**Модуль:** `modules/05-components.md`

Генерирует React-компоненты по 4 категориям:

| Категория | Компоненты | Назначение |
|-----------|-----------|------------|
| `layout/` | Header, Footer, Sidebar, Navigation | Макет приложения |
| `interactive/` | Quiz, Flashcards, Matching, DragToOrder, CommandBuilder, ScenarioGame | 6 типов упражнений |
| `common/` | Toast, ProgressBar, Badge, AchievementPopup, Button, Card | Общие UI-элементы |
| `pages/` | HomePage, SectionPage, FinalTestPage, ResultsPage | Страницы приложения |

### 2.7. Шаг 6: Gamification

**Модуль:** `modules/06-gamification.md`

Настройка системы геймификации. Подробнее в разделе [8. Конфигурация системы достижений](#8-конфигурация-системы-достижений).

### 2.8. Шаг 7: Deploy

**Модуль:** `modules/07-deploy.md`

Генерация GitHub Actions workflow. Подробнее в разделе [5. Конфигурация Vite](#5-конфигурация-vite).

### 2.9. Шаг 8: Verification

**Модуль:** `modules/08-verification.md`

5 проверок финальной верификации:

| Проверка | Что проверяется |
|---------|----------------|
| Import resolution | Все `import` в JSX-файлах указывают на существующие файлы |
| Data file structure | Файлы данных экспортируют массивы с корректной структурой |
| Component hierarchy | App -> Router -> Pages -> Layout + Sections -> Components |
| Router configuration | Все маршруты ведут на существующие компоненты-страницы |
| Build simulation | Проект собирается без ошибок (`npm run build` эмуляция) |

---

## 3. Конфигурация типов упражнений

### 3.1. 6 типов упражнений

Edu-site поддерживает 6 типов интерактивных упражнений. Каждый тип определён в `references/exercise-types.md`.

| Тип | Компонент | Описание | Когда использовать |
|-----|-----------|---------|-------------------|
| **Quiz** | `Quiz.jsx` | Вопрос с вариантами ответа (single/multiple choice) | Проверка знания фактов и определений |
| **Flashcards** | `Flashcards.jsx` | Карточки с вопросом на лицевой стороне и ответом на обратной | Запоминание терминов, команд, определений |
| **Matching** | `Matching.jsx` | Перетащить элементы из левой колонки к соответствующим в правой | Связывание концепций: команда-описание, термин-определение |
| **Drag-to-Order** | `DragToOrder.jsx` | Расположить элементы в правильном порядке перетаскиванием | Последовательности действий, приоритеты, этапы процессов |
| **Command Builder** | `CommandBuilder.jsx` | Собрать команду из отдельных частей (флаги, аргументы) | CLI-инструменты, SQL-запросы, API-вызовы |
| **Scenario Game** | `ScenarioGame.jsx` | Прочитать ситуацию и выбрать действие из нескольких вариантов | Принятие решений, troubleshooting, best practices |

### 3.2. Конфигурация маппинга контент-тип -> упражнение

В модуле `02-course-structure.md` определена логика выбора типа упражнения в зависимости от типа контента:

```
Тип контента              Рекомендуемый тип упражнения
---------------------------------------------------------
Определения, термины    -> Flashcards, Quiz
CLI-команды             -> CommandBuilder, DragToOrder
Процессы, workflows     -> DragToOrder, ScenarioGame
Концепции и связи       -> Matching, Quiz
API-справочники         -> CommandBuilder, Matching
Best practices          -> ScenarioGame, Quiz
Troubleshooting         -> ScenarioGame
```

Для изменения маппинга отредактируйте таблицу `## Content-to-Exercise Mapping` в `02-course-structure.md`.

### 3.3. Добавление нового типа упражнения

Для добавления кастомного типа упражнения:

1. Создайте файл `references/custom-exercise-type.md` с описанием:

```markdown
# Custom Exercise Type: CodeEditor

## Description
Интерактивный редактор кода с проверкой вывода.

## Component Interface
Props:
  - code: string (начальный код)
  - expectedOutput: string (ожидаемый вывод)
  - language: string (подсветка синтаксиса)

## Data Format
{
  "type": "code-editor",
  "code": "function hello() {\n  // ...\n}",
  "expectedOutput": "Hello, World!",
  "language": "javascript"
}

## Scoring
- Correct output: +10 points
- Partial match: +5 points
- No match: 0 points
```

2. Добавьте тип в маппинг `02-course-structure.md`
3. Обновите шаблон компонента в `05-components.md`

### 3.4. Настройка количества упражнений по типу на секцию

По умолчанию генератор выбирает типы упражнений автоматически на основе контента. Для принудительного задания пропорций добавьте в вызов `/edu-site` указание:

```
/edu-site "Git basics" --exercise-mix "quiz:3,flashcards:2,commandbuilder:4,matching:2"
```

Или отредактируйте параметр `exercise_mix` в `02-course-structure.md`:

```markdown
## Exercise Mix (per section)
- quiz: 30%
- flashcards: 20%
- matching: 15%
- drag-to-order: 10%
- command-builder: 15%
- scenario-game: 10%
```

---

## 4. Конфигурация языка (ru/en)

### 4.1. Автоопределение языка

По умолчанию генератор определяет язык контента автоматически на шаге Content Analysis:

- Если входные данные на русском — сайт генерируется на русском
- Если на английском — на английском
- Если смешанный — используется преобладающий язык

### 4.2. Принудительная установка языка

Для явного указания языка:

```
/edu-site "Docker basics" --lang ru
/edu-site "Основы Docker" --lang en
```

Или в модуле `01-content-analysis.md`:

```markdown
## Language Configuration
- Detection: auto | ru | en
- Default: auto
- Fallback: en (if auto-detection fails)
```

### 4.3. Локализованные элементы UI

В зависимости от выбранного языка меняются:

| Элемент | ru | en |
|---------|----|----|
| Кнопка "Далее" | "Далее" | "Next" |
| Прогресс | "Прогресс: 45%" | "Progress: 45%" |
| Достижения | "Достижения" | "Achievements" |
| Финальный тест | "Финальный тест" | "Final Test" |
| Тост уведомление | "Достижение разблокировано!" | "Achievement Unlocked!" |
| Результаты | "Результаты" | "Results" |
| Секция завершена | "Секция завершена!" | "Section Complete!" |
| Очки | "10 очков" | "10 points" |

Строки локализации генерируются в `src/data/strings.js` (если используется i18n) или хардкодятся в компонентах (для простых проектов).

---

## 5. Конфигурация Vite

### 5.1. Base path для GitHub Pages

Ключевой параметр — `base` в `vite.config.js`. Он определяет префикс URL для всех ресурсов.

**Для GitHub Pages (проектный сайт):**
```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/repository-name/',  // <-- имя репозитория
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

**Для GitHub Pages (user site, username.github.io):**
```javascript
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
```

**Для self-hosted (Nginx, Vercel, Netlify):**
```javascript
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
})
```

### 5.2. Настройка base path при генерации

Генератор спрашивает имя репозитория на шаге Scaffold (Step 4) и автоматически подставляет его в `base`. Если имя не указано, используется `/edu-site/` по умолчанию.

Для принудительного задания:

```
/edu-site "Git basics" --base /my-git-course/
```

### 5.3. Дополнительные параметры Vite

Для расширенной конфигурации отредактируйте `modules/04-scaffold.md`, секция `## Vite Configuration`:

```javascript
export default defineConfig({
  base: '/repo-name/',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    sourcemap: false,       // отключить source maps для production
    minify: 'terser',       // или 'esbuild' (быстрее)
    chunkSizeWarningLimit: 500, // KB
  },
  server: {
    port: 5173,
    open: true,             // автоматически открыть в браузере
  },
})
```

---

## 6. Кастомизация TailwindCSS v4 темы

### 6.1. Основы TailwindCSS v4

TailwindCSS v4 использует CSS-first конфигурацию вместо `tailwind.config.js`. Основная конфигурация темы находится в `src/app.css`:

```css
@import "tailwindcss";

@theme {
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-secondary: #10b981;
  --color-accent: #f59e0b;
  --color-background: #f8fafc;
  --color-surface: #ffffff;
  --color-text: #1e293b;
  --color-text-muted: #64748b;

  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  --radius-card: 0.75rem;
  --radius-button: 0.5rem;
  --radius-badge: 9999px;

  --shadow-card: 0 1px 3px rgb(0 0 0 / 0.1);
  --shadow-hover: 0 4px 12px rgb(0 0 0 / 0.15);
}
```

### 6.2. Предустановленные палитры

Генератор поддерживает несколько предустановленных палитр. Палитра выбирается автоматически на основе контента или указывается явно:

| Палитра | Цвета | Когда используется |
|---------|-------|-------------------|
| **Tech Blue** | Blue / Slate / Cyan | CLI-инструменты, DevOps, инфраструктура |
| **Green Learn** | Emerald / Lime / Teal | Общеобразовательные курсы |
| **Purple Code** | Violet / Indigo / Fuchsia | Программирование, алгоритмы |
| **Warm Orange** | Amber / Orange / Rose | Бизнес, маркетинг, soft skills |
| **Dark Mode** | Slate / Zinc + яркие акценты | Любой контент (альтернативная тема) |

Для принудительного выбора палитры:

```
/edu-site "Git basics" --palette tech-blue
```

### 6.3. Кастомная палитра

Для создания полностью кастомной палитры отредактируйте `@theme` блок в `src/app.css` после генерации или создайте файл `references/custom-theme-palette.md`:

```markdown
# Custom Theme: Corporate Brand

## Colors
- primary: #1a365d (brand blue)
- primary-dark: #0d1b2a
- secondary: #48bb78 (success green)
- accent: #ed8936 (orange)
- background: #f7fafc
- surface: #ffffff
- text: #2d3748
- text-muted: #718096

## Typography
- sans: 'Roboto', system-ui, sans-serif
- mono: 'Source Code Pro', monospace

## Radii
- card: 8px
- button: 4px
- badge: 9999px
```

### 6.4. Dark mode

TailwindCSS v4 поддерживает dark mode через `@variant dark`. Сгенерированный проект включает toggle кнопку в Header, которая переключает `class="dark"` на элементе `<html>`.

Для настройки dark mode цветов добавьте в `src/app.css`:

```css
@variant dark (&:where(.dark, .dark *)) {
  --color-background: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
}
```

---

## 7. Конфигурация Zustand store

### 7.1. Структура store

Zustand store сгенерированного проекта управляет следующими состояниями:

```javascript
// src/store/useStore.js
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const useStore = create(
  persist(
    (set, get) => ({
      // Прогресс по секциям
      completedExercises: {},    // { sectionId: Set<exerciseId> }
      sectionProgress: {},       // { sectionId: number (0-100) }

      // Очки и статистика
      totalPoints: 0,
      streak: 0,
      longestStreak: 0,

      // Достижения
      unlockedAchievements: [],  // [achievementId, ...]

      // Финальный тест
      finalTestScore: null,
      finalTestAnswers: {},

      // UI state
      currentSection: null,
      toastQueue: [],

      // Actions
      completeExercise: (sectionId, exerciseId, points) => { ... },
      unlockAchievement: (achievementId) => { ... },
      submitFinalTest: (answers) => { ... },
      showToast: (message, type) => { ... },
      resetProgress: () => { ... },
    }),
    {
      name: 'edu-site-storage',   // ключ localStorage
      version: 1,                  // версия для миграций
      partialize: (state) => ({
        // Сохраняем только нужное (не UI state)
        completedExercises: state.completedExercises,
        sectionProgress: state.sectionProgress,
        totalPoints: state.totalPoints,
        streak: state.streak,
        longestStreak: state.longestStreak,
        unlockedAchievements: state.unlockedAchievements,
        finalTestScore: state.finalTestScore,
        finalTestAnswers: state.finalTestAnswers,
      }),
    }
  )
)
```

### 7.2. Persist middleware

По умолчанию store сохраняется в `localStorage` через Zustand persist middleware. Ключевые настройки:

| Параметр | Значение | Описание |
|----------|---------|----------|
| `name` | `'edu-site-storage'` | Ключ в localStorage |
| `version` | `1` | Версия хранилища (для миграций) |
| `partialize` | Функция фильтрации | Исключает временные UI-данные |

### 7.3. Миграции при обновлении версии store

Если вы изменяете структуру store, увеличьте `version` и добавьте миграцию:

```javascript
persist(
  (set) => ({ /* ... */ }),
  {
    name: 'edu-site-storage',
    version: 2,   // увеличено с 1
    migrate: (persistedState, version) => {
      if (version === 1) {
        // Миграция с v1 на v2: добавить новое поле
        persistedState.favoriteExercises = []
      }
      return persistedState
    },
  }
)
```

### 7.4. Отключение persist (для тестирования)

Для отключения сохранения прогресса (например, при разработке):

```javascript
// Замените persist на простой create
const useStore = create((set) => ({
  // ... без обёртки persist
}))
```

---

## 8. Конфигурация системы достижений

### 8.1. Структура достижения

Каждое достижение определяется в `src/data/achievements.js`:

```javascript
export const achievements = [
  {
    id: 'first-exercise',
    title: 'First Step',
    description: 'Complete your first exercise',
    icon: 'rocket',           // имя иконки (emoji или SVG)
    criteria: {
      type: 'exercise_count', // тип критерия
      count: 1,               // порог
    },
    points: 50,               // бонусные очки за разблокировку
    rarity: 'common',         // common | uncommon | rare | epic | legendary
  },
  {
    id: 'perfect-section',
    title: 'Perfectionist',
    description: 'Complete all exercises in a section with 100% accuracy',
    icon: 'star',
    criteria: {
      type: 'section_perfect',
      sectionId: null,         // null = любая секция
    },
    points: 100,
    rarity: 'rare',
  },
  // ...
]
```

### 8.2. Типы критериев достижений

| Тип критерия | Описание | Параметры |
|-------------|---------|-----------|
| `exercise_count` | Выполнить N упражнений | `count: number` |
| `section_complete` | Завершить секцию | `sectionId: string | null` |
| `section_perfect` | 100% точность в секции | `sectionId: string | null` |
| `streak` | Серия правильных ответов | `count: number` |
| `points_total` | Набрать N очков | `count: number` |
| `all_sections` | Завершить все секции | (нет параметров) |
| `final_test_pass` | Сдать финальный тест | `minScore: number (0-100)` |
| `final_test_perfect` | 100% на финальном тесте | (нет параметров) |
| `exercise_type_master` | Выполнить N упражнений одного типа | `type: string, count: number` |
| `speed_run` | Завершить секцию за N минут | `sectionId: string, minutes: number` |

### 8.3. Настройка количества достижений

По умолчанию генератор создаёт 10-15 достижений. Для изменения:

```
/edu-site "Git basics" --achievements 20
```

Или в `modules/06-gamification.md`:

```markdown
## Achievement Count
- Minimum: 8
- Default: 12
- Maximum: 25

## Distribution by Rarity
- common: 40%
- uncommon: 25%
- rare: 20%
- epic: 10%
- legendary: 5%
```

### 8.4. Toast-уведомления при разблокировке

При разблокировке достижения показывается toast-уведомление через компонент `AchievementPopup`:

```javascript
// Zustand action
unlockAchievement: (achievementId) => {
  const state = get()
  if (state.unlockedAchievements.includes(achievementId)) return
  const achievement = achievements.find(a => a.id === achievementId)
  set({
    unlockedAchievements: [...state.unlockedAchievements, achievementId],
    totalPoints: state.totalPoints + achievement.points,
  })
  get().showToast(`Achievement Unlocked: ${achievement.title}!`, 'achievement')
}
```

---

## 9. Конфигурация финального теста

### 9.1. Структура финального теста

Финальный тест состоит из вопросов, сгенерированных из всех секций курса. Данные хранятся в `src/data/quizQuestions.js`:

```javascript
export const quizQuestions = [
  {
    id: 'q1',
    sectionId: 'getting-started',    // из какой секции
    question: 'What command initializes a new Git repository?',
    options: ['git init', 'git start', 'git new', 'git create'],
    correctAnswer: 0,                 // индекс правильного ответа
    explanation: 'git init creates a new .git directory...',
  },
  // ...
]
```

### 9.2. Количество вопросов

По умолчанию из каждой секции берётся 3-5 вопросов. Настройка:

| Параметр | Значение | Описание |
|----------|---------|----------|
| `questions_per_section` | 3-5 | Количество вопросов на секцию |
| `total_questions` | 15-30 | Общее число вопросов (зависит от секций) |
| `randomize` | `true` | Перемешивать порядок вопросов |

### 9.3. Порог прохождения

```markdown
## Passing Threshold
- Default: 70%
- Configurable: 50% - 100%
- Display: percentage + letter grade (A/B/C/D/F)
```

Для изменения порога отредактируйте `modules/06-gamification.md`:

```markdown
## Final Test
- Passing score: 70%
- Grade thresholds:
  - A: >= 90%
  - B: >= 80%
  - C: >= 70%
  - D: >= 60%
  - F: < 60%
```

### 9.4. Повторное прохождение

По умолчанию финальный тест можно пересдать неограниченное количество раз. Каждая попытка перезаписывает предыдущий результат в Zustand store.

---

## 10. SEO-конфигурация

### 10.1. Open Graph теги

Сгенерированный `index.html` включает OG-теги для корректного отображения в соцсетях:

```html
<meta property="og:title" content="Learn Git Basics - Interactive Course" />
<meta property="og:description" content="Master Git fundamentals with interactive exercises..." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://username.github.io/repo/" />
<meta property="og:image" content="https://username.github.io/repo/og-image.png" />
```

### 10.2. JSON-LD структурированные данные

Для поисковых систем генерируется JSON-LD разметка:

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "Learn Git Basics",
  "description": "Interactive course on Git fundamentals",
  "provider": {
    "@type": "Organization",
    "name": "Edu-Site Generator"
  },
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": "online",
    "courseWorkload": "PT2H"
  }
}
</script>
```

### 10.3. Настройка SEO-параметров

В модуле `04-scaffold.md` секция `## SEO Configuration`:

```markdown
## SEO Configuration
- og:title: auto-generated from course title
- og:description: auto-generated from course description (first 160 chars)
- og:image: placeholder or custom URL
- JSON-LD: Course schema
- lang attribute: auto-detected (ru/en)
- viewport: responsive
```

---

## 11. Оптимизация производительности

### 11.1. Code splitting (React.lazy)

Сгенерированный проект использует `React.lazy` для ленивой загрузки страниц:

```javascript
// src/App.jsx
import { lazy, Suspense } from 'react'

const HomePage = lazy(() => import('./pages/HomePage'))
const SectionPage = lazy(() => import('./pages/SectionPage'))
const FinalTestPage = lazy(() => import('./pages/FinalTestPage'))
const ResultsPage = lazy(() => import('./pages/ResultsPage'))

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      {/* routes */}
    </Suspense>
  )
}
```

### 11.2. Lazy loading компонентов упражнений

Интерактивные компоненты упражнений загружаются лениво при первом использовании:

```javascript
// src/components/interactive/index.js
export const Quiz = lazy(() => import('./Quiz'))
export const Flashcards = lazy(() => import('./Flashcards'))
export const Matching = lazy(() => import('./Matching'))
export const DragToOrder = lazy(() => import('./DragToOrder'))
export const CommandBuilder = lazy(() => import('./CommandBuilder'))
export const ScenarioGame = lazy(() => import('./ScenarioGame'))
```

### 11.3. Размер бандла

Ожидаемый размер production бандла:

| Компонент | Размер (gzip) |
|-----------|--------------|
| React + React DOM | ~45 KB |
| Zustand | ~1 KB |
| TailwindCSS (only used classes) | ~10-30 KB |
| Код приложения | ~20-50 KB |
| Данные (sections, exercises, etc.) | ~5-30 KB |
| **Итого** | **~80-160 KB** |

### 11.4. Рекомендации по контенту

| Параметр | Рекомендация | Обоснование |
|----------|-------------|-------------|
| Максимум секций | 8-10 | Больше секций замедляют загрузку данных |
| Упражнений на секцию | 3-5 | Баланс между полнотой и размером данных |
| Изображения | Избегать больших изображений | SPA без сервера — всё в бандле |
| Длина описаний | До 200 символов | Компактные тексты быстрее рендерятся |
