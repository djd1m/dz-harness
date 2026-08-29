# Cursor Platform Template

> Generates `.cursorrules` and optionally `.cursor/skills/` from pipeline source configuration.

## Target Format

Cursor uses a `.cursorrules` file in the project root. This is a plain-text/markdown file that Cursor's AI reads as project-level instructions. Optionally, `.cursor/skills/` can hold longer skill documents.

## Generation Protocol

### Step 1: Generate `.cursorrules`

Create a `.cursorrules` file with the following structure:

```
# Project: {project name}

## Project Overview
{2-3 paragraphs describing the project purpose}

## Rules
{For each rule file, create a subsection with key bullet points.
 Target: 3-8 bullet points per rule. Keep each to 1-2 lines.}

## Skills
{For each skill, extract:
 - One-line description
 - Core protocol steps (3-5 key steps)
 - Key constraints (2-3 bullet points)
 Keep each skill to 15-30 lines.}

## Pipeline
{Simplified pipeline overview: stage name | description | key output}

## Anti-Patterns
{Copy the anti-patterns table}
```

### Step 2: Generate `.cursor/skills/` (for large skills)

If any skill exceeds 200 lines, create `.cursor/skills/{skill-name}.md` with the full content adapted for Cursor.

### Step 3: Size Check

Verify `.cursorrules` is under 10,000 tokens (~7,500 words). If over, further summarize skill sections.

## Content Adaptation Rules

| Source Element | Cursor Adaptation |
|----------------|-------------------|
| `Read: path/SKILL.md` | "Follow the {X} skill protocol" |
| Agent tool references | "For parallel work, break into sub-tasks" |
| Model routing | Omit (Cursor uses its own model) |
| `$ARGUMENTS` | "User-provided input" |
| Promise tags | Keep as documentation markers |
| Checkpoint protocol | "Pause and confirm with user before proceeding" |

## Example Output

```
.cursorrules                          (main instructions, <10K tokens)
.cursor/
└── skills/
    └── {large-skill}.md              (full skill, if >200 lines)
```
