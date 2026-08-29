# Sample BTO Evaluation Report

> This file is a **reference example** showing the complete output format of a BTO TEST evaluation.
> Use it as the authoritative template when formatting evaluation reports.
>
> **Hypothetical subject:** `.claude/skills/data-pipeline-validator/` — a skill for validating ETL pipeline configurations.

---

## Report Header

```
╔══════════════════════════════════════════════════════════════╗
║           BTO EVALUATION REPORT — TEST MODULE               ║
╠══════════════════════════════════════════════════════════════╣
║  Artifact:      data-pipeline-validator (Skill)             ║
║  Path:          .claude/skills/data-pipeline-validator/     ║
║  Evaluated:     2026-03-01 14:32 UTC                        ║
║  Evaluator:     BTO TEST v1.2                               ║
║  Layers run:    Layer 0 + Layer 1 + Layer 2                 ║
╚══════════════════════════════════════════════════════════════╝

Authored by:  claude-opus (anthropic)
Judged by:    Expert=claude-sonnet | Critic=gpt-5.5 | Auditor=claude-sonnet
Cross-family: YES (Critic=openai — different family than the author)
```

The three provenance lines are emitted on **every** report, including clean ones. Had no second
family been reachable, the line would read `Cross-family: NO — see degradation notice` and the
verbatim `SAME-FAMILY PANEL` block from `modules/test.md` would follow it. The family axis is
advisory: it changes no score here and gates nothing.

---

## Layer 0: Deterministic Pre-Checks

**Artifact type:** Skill
**Applicable checks:** Universal (13) + Skill-specific (16) = 29 total

### Universal Checks (13 applicable)

| ID | Check | Result | Note |
|----|-------|--------|------|
| U-01 | File exists and is non-empty | PASS | SKILL.md: 8.4 KB |
| U-02 | UTF-8 encoding | PASS | |
| U-03 | Starts with `---` fence, then level-1 heading | PASS | `--- name: data-pipeline-validator ---` then `# Data Pipeline Validator` |
| U-04 | No placeholder text | FAIL | Found `[INSERT SCHEMA PATH HERE]` in modules/validate.md |
| U-05 | No empty sections | PASS | |
| U-06 | Consistent heading hierarchy | PASS | |
| U-07 | No broken internal cross-references | FAIL | `references/schema-types.md` referenced but missing |
| U-08 | File size within bounds | PASS | 8.4 KB (within 200B–100KB) |
| U-09 | No trailing whitespace | PASS | Auto-fixed during generation |
| U-10 | Standard Markdown only | PASS | |
| U-11 | Code blocks properly closed | PASS | |
| U-12 | No duplicate top-level sections | PASS | |
| U-13 | SKIPPED is not PASSED | PASS | All 13 universal checks executed; 0 inconclusive |

**Universal result: 11 / 13**

### Skill-Specific Checks (16 applicable)

| ID | Check | Result | Note |
|----|-------|--------|------|
| SK-01 | SKILL.md exists at skill root | PASS | |
| SK-02 | Has `## Overview` section | PASS | |
| SK-03 | Has `## Anti-Patterns` section | PASS | |
| SK-04 | Has Quick Start or usage example | PASS | Section present with 2 examples |
| SK-05 | `modules/` directory exists | PASS | |
| SK-06 | All modules referenced exist on disk | PASS | 3 modules, all present |
| SK-07 | `references/` directory exists | PASS | |
| SK-08 | All references referenced exist on disk | FAIL | `schema-types.md` missing (linked at line 47) |
| SK-09 | `examples/` directory exists | PASS | |
| SK-10 | At least one example file present | FAIL | Directory exists but is empty |
| SK-11 | Skill name matches directory name | PASS | |
| SK-12 | Has `## Dependencies` section | PASS | |
| SK-13 | SKILL.md size within skill bounds | PASS | 8.4 KB |
| SK-14 | Total directory size within bounds | PASS | 22 KB total |
| SK-15 | Each module has `# Title` heading | PASS | |
| SK-16 | No circular cross-references | PASS | |

**Skill-specific result: 13 / 16**

