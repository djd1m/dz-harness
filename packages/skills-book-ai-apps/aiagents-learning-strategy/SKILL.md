---
name: aiagents-learning-strategy
description: >
  Decide whether an agent needs a LEARNING mechanism at all and of which CLASS: non-parametric
  (exemplar few-shot, reflection loops, ExpeL insight lists — weights untouched) vs parametric
  fine-tuning (SFT, DPO, RFT, RLVR, LoRA) with its real bill; plus WHERE a proven improvement is
  durably anchored — prompt, memory/insight list, or weights (in-context vs offline retraining).
  The learning-CLASS and anchoring decision ONLY — NOT the human team's post-release improvement cycle
  over a detected failure: problem detection, RCA, prompt refinement, automated prompt optimization
  (DSPy / Microsoft Trace), tool-level fixes, insight backlog triage and prioritisation
  (→ aiagents-improvement-loops — that skill owns what a TEAM changes after a failure, this one owns the
  AGENT improving itself), NOT designing the knowledge/memory store itself (→ aiagents-knowledge-and-memory),
  NOT measuring whether the learning worked (→ aiagents-evaluation-design), NOT model size / cost
  per unit of quality (→ aiagents-agent-fit-and-model-choice), NOT the harness-local agent loops
  `qe-learning-optimization`, `reflection-loop`, `continuous-agent-loop`.
  Triggers (RU+EN): "нужно ли агенту обучение", "тонкая настройка или промпт-инжиниринг",
  "стоит ли файнтюнить модель под агента", "SFT или DPO", "непараметрическое обучение агента",
  "рефлексия агента после неудачи", "агент повторяет одну и ту же ошибку",
  "should I fine-tune or stay with prompting", "self-reflection loop for a failing agent",
  "learn across tasks, not just retry", "where should this fix live — prompt or weights",
  "fine-tune function calling", "preference pairs chosen/rejected", "LoRA adapter for an agent".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch07-p164-ku01, ai-apps-ch07-p164-ku02, ai-apps-ch07-p164-ku03, ai-apps-ch07-p164-ku04, ai-apps-ch07-p164-ku05, ai-apps-ch07-p164-ku06, ai-apps-ch07-p164-ku08, ai-apps-ch07-p164-ku11, ai-apps-ch07-p164-ku12, ai-apps-ch07-p164-ku13, ai-apps-ch07-p164-ku14, ai-apps-ch07-p164-ku16, ai-apps-merged-ku05, ai-apps-ch11-p280-ku18, ai-apps-ch11-p280-ku19]
---

# Learning strategy — does this agent learn at all, and does the improvement land in the prompt, in memory, or in the weights

## Output
A learning-strategy recommendation for the ADR / architecture step: (a) learning yes/no, (b) the
class — non-parametric or parametric, (c) the concrete mechanism (exemplars, reflection, ExpeL,
SFT, DPO, RFT/RLVR), (d) the anchoring layer for every improvement that proves out (session prompt →
promoted to prompt engineering / workflow update / retraining), and (e) the cost + stop-signals that
justify or veto the parametric step, each backed by гл. 7 / гл. 11 facts.

## When to use / NOT
- Use when: the agent repeats the same failure and someone proposes «давайте зафайнтюним»; you must
  size the cost of fine-tuning a large foundation model before committing budget; you are choosing
  between few-shot exemplars, a reflection loop and cross-task insight learning; tool calls are
  systematically malformed and you are weighing SFT against runtime schema checks; you need
  preference-shaped output quality (tone, style, summarization) and are looking at DPO; a validated
  improvement is living only inside one session and you need to decide where it should permanently live.
- NOT for: running the improvement loop as an operational process — problem detection, RCA, prompt
  refinement, automated prompt optimization (DSPy / Microsoft Trace), tool-level fixes, prioritizing an
  insight backlog (→ `aiagents-improvement-loops` — that skill owns what a human team does with a
  detected failure; this one owns the agent improving itself); designing the knowledge base / memory
  store the learned material sits in
  (→ `aiagents-knowledge-and-memory`); proving that the learning actually improved anything
  (→ `aiagents-evaluation-design`); watching a deployed agent for drift (→ `aiagents-observability-and-drift`);
  choosing model size / cost per unit of quality (→ `aiagents-agent-fit-and-model-choice`).
  Also NOT the harness-local loops `qe-learning-optimization`, `reflection-loop`,
  `continuous-agent-loop` — those are runtime agent loops in this workspace, not this book's
  learning-class decision.

