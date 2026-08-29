# @dzhechkov/adapter-openclaude

OpenClaude platform adapter — compiles canonical [agentskills.io](https://agentskills.io) skills into the `.openclaude/skills/` tree.

[OpenClaude](https://github.com/gitlawb/openclaude) (28K+ stars) is an open-source coding-agent CLI supporting multiple LLM providers (OpenAI, Gemini, Ollama, DeepSeek, and more). It uses the same SKILL.md format as Claude Code.

## Install

```bash
dz init --target openclaude --preset devops
```

## Skills Directory

| Path | Level |
|------|-------|
| `.openclaude/skills/` | Project-level (this adapter) |
| `~/.openclaude/skills/` | User-level |
| `.claude/skills/` | Also supported (Claude Code compat) |

## Status

`v0.1.2` — initial release. Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub).
