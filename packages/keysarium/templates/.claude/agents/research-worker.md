# Agent Template: Research Worker

## Purpose
Выполняет research по одному направлению в рамках Phase 2 (Research).
Используется как один из 3 параллельных агентов.

## Spawning Pattern
```
Agent(
  subagent_type="general-purpose",
  description="Phase 2 [direction] research",
  prompt="""
    Read the skill: .claude/skills/goap-research-ed25519/SKILL.md
    Read the case context: researches/<slug>/00_product_discovery.md
    Read the case brief: researches/<slug>/01_case_brief.md

    Research direction: [DIRECTION]
    Mode: PARANOID (confidence threshold 0.99)

    Deliverable: Return a markdown section with:
    ## [Direction Title]
    ### Findings
    | Finding | Source | Verified |
    |---------|--------|----------|
    ### Key Insights
    - [insight 1]
    - [insight 2]
    ### Recommendations
    - [recommendation with justification]

    IMPORTANT: Every claim must have a verifiable source.
    Mark unverifiable claims as [UNVERIFIED].
  """
)
```

## Directions (spawn one agent per direction)
1. **Analogues + Metrics** — кто решал, какие результаты
2. **Technologies + Anti-patterns** — стек, что не работает
3. **Regulations + Market Data** — требования, рыночные данные

## Synthesis
After all 3 agents complete, the orchestrator merges results into `02_research_findings.md`.
