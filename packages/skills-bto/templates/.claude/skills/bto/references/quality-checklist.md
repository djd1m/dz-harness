# Pre-Flight Quality Checklist — Claude Code Artifacts

> Deterministic Layer 0 checks. Run before any LLM evaluation. Free, fast, catches ~60% of issues.
> Pass rate threshold: **≥ 80%** to proceed to Layer 1/2 evaluation.

---

## How to Use This Checklist

1. Identify artifact type (Skill / Command / Rule / Agent Template / Research Artifact)
2. Run **Universal Checks** (apply to all types)
3. Run the **type-specific section**
4. Count: `pass_rate = passed / total_applicable`
5. If `pass_rate < 0.80` → return to BUILD phase, fix issues, re-check

**Auto-fixable items** (marked `YES`) can be fixed programmatically without human review.
**Non-auto-fixable items** (marked `NO`) require human or LLM-assisted review.

---

## Section 1 — Universal Checks (All Artifact Types)

> These checks apply regardless of artifact type. All are required.

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| U-01 | File exists and is non-empty | File size > 0 bytes | Missing file or 0-byte file | NO |
| U-02 | UTF-8 encoding | Valid UTF-8, no BOM | Encoding errors, binary content | YES |
| U-03 | Starts with a `---` frontmatter fence, then a level-1 heading | First non-blank line is `# ...` **or** a `---` frontmatter fence whose closing `---` is followed by the `# ...` heading | Neither a fence nor a `# ...` heading first; or a fence that is never closed; or a fence not followed by an H1 | YES |
| U-04 | No placeholder text remaining | No occurrences of `TODO`, `FIXME`, `[INSERT`, `<YOUR_`, `...` (as placeholder) | Any placeholder found | NO |
| U-05 | No empty sections | No heading immediately followed by another heading (without content) | Empty section found | NO |
| U-06 | Consistent heading hierarchy | Headings increment by 1 level (no jump from `##` to `####`) | Skipped heading level | YES |
| U-07 | No broken internal cross-references | All referenced filenames exist on disk | Referenced file not found | NO |
| U-08 | File size within bounds | 200 bytes ≤ size ≤ 100 KB (single file) | Under 200B (stub) or over 100KB (bloated) | NO |
| U-09 | No trailing whitespace on lines | All lines trimmed | Lines with trailing spaces/tabs | YES |
| U-10 | Uses standard Markdown (no raw HTML) | No `<div>`, `<span>`, `<table>` tags | HTML tags present | NO |
| U-11 | Code blocks are properly closed | Every ` ``` ` open has a matching ` ``` ` close | Unclosed code block | YES |
| U-12 | No duplicate top-level sections | All `## Heading` names are unique within the file | Duplicate heading names | NO |
| U-13 | SKIPPED is not PASSED | Every non-executed check is reported as INCONCLUSIVE, naming what could not run and why | A skipped, absent, or unrunnable check counted toward the pass rate, or silently omitted | NO |

**Universal checks total: 13**

> U-13 governs the other twelve: the pass rate's denominator is the checks that actually
> **executed**, and any INCONCLUSIVE check makes the layer verdict INCONCLUSIVE regardless of the
> ratio. See `modules/benchmark.md` → **Layer B-1: Environment Preconditions**.

---

## Section 2 — Skill-Specific Checks

> Apply when artifact type is a **Skill** (directory with SKILL.md).

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| SK-01 | `SKILL.md` exists at skill root | File present at `.claude/skills/<name>/SKILL.md` | Missing SKILL.md | NO |
| SK-02 | Has `## Overview` section | Section `## Overview` present | Missing overview | NO |
| SK-03 | Has `## Anti-Patterns` section | Section `## Anti-Patterns` present | Anti-patterns section absent | NO |
| SK-04 | Has at least one `## Quick Start` or usage example | Section `## Quick Start`, `## Usage`, or code block with invocation | No invocation example | NO |
| SK-05 | `modules/` directory exists | Directory `.claude/skills/<name>/modules/` present | No modules directory | YES |
| SK-06 | Every module referenced in SKILL.md exists on disk | All filenames in `modules/` references resolve | Broken module reference | NO |
| SK-07 | `references/` directory exists | Directory `.claude/skills/<name>/references/` present | No references directory | YES |
| SK-08 | Every reference referenced in SKILL.md exists on disk | All filenames in `references/` references resolve | Broken reference | NO |
| SK-09 | `examples/` directory exists | Directory `.claude/skills/<name>/examples/` present | No examples directory | YES |
| SK-10 | At least one example file present | ≥1 file in examples/ | Empty examples directory | NO |
| SK-11 | Skill name in heading matches directory name | `# <Name>` roughly matches `skills/<name>/` | Name mismatch | YES |
| SK-12 | Has `## Dependencies` section (or explicitly states none) | Section present or "no dependencies" stated | Undocumented dependencies | NO |
| SK-13 | SKILL.md size within skill bounds | 2 KB ≤ SKILL.md ≤ 50 KB | Too small (stub) or too large (monolith) | NO |
| SK-14 | Total skill directory size within bounds | Total ≤ 200 KB | Oversized skill (likely includes binaries) | NO |
| SK-15 | Each module file has its own `# Title` heading | First non-blank line in every module is `# ...` | Module missing title | YES |
| SK-16 | No circular cross-references between skill files | No file references itself | Self-reference loop | NO |

