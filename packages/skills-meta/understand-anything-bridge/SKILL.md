---
name: understand-anything-bridge
description: >
  Bridges the Understand-Anything Claude Code plugin with DZ Harness skills.
  Reads .understand-anything/knowledge-graph.json and provides architectural
  context to feature-adr, design-thinking, qe-test-generation, and AgentDB.
  Supports diff-based impact analysis for targeted test generation.
  Triggers on: "understand context", "codebase structure", "architecture map",
  "knowledge graph", "understand-anything", "impact analysis".
  Graceful degradation: works without plugin installed (warns and skips).
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# Understand-Anything Bridge

Read the codebase knowledge graph from [Understand-Anything](https://github.com/Lum1104/Understand-Anything)
and feed architectural context into DZ Harness skills.

## When to Use

- Before running `feature-adr` — pre-load architecture awareness for requirements and design
- Before running `design-thinking` — understand existing system for Phase 2 (Define)
- Before running `qe-test-generation` — target tests at impacted files only
- After code changes — run diff impact analysis to find ripple effects
- When onboarding to unfamiliar codebase — get architectural summary
- When storing codebase structure in AgentDB for cross-session memory

## When NOT to Use

- Codebase has no `.understand-anything/` directory and plugin is not installed
- You only need to read a single file (use `Read` tool directly)
- You need deep semantic code search (use `qe-code-intelligence` instead)

## Prerequisites

This skill works best with the Understand-Anything plugin installed:

```bash
# In Claude Code, install the plugin (if not already):
# Visit: https://github.com/Lum1104/Understand-Anything

# Generate the knowledge graph:
# /understand          — full codebase analysis
# /understand-diff     — change impact analysis
# /understand-domain   — business domain extraction
```

**Graceful degradation:** If the plugin is not installed or the knowledge graph does not exist,
this skill logs a warning and returns an empty context. Other skills continue without it.

## Protocol

### Step 1: Detect Knowledge Graph

Check for `.understand-anything/knowledge-graph.json` in the project root.

**If found:**
1. Read the JSON file
2. Parse node count, edge count, layer distribution, domain list
3. Proceed to Step 2

**If NOT found:**
1. Log: "Understand-Anything knowledge graph not found. Skipping context enrichment."
2. Log: "To generate: install Understand-Anything plugin and run /understand"
3. Return empty context (other skills continue without architecture awareness)

### Step 2: Parse Graph Structure

Extract from knowledge-graph.json:

| Element | What to extract |
|---------|----------------|
| **Nodes** | Files, functions, classes — count per type |
| **Edges** | Dependencies — import graph, call graph |
| **Layers** | Architectural layers: API, Service, Data, UI, Utility — count per layer |
| **Domains** | Business domains (from /understand-domain) — if present |
| **Entry points** | Top-level files with most dependents |
| **Hot spots** | Files with highest dependency fan-in (most imported by others) |
| **Isolated nodes** | Files with zero dependencies (potential dead code) |

### Step 3: Generate Context Summary

Produce a structured summary:

```
CODEBASE CONTEXT (from Understand-Anything)
=============================================
Total: {N} files, {M} functions, {K} classes
Layers: API ({n1}), Service ({n2}), Data ({n3}), UI ({n4}), Utility ({n5})
Domains: {domain1}, {domain2}, ...
Entry points: {file1}, {file2}, {file3}
Hot spots: {file1} ({fan_in} dependents), {file2} ({fan_in} dependents)
Isolated: {n} files with zero dependencies

Architecture style: {monolith | modular-monolith | microservices | unknown}
Primary language: {lang} ({pct}%)
Frameworks detected: {fw1}, {fw2}
=============================================
```

### Step 4: Feed Context to Target Skills

Provide the context summary as input to the skill that requested it:

| Target Skill | What to provide | How |
|-------------|----------------|-----|
| `feature-adr` Step 1 | Full context summary + relevant hot spots | Append to requirements context |
| `feature-adr` Step 5 | Layer distribution + dependency graph excerpt | Architecture pre-context |
| `design-thinking` Phase 2 | Domain list + entry points | System understanding for Define |
| `qe-test-generation` | Hot spots + files with highest fan-in | Priority test targets |
| `qe-coverage-analysis` | Isolated nodes list | Potential untested dead code |

### Step 5: Diff Impact Analysis (Optional)

When `/understand-diff` output is available or a git diff is provided:

1. Read the list of changed files
2. Cross-reference with knowledge graph edges
3. Find all **downstream dependents** (files that import changed files)
4. Find all **upstream dependencies** (files that changed files import)
5. Calculate **blast radius**: total files potentially affected

```
DIFF IMPACT ANALYSIS
=============================================
Changed files: {N}
Direct dependents (downstream): {M} files
Upstream dependencies: {K} files
Total blast radius: {total} files ({pct}% of codebase)

High-risk impacts:
  {file1} — {reason} (fan-in: {n})
  {file2} — {reason} (fan-in: {n})

Recommended test targets:
  1. {file} — direct change
  2. {file} — downstream dependent of changed module
  ...
=============================================
```

### Step 6: AgentDB Memory Integration (Optional)

If AgentDB MCP tools are available (`memory_store`, `memory_query`):

1. Store the context summary as a pattern:
   ```
   memory_store({
     key: "codebase/architecture/{project-name}",
     namespace: "understand-anything",
     value: { context_summary, layer_distribution, domains, hot_spots },
     persist: true
   })
   ```

2. On subsequent runs, query first:
   ```
   memory_query({
     pattern: "codebase/architecture/*",
     namespace: "understand-anything"
   })
   ```
   If found and knowledge-graph.json has not changed (check file mtime), use cached context.

3. Store diff impact analyses for learning:
   ```
   memory_store({
     key: "codebase/impact/{timestamp}",
     namespace: "understand-anything",
     value: { changed_files, blast_radius, recommended_targets },
     persist: true
   })
   ```

## Output

Structured context conforming to `schemas/output.json`:

- `status` — found / not_found / error
- `graph_stats` — node_count, edge_count, file_count, function_count, class_count
- `layers` — count per architectural layer
- `domains` — list of business domains
- `entry_points` — top files by dependent count
- `hot_spots` — files with highest fan-in
- `isolated_nodes` — files with zero dependencies
- `diff_impact` (optional) — changed_files, blast_radius, recommended_targets
- `context_summary` — human-readable text summary

## Complexity Handling

This skill is always lightweight (no tiers). It reads one JSON file and produces a summary.
Processing time scales linearly with graph size:

| Graph size | Parse time | Use case |
|-----------|-----------|----------|
| < 100 nodes | < 1s | Small project |
| 100-1000 nodes | 1-3s | Medium project |
| 1000-10000 nodes | 3-10s | Large monorepo |
| > 10000 nodes | 10-30s | Enterprise codebase |

## Anti-Patterns

| Anti-Pattern | Why It Fails | Correct Approach |
|-------------|-------------|-----------------|
| Run without /understand first | No knowledge graph exists | Run /understand to generate graph |
| Trust graph as real-time truth | Graph is a snapshot, may be stale | Check mtime, re-run /understand if >24h old |
| Use for single-file questions | Overkill — graph is for structural overview | Read the file directly |
| Ignore isolated nodes | May be dead code or untested | Flag for review in QE pipeline |
| Skip diff impact for small changes | Even 1-line change can have large blast radius | Always run impact analysis |
| Store entire graph in AgentDB | Too large, slow retrieval | Store summary + hot spots only |

## Self-Check

- [ ] Knowledge graph file exists and is parseable JSON?
- [ ] Node and edge counts are non-zero?
- [ ] Layer distribution sums to total file count?
- [ ] Context summary generated and provided to target skill?
- [ ] Diff impact analysis run (if changes provided)?
- [ ] AgentDB patterns stored (if AgentDB available)?
- [ ] Stale graph warning issued if mtime > 24h?

## Examples

**In scope:**
- "Load codebase context before designing a new feature" → parse graph, feed to feature-adr
- "What files are affected by this change?" → diff impact analysis
- "Store architecture overview for future sessions" → AgentDB memory_store
- "Which files should I test after this PR?" → diff impact → recommended test targets

**Out of scope:**
- "Generate the knowledge graph" → use Understand-Anything plugin directly (/understand)
- "Search for a function definition" → use qe-code-intelligence or grep
- "Visualize the architecture" → use /understand-dashboard (plugin command)

## Integration Map

```
  Understand-Anything Plugin
  (/understand, /understand-diff)
           │
           ▼
  .understand-anything/knowledge-graph.json
           │
           ▼
  ┌────────────────────────────┐
  │ understand-anything-bridge │ ← THIS SKILL
  │                            │
  │  Parse → Summarize → Feed  │
  └────────┬───────────────────┘
           │ Context Summary
    ┌──────┼──────┬──────────┐
    ▼      ▼      ▼          ▼
 feature  design  qe-test   AgentDB
  -adr   -thinking -gen     memory
```

## Recommended Workflow

```bash
# 1. Install Understand-Anything plugin in Claude Code
# 2. Generate knowledge graph:
#    /understand
# 3. Install bridge skill:
dz setup --target claude-code --preset meta
# 4. Now other skills auto-detect the knowledge graph:
#    /feature-adr "add payment module"
#    → bridge reads graph → feature-adr gets architecture context
```
