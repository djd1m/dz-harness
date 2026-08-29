---
name: "agentdb-memory"
description: "Self-learning vector memory via AgentDB MCP — pattern storage, semantic search, Reflexion, causal graphs, and skill library."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# AgentDB Memory

Self-learning vector memory that gets smarter every time your agent uses it. Store patterns, search semantically, learn from feedback, and build causal knowledge graphs — all through MCP tools.

## When to use

- Agent needs to remember successful patterns across sessions
- Semantic search for similar past solutions (not just keyword matching)
- Track what worked and what didn't (Reflexion episodes)
- Build causal understanding (X caused Y, connected via Z)
- Create reusable skill compositions from discovered patterns
- Need cryptographic audit trail of agent decisions

## When NOT to use

- Simple key-value storage (use files or env vars)
- Temporary session state (use in-memory variables)
- Large binary data storage (use file system)

## Setup

### Install AgentDB MCP Server

```bash
# Add to Claude Code (one command):
claude mcp add agentdb -- npx agentdb@latest mcp start

# Or for Claude Desktop (~/.claude/claude_desktop_config.json):
{
  "mcpServers": {
    "agentdb": {
      "command": "npx",
      "args": ["agentdb@latest", "mcp", "start"]
    }
  }
}
```

This registers 35 MCP tools (measured on 3.0.0-alpha.20, 2026-08-26 — see the note under Core
Tools for how to re-derive the number yourself). No API keys needed — everything runs locally in a single `.db` file (SQLite).

### Initialize a Database

```bash
# CLI (optional — MCP server auto-creates):
npx agentdb init ./agentdb.db
```

## Core Tools (grouped by capability)

> **Measured, not remembered.** This list is the server's own answer to `tools/list`, taken from
> **agentdb 3.0.0-alpha.20** on **2026-08-26** — **35 tools**. Re-derive it yourself rather than
> trusting this page.
>
> **How to re-derive it.** Start the server's stdio MCP process however you installed it, then send
> two JSON-RPC lines on stdin and read the reply on stdout:
>
> ```
> {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"c","version":"1"}}}
> {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
> ```
>
> The answer to `id: 2` carries the real list. `initialize` FIRST — a bare `tools/list` gets nothing.
> If your MCP client already has the server configured, asking IT for the tool list is the same
> measurement with less typing; that is how the count above was taken.
>
> One practical note: a first `npx agentdb@…` run downloads the package and can take minutes before
> it answers anything. A silent terminal is usually the download, not a hang.
>
> **Names drift.** The install above pins `@latest` on an ALPHA package, so the tool surface moves
> between releases. If a name here is missing on your server, the list moved — you did not err.
> A previous version of this page listed 26 tool NAMES of which only 3 still existed — they were
> names, not tools, which is the whole reason this note is here.
>
> **Only the store-level tools carry the `agentdb_` prefix.** Everything else — reflexion, causal,
> skills, learning — does not. Prefixing them is exactly how the old list drifted out of existence.

### Vector store — insert, search, delete (12)

| Tool | What it does |
|------|-------------|
| `agentdb_init` | Create or open a store |
| `agentdb_insert` | Insert one record with its embedding |
| `agentdb_insert_batch` | Insert many at once |
| `agentdb_search` | Semantic search (HNSW) |
| `agentdb_delete` | Remove one record |
| `agentdb_delete_batch` | Remove many |
| `agentdb_stats` | Store size, index state |
| `agentdb_clear_cache` | Drop cached query results |
| `agentdb_pattern_store` | Store a successful pattern with metadata |
| `agentdb_pattern_store_batch` | Store many patterns at once |
| `agentdb_pattern_search` | Search patterns semantically |
| `agentdb_pattern_stats` | Retrieval stats and hit rates |

**When to use:** after finishing a task well, store the approach as a pattern; before a similar task,
search for one.

**Example:**
```
agentdb_pattern_store({
  content: "Used DataLoader to batch user queries — 50 SQL calls became 2",
  metadata: { domain: "performance", tech: "graphql", outcome: "success" }
})

agentdb_pattern_search({ query: "GraphQL performance optimization" })
→ the DataLoader pattern, with a similarity score
```

### Reflexion — learn from outcomes (3)

| Tool | What it does |
|------|-------------|
| `reflexion_store` | Store an episode: task + outcome + self-critique |
| `reflexion_store_batch` | Store several episodes at once |
| `reflexion_retrieve` | Find relevant past episodes |

**When to use:** after any non-trivial task. Next time, retrieve before you start.

**Example:**
```
reflexion_store({
  task: "Deploy a new API version with zero downtime",
  outcome: "success",
  critique: "Blue-green worked, but the health check was updated AFTER the traffic switch.
             Next time: health check first.",
  reward: 0.8
})
```

### Causal graph — understand why (3)

| Tool | What it does |
|------|-------------|
| `causal_add_edge` | Record that one thing caused another |
| `causal_query` | Query the graph |
| `causal_traverse` | Walk the graph from a node |

**When to use:** when you learn that one pattern leads to another, or that a change caused a problem.

