# Golden Samples -- Reference Structures for Benchmarking

## Purpose

Defines the expected structural patterns for each artifact type. Used by Layer B0 (Golden Sample Comparison) in the BENCHMARK module to score structural conformance. Each artifact type has: required sections in expected order, expected proportional sizing, quality indicators, and common structural anti-patterns.

---

## Skill Golden Sample

### Expected Sections (in order)

| # | Section Heading | Required | Expected Proportion | Fuzzy Matches |
|---|----------------|----------|---------------------|---------------|
| 1 | `--- name/description frontmatter ---` | Yes | <1% | -- |
| 2 | `# Title` | Yes | 1-2% | -- |
| 3 | Trust Tier comment (`<!-- Trust Tier: ... -->`) | Yes | <1% | -- |
| 4 | `> One-line description` (blockquote) | Yes | 1-2% | -- |
| 5 | `## Overview` | Yes | 5-15% | "Purpose", "Introduction", "About" |
| 6 | `## Modules` (table) | If multi-module | 3-8% | "Components", "Architecture" |
| 7 | `## Quick Start` | Yes | 3-8% | "Usage", "Getting Started", "How to Use" |
| 8 | Module detail sections (`## Module N: Name`) | Yes | 40-60% (total) | -- |
| 9 | `## Integration` | Optional | 5-10% | "Integration with ...", "Usage in Pipeline" |
| 10 | `## Anti-Patterns` | Yes | 5-15% | "Common Mistakes", "Pitfalls" |
| 11 | `## Dependencies` | Yes | 2-5% | "Requirements", "Prerequisites" |

> The frontmatter row is **scored by CHECK-S0 / TEST-SK0, and is excluded from `sections_expected`**.
> Layer B0 parses `##` headings; a `---` fence is not a `##` heading, so counting it here would move a
> currently-conformant skill from `7/7` to `7/8` and depress `GOLDEN_SIMILARITY` for artifacts that did
> nothing wrong. It is documented here, where a reader looks for structure, and scored where the
> property is deterministic.

**Total required sections: 7** (excluding optional, conditional, and the separately-scored fence)

### Structural Patterns (Quality Indicators)

- **Title matches directory name:** `# BTO` in `.claude/skills/bto/SKILL.md`
- **Trust Tier declared:** HTML comment with tier number and path to promotion
- **Modules table links to files:** Each row in `## Modules` table corresponds to a real file in `modules/`
- **Module detail sections have consistent structure:** Each `## Module N` contains: Goal (1 sentence), Protocol (numbered steps), Output format (code block or template)
- **Anti-patterns table is actionable:** Minimum 3 rows, each with both a problem description and a concrete fix
- **Quick Start has invocation examples:** Code blocks showing actual command usage (e.g., `/bto [path]`)
- **Dependencies list is specific:** References exact file paths, not vague descriptions
- **Section separators used:** `---` between major sections for visual clarity
- **Code blocks are labeled:** Use language hints (e.g., ` ```json `, ` ```markdown `)

### Expected Directory Structure

```
.claude/skills/<name>/
  SKILL.md                  <- 2-50 KB
  modules/                  <- 1+ files
    <module-name>.md        <- 1-30 KB each
  references/               <- 1+ files
    <reference-name>.md     <- 0.5-20 KB each
  examples/                 <- 1+ files
    <example-name>.md       <- 0.2-10 KB each
```

### Structural Anti-Patterns

| Anti-Pattern | Signal | Severity |
|-------------|--------|----------|
| `SKILL.md` does not begin with a `---` fence | `dz list` fails for the ENTIRE skills tree, not just this skill; the skill is unloadable | High -- blocks registration |
| No `## Overview` or `## Purpose` | Reader cannot understand skill purpose at a glance | High -- blocks comprehension |
| Module files exist but unreferenced in SKILL.md | Orphaned modules that may be outdated or dead code | Medium -- maintenance risk |
| Anti-patterns section empty or <3 entries | Skill lacks failure mode coverage | Medium -- robustness gap |
| No `examples/` directory | No concrete reference for expected behavior | Medium -- ambiguity risk |
| Single monolithic SKILL.md >30 KB without modules | Skill is too large to parse effectively | High -- usability problem |
| Proportion imbalance: one section >60% of total | Content distribution suggests poor decomposition | Medium -- consider splitting |
| Quick Start has no code blocks | User cannot see concrete invocation examples | Low -- convenience issue |
| Dependencies reference non-existent files | Broken dependency chain will cause runtime failures | High -- functional error |

