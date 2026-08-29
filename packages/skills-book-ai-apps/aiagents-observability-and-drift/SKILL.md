---
name: aiagents-observability-and-drift
description: >
  INSTRUMENT a live agent and DETECT drift: which metrics to collect at the infrastructure /
  workflow / output-quality / user-feedback levels and what action each one triggers, the KPI
  alert thresholds (error rate, P99 latency, resource use, output-anomaly score, state-consistency),
  the telemetry stack choice (OTel + Grafana/Loki/Tempo vs ELK vs Phoenix vs SigNoz vs Langfuse),
  span instrumentation of agent nodes and trace↔log correlation, dashboard panels and alert
  escalation routes, PII scrubbing at the export boundary, the three distinct drift tests
  (Колмогоров — Смирнов, KL-дивергенция, PSI) with the book's own readings, the behavioural
  drift indicators and the response ladder, plus RACI ownership of agent metrics.
  Production telemetry + drift detection ONLY — NOT designing eval sets, judges and metrics before
  ship (→ `aiagents-evaluation-design`); NOT release-readiness gates or shadow / canary / blue-green /
  A-B rollout on live traffic (→ `aiagents-release-gates-and-rollout`); NOT the improvement loop that
  consumes these signals — detection → root-cause analysis → prompt optimization → backlog
  (→ `aiagents-improvement-loops`); NOT deciding whether one bad run is a systematic failure or
  legitimate probabilistic variation, nor the consistency / coherence / hallucination /
  unexpected-input checks behind that call (→ `aiagents-probabilistic-behaviour-checks`) — the
  running system those verdicts feed is here; NOT generic non-agent monitoring (→ `observability`,
  `observability-testing-patterns`, `metrics-dashboard`, `canary-watch`); NOT hardening the agent
  against attackers or threat-modelling it (→ `aiagents-agent-security`).
  Triggers (RU+EN): "что мониторить у агента в проде", "какие метрики собирать для агента",
  "агент деградировал, а ошибок в логах нет", "как поймать дрейф входных данных",
  "какой порог оповещения по галлюцинациям", "KS-тест, KL-дивергенция или PSI",
  "OTel-спаны для узлов агента", "Grafana или Langfuse для агента", "PII в трассировках агента",
  "чей это дашборд — продукта, ML или SRE", "what should I instrument on a production agent",
  "detect input drift on an LLM agent", "alert thresholds for hallucination rate",
  "my agent quality is slowly degrading with no errors", "correlate agent traces with logs".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch10-p257-ku01, ai-apps-ch10-p257-ku03, ai-apps-ch10-p257-ku04, ai-apps-ch10-p257-ku05, ai-apps-ch10-p257-ku06, ai-apps-ch10-p257-ku07, ai-apps-ch10-p257-ku08, ai-apps-ch10-p257-ku11, ai-apps-ch10-p257-ku12, ai-apps-ch10-p257-ku13, ai-apps-ch10-p257-ku14, ai-apps-ch10-p257-ku15, ai-apps-ch10-p257-ku16, ai-apps-ch12-p310-ku16]
---

# Observability & drift — make a silent agent degradation visible, and make the visible signal act

## Output
A production observability design that lands in an ADR, an architecture step or a code review:
the metric set chosen per level (infrastructure / workflow / output quality / user feedback) with the
action each metric is supposed to trigger; the KPI alert thresholds and their escalation routes;
the telemetry backend decision and the span/log/trace layout with a correlation key; the privacy
controls applied at the export boundary; the drift-detection plan — which of the three statistical
tests applies to which signal, at what reading, and what the behavioural response ladder does next;
and a RACI line per metric so no signal is orphaned between product, ML and SRE.

## When to use / NOT
- Use when: an agent is going to production and you must decide what to instrument; the agent
  "works" but quality is sliding with no errors in the logs; you are choosing between extending an
  existing monitoring stack and adopting an agent-specific one; you need alert thresholds that fire
  on agent-shaped failures rather than on CPU; user language or an upstream API has shifted and you
  need a numeric drift criterion; telemetry carries user content and you must scrub it without going
  blind; nobody can say whose dashboard owns planning latency.
- NOT for: designing the eval set, the judge and the success metrics *before* release
  (→ `aiagents-evaluation-design`); deciding a version is shippable, or rolling it out safely — shadow
  mode, canary, blue-green, live-traffic experiments (→ `aiagents-release-gates-and-rollout`); the
  improvement loop that turns a detected regression into a root cause, a prompt change and a backlog
  item (→ `aiagents-improvement-loops`); classifying a single bad run as a systematic failure versus
  legitimate probabilistic variation, and the consistency / coherence / hallucination /
  unexpected-input checks behind that call (→ `aiagents-probabilistic-behaviour-checks`); generic
  service or web observability with no agent semantics (→ `observability`, `observability-testing-patterns`, `metrics-dashboard`,
  `canary-watch`); defending the agent against attackers, prompt injection or abuse
  (→ `aiagents-agent-security`, and for non-agent systems → `security-audit`, `security-testing`).

## Decision criteria

### 1. Why an agent needs its own observability, and what the telemetry is FOR (KU: ch10-p257-ku01)
The book's opening position: shipping the agent is half the job, and the real examination starts where
stakes are high and the environment changes unpredictably [p.257]. An exhaustive test suite cannot be
written, because the agent is probabilistic, depends on a foundation model, chains tool calls and
accepts unbounded input [p.257].

What ordinary monitoring misses — three failure shapes that never crash anything [p.258]:
- a tool returned no error yet set off a cascade;
- an LLM answer reads coherently and still misleads;
- a plan half-executed and lost the goal it started from.

Because these rarely take the system down, production observability becomes close to obligatory [p.258].
Failure causes differ in nature — code defects, foundation-model variation, architectural limits — and
each wants its own detection, analysis and repair route [p.257].

