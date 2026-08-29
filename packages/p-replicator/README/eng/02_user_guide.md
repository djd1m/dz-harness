# 02. User Guide

Detailed walkthrough of all 11 commands and their workflows.

## Command summary

| Command | Purpose | When to use |
|---|---|---|
| `/replicate` | Full pipeline: idea → SPARC docs → toolkit | Start of a new project |
| `/start` | Bootstrap scaffold from SPARC docs | After `/replicate`, before feature work |
| `/run` | Autonomous feature build loop from roadmap | Regular development |
| `/go` | Router: picks /plan, /feature, or /feature-ent | One specific feature |
| `/next` | Show next feature from roadmap | Sprint navigation |
| `/plan` | Lightweight plan in `docs/plans/<id>.md` | Small task (≤3 files) |
| `/feature` | Full SPARC-mini cycle (PLAN → VALIDATE → IMPLEMENT → REVIEW) | Large feature (4+ files) |
| `/myinsights` | Capture or recall insights | After every non-trivial debug |
| `/docs` | Bilingual docs generator (RU + EN) | End of project or feature |
| `/harvest` | Extract reusable patterns | After completed project |
| `/deploy` | Deployment workflow (dev/staging/prod) | Deployment |

---

## /replicate — main pipeline

**Purpose:** turn a product idea into a fully documented, validated,
toolkit-equipped project.

**Usage:**

```
/replicate "AI-powered handmade marketplace"
/replicate "company name"     # for reverse-engineering mode
```

### Phase 0 — Product Discovery (optional)

Auto-activates for SaaS, startups, new products. Skipped for internal tools
and experiments.

- Reverse-engineer similar companies via `reverse-engineering-unicorn` skill
- JTBD analysis + competitors + Blue Ocean canvas
- Output: `docs/00_product_discovery.md`

### Phase 1 — Planning (SPARC docs)

Generates 11 documents in `docs/`:

| Document | Content |
|---|---|
| `PRD.md` | Vision, personas, user stories |
| `Solution_Strategy.md` | Solution approach |
| `Specification.md` | Acceptance criteria, NFRs |
| `Pseudocode.md` | Algorithms and data flow |
| `Architecture.md` | C4 diagrams, tech stack |
| `Refinement.md` | Edge cases, testing strategy |
| `Completion.md` | Deploy, CI/CD, monitoring |
| `Research_Findings.md` | Market and tech research |
| `Final_Summary.md` | Executive summary |
| `C4_Diagrams.md` | Context / container / component |
| `ADR.md` | Architecture Decision Records |

Uses `sparc-prd-mini` skill (which internally chains explore + research +
solve phases).

### Phase 2 — Validation

5 parallel validator agents:

| Agent | Validates |
|---|---|
| `validator-stories` | INVEST criteria for user stories |
| `validator-acceptance` | SMART criteria for AC |
| `validator-architecture` | Architecture consistency |
| `validator-pseudocode` | Algorithm cohesion |
| `validator-coherence` | Cross-document consistency |

**Verdicts:**
- 🟢 READY (score ≥70) → Phase 3
- 🟡 CAVEATS (50-69) → Phase 3 with notes
- 🔴 NEEDS WORK (<50 or blockers) → return to Phase 1 (max 3 retries)

### Phase 3 — Toolkit Generation

**Does NOT generate pre-shipped commands** (already installed via init).
Generates **only project-specific** artifacts:

- `.claude/agents/planner.md`, `code-reviewer.md`, `architect.md` (project-aware)
- `.claude/rules/security.md`, `coding-style.md`, `testing.md`
- `.claude/skills/project-context/`, `coding-standards/`
- `CLAUDE.md` enhanced with project content
- `.claude/feature-roadmap.json` (from PRD MVP scope)
- `DEVELOPMENT_GUIDE.md`, `README.md`

### Phase 4 — Finalize

- `docker-compose.yml`, `Dockerfile`, `.gitignore` (scaffold files)
- Git commit "chore: initial project setup"
- Final summary

### Starting from existing tech docs

The pipeline officially supports starting **from user-provided technical
documentation** — bypassing Phase 0 (Product Discovery). Useful when:

- You're migrating an existing project to the Claude Code workflow
- You have a tech spec / architecture / API docs from a prior phase
- You only need to generate SPARC documents and/or validate them

