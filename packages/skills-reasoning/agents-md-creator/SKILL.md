---
name: agents-md-creator
description: |
  Use to produce per-repository AGENTS.md files for a multi-repo
  project. AGENTS.md is the always-on architectural skeleton an
  AI agent reads on every session: dependency direction, package
  responsibilities (allowed / not allowed), forbidden file names,
  god-object freeze table with measured numbers, repo invariants,
  refactoring discipline, and a change checklist.

  AGENTS.md is NOT the quality bar — that lives in on-demand skills
  (e.g., code-impl, code-critic). This skill makes the two layers
  cooperate: AGENTS.md is the always-on skeleton, skills carry
  detail. AGENTS.md must not duplicate skill content.

  Use when: a project has multiple repos / services / packages and
  AI agents waste tokens re-discovering "where does this code go"
  every session, OR existing CLAUDE.md/AGENTS.md files are vague
  prose that doesn't constrain agents. Skip when: a single small
  repo (one CLAUDE.md is enough), or the existing AGENTS.md is
  already strong and just needs minor edits.

  Output: one AGENTS.md per repo, plus a parent index linking them.
  Files are committed individually in their owning repos.

  Triggers: "сделай agents.md для бекендов", "build per-repo
  AGENTS.md", "напиши AGENTS.md по тому же пайплайну",
  "проиндексируй agents.md".
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, Agent, SendMessage, TaskCreate, TaskUpdate
---

# AGENTS.md Creator

This skill produces **per-repo AGENTS.md files** for a multi-repo
project. The output is the always-on architectural skeleton an AI
agent reads on every session.

The skill is **NOT** for quality-bar content (anti-patterns,
detection cues, decision gates). That belongs in on-demand skills
(code-impl, code-critic). AGENTS.md and skills are layered:

- **AGENTS.md** = always-on skeleton: dependency direction, package
  layout, forbidden names, god-object table, invariants, change
  checklist. Read on every session.
- **Skills** = on-demand detail: anti-pattern principles, detection
  cues, decision gates, FP exceptions. Loaded when relevant.

If you find yourself writing detection cues or anti-pattern lists
in AGENTS.md, stop — that goes in a skill.

---

## Notes on portability

This skill was developed on a Python/FastAPI/SQLAlchemy/Go-
adjacent monorepo with Russian-speaking users; the examples
inherit that flavor. To run it on a different project:

- **Measurement commands in Phase 3** are stack-specific examples
  (Python/Go/TypeScript). For other languages, adapt the
  `find`/`grep` patterns to the language's syntax. The
  measurement (LOC, method count, route count) is the goal; the
  command is the means.
- **Russian quotes** in validator templates are illustrative
  phrasings — substitute your own users' verbatim concerns
  about quality and factual accuracy.
- **Required tools**: Agent, SendMessage, TaskCreate, TaskUpdate
  in `allowed-tools` are Claude-Code-specific. On a different
  harness (Codex CLI, Aider, Cursor), parallel sub-agents may
  need a different mechanism. The *workflow* (parallel
  analyzers, two-validator-per-file, factual claims verification)
  is harness-neutral; only the implementation changes.
- **Reference quality bar** (Phase 2) — pick a strong AGENTS.md
  from your own ecosystem. Do not import this project's
  AGENTS.md files as the bar — they encode this product's
  invariants (Keycloak SSO, no-internal-S2S-auth, Alembic-only).