## Decision criteria

### 1. Does this agent need learning at all? (KU: ch07-ku01, merged-ku05)
The book's working definition: learning is raising the agent system's performance through interaction
with its environment — adaptation to changing conditions, sharper strategies, better overall
effectiveness [p.164]. It is explicitly **optional design**: it adds a whole separate stream of work —
design, evaluation, monitoring — that a given application may never earn back [p.164].

Decide in this order:

| Step | Question | If yes | If no |
|---|---|---|---|
| 1 | Is there a repeated, observable failure the agent could learn from? | continue | no learning mechanism — this is a legitimate outcome [p.164] |
| 2 | Can prompt engineering + built-in capabilities already close it? | stop here [p.178] | continue |
| 3 | Is the non-parametric ladder (§3) enough? | stay non-parametric [p.175] | evaluate the parametric case (§6) |

The class fork itself [p.164]:
- **Non-parametric** — automatic performance improvement **without** touching the parameters of the
  model in play.
- **Parametric** — deliberate training or fine-tuning of the foundation model's parameters.

Closing frame of the chapter [p.192]: non-parametric wins on simplicity, speed and responsiveness in
live conditions; parametric buys deeper specialization (SFT for structured output and function
calling, DPO for output quality judged against human preference). They are complementary, not
mutually exclusive.

### 2. Default order: non-parametric first (KU: ch07-ku01, merged-ku05)
The chapter's own sequence is non-parametric → parametric (SFT, DPO) → weight adaptation for targeted
improvements [p.164]. The stated reason to begin non-parametric: those approaches are simpler and
faster to implement [p.175].

**The abstention rule.** The book's advice is blunt — «Если у вас возникают сомнения, не применяйте
тонкую настройку» [p.178], because a cheaper and more effective product improvement is usually
available [p.178]. The counterweight the book keeps: fine-tuning stays genuinely necessary where the
model's internal representations must be bound tightly to the real context of a critical application [p.178].

### 3. The non-parametric ladder (KU: ch07-ku02, ch07-ku03, ch07-ku05)
Three rungs, in ascending cost and ascending reach. Each row's "escalate when" is the book's own
stated trigger for moving up.

| Rung | Mechanism | What it buys | Escalate up when |
|---|---|---|---|
| **1. Exemplar learning** | Task outcome produces a quality metric; the resulting examples feed few-shot learning in context [p.164]. Fixed variant: a small set hard-coded in the system prompt [p.164]. Dynamic variant: the most relevant examples pulled at runtime from a vector database of examples [p.165] | Cheapest, most transparent, lightweight way to lift the agent on specific tasks — whole task or independently per sub-task [p.166] | Adding more examples to the prompt starts costing money and latency, and an example useful for one input is useless for another [p.165] |
| **2. Reflection** | After a failed attempt the agent writes a short natural-language critique of what went wrong and how to do better; it is stored in a memory buffer next to past actions/observations and re-read before the next attempt [p.166] | Improvement on repeatable tasks with minimal extra effort; the foundation model acts as its own mentor, weights unchanged; both numeric feedback (a success flag) and free-form comments work [p.166] | You need what was learned to transfer **between different tasks**, not just to the next retry of the same one [p.170-171] |
| **3. ExpeL / experiential learning** | Adds a generalization stage on top of stored experience: insights are distilled from the experience pool to improve the agent's future policy [p.170], with the biggest value in mining past failures for tactics that will work in similar future situations [p.170] | Cross-task learning and gradual adaptation to non-stationary environments; called practical, cheap and simple to implement [p.174-175]; works even with few training examples [p.172] | Enough training data points have accumulated that the book points you at fine-tuning [p.175, p.176] |

Fixed → dynamic exemplars, in mechanism terms [p.165]: every interaction stores context, actions
taken, results, and any feedback received; for a new task the agent retrieves similar past cases —
each described as task, applied solution, outcome — parses the solutions and adapts them. At volume,
select the most relevant and successful ones by type using text or semantic search [p.166].

### 4. Assembling a reflection loop (KU: ch07-ku03, ch07-ku04)
Five stages [p.166]: **run** (act on the ordinary planning prompt) → **log** (every step — actions,
observations, success/failure — into durable storage, a JSON file or a DB table) → **generate** (on
failure, assemble a short reflection prompt from recent history plus a templated question about the
missed strategy; the LLM returns a compact plan) → **update memory** (a helper reads past run logs,
asks the LLM for the reflection, appends the fresh analysis to agent memory) → **inject** (on the next
attempt at the same or a similar task, the newest analysis is attached to the prompt).

