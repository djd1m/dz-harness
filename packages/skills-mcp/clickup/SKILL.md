---
name: "clickup"
description: "ClickUp project management via MCP — tasks, sprints, comments, docs, time tracking with natural language."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# clickup

ClickUp project management via MCP — tasks, sprints, comments, docs, time tracking with natural language.

## MCP Server

- **Server**: `@taazkareem/clickup-mcp-server`
- **Install**: `claude mcp add clickup -- npx @taazkareem/clickup-mcp-server`
- **Auth**: ClickUp API key from [app.clickup.com/settings/apps](https://app.clickup.com/settings/apps)

## Installation

### Claude Code

```bash
claude mcp add clickup -e CLICKUP_API_KEY=pk_xxx \
  -- npx @taazkareem/clickup-mcp-server
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "npx",
      "args": ["@taazkareem/clickup-mcp-server"],
      "env": {
        "CLICKUP_API_KEY": "pk_your_api_key_here"
      }
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clickup": {
      "command": "npx",
      "args": ["@taazkareem/clickup-mcp-server"],
      "env": {
        "CLICKUP_API_KEY": "pk_your_api_key_here"
      }
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "clickup": {
      "command": "npx",
      "args": ["@taazkareem/clickup-mcp-server"],
      "env": {
        "CLICKUP_API_KEY": "${input:clickupApiKey}"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `create_task` | Create a task in a list with assignees, priority, due dates, tags |
| `update_task` | Update task status, priority, assignees, due date, description |
| `list_tasks` | List tasks in a list or folder with filters (status, assignee, tag) |
| `add_comment` | Add a comment to a task with markdown support |
| `create_doc` | Create a ClickUp Doc in a workspace or folder |
| `start_timer` | Start time tracking on a task |
| `stop_timer` | Stop the active time tracker |
| `list_spaces` | List all spaces in a workspace |
| `list_folders` | List folders in a space |

## When to Use

- **Project management**: Creating and managing tasks across sprints and projects
- **Sprint planning**: Organizing tasks into sprints with priorities and assignees
- **Task tracking**: Monitoring task status, updating progress, filtering by criteria
- **Team collaboration**: Adding comments, assigning tasks, tracking time
- **Documentation**: Creating and managing ClickUp Docs alongside tasks

## Examples

### Create a sprint task with full metadata

```
Create a task in the "Backend" list:
- Title: "Implement OAuth2 refresh token rotation"
- Description: "Add automatic refresh token rotation per RFC 6749 Section 10.4"
- Priority: High
- Assignee: john@company.com
- Due date: 2026-06-20
- Tags: ["security", "sprint-42"]
- Status: "In Progress"
```

### Sprint standup query

```
List all tasks in the "Sprint 42" list that are "In Progress",
grouped by assignee. Include time tracked on each.
```

### Add a code review comment

```
Add a comment to task CU-abc123:
"Code review complete. Changes look good.
- Auth flow handles edge cases correctly
- Tests cover all branches
- Ready for QA"
```

### Time tracking workflow

```
Start a timer on task "API refactoring" in the Backend list.
When I say "done", stop the timer and add a comment with
the time spent.
```

### Cross-project overview

```
List all spaces in my workspace, then show me all tasks
due this week across all lists with status "In Review".
```

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLICKUP_API_KEY` | Yes | API key from ClickUp app settings |
| `CLICKUP_TEAM_ID` | No | Default team/workspace ID (auto-detected if omitted) |

### Getting Your API Key

1. Go to [app.clickup.com/settings/apps](https://app.clickup.com/settings/apps)
2. Click "Generate" under Personal API Token
3. Copy the token (starts with `pk_`)
4. Set it as `CLICKUP_API_KEY` in your MCP config

## Limitations

- API rate limit: 100 requests per minute per token
- Bulk operations require multiple API calls
- Custom fields require workspace-specific field IDs
- Time tracking precision is to the second
- Doc creation supports markdown but not all ClickUp-specific blocks
