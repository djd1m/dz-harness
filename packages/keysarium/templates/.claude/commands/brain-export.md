---
description: "Export accumulated knowledge as a portable brain container (JSON)"
argument: "optional path to specific research directory, 'all' for everything, or '--delta <parent-file>' for COW export"
---

# Brain Export — Portable Knowledge Container

Export accumulated knowledge, patterns, and evaluations into a portable JSON container
that can be imported into other projects.

Supports **full export** (default) and **delta export** (COW mode, v1.1).

## Protocol

### Step 1: Parse Arguments & Detect Mode

1. If `$ARGUMENTS` contains `--delta <path>`:
   - Set mode = `delta`
   - Load parent brain file from `<path>`
   - Verify parent is valid (`format` = `"keysarium-brain"`, has `manifest` or `version`)
   - If parent has `manifest.checksum`, note it for verification
   - Remaining arguments = export scope
2. Otherwise: set mode = `full`
3. If `$ARGUMENTS` specifies a path (not `--delta`), export only from that directory
4. If `$ARGUMENTS` is "all" or empty, export from all sources

### Step 2: Scan Knowledge Sources

Scan the following sources for exportable knowledge:
1. `TOOLKIT_HARVEST.md` — harvested patterns and learnings
2. `researches/*/` — all completed research directories
3. `.claude/skills/*/SKILL.md` — skill metadata and trust tiers
4. BTO evaluation reports (if any exist in researches)
5. `.keysarium/memory/` — reward data aggregates (if exists)

### Step 3: Build Brain Container

Construct a JSON structure (v1.1 with manifest):

```json
{
  "version": "1.1",
  "format": "keysarium-brain",
  "manifest": {
    "created_at": "[ISO 8601 timestamp]",
    "source_project": "[project directory name]",
    "source_branch": "[current git branch]",
    "checksum": "sha256:[computed after content assembly]",
    "record_count": "[total items across all sections]",
    "domains": ["[list of domains found]"],
    "skills": ["[list of skill names found]"],
    "research_count": "[number of research summaries]",
    "harvest_pattern_count": "[number of harvest patterns]",
    "size_bytes": "[approximate payload size]",
    "parent": null,
    "parent_checksum": null,
    "delta_type": null
  },

  "skills": {
    "[skill-name]": {
      "trust_tier": "0-3",
      "trust_tier_label": "Advisory|Structured|Validated|Verified",
      "bto_score": "null or float",
      "last_evaluated": "null or ISO date"
    }
  },

  "domain_patterns": {
    "[domain]": {
      "rules_applied": ["list of domain rules"],
      "common_pitfalls": ["list"],
      "successful_strategies": ["list"]
    }
  },

  "research_summaries": [
    {
      "slug": "[case-slug]",
      "domain": "[detected domain]",
      "phases_completed": ["list of completed phases"],
      "key_findings": ["top 3-5 findings"],
      "chosen_cjm_variant": "A|B|C|D or null",
      "presentation_score": "null or float"
    }
  ],

  "harvest_patterns": [
    {
      "category": "skills|commands|rules|templates|patterns|snippets",
      "name": "[pattern name]",
      "description": "[what it does]",
      "maturity": "beta|stable",
      "used_in": ["project list"],
      "content_hash": "[SHA-256 of content]"
    }
  ],

  "pipeline_metrics": {
    "total_cases_processed": 0,
    "avg_phase_times": {},
    "most_common_domain": null,
    "bto_evaluations_run": 0
  },

  "reward_data": {
    "total_records": 0,
    "domains": [],
    "phase_averages": {},
    "top_patterns": [],
    "most_reused_records": [],
    "total_usage_count": 0,
    "exported_from": ".keysarium/memory/"
  },

  "metadata": {
    "export_scope": "all|[specific path]",
    "files_scanned": 0,
    "patterns_extracted": 0
  }
}
```

### Step 3a: Compute Manifest

After assembling all content sections:

1. Serialize all sections except `manifest` as JSON (sorted keys, compact)
2. Compute SHA-256 of the serialized string
3. Set `manifest.checksum` = `"sha256:{64-hex-chars}"`
4. Count total records: skills + research_summaries + harvest_patterns
5. Set `manifest.record_count`, `manifest.domains`, `manifest.skills`, `manifest.research_count`, `manifest.harvest_pattern_count`
6. Set `manifest.size_bytes` = byte length of serialized content

### Step 3b: Delta Mode (if mode = delta)

If exporting in delta mode:

1. Compare current full container with parent container section by section
2. Generate JSON Patch (RFC 6902) operations:
   - `add` for new entries (new skills, new research summaries, new patterns)
   - `replace` for changed values (updated trust tiers, new BTO scores)
   - `remove` for deleted entries (rare)
3. If patch is empty → log "No changes since parent export" and stop
4. Build delta container:
   ```json
   {
     "version": "1.1",
     "format": "keysarium-brain",
     "manifest": {
       "...same fields...",
       "parent": "[parent-filename]",
       "parent_checksum": "sha256:[parent's checksum]",
       "delta_type": "rfc6902"
     },
     "patch": [ ...RFC 6902 operations... ]
   }
   ```
5. `manifest.checksum` = SHA-256 of the `patch` array
6. `manifest.record_count` = number of patch operations

### Step 4: Write Export File

- **Full mode:** Write to `keysarium-brain-[YYYY-MM-DD].json` in project root
- **Delta mode:** Write to `keysarium-brain-[YYYY-MM-DD]-delta.json` in project root

### Step 5: Generate Summary

Display:
```
═══════════════════════════════════════════════════════
Brain Export Complete

Mode: [full|delta]
File: keysarium-brain-[date].json
Size: [file size]
Checksum: sha256:[first 12 chars]...
Parent: [parent filename or "none"]

Skills exported: [N] (tiers: [breakdown])
Research summaries: [N]
Harvest patterns: [N]
Domain patterns: [N domains]
Reward data: [N records aggregated]

Import into another project:
  /brain-import keysarium-brain-[date].json

• "ок" — done
• "покажи [section]" — preview section
═══════════════════════════════════════════════════════
```

## Modular Reuse

This export format is project-agnostic. Any multi-phase pipeline can:
1. Define its own brain schema extending the base format
2. Export domain-specific patterns
3. Import patterns from other pipelines
4. Use delta mode for efficient incremental exports
