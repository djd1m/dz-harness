# Evidence Hierarchy for Medical Research

> Reference file for health-advisor-research.md. Defines evidence levels for medical claims.

## 7-Level Evidence Hierarchy

| Level | Name | Description | Example | Can recommend? |
|---|---|---|---|---|
| **1** | Мета-анализ / Систематический обзор РКИ | Cochrane review, PRISMA-compliant SR | Cochrane review on omega-3 for CVD (2020) | ✅ Strongly |
| **2** | Рандомизированное контролируемое исследование (РКИ) | Single well-designed RCT | REDUCE-IT (2019), IMPROVE-IT (2015) | ✅ Yes |
| **3** | Когортное / Проспективное наблюдательное | Large cohort studies | Framingham Heart Study, NHANES | ✅ With caveat |
| **4** | Исследование случай-контроль | Retrospective case-control | Brasky et al. (2013) on omega-3 and prostate | ⚠️ With strong caveat |
| **5** | Серия случаев / Описание случая | Case series, case reports | Single patient reports | ⚠️ Not for general recommendation |
| **6** | Мнение эксперта / Консенсус | Expert opinion, consensus statements | AHA Science Advisory | ⚠️ Context-dependent |
| **7** | Исследование in vitro / на животных | Cell culture, animal models | Mouse study on fasting | ❌ Not for clinical recommendation |

## Minimum Evidence for Recommendation

- **To RECOMMEND a product/drug/exercise:** Level 1-3 required
- **To MENTION as potentially beneficial:** Level 4-5 acceptable with clear caveat
- **To NOTE as theoretical possibility:** Level 6-7 acceptable with explicit "не доказано у человека"
- **To AVOID/CONTRAINDICATE:** Level 1-4 of harm, OR pharmacological mechanism of harm

## Labeling Convention

Every recommendation in output documents must include evidence level:

```markdown
✅ **Рекомендовано** (Уровень 1: мета-анализ 86 РКИ, [Abdelhamid et al., 2020](pubmed...))
⚠️ **С осторожностью** (Уровень 4: наблюдательное исследование, [Brasky et al., 2013](pubmed...))
❌ **Не рекомендовано** (Уровень 2: РКИ STRENGTH показал отсутствие эффекта, [Nicholls et al., 2020](pubmed...))
```
