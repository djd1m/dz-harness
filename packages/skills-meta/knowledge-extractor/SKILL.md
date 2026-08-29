---
name: knowledge-extractor
description: >
  Multi-agent knowledge harvesting system that extracts reusable patterns, commands,
  rules, templates, and snippets from any project directory. Uses 5 parallel extractor
  agents, 7-category classification, 8 blocking quality gates, and auto-placement.
  Triggers on "harvest", "extract knowledge", "извлеки знания", "/harvest".
trust_tier: 2
trust_tier_label: "Validated"
bto_score: 7.5
bto_date: "2026-03-03"
trust_tier_path: "Run /bto-test, score >= 8.5 + eval tests for Tier 3"
---

# Knowledge Extractor

> Domain-agnostic multi-agent system for extracting, classifying, gating, and placing
> reusable knowledge from completed projects into the toolkit.

## When To Activate

Trigger on:
- `/harvest [path]` or `/harvest all`
- "extract knowledge from [path]"
- "извлеки знания из [path]"
- "harvest patterns from [project]"
- "что можно переиспользовать из [project]"

## What You Get

After a successful harvest session:
- **Findings JSON** — structured extraction results at `.keysarium/harvest/findings-{SESSION_ID}.json`
- **Placed artifacts** — skills, commands, and rules placed in `.claude/skills/`, `.claude/commands/`, `.claude/rules/`
- **TOOLKIT_HARVEST.md** — updated with new patterns, templates, snippets, and hooks
- **Harvest report** — session summary with metrics (extracted → approved → placed counts, gate pass rates)
- **Memory record** — reward data stored via `memory_store()` for future session optimization

## Architecture

```
.claude/skills/knowledge-extractor/
├── SKILL.md                              ← This file (orchestrator)
├── modules/
│   ├── 01-extract.md                     ← 5 parallel extractor agents
│   ├── 02-classify.md                    ← 7-category classification + dedup
│   ├── 03-gate.md                        ← 8 quality gates (2-pass)
│   └── 04-integrate.md                   ← Auto-placement + harvest report
├── references/
│   ├── quality-gates.md                  ← Gate definitions (G1-G8)
│   ├── artifact-categories.md            ← 7 categories with destinations
│   └── maturity-model.md                 ← Alpha → Beta → Stable
└── templates/
    ├── artifact-card.md                  ← Per-finding output template
    └── harvest-report.md                 ← Session summary template
```

## Modules

| Module | Purpose | Agents | Model |
|--------|---------|--------|-------|
| 01-extract | Scan project via 5 focused lenses | 5 parallel | sonnet |
| 02-classify | Assign categories, deduplicate, cross-ref | 0 (inline) | — |
| 03-gate | Evaluate 8 quality gates in 2 passes | 1 (semantic) | haiku |
| 04-integrate | Place artifacts, generate report | 0 (inline) | — |

## Pipeline Protocol

### Step 0: Initialize Session

1. Parse arguments: `{TARGET_PATH}` (directory or "all"), `{SCOPE_FILTER}` (optional `only X,Y`)
2. **Resolve target path:**
   - If `{TARGET_PATH}` is a specific directory → validate it exists, set `{slug}` = directory basename
   - If `{TARGET_PATH}` is `"all"` → list all subdirectories in `researches/`. For each directory, run a separate harvest session (each gets its own findings JSON, session ID, and pipeline run). Merge reports at the end.
   - If `{TARGET_PATH}` does not exist → report error and stop
3. **Resolve domain:** If running inside a `/casarium` pipeline, inherit `{domain}` from Phase 0 discovery. If standalone, detect domain from file content keywords (banking/retail/enterprise/healthcare). If unable to detect, set `{domain}` = `"unknown"`.
4. Generate session ID: `{slug}-{YYYYMMDDHHmmss}`
5. If `TOOLKIT_HARVEST.md` does not exist at repo root → create it with a standard skeleton (title + empty section headers for each category).
6. Call `memory_query({phase: "harvest", domain, slug, skill: "knowledge-extractor"})`
7. Log loaded patterns count

### Step 1: Extract (Module 01)

```
Read: modules/01-extract.md
```

Spawn 5 parallel extractor agents (sonnet), each with a focused lens:

| Agent | Lens | Seeks |
|-------|------|-------|
| extractor-patterns | patterns | Architecture patterns, design patterns, agent topologies |
| extractor-commands | commands | Scripts, CLI workflows, pipeline stages, automation |
| extractor-rules | rules | Constraints, anti-patterns, lessons learned, domain rules |
| extractor-templates | templates | Document structures, config templates, diagram templates |
| extractor-snippets | snippets | Reusable code fragments, hooks, utility functions |

Each agent returns numbered findings with reusability confidence (0.0-1.0).
Orchestrator merges all findings into a single numbered list and writes to JSON:
`.keysarium/harvest/findings-{SESSION_ID}.json`

**Scope filtering:** If `{SCOPE_FILTER}` is set, only spawn matching agents. See mapping in `references/artifact-categories.md`.

### Step 2: Classify (Module 02)

```
Read: modules/02-classify.md
Read: references/artifact-categories.md
```

1. Read findings from JSON file
2. Assign each finding to one of 7 categories
3. Deduplicate: check content similarity across findings and against TOOLKIT_HARVEST.md
4. Cross-reference: link findings that reference existing skills/commands
5. Write classified findings back to JSON

### Step 3: User Checkpoint (Interactive)

