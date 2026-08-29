# Sample BTO Benchmark Report

> This file is a **reference example** showing the complete output format of a BTO BENCHMARK evaluation.
> Use it as the authoritative template when formatting benchmark reports.
>
> **Hypothetical subject:** `.claude/skills/explore/` — the adaptive exploration/clarification skill used for task understanding.

---

## Report Header

```
╔══════════════════════════════════════════════════════════════╗
║          BTO BENCHMARK REPORT — BENCHMARK MODULE            ║
╠══════════════════════════════════════════════════════════════╣
║  Artifact:      explore (Skill)                             ║
║  Path:          .claude/skills/explore/                     ║
║  Evaluated:     2026-03-03 09:15 UTC                        ║
║  Evaluator:     BTO BENCHMARK v1.0                          ║
║  Layers run:    B-1 + B0 + B1 + B2 + B3                     ║
╚══════════════════════════════════════════════════════════════╝

Preconditions: ALL_GREEN
```

The `Preconditions:` line is printed on **every** report, ALL_GREEN runs included — an absent line
is itself a finding. See the INCONCLUSIVE counter-example at the end of this file for what the same
run looks like when a layer could not execute.

---

## Layer B-1: Environment Preconditions

| Precondition | Required by | Probe | Result |
|---|---|---|---|
| Artifact path readable + directory listing | B0, B1, B3 | `ls .claude/skills/explore/` | OK — 4 files |
| `golden-samples.md` has a `Skill` entry | B0 | grep the type heading | OK |
| Agent tool reachable inside the watchdog window | B2 | 1 haiku probe | OK — returned in 1.8 s |
| External tools used by B1 tests | B1 | `--version` | OK — none required for this type |

```
Preconditions: ALL_GREEN
```

**Decision:** all four layers may execute; no layer is INCONCLUSIVE; the composite score below is
computed over a complete set of layers and is therefore comparable to the gate thresholds.

---

## Layer B0: Golden Sample Comparison

**Artifact type:** Skill
**Golden sample source:** `references/golden-samples.md` → Skill template
**Comparison method:** Section tree structural alignment

### Section Coverage Analysis

| Golden Section | Status | Artifact Section | Size Ratio |
|----------------|--------|------------------|------------|
| `# [Skill Name]` | MATCH | `# Explore — Adaptive Clarification` | 0.9x |
| `## Overview` | MATCH | `## Overview` | 1.1x |
| `## When to Use` | MATCH | `## When to Use This Skill` | 1.3x |
| `## Protocol` | MATCH | `## Exploration Protocol` | 1.4x |
| `## Input / Output` | MATCH | `## Input / Output Contract` | 1.0x |
| `## Anti-Patterns` | MATCH | `## Anti-Patterns` | 0.9x |
| `## Dependencies` | MATCH | `## Dependencies` | 0.7x |
| `## Quick Start` | MATCH | `## Quick Start` | 1.2x |
| `## Configuration` | MISS | — | — |
| `## Error Handling` | MISS | — | — |
| `## Examples` | MATCH | `## Examples` | 0.8x |
| `## References` | MATCH | `## References` | 1.0x |

**Section Coverage:** 10 / 12 = 0.833

### Ordering Analysis

Matched sections ordering comparison against golden sample:

```
Golden order:    1  2  3  4  5  6  7  8  9  10
Artifact order:  1  2  3  4  5  6  7  8  —  10
```

Inversions detected: 0
Maximum possible inversions: 36

**Ordering Score:** 1.0 (perfect ordering of matched sections)

### Proportion Analysis

| Section | Golden Size | Artifact Size | Ratio | log|ratio| |
|---------|-------------|---------------|-------|------------|
| Overview | 280 tokens | 308 tokens | 1.10 | 0.095 |
| When to Use | 150 tokens | 195 tokens | 1.30 | 0.262 |
| Protocol | 920 tokens | 1288 tokens | 1.40 | 0.336 |
| Input/Output | 340 tokens | 340 tokens | 1.00 | 0.000 |
| Anti-Patterns | 420 tokens | 378 tokens | 0.90 | 0.105 |
| Dependencies | 180 tokens | 126 tokens | 0.70 | 0.357 |
| Quick Start | 200 tokens | 240 tokens | 1.20 | 0.182 |
| Examples | 350 tokens | 280 tokens | 0.80 | 0.223 |
| References | 160 tokens | 160 tokens | 1.00 | 0.000 |