**Turn operation into tests** — the loop the book prescribes [p.258, p.272]:
1. Save every production failure as a scenario and convert it into a regression test [p.258].
2. Keep successful runs of hard cases too — such a trace may become a "golden" path worth preserving [p.258].
3. Export both into the test set, so a living CI/CD corpus accumulates that reflects real conditions [p.258].
4. Automate the export: failure traces out of Tempo, logs out of Loki, into the test set — a continuously
   refreshed regression corpus [p.272].
5. After a fix lands, re-running the same trace has to pass [p.272].

The claimed effect is a shift-left of the monitoring strategy: problems are caught earlier and each new
agent version is checked against the actual behavioural complexity seen in production [p.258]. The book
gives no quantitative rule for *which* traces earn a place in the corpus.

### 2. WHICH metrics to collect, and the action each one owes you (KU: ch10-p257-ku04)
Effective monitoring starts by picking metrics that show both that the system is alive and that its
behaviour still matches the intent [p.260]. Two layers of coverage: infrastructure signals — latency,
error share, CPU — and behavioural semantics — intent understanding, tool choice, hallucinations, task
abandonment [p.259]. The semantic questions are: was the user's intent read correctly, was the right
tool chosen, did the system produce hallucinated content, did the user drop the task midway [p.259].
Traditional monitoring was never built for those questions, yet without them you cannot show the agent
is still trustworthy, useful and aligned [p.259].

Restructured from табл. 10.1 [p.260-261] around one question — *what level am I diagnosing, and what
action does this metric trigger?* The action column is the book's own; nothing is inferred across rows:

| Level | Metric | What it exposes | Action the book pairs with it |
|---|---|---|---|
| Infrastructure | CPU / memory load [p.260] | viability and the need to scale [p.260] | autoscale, or optimise memory-hungry tools [p.260] |
| Infrastructure | Uptime / availability [p.260] | service availability and recovery after failure [p.260] | start incident response [p.260] |
| Infrastructure | Request latency, P50 / P95 / P99 [p.260] | whether response speed holds under load [p.260] | tune caching or retry logic [p.260] |
| Workflow | Task success rate [p.260] | how often the agent carries the intended flow to the end [p.260] | analyse the failures or update the prompts [p.260] |
| Workflow | Token usage across the flow [p.260] | how many tokens the whole flow consumes [p.260] | read a sharp jump — in either direction — as a defect symptom [p.260] |
| Workflow | Tool-call success / failure rate [p.260] | degraded integrations and misapplied tools [p.260] | patch wrappers, or automatic fallback [p.260] |
| Workflow | Breaches of user usage limits [p.260] | calls exceeding preset limits inside a time window [p.260] | adjust the limits or the call rate [p.260] |
| Workflow | Retry rate [p.260] | instability and brittleness of plans or tools [p.260] | remove needless retries or sharpen the planning logic [p.260] |
| Workflow | Fallback rate [p.260] | failures in the primary workflows [p.260] | raise error tolerance or escalate [p.260] |
| Output quality | Token usage, input vs output [p.260] | verbosity, cost and generation efficiency [p.260] | truncate long prompts or change the model tier [p.260] |
| Output quality | Hallucination indicators [p.261] | semantic accuracy of what was generated [p.261] | introduce a reference confidence level or an LLM critic [p.261] |
| Output quality | Deviation from the baseline [p.261] | distribution shifts in input or in task phrasing [p.261] | adjust the flows, or fine-tune the model [p.261] |
| User feedback | Repeat-query / rephrasing rate [p.261] | whether the agent understood on the first attempt [p.261] | improve intent classification [p.261] |
| User feedback | Task-abandonment rate [p.261] | flows that confuse or irritate [p.261] | simplify the flow, or add clarifying prompts [p.261] |
| User feedback | Explicit ratings (like / dislike) [p.261] | a qualitative read on how useful the system is [p.261] | prioritise results for evaluation [p.261] |

One transport carries every row: emit through OpenTelemetry, accumulate in Prometheus or Loki, display
as Grafana panels, and where it is meaningful stitch the record to a Tempo trace [p.261]. The stated aim
is *not* to collect everything, but only what lets you notice a meaningful change and diagnose it
quickly [p.261]. The table fixes no target values or thresholds — only purpose and an example action.

> Source caveat carried over from the KU: on p.260 табл. 10.1 was linearised in the PDF (the row-group
> labels print before the header row and the feedback group moved to p.261), so the level assignment of
> three rows — input/output token usage, hallucination indicators, deviation from the baseline — was
> reconstructed from reading order and may differ from the original layout.

### 3. Alert THRESHOLDS: the five agent KPIs (KU: ch12-p310-ku16 — `partial`)
Chapter 12 supplies what табл. 10.1 deliberately omits — concrete firing points, so that monitoring works
as early warning for internal failures [p.335-336]. These five numbers are the book's own facts:

| KPI | What is measured | Alert threshold [p.336] |
|---|---|---|
| Error rate | share of failed tasks and hallucinations — a wrong result on a valid input | above 5 % over a rolling hour |
| Response latency | response time: the mean plus P99 | longer than two seconds on critical operations — a sign of a bottleneck or overload |
| Resource consumption | CPU, GPU and memory use | 80 % sustained load |
| Output-anomaly score | quality deviation via drift-detection models, e.g. semantic similarity to the expected output | a score below 0,85 |
| State-consistency check | count of race conditions and synchronisation failures | alert immediately on any non-zero value in a multi-agent configuration |

Implementation named alongside them: Prometheus collects, Grafana visualises, and an AI-based anomaly
detector (the book names Evidently AI) predicts a failure before a threshold is crossed [p.336].
Adjacent signals in the same loop: real-time logs, error reports and performance metrics under continuous
watch; liveness checks — periodic automated tests of the agent's core functions; and self-assessment
signals through which the agent reports ambiguous instructions, incomplete data and conflicting
goals [p.335-336].

On tuning: the book describes setting thresholds with the operating context and workload peaks in mind as
what simultaneously cuts alert fatigue and keeps intervention timely when a misconfiguration or an
emerging behaviour appears [p.336]. Treat these five values as the book's stated numbers, not as
guaranteed defaults — the source neither declares them universal nor calls them starting points.

