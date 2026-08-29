# Feature ADR — Team Onboarding

**A Spec-Driven Development pipeline for AI coding agents (Claude Code, Codex, …).**

This is the practical guide for a dev team adopting `@dzhechkov/skills-feature-adr`. It gets you
from zero to your first spec-driven feature, then explains the mechanics, the model routing, the
self-learning options, and the team conventions.

- 📦 npm: <https://www.npmjs.com/package/@dzhechkov/skills-feature-adr>
- 📄 Full reference README: same npm page (this doc is the *team playbook*, not a reference dump)
- 🧭 Deep design: `node_modules/@dzhechkov/skills-feature-adr/templates/.claude/skills/feature-adr/SKILL.md` + its `references/` (or browse on unpkg: <https://unpkg.com/@dzhechkov/skills-feature-adr/templates/.claude/skills/feature-adr/SKILL.md>)

---

## TL;DR — what & why

An AI agent, left alone, jumps straight to code. Feature ADR forces the opposite: **spec first,
code last.** Each phase emits a durable, human-approved specification artifact (`00_…`–`09_…`), and
code is *generated from the frozen spec* — then verified back against it.

**Why your team should care:**
- The `features/<slug>/` folder **is the spec** — reviewable in a PR like code.
- Every design decision is captured as an **ADR** (with alternatives + trade-offs).
- Architecture diagrams + requirements become **living documentation** for free.
- The QE phase traces code **back to the requirements** (nothing ships uncovered).
- It's **right-sized**: a 3-file change doesn't get the full ceremony (Complexity Router).

---

## 1. Install (5 minutes)

```bash
# In your project root:
npx @dzhechkov/skills-feature-adr init --with-learning

# Then open Claude Code in the project and use /feature-adr
```

- `--with-learning` turns on reward learning (learns from your checkpoint feedback; plain JSON,
  **no database needed**). Skip it if you don't want learning, or if you already run
  `@dzhechkov/keysarium` (which bundles it — the installer auto-detects and skips to avoid dupes).
- Optional deeper QE (`--full-qe` / `--full-qe-extended`) needs the external `agentic-qe`:
  ```bash
  npm install -g agentic-qe && cd your-project && aqe init --auto
  ```

Verify: `npx @dzhechkov/skills-feature-adr doctor`.

---

## 2. Your first feature (a worked run)

In Claude Code:

```
/feature-adr Add user authentication with OAuth2 and JWT
```

What happens:

1. **Step 0 — Complexity Router** classifies the feature **S / M / L / XL** and picks which phases
   run. It stops at a checkpoint and shows you the tier + token/time estimate.
2. You approve (`ок`) or steer (`углуби X`, or free-text feedback). The agent proceeds **one phase
   at a time**, stopping after each for your approval.
3. Each phase writes its spec artifact into `features/add-user-auth/` (see §4).
4. Code lands in **Step 7** — after requirements, ADRs, architecture, and a plan are all approved.
5. **Step 8 (QE)** traces the code back to the requirements and closes a **zero-gap** check.

You stay in control the whole way — the agent never runs a large feature unattended.

**Resuming:** the `features/<slug>/` folder is the source of truth. `/feature-adr продолжи …`
picks up from the first unfinished phase.

---

## 3. How it works — Spec-Driven Development

Three ideas make this "spec-driven" and not "write a doc then wing it":

**a) The artifacts are one layered spec**, built top-down (intent → verified code):

| Artifact | Spec layer |
|----------|-----------|
| `00_complexity_assessment.md` | Scope — how big, which phases run |
| `01_requirements.md` | Behavioral — what must be true when done (SMART, testable) |
| `02_research.md` | Prior-art — patterns/analogues that constrain design |
| `03_adr/00N-*.md` | Decision — which option & why (≥2 alternatives + trade-offs) |
| `03.5_ideation_report.md` | Quality-risk — HTSM/SFDIPOT risks + GO / CONDITIONAL / NO-GO |
| `04_domain_model.md` | Domain — entities, aggregates, invariants (DDD) |
| `05_architecture.md` + `diagrams/` | Structural — C4 + sequence diagrams |
| `06_implementation_plan.md` | Task — SPARC-GOAP milestones the code must follow |
| `07_code_changes/` | The implementation (+ `change_manifest.md`) |
| `08_qe_report.md` / `09_fleet_qe_assessment.md` | Conformance — code vs spec, traceability, gaps |

