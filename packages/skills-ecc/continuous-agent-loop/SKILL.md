---
name: "continuous-agent-loop"
description: >
  Orchestration entry point for continuous autonomous agent loops — selects a loop
  shape (sequential / parallel / PR-gated) and composes the hub's real loop, quality-gate,
  eval, memory, and recovery skills. For the deep, single-loop patterns see autonomous-loops.
trust_tier: 0
trust_tier_label: "Community (imported from ECC)"
source: "https://github.com/affaan-m/ECC/tree/main/skills/continuous-agent-loop"
---
# Continuous Agent Loop

A lightweight **selector + composer** for running an agent in a continuous loop with
quality gates, evals, memory, and recovery. It does not reimplement those mechanics —
it points each concern at the skill in this hub that already does it. For the in-depth
patterns of a single loop (escalation ladders, budget control, convergence math), use
[[autonomous-loops]] (the substantive companion skill); this skill is the orchestration
front door, not a replacement for it.

## When to Use

- You want an agent to iterate toward a goal without a human in the loop each turn.
- You need to pick between a sequential loop, a parallel fan-out, or a PR/CI-gated loop.
- You want the loop wired to real quality gates and a convergence/stop condition.

## Loop Selection Flow

```text
Start
  |
  +-- Need strict CI/PR control before merge? --- yes --> PR-gated loop (qcsd-cicd-swarm gates)
  |
  +-- Need to decompose a goal into a plan first? -- yes --> plan-then-loop (goap-research / feature-adr)
  |
  +-- Need exploratory parallel generation? -------- yes --> parallel fan-out (workflow / N agents)
  |
  +-- default ------------------------------------------- > sequential red-green-refactor
```

## Composition — map each concern to a real hub skill

| Concern | Use this hub skill |
|---------|--------------------|
| Goal decomposition / planning | [[goap-research-ed25519]] · [[feature-adr]] |
| The iterate loop (red→green→refactor, coverage, flaky) | [[qe-iterative-loop]] |
| Quality gates (CI/dev/refinement) | [[qcsd-cicd-swarm]] · [[qcsd-development-swarm]] |
| Evaluation / scoring of each iteration | [[bto]] · [[qe-quality-assessment]] |
| Honest critique before accepting an iteration | [[brutal-honesty-review]] |
| Memory / session persistence across turns | [[context-window-management]] · [[agentdb-memory]] |
| Security/config audit on the loop's outputs | [[agentshield-scan]] |

## Failure Modes

- Loop churn without measurable progress (each round must move a metric).
- Repeated retries against the same root cause (diagnose, don't retry-until-green).
- Merge-queue stalls under the PR-gated shape.
- Cost drift from unbounded model/effort escalation.

## Recovery

- Freeze the loop and stop spawning new iterations.
- Run a quality assessment ([[qe-quality-assessment]]) + [[brutal-honesty-review]] to find the stuck point.
- Reduce scope to the smallest failing unit and re-run [[qe-iterative-loop]] on just that.
- Replay with explicit, written acceptance criteria so the stop condition is unambiguous.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Looping with no stop condition | Define a measurable target + iteration cap before starting |
| Weakening tests/assertions to force green | Fix the code, never the test (see [[qe-iterative-loop]]) |
| Re-implementing gates/evals inline | Compose the hub skills above instead |
| Claiming success without evidence | Gate acceptance on [[bto]]/[[qe-quality-assessment]] output |