> **Excluded from this KU (`verified: partial`):** its `limits` field asserted that the book *requires*
> context-and-peak-aware threshold setting. The source only describes the benefit of doing so. The
> requirement modality is dropped; the described benefit above is what remains.

### 4. Telemetry PRIVACY at the export boundary (KU: ch10-p257-ku03)
Observability data routinely carries sensitive content — user messages, tool inputs, intermediate LLM
generations [p.259]. Readiness criteria, keeping the book's own modality:

- [ ] Telemetry lives in a **separate** monitoring circuit whose entrance is closed by role-based access
      control (RBAC) — stated by the book as a requirement, not a suggestion [p.259].
- [ ] The sensitive slice goes to an isolated backend — encryption at rest plus access auditing — and you
      have verified that debugging and performance analysis are still possible: privacy must not be bought
      with blindness, or the price becomes user trust or regulatory compliance [p.259].
- [ ] Personal data (PII) is removed from the journals before export — redacted, hashed or masked — which
      the book presents as a frequently applied practice [p.259].
- [ ] The scrubbing hangs on the OpenTelemetry export interceptors, so the control sits at the
      application boundary itself and works factor by factor rather than all-or-nothing [p.259].

The book lists these practices without giving a data-classification scheme or criteria for what counts
as PII — decide that yourself.

### 5. WHICH stack, and what each backend is for (KU: ch10-p257-ku05, ch10-p257-ku07)
**Starting rule** [p.259, p.261, p.265]: open-source stacks are comparable in capability, so begin by
auditing what you already run. An agent does not need a separate monitoring stack — it benefits from the
same rigour and visibility as any critical service, and a Prometheus already watching service viability
can watch agent success rate too [p.259]. If an enterprise solution is in place (Splunk, Datadog,
New Relic), extend it with OTel instrumentation for agent signals rather than build a parallel
stack [p.261, p.265].

**Exceptions that justify a specialised tool** [p.265]: you need foundation-model-specific auto-evaluations
→ Langfuse or Phoenix; you need advanced search → ELK; the project is greenfield with no constraints →
Grafana or SigNoz give broad coverage. The book proposes weighing options by team experience, data volume
and integration needs, and allows hybrids such as OTel feeding several backends [p.265].

Restructured from табл. 10.2 [p.265] and the walkthroughs on [p.262-265] around one question — *what
dominates for me?*

| If this dominates… | Stack | What you pay |
|---|---|---|
| Composability, non-standard visualisations, an enterprise circuit | Grafana + Loki/Tempo [p.265] | more components to manage [p.265]; Loki and Tempo are administered separately and the entry bar is higher for non-infrastructure teams [p.262] |
| Large-scale logs, search and analytics | ELK stack [p.265] | higher resource consumption [p.265]; Elasticsearch is memory-hungry and deployment gets harder across several services [p.263] |
| Iterative development, debugging and LLM evaluations | Arize Phoenix [p.265] | limited production scale [p.265]; scope narrowed to traces and evaluations — it does not replace full logs and metrics [p.263-264] |
| A startup or ML team wanting one lightweight tool | SigNoz [p.265] | less extensibility [p.265]: fewer plugins, functional but not advanced visualisations [p.264] |
| Semantic monitoring and foundation-model / agent evaluations | Langfuse [p.265] | narrowed infrastructure coverage [p.265]: weak on metrics such as CPU load, needs Prometheus alongside [p.265] |

For the chapter's own examples the authors pick OTel + Grafana + Loki + Tempo as a composable open-source
base with no technology lock-in [p.266].

**Role split inside that base** [p.267-269]:
- **Tempo** — the tracing backend. Every span configured in LangGraph (tool call, plan generation,
  fallback firing) joins a distributed trace; Tempo stores them scalably and supports deep queries [p.267].
  The book's sample selections: all traces where planning took more than one and a half seconds, or where
  a specific tool failed with a given error code [p.267].
- **Loki** — the log aggregation layer, collecting structured output (typically JSON) from across the
  agent's infrastructure [p.267]. Any graph node can emit structured journal events while it runs: a user
  request arrived, a tool was called, an LLM answer came out ambiguous, the fallback path engaged [p.267].
- **Grafana** — the visualisation layer: Loki logs and Tempo traces explored side by side, live dashboards,
  drill-down into individual requests, and structured logs tied to performance metrics [p.268].

**The correlation key** — tag journal records with span and trace identifiers, so the logs and traces of
one user session or one agent flow are found together [p.267]. Because logs and traces share metadata such
as request or session ids, you can jump from an anomalous spike in the logs straight to the trace that
explains it [p.269]. Trace selection in Grafana works by latency, status, span name and any custom
attributes hung on the LangGraph nodes — particularly useful when unpicking multi-step behaviour and
edge-case errors [p.268].

**When Loki is not enough**: for full-text search, role-scoped views or heavier stream ingestion, the book
points at Elasticsearch or the commercial journals of Datadog or Honeycomb [p.268]. Together OTel + Tempo
+ Loki + Grafana are presented as a complete open-source observability stack enabling deep behavioural
analysis, fast root-cause search, historical trend assessment and proactive anomaly detection [p.268].
The book fixes no label schema and no retention policy.

### 6. HOW to instrument — spans on the agent's nodes (KU: ch10-p257-ku06)
Without good signals built into the agent's own execution environment, investigation proceeds by
guesswork [p.266]. LangGraph is convenient because it is a graph of asynchronous function calls where each
vertex is one functional step of the flow — planning, a tool call, an LLM response generation; the steps
are already isolated and explicitly declared, so attaching spans is straightforward [p.266]. The trace then
records not only start and end times but the purpose of the step and its result [p.266]. Distributed trace
context propagates between asynchronous calls automatically, so end-to-end behaviour stays visible even in
branching flows [p.266], and the entry bar is low — no serious architectural rework is needed [p.266].

Order of work [p.266-267]:
1. Initialise the Python OTel SDK **once** at process start; per-node re-initialisation is unnecessary [p.266].
2. The book's per-node recommendation: open the span on the function's first line, and let an ordinary
   context manager handle opening and closing [p.266].