**b) The spec is a typed contract carried forward.** Each phase's output is consumed by the next as
input, so a later phase can't contradict an earlier decision:
`{REQUIREMENTS} → {ADR_DECISIONS} → {ARCHITECTURE} → {IMPL_PLAN} → {CODE_CHANGES} → {QE_RESULTS}`.
(e.g. "architecture without an ADR" and "code without a plan" are blocked anti-patterns.)

**c) Every layer is gated** — a machine-checkable **promise tag** must be emitted before the next
phase starts, and a **human checkpoint** lets you approve/steer. You co-author and freeze the spec
one layer at a time.

**The loop closes:** `qe-requirements-validation` builds a traceability matrix and a gap-detection
loop must close with **zero remaining gaps** — a requirement with no code, or code with no
requirement, is caught by a gate, not in production.

---

## 4. Output structure (the deliverable)

```
features/<feature-slug>/
├── 00_complexity_assessment.md     ← Always
├── 01_requirements.md              ← Always
├── 02_research.md                  ← L/XL only
├── 03_adr/001-<decision>.md        ← M+ only
├── 03.5_ideation_report.md         ← M+ only
├── 04_domain_model.md              ← L/XL only
├── 05_architecture.md              ← M+ only
├── 06_implementation_plan.md       ← Always
├── 07_code_changes/change_manifest.md  ← Always (actual code lands in the repo)
├── 08_qe_report.md                 ← Always
├── 09_fleet_qe_assessment.md       ← L/XL only
├── diagrams/*.mermaid              ← M+ only
└── README.md                       ← Always (auto-generated summary)
```

---

## 5. Complexity tiers (right-sized ceremony)

| Tier | Scope | Active steps | Budget |
|------|-------|--------------|--------|
| **S** | 1–3 files, 1 domain | 0→1→6→7→8 (no ADR/DDD/architecture) | ~15 min |
| **M** | 4–10 files | 0→1→3→3.5→5→6→7→8 | ~45 min |
| **L** | 11–30 files | Full pipeline with parallelism | ~2 h |
| **XL** | 30+ files, cross-cutting | Full DAG + multi-agent swarm | ~4 h+ |

The router scores 6 dimensions 1–4 (files, domain breadth, integration points, risk/reversibility,
novelty, stakeholders). You can override the tier at Checkpoint 0.

---

## 6. Pipeline steps + model routing (incl. Fable)

| Step | Name | Tiers | Default model | Fable? |
|------|------|-------|---------------|:------:|
| 0 | Complexity Router | All | haiku | ✅ |
| 1 | Requirements | All | sonnet | ✅ |
| 2 | Research | L/XL | sonnet | ✅ |
| 3 | ADR + Shift-Left | M+ | opus | ⚠️ |
| 3.5 | QCSD Ideation Swarm | M+ | sonnet | ✅ |
| 4 | DDD | L/XL | opus | ⚠️ |
| 5 | Architecture | M+ | opus | ⚠️ |
| 6 | SPARC-GOAP Plan | All | sonnet | ✅ |
| 7 | Code | All | opus | ⚠️ |
| 8 | QE + Brutal Honesty | All | sonnet | ✅ |
| 9 | Fleet QE | L/XL | sonnet | ⚠️ |

**Routing rule:** phase difficulty → model tier (fast for classification, mid for drafting/QE, top
for load-bearing judgment). Models are **overridable defaults**.

