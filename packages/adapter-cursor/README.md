# @dzhechkov/adapter-cursor

The **Cursor** platform adapter for [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub) — transforms canonical skills into per-skill Cursor **project rules**.

```bash
dz init --target cursor --select design-thinking
```

## What it emits

Cursor ([cursor.com/docs/context/rules](https://cursor.com/docs/context/rules)) reads project rules from `.cursor/rules/` — **one `.mdc` file per rule**:

```
.cursor/rules/<skill-id>.mdc
```

> The extension MUST be `.mdc`. A plain `.md` file in `.cursor/rules/` is **ignored** by Cursor.

Each file is YAML frontmatter with Cursor's three keys, then the skill body as Markdown:

```mdc
---
description: "Human-centered product development orchestrator…"
alwaysApply: false
---

# Design Thinking
…skill body…
```

| Key | Meaning |
|-----|---------|
| `description` | the skill's description — Cursor uses it to decide relevance |
| `globs` | optional file-glob scope; **omitted** here → a general (unscoped) rule (emitted only if the source skill declares a `globs` string) |
| `alwaysApply` | `false` → the rule is **agent-requested** (pulled in on demand), not always-on |

## Intentionally transforming — excluded from byte-identical equivalence

Like copilot, this is **not** a lossless skill-tree adapter. The canonical `SKILL.md` frontmatter (~26 project-local keys such as `name`, `trust_tier`, `version`) is **replaced** by Cursor's own 3-key frontmatter, so the emit is not byte-identical to the source. The `cursor` target is therefore **excluded** from the cross-adapter byte-identical equivalence suite (which covers only the five lossless per-skill tree adapters). `scripts/` and other assets are not carried.

Per the `@dzhechkov/core` `Adapter` contract the transform loss surfaces as a **warning**; under `strict` the adapter **throws**. The canonical skill stays the lossless source of truth — recompiling to `claude` is still full fidelity.

## Exports

- `renderCursorMdc(skill)` (from `@dzhechkov/core`) — renders one `.mdc` file's content.
- `CURSOR_RULES_ROOT` — `.cursor/rules`.
- `ADAPTER_CURSOR_VERSION` — `0.1.0`.
- `cursorAdapter` — the `Adapter` implementation.
