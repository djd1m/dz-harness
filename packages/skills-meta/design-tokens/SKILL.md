---
name: design-tokens
description: >
  Manage a DESIGN.md design-token contract — author, lint (WCAG AA contrast +
  broken-ref + section-order), diff for regressions, and export to Tailwind v3,
  Tailwind v4, or W3C DTCG. Wraps the @google/design.md CLI (npx @google/design.md).
  Meant as the shared token contract for the frontend cluster: capture an aesthetic
  extracted by clone-website as a DESIGN.md, then feed it as context to frontend-design /
  design-taste-frontend and export it into the build. Triggers on: "design tokens",
  "DESIGN.md", "design system file", "lint design tokens", "export tokens to tailwind",
  "design token contrast check", "extract design system".
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# Design Tokens (DESIGN.md)

Author and validate a **DESIGN.md** — a single human- *and* machine-readable design-system
contract (YAML token front matter + Markdown rationale) — and convert it into framework tokens.
Powered by the [`@google/design.md`](https://github.com/google-labs-code/design.md) CLI, run via
`npx` (no install needed). It is designed to be the **token interchange layer** for the harness
frontend skills — a common, lintable artifact (`frontend-design`, `design-taste-frontend`, and
`clone-website` produce styling today as ad-hoc CSS; a DESIGN.md gives them one contract to
converge on). The handoffs below are the *intended* pipeline, not automatic wiring — you drive
them by feeding the DESIGN.md between skills.

> **Format status:** `@google/design.md` is **alpha** (Apache-2.0). Pin a version in CI and
> re-check the spec (`npx @google/design.md spec`) before relying on edge behavior. This skill
> wraps the tool and teaches the format — it does **not** vendor the tool's code.

## When to Use

- Starting a new UI and you want one source of truth for colors / type / spacing / components.
- After `skills-website-cloner` or a redesign extracts an aesthetic — capture it as a DESIGN.md.
- Before handing tokens to `frontend-design` / `design-taste-frontend` — give them a real contract.
- Enforcing **WCAG AA contrast** and catching broken `{token.refs}` as a CI gate.
- Migrating tokens into Tailwind (v3 config or v4 `@theme`) or a W3C DTCG pipeline.
- Reviewing a token change for **regressions** (removed tokens, contrast drops) via `diff`.

## When NOT to Use

- Writing component CSS/JSX itself — that's `frontend-design` / `design-taste-frontend`; this skill
  only owns the *token contract* they read from.
- General accessibility auditing of a rendered page — use `qe-visual-accessibility` (axe-core).
  This lints token *definitions*, not the live DOM.
- Picking the aesthetic / motion direction — that's a taste decision, not a token-format one.

## Prerequisites

```bash
# Runs via npx — no global install:
npx @google/design.md spec          # print the format spec
npx @google/design.md spec --rules  # spec + the active lint rules

# Windows PowerShell: use the alias to dodge the .md file-association quirk
npx -p @google/design.md designmd spec
```

## The DESIGN.md Format

Two layers in one file:

1. **YAML front matter** (between `---` fences) — the machine-readable tokens.
2. **Markdown body** — the human rationale, in canonical section order.

```markdown
---
version: alpha
name: Acme Web
description: Marketing site tokens
colors:
  primary: "#1A4FD6"
  on-primary: "#FFFFFF"
  surface: "oklch(98% 0.01 250)"
typography:
  h1:
    fontFamily: Public Sans
    fontSize: 3rem
    fontWeight: 700
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
rounded:
  sm: 8px
spacing:
  4: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
    padding: 12px
---

## Overview
One-paragraph brand & style intent.

## Colors
Why these hues; semantic roles.

## Typography
Scale rationale.

## Layout
Spacing scale, grid.

## Components
Per-component decisions.

## Do's and Don'ts
Guardrails for contributors.
```

**Token grammar:**

| Type | Form | Example |
|------|------|---------|
| Color | any CSS color | `"#1A4FD6"`, `"oklch(62% 0.18 250)"` |
| Dimension | number + unit | `16px`, `3rem`, `-0.02em` |
| Token reference | `{path.to.token}` (resolves hierarchically) | `{colors.primary}` |
| Typography | object: `fontFamily` / `fontSize` / `fontWeight` / `lineHeight` / `letterSpacing` | see above |

Component properties: `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`,
`size` / `height` / `width`. Express states as sibling entries, e.g. `button-primary-hover`.

**Canonical body section order** (out-of-order → `section-order` **warning** — the only
error-severity rule is `broken-ref`): Overview → Colors → Typography → Layout →
Elevation & Depth → Shapes → Components → Do's and Don'ts.

## Protocol

### Step 1 — Author or capture the DESIGN.md

Write the front matter from the brief (or from tokens an upstream skill extracted). Always define
a `primary` color and at least one `typography` token, and reference colors from components via
`{colors.*}` rather than re-pasting hex (keeps `diff` and `orphaned-tokens` meaningful).

### Step 2 — Lint (the quality gate)

```bash
npx @google/design.md lint DESIGN.md                 # human-readable
npx @google/design.md lint --format json DESIGN.md   # for CI / parsing
cat DESIGN.md | npx @google/design.md lint -          # from stdin
```

Exit code `1` if any **error**-severity finding, else `0`. The nine rules:

| Rule | Severity | Catches |
|------|----------|---------|
| `broken-ref` | error | `{token.ref}` that doesn't resolve |
| `missing-primary` | warning | colors defined but no `primary` |
| `contrast-ratio` | warning | component bg/text pair below WCAG AA (4.5:1) |
| `orphaned-tokens` | warning | color token never referenced |
| `missing-typography` | warning | colors but no typography tokens |
| `section-order` | warning | body sections out of canonical order |
| `unknown-key` | warning | top-level YAML key looks like a typo |
| `missing-sections` | info | optional sections (spacing/rounded) absent |
| `token-summary` | info | per-section token counts |

> `contrast-ratio` is a **warning**, not an error — so `lint` exits `0` even with a contrast miss.
> For an accessibility gate, parse `--format json` and fail the build on
> `findings[].rule == "contrast-ratio"` (or any `severity == "warning"`) yourself.

### Step 3 — Diff for regressions (on change)

```bash
npx @google/design.md diff DESIGN.md DESIGN-proposed.md
npx @google/design.md diff --format json DESIGN.md DESIGN-proposed.md
```

Exit code `1` when a **regression** is detected (e.g. a token removed, or contrast worsened).
Wire this into PR review of any token change.

### Step 4 — Export to the build target

```bash
# Tailwind v3 — theme.extend config object
npx @google/design.md export --format json-tailwind DESIGN.md > tailwind.theme.json
# Tailwind v4 — @theme { ... } CSS custom properties
npx @google/design.md export --format css-tailwind   DESIGN.md > theme.css
# W3C Design Tokens (DTCG)
npx @google/design.md export --format dtcg           DESIGN.md > tokens.json
```

(`tailwind` is an alias of `json-tailwind`.) Commit the DESIGN.md as the source of truth and
treat exported files as build artifacts.

### Step 5 — Hand off across the frontend cluster

These handoffs are **manual and intended, not automatic** — none of the partner skills read a
DESIGN.md on their own today; you route it between them. Treat this as the convergence pipeline:

| Partner skill | Intended handoff | How you drive it |
|---------------|------------------|------------------|
| `clone-website` | → DESIGN.md | it extracts a site's aesthetic as global CSS; transcribe those tokens into a DESIGN.md so they become lintable/exportable |
| `frontend-design` | ← DESIGN.md | paste the DESIGN.md (or its exported Tailwind theme) into the brief so components build against one contract |
| `design-taste-frontend` | ← DESIGN.md | same — give its dial-driven build a fixed token set as ground truth (its dials tune *aesthetic intensity*, not these token values) |
| `qe-visual-accessibility` | parallel | axe-core checks the rendered DOM; `lint` checks the source tokens — complementary, run both |
| AgentDB (`agentdb-memory`) | store | persist token sets / diffs to learn a house style over time |

## Anti-Patterns

| Anti-Pattern | Why it fails | Correct approach |
|--------------|--------------|------------------|
| Treat green `lint` as "accessible" | `contrast-ratio` is a *warning* — exit stays `0` | gate CI on the JSON findings, not the exit code |
| Hard-code hex in components | breaks `diff`, `orphaned-tokens`, single-source-of-truth | reference `{colors.*}` |
| Commit the exported Tailwind file as source | drifts from DESIGN.md silently | DESIGN.md is source; export is a build step |
| Assume the schema is frozen | tool is **alpha** | pin the version, re-run `spec` before relying on edge behavior |
| Vendor the @google/design.md code into the repo | Apache + external maintainer + alpha | run via `npx`, reference the format (this skill's stance) |

## Self-Check

- [ ] DESIGN.md has a `primary` color and ≥1 `typography` token?
- [ ] Components reference colors via `{colors.*}`, not raw hex?
- [ ] `lint --format json` parsed; no `error` findings; contrast warnings triaged?
- [ ] Body sections in canonical order, no duplicate headings?
- [ ] `diff` run against the previous version on any token change (no regressions)?
- [ ] Export target chosen and wired as a build artifact (not committed as source)?

## Examples

**In scope:**
- "Turn this brand palette into a DESIGN.md" → author front matter + body, then `lint`.
- "Does my button pass contrast?" → `lint --format json`, read the `contrast-ratio` finding.
- "Export my tokens to Tailwind v4" → `export --format css-tailwind`.
- "Did this PR drop any tokens?" → `diff` old vs new, gate on exit code.

**Out of scope:**
- "Build the hero section" → `frontend-design` / `design-taste-frontend`.
- "Audit the live page for a11y" → `qe-visual-accessibility`.
- "Pick the visual style" → that's a taste call, not a token-format task.
