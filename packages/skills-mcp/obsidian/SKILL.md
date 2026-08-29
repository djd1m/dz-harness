---
name: "obsidian"
description: "Obsidian vault management via MCP — read, write, search, edit notes, tags, and frontmatter."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# obsidian

Obsidian vault management via the [obsidian-mcp-server](https://github.com/MarkusPfworthy/obsidian-mcp-server). Read, write, search, and edit notes, manage tags and frontmatter through the Obsidian Local REST API plugin.

## MCP Server

- **Package:** `obsidian-mcp-server`
- **Transport:** stdio
- **Prerequisite:** Obsidian Local REST API plugin must be enabled in your vault

## Installation

### Claude Code

```bash
claude mcp add obsidian -- npx obsidian-mcp-server
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "npx",
      "args": ["obsidian-mcp-server"],
      "env": {
        "OBSIDIAN_REST_URL": "https://localhost:27124",
        "OBSIDIAN_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Obsidian REST API Plugin Setup

1. Open Obsidian Settings > Community Plugins > Browse
2. Search for "Local REST API" and install it
3. Enable the plugin and note the API key from its settings
4. The plugin runs on `https://localhost:27124` by default

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OBSIDIAN_REST_URL` | No | REST API URL (default: `https://localhost:27124`) |
| `OBSIDIAN_API_KEY` | Yes | API key from the Local REST API plugin settings |

## Tools

### read_note

Read the full content of a note by its vault path.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path (e.g., `Projects/my-project.md`) |

**Example:**

```
Read my daily note from today.

Tool call:
  read_note({
    "path": "Daily Notes/2026-06-03.md"
  })
```

### write_note

Create or overwrite a note at a given vault path.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path for the note |
| `content` | string | Yes | Full Markdown content to write |

**Example:**

```
Create a new meeting notes file for the standup.

Tool call:
  write_note({
    "path": "Meetings/2026-06-03-standup.md",
    "content": "---\ndate: 2026-06-03\ntype: standup\n---\n\n# Standup 2026-06-03\n\n## Updates\n- Completed MCP skill wrappers\n- Starting integration tests\n\n## Blockers\n- None\n\n## Next\n- Deploy to staging"
  })
```

### search_notes

Search notes by content or tags across the vault.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query (text or tag) |
| `context_length` | number | No | Characters of context around matches (default: 100) |

**Example:**

```
Find all notes mentioning "MCP server".

Tool call:
  search_notes({
    "query": "MCP server",
    "context_length": 200
  })
```

### edit_note

Perform a surgical edit on a note — find and replace specific content without rewriting the entire file.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path of the note |
| `old_text` | string | Yes | Exact text to find |
| `new_text` | string | Yes | Replacement text |

**Example:**

```
Fix a typo in my project README note.

Tool call:
  edit_note({
    "path": "Projects/harness-hub.md",
    "old_text": "teh integration tests",
    "new_text": "the integration tests"
  })
```

### list_tags

List all tags used across the vault with their occurrence counts.

**Example:**

```
Show me all tags in my vault.

Tool call:
  list_tags({})
```

### update_frontmatter

Update YAML frontmatter properties on a note without modifying the body content.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | string | Yes | Vault-relative path |
| `properties` | object | Yes | Key-value pairs to set in frontmatter |

**Example:**

```
Mark a note as reviewed and set its status to published.

Tool call:
  update_frontmatter({
    "path": "Blog/mcp-skills-guide.md",
    "properties": {
      "status": "published",
      "reviewed": true,
      "publish_date": "2026-06-03"
    }
  })
```

### list_notes

List notes in a directory or across the entire vault.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `directory` | string | No | Vault-relative directory path (default: root) |

**Example:**

```
List all notes in the Projects folder.

Tool call:
  list_notes({
    "directory": "Projects"
  })
```

### get_vault_info

Retrieve vault metadata — name, total notes count, tags summary, and plugin status.

**Example:**

```
What vault am I connected to and how many notes are there?

Tool call:
  get_vault_info({})
```

## When to Use

- **Knowledge management** — reading, creating, and organizing notes in Obsidian
- **Note-taking** — capturing meeting notes, daily journals, research findings
- **Searching** — finding notes by content, tags, or frontmatter properties
- **Updating notes** — surgical edits without overwriting entire files
- **Tag management** — listing, auditing, and organizing tags across the vault
- **Frontmatter** — bulk updating metadata properties (status, dates, categories)

## Procedure

1. **Connect to vault** — ensure Obsidian is running with the Local REST API plugin enabled; verify connection with `get_vault_info`
2. **Read notes** — use `read_note` to retrieve specific notes by path, or `list_notes` to browse directories
3. **Search by content/tags** — use `search_notes` to find notes matching text queries or tag patterns
4. **Write/create notes** — use `write_note` to create new notes or overwrite existing ones with full Markdown content
5. **Edit frontmatter** — use `update_frontmatter` to set metadata properties without touching note body
6. **Manage tags** — use `list_tags` to audit tag usage; update tags via `edit_note` or `update_frontmatter`

## Anti-Patterns

- **Editing binary files** — the MCP server handles Markdown text only; do not attempt to read/write images, PDFs, or other binary attachments
- **No vault backup** — always ensure your vault is backed up (git, Obsidian Sync, or filesystem snapshots) before bulk write operations
- **Ignoring frontmatter schema** — if your vault uses a consistent frontmatter schema (e.g., Dataview-compatible), respect it when updating properties to avoid breaking queries

## Self-Check

1. Obsidian is running and the Local REST API plugin is enabled
2. `OBSIDIAN_API_KEY` environment variable is set correctly
3. `get_vault_info` returns vault name and note count without errors
4. `read_note` successfully retrieves an existing note
5. `search_notes` returns results for a known query
6. `write_note` creates a note and `read_note` confirms the content
7. `edit_note` performs surgical replacement without corrupting the file
8. `update_frontmatter` modifies properties and preserves note body

## Tips

- Use `list_notes` to explore vault structure before targeted reads
- Combine `search_notes` + `edit_note` for bulk find-and-replace workflows
- Use `update_frontmatter` instead of rewriting entire notes when only metadata changes
- Keep frontmatter property names consistent with your Dataview queries
- Use `context_length` in search to get more surrounding text for disambiguation
