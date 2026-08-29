---
name: structured-reasoning
description: >
  Reasoning routing primitive that selects the optimal reasoning strategy based on problem
  type. Supports Tree-of-Thought (exploration), Chain-of-Thought (linear), CoT Compression
  (cost-sensitive), and Reflection-Suppression (anti-loop). Classifies the problem, applies
  the selected strategy, and verifies the conclusion follows from the reasoning.
  Triggers on: "think step by step", "explore options", "reason about", "analyze tradeoffs".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Structured Reasoning: Strategy Selection for Problem Solving

Reasoning routing primitive. Classifies the problem type and applies the optimal reasoning
strategy: Tree-of-Thought for exploration, Chain-of-Thought for linear problems, CoT
Compression for cost-sensitive paths, or Reflection-Suppression when over-analysis degrades quality.

## When To Activate

Trigger on:
- "think step by step"
- "explore options" or "explore alternatives"
- "reason about" or "reason through"
- "analyze tradeoffs"
- "what are the options"
- "compare approaches"

## Strategies

### 1. Tree-of-Thought (ToT)

**For:** Exploration-heavy problems with multiple viable paths.

**Protocol:**
1. Generate 3-5 reasoning branches from the problem statement
2. Evaluate each branch: feasibility, cost, risk, alignment with goals
3. Score each branch (0-10) with explicit criteria
4. Prune branches scoring below 5
5. Expand the top 2 branches with deeper analysis
6. Select the winner with justification

**When to use:** Architecture decisions, technology selection, strategy choices, any problem
where the first idea is unlikely to be the best.

**When NOT to use:** Simple factual questions, single-path problems, time-critical decisions.

### 2. Chain-of-Thought (CoT)

**For:** Linear problems where step-by-step reasoning leads to a clear answer.

**Protocol:**
1. State the problem clearly
2. Identify the reasoning chain: what follows from what
3. Execute each step, showing intermediate results
4. Verify: does the conclusion follow from the chain?
5. State the answer with confidence level

**When to use:** Debugging, mathematical reasoning, causal analysis, any problem with a
clear logical sequence.

### 3. CoT Compression

**For:** Cost-sensitive paths where verbose reasoning wastes tokens without adding value.

**Protocol:**
1. Identify the 3 key reasoning steps (skip intermediate obvious steps)
2. Execute compressed reasoning
3. State conclusion directly
4. Add one-line verification

**When to use:** Batch processing, repetitive analysis, well-understood problem patterns,
budget-constrained runs.

### 4. Reflection-Suppression

**For:** When excessive self-reflection degrades output quality.

**Protocol:**
1. Detect reflection loop: output contains 3+ "however", "on the other hand", "but then again"
2. Break the loop: commit to the strongest position
3. State the decision with confidence
4. Move forward (do not re-analyze)

**When to use:** The agent is going in circles, producing increasingly hedged output,
or analysis paralysis is visible.

## Protocol

1. **Classify problem** — Exploration (ToT) vs linear (CoT) vs cost-sensitive (compressed) vs over-analyzed (suppress)
2. **Apply selected strategy** — Follow the strategy-specific protocol above
3. **If ToT:** Generate 3-5 branches, score each, select top 2, expand
4. **If compressed:** Identify 3 key reasoning steps, skip intermediate
5. **Verify** — Does the conclusion follow from the reasoning?

## Classification Heuristics

| Signal | Strategy |
|--------|----------|
| Multiple viable approaches mentioned | ToT |
| "Which is better: A or B or C" | ToT |
| "Why does X happen" | CoT |
| "Debug this" | CoT |
| Batch of similar items | Compressed |
| Agent hedging excessively | Reflection-Suppression |
| Time/cost constraint mentioned | Compressed |

## Examples

**In scope:**
- Trigger phrases listed in When To Activate

**Out of scope:**
- Tasks unrelated to this skill domain

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| ToT on trivial problems | Problem has 1 obvious answer but 5 branches generated | Use CoT or Compressed instead |
| CoT on exploration problems | Linear reasoning misses viable alternatives | Switch to ToT |
| Over-compression | Key reasoning steps skipped, conclusion unsupported | Expand back to full CoT |
| Reflection loop | 3+ hedging phrases in output | Apply Reflection-Suppression |
| Strategy not declared | Reasoning starts without explicit strategy selection | Always declare strategy first |

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| schemas/output.json | schemas/output.json | Output validation schema |
| validate-config.json | scripts/validate-config.json | Validation rules |
