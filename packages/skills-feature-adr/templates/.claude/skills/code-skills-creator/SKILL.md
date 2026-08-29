---
name: code-skills-creator
description: |
  Use to produce a project-specific pair of code-quality skills:
  an Implementer (pre-implementation quality bar) and a Critic
  (post-implementation reviewer). The pair is grounded in the
  project's own recurring mistakes — extracted from a code audit
  and (when available) a session-history analysis — then generalized
  to principles so it catches the same class of defect in new shapes.

  Use when: starting in a new codebase where bad code is being
  redone multiple times and you want to install a reusable quality
  bar. Skip when: the project is too small for systemic patterns to
  emerge, or the user only wants a one-off review.

  Output: two SKILL.md files — the project-tuned pair written to
  `architecture/project-impl/SKILL.md` and `architecture/project-critic/SKILL.md`
  (the R5 role-scaffold paths, wired via `architecture/project-skills.json`),
  plus the audit artifacts they were derived from.

  Triggers: "сделай скилы implementer/critic", "build a quality bar
  pair", "create code-impl/code-critic skills for this project",
  "продьюсируй пару скилов", "генерализуй наши частые ошибки в
  скилы".
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, SendMessage, TaskCreate, TaskUpdate
---

# Code Skills Creator

This skill produces the **Implementer + Critic** skill pair for a
specific project. The pair is the project's reusable code-quality
bar — Implementer is read **before** writing code, Critic reviews the
diff **after** it is written and **before** done is claimed.

The two skills are asymmetric on purpose:
- **Implementer** is slightly more abstract: each rule names a class
  of mistake; concrete examples illustrate.
- **Critic** is slightly more concrete: each check has detection cues,
  explicit false-positive exceptions, and severity.

The output of this skill is principle-based. Without the
generalization step (Phase 6 below), drafts become bug-list linters
that miss the same defect class in a new shape.

---

## In the dz harness (grounding + base + output)

This skill is an **orchestrator**: it does not invent an audit engine or
draft the pair from a blank page. It **starts from the generic pair this
pack already ships** and specializes it with the project's own evidence.

- **Grounding (Phases 1–2):** prefer the harness's own signals over a
  from-scratch audit —
  - **`dz mr-rakes --json`** (recurring code rakes mined from the project's
    review corpus: past QE reports + MR/REVIEW files, anti-noise ≥2/≥3
    distinct sources) is the **primary** evidence base — it already IS a
    validated "recurring defects" list. The parallel-critic audit (Phase 1)
    is the fallback when there is no review corpus yet.
  - **`dz retro --json`** (per-session process rakes: claimed-done-without-
    verify, committed-without-verify, n-fix-cycles, ignored-correction)
    supplies the "failure modes" half — use it in place of a from-scratch
    session-analysis in Phase 2.
- **Base to specialize (Phase 4):** do NOT draft the pair from scratch.
  Start from the **bundled generic `code-impl` + `code-critic`** (this
  pack's **backend-service** defaults — async web / RDB / JWT-JWKS / k8s;
  the principles are portable, the examples assume that stack) and
  SPECIALIZE them: add the project's
  rakes as instances, its god-object freeze table, its reuse-map (from
  `AGENTS.md`), and its invariants/boundaries (from `architecture/vision.md`
  + `architecture/degradations.md`). The generic pair is the v0; the
  project's evidence turns it into v1, then Phase 6 generalizes to v2.
- **Output (Phase 8) — propose, never clobber:** write the project-tuned
  pair to **`architecture/project-critic/SKILL.md`** and
  **`architecture/project-impl/SKILL.md`** (the R5 role-scaffold paths), and
  point the `critic` / `impl-bar` roles in `architecture/project-skills.json`
  at them. `dz feature-adr-setup` augments the manifest (adds roles without
  clobbering others); `dz project-skills` is read-only — it resolves/reports
  the manifest so you can verify the wiring landed. This is
  **augment-never-clobber**: never overwrite the bundled generic base, and
  never overwrite an existing hand-edited project pair — and if `critic`/
  `impl-bar` are already set to other files, treat re-pointing them as a
  clobber too: present a diff and let the owner confirm.
- **Absent evidence ⇒ ship the generic pair unchanged.** Evidence is absent
  only when **BOTH** grounding sources come up empty: `dz mr-rakes` yields no
  confirmed rakes AND the Phase-1 parallel-critic audit (the fallback for a
  project with no review corpus) surfaces no recurring instances. In that case
  (a fresh or tiny project) do not invent mistakes — hand back the bundled
  generic `code-impl`/`code-critic` unchanged and say so. A bug-list built from
  zero evidence is worse than a clean generic bar.

The load-bearing invariant is unchanged and named for QE: **every rake is
generalized to a CLASS of defect (principle + semantic detection), never a
list of the specific past bugs** (Phase 6). A pair that is still a bug-list
linter after Phase 6 has failed its one job.

