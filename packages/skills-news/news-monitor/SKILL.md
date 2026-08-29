---
name: "news-monitor"
description: >
  Watch a topic for what's NEW since you last looked — a lightweight delta scan (not a full digest). Reads the same profiles as news-digest, fetches the profile's meta-sources + a few targeted searches through the bundled goap-research-ed25519 verified-research backend (MANDATORY — ed25519-signed source provenance), diffs against a saved watermark of already-seen items, and reports only the genuinely-new, deduplicated, verified-and-signed developments. Use for a recurring "what changed?" check between full digests. Triggers on: "what's new since", "any updates on", "monitor X for news", "check for new releases", "news delta", "что нового по", "/news-monitor".
trust_tier: 1
trust_tier_label: "DZ-original (companion to news-digest; methodology inspired by Cloud.ru GenAI GTM news-digest skills, clean-room)"
---
# News Monitor

A **delta** on a topic: "what's genuinely new since I last checked?" — not a full digest. Cheap, fast,
deduplicated against what you've already seen, every item cited. Pair it with `news-digest`: monitor
frequently for changes, digest periodically for the full picture.

> **Attribution.** Shares the profile + source-tiering methodology of `news-digest` (inspired by the
> Cloud.ru GenAI GTM news-digest skills, clean-room). This skill adds the watermark/delta layer.

## When to use

- A recurring "any updates on X?" between full digests (daily/weekly pulse).
- Watch a release feed / changelog / competitor set and surface only the new items.
- Decide whether enough has changed to justify a full `news-digest` run.
- NOT for a comprehensive period report (use `news-digest`) and NOT for building a deployed scraping bot (use `data-scraper-agent`).

## Inputs

| Param | Default |
|-------|---------|
| `topic` | Required — what to watch |
| `profile` | A profile under `news-digest`'s `references/profiles/` (e.g. `genai-world`), or derive ad-hoc |
| `since` | Watermark from the last run (ISO date); first run defaults to 14 days ago |
| `watch` | Optional subset of the profile's streams/watchlist to focus on |

## Workflow

1. **Load the watermark.** Read the last-seen state (`.news/monitor-<topic>.json` — last run ISO + seen item ids/URLs). First run → no watermark; use `since` default.
2. **Scan, don't sweep — through the verified backend (MANDATORY).** Gather candidates via the bundled
   **`goap-research-ed25519`** skill (`goap-research-ed25519/SKILL.md`, shipped in this pack): `WebFetch` the
   profile's `meta_sources` + 3–8 targeted `WebSearch` queries for the watch set, each routed through goap so
   every candidate carries an **ed25519-signed provenance record**. A narrow pass, not the digest's full
   research — but the verification is **not optional**: an item that can't be verified/signed is not reported
   (or flagged `[unverified]`).
3. **Diff against the watermark.** Drop anything dated ≤ `since` or whose URL/title is already in the seen set. Dedup near-duplicates (same announcement across outlets → keep the Tier-1 source).
4. **Tier & verify.** Apply the same source-credibility tiers **and** require the `goap-research-ed25519`
   signature from step 2 — tier + signature both gate a new item. **Never fabricate** — if nothing new, say
   "no new developments since <since>" (a clean empty result is a valid, useful answer).
5. **Report** the new items, grouped by stream, newest first, each with an inline citation + date.
6. **Advance the watermark.** Write the new last-run ISO + the union of seen ids back to `.news/monitor-<topic>.json` so the next run only shows what's new again.

See `references/delta.md` for the watermark format, dedup rules, and the "is this actually new?" heuristics.

## Output

A short, dated, cited delta report — plus an updated watermark file. The structured manifest a run can
emit is described by `schemas/output.json` (topic, since, new-item count, items with url+date+stream);
`scripts/validate-config.json` lists the watermark + item validation rules.

```markdown
## What's new in <topic> — since <since>
*(scanned <N> sources; <M> new items)*

### <stream>
- **<title>** — one line, why it matters ([Source](URL), <date>)
```
If nothing qualifies: `No new developments in <topic> since <since>.` (and still advance the watermark).

## Examples

```text
"what's new in GenAI since last week"
  → load watermark → scan genai-world meta-sources + targeted searches → diff → cited delta, newest first

"monitor the Kubernetes ecosystem for releases"
  → narrow scan of release feeds/watchlist → only new releases since the saved watermark

"any updates on our competitor set?"  (custom profile)
  → watch only the competitor watchlist streams → new items since last run, or "nothing new"
```

## Anti-patterns

- **Don't re-report seen items.** The watermark + seen-set exist precisely so each run shows only what's new; ignoring them turns a monitor into a noisy re-digest.
- **Don't fabricate a delta.** "Nothing new since <since>" is a correct, valuable result — never pad it.
- **Don't bypass `goap-research-ed25519`** — it's the mandatory verified backend (step 2); an unsigned/unverifiable item is not a reportable delta.
- **Don't run the full digest pipeline here.** This is a narrow scan; for comprehensive period coverage hand off to `news-digest`.
- **Don't capture URLs late** — record each new item's URL + date at the moment you find it.
- **Don't forget to advance the watermark** — a monitor that never updates its watermark repeats itself forever.

## Bundled & related skills

**Required (bundled in this pack):** `goap-research-ed25519` — the mandatory verified-research backend
(ed25519-signed provenance) for the scan; ships inside `skills-news`.

**Related (optional):** `news-digest` (the full periodic digest — same profiles) · `data-scraper-agent`
(deploy a scheduled scraping bot) · `canary-watch` (monitor a deployed URL, not news) · `brave-search` /
`exa-search` (search primitives).
