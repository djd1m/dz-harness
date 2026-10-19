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

**Проверка происхождения:** Research фиксирует, какие источники были прочитаны и какие утверждения ими поддержаны. Ed25519 проверяет подпись издателя только при наличии настоящих ключей издателя и источника с подписанной выдачей. Подпись подтверждает происхождение конкретных байтов, а не истинность утверждения.

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
│  Phase 2: RESEARCH (GOAP + статус доказательств)                 │
│  → Загрузи: ../goap-research-ed25519/SKILL.md                   │
│  → Output: Research Findings + Verification Status              │
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
• "ок" — перейти к Research (moderate mode)
• "скорректируй X" — внести изменения

Что выберете?
═══════════════════════════════════════════════════════════════
```

Показывай дополнительные варианты `режим strict` и `режим paranoid` только после проверки **обоих** фактов для выбранного класса источников: `issuer_keys_available` (реальные закреплённые ключи издателей) и `source_class_verified` (источники действительно отдают подписанные данные). Если пользователь просит один из этих режимов без подтверждения хотя бы одного факта, назови недостающий факт и остановись на CHECKPOINT 1. Предложи `moderate` отдельно; не подменяй выбор молча. Для обычных PubMed/PMC/DOI/WHO эти факты не установлены.

| Ключи издателя | Подписанная выдача | Можно предложить `strict`/`paranoid`? |
|---|---|---|
| Нет | Нет | Нет; штатный выбор — `moderate`. |
| Да | Нет | Нет; назови недостающую подписанную выдачу. |
| Нет | Да | Нет; назови недостающие ключи издателя. |
| Да | Да | Да, после явного выбора пользователя. |

### Phase 2: Research (goap-research-ed25519)

**Загрузи:** Прочитай `../goap-research-ed25519/SKILL.md` и выполни по его инструкциям.

**Verification Modes (выбор на CHECKPOINT 1):**

| Mode | Threshold | Условие |
|------|-----------|---------|
| `moderate` | 0.85 | Штатный режим по "ок" или "продолжай"; неподписанные факты остаются явно отмеченными. |
| `strict` | 0.95 | Только когда установлены оба capability-факта и пользователь выбрал режим. |
| `paranoid` | 0.99 | То же условие; более сильные требования к избыточности источников. |

Перед исследованием передай установленные capability-факты в `GOAPResearchPlanner`; не выставляй флаги `True` по имени сайта, наличию URL или желанию получить высокий confidence. Обрабатывай ответ как `ResearchPlan` **или** `PlanNotFound`, не как `None`:

- `PlanNotFound` с `GOAL_UNREACHABLE`: покажи verdict, причину и недостающие факты; остановись на research checkpoint. Увеличение бюджета поиска не исправит недоступные подписи.
- `PlanNotFound` с `SEARCH_EXHAUSTED`: покажи verdict и причину; остановись на research checkpoint. Можно предложить ограниченный повторный поиск, но не объявлять план найденным.
- Только `ResearchPlan` разрешает перейти к сбору находок; Phase 3: Solve доступна после успешного CHECKPOINT 2. `ResearchPlan` сам по себе не доказывает подписи или истинность фактов.

Если получен `PlanNotFound`, вместо шаблона «Research Findings Ready» покажи отдельный CHECKPOINT 2: «Research остановлен», фактический verdict, сообщение planner и недостающие capability-факты либо исчерпанный бюджет поиска. Предложи новый явный выбор: перейти на `moderate` при `GOAL_UNREACHABLE` из-за недоступной подписи, исправить интеграцию подписанной выдачи или сузить цель/повторить поиск при `SEARCH_EXHAUSTED`. Не переходи к Solve и не заполняй успешный research-шаблон на этом пути.

Для каждого использованного факта запиши результат `Ed25519Verifier.verify_fact`: `verified`, `trust_class` и причину отказа. Отдельно запиши результат `verify_citation_chain`; целостность цепочки исследователя не превращает `SELF_ATTESTED` в подпись издателя. Считай `issuer-verified` только факты с `verified=true` и `trust_class=ISSUER_SIGNED`; `SELF_ATTESTED` и `UNVERIFIED` показывай отдельно. Confidence, наличие DOI/URL и подпись исследователя не повышают класс до `ISSUER_SIGNED`. Если проверка не запускалась, напиши «не проверено», не ноль успешных или зелёный статус.

**Output — Research Findings:**
```markdown
## Research Findings

