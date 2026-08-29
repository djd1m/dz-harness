# Phase 5: Presentation + Executive Summary

## Использование
```
/presentation [путь к директории исследования]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/presentation-storyteller/SKILL.md`
2. **Прочитай Phase 0-4** для полного контекста

3. **Создай контент презентации (10-12 слайдов):**
   | # | Слайд | Ключевое |
   |---|-------|---------|
   | 1 | Титульный | Название + команда + кейс |
   | 2 | Проблема | SCQA, цена бездействия |
   | 3 | Ключевой вопрос + Ответ | Elevator pitch |
   | 4 | Концепция | High-level, роль AI |
   | 5 | User Flow / To-Be | {CHOSEN_CJM}, скриншоты |
   | 6 | AI под капотом | Модели, RAG/Agent, HITL |
   | 7 | Data Architecture | Источники, качество |
   | 8 | Безопасность | Compliance, риски AI |
   | 9 | Метрики и ROI | As-Is→Target, окупаемость |
   | 10 | Roadmap | PoC→MVP→Scale |
   | 11 | Команда + CTA | Следующие шаги |
   | 12 | Q&A | Заготовленные ответы |

4. **Speaker Script** — для каждого слайда: HOOK, CONTENT, BRIDGE, ТОН, КЛЮЧЕВОЕ

5. **Q&A Preparation** — 7+ типичных вопросов жюри

6. **Executive Summary** — 1 страница для жюри (ОБЯЗАТЕЛЬНО)

7. **Создай файлы:**
   - `05_presentation_content.md`
   - `06_speaker_script.md`
   - `07_qa_preparation.md`
   - `08_executive_summary.md`
8. **Покажи Checkpoint 5**

## Параллелизация (Agent Swarm)
Запусти 3 агента параллельно:
- Agent 1: Контент презентации (05_presentation_content.md)
- Agent 2: Speaker Script (06_speaker_script.md)
- Agent 3: Q&A + Executive Summary (07_qa_preparation.md + 08_executive_summary.md)
