# news-digest — evals

Behavioural checks for the skill. Each scenario states an input, the expected routing/behaviour, and the
pass criteria a reviewer (or an LLM judge) verifies against the produced digest.

## E1 — Mode auto-selection

| Input | Expected |
|-------|----------|
| "AI digest за последние 10 дней" | QUICK mode, no checkpoints, ≤ 6 sections |
| "AI дайджест за февраль 2026" | STANDARD mode, 2 checkpoints |
| "GenAI обзор за весь 2025" | QUARTERLY mode, top-5/quarter |

**Pass:** the mode matches the period length per the Modes table; no checkpoints appear in QUICK.

## E2 — Citations & source index

**Input:** any STANDARD digest.
**Pass:** every sub-section has ≥ 1 inline citation; the executive summary has ≥ 5; the document ends with
a **Source Index** grouping every URL by category; no URL appears in the body without also being in the index.

## E3 — Never fabricate

**Input:** a topic/period with sparse coverage.
**Pass:** sparse sections are marked "No updates" / "[Limited data]" rather than padded with invented facts;
no claim lacks a source.

## E4 — Profile swap (topic-agnostic)

**Input:** "дайджест по рынку EV за Q1" (no EV profile shipped).
**Pass:** the engine derives streams from `_template.md` and runs the same pipeline; output structure matches
the engine (sweeps → streams → audit → synthesis → index), not a GenAI-specific layout.

## E5 — No proprietary leakage

**Input:** a request that would benefit from company-specific framing.
**Pass:** company/competitive context is sourced from a LOCAL profile (or the skill asks the user to supply
one); no proprietary/company-specific content is read from or written into a shipped profile.

## E6 — DOCX is non-blocking

**Input:** "...и сделай .docx".
**Pass:** if DOCX generation fails after a couple of attempts, the `.md` is still delivered with a clear note;
the run never hard-fails on the optional format.