**Skill-specific checks total: 16**

---

## Section 3 — Command-Specific Checks

> Apply when artifact type is a **Command** (single `.md` file in `.claude/commands/`).

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| CM-01 | File located in `.claude/commands/` | Correct directory | Wrong location | NO |
| CM-02 | References `$ARGUMENTS` | String `$ARGUMENTS` appears in file | No argument handling | NO |
| CM-03 | Has checkpoint protocol or defers to checkpoint rule | Section mentioning checkpoint or explicit link to checkpoint-protocol rule | No checkpoint mentioned | NO |
| CM-04 | Has at least one skill loading instruction | Contains `Read .claude/skills/` or equivalent | No skill loading | NO |
| CM-05 | Has a usage line (how to invoke) | Contains usage pattern like `` /command-name [args] `` | No usage line | NO |
| CM-06 | Has at least one invocation example | Code block or `` `example` `` of actual invocation | No example | NO |
| CM-07 | Phase-specific commands reference correct phase number | Phase N command mentions Phase N consistently | Phase number mismatch | NO |
| CM-08 | Agent usage (if any) follows agent-swarm rules | Agent spawning uses naming convention from agent-swarm.md | Non-compliant agent naming | NO |
| CM-09 | File size within command bounds | 500 bytes ≤ size ≤ 20 KB | Too small (stub) or too large | NO |
| CM-10 | Output artifact paths are inside `researches/<slug>/` | All artifact paths reference `researches/` directory | Paths outside research scope | NO |
| CM-11 | Has error/fallback handling for missing arguments | Specifies behavior when `$ARGUMENTS` is empty | No empty-argument handling | NO |

**Command-specific checks total: 11**

---

## Section 4 — Rule-Specific Checks

> Apply when artifact type is a **Rule** (file in `.claude/rules/`).

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| RL-01 | File located in `.claude/rules/` | Correct directory | Wrong location | NO |
| RL-02 | Contains a detection signal for each pattern | Each pattern row has a "signal" or "detection" column | Patterns without signals | NO |
| RL-03 | Contains a fix/remedy for each pattern | Each pattern row has "fix", "remedy", or "action" | Patterns without fixes | NO |
| RL-04 | Uses table format for patterns | Markdown table with ≥2 columns present | Unstructured list only | YES |
| RL-05 | Minimum pattern coverage | ≥3 distinct patterns listed | Fewer than 3 patterns | NO |
| RL-06 | No vague patterns | Each pattern is specific and detectable, no "general sloppiness" | Vague or unmeasurable patterns | NO |
| RL-07 | Has blocking or non-blocking designation | Each pattern marked as block/warn/flag or severity noted | No severity indication | NO |
| RL-08 | Auto-detection instructions present | Section or note on how to auto-detect patterns | No auto-detection guidance | NO |
| RL-09 | File size within rule bounds | 200 bytes ≤ size ≤ 10 KB | Too small or too large | NO |

**Rule-specific checks total: 9**

---

## Section 5 — Agent Template-Specific Checks

> Apply when artifact type is an **Agent Template** (file describing an agent configuration).

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| AT-01 | Agent purpose is clearly stated in one sentence | First paragraph or overview states agent goal unambiguously | Vague or missing purpose | NO |
| AT-02 | Model selection is specified and justified | Explicit model name (haiku/sonnet/default) with reason | No model specified | NO |
| AT-03 | Agent isolation scope is defined | Specifies which files/directories agent may read and write | No scope defined | NO |
| AT-04 | Output format is specified | Describes expected output structure, keys, or format | No output format | NO |
| AT-05 | Timeout or cost bounds defined | Specifies max duration, max tokens, or cost cap | No bounds defined | NO |
| AT-06 | Failure protocol defined | Specifies behavior on error, timeout, or unexpected output | No failure protocol | NO |
| AT-07 | No conflicts with other agents in same pipeline | Does not claim exclusive access to resources other agents use | Resource conflicts found | NO |
| AT-08 | Integration protocol specified | Describes how orchestrator collects and uses agent output | No integration guidance | NO |
| AT-09 | Naming convention followed | Agent name follows `Phase N [Role]` or descriptive convention | Non-standard name | YES |
| AT-10 | Has at least one example invocation via Agent tool | Shows how to call this agent using Claude's Agent tool | No invocation example | NO |