### Layer 0 Summary

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 0 PRE-FLIGHT CHECK
Artifact: data-pipeline-validator (Skill)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Preconditions:          ALL_GREEN
Universal checks:       11 / 13   (0 inconclusive)
Skill-specific checks:  13 / 16   (0 inconclusive)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  24 / 29   (executed: 29 of 29)
Pass rate:              82.8%
Status:                 PASS (threshold: 80%)

Failed checks:
  - [U-04]  Placeholder text in modules/validate.md line 23 *
  - [U-07]  Missing file: references/schema-types.md
  - [SK-08] Broken reference: schema-types.md (line 47 in SKILL.md)
  - [SK-10] Empty examples/ directory

(* = auto-fixable)

Verdict: PROCEED TO LAYER 1 (with noted issues logged)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Decision:** Layer 0 PASS (82.8% > 80%, denominator = checks EXECUTED, not declared). Flagged issues logged — will be reflected in Layer 1/2 scoring under CORRECTNESS and USABILITY dimensions.

---

## Layer 1: Single LLM Judge (Quick Mode)

**Model:** claude-haiku (cost-optimized)
**Purpose:** Rapid spot-check before committing to full 3-judge panel

**Judge Prompt Used:**
```
You are a Claude Code artifact evaluator. Rate the skill at the provided path
on 5 dimensions (1-10 each). Provide a score, one-sentence justification,
and top 3 improvement suggestions. Artifact type: Skill.
```

### Layer 1 Scores

| Dimension | Score | Justification |
|-----------|-------|---------------|
| CLARITY | 7 | Instructions are mostly clear but the validation protocol section has ambiguous branching logic at step 4 |
| COMPLETENESS | 6 | Missing example file and one broken reference significantly reduce perceived completeness |
| ACTIONABILITY | 7 | Core happy path is followable; failure paths are underspecified |
| QUALITY | 7 | Well-structured with good use of tables; prose in modules could be tighter |
| ANTI-PATTERNS | 8 | Anti-patterns section is thorough with 6 patterns, each with signals and fixes |

**Layer 1 Average: 7.0**
**Threshold: 7.0**
**Status: BORDERLINE PASS — proceed to Layer 2 for definitive evaluation**

**Layer 1 Top 3 Suggestions:**
1. Add at least one complete worked example showing a real ETL schema being validated end-to-end
2. Fix the broken `schema-types.md` reference or remove the link
3. Clarify the branching logic in step 4 of the validation protocol (what happens if schema is partially valid?)

---

## Layer 2: Full Judge Panel (3 Agents)

**Models:** claude-sonnet (all 3 judges)
**Rubric source:** `references/judge-rubrics.md`
**Execution:** Parallel (all 3 judges ran simultaneously)
**Aggregation:** Weighted average — Expert 0.4 / Critic 0.3 / Auditor 0.3

---

### Judge 1: Domain Expert

**Role:** Evaluates accuracy, depth, methodology, and domain fit.
**Calibration:** Balanced — scores represent genuine quality assessment.

| Dimension | Score | Expert Commentary |
|-----------|-------|-------------------|
| METHODOLOGY | 8 | The validation protocol follows a logical sequence: schema → types → constraints → relationships. The hierarchical validation approach is sound for ETL contexts. |
| DEPTH | 6 | Covers the primary validation scenarios (schema drift, type mismatches, null handling) but misses temporal consistency checks and incremental load edge cases — critical for production pipelines. |
| CORRECTNESS | 7 | All referenced validation patterns are real and applicable. The one broken reference (`schema-types.md`) is a quality concern but doesn't indicate incorrect claims. |
| USABILITY | 7 | Quick Start is useful. Navigation between SKILL.md and modules is smooth. The empty examples directory is a significant usability gap — users need a worked example. |
| ROBUSTNESS | 8 | Anti-patterns section is strong. Handles schema evolution, backwards compatibility, and partial validation failure. Missing: network timeout handling for remote schema fetches. |

**Expert subtotal: (8+6+7+7+8)/5 = 7.2**

---

### Judge 2: Critic

**Role:** Identifies gaps, weaknesses, anti-patterns, and edge cases.
**Calibration:** Strict — intentionally scores conservative to surface issues.

