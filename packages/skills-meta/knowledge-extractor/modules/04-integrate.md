# Integrate Module — Auto-Placement and Harvest Report

## Purpose

Place approved findings into their target directories as artifact cards, update TOOLKIT_HARVEST.md, generate the harvest report, and trigger post-harvest integrations (memory_store, dream cycles).

## Input

- Findings JSON file (from Module 03, approved findings)
- `templates/artifact-card.md` — per-finding output template
- `templates/harvest-report.md` — session report template
- `TOOLKIT_HARVEST.md` — existing toolkit tracker

## Protocol

### Step 1: Load Approved Findings

1. Read findings JSON file
2. Filter findings with status `approved`
3. Set session status to `integrating`
4. Load artifact card template and harvest report template

### Step 2: Render Artifact Cards

For each approved finding, render the artifact card by filling template placeholders:

| Placeholder | Source |
|-------------|--------|
| `{NAME}` | finding.title |
| `{CATEGORY}` | finding.category |
| `{MATURITY_BADGE}` | Lookup from maturity-model.md: alpha=🔴, beta=🟡, stable=🟢 |
| `{MATURITY_LEVEL}` | finding.maturity (capitalized) |
| `{CONFIDENCE}` | finding.confidence |
| `{SOURCE_PROJECT}` | session.slug |
| `{DATE}` | current date (YYYY-MM-DD) |
| `{DESCRIPTION}` | finding.content |
| `{WHEN_TO_USE}` | finding.when_to_use |
| `{WHEN_NOT_TO_USE}` | finding.when_not_to_use |
| `{EXAMPLE}` | finding.example |

### Step 3: Auto-Place by Category

Place each rendered artifact card according to its category:

| Category | Placement Action |
|----------|-----------------|
| **skills** | Create `.claude/skills/{name}/SKILL.md` with the artifact card as initial skeleton. Add frontmatter (trust_tier: 0, trust_tier_label: "Advisory"). |
| **commands** | Create `.claude/commands/{name}.md` with `$ARGUMENTS` parameter reference and the artifact card content as the command body. |
| **hooks** | Append artifact card to TOOLKIT_HARVEST.md under `## Хуки` section. Create the section if it doesn't exist. |
| **rules** | Create `.claude/rules/{name}.md` with the artifact card content formatted as a rule table (anti-pattern detection format). |
| **templates** | Append artifact card to TOOLKIT_HARVEST.md under `## Шаблоны` section. |
| **patterns** | Append artifact card to TOOLKIT_HARVEST.md under `## Паттерны` section. |
| **snippets** | Append artifact card to TOOLKIT_HARVEST.md under `## Сниппеты` section. |

**Naming convention:** Convert finding title to kebab-case for file/directory names. Max 40 characters.

**Collision handling:** If a file already exists at the target path:
- Do NOT overwrite
- Log: "Skipped placement for #{N} — target already exists: {path}"
- Set finding status to `approved` (not `integrated`) and flag for manual review

### Step 4: Update TOOLKIT_HARVEST.md

After placing all artifacts:

1. Update the "Обработанные проекты" table:
```markdown
| Проект | Дата harvest | Извлечено артефактов |
|--------|-------------|---------------------|
| {slug} | {date} | {approved_count} approved / {total_count} total |
```

2. Mark checked items in the relevant sections (skills, patterns, commands, etc.)

### Step 5: Generate Harvest Report

Fill the harvest report template with computed metrics:

| Metric | Computation |
|--------|-------------|
| TOTAL_EXTRACTED | Count of all findings at creation |
| AFTER_DEDUP | Count after Module 02 dedup |
| USER_REMOVALS | Count where status = `removed` AND not from dedup |
| USER_MERGES | Count where merged_from is not null |
| APPROVED_COUNT | Count where status = `approved` or `integrated` |
| BLOCKED_COUNT | Count where status = `blocked` |
| OVERRIDE_COUNT | Sum of all gate_overrides arrays |
| PLACED_COUNT | Count where status = `integrated` |

Display the report to the user.

### Step 6: Post-Harvest Integration

1. **memory_store()** — Store harvest results:
```json
{
  "case_slug": "{slug}",
  "domain": "{domain}",
  "phase": "harvest",
  "skill_used": "knowledge-extractor",
  "reward": "{user_reward}",
  "reward_label": "{label}",
  "context": {
    "patterns_loaded": "{count}",
    "extractors_spawned": "{lens_list}",
    "scope_filter": "{filter_or_null}"
  },
  "outcome": {
    "artifacts_created": "{placed_files_list}",
    "total_extracted": "{N}",
    "total_approved": "{N}",
    "total_placed": "{N}",
    "gate_pass_rate": "{rate}"
  }
}
```

2. **Dream trigger** — Update `.keysarium/insights/trigger-state.json`:
```json
{
  "event_type": "case_completion",
  "timestamp": "ISO-8601",
  "details": "Harvest completed for {slug}: {placed_count} artifacts placed"
}
```

3. **Clean up** — Delete the findings JSON file ONLY after confirming all placements succeeded and the harvest report was written. If any placement failed or the report could not be generated, keep the findings JSON as a recovery artifact and log: `"Findings JSON retained at {path} — manual review needed."`

### Step 7: Final Display

Show the user a completion summary:

```
═══════════════════════════════════════════════════════
✅ HARVEST COMPLETE: {SESSION_ID}

Extracted: {N} → Approved: {M} → Placed: {P}

Placed artifacts:
  📁 .claude/skills/agent-swarm-topology/SKILL.md
  📁 .claude/rules/domain-detection.md
  📄 TOOLKIT_HARVEST.md (3 entries added)

Gate pass rate: {rate}%
Memory reward stored: {score} ({label})

Run /bto-test on placed skills for promotion to Tier 2.
═══════════════════════════════════════════════════════
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Overwriting existing files | Target file already exists | NEVER overwrite; skip and flag for manual review |
| Placing blocked findings | Finding status is `blocked` | Only place findings with status `approved` |
| Missing TOOLKIT_HARVEST.md sections | Section header doesn't exist yet | Create the section before appending |
| Forgetting to update "Обработанные проекты" | Table not updated after placement | Always update as the last TOOLKIT_HARVEST.md operation |
| Leaving findings JSON behind | Temp file not cleaned up | Delete after successful report generation |
