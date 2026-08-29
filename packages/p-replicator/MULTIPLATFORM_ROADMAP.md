# Multi-Platform Compatibility Roadmap

**Status:** roadmap (not committed). Captured 2026-05-07 for future review.

This document analyzes the cost/benefit of expanding `@dzhechkov/p-replicator`
from Claude Code-only to also supporting **Codex CLI**, **OpenCode**, and
**KiloCode**. Tracking the analysis here so we can return to the question
when real demand for non-Claude platforms appears.

---

## Why this matters

`p-replicator` ships a workflow toolkit (slash commands, skills, agents,
rules, hooks, statusline) that currently targets Claude Code's config layout
(`.claude/...`, `settings.json`). For teaching/demo use cases (the
`--feature-branches` flag in v1.5.0), students using other AI coding tools
hit a wall — they have to either install Claude Code or copy artifacts
manually.

The opportunity: 80%+ of the toolkit's *content* (markdown-based skills,
commands, rules) is platform-neutral. Only delivery paths and a few unique
features (hooks, statusline) need adapter logic.

---

## Compatibility matrix (concept → platform)

| Concept | Claude Code | Codex CLI | OpenCode (sst) | KiloCode (VS Code ext.) |
|---|---|---|---|---|
| **Slash commands** | `.claude/commands/<name>.md` | `~/.codex/prompts/<name>.md` (global) or per-project | `opencode.json` commands array | `.kilocode/commands/<name>.md` |
| **Project context** | `CLAUDE.md` | `AGENTS.md` (canonical) | `AGENTS.md` or `opencode.json` instructions | `.kilocode/rules/` |
| **Skills (composable, `view()`)** | `.claude/skills/<name>/SKILL.md` | ❌ none — must inline | ❌ none — folder of refs | ⚠️ via custom modes |
| **Subagents** | `.claude/agents/<name>.md` + Task tool | Subtasks (different API) | Modes/agents in config | Custom modes |
| **Rules** | `.claude/rules/<name>.md` | Sections in AGENTS.md | `opencode.json:rules` | `.kilocode/rules/<name>.md` |
| **Hooks (SessionStart, Stop)** | `settings.json:hooks` | ❌ none (only approval policies) | ⚠️ limited | ❌ only VS Code event API |
| **Statusline** | `settings.json:statusLine` | ❌ none (text CLI) | ⚠️ TUI status (different model) | ❌ requires VS Code ext. API |
| **MCP servers** | `.mcp.json` | `~/.codex/config.toml` `[mcp_servers.X]` | `opencode.json:mcp` | `.kilocode/mcp.json` |
| **Manifest tracking** | `.p-replicator.json` | universal — any project | universal | universal |

### Universality verdict

- ✅ **Universal (~80-100%):** slash commands, rules, MCP, manifest, project context
- ⚠️ **Lossy (~50-60%):** skills (require inline-compilation), subagents (different runtime models)
- ❌ **Claude-only:** hooks, statusline (graceful degradation needed)

---

## Three levels of approach

### Level 1 — Concept-portable, manual copy

**Effort:** Tier M, **~6-8 hours**.

**What changes:**
- Remove `.claude/skills/<X>/SKILL.md` paths from command markdown
- Replace `view("/mnt/skills/...")` with platform-neutral "load skill X"
- Hooks/statusline remain Claude-only (documented as advanced features)
- Add `compatibility/MANUAL_INSTALL.md` with per-platform copy instructions

**Result:** ~70% functionality preserved on any platform via manual file copy.
Lost: hooks (auto-commit), statusline.

### Level 2 — Adapter pattern with `init --target <platform>`

**Effort:** Tier L, **~16-30 hours total** (per-platform varies).

Mirror existing `product-keysarium-2026/lib/platform-adapters.md` pattern
(`/init-platform --platform <name>`).

```
src/adapters/
├── claude-code.js   # default (current behavior)
├── codex.js         # → ~/.codex/prompts/ + AGENTS.md
├── opencode.js      # → opencode.json
└── kilocode.js      # → .kilocode/
```

**Each adapter implements:**
- `getPaths()` — where each artifact type belongs on this platform
- `translateCommand(content)` — `$ARGUMENTS` → platform syntax
- `installCommand|Rule|Skill|Agent` — with path-mapping
- `installSettings|Hooks|Statusline` — skip on platforms without them (graceful)

**Per-platform effort:**
- Codex: ~8-10h (well-documented, AGENTS.md + prompts/, MCP) — closest model
- OpenCode: ~8-10h (`opencode.json` schema, modes API)
- KiloCode: ~12-20h (VS Code paradigm, may need companion extension)

**Result:** 80-90% feature parity per platform. Hooks/statusline still degraded.

### Level 3 — Full feature parity with workaround logic

**Effort:** Tier XL, **multi-week project**.

Beyond Level 2 — adapt logic for platform-specific capabilities:
- Codex: bake auto-commit into commands themselves (no SessionStart/Stop)
- OpenCode: use TUI status API for statusline
- KiloCode: companion VS Code extension with TreeView progress, status bar item

**Verdict:** Premature optimization for current scope. Skip until concrete demand.

---

## Per-feature breakdown — what's worth adapting

