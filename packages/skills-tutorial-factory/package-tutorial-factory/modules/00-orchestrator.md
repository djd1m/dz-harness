# Module 00 — Orchestrator

Drives the six steps with two human checkpoints and the empty-evidence rule.

## Inputs
- A target package directory (a pack under `packages/@dzhechkov/<name>`, a CLI, or a library).
- Optional: `--medium site` (default — the factory's own executable renderer, scripts/render-site.mjs),
  `--medium edu-site` (opt-in heavy React SPA via the edu-site-generator agent skill), or
  `--medium markdown` (the lightest output).

## Checkpoints (code-skills-creator style)
- **`confirm-topics`** — after Step 2 (authoring), show the topic list + one method citation each,
  before the gate/render. `"ok"` proceeds; feedback re-authors.
- **`review-course`** — after Step 5 (render), show the rendered site path + the verify-site verdict
  + gate/review verdicts.

## Empty-evidence rule (INV-5)
Do NOT fabricate teachable surface. Two stop conditions:
1. `extract-brief` returns `escalate: insufficient-surface` (doc-thin AND code-thin) → STOP, report
   "insufficient teachable surface for a course."
2. The deterministic gate cannot pass after HONEST authoring → iterate the KB/authoring prompt
   (AM-15 risk #1), never weaken the gate.

## Model routing (advisory)
- Extraction + gate are deterministic scripts — no model cost.
- Authoring (Step 2) is the model-heavy step; run it on a strong model.
- The Plane-2 review (Step 4) MUST be a DIFFERENT model family than the author (cross-model), invoked
  by the parent pipeline's Codex QE — never the authoring agent reviewing itself.

## Tier
Course production is an **L**-shaped feature (multi-artifact, gated). For a small package the render can
be skipped in favor of the markdown medium, but the gate still runs on the course data.
