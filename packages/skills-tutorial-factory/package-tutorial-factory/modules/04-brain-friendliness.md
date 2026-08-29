# Module 04 — Brain-friendliness review (ADR-003, Plane 2)

The SEMANTIC half of enforcement: conversational tone (P3), surprise/emotion (P4), story/viewpoint
(P8), analogy/metacognition (P6/P11). A script cannot judge these, so they live on layer 3 — a
FRESH, cross-model reviewer grounded on the method-KB. Advisory (ADVICE, never an auto-block).

## Who runs it
The **parent pipeline's cross-model Codex QE** — NOT the authoring agent (no self-review). This module
only ships the SEAM: `scripts/brain-friendliness-prompt.mjs`.

## Build the prompt (grounding is mandatory)
```bash
node "$SKILL_ROOT/scripts/brain-friendliness-prompt.mjs" \
  --kb "$SKILL_ROOT/references/head-first-method.md" --course /tmp/<slug>-course.json
```
`buildReviewPrompt` throws without a `kbPath` — the reviewer is forced to read the page-anchored KB and
to cite which pattern id each critique maps to (grounded, not vibes).

## Parse the verdict (codex-routing-honesty)
`parseReview(text)` returns `null` on empty / whitespace / **gradeless** output. A null is a LOUD
fallback: log "cross-model brain-friendliness review did NOT happen" and treat the course as
un-reviewed on the semantic axis — NEVER read an empty answer as a clean pass. A real verdict is
`GRADE: <A|B|C|D|F>` plus grounded critique lines.

## What a low grade means
A structurally-valid course (gate PASS) can still read dry. A `C`/`D` here is the signal to iterate the
KB or the authoring prompt (Step 2), not to ship. This plane is where AM-15 risk #1 ("does it FEEL Head
First?") is actually caught.
