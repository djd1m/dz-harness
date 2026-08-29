# Anti-Pattern Detection Rules

## Forbidden Patterns — Flag Immediately

| Pattern | Detection Signal | Required Fix |
|---------|-----------------|--------------|
| "Just add GPT" | Generic AI without architecture | Specify concrete models + pipeline |
| Ignoring constraints | No mention of domain limitations | Explicitly address each constraint |
| Over-engineering | > 10 components in MVP | Simplify to MVP-first approach |
| No metrics | Solution without KPIs | Add concrete metrics with baselines |
| Slide reading | Text-heavy presentation | Storytelling + visual anchors |
| No HITL | AI makes final decisions alone | Define escalation policy |
| Vague claims | "Improve efficiency" without numbers | Quantify: "Reduce from 4h to 15min" |
| Skipping CJM | Attempt to skip Phase 2.5 | BLOCK — CJM is MANDATORY |
| Missing Executive Summary | No 08_executive_summary.md | BLOCK — must be created |

## Auto-Detection
When generating content, self-check against these patterns.
If detected, flag with ⚠️ and fix before proceeding.
