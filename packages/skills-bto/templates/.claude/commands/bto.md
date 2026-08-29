# /bto — Full BTO Pipeline (Build · Test · Optimize)

## Usage
```
/bto [path to existing skill OR description of new skill]
```

## Parameters
- $ARGUMENTS — Path to an existing skill/command directory or file, OR a natural language description of a new skill to create

## Protocol

### Step 1: Setup — Load Skill

Read `.claude/skills/bto/SKILL.md`

### Step 2: Route by Input Type

Inspect $ARGUMENTS to determine mode:

**If $ARGUMENTS is a path that exists on disk:**
- Mode: BENCHMARK → TEST → OPTIMIZE
- Skip BUILD
- Proceed to Step 4 (BENCHMARK)

**If $ARGUMENTS is a natural language description (not a path):**
- Mode: BUILD → BENCHMARK → TEST → OPTIMIZE
- Proceed to Step 3 (BUILD)

**If $ARGUMENTS is empty:**
- Ask the user: "Provide a path to an existing skill, or describe a new skill to build."
- Stop and wait.

---

### Step 3: BUILD (only if description provided)

Read `.claude/skills/bto/modules/build.md`

Execute the BUILD module:
1. Auto-detect artifact type from description
2. QUICK mode by default — parse requirements directly from description
3. If user said "deep" anywhere in $ARGUMENTS — activate DEEP mode (load `explore` skill first)
4. Generate complete artifact following build templates
5. Run self-review (Layer 0 structural check)
6. Create all files in the target directory — each file as a skeleton `Write` first
   (frontmatter fence + title + section headings), then incremental `Edit` appends per
   section

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

7. Record `BUILD_OUTPUT_PATH` for use in next steps

**Checkpoint BUILD:**
```
═══════════════════════════════════════════════════════
CHECKPOINT 1: BUILD Complete
Artifact generated and self-reviewed.
Files created: [list generated files]
Path: [BUILD_OUTPUT_PATH]
• "ок" — run TEST on the new artifact
• "переделай [aspect]" — rebuild with changes
• "углуби [section]" — expand a section
═══════════════════════════════════════════════════════
```
Wait for user confirmation before proceeding.

---

### Step 4: BENCHMARK

Read `.claude/skills/bto/modules/benchmark.md`
Read `.claude/skills/bto/references/golden-samples.md`

**Resolve artifact path:**
- If BUILD was run → use `BUILD_OUTPUT_PATH`
- If path was provided in $ARGUMENTS → use that path

Execute BENCHMARK protocol:
1. **B0 — Golden Sample Comparison:** Diff artifact structure against golden samples
2. **B1 — Deterministic Test Suite:** Run rule-based checks (cross-references, terminology, specificity)
3. **B2 — Consistency Probe:** Spawn 3 parallel haiku agents to interpret the artifact; measure agreement
4. **B3 — Performance Metrics:** Compute token efficiency, section balance, reference/example coverage

Compute: `BENCHMARK_SCORE = B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20`

**Gate decision:**
- If `BENCHMARK_SCORE < 0.50` → BLOCK. Report per-layer failures. Do NOT proceed to TEST. Stop here.
- If `BENCHMARK_SCORE 0.50-0.70` → WARN. Proceed to TEST with advisory context for judges.
- If `BENCHMARK_SCORE > 0.70` → PASS. Proceed to TEST.

Record `BENCHMARK_SCORE` for downstream use (TEST judges receive it as quantitative context).

**Checkpoint BENCHMARK:**
```
═══════════════════════════════════════════════════════
CHECKPOINT 2: BENCHMARK Complete
Artifact: [path]
B0 Golden Sample:    X.XX
B1 Test Suite:       X.XX
B2 Consistency:      X.XX
B3 Performance:      X.XX
BENCHMARK_SCORE:     X.XX — [PASS / WARN / BLOCK]

• "ок" — run TEST
• "покажи детали [layer]" — expand layer results
• "исправь" — fix issues and re-benchmark
═══════════════════════════════════════════════════════
```
Wait for user confirmation before proceeding.

---

### Step 5: TEST

Read `.claude/skills/bto/modules/test.md`
Read `.claude/skills/bto/references/judge-rubrics.md`

**Resolve artifact path:**
- If BUILD was run → use `BUILD_OUTPUT_PATH`
- If path was provided in $ARGUMENTS → use that path

