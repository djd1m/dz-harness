# @dzhechkov/skills-reverse-engineering

Reverse Engineering Unicorn — composite skill for [Claude Code](https://claude.com/claude-code) that reverse-engineers **any company** into an actionable **launch playbook** (plus, in DEEP mode, a clickable CJM prototype).


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

A 6-module pipeline orchestrated end-to-end, with three depth modes (**QUICK / DEEP / VERIFIED**):

1. **M1 Intelligence** — company/product intel gathering
2. **M2 Product & Customers** — JTBD, segments (+ **M2.5 CJM prototype** in DEEP)
3. **M3 Market & Competition** — landscape, positioning
4. **M4 Business & Finance** — model, unit economics
5. **M5 Growth Engine** — acquisition/retention loops
6. **M6 Playbook Synthesis** — the actionable launch playbook

### What M5 produces, since 0.2.0 / 1.7.0 / 1.6.0

M5 no longer ends as analysis. Three changes, in the order they matter:

- **Growth type is two independent choices, not one.** A go-to-market MOTION (content, performance,
  sales-led, partnership, self-serve) and a growth LOOP (none, product-led, community, badge/embed,
  one- or two-sided incentivised referral, network effect). The old single list forced one pick
  across both questions, which made the ordinary case — a sales-led company running a referral loop
  — unsayable. Choosing `no loop` is a real answer and skips the loop-only output rather than
  demanding an invented flywheel.
- **A `Growth Requirements Seed` table** turns the analysis into `FR-GROWTH-nnn` DRAFT obligations,
  each naming the block it came from and carrying that block's confidence verbatim. A seed is a
  draft: it does not establish that anything was built.
- **A compliance checklist** runs before any technique becomes a requirement. It cites the norm and
  where to look it up, and deliberately carries no amount, threshold or statute — those are
  jurisdiction-specific and go stale within a year. A `no` answer is recorded against the
  requirement and blocks its promotion. It asks the questions; it is not a legal opinion.

Triggers on `"проанализируй компанию"`, `"reverse engineer"`, `"разбери бизнес-модель"`, `"playbook запуска"`.

## Why

A standalone, canonical home for the orchestrator that several toolkits (keysarium, p-replicator) used to **vendor as drifting copies**. Centralizing it per [ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md) gives one source of truth; consumers reference it by id instead of carrying divergent forks.

## How to Use

```bash
npx @dzhechkov/skills-reverse-engineering init
```

Then in Claude Code: `/reverse-engineering-unicorn Notion` or `"разбери бизнес-модель Revolut"`.

## What's Bundled

| Component | Description |
|-----------|-------------|
| `reverse-engineering-unicorn` | Orchestrator skill (6 modules, QUICK/DEEP/VERIFIED) |
| `explore` | Pre-flight clarification *(tracked vendor)* |
| `goap-research-ed25519` | Adaptive research M1–M5 *(tracked vendor)* |
| `problem-solver-enhanced` | Game Theory / TRIZ M3–M5 *(tracked vendor)* |
| `/reverse-engineering-unicorn` | Slash command |

The **core pipeline is self-contained**. A few **DEEP / Post-M6** modes reference extra skills that are **not bundled** (install separately if you need them):

| Optional dep | Used in | Get it from |
|--------------|---------|-------------|
| `frontend-design` | M2.5 CJM prototype (DEEP) | `@dzhechkov/keysarium` / p-replicator |
| `brutal-honesty-review` | M6 BS-gate (DEEP) | [`@dzhechkov/skills-qe`](https://www.npmjs.com/package/@dzhechkov/skills-qe) |
| `presentation-storyteller` | Post-M6 pitch deck | `@dzhechkov/keysarium` |
| `idea2prd-manual` | Post-M6 PRD | [`@dzhechkov/skills-idea2prd`](https://www.npmjs.com/package/@dzhechkov/skills-idea2prd) |
| `md2pptx` | Post-M6 `.md`→`.pptx` | external |

## Canonicalization (ADR-0001)

`reverse-engineering-unicorn` is the canonical artifact of this pack. It previously existed as **two drifting copies** (keysarium ≠ p-replicator); resolved here by taking the **p-replicator body** (which correctly references `goap-research-ed25519`, not the non-existent bare `goap-research`) plus **keysarium's `trust_tier` frontmatter**, and rewriting `/mnt/skills/{user,public}/<id>` → `.claude/skills/<id>`. The `explore`/`goap`/`problem-solver` trio is a **sources.json-tracked** vendored copy (canonical: `@dzhechkov/skills-analyst-manual`). Re-sync drift with `dz sync-upstream`.

## CLI Commands

`init` *(default)* · `update` · `remove` · `list` · `doctor` — options `--force`, `--dry-run`, `--help`, `--version`.

## Also Available Via dz

```bash
dz init --select reverse-engineering-unicorn
dz info reverse-engineering-unicorn
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
