# Replicate Pipeline Rules

## Phase Sequence

The `/replicate` command executes phases in strict order:

```
Phase 0 (optional) → Phase 0.5 (always) → Phase 1 → Phase 2 → Phase 3 → Phase 4
Product Discovery    Source Product Profile  Planning   Validation  Toolkit    Finalize
```

Never skip Phase 2 (Validation). Toolkit (Phase 3) MUST be built on validated documentation.

### Phase 0.5: Source Product Profile (mandatory)

Never skip it either, and note WHERE it sits: Phase 0 is optional and `--from-docs` skips it
entirely, while Phase 0.5 runs in EVERY case. That is why it is a separate phase and not a seventh
module of `reverse-engineering-unicorn` — a module inside Phase 0 would switch itself off for
precisely the projects that arrive with someone else's documentation, which are usually
replications of someone else's product.

When a project reproduces an existing product, that product's LOOK — palette, typography, density,
layout, the order of steps — is the substance of the task. The phase records one of three outcomes
in `docs/source-product-profile.md`:

| Outcome | Meaning | Palette |
|---|---|---|
| `СНЯТ` | the look was captured | from the source; a filled `FR-LOOK-nnn` seed table. It SUPERSEDES the industry table in `025-cjm-prototype.md` |
| `НЕ ИЗМЕРЕНО` | a source was NAMED but not captured; reason from the closed list `no-browser-mcp` \| `unreachable` \| `auth-required` \| `out-of-scope` | industry table, LABELLED a fallback |
| `ИСТОЧНИКА НЕТ` | the project replicates nothing — a legitimate answer | industry table, LABELLED a fallback |

The middle outcome is what the phase exists for. Per
[`honest-configuration`](./honest-configuration.md) CFG-I4, an unreachable source of truth yields
UNKNOWN, never a plausible value — and a palette invented for a product nobody looked at is exactly
that plausible value.

**Identifiers: ONE family, the axis is a COLUMN.** `FR-LOOK-<nnn>`, three digits, never reused, each
row naming its axis — `облик` (what is seen) or `путь` (the order of screens). A second namespace
such as `FR-FLOW-nnn` would have to be kept in step with the first; one family with a column
does not.

**Each axis answers for itself, because they fail apart.** A landing page captures while the
click-through dies on a 403, so one shared status would have to lie about one of them:
`**Статус съёмки:**` answers for `облик`, `**Статус съёмки (путь):**` for `путь`. That is one extra
header line in the SAME artifact, not a second document. The path declaration is required only when
the axis carries no rows — rows are its answer. The closed reason list, each entry naming a
different repair: `no-browser-mcp` · `no-browser` · `unreachable` · `auth-required` · `out-of-scope`
· `bot-protected` · `timeout` · `robots-disallowed`.

**The `путь` instrument:** `node .claude/hooks/capture-source-path.cjs <url>` clicks through the
source product in a browser and emits `FR-LOOK-nnn` rows on the `путь` axis, continuing the
profile's numbering. `0` captured · `1` the source opened but has no onward step (a one-screen
product — a legitimate `ИСТОЧНИКА НЕТ` for this axis) · `2` `НЕ ИЗМЕРЕНО` with a named reason.
Playwright is an EXTERNAL prerequisite exactly like `clone-website`'s browser MCP: this package has
ZERO dependencies, so its absence is the honest outcome `no-browser`, never a stalled pipeline.

**What may be captured, and what may not — this is a legality boundary, not a preference.**

| Capture | Do not capture |
|---|---|
| REGULARITIES: the spacing step, the type scale, how many hierarchy levels, how many form fields, how many screens to first value | VALUES as things to carry over: this exact purple, this exact typeface |
| Computed styles and semantic roles (aria, form types, accessible names) | Class names such as `sx-ds2y8i` — bundlers change them every build of someone else's site |

Third-party CSS and DOM are someone else's code under copyright: a basis for MEASUREMENT, never
material to copy into your product — so the instrument does not store them by default. A logo, a
name and brand colours TOGETHER are trademarks. Before crawling more than ONE page, read the target's
`robots.txt`; a refusal is the outcome `robots-disallowed`, not an obstacle. Authentication and any
circumvention of a site's technical measures are FORBIDDEN — a login screen is the legitimate last
step of a path, recorded and stopped at. Crawl politely: one thread, a pause between pages, a small
page budget.

**Deterministic half:** `node .claude/hooks/check-look-trace.cjs .` — `0` traced, `1` proven loss
with the ids named, `2` THE CHECK DID NOT RUN (no profile, no Specification, an untouched template
table, an undeclared empty `путь` axis, or either non-capture outcome). Exit `2` is never "all
clear". A proven loss outranks an unanswered axis: `1` beats `2`.