| Dimension | Score | Critic Commentary |
|-----------|-------|-------------------|
| METHODOLOGY | 6 | The protocol works for simple schemas but collapses under nested/recursive schema structures. Step 4 (constraint validation) assumes a flat schema model. No guidance on when to abort vs. continue validation after first failure. |
| DEPTH | 5 | No coverage of: streaming data validation, schema registry integration (Confluent, AWS Glue), or multi-source join validation. The "data types" coverage only addresses SQL types — no Avro, Parquet, or Arrow type systems. |
| CORRECTNESS | 6 | The placeholder `[INSERT SCHEMA PATH HERE]` in modules/validate.md (line 23) is a clear correctness failure — the skill was shipped incomplete. The claim about "99.9% detection rate" on line 31 has no source. |
| USABILITY | 5 | Zero examples is a dealbreaker for a validation skill. Users cannot learn by example. The broken reference creates a dead end. Anti-patterns section, while good, is buried at the end — should appear earlier as a pre-check. |
| ROBUSTNESS | 6 | Handles the happy path and common failures. No coverage of: what to do if the target system is unavailable, concurrent validation conflicts, or validation against evolving schemas mid-run. |

**Critic subtotal: (6+5+6+5+6)/5 = 5.6**

---

### Judge 3: Completeness Auditor

**Role:** Checks structure, coverage, cross-references, and actionability.
**Calibration:** Neutral — focuses on structural completeness, not quality of content.

| Dimension | Score | Auditor Commentary |
|-----------|-------|-------------------|
| METHODOLOGY | 7 | All required sections present in SKILL.md. Module structure follows conventions. Decision flow between modules is documented. Protocol steps are numbered and sequential. |
| DEPTH | 6 | 3 modules present: validate.md, report.md, fix-suggestions.md — reasonable coverage. However, no module for schema-registry integration or configuration management, which the skill description implies are supported. |
| CORRECTNESS | 6 | 2 structural correctness failures found: (1) broken reference to schema-types.md, (2) placeholder text in validate.md. These are Layer 0 failures that reached Layer 2 — the skill was not fully completed before evaluation. |
| USABILITY | 7 | Navigation is clear. Table of contents in SKILL.md maps correctly to modules. Quick Start section provides 2 invocation examples. Dependencies section complete. Loses points for missing examples. |
| ROBUSTNESS | 7 | Anti-patterns section documents 6 patterns. Failure modes section in validate.md covers 4 scenarios. Abort conditions defined. Minor gap: no documentation of what constitutes a "critical" vs. "warning" validation finding. |

**Auditor subtotal: (7+6+6+7+7)/5 = 6.6**

---

### Aggregated Scores (Weighted)

**Formula:** Expert (×0.4) + Critic (×0.3) + Auditor (×0.3)

| Dimension | Expert | Critic | Auditor | Weighted Score | Bar |
|-----------|--------|--------|---------|----------------|-----|
| METHODOLOGY | 8 | 6 | 7 | 7.1 | `███████░░░` |
| DEPTH | 6 | 5 | 6 | 5.7 | `█████▒░░░░` |
| CORRECTNESS | 7 | 6 | 6 | 6.4 | `██████░░░░` |
| USABILITY | 7 | 5 | 7 | 6.4 | `██████░░░░` |
| ROBUSTNESS | 8 | 6 | 7 | 7.1 | `███████░░░` |
| **OVERALL** | **7.2** | **5.6** | **6.6** | **6.5** | `██████▒░░░` |

**Bar legend:** `█` = full point, `▒` = half point, `░` = empty

**Overall weighted score: 6.5 / 10**
**Pass threshold: 7.0**
**Status: BELOW THRESHOLD**

---

### Disagreement Analysis

> Flag trigger: any dimension where `max - min > 3` across judges.

| Dimension | Max | Min | Range | Disagreement Flag |
|-----------|-----|-----|-------|-------------------|
| METHODOLOGY | 8 | 6 | 2 | None |
| DEPTH | 6 | 5 | 1 | None |
| CORRECTNESS | 7 | 6 | 1 | None |
| USABILITY | 7 | 5 | **2** | None (under threshold of 3) |
| ROBUSTNESS | 8 | 6 | 2 | None |

