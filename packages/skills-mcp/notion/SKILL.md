---
name: "notion"
description: "Notion workspace integration via MCP — pages, databases, blocks, search, and content management."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# notion

Notion workspace integration via the [Notion MCP server](https://github.com/notionhq/notion-mcp-server). Create, read, update, and search pages; query and create databases; manage block content.

## MCP Server

- **Package:** `@notionhq/notion-mcp-server`
- **Transport:** stdio
- **Installs:** 3215+ (Smithery)

## Installation

### Claude Code

```bash
claude mcp add notion -- npx @notionhq/notion-mcp-server
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "notion": {
      "command": "npx",
      "args": ["@notionhq/notion-mcp-server"],
      "env": {
        "NOTION_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Notion API Key Setup

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click "New integration" and name it (e.g., "Claude MCP")
3. Select the workspace and set capabilities (read content, update content, insert content)
4. Copy the Internal Integration Secret (starts with `ntn_`)
5. Share specific pages/databases with the integration in Notion (three-dot menu > Connections)

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_API_KEY` | Yes | Internal Integration Secret from [notion.so/my-integrations](https://www.notion.so/my-integrations) |

## Tools

### search_pages

Search across pages and databases in the workspace by title or content.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Search query text |
| `filter` | object | No | Filter by object type: `{ "value": "page" }` or `{ "value": "database" }` |
| `page_size` | number | No | Results per page (max 100, default 25) |

**Example:**

```
Search for pages about project roadmap.

Tool call:
  search_pages({
    "query": "project roadmap",
    "filter": { "value": "page" },
    "page_size": 10
  })
```

### get_page

Retrieve a page's properties and metadata by its ID.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page_id` | string | Yes | Notion page ID (UUID format) |

**Example:**

```
Get the properties of a specific page.

Tool call:
  get_page({
    "page_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  })
```

### create_page

Create a new page in a parent page or database.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `parent` | object | Yes | Parent reference: `{ "page_id": "..." }` or `{ "database_id": "..." }` |
| `properties` | object | Yes | Page properties (title, etc.) |
| `children` | array | No | Block content to add to the page |

**Example:**

```
Create a new meeting notes page in a database.

Tool call:
  create_page({
    "parent": { "database_id": "abc123-def456-7890" },
    "properties": {
      "Name": {
        "title": [{ "text": { "content": "Sprint Planning 2026-06-03" } }]
      },
      "Status": {
        "select": { "name": "In Progress" }
      },
      "Date": {
        "date": { "start": "2026-06-03" }
      }
    },
    "children": [
      {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{ "text": { "content": "Agenda" } }]
        }
      },
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [{ "text": { "content": "Review completed tasks" } }]
        }
      },
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [{ "text": { "content": "Plan next sprint items" } }]
        }
      }
    ]
  })
```

### update_page

Update properties on an existing page.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page_id` | string | Yes | Page ID to update |
| `properties` | object | Yes | Properties to set/update |

**Example:**

```
Mark a task as complete and set the due date.

Tool call:
  update_page({
    "page_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "properties": {
      "Status": { "select": { "name": "Done" } },
      "Due Date": { "date": { "start": "2026-06-03" } }
    }
  })
```

### query_database

Query a database with filters, sorts, and pagination.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `database_id` | string | Yes | Database ID to query |
| `filter` | object | No | Notion filter object |
| `sorts` | array | No | Sort criteria |
| `page_size` | number | No | Results per page (max 100) |
| `start_cursor` | string | No | Pagination cursor |

**Example:**

```
Query a task database for all in-progress items, sorted by priority.

Tool call:
  query_database({
    "database_id": "abc123-def456-7890",
    "filter": {
      "property": "Status",
      "select": { "equals": "In Progress" }
    },
    "sorts": [
      { "property": "Priority", "direction": "descending" }
    ],
    "page_size": 50
  })
```

### create_database

Create a new database inside a parent page.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `parent` | object | Yes | Parent page reference: `{ "page_id": "..." }` |
| `title` | array | Yes | Database title (rich text array) |
| `properties` | object | Yes | Database schema (column definitions) |

**Example:**

```
Create a bug tracker database.

Tool call:
  create_database({
    "parent": { "page_id": "parent-page-id" },
    "title": [{ "text": { "content": "Bug Tracker" } }],
    "properties": {
      "Name": { "title": {} },
      "Status": {
        "select": {
          "options": [
            { "name": "Open", "color": "red" },
            { "name": "In Progress", "color": "yellow" },
            { "name": "Resolved", "color": "green" }
          ]
        }
      },
      "Priority": {
        "select": {
          "options": [
            { "name": "Critical", "color": "red" },
            { "name": "High", "color": "orange" },
            { "name": "Medium", "color": "yellow" },
            { "name": "Low", "color": "gray" }
          ]
        }
      },
      "Assignee": { "people": {} },
      "Due Date": { "date": {} }
    }
  })
```

### append_blocks

Append block content to an existing page or block.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `block_id` | string | Yes | Page ID or block ID to append to |
| `children` | array | Yes | Array of block objects to append |

**Example:**

```
Add a code block and a paragraph to an existing page.

Tool call:
  append_blocks({
    "block_id": "page-id-here",
    "children": [
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{ "text": { "content": "Here is the implementation:" } }]
        }
      },
      {
        "object": "block",
        "type": "code",
        "code": {
          "rich_text": [{ "text": { "content": "console.log('hello from MCP');" } }],
          "language": "javascript"
        }
      }
    ]
  })
