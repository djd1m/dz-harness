---
name: "google-tasks"
description: "Google Tasks integration via MCP — create, list, complete, organize tasks and task lists."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# google-tasks

Google Tasks integration via MCP — create, list, complete, organize tasks and task lists.

## MCP Server

- **Server**: `@zcaceres/gtasks` — community Google Tasks MCP server ([github.com/zcaceres/gtasks-mcp](https://github.com/zcaceres/gtasks-mcp), [Smithery listing](https://smithery.ai/server/@zcaceres/gtasks))
- **Install**: Via Smithery CLI, or clone + build and run as a local stdio server
- **Auth**: Google OAuth 2.0 (Tasks API scope) — run `npm run start auth` once to complete the browser OAuth flow; credentials are saved to `.gdrive-server-credentials.json`

> Note: This server runs locally over stdio (it is not a hosted SSE endpoint).

## Installation

### Claude Code / Claude Desktop (Smithery CLI)

The simplest path is the Smithery CLI, which installs and configures the server for you:

```bash
npx -y @smithery/cli install @zcaceres/gtasks --client claude
```

### Manual (clone + build, local stdio server)

```bash
git clone https://github.com/zcaceres/gtasks-mcp.git
cd gtasks-mcp
npm install
npm run build
# one-time OAuth flow (opens a browser); saves .gdrive-server-credentials.json
npm run start auth
```

### Claude Desktop / Cursor

Add to your MCP config (`claude_desktop_config.json` or `.cursor/mcp.json`). Replace the path with the absolute path to your built `dist/index.js`:

```json
{
  "mcpServers": {
    "gtasks": {
      "command": "node",
      "args": [
        "{ABSOLUTE PATH TO REPO}/dist/index.js"
      ]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`. Replace the path with the absolute path to your built `dist/index.js`:

```json
{
  "servers": {
    "gtasks": {
      "command": "node",
      "args": [
        "{ABSOLUTE PATH TO REPO}/dist/index.js"
      ]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `list_task_lists` | List all task lists in the user's account |
| `list_tasks` | List tasks in a specific task list, with optional filters |
| `create_task` | Create a new task with title, notes, and optional due date |
| `update_task` | Update an existing task's title, notes, due date, or status |
| `complete_task` | Mark a task as completed |
| `delete_task` | Permanently delete a task |
| `move_task` | Move a task to a different position or parent task |

## When to Use

- **Task management**: Creating, updating, and organizing personal or work tasks
- **Todo lists**: Building and maintaining todo lists with due dates
- **Project tracking**: Organizing tasks into lists for different projects
- **Task completion workflows**: Marking tasks done, clearing completed items
- **Task prioritization**: Reordering tasks by moving them within lists

## Examples

### Create a task with a due date

```
Create a task in my "Work" list:
- Title: "Review Q3 budget proposal"
- Notes: "Check allocation for engineering team"
- Due: 2026-06-15
```

### List and filter tasks

```
Show me all incomplete tasks in my "Personal" task list,
sorted by due date.
```

### Complete multiple tasks

```
Mark these tasks as complete in my "Sprint 42" list:
- "Fix login bug"
- "Update API docs"
- "Deploy v2.1"
```

### Organize tasks hierarchically

```
Create a parent task "Q3 Planning" in my "Work" list, then add
these subtasks under it:
- "Set OKRs"
- "Budget review"
- "Hiring plan"
```

### Daily standup workflow

```
List all tasks due today across all my task lists.
Then create a new task "Daily standup notes" with today's date.
```

## Authentication

1. Create a Google Cloud project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the Google Tasks API
3. Create OAuth 2.0 credentials (Desktop application type) and download the client secret JSON
4. Place the OAuth client secret where the server expects it (see the repo's README)
5. Run the server's one-time OAuth flow (`npm run start auth`) to authorize in the browser; the token is saved to `.gdrive-server-credentials.json`

## Limitations

- Google Tasks API has a rate limit of ~50 requests per second
- Tasks do not support time-of-day (only date-level due dates)
- No native support for task priorities (use notes or title prefixes)
- Subtasks are limited to one level of nesting