Prompt anatomy — three parts plus a closing token [p.169]:
- [ ] **Control instruction** — state that the attempt failed, demand analysis of *strategic* defects
      rather than a description of the environment, and require the plan after the word `Plan`.
- [ ] **Goal restatement** — repeat the original task after the `Instruction:` marker.
- [ ] **Failure transcript** — the full Action/Observation log of the failed run: each search, choice
      and piece of reasoning; the last line is `STATUS: FAIL`, so the model gets concrete evidence of
      where it broke.
- [ ] **Trailing `Plan:`** — flips the model from diagnosis to prescription and keeps the answer terse
      and parseable.

Wiring checklist [p.169-170]:
- [ ] Isolate each LLM call behind a thin `call_model(state)` wrapper so graph nodes stay single-purpose
      and reusable [p.170].
- [ ] Write the full transcript of every trial to disk; after a failure call `update_memory(...)`, which
      reads the logs and appends the new self-critique to the memory list [p.170].
- [ ] Cap the injected history — the example carries at most the three most recent stored analyses [p.169].
- [ ] Skip reflection for successful runs and for environment configurations explicitly marked
      skippable [p.169].
- [ ] Attach one reflection node to `START` in the StateGraph — then every run automatically executes
      the prompt and extends the state with a fresh plan [p.170].

Scope check: the core of the example fits in fewer than 20 lines of code [p.170].

### 5. Keeping the learned-rule list from rotting (KU: ch07-ku05, ch07-ku06)
ExpeL keeps a **live** insight list mined from the experience store and edits it dynamically —
promoting the most valuable, demoting the least useful, revising conclusions as new experience
arrives [p.170]. The pipeline: accumulate observations and outcomes in the experience pool [p.171] →
have the foundation model reflect on environment observations to surface performance-raising
information [p.171] → run multiple model evaluations, extracting insights from **pairs** of successful
and unsuccessful examples [p.173] → merge and filter into a short set of high-level, general rules
whose importance rises and falls over time [p.173] → steer future decisions with that small set [p.173].

Four maintenance operations with explicit firing conditions [p.172-173]:

| Operation | Fires when |
|---|---|
| `AGREE` | the existing rule's relevance to the task is high — confirm it |
| `REMOVE` | the rule contradicts other rules, or duplicates them / is very close to them |
| `EDIT` | the wording is insufficiently general in nature, or otherwise improvable |
| `ADD` | a genuinely new rule, distinct from existing ones and relevant to other tasks |

Formatting discipline [p.172-173] — each operation must strictly follow its format, and silence about
a rule means it carries over unchanged: «все существующие правила, которые не изменены, не подтверждены
и не удалены, считаются скопированными» [p.172].

```
AGREE <НОМЕР СУЩЕСТВУЮЩЕГО ПРАВИЛА>: <СУЩЕСТВУЮЩЕЕ ПРАВИЛО>
REMOVE <НОМЕР СУЩЕСТВУЮЩЕГО ПРАВИЛА>: <СУЩЕСТВУЮЩЕЕ ПРАВИЛО>
EDIT <НОМЕР СУЩЕСТВУЮЩЕГО ПРАВИЛА>: <НОВОЕ ИЗМЕНЕННОЕ ПРАВИЛО>
ADD <НОМЕР НОВОГО ПРАВИЛА>: <НОВОЕ ПРАВИЛО>
```

What is compared when a new list is generated [p.172]: the failed attempt against a successful attempt
and against the current rule list; the critique is held at GENERAL / HIGH LEVEL so it prevents similar
failures on **other** future questions, with attention to critiquing more effective Thought and Action
execution. The rules are periodically re-reviewed and re-weighted against one another for their
significance to accumulated experience [p.172].

### 6. Crossing into parametric: five reasons, three stop-signals, one order (KU: merged-ku05)
**Five situations that make fine-tuning worth considering** [p.177]:

| # | Situation | What the book pairs it with |
|---|---|---|
| 1 | Domain specialization is critical — the model must speak the organization's language, hold a style guide strictly, or handle highly sensitive content near-error-free | SFT or DPO |
| 2 | Uniform tone and format required — every answer must land in an exact template (financial disclosure, legal disclaimers) | tuning gives the structure without elaborate prompt construction |
| 3 | Tool/API call accuracy — frequent calls to external functions (drug dosage data, market quotes) | tuning sharply reduces bad calls and handles edge cases better than in-context prompts |
| 4 | Enough quality data **and** budget — large models want thousands of examples, expert graders (for RFT), GPU hours | if you lack them, reflection or experiential learning pays back better |
| 5 | Retraining cadence is manageable — versioning, retraining schedules, compatibility checks | in a fast-moving domain the cost can outweigh the gain |

