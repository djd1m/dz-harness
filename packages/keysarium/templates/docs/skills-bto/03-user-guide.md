# BTO User Guide — @dzhechkov/skills-bto

> **`/bto*` commands are NOT part of @dzhechkov/keysarium.** The BTO evaluator
> (Build-Benchmark-Test-Optimize) ships as a SEPARATE npm package. Install it first —
> `npx @dzhechkov/skills-bto init` — otherwise every `/bto…` command referenced below will
> not resolve in your project.


This guide covers everything you need to use the BTO (Build-Test-Optimize) skill pack for Claude Code. It is intended for developers and prompt engineers who want to create, evaluate, and iteratively improve Claude Code artifacts — skills, commands, rules, and agent templates.

---

## Contents

1. [Quick Start (5 minutes)](#1-quick-start-5-minutes)
2. [Building Artifacts with /bto-build](#2-building-artifacts-with-bto-build)
3. [Testing Artifacts with /bto-test](#3-testing-artifacts-with-bto-test)
4. [Optimizing Artifacts with /bto-optimize](#4-optimizing-artifacts-with-bto-optimize)
5. [Full BTO Pipeline with /bto](#5-full-bto-pipeline-with-bto)
6. [Working with Judge Panels](#6-working-with-judge-panels)
7. [Common Scenarios](#7-common-scenarios)
8. [Tips and Best Practices](#8-tips-and-best-practices)
9. [FAQ and Troubleshooting](#9-faq-and-troubleshooting)

---

## 1. Quick Start (5 minutes)

BTO gives you five commands. Each can be used independently or together as a pipeline.

```
/bto-build [description]       — Generate a new skill, command, rule, or agent template
/bto-benchmark [path]          — Deterministic benchmarking against golden samples
/bto-test [path]               — Evaluate an existing artifact through layered quality gates
/bto-optimize [path]           — Improve an artifact through evolutionary optimization
/bto [path or description]     — Full pipeline: BUILD → BENCHMARK → TEST → OPTIMIZE
```

### Your first BTO run

The fastest way to see BTO in action is to test an artifact you already have:

```
/bto-test .claude/skills/my-skill/
```

You will see a three-stage report appear in your terminal:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 0 PRE-FLIGHT CHECK
Artifact: my-skill (skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Universal checks:       11 / 12
Type-specific checks:   15 / 16
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  26 / 28
Pass rate:              93%
Status:                 PASS

Failed checks:
  - [SK-10] Empty examples directory *

Verdict: PROCEED TO LAYER 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Layer 1 (haiku) runs next — a quick semantic check — followed by the full judge panel in Layer 2.

### What BTO evaluates

BTO works on any of these artifact types:

| Type | Path Pattern | Example |
|------|-------------|---------|
| Skill | `.claude/skills/<name>/` | `.claude/skills/my-researcher/` |
| Command | `.claude/commands/<name>.md` | `.claude/commands/summarize.md` |
| Rule | `.claude/rules/<name>.md` | `.claude/rules/no-vague-claims.md` |
| Agent template | `.claude/agents/<name>.md` | `.claude/agents/domain-expert.md` |
| Research artifact | `researches/**/*.md` | `researches/bank_case/02_research_findings.md` |

BTO auto-detects the type from the path. You do not need to specify it.

---

## 2. Building Artifacts with /bto-build

The BUILD module generates production-quality Claude Code artifacts from natural language descriptions. It handles all the structural conventions, template selection, and self-review so you do not have to.

### Basic usage

```
/bto-build [description]
```

Examples:

```
/bto-build a skill that summarizes long research documents into executive briefings

/bto-build slash command /weekly-report that generates a markdown status report from git log

/bto-build rule file for detecting and fixing vague metric claims (no baselines or targets)

/bto-build agent template for a domain expert judge evaluating healthcare AI proposals
```

### Build modes: QUICK vs DEEP

BTO BUILD operates in one of two modes depending on how well-specified your description is.

**QUICK mode** — used when the description is clear and self-contained. The agent parses it directly and proceeds to generation. Typical time: 2 minutes.

**DEEP mode** — used when requirements are ambiguous or the artifact is complex. The agent loads the `explore` skill and asks you a structured set of clarifying questions before generating. Typical time: 5 minutes.

DEEP mode is triggered automatically when the description is short (fewer than 15 words), contains conflicting signals, or involves multiple unfamiliar domain constraints. You can also force it:

```
/bto-build --mode deep a skill for compliance checking
```

In DEEP mode you will be asked questions such as:

- What artifact type should this be? (skill / command / rule / agent)
- What domain does this operate in? (banking, retail, healthcare, general)
- What are the inputs and expected outputs?
- What quality criteria matter most?
- Are there any existing artifacts to use as reference?

Answer these conversationally. Once the requirements are clear, BUILD proceeds to generation without further prompts.

### Step-by-step: building a skill

Here is a complete walkthrough of building a new skill from scratch.

**Step 1: Invoke the command**

```
/bto-build a skill that reviews pull request diffs and writes structured code review comments
```

**Step 2: Watch type detection**

BUILD detects: artifact type = **skill**, from the keywords "skill" and structured protocol.

**Step 3: Requirements extraction (QUICK mode)**

BUILD extracts:
- Name: `pr-reviewer`
- Capability: analyze git diffs, produce structured code review
- Domain: software development / git workflows
- Output: structured comments with severity levels

**Step 4: Generation**

BUILD creates the following file tree:

```
.claude/skills/pr-reviewer/
├── SKILL.md
├── modules/
│   ├── diff-analysis.md
│   └── comment-formatter.md
├── references/
│   └── review-heuristics.md
└── examples/
    └── sample-review.md
```

`SKILL.md` receives all mandatory sections: `# Title`, `## Overview`, `## Quick Start`, `## Protocol`, `## Output Format`, `## Anti-Patterns`, `## Dependencies`.

**Step 5: Self-review**

Before writing the files, BUILD runs its own Layer 0 equivalent check:
- All required sections present
- No `[TODO]` or `[TBD]` placeholders
- Cross-references resolve
- File sizes within bounds

If any check fails, BUILD fixes it before output. You see only the final, clean artifact.

**Step 6: Output summary**

```
BUILD Complete
Artifact: .claude/skills/pr-reviewer/
Files created:
  - SKILL.md (8.2 KB)
  - modules/diff-analysis.md (4.1 KB)
  - modules/comment-formatter.md (3.7 KB)
  - references/review-heuristics.md (2.9 KB)
  - examples/sample-review.md (1.8 KB)

Next: Run /bto-test .claude/skills/pr-reviewer/ to evaluate
```

### Building commands

Commands are single `.md` files. BUILD follows the command template automatically:

```
/bto-build slash command /analyze-deps that reads package.json and reports outdated dependencies
```

The generated command will include:
- Usage line with `$ARGUMENTS`
- Skill loading instruction (reads relevant SKILL.md files)
- Numbered protocol steps
- Checkpoint banner
- Error handling for missing arguments

### Building rules

Rules define patterns with detection signals and fixes. BUILD generates a structured table:

```
/bto-build rule for catching over-engineered architecture proposals (more than 10 components in an MVP)
```

Output is a rule file with columns: Pattern, Detection Signal, Required Fix, Severity (BLOCK / WARN / FLAG).

### Building agent templates

Agent templates define reusable agent configurations for parallel workloads:

```
/bto-build agent template for a completeness auditor that checks research artifacts for missing citations
```

BUILD ensures the template specifies model selection (haiku/sonnet/opus), isolation scope, output format, timeout bounds, and failure protocol — all required by the quality checklist.

### Anti-patterns to avoid when writing descriptions

| Anti-Pattern | Example | Better |
|-------------|---------|--------|
| Vague type | "make something for research" | "make a skill that..." |
| No domain | "a skill for reviewing content" | "a skill for reviewing banking compliance documents" |
| Too broad | "a skill that does everything" | "a skill that does one thing well" |
| Too short | "research skill" | Describe what it inputs, what it outputs, what domain |

---

## 3. Testing Artifacts with /bto-test

The TEST module runs your artifact through three evaluation layers, stopping at the first failure. Each layer is more expensive and thorough than the previous one.

### Layer overview

```
Layer 0  →  Layer 1  →  Layer 2  →  Meta-Judge (only on disagreement)
free         haiku        sonnet ×3     opus
instant      ~10 sec      ~30 sec       ~15 sec
structural   semantic     full panel    disagreement resolution
```

### Running a test

```
/bto-test .claude/skills/pr-reviewer/
```

Or test a specific layer only:

```
/bto-test .claude/skills/pr-reviewer/ --level layer0
/bto-test .claude/skills/pr-reviewer/ --level layer1
/bto-test .claude/skills/pr-reviewer/ --level layer2
```

Default (`--level full`) runs all layers sequentially, stopping if any layer fails.

### Layer 0: Structural pre-checks

Layer 0 is deterministic — no LLM is involved. It runs 12 universal checks plus type-specific checks against a predefined quality checklist.

**Universal checks (12 total):**

| ID | What is checked |
|----|----------------|
| U-01 | File exists and is non-empty |
| U-02 | Valid UTF-8 encoding |
| U-03 | Starts with level-1 heading |
| U-04 | No placeholder text (TODO, FIXME, INSERT, TBD) |
| U-05 | No empty sections |
| U-06 | Consistent heading hierarchy |
| U-07 | No broken internal cross-references |
| U-08 | File size within bounds (200 bytes to 100 KB) |
| U-09 | No trailing whitespace |
| U-10 | No raw HTML tags |
| U-11 | All code blocks properly closed |
| U-12 | No duplicate top-level section names |

**Skill-specific checks (16 additional):** confirms SKILL.md exists, Overview and Anti-Patterns sections present, all module and reference files resolve, size bounds (2 KB to 50 KB for SKILL.md, under 200 KB total), examples directory populated, dependencies documented.

**Gate:** Pass rate must reach 80% to proceed. Below 80%, the report lists every failing check with IDs and Layer 1 evaluation is skipped.

Items marked `*` in the report are auto-fixable — BUILD can correct them programmatically. Items without `*` require human or LLM-assisted review.

**Reading a Layer 0 failure report:**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 0 PRE-FLIGHT CHECK
Artifact: my-command (command)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Universal checks:       10 / 12
Type-specific checks:    7 / 11
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  17 / 23
Pass rate:              74%
Status:                 CONDITIONAL

Failed checks:
  - [U-04] Placeholder text found: "[INSERT SKILL NAME]" at line 12
  - [CM-02] No $ARGUMENTS reference found
  - [CM-03] No checkpoint protocol reference
  - [U-09] Trailing whitespace on 3 lines *

Verdict: FIX AND RE-CHECK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The auto-fixable item (`*`) is trailing whitespace — Layer 0 can correct that. The other three require you or BUILD to address them before re-running.

### Layer 1: Quick semantic evaluation

Layer 1 uses a single haiku call to provide a fast quality signal. It evaluates five dimensions on a 1-10 scale.

**Five dimensions:**

| Dimension | What is measured |
|-----------|----------------|
| CLARITY | Are instructions unambiguous? Can an LLM follow them precisely? |
| COMPLETENESS | Are all necessary sections present? No missing pieces? |
| ACTIONABILITY | Can Claude produce concrete output from these instructions? |
| QUALITY | Well-structured, professional, good formatting? |
| ANTI-PATTERNS | Avoids known pitfalls? Has failure mode coverage? |

**Sample Layer 1 output:**

```
LAYER 1: Quick Evaluation (haiku)
Artifact: pr-reviewer (skill)

SCORES:
- CLARITY:       8/10 — Instructions are specific; agent step boundaries are clear
- COMPLETENESS:  7/10 — All sections present; examples could be more varied
- ACTIONABILITY: 8/10 — Protocol produces deterministic output
- QUALITY:       8/10 — Well-formatted, good use of tables and code blocks
- ANTI-PATTERNS: 6/10 — Anti-patterns section present but thin (only 3 entries)

AVERAGE: 7.4/10

TOP 3 IMPROVEMENTS:
1. Expand anti-patterns with at least 5 more entries covering edge cases
2. Add a second example demonstrating a failing review scenario
3. Clarify Step 3 output format — currently underspecified

VERDICT: PASS (≥7.0)
```

**Gate thresholds:**
- Average >= 7.0: PASS — proceed to Layer 2
- Average 5.0 to 6.9: NEEDS WORK — Layer 2 can provide detailed feedback
- Average < 5.0: FAIL — fix before proceeding

### Layer 2: Full judge panel

Layer 2 is the most thorough evaluation. Three sonnet agents run in parallel, each with a distinct perspective. They evaluate the same artifact independently — no judge sees another's scores before submitting.

**The three judges:**

| Judge | Role | Scoring calibration | Weight |
|-------|------|--------------------:|-------|
| Domain Expert | Accuracy, depth, methodology, domain fit | Generous (7-9 avg) | 0.40 |
| Critic | Gaps, weaknesses, anti-patterns, edge cases | Strict (5-6 avg) | 0.30 |
| Completeness Auditor | Structure, coverage, cross-references | Moderate (6-8 avg) | 0.30 |

Each judge scores five dimensions (1-10): METHODOLOGY, DEPTH, CORRECTNESS, USABILITY, ROBUSTNESS.

**Aggregation formula:**

```
dimension_score = expert[dim] * 0.4 + critic[dim] * 0.3 + auditor[dim] * 0.3
overall = mean(all five dimension_scores)
```

**Sample Layer 2 report:**

```
═══════════════════════════════════════════════════════
BTO EVALUATION REPORT
Artifact: .claude/skills/pr-reviewer/
Type: skill
Level: Layer 0 + Layer 1 + Layer 2

OVERALL SCORE: 7.6 / 10  [PASS]

Per-Dimension:
  METHODOLOGY:  8.1  ████████░░░░
  DEPTH:        7.3  ███████░░░░░
  CORRECTNESS:  8.0  ████████░░░░
  USABILITY:    7.8  ███████░░░░░
  ROBUSTNESS:   6.8  ██████░░░░░░

Flagged dimensions (disagreement >3): ROBUSTNESS
  Expert: 8, Critic: 4, Auditor: 7 — escalating to meta-judge

Top Improvements:
1. [Critic] Step 2 does not handle binary file diffs — add explicit skip logic
2. [Auditor] references/review-heuristics.md is not cited in SKILL.md body
3. [Expert] Examples should include a false-positive case to calibrate the agent
═══════════════════════════════════════════════════════
```

### Understanding the per-dimension scores

Each dimension has a defined rubric. Here is what the score ranges mean for skills:

**METHODOLOGY**
- 9-10: Multi-step protocol, explicit decision points, modular design
- 7-8: Good protocol, some modularity
- 4-6: Basic steps listed, no decision flow
- 1-3: No protocol — only describes what the skill does

**DEPTH**
- 9-10: Rich references, multiple examples, detailed modules, anti-patterns
- 7-8: Good detail in SKILL.md, references and examples present
- 4-6: Minimal references, basic overview
- 1-3: Stub-level content

**CORRECTNESS**
- 9-10: All instructions produce expected output, cross-references valid
- 7-8: Instructions work, minor reference issues
- 4-6: Some ambiguous instructions, broken references
- 1-3: Instructions would produce wrong output

**USABILITY**
- 9-10: Quick Start section, clear navigation, progressive disclosure of detail
- 7-8: Well-organized, information is findable
- 4-6: Readable but poorly organized
- 1-3: Wall of text, no navigable structure

**ROBUSTNESS**
- 9-10: Anti-patterns documented, failure modes handled, abort conditions defined
- 7-8: Anti-patterns section present, some edge cases covered
- 4-6: Mentions some risks
- 1-3: No failure mode coverage

### Meta-judge: disagreement resolution

When any dimension shows a spread of more than 3 points between the highest and lowest judge score, BTO escalates that dimension to the meta-judge — a single opus call that reviews all three evaluations and produces a reconciled score.

```
Meta-Judge Input:
  ROBUSTNESS disagreement:
    Expert (8): "Protocol handles most diff types; edge cases documented"
    Critic (4): "Binary diffs, symlinks, and renamed files are unhandled"
    Auditor (7): "Anti-patterns section mentions some edge cases"

Meta-Judge Output:
  Reconciled score: 6
  Reasoning: Critic identified specific, concrete gaps (binary diffs, renames)
  that the Expert and Auditor did not weight as heavily. The gaps are real.
  Recommended: Address Critic's list before claiming robustness.
  Human review needed: NO
```

If the meta-judge flags human review as YES, BTO displays a warning and waits for your confirmation before continuing.

### Re-running after fixes

After addressing the improvement suggestions, re-run the test:

```
/bto-test .claude/skills/pr-reviewer/
```

Layer 0 is always re-run from scratch. If the artifact previously passed Layer 0, BTO skips to Layer 1 by default. Override with `--level full` to force all layers.

---

## 4. Optimizing Artifacts with /bto-optimize

The OPTIMIZE module improves artifacts through a 3-round evolutionary loop: generate variants by mutation, evaluate, select the best, cross-breed, repeat.

### When to use it

Optimization makes sense when:
- Baseline Layer 2 score is between 5.0 and 7.9
- You know the score is low but the structural issues are already fixed
- You want to push a good artifact from 7-something to 8+

Do not use it when:
- Layer 0 fails — fix structural issues first
- Baseline score is already >= 8.0 — the artifact is good; minor manual tweaks are more efficient
- The artifact's intent or scope is wrong — optimization cannot fix a fundamentally misdirected artifact

### Basic usage

```
/bto-optimize .claude/skills/pr-reviewer/
```

With optional parameters:

```
/bto-optimize .claude/skills/pr-reviewer/ --rounds 3 --focus ROBUSTNESS
```

`--rounds` defaults to 3 (maximum 5). `--focus` tells the optimizer which dimension to prioritize. Without `--focus`, BTO targets all dimensions that score below 7.0.

### The 3-round loop

**Round 1: Mutation + fast evaluation**

BTO generates five variants of your artifact. Each applies one mutation strategy:

| Variant | Strategy | When effective |
|---------|----------|---------------|
| V1 | Rephrase | CLARITY or USABILITY is low |
| V2 | Restructure | METHODOLOGY or USABILITY is low |
| V3 | Add Constraints | ROBUSTNESS or CORRECTNESS is low |
| V4 | Simplify | Artifact is verbose or over-engineered |
| V5 | Specialize | DEPTH is low; needs domain-specific context |

If you specified `--focus ROBUSTNESS`, variants V3 and V5 (which target robustness-related weaknesses) are given extra weight: three variants use robustness strategies, two use others.

Each variant is evaluated with Layer 1 (haiku) in parallel — five simultaneous agent calls. Scores are recorded. Time: approximately 30-45 seconds.

**Round 2: Crossover + fast evaluation**

The top two variants from Round 1 are combined. BTO takes sections where Variant A scored higher from A, and sections where Variant B scored higher from B, producing three new crossover variants. These are again evaluated with Layer 1 in parallel. Time: approximately 20-30 seconds.

**Round 3: Final selection with full panel**

The top two crossover variants from Round 2 are evaluated with Layer 2 (full judge panel, sonnet × 3). The single best-scoring variant is selected as the output. Time: approximately 60-90 seconds for all evaluations in parallel.

### Convergence detection

BTO tracks the improvement delta between rounds. If the delta (new score minus previous best) falls below 0.5 for two consecutive rounds, the optimizer declares convergence and stops early — even before Round 3 completes. This prevents running expensive evaluations when the artifact has plateaued.

If a round's top score is more than 1.0 lower than the previous best, BTO rolls back to the previous best and logs a regression warning.

### Reading the optimization report

```
═══════════════════════════════════════════════════════
BTO OPTIMIZATION REPORT
Artifact: .claude/skills/pr-reviewer/
Rounds: 3
Total evaluations: 15

BEFORE → AFTER:
  METHODOLOGY:  7.2 → 8.4  (+1.2)
  DEPTH:        6.5 → 7.8  (+1.3)
  CORRECTNESS:  8.0 → 8.2  (+0.2)
  USABILITY:    7.8 → 8.1  (+0.3)
  ROBUSTNESS:   6.2 → 7.9  (+1.7)

  OVERALL:      7.1 → 8.1  (+1.0)

Winning Strategy: Restructure + Add Constraints (crossover R1V2 × R1V3)

CHANGELOG:
- Restructured Step 2 to separate binary diff detection from text diff analysis
- Added explicit skip conditions for non-text file types
- Expanded anti-patterns with 4 new entries from Critic feedback
- Added fail-safe: if diff parser returns empty, output explains why
- Examples now include a renamed-file scenario
═══════════════════════════════════════════════════════
```

**What the recommendation means:**
- Overall improvement > 1.0: "Apply changes" — the optimized version is meaningfully better
- Improvement 0.5 to 1.0: "Review changes, consider applying" — gains are real but modest
- Improvement < 0.5: "Minimal improvement — original may be preferred" — not worth the cost

### Applying the result

BTO does not automatically overwrite your artifact. It presents the optimized version and waits for your confirmation. If you approve, BTO writes the file. If you decline, the original is preserved and BTO offers to show a diff so you can cherry-pick improvements manually.

---

## 5. Full BTO Pipeline with /bto

The `/bto` command runs BUILD, BENCHMARK, TEST, and OPTIMIZE in sequence for a complete quality lifecycle. Use it when starting a new artifact from scratch and wanting production-quality output with minimal manual intervention.

### Usage

```
/bto [description or path]
```

If given a description, BTO runs BUILD first. If given an existing path, it skips BUILD and starts with TEST.

```
/bto a skill for generating weekly status reports from git history

/bto .claude/skills/existing-skill/
```

### End-to-end walkthrough

Here is a complete run of `/bto a skill for generating weekly status reports`.

**Stage 1: BUILD**

BTO invokes the BUILD module in QUICK mode. Within two minutes, the artifact is created at `.claude/skills/weekly-reporter/`.

```
BUILD Complete
Artifact: .claude/skills/weekly-reporter/
Files created: SKILL.md (7.1 KB), modules/git-reader.md, modules/report-formatter.md,
               references/report-templates.md, examples/sample-report.md
```

**Stage 2: TEST**

BTO immediately tests the freshly built artifact.

```
Layer 0: 26/28 (93%) — PASS
Layer 1: 7.2/10 — PASS
Layer 2: 7.4/10 — PASS
Flagged: ROBUSTNESS (disagreement 4 points — Expert 8, Critic 4)
         Meta-judge reconciled to 6.2
```

The overall score of 7.4 is below 8.0, so BTO proceeds to optimization.

**Stage 3: OPTIMIZE**

BTO runs 3 rounds of optimization targeting ROBUSTNESS (lowest score) and DEPTH (second lowest).

```
Round 1: 5 variants × Layer 1 — best: 7.8 (V3: Add Constraints)
Round 2: crossover × Layer 1  — best: 8.0 (V3×V5 crossover)
Round 3: final × Layer 2      — final: 8.3
```

**Checkpoint**

Before writing the optimized version, BTO displays a checkpoint and waits for your confirmation:

```
═══════════════════════════════════════════════════════
CHECKPOINT: BTO Pipeline Complete
Artifact: .claude/skills/weekly-reporter/
BUILD: Complete (5 files)
TEST:  7.4/10 (Layer 0 PASS, Layer 1 PASS, Layer 2 PASS)
OPT:   8.3/10 (+0.9 improvement)

Key improvements in optimized version:
- Added error handling for repositories with no git history
- Expanded anti-patterns to cover merge commit noise
- Added examples for monorepo setups

Type "apply" to write the optimized version.
Type "diff" to see a full before/after comparison.
Type "skip" to keep the original BUILD output.
═══════════════════════════════════════════════════════
```

Respond with `apply`, `diff`, or `skip`.

### Pipeline behavior with existing artifacts

When `/bto` is given a path to an existing artifact, it skips BUILD. If the artifact scores >= 8.0 on Layer 2, it skips OPTIMIZE too, and simply presents the evaluation report. The pipeline adapts to what is actually needed.

```
/bto .claude/skills/high-quality-skill/
→ TEST runs: Layer 2 score = 8.6
→ OPTIMIZE skipped: artifact already high quality
→ Report presented
```

---

## 6. Working with Judge Panels

Understanding how the judge panel works helps you interpret results accurately and avoid acting on misleading scores.

### Why three judges with different roles

A single judge cannot reliably evaluate both "is this technically correct" and "what is missing" at the same time. Role differentiation forces each agent into a specific evaluative stance:

- The **Domain Expert** reads with optimism, looking for what works well and whether the approach is sound.
- The **Critic** reads adversarially, looking specifically for what could fail, mislead, or be missing.
- The **Completeness Auditor** reads mechanically, checking every structural requirement against the checklist.

The Critic is explicitly calibrated to score lower than the Expert (average 5-6 vs 7-9). This is intentional and does not mean the artifact is bad — it means the Critic found the gaps that genuinely need attention.

### Judge isolation

Judges do not see each other's scores before submitting. This is not an implementation detail — it is a deliberate quality gate. If judges could see each other's scores, they would converge toward the first-submitted score, which is a well-documented bias in multi-evaluator systems. BTO uses parallel agent execution to enforce isolation.

### Score aggregation

The weighted average formula gives Domain Expert the highest weight (0.40) because domain correctness is the most consequential failure mode. An artifact that passes structural and completeness checks but gives wrong instructions is actively harmful.

```
final_score = expert * 0.40 + critic * 0.30 + auditor * 0.30
```

To compute manually from a report: take each judge's overall score, multiply by the weights above, sum the results.

### Reading disagreements

High disagreement between judges is information, not noise. When the spread exceeds 3 points on a dimension, it reveals genuine ambiguity in the artifact's quality on that dimension.

Common patterns:

| Disagreement pattern | Likely cause | What to do |
|---------------------|-------------|-----------|
| Expert high, Critic low | Technically correct but fragile | Address Critic's specific failure scenarios |
| Expert low, Auditor high | Complete structure but wrong approach | Rethink the methodology, not the formatting |
| Critic low, others normal | Critic found genuine edge case gaps | Read Critic's specific failure scenarios carefully |
| All three low | Artifact has fundamental problems | Consider rebuilding rather than optimizing |

### What to do with the top improvements list

The top improvements list at the end of the evaluation report combines insights from all three judges, prioritized by impact. The convention is:

1. First item: the most critical gap (often from Critic)
2. Second item: a structural or cross-reference issue (often from Auditor)
3. Third item: a depth or context improvement (often from Expert)

Apply them in order. Each improvement typically moves the score by 0.3 to 0.7 points on the affected dimension.

### When to use /bto-test directly vs as part of /bto

Use `/bto-test` directly when:
- You want to evaluate an artifact you wrote manually (not built by BTO)
- You want a quick Layer 1 check without running the full panel: `/bto-test path --level layer1`
- You want to re-evaluate after manual edits to confirm improvement
- You are running batch evaluation of multiple artifacts

Use `/bto` (which includes TEST) when:
- You are starting a new artifact from scratch
- You want the full lifecycle managed for you

---

## 7. Common Scenarios

### Scenario A: Creating a new skill from scratch

You need a skill that does not yet exist in your `.claude/skills/` directory.

```
/bto a skill for detecting and flagging AI-washing language in pitch decks
```

BTO builds the skill, tests it, and optimizes it in one command. Total time: 10-15 minutes. Result: a production-quality skill at `.claude/skills/ai-washing-detector/` with a Layer 2 score of 8.0+.

### Scenario B: Auditing an existing skill

You inherited a skill that was written manually and want to know its current quality level.

```
/bto-test .claude/skills/legacy-researcher/
```

Run the full evaluation. Read the Layer 2 report. If the score is below 7.0, run:

```
/bto-optimize .claude/skills/legacy-researcher/
```

If the score is 7.0 to 7.9, read the improvement suggestions and edit the skill manually, then re-run the test to confirm the gains.

### Scenario C: Targeted prompt tuning

You have a skill that works well overall (Layer 2 score 7.5) but the Critic consistently scores ROBUSTNESS below 5.0. You want to fix just that dimension.

```
/bto-optimize .claude/skills/my-skill/ --focus ROBUSTNESS
```

This directs the mutation strategy toward robustness: three of the five Round 1 variants will use "Add Constraints" and "Specialize" strategies, which are the primary and secondary strategies for ROBUSTNESS improvement.

### Scenario D: A/B evaluation of two versions

You have two versions of a command and want an objective comparison.

```
/bto-test .claude/commands/summarize-v1.md --level layer2
/bto-test .claude/commands/summarize-v2.md --level layer2
```

Compare the per-dimension scores. The version with a higher weighted average is objectively better according to the judge panel. Pay attention to which dimensions differ most — that reveals what architectural choice is driving the quality gap.

### Scenario E: Evaluating a research artifact

BTO can evaluate Keysarium research artifacts too, not just code-level skills and commands.

```
/bto-test researches/bank_kc_automation/02_research_findings.md
```

For research artifacts, Layer 0 runs research-specific checks: sourced claims, no `[UNVERIFIED]` tags, real competitor names, quantified KPIs. Layer 2 uses the Research Artifact rubric, which scores CORRECTNESS heavily on citation quality and ROBUSTNESS on whether limitations and confidence levels are noted.

### Scenario F: Batch evaluation before a release

Before releasing a set of skills as a package, evaluate all of them.

```
/bto-test .claude/skills/skill-one/
/bto-test .claude/skills/skill-two/
/bto-test .claude/skills/skill-three/
```

Or in a single session, run tests in sequence and review the consolidated reports. Any skill scoring below 7.0 should be optimized before release. Any skill failing Layer 0 should be fixed immediately.

### Scenario G: Maintaining skills over time

Skills degrade in quality relative to new conventions as your codebase evolves. Run quarterly audits:

```
/bto-test .claude/skills/explore/
/bto-test .claude/skills/goap-research-ed25519/
/bto-test .claude/skills/problem-solver-enhanced/
```

If a skill scores below its previous benchmark, use `/bto-optimize` to bring it back up.

---

## 8. Tips and Best Practices

### Writing better descriptions for /bto-build

The more specific your description, the better the output. Include:

- Artifact type (skill, command, rule, agent)
- Domain context (banking, healthcare, software development, general)
- Input format and output format
- One concrete use case example
- Any constraints (on-premise, latency budget, compliance requirements)

Example of a thin description vs a good description:

```
# Thin (triggers DEEP mode, requires follow-up questions)
/bto-build a research skill

# Good (goes directly to QUICK mode generation)
/bto-build a skill that searches for and synthesizes competitive intelligence
on software companies, producing structured markdown reports with sourced
claims, quantified market shares, and a SWOT table. Domain: B2B SaaS.
Output format: 02_research_findings.md compatible.
```

### Use Layer 1 for fast iteration

During active development of an artifact, use `--level layer1` to get feedback in 10 seconds rather than 40. Switch to `--level full` only when you are satisfied with the Layer 1 score and want the comprehensive panel report.

```
# Rapid iteration loop
/bto-test .claude/skills/my-skill/ --level layer1
# ... edit the skill based on feedback ...
/bto-test .claude/skills/my-skill/ --level layer1
# ... repeat until score >= 7.5 ...
/bto-test .claude/skills/my-skill/
# Full evaluation
```

### Do not optimize artifacts that are already good

If a skill scores 8.0+ on Layer 2, the optimizer has little room to improve it and the cost (approximately 131K tokens for a full 3-round run) is unlikely to be justified. Reserve optimization for artifacts in the 5.5-7.9 range.

### Pay more attention to Critic feedback than Expert feedback

The Expert tends to reward good structure and sound methodology, which BUILD provides automatically. The Critic finds the gaps that actually matter in practice. When the Expert scores 8 and the Critic scores 5, the real quality is closer to the Critic's assessment — there are specific failure modes that need to be addressed.

### Read the CHANGELOG after optimization

The CHANGELOG in the optimization report lists every specific change made. Reading it teaches you the patterns that improve quality — over time you will internalize them and start producing higher-quality first drafts from BUILD.

### Keep artifact scope tight

The biggest source of low scores is over-scoped artifacts. An artifact that tries to do too much ends up doing none of it well. METHODOLOGY and USABILITY suffer most. If SKILL.md is approaching 30 KB, split it into modules and let the main file orchestrate them.

### Version control your artifacts

Before running `/bto-optimize`, commit the current artifact to git. If you decline the optimized version or want to compare manually, you have a clean baseline to diff against.

```bash
git add .claude/skills/my-skill/
git commit -m "baseline before bto optimization"
/bto-optimize .claude/skills/my-skill/
```

---

## 9. FAQ and Troubleshooting

### Q: Why is Layer 0 failing on an artifact I wrote manually?

The most common causes:

1. **Placeholder text** — the checks look for `TODO`, `FIXME`, `[INSERT`, `<YOUR_`, `TBD`. Search your file for these strings.
2. **Empty sections** — a heading immediately followed by another heading with no content between them fails check U-05.
3. **Missing Anti-Patterns section** — this is required for skills (check SK-03). Add it even if brief.
4. **Broken cross-references** — if SKILL.md mentions `modules/analysis.md` but the file does not exist, check U-07 and SK-06 will fail.

Run `--level layer0` first to get the complete list of failures before attempting fixes.

### Q: The Critic gives very low scores even for good artifacts. Is this a calibration problem?

No. The Critic is intentionally calibrated to score strict — average 5 to 6. Its job is to find problems, not to validate quality. A Critic score of 5 on an otherwise good artifact means it found specific gaps. Read the justification for each low score; they are actionable.

If all three judges score above 8.5 on a first evaluation, that is the anti-pattern called "score inflation." It means the evaluation criteria are not being applied strictly enough. This is flagged automatically.

### Q: /bto-optimize is not improving my score. What is happening?

Several possibilities:

1. **Baseline already near ceiling** — if you are at 7.8+, gains become marginal. The delta gate (0.5 minimum improvement per round) will trigger convergence.
2. **Wrong focus dimension** — if METHODOLOGY is low but you are trying to improve ROBUSTNESS, the mutations will not help the right dimension. Run without `--focus` first to let BTO target the weakest dimensions automatically.
3. **Structural problems** — optimization cannot fix Layer 0 failures. Ensure Layer 0 passes first.
4. **Artifact is over-scoped** — if SKILL.md is a monolith, no amount of rephrasing will fix the METHODOLOGY score. Split it.

### Q: Can I test non-skill files, like my Keysarium research artifacts?

Yes. Point BTO at any markdown file in `researches/`:

```
/bto-test researches/bank_kc_automation/03_solution_strategy.md
```

BTO auto-detects the research artifact type and applies the research-specific Layer 0 checks (citations, KPI specificity, no unverified claims) plus the research artifact rubric in Layer 2.

### Q: How do I know which judge's feedback to prioritize?

Use this heuristic:

- If the Critic identifies a **specific failure scenario** (e.g., "this will fail when the input is empty"), prioritize that — it is a real bug.
- If the Expert identifies a **methodological weakness** (e.g., "the decision flow at Step 3 is unclear"), prioritize that — it affects every use of the artifact.
- If the Auditor identifies **missing cross-references or sections**, these are quick to fix and should be addressed first to stop them from dragging down future evaluations.

### Q: The meta-judge says "human review needed: YES." What do I do?

Read the meta-judge's reasoning carefully. "Human review needed" means the three judges had fundamentally different interpretations of the artifact's quality — not just score variance, but genuine disagreement about what the artifact is trying to do. This usually means the artifact's scope or intent needs clarification.

Rewrite the Overview section to make the purpose unambiguous, then re-run the full evaluation.

### Q: Can I add custom dimensions to the evaluation?

Not through `/bto-test` directly, which uses the fixed five-dimension rubric. For custom evaluation criteria, use the judge rubrics reference (`references/judge-rubrics.md`) as a template and create a custom evaluation command that loads it with domain-specific additions.

### Q: /bto-build created files I do not want. How do I clean up?

BUILD always outputs to `.claude/skills/<name>/` or `.claude/commands/<name>.md` depending on type. Remove the generated directory or file manually:

```bash
rm -rf .claude/skills/unwanted-skill/
```

BTO does not delete files automatically.

### Q: What is the difference between /bto and /bto-build + /bto-test + /bto-optimize run separately?

Functionally, the full pipeline produces the same result either way. The difference is that `/bto` handles the transitions automatically: it decides whether to run OPTIMIZE based on the TEST score, and it presents a single consolidated checkpoint at the end. Running the three commands separately gives you a checkpoint after each stage and more granular control.

Use `/bto` for new artifacts. Use the individual commands for auditing or maintaining existing artifacts.