Mean |log(ratio)|: 0.173

**Proportion Score:** 1 - 0.173 = 0.827

### Layer B0 Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER B0 GOLDEN SAMPLE COMPARISON
Artifact: explore (Skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Section coverage:    10 / 12         0.833
Ordering score:      0 inversions    1.000
Proportion score:    mean=0.173      0.827
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
B0 SCORE:  0.833 * 0.50 + 1.000 * 0.25 + 0.827 * 0.25
         = 0.417 + 0.250 + 0.207
         = 0.874

Missing sections:
  - ## Configuration (optional but recommended)
  - ## Error Handling (recommended for production skills)

Verdict: PROCEED TO B1 (0.874 > 0.30 threshold)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Decision:** B0 PASS (0.874 > 0.30 gate). Two missing sections noted — will influence B3 coverage metrics.

---

## Layer B1: Deterministic Test Suite

**Artifact type:** Skill
**Applicable checks:** Universal (13) + Skill-specific (16) = 29 total

### Universal Checks (13 applicable)

| ID | Check | Result | Note |
|----|-------|--------|------|
| U-01 | File exists and is non-empty | PASS | SKILL.md: 6.8 KB |
| U-02 | UTF-8 encoding | PASS | |
| U-03 | Starts with `---` fence, then level-1 heading | PASS | `--- name: explore ---` then `# Explore — Adaptive Clarification` |
| U-04 | No placeholder text | PASS | No `[TODO]`, `[TBD]`, or `<INSERT>` found |
| U-05 | No empty sections | PASS | All sections have content |
| U-06 | Consistent heading hierarchy | PASS | h1 → h2 → h3 consistently |
| U-07 | No broken internal cross-references | PASS | All referenced files exist |
| U-08 | File size within bounds | PASS | 6.8 KB (within 200B–100KB) |
| U-09 | No trailing whitespace | PASS | |
| U-10 | Standard Markdown only | PASS | No raw HTML detected |
| U-11 | Code blocks properly closed | PASS | 4 code blocks, all closed |
| U-12 | No duplicate top-level sections | PASS | |
| U-13 | SKIPPED is not PASSED | PASS | All 13 universal checks executed; 0 inconclusive |

**Universal result: 13 / 13**

### Skill-Specific Checks (16 applicable)

| ID | Check | Result | Note |
|----|-------|--------|------|
| SK-01 | SKILL.md exists at skill root | PASS | |
| SK-02 | Has `## Overview` section | PASS | |
| SK-03 | Has `## Anti-Patterns` section | PASS | 5 anti-patterns documented |
| SK-04 | Has Quick Start or usage example | PASS | 3 invocation examples |
| SK-05 | `modules/` directory exists | FAIL | No modules/ directory present |
| SK-06 | All modules referenced exist on disk | N/A | Skipped (no modules/ directory) |
| SK-07 | `references/` directory exists | PASS | |
| SK-08 | All references referenced exist on disk | PASS | 2 reference files, both exist |
| SK-09 | `examples/` directory exists | FAIL | No examples/ directory |
| SK-10 | At least one example file present | FAIL | No examples/ directory |
| SK-11 | Skill name matches directory name | PASS | `explore` matches |
| SK-12 | Has `## Dependencies` section | PASS | |
| SK-13 | SKILL.md size within skill bounds | PASS | 6.8 KB (within 1KB–50KB) |
| SK-14 | Total directory size within bounds | PASS | 14 KB total |
| SK-15 | Each module has `# Title` heading | N/A | Skipped (no modules/) |
| SK-16 | No circular cross-references | PASS | |

**Skill-specific result: 11 / 14 (2 N/A excluded)**

### Layer B1 Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER B1 DETERMINISTIC TEST SUITE
Artifact: explore (Skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Universal checks:       13 / 13
Skill-specific checks:  11 / 14
(2 checks N/A — excluded from total)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  24 / 27   (executed: 27; inconclusive: 0)
Pass rate:              0.889

Failed checks:
  - [SK-05]  modules/ directory does not exist
  - [SK-09]  examples/ directory does not exist
  - [SK-10]  No example files present

Verdict: PROCEED TO B2 (0.889 > 0.60 threshold)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Decision:** B1 PASS (0.889 > 0.60 gate, denominator = checks EXECUTED, 0 inconclusive). Missing directories noted — the skill inlines its logic in SKILL.md rather than using modules. This is a valid structural choice for simpler skills but costs points on SK-05/09/10.

---

## Layer B2: Consistency Probe

**Model:** claude-haiku (3 independent probes)
**Execution:** Parallel (all 3 probes ran simultaneously)
**Prompt:** Identical across all 3 agents

### Probe Prompt Used

```
You are evaluating a Claude Code artifact for structural quality.
Rate these 4 dimensions (0.0 to 1.0 each, two decimal places):
1. STRUCTURE — Does the artifact follow a clear, logical organization?
2. CLARITY — Are instructions unambiguous and actionable?
3. COVERAGE — Does it address all aspects implied by its title/scope?
4. CONSISTENCY — Is the internal terminology and style uniform?
Output as JSON: {"structure": X.XX, "clarity": X.XX, "coverage": X.XX, "consistency": X.XX}
```

### Probe Results

| Dimension | Probe 1 | Probe 2 | Probe 3 | Range | Agreement |
|-----------|---------|---------|---------|-------|-----------|
| STRUCTURE | 0.82 | 0.85 | 0.80 | 0.05 | 0.95 |
| CLARITY | 0.78 | 0.80 | 0.76 | 0.04 | 0.96 |
| COVERAGE | 0.72 | 0.68 | 0.74 | 0.06 | 0.94 |
| CONSISTENCY | 0.88 | 0.86 | 0.90 | 0.04 | 0.96 |
| **Mean** | **0.80** | **0.80** | **0.80** | **0.048** | **0.953** |

### Consistency Interpretation

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER B2 CONSISTENCY PROBE
Artifact: explore (Skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Probes:             3 / 3 completed
Mean agreement:     0.953
Stability band:     HIGH (> 0.85)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
B2 SCORE: 0.953

Interpretation:
  All 3 probes converged tightly on all 4 dimensions.
  Maximum range was 0.06 (COVERAGE) — within normal
  variance for haiku probes.

  The artifact is unambiguously structured. Evaluators
  consistently perceive the same quality level, indicating
  the instructions are clear and the organization is
  predictable.

  Weakest agreement: COVERAGE (0.94) — probes diverged
  slightly on whether the skill fully covers edge-case
  handling for nested clarification loops. This aligns
  with the B0 finding of missing ## Configuration and
  ## Error Handling sections.

Verdict: HIGH consistency — no structural ambiguity
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Decision:** B2 = 0.953. The artifact produces highly consistent evaluations across independent probes.

---

## Layer B3: Performance Metrics

**Purpose:** Token efficiency, information density, and bloat detection
**LLM cost:** Zero (fully deterministic)

### Metric 1 — Token Efficiency

| Component | Tokens |
|-----------|--------|
| Total tokens in artifact | 1,540 |
| Meaningful content tokens | 1,285 |
| Blank lines / decorative separators | 112 |
| Repeated boilerplate headers | 68 |
| Excessive whitespace | 75 |

**Token Efficiency:** 1,285 / 1,540 = **0.834**
**Target:** > 0.70 — **MET**

### Metric 2 — Information Density

| Section | Unique Concepts Introduced |
|---------|--------------------------|
| Overview | 4 (adaptive clarification, task decomposition, ambiguity detection, user intent) |
| When to Use | 3 (trigger conditions, scope boundaries, skip conditions) |
| Protocol | 8 (question generation, depth control, convergence check, iteration limit, confidence scoring, priority ranking, summary generation, handoff) |
| Input/Output | 3 (input format, output contract, variable binding) |
| Anti-Patterns | 5 (over-questioning, assumption-making, scope creep, premature convergence, ignoring signals) |
| Dependencies | 2 (upstream skills, downstream consumers) |
| Quick Start | 2 (invocation patterns, parameter passing) |
| Examples | 3 (banking example, retail example, edge case) |
| References | 2 (linked documents, external resources) |

**Total unique concepts:** 32
**Total sections:** 9
**Information Density:** 32 / 9 = **3.56 concepts/section**
**Target:** > 2.0 — **MET**

### Metric 3 — Bloat Detection

| Section | Artifact Size | Golden Size | Ratio | Flag |
|---------|---------------|-------------|-------|------|
| Overview | 308 tokens | 280 tokens | 1.10x | OK |
| When to Use | 195 tokens | 150 tokens | 1.30x | OK |
| Protocol | 1,288 tokens | 920 tokens | 1.40x | OK |
| Input/Output | 340 tokens | 340 tokens | 1.00x | OK |
| Anti-Patterns | 378 tokens | 420 tokens | 0.90x | OK |
| Dependencies | 126 tokens | 180 tokens | 0.70x | OK |
| Quick Start | 240 tokens | 200 tokens | 1.20x | OK |
| Examples | 280 tokens | 350 tokens | 0.80x | OK |
| References | 160 tokens | 160 tokens | 1.00x | OK |

Bloated sections (> 3.0x golden): **0**
Thin sections (< 0.2x golden): **0**
Redundant sections (> 30% overlap): **0**

**Bloat Score:** 1 - (0 + 0 + 0) / 9 = **1.000**

### Layer B3 Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER B3 PERFORMANCE METRICS
Artifact: explore (Skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Token efficiency:     1,285 / 1,540    0.834  (target > 0.70)
Information density:  32 / 9 sections  3.56   (target > 2.0)
Bloat detection:      0 flags          1.000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
B3 SCORE: 0.834 * 0.35 + normalize(3.56) * 0.35 + 1.000 * 0.30

normalize(3.56, 0, 4) = min(3.56 / 4, 1.0) = 0.890

B3 SCORE = 0.834 * 0.35 + 0.890 * 0.35 + 1.000 * 0.30
         = 0.292 + 0.312 + 0.300
         = 0.904

Notes:
  - Token efficiency is healthy at 0.834
  - Information density at 3.56 is above target —
    each section introduces meaningful new content
  - Zero bloat/thin/redundancy flags — well-proportioned
  - The Protocol section is the largest (1,288 tokens)
    but at 1.4x golden it is within acceptable bounds

Verdict: STRONG performance — no efficiency concerns
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Decision:** B3 = 0.904. The artifact is well-proportioned, dense with information, and free of bloat.

---

## Aggregate Score

### Scoring Formula

```
BENCHMARK_SCORE = B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20
```

### Computation

| Layer | Score | Weight | Contribution |
|-------|-------|--------|--------------|
| B0 (Golden Comparison) | 0.874 | 0.30 | 0.262 |
| B1 (Test Suite) | 0.889 | 0.35 | 0.311 |
| B2 (Consistency Probe) | 0.953 | 0.15 | 0.143 |
| B3 (Performance Metrics) | 0.904 | 0.20 | 0.181 |
| **BENCHMARK SCORE** | | **1.00** | **0.897** |

### Gate Evaluation

```
0.897 > 0.70 → PASS
```

---

## Identified Issues

Priority ordered by impact on benchmark score.

### Issue 1 — No `modules/` directory (Impact: MEDIUM)
**Failing checks:** SK-05
**Current state:** The explore skill inlines all logic in SKILL.md rather than decomposing into modules. For a skill of this complexity (~6.8 KB), inlining is acceptable but not ideal.
**Recommendation:** Extract the Protocol section into `modules/exploration-protocol.md` to align with the modular skill pattern. This would resolve SK-05 and improve B0 structural conformance.
**Expected B1 improvement:** +0.038 (1 additional check passes)

### Issue 2 — No `examples/` directory (Impact: MEDIUM)
**Failing checks:** SK-09, SK-10
**Current state:** The skill has an inline Examples section in SKILL.md but no standalone example files. The `/bto-test` sample report flagged the same pattern as a usability gap.
**Recommendation:** Create `examples/banking-exploration.md` with a complete worked example showing the exploration protocol applied to a banking domain case.
**Expected B1 improvement:** +0.077 (2 additional checks pass)

### Issue 3 — Missing `## Configuration` section (Impact: LOW)
**Failing at:** B0 coverage (golden sample expects this section)
**Current state:** The skill has no configurable parameters exposed. If configuration is not applicable, a brief note stating "This skill has no configurable parameters" would satisfy the structural expectation.
**Recommendation:** Add a minimal Configuration section or explicitly document that the skill is configuration-free.
**Expected B0 improvement:** +0.042 (section coverage 11/12)

### Issue 4 — Missing `## Error Handling` section (Impact: LOW)
**Failing at:** B0 coverage (golden sample expects this section)
**Current state:** Error handling is mentioned briefly in the Protocol section but not elevated to its own section.
**Recommendation:** Add a dedicated Error Handling section covering: what happens when the user provides contradictory requirements, when the exploration loop exceeds the iteration limit, and when confidence threshold is not met.
**Expected B0 improvement:** +0.042 (section coverage 12/12)

---

## Overall Verdict

```
╔══════════════════════════════════════════════════════════════╗
║                   BENCHMARK VERDICT                         ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   Artifact:    explore (Skill)                               ║
║   Path:        .claude/skills/explore/                       ║
║                                                              ║
║   Layer scores:                                              ║
║   B0 (Golden)       ████████▒░  0.874                       ║
║   B1 (Test Suite)   ████████▒░  0.889                       ║
║   B2 (Consistency)  █████████▒  0.953                       ║
║   B3 (Performance)  █████████░  0.904                       ║
║                     ──────────                               ║
║   BENCHMARK SCORE   ████████▒░  0.897                       ║
║                                                              ║
║   Verdict:     PASS                                          ║
║   Threshold:   0.70 (exceeded by +0.196)                    ║
║                                                              ║
║   Strengths:                                                 ║
║   + Excellent consistency (B2 = 0.953) — unambiguous         ║
║   + Strong performance metrics (B3 = 0.904) — no bloat      ║
║   + Perfect section ordering (Kendall tau = 0)               ║
║   + High information density (3.56 concepts/section)        ║
║                                                              ║
║   Areas for improvement:                                     ║
║   - Add modules/ directory for protocol decomposition        ║
║   - Add examples/ directory with worked examples             ║
║   - Add Configuration and Error Handling sections            ║
║                                                              ║
║   Recommended next step:                                     ║
║   → Artifact is benchmark-ready. Run /bto-test for full      ║
║     multi-judge evaluation.                                  ║
║   → Apply Issue 1-2 fixes first for optimal TEST score       ║
║                                                              ║
║   Estimated BENCHMARK after fixes:  0.93 – 0.95             ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Checkpoint Output (as displayed to user)

```
═══════════════════════════════════════════════════════
CHECKPOINT: BENCHMARK Complete
<promise>BTO_BENCHMARKED</promise>
Artifact: .claude/skills/explore/
Type: skill

Layer B0 (Golden):      0.874 — 10/12 sections matched, perfect ordering, proportional
Preconditions:          ALL_GREEN — all 4 layers executable
Layer B1 (Test Suite):  0.889 — 24/27 tests passed (3 structural: no modules/, no examples/)
Layer B2 (Consistency): 0.953 — high agreement across 3 probes (range 0.04-0.06)
Layer B3 (Performance): 0.904 — token efficiency 0.834, density 3.56, zero bloat

BENCHMARK SCORE: 0.897 [PASS]

• "ок" — proceed to TEST
• "покажи детали [B0/B1/B2/B3]" — expand layer details
• "пропусти тест" — skip TEST (if PASS)
═══════════════════════════════════════════════════════
```

---

## Appendix: Benchmark Context for TEST Judges

When `/bto-test` is run after a benchmark, the following context is made available to Layer 1 and Layer 2 judges for calibration purposes:

```
BENCHMARK CONTEXT (for judge reference):
- Golden Similarity: 0.874 — missing Configuration and Error Handling sections
- Test Pass Rate: 24/27 — missing modules/ and examples/ directories
- Consistency: 0.953 — high structural stability, no ambiguous sections
- Performance: 0.904 — healthy token efficiency, zero bloat detected
- Overall: 0.897 PASS — structurally sound, ready for semantic evaluation
```

This context helps judges calibrate expectations. A high benchmark score means the judges can focus on semantic quality rather than structural issues. A low benchmark score warns judges to expect structural deficiencies.

---

## Appendix: Raw Benchmark Output (JSON)

```json
{
  "benchmark_metadata": {
    "artifact": "explore",
    "type": "skill",
    "path": ".claude/skills/explore/",
    "timestamp": "2026-03-03T09:15:00Z",
    "bto_benchmark_version": "1.0"
  },
  "layer_b0": {
    "golden_sample_type": "skill",
    "section_coverage": {
      "matched": 10,
      "total": 12,
      "score": 0.833
    },
    "ordering": {
      "inversions": 0,
      "max_inversions": 36,
      "score": 1.0
    },
    "proportion": {
      "mean_log_ratio": 0.173,
      "score": 0.827
    },
    "b0_score": 0.874,
    "missing_sections": ["## Configuration", "## Error Handling"],
    "status": "PASS"
  },
  "layer_b1": {
    "total_checks": 29,
    "applicable_checks": 27,
    "executed_checks": 27,
    "inconclusive": 0,
    "passed": 24,
    "pass_rate": 0.889,
    "failed_ids": ["SK-05", "SK-09", "SK-10"],
    "na_ids": ["SK-06", "SK-15"],
    "b1_score": 0.889,
    "status": "PASS"
  },
  "layer_b2": {
    "model": "claude-haiku",
    "probe_count": 3,
    "probes": {
      "probe_1": {"structure": 0.82, "clarity": 0.78, "coverage": 0.72, "consistency": 0.88},
      "probe_2": {"structure": 0.85, "clarity": 0.80, "coverage": 0.68, "consistency": 0.86},
      "probe_3": {"structure": 0.80, "clarity": 0.76, "coverage": 0.74, "consistency": 0.90}
    },
    "agreement": {
      "structure": 0.95,
      "clarity": 0.96,
      "coverage": 0.94,
      "consistency": 0.96
    },
    "b2_score": 0.953,
    "stability_band": "HIGH",
    "status": "PASS"
  },
  "layer_b3": {
    "token_efficiency": {
      "total_tokens": 1540,
      "meaningful_tokens": 1285,
      "score": 0.834
    },
    "information_density": {
      "unique_concepts": 32,
      "total_sections": 9,
      "density": 3.56,
      "normalized": 0.890
    },
    "bloat_detection": {
      "bloated_sections": 0,
      "thin_sections": 0,
      "redundant_sections": 0,
      "score": 1.0
    },
    "b3_score": 0.904,
    "status": "PASS"
  },
  "aggregate": {
    "formula": "B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20",
    "contributions": {
      "b0": 0.262,
      "b1": 0.310,
      "b2": 0.143,
      "b3": 0.181
    },
    "benchmark_score": 0.897,
    "threshold": 0.70,
    "gate": "PASS"
  },
  "issues": [
    {
      "priority": 1,
      "title": "No modules/ directory",
      "failing_checks": ["SK-05"],
      "expected_improvement": 0.038
    },
    {
      "priority": 2,
      "title": "No examples/ directory",
      "failing_checks": ["SK-09", "SK-10"],
      "expected_improvement": 0.077
    },
    {
      "priority": 3,
      "title": "Missing ## Configuration section",
      "failing_checks": [],
      "expected_improvement": 0.042
    },
    {
      "priority": 4,
      "title": "Missing ## Error Handling section",
      "failing_checks": [],
      "expected_improvement": 0.042
    }
  ]
}
```

---

## Counter-Example: the same run, INCONCLUSIVE

The worked example above is ALL_GREEN. This is what the identical artifact looks like when one
requested layer could not execute — included because the INCONCLUSIVE verdict is only worth having
if a reader has seen one.

```
Preconditions: DEGRADED(B2: agent tool unreachable — probe timed out at 180 s)
```

```
===============================================================
BTO BENCHMARK REPORT
Artifact: .claude/skills/explore/
Type: skill
Preconditions: DEGRADED(B2)
===============================================================

LAYER B-1 -- Environment Preconditions     DEGRADED
  Degraded:   B2 — agent tool unreachable, probe timed out

LAYER B0  -- Golden Sample Comparison       0.874
LAYER B1  -- Deterministic Test Suite       0.889   (24/27 executed, 0 inconclusive)
LAYER B2  -- Consistency Probe              INCONCLUSIVE  (requested, could not run)
LAYER B3  -- Performance Metrics            0.904

===============================================================
BENCHMARK SCORE:  not computed

  B2 was REQUESTED and could not run. Its 0.15 weight is NOT renormalized
  away — doing so would redistribute it to the three layers that happened
  to succeed, which can only raise the number. There is no score to compare
  against the 0.70 gate.

Gate: INCONCLUSIVE
===============================================================

What could not run, and why:
  - B2 Consistency Probe — agent tool unreachable (probe timed out at 180 s)

Next step: restore agent-tool reachability and re-run, or re-run with
`--level B0` to request a deliberately partial evaluation (that IS
renormalized, because the operator asked for it).

Recommendation: DO NOT PROCEED TO TEST — INCONCLUSIVE is not a pass.
===============================================================
```

The distinction that makes this honest: `--level B0` is an **operator-requested** partial run and its
remaining weights ARE renormalized; B2 above was requested and *failed to execute*, so it is
INCONCLUSIVE and is never renormalized away. Both branches are spelled out in
`modules/benchmark.md` § Partial Evaluation.
