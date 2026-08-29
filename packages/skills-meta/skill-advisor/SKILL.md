---
name: skill-advisor
description: >
  Recommends WHICH skills, skill-sets, presets, or npx toolkits from the DZ Harness Hub
  arsenal to solve a user's practical task — with rationale, a suggested pipeline order,
  install commands, and honest gaps. The semantic, skill-level upgrade over the keyword-only
  `dz recommend` CLI: retrieves the live catalog at runtime (`dz registry`, `dz recommend`),
  then improves on it with intent matching, multi-step pipeline composition, and toolkit-vs-skills
  judgment. Triggers on: "which skill", "what skill should I use", "какой скилл",
  "посоветуй скиллы для задачи", "recommend skills for this task", "чем решить задачу",
  "/skill-advisor".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
tags: [meta, advisor, recommendation, routing, catalog, semantic, pipeline]
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Skill Advisor

Given a practical task, recommend WHICH skills, presets, or npx toolkits from THIS
arsenal (DZ Harness Hub) to use — ranked, with rationale, a pipeline order, install
commands, and an honest gaps section.

This is the **semantic, skill-level** version of the `dz recommend` CLI. `dz recommend`
matches keywords; this skill reads the **live catalog** at runtime and reasons about the
task's real intent, composes a multi-step pipeline, and judges when a whole npx toolkit
beats a handful of loose skills.

## When to Use

- User asks "which skill / what should I use to do X?" or the Russian equivalents
  ("какой скилл", "чем решить задачу", "посоветуй скиллы").
- The task is multi-step and would benefit from a *pipeline* of skills, not just one hit.
- The user is unsure whether to grab loose skills or a full npx toolkit (e.g.
  `trip-planner`, `keysarium`, `design-thinking`).
- `dz recommend` returned a weak/keyword-only result and you want a better, reasoned answer.
- You want install commands so the user can act immediately.

## When NOT to Use

- **Quick keyword hit only** → just run `dz recommend "<task>"` directly. This skill is
  for when that baseline is insufficient (synonyms, multi-step intent, toolkit choice).
- **The task itself is vague/underspecified** ("help me with my product") → run the
  `explore` skill FIRST to clarify, then return here with a concrete task.
- **You already know the exact skill** → just install it (`dz init --target claude-code --select <name>`); no
  recommendation needed.
- **Discovering NEW external sources** (not yet in the arsenal) → use `dz scout`. This
  skill only recommends what already exists in the catalog.

## Overview

The arsenal is large (116 skills across 7 packs, 10 npx toolkits, 11 presets) and grows
constantly. **Never hardcode the list** — it rots. Instead:

1. Retrieve the live catalog at runtime via `dz registry` and the keyword baseline via
   `dz recommend "<task>"`.
2. Improve on that baseline with **semantic reasoning**: map the task's real intent
   (synonyms, multi-step structure) to the best skills.
3. **Compose a pipeline** in execution order (e.g. `explore` → `goap-research-ed25519`
   → `frontend-design`).
4. Judge **toolkit-vs-loose-skills**: when a full npx package covers the end-to-end job,
   recommend it as primary.
5. **Flag gaps honestly**: if nothing fits well, say so and suggest `/bto-build` a new
   skill, or `dz scout` for external sources.
6. **Verify every recommended name exists** in the live registry before emitting it.

> **Optional agentdb enhancement.** If the `agentdb-memory` MCP is available, you may
> index the registry into a vector store for semantic recall of past task→skill matches.
> This is OPTIONAL — the skill must work WITHOUT it, using `dz registry` + reasoning.

## Procedure

### Step 1 — Clarify the task

Restate the task in one sentence. If it is genuinely vague (no concrete deliverable,
multiple plausible interpretations), STOP and recommend running `explore` first — do not
guess. If it is concrete, extract: the deliverable, the domain (web/QE/security/research/
web3/devops/mcp/academic…), and whether it is single-step or multi-step.

### Step 2 — Retrieve candidates (live catalog)

Run BOTH, and treat their output as the source of truth (not this document):

```bash
dz registry                      # full live list of skills / packs / presets
dz registry search "<keyword>"   # narrow by keyword(s) from the task
dz recommend "<task>"            # keyword baseline to improve upon
```

Note packs and presets too: `dz registry --category <pack>` shows a pack's skills. Record
the keyword baseline so you can show how your semantic answer differs from it.

### Step 3 — Semantic rank + compose pipeline + toolkit judgment

For each candidate, score **fit = high | medium | low** by how well it matches the task's
*real intent*, not just shared keywords. Then:

- **Compose a pipeline** for multi-step tasks: order skills by execution dependency
  (clarify → research → design → build → verify). Example shape:
  `explore` → `goap-research-ed25519` → `frontend-design` → `qe-browser`.
- **Toolkit-vs-loose-skills**: if a single npx toolkit covers the whole job end-to-end,
  make it the PRIMARY recommendation and list loose skills as complements/alternatives.
  Rule of thumb: end-to-end deliverable with its own pipeline → toolkit; a single
  sub-task → loose skill(s).

### Step 4 — Output recommendation + gaps

Emit the ranked list (Output Format below) plus a `pipeline` order and a `gaps` section.
The gaps section is mandatory and must be honest: if the best fit is only `medium`/`low`,
say what is missing and suggest `/bto-build` (author a new skill), `dz scout` (find an
external source), or falling back to `dz recommend` for a quick keyword hit.

### Step 5 — Verify every name exists

