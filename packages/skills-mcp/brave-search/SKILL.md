---
name: "brave-search"
description: "Web search via Brave Search MCP — web, local, image, video, news results with AI summaries."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# brave-search

Web search via the [Brave Search MCP server](https://github.com/anthropics/brave-search-mcp-server). Provides access to web, local, image, video, and news search with optional AI-generated summaries.

## MCP Server

- **Package:** `@brave/brave-search-mcp-server`
- **Transport:** stdio

## Installation

### Claude Code

```bash
claude mcp add brave-search -- npx @brave/brave-search-mcp-server
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "brave-search": {
      "command": "npx",
      "args": ["@brave/brave-search-mcp-server"],
      "env": {
        "BRAVE_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BRAVE_API_KEY` | Yes | API key from [brave.com/search/api](https://brave.com/search/api) |

## Tools

### brave_web_search

General web search returning organic results, knowledge panels, and optional AI summaries.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Search query (max 400 chars) |
| `count` | number | No | 10 | Results per page (1-20) |
| `country` | string | No | — | Country code (e.g., `US`, `DE`, `JP`) |
| `freshness` | string | No | — | Time filter: `pd` (day), `pw` (week), `pm` (month), `py` (year) |
| `safesearch` | string | No | `moderate` | `off`, `moderate`, `strict` |
| `result_filter` | string | No | — | Comma-separated: `web`, `news`, `video`, `image` |
| `summary` | boolean | No | false | Include AI-generated summary |
| `goggles` | string | No | — | Brave Goggles URL for result re-ranking |

**Example:**

```
Use brave_web_search to find recent articles about Rust async runtimes.

Tool call:
  brave_web_search({
    "query": "Rust async runtime comparison tokio vs async-std 2026",
    "count": 10,
    "freshness": "pm",
    "summary": true
  })
```

### brave_local_search

Search for local businesses, restaurants, services. Returns name, address, phone, rating, hours.

**Example:**

```
Use brave_local_search to find coffee shops near downtown Austin.

Tool call:
  brave_local_search({
    "query": "best coffee shops downtown Austin TX",
    "count": 5
  })
```

### brave_video_search

Search for videos across YouTube, Vimeo, and other platforms.

**Example:**

```
Tool call:
  brave_video_search({
    "query": "TypeScript 5.5 new features tutorial",
    "count": 5,
    "freshness": "pm"
  })
```

### brave_image_search

Search for images with size, type, and license filters.

**Example:**

```
Tool call:
  brave_image_search({
    "query": "system design architecture diagram microservices",
    "count": 10
  })
```

### brave_news_search

Search recent news articles with publication date and source.

**Example:**

```
Tool call:
  brave_news_search({
    "query": "OpenAI GPT-5 release",
    "count": 10,
    "freshness": "pw"
  })
```

## When to Use

- **Web search** — finding current information, documentation, tutorials
- **News** — tracking recent events, product launches, industry updates
- **Local search** — finding businesses, restaurants, services by location
- **Image search** — finding diagrams, screenshots, visual references
- **Video search** — finding tutorials, presentations, demos
- **AI summaries** — getting quick answers without reading full pages

## Tips

- Use `freshness: "pd"` for breaking news, `"pw"` for recent developments
- Enable `summary: true` for quick factual answers
- Use `goggles` to apply community-curated ranking filters (e.g., prioritize tech blogs over SEO content)
- Combine `result_filter` to narrow results: `"news,web"` excludes images and videos
- `count: 5` is usually sufficient; use `count: 20` for exhaustive research
