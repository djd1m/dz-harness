# /feature-adr — Adaptive Feature Development Pipeline

## Использование
```
/feature-adr [описание фичи или путь к issue]
/feature-adr --full-qe [описание фичи]            # Direct Mode: полные протоколы agentic-qe
/feature-adr --full-qe-extended [описание фичи]    # Direct Extended: полные протоколы + доп. скиллы
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи governance shard:** Прочитай `.claude/shards/feature-adr.shard.md`
2. **Загрузи скилл:** Прочитай `.claude/skills/feature-adr/SKILL.md`

3. **Step 0 — Complexity Router:**
   - Прочитай `modules/00-complexity-router.md` и `references/complexity-matrix.md`
   - Классифицируй фичу в S/M/L/XL
   - **Проверь agentic-qe флаги:**
     - `--full-qe` → проверь `which aqe` или `node_modules/agentic-qe/`.
       Если найден → `{AGENTIC_QE_MODE}=direct`. Если нет → WARN, fallback to reference.
     - `--full-qe-extended` → то же + `{AGENTIC_QE_MODE}=direct-extended`.
       Активирует доп. скиллы (chaos, security, performance, mutation, TDD, production-swarm).
     - Без флагов → `{AGENTIC_QE_MODE}=reference` (condensed копии, без установки).
   - Определи `{ACTIVE_STEPS}` и `{TIME_BUDGET}`
   - Покажи Checkpoint 0 и **жди подтверждения tier**

4. **Steps 1-9 — Execute Active Steps:**
   - Для каждого шага из `{ACTIVE_STEPS}` (включая Step 3.5 для M+ и Step 9 для L/XL):
     - Прочитай `modules/{step}.md`
     - Выполни протокол шага
     - Создай артефакты в `features/<slug>/`
     - Покажи Checkpoint N
   - **Step 3.5 (QCSD Ideation Swarm)** обязателен для M/L/XL — спавнит 3-9 параллельных агентов и выдаёт GO/CONDITIONAL/NO-GO verdict
   - **Step 9 (Fleet QE Assessment)** обязателен для L/XL — 4 параллельных агента (traceability ‖ risk ‖ integration ‖ regression)

5. **Финализация:**
   - Создай `features/<slug>/README.md` с summary
   - Покажи итоговый отчёт

## Создание директории

При первом запуске создай:
```
features/<feature-slug>/
├── diagrams/        ← для Mermaid диаграмм (M+)
├── 03_adr/          ← для ADR файлов (M+)
└── 07_code_changes/ ← для манифеста изменений
```

Дополнительные артефакты создаются по мере выполнения шагов:
`03.5_ideation_report.md` (M+, Step 3.5) и `09_fleet_qe_assessment.md` (L/XL, Step 9).

Slug: kebab-case из описания фичи (латиница, max 40 символов).

## Параллелизация (Agent Swarm)

Для L/XL тiers:
- Steps 2+3 запускай параллельно (2 агента, sonnet + opus)
- Step 3.5: 3-9 параллельных агентов (QCSD swarm — core + conditional)
- Steps 4+5 можно параллельно если Step 3.5 уже завершён
- Step 7: N параллельных агентов (по одному на модуль)
- Step 8: 3 параллельных агента (Linus ‖ Security ‖ Ramsay reviewer — brutal-honesty панель)
- Step 9: 4 параллельных агента (traceability ‖ risk ‖ integration ‖ regression); 4-7 с `--full-qe-extended`

Для S/M: всё последовательно, параллелизация не нужна (Step 3.5 для M спавнит 3 core агента).

## Model Routing

| Step | Model |
|------|-------|
| 0 Router | haiku |
| 1 Requirements | sonnet |
| 2 Research | sonnet |
| 3 ADR | opus |
| 3.5 QCSD Ideation Swarm | sonnet |
| 4 DDD | opus |
| 5 Architecture | opus |
| 6 Impl Plan | sonnet |
| 7 Code | opus |
| 8 QE | sonnet |
| 9 Fleet QE Assessment | sonnet |

## Checkpoint формат

```
═══════════════════════════════════════════════════════
⏸️ STEP N: [Step Name] Complete
<promise>[PROMISE_TAG]</promise>
Tier: {COMPLEXITY_TIER} | Active Steps: {ACTIVE_STEPS}

[Summary]
Artifacts: [list] ✅

• "ок" — next step
• "углуби [section]" — elaborate
• "[feedback]" — adjust
═══════════════════════════════════════════════════════
```

## Critical Rules

- **НИКОГДА** не пропускай Step 0 (Router) — всегда классифицируй сначала
- **НИКОГДА** не начинай Step 7 (Code) без Step 6 (Plan)
- **НИКОГДА** не пропускай Step 8 (QE) — тестирование обязательно
- **НИКОГДА** не пропускай Step 3.5 (QCSD Ideation Swarm) для M/L/XL — quality assessment обязателен (BLOCK)
- **НИКОГДА** не игнорируй NO-GO verdict из Step 3.5 — требуется доработка (BLOCK)
- **НИКОГДА** не пропускай Step 9 (Fleet QE) для L/XL — fleet assessment обязателен (BLOCK)
- **ВСЕГДА** жди подтверждения пользователя на Checkpoint перед переходом
- **ВСЕ артефакты** создаются в `features/<slug>/`, не в корне проекта
