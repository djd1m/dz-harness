---
name: aiagents-org-adoption-and-governance
description: >
  Decide the SCOPE OF AUTHORITY an agent is granted inside a company and the governance obligations
  that scope drags in with it: the five organisational областей действия — персональная, командная,
  проектная, функциональная, организационная — with who each one serves, what corporate systems it
  reaches and how much it may decide alone; whether the agent inherits the permissions of the person
  it assists or needs explicit privileges under a role of its own in CRM / HR / finance systems;
  RBAC by data sensitivity (acting on behalf of a vice-president versus an intern); memory
  partitioned along those same scope boundaries so a team agent does not surface shared material in
  a private chat; the authorisation ladder from "just send it" through per-action human approval to
  a multi-party chain or an internal распорядительный совет reviewing system behaviour and its
  updates; WHO is answerable when the agent causes harm — developers, operators, or the deploying
  organisation — using ready-made accountability frames (NIST AI RMF govern / map / measure /
  manage, AI Impact Assessment Template aligned to EU AI Act, NIST AI RMF and ISO 42001) instead of
  inventing a process; ethics audit and behaviour observation as a standing, independently-reviewed
  process; decision / interaction / failure logs plus traceability an auditor can reconstruct a case
  from; compliance built INTO the build pipeline — automated gates where one failed check fails the
  whole build, policy-as-code (Open Policy Agent), live model cards and datasheets in the internal
  model registry — against GDPR, CCPA, HIPAA, PCI DSS, SOX and the EU AI Act risk tiers; plus
  stakeholder alignment before the build, the «один стандарт на большую группу» balance between
  free experimentation and premature standardisation, and the four principles of the path to
  autonomy. ORGANISATIONAL AUTHORITY, ACCOUNTABILITY AND COMPLIANCE OBLIGATIONS ONLY — NOT the
  runtime escalation mechanics of when a single agent stops and hands control to a human operator,
  the autonomy level, the handoff payload, or how human oversight degrades
  (→ `aiagents-human-in-the-loop`), NOT the technical security perimeter — prompt injection,
  jailbreaks, guardrails, least privilege as a containment barrier, MAESTRO threat modelling
  (→ `aiagents-agent-security`; this skill owns the governance duty, that one owns the defence),
  NOT readiness thresholds, staged or canary rollout and rollback of a new agent VERSION
  (→ `aiagents-release-gates-and-rollout`), NOT production telemetry, alert thresholds and drift
  detection as an ops discipline (→ `aiagents-observability-and-drift`; the logs here exist for
  audit and answerability, not for paging an SRE), NOT the mechanism and store behind agent memory
  (→ `aiagents-knowledge-and-memory`; only the scope BOUNDARY on that memory is here), NOT the
  user-facing interface that renders trust and transparency (→ `aiagents-agent-ux`), NOT running
  long-lived agent fleets operationally (→ `enterprise-agent-ops`), NOT ITIL service management
  (→ `itsm-itil`), NOT testing a system against a regulatory standard as a QA activity
  (→ `compliance-testing`), NOT generic consulting, stakeholder-mapping or risk-register artefacts
  (→ `consultancy-practices`, `stakeholder-map`, `risk-assessment`).
  Triggers (RU+EN): "какую область действия дать агенту — командную или функциональную",
  "агент наследует права сотрудника или ему нужна своя роль в корпоративных системах",
  "кто отвечает, если агент причинил вред", "командный агент раскрыл общие данные в личном диалоге",
  "что логировать, чтобы аудитор восстановил решение", "как встроить проверку GDPR и EU AI Act в сборку",
  "аудит на смещения и справедливость для развёрнутого агента",
  "каждая команда пилит своего агента — пора стандартизировать?",
  "who is accountable when the agent makes a wrong decision",
  "scope of authority for a company-wide agent, and does it need a review board",
  "NIST AI RMF or an AI impact assessment template",
  "RBAC for an agent acting on behalf of a VP vs an intern",
  "align legal, engineering and end-user expectations before we build the agent",
  "does this agent need HIPAA or PCI DSS constraints".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from:
  - ai-apps-ch13-p340-ku05
  - ai-apps-ch13-p340-ku06
  - ai-apps-ch13-p340-ku07
  - ai-apps-ch13-p340-ku10
  - ai-apps-ch13-p340-ku11
  - ai-apps-ch13-p340-ku12
  - ai-apps-ch13-p340-ku14
  - ai-apps-ch13-p340-ku03
  - ai-apps-ch13-p340-ku02
  - ai-apps-ch13-p340-ku15
  - ai-apps-ch01-p24-ku11
  - ai-apps-ch12-p310-ku03
---

# Org adoption & governance — how far the agent's authority reaches inside the company, and who answers for what it does

## Output
A governance section for the ADR / architecture step: the agent's assigned область действия with the
access architecture that follows from it (inherited permissions versus an explicit corporate role,
the RBAC split by data sensitivity), the memory boundary drawn along the same line, the required
authorisation ladder for its actions, a named accountability scheme with the answerable party
written down, the audit and logging obligations, and the compliance controls wired into the build
pipeline — plus the stakeholder-alignment and standardisation stance for the rollout across teams.