---

## Command Golden Sample

### Expected Sections (in order)

| # | Section Heading | Required | Expected Proportion | Fuzzy Matches |
|---|----------------|----------|---------------------|---------------|
| 1 | `# /command-name -- Description` | Yes | 1-3% | -- |
| 2 | `## Usage` (code block with invocation) | Yes | 2-4% | "How to Use", "Invocation" |
| 3 | `## Parameters` | Yes | 3-6% | "Arguments", "Input", "$ARGUMENTS" |
| 4 | `## Protocol` | Yes | 50-70% | "Steps", "Procedure", "Pipeline" |
| 5 | Protocol steps (`### Step N: Name`) | Yes | (within Protocol) | "Phase N", "Stage N" |
| 6 | Checkpoint banner (code block with `===`) | Yes | 5-10% | -- |
| 7 | `## Skill Loading` | Optional | 2-5% | (may be inline in Protocol) |
| 8 | `## Critical Rules` | Yes | 5-12% | "Rules", "Constraints", "Important", "Guardrails" |
| 9 | `## Modular Usage` | Optional | 3-6% | "Standalone Phases", "Partial Execution" |

**Total required sections: 6** (excluding optional)

### Structural Patterns (Quality Indicators)

- **Protocol has numbered steps:** Each step is `### Step N:` or `1. 2. 3.` with at least 3 steps
- **Each step has explicit actions:** Uses imperative verbs: "Read", "Execute", "Display", "Create", "Validate"
- **Checkpoint banner is well-formed:** Contains divider lines (`===`), phase name, promise tag, and at least 3 user response options ("ok", feedback, elaboration)
- **$ARGUMENTS has validation:** Explicit handling for empty/missing input case
- **At least one skill loading instruction:** Pattern: `Read .claude/skills/<name>/SKILL.md`
- **Critical rules use imperative language:** "NEVER", "ALWAYS", "MUST", "DO NOT"
- **Output files are specified:** Lists which files will be created and where
- **Time budget mentioned:** Phase has an allocated percentage or time estimate

### Structural Anti-Patterns

| Anti-Pattern | Signal | Severity |
|-------------|--------|----------|
| No step-by-step protocol | Instructions are unstructured prose blocks | High -- unexecutable |
| Missing checkpoint banner | No pause point for user validation | High -- violates checkpoint protocol |
| No input validation for `$ARGUMENTS` | Empty input causes undefined behavior | Medium -- robustness gap |
| Critical rules section absent | No guardrails against misuse | Medium -- risk of drift |
| No skill loading instruction | Command operates in isolation without skill context | Medium -- quality risk |
| Protocol steps lack output specification | Agent does not know what to produce at each step | Medium -- ambiguity |
| More than 10 protocol steps | Overly complex command that should be split | Low -- complexity smell |
| Checkpoint has fewer than 3 response options | User has limited control over flow | Low -- usability gap |

---

## Rule Golden Sample

### Expected Sections (in order)

| # | Section Heading | Required | Expected Proportion | Fuzzy Matches |
|---|----------------|----------|---------------------|---------------|
| 1 | `# Rule Name` | Yes | 1-2% | -- |
| 2 | Purpose/context paragraph | Yes | 5-12% | "Overview", "When This Applies", "Scope" |
| 3 | Main pattern table | Yes | 35-55% | "Patterns", "Forbidden Patterns", "Detection Rules" |
| 4 | Pattern detail sections | Optional | 15-30% | Subsections expanding individual patterns |
| 5 | `## Auto-Detection` | Yes | 5-12% | "Self-Check", "When Generating Content", "Enforcement" |
| 6 | Additional guidelines | Optional | 5-15% | "Notes", "Exceptions", "Edge Cases" |

