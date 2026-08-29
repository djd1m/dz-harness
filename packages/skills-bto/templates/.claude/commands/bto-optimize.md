# /bto-optimize — Evolutionary Prompt Optimization for Skills and Commands

## Usage
```
/bto-optimize [path to skill or command to optimize]
```

## Parameters
- $ARGUMENTS — Path to a skill directory (`.claude/skills/<name>/`) or artifact file to optimize. Optionally include a focus dimension (`METHODOLOGY`, `DEPTH`, `CORRECTNESS`, `USABILITY`, `ROBUSTNESS`) to bias mutation strategies toward a specific weakness. Optionally include "rounds N" (e.g., "rounds 5") to override the default 3 rounds.

## Protocol

### Step 1: Load Skill and Module

Read `.claude/skills/bto/SKILL.md`
Read `.claude/skills/bto/modules/optimize.md`

### Step 2: Validate Input

If $ARGUMENTS is empty:
- Ask: "Provide a path to the skill or command you want to optimize."
- Stop and wait.

Resolve the artifact path from $ARGUMENTS:
- If path does not exist → report "Path not found: [path]" and stop
- If path is a directory → use `SKILL.md` inside it as the primary optimization target
- Parse optional focus dimension from $ARGUMENTS (if provided)
- Parse optional rounds override from $ARGUMENTS (default: 3, max: 5)

### Step 3: Baseline Evaluation

**Run TEST internally before generating any variants.**

Read `.claude/skills/bto/modules/test.md`
Read `.claude/skills/bto/references/judge-rubrics.md`

Execute TEST at Layer 2 (full judge panel, 3 parallel sonnet agents):

- Spawn 3 parallel agents (same as `/bto-test` Layer 2)
- Aggregate scores with weights: Expert 0.40, Critic 0.30, Auditor 0.30
- Record per-dimension baseline scores
- Record overall `BASELINE_SCORE`
- Record key weaknesses from each judge

**Early exit condition:**
If `BASELINE_SCORE` ≥ 8.0 → report:
```
Artifact already high quality (BASELINE_SCORE/10).
Full optimization not recommended. Specific minor suggestions:
[list top 3 suggestions from baseline judges]
```
Stop and wait for user to confirm they still want to proceed.

**Identify target dimensions:** all dimensions with score < 7.0.
If a focus dimension was specified in $ARGUMENTS → add it to target dimensions regardless of score.

### Step 4: Round 1 — Generate 5 Variants

Generate exactly 5 variants of the artifact. Each applies one mutation strategy from `optimize.md`:

| Variant | Mutation Strategy | Prioritize When |
|---------|-----------------|-----------------|
| Variant 1 | Rephrase | CLARITY / USABILITY weak |
| Variant 2 | Restructure | METHODOLOGY / USABILITY weak |
| Variant 3 | Add Constraints | ROBUSTNESS / CORRECTNESS weak |
| Variant 4 | Simplify | Artifact verbose or over-engineered |
| Variant 5 | Specialize | DEPTH weak, needs domain context |

If a focus dimension was specified, assign the 3 most relevant strategies to Variants 1-3 and use remaining strategies for Variants 4-5.

Generate all 5 variants sequentially (opus-level generation). For each variant, apply ONLY its assigned mutation. Preserve original intent, scope, and artifact type.

### Step 5: Evaluate Variants — Round 1

**Spawn 5 parallel agents using Agent tool, one per variant:**

Each agent runs Layer 1 evaluation (model: haiku) on its assigned variant.

Agents:
- Agent 1: "BTO Eval — Variant 1 (Rephrase)"
- Agent 2: "BTO Eval — Variant 2 (Restructure)"
- Agent 3: "BTO Eval — Variant 3 (Add Constraints)"
- Agent 4: "BTO Eval — Variant 4 (Simplify)"
- Agent 5: "BTO Eval — Variant 5 (Specialize)"

Record scores for all 5. Select top 2 by overall score.

### Step 6: Crossover — Generate Round 2 Variants

Combine the best elements of the top 2 variants from Round 1:

- Identify sections where Variant A scored higher → take from A
- Identify sections where Variant B scored higher → take from B
- Generate 3 crossover variants that combine strengths differently

Use crossover prompt from `optimize.md`. Write each COMPLETE artifact to its variant path:
first a `Write` containing the title and section headings only, then one `Edit` per section.
Do NOT emit the artifacts into the reply.

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

**Abort condition:** If any variant fails Layer 0 structural checks during crossover → discard that variant and continue with remaining.

