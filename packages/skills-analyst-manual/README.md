# @dzhechkov/skills-analyst-manual

Composite analyst skill for [Claude Code](https://claude.com/claude-code) — 3-phase manual pipeline with checkpoints for strategic product analysis.


> **`goap-research-ed25519` — self-learning (optional, since this release).** When
> [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) is on PATH, the
> bundled research skill recalls prior METHOD lessons at the start of an investigation and records new
> ones at four named moments. Without it the skill behaves exactly as before and says so once — it is
> detected, never required. Lessons go to a SEPARATE store (`<project>/.health-brain/.dz`) and never
> to the shared one; recall reads both, so engineering lessons transfer in and medical ones do not
> leave. A format check refuses identifier shapes (email, phone, record numbers) — it does NOT judge
> whether a lesson describes a method or a person, and says so: that judgement is the agent's, per
> the teach protocol. See `skills/goap-research-ed25519/SKILL.md`.

## What It Does

Orchestrates three phases with user confirmation between each:

1. **Explore** — Task clarification, brief generation
2. **Verified Research** — GOAP planning + Ed25519 cryptographic verification
3. **Solve** — 9-module problem solving (TRIZ, Game Theory, OODA, SCQA)

Each phase produces a document. User confirms before proceeding to the next.

## Quick Start

```bash
npx @dzhechkov/skills-analyst-manual init
```

Then in Claude Code:

```
/analyst-manual AI platform pricing strategy for enterprise market
```

## Self-Contained Package

This package bundles everything needed — no additional dependencies required:

| Component | Description |
|-----------|-------------|
| `analyst-manual-full` | Orchestrator skill (3-phase pipeline with checkpoints) |
| `explore` | Task clarification and brief generation |
| `goap-research-ed25519` | GOAP research with Ed25519 verification |
| `problem-solver-enhanced` | 9-module solver (TRIZ + Game Theory) |
| `/analyst-manual` | Slash command |

## CLI Commands

```bash
npx @dzhechkov/skills-analyst-manual init      # Install into project
npx @dzhechkov/skills-analyst-manual update    # Update to latest
npx @dzhechkov/skills-analyst-manual list      # Show installed components
npx @dzhechkov/skills-analyst-manual doctor    # Health check
npx @dzhechkov/skills-analyst-manual remove    # Uninstall
```

## Verification Modes

Choose at Checkpoint 1:

| Mode | Threshold | Command |
|------|-----------|---------|
| Moderate | 0.85 | "ok" |
| Strict | 0.95 | "strict mode" |
| Paranoid | 0.99 | "paranoid mode" |

## Output Documents

| # | Document | Description |
|---|----------|-------------|
| 1 | `01_task_brief.md` | Clarified objectives, constraints, success criteria |
| 2 | `02_research_findings.md` | Verified findings with Ed25519 citation chain |
| 3 | `03_solution.md` | Strategy with TRIZ contradictions resolved |
| 4 | `04_final_summary.md` | Executive summary + next steps |

## Use Cases

- Product pricing and positioning strategy
- Competitive analysis with verified data
- GTM (Go-to-Market) strategy development
- Strategic product decisions requiring evidence-based analysis

## Integration

Works alongside other `@dzhechkov` packages. If `@dzhechkov/keysarium` is already installed, the dependent skills are shared — no duplication.

## License

MIT
