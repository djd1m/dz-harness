<div align="center">

# 🚀 @dzhechkov/p-replicator

### **Claude Code toolkit for AI-assisted product development**
##### *Transform a product idea — or existing project — into fully documented, validated, toolkit-equipped code*

<br>

[![npm version](https://img.shields.io/npm/v/@dzhechkov/p-replicator?color=cb3837&label=npm&style=for-the-badge&logo=npm)](https://www.npmjs.com/package/@dzhechkov/p-replicator)
[![License](https://img.shields.io/badge/License-MIT-22c55e.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%E2%89%A516-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)

[![Tests](https://img.shields.io/badge/tests-440%20pass%20%7C%203%20skip-22c55e?style=flat-square)](#test-infrastructure)
[![Skills](https://img.shields.io/badge/skills-10-8b5cf6?style=flat-square)](#skills-reference)
[![Commands](https://img.shields.io/badge/slash%20commands-11-f59e0b?style=flat-square)](#commands-reference)
[![Hooks](https://img.shields.io/badge/hooks-24-3b82f6?style=flat-square)](#hooks-system)
[![SPARC Pipeline](https://img.shields.io/badge/SPARC-5%20phases-ec4899?style=flat-square)](#pipeline-overview--replicate-phases)

<br>

**[📦 npm](https://www.npmjs.com/package/@dzhechkov/p-replicator)** · **[💻 GitHub](https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator)** · **[🐛 Issues](https://github.com/djd1m/dz-harness-hub/issues)** · **[💬 Telegram](https://t.me/llm_notes)**

</div>

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

## 📚 Documentation in your language

| Language | Format | Description |
|---|---|---|
| 🇷🇺 Русский | [Markdown (8 sections)](./README/ru/README.md) | ~3000 строк deep-dive докуменации |
| 🇬🇧 English | [Markdown (8 sections)](./README/eng/README.md) | ~3000 lines deep-dive documentation |
| 🌐 Interactive | [HTML guide (RU)](./README/ru/html/index.html) | Single-page with search, theming, syntax highlighting |

> 📌 **This README is comprehensive and self-contained** — covers ~95% of what most users need. For deep dives (architecture internals, full troubleshooting, formal API schemas) see the eng/ folder.

---

## 📑 Table of Contents

<table>
<tr>
<td width="50%" valign="top">

**🌟 Getting Started**
- [📖 What is p-replicator?](#-what-is-p-replicator)
- [🚀 Quick Start](#-quick-start)
- [📑 Already have technical docs?](#-already-have-technical-documentation)
- [🔧 Adding features (Mode 2)](#-adding-features-to-an-existing-project-mode-2)
- [📦 Installation](#-installation)
- [📋 What Gets Installed](#-what-gets-installed)
- [✅ Verify the install](#-verify-the-install)

**🛠️ Reference**
- [🎯 Pipeline overview](#-pipeline-overview--replicate-phases)
- [🧠 Skills Reference](#-skills-reference)
- [⚡ Commands Reference](#-commands-reference)
- [💻 CLI Commands](#-cli-commands)
- [🎚️ Validation Cycle](#-validation-cycle-details)
- [🔄 Feature Lifecycle](#-feature-lifecycle--feature-command)

</td>
<td width="50%" valign="top">

**⚙️ Operations**
- [📊 Statusline Dashboard](#-statusline-dashboard)
- [🪝 Hooks System](#-hooks-system)
- [🗺️ Roadmap & Insights](#%EF%B8%8F-roadmap--insights)
- [🏛️ Architecture Highlights](#%EF%B8%8F-architecture-highlights)
- [⚙️ Configuration](#%EF%B8%8F-configuration)
- [🔄 Update workflow](#-update-workflow)

**🆘 Help & Meta**
- [🆘 Troubleshooting](#-troubleshooting)
- [📈 Migration](#-migration)
- [🧪 Test Infrastructure](#-test-infrastructure)
- [⚠️ Known Limitations](#%EF%B8%8F-known-limitations)
- [📜 Changelog Highlights](#-changelog-highlights)
- [🤝 Contributing](#-contributing)
- [📃 License](#-license)

</td>
</tr>
</table>

> 💡 **Quick navigation tip:** TOC items use emoji visual anchors instead of plain text — easier to scan than 26 dark-blue links.

<div align="center">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>

## 📖 What is p-replicator?

`@dzhechkov/p-replicator` installs a ready-made `.claude/` toolkit into any project: **11 slash commands**, **10 skills**, **4 agents**, **13 rules**, **24 hook utilities**, and a `settings.json` with pre-configured hooks and a multi-line statusline dashboard.

The flagship `/replicate` command takes a project through a **6-phase pipeline**:

```
Phase 0 (optional)    Product Discovery     reverse-engineering of similar companies
Phase 0.5 (ALWAYS)    Source Product Profile  capture the LOOK of the product being replicated

> **Third-party design analyses enter as HYPOTHESES (v1.13).** A ready-made DESIGN.md from a
> library like styles.refero.design is a claim, not a measurement: the profile header now carries
> `**Происхождение:**` (closed list: `прокликано | сторонний-разбор | вручную | не снято`), and a
> `сторонний-разбор` row REQUIRES the analysis source + its own capture date (read from the
> source's markup, e.g. `extractedAt` — never from a tool's paraphrase). Hypothesis rows never
> reach `Specification.md` without a DATED live confirmation; the gate is
> `node .claude/hooks/check-look-origin.cjs .` (exit `0` verified · `1` a promoted hypothesis is
> NAMED · `2` the check did not run — never "all clear").
>
> **Quoted evidence is now byte-verifiable (v1.13).** In `goap-research-ed25519`, every quote
> carries a closed acquisition method (`raw-fetch | tool-summary | search-listing | manual`), and
> the "verbatim" verdict can ONLY be produced by `verify_verbatim` comparing the quote against a
> captured source excerpt (sha256-bound, self-gitignoring store) — a report cannot attest its own
> quotes, and a tool paraphrase is categorically capped below "verbatim". A quoted phrase absent
> from its stored source is a named violation.
Phase 1               Planning              11 SPARC documents (PRD, Architecture, Pseudocode, ...)
Phase 2               Validation            5-agent swarm validates against INVEST + SMART
Phase 3               Toolkit Generation    project-specific agents, rules, skills
Phase 4               Finalize              docker-compose.yml, Dockerfile, .gitignore + git commit
```

Plus **`/feature`** for adding new features to a project with the same SPARC-mini validation cycle, **`/run --feature-branches`** for autonomous batch builds with per-feature git branches, **`/harvest`** for extracting reusable patterns into a knowledge base, and 8 more commands (`/start`, `/plan`, `/go`, `/next`, `/myinsights`, `/docs`, `/deploy`, `/feature-ent`).

**Two main use cases:**

| Use case | Entry command | Time | Result |
|---|---|---|---|
| **Bootstrap a new project** from idea or company name | `/replicate` | 45–90 min | Fully-documented project + scaffold + Docker |
| **Add features** to an existing project | `/feature` (Mode 2) | 10–30 min per feature | Validated SPARC docs + implementation + review |

**Target architecture for generated projects:**
- **Pattern:** Distributed Monolith (Monorepo)
- **Containers:** Docker + Docker Compose
- **Infrastructure:** VPS (e.g., AdminVPS, HOSTKEY)
- **Deploy:** Docker Compose direct deploy
- **AI Integration:** MCP servers

---

## 🚀 Quick Start

```bash
# 1. Install in any project
cd your-project
npx @dzhechkov/p-replicator init

# 2. Open Claude Code
claude

# 3. Run the pipeline
/replicate "Online marketplace for handmade crafts with AI-powered recommendations"
```

The system walks you through 4–5 phases with interactive checkpoints. At each checkpoint you review the output and confirm before proceeding.

**Estimated time:** 45–90 minutes for the full pipeline (Phase 0 optional).

After `/replicate` completes:
- `/start` — bootstrap the scaffold from `Architecture.md`
- `/run mvp` — autonomous feature build from roadmap
- `/feature <id>` — single-feature lifecycle

---

## 📑 Already have technical documentation?

If you already have tech specs, architecture notes, or API docs for the project, you can skip Phase 0 (Product Discovery) and feed your existing docs into Phase 1 as input:

```bash
mkdir -p docs/existing
cp your-tech-doc-*.md docs/existing/   # place your existing docs here

claude
/replicate "Use my existing docs in docs/existing/, skip Phase 0"
```

**Three sub-paths:**

| Path | When | Result |
|---|---|---|
| **A. Full pipeline** | Have tech docs, want full pipeline + toolkit + scaffold | All 11 SPARC docs + validation + toolkit + scaffold |
| **B. SPARC docs only** | Want only the 11 SPARC docs | Invoke `sparc-prd-mini` skill in AUTO mode |
| **C. Validation-only** | Existing docs already SPARC-shaped | Rename to `PRD.md`, `Architecture.md`, ... + invoke `requirements-validator` |

**Modified flow when triggered:**
- **Phase 0** — SKIPPED entirely
- **Phase 1** — `sparc-prd-mini` runs in **AUTO mode**, reads your docs, generates the 11 SPARC slots; missing parts marked `[GAP: ...]`
- **Phase 2-4** — unchanged

Full recipe: see [User Guide](./README/eng/02_user_guide.md#starting-from-existing-tech-docs) ([RU](./README/ru/02_user_guide.md#альтернативный-вход-у-вас-уже-есть-техдокументация)).

---

## 🔧 Adding features to an existing project (Mode 2)

If you already have a working project (stack, PRD, CLAUDE.md, Specification defined) and want to **add new features** with the same SPARC-mini validation cycle that `/replicate` provides — use `/feature` (Mode 2):

```bash
cd existing-project
npx @dzhechkov/p-replicator init      # idempotent — preserves CLAUDE.md
claude
/feature add-stripe-payments          # 4-phase: PLAN → VALIDATE → IMPLEMENT → REVIEW
```

`/feature` runs the same validation pipeline as `/replicate` Phase 2, scoped to a single feature. Same verdicts: 🟢 READY (≥70) / 🟡 CAVEATS (50–69) / 🔴 NEEDS WORK (<50). Same retry logic. Same `brutal-honesty-review` post-implementation.

**Two officially supported entry modes for `/feature`:**

| Mode | When | Pre-conditions |
|---|---|---|
| **Mode 1: Post-/replicate** | Project bootstrapped via `/replicate` | CLAUDE.md, docs/, scaffold all generated by /replicate |
| **Mode 2: Existing project** | Working project, adding features with verification | `init` ran on top of existing project; CLAUDE.md already exists |

**Three sub-paths for Mode 2:**

| Path | When | Skills invoked |
|---|---|---|
| **A. /feature directly** | Single feature ≥4 files, new capability | sparc-prd-mini → requirements-validator → parallel implement → brutal-honesty-review |
| **B. /go auto-router** | Mixed complexity | Routes between /plan (≤3 files) and /feature (≥4 files) |
| **C. Direct skill invocation** | Only validation cycle | requirements-validator + brutal-honesty-review skills directly |

**Mode 2 setup (one-time):**

```bash
# 1. Install (idempotent — does NOT touch CLAUDE.md or existing .claude/ files)
npx @dzhechkov/p-replicator init
npx @dzhechkov/p-replicator verify

# 2. Normalize SPARC paths (one-time)
mv docs/your-prd.md   docs/PRD.md
mv docs/your-spec.md  docs/Specification.md
mv docs/your-arch.md  docs/Architecture.md

# 3. (Optional) feature-roadmap for batch mode via /run
cat > .claude/feature-roadmap.json << 'EOF'
{"features": [{"id": "stripe-payments", "title": "Stripe", "priority": "mvp", "status": "planned"}]}
EOF
```

> ⚠️ **Mode 2 caveats:**
> - DO NOT run `/start` — it expects a fresh scaffold
> - `/feature-ent` unavailable in Mode 2 without DDD/ADR/C4 docs
> - Auto-commit hooks may conflict with custom git workflows — edit `settings.json` after `init`
> - No `--prd-path` flag for non-standard paths — one-time rename/symlink required (see [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) M3)

Full recipe: see [User Guide](./README/eng/02_user_guide.md#feature-workflow-in-an-existing-project-mode-2) ([RU](./README/ru/02_user_guide.md#feature-workflow-в-существующем-проекте-mode-2)).

### Three traceability gates

Byte-level formats of the three reports (`validation-report.md`, `05_completion.md`, `review-report.md`) live in `templates/.claude/skills/requirements-validator/references/feature-report-contracts.md`; `/feature` names them per phase, the gates below enforce them. The shared `brutal-honesty-review` skill stays byte-identical to its canonical copy — the specification contract is a `/feature` obligation, not a change to the generic reviewer.

`/feature` refuses silent traceability loss at validation, implementation, and review. The
requirements score also has a `Traceability = 0` blocking floor: without a `## Criterion scenarios`
table mapping every AC id to a named scenario, a high average cannot advance the story.

| Check | Command | Expected pass | Example named gap |
|---|---|---|---|
| Machine-key traceability and the scoring floor's input | `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --traceability` | `PASS traceability: 3 AC ids mapped to 3 scenarios` | `GAP AC-checkout-2: no named scenario in 02_pseudocode.md` |
| Validation report is bound to the current specification bytes | `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --report-revision` | `PASS report-revision: validation-report.md matches 01_specification.md` | `GAP report-revision: validation=4f27c19c9b20 specification=8ab35d68e021` |
| Every criterion names a real test file and title | `bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --completion` | `PASS completion: 3 AC ids covered by tests` | `GAP AC-checkout-2: test title not found in tests/checkout.test.js` |
| Review discloses its family and answers the exact specification revision | `node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/check-review-contract.cjs" "${CLAUDE_PROJECT_DIR:-.}" "checkout"` | `PASS review-contract feature=checkout AC-ids=3 rows=3` | `GAP AC-checkout-2 has no Spec conformance row` |

All four commands use the same fail-closed convention: exit `0` passes, exit `1` prints every named
gap, and exit `2` means the inputs could not be established. Neither non-zero result is a warning.

---

## 📦 Installation

### Prerequisites

- **Node.js** ≥ 16.0.0
- **Claude Code** installed (CLI or web)
- **Git** initialized in the project (`git init` if not already)
- **Docker + Docker Compose** (needed for `/start` Phase 3, optional for `/feature`)

### Install command

```bash
cd your-project
npx @dzhechkov/p-replicator init
```

This creates:

- `.claude/skills/` — 10 pre-shipped skills
- `.claude/commands/` — 11 slash commands (`/replicate`, `/run`, `/feature`, ...)
- `.claude/agents/` — 4 pipeline agents
- `.claude/rules/` — 9 governance rules
- `.claude/hooks/` — 24 cross-platform Node scripts
- `.claude/settings.json` — hooks + statusline configuration
- `.p-replicator.json` — install manifest

> 📌 **Idempotency:** `init` will NOT overwrite existing files without `--force`. Your `CLAUDE.md`, custom commands, and modified settings are preserved.

### Common install scenarios

| Scenario | Command |
|---|---|
| Fresh project | `npx @dzhechkov/p-replicator init` |
| Existing project (preserve all custom files) | `npx @dzhechkov/p-replicator init` (idempotent — same as fresh) |
| Upgrade (preserve user customizations) | `npx @dzhechkov/p-replicator@latest update` |
| Repair broken install | `npx @dzhechkov/p-replicator init --force` |
| Full reset (loses custom hooks) | `npx @dzhechkov/p-replicator init --force --reset-settings` |
| Preview without writing | `npx @dzhechkov/p-replicator init --dry-run` |

---

## 📋 What Gets Installed

| Component | Count | Description |
|-----------|-------|-------------|
| **Skills** | 10 | 92 files (880K+ chars — MEASURED via `wc -c` over `templates/.claude/skills`: 880,679). Modular architecture: foundation → composite → master orchestrator |
| **Commands** | 11 | `/replicate`, `/harvest`, `/start`, `/plan`, `/feature`, `/go`, `/run`, `/next`, `/myinsights`, `/docs`, `/deploy` |
| **Agents** | 4 | `replicate-coordinator`, `product-discoverer`, `doc-validator`, `harvest-coordinator` |
| **Rules** | 13 | `cost-of-detection-ladder`, `replicate-pipeline`, `skill-interface-protocol`, `git-workflow`, `insights-capture`, `feature-lifecycle`, `docker-ports`, `swarm-file-evidence`, `honest-configuration`, `embeddable-widget`, `incoming-webhooks` |
| **Hooks** | 15 | Fifteen cross-platform Node utilities: 4 wired to events, 11 invoked deliberately (the harvest insight writer, the status line, and seven `check-*` gates) |
| **Settings** | 1 | `settings.json` with statusLine + SessionStart + UserPromptSubmit + Stop hooks pre-configured |

After running `/replicate`, the toolkit also generates **project-specific** artifacts:

- `.claude/agents/planner.md`, `code-reviewer.md`, `architect.md` (project-aware)
- `.claude/rules/security.md`, `coding-style.md`, `testing.md`, optionally `secrets-management.md`
- `.claude/skills/project-context/`, `coding-standards/`, optionally `security-patterns/`
- `.claude/feature-roadmap.json` (from PRD MVP scope)
- `CLAUDE.md` enhanced with project-specific content
- `DEVELOPMENT_GUIDE.md`, project `README.md`
- `docker-compose.yml`, `Dockerfile`, `.gitignore` (Phase 4 scaffolds)
- `docs/*` — all SPARC documentation (11 files)

---

## 📈 Growth: from analysis to obligation

Phase 0's M5 module used to end as analysis — and the analysis had nowhere to go, because the Product
Discovery Brief was never written to disk at all. Since 1.7.0:

- Phase 0 writes `docs/product-discovery-brief.md`.
- M5 emits a **Growth Requirements Seed**: `FR-GROWTH-nnn` DRAFT obligations, each naming the
  analysis block it came from and carrying that block's confidence verbatim.
- Growth type is **two independent choices** — a go-to-market MOTION and a growth LOOP. The old
  single list forced one pick across both, which made "sales-led company running a referral loop"
  unsayable. `No loop` is a real answer and skips the loop-only output.
- A **compliance checklist** runs before a technique becomes a requirement. It names the norm and
  where to check it, never an amount or a statute — those go stale and are jurisdiction-specific.
  A `no` answer blocks that requirement's promotion.
- Phase 2's validator gains a **conditional** `Growth Traceability` criterion: `+5` traced, `+0` not
  applicable, `-10` applicable but dropped. It scores outside the 100-point table, and a project with
  no acquisition objective — or one that never ran Phase 0 — scores `+0`, never a penalty.

What none of this proves: that anything was built, or that copying a competitor's move is lawful.

## 🔎 Deliberate checks

Six of the nine hook utilities run themselves. Three do not: they are utilities you invoke when you want
an answer, and they are wired to no event on purpose. A hook of this package is **non-blocking by
contract** — it can print, never refuse — so a check that must be able to say "no" cannot be one.
The package also ships the non-hook Bash traceability checker described after those three utilities;
`/feature` invokes it as a blocking pipeline gate.

Each answers with **three** exit codes, and the third is the one that matters:

| Code | Meaning |
|:---:|---|
| `0` | the rule holds |
| `1` | the rule is violated — the offender is named |
| `2` | **the check did not run** — it could not look, and says so |

A checker that answers "clean" when it could not look turns an unknown into a reassurance. That is
why a missing config, a missing docker, or a missing brief is `2` and never `0`.

### `check-ports.cjs` — no database faces the internet

```bash
node .claude/hooks/check-ports.cjs .          # catalog: one Compose project
node .claude/hooks/check-ports.cjs --machine  # point-in-time snapshot of the current Docker context
```

```
❌ Правило №0 нарушено (.claude/rules/docker-ports.md):
   • db: порт 5432 → 5432 (без адреса — значит все интерфейсы) — хранилище опубликовано наружу.
     Убрать ports: целиком, либо привязать к 127.0.0.1
```

Catalog mode reads one normalised config (`docker compose config`), so the short port form and
`extends` are already resolved. It catches `network_mode: host` and services published beside a
reverse-proxy, but it never queries running containers. Its clean receipt is limited to that selected
catalog. A loopback bind (`127.0.0.1:` or `[::1]:`) is legal in catalog mode — that exception remains
part of the rule.

For Redis/Memcached, catalog mode also classifies visible authentication configuration: established
absence of a password is `1`, while a config-bearing volume/custom image that can hide the answer is
`2`, never a guessed clean result. The catalog loopback exception is applied first and remains legal.

Machine mode enumerates recognised running storage containers in the current Docker context, inspects
their live bind addresses and Compose ownership labels, and probes live Redis authentication there
only. Its clean receipt is a point-in-time snapshot, not continuous monitoring and not a claim about
stopped containers or another Docker context. A live loopback Redis without a password is reported as
a separate violation even though the catalog loopback exception remains legal.

Both scopes preserve the same contract: `0` means the selected scope was checked clean, `1` means a
violation was established, and `2` means **the check did not run to completion** (`проверка НЕ
ВЫПОЛНЕНА`) because Docker/config/permissions or a required runtime observation was unavailable.

**When to run it:** after writing or editing `docker-compose.yml`, and before any deploy.

### `check-docs-complete.cjs` — the cheap question, before the swarm

```bash
node .claude/hooks/check-docs-complete.cjs .
```

```
❌ документы Фазы 1 не готовы к валидации (1):
   • PRD.md: пуст или почти пуст (5 симв., порог 200)
   Рой валидации запускать рано: он потратит агентов на то, что видно отсюда.
```

Phase 2 launches a swarm of validation agents over whatever Phase 1 produced. Existence, emptiness
and unfilled placeholders are decidable by forty lines of code — this asks them first, so the swarm
is spent on testability and completeness rather than on discovering an empty file.

`docs/ADR.md` and `docs/C4_Diagrams.md` stay optional, as `/replicate` itself declares them. A
markdown link is not a placeholder.

**When to run it:** at the Phase 1 → Phase 2 boundary. `/replicate` now runs it there for you.

**What it does NOT prove:** that the documents are correct. That is what the swarm is for.

### `check-growth-trace.cjs` — the growth analysis was not analysed and dropped

```bash
node .claude/hooks/check-growth-trace.cjs .
```

```
❌ часть требований по росту потеряна (1 из 2):
   • FR-GROWTH-002
   Каждое надо либо перенести в docs/Specification.md, либо отклонить С ПРИЧИНОЙ — молча уронить нельзя.
```

Phase 0's M5 module emits a `Growth Requirements Seed` table of `FR-GROWTH-nnn` draft obligations
into `docs/product-discovery-brief.md`. This asks whether they survived into `docs/Specification.md`.
A conscious rejection **with a reason written down** passes; a silent drop does not.

`docs/product-discovery-brief.md` absent is `2`, not `0` — it means Phase 0 never ran (the
`--from-docs` entry skips it), which is not the same as having nothing to trace.

**When to run it:** at the Phase 1 → Phase 2 boundary, before the validation pass.

**What it does NOT prove:** that anything was built, or that copying a competitor's growth move is
lawful. It proves an obligation was carried forward, nothing more.

### `check-look-trace.cjs` — the source product's LOOK was not captured and dropped

```bash
node .claude/hooks/check-look-trace.cjs .
```

```
❌ часть обязательств по облику потеряна (1 из 2):
   • FR-LOOK-002 (путь)
   Каждое надо либо перенести в docs/Specification.md, либо отклонить С ПРИЧИНОЙ — молча уронить нельзя.
```

When a project reproduces an existing product, that product's LOOK — palette, typography, density,
screen layout, the order of steps — is the substance of the task. **Phase 0.5 (Source Product
Profile)** asks that question in every run, including the `--from-docs` entry that skips Phase 0
entirely, and writes `docs/source-product-profile.md`. This checker asks whether its
`FR-LOOK-nnn` rows survived into `docs/Specification.md`. A conscious rejection **with a reason
written down** passes; a silent drop does not.

Exit `2` covers five states, and none of them is a pass: no profile (the phase did not run), no
Specification, an untouched template table, an EMPTY `путь` axis that was never declared — and the
two legitimate non-captures, `ИСТОЧНИКА НЕТ` (the project replicates nothing) and `НЕ ИЗМЕРЕНО` (a
source was NAMED but could not be captured, with a reason from the closed list `no-browser-mcp` |
`no-browser` | `unreachable` | `auth-required` | `out-of-scope` | `bot-protected` | `timeout` |
`robots-disallowed`). Per the shipped `honest-configuration` rule (CFG-I4), an unreachable source of
truth yields UNKNOWN, never a plausible value — a palette invented for a product nobody looked at is
exactly that plausible value.

**Two axes, one identifier family, separate answers.** `облик` (what is seen) and `путь` (the order
of screens) are a COLUMN of `FR-LOOK-nnn`, never a second namespace — but they fail apart, so each
declares its own status: `**Статус съёмки:**` and `**Статус съёмки (путь):**`. The path declaration
is demanded only when the axis carries no rows; rows are its answer. A proven loss outranks an
unanswered axis — exit `1` beats exit `2`.

The `облик` capture is done by the canonical `clone-website` skill from the separate
[`@dzhechkov/skills-website-cloner`](https://www.npmjs.com/package/@dzhechkov/skills-website-cloner)
package, run recon-only. It is **called, never vendored** (ADR-0001): unavailable prerequisites make
the outcome `НЕ ИЗМЕРЕНО` with a named reason, they never stall the pipeline.

### `capture-source-path.cjs` — the `путь` axis, clicked through in a browser

```bash
node .claude/hooks/capture-source-path.cjs https://example.test/ --max-pages 5 --delay-ms 1500
```

```
ℹ️  robots.txt прочитан, стартовый путь разрешён
ℹ️  шаг 2 — экран входа. Останавливаемся: за вход не ходим, это законная последняя точка пути.

✅ СНЯТ: ось «путь», 2 экрана(ов). Доказательства: .p-replicator/source-path-capture

| FR-LOOK-005 | Шаг 1 из 2; стартовый экран; полей формы: 0; заметных призывов: 1 из 2; уровней заголовков: 2 | путь | / | прокликано …, step-01.aria.txt | ЧЕРНОВИК |
| FR-LOOK-006 | Шаг 2 из 2; достижим одним действием с предыдущего; полей формы: 2; …; это экран входа | путь | /signup | прокликано …, step-02.aria.txt | ЧЕРНОВИК |
| FR-LOOK-007 | Последовательность экранов до конца снятого пути: 2 экрана(ов), / → /signup; путь упирается в экран входа | путь | / | прокликано …, capture.json | ЧЕРНОВИК |

Замеренные закономерности СТАРТОВОГО экрана (материал для оси «облик», строк не выпускаем):
  шаг сетки отступов: 4px (доля 0.91) · кеглей: 3 · начертаний: 3 · радиусов: 1 · переменных в :root: 3
```

`clone-website` captures what is visible at ONE url; a person's route through a product —
registration, onboarding, first value, paywall — was captured by nothing. This walks it and emits
rows in the SAME `FR-LOOK-nnn` family, continuing the profile's numbering, on the `путь` axis.

Three outcomes, each with its own exit code: `0` captured · `1` the source opened but has no onward
step (a one-screen product — a legitimate `ИСТОЧНИКА НЕТ` for this axis, and a PROVEN negative, not
blindness) · `2` `НЕ ИЗМЕРЕНО` with a reason from the closed list, printed as the exact profile
lines to paste.

**Playwright is an external prerequisite** — this package ships ZERO dependencies, so the module is
resolved on the machine at run time (`PLAYWRIGHT_MODULE`, the project, `npm root -g`) and its
absence is the honest outcome `no-browser`, never a crash:
`npm i -D playwright && npx playwright install chromium`.

**What it captures, and what it refuses to.** REGULARITIES — the spacing step, the type scale, how
many hierarchy levels, how many form fields, how many screens to first value — never VALUES to carry
over, such as this exact purple. Only computed styles and semantic roles (aria, form types,
accessible names); **never class names** like `sx-ds2y8i`, which bundlers change on every build of
someone else's site. Third-party CSS and DOM are copyrighted code — a basis for measurement, never
material to copy — so they are not stored by default, and the evidence directory ships its own
`.gitignore`. `robots.txt` is read before crawling more than one page, and a refusal is the outcome
`robots-disallowed`. Authentication and any circumvention are refused outright: a login screen is
recorded as the legitimate last step and the crawl stops there. One thread, a pause between pages
(minimum 250 ms), a hard page cap of 12 — exceeding either is clamped out loud.

**When to run it:** inside Phase 0.5, once the source product is named.

**What it does NOT prove:** the designer's intent. It reports "padding 8px ×137", never "a 4pt
step is the design language"; the reading is yours.

**When to run it:** at the Phase 1 → Phase 2 boundary, beside `check-growth-trace.cjs`. Run at the
end of Phase 0.5 itself it answers `2` by construction — nothing has been promoted yet — and there
it only tells you the profile parses.

**What it does NOT prove:** that the interface resembles the source. It proves an obligation was
carried forward. Resemblance is proven by visual comparison, not by matching identifiers.

### `check-pipeline-gaps.sh` — FR/NFR/AC keys are joins, not decoration

The package owns the checker at `scripts/check-pipeline-gaps.sh`. `/feature` resolves that packaged
file directly, so an installed consumer runs the same executable without copying it onto the hooks
surface:

```bash
CHECK_PIPELINE_GAPS="$(node -p "require.resolve('@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh')")" || {
  printf 'NOT-ESTABLISHED packaged checker could not be resolved\n' >&2
  exit 2
}
bash "$CHECK_PIPELINE_GAPS" "${CLAUDE_PROJECT_DIR:-.}" --traceability
```

The checker reads complete `DOCUMENT_ROLE_MAP` blocks from the installed `/feature` command and
`sparc-prd-mini` skill. It checks the applicable project-level pair and every immediate
`docs/features/*/` contour independently. It never rediscovers `01_specification.md` or
`02_pseudocode.md` by basename.

Accepted specification declarations are level-three headings such as
`### FR-order-refund-1`, `### NFR-order-refund-2 — latency`, and
`### AC-order-refund-3 - accepted`. Pseudocode evidence is a standalone
``REQUIREMENT: `FR-order-refund-1` `` line inside an `### Algorithm:` block. Prose, comments,
tables, and nested `SC-FR-*` identifiers are ignored. Duplicate or malformed declarations block.

For each contour it runs both sorted differences: specification→pseudocode names requirements with
no algorithm claim; pseudocode→specification names dangling claims. Every gap is printed with its
contour, direction, and exact key. Exit `0` means every readable contour was checked and both sets
match; exit `1` means a named content/traceability gap; exit `2` means the map or filesystem evidence
was not trustworthy enough to compare. `/feature` preserves both non-zero states before Phase 2.

Symlinked contours or role files are refused rather than followed outside the declared root. Matching
keys prove cross-document linkage only; they do not prove that an algorithm semantically implements
the requirement.

**Scope and provenance.** This package executable implements the ADR-owned traceability decision
only: role-map resolution, project plus immediate-feature traversal, structural FR/NFR/AC
declarations, both `comm -23` directions, duplicate/malformed/symlink refusal, exact diagnostics,
and blocking `0/1/2` exits. It deliberately does not carry the old workspace-only PR-001/PR-002/
PR-004/PR-007, weekly-metric, port, or `[GAP]` umbrella checks. The workspace source is not needed
by an installed consumer.

## ✅ Verify the install

After `/replicate`, run:

```bash
npx @dzhechkov/p-replicator verify
```

The command checks:

- **Pre-shipped contract** (must-have): 10 skills + 11 commands + 4 agents + 13 rules + settings.json + 25 hooks
- **Post-/replicate hints** (advisory): CLAUDE.md, project-specific agents, feature-roadmap.json, security rules, etc.

**Exit codes:**
- `0` — pre-shipped contract intact (warnings about project-specific are normal pre-/replicate)
- `1` — pre-shipped contract violated → run `init --force` to repair

**Alternative — health check:**

```bash
npx @dzhechkov/p-replicator doctor
```

`doctor` verifies pre-shipped contract + Prerequisites (`git on PATH`). It also prints the
informational, non-gating insight-flow observation described below. It remains stricter than
`verify` for must-have components.

---

## 🎯 Pipeline overview — `/replicate` phases

### Phase 0 — Product Discovery (optional)

**Activated for:** new SaaS, startups, products to research. **Skipped for:** internal tools, experiments, projects with existing tech docs.

- Skill: `reverse-engineering-unicorn` (JTBD analysis + competitors + Blue Ocean canvas)
- Output: `docs/00_product_discovery.md`

### Phase 1 — Planning (SPARC docs)

Generates 11 standardized documents in `docs/`:

| Document | Content |
|---|---|
| `PRD.md` | Vision, personas, user stories |
| `Solution_Strategy.md` | Solution approach |
| `Specification.md` | Acceptance criteria, NFRs |
| `Pseudocode.md` | Algorithms, data flow |
| `Architecture.md` | C4 diagrams, tech stack |
| `Refinement.md` | Edge cases, testing strategy |
| `Completion.md` | Deploy, CI/CD, monitoring |
| `Research_Findings.md` | Market and tech research |
| `Final_Summary.md` | Executive summary |
| `C4_Diagrams.md` | Context / container / component |
| `ADR.md` | Architecture Decision Records |

> **ADR detection reads BOTH storage shapes.** `/replicate` writes every decision into one
> `docs/ADR.md`, while an idea2prd-manual project keeps a `docs/adr/*.md` directory. Since 1.5.19 the
> toolkit generator's scanner normalizes both into one decision list, so the ADR-driven parts of the
> generated toolkit (architect skill weighting, security boosts, tech-stack extraction, CLAUDE.md key
> decisions) work for `/replicate` projects too. Before 1.5.19 the scanner required a directory of
> more than five files, so for every `/replicate` project the flag was unreachable and those parts
> silently produced nothing.

Skill: `sparc-prd-mini` (internally chains explore + research + solve sub-phases).

### Phase 2 — Validation (5-agent swarm)

| Agent | Validates |
|---|---|
| `validator-stories` | INVEST criteria for user stories |
| `validator-acceptance` | SMART criteria for acceptance criteria |
| `validator-architecture` | Architecture consistency vs target constraints |
| `validator-pseudocode` | Algorithm cohesion |
| `validator-coherence` | Cross-document consistency |

**Verdicts:**
- 🟢 **READY** (score ≥70) → Phase 3
- 🟡 **CAVEATS** (50–69) → Phase 3 with notes (auto-retry once on 🟡 in AUTO mode)
- 🔴 **NEEDS WORK** (<50 or blockers) → return to Phase 1, max 3 retries → halt

Output: `docs/validation-report.md`, `docs/test-scenarios.md` (BDD).

### Phase 3 — Toolkit Generation (project-specific only)

**Does NOT generate pre-shipped commands** (those are installed via `init`). Generates only project-specific artifacts:

- `.claude/agents/{planner,code-reviewer,architect}.md` — project-aware
- `.claude/rules/{security,coding-style,testing}.md` — derived from Specification + Refinement
- `.claude/skills/{project-context,coding-standards}/` — domain knowledge
- `CLAUDE.md` enhanced with project content
- `.claude/feature-roadmap.json` — from PRD MVP scope
- `DEVELOPMENT_GUIDE.md`, `README.md`
- Conditional: `.mcp.json` (if external integrations detected), `.claude/commands/feature-ent.md` (if DDD docs detected)

Skill: `cc-toolkit-generator-enhanced` (9 modules with quality gates).

### Phase 4 — Finalize

- `docker-compose.yml`, `Dockerfile`, `.gitignore` (scaffold files)
- Git commit `chore: initial project setup from SPARC documentation`
- Final summary

---

## 🧠 Skills Reference

| Skill | Purpose |
|-------|---------|
| `explore` | Socratic task clarification |
| `sparc-prd-mini` | SPARC documentation generator (11 docs) |
| `goap-research-ed25519` | Verified research with Ed25519 anti-hallucination |
| `problem-solver-enhanced` | First principles + TRIZ (9 modules) |
| `requirements-validator` | INVEST/SMART validation + BDD scenarios |
| `brutal-honesty-review` | Unvarnished technical criticism by severity |
| `cc-toolkit-generator-enhanced` | Modular toolkit generator (9 modules, ~165K chars) + cross-project learning |
| `reverse-engineering-unicorn` | Company reverse engineering + playbook |
| `pipeline-forge` | Meta-skill: build AI pipelines from extracted patterns |
| `knowledge-extractor` | Extract reusable knowledge from projects |

### Skill Architecture

Skills use a **composable module system** with three tiers:

- **Foundation** (explore, problem-solver, goap-research, brutal-honesty-review) — self-contained, no dependencies
- **Composite** (sparc-prd-mini, requirements-validator, knowledge-extractor) — compose foundation skills via `view()`
- **Master Orchestrator** (cc-toolkit-generator-enhanced) — 9 modular phases with quality gates

The `cc-toolkit-generator-enhanced` skill is the largest component (~165K chars) split into modules:

| Module | Purpose |
|--------|---------|
| 01-detect-parse | Document detection → Internal Project Model (IPM) |
| 02-analyze-map | Instrument mapping + scoring engine |
| 03-generate-p0 | P0 mandatory instruments (CLAUDE.md, /start, etc.) |
| 04-generate-p1 | P1 recommended + enterprise lifecycle |
| 05-generate-p2p3 | P2 optional + MCP + fitness functions |
| 06-package-deliver | Master validation checklist (710 lines) |
| 07-harvest-feedback | Post-project learning loop |
| 08-skill-composition | Dependency graph + path rewriting |
| 09-cross-project-learning | Pattern reuse via maturity model |

### `view()` cross-skill loading

Skills use `view()` for cross-skill loading at runtime:

```markdown
view() .claude/skills/explore/SKILL.md
view() .claude/skills/explore/references/questioning-techniques.md
```

Claude Code resolves these references dynamically — when executing a skill, the LLM reads referenced files at the moment of use. This lets skill A delegate to skill B without duplicating content.

**Limitation:** only Claude Code supports this runtime mechanism. For other platforms (Codex, OpenCode), skill content must be **inlined** at install time. See [`MULTIPLATFORM_ROADMAP.md`](./MULTIPLATFORM_ROADMAP.md).

---

## ⚡ Commands Reference

| Command | Purpose | When to use |
|---|---|---|
| `/replicate` | Full pipeline: idea → SPARC docs → toolkit | Start of a new project |
| `/start` | Bootstrap scaffold from SPARC docs | After `/replicate`, before feature work |
| `/run` | Autonomous feature build loop from roadmap | Regular development |
| `/go` | Router: picks `/plan`, `/feature`, or `/feature-ent` | One specific feature |
| `/next` | Show next feature from roadmap | Sprint navigation |
| `/plan` | Lightweight plan in `docs/plans/<id>.md` | Small task (≤3 files) |
| `/feature` | Full SPARC-mini cycle (PLAN → VALIDATE → IMPLEMENT → REVIEW) | Large feature (4+ files) |
| `/myinsights` | Capture or recall insights | After every non-trivial debug |
| `/docs` | Bilingual docs generator (RU + EN) | End of project or feature |
| `/harvest` | Extract reusable patterns | After completed project |
| `/deploy` | Deployment workflow (dev/staging/prod) | Deployment |

### `/run` — autonomous feature build

```bash
/run mvp                                          # only priority=mvp features
/run all                                          # everything in roadmap
/run mvp --feature-branches                       # each feature in its own branch
/run mvp --feature-branches --auto-merge          # also merge into main
```

**One iteration loop:**

```
while features in scope:
    feature_id = /next                       # pick highest-priority
    if no feature: break
    /go feature_id                           # complexity router
    verify (tests green, code committed)
    mark roadmap entry: status=done
    git commit + git push
```

**`--feature-branches` flag** (v1.5.0):
- Creates `feature/{NNN}-{id}` branch per feature (zero-padded 3-digit)
- Auto-stashes uncommitted changes with message `auto-stash before /run feature-branches`
- Optional `--auto-merge` merges branch into main on success
- Updates `feature-roadmap.json` with `number` + `branch` fields

### `/go` — intelligent router

`/go <id>` decides between:
- `/plan` — for small tasks (≤3 files, no new architecture)
- `/feature` — for large features (4+ files)
- `/feature-ent` — for cross-bounded-context features with new ADRs (only available if Phase 3 generated `feature-ent.md` from DDD docs)

### `/myinsights` — knowledge capture

Build a project-local knowledge base of "rakes" (development insights). Markdown remains the source
of truth; `UserPromptSubmit` uses optional dz recall with a local fallback.

```bash
/myinsights                                                  # interactive prompt
/myinsights "Prisma migrate dev fails silently if shadow DB unreachable. Workaround: set DATABASE_URL_SHADOW explicitly."
/myinsights recall prisma                                    # search by keyword
```

Storage: `.claude/insights/index.md` — Markdown log auto-committed by Stop hook. A successful,
non-empty dz recall result may own prompt-time delivery; absent, failing, or empty recall uses the
local last-three fallback.

### `/harvest` — knowledge extraction

Extract reusable patterns from a completed project into a knowledge base. Skill: `knowledge-extractor` (4 modules: agent review → classify → decontextualize → integrate).

Quick and full runs with a reusable finding have a required final persistence gate. The command
passes one structured record to `.claude/hooks/write-insight.cjs`; normal completion requires a
`created`, `appended`, or `duplicate` receipt. The writer creates `.claude/insights/index.md` only
on the first valid write, preserves prior bytes on append, and suppresses an exact normalized replay
even when its render date changes. It then attempts an idempotent, best-effort `dz teach` projection;
absence or failure never changes the Markdown receipt. `marker` and findings-free runs do not
manufacture entries. The deterministic tests cover creation, append preservation, exact-repeat
idempotence, and optional projection; they do not claim the text is meaningful.

---

## 💻 CLI Commands

### Subcommands

| Subcommand | Purpose | Exit code |
|---|---|---|
| `init` (default) | Install package in project | `0` ok, `1` if already installed without `--force` |
| `update` | Upgrade files to new version (preserves customizations) | `0` ok, `1` if not installed |
| `remove` | Delete package-tracked files | `0` ok, `1` if not installed |
| `list` | List installed components with metadata | `0` |
| `doctor` | Health check + informational recent fix/insight counts | `0` ok, `1` only if existing health checks find breakage |
| `verify` | Pre-shipped + post-/replicate verification | `0` ok, `1` if pre-shipped contract violated |

### Global flags

| Flag | Where it works | Description |
|---|---|---|
| `--force` | `init` | Overwrite existing files (with merge logic for settings.json) |
| `--dry-run` | `init`, `update`, `remove` | Preview without writing to disk |
| `--reset-settings` | `init --force`, `update` | Full overwrite of settings.json (disables merge) |
| `--help`, `-h` | any | Show help |
| `--version`, `-v` | any | Show package version |

### Slash command flags (inside Claude Code)

| Flag | Where | Description |
|---|---|---|
| `--feature-branches` | `/run`, `/go` | Each feature on its own branch `feature/{NNN}-{id}` |
| `--auto-merge` | `/run`, `/go` (with `--feature-branches`) | Auto-merge feature branch into main on success |
| `--skip-tests` | `/start` | Skip test generation |
| `--skip-seed` | `/start` | Skip DB seeding |
| `--dry-run` | `/start`, `/replicate` | Preview without writing |

---

## 🎚️ Validation Cycle Details

The same validation pipeline runs in **`/replicate` Phase 2** and **`/feature` Phase 2**. Skill: `requirements-validator`.

### Validators (5-agent swarm)

| Agent | Criteria | Scoring |
|---|---|---|
| `validator-stories` | INVEST: Independent, Negotiable, Valuable, Estimable, Small, Testable | 0–100 per story, average |
| `validator-acceptance` | SMART: Specific, Measurable, Achievable, Relevant, Time-bound | 0–100 per AC, average |
| `validator-architecture` | Consistency vs target constraints (Distributed Monolith / Docker / VPS / MCP) | Pass/fail + score |
| `validator-pseudocode` | Algorithm cohesion + data-flow coherence | 0–100 |
| `validator-coherence` | Cross-document consistency (PRD↔Spec, Spec↔Pseudocode, etc.) | 0–100 |

### Verdicts

| Verdict | Threshold | Next |
|---|---|---|
| 🟢 **READY** | average ≥ 70, no blockers | Phase 3 (or IMPLEMENT in /feature) |
| 🟡 **CAVEATS** | 50–69, no blockers | Phase 3 with notes (AUTO mode auto-retries once on 🟡) |
| 🔴 **NEEDS WORK** | < 50 OR any blocker | Return to Phase 1 / PLAN, max 3 retries → halt |

After 3 retries with 🔴, the pipeline halts and surfaces to the user. The user can adjust the input or override.

### Output

- `docs/validation-report.md` (or `docs/features/<id>/validation-report.md` for /feature)
- `docs/test-scenarios.md` — BDD scenarios derived from acceptance criteria

### Post-implementation review (`brutal-honesty-review`)

After `IMPLEMENT` phase (Phase 3 of /feature), `brutal-honesty-review` skill classifies findings by severity:

| Severity | Action |
|---|---|
| `blocker` | MUST fix before merge |
| `high` | Fix in this feature unless explicit deferral |
| `medium` | Optional fix; create follow-up issue |
| `low` | Logged, no action required |

Output: `docs/features/<id>/review-report.md`.

---

## 🔄 Feature Lifecycle — `/feature` command

`/feature <id>` runs a 4-phase lifecycle: **PLAN → VALIDATE → IMPLEMENT → REVIEW**. Project-context-aware (reads `docs/`), checkpoint-driven, parallel where independent.

### Two entry modes

| Mode | When | Pre-conditions |
|---|---|---|
| **Mode 1: Post-/replicate** | Project bootstrapped via `/replicate` | CLAUDE.md, docs/, scaffold all generated |
| **Mode 2: Existing project** | Working project, adding features with verification | `init` ran on top of existing project |

The 4-phase pipeline is **identical in both modes**. Same validation thresholds, same retry logic, same brutal-honesty review.

### Phase 1 — PLAN (sparc-prd-mini)

Generates 5 SPARC docs in `docs/features/<feature>/`:
- `01_specification.md` — requirements + acceptance criteria
- `02_pseudocode.md` — algorithms + data flow
- `03_architecture.md` — component placement + dependencies
- `04_refinement.md` — edge cases + error paths
- `05_completion.md` — testing + deployment notes

Before Phase 2, `/feature` runs the installed machine-key checker. Only exit `0` advances; exit `1`
returns to PLAN with exact FR/NFR/AC gaps, while exit `2` stops on an unresolved role map or document.

### Phase 2 — VALIDATE (requirements-validator)

Same swarm-of-5 as `/replicate` Phase 2. Verdict 🟢/🟡/🔴 with same retry logic.

### Phase 3 — IMPLEMENT (parallel agents)

1. Identify independent work units from Phase 1 Architecture
2. Spawn parallel `Task` tool calls, one per unit
3. Each Task: implement + write tests + commit
4. Coordinator merges/integrates
5. Run full test suite

**Quality gate:** tests pass, lint clean, build succeeds.

### Phase 4 — REVIEW (brutal-honesty-review)

Severity-classified findings. Critical (`blocker` | `high`) MUST be fixed.

### AUTO mode (called from /go or /run)

- Phase 1: proceed only if all docs exist and the traceability checker exits `0`
- Phase 2: proceed if 🟢 or 🟡; auto-retry once on 🔴
- Phase 3: proceed if tests + lint + build green
- Phase 4: auto-fix `high` if straightforward; halt on `blocker`

### Final steps

1. Update `.claude/feature-roadmap.json`: status `in_progress` → `done`
2. Commit: `feat(<feature>): complete lifecycle [phases 1-4]`
3. Push (if `--feature-branches` mode: also create branch + optional auto-merge)

---

## 📊 Statusline Dashboard

**6-line ANSI dashboard** above Claude Code's prompt with real-time pipeline + roadmap + toolkit + status metrics.

```
P-Replicator V1.5.x ● user │ Sonnet 4.7
🚀 Pipeline   /<cmd> ▓▓▓░░░░ 50%  │ Phase: VALIDATE (2/4)  │ Last: /replicate
🎯 Roadmap    [●●●○○○○○] mvp 3/8   │ Done 5/12  │ ▶ auth-jwt  │ Domain: banking
📊 SPARC      ●11/11  │ 🟢 78/100  │ Plans ●3  │ ADRs ●2  │ Harvest 2026-05-05
🛠️ Toolkit    Skills ●10/10 │ Cmds ●11/11 │ Agents ●4+3 │ Rules ●13+2 │ Hooks ●17/17
💡 Insights   ●12 (2026-05-06) │ Tests 85/85 ✓ │ MCP ●1/1 │ Settings ✓ │ 🧬 Keysarium ✓
```

### Sources (heuristic + state-file)

| Metric | Source |
|---|---|
| Pipeline command + phase + progress | `.claude/.p-replicator-state.json` |
| Roadmap progress | `.claude/feature-roadmap.json` |
| SPARC count | `docs/{PRD,Architecture,...}.md` |
| Validation score | regex extract from `docs/validation-report.md` |
| Plans count | `docs/plans/*.md` |
| ADRs count | `docs/ADR.md` H2/H3 headings, or `docs/adr/*.md`, or `docs/ddd/adr/*.md` |
| Insights count + last date | `## YYYY-MM-DD` in `.claude/insights/index.md` |
| Toolkit counts | filesystem walks of `.claude/{skills,commands,agents,rules,hooks}/` |
| Settings status | deep-equals current vs `manifest.shippedDefaults` |
| MCP servers | `.mcp.json` |
| Domain | keyword grep in `CLAUDE.md` |
| Last harvest | `TOOLKIT_HARVEST.md` mtime |
| Last test | optional `.claude/.last-test.json` cache |

### Defensive design

Every section wrapped in `safeRun()` with fallback — one parse error doesn't break the whole status bar.

**Stale state:** state file older than 30 minutes is ignored (Pipeline section shows `idle`).

**Disable statusline:** remove the `statusLine` field from `.claude/settings.json`. The deletion is preserved on next `update` thanks to merge logic.

For internals, see [admin guide](./README/eng/03_admin_guide.md#statusline--dashboard) and [`documentation/07-dashboard-howto.md`](../../documentation/07-dashboard-howto.md) (in source repo).

---

## 🪝 Hooks System

`p-replicator` ships **11 cross-platform Node utilities** in `.claude/hooks/`. The Bash traceability
gate described above remains a package script and is resolved directly by `/feature`; it is not a
Claude Code hook.

| Hook | Event | Purpose |
|---|---|---|
| `session-insights.cjs` | SessionStart + UserPromptSubmit | Show the missing-carrier hint at start; at prompt time select armed dz recall or the local last-three fallback |
| `autocommit-roadmap.cjs` | Stop | Auto-commit `.claude/feature-roadmap.json` if changed |
| `autocommit-insights.cjs` | Stop | Auto-commit `.claude/insights/` if changed |
| `autocommit-plans.cjs` | Stop | Auto-commit `docs/plans/` if changed |
| `statusline.cjs` | (statusLine config) | Multi-line dashboard above the prompt |
| `state-update.cjs` | (utility) | Argv-driven helper for writing `.claude/.p-replicator-state.json` |
| `write-insight.cjs` | (utility, invoked by `/harvest`) | Establish Markdown, return `created`/`appended`/`duplicate`, then best-effort project the same record through dz |
| `check-ports.cjs` | (utility, invoke deliberately) | docker-ports Правило №0 against a real Compose config — exits 0/1/2 |
| `check-docs-complete.cjs` | (utility, invoke deliberately) | Are the Phase-1 documents written and placeholder-free, before the Phase-2 swarm — exits 0/1/2 |
| `check-growth-trace.cjs` | (utility, invoke deliberately) | Did the M5 `FR-GROWTH-nnn` seed reach `docs/Specification.md` — exits 0/1/2 |
| `check-look-trace.cjs` | (utility, invoke deliberately) | Did the Phase-0.5 `FR-LOOK-nnn` source-look seed reach `docs/Specification.md` — exits 0/1/2 |
| `capture-source-path.cjs` | (utility, invoke deliberately) | Phase-0.5 `путь` axis: click through the source product in a browser and emit `FR-LOOK-nnn` rows — exits 0/1/2 |

The four `check-*` utilities and `capture-source-path.cjs` are **not wired to any event**, and that
is deliberate: a hook of this package is non-blocking by contract (pinned by a test that requires
exit 0), so a hook could only print — it could never refuse anything. Invoke them where their answer
changes a decision.

### Cross-platform discipline

All 4 autocommit scripts use `execFileSync('git', [...])` (no shell pipes, no `2>/dev/null`/`|| true`). Works identically on Windows-cmd, bash, PowerShell.

**Each script is defensive:** wrapped in try/catch, always exits 0 (best-effort, never blocks the session).

### State file for live progress

`.claude/.p-replicator-state.json` — ephemeral state, updated by commands during pipeline execution:

```json
{
  "currentCommand": "/feature",
  "currentPhase": { "name": "VALIDATE", "index": 2, "total": 4, "progress": 0.5 },
  "lastCommand": "/replicate",
  "lastFeature": "auth-jwt",
  "updatedAt": "2026-05-07T..."
}
```

Updated via `state-update.cjs`:

```bash
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/state-update.cjs" \
  --command /feature \
  --phase VALIDATE \
  --index 2 \
  --total 4 \
  --progress 0.5
```

Pipeline commands optionally call this script (via Bash tool) so statusline shows real progress.

**⚠️ Recommendation:** add to `.gitignore`:

```
.claude/.p-replicator-state.json
.claude/.last-test.json
```

---

## 🗺️ Roadmap & Insights

### Feature roadmap (`.claude/feature-roadmap.json`)

**File:** generated in `/replicate` Phase 3 from PRD MVP scope, or by hand for Mode 2.

**Schema (post v1.5.0):**

```json
{
  "version": "1.0",
  "features": [
    {
      "id": "auth-jwt",
      "number": 1,
      "branch": "feature/001-auth-jwt",
      "name": "JWT-based authentication",
      "priority": "mvp",
      "status": "next",
      "complexity": "medium",
      "estimated_hours": "2-4",
      "blockers": [],
      "expected_files": ["packages/backend/src/auth/jwt.ts"],
      "depends_on": []
    }
  ]
}
```

**Lifecycle states:** `planned` → `next` → `in_progress` → `done` (or `blocked`).

**`number` and `branch`** are populated by `--feature-branches` flag. Auto-commit via `autocommit-roadmap.cjs` (Stop hook).

### Insights system

**Storage:** `.claude/insights/index.md` (Markdown source of truth). The writer persists it before
an idempotent best-effort `dz teach` duplicate, so removing or breaking `.dz` cannot remove a record.

`/myinsights` captures a record manually; quick/full `/harvest` uses the same carrier through the
packaged writer. A fresh install intentionally has no `.claude/insights/` directory. The first valid
write creates it; `init` does not pre-create an empty carrier, so doctor can keep distinguishing
missing, existing-empty, and populated states. Until that first write, SessionStart prints one line:
`инсайтов пока нет; /myinsights создаст первую запись`.

**Entry format:**

```markdown
## YYYY-MM-DD — short title

**Tags:** tag1, tag2, tag3

**Problem:**
What happened (1-3 sentences).

**Solution:**
What fixed it (1-5 sentences with code if relevant).

**References:** file:line or commit hash or external link

---
```

**Lifecycle:**
- ≤ 50 entries → single `index.md`
- > 50 → split into archive `<YYYY-MM>.md` with `index.md` as TOC
- Never delete — only supersede via `**Status:** superseded by <link>`

**Tag conventions:**
- ✅ `prisma-migration`, `postgres-timezone`, `docker-compose-network`
- ❌ `bug`, `fix`, `important` (too generic — recall fails)

**Prompt-time injection:** `UserPromptSubmit` passes the real prompt to `session-insights.cjs`. Only a
successful, non-empty dz recall result from the insight domain suppresses local output. Absent,
failing, or empty recall uses the local fallback (the last 3 Markdown entries); failure is named,
absence and empty output are quiet, and one invocation never emits both sources. `SessionStart`
retains only the missing-carrier hint above.

### Doctor insight-flow observation

Every `doctor` invocation measures one shared period covering the current date and the preceding two
dates—three calendar days in the process's local timezone—and prints the period with both raw counts:
`N fix commits and M insight records`.

- Fix commits come from a fresh, bounded read of project git history and count only Conventional
  Commit subjects beginning with `fix:` or `fix(scope):`.
- Insight records come from fresh dated `## YYYY-MM-DD — ...` headings in
  `.claude/insights/index.md`. A missing carrier is a measured count of zero.
- If the project is not a git repository, has no readable history, or a required source is unreadable,
  the line says `check NOT performed` and names the source instead of inventing a count.

The observation is informational: it has no threshold, does not interpret the relationship between
the counts, and does not change `doctor` exit status. Existing installation-health checks remain the
only owners of exit `0` or `1`.

---

## 🏛️ Architecture Highlights

### Two-tier model: Pre-shipped vs Project-generated

| Tier | Created by | Lives in | Updated |
|---|---|---|---|
| **Pre-shipped** | `npx p-replicator init` | `.claude/{skills,commands,agents,rules,hooks}/` + `settings.json` | On each package upgrade |
| **Project-generated** | `/replicate` Phase 3 (LLM execution) | `CLAUDE.md`, `.claude/agents/planner.md`, `docs/`, etc. | Only on regeneration |

> 💡 **Key insight:** This is **the main fix of v1.4.0** — previously `/replicate` Phase 3 tried to generate ALL artifacts (including generic commands like `/run`, `/feature`), which led to flaky outputs (LLM compression, missed templates). Post-v1.4.0, generic commands are pre-shipped, Phase 3 generates ONLY project-specific artifacts.

### SSOT: `utils.COMPONENTS`

Single source of truth for what's shipped and what's generated, in `src/utils.js`. **Any future edit to items automatically updates 5 surfaces** (init, update, doctor, verify, list, cli help) — eliminating drift issues that existed pre-v1.3.1.

### Settings.json merge logic (v1.4.2 + v1.4.3)

`init --force` and `update` use `mergeSettingsJson(existing, template)` to preserve user customizations:

- **User-added hook** (absent from template) → preserved
- **User-modified default** (changed command) → treated as user-added → preserved
- **Identical command** in template and user → de-duped
- **New hook in template** → added to user's settings
- **Removed default** (was in old template, gone from new) → orphan-detected and removed

**Identity model:** hooks compared by `command` string. **Override:** `--reset-settings` flag disables merge — full overwrite.

### Manifest schema (`.p-replicator.json`)

```json
{
  "version": "1.5.x",
  "installedAt": "2026-05-07T12:00:00.000Z",
  "components": ["agents", "commands", "hooks", "rules", "settings", "skills"],
  "files": ["...sorted list of all installed files..."],
  "shippedDefaults": {
    "settings.json": { "hooks": {...}, "statusLine": {...} }
  }
}
```

`shippedDefaults` is the baseline for orphan detection on upgrade (v1.4.3+). Backward-compatible: pre-v1.4.3 manifests load without error, orphan detection skipped on first upgrade.

For complete internals, see [`README/eng/05_architecture.md`](./README/eng/05_architecture.md) — covers cross-platform hooks, sync-templates merge mode, settings merge algorithm, statusline architecture.

---

## ⚙️ Configuration

### `.claude/settings.json`

Default structure after `init`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "_comment": "Default hooks + statusline shipped by @dzhechkov/p-replicator init.",
  "statusLine": {
    "type": "command",
    "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/statusline.cjs\""
  },
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-insights.cjs\"", "timeout": 5 }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/session-insights.cjs\"", "timeout": 5 }
        ]
      }
    ],
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/autocommit-roadmap.cjs\"", "timeout": 10 },
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/autocommit-insights.cjs\"", "timeout": 10 },
          { "type": "command", "command": "node \"${CLAUDE_PROJECT_DIR}/.claude/hooks/autocommit-plans.cjs\"", "timeout": 10 }
        ]
      }
    ]
  }
}
```

**Why `${CLAUDE_PROJECT_DIR}` and not a relative path:** a relative path resolves against the process
working directory, which drifts — one `cd` inside a tool call moves it for the rest of the session, and
the hook then dies with `MODULE_NOT_FOUND`. Because hooks are non-blocking, the session continues and
your roadmap silently stops being committed. Claude Code sets `CLAUDE_PROJECT_DIR` to the project root
and rewrites this exact braced form for PowerShell, so it works on every platform.

The hook scripts anchor their DATA the same way, and fall back to their own location
(`__dirname/../..`) when the variable is absent — so a hand-run works too. That fallback is why the
shell examples elsewhere in this README use `${CLAUDE_PROJECT_DIR:-.}`: in a plain terminal the
variable is unset, and `:-.` keeps the example working. Do **not** use the `:-.` form inside
`settings.json` — Claude Code's PowerShell rewrite matches only the bare `${CLAUDE_PROJECT_DIR}`
token, so `:-.` would leave a POSIX-only construct in a file that must work on every platform.

**Customization:** add new hooks or event types — preserved on `init --force` or `update` thanks to merge logic.

**Disable individual default hooks:** delete from `settings.json` after `init`. The deletion is preserved on next `update` (orphan detection only removes hooks **previously shipped** but absent in **new** template — your manual deletion is a user customization).

### MCP servers (`.mcp.json`)

Project-local MCP server config:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

Statusline shows MCP server count. `/replicate` Phase 3 auto-generates `.mcp.json` when external integrations are detected.

### Keysarium integration

If `.keysarium.json` (from sibling `@dzhechkov/keysarium` package) is detected:

- `init` shows an integration banner
- Statusline shows `🧬 Keysarium ✓`
- `/replicate` Phase 3 doesn't duplicate skills already provided by Keysarium

---

## 🔄 Update workflow

```bash
# Safe upgrade with preserved customizations:
npx @dzhechkov/p-replicator@latest update

# Or via init --force (also preserves customizations):
npx @dzhechkov/p-replicator@latest init --force

# Full reset of settings.json to defaults (loses custom hooks):
npx @dzhechkov/p-replicator@latest init --force --reset-settings
```

### What the merge logic does

1. Reads `manifest.shippedDefaults['settings.json']` (what we shipped previously)
2. Reads current `templates/.claude/settings.json` (new template)
3. Reads `.claude/settings.json` (user's current)
4. **Orphan detection:** removes hooks present in old template but missing in new
5. **Merge:** adds hooks from new template that aren't already in user's current
6. User-added hooks (never in old template) are **preserved**

After upgrade, run `verify` to confirm:

```bash
npx @dzhechkov/p-replicator verify
```

---

## 🆘 Troubleshooting

> 💡 **Tip:** This section covers the 12 most common issues. For a comprehensive 15+ case troubleshooting reference with detailed diagnostics, see [`README/eng/06_troubleshooting.md`](./README/eng/06_troubleshooting.md).

<details>
<summary><b>👉 Click to expand 12 common issues + fixes</b></summary>

<br>

### `init` refuses: "P-Replicator is already installed"

```bash
npx @dzhechkov/p-replicator update                            # safe upgrade
npx @dzhechkov/p-replicator init --force                      # forced re-install
npx @dzhechkov/p-replicator init --force --reset-settings     # full reset
```

### Missing files after `init`

```bash
npx @dzhechkov/p-replicator doctor       # see what's missing
npx @dzhechkov/p-replicator init --force # repair
```

### Install went to `~/node_modules` instead of project

Cause: no `package.json` in your project, npm walks up and finds one in home directory.

```bash
npm init -y
npx @dzhechkov/p-replicator init
```

### Statusline doesn't appear

Checks:
1. Claude Code version supports `statusLine` config? Update Claude Code.
2. `statusLine` field present in `.claude/settings.json`?
3. Script runs directly:

```bash
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/statusline.cjs"
```

Should print 6 lines of ANSI output. If it errors:

```bash
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/statusline.cjs" 2>&1
```

Likely cause: corrupt JSON or missing `.p-replicator.json`.

### Hooks aren't auto-committing

```bash
npx @dzhechkov/p-replicator doctor
```

Look for `✓ git on PATH` in Prerequisites section. Also verify `.git` exists:

```bash
git rev-parse --git-dir
```

Debug a specific hook:

```bash
node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/autocommit-roadmap.cjs"
echo "Exit: $?"
git log -1 --format="%s"
```

### Statusline shows "Settings ⚠️ merged" but I didn't change anything

Cause: some process modified `settings.json` (formatting, whitespace, ordering). Statusline compares via deep-equals on sorted keys.

```bash
npx @dzhechkov/p-replicator init --force --reset-settings
```

### Settings.json lost my custom hooks after update

This was a bug pre-v1.4.2. In v1.4.2+, `update` and `init --force` use `mergeSettingsJson` which preserves user customizations.

If you're on v1.4.1 or earlier:

```bash
npx @dzhechkov/p-replicator@latest update
```

Restore lost hooks from git history:

```bash
git log -p --follow -- .claude/settings.json
```

### `/run --feature-branches` immediately fails "not on main"

Cause: you're on a feature branch. Switch to main:

```bash
git checkout main
/run mvp --feature-branches
```

### `--feature-branches` lost my unsaved changes

They're stashed:

```bash
git stash list
git stash show stash@{0}
git stash pop
```

`p-replicator` auto-stashes with message `auto-stash before /run feature-branches`.

### `/replicate` didn't generate expected commands (`/run`, `/feature`, ...)

This is solved in v1.4.0+. All 11 generic commands are now pre-shipped via `init`. If you're on an old version:

```bash
npx @dzhechkov/p-replicator@latest init --force
npx @dzhechkov/p-replicator verify
```

### Insights aren't injected after a prompt

Checks:
1. `.claude/insights/index.md` exists with entries?
2. `UserPromptSubmit` is configured in `.claude/settings.json`?
3. If dz recall fails, does the hook name degradation and show the local fallback?
4. If dz is absent or returns empty, does the local fallback appear without a dz error?

If all checks are OK but still nothing — Claude Code may cache settings. Restart `claude`.

### Statusline lags on every command

```bash
time node "${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/statusline.cjs"    # how many seconds?
```

Should be < 100ms. If > 1s, check `docs/` size:

```bash
du -sh docs/
find docs/ -type f -name "*.md" | wc -l
```

Workaround: temporarily disable statusline by removing the `statusLine` field in `.claude/settings.json`. See [KNOWN_LIMITATIONS.md](./KNOWN_LIMITATIONS.md) item L6 for future enhancement (`STATUSLINE_PROFILE=1` env var).

For full troubleshooting (15+ issues with detailed diagnostics), see [`README/eng/06_troubleshooting.md`](./README/eng/06_troubleshooting.md).

</details>

---

## 📈 Migration

<details>
<summary><b>👉 Click to expand per-version migration matrix</b></summary>

<br>

| From → To | What you get | Migration cost |
|---|---|---|
| 1.3.x → 1.5.x | All pre-shipped commands + statusline + feature-branches + merge logic + Mode 2 | `init --force` (preserves customizations) |
| 1.4.0 → 1.4.1 | Cross-platform hooks + sync merge mode | `init --force` |
| 1.4.1 → 1.4.2 | Settings merge (preserve customizations) | `init --force` is safe (preserves) |
| 1.4.2 → 1.4.3 | Orphan detection | First upgrade lacks baseline — re-run `init --force` to populate |
| 1.4.3 → 1.5.0 | Statusline + `--feature-branches` | `update` or `init --force` |
| 1.5.0 → 1.5.1 | "Existing tech docs" workflow formalized | docs only — no migration |
| 1.5.1 → 1.5.2 | Mode 2 (existing project + /feature) formalized | docs only — no migration |
| 1.5.2 → 1.5.3 | Expanded npm README | docs only — no migration |
| 1.5.3 → 1.5.4 | settings.json `$schema` URL fix | `update` (merge preserves customizations) |
| 1.5.4 → 1.5.7 | Monorepo metadata, strict CLI args, init-manifest safety | `update` |
| 1.5.7 → 1.5.8 | Skill trust tiers + provenance | `update` |
| 1.5.8 → 1.5.9 | goap-ed25519 honesty rewrite + `remove` safety fixes | `update` |
| 1.5.9 → 1.5.13 | brutal-honesty-review evals/schema heal | `update` |
| 1.5.13 → 1.5.14 | Docs + packaging (changelog, shipped tests, repo links) | none — docs/packaging only |

> ✅ **No breaking changes** between any versions. All upgrades are backward-compatible.

After any upgrade — `verify` to confirm contract:

```bash
npx @dzhechkov/p-replicator verify
```

</details>

---

## 🧪 Test Infrastructure

<details>
<summary><b>👉 Click to expand test layer breakdown + meta-tests</b></summary>

<br>

**Suite command:** `npm test` (plain Node test runner; never watch mode).

| Layer | File | Coverage |
|---|---|---|
| **Unit** | `tests/unit/*.test.js` | Pure utilities, role-map and traceability contracts, hook behavior, and document consistency |
| **E2E** | `tests/e2e/*.test.js` | Full CLI lifecycle plus fresh-install execution of the exact `npm pack` insight writer artifact |
| **Snapshot** | `tests/snapshot/templates.test.js` | SHA-256 baseline of package templates (140 file hashes, MEASURED — `npm run snapshot:baseline`) |

**Meta-tests** verify consistency between documents:
- `replicate-pipeline.md` mentions every pre-shipped command (no orphan in rule)
- `replicate.md` Phase 3 doesn't claim "Generate `<pre-shipped>.md`" (no spec drift)
- Negative/E2E fixtures live under `tests/fixtures/`; `files[]` ships `tests/`, so they are included in the npm package.

**Snapshot baseline** regenerated via `npm run snapshot:baseline` after intentional template changes.

```bash
npm test                                    # full suite
npm run test:unit                           # unit only
npm run test:e2e                            # e2e only
npm run test:snapshot                       # snapshot only
```

</details>

---

## ⚠️ Known Limitations

For currently-open improvement items — see [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) (8 entries: 3 medium, 5 low priority).

**Highlights:**
- **M1** — `--feature-branches` behavior tested only via documentation-presence (not e2e git workflow)
- **M2** — No formal `--from-docs` CLI flag (workflow works via natural-language only)
- **M3** — `/feature` requires standard SPARC doc paths (no `--prd-path` flag)
- **L5** — `.p-replicator-state.json` not auto-gitignored
- **L6** — Statusline could profile per-section if slow

For multiplatform support roadmap (Codex, OpenCode, KiloCode) — see [`MULTIPLATFORM_ROADMAP.md`](./MULTIPLATFORM_ROADMAP.md).

---

## 📜 Changelog Highlights

> 📌 For full version history with migration notes — see [`CHANGELOG.md`](./CHANGELOG.md) (authoritative source).

<details>
<summary><b>👉 Click to expand 20 versions: v1.3.0 → v1.5.14</b></summary>

<br>

### v1.5.14 — 2026-07-28 (Docs & packaging fixes)

- 📚 **Changelog gap 1.5.5–1.5.13 closed** in `CHANGELOG.md` + this section (entries reconstructed from monorepo git history)
- 📦 `CHANGELOG.md`, `KNOWN_LIMITATIONS.md`, `MULTIPLATFORM_ROADMAP.md` and `tests/` now ship in the tarball (doc links resolve; `npm test` works in the installed package — MEASURED: 105/105 in the unpacked pack)
- 🔗 All GitHub links now point to the monorepo `github.com/djd1m/dz-harness-hub` (`packages/@dzhechkov/p-replicator`)
- 🔢 npm description skill char-count refreshed 194K+ → 880K+ (MEASURED: `find templates/.claude/skills -type f -exec cat {} + | wc -c` → 880,679)

### v1.5.13 — 2026-07-10 (brutal-honesty-review schema fix)

- 🐛 `brutal-honesty-review/schemas/output.json`: `trustTier` `const: 3` → range 1–3 so lower-tier runs validate

### v1.5.11 / v1.5.12 — 2026-07-06 (baseline-heal)

- ✨ `brutal-honesty-review` gained `evals/`, `schemas/output.json`, `scripts/validate-config.json` (monorepo baseline-heal pass); v1.5.12 = version-sync only

### v1.5.9 / v1.5.10 — 2026-07-06 (goap-ed25519 honesty rewrite + `remove` safety)

- 🔒 **`goap-research-ed25519` made cryptographically honest:** Ed25519 = provenance + tamper-evidence under pinned issuer keys, NOT anti-hallucination; SKILL.md, references and Python scripts rewritten (net −1,696 lines — MEASURED: `git diff --stat 9f18ec43 41ec8d36`)
- 🐛 `remove --dry-run` no longer deletes the manifest; `remove` keeps the manifest when some files fail to delete; v1.5.10 = version-sync only

### v1.5.8 — 2026-06-29 (Trust tiers + provenance)

- 🆕 `trust_tier` frontmatter on vendored skills; ADR-0001 `sources.json` provenance record; optional UI-replication (`clone-website`) section in `replicate-pipeline.md` (MEASURED: `git diff c9225e8f 9f18ec43 -- packages/@dzhechkov/p-replicator`)

### v1.5.7 — 2026-06-16 (CLI strictness + manifest safety)

- 🐛 Unknown options / unexpected arguments now exit 1 instead of being ignored
- 🐛 `init` manifest tracks the TEMPLATE source, never a destination scan (prevents user files being adopted then deleted by `remove`)

### v1.5.6 — 2026-06-11 (explore trust tier)

- 🆕 `explore` skill gained `trust_tier` frontmatter

### v1.5.5 — 2026-06-11 (First monorepo release)

- 📦 Published from `dz-harness-hub` monorepo; `repository`/`homepage`/`bugs` → `github.com/djd1m/dz-harness-hub`; destructive `prepublishOnly` sync hook removed

### v1.5.4 — 2026-05-13 (settings.json $schema fix)

- 🐛 `$schema` URL corrected to `https://json.schemastore.org/claude-code-settings.json` (the `www.` variant made Claude Code skip the whole settings file — statusline + hooks silently disabled)

### v1.5.3 — 2026-05-07 (Comprehensive README + visual polish)

- 📚 **Expanded `README.md`** from ~14.6 kB to ~50 kB (consolidating 8 eng/ files for npm registry visibility)
- 🎨 Visual polish: hero banner, 8 badges, emoji TOC, collapsible sections, callout blocks, `<kbd>` for CLI commands

### v1.5.2 — 2026-05-07 (Mode 2 documentation)

Formalized **"Feature workflow in existing project (Mode 2)"** across all documentation surfaces. Pure docs/spec patch — no code changes.

### v1.5.1 — 2026-05-07 (Existing-docs workflow)

Formalized **"Starting from existing technical documentation"** workflow for `/replicate`. New build.js link-rewriter for HTML guide.

### v1.5.0 — 2026-05-07 (Statusline + feature-branches)

- ✨ **Statusline dashboard** (RuFlo-style 6-line bar) via `templates/.claude/hooks/statusline.cjs`
- ✨ **`--feature-branches` flag** for `/run` and `/go` (each feature on its own branch `feature/{NNN}-{id}`)
- 🆕 `state-update.cjs` — argv-driven helper
- 🆕 `--auto-merge` companion flag

### v1.4.3 — 2026-05-07 (Orphan hook detection)

- 🐛 `mergeSettingsJson` now cleans hooks shipped previously but removed in newer template
- 🆕 `manifest.shippedDefaults['settings.json']` baseline
- 🐛 `update.js` now also uses merge logic

### v1.4.2 — 2026-05-06 (Merge + meta-tests)

- 🐛 `init --force` MERGES settings.json (preserves user customizations)
- 🆕 `--reset-settings` flag for explicit nuclear-overwrite
- 🐛 Stronger meta-test for `replicate.md` drift (multi-axis)
- 🆕 `doctor` checks `git on PATH`

### v1.4.1 — 2026-05-06 (Cross-platform + critical fix)

- 🐛 Cross-platform hooks: replaced bash chains with 4 Node scripts
- 🐛 `verify.js` SSOT: `kind: 'pre-shipped' | 'project-generated'` field
- 🐛 Meta-tests for `replicate.md` ↔ `replicate-pipeline.md` consistency
- 🐛 **Critical regression fixed:** `sync-templates.js` cleanDir silently deleted pre-shipped files

### v1.4.0 — 2026-05-06 (Major: 9 pre-shipped commands)

- ✨ **9 new pre-shipped commands:** `/start`, `/plan`, `/feature`, `/go`, `/run`, `/next`, `/myinsights`, `/docs`, `/deploy`
- ✨ **3 new pre-shipped rules:** `git-workflow`, `insights-capture`, `feature-lifecycle`
- ✨ Settings.json shipped with hooks
- ✨ `verify` command — replaces user's manual verification prompt
- 🐛 5 sources of truth divergence unified via `utils.COMPONENTS.items`

### v1.3.1 — 2026-05-06 (SSOT bugfix)

- 🐛 `cli.js` --help showed "1 rule" while `EXPECTED_RULES` had 2 entries → SSOT fix
- 🐛 `update.js` corrupted manifest → `getRelativePaths(templateClaude)` fix
- 🐛 `update` now removes orphan template files

### v1.3.0 (baseline)

Initial published version. 10 skills, 2 commands (`/replicate`, `/harvest`), 4 agents, 2 rules.

</details>

---

## 🤝 Contributing

This package is part of the [`dz-harness-hub`](https://github.com/djd1m/dz-harness-hub) monorepo
(path `packages/@dzhechkov/p-replicator`).

### Development setup

```bash
git clone https://github.com/djd1m/dz-harness-hub.git
cd dz-harness-hub/packages/@dzhechkov/p-replicator
npm install
npm test
```

### Pre-publish checklist

```bash
npm run snapshot:baseline    # regenerate baseline if templates/ changed
npm test                     # settled suite: 396 pass + 3 intentional skips
npm pack --dry-run           # verify tarball contents
npm publish
```

### Filing issues

https://github.com/djd1m/dz-harness-hub/issues

Include:
- `npx @dzhechkov/p-replicator --version` output
- `npx @dzhechkov/p-replicator verify` output
- Repro steps + expected vs actual

### Patterns persisted in AQE memory

Each significant improvement is persisted as a cross-session pattern (16+ entries from v1.3.1 → v1.5.2). Categories:

- `cli-package-ssot-component-lists`, `cli-package-manifest-preservation` (v1.3.1)
- `cli-package-pre-ship-vs-generate-boundary`, `cli-package-verify-replaces-manual-prompts` (v1.4.0)
- `cli-package-cross-platform-hooks-via-node-scripts`, `cli-package-kind-discrimination-for-ssot` (v1.4.1)
- `cli-package-settings-json-merge-vs-overwrite`, `meta-test-multi-axis-drift-detection` (v1.4.2)
- `cli-shipped-defaults-baseline-for-orphan-detection`, `cli-update-must-mirror-init-merge-logic` (v1.4.3)
- `cli-statusline-multi-line-dashboard`, `cli-feature-branches-flag-for-teaching-workflows` (v1.5.0)
- `doc-rollout-pattern` (v1.5.1, v1.5.2 — 14-surface symmetric rollout)

---

## 📃 License

MIT — see [LICENSE](./LICENSE).

---

## Links

- **npm:** https://www.npmjs.com/package/@dzhechkov/p-replicator
- **GitHub:** https://github.com/djd1m/dz-harness-hub/tree/main/packages/@dzhechkov/p-replicator
- **Issues:** https://github.com/djd1m/dz-harness-hub/issues
- **Telegram:** https://t.me/llm_notes
- **Author:** dzhechko

### Companion documentation

- [`CHANGELOG.md`](./CHANGELOG.md) — version history (authoritative)
- [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) — 8 open improvement items
- [`MULTIPLATFORM_ROADMAP.md`](./MULTIPLATFORM_ROADMAP.md) — Codex/OpenCode/KiloCode support roadmap
- [`README/ru/`](./README/ru/) — Russian documentation (8 sections)
- [`README/eng/`](./README/eng/) — English documentation (8 sections, deeper than this README)
- [`README/ru/html/index.html`](./README/ru/html/index.html) — interactive single-page HTML guide

---

**🚀 Ready to start?**

```bash
npx @dzhechkov/p-replicator init && claude
```

Then in Claude Code: `/replicate "your idea"` (new project) or `/feature add-something` (existing project).
