# /bto-benchmark — Deterministic Benchmarking of a Skill or Command

## Usage
```
/bto-benchmark [path to skill directory or file]
```

## Parameters
- $ARGUMENTS — Path to a skill directory (`.claude/skills/<name>/`), a command file (`.claude/commands/<name>.md`), a rule file (`.claude/rules/<name>.md`), or any structured artifact. Optionally include "verbose" to show expanded per-section diagnostics for all layers.

## Protocol

### Step 1: Load Skill and Module

Read `.claude/skills/bto/SKILL.md`
Read `.claude/skills/bto/modules/benchmark.md`
Read `.claude/skills/bto/references/golden-samples.md`

### Step 2: Validate Input

If $ARGUMENTS is empty:
- Ask: "Provide a path to the skill directory or artifact file you want to benchmark."
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

### Step 4: Layer B0 — Golden Sample Comparison (Deterministic)

**Purpose:** Compare artifact structure against the canonical golden sample for its type. Zero LLM cost.

Load golden samples for the detected type from `references/golden-samples.md`.

**Procedure:**

1. Parse the artifact into a section tree (heading hierarchy, section lengths, ordering)
2. Parse the matching golden sample into the same section tree format
3. Compare across three structural axes:

**Axis 1 — Section Coverage:**
For each required section in the golden sample, check if the artifact contains a matching section (by heading text or semantic equivalent).
- `section_coverage = matched_sections / total_golden_sections`

**Axis 2 — Ordering Score:**
Compare the ordering of matched sections against the golden sample ordering.
- Use normalized inversion distance: `ordering_score = 1 - (inversion_count / max_inversions)` where `max_inversions = n * (n - 1) / 2` (n = number of matched sections)
- If only 0 or 1 sections are matched → ordering_score defaults to 0.0 (too few to compare)

**Axis 3 — Proportion Score:**
For each matched section, compute its proportion of total content (by character count) and compare against the golden sample's expected proportion.
- `proportion_score = 1 - mean(|actual_proportion[i] - golden_proportion[i]|)` clamped to [0, 1]
- Measures whether sections are proportionally sized (not too bloated, not too thin). Unmapped sections are excluded.

**Display per-section MATCH/MISS table:**

```
Golden Section              Status    Artifact Section             Size Ratio
─────────────────────────── ──────── ──────────────────────────── ──────────
## Overview                 MATCH    ## Overview                  1.2x
## Protocol                 MATCH    ## Protocol                  0.8x
## Anti-Patterns            MATCH    ## Anti-Patterns             1.0x
## Dependencies             MISS     —                            —
## Quick Start              MATCH    ## Quick Start               1.5x
```

**Golden Similarity Score:**
```
B0 = mean(section_coverage, ordering_score, proportion_score)
```

B0 is not gated on its own — it feeds the aggregate BENCHMARK_SCORE (Step 8), where a low B0 (< 0.40) is surfaced in the escalation fix list. Do not BLOCK at B0 in isolation.

### Step 5: Layer B1 — Deterministic Test Suite

**Purpose:** Run all applicable deterministic tests for the detected artifact type. Zero LLM cost.

Execute all applicable checks from `references/quality-checklist.md` for the detected artifact type. (The `benchmark.md` module documents these same checks as its TEST-* suite; `references/quality-checklist.md` is the authoritative ID index.) These overlap with but extend the Layer 0 checks from `/bto-test`:

**Universal Checks (U-01 through U-12):**
- U-01: File exists and is non-empty
- U-02: UTF-8 encoding valid
- U-03: Starts with level-1 heading
- U-04: No placeholder text (`TODO`, `FIXME`, `[INSERT`, `<YOUR_`, `...`)
- U-05: No empty sections (heading with no content before next heading)
- U-06: Consistent heading hierarchy (no `##`→`####` jumps)
- U-07: No broken internal cross-references
- U-08: File size within bounds (200B – 100KB per file)
- U-09: No trailing whitespace on lines
- U-10: Standard Markdown only (no raw HTML)
- U-11: All code blocks properly closed
- U-12: No duplicate top-level sections

**Type-Specific Checks (see `references/quality-checklist.md` for full definitions):**
- Skill: SK-01 through SK-16 (SKILL.md exists, required sections, modules/, references/, examples/, etc.)
- Command: CM-01 through CM-11 (location, `$ARGUMENTS`, checkpoint, skill loading, usage line, examples, empty-argument handling, etc.)
- Rule: RL-01 through RL-09 (table format, detection signals, fix actions, severity designation, no vague patterns, etc.)
- Agent: AT-01 through AT-10 (purpose, model specified + justified, isolation scope, output format, failure protocol, naming convention, etc.)

