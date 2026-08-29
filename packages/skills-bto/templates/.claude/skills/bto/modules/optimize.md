# OPTIMIZE Module — Evolutionary Prompt Optimization Protocol

## Purpose

Improve Claude Code artifacts through evolutionary prompt optimization: generate variants, evaluate, select, mutate, repeat.

## Input

- **Path:** Path to artifact to optimize
- **Rounds:** Number of optimization rounds (default: 3, max: 5)
- **Budget:** max evaluations (default: 15)
- **Focus:** Optional dimension to prioritize (METHODOLOGY / DEPTH / CORRECTNESS / USABILITY / ROBUSTNESS)

## Prerequisites

- Artifact must pass Layer 0 checks (run TEST first)
- Baseline score established (Layer 2 evaluation)
- Only optimize if baseline < 8.0 (otherwise artifact is already good)

---

## Protocol

### Step 1: Baseline Evaluation

1. Run TEST module with level=layer2 on current artifact
2. Record:
   - Per-dimension scores
   - Overall score
   - Key weaknesses identified by judges
3. If overall ≥ 8.0 → report "Artifact already high quality" and suggest minor tweaks only
4. Identify **target dimensions**: dimensions scoring < 7.0

### Step 2: Variant Generation (Round 1)

Generate N=5 variants of the artifact. Each variant applies ONE mutation strategy.

**Mutation Assignment:**
- Variant 1: **Rephrase** — reword unclear instructions for precision
- Variant 2: **Restructure** — reorganize sections for better flow
- Variant 3: **Add Constraints** — add guardrails, edge cases, boundary conditions
- Variant 4: **Simplify** — remove redundancy, tighten language, reduce verbosity
- Variant 5: **Specialize** — add domain-specific context and examples

**Strategy-to-Weakness Mapping:**

| Weak Dimension | Primary Strategy | Secondary Strategy |
|---------------|-----------------|-------------------|
| METHODOLOGY | Restructure | Add Constraints |
| DEPTH | Specialize | Add Constraints |
| CORRECTNESS | Add Constraints | Rephrase |
| USABILITY | Rephrase | Restructure |
| ROBUSTNESS | Add Constraints | Specialize |

If a focus dimension is specified, generate 3 variants targeting that dimension's strategies and 2 variants with other strategies.

### Variant Generation Prompt

```
You are optimizing a Claude Code {artifact_type}.

## Current Artifact
{content}

## Baseline Evaluation
Overall: {score}/10
Weaknesses: {weaknesses}
Target dimensions: {target_dimensions}

## Mutation Strategy: {strategy_name}
{strategy_description}

## Task
Apply the {strategy_name} mutation to improve this artifact.
Focus on addressing these specific weaknesses: {target_weaknesses}

Rules:
- Preserve the original intent and scope
- Maintain all existing sections
- Do not change the artifact type or structure fundamentally
- Changes should be targeted and purposeful
- Write the COMPLETE modified artifact to {variant_path}: first a Write containing the title and
  section headings only, then one Edit per section. Do NOT emit the artifact into your reply.
```

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

### Step 3: Evaluate Variants (Round 1)

Run TEST module with level=layer1 (haiku — fast and cheap) on each variant.

**Parallel execution:** Spawn 5 agents (model: haiku), one per variant.

Record scores for all 5 variants.

### Step 4: Selection + Crossover

**Arity tripwire (run BEFORE selecting).** Assert `len(variants) == 5`. Selection reads "top 2 of
whatever came back", so 4 variants instead of 5 looks exactly like a normal run — a killed worker is
absorbed silently into a smaller pool. If the assertion fails, emit a WARN **naming the missing
variant ids** (`expected variant-1..variant-5, missing: variant-3`) and record it in the optimization
report; do not quietly proceed as if the round were complete.

1. **Select:** Top 2 variants by overall score
2. **Crossover:** Combine best elements:
   - Take sections where Variant A scored higher from A
   - Take sections where Variant B scored higher from B
   - Generate 3 new variants from the crossover

**Crossover Prompt:**
```
You are creating an improved Claude Code artifact by combining the best
elements of two high-scoring variants.

## Variant A (Score: {score_a})
{variant_a}
Strengths: {strengths_a}

## Variant B (Score: {score_b})
{variant_b}
Strengths: {strengths_b}

## Task
Create a new variant that combines the strengths of both:
- From A, take: {specific_sections_a}
- From B, take: {specific_sections_b}
- Ensure coherence and consistency
- Write the COMPLETE artifact to {variant_path}: first a Write containing the title and section
  headings only, then one Edit per section. Do NOT emit the artifact into your reply.
```

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

### Step 5: Evaluate + Select (Rounds 2-3)

**Round 2:**
- Evaluate 3 crossover variants with Layer 1
- Select top 2
- Generate 3 new crossover variants

**Round 3 (Final):**
- Evaluate 3 final variants with **Layer 2** (full judge panel — thorough)
- Select the single best variant

### Step 6: Output

