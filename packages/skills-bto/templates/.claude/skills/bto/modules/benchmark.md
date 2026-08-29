# BENCHMARK Module — Pre-TEST Quality Benchmarking Protocol

## Purpose

Benchmark any Claude Code artifact (skill, command, rule, agent template) against type-specific golden samples and deterministic test suites before it enters the TEST pipeline. Catches structural deficiencies, consistency issues, and performance problems at near-zero cost.

## Position in Pipeline

```
BUILD → BENCHMARK → TEST → OPTIMIZE
         ^^^^^^^^
         This module
```

BENCHMARK runs AFTER BUILD and BEFORE TEST. An artifact that fails BENCHMARK should not consume expensive LLM evaluation budget in TEST Layer 1/2.

## Input

- **Path:** Path to artifact file or directory
- **Level:** B0 | B1 | B2 | B3 | full (default: full)
- **Artifact type:** auto-detected from path/content

## Type Detection

| Path Pattern | Detected Type |
|-------------|--------------|
| `.claude/skills/*/SKILL.md` | skill |
| `.claude/skills/*/` (directory) | skill |
| `.claude/commands/*.md` | command |
| `.claude/rules/*.md` | rule |
| `.claude/agents/*.md` | agent |
| `researches/**/*.md` | research artifact |

---

## Layer B-1: Environment Preconditions (runs before everything else)

**Cost:** Near-zero **Speed:** Instant **Purpose:** establish that each downstream layer *can*
execute, and record the answer — so a layer that never ran is never mistaken for a layer that passed.

| Precondition | Required by | Probe | On failure |
|---|---|---|---|
| Artifact path readable + full directory listing | B0, B1, B3 | `stat` / `ls` | **ABORT** — cannot benchmark at all; no score is emitted |
| `references/golden-samples.md` has an entry for the detected type | B0 | grep the type heading | B0 = **INCONCLUSIVE** (never "skipped") |
| Agent tool reachable; a trivial probe returns inside the watchdog window | B2 | 1 haiku probe | B2 = **INCONCLUSIVE** |
| Every external tool a B1 test shells out to | B1 | `--version` | that test = **INCONCLUSIVE** |

**Result line — printed in the header of EVERY report, including ALL_GREEN runs:**

```
Preconditions: ALL_GREEN | DEGRADED(B2: agent tool unreachable) | ABORT(artifact path unreadable)
```

An absent result line is itself a finding. Printing it only when something broke makes the layer
optional, and an optional honesty check is the failure mode this layer exists to remove.

### Escape hatch for a DEGRADED run

A DEGRADED run has a route back to ALL_GREEN, not an excuse. Where a missing dependency is a tool the
evaluation merely *needs available*, provision it locally: install or unpack it from a language
package's bundled binaries into a scratch directory, run it on a free port, and tear it down when the
benchmark finishes. Never adopt, mutate, restart, or reconfigure a service the developer owns — a
benchmark that changes the environment it measures has stopped being a measurement. If the dependency
cannot be provisioned this way, the affected layer stays INCONCLUSIVE and says so.

---

## Layer B0: Golden Sample Comparison

**Cost:** Zero (no LLM calls)
**Speed:** Instant
**Purpose:** Measure structural similarity to known-good artifacts of the same type

### Protocol

1. Detect artifact type from path/content
2. Load golden sample structure for that type from `references/golden-samples.md`
3. Parse the artifact's section headings, their order, and their sizes (character count)
4. Compare against the golden sample's expected sections, expected order, and expected proportions

### Scoring Dimensions

**Section Coverage (0-1):**
```
section_coverage = sections_present / sections_expected
```
- Parse all `##` headings in the artifact
- Match against the required sections listed in the golden sample for this type
- Fuzzy match allowed: "Overview" matches "Purpose", "Quick Start" matches "Usage"
- Sections beyond the expected list do NOT reduce coverage (they are bonus)

