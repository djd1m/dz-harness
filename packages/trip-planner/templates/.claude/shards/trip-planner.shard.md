# trip-planner — Governance Shard

## Skill
Load: `.claude/skills/trip-planner/SKILL.md`

## Prerequisites
- `explore` + `goap-research-ed25519` + `frontend-design` installed (bundled by this toolkit).
- Standalone command — not part of casarium/feature-adr pipelines.

## Phases & gates
| Phase | Module | Gate |
|-------|--------|------|
| Intake | 00-intake | All required inputs present (no missing field) |
| Research | 01-research | Every point verified; coords real or flagged; named venues have contacts+reviews; constraints filtered |
| Itinerary | 02-itinerary | Arrival/departure respected; category mix; budget OK |
| Site | 03-site-generation | site-template.html filled; output to trip/<slug>/index.html |
| Validation | 04-validation | Blocking 10-point checklist all pass |

## Hard rules
- No fabricated data (coords/prices/hours/ratings/reviews). Named venues require verified contacts
  and review evidence. Constraints are hard filters. Mobile one-handed layout.
- Maps: pt=lon,lat / rtext=lat,lon. Weather: Open-Meteo client-side, graceful offline fallback.

## Output contract
`trip/<city-slug>/index.html`. Never write to project root, features/, or researches/.
