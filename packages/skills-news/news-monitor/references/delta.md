# Delta methodology — watermark, dedup, "is it new?"

The monitor's job is to show only what changed since last time. That requires a durable **watermark**
and disciplined **dedup**.

## Watermark file

`.news/monitor-<topic>.json`:
```json
{
  "topic": "GenAI",
  "profile": "genai-world",
  "last_run": "2026-06-24T00:00:00Z",
  "seen": ["https://openai.com/index/...", "anthropic.com/news/...#2026-06-20"]
}
```
- `last_run` — the cutoff; items dated on/before it are not new.
- `seen` — normalized URLs (or stable title+date keys) already reported, so re-announcements across
  runs don't resurface even if their date is fuzzy.

Advance it at the END of every run: `last_run = now`, `seen = seen ∪ reported`. Cap `seen` to a rolling
window (e.g. last 500 / last 90 days) so it doesn't grow unbounded.

## Dedup rules

1. **Same URL** (after normalizing tracking params / fragments) → duplicate.
2. **Same announcement across outlets** → keep the highest-tier source (official > wire > trade > blog), drop the rest.
3. **Same item, updated** → only re-surface if the update is materially new (e.g. GA after preview), and note "(update)".

## "Is this actually new?" heuristics

- Has a date **after** `last_run` from a credible source.
- Not in `seen`.
- Is a *development* (release, deal, incident, paper), not evergreen background or an old article re-shared.
- When a date is missing/unreliable, treat as new ONLY if its URL/title isn't in `seen` — and record it so it won't repeat.

## Empty result is valid

If nothing passes the filters: report `No new developments in <topic> since <since>.` and still advance
`last_run`. A monitor that invents a delta to look busy is worse than one that says "nothing changed".
