---
name: aiagents-release-gates-and-rollout
description: >
  Decide whether a new agent VERSION may be promoted at all and how much LIVE TRAFFIC it may see
  next: the deployment-readiness criteria and the blocking gates that stop promotion (quantitative
  thresholds on the relevant eval sets, stress and edge-case stability, structured component
  checklists, auto-block on a multi-step regression, explicit tech-lead / product approval after
  the pilot, escalation to a human on an ambiguous automatic result), then the exposure mechanism —
  RC / staging, теневой режим (shadow run on live input whose output never reaches the user),
  канареечное развертывание at a 1–5 % traffic slice with a version tag that makes the
  «канарейка против базы» comparison possible, blue-green, rolling, staged pilot expansion — the
  live-traffic experiment (a 50/50 A-B split with its four setup requirements and the
  agent-specific long-term-state trap, or an adaptive Bayesian bandit that reallocates traffic
  mid-flight), the measured trust signals that pay for each expansion step, and the revert /
  fallback path. Ship-or-hold and traffic-share decisions ONLY — NOT designing the eval set,
  the judges and the metrics whose numbers these gates read (→ `aiagents-evaluation-design`),
  NOT instrumenting the running agent, alert thresholds or the drift tests
  (→ `aiagents-observability-and-drift`), NOT turning a detected regression into a root cause and a
  fix (→ `aiagents-improvement-loops`), NOT org-wide authority, accountability and the compliance
  programme (→ `aiagents-org-adoption-and-governance`), NOT the autonomy level and the shape of a
  human handoff (→ `aiagents-human-in-the-loop`), NOT probing a deployed URL for HTTP / SSE /
  asset / console regressions after a deploy (→ `canary-watch`), NOT the statistics of an
  experiment — significance, sample size, confidence intervals, ship / extend / stop
  (→ `ab-test-analysis`), NOT the CI pipeline plumbing that executes the promotion
  (→ `github-actions`), NOT running the incident once production is already broken
  (→ `incident-response`).
  Triggers (RU+EN): "можно ли выкатывать эту версию агента", "какой процент трафика дать новой
  версии", "теневой прогон новой версии на живом трафике", "какие пороги должны блокировать
  релиз", "как быстро откатиться, если канарейка просела", "теневой режим или A/B для смены
  промпта", "агент спрашивает подтверждение — как гонять его в тени", "как расширять пилот
  с 50 человек на всю компанию", "многорукий бандит вместо фиксированного сплита 50/50",
  "readiness gate before promoting an agent version", "shadow mode for a new agent version",
  "what share of traffic should the canary get", "shadow vs A-B for a prompt change",
  "users get inconsistent chat history across variants", "roll back an agent version safely".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch02-p41-ku18, ai-apps-ch09-p238-ku16, ai-apps-ch10-p257-ku10, ai-apps-ch11-p280-ku16, ai-apps-ch11-p280-ku17, ai-apps-ch13-p340-ku04, ai-apps-merged-ku04]
---

# Release gates & rollout — decide what makes this agent version shippable, and how much real traffic it earns next

## Output
A promotion decision that lands in an ADR, a release plan or a code review: the readiness criteria
this version is judged against and the gates that block promotion when they are unmet; the exposure
mechanism chosen for it (RC/staging, shadow, canary, rolling, blue-green, staged pilot) with the
traffic share it starts at and the telemetry tagging that makes the comparison against the baseline
possible; if a live-traffic experiment is warranted, its design — fixed split or adaptive bandit,
the metric it moves, the assignment rule that protects long-lived agent state, and the qualitative
read alongside the numbers; the signals that must fire before the next expansion step; and the
revert path plus the in-run fallback behaviour, with an explicit statement of what this rollout
shape is structurally unable to observe.

## When to use / NOT
- **Use when:** deciding whether a new agent version, model swap, planning strategy or prompt
  template may be promoted at all, and what would block it; writing the deployment-readiness
  criteria and the gate list for an agent; choosing between a shadow run, a canary slice,
  blue-green, rolling updates and a live experiment; sizing the first traffic share and the rule
  for growing it; designing an A/B comparison of two agent variants and hitting the problem that
  the agent carries long-term per-user state; considering an adaptive bandit instead of a fixed
  split; expanding a pilot to a whole organisation and asking what has to be true first; planning
  the revert path and the agent's own fallback behaviour when a version degrades in production.