### Skill library — reusable compositions (3)

| Tool | What it does |
|------|-------------|
| `skill_create` | Promote a proven pattern to a skill |
| `skill_create_batch` | Promote several at once |
| `skill_search` | Find a skill by intent |

### Learning loop and RL (10)

| Tool | What it does |
|------|-------------|
| `learning_start_session` | Open a learning session |
| `learning_end_session` | Close it |
| `learning_train` | Train on accumulated experience |
| `learning_predict` | Ask the trained model |
| `learning_feedback` | Say whether a result was useful — the reward signal |
| `learning_metrics` | Current learning metrics |
| `learning_explain` | Why the model ranked something as it did |
| `learning_transfer` | Carry learning across domains |
| `learner_discover` | Find applicable learners |
| `reward_signal` | Emit a reward directly |

**The loop:**
```
Search → use the result → learning_feedback → the next search is better
                              ↑                          ↓
                              └──── the bandit re-tunes ──┘
```

### Experience, consolidation, audit (4)

| Tool | What it does |
|------|-------------|
| `experience_record` | Record a raw experience for later consolidation |
| `consolidate_now` | Consolidate pending experiences immediately |
| `recall_with_certificate` | Recall WITH a verifiable provenance certificate |
| `db_stats` | Database-level statistics |

**9 RL algorithms** automatically tune ranking (no manual config):
1. Thompson Sampling — multi-armed bandit for result ranking
2. UCB1 — exploration-exploitation balancing
3. EXP3 — adversarial bandit for changing environments
4. Softmax — temperature-based selection
5. Epsilon-Greedy — simple exploration with decay
6. Gradient Bandit — preference-based selection
7. Contextual Bandit — context-aware ranking
8. REINFORCE — policy gradient for complex rewards
9. PPO-lite — proximal policy optimization

## Integration with DZ Harness

AgentDB complements the DZ harness skills:

| DZ Feature | Without AgentDB | With AgentDB |
|------------|----------------|--------------|
| `dz recommend` | Reward-boosted lexical ranking | Semantic candidate retrieval via `agentdb_pattern_search` |
| `dz recall` | Lexical (SQLite FTS5 / keyword) | **Semantic / HNSW vector recall** over the same learned patterns |
| `dz consolidate` | Harvests transcripts → store | Same patterns, vector-indexed for similarity search |
| Skill selection | Preset-based | `skill_search` by intent |

### Bridge: semantic recall over the dz learn-loop store

This is the **vector tier** the `dz` CLI can't run itself (the sync CLI is lexical-only).
In an agent session, mirror what `dz teach` / `dz consolidate` learned into AgentDB's vector
index, then search it semantically. The bridge is backend-agnostic — `dz recall --all --json`
exports the unified store regardless of whether it's JSON- or SQLite-backed.

```
# 1. Export the learned patterns (one portable JSON array of {pattern,type,reward,domain,ts,source}):
dz recall --all --json    # → [{"pattern":"...","reward":0.9,"domain":"api",...}, ...]

# 2. For each exported pattern, store it in AgentDB with an embedding
#    (`content` is the pattern text — same argument shape as the Pattern Memory example above):
agentdb_pattern_store({
  content: <pattern>,
  metadata: { domain: <domain>, type: <type>, reward: <reward>, source: "dz-learn-loop" }
})

# 3. Now recall semantically (finds related patterns even with different wording):
agentdb_pattern_search({ query: "how did we handle N+1 queries?" })
```

Re-run the export+store step after new `dz teach` / `dz consolidate` activity to keep the vector
index in sync. Use `reflexion_retrieve` alongside it to weight by past outcome. This closes
the loop: **lexical recall in the CLI (`dz recall`), semantic recall here in the MCP session.**

## Anti-patterns

- Storing every trivial operation (noise overwhelms signal)
- Not recording feedback after search (learning loop breaks)
- Using causal graph for simple relationships (overkill)
- Storing large binary data as patterns (use metadata + file paths)

## Self-check

- Is AgentDB MCP server running? (`claude mcp list` should show `agentdb`)
- Are you storing patterns after successful task completion?
- Are you searching before starting similar tasks?
- Are you recording feedback on search results?
- Are Reflexion episodes including self-critique, not just outcomes?
- Is the .rvf file backed up periodically?

## Examples

**In scope:** "Remember how I fixed this type of bug last time"
→ `agentdb_pattern_search` + `reflexion_retrieve`

**In scope:** "Track what deployment approaches work best"
→ `agentdb_pattern_store` after each deployment + `learning_feedback`

**In scope:** "Why did this query become slow after the migration?"
→ `causal_query` to trace cause chain

**Out of scope:** "Store this 50MB log file"
→ Use filesystem; store a summary pattern with file path in metadata

## Resources

- [AgentDB on npm](https://www.npmjs.com/package/agentdb)
- [GitHub: ruvnet/agentdb](https://github.com/ruvnet/agentdb)
- [MCP tools reference, upstream](https://github.com/ruvnet/agentdb#mcp-tools) — the upstream page states its own count; ours is measured, see Core Tools
