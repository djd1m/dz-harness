# Background Workers Rules

## When to Auto-Launch Workers

| Trigger | Worker Type | Condition |
|---------|------------|-----------|
| Case completion | `consolidate` | After 3rd completed `/casarium` case in project |
| Post-BTO test | `health-check` | After a BTO evaluation run, if `@dzhechkov/skills-bto` is installed (advisory, not enforced) |
| Manual | Any | User runs `/workers start <type>` |

Auto-launch triggers are ADVISORY. The system may suggest launching a worker but
MUST wait for user confirmation before actually spawning a background agent.

## Worker Isolation Rules

1. Workers MUST only write to `.keysarium/workers/{worker_id}/` directory
2. Workers MUST NOT modify files in `researches/` (active research data)
3. Workers MUST NOT modify files in `features/` (active feature data)
4. Workers MUST NOT modify files in `.claude/` (commands, rules, skills)
5. Workers MUST NOT modify `CLAUDE.md`, `TOOLKIT_HARVEST.md`, or any root-level file
6. Workers MAY read any file in the project for analysis purposes
7. Exception: `export-brain` worker MAY write to `.keysarium/exports/` (standard export location)

## Model Routing for Workers

| Worker Type | Model | Rationale |
|-------------|-------|-----------|
| `consolidate` | sonnet | Pattern synthesis requires analytical reasoning |
| `export-brain` | haiku | Primarily file reading and JSON assembly |
| `health-check` | haiku | Structural checks, simple pattern matching |
| `pattern-analysis` | sonnet | Trend analysis requires deeper reasoning |

NEVER use opus for background workers -- workers perform routine tasks, not creative work.
ALWAYS specify the model parameter when spawning a worker agent.

## Concurrency Limits

- Maximum concurrent workers: **3**
- If limit reached, new worker requests MUST be rejected (not queued)
- Rationale: prevent context exhaustion and ensure foreground responsiveness

## Worker Naming Convention

When spawning worker agents, use this naming format:
```
"Background Worker: {type} ({worker_id})"
```

Example: `"Background Worker: consolidate (wkr-20260301-143022-consolidate)"`

## Worker Timeout

- Workers are subject to the Agent tool's built-in timeout (~10 minutes)
- Design workers to complete within this window
- If a worker needs more time, it should checkpoint its progress and be re-launched

## Registry Management

- Only the `/workers` command (orchestrator) may write to `registry.json`
- Workers write to their own `status.json` in their output directory
- This prevents write conflicts between the orchestrator and workers

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Worker modifies research files | File write outside `.keysarium/workers/` | BLOCK -- enforce isolation |
| Worker uses opus model | Model parameter check | Use haiku or sonnet per routing table |
| More than 3 concurrent workers | Registry count check | Reject new worker start |
| Worker spawns sub-agents | Instruction check in template | Templates explicitly forbid sub-agents |
| Auto-launch without user consent | Missing user confirmation | Always ask before auto-launching |
| Worker runs indefinitely | No progress updates | Workers must update status.json periodically |
