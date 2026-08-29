# @dzhechkov/skills-idea2prd

Idea2PRD Manual — composite skill for [Claude Code](https://claude.com/claude-code) that takes a **problem or an idea** all the way to **Vibe-Coding-ready documentation**, with a user checkpoint between every phase.


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

Auto-detects the input (problem vs idea) and runs up to two pipelines with **9 checkpoints**:

1. **Analyst pipeline** (only if the input is a *problem*) — `explore` → `goap-research-ed25519` → `problem-solver-enhanced` (all 9 modules), producing a validated Product Idea.
2. **PRD pipeline** (always) — Requirements → ADR → DDD → C4 → **Pseudocode** → Test Scenarios (Gherkin) → **Completion Checklist**.

Output: a complete doc set ready to hand to a coding agent — PRD, ADRs, DDD model, C4 diagrams, pseudocode, test scenarios, and a CI/CD/deploy completion checklist.

## Honesty + Memory Layer (v3)

Three disciplines the harness proved out after the initial freeze are now baked into the emitted docs:

- **ADR `## Confirmation` stanza** — every generated ADR names its *load-bearing property* and the
  fitness function / Gherkin test that would falsify it, wiring Phase 3 (ADR) to Phase 5 (fitness/tests).
  The stanza is REQUIRED (MEASURED — reproducer: the `## Confirmation` block in
  `templates/.claude/skills/idea2prd-manual/references/adr-catalog.md`).
- **Claim Discipline** — accuracy/count/percentage claims in emitted docs carry an honest tag
  (`MEASURED` / `CLAIMED` / `ESTIMATED`); no unsourced numbers. A `dz claim-check docs/` scan should pass.
- **Brain memory** — a Step-0 `dz recall` folds prior PRD/ADR lessons into the brief and a closing
  `dz teach` records new ones, both pinned to ONE canonical brain store (the project root, `--project`),
  so the skill stops being write-once (MEASURED — reproducer: the "Step 0: Brain Recall" and
  "Closing: Brain Teach" sections in `templates/.claude/skills/idea2prd-manual/SKILL.md`). Guarded by
  "if `dz` present" — absent the CLI, the pipeline runs unchanged.

## Why

Going from a raw idea straight to code skips the design that makes the code correct. Idea2PRD front-loads that design as *reviewable artifacts* and forces a human gate at each phase (MANUAL mode), so you catch a wrong assumption at the PRD stage instead of after implementation.

## How to Use

```bash
npx @dzhechkov/skills-idea2prd init
```

Then in Claude Code the skill auto-activates on phrases like:

```
/idea2prd-manual оформи PRD для сервиса подбора подрядчиков
"сделай PRD пошагово для ..."
"idea to prd manual: ..."
```

It will pause at each checkpoint and wait for your confirmation before the next phase.

## Self-Contained Package

Bundles everything needed — no other `@dzhechkov` package required:

| Component | Description |
|-----------|-------------|
| `idea2prd-manual` | Orchestrator skill (problem/idea → PRD docs, 9 checkpoints) |
| `explore` | Task clarification and brief generation *(tracked vendor)* |
| `goap-research-ed25519` | GOAP research with Ed25519 verification *(tracked vendor)* |
| `problem-solver-enhanced` | 9-module solver (TRIZ + Game Theory) *(tracked vendor)* |
| `/idea2prd-manual` | Slash command |

Bundled scripts (local, no network): `c4_generator.py`, `fitness_validator.py`, `pseudocode_generator.py`, `ai_context_builder.py`.

> **Canonicalization (ADR-0001):** `idea2prd-manual` is the canonical artifact of this pack. The `explore`/`goap`/`problem-solver` trio is a **tracked vendored copy** whose canonical home is [`@dzhechkov/skills-analyst-manual`](https://www.npmjs.com/package/@dzhechkov/skills-analyst-manual); see `sources.json`. Re-sync drift with `dz sync-upstream`.

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Install the skill pack into the current project *(default)* |
| `update` | Update to the latest version |
| `remove` | Remove the skill pack |
| `list` | List installed components |
| `doctor` | Check installation health |

Options: `--force`, `--dry-run`, `--help`, `--version`.

## Also Available Via dz

```bash
dz init --select idea2prd-manual          # via the unified harness CLI
dz info idea2prd-manual
```

## License

MIT

## Signature scope (this release)

The pack's `.dz-manifest.json` now covers exactly the files this package SHIPS, as reported by
`npm pack` — not everything present in the author's working tree. Previously it signed files that
`files[]` excludes (typically `CHANGELOG.md`), so every recipient's verifier reported
`listed in the manifest but absent` and the pack read as TAMPERED. Re-signing at any earlier moment
could not fix that: those files were never in the tarball.

Nothing about the shipped content changed in this release — only what the signature describes.