#### Trigger detection (any of)

`/replicate` switches to this mode when input contains:

- A path reference: "use my docs in `docs/existing/`", "my tech specs are in `<path>`"
- An explicit skip: "skip discovery", "skip Phase 0"
- A statement: "I already have technical documentation"
- The semantic flag: `/replicate --from-docs <path>` or `--skip-discovery`

#### Setup

Place your docs in a project-local subfolder (conventionally `docs/existing/`
or `docs/source/`) — visible to the pipeline but separate from generated SPARC outputs.

```bash
mkdir -p docs/existing
cp your-tech-doc-*.md docs/existing/
```

#### What changes per phase

| Phase | Default mode | Existing-docs mode |
|---|---|---|
| **Phase 0** | reverse-engineering-unicorn (opt.) | **SKIPPED** |
| **Phase 1** | sparc-prd-mini interactive | sparc-prd-mini **AUTO mode** + your docs as context |
| Phase 1 sub-phases | Explore + Research + Solve | **SKIPPED** (answers already in your docs) |
| **Phase 2** | Validation (5 agents) | unchanged |
| **Phase 3** | Toolkit Generation | unchanged |
| **Phase 4** | Finalize + scaffolds | unchanged |

#### Three sub-paths

##### Path A — full pipeline (recommended)

```
/replicate "Use my docs in docs/existing/, skip Phase 0"
```

Get all 11 SPARC documents + validation report + project-specific toolkit +
Docker scaffold. Best choice when you need a fully-generated project.

##### Path B — SPARC docs only

```
In Claude Code: "Use sparc-prd-mini skill in AUTO mode, read context from
docs/existing/, generate the 11 SPARC documents in docs/. Do not run Phase 2/3/4."
```

Only the 11 files in `docs/`. No validation, no toolkit, no scaffold. Useful
when you only need documentation standardization.

##### Path C — validation only

If your docs are already SPARC-shaped (you already have `PRD.md`, `Architecture.md`, etc.):

```bash
# 1. Move/rename docs to standard SPARC names
mv docs/existing/PRD.md docs/PRD.md
# ... rest of 10 SPARC names

# 2. In Claude Code:
"Invoke the requirements-validator skill on docs/. Generate validation-report.md."
```

You'll get only `docs/validation-report.md` + `docs/test-scenarios.md`. No
SPARC re-generation.

#### Caveats (important)

- **`[GAP: ...]` markers** — if your docs don't cover one of the 11 SPARC slots,
  sparc-prd-mini will leave a placeholder. Normal, but requires manual completion
  before Phase 3.
- **Validation may flag "not INVEST"** — if user stories in your docs don't
  follow INVEST/SMART, the swarm will report 🟡 CAVEATS or 🔴 NEEDS WORK. This
  is a signal that the docs need extending, not a bug.
- **Architecture constraints** — pattern, containers, infrastructure, deploy,
  AI integration — must be in your docs or passed in input explicitly. By
  default, sparc-prd-mini uses the target architecture from this repo:
  Distributed Monolith / Docker / VPS / MCP.

#### Verification

After `/replicate`, run:

```bash
npx @dzhechkov/p-replicator verify
```

`verify` reports:
- ✅ Pre-shipped contract intact
- ✅ Post-/replicate hints: SPARC docs, validation-report, optionally toolkit artifacts

#### Future enhancement (M2 in KNOWN_LIMITATIONS)

The semantic `--from-docs <path>` flag currently works via natural-language
override in the `/replicate` input. A formal CLI flag with command-level
parsing is on the roadmap (see KNOWN_LIMITATIONS.md M2).

---

## /start — project bootstrap

**Purpose:** turn SPARC documentation into a working monorepo with
`docker compose up`.

**Usage:**

```
/start                                  # with tests + migrations
/start --skip-tests                     # without tests (faster)
/start --skip-seed                      # without DB seeding
/start --dry-run                        # preview without writing
```

**4 phases (sequential → parallel → sequential → finalize):**

1. **Foundation** — root configs (`package.json`, `docker-compose.yml`, `.env.example`)
2. **Packages** (⚡ parallel via `Task` tool) — one Task per package from Architecture.md
3. **Integration** — `docker compose build/up`, migrations, health check
4. **Finalize** — README + `git tag v0.1.0-scaffold`

