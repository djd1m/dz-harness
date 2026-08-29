---
name: "jina-reader"
description: "Web content extraction via Jina Reader MCP — convert any URL to clean markdown, extract structured data."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# jina-reader

Web content extraction via Jina Reader MCP — convert any URL to clean markdown, extract structured data.

## MCP Server

- **Server**: Smithery hosted (`jina`) or official Jina MCP endpoint
- **Install**: `claude mcp add --transport http jina https://mcp.jina.ai/mcp` (or via Smithery)
- **Auth**: None required for basic usage; Jina API key for higher rate limits

## Installation

### Claude Code (official endpoint)

```bash
claude mcp add --transport http jina https://mcp.jina.ai/mcp
```

### Claude Code (official SSE endpoint)

```bash
claude mcp add jina-reader --transport sse \
  "https://mcp.jina.ai/sse"
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "jina-reader": {
      "transport": "http",
      "url": "https://mcp.jina.ai/mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jina-reader": {
      "transport": "http",
      "url": "https://mcp.jina.ai/mcp"
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "jina-reader": {
      "transport": "http",
      "url": "https://mcp.jina.ai/mcp"
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `read_url` | Convert any web page URL to clean, readable markdown |
| `extract_data` | Extract structured data from a page using a schema or prompt |
| `search_web` | Search the web and return results as clean markdown |

## When to Use

- **Web scraping**: Converting web pages to clean markdown for analysis
- **Content extraction**: Pulling article text, removing ads and navigation
- **Data extraction**: Extracting structured data (prices, specs, tables) from pages
- **Research**: Reading documentation, articles, and blog posts
- **URL summarization**: Getting clean content from URLs shared in conversations

## Examples

### Read a web page as markdown

```
Read this URL and give me the content as clean markdown:
https://blog.cloudflare.com/workers-ai-update-2026
```

### Extract structured data from a product page

```
Extract the following from this product page:
- Product name
- Price
- Availability
- Key specifications

URL: https://store.example.com/product/xyz-500
```

### Research with web search

```
Search for "MCP server best practices 2026" and return
the top 5 results as markdown summaries.
```

### Compare documentation across versions

```
Read these two URLs and compare the API changes:
1. https://docs.example.com/v2/api/auth
2. https://docs.example.com/v3/api/auth

Highlight breaking changes and new endpoints.
```

### Extract table data

```
Read this Wikipedia page and extract all the data from the
"Performance comparison" table as structured JSON:
https://en.wikipedia.org/wiki/Comparison_of_JavaScript_engines
```

### Batch content extraction

```
Read these 3 competitor landing pages and extract:
- Value proposition (headline)
- Pricing tiers
- Key features listed

URLs:
1. https://competitor-a.com
2. https://competitor-b.com
3. https://competitor-c.com
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JINA_API_KEY` | No | API key for higher rate limits (get at [jina.ai](https://jina.ai)) |

### Rate Limits

- Without API key: ~20 requests per minute
- With API key: Higher limits based on plan tier

## Limitations

- JavaScript-heavy SPAs may not render fully (Jina uses headless rendering but has timeouts)
- Very large pages may be truncated
- Some sites block automated access (CAPTCHA, bot detection)
- Images are referenced as markdown links, not embedded
- Rate limits apply, especially without an API key
- Dynamic content loaded via infinite scroll is not captured
