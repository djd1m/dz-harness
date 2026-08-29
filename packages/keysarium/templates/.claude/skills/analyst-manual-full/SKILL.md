---
name: analyst-manual-full
description: >
  Композитный скилл-оркестратор для продакт-менеджера с контрольными точками.
  Объединяет explore, goap-research-ed25519 и problem-solver-enhanced в единый
  manual pipeline. Запрашивает подтверждение между фазами. Используй для:
  стратегических продуктовых задач, ценообразования, позиционирования,
  конкурентного анализа, GTM-стратегии.
  Режим MANUAL — подтверждение между каждой фазой.
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_note: "Composite skill — depends on explore, goap-research-ed25519, problem-solver-enhanced"
---

# Analyst Manual Full: Strategic Analysis with Checkpoints

Композитный скилл-оркестратор для решения комплексных продуктовых задач. Запрашивает подтверждение после каждой фазы.

## Dependent Skills

Этот скилл оркестрирует три атомарных скилла. Эти три скилла устанавливаются как соседние директории рядом с этим скиллом, поэтому пути указаны относительно директории этого скилла (`../<имя-скилла>/…`) и корректны в любом layout установки (`../` или `skills/base/`). Перед каждой фазой загружай соответствующий SKILL.md:

| Phase | Skill | Path |
|-------|-------|------|
| Phase 1: Explore | explore | `../explore/SKILL.md` |
| Phase 2: Research | goap-research-ed25519 | `../goap-research-ed25519/SKILL.md` |
| Phase 3: Solve | problem-solver-enhanced | `../problem-solver-enhanced/SKILL.md` |

Scripts и references для Phase 2 находятся в:
- `../goap-research-ed25519/scripts/goap_planner.py`
- `../goap-research-ed25519/scripts/ed25519_verifier.py`
- `../goap-research-ed25519/references/`

## Core Philosophy

**Контрольные точки:** После каждой фазы скилл останавливается для подтверждения. Пользователь может скорректировать направление или продолжить.

**Cryptographic Verification:** Ed25519 подписи для верификации источников (через goap-research-ed25519).

## Workflow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: Задача пользователя                                     │
│                         ↓                                       │
│  GATE: Оценка ясности задачи                                    │
│  → Ясна? → Пропустить Explore                                   │
│  → Не ясна? → Phase 1: Explore                                  │
│                         ↓                                       │
│  Phase 1: EXPLORE (если нужен)                                  │
│  → Загрузи: ../explore/SKILL.md                                 │
│  → Output: Task Brief                                           │
│  → ⏸️ CHECKPOINT 1: "Подтвердите Task Brief"                    │
│                         ↓                                       │
│  Phase 2: RESEARCH (Ed25519 Verified)                           │
│  → Загрузи: ../goap-research-ed25519/SKILL.md                   │
│  → Output: Verified Research Findings                           │
│  → ⏸️ CHECKPOINT 2: "Подтвердите findings"                      │
│                         ↓                                       │
│  Phase 3: SOLVE                                                 │
│  → Загрузи: ../problem-solver-enhanced/SKILL.md                 │
│  → Output: Solution & Action Plan                               │
│  → ⏸️ CHECKPOINT 3: "Подтвердите решение"                       │
│                         ↓                                       │
│  SYNTHESIS: Final Summary + All Artifacts                       │
│                         ↓                                       │
│  OUTPUT: 4 документа × 2 формата (md + docx)                   │
└─────────────────────────────────────────────────────────────────┘
```

## Phase Execution Protocol

### Gate: Task Clarity Assessment

**При пропуске Explore уведоми:**
```
⚡ Фаза Explore пропущена — задача достаточно ясна.
Сформирован Task Brief на основе вашего запроса.
[показать Task Brief]

⏸️ CHECKPOINT 1: Подтвердите Task Brief или внесите коррективы.
```

### Phase 1: Explore

**Загрузи:** Прочитай `../explore/SKILL.md` и выполни по его инструкциям.

**Output — Task Brief:**
```markdown
## Task Brief

**Objective:** [Чёткая формулировка цели]
**Context:** [Релевантный контекст]
**Success Criteria:** [Измеримые критерии]
**Constraints:** [Жёсткие ограничения]
**Timeline:** [Дедлайн]
**Out of Scope:** [Что исключено]
```

**⏸️ CHECKPOINT 1:**
```
═══════════════════════════════════════════════════════════════
⏸️ CHECKPOINT 1: Task Brief Complete

[показать Task Brief]

Варианты действий:
• "ок" — перейти к Verified Research (moderate mode)
• "режим strict" — research с порогом 0.95
• "режим paranoid" — research с порогом 0.99
• "скорректируй X" — внести изменения

