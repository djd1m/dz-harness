# Reverse Engineering Unicorn: компания → launch playbook + CJM

## Использование
```
/reverse-engineering-unicorn [компания / бизнес-модель для разбора]
```

## Аргумент
$ARGUMENTS

## Действия

1. **Загрузи скилл:** Прочитай `.claude/skills/reverse-engineering-unicorn/SKILL.md`
2. **Выбери режим:** QUICK / DEEP / VERIFIED (по требуемой глубине и верификации).
3. **Модули M1–M6** (оркестратор последовательно):
   - M1 Intelligence · M2 Product/Customers · M2.5 CJM Prototype (DEEP) · M3 Market/Competition · M4 Business/Finance · M5 Growth Engine · M6 Playbook Synthesis.
4. **Внутренние deps** (по `.claude/skills/<id>/SKILL.md`, поставляются с пакетом):
   - `explore` (pre-flight), `goap-research-ed25519` (research M1–M5), `problem-solver-enhanced` (M3–M5).
5. **Опциональные deps** (только DEEP/Post-M6 — НЕ в пакете, поставь отдельно если нужно):
   - `frontend-design` (M2.5 CJM-прототип), `brutal-honesty-review` (M6 BS-gate, → `@dzhechkov/skills-qe`), `presentation-storyteller` / `idea2prd-manual` (→ `@dzhechkov/skills-idea2prd`) / `md2pptx` (Post-M6).
6. **Output:** launch playbook + (DEEP) кликабельный CJM-прототип.

См. `references/` (jtbd-canvas, blue-ocean-canvas, industry-benchmarks) и `examples/`.
