---
name: "gmail"
description: "Gmail integration via MCP — search, read, send, label, draft, forward, autoreply, bulk operations."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# gmail

Gmail integration via the [gogcli-mcp-gmail](https://github.com/chrischall/gogcli-mcp) MCP server (built on [gogcli](https://github.com/openclaw/gogcli)). Provides full email management: search, read, send, draft, label, forward, autoreply, and bulk operations.

## MCP Server

- **Package:** `gogcli-mcp-gmail`
- **Transport:** stdio

## Prerequisites

1. Install gogcli (the underlying Google Suite CLI — see [github.com/openclaw/gogcli](https://github.com/openclaw/gogcli)):

```bash
# macOS
brew install gogcli

# Linux (download the latest release binary as `gog`)
curl -fsSL "https://github.com/openclaw/gogcli/releases/latest/download/gog-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')" -o /usr/local/bin/gog
chmod +x /usr/local/bin/gog
```

2. Install the Gmail MCP server (`gogcli-mcp-gmail` on npm):

```bash
npm install -g gogcli-mcp-gmail
```

3. Authenticate with your Gmail account:

```bash
gog auth add your@gmail.com --services gmail
```

This opens a browser for Google OAuth consent. Grant Gmail read/send/modify permissions.

## Installation

### Claude Code

```bash
claude mcp add gogcli-gmail -- gogcli-mcp-gmail
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "gmail": {
      "command": "gogcli-mcp-gmail",
      "args": [],
      "env": {}
    }
  }
}
```

## Tools

### gmail_search

Search emails using Gmail query syntax. Returns message IDs, subjects, senders, dates, and snippets.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | Yes | — | Gmail search query (same syntax as Gmail search bar) |
| `max_results` | number | No | 10 | Max messages to return (1-100) |
| `label` | string | No | — | Filter by label (`INBOX`, `SENT`, `DRAFT`, custom labels) |

**Example:**

```
Search for unread emails from GitHub in the last week.

Tool call:
  gmail_search({
    "query": "from:notifications@github.com is:unread newer_than:7d",
    "max_results": 20
  })
```

### gmail_get

Retrieve full email content by message ID. Returns headers, body (text and HTML), and attachment metadata.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | Gmail message ID (from search results) |
| `format` | string | No | `full` (default), `metadata`, `minimal` |

**Example:**

```
Tool call:
  gmail_get({
    "message_id": "18f3a2b4c5d6e7f8",
    "format": "full"
  })
```

### gmail_send

Send a new email. Supports plain text and HTML bodies, CC, BCC.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Recipient email address |
| `subject` | string | Yes | Email subject line |
| `body` | string | Yes | Email body (plain text) |
| `html_body` | string | No | HTML body (overrides plain text in HTML-capable clients) |
| `cc` | string | No | CC recipients (comma-separated) |
| `bcc` | string | No | BCC recipients (comma-separated) |

**Example:**

```
Tool call:
  gmail_send({
    "to": "colleague@example.com",
    "subject": "Meeting notes from today",
    "body": "Hi,\n\nHere are the key takeaways from today's standup:\n\n1. Sprint goal on track\n2. Deploy scheduled for Friday\n3. Code review backlog cleared\n\nBest regards"
  })
```

### gmail_draft

Create a draft email without sending. Returns draft ID for later editing or sending.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `to` | string | Yes | Recipient email |
| `subject` | string | Yes | Subject line |
| `body` | string | Yes | Email body |

**Example:**

```
Tool call:
  gmail_draft({
    "to": "team@example.com",
    "subject": "Weekly status report - Week 23",
    "body": "Team,\n\nThis week's highlights:\n- Shipped v2.1.0\n- Fixed 12 bugs\n- Added 3 new features\n\nDraft — will finalize tomorrow."
  })
```

### gmail_label

Apply or remove labels from messages. Supports standard and custom labels.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | Message ID |
| `add_labels` | string[] | No | Labels to add |
| `remove_labels` | string[] | No | Labels to remove |

**Example:**

```
Tool call:
  gmail_label({
    "message_id": "18f3a2b4c5d6e7f8",
    "add_labels": ["IMPORTANT", "project/harness"],
    "remove_labels": ["INBOX"]
  })
```

### gmail_forward

Forward an existing email to another recipient with an optional note.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `message_id` | string | Yes | Message to forward |
| `to` | string | Yes | Forward recipient |
| `note` | string | No | Note prepended to forwarded message |

**Example:**

```
Tool call:
  gmail_forward({
    "message_id": "18f3a2b4c5d6e7f8",
    "to": "manager@example.com",
    "note": "FYI — this deployment issue needs your attention."
  })
```

### gmail_autoreply

Set up an auto-reply for incoming messages matching criteria.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Gmail query to match incoming messages |
| `reply_body` | string | Yes | Auto-reply message body |
| `enabled` | boolean | No | Enable/disable (default: true) |

### gmail_bulk

Perform bulk operations on messages matching a query.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | Yes | Gmail query to select messages |
| `action` | string | Yes | `archive`, `delete`, `mark_read`, `mark_unread`, `label` |
| `label` | string | No | Label to apply (when action is `label`) |

**Example:**

```
Archive all read promotional emails older than 30 days.

Tool call:
  gmail_bulk({
    "query": "category:promotions is:read older_than:30d",
    "action": "archive"
  })
```

## When to Use

- **Email search** — finding specific messages by sender, date, content, labels
- **Reading emails** — retrieving full message content for processing
- **Sending emails** — composing and sending messages programmatically
- **Drafting** — preparing emails for later review and sending
- **Organization** — applying labels, archiving, bulk cleanup
- **Forwarding** — routing messages to others with context
- **Automation** — setting up auto-replies for specific queries

## Tips

- Use Gmail search syntax: `from:`, `to:`, `subject:`, `is:unread`, `has:attachment`, `newer_than:`, `older_than:`
- Combine queries: `from:boss@company.com is:unread newer_than:1d`
- Always search before sending to check for existing threads
- Use `gmail_draft` when unsure; review before sending
- Bulk operations are powerful but irreversible for `delete` — use `archive` when in doubt
