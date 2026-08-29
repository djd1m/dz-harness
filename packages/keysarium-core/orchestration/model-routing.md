# Model Routing — 3-Tier Model Assignment

> Rules for assigning the right AI model tier to each task in a multi-agent pipeline.

## Overview

Not every task requires the most capable (and expensive) model. A 3-tier routing system assigns the appropriate model based on task complexity, ensuring cost efficiency without sacrificing quality where it matters.

## The 3 Tiers

| Tier | Model Class | Latency | Relative Cost | When to Use |
|------|-------------|---------|---------------|-------------|
| Tier 1 | Fast/Cheap (e.g., haiku) | ~500ms | 1x (baseline) | Simple transforms, pattern matching, structural checks |
| Tier 2 | Balanced (e.g., sonnet) | ~2s | 15x | Research synthesis, analysis, multi-evaluator panels |
| Tier 3 | Premium (e.g., opus) | ~5s | 75x | Creative work, complex problem solving, novel synthesis |

## Task Classification Rules

### Tier 1 Tasks (Fast/Cheap)

Use the cheapest model for:
- File formatting and restructuring
- Simple transforms (slug generation, path construction)
- Structural validation checks (does the file have required sections?)
- Pattern matching (does this text contain specific markers?)
- Quick ranking passes (sorting candidates by simple criteria)

### Tier 2 Tasks (Balanced)

Use the balanced model for:
- Research synthesis and summarization
- Analytical work (comparing options, evaluating trade-offs)
- Multi-evaluator judge panels (domain expert, critic, auditor)
- Mutation workers in optimization loops
- Structured generation (scripts, Q&A preparation)

### Tier 3 Tasks (Premium)

Use the premium model for:
- Creative design work (prototypes, user journeys)
- Complex problem solving (TRIZ, game theory analysis)
- Novel synthesis (combining best elements from multiple candidates)
- Storytelling and narrative construction
- System architecture design

## Enforcement Rules

1. **NEVER** use Tier 3 for structural checks — this wastes budget with no quality gain
2. **NEVER** use Tier 1 for evaluator panels — quality will be insufficient for reliable scoring
3. **NEVER** use Tier 1 for creative work — output will be shallow and predictable
4. When spawning agents, ALWAYS specify the model tier explicitly
5. If not specified, the agent inherits the parent's tier (usually Tier 3 by default)

## Cost Impact

Using proper routing can reduce costs by 80-90% compared to using Tier 3 for everything:

```
Example pipeline with 20 tasks:
  Without routing: 20 tasks * Tier 3 = 20 * 75x = 1500x
  With routing:    8 Tier 1 + 8 Tier 2 + 4 Tier 3 = 8 + 120 + 300 = 428x
  Savings: ~71%
```

## Per-Pipeline Customization

Each pipeline should define a routing table mapping its specific tasks to tiers:

```markdown
| Task | Tier | Rationale |
|------|------|-----------|
| {Your task 1} | 1 | {Why Tier 1 is sufficient} |
| {Your task 2} | 2 | {Why Tier 2 is needed} |
| {Your task 3} | 3 | {Why Tier 3 is required} |
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Everything on Tier 3 | No model parameter in agent spawns | Add explicit model routing |
| Judge on Tier 1 | Quality scores have high variance | Upgrade judges to Tier 2 |
| Creative work on Tier 1 | Outputs are generic and shallow | Upgrade to Tier 3 |
| Structural check on Tier 3 | Simple pass/fail taking 5+ seconds | Downgrade to Tier 1 |

## Integration with Orchestration

The Queen Coordinator should:
1. Load the routing table at INIT
2. When spawning each agent, consult the routing table
3. Specify the model parameter based on the task type
4. Log the model used for each task (for cost tracking)
