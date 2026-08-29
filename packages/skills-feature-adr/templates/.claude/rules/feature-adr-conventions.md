# Feature ADR Conventions

## When to Use /feature-adr vs Other Commands

| Situation | Command |
|-----------|---------|
| Implementing a software feature | `/feature-adr` |
| Researching an AI case for hackathon | `/casarium` |
| Solving a complex problem (no code) | `/solve` |
| Designing architecture only (no code) | `/architecture-phase` |
| Building a new skill/command | `/bto-build` |

## Output Directory

All `/feature-adr` artifacts go into `features/<feature-slug>/`.
NEVER create feature artifacts in the project root or in `researches/`.

`researches/` is for `/casarium` pipeline only.
`features/` is for `/feature-adr` pipeline only.

## Slug Naming

- Format: `kebab-case`, Latin characters only
- Max length: 40 characters
- Examples: `add-user-auth`, `refactor-payment-flow`, `migrate-to-postgres`
- NO dates, NO ticket numbers in slug (put those in the artifact files)

## Artifact Naming

All artifacts use numbered prefix matching their step:

```
00_complexity_assessment.md
01_requirements.md
02_research.md
03_adr/001-{decision-slug}.md
03.5_ideation_report.md
04_domain_model.md
05_architecture.md
06_implementation_plan.md
07_code_changes/change_manifest.md
08_qe_report.md
09_fleet_qe_assessment.md
```

## Complexity Tier Rules

- Tier is determined by Step 0 (Complexity Router) — never guess
- User can override tier at Checkpoint 0
- Once confirmed, tier determines which steps run
- Tier CANNOT change mid-pipeline (restart if scope changes significantly)

## Integration with Existing Pipeline

`/feature-adr` is independent from the Casarium pipeline.
It does NOT use:
- Phase numbering (Phase 0-6)
- Research artifacts (00_product_discovery.md, etc.)
- CJM prototypes
- Presentation generation

It DOES share:
- Skills (`explore`, `problem-solver-enhanced`, `frontend-design`)
- Agent swarm patterns
- Checkpoint protocol
- Promise tag system
- Model routing rules

## Feature Lifecycle

```
/feature-adr [description]
  → Step 0: classify
  → Steps 1-5: design (per tier)
  → Step 6: plan
  → Step 7: code
  → Step 8: QE
  → Step 9: Fleet QE (L/XL)
  → Done: README.md + code changes in repo
```

After completion:
- Code changes live in the actual codebase (not just in `features/`)
- `features/<slug>/` contains the design artifacts (ADRs, diagrams, reports)
- These artifacts serve as documentation for the feature
## The cost-of-detection ladder (place every check on its cheapest reliable layer)

For every quality check the pipeline performs, put it on the **strongest layer that can express it**
(strong = cheap to run, deterministic, silent-proof). A miss almost always means a check lived one layer
too weak for its nature:

```
STRONGEST (cheap, catches 100%, no model needed)
  1. CI / deterministic test        wc -l cap, sha256 pin, grep-guard, dz guard rule
  2. always-loaded role file        architecture/*.md, project-critic — read EVERY run
  3. pipeline step gate             Step-8 QE, claim-check, discrimination-check, amendment gate
  4. skill judgment                 "the reviewer will notice" — runs if invoked well
  5. agent memory / vibes           "I should remember to…" — runs if recalled
WEAKEST (probabilistic, model-dependent, silent when it lapses)
```

Design rule when adding ANY new check:
- Deterministic (size, presence, absence, format) → a **repo test / dz guard rule** (layer 1).
- Structural-but-contextual (a named property must have a proving test) → a **step gate** with a
  machine-checkable output (layer 3) — e.g. the ADR Confirmation link, the amendment gate,
  `dz discrimination-check`.
- Semantic/adversarial (honesty, product-fit, exploitability) → a **review plane run by an independent
  model** (layer 3, model-backed) — e.g. cross-model QE, challenge-panel. Never leave it to layer-4.

Anti-pattern: "the critic/QE agent will catch it" for anything a 5-line test could catch. Every such push
from layer 1 up to layer 4 turns a deterministic guarantee into a probabilistic one — a future silent miss.
(Origin: fa-improvements 2026-07-18 — a 700-line cap enforced by reviewer judgment caught one file and
missed its sibling in the same merge request; `wc -l` catches both, always.)
