---
name: "news-digest"
description: >
  Build a professional, source-cited news digest on ANY topic for a given period — research across multiple streams, tier sources by credibility, audit coverage, then synthesize a structured report (Markdown, optionally .docx) with inline clickable citations and a full source index. All source-gathering runs through the bundled goap-research-ed25519 skill as a MANDATORY verified-research backend (GOAP-planned research + ed25519-signed source provenance, anti-hallucination) — no claim ships without a verified, signed source. Topic-agnostic via swappable profiles (e.g. genai-world for AI news, or a custom profile you define). Use when the user wants a periodic digest, newsletter, or "what's new in X" report. Triggers on: "news digest", "новости за период", "AI digest", "дайджест", "weekly/monthly digest", "what's new in X", "подготовь newsletter", "обзор новостей", "/news-digest".
trust_tier: 1
trust_tier_label: "DZ-original (methodology inspired by Cloud.ru GenAI GTM news-digest skills, rewritten clean-room)"
---
# News Digest

Turn a topic + a time period into a **professional, fully-cited news digest**. The engine is
topic-agnostic: a **profile** supplies the research streams, watchlists, and source tiers for a
domain, and the same pipeline produces a structured, source-indexed report.

**Output:** Markdown always; `.docx` optional. Every claim carries an inline citation; the report
ends with a categorized index of every source URL.

> **Attribution.** The multi-stream methodology (mode tiers, changelog/broad sweeps, source
> credibility tiers, coverage audit, adaptive synthesis) is **inspired by Cloud.ru's GenAI GTM
> news-digest skills** and rewritten clean-room as a generalized, topic-agnostic engine. No
> proprietary or company-specific content is bundled — company context lives only in a local,
> unpublished profile you supply.

## When to Activate

- User asks for a digest / newsletter / "what's new in <topic> over <period>".
- User wants a recurring or one-off roundup of developments in a field (AI, a market, a product area, a competitor set).
- User says "обзор новостей за …", "AI дайджест", "weekly digest of …", "summarize the news on … since …".
- Pair with `data-scraper-agent` (scheduled collection) for automation, or `deep-research` for a single deep question.

## Inputs (Phase 0)

| Param | Default |
|-------|---------|
| `topic` | Required — the subject of the digest (e.g. "GenAI", "EV market", "Kubernetes ecosystem") |
| `profile` | A profile under `references/profiles/` matching the topic, or `genai-world`; else derive ad-hoc from the topic |
| `period_start` | 1st of the current month |
| `period_end` | Today (cap to today if a future date is given) |
| `mode` | Auto by period length (see Modes) |
| `audience` | Optional — leadership / team / personal (tunes depth vs. numbers) |
| `formats` | `md` (always) + optional `docx` |

**Validation:** no period → ask; `period_end` in the future → cap + note; `> 3 months` → suggest
QUARTERLY (top-5 per quarter); `≤ 2 weeks` → QUICK automatically.

## Modes

| Mode | Period | Sections | Searches | Checkpoints |
|------|--------|----------|----------|-------------|
| **QUICK** | ≤ 2 weeks | 3–6 | 15–35 | none |
| **STANDARD** | 1–3 months | up to profile max | 40–90 | 2 |
| **QUARTERLY** | > 3 months | profile max, top-5/quarter | 80–120 | 2 |

## Workflow

The pipeline runs in four phases (the procedure below is the same for any topic; the **profile** only
swaps the domain specifics):

1. **Phase 0 — Inputs:** resolve topic, profile, period, mode, audience, output formats; validate.
2. **Phase 1 — Research:** load profile → changelog sweep → broad sweep → run streams → tier & audit sources → Checkpoint 1.
3. **Phase 2 — Synthesis:** compile sources → adaptive sections → executive summary → comparison table → Checkpoint 2.
4. **Phase 3 — Output:** write Markdown (always) + optional `.docx`, each with inline citations and a source index.

## Phase 1: Research

0. **Verified-research backend — MANDATORY.** Conduct ALL source-gathering through the bundled
   **`goap-research-ed25519`** skill (`goap-research-ed25519/SKILL.md`, shipped in this pack): it
   GOAP-plans the research and emits an **ed25519-signed provenance record per source** (anti-hallucination,
   verifiable citation-chain integrity). This is **not optional** — every finding that enters the digest
   MUST carry a goap verification verdict. A source that cannot be fetched/verified is **excluded** or
   explicitly flagged `[unverified]`; `news-digest` never emits a claim without a verified, signed source.
   The 4-tier credibility rule (step 6) and goap's signature **both** gate inclusion.
1. **Load the profile** (`references/profiles/<profile>.md`): research streams, must-cover entities
   (tiered), watchlists, and meta-sources for the topic. No profile? Derive 4–8 streams from the topic
   and proceed (see `references/profiles/_template.md`).
2. **Changelog sweep (mandatory, before streams).** Deterministically `WebFetch` the profile's
   meta-sources (official changelogs / release feeds) to catch product updates that keyword search misses.
3. **Broad sweep (mandatory, before streams).** 5–7 `WebSearch` queries for "biggest/most important
   <topic> news <month> <year>" + trending aggregators — to catch surprises outside the streams.
