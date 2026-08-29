# @dzhechkov/skills-news

**2 dz-original skills for news & monitoring** — turn any topic + period into a professional,
source-cited report, and watch for what's new in between.

| Skill | What it's for | How to trigger |
|-------|---------------|----------------|
| `news-digest` | Build a full, source-cited **news digest** on any topic for a period — multi-stream research → credibility-tiered sources → coverage audit → synthesis into Markdown (optionally `.docx`) with inline citations + a categorized source index. Topic-agnostic via swappable **profiles**. | "сделай AI-дайджест за февраль" / "what's new in X over the last month" / `/news-digest` |
| `news-monitor` | Lightweight **delta watch** — "what's genuinely new since I last looked?" Diffs against a saved watermark, dedups, cites every item. Cheaper than a full digest; run it frequently between digests. | "what's new in X since last week" / "monitor X for releases" / `/news-monitor` |

Both read the same **profiles** (`news-digest/references/profiles/`): a ready `genai-world` profile for AI
news, plus a `_template.md` to define any topic. Company/competitive context stays in a **local,
unpublished** profile (mirrors the `external-comms-gate` rule) — no proprietary content ships here.

> **Attribution.** The multi-stream methodology (modes, changelog/broad sweeps, source-credibility tiers,
> coverage audit, adaptive synthesis) is **inspired by Cloud.ru's GenAI GTM news-digest skills** and
> rewritten clean-room as a generalized, topic-agnostic set.


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
# Via dz CLI (recommended)
dz init --target claude-code --select news-digest,news-monitor

# Or install the package directly
npm install @dzhechkov/skills-news
```

## How to use

Skills **auto-activate** when your task matches their trigger phrases (in each `SKILL.md`):

- "Сделай AI-дайджест за февраль" / "what's new in X over the last month" → `news-digest`
- "what's new in GenAI since last week" / "monitor the K8s ecosystem for releases" → `news-monitor`

Typical loop: **`news-monitor`** frequently (cheap "what changed?") → **`news-digest`** periodically (the
full cited report). To see a skill's exact triggers and assets: `dz info <skill-id>`.

## Signature scope (this release)

The pack's `.dz-manifest.json` now covers exactly the files this package SHIPS, as reported by
`npm pack` — not everything present in the author's working tree. Previously it signed files that
`files[]` excludes (typically `CHANGELOG.md`), so every recipient's verifier reported
`listed in the manifest but absent` and the pack read as TAMPERED. Re-signing at any earlier moment
could not fix that: those files were never in the tarball.

Nothing about the shipped content changed in this release — only what the signature describes.
