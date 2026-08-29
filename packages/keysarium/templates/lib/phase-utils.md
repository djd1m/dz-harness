# Phase Utilities — Reusable Components

## Checkpoint Template

Use this template after every phase completion:

```markdown
═══════════════════════════════════════════════════════
⏸️ CHECKPOINT {N}: {PHASE_NAME} Complete
{SUMMARY_LINE_1}
{SUMMARY_LINE_2}
Files: {FILE_LIST} ✅
• "ок" — {NEXT_PHASE}
• "углуби [раздел]" — доработать
• "[feedback]" — скорректировать
═══════════════════════════════════════════════════════
```

Variables:
- `{N}` — Phase number (0, 1, 2, 2.5, 3, 4, 5)
- `{PHASE_NAME}` — Human-readable phase name
- `{SUMMARY_LINE_1}` — Key metrics/findings (1 line)
- `{SUMMARY_LINE_2}` — Key deliverable summary (1 line)
- `{FILE_LIST}` — Comma-separated artifact filenames
- `{NEXT_PHASE}` — Name of next phase

## Artifact Tracker Template

```markdown
ARTIFACTS (researches/{SLUG}/):
[{STATUS}] 00_product_discovery.md     ← Phase 0
[{STATUS}] 01_case_brief.md            ← Phase 1
[{STATUS}] 02_research_findings.md     ← Phase 2
[{STATUS}] 02.5_trend_brief.md         ← Phase 2.5
[{STATUS}] 03_solution_strategy.md     ← Phase 3
[{STATUS}] 04_architecture.md          ← Phase 4
[{STATUS}] 05_presentation_content.md  ← Phase 5
[{STATUS}] 06_speaker_script.md        ← Phase 5
[{STATUS}] 07_qa_preparation.md        ← Phase 5
[{STATUS}] 08_executive_summary.md     ← Phase 5
[{STATUS}] prototype/cjm-prototype.jsx ← Phase 2.5
[{STATUS}] diagrams/*.mermaid          ← Phase 3-4
[{STATUS}] README.md                   ← Phase 6
```

Status: `x` = done, ` ` = pending

## Phase Timing Calculator

Given total hours `T`:

| Phase | % | Minutes (T=4h) | Minutes (T=2h) | Minutes (T=6h) |
|-------|---|-----------------|-----------------|-----------------|
| Phase 0 | 15% | 36 | 18 | 54 |
| Phase 1 | 5% | 12 | 6 | 18 |
| Phase 2 | 15% | 36 | 18 | 54 |
| Phase 2.5 | 10% | 24 | 12 | 36 |
| Phase 3 | 15% | 36 | 18 | 54 |
| Phase 4 | 15% | 36 | 18 | 54 |
| Phase 5 | 20% | 48 | 24 | 72 |
| Buffer | 5% | 12 | 6 | 18 |

## Research Directory Initializer

Standard structure for new research:
```
researches/{slug}/
├── prototype/
├── diagrams/
└── README.md
```

README.md template:
```markdown
# Исследование: {CASE_NAME}

**Создано:** {DATE}
**Статус:** 🟡 В работе
**Домен:** {DOMAIN}
**Тайминг:** {HOURS} часов

## Артефакты
- [ ] Phase 0: Product Discovery
- [ ] Phase 1: Case Brief
- [ ] Phase 2: Research Findings
- [ ] Phase 2.5: CJM Prototype ⭐
- [ ] Phase 3: Solution Strategy
- [ ] Phase 4: Architecture
- [ ] Phase 5: Presentation
- [ ] Phase 6: Packaging

## Описание кейса
{CASE_DESCRIPTION}
```

## Domain Auto-Detection

Keywords → Domain mapping:

| Keywords | Domain | Palette |
|----------|--------|---------|
| банк, кредит, ЦБ, платёж, финтех | Banking | Blue/Navy/Silver |
| магазин, ритейл, товар, корзина, e-commerce | Retail | Amber/Orange |
| HR, найм, onboarding, сотрудник, кадры | Enterprise/HR | Teal/Indigo |
| врач, пациент, клиника, диагноз, медицина | Healthcare | Green/White |
| суд, договор, юрист, иск, право | Legal | Slate/Navy |
| процесс, BPM, автоматизация, workflow | Process/BPM | Violet/Gray |