---

## Notes on portability

This skill was distilled from work on a Python/FastAPI/SQLAlchemy/
LangChain backend with non-English-speaking users; the examples
inherit that flavor. To run it on a different project:

- **Russian quotes** ("слишком конкретно", "не доверяй слепо",
  etc.) are illustrative phrasings of recurring user-feedback
  *patterns*, not literal triggers. The patterns themselves
  (over-specific drafts, uncritical validator trust) are
  language-neutral; substitute your own users' phrasings.
- **Stack-specific anti-pattern examples** (sync-in-async,
  middleware chains, Pydantic round-trips) are ONE project's
  defect catalogue. Your project has its own — use the audit
  (Phase 1) to surface them, do not transplant this list.
- **Required tools**: Agent, SendMessage, TaskCreate, TaskUpdate
  in `allowed-tools` are Claude-Code-specific. On a different
  harness (Codex CLI, Aider, Cursor), parallel sub-agents and
  inter-agent messaging may need a different mechanism. The
  *workflow* (parallel critics, validator role specialization,
  convergence tiering) is harness-neutral; only the implementation
  changes.

---

## When to use this skill

Use when **all** are true:
- The project has a non-trivial codebase (≥50 source files).
- Bad-code-needs-redoing is a felt pain — not a hypothetical concern.
- You have access to either the codebase, or the agent's session
  history, or both. (Both is best; either alone is workable.)

Skip when:
- Single-file experiment / prototype.
- The user explicitly asked for a one-off review or refactor — that's
  not what this builds.
- An adequate skill pair already exists; do not re-create from scratch.
  (Audit the existing one and edit if it's misaligned, but starting
  over is rarely the right move.)

---

## Output

The project-tuned pair, written to the R5 role-scaffold paths (propose-confirm; the `critic` / `impl-bar` roles in `architecture/project-skills.json` point here):

```
architecture/project-impl/SKILL.md      (the Implementer — impl-bar role)
architecture/project-critic/SKILL.md    (the Critic — critic role)
```

Plus the evidence base they are grounded in:

```
<project>/plan/code-critique/findings.md      (codebase audit)
<project>/plan/code-critique/sessions/analysis.md  (sessions, optional)
```

The evidence files are kept — both skills reference them so any
future maintainer can see *why* a rule exists.

The generated pair lives under `architecture/project-impl/` and
`architecture/project-critic/` (committed with the repo); the
`impl-bar`/`critic` roles in `architecture/project-skills.json` reference it,
so feature-adr folds it into the QE stage automatically. No symlink/deploy
step is part of this skill.

---

## Workflow at a glance

```
Phase 1: Codebase audit          → findings.md
Phase 2: Session analysis        → analysis.md  (via `dz retro --json`)
Phase 3: Design fix              → axis decision (pair, not mode)
Phase 4: v1 drafts               → instance-grounded drafts
Phase 5: Validate v1             → 4 parallel validators (V1-V4)
Phase 6: Generalize to v2        → principle-based rewrite
Phase 7: Validate v2             → 3 parallel validators (VV1-VV3)
Phase 8: Apply convergent fixes  → final SKILL.md files
```

The two heaviest phases (1 and 5/7) use **parallel sub-agents with
role specialization and cross-validation**. Convergence rule
(Phase 8): apply a finding only when ≥2 validators converge, OR
when a solo finding passes the user-goal-alignment filter.

---

## Phase 1: Codebase audit

Goal: produce `plan/code-critique/findings.md` — a catalogue of
recurring defects with severity, frequency, file-line examples, and
mitigation direction. This is the **fallback** grounding: run it in full
when `dz mr-rakes` returned no review corpus, or as a refinement pass over
the mr-rakes rakes when it did. When mr-rakes already supplied a validated
rake list, treat that as the evidence base and use this audit to add
file-line examples and severity the rakes lack.

### 1.0 Filesystem discovery (before partitioning)

Enumerate the services/packages from the **filesystem**, not from
memory. A re-run that starts from a remembered "4 backends" will miss
a service that was added since — e.g. a fifth backend like a
transitional bridge service — and that whole slice then
never gets audited.

```bash
ls -la <parent>/
for d in <parent>/*/; do
  [ -d "$d/.git" ] && echo "$d"
done
find <parent> -maxdepth 2 -name "pyproject.toml" -o -name "go.mod" \
  -o -name "package.json" 2>/dev/null
```

State the discovered list back and **confirm it with the user** —
they know about repos outside the parent directory you searched. Only
then partition. (This mirrors `agents-md-creator` Phase 1: discovery
is from the tree, confirmed with the user.)

### 1.1 Partition by area

From the confirmed discovery list, identify 6-10 logical areas (one
per repo, or per major package within a monorepo). Each area becomes
one critic-agent's slice.

