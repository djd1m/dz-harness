# Step 6: Implementation Plan

> Decompose the feature into ordered, estimable tasks with dependencies.

## When

Always runs, and ALWAYS writes `features/<slug>/06_implementation_plan.md` — every tier. Depth adapts:
- **S:** minimal plan FILE (3-5 tasks + an `EXPECTED_CODE_TARGETS:` block). An inline-only checklist is
  no longer permitted: the K2 gate below is mandatory at every tier and it reads the file, so a plan
  that exists only in the conversation makes the gate answer NOT-ESTABLISHED and the run stops. The
  file must clear the gate's own floor: >200 characters and a non-empty targets block.
- **M/L/XL:** Full structured plan document

## Model

sonnet (analytical decomposition) + code-goal-planner SPARC-GOAP methodology

## Input

- `{REQUIREMENTS}` from Step 1
- `{ADR_DECISIONS}` from Step 3 (M+)
- `{IDEATION_VERDICT}` and `{QUALITY_RISKS}` from Step 3.5 (M+)
- `{DOMAIN_MODEL}` from Step 4 (L/XL)
- `{ARCHITECTURE}` from Step 5 (M+)

## Protocol

> Load: `references/agentic-qe/code-goal-planner.md` for SPARC-GOAP methodology.

### 0. Apply SPARC-GOAP Goal State Analysis

Before decomposing tasks, define the goal state using the code-goal-planner SPARC methodology:

```yaml
goal: implement_{feature_slug}
current_state:
  features_complete: [existing features in codebase]
  test_coverage: {current %}
  relevant_files: [files that will be affected]

goal_state:
  features_complete: [...current, {new feature}]
  test_coverage: {target %}
  acceptance_criteria: [from {REQUIREMENTS}]
  adr_decisions_implemented: [from {ADR_DECISIONS}]
  quality_risks_mitigated: [from {QUALITY_RISKS}]

sparc_phases:
  specification: {REQUIREMENTS} + {ADR_DECISIONS}
  pseudocode: Algorithm/logic design from ADRs
  architecture: {ARCHITECTURE} + {DOMAIN_MODEL}
  refinement: TDD cycles per task group
  completion: Integration + deployment + validation
```

This analysis provides the planning context for task decomposition below.

### 1. Decompose into Tasks

Break the feature into atomic tasks. Each task should be:
- **Independent** — can be reviewed/tested in isolation
- **Completable** — produces working code (not half-done)
- **Testable** — has clear done criteria

Task format (SPARC-enhanced):
```
TASK-{N}: {Title}
  Description: {What to do}
  SPARC Phase: specification | pseudocode | architecture | refinement | completion
  Files: {Files to create/modify}
  Depends on: TASK-{M} (or none)
  Test: {How to verify it works}
  Success Criteria: {Measurable outcome}
  Risk Mitigation: {From QUALITY_RISKS if applicable}
```

### 2. Order by Dependencies

Build a dependency graph:

```
TASK-1: Create data model
TASK-2: Create repository (depends: TASK-1)
TASK-3: Create service (depends: TASK-2)
TASK-4: Create controller (depends: TASK-3)
TASK-5: Create tests (depends: TASK-2, TASK-3, TASK-4)
TASK-6: Create migration (depends: TASK-1)
```

Rules:
- Tasks with no dependencies go first
- Parallel-safe tasks are marked for concurrent execution
- Tests depend on the code they test (but can be written first — TDD)
- Map each task group to a SPARC phase (spec → pseudo → arch → refine → complete)

### 3. Identify Parallel Groups

Group tasks that can be worked on simultaneously:

```
Group 1: TASK-1, TASK-6  (no dependencies, can parallel)  [SPARC: architecture]
Group 2: TASK-2, TASK-3  (depend on Group 1)               [SPARC: refinement]
Group 3: TASK-4          (depends on Group 2)               [SPARC: refinement]
Group 4: TASK-5          (depends on all)                   [SPARC: completion]
```

For L/XL: assign parallel groups to different agents.

### 4. Define Checkpoints

Insert checkpoints between groups:
- After data model + migrations → verify schema
- After services → verify business logic
- After controllers → verify API contract
- After tests → verify coverage

### 5. Risk Assessment (enhanced with QCSD findings)

For each group, identify:
- What could block this task?
- What's the fallback if approach doesn't work?
- Does this task have external dependencies (APIs, packages)?
- **NEW**: Which risks from `{QUALITY_RISKS}` (Step 3.5) affect this task?
- **NEW**: What mitigation from the ideation report applies here?

### 6. Requirements Gap Check

Before finalizing the plan, validate completeness:

1. Cross-reference every `{REQUIREMENT}` (FR-N) → at least one TASK covers it
2. Cross-reference every `{ADR_DECISION}` → at least one TASK implements it
3. Cross-reference every critical risk from `{QUALITY_RISKS}` → mitigation in some TASK
4. Name every acid token `A<n>` from `00_complexity_assessment.md` VERBATIM in the plan (C4), each
   bound to the TASK that owns it and the TEST that proves the refusal — the gate reads them with a
   word-boundary regex, so a paraphrase, a range (`A1-A7`) or a renamed token does not count
5. Carry an `Inputs read:` line naming at least `03_adr` and `05_architecture` (C5). Put it at the
   TOP of the plan or immediately BEFORE the trailing `EXPECTED_CODE_TARGETS:` block — never after
   it. The plan must END with that targets block, so "end with Inputs read" would contradict the
   layout the coder reads (cross-family QE, gpt-5.6-sol)
6. If gaps found → add missing TASKs and re-order the DAG
7. **Iterate until no gaps remain** (max 3 iterations, then flag for user)

This gap-check loop ensures the implementation plan is complete before coding begins.

## Write discipline (the 180-second rule)

An executor that returns from a tool call and then thinks in silence past **180 seconds** is killed by the
runtime. Thinking time grows with the history already accumulated, so on a large repo "read everything,
then write the document" is not a risk — it is a deterministic death, and nothing survives it, because
nothing was ever on disk.

MEASURED on this harness: the writing steps died **18 times out of 18** in the reading phase without ever
writing a file. The control — same slice, same model, one added instruction to write a skeleton early —
landed the skeleton 8 minutes in, on the first attempt, after six consecutive deaths.

So, in this step:

1. **Skeleton first — inside your first ~12 tool calls.** Write `features/<slug>/06_implementation_plan.md` containing only the headings
   this step requires (Goal state · Tasks · Dependency order · Parallel groups · Checkpoints · Risk
   assessment · Amendments · `EXPECTED_CODE_TARGETS:`), one line of intent under each. The K2 gate
   reads this file — a plan that lives only in the conversation cannot pass it.
2. **Then fill it one section per edit.** No single edit longer than ~120 lines. Every edit leaves the
   file readable; none of them is allowed to wait for the section after it.
3. **Never go more than 2 minutes without a tool call.** A thought that is getting long is the signal to
   stop and write what you have — an edit is a checkpoint, not an interruption.
4. **When you are unsure whether to read more or to write, WRITE.** A thin section refined later survives;
   a perfect section you never reached does not.

The skeleton is not a draft to apologise for. It is the artifact, opened early.

## Output

### S-tier (minimal file — NOT inline-only)
Write `features/<slug>/06_implementation_plan.md` with the checklist plus the machine-read block, and
show the same checklist inline at the checkpoint:
```
Implementation plan:
- [ ] {task 1}
- [ ] {task 2}
- [ ] {task 3}

EXPECTED_CODE_TARGETS:
- {repo-relative path Step 7 will create or modify}
```

### M/L/XL
Create `features/<slug>/06_implementation_plan.md` with:
- Task list with dependencies
- Parallel groups
- Checkpoint schedule
- Risk assessment (L/XL)
- `## Amendments` — every correction folded into this plan (a Step-3.5 CONDITIONAL condition, a
  challenge-panel confirmed finding, a user checkpoint steer) as a fixed-shape row:
  `AM-N (source): <change>. Confirmation: <property> → test `test_name` (fails if reverted).`
  The row is MACHINE-READ by the K2 C6 gate: the `→ test \`name\`` marker (or `superseded by AM-N`)
  must sit inside that amendment's OWN block — anywhere between its `AM-N` line and the line where
  the NEXT `AM-N` begins. Multi-line amendments are fine; what is NOT fine is putting a marker after
  the following amendment has already started, because it then belongs to that one. A bare range
  like `AM-1..AM-4` never opens a row.
  TWO machines read this row with ONE grammar and different depths: the K2 C6 gate asks whether the
  row is well-formed; `dz amendment-check` asks whether the named test RESOLVES to a real title in a
  real file. So the marker carries ALL THREE parts — an arrow (`→` or `->`), the test id in
  backticks, and the file as `` in `path` ``:
  `AM-N (source): <change>. Confirmation: <property> → test \`test_name\` in \`path/to/file\` (fails if reverted).`
  A marker WITHOUT the file used to pass the plan gate and then fail Step 8 with `no-file-named` —
  that is the exact defect this shape removes. The alternative complete form is a retraction:
  `superseded by AM-N`, which both machines accept.
  A safeguard amendment's named test must prove it TRIGGERS on a real input, not merely that its code
  path exists. Step 8 verifies every named test exists and is non-vacuous (`dz discrimination-check`).

Set `{IMPL_PLAN}` variable.

## K2 plan-completeness gate (MANDATORY — Step 7 does not start until it exits 0)