- **NOT for:** building the measuring instrument whose numbers these gates read — metric mix, eval
  set, per-component tests (→ `aiagents-evaluation-design`; this skill deliberately sets no
  quality metric of its own); instrumenting the live agent, choosing the telemetry backend, alert
  thresholds and the drift tests (→ `aiagents-observability-and-drift`); turning a detected
  regression into a root cause, a prompt fix and a prioritised backlog
  (→ `aiagents-improvement-loops`); the organisation-level rollout — authority, accountability,
  roles, audit and compliance obligations (→ `aiagents-org-adoption-and-governance`); designing the
  autonomy level and the human handoff itself (→ `aiagents-human-in-the-loop` — this skill only
  inherits the constraint that a shadow copy may not address the user); the probabilistic-behaviour
  checks a version owes before it reaches a gate — consistency, coherence, hallucination reduction
  (→ `aiagents-probabilistic-behaviour-checks`); probing a deployed URL after a release for HTTP,
  SSE, static-asset, console-error and performance regressions (→ `canary-watch` — that skill runs
  the post-deploy smoke check; this one decides how much traffic the new version is allowed and on
  what evidence); the statistics of an experiment — significance testing, sample-size validation,
  confidence intervals and the ship/extend/stop call (→ `ab-test-analysis`; this skill owns only
  the four setup requirements and the agent-specific assignment traps that come *before* those
  statistics are computed); the CI/CD pipeline that mechanically executes the promotion
  (→ `github-actions`); responding to an outage that has already happened (→ `incident-response`).

## Decision criteria

### 1. The readiness GATE — what makes a version promotable at all (KU: ch09-p238-ku16)
The book's starting position: readiness is a holistic assessment of whether the system can do its
job safely, consistently and effectively in real environments — passing the tests is not the same
thing [p.255]. Four elements, with the book's own modality kept:

| Element | What it holds [p.255] | Modality in the source |
|---|---|---|
| Deployment criteria | Quantitative performance thresholds on the relevant evaluation sets; demonstrated stability under stress and on edge cases; every workflow behaving as intended | «часто включают» — frequently, not always |
| Structured checklists | Every component — tools, planning, memory, learning, integrations — thoroughly tested and analysed; end-to-end integration tests passed; target latency and uptime requirements met; no critical or serious defects outstanding | teams «должны использовать» the checklists; the key criteria «могут включать» those items |
| Gates | Automated or human checks that **block** promotion to production when a requirement is unmet — a regression in the latest evaluation set, or a missing explicit approval from tech leads / product managers after a successful pilot or beta phase; configurable to escalate to human review when the automated result is ambiguous | the mechanism is named as critically important; the firing conditions are given as examples |
| After launch | A dependable process for shipping new versions, monitoring for regressions after launch, and the ability to revert quickly when something unforeseen appears; pilot monitoring of the variation seen in real conditions | stated as no less important |

**The book's worked example, and its scope** [p.255]: for its customer-support agent the deployment
criteria «могут включать» a floor of at least 95 % tool-selection completeness on the refund and
order-cancellation flows, together with automatic blocking of promotion if regressions appear in
multi-step tests such as an address change. That number is one possible criterion for that one
agent — the book does not present it as a universal bar, and this skill does not either. Set your
own figure from the instrument `aiagents-evaluation-design` builds.

**Two gate shapes to keep distinct**, both from the same page [p.255]: a gate can fail *closed*
(the requirement is unmet → promotion stops) or *escalate* (the automated result is ambiguous → a
human decides). Deciding which requirements deserve which shape is the design work here.

### 2. Pick the EXPOSURE mechanism (KU: ai-apps-merged-ku04, ch02-p41-ku18)
The book states exactly one ordering: the process **often begins** with a staging or RC (Release
Candidate) environment — an isolated, production-like configuration for catching problems early
with no consequence for users — and from there teams **may** apply shadow, canary, rolling
(incremental, instance by instance) or blue-green deployments [p.300]. Beyond that first step it
lists the mechanisms side by side; it does not rank them and does not draw an escalation ladder
from one to the next. The table below is an inventory, not a sequence:

| Mechanism | What the book says it does | Limit the book names for it |
|---|---|---|
| Staging / RC environment [p.300] | Isolated, production-like configuration; surfaces problems early without touching users | A controlled test environment often conceals how users really behave [p.300] |
| Shadow (теневой режим) [p.271, p.300] | An experimental build runs in parallel with the production one on the same input; its output is logged rather than delivered | Gives no signal about the user's reaction, since the result is never shown [p.271, p.301]; subtle shifts in the interaction may be missed — the book routes those to A/B [p.301]; agents that structurally need a human answer are a known difficulty [p.301] |
| Canary [p.271-272] | The new version is opened to a small share of real users while the rest stay on the baseline; reverting is immediate and cheap for users | — (none named here) |
| Rolling update [p.300] | Incremental replacement, instance by instance | — (none named here) |
| Blue-green [p.300-301] | Two identical environments; traffic switches only after the check passes, with zero downtime | — (none named here) |
| Staged pilot expansion [p.64] | From small-scale testing in a limited environment to full deployment, so problems are identified gradually without overloading the system or hurting users | The chapter describes no rollback mechanism for a failed stage [вывод экстрактора, зафиксировано в KU] |
| A/B on live traffic [p.301] | Live traffic split between control and variant; the user works with one of them and the metric difference is measured directly | See §5 — its own requirements and traps |

A dash means the book names no limit for that mechanism in the pages consumed here. An empty cell
is not evidence that the mechanism has none.

