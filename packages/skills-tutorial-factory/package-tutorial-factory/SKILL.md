---
name: package-tutorial-factory
description: >
  Meta-skill: turn ONE harness-hub package into a Head-First-style, gamified edu-site learning course.
  It COMPOSES three existing engines rather than rebuilding them — skills-book-digitizer's IP-safe
  distillation discipline (a distilled, page-anchored Head First method-KB + the shingling gate),
  its own executable renderer+verifier (scripts/render-site.mjs + verify-site.mjs — deterministic
  single-file SPA, driven not parsed; edu-site-generator remains the opt-in heavy React target), and
  the code-skills-creator meta-factory shape (a grounded, propose-never-clobber orchestrator). Output per invocation = edu-site Step-0
  course data, where every section cites a Head First pattern from the method-KB, gated by a
  deterministic zero-LLM Head-First checklist and an IP shingling check.
  Use when: you have a package (a skill pack, CLI, or library) and want a real, interactive learning
  course for it, not just a README. Skip when: the target has no teachable surface, or a static
  SKILL.md pointer is all that is wanted.
  Triggers: "сделай курс по этому пакету", "turn this package into a course", "build a Head First
  tutorial for <pkg>", "edu-site course for <pkg>", "/package-tutorial-factory <pkg>".
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, SendMessage, TaskCreate, TaskUpdate
trust_tier: 1
trust_tier_label: "Structured"
trust_tier_path: "Run /bto-test to promote to Tier 2"
---

# package-tutorial-factory — package → Head First edu-site course

## Path contract (portable targets)

Resolve `SKILL_ROOT` once as the absolute directory containing this installed `SKILL.md`. Every
`modules/`, `references/`, and `scripts/` path below is relative to `SKILL_ROOT`, never to the host
project or npm-package parent. In a shell, set `SKILL_ROOT` to that resolved directory and invoke direct
commands as `node "$SKILL_ROOT/scripts/<entrypoint>" ...`. If the installed skill directory cannot be
resolved, stop instead of searching a monorepo checkout for missing sidecars.
Bare `modules/`, `references/`, and `scripts/` mentions in prose are declarative links under that root,
not shell commands. Every direct runtime invocation uses Node and the explicit `$SKILL_ROOT` form above.

This skill is an **orchestrator**, not a new engine. It manufactures a gamified learning course for a
single harness-hub package by composing engines that already exist:

| Composed engine | Role here | Do NOT |
|-----------------|-----------|--------|
| `skills-book-digitizer` | its **IP discipline** — the distilled, page-anchored method-KB (`references/head-first-method.md`) and the vendored `scripts/shingling-check.mjs` | re-digitize the book; the KB is already distilled |
| `edu-site-generator` | the **opt-in heavy render target** — a model builds the full React SPA from the Step-0 course data | route the DEFAULT render through it: the factory's canonical renderer is its own executable `scripts/render-site.mjs` + `scripts/verify-site.mjs` (F2 seam; NFR-3 = never hand-write a per-course ad-hoc renderer) |
| `code-skills-creator` | the **shape** — a grounded, checkpointed, propose-never-clobber meta-factory | draft from a blank page or invent a rubric |

**The method is GROUNDED, never hard-coded (ADR-001).** Authoring READS `references/head-first-method.md`
at run time and every section must cite ≥1 pattern id (`P1`–`P12` / `D1`–`D4`) it serves. There is no
"good course" rubric baked into code — refine the method by editing the KB.

## Pipeline

```
modules/00-orchestrator.md       — checkpoints, empty-evidence rule (INV-5), tier/model routing
modules/01-extract-concepts.md   — ADR-002 doc-harvest (default) → Concept Brief; escalate only past the floor
modules/02-author-course.md      — brief × method-KB → edu-site Step-0 course data + per-section citation
modules/03-headfirst-gate.md     — Plane 1: deterministic zero-LLM checklist gate (scripts/headfirst-gate.mjs)
modules/04-brain-friendliness.md — Plane 2: cross-model KB-grounded semantic review (fresh reviewer)
modules/05-render.md             — the factory's OWN executable renderer (scripts/render-site.mjs →
                                   scripts/verify-site.mjs); edu-site SPA / markdown are opt-in media
modules/06-verify-handoff.md     — read-only verify: gate PASS + IP clean + KB resolves + site renders AND runs
```

