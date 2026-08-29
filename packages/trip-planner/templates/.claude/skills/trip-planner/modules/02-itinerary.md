# Module 02 — Itinerary (day-by-day timeline)

Goal: turn the verified candidates into a day-by-day plan that respects logistics + minimizes travel.

- Day 1 starts after `arrival`; last day ends before `departure` (leave buffer for transfer).
- Group geographically per day to minimize backtracking; order points by visit time; anchor near lodging.
- Each day: 3–6 points, a sensible rhythm (sight → walk → meal → sight), at least one meal venue.
- Preserve each candidate's `venue`, `contacts`, and `reviews` evidence in the final point. Never
  turn a generic meal placeholder into an unnamed recommendation; choose a verified venue instead.
- Spread the category mix across the trip; don't stack all museums on one day.
- Set `routeMode` per day (pd walking in dense centers; auto/mt when distances are large).
- Respect the daily budget: sum costs per day, keep within limit (note free options).

Output: the `days[]` array (per references/data-schema.md), ready to render.
Checkpoint: "Itinerary drafted — <N> days, categories covered, budget OK. Generate the site?"