| Feature | Universal | Adapt effort | Recommendation |
|---|---|---|---|
| `/replicate` pipeline | ✅ logic universal | path-translate commands | **Yes** — primary value |
| `/run`, `/go`, `/next` workflow | ✅ universal | translate `$ARGUMENTS` | **Yes** |
| `/feature`, `/plan` SPARC lifecycle | ✅ universal | inline skill content | **Yes** |
| `/myinsights`, `/docs`, `/harvest`, `/start`, `/deploy` | ✅ universal | path-translate | **Yes** |
| 10 skills (sparc-prd-mini, etc.) | ⚠️ Claude-specific composition | inline-compile into commands | **Compromise** — sacrifice runtime-loading |
| 4 pre-shipped agents | ⚠️ Claude Task-tool specific | translate to platform sub-agents | **Yes if platform supports** |
| 6 rules | ✅ universal markdown | path-translate | **Yes** |
| Hooks (SessionStart insights, Stop autocommit) | ❌ Claude-only | bake into commands as instructions | **Compromise** — degraded UX |
| Statusline dashboard | ❌ Claude-only | optional `progress.md` file? | **Skip** — Claude-exclusive feature |
| `verify` CLI command | ✅ universal | works as-is | **Yes** (already works) |
| `feature-roadmap.json` + `--feature-branches` | ✅ git-based | works as-is | **Yes** |
| MCP server config | ✅ universal | path-translate config file | **Yes** |

---

## Hidden complexities

1. **Slash command argument syntax differs:**
   - Claude: `$ARGUMENTS`, `$ARG1`
   - Codex: `{{arg}}` or appended params
   - OpenCode: configurable
   - **Adapter responsibility:** substitution at install time

2. **Skill composition (`view()` syntax):**
   - Claude runtime resolves `view(.claude/skills/X/SKILL.md)` dynamically
   - On other platforms, SKILL.md content must be **inlined** into command at install time
   - Compile step: recursively replace `view()` references with content
   - Complexity: cross-skill dependencies (cc-toolkit-generator-enhanced → 9 modules), deep recursion

3. **Subagent semantics:**
   - Claude: `Task` tool spawns parallel sub-conversations with their own model
   - Codex: sub-tasks (similar but different API)
   - Some platforms: parallel → sequential fallback
   - Performance hit on large pipelines

4. **Settings schema differences:**
   - Claude: JSON schema X
   - OpenCode: JSON schema Y
   - Codex: TOML
   - Adapter generates platform-specific config from common abstract spec

5. **MCP config location/format:**
   - All 4 support MCP, but file/format differ (JSON vs TOML, project-local vs global)
   - Translatable, but requires per-platform writer

---

## Recommended phased path

### Phase A — Documentation only (Tier S, ~2h)

Add a "Compatibility" section to `README.md` and `CHANGELOG.md`:

> «p-replicator v1.5.0 is designed primarily for Claude Code. Other platforms
> (Codex, OpenCode, KiloCode) are supported via Level 1 manual copy. Full
> per-platform adapters are tracked in `MULTIPLATFORM_ROADMAP.md`.»

Honest communication; sets expectations.

### Phase B — Level 1 adaptation (Tier M, ~6-8h)

Make commands platform-neutral. Add `compatibility/` directory with
per-platform manual install guides. Optional `init --target <platform>`
flag that just prints copy instructions.

### Phase C — Level 2 per-platform adapter (Tier L, ~10-20h per platform)

Implement adapter when concrete user demand for that platform appears.
Recommended order: **Codex first** (closest model, biggest user base),
then OpenCode, then KiloCode (different paradigm).

---

## Most-bang-for-buck: Codex first

If only one adapter ever gets built, **Codex** is the highest-value pick:
- Closest model to Claude Code (CLI agent + AGENTS.md + slash prompts + MCP)
- Largest non-Claude user base
- Cleanest translation (skills → AGENTS.md compilation; commands → prompts/; MCP straightforward)
- Estimated 85% feature parity post-adapter

OpenCode and KiloCode follow as demand appears.

---

## Effort matrix

| Approach | Time | Result |
|---|---|---|
| **Phase A** (documentation) | **2h** | Honest user communication |
| **Phase B** (Level 1 manual-copy) | **+6-8h** | ~70% functionality on any platform via copy |
| **Phase C — Codex adapter** | **+10-14h** | Native install on Codex with ~85% functionality |
| **Phase C — OpenCode adapter** | **+10-14h** | Native install on OpenCode |
| **Phase C — KiloCode adapter** | **+15-20h** (different paradigm, harder) | Native install on KiloCode |
| **Full Phase A+B+C for all 3 platforms** | **~50-60h** | Full multi-platform v2.0 |

---

## Reuse from product-keysarium-2026

The parent monorepo already has prior art:
- `lib/platform-adapters.md` — adapter registry concept
- `lib/platform-templates/{cursor,opencode,copilot}.md` — example templates
- `/init-platform --platform <name>` slash command in `.claude/commands/`

When implementing Phase B/C, **reuse these patterns** rather than designing
from scratch. The keysarium pattern already establishes conventions for
multi-platform support across the dz-* package family.

---

## Open decisions for future review

1. **Which platforms actually needed?** All 4 or just Claude+Codex?
2. **Depth of compatibility?** Manual-copy-friendly (Phase B) vs `init --target X` (Phase C) vs full feature parity (Level 3)?
3. **Timing:** start with Phase A docs only, or build Phase B+C immediately?
4. **Scope:** v2.0 milestone or incremental (v1.6 = Phase A+B, v1.7 = Codex adapter, etc.)?
5. **Reuse strategy:** copy keysarium-2026's adapter pattern verbatim or design lighter version?

---

## Companion files

- `KNOWN_LIMITATIONS.md` — open issues with current Claude-only implementation (7 items)
- `CHANGELOG.md` — version history
- `README.md` — user-facing docs

---

*Last updated: 2026-05-07. Re-evaluate when concrete demand for non-Claude
platform support emerges (e.g., classroom usage with mixed-tool students).*
