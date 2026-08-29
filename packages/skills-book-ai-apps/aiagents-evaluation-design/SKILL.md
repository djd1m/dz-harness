---
name: aiagents-evaluation-design
description: >
  BUILD the evaluation for an agent: derive the metric mix from measurable goals (quantitative /
  qualitative / semantic-similarity), assemble and grow the evaluation set as a living specification,
  shape each eval case as input state + dialogue + expected final state, generate targeted adversarial
  cases, unit-test every tool, score the planner (tool recall / tool precision / parameter accuracy),
  test memory and learning components, run end-to-end scenarios on five metrics, and wire the whole
  thing into commits, model updates and human sampling. Constructing the evaluation ONLY — NOT the
  probabilistic-behaviour checks an agent needs on top — consistency invariants, coherence over long
  dialogues, hallucination reduction, unexpected/out-of-distribution input handling
  (→ `aiagents-probabilistic-behaviour-checks`), NOT release-readiness thresholds, blocking gates,
  shadow mode, canary or live-traffic rollout (→ `aiagents-release-gates-and-rollout`), which consume
  this instrument's numbers rather than define them, NOT head-to-head benchmarking of CODING agents
  such as Claude Code vs Aider (→ `agent-eval`), NOT generic QE machinery — grading a single answer
  (→ `answer-assessor`), code-quality metrics (→ `quality-metrics`), regression suites for ordinary
  software (→ `ai-regression-testing`, `test-design-techniques`), NOT production monitoring, alert
  thresholds and drift (→ `aiagents-observability-and-drift`).
  Triggers (RU+EN): "как оценивать агента", "какие метрики выбрать для агента", "собрать оценочный
  набор", "как понять, что планировщик выбрал не тот инструмент", "как тестировать память агента",
  "сквозной прогон сценариев агента", "юнит-тесты для инструментов агента", "агент проходит тесты,
  но в проде плохо", "how do I evaluate my agent", "build an eval set for an agent", "tool recall vs
  tool precision", "unit test an agent tool", "end-to-end agent evaluation metrics", "our offline
  scores look great but production is bad".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch02-p41-ku03, ai-apps-ch02-p41-ku17, ai-apps-ch09-p238-ku01, ai-apps-ch09-p238-ku02, ai-apps-ch09-p238-ku03, ai-apps-ch09-p238-ku04, ai-apps-ch09-p238-ku05, ai-apps-ch09-p238-ku06, ai-apps-ch09-p238-ku07, ai-apps-ch09-p238-ku08, ai-apps-ch09-p238-ku09, ai-apps-ch09-p238-ku10, ai-apps-ch09-p238-ku11, ai-apps-ch09-p238-ku17, ai-apps-ch09-p238-ku18]
---

# Evaluation design — build the measuring instrument before you claim the agent got better

## Output
An evaluation design that lands in an ADR, an architecture step or a code review: the agent's
measurable goals and the metric mix chosen for them; the evaluation set (its case format, its
sources, its growth rule); the per-component test plan — tools, planner, memory, learning modules —
with the metric each component is scored on; the end-to-end scenario harness and its five per-run
metrics; and the lifecycle wiring (what runs on every commit, what runs on every model update, what
a human samples by hand). Plus the explicit statement of what this instrument does **not** see.

## When to use / NOT
- **Use when:** starting evaluation work on an agent and asking what to measure at all; assembling or
  growing an evaluation set; formalising a test case for an agent that calls tools; deciding how to
  unit-test a tool; diagnosing why the planner's numbers dropped; testing a memory module or a
  self-learning loop; building the end-to-end scenario harness; deciding what runs in CI versus what a
  human reviews; auditing an evaluation strategy that produces good offline numbers and bad production
  behaviour.
- **NOT for:** the probabilistic-behaviour layer that sits on top of this instrument — consistency
  invariants under sampling variation, coherence across a long dialogue, hallucination-reduction levers,
  and unexpected/out-of-distribution input handling. Those belong to
  → `aiagents-probabilistic-behaviour-checks` (the chapter's own KUs `ch09-p238-ku12`, `ku13`, `ku14`,
  `ku15` are deliberately outside this skill's `derived_from` and sit in that sibling's). Also NOT
  deployment-readiness thresholds, blocking gates, canary and rollback —
  → `aiagents-release-gates-and-rollout` (`ch09-p238-ku16`). Also NOT: benchmarking coding
  agents against each other (→ `agent-eval`); scoring one model answer (→ `answer-assessor`); code and
  test-suite quality metrics (→ `quality-metrics`); ordinary regression-suite and test-case design
  technique (→ `ai-regression-testing`, `test-design-techniques`); watching the running system, alert
  thresholds and drift (→ `aiagents-observability-and-drift`).

