# Module 04 — Validation (blocking checklist)

Fail (and fix) if any item is false:
1. Every point has a title + category; every point either has lat/lon (→ map pin) or is explicitly flagged "координаты уточняются".
2. Every named establishment/attraction is marked `venue: true`; walks, public-space stops, and
   transport legs are deliberately marked `venue: false`.
3. Every `venue: true` point has a verified address, an official website or phone, and a separate
   review source URL with an ISO checked date. If rating/count is shown, it matches that source.
4. Every day with ≥2 located points renders a multi-stop Yandex route link.
5. Open-Meteo widget is wired per day (day has lat/lon or lodging coords + a date).
6. Constraints honored in EVERY venue (no-alcohol/veg/kids/budget) — spot-check each restaurant/café.
7. «Купить билет» appears on every point with booking.required=true (and the url is set).
8. Category mix present across the trip (excursions/museums/walks/viewpoints/water/cuisine).
9. Day 1 starts after arrival; last day ends before departure.
10. The HTML opens with no horizontal scroll on a 390px-wide viewport; cards expand/collapse; contacts and review links are reachable; the JSON parses.

Output: validation report (pass/fail per item). Only declare done when all pass.