After the plan is written, run the gate. It is a script, not a judgement call:

```bash
node .claude/skills/feature-adr/scripts/check-plan-completeness.mjs features/<slug>
```

The path above is relative to the workspace the skill is INSTALLED in. Working inside a target repo
that has no feature-adr install of its own? Pass the absolute path to the script instead — the
ultracode workflow does this for you (it tries `args.gateScript`, then the workspace copy, then the
target-repo copy, and refuses with `tooling-missing` if none exists). The gate is language-neutral:
C2 recognises JS/TS, pytest, Go, Rust, JVM and .NET test paths, extensible per project with
`testPathRules` in `architecture/project-skills.json`.

| Exit | Verdict | What you do |
|------|---------|-------------|
| `0` | PASS | proceed to Step 7 |
| `1` | FAIL | **return to Step 6** — fix the plan for every `FAIL C*` line, rerun the gate |
| `3` | NOT-ESTABLISHED | **INCONCLUSIVE** — the gate could not read its inputs (no plan, plan under the size floor, ADR claims it cannot see). Fix the inputs and rerun. Never proceed. |

Never proceed on a non-zero exit, and never treat empty output as a pass — the last line
(`K2 plan-completeness: PASS|FAIL|NOT-ESTABLISHED`) is the verdict, and its absence is not one.
What it checks: C1 every ADR has a plan task citing it · C2 every ADR Confirmation test path is named
in the plan · C3 the `EXPECTED_CODE_TARGETS:` block parses line by line · C4 the feature's declared
acid corpus is named · C5 (WARN) the `Inputs read:` line. An S-tier run with no `03_adr/` skips C1/C2
with a note (it cannot be failed for ADRs it never had) — unless the plan itself cites `ADR-<n>`,
which is NOT-ESTABLISHED. C1 is a grep: it catches "forgot entirely", not "mentioned but not tasked".

Pass the run's tier so the check cannot be dodged: `--tier=S|M|L|XL`. An M/L/XL feature with no
`03_adr/` FAILS C1/C2 (an M+ feature owes ADRs); only `--tier=S` — or no tier at all, and then the
skip note says so — takes the skip. A declared-but-malformed acid table (lowercase `| a1 |`, a header
with no parsable rows) FAILS as `C4-malformed`; it is not a skip.

**If the gate fails in the ultracode workflow:** the run returns `phase: 'plan-gate-failed'` and the
plan stage is CHECKPOINTED, so a bare re-invoke resumes the same failing plan. Repair it from outside:
edit `features/<slug>/06_implementation_plan.md` to fix each `FAIL` line and re-invoke (the checkpoint
is keyed on run INPUTS, not on the file, so your edit survives), or re-invoke with `args.resume:
'never'` (or delete `features/<slug>/.fa-state/`) to force a fresh plan.

The checkpoint banner's Gates line carries the verdict: `K2 plan-completeness ✓ | ✗ | inconclusive`.

## Checkpoint Format

```
═══════════════════════════════════════════════════════
⏸️ STEP 6/8: Implementation Plan Complete
<promise>FEATURE_ADR_PLANNED</promise>
Tier: {COMPLEXITY_TIER}

{N} tasks in {M} parallel groups
Estimated {K} files to create/modify
🚦 Gates: K2 plan-completeness ✓ (exit 0)   ← ✗/inconclusive ⇒ do NOT start Step 7

• "ок" — start coding
• "разбей [TASK-N]" — split task further
• "объедини [TASK-N, TASK-M]" — merge tasks
═══════════════════════════════════════════════════════
```

## Challenge panel (adversarial plan-gate — before coding)

Before leaving the plan checkpoint for code (especially L/XL), offer the **`challenge-panel`** skill — a
FRESH adversary (never the plan author) tries to BREAK the plan across the fixed C1-C8 owner questions,
every P0/P1 is cross-validated, and the verdict is ADVISORY (never an auto-block):

```bash
dz challenge --plan features/<slug>/06_implementation_plan.md --author <planner-model>
```

Dispatch the panel on the CROSS-FAMILY model (`--author` prints which): plan by Claude → Codex adversary
(honest `codex exec`, never a stub); plan by Codex → fresh Claude. Drop any P0/P1 the cross-validator does
not confirm. A finding the owner accepts can be recorded in `architecture/degradations.md` so C1 stops
re-flagging it. In the ultracode workflow this врезка runs automatically and returns `challengeVerdict`.

## Quality Gates

- [ ] Every task has clear done criteria
- [ ] Dependencies form a valid DAG (no cycles)
- [ ] Parallel groups correctly identified
- [ ] Each task touches identifiable files
- [ ] Total file count matches complexity tier expectation
- [ ] `check-plan-completeness.mjs features/<slug>` exited 0 (its output quoted at the checkpoint)
