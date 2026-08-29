---
name: bto
description: Build, benchmark, test, and optimize Claude Code artifacts — skills, commands, rules, and agent templates. Use when running /bto, /bto-build, /bto-benchmark, /bto-test, or /bto-optimize, or when asked to generate a new skill from requirements, benchmark an artifact against golden samples, evaluate it with a multi-agent judge panel, or improve a prompt through evolutionary optimization.
---

# BTO — Build · Test · Optimize

<!-- Trust Tier: 1 — Structured | Path to Tier 2: Run /bto-test for self-evaluation -->

> Multi-agent evaluation and prompt optimization system for Claude Code artifacts.

## Overview

BTO is a 4-module pipeline for creating, benchmarking, evaluating, and optimizing Claude Code skills, commands, rules, and agents. It combines structured generation, deterministic benchmarking, multi-agent LLM judging, and evolutionary prompt optimization.

## Modules

| Module | Purpose | Command | Agent Pattern |
|--------|---------|---------|---------------|
| **BUILD** | Generate skill/command from requirements | `/bto-build` | Single agent + explore |
| **BENCHMARK** | Deterministic benchmarking against golden samples | `/bto-benchmark` | 3 parallel haiku probes |
| **TEST** | Multi-agent evaluation with judge panel | `/bto-test` | 3 parallel judges |
| **OPTIMIZE** | Evolutionary prompt optimization | `/bto-optimize` | N parallel workers |

## Quick Start

```
/bto [skill-path]              — Full pipeline (build → benchmark → test → optimize)
/bto-build [description]       — Generate a new skill or command
/bto-benchmark [path]          — Benchmark against golden samples
/bto-test [path]               — Evaluate an existing artifact
/bto-optimize [path]           — Optimize prompts in a skill
```

---

## Agent Authoring Rule (applies to EVERY BTO agent)

Never compose a long artifact inside a single tool call. An agent that emits no tool event for the
harness watchdog window is killed, and a killed agent loses ALL unwritten output — there is no partial save.
The windows are **180 s** inside a workflow runner and **600 s** for a directly-spawned subagent.

- Write the file's title + section skeleton FIRST (one small `Write`).
- Fill it in with several separate `Edit` appends — one per section, or per ~100 lines, whichever is smaller.
- Prefer 6 small calls over 1 large one even when the large one would "probably" fit.
  An extra `Edit` costs milliseconds; a kill costs the whole run.
- This is not a model-capability question — every model is killed identically.

A genuinely short emission (a one-line score, a ~15-line probe answer) is **EXEMPT**, but the exemption
must be written down at the site with the token `INCREMENTAL-WRITE: EXEMPT (short output)`. An
undeclared omission and a deliberate exemption must be distinguishable by grep.

---

## Module 1: BUILD

**Goal:** Generate complete, production-quality Claude Code skills/commands from natural language requirements.

### Protocol

1. **Requirements Clarification** — Load `explore` skill to clarify:
   - What artifact type? (skill / command / rule / agent template)
   - Domain and context
   - Input/output expectations
   - Quality criteria
   - Reference examples (optional)

2. **Template Selection** — Based on artifact type:
   - **Skill:** SKILL.md + modules/ + references/ + examples/
   - **Command:** Single .md file with parameter handling
   - **Rule:** Single .md with detection patterns and fixes
   - **Agent template:** Single .md with agent config

3. **Generation** — Structured generation following conventions:
   - Load `references/quality-checklist.md` for validation criteria
   - Generate with proper sections, headers, formatting
   - Include anti-patterns section
   - Include at least one reference and one example

4. **Self-Review** — Before output:
   - Check against quality checklist (Layer 0)
   - Verify no empty sections
   - Verify all cross-references resolve
   - Verify naming conventions match (`file-conventions` rule)

### BUILD Modes

| Mode | When | Agents | Time |
|------|------|--------|------|
| QUICK | Simple artifact, clear requirements | 1 | ~2 min |
| DEEP | Complex skill, unclear requirements | 1 + explore | ~5 min |

### Output Structure (Skill)

```
.claude/skills/<name>/
├── SKILL.md                 ← Main orchestrator — `--- name/description ---` fence FIRST, then `# Title`
├── modules/                 ← Detailed protocols per module
│   └── <module-name>.md
├── references/              ← Supporting materials
│   └── <reference-name>.md
└── examples/                ← Few-shot examples
    └── <example-name>.md
