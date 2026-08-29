# Shard Protocol — Per-Stage Governance Rules

> How to create and load governance shards that prevent context drift during long sessions.

## Problem

In long-running multi-agent sessions, rules loaded at the beginning drift out of the agent's active context after approximately 40 minutes. By the time later stages execute, the agent may have "forgotten" critical rules.

## Solution

Each pipeline stage gets its own **governance shard** — a focused set of rules that is re-read at the start of that stage. This ensures the agent always has the relevant rules in active context.

## Shard Format

Each shard is a markdown file with the following structure:

```markdown
# {Stage Name} Governance Shard

## Time Budget
- Allocated: {percentage}% of total pipeline time
- Hard limit: {minutes} minutes

## Prerequisites
- Required upstream promises: [{PROMISE_TAG_1}, {PROMISE_TAG_2}]
- Required input files: [{file_list}]

## Skill to Load
- Primary: {skill_name} (read SKILL.md at: {path})
- Secondary: {skill_name} (optional)

## Rules for This Stage
1. {Rule 1 — specific to this stage}
2. {Rule 2}
3. ...

## Quality Gates
- [ ] {Gate 1 — what must be true for this stage to pass}
- [ ] {Gate 2}
- [ ] {Gate 3}

## Promise Tag
On successful completion, emit: `<promise>{PROMISE_TAG}</promise>`

## Anti-Patterns for This Stage
| Pattern | Fix |
|---------|-----|
| {Anti-pattern 1} | {Fix} |
| {Anti-pattern 2} | {Fix} |
```

## Shard Naming Convention

```
{stage-id}.shard.md
```

Examples:
- `stage-0-init.shard.md`
- `stage-1-analysis.shard.md`
- `stage-2-research.shard.md`
- `bto-evaluation.shard.md`

## Shard Loading Protocol

At the start of each stage:

1. **Determine shard path:** Construct the shard filename from the stage ID
2. **Read shard:** Load the shard file content into the agent's context
3. **Validate prerequisites:** Check that all required upstream promises have been emitted
4. **Validate inputs:** Check that all required input files exist
5. **Load skill:** If the shard specifies a skill, read its SKILL.md
6. **Start timer:** Begin tracking time against the shard's budget
7. **Execute stage:** Follow the shard's rules and quality gates

## Shard Directory Location

Shards should be stored in a dedicated directory within your pipeline configuration:

```
{pipeline-config}/shards/
├── stage-0-init.shard.md
├── stage-1-analysis.shard.md
├── stage-2-research.shard.md
├── stage-3-design.shard.md
└── ...
```

## Creating a New Shard

To create a shard for a new stage:

1. Copy the template format above
2. Fill in the stage-specific rules, quality gates, and anti-patterns
3. Define the time budget (as a percentage of total pipeline time)
4. List prerequisites (upstream promise tags)
5. Specify the skill to load (if applicable)
6. Define the promise tag this stage emits on completion
7. Save to the shards directory with the naming convention

## Shard Compilation

For complex pipelines, the master configuration file (e.g., CLAUDE.md) can be "compiled" into per-stage shards at pipeline start:

1. Read the master configuration
2. Extract stage-relevant rules
3. Generate shards with only the rules applicable to each stage
4. Each agent receives a focused, lightweight governance document instead of the full configuration

This reduces context load from hundreds of lines to 30-50 lines per stage.

## Best Practices

- Keep each shard under 100 lines for optimal context usage
- Include only rules relevant to the current stage
- Always include the promise tag for completion signaling
- Always include time budget to prevent stages from running indefinitely
- Review and update shards when pipeline rules change