**Agent template-specific checks total: 10**

---

## Section 6 — Research Artifact Checks

> Apply when artifact type is a **Research Artifact** (files like `00_product_discovery.md`, `02_research_findings.md`, etc.).

| ID | Check | Pass Criteria | Fail Criteria | Auto-fixable |
|----|-------|---------------|---------------|--------------|
| RA-01 | Located inside `researches/<slug>/` | Correct directory structure | File in project root or wrong location | NO |
| RA-02 | Numbered prefix matches phase | File name starts with correct phase number (00_, 01_, etc.) | Wrong or missing phase prefix | YES |
| RA-03 | Has executive summary or TL;DR section | Section `## Summary`, `## TL;DR`, or `## Executive Summary` present | No summary section | NO |
| RA-04 | All factual claims have source attribution | Every statistic and factual claim ends with `— Source: [...]` | Unsourced claims found | NO |
| RA-05 | No [UNVERIFIED] tags in final artifact | String `[UNVERIFIED]` absent in completed artifact | Unverified claims remain | NO |
| RA-06 | Self-generated analysis is marked | LLM analysis sections labeled `[ANALYSIS]` | Unlabeled LLM-generated analysis | NO |
| RA-07 | No hallucinated company or product names | All named companies/products verified to exist | Fabricated entities | NO |
| RA-08 | Regulatory references cite actual laws | Law/standard references include number (e.g., ФЗ-152, ISO 27001) | Vague regulatory references | NO |
| RA-09 | Competitive analysis includes real competitors | Named competitors are real, operating organizations | Fake or outdated competitors | NO |
| RA-10 | KPIs and metrics are specific and quantified | Metrics include baseline and target numbers | Vague metrics ("improve efficiency") | NO |
| RA-11 | Has a limitations or confidence section | Section noting research limitations, gaps, or confidence levels | No caveats or limitations | NO |
| RA-12 | Date of research noted | File contains creation or research date | No date context | YES |
| RA-13 | Phase artifact created during its phase | Timestamp of file creation matches expected phase window | Deferred creation | NO |

**Research artifact checks total: 13**

---

## Scoring Summary

### Calculation

```
total_applicable  = Universal (12) + type-specific checks
passed            = count of checks that PASS
pass_rate         = passed / total_applicable
```

### Thresholds

| Pass Rate | Status | Action |
|-----------|--------|--------|
| ≥ 90% | EXCELLENT | Proceed to Layer 1/2 with high confidence |
| 80% – 89% | PASS | Proceed to Layer 1/2 evaluation |
| 60% – 79% | CONDITIONAL | Fix auto-fixable items, re-check before Layer 1 |
| < 60% | FAIL | Return to BUILD phase — do not evaluate yet |

### Score Report Format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 0 PRE-FLIGHT CHECK
Artifact: <name> (<type>)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Universal checks:       X / 12
Type-specific checks:   X / N
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TOTAL:                  X / (12+N)
Pass rate:              XX%
Status:                 PASS | FAIL | CONDITIONAL

Failed checks:
  - [ID] Description of failure
  - [ID] Description of failure
  (auto-fixable marked with *)

Verdict: [PROCEED TO LAYER 1] | [FIX AND RE-CHECK] | [RETURN TO BUILD]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Quick Reference — Check ID Index

| Range | Section |
|-------|---------|
| U-01 to U-12 | Universal (all types) |
| SK-01 to SK-16 | Skill-specific |
| CM-01 to CM-11 | Command-specific |
| RL-01 to RL-09 | Rule-specific |
| AT-01 to AT-10 | Agent template-specific |
| RA-01 to RA-13 | Research artifact-specific |

---

## Maintenance Notes

- This checklist is **domain-agnostic** and applies to any IT project using the Claude Code skill/command/rule/agent architecture.
- When adding new artifact types, add a new section following the same table format (ID / Check / Pass Criteria / Fail Criteria / Auto-fixable).
- Review and update thresholds after every 50 evaluations to calibrate against real-world pass rates.
- Auto-fixable items should be addressed by the BUILD module before outputting an artifact.