**The one routing rule the book itself states** [p.301]: when the change you are shipping shows up
as a subtle shift in the character of the interaction, a shadow run cannot see it — that is where
the book sends you to A/B testing. And shadow deployments **may be complemented** by blue-green or
canary schemes; the book presents that as compatibility, not as a required combination [p.300-301].

### 3. SHADOW mode — what it buys and what it demands (KU: ai-apps-merged-ku04)
**Mechanics** [p.271, p.300]: the candidate build processes the same input as the live system, in
parallel with it; only the production system's result reaches the user, while the shadow version's
output goes into a journal for analysis.

**What to compare** [p.271]: differences in tool choice, latency, token consumption, and
hallucination frequency. With OpenTelemetry you **can** instrument both agents and attach a shared
request identifier, so the shadow agent's logs and traces are labelled in Loki and Tempo and the
behavioural comparison becomes straightforward [p.271].

**Where it is especially useful** [p.271]: trial runs of new model versions, new planning
strategies, and new prompt-construction methods. It answers three questions about the new version —
how it performs on live traffic, what breaks in it, and what improves — while the data accumulates
continuously alongside normal operation [p.271].

**The four benefits the book names** [p.300-301]:
1. *Realistic verification* — the shadow system sees the full spectrum of genuine user behaviour and
   exposes divergences and emergent problems that a controlled test environment hides.
2. *Safe exploration* — bold improvements and architectural changes can be tried, because their
   errors, regressions and performance degradations never reach production use.
3. *Edge cases surface before the rollout* — rare and poorly predictable events land in the shadow
   copy's journal and get analysed: malformed user input, instructions with two readings, friction
   at the seams with external systems.
4. *Composability with rollout strategies* — shadow deployments **may be complemented** by
   blue-green or canary schemes, the latter giving incremental verification directly in production.

**The precondition without which the whole run is worthless** [p.301]: instrumentation good enough
to compare three layers at once — traces, outputs, and metrics (share of correct results, latency).
And every divergence found has to be adjudicated on its merits: was this an intentional behaviour
change, or a defect? A divergence log with no adjudication column is a shadow run that produced
nothing.

**The known difficulty — HITL-dependent agents** [p.301]: an agent that by design needs a human
answer (an action confirmation, say) cannot get one in shadow, because the shadow copy must stay
invisible and its very question would reveal the parallel run. The book leaves two workarounds:
substitute answers from historical or synthetic data, or combine the shadow run with a staging
deployment or with A/B testing. Designing the human handoff itself is
`aiagents-human-in-the-loop`'s decision, not this skill's.

### 4. CANARY — making the slice comparable (KU: ai-apps-merged-ku04)
Where shadow collects data invisibly, the canary goes one step further: the new version is opened to
a small share of real users — «скажем, 1 % или 5 % трафика» [p.271-272] — while the rest continue on
the baseline [p.272].

**The comparability condition is a version tag on all telemetry** [p.272]. With metrics and traces
labelled by version, Grafana dashboards (the book calls them critically important here) yield the
canary-versus-baseline slice across four indicators at once: success rate, latency, tool usage, and
error counters. Alerts for noticeable regressions and canary anomalies are hung on top of that
slice [p.272].

**The fork after the slice** [p.272]:

| Reading | Action |
|---|---|
| Indicators healthy | Grow the traffic share gradually |
| Indicators bad | Return to the previous version immediately; the cost of that return to users is minimal |

The book's own conclusion about *why* this scheme carries fast production iteration: it is the
cheapness of the rollback, not the smallness of the slice [p.272]. Design accordingly — a canary
whose revert takes a redeploy has lost the property that justified it.

Note the division of labour: what the four indicators mean, how they are collected and what
threshold fires is `aiagents-observability-and-drift`'s territory; the URL-level smoke check after
the deploy is `canary-watch`'s. What is decided here is the *share* and the *fork*.

### 5. Live-traffic A/B — four requirements and the state trap (KU: ch11-p280-ku16)
**When**: you need a number comparing two agent variants on live traffic, in the region where a
shadow run is structurally blind — the subtle shifts in how the interaction goes [p.301].

**The scheme** [p.301-302]: live traffic is split between control version A and candidate B, each
user works with one of them, and the metric difference is measured directly — the book's examples
are the share of resolved tasks in a collective agent swarm and a reduction in the share of
hallucinated answers. Per рис. 11.4 users are distributed between the two versions **evenly, 50 % to
50 %**, and the book attributes the reliability of the metrics to that balanced split [p.302].

**Three strengths** [p.302]: real-world relevance (genuine user behaviour and input variety, which
is what shows whether the improvement generalises beyond isolated tests); direct comparability of
the versions; and the statistical rigour of a properly designed test, which separates a substantive
difference from random deviation and sampling bias.

