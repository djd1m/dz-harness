---
name: trip-planner
description: >
  Travel-itinerary orchestrator that turns a city + dates + arrival/departure + lodging +
  constraints into a self-contained, one-handed MOBILE HTML itinerary site. Chains
  explore (intake) → goap-research-ed25519 (verified, constraint-filtered POIs/restaurants) →
  itinerary planning (day timeline + route optimization) → frontend-design (mobile site) →
  validation. The generated site has a per-day timeline with expandable cards, a Yandex.Maps
  link per point + a one-tap per-day route, verified contacts and review links for every named
  venue, "Купить билет" buttons where pre-booking is needed, an Open-Meteo weather widget with
  clothing advice, and restaurants filtered by the traveller's
  constraints (no-alcohol / vegetarian / with-kids / daily budget). Use when planning a trip and
  you want an interactive mobile itinerary, not a flat list. Triggers on: "составь программу
  пребывания", "trip itinerary", "план поездки", "trip plan", "travel itinerary site",
  "программа на N дней в городе", "/trip-planner".
metadata:
  trust_tier: "1"
  trust_tier_label: "Structured"
  trust_tier_path: "Run /bto-test to promote to Tier 2"
  tags: "travel, itinerary, trip-planner, yandex-maps, open-meteo, mobile, site-generator"
---

# trip-planner — Interactive Mobile Itinerary Generator

> Implements the "trip-advisor" task: from trip logistics + constraints, produce a **single
> self-contained mobile HTML site** (no build, opens on any phone, works offline) — a day-by-day
> timeline with expandable cards, Yandex.Maps links, an Open-Meteo weather widget, verified
> contacts + review evidence for named venues, and constraint-aware restaurant picks.

## When to Use

- You have a concrete trip (city + dates + arrival/departure + lodging + party + constraints) and
  want an **interactive mobile itinerary**, viewable one-handed, not a flat text list.
- Triggers: "составь программу пребывания на N дней в <город>", "trip itinerary site", "план поездки".

## When NOT to Use

- Pure destination research with no dates/logistics → use `goap-research-ed25519` directly.
- A generic informational web page (not an itinerary) → use `frontend-design`.
- A learning/course site → use `edu-site-generator`; a transcript site → `transcript-site-generator`.

## Required Inputs (collected in Intake — ask for any that are missing)

| Field | Example |
|-------|---------|
| Город + кол-во дней | "Казань, 3 дня" |
| Даты | 2026-07-10 — 2026-07-12 |
| Прибытие | "10:30, поезд, из Москвы" |
| Отъезд | "21:00, самолёт" |
| Жильё (адрес) | "ул. Баумана, 1" — needed for day start/end + route anchoring |
| Кол-во человек | 2 |
| Ограничения | не пьём алкоголь / вегетарианцы / с ребёнком 5 лет / бюджет ≤ 4000 ₽/день |

Constraints are **hard filters**, not suggestions (see `references/data-schema.md` + module 01).

## Pipeline

```
/trip-planner  →  explore (Intake)  →  goap-research-ed25519 (Research)  →  Itinerary  →  frontend-design (Site)  →  Validation
```

| Step | Module | Skill | Output |
|------|--------|-------|--------|
| 0 Intake | `modules/00-intake.md` | explore | Trip Brief (all required inputs above, constraints explicit) |
| 1 Research | `modules/01-research.md` | goap-research-ed25519 | Verified POIs + restaurants WITH coordinates, opening hours, contacts, review evidence, ticket-booking flags — filtered by constraints |
| 2 Itinerary | `modules/02-itinerary.md` | — | Day-by-day timeline (arrival/departure-aware), categories covered, route order per day |
| 3 Site | `modules/03-site-generation.md` | frontend-design | Self-contained `index.html` from `references/site-template.html` filled with the itinerary JSON |
| 4 Validation | `modules/04-validation.md` | — | Every point has coords+maps link; every named venue has contacts+reviews; per-day route and weather work; constraints and booking rules are honored |

## Must Include (coverage requirement)

Across the trip, include a mix of: **экскурсии, музеи, прогулки, смотровые площадки, речные/водные
прогулки, местная кухня.** Don't produce an all-museum or all-restaurant plan.

## Generated Site — required features

