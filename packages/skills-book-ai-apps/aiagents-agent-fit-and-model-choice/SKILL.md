---
name: aiagents-agent-fit-and-model-choice
description: >
  Decide whether this problem actually NEEDS an agent, and what foundation the agent stands on:
  the four-rung ladder простой код → детерминированный рабочий поток → чат-бот/RAG → автономный агент,
  the five-question gate that closes it, how to scope the FIRST agent's task boundaries (too narrow /
  too broad / too vague), and then model selection — the axes (size, modality, open vs proprietary,
  pretrained vs custom-trained), hybrid routing between a flagship and a light model, price per unit of
  benchmark performance, small models, the ~14 млрд-parameter consumer-GPU threshold, model choice as a
  security decision, and the agent-framework pick. LEVEL-OF-SOLUTION and MODEL/FRAMEWORK selection ONLY —
  NOT how many agents and how they coordinate (→ `aiagents-single-vs-multi-agent`), NOT provider-specific
  model ids, prices or API parameters (→ `claude-api`; this skill is vendor-neutral selection criteria),
  NOT clarifying a vague request before work starts (→ `explore`), NOT whether the agent needs a learning
  mechanism (→ `aiagents-learning-strategy`), NOT the security perimeter and guardrails themselves
  (→ `aiagents-agent-security`), NOT the interaction shape and modality of the resulting product — the
  surface the user meets, proactivity, discoverability, trust cues (→ `aiagents-agent-ux`), NOT
  organizational scope of authority, accountability and the compliance programme
  (→ `aiagents-org-adoption-and-governance`).
  Triggers (RU+EN): "нам вообще нужен агент или хватит скрипта", "workflow или автономный агент",
  "хватит ли RAG вместо агента", "как ограничить задачу первого агента", "какую модель взять под агента",
  "большая модель или малая", "сколько VRAM нужно чтобы поднять модель локально",
  "открытые веса или проприетарная модель", "маршрутизация запросов между дешёвой и дорогой моделью",
  "цена за единицу производительности модели", "какой агентный фреймворк выбрать",
  "do we actually need an agent here", "workflow engine vs LLM agent", "is RAG enough for this",
  "which foundation model should this agent run on", "small model vs frontier model for this task",
  "can we run this on one consumer GPU", "open-weights or a hosted API model", "route cheap vs expensive model".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-merged-ku06, ai-apps-ch01-p24-ku03, ai-apps-ch01-p24-ku06, ai-apps-ch01-p24-ku10, ai-apps-ch01-p24-ku12, ai-apps-ch02-p41-ku01, ai-apps-ch02-p41-ku05, ai-apps-ch02-p41-ku06, ai-apps-ch02-p41-ku07, ai-apps-ch02-p41-ku08, ai-apps-ch02-p41-ku12, ai-apps-ch07-p164-ku10, ai-apps-ch12-p310-ku05]
---

# Agent fit & model choice — earn the agent before you build it, then pick the cheapest model that clears the bar

## Output
Two linked recommendations that land in an ADR, a complexity-router step or an architecture review:

1. **Level of solution** — which rung of the ladder this problem belongs on (plain code / deterministic
   workflow / chatbot-RAG / autonomous agent), the five-question gate answered explicitly, and — if the
   answer is "agent" — the task boundary the first agent will own (its input, its output, its feedback loop).
2. **Foundation** — the model class chosen against the book's axes, with the operating constraints it
   commits you to (latency, cost per unit of benchmark performance, hardware, openness, compliance,
   security posture), whether you route between two models, and the agent framework (or no framework).

Both come with an explicit review trigger: model choice is treated as a decision you revisit, not a
one-off [p.49, p.316].

## When to use / NOT
- **Use when:** someone proposes "let's build an agent" and nobody has checked the cheaper rungs;
  choosing between a script, a workflow engine, a RAG bot and an agent; scoping the first agentic
  pilot and arguing about how much it should cover; picking the foundation model for a new agent;
  a flagship model's bill or latency became the blocker; deciding whether an open-weights model can
  run on the hardware you already own; deciding whether to route cheap and expensive requests to
  different models; a regulated or air-gapped deployment constrains which models are even eligible;
  choosing (or refusing) an agent framework.
- **NOT for:** deciding how many agents there are and how they coordinate — one agent vs a team,
  supervisor/worker schemes, hand-offs (→ `aiagents-single-vs-multi-agent`); provider-specific model
  ids, current prices, context limits and API parameters (→ `claude-api` — everything here is
  vendor-neutral selection criteria, and every number in the book carries a publication date);
  turning a vague human request into a specification before work starts (→ `explore`); designing the
  agent's tools and how it picks one (→ `aiagents-tool-design-and-selection`); deciding whether the
  system needs a learning mechanism at all and which one (→ `aiagents-learning-strategy`); the
  security perimeter, guardrails and injection defence around the chosen model
  (→ `aiagents-agent-security`; for non-agent systems → `security-audit`, `security-testing`,
  `pentest-validation`, `agentshield-scan`); the interaction design and modality of the product the
  user sees — surface, proactivity, discoverability, trust cues (→ `aiagents-agent-ux`); organizational
  scope of authority, accountability and the compliance programme
  (→ `aiagents-org-adoption-and-governance`).

## Decision criteria

### 1. The ladder — climb only as high as the problem forces you (KU: merged-ku06, ch01-p24-ku03)

