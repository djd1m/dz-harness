# Agent Spawning Patterns — Reusable Templates

## Pattern 1: Fan-Out + Merge

Use when: Multiple independent research directions need to run in parallel.

```
┌─────────┐
│ Orchestr│──┬── Agent 1 (Direction A) ──┐
│   ator  │  ├── Agent 2 (Direction B) ──┤── Merge → Artifact
│         │  └── Agent 3 (Direction C) ──┘
└─────────┘
```

Implementation:
```python
# Pseudocode for Agent tool calls
# Launch ALL agents in a SINGLE message (parallel execution)

Agent(description="Direction A research", ...)  # concurrent
Agent(description="Direction B research", ...)  # concurrent
Agent(description="Direction C research", ...)  # concurrent

# After all complete → synthesize into single document
```

Used in: Phase 0, Phase 2, Phase 2.5, Phase 5

## Pattern 2: Pipeline (Sequential with Gates)

Use when: Each step depends on the previous step's output.

```
Phase 0 → Checkpoint → Phase 1 → Checkpoint → Phase 2 → ...
```

Implementation:
- Execute phase
- Create artifact
- Display checkpoint
- WAIT for user confirmation
- Read previous artifacts
- Execute next phase

Used in: Full /casarium pipeline

## Pattern 3: Isolated Parallel (Multi-Research)

Use when: Multiple completely independent research projects.

```
┌──────────┐
│ Launcher │──┬── Agent: Case 1 (isolated dir) ──→ researches/case1/
│          │  ├── Agent: Case 2 (isolated dir) ──→ researches/case2/
│          │  └── Agent: Case 3 (isolated dir) ──→ researches/case3/
└──────────┘
```

Implementation:
- Each agent gets its own directory
- No shared state between agents
- Summary table after all complete

Used in: /parallel-research

## Pattern 4: Skill-Loaded Worker

Use when: An agent needs to operate with a specific skill's methodology.

```
Agent(
  prompt="""
    Step 1: Read .claude/skills/{skill}/SKILL.md
    Step 2: Read context files (previous phases)
    Step 3: Apply skill methodology
    Step 4: Generate artifact
  """
)
```

Key rules:
- ALWAYS load skill BEFORE processing
- ALWAYS read prior artifacts for context
- Skill provides methodology, context provides data

## Pattern 5: Background Agent

Use when: Long-running task that doesn't block user interaction.

```
Agent(
  run_in_background=True,
  description="Background harvest analysis",
  ...
)
```

Used in: /harvest (reviewing large project directories)

## Cost Optimization Guide

| Task Complexity | Recommended Model | Token Budget |
|----------------|-------------------|--------------|
| File operations, formatting | haiku | ~10K |
| Research synthesis, analysis | sonnet | ~50K |
| Creative (CJM, presentation) | opus | ~100K |
| Full pipeline orchestration | opus | ~500K |

## Error Handling

If an agent fails:
1. Log the error
2. Do NOT retry automatically (may waste tokens)
3. Report to orchestrator with error context
4. Orchestrator decides: retry, skip, or ask user