## Decision criteria

### 1. Start from goals, then assemble the metric MIX (KU: ch09-p238-ku18, ch09-p238-ku05, ch02-p41-ku17)
The book's ordering is goals first, metrics second [p.239]:

1. Write down concrete, measurable goals that express the outcomes you want from the system — its own
   examples are a rise in user engagement and the automation of a complicated process [p.239].
2. Construct typical cases for the **high-priority** use scenarios, so that the metrics end up pointed
   at the functions that actually decide whether the agent succeeds [p.239].
3. Take a **combination** of families rather than one number [p.239].
4. For language agents, factor in that exact-match scoring is often not enough, while semantic
   measures are seeing wider use [p.239] — see §1b.
5. Check that the chosen metrics reflect the real requirements the system will meet [p.239].

Reconstructed as an inventory of what the book names in each family. The rows are families the book
lists side by side; the table does **not** claim one family substitutes for another:

| Family | Measures the book names in it | Where it is named |
|---|---|---|
| Quantitative | share of correct results (accuracy), response time, scalability, precision, recall | [p.239] |
| Qualitative | user satisfaction | [p.239] |
| Semantic similarity (language outputs) | embedding-based distance, BERTScore, BLEU, ROUGE | [p.239] |
| UX signals | NPS, CSAT, task-completion percentage; explicit signals — thumbs, star ratings, accept / reject / edit of the produced result; implicit signals — mining interaction logs for the usual failure points (misinterpretations, latency, expressions of negativity, unsuitable answers) | [p.62-63] |
| Generalisation | behaviour on cases outside the training scenarios while the correct-answer share holds; adaptation to tasks beyond the original training without extensive retraining | [p.62] |

The book's worked pairing for a support agent: response time and correct-result share cover
performance, while user feedback covers satisfaction [p.239]. It sets **no** numeric targets and no
weighting between the quantitative and the qualitative side.

**1b. Why exact match is the wrong default for a language agent** [p.239]: correct answers arrive in
many wordings, so exact-match scoring undervalues a useful answer. The semantic measures listed above
judge whether the output serves the task's goals even when the phrasing drifts from the reference.
Carry §10's warning with you: optimising for a single combined rating such as BLEU can push the agent
toward stereotyped, unnatural output [p.249].

**Chapter frame** [p.238]: beyond ordinary functionality the chapter works through four reliability
properties of the result — accuracy, consistency, coherence, responsiveness — because foundation
models are probabilistic. This skill owns the *accuracy/functionality* construction. Consistency and
coherence testing are owned by → `aiagents-probabilistic-behaviour-checks`.

### 2. The evaluation SET as a living specification (KU: ch09-p238-ku02)
An evaluation set is a collection of test cases — questions, tasks, scenarios — each with a known
correct answer or an explicit success criterion [p.240]. The book's framing is that a good set works
as a living specification: one case pins one requirement of the form "the agent must be able to do X",
and the set is extended as the system evolves [p.240]. Tracking historical results over the set is
what reveals when an outward improvement was paid for with a regression elsewhere [p.240]. Over time
it stops being a family of tests and becomes a feedback cycle that shapes where the system goes [p.242].

Risks the book attaches to a **static, hand-made** set [p.240]:

| Risk | What it looks like |
|---|---|
| Overfitting | The system is tuned to the set rather than to the job |
| Missed failure modes with delayed consequences | The damage surfaces long after the run that caused it |
| Lag | The set trails the evolving workflows and the evolving behaviour of real users |

Constraint on the set itself: it has to carry the real world's variety, ambiguity and edge cases,
or the metrics computed over it mislead [p.240, p.249].

### 3. The shape of one evaluation CASE (KU: ch09-p238-ku03)
A good case fixes both the input state and the expected result [p.240]. The book's running example is
a support agent for an online shop handling a refund for one broken mug inside a multi-item order
[p.240-241]. Its case format has three parts [p.241]:

