# Profile: _template

Copy this to `<your-topic>.md` and fill it in to make the engine cover any topic. A profile is just
the domain config the engine reads in Phase 1.

```markdown
# Profile: <topic-slug>

<One line: who the digest is for and what it covers.>

## Research streams
| # | Stream | Weight | Focus |
|---|--------|--------|-------|
| 1 | <headline stream> | 30% | <what to look for> |
| 2 | <stream> | …% | … |
(4–10 streams; weights sum to ~100%.)

## Must-cover entities (tiered)
- Tier 1 (always): <the entities that MUST be checked every run>
- Tier 2 (STANDARD+): <secondary>
- Tier 3 (if surfaced): <long tail>

## Watchlist
<Named products / projects / people to track each run.>

## Meta-sources (changelog sweep — WebFetch these)
<Official changelogs / release feeds / status pages / trending aggregators for the topic.>

## Source tiers (optional)
<Name concrete Tier-1..4 domains for this topic; else the engine's generic tiers apply.>

## Comparison table (optional)
<The columns for the topic's comparison table, if one fits.>

## Sections (document)
<The section order for the final report.>
```

## Company / competitive context (keep it LOCAL — do not publish)

If the digest needs an organization-specific angle (a "what this means for <us>" section, competitor
watch, strategic priorities), put that in a **separate local profile that you do NOT commit or publish**
— e.g. `references/profiles/local/<company>.md` ignored by git. It typically contains:

- who the org is, its product lines, target customers;
- strategic priorities → what each implies to watch for;
- the main competitor(s) and what to track about them.

This keeps proprietary / competitive material out of any shipped package — the same rule the
`external-comms-gate` skill enforces for outbound content. The engine reads a local profile exactly like
a shipped one; it just never leaves your machine.
