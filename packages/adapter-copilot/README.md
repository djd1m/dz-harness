# @dzhechkov/adapter-copilot

The **GitHub Copilot** platform adapter for [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub) — compiles a canonical skill into a GitHub Copilot **instruction file**.

```bash
dz init --target copilot --select design-thinking
```

## What it emits

GitHub Copilot does **not** scan a `.../skills/` directory like Claude Code. It auto-reads repo instructions from `.github/instructions/*.instructions.md` (each with an `applyTo` glob). So a skill maps onto an instruction file:

```
.github/instructions/<id>.instructions.md   # always-on (applyTo: "**") + the skill body
.github/copilot-skills/<id>/…                # the skill's assets (scripts/, references/) — reference-only
```

## Intentionally lossy

This is the harness's **first lossy adapter** (the five skill-tree adapters — claude/codex/opencode/hermes/openclaude — are lossless). Copilot loses:

- **progressive disclosure** — the instruction is always-on, not lazily loaded;
- **script execution** — `scripts/` become reference-only (Copilot can't run them);
- **skill invocation** — Copilot has no per-skill activation command.

Per the `@dzhechkov/core` `Adapter` contract, the loss is surfaced as a **warning**; under `strict` the adapter **throws** instead. The canonical skill stays the lossless source of truth — recompiling to `claude` is still full fidelity.

> **Lint, not sandbox / runtime:** the emitted instruction conveys the skill's *methodology*; it does not reproduce its tooling.

See `docs/research/metaharness-analysis.md` §8 and `features/copilot-target/` for the design.