## Execution protocol (read each module as you reach its step)

1. **Extract** — read `$SKILL_ROOT/modules/01-extract-concepts.md`. Run
   `node "$SKILL_ROOT/scripts/extract-brief.mjs" --pkg <dir>`.
   If it exits 3 with `escalate: understand-anything`, follow the escalation seam; if
   `insufficient-surface`, STOP and report — never ship a 1-topic course.
2. **Author** — read `$SKILL_ROOT/modules/02-author-course.md` +
   `$SKILL_ROOT/references/head-first-method.md` +
   `$SKILL_ROOT/references/method-to-edusite-map.md`. Produce the course object; cite a pattern per section.
   **Checkpoint `confirm-topics`.**
3. **Gate (Plane 1)** — read `$SKILL_ROOT/modules/03-headfirst-gate.md`. Run
   `node "$SKILL_ROOT/scripts/headfirst-gate.mjs" --course course.json --json gate.json`. It MUST pass
   before render. Fix the course, not the gate.
4. **Review (Plane 2)** — read `$SKILL_ROOT/modules/04-brain-friendliness.md`. This is the parent pipeline's
   cross-model Codex QE step — a FRESH reviewer grounded on the KB. Advisory (never auto-block); an
   empty/gradeless review is a LOUD fallback, not a clean pass.
5. **Render** — read `$SKILL_ROOT/modules/05-render.md`. Run
   `node "$SKILL_ROOT/scripts/render-site.mjs" --course course.json` then
   `node "$SKILL_ROOT/scripts/verify-site.mjs" --site site/index.html` — both must exit 0 (the site is driven,
   not just emitted). Render also stamps `course.source` from the target package name and the live npm
   registry version; authors never hand-edit that block. A registry outage leaves `version` absent and
   visible rather than substituting a local package version. `edu-site-generator` / markdown only on
   explicit caller opt-in.
   **Checkpoint `review-course`.**
6. **Verify & hand off** — read `$SKILL_ROOT/modules/06-verify-handoff.md`. Re-run the gate + shingling; confirm
   the KB resolved and no corpus path shipped; optionally record provenance with `dz teach`.

## Invariants

- **INV-5 empty-evidence rule.** If the extractor escalates to `insufficient-surface`, or the gate
  cannot pass after honest authoring, STOP and report — do not fabricate topics or weaken the gate.
- **IP (ADR-004).** Produced courses teach the PACKAGE's own concepts, styled by the method's
  principles; they never contain the book's text. `scripts/shingling-check.mjs` proves it.
- **Cost-of-detection ladder (ADR-003).** Structural properties live in the deterministic gate
  (layer 1); only tone/surprise/story go to the cross-model review (layer 3). Never push a
  script-checkable property up to "the reviewer will notice."
- **Source provenance.** A render carries `source.package`, registry-backed `source.version`, and
  `source.authoredTs`. `source.mirrorReceipt` is optional and is emitted only when a real mirror
  receipt is available; neither the renderer nor an author invents one.

## Anti-patterns

| Anti-pattern | Fix |
|--------------|-----|
| Re-digitizing the Head First book | The KB is already distilled — read it, don't rebuild it |
| Writing a rubric of "good course" constants in code | Ground on the KB; cite patterns per section |
| Copying book text into a course/KB | Paraphrase; the shingling gate fails ≥8-word verbatim runs |
| Shipping a 1-topic course for a thin package | Honor the escalation floor; escalate or report |
| Weakening the gate to make a dry course pass | Iterate the KB/authoring prompt (AM-15 risk #1), not the gate |
