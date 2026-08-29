---
description: "Import a portable brain container into the current project"
argument: "path to brain JSON file"
---

# Brain Import — Load External Knowledge

Import a previously exported brain container to bootstrap knowledge in a new project.

Supports v1.0 (legacy) and v1.1 (manifest + delta) containers.

## Protocol

### Step 1: Validate Brain File

1. Read the JSON file from `$ARGUMENTS`
2. Validate format:
   - `format` field is `"keysarium-brain"`
   - `version` field exists and is `"1.0"` or `"1.1"`
   - Required sections present: `skills`, `harvest_patterns`, `metadata`
3. If validation fails → show error and stop

### Step 1a: Read Manifest (v1.1)

If `version` is `"1.1"` and `manifest` object exists:

1. Display manifest summary:
   ```
   ═══════════════════════════════════════════════════════
   Brain Manifest

   Source: [manifest.source_project]
   Branch: [manifest.source_branch]
   Created: [manifest.created_at]
   Checksum: sha256:[first 12 chars]...
   Type: [full | delta (parent: manifest.parent)]

   Contents:
     Domains: [manifest.domains]
     Skills: [manifest.skills] ([count])
     Research summaries: [manifest.research_count]
     Harvest patterns: [manifest.harvest_pattern_count]
     Total records: [manifest.record_count]
     Size: [manifest.size_bytes] bytes
   ═══════════════════════════════════════════════════════
   ```

2. Verify integrity: compute SHA-256 of content sections, compare with `manifest.checksum`
   - If match → display "Integrity: verified"
   - If mismatch → display "WARNING: Checksum mismatch! File may be corrupted or manually edited."
   - Checksum mismatch does NOT block import — it is a warning only

### Step 1b: Resolve Delta (v1.1, COW mode)

If `manifest.parent` is not null (this is a delta container):

1. Log: "Delta container detected. Parent: [manifest.parent]"
2. Search for parent file:
   - Same directory as the delta file
   - Project root directory
   - If not found → ask user: "Parent file [name] not found. Provide path or type 'partial' for partial import"
3. If parent found:
   a. Load parent file
   b. If parent also has `manifest.parent` → resolve recursively (chain)
   c. If chain depth > 3 → warn: "Deep delta chain (depth [N]). Consider re-exporting a full brain."
   d. Verify `manifest.parent_checksum` matches parent's actual checksum (warn if mismatch)
   e. Apply JSON Patch (RFC 6902) operations from `patch` array to parent content
   f. Result = fully materialized brain container. Proceed with standard import.
4. If parent NOT found and user chose 'partial':
   - Extract only self-contained `add` operations from `patch` array
   - Convert each `add` value to a standalone entry
   - Proceed with import using only these extracted entries
   - Log: "Partial import: [N] add operations applied, [M] operations skipped (require parent context)"

### Step 2: Selective Import

Ask user what to import:

```
Brain file: [filename]
Source project: [source_project]
Exported: [exported_at or manifest.created_at]

Available sections:
  [1] Skills metadata ([N] skills) — trust tiers and BTO scores
  [2] Domain patterns ([N] domains) — rules, pitfalls, strategies
  [3] Research summaries ([N] cases) — findings and CJM choices
  [4] Harvest patterns ([N] patterns) — reusable patterns and snippets
  [5] Pipeline metrics — timing and performance data
  [6] Reward data — phase averages and top patterns
  [A] All sections

Which sections to import? (comma-separated numbers or 'A' for all)
```

### Step 3: Merge Strategy

For each imported section:

**Skills metadata:**
- Update trust_tier in SKILL.md files if imported tier is HIGHER than current
- Never downgrade a tier
- Log: "Skill [name]: tier [old] → [new] (from [source_project])"

**Domain patterns:**
- Append to existing domain knowledge (no overwrite)
- Deduplicate by pattern name
- Mark imported patterns with source: `[imported from: source_project, date]`

**Research summaries:**
- Store in `TOOLKIT_HARVEST.md` under "## Imported Research Summaries"
- Read-only reference (don't create research directories)

**Harvest patterns:**
- Merge into `TOOLKIT_HARVEST.md`
- Deduplicate by content_hash
- Preserve maturity level from source

**Pipeline metrics:**
- Store as reference baseline
- Don't overwrite current project metrics

**Reward data:**
- Store phase averages as reference in `.keysarium/memory/_stats/imported-baselines.json`
- Don't overwrite existing reward records

### Step 4: Write Import Log

Create `brain-import-log-[YYYY-MM-DD].md` in project root:

```markdown
# Brain Import Log

- Source: [filename]
- Source project: [source_project]
- Version: [version]
- Type: [full | delta]
- Checksum verified: [yes | no | n/a (v1.0)]
- Imported at: [timestamp]
- Sections imported: [list]

## Changes Made
- [list of all changes with before/after]

## Conflicts Resolved
- [any deduplication or merge decisions]

## Delta Resolution (if applicable)
- Parent: [parent filename]
- Chain depth: [N]
- Patch operations applied: [N]
```

### Step 5: Summary

```
═══════════════════════════════════════════════════════
Brain Import Complete

Source: [filename]
Version: [version] | Type: [full|delta]
Integrity: [verified | warning | n/a]
Sections imported: [list]
Skills updated: [N]
Patterns merged: [N]
Conflicts resolved: [N]

Import log: brain-import-log-[date].md

• "ок" — done
• "покажи лог" — show full import log
═══════════════════════════════════════════════════════
```

## Modular Reuse

The import protocol handles:
- Version compatibility checking (v1.0 and v1.1)
- Manifest integrity verification (v1.1)
- Delta resolution with parent chain (v1.1 COW)
- Selective import (user chooses sections)
- Merge-not-overwrite strategy
- Conflict resolution with logging
- Audit trail via import log

These patterns work for any knowledge transfer between projects.
