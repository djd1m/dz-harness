# Module 01 — Extract concepts (ADR-002)

**Default = lightweight doc-harvest.** For a harness package the teachable surface is the docs: each
`SKILL.md` states a decision moment + triggers, the `README.md` states commands/usage, `package.json`
`bin`/`exports` state the API, tests state behavior by example. `scripts/extract-brief.mjs` harvests
these into a dependency-ordered **Concept Brief** — PocketFlow *IdentifyAbstractions* (concept-first)
+ *OrderChapters* (dependency-first), applied to docs, not raw source.

## Run
```bash
node "$SKILL_ROOT/scripts/extract-brief.mjs" --pkg <package-dir> --json /tmp/<slug>-brief.json
```
Output brief: `{ package, generatedFrom:'doc-harvest', counts, escalate, topics[] }`. Each topic has
`id`, `title`, `keyConcepts[]`, `suggestedExercise`, `dependsOn[]`, `kind`, and a `source` provenance
pointer (`README.md#<topic-id>` — unique per topic, NOT a guaranteed GitHub anchor).

**Topic model (F1).** Every SUBSTANTIVE README `##` section is its own topic (`kind:
'readme-section'`) — the README IS the curriculum outline. Substantive = body ≥ 300 chars, heading
not on the exact-match boilerplate stoplist (License, Changelog, Contributing, …). Parsing is
fence-aware (a `## ` line inside a code fence is example content; CommonMark rules — same delimiter
character, closing run ≥ opening, ≤3 spaces indent) and CRLF-normalized; honest scope: ATX
`##`/`###` headings in `README.md`/`readme.md` only — setext/HTML headings, other filenames, and
list-embedded fences (`- ```md`) are not tracked. Plus: one overview topic (all substantive headings as its curriculum), one topic
per `SKILL.md`, one API topic from package.json when no skills exist. The harvester reports
EVERYTHING teachable; sizing the course down is Step-2's authoring decision.

## Exit codes / escalation seam
| exit | meaning | action |
|------|---------|--------|
| 0 | usable brief (`escalate: null`) | proceed to Step 2 |
| 3 + `escalate: understand-anything` | doc-thin BUT real code surface (large code package) | escalate: run `understand-anything` and reuse its abstractions/layers as the brief (its topics feed Step 2 the same way) |
| 3 + `escalate: insufficient-surface` | doc-thin AND code-thin | STOP (INV-5) — report "insufficient teachable surface", never ship a 1-topic course |

**Escalation is decided by DOC VOLUME (F1):** substantive characters (section bodies + SKILL.md
files; the pre-`##` intro is deliberately excluded — badges/TOC junk must not buy the floor) below
`--doc-floor` (default 1500, finite-clamped) triggers it. The `--min-topics` floor (default 3)
remains only as the degenerate-course backstop and counts CONTENT topics (readme-section + skill) —
scaffolding (overview, API) does not vault it. The old topic-count-only trigger structurally capped
no-SKILL.md packs at 2 topics and escalated even a 186 KB README (the F1 defect). The
understand-anything pass is heavier than budget on very large packages — if it exceeds budget, fall
back to "report insufficient surface", never a stub (risk #3).

## Output → Step 2
The brief's `topics[]` become the course sections; carry each topic's `source` forward so the
calibration checklist can trace every section to the doc it came from.