1. **Best variant** — the optimized artifact
2. **Before/After comparison:**
   ```
   ═══════════════════════════════════════════════════════
   🔧 BTO OPTIMIZATION REPORT
   Artifact: <path>
   Rounds: 3
   Total evaluations: 15

   BEFORE → AFTER:
     METHODOLOGY:  6.2 → 8.1  (+1.9) ⬆️
     DEPTH:        5.8 → 7.5  (+1.7) ⬆️
     CORRECTNESS:  7.0 → 8.3  (+1.3) ⬆️
     USABILITY:    6.5 → 8.0  (+1.5) ⬆️
     ROBUSTNESS:   5.5 → 7.8  (+2.3) ⬆️

     OVERALL:      6.2 → 7.9  (+1.7) ⬆️

   Winning Strategy: Restructure + Add Constraints (crossover)

   CHANGELOG:
   - Restructured protocol into clearer numbered steps
   - Added edge case handling for empty inputs
   - Expanded anti-patterns with 3 new entries
   - Simplified module loading instructions
   - Added concrete examples to each section
   ═══════════════════════════════════════════════════════
   ```

3. **Recommendation:**
   - If improvement > 1.0: "Apply changes"
   - If improvement 0.5-1.0: "Review changes, consider applying"
   - If improvement < 0.5: "Minimal improvement — original may be preferred"

---

## Cost Summary

| Operation | Count | Model | Est. Tokens |
|-----------|-------|-------|-------------|
| Baseline eval | 1 | sonnet ×3 | ~15K |
| Variant generation | 5 | opus | ~25K |
| Round 1 eval | 5 | haiku | ~10K |
| Crossover generation | 3 | opus | ~15K |
| Round 2 eval | 3 | haiku | ~6K |
| Crossover generation | 3 | opus | ~15K |
| Round 3 eval | 3 | sonnet ×3 | ~45K |
| **Total** | | | **~131K tokens** |

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Overfitting to one metric | One dimension +3, others flat or down | Balance mutations across dimensions |
| Losing generality | Specialized variant breaks other use cases | Test with multiple example inputs |
| Infinite loop | > 5 rounds without improvement | Hard cap at configured rounds |
| Semantic drift | Optimized version changes intent | Compare purpose statement before/after |
| Premature optimization | Baseline ≥ 8.0 | Skip optimization, suggest minor tweaks |
| Score inflation | Haiku gives high scores to everything | Calibrate with sonnet baseline |
| Single-shot long write | An agent produces a >200-line artifact in one `Write` or one reply | Skeleton first, then `Edit` appends — see "Agent Authoring Rule" in `SKILL.md` |
| Silent variant loss | Round selects "top 2" from fewer than 5 variants without a WARN | Arity tripwire in Step 4 — name the missing variant ids |

## Abort Conditions

Stop optimization immediately if:
1. Any round shows overall regression > 0.5 from baseline
2. Critical structural checks (Layer 0) fail on any variant
3. Artifact semantics change fundamentally
4. User requests stop

---

## Rigorous validation (hold-out + no-regress) — `dz bto-optimize` (when `dz` ≥ 0.3.119)

The evolutionary loop above SELECTS the highest score on the **same** eval it tuned on — which lets a variant
that flatters the judge panel (verbosity, buzzwords) win even if it doesn't help real users (**Goodhart**). When
the `dz` CLI is available, delegate the deterministic validation steps to it so acceptance is gated on **unseen**
scenarios with a **no-regress** guard and a **hard budget cap**. This strengthens the loop; it does not replace it.

**Scope (Phase-1):** only the **directive prose** of `SKILL.md` is mutated — the "when to activate" block + the
core instruction. Frontmatter, section headings, and examples are OFF-LIMITS (`--scope-check` rejects a candidate
that touches them). Never auto-write; the human confirms the diff.

Protocol (folds into the steps above):

1. **Split** the BTO scenario ids into a tuning set and a held-out set (deterministic):
   ```bash
   dz bto-optimize --split --scenarios @scenarios.json --holdout 0.34   # → { tune:[...], holdout:[...] }
   ```
2. **Plan the budget** and respect the hard cap (the engine trims candidates/rounds to fit and reports it):
   ```bash
   dz bto-optimize --plan --candidates 5 --rounds 1 --tune <#tune> --holdout <#holdout> --max 24
   ```
   Never run more judge passes than the printed plan.
3. **Tune** — generate the K prose candidates (existing strategies) and score each via the judge panel on the
   **tune** scenarios ONLY. Record per-candidate per-dimension scores.
4. **Validate** — score the top tune candidate(s) on the **holdout** scenarios (unseen).
5. **Select** — the engine accepts a candidate ONLY if, on the holdout, the weakest dimension improves AND no
   other dimension / the aggregate regresses (beyond `--tolerance`, default 0):
   ```bash
   dz bto-optimize --select --baseline @baseline.json --candidates @candidates.json   # → { winner|null, reason }
   ```
   `baseline.json` = `{ "holdout": {<DimScores>} }`; each candidate = `{ id, prose, tune:{DimScores}, holdout:{DimScores} }`.
   A tune-winner that regresses on the holdout is **rejected** — this is the anti-gaming guarantee.
6. **Confirm gate** — show the prose diff + the tune/holdout deltas and let the human accept before any write:
   ```bash
   dz bto-optimize --scope-check --original SKILL.md --candidate candidate.md   # prose-only guard
   dz bto-optimize --diff --original SKILL.md --candidate candidate.md          # the diff to confirm
   ```

Grounded in dspy.ts MIPROv2 (propose → minibatch-tune → **validate on held-out** → best). Absent `dz` ⇒ fall
back to the heuristic loop above (unchanged).
