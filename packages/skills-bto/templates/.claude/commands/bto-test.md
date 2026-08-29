# /bto-test — Multi-Agent Evaluation of a Skill or Command

## Usage
```
/bto-test [path to skill directory or file]
```

## Parameters
- $ARGUMENTS — Path to a skill directory (`.claude/skills/<name>/`), a command file (`.claude/commands/<name>.md`), a rule file (`.claude/rules/<name>.md`), or any research artifact. Optionally include "full" to force Layer 2 panel regardless of Layer 1 score.

## Protocol

### Step 1: Load Skill and Module

Read `.claude/skills/bto/SKILL.md`
Read `.claude/skills/bto/modules/test.md`
Read `.claude/skills/bto/references/judge-rubrics.md`

### Step 2: Validate Input

If $ARGUMENTS is empty:
- Ask: "Provide a path to the skill directory or artifact file you want to evaluate."
- Stop and wait.

Resolve the artifact path from $ARGUMENTS:
- Strip any trailing slash
- If the path points to a directory → look for `SKILL.md` inside it as the primary file, but include all files in the directory for context
- If the path points to a file → use that file directly
- If the path does not exist → report "Path not found: [path]" and stop

### Step 3: Detect Artifact Type

Auto-detect from path pattern:

| Path Pattern | Detected Type |
|-------------|--------------|
| `.claude/skills/*/SKILL.md` or `.claude/skills/*/` | skill |
| `.claude/commands/*.md` | command |
| `.claude/rules/*.md` | rule |
| `.claude/agents/*.md` | agent |
| `researches/**/*.md` | research artifact |

If type cannot be determined from path → infer from file content structure.

### Step 4: Layer 0 — Deterministic Pre-checks

**Run Layer 0 first. Always. No exceptions. Zero cost.**

Execute all applicable checks from `test.md` for the detected artifact type:

- Universal checks (U1-U5): file exists, UTF-8, has headings, no excessive blanks, size in bounds
- Type-specific checks: skill (S1-S10), command (C1-C5), rule (R1-R4), agent (A1-A4)

Display Layer 0 output as a per-check PASS/FAIL table.

**Gate:** If pass rate < 80% → stop here. Do NOT proceed to Layer 1 or Layer 2.
Report all failures with specific line references where possible.

### Step 5: Layer 1 — Single LLM Judge (Quick)

Run if and only if Layer 0 gate passes.

**Model:** haiku

Execute the Layer 1 judge prompt from `test.md` against the artifact content.

Rate on 5 dimensions (1-10 each):
1. CLARITY
2. COMPLETENESS
3. ACTIONABILITY
4. QUALITY
5. ANTI-PATTERNS

Display scores, one-line justification per dimension, top 3 improvement suggestions, and VERDICT.

**Gate:**
- Average ≥ 7.0 → PASS
- Average 5.0-6.9 → NEEDS WORK (offer Layer 2)
- Average < 5.0 → FAIL (Layer 2 recommended)

Check $ARGUMENTS for "full":
- If "full" present → proceed directly to Layer 2 without asking

Otherwise, if Layer 1 score < 7.0 → automatically offer Layer 2.
If Layer 1 score ≥ 7.0 → ask: "Run full 3-judge panel for comprehensive evaluation? (yes/no)"

### Step 6: Layer 2 — Full Judge Panel (3 Parallel Agents)

Run if triggered by score threshold or user request.

**Spawn 3 agents in parallel using Agent tool.** Each judge writes its evaluation to a FILE
(`judge-N.md`) — skeleton first, then one `Edit` per criterion; the reply carries only the summary.

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.


- Agent 1: "BTO Judge — Domain Expert" (model: sonnet)
  - Focus: methodology, depth, technical correctness, domain fit
  - Uses Judge 1 prompt from `test.md`

- Agent 2: "BTO Judge — Critic" (model: sonnet)
  - Focus: gaps, weaknesses, anti-patterns, failure scenarios
  - Uses Judge 2 prompt from `test.md`

- Agent 3: "BTO Judge — Completeness Auditor" (model: sonnet)
  - Focus: structural coverage, cross-references, section completeness
  - Uses Judge 3 prompt from `test.md`

**Isolation:** Each agent evaluates independently. No cross-communication.

**Aggregate scores after all 3 return:**

Weights: Expert 0.40, Critic 0.30, Auditor 0.30

Per-dimension weighted score:
```
dim_score = expert[dim] * 0.4 + critic[dim] * 0.3 + auditor[dim] * 0.3
```

Overall score = mean of all dimension scores.

**Disagreement detection:** For any dimension where `max(scores) - min(scores) > 3` → flag for meta-judge.

**Meta-judge (if triggered):**
- Model: default (opus)
- Present all 3 evaluations for the flagged dimension
- Reconcile to a single score with explicit reasoning
- Flag for human review if still unresolvable

### Step 7: Record TEST_SCORE

Set `TEST_SCORE` = overall weighted average (Layer 2 if run, else Layer 1 average).

This value is consumed by `/bto-optimize` and by the full `/bto` pipeline.

---

## Checkpoint

```
═══════════════════════════════════════════════════════
CHECKPOINT: TEST Complete
Artifact: [path]
Type: [detected type]

Authored by:  [model / family, or "unknown — external artifact"]
Judged by:    Expert=[model] | Critic=[model] | Auditor=[model]
Cross-family: [YES (Critic=<other family>) | NO — see degradation notice]

Layer 0: X/Y checks passed (Z%) — PASS / FAIL
Layer 1: X.X/10 — PASS / NEEDS WORK / FAIL
Layer 2: X.X/10 (weighted) — [if run, else "not run"]

OVERALL SCORE: X.X/10

Per-Dimension (Layer 2 or Layer 1):
  METHODOLOGY:  X.X
  DEPTH:        X.X
  CORRECTNESS:  X.X
  USABILITY:    X.X
  ROBUSTNESS:   X.X

[Flagged dimensions with judge disagreement, if any]

Top Improvements:
1. [specific suggestion]
2. [specific suggestion]
3. [specific suggestion]

• "ок" — done
• "покажи детали [expert/critic/auditor]" — expand judge feedback
• "оптимизируй" — run /bto-optimize with this artifact
• "запусти полный" — re-run with Layer 2 if only Layer 1 was run
═══════════════════════════════════════════════════════
```

Wait for user confirmation.

---

## Modular Usage

This command is also invoked internally by:
- `/bto` — as Step 4 (TEST phase) of the full pipeline
- `/bto-optimize` — as baseline evaluation before optimization rounds

## Critical Rules

- Always run Layer 0 before any LLM evaluation — it is free and fast
- Never spawn Layer 2 agents if Layer 0 fails (< 80% pass rate)
- Agent tool is REQUIRED for Layer 2 — do not run judges sequentially
- Report `TEST_SCORE` explicitly so downstream commands can consume it
- Rubrics from `judge-rubrics.md` govern scoring anchor points for all judges
- Always emit the three provenance lines (`Authored by:` / `Judged by:` / `Cross-family:`), including
  on a clean PASS; when `Cross-family: NO`, append the verbatim `SAME-FAMILY PANEL` block from
  `test.md`. The family axis is advisory and blocks nothing; the model-identity collusion rule still BLOCKS
- A check or layer that could not run is reported INCONCLUSIVE — never as a pass and never omitted
- If "full" is in $ARGUMENTS, skip the confirmation prompt and run Layer 2 automatically