**Three stop-signals** [p.177-178]:
1. **Prototype / low-usage scenario** — early on, non-parametric learning and prompt engineering give
   iterations with zero retraining cost; tune only once the scenario and data pipelines are stable.
2. **Base-model evolution can zero out the work** — vendors keep shipping stronger base models and
   months of retraining evaporate; always weigh the investment against base-model refresh cadence.
3. **Resource limits** — scarce GPUs, expensive labeling, or inference speed as the priority; consider
   non-parametric strategies such as RAG, which deliver most of the same benefit more cheaply and with
   less maintenance.

**Order of moves BEFORE any tuning investment** [p.178]:
1. Do not attempt pre-training. Training from scratch on trillions of tokens is for large AI labs with
   enormous compute and their own closed data.
2. Start from good open-source models whose licenses fit your scenario; many have already been
   post-trained or instruction-tuned for your class of task, which removes the need for extra tuning
   entirely or reduces it to minimal targeted updates.
3. Check whether an existing pre-trained or instruction-tuned model closes the requirement via prompt
   engineering, non-parametric learning, or lightweight adaptation methods.

The symmetric rule for the function-calling case [p.184]: start with the function calling built into
pre-trained models plus runtime schema validation; move to costlier measures only after confirming
prompts and standard APIs cannot cope — and best when traffic volume and the accuracy bar repay the
up-front cost.

**The reverse trigger** [p.176]: non-parametric methods themselves consume time and compute to keep
adding examples and insights into the prompt, so once enough examples accumulate, fine-tuning becomes
the thing to consider.

### 7. Which fine-tuning method for which behavioural defect (KU: ch07-ku08, ch07-ku14)
Restructured from табл. 7.1 around the question *what exactly is broken in the model's behaviour*:

| Symptom / goal | Method | Input data | Mechanics |
|---|---|---|---|
| Wrong classification, drifting structured output, instruction-following failures [p.179] | **SFT** (supervised fine-tuning) | prompt → ideal-answer pairs as the reference [p.179] | weight correction via the OpenAI API's fine-tuning calls [p.179] |
| Weak image recognition, unreliable multimodal instruction handling [p.179] | **Visual fine-tuning** | image → label pairs [p.179] | training on visual inputs [p.179] |
| Tone/style control, summarization quality [p.179] | **DPO** (direct preference optimization) | a good and a bad answer to the same prompt, with the preferred one marked [p.179] | the model learns to rank and prefer high-quality output [p.179] |
| Complex reasoning and domain tasks (legal, medical) [p.179] | **RFT** (reinforcement fine-tuning) | generated output variants scored by experts [p.179] | gradient-descent-style updates reinforcing highly-rated reasoning chains [p.179] |

One rung further: **RLVR** builds on RFT, joining preference learning to a policy optimized against
predicted value [p.192].

**SFT vs DPO in one line** [p.188]: SFT teaches reproduction of a reference result; DPO makes the model
internalize preference judgements, which improves its ability to rank and pick quality answers at
inference time. DPO earns its place when the goal is *shaping output quality* rather than replaying
examples [p.191].

Caveats the book itself attaches: the method table does not quantify data volume or cost per method,
and RFT explicitly requires expert graders [p.177]; the chapter is a deliberate introduction with a few
illustrations, not a survey of the field [p.180].

### 8. If SFT is the answer: contract first, weights second (KU: ch07-ku11, ch07-ku12, ch07-ku13)
The scenario the book develops in depth is fine-tuning **function calling**: teaching the agent both
*when* and *how* to invoke external APIs, so it not only formats the call correctly but reasons about
whether a call is needed at all [p.183]. It pays off in anomalous cases — bloated prompts, parameters
systematically misread, accuracy below the bar — especially at high traffic where every point of
reliability counts; over time it can also lower per-request cost relative to token-metered proprietary
endpoints [p.183].

Procedure [p.183-185]:
1. Define an **explicit schema** for every provided API function — names, valid arguments, types,
   return formats — so the examples teach an enforceable contract [p.183].
2. Build the tuning dataset to mirror that exact schema, so the model memorizes the tool contract [p.183].
3. Fill it with structured examples where the agent decides whether to call, fills the arguments
   correctly, and packages the result [p.184].