**No disagreement flags triggered.** Maximum range across all dimensions was 2 (USABILITY), below the trigger threshold of 3. Meta-judge not required.

**Interpretation:** The judges are aligned in their assessment. The Critic's USABILITY score of 5 reflects the empty examples directory — a structural deficiency all judges identified, but weighed differently. The Expert and Auditor judged the existing structure more charitably; the Critic penalized the missing examples more severely. This spread is within normal calibration variance.

---

### Meta-Judge Status

**Triggered:** NO
**Reason:** All dimension ranges within tolerance (max range: 2, threshold: 3)
**Action:** Proceed with weighted aggregation as final score.

---

## Top Improvements

Priority ordered by weighted impact on overall score.

### Priority 1 — Add a worked example (Impact: HIGH)
**Failing checks:** SK-10, Layer 1 suggestion 1, Critic USABILITY: 5, Auditor USABILITY: 7
**What to fix:** Create `examples/validate-postgres-to-s3.md` showing a complete validation run of a realistic PostgreSQL-to-S3 ETL pipeline: input schema, validation output, error report, and fix suggestions.
**Expected score improvement:** USABILITY +1.5 to +2.0 points

### Priority 2 — Create missing `references/schema-types.md` (Impact: HIGH)
**Failing checks:** U-07, SK-08, Critic CORRECTNESS: 6
**What to fix:** Create the referenced file with a type mapping table covering SQL, Avro, Parquet, and Arrow type systems. Remove the broken link if out of scope.
**Expected score improvement:** CORRECTNESS +0.8, DEPTH +0.5

### Priority 3 — Remove placeholder text (Impact: MEDIUM)
**Failing checks:** U-04, Critic CORRECTNESS: 6
**What to fix:** Replace `[INSERT SCHEMA PATH HERE]` in `modules/validate.md` line 23 with a concrete example path or a proper `$ARGUMENTS` reference.
**Expected score improvement:** CORRECTNESS +0.3

### Priority 4 — Expand depth for non-SQL type systems (Impact: MEDIUM)
**Failing checks:** Critic DEPTH: 5, Expert DEPTH: 6
**What to fix:** Add a module section or reference covering Avro, Parquet, and Arrow schemas. Add a note on schema registry integration (AWS Glue Data Catalog, Confluent Schema Registry).
**Expected score improvement:** DEPTH +1.0 to +1.5

### Priority 5 — Clarify critical vs. warning severity levels (Impact: LOW)
**Failing checks:** Auditor ROBUSTNESS partial
**What to fix:** Add a severity matrix to the validation output format — define which validation failures are CRITICAL (block pipeline) vs. WARNING (log and continue).
**Expected score improvement:** ROBUSTNESS +0.3

---

## Overall Verdict

```
╔══════════════════════════════════════════════════════════════╗
║                    FINAL VERDICT                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║   Artifact:    data-pipeline-validator (Skill)              ║
║   Score:       6.5 / 10                                     ║
║                                                              ║
║   Score breakdown:                                           ║
║   METHODOLOGY  ███████░░░  7.1                              ║
║   DEPTH        █████▒░░░░  5.7                              ║
║   CORRECTNESS  ██████░░░░  6.4                              ║
║   USABILITY    ██████░░░░  6.4                              ║
║   ROBUSTNESS   ███████░░░  7.1                              ║
║                ──────────                                    ║
║   OVERALL      ██████▒░░░  6.5                              ║
║                                                              ║
║   Verdict:     NEEDS IMPROVEMENT                            ║
║   Threshold:   7.0 (not met)                                ║
║                                                              ║
║   Recommended action:                                        ║
║   → Apply Priority 1-3 fixes (est. 30 min)                 ║
║   → Re-run /bto-test to verify improvement                  ║
║   → Do NOT run /bto-optimize until score ≥ 7.0             ║
║                                                              ║
║   Estimated score after Priority 1-3 fixes:  7.5 – 8.0     ║
╚══════════════════════════════════════════════════════════════╝
```

---

## Appendix: Judge Prompts Used

### Judge 1 (Domain Expert) Prompt

