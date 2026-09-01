# 01. Quick Start

5 minutes from empty folder to a working AI pipeline.

## Prerequisites

- Node.js ≥ 16.0.0
- Claude Code installed (CLI or web)
- Git initialized in the project (`git init` if not already)
- Docker + Docker Compose (needed for `/start` Phase 3)

## Installation

In your project root:

```bash
npx @dzhechkov/p-replicator init
```

This creates:

- `.claude/skills/` — 10 pre-shipped skills
- `.claude/commands/` — 11 slash commands (`/replicate`, `/run`, `/feature`, ...)
- `.claude/agents/` — 4 pipeline agents
- `.claude/rules/` — 9 governance rules
- `.claude/hooks/` — 6 cross-platform Node scripts
- `.claude/settings.json` — hooks + statusline configuration
- `.p-replicator.json` — install manifest

Install is idempotent: `init` won't overwrite existing files without `--force`.

## First run

```bash
claude                                    # open Claude Code in the project
```

In Claude Code, run:

```
/replicate "Describe your product in 1-2 sentences"
```

This launches a 5-phase pipeline:

| Phase | What it does | Artifacts |
|------|-----------|-----------|
| **0. Product Discovery** (optional) | Reverse-engineer similar companies | `docs/00_product_discovery.md` |
| **1. Planning** | Generate 11 SPARC documents | `docs/PRD.md`, `Architecture.md`, `Pseudocode.md`, ... |
| **2. Validation** | 5-agent swarm validates docs (INVEST/SMART, score ≥70) | `docs/validation-report.md` |
| **3. Toolkit Generation** | Generate project-specific agents, rules, skills | `.claude/agents/planner.md`, `architect.md`, ... |
| **4. Finalize** | Scaffolds (Dockerfile, docker-compose.yml, .gitignore) + git commit | Project ready |

Each phase has a checkpoint where you type "ok" to proceed or give feedback.

## Alternative entry — I already have technical docs

If you already have technical documentation (tech spec, architecture, API specs,
design docs), you can **skip Phase 0** (Product Discovery) and feed your existing
docs straight into Phase 1 as pre-filled context.

### Setup

```bash
mkdir -p docs/existing
cp your-tech-doc-*.md docs/existing/    # place your existing docs here
```

### Three sub-paths

| Path | When to use | What gets invoked |
|---|---|---|
| **A. /replicate with override** | Full pipeline + toolkit + scaffold | `/replicate "Use my docs in docs/existing/, skip Phase 0"` |
| **B. SPARC docs only** | Want only the 11 SPARC docs | Invoke skill directly: "use `sparc-prd-mini` in AUTO mode on `docs/existing/`" |
| **C. Validation-only** | Docs already SPARC-shaped | Rename to `PRD.md`, `Architecture.md`, etc., then "invoke `requirements-validator`" |

### What changes in the pipeline

- **Phase 0** — skipped entirely
- **Phase 1** — `sparc-prd-mini` runs in AUTO mode (no interactive questions),
  reads your docs, generates the 11 SPARC slots; missing parts are marked `[GAP: ...]`
- **Phase 2-4** — unchanged (validation → toolkit → scaffold)

### Caveats

- Your docs may not map cleanly to all 11 SPARC slots — expect `[GAP: ...]` markers
- Validation may flag user stories as "not INVEST" — this is a signal that your
  docs need extending, not a bug
- Architecture constraints (pattern, containers, infra, deploy, AI integration)
  must be passed to Phase 1 explicitly if not in your docs

Full spec: see `.claude/commands/replicate.md` "Alternative entry" section and
the `.claude/rules/replicate-pipeline.md` rule.

## Adding features to an existing project (Mode 2)

If you **already have a working project** (stack defined, PRD/Specification/
CLAUDE.md exist) and want to add new features with the same validation cycle
as `/replicate` — use `/feature`, not `/replicate`.

### Install (idempotent)

```bash
cd existing-project
npx @dzhechkov/p-replicator init     # WILL NOT overwrite your CLAUDE.md
npx @dzhechkov/p-replicator verify   # confirm pre-shipped contract intact
```

### Normalize SPARC paths (one-time)

`/feature` reads docs from standard slots:

```bash
mv docs/your-prd.md   docs/PRD.md             # if you use different names
mv docs/your-spec.md  docs/Specification.md
mv docs/your-arch.md  docs/Architecture.md
# Pseudocode / Refinement / Completion — optional
```

