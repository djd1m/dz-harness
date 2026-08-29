# Idea2PRD Manual: от проблемы/идеи до PRD с контрольными точками

## Использование
```
/idea2prd-manual [проблема или идея продукта]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/idea2prd-manual/SKILL.md`
2. **Gate 0: Problem or Idea?** (auto-detect)
   - Проблема → ANALYST PIPELINE (полный, с чекпоинтами)
   - Идея → сразу PRD PIPELINE

3. **ANALYST PIPELINE** (внешние скиллы, по `.claude/skills/<id>/SKILL.md`)
   - Phase A: `explore` → questions → Task Brief — ⏸️ CHECKPOINT A
   - Phase B: `goap-research-ed25519` → verified research — ⏸️ CHECKPOINT B
   - Phase C: `problem-solver-enhanced` (все 9 модулей) → Product Idea — ⏸️ CHECKPOINT C

4. **PRD PIPELINE** (встроенный, с чекпоинтами)
   - Phase 1: Requirements → `PRD.md` — ⏸️ CHECKPOINT 1
   - Phase 2: ADR (см. `references/adr-catalog.md`) — ⏸️ CHECKPOINT 2
   - Phase 3: DDD (см. `references/ddd-patterns.md`) — ⏸️ CHECKPOINT 3
   - Phase 4: C4 (`scripts/c4_generator.py`, `references/c4-model.md`) — ⏸️ CHECKPOINT 4
   - Phase 4.5: Pseudocode (`scripts/pseudocode_generator.py`, `references/pseudocode-style.md`) — ⏸️ CHECKPOINT 4.5
   - Phase 5: Test Scenarios (Gherkin) — ⏸️ CHECKPOINT 5
   - Phase 6: Completion Checklist (`references/completion-checklist-template.md`) — ⏸️ CHECKPOINT 6

5. **Output:** документация для Vibe Coding (PRD + ADR + DDD + C4 + Pseudocode + Tests + Completion).

## Режим
**MANUAL** — подтверждение между каждой фазой обязательно (9 checkpoints).
