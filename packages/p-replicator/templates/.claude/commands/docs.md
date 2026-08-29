---
description: Generate bilingual project documentation (Russian + English). Creates `README/ru/` and `README/eng/` with admin guide, user guide, API docs, and quick start. Modes: default (both languages), `eng`/`ru` (single), `update` (refresh existing).
argument-hint: '[eng | ru | update]'
---

# /docs $ARGUMENTS

## Purpose

Generate user-facing and admin-facing documentation from project artifacts.
Bilingual by default (Russian + English).

## Modes

| `$ARGUMENTS` | Languages | Mode |
|--------------|-----------|------|
| (empty) | RU + EN | Create or replace |
| `ru` | RU only | Create or replace |
| `eng` | EN only | Create or replace |
| `update` | Existing | Update only changed sections |

## Process

### Step 1: Gather Context

Read these sources:

| Source | Used for |
|--------|----------|
| `docs/PRD.md` | Product overview, user personas |
| `docs/Architecture.md` | System design, deployment |
| `docs/Specification.md` | Feature list, API surface |
| `CLAUDE.md` | Project context |
| `.claude/insights/index.md` | Known gotchas, FAQs |
| Source code | API signatures (top-level routes) |
| `package.json` | Tech stack, scripts, dependencies |

### Step 2: Generate Per-Language Files

For each target language, write into `README/<lang>/`:

| File | Content |
|------|---------|
| `01_quickstart.md` | Install + run in 5 commands |
| `02_user_guide.md` | End-user workflows |
| `03_admin_guide.md` | Deployment, monitoring, backup, secrets |
| `04_api_reference.md` | API endpoints with examples |
| `05_architecture.md` | High-level architecture (auto from Architecture.md) |
| `06_troubleshooting.md` | From insights |
| `07_changelog.md` | From git log |
| `README.md` | TOC linking to the above |

### Step 3: Cross-Language Consistency

Ensure RU + EN cover identical sections (same numbering, same TOC).

### Step 4: Generate Top-Level Index

Update root `README.md`:
```markdown
## Documentation
- 🇷🇺 [Документация на русском](./README/ru/README.md)
- 🇬🇧 [English documentation](./README/eng/README.md)
```

### Step 5: Validate + Commit

- All internal links resolve
- All code blocks have language tags
- Commit: `docs: generate bilingual documentation (RU + EN)`

## Update Mode

`/docs update` only regenerates files where source has changed since last run.

## Related

- `/harvest` — extract reusable patterns (different goal)
- `/myinsights` — fed into troubleshooting section
