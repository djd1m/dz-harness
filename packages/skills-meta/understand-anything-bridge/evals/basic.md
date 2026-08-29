# Evals: understand-anything-bridge

## Eval 1: Graph Found — Full Context

**Input:** Project with `.understand-anything/knowledge-graph.json` containing 500 nodes

**Expected:**
- status: "found"
- graph_stats populated (node_count=500, edge_count>0)
- layers distribution summing to file_count
- entry_points: top 3-5 files by fan-out
- hot_spots: top 3-5 files by fan-in
- context_summary: human-readable text
- No errors

## Eval 2: Graph Not Found — Graceful Degradation

**Input:** Project without `.understand-anything/` directory

**Expected:**
- status: "not_found"
- Warning logged: "knowledge graph not found"
- context_summary: empty or "No architecture context available"
- Other skills continue without bridge context

## Eval 3: Diff Impact Analysis

**Input:** Graph exists + git diff with 3 changed files

**Expected:**
- diff_impact.changed_files: 3 entries
- diff_impact.blast_radius: >= 3 (changed + dependents)
- diff_impact.recommended_targets: ordered by risk
- context_summary includes impact section

## Eval 4: AgentDB Integration

**Input:** Graph exists + AgentDB MCP tools available

**Expected:**
- agentdb_stored: true
- Pattern stored under "codebase/architecture/*" namespace
- On re-run with unchanged graph: cached context retrieved, no re-parse
