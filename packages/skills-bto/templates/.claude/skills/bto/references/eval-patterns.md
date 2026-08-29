# Multi-Agent Evaluation Patterns

## Overview

Research-backed patterns for using multiple LLM agents to evaluate content. Each pattern trades off cost, reliability, and depth.

---

## Pattern 1: Judge Panel (Used by BTO)

**Architecture:** N independent judges evaluate the same artifact in parallel.

```
Artifact ──┬──→ Judge 1 (Expert)     ──┐
           ├──→ Judge 2 (Critic)      ──┼──→ Aggregator → Report
           └──→ Judge 3 (Auditor)     ──┘
```

**Strengths:**
- Multi-perspective coverage
- Parallel execution (fast)
- Disagreement detection reveals ambiguous quality

**Weaknesses:**
- Judges may converge to similar opinions (groupthink)
- More expensive than single judge
- Requires aggregation logic

**When to use:** Standard evaluation of well-defined artifacts. BTO default.

**Mitigation for groupthink:**
- Give each judge a distinct role and perspective
- Critic judge explicitly instructed to be strict (calibrated lower)
- Different temperature settings if available

---

## Pattern 2: Adversarial Red/Blue

**Architecture:** One agent creates, another attacks.

```
Artifact ──→ Blue Team (Defender)  ──→ Assessment
         ──→ Red Team (Attacker)   ──→ Vulnerabilities
                                   ──→ Reconciliation
```

**Strengths:**
- Excellent at finding weaknesses
- Simulates real-world usage patterns
- Defender forced to justify every choice

**Weaknesses:**
- Can be overly negative
- Expensive (multiple rounds)
- Not suited for overall quality scoring

**When to use:** Security-sensitive artifacts, high-stakes decisions, or when robustness is critical.

---

## Pattern 3: Consensus-Based (Multi-Round Debate)

**Architecture:** Agents debate until convergence.

```
Round 1: Each judge evaluates independently
Round 2: Judges see each other's evaluations, revise
Round 3: Final convergence (or flag for human)
```

**Strengths:**
- High-confidence final scores
- Reduces individual judge bias
- Self-correcting

**Weaknesses:**
- Very expensive (3x the calls)
- Risk of conformity pressure
- Slow (sequential rounds)

**When to use:** Critical decisions where confidence matters more than speed.

---

## Pattern 4: Constitutional Evaluation

**Architecture:** Evaluate against a set of explicit principles.

```
Principles ──→ Evaluator ──→ Per-principle score ──→ Report
```

**Principles example for Claude Code artifacts:**
1. Instructions must be unambiguous
2. Every section must serve a purpose
3. Anti-patterns must be documented
4. Examples must demonstrate the happy path
5. Failure modes must be handled

**Strengths:**
- Deterministic criteria
- Easy to explain scores
- Reproducible

**Weaknesses:**
- Misses emergent quality issues
- Principles may not cover everything
- Rigid

**When to use:** Compliance checking, standardized quality gates.

---

## Pattern 5: Hierarchical Evaluation

**Architecture:** Fast cheap filter → detailed expensive evaluation.

```
Layer 0: Deterministic ──pass──→ Layer 1: Haiku ──pass──→ Layer 2: Sonnet Panel
             │                        │
             fail                     fail
             ↓                        ↓
         Quick Fix               Detailed Feedback
```

**Strengths:**
- Cost-efficient (most artifacts filtered early)
- Progressive detail
- Fast feedback for obvious issues

**Weaknesses:**
- Layer 0 can miss semantic issues
- Layer 1 may have different calibration than Layer 2

**When to use:** Batch evaluation, CI/CD pipelines, optimization loops. BTO uses this pattern.

---

## Aggregation Strategies

### 1. Weighted Average (BTO Default)
```
score = Σ(weight_i × judge_i_score) / Σ(weight_i)
```
- Simple, interpretable
- Weights reflect judge importance
- BTO weights: Expert 0.4, Critic 0.3, Auditor 0.3

### 2. Majority Voting
```
verdict = mode(judge_verdicts)
```
- Good for pass/fail decisions
- Requires odd number of judges
- Ignores score magnitude

### 3. Bayesian Aggregation
```
P(quality | scores) ∝ Π P(score_i | quality) × P(quality)
```
- Accounts for judge reliability
- Requires calibration data
- More complex to implement

### 4. Min-Score (Conservative)
```
score = min(all_judge_scores)
```
- Most conservative
- Good for safety-critical artifacts
- May be overly pessimistic

### 5. Trimmed Mean
```
score = mean(scores after removing highest and lowest)
```
- Outlier-resistant
- Requires ≥5 judges
- Good for large panels

---

## Anti-Conformity Measures

Prevent judges from converging to meaningless agreement:

1. **Role Differentiation** — Each judge has unique focus and scoring calibration
2. **Critic Calibration** — Critic judge instructed to score ~5-6 average (strict)
3. **Independent Evaluation** — No judge sees other judges' scores
4. **Disagreement as Signal** — High disagreement flags important quality dimensions
5. **Diverse Prompts** — Each judge gets a differently-framed evaluation prompt
6. **Model Family Diversity** — vary the MODEL, not only the prompt. Measures 1-5 all vary the
   *prompt* while every seat runs the same underlying model, so they cannot reach the failure modes a
   model shares with itself: the same training priors, the same blind spots, the same confident wrong
   answer arrived at three ways. Run at least the Critic seat on a model from a different family than
   the author's, record the outcome in the report's `Cross-family:` line, and say so loudly when no
   second family is reachable. **Advisory, not a gate** — this recommendation changes no score and
   blocks no verdict. (The separate *model-identity* rule — the same model must not both generate and
   judge — is a BLOCK and is unaffected; see `rules/bto-quality-gates.md`.)

## Cost Optimization

| Approach | Judges | Model | Est. Cost | Use When |
|----------|--------|-------|-----------|----------|
| Layer 0 only | 0 | none | Free | CI/CD pre-check |
| Layer 1 | 1 | haiku | ~$0.001 | Quick iteration |
| Layer 2 | 3 | sonnet | ~$0.01 | Thorough evaluation |
| Full + Meta | 3+1 | sonnet+opus | ~$0.05 | Critical artifacts |
| Consensus | 3×3 | sonnet | ~$0.03 | High-stakes decisions |
