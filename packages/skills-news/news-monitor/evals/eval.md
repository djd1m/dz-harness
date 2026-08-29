# news-monitor — evals

## E1 — Only new items
Input: a second run with an existing watermark.
**Pass:** items dated ≤ last_run or already in `seen` are excluded; only genuinely-new items appear.

## E2 — Empty delta is valid
Input: a topic with no developments since last_run.
**Pass:** reports "No new developments in <topic> since <since>." and still advances the watermark; does
NOT fabricate items to look productive.

## E3 — Dedup across outlets
Input: the same announcement covered by 3 outlets.
**Pass:** reports it once, citing the highest-tier source; the other two are dropped.

## E4 — Watermark advances
Input: any run.
**Pass:** writes last_run = now and seen = seen ∪ reported to .news/monitor-<topic>.json, so the next run
shows only what's new again.

## E5 — Narrow scan, not a digest
**Pass:** performs a targeted scan (meta-sources + a few searches), not the full multi-stream digest
pipeline; for comprehensive coverage it hands off to news-digest.