## When to use / NOT
- **Use when:** assigning or widening an agent's scope inside an organisation (personal helper →
  team bot → departmental agent → company-wide agent); deciding whether it acts under a person's
  inherited permissions or under a role of its own in CRM, HR or finance systems; a team or
  departmental agent is about to share memory across a boundary it should not cross; the question
  "who is responsible if this goes wrong" has no written answer; setting up an accountability,
  ethics-audit or logging regime before deployment; wiring regulatory checks into CI and shipping
  model cards with each version; aligning engineering, legal and end-user expectations before the
  build starts; several teams are each building their own agent and fragmentation is starting to
  cost more than the experiments earn.
- **NOT for:** the runtime escalation design — when one agent must stop, what the handoff carries,
  what autonomy level it runs at, how a fatigued reviewer's oversight degrades — that is
  `aiagents-human-in-the-loop`; this skill only says which *governance regime* the scope demands
  (see §2's authorisation ladder, which stops at "an approval step is required here"). Not the
  technical perimeter — injection, jailbreaks, guardrails, sandboxing, threat modelling
  (→ `aiagents-agent-security`); a compliance obligation and a defence are different objects. Not
  getting a new VERSION safely in front of users — readiness thresholds, canary, rollback
  (→ `aiagents-release-gates-and-rollout`); the CI compliance gate here is about legal and ethical
  admissibility, not about whether the build is good enough to ship. Not production telemetry,
  alert thresholds or drift (→ `aiagents-observability-and-drift`). Not the memory MECHANISM and
  its store (→ `aiagents-knowledge-and-memory`). Not the interface that makes trust visible
  (→ `aiagents-agent-ux`). Not operating agent fleets (→ `enterprise-agent-ops`), ITIL service
  management (→ `itsm-itil`), test execution against a standard (→ `compliance-testing`), or
  generic consulting artefacts (→ `consultancy-practices`, `stakeholder-map`, `risk-assessment`).

## Decision criteria

### 1. Assign the область действия — and read off what it costs (KU: ch13-ku05)
Five scopes, restructured from табл. 13.2 (гл. 13, с. 346) around the question *whom does this agent
serve, and what does that buy it*:

| Область | Кого обслуживает | К чему получает доступ | Автономность решений | Примеры из книги |
|---|---|---|---|---|
| Персональная | отдельного человека [p.346] | почта; календарь; документы; исходный код [p.346] | низкая либо умеренная [p.346] | помощник менеджера; помощник разработчика [p.346] |
| Командная | группу либо её менеджера [p.346] | общие диски; встречи; цели команды [p.346] | умеренная [p.346] | бот-планировщик спринтов; бот для организации встреч [p.346] |
| Проектная | кросс-функциональную группу [p.346] | трекер задач; результаты работ [p.346] | умеренная либо высокая [p.346] | агент R&D-программ; агент конфигурации запуска [p.346] |
| Функциональная | подразделение [p.346] | CRM; кадровые информационные сервисы; финансовые системы [p.346] | высокая внутри своей области [p.346] | HR-агент; комплаенс-агент; маркетинг-агент [p.346] |
| Организационная | руководство, ИТ, руководителя информационной службы [p.346] | корпоративные системы; аналитику [p.346] | высокая либо ограниченная [p.346] | общекорпоративный агент аналитики; ИИ-справочная служба [p.346] |

What shifts as the scope widens [p.344-346]:

- **Персональный** — limited authority, minimal risk; success rests on knowing one person's
  preferences and working style [p.344].
- **Командный** — must hold the boundaries of shared memory, respect the group's communication
  norms, and surface uncertainties that call for a group decision instead of a unilateral act
  [p.344].
- **Уровень подразделения** — RBAC becomes critical: the agent separates public, internal and
  restricted information, and its privileges differ depending on whose face it acts under — a
  vice-president's or an intern's [p.345].
- **Масштаб предприятия** — works across departments, joins data from different functions, links
  their flows, reaches strategic-level suggestions; the price of that reach is a hard governance
  frame: policies, auditability, and mandatory human confirmation on critical actions [p.345].

**The permission-inheritance rule [p.346]:** personal agents may inherit the rights of the person
they assist; functional and organisational agents need EXPLICIT privileges tied to the role assigned
to them in corporate systems. Designing that access architecture takes coordination between IT, the
data-governance teams and the developers [p.346].

Two constraints the book attaches to this decision:

- Scope assignment is not a purely architectural call. The scope fixes not only what the agent *can*
  do but what it *may* do — and with it, who watches [p.347].
- Designing such agents is a socio-technical problem: the agent has to fit the organisation's
  culture, its initiatives and its existing flows [p.345].

### 2. Match the governance envelope to the scope — never one policy for all five (KU: ch13-ku06)
Restructured from табл. 13.3 (гл. 13, с. 347) around the question *what governance does this scope
demand*:

| Область | Автономность | Профиль риска | Потребности в управлении |
|---|---|---|---|
| Персональная | низкая либо умеренная [p.347] | низкий [p.347] | предпочтения на стороне пользователя; минимум контроля; объяснимость необязательна [p.347] |
| Командная | умеренная [p.347] | умеренный [p.347] | границы общей памяти; эскалация к равным; калибровка доверия [p.347] |
| Проектная | умеренная либо высокая [p.347] | умеренный либо высокий [p.347] | видимость между функциями; журналы логов; механизмы разрешения конфликтов [p.347] |
| Функциональная | высокая внутри области [p.347] | высокий [p.347] | RBAC; аудиторские журналы; комплаенс [p.347] |
| Организационная | высокая либо ограниченная [p.347] | очень высокий, системного масштаба [p.347] | многоступенчатое подтверждение; разбор распорядительным советом; постоянный этический аудит и отслеживаемость [p.347] |

The book warns explicitly against a single blanket policy for autonomy, escalation and logging
across the scopes [p.346], and separates them onto an authorisation ladder [p.346-347]:

1. **Персональный агент** — the action just runs: send the mail, put the meeting in the calendar.
2. **Финансовый агент функционального уровня** — every action passes through human approval (HITL).
3. **Организационный агент** with the broadest access — either a chain of several authorising
   parties, or an internal распорядительный совет that reviews and approves both the system's
   behaviour and the release of its updates [p.347].

The governing dependency [p.347]: the wider the access, the greater the governance need — from light
user-side control up to statutory compliance, audit and enterprise-level oversight.

Two honesty limits: the table names governance *needs* by scope but gives no way to measure the
level of trust actually achieved [p.347]; and the "объяснимость необязательна" relaxation is stated
for the personal scope specifically, not as a general licence [p.347].

### 3. Partition memory along the same boundaries (KU: ch13-ku07)
The failure this prevents: a team agent recalling shared material inside a private one-to-one
dialogue, or a departmental agent exposing confidential data in another unit — either is a serious
breach of trust or of compliance [p.348].

**Baseline prohibition [p.348]:** until there is a clear policy, the agent is not given personal or
confidential data belonging to wider scopes.

Partitioning by level [p.348]:

| Уровень | Режим памяти |
|---|---|
| Персональный агент | изолированная память по умолчанию; обмен — только при явном разрешении |
| Агенты команд и подразделений | совместные пространства памяти с контролируемым доступом |
| Агент уровня организации | системы под управлением политик, задающих правила сохранения, логирования и аудита |

Two context-movement questions a designer must settle EXPLICITLY, or inherit unintended leaks and
scope creep [p.348]:

1. Does memory travel upward — say from a personal agent to a project one?
2. May agents request context from one another, or must they stay isolated?

Transparency requirements [p.348]:

- [ ] The agent can explain what it remembers and why.
- [ ] The user can inspect the memory or erase it.
- [ ] Memory is visible in the interface and can be switched off.
- [ ] The agent builds no hidden assumptions on stale or private data.

Positioning [p.349]: memory is not a secondary feature bolted onto a stateful system late — it is a
resource that needs explicit governance, and systems that handle it badly read to users as opaque
and unsafe.

Scope note: the book sets the boundaries and the transparency duties but does not describe a concrete
partitioning mechanism — no storage schema, no permission model; that stays with the implementation,
and the mechanism itself belongs to `aiagents-knowledge-and-memory`.

### 4. Name the answerable party — and take a ready-made accountability frame (KU: ch13-ku10)
Without accountability, failures — technical, ethical or operational — quietly go unattended,
eroding trust and leaving users without the help they needed [p.351]. Accountability requires
structural measures (control policies, escalation routes) AND technical ones (logging, traceability,
ethics audit) [p.351]. A working scheme achieves two things [p.351]: failures get found
systematically, examined and closed rather than written off as an unavoidable side effect of a
complex system; and it names who ultimately carries responsibility when the agent causes harm or
decides wrongly — **the developers, the system's operators, or the organisations that deployed it**.

Rather than inventing the process, the book offers two off-the-shelf options to take or adapt
[p.351]:

- [ ] **NIST AI Risk Management Framework (AI RMF)** — a risk-based framework from the National
      Institute of Standards and Technology; four core functions (verbatim): govern, map, measure,
      manage. Practical move: download the AI RMF profiles and worksheets from NIST to record your
      system's risk levels, keep the mitigation strategies, and track progress over time.
- [ ] **AI Impact Assessment Template** (collectively developed) — built with AI practitioners and
      standards experts; stated conformance to three frames: EU AI Act, NIST AI RMF, ISO 42001.
      Helps document the system's purpose and its impact on stakeholders, run bias and fairness
      checks, and draw up risk-mitigation plans. Usable both before deployment and in the ongoing
      governance of the system afterwards.

Limit to respect: the book describes both instruments as frames for documenting and accounting for
risk; it does not present them as a runtime failure-detection mechanism [p.351].

### 5. Ethics audit and behaviour observation as a standing process (KU: ch13-ku11)
Technical testing does not cover the social, cultural and organisational consequences of the agent's
operation [p.352]. The book's stance: fairness assessment is a first-order task of the audit, not an
add-on [p.352]. The audit must include checks for unequal impact on different demographic groups,
for closed feedback loops that amplify bias, and for the unintended consequences of optimising on
accuracy and performance alone [p.352].

Four components of an effective ethics audit [p.352]:

- [ ] **Оценка результатов** — do the agent's actions sit inside the intended goals and ethical
      guidance?
- [ ] **Проверка на смещения и справедливость** — find traces of bias or unfair treatment in its
      outputs.
- [ ] **Анализ путей принятия решений** — take apart the route by which it reaches a recommendation
      or a decision.
- [ ] **Оценка влияния на стейкхолдеров** — how the behaviour lands on different user groups.

**Behaviour observation** complements the audit: watching the agent in real situations, especially in
edge cases and on ambiguous input; it surfaces unintended behaviour — ethically questionable
trade-offs, unpredictable answers to particular prompts [p.352].

Two regime requirements [p.352-353]:

- [ ] Not a one-off exercise but a continuous iterative process: agents change through updates,
      retraining and exposure to new data, so their behaviour has to be re-examined against ethical
      standards regularly [p.352].
- [ ] Bring in an independent external auditor: it raises the transparency of the assessment and the
      credibility of its result, and an outside view reaches risks and blind spots that stay
      invisible from inside the team [p.353].

Limit: the book gives neither a review cadence nor a fairness-measurement methodology — only the
directions the checks should take [p.352].

### 6. Logging and traceability that survive a review (KU: ch13-ku12)
For accountability to be real, every action the agent takes must be traceable, verifiable and, where
needed, reversible or correctable [p.352].

Three components of the logging system [p.353]:

- [ ] **Логи решений** — why the agent decided as it did: inputs, intermediate reasoning stages,
      outcomes.
- [ ] **Логи пользовательских взаимодействий** — user input and agent responses, timestamped.
- [ ] **Логи ошибок и сбоев** — when and why it failed a task or produced an unexpected result.

Traceability sits on top of the logs and lets an auditor or a developer reconstruct the agent's
behaviour in a specific scenario, answering three questions [p.353]:

1. Why did the agent produce that recommendation?
2. Which data influenced the decision?
3. What acted from outside — API failures, conflicting instructions?

It matters most in critical domains: здравоохранение, финансы, правосудие, where the cost of wrong
agent behaviour is high [p.353].

Two requirements without which logs are useless or dangerous [p.353]:

- [ ] **ЗАЩИТА** — unauthorised access to logs holding confidential data becomes a privacy risk in
      itself; the named measures are encryption, access control, data anonymisation.
- [ ] **ИНТЕРПРЕТИРУЕМОСТЬ** — existence is not enough: developers, auditors and stakeholders must
      read them without effort, which takes accessible documentation and visualisation tooling.

Limit: the requirements are qualitative — neither a retention depth nor the amount of intermediate
reasoning to capture is specified.

### 7. Build compliance into the pipeline, not onto the end of it (KU: ch13-ku14)
Compliance treated as the end of the road does not survive fast-moving legislation: what conforms
today can be insufficient tomorrow [p.356].

The regulations the book names as most important [p.355-356]:

| Норматив | Что накладывает на агента |
|---|---|
| **EU AI Act** | sorts AI systems into risk levels (минимальный, высокий, недопустимый) and attaches obligations per level: transparency, accountability, human control [p.355] |
| **GDPR** | minimise data collection, obtain user consent, open clear routes for deleting and correcting data [p.355] |
| **CCPA** | data-protection and transparency rights for California residents, with the accent on consent and access to one's own data [p.355] |
| **HIPAA** | in healthcare, agents touching patient data fall under strict confidentiality and security requirements [p.356] |
| **Отраслевые стандарты** | «PCI DSS (Payment Card Industry Data Security Standard)» [p.356] for payment processing; «SOX (Sarbanes-Oxley)» [p.356] for the integrity of financial reporting — each adds its own limits on agent behaviour and data access [p.356] |

Three strategies for embedding compliance in the pipeline [p.356]:

- [ ] **Автоматизированные шлюзы соблюдения стандартов** — on every build, run tests that look for
      prohibited content and personal-data leakage, push prompts through fairness benchmarks, and
      check that data-handling policies hold. **Gate rule: one failed check fails the whole build.**
- [ ] **Библиотеки «политика как код»** — encode your data-use and confidentiality rules in a policy
      framework (the book's example: Open Policy Agent) and run the policy tests alongside the unit
      and integration tests, so policy drift surfaces BEFORE deployment.
- [ ] **Карты моделей и таблицы данных** — generate live model cards as build artefacts (data
      provenance, training-data statistics, known limitations, intended use cases) and publish them
      to the internal model registry; update the datasheet for every dataset going into retraining or
      fine-tuning, and ship each model version with a package attesting its compliance.

Technical foundations that coincide with privacy and security practice [p.356-357]: collect only the
data the task needs; strip personal information from datasets where possible; encrypt data at rest
and in transit; grant access only to authorised users and systems.

The framing [p.355]: compliance is not about avoiding fines but about weaving fairness, transparency,
accountability and privacy into the fabric of design and deployment — and it covers every lifecycle
stage, from design and training through deployment to long-term monitoring [p.357]. The list of
regulations depends on region and industry and ages fast; the book asks for standing investment in
legal monitoring, architectural flexibility, cross-disciplinary work, and cooperation with lawyers
and legal experts across the agent's whole lifecycle [p.356-357].

### 8. Align the stakeholders before you build, or ship for a user who does not exist (KU: ch13-ku03)
The symptom: the agent is presented as a technical novelty and received as something alien — slow
diffusion, passive resistance, or workarounds [p.343]. The root error: failing to surface and
reconcile diverging expectations (engineers look at efficiency, lawyers at legal conformity, end
users at simplicity), so the team builds for an imaginary "average" user who does not exist in
reality; the mismatch produces disappointment [p.343].

Procedure [p.343]:

1. Bring stakeholders in early — as co-authors, not as testers.
2. Fix the goals explicitly through three questions: which concrete outcomes must the agent improve;
   which decisions does it make alone and which stay with a person; what does success look like and
   what does failure look like.
3. Do not reduce success metrics to technical performance. Closing tasks fast does not save an agent
   that erodes the user's trust or creates difficulties for them. Stakeholder approval rests on the
   subjective perception of usefulness, on reliability, and on how well the agent fits the processes
   and values already in place.
4. Treat expectation gaps — between users and developers, between what the agent can do and what
   stakeholders think it should — as an occasion to sharpen priorities, rework requirements and
   revisit roles, not as an obstacle.
5. Invest in three things: training people, feedback loops, and responsive support. Training material
   and integration guides must evolve alongside the agent, and teams need a channel for voicing
   concerns and proposing improvements [p.343].

Frame: adoption is change management in a company, not merely the deployment of a software product
[p.343]. Adoption is not binary — success arrives when stakeholders see the agent as an extension of
their own capability [p.344].

Limit: the procedure asks questions but sets no quantitative acceptance thresholds; and because the
success metrics include subjective perception, technical telemetry alone is not enough to decide that
the agent has been accepted [p.343].

### 9. Two documented cases of moving people from checking to overseeing (KU: ch13-ku02)
> **Read these as cases, not as a rule.** The book presents two examples; it does not generalise
> «порог точности → расширение автономности» into a policy for tasks where no such threshold is
> defined. The generalisation is deliberately not written here.

| Кейс | Стартовая конфигурация | Что сдвинуло роли | Куда переехало человеческое внимание |
|---|---|---|---|
| **COiN (Contract Intelligence), JPMorganChase** [p.342] | junior legal staff as executors — sent contracts in and reviewed every extracted clause [p.342] | extraction accuracy for reference information crossed corporate thresholds [p.342] | experienced lawyers became reviewers taking only non-standard documents and edge cases; senior counsel became managers — setting extraction policy, auditing the system's behaviour, deciding which new contract types to extend COiN to [p.342] |
| **GitLab Security Bot** [p.342] | also started as an executor: scanned merge requests with «SAST (Static Application Security Testing)» [p.342] and «DAST (Dynamic Application Security Testing)» [p.342], flagging vulnerabilities for engineers to work through [p.342] | cases above the risk thresholds routed automatically to assigned security experts; their feedback refined the rules and cut the false-positive share, and the bot's autonomy grew while human control was kept [p.342] | senior specialists periodically audited both the rules and the escalation logs, so the escalation thresholds stayed in tune with the risk policy and standards requirements [p.342] |

What the two share [p.342]: human attention is not removed — it moves to exceptions and to governing
the policies. The triggers differ: in COiN the role shift is tied directly to accuracy thresholds
being exceeded, while at GitLab risk thresholds route escalation to experts and the bot's autonomy
grew gradually as their feedback tightened the rules [p.342].

### 10. Balance free experimentation against premature standardisation (KU: ch01-ku11)
Easy experimentation leads to fragmentation — overlapping projects, duplicated effort, a growing pile
of unfinished experiments; premature standardisation suppresses creativity and traps the company in
rigid frameworks or vendor lock-in [p.37].

The maturity sequence [p.37-38]:

1. Early phases — actively encourage exploration: let teams test different architectures, flows and
   models freely [p.37].
2. As successful patterns and best practices are identified, strategic direction starts to matter:
   the «один стандарт на большую группу» strategy — standards at the level of a division or a
   functional area, built on commonly-used tooling, easing collaboration without limiting innovation
   at the broader scale [p.37].
3. Against vendor lock-in — open standards (OpenAPI is the named example) and modular system designs
   [p.37-38].
4. Knowledge sharing: circulate the lessons of both successful and failed experiments through
   internal forums, shared repositories and detailed documentation [p.38].
5. Governance stays flexible and light: guiding principles rather than rigid prescriptions [p.38].
6. Iterate: keep re-assessing the balance between exploration and standardisation [p.38].

Limit: the book ties the switch to strategic direction to successful patterns having emerged over
time [p.37]; it gives no numeric readiness criterion for standardising.

### 11. Keep the people learning, and walk the path to autonomy (KU: ch12-ku03, ch13-ku15)
**Continuous training is part of the programme.** The book puts interactive platforms into ongoing
training as a way to learn to recognise and respond to AI vulnerabilities [p.312]. Three named
platforms, described here only by what each one is:

| Площадка | Формат | Что разбирается в упражнении |
|---|---|---|
| Gandalf (Lakera), https://www.lakera.ai/lakera-gandalf [p.312] | game with levels: the player builds prompts that reveal a secret behind an evolving defence [p.312] | input/output filtering and layered defence [p.312] |
| Red (Giskard), https://red.giskard.ai [p.313] | levels of rising difficulty; breaking the model with short creative prompts (subjectivity, toxicity), community exchange [p.313] | targeted adversarial testing and social-engineering risks [p.313] |
| Prompt Airlines CTF (Wiz.io), https://promptairlines.com [p.313] | capture-the-flag tasks: extract hidden information from a support chatbot by prompt injection, then examine the protective instructions [p.313] | the human-agent interface and context manipulation [p.313] |

> **Deliberately not written here:** an audience claim for these platforms (developer/operator
> training programme, red-team preparation) and any statement about their (un)suitability for
> assessing production defence. A cross-model judge refused both on с. 312-313, so both are removed
> rather than softened. The security craft these exercises touch is `aiagents-agent-security`.

**The four principles of the path to autonomy [p.359].** The observation behind them: the strongest
teams do not jump to full automation in one move — they build trust toward it gradually, assess
results strictly, and put control in place at the very start [p.359].

- [ ] **ЭКСПЕРИМЕНТИРОВАНИЕ** — pilot the agent in a low-risk environment.
- [ ] **ИЗМЕРЕНИЕ** — define success metrics BEFORE work begins.
- [ ] **КОНТРОЛЬ** — set up oversight and logging early.
- [ ] **МАСШТАБ** — revisit the trust and autonomy thresholds iteratively.

Frame: agentic systems are not a set-and-forget technology [p.358] — they need continuous assessment,
refinement and adjustment to changing human needs; agents must evolve together with their tasks,
adapting to fresh data, new threats and shifting social expectations [p.358]. The organisations that
win are the ones putting flexibility, transparency and a deep commitment to ethical principles first
[p.358]. The book itself calls its tools and schemes starting points rather than final answers
[p.359].

## Key facts & formulas
- Five organisational scopes: персональная, командная, проектная, функциональная, организационная —
  табл. 13.2 [p.346]; each demands its own choices for permissions, control and context management
  [p.346].
- Permission rule: personal agents may inherit the assisted person's rights; functional and
  organisational agents need explicit privileges under their assigned corporate role [p.346].
- RBAC distinction at departmental level: public / internal / restricted information, with privileges
  differing between acting for a vice-president and for an intern [p.345].
- Scope ↔ risk ↔ governance needs — табл. 13.3 [p.347]; the organisational scope's risk profile is
  "очень высокий, системного масштаба" [p.347].
- Authorisation ladder: no confirmation (personal) → per-action human approval, HITL (functional
  finance agent) → multi-level authorisation or an internal распорядительный совет reviewing
  behaviour and updates (organisational) [p.347].
- Memory partitioning by level: isolated by default / shared with controlled access / policy-managed
  with retention, logging and audit rules [p.348].
- NIST AI RMF — four core functions: govern, map, measure, manage [p.351].
- AI Impact Assessment Template — stated conformance to EU AI Act, NIST AI RMF, ISO 42001 [p.351].
- Answerability options named by the book: разработчики, операторы системы, развернувшие её
  организации [p.351].
- Four components of an ethics audit; fairness assessment ranked first-order, not an add-on [p.352].
- Three log types (решения / взаимодействия / ошибки и сбои) and three traceability questions
  [p.353]; critical domains named: здравоохранение, финансы, правосудие [p.353].
- Log protection measures: шифрование, контроль доступа, анонимизация данных [p.353].
- EU AI Act risk levels named: минимальный, высокий, недопустимый [p.355].
- Regulations named: EU AI Act, GDPR, CCPA [p.355]; HIPAA, PCI DSS, SOX [p.356].
- CI gate rule: one failed check fails the entire build [p.356].
- Policy-as-code framework named: Open Policy Agent [p.356]; model cards and datasheets shipped as
  build artefacts into the internal model registry [p.356].
- «один стандарт на большую группу» at division / functional-area level; OpenAPI named as the open
  standard against lock-in [p.37-38].
- Four principles of the path to autonomy: экспериментирование, измерение, контроль, масштаб [p.359].
- Training platforms named: Gandalf (Lakera) [p.312], Red (Giskard) [p.313], Prompt Airlines CTF
  (Wiz.io) [p.313].
- Role-shift cases: COiN (JPMorganChase) and GitLab Security Bot [p.342].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| One blanket policy for autonomy, escalation and logging across all five scopes | The book warns against it directly: each scope carries its own risk profile and governance needs | ch13-ku06 |
| Letting a functional or organisational agent inherit an employee's permissions | Those scopes require explicit privileges under a role assigned to the agent in corporate systems | ch13-ku05 |
| Treating scope assignment as a purely architectural decision | The scope also fixes what the agent *may* do and who watches it | ch13-ku05 |
| Giving one agent identical privileges regardless of whose behalf it acts on | At departmental level RBAC must separate public / internal / restricted, and a VP's mandate from an intern's | ch13-ku05 |
| Sharing memory across a scope boundary before a policy exists | Recall of shared material in a private chat, or a departmental leak into another unit, is a serious trust or compliance breach | ch13-ku07 |
| Leaving "does memory travel upward" and "may agents ask each other for context" unanswered | Both are named as the questions that must be settled explicitly, or you inherit leaks and scope creep | ch13-ku07 |
| Memory the user cannot inspect, erase or switch off | The transparency requirements demand exactly those controls, plus no hidden assumptions on stale or private data | ch13-ku07 |
| Shipping without a written answer to "who is responsible if this harms someone" | Accountability must name the answerable party — developers, operators, or the deploying organisation | ch13-ku10 |
| Inventing an accountability process from scratch | Two ready frames exist to take or adapt: NIST AI RMF and the AI Impact Assessment Template | ch13-ku10 |
| Treating NIST AI RMF or the impact template as runtime failure detection | The book describes both as frames for documenting and accounting for risk, not as detection mechanisms | ch13-ku10 |
| Bolting fairness assessment onto the end of the audit | Fairness is stated as a first-order audit task; the checks include disparate impact, bias-amplifying feedback loops, and the cost of optimising for accuracy alone | ch13-ku11 |
| A single ethics audit at launch | Agents change through updates, retraining and new data, so the audit must be a continuing iterative process | ch13-ku11 |
| Keeping the entire audit inside the building team | An independent external auditor raises transparency and reaches blind spots invisible from inside | ch13-ku11 |
| Logs that exist but nobody can read | Interpretability is a stated requirement: developers, auditors and stakeholders need accessible documentation and visualisation | ch13-ku12 |
| Unprotected logs holding confidential user data | Unauthorised access to them is itself a privacy risk; encryption, access control and anonymisation are the named measures | ch13-ku12 |
| Compliance as the last stage before launch | Legislation moves fast — what conforms today may be insufficient tomorrow; it belongs inside the pipeline and across the whole lifecycle | ch13-ku14 |
| A compliance gate that merely warns | The stated rule is that one failed check fails the whole build | ch13-ku14 |
| Policy rules living only in a document | Policy-as-code plus policy tests next to the unit and integration tests is what makes drift visible before deployment | ch13-ku14 |
| Judging adoption by technical performance alone | Approval rests on perceived usefulness, reliability and fit with existing processes and values; fast task closure does not save an agent that erodes trust | ch13-ku03 |
| Building for the "average" user | Diverging expectations of engineers, lawyers and end users must be surfaced and reconciled; the average user does not exist | ch13-ku03 |
| Reading COiN or GitLab as a rule "accuracy threshold ⇒ more autonomy" | Two cases are presented; the book does not generalise them to tasks where no such threshold is defined | ch13-ku02 |
| Standardising the agent stack before successful patterns have emerged | Premature standardisation suppresses creativity and invites rigid frameworks or vendor lock-in | ch01-ku11 |
| Leaving every team on its own toolchain indefinitely | The opposite failure: overlapping projects, duplicated effort and unfinished experiments | ch01-ku11 |
| Jumping straight to full automation | The strongest teams build trust gradually, assess results strictly and install control at the start | ch13-ku15 |
| Defining success metrics after the pilot has run | The measurement principle requires them before work begins | ch13-ku15 |

## Related decisions
- Decided a scope where actions need human approval (§2's ladder) → `aiagents-human-in-the-loop` for
  the escalation design itself: the trigger thresholds, what the handoff carries, the autonomy level,
  and how sustained oversight degrades. This skill stops at "this scope demands an approval step and
  a named overseer".
- The scope grants access to confidential corporate systems (§1) → `aiagents-agent-security` for the
  defence: least privilege as a containment barrier, injection and jailbreak interception, threat
  modelling. Governance says what is owed; security builds the perimeter.
- The compliance gate is now in CI (§7) → `aiagents-release-gates-and-rollout` for the *readiness*
  side of shipping a version — thresholds, canary, rollback. The two gates run on the same build and
  answer different questions: admissible versus good enough.
- Decision, interaction and failure logs exist for audit (§6) → `aiagents-observability-and-drift`
  for the production instrumentation those logs share pipes with: metric levels, alert thresholds,
  drift tests, PII scrubbing at the export boundary. Audit reconstruction and on-call alerting are
  different consumers of the same telemetry.
- A memory boundary is required per scope (§3) → `aiagents-knowledge-and-memory` for the mechanism
  and store behind it (RAG, vector store, memory types); this skill only draws the line the store has
  to respect.
- Memory must be visible, inspectable and switchable in the interface (§3), and adoption depends on
  perceived usefulness (§8) → `aiagents-agent-ux` for the interaction design that carries both.
- The ethics audit needs evidence to work on (§5) → `aiagents-evaluation-design` for constructing the
  measurement instrument: the book names the audit's directions but no fairness methodology and no
  cadence.
- The scope's autonomy level is being reconsidered as trust grows (§9, §11) →
  `aiagents-agent-fit-and-model-choice` when the reconsideration reopens whether an autonomous agent
  is the right level of solution at all.
- Running the resulting fleet day to day → `enterprise-agent-ops`; service management around it →
  `itsm-itil`; executing the tests behind a regulatory claim → `compliance-testing`.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 1 «Знакомство с агентами» (с. 37-38), глава 12 «Защита агентных систем» (с. 312-313), глава 13
«Взаимодействия „человек — агент“» (с. 342-349, 351-353, 355-359) — page ranges computed from the
`sources:` blocks of the 12 consumed KUs.

KUs: ai-apps-ch13-p340-ku02, ku03, ku05, ku06, ku07, ku10, ku11, ku12, ku14, ku15;
ai-apps-ch01-p24-ku11; ai-apps-ch12-p310-ku03 (`verified: partial` — the refused claims are excluded,
see §11). Deep reference: `references/knowledge-units.md`.

Anchor quotes for human spot-check:
- Scope design is socio-technical: «Проектирование таких агентов является не просто технической, а социотехнической проблемой» [p.345].
- The CI gate rule: «Если хотя бы одна проверка завершается неудачей, вся сборка считается неудачной» [p.356].

## Self-check
- [x] Every Decision-criteria subsection and every anti-pattern cites a KU id listed in
      `derived_from`?
- [x] «Источник» pages computed from the consumed KUs' `sources:` blocks, not typed from memory?
- [x] The one `verified: partial` KU (`ai-apps-ch12-p310-ku03`) has both refused claims DELETED, not
      softened, and the deletion is marked in §11?
- [x] No rule generalised out of the two role-shift cases in §9 (the book gives cases, not a rule)?
- [x] The §11 platform table headers describe the exercises only — no audience claim, no
      production-defence claim?
- [x] Description leads with scope-of-authority / accountability / compliance nouns and names both
      siblings and arsenal skills in the NOT-chain?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?

## Examples
- «Хотим агента, который сам ходит в CRM и HR-сервисы за всё подразделение. Что это меняет?» → that
  is the функциональная область: high autonomy inside its area, high risk profile, and the governance
  package that comes with it — RBAC separating public / internal / restricted, audit journals,
  compliance. It may not inherit an employee's rights: it needs explicit privileges under its own
  assigned corporate role, designed jointly by IT, data governance and the developers.
- "Who signs off when our agent gives a customer the wrong answer and it costs money?" → write the
  answerable party down before deployment — the book's options are the developers, the system's
  operators, or the deploying organisation — and take a ready frame instead of inventing a process:
  NIST AI RMF (govern / map / measure / manage, with downloadable profiles and worksheets) or the AI
  Impact Assessment Template aligned to the EU AI Act, NIST AI RMF and ISO 42001. Pair it with
  escalation routes and control policies; the runtime handoff design itself is
  `aiagents-human-in-the-loop`.
- «Командный бот процитировал в личке то, что обсуждали в общем канале.» → a scope-boundary failure
  in memory. Personal scope = isolated memory by default, sharing only on explicit permission; team
  and departmental scopes = shared spaces with controlled access; organisational = policy-managed
  retention, logging and audit. Then settle the two movement questions explicitly: does memory travel
  upward, and may agents request context from one another.
- "We need to be GDPR- and HIPAA-defensible. Where do the checks go?" → into the build, not after it:
  automated compliance gates on every build (prohibited content, personal-data leakage, fairness
  benchmarks, data-handling policy) with one failed check failing the whole build; policy-as-code
  (Open Policy Agent) with policy tests running beside the unit and integration tests so drift shows
  before deployment; live model cards and datasheets published to the internal model registry, each
  model version shipping a compliance package.
- «Пять команд независимо пилят своих агентов. Пора вводить единый стек?» → not while exploration is
  still paying: standardise once successful patterns and best practices have emerged, and then at the
  division or functional-area level («один стандарт на большую группу»), on commonly-used tooling,
  with open standards such as OpenAPI and modular design against lock-in. Keep governance light —
  guiding principles over rigid prescriptions — and re-assess the balance periodically. The book
  gives no numeric readiness criterion.
- "Legal wants an ethics audit. What does that actually contain?" → outcome assessment against
  intended goals, bias and fairness checks, analysis of decision paths, and stakeholder-impact
  assessment — with fairness as a first-order task, not an appendix — plus behaviour observation on
  edge cases and ambiguous input. Run it continuously, since updates and retraining change behaviour,
  and bring in an independent external auditor. The book names the directions but neither a cadence
  nor a fairness methodology, so the measurement design is `aiagents-evaluation-design`.
- «Юристы, инженеры и пользователи ждут разного. Как не построить агента для несуществующего
  пользователя?» → bring stakeholders in early as co-authors; fix goals through three questions
  (which outcomes must improve, which decisions the agent makes alone, what success and failure look
  like); do not reduce success to technical throughput; treat expectation gaps as a prompt to rework
  requirements and roles; invest in training, feedback loops and responsive support. Adoption here is
  change management, not deployment.
