# News-Digest Engine — Methodology

The topic-agnostic core. A **profile** supplies the domain specifics (streams, entities, watchlists,
meta-sources); this file defines the *process* that runs the same way for any topic.

## Search budget

| Period | Total | Sweep (changelog + broad) | Per stream |
|--------|-------|---------------------------|------------|
| QUICK (≤ 2 wk) | 15–35 | 8–15 | 3–5 |
| 1 month | 40–70 | 12–15 | 5–7 |
| 2 months | 70–90 | 12–15 | 7–10 |
| 3+ months | 80–120 | 12–15 | 10–12 |

Bias the budget toward the headline stream(s) and any user-specified focus (≈ 60% of budget to focus
streams when a focus is given). Never exceed the mode cap — stop and synthesize instead.

## The two mandatory sweeps (run BEFORE the streams)

1. **Changelog sweep** — deterministically `WebFetch` the profile's `meta_sources` (official changelogs,
   release feeds, status pages). Catches product/pricing/feature updates that "release" keyword search misses.
2. **Broad sweep** — 5–7 `WebSearch` queries of the form "biggest / most important <topic> news
   <month> <year>", "<topic> breakthrough <month> <year>", plus trending aggregators. Catches "black
   swans": viral projects, M&A, strategic pivots outside the predefined streams. A surprise → spin an
   ad-hoc stream or fold it into the nearest existing one.

## Source credibility tiers

| Tier | Examples (domain-independent) | Min corroboration for a claim |
|------|-------------------------------|-------------------------------|
| 1 Official | primary site / vendor blog / official repo / regulator | 1 |
| 2 Premium wire | Reuters, Bloomberg, CNBC, AP, FT | 1 + cross-ref |
| 3 Quality trade | reputable trade/industry press | 2 |
| 4 Blogs / UGC | Medium, forums, Product Hunt, personal blogs | 3, or 1 Tier-1 |

A profile MAY name concrete domains per tier for its topic; if it doesn't, classify by the kind of source.

## Coverage audit (run AFTER the streams, BEFORE synthesis)

Mental checklist before writing:
- Every **must-cover entity** (the profile's tiered list) is covered OR explicitly "no updates".
- Every **dimension** the profile defines is covered.
- Every **meta-source** was actually fetched.
- Every **watchlist** item was checked.

Any gap → 2–3 extra targeted searches on the missed item before proceeding.

## Error recovery

```
< 3 sources after 5 searches on a stream:
  1. Reformulate the queries (synonyms, vendor names, the period spelled differently)
  2. WebFetch known authoritative sites for that stream directly
  3. Mark "No updates" or "[Limited data]" — NEVER invent facts
```

## Context pressure

Approaching the context limit: finish the current stream, mark the unfinished ones, go to synthesis.
Better a high-quality digest over fewer streams than a shallow pass over all of them.

## Checkpoints

- **Checkpoint 1** (after research; skipped in QUICK): searches run, source counts by tier, top findings
  per stream, coverage gaps. → "ok" / "deeper on X" / "add/drop a section".
- **Checkpoint 2** (after structure; skipped in QUICK): section list, link & source counts, draft
  conclusions. → "ok" / "add/drop" / "rework conclusion N".
