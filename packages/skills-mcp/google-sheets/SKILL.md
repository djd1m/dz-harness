---
name: "google-sheets"
description: "Google Sheets integration via MCP — read, write, create, format spreadsheets programmatically."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# google-sheets

Google Sheets integration via MCP. Read, write, create, and format spreadsheets programmatically. Supports cell ranges, formatting, charts, and pivot tables.

## MCP Server

- **Package:** [`mcp-google-sheets`](https://github.com/FilippTrigub/mcp-google-sheets) (npm)
- **Transport:** stdio

## Installation

### Claude Code

```bash
claude mcp add google-sheets -- npx mcp-google-sheets
```

### Claude Desktop (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "google-sheets": {
      "command": "npx",
      "args": ["mcp-google-sheets"],
      "env": {
        "SERVICE_ACCOUNT_PATH": "/path/to/service-account.json"
      }
    }
  }
}
```

## Environment Variables

The server supports several auth modes (see the [upstream README](https://github.com/FilippTrigub/mcp-google-sheets)). For server-to-server use, a Google Cloud service account is simplest:

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_PATH` | Yes (service account) | Path to Google Cloud service account JSON key file |
| `DRIVE_FOLDER_ID` | No | Restrict access to a specific Drive folder |
| `GOOGLE_SHEETS_CLIENT_ID` | Alt (OAuth) | OAuth client ID (alternative to service account) |
| `GOOGLE_SHEETS_CLIENT_SECRET` | Alt (OAuth) | OAuth client secret |
| `TOKEN_PATH` | Alt (OAuth) | Path where the OAuth token is cached |

## Tools

### read_sheet

Read data from a spreadsheet range. Returns a 2D array of cell values.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `spreadsheet_id` | string | Yes | Google Sheets ID (from URL) |
| `range` | string | Yes | A1 notation range (e.g., `Sheet1!A1:D10`) |
| `value_render_option` | string | No | `FORMATTED_VALUE` (default), `UNFORMATTED_VALUE`, `FORMULA` |

**Example — read a data range:**

```
Read the sales data from the Q2 report spreadsheet.

Tool call:
  read_sheet({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "range": "Q2 Sales!A1:F50"
  })
```

**Example — read formulas:**

```
Tool call:
  read_sheet({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "range": "Summary!A1:C10",
    "value_render_option": "FORMULA"
  })
```

### write_sheet

Write data to a spreadsheet range. Overwrites existing data in the target range.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `spreadsheet_id` | string | Yes | Google Sheets ID |
| `range` | string | Yes | A1 notation target range |
| `values` | any[][] | Yes | 2D array of values to write |
| `value_input_option` | string | No | `USER_ENTERED` (default, parses formulas), `RAW` |

**Example — write data:**

```
Tool call:
  write_sheet({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "range": "Sheet1!A1:C4",
    "values": [
      ["Name", "Score", "Grade"],
      ["Alice", 95, "A"],
      ["Bob", 87, "B+"],
      ["Carol", 92, "A-"]
    ]
  })
```

**Example — write formulas:**

```
Tool call:
  write_sheet({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "range": "Sheet1!D1:D4",
    "values": [
      ["Average"],
      ["=AVERAGE(B2:B4)"],
      ["=MAX(B2:B4)"],
      ["=MIN(B2:B4)"]
    ],
    "value_input_option": "USER_ENTERED"
  })
```

### create_sheet

Create a new spreadsheet with optional initial data and sheet names.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Spreadsheet title |
| `sheets` | string[] | No | Sheet/tab names (default: `["Sheet1"]`) |
| `initial_data` | object | No | Map of sheet name to 2D array of initial values |

**Example:**

```
Tool call:
  create_sheet({
    "title": "Sprint 23 Metrics",
    "sheets": ["Overview", "Burndown", "Velocity"],
    "initial_data": {
      "Overview": [
        ["Metric", "Value", "Target"],
        ["Story Points", 42, 45],
        ["Bugs Fixed", 12, 10],
        ["PRs Merged", 28, 25]
      ]
    }
  })
```

### format_cells

Apply formatting to a range of cells: colors, fonts, borders, number formats.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `spreadsheet_id` | string | Yes | Google Sheets ID |
| `range` | string | Yes | A1 notation range |
| `format` | object | Yes | Formatting specification |

**Example — format header row:**

```
Tool call:
  format_cells({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "range": "Sheet1!A1:F1",
    "format": {
      "bold": true,
      "background_color": "#4285F4",
      "font_color": "#FFFFFF",
      "font_size": 12,
      "horizontal_alignment": "CENTER"
    }
  })
```

### add_chart

Create a chart from spreadsheet data.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `spreadsheet_id` | string | Yes | Google Sheets ID |
| `data_range` | string | Yes | Data range for chart |
| `chart_type` | string | Yes | `BAR`, `LINE`, `PIE`, `COLUMN`, `AREA`, `SCATTER` |
| `title` | string | No | Chart title |
| `sheet_name` | string | No | Sheet to place chart on |

**Example:**

```
Tool call:
  add_chart({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "data_range": "Velocity!A1:B12",
    "chart_type": "LINE",
    "title": "Sprint Velocity Trend"
  })
```

### pivot_table

Create a pivot table from source data.

**Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `spreadsheet_id` | string | Yes | Google Sheets ID |
| `source_range` | string | Yes | Source data range |
| `rows` | string[] | Yes | Column names for row grouping |
| `values` | object[] | Yes | Aggregation specs: `{ column, function }` |
| `target_sheet` | string | No | Sheet to place pivot table |

**Example:**

```
Tool call:
  pivot_table({
    "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
    "source_range": "Raw Data!A1:E500",
    "rows": ["Department", "Quarter"],
    "values": [
      { "column": "Revenue", "function": "SUM" },
      { "column": "Headcount", "function": "AVERAGE" }
    ],
    "target_sheet": "Pivot Summary"
  })
```

## When to Use

- **Reading data** — extracting spreadsheet data for analysis or processing
- **Writing data** — populating spreadsheets with computed results, reports
- **Creating reports** — generating new spreadsheets with formatted data and charts
- **Data analysis** — pivot tables, aggregations, formula-based computations
- **CSV import/export** — read CSV into arrays, write arrays to sheets
- **Formatting** — applying consistent visual styles to reports

## Tips

- The spreadsheet ID is the long string in the Google Sheets URL: `docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
- Use `USER_ENTERED` value input to let Google Sheets parse formulas and dates
- Use `RAW` value input when writing data that should not be interpreted (e.g., strings starting with `=`)
- Share spreadsheets with the service account email to grant access
- Read first, then write — avoid overwriting data blindly