4. **Run each stream:** `WebSearch` → `WebFetch` the key articles → record findings **with their source
   URL captured immediately** (reconstructing URLs later is unreliable).
5. **Search budget** (see `references/engine.md`): bias toward the focus streams; never exceed the mode cap.
6. **Source credibility — 4 tiers** (Official / Premium wire / Quality trade / Blogs); higher tiers need
   fewer corroborations. **Never fabricate** — if < 3 sources after 5 searches, reformulate, fetch known
   sites directly, or mark "No updates / limited data". Each retained source must ALSO pass
   `goap-research-ed25519` verification (ed25519-signed) — tier **and** signature together gate inclusion.
7. **Coverage audit (mandatory, after streams):** check every must-cover entity + dimension + meta-source
   is covered or explicitly marked "no updates"; fill gaps with 2–3 extra searches.
8. **Checkpoint 1** (skipped in QUICK): report searches run, source counts by tier, findings per stream,
   coverage gaps. Options: "ok" / "go deeper on X" / "add/drop a section".

See `references/engine.md` for the full methodology (budgets, tiers, sweeps, audit, error recovery).

## Phase 2: Synthesis

1. **Compile sources** into a single list, grouped by the profile's categories.
2. **Adaptive sections:** ≥ 5 sources → full section (sub-sections, tables); 2–4 → brief; 0–1 → skip
   or "No updates". Always include the topic's headline section + a conclusions section.
3. **Executive summary:** what happened (top-3, with dates) → why it matters → the numbers → (optional
   audience-specific angle). Each paragraph carries ≥ 1 inline citation; tune depth to `audience`.
4. **Comparison table** when the topic warrants one (e.g. models, products, vendors) — every significant item.
5. **Document structure:** title + period → executive summary → headline section (+ table) → adaptive
   sections → conclusions (trends / what to watch / risks) → **Source Index** (every URL, by category).
6. **Citation rules:** Markdown → `fact ([Source](URL))`, ≥ 1 per sub-section, ≥ 5 in the summary;
   `.docx` → inline clickable hyperlinks in the body, not only in the appendix.
7. **Checkpoint 2** (skipped in QUICK): sections, link/source counts, draft conclusions. Options:
   "ok" / "add/drop" / "rework conclusion N".

## Output (Phase 3)

A run emits a structured manifest (`schemas/output.json`) plus the document files:

1. **Markdown** — write `news-digest-<topic>-<period>.md` with the Phase-2 structure, inline citations,
   and the categorized source index. Verify tables render.
2. **`.docx` (optional)** — see `references/output-formats.md`. Prefer the host's `docx` skill if present;
   otherwise a Markdown→DOCX path (e.g. pandoc) preserving inline hyperlinks. If DOCX fails after a few
   attempts, deliver the `.md` and say so — never block on the DOCX.

## Profiles

- `references/profiles/genai-world.md` — GenAI news (world + open-source/research streams, company tiers, product watchlist, meta-sources). The reference profile.
- `references/profiles/_template.md` — author a custom profile for any topic (and how to keep company-specific context as a **local, unpublished** profile).

## Examples

```text
# Monthly GenAI digest (auto STANDARD mode, world profile)
"Сделай AI-дайджест за февраль 2026"
  → topic=GenAI, profile=genai-world, period=2026-02-01..2026-02-29, mode=STANDARD
  → 10 streams, 2 checkpoints → news-digest-genai-2026-02.md (+ .docx if asked)

# Quick two-week roundup (auto QUICK mode, no checkpoints)
"what's new in AI over the last two weeks"
  → mode=QUICK → streams 1 + top 2–3 → fast .md digest

# Custom topic via an ad-hoc profile
"подготовь дайджест новостей по рынку EV за Q1, для руководства"
  → topic="EV market", derive streams from references/profiles/_template.md,
    mode=QUARTERLY, audience=leadership (more numbers, less tech detail)
```

## Anti-patterns

- **Never fabricate** a fact, figure, or quote; mark gaps honestly ("No updates" / "[Limited data]").
- **Don't bypass `goap-research-ed25519`** — it's the mandatory verified-research backend (step 0); a source
  without a goap signature is `[unverified]` and must be excluded or flagged, never silently included.
- **Don't reconstruct URLs after the fact** — capture each source URL at the moment of the finding.
- **Don't ship proprietary content** in a profile — company/competitive context belongs in a local,
  unpublished profile (see the template; mirrors the `external-comms-gate` rule).
- **Don't trust hardcoded changelog URLs** — vendors rename pages; confirm each at run time.
- **Don't block on `.docx`** — if it fails after a couple of attempts, deliver the `.md` and say so.
- **Don't go shallow-but-wide** under context pressure: 7 solid streams beat 10 thin ones.

## Bundled & related skills

**Required (bundled in this pack):** `goap-research-ed25519` — the mandatory verified-research backend
(GOAP planning + ed25519-signed source provenance). It ships inside `skills-news`, so installing this pack
delivers it; `news-digest` does not run its research without it.

**Related (optional):** `data-scraper-agent` (automate the collection on a schedule) · `deep-research`
(one deep, fact-checked question) · `brave-search` / `exa-search` / `jina-reader` (research primitives) ·
`brand-voice` (match a house style in the write-up).
