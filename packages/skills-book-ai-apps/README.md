# @dzhechkov/skills-book-ai-apps

Decision-moment skills **machine-distilled** from «Building Applications with AI Agents»
(Michael Albada, рус. пер., ISBN 978-601-14-1158-5) by the
[book-knowledge-digitizer](https://www.npmjs.com/package/@dzhechkov/skills-book-digitizer) pipeline.

> ⚠️ **Book-derived, `trust_tier: 1`.** Machine-distilled and **not human-reviewed against the cited
> pages** — the CP3.5 routing gate proves the skills *fire on the right prompts*, not that every
> claim is right. Verify against the pages before relying on a specific number.
>
> **What ships and what does not:** this pack contains *our own page-anchored reformulations* of the
> book's methodology (Knowledge Units) and the skills built on them — **not the book's text**. The
> corpus stays owner-local. The IP boundary is mechanically enforced by the shingling gate:
> **0 uncited verbatim runs ≥8 words** against the source (see Provenance). The book itself remains
> © its rights holders; buy it — this pack is a methodology index, not a substitute. Pack licence:
> see LICENSE.

## What it does

Makes an AI coder **apply the book's agent-engineering methodologies** at the real design moments —
not summarize the book. Each skill activates on a decision moment and gives concrete criteria,
tradeoff tables, page-anchored facts and formulas, anti-patterns, and cross-links to its siblings.

## The 17 decision-moment skills

Two distillation waves: **8** skills in wave 1, **9** added in wave 2 (marked ✳ below) — MEASURED, reproducer: `node -e "const s=require('./sources.json');console.log(s.digitizer.consumed_by_this_pack)"`, and the 17 shipped dirs are the leading entries of `files[]` in `package.json`.

207 KU references, 190 verified true / 17 partial (MEASURED — reproducer:
`cat */references/knowledge-units.md | grep '^- \*\*verified:\*\*' | sort | uniq -c`; per-skill
counts: `grep -c '^- \*\*verified:\*\*' */references/knowledge-units.md`; the full per-skill split is
also in `sources.json`).

| Skill | Decision | Chapters |
|-------|----------|----------|
| `aiagents-agent-fit-and-model-choice` | do we need an agent at all + which model/framework | 1, 2, 7, 12 |
| `aiagents-single-vs-multi-agent` | one agent or many, and the coordination scheme | 8 |
| ✳ `aiagents-orchestration-and-planning` | the control-flow archetype (reflex / ReAct / planner-executor / decomposition / reflection) + chain-vs-graph topology and its depth caps | 2, 5 |
| ✳ `aiagents-multi-agent-infrastructure` | the runtime plumbing under an agreed design: transport (A2A), broker, actor/workflow engine, storage layer | 8 |
| `aiagents-tool-design-and-selection` | tool contract + how the agent picks one at scale | 2, 4, 5 |
| `aiagents-knowledge-and-memory` | RAG vs memory, which store, how far up the ladder | 2, 6, 8 |
| ✳ `aiagents-context-engineering` | what enters THIS call's window under a token budget, and where between-call session state lives | 3, 5, 6, 8 |
| `aiagents-learning-strategy` | does it need learning, and of which class (non-parametric vs fine-tune) | 7, 11 |
| `aiagents-evaluation-design` | building the evaluation: metric mix, eval set, planner/memory/e2e scoring | 2, 9 |
| ✳ `aiagents-probabilistic-behaviour-checks` | testing the non-deterministic layer: behaviour invariants, coherence, hallucination levers, robustness, systematic-vs-variation triage | 3, 9, 10 |
| ✳ `aiagents-release-gates-and-rollout` | may this version ship, and how much live traffic next: readiness gates, shadow, canary, A-B, revert | 2, 9, 10, 11, 13 |
| ✳ `aiagents-improvement-loops` | the post-release detect → RCA → fix-lever → one prioritised backlog cycle | 11 |
| `aiagents-observability-and-drift` | production telemetry, KPI thresholds, the three drift tests | 10, 12 |
| ✳ `aiagents-human-in-the-loop` | the autonomy level and the escalation path out of it: triggers, uncertainty cutoffs, handoff packet, reviewer-fatigue failure modes | 3, 11, 12, 13 |
| ✳ `aiagents-agent-ux` | the interaction surface: modality, sync vs async, proactivity, discoverability, trust through transparency | 1, 3 |
| ✳ `aiagents-org-adoption-and-governance` | scope of authority inside a company, accountability, audit and compliance obligations | 1, 12, 13 |
| `aiagents-agent-security` | risk sources, adversarial-input catalogue, layered defence, MAESTRO | 4, 12 |

**Coverage after wave 2 (MEASURED — reproducer:
`node -e "const s=require('./sources.json');console.log(s.digitizer.consumed_by_this_pack, s.digitizer.not_consumed)"`,
cross-checked against `books/ai-apps/reduce-report.md` §6).** Every thematic cluster the reduce stage
found (T01–T17 — 17 ids, 16 independent themes, since T09 is a sub-cluster of T08) is now distilled,
so the "second wave, not distilled" NOT-clauses of the 0.1.0 pack no longer apply and no cluster is
left for a third wave. The pack's 17 skills carry **207 `derived_from` entries** resolving to
**205 distinct KUs** of the 223-KU canon (2 KUs are deliberately consumed by two skills from
different angles and are cross-linked). What remains undistilled is the tail no cluster ever
covered: **18 glossary / definition KUs**, exactly the ones §6 of the reduce report already records
as sitting outside every cluster. They are useful as a glossary; a skill does not grow out of them.

## Install

The pack is **published on npm** (CP5 taken 2026-08-18 — see Distribution). One command:

```bash
dz install @dzhechkov/skills-book-ai-apps --target claude-code
```

The explicit two-step form, if you want to see each stage (MEASURED 2026-08-18 from the tarball into
a clean mkdtemp project; the exact output is quoted below each command):

```bash
# 1. pull the pack
npm install @dzhechkov/skills-book-ai-apps --save-dev
# 2. materialise the skills for your target
dz init --target claude-code --skills-dir node_modules/@dzhechkov/skills-book-ai-apps --project .
# → dz init --target claude-code: 17 skill(s), 51 file(s) written, 0 skipped
```

The tarball itself: **60 files** (`entryCount`), roughly **3.5 MB unpacked / 1.16 MB packed**
(MEASURED — reproducer: `npm pack --dry-run --json` in the pack dir). 57 of those are the pack
content, two are the Ed25519 signature artifacts `.dz-manifest.json` + `sbom.json` (added at CP5 so
a recipient can run `dz doctor --require-signing` — a publish is refused without them), and the
60th is `brain/ai-apps.sqlite`, the 223-KU knowledge slice added at CP6 (it is most of the size).
`entryCount` is the stable
figure; the two byte sizes are self-referential — this README and `CP4-PACK-REPORT.md` are inside
the tarball, so each edit to either moves them. Read the exact current bytes off the reproducer
rather than trusting a number transcribed here.

Then confirm they actually registered — the L2 check runs a real session, not a file listing:

```bash
dz skills-verify --dir . --expect <the 17 ids> --strict   # live session listing; --static for an instant CI check
# → PASS — all 17 expected skill(s) are registered
# → session: 51 skill(s) registered · client 2.1.235 · 5 plugin(s) loaded
```

An L1 structural check of the source dir, if you just want the shapes validated:

```bash
dz verify --skills-dir node_modules/@dzhechkov/skills-book-ai-apps --target claude-code
# → 17/17 skill(s) valid
```

> **Do NOT use `dz install <tarball>`** — `dz install` takes an npm *package NAME* and looks the
> package up under `node_modules/<name>`; handed a file path it fails loudly with
> `package not found at .../node_modules//path/to/….tgz` (exit 1, MEASURED 2026-08-18). Since CP5 the
> name form works: `dz install @dzhechkov/skills-book-ai-apps --target claude-code`.

Then **just describe your task to Claude Code in plain language** — the agent auto-selects the right
skill. That is the whole workflow; the CP3.5 routing gate is what makes it work without you naming
ids — on the FULL 17-skill catalog, `97.7% activation (216/221)` and `1.8% sibling-steal`, with
`0/152` hard-negative violations (MEASURED — reproducer:
`node books/ai-apps/evals/aggregate.mjs books/ai-apps/evals/run-3`; thresholds are `>=80%`
activation / `<=10%` steal; the full report and its honest limitations are in `ROUTING-GATE.md`).
Adding 9 siblings did not disturb the first 8: `104/104` wave-1 positives still route correctly.

> «Используй нужные скиллы из набора ai-apps для решения задачи: <описание>» — works too, but is
> rarely necessary: the descriptions carry the triggers.

*Advanced, just one decision:* `dz init --target claude-code --select aiagents-agent-security`.

## Usage scenarios

### 1. "Do we even need an agent here?" — before any code is written

**Situation:** a product idea arrives phrased as "let's build an agent"; you want the honest
level-of-solution answer and, if it *is* an agent, the model/framework picked on criteria.

> «Нам нужен агент для обработки заявок в поддержку, или хватит детерминированного workflow? И какую модель под это брать?»
> *(EN: "do we need an agent for support-ticket triage, or is a deterministic workflow enough — and which model?")*

**What happens:** `aiagents-agent-fit-and-model-choice` fires, walks the four-rung ladder
(простой код → детерминированный workflow → чат-бот/RAG → автономный агент) and the five-question
gate, then — only if the gate opens — moves to model selection (size, modality, open vs proprietary,
hybrid routing, price per unit of benchmark performance, the consumer-GPU threshold) and the
framework pick. It also scopes the FIRST agent's task boundaries instead of letting scope sprawl.

### 2. Design the agent end to end (greenfield)

**Situation:** the agent is approved and you must pick tools, memory, and topology before the
architecture ossifies.

> «Проектирую агента для анализа логов: какие инструменты ему дать, как он будет их выбирать, нужна ли память/RAG и когда это станет мультиагенткой?»

**What happens:** the coupled decisions run in order —
`aiagents-tool-design-and-selection` (tool contract, schemas, error/validation, local vs API vs MCP,
tool-choice mode, and the selection ladder standard → semantic → hierarchical) →
`aiagents-knowledge-and-memory` (знания vs память, short/long-term, which store, how far up the
ladder to climb) → `aiagents-single-vs-multi-agent` (the crossing threshold, the price of crossing,
the parsimony test, coordination scheme). Each hands off with the constraint it imposes on the next.

### 3. "The agent picks the wrong tool" / "it got worse after we added tools"

**Situation:** a live agent degrades as the toolbox grows — the classic 16-tools-and-confused case.

> «У агента 30 инструментов, он стал вызывать не те. Делить на несколько агентов или чинить выбор инструментов?»

**What happens:** `aiagents-tool-design-and-selection` first exhausts the in-single-agent ladder
(better descriptions, grouping, semantic/hierarchical selection), and `aiagents-single-vs-multi-agent`
applies the parsimony test to the "just add an agent" reflex — including the coordination,
communication and token cost you pay for crossing. You get the cheap fix considered before the
expensive one.

### 4. Build the evaluation (and stop shipping on vibes)

**Situation:** you need to know whether a change made the agent better, and the current "eval" is
someone clicking through three prompts.

> «Как оценивать нашего агента? Нужны метрики, оценочный набор и как понять, что планировщик выбрал не тот инструмент.»

**What happens:** `aiagents-evaluation-design` derives the metric mix from measurable goals, shapes
each case as *input state + dialogue + expected final state*, adds unit tests per tool, scores the
planner (tool recall / tool precision / parameter accuracy), covers memory and learning components,
and wires the suite into commits and model updates. It explicitly refuses the adjacent jobs it does
not own and hands each to its owner — release gates and canary → `aiagents-release-gates-and-rollout`,
live drift → `aiagents-observability-and-drift`, the non-deterministic behaviour layer →
`aiagents-probabilistic-behaviour-checks`. (In `0.1.0` those handoffs read "second wave, not
distilled"; since wave 2 they point at real siblings.)

### 5. Production: "it degraded and there's nothing in the logs"

**Situation:** quality slid, error rate is flat, and nobody can point at a cause.

> «Агент деградировал, а ошибок в логах нет — что мониторить и как поймать дрейф?»

**What happens:** `aiagents-observability-and-drift` gives the metric taxonomy by level
(infrastructure / workflow / output quality / user feedback) with the *action* each metric triggers,
KPI alert thresholds, the telemetry-stack choice, span instrumentation and trace↔log correlation,
PII scrubbing at the export boundary, and the three distinct drift tests (Колмогоров — Смирнов,
KL-дивергенция, PSI) with the book's own readings — then the behavioural-drift response ladder.

### 6. Security review / threat model of an agentic system

**Situation:** pre-launch review, or an incident where the agent leaked its system prompt.

> «Отревьюь безопасность нашего агента: промпт-инъекции, права инструментов, периметр. Нужна модель угроз.»

**What happens:** `aiagents-agent-security` works the four inherent risk sources, the adversarial-input
catalogue (direct/indirect injection, jailbreak, evasion, JSON-framed injection, swarm exploitation)
and **where each class must be intercepted**, layered foundation-model defence, least privilege as a
containment barrier, the external perimeter (DMZ, zero-trust, mTLS, SCA/SBOM), data provenance, and
MAESTRO seven-layer threat modelling — plus red-teaming and chaos engineering as the proving step.

### 7. A multi-step flow that outgrew its shape — and the runtime under it

**Situation:** one agent runs a 12-step chain end to end, loses the thread by the last steps, and the
whole thing lives in a single process that does not survive a restart. Two different questions, and
they are easy to confuse: what SHAPE should the flow have, and what should CARRY it.

> «Наш агент обрабатывает заявку в 12 шагов подряд и к концу теряет нить. Делать граф с ветвлением или планировщик-исполнитель? И на чём это крутить — сейчас всё в одном процессе и не переживает рестарт.»
> *(EN: "our agent runs a 12-step chain and loses the thread by the end — graph with branching or planner-executor? And what should run it — right now it's one process that doesn't survive a restart.")*

**What happens:** `aiagents-orchestration-and-planning` settles the shape first — the control-flow
archetype (reflex, ReAct, planner-executor with a large model planning and cheaper calls executing,
query decomposition / self-ask with search, reflection placed *before* irreversible operations), then
the execution mode (single call, parallel calls, chain, or a graph with conditional edges and a
consolidation node), the maximum chain length / graph depth / branching caps that stop errors
compounding, and incremental replanning after each observation instead of one upfront plan — all
under the five-practice rule of picking the SIMPLEST planning method the scenario tolerates. Then
`aiagents-multi-agent-infrastructure` takes that shape as given and picks the plumbing: transport
(in-process calls → A2A agent cards and JSON-RPC over HTTPS → a broker), the broker itself (Kafka for
durable replayable logs, Redis Streams for cheap decoupling, RabbitMQ, NATS/JetStream), the execution
runtime (monolith, event bus, an actor framework like Ray/Orleans/Akka past the book's
more-than-10–20-agents threshold, or a workflow engine — Temporal, Airflow, Dagger), per-session
actor isolation, and where shared state and task metadata durably live. Neither skill answers the
other's question: the shape is handed over, and the plumbing skill does not re-litigate it.

### 8. Getting a new agent version in front of real users without breaking them

**Situation:** a new version (a prompt change, a new tool) passes locally. Now it has to reach users,
and "it looked fine in three manual runs" is not a release decision.

> «Готова новая версия агента. Как понять, что её вообще можно выкатывать, сколько трафика ей дать и что делать с тем, что вылезет на канарейке? И отдельно: агент даёт разные ответы на один и тот же запрос — это регрессия или нормальный разброс?»
> *(EN: "a new agent version is ready — how do I decide it may ship at all, how much traffic to give it, and what to do with whatever the canary surfaces? And: it answers the same prompt differently each time — regression or normal variance?")*

**What happens:** `aiagents-release-gates-and-rollout` sets the promotion decision — readiness
criteria and the blocking gates (quantitative thresholds on the relevant eval sets, stress and
edge-case stability, component checklists, auto-block on a multi-step regression, explicit tech-lead
/ product approval after the pilot) — then the exposure ladder: RC/staging → теневой режим (shadow
run on live input whose output never reaches a user) → канареечное развертывание at the book's
`1–5 %` traffic slice
with a version tag that makes the «канарейка против базы» comparison possible → blue-green, rolling,
staged pilot expansion, or a 50/50 live experiment with its four setup requirements and the
agent-specific long-term-state trap (or an adaptive Bayesian bandit) — plus the revert path.
`aiagents-probabilistic-behaviour-checks` supplies what the gate is allowed to read as a failure on
the non-deterministic layer: consistency as behaviour INVARIANTS rather than byte identity, coherence
across a long dialogue, robustness where the pass criterion is clarify-degrade-escalate rather than
crash-or-fabricate, and the book's triage rule (rerun three-to-five times, `>80 %` failure rate) that
separates a systematic failure from legitimate variation *before* it blocks a release. Whatever the
canary does surface goes to `aiagents-improvement-loops`: automated detection → the four-step agent
RCA (трассировка → локализация → распознавание закономерностей → оценка последствий) → the fix levers
(prompt refinement with its verification gate, automated prompt optimisation, tool-level refinement)
→ one deduplicated backlog prioritised on frequency, criticality, feasibility, strategy fit and
recurrence risk.

### 9. An agent going into an organisation, not just into production

**Situation:** the pilot worked for one team and now the agent is being pointed at company systems.
The blocking questions are no longer technical: how much may it decide alone, when must it stop and
ask a human, who answers when it is wrong, and what does an employee actually see.

> «Раскатываем агента на всю компанию. Что он может решать сам, а что обязан отдавать человеку? Кто отвечает, если он ошибётся, и что логировать для аудита? И как он должен выглядеть для сотрудника — чат, дашборд, уведомления?»
> *(EN: "we're rolling the agent out company-wide. What may it decide alone, what must go to a human, who is accountable when it's wrong, what do we log for audit — and what should it look like to an employee?")*

**What happens:** `aiagents-human-in-the-loop` sets the runtime side — the autonomy slider (ручной /
с промптом / агентный) and the executor → reviewer → collaborator → governor axis, the escalation
triggers (unexplained long-running errors, regulatory or ethical anomalies, failures on critical
tasks, contradictory automated conclusions) and the uncertainty instruments with their own cutoffs
(self-reported confidence, entropy of the class distribution, divergence across repeated runs, a
separate critic model), the escalation BUDGET that keeps reviewers from burning out, the shape of the
handoff packet, graduated delegation — and the four ways oversight itself decays (automation bias,
alert fatigue, skill decay, incentive mismatch). `aiagents-org-adoption-and-governance` owns the
organisational side: the five областей действия (персональная / командная / проектная /
функциональная / организационная), whether the agent inherits the permissions of the person it
assists or needs its own role, RBAC by data sensitivity, memory partitioned along the same scope
boundaries so a team agent does not surface shared material in a private chat, the authorisation
ladder up to a распорядительный совет, who is answerable for harm, ready-made frames instead of an
invented process (NIST AI RMF, an EU-AI-Act-aligned impact assessment, ISO 42001), decision /
interaction / failure logs an auditor can reconstruct a case from, and compliance gates built into
the pipeline (policy-as-code, one failed check fails the build). `aiagents-agent-ux` designs the
surface all of that is felt through — modality choice, синхронный vs асинхронный, проактивность без
назойливости, обнаруживаемость возможностей for an interface with no visible affordances, and the
прозрачность/предсказуемость that decides whether people trust it.

## Deep lookup — how «см. источник» actually resolves

Each skill ships its consumed Knowledge Units **in full** at
`<skill>/references/knowledge-units.md` (207 KU entries across the pack, page-anchored). That file
is inside the pack, so the deep lookup works on any machine and any target.

Honest tier declaration (`sources.json → lookup_tiers`):

| Tier | Available? |
|---|---|
| `references/` in-pack | **always** |
| corpus (`books/ai-apps/corpus/`) | owner-local only, in the digitizer workspace |
| brain (`dz brain query --source ai-apps`) | **available since CP6** — the pack ships the per-book KB slice `brain/ai-apps.sqlite` (**223 KU**, the full canon). One command loads it into *your* brain: `dz brain add --from-pack @dzhechkov/skills-book-ai-apps`. See "The knowledge, not just the behavior" below. |

### The knowledge, not just the behavior

The 17 skills are the *behavior* — what an agent does at a decision moment. The **223 Knowledge
Units** behind them are the *knowledge*, and they ship too, so one install carries both:

```bash
dz brain add --from-pack @dzhechkov/skills-book-ai-apps
# → idempotent upsert on (book, ku_id, corpus_version) into YOUR ~/.dz/brain; vectors re-embedded locally
dz brain query "один агент или несколько" --source ai-apps
# → [ai-apps гл.2 с.57-208] (decision-framework) Один агент или несколько: критерии выбора и цена каждого варианта
dz brain primer ai-apps      # capability card: KU-type histogram + top decision moments
```

Once loaded it answers **in any project**, not just the one that installed the pack — that is the
whole point of the brain. Re-installing is safe: the upsert is keyed on
`(book, ku_id, corpus_version)`, so it replaces rather than duplicates; refresh a re-digitized book
with `dz brain update ai-apps`.

The slice is **lexical-only** (portable `books.sqlite`, 223 rows, `WHERE book='ai-apps'` — no other
source rides along) and passed the **same** shingling IP gate as the rest of the pack: all 223 KU
texts dumped and checked, **0 uncited verbatim runs ≥8 words** (MEASURED — 59 300 shingles against
the corpus's 101 988 8-grams). It carries KUs, never the book's text.

> **`dz recall --books` is the PROJECT store, not the brain.** `dz recall --books --book ai-apps`
> reads `.dz/memory/books.sqlite` in the current project and returns nothing in a project that has
> not indexed the book (MEASURED 2026-08-19 — `0 KU hit(s)` from a fresh dir, while
> `dz brain query --source ai-apps` returned hits from the same dir). The cross-project verbs are
> `dz brain query` / `dz brain ground` / `dz brain primer`. Its lexical matching is prefix-AND with
> no stemming or synonymy, so a long natural-language question can return 0 while its keywords
> return hits — route fuzzy/semantic queries through `dz brain ground`.

## Copilot / always-on targets

On GitHub Copilot every instruction file is loaded on **every** request. Aggregate size of this
pack's 17 SKILL.md bodies: **763 183 bytes / 727 835 chars** (MEASURED — reproducer:
`cat aiagents-*/SKILL.md | wc -c` and `cat aiagents-*/SKILL.md | wc -m`; `references/` is *not*
loaded on Copilot and is excluded). At the digitizer's 2.1 chars-per-token constant that is an
**ESTIMATE of ≈347 k tokens per request** if you install all 17 (`727 835 / 2.1`; on the raw byte
count the same constant would read ≈363 k — the token figure is an estimate derived from a measured
size, not a measured token count). Wave 2 roughly doubled the resident cost: 0.1.0's 8 bodies were
354 846 B. Smallest body 29 187 B (`aiagents-context-engineering`), largest 63 936 B
(`aiagents-agent-security`) (MEASURED — reproducer:
`for f in aiagents-*/SKILL.md; do wc -c "$f"; done | sort -n`).

**Five** bodies exceed the harness's `50 000`-byte body bound (`harness-core/src/benchmark.ts:99`,
`stat.size >= 100 && stat.size <= 50000`) and are reported as such — `aiagents-agent-security`
63 936 B, `aiagents-multi-agent-infrastructure` 55 790 B, `aiagents-observability-and-drift` 54 485 B,
`aiagents-improvement-loops` 53 204 B, `aiagents-org-adoption-and-governance` 50 409 B. Those five
are **exactly** the pack's five B grades in the L0 benchmark below — MEASURED from the per-skill
table of `dz benchmark packages/@dzhechkov/skills-book-ai-apps --all`: every one of the 12 A skills
scores `18/20` and every one of the 5 B skills scores `17/20`, one failed check apart. Body size is
the whole gap between this pack and a straight-A one, and it is not hidden.

**Therefore: on Copilot install only the skills matching the current work, not the pack.** These
bodies are not lean — see finding D2 in `CP4-PACK-REPORT.md`; the pack is designed for
progressive-disclosure targets. On Claude Code the whole pack is fine: only each skill's description
is always resident, and the body loads on activation.

## Provenance

`sources.json`: `upstream_type: book`, ISBN, per-skill `derived_from` KU ids and verified counts,
corpus_version `120bf49aec034522`, extraction/verification/judge models. No `origin` block (the book
is the immutable upstream; `dz sync-upstream` skips book packs).

Gates below were MEASURED on 2026-08-18/19 against the content published as `0.2.2` (`0.2.1` was
the CP5 publish; `0.2.2` added the CP6 knowledge slice). `0.2.9` re-ships that same content — the
only change is this README and a signature that matches the shipped bytes — so the figures carry
over unchanged; they were not re-run for `0.2.9`:

- **KU verification** — the canon is UNCHANGED by wave 2: 223 canon KUs, 202 true / 21 partial /
  0 false (cross-family judge `gpt-5.6-sol`, 0 Claude fallbacks). This pack now consumes 207
  `derived_from` entries resolving to 205 distinct KUs; the per-skill copies in `references/`
  carry 190 `true` / 17 `partial` (reproducer:
  `cat */references/knowledge-units.md | grep '^- \*\*verified:\*\*' | sort | uniq -c`).
- **IP / shingling** — `node packages/@dzhechkov/skills-book-digitizer/scripts/shingling-check.mjs --source books/ai-apps/corpus --output <pack> --shingle 8`
  → **0 uncited verbatim runs ≥8 words**. **Re-run at CP5** (2026-08-19, on the exact bytes being
  published — the last moment to catch a leak before it leaves the machine): leg 1 **0 violations**
  over 37 md files / 157 983 shingles, leg 2 **0 violations** over the 17 `evals/routing.yaml`
  (8 702 shingles). The wave-2 figures below are the same gate at assembly time. Leg 1 over 37 md files / 154 743 shingles; leg 2 over the
  17 `evals/routing.yaml` copied to `*.md` (8 702 shingles) — the checker walks only `*.md`, so the
  yaml has to be checked explicitly. Both legs against the same 101 988 corpus 8-grams.
- **Routing (CP3.5)** — re-run on the FULL 17-skill catalog: `97.7% activation (216/221)`,
  `1.8% sibling-steal`, `0/152` hard-negative violations, `0/373` judge fallbacks, judge
  `codex exec -m gpt-5.6-sol` (reproducer:
  `node books/ai-apps/evals/aggregate.mjs books/ai-apps/evals/run-3`). Thresholds: `>=80%`
  activation, `<=10%` steal. **Wave-1 regression:** `104/104` wave-1 positives still route correctly
  against the expanded catalog — adding 9 siblings did not steal from the original 8. Full report and
  its recorded limitations: `ROUTING-GATE.md`. Pack-assembly gates and findings: `CP4-PACK-REPORT.md`.
- **L0 benchmark** — MEASURED via `dz benchmark packages/@dzhechkov/skills-book-ai-apps --all`:
  `Skills: 17  Pass rate: 89%  (301/340)`, `12 A` / `5 B`. The B grades come from body size —
  see the Copilot section above; nothing is hidden behind the aggregate.
- **Structural + live registration** — `dz verify --skills-dir <pack> --target claude-code` →
  `17/17 skill(s) valid` (L1); `dz skills-verify --dir . --expect <17 ids> --strict` →
  `PASS — all 17 expected skill(s) are registered` (L2, run from a fresh `mktemp -d` project after
  `npm install` of the real tarball — `session: 51 skill(s) registered · client 2.1.235 ·
  5 plugin(s) loaded`).

## Distribution

**CP5 is taken.** The owner decided on **2026-08-18** to publish this pack to npm, recorded in
`sources.json → distribution` (`state: public`, `decided_by: owner`, `date`, `rationale`). Every
version before this one was structurally unpublishable (`private: true` +
`publishConfig.access: restricted`); both guardrails are lifted by that recorded decision.

The **first published version was `0.2.1`** (2026-08-19) — `dz publish` bumps the patch on release,
so the wave-2 content staged as `0.2.0` is what shipped under that tag; `0.2.0` itself was never
published. `0.2.2` (2026-08-19) added the CP6 knowledge slice.

**`0.2.1` and `0.2.2` are deprecated on npm — install `0.2.9` or later.** Both were published
through `dz publish`, which signs the pack BEFORE it bumps the version and rewrites version strings
in the README. The consequence is measurable on the registry tarball, not just in theory: `dz
verify-pack` on the unpacked `0.2.2` reports `README.md: content does not match its signed hash` and
`package.json: content does not match its signed hash`, and the rewrite turned two true sentences in
this file into false ones (it claimed `0.2.2` was the first published version, and collapsed three
distinct version numbers into one). The pack CONTENT — skills, KUs, brain slice, gates — was never
in question; what was broken is the claim about it and the signature over it.

`0.2.9` carries this corrected README and a signature made over the exact bytes that ship. It was
published with a raw `npm publish` from the pack directory, deliberately: this pack declares **no
dependencies at all** (verify with `npm view @dzhechkov/skills-book-ai-apps@0.2.9 dependencies`), so
the workspace-`*` leak that `dz publish` exists to prevent cannot occur here. For any pack that DOES
carry internal dependencies, `dz publish` remains the only safe route.

**CP6 is also taken** (owner, 2026-08-18; executed 2026-08-19). The 223 KUs were promoted into the
owner's durable cross-project brain, and — because CP5 made the pack public — the per-book slice now
rides the pack as `brain/ai-apps.sqlite`, published in **`0.2.2`**. The two decisions stay distinct:
CP5 governs what leaves the machine, CP6 governs where the owner's own knowledge lives. The
*accreted personal brain* is private and never distributed; the shareable unit is this pack's slice.

What neither decision changes: the corpus is not distributed, the skills and KUs carry their page
anchors, and the shingling gate is what keeps the two apart.