1. **Mobile-first, one-handed:** single-column, large tap targets, sticky day nav, no horizontal scroll.
2. **Per-day timeline with expandable cards** — tap a card to expand details (description, time, cost, tips).
3. **Per point:** a Yandex.Maps link to exact coordinates (`pt=lon,lat`); cost; pre-booking note.
4. **Per named venue:** verified address, official website or phone, plus a separate review source
   link and the date it was checked. Rating/count are optional and must never be inferred.
5. **Per day:** one **route link** opening all that day's stops in Yandex.Maps (`rtext=lat,lon~...`).
6. **"Купить билет"** button on any point that requires advance booking (museum tickets, river cruise, etc.).
7. **Open-Meteo weather widget** per day (temp/precip) + **clothing advice** derived in-page.
8. **Restaurants/cafés** filtered by the constraints (no-alcohol venues, veg options, kid-friendly, budget).

See `references/{yandex-maps.md, open-meteo.md, data-schema.md, site-template.html}` for the exact
URL schemes, weather/clothing logic, the itinerary JSON shape, and the HTML scaffold.

## Execution Protocol

1. Read `.claude/shards/trip-planner.shard.md` + `.claude/rules/trip-planner-conventions.md`.
2. Run module 00 (Intake via `explore`) — pause for any missing required input.
3. Run module 01 (Research via `goap-research-ed25519`) — constraints as hard filters; **every point
   must carry real coordinates** (or be flagged "coords needed", never fabricated). Every named
   venue must carry verified contacts and review evidence or be replaced before planning.
4. Run module 02 (Itinerary) — order stops to minimize backtracking; respect arrival/departure times.
5. Run module 03 (Site) — fill `site-template.html` with the itinerary JSON; output to `trip/<slug>/index.html`.
6. Run module 04 (Validation) — fail the checklist if any required feature is missing.

## Examples

**Input** (`/trip-planner ...`): `Казань 3 дня, 10–12 июля, приезд 10:30 поезд из Москвы, отъезд 21:00
самолёт, жильё ул. Баумана 1, 2 чел (ребёнок 5 лет), без алкоголя, вегетарианцы, бюджет 4000₽/день`.

**Output:** `trip/kazan/index.html` — 3-day mobile timeline; each point a Yandex pin
(`pt=lon,lat`); per-day pedestrian route (`rtext=lat,lon~...&rtt=pd`); Open-Meteo widget + clothing
advice; kid-friendly vegetarian cafés within budget; «Купить билет» on the river cruise + the
timed-ticket museum; category mix (Кремль → музей → Кремлёвская набережная → смотровая → речная
прогулка → татарская кухня).

See `examples/sample-trip-brief.md` (input) and `references/data-schema.md` (the output JSON shape),
plus `evals/basic.md` for the eval scenarios (constraints, missing-coords, booking, offline weather).

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Fabricated coordinates / addresses | Use verified coords from research; flag "coords needed" — never invent |
| Named venue without contacts or reviews | Verify address + official contact + independent review link, or replace the venue |
| Copied rating with no date/source | Omit the number; never infer it. If used, store source URL + checked date |
| Ignoring a constraint (alcohol/veg/budget/kids) | Constraints are hard filters; re-pick venues |
| Flat list instead of interactive site | Emit the mobile timeline HTML (the whole point) |
| Multi-build React app | Single self-contained HTML — portable + offline |
| All-museum or all-food plan | Cover the required category mix |
| Day ignores arrival/departure time | First/last day must fit the real arrival/departure windows |
| Maps link with lon/lat swapped | `pt`=lon,lat ; `rtext`=lat,lon (see references/yandex-maps.md) |

## Self-check (before declaring done)

- [ ] Every point: coords + Yandex.Maps pin link + cost + booking note.
- [ ] Every `venue: true` point: address + website/phone + review source/link + checked date.
- [ ] Every day: a working multi-stop Yandex route link + Open-Meteo widget + clothing advice.
- [ ] Constraints honored in every venue pick.
- [ ] Category mix present (excursions/museums/walks/viewpoints/water/cuisine).
- [ ] Opens correctly one-handed on a phone; no horizontal scroll; cards expand/collapse.
- [ ] Arrival/departure days fit the real transport windows.
