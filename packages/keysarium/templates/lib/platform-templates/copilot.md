# GitHub Copilot Platform Template

> Generates `.github/copilot-instructions.md` from `.claude/` sources.

## Target Format

GitHub Copilot reads custom instructions from `.github/copilot-instructions.md`. This is a single markdown file that provides project-level context and instructions to Copilot's AI assistant.

## Generation Protocol

### Step 1: Generate `.github/copilot-instructions.md`

Create `.github/copilot-instructions.md` with the following structure:

```markdown
# {Project Name} — Copilot Instructions

> Auto-generated from .claude/ directory by /init-platform. Source of truth: .claude/

## Project Overview

{Extract the project description from CLAUDE.md:
 - Purpose (2-3 sentences)
 - Key concepts (pipeline phases, skills, research methodology)
 - Project structure overview (simplified directory tree)
}

## Core Rules

{For each file in .claude/rules/, create a subsection:}

### {Rule Name}

{Summarize the rule to 5-10 key bullet points.
 Focus on actionable instructions.
 Omit implementation details specific to Claude Code.
 Preserve critical constraints (PARANOID mode, mandatory phases, etc.)
}

---

## Skills Reference

{For each skill in .claude/skills/:}

### {Skill Name}

**Purpose:** {One-line description}

**When to use:** {Extract the "When" or trigger conditions}

**Key protocol:**
{Numbered list of 3-5 core steps from the skill's protocol section.
 Simplify each step to 1-2 sentences.
 Omit tool-specific references.}

**Quality gates:**
{2-4 key quality checks from the skill}

---

## Pipeline Overview

{Simplified version of the phase pipeline:}

| Phase | Purpose | Key Output |
|-------|---------|------------|
{One row per phase, extracted from CLAUDE.md pipeline table}

## Anti-Patterns to Avoid

{Extract the anti-patterns table, keeping the Pattern and Required Fix columns}

## Domain-Specific Guidance

{Summarize domain rules from .claude/rules/domain-specific.md:
 - Banking: key constraints
 - Retail: key constraints
 - Enterprise: key constraints
 Keep each domain to 3-4 bullet points.}

## File Conventions

{Extract key file naming and directory conventions from .claude/rules/file-conventions.md}
```

### Step 2: Size Check

After generation, verify:
- `.github/copilot-instructions.md` is under 8,000 tokens (~6,000 words)
- If over limit, prioritize in this order:
  1. Core Rules (keep all)
  2. Anti-Patterns (keep all)
  3. Skills Reference (summarize further)
  4. Pipeline Overview (keep)
  5. Domain-Specific Guidance (trim to most relevant domain)

### Step 3: Ensure `.github/` Directory Exists

If `.github/` directory does not exist, create it. If `copilot-instructions.md` already exists, warn the user and generate to `copilot-instructions.generated.md` instead.

## Content Adaptation Rules

| Source Element | Copilot Adaptation |
|----------------|---------------------|
| `Read: .claude/skills/X/SKILL.md` | Summarize inline (no separate files) |
| Agent tool references | "Break complex tasks into sub-tasks" |
| Model routing (haiku/sonnet/opus) | Omit entirely (Copilot uses its own model) |
| `$ARGUMENTS` variable | "User-provided context" |
| Promise tags `<promise>` | Keep as phase completion markers |
| Checkpoint protocol | "Confirm with user before moving to next phase" |
| BTO-specific content | Omit or heavily summarize (not relevant for Copilot workflows) |
| Governance shards | Summarize key constraints only |

## Example Output Structure

```
.github/
└── copilot-instructions.md    (single file, <8K tokens)
```

## Copilot-Specific Notes

1. **Copilot reads the entire file** on each interaction, so shorter is better
2. **No directory-based skills** — everything must be in the single markdown file
3. **Copilot does not support slash commands** — reference commands as "workflows" or "procedures"
4. **Focus on rules and constraints** — Copilot benefits most from clear do/don't instructions
5. **Code patterns over prose** — where possible, show code examples instead of lengthy descriptions

## Last Verified

Platform: GitHub Copilot
Format version: .github/copilot-instructions.md (2025+)
Last verified: 2026-03-01
