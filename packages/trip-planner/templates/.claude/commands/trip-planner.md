# /trip-planner — Interactive Mobile Itinerary Generator

Plan a trip and emit a self-contained mobile itinerary site.

## Usage
```
/trip-planner [city, #days, dates, arrival, departure, lodging, party, constraints]
```
Example: `/trip-planner Казань 3 дня, 10–12 июля, приезд 10:30 поезд, отъезд 21:00 самолёт, жильё ул. Баумана 1, 2 чел (с ребёнком 5 лет), без алкоголя, вегетарианцы, бюджет 4000₽/день`

## What it does
Loads `.claude/skills/trip-planner/SKILL.md` and runs:
```
explore (Intake) → goap-research-ed25519 (Research) → Itinerary → frontend-design (Site) → Validation
```
Produces `trip/<city-slug>/index.html` — a one-handed mobile timeline with expandable cards,
Yandex.Maps pin per point + per-day route link, Open-Meteo weather + clothing advice, «Купить билет»
buttons, and constraint-filtered restaurants. Includes excursions, museums, walks, viewpoints,
water cruises, and local cuisine.

## When NOT to use
- Just researching a destination → `goap-research-ed25519`. A non-itinerary web page → `frontend-design`.

## Governance
Read `.claude/rules/trip-planner-conventions.md` + `.claude/shards/trip-planner.shard.md`.
Maps/weather URL schemes + the itinerary JSON shape are in the skill's `references/`.
