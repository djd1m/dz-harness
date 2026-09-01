# @dzhechkov/skills-meta

The **canonical meta-skill pack** — the development-process skills, packaged as
[Agent Skills](https://agentskills.io) for distribution and cross-platform use.

The pack contains **21 development-process skills**:

| Skill | Files | Purpose |
|---|---|---|
| `feature-adr` | 34 | ADR-driven feature development pipeline (per-stage model routing incl. Codex, cross-model QE, usage-adaptive pre-emptive Codex switch at ≥70% Claude usage; amendment-Confirmation discipline, derived 🚦 Gates line, opt-in Step-10 Delivery Gate, Step-8 no-stubs gate — an unwaived `TODO`-class marker in the run's touched files is a HIGH gap; waivers require a reason) |
| `design-tokens` | 1 | DESIGN.md design-token contract — lint (WCAG AA) / diff / export Tailwind+DTCG (wraps `@google/design.md`) |
| `knowledge-extractor` | 10 | Harvest reusable knowledge from a project (`/harvest`) |
| `audit` | 4 | Whole-codebase 5-phase deep audit-and-act (recon → self-challenge → P0-P3 → approval → fix) |
| `goap-research-ed25519` | 6 | GOAP-planned research with ed25519-signed provenance |
| `design-thinking` | 5 | Stanford d.school 5-phase + validate product discovery |
| `agentshield-scan` | 4 | Security scanner for `.claude/` agent configurations |
| `adversarial-verifier` | 4 | Adversarial claim verification / paranoid fact-checking |
| `capture-adr` | 4 | Lightweight mid-conversation ADR capture (MADR 4.0) |
| `context-window-management` | 4 | Priority-based pruning + checkpoint/restore under context pressure |
| `external-comms-gate` | 4 | Screens outbound comms for confidential-info leaks |
| `reflection-loop` | 4 | Standalone critique → revise self-review cycle |
| `session-recap` | 1 | Mid-session status protocol: mandatory refresh, then exactly four points (the requester's words, proof rather than green tests, human-vs-machine blockers, and owner-tagged next steps), with no new work during the recap. Distinct from `dz recap`, the records-only calendar retrospective. |
| `skill-advisor` | 4 | Recommends which skills / presets / packages fit a task (meta-advisor) |
| `skill-crystallizer` | 4 | Auto-creates / combines / repairs skills from traces |
| `structured-reasoning` | 4 | Reasoning-strategy router (ToT / CoT / compression) |
| `understand-anything-bridge` | 4 | Bridge to the Understand-Anything knowledge-graph tooling |
| `explore` | 3 | Socratic task clarification |
| `problem-solver-enhanced` | 1 | First-principles + TRIZ + game-theory problem solving |
| `loop-plan-author` | 2 | Author agent LOOPS as typed `loop-plan/1` plans — four patterns, INV-1..8, claims/defers, USER regions, reading a run's trace. Packaged for Claude Code as `@dzhechkov/loop-designer-plugin`; `dz` AUTHORS, GATES and READS loops — it never RUNS one |
| `decision-mockups` | 10 | Owner-facing DECISION PAGE — plain-language explanation, browser-frame before/after mockups, clickable option forks and a copy-answers export that pastes back into the session, plus a zero-dependency deterministic gate (`references/check_page.py`, G0–G14) that refuses a page with a fake fork, an untokenised colour, an external resource or a leftover placeholder. **Vendored mirror** — the canon (and the test suite) lives in [`@dzhechkov/skills-decision-mockups`](https://www.npmjs.com/package/@dzhechkov/skills-decision-mockups); heal with `dz sync-canonical decision-mockups --from packages/@dzhechkov/skills-decision-mockups/decision-mockups`. **Honest scope:** the skill writes Russian (its gate hard-requires the export literals) |


> **`goap-research-ed25519` — self-learning (optional, since this release).** When
> [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) is on PATH, the
> bundled research skill recalls prior METHOD lessons at the start of an investigation and records new
> ones at four named moments. Without it the skill behaves exactly as before and says so once — it is
> detected, never required. Lessons go to a SEPARATE store (`<project>/.health-brain/.dz`) and never
> to the shared one; recall reads both, so engineering lessons transfer in and medical ones do not
> leave. A format check refuses identifier shapes (email, phone, record numbers) — it does NOT judge
> whether a lesson describes a method or a person, and says so: that judgement is the agent's, per
> the teach protocol. See `skills/goap-research-ed25519/SKILL.md`.

## Install

```bash
# Via dz CLI (recommended) — the current meta preset; session-recap wiring is deferred
dz init --target claude-code --preset meta

# Or pick specific skills
dz init --target claude-code --select audit,skill-advisor,feature-adr

# Or install the package directly
npm install @dzhechkov/skills-meta
```

## Canonical vs legacy — the coexistence model

Each canonical skill here is projected into the repository's `.claude/skills/<name>/` tree by the
root sync command. This is deliberate (ADR-002); `session-recap` follows the same projection path:

- `.claude/skills/` — the **legacy** tree Claude Code reads today. Preserved,
  untouched (ADR-001).
- `packages/@dzhechkov/skills-meta/` — the **canonical** source, ready to be
  published as an npm package and compiled to any platform.

During the coexistence period the two are kept in agreement by
`scripts/sync-canonical-to-legacy.mjs`, which compiles each canonical skill with
`@dzhechkov/adapter-claude` and compares the result to the legacy tree. While
the copies match, sync is a no-op — it never modifies a legacy skill.

## Status

`0.9.51` — carries the canonical `feature-adr` module with the new mandatory `Observability` section
in Step 5: how the shipped feature will be watched, with "nothing to observe" accepted as a complete
answer. See `@dzhechkov/skills-feature-adr@1.5.4`.


`0.9.50` — carries the canonical `feature-adr` skill with the C6 amendment-integrity fix (each
amendment is scoped to its own block instead of a three-line window, closing both a false refusal and
a false pass) and the Step-6 planner instruction that the amendment row is machine-read. See
`@dzhechkov/skills-feature-adr@1.5.3` for the full account.


`0.9.44` — a fix to the vendored `feature-adr` gate script, no new skills.

The bundled K2 plan-completeness gate now tells an **ABSENT** `00_complexity_assessment.md` from a
deliberate skip: a missing file is a WARNING that names the missing artifact, while a present file
carrying no acid table is an honest SKIP. Both used to report as a clean skip, so the acid check
silently switched itself off whenever Step 0 wrote nothing — MEASURED 2026-08-21, 66 of 199 features
carried that file and the last four in a row did not.

**`0.9.42`** — **adds `decision-mockups`** (19 → 20 skills): the owner-facing decision page — plain
language, options with a stated price and a named recommendation, and a copy-answers button whose
output is meant to be pasted straight back into a chat. Vendored from
`@dzhechkov/skills-decision-mockups` (the canonical home; heal this mirror with
`dz sync-canonical decision-mockups --from packages/@dzhechkov/skills-decision-mockups/decision-mockups`
— a bare sync resolves THIS pack as canonical and would overwrite the real home). Lands together with
`@dzhechkov/harness-presets@0.5.12`, which adds the same id to the `meta` preset.

`0.9.5` — part of the `extended-a-migration` feature. Additive
only: these are copies; the originals in `.claude/skills/` are never moved or
modified.

## How to use

Skills **auto-activate** — your agent loads a skill when your task matches its trigger phrases (defined in each skill's `SKILL.md` frontmatter). For example:

- "Audit the codebase" (or `/audit`) → `audit`
- "Which skill should I use for X?" → `skill-advisor`
- "Implement feature X" → `feature-adr`

To see a skill's exact triggers and assets: `dz info <skill-id>`. To find one: `dz registry search <term>`.

## Write discipline — why the writing steps now build a skeleton first

MEASURED in the field on 2026-08-19 and 2026-08-20, two independent runs of the canonical pipeline
against a ~130-file repository: the steps that must produce a document — Step 5 (Architecture) and
Step 6 (Plan) — **never reached a write**. 18 attempts, zero file writes in every one. They died in
the READING phase: a shell result returns, the agent thinks about its next move, stays silent past
the runtime's 180-second inactivity watchdog, and is killed. One run cost ~4M tokens and 1h54m.

The failure is **deterministic, not unlucky**: thinking time grows with accumulated history, so on a
large enough repository unbounded exploration guarantees the kill. And the cause was in the
instructions, not the runtime — every writing step said, in effect, *"read the code, write the
document"*, with no reading budget and no order of operations. An agent obeying literally reads
until it dies.

The owner's control experiment is the whole evidence base, and it is n=1: same slice, same inputs,
same model, ONE added paragraph about write discipline → a 10-section skeleton on disk 8 minutes in,
first attempt, after six consecutive deaths.

So every document-producing step now carries:

1. the FIRST file write happens within the first ~12 tool calls — a skeleton of section headings
   with one line of intent under each;
2. then fill it **one section per edit**, no edit longer than ~120 lines;
3. never go more than 2 minutes without a tool call;
4. when unsure whether to read more or to write — **write**.

**What this does not do**, stated plainly: it does not stop the deaths. The watchdog is unchanged.
It changes what survives one — previously nothing, now a skeleton on disk that the next attempt can
continue. The `~12` and `~120` are chosen parameters, not measured optima. Two possible regressions
were named by an independent reviewer and are **not measured**: an early skeleton may anchor a
structure chosen before understanding, and section-per-edit raises tool-call overhead.

Steps whose deliverable is a returned verdict rather than a document (the complexity router) are
deliberately excluded — "skeleton first" is nonsense there.

`0.9.45` — the bundled `feature-adr` Step-8 module now describes the amendment gate as the command
`dz amendment-check` instead of a judgement the reviewer is asked to make. Text only; no pipeline change.

## Signature scope (this release)

The pack's `.dz-manifest.json` now covers exactly the files this package SHIPS, as reported by
`npm pack` — not everything present in the author's working tree. Previously it signed files that
`files[]` excludes (typically `CHANGELOG.md`), so every recipient's verifier reported
`listed in the manifest but absent` and the pack read as TAMPERED. Re-signing at any earlier moment
could not fix that: those files were never in the tarball.

Nothing about the shipped content changed in this release — only what the signature describes.