**Total required sections: 4** (excluding optional)

### Structural Patterns (Quality Indicators)

- **Pattern table has 3 columns minimum:** Pattern (or Anti-Pattern) | Detection Signal | Required Fix (or Action)
- **Each pattern is specific:** References observable behaviors, not vague qualities
- **At least 3 patterns defined:** Meaningful coverage of the rule's domain
- **Detection signals are testable:** An agent can determine pass/fail without subjective judgment
- **Fixes are actionable:** Each fix describes a concrete step, not "improve it" or "do better"
- **Auto-detection section gives self-check protocol:** Tells the agent HOW to check its own output against these patterns
- **At least one concrete example:** Inline code, quoted text, or "e.g., ..." illustrating a pattern
- **Severity indicators present:** Each pattern marked as BLOCK, WARN, or FLAG (or equivalent)

### Structural Anti-Patterns

| Anti-Pattern | Signal | Severity |
|-------------|--------|----------|
| Pattern table has <3 rows | Insufficient coverage for meaningful rule | High -- ineffective rule |
| Detection signals are vague | "Looks wrong", "Not good enough", "Feels off" | High -- untestable |
| Fixes are generic | "Fix it", "Improve quality", "Do better" | High -- unactionable |
| No auto-detection section | Agent cannot self-apply the rule | Medium -- requires manual enforcement |
| All patterns are prohibitions | No positive guidance on what TO do | Medium -- one-sided |
| No concrete examples | Abstract patterns without grounding | Medium -- interpretation risk |
| Missing severity levels | Cannot prioritize which patterns are blockers vs. advisories | Low -- triage difficulty |
| Rule file exceeds 10 KB | Likely over-specified; consider splitting into multiple rule files | Low -- maintainability |

---

## Agent Template Golden Sample

### Expected Sections (in order)

| # | Section Heading | Required | Expected Proportion | Fuzzy Matches |
|---|----------------|----------|---------------------|---------------|
| 1 | `# Agent Name` | Yes | 1-2% | -- |
| 2 | `## Purpose` | Yes | 5-10% | "Goal", "Objective", "Mission" |
| 3 | `## Configuration` | Yes | 10-18% | "Setup", "Parameters", "Settings" |
| 4 | `## Prompt Template` | Yes | 35-50% | "Instructions", "System Prompt", "Agent Prompt" |
| 5 | `## Output Format` | Yes | 8-15% | "Response Format", "Expected Output", "Return Format" |
| 6 | `## Error Handling` | Yes | 5-12% | "Fallback", "Failure Protocol", "Edge Cases" |
| 7 | `## Integration` | Optional | 5-10% | "How to Use", "Orchestrator Protocol", "Invocation" |

**Total required sections: 6** (excluding optional)

### Structural Patterns (Quality Indicators)

- **Model explicitly specified:** One of: haiku, sonnet, opus, or "default" -- appears in Configuration
- **Isolation scope defined:** Specifies which files/directories the agent MAY read and write, or states "read-only"
- **Prompt template uses structured output:** JSON schema, markdown template, labeled sections, or key-value pairs
- **Output format has concrete example:** Code block showing actual expected output
- **Error handling covers 3 scenarios minimum:** timeout, invalid input, empty/no result
- **Naming convention followed:** Agent name follows project standards (e.g., "Phase N [Role]", "BTO Judge -- [Role]", "Background Worker: [type]")
- **Cost bounds specified:** Max tokens, max duration, or cost cap mentioned in Configuration
- **Integration section shows invocation:** Code block or description of how the orchestrator spawns and collects from this agent

### Expected Configuration Block

```
## Configuration

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Model | haiku / sonnet / opus | [why this model] |
| Isolation | Read: [paths] / Write: [paths] | [scope rationale] |
| Timeout | X seconds / N tokens | [bound rationale] |
| Naming | "[Convention-compliant name]" | [per project standards] |
```

