# Phase 3: Solve — Стратегия решения

## Использование
```
/solve [путь к директории исследования]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/problem-solver-enhanced/SKILL.md`
2. **Прочитай Phase 0-2.5** и `{CHOSEN_CJM}` для контекста

3. **Спроектируй решение:**
   - SCQA (для питча)
   - Концепция + Elevator Pitch + Ключевая инновация
   - Process Design: As-Is → To-Be
   - User Flow из {CHOSEN_CJM}
   - AI Pipeline
   - Human-in-the-Loop Design
   - Метрики успеха с baseline
   - Риски и митигация
   - Roadmap: PoC → MVP → Scale

4. **Создай файлы:**
   - `03_solution_strategy.md`
   - `diagrams/process-as-is.mermaid`
   - `diagrams/process-to-be.mermaid`
5. **Покажи Checkpoint 3**

## Параллелизация (Agent Swarm)
Запусти 2 агента параллельно:
- Agent 1: SCQA + Концепция + Process Design + User Flow + AI Pipeline
- Agent 2: Mermaid диаграммы (as-is, to-be) + HITL Design + Метрики + Roadmap