Что выберете?
═══════════════════════════════════════════════════════════════
```

### Phase 2: Research (goap-research-ed25519)

**Загрузи:** Прочитай `../goap-research-ed25519/SKILL.md` и выполни по его инструкциям.

**Verification Modes (выбор на CHECKPOINT 1):**

| Mode | Threshold | Команда на checkpoint |
|------|-----------|----------------------|
| `moderate` | 0.85 | "ок" или "продолжай" |
| `strict` | 0.95 | "режим strict" |
| `paranoid` | 0.99 | "режим paranoid" |

**Output — Verified Research Findings:**
```markdown
## Verified Research Findings

### Verification Status
- **Mode:** [selected_mode] ([threshold] threshold)
- **Chain Integrity:** ✅ VERIFIED (ed25519)
- **Unsigned Claims:** 0
- **Total Citations:** [число]

### Verified Findings
[Findings с signed citations]

### Confidence Assessment
- **Cryptographically Verified (≥0.95):** [список]
- **Cross-Reference Verified (0.85-0.95):** [список]

### Citation Chain
[Ed25519 verified chain — см. Appendix]
```

**⏸️ CHECKPOINT 2:**
```
═══════════════════════════════════════════════════════════════
⏸️ CHECKPOINT 2: Verified Research Complete

**Verification Status:**
- Mode: [strict/moderate/paranoid]
- Unsigned Claims: 0 ✅
- Citation Chain: VERIFIED (Ed25519) ✅

**Ключевые находки:**
[краткое summary]

**Области с confidence < 0.95:**
[список, если есть]

Варианты действий:
• "ок" — перейти к Solution
• "исследуй глубже X" — дополнительный verified research
• "повысь confidence для Y" — найти больше источников

Что выберете?
═══════════════════════════════════════════════════════════════
```

### Phase 3: Solve (problem-solver-enhanced)

**Загрузи:** Прочитай `../problem-solver-enhanced/SKILL.md` и выполни по его инструкциям.

**9-Module Framework:**
1. First Principles Breakdown
2. Root Cause Analysis (5 Whys)
3. SCQA Framework
4. Game Theory Analysis
5. Second-Order Thinking
6. Contradiction Analysis (TRIZ)
7. Design Thinking
8. OODA Loop
9. Solution Synthesis

**Output — Solution:**
```markdown
## Solution & Action Plan

### Problem Statement (SCQA)
### Root Cause Analysis
### Strategic Analysis
### Contradictions Resolved (TRIZ)
### Recommended Solution
### Action Plan
### Risk Mitigation
### Success Metrics
```

**⏸️ CHECKPOINT 3:**
```
═══════════════════════════════════════════════════════════════
⏸️ CHECKPOINT 3: Solution Complete

**Ключевые рекомендации:**
[краткое summary]

**Data Quality:**
- Все рекомендации основаны на verified research ✅
- Citation chain integrity: VERIFIED (Ed25519) ✅

Варианты действий:
• "ок" — создать все документы
• "альтернатива для X" — другой подход
• "детализируй Y" — углубить аспект

Что выберете?
═══════════════════════════════════════════════════════════════
```

### Synthesis: Final Summary

```markdown
## Strategic Analysis: [Название задачи]

### Executive Summary
### Verification Status (Ed25519)
- Research Mode: [mode]
- All Claims Verified: ✅
- Citation Chain: CRYPTOGRAPHICALLY VERIFIED ✅

### Key Research Insights
### Recommended Strategy
### Immediate Next Steps
```

## Checkpoint Interaction Rules

**Команды на checkpoint:**

| Команда | Действие |
|---------|----------|
| `ок`, `продолжай` | Следующая фаза |
| `режим strict` | Изменить verification mode (CHECKPOINT 1) |
| `режим paranoid` | Изменить verification mode (CHECKPOINT 1) |
| `скорректируй X` | Изменить артефакт |
| `исследуй глубже X` | Доп. research (CHECKPOINT 2) |
| `повысь confidence для X` | Больше источников (CHECKPOINT 2) |
| `альтернатива для X` | Другое решение (CHECKPOINT 3) |
| `стоп` | Пауза с сохранением |

## Output Generation

| Документ | Файлы |
|----------|-------|
| Task Brief | `01_task_brief.md`, `01_task_brief.docx` |
| Verified Research | `02_research_findings.md`, `02_research_findings.docx` |
| Solution | `03_solution.md`, `03_solution.docx` |
| Final Summary | `04_final_summary.md`, `04_final_summary.docx` |

## Quality Standards

**Anti-Hallucination Checks:**
- [ ] 100% claims имеют citations
- [ ] Citation chain cryptographically verified (Ed25519)
- [ ] Нет утверждений без DOI/URL
- [ ] Confidence levels для всех findings

**Completeness:**
- [ ] Все 9 модулей problem-solver пройдены
- [ ] Подтверждение на каждом checkpoint получено

## Dependencies

**Required skills** (installed as sibling skill directories alongside this skill):
- `explore` — task clarification and brief generation
- `goap-research-ed25519` — verified research with Ed25519 (includes scripts/ and references/)
- `problem-solver-enhanced` — 9-module problem solving with TRIZ

**Runtime:**
- Python 3.9+ (for Ed25519 scripts in goap-research-ed25519)
- `cryptography` package for Ed25519
