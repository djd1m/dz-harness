# @dzhechkov/adapter-windsurf

The **Windsurf** platform adapter for [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub) — transforms canonical skills into per-skill Windsurf **workspace rules**.

```bash
dz init --target windsurf --select design-thinking
```

## What it emits

Windsurf (the Codeium/Cognition agent IDE) reads workspace rules from `.windsurf/rules/` — **one plain `.md` file per rule**:

```
.windsurf/rules/<skill-id>.md
```

> Unlike Cursor (which demands `.mdc`), Windsurf reads **plain Markdown** (`.md`).

Each file is YAML frontmatter with Windsurf's keys, then the skill body as Markdown:

```md
---
trigger: model_decision
description: "Human-centered product development orchestrator…"
---

# Design Thinking
…skill body…
```

| Key | Meaning |
|-----|---------|
| `trigger` | activation mode — one of `always_on \| manual \| model_decision \| glob`. We emit `model_decision` → the rule is **agent-requested** (pulled in on demand), not always-on |
| `description` | the skill's description — Windsurf uses it to decide relevance |
| `globs` | optional file-glob scope; **omitted** here → a general (unscoped) rule (emitted only if the source skill declares a `globs` string; meaningful with `trigger: glob`) |

### Why this looks like Cursor

Windsurf is essentially **Cursor with a different directory + `.md` extension + a `trigger` frontmatter key instead of `alwaysApply`**. The core renderer `renderWindsurfMd` mirrors `renderCursorMdc` — same body handling, same `globs`-only-if-declared rule, same deterministic YAML-scalar escaping (single-sourced in `@dzhechkov/core`) — differing only in the frontmatter key set.

## Intentionally transforming — excluded from byte-identical equivalence

Like cursor/copilot, this is **not** a lossless skill-tree adapter. The canonical `SKILL.md` frontmatter (~26 project-local keys such as `name`, `trust_tier`, `version`) is **replaced** by Windsurf's own frontmatter, so the emit is not byte-identical to the source. The `windsurf` target is therefore **excluded** from the cross-adapter byte-identical equivalence suite (which covers only the five lossless per-skill tree adapters). `scripts/` and other assets are not carried.

Per the `@dzhechkov/core` `Adapter` contract the transform loss surfaces as a **warning**; under `strict` the adapter **throws**. The canonical skill stays the lossless source of truth — recompiling to `claude` is still full fidelity.

## Watch item: `.devin/rules/` drift (out of scope)

Some Windsurf/Devin builds (Cognition's rebrand) also read `.devin/rules/`. This adapter emits only `.windsurf/rules/*.md`, which every current Windsurf/Devin build reads. Supporting `.devin/rules/` is out of scope for this adapter.

## Exports

- `renderWindsurfMd(skill)` (from `@dzhechkov/core`) — renders one `.md` file's content.
- `WINDSURF_RULES_ROOT` — `.windsurf/rules`.
- `ADAPTER_WINDSURF_VERSION` — `0.1.0`.
- `windsurfAdapter` — the `Adapter` implementation.
