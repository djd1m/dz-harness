# Module 01 — Research (skill: goap-research-ed25519)

Goal: produce verified POIs + restaurants/cafés, **filtered by the trip constraints**, each with
real coordinates, opening hours, contacts, review evidence, and a ticket-booking flag.

- Run `goap-research-ed25519` (verification "moderate") for: top sights, museums, viewpoints,
  walks, water/river cruises, and local-cuisine venues in the city.
- Apply constraints as HARD FILTERS: no-alcohol → venues that work without bar focus; vegetarian →
  confirmed veg menu; with-kids → kid-friendly + stroller access; budget → within per-day limit.
- For EVERY candidate point, obtain real **lat/lon** (from the source). If coordinates cannot be
  verified, keep the point but set `lat/lon=null` and note "координаты уточняются" — NEVER fabricate.
- Mark museums, cafés, restaurants, theatres, visitor centres, ticketed attractions, and other
  concrete establishments as `venue: true`. Walks, public squares, transport legs, and other
  non-establishment stops may use `venue: false`.
- For EVERY `venue: true` candidate, verify `contacts.address` plus at least one of
  `contacts.website` or `contacts.phone`. Prefer the venue's official page for these facts.
- For EVERY `venue: true` candidate, add `reviews.source`, `reviews.url`, and `reviews.checked`
  (ISO date). The review URL must open a review/listing page, not merely the venue's marketing page.
  `rating` and `count` are optional volatile facts: include them only when the cited page shows
  them, and never estimate or combine ratings from different sources.
- Summarize only recurring, decision-relevant review themes (queues, child suitability,
  accessibility, service, value). Attribute them to the named source; do not present reviews as fact.
- If mandatory contact or review evidence cannot be verified, replace the venue or leave it
  unresolved and FAIL validation. Do not publish it as a recommendation.
- Flag points that need advance booking (museum timed tickets, river cruise, shows) → `booking.required=true`.
- Cover the required category mix (excursions/museums/walks/viewpoints/water/cuisine).

Output: a verified candidate list (more than needed) to draw the itinerary from.
Checkpoint: "Research done — N verified points (M with confirmed coords); every named venue has
contacts + review evidence; all points are constraint-compatible."