```

### Anti-Patterns (BUILD)

| Anti-Pattern | Fix |
|-------------|-----|
| Generic skill without domain context | Add specific domain constraints and examples |
| Missing references directory | Always include at least one reference |
| No examples | Add at least one few-shot example |
| Over-scoped skill | Split into modules, keep SKILL.md as orchestrator |
| Copy-pasting from other skills | Adapt, don't copy — each skill is unique |

---

## Module 2: BENCHMARK

**Goal:** Objective, deterministic benchmarking before subjective expert evaluation.

### Benchmark Layers

```
B0: Golden Sample Comparison      ← Structural diff against known-good artifacts
B1: Deterministic Test Suite      ← Rule-based checks beyond Layer 0
B2: Consistency Probe             ← 3 parallel haiku probes for output stability
B3: Performance Metrics           ← Token count, section density, reference coverage
```

### B0: Golden Sample Comparison

Compare the artifact against golden samples from `references/golden-samples.md`:
- Structural similarity score (section presence, ordering, depth)
- Missing sections that golden samples consistently include
- Extra sections not present in any golden sample (potential drift)

### B1: Deterministic Test Suite

Rule-based checks that go beyond Layer 0 structural pre-checks:
- Cross-reference integrity (all internal links resolve)
- Terminology consistency (same concept uses same term throughout)
- Instruction specificity (no vague directives like "do it well")
- Anti-pattern section completeness (at least 3 entries with fixes)

### B2: Consistency Probe

Spawn 3 parallel haiku agents, each given the same prompt derived from the artifact:
- Each agent independently interprets the artifact instructions
- Compare outputs for consistency (high variance = ambiguous instructions)
- Score: % agreement across the 3 probes

### B3: Performance Metrics

Quantitative measurements:
- Token efficiency: information density per token
- Section balance: no single section > 40% of total content
- Reference coverage: % of claims backed by references
- Example coverage: at least 1 example per major concept

### Scoring

```
BENCHMARK_SCORE = B0 * 0.30 + B1 * 0.35 + B2 * 0.15 + B3 * 0.20
```

### Gate

| Score Range | Decision |
|-------------|----------|
| < 0.50 | BLOCK — Do not proceed to TEST. Fix structural issues first. |
| 0.50 - 0.70 | WARN — Proceed to TEST with advisory. Judges receive benchmark context. |
| > 0.70 | PASS — Proceed to TEST. Benchmark data available for judge context. |

### Anti-Patterns (BENCHMARK)

| Anti-Pattern | Fix |
|-------------|-----|
| Golden samples outdated or unrepresentative | Review and refresh golden samples quarterly |
| Consistency probe too lenient (always agrees) | Vary probe prompts to stress-test edge interpretations |
| Over-reliance on structural similarity | Balance B0 with semantic checks in B1 |
| Ignoring BENCHMARK WARN and proceeding blindly | Always surface WARN context to TEST judges |
| Skipping BENCHMARK for "simple" artifacts | BENCHMARK is fast and cheap — always run it |

---

## Module 3: TEST

**Goal:** Evaluate any Claude Code artifact using deterministic checks + multi-agent LLM judging.

### Evaluation Layers

```
Layer 0: Deterministic Pre-checks     ← Fast, free, catches 60% of issues
Layer 1: Single LLM Judge             ← Quick spot-check (model: haiku)
Layer 2: Full Judge Panel (3 agents)  ← Comprehensive evaluation (model: sonnet)
Meta-Judge: Disagreement Resolution   ← Only if judges disagree >3 points
```

### Layer 0: Deterministic Pre-checks

Run BEFORE spawning any LLM agents. Fast and free.

**For Skills:**
- [ ] SKILL.md exists and is non-empty
- [ ] Has `# Title` as first heading
- [ ] Has `## Overview` section
- [ ] Has `## Anti-Patterns` section
- [ ] All referenced modules exist in modules/
- [ ] All referenced references exist in references/
- [ ] No empty sections (heading followed immediately by another heading)
- [ ] File size: 1KB < size < 50KB per file
- [ ] Total skill directory: < 200KB

**For Commands:**
- [ ] Has `$ARGUMENTS` parameter reference
- [ ] Has checkpoint protocol
- [ ] Has skill loading instruction (Read .claude/skills/...)
- [ ] File size: 500B < size < 20KB

**For Rules:**
- [ ] Has table or list of patterns
- [ ] Has detection signals and fixes
- [ ] File size: 200B < size < 10KB

**Scoring:** Pass/Fail per check → aggregate pass rate (must be ≥80% to proceed)

### Layer 1: Single LLM Judge (Quick Mode)

Use when: fast feedback needed, or evaluating many artifacts in batch.

**Model:** haiku (cost-optimized)

**Prompt Pattern:**
```
You are a Claude Code artifact evaluator. Rate the following {artifact_type}
on these dimensions (1-10 each):

1. CLARITY — Are instructions unambiguous?
2. COMPLETENESS — Are all necessary sections present?
3. ACTIONABILITY — Can Claude follow these instructions to produce output?
4. QUALITY — Is the content well-structured and professional?
5. ANTI-PATTERNS — Does it avoid known anti-patterns?

Provide: score per dimension, brief justification, top 3 improvement suggestions.
```

**Threshold:** Average ≥ 7.0 to pass

### Layer 2: Full Judge Panel (3 Agents)

