---
name: "google-calendar"
description: "Google Calendar integration via MCP — create, update, list events, check availability, manage calendars."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# google-calendar

Google Calendar integration via MCP. Create, update, list, and delete events. Check availability across calendars and manage multiple calendars programmatically.

## MCP Server

- **Package:** [`@cocal/google-calendar-mcp`](https://github.com/nspady/google-calendar-mcp) (npm)
- **Transport:** stdio

## Installation

### Claude Code

```bash
claude mcp add google-calendar -- npx @cocal/google-calendar-mcp
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["@cocal/google-calendar-mcp"],
      "env": {
        "GOOGLE_OAUTH_CREDENTIALS": "/path/to/gcp-oauth.keys.json"
      }
    }
  }
}
```

After adding the server, ask Claude to authenticate with Google Calendar to complete the OAuth flow before calling any tools.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_OAUTH_CREDENTIALS` | Yes | Path to the Google Cloud OAuth credentials JSON (Desktop app type, e.g. `gcp-oauth.keys.json`) |

## Tools

### list_events

List events within a time range. Returns event titles, times, attendees, and locations.

**Parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `calendar_id` | string | No | `primary` | Calendar ID |
| `time_min` | string | No | now | Start of time range (ISO 8601) |
| `time_max` | string | No | — | End of time range (ISO 8601) |
| `max_results` | number | No | 10 | Max events to return (1-250) |
| `query` | string | No | — | Free-text search in event fields |
| `single_events` | boolean | No | true | Expand recurring events into instances |
| `order_by` | string | No | `startTime` | `startTime` or `updated` |

**Example — today's schedule:**

```
Show me my meetings for today.

Tool call:
  list_events({
    "calendar_id": "primary",
    "time_min": "2026-06-03T00:00:00Z",
    "time_max": "2026-06-03T23:59:59Z",
    "single_events": true,
    "order_by": "startTime"
  })
```

**Example — search for specific meetings:**

```
Tool call:
  list_events({
    "query": "sprint planning",
    "time_min": "2026-06-01T00:00:00Z",
    "time_max": "2026-06-30T23:59:59Z",
    "max_results": 20
  })
```

### create_event

Create a new calendar event with optional attendees, location, and recurrence.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID (default: `primary`) |
| `summary` | string | Yes | Event title |
| `start` | string | Yes | Start time (ISO 8601) |
| `end` | string | Yes | End time (ISO 8601) |
| `description` | string | No | Event description/notes |
| `location` | string | No | Event location or video link |
| `attendees` | string[] | No | Attendee email addresses |
| `recurrence` | string[] | No | RRULE strings for recurring events |
| `reminders` | object | No | Custom reminder overrides |
| `timezone` | string | No | IANA timezone (e.g., `America/New_York`) |

**Example — one-time meeting:**

```
Schedule a 1-on-1 with Alice for tomorrow at 2pm ET.

Tool call:
  create_event({
    "summary": "1:1 with Alice",
    "start": "2026-06-04T14:00:00",
    "end": "2026-06-04T14:30:00",
    "timezone": "America/New_York",
    "attendees": ["alice@example.com"],
    "description": "Weekly sync — discuss Q3 roadmap priorities.",
    "location": "https://meet.google.com/abc-defg-hij"
  })
```

**Example — recurring event:**

```
Tool call:
  create_event({
    "summary": "Team Standup",
    "start": "2026-06-04T09:00:00",
    "end": "2026-06-04T09:15:00",
    "timezone": "America/New_York",
    "attendees": ["team@example.com"],
    "recurrence": ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=26"]
  })
```

### update_event

Modify an existing event. Only provided fields are updated; others remain unchanged.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID |
| `event_id` | string | Yes | Event ID (from list_events) |
| `summary` | string | No | Updated title |
| `start` | string | No | Updated start time |
| `end` | string | No | Updated end time |
| `description` | string | No | Updated description |
| `location` | string | No | Updated location |
| `attendees` | string[] | No | Updated attendee list |

**Example:**

```
Move the 1:1 with Alice to 3pm and add Bob.

Tool call:
  update_event({
    "event_id": "abc123def456",
    "start": "2026-06-04T15:00:00",
    "end": "2026-06-04T15:30:00",
    "attendees": ["alice@example.com", "bob@example.com"]
  })
```

### delete_event

Delete a calendar event by ID.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `calendar_id` | string | No | Calendar ID |
| `event_id` | string | Yes | Event ID to delete |

**Example:**

```
Tool call:
  delete_event({
    "event_id": "abc123def456"
  })
```

### check_availability

Check free/busy status for one or more calendars across a time range.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `calendars` | string[] | Yes | Calendar IDs to check |
| `time_min` | string | Yes | Start of window (ISO 8601) |
| `time_max` | string | Yes | End of window (ISO 8601) |
| `timezone` | string | No | IANA timezone |

**Example:**

```
Check if Alice and Bob are free tomorrow afternoon.

Tool call:
  check_availability({
    "calendars": ["alice@example.com", "bob@example.com"],
    "time_min": "2026-06-04T13:00:00",
    "time_max": "2026-06-04T18:00:00",
    "timezone": "America/New_York"
  })
```

### list_calendars

List all calendars the authenticated user has access to.

**Example:**

```
Tool call:
  list_calendars({})
```

Returns calendar ID, name, access role, and timezone for each calendar.

## When to Use

- **Scheduling** — creating meetings, setting up recurring events
- **Calendar review** — checking today's schedule, upcoming meetings
- **Meeting coordination** — checking availability before scheduling
- **Event management** — updating times, adding attendees, changing locations
- **Calendar organization** — listing calendars, managing multiple calendars
- **Automation** — programmatic event creation for workflows

## Tips

- Always use ISO 8601 format for dates and times
- Specify `timezone` explicitly to avoid UTC surprises
- Use `check_availability` before `create_event` to avoid conflicts
- Use `single_events: true` in `list_events` to expand recurring events
- RRULE syntax follows [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545) — common patterns:
  - Daily: `RRULE:FREQ=DAILY;COUNT=30`
  - Weekly on MWF: `RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR`
  - Monthly: `RRULE:FREQ=MONTHLY;BYMONTHDAY=1`
- The authenticated Google account must have access to any calendar you operate on; share secondary calendars with it