- **✅ Fable-friendly** — draft/classify/synthesis phases that are checkpoint-gated and cheap to
  redo (0, 1, 2, 3.5, 6, 8). Low risk to try Fable here for speed/cost.
- **⚠️ Validate first** — load-bearing reasoning where a wrong call cascades (3 ADR, 4 DDD,
  5 Architecture, 7 Code, 9 Fleet QE). Keep the default unless you've A/B-validated Fable.

> **Decide with data, not vibes:** with `--with-learning` on, run 2–3 features with Fable on the ✅
> steps and compare reward patterns / rework counts vs your `sonnet` baseline. This table is a
> starting heuristic, not a benchmark — tune per project.

### Codex routing (optional — cross-model + limit resilience)

In the **ultracode workflow form**, feature-adr can hand steps to [Codex](https://developers.openai.com/codex)
— opt-in, always with a Claude fallback (never blocks). Two reasons teams turn it on:

1. **Cross-model planning** — plan Step 6 on Codex's top model: `planner: 'codex'`.
2. **Never stall on a rate limit** — the killer feature: `coder: 'codex-fallback'` +
   `qeReviewer: 'codex-fallback'`. Claude writes the code/tests as usual; but if a long L/XL run hits
   the **Claude Code session limit mid-Step-7/8**, the pipeline auto-retries that step on Codex
   (`auto` by default) instead of stalling — no restart, no lost work.

```bash
# one-time headless login (VPS, no browser):
codex login --device-auth        # approve the printed code+URL on your phone/laptop

# then, when launching a run, pass the knobs (or accept the interactive pre-flight offer):
#   planner: 'codex' | coder: 'codex-fallback' | qeReviewer: 'codex-fallback' | codexModel: 'auto'
```

Omit the knobs for the all-Claude default. Full reference: `.claude/rules/feature-adr-ultracode.md`.

---

## 7. QE modes cheat-sheet

| Mode | Flag | What you get | Requires |
|------|------|--------------|----------|
| Reference | *(none)* | 9 core QE skills, condensed | nothing (works out of the box) |
| Direct | `--full-qe` | full agentic-qe protocols for the 9 core | `agentic-qe` installed |
| Direct Extended | `--full-qe-extended` | + 6 skills (chaos, security, performance, mutation, TDD, prod-swarm) + up to 3 extra Fleet-QE agents | `agentic-qe` installed |

**When:** S/M → Reference. L → Reference or `--full-qe`. XL → `--full-qe`. XL + security/regulatory
(banking, ФЗ-152) → `--full-qe-extended`.

---

## 8. Self-learning layers (and whether they conflict)

`--full-qe-extended` does **not** turn on learning — QE depth and learning are orthogonal. There are
**three independent learning systems**; they do **not conflict** (isolated by storage / signal /
consumer):

| Layer | Turn on with | Learns from | Storage | Needs a DB? |
|-------|--------------|-------------|---------|-------------|
| **A — feature-adr reward** | `--with-learning` (or via keysarium) | your checkpoint responses (ок=1.0 / minor=0.7 / rework=0.3 / restart=0.0) | `.keysarium/memory/*.json` | **No** — JSON files |
| **B — agentic-qe** | comes with `agentic-qe`, via `aqe init` | QE task experiences (ReasoningBank + dream scheduler) | `.agentic-qe/memory.db` + `patterns.rvf` | self-contained |
| **C — dz harness** | `dz setup` / `dz teach` / `dz consolidate` / `dz recall` | your dz sessions | `.dz/` (+ optional `.dz/agentdb.db`) | **Optional** (vector tier only) |

**No conflict, but one rule:**
- Different files, signals, readers → no contention, no clobbering. All three at once is fine.
- Keysarium present → installer skips `--with-learning` (auto-dedup).
- **⚠️ One DB file per writer.** Layer C writes SQLite natively (better-sqlite3/WAL); agentic-qe can
  write via sql.js (whole-file overwrite). Pointing **both at the same `.db`** risks corruption.
  Defaults use different files, so you're safe out of the box — never hand-repoint one system's
  `AGENTDB_PATH` at the other's DB.

**Do you need agentdb?** For A and B — **no** (each has its own store). Only layer C's *vector* tier
uses agentdb, and even there it's optional (lexical recall works without it).

**Maintenance: consolidate periodically.** Hooks/events only *collect* raw data — distilling it into
reusable patterns is a separate consolidation step:
- **A** — nothing to do (consolidates implicitly at each checkpoint).
- **B** — agentic-qe queues raw experiences that only its consolidation pass distills. Skip it and a
  project can pile up thousands of unconsolidated experiences while per-prompt pattern injection
  returns zero useful patterns. Run `aqe learning consolidate` periodically (weekly, or after a
  heavy QE run); `aqe learning stats` shows the backlog.
- **C** — run `dz consolidate` (harvests session learnings into the lexical store, mirrored to the
  vector store if present); inspect with `dz recall`. Consolidation now runs automatically on
  **PreCompact** (Claude Code fires this before every context compaction — auto and manual
  `/compact`), so long/compacted sessions consolidate at each compaction boundary, not only at a
  clean end. It's **throttled** via a `.dz/.last-consolidate` marker (~15 min min between auto-runs).
  SessionEnd remains a secondary trigger for clean exits; manual `dz consolidate` works anytime.
  PreCompact is the primary reliable trigger (SessionEnd alone missed long/compacted/crashed
  sessions).

**Degradation symptom:** patterns stop improving while raw logs keep growing → you're collecting,
not distilling. Consolidate.

---

## 9. Team workflow conventions

- **Two PRs per non-trivial feature:**
  1. **Design PR** — merges `features/<slug>/` (requirements, ADRs, architecture, plan). Reviewed
     and approved *before* any code. This is the spec-review gate.
  2. **Implementation PR** — the actual code (Step 7 output) + the QE report as acceptance evidence.
- **ADRs are the decision log.** Require ≥2 alternatives + trade-offs (the pipeline enforces this).
- **The QE report (`08_…`) is your acceptance evidence** — attach/link it in the impl PR.
- **Artifacts live in `features/<slug>/`** (kebab-case, Latin, ≤40 chars, no dates/ticket numbers in
  the slug — put those inside the files).
- Treat the ADRs + architecture diagrams as **living docs** — they onboard the next engineer.

---

## 10. FAQ / troubleshooting

- **"It jumped to a wrong complexity tier."** Override at Checkpoint 0 (`это XL, не M`). The tier is
  fixed for the run — restart if scope changes drastically mid-pipeline.
- **"`--full-qe` did nothing extra."** `agentic-qe` isn't installed → it silently falls back to
  Reference mode with a warning. Install it (`npm i -g agentic-qe && aqe init --auto`).
- **"Do I have to use all 11 steps?"** No — the Complexity Router picks the active subset per tier.
- **"Where's the learning stored / how do I reset it?"** Layer A: delete `.keysarium/memory/`.
  B: `.agentic-qe/`. C: `.dz/`. They're independent.
- **"Can I change which model a step uses?"** Yes — the `Model` column is a default. See §6.

---

## Links

- **npm:** <https://www.npmjs.com/package/@dzhechkov/skills-feature-adr>
- **SDD section:** <https://www.npmjs.com/package/@dzhechkov/skills-feature-adr#spec-driven-development-sdd>
- **Self-Learning Layers:** <https://www.npmjs.com/package/@dzhechkov/skills-feature-adr#self-learning-layers>
- **Keysarium ecosystem:** <https://www.npmjs.com/package/@dzhechkov/keysarium>

*Shipped inside `@dzhechkov/skills-feature-adr` (`docs/team-onboarding.md`); source of truth mirrored at `docs/feature-adr-team-onboarding.md` in the monorepo. Facts are faithful to the feature-adr
`SKILL.md` (variable/tag names verbatim); the model/Fable table is a heuristic, not a benchmark.*
