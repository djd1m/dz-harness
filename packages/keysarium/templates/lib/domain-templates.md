# Domain Templates — Reusable Domain Configurations

## Purpose
Pre-configured settings for common case study domains.
Auto-detected from case description keywords.

## Template: Banking / FinTech

```yaml
domain: banking
palette: [Blue, Navy, Silver]
tone: strict, reliable, conservative
emojis: [🏦, 💳, 🔒]

regulatory:
  - ФЗ-152 (Персональные данные)
  - Требования ЦБ РФ
  - ФСТЭК (Защита информации)
  - PCI DSS (платёжные данные)

architecture_constraints:
  - deployment: on-premise ONLY
  - llm_options: [GigaChat, YandexGPT, LLaMA, Mistral, Qwen]
  - data_perimeter: closed contour
  - hitl: MANDATORY for all decisions
  - audit: full logging of AI actions required

presentation_focus:
  - Security and compliance
  - Data never leaves perimeter
  - Regulatory adherence
  - Conservative ROI estimates

typical_metrics:
  - Время обработки заявки: часы → минуты
  - Стоимость обработки: руб./заявка
  - Точность классификации: %
  - FTE экономия: сотрудников
```

## Template: Retail / E-commerce

```yaml
domain: retail
palette: [Amber, Orange, Warm Gray]
tone: energetic, data-driven, customer-centric
emojis: [🛍️, 📦, ⚡]

regulatory:
  - ФЗ-152 (Персональные данные)
  - ФЗ о рекламе
  - GDPR (если международный)

architecture_constraints:
  - latency: < 200ms for real-time
  - deployment: cloud OK (AWS, GCP, Yandex Cloud)
  - ab_testing: mandatory validation method
  - personalization_vs_privacy: explicit balance required

presentation_focus:
  - Customer experience improvement
  - Conversion rate impact
  - A/B test results
  - Scalability for peak loads (Black Friday)

typical_metrics:
  - Конверсия: % увеличение
  - Средний чек: руб. увеличение
  - Возврат клиентов: retention %
  - Время поиска товара: секунды → секунды
```

## Template: Enterprise / B2B

```yaml
domain: enterprise
palette: [Teal, Indigo, White]
tone: professional, ROI-focused, structured
emojis: [👥, 📊, 🎯]

regulatory:
  - Корпоративные политики ИБ
  - SLA requirements
  - Compliance отдела

architecture_constraints:
  - deployment: hybrid (on-prem + cloud)
  - integration: legacy systems (SAP, 1C, Bitrix)
  - auth: LDAP/AD integration
  - change_management: phased rollout required

presentation_focus:
  - ROI in FTE / hours saved
  - Change management plan
  - Legacy integration approach
  - Phased rollout with clear criteria

typical_metrics:
  - FTE экономия: человеко-часов/мес
  - Время процесса: дней → часов
  - Ошибки: % снижение
  - Employee satisfaction: NPS change
```

## Template: Healthcare

```yaml
domain: healthcare
palette: [Green, White, Light Blue]
tone: careful, evidence-based, patient-centric
emojis: [🏥, 💊, 🩺]

regulatory:
  - ФЗ-323 (Охрана здоровья)
  - ФЗ-152 (Персональные данные)
  - Медицинские изделия (если applicable)
  - Клинические рекомендации

architecture_constraints:
  - hitl: MANDATORY for ALL clinical decisions
  - explainability: required for AI recommendations
  - data_isolation: patient data encryption at rest and in transit
  - deployment: on-premise preferred
  - audit: complete decision trail

presentation_focus:
  - Patient safety first
  - Clinical validation pathway
  - Explainability of AI decisions
  - Doctor as final decision maker

typical_metrics:
  - Точность диагностики: %
  - Время до диагноза: часы → минуты
  - Пропущенные случаи: % снижение
  - Нагрузка на врача: пациентов/смену
```

## Template: Legal

```yaml
domain: legal
palette: [Slate, Navy, Gold]
tone: precise, authoritative, structured
emojis: [⚖️, 📋, ✍️]

regulatory:
  - Адвокатская тайна
  - ФЗ-152
  - Процессуальные кодексы

architecture_constraints:
  - confidentiality: absolute
  - hitl: MANDATORY
  - deployment: on-premise preferred
  - versioning: full document versioning required

typical_metrics:
  - Время подготовки документа: часы → минуты
  - Стоимость юридического часа: руб.
  - Покрытие нормативной базы: %
  - Ошибки в документах: % снижение
```

## Usage

In any phase, detect domain from case description and apply the corresponding template:
- Use palette for CJM prototype design (Phase 2.5)
- Use regulatory list for Architecture (Phase 4)
- Use typical_metrics for Solution Strategy (Phase 3)
- Use presentation_focus for Presentation (Phase 5)
- Use architecture_constraints throughout