| Part | Holds |
|---|---|
| `order` | The state of the world — line items, prices, delivery status |
| `conversation` | The dialogue history, with `customer` / `assistant` roles |
| `expected.final_state` | The expected end state: a list of `tool_calls` with their parameters, plus `customer_msg_contains` — phrases the final message must contain |

One case in this shape exercises three things at once: reasoning about a multi-item order, matching
the dialogue context to tool calls, and a polite confirmation [p.241].

**Where cases come from, and how the supply scales** [p.241]: hand-written; mined from operational
logs; generated by a foundation model (ambiguous phrasings, rare idioms, working examples converted
into edge cases). Model-generated cases require human review before they join the set [p.241].

*Source-quality note carried from the KU:* in the book's own example the `expected` block references
`order_id "A12345"` while the order is `"A89268"` [p.241] — an inconsistency in the source, most
likely a typesetting slip. Copy the shape, not that value.

### 4. TARGETED test generation (KU: ch09-p238-ku04)
Three deliberate techniques for producing cases that ordinary scenarios never surface — all three
aimed at hidden defects and at how well the agent holds its behaviour under pressure [p.242]:

| Technique | The book's instruction to the generator |
|---|---|
| Adversarial prompts | «Найди сообщение пользователя, которое заставит агента противоречить себе» [p.242] |
| Counterfactual editing | «Измени одно слово в промпте и проверь, не приведет ли это к сбою агента» [p.242] |
| Distributional interpolation | «Объедини два намерения, чтобы создать неоднозначный запрос» [p.242] |

Two further supplies the book names [p.242]: deep analysis of real data — support logs, API traces;
and benchmarks. On benchmarks it is explicit about scope — the standard ones (MMLU, BBH, HELM) give
you a comparison against industry trends and do **not** replace a custom domain benchmark; for a
custom benchmark, bring domain experts in to define the tasks, the references and the success
criteria [p.242].

### 5. Component level — UNIT-TESTING a tool (KU: ch09-p238-ku17, ch02-p41-ku03)
Tools are the functions that let the agent act in its environment, fetch and transform data, and talk
to external systems [p.242]; a happy-path-only test leaves shaky edge cases and unspoken assumptions
uncovered [p.243]. The book asks a mature agent-development process to define a **family** of
automated tests for **each** tool [p.243]. Coverage checklist:

- [ ] The full range of use scenarios — beyond the happy path, deliberately ambiguous, rare and
      plainly wrong situations, because that is where wobbly range boundaries and unspoken
      assumptions show up [p.243].
- [ ] Variety of inputs and conditions — the book's example runs a data-extraction module across
      different formats, different network conditions, and both clean and deliberately corrupted
      sources [p.243].
- [ ] Not just result correctness but **latency**, **resource consumption** and **error handling**, so
      the component keeps working under high load and on failure [p.243].
- [ ] Determinism — identical inputs give identical results unless stochasticity is designed into the
      module; where it is, statistical properties are what you check [p.243].
- [ ] External dependencies (APIs, databases) behind mocks or simulators that can reproduce the edge
      cases which are rare in production and catastrophic when mishandled [p.243].
- [ ] Regression tests — on every change to the module, the **whole** test set runs again to confirm
      prior functionality is intact [p.243].

The book places unit testing at the foundation of agent development: this is the level at which each
node of the system is checked one by one, and the quality of that check decides whether the node
behaves as designed and what it contributes to overall reliability and performance [p.242]. It gives
no target coverage percentage, and does not discuss how to combine mocked dependencies with contract
checks against the real API.

**The minimum bar, from the first-agent chapter** (a cancel-order agent) [p.43-44]. Three questions
before any expansion of functionality [p.43]:

- [ ] Does it call the right tool (`cancel_order`)?
- [ ] Does it pass the right parameters (the right order identifier)?
- [ ] Did it send the customer a clear, correct confirmation message?

