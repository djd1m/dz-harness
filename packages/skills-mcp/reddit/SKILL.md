---
name: "reddit"
description: "Reddit integration via MCP — search posts, read threads, monitor subreddits, analyze discussions."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# reddit

Reddit integration via MCP — search posts, read threads, monitor subreddits, analyze discussions.

## MCP Server

- **Server**: `reddit-mcp-server` (npm, by Jordan Burke) — run locally via `npx` (stdio)
- **Install**: `npx -y reddit-mcp-server`
- **Auth**: None required for public/read content (anonymous mode, ~10 req/min); set `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` env vars for higher rate limits
- **Source**: https://www.npmjs.com/package/reddit-mcp-server · https://github.com/jordanburke/reddit-mcp-server · Smithery listing: https://smithery.ai/server/@jordanburke/reddit-mcp-server

### Claude Code (local stdio)

```bash
claude mcp add reddit -- npx -y reddit-mcp-server
```

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "reddit": {
      "command": "npx",
      "args": ["-y", "reddit-mcp-server"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "reddit": {
      "command": "npx",
      "args": ["-y", "reddit-mcp-server"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `search_posts` | Search Reddit globally for posts matching a query |
| `get_post` | Get a specific post by URL or ID with full content |
| `get_comments` | Get comments for a post, with sorting and depth control |
| `list_subreddit` | List recent posts from a subreddit (hot, new, top, rising) |
| `get_user_posts` | Get posts by a specific Reddit user |
| `search_subreddit` | Search within a specific subreddit |

## When to Use

- **Reddit research**: Finding discussions about a topic, product, or technology
- **Community monitoring**: Tracking mentions and sentiment in specific subreddits
- **Sentiment analysis**: Analyzing how a community feels about a topic
- **Finding discussions**: Locating threads about bugs, features, or technical solutions
- **Competitive analysis**: Monitoring competitor mentions and user feedback
- **Market research**: Understanding user pain points from authentic discussions

## Examples

### Research a technology

```
Search Reddit for posts about "Bun vs Node.js performance"
in the last month. Show me the top 5 most upvoted discussions
with their comment counts.
```

### Monitor a subreddit

```
List the top 10 posts from r/webdev this week.
For each post with more than 50 comments, get the top 3 comments.
```

### Competitive analysis

```
Search r/SaaS and r/startups for mentions of "Notion alternatives"
in the past 3 months. Summarize the most recommended tools
and common complaints about Notion.
```

### Bug report research

```
Search r/nextjs for posts mentioning "hydration error"
sorted by newest. Show me the solutions people found.
```

### Sentiment analysis workflow

```
Search Reddit for posts about "Claude AI" across
r/LocalLLaMA, r/ChatGPT, and r/artificial.
Categorize the sentiment as positive, negative, or neutral
and identify the top recurring themes.
```

### User feedback mining

```
Get the latest posts from r/ExperiencedDevs about
"code review tools". Extract the tools mentioned
and the pros/cons discussed.
```

## Limitations

- Read-only access (cannot post, comment, or vote)
- Rate limits apply (~10 req/min anonymous; higher with Reddit API credentials)
- Some content may be unavailable if posts/subreddits are private
- Comment depth may be limited for very large threads
- Historical search is limited by Reddit's search index (typically ~1 year)
- NSFW content may be filtered depending on server configuration