3. Annotate the span with relevant metadata — the book gives examples by node type, phrased as what *may*
   be stored [p.266]:
   - tool-call node: tool name, invoked method, response latency, success/failure status, known error codes;
   - LLM generation node: prompt identifiers, token counters, model latency, hallucination-risk flags or
     confidence scores.
4. Beyond attributes, three further things may go into a span: events (a fallback fired, a retry started),
   a nested subspan timing each child API call, and exception capture so the error marks itself [p.267].
5. Traces are not the whole output — the same SDK emits structured logs and runtime metrics: a call counter
   per individual tool, the average response of the planning node, the share of failed tasks broken down by
   model version [p.267].

**Granularity is its own design decision**: too much detail degenerates into noise, too little blocks
root-cause search [p.267]. The book's rule is to attach to each step the minimum context that suffices for
analysis — user-request id, session metadata, configuration state, skill name, evaluation signals — so the
evidential trail stays coherent, complete and searchable [p.267]. No telemetry-overhead budget is given.

The chapter's example — wrapping a LangGraph node in a span (verbatim from the book; source caveat: the
Python indentation was lost in the typesetting, so the `with` and `async def` bodies print unindented) [p.266-267]:

```python
from opentelemetry import trace
tracer = trace.get_tracer("agent")

async def call_tool_node(context):
with tracer.start_as_current_span("call_tool", attributes={
"tool": context.tool_name,
"input_tokens": context.token_usage.input,
"output_tokens": context.token_usage.output,
}):
result = await call_tool(context)
return result
```

### 7. DASHBOARD panels, alert rules and escalation (KU: ch10-p257-ku08)
An instrumented agent already streams logs and traces, but the signals still have to become actions even
when nobody is watching the dashboard [p.268, p.270].

**Panels named by the book as an example set** [p.269]:
- [ ] tokens per agent per hour — catches a verbosity regression in the model;
- [ ] P95 latency, split across tool calls and planning nodes;
- [ ] share of tasks carried to completion, broken down by flow and prompt-template version;
- [ ] how often the fallback engages, by specific tool and skill;
- [ ] drift: similarity of user-query embeddings over time.

The GenAI Observability dashboard (рис. 10.1), the book's illustration, shows request rates to the
foundation model and to the vector database, successful-request counters, cost totals and averages, token
consumption, request-duration distribution, most-used models, and a breakdown by platform, type and
environment [p.269].

**Alert rules — the book's example firing points (facts)** [p.270]:
- [ ] «Частота галлюцинаций превышает 5 % за последние 30 минут» [p.270];
- [ ] «Циклы повторных попыток происходят чаще трех раз за один сеанс» [p.270];
- [ ] the mean reaction time of a critical tool has grown by more than 50 % [p.270].

**Routing and escalation** [p.270]:
- [ ] a threshold can be set on any metric, with the alert going to email, PagerDuty or another
      integration (source caveat: the channel list prints "Stack", where Slack is meant) [p.270];
- [ ] for serious problems, integrate an incident-management system (PagerDuty) so a structured response
      process starts — automatic notification and acknowledgement of receipt [p.270];
- [ ] for errors in the agent's own code, add Sentry: stack traces and health metrics complement the
      Grafana dashboards, and the SDK integrates easily into OTel [p.270];
- [ ] the all-in-one alternative is AgentOps.ai — tracing, metrics, evaluations and alerting in one package
      aimed at foundation models and agents, with semantic monitoring and lower setup cost, at the risk of
      technology lock-in [p.270].

These thresholds are given as example firing situations [p.270]; the book supplies no calibration procedure
for your own system. Pair them with the §3 KPI table, which is the chapter-12 source of firing points.

### 8. USER FEEDBACK as an observability signal (KU: ch10-p257-ku11)
Logs, traces and metrics measure the system from inside; feedback adds the **external** axis — did the
agent hit what was actually expected of it [p.273].

Two signal types [p.273]:
- **implicit** — the user rephrased the input, refused to continue the task, hesitated mid-interaction;
- **explicit** — a "dislike" marker, a low star rating, a free-form comment.

How to wire them in, keeping the book's modality [p.273]:
1. Implicit metrics — task-completion refusal, repeat query — run through the same tract as any performance
   metric: log, accumulate in Loki, panel in Grafana. Their value is the early signal that the user is
   stuck or was not understood [p.273].
2. An explicit event such as a low rating **may** be attached to its own Tempo trace, and a spike of
   negativity may raise an alert [p.273].
3. A panel placing sentiment next to the technical picture from the traces **lets** you fold a performance
   dip and user dissatisfaction into a single view of agent health [p.273].
4. Closing the improvement loop: low-rated traces **may** be exported straight into the evaluation set for
   later analysis [p.273].
5. Mass cancellations: if a large number of users abandon some flow at once, it **may be worth** revisiting
   the planning strategy or re-training the foundation model's prompt [p.273].

Both signal types are described as producing real-time data [p.273]; this section offers no way to separate
noise from a meaningful rating spike.

### 9. DRIFT: three different tests — do not merge them into one score (KU: ch10-p257-ku12, ch10-p257-ku13, ch10-p257-ku14)
The book gives three separate statistical instruments. They test different things, apply to different data
shapes, and each carries its own reading. Combining them into a single "drift score" discards exactly the
information that tells you what moved.