**Critical rule:** every Phase 2 Task MUST reference specific SPARC docs
(e.g., `docs/Specification.md` → ORM schema), never generate from memory.

---

## /run — autonomous feature build

**Purpose:** roll through the entire roadmap (or MVP subset) autonomously.

**Usage:**

```
/run mvp                                          # priority=mvp only
/run all                                          # everything in `next`/`planned`
/run mvp --feature-branches                       # each feature in a branch
/run mvp --feature-branches --auto-merge          # with auto-merge
```

**Per-iteration workflow:**

```
while features in scope:
    feature_id = /next                       # pick highest-priority
    if no feature: break
    /go feature_id                           # complexity router
    verify (tests green, code committed)
    mark roadmap entry: status=done
    git commit + git push
```

**With `--feature-branches`** add steps:
1. Verify on `main` (else fail)
2. Auto-stash dirty working tree
3. `git checkout -b feature/{NNN}-{id}` (NNN = zero-padded 3-digit)
4. After implementation: `git push origin feature/{NNN}-{id}`
5. Update roadmap with `branch` field
6. `git checkout main`
7. (if `--auto-merge`) `git merge --no-ff feature/{NNN}-{id}`

**Use case:** teaching / demos. Instructor checks out
`feature/003-payment` for a specific feature demonstration.

---

## /go — intelligent router

**Purpose:** auto-pick `/plan`, `/feature`, or `/feature-ent` based on
complexity score.

**Usage:**

```
/go auth-jwt                       # by feature id from roadmap
/go "Add Stripe integration"       # free-form description
/go auth-jwt --feature-branches    # with branch workflow (see /run)
```

**Complexity scoring matrix:**

| Signal | Points |
|---|---|
| Touches ≤ 3 files | -2 |
| Touches > 10 files | +3 |
| External API integration | +2 |
| New DB entities | +2 |
| Cross-bounded-context dependencies | +3 |
| Hotfix | -3 |
| > 2 hours implementation | +3 |

**Decision:**
- ≤ -2 → `/plan`
- -1 to +4 → `/feature`
- ≥ +5 + `/feature-ent` available → `/feature-ent` (DDD pipeline)
- ≥ +5 without `/feature-ent` → `/feature` with extra architecture care

---

## /next — roadmap navigator

**Usage:**

```
/next                          # default: top 3 next/planned features
/next update                   # scan code, suggest status updates
/next auth-jwt                 # mark done + cascade unblock
```

**Default output:**

```
1. [mvp] auth-jwt — JWT login (medium, 2-4h)
2. [mvp] user-profile — Profile CRUD (simple, 1-2h)
3. [high] payment-webhook — Stripe handler (complex, 4-6h)

In progress: <id>
Done: 5/12
Blocked: 1
```

**Roadmap schema** is documented in `04_api_reference.md`.

---

## /plan — lightweight plan

**When:** ≤3 files, < 30 min implementation, no new architecture.

**Usage:**

```
/plan add-validation-helper
/plan "fix race condition in cart"
```

**Output:** `docs/plans/<slug>.md` with sections:
- Goal (1-2 sentences)
- Tasks (numbered checklist)
- Files Touched (table)
- Dependencies + Risks
- Verification

Auto-commit via Stop hook.

---

## /feature — full SPARC-mini cycle

**When:** ≥4 files, new capability, new architecture.

**4 phases with checkpoints:**

### Phase 1 — PLAN (sparc-prd-mini)
Generates 5 SPARC docs in `docs/features/<feature>/`:
- `01_specification.md`, `02_pseudocode.md`, `03_architecture.md`,
  `04_refinement.md`, `05_completion.md`

### Phase 2 — VALIDATE (requirements-validator)
Score ≥ 70 → Phase 3. Auto-retry on 🟡 (caveats), max 3 retries on 🔴.

### Phase 3 — IMPLEMENT (parallel agents)
`Task` tool spawns parallel tasks per independent unit from Architecture.

### Phase 4 — REVIEW (brutal-honesty-review)
Findings by severity: blocker (must fix) / high / medium / low.

**AUTO mode** (called from `/go` or `/run`): no per-phase confirmations.

### Feature workflow in an existing project (Mode 2)

`/feature` officially supports **two entry modes** — both use the identical
4-phase pipeline (PLAN → VALIDATE → IMPLEMENT → REVIEW), the same validation
thresholds, the same retry logic.

