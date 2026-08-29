# Module 03 — Site generation (skill: frontend-design)

Goal: produce a single self-contained `index.html` from `references/site-template.html`.

- Build the full ITINERARY object (references/data-schema.md): trip + days[] with points carrying
  coords, cost, booking, tips, category, and `venue` metadata. Every `venue: true` point carries
  contacts and review evidence; the renderer exposes both in the expanded card.
- Take `references/site-template.html` verbatim and replace ONLY the `__ITINERARY_JSON__` marker
  with `JSON.stringify(itinerary, null, 2)`. Do not alter the CSS/renderer unless asked.
- Write to `trip/<city-slug>/index.html`.
- Use `frontend-design` judgement only for optional polish (titles, ordering, copy) — keep the
  mobile-first, one-handed layout and the existing renderer behavior intact.

Output: `trip/<slug>/index.html` (opens standalone on a phone).
