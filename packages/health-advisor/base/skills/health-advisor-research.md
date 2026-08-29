---
name: health-advisor-research
description: >
  Медицинский исследовательский скилл-оркестратор для Health Advisor.
  Обёртка над analyst-manual-full, адаптированная для медицинского домена.
  Объединяет explore → goap-research-ed25519 → problem-solver-enhanced
  с медицинским контекстом, PubMed-верификацией и профилем пациента.
  Триггеры: "medical research", "health research", "проведи ресёрч",
  "исследуй", "paranoid mode", "analyst manual full".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_note: "Composite skill — depends on explore, goap-research-ed25519, problem-solver-enhanced"
---

# Health Advisor Research: Medical Analysis with Verified Sources

## Overview

Медицинский исследовательский скилл-оркестратор. Обёртка над `analyst-manual-full`, адаптированная для медицинского домена. Объединяет explore (уточнение медицинского вопроса) → goap-research-ed25519 (PubMed-верифицированный ресёрч с криптоподписями) → problem-solver-enhanced (персонализированные рекомендации). Paranoid mode включён по умолчанию — каждый факт верифицирован, каждая ссылка проверена.

## Dependencies

This skill requires:
- **analyst-manual-full** — базовый оркестратор с контрольными точками
- **explore** — уточнение медицинского вопроса в контексте профиля пациента
- **goap-research-ed25519** — верифицированный ресёрч (Trusted Issuers = PubMed, Cochrane, WHO, ESC, AHA)
- **problem-solver-enhanced** — генерация медицинских рекомендаций с risk-benefit анализом

### Dependent Skills Detail

| Phase | Skill | Path | Medical Adaptation |
|-------|-------|------|--------------------|
| Phase 1: Explore | explore | `skills/base/explore/SKILL.md` | Уточнение медицинского вопроса в контексте профиля пациента |
| Phase 2: Research | goap-research-ed25519 | `skills/base/goap-research-ed25519/SKILL.md` | Trusted issuers = PubMed, Cochrane, WHO, ESC, AHA, ACSM |
| Phase 3: Solve | problem-solver-enhanced | `skills/base/problem-solver-enhanced/SKILL.md` | Генерация медицинских рекомендаций с дисклеймером |

## Medical Domain Configuration

### Trusted Issuer Whitelist (для Ed25519 verification)

```yaml
trusted_issuers:
  tier_1_gold:  # Мета-анализы, систематические обзоры, клинические рекомендации
    - domain: "pubmed.ncbi.nlm.nih.gov"
      name: "PubMed / MEDLINE"
      trust_level: 5
    - domain: "cochranelibrary.com"
      name: "Cochrane Library"
      trust_level: 5
    - domain: "who.int"
      name: "World Health Organization"
      trust_level: 5
    - domain: "escardio.org"
      name: "European Society of Cardiology"
      trust_level: 5
    - domain: "heart.org"
      name: "American Heart Association"
      trust_level: 5
    - domain: "acsm.org"
      name: "American College of Sports Medicine"
      trust_level: 5
    - domain: "endocrine.org"
      name: "Endocrine Society"
      trust_level: 5
    - domain: "kidney.org"
      name: "National Kidney Foundation (KDIGO)"
      trust_level: 5
    - domain: "rae-org.ru"
      name: "Российская ассоциация эндокринологов"
      trust_level: 4
    - domain: "scardio.ru"
      name: "Российское кардиологическое общество"
      trust_level: 4

  tier_2_silver:  # Крупные журналы, учебные ресурсы
    - domain: "nejm.org"
      name: "New England Journal of Medicine"
      trust_level: 4
    - domain: "thelancet.com"
      name: "The Lancet"
      trust_level: 4
    - domain: "jamanetwork.com"
      name: "JAMA Network"
      trust_level: 4
    - domain: "ahajournals.org"
      name: "AHA Journals (Circulation, Stroke)"
      trust_level: 4
    - domain: "bmj.com"
      name: "BMJ"
      trust_level: 4
    - domain: "nature.com"
      name: "Nature / Nature Medicine"
      trust_level: 4
    - domain: "ods.od.nih.gov"
      name: "NIH Office of Dietary Supplements"
      trust_level: 4

  tier_3_bronze:  # Справочные ресурсы
    - domain: "ncbi.nlm.nih.gov/books"
      name: "StatPearls / NCBI Bookshelf"
      trust_level: 3
    - domain: "uptodate.com"
      name: "UpToDate"
      trust_level: 3
    - domain: "rlsnet.ru"
      name: "РЛС (Реестр лекарственных средств)"
      trust_level: 3
    - domain: "vidal.ru"
      name: "Видаль (справочник лекарств)"
      trust_level: 3
    - domain: "grls.rosminzdrav.ru"
      name: "ГРЛС (Государственный реестр лекарственных средств)"
      trust_level: 4

  untrusted:  # Не использовать как единственный источник
    - domain: "wikipedia.org"
    - domain: "webmd.com"
    - domain: "healthline.com"
    - domain: "mayoclinic.org"  # Допустим для пояснений, не для evidence
```

