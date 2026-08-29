# Пользовательские потоки @dzhechkov/skills-edu-site

## Содержание

1. [Flow: Полный пайплайн (8 шагов)](#flow-полный-пайплайн-8-шагов)
2. [Flow: Анализ контента](#flow-анализ-контента)
3. [Flow: Выбор типа упражнения](#flow-выбор-типа-упражнения)
4. [Flow: Упражнение Quiz](#flow-упражнение-quiz)
5. [Flow: Упражнение Flashcards](#flow-упражнение-flashcards)
6. [Flow: Упражнение Matching](#flow-упражнение-matching)
7. [Flow: Упражнение Drag-to-Order](#flow-упражнение-drag-to-order)
8. [Flow: Упражнение Command Builder](#flow-упражнение-command-builder)
9. [Flow: Упражнение Scenario Game](#flow-упражнение-scenario-game)
10. [Flow: Разблокировка достижения](#flow-разблокировка-достижения)
11. [Flow: Отслеживание прогресса](#flow-отслеживание-прогресса)
12. [Flow: Финальный тест](#flow-финальный-тест)
13. [Flow: Сборка и деплой](#flow-сборка-и-деплой)

---

## Flow: Полный пайплайн (8 шагов)

### Sequence Diagram

```mermaid
sequenceDiagram
    actor U as User
    participant C as Claude (/edu-site)
    participant FS as File System

    U->>C: /edu-site "Learn Git basics"

    Note over C: === Step 1: Content Analysis ===
    C->>C: Определить тип входа (topic description)
    C->>C: Generative mode: создать контент
    C->>C: Определить язык: en
    C->>C: Извлечь темы, концепции, термины
    C-->>U: Step 1/8: 12 topics, 34 concepts, lang=en

    Note over C: === Step 2: Course Structure ===
    C->>C: Кластеризация тем -> секции
    C->>C: Определить порядок изучения
    C->>C: Назначить типы упражнений
    C-->>U: Step 2/8: 5 sections, 19 exercises planned

    Note over C: === Step 3: Data Generation ===
    C->>FS: Write src/data/sections.js
    C->>FS: Write src/data/exercises.js
    C->>FS: Write src/data/quizQuestions.js
    C->>FS: Write src/data/achievements.js
    C-->>U: Step 3/8: 4 data files generated

    Note over C: === Step 4: Scaffold ===
    C->>FS: Write package.json
    C->>FS: Write vite.config.js (base: /git-basics/)
    C->>FS: Write index.html (OG tags, JSON-LD)
    C->>FS: Write src/app.css (@theme)
    C->>FS: Write src/main.jsx
    C->>FS: Write .github/workflows/deploy.yml
    C-->>U: Step 4/8: Project scaffold created

    Note over C: === Step 5: Components ===
    C->>FS: Write layout/ (Header, Footer, Sidebar, Navigation)
    C->>FS: Write interactive/ (Quiz, Flashcards, Matching, DragToOrder, CommandBuilder, ScenarioGame)
    C->>FS: Write common/ (Toast, ProgressBar, Badge, AchievementPopup, Button, Card)
    C->>FS: Write pages/ (HomePage, SectionPage, FinalTestPage, ResultsPage)
    C->>FS: Write sections/ (SectionList, ExerciseRenderer)
    C->>FS: Write App.jsx (HashRouter + Routes)
    C-->>U: Step 5/8: 22 components generated

    Note over C: === Step 6: Gamification ===
    C->>FS: Write src/store/useStore.js (Zustand + persist)
    C->>FS: Write src/hooks/useAchievements.js
    C-->>U: Step 6/8: Gamification configured

    Note over C: === Step 7: Deploy ===
    C->>C: Verify .github/workflows/deploy.yml exists
    C->>C: Verify vite.config.js base path
    C-->>U: Step 7/8: Deploy configuration ready

    Note over C: === Step 8: Verification ===
    C->>C: Check all imports resolve
    C->>C: Validate data file structures
    C->>C: Verify component hierarchy
    C->>C: Check router configuration
    C->>C: Simulate build (syntax check)
    C-->>U: Step 8/8: All 5 checks passed!

    C-->>U: Generation complete!
    C-->>U: Next: cd git-basics && npm install && npm run dev
```

### Пошаговый разбор

**Шаг 1. Запуск пайплайна**
```
User: /edu-site "Learn Git basics: init, add, commit, branch, merge, remote"
```

**Шаг 2. Content Analysis**
- Определяется тип входа: topic description (нет URL, нет пути к файлу)
- Активируется generative mode
- Язык: en (латинские термины)
- Извлекаются темы: init, add, commit, branch, merge, remote

**Шаг 3. Course Structure**
- Темы кластеризуются в 5 секций
- Порядок: Setup -> Basics -> Branching -> Merging -> Remote
- Каждой теме назначается тип упражнения

**Шаг 4-8. Генерация**
- Последовательная генерация всех артефактов
- Финальная верификация

---

## Flow: Анализ контента

### Flowchart

```mermaid
flowchart TD
    START(["/edu-site [input]"]) --> DETECT{"Тип входа?"}

    DETECT -->|"http:// или https://"| URL_FLOW
    DETECT -->|"Путь к файлу (.md, .txt)"| FILE_FLOW
    DETECT -->|"Длинный текст (> 500 символов)"| TEXT_FLOW
    DETECT -->|"Короткое описание"| TOPIC_FLOW

    subgraph URL_FLOW ["URL Flow"]
        FETCH["Fetch HTML страницы"]
        PARSE_HTML["Парсинг HTML:<br/>извлечь body content"]
        FOLLOW["Найти внутренние ссылки<br/>(depth <= 3)"]
        FETCH_MORE["Fetch дополнительных страниц"]
        MERGE_URL["Объединить весь контент"]

        FETCH --> PARSE_HTML --> FOLLOW --> FETCH_MORE --> MERGE_URL
    end

    subgraph FILE_FLOW ["File Flow"]
        READ_FILE["Прочитать файл(ы)"]
        DETECT_FORMAT{"Формат?"}
        PARSE_MD["Парсинг Markdown:<br/>заголовки, списки, код"]
        PARSE_TXT["Парсинг plain text:<br/>абзацы, пустые строки"]
        PARSE_FILE_HTML["Парсинг HTML:<br/>извлечь текст"]

        READ_FILE --> DETECT_FORMAT
        DETECT_FORMAT -->|".md"| PARSE_MD
        DETECT_FORMAT -->|".txt"| PARSE_TXT
        DETECT_FORMAT -->|".html"| PARSE_FILE_HTML
    end

    subgraph TEXT_FLOW ["Text Flow"]
        PARSE_TEXT["Парсинг текста:<br/>абзацы, заголовки, код"]
    end

    subgraph TOPIC_FLOW ["Topic Flow"]
        GENERATE["Generative mode:<br/>создать контент из знаний модели"]
    end

    MERGE_URL --> CLEAN
    PARSE_MD --> CLEAN
    PARSE_TXT --> CLEAN
    PARSE_FILE_HTML --> CLEAN
    PARSE_TEXT --> CLEAN
    GENERATE --> LANG

    CLEAN["Очистка контента:<br/>убрать навигацию, футеры,<br/>повторяющиеся блоки"] --> LANG

    LANG["Определение языка<br/>(auto / --lang)"] --> EXTRACT

    EXTRACT["Извлечение:<br/>- Темы (topics)<br/>- Концепции (concepts)<br/>- Термины (terms)<br/>- Примеры кода (code)"] --> OUTPUT

    OUTPUT["Structured Analysis Result:<br/>{language, topics, concepts,<br/>codeExamples, estimatedSections}"]
```

---

## Flow: Выбор типа упражнения

### Flowchart

```mermaid
flowchart TD
    CONTENT["Тема / подсекция"] --> ANALYZE{"Характеристика контента?"}

    ANALYZE -->|"Определения, глоссарий,<br/>термины с пояснениями"| FLASH["Flashcards<br/>(запоминание)"]

    ANALYZE -->|"CLI-команды, SQL,<br/>API-вызовы"| CMD["CommandBuilder<br/>(конструирование)"]

    ANALYZE -->|"Пошаговый процесс,<br/>последовательность действий"| DRAG["DragToOrder<br/>(упорядочивание)"]

    ANALYZE -->|"Парные связи:<br/>команда-описание,<br/>термин-значение"| MATCH["Matching<br/>(соотнесение)"]

    ANALYZE -->|"Ситуации, решения,<br/>best practices,<br/>troubleshooting"| SCEN["ScenarioGame<br/>(принятие решений)"]

    ANALYZE -->|"Теоретические факты,<br/>правила, синтаксис"| QUIZ["Quiz<br/>(проверка знаний)"]

    FLASH --> VALIDATE{"В секции уже есть<br/>этот тип?"}
    CMD --> VALIDATE
    DRAG --> VALIDATE
    MATCH --> VALIDATE
    SCEN --> VALIDATE
    QUIZ --> VALIDATE

    VALIDATE -->|"< max per type"| ACCEPT["Принять выбор"]
    VALIDATE -->|">= max per type"| FALLBACK["Выбрать<br/>альтернативный тип"]
    FALLBACK --> ACCEPT
```

---

## Flow: Упражнение Quiz

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant Q as Quiz Component
    participant STORE as Zustand Store

    S->>Q: Открыть упражнение
    Q->>Q: Отрисовать вопрос + 4 варианта
    Q->>Q: Все кнопки активны, ни одна не выбрана

    S->>Q: Нажать на вариант ответа

    alt Правильный ответ
        Q->>Q: Подсветить выбранный зелёным
        Q->>Q: Показать explanation
        Q->>STORE: completeExercise(sectionId, exerciseId, 10)
        STORE->>STORE: totalPoints += 10, streak += 1
    else Неправильный ответ
        Q->>Q: Подсветить выбранный красным
        Q->>Q: Подсветить правильный зелёным
        Q->>Q: Показать explanation
        Q->>STORE: completeExercise(sectionId, exerciseId, 0)
        STORE->>STORE: streak = 0
    end

    Q->>S: Показать кнопку "Далее"
    S->>Q: Нажать "Далее"
    Q->>Q: Перейти к следующему упражнению
```

---

## Flow: Упражнение Flashcards

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant F as Flashcards Component
    participant STORE as Zustand Store

    S->>F: Открыть упражнение
    F->>F: Показать первую карточку (front)
    F->>F: Отобразить "1 / N карточек"

    loop Для каждой карточки
        S->>F: Нажать на карточку / пробел
        F->>F: Анимация flip
        F->>F: Показать back (ответ)

        alt Студент знает ответ
            S->>F: Нажать "Знаю"
            F->>STORE: completeExercise(sectionId, cardId, 10)
            STORE->>STORE: totalPoints += 10
            F->>F: Убрать карточку из стопки
        else Студент не знает
            S->>F: Нажать "Повторить"
            F->>F: Вернуть карточку в конец стопки
        end

        F->>F: Показать следующую карточку
    end

    F->>F: Все карточки отмечены как "Знаю"
    F->>S: Показать "Все карточки изучены!"
```

---

## Flow: Упражнение Matching

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant M as Matching Component
    participant STORE as Zustand Store

    S->>M: Открыть упражнение
    M->>M: Отрисовать 2 колонки<br/>(левая перемешана, правая перемешана)

    loop Для каждой пары
        S->>M: Перетащить элемент из левой колонки
        M->>M: Визуальная обратная связь (drag indicator)
        S->>M: Бросить на элемент правой колонки
        M->>M: Соединить пару (визуальная линия)
    end

    S->>M: Нажать "Проверить"
    M->>M: Сравнить с correctPairs

    alt Все пары верны
        M->>M: Подсветить все зелёным
        M->>STORE: completeExercise(sectionId, exerciseId, 10)
        STORE->>STORE: totalPoints += 10, streak += 1
    else 75%+ верны
        M->>M: Верные зелёным, неверные красным
        M->>STORE: completeExercise(sectionId, exerciseId, 5)
        STORE->>STORE: totalPoints += 5
    else Менее 75% верны
        M->>M: Показать правильные соответствия
        M->>STORE: completeExercise(sectionId, exerciseId, 0)
        STORE->>STORE: streak = 0
    end

    M->>S: Показать результат + кнопку "Далее"
```

---

## Flow: Упражнение Drag-to-Order

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant D as DragToOrder Component
    participant STORE as Zustand Store

    S->>D: Открыть упражнение
    D->>D: Отрисовать перемешанный список элементов

    loop Перестановка элементов
        S->>D: Захватить элемент (drag start)
        D->>D: Визуальное выделение + placeholder
        S->>D: Переместить на новую позицию (drag over)
        D->>D: Показать индикатор позиции вставки
        S->>D: Отпустить (drop)
        D->>D: Переставить элемент в новую позицию
    end

    S->>D: Нажать "Проверить порядок"
    D->>D: Сравнить currentOrder с correctOrder

    alt Полностью верный порядок
        D->>D: Анимация успеха
        D->>STORE: completeExercise(sectionId, exerciseId, 10)
        STORE->>STORE: totalPoints += 10, streak += 1
    else 1 перестановка от верного
        D->>D: Показать "Почти! Один элемент не на месте"
        D->>D: Подсветить неверный элемент
        D->>STORE: completeExercise(sectionId, exerciseId, 5)
    else Более 1 ошибки
        D->>D: Показать правильный порядок
        D->>STORE: completeExercise(sectionId, exerciseId, 0)
        STORE->>STORE: streak = 0
    end

    D->>S: Показать результат + кнопку "Далее"
```

---

## Flow: Упражнение Command Builder

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant CB as CommandBuilder Component
    participant STORE as Zustand Store

    S->>CB: Открыть упражнение
    CB->>CB: Показать инструкцию: "Собери команду для..."
    CB->>CB: Отрисовать доступные части (кнопки/чипы)
    CB->>CB: Показать пустую строку сборки

    loop Сборка команды
        S->>CB: Нажать на часть команды
        CB->>CB: Добавить часть в строку сборки
        CB->>CB: Визуально отключить использованную часть

        opt Удаление части
            S->>CB: Нажать на часть в строке сборки
            CB->>CB: Удалить часть из строки
            CB->>CB: Вернуть часть в доступные
        end
    end

    S->>CB: Нажать "Проверить команду"
    CB->>CB: Сравнить с correctCommand

    alt Точное совпадение с correctCommand
        CB->>CB: Подсветить строку зелёным
        CB->>CB: Показать "Верно!"
        CB->>STORE: completeExercise(sectionId, exerciseId, 10)
        STORE->>STORE: totalPoints += 10, streak += 1
    else Совпадение с acceptableAlternatives
        CB->>CB: Подсветить строку жёлтым
        CB->>CB: Показать "Допустимо, но есть лучший вариант"
        CB->>STORE: completeExercise(sectionId, exerciseId, 5)
    else Не совпадает
        CB->>CB: Подсветить строку красным
        CB->>CB: Показать правильную команду
        CB->>STORE: completeExercise(sectionId, exerciseId, 0)
        STORE->>STORE: streak = 0
    end

    CB->>S: Показать результат + кнопку "Далее"
```

---

## Flow: Упражнение Scenario Game

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant SG as ScenarioGame Component
    participant STORE as Zustand Store

    S->>SG: Открыть упражнение
    SG->>SG: Показать текст ситуации (situation)
    SG->>SG: Отрисовать варианты действий (choices)

    S->>SG: Выбрать вариант действия

    SG->>SG: Показать outcome для выбранного варианта
    SG->>SG: Выделить оптимальный вариант

    alt Выбран оптимальный вариант (isOptimal: true)
        SG->>SG: Подсветить зелёным
        SG->>SG: Показать outcome: "Отличный выбор! ..."
        SG->>STORE: completeExercise(sectionId, exerciseId, 10)
        STORE->>STORE: totalPoints += 10, streak += 1
    else Выбран допустимый вариант (points: 5)
        SG->>SG: Подсветить жёлтым
        SG->>SG: Показать outcome: "Сработает, но..."
        SG->>SG: Показать оптимальный вариант для сравнения
        SG->>STORE: completeExercise(sectionId, exerciseId, 5)
    else Выбран плохой вариант (points: 0)
        SG->>SG: Подсветить красным
        SG->>SG: Показать outcome: "Это приведёт к..."
        SG->>SG: Показать оптимальный вариант
        SG->>STORE: completeExercise(sectionId, exerciseId, 0)
        STORE->>STORE: streak = 0
    end

    SG->>S: Показать кнопку "Далее"
```

---

## Flow: Разблокировка достижения

### Flowchart

```mermaid
flowchart TD
    EVENT["Событие:<br/>упражнение выполнено /<br/>секция завершена /<br/>тест сдан"] --> CHECK_ALL

    CHECK_ALL["Проверить ВСЕ<br/>незаблокированные достижения"] --> LOOP

    LOOP{"Для каждого<br/>незаблокированного<br/>достижения"}

    LOOP --> CHECK_TYPE{"Тип критерия?"}

    CHECK_TYPE -->|"exercise_count"| C1["totalCompleted >= count?"]
    CHECK_TYPE -->|"section_complete"| C2["sectionProgress[id] == 100?"]
    CHECK_TYPE -->|"section_perfect"| C3["Все упражнения секции<br/>выполнены с max points?"]
    CHECK_TYPE -->|"streak"| C4["currentStreak >= count?"]
    CHECK_TYPE -->|"points_total"| C5["totalPoints >= count?"]
    CHECK_TYPE -->|"all_sections"| C6["Все секции завершены?"]
    CHECK_TYPE -->|"final_test_pass"| C7["finalTestScore >= minScore?"]
    CHECK_TYPE -->|"final_test_perfect"| C8["finalTestScore == 100?"]

    C1 --> MET{"Критерий<br/>выполнен?"}
    C2 --> MET
    C3 --> MET
    C4 --> MET
    C5 --> MET
    C6 --> MET
    C7 --> MET
    C8 --> MET

    MET -->|"Нет"| LOOP
    MET -->|"Да"| UNLOCK["unlockAchievement(id)"]

    UNLOCK --> ADD_POINTS["totalPoints += achievement.points"]
    ADD_POINTS --> TOAST["showToast:<br/>'Achievement Unlocked:<br/>[title]!'"]
    TOAST --> ANIMATE["Toast notification:<br/>иконка + название + очки<br/>автозакрытие через 4 сек"]
    ANIMATE --> PERSIST["persist -> localStorage"]
    PERSIST --> LOOP
```

### Пример потока

```
Событие: студент выполнил 10-е упражнение подряд (streak = 10)

Проверка достижений:
  - "first-exercise" (exercise_count: 1) -> уже разблокировано -> SKIP
  - "fast-learner" (exercise_count: 5)   -> уже разблокировано -> SKIP
  - "streak-5" (streak: 5)              -> уже разблокировано -> SKIP
  - "streak-10" (streak: 10)            -> streak=10 >= 10    -> UNLOCK!

Результат:
  -> unlockAchievement("streak-10")
  -> totalPoints += 100 (rarity: rare)
  -> Toast: "Achievement Unlocked: On Fire! +100 pts"
  -> persist to localStorage
```

---

## Flow: Отслеживание прогресса

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant EX as Exercise Component
    participant STORE as Zustand Store
    participant UI as UI Components
    participant LS as localStorage

    S->>EX: Завершить упражнение
    EX->>STORE: completeExercise(sectionId, exerciseId, points)

    STORE->>STORE: Добавить exerciseId в completedExercises[sectionId]
    STORE->>STORE: Пересчитать sectionProgress[sectionId]

    Note over STORE: sectionProgress = <br/>completedCount / totalExercisesInSection * 100

    STORE->>LS: persist({ completedExercises, sectionProgress, ... })

    alt Секция завершена (progress = 100%)
        STORE->>STORE: Проверить достижение section_complete
        STORE->>UI: showToast("Section Complete! +25 pts")
    end

    STORE->>UI: Re-render (через подписку)

    UI->>UI: Обновить ProgressBar в Sidebar
    UI->>UI: Обновить секционный прогресс на HomePage
    UI->>UI: Обновить общий прогресс в Header
```

### Формула прогресса

```
Прогресс секции:
  sectionProgress[id] = (completedExercises[id].size / totalExercises[id]) * 100

Общий прогресс:
  overallProgress = sum(completedExercises[*].size) / totalExercises * 100

Где totalExercises для секции = exercises.filter(e => e.sectionId === id).length
```

---

## Flow: Финальный тест

### Sequence Diagram

```mermaid
sequenceDiagram
    actor S as Студент
    participant FT as FinalTestPage
    participant STORE as Zustand Store

    S->>FT: Перейти на "Финальный тест"
    FT->>FT: Загрузить quizQuestions.js
    FT->>FT: Перемешать порядок вопросов
    FT->>FT: Показать "Вопрос 1 из N"

    loop Для каждого вопроса
        FT->>S: Показать вопрос + 4 варианта
        S->>FT: Выбрать ответ
        FT->>FT: Сохранить ответ в локальный state
        FT->>FT: Перейти к следующему вопросу

        opt Навигация назад
            S->>FT: Нажать "Предыдущий"
            FT->>FT: Вернуться к предыдущему вопросу
            FT->>FT: Показать ранее выбранный ответ
        end
    end

    S->>FT: Нажать "Завершить тест"

    FT->>FT: Подсчитать результат:<br/>correctCount / totalQuestions * 100

    FT->>STORE: submitFinalTest(answers)
    STORE->>STORE: finalTestScore = score
    STORE->>STORE: finalTestAnswers = { q1: 2, q2: 0, ... }

    alt Score >= passingThreshold (70%)
        STORE->>STORE: Проверить достижение final_test_pass
        alt Score == 100%
            STORE->>STORE: Проверить достижение final_test_perfect
        end
    end

    FT->>S: Redirect -> ResultsPage

    Note over S: ResultsPage показывает:
    Note over S: - Общий балл (%)
    Note over S: - Буквенная оценка (A/B/C/D/F)
    Note over S: - Breakdown по секциям
    Note over S: - Неверные ответы с пояснениями
    Note over S: - Кнопка "Пройти заново"
```

### Flowchart результатов

```mermaid
flowchart TD
    SCORE["Финальный балл"] --> GRADE{"Оценка"}

    GRADE -->|">= 90%"| A["Grade A: Excellent"]
    GRADE -->|"80-89%"| B["Grade B: Good"]
    GRADE -->|"70-79%"| C["Grade C: Satisfactory<br/>(passing)"]
    GRADE -->|"60-69%"| D["Grade D: Needs Improvement"]
    GRADE -->|"< 60%"| F["Grade F: Failing"]

    A --> DISPLAY
    B --> DISPLAY
    C --> DISPLAY
    D --> DISPLAY
    F --> DISPLAY

    DISPLAY["Страница результатов:<br/>- Балл: X%<br/>- Оценка: [A-F]<br/>- Секции: breakdown<br/>- Ошибки: пояснения"]

    DISPLAY --> ACTIONS{"Действия"}
    ACTIONS -->|"Пройти заново"| RETRY["Сбросить ответы,<br/>перемешать вопросы"]
    ACTIONS -->|"Вернуться к разделам"| REVIEW["Перейти на HomePage,<br/>изучить слабые секции"]
```

---

## Flow: Сборка и деплой

### Flowchart

```mermaid
flowchart TD
    START(["Проект сгенерирован"]) --> INSTALL

    subgraph LOCAL ["Локальная разработка"]
        INSTALL["npm install<br/>(установка зависимостей)"]
        DEV["npm run dev<br/>(Vite dev server)"]
        EDIT["Редактирование файлов<br/>(опционально)"]
        BUILD["npm run build<br/>(production сборка)"]
        PREVIEW["npm run preview<br/>(проверка локально)"]

        INSTALL --> DEV
        DEV --> EDIT
        EDIT --> DEV
        DEV --> BUILD
        BUILD --> PREVIEW
    end

    PREVIEW --> PUSH

    subgraph DEPLOY ["GitHub Pages Deploy"]
        PUSH["git push origin main"]
        TRIGGER["GitHub Actions:<br/>workflow triggered"]
        GH_INSTALL["npm install"]
        GH_BUILD["npm run build"]
        UPLOAD["Upload dist/ artifact"]
        PAGES["Deploy to GitHub Pages"]
        LIVE["Сайт доступен:<br/>https://user.github.io/repo/"]

        PUSH --> TRIGGER
        TRIGGER --> GH_INSTALL
        GH_INSTALL --> GH_BUILD
        GH_BUILD --> UPLOAD
        UPLOAD --> PAGES
        PAGES --> LIVE
    end

    subgraph ALT ["Альтернативный деплой"]
        VERCEL["vercel --prod<br/>(Vercel)"]
        NETLIFY["netlify deploy --prod<br/>(Netlify)"]
        NGINX["Копировать dist/ на сервер<br/>(Nginx / Apache)"]
        LOCAL_OPEN["Открыть dist/index.html<br/>(локально, offline)"]
    end

    BUILD --> VERCEL
    BUILD --> NETLIFY
    BUILD --> NGINX
    BUILD --> LOCAL_OPEN
```

### GitHub Actions workflow шаг за шагом

```
1. Push в ветку main
   -> GitHub Actions detect push event

2. Job: build
   -> Checkout репозитория
   -> Setup Node.js 20
   -> npm install (cached)
   -> npm run build
   -> Upload dist/ as artifact

3. Job: deploy (depends on build)
   -> Download artifact
   -> Deploy to GitHub Pages
   -> Output: page URL

4. Результат:
   -> https://user.github.io/repo/ доступен
   -> SPA загружается с хешированным JS/CSS
   -> HashRouter обрабатывает маршруты клиентски
```

---

## Быстрый справочник

### Потоки генерации (администратор)

| Шаг | Модуль | Вход | Выход |
|-----|--------|------|-------|
| 1 | Content Analysis | URL / файл / текст / тема | Structured analysis |
| 2 | Course Structure | Structured analysis | Секции + маппинг упражнений |
| 3 | Data Generation | Структура курса | 4 файла .js |
| 4 | Scaffold | Метаданные проекта | Каркас Vite + React |
| 5 | Components | Список компонентов | 22 JSX-файла |
| 6 | Gamification | Данные достижений | Zustand store + hooks |
| 7 | Deploy | Имя репозитория | GitHub Actions workflow |
| 8 | Verification | Весь проект | 5 проверок: PASS/FAIL |

### Потоки обучения (студент)

| Действие | Компоненты | Результат |
|---------|-----------|----------|
| Выполнение упражнения | Exercise -> Store -> Toast | +10 pts, streak update |
| Завершение секции | SectionPage -> Store -> Toast | +25 pts, progress 100% |
| Разблокировка достижения | Store -> AchievementPopup -> Toast | +50-200 pts |
| Прохождение финального теста | FinalTestPage -> Store -> ResultsPage | Оценка A-F |
| Просмотр прогресса | Sidebar, Header, HomePage | % по секциям и общий |