Display all findings grouped by category as a numbered list:

```
═══════════════════════════════════════════════════════
📋 HARVEST FINDINGS: {N} items extracted

## patterns (K items)
#1  [0.85] Agent Swarm Topology — parallel agents with merge pattern
#4  [0.72] Event-Driven Pipeline — phase-to-phase data flow via files

## rules (M items)
#2  [0.91] Domain Detection Rule — auto-detect domain from keywords
#7  [0.65] Regulatory Constraint — ФЗ-152 data isolation requirement

## snippets (P items)
#3  [0.78] CJM Renderer — universal React component for CJM display
...

Commands:
• "убери #N"                    — remove finding
• "переклассифицируй #N в X"   — reclassify to category X
• "доработай #N"                — expand/improve finding
• "объедини #N и #M"            — merge two findings
• "покажи только X"             — filter by category
• "ок"                          — proceed to quality gates
═══════════════════════════════════════════════════════
```

Apply user mutations to JSON file. Numbers are stable (removed items leave gaps).
Loop until user says "ок".

### Step 4: Gate (Module 03)

```
Read: modules/03-gate.md
Read: references/quality-gates.md
```

Evaluate each active finding against 8 quality gates in 2 passes:

**Pass 1 — Deterministic (zero LLM cost):**
- G1: Has "When to use" section
- G2: Has "When NOT to use" section
- G5: Reusability confidence >= 0.5
- G6: Not a duplicate of existing toolkit entry
- G7: Has maturity label (alpha/beta/stable)

**Pass 2 — Semantic (haiku agent):**
- G3: Properly decontextualized (no project-specific refs)
- G4: Has at least one concrete example
- G8: Passes brutal-honesty review (self-critical assessment)

Findings passing all gates → status `approved`.
Findings failing any gate → status `blocked` with gate IDs.

Display blocked findings and allow overrides:
```
⚠️ BLOCKED: #7 — failed G3 (project-specific references remain)
• "пропусти G3 для #7" — override gate
• "ок" — accept blocks, proceed with approved only
```

### Step 5: Integrate (Module 04)

```
Read: modules/04-integrate.md
Read: templates/artifact-card.md
Read: templates/harvest-report.md
```

1. Render artifact cards for each approved finding
2. Auto-place by category:
   - `skills` → create `.claude/skills/<name>/SKILL.md` (skeleton)
   - `commands` → create `.claude/commands/<name>.md`
   - `hooks` → document in TOOLKIT_HARVEST.md (hooks section)
   - `rules` → create `.claude/rules/<name>.md`
   - `templates` → document in TOOLKIT_HARVEST.md (templates section)
   - `patterns` → document in TOOLKIT_HARVEST.md (patterns section)
   - `snippets` → document in TOOLKIT_HARVEST.md (snippets section)
3. Update TOOLKIT_HARVEST.md "Обработанные проекты" table
4. Generate harvest report
5. Call `memory_store()` with harvest results and user reward
6. Update `.keysarium/insights/trigger-state.json` (case_completion event)
7. Clean up findings JSON file

## Scope Filtering

The `only` keyword filters which extractor agents are spawned:

```
/harvest path/                      → all 5 agents
/harvest path/ only patterns        → extractor-patterns only
/harvest path/ only rules,templates → extractor-rules + extractor-templates
/harvest all only snippets          → extractor-snippets for each directory
```

Category-to-agent mapping (see `references/artifact-categories.md`):
- patterns → extractor-patterns
- commands → extractor-commands
- hooks → extractor-commands (shared lens)
- rules → extractor-rules
- templates → extractor-templates
- snippets → extractor-snippets
- skills → all agents (skills are cross-cutting)

## Integration Points

| System | When | Operation |
|--------|------|-----------|
| memory_query() | Pipeline start | Load historical harvest patterns |
| memory_store() | After user checkpoint | Store harvest reward data |
| brain-export | N/A (passive) | Findings JSON is brain-compatible schema |
| BTO | Post-harvest | Placed skills can be evaluated via `/bto-test` |
| dream cycles | Pipeline end | Update trigger-state.json |
| /harvest command | Entry point | Thin wrapper loads this skill |

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Extracting project-specific details | Finding contains project names, slugs, dates | Decontextualize: replace specifics with generic placeholders |
| Duplicate extraction | content_hash matches existing TOOLKIT_HARVEST.md entry | Skip or merge; gate G6 blocks duplicates |
| Extracting from incomplete phases | Artifact lacks promise tag or checkpoint | Only harvest from completed projects |
| Over-classifying snippets as patterns | Single-use code without abstraction | Require reuse evidence before promoting to pattern |
| Under-specifying maturity | All findings marked "stable" on first run | First extraction is always "alpha" or "beta" |
| Skipping user checkpoint | Proceeding to gates without user review | BLOCK — user checkpoint is mandatory |
| Running all agents when scope is filtered | `only patterns` but 5 agents spawned | Check SCOPE_FILTER before spawning |

## Dependencies

| Resource | Path | Purpose |
|----------|------|---------|
| quality-gates.md | references/quality-gates.md | Gate definitions for Module 03 |
| artifact-categories.md | references/artifact-categories.md | 7-category taxonomy |
| maturity-model.md | references/maturity-model.md | Alpha/Beta/Stable criteria |
| artifact-card.md | templates/artifact-card.md | Per-finding output format |
| harvest-report.md | templates/harvest-report.md | Session report format |
