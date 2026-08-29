---
name: presentation-storyteller
description: >
  Создание продающих презентаций с верифицированными источниками и storytelling-скриптами.
  Генерирует: (1) План презентации с тезисами по каждому пункту, (2) Полную презентацию 
  в Markdown со ссылками на источники, (3) Подстрочник "Как рассказывать?" со связной 
  историей для каждого слайда. Использует explore (уточнение задачи), goap-research-ed25519 
  (исследование с верификацией), storytelling-фреймворки (AIDA, Hero's Journey, Problem-Solution).
  Выходные файлы: presentation-outline.md (план), presentation-full.md (презентация),
  sources-index.md (индекс источников). Триггеры: "сделай презентацию", "presentation with
  storytelling", "презентация со скриптами", "sales deck", "pitch deck", "продающая презентация".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run a BTO evaluation (see the skills-bto package) to promote to Tier 2"
---

# Presentation Storyteller: Sales Decks with Verified Sources

Скилл для создания продающих презентаций enterprise-уровня с:
- **Планом и тезисами** по каждому пункту
- **Полным контентом** слайдов со ссылками на источники
- **Storytelling-скриптами** «Как рассказывать?» для каждого слайда

## Output Structure

```
presentation/
├── presentation-outline.md      # План с тезисами
├── presentation-full.md         # Полная презентация
├── sources-index.md            # Индекс всех источников
└── speaker-notes/              # (опционально) отдельные заметки спикера
    └── slide-{N}-notes.md
```

## External Skills Dependencies

| Phase | Skill | Path | Purpose |
|-------|-------|------|---------|
| 1. Explore | `explore` | `.claude/skills/explore/SKILL.md` | Уточнение задачи |
| 2. Research | `goap-research-ed25519` | `.claude/skills/goap-research-ed25519/SKILL.md` | Верифицированные источники |

## Workflow Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: Тема презентации                                        │
│                         ↓                                       │
│  Phase 1: EXPLORE (external skill)                              │
│  → Audience? Goal? Constraints? Time? Style?                    │
│  → Presentation Brief                                           │
│  ⏸️ CHECKPOINT 1: Confirm Brief                                 │
│                         ↓                                       │
│  Phase 2: RESEARCH (external skill)                             │
│  → Web search, competitor analysis, statistics                  │
│  → Verified Facts with Sources                                  │
│  ⏸️ CHECKPOINT 2: Confirm Research                              │
│                         ↓                                       │
│  Phase 3: STRUCTURE                                             │
│  → Storytelling arc selection                                   │
│  → Slide outline with theses                                    │
│  ⏸️ CHECKPOINT 3: Confirm Structure                             │
│                         ↓                                       │
│  Phase 4: CONTENT                                               │
│  → Full slides with sources                                     │
│  → Speaker scripts "Как рассказывать?"                          │
│                         ↓                                       │
│  OUTPUT: 3 Markdown files                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Explore (Presentation Brief)

**Load:** `view(".claude/skills/explore/SKILL.md")`

**Key Questions for Presentations:**

| Dimension | Questions |
|-----------|-----------|
| **Audience** | Кто слушатели? (роли, уровень, боли). Что они уже знают? |
| **Goal** | Что должны СДЕЛАТЬ после презентации? (не "понять", а действие) |
| **Context** | Где презентация? (конференция, 1-on-1, вебинар). Что до/после? |
| **Time** | Сколько минут? Есть Q&A? |
| **Constraints** | Запретные темы? Обязательные? Корпоративный стиль? |
| **Success** | По какому критерию поймём, что презентация удалась? |

**Output: Presentation Brief**

```markdown
## Presentation Brief

**Тема:** [название презентации]
**Аудитория:** [роли, уровень, боли]
**Цель:** [конкретное действие после презентации]
**Контекст:** [где, когда, что до/после]
**Хронометраж:** [N минут + Q&A]
**Ограничения:** [что нельзя/обязательно]
**Критерий успеха:** [как измерим]
**Стиль:** [формальный/неформальный, технический/бизнес]
```

---

## Phase 2: Research (Verified Sources)

**Load:** `view(".claude/skills/goap-research-ed25519/SKILL.md")`

**Research Actions for Presentations:**

1. **Market Data** — размер рынка, тренды, прогнозы
2. **Competitor Analysis** — что делают конкуренты, их слабости
3. **Pain Points Validation** — подтверждение болей статистикой
4. **Solution Evidence** — кейсы, ROI, бенчмарки
5. **Regulatory Context** — законы, стандарты, сроки
6. **Expert Quotes** — авторитетные мнения

**Source Quality Requirements:**

| Fact Type | Minimum Sources | Trusted Issuers |
|-----------|-----------------|-----------------|
| Statistics | 2 | Industry reports, .gov, research firms |
| Market size | 2 | Gartner, IDC, McKinsey, local analysts |
| Regulations | 1 | Official gov sources (consultant.ru, garant.ru) |
| Technical claims | 2 | Vendor docs, benchmarks, academic |
| Case studies | 1 | Named company with metrics |

**Output: Research Findings**

```markdown
## Research Findings

### Verified Facts

| # | Claim | Source | URL | Confidence |
|---|-------|--------|-----|------------|
| 1 | [fact] | [source name] | [url] | 0.95 |
| 2 | [fact] | [source name] | [url] | 0.92 |
...

### Key Statistics
- [stat 1] — Source: [url]
- [stat 2] — Source: [url]

### Competitor Insights
...

### Regulatory Timeline
...
```

---

## Phase 3: Structure (Storytelling Arc)

**Select Storytelling Framework based on goal:**

| Goal | Framework | Structure |
|------|-----------|-----------|
| **Sell product** | AIDA | Attention → Interest → Desire → Action |
| **Change mindset** | Hero's Journey | Status Quo → Challenge → Transformation → New World |
| **Explain complex** | Problem-Solution | Pain → Root Cause → Solution → Proof → CTA |
| **Inspire action** | Monroe's Motivated | Attention → Need → Satisfaction → Visualization → Action |
| **Technical decision** | Minto Pyramid | Answer First → Supporting Arguments → Details |

**See:** `references/storytelling-frameworks.md` for detailed patterns

### Slide Types Reference

| Type | Purpose | Typical Content |
|------|---------|-----------------|
| **Title** | Hook, promise | Bold claim + subtitle |
| **Agenda** | Roadmap | 4-6 sections |
| **Problem** | Pain amplification | Statistics, quotes |
| **Solution** | Core value prop | Framework, pillars |
| **Product** | What we offer | Features, architecture |
| **Proof** | Evidence | Case studies, TCO |
| **Compare** | Differentiation | Table, before/after |
| **CTA** | Next steps | Clear actions |
| **Contact** | Close | Details, QR |

**See:** `references/slide-types.md` for detailed templates

### Output: Presentation Outline

```markdown
# ПЛАН ПРЕЗЕНТАЦИИ: [Название]

## Метаданные
- **Хронометраж:** [N] мин + Q&A
- **Слайдов:** [N]
- **Storytelling Arc:** [Framework]
- **Key Message:** [одно предложение]

## Структура

### БЛОК 1: [Название] (слайды 1-N, ~X мин)

#### Слайд 1: [Заголовок]
**Тип:** Title
**Тезис:** [Одно предложение — главная мысль слайда]

#### Слайд 2: [Заголовок]
**Тип:** Agenda
**Тезисы:**
- [тезис 1]
- [тезис 2]

### БЛОК 2: [Название] (слайды N-M, ~Y мин)
...

## Ключевые сообщения (5 max)

| # | Сообщение | Для кого |
|---|-----------|----------|
| 1 | [message] | [audience] |
...

## Тайминг

| Блок | Слайды | Время |
|------|--------|-------|
| [Block 1] | 1-N | X мин |
...
| **ИТОГО** | **N** | **X мин** |
```

---

## Phase 4: Content (Full Presentation)

Generate complete presentation with:
1. **Slide content** — заголовки, тексты, таблицы, диаграммы
2. **Sources** — ссылки на каждый факт
3. **Speaker scripts** — «Как рассказывать?» для каждого слайда

### Slide Format Template

```markdown
## СЛАЙД N: [Заголовок]

**Визуал:**
[Описание того, что должно быть на слайде: диаграммы, таблицы, иконки]

**📚 ИСТОЧНИКИ:**
1. [Название источника]: [URL]
2. [Название источника]: [URL]

---

**🎤 КАК РАССКАЗЫВАТЬ:**

> *«[Текст для спикера с интонационными подсказками, паузами, 
> риторическими вопросами и переходами к следующему слайду]»*
```

### Speaker Script Guidelines

**DO:**
- Начинать с вопроса/истории/провокации (не с «на этом слайде...»)
- Использовать «вы/мы», не «компания предлагает»
- Включать паузы: *(пауза)*
- Добавлять переходы к следующему слайду
- Заканчивать блок мини-резюме

**DON'T:**
- Читать слайд буквально
- Говорить «как вы видите на слайде»
- Перегружать цифрами подряд
- Забывать про эмоциональные якоря

**See:** `references/speaker-script-patterns.md` for examples

### Output: Full Presentation

```markdown
# [НАЗВАНИЕ ПРЕЗЕНТАЦИИ]
## [Подзаголовок]

**Метаданные:**
- Аудитория: [описание]
- Хронометраж: [N] мин + Q&A
- Storytelling Arc: [framework]
- Дата создания: [date]

---

## СЛАЙД 1: [Заголовок]
...

## СЛАЙД 2: [Заголовок]
...

---

## ПРИЛОЖЕНИЕ: Полный список источников

### Глобальные источники
| # | Тема | Источник | URL |
|---|------|----------|-----|
| 1 | ... | ... | ... |

### Локальные источники
| # | Тема | Источник | URL |
|---|------|----------|-----|
| 1 | ... | ... | ... |
```

---

## Quality Checklist

### Content Quality
- [ ] Каждый факт имеет источник
- [ ] Источники верифицированы (≥0.85 confidence)
- [ ] Нет «исследования показывают» без конкретной ссылки
- [ ] Статистика актуальна (≤2 года)

### Storytelling Quality
- [ ] Есть единая narrative arc
- [ ] Каждый слайд связан с предыдущим
- [ ] Есть эмоциональные якоря (история, вопрос, провокация)
- [ ] CTA конкретный и achievable

### Speaker Script Quality
- [ ] Не повторяет текст слайда буквально
- [ ] Включает паузы и интонационные подсказки
- [ ] Есть переходы между слайдами
- [ ] Время скрипта соответствует хронометражу (~130 слов/мин)

### Format Quality
- [ ] Markdown валиден
- [ ] Заголовки иерархичны
- [ ] Таблицы форматированы
- [ ] Ссылки кликабельны

---

## Anti-Patterns to Avoid

❌ **Bullet point hell** — не более 5-7 пунктов на слайд
❌ **Wall of text** — если текст > 50 слов, разбить на слайды
❌ **Unsourced claims** — каждая цифра требует источника
❌ **Generic scripts** — скрипт должен быть специфичен к контенту
❌ **Missing transitions** — каждый слайд должен связываться с предыдущим
❌ **CTA overload** — максимум 3 варианта действия в конце

---

## Timing Guidelines

| Presentation Length | Slides | Research Depth |
|--------------------|--------|----------------|
| 10 min (pitch) | 8-12 | 20+ sources |
| 20 min (standard) | 15-20 | 40+ sources |
| 30 min (detailed) | 20-25 | 60+ sources |
| 45 min (comprehensive) | 25-35 | 80+ sources |

**Speaking pace:** ~1.5-2 min per content slide, ~30 sec per transition slide

---

## References

- `references/storytelling-frameworks.md` — Detailed AIDA, Hero's Journey, Problem-Solution
- `references/slide-types.md` — Templates for each slide type
- `references/speaker-script-patterns.md` — Script examples and anti-patterns
- `references/example-presentation.md` — Full example presentation

## Dependencies

- External skills: `explore`, `goap-research-ed25519`
- `web_search` tool for research
- `web_fetch` tool for source verification