**Display per-test PASS/FAIL table:**

```
ID      Check                              Result   Note
─────── ──────────────────────────────────  ──────── ────────────────────────────
U-01    File exists and is non-empty       PASS     8.4 KB
U-02    UTF-8 encoding                     PASS
...
SK-01   SKILL.md exists at skill root      PASS
SK-02   Has ## Overview section            PASS
SK-03   Has ## Anti-Patterns section       FAIL     Section missing
...
```

**Test Pass Rate:**
```
B1 = passed_tests / total_applicable_tests
```

B1 is not gated on its own — it feeds the aggregate BENCHMARK_SCORE (Step 8), where a low B1 (< 0.40) is surfaced in the escalation fix list. Do not BLOCK at B1 in isolation.

### Step 6: Layer B2 — Consistency Probe

**Purpose:** Measure evaluation stability by running identical prompts across multiple agents. Detects artifacts that produce inconsistent interpretations.

**Model:** haiku (cost-optimized)

**Spawn 3 parallel haiku agents with the identical evaluation prompt:**

Each agent independently answers the same 4 probe questions about the artifact:
```
You are analyzing a Claude Code {artifact_type} for consistency.
Read the artifact carefully, then answer these 4 questions. Be specific and concise.

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

**Isolation:** Each agent evaluates independently. No cross-communication.

**After all 3 return, the orchestrator (not haiku) measures agreement per question:**

| Agreement Level | Score | Criteria |
|----------------|-------|----------|
| Full agreement (3/3 match) | 1.0 | All 3 responses convey the same meaning (semantic match) |
| Majority agreement (2/3 match) | 0.67 | 2 of 3 agree, 1 diverges |
| No agreement (all different) | 0.0 | All 3 responses are substantively different |

- Q1 (PURPOSE): all 3 identify the same core purpose (semantic, not lexical)
- Q2 (TOP_SECTIONS): overlap score = |intersection of all 3| / 3
- Q3 (MAIN_RISK): all 3 identify the same risk category
- Q4 (EXPECTED_OUTPUT): all 3 describe structurally similar output

**Consistency Score:**
```
B2 = mean(q1_agreement, q2_agreement, q3_agreement, q4_agreement)
```

**Interpretation:**
- B2 > 0.85 → HIGH consistency — the artifact is unambiguously structured
- B2 0.60-0.85 → MODERATE consistency — some sections are open to interpretation
- B2 < 0.60 → LOW consistency — the artifact is structurally ambiguous

**Display per-question comparison:**

```
Question                     Agreement   Detail
──────────────────────────── ─────────── ────────────────────────────────
Q1 PURPOSE                    1.00        3/3 agree
Q2 TOP_SECTIONS               0.67        2/3 sections overlap
Q3 MAIN_RISK                  1.00        3/3 agree
Q4 EXPECTED_OUTPUT            0.67        2/3 agree
                                  Mean:    0.84
```

No gate on B2 — consistency is informational and feeds into the aggregate score.

### Step 7: Layer B3 — Performance Metrics

**Purpose:** Quantify token efficiency and information density. Zero LLM cost.

**Metric 1 — Token Efficiency:**
```
token_efficiency = content_chars / (content_chars + formatting_chars)
```
Where `content_chars` = characters in prose and code blocks, and `formatting_chars` = characters in markdown formatting (headings, dividers, table pipes, bullets). Healthy range: 0.60–0.85.

**Metric 2 — Information Density:**
```
density_score = min(unique_concepts / (total_sections * 3), 1.0)
```
Where `unique_concepts` = count of distinct key terms/concepts (unique multi-word phrases in headings + bold text + table headers) and `total_sections` = count of `##` headings. Each section should introduce ~3 unique concepts.

**Metric 3 — Bloat Detection:**
```
avg_section_size = mean(section_sizes)
bloated_sections = sections where size > 3 * avg_section_size
bloat_ratio = count(bloated_sections) / total_sections
```
`bloat_ratio` of 0 is ideal; above 0.3 is problematic.