| Test | What it compares | Data shape the book applies it to | The book's reading |
|---|---|---|---|
| **Колмогоров — Смирнов (КС)** [p.274] | empirical distribution functions of two samples — the maximum vertical distance between them, plus a p-value of significance; no normality assumption needed [p.274] | continuous features of the agent's input and results: query length, latency, numeric metrics [p.274] | «такие пороги, как КС > 0,1 (часто в сочетании с p-значением < 0,05), означают содержательное отклонение» [p.274], and that raises a possible-drift alert on input or on the agent's results [p.274] |
| **KL-дивергенция (Кульбак — Лейблер)** [p.274] | two probability distributions, used for shifts in the token distribution; **asymmetric** — KL(P‖Q) ≠ KL(Q‖P), where Q is the current data and P the historical baseline [p.274] | word/token frequencies at the agent's input — conceptual drift, a shift in user language or new terminology [p.274] | the larger the value, the stronger the drift; the book's landmark is that «>0,5 может указывать на концептуальные изменения в эмбеддингах» [p.274] |
| **Индекс стабильности выборки (PSI)** [p.275] | percentage distributions of a historical against a current set, often pre-bucketed for detail; no normality assumption required, which is why it suits agent metrics such as call frequencies [p.275] | categorical or grouped agent data: tool-use categories («возврат средств», «отмена», «изменение»), call frequencies [p.275] | PSI < 0,1 — stability; 0,1–0,25 — minor drift, monitoring is enough; > 0,25 — serious drift needing intervention, for example re-training [p.275] |

Read the table by row only. The columns pose the same three questions of each test; the book does not claim
the three tests agree, corroborate each other, or can be substituted for one another.

**Two source inconsistencies you must know before wiring thresholds:**
- **PSI has two different meanings in one chapter.** The triage material on [p.259] uses input drift by
  PSI **> 0,1** as the trigger for remediation (re-training or installing guardrails), while the scale on
  [p.275] puts 0,1–0,25 at monitor-only. Pick one deliberately and write it down; the book does not
  reconcile them.
- **KL likewise carries two readings.** The triage material treats a divergence **< 0,2** from baseline as
  expected variation [p.258], while the drift section names > 0,5 as a conceptual-change landmark [p.274].
  The band between them is undefined by the book.

**PSI formula caveat:** the prose describes summing the natural logarithm of the ratio
`actual_percent / expected_percent`, while the code multiplies that logarithm by the difference of the
shares. The text is incomplete — follow the code [p.275].

The book's code, verbatim (source caveat: function- and `if`-body indentation was lost in typesetting; in
the КС listing the comment «# Новые данные» slipped one line below the array it describes) [p.274-275]:

```python
import numpy as np
from scipy import stats
# Исторические и текущие длины запросов (например, в символах)
historical = np.array([10, 15, 20, 12]) # Базовые данные
current = np.array([25, 30, 28, 35])
# Новые данные
ks_stat, p_value = stats.ks_2samp(historical, current)
if ks_stat > 0.1:
print(f"Обнаружен дрейф: KS statistic = {ks_stat}")
```

```python
import numpy as np
def kl_divergence(p, q, epsilon=1e-10):
p = p + epsilon
q = q + epsilon
p = p / np.sum(p)
q = q / np.sum(q)
return np.sum(p * np.log(p / q))
# Векторы частот токенов (например, счетчики [word1, word2, ...])
historical_tokens = np.array([0.4, 0.3, 0.3])
current_tokens = np.array([0.2, 0.5, 0.3])
kl = kl_divergence(historical_tokens, current_tokens)
if kl > 0.5:
print(f"Обнаружен концептуальный дрейф: KL = {kl}")
```

```python
import numpy as np
def psi(expected, actual):
expected_percents = expected / np.sum(expected)
actual_percents = actual / np.sum(actual)
psi_values = ((actual_percents - expected_percents) *
np.log(actual_percents / expected_percents))
return np.sum(psi_values)
# Счетчики использования инструментов (например, ['refund', 'cancel', 'modify'])
historical = np.array([50, 30, 20])
current = np.array([20, 50, 30])
psi_value = psi(historical, current)
if psi_value > 0.25:
print(f"Сильный дрейф: PSI = {psi_value}")
elif psi_value > 0.1:
print(f"Слабый дрейф: PSI = {psi_value}")
```

KL's computation in words: normalise the frequency vectors into probabilities, add a small correction
against log(0) errors, then sum P × log(P/Q) [p.274].

### 10. BEHAVIOURAL drift indicators and the response ladder (KU: ch10-p257-ku15)
Distribution shifts arise from evolving user language, new product terminology, changed API responses, or
an update to the foundation model itself — and they rarely produce an explicit error [p.273]. Drift shows
up as falling performance, misaligned results and a rising fallback rate [p.273-274]. The first line of
defence is a dashboard putting task success rate, tool-call failures and semantics — token-spend dynamics,
hallucination frequency — side by side [p.274].

**Numeric indicators named by the book (facts)** [p.276]:
- correct-result share unexpectedly sags: > 5…10 % inside a rolling 24-hour window;
- task-completion refusals climb above 15 %;
- retries throw an outlier: > 20 % per session.

**Embedding method**: cosine similarity of current query vectors against historical ones, where a mean
similarity **< 0,8** triggers review; the book notes this is often implemented with libraries such as
Evidently AI, with alert automation into Grafana [p.276].

**The response ladder** [p.276]:
1. **Temporary change** → adjust thresholds or update the parsing logic.
2. **Long-term shift** → re-train the workflows or adapt to new APIs; the decision hinges on how critical
   the shift is by the static metrics — the book's own example is to prefer re-training when a PSI value
   above 0,25 persists for more than 48 hours.
3. **Telling temporary from systematic** — feedback loops help: keep the journal and export degraded traces
   for analysis; fixes can be checked with A/B testing.

Treat every indicator above as a trigger for investigation, not as proof of drift: the book calls them
potential signs of input or conceptual drift [p.276]. Step 3's A/B check belongs to
`aiagents-release-gates-and-rollout`, and turning the exported traces into a root cause and a prompt
change belongs to `aiagents-improvement-loops`; stop this skill at the point where the degraded traces
are exported.

### 11. WHO OWNS which metric — RACI and cross-functional observability (KU: ch10-p257-ku16)
In traditional stacks metric ownership is partitioned: infrastructure holds latency and uptime, product
holds conversion and user success, ML teams hold the models [p.276]. Foundation-model agents do not respect
those borders [p.276].

