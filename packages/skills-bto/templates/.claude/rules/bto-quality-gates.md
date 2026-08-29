# BTO Quality Gate Rules

## What is BTO
BTO (Build-Test-Optimize) is a pipeline for generating, evaluating, and iteratively
improving skills, prompts, or any structured artifact via agent-driven evaluation loops.
These rules apply to ANY evaluation system, not just Keysarium.

## Layer Architecture and Model Budget

| Layer | Role | Model | Trigger |
|-------|------|-------|---------|
| Layer 0 | Structural pre-check (format, completeness) | haiku | Always |
| Benchmark | Golden sample + test suite + consistency + perf | haiku (B2 only) | After Layer 0 passes |
| Layer 1 | Shallow semantic check (relevance, coherence) | haiku | After Benchmark passes |
| Layer 2 | Deep evaluation (quality, domain fit) | sonnet (judge panel) | After Layer 1 passes |
| Layer 3 | Creative synthesis / optimization crossover | opus | On top-N candidates only |

Never promote an artifact to a higher layer if the lower layer gate fails.

## Cost Optimization Table

| Task | Model | Rationale |
|------|-------|-----------|
| Layer 0 structural checks | haiku | High-frequency, pattern-matching only |
| Layer 1 semantic baseline | haiku | Fast coherence scan, no deep reasoning needed |
| Judge 1 — Domain Expert | sonnet | Domain knowledge + nuanced scoring |
| Judge 2 — Critic | sonnet | Adversarial analysis, pattern detection |
| Judge 3 — Completeness Auditor | sonnet | Structured coverage check |
| Meta-judge (escalation) | sonnet | Disagreement resolution |
| Crossover / creative synthesis | opus | Novel combination of best candidates |
| Mutation workers (standard) | sonnet | Requires reasoning about improvement direction |
| Variant fast-eval (ranking pass) | haiku | Volume scoring before full panel |
| Benchmark B0-B1,B3 | -- (deterministic) | Zero LLM cost |
| Benchmark B2 consistency probe | haiku x 3 | Parallel consistency check |

Escalate to a higher-cost model only when the lower-cost model has failed or is insufficient.

## Layer 0 Mandatory Checks
Every generated skill or artifact MUST pass ALL of these before entering judge panel:

- [ ] Required sections present (structure check)
- [ ] No empty placeholders (`[TODO]`, `[TBD]`, `<INSERT>`)
- [ ] Length within bounds (not below minimum, not above maximum)
- [ ] Encoding valid (no broken unicode, no binary artifacts)
- [ ] Self-reference loop absent (artifact does not cite itself as source)

If any check fails → reject immediately, log reason, do NOT send to judges.
Layer 0 may auto-retry up to 3 times before escalating to human review.

## Benchmark Gate Rules

The BENCHMARK layer sits between Layer 0 and Layer 1 and provides objective, quantitative evaluation before subjective expert judging begins.

### Gate Thresholds

Rows are evaluated top to bottom; the first matching row wins. The INCONCLUSIVE row is evaluated
BEFORE any numeric threshold — a score computed over layers that did not all run must never be
compared against a threshold in the first place.

| # | Condition | Decision | Action |
|---|-----------|----------|--------|
| 0 | Layer B-1 preconditions returned ABORT | ABORT | No score is emitted at all. Fix the environment and re-run. |
| 1 | Any layer INCONCLUSIVE | INCONCLUSIVE | Not a pass and not a failure. Name what could not run and why. Do NOT proceed to TEST. |
| 2 | BENCHMARK_SCORE < 0.50 | BLOCK | Do NOT send to judge panel. Fix structural issues first. Log all failing layers. |
| 3 | BENCHMARK_SCORE 0.50 - 0.70 | WARN | Proceed to TEST with advisory. Include benchmark details in judge context. |
| 4 | BENCHMARK_SCORE > 0.70 | PASS | Proceed to TEST. Benchmark data available as optional judge context. |

**INCONCLUSIVE is sticky downstream.** If BENCHMARK is INCONCLUSIVE, TEST does not start; if a TEST
layer is INCONCLUSIVE, the evaluation report's overall verdict is INCONCLUSIVE. The pass-rate
denominator is `tests_executed`, never `tests_total`: a check that did not run has no verdict, and
a layer requested-but-unable-to-run is never renormalized away (renormalizing can only raise the
score, turning a gap in evidence into a better grade).

### Scoring Formula

```
BENCHMARK_SCORE = B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20
```