**The capture skill is CALLED, never vendored.** It is the canonical `clone-website` skill —
[`@dzhechkov/skills-website-cloner`](https://www.npmjs.com/package/@dzhechkov/skills-website-cloner),
the implementation counterpart to `reverse-engineering-unicorn` — run **recon-only** here, and in
full when a pixel-perfect Next.js clone of the live site is the goal (post-pipeline).

| Skill | Required | Purpose | Fallback |
|-------|----------|---------|----------|
| `clone-website` | OPTIONAL (external) | Phase 0.5 recon of the source look; post-pipeline, a running Next.js/shadcn clone | record `НЕ ИЗМЕРЕНО` with reason `no-browser-mcp`; for a fresh UI use `frontend-design`, or skip |

**Reference, not vendored** (per ADR-0001). It is NOT one of the pre-shipped p-replicator skills
and has hard runtime prerequisites (a browser-MCP + a Next.js/shadcn/Tailwind scaffold). Install
separately: `npx @dzhechkov/skills-website-cloner init` or `dz init --select clone-website`. If
absent or its prerequisites are unmet, Phase 0.5 still runs and answers `НЕ ИЗМЕРЕНО` with a named
reason; the post-pipeline UI-clone step is skipped with a warning.

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
| Source Product Profile (Phase 0.5) | `docs/source-product-profile.md` |
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
1.5. Phase 0.5 STILL RUNS — the skip covers Phase 0 alone. Where the user's docs describe the source
   product, its look is recorded `СНЯТ` from them; where they do not, `НЕ ИЗМЕРЕНО` with a reason
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

**Rules (13):** `replicate-pipeline`, `skill-interface-protocol`, `git-workflow`,
`insights-capture`, `feature-lifecycle`, `docker-ports`,
[`cost-of-detection-ladder`](cost-of-detection-ladder.md), `swarm-file-evidence`,
`honest-configuration`, [`embeddable-widget`](embeddable-widget.md),
[`incoming-webhooks`](incoming-webhooks.md), [`long-running-job`](long-running-job.md),
[`model-call-cost`](model-call-cost.md)

**Hooks (23 files in `.claude/hooks/`, cross-platform Node).** Only four are wired to an
event in `.claude/settings.json`; the rest are utilities you invoke deliberately, and the
difference matters — a hook of this package is NON-BLOCKING by contract and can only print.

*Wired to an event (4):* `session-insights.cjs` (SessionStart) · `autocommit-roadmap.cjs`,
`autocommit-insights.cjs`, `autocommit-plans.cjs` (Stop)

*Invoked deliberately, wired to nothing (19):* `statusline.cjs` (a statusLine, not a hook) ·
`state-update.cjs` (argv utility) · `write-insight.cjs` (harvest carrier writer) ·
`check-ports.cjs` (docker-ports Правило №0, exits 0/1/2) ·
`check-docs-complete.cjs` (are the Phase-1 documents written, exits 0/1/2) ·
`check-swarm-receipts.cjs` (did every parallel unit deliver its named terminal file, exits 0/1/2) ·
`check-growth-trace.cjs` (did the M5 growth seed reach `docs/Specification.md`, exits 0/1/2) ·
`check-look-trace.cjs` (did the Phase-0.5 source-look seed reach `docs/Specification.md`, exits 0/1/2) ·
`capture-source-path.cjs` (Phase-0.5 `путь` axis: click through the source, exits 0/1/2) ·
`check-embed-contract.cjs` (was the embeddable widget checked on a FOREIGN origin, exits 0/1/2) ·
`check-webhook-contract.cjs` (is the incoming webhook signed, deduplicated by a named repeat key and
safe against reordering, exits 0/1/2)
`check-job-contract.cjs` (does long-running work have a handle, three states and a resuming retry, exits 0/1/2)
`check-model-cost.cjs` (does every external model call name a binding spend ceiling, exits 0/1/2)
`check-canon.cjs` (before a WRITING fan-out: is the shared canon named and pinned, exits 0/1/2)
`check-file-ownership.cjs` (one writer per file, and a split-born file owned at creation, exits 0/1/2)
`check-source-version.cjs` (does every edit and verdict declare the source version it was built on, exits 0/1/2)
`check-handoff-manifest.cjs` (did every enumerated Phase-0 output get an answer from Phase 1, exits 0/1/2)
`check-external-deps.cjs` (does the external-dependency inventory exist and carry a verdict per row, exits 0/1/2)
`check-metric-source.cjs` (does every success metric name where its value comes from, exits 0/1/2)

The count must agree with `statusline.cjs` → `hooksExpected` and `src/utils.js` →
`COMPONENTS.hooks.items`; a test asserts all three.

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
