# Phase 0: Product Discovery

## Использование
```
/discovery [текст кейса или путь к директории исследования]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/reverse-engineering-unicorn/SKILL.md` → используй модули M2-M5
2. **Определи рабочую директорию** — если аргумент содержит путь к `researches/...`, работай там. Иначе — спроси или создай через `/new-research`.

3. **Выполни Product Discovery по шаблону:**

### A. Текущий процесс (As-Is One-Liner)
### B. Пользовательские сегменты (JTBD) — 3+ сегмента
### C. Voice of Customer
### D. Aha Moment для AI-решения
### E. Why AI, Why Now? — 4 фактора
### F. Конкурентный анализ — 3+ конкурента
### G. Business Case (предварительный) — ROI, окупаемость
### H. Adoption Strategy — Pilot → Rollout → Scale

4. **Создай файл** `00_product_discovery.md` в рабочей директории
5. **Покажи Checkpoint 0**

## Параллелизация (Agent Swarm)
Если есть возможность, запусти 2 агента параллельно:
- Agent 1: JTBD анализ + Voice of Customer + Aha Moment
- Agent 2: Конкурентный анализ + Business Case + Why AI Why Now
Затем синтезируй результаты.
