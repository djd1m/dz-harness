---
name: "context7"
description: "Context7 documentation search via MCP — search up-to-date library docs, API references, code examples."
trust_tier: 2
trust_tier_label: "Validated"
validation:
  schema_path: schemas/output.json
  validator_path: scripts/validate-config.json
---

# context7

Context7 documentation search via MCP — search up-to-date library docs, API references, code examples.

## MCP Server

- **Server**: `@upstash/context7-mcp` (or Smithery hosted)
- **Install**: `claude mcp add context7 -- npx @upstash/context7-mcp`
- **Auth**: None required

## Installation

### Claude Code

```bash
claude mcp add context7 -- npx @upstash/context7-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["@upstash/context7-mcp"]
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["@upstash/context7-mcp"]
    }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "context7": {
      "command": "npx",
      "args": ["@upstash/context7-mcp"]
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `resolve_library` | Resolve a library name to its Context7 identifier |
| `get_library_docs` | Get up-to-date documentation for a specific library and topic |
| `search_docs` | Search across all indexed libraries for documentation on a topic |

## When to Use

- **Looking up library documentation**: Get current API references instead of relying on training data
- **Finding API references**: Search for specific function signatures, parameters, return types
- **Getting code examples**: Find working examples for specific libraries and frameworks
- **Version-specific docs**: Get documentation for the latest version of a library
- **Cross-library search**: Find how different libraries handle the same concept

## Examples

### Look up React hooks documentation

```
Use context7 to find the latest documentation for React's
useOptimistic hook, including examples and API reference.
```

### Search Next.js App Router patterns

```
Search context7 for Next.js documentation about:
- Server Actions
- Route handlers
- Middleware configuration

Show me code examples for each.
```

### Tailwind CSS class reference

```
Look up the Tailwind CSS documentation for the new
container queries utility classes. Show me the available
classes and usage examples.
```

### Compare library APIs

```
Use context7 to get the documentation for both Zod and Valibot
schema validation. Compare their APIs for:
- Object schema definition
- String validation with constraints
- Error handling
```

### Framework migration guide

```
Search context7 for the Svelte 5 documentation on runes.
I need to understand:
- $state vs let
- $derived vs $:
- $effect vs onMount
```

### Find library-specific patterns

```
Look up the Drizzle ORM documentation for:
- Defining relations (one-to-many, many-to-many)
- Running migrations
- Using with PostgreSQL

Include the latest API and code examples.
```

## How It Works

Context7 maintains an up-to-date index of documentation for popular libraries and frameworks. Unlike LLM training data which may be outdated, Context7 fetches current documentation so you get accurate, version-specific information.

The typical workflow is:

1. **Resolve**: Use `resolve_library` to find the Context7 identifier for a library (e.g., "react" -> `/facebook/react`)
2. **Fetch**: Use `get_library_docs` with a topic to get relevant documentation sections
3. **Search**: Use `search_docs` for broader cross-library searches

## Supported Libraries

Context7 indexes thousands of libraries including (but not limited to):

- **Frontend**: React, Vue, Svelte, Angular, Solid, Qwik
- **Meta-frameworks**: Next.js, Nuxt, SvelteKit, Astro, Remix
- **CSS**: Tailwind CSS, UnoCSS, Panda CSS
- **State management**: Zustand, Jotai, TanStack Query, Redux
- **Validation**: Zod, Valibot, Yup, ArkType
- **ORM**: Drizzle, Prisma, Kysely, TypeORM
- **Testing**: Vitest, Playwright, Cypress, Testing Library
- **Runtime**: Node.js, Deno, Bun
- **Languages**: TypeScript, Python, Rust, Go

## Limitations

- Coverage depends on Context7's indexing (most popular libraries are covered)
- Very new or niche libraries may not be indexed yet
- Documentation depth varies by library (some have full API docs, others have guides only)
- No support for private or internal documentation
- Results are read-only documentation snippets, not interactive