**Ordering Score (0-1):**
```
ordering_score = 1 - (inversion_count / max_inversions)
max_inversions = n * (n - 1) / 2  (where n = number of matched sections)
```
- For each pair of matched sections, check if their order matches the golden sample order
- An "inversion" is a pair of sections that appear in reversed order relative to the golden
- If only 0 or 1 sections are matched, ordering_score defaults to 0.0

**Proportion Score (0-1):**
```
proportion_score = 1 - mean(abs(actual_proportion[i] - golden_proportion[i]))
```
- For each matched section, compute its proportion of total content (by character count)
- Compare against the golden sample's expected proportional ranges
- Sections within the expected range contribute 0 deviation
- Sections outside the range contribute the distance to the nearest bound
- Unmapped sections are excluded from proportion calculation

### Golden Similarity

```
GOLDEN_SIMILARITY = mean(section_coverage, ordering_score, proportion_score)
```

### Layer B0 Output

```
===============================================================
LAYER B0: Golden Sample Comparison
Artifact: <path>
Type: <detected type>
Golden Sample: <type> (from references/golden-samples.md)

Section Coverage: X.XX (Y/Z sections present)
  Present: Overview, Anti-Patterns, Dependencies, ...
  Missing: Examples, Quick Start

Ordering Score: X.XX (N inversions out of M max)
  Inversions: Anti-Patterns before Overview (expected after)

Proportion Score: X.XX
  Oversized: Anti-Patterns (35% vs expected 10-20%)
  Undersized: Overview (2% vs expected 5-15%)

GOLDEN SIMILARITY: X.XX
===============================================================
```

---

## Layer B1: Deterministic Test Suite

**Cost:** Zero (no LLM calls)
**Speed:** Instant
**Purpose:** Verify artifact meets type-specific functional requirements through concrete, testable assertions

### Skill Tests

