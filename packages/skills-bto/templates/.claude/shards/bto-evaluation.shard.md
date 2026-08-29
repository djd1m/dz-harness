# BTO Evaluation — Governance Shard

## Skills
Load: `.claude/skills/bto/SKILL.md` + relevant module

## Layer Architecture

| Layer | Model | Gate | Action on Fail |
|-------|-------|------|----------------|
| Layer 0 | — (deterministic) | ≥ 80% checks pass | STOP, auto-retry up to 3x |
| Benchmark | haiku × 3 (B2 only) | score ≥ 0.50 | BLOCK, fix structure |
| Layer 1 | haiku | avg ≥ 7.0 | NEEDS WORK (flag) |
| Layer 2 | sonnet × 3 judges | weighted avg ≥ 7.0 | FAIL |
| Meta | sonnet | disagreement > 3 | Arbitrate |

## Judge Isolation — INVARIANT
- Each judge reads the SAME artifact
- Each judge writes to a SEPARATE evaluation
- Judges do NOT see each other's scores before submitting
- Generator and judge models MUST differ

## Weights
- Domain Expert: 0.40
- Critic: 0.30
- Completeness Auditor: 0.30

## Optimization Delta Gate
- Accepted if: new_score - prev_score > 0.5
- 3 consecutive iterations ≤ 0.5 delta → convergence, stop
- Score decrease > 1.0 → rollback to previous best

## Model Routing
- Layer 0: deterministic (no LLM)
- Benchmark B0, B1, B3: deterministic (no LLM)
- Benchmark B2: haiku × 3 (consistency probe)
- Layer 1: haiku
- Layer 2 judges: sonnet
- Meta-judge: sonnet
- Crossover synthesis: opus
- Variant fast-eval: haiku

## Promises
- `<promise>BTO_LAYER0_PASSED</promise>` — after Layer 0
- `<promise>BTO_BENCHMARKED</promise>` — after benchmark
- `<promise>BTO_LAYER2_SCORED</promise>` — after Layer 2
- `<promise>BTO_OPTIMIZED</promise>` — after optimization converges

## Anti-Patterns
- Score inflation (all > 8.5 first attempt) → add calibration
- Conformity collapse (identical scores) → enforce isolation
- Runaway optimization (> 10 iterations) → abort
- Judge-generator collusion (same model) → BLOCK