**Where the borders actually fall** [p.276]: a model's answer is not the model's artifact, it is the
product; a long chain of tool calls, retries, fallbacks and generations is not a backend quirk, it is the
user experience; a five-second plan-generation delay is frequently caused by a prompt or a flow-design
decision made in the product team, not by a model limitation. Hence the rule: agent logs, traces and
evaluation signals live on the common observability platform next to system metrics [p.276]. If agent
metrics are visible only in product dashboards and model notebooks, the whole picture and part of the
systematic problems are lost [p.276-277].

**The telling case is latency** [p.277]: teams take it on faith that foundation models are slow, and
inadvertently bake latency into everything else — over-detailed prompts, superfluous retries in bloated
plans. Without rigorous trace instrumentation that bias stays invisible, and the system is slow not
because the infrastructure is bad but because the delay was assumed inevitable.

**The remedy is shared dashboards, not handing responsibility to one team** [p.277]: product managers see
how planning latency and fallback rate connect to task abandonment; ML engineers watch hallucination rates
and drift in the feedback; infrastructure and security get alerts on token-spend peaks and tool
instability.

RACI, as the book defines it [p.277]: R (Responsible) does the work, A (Accountable) owns the outcome,
C (Consulted) supplies input, I (Informed) receives information. Restructured from табл. 10.3 [p.277]
around *who owns the metric and who works on it* — the book presents the table as a template, not a
prescription [p.277]:

| Metric | Owner (A) | Does the work (R) | Consulted / informed |
|---|---|---|---|
| Latency (planning, tool calls) | product — for the user impact [p.277] | ML (optimises prompts and models) and infrastructure/SRE (monitors infrastructure problems) [p.277] | product consulted on UI thresholds, infrastructure on scaling; ML informed of regressions [p.277] |
| Hallucination rates | ML [p.277] | ML — detection and remediation via evaluations [p.277] | product supplies feedback context and is informed of trends; infrastructure informed when alerts are configured [p.277] |
| Task success rate | product — owns the goals [p.277] | product — defines the success criteria [p.277] | ML consulted on model improvement; infrastructure informed of the reliability impact [p.277] |
| Token usage and cost | infrastructure/SRE — owns budget and scaling [p.277] | ML (optimises generation) and infrastructure (tracks efficiency) [p.277] | product consulted on business impact; ML informed of outliers [p.277] |
| Distribution shifts (input drift) | ML [p.277] | ML — detection through embeddings and evaluations [p.277] | infrastructure consulted on data-pipeline stability; product informed of adjustments [p.277] |
| Fallback and retry rate | infrastructure/SRE — owns reliability [p.277] | ML — refines the planning logic [p.277] | product consulted on fallback UX; infrastructure informed of the patterns [p.277] |
| Feedback and sentiment | product [p.277] | product — aggregation and prioritisation [p.277] | ML consulted on model connections; infrastructure informed of operational signals [p.277] |
| Dashboard upkeep and prioritisation | ML [p.277] | ML — owns the platform and cross-disciplinary review [p.277] | product supplies product context, infrastructure supplies ML-linkage information [p.277] |

**Practices without which the scheme does not work** [p.278-279]:
- [ ] one shared observability dashboard carrying version tags and semantic metrics — instead of an
      argument over whose dashboard is more accurate [p.278];
- [ ] tag spans and logs with product context — feature flag, user tier, workflow id [p.278];
- [ ] establish cross-functional prioritisation rituals where product, infrastructure and ML review the
      telemetry together, especially after launches and major regressions [p.278];
- [ ] do not banish foundation-model latency to a tab separate from the other services: a slowdown the
      user feels is everybody's problem [p.279].

Diagnostic example: a trace where a tool is called four times in a loop, followed by a long generation, a
muddled answer and a user walking away, is a sign the product is broken rather than an implementation
detail — and it is visible only if logs and spans travel through the common platform instead of sitting in
isolated tabs [p.277-278]. Each team answers for its own slice of telemetry, but none can interpret the
data in isolation [p.277].

## Key facts & formulas
- Agent metric taxonomy — табл. 10.1 [p.260-261]; each row names a purpose and an example action, but no
  targets or thresholds.
- Latency is tracked at P50, P95 and P99 [p.260]; the example panel set uses P95 split across tool calls
  and planning nodes [p.269].
- Five chapter-12 KPI thresholds [p.336]: error rate above 5 % per rolling hour; response time longer than
  two seconds on critical operations (mean plus P99); resource use at 80 % sustained load; output-anomaly
  score below 0,85; any non-zero count of race conditions / synchronisation failures in a multi-agent
  configuration alerts immediately.
- Chapter-10 example alert rules [p.270]: hallucination rate above 5 % in the last 30 minutes; retry cycles
  more than three times per session; a critical tool's mean reaction time up by more than 50 %.
- Behavioural drift indicators [p.276]: correct-result share dropping by more than 5…10 % in a rolling
  24-hour window; task-completion refusals above 15 %; retries above 20 % per session; mean cosine
  similarity of query embeddings below 0,8 triggers review.
- КС (Kolmogorov–Smirnov): `stats.ks_2samp`; KS > 0,1, often with p < 0,05, marks a meaningful
  deviation [p.274].
- KL divergence: asymmetric, KL(P‖Q) ≠ KL(Q‖P), Q = current, P = historical baseline; > 0,5 named as a
  possible conceptual change in embeddings [p.274]; the triage material treats < 0,2 from baseline as
  expected variation [p.258]. Computation: normalise to probabilities, add an epsilon against log(0), sum
  P × log(P/Q) [p.274].
- PSI: < 0,1 stable, 0,1–0,25 minor drift needing only monitoring, > 0,25 serious drift needing
  intervention [p.275]; a PSI above 0,25 persisting more than 48 hours is the book's example trigger for
  re-training [p.276]. Elsewhere in the chapter PSI > 0,1 is used as an intervention trigger [p.259] — an
  unreconciled source inconsistency.
- ELK example query from the book: hallucination events with confidence below 0,7 across sessions [p.263].
  SigNoz example filter: `token_usage > 1000` to find inefficient operations [p.264].
