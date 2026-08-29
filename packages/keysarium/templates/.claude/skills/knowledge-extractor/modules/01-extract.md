# Extract Module — Parallel Knowledge Extraction

## Purpose

Spawn 5 focused extractor agents to scan a project directory through different lenses, collecting reusable knowledge findings with confidence scores.

## Input

- `{TARGET_PATH}` — directory to scan (e.g., `researches/bank-kc-automation/`)
- `{SCOPE_FILTER}` — optional list of lenses to activate (null = all 5)
- `{MEMORY_PATTERNS}` — historical patterns from memory_query() (may be empty)
- `{SESSION_ID}` — harvest session identifier

## Protocol

### Step 1: Inventory Target Directory

List all files in `{TARGET_PATH}`. Build a file manifest with paths and sizes.
Skip binary files, images, and files > 100KB.

### Step 2: Determine Active Agents

If `{SCOPE_FILTER}` is set, map categories to lenses:

| Requested Category | Agent Lens to Spawn |
|-------------------|---------------------|
| patterns | extractor-patterns |
| commands | extractor-commands |
| hooks | extractor-commands (shared) |
| rules | extractor-rules |
| templates | extractor-templates |
| snippets | extractor-snippets |
| skills | ALL agents (cross-cutting) |

If `{SCOPE_FILTER}` is null, spawn all 5 agents.

### Step 3: Spawn Extractor Agents

Spawn selected agents in parallel using the Agent tool:

```
Agent(
  subagent_type="general-purpose",
  model="sonnet",
  description="Harvest Extractor — {LENS_NAME}",
  prompt="""
    You are a knowledge extraction agent with a focused lens: {LENS_DESCRIPTION}.

    ## Your Task
    Scan the following project files and extract reusable knowledge through your lens.
    For each finding, provide:
    1. A short descriptive title (3-8 words)
    2. Content: the reusable knowledge (decontextualized where possible)
    3. "When to use" guidance (1-2 sentences)
    4. "When NOT to use" guidance (1-2 sentences)
    5. A concrete example of usage
    6. Reusability confidence (0.0 to 1.0):
       - 0.9-1.0: Universal, works in any project
       - 0.7-0.89: Works in most similar projects
       - 0.5-0.69: Works in some contexts
       - < 0.5: Probably too project-specific
    7. Suggested maturity: alpha (first time seen) or beta (if evidence of reuse)

    ## Project Files
    Read the following directory: {TARGET_PATH}

    ## Historical Patterns (from previous harvests)
    {MEMORY_PATTERNS_OR_NONE}

    Avoid extracting findings that overlap with these historical patterns.

    ## Extraction Rules
    - Extract ONLY genuinely reusable knowledge
    - DO NOT extract project-specific implementation details
    - DO NOT extract trivial or obvious patterns
    - Each finding must be independently useful outside this project
    - Prefer actionable knowledge over abstract observations
    - If in doubt about reusability, include it with a lower confidence score

    ## Output Format
    Return a numbered list of findings in this exact format:

    ### Finding 1
    **Title:** [short title]
    **Confidence:** [0.0-1.0]
    **Maturity:** [alpha|beta]
    **Content:** [the reusable knowledge]
    **When to use:** [guidance]
    **When NOT to use:** [anti-guidance]
    **Example:** [concrete example]

    ### Finding 2
    ...
  """
)
```

### Step 4: Handle Agent Failures

If any extractor agent fails, times out, or returns malformed output:

1. **Partial success:** Proceed with results from successful agents. Do NOT block the entire pipeline.
2. **Log failures:** Record which lenses failed and why:
   ```
   ⚠️ Extractor agent failed: extractor-snippets (timeout after 120s)
   Proceeding with 4/5 lenses. Snippets will not be harvested.
   ```
3. **Surface in report:** Add failed lenses to the harvest report's "Coverage Gaps" section.
4. **Retry option:** Offer the user: `"повтори snippets"` — retry the failed lens only.
5. **Malformed output:** If an agent returns output that cannot be parsed into the Finding format, discard that agent's results and log: `"Extractor {lens} returned unparseable output — discarded."`
6. **Zero findings:** If an agent returns no findings, this is normal (not all lenses find relevant content). Log: `"Extractor {lens}: 0 findings (no relevant content detected)."`

### Step 5: Report Skipped Files

Before merging, surface any files that were skipped during inventory:

```
📋 File inventory: {total_files} files scanned, {skipped_count} skipped
Skipped: {file1} (112KB, exceeds 100KB limit), {file2} (binary)
```

Include this in the harvest report under "Coverage Gaps" so the user knows what was NOT examined.

### Step 6: Merge Results

After all agents complete (or after handling failures):

1. Collect all findings from all agents
2. Assign sequential numbers starting from 1 (global numbering across all agents)
3. Tag each finding with its source lens
4. Set initial status to `raw`
5. Write to findings JSON file at `.keysarium/harvest/findings-{SESSION_ID}.json`

### 5 Agent Lens Descriptions

| Agent | Lens Description |
|-------|-----------------|
| extractor-patterns | Architecture patterns, design patterns, agent topologies, data flow patterns, orchestration strategies, parallelism approaches. Look for structural solutions that could be applied to other systems. |
| extractor-commands | CLI commands, scripts, pipeline stages, automation workflows, slash commands, build processes. Look for reusable command patterns and workflow automations. |
| extractor-rules | Constraints, quality gates, anti-patterns, domain rules, naming conventions, regulatory requirements, lessons learned. Look for guardrails and restrictions that prevent mistakes. |
| extractor-templates | Document structures, config file formats, diagram templates, report formats, checklist templates. Look for reusable document and configuration scaffolding. |
| extractor-snippets | Reusable code fragments, utility functions, React components, bash one-liners, prompt templates, hook implementations. Look for copy-paste-ready code blocks. |

## Output Format

The findings JSON file structure:

```json
{
  "session_id": "{SESSION_ID}",
  "status": "extracting",
  "target_paths": ["{TARGET_PATH}"],
  "scope_filter": null,
  "created_at": "ISO-8601",
  "next_number": 16,
  "extractors_spawned": ["patterns", "commands", "rules", "templates", "snippets"],
  "findings": {
    "1": {
      "number": 1,
      "title": "Agent Swarm Topology",
      "content": "...",
      "when_to_use": "...",
      "when_not_to_use": "...",
      "example": "...",
      "confidence": 0.85,
      "maturity": "alpha",
      "source_lens": "patterns",
      "category": null,
      "status": "raw",
      "gate_results": {},
      "gate_overrides": [],
      "merged_from": null
    }
  }
}
```

## Anti-Patterns

| Anti-Pattern | Detection | Fix |
|-------------|-----------|-----|
| Agent extracts trivial findings | Findings like "use git for version control" | Prompt emphasizes non-obvious, actionable knowledge |
| Agent reads files outside target | File paths outside {TARGET_PATH} | Prompt constrains to target directory only |
| Duplicate findings across agents | Two agents extract the same pattern | Handled by Module 02 (dedup), not here |
| Agent returns unstructured text | Missing required fields in output | Strict output format in prompt; orchestrator validates |
| All findings have confidence 0.9+ | Agent is not being self-critical | Prompt calibration: explain the confidence scale |
| Agent timeout with no fallback | Pipeline stalls waiting for failed agent | Use Step 4 failure protocol: proceed with partial results |
| Large files silently skipped | User unaware of coverage gaps | Step 5 surfaces skipped files; harvest report includes coverage gaps |
