# @dzhechkov/skills-pm

Product-management skill pack for [Claude Code](https://claude.com/claude-code) — **18 framework-grounded PM skills** that move beyond generic text to rigorous, step-by-step methodology (Teresa Torres, Marty Cagan, Wodtke, RICE/ICE/Kano, JTBD, Lean Analytics, Crossing-the-Chasm).

## Why

The harness was strong on engineering/QE but thin on the **product** half. This pack fills the real gaps the existing skills don't cover — opportunity framing, prioritization math, strategy/pricing/OKRs, product metrics & experiment stats, GTM/growth, market sizing — without duplicating `design-thinking` (discovery/JTBD/CJM), `reverse-engineering-unicorn` (competitor/market), or `idea2prd-manual` (PRD).

## The 18 Skills

**Discovery & prioritization**
- `opportunity-solution-tree` — Teresa Torres OST (outcome → opportunities → solutions → experiments)
- `prioritize-features` — rank a backlog by impact/effort/risk/alignment
- `prioritization-frameworks` — selector + formulas for 9 frameworks (RICE, ICE, Kano, MoSCoW, Opportunity Score)

**Strategy & goals**
- `product-strategy` — 9-section Product Strategy Canvas
- `pricing-strategy` — pricing models, willingness-to-pay, elasticity, freemium/paid
- `brainstorm-okrs` — Wodtke Radical Focus OKRs

**Metrics & analytics**
- `north-star-metric` — NSM + input-metric constellation
- `metrics-dashboard` — product KPI dashboard, data sources, alert thresholds
- `ab-test-analysis` — significance, power, SRM, CIs → ship/extend/stop
- `cohort-analysis` — retention curves, adoption, churn

**Roadmapping & execution**
- `outcome-roadmap` — output → outcome-focused roadmap
- `stakeholder-map` — Power/Interest grid + comms plan
- `sprint-plan` — capacity/velocity, Definition-of-Ready, critical path
- `strategy-red-team` — steelman-then-attack a plan's assumptions; rank by cheapest test + kill criterion

**Go-to-market & growth**
- `gtm-strategy` — channels, messaging, launch timeline, metrics
- `growth-loops` — PLG loop/flywheel design (5 types)
- `beachhead-segment` — Crossing-the-Chasm first-segment selection
- `market-sizing` — TAM/SAM/SOM (top-down + bottom-up)

## How to Use

```bash
dz init --target claude-code --preset pm      # all 18 via the unified CLI
dz install @dzhechkov/skills-pm               # install the pack
dz info opportunity-solution-tree
```

In Claude Code the skills auto-activate on PM phrasing (e.g. "build an opportunity solution tree", "size this market", "prioritize the backlog", "design our GTM", "set OKRs", "red-team this strategy").

## Provenance

**Imported (MIT)** from [phuryn/pm-skills](https://github.com/phuryn/pm-skills) (21.7k★) and curated per [ADR-0002](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0002-product-and-design-expansion.md) — a multi-agent audit classified all ~68 upstream skills and kept only the 18 that fill genuine harness gaps (dropping ~50 that overlap existing skills or are low-value). Skill bodies preserved verbatim; only `trust_tier` frontmatter added. Original copyright © phuryn under MIT (see `LICENSE`, `sources.json`).

## License

MIT (this packaging) · upstream skills MIT © phuryn.