4. Introduce special markers and formatting — internal reasoning in `<think>…</think>`, the tool call in
   `<tool_call>…</tool_call>` — to help the model separate dialogue, thought and action [p.185].

Minimal working pattern [p.185]: preprocess dialogues into a sequential chat template with the
`<think>` / `<tool_call>` markers attached → LoRA (low-rank adaptation) on selected target layers only →
train via `SFTTrainer` on correct (prompt, answer) pairs.

**The schema loop that must exist regardless of tuning** [p.184-185]:
- [ ] Fix each function's name, argument types and return shape in a machine-readable format — JSON
      Schema and TypeScript/Zod are named; this is the contract the model is bound to.
- [ ] Feed those same schemas into the tuning process alongside the examples, so the model learns not
      only *what* to call but *how* to structure the JSON payload.
- [ ] Validate every proposed call against the same schema at execution time — Zod, Ajv, Pydantic are named.
- [ ] Handle a mismatch one of two ways — repair or reject — so malformed or malicious requests never
      pass downstream.
- [ ] Note what tuning adds on top: better mapping of the user's utterance onto allowed arguments,
      recovery from slips such as a forgotten parameter, and correct fallback when the function did not
      work [p.185].

Ordering: runtime schema checking comes **before** fine-tuning — it is part of the cheap starter kit
together with built-in function calling [p.184]. Schema validation catches contract violations (names,
types, structure); the judgement of whether a call is *needed* is attributed to training on targeted
examples, not to the schema [p.184].

**The no-call judgement** [p.184, p.187] — the behaviour SFT adds as an extra reasoning layer, taught by
deliberately chosen examples:

| Utterance | Correct behaviour |
|---|---|
| «Какая погода в Бостоне?» | call `get_weather(location="Boston")` and weave the result into the answer [p.184] |
| «Представь, что в Бостоне идёт снег, — что мне надеть?» | reason hypothetically, **no** real call [p.184] |
| «Если завтра пойдёт дождь, я останусь дома» | conclude the API is pointless here and reply in plain text [p.187] |

Design consequence: put **negative** examples — hypothetical and conditional phrasings with no call —
into the tuning dataset deliberately, not only successful calls (*вывод экстрактора, не из книги*).
The book gives neither a share of negative examples nor a metric for this error class
(*вывод экстрактора, не из книги*).

Claimed effect where an agent depends on reliable tool use — calendar items, command execution, database
queries: SFT makes calls dramatically more reliable than prompt engineering, cuts the error rate,
teaches contextual judgement that a call is unnecessary, and lowers token spend through fewer retries
and malformed calls [p.187].

### 9. If DPO is the answer: preference pairs on top of SFT (KU: ch07-ku14)
DPO extends SFT with preference learning — the model learns to prefer better answers to worse ones from
ranked pairwise comparisons [p.187-188]. The collection flow: prompts → completions from the model →
human judgement → preference data (prompt, y_win, y_lose) → direct preference optimization → aligned
model [p.188]. Dataset shape: ranked pairs, one row per `{"prompt", "chosen", "rejected"}` [p.188-189].
Key hyperparameter: **beta** sets how strongly the optimization pulls the model toward the preferred
answer [p.189]. Cost: human-labeled preference pairs are mandatory [p.188], and the book's claim that
DPO beats plain SFT is stated as an outcome of its example, without measurements [p.190].

### 10. The bill for tuning a LARGE foundation model (KU: ch07-ku16)
Restructured around *what you actually pay* [p.179-180]:

| Cost axis | What it means |
|---|---|
| Compute | Billions of parameters mean heavy GPU requirements, multi-hour training sessions and a noticeable cloud bill [p.179] |
| Retraining | Staying in sync with changing data and correcting bias raise that cost further [p.179] |
| Inference | Real-time deployment may carry increased inference latency [p.179] |
| Infrastructure | For organizations without dedicated ML infrastructure these obstacles make large-model tuning unacceptable [p.179] |
| Data | Representative examples are needed, often thousands, for the model to absorb non-obvious patterns; collecting, labeling and checking them takes a long time [p.179] |
| Bias & overfitting | The slightest carelessness in the dataset injects bias; without strict data governance and solid testing you risk overfitting to stale or unrepresentative examples, hurting generalization and fairness [p.179] |

