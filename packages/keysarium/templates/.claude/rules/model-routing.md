# Model Routing Enforcement

## 3-Tier Model Routing

All agent spawning MUST follow the model routing table below.
Using a higher-cost model than necessary wastes budget.
Using a lower-cost model than required degrades quality.

## Routing Table

| Tier | Model | Latency | When to Use |
|------|-------|---------|-------------|
| Tier 1 | haiku | ~500ms | File formatting, simple transforms, Layer 0 checks, Layer 1 quick eval, BTO variant fast-ranking |
| Tier 2 | sonnet | ~2s | Research synthesis, analysis, BTO Layer 2 judge panel, mutation workers, meta-judge escalation |
| Tier 3 | opus (default) | ~5s | Creative CJM design, presentation storytelling, BTO crossover synthesis, complex problem solving |

## Per-Task Assignment

### Keysarium Pipeline

| Task | Model | Rationale |
|------|-------|-----------|
| Phase 0 parallel agents (JTBD, Competitors) | sonnet | Research synthesis |
| Phase 1 exploration | opus | Creative clarification |
| Phase 2 parallel agents (Analogues, Tech, Regulations) | sonnet | Research analysis |
| Phase 2.5 CJM variant generation | opus | Creative design work |
| Phase 2.5 trend research agents | sonnet | Research synthesis |
| Phase 3 solution design | opus | Complex problem solving |
| Phase 4 architecture | opus | System design |
| Phase 5 presentation storytelling | opus | Creative storytelling |
| Phase 5 speaker script agents | sonnet | Structured generation |
| Phase 5 Q&A preparation | sonnet | Analytical work |
| File formatting, slug generation | haiku | Simple transforms |

### BTO Pipeline

| Task | Model | Rationale |
|------|-------|-----------|
| Layer 0 structural checks | haiku | Pattern matching only |
| Layer 1 semantic baseline | haiku | Fast coherence scan |
| Layer 2 Domain Expert judge | sonnet | Domain knowledge + nuanced scoring |
| Layer 2 Critic judge | sonnet | Adversarial analysis |
| Layer 2 Completeness Auditor judge | sonnet | Structured coverage check |
| Meta-judge (disagreement resolution) | sonnet | Arbitration |
| Optimization variant fast-eval (Round 1, 2) | haiku | Volume scoring |
| Optimization Round 3 full panel | sonnet | Final quality assessment |
| Optimization crossover / creative synthesis | opus | Novel combination of candidates |

## Enforcement Rules

1. **NEVER** use opus for Layer 0 or Layer 1 evaluation — this is wasteful
2. **NEVER** use haiku for Layer 2 judge panel — quality will be insufficient
3. **NEVER** use haiku for creative work (CJM design, storytelling) — output will be shallow
4. When spawning agents with the Agent tool, ALWAYS specify the `model` parameter
5. If model is not specified, the agent inherits the parent model (opus by default)
6. For cost optimization, prefer haiku for any task that is primarily pattern-matching or formatting

## Cost Impact

Approximate cost ratios (per 1K output tokens):
- haiku: 1x (baseline)
- sonnet: 15x
- opus: 75x

Using haiku instead of opus for Layer 0-1 saves ~98% on those evaluation steps.