Minimum automation [p.44]: invoke the graph on a real message; assert that a tool call named
`cancel_order` appears among the result messages; assert the confirmation text is present. Before
going live, run a sample of **hundreds** of examples — the volume is what exposes the edge cases —
and take three quantities off it [p.44]: tool precision (was the right tool chosen), parameter
accuracy (were the call arguments right), and the share of tasks carried through to success for the
agent as a whole. Because the steps are automated with `@tool` decorators, tests on real tickets are
trivial and yield objective metrics: tool recall, parameter accuracy, confirmation quality [p.44].
The principle: «непротестированный агент — ненадежный агент» [p.44]. The book's open repository
carries an evaluation dataset and a batch evaluation script [p.43].

*Source-quality note:* the minimal-check code on p.44 is syntactically broken — a stray closing
parenthesis in the first assert, and in the second the message string landed **inside** the `any(...)`
call because the closing parenthesis precedes it; there is also a junk character in the `print`.
Take the intent, not the listing.

### 6. Component level — the PLANNER (KU: ch09-p238-ku06)
Three metrics over a run in which you collect the agent's tool calls and their arguments and compare
them with the scenario's reference [p.244]:

| Metric | The question it answers |
|---|---|
| Tool **recall** | Did the planner lose any of the expected calls? |
| Tool **precision** | Did it add calls beyond the needed ones? |
| **Parameter accuracy** | Did each tool's arguments match the reference? |

Computation, verbatim from the book's code [p.244]:

```python
tp = len(exp_set & pred_set)
recall = tp / len(exp_set)
precision = tp / len(pred_set) if pred_set else 0.0
```

With an empty expectations list both metrics are taken as `1.0` [p.244]. Parameter accuracy counts a
pair as matched when [p.244]:

```python
pred.get("tool") == exp.get("tool") and pred.get("params") == exp.get("params")
```

and the result is `matched / len(expected_calls)`, again `1.0` on empty expectations.

Limits you inherit by using these as written: the tool metrics are set-based over tool **names**, the
**order** of calls is not scored, and parameters are compared by strict equality.

*Source-quality note:* in the corpus the function signature is cut off mid-line [p.244] —
```python
def tool_metrics(pred_tools: List[str], expected_calls:
```
— a probable PDF layout/extraction defect; the parameters are recoverable from the body.

### 7. Reading a planner failure off the metric PROFILE (KU: ch09-p238-ku07)
The book's readings are **hypothetical in its own wording** — "may indicate", "suggests" — not a
diagnosis. The header below says so on purpose:

| Metric profile | The book's tentative reading [p.244] |
|---|---|
| Low recall | A likely sign that the required action was simply never performed |
| Low precision | More probably a miss in understanding the task — the goal read wrongly, or the user's intent recognised incorrectly |
| Parameter divergence | Presumably a context-handling failure — money leaves for the wrong line item, or for an order that arrived without complaint |

A metric profile points at a probable **class** of defect; it does not establish the cause [p.244].

Additional things to test at this level [p.245]: edge cases (a multi-item order with one problem item;
ambiguous or self-contradictory input); consistency — in deterministic scenarios the same input
yields the same result, in probabilistic ones the spread of plans stays inside acceptable bounds;
reproducibility; sensitivity to small input changes; handling of missing fields and of tool failures.
(The full consistency-testing methodology lives in → `aiagents-probabilistic-behaviour-checks` — what
is in scope here is only that the planner harness must exercise it.)

### 8. Component level — MEMORY (KU: ch09-p238-ku08)
A memory module lies subtly: it returns something stale, something similar-but-irrelevant, or it
degrades as the store grows. Four dimensions [p.245-246]:

| Dimension | What the test does | Anchor |
|---|---|---|
| Correctness | What was written reads back unchanged — immediately and after time and intervening operations; edge cases at maximum capacity, with unusual data types, and under rapid read/write cycles; deliberate loading with incorrect, duplicated and ambiguous data | [p.245] |
| Relevance | Retrieval does not return the stale (old user preferences instead of recent ones) and does not drag in the irrelevant on surface similarity of wording or semantics | [p.246] |
| Efficiency | Retrieval time and resource use under raised load; for vector/semantic search, both "easy" and "hard" retrieval scenarios, which expose embedding and indexing errors | [p.246] |
| Robustness | Simulated database unavailability, data corruption, version migration — the agent either recovers correctly or fails in a controlled way | [p.246] |

Retrieval metric, verbatim logic from the book's code [p.246] — `retrieval_accuracy@k`, the share of
queries that returned at least one expected item within the first *k* results:

```python
hit = set(results) & set(expect)
accuracy = hits / len(queries) if queries else 1.0
```

