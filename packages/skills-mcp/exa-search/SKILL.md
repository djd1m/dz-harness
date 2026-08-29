---
name: "exa-search"
description: "AI-powered web search via Exa MCP — semantic search, code search, company research, content crawling."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# exa-search

AI-powered web search via the [Exa MCP server](https://docs.exa.ai/reference/mcp). Provides neural/semantic search, keyword search, similarity search, content crawling, and research paper discovery.

## MCP Server

- **Package:** `exa-mcp-server` (npm) or hosted at `https://mcp.exa.ai/mcp`
- **Transport:** HTTP (hosted) or stdio (local)

## Installation

### Claude Code (hosted — recommended)

```bash
claude mcp add --transport http exa https://mcp.exa.ai/mcp
```

### Claude Code (local)

```bash
claude mcp add exa-search -- npx exa-mcp-server
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "exa-search": {
      "command": "npx",
      "args": ["exa-mcp-server"],
      "env": {
        "EXA_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Claude Desktop (hosted)

```json
{
  "mcpServers": {
    "exa": {
      "type": "http",
      "url": "https://mcp.exa.ai/mcp",
      "headers": {
        "x-api-key": "your-api-key-here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EXA_API_KEY` | Yes | API key from [dashboard.exa.ai](https://dashboard.exa.ai) |

## Tools

### web_search

Neural (semantic) or keyword search across the web. Neural mode understands intent; keyword mode matches exact terms.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Natural language query or keywords |
| `type` | string | No | `neural` | `neural` (semantic) or `keyword` (exact match) |
| `num_results` | number | No | 10 | Number of results (1-100) |
| `include_domains` | string[] | No | — | Restrict to these domains |
| `exclude_domains` | string[] | No | — | Exclude these domains |
| `start_published_date` | string | No | — | ISO date lower bound |
| `end_published_date` | string | No | — | ISO date upper bound |
| `include_text` | string[] | No | — | Results must contain these strings |
| `category` | string | No | — | `company`, `research_paper`, `news`, `github`, `tweet`, `pdf` |

**Example — semantic search:**

```
Find recent blog posts about building MCP servers in TypeScript.

Tool call:
  web_search({
    "query": "how to build an MCP server in TypeScript with tool definitions",
    "type": "neural",
    "num_results": 10,
    "start_published_date": "2025-01-01",
    "category": "github"
  })
```

**Example — company research:**

```
Tool call:
  web_search({
    "query": "AI developer tools startup Series A 2026",
    "category": "company",
    "num_results": 20
  })
```

### find_similar

Find pages semantically similar to a given URL. Useful for competitive analysis and content discovery.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | Reference URL to find similar pages for |
| `num_results` | number | No | Number of similar pages (1-100) |
| `include_domains` | string[] | No | Restrict to these domains |
| `exclude_domains` | string[] | No | Exclude these domains |

**Example:**

```
Find pages similar to the Anthropic MCP specification.

Tool call:
  find_similar({
    "url": "https://modelcontextprotocol.io/introduction",
    "num_results": 10,
    "exclude_domains": ["modelcontextprotocol.io"]
  })
```

### get_contents

Crawl and extract clean text/markdown content from one or more URLs.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `urls` | string[] | Yes | URLs to crawl (max 10) |
| `text` | boolean | No | Return plain text |
| `highlights` | boolean | No | Return key highlights/excerpts |

**Example:**

```
Tool call:
  get_contents({
    "urls": ["https://docs.anthropic.com/en/docs/build-with-claude/mcp"],
    "text": true,
    "highlights": true
  })
```

### research_paper_search

Search academic papers across arXiv, Semantic Scholar, and other repositories.

**Example:**

```
Tool call:
  research_paper_search({
    "query": "retrieval augmented generation evaluation benchmarks",
    "num_results": 10,
    "start_published_date": "2025-06-01"
  })
```

## When to Use

- **Semantic search** — when you need results by meaning, not just keywords
- **Code/GitHub search** — finding repos, code examples, libraries
- **Company research** — finding startups, companies in a space
- **Content crawling** — extracting full text from URLs for analysis
- **Academic research** — finding papers, preprints, citations
- **Similarity search** — finding competitors, alternatives, related content

## Tips

- Neural search excels at natural language queries; use keyword mode for exact terms or error messages
- Use `include_domains` to scope searches: `["github.com"]` for code, `["arxiv.org"]` for papers
- Combine `web_search` with `get_contents` for a research workflow: search first, then crawl top results
- The `category` filter dramatically improves relevance for specialized searches
- Date filters help avoid outdated information in fast-moving fields