| Mode | When | Pre-conditions |
|---|---|---|
| **Mode 1: Post-/replicate** | Project bootstrapped via `/replicate` | CLAUDE.md, docs/, scaffold all generated by /replicate |
| **Mode 2: Existing project** | Working project, adding features with verification | `init` ran on top of existing project; CLAUDE.md already exists |

#### When to use Mode 2

- You already have stack, PRD, Specification, Architecture, CLAUDE.md
- You want to add features with the **same validation cycle** as `/replicate`
- You do NOT want to regenerate the existing CLAUDE.md and scaffold

#### Steps for Mode 2

```bash
# 1. Install (idempotent — does NOT touch CLAUDE.md or existing .claude/ files)
cd existing-project
npx @dzhechkov/p-replicator init
npx @dzhechkov/p-replicator verify     # pre-shipped contract OK

# 2. Normalize SPARC paths (one-time)
#    /feature expects docs/PRD.md, docs/Specification.md, docs/Architecture.md
mv docs/your-prd.md   docs/PRD.md
mv docs/your-spec.md  docs/Specification.md
mv docs/your-arch.md  docs/Architecture.md

# 3. (Optional) feature-roadmap for batch mode via /run
cat > .claude/feature-roadmap.json << 'EOF'
{
  "features": [
    {"id": "stripe-payments", "title": "Stripe", "priority": "mvp", "status": "planned"},
    {"id": "user-2fa",        "title": "2FA TOTP", "priority": "mvp", "status": "planned"}
  ]
}
EOF

# 4. Run
claude
/feature stripe-payments                    # single feature
/run mvp --feature-branches --auto-merge    # batch with git branching
```

#### Three sub-paths for Mode 2

##### Path A — `/feature` directly (recommended)

Single feature, full 4-phase lifecycle. Use when the feature touches ≥4 files
or introduces new capability/architecture.

```
/feature add-stripe-payments
```

##### Path B — `/go` auto-router

Picks between `/plan` (≤3 files) and `/feature` (≥4 files) based on heuristics.

```
/go add-pagination          # → /plan (small)
/go add-stripe-payments     # → /feature (large)
```

##### Path C — direct skill invocation (validation cycle only)

If you have your own implementation flow and just need the **validation cycle**:

```
In Claude Code:
"Invoke the requirements-validator skill on docs/features/my-feature/.
 Generate validation-report.md with verdict 🟢/🟡/🔴."

After implementation:
"Invoke the brutal-honesty-review skill on the changed files."
```

#### What's preserved during `init` in an existing project

| Artifact | Behavior |
|---|---|
| `CLAUDE.md` (root) | **Preserved** (only `--force` overwrites) |
| `docs/PRD.md`, `Specification.md`, your docs | **Preserved** |
| `.claude/commands/your-custom.md` | **Preserved** |
| `.claude/settings.json` | **Merged** (v1.4.2+ deep-equals merge with `shippedDefaults` baseline for orphan-detection) |
| `.gitignore`, `package.json` | **Not touched** |
| `.p-replicator.json` | Newly created (manifest) |

#### Validation thresholds (identical to /replicate Phase 2)

`requirements-validator` scores on INVEST (user stories) + SMART (acceptance
criteria). The same swarm-of-5 used in `/replicate`:

- 🟢 **READY** (score ≥ 70) — IMPLEMENT
- 🟡 **CAVEATS** (50-69, no blockers) — IMPLEMENT + auto-retry once
- 🔴 **NEEDS WORK** (< 50 OR blockers) — return to PLAN, max 3 retries → halt

After `IMPLEMENT` — `brutal-honesty-review` with severity:
`blocker` (must fix) / `high` (fix unless deferred) / `medium` (follow-up issue) / `low` (logged only).

#### Mode 2 caveats (important)

1. **DO NOT run `/start`** — it's for fresh scaffolds based on `Architecture.md`,
   not for adding to an existing project.
2. **`/feature-ent` unavailable** in Mode 2 without DDD/ADR/C4 docs — `/replicate`
   Phase 3 normally generates it conditionally. Use `/feature` or `/go` instead.