The book is explicit that memory testing does not reduce to low-level store/retrieve: integrity,
relevance and efficiency all have to be re-checked as the store grows [p.245]. This matters most for
agents with multi-turn dialogues, long-running flows and long-lived user profiles [p.245].

### 9. Component level — LEARNING modules (KU: ch09-p238-ku09)
Stochasticity and data dependence make learning modules the hardest thing to unit-test; the burden of
proof is that the agent is improving rather than overfitting or forgetting what it had [p.246-247].
Three axes [p.247]:

| Axis | What you establish |
|---|---|
| The core loop | That the agent actually updates parameters, cache or rules from labelled data, feedback or reward signals. Supervised: the expected correct-result share on a canonical set, plus generalisation to validation. Reinforcement: reward maximisation improves behaviour over time, and flat stretches of the learning curve get detected and dealt with (early stopping, dynamic exploration) |
| Generalisation | Hold-out sets, synthetic examples, and adversarial cases aimed at brittle heuristics and memorised answers |
| Adaptivity | Simulated shifts — new input types, unseen tool failures, changed reward systems — with adaptation happening without catastrophic forgetting; where several paradigms coexist (supervised / unsupervised / reinforcement), check the cross-paradigm interactions too |

Because the behaviour is stochastic, judge these with statistical criteria rather than point
comparisons.

### 10. END-TO-END scenario runs (KU: ch09-p238-ku10)
The point is confirming the system carries the task through as a whole, in a setting close to the
real one [p.248]. The shape, following the book's `evaluate_single_instance` [p.248-249]: the agent
receives structured input (order data plus dialogue history) → the final message and every tool call
with its arguments are extracted from the result → both are compared with the expected final state.

Five metrics per run [p.249]:

| Metric | Scores |
|---|---|
| `phrase_recall` | The share of required phrases present in the final message |
| `tool_recall` | Completeness of tool selection |
| `tool_precision` | Precision of tool selection |
| `param_accuracy` | Share of correct parameters |
| `task_success` | The combined task-success rating |

Together they answer three questions: did the agent read the situation correctly, did it take the
right actions, and did it explain them intelligibly to the user [p.248]. Extensions the book names:
latency, throughput, behaviour under load; and on failures, checking the fallback strategies and the
escalation path [p.250].

Two limits to carry: the tests are no better than their sets and metrics (§11) [p.249]; and in the
book's own code a failing case is marked `[SKIPPED]` and does not fail the run [p.249] — decide
consciously whether your harness keeps that behaviour, because a skipped case is an unscored case.

Scale: this harness is what makes repeatable measurement over dozens to hundreds of scenarios
possible [p.249]. The environment for it should be as close to real use as you can get, with
end-to-end coverage of the whole operating range — from data intake and processing through task
execution to output generation, across different systems, platforms and data sources [p.63].

### 11. The guard on the whole instrument: METRIC OVERFITTING (KU: ch09-p238-ku11)
«автоматизированные тесты не могут быть качественнее оценочных наборов и метрик, которые в них
используются» [p.249]. Two self-deception modes [p.249]:

1. **Narrow or unrepresentative scenarios** → healthy offline numbers, failure in real operation.
2. **Metric overfitting** — tuning the system for brilliant scores on a small set of metrics at the
   expense of overall usefulness. For text agents, optimising for BLEU or for exact match rewards
   stereotyped, unnatural answers that miss what the user actually meant.

The antidote [p.249-250]: treat evaluation as a live process rather than a static checklist — extend
the sets regularly for new functionality, for real user behaviour and for failure modes as they
appear; and take feedback from internal reviewers and pilot users, which is what exposes the blind
spots of the automated pipelines.

