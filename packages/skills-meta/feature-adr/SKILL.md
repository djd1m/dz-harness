---
name: feature-adr
description: >
  11-step feature development pipeline with Complexity Router (S/M/L/XL),
  ADR-driven architecture decisions, DDD modeling, QCSD quality swarm,
  SPARC-GOAP planning, brutal-honesty review, and multi-agent fleet QE.
  Integrates 15 agentic-qe skills (9 core + 6 extended) for comprehensive
  quality engineering. Supports 3 modes: Reference (no setup), Direct (--full-qe),
  and Direct Extended (--full-qe-extended).
  Triggers on "реализуй фичу", "feature implementation", "добавь функциональность",
  "implement feature", "/feature-adr".
trust_tier: 0
trust_tier_label: "Advisory"
trust_tier_path: "Run a BTO evaluation (see the skills-bto package) to promote to Tier 1"
agentic_qe_version: "7.5.1"
agentic_qe_source: "https://github.com/proffesor-for-testing/agentic-qe"
agentic_qe_skills_core: 9
agentic_qe_skills_extended: 6
agentic_qe_modes: ["reference", "direct", "direct-extended"]
---

# Feature ADR — Adaptive Feature Development Pipeline

> 11-шаговый pipeline для разработки фич любой сложности.
> Complexity Router автоматически определяет масштаб (S/M/L/XL) и пропускает ненужные шаги.
> Интегрирует 15 скиллов из [agentic-qe](https://github.com/proffesor-for-testing/agentic-qe)
> для shift-left quality engineering на каждом этапе.

## When To Activate

Trigger on:
- "реализуй фичу [описание]"
- "implement feature [description]"
- "добавь функциональность [описание]"
- "feature [описание]"
- `/feature-adr [описание или путь к issue]`
- `/feature-adr --full-qe [описание]` (полная интеграция с agentic-qe)
- `/feature-adr --full-qe-extended [описание]` (полная + доп. скиллы)

## Architecture

```
.claude/skills/feature-adr/
├── SKILL.md                           ← This file (orchestrator)
├── modules/
│   ├── 00-complexity-router.md        ← Step 0: S/M/L/XL classification
│   ├── 01-requirements.md             ← Step 1: Requirements gathering
│   ├── 02-research.md                 ← Step 2: Analogues & patterns research
│   ├── 03-adr.md                      ← Step 3: ADR + shift-left validation
│   ├── 03.5-ideation-swarm.md         ← Step 3.5: QCSD quality swarm (NEW)
│   ├── 04-ddd.md                      ← Step 4: Domain-Driven Design
│   ├── 05-architecture.md             ← Step 5: Technical architecture
│   ├── 06-implementation-plan.md      ← Step 6: SPARC-GOAP planning (enhanced)
│   ├── 07-code.md                     ← Step 7: Code generation
│   ├── 08-qe.md                       ← Step 8: QE + brutal-honesty review (enhanced)
│   ├── 09-fleet-qe.md                 ← Step 9: Fleet QE assessment (NEW)
│   └── 10-delivery-gate.md            ← Step 10: Delivery Gate (opt-in, post-implementation)
├── references/
│   ├── complexity-matrix.md           ← S/M/L/XL criteria & step activation
│   ├── adr-template.md                ← ADR document template
│   ├── c4-template.md                 ← C4 diagram templates
│   ├── qe-checklist.md                ← Quality engineering checklist
│   └── agentic-qe/                    ← Integrated agentic-qe skills (15 total)
│       ├── README.md                  ← Skill mapping, modes, install guide
│       ├── shift-left-testing.md      ← Step 3: ADR testability (Tier 3)
│       ├── qcsd-ideation-swarm.md     ← Step 3.5: Quality swarm (Tier 3)
│       ├── code-goal-planner.md       ← Step 6: SPARC-GOAP agent
│       ├── brutal-honesty-review.md   ← Step 8: Code review (Tier 2)
│       ├── qe-requirements-validation.md  ← Step 9: Traceability (Tier 3)
│       ├── risk-based-testing.md      ← Step 9: Risk scoring (Tier 3)
│       ├── enterprise-integration-testing.md ← Step 9: Integration (Tier 3, condensed)
│       ├── regression-testing.md      ← Step 9: Regression (Tier 3)
│       ├── qe-coverage-analysis.md    ← Step 9: Coverage (Tier 3)
│       ├── chaos-engineering-resilience.md ← Extended: Chaos (Tier 3)
│       ├── security-testing.md        ← Extended: OWASP (Tier 3)
│       ├── performance-testing.md     ← Extended: Load/stress (Tier 3)
│       ├── mutation-testing.md        ← Extended: Mutation (Tier 3)
│       ├── tdd-london-chicago.md      ← Extended: TDD schools (Tier 3)
│       └── qcsd-production-swarm.md   ← Extended: Prod health (Tier 3, condensed)
└── examples/
    └── sample-feature-output.md       ← Example output for M-tier feature
```

## Pipeline Overview

```
Step 0        Step 1          Step 2        Step 3          Step 3.5
ROUTER   →  REQUIREMENTS  →  RESEARCH  →   ADR         →  QCSD SWARM
 (all)        (all)          (L/XL)      + shift-left      (M+)
                                           (M+)             │
                                            │     Step 4    │
                                            └──→  DDD   ←──┘
                                                 (L/XL)
                                                   │
                                                Step 5
                                             ARCHITECTURE
                                                 (M+)
                                                   │
                                                Step 6
                                           SPARC-GOAP PLAN
                                                (all)
                                                   │
                                       K1 NAME-AVAILABILITY GATE
                                      (every new command/module/export)
                                                   │
                                        K2 PLAN-COMPLETENESS GATE
                                       (all — exit 0 or Step 7 waits)
                                                   │
                                                Step 7
                                                 CODE
                                                (all)
                                                   │
                                                Step 8
                                           QE + BRUTAL REVIEW
                                              + GAP LOOP
                                                (all)
                                                   │
                                                Step 9
                                             FLEET QE
                                              (L/XL)
```

## Complexity Tiers

| Tier | Scope | Steps | Example |
|------|-------|-------|---------|
| **S** | 1-3 files, single domain | 0→1→6→7→8 | Bug fix, config change, small util |
| **M** | 4-10 files, 1-2 domains | 0→1→3→3.5→5(light)→6→7→8 | New API endpoint, UI component |
| **L** | 11-30 files, 2-4 domains | 0→1→2→3→3.5→4→5→6→7→8→9 | New module, integration |
| **XL** | 30+ files, cross-cutting | Full DAG with parallelism + fleet QE | New subsystem, major refactor |

See `references/complexity-matrix.md` for detailed classification criteria.

## Step Activation Matrix

```
Step                         | S | M | L | XL | Model  | Agentic QE Skill       |
─────────────────────────────────────────────────────────────────────────────────
0  Complexity Router         | ✓ | ✓ | ✓ | ✓  | haiku  | —                      |
1  Requirements              | ✓ | ✓ | ✓ | ✓  | sonnet | —                      |
2  Research                  | - | - | ✓ | ✓  | sonnet | —                      |
3  ADR + Shift-Left          | - | ✓ Nygard/ITD | ✓ MADR+Confirmation | ✓ MADR+Confirmation | opus   | shift-left-testing     |
3.5 QCSD Ideation Swarm     | - | ✓ | ✓ | ✓  | sonnet | qcsd-ideation-swarm    |
4  DDD                       | - | - | ✓ | ✓  | opus   | —                      |
5  Architecture              | - | ✓ | ✓ | ✓  | opus   | —                      |
6  SPARC-GOAP Impl Plan     | ✓ | ✓ | ✓ | ✓  | sonnet | code-goal-planner      |
7  Code                      | ✓ | ✓ | ✓ | ✓  | opus   | —                      |
8  QE + Brutal Honesty       | ✓ | ✓ | ✓ | ✓  | sonnet | brutal-honesty-review  |
9  Fleet QE Assessment       | - | - | ✓ | ✓  | sonnet | qe-req-val + risk-based + integration + regression + coverage |
10 Delivery Gate (OPT-IN)    | o | o | o | o  | cross-family of coder | 4 planes: regressions ‖ security ‖ code-quality ‖ product-honesty (o = runs only when explicitly requested; absent ⇒ byte-identical) |
```

### K1 name-availability gate (Step-6/7 boundary, MANDATORY, every new name)

Before Step 7 writes a line, every NEW name the plan introduces is checked:

```bash
dz name-check --command <cmd> --module <basename> --export <a,b,c>
```

`exit 0` → proceed · `exit 1` → rename in the plan first · `exit 2` → NOT ESTABLISHED (the sweep
found nothing of that kind — fix the invocation, never read it as free).

**Why this is a gate and not advice.** Twice on 2026-08-23/24 a collision broke the build outright —
`dz retro` was already a command and its star re-export clash stopped the CLI from importing at all;
`decideProvenance` was already an export. Both were answerable before any code. The check costs one
command; the miss costs a rename across every artifact of the feature. An agent's intention to
remember is layer 4 on the cost-of-detection ladder, and this line exists because that layer failed
twice in one day.

The check reads workspace SOURCE, never `dist` — a stale build answers "free" confidently. Its honest
limit is printed on the passing path: a re-export under a different name stays the build's job.

### K2 plan-completeness gate (Step-6/7 boundary, MANDATORY, all tiers)

Step 7 does not start until the plan passes a SCRIPT — not a reviewer's impression:

```bash
node .claude/skills/feature-adr/scripts/check-plan-completeness.mjs features/<slug>
```

Pass the run's tier (`--tier=S|M|L|XL`): M/L/XL with no `03_adr/` FAILS rather than skipping C1/C2.
Every tier — S included — writes a real `06_implementation_plan.md`; an inline-only S-tier checklist
cannot be gated and is no longer permitted.

`exit 0` → proceed to Step 7 · `exit 1` → return to Step 6 and fix every `FAIL C*` line · `exit 3`
→ INCONCLUSIVE (inputs unreadable) — fix them and rerun. **Never proceed on a non-zero exit, and
never read empty output as a pass**: the verdict is the last line
(`K2 plan-completeness: PASS|FAIL|NOT-ESTABLISHED`), and its absence is not a verdict. The checkpoint
banner's Gates line carries it: `🚦 Gates: K2 plan-completeness ✓ | ✗ | inconclusive`. Details and the
per-check list: `modules/06-implementation-plan.md`. In the ultracode workflow the gate runs
automatically and a non-PASS returns `phase: 'plan-gate-failed'` without dispatching the coder.

## DAG Dependencies

Steps are NOT purely linear. The DAG defines what can run in parallel:

```
Group 1 (sequential): Step 0 → Step 1
Group 2 (parallel):   Step 2 ‖ Step 3  (after Step 1)
Group 3 (sequential): Step 3.5 (after Step 3, consumes shift-left output)
Group 4 (parallel):   Step 4 ‖ Step 5  (after Steps 2+3.5)
Group 5 (sequential): Step 6 (after Step 5, uses QCSD findings)
Group 6 (sequential): Step 7 (after Step 6)
Group 7 (sequential): Step 8 (after Step 7, brutal-honesty + gap loop)
Group 8 (sequential): Step 9 (after Step 8, L/XL only — fleet assessment)
```

For tiers S/M, the DAG collapses to a linear sequence (no parallelism needed).

## Agent Swarm Strategy

### Per-Step Parallelism

| Step | Agents | Tasks |
|------|--------|-------|
| Step 2 | 2 parallel (sonnet) | Codebase patterns ‖ External analogues |
| Step 3+4 | 2 parallel (opus) | ADR drafting ‖ DDD modeling |
| Step 3.5 | 3-9 parallel (sonnet) | Core: QC + Risk + Testability ‖ Conditional: A11y + Security + UX |
| Step 7 | N parallel (opus) | One agent per independent module/file |
| Step 8 | 3 parallel (sonnet) | Linus reviewer ‖ Security reviewer ‖ Ramsay reviewer |
| Step 9 | 4 parallel (sonnet) | Traceability ‖ Risk ‖ Integration ‖ Regression |

### Cross-Step Parallelism

For L/XL: Steps 2 and 3 run in parallel after Step 1 completes.
For L/XL: Steps 4 and 5 can overlap if Step 3.5 finishes before Step 2.

## Execution Protocol

### 1. Load Governance
```
Read: .claude/shards/feature-adr.shard.md
```

### 2. Run Step 0 (Complexity Router)
```
Read: modules/00-complexity-router.md
Read: references/complexity-matrix.md
→ Output: {COMPLEXITY_TIER}, {ACTIVE_STEPS}, {TIME_BUDGET}
→ Checkpoint 0
```

### 3. Execute Active Steps per DAG
For each active step:
```
Read: modules/<step>.md
Execute protocol
→ Create artifacts in features/<feature-slug>/
→ Checkpoint N
```

**Write discipline — applies to EVERY step that produces a document.** Open the step's artifact within
your first ~12 tool calls as a SKELETON (its section headings, one line of intent each), then fill it one
section per edit, no edit longer than ~120 lines. Never go more than 2 minutes without a tool call, and
when you are unsure whether to read more or to write, WRITE. Reason: an executor silent for 180 seconds is
killed by the runtime, and thinking time grows with accumulated history — so unbounded exploration before
the first write is a deterministic death on a large repo, not bad luck. Each module restates this under
its own `## Write discipline (the 180-second rule)` heading.

### 4. Final Verification
After Step 8 (or Step 9 for L/XL) completes, verify:
- All mandatory artifacts exist per tier
- QE checks passed
- Every generated ADR passes the Step-8 ADR fitness checklist
- Every ADR Confirmation load-bearing property has a named automated test/fitness check
- ADR decisions are traceable to code (L/XL)
- QCSD quality risks are mitigated (M+)
- Gap detection loop closed with zero remaining gaps

## Cross-Phase Variables

| Variable | Set In | Used In | Type |
|----------|--------|---------|------|
| `{COMPLEXITY_TIER}` | Step 0 | All steps | S/M/L/XL |
| `{ACTIVE_STEPS}` | Step 0 | Orchestrator | list[int] |
| `{TIME_BUDGET}` | Step 0 | All steps | dict |
| `{LEARNED_PATTERNS}` | Step 0 | Step 1 (brief); Steps 8-9 do their own namespace recalls | list[pattern] (dz recall = ALL modes; aqe adds semantic in Direct modes) |
| `{REQUIREMENTS}` | Step 1 | Steps 2-9 | structured |
| `{RESEARCH_FINDINGS}` | Step 2 | Steps 3-5 | structured |
| `{ADR_DECISIONS}` | Step 3 | Steps 3.5-7 | list[ADR] |
| `{IDEATION_VERDICT}` | Step 3.5 | Steps 6-9 | GO/CONDITIONAL/NO-GO |
| `{QUALITY_RISKS}` | Step 3.5 | Steps 6-9 | list[risk] |
| `{DOMAIN_MODEL}` | Step 4 | Steps 5-7 | structured |
| `{ARCHITECTURE}` | Step 5 | Steps 6-7 | structured |
| `{IMPL_PLAN}` | Step 6 | Step 7 | list[task] (SPARC-enhanced) |
| `{CODE_CHANGES}` | Step 7 | Steps 8-9 | list[file] |
| `{QE_RESULTS}` | Step 8 | Step 9 | structured |
| `{FLEET_QE_VERDICT}` | Step 9 | Final report | COMPLETE/NEEDS_REMEDIATION |

## Output Directory Structure

All artifacts are created in `features/<feature-slug>/`:

```
features/<feature-slug>/
├── 00_complexity_assessment.md        ← Always
├── 01_requirements.md                 ← Always
├── 02_research.md                     ← L/XL only
├── 03_adr/                            ← M+ only
│   ├── 001-<decision>.md
│   └── ...
├── 03.5_ideation_report.md            ← M+ only (QCSD swarm output)
├── 04_domain_model.md                 ← L/XL only
├── 05_architecture.md                 ← M+ only
├── 06_implementation_plan.md          ← Always (SPARC-GOAP enhanced)
├── 07_code_changes/                   ← Always (actual code in repo)
│   └── change_manifest.md             ← List of modified files
├── 08_qe_report.md                    ← Always (brutal-honesty review)
├── 09_fleet_qe_assessment.md          ← L/XL only (fleet assessment)
├── 10_delivery_review.md              ← Opt-in (Step 10 Delivery Gate verdict + findings)
├── diagrams/                          ← M+ only
│   ├── architecture-c4.mermaid
│   ├── sequence-*.mermaid
│   └── domain-model.mermaid
└── README.md                          ← Always (auto-generated summary)
```

## Promise Tags

| Step | Promise Tag |
|------|-------------|
| Step 0 | `<promise>FEATURE_ADR_ROUTED</promise>` |
| Step 1 | `<promise>FEATURE_ADR_REQUIREMENTS_GATHERED</promise>` |
| Steps 2-3 | `<promise>FEATURE_ADR_DESIGNED</promise>` |
| Step 3.5 | `<promise>FEATURE_ADR_QUALITY_ASSESSED</promise>` |
| Steps 4-5 | `<promise>FEATURE_ADR_ARCHITECTED</promise>` |
| Step 6 | `<promise>FEATURE_ADR_PLANNED</promise>` |
| Step 7 | `<promise>FEATURE_ADR_IMPLEMENTED</promise>` |
| Step 8 | `<promise>FEATURE_ADR_VERIFIED</promise>` |
| Step 9 | `<promise>FEATURE_ADR_FLEET_VERIFIED</promise>` |
| Step 10 (opt-in) | `<promise>FEATURE_ADR_DELIVERY_GATED</promise>` |

## External Skills (loaded as needed)

### Keysarium Skills (internal)

| Skill | Used In | Purpose |
|-------|---------|---------|
| explore | Step 1 | Requirements clarification |
| problem-solver-enhanced | Step 3 | Trade-off analysis for ADR decisions |
| frontend-design | Step 7 | UI implementation (if feature has UI) |

### Agentic QE Skills (from [proffesor-for-testing/agentic-qe](https://github.com/proffesor-for-testing/agentic-qe))

#### Core Pipeline Skills (loaded by default)

| Skill | Used In | Purpose | Trust Tier |
|-------|---------|---------|------------|
| shift-left-testing | Step 3 | ADR testability validation (Level 4: Risk Analysis in Design) | 3 (Verified) |
| qcsd-ideation-swarm | Step 3.5 | HTSM quality criteria + SFDIPOT risk + testability scoring | 3 (Verified) |
| code-goal-planner | Step 6 | SPARC-GOAP milestone decomposition and goal state planning | — (Agent) |
| brutal-honesty-review | Step 8 | Linus/Ramsay/Bach modes for code + test review | 2 (Validated) |
| qe-requirements-validation | Step 9 | Traceability matrix, SMART validation, orphan test detection | 3 (Verified) |
| risk-based-testing | Step 9 | Probability×Impact 5×5 scoring, 4-tier test effort allocation | 3 (Verified) |
| enterprise-integration-testing | Step 9 | Cross-module contract testing, E2E flow validation | 3 (Verified) |
| regression-testing | Step 9 | Change-based test selection, impact analysis, regression pyramid | 3 (Verified) |
| qe-coverage-analysis | Step 9 | Risk-weighted coverage scoring, differential coverage analysis | 3 (Verified) |

#### Extended Skills (available in Direct Extended Mode via `--full-qe-extended`)

| Skill | Applicable Steps | Purpose | Trust Tier |
|-------|-----------------|---------|------------|
| chaos-engineering-resilience | Step 9 | Fault injection, blast radius progression, steady state verification | 3 (Verified) |
| security-testing | Step 8, 9 | OWASP Top 10, access control, injection, cryptographic failures | 3 (Verified) |
| performance-testing | Step 8, 9 | Load/stress/spike/endurance testing, SLO definition, k6 integration | 3 (Verified) |
| mutation-testing | Step 8 | Mutation score analysis, surviving mutant diagnosis, Stryker integration | 3 (Verified) |
| tdd-london-chicago | Step 7 | TDD school selection (London mocks vs Chicago state), mixed approach | 3 (Verified) |
| qcsd-production-swarm | Step 9+ | 12-agent post-release health assessment, DORA metrics, feedback loops | 3 (Verified) |

Skills are stored in `references/agentic-qe/` and loaded on demand by each module.

## Direct Integration Mode (agentic-qe flags)

Two flags for integrating with the full agentic-qe package:

| Flag | Mode | What it does |
|------|------|-------------|
| (none) | Reference | Condensed copies of 9 core skills, no install needed — the **no-install fallback** |
| `--full-qe` | Direct | **RECOMMENDED DEFAULT when agentic-qe is installed.** Full agentic-qe protocols for the 9 core skills, and BOTH halves of the learning loop run: Step-0 recall = `memory_query("patterns/feature-adr/*")` **+** `dz recall`; Step-8 teach = the aqe `qe-outcome` store **+** `dz teach` |
| `--full-qe-extended` | Direct Extended | Full protocols + 6 additional skills (chaos, security, performance, mutation, TDD, production-swarm) |

**Which one to run:** if `aqe` is installed (`which aqe` or `node_modules/agentic-qe/`), run
`--full-qe` — it is the recommended default at every tier, because the aqe pattern memory only
contributes when the Direct half of the loop is active. Reference mode is the honest fallback for a
machine without agentic-qe; it is not a lesser-quality choice there, it is the only correct one.
This is a RECOMMENDATION about which flag to pass — the mode LOGIC is unchanged (flag + installed →
direct; flag without install → WARN + reference).

### Installation

```bash
# Install agentic-qe globally
npm install -g agentic-qe

# Initialize in your project (auto-detects tech stack, configures MCP)
cd your-project && aqe init --auto
```

### Activation

```
/feature-adr --full-qe [описание фичи]             # RECOMMENDED when agentic-qe is installed
/feature-adr [описание фичи]                      # Reference Mode: the no-install fallback
/feature-adr --full-qe-extended [описание фичи]     # Direct Extended: full protocols + extra skills
```

Step 0 (Complexity Router) checks:
1. Is `--full-qe` or `--full-qe-extended` flag present?
2. Is agentic-qe installed? (check `which aqe` or `node_modules/agentic-qe/`)
3. If flag + installed → set `{AGENTIC_QE_MODE}` = `direct` or `direct-extended`
4. If flag present but not installed → WARN and fall back to reference mode

### Ultracode → the deterministic workflow form

`/feature-adr` runs in TWO forms, same pipeline:
- **Plain `/feature-adr`** (no ultracode) — *agent-driven*: an agent follows these SKILL instructions
  step by step.
- **ultracode + `--full-qe-extended`** — *harness-driven*: the harness runs the bundled deterministic
  workflow `.claude/workflows/feature-adr.js` (shipped with this pack), which fans the steps out across
  subagents, produces the `features/<slug>/00-09` artifacts, and runs the agentic-qe QE + self-learning
  inline. Invoke it via `Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug,
  description, code, tier, stopAfter, repo, dzBin } })`. Hybrid checkpoints: S/M autonomous; L/XL return
  after the Plan phase for your steer. See `.claude/rules/feature-adr-ultracode.md`.

**Optional Codex routing (opt-in).** When Codex is installed + logged in (`codex login --device-auth`
on a headless VPS, or `printenv OPENAI_API_KEY | codex login --with-api-key`), the pipeline can route work
to Codex — always ASKING first, always with a Claude fallback (never blocks):

- **Planning (Step 6)** on Codex's top model → `args.planner: 'codex'`.
- **Code (Step 7) + tests/QE (Step 8) FALLBACK** → `args.coder: 'codex-fallback'`, `args.qeReviewer:
  'codex-fallback'`: Claude runs first, and only if the **Claude Code limit is exhausted mid-run** (the
  agent returns null) does the SAME task retry on Codex — so a long build never stalls on a rate limit.
- **Model choice** → `args.codexModel` (`auto` default (Codex self-selects) · or an id your account exposes (e.g. `gpt-5.5`)).

*Scenario:* an L/XL run hits the session limit during coding → with `coder: 'codex-fallback'` feature-adr
logs *"Claude unavailable (limit?) — falling back to Codex auto"* and finishes on Codex, no restart. Codex writes out-of-band, so feature-adr confirms the edits LANDED (`git status`, ~30s poll) before QE — no false "Step 7 never ran" grade.

*Example:* `Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug, description, tier:
'M', planner: 'codex', coder: 'codex-fallback', qeReviewer: 'codex-fallback', codexModel: 'auto' } })  // 'auto' = Codex picks top; or pin e.g. 'gpt-5.5'`.

Pre-flight, if Codex is `ready` (`codex-companion setup --json`), the orchestrator asks these three
before launching; plain `/feature-adr` offers the same at the planning checkpoint. Omit the Codex knobs
for today's all-Claude behavior. See `.claude/rules/feature-adr-ultracode.md`.

**Per-stage model routing — `args.models` (one dial, 11 stages).** `args.models` is an optional map that
routes each pipeline stage to an optimal model. Keys: `{router, requirements, research, adr, ideation,
ddd, architecture, plan, code, qe, fleet}`. Each value is a **spec**:

- **Claude** — `'fable' | 'opus' | 'sonnet' | 'haiku'` → adds `model` to that stage's `agent()` call
  (any role `agentType` like `qe-code-reviewer` is PRESERVED).
- **Codex** — `'codex'` / `'codex:<id>'` / `'codex:<id>:<reasoning>'` (e.g. `'codex:gpt-5.6:xhigh'`;
  `reasoning ∈ low|medium|high|xhigh`; ids incl. `gpt-5.5`, `gpt-5.6`) → routes the stage to the
  `codex:codex-rescue` runtime with that `codexModel` + reasoning hint.

**Recommended DEFAULT TABLE** (applied only when you opt into routing — any one `args.models` key or any
Codex knob flips it on; otherwise every stage stays session-inherited, byte-identical to today):

| Stage | Default | | Stage | Default |
|---|---|---|---|---|
| router | `fable` | | architecture | `opus` |
| requirements | `sonnet` | | plan | `sonnet` |
| research | `sonnet` (folds into requirements) | | code | *the coder knob* (default Claude `opus`) |
| adr | `opus` | | qe | *CROSS-MODEL of the coder* (see below) |
| ideation | `sonnet` | | fleet | `sonnet` |
| ddd | `opus` (folds into architecture) | | | |

**Cross-model QE default (load-bearing).** When `args.models.qe` is UNSET, QE is auto-routed to the
**other model family than the coder** — a model that WRITES code must not also SELF-QE; independent
cross-model review catches what self-review misses. coder=Codex ⇒ QE=Claude (`opus`); coder=Claude ⇒
QE=Codex (`codex:<top>:high`), or a Claude reviewer if Codex is unavailable (**never blocks**).

**Precedence.** `args.models[stage]` is the general mechanism and WINS on conflict; the legacy
`planner`/`coder`/`qeReviewer`/`codexModel` knobs are shortcuts that fill a stage only when `args.models`
does not. `codexModel` sets the default id for a bare `'codex'` spec. Codex-fallback (Claude-first, then
Codex on limit-exhaustion) stays a knob-only behavior; a direct `models.code='codex'` means codex-first.

**gpt-5.6-ready** — a new Codex id is a DATA-ONLY addition to the `KNOWN_CODEX` allowlist (no control flow).
**Reporting** — the run result includes `modelsUsed` (the resolved per-stage model) so you see who did what.

*Example:* `Workflow({ scriptPath: '.claude/workflows/feature-adr.js', args: { slug, description, tier:
'L', models: { code: 'opus', qe: 'codex:gpt-5.6:high', architecture: 'opus', router: 'fable' } } })` —
Claude writes the code, Codex independently QEs it.

**Usage-adaptive routing (pre-emptive Codex switch under limit pressure).** When routing is opted into,
the workflow probes Claude SESSION (active 5h-block) and WEEKLY (rolling 7d) usage at EACH phase boundary
via a minimal `dz usage --json` agent. When either metric is `>= usageThreshold` (default `70`) BEFORE a
phase launches — OR the probe output is missing (agent-null, which often MEANS the limit was hit) — ALL
remaining stages switch to `codex:<top>` (design/code/plan at `xhigh`, router/qe/fleet at `high`). When a
later probe reads BOTH metrics below the threshold (positive numbers, not nulls), the normal Claude+Codex
mix is RESTORED. Null percentages (unconfigured limits) change NOTHING in either direction. Switched
stages are tagged ` (usage-switched)` in `modelsUsed`, and every flip is recorded in the result's
`usageEvents` array (the audit trail — never trust promiseTags for this). Args:

| `args.*` | Default | Effect |
|---|---|---|
| `usageAdaptive` | `true` when routing is requested (any `args.models` key or Codex knob); `false` otherwise | `true` forces it on even without other routing; `false` disables all probes (byte-identical to today) |
| `usageThreshold` | `70` | the `>=` percent (either metric) that triggers the pre-emptive switch |
| `usageReasoning` | the `OVERRIDE_REASONING` map | per-stage reasoning under the override (merge over the default: design/code/plan → `xhigh`, router/qe/fleet → `high`) |

Configure the limits the probe measures against in `.dz/config.json` — `memory.usage.sessionTokenLimit`
and `memory.usage.weeklyTokenLimit` (OPTIONAL; absent ⇒ `pct` is `null` and no switch fires). The
percentages are **ESTIMATES** from local transcript aggregation (there is no official usage API);
**calibrate** by scaling a limit by `X/100` when a real limit-hit lands at an estimated `X%`.
**Honest caveat (the wrapper lesson):** at TRUE exhaustion even the Codex dispatch dies because
`codex:codex-rescue` is a Claude wrapper subagent — so the switch MUST happen BEFORE, which is why the
70% pre-emptive probe (not just reactive null-detection) is the real defense.

### Pattern memory loop (self-learning — runs in ALL modes)

**Self-learning is MANDATORY on EVERY `/feature-adr` run — including plain `/feature-adr` without any
`--full-qe` flag and outside ultracode.** The **dz durable loop runs UNCONDITIONALLY** (no MCP, no
`fleet_init` needed): **Step 0** `dz recall "<domain terms>"` → fold the top patterns into
`{LEARNED_PATTERNS}` → apply in Step 1; **Step 8** `dz teach "<durable lesson>"` for each real lesson;
each step records the live panel via `dz statusline --fa-record`. This half NEVER depends on the mode.

The **agentic-qe MCP layer below is an ADDITIONAL enrichment, active only in Direct modes**
(`--full-qe` / `--full-qe-extended`, needs `fleet_init`) — it adds semantic in-session recall on top of
the always-on dz loop. This is why `--full-qe` is the RECOMMENDED default wherever agentic-qe is
installed: only then do BOTH recall halves run at Step 0 and BOTH teach halves at Step 8.

When `{AGENTIC_QE_MODE}` = `direct` | `direct-extended`, the pipeline ALSO runs a recall → store cycle
over agentic-qe's MCP pattern memory (`namespace: "learning"`, `fleet_init` first):

- **Step 0** — `memory_query("patterns/feature-adr/*")` **plus** `dz recall --json` over the durable
  dz store → merged top-3 set `{LEARNED_PATTERNS}`; Step 1 folds them into the requirements brief as advisory lessons.
  After the recall, record live state:
  `dz statusline --fa-record --slug <feature-slug> --step "Step 0" --recalled <count of patterns loaded> --stored 0 --mode <reference|direct|direct-extended>`.
- **Step 8** — recalls `patterns/feature-adr/qe/*` to prime the review checklist; after the gap loop
  closes, stores a `qe-outcome` record in aqe **and** the same lesson via `dz teach` (durable).
  After the store: `dz statusline --fa-record --slug <slug> --step "Step 8 QE" --recalled <recalled so far> --stored <stored so far>`.
- **Step 9** — recalls `patterns/feature-adr/fleet/*` to prime agent focus; after the fleet verdict,
  stores a `fleet-qe-finding` in aqe **and** the same lesson via `dz teach`.
  After the store: `dz statusline --fa-record --slug <slug> --step "Step 9 Fleet" --recalled <recalled so far> --stored <stored so far>` with updated counts.

**Two stores by design:** the aqe kv store is *ephemeral across MCP-server restarts* (janitor/TTL —
observed live), so it serves fast in-session semantic recall; the dz lexical store
(`dz teach`/`dz recall`) is the durable half that survives to the next day. All calls are
non-blocking — an error or empty result never stalls the pipeline. This layer is
**distinct from the Keysarium reward layer** installed by `--with-learning`: it uses agentic-qe MCP
memory + the dz store, is UNCONDITIONAL for the dz half (recall/teach/fa-record run in every mode) and Direct-mode-only for the aqe-MCP half, and never touches `.keysarium/memory/`.

**Canonical brain store — `args.brain` (never fragment the loop).** The dz durable loop only compounds if
Step-0 recall and Step-8 teach hit the SAME store. The workflow pins both to a canonical **brain** —
`args.brain`, default = the workspace root — via `cd <brain> && dz recall/teach … --project <brain>`, so a
Step-8 teach issued from a coder that `cd`'d into a target repo still lands in the brain, not that repo's
`.dz`. Omitting `args.brain` is behaviorally inert for a workspace-CWD run (`brain === repo`). **Share** a
brain: `dz recall --all --json > patterns.json` → `dz teach --from-json patterns.json --project <brain>`
(exact-text dedup, idempotent). **Recover** a fragmented store: `cd <stray-repo> && dz recall --all --json >
/tmp/stray.json` → `dz teach --from-json /tmp/stray.json --project <brain>` to merge it back into the brain.

**Live learning panel (`dz statusline`).** The pipeline **drives** the panel: at each pattern-memory-loop
step above it records its live state via `dz statusline --fa-record …`, so `dz statusline` can surface
per-run learning (which feature, which step, how many patterns recalled vs. newly stored). Each of the
Step 0 / Step 8 / Step 9 call-outs above emits one `--fa-record`; the counts accumulate across the run.
Every checkpoint banner **also** prints a human-visible line so the state shows in the conversation, not
only the statusline:

```
🎓 Learning: {recalled} patterns recalled for this feature, {stored} new stored this run
```

**Record the panel at the START of every step, not only at Steps 0/8/9.** The panel shows the last step
that reported; a pipeline that reports three times per run shows a stale step for most of its life. Emit
`dz statusline --fa-record --slug <slug> --step "<Step N Name>" --recalled <n> --stored <n>` as the first
action of each step. The recall/teach counts only change at Steps 0/8/9; the *step label* changes at every
one of them.

*Honesty note:* the panel is live only insofar as the pipeline records state — it reflects what the
pipeline actually did with the loop (recalls that ran, stores that landed), not an aspirational count.

### What changes with `--full-qe`

Full agentic-qe protocols for the same 9 core skills. No new agents, just deeper methodology.

| Step | Reference Mode (default) | Direct Mode (`--full-qe`) |
|------|--------------------------|---------------------------|
| Step 0 | Standard routing | + pattern recall → `{LEARNED_PATTERNS}` |
| Step 3 | Condensed shift-left protocol | Full Level 1-4 shift-left with BDD generators |
| Step 3.5 | 3 core + flag-based conditionals | Full QCSD swarm with all 9 agents + DDD mapping |
| Step 6 | SPARC-GOAP goal state analysis | Full agent with milestone tracking + success metrics |
| Step 7 | Standard code generation | Standard code generation (no change) |
| Step 8 | Brutal-honesty 3-mode review | Full calibration levels (1-3) + evidence protocol + QE pattern recall/store |
| Step 9 | 4 agents with condensed protocols | 4 agents with full agentic-qe protocols + fleet pattern recall/store |

### What `--full-qe-extended` adds on top

Everything from `--full-qe` plus 6 additional skills and up to 3 extra agents in Step 9.

| Skill | When Activated | Condition |
|-------|----------------|-----------|
| tdd-london-chicago | Step 7 | Always — guides test-first coding |
| mutation-testing | Step 8 | If test suite exists — validates test effectiveness |
| security-testing | Step 8, 9 | If `HAS_AUTH` or `HAS_EXTERNAL_API` flags set |
| performance-testing | Step 8, 9 | If `HAS_PERFORMANCE_SLA` flag set |
| chaos-engineering-resilience | Step 9 | If `HAS_INFRASTRUCTURE_CHANGE` flag set |
| qcsd-production-swarm | Post-Step 9 | Advisory — informs future pipeline runs via feedback loops |

### When to use

| Scenario | Mode |
|----------|------|
| agentic-qe installed (any tier) | `--full-qe` — the recommended default |
| agentic-qe NOT installed | Reference (the fallback; the dz half of the loop still runs) |
| S/M tier, agentic-qe installed | `--full-qe` |
| L tier, high QE maturity | `--full-qe` |
| XL tier features | `--full-qe` recommended |
| XL + security-critical (banking, ФЗ-152) | `--full-qe-extended` recommended |
| XL + regulatory compliance | `--full-qe-extended` recommended |
| Quick iteration / prototyping | Reference (faster) |

## npm Package Init Flags

```bash
# Core only (feature-adr pipeline)
npx @dzhechkov/skills-feature-adr init

# + Reward learning (memory protocol, reward tracker, learning rules)
npx @dzhechkov/skills-feature-adr init --with-learning

# + Knowledge extractor (/harvest command, 5 agents, 7 categories, 8 gates)
npx @dzhechkov/skills-feature-adr init --knowledge-extractor

# All features
npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor
```

| Flag | Installs | Purpose |
|------|----------|---------|
| (none) | Core skill + command + rules + shard | Feature development pipeline |
| `--with-learning` | + `lib/memory-protocol.md`, `lib/reward-tracker.md`, `.claude/rules/reward-learning.md` | Installs the shared **Keysarium learning layer** (Phases 0-5, `.keysarium/memory/`). The feature-adr pipeline itself does not yet wire `memory_query`/`memory_store` into its Steps 0-9 — this layer applies only if you also run the Keysarium pipeline. A separate loop exists: in Direct modes (`--full-qe`/`--full-qe-extended`) the pipeline wires **agentic-qe MCP** pattern memory into Steps 0/8/9 — see "Pattern memory loop (Direct modes)" above. |
| `--knowledge-extractor` | + `.claude/skills/knowledge-extractor/`, `.claude/commands/harvest.md` | Extract reusable patterns after feature completion |

> **Note:** If `@dzhechkov/keysarium` is already installed, these flags are not needed — keysarium includes all learning and extraction capabilities.

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Skip complexity assessment | Jump straight to coding | BLOCK — always run Step 0 |
| Over-engineer S-tier | Run full pipeline for a config change | Router should classify as S |
| Under-engineer XL-tier | Skip ADR/DDD for major refactor | Router should classify as XL |
| ADR without alternatives | Only one option considered | Require ≥2 alternatives per ADR |
| Architecture without ADR | Diagram before decisions | Step 5 requires Step 3 output |
| Code without plan | Start coding without Step 6 | BLOCK — plan is mandatory |
| No QE | Ship without testing | BLOCK — Step 8 is mandatory |
| Skip QCSD ideation | No Step 3.5 for M+ | BLOCK — quality assessment mandatory |
| Ignore NO-GO verdict | Proceed despite Step 3.5 NO-GO | BLOCK — rework required |
| Skip gap loop | No gap detection in Step 8 | Missing requirements coverage check |
| Skip fleet QE for L/XL | No Step 9 for large features | BLOCK — fleet assessment mandatory |
| Unbounded reading before the first write | The step's artifact still does not exist after ~12 tool calls | BLOCK — write the skeleton now; a silent executor is killed at 180 s |

## Checkpoint Format

```
═══════════════════════════════════════════════════════
⏸️ STEP N: [Step Name] Complete
<promise>[PROMISE_TAG]</promise>
Tier: {COMPLEXITY_TIER} | Active Steps: {ACTIVE_STEPS}
🎓 Learning: {recalled} patterns recalled for this feature, {stored} new stored this run
🚦 Gates: challenge-panel ✓ · claim-check ✓ · discrimination not-run · amendments ✓ · fleet — · delivery n/a

[2-3 line summary]
Artifacts: [list] ✅

• "ок" — next step
• "углуби [section]" — elaborate
• "[feedback]" — adjust
═══════════════════════════════════════════════════════
```

### The 🚦 Gates line (mandatory, DERIVED — never asserted from memory)

Every checkpoint banner carries a `🚦 Gates:` line listing each gate relevant to the run so far. Symbols:
`✓` ran and passed · `✗` ran and failed · `not-run` pending · `—` N/A for this tier/slice (say why once).
Each value is **derived from machine-checkable state** — an artifact's existence, a command's JSON verdict, a
test result — never from what the orchestrator remembers doing. The line does not make a gate run; it makes
NOT running one loud: a skipped gate shows as `not-run` by construction instead of being silently forgotten
(cost-of-detection ladder: the banner is the one surface emitted at EVERY step boundary, so strapping the
checklist to it is the cheapest way to harden orchestrator judgment). Gate sources: challenge-panel → its
verdict exists; claim-check → its JSON counts (`high-findings` vs `clean`); discrimination → the
`dz discrimination-check` aggregate; amendments → every `AM-N` row carries its `→ test` and it was checked;
fleet → the 09 artifact (L/XL only, else `—`); delivery → the 10_delivery_review.md Verdict
(`ready|blocked|errored`, `n/a` when the gate was not requested).