Before finalizing, confirm **each** recommended `name` appears in the `dz registry`
output from Step 2 (or is one of the published npx packages `@dzhechkov/<x>` / preset
names). If a name cannot be verified, REMOVE it — recommending a non-existent skill is
fabrication and fails the validator (SA-001 / SA-004).

## Output Format

Conforms to `schemas/output.json`:

```json
{
  "task": "<one-sentence restatement>",
  "recommendations": [
    {
      "name": "trip-planner",
      "type": "npx-package",
      "fit": "high",
      "why": "End-to-end: travel route → mobile site. Covers the whole deliverable.",
      "install": "npx @dzhechkov/trip-planner init"
    }
  ],
  "pipeline": ["explore", "trip-planner", "frontend-design"],
  "gaps": ["No skill for live transit APIs — trip-planner uses static data."]
}
```

Install command MUST match the item `type`:

| type | install |
|------|---------|
| `skill` | `dz init --target claude-code --select <name>` |
| `preset` | `dz setup --target claude-code --preset <name>` |
| `npx-package` | `npx @dzhechkov/<name> init` |

## Examples

> All names below are REAL catalog entries (verify with `dz registry` at runtime).

**Example 1 — "интерактивный сайт-маршрут по городу" (interactive city-route website)**
- PRIMARY: `trip-planner` (npx-package, **high**) — purpose-built travel→mobile-site
  pipeline; covers the whole deliverable. `install: npx @dzhechkov/trip-planner init`
- `explore` (skill, **medium**) — first, to pin down city, budget, days, audience.
- `goap-research-ed25519` (skill, **medium**) — verified research on POIs/opening hours.
- `frontend-design` (skill, **medium**) — polish the generated UI beyond defaults.
- **Pipeline:** `explore` → `trip-planner` → `goap-research-ed25519` → `frontend-design`
- **Gaps:** no live-transit API skill; trip-planner uses static data.

**Example 2 — "проверить .claude конфиг на безопасность" (audit .claude config security)**
- PRIMARY: `agentshield-scan` (skill, **high**) — scans `.claude/` skills, hooks, MCP,
  settings against 170 rules. `install: dz init --target claude-code --select agentshield-scan`
- `external-comms-gate` (skill, **low**) — only if also publishing artifacts publicly.
- `meta` (preset, **medium**) — installs agentshield-scan plus related meta skills in one
  shot. `install: dz setup --target claude-code --preset meta`
- **Pipeline:** `agentshield-scan` → (if findings) `security-audit`
- **Gaps:** agentshield scans configs, not app source — pair with `security-audit` for code.

**Example 3 — "написать тесты для модуля" (write tests for a module)**
- `qe-test-generation` (skill, **high**) — generates unit/integration/e2e from code
  analysis. `install: dz init --target claude-code --select qe-test-generation`
- `test-writer` (skill, **high**) — devops-pack test authoring, language-agnostic.
- `tdd-london-chicago` (skill, **medium**) — if the user wants a TDD discipline, not just
  generated tests.
- `qe-engineer` (preset, **medium**) — full 20-skill QE pack if more than authoring is
  needed (coverage, execution, quality gates). `install: dz setup --target claude-code --preset qe-engineer`
- **Pipeline:** `qe-test-generation` → `qe-test-execution` → `qe-coverage-analysis`
- **Gaps:** none significant — strong QE coverage in the arsenal.

**Example 4 — "глубокое исследование рынка с проверкой источников"**
- PRIMARY: `keysarium` (npx-package, **high**) — 7-phase research pipeline end-to-end.
  `install: npx @dzhechkov/keysarium init`
- `goap-research-ed25519` (skill, **high**) — cryptographically verified anti-hallucination
  research if a single rigorous pass (not the full pipeline) is wanted.
- **Pipeline:** `explore` → `keysarium` (or `goap-research-ed25519` standalone)
- **Gaps:** none — research is well covered.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Recommending a name not in the catalog | Fabrication — the skill/package doesn't exist | Verify every name against `dz registry` (Step 5) |
| Keyword-only matching | Misses synonyms and real intent (that's just `dz recommend`) | Reason semantically about the task's goal |
| Ignoring npx toolkits | A full pipeline often beats stitching loose skills | Judge toolkit-vs-skills; lead with the toolkit when it fits |
| Single skill for a multi-step task | User has to figure out the order themselves | Compose an ordered `pipeline` |
| Omitting the gaps section | Over-sells the arsenal; user wastes time on a poor fit | Always flag gaps; suggest `/bto-build` or `dz scout` when nothing fits |
| Hardcoding the catalog from memory | Catalog drifts; recommendations rot | Retrieve live at runtime every time |
| Install command not matching type | `dz init --target claude-code --select` won't install an npx package | Map type→install per the Output Format table |

## Self-Check

- [ ] Did I restate the task, and defer to `explore` if it was vague?
- [ ] Did I retrieve the LIVE catalog (`dz registry`) and the baseline (`dz recommend`)?
- [ ] Did I improve on the keyword baseline with semantic reasoning?
- [ ] Did I compose a `pipeline` order for multi-step tasks?
- [ ] Did I judge toolkit-vs-loose-skills and lead with a toolkit when one fits end-to-end?
- [ ] Does every recommendation have type, fit, why, and a type-matching install command?
- [ ] Did I verify EVERY recommended name exists in the live registry (no fabrication)?
- [ ] Did I include an honest gaps section (with `/bto-build` / `dz scout` if no good fit)?
