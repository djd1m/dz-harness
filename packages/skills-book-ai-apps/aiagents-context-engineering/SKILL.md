---
name: aiagents-context-engineering
description: >
  Decide what enters THIS model call's context window and what stays outside it: the token-budget
  arithmetic (1 токен ≈ ¾ слова / ~4 символа; 4000 токенов ≈ 12 страниц; 272 000-token vs
  million-token windows) and how to spend a budget smaller than the material, the four assembly
  principles релевантность / ясность / сжатие / динамичность, whether a very long window lets you
  drop the retrieval node or the hybrid still wins, ведение заметок (self-notes) as a compression
  scheme next to plain inference and chain-of-thought, and where the state that must survive
  BETWEEN calls physically lives — клиент, сервер или гибрид, session id vs account binding, and why
  session state cannot sit in process memory once user counts grow. Per-call context ASSEMBLY plus
  the between-call state LOCATION ONLY — NOT which knowledge or memory MECHANISM to build in the
  first place (RAG, инвертированный индекс + BM25, vector store, experience memory, GraphRAG, memory
  types → `aiagents-knowledge-and-memory`), NOT the control flow that decides which step runs next
  (ReAct, planner-executor, decomposition → `aiagents-orchestration-and-planning`), NOT choosing the
  durable storage layer of a multi-agent runtime — PostgreSQL/Redis, векторные хранилища, S3,
  Temporal/Orleans (→ `aiagents-multi-agent-infrastructure`), NOT the harness's own runtime
  context-pressure playbook of priority pruning, checkpoint-restore, compaction and delegation at
  ~60% capacity (→ `context-window-management`, which owns that operational craft — this skill is
  the design-time budget and placement decision), NOT one product's memory API
  (→ `agentdb-memory`), NOT distilling a document for a human reader (→ `knowledge-extractor`),
  NOT the interface through which the user perceives that continuity (→ `aiagents-agent-ux`).
  Triggers (RU+EN): "сколько токенов влезет в окно", "1000 токенов — это сколько слов",
  "что класть в промпт на этом шаге, а что оставить снаружи",
  "чем контекст-инжиниринг отличается от промпт-инжиниринга",
  "залить всю базу знаний в окно на миллион токенов?", "нужен ли внешний поиск, если окно огромное",
  "как сжать длинную историю диалога перед следующим вызовом",
  "заметки модели вместо цепочки рассуждений",
  "где хранить состояние сеанса — в браузере или на сервере",
  "теряется контекст при смене устройства", "состояние сеанса переживёт перезапуск сервера?",
  "how many pages actually fit in this context window", "long context vs retrieval — can I drop RAG",
  "what belongs in the prompt for this planning step", "summarise the dialogue before the next call",
  "where do I keep session state for millions of users", "anonymous session id or account binding".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from:
  - ai-apps-ch05-p117-ku13
  - ai-apps-ch06-p144-ku03
  - ai-apps-ch06-p144-ku15
  - ai-apps-ch06-p144-ku17
  - ai-apps-ch03-p66-ku12
  - ai-apps-ch03-p66-ku13
  - ai-apps-ch08-p193-ku25
---

# Context engineering — what this call's window carries, what gets compressed, and where the rest of the state waits

## Output
A context-assembly specification for the ADR / architecture step: the per-step budget in tokens with
the arithmetic behind it, an ordered list of what is assembled into each call (system prompt,
retrieved knowledge, workflow state, user input) and what is deliberately left out, the compression
scheme for long histories, an explicit long-window-versus-retrieval verdict, and the placement of
between-call state (client / server / hybrid, session-id or account-bound) with the state-hygiene
rules that go with it.

## When to use / NOT
- **Use when:** sizing a token budget before writing the orchestration code; deciding what each step
  of a multi-step flow is allowed to see; the prompt no longer fits and something must be summarised
  or dropped; a model with a very long window arrives and someone proposes deleting the retrieval
  node; the dialogue history has to be compressed without losing what matters; deciding whether
  session context lives in the browser, on the server, or in both; an agent loses the thread when the
  user switches device or comes back a day later; session state currently sits in process memory and
  the user count is about to grow.
