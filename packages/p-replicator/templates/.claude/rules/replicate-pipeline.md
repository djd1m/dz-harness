# Replicate Pipeline Rules

## Phase Sequence

The `/replicate` command executes phases in strict order:

```
Phase 0 (optional) → Phase 1 → Phase 2 → Phase 3 → Phase 4
Product Discovery     Planning   Validation  Toolkit    Finalize
```

Never skip Phase 2 (Validation). Toolkit (Phase 3) MUST be built on validated documentation.

### Optional: UI replication (post-pipeline)

When the goal includes rebuilding a target's **frontend** (not just the business/toolkit), the
`clone-website` skill — [`@dzhechkov/skills-website-cloner`](https://www.npmjs.com/package/@dzhechkov/skills-website-cloner),
the implementation counterpart to `reverse-engineering-unicorn` — produces a pixel-perfect
Next.js clone of a live site.

| Skill | Required | Purpose | Fallback |
|-------|----------|---------|----------|
| `clone-website` | OPTIONAL (external) | Reverse-engineer a live site → running Next.js/shadcn clone | use `frontend-design` to build a fresh UI, or skip |

**Reference, not vendored** (per ADR-0001). It is NOT one of the pre-shipped p-replicator skills
and has hard runtime prerequisites (a browser-MCP + a Next.js/shadcn/Tailwind scaffold). Install
separately: `npx @dzhechkov/skills-website-cloner init` or `dz init --select clone-website`. If
absent or its prerequisites are unmet, skip the UI-clone step and log a warning.

## Skill Loading Protocol

When executing skills during the pipeline:

1. Read the skill's `SKILL.md` file from `.claude/skills/[name]/SKILL.md`
2. When a skill references `/mnt/skills/user/[name]/` — read from `.claude/skills/[name]/` instead.
   *(The ten PRE-SHIPPED skills no longer contain such paths — since 1.8.0 they are pre-baked. This
   rule is for skills you bring yourself.)*
3. When a skill references `/mnt/user-data/uploads/` — read from `docs/` instead
4. When a skill outputs to `/output/` — write to `docs/` or project root instead
5. `goap-research` skill name maps to `goap-research-ed25519` in this repo
6. **CRITICAL:** When a skill has `modules/` directory — you MUST read the FULL module file for EVERY phase before executing it. SKILL.md is the orchestrator only — it contains summaries, NOT the actual generation logic. NEVER generate artifacts from SKILL.md summaries. In a real project, skipping `modules/04-generate-p1.md` caused 10+ artifacts to be silently omitted.
7. See `.claude/rules/skill-interface-protocol.md` for full interface specification

## Modular Skills

Skills with `modules/` directories delegate phases to self-contained module files.
Each module follows: INPUT → PROCESS → OUTPUT → QUALITY GATE interface.

**MANDATORY:** Before executing any modular skill phase, read the corresponding module file in full.
Module files contain the actual generation instructions, templates, and quality gates.
SKILL.md contains only summaries and orchestration logic — it is NOT sufficient for generation.

Currently modularized skills:
- `cc-toolkit-generator-enhanced` — 9 modules (6 core pipeline + 3 extensions)
- `knowledge-extractor` — 4 modules (agent review → classify → decontextualize → integrate)

## Output Paths

All generated files go directly into the project. Never create a separate output directory.

| Category | Path |
|----------|------|
| Product Discovery Brief (Phase 0) | `docs/product-discovery-brief.md` |
| SPARC documentation | `docs/` |
| Validation report | `docs/validation-report.md` |
| BDD scenarios | `docs/test-scenarios.md` |
| Feature docs (future) | `docs/features/` |
| Commands | `.claude/commands/` |
| Agents | `.claude/agents/` |
| Rules | `.claude/rules/` |
| Skills (project-specific) | `.claude/skills/` |
| Hooks | `.claude/settings.json` |
| Project context | `CLAUDE.md` (root) |
| Dev guide | `DEVELOPMENT_GUIDE.md` |
| Scaffolds | `docker-compose.yml`, `Dockerfile`, `.gitignore` |

## Alternative entry: starting from existing technical documentation

The pipeline officially supports starting from user-provided technical
documentation as an alternative to the full Phase 0 (Product Discovery) flow.

### Trigger detection

The orchestrator switches to this entry mode when user input contains any of:
- A path reference (e.g., "use my docs in `docs/existing/`")
- An explicit skip request ("skip discovery", "skip Phase 0")
- A statement of available docs ("I already have technical documentation")
- The semantic flag `--from-docs <path>` or `--skip-discovery`

### Behavior

When triggered:
1. Phase 0 is SKIPPED (no reverse-engineering-unicorn invocation)
2. Phase 1 runs sparc-prd-mini in AUTO mode with pre-filled context from user docs
3. Phase 1 skips internal Explore/Research/Solve sub-phases (those exist to
   generate answers that the user already has)
4. Phase 2 (validation) runs UNCHANGED
5. Phase 3 (toolkit generation) and Phase 4 (finalize) run UNCHANGED

### Three supported sub-paths

| Path | Use case | Skills invoked |
|---|---|---|
| **A** | Full pipeline with existing docs as input | sparc-prd-mini (AUTO) → requirements-validator → cc-toolkit-generator-enhanced |
| **B** | SPARC docs only, no toolkit/scaffold | sparc-prd-mini (AUTO) only |
| **C** | Validation-only (docs already SPARC-shaped) | requirements-validator only |

### Test contract preserved

The alternative entry mode preserves:
- All pre-shipped artifacts (init contract intact)
- Manifest schema (.p-replicator.json including shippedDefaults)
- `verify` and `doctor` exit codes
- All meta-tests (replicate.md ↔ replicate-pipeline.md consistency)

No new flags or state-file fields are required.

## Architecture Constraints

Always pass these constraints to sparc-prd-mini (Phase 1):

- Pattern: Distributed Monolith (Monorepo)
- Containers: Docker + Docker Compose
- Infrastructure: VPS (AdminVPS/HOSTKEY)
- Deploy: Docker Compose direct deploy
- AI Integration: MCP servers
- Storage: у баз и очередей НЕТ публикации на хост — кроме привязки к петле (`127.0.0.1` / `::1`).
  Ни `0.0.0.0`, ни `[::]`, ни один явный внешний адрес, ни `network_mode: host`
  (см. `.claude/rules/docker-ports.md`, «Правило №0»)

## Git Discipline During Pipeline

Commit after each major phase completion:
- After Phase 1: `docs: SPARC documentation for [project-name]`
- After Phase 2: `docs: validation report and BDD scenarios`
- After Phase 3: `feat: Claude Code toolkit for [project-name]`
- After Phase 4: `chore: initial project setup from SPARC documentation`

## What Gets Generated vs Pre-shipped (post v1.4)

### Pre-shipped by `npx @dzhechkov/p-replicator init` (do NOT overwrite)

These files arrive with the package and form the stable workflow toolkit. They
are project-agnostic and can be enhanced (read by Phase 3) but never recreated.

**Skills (10):** all skills in `.claude/skills/` (`explore`, `sparc-prd-mini`,
`goap-research-ed25519`, `problem-solver-enhanced`, `requirements-validator`,
`brutal-honesty-review`, `cc-toolkit-generator-enhanced`,
`reverse-engineering-unicorn`, `pipeline-forge`, `knowledge-extractor`)

**Commands (11):** `replicate`, `harvest`, `start`, `plan`, `feature`, `go`,
`run`, `next`, `myinsights`, `docs`, `deploy`

**Agents (4):** `replicate-coordinator`, `product-discoverer`, `doc-validator`,
`harvest-coordinator`

**Rules (6):** `replicate-pipeline`, `skill-interface-protocol`, `git-workflow`,
`insights-capture`, `feature-lifecycle`, `docker-ports`

**Hooks (8 files in `.claude/hooks/`, cross-platform Node).** Only four are wired to an
event in `.claude/settings.json`; the rest are utilities you invoke deliberately, and the
difference matters — a hook of this package is NON-BLOCKING by contract and can only print.

*Wired to an event:* `session-insights.cjs` (SessionStart) · `autocommit-roadmap.cjs`,
`autocommit-insights.cjs`, `autocommit-plans.cjs` (Stop)

*Invoked deliberately, wired to nothing:* `statusline.cjs` (a statusLine, not a hook) ·
`state-update.cjs` (argv utility) · `check-ports.cjs` (docker-ports Правило №0, exits 0/1/2) ·
`check-growth-trace.cjs` (did the M5 growth seed reach `docs/Specification.md`, exits 0/1/2)

### Generated by /replicate Phase 3 (project-specific — create new)

These exist only AFTER `/replicate` runs because they encode project-specific
data extracted from SPARC docs.

- `.claude/agents/planner.md` — algorithm templates from Pseudocode.md
- `.claude/agents/code-reviewer.md` — edge cases from Refinement.md
- `.claude/agents/architect.md` — system design from Architecture.md
- `.claude/rules/security.md` — NFRs from Specification.md
- `.claude/rules/coding-style.md` — tech-stack conventions
- `.claude/rules/secrets-management.md` — IF external APIs detected
- `.claude/rules/testing.md` — test strategy from Refinement.md
- `.claude/skills/project-context/` — domain knowledge
- `.claude/skills/coding-standards/` — tech-specific patterns
- `.claude/skills/security-patterns/` — IF external APIs
- `.claude/feature-roadmap.json` — feature list from PRD MVP scope
- `.claude/commands/feature-ent.md` — IF DDD docs (idea2prd-manual)
- `.mcp.json` — IF external integrations
- `CLAUDE.md`, `README.md`, `DEVELOPMENT_GUIDE.md`
- `docker-compose.yml`, `Dockerfile`, `.gitignore`
- `docs/*` — all SPARC documentation

### Post-pipeline verification

After `/replicate` completes, run `npx @dzhechkov/p-replicator verify` to
confirm both contracts (pre-shipped + post-/replicate). The `verify` command
detects whether `/replicate` was run (via CLAUDE.md or feature-roadmap.json)
and reports per-artifact status.

## Checkpoint Format

```
═══════════════════════════════════════════════════════════════
✅ PHASE [N]: [Name]
[Summary]
⏸️ "ок" — next | [options]
═══════════════════════════════════════════════════════════════
```

Always wait for user confirmation before proceeding to the next phase.
