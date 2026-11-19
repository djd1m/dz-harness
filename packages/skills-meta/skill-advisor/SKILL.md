---
name: skill-advisor
description: >
  Recommends WHICH skills, skill-sets, presets, or npx toolkits from the DZ Harness Hub
  arsenal to solve a user's practical task — with rationale, required execution order when useful,
  install commands, and honest gaps. The semantic, skill-level upgrade over the keyword-only
  `dz recommend` CLI: retrieves the live catalog at runtime (`dz registry`, `dz recommend`),
  then improves on it with intent matching, conditional composition, and toolkit-vs-skills
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
arsenal (DZ Harness Hub) to use — ranked, with rationale, required execution order when useful, install
commands, and an honest gaps section.

This is the **semantic, skill-level** version of the `dz recommend` CLI. `dz recommend`
matches keywords; this skill reads the **live catalog** at runtime and reasons about the
task's real intent, identifies real prerequisites, and judges when one end-to-end skill or npx toolkit
beats a handful of loose skills.

## When to Use

- User asks "which skill / what should I use to do X?" or the Russian equivalents
  ("какой скилл", "чем решить задачу", "посоветуй скиллы").
- The task is multi-step and needs a choice between one covering skill and a sequence.
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
3. Choose the **first strong fit**. A single skill such as `feature-adr` can cover requirements,
   design, implementation, and checks without invented extra steps.
4. Add an execution `pipeline` only for distinct required recommended items. Sequence real
   prerequisites before the main item even when the main item ranks higher by fit.
5. Judge **toolkit-vs-loose-skills**: when a full npx package covers the end-to-end job,
   recommend it as primary.
6. **Flag gaps honestly**: if nothing fits well, say so and suggest `/bto-build` a new
   skill, or `dz scout` for external sources.
7. **Verify every recommended name exists** in the live registry before emitting it.

> **Optional agentdb enhancement.** If the `agentdb-memory` MCP is available, you may
> index the registry into a vector store for semantic recall of past task→skill matches.
> This is OPTIONAL — the skill must work WITHOUT it, using `dz registry` + reasoning.

## Procedure

### Step 1 — Clarify the task

Restate the task in one sentence. If it is genuinely vague (no concrete deliverable,
  multiple plausible interpretations), recommend running `explore` first — do not
guess. If it is concrete, extract: the deliverable, the domain (web/QE/security/research/
web3/devops/mcp/academic…), settled versus unresolved prerequisites, and any user limit
on the first set of recommendations, caveats, or options.

### Step 2 — Retrieve candidates (live catalog)

Run BOTH, and treat their output as the source of truth (not this document):

```bash
dz registry                      # full live list of skills / packs / presets
dz registry search "<keyword>"   # narrow by keyword(s) from the task
dz recommend "<task>"            # keyword baseline to improve upon
```

Note packs and presets too: `dz registry --category <pack>` shows a pack's skills. Record
the keyword baseline so you can show how your semantic answer differs from it.

### Step 3 — Semantic rank + conditional sequence + toolkit judgment

For each candidate, score **fit = high | medium | low** by how well it matches the task's
*real intent*, not just shared keywords. Then:

- **Choose coverage first**: a skill with its own requirements → design → checks flow
  can be the sole high-fit first recommendation. For a concrete feature request with
  settled requirements, `feature-adr` covers that flow; do not insert `explore`, research,
  or QE skills merely because those phases exist inside it.
- **Preserve conditions**: recommend `explore` first only when requirements genuinely need
  clarification. Recommend `goap-research-ed25519` first only when the requested feature
  depends on external facts that must be established before design. State the dependency
  in `why`. A lower-fit prerequisite may rank after the main recommendation but execute
  before it.
- **Compose a pipeline** only from distinct *required* recommended names in execution
  order. A singleton pipeline is valid; omit `pipeline` if the ranked recommendation
  already communicates the only action. Never include a name absent from
  `recommendations`, repeat a name, or put an optional complement in the required sequence.
- **Toolkit-vs-loose-skills**: if a single npx toolkit covers the whole job end-to-end,
  make it the PRIMARY recommendation. Add a loose skill only for an unmet prerequisite
  or a clearly conditional complement; do not turn a package's internal phases into
  extra required steps.
- **Respect the user's limit**: when asked for one first skill or a bounded number of
  caveats/options, give that set. Mention optional complements only if the condition is
  relevant and the limit allows it; keep them outside `pipeline`.

### Step 4 — Output recommendation + gaps

Emit the ranked list (Output Format below), an optional `pipeline`, and a `gaps` section.
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

**Example 0 — "Which first skill takes my feature from requirements through design and checks? One caveat maximum."**
- PRIMARY: `feature-adr` (skill, **high**) — its own flow covers the requested
  requirements, design, implementation, and checks. `install: dz init --target claude-code --select feature-adr`
- **Pipeline:** omit; only one required action exists.
- **Gaps:** at most one material caveat, only if relevant. Do not add optional
  `explore`, research, or QE entries to the first set when requirements are settled.

**Example 0b — "Build a feature whose required regulatory facts have not been researched."**
- PRIMARY by fit: `feature-adr` (skill, **high**) — owns the feature flow.
- `goap-research-ed25519` (skill, **medium**) — required first because the design
  depends on verified external facts; state which facts are missing.
- **Pipeline:** `goap-research-ed25519` → `feature-adr` (execution dependency differs
  from fit rank). Both names appear in `recommendations`.

