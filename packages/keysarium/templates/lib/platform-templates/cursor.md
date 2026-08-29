# Cursor Platform Template

> Generates `.cursorrules` and optionally `.cursor/skills/` from `.claude/` sources.

## Target Format

Cursor uses a `.cursorrules` file in the project root. This is a plain-text/markdown file that Cursor's AI reads as project-level instructions. Optionally, `.cursor/skills/` can hold longer skill documents.

## Generation Protocol

### Step 1: Generate `.cursorrules`

Create a file `.cursorrules` in the project root with the following structure:

```
# Project: {project name from CLAUDE.md title}

## Project Overview

{Extract the first 2-3 paragraphs from CLAUDE.md that describe the project purpose}

## Rules

{For each file in .claude/rules/:}

### {Rule file name without extension, title-cased}

{Extract the key rules as bullet points. Omit tables and complex formatting.
 Keep each rule to 1-2 lines. Target: 3-8 bullet points per rule file.}

## Skills

{For each skill in .claude/skills/:}

### {Skill name, title-cased}

{Read SKILL.md and extract:
 - One-line description (from the skill's header or first paragraph)
 - Core protocol steps (numbered list, 3-5 key steps)
 - Key constraints or quality gates (2-3 bullet points)
 Keep each skill section to 15-30 lines maximum.}

## Pipeline

{Extract the pipeline phases table from CLAUDE.md, simplified to:
 Phase name | Description | Key output}

## Anti-Patterns

{Copy the anti-patterns table from CLAUDE.md or .claude/rules/anti-patterns.md}
```

### Step 2: Generate `.cursor/skills/` (for large skills)

If any skill's SKILL.md exceeds 200 lines, create a separate file in `.cursor/skills/`:

```
.cursor/skills/{skill-name}.md
```

Content: the full SKILL.md content, reformatted to remove Claude Code-specific references (like "Read: .claude/skills/..." instructions). Replace with relative references.

### Step 3: Size Check

After generation, verify:
- `.cursorrules` is under 10,000 tokens (~7,500 words)
- If over limit, further summarize skill sections (keep rules intact)

## Content Adaptation Rules

| Source Element | Cursor Adaptation |
|----------------|-------------------|
| `Read: .claude/skills/X/SKILL.md` | Replace with: "Follow the {X} skill protocol" |
| Agent tool references | Replace with: "For parallel work, break into sub-tasks" |
| Model routing (haiku/sonnet/opus) | Omit (Cursor uses its own model) |
| `$ARGUMENTS` variable | Replace with: "User-provided input" |
| Promise tags `<promise>` | Keep as documentation markers |
| Checkpoint protocol | Adapt to: "Pause and confirm with user before proceeding" |

## Example Output Structure

```
.cursorrules                          (main instructions file, <10K tokens)
.cursor/
└── skills/
    ├── reverse-engineering-unicorn.md (full skill, if >200 lines)
    ├── bto.md                        (full skill, if >200 lines)
    └── feature-adr.md               (full skill, if >200 lines)
```

## Last Verified

Platform: Cursor
Format version: .cursorrules (2025+)
Last verified: 2026-03-01