**Metric 4 — Redundancy Detection:**
```
repeated_phrases = phrases of 5+ words appearing 3+ times (excluding code blocks and table formatting)
redundancy_score = min(count(repeated_phrases) / total_sections, 1.0)
```
A score of 0 means no redundancy detected.

**Performance Score:**
```
B3 = mean(token_efficiency, density_score, 1 - bloat_ratio, 1 - redundancy_score)
```

**Display per-section metrics:**

```
Section                    Tokens   Concepts   vs Avg Size   Flag
─────────────────────────  ──────── ────────── ─────────────  ──────────
## Overview                 320      4          0.4x          OK
## Protocol                 1840     12         2.3x          OK
## Anti-Patterns            580      6          0.7x          OK
## Examples                 2900     4          3.6x          BLOATED
## Dependencies             210      3          0.3x          OK
```

### Step 8: Aggregate & Gate

> See **Agent Authoring Rule** in `SKILL.md` — write the skeleton first, then incremental `Edit` appends;
> never one giant `Write`.

The full benchmark report is written to a file section by section (header → per-layer blocks →
score → fix list). The B2 probe answers are the declared short-output exemption
(`modules/benchmark.md` § Probe Prompt), not a precedent for this report.

**BENCHMARK_SCORE formula:**
```
BENCHMARK_SCORE = B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20
```

**Weight rationale:**
- B0 (Golden Comparison) at 0.30 — structural conformance is the primary benchmark signal
- B1 (Test Suite) at 0.35 — deterministic correctness is the most reliable signal
- B2 (Consistency) at 0.15 — stability matters but is a secondary signal
- B3 (Performance) at 0.20 — efficiency matters for production artifacts

**Gate:**
- BENCHMARK_SCORE < 0.50 → **BLOCK** — do NOT proceed to TEST; return to BUILD with a prioritized fix list (maximum 2 automatic retries, then escalate to human). On retry, re-run only the deterministic layers (B0 + B1).
- BENCHMARK_SCORE 0.50-0.70 → **WARN** — proceed to TEST with an advisory flag (per-layer scores + top failures passed to the judges)
- BENCHMARK_SCORE > 0.70 → **PASS** — artifact meets benchmark standards; ready for TEST

Record `BENCHMARK_SCORE` for downstream consumption by `/bto-test` and `/bto`.

---

## Checkpoint

```
═══════════════════════════════════════════════════════
CHECKPOINT: BENCHMARK Complete
<promise>BTO_BENCHMARKED</promise>
Artifact: [path]
Type: [detected type]

Layer B0 (Golden):      X.XX — section coverage, ordering, proportions
Layer B1 (Test Suite):  X.XX — Y/Z tests passed
Layer B2 (Consistency): X.XX — agreement across 3 probes
Layer B3 (Performance): X.XX — token efficiency, density, bloat

BENCHMARK SCORE: X.XX [PASS / WARN / BLOCK]

• "ок" — proceed to TEST
• "покажи детали [B0/B1/B2/B3]" — expand layer details
• "пропусти тест" — skip TEST (if PASS)
═══════════════════════════════════════════════════════
```

Wait for user confirmation.

---

## Modular Usage

This command is also invoked internally by:
- `/bto` — as a pre-flight step before TEST phase (if benchmark module is loaded)
- `/bto-test` — optionally as a prerequisite gate (if user requests `benchmark` flag)

The `BENCHMARK_SCORE` is available to downstream commands:
- `/bto-test` may use it to calibrate Layer 1 expectations
- `/bto-optimize` may use it to set a structural baseline floor

## Critical Rules

- Layer B0 and B1 are fully deterministic — no LLM calls, zero cost
- Layer B2 uses haiku only — NEVER use sonnet or opus for consistency probes
- Agent tool is REQUIRED for Layer B2 — do not run probes sequentially
- Golden samples from `references/golden-samples.md` are the authoritative structural reference
- If golden sample does not exist for the detected type → skip B0 entirely and renormalize the remaining weights (B1/B2/B3) per the module's Partial Evaluation rule; log a warning
- Report `BENCHMARK_SCORE` explicitly so downstream commands can consume it
- The gate is on the aggregate `BENCHMARK_SCORE` only (Step 8) — there are no per-layer BLOCK gates at B0 or B1
- Layer B3 bloat detection is based on each section's size relative to the artifact's own average section size (no golden sample required)
- If "verbose" is in $ARGUMENTS, show expanded per-section diagnostics for all layers without prompting