What the money buys [p.178-179]: a domain-tuned large model parses the terminology correctly **and**
respects the organization's conventions (the book's examples: financial reporting, legal analysis with
the right tone, support under corporate rules) [p.178]; on narrow tasks large models often outperform
specialized smaller ones, which suits disease diagnostics, legal analysis and complex technical
support [p.179].

### 11. Where a proven improvement gets anchored (KU: ch11-ku18, ch11-ku19)
Once a fix is validated, it must be parked somewhere. The book contrasts **in-context learning** with
**offline retraining** [p.305-308]:

| Question | In-context learning | Offline (autonomous) retraining |
|---|---|---|
| How fast is the effect | Immediate — a prompt edit takes effect at once, with no full retraining [p.306] | Periodic, on the batch-update schedule [p.308] |
| Reach | Bounded by the current session; adaptations are lost when it ends [p.306] | Persists across sessions and users, tracking a changing environment long-term [p.308] |
| What it fixes | Failures of one session, fast iteration on small refinements, dynamic unpredictable input [p.306-307] | Accumulated systemic problems — recurring mismatches in reasoning or tool use; production is not interrupted [p.307] |
| Risk | Minimal — the first line of adaptation for testing improvements on live interactions [p.306, 307] | Reduced by being offline: you can test more thoroughly, fewer regressions [p.308] |
| Cost | Demands solid context management — the window is finite [p.306] | Compute cost (reduced by efficient methods such as LoRA) and periodic scheduling [p.308] |

**The promotion rule — the joint between the two.** In-context adaptations are temporary, so successful
in-context strategies must be promoted to durable mechanisms: prompt engineering, workflow updates, or
full model retraining [p.306, 307]. Practical order: in-context learning is the first line and the
proving ground for new reasoning strategies and prompt structures **before** they are fixed
system-wide [p.306-307].

Context management is the precondition for the first mechanism to work at all [p.306]: the system must
control what enters the prompt, how it is structured, and when stale detail is dropped or compressed —
named techniques are sliding context windows, semantic compression, and vector retrieval from memory.

Three benefits of in-context learning [p.306]: per-user adaptation (personalized answers to preferences
and recurring problems); real-time feedback incorporation (reacting to clarifications mid-interaction);
guided reasoning (explicit stages or intermediate results lead the agent to more reliable and
interpretable conclusions).

**Offline retraining in three steps** [p.307-308]:
1. **Data preparation** — collect and label examples from production traces, ensuring diversity and
   balance so no bias is introduced.
2. **Model updates** — few-shot optimization or full fine-tuning on held-out data, targeting metrics
   such as correct-result rate or latency.
3. **Validation** — test the retrained components offline, compare against reference figures, and only
   then apply shadow deployment.

Its material comes from what the feedback pipelines and experiments accumulated [p.307]; in the SOC-agent
example the team turns historical logs and annotations into datasets, then either applies DSPy for prompt
optimization or tunes a lightweight adapter over the base foundation model [p.307]. Its three advantages:
durability, scalability (batch updates suit high-load systems and large datasets without real-time
overhead), and lower risk [p.308]. Its management burden: guard against overfitting to historical data
and against ignoring emerging trends [p.308].

> Terminology caveat carried from the KU: the book names in-context and **online** learning as the two
> base mechanisms of continuous learning [p.305]; the table above contrasts in-context learning with
> **autonomous retraining**, which the book treats in its own section [p.307-308]
> (*вывод экстрактора, не из книги*).

## Key facts & formulas
- Large models want representative examples, **often thousands**, for non-obvious patterns [гл.7, с.179];
  the same order of magnitude is repeated as a precondition for tuning [гл.7, с.177].
- Reflection example injects **at most the 3 most recent** stored analyses into context [гл.7, с.169].
- The core ideas of the reflection example fit in **fewer than 20 lines of code** [гл.7, с.170].
- Reflection is skipped for successful runs and for configurations explicitly marked skippable [гл.7, с.169].
- Four rule-list operations: `AGREE` / `REMOVE` / `EDIT` / `ADD`; unmentioned rules are copied
  unchanged [гл.7, с.172-173].
- SFT function-calling markers: `<think>…</think>` for reasoning, `<tool_call>…</tool_call>` for the
  call [гл.7, с.185].
- Quantized load and dataset split from the SFT example [гл.7, с.186]:
  ```python
  BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16,
                     bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True)
  train_test_split(test_size=0.1, seed=42)
  ```
  plus a mandatory `model.resize_token_embeddings(len(tokenizer))` after adding markers [гл.7, с.186].