- Tempo example selections: traces where planning exceeded one and a half seconds, or where a given tool
  failed with a specific error code [p.267].
- OTel instrumentation: SDK initialised once per process; span opened on the node function's first line via
  a context manager; span may carry events, nested subspans per child API call, and captured
  exceptions [p.266-267].
- Correlation: tag log records with span and trace ids so one session's logs and traces travel
  together [p.267, p.269].
- Anomaly-prediction tooling named: Evidently AI for drift/anomaly detection [p.276, p.336]; Elasticsearch
  ML jobs for anomaly search [p.263]; Sentry for agent code errors, AgentOps.ai as an all-in-one
  alternative [p.270].
- RACI template — табл. 10.3 [p.277], explicitly a template rather than a prescription.

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Treating release as the finish line and testing only pre-ship | The agent is probabilistic with unbounded input — an exhaustive suite cannot be written, so the real examination happens in production | ch10-p257-ku01 |
| Monitoring only infrastructure signals (CPU, errors, latency) | Agent failures are silent: a clean tool call that starts a cascade, a coherent but misleading answer, a plan that lost its goal | ch10-p257-ku01 |
| Fixing a production failure without turning it into a regression test | The regression corpus never grows, and the same failure returns on the next version | ch10-p257-ku01 |
| Collecting every signal you can emit | The stated aim is only what lets you notice a meaningful change and diagnose it fast; the rest is noise | ch10-p257-ku04 |
| Reading a token-usage drop as good news | The book reads a sharp jump in either direction as a defect symptom | ch10-p257-ku04 |
| Shipping telemetry that carries raw user content into the general monitoring circuit | Sensitive messages, tool inputs and intermediate generations need a separate RBAC-gated circuit and pre-export scrubbing | ch10-p257-ku03 |
| Buying privacy by dropping the fields debugging needs | Privacy must not become blindness — the scrubbing is factor-by-factor at the export interceptor, not all-or-nothing | ch10-p257-ku03 |
| Building a separate agent-only monitoring stack while an enterprise one already runs | Open-source stacks are comparable; the book's start rule is to extend what you have with OTel agent instrumentation | ch10-p257-ku05 |
| Choosing Langfuse and expecting full infrastructure coverage | Its infrastructure coverage is narrow — metrics such as CPU load need Prometheus alongside | ch10-p257-ku05 |
| Emitting logs and traces without a shared span/trace id | Nothing links the anomalous log spike to the trace that explains it | ch10-p257-ku07 |
| Re-initialising the OTel SDK per graph node | Initialisation belongs once at process start | ch10-p257-ku06 |
| Instrumenting at maximum detail everywhere | Excess detail degenerates into noise; the rule is minimum sufficient context per step | ch10-p257-ku06 |
| A dashboard with no alert thresholds behind it | Signals must act even when nobody is looking at the dashboard | ch10-p257-ku08 |
| Copying the book's example thresholds as if calibrated for you | They are given as example firing situations; no calibration procedure is supplied | ch10-p257-ku08 |
| Treating the five chapter-12 KPI numbers as universal defaults | The source neither declares them universal nor calls them starting points | ch12-p310-ku16 |
| Ignoring implicit feedback because there is no rating widget | Rephrasing, abandonment and hesitation are real-time signals that the user is stuck or was misunderstood | ch10-p257-ku11 |
| Collapsing КС, KL and PSI into one "drift score" | They test different things on different data shapes and each carries its own reading | ch10-p257-ku12, ch10-p257-ku13, ch10-p257-ku14 |
| Running КС on categorical data such as tool-use categories | КС is for continuous features; the book routes categorical and bucketed data to PSI | ch10-p257-ku12, ch10-p257-ku14 |
| Swapping the argument order in KL | The measure is asymmetric — KL(P‖Q) ≠ KL(Q‖P), so the order changes the result | ch10-p257-ku13 |
| Implementing PSI from the book's prose description | The prose is incomplete; the code multiplies the log ratio by the difference of the shares | ch10-p257-ku14 |
| Acting on a single drift indicator as if it proved drift | The indicators are potential signs — triggers for investigation, not evidence | ch10-p257-ku15 |
| Retraining on a one-off spike | The ladder answers a temporary change with threshold or parsing adjustments; retraining is the answer to a persistent shift | ch10-p257-ku15 |
| Keeping agent metrics only in product dashboards and model notebooks | The whole picture and part of the systematic problems are lost | ch10-p257-ku16 |
| Putting foundation-model latency on its own separate tab | A slowdown the user feels is a shared problem, and the assumption that models are simply slow hides prompt- and plan-induced delay | ch10-p257-ku16 |

## Related decisions
- **`aiagents-evaluation-design`** — the metrics, judges and success criteria you evaluate against are
  designed there; this skill consumes them at runtime. The traffic runs both ways: production failures and
  golden traces are exported into the evaluation set [p.258, p.272], and low-rated traces join it
  too [p.273]. If your eval set has no semantic metric, §2's output-quality level has nothing to display.
- **`aiagents-tool-design-and-selection`** — that skill *requires* per-invocation logging and alerting; this
  skill decides where that stream lands, what a tool-call span carries (tool name, method, latency, status,
  error codes [p.266]) and which thresholds fire on tool-call failure and fallback rates [p.260, p.270].
  A broader registered operation set produces a wider blast radius to watch here.
- **`aiagents-agent-security`** — shares the KPI KU (`ch12-p310-ku16`), which sits in the chapter on
  internal-failure defence. **Own the metric set, thresholds and alerting here**; take the perimeter,
  guardrails and threat model there. The state-consistency KPI (any non-zero race-condition count alerts
  immediately in a multi-agent setup [p.336]) is where the two meet.
- **`aiagents-single-vs-multi-agent`** — that state-consistency KPI only exists once you run more than one
  agent [p.336]; and the diagnostic pattern of a tool looping four times before a muddled answer [p.277-278]
  is a coordination symptom. Splitting into several agents adds a monitoring obligation this skill has to
  cover.
