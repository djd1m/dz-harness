# @dzhechkov/skills-mcp

Canonical MCP skill pack — **16 agentic skills** wrapping top Model Context Protocol servers for search, email, productivity, knowledge management, version control, and self-learning memory.

## Install

```bash
# Via dz CLI (recommended)
dz init --target claude-code --preset mcp

# Or select specific skills
dz init --target claude-code --select brave-search,exa-search,gmail

# Or install the package directly
npm install @dzhechkov/skills-mcp
```

## Skill Inventory (16)

| Skill | MCP Server | Description |
|-------|-----------|-------------|
| `agentdb-memory` | agentdb | Self-learning vector memory (35 tools measured on 3.0.0-alpha.20, HNSW, Reflexion) |
| `brave-search` | @brave/brave-search-mcp-server | Web, local, image, video, news search |
| `clickup` | @taazkareem/clickup-mcp-server | Tasks, sprints, comments, docs, time tracking |
| `comfyui` | comfyui-mcp | Image generation workflows via ComfyUI |
| `context7` | @upstash/context7-mcp | Library docs and API reference search |
| `exa-search` | exa-mcp-server (hosted) | AI-powered semantic search, code search |
| `git-mcp` | @cyanheads/git-mcp-server | 17 git tools (commit, branch, merge, stash, ...) |
| `gitlab` | @zereight/mcp-gitlab | GitLab repos, MRs, issues, pipelines, CI/CD |
| `gmail` | gogcli-mcp-gmail | Full Gmail — search, send, draft, label, bulk ops |
| `google-calendar` | Smithery (googlecalendar) | Events, availability, recurring meetings |
| `google-sheets` | Smithery (googlesheets) | Read, write, create, format spreadsheets |
| `google-tasks` | Smithery (googletasks) | Task lists, create, complete, organize |
| `jina-reader` | Jina MCP (hosted) | Convert any URL to clean markdown |
| `notion` | Smithery (notion) | Pages, databases, blocks, search |
| `obsidian` | obsidian-mcp-server | Vault management — read, write, search notes |
| `reddit` | Smithery (reddit) | Search posts, read threads, monitor subreddits |

## Quick Setup (Claude Code)

```bash
# Add MCP servers (one-time)
claude mcp add brave-search -- npx @brave/brave-search-mcp-server
claude mcp add --transport http exa https://mcp.exa.ai/mcp
claude mcp add gogcli-gmail -- gogcli-mcp-gmail
claude mcp add clickup -- npx @taazkareem/clickup-mcp-server
claude mcp add context7 -- npx @upstash/context7-mcp
claude mcp add --transport http jina https://mcp.jina.ai/mcp

# Install skills (guides how to use each MCP server)
dz init --target claude-code --preset mcp
```

## Status

`v0.3.0` — published on npm. Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

These wrap MCP servers — add the server (see each skill), then the skill guides the agent:
- "Search my Gmail for the invoice" → `gmail`
- "Create a Notion page from these notes" → `notion`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.
