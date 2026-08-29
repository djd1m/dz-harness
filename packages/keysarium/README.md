# @dzhechkov/keysarium

**AI Case Research Toolkit for Claude Code**

Full 7-phase pipeline for AI case studies, hackathons, and casariums. Provides skills, commands, rules, shards, agent templates, and brain portability for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

---


> **`goap-research-ed25519` — self-learning (optional, since this release).** When
> [`@dzhechkov/harness-cli`](https://www.npmjs.com/package/@dzhechkov/harness-cli) is on PATH, the
> bundled research skill recalls prior METHOD lessons at the start of an investigation and records new
> ones at four named moments. Without it the skill behaves exactly as before and says so once — it is
> detected, never required. Lessons go to a SEPARATE store (`<project>/.health-brain/.dz`) and never
> to the shared one; recall reads both, so engineering lessons transfer in and medical ones do not
> leave. A format check refuses identifier shapes (email, phone, record numbers) — it does NOT judge
> whether a lesson describes a method or a person, and says so: that judgement is the agent's, per
> the teach protocol. See `skills/goap-research-ed25519/SKILL.md`.

## Growth engine (reverse-engineering-unicorn M5)
### What M5 produces, since 0.2.0 / 1.7.3 / 1.6.0

M5 no longer ends as analysis. Three changes, in the order they matter:

- **Growth type is two independent choices, not one.** A go-to-market MOTION (content, performance,
  sales-led, partnership, self-serve) and a growth LOOP (none, product-led, community, badge/embed,
  one- or two-sided incentivised referral, network effect). The old single list forced one pick
  across both questions, which made the ordinary case — a sales-led company running a referral loop
  — unsayable. Choosing `no loop` is a real answer and skips the loop-only output rather than
  demanding an invented flywheel.
- **A `Growth Requirements Seed` table** turns the analysis into `FR-GROWTH-nnn` DRAFT obligations,
  each naming the block it came from and carrying that block's confidence verbatim. A seed is a
  draft: it does not establish that anything was built.
- **A compliance checklist** runs before any technique becomes a requirement. It cites the norm and
  where to look it up, and deliberately carries no amount, threshold or statute — those are
  jurisdiction-specific and go stale within a year. A `no` answer is recorded against the
  requirement and blocks its promotion. It asks the questions; it is not a legal opinion.

## Quick Start

```bash
# One-command install via npx (no global install needed)
npx @dzhechkov/keysarium

# Or install globally
npm install -g @dzhechkov/keysarium
keysarium init
```

After installation, open Claude Code in your project directory and start using slash commands right away.

---

## What You Get

| Component | Count | Description |
|-----------|-------|-------------|
| **Skills** | 12 | `explore`, `frontend-design`, `goap-research-ed25519`, `presentation-storyteller`, `problem-solver-enhanced`, `reverse-engineering-unicorn`, `knowledge-extractor`, `ai-factory-mapper`, `analyst-manual-full`, `edu-site-generator`, `transcript-site-generator`, `feature-adr` |
| | | *bundled `feature-adr` at pipeline v1.3.66: amendment-Confirmation discipline (AM-N → named falsifying test), derived `🚦 Gates` checkpoint line, opt-in Step-10 Delivery Gate (4-plane post-implementation review), Step-8 no-stubs gate (unwaived `TODO`-class marker in the run's touched files = task incomplete; waivers require a reason)* |
| **Commands** | 19 | `/casarium`, `/new-research`, `/parallel-research`, `/discovery`, `/explore-case`, `/research`, `/cjm-prototype`, `/solve`, `/architecture-phase`, `/presentation`, `/harvest`, `/brain-export`, `/brain-import`, `/feature-adr`, `/init-platform`, `/learning-stats`, `/dream`, `/workers`, `/analyst-manual` |
| **Rules** | 14 | `research-quality`, `checkpoint-protocol`, `agent-swarm`, `domain-specific`, `anti-patterns`, `file-conventions`, `modular-reuse`, `feedback-loops`, `model-routing`, `trust-tiers`, `background-workers`, `dream-cycles`, `reward-learning`, `feature-adr-conventions` |
| **Shards** | 9 | Context shards for each phase: `phase-0-discovery`, `phase-1-explore`, `phase-2-research`, `phase-25-cjm`, `phase-3-solve`, `phase-4-architecture`, `phase-5-presentation`, `phase-ai-factory`, `feature-adr` |
| **Agent Templates** | 5 | `discovery-worker`, `research-worker`, `cjm-variant-worker`, `presentation-worker`, `parallel-research-orchestrator` |
| **Library** | 18 | `phase-utils`, `agent-patterns`, `skill-loader`, `domain-templates`, `memory-protocol`, `reward-tracker`, `dream-engine`, `witness-chain`, `judge-attestation`, `platform-adapters`, `background-workers` + `platform-templates/` (3) and `worker-templates/` (4) |
| **Documentation** | 38 | Deployment, admin, user guide, infrastructure, architecture, flows — 6 doc sets + 2 loose guides (installed only with `--with-docs`) |

Everything is installed into your project's `.claude/` directory and works natively with Claude Code.

> Counts above are MEASURED from the shipped `templates/` tree — reproducer:
> `npx @dzhechkov/keysarium init --dry-run` (the install plan prints the same numbers, computed at
> runtime) or, on a real install, `npx @dzhechkov/keysarium list`. If a count here disagrees with the
> CLI, trust the CLI — it counts files, this table is hand-written.

---

## 7-Phase Pipeline

```
Phase 0     Phase 1     Phase 2     Phase 2.5      Phase 3     Phase 4         Phase 5
DISCOVERY   EXPLORE     RESEARCH    CJM PROTO      SOLVE       ARCHITECTURE    PRESENTATION
  15%         5%          15%         10%            15%          15%             20%
```

| Phase | Command | What It Does |
|-------|---------|--------------|
| **Phase 0 -- Discovery** | `/discovery` | Deep-dive into the product/company: JTBD analysis, competitor landscape, ROI estimation. Powered by the `reverse-engineering` skill. |
| **Phase 1 -- Explore** | `/explore-case` | Adaptive clarification of the case brief. Asks the right questions, structures ambiguity into actionable scope. |
| **Phase 2 -- Research** | `/research` | Paranoid-mode research: analogues, technologies, regulations. Every claim must have a verifiable source. |
| **Phase 2.5 -- CJM Prototype** | `/cjm-prototype` | Customer Journey Map prototyping with multiple variants. Generates a working React prototype. **Mandatory -- never skip this phase.** |
| **Phase 3 -- Solve** | `/solve` | Solution strategy using TRIZ + Game Theory. Produces process diagrams (as-is / to-be). |
| **Phase 4 -- Architecture** | `/architecture-phase` | Technical architecture: C4 diagrams, sequence flows, component design, integration plan. |
| **Phase 5 -- Presentation** | `/presentation` | Storytelling-driven presentation, speaker script, Q&A preparation, and executive summary. |

Each phase produces concrete artifacts (Markdown documents, Mermaid diagrams, JSX prototypes) stored in `researches/<case-slug>/`.

---

## CLI Commands

```bash
npx @dzhechkov/keysarium                    # Full install (interactive, same as init)
npx @dzhechkov/keysarium init               # Install all components
npx @dzhechkov/keysarium init --minimal     # Only .claude/ (no docs, no lib)
npx @dzhechkov/keysarium init --with-docs   # Include documentation
npx @dzhechkov/keysarium init --force       # Overwrite existing files
npx @dzhechkov/keysarium init --dry-run     # Preview without making changes
npx @dzhechkov/keysarium update             # Update to latest version
npx @dzhechkov/keysarium remove             # Clean uninstall
npx @dzhechkov/keysarium list               # Show installed components
npx @dzhechkov/keysarium doctor             # Health check
```

Flags can be combined:

```bash
npx @dzhechkov/keysarium init --minimal --force --dry-run
```

---

## Usage After Install

### Full Pipeline

```bash
# Open Claude Code in your project
claude

# Start a full case study (runs all 7 phases with checkpoints)
/casarium Analyze how AI can automate customer support in banking

# Same pipeline + Cloud.ru AI Factory mapping on every phase
/casarium --ai-factory Analyze how AI can automate customer support in banking
```

### Individual Phases

```bash
# Product discovery
/discovery Analyze Tinkoff Bank

# Case exploration
/explore-case banking customer support automation

# Research phase
/research AI-powered document processing in insurance

# CJM prototyping
/cjm-prototype mobile banking onboarding flow

# Solution design
/solve reduce customer churn using predictive analytics
```

### Multi-Case Research

```bash
# Run multiple cases in parallel
/parallel-research banking automation | retail personalization | healthcare triage

# Create a new isolated research
/new-research smart-warehouse-logistics

# Extract learnings after a project
/harvest researches/bank_kc_automation/
/harvest all
```

### Example: Russian-Language Case (bilingual support)

```bash
/casarium Как AI может автоматизировать процесс обработки обращений клиентов в банке, сократив время ответа с 4 часов до 15 минут?

# Same case + AI Factory service mapping
/casarium --ai-factory Как AI может автоматизировать процесс обработки обращений клиентов в банке, сократив время ответа с 4 часов до 15 минут?
```

The toolkit processes cases in any language and adapts domain rules accordingly.

---

## Cloud.ru AI Factory Mode (`--ai-factory`)

Add the `--ai-factory` flag to `/casarium` to get full Cloud.ru Evolution AI Factory mapping integrated across all phases of the pipeline.

```bash
/casarium --ai-factory <case text>
```

### What it adds

| Phase | Addition |
|-------|----------|
| **Phase 0** | AI Factory applicability assessment appended to `00_product_discovery.md` |
| **Phase 1** | AI Factory context paragraph in `01_case_brief.md` |
| **Phase 2** | Full ai-factory-mapper workflow (catalog sync + decomposition + mapping) → new artifact `02.6_ai_factory_mapping.md` |
| **Phase 2.5** | Each CJM step annotated with the AI Factory service that handles it |
| **Phase 3** | Gap analysis + coverage scoring (%) appended to `03_solution_strategy.md` |
| **Phase 4** | AI Factory services named in C4 diagram + new `diagrams/ai-factory-pipeline.mermaid` |
| **Phase 5** | Full AI Factory report (`ai_factory_analysis.md`) + "AI Factory Coverage" slide |

### Additional artifacts (--ai-factory only)

```
researches/<case-slug>/
├── 02.6_ai_factory_mapping.md          # Step→service mapping with ✅/⚠️/❌
├── ai_factory_analysis.md              # Full analysis report
├── ai_factory_analysis.docx            # DOCX report (if Node.js available)
└── diagrams/
    └── ai-factory-pipeline.mermaid     # Mermaid flowchart of the AI Factory pipeline
```

### Zero-degradation guarantee

Without `--ai-factory`, the pipeline is **identical** to v1.4. The flag is purely additive — no existing artifacts are modified or removed, no phases are altered, no checkpoints are changed.

---

## Domain Support

The toolkit automatically detects the domain from the case description and applies domain-specific rules:

### Banking / FinTech
- On-premise LLM deployment (GigaChat, YandexGPT, open-source models)
- Regulatory compliance: FZ-152, Central Bank requirements, FSTEC
- Human-in-the-Loop mandatory for decision-making
- Data never leaves the security perimeter
- Visual palette: Blue / Navy / Silver

### Retail / E-commerce
- Latency budget: < 200ms for real-time recommendations
- A/B testing as primary validation method
- Personalization vs. privacy balance (GDPR / FZ-152)
- Seasonality and cold-start handling
- Visual palette: Amber / Orange

### Enterprise / B2B
- Change management strategy (people resist AI)
- Legacy system integration planning
- SLA and fault tolerance definitions
- ROI expressed in FTE / hours saved
- Visual palette: Teal / Indigo

### Healthcare
- HITL mandatory for all clinical decisions
- Medical device regulations (FZ-323)
- AI explainability requirements
- Patient data isolation (FZ-152 + medical specifics)

---

## Agent Swarm

The toolkit leverages Claude Code's agent capabilities for parallel execution, significantly reducing research time:

| Phase | Parallel Agents | Tasks |
|-------|-----------------|-------|
| **Phase 0** | 2 agents | JTBD analysis \|\| Competitors + ROI |
| **Phase 2** | 3 agents | Analogues \|\| Technologies \|\| Regulations |
| **Phase 2.5** | 3 agents | CJM Variant A \|\| Variant B+C \|\| Trend Research D |
| **Phase 5** | 3 agents | Presentation \|\| Speaker Script \|\| Q&A + Executive Summary |

Cross-case parallelism is also supported:

```bash
# Runs Phase 0 for up to 4 cases simultaneously
/parallel-research case1 | case2 | case3 | case4
```

Each research is fully isolated in its own `researches/<slug>/` directory.

---

## Research Artifacts

Every completed research produces a structured set of files:

```
researches/<case-slug>/
├── 00_product_discovery.md          # Phase 0 output
├── 01_case_brief.md                 # Phase 1 output
├── 02_research_findings.md          # Phase 2 output
├── 02.5_trend_brief.md              # Phase 2.5 output
├── 02.6_ai_factory_mapping.md       # Phase 2 output (--ai-factory only)
├── 03_solution_strategy.md          # Phase 3 output
├── 04_architecture.md               # Phase 4 output
├── 05_presentation_content.md       # Phase 5 output
├── 06_speaker_script.md             # Phase 5 output
├── 07_qa_preparation.md             # Phase 5 output
├── 08_executive_summary.md          # Phase 5 output (mandatory)
├── ai_factory_analysis.md           # Phase 5 output (--ai-factory only)
├── ai_factory_analysis.docx         # Phase 5 output (--ai-factory only, if Node.js available)
├── prototype/
│   └── cjm-prototype.jsx           # Phase 2.5 React prototype
├── diagrams/
│   ├── architecture-c4.mermaid
│   ├── sequence-main-flow.mermaid
│   ├── process-as-is.mermaid
│   ├── process-to-be.mermaid
│   └── ai-factory-pipeline.mermaid  # Phase 4 output (--ai-factory only)
└── README.md
```

---

## Extending the Toolkit

### Add a Custom Skill

Create a new directory under `.claude/skills/`:

```
.claude/skills/my-custom-skill/
├── SKILL.md          # Skill instructions (loaded by phases)
└── examples/         # Reference materials (optional)
```

### Add a Custom Command

Create a new file under `.claude/commands/`:

```
.claude/commands/my-command.md
```

Commands follow a standard pattern: load required skills, execute logic, produce artifacts, display a checkpoint.

### Add a Custom Rule

Create a new file under `.claude/rules/`:

```
.claude/rules/my-rule.md
```

Rules are automatically loaded by Claude Code and enforced across all phases.

### Knowledge Harvesting (knowledge-extractor skill)

After completing research, extract reusable patterns using the multi-agent knowledge-extractor:

```bash
/harvest researches/<slug>/                    # Full harvest from one directory
/harvest researches/<slug>/ only patterns      # Extract only patterns
/harvest all                                   # Harvest from all researches
/harvest all only rules,templates              # All researches, specific categories
/harvest features/my-feature/                  # Harvest from a feature directory
```

**Pipeline:** Extract (5 parallel agents) → Classify (7 categories) → User Checkpoint → Gate (8 quality checks) → Integrate (auto-place)

| Stage | What Happens |
|-------|-------------|
| **Extract** | 5 parallel agents scan through different lenses: patterns, commands, rules, templates, snippets |
| **Classify** | Findings sorted into 7 categories (`skills`, `commands`, `hooks`, `rules`, `templates`, `patterns`, `snippets`) with cross-dedup |
| **User Review** | Numbered list of findings with granular control (`#N` commands to accept/reject/merge) |
| **Quality Gates** | 8 blocking gates in 2 passes: deterministic (G1-G2, G5-G7) + semantic via haiku (G3-G4, G8) |
| **Integrate** | Auto-placement into `.claude/` directories + `TOOLKIT_HARVEST.md` update + harvest report |

The skill is **domain-agnostic** — works in any project, not just Keysarium research pipelines. Optional integrations (reward learning, dream cycles, brain export) activate automatically when their infrastructure is present.

### Brain Portability (v1.1)

Export and import accumulated knowledge between projects:

```bash
# Export knowledge as a portable JSON container (v1.1 with manifest + checksum)
/brain-export

# Delta export — store only changes since last export (COW mode)
/brain-export --delta keysarium-brain-2026-03-01.json

# Import a brain container into another project
/brain-import path/to/brain.json
```

**v1.1 features:** SHA-256 integrity manifest, delta exports via JSON Patch (RFC 6902), 2-tier memory index, HOT/WARM/COLD/PURGE record lifecycle. Backward compatible with v1.0 brain files.

### Context Shards

Shards (`.claude/shards/`) are lightweight context fragments that phases load on demand. They keep the main CLAUDE.md lean while providing phase-specific instructions, semantic completion promises, and quality checklists.

---

## Requirements

- **Claude Code CLI** -- installed and configured ([installation guide](https://docs.anthropic.com/en/docs/claude-code))
- **Node.js >= 16.0.0** -- required for `npx` / `npm install`

---

## License

[MIT](https://opensource.org/licenses/MIT)

---

## Links

- **GitHub:** [https://github.com/djd1m/dz-harness-hub](https://github.com/djd1m/dz-harness-hub) (package source: `packages/@dzhechkov/keysarium`)
- **Issues:** [https://github.com/djd1m/dz-harness-hub/issues](https://github.com/djd1m/dz-harness-hub/issues)
- **npm:** [https://www.npmjs.com/package/@dzhechkov/keysarium](https://www.npmjs.com/package/@dzhechkov/keysarium)

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

## Status

`1.5.42` — refreshes the bundled `feature-adr` Step-5 module with the mandatory `Observability`
section. No keysarium behaviour changes. See `@dzhechkov/skills-feature-adr@1.5.4`.


`1.5.41` — refreshes the bundled `feature-adr` gate script with the C6 amendment-integrity fix (each
amendment scoped to its own block; closes a false refusal on markers below the old three-line window
AND a false pass where a testless amendment borrowed its neighbour's marker). No keysarium behaviour
changes. See `@dzhechkov/skills-feature-adr@1.5.3`.


`1.5.38` — a fix to the bundled `feature-adr` gate script in `templates/`, no pipeline change.

The bundled K2 plan-completeness gate now tells an **ABSENT** `00_complexity_assessment.md` from a
deliberate skip: a missing file is a WARNING that names the missing artifact, while a present file
carrying no acid table is an honest SKIP. Both used to report as a clean skip, so the acid check
silently switched itself off whenever Step 0 wrote nothing — MEASURED 2026-08-21, 66 of 199 features
carried that file and the last four in a row did not.

`1.5.40` — the bundled `feature-adr` Step-8 module now describes the amendment gate as the command
`dz amendment-check` instead of a judgement the reviewer is asked to make. Text only; no pipeline change.
