# @dzhechkov/skills-academic

Academic skill pack — 5 skills for master's thesis defense evaluation (ГЭК — Государственная экзаменационная комиссия). Contains only evaluation criteria and methodology; **no student data**.

## Install

```bash
# Via dz CLI (recommended):
dz init --target claude-code --preset academic

# Or with self-learning:
dz setup --target claude-code --preset academic

# Or directly:
dz install @dzhechkov/skills-academic
```

## Skills (5)

| Skill | What it does |
|-------|-------------|
| `dissertation-review` | Analyzes a master's thesis against ГЭК criteria — structure, methodology, novelty, practical significance |
| `question-generator` | Generates committee questions from the thesis + reviewer remarks |
| `document-checker` | Validates completeness of the defense package — required documents, formatting consistency, topic alignment |
| `defense-evaluator` | Evaluates the defense presentation from a live transcript — structure, topic coverage, confidence, alignment with the thesis |
| `answer-assessor` | Assesses the quality of the student's answers to committee questions from a live transcript — completeness, depth, alignment with reviewer remarks |

## Privacy

These skills ship **evaluation criteria and methodology only** — no student, supervisor, or reviewer data. When applied to real theses, reference works by number/label and never include personally identifying information.

## Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub)

One canonical skill model, compiled to Claude Code, Codex, OpenCode, Hermes, and OpenClaude via the `dz` CLI. See the [root README](https://github.com/djd1m/dz-harness-hub#readme) for the full catalog.

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Review this dissertation against committee criteria" → `dissertation-review`
- "Generate defense questions" → `question-generator`
- "Check the defense document package" → `document-checker`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.