- Training-loop defaults in the example [гл.7, с.186]:
  ```python
  epochs: int = 1, lr: float = 1e-4, batch_size: int = 1,
  grad_accum: int = 4, max_seq_len: int = 1500
  ```
  `SFTTrainer` (Hugging Face TRL) supports `packing=True` and `gradient_checkpointing=True` [гл.7, с.186-187].
- DPO dataset row shape: `{"prompt": ..., "chosen": ..., "rejected": ...}` [гл.7, с.188-189].
- DPO example stack — base checkpoint and LoRA config [гл.7, с.188-189]:
  ```python
  BASE_SFT_CKPT = "microsoft/Phi-3-mini-4k-instruct"
  lora_cfg = LoraConfig(
      r=8, lora_alpha=16, lora_dropout=0.05,
      target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
      bias="none", task_type="CAUSAL_LM",
  )
  ```
- `beta` controls how hard DPO pulls toward the preferred answer [гл.7, с.189]. The full `DPOConfig`
  (beta, loss_type, label_smoothing, max_prompt_length, max_completion_length, max_length,
  truncation_mode, reference_free) is on с.190 of the source and is **not** reproduced here — that page
  is math-dense and the extraction broke its key→value pairs [гл.7, с.190].
- Runtime schema validators named: Zod, Ajv, Pydantic; schema formats named: JSON Schema, TypeScript/Zod
  [гл.7, с.184-185].
- Context-management techniques named for in-context learning: sliding context windows, semantic
  compression, vector retrieval from memory [гл.11, с.306].
- Offline retraining compute cost is reduced by efficient methods, LoRA named [гл.11, с.308].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|--------------|--------------|--------|
| Adding a learning loop because it sounds sophisticated | Learning is optional design; it adds design, evaluation and monitoring work that may never pay back for this application | ch07-ku01 |
| Reaching for fine-tuning while in doubt | The book's explicit rule is to abstain when unsure — a cheaper, more effective improvement is usually available | merged-ku05 |
| Pre-training from scratch | Trillion-token training belongs to large labs with enormous compute and closed data | merged-ku05 |
| Fine-tuning a prototype or a low-traffic scenario | Early on, non-parametric learning and prompting iterate at zero retraining cost; tune only when the scenario and data pipelines are stable | merged-ku05 |
| Ignoring base-model refresh cadence | A stronger base model can wipe out months of retraining; always weigh tuning against vendor release rhythm | merged-ku05 |
| Endlessly growing the few-shot block in the prompt | Cost and latency rise, and an example useful for one input is useless for another | ch07-ku02 |
| Expecting reflection to rescue the **current** attempt | The loop fires on failure and improves the *next* attempt; base model capability is unchanged | ch07-ku03 |
| Expecting reflection alone to transfer learning across different tasks | Cross-task transfer is exactly what ExpeL adds on top of reflection | ch07-ku05 |
| Letting the insight list grow unpruned | Rules duplicate and contradict; without `REMOVE`/`EDIT` and periodic re-weighting the set stops guiding decisions | ch07-ku06 |
| Writing rule critiques at task-specific granularity | Critique must stay GENERAL / HIGH LEVEL to prevent similar failures on *other* future questions | ch07-ku06 |
| Fine-tuning function calling before exhausting built-in calling + runtime schema validation | The cheap starter kit is explicitly ordered first; tuning costs data, compute and ongoing maintenance | ch07-ku11, ch07-ku12 |
| Relying on schema validation to decide whether a call is *needed* | Schema catches contract violations only; the need-a-call judgement comes from targeted training examples | ch07-ku12 |
| A tuning dataset of successful calls only | The hypothetical/conditional no-call behaviour is taught by deliberate examples of *not* calling | ch07-ku13 |
| Using SFT where the goal is output *quality* by human standards | SFT reproduces a reference; ranking better vs worse answers is the DPO objective | ch07-ku14 |
| Budgeting large-model tuning as GPU hours only | Data collection/labeling, bias control, retraining cadence and inference latency are all part of the bill | ch07-ku16 |
| Leaving a proven improvement in the session prompt | In-context adaptations die with the session; successful strategies must be promoted to prompt engineering, workflow updates or retraining | ch11-ku18 |
| Shipping a retrained component straight to production | The third step is offline validation against reference figures, and only then shadow deployment | ch11-ku19 |
| Retraining purely on historical batches | Overfitting to history and blindness to emerging trends are the named management burdens | ch11-ku19 |