```json
{
  "task": "Build a feature after verifying the required regulatory facts.",
  "recommendations": [
    {
      "name": "feature-adr",
      "type": "skill",
      "fit": "high",
      "why": "Covers requirements, design, implementation, and checks.",
      "install": "dz init --target claude-code --select feature-adr"
    },
    {
      "name": "goap-research-ed25519",
      "type": "skill",
      "fit": "medium",
      "why": "Verify the required external regulatory facts before design.",
      "install": "dz init --target claude-code --select goap-research-ed25519"
    }
  ],
  "pipeline": ["goap-research-ed25519", "feature-adr"],
  "gaps": []
}
```

**Example 1 — "интерактивный сайт-маршрут по городу" (interactive city-route website; city and audience are settled)**
- PRIMARY: `trip-planner` (npx-package, **high**) — purpose-built travel→mobile-site
  pipeline; covers the whole deliverable. `install: npx @dzhechkov/trip-planner init`
- If city, budget, days, or audience are unresolved, `explore` becomes a required
  prerequisite; then recommend it and use `explore` → `trip-planner`.
- If verified POI facts are required before route design, `goap-research-ed25519` becomes
  a required prerequisite; then recommend it and sequence it before `trip-planner`.
- `frontend-design` is an optional complement if the generated UI needs extra polish.
- **Pipeline:** omit for the settled request; `trip-planner` alone covers the deliverable.
- **Gaps:** no live-transit API skill; trip-planner uses static data.

**Example 2 — "проверить .claude конфиг на безопасность" (audit .claude config security)**
- PRIMARY: `agentshield-scan` (skill, **high**) — scans `.claude/` skills, hooks, MCP,
  settings against 170 rules. `install: dz init --target claude-code --select agentshield-scan`
- `external-comms-gate` (skill, **low**) — optional only if also publishing artifacts publicly.
- `meta` (preset, **medium**) — installs agentshield-scan plus related meta skills in one
  shot. `install: dz setup --target claude-code --preset meta`
- **Pipeline:** omit; `agentshield-scan` is the only required action for config scanning.
- **Gaps:** agentshield scans configs, not app source — pair with `security-audit` for code.

**Example 3 — "написать тесты для модуля" (write tests for a module)**
- `qe-test-generation` (skill, **high**) — generates unit/integration/e2e from code
  analysis. `install: dz init --target claude-code --select qe-test-generation`
- `test-writer` (skill, **medium**) — alternative test authoring route, language-agnostic.
- `tdd-london-chicago` (skill, **medium**) — if the user wants a TDD discipline, not just
  generated tests.
- `qe-engineer` (preset, **medium**) — full 20-skill QE pack if more than authoring is
  needed (coverage, execution, quality gates). `install: dz setup --target claude-code --preset qe-engineer`
- **Pipeline:** omit; `qe-test-generation` covers the requested test writing.
- **Gaps:** none significant — strong QE coverage in the arsenal.

**Example 4 — "глубокое исследование рынка с проверкой источников"**
- PRIMARY: `keysarium` (npx-package, **high**) — 7-phase research pipeline end-to-end.
  `install: npx @dzhechkov/keysarium init`
- `goap-research-ed25519` (skill, **high**) — cryptographically verified anti-hallucination
  research if a single rigorous pass (not the full pipeline) is wanted.
- **Pipeline:** omit when research scope is settled; `keysarium` covers the full job.
- **Gaps:** none — research is well covered.

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Recommending a name not in the catalog | Fabrication — the skill/package doesn't exist | Verify every name against `dz registry` (Step 5) |
| Keyword-only matching | Misses synonyms and real intent (that's just `dz recommend`) | Reason semantically about the task's goal |
| Ignoring npx toolkits | A full pipeline often beats stitching loose skills | Judge toolkit-vs-skills; lead with the toolkit when it fits |
| Forcing multiple skills for one covered task | Duplicates phases already inside the strong fit | Recommend the covering skill alone; sequence only real prerequisites |
| Losing conditions or adding optional steps to `pipeline` | Makes contingent work look mandatory | State each condition and keep optional complements outside required order |
| Omitting the gaps section | Over-sells the arsenal; user wastes time on a poor fit | Always flag gaps; suggest `/bto-build` or `dz scout` when nothing fits |
| Hardcoding the catalog from memory | Catalog drifts; recommendations rot | Retrieve live at runtime every time |
| Install command not matching type | `dz init --target claude-code --select` won't install an npx package | Map type→install per the Output Format table |

## Self-Check

- [ ] Did I restate the task, and defer to `explore` if it was vague?
- [ ] Did I retrieve the LIVE catalog (`dz registry`) and the baseline (`dz recommend`)?
- [ ] Did I improve on the keyword baseline with semantic reasoning?
- [ ] Does one recommendation already cover the task? If so, did I avoid duplicate steps?
- [ ] Is every `pipeline` name recommended, unique, required, and in dependency order?
- [ ] Did I preserve prerequisite conditions and the user's first-set limit?
- [ ] Did I judge toolkit-vs-loose-skills and lead with a toolkit when one fits end-to-end?
- [ ] Does every recommendation have type, fit, why, and a type-matching install command?
- [ ] Did I verify EVERY recommended name exists in the live registry (no fabrication)?
- [ ] Did I include an honest gaps section (with `/bto-build` / `dz scout` if no good fit)?