### Structural Anti-Patterns

| Anti-Pattern | Signal | Severity |
|-------------|--------|----------|
| No model specification | Agent inherits parent model -- cost and quality unpredictable | High -- budget risk |
| No isolation scope | Agent has undefined read/write access to the filesystem | High -- safety risk |
| Prompt is unstructured prose | No output format specified -- response is unparseable | High -- integration failure |
| No error handling section | Agent has undefined behavior on failure, timeout, or bad input | Medium -- robustness gap |
| Agent name is non-descriptive | "Agent 1", "Helper", "Worker" without context | Medium -- debugging difficulty |
| No invocation example | Orchestrator does not know how to spawn or collect from agent | Medium -- integration gap |
| Prompt template >2000 words | Overly verbose instructions that may cause context drift | Low -- efficiency concern |
| No cost bounds | Agent may consume unbounded tokens | Low -- budget risk |

---

## Cross-Type Scoring Reference

### Section Coverage Calculation

```
For each expected section in the golden sample:
  Match against artifact headings using:
    1. Exact match (case-insensitive)
    2. Fuzzy match against alternatives listed in "Fuzzy Matches" column
    3. Substring match (e.g., "## Anti-Patterns (BUILD)" matches "Anti-Patterns")

  If matched: sections_present += 1
  If not matched: sections_missing += 1

section_coverage = sections_present / sections_expected

Note: Only "Required: Yes" sections count toward sections_expected.
Optional sections do NOT penalize coverage if absent.
```

### Ordering Score Calculation

```
1. Map each present section to its golden sample position number
2. Extract the sequence of position numbers in artifact order
3. Count inversions: pairs (i, j) where i appears before j in artifact
   but golden_position[i] > golden_position[j]

   Example: If golden order is [Overview=4, Quick Start=6, Anti-Patterns=9]
   and artifact order is [Anti-Patterns, Overview, Quick Start]
   then positions are [9, 4, 6]
   Inversions: (9,4) and (9,6) = 2 inversions
   Max inversions for 3 items: 3*(3-1)/2 = 3

   ordering_score = 1 - (2/3) = 0.33

4. If 0 or 1 sections matched: ordering_score = 0.0
   (insufficient data to measure ordering)
```

### Proportion Score Calculation

```
For each matched section:
  1. Compute actual_proportion = section_char_count / total_artifact_chars
  2. Load expected range from golden sample (e.g., 5-15%)
  3. Compute deviation:
     - If actual is within range: deviation = 0
     - If actual < lower_bound: deviation = lower_bound - actual
     - If actual > upper_bound: deviation = actual - upper_bound

  proportion_score = max(0, 1 - mean(all deviations))

  Note: Deviations are in percentage points (e.g., 5% actual vs 10% lower = 5% deviation = 0.05)
  Note: Unmapped (extra) sections are excluded from this calculation
  Note: Score is clamped to [0, 1]
```

### Proportion Calibration Notes

- Proportions are approximate guidelines, not strict rules
- Deviation tolerance: sections within 5 percentage points of bounds score near 1.0
- The "Module detail sections" proportion (40-60% for skills, 50-70% for commands) is the largest expected block; this is normal and should not be flagged as bloat
- Proportions assume a well-structured artifact at or near the expected total size; extremely short or long artifacts may naturally deviate

---

## Maintenance Notes

- When adding a new artifact type, create a new section following the same format: Expected Sections table, Structural Patterns, Directory Structure (if applicable), and Structural Anti-Patterns
- Review proportional ranges after evaluating 20+ real artifacts of each type to calibrate against actual distributions
- Fuzzy match lists should be expanded as new naming conventions emerge in the codebase
- Anti-pattern severity levels should be validated against actual benchmark failures to ensure proper calibration
- This file is referenced by `modules/benchmark.md` Layer B0 -- changes here directly affect benchmark scoring
