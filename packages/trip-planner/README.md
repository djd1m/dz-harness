# @dzhechkov/trip-planner

> Travel-itinerary → **interactive mobile site** generator for Claude Code. Give it a city, dates,
> arrival/departure, lodging, party size and constraints — get a self-contained, one-handed mobile
> HTML itinerary with maps, weather, verified venue contacts + review evidence, and a day-by-day
> timeline. Implements the "trip-advisor" task.

![npm](https://img.shields.io/npm/v/%40dzhechkov%2Ftrip-planner)
![skills](https://img.shields.io/badge/bundled%20skills-4-brightgreen)
![output](https://img.shields.io/badge/output-single%20HTML-blue)


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
npx @dzhechkov/trip-planner init      # into the current project (Claude Code)
npx @dzhechkov/trip-planner init --dry-run   # preview
```

For Hermes and other supported assistants, install the same canonical skill through `dz`:

```bash
npm install -g @dzhechkov/harness-cli
dz install @dzhechkov/trip-planner --target hermes
```

Restart Hermes, then describe the trip in natural language. The skill is projected into
`.hermes/skills/trip-planner/`; the canonical source remains the same `SKILL.md` used by Codex and
Claude Code.

Then in Claude Code:

```
/trip-planner Казань 3 дня, 10–12 июля, приезд 10:30 поезд, отъезд 21:00 самолёт,
   жильё ул. Баумана 1, 2 чел (с ребёнком 5 лет), без алкоголя, вегетарианцы, бюджет 4000₽/день
```

## What it produces

A single self-contained `trip/<city>/index.html` (inline CSS+JS, **no build, opens on any phone,
works offline**) with:

- 📱 **Mobile-first, one-handed** layout — sticky day nav, single column, big tap targets
- 🗂️ **Per-day timeline with expandable cards** — tap to open details (time, cost, tips)
- 📍 **Yandex.Maps pin per point** (exact coords) + 🗺️ **one-tap per-day route** link
- ☎️ **Verified contacts + review evidence** for every named venue, including checked date
- 🎟️ **«Купить билет»** buttons where advance booking is needed
- 🌤️ **Open-Meteo weather widget** per day + **clothing advice** (derived in-page, no API key)
- 🍽️ **Restaurants/cafés filtered by your constraints** (no-alcohol / vegetarian / kids / budget)
- Coverage mix: excursions, museums, walks, viewpoints, water cruises, local cuisine

## Pipeline

```
/trip-planner → explore (Intake) → goap-research-ed25519 (Research) → Itinerary → frontend-design (Site) → Validation
```

The Research step uses **verified** sources (Ed25519-signed) and treats your constraints as **hard
filters**. Coordinates are never fabricated. A named venue is blocked from publication until it has
an address, an official website or phone, and a separate review link with a checked date. Volatile
rating/count values are optional and never inferred.

## Bundled skills (4)

| Skill | Role |
|-------|------|
| `trip-planner` | The orchestrator (this package) — 5-phase pipeline + the mobile site template |
| `explore` | Intake — collects the trip brief |
| `goap-research-ed25519` | Verified, constraint-filtered POI/restaurant research |
| `frontend-design` | Mobile site polish |

## Commands

| Command | Purpose |
|---------|---------|
| `init` | Install the toolkit into `.claude/` (default) |
| `init --dry-run` | Preview what would be installed — read-only, always works (even on an already-installed project) |
| `list` | List bundled skills |
| `doctor` | Verify the install |

## Tech notes

- **Maps:** Yandex.Maps URL schemes — pin `pt=lon,lat`, route `rtext=lat,lon~...&rtt=pd|auto|mt`. No API key.
- **Weather:** Open-Meteo daily forecast, client-side, no key, CORS-open; graceful offline fallback.
- The generated HTML's only runtime network call is the weather fetch.

---

Part of [DZ Harness Hub](https://github.com/djd1m/dz-harness-hub). MIT.