**BENCHMARK_SCORE is available for judge context.** If BENCHMARK produced a WARN, include the benchmark details in the judge prompt so they can factor quantitative weaknesses into their evaluation.

Execute TEST module in layers:

**Layer 0 — Deterministic pre-checks (always run first):**
- Run all structural checks for detected artifact type
- Display Layer 0 output with per-check PASS/FAIL
- If score < 80% → stop, report failures, do not proceed to LLM layers

**Layer 1 — Single LLM judge (haiku):**
- Run if Layer 0 passes
- Quick spot-check on all 5 dimensions
- Display scores and top 3 improvement suggestions

**Layer 2 — Full judge panel (user-triggered or if Layer 1 score < 7.0):**
- Ask: "Run full 3-judge panel for comprehensive evaluation? (yes/no)"
- If yes → spawn 3 parallel agents using Agent tool:
  - Agent 1: "BTO Judge — Domain Expert" (model: sonnet)
  - Agent 2: "BTO Judge — Critic" (model: sonnet)
  - Agent 3: "BTO Judge — Completeness Auditor" (model: sonnet)
- Aggregate scores with weights: Expert 0.40, Critic 0.30, Auditor 0.30
- Flag any dimension where max - min > 3 (trigger meta-judge if needed)
- Display full evaluation report

Record `TEST_SCORE` (overall weighted average) for use in OPTIMIZE step.

**Checkpoint TEST:**
```
═══════════════════════════════════════════════════════
CHECKPOINT 3: TEST Complete
Artifact: [path]
Layer 0: X/Y checks passed
Layer 1: X.X/10 — [PASS / NEEDS WORK / FAIL]
Layer 2: X.X/10 (weighted) — [if run]

Overall: X.X/10
• "ок" — run OPTIMIZE
• "пропусти" — skip optimize (artifact is good)
• "покажи детали [judge]" — expand judge feedback
═══════════════════════════════════════════════════════
```
Wait for user confirmation before proceeding.

---

### Step 6: OPTIMIZE

Read `.claude/skills/bto/modules/optimize.md`

Execute OPTIMIZE module:
1. If `TEST_SCORE` ≥ 8.0 → report "Artifact already high quality (X.X/10). Minor tweaks only." Show specific suggestions. Stop.
2. If `TEST_SCORE` < 8.0 → run full evolutionary optimization:
   - Round 1: Generate 5 variants (one per mutation strategy) → evaluate with Layer 1 (haiku) → select top 2
   - Round 2: Crossover top 2 → generate 3 variants → evaluate with Layer 1 → select top 2
   - Round 3: Crossover → generate 3 variants → evaluate with Layer 2 (3 parallel sonnet judges) → select winner
3. Apply the winning variant to the artifact file
4. Display before/after delta report

**Checkpoint OPTIMIZE:**
```
═══════════════════════════════════════════════════════
CHECKPOINT 4: OPTIMIZE Complete
Artifact: [path]
Rounds run: 3
Total evaluations: 15

BEFORE → AFTER:
  METHODOLOGY:  X.X → X.X  (+X.X)
  DEPTH:        X.X → X.X  (+X.X)
  CORRECTNESS:  X.X → X.X  (+X.X)
  USABILITY:    X.X → X.X  (+X.X)
  ROBUSTNESS:   X.X → X.X  (+X.X)

  OVERALL:      X.X → X.X  (+X.X)

Winning Strategy: [strategy name]
Recommendation: [Apply / Review / Original preferred]
• "ок" — done
• "ещё раунд" — run another optimization round
• "откат" — restore original artifact
═══════════════════════════════════════════════════════
```

---

## Modular Usage

Each module can be run independently:
- `/bto-build [description]` — BUILD only
- `/bto-benchmark [path]` — BENCHMARK only
- `/bto-test [path]` — TEST only
- `/bto-optimize [path]` — OPTIMIZE only

## Critical Rules

- Always run Layer 0 before any LLM evaluation — it is free and fast
- Always run BENCHMARK before TEST — it is cheap and provides quantitative context
- BENCHMARK gate: if BENCHMARK_SCORE < 0.50, do NOT proceed to TEST
- Never skip checkpoints — wait for user "ок" between modules
- Only run OPTIMIZE if TEST score < 8.0
- Agent tool is REQUIRED for Layer 2 parallel judge panel
- BUILD mode: QUICK by default, DEEP only if user explicitly requests it
- Record artifact path from BUILD and pass it through BENCHMARK → TEST → OPTIMIZE
