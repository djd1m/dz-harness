# Harvest — Ритуал извлечения знаний из проекта

## Использование
```
/harvest [путь к директории или "all"] [only категория1,категория2]
```

## Аргумент
$ARGUMENTS

## Скилл

```
Read: .claude/skills/knowledge-extractor/SKILL.md
```

Загрузи knowledge-extractor skill и следуй его Pipeline Protocol.

## Парсинг аргументов

1. **Путь:** Первый аргумент — путь к директории исследования или `"all"` для всех директорий в `researches/`
2. **Scope filter:** Если после пути есть `only X,Y` — передай как `{SCOPE_FILTER}` в skill
   - Допустимые значения: `skills`, `commands`, `hooks`, `rules`, `templates`, `patterns`, `snippets`
   - Множественные через запятую: `only rules,templates`
3. Если аргументов нет — запроси путь у пользователя

## Примеры

```
/harvest researches/bank-kc-automation/          ← полный harvest одной директории
/harvest researches/bank-kc-automation/ only patterns  ← только паттерны
/harvest all                                     ← все исследования
/harvest all only rules,templates                ← все исследования, только правила и шаблоны
/harvest features/add-user-auth/                 ← harvest фичи (не только исследования)
```

## Параллелизация

Если путь = `"all"`:
1. Получи список всех директорий в `researches/`
2. Для каждой директории запусти отдельную harvest сессию
3. Каждая сессия создаёт свой findings JSON и проходит полный pipeline
4. По завершении всех сессий — объедини отчёты

## Суть

Систематический процесс извлечения и организации полезных знаний после завершения проекта. Использует 5 параллельных агентов-экстракторов, 7-категорийную классификацию, 8 блокирующих quality gates, и автоматическое размещение артефактов.

Pipeline: Extract (5 agents) → Classify (7 categories) → User Checkpoint → Gate (8 checks) → Integrate (auto-place)