```
TEST-SK0: Frontmatter Fence
  PASS: SKILL.md begins with a "---" frontmatter fence (optional trailing whitespace,
        optional "\r" before "\n" tolerated — the parser accepts CRLF by design),
        containing at least a non-empty "name:" and a non-empty "description:"
  FAIL only if: the file does not begin with "---" (any other first bytes,
        including a heading or a BOM-then-non-fence), or the closing "---" fence
        is never found

TEST-SK1: Trigger/Activation Section
  PASS: SKILL.md contains a section with "when to load", "trigger",
        "activation", or "## Quick Start" with invocation instructions
  FAIL: No verifiable instruction for when/how to load this skill

TEST-SK2: Anti-Patterns Table Coverage
  PASS: ## Anti-Patterns section contains a markdown table with >=3 rows
        AND table has both a "Detection" (or "Signal") column and a "Fix" column
  FAIL: Missing anti-patterns table, <3 entries, or missing Detection/Fix columns

TEST-SK3: Module File Integrity
  PASS: Every file path matching `modules/*.md` referenced in SKILL.md
        has a corresponding file on disk in the modules/ directory
  FAIL: SKILL.md references a module file that does not exist,
        OR modules/ directory contains files not referenced in SKILL.md

TEST-SK4: Output Format Specification
  PASS: SKILL.md contains explicit output format definition --
        identified by "## Output", "output format", code block with template,
        or structured example of expected agent output
  FAIL: Output format is ambiguous or not specified anywhere in the skill

TEST-SK5: Concrete Examples
  PASS: examples/ directory exists AND contains at least one .md file
        with non-trivial content (>200 bytes)
  FAIL: No examples/ directory, empty directory, or only stub files
```

### Command Tests

```
TEST-CM1: Step-by-Step Protocol
  PASS: File contains a numbered list (1. 2. 3. or Step 1, Step 2, Step 3)
        with at least 3 steps defining the execution protocol
  FAIL: No numbered protocol -- instructions are unstructured prose only

TEST-CM2: Checkpoint Banner
  PASS: File contains a checkpoint banner pattern (=== or --- divider
        with at least 3 user response options like "ok", feedback)
  FAIL: No checkpoint banner, or fewer than 3 response options offered

TEST-CM3: Argument Validation
  PASS: $ARGUMENTS is referenced AND there is explicit handling for
        the empty/missing case (e.g., "if $ARGUMENTS is empty", default behavior)
  FAIL: $ARGUMENTS referenced without empty-input handling,
        OR $ARGUMENTS not referenced at all

TEST-CM4: Skill Loading Reference
  PASS: File contains at least one instruction to load a skill
        (pattern: "Read .claude/skills/" or "load skill" or "SKILL.md")
  FAIL: No skill loading instruction found

TEST-CM5: Critical Rules Section
  PASS: File contains a "## Critical Rules", "## Rules", "## Constraints",
        or "## Important" section with at least 3 enforceable rules
  FAIL: No critical rules section, or section has fewer than 3 rules
```

### Rule Tests

```
TEST-RL1: Pattern Table Size
  PASS: File contains a markdown table with >=3 data rows
        (excluding the header row)
  FAIL: No table found, or table has fewer than 3 pattern rows

TEST-RL2: Detection + Fix Columns
  PASS: Every row in the main pattern table has both a
        detection signal/trigger AND a required fix/action
  FAIL: Any pattern row is missing its detection signal or its fix

TEST-RL3: Auto-Detection Instruction
  PASS: File contains a section or paragraph with "auto-detect",
        "self-check", or "when generating content, check against"
  FAIL: No instruction for how the agent should self-apply these rules

TEST-RL4: Pattern Specificity
  PASS: Each pattern in the table references a concrete, observable behavior
        (e.g., "Score > 8.5 on first attempt") rather than vague qualities
  FAIL: Any pattern uses vague language like "general sloppiness",
        "bad quality", "not good enough" without measurable criteria

TEST-RL5: Concrete Example Reference
  PASS: At least one anti-pattern or pattern entry includes a concrete
        example (inline code, quoted text, or "e.g., ...")
  FAIL: All patterns are abstract with no concrete examples
```

### Agent Tests

```
TEST-AG1: Model Specification
  PASS: File explicitly names the model to use
        (one of: haiku, sonnet, opus, or "default")
  FAIL: No model specification found -- agent inherits parent model implicitly

TEST-AG2: Isolation Scope Definition
  PASS: File defines which files/directories the agent MAY read and write,
        or explicitly states "read-only" / "no file writes"
  FAIL: No isolation scope -- agent has undefined access boundaries

TEST-AG3: Structured Output Format
  PASS: Prompt template or instructions section specifies a structured
        output format (JSON, markdown template, labeled sections, or key-value)
  FAIL: Agent is expected to return free-form text with no structure

TEST-AG4: Error Handling / Fallback
  PASS: File contains instructions for agent behavior on error, timeout,
        unexpected input, or inability to complete the task
  FAIL: No error handling -- agent has undefined behavior on failure

TEST-AG5: Naming Convention Compliance
  PASS: Agent name follows project standards:
        "Phase N [Role]" or "BTO Judge -- [Role]" or "Background Worker: [type]"
  FAIL: Agent uses a non-standard or undescriptive name
```

### Layer B1 Scoring

```
tests_executed     = tests_total - tests_inconclusive
tests_inconclusive = tests_total - tests_executed   (checks that could not run — Layer B-1)
test_pass_rate     = tests_passed / tests_executed  (0-1)
```

- Each test: PASS (1) or FAIL (0) — or **INCONCLUSIVE**, which is neither
- The denominator is `tests_executed`, never `tests_total`: a test that could not run must not be
  counted as a failure, and must not be quietly dropped from the numerator either
- **`tests_inconclusive > 0` forces the layer verdict to INCONCLUSIVE regardless of the ratio.** A
  4/4 pass rate over 6 declared tests is not a pass; it is "we checked four of six"
- Total tests per type: 6 (skill) | 5 (command) | 5 (rule) | 5 (agent)

### Layer B1 Output

```
===============================================================
LAYER B1: Deterministic Test Suite
Artifact: <path>
Type: <detected type>

Results: X/6 passed, Y inconclusive (XX% of executed)

PASS  TEST-SK0: Frontmatter fence present with name + description
PASS  TEST-SK1: Trigger/activation section present
PASS  TEST-SK2: Anti-patterns table has 5 entries with Detection + Fix
FAIL  TEST-SK3: modules/missing-module.md referenced but not found on disk
PASS  TEST-SK4: Output format specified in ## Output section
FAIL  TEST-SK5: examples/ directory is empty

TEST PASS RATE: X.XX
===============================================================
```

---

## Layer B2: Consistency Probe

**Cost:** Low (3 haiku calls, parallel)
**Speed:** ~15 seconds
**Purpose:** Detect artifacts that produce inconsistent interpretations -- a signal of ambiguous instructions

### Protocol

1. Read the artifact content
2. Spawn 3 parallel haiku agents with identical prompts
3. Each agent independently answers the same 4 probe questions
4. Compare the 3 responses for structural agreement
5. Compute consistency score

### Agent Configuration

```
Agent 1: "Benchmark Probe -- Instance A"    model: haiku
Agent 2: "Benchmark Probe -- Instance B"    model: haiku
Agent 3: "Benchmark Probe -- Instance C"    model: haiku
```

**Isolation:** All 3 agents read the same artifact. No cross-communication. Identical prompt.

### Probe Prompt

`INCREMENTAL-WRITE: EXEMPT (short output)` — the probe answer is four short fields, ~15 lines. It is
emitted in the reply, deliberately, and the **Agent Authoring Rule** in `SKILL.md` does not apply
here. This exemption is written down so that it reads as a decision, not as an omission.

```
You are analyzing a Claude Code {artifact_type} for consistency.
Read the artifact below carefully.

## Artifact Content
{content}

Answer these 4 questions. Be specific and concise.

Q1: What is the PRIMARY purpose of this artifact? (one sentence)
Q2: List the TOP 3 most important sections/components. (ordered list)
Q3: What is the MAIN anti-pattern or risk this artifact addresses? (one sentence)
Q4: If an agent followed this artifact, what would the OUTPUT look like? (2-3 sentences)

## Required Output Format

PURPOSE: [answer to Q1]
TOP_SECTIONS:
1. [section]
2. [section]
3. [section]
MAIN_RISK: [answer to Q3]
EXPECTED_OUTPUT: [answer to Q4]
```

### Consistency Scoring

For each question, measure agreement across the 3 responses:

| Agreement Level | Score | Criteria |
|----------------|-------|----------|
| Full agreement (3/3 match) | 1.0 | All 3 responses convey the same meaning (semantic match) |
| Majority agreement (2/3 match) | 0.67 | 2 of 3 agree, 1 diverges |
| No agreement (all different) | 0.0 | All 3 responses are substantively different |

**Agreement evaluation method:**
- Q1 (PURPOSE): Check if all 3 identify the same core purpose (semantic, not lexical)
- Q2 (TOP_SECTIONS): Check overlap -- score = |intersection of all 3| / 3
- Q3 (MAIN_RISK): Check if all 3 identify the same risk category
- Q4 (EXPECTED_OUTPUT): Check if all 3 describe structurally similar output

```
CONSISTENCY_SCORE = mean(q1_agreement, q2_agreement, q3_agreement, q4_agreement)
```

**Important:** The orchestrator (not haiku) evaluates agreement between responses. This is a deterministic comparison step performed after all 3 agents return.

### Layer B2 Output

```
===============================================================
LAYER B2: Consistency Probe
Artifact: <path>
Type: <detected type>
Probes: 3 parallel haiku instances

Q1 PURPOSE agreement:        X.XX  (3/3 agree | 2/3 agree | no agreement)
Q2 TOP_SECTIONS agreement:   X.XX  (N/3 sections overlap)
Q3 MAIN_RISK agreement:      X.XX  (3/3 agree | 2/3 agree | no agreement)
Q4 EXPECTED_OUTPUT agreement: X.XX  (3/3 agree | 2/3 agree | no agreement)

Divergence details:
  Q2: Agent B listed "Dependencies" instead of "Quick Start"

CONSISTENCY SCORE: X.XX
===============================================================
```

---

## Layer B3: Performance Metrics

**Cost:** Zero (no LLM calls)
**Speed:** Instant
**Purpose:** Detect bloated, redundant, or inefficient artifacts through quantitative analysis

### Metrics

**Token Efficiency (0-1):**
```
content_chars = total characters in prose and code blocks
formatting_chars = characters in markdown formatting (headings, dividers, table pipes, bullets)
token_efficiency = content_chars / (content_chars + formatting_chars)
```
- Measures the ratio of substantive content to formatting overhead
- Healthy range: 0.60-0.85
- Below 0.50: over-formatted (too many dividers, empty tables, decorative elements)
- Above 0.90: under-formatted (wall of text, poor readability)

**Information Density (0-1):**
```
unique_concepts = count of distinct key terms/concepts introduced (approximated by unique
                  multi-word phrases in headings + bold text + table headers)
total_sections = count of ## headings
density_score = min(unique_concepts / (total_sections * 3), 1.0)
```
- Each section should introduce ~3 unique concepts on average
- Score of 1.0 means sections are information-rich
- Score below 0.3 means many sections are padding or repetitive

**Bloat Detection:**
```
avg_section_size = mean(section_sizes)
bloated_sections = sections where size > 3 * avg_section_size
bloat_ratio = count(bloated_sections) / total_sections
```
- Flag any section that is >3x the average section size
- These sections are candidates for splitting into sub-sections or modules
- bloat_ratio of 0 is ideal; above 0.3 is problematic

**Redundancy Detection:**
```
repeated_phrases = phrases of 5+ words appearing 3+ times in the artifact
                   (excluding code blocks and table formatting)
redundancy_score = min(count(repeated_phrases) / total_sections, 1.0)
```
- Flag repeated instructions, duplicated rules, and copy-paste artifacts
- Repeated phrases within the SAME section are weighted 2x (local redundancy)
- Repeated phrases across sections are weighted 1x (structural repetition)
- A score of 0 means no redundancy detected

### Performance Score

```
PERFORMANCE_SCORE = mean(
  token_efficiency,
  density_score,
  1 - bloat_ratio,
  1 - redundancy_score
)
```

### Layer B3 Output

```
===============================================================
LAYER B3: Performance Metrics
Artifact: <path>
Type: <detected type>
File size: XXXX bytes | XX sections | ~XXXX content chars

Token Efficiency:      X.XX  (content: XXXX / total: XXXX chars)
Information Density:   X.XX  (XX unique concepts / XX sections)
Bloat Ratio:           X.XX  (N sections flagged)
  Flagged: "Protocol" section (4200 chars vs avg 800 chars)
Redundancy Score:      X.XX  (N repeated phrases found)
  Repeated: "must be specified" appears 5 times

PERFORMANCE SCORE: X.XX
===============================================================
```

---

## Layer B4: Cost Efficiency (advisory axis)

> Inspired by Princeton HAL harness — cost is tracked as a **separate first-class
> axis**, NOT blended into the quality score. A skill is never blocked for being
> expensive; instead the cost↔quality tradeoff is surfaced so the operator can
> decide. Two skills with equal quality but a 10x cost difference must be
> distinguishable at a glance.

### Static estimate (pre-run)

Estimate the skill's cost band from its declared model usage *before* any LLM
call is made, by counting how many times the artifact routes work to each tier:

```
relative_units = haiku_calls * 1 + sonnet_calls * 4 + opus_calls * 20

Band:
  free    : relative_units == 0   (deterministic, no LLM)
  low     : 1  - 8
  medium  : 9  - 40
  high     : > 40
```

> The deterministic implementation lives in `@dzhechkov/harness-core`
> (`estimateSkillCost()`), surfaced on every `BenchmarkScore.cost`. Prefer it to
> hand-counting when benchmarking via the CLI.

### Measured cost (post-run, when TEST has executed)

When TEST has run real judges, aggregate actual token usage into a dollar cost
using the per-token pricing table and provider-normalized usage:

```
invocation_cost_usd = Σ over calls [ normalizeUsage(call) priced via MODEL_PRICES ]
cost_efficiency      = quality_score / invocation_cost_usd     (quality per $)
```

`normalizeUsage()` reconciles OpenAI / Anthropic / Bedrock token shapes and
applies cached-read discounts (~10% of prompt price). Both helpers are exported
from `@dzhechkov/harness-core` (`invocationCost`, `costEfficiency`).

### Layer B4 Output

```
LAYER B4 -- Cost Efficiency (advisory)
  Static band:        medium  (relative_units = 23)
  Tier calls:         haiku x3, sonnet x5, opus x0
  Measured cost:      $0.042 / invocation   (if TEST ran)
  Cost-efficiency:    202 quality-points/$  (8.5 / $0.042)
  Verdict:            efficient — no opus on the hot path
```

### Cost Gate (advisory only — never blocks)

| Band | Advisory |
|------|----------|
| free / low | ✅ Lean. No action. |
| medium | ℹ️ Acceptable. Confirm opus calls (if any) are reserved for disagreement/synthesis. |
| high | ⚠️ Flag for OPTIMIZE: can any opus call drop to sonnet, or any layer merge, without quality loss? |

---

## Overall Benchmark Score

> Cost (B4) is reported alongside but is **not** part of `BENCHMARK_SCORE` —
> quality and cost are orthogonal axes (HAL principle). Quality gates the
> pipeline; cost informs the operator.

```
BENCHMARK_SCORE = B0_golden * 0.30 + B1_tests * 0.35 + B2_consistency * 0.15 + B3_performance * 0.20
```

### Weight Rationale

| Layer | Weight | Rationale |
|-------|--------|-----------|
| B0 Golden Sample | 0.30 | Structural conformity is foundational -- wrong structure cannot be patched |
| B1 Test Suite | 0.35 | Functional requirements are the strongest predictors of artifact quality |
| B2 Consistency | 0.15 | Ambiguity detection is valuable but inherently noisy (LLM variance) |
| B3 Performance | 0.20 | Efficiency matters but is secondary to correctness and completeness |

### Gate Logic

Rows are evaluated **top to bottom, and the first matching row wins**. The INCONCLUSIVE row is
evaluated BEFORE any numeric threshold — a score computed over layers that did not all run is not
evidence, so it must never be compared against a threshold in the first place.

| # | Condition | Status | Action |
|---|-----------|--------|--------|
| 0 | Layer B-1 returned ABORT | ABORT | No score is emitted at all. Fix the environment and re-run. |
| 1 | **Any layer INCONCLUSIVE** | **INCONCLUSIVE** | **Not a pass and not a failure.** Name what could not run and why. Do NOT proceed to TEST on an INCONCLUSIVE B-1 or B1. |
| 2 | Score < 0.50 | BLOCK | Do NOT proceed to TEST. Return to BUILD with specific failures. |
| 3 | Score 0.50 - 0.70 | WARN | Proceed to TEST with advisory flag. TEST judges are informed of benchmark concerns. |
| 4 | Score > 0.70 | PASS | Proceed to TEST with full confidence. |

**INCONCLUSIVE is sticky downstream.** If BENCHMARK is INCONCLUSIVE, TEST does not start. If a TEST
layer is INCONCLUSIVE, the evaluation report's overall verdict is INCONCLUSIVE.

### Verdict lattice

```
ABORT          preconditions failed hard          -> no score is emitted at all
INCONCLUSIVE   a requested layer could not run    -> never a pass; TEST is not entered
BLOCK          score < 0.50                       -> back to BUILD
WARN           0.50 - 0.70                        -> TEST with advisory flags
PASS           > 0.70                             -> TEST
```

### Escalation on BLOCK

When BENCHMARK_SCORE < 0.50:
1. Log all layer scores and specific failures
2. Generate a prioritized fix list (ordered by impact on score)
3. If B0 < 0.40: "Artifact structure does not match expected pattern. Consult references/golden-samples.md."
4. If B1 < 0.40: "Artifact fails critical functional tests. Review test failures above."
5. If B3 < 0.30: "Artifact has significant bloat or redundancy. Consider restructuring."
6. Return to BUILD -- do NOT send to TEST

---

## Output: Full Benchmark Report

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`. The full report is written to a file section by section (header →
> per-layer blocks → score → fix list); the reply carries only the checkpoint summary. The B2 probe
> answers are the declared exemption above, not a precedent for this report.

```
===============================================================
BTO BENCHMARK REPORT
Artifact: <path>
Type: <detected type>
Date: <YYYY-MM-DD>
Preconditions: ALL_GREEN | DEGRADED(<list>) | ABORT(<reason>)
===============================================================

LAYER B-1 -- Environment Preconditions     ALL_GREEN | DEGRADED | ABORT
  Probes run: artifact path, golden-sample entry, agent tool, external tools
  Degraded:   [layer: reason, ...] or "none"

LAYER B0 -- Golden Sample Comparison       X.XX
  Section Coverage:    X.XX (Y/Z sections)
  Ordering Score:      X.XX (N inversions)
  Proportion Score:    X.XX

LAYER B1 -- Deterministic Test Suite       X.XX
  Tests Passed: X/5
  Failed: TEST-SK3, TEST-SK5

LAYER B2 -- Consistency Probe              X.XX
  Probe Agreement: X/4 questions fully agreed
  Divergence: Q2 (section ranking)

LAYER B3 -- Performance Metrics            X.XX
  Token Efficiency:    X.XX
  Information Density: X.XX
  Bloat Ratio:         X.XX
  Redundancy:          X.XX

===============================================================
BENCHMARK SCORE:  X.XX / 1.00

  B0 (0.30): X.XX * 0.30 = X.XX
  B1 (0.35): X.XX * 0.35 = X.XX
  B2 (0.15): X.XX * 0.15 = X.XX
  B3 (0.20): X.XX * 0.20 = X.XX

Gate: PASS | WARN | BLOCK | INCONCLUSIVE | ABORT
===============================================================

[If WARN or BLOCK -- prioritized fix list:]
Priority Fixes:
1. [highest impact fix]
2. [second highest]
3. [third highest]

Recommendation: [PROCEED TO TEST | FIX AND RE-BENCHMARK | RETURN TO BUILD]
===============================================================
```

---

## Partial Evaluation

When `level` is not `full`, run only the specified layer:

| Level | Layers Run | Cost | Use Case |
|-------|-----------|------|----------|
| B0 | B0 only | Zero | Quick structural sanity check |
| B1 | B1 only | Zero | Functional validation after targeted fix |
| B2 | B2 only | Low (3 haiku) | Ambiguity check on a specific artifact |
| B3 | B3 only | Zero | Performance audit before optimization |
| full | B0 + B1 + B2 + B3 | Low (3 haiku) | Complete benchmark before TEST |

When running a partial evaluation, the gate logic uses only the layers that were run. There are two
distinct reasons a layer can be missing, and they are handled by two **separate, non-overlapping**
branches. Collapsing them into one rule breaks a legitimate `--level B0` run, so keep them apart:

**Branch 1 — the operator deliberately skipped the layer** by choosing a `level` other than `full`.
This is a valid, requested partial run. The skipped layers are excluded from the weighted average and
the remaining weights ARE renormalized. The gate applies normally to the renormalized score.

**Branch 2 — the layer was requested but could not run** (Layer B-1 reported it DEGRADED: golden
sample entry absent, agent tool unreachable, external tool missing). This layer is **INCONCLUSIVE**
and is **never** renormalized away. Renormalizing it would silently redistribute its weight to the
layers that happened to succeed, which can only ever raise the score — turning a gap in evidence into
a better grade. The run's verdict is INCONCLUSIVE; name the layer and the reason.

The test to apply when in doubt: *did the operator ask for this layer?* If yes and it did not run,
it is Branch 2, and the score is not comparable to a threshold.

---

## Integration with BTO Pipeline

### In Full `/bto` Run

```
/bto [path]
  BUILD       ->  artifact generated
  BENCHMARK   ->  this module (gate check)
    If BLOCK  ->  return to BUILD with fix list (up to 2 retries)
    If WARN   ->  proceed to TEST, pass advisory flags
    If PASS   ->  proceed to TEST
  TEST        ->  Layer 0, Layer 1, Layer 2
  OPTIMIZE    ->  evolutionary improvement
```

### Retry Logic on BLOCK

- Maximum 2 automatic retries after BLOCK
- Each retry: pass the prioritized fix list to BUILD for targeted repair
- If still BLOCK after 2 retries: escalate to human with full benchmark report
- Retries only re-run B0 + B1 (deterministic layers) to save cost

### Advisory Flags for TEST

When BENCHMARK gates as WARN, pass the following to TEST judges:

```
BENCHMARK ADVISORY:
- Benchmark Score: X.XX (below 0.70 threshold)
- Weak layers: [list layers scoring below 0.50]
- Specific concerns: [top 2 failures from benchmark]

Judges should pay extra attention to the flagged areas.
```

---

## Anti-Patterns (BENCHMARK)

| Anti-Pattern | Detection Signal | Required Fix |
|-------------|-----------------|--------------|
| Skipping BENCHMARK before TEST | No benchmark report in evaluation flow | BLOCK -- always run BENCHMARK before TEST |
| Ignoring BLOCK gate | Artifact sent to TEST despite BLOCK status | Enforce gate -- BLOCK means stop |
| Over-relying on B2 consistency | Making pass/fail decisions based on B2 alone | B2 is noisy -- always combine with deterministic layers |
| Gaming golden samples | Artifact matches golden structure but has empty content | B1 test suite catches content-level issues |
| Benchmark without golden samples | Running B0 for a type not in golden-samples.md | Add the type to golden-samples.md first. B0 is then INCONCLUSIVE, not skipped -- skipping renormalizes 0.30 of the weight away, which is the same hole by another door |
| Treating a non-executed check as green | Report shows N skipped/absent checks alongside a PASS gate | INCONCLUSIVE -- a check that did not run has no verdict |
| Treating WARN as PASS | Proceeding without advisory flags | Always pass advisory flags to TEST when WARN |
| Infinite retry loop | More than 2 retries on BLOCK | Hard cap at 2 retries, then escalate to human |
| Single-shot long write | An agent produces a >200-line artifact in one `Write` or one reply | Skeleton first, then `Edit` appends -- see "Agent Authoring Rule" in `SKILL.md` |

---

## Model Routing

| Operation | Model | Rationale |
|-----------|-------|-----------|
| Layer B0 (golden comparison) | N/A | Deterministic -- no LLM needed |
| Layer B1 (test suite) | N/A | Deterministic -- no LLM needed |
| Layer B2 (consistency probe) | haiku | Low-cost parallel probes (3 instances) |
| Layer B3 (performance metrics) | N/A | Deterministic -- no LLM needed |
| Agreement evaluation (B2 post) | N/A | Orchestrator compares responses deterministically |

Total LLM cost per full benchmark: 3 haiku calls (Layer B2 only).

---

## Cost Summary

| Layer | LLM Calls | Model | Estimated Cost |
|-------|-----------|-------|---------------|
| B0 | 0 | -- | Free |
| B1 | 0 | -- | Free |
| B2 | 3 (parallel) | haiku | ~$0.001 |
| B3 | 0 | -- | Free |
| **Total** | **3** | **haiku** | **~$0.001** |

---

## Dependencies

- `references/golden-samples.md` -- Golden sample structures for all artifact types (required for Layer B0)
- `references/quality-checklist.md` -- Cross-referenced by Layer B1 test definitions
- `modules/test.md` -- Downstream module that receives BENCHMARK gate status and advisory flags