### Evidence Hierarchy (для GOAP planning)

```yaml
evidence_levels:
  1: "Мета-анализ / Систематический обзор РКИ (Cochrane, PRISMA)"
  2: "Рандомизированное контролируемое исследование (РКИ)"
  3: "Когортное исследование / Проспективное наблюдательное"
  4: "Исследование случай-контроль"
  5: "Серия случаев / Описание случая"
  6: "Мнение эксперта / Консенсус"
  7: "Исследование in vitro / на животных"

minimum_evidence_for_recommendation: 3  # Не рекомендовать на основе только animal/in vitro
```

## Workflow Architecture (Medical Adaptation)

```
┌─────────────────────────────────────────────────────────────────┐
│  INPUT: Медицинский вопрос пациента + Профиль пациента         │
│                         ↓                                       │
│  CONTEXT INJECTION: Загрузка профиля пациента из sources/       │
│  → Диагнозы, показатели, лекарства, ограничения                │
│                         ↓                                       │
│  GATE: Оценка ясности вопроса                                  │
│  → Ясен? → Пропустить Explore                                  │
│  → Не ясен? → Phase 1: Explore (медицинский)                   │
│                         ↓                                       │
│  Phase 1: EXPLORE (если нужен)                                  │
│  → Загрузи: skills/base/explore/SKILL.md                       │
│  → Уточни: какой именно аспект здоровья?                       │
│  → Какие данные есть, каких не хватает?                         │
│  → Output: Medical Task Brief                                   │
│  → ⏸️ CHECKPOINT 1: "Подтвердите задачу"                       │
│                         ↓                                       │
│  Phase 2: RESEARCH (Ed25519 Verified, Medical)                  │
│  → Загрузи: skills/base/goap-research-ed25519/SKILL.md         │
│  → Trusted issuers: PubMed, Cochrane, WHO, ESC, AHA            │
│  → GOAP actions: WebSearch PubMed → WebFetch → Verify → Cite   │
│  → Evidence grading: каждый факт получает уровень 1-7           │
│  → Triangulation: минимум 2 независимых источника на claim      │
│  → Output: Verified Medical Findings + Signed Ledger            │
│  → ⏸️ CHECKPOINT 2: "Подтвердите findings"                     │
│                         ↓                                       │
│  Phase 3: SOLVE (Medical Recommendations)                       │
│  → Загрузи: skills/base/problem-solver-enhanced/SKILL.md       │
│  → Персонализация: привязать к профилю пациента                │
│  → Risk-benefit analysis для КАЖДОЙ рекомендации               │
│  → Practical actions: дозы, порции, расписание, где купить      │
│  → Output: Personalized Medical Recommendations                 │
│  → ⏸️ CHECKPOINT 3: "Подтвердите рекомендации"                 │
│                         ↓                                       │
│  SYNTHESIS: Итоговый документ                                   │
│  → MD + HTML форматы                                           │
│  → Сводная таблица                                              │
│  → Глоссарий терминов                                          │
│  → Медицинский дисклеймер                                      │
│  → Интеграция в сводный файл (diet_foods, exercise_program)    │
│                         ↓                                       │
│  OUTPUT: Файлы в research/ и analysis/                          │
└─────────────────────────────────────────────────────────────────┘
```

## Patient Profile Injection

Перед каждым ресёрчем загружай профиль пациента и передавай его в каждую фазу:

```markdown
**Patient Context (inject into every research query):**
- [Load from sources/patient_profile.md or latest analysis]
- All conditions, medications, lab values
- Specific risks and contraindications
- What the patient refuses (e.g., statins)
```

## Medical-Specific GOAP Actions

В дополнение к стандартным GOAP actions из goap-research-ed25519, добавить:

| Action | Description | Preconditions | Effects |
|--------|-------------|---------------|---------|
| search_pubmed | Поиск PubMed по медицинскому запросу | query defined | results obtained |
| fetch_clinical_guidelines | Получить клинические рекомендации (ESC, AHA, РКО) | condition identified | guidelines obtained |
| check_drug_interactions | Проверить взаимодействие лекарств | drug list available | interactions identified |
| verify_dose | Проверить дозировку по guidelines | drug + dose defined | dose validated |
| check_contraindications | Проверить противопоказания для пациента | patient profile loaded | contraindications listed |
| calculate_risk_benefit | Рассчитать баланс пользы/вреда | evidence gathered | risk-benefit table created |
| search_pharmacy_prices | Найти цены в аптеках | drug identified | prices + links obtained |
| search_doctor_ratings | Найти рейтинги врачей | specialty + city defined | rated doctors listed |

## Output Requirements (Medical)