```

### get_block_children

Retrieve all child blocks of a page or block (with pagination).

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `block_id` | string | Yes | Page ID or block ID |
| `page_size` | number | No | Results per page (max 100) |
| `start_cursor` | string | No | Pagination cursor |

**Example:**

```
Get all content blocks from a page.

Tool call:
  get_block_children({
    "block_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "page_size": 100
  })
```

## When to Use

- **Notion workspace management** — creating, reading, and organizing pages
- **Creating/updating pages** — meeting notes, documentation, project pages
- **Querying databases** — task boards, bug trackers, CRM entries with filters and sorts
- **Content management** — appending blocks, managing page structure
- **Knowledge base operations** — searching across workspace, linking related pages
- **Template pages** — creating pages from a consistent structure with properties

## Procedure

1. **API key setup** — create an integration at notion.so/my-integrations and share target pages/databases with it
2. **Search pages** — use `search_pages` to discover pages and databases in the workspace
3. **Read page content** — use `get_page` for properties and `get_block_children` for block content
4. **Create pages with blocks** — use `create_page` with `children` array for structured content
5. **Query databases with filters/sorts** — use `query_database` with Notion filter syntax for precise queries
6. **Update properties** — use `update_page` to modify page properties (status, dates, people)
7. **Manage blocks** — use `append_blocks` to add content to existing pages
8. **Template pages** — combine `create_page` with predefined `children` and `properties` for consistent structure

## Anti-Patterns

- **No API key scoping** — always scope your integration to only the pages/databases it needs access to; avoid workspace-wide access unless necessary
- **Ignoring rate limits** — Notion API has rate limits (3 requests/second); batch operations and implement backoff for bulk updates
- **Not handling pagination** — large databases and pages may return paginated results; always check `has_more` and use `start_cursor` for complete data

## Self-Check

1. `NOTION_API_KEY` environment variable is set (starts with `ntn_`)
2. Integration is shared with target pages/databases in Notion
3. `search_pages` returns results for a known page title
4. `get_page` retrieves properties for a known page ID
5. `create_page` successfully creates a new page with title and blocks
6. `query_database` returns filtered results from a known database
7. `append_blocks` adds content to an existing page
8. `get_block_children` retrieves block content from a page
9. `update_page` modifies properties on an existing page
10. Pagination works correctly with `start_cursor` for large result sets

## Tips

- Use `search_pages` with `filter: { "value": "database" }` to find only databases
- Notion block types include: paragraph, heading_1/2/3, bulleted_list_item, numbered_list_item, to_do, toggle, code, quote, callout, divider, table, bookmark
- When creating pages in a database, properties must match the database schema
- Use `start_cursor` from previous responses to paginate through large datasets
- Rich text objects support bold, italic, code, links, and colors via annotations