- **NOT for:** choosing the knowledge or memory MECHANISM itself — RAG, keyword index, vector store,
  experience memory, GraphRAG, and the short/long or episodic/semantic split — that is
  `aiagents-knowledge-and-memory`; this skill starts *after* that mechanism exists and decides how
  much of its output fits in one call. Not the control flow that produces the steps
  (→ `aiagents-orchestration-and-planning`). Not the storage-layer selection for a multi-agent
  runtime (→ `aiagents-multi-agent-infrastructure`; see §7 — that seam is explicit). Not the
  operational context-pressure playbook of the harness itself — pruning priorities, checkpoint and
  restore, compaction triggers, delegation — which `context-window-management` already owns; route
  "my session is running out of context right now" there and keep this skill for "how should the
  product assemble its context". Not `agentdb-memory` (one product's API), not
  `knowledge-extractor` (summarising a document for a person), not the user-facing interface that
  makes continuity visible (→ `aiagents-agent-ux`).

## Decision criteria

### 1. What the discipline is, and its four assembly principles (KU: ch05-ku13)
The book draws the line this way: prompt engineering is about writing effective instructions, while
context engineering is the dynamic assembly of every input — the user's messages, retrieved
knowledge, workflow state, system prompts — into one structured, token-optimised window [p.141].
So the unit of work here is *one model call*, not *one prompt template*.

Four principles to apply while assembling that call [p.142]:

| Принцип | What it demands of the assembly step | The failure it prevents |
|---|---|---|
| **Релевантность** | Pull from memory and knowledge bases only what is useful for this step, instead of attaching large undifferentiated blocks of text | Irrelevant material distracts the model and consumes budget with no return [p.142] |
| **Ясность** | Structural formatting and schemas — the book names MCP — so state and knowledge arrive in a predictable, easily interpretable shape | The model has to guess at the shape of what it was handed |
| **Сжатие** | Summarise long histories into compact representations that keep what is essential | The history alone exhausts the window |
| **Динамичность** | Reassemble the context at every inference step, against the agent's current goals, the stage of the flow, and the user's input | A context frozen at session start stops matching the step being executed |

The book's own coupling to the control flow [p.141]: the planner-executor shape depends on handing
executors clear results of the planned steps, and ReAct depends on embedding tool results into the
next cycle's prompt. Which archetype you run therefore fixes *what must be re-injected each cycle* —
choosing the archetype itself is `aiagents-orchestration-and-planning`.

Scope of the claim: the book states the principles and the distraction/burn cost qualitatively; it
gives no measurement, no scoring function for relevance, and no experiment behind the four-item list.
Every added element earns its place only if its inclusion was thought through [p.142].

### 2. Token-budget arithmetic — do this before writing code (KU: ch06-ku03)
Definitions the rest of the section rests on [p.145]: the *context window* is the information handed
to the foundation model on the input of a single call; the *context length* is the maximum number of
tokens absorbed and processed in that one call. The window behaves as the working memory of a
request [p.145].

Conversion and capacity figures as the book states them:

| Величина | Значение по книге |
|---|---|
| 1 токен | в среднем ¾ слова, приблизительно четыре символа [p.145] |
| 1000 токенов | примерно 750 английских слов [p.145] |
| 4000 токенов | ≈3000 слов, ~12 страниц [p.145] |
| 8000 токенов | ≈6000 слов, то есть 24 страницы [p.145] |
| Claude 3.7 Sonnet, GPT-5 | максимум 272 000 токенов на вводе [p.145] |
| Gemini 2.5 | до миллиона токенов [p.145] |
| 1 миллион токенов | ≈750 000 слов; свыше 2500 страниц [p.160] |

The governing rule to plan against [p.146]: the model receives everything it needs to carry the task
to completion and nothing beyond that; when there is more material than fits, the spending of the
token budget is planned deliberately.

Two honesty constraints that come with these numbers:

- **The word conversion is English-only.** The ratio is given for English text [p.145]; the pages
  carry no estimate for other languages, so a Russian- or code-heavy corpus needs its own measurement
  before you trust a page count.
- **The model roster in the book is internally inconsistent and already ageing.** On p.145 the
  million-token window is attributed to Gemini 2.5 while OpenAI appears as GPT-5 with 272 000; on
  p.160 the million-token tier lists GPT-4.1 and Gemini 2.5 [p.160]. Treat the capacities as an order
  of magnitude and read the current limits from the provider, not from the book (this reconciliation
  is the extractor's note, not a statement of the book).

### 3. Very long window versus an external retrieval node (KU: ch06-ku15)
The tempting simplification [p.160]: windows have grown to unprecedented length, so pour the whole
knowledge base straight into the prompt and delete the vector store and the indexes. Index-free RAG
moves the retrieval logic *inside* the long-context model — chunking and relevance scoring happen in
the model itself, and external vector stores and inverted indexes are no longer required [p.160];
instead of orchestrating separate retrieval and ranking nodes, the agent loads whole knowledge
bases — policy manuals, technical specifications — into the prompt and leans on attention [p.160].

Restructured from the chapter's outlook section, гл. 6, с. 160-161, around the question *do I still
need external retrieval*:

| Что вы получаете | Чем платите |
|---|---|
| Простота: нет узлов поиска и ранжирования [p.160] | Running millions of tokens in one pass consumes serious compute and hits latency and cost — sometimes cancelling the simplicity gain itself [p.161] |
| Модель «видит» весь документ целиком [p.160] | Nothing guarantees the model will correctly locate the single relevant fragment inside a window that large [p.161] |

**The book's position at the time of writing [p.161]:** the consensus is that hybrid architectures
stay useful — even with multi-page windows, RAG can outrun long-context models on factual queries and
enterprise cases, particularly where freshness of memory or ranking accuracy matters; real systems
more often combine the enlarged window with selective retrieval nodes, balancing cost against factual
accuracy [p.161].

The authors also record a forecast [p.161]: they would not be surprised if growth in models, windows
and compute eventually devalues advanced text and vector search. **That is labelled as an
expectation, not a measurement** — and the book presents no comparative long-context-versus-RAG
benchmark, so neither side of this decision can be settled from it numerically.

### 4. Compression scheme: ведение заметок / self-notes (KU: ch06-ku17)
The technique: ask the model to take notes on the input context instead of rushing straight at the
answer [p.162]. The notes are made *before* the question is presented, and afterwards they are
interleaved with the original context as the task is worked through [p.163]. The book's analogy is
human margin notes and a short summary of a paragraph or section [p.163].

Рис. 6.5 [p.163] sets three inference schemes side by side:

- **Стандарт** — context plus question go in, the answer comes out directly.
- **Цепочка рассуждений** — the model is given room to reason about the task and only then produces
  the answer.
- **Ведение заметок** — notes over the different parts of the context, then a note about the
  question, and only then the final answer.

> **Deliberately not built here:** an escalation table of the form "when to move from standard to
> chain-of-thought to note-taking". The book *presents* the three schemes in one figure; it draws no
> ladder between them and states no criterion for crossing from one to the next, so a table with such
> a header would assert more than the source does.

What is claimed and what is not: the book reports that experiments show good results across various
logical-processing and evaluation tasks, plus potential for adaptation to a wide range of scenarios
[p.163]. **No numeric experimental results are given** [p.163], and the implementation route — one
model call or several — is not described on these pages. The primary source the book points at is
Jack Lanchantin et al., «Learning to Reason and Memorize with Self-Notes», arXiv, 1 мая 2023 г.
[p.162]; go there for numbers.

### 5. Where between-call state physically lives: client, server, or hybrid (KU: ch03-ku12)
The storage method shapes the experience directly — speed, continuity across devices, privacy
[p.86]. Trade-offs as the book states them [p.86-87]:

| Стратегия | Выигрыш | Цена |
|---|---|---|
| Клиентская (например, память браузера) | Быстро в рамках сессии [p.86] | Continuity is lost when the user switches device or signs in again, which breaks the smoothness of the experience [p.86] |
| Серверная (БД, привязка к идентификатору пользователя) | Долгосрочная память и кроссплатформенность [p.86] | Latency and privacy problems become possible [p.86] |
| Гибридная: краткосрочный контекст на клиенте, долгосрочный на сервере | Often the optimal UX balance — responsiveness together with continuity [p.86-87] | *(extractor inference, not a book claim)* two stores to build and to keep in sync |

Selection criteria the book names [p.86-87]: the user's journey, the privacy requirements, and the
desired degree of personalisation. Its framing of why this matters at all:
«контекст — это и есть пользовательский опыт» [p.87] — how the agent remembers, adapts and reacts
shapes how human it feels [p.87]. Two accompanying risks [p.87]: losing context mid-task makes the
interaction feel disjointed and repetitive, while storing excessive detail makes the system unwieldy
and threatens privacy. The lifetime split used here: short-term memory is the current session,
long-term memory is preferences and patterns across sessions [p.87].

Boundary note carried from the source: chapter 3 explicitly defers the detailed treatment of memory
management to chapter 6 [p.85] — in this catalogue that detail is `aiagents-knowledge-and-memory`.

### 6. Holding state between interactions at scale (KU: ch03-ku13)
In multi-step dialogues and flows with intermediate states, losing context produces frustration,
inefficiency and unfinished tasks [p.87]. Three things the agent has to keep hold of [p.87]: what has
happened up to this moment, what goal the person is pursuing, and which step logically comes next.

**Identification [p.87]:**

| Case | Binding | What it buys |
|---|---|---|
| Signed-in users | State bound to the account | Long-term context preserved across devices and sessions [p.87] |
| Anonymous interaction | Session identifier — cookie or token | The dialogue is tracked between client and server [p.87] |

**Scale [p.87]:** at thousands-to-millions of users, session state cannot be held in process memory
alone — put it in a database or a distributed cache so it survives server restarts, so load can be
spread, and so several devices are supported.

**User memory versus session memory [p.87-88]:** choose between long-term personalised user memory
and short-term session memory by privacy requirements, user expectations, and the operational
architecture.

**State hygiene [p.88]:**

- [ ] Clear session boundaries, data validation, fallback mechanisms.
- [ ] On context loss, recover properly through clarifying questions rather than incorrect
      assumptions.
- [ ] Handle session data — especially sensitive or personalised data — safely and responsibly.

Scope: the section states requirements for the store, not concrete database or cache schemas.

### 7. The storage LAYER underneath — an explicit seam (KU: ch08-ku25)
Once §5 and §6 have established that some state must outlive the call and the process, the next
question is *which layer* holds it: stateful databases, vector stores, object storage, or a stateful
orchestration framework that checkpoints for you. **That choice is not this skill's.** KU
`ai-apps-ch08-p193-ku25` (гл. 8, табл. 8.1, с. 234-236) is owned by
`aiagents-multi-agent-infrastructure`, which carries the full options table; only the
where-does-state-live-between-calls angle is used here, and only to hand the decision over.

What is worth carrying across the seam is the shape of the trade-off: the book frames the final
compromise on four axes — усилия разработчика, производительность, долговременность, гибкость
[p.236] — and gives **no quantitative guidance** on any of them. So a context-engineering
recommendation should state which axis dominates for this system and stop there; the layer itself is
selected in the sibling skill.

## Key facts & formulas
- 1 токен ≈ ¾ слова ≈ four characters [p.145].
- 1000 токенов ≈ 750 English words; 4000 токенов ≈ 3000 words ≈ 12 pages; 8000 токенов ≈ 6000 words
  = 24 pages [p.145].
- Максимум на вводе: 272 000 токенов (Claude 3.7 Sonnet, GPT-5); до миллиона (Gemini 2.5) [p.145].
- 1 миллион токенов ≈ 750 000 слов, свыше 2500 страниц [p.160]; the million-token tier on p.160
  lists GPT-4.1 and Gemini 2.5 — inconsistent with p.145 [p.160].
- Four assembly principles: релевантность, ясность, сжатие, динамичность [p.142].
- Named interchange schema for the clarity principle: MCP [p.142].
- Three inference schemes in Рис. 6.5: стандарт, цепочка рассуждений, ведение заметок [p.163].
- Note-taking's primary source: Lanchantin et al., «Learning to Reason and Memorize with Self-Notes»,
  arXiv, 1 мая 2023 г. [p.162].
- Three context-storage strategies: клиентская, серверная, гибридная [p.86-87].
- Two identification modes: account binding for signed-in users, session id (cookie/token) for
  anonymous ones [p.87].
- Four trade-off axes for the durable storage layer: усилия разработчика, производительность,
  долговременность, гибкость — no numbers attached [p.236].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Attaching large blocks of text wholesale because they are "probably relevant" | The relevance principle exists against exactly this: irrelevant material distracts the model and burns budget with no return | ch05-ku13 |
| Assembling the context once at session start and reusing it for every step | The dynamism principle requires reassembly at each inference step against current goals, flow stage and user input | ch05-ku13 |
| Handing state to the model as unstructured prose | The clarity principle asks for structural formatting and schemas so state arrives predictably interpretable | ch05-ku13 |
| Sizing a Russian or code-heavy corpus with the 750-words-per-1000-tokens ratio | That conversion is given for English; the pages offer no estimate for other languages | ch06-ku03 |
| Quoting the book's window capacities as current provider limits | The model roster is inconsistent between с.145 and с.160 and such figures age fast — read the limit from the provider | ch06-ku03 |
| Deleting the vector store because the new model has a million-token window | Running millions of tokens per call costs compute, latency and money, and correct location of the one relevant fragment is not guaranteed | ch06-ku15 |
| Citing the authors' forecast about search being devalued as an established result | It is explicitly an expectation; the book presents no comparative long-context-versus-RAG benchmark | ch06-ku15 |
| Promising a measured gain from note-taking | Only a qualitative claim of good results is made; no numbers, and no implementation route, appear on those pages | ch06-ku17 |
| Client-side context storage for a journey that spans devices or return visits | Continuity is exactly what is lost on a device switch or re-login | ch03-ku12 |
| Persisting every detail "just in case" | Excessive stored detail makes the system unwieldy and threatens privacy | ch03-ku12 |
| Keeping session state in process memory at thousands-to-millions of users | It does not survive a server restart, cannot spread load, and cannot back several devices | ch03-ku13 |
| Guessing the user's intent after context is lost | The prescribed recovery is clarifying questions, not incorrect assumptions | ch03-ku13 |
| Picking the durable storage layer from this skill | The compromise is stated on four axes with no quantitative guidance; the layer options table belongs to `aiagents-multi-agent-infrastructure` | ch08-ku25 |

## Related decisions
- Decided which retrieval or memory mechanism exists at all → `aiagents-knowledge-and-memory`. That
  skill picks the store and the mechanism; this one decides how much of its output fits into a single
  call and in what shape. If you cross to a hybrid here (§3), that sibling owns the retrieval side of
  the hybrid.
- Chose the control-flow archetype → `aiagents-orchestration-and-planning`. The choice fixes what has
  to be re-injected each cycle: planner-executor requires clear results of planned steps reaching the
  executors, ReAct requires tool results embedded in the next cycle's prompt [p.141].
- Concluded that state must survive restarts, or that several agents share it →
  `aiagents-multi-agent-infrastructure` for the layer itself (§7 seam).
- Chose client-side or hybrid storage → `aiagents-agent-ux`: the perceived continuity, the recovery
  dialogue and the "context is the experience" framing land in the interface, and losing context
  mid-task is felt as a UX defect [p.87].
- Session data is sensitive or personalised → `aiagents-agent-security`: the book asks for safe and
  responsible handling of it [p.88]; the perimeter, encryption and access control are designed there.
- Compression by summarising or note-taking is now in the flow → `aiagents-evaluation-design`: the
  book supplies no metric for context quality or for how much a summary loses, so the acceptance
  criterion has to be constructed.
- The million-token window is on the table as an architectural option →
  `aiagents-agent-fit-and-model-choice` for the model side of that trade; the retrieval-versus-window
  balance itself is §3 here.
- Recovery through clarifying questions is the fallback on context loss →
  `aiagents-human-in-the-loop` when the recovery escalates to a person rather than to another prompt.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 3 «UX-дизайн для агентных систем» (с. 86-88), глава 5 «Оркестрация» (с. 141-142), глава 6
«Знания и память» (с. 145-146, 160-163), глава 8 «От одного агента ко многим» (с. 234-236) — page
ranges computed from the `sources:` blocks of the 7 consumed KUs.

KUs: ai-apps-ch05-p117-ku13; ai-apps-ch06-p144-ku03, ku15, ku17; ai-apps-ch03-p66-ku12, ku13;
ai-apps-ch08-p193-ku25 (seam KU — owned by `aiagents-multi-agent-infrastructure`, used here only for
the where-does-state-live angle). Deep reference: `references/knowledge-units.md`.

Anchor quotes for human spot-check:
- Context engineering's stake: «хорошо спроектированный контекст раскрывает полный потенциал даже
  посредственных моделей» [p.142].
- State placement as product quality: «контекст — это и есть пользовательский опыт» [p.87].

## Self-check
- [x] Every criterion and anti-pattern traces to a KU listed in `derived_from`?
- [x] «Источник» pages computed from the consumed KUs' `sources:` blocks?
- [x] No `verified: partial` KU in this cluster — all 7 are `verified: true`, so no exclusion applies?
- [x] No escalation ladder invented over the three inference schemes (the book only lists them)?
- [x] Seam KU `ai-apps-ch08-p193-ku25` used only for the between-call-state angle and handed to
      `aiagents-multi-agent-infrastructure`?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?

## Examples
- «У нас окно на 128k, а регламент — 400 страниц. Что класть в вызов?» → do the arithmetic first
  (~12 страниц на 4000 токенов, so 128k lands around a few hundred pages *before* the system prompt,
  history and tool results are counted), then apply relevance + compression: retrieve per step rather
  than attach the manual, and summarise the history into a compact representation.
- "We upgraded to a million-token model — can we finally delete the vector database?" → the book's
  own answer is the hybrid: you gain a simpler pipeline and a whole-document view, but you pay in
  compute, latency and cost, and correct retrieval of the single relevant fragment inside that window
  is not guaranteed. Keep selective retrieval nodes; the forecast that search becomes obsolete is
  labelled an expectation, not a measurement.
- «Агент теряет нить, когда пользователь возвращается с телефона» → client-side storage is the
  suspect: it is fast within one session but loses continuity on a device switch or re-login. Move
  long-term context to a server store bound to the account, keep the short-term part on the client —
  the hybrid — and decide by the journey, privacy requirements and desired personalisation.
- "Session state is in the web process's memory and we're scaling to millions of users" → it must
  move to a database or a distributed cache so it survives restarts, spreads load and supports
  several devices; signed-in users bind to the account, anonymous ones to a cookie or token session
  id. Which storage layer specifically → `aiagents-multi-agent-infrastructure`.
- «Модель путается на длинном контексте — поможет ли попросить её конспектировать?» → that is the
  note-taking scheme: notes over the parts of the context *before* the question is shown, then
  interleaved with the original context. The book claims good results on logical-processing and
  evaluation tasks but publishes no numbers and no implementation route — treat it as a candidate to
  measure, and read Lanchantin et al. (2023) for the experimental detail.
- «Что вообще относится к контекст-инжинирингу, а что к промпт-инжинирингу?» → prompts are the
  instructions; context engineering is the per-call assembly of user messages, retrieved knowledge,
  workflow state and system prompts into one token-optimised window, rebuilt at every inference step.