3. **Auto-commit hooks** (`Stop` → `autocommit-roadmap.cjs` / `-insights.cjs` /
   `-plans.cjs`) may conflict with custom git workflows. Solution: after `init`,
   edit `.claude/settings.json` — remove unwanted matchers. v1.4.2+ merge logic
   preserves your edits on subsequent `update` runs thanks to `shippedDefaults`
   baseline.
4. **Non-standard doc paths** — there are no `--prd-path` / `--spec-path` flags.
   Solution: one-time rename or symlink. See KNOWN_LIMITATIONS.md M3 — formal
   config-flag is on the roadmap (Tier S effort).

#### Verification

After `/feature` (or `/run`), run:

```bash
npx @dzhechkov/p-replicator verify
```

Should report:
- ✅ Pre-shipped contract intact (10 skills + 11 commands + 4 agents + 6 rules + settings.json)
- ✅ Post-/replicate hints — many will be absent in Mode 2 (this is normal)
- 📊 Per-feature artifacts: `docs/features/<id>/01_specification.md`...`05_completion.md`,
  `validation-report.md`, `review-report.md`

#### Future enhancement (M3 in KNOWN_LIMITATIONS)

`docPaths` config in `.p-replicator.json` for non-standard doc paths is on the
roadmap. Tier S effort, pure config + spec-read changes, no CLI code modifications.

---

## /myinsights — knowledge capture

**Purpose:** build a project-local knowledge base of "rakes" auto-injected
into every session via SessionStart hook.

**Usage:**

```
/myinsights                                 # interactive prompt
/myinsights "Prisma migrate dev fails silently if shadow DB unreachable. Workaround: set DATABASE_URL_SHADOW explicitly."
/myinsights recall prisma                  # search by keyword
```

**Entry structure:**

```markdown
## 2026-05-07 — Prisma shadow DB requirement

**Tags:** prisma-migration, postgres-shadow

**Problem:**
Migrate dev fails silently when shadow DB unreachable.

**Solution:**
Set DATABASE_URL_SHADOW env var to a separate database.

**References:** packages/backend/prisma/schema.prisma:12
```

**Auto-injection:** `SessionStart` hook
(`.claude/hooks/session-insights.cjs`) reads `.claude/insights/index.md`,
prints 3 most recent entries to stdout, Claude Code injects into initial
context.

---

## /docs — documentation generator

**This is the command that created these files.** Bilingual (RU + EN) by
default.

**Usage:**

```
/docs                       # RU + EN, create or replace
/docs ru                    # Russian only
/docs eng                   # English only
/docs update                # update only changed sections
```

**Output:** `README/{ru,eng}/` with 8 files per language (this file is one
of them).

---

## /harvest — knowledge extraction

**Purpose:** at project end, extract reusable patterns (skills, commands,
rules, templates, snippets) for future projects.

**Usage:**

```
/harvest quick               # fast, no checkpoints (~15 min)
/harvest full                # full 4-phase pipeline (~45 min)
/harvest marker              # mark artifact for extraction
/harvest audit               # toolkit maturity review
```

**4 phases (full):**
1. AGENT REVIEW — 5 parallel scanner agents
2. CLASSIFY — 7 categories
3. DECONTEXTUALIZE — strip project-specific names
4. INTEGRATE — write to toolkit, update index

---

## /deploy — deployment workflow

**Usage:**

```
/deploy dev          # auto, minimal checks
/deploy staging      # gate checks + smoke tests + health
/deploy prod         # explicit `yes` confirmation + rollback plan
```

**Per-tier gate checks:**
- ALL: tests pass, build OK, lint clean
- STAGING+PROD: env vars set, external services reachable, images tagged
- PROD: staging successful in 24h, no critical issues, on-call notified

**Auto-rollback** on staging/prod when health check fails.

---

## Command relationships

```
/replicate ─┬─ /start ──────── (one-time bootstrap)
            │
            └─ /run mvp/all ──┬─ /next (selection)
                              ├─ /go ──┬─ /plan (simple)
                              │       └─ /feature (standard)
                              │           └─ AUTO mode inside /run
                              └─ git push + roadmap update

Anytime:
  /myinsights — knowledge capture
  /docs — docs refresh
  /verify, /doctor — health checks (CLI)

End of project:
  /harvest — pattern extraction
  /deploy — production deployment
```

For configuration details (hooks/statusline/insights) see
[03_admin_guide.md](./03_admin_guide.md).