```
You are a Domain Expert evaluating a Claude Code skill artifact.
Your role: assess accuracy, depth, methodology, and domain fit.
Score each dimension 1-10 using the rubric in judge-rubrics.md.
Be balanced — reward genuine quality, penalize real gaps.

Artifact type: Skill
Artifact path: .claude/skills/data-pipeline-validator/

Dimensions to score:
1. METHODOLOGY — Is the approach sound and well-structured?
2. DEPTH — Is the content thorough enough for production use?
3. CORRECTNESS — Are claims accurate and instructions valid?
4. USABILITY — Can a practitioner effectively use this artifact?
5. ROBUSTNESS — Does it handle edge cases and failure modes?

Output: JSON with keys: methodology, depth, correctness, usability,
robustness, commentary_per_dimension, top_3_issues
```

### Judge 2 (Critic) Prompt

```
You are a strict Critic evaluating a Claude Code skill artifact.
Your role: find gaps, weaknesses, anti-patterns, and missing edge cases.
Score calibration: your scores should average around 5-6 (strict).
Do not reward potential — only reward what is actually present.

Artifact type: Skill
Artifact path: .claude/skills/data-pipeline-validator/

Dimensions to score:
1. METHODOLOGY — Where does the approach break down?
2. DEPTH — What important topics are missing?
3. CORRECTNESS — What is wrong, incomplete, or unverified?
4. USABILITY — Where will users get stuck?
5. ROBUSTNESS — What failure modes are unhandled?

Output: JSON with keys: methodology, depth, correctness, usability,
robustness, commentary_per_dimension, top_3_issues
```

### Judge 3 (Completeness Auditor) Prompt

```
You are a Completeness Auditor evaluating a Claude Code skill artifact.
Your role: check structural completeness, cross-reference integrity,
section coverage, and actionability.
Be neutral — focus on what is and is not present, not on quality of content.

Artifact type: Skill
Artifact path: .claude/skills/data-pipeline-validator/

Dimensions to score:
1. METHODOLOGY — Are all required protocol elements present?
2. DEPTH — Does the number and depth of sections match the scope?
3. CORRECTNESS — Are all cross-references valid and content accurate?
4. USABILITY — Is navigation clear and information findable?
5. ROBUSTNESS — Are failure modes and edge cases documented?

Output: JSON with keys: methodology, depth, correctness, usability,
robustness, commentary_per_dimension, top_3_issues
```

---

## Appendix: Raw Judge Output (JSON)

```json
{
  "evaluation_metadata": {
    "artifact": "data-pipeline-validator",
    "type": "skill",
    "timestamp": "2026-03-01T14:32:00Z",
    "bto_version": "1.2"
  },
  "layer_0": {
    "total": 28,
    "passed": 23,
    "pass_rate": 0.821,
    "status": "PASS",
    "failed_ids": ["U-04", "U-07", "SK-08", "SK-10"]
  },
  "layer_1": {
    "model": "claude-haiku",
    "scores": {
      "clarity": 7, "completeness": 6, "actionability": 7,
      "quality": 7, "anti_patterns": 8
    },
    "average": 7.0,
    "status": "BORDERLINE_PASS"
  },
  "layer_2": {
    "judges": {
      "expert": {
        "model": "claude-sonnet",
        "scores": { "methodology": 8, "depth": 6, "correctness": 7, "usability": 7, "robustness": 8 },
        "subtotal": 7.2
      },
      "critic": {
        "model": "claude-sonnet",
        "scores": { "methodology": 6, "depth": 5, "correctness": 6, "usability": 5, "robustness": 6 },
        "subtotal": 5.6
      },
      "auditor": {
        "model": "claude-sonnet",
        "scores": { "methodology": 7, "depth": 6, "correctness": 6, "usability": 7, "robustness": 7 },
        "subtotal": 6.6
      }
    },
    "weighted": {
      "methodology": 7.1, "depth": 5.7, "correctness": 6.4,
      "usability": 6.4, "robustness": 7.1, "overall": 6.5
    },
    "disagreement_flags": [],
    "meta_judge_triggered": false,
    "status": "BELOW_THRESHOLD"
  },
  "verdict": {
    "score": 6.5,
    "threshold": 7.0,
    "result": "NEEDS_IMPROVEMENT",
    "recommended_action": "apply_priority_fixes_then_retest"
  }
}
```