### 12. Wiring evaluation into the LIFECYCLE (KU: ch09-p238-ku01, ch02-p41-ku17)
| Practice | Detail | Anchor |
|---|---|---|
| Do not defer, do not eyeball | Evaluation is not saved for the end, and "looks fine" plus gut feel is not a method | [p.240] |
| Automate the runs | Tests fire on every code commit and every model update | [p.239] |
| One consistent source of truth for the key metrics | This is what gives early regression detection **before** a release | [p.239] |
| Human review stays | Automated evaluation rarely contains all the information; in poorly-understood and critical areas, sample the agent's results and have a person review them — that is what surfaces the non-obvious problems | [p.239] |
| The metrics themselves are iterated | Both the agent's behaviour and the metrics get refined in response to feedback and changing requirements | [p.239] |
| The set grows with the product | Every new tool or workflow brings its own test scenarios into the growing evaluation set, so progress is measured against an expanding functional area rather than a frozen reference | [p.240] |
| Expert-in-the-loop calibration | A specialist reviews a sample of results for correctness, ethical fit and best practice; those review results calibrate and improve the automated evaluations | [p.63] |
| Functional testing per skill/module | Each skill or module is tested separately against expected behaviour, prioritising correctness, edge testing (very large datasets, atypical queries, fuzzy instructions) and domain-specific metrics where the field demands them (legal analysis, medical diagnostics) | [p.61-62] |

The book calls expert involvement necessary only "in some cases" [p.63], and fixes no numeric
thresholds anywhere in this frame.

## Key facts & formulas
- Chapter frame: four reliability properties — accuracy, consistency, coherence, responsiveness —
  studied because foundation models are probabilistic [p.238].
- Quantitative family: correct-result share, response time, scalability, precision, recall.
  Qualitative family: user satisfaction [p.239].
- Semantic-similarity measures named: embedding-based distance, BERTScore, BLEU, ROUGE [p.239].
- UX measures named: NPS, CSAT, task-completion percentage; explicit signals (thumbs, star ratings,
  accept/reject/edit) and implicit signals from interaction logs [p.62-63].
- Evaluation-case format: `order` + `conversation` + `expected.final_state` with `tool_calls` and
  `customer_msg_contains`; the worked refund is for the damaged item only — 19.99, not the whole
  order [p.241].
- Case sources: manual, operational logs, foundation-model generation with human review [p.241].
- Targeted generation: adversarial prompts, counterfactual editing, distributional interpolation
  [p.242].
- Benchmarks named: MMLU, BBH, HELM — for industry-trend comparison; custom benchmarks for the
  domain, with expert-defined tasks, references and success criteria [p.242].
- Planner metrics [p.244]:
  ```python
  tp = len(exp_set & pred_set)
  recall = tp / len(exp_set)
  precision = tp / len(pred_set) if pred_set else 0.0
  ```
  empty expectations ⇒ both `1.0`; `param_accuracy = matched / len(expected_calls)`, `1.0` on empty.
- Memory retrieval metric [p.246]:
  ```python
  hit = set(results) & set(expect)
  accuracy = hits / len(queries) if queries else 1.0
  ```
- End-to-end per-run metrics: `phrase_recall`, `tool_recall`, `tool_precision`, `param_accuracy`,
  `task_success` [p.249]; failing cases marked `[SKIPPED]` in the book's code [p.249].
- Pre-launch sample size for the first-agent minimum check: hundreds of examples, yielding tool
  precision, parameter accuracy and overall task-success share [p.44].
- The book's open repository ships an evaluation dataset and a batch evaluation script [p.43].
- Known defects in the source itself: `order_id` mismatch A12345 vs A89268 [p.241]; a truncated
  `tool_metrics` signature [p.244]; syntactically broken minimal-check code [p.44].
- No numeric targets are given for any metric in this frame, and no weighting between quantitative
  and qualitative measures [p.239].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Leaving evaluation until the end of the project | The team gets an illusion of progress — the system "improves" by eye while it regresses | ch09-p238-ku01 |
