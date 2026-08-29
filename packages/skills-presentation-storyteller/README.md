# @dzhechkov/skills-presentation-storyteller

Presentation Storyteller — composite skill for [Claude Code](https://claude.com/claude-code) that builds a **selling presentation with verified sources** plus a slide-by-slide **storytelling speaker script**.


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

From a topic / product / pitch, it produces three artifacts:

1. `presentation-outline.md` — outline with the key thesis per point
2. `presentation-full.md` — the full deck in Markdown with inline source links
3. `sources-index.md` — index of verified sources

…and a **"how to tell it"** speaker script for every slide, using storytelling frameworks (AIDA, Hero's Journey, Problem-Solution). Sources are gathered through verified research, so claims trace back to a citation.

Triggers on `"сделай презентацию"`, `"presentation with storytelling"`, `"sales deck"`, `"pitch deck"`, `"продающая презентация"`.

## Why

A standalone, canonical home (per [ADR-0001](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0001-skill-canonicalization-and-dependency-model.md)) so other skills — e.g. `reverse-engineering-unicorn`'s Post-M6 pitch-deck step — can **reference it by id** instead of vendoring a copy.

## How to Use

```bash
npx @dzhechkov/skills-presentation-storyteller init
```

Then in Claude Code: `/presentation-storyteller pitch for an AI onboarding assistant`.

## What's Bundled

| Component | Description |
|-----------|-------------|
| `presentation-storyteller` | Orchestrator skill (outline + full deck + speaker script) |
| `explore` | Task clarification *(tracked vendor)* |
| `goap-research-ed25519` | Verified-source research *(tracked vendor)* |
| `/presentation-storyteller` | Slash command |

> **Canonicalization (ADR-0001):** `presentation-storyteller` is the canonical artifact of this pack. It had a single copy in the repo (keysarium), so there was no drift to resolve. The `explore`/`goap` pair is a **sources.json-tracked** vendored copy (canonical: [`@dzhechkov/skills-analyst-manual`](https://www.npmjs.com/package/@dzhechkov/skills-analyst-manual)). Re-sync drift with `dz sync-upstream`.

## CLI Commands

`init` *(default)* · `update` · `remove` · `list` · `doctor` — options `--force`, `--dry-run`, `--help`, `--version`.

## Also Available Via dz

```bash
dz init --select presentation-storyteller
dz info presentation-storyteller
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