Use when: thorough evaluation needed, or artifact is critical.

**Architecture:** 3 parallel agents, each with a different perspective.

Load rubrics from `references/judge-rubrics.md`.

| Judge | Role | Focus | Model | Family |
|-------|------|-------|-------|--------|
| Agent 1 | Domain Expert | Accuracy, depth, methodology, domain fit | sonnet | record it |
| Agent 2 | Critic | Gaps, weaknesses, anti-patterns, edge cases | sonnet | **recommended cross-family** (advisory) |
| Agent 3 | Completeness Auditor | Structure, coverage, cross-references, actionability | sonnet | record it |

`model: sonnet` is a **default, not a constraint**. The family axis is *recorded and advisory* — it
never blocks a verdict. Every evaluation report always emits `Authored by:`, `Judged by:` and
`Cross-family: YES|NO`; see `modules/test.md` §Output: Evaluation Report for the exact lines and the
degradation banner.

**Each judge scores independently on 5 dimensions (1-10):**
1. METHODOLOGY — Is the approach sound and well-structured?
2. DEPTH — Is the content thorough enough for the task?
3. CORRECTNESS — Are claims accurate and instructions valid?
4. USABILITY — Can a user/agent effectively use this artifact?
5. ROBUSTNESS — Does it handle edge cases and failure modes?

**Aggregation:**
- Weighted average: Expert (0.4) + Critic (0.3) + Auditor (0.3)
- Per-dimension and overall score
- Flag if any dimension has range > 3 across judges

### Meta-Judge: Disagreement Resolution

**Trigger:** Any dimension where max - min > 3 across judges.

**Action:**
1. Present all three evaluations to a single opus-level agent
2. Ask for reconciled score with explicit reasoning
3. Flag for human review if still unresolvable

### Output: Evaluation Report

See `examples/sample-eval-report.md` for format.

---

## Module 4: OPTIMIZE

**Goal:** Improve Claude Code artifacts through evolutionary prompt optimization.

### Protocol

1. **Baseline** — Evaluate current artifact with TEST (Layer 2)
2. **Generate Variants** — Create N=5 variants using mutation strategies
3. **Evaluate** — Run TEST (Layer 1) on each variant
4. **Select + Crossover** — Top 2 → generate 3 new variants
5. **Repeat** — 3 rounds total (15 evaluations)
6. **Output** — Best variant + before/after delta + changelog

### Mutation Strategies

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| **Rephrase** | Reword instructions for clarity | Low CLARITY score |
| **Restructure** | Reorganize sections and flow | Low USABILITY score |
| **Add Constraints** | Add guardrails and edge cases | Low ROBUSTNESS score |
| **Simplify** | Remove redundancy, tighten language | Over-engineered artifact |
| **Specialize** | Add domain-specific context | Low DEPTH score |

### Optimization Loop

```
Round 1: 5 variants × Layer 1 eval → Select top 2
Round 2: top 2 crossover → 3 new variants × Layer 1 eval → Select top 2
Round 3: top 2 crossover → 3 new variants × Layer 2 eval → Final selection
```

### Cost Optimization

| Operation | Model | Est. Cost |
|-----------|-------|-----------|
| Variant generation | default (opus) | Creative work |
| Layer 1 evaluation | haiku | Cheap, fast |
| Layer 2 evaluation | sonnet | Moderate, thorough |
| Meta-judge | default (opus) | Only on disagreement |

### Anti-Patterns (OPTIMIZE)

| Anti-Pattern | Fix |
|-------------|-----|
| Overfitting to one metric | Balance all 5 dimensions equally |
| Losing generality | Check original use cases still work |
| Infinite optimization loop | Hard cap at 3 rounds |
| Optimizing already-good artifacts | Only optimize if baseline < 8.0 |
| Changing artifact semantics | Preserve original intent and scope |

---

## Integration with Keysarium Pipeline

BTO can be used at any point in the pipeline:

| Phase | BTO Usage |
|-------|-----------|
| After Phase 0 | `/bto-test researches/<slug>/00_product_discovery.md` |
| After Phase 2 | `/bto-test researches/<slug>/02_research_findings.md` |
| After Phase 5 | `/bto-test researches/<slug>/05_presentation_content.md` |
| Pre-evaluation benchmark | `/bto-benchmark .claude/skills/<name>/SKILL.md` |
| New skill creation | `/bto-build "describe your skill"` |
| Skill improvement | `/bto-optimize .claude/skills/<name>/SKILL.md` |

## Dependencies

This skill uses:
- `explore` skill — for requirements clarification in BUILD module
- `references/judge-rubrics.md` — evaluation rubrics
- `references/eval-patterns.md` — multi-agent evaluation patterns
- `references/optimization-methods.md` — optimization approaches
- `references/quality-checklist.md` — deterministic pre-checks
- `references/golden-samples.md` — golden sample artifacts for BENCHMARK comparison