| Judging results by visual inspection and gut feel | Explicitly named as the thing not to trust | ch09-p238-ku01 |
| Treating the automated suite as complete | Automated evaluation rarely holds all the information; sampled human review is what surfaces the non-obvious | ch09-p238-ku01 |
| A frozen evaluation set | Overfitting, missed failure modes with delayed consequences, and drift behind real workflows and user behaviour | ch09-p238-ku02 |
| An evaluation set that lacks the real world's ambiguity and edge cases | The metrics computed over it mislead | ch09-p238-ku02 |
| Adding a tool or workflow without adding its test scenarios | Progress gets measured against a shrinking fraction of the functionality | ch09-p238-ku01 |
| Exact-match scoring for a language agent | Correct answers take many forms, so a useful answer is scored as a failure | ch09-p238-ku05, ch09-p238-ku18 |
| Optimising the agent for one combined rating such as BLEU | Rewards stereotyped, unnatural output that misses the user's real intent | ch09-p238-ku11, ch09-p238-ku05 |
| Picking metrics before writing down measurable goals | The measurement points away from the functions that decide the agent's success | ch09-p238-ku18 |
| Model-generated eval cases merged without human review | Review before inclusion is a stated precondition | ch09-p238-ku03 |
| Standard benchmarks in place of a domain benchmark | They give comparison against industry trends; they do not replace the domain set | ch09-p238-ku04 |
| Testing a tool on the happy path only | Shaky range boundaries and unspoken assumptions stay uncovered | ch09-p238-ku17 |
| Scoring a tool on result correctness alone | Latency, resource consumption and error handling decide whether it survives load and failure | ch09-p238-ku17 |
| Changing a tool and re-running only its own new test | The prescribed shape re-runs the full set to confirm prior functionality is intact | ch09-p238-ku17 |
| Hitting the real external API in a tool's unit tests | Mocks and simulators are what let you reproduce the rare, catastrophic edge cases | ch09-p238-ku17 |
| Reading a low-precision planner run as a definite diagnosis | The book's readings are explicitly tentative and name a probable defect class, not a cause | ch09-p238-ku07 |
| Scoring the planner on tool names alone and calling it done | Set-based metrics ignore call order; parameters are strict-equality only | ch09-p238-ku06 |
| Testing memory only as write-then-read-back | Relevance, efficiency and robustness are separate dimensions, and they degrade as the store grows | ch09-p238-ku08 |
| Point-comparison assertions on a learning module | Stochastic behaviour needs statistical criteria and hold-out generalisation checks | ch09-p238-ku09 |
| A learning module that adapts to a shift without a forgetting check | Adaptation is only a pass if it happens without catastrophic forgetting | ch09-p238-ku09 |
| Letting end-to-end failures be silently `[SKIPPED]` | The book's own code skips them; a skipped case is an unscored case | ch09-p238-ku10 |
| Component metrics only, no end-to-end runs | Nothing then confirms the system carries the whole task through in a near-real setting | ch09-p238-ku10 |
| Trusting good offline scores against narrow scenarios | Named as the first of two self-deception modes leading to production failure | ch09-p238-ku11 |
| Shipping without the pre-launch sample of hundreds of cases | Volume is what exposes the edge cases | ch02-p41-ku03 |

## Related decisions
- **`aiagents-tool-design-and-selection`** — §5 is the other end of that skill's description checklist,
  which ends in iterative testing on representative prompts: tool-selection accuracy is an *evaluated*
  property, not a design-time assertion. Every tool you register there arrives here owing a test family
  [p.243]; a larger or more overlapping toolbox directly raises `tool_precision` risk (§6).
- **`aiagents-knowledge-and-memory`** — §8's four dimensions are the acceptance test for whatever store
  and retrieval scheme that skill picks. Choosing vector/semantic retrieval there obliges you to build
  the "easy" and "hard" retrieval scenarios that expose embedding and indexing errors [p.246], and to
  re-run relevance and efficiency as the store grows [p.245].
- **`aiagents-learning-strategy`** — §9 is the proof obligation that skill's loop incurs. If you choose
  a reinforcement loop there, you owe a reward-improvement curve with flat-stretch detection; if you
  mix paradigms, you owe cross-paradigm interaction tests [p.247].
- **`aiagents-single-vs-multi-agent`** — the planner metrics in §6 score tool selection against a
  per-scenario reference; splitting work across several agents multiplies the references you must
  maintain and the end-to-end scenarios in §10.
- **`aiagents-agent-fit-and-model-choice`** — a model swap is one of the two triggers that must re-run
  the whole suite [p.239]; the semantic-metric choice in §1b depends on the output modality your model
  choice implies.
- **`aiagents-observability-and-drift`** — this skill produces the offline instrument and its consistent
  source of truth for the key metrics [p.239]; that skill owns the running system, the signals it emits
  and drift over time. §11's antidote explicitly reaches for pilot-user and reviewer feedback, which is
  where the two meet.
- **`aiagents-agent-security`** — §4's adversarial generation and §5's deliberately corrupted sources
  overlap the security surface; threat modelling, guardrails and injection defence are decided there,
  not here.
