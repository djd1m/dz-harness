# trip-planner — Conventions

## Output
- Generated site goes to `trip/<city-slug>/index.html` (kebab-case Latin slug). Never the project root.
- One self-contained HTML file (inline CSS+JS). No build step, no external runtime deps except the
  client-side Open-Meteo fetch (which degrades gracefully offline).

## Data integrity (hard rules)
- **Never fabricate coordinates, addresses, prices, or opening hours.** Use verified research; if a
  coordinate is unknown set it null and flag "координаты уточняются".
- Every named establishment or attraction (`venue: true`) requires a verified address, official
  website or phone, and a separate review URL with checked date. Omit unverified ratings/counts;
  if mandatory evidence is missing, replace the venue or fail validation.
- **Constraints are hard filters**, not hints: no-alcohol / vegetarian / with-kids / per-day budget /
  mobility must be honored in every venue pick. Re-pick if a candidate violates a constraint.
- Logistics: day 1 begins after the real arrival time; the last day ends before departure (+ transfer buffer).

## Coverage
Across the trip include a mix of: экскурсии, музеи, прогулки, смотровые площадки, речные/водные
прогулки, местная кухня. Avoid an all-museum or all-food plan.

## Maps & weather
- Yandex pin: `pt=lon,lat`. Yandex route: `rtext=lat,lon~...&rtt=pd|auto|mt`. (Orders differ — see references/yandex-maps.md.)
- Weather: Open-Meteo daily, client-side, no key (references/open-meteo.md). Clothing advice is derived in-page.

## Anti-patterns
| Anti-pattern | Fix |
|--------------|-----|
| Flat list instead of the mobile site | Emit the timeline HTML |
| Fabricated coords/prices | Verified only; flag unknowns |
| Venue without contacts/reviews | Verify mandatory evidence or replace it |
| Constraint ignored | Re-pick venue |
| lon/lat swapped in a maps link | pt=lon,lat ; rtext=lat,lon |
| Day ignores arrival/departure | Fit real transport windows |
