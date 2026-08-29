---
name: context-window-management
description: >
  Strategies for operating under context pressure. Implements priority-based pruning,
  checkpoint-restore, summarization, sliding window, and delegation patterns. Monitors
  context usage, activates management at ~60% capacity, and selects the optimal strategy
  based on task type. Prevents premature pruning and over-summarization.
  Triggers on: "context is getting long", "running out of context", "manage context", "compact".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Context Window Management: Operating Under Context Pressure

Strategies for maintaining effective operation when context window usage is high. Monitors
usage, activates management at ~60% capacity, and applies the optimal strategy: pruning,
checkpointing, summarization, sliding window, or delegation.

## When To Activate

Trigger on:
- "context is getting long"
- "running out of context"
- "manage context" or "compact context"
- "compact"
- "save progress and continue"
- Automatic: when estimated context usage exceeds 60%

## Strategies

### 1. Priority-Based Pruning

Drop low-impact context while preserving high-impact information.

**Ranking criteria (highest to lowest priority):**
1. Current task instructions and constraints
2. Recent outputs and decisions (last 3 turns)
3. Active file contents being edited
4. Earlier conversation context
5. Read-only reference material
6. Verbose tool outputs (build logs, test results)

**Protocol:**
1. Rank all context items by priority
2. Identify items in priority tiers 5-6
3. Summarize each low-priority item in 1 line
4. Drop verbose details, keep summaries

### 2. Checkpoint-Restore

Save key decisions and findings to files, clear context, reload essentials.

**Protocol:**
1. Write current state to a checkpoint file: decisions made, files modified, next steps
2. Save to `.context-checkpoint.md` in the working directory
3. Clear non-essential context
4. On restore: read checkpoint file, reload only essential files

### 3. Summarization

Compress long outputs into key findings before they fill context.

**Protocol:**
1. After each long output (>50 lines), produce a 3-5 line summary
2. Retain summary, reference original via file path
3. For multi-file analysis: accumulate findings in a structured list, not full file contents

### 4. Sliding Window

Process large inputs in chunks, accumulating results.

**Protocol:**
1. Split input into chunks (by file, by section, or by line count)
2. Process chunk N, extract findings
3. Write findings to accumulator file
4. Drop chunk N from context, load chunk N+1
5. After all chunks: synthesize from accumulator

### 5. Delegation

Spawn sub-agents for independent subtasks to isolate context.

**Protocol:**
1. Identify independent subtasks that do not share context
2. Spawn sub-agent for each (via Task tool or agent_spawn)
3. Each sub-agent gets only the context it needs
4. Collect results, synthesize in main context

## Protocol

1. **Monitor** — Estimate context usage: count files read, outputs generated, conversation length
2. **Threshold** — At ~60% capacity, activate management
3. **Select strategy** based on task type:
   - Long session with many turns -> Checkpoint-Restore
   - Large codebase analysis -> Sliding Window
   - Multiple independent tasks -> Delegation
   - General context bloat -> Priority-Based Pruning
   - Verbose outputs -> Summarization
4. **Execute** — Apply selected strategy
5. **Verify** — Essential context preserved, task continuity maintained

## Strategy Selection Matrix

| Situation | Recommended Strategy |
|-----------|---------------------|
| Long conversation (50+ turns) | Checkpoint-Restore |
| Analyzing 20+ files | Sliding Window |
| 3+ independent subtasks | Delegation |
| Build/test output filling context | Summarization |
| General high usage, no clear pattern | Priority-Based Pruning |
| Combination of above | Layer strategies (e.g., Summarize + Prune) |

## Examples

**In scope:**
- Trigger phrases listed in When To Activate

**Out of scope:**
- Tasks unrelated to this skill domain

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Premature pruning | Critical context dropped before task completion | Only prune tiers 5-6; verify essential context preserved |
| Checkpoint without verification | State file written but not validated | Re-read checkpoint file immediately after writing |
| Over-summarization | Summary loses actionable details needed for next step | Keep structured data (lists, code refs), compress prose |
| Ignoring context pressure | No management until context is 95%+ full | Start at 60%, not at failure |
| Delegation overhead | Sub-agent spawn cost exceeds context savings | Only delegate truly independent subtasks |

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| schemas/output.json | schemas/output.json | Output validation schema |
| validate-config.json | scripts/validate-config.json | Validation rules |