- **`aiagents-probabilistic-behaviour-checks`** — consistency invariants, coherence over long
  dialogues, hallucination reduction and unexpected/out-of-distribution input handling build **on** the
  harness this skill designs. Coupling: the eval-case format and the per-run metric set chosen here fix
  what a consistency invariant can be asserted against — a case shaped without an expected final state
  leaves that sibling nothing to re-run three-to-five times. §7 notes only that the planner harness must
  exercise consistency; the methodology lives there.
- **`aiagents-release-gates-and-rollout`** — deployment thresholds, blocking gates, checklists and
  rollback consume this skill's metrics as their input. Coupling: whichever metrics this skill declares
  as the source of truth become the only numbers a release gate may block on — a property left
  unmeasured here cannot be gated there. Do not set a release threshold from this skill; it
  deliberately fixes none.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 2, с. 43–44 и с. 61–63; глава 9, с. 238–250.
KUs: ai-apps-ch02-p41-ku03, ai-apps-ch02-p41-ku17, ai-apps-ch09-p238-ku01, ai-apps-ch09-p238-ku02,
ai-apps-ch09-p238-ku03, ai-apps-ch09-p238-ku04, ai-apps-ch09-p238-ku05, ai-apps-ch09-p238-ku06,
ai-apps-ch09-p238-ku07, ai-apps-ch09-p238-ku08, ai-apps-ch09-p238-ku09, ai-apps-ch09-p238-ku10,
ai-apps-ch09-p238-ku11, ai-apps-ch09-p238-ku17, ai-apps-ch09-p238-ku18.
Deep reference: `references/knowledge-units.md`.
- Instrument anchor: «автоматизированные тесты не могут быть качественнее оценочных наборов и метрик,
  которые в них используются» [p.249].
- Minimum-bar anchor: «непротестированный агент — ненадежный агент» [p.44].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] Boundary clause routes to `aiagents-probabilistic-behaviour-checks` and
  `aiagents-release-gates-and-rollout` instead of absorbing them?
- [x] All 15 consumed KUs are `verified: true` — no partial-KU exclusions were required?

## Examples
- «С чего начать оценку агента поддержки — какие метрики брать?» → goals first (the measurable outcomes
  you want), then cases for the high-priority scenarios, then a *combination*: quantitative
  (correct-result share, response time, precision/recall, scalability), qualitative (satisfaction), and
  semantic-similarity measures instead of exact match for the text output — with the explicit note that
  the book fixes no numeric targets.
- "How do I write one eval case for an agent that calls tools?" → three parts: the world state, the
  dialogue history, and an expected final state holding both the expected `tool_calls` with parameters
  and the phrases the final message must contain; that single case then exercises reasoning, context→tool
  matching and the confirmation at once.
- «Полнота выбора инструментов упала, точность держится — что сломалось?» → the book reads low recall as
  a likely sign the required action was never performed at all, and low precision as more probably a
  task-understanding miss — but tentatively; treat it as a defect *class*, then test the edge cases,
  missing fields and tool failures listed for that level.
- "Our memory module passes read-back tests but the agent still answers with stale preferences" →
  correctness is only one of four dimensions; add relevance (stale and surface-similar retrievals),
  efficiency under load with easy/hard retrieval scenarios, and robustness (DB unavailable, corrupted
  data, version migration), and score retrieval with `retrieval_accuracy@k`.
- «Как тестировать инструмент агента — хватит ли проверки правильного результата?» → no: cover ambiguous,
  rare and plainly-wrong scenarios, vary input formats and network conditions, score latency, resource
  use and error handling, assert determinism unless stochasticity is by design, mock external
  dependencies to reproduce the rare catastrophic cases, and re-run the full set on every change.
- "Offline numbers are excellent, production is bad" → the two named self-deception modes: an
  unrepresentative scenario set, and metric overfitting (BLEU/exact-match tuning breeding stereotyped
  answers). The remedy is to make evaluation a live process — grow the sets for new functionality, real
  user behaviour and emerging failure modes, and pull in reviewer and pilot-user feedback.
- «Что запускать в CI, а что смотреть руками?» → automate on every commit and every model update against
  a single consistent source of truth for the key metrics; keep sampled human review for the
  poorly-understood and critical areas, and let expert review calibrate the automated scores.
