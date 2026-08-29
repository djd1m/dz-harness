# Analyst Manual: Стратегический анализ с контрольными точками

## Использование
```
/analyst-manual [тема или задача для анализа]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/analyst-manual-full/SKILL.md`
2. **Оцени ясность задачи** (Gate: Task Clarity Assessment)
   - Задача ясна → пропустить Explore, сформировать Task Brief
   - Задача не ясна → Phase 1: Explore

3. **Phase 1: Explore** (если нужен)
   - Кларификация задачи, формирование Task Brief
   - Output: `01_task_brief.md`
   - ⏸️ **CHECKPOINT 1:** Подтверждение Task Brief + выбор verification mode

4. **Phase 2: Verified Research** (goap-research-ed25519)
   - Используй `scripts/goap_planner.py` и `scripts/ed25519_verifier.py`
   - Режим: выбранный на CHECKPOINT 1 (moderate/strict/paranoid)
   - Output: `02_research_findings.md`
   - ⏸️ **CHECKPOINT 2:** Подтверждение findings

5. **Phase 3: Solve** (problem-solver-enhanced)
   - 9-модульный framework (First Principles, TRIZ, Game Theory, OODA)
   - Output: `03_solution.md`
   - ⏸️ **CHECKPOINT 3:** Подтверждение решения

6. **Synthesis:** Финальный summary всех фаз
   - Output: `04_final_summary.md`

## Режим
**MANUAL** — подтверждение между каждой фазой обязательно.
