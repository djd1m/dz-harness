# @dzhechkov/design-thinking

> Human-centered product design toolkit for Claude Code — Stanford **d.school 5-phase
> Design Thinking** + a 6th **Validate** phase, **25** academically-grounded methodologies,
> as an installable npx toolkit.

![npm](https://img.shields.io/badge/npm-published-red)
![skills](https://img.shields.io/badge/bundled%20skills-8-brightgreen)
![phases](https://img.shields.io/badge/phases-6-blue)


> **`goap-research-ed25519` — self-learning (optional, since this release).** When
> [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) is on PATH, the
> bundled research skill recalls prior METHOD lessons at the start of an investigation and records new
> ones at four named moments. Without it the skill behaves exactly as before and says so once — it is
> detected, never required. Lessons go to a SEPARATE store (`<project>/.health-brain/.dz`) and never
> to the shared one; recall reads both, so engineering lessons transfer in and medical ones do not
> leave. A format check refuses identifier shapes (email, phone, record numbers) — it does NOT judge
> whether a lesson describes a method or a person, and says so: that judgement is the agent's, per
> the teach protocol. See `skills/goap-research-ed25519/SKILL.md`.

## Install

```bash
# Install into the current project (Claude Code)
npx @dzhechkov/design-thinking init

# Preview without writing
npx @dzhechkov/design-thinking init --dry-run

# Overwrite an existing install
npx @dzhechkov/design-thinking init --force
```

Then in Claude Code:

```
/design-thinking [your product or user problem]
```

…or just describe a user-facing problem — the skill auto-activates.

## What you get

A full toolkit assembled around the **BTO-benchmarked** `design-thinking` orchestrator
(benchmark history lives in the monorepo). `init` installs into `.claude/`:

| Component | What |
|-----------|------|
| **8 skills** | `design-thinking` + its dependencies (below) |
| **1 command** | `/design-thinking` |
| **1 rule** | `design-thinking-conventions.md` (output dirs, phase gates, anti-patterns) |
| **1 shard** | `design-thinking.shard.md` (the skill's DT-xxx gates with tier scopes, checkpoint banner) |

### Bundled skills

| Skill | Phase | Role |
|-------|-------|------|
| `design-thinking` | orchestrator | The 6-phase pipeline + 25 methodologies |
| `explore` | entry (required) | Socratic Task Brief before Empathize |
| `goap-research-ed25519` | Empathize (required) | Verified, Ed25519-signed user/market research |
| `problem-solver-enhanced` | Define | 5 Whys + TRIZ when root cause is deep |
| `six-thinking-hats` | Ideate | Team divergence across 6 perspectives (testing-focused variant; auto-activation is testing-scoped — invoke explicitly during ideation) |
| `frontend-design` | Prototype | Working HTML/React prototype from wireframes |
| `structured-reasoning` | any | Picks the reasoning strategy (ToT / CoT / …) |
| `reflection-loop` | any | Critique → revise cycle on each artifact |

> The skills are copied **verbatim** from the canonical `@dzhechkov/skills-meta` /
> `@dzhechkov/keysarium` / `@dzhechkov/skills-qe` packs, not rewritten (the
> `design-thinking` orchestrator itself is the BTO-benchmarked piece).

## The pipeline

```
explore (Task Brief)
   ↓
1. Empathize  → goap-research-ed25519        (verified research, not vibes)
2. Define     → JTBD · CJM · VSM + HMW       (+ problem-solver-enhanced if needed)
3. Ideate     → HADI hypotheses from HMW     (+ six-thinking-hats for teams)
4. Prototype  → frontend-design              (if digital UI; min 2 iterations)
5. Test       → usability (≥5 users) + HADI hypothesis validation
6. Validate   → pilot validation             (L/XL tiers — DT-011)
```

The skill's complexity router decides which phases run (S = 1→2→5, M = 1→2→3→4→5,
L/XL = all six). Each phase pauses at the skill's checkpoint banner (`STEP N … Complete`
+ tier + summary); you steer with `ок` / `углуби <area>` / freeform feedback.

## When to use it

- Designing a **new product / service / feature** where the real user need is unclear.
- "product discovery", "understand users", "build a CJM/JTBD", "prototype and test".

**Not** for: well-defined technical tasks or bugs (use `problem-solver-enhanced` /
`debug-loop`), or pure research with no product intent (use `goap-research-ed25519`).

## Commands

| Command | Purpose |
|---------|---------|
| `init` | Install the toolkit into `.claude/` (default) |
| `list` | List the bundled skills |
| `doctor` | Verify the install in this project |
| `--help` / `--version` | — |

## Install modes — where this fits

The DZ Harness Hub offers three ways to get Design Thinking:

| | Install | Gets you |
|---|---------|----------|
| **Single skill** | `dz init --select design-thinking` | Just the orchestrator (auto-activates) |
| **Preset** | `dz setup --preset meta` | DT + the rest of the development-process skills |
| **npx toolkit** | `npx @dzhechkov/design-thinking init` | **This package** — DT + all deps + command + rule + shard |

Use the npx toolkit when you want Design Thinking as a **self-contained, governed
capability** of a project (slash command + conventions + gates), with every dependency
bundled so the chain works offline.

---

Part of the DZ Harness Hub monorepo — [this package on npm](https://www.npmjs.com/package/@dzhechkov/design-thinking). MIT.
