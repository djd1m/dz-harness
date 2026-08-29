# Prompt Optimization Methods

## Overview

Survey of automated prompt optimization approaches. BTO uses an EvoPrompt-inspired evolutionary approach adapted for Claude Code artifacts.

---

## Method 1: APE (Automatic Prompt Engineer)

**Paper:** Zhou et al., 2022 — "Large Language Models Are Human-Level Prompt Engineers"

**Approach:**
1. Generate candidate prompts from task description + examples
2. Score each candidate on a held-out evaluation set
3. Select the best-performing prompt

**Strengths:** Simple, effective for single-prompt optimization
**Weaknesses:** Requires evaluation dataset, single-round (no iteration)
**BTO Relevance:** Inspiration for variant generation step

---

## Method 2: OPRO (Optimization by Prompting)

**Paper:** Yang et al., 2023 — "Large Language Models as Optimizers"

**Approach:**
1. Maintain a trajectory of (prompt, score) pairs
2. Ask LLM to generate better prompt given the trajectory
3. Evaluate and add to trajectory
4. Repeat

**Key Insight:** LLMs can optimize when shown optimization trajectory.

**Strengths:** Leverages LLM understanding of what makes prompts good
**Weaknesses:** Can get stuck in local optima, expensive
**BTO Relevance:** Trajectory concept used in crossover step

---

## Method 3: EvoPrompt (Evolutionary)

**Paper:** Guo et al., 2023 — "Connecting Large Language Models with Evolutionary Algorithms"

**Approach:**
1. Initialize population of N prompts
2. Apply genetic operators: mutation + crossover
3. Evaluate fitness (task performance)
4. Select top-K, repeat

**Genetic Operators:**
- **Mutation:** Rephrase, add/remove constraints, change structure
- **Crossover:** Combine best parts of two prompts

**Strengths:** Explores diverse solutions, avoids local optima
**Weaknesses:** Expensive (many evaluations), slow convergence
**BTO Relevance:** Primary inspiration for OPTIMIZE module

### BTO Adaptation of EvoPrompt

```
EvoPrompt (Original)           BTO OPTIMIZE (Adapted)
─────────────────              ─────────────────────
Random init population    →    5 targeted mutations (strategy-driven)
Generic mutation          →    Named strategies (Rephrase/Restructure/etc.)
Random crossover          →    Strength-based crossover (section-level)
Task accuracy metric      →    Multi-dimensional judge panel scores
Many generations          →    3 rounds (cost-bounded)
```

---

## Method 4: TextGrad (Textual Gradients)

**Paper:** Yuksekgonul et al., 2024 — "TextGrad: Automatic Differentiation via Text"

**Approach:**
1. Evaluate prompt output quality
2. Generate "textual gradient" — natural language feedback on what to improve
3. Apply gradient as edit instructions
4. Repeat

**Strengths:** Targeted improvements, interpretable changes
**Weaknesses:** Requires clear evaluation criteria, can overfit
**BTO Relevance:** Judge feedback as textual gradients for mutation targeting

---

## Method 5: DSPy (Programmatic)

**Framework:** Khattab et al., 2023 — "DSPy: Compiling Declarative Language Model Calls"

**Approach:**
1. Define modules with typed signatures
2. Compile with optimizer (BootstrapFewShot, MIPRO, etc.)
3. Optimizer tunes prompts + few-shot examples
4. Evaluate on metric

**Strengths:** Systematic, reproducible, handles multi-step pipelines
**Weaknesses:** Requires code framework, Python-specific
**BTO Relevance:** Modular skill design parallels DSPy module concept

---

## Comparison Matrix

| Method | Iterations | Cost | Diversity | Interpretability | Best For |
|--------|-----------|------|-----------|-----------------|----------|
| APE | 1 | Low | Medium | High | Simple prompts |
| OPRO | 5-20 | High | Low | High | Single metric |
| EvoPrompt | 5-50 | Very High | High | Medium | Complex prompts |
| TextGrad | 3-10 | Medium | Low | Very High | Targeted fixes |
| DSPy | Auto | Variable | Medium | Low | Pipelines |
| **BTO** | **3** | **Medium** | **High** | **High** | **Claude Code artifacts** |

---

## BTO Design Decisions

### Why Evolutionary (not gradient)?
- Claude Code artifacts are structured documents, not single prompts
- Mutations at section level are more meaningful than token-level edits
- Diversity prevents converging to one style

### Why 3 rounds (not more)?
- Diminishing returns after round 3
- Cost budget: ~15 evaluations is practical
- Layer 2 on final round ensures quality

### Why strategy-driven mutations (not random)?
- Named strategies map to specific weaknesses
- More interpretable changelog
- Faster convergence than random exploration

### Why section-level crossover?
- Skills have clear section boundaries
- Strengths are often section-specific
- Easier to preserve coherence than token-level mixing