**Four requirements on the setup** [p.302-303]:
- [ ] Define clear, practical metrics aligned with the goal of the proposed change.
- [ ] Ensure a sample large enough for statistical significance, reducing the risk of false
      positives and false negatives.
- [ ] Rule out cross-contamination — for example a user switching between versions inside a single
      session.
- [ ] Monitor both short-term and long-term effects: a change can deliver a quick win and create a
      problem later.

The book states the requirement; the machinery for satisfying requirement 2 — sample-size
calculation, significance, confidence intervals, the ship/extend/stop verdict — is
`ab-test-analysis`'s job, and this skill deliberately supplies none of it.

**The interpretation trap** [p.303]: qualitative assessment remains no less important. A drop in
task-completion frequency for version B may reflect not a plain failure but deeper, more meaningful
engagement. A dashboard delta is not yet a verdict.

**The state trap — specific to agents** [p.303]: A/B testing **may become harder** when the agent
keeps long-term interaction state — chat history, an extended user context. Users **may** encounter
inconsistent interactions if they are reassigned to different versions between sessions. Three
remedies the book names:

| Remedy [p.303] | What it fixes |
|---|---|
| «Fixed» assignment — a user always lands in the same variant | The user never crosses the version boundary |
| Testing at the level of SESSIONS instead of users | The unit of assignment stops spanning stored history |
| Isolating state management — up to duplicating or versioning the state store separately per test group | The two variants stop sharing the store they read and write |

**Tooling** [p.303]: experimentation platforms — the book names LaunchDarkly, Optimizely and
specialised dashboards — take a substantial part of traffic allocation, metric collection and the
analysis itself off the team, leaving it the interpretation of results.

**Limits carried from the KU**: A/B gets complicated with long-term agent state [p.303]; it needs a
sufficient sample and a significant volume of data [p.282, p.302]; and in ultra-high-risk
environments it is not applicable without gates [p.282] — which points straight back at §1.

### 6. ADAPTIVE experiment — the Bayesian bandit (KU: ch11-p280-ku17)
An A/B test splits traffic in a fixed proportion. When you want the experiment to learn as it runs
and steer users toward the winning variants mid-flight, the book's instrument is the Bayesian
bandit — defined in its editorial footnote as «подход в рамках задачи многорукого бандита,
использующий байесовскую статистику для решения проблемы балансировки между исследованием
(обучением) и эксплуатацией (выбором наиболее перспективных действий)» [p.280].

**Mapping onto an agent system** [p.303]: each arm is a system variant — an alternative
request-handling prompt, or a separate orchestration strategy in a multi-agent swarm. As
interactions accumulate the algorithm observes rewards (successful task resolutions, latency
reduction, rising user ratings), refines its picture of each arm's performance by Bayesian updating,
then routes a larger share of traffic to the promising arms while periodically probing the rest so
hidden opportunities are not lost.

**The book's numeric example** [p.303-304]: a multi-agent SOC system is being optimised, with three
reasoning chains under trial for resolving ambiguous requests. At the start the bandit treats them
as equivalent; once data accumulates it sees that one chain raises the share of correct
threat-classification results by 15 %, and moves 70 % of requests into it while still testing the
others in case user behaviour shifts.

**Extension**: KABB-class schemes (Knowledge-Aware Bayesian Bandits) carry the bandit into dynamic
coordination of expert agents, where semantic information is used to select a subset of tasks
[p.304].

**Three advantages** [p.304]: responsiveness (continuous learning and near-real-time reallocation
lower the opportunity cost); efficiency (traffic is not spent on suboptimal variants); scalability
(a well-designed bandit copes with very many parameters and explores the action space faster than a
series of fixed experiments).

**Three requirements it imposes** [p.304]:
1. *Solid knowledge of the metrics* — the reward must reflect the system's true goals (user
   satisfaction, task success), so the run does not optimise a false intermediate objective.
2. *Considered initialisation* — start from unbiased priors and keep regularisation, otherwise the
   bandit commits to one arm before it has grounds to.
3. *Active observation* — the team is obliged to watch for pathological feedback loops and for
   exploitation of short-term trends at the expense of long-term goals.

**Where it fits** [p.304-305]: dynamic, data-rich agent environments — real-time personalisation in
recommender agents, adaptive workflows in autonomous teams — and it is especially effective where
interactions are computationally expensive or where the behaviour only manifests under load.

> *Адаптация для агента, не из книги:* the KU's own `limits` notes that with a wrong metric an
> adaptive scheme accelerates movement in the wrong direction. The book states requirement 1 and
> the obligation to watch; the acceleration framing is the extractor's inference from it. Treat it
> as a design heuristic, not a book claim.

### 7. Paying for each expansion step with a measured signal (KU: ch13-p340-ku04)
The book's worked case is a four-phase launch of GitHub Copilot at ZoomInfo [p.343]. The facts:
the start was a pilot group of 50 engineers; coverage grew to the full team — over 400 employees —
only after the metrics reached thresholds thought through in advance, «33 % — принятие системы
и 72 % — удовлетворенность разработчиков» [p.343], and after qualitative feedback confirmed that
Copilot's suggestions were genuinely useful [p.343-344]. The outcome named: the tool stopped being
an optional add-on and took its place as a regular working instrument [p.344].