### Run features (3 sub-paths)

| Path | When | Command |
|---|---|---|
| **A. /feature directly** | Single feature, ≥4 files, new capability | `/feature add-stripe-payments` |
| **B. /go auto-router** | Mixed complexity | `/go add-pagination` (routes /plan vs /feature) |
| **C. Direct skill invocation** | Only validation cycle, no full lifecycle | `requirements-validator` + `brutal-honesty-review` |

### Validation thresholds (same swarm as /replicate Phase 2)

| Verdict | Score | Action |
|---|---|---|
| 🟢 READY | ≥ 70 | IMPLEMENT |
| 🟡 CAVEATS | 50-69 | IMPLEMENT + auto-retry once |
| 🔴 NEEDS WORK | < 50 / blockers | return to PLAN, max 3 retries |

### What's preserved during `init`

- `CLAUDE.md` (root) — **not touched** (only `--force` overwrites)
- `docs/PRD.md`, `Specification.md` — **not touched**
- `.claude/commands/your-custom.md` — **not touched** (init only adds pre-shipped 11)
- `.claude/settings.json` — **merged** via v1.4.2+ merge logic with deep-equals
- `.gitignore`, `package.json` — **not touched** by init

### Caveats

- DO NOT run `/start` in Mode 2 — it expects a fresh scaffold
- `/feature-ent` unavailable in Mode 2 without manually adding DDD/ADR/C4 docs
- Auto-commit hooks (Stop) may conflict with custom git workflows — edit
  `settings.json` after `init` (merge preserves your edits on subsequent updates)
- No `--prd-path` flag for non-standard paths — one-time rename/symlink required
  (see KNOWN_LIMITATIONS.md M3)

Full recipe: `02_user_guide.md` section "Feature workflow in an existing project (Mode 2)".

## Verify the install

After `/replicate`, run:

```bash
npx @dzhechkov/p-replicator verify
```

The command checks:

- **Pre-shipped contract** (must-have): 10 skills + 11 commands + 4 agents + 13 rules + settings.json
- **Post-/replicate hints** (advisory): CLAUDE.md, project-specific agents,
  feature-roadmap.json, security rules, etc.

Exit code `0` means the pre-shipped contract is intact; warnings indicate
project-specific artifacts not yet created.

Alternative (general health check):

```bash
npx @dzhechkov/p-replicator doctor
```

## What to do next

Right after `/replicate`, three main paths are available:

### 1. Bootstrap the project (`/start`)

```
/start
```

Builds the scaffold per `docs/Architecture.md`: creates monorepo packages,
generates `package.json`, brings up Docker, runs migrations.

### 2. Autonomous feature build (`/run mvp`)

```
/run mvp                                    # MVP-only features
/run all                                    # everything in roadmap
/run mvp --feature-branches                 # each feature in a separate branch
/run mvp --feature-branches --auto-merge    # also merge each branch into main
```

Loop: `/next` → `/go <id>` → push commit → next feature. Stops when roadmap
is empty.

### 3. One specific feature (`/go`)

```
/go auth-jwt                          # auto-router /plan vs /feature
/feature auth-jwt                     # explicitly run full SPARC-mini cycle
/plan add-payment-gateway             # lightweight plan file
```

## Additional commands

| Command | When to use |
|---|---|
| `/myinsights "description"` | Capture rakes — error/workaround for future sessions |
| `/docs` | Generate user-facing docs (RU + EN) |
| `/harvest` | Extract reusable patterns into knowledge base |
| `/deploy staging` | Deployment workflow with per-tier checks |

## What appears in your project after `init`

```
your-project/
├── .claude/
│   ├── skills/              # 10 skills
│   ├── commands/            # 11 slash commands
│   ├── agents/              # 4 pipeline agents
│   ├── rules/               # 13 rules
│   ├── hooks/               # 6 Node scripts
│   └── settings.json        # hooks + statusline config
├── .p-replicator.json       # install manifest
└── (your existing files…)
```

All `.claude/` files are canonical templates from the package. Don't edit
them directly: on subsequent `update`, they merge through the
`mergeSettingsJson` + `removeOrphanHooks` algorithm (preserving user
customizations).

## Next steps

- Read [02_user_guide.md](./02_user_guide.md) — details on each command
- Read [03_admin_guide.md](./03_admin_guide.md) — hooks/statusline configuration
- If something's off — [06_troubleshooting.md](./06_troubleshooting.md)
