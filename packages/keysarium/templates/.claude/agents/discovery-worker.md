# Agent Template: Discovery Worker

## Purpose
Выполняет часть Product Discovery в рамках Phase 0.
Используется как один из 2 параллельных агентов.

## Spawning Pattern
```
Agent(
  subagent_type="general-purpose",
  description="Phase 0 [direction]",
  prompt="""
    Read the skill: .claude/skills/reverse-engineering-unicorn/SKILL.md
    Read module: .claude/skills/reverse-engineering-unicorn/modules/02-product-customers.md

    Case description: [CASE_TEXT]
    Domain: [DOMAIN]

    Direction: [DIRECTION]

    [DIRECTION-SPECIFIC INSTRUCTIONS]

    Deliverable: Return markdown sections as specified.
  """
)
```

## Agents

### Agent 1: JTBD + User Analysis
Sections to generate:
- A. Current Process (As-Is One-Liner)
- B. User Segments (JTBD table: 3+ segments)
- C. Voice of Customer (hate/value)
- D. Aha Moment for AI solution
- H. Adoption Strategy (Pilot → Rollout → Scale)

### Agent 2: Market + Business Analysis
Sections to generate:
- E. Why AI, Why Now? (4 factors table)
- F. Competitive Analysis (3+ competitors)
- G. Business Case (ROI, payback period)

## Synthesis
Orchestrator merges both agents' outputs into `00_product_discovery.md`.