Каждый выходной документ ОБЯЗАТЕЛЬНО содержит:

1. **Заголовок + дата**
2. **Профиль пациента** (краткий) или ссылка на него
3. **Основное содержание** с инлайн-ссылками на PubMed
4. **Уровень доказательности** для каждой рекомендации (1-7)
5. **Сводная таблица** (продукт/препарат → эффект на каждый диагноз → вердикт)
6. **Практические рекомендации** (дозы, порции, расписание, где купить, ссылки)
7. **Глоссарий медицинских терминов** (Приложение)
8. **Медицинский дисклеймер:**
   > Данный документ носит информационно-аналитический характер и не является медицинской рекомендацией. Все решения по лечению должны приниматься лечащим врачом.

## Integration with Health Advisor Modules

| Health Advisor Module | How this skill is used |
|---|---|
| M1: Profile Analysis | Explore phase для уточнения + Research для поиска синдромов |
| M2: Medications | Full pipeline: explore вопрос → research evidence → solve alternatives |
| M3: Doctors | Research phase для поиска + Solve для ранжирования |
| M5: Exercise | Research evidence per exercise type → Solve personalized program |
| M6: Nutrition | Research per product → Solve verdict + portions |
| M7: Special Practices | Full pipeline: explore practice → research evidence → solve risk-benefit |

## Paranoid Mode (default for medical)

В медицинском контексте **paranoid mode включён по умолчанию**:
- Каждый claim = ссылка на PubMed
- Каждая рекомендация = evidence level 1-7
- Triangulation = минимум 2 источника
- Противоречивые данные = обе стороны с источниками
- Нет source = нет recommendation
- Animal/in vitro data = чётко маркировать, не рекомендовать как доказанное

### Source Age Policy (максимальный возраст источников)

| Тип источника | Максимальный возраст | Обоснование | Действие при превышении |
|---|---|---|---|
| **Клинические рекомендации** (ESC, AHA, WHO, РКО, РАЭ) | **5 лет** | Guidelines обновляются каждые 3-5 лет | Проверить наличие обновлённой версии. Если есть — использовать новую |
| **Мета-анализы / Систематические обзоры** | **7 лет** | Кокрейновские обзоры обновляются реже | Проверить наличие update. Если есть — использовать новый |
| **Landmark RCTs** (ключевые исследования) | **Без ограничения** | REDUCE-IT (2019), IMPROVE-IT (2015), VITAL (2019) — навсегда актуальны | Допустимо. Пометить год |
| **Фармакологические данные** (регистрации, цены, доступность) | **3 года** | Рынок лекарств меняется быстро | Верифицировать актуальность через ГРЛС/аптеки |
| **Данные по продуктам питания** (нутриентный состав) | **10 лет** | USDA/NCCDB обновляются редко, состав продуктов стабилен | Допустимо |
| **Данные по врачам** (рейтинги, цены, наличие) | **6 месяцев** | Врачи меняют клиники, цены растут | Всегда верифицировать на момент рекомендации |

### Правило проверки актуальности

При использовании источника старше порога:
1. Проверить через WebSearch наличие обновлённой версии
2. Если обновление найдено — использовать его
3. Если обновления нет — допустимо использовать старый с пометкой: `[Источник YYYY г. — обновлённая версия не найдена на дату ресёрча]`
4. Если источник старше **2x порога** (например, guideline >10 лет) — **пометить [OUTDATED]** и искать альтернативные источники

## Anti-Patterns

| Анти-паттерн | Сигнал | Исправление |
|---|---|---|
| Галлюцинация PubMed PMID | Ссылка на несуществующий PMID | Верифицировать через WebFetch. Если PMID не существует — удалить claim |
| Cherry-picking | Только позитивные исследования, игнорирование негативных | Triangulation: представить ОБЕ стороны |
| Animal-as-human | «Исследование показало...» без указания что на мышах | Чётко маркировать: «в исследовании на животных» |
| Устаревшие guidelines | Ссылка на рекомендации >10 лет | Проверить наличие обновлённых версий |
| Неверная экстраполяция дозы | Доза из исследования на другую популяцию/вес | Указать исходную популяцию, адаптировать к пациенту |
| Доверие untrusted источникам | Wikipedia, WebMD как единственный источник | Использовать ТОЛЬКО Trusted Issuer Whitelist (tier 1-3) |
| Пропуск risk-benefit | Рекомендация без анализа рисков | Каждая рекомендация = таблица польза vs вред для ЭТОГО пациента |
| Игнорирование лекарственных взаимодействий | Рекомендация добавки без проверки совместимости | Проверять взаимодействия со ВСЕМИ текущими препаратами пациента |
| Рекомендация без дозы | «Принимайте омега-3» без указания мг/день | Всегда указывать конкретную дозу, форму, частоту |
| Evidence level не указан | Рекомендация без уровня доказательности (1-7) | Каждый вывод = evidence level + источник |