**Scope, stated plainly.** 33 % and 72 % are *this* organisation's thresholds for *this* tool; the
book does not offer them as universal. And the stronger reading — that every expansion step must be
paid for by the pair «quantitative threshold + qualitative confirmation» — is the extractor's
generalisation from one described launch, not a rule the book states. What the source does support
is narrower and still useful: in this launch, expansion happened only after both signals had fired
[p.343-344]. Carry it as a precedent worth imitating, not as a law.

### 8. Testing in real conditions — the staged loop and its KPIs (KU: ch02-p41-ku18)
Why the controlled environment is not enough [p.63-64]: a development environment supplies
predictable input, while real environments are dynamic — different users, edge cases, unforeseen
problems. Testing in real conditions (deploying into production environments and observing
behaviour) exposes problems missed earlier and assesses the agent's robustness, reliability and
usability [p.63]. It surfaces edge cases not accounted for at design time: a chatbot tested on
scripted queries stumbles on real users' unexpected input, ambiguous questions and natural-language
variation [p.64]. It also checks performance under high load, which matters where traffic is
unstable — support bots, shop recommender systems [p.64].

The procedure [p.64-65]:

| Step | What it does |
|---|---|
| 1. Staged deployment | From small-scale testing in a limited environment to full deployment; problems are identified gradually, without excess load on the system and without a negative effect on users [p.64] |
| 2. Monitoring the agent's behaviour | Track responses and metrics, focusing on the KPIs: response time, share of correct results, user satisfaction, system stability [p.64] |
| 3. Collecting user feedback | Reveals gaps, improves usability, and checks the fit to real needs [p.64-65] |
| 4. Iterating on what was learned | Test data feeds back into the development cycle to refine the agent and optimise future iterations [p.65] |

