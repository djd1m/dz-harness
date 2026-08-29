# Agent Swarm Rules

## When to Use Agents
- Phase 0: 2 parallel agents (JTBD || Competitors+ROI)
- Phase 2: 3 parallel agents (Analogues || Technologies || Regulations)
- Phase 2.5: 3 parallel agents (Variant A || Variant B+C || Trend Research D)
- Phase 5: 3 parallel agents (Presentation || Speaker Script || Q&A+Executive)
- /parallel-research: 1 agent per case (up to 4 cases)

## Agent Isolation
- Each agent works in its own research directory
- Agents do NOT modify files outside their assigned scope
- After parallel agents complete, the orchestrator SYNTHESIZES results

## Agent Naming Convention
When spawning agents, use descriptive names:
- "Phase 0 JTBD Analysis"
- "Phase 2 Technology Research"
- "Phase 2.5 CJM Variant A"
- "Phase 5 Speaker Script"

## BTO Agent Patterns
(Skill-evaluation swarms — BTO test/optimize — live in the separate `@dzhechkov/skills-bto`
package and are not available in a Keysarium-only install.)

## Cost Optimization
- Use model="haiku" for simple file operations, formatting, and BTO Layer 0-1 evaluation
- Use model="sonnet" for research synthesis, analysis, and BTO judge panel (Layer 2)
- Use default (opus) for complex creative work (CJM design, presentation storytelling, BTO crossover)
