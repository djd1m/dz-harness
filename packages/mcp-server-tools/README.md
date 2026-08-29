# @dzhechkov/mcp-server-tools

An **MCP server** that exposes the DZ cross-platform harness as Model Context
Protocol tools, so any MCP client can drive the harness without the CLI.

## Tools

| Tool | Purpose |
|---|---|
| `skill_list` | List the skills in the configured skills directory |
| `skill_get` | Read one skill's `SKILL.md` and parsed frontmatter |
| `skill_compile` | Compile a skill for a target platform (`claude` / `codex` / `opencode` / `hermes`) |
| `harness_verify` | Compile + structurally verify a skill for a platform |

### `claim_check_text` — vet prose before you write it

Runs claim-check over **raw text** (not a file), so an agent can check a paragraph it is about to
write. Mirrors `dz claim-check`, but voluntary and text-only.

- Input: `{ text: string, failOn?: 'high' | 'medium' | 'none' }`.
- **Fail-closed:** empty, whitespace-only, or invisible-character-only text is an **error**, not a pass —
  a claim-check called with nothing has vetted nothing.
- Findings are **reported**, never thrown. `failOn` sets a `gated` flag; it never rescues the empty error.
- A clean result means "no untagged quantitative claim found", not "your text is correct".

**From an agent, in plain language:**
> "Before I write this paragraph, claim-check it: 'our model hits 99% accuracy'."

## Configuration

The server reads skills from `DZ_SKILLS_DIR` (an environment variable),
defaulting to `.claude/skills` relative to the working directory.

## Usage — register with Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "dz-harness": {
      "command": "dz-mcp-server-tools",
      "env": { "DZ_SKILLS_DIR": ".claude/skills" }
    }
  }
}
```

Transport is **stdio**. The server is also importable — `createDzMcpServer()`
returns a configured `McpServer` for embedding or testing.

## Status

`0.1.0` — alpha, part of the `extended-a-migration` feature (Phase 5).
