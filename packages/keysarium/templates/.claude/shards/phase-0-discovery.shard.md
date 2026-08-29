# Phase 0: Discovery — Governance Shard

## Time Budget
15% of total timeline

## Skill
Load: `.claude/skills/reverse-engineering-unicorn/SKILL.md` (modules M2-M5)

## Mandatory Outputs
- `00_product_discovery.md`

## Content Requirements
- As-Is process mapping
- JTBD segments (minimum 3)
- Voice of Customer synthesis
- Aha Moment identification
- Why AI / Why Now justification
- Competitive landscape (minimum 3 competitors)
- Business Case with ROI projections
- Adoption Strategy

## Agent Swarm
- Agent 1 (sonnet): JTBD + Voice of Customer + Aha Moment
- Agent 2 (sonnet): Competitor Analysis + Business Case + Why AI Why Now
- Synthesize results into single document

## Domain Detection
Detect domain from case description and apply domain-specific rules:
- Banking: on-premise LLM, ФЗ-152, ЦБ, ФСТЭК
- Retail: latency < 200ms, A/B testing
- Enterprise: Change Management, Legacy integration
- Healthcare: HITL mandatory, ФЗ-323

## Quality Gates
- Zero unverified competitor names
- ROI must include concrete numbers (FTE/hours/currency)
- JTBD format: "When [situation], I want to [motivation], so I can [outcome]"

## Promise
On completion: `<promise>DISCOVERY_COMPLETE</promise>`

## Anti-Patterns to Check
- "Just add GPT" without specific model/pipeline → BLOCK
- No metrics/KPIs → BLOCK
- Vague claims without numbers → FLAG