Where:
- **B0 (Golden Sample Comparison):** Structural diff against known-good artifacts (deterministic, zero LLM cost)
- **B1 (Deterministic Test Suite):** Cross-reference integrity, terminology consistency, instruction specificity (deterministic, zero LLM cost)
- **B2 (Consistency Probe):** 3 parallel haiku agents interpret the artifact; measure agreement (LLM cost: haiku x 3)
- **B3 (Performance Metrics):** Token efficiency, section balance, reference/example coverage (deterministic, zero LLM cost)

### BENCHMARK-to-TEST Integration

- If BENCHMARK produces a BLOCK, do NOT invoke Layer 1 or Layer 2 judges. Fix issues and re-benchmark.
- If BENCHMARK produces a WARN, include the per-layer benchmark scores and failure details in the judge prompt so judges can factor quantitative weaknesses into their subjective evaluation.
- If BENCHMARK produces a PASS, benchmark data is available but not mandatory for judges.
- BENCHMARK_SCORE is recorded alongside TEST scores for longitudinal tracking.

### BENCHMARK Anti-Patterns

| Anti-Pattern | Detection Signal | Required Fix |
|-------------|-----------------|--------------|
| Skipping BENCHMARK for "simple" artifacts | No benchmark record in evaluation output | BENCHMARK is cheap -- always run it |
| Golden samples outdated | B0 scores systematically low across all artifacts | Review and refresh golden samples quarterly |
| Consistency probe too lenient | B2 always scores > 0.95 | Vary probe prompts to stress-test edge interpretations |
| Ignoring WARN and proceeding blindly | No benchmark context in judge prompts after WARN | Always surface WARN details to TEST judges |

## Judge Panel Rules

- Panel MUST have an odd number of judges: 3 (standard) or 5 (high-stakes)
- Each judge operates in strict isolation: reads the same artifact, writes to a separate evaluation file
- Judges do NOT see each other's scores before submitting
- Final score = weighted average (weights defined per panel configuration)
- Standard weights: Domain Expert 0.4 / Critic 0.3 / Completeness Auditor 0.3
- Disagreement threshold: if max_score - min_score > 3 points → escalate to meta-judge
- Model **identity** and model **family** are two different axes, and this file treats them
  differently on purpose. Identity BLOCKS: the "Judge-generator collusion" row below is unchanged —
  the same model must not both generate and evaluate an artifact. Family is RECORDED and ADVISORY:
  every evaluation report always emits `Authored by:` / `Judged by:` / `Cross-family: YES|NO`, a
  same-family panel prints a loud degradation banner, and none of that changes a score or blocks a
  verdict. Read together: identity is a gate, family is honesty in the report.

## Optimization Delta Gate

- An optimization iteration is accepted ONLY if: `new_score - prev_score > 0.5`
- If delta <= 0.5 for 3 consecutive iterations → declare convergence and stop
- If score DECREASES by > 1.0 → rollback to previous best and log regression
- Improvement must be measurable on the same rubric used in the previous iteration

## Human Checkpoint Rules

- NEVER auto-approve any artifact for delivery without a human checkpoint
- Checkpoint is required after: Layer 2 evaluation, final optimization round, before packaging
- Checkpoint format follows the standard checkpoint-protocol.md
- Exception: Layer 0 rejections may be auto-retried up to 3 times before human escalation

## BTO-Specific Anti-Patterns

| Anti-Pattern | Detection Signal | Required Fix |
|-------------|-----------------|--------------|
| Score inflation | All judges score > 8.5 on first attempt | Add calibration prompt to critics |
| Overfitting to rubric | Artifact optimizes wording to match rubric literally | Blind evaluation: hide rubric from generator |
| Conformity collapse | Judges converge to identical scores after 1 round | Enforce isolation, re-randomize judge order |
| Runaway optimization | > 10 iterations without convergence | Abort, log, human review |
| Phantom improvement | Delta > 0.5 but no substantive content change | Diff-check content, not just score |
| Judge-generator collusion | Same model used for both generation and evaluation | BLOCK — generator and judge models must differ |
| Missing rejection log | Failed artifacts silently discarded | Every rejection MUST be logged with reason |
| Treating a non-executed check as green | Report shows N skipped/absent checks alongside a PASS gate | INCONCLUSIVE -- a check that did not run has no verdict |
| Single-shot long write | An agent produces a >200-line artifact in one Write or one reply | Skeleton first, then Edit appends -- see "Agent Authoring Rule" in the BTO SKILL.md |

## Auto-Detection
Self-check generated artifacts and evaluation results against the anti-patterns above.
If detected, flag with a WARNING label and halt the BTO loop pending human review.

## Reusability Note
These rules are artifact-type agnostic. Apply them to:
- Skill generation pipelines
- Prompt optimization loops
- Presentation scoring systems
- Any multi-judge evaluation workflow