### Step 7: Evaluate Variants — Round 2

**Spawn 3 parallel agents using Agent tool:**

Each agent runs Layer 1 evaluation (model: haiku) on its assigned crossover variant.

Agents:
- Agent 1: "BTO Eval — Round 2 Crossover A"
- Agent 2: "BTO Eval — Round 2 Crossover B"
- Agent 3: "BTO Eval — Round 2 Crossover C"

Record scores. Select top 2.

### Step 8: Crossover — Generate Round 3 Variants

Repeat crossover from Step 6 with the new top 2 from Round 2.
Generate 3 final crossover variants.

### Step 9: Final Evaluation — Round 3 (Full Panel)

**Round 3 uses Layer 2 — full 3-judge panel per variant.**

For each of the 3 final variants, spawn 3 parallel agents (model: sonnet):

Total: up to 9 agents running in parallel (or in 3 sequential batches of 3).

Select the single best variant as winner.

If `max_score(all_variants_round3) < BASELINE_SCORE + 0.3`:
- Report: "Optimization produced minimal improvement. Consider original."
- Still present the best variant for review.

**Abort conditions (from `optimize.md`):**
- Any round shows overall regression > 0.5 from baseline → stop immediately
- Artifact semantics change fundamentally → flag and stop
- User requests stop

### Step 10: Apply Winner

1. Write the winning variant to the original artifact path (overwrite in place)
2. Preserve original as `<filename>.pre-optimize.bak` in the same directory

### Step 11: Generate Report

Compute before/after delta per dimension.

**Winning strategy:** name the mutation strategy (or crossover combination) that produced the winner.

**Recommendation logic:**
- Improvement > 1.0 → "Apply changes — significant improvement"
- Improvement 0.5-1.0 → "Review changes before applying"
- Improvement < 0.5 → "Minimal improvement — original may be preferred"

---

## Checkpoint

```
═══════════════════════════════════════════════════════
CHECKPOINT: OPTIMIZE Complete
Artifact: [path]
Rounds run: [1-3]
Total evaluations: [N] (baseline + variants)

BEFORE → AFTER:
  METHODOLOGY:  X.X → X.X  ([+/-]X.X)
  DEPTH:        X.X → X.X  ([+/-]X.X)
  CORRECTNESS:  X.X → X.X  ([+/-]X.X)
  USABILITY:    X.X → X.X  ([+/-]X.X)
  ROBUSTNESS:   X.X → X.X  ([+/-]X.X)

  OVERALL:      X.X → X.X  ([+/-]X.X)

Winning Strategy: [strategy name or crossover combination]

CHANGELOG:
- [specific change made]
- [specific change made]
- [specific change made]

Recommendation: [Apply / Review / Original preferred]

Backup saved: [path.pre-optimize.bak]

• "ок" — done, keep optimized version
• "ещё раунд" — run one additional optimization round
• "откат" — restore original from backup
• "покажи diff" — show before/after diff for review
═══════════════════════════════════════════════════════
```

Wait for user confirmation.

---

## Modular Usage

This command is also invoked internally by `/bto` as the final step (OPTIMIZE phase) of the full pipeline, receiving `TEST_SCORE` and the artifact path from the preceding TEST step.

## Critical Rules

- Always establish baseline with Layer 2 before generating variants
- Never skip baseline — variants cannot be ranked without a reference point
- Agent tool is REQUIRED for parallel variant evaluation in all rounds
- Hard cap: 3 rounds by default, 5 maximum — never loop indefinitely
- Do not optimize if baseline ≥ 8.0 without explicit user confirmation
- Always save a `.pre-optimize.bak` backup before overwriting original
- Round 3 evaluation must use Layer 2 (sonnet judges), not Layer 1 (haiku)
- Preserve original artifact intent — optimization changes HOW, not WHAT

## Rigorous validation (recommended when `dz` ≥ 0.3.119)

For a reproducible, budget-capped run that resists judge-gaming, follow the **"Rigorous validation (hold-out +
no-regress)"** protocol in `skills/bto/modules/optimize.md`: it splits scenarios into a tuning set and a held-out
set, tunes candidates on the tune set, and accepts a winner ONLY if it lifts the weakest dimension on the UNSEEN
holdout without regressing the others (`dz bto-optimize --split/--plan/--select`). Prose-only, diff-confirmed,
never auto-written. Absent `dz`, the heuristic evolutionary loop runs unchanged.
