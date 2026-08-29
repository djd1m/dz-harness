# Harvest Report Template

## Usage
Generated at the end of Module 04 (Integrate) to summarize the harvest session.
All {PLACEHOLDER} values are computed from the findings registry.

## Template

---

# Harvest Report: {SESSION_ID}

**Date:** {DATE}
**Target:** {TARGET_PATHS}
**Scope:** {SCOPE_FILTER_OR_ALL}
**Steps completed:** {STEPS_COMPLETED} (Extract → Classify → Checkpoint → Gate → Integrate)

## Summary

| Metric | Value |
|--------|-------|
| Total findings extracted | {TOTAL_EXTRACTED} |
| After deduplication | {AFTER_DEDUP} |
| User removals | {USER_REMOVALS} |
| User merges | {USER_MERGES} |
| Approved (passed gates) | {APPROVED_COUNT} |
| Blocked (failed gates) | {BLOCKED_COUNT} |
| Gate overrides | {OVERRIDE_COUNT} |
| Placed artifacts | {PLACED_COUNT} |

## Findings by Category

| Category | Extracted | Approved | Placed | Destination |
|----------|-----------|----------|--------|-------------|
| skills | {N} | {N} | {N} | .claude/skills/ |
| commands | {N} | {N} | {N} | .claude/commands/ |
| hooks | {N} | {N} | {N} | TOOLKIT_HARVEST.md |
| rules | {N} | {N} | {N} | .claude/rules/ |
| templates | {N} | {N} | {N} | TOOLKIT_HARVEST.md |
| patterns | {N} | {N} | {N} | TOOLKIT_HARVEST.md |
| snippets | {N} | {N} | {N} | TOOLKIT_HARVEST.md |

## Quality Gate Results

| Gate | Pass | Fail | Override | Pass Rate |
|------|------|------|----------|-----------|
| G1 When-To-Use | {N} | {N} | {N} | {%} |
| G2 When-Not-To-Use | {N} | {N} | {N} | {%} |
| G3 Decontextualized | {N} | {N} | {N} | {%} |
| G4 Concrete Example | {N} | {N} | {N} | {%} |
| G5 Reusability | {N} | {N} | {N} | {%} |
| G6 Not Duplicate | {N} | {N} | {N} | {%} |
| G7 Maturity Label | {N} | {N} | {N} | {%} |
| G8 Brutal Honesty | {N} | {N} | {N} | {%} |

## Coverage Gaps

| Item | Reason |
|------|--------|
| {SKIPPED_FILES_TABLE_OR_NONE} | |

**Failed extractors:** {FAILED_EXTRACTORS_OR_NONE}

## Confidence Distribution

| Range | Count | Percentage |
|-------|-------|------------|
| 0.9 - 1.0 (Excellent) | {N} | {%} |
| 0.7 - 0.89 (Good) | {N} | {%} |
| 0.5 - 0.69 (Acceptable) | {N} | {%} |
| < 0.5 (Below threshold) | {N} | {%} |

## Memory Integration

- Patterns loaded from memory: {MEMORY_PATTERNS_COUNT}
- Reward stored: {REWARD_SCORE} ({REWARD_LABEL})
- Dream trigger updated: {YES_NO}

---

## Placeholder Reference

| Placeholder | Computation |
|-------------|-------------|
| {SESSION_ID} | HarvestSession.session_id |
| {DATE} | Current date (YYYY-MM-DD) |
| {TARGET_PATHS} | Directory path(s) scanned |
| {SCOPE_FILTER_OR_ALL} | Scope filter value or "all categories" |
| {STEPS_COMPLETED} | Count of pipeline steps that ran successfully |
| {TOTAL_EXTRACTED} | count(all findings at extraction) |
| {AFTER_DEDUP} | count(findings after Module 02 dedup) |
| {USER_REMOVALS} | count(findings removed by user at checkpoint) |
| {USER_MERGES} | count(findings with non-null merged_from) |
| {APPROVED_COUNT} | count(findings where status = approved) |
| {BLOCKED_COUNT} | count(findings where status = blocked) |
| {OVERRIDE_COUNT} | sum(length of all gate_overrides arrays) |
| {PLACED_COUNT} | count(findings where status = integrated) |
| {SKIPPED_FILES_TABLE_OR_NONE} | Table of files skipped (>100KB or binary), or "None" |
| {FAILED_EXTRACTORS_OR_NONE} | List of failed agent lenses, or "None" |
| {MEMORY_PATTERNS_COUNT} | count(patterns loaded from memory_query) |
| {REWARD_SCORE} | User checkpoint response mapped to 0.0-1.0 |
| {REWARD_LABEL} | excellent/good/needs_work/failed (see reward-learning.md) |
