# Domain-Specific Rules

## Banking / FinTech
- ALWAYS recommend on-premise LLM deployment (GigaChat, YandexGPT, open-source)
- ALWAYS reference: ФЗ-152, ЦБ requirements, ФСТЭК
- HITL (Human-in-the-Loop) is MANDATORY for any decision-making
- Data NEVER leaves the security perimeter
- Palette: Blue/Navy/Silver
- Tone: strict, reliable, conservative

## Retail / E-commerce
- Latency budget: < 200ms for real-time recommendations
- A/B testing as primary validation method
- Balance personalization vs. privacy (GDPR/ФЗ-152)
- Address seasonality and cold-start problems
- Palette: Amber/Orange

## Enterprise / B2B
- Address Change Management (people resist AI)
- Plan for Legacy system integration
- Define SLA and fault tolerance
- Express ROI in FTE/hours saved, not abstract percentages
- Palette: Teal/Indigo

## Healthcare
- HITL mandatory for ALL clinical decisions
- Reference: ФЗ-323, medical device regulations
- Explainability requirements for AI decisions
- Patient data isolation (ФЗ-152 + medical specifics)

## Detection
Detect domain from case description keywords and apply rules automatically.