Two things to know about this section of the source. First, it prescribes no rollback mechanism for
a failed stage — the revert material comes from §1 and §4, not from here [вывод экстрактора,
recorded in the KU's `limits`]. Second, a source-quality note carried from the KU: the section's
conclusion on p.65 lists the practices as «итеративное проектирование, agile-разработка и
тестирование в реальных условиях», while the same section introduces the triad on p.60 as
«итеративное проектирование, стратегия оценки и тестирование в реальных условиях» [p.60] — the
second practice is substituted and «agile-разработка» is never developed anywhere else; the same
pages carry typesetting defects («agileразработка» on p.65, «ИИмоделей» on p.53).

### 9. The revert path and the agent's own FALLBACK (KU: ch09-p238-ku16, ch10-p257-ku10)
Two different things share the word "rollback", and a release plan needs both.

**Version-level revert** — the release-process property from §1: a dependable version-shipping
process, post-launch regression monitoring, and fast reversion when something unforeseen appears
[p.255]; on a canary that reversion is immediate and costs users little [p.272].

**Run-level fallback — the self-healing agent** [p.272]. Monitoring can do more than detect a
failure; it can help the agent recover from one. If the agent is designed to read *its own*
telemetry as it runs, it **may** handle a noticed problem itself by switching to a pre-prepared
fallback path. The book's "if → then" examples, all in the modality *the agent may* [p.272]:

| Observed condition | Pre-prepared response |
|---|---|
| A tool call fails repeatedly | Move to a simplified fallback plan, or ask the user for clarification |
| A spike in latency | Skip the optional reasoning stages |
| High hallucination scores | Emit a warning, or hand the problem to a human |

**The effectiveness condition** [p.272]: self-healing pays off exactly as far as the telemetry
beneath it is detailed. And the firing of the fallback itself **may** be recorded in a log and a
span, so the team can later reconstruct under what condition the path engaged and whether it
worked [p.272-273].

**What the book does not give**: no thresholds for "repeatedly", for a latency "spike", or for
"high" hallucination scores [вывод экстрактора, recorded in the KU's `limits`]. If you need firing
points, they come from the observability sibling's KPI material, not from here — and the modality
there is descriptive too.

## Key facts & formulas
- Readiness is a holistic assessment of safe, consistent, effective operation in real environments,
  not the passing of tests [p.255].
- Deployment criteria «часто включают» quantitative thresholds on the relevant evaluation sets,
  stability under stress and edge cases, and every workflow behaving as intended [p.255].
- The book's example criterion for its support agent: at least **95 %** tool-selection completeness
  on the refund and order-cancellation flows, with automatic blocking of promotion on regressions in
  multi-step tests such as an address change — given as what the criteria «могут включать» for that
  agent [p.255].
- Gates are automated or manual checks that block promotion; example firing conditions are a
  regression in the latest evaluation set and a missing explicit tech-lead / product-manager
  approval after a pilot or beta phase; they can be configured to escalate to a human on ambiguous
  automated results [p.255].
- Canary traffic share, verbatim: «скажем, 1 % или 5 % трафика» [p.271-272].
- The canary comparison needs a **version tag on all telemetry**; the canary-vs-baseline slice runs
  on four indicators — success rate, latency, tool usage, error counters — with alerts for
  noticeable regressions and anomalies on top [p.272].
- Shadow comparison targets: tool choice, latency, token consumption, hallucination frequency
  [p.271]; the shared request identifier plus OTel is what labels the shadow agent's records in Loki
  and Tempo [p.271].
- Shadow requires comparing three layers — traces, outputs, metrics (share of correct results,
  latency) — and adjudicating every divergence as intended change or defect [p.301].
- Shadow's two workarounds for HITL-dependent agents: substituted historical or synthetic answers,
  or combination with a staging deployment or A/B test [p.301].
- The deployment sequence the book states: the process often starts with staging or RC environments;
  from there teams may use shadow, canary, rolling (instance by instance) or blue-green [p.300].
  Blue-green = two identical environments, traffic switched only after the check, zero downtime
  [p.300-301].
- A/B split per рис. 11.4: **50 % / 50 %**, and the balanced split is what the book credits for the
  reliability of the metrics [p.302].
- A/B's four setup requirements: clear practical metrics aligned with the change's goal; a sample
  sufficient for statistical significance; no cross-contamination (e.g. switching a user between
  versions inside one session); monitoring of both short- and long-term effects [p.302-303].
- Long-term-state remedies for A/B: fixed per-user assignment, session-level testing, isolated state
  management up to a duplicated or versioned store per test group [p.303].
- Experimentation platforms named: LaunchDarkly, Optimizely, specialised dashboards [p.303].
- Bandit definition (editorial footnote), verbatim: «подход в рамках задачи многорукого бандита,
  использующий байесовскую статистику для решения проблемы балансировки между исследованием
  (обучением) и эксплуатацией (выбором наиболее перспективных действий)» [p.280].
- Bandit numeric example: three reasoning chains in a multi-agent SOC system; one raises the share
  of correct threat-classification results by **15 %**, and the bandit moves **70 %** of requests
  into it while continuing to probe the others [p.303-304].
- Bandit extension for multi-agent systems: KABB — Knowledge-Aware Bayesian Bandits [p.304].
- ZoomInfo / GitHub Copilot phased launch: **four phases**, a pilot of **50** engineers, expansion to
  the full team of over **400** employees only after «33 % — принятие системы и 72 % —
  удовлетворенность разработчиков» [p.343] plus qualitative confirmation of usefulness [p.343-344].
- Real-conditions KPI focus: response time, share of correct results, user satisfaction, system
  stability [p.64].
- Self-healing triggers named without thresholds: repeated tool-call failure → simplified fallback
  plan or a clarifying question; latency spike → skip optional reasoning stages; high hallucination
  scores → warning or human handoff [p.272].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Treating "the tests passed" as deployment readiness | Readiness is defined as a holistic assessment of safe, consistent, effective operation in real environments | ch09-p238-ku16 |
| A gate that reports but does not block | The mechanism is defined by its blocking of promotion when a requirement is unmet | ch09-p238-ku16 |
| Sending every ambiguous automated result straight to a stop | The gate can be configured to escalate to human review instead — refusing to distinguish the two shapes wastes the escalation route | ch09-p238-ku16 |
| Copying the 95 % tool-completeness figure as a universal bar | It is given as one possible criterion for the book's own support agent, in the modality "may include" | ch09-p238-ku16 |
| Validating on staging alone and calling it verified | A controlled test environment often hides how users really behave | ai-apps-merged-ku04 |
| Running a shadow build without shared request ids and version labelling | The comparison rests on labelled traces and logs; without them the parallel run produces data nobody can align | ai-apps-merged-ku04 |
| Logging shadow divergences without adjudicating each one | Every divergence has to be resolved as an intentional behaviour change or a defect, or the run yields nothing | ai-apps-merged-ku04 |
| Expecting a shadow run to tell you how users react | The output is never shown to the user, so there is no reaction to observe | ai-apps-merged-ku04 |
| Shadow-testing an agent that must ask the user for confirmation | The shadow copy must stay invisible; its question would reveal the parallel run — use substituted historical/synthetic answers or combine with staging or A/B | ai-apps-merged-ku04 |
| A canary without a version tag on the telemetry | The canary-vs-baseline slice across success rate, latency, tool usage and error counters is what the tag makes possible | ai-apps-merged-ku04 |
| A canary whose revert is slow or expensive | The cheapness of the rollback is what the book credits for making the scheme a support for fast production iteration | ai-apps-merged-ku04 |
| Choosing a shadow run to measure a subtle interaction shift | Those shifts are precisely what a shadow version may miss; the book routes them to A/B | ai-apps-merged-ku04, ch11-p280-ku16 |
| Splitting A/B traffic unevenly by default | The book's figure distributes users 50/50 and attributes metric reliability to the balanced split | ch11-p280-ku16 |
| Letting a user cross between variants inside one session | Named explicitly as the cross-contamination the setup must rule out | ch11-p280-ku16 |
| Running A/B on an agent with long-term per-user state and no assignment rule | Reassignment between sessions produces inconsistent interactions; fixed assignment, session-level testing or an isolated state store is required | ch11-p280-ku16 |
| Reading only the short-term delta | The requirement is to monitor short- **and** long-term effects — a change can win fast and cost later | ch11-p280-ku16 |
| Reading a drop in B's task completion as a plain failure | Qualitative assessment stays no less important; it may reflect deeper, more meaningful engagement | ch11-p280-ku16 |
| Running a live experiment in an ultra-high-risk environment without gates | Named as inapplicable there without gates | ch11-p280-ku16 |
| Starting a bandit on a proxy reward | The reward must reflect the system's true goals, or the run optimises a false intermediate objective | ch11-p280-ku17 |
| Initialising a bandit with biased priors and no regularisation | It commits to one arm before it has the evidence to | ch11-p280-ku17 |
| Leaving a bandit unattended because it is adaptive | Active observation is an obligation — pathological feedback loops and short-term-trend exploitation are the named failure modes | ch11-p280-ku17 |
| Handing full functionality to the whole organisation up front | In the described launch each expansion step followed a measured signal — quantitative thresholds plus qualitative confirmation of usefulness | ch13-p340-ku04 |
| Reusing 33 % adoption and 72 % satisfaction as the bar for your rollout | They are that organisation's thresholds for that tool; the book does not present them as universal | ch13-p340-ku04 |
| Going straight to full deployment instead of a staged one | Staged deployment is what lets problems be identified gradually, without excess load and without hurting users | ch02-p41-ku18 |
| Watching only technical KPIs during the staged rollout | The named KPI focus includes user satisfaction alongside response time, correct-result share and stability, and feedback collection is its own step | ch02-p41-ku18 |
| Building self-healing fallbacks on thin telemetry | The mechanism pays off exactly as far as the telemetry beneath it is detailed | ch10-p257-ku10 |
| Firing a fallback without logging that it fired | Log plus span are what let the team reconstruct under which condition the path engaged and whether it helped | ch10-p257-ku10 |
| Hard-coding thresholds for "repeated failure" or a latency "spike" as if the book supplied them | The pattern is described qualitatively; no such thresholds are given | ch10-p257-ku10 |

## Related decisions
- **`aiagents-evaluation-design`** — that skill builds the instrument; this one sets the bar the
  instrument's readings must clear. The dependency is hard in one direction: a deployment criterion
  is a threshold **on a relevant evaluation set** [p.255], so a set that lacks the flow you are
  gating cannot gate it. It fixes no numeric targets on purpose; picking the number is this skill's
  act, and it inherits every limitation of the set it is computed over.
- **`aiagents-observability-and-drift`** — the canary slice, the shadow comparison and the
  self-healing fallback all consume production telemetry: shared request ids, version tags, OTel
  spans, Loki/Tempo records [p.271-272, p.301]. That skill decides what is emitted and what fires;
  this one decides who sees the new version and when it is pulled. If the telemetry carries no
  version label, §4 is not implementable.
- **`aiagents-improvement-loops`** — a rollout produces the raw material for that loop: shadow
  divergences awaiting adjudication, canary regressions, experiment results, fallback-firing logs.
  This skill stops at the ship/hold/revert decision; converting a confirmed regression into a root
  cause and a prompt or data fix belongs there.
- **`aiagents-human-in-the-loop`** — two crossings. The shadow copy structurally cannot address the
  user, which constrains any agent whose design requires a confirmation [p.301]; and one of the
  self-healing responses to a high hallucination score is handing the problem to a human [p.272].
  The autonomy level and the shape of that handoff are decided there.
- **`aiagents-org-adoption-and-governance`** — §7's pilot-to-organisation expansion is where the two
  meet. Traffic share and the trust signal that unlocks the next step are decided here; authority,
  accountability, roles and compliance obligations for the rolled-out agent are decided there.
- **`aiagents-probabilistic-behaviour-checks`** — consistency, coherence and hallucination-reduction
  checks are part of what a version owes *before* it reaches the gate; a shadow run's hallucination
  comparison [p.271] reads a metric that cluster defines. Do not treat a canary as a substitute for
  them.
- **`aiagents-agent-fit-and-model-choice`** — a model swap is one of the named things a shadow run
  is for [p.271], so every choice made there arrives here as a change needing an exposure plan.
- **`aiagents-single-vs-multi-agent`** — the book's bandit example optimises a multi-agent SOC
  system and its arms are orchestration strategies [p.303-304]; KABB carries the bandit into
  coordinating expert agents [p.304]. The more agents in the topology, the more variants an
  experiment has to keep apart — and the more state an assignment rule has to isolate.
- **`canary-watch` / `ab-test-analysis` / `github-actions` / `incident-response`** — the mechanical
  neighbours. Use `canary-watch` to probe the deployed endpoint after the release, `ab-test-analysis`
  to compute significance and the ship/stop verdict on the experiment this skill designed,
  `github-actions` for the pipeline that executes the promotion, and `incident-response` once the
  problem is already an outage rather than a promotion decision.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 2, с. 63–65; глава 9, с. 255; глава 10, с. 271–273; глава 11, с. 280, 282, 300–305;
глава 13, с. 343–344.
KUs: ai-apps-ch02-p41-ku18, ai-apps-ch09-p238-ku16, ai-apps-ch10-p257-ku10, ai-apps-ch11-p280-ku16,
ai-apps-ch11-p280-ku17, ai-apps-ch13-p340-ku04, ai-apps-merged-ku04.
Deep reference: `references/knowledge-units.md`.
- Canary-share anchor: «скажем, 1 % или 5 % трафика» [p.271-272].
- Trust-signal anchor: «33 % — принятие системы и 72 % — удовлетворенность разработчиков» [p.343].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] All 7 consumed KUs are `verified: true` — no partial-KU exclusions were required?
- [x] §2's mechanism table headed as an inventory, with no invented escalation ladder between rows?
- [x] The «quantitative threshold + qualitative confirmation for every expansion» generalisation
      labelled as extractor inference rather than stated as a rule?
- [x] Boundary clause separates the agent decision from `canary-watch` (URL probing) and
      `ab-test-analysis` (experiment statistics) by name?

## Examples
- «Можно ли выкатывать эту версию агента?» → not a test-suite question: check the four readiness
  elements — quantitative thresholds on the *relevant* eval sets, stability under stress and on edge
  cases, every workflow behaving as intended; the component checklist (tools, planning, memory,
  learning, integrations) plus end-to-end integration tests, latency and uptime targets, no
  critical/serious defects; the gates that block promotion (regression in the latest eval set,
  missing tech-lead/PM approval after the pilot) and which of them escalate to a human instead of
  failing closed; and the post-launch package — version-shipping process, regression monitoring,
  fast revert. Set your own numeric bar; the book's 95 % is one example criterion for its own
  support agent.
- "We're swapping the planner's model — shadow or canary first?" → a new model version is exactly
  what the book names shadow mode for: run the candidate on the same live input with a shared
  request id, deliver nothing to the user, and compare tool choice, latency, token consumption and
  hallucination frequency. Then know shadow's blind spot — it gives no user-reaction signal at all,
  so if the change is about *how the interaction feels*, plan an A/B afterwards.
- «Какой процент трафика дать канарейке и когда наращивать?» → the book's illustration is 1 % or
  5 % of traffic with everyone else on the baseline; the precondition is a version tag on all
  telemetry so you get the canary-vs-baseline slice on success rate, latency, tool usage and error
  counters, with alerts on noticeable regressions. Indicators healthy → grow the share gradually;
  bad → revert immediately. Build for a cheap revert: that, not the small slice, is what the book
  credits.
- "Our agent stores chat history per user — how do we A/B two prompt variants?" → the long-term
  state trap. Reassigning a user between versions across sessions produces inconsistent
  interactions; use fixed per-user assignment, or move the unit of assignment down to the session,
  or isolate state management by duplicating/versioning the store per test group. Then the four
  setup requirements: goal-aligned metrics, a sample big enough for significance (compute it with
  `ab-test-analysis`), no mid-session switching, and both short- and long-term effects watched.
- «У нас пять вариантов промпта и дорогие взаимодействия — фиксированный сплит или бандит?» → the
  adaptive route: each variant is an arm, rewards are observed (resolved tasks, latency, ratings),
  Bayesian updating reallocates traffic toward the promising arms while still probing the rest —
  the book's example moves 70 % of requests to a chain that gained 15 % correct classifications.
  Price of admission: a reward that reflects real goals, unbiased priors with regularisation, and
  active watching for pathological feedback loops.
- "The pilot went well — can we give the agent to everyone?" → the book's precedent is a four-phase
  launch: 50 engineers first, expansion to 400+ only after pre-set metric thresholds were reached
  *and* qualitative feedback confirmed real usefulness. Copy the mechanism (each expansion step
  bought with a measured signal), not the numbers — 33 % adoption and 72 % satisfaction were that
  organisation's thresholds for that tool.
- «Что должно происходить, когда новая версия деградирует в проде?» → two different rollbacks.
  Version level: fast revert as a property of the release process, cheap by construction on a
  canary. Run level: if the agent reads its own telemetry it may switch to a pre-prepared fallback —
  a simplified plan or a clarifying question on repeated tool failure, skipping optional reasoning
  stages on a latency spike, a warning or a human handoff on high hallucination scores — and every
  firing must be logged and spanned. The book supplies no thresholds for those conditions; take them
  from your observability design.
