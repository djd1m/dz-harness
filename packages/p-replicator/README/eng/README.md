# @dzhechkov/p-replicator — Documentation

Comprehensive docs for `@dzhechkov/p-replicator` — a toolkit for AI-assisted
product development in Claude Code (Vibe Coding).

## What it is

`p-replicator` installs a ready-made `.claude/` toolkit into any project:
**11 slash commands**, **10 skills**, **4 agents**, **6 rules**, **7 hook
scripts**, and a `settings.json` with pre-configured hooks. The flagship
`/replicate` command takes a project through a 5-phase pipeline (Discovery →
Planning → Validation → Toolkit Generation → Finalize), generating SPARC
documentation and project-specific artifacts.

## Navigation

| Section | Description |
|---|---|
| [01_quickstart.md](./01_quickstart.md) | Install, first run, verification |
| [02_user_guide.md](./02_user_guide.md) | All commands and workflows with examples |
| [03_admin_guide.md](./03_admin_guide.md) | Hooks, settings.json, statusline, insights |
| [04_api_reference.md](./04_api_reference.md) | CLI flags, manifest/roadmap/state schemas |
| [05_architecture.md](./05_architecture.md) | Architecture: pre-shipped vs generated, SSOT |
| [06_troubleshooting.md](./06_troubleshooting.md) | Common issues and resolutions |
| [07_changelog.md](./07_changelog.md) | Version history 1.3.x → 1.5.x |

## Languages

- 🇬🇧 [English documentation](./README.md) (you are here)
- 🇷🇺 [Документация на русском](../ru/README.md)

## Version

`@dzhechkov/p-replicator@1.5.0` (latest stable). See full version history
in `../../CHANGELOG.md` (authoritative source).

## Quick start

```bash
cd your-project
npx @dzhechkov/p-replicator init
claude                              # open Claude Code
/replicate "Your product description"
```

After `/replicate` completes, run `/run mvp` for autonomous feature build
from roadmap, or `/start` to bootstrap the scaffold.

## Related repositories

- npm: https://www.npmjs.com/package/@dzhechkov/p-replicator
- GitHub: https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator
- Issues: https://github.com/djd1m/dz-harness-hub/issues

## Companion documentation (in package)

- `../../CHANGELOG.md` — version history
- `../../KNOWN_LIMITATIONS.md` — open improvement items (7 entries)
- `../../MULTIPLATFORM_ROADMAP.md` — Codex/OpenCode/KiloCode support roadmap
- `../../README.md` — short user-facing intro
