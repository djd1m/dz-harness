# @dzhechkov/skills-taste

Anti-slop **frontend taste** skill for [Claude Code](https://claude.com/claude-code) — ships **non-templated landing pages, portfolios, and redesigns**.

## What It Does

`design-taste-frontend` is a prescriptive production framework (not just "make it pretty"):

- **Three dials** the agent infers from the brief — `DESIGN_VARIANCE` (symmetry ↔ artsy chaos), `MOTION_INTENSITY` (static ↔ cinematic), `VISUAL_DENSITY` (gallery-airy ↔ packed).
- **Brief → design-system map** — when to reach for a real design-system package vs an aesthetic.
- **Hard pre-flight checks** — e.g. CTA-wrap ban, no-duplicate-CTA-intent, page theme lock; failing any is "shipping broken work."
- **Canonical motion skeletons** — Sticky-Stack, Horizontal-Pan, Scroll-Reveal (GSAP / CSS), plus forbidden-animation patterns.
- **Perf & a11y guardrails** — hardware acceleration, mandatory reduced-motion.

Triggers on landing-page / portfolio / redesign / "make this not look templated" requests.

## Relationship to `frontend-design`

This **complements** (does not replace) [`frontend-design`](https://www.npmjs.com/package/@dzhechkov/skills-feature-adr) — they sit at different altitudes:

| Use… | When |
|------|------|
| `frontend-design` | **any** UI — components, dashboards, posters, apps — lightweight aesthetic direction |
| `design-taste-frontend` (this) | **landing pages / portfolios / redesigns** — heavyweight, opinionated, dial-driven, pre-flight-gated |

(taste-skill self-scopes: *"Not dashboards, not data tables, not multi-step product UI."*)

## How to Use

```bash
dz install @dzhechkov/skills-taste
dz init --target claude-code --select design-taste-frontend
```

Then in Claude Code: *"build a landing page for …"*, *"redesign this portfolio"*, *"make this site not look templated"*.

## Provenance

**Imported (MIT)** from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) (53k★) per [ADR-0002](https://github.com/djd1m/dz-harness-hub/blob/main/docs/adr/0002-product-and-design-expansion.md) Phase B. Of the upstream's 14 skills, only the core `design-taste-frontend` is imported (variants fold into its dials; `stitch-skill` deferred to Phase C). Body verbatim; only `trust_tier` added. Original copyright © Leonxlnx under MIT (see `LICENSE`, `sources.json`).

## License

MIT (this packaging) · upstream skill MIT © Leonxlnx.