- **File-writing mechanics** — the `Read`-before-`Edit` requirement,
  the "parent Writes, sub-agent returns text" hand-off (Phase 4/5),
  and the two-step `mv` for the case-insensitive (HFS+/APFS)
  `agents.md`↔`AGENTS.md` collision (Phase 5, Pitfalls #11/#12) are
  **harness- and filesystem-specific mechanics**, not part of the
  method. On a different harness or a case-sensitive filesystem,
  drop or replace them; the goal (a written file at `<repo>/AGENTS.md`
  with no accidental no-op) is what carries over.

---

## When to use this skill

Use when **any** are true:
- Project has 3+ repos / services and the user feels agents waste
  tokens re-discovering "where does this go" every session.
- Existing CLAUDE.md / AGENTS.md files are vague prose ("keep
  handlers thin", "follow SOLID") that don't actually constrain
  agents.
- The user has named a quality bar (e.g., a Go reference
  AGENTS.md from another project) and wants the same level of
  concreteness here.
- Skills (code-impl, code-critic) already exist and you need the
  always-on layer that complements them.

Skip when:
- Single small repo. One CLAUDE.md at the root is enough.
- Existing AGENTS.md is already strong (concrete, dependency-
  direction stated, allowed/not-allowed per package, change
  checklist). Minor edits via Edit are better than a re-pipeline.

---

## Output

One AGENTS.md per repo, at each repo root:

```
<repo-A>/AGENTS.md
<repo-B>/AGENTS.md
<repo-C>/AGENTS.md
```

Plus a parent index linking them (if a parent monorepo or workspace
directory exists):

```
<parent>/AGENTS.md   ← index, lists each repo and its AGENTS.md
```

Length budget per file: **200-400 lines**. Below 200 = too thin to
constrain; above 400 = bloat (move detail into skills).

---

## Workflow at a glance

```
Phase 1: Discovery        → enumerate ALL repos from filesystem
Phase 2: Quality bar      → identify reference AGENTS.md to match
Phase 3: Per-repo measure → LOC, method counts, route counts
Phase 4: Parallel analyzers → one per repo, in parallel
Phase 5: Synthesize       → assistant writes each AGENTS.md
Phase 6: Parallel validate → quality + factual claims
Phase 7: Apply convergent fixes
Phase 8: Index + commit
```

The two heaviest phases (4 and 6) use **parallel sub-agents**.
Convergence rule: a finding is `Tier 1` (apply) when it is
verified by ≥2 validators OR is an objective fact (a number, a
path, a line reference). Quality-only feedback without convergence
is `Tier 2` (apply with judgment).

---

## Phase 1: Discovery

**Critical rule:** Enumerate repos from the filesystem. Do not
trust a remembered list — that is the failure mode that caused a
backend to be skipped in the original project.

### 1.1 Find every backend / service / package

For a monorepo with a parent directory:

```bash
ls -la <parent>/
find <parent> -maxdepth 2 -name "AGENTS.md" -o -name "CLAUDE.md" 2>/dev/null
find <parent> -maxdepth 2 -name "package.json" -o -name "pyproject.toml" -o -name "go.mod" 2>/dev/null
```

For a multi-repo workspace (separate git checkouts in one parent
directory):

```bash
for d in <parent>/*/; do
  if [ -d "$d/.git" ]; then echo "$d"; fi
done
```

### 1.2 Confirm the list with the user

State the discovered list back. Ask: "this is the list — is it
complete?" The user knows about repos that aren't in the parent
directory you searched.

If the user adds a repo later — run the full pipeline (Phases 3-8)
on that one repo. Do not patch from memory.

### 1.3 Note existing CLAUDE.md / AGENTS.md

For each repo, note whether one exists. **Default treatment:
existing files are NOT the starting point.** They were probably
written when the repo was small, or by an agent without
constraints. They drift. Treat as **junk** unless the user
explicitly says otherwise.

This must be in the analyzer prompt template (Phase 4) — say
"existing files are junk, start fresh", do not say "improve the
existing one".

---

## Phase 2: Quality bar

Identify 1-2 reference AGENTS.md files that the new files must
match in quality. Examples:
- A previous project's AGENTS.md the user has pointed at.
- A widely-cited reference (Go-style AGENTS.md is a common
  bar — concrete, dependency-direction stated, per-package
  allowed/not-allowed).
- Repos within the same project that already have a strong
  AGENTS.md.

Ask the user to confirm the reference. The reference becomes the
quality target each analyzer agent sees in its prompt.

What makes a good reference (look for these attributes):
1. **Dependency direction** stated as one short line, not prose.
2. **Per-package allowed / not allowed** with concrete bullets,
   not generic platitudes.
3. **Forbidden generic file names** (`utils.py`, `helpers.py`,
   `common.py`, `misc.py`, …) listed exhaustively.
4. **Refactoring discipline** that distinguishes structural
   changes from semantic ones.
5. **Domain guardrails** specific to this product, not generic.
6. **Change checklist** — yes/no questions the agent answers
   before declaring done.

If the reference is weak on any axis, supplement with examples
from the current project. Do not lower the bar to match a weak
reference.

---

## Phase 3: Per-repo measurement

For each repo, collect **objective numbers** that the analyzer
will use as facts. These are the highest-error-rate elements in
the final files — every wrong number is a validator catch.

What to measure (semantically — adapt to the project's stack):

- **LOC of the largest files** — sort all source files by line
  count; the top 20 surface god-object candidates.
- **Method/function counts in god-object candidates** — count
  function/method declarations in each large file.
- **Route counts** — count HTTP route declarations in API files.
- **Top-level package layout** — directories at depths 1-2.

Example commands by stack (pick the one matching the project,
or adapt):

```bash
# === Python ===
find <repo> -name "*.py" | xargs wc -l | sort -rn | head -20
grep -c "^\s*\(async \)\?def " <god-object.py>
grep -c "@\(router\|app\)\.\(get\|post\|put\|delete\|patch\)" <api.py>

# === Go ===
find <repo> -name "*.go" | xargs wc -l | sort -rn | head -20
grep -c "^func " <god-object.go>
grep -c "router\.\(GET\|POST\|PUT\|DELETE\|PATCH\)" <api.go>

# === TypeScript / JavaScript ===
find <repo> \( -name "*.ts" -o -name "*.tsx" -o -name "*.js" \) | xargs wc -l | sort -rn | head -20
grep -c "^\s*\(async \)\?\(function\|export function\|public\|private\)" <god-object.ts>
grep -c "\(router\|app\)\.\(get\|post\|put\|delete\|patch\)" <api.ts>

# === Universal: directories ===
find <repo> -maxdepth 2 -type d | sort
```

If the project uses a stack not listed here, adapt the regexes
and file patterns to the language's syntax. The goal is the
*measurement* (LOC, method count, route count), not the specific
command.

### 3.2 Identify god-object candidates

The candidate floor is **measured LOC ≥ 700 (backend) / ≥ 500 (UI)**
— any file at or above that threshold is a freeze-table candidate.
This is deliberately lower than the hard-block tier below: a re-run
with a ">1000" floor skips the 700-1000 band (e.g. `runs.py` 745,
`storage_usage_service.py` 800, …) and UI components under 1000,
which is exactly where new god-objects accumulate unnoticed.

`LOC > 1000 OR > 50 methods/routes` is the **hard-block tier** — files
in this band don't just get frozen, they get an explicit
split/strangler action in the freeze table.

Get exact numbers, not estimates — exact numbers survive validation.

### 3.3 Save the measurements

Save per-repo measurements to a temporary file (or pass directly
to analyzers). Each analyzer must use measurements from this file,
not its own re-counting.

This deduplicates effort and prevents drift between analyzers.

---

## Phase 4: Parallel analyzer agents

Spawn one analyzer per repo, **in parallel** (one Agent invocation
block). Each analyzer:
- Receives the repo path, the measurements file, the audit (if it
  exists from `code-skills-creator` Phase 1), the existing skills
  (code-impl, code-critic) for cross-reference.
- Treats existing CLAUDE.md / AGENTS.md as junk (state explicitly
  in the prompt).
- Produces a proposal (full AGENTS.md text) returned in its result.

### Analyzer prompt template

The prompt has the same shape for every analyzer. Variables in
`<...>`:

```
You are producing the AGENTS.md for <repo-name> at <repo-path>.

== Quality bar (read in full) ==
- <reference-AGENTS.md-path-1>
- <reference-AGENTS.md-path-2>

== Inputs ==
- Repo root: <repo-path>
- Measurements: <measurements-file-path>
- Audit (if available): <findings.md path>. FRESHNESS: check the
  audit's measured-on / dated header. If the repo has shipped major
  surfaces since that date, the audit is PARTIAL — trust the
  measurements file over the audit for any number, and flag surfaces
  the audit doesn't mention rather than assuming they don't exist.
- Existing on-demand skills: <code-impl path>, <code-critic path>
- Existing CLAUDE.md / AGENTS.md (if any): <path or "none">.
  Treat as JUNK. Start fresh; do not improve in place.

== Layering rule ==
AGENTS.md is the always-on architectural skeleton. Skills are
on-demand detail. AGENTS.md MUST NOT duplicate skill content
(do not paste anti-patterns, detection cues, decision gates from
code-impl/code-critic — reference them by name instead).

== User's verbatim concerns (the SPIRIT) ==
- <quote 1: e.g., "files must be concrete; 'keep handlers thin'
  is too generic — name the contract">
- <quote 2: e.g., "treat existing CLAUDE.md as junk — don't try
  to improve it">
- <quote 3: e.g., "don't repeat skill content here">
Substitute with the actual user's phrasings; these are
illustrative.

== Required structure ==
1. Header: what this file is, what it is NOT, link to skills.
2. "What <repo> is": one paragraph — purpose, position in the
   architecture, entry points.
3. Dependency direction: one short line (not prose), e.g.,
   `app/main → app/api → app/services → app/db → external`.
4. Per-package Allowed / Not allowed: 6-9 packages, concrete
   bullets per. No generic platitudes.
5. Forbidden file/package names: exhaustive list.
6. God-Object Freeze List: table with `file | LOC | methods or
   routes | required action`. Numbers from the measurements file.
7. Repo invariants: 7-10 numbered short rules ("X is sync
   throughout", "Y wires the per-key advisory lock", "Z is
   process-global, set once at startup").
8. Refactoring discipline: structural vs semantic; if applicable,
   a 5-step strangler recipe for known god-objects.
9. Concurrency rules: service-specific (asyncio? per-key
   serialization? ordering+dedup?).
10. Default Change Checklist: 5-10 yes/no questions; the last
    one is always "if any answer is no, the change is probably
    not finished".

== Length budget ==
200-400 lines. Below 200 = too thin; above 400 = bloat.

== Style ==
- Concrete over generic. "Keep handlers thin" is weak; "API routes
  do not call services that own SQL" is strong.
- "Current bug:" phrasing is forbidden — bugs rot. State the
  timeless rule; bugs go elsewhere (known-issues.md).
- Cross-references to skills use the canonical name and section
  number / letter from the **target skill's actual structure**
  (e.g., if `code-impl` has its god-object rule in Section 3,
  reference it as `code-impl Section 3` — verify by reading the
  skill, do not guess). Verify each reference by opening the
  skill and confirming the section exists and covers what you
  claim it covers.

== Output ==
Return the full AGENTS.md text in your final message.
DO NOT write the file yourself; the parent will Write it.
```

Note the explicit `DO NOT write the file yourself` — this is
because sub-agent results may not propagate file writes
predictably. The parent (you) takes the returned text and Writes
it. This is friction but produces deterministic results.

---

## Phase 5: Synthesize — assistant writes each file

For each analyzer return:
1. Read the proposal from the agent result.
2. Skim for obviously-broken content (proposal cut off mid-
   sentence, hallucinated paths, wrong repo name).
3. `Write` the file at `<repo>/AGENTS.md`.

If the file is git-tracked, the Edit tool requires a Read first
— `Read` 1-5 lines of the existing file before `Write`. Otherwise
the Write fails silently or the next session-start fails to load
the new file.

If the file already exists (case-collision risk on
case-insensitive filesystems where `agents.md` and `AGENTS.md`
collide), rename in two steps:

```bash
mv <repo>/agents.md <repo>/AGENTS.md.tmp
mv <repo>/AGENTS.md.tmp <repo>/AGENTS.md
```

Single-step `mv agents.md AGENTS.md` is a no-op on case-
insensitive filesystems (HFS+/APFS).

If the file is git-tracked, `Read` the existing 1-2 lines first
(Edit/Write tool requirements), then Write.

---

## Phase 6: Parallel validation

Spawn 2 validators **per file** (or 2 validators that cover all
files), in parallel. Their roles are non-overlapping by design.

### VV-Quality — content quality

Lens: per-axis scoring against the reference quality bar.

For each file, score on these axes (`yes` / `partial` / `weak` /
`missing`):
- Dependency direction stated as one line.
- Per-package allowed / not allowed with concrete bullets.
- Forbidden generic names listed.
- God-object freeze table with measured numbers.
- Repo invariants 7-10 short rules.
- Refactoring discipline.
- Change checklist yes/no questions.
- Skill cross-references correct (exists, not drifted).
- No skill-content duplication (anti-patterns, cues, gates not
  pasted in).

Output: per-file scoring matrix + concrete fixes for `weak` /
`missing` axes.

### VV-Factual — claims verification

Lens: every objective claim verified.

Type-A: **Path existence**. Every file/directory mentioned exists.
Type-B: **LOC and counts**. Every "1234 LOC" / "51 methods" /
"43 routes" matches `wc -l` / `grep -c` of the actual file.
Type-C: **Line references**. Every `file:NN` or `file:NN-MM`
points at the claimed content.
Type-D: **Skill section references**. `code-impl Section 3`
exists in code-impl SKILL.md and is what the claim says it is;
`code-critic Section A` exists in code-critic SKILL.md and
covers what the claim says.
Type-E: **External references**. Library/framework version
claims, canonical implementation paths.

Output: per-file table of claims with `VERIFIED` / `WRONG (actual
value: …)` / `NOT FOUND`.

### Why two roles, not one

Quality-only validators miss factual errors (the LOC is wrong but
the prose is fine). Factual-only validators miss content gaps (the
LOC is right but the file has no change checklist). Both lenses
are required.

The original project's most-corrected category was **factual
errors** (`51→24 methods`, `:1880→:1902`, `code-impl AP10` should
have been `code-critic AP10`). Specific numbers and skill cross-
refs are the highest-error elements.

---

## Phase 7: Apply convergent fixes

Tiering rule:

| Signal | Action |
|---|---|
| Factual error verified by VV-Factual | Apply (Tier 1, objective) |
| Quality issue raised by VV-Quality + cross-file pattern | Apply (Tier 1) |
| Quality issue from one validator, judgment-based | Apply (Tier 2) if it aligns with reference quality bar |
| Conflicting recommendations | Surface to user; do not auto-apply |

Apply via `Edit` (in-place edits). Do not Write a fresh file
unless ≥50% of content is being replaced — Edit preserves the
parts that were already correct.

After applying, **re-read** the changed file to verify the edit
landed. (Edit tool sometimes silently fails when whitespace
doesn't match exactly.)

---

## Phase 8: Index + commit

### 8.1 Parent index

If the project has a parent monorepo or workspace directory,
create a parent AGENTS.md there:

```markdown
# AGENTS.md — <project name>

This file is the entry point for an agent working anywhere in the
<project>. It lists the repos and tells you which `AGENTS.md` to
consult.

| Repo | Path | What it owns | Per-repo AGENTS.md |
|---|---|---|---|
| <name-A> | <path-A> | <one-line summary> | `<path-A>/AGENTS.md` |
| ... |

## How layering works

Every backend has the same three-layer guidance:
1. `<repo>/AGENTS.md` — always loaded. Architectural skeleton.
2. `code-impl` skill — loaded on-demand for non-trivial code work.
3. `code-critic` skill — loaded on-demand to review a diff.

## Cross-cutting facts

- Auth: <how it works across the project>
- Schemas: <where the source of truth is>
- Migrations: <discipline>
- ...
```

Note: if the parent directory is **not a git repo** (just a
workspace folder), the parent AGENTS.md will not be committed
anywhere — it lives locally. State this in the file header so
nobody assumes drift-protection.

If the parent directory **is** a git repo, commit the parent
index there explicitly. Don't create-and-forget — a parent index
that drifts because nobody committed it is worse than no index.

### 8.2 Per-repo commit

Each repo's AGENTS.md commits in its own repo. Do not bundle
across repos — they are separate git histories.

Commit message convention (use what fits the project):
```
docs(agents): add AGENTS.md skeleton for AI agents

Always-on architectural guidance for AI agents working on this repo:
dependency direction, package responsibilities, god-object freeze
list, invariants, change checklist. Quality-bar detail (anti-patterns,
detection cues) lives in code-impl / code-critic skills, referenced
from this file.
```

---

## Incremental refresh (existing AGENTS.md, repo unchanged shape)

When the AGENTS.md files already exist and only the **numbers** have
moved (files grew, new large files crossed the threshold) — do NOT
re-run the full pipeline. Run the measurement-only delta:

1. **Re-run Phase 3 measurement only** on the changed repo(s). Skip
   discovery (Phase 1), quality-bar selection (Phase 2), the parallel
   analyzers (Phase 4), and synthesis (Phase 5) — the skeleton, the
   package layout, and the invariants haven't moved.
2. **Edit the freeze cells in place** for files whose LOC / method /
   route count changed, and **add a new row for every file that has
   newly crossed ≥700 backend / ≥500 UI**. Use `Edit`, not a rewrite
   — the rest of the file is still correct.
3. **Run the VV-Factual lens scoped to the changed numbers only** (the
   edited cells + new rows). VV-Quality does not need to re-run for a
   numbers-only delta. Re-read the file after editing to confirm the
   edit landed.
4. **Commit** the delta in the owning repo.

**Guard (the whole point of this path):** never leave a newly-crossed
≥700/≥500 file out of the freeze table. The failure mode is a file
that grew past the floor between refreshes and silently kept growing
because no row constrains it. The measurement step exists to catch
exactly this; if a new file is at/over the floor and not in the
table, the refresh is not done.

If the repo's *shape* changed (a new package, a renamed boundary, a
moved entry point) — that is not an incremental refresh; re-run the
full per-repo pipeline (Phases 3-8). Likewise for a brand-new repo
(see the "backend added later" pitfall in the Pitfalls catalogue).

---

## AGENTS.md structure (canonical)

Every produced file has these sections **in this order**:

```markdown
# AGENTS.md

<one-paragraph header: what this is, what it is NOT, link to skills>

## What <repo> is

<one paragraph: purpose, position, entry points>

## Target Architecture

<one short line: dependency direction>

<paragraph or short list: cross-cutting modules>

## Package Responsibilities

### `<package-1>/`

Allowed:
- bullet
- bullet

Not allowed:
- bullet
- bullet

### `<package-2>/`
...

## Forbidden file / package names

- `utils.py`
- `helpers.py`
- ...

## God-Object Freeze List

| File | LOC | Methods/Routes | Action |
|---|---|---|---|
| ... |

## Repo invariants

1. <invariant>
2. <invariant>
...

## Refactoring discipline

<structural vs semantic; if a god-object freeze table entry needs
splitting, prescribe the strangler recipe — typically a 5-step
shape: (1) introduce a new module/file alongside the god-object;
(2) move one cohesive responsibility at a time, leaving a thin
delegating call from the god-object; (3) tests stay green between
each step; (4) ensure each step lands separately in version
control; (5) when the god-object is below the freeze threshold,
update the freeze table or remove the entry. Do not tear down all
at once — the strangler is incremental by design.>

## Concurrency rules

<service-specific>

## Default Change Checklist

- [ ] <question>
- [ ] <question>
- [ ] If any answer is no, the change is probably not finished.
```

This skeleton is intentionally constraining. Skip a section only
if the repo genuinely has no answer (e.g., no concurrency rules
for a synchronous CLI tool).

---

## Validator prompt templates

### VV-Quality template

```
You are validating <count> AGENTS.md files for <project>.

Files to review (read each in full):
- <repo-A>/AGENTS.md
- <repo-B>/AGENTS.md
- ...

Reference quality bar (read in full):
- <reference-AGENTS.md path>

Existing on-demand skills (for cross-ref check, do not paste):
- <code-impl path>
- <code-critic path>

User's verbatim quality demands (the SPIRIT — internalize before
auditing):
- <quote 1, in original language>
- <quote 2>
- <quote 3>

Per-axis scoring rubric — for each file, score `yes` / `partial` /
`weak` / `missing` on:
1. Dependency direction stated as one line.
2. Per-package allowed / not allowed concrete (no platitudes).
3. Forbidden generic names exhaustive.
4. God-object freeze table present with measurements.
5. Repo invariants 7-10 short rules.
6. Refactoring discipline.
7. Change checklist concrete yes/no.
8. Skill cross-references correct (verify section exists, not
   drifted).
9. No skill-content duplication.
10. Length 200-400 lines (200=floor, 400=ceiling).

Cross-file consistency:
- Skill reference paths consistent across files.
- Header paragraph framing consistent.
- "What this is / NOT" framing consistent.

Output: write to <validation-output-path>:
- Per-file scoring matrix.
- Per-axis concrete fixes for `weak` / `missing`.
- Cross-file inconsistencies.

Length budget for your report: under ~1500 words. Cite line
numbers / section headers, do not paste long extracts.

Do NOT edit the AGENTS.md files. Report only.
```

### VV-Factual template

```
You are factually verifying <count> AGENTS.md files for <project>.

Files (read in full, then verify each claim):
- <repo-A>/AGENTS.md
- <repo-B>/AGENTS.md
- ...

User's verbatim demand for factual accuracy (the SPIRIT):
- <quote 1, e.g., "не доверяй слепо одному агенту">
- <quote 2, e.g., "надо чтобы мы были уверены в каждой фактической
  ошибки">

For each file, build a table of objective claims:

Type A — Path existence:
For every file/directory mentioned, run `ls`. Mark `EXISTS`/
`NOT FOUND`.

Type B — LOC and counts:
For every "1234 LOC" / "51 methods" / "43 routes" claim, run
`wc -l` and `grep -c` on the actual file. Mark `MATCHES` /
`WRONG: actual=X` / `FILE NOT FOUND`.

Type C — Line references:
For every `file:NN` or `file:NN-MM`, open the file and verify the
line range contains what the claim says.

Type D — Skill section references:
For every `code-impl Section <X>` / `code-critic Section <Y>` /
`code-impl P<N>` / `code-critic AP<N>`:
- Does the section/principle exist in the named skill?
- Does it cover what the AGENTS.md claim says it covers?

Type E — External references:
Library names, framework versions, canonical paths from the
project audit. Verify against the actual code or audit.

Output: write to <validation-output-path>:
- Per-file × per-claim table.
- For each WRONG, the actual value.
- Cross-file: which AGENTS.md has the most factual errors
  (highest-risk file).

Length budget for your report: under ~1500 words.

Do NOT edit. Report only.
```

---

## Pitfalls catalogue

Failure modes the workflow must prevent (each was hit in the
original project):

1. **Trusting a remembered list of repos.** Discovery enumerates
   from the filesystem. Period.
2. **Editing existing CLAUDE.md / AGENTS.md.** Existing files
   drift. Start fresh. Put "treat as junk" in the analyzer prompt.
3. **Sub-agents writing files vs returning text.** Some agents
   return "wrote to <path>" without actually writing. Have the
   analyzer return text; you (the parent) Write. Deterministic.
4. **Wrong LOC / method counts / line numbers.** The single
   highest-error category. Always run `wc -l` / `grep -c` /
   `Read` to verify before claiming a number.
5. **Wrong skill cross-references** (`code-impl AP10` when it
   should have been `code-critic AP10`; `Section 4` when it
   should have been `Section 3`). Verify each cross-ref by
   reading the target skill.
6. **Skill-content duplication** in AGENTS.md (pasting anti-
   patterns, detection cues, decision gates). AGENTS.md is the
   skeleton; the detail lives in skills. Reference, do not paste.
7. **Generic platitudes** ("keep handlers thin", "follow SOLID",
   "write good code"). Replace with concrete contracts ("API
   routes do not call services that own SQL").
8. **"Current bug:" phrasing.** Bugs rot. State the timeless
   rule; ephemeral bugs go in `known-issues.md`.
9. **Long forbidden-patterns sections that duplicate code-critic.**
   Trim to one-liners with cross-refs (`see code-critic AP1`).
10. **Missing god-object freeze table.** Without measured numbers,
    the always-on guidance can't constrain "where new code goes".
11. **Case-insensitive filesystem trap.** `agents.md` and
    `AGENTS.md` collide on HFS+/APFS. Two-step rename.
12. **Forgetting to Read before Edit.** Edit tool requires a Read
    first; on existing tracked files, Write also benefits from
    a quick Read so you know what you're overwriting. Skip this
    and Edit/Write fails or silently overwrites.
13. **Forgetting the parent index.** If the project has multiple
    repos, the parent index is the entry point. Create it
    explicitly, even if the parent dir is not a git repo. If the
    parent IS a git repo, commit the index there too — create-
    and-forget makes the index drift.
14. **Forgetting that a backend was added later.** When the user
    adds a new repo after the initial pipeline ran, run the full
    pipeline (Phases 3-8) on that one repo. Do not patch from
    memory or copy-paste an existing AGENTS.md — measurements,
    invariants, packages will be different.
13. **Committing before validators run.** Order: validate → fix →
    commit. Reverse order leaves errors in git history.
14. **Skipping a repo because it wasn't in the deploy list.**
    Discovery (Phase 1) is the source of truth, not the deploy
    list.
15. **Length bloat.** > 400 lines = the file is doing skill's job.
    Move detail into skills; keep AGENTS.md as skeleton.
16. **Length anorexia.** < 200 lines usually = no constraints, no
    measured numbers, no concrete contracts. Flesh out before
    publishing — UNLESS the repo is a genuine exception: a pure
    index file or a thin-boundary / transitional bridge service
    that really does have only a couple of packages and invariants.
    Confirm there's more to constrain before padding; do not invent
    constraints to hit the floor.
17. **Send-message-clarifier as a recovery move.** "Existing
    files are junk" must be in the original prompt template.
    Don't rely on mid-flight clarification.
18. **Single-validator pass.** Always two validators per file:
    quality + factual. They catch non-overlapping classes.
19. **Hardcoded language assumptions in measurement commands.**
    Phase 3 examples are Python/Go/TS; for other stacks, adapt
    the regex/find patterns to the language's syntax. The
    measurement (LOC, method count, route count) is the goal,
    not the specific command.

---

## Calibration before declaring done

- [ ] Every repo has an AGENTS.md (verify with `find <parent>
  -maxdepth 2 -name "AGENTS.md"`).
- [ ] Each file is 200-400 lines — **with legitimate exceptions**: a
  pure index file (a root parent index that just lists repos) and a
  thin-boundary service (a transitional bridge / integration shim
  that genuinely has only a few packages and invariants) can sit well
  under 200 lines without being under-specified. Under-200 is a smell
  to investigate, not an automatic failure; confirm the repo actually
  has more to constrain before padding it.
- [ ] Parent index lists every repo (or absence is documented).
- [ ] No factual errors (VV-Factual returns clean).
- [ ] No cross-file inconsistencies (VV-Quality returns clean).
- [ ] Each god-object freeze table number is verified.
- [ ] Each skill cross-reference resolves.
- [ ] No skill-content duplication.
- [ ] Each file commits cleanly in its own repo.

---

## References

- Companion skill that produces the on-demand quality-bar pair:
  `code-skills-creator` (sibling).
- Reference output (in this project's history): see `<project>/
  agent/AGENTS.md`, `<project>/management/AGENTS.md`, etc., for
  examples of finished AGENTS.md files at the right quality
  level.
- The on-demand skills referenced from AGENTS.md: `code-impl`,
  `code-critic` (sibling skills produced by `code-skills-creator`).
