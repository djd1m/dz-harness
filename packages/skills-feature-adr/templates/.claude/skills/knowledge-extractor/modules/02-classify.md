# Classify Module — 7-Category Classification and Deduplication

## Purpose

Assign each raw finding to one of 7 categories, deduplicate across agents, and cross-reference against existing toolkit entries.

## Input

- Findings JSON file (from Module 01, status: `extracting` → set to `classifying`)
- `TOOLKIT_HARVEST.md` — existing entries to check for duplicates
- `references/artifact-categories.md` — category definitions and destination mapping

## Protocol

### Step 1: Load and Validate

1. Read findings JSON file
2. Verify all findings have status `raw`
3. Set session status to `classifying`
4. Read `references/artifact-categories.md` for category definitions

### Step 2: Classify Each Finding

For each finding, assign a category based on content analysis:

| Category | Classification Signals |
|----------|----------------------|
| skills | Multi-step methodology, complete workflow, orchestrator + modules pattern |
| commands | Starts with `/` or describes a CLI invocation, has arguments/parameters |
| hooks | Triggered by an event, pre/post pattern, automation on lifecycle events |
| rules | Contains "must", "never", "always", constraints, anti-pattern tables |
| templates | Document skeleton, config file format, placeholder structure `{VAR}` |
| patterns | Architectural approach, design strategy, topology, reusable structure |
| snippets | Code block, function, component, < 50 lines, copy-paste ready |

**Tie-breaking rules:**
- If a finding could be both `patterns` and `skills` → prefer `patterns` unless it has modules/sub-components
- If a finding could be both `rules` and `patterns` → prefer `rules` if it's primarily a constraint
- If a finding could be both `templates` and `snippets` → prefer `templates` if it has placeholders, `snippets` if it's code

### Step 3: Deduplicate

**Cross-agent dedup:** Compare all findings pairwise within the session using this algorithm:

1. **Title similarity:** Normalize titles (lowercase, strip punctuation, remove stop words). Compute token overlap ratio: `shared_tokens / max(tokens_A, tokens_B)`.
2. **Content similarity:** Extract the first 3 non-empty lines of each finding's `content` field. Compute 3-gram set overlap (Jaccard index): `|A ∩ B| / |A ∪ B|`.
3. **Combined score:** `similarity = title_weight * title_sim + content_weight * content_sim` where `title_weight = 0.4`, `content_weight = 0.6`.
4. **Threshold:** If `similarity >= 0.80` → duplicate. Keep the finding with higher confidence. Set the other's status to `removed`.
5. Log: `"Dedup: #N removed (duplicate of #M, similarity: {score})"`

Note: Since an LLM is performing this comparison (not a deterministic function), the algorithm above provides guidance for consistent judgment. The orchestrator should evaluate each pair and apply the threshold consistently.

**Cross-toolkit dedup:** Compare findings against existing `TOOLKIT_HARVEST.md` entries:
1. For each finding, scan TOOLKIT_HARVEST.md section headings and first paragraphs.
2. If a finding's title matches an existing entry name (exact or near-match after normalization):
   - Set finding's `duplicate_of` field to the existing entry name
   - Flag for gate G6 (will be evaluated in Module 03)
3. Near-duplicate range (0.70-0.85 similarity): propose a MERGE instead of flagging as duplicate.

### Step 4: Cross-Reference

For each classified finding, check if it references or depends on existing toolkit items:
- If finding mentions a skill name → add cross-reference link
- If finding extends an existing pattern → note the relationship
- Record cross-references in the finding's metadata

### Step 5: Write Results

1. Update each finding in the JSON file with: `category`, `status: "classified"`
2. Update session status
3. Return classification summary for display

## Output Format

The orchestrator displays classified findings grouped by category:

```
## patterns ({N} items)
#1  [0.85] Agent Swarm Topology — parallel agents with merge pattern
#4  [0.72] Event-Driven Pipeline — phase-to-phase data flow via files

## rules ({N} items)
#2  [0.91] Domain Detection Rule — auto-detect domain from keywords
#7  [0.65] Regulatory Constraint — ФЗ-152 data isolation requirement

## commands ({N} items)
...

## Removed by dedup: #5 (duplicate of #1), #9 (duplicate of #3)
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Everything classified as "patterns" | > 50% of findings in one category | Re-evaluate with stricter classification signals |
| Aggressive dedup removes valid findings | High similarity but different use cases | Compare "When to use" sections, not just content |
| Missing cross-references | Finding extends existing tool but no link | Check TOOLKIT_HARVEST.md entry names explicitly |
| Category mismatch with source lens | extractor-rules finding classified as pattern | Lens is a hint, not a binding — classify on content |
