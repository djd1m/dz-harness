# Agent Template: Parallel Research Orchestrator

## Purpose
Оркестратор для запуска нескольких исследований параллельно.
Каждое исследование выполняется изолированным агентом.

## Spawning Pattern
```
# For each case in the parallel-research input:
Agent(
  subagent_type="general-purpose",
  description="Research: [case_name]",
  prompt="""
    You are conducting Phase 0 (Product Discovery) for a case study.

    Read the skill: .claude/skills/reverse-engineering-unicorn/SKILL.md

    Case: [CASE_DESCRIPTION]
    Working directory: researches/[SLUG]/

    Create the following structure:
    1. researches/[SLUG]/prototype/ (directory)
    2. researches/[SLUG]/diagrams/ (directory)
    3. researches/[SLUG]/README.md (with case metadata)
    4. researches/[SLUG]/00_product_discovery.md (full Phase 0 output)

    Follow the Product Discovery template from the skill.
    Use PARANOID mode for any factual claims.

    After completion, provide a 3-line summary:
    - Key user segments found
    - Main competitive differentiator
    - Estimated ROI
  """
)
```

## Orchestration Flow

```
1. Parse input: split by "|" separator
2. For each case:
   a. Generate slug (snake_case, latin)
   b. Create directory structure
   c. Spawn isolated agent
3. Wait for all agents to complete
4. Generate summary table
5. Present to user for next steps
```

## Limits
- Maximum 4 parallel cases (Claude Code context/cost optimization)
- Each agent is independent — no shared state
- If one agent fails, others continue

## Post-Completion
```
═══════════════════════════════════════════════════════
✅ Parallel Discovery Complete

| # | Case | Directory | Segments | ROI | Status |
|---|------|-----------|----------|-----|--------|
| 1 | [name] | researches/[slug]/ | [N] | [X] руб/мес | ✅ |
| 2 | [name] | researches/[slug]/ | [N] | [X] руб/мес | ✅ |

Next steps:
  /casarium researches/[slug1]/ — continue case 1
  /casarium researches/[slug2]/ — continue case 2
═══════════════════════════════════════════════════════
```
