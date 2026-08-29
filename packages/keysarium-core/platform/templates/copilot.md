# GitHub Copilot Platform Template

> Generates `.github/copilot-instructions.md` from pipeline source configuration.

## Target Format

GitHub Copilot reads custom instructions from `.github/copilot-instructions.md`. This is a single markdown file with all project-level instructions.

## Generation Protocol

### Step 1: Generate `.github/copilot-instructions.md`

```markdown
# {Project Name} -- Copilot Instructions

> Auto-generated from pipeline configuration. Source of truth: {source path}

## Project Overview
{Purpose, key concepts, directory structure overview}

## Core Rules
{For each rule, 5-10 actionable bullet points.
 Focus on constraints and do/don't instructions.}

## Skills Reference
{For each skill:
 **Purpose:** one-line
 **Key protocol:** 3-5 steps
 **Quality gates:** 2-4 checks}

## Pipeline Overview
{Phase | Purpose | Key Output table}

## Anti-Patterns
{Pattern | Fix table}

## Domain-Specific Guidance
{3-4 bullet points per domain}

## File Conventions
{Key naming and directory rules}
```

### Step 2: Size Check

Verify the file is under 8,000 tokens (~6,000 words). Priority for trimming:
1. Core Rules (keep all)
2. Anti-Patterns (keep all)
3. Skills Reference (summarize further)
4. Pipeline Overview (keep)
5. Domain-Specific Guidance (trim)

### Step 3: Directory Safety

If `.github/copilot-instructions.md` already exists, generate to `copilot-instructions.generated.md` and warn.

## Content Adaptation Rules

| Source Element | Copilot Adaptation |
|----------------|---------------------|
| Skill references | Summarize inline (no separate files) |
| Agent tool references | "Break complex tasks into sub-tasks" |
| Model routing | Omit entirely |
| Promise tags | Keep as phase completion markers |
| Checkpoint protocol | "Confirm with user before moving to next phase" |
| Governance shards | Summarize key constraints only |

## Copilot-Specific Notes

1. Copilot reads the entire file on each interaction — shorter is better
2. No directory-based skills — everything in one markdown file
3. Copilot does not support slash commands — reference as "workflows" or "procedures"
4. Focus on rules and constraints — Copilot benefits most from clear do/don't
5. Code patterns over prose — show examples instead of descriptions

## Example Output

```
.github/
└── copilot-instructions.md    (single file, <8K tokens)
```