The book frames this as one decision with four rungs, and says the choice separates a clean
implementation from an over-complicated system nobody can maintain [p.33]. Four factors drive it
[p.33]: how variable the input is; how hard the required reasoning is; performance or compliance
constraints; and the ongoing maintenance burden.

Rung 0, worth stating explicitly: for a great many practical cases a single call to an off-the-shelf
pretrained generative model may already be enough — no data collection, no training, no model
deployment of your own, where the old route was to hire ML/data-science staff and ship a bespoke
model [p.25].

| Rung | Take it when the book's conditions hold | What the book says it costs you |
|---|---|---|
| **1. Простой код**, no ML at all | Input is fully predictable and every outcome can be described in advance (the book's example: a fixed-format log line parsed by a small regex parser); millisecond latency is required (embedded systems, sensors) so an LLM API call cannot fit; or a heavily regulated field — medical equipment, aeronautics, some financial systems — needs deterministic auditable logic that a black box will not certify [p.33] | Nothing agent-shaped: no adaptivity at all [p.35] |
| **2. Детерминированный рабочий поток** | Logic fits a finite sequence of steps and branches, and you already know where a human intervenes and where errors are handled — the book's case is invoices arriving in three known formats (CSV / JSON / PDF), routed to parsers, halting for a human when fields disagree [p.33]. Retries with exponential backoff and pauses for manager approval are expressed better by a workflow engine (Airflow, AWS Step Functions, structured scripts) than by an LLM [p.33]. Justified when every branch can be enumerated up front and each needs a hard audit [p.34] | Limited adaptivity; the branch set is yours to maintain [p.35] |
| **3. Чат-бот / RAG** | The need is answers to questions over a knowledge base — manuals, a legal archive, a wiki: documents in a vector store, relevant fragments retrieved, an answer generated [p.34]. Maintenance is cheaper than an agent's: keep documents current, refine prompts [p.34] | The hard ceiling: a RAG system does not decide on follow-up actions of its own — raising a ticket, scheduling a call — it only retrieves [p.34] |
| **4. Автономный агент** | None of the three lower rungs reaches: the input cannot be described in advance, is unstructured and highly variable; **or** the plan has to be built over several steps and rebuilt from intermediate results (`multistep planning`); **or** the system must improve itself from incoming feedback (`continuous learning from feedback`) [p.34] | High latency, black-box behaviour that needs extra instrumentation, and heavy demands on cloud compute plus the engineering effort of monitoring, tuning and governing it [p.35] |

The book's own hedge on rung 1, kept verbatim because the strength of the claim matters: when those
conditions apply, plain code is «почти всегда лучше фундаментальной модели» [p.33] — almost always,
not always.

Restructured from табл. 1.2 [p.35] — the three rungs the table compares, on the properties it lists:

| Rung | What it demands of the input | Explainability | Latency | Adaptivity |
|---|---|---|---|---|
| Традиционный код | fully predictable schemas | full transparency, simple audit | ultra-low | none |
| Рабочий поток | mostly predictable, finite branches | explicit audit trail per branch | moderate | limited |
| Автономный агент | unstructured / not known in advance | black box, extra instrumentation needed | high | high, with learning from feedback |

Closing rule [p.35-36]: a fixed deterministic transformation → plain code; known branches with explicit
error checkpoints → a deterministic workflow; natural-language questions over a text corpus →
chatbot/RAG; high variability plus open-ended reasoning plus dynamic planning or continuous learning →
an autonomous agent.

Where the book's agent examples sit [p.34-35]: a support centre receiving free-form email — the agent
identifies intent, extracts entities, queries the knowledge base, drafts a reply, escalates to a human;
re-planning delivery schedules from real-time data; and parallel sub-tasks — a security agent
simultaneously polling threat APIs, scanning telemetry and analysing suspicious files in a sandbox.

### 2. The five-question gate — the last check before you commit to an agent (KU: merged-ku06)

The book puts a five-item checklist between you and the agent decision [p.35]. Answer each in writing;
a "no" on the top four is an argument for a lower rung.

```
[ ] 1. Ввод у вас неструктурированный или непредсказуемый?
[ ] 2. Нужно ли планирование в несколько шагов, которое перестраивается по промежуточным итогам?
[ ] 3. Хватит ли пользователям одной лишь выдачи документов — или система обязана сама решать и действовать?
[ ] 4. Требуется ли, чтобы система улучшалась сама, почти без участия людей?
[ ] 5. Готовы ли вы мириться с задержкой и стоимостью эксплуатации фундаментальной модели?
```

Question 3 is the RAG/agent separator; question 5 is the one teams skip and pay for later. Making this
choice deliberately is what keeps simplicity, performance and adaptability in proportion as requirements
evolve [p.36]. The book gives no numeric thresholds anywhere on this ladder — the criteria are
qualitative by design.

### 3. Scoping the FIRST agent's task boundaries (KU: ch02-p41-ku01)

Teams typically start not from a design document but from a fuzzy task and an API key [p.41]. The book's
discovery heuristic for an automation candidate: wherever staff «нажимают клавиши и щелкают на кнопки»
[p.41] following rules and instructions agreed in advance, a well-designed foundation-model system can
take the same work over — but only if you get the task boundary right [p.41].

Three ways the boundary fails [p.43]:

| Failure mode | The book's illustration | What breaks |
|---|---|---|
| **Слишком узко** | only order cancellations | other frequent requests — refunds, address changes — fall outside, so practical usefulness drops |
| **Слишком широко** | "automate every support contact" | buried in edge cases: billing disputes, product recommendations, technical diagnosis |
| **Слишком неопределённо** | "raise customer satisfaction" | there is no way to tell whether it succeeded |

What a good scope looks like, on the book's order-cancellation example: a process «достаточно узкий,
чтобы решение строилось быстро; достаточно ценный, поскольку экономит время сотрудников; и достаточно
содержательный для демонстрации разумного поведения» [p.41]. A clearly drawn workflow gives you three
concrete things [p.43]: a defined **input** (the customer's message together with the order record), a
defined **output** (tool calls and a confirmation), and a **short feedback loop**.

Use those three as the acceptance test for a proposed scope: if you cannot name the input record, the
output artifact and the loop that tells you it worked, the scope is still in failure mode 3.

### 4. Model choice — the axes, and the strong default at the start (KU: ch01-p24-ku06, ch02-p41-ku05)

**Default opening move** [p.29]: one of the most sensible starting options is the newest general-purpose
model from a leading vendor — strong out-of-the-box performance, minimal tuning. There is no single
right answer for every case [p.29].

**Why not to over-invest in the opening pick.** From табл. 1.1 (HELM ranking as of August 2025) [p.29-30]
the top of the leaderboard is nearly indistinguishable: `GPT-5 mini` leads on the mean at `0,819`, then
`o4-mini 0,812`, `o3 0,811`, `GPT-5 0,807`; the tail mixes proprietary and open models with a barely
visible gap — `Qwen3 235B A22B Instruct 2507 FP8` at `0,798`, `Grok 4 0,785`, `Claude 4 Opus 0,78`,
`gpt-oss-120b 0,77`, `Kimi K2 Instruct 0,768`, `Claude 4 Sonnet 0,766`. The spread across that top-10 is about 0,05 [extractor's
arithmetic on the table's own numbers], which is what backs the book's point that enormous effort spent
optimising the model choice buys a barely noticeable win [p.29].

**Four axes** — restructured from the model-selection section [p.45-47]. Each row lists the two poles the
book contrasts and the properties it attaches to each; the poles are alternatives to weigh, not a ranking:

| Ось | Один полюс | Другой полюс |
|---|---|---|
| **Размер / сложность задач** | Большие (GPT-5, Claude Opus 4.1): open-ended settings, shades of meaning, ambiguity, multi-phase logic; the price is significant compute, cloud infrastructure and high latency — the book reserves them for personal assistants, research agents and enterprise systems facing unpredictable requests [p.45] | Малые (advanced ModernBERT, Phi-4): well-defined repeating tasks; run on local hardware, answer fast, cheaper to deploy; strong in structured settings — support, information retrieval, data labelling; where resource or response-time limits bite, practicality can put them ahead of the large ones [p.45] |
| **Модальность** | Мультимодальные (GPT-5, Claude 4.1): interpret and combine text, video and speech; the book points at healthcare, robotics and customer support [p.46] | Чисто текстовые: less complexity and faster inference wherever the extra modalities add nothing [p.46] |
| **Открытость** | Открытые веса / открытый код (Llama, DeepSeek): full transparency, fine-tuning, private infrastructure, no licence fees; matters for confidentiality, compliance and narrow domains — at a higher engineering-labour cost [p.46] | Проприетарные (GPT-5, Claude, Cohere): powerful capability through an API, managed infrastructure, monitoring and optimisation, ideal for fast development — but limited customisation, and operating costs climb quickly [p.46] |
| **Обучение** | Предобученные общего назначения: natural-language tasks, quick prototypes, cases where domain precision is not critical; adapted by prompting with minimal effort [p.46] | Специально обученные (custom-trained): medicine, law, technical support — training on domain datasets yields more accurate and more trustworthy results [p.46] |

**Meta-rule** [p.49]: the model is not picked once and forever. It is a strategic decision you return to
as the agents themselves grow, as user demand shifts and as infrastructure is refreshed — weighing task
difficulty, the modalities the input arrives in, the operating constraints, and how much tuning will be
needed.

Two limits the book states about this whole section: in real deployments the decision often comes down
not to model quality but to budget and acceptable response time [p.46] (→ §5), and benchmark scores are
a useful signpost whose correspondence to *your* task is not guaranteed [p.48-49].

### 5. Cost per unit of performance, and routing between two models (KU: ch02-p41-ku08, ch02-p41-ku06)

**Why flagships are rented, not owned** [p.48]: getting acceptable throughput out of a flagship needs a
fleet of accelerators — the book's lower bound is around 12 GPUs, often materially more — so these models
live essentially in large data-centre racks. Hence the billing shape: you pay per input and output token,
and in exchange you stop caring about servers and accelerator utilisation.

Restructured from табл. 2.2 [p.48] so the price column comes before the score — first "what does it
cost", then "what do you get". The prices are **not absolute**: they are multiples of the cheapest listed
price at the time the book was prepared, Llama 3.1 from Meta at «0,20 доллара за 1 млн входных токенов
и 0,60 доллара за 1 млн выходных токенов» [p.48]. MMLU is the book's score column; the rows are listed
side by side, and no causal link between a vendor's price and its score is implied:

| Модель (владелец) | Цена вход (×) | Цена выход (×) | MMLU |
|---|---|---|---|
| DeepSeek-v3 (DeepSeek) | 2,75 | 3,65 | 87,2 |
| Claude 4 Opus Extended Thinking (Anthropic) | 75 | 125 | 86,5 |
| Gemini 2.5 Pro (Google) | 12,5 | 25 | 86,2 |
| Llama 3.1 Instruct Turbo 405B (Meta) | 1 | 1 | 84,5 |
| o4-mini (OpenAI) | 5,5 | 7,33 | 83,2 |
| Nova Pro (Amazon) | 4 | 5,33 | 82,0 |
| Mistral Large 2 (Mistral) | 10 | 10 | 80,0 |
| Grok 3 (xAI) | 15 | 25 | 79,9 |

Of the flagships listed, exactly two ship open weights: Llama 3.1 Instruct Turbo 405B and DeepSeek-v3 [p.48].

Three decision rules the book draws from that table [p.48-49]:
1. Performance has no direct correlation with price — «производительность не имеет прямой корреляции с ценой» [p.48].
2. Benchmark performance is a useful signpost, but its correspondence to your specific task is not guaranteed.
3. Wherever you can, compare candidate models **on your own task** and pick the one with the best price
   per unit of performance.

**Routing instead of choosing.** The quality of a flagship is paid for twice — in the inference bill and
in the wait for the answer; where that price hits a constraint, the sensible compromise is a smaller
model or a compressed version of the large one [p.46-47]. The **hybrid strategy**: the powerful model
handles the hardest requests, a lighter one takes the routine work [p.47]. The extension is **dynamic
routing**: every incoming request is first assessed, then sent to the model that matches its difficulty
and urgency, so the system gains on both cost and quality at once [p.47]. Note what the book does not
give you: the mechanics of the router/classifier itself are not described [extractor's note], and the
router is an additional component you now own.

The same routing idea appears at the top of the book as a rising industry trend — simple requests to
fast, cheap small models, complex reasoning to large ones — alongside three standing recommendations
[p.29]: start with the simplest thing that the scale allows; experiment with small models, fine-tuning
and added retrieval; and design for flexibility, because the future is almost certainly multi-model.

### 6. Small models and the hardware you already own (KU: ch02-p41-ku07, ch07-p164-ku10)

**The threshold — the number to remember.** Models of up to approximately **14 млрд параметров** can run
on a single consumer-class GPU, the book's example being an **NVIDIA RTX 3090 with 24 GB of VRAM** [p.47].
Hedges that travel with the number: the threshold is stated as approximate, and the book says outright
that it does not go deep into hardware selection [p.48]; small open-weights models keep advancing fast,
so specific figures date quickly [p.48, extractor's note].

> *A stronger claim about what is required **above** the threshold appeared in the source KU and was
> **excluded** here: the cross-model verification pass judged it more categorical than the cited page.
> Treat the rows below the line as the book's illustrative pairings, not as a hardware requirement rule.*

Restructured from табл. 2.1 [p.47] around the hardware column the table itself carries (MMLU is the
table's benchmark column; VRAM is per the source heading, for the model at full precision):

| Оборудование | Модель (владелец) | Параметры, млрд | MMLU | VRAM, ГБ |
|---|---|---|---|---|
| RTX 3090 | Llama 3.1 Instruct Turbo (Meta) | 8 | 56,1 | 20 |
| RTX 3090 | Gemma 2 (Google) | 9 | 72,1 | 22,5 |
| RTX 3090 | NeMo (Mistral) | 12 | 65,3 | 24 |
| A100 | Phi-3 (Microsoft) | 14,7 | 77,5 | 29,4 |
| A100 | Qwen1.5 (Alibaba) | 32 | 74,4 | 60,11 |
| 4×A100 | Llama 3 (Meta) | 70 | 79,3 | 160 |

Two conclusions the book draws from it [p.47]: as a rule the larger model scores higher, but the rule
does not always hold — individual models perform better than their size suggests; and high performance
demands substantially more compute, while moderate performance is available for a fraction of the cost.
The score column is MMLU (Massive Multitask Language Understanding), a conventional measure of breadth —
not an ideal yardstick, but a common scale on which models are comparable at all; independent
measurement across a broad model set comes from HELM (Holistic Evaluation of Language Models), released
by Stanford's Center for Research on Foundation Models [p.47]. «Моделями с открытыми весами» are those
whose architecture and weights are published, so anyone with suitable hardware downloads them free and
runs inference locally [p.47-48].

**When a small model is the right answer** — гл. 7 gives eight grounds [p.180-182]. Small models carry
moderate cost, fewer parameters and simpler architectures, and fine-tuned to a specific task they can be
unexpectedly effective; the simplicity speeds adaptation and lets you sweep training configurations
quickly [p.180]:

| Ground | What the book attaches to it |
|---|---|
| Limited compute or critical response time | [p.180] |
| Explainability is required | Fewer layers and parameters make the decision process easier to analyse; valued in finance, healthcare and law where stakeholders need to understand how and why a decision was made — the book's example is a small model classifying medical images, easier to debug and validate [p.180] |
| Agile development | Fast tuning iterations; continuous or incremental learning tasks with frequently refreshed data [p.180-181] |
| Real-time deployment | Embedded devices, mobile applications, IoT networks where low latency matters [p.181] |
| Availability and budget | Many strong small models are open and freely available (Llama and Phi are named) and can be modified for your scenarios [p.181] |
| Environmental budget | Noticeably less energy for training and inference — a contribution to green-AI strategies [p.181] |
| Fast-moving data landscape | Social-media sentiment, real-time fraud detection, personalised recommendations — cheap frequent retraining [p.181-182] |
| Privacy requirements | Suitability for federated learning and tuning on edge devices [p.182] |

**Quality ceiling** [p.181]: on narrow, well-bounded tasks a small model can match or even beat a large
one, because its whole capacity concentrates on the relevant aspects — especially valuable with high
accuracy requirements and limited data, without the overfitting risk.

**Size bands** [p.182-183], weighing latency, hardware, budget and task requirements:

```
< 8 млрд параметров   → indispensable for on-device and low-cost inference
8–70 млрд             → the "золотая середина" for general reasoning
above that band       → accuracy in high-stakes scenarios still sits with the proprietary giants (GPT-5 named)
```

**Keep the decision fresh** [p.182]: Stanford HELM (current MMLU, GPQA, IFEval), Papers With Code
(benchmark aggregation and downloadable data — the editor's footnote records that this site closed in
favour of Trending Papers on Hugging Face [p.182]), Hugging Face's Evaluation on the Hub (an API with
updated results for tasks such as GSM8K and HumanEval), and the BigBench Leaderboard (the BBH family).
The author's own warning: today's best small models may fall behind within months, and by the time you
read the chapter a new champion has probably arrived [p.182-183]; and as parameter count drops, the
spread of scores widens [p.182].

### 7. Model choice as a security decision (KU: ch12-p310-ku05)

The security foundation of an agentic system is laid at model-selection time: models differ in strengths,
limitations and risk profiles [p.315]. The book lists six evaluation axes [p.315-316]; four of them are
carried here in full, and two are reduced because the verification pass rejected the unconditional form
of their claims (see the note below).

| Ось | What the book puts on each side |
|---|---|
| **1. Соответствие задачам** | A powerful general-purpose model is flexible, but its complexity raises the risk of an unpredictable result [p.315] |
| **2. Контроль доступа и открытость** | Open source gives transparency and independent audit, but usually arrives without built-in protection and may need substantial hardening at deployment; a proprietary model brings built-in protection and support, but can operate as a black box, limiting visibility into its internal decision-making [p.315] |
| **3. Среда развёртывания** | For especially sensitive applications, on-premises or air-gapped options are preferred — they remove external-dependency and cloud-vulnerability risk; the cloud gives scalability and easy maintenance at the price of strict access control and encryption in transit and at rest [p.315] |
| **4. Комплаенс** | Some scenarios require conformance to standards — GDPR for personal data, SOC 2 for operational security; a model that already conforms lowers downstream risk and compliance load [p.315-316] |
| **5. Объяснимость и интерпретируемость** | Listed by the book as an evaluation axis [p.316]; the KU's causal formulation was excluded — see note |
| **6. Гибридность** | In practice one model is rarely used: specialised small models on critical tasks that need precision, large general ones where creativity and contextual flexibility are needed [p.316] |

Decision mode: this is a continuous process, not a one-off pick — as models evolve and new
vulnerabilities appear, the choice is revisited to stay aligned with operating goals and the current
threat picture [p.316]. The book supplies neither weights for the axes nor thresholds; it is a
qualitative comparison frame [p.315-316].

> *Excluded from axes 1 and 5: the verification pass found the source KU stated unconditionally what the
> book states with hedging. Those two claims are omitted rather than reworded. The perimeter itself —
> guardrails, injection defence, monitoring of the deployed model — belongs to `aiagents-agent-security`;
> decide the model here, defend it there.*

### 8. Agent framework (or none) (KU: ch01-p24-ku12)

Restructured from the frameworks section [p.38-40] around the dominant need. Rows are the book's own
per-framework descriptions; nothing is implied about frameworks it does not list — the list is
explicitly incomplete [p.38]:

| If the dominant need is… | The book points at | What the book names as the cost |
|---|---|---|
| Explicit, controlled flow management in reliable single-agent or simple multi-agent systems | **LangGraph** — directed graphs (nodes as units of logic, often model calls; edges as data flows), cyclic flows, async and retries built in [p.38] | Your own logic for non-trivial planning and memory; low built-in multi-agent support [p.38] |
| Dialogue between agents (supervisor/worker, self-reflection loops) | **AutoGen** — multi-agent orchestration, dynamic roles, message-based interaction [p.39] | Heavyweight even for simple scenarios; a limited choice of interaction schemes [p.39] |
| Speed of starting: practical human-facing agents (assistants, support) | **CrewAI** — easy to learn, fast prototypes, "crew"/"task" abstractions [p.39] | Orchestration internals barely tunable; on complex flows LangGraph and AutoGen look more mature [p.39] |
| Already on the OpenAI API, want safe tool agents with minimal scaffolding | **OpenAI Agents SDK** — deep integration with the OpenAI ecosystem, safe function calling, memory primitives [p.39-40] | Tight coupling to OpenAI infrastructure; less flexibility and portability for non-standard stacks [p.40] |

Selection rules [p.40]: early prototypes → CrewAI or OpenAI Agents SDK; scalable systems for real
operation → LangGraph or AutoGen. **A framework is not mandatory** — many teams build directly on the
model provider's API [p.40]. The maturity judgements are as of the book's writing, and the author
expects competition in this segment to keep reshuffling the field [p.40].

### 9. What the choice commits you to (KU: ch01-p24-ku10, ch02-p41-ku12)

Once "agent" is the answer, five properties become design obligations. The book pairs each with the
failure it predicts when the property is missing [p.36-37]:

| Property | The failure the book pairs with it |
|---|---|
| **Масштабируемость** — distributed architectures, cloud infrastructure, parallel algorithms | An agent sized for 10 requests/min hangs or crashes on a spike to 1000 without automatic scaling [p.36] |
| **Модульность** — independent interchangeable components behind clear interfaces | Tools hard-coded into the agent service force a full redeploy for every small tool change [p.36] |
| **Непрерывное обучение** — learning from experience (in-context learning), user-feedback integration, performance tracking | Ignoring feedback loops repeats the same mistakes — misclassifying contract terms, failing to escalate critical issues [p.36] |
| **Эластичность** — error handling, strict security measures, redundancy against failures, threats and timeouts | With no retry logic and no fallback, one API failure takes the agent out entirely and the user waits with no explanation [p.36-37] |
| **Защита от устаревания** — open standards, scalable infrastructure, a culture of fast adaptation | Hard coupling to one vendor's proprietary prompt format makes swapping models and experimenting difficult [p.37] |

(Source note carried from the KU: the introductory list names the fourth principle «гибкость» while the
list item itself is headed «Эластичность» — a naming inconsistency in the translation [p.36].)

And three of the four system-level trade-offs гл. 2 poses [p.52-56] — the ones whose claims survived
verification intact:

- **Скорость ↔ доля верных результатов.** The book sorts domains by which side wins: latency-driven —
  autonomous vehicles, trading, where milliseconds carry serious consequences [p.53]; accuracy-driven —
  legal analysis, medical diagnostics, where speed may be sacrificed [p.53]. Hybrid shape: a fast
  approximate answer first, refined by a detailed continuation — typical of recommender systems and
  diagnostics [p.53].
- **Надёжность ↔ сложность / время.** Reliability is the ability to perform tasks consistently and
  accurately under both expected and unexpected conditions [p.55]. Components: fault tolerance
  (detecting network outages and hardware failures, recovering correctly; redundancy by duplicating
  critical components) and consistency across scenarios, critical for safety domains such as autonomous
  vehicles and medical agents — the system has to hold up not only on hothouse scenarios but on edge
  cases, under stress load and under real constraints [p.55]. Key requirements: extensive testing (unit
  and integration tests, simulation of real scenarios, edge cases, unexpected input) and continuous
  monitoring with feedback loops [p.55]. The price: more system complexity, more cost, longer
  development [p.55].
- **Затраты ↔ ценность.** Development costs: advanced ML models, large datasets, a team with specialised
  skills (data science, ML engineers, domain experts), test infrastructure [p.56]. Operating costs:
  expensive hardware (GPUs) or cloud, storage and bandwidth, regular maintenance [p.56]. Prioritisation
  rule: cheaper simple agents for less critical tasks, freeing resources for complex agents in important
  applications — and every such decision is made with an eye on what the system is achieving overall and
  how long it has to live [p.56].

> *The scalability trade-off (the section's second) rested on a claim about GPU resources that the
> verification pass judged stronger than the book's wording; it is omitted here rather than reworded.
> Same for the causal form of the speed/accuracy claim — the axis and its domain guidance are kept, the
> unconditional cause-and-effect statement is not.*

## Key facts & formulas
- Four ladder factors: input variability, reasoning complexity, performance/compliance constraints, ongoing maintenance burden [p.33].
- Rung 1 verdict when its conditions hold: plain code is «почти всегда лучше фундаментальной модели» [p.33].
- RAG's hard ceiling: it retrieves, it does not decide on follow-up actions such as raising a ticket or scheduling a call [p.34].
- Agent triggers: unstructured/unpredictable input, `multistep planning` rebuilt from intermediate results, or `continuous learning from feedback` [p.34].
- Five-question gate before committing to an agent [p.35].
- Three scope failure modes: too narrow, too broad, too vague [p.43]; a good scope yields a defined input, a defined output and a short feedback loop [p.43].
- HELM ranking, August 2025 (табл. 1.1) [p.29-30]: `GPT-5 mini 0,819`; `o4-mini 0,812`; `o3 0,811`; `GPT-5 0,807`; `Qwen3 235B A22B Instruct 2507 FP8` at `0,798`; `Grok 4 0,785`; `Claude 4 Opus 0,78`; `gpt-oss-120b 0,77`; `Kimi K2 Instruct 0,768`; `Claude 4 Sonnet 0,766`. Top-10 spread ≈ 0,05 [extractor's arithmetic].
- Source note: the табл. 1.1 heading carries typos — «HELM Core Scenarion» and a merged «иand Omni-MATH» [p.30].
- Consumer-GPU threshold: up to approximately **14 млрд параметров** on one consumer GPU, e.g. NVIDIA RTX 3090 with **24 GB VRAM** [p.47]. The book states it does not go deep into hardware selection [p.48].
- Табл. 2.1 rows (parameters / MMLU / VRAM at full precision) [p.47]: Llama 3.1 Instruct Turbo 8 / 56,1 / 20; Gemma 2 9 / 72,1 / 22,5; NeMo 12 / 65,3 / 24; Phi-3 14,7 / 77,5 / 29,4; Qwen1.5 32 / 74,4 / 60,11; Llama 3 70 / 79,3 / 160.
- Flagship hosting floor: roughly **12 GPUs** at the low end, often materially more — hence per-token billing [p.48].
- Табл. 2.2 price base: Llama 3.1 at «0,20 доллара за 1 млн входных токенов и 0,60 доллара за 1 млн выходных токенов» [p.48]; all other prices in that table are multiples of it.
- Price/performance rule: «производительность не имеет прямой корреляции с ценой» [p.48]; compare on your own task and find the best price per unit of performance [p.49].
- Model size bands [p.182-183]: < 8 млрд — on-device and cheap inference; 8–70 млрд — the sweet spot for general reasoning; above — high-stakes accuracy still with the proprietary giants.
- Benchmark trackers to keep the choice fresh [p.182]: Stanford HELM, Papers With Code (closed in favour of Trending Papers on Hugging Face), Evaluation on the Hub, BigBench Leaderboard.
- Six security axes for model choice [p.315-316]; GDPR and SOC 2 are the standards named [p.315-316].
- Five properties of an effective agentic system, each with its failure mode [p.36-37].
- Framework selection rules: prototypes → CrewAI / OpenAI Agents SDK; production scale → LangGraph / AutoGen; a framework is optional [p.40].
- Source notes on табл. 2.2 [p.48]: a column-heading typo («1 лн входных токенов»), and the page is flagged as possible two-column layout, so the row-to-value mapping deserves a check against the original.

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Reaching for an agent because agents are interesting, without walking the four rungs | The book frames this exact choice as the difference between a clean implementation and an unmaintainable mess | merged-ku06 |
| An LLM call inside a millisecond-latency path (embedded, sensors) | The API call cannot fit the latency budget; that is a rung-1 condition | merged-ku06 |
| A black-box model in a heavily regulated domain that demands auditable logic | It will not pass certification — medical equipment, aeronautics, some financial systems | merged-ku06 |
| Expressing retries with backoff and manager-approval pauses as agent reasoning | A workflow engine (Airflow, Step Functions, structured scripts) expresses them better | merged-ku06 |
| Promising that a RAG bot will "also raise the ticket" | RAG systems retrieve; they do not decide on follow-up actions | merged-ku06 |
| Skipping the fifth gate question (latency and running cost) | The two costs that sink agent projects are the ones nobody wrote down | merged-ku06 |
| Building an ML pipeline of your own before trying one call to a pretrained model | For many practical cases one off-the-shelf call may be enough, at a fraction of the cost and complexity | ch01-p24-ku03 |
| Scoping the first agent as "automate every support contact" | Drowns in edge cases — billing disputes, product recommendations, technical diagnosis | ch02-p41-ku01 |
| Scoping it as "raise customer satisfaction" | There is no way to know whether it succeeded | ch02-p41-ku01 |
| Scoping it to a single narrow action while neighbouring frequent requests stay manual | Practical usefulness drops | ch02-p41-ku01 |
| Spending weeks optimising the opening model choice | The leaderboard's top is nearly indistinguishable; the effort buys a barely noticeable win | ch01-p24-ku06 |
| Reading a benchmark score as a guarantee for your task | Correspondence between benchmarks and your specific task is not guaranteed | ch02-p41-ku08 |
| Assuming the pricier model is the stronger one | Performance has no direct correlation with price | ch02-p41-ku08 |
| Paying flagship rates for routine requests | The hybrid/dynamic-routing shape exists precisely to keep the flagship for the hard ones | ch02-p41-ku06 |
| Treating model choice as a one-off decision | It is strategic and revisited as agents, user needs and infrastructure evolve — and, on the security side, as new vulnerabilities appear | ch02-p41-ku05, ch12-p310-ku05 |
| Quoting the book's leaderboard, price and small-model figures as current | The ranking is dated August 2025, prices are as of the book's preparation, and the author warns the best small models may fall behind within months | ch01-p24-ku06, ch02-p41-ku08, ch07-p164-ku10 |
| Planning a local open-weights deployment without checking parameter count against VRAM | The size/VRAM pairing is what decides whether the hardware you own is enough | ch02-p41-ku07 |
| Picking an open-source model and assuming security comes with it | Open source usually arrives without built-in protection and may need substantial hardening at deployment | ch12-p310-ku05 |
| Choosing a cloud-hosted model for an especially sensitive application by default | On-premises or air-gapped options are the ones that remove external-dependency and cloud-vulnerability risk | ch12-p310-ku05 |
| Hard-coding one vendor's proprietary prompt format | Makes swapping models and experimenting difficult — the future-proofing failure mode | ch01-p24-ku10 |
| Hard-coding tools into the agent service | Every small tool change forces a full redeploy — the modularity failure mode | ch01-p24-ku10 |
| Shipping without retry logic or a fallback path | One API failure takes the whole agent down and the user waits with no explanation | ch01-p24-ku10 |
| Reaching for AutoGen for a simple scenario | The book calls it heavyweight even for simple cases | ch01-p24-ku12 |
| Adopting a framework reflexively | Many teams build directly on the model provider's API | ch01-p24-ku12 |
| Validating the agent only on hothouse scenarios | Reliability has to hold on edge cases, under stress load and under real constraints | ch02-p41-ku12 |

## Related decisions
- **`aiagents-single-vs-multi-agent`** — this skill stops at "an agent, with this task boundary". How many
  agents there are and how they coordinate is decided there. Note the coupling: a scope you widen here
  (failure mode 2 territory) is exactly what pushes that skill toward a team, and LangGraph is described
  as having low built-in multi-agent support [p.38] — so a framework picked here constrains the answer there.
- **`aiagents-tool-design-and-selection`** — the modularity principle [p.36] says tools must be
  interchangeable behind clear interfaces rather than hard-coded into the agent service; that skill owns
  the tool contract. Choosing a small local model here narrows what tool-calling behaviour you can rely on.
- **`aiagents-knowledge-and-memory`** — rung 3 of the ladder (documents in a vector store, fragments
  retrieved, answer generated [p.34]) is the RAG machinery that skill owns. If the gate's question 3
  answers "retrieval is enough", the work moves there and stops.
- **`aiagents-learning-strategy`** — `continuous learning from feedback` is one of the three triggers that
  promote a problem to rung 4 [p.34], and гл. 7's small-model case is built around cheap frequent
  retraining and fine-tuning [p.180-182]. Decide *whether an agent* here; decide *which learning mechanism*
  there. Choosing a small model here is what makes frequent retraining affordable there.
- **`aiagents-evaluation-design`** — the book's own instruction is to compare candidate models on your own
  task rather than on the leaderboard [p.49]; that comparison is an evaluation harness, and it is that
  skill's job to design it. Without it, rule 3 of §5 is unexecutable.
- **`aiagents-observability-and-drift`** — an agent is described as a black box needing extra
  instrumentation [p.35], and reliability requires continuous monitoring with feedback loops [p.55]. The
  monitoring bill is part of what you accepted at gate question 5.
- **`aiagents-agent-security`** — §7 (model choice as a security decision) is *shared* with that skill.
  Pick the model, the deployment environment and the compliance posture **here**; the perimeter,
  guardrails and threat response are decided **there**. An open-weights choice made here hands that skill
  a hardening job [p.315].
- **`claude-api`** — once the criteria here select a class of model, provider-specific ids, current
  pricing, context windows and API parameters come from there, not from the book's dated tables.
- **`explore`** — if the *request* is vague rather than the *scope*, clarify it there first; failure mode 3
  ("raise customer satisfaction") is often an un-explored request wearing a scope's clothes.
- **`aiagents-agent-ux`** — the modality axis [p.46] decides what the model can *consume*; what the user
  actually sees and how they interact with it is decided there. Coupling: a text-only pick here takes
  voice and video off that skill's modality menu, and the latency the rung-4 choice accepted [p.35, p.45]
  is what decides whether a synchronous conversational surface is even feasible there.
- **`aiagents-org-adoption-and-governance`** — §9's cost-versus-value rule [p.56] and §7's compliance axis
  (GDPR, SOC 2 [p.315-316]) are the model-side half of a governance programme that skill owns. Coupling:
  a proprietary hosted model chosen here sends organisational data outside the perimeter, which is what
  that skill's data-sensitivity controls and audit duties must then account for; the on-premises or
  air-gapped option [p.315] relaxes them.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 1, с. 25, 29–30, 33–40; глава 2, с. 41–49, 52–56; глава 7, с. 180–183; глава 12, с. 315–316.
KUs: ai-apps-merged-ku06, ai-apps-ch01-p24-ku03, ai-apps-ch01-p24-ku06, ai-apps-ch01-p24-ku10,
ai-apps-ch01-p24-ku12, ai-apps-ch02-p41-ku01, ai-apps-ch02-p41-ku05, ai-apps-ch02-p41-ku06,
ai-apps-ch02-p41-ku07, ai-apps-ch02-p41-ku08, ai-apps-ch02-p41-ku12, ai-apps-ch07-p164-ku10,
ai-apps-ch12-p310-ku05. Deep reference: `references/knowledge-units.md`.
- Ladder anchor: when the rung-1 conditions hold, plain code is «почти всегда лучше фундаментальной модели» [p.33].
- Price anchor: «производительность не имеет прямой корреляции с ценой» [p.48].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] All five `verified: partial` KUs' flagged over-claims excluded, and the exclusions marked in place?
- [x] Boundary clause routes UX/modality to `aiagents-agent-ux` and organisational authority to
      `aiagents-org-adoption-and-governance` instead of absorbing them?

## Examples
- «Нам нужен агент для разбора входящих счетов от пяти поставщиков?» → probably not: three known formats
  routed to parsers with a human halt on inconsistent fields is rung 2, the deterministic workflow, and
  the book puts retries-with-backoff and approval pauses on a workflow engine rather than an LLM. Run the
  five-question gate before escalating.
- "Users ask questions over our internal wiki — agent or RAG?" → gate question 3 decides it: if answers
  are enough, rung 3 (RAG) is cheaper to maintain; the moment the system must raise the ticket or book
  the call itself, RAG's ceiling is reached and you are on rung 4.
- «Какую модель взять под агента поддержки?» → start with the newest general-purpose model from a leading
  vendor (the top of the HELM table is nearly indistinguishable, ≈0,05 across the top-10), then compare
  candidates on your own task and take the best price per unit of performance; keep a light model for
  routine traffic and route the hard requests to the flagship.
- "Can we self-host this on the GPU we already have?" → up to roughly 14 млрд параметров runs on one
  consumer card such as an RTX 3090 with 24 GB VRAM [p.47]; check your candidate's parameter count and
  full-precision VRAM against табл. 2.1, and note the book explicitly does not go deep into hardware choice.
- «Регулятор требует хранить данные внутри контура — что это значит для выбора модели?» → the deployment
  axis of the security frame: on-premises or air-gapped options remove external-dependency and cloud
  vulnerability risk, cloud buys scalability at the price of strict access control and encryption; a model
  already conforming to GDPR/SOC 2 lowers the downstream compliance load. The perimeter itself goes to
  `aiagents-agent-security`.
- "Which agent framework?" → early prototype → CrewAI or OpenAI Agents SDK; a system meant for real
  operation → LangGraph (explicit flow control) or AutoGen (agent-to-agent dialogue) — and a framework is
  optional, many teams build straight on the provider's API.
