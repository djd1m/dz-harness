# Design Thinking — Conventions

Governance for the `/design-thinking` pipeline. These conventions sit alongside the
skill's own 23 validation rules (DT-001 … DT-023, see
`.claude/skills/design-thinking/scripts/validate-config.json` — the source of truth —
and the shard for the error-gate table with severities and tier scopes).

## Output directory

All artifacts go into `design/<slug>/`.
- Slug: `kebab-case`, Latin, ≤ 40 chars, no dates/ticket numbers in the slug.
- NEVER create design artifacts in the project root or in `features/` / `researches/`
  (those belong to `/feature-adr` and `/casarium` respectively).
- The path scheme below is **toolkit governance** — the skill prescribes report
  contents (Empathy Report, Problem Definition, …), not file paths.

## Artifact naming (numbered by phase)

```
00_task_brief.md            ← from explore
01_empathize_research.md    ← goap-research-ed25519 output (verified)
02_define_jtbd_cjm.md       ← POV + JTBD + CJM + VSM + "How Might We" questions (3-5)
03_ideate_hadi.md           ← HADI hypotheses generated from the HMW questions
04_prototype/               ← wireframes / frontend-design output (if digital UI)
05_test_usability.md        ← usability findings + HADI validation table + risk register
06_validate_pilot.md        ← pilot validation (Validate phase — L/XL tiers, DT-011)
README.md                   ← auto-generated summary
```

> Note: HMW questions are a **Define** output (consumed by Ideate); HADI hypotheses are
> **generated in Ideate** and **validated in Test** — per the canonical SKILL.md.

## Phase rules

1. **Empathize before Define.** Do not synthesize JTBD/CJM without research input.
   If `goap-research-ed25519` is unavailable, document sources manually and flag the
   research as "unverified — goap-research unavailable" (never fabricate verified data).
2. **5 users for qualitative discovery (DT-008), 30+ for any statistical claim, 100+
   survey respondents for quantitative validation (DT-012).** Do not state a percentage
   from 5 interviews.
3. **Minimum 2 prototype iterations (DT-005) and 2 test iterations (DT-009)** for M+ tiers.
4. **Every Ideate idea traces to a Define insight** (toolkit traceability convention).
5. **Pilot validation (Validate phase) is mandatory for L/XL tiers (DT-011).** For S/M
   tiers the skill's complexity router may legitimately finish at Test — but a "go build
   at scale" recommendation should still cite what validation it rests on.

## Skill dependencies (bundled by this toolkit)

| Skill | Phase | Role |
|-------|-------|------|
| `explore` | Entry (required) | Socratic Task Brief before Empathize |
| `goap-research-ed25519` | Empathize (required) | Verified user/market research |
| `problem-solver-enhanced` | Define | 5 Whys + TRIZ when root cause is deep |
| `six-thinking-hats` | Ideate | Team divergence (for team ideation sessions) |
| `frontend-design` | Prototype | Working HTML/React prototype (if digital UI) |
| `structured-reasoning` · `reflection-loop` | any | Toolkit additions (not referenced by SKILL.md): reasoning strategy + critique-revise cycles |

Optional skills the SKILL.md mentions with documented fallbacks (NOT bundled):
`reverse-engineering-unicorn` (→ use goap-research manually), `qcsd-ideation-swarm`
(→ Ishikawa + 5 Whys from Phase 2). See the skill's fallback table.

## Cross-skill invocation notes (chain-contract audit findings)

1. **`frontend-design` in Phase 4 — testability over novelty.** frontend-design mandates
   bold, grid-breaking aesthetics; a Phase-5 usability test needs conventional,
   predictable interaction patterns (novelty inflates error rate and time-on-task,
   confounding HADI validation). When DT invokes it, constrain: *conventional patterns
   and testability take priority over visual boldness; the prototype is a learning
   instrument (min 2 throwaway iterations, DT-005), not a production showcase.*
2. **`six-thinking-hats` in Phase 3 — protocol only, all six hats.** The bundled skill is
   testing-flavored (its examples/templates target QA topics). Use only its hat-rotation
   protocol with product-ideation content substituted for the testing examples. Run **all
   six hats** (the skill explicitly forbids skipping), with extra weight on Green
   (creative), Red (emotional), Black (risks) as DT suggests.
3. **"Build a landing page" disambiguation.** *"Build me a landing page"* (no discovery
   intent) → use `frontend-design` directly. *"Validate demand with a landing page"* →
   DT Phase 4 Landing-Page MVP. Don't over-process a quick build request into a research
   project, and don't skip discovery on a genuine validation request.

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Jumping to a solution before Empathize/Define | BLOCK — run the early phases first |
| Quantitative claim from 5 interviews | Qualitative only; 30+ for stats, 100+ for surveys (DT-012) |
| Skipping the pilot on an L/XL-tier build decision | Produce `06_validate_pilot.md` (DT-011) |
| Idea with no traceable user need | Tie every idea to a Define insight |
| Treating DT as a bug-fixing tool | Use `problem-solver-enhanced` / `debug-loop` instead |
| Unlabeled TO BE states | CJM TO BE = hypothesis (DT-003); VSM TO BE = projection (DT-010) |