### Verification Status
- **Mode:** [selected_mode] ([threshold] threshold)
- **Source access:** [сколько источников прочитано; сколько только из выдачи; сколько не открыто]
- **Issuer provenance:** [issuer-verified X/N; SELF_ATTESTED Y/N; UNVERIFIED Z/N из результатов verify_fact]
- **Citation-chain integrity:** [verified / failed / not checked по verify_citation_chain]
- **Claims without issuer verification:** [идентификаторы и причины; если нет — 0 по результатам]
- **Total citations:** [из списка фактически использованных ссылок]

### Findings
[Утверждение, ссылка, evidence class и его фактический trust class]

### Confidence Assessment
- **Confidence:** [оценки с отдельным основанием; порог не заменяет подпись]

### Citation Chain
[Что именно проверено, каким ключом и с каким результатом; если не запускалось — not checked]
```

| Состояние результатов | Допустимая формулировка |
|---|---|
| Нет `ISSUER_SIGNED` с `verified=true` | «Источники процитированы; криптографическая проверка издателя не установлена». Укажи `SELF_ATTESTED` и `UNVERIFIED` отдельно. |
| Часть фактов issuer-verified | «Подпись издателя подтверждена для X из N фактов». Перечисли остальные факты и причины; общего «все проверено» нет. |
| Все факты issuer-verified | «Подпись издателя подтверждена для N из N фактов» **только после** фактического `verify_fact` для каждого факта. Целостность цепочки заявляй лишь при отдельном успешном `verify_citation_chain`; истинность фактов из подписи не следует. |

**⏸️ CHECKPOINT 2:**
```
═══════════════════════════════════════════════════════════════
⏸️ CHECKPOINT 2: Research Findings Ready

**Verification Status:**
- Mode: [фактически выбранный режим]
- Issuer provenance: [X/N issuer-verified; Y self-attested; Z unverified]
- Citation-chain integrity: [verified / failed / not checked]
- Неустановленные элементы: [факты и причины]

**Ключевые находки:**
[краткое summary]

**Области с confidence < 0.95:**
[список, если есть]

Варианты действий:
• "ок" — перейти к Solution
• "исследуй глубже X" — дополнительный research с новыми источниками
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
- Основание рекомендаций: [перечень подтверждённых и неподтверждённых находок]
- Issuer provenance: [X/N фактов, по результатам verify_fact]
- Citation-chain integrity: [отдельный результат verify_citation_chain]

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
### Verification Status
- Research Mode: [mode]
- Issuer provenance: [X/N фактов; причины для остальных]
- Citation-chain integrity: [verified / failed / not checked]
- Source support: [какие утверждения подтверждены прочитанными источниками; какие нет]

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
| Research Findings | `02_research_findings.md`, `02_research_findings.docx` |
| Solution | `03_solution.md`, `03_solution.docx` |
| Final Summary | `04_final_summary.md`, `04_final_summary.docx` |

## Quality Standards

**Anti-Hallucination Checks:**
- [ ] Для каждого существенного утверждения указан источник либо явно сказано, что подтверждения нет.
- [ ] Статус `ISSUER_SIGNED` взят из результата `verify_fact`, а не из confidence, режима или подписи исследователя.
- [ ] Статус цепочки взят отдельно из `verify_citation_chain`; если проверка не запускалась, это написано.
- [ ] Утверждения без issuer verification перечислены, а `SELF_ATTESTED` не названы подписями издателя.
- [ ] Confidence и ограничения источника показаны отдельно от криптографического происхождения.

**Completeness:**
- [ ] Все 9 модулей problem-solver пройдены
- [ ] Подтверждение на каждом checkpoint получено

## Dependencies

**Required skills** (installed as sibling skill directories alongside this skill):
- `explore` — task clarification and brief generation
- `goap-research-ed25519` — source-aware research with optional issuer-signature verification (includes scripts/ and references/)
- `problem-solver-enhanced` — 9-module problem solving with TRIZ

**Runtime:**
- Python 3.9+ (for Ed25519 scripts in goap-research-ed25519)
- `cryptography` package for Ed25519
