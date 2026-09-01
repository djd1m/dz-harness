---
description: >
  Knowledge extraction from the current project into reusable toolkit artifacts.
  Scans codebase, classifies findings, decontextualizes, and integrates into toolkit.
  $ARGUMENTS: mode (quick/full/marker) + optional scope ("only patterns", "only rules", etc.)
---

# /harvest $ARGUMENTS

## Role

Knowledge harvester. You extract reusable artifacts from the current project —
patterns, commands, hooks, rules, templates, snippets, skills — and integrate
them into the toolkit as generalized, documented, versioned entries.

## Skill Reference

Read the skill: `.claude/skills/knowledge-extractor/SKILL.md`

**IMPORTANT:** Read the skill BEFORE executing. It contains:
- 4-phase pipeline with checkpoints
- Swarm agent definitions for Phase 1
- 7 artifact categories with criteria
- Decontextualization guide
- Quality gate for Phase 3
- Templates for all outputs

## Quick Reference

### Modes

| Mode | Trigger | What Happens |
|------|---------|-------------|
| `marker` | `/harvest marker [description]` | Append to TOOLKIT_HARVEST.md |
| `quick` | `/harvest quick` or `/harvest` | Auto scan + classify + report (no checkpoints) |
| `full` | `/harvest full` | 4-phase pipeline with checkpoints |

### Execution

1. Determine mode from $ARGUMENTS (default: quick)
2. Read skill: `.claude/skills/knowledge-extractor/SKILL.md`
3. If mode == marker: create/append TOOLKIT_HARVEST.md; marker does not invoke `write-insight.cjs`; done
4. If mode == quick: run all 4 phases without checkpoints, then run the required insight gate
5. If mode == full: run with checkpoints after each phase, then run the required insight gate

### Phase Summary

```
Phase 1: AGENT REVIEW — scan codebase with 5 parallel agents
Phase 2: CLASSIFY — categorize into 7 artifact types, filter exclusions
Phase 3: DECONTEXTUALIZE — generalize, document, version
Phase 4: INTEGRATE — write to toolkit, update index, harvest report
Gate 5: PERSIST INSIGHT — quick/full must receive a valid writer receipt before completion
```

### Phase 1 positive file receipts (required)

Before the five-agent dispatch, allocate one `RUN_ID`, then assign every perspective a unique
`WORK_UNIT_ID` and absolute `TRACE_PATH`. Require each agent to write a substantive body ending in
`Status: completed` or `Status: failed` to `TRACE_PATH` before returning a one-line pointer. Before
classification or synthesis, verify every path is a regular non-symlink file, non-whitespace,
post-launch, and terminal. Narrative output or silence is not a receipt. Name missing, stale, partial,
unreadable, duplicate, failed, dead-PID, or probe-error perspectives and refuse harvest completion
unless every required receipt is valid and completed. See `.claude/rules/swarm-file-evidence.md`.

## REQUIRED INSIGHT PERSISTENCE GATE (quick/full only)

After Phase 4 and before the normal harvest completion report:

1. Select one specific, reusable finding from this run. Populate all fields in this JSON object:
   `date` (`YYYY-MM-DD`, owned by this caller), `title`, `tags` (array), `problem`, `solution`, and
   `references` (array). Do not invent a generic record merely to satisfy the gate.
2. If the run produced no candidate, write nothing and report exactly that insight capture remains
   incomplete because no candidate was found. This is distinct from silently skipping the gate.
3. Otherwise, write the JSON to a temporary UTF-8 file outside `.claude/insights/`, then pass its
   bytes on stdin to the project-root helper `.claude/hooks/write-insight.cjs`. Do not put record
   contents in shell arguments. The helper owns lazy carrier creation, append preservation, and
   exact-repeat suppression. It establishes the Markdown source of truth first, then attempts a
   best-effort idempotent `dz teach` duplicate.
4. Require exit zero and parse exactly one JSON receipt. Only `created`, `appended`, or `duplicate`
   is valid. Verify `.claude/insights/index.md` exists after `created` or `appended`. The nested
   `teach.state` is optional-projection observability, not a second persistence receipt.
5. Delete the temporary JSON only after a valid receipt. Include its status and `entryCount` in the
   completion report, plus `teach.state` when present. A failed teach retains Markdown and does not
   block completion. If the writer exits non-zero or its receipt is absent/malformed, MUST NOT report
   the harvest as completed; show the persistence failure and keep the input for diagnosis.

`marker` mode is only a future-work marker: it does not invoke `write-insight.cjs`, does not create
`.claude/insights/`, and does not claim a completed quick/full harvest.

### Module References

| Phase | Module |
|-------|--------|
| Phase 1 | `.claude/skills/knowledge-extractor/modules/01-agent-review.md` |
| Phase 2 | `.claude/skills/knowledge-extractor/modules/02-classify.md` |
| Phase 3 | `.claude/skills/knowledge-extractor/modules/03-decontextualize.md` |
| Phase 4 | `.claude/skills/knowledge-extractor/modules/04-integrate.md` |

### Reference Files

| Topic | File |
|-------|------|
| Artifact categories | `.claude/skills/knowledge-extractor/references/artifact-categories.md` |
| Maturity model | `.claude/skills/knowledge-extractor/references/maturity-model.md` |
| Decontextualization | `.claude/skills/knowledge-extractor/references/decontextualization-guide.md` |

### Templates

| Template | File |
|----------|------|
| TOOLKIT_HARVEST.md | `.claude/skills/knowledge-extractor/templates/toolkit-harvest.md` |
| Artifact card | `.claude/skills/knowledge-extractor/templates/artifact-card.md` |
| Harvest report | `.claude/skills/knowledge-extractor/templates/harvest-report.md` |

## Checkpoint Commands (full mode)

| Command | Action |
|---------|--------|
| `ок` | Next phase |
| `добавь [finding]` | Add manual finding |
| `убери #N` | Remove finding |
| `переклассифицируй #N` | Change category |
| `доработай #N` | Improve artifact |
| `покажи #N` | Preview artifact |

## Critical Rules

### ALWAYS
- Read skill SKILL.md before executing
- Use swarm agents (Task tool) for Phase 1 — parallel extraction
- Apply exclusion filter in Phase 2 (no domain code, no unvalidated patterns)
- Decontextualize in Phase 3 (no project-specific references)
- Assign maturity level to every artifact
- Record provenance (source project, date)
- For quick/full with a real finding, persist one insight and validate the writer receipt before completion

### NEVER
- Don't copy code verbatim — always decontextualize
- Don't extract domain-specific business logic
- Don't extract library workarounds without expiry dates
- Don't skip Phase 3 — undecontextualized artifacts are tech debt
- Don't set maturity higher than 🔴 Alpha for first extraction
- Don't report quick/full completion after a failed or unestablished insight write