For a monorepo: one slice per service (e.g., `backend-A`,
`backend-B`, `admin`, `frontend`). For a single repo: split by
top-level package (`api/`, `services/`, `db/`, `auth/`, …).

### 1.2 Spawn parallel critic agents

One agent per slice, in parallel. Each agent's prompt names:
- The slice path.
- The output path (`plan/code-critique/raw/<slice>.md`).
- The class of defects to look for: god-objects, copy-paste,
  defensive-swallowing, untyped data at boundaries, sync-in-async,
  hand-rolled retry, security gaps (SQL injection, auth shortcuts,
  cred leakage), TOCTOU, dead code, schema-integrity gaps.
- Required output: each finding with `file:line`, severity, why
  it's bad, mitigation direction. Include a "false positives
  filtered" section.
- Length budget: ~300-600 lines.
- The user's verbatim concerns (so the critic agent internalizes
  what the user feels is the real cost — usually some flavor of
  "code we redo multiple times", not "extra .md files lying
  around"). Quote 2-3 phrases verbatim.

Run them all in **one Agent invocation block** (parallel, not
serial — that's how you get throughput). Tell each agent: read,
do not edit. Read-only.

After all agents return: verify each wrote to the named output
path. If a slice returned garbage (cut-off mid-sentence, wrong
slice covered, no findings) — re-spawn just that slice with a
sharpened prompt. Do not proceed to Phase 1.3 with a hole in the
audit.

### 1.3 Validation pass (parallel)

Spawn ~3 validator agents, each covering 2-3 slices. Each
validator:
- Re-opens the actual source files mentioned in the raw findings.
- Verifies numerical claims (`86 methods`, not `95`; `19
  occurrences`, not `30+`).
- Marks findings as `CONFIRMED` / `PARTIAL` / `NEEDS_NUANCE` /
  `REFUTED`.

Without this pass, frequency claims drift up; the findings then
include exaggerated patterns that poison Implementer/Critic design.

### 1.4 Synthesize

One synthesizer agent (or you, directly) merges raw + validated
findings into a single `findings.md`:
- Patterns numbered (Pattern 1, Pattern 2, …).
- Each: severity, repos affected, frequency estimate (corrected by
  validators), why it's bad, examples (`file:line`), mitigation
  direction, validation note.
- Top: Executive Summary listing the 5-7 highest-pain points.
- Bottom: "False Positives Filtered" — what the audit considered
  but rejected.
- Header: a **measured-on date**. `findings.md` is a dated snapshot,
  not a standing fact — its numbers and instances reflect the tree as
  of that date. When the project later ships major surfaces, the file
  is partial until re-grounded; run the delta-audit refresh (see
  "Incremental refresh / delta-audit") rather than trusting stale
  numbers. Any consumer (the skills, a future maintainer) should read
  the date before relying on a count.

This `findings.md` is ground truth from this point on.

---

## Phase 2: Session analysis (recommended)

Goal: produce `plan/code-critique/sessions/analysis.md` — what
**actually** went wrong in agent-led development sessions over the
last N weeks.

This phase complements Phase 1: code audit reveals architectural
defects in the static codebase; session analysis reveals the
*failure modes* that produced them — done-without-validation, scope
creep, defensive overshoot, tier-shopping, etc.

If session history is unavailable (no Codex/Claude Code logs, or
fresh project) — skip Phase 2. Skill pair will still work, but the
"failure modes" half of the principles will be thinner.

### 2.1 Run `dz retro` (process rakes)

Run **`dz retro --json`** (per-session process rakes) over the recent sessions. It surfaces the recurring PROCESS failure modes (claimed-done-without-verify, committed-without-verify, n-fix-cycles, ignored-correction) as a validated, anti-noise list. Capture its JSON into `plan/code-critique/sessions/analysis.md`. If you want a richer narrative pass, also ask an agent to:
- Pull last 30 days of sessions (or the relevant time window).
- Group sessions by topic (skills/feature, search/index, refactor,
  review, etc.) — NOT randomly.
- Run a **cross-validation pass** (verify quotes against raw
  digests; mark `VERIFIED` / `PARAPHRASED` / `NOT FOUND` /
  `PARTIAL`).
- Run an **exaggeration check** — dedicated agents whose job is to
  *deflate* overstated frequency claims. "12 явных кейсов" often
  reduces to "3-4 episodes" once duplicates and paraphrased
  reactions are counted once.

### 2.2 (Optional) Time-persistence check

If the session window is short (1 month), run a **second** analysis
on an earlier window (months 2-3) to verify patterns hold over
time. Patterns that are real persist; patterns over-fit to one
month evaporate.

---

## Phase 3: Design fix — axis decision

Before drafting, fix the split axis. The default mistake is to
split by **task type** (investigate / prod-touching / UI). The
correct axis is **checkpoint**:

- **Implementer** — read **before** writing non-trivial code.
- **Critic** — invoked **after** the diff exists, before "done".

Why: a Critic that's the same agent's working memory at the same
moment as the Implementer doesn't add a checkpoint; it adds noise.
Separate agents reading different sources at different moments
catches things that working memory has rationalized.

If the user proposes a different axis (mode/task-type), surface
this distinction and confirm. Do not silently re-split.

### 3.1 What goes in which skill

- Hard rules (god-object, no-internal-S2S-auth, no-blocking-on-async,
  …) live in the **Implementer**, restated in the **Critic** as
  detection cues.
- Anti-patterns (broad-except swallow, hand-rolled retry, untyped
  boundaries, …) — Implementer states the principle (P-numbered);
  Critic gives detection cues + FP exceptions (AP-numbered).
- Decision gates (3-question gates: env var, defensive check, S2S
  auth, abstraction) live in the **Implementer**.
- Severity, output structure, calibration steps live in the
  **Critic**.
- God-object **off-limits table** is duplicated by reference: in
  Implementer it's "Section A of Critic"; in Critic it's the
  authoritative table. Single source.

---

## Phase 4: v1 drafts

**Start from the bundled generic pair, do not draft from a blank page.**
Copy this pack's generic `code-impl` + `code-critic` as the v0 skeleton
(they already carry the god-object rule, the anti-pattern principle set,
severity discipline, and the workflow) — then SPECIALIZE with the project's
evidence. The evidence base is, in priority order:
1. the `dz mr-rakes` rakes (primary), else
2. the Phase-1 `plan/code-critique/findings.md` audit (fallback, when there
   was no review corpus).

**Early exit:** if BOTH are empty (no confirmed rakes AND no audit findings),
do NOT specialize and do NOT invent instances — ship the bundled generic pair
unchanged (per the absent-evidence rule above) and stop here.

Otherwise SPECIALIZE: attach each rake/finding as an instance under the
matching principle, add the project's god-object freeze table (measured), its
reuse-map (from `AGENTS.md`), and its invariants/boundaries (from
`architecture/vision.md` **and** `architecture/degradations.md` — the accepted
degradations tell the Critic which "defects" are sanctioned trade-offs, not
findings). A rake that matches no existing principle earns a new one; the rest
just add instances. Save the result as `Implementer v1` and `Critic v1` under
`plan/code-critique/skills-draft/`. v1 is **instance-grounded**: each
specialized rule cites concrete files/lines from the evidence, with concrete
numbers (LOC, method counts, occurrences).

Note on scope: the specialized examples below assume a **backend-service**
stack (async web, RDB, JWKS/JWT auth, k8s/Helm, schema migrations). That is
the class this factory was tuned on — the *principles* are portable, but a
project on a different stack must translate the examples, and Phase 6's
generalization is what makes that translation possible.

This is intentional. v1 is too specific on purpose — it makes the
generalization step (Phase 6) audit-able.

### 4.1 Implementer v1 must contain

- **Top hard rules** (3-5) — restated at the top so the agent reads
  them even if it skims.
- **Stack realities** — what's *actually* true in this project
  (sync vs async, version of frameworks, request-scoping, schema
  migration discipline). Generic best-practices that don't apply
  to this stack are documented as **does-not-apply**.
- **Project invariants** — facts true in the product (a user has
  groups; a context has repos; sessions are request-scoped; etc.)
  that obviate defensive branches.
- **God-object hard rule** with the off-limits file table.
- **Reuse map** — for each canonical implementation in the
  codebase (HTTP retry, JWKS cache, git sync, agent auth, run
  persistence, error rendering, TTL cache), point at the canonical
  path and forbid parallel implementations.
- **Security invariants** — typically 4-6 numbered (e.g., SQL
  parameterization, no auth-shortcut on env flag, security caches
  with TTL+lock+negative, no full-credentials in logs, per-key
  serialization). Project-specific: surface invariants that match
  the project's *actual* threat model, not generic OWASP.
- **Anti-pattern principles** — typically 15-25 numbered (P1, P2,
  …) including:
  - Defensive exception swallowing.
  - Hand-rolled retry instead of canonical.
  - Blocking I/O on async paths.
  - Untyped data structures across boundaries.
  - Per-endpoint plumbing duplication.
  - Sync↔async or near-twin duplication.
  - Process-global mutation in request path.
  - Fire-and-forget without strong reference.
  - TOCTOU lock release before background work.
  - DB columns without contract (CHECK / FK ondelete / UNIQUE).
  - Defensive overshoot (gate/knob/token without threat model).
  - State/abstraction duplicating existing info ("bandaid").
  - Edge-case blindness sweep (empty/large/concurrent/delete/
    restart/version-skew).
  - Defensive branches against documented invariants.
  - Manual error rendering (`repr(e)`/`str(exc)` to clients).
  - Stale-spec / phasing as bandaid.
  - Cargo cult.
  - **Anti-drift** — major invariants pinned, everything else
    decided by agent without asking. Critical principle; without
    it, agents either ask too much or silently substitute the
    user's terms.
  - Performance — loops over external calls.
- **Decision discipline** — the 3-question gates (new env var,
  new defensive check, new S2S auth, new abstraction, reuse vs
  write-new).
- **Production safety** — read-only inventory before action, Helm/
  overlay sync when chart changes, Alembic-only migrations with
  zero-downtime ordering, dev-defaults must not reach prod.
- **Done-ness criteria** — validator on FINAL code, artefact
  reproduction, sibling sweep, multi-repo coordination, no silent
  deferrals.
- **Workflow** — the sequence of steps the implementer follows.

### 4.2 Critic v1 must contain

- **Detection style** preface — "we look for the principle
  violated, in any syntactic shape; same defect, different shape =
  same concern reported once".
- **Output discipline** — severity ladder (BLOCKING / HIGH /
  MEDIUM / LOW), no padding, suggestions-only at the bottom.
- **Output structure** in fixed order (god-object → security →
  architectural → anti-patterns → type/contract → edge-case →
  test → process → prod-safety → suggestions → skipped-checks).
- **Inputs to gather first** — preface naming what the Critic
  needs before reviewing: the diff against base branch, the area
  touched (which repo/package), recent conversation context (was
  anything deferred? was a phasing argument made?). If the diff
  is huge, partition by file/category and proceed — do not skip
  files.
- **Section A: God-object growth** with off-limits table +
  modification-vs-new-code distinction + FP exceptions
  (decomposition is good, do not flag).
- **Section B: Security violations** (B1-B6).
- **Section C: Architectural concerns** (C1-C11-ish).
- **Section D: Anti-patterns** (AP1-AP13-ish), each with detection
  cue + FP exception + severity.
- **Section E: Type/contract issues**.
- **Section F: Edge-case sweep**.
- **Section G: Test quality**.
- **Section H: Process / done-ness gaps** (including major-invariant
  drift).
- **Section I: Production safety**.
- **Section J: Suggestions only**.
- **Section K: Skipped checks** (transparency).
- **Per-invocation calibration** — 6-question self-check before
  returning.
- **What the Critic does NOT do** — does not run tests, does not
  edit, does not pad.

---

## Phase 5: Validate v1 — 4 parallel validators

Spawn 4 validators **in parallel**, in one Agent block. Each
validator gets the SAME primary sources (Implementer v1, Critic v1,
findings.md, analysis.md, the user's verbatim quoted constraints)
but a DIFFERENT lens. Output: each writes a structured report to
`plan/code-critique/validation/`.

### V1 — Alignment with audit (completeness)

Lens: every meaningful pattern in `findings.md` and `analysis.md` is
either represented in the skill pair or explicitly skipped with
reason. God-object table is correct (matches measured LOC).
Reuse-map is correct (canonical paths exist).

Output: a coverage matrix (pattern × principle) marking
`COVERED` / `MENTIONED` / `MISSING`. Missing patterns flagged for
addition.

### V2 — Adversarial FP/FN

Lens: for each Critic check, construct **realistic false-positive
scenarios** (legitimate code that shape-matches the cue but is
correct). Then inversely scan `findings.md` for **false negatives**
(real defects the Critic would miss).

Output: per-check `FP_RISK` (none / low / medium / high) + list of
shape-matched-but-legitimate cases that need to be in the FP-
exception list.

### V3 — Semantic discipline + readability

Lens: every place the draft says "regex X" / "grep Y" / "look for
exact token Z" is wrong — describe **what** to find (the intent),
not **how**. Modern agents pick the mechanism. Mechanical
instructions box them into brittle detection.

Output: list of mechanical instructions found, each with a
suggested semantic rewrite.

### V4 — Implementer↔Critic coherence + retro-validation

Lens: build a mapping matrix (Implementer principle ↔ Critic
section). Every Implementer principle should map to a Critic
section, and vice versa. Then take 3-5 actual session digests
(from Phase 2 if available, otherwise pick a recent diff and
"play it back") and ask: would v1, applied at the right moment,
have prevented the user's push-back?

Output: matrix + retro-validation table.

### Cross-validation rule (after V1-V4 return)

Build a convergence table:
- A finding raised by ≥2 validators → **TRUST**, apply.
- A finding raised by 1 validator + matching a verbatim user
  concern → **TRUST**, apply.
- A solo finding without user-concern match → **FILTER** through:
  does it align with the user's stated goal? If yes, apply with
  caveat; if no, skip.

Skipped findings are listed in the validation summary so they're
auditable later.

---

## Phase 6: Generalize to v2

This is the **critical** phase and runs **by default** — not
reactively. Without it, the skills are bug-list linters that miss
the same defect class in a new syntactic shape.

The user's late signal ("слишком конкретно" / "tier 1 это очень
конкретные ошибки") is the symptom — by the time you hear it, you
have already shipped a v1 the user has read and disliked. Run
Phase 6 *before* presenting the skills as ready, treating v1 as a
deliberate intermediate, not a candidate for delivery.

### 6.1 What changes

- Each rule is rewritten as **a class of mistake**. Concrete bugs
  from `findings.md` become **illustrations**, not the entire
  detection surface.
- Mechanical detection cues become semantic. "regex `_API_KEY`"
  becomes "any new identifier suggesting in-cluster service-to-
  service authentication".
- The asymmetry rule: Implementer rewords toward principle;
  Critic keeps detection cues but adds `FP exception` lines that
  state the legitimate variant.
- Examples are *named* but not enumerated exhaustively. "There
  are ~280 occurrences in <repo>" → fine; "occurrences are at
  lines 42, 88, 152, 231, …" → not fine.
- Padding is removed. Low-severity items are demoted or dropped.

### 6.2 What stays

- All hard rules.
- The off-limits god-object table (concrete data, not generalizable
  away).
- The reuse map (canonical implementations are project-specific
  facts).
- Severity discipline.
- Workflow.

### 6.3 Common pitfalls in v2

- **Stripping examples to zero.** Principles without any example
  are abstract; agents can't recognize them in context. Keep 1-2
  examples per principle.
- **Over-padding "FP exception" with cases that are actually
  defects.** "FP exception: any case where the developer says
  it's OK" — that's not an exception, that's a bypass.
- **Procedural ceremony.** "Then the implementer invokes the
  critic skill" — orchestration belongs in workflow, not in skill
  body. Remove.
- **Replacing concrete file:line refs in the off-limits table
  with abstract phrasing.** The table is supposed to be data.
  Keep it as data.

Save v2 as `IMPLEMENTER_v2.md` and `CRITIC_v2.md` next to v1.

---

## Phase 7: Validate v2 — 3 parallel validators

Fresh validators (do not re-use V1-V4 even if conceptually
similar — fresh eyes catch more).

### VV1 — Generalization quality

Lens: score each rule on instance-grade vs principle-grade. A
principle states the *class*; an instance states a specific bug.
Rules that are still instance-grade in v2 are flagged for further
generalization.

Output: per-rule score (`principle` / `partial` / `instance`).

### VV2 — Retro-validation

Lens: pick 5-7 recent push-back episodes from `analysis.md` (or
recent commits). For each: "applied at the right moment, would
v2 have prevented this push-back?" Yes / partial / no.

Output: episode × verdict table.

### VV3 — Prod-ship readiness

Lens: are the skills **sufficient** (cover the real failure
classes) AND **necessary** (every section is load-bearing —
removing it would let real defects through)?

Output: per-section `sufficient` / `necessary` / both / neither.
Sections that are neither are candidates for removal.

### Cross-validation again

Same convergence rule (Phase 5). Apply convergent fixes.

---

## Phase 8: Apply + finalize (augment, never clobber)

Write v2 from the draft folder to the R5 role-scaffold paths:

```
architecture/project-impl/SKILL.md    ← from IMPLEMENTER_v2.md
architecture/project-critic/SKILL.md  ← from CRITIC_v2.md
```

**This is augment-never-clobber, not a blind move:**

1. **Check for an existing pair first.** If either destination already
   exists, it may be a hand-edited project pair — do NOT overwrite it.
   Render a diff (draft v2 vs the file on disk) and let the owner confirm
   before writing. Only a clean (absent) destination is written directly.
2. **Never touch the bundled generic base.** The pack's generic
   `code-impl`/`code-critic` are the v0 seed; they are read, never written.
3. **Wire the roles.** Point `impl-bar` → `architecture/project-impl/SKILL.md`
   and `critic` → `architecture/project-critic/SKILL.md` in
   `architecture/project-skills.json`. Use `dz feature-adr-setup` to augment
   the manifest (it adds roles without clobbering others); if `critic`/
   `impl-bar` already point elsewhere, re-pointing them is a clobber — diff and
   confirm with the owner first. Then run the read-only `dz project-skills` to
   verify the wiring resolved. Without this step the pair is written but
   feature-adr's QE stage never loads it.

The skills reference each other (Implementer mentions "Section A
of Critic carries the authoritative god-object table"; Critic
mentions "Implementer 7.2 carries the three-question gate"). Make
sure cross-refs match the actual section numbers in the final v2.

Update `findings.md` and `analysis.md` paths in the skills'
references section.

---

## Incremental refresh / delta-audit (an existing pair, new surfaces)

When the skill pair already exists and the project has shipped a
handful of **new surfaces** (e.g. a new external write-side integration,
a source-sync service, a search subsystem) — do NOT re-run the full eight-phase
pipeline. The expensive part is the v1→v2 generalization (Phases
4-7); for an **additive** delta it does not need to re-run, because
the existing principles already generalize and the new surfaces only
add instances or, at most, one new pattern.

Run the delta instead:

1. **Scope a delta audit to the new surfaces only.** Spawn critic
   agent(s) over just the new code (the new services / packages /
   write-paths), not the whole tree. Same prompt shape as Phase 1.2,
   narrowed to the delta.
2. **Append new Patterns to `findings.md`.** Add any genuinely-new
   defect pattern as the next numbered Pattern; attach new `file:line`
   instances to existing Patterns where the surface just adds another
   occurrence. Do not rewrite the existing findings.
3. **Re-measure the off-limits god-object table.** New large files in
   the delta cross the freeze threshold — add their rows; update LOC
   on any existing entry that grew. This table is data and must stay
   current (it is duplicated by reference: authoritative in the
   Critic, pointed at from the Implementer).
4. **Re-run only the factual + FP lenses on the touched sections.** The
   **V1 audit-alignment lens** (numbers/paths in the new rows and instances
   are real) and the **V2 adversarial FP/FN lens** (any new detection cue
   must carry its FP exception) are the two that matter for a delta. Skip the
   generalization-quality (VV1) and retro (VV2) lenses unless the delta
   introduced a brand-new *class* of mistake (then it earns a real v1→v2
   pass for that one rule).
5. **Apply convergent fixes, then update the pair the same way Phase 8
   does — augment, never clobber** (existence check + diff + owner confirm
   before overwriting an existing `architecture/project-*/SKILL.md`).

If the delta is not additive — it contradicts an existing principle,
or the project's stack/threat-model shifted — that is not a delta;
re-run the relevant full phases.

---

## Validator prompt template

For every parallel validator (Phase 5 or 7), the prompt has the
same shape:

1. **Context** (1 paragraph). What the skills are. What pain they
   address. Why this validation exists.
2. **Files to read** (explicit absolute paths). Primary
   (Implementer/Critic v1 or v2) + supplementary (`findings.md`,
   `analysis.md`, optional samples of recent diffs / sessions).
3. **The user's verbatim constraints**. Quoted phrases — Russian
   or English, in the original language — so validators internalize
   intent. Examples: "не давай ложных exaggerated замечаний",
   "tier 1 слишком конкретно", "не доверяй слепо одному агенту".
4. **Your role** (the lens). One paragraph naming the specific
   slice this validator owns.
5. **Concrete sub-tasks**, numbered. "Build a coverage matrix",
   "Construct 3 realistic FP scenarios per check", "Score each
   rule on principle-vs-instance scale", etc. Specific is
   non-optional.
6. **Output format** — what file to write, what structure the
   report has.
7. **What you do NOT do** — typically: do not edit the skills, do
   not enumerate every defect (focus on patterns), do not pad.

Keep the prompt under ~3K tokens. If it grows, the validator drifts.

---

## Cross-validation tiering rule

After all validators in a round return:

| Signal | Action |
|---|---|
| ≥2 validators converge on a finding | TRUST → apply |
| 1 validator + matches user verbatim concern | TRUST → apply |
| 1 validator, no user concern, aligns with stated goal | APPLY with caveat |
| 1 validator, no user concern, no goal-alignment | SKIP, document why |
| Validator surfaces inflated frequency claim | DEFLATE before applying |
| Fewer validators returned than spawned | If 1 is missing → treat as no-vote, proceed; if >half missing → re-spawn the missing role(s) before applying anything (single-perspective application is the failure mode tiering exists to prevent) |
| Validators contradict each other on the same finding | Surface to user; do not auto-apply either |

This tiering prevents two failure modes:
- **Trust collapse.** Solo findings that contradict each other →
  apply both → contradictory rules. Tiering forces
  cross-validation.
- **Over-application.** A single anxious validator can over-
  populate the report. Filter through user-goal alignment.

---

## Asymmetry rule (the principle)

The Implementer is **slightly more abstract** than the Critic.
- Implementer: "Do not catch broad exceptions and silently return
  a default." (principle)
- Critic: "AP1: try/except where the except branch logs at warning
  and returns None. FP exception: optional-infrastructure
  unavailability with narrow exception class." (principle +
  detection cue + FP exception)

Why: at write-time the developer needs to know the *class* of
mistake to avoid. At review-time the reviewer needs the *cue* to
spot a violation. Symmetric skills duplicate each other and force
the developer to scan two long lists.

---

## Anti-padding rule

A rule earns its place by being **load-bearing**: removing it
would let a real defect class through. Decorative rules
(stylistic preferences, generic best-practices not tied to this
stack) are not load-bearing — drop them.

The test: after v2, can you point at every rule and name the
defect class it prevents? If no, the rule is padding.

---

## Semantic-over-mechanical rule

Never instruct the Critic in mechanical terms ("run regex X",
"grep for token Y", "scan for the literal string Z"). Modern
agents are competent at picking *how* to detect once they know
*what* to detect.

- ❌ "Search for `except Exception:` followed by `pass`."
- ✅ "Catching broad exceptions and converting failure into a
  silent default. Detect: any try/except where the except branch
  either passes, logs without diagnostic context, or returns a
  fallback indistinguishable from real success — regardless of
  syntactic shape."

This was the single most-corrected category in the original
project. Mechanical cues miss the same defect in a new syntactic
form (recursion instead of loop; wrapper helper instead of inline
try; broad `BaseException` instead of `Exception`).

---

## Pitfalls catalogue

Failure modes the workflow must prevent (each was hit in the
original project):

1. **Splitting by mode/task-type instead of checkpoint.** The
   axis is *when* (pre-impl, post-impl), not *what kind of work*.
2. **Bug-list-as-skill.** Skipping the v1→v2 generalization step.
   Result: linter that misses the same defect in new shapes.
2a. **Producing process-hygiene rules instead of code-quality
    rules.** "Don't leave extra .md files", "tidy git status
    before commit", "don't break the dev-server" — these are
    minor in time-cost. The real cost is bad code that gets
    redone multiple times. The skill pair must focus on
    architectural and security defects, not tidiness.
3. **Symmetric Implementer/Critic.** Both at the same level of
   abstraction → duplication → user reads twice.
4. **Mechanical instructions** ("regex / grep / specific token").
   Replace with semantic intent.
5. **Padding low-severity items as if HIGH.** Process hygiene
   crowds out architectural concerns. Use severity discipline.
6. **Procedural ceremony** ("invoke critic skill", "fill out
   checklist"). Content problems are not fixed by procedure-
   in-skill.
7. **Bureaucratic spec-fitness gates** ("write acceptance criteria
   for every task"). Replace with anti-drift principle (ask only
   on **major** invariant changes).
8. **God-object rule stated imprecisely**, so 1-2-line fixes get
   flagged as god-object growth. Rule needs precise
   modification-vs-new-code distinction with examples.
9. **FP exceptions stated as instances**, not principles.
   "FP exception: file X is allowed" → not generalizable. Use:
   "FP exception: optional-infrastructure unavailability,
   explicit narrow exception class".
10. **Hallucinated quotes/numbers in analysis.** Cross-validate
    against raw evidence with `VERIFIED` / `PARAPHRASED` /
    `NOT FOUND` markings. Always.
11. **Over-fitting to one cohort of sessions.** Run a time-
    persistence check on an earlier window if available.
12. **Trusting a single validator.** Always parallel + convergence
    rule.
13. **Solo findings applied without filter.** Filter through user-
    goal alignment.
14. **Validators returning content as text instead of writing
    files.** Specify output paths in the prompt; verify they wrote
    where instructed.
15. **Single-pass validation.** Always one round on v1; if the
    v1→v2 reframe happens (it usually does), a fresh round on v2
    with different lenses.
16. **Skill self-invocation in skill body.** "Now invoke the
    critic skill" — orchestration is the parent's job.
17. **Stripping the off-limits god-object table to "general
    guidance".** The table is data; data is concrete; concrete
    survives the v1→v2 generalization unchanged.
18. **Ignoring user verbatim corrections.** When the user says
    "слишком конкретно", that is the trigger for v1→v2; do not
    interpret it as a polish request.

---

## Calibration before finalizing

Before declaring the skill pair done, walk this checklist:

- [ ] Both skills cite their evidence base (`findings.md`,
  `analysis.md`).
- [ ] Cross-references between the two skills resolve (Section
  numbers match).
- [ ] God-object off-limits table is in **one** skill (Critic),
  referenced from the other (Implementer).
- [ ] Every Critic check has either a `FP exception` line or an
  explicit `no FP exception by design` justification.
- [ ] Severity ladder is honest — every BLOCKING corresponds to
  a hard rule.
- [ ] No rule says "regex" / "grep" / "look for the literal
  string".
- [ ] No procedural ceremony in skill body.
- [ ] Anti-drift principle is in Implementer (P19-ish), not
  spec-fitness gate.
- [ ] Final word count: ~600-900 lines per skill is healthy.
  >1500 is bloat; <400 is thin.

---

## References

- Evidence base (primary): `dz mr-rakes --json` (recurring code rakes) +
  `dz retro --json` (per-session process rakes).
- Base to specialize: the bundled generic `code-impl` + `code-critic` skills
  in this pack — a v2-quality example of the target shape.
- Boundaries/invariants: `architecture/vision.md` + `architecture/degradations.md`.
- Audit artifacts (when the parallel-critic fallback runs):
  `plan/code-critique/findings.md` (codebase audit) +
  `plan/code-critique/sessions/analysis.md` (session history if available).
