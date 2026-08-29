# Sources Index Template

## Purpose

This file serves as a centralized index of all sources used in a presentation. It enables:
- Easy verification of claims
- Quick access to original sources
- Audit trail for compliance
- Re-use in future presentations

---

## Template Structure

```markdown
# ИНДЕКС ИСТОЧНИКОВ: [Название презентации]

**Дата создания:** [date]
**Количество источников:** [N]
**Verification mode:** [development/moderate/strict/paranoid]

---

## Статистика по источникам

| Категория | Количество |
|-----------|------------|
| Глобальные (EN) | [N] |
| Российские (RU) | [N] |
| Government/Official | [N] |
| Industry Reports | [N] |
| Academic/Research | [N] |
| Vendor Documentation | [N] |
| News/Media | [N] |

---

## Источники по слайдам

### Слайд 3: [Название]
| # | Claim | Source | Type | URL | Confidence |
|---|-------|--------|------|-----|------------|
| 1 | [fact] | [name] | [type] | [url] | [0.XX] |

### Слайд 4: [Название]
| # | Claim | Source | Type | URL | Confidence |
|---|-------|--------|------|-----|------------|
| 1 | [fact] | [name] | [type] | [url] | [0.XX] |

[... continue for all slides with sources ...]

---

## Полный алфавитный список

### A-Z (English sources)

| # | Source Name | Domain | Type | Used in Slides |
|---|-------------|--------|------|----------------|
| 1 | [name] | [domain] | [type] | 3, 5, 12 |

### А-Я (Russian sources)

| # | Source Name | Domain | Type | Used in Slides |
|---|-------------|--------|------|----------------|
| 1 | [name] | [domain] | [type] | 4, 6, 15 |

---

## Source Type Classification

| Type | Description | Trust Level |
|------|-------------|-------------|
| gov | Government official source | 5 |
| academic | Peer-reviewed research | 5 |
| industry | Industry analyst reports (Gartner, IDC, etc.) | 4-5 |
| vendor | Official vendor documentation | 4 |
| news-tier1 | Major news (Reuters, AP, BBC) | 4 |
| news-tier2 | Industry news | 3 |
| blog | Company/expert blogs | 2-3 |
| community | Forums, Stack Overflow, etc. | 2 |

---

## Verification Notes

### High-confidence facts (≥0.95)
- [List of facts with highest verification]

### Cross-referenced facts (2+ sources)
- [List of facts verified by multiple sources]

### Single-source facts (flagged for review)
- [List of facts with only one source]

---

## Update Log

| Date | Action | Notes |
|------|--------|-------|
| [date] | Initial creation | [N] sources |
| [date] | Added source | [source name] for slide [N] |
| [date] | Removed source | [reason] |
```

---

## Source Quality Tiers

### Tier 1: Authoritative (Trust 5)
- Government sources (.gov, .gov.ru)
- Official regulatory bodies (ФСТЭК, Роскомнадзор)
- Legal databases (Consultant.ru, Garant.ru)
- Peer-reviewed academic publications
- Official standards bodies (ISO, ГОСТ)

### Tier 2: High Quality (Trust 4)
- Major industry analysts (Gartner, IDC, McKinsey, iKS-Consulting)
- Official vendor documentation
- Established news agencies (Reuters, AP, ТАСС)
- Professional associations
- SEC filings, financial reports

### Tier 3: Reliable (Trust 3)
- Industry publications (ComNews, CNews, TAdviser)
- Company press releases (for facts about that company)
- Technical documentation
- Conference proceedings
- Expert blogs with established reputation

### Tier 4: Contextual (Trust 2)
- General news sources
- Community resources (Habr, Medium)
- Stack Overflow, GitHub discussions
- Wikipedia (for general context only)

### Tier 5: Unreliable (Trust 1)
- Anonymous sources
- Unverified social media
- SEO-optimized content farms
- Sources with obvious bias

---

## Citation Format Standards

### In-presentation format
```
**📚 ИСТОЧНИКИ:**
1. [Short Name]: [Full URL]
2. [Short Name]: [Full URL]
```

### In-index format
```
| Claim | Source | Type | URL | Confidence |
|-------|--------|------|-----|------------|
| [exact claim text] | [Full source name] | [type] | [url] | [0.XX] |
```

### For regulatory/legal sources
```
[Law Name] от [date] № [number]-ФЗ
Source: [official portal URL]
Status: Действующий / С изменениями от [date]
```

---

## Verification Checklist

- [ ] Every statistic has at least one source
- [ ] All sources are accessible (URLs work)
- [ ] Sources are current (≤2 years for market data)
- [ ] No circular citations (A cites B cites A)
- [ ] Regulatory sources are from official portals
- [ ] Competitor claims are from official sources or verified news
- [ ] TCO/pricing sources are dated and contextual
- [ ] Quotes are attributed correctly

---

## Common Source Domains by Topic

### GPU/AI Infrastructure
- nvidia.com/docs
- project-hami.io
- volcano.sh
- cncf.io
- cast.ai
- lambda.ai

### Russian Regulations
- consultant.ru
- garant.ru
- pravo.gov.ru
- fstec.ru
- rkn.gov.ru

### Cloud Market (Russia)
- ict.moscow
- comnews.ru
- cnews.ru
- tadviser.ru
- iksconsulting.ru

### Global Market
- gartner.com
- idc.com
- mckinsey.com
- statista.com
- grandviewresearch.com