- **`aiagents-knowledge-and-memory`** — the drift embedding method needs query vectors and a historical
  baseline to compare against [p.276], and the dashboard tracks request rates to the vector
  database [p.269]. Your retrieval design determines what "baseline" even means here.
- **`aiagents-learning-strategy`** — the response ladder's step 2 escalates to re-training the workflows or
  the model when a shift persists (PSI above 0,25 for more than 48 hours [p.276]); whether re-training is
  the right instrument at all is decided there.
- **`aiagents-agent-fit-and-model-choice`** — a foundation-model update is one of the named causes of
  drift [p.273], and the share of failed tasks is broken down *by model version* [p.267]. Every model swap
  becomes a drift event this skill must be able to see.
- **`aiagents-release-gates-and-rollout`** — shadow mode, canary, blue-green and the A/B check that §10
  step 3 reaches for belong there, not here. Coupling: the thresholds and drift criteria fixed here are
  the numbers its promotion gates read, and its per-version traffic tagging is what makes the
  by-model-version breakdown [p.267] and the canary-vs-baseline comparison legible — instrument the
  version tag here or that comparison cannot be made there.
- **`aiagents-improvement-loops`** — turning a detected regression into a root cause, a prompt change and
  a backlog item is that skill's job. This skill stops at export of the degraded trace and the raised
  alert. Coupling: whatever this skill does not emit — an unlogged tool span, an ungrouped failure, a
  missing frequency reading — is missing from that loop's detector and its five-axis prioritisation input.
- **`aiagents-probabilistic-behaviour-checks`** — the triage rule that separates a systematic failure
  from legitimate run-to-run variation lives there; the running system its verdicts feed lives here.
  Coupling: a deviation it classes as in-bounds is logged rather than fixed, and that log is exactly the
  series §9's КС / KL / PSI tests later run over — widen its bounds and the drift signal here goes quiet.
- **`observability` / `observability-testing-patterns` / `metrics-dashboard` / `canary-watch`** — use those
  for service-level monitoring with no agent semantics; the metric levels above the infrastructure row and
  every drift criterion here are agent-specific.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 10, с. 257–270 и с. 272–279; глава 12, с. 335–336.
KUs: ai-apps-ch10-p257-ku01, ai-apps-ch10-p257-ku03, ai-apps-ch10-p257-ku04, ai-apps-ch10-p257-ku05,
ai-apps-ch10-p257-ku06, ai-apps-ch10-p257-ku07, ai-apps-ch10-p257-ku08, ai-apps-ch10-p257-ku11,
ai-apps-ch10-p257-ku12, ai-apps-ch10-p257-ku13, ai-apps-ch10-p257-ku14, ai-apps-ch10-p257-ku15,
ai-apps-ch10-p257-ku16, ai-apps-ch12-p310-ku16.
Deep reference: `references/knowledge-units.md`.
- Drift-criterion anchor: «такие пороги, как КС > 0,1 (часто в сочетании с p-значением < 0,05), означают содержательное отклонение» [p.274].
- Alert-rule anchor: «Частота галлюцинаций превышает 5 % за последние 30 минут» [p.270].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] The `partial` KU's flagged over-claim excluded and marked in place?
- [x] КС / KL / PSI kept as three distinct tests with their own readings?
- [x] Boundary clause routes rollout, improvement-loop and probabilistic-behaviour work to the sibling
      skills that own them instead of absorbing them?

## Examples
- «Выкатываем агента в прод — что вообще мониторить?» → four levels with an action per metric
  (infrastructure: CPU, uptime, P50/P95/P99; workflow: task success, tokens, tool-call success, limit
  breaches, retries, fallbacks; output quality: input/output tokens, hallucination indicators, baseline
  deviation; feedback: rephrasing, abandonment, explicit ratings), all emitted through OTel into
  Prometheus/Loki and shown in Grafana, with traces stitched in Tempo — plus the five chapter-12 KPI
  firing points and PII scrubbing on the export interceptors.
- "Our agent's answers are getting worse but nothing errors out" → that is the drift shape the book
  describes: falling task success, misaligned results, rising fallback rate. Check the behavioural
  indicators (correct-result share down more than 5–10 % over a rolling 24 h, abandonment above 15 %,
  retries above 20 % per session, mean query-embedding similarity below 0,8), then confirm numerically with
  the right test — КС for continuous features, KL for token frequencies, PSI for categorical tool-use — and
  climb the response ladder from threshold tuning to re-training.
- «KS, KL или PSI — какой брать?» → they answer different questions: КС compares empirical distribution
  functions of continuous features (KS > 0,1, often with p < 0,05); KL measures divergence of token
  frequency distributions and is asymmetric (> 0,5 flagged for conceptual change); PSI compares percentage
  distributions of categorical/bucketed data (< 0,1 stable, 0,1–0,25 monitor, > 0,25 intervene). Do not
  average them into one score, and note the chapter's two unreconciled PSI thresholds.
- "Which observability stack for an agent?" → start by auditing what you already run; if Splunk/Datadog/
  New Relic is in place, extend it with OTel agent instrumentation. Go specialised only for a named
  exception — Langfuse/Phoenix for foundation-model auto-evaluations, ELK for advanced search, Grafana or
  SigNoz for greenfield — and know each one's cost (Grafana: more components; ELK: resource-hungry; Phoenix:
  limited production scale; SigNoz: less extensible; Langfuse: thin infrastructure coverage).
- «Задержка планирования — это чей дашборд, продукта или SRE?» → by the book's RACI template product owns
  the latency outcome for user impact, ML and infrastructure/SRE do the work, and the metric lives on the
  shared platform with version tags and product-context labels on spans; keeping foundation-model latency
  on its own tab is exactly how prompt- and plan-induced delay stays invisible.
- "How do I log user telemetry without leaking PII?" → separate RBAC-gated monitoring circuit, isolated
  encrypted backend with access auditing for the sensitive slice, redaction/hashing/masking before export,
  hung on the OTel export interceptors so the control is factor-by-factor at the application boundary — and
  verify debugging and performance analysis still work afterwards.