## Related decisions
- Chose ExpeL or dynamic exemplars → `aiagents-knowledge-and-memory`: you now owe an experience store
  and a retrieval path (context, actions, results, feedback per interaction) — designing that store is
  that skill's decision, not this one's.
- Chose in-context learning as the first line → `aiagents-knowledge-and-memory` again for context
  management (sliding windows, semantic compression, vector retrieval), which the book makes a
  precondition for the mechanism working at all.
- Chose SFT for function calling → `aiagents-tool-design-and-selection`: the explicit function schema
  becomes the training contract, so the tool surface must be frozen *before* the dataset is built;
  runtime schema validation stays mandatory either way.
- Chose parametric learning of any kind → `aiagents-evaluation-design`: you need the metric that says
  the tuned model is better (correct-result rate, latency) and the offline comparison against reference
  figures before promotion.
- Chose offline retraining → `aiagents-observability-and-drift`: the production traces and annotations
  that feed data preparation come from the monitoring layer, and shadow deployment is the gate before
  full rollout.
- Weighing a tuned small model against a large foundation model → `aiagents-agent-fit-and-model-choice`
  (that skill owns model size and cost per unit of quality; this one owns only the learning class).
- Tuning for safety-constraint adherence or tool-call correctness → `aiagents-agent-security`: the
  reward/validation target overlaps, but the exploit surface and defenses live there.
- The ops-side loop that *finds* what to learn — problem detection, RCA, prompt refinement, automated
  prompt optimization, insight backlog triage — is `aiagents-improvement-loops`. The joint runs both
  ways: that loop's RCA verdict "single incident or recurring pattern" is the evidence §1 step 1 demands
  before any learning mechanism is justified here; and a promotion decided in §11 (prompt engineering,
  workflow update, or retraining [p.306-307]) becomes a ranked item in that skill's backlog. Rule of
  thumb: if the change is to a prompt, a tool or the team's process, it belongs there; if it changes how
  the agent itself learns — exemplars, reflection, ExpeL, SFT/DPO, retraining cadence — it belongs here.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5),
глава 7 «Обучение в агентных системах», с. 164–192, и глава 11 «Циклы улучшения», с. 305–308.
KUs: ai-apps-ch07-p164-ku01, ku02, ku03, ku04, ku05, ku06, ku08, ku11, ku12, ku13, ku14, ku16;
ai-apps-merged-ku05; ai-apps-ch11-p280-ku18, ku19. Deep reference: `references/knowledge-units.md`.
- Abstention anchor: «Если у вас возникают сомнения, не применяйте тонкую настройку» [p.178].
- Rule-list anchor: «все существующие правила, которые не изменены, не подтверждены и не удалены,
  считаются скопированными» [p.172].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] Partial KU (`ai-apps-ch07-p164-ku01`) — the judge-refused over-claim excluded (see
      `references/knowledge-units.md`)?
- [x] Non-book inferences labelled «вывод экстрактора, не из книги»?

## Examples
- «У агента регулярно ломаются вызовы инструментов. Файнтюнить?» → Not yet: exhaust built-in function calling
  plus runtime schema validation (Zod/Ajv/Pydantic) first [p.184]; if malformed calls persist at high
  traffic, SFT with an explicit function schema and `<think>`/`<tool_call>` markers is the named fit
  [p.183-185]; also add negative (no-call) examples for hypothetical phrasings [p.184, 187].
- "Our agent keeps repeating the same failure on the same task type" → non-parametric reflection loop:
  log every step, generate a `Plan:` critique on failure, store it, inject the 3 most recent analyses
  next attempt [p.166, 169]; it improves the *next* attempt, not the current one.
- «Хотим, чтобы агент переносил выученное между разными задачами» → escalate reflection to ExpeL: a live
  insight list mined from the experience pool, maintained with AGREE/REMOVE/EDIT/ADD at GENERAL level
  [p.170-173].
- "Should we fine-tune or is this a prompt problem?" → run the abstention rule and the three
  stop-signals: prototype/low-usage, base-model refresh cadence, resource limits [p.177-178]; if none
  fire and you have thousands of quality examples plus a manageable retraining cadence, the method
  follows the defect — SFT for structure/instructions, DPO for preference-shaped quality, RFT for expert
  reasoning [p.177, 179].
- «Мы нашли рабочую формулировку промпта в одной сессии — что дальше?» → promote it: in-context
  adaptations die with the session, so a validated strategy moves to prompt engineering, a workflow
  update, or retraining; retraining goes data-prep → model update → offline validation → shadow
  deployment [p.306-308].
