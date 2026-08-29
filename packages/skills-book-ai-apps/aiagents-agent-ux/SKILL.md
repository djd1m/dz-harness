---
name: aiagents-agent-ux
description: >
  Shape the INTERACTION of an agentic product — the surface a person actually meets. Which modality
  carries it (текст, графический интерфейс, речь, видео) and by what criterion; the speaking-versus-
  reading speed arithmetic that settles «голос или экран»; barge-in — letting a voice agent be
  interrupted and resumed mid-utterance; синхронный versus асинхронный interaction and the distinct
  design principles each mode demands; проактивность без назойливости — when an agent may interrupt,
  through which channel, and which frequency/threshold knobs the user must own; обнаруживаемость
  возможностей for interfaces that have no visible affordances (кнопки предлагаемых действий,
  динамические предложения ввода, последовательное раскрытие, отказ с альтернативами);
  персонализация as preference storage / behaviour adaptation / proactive help with its mandatory
  reset-and-override rule; бесшовный переход between modalities without losing state; and trust built
  from прозрачность and предсказуемость — consistent demeanour, predictable edge-case handling,
  visible recovery when an external call dies, and not promising a capability the agent lacks.
  The product's INTERACTION SHAPE ONLY — NOT the autonomy level, the escalation trigger, the operator
  handoff protocol, or how human oversight itself degrades (→ `aiagents-human-in-the-loop`, which
  decides WHEN control leaves the agent; this skill designs the surface that decision is felt
  through), NOT the three ways of expressing a confidence level and its two-sided calibration
  (→ `aiagents-human-in-the-loop`), NOT the graceful-failure checklist or unexpected-input handling
  treated as behavioural invariants to test (→ `aiagents-probabilistic-behaviour-checks`), NOT
  whether an agent is warranted at all, nor the model/framework it runs on
  (→ `aiagents-agent-fit-and-model-choice`), NOT scope of authority, accountability, roles and audit
  duties when rolling agents across an organisation (→ `aiagents-org-adoption-and-governance`), NOT
  what is assembled into a model call or where session state physically lives
  (→ `aiagents-context-engineering`), NOT writing or styling the actual UI code
  (→ `frontend-design`, `design-taste-frontend`), NOT the generic discovery-and-ideation method
  (→ `design-thinking`), NOT WCAG conformance and screen-reader verification
  (→ `accessibility-testing`), NOT building an owner-facing decision page with option forks
  (→ `decision-mockups`).
  Triggers (RU+EN): "чат, дашборд или голос — в чём подавать этот сценарий",
  "стоит ли делать голосового ассистента здесь", "пользователи не понимают, что умеет наш помощник",
  "как показать, что запрос обрабатывается, а не завис",
  "уведомления раздражают, но молчать тоже нельзя",
  "человек перебивает на середине фразы — как это обработать",
  "синхронный диалог или фоновая задача с отчётом по завершении",
  "как отказать в запросе, не оттолкнув пользователя",
  "одинаковые вопросы получают разный по уверенности ответ, доверие падает",
  "персонализация без ощущения слежки",
  "начал голосом за рулём, продолжил текстом — контекст обязан сохраниться",
  "аватар или видеоагент — оправдано или зловещая долина",
  "voice or screen for this workflow", "users can't discover what the assistant is able to do",
  "proactive notifications without being annoying",
  "should this run in the background and send a summary instead",
  "the assistant just went silent when the API failed".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from:
  - ai-apps-ch03-p66-ku01
  - ai-apps-ch03-p66-ku02
  - ai-apps-ch03-p66-ku03
  - ai-apps-ch03-p66-ku04
  - ai-apps-ch03-p66-ku05
  - ai-apps-ch03-p66-ku06
  - ai-apps-ch03-p66-ku07
  - ai-apps-ch03-p66-ku08
  - ai-apps-ch03-p66-ku10
  - ai-apps-ch03-p66-ku11
  - ai-apps-ch03-p66-ku14
  - ai-apps-ch03-p66-ku15
  - ai-apps-ch03-p66-ku19
  - ai-apps-ch01-p24-ku07
---

# Agent UX — the modality, the tempo, and what the interface shows when the agent is unsure

## Output
An interaction-design section for the ADR / architecture step: the chosen modality (or modality mix)
with the criterion that selected it, a synchronous/asynchronous classification per interaction type
with the design principles each one obliges, the proactivity policy (when the agent may interrupt,
through which channel, which knobs the user controls), the discoverability plan for capabilities that
have no visible affordance, the personalisation scope with its transparency and reset rules, and the
trust contract — what the interface shows on an edge case, on a refusal, and on a dead external call.

## When to use / NOT
- **Use when:** picking the modality for a new agentic product, or arguing against a modality someone
  already picked; deciding whether a workflow belongs in a live chat or in a background task that
  reports back; users cannot tell what the agent is able to do, or keep probing it by trial and
  error; notifications are either drowning people or arriving too late to be useful; a voice agent
  feels robotic because it cannot be interrupted or corrected mid-request; the same request produces
  a differently-confident-sounding answer each time and trust is eroding; the agent goes silent
  instead of explaining a failure; a session begun in one modality has to continue in another; you
  are deciding how far the product may adapt itself to an individual user.
- **NOT for:** deciding *whether* the agent should stop and hand control to a person, at what
  uncertainty or consequence threshold, through what review protocol, and how that oversight decays
  over time — that is `aiagents-human-in-the-loop`; this skill takes the escalation decision as given
  and designs how it appears to the user. Not the mechanics of expressing a confidence level, nor
  the two-sided calibration between over-hedging and over-asserting (also
  `aiagents-human-in-the-loop`). Not the graceful-failure checklist or unexpected-input robustness
  treated as behaviour to be tested (→ `aiagents-probabilistic-behaviour-checks`). Not the
  level-of-solution or model/framework decision (→ `aiagents-agent-fit-and-model-choice`). Not
  organisational rollout, authority, accountability or audit (→ `aiagents-org-adoption-and-governance`).
  Not per-call context assembly or session-state placement (→ `aiagents-context-engineering`). Not
  writing the components, the CSS or the visual system (→ `frontend-design`, `design-taste-frontend`),
  not generic discovery workshops (→ `design-thinking`), not WCAG conformance testing
  (→ `accessibility-testing`), not building an owner-facing decision page (→ `decision-mockups`).

## Decision criteria

### 1. Pick the modality by what dominates the scenario (KU: ch03-ku01)
Restructured from табл. 3.1, гл. 3, с. 66 around the question *what dominates this use case*. The last
column reproduces the prevalence label the book itself attaches to each row — it is a statement about
how widespread the modality is, not a recommendation strength:

| If the scenario is dominated by… | Take | Examples the book names | Prevalence per the book |
|---|---|---|---|
| Precise asynchronous communication, or search | Текст [p.66] | support bots; personal-productivity assistants [p.66] | очень часто [p.66] |
| Visual structure, context control, multi-stage workflows | Графический интерфейс [p.66] | flow-orchestration consoles; in-IDE assistants such as Cursor [p.66] | часто [p.66] |
| Hands-free operation or natural dialogue | Речь / голос [p.66] | Siri; Alexa and Google Home; call-centre automation [p.66] | не так часто [p.66] |
| Visual demonstration, expressive range, immersive teaching | Видео [p.66] | virtual mentors; therapy avatars; interactive teaching agents [p.66] | редко [p.66] |

Condensed strengths: text buys clarity and traceability; graphics buy visual density and
at-a-glance comprehension; voice buys free hands; video buys real-time dynamic communication [p.67].

Two honesty constraints attached to this table by the source itself: the field moves fast enough that
new interface paradigms and modality combinations keep appearing [p.66], and these strengths are
frequently combined rather than chosen exclusively — see §6 [p.80]. **Deliberately not built here:**
a ranking or a migration ladder between the four rows. The book lays them out side by side and
attaches a prevalence label; it draws no path from one row to the next, so a table promising that
would assert more than the source.

### 2. Text: the modality that hides its own capabilities (KU: ch03-ku03, ch03-ku02)
The defining weakness: unlike a GUI, where buttons and menus advertise the available actions, a text
agent forces the user to guess or recall what exists [p.69]. Everything below exists to compensate for
that.

Checklist for a text agent [p.69-71]:

- [ ] **Announce the capabilities actively** — in the greeting, and again periodically in the flow
      [p.70]. The book's contrast: instead of a bare offer of help, name the concrete things —
      cancelling an order, checking delivery status, updating the account [p.70]. This reduces
      trial-and-error probing [p.70].
- [ ] **Answer clearly** — concise and unambiguous, without jargon or sprawling explanation [p.70].
- [ ] **Keep context across a multi-step dialogue** — never make the user restate what they already
      said or re-explain earlier instructions [p.70].
- [ ] **Handle errors** — a clear failure message plus a fallback: escalation to a human operator, or
      an alternative offer [p.70].
- [ ] **Manage turn-taking** — decide when to ask a clarifying question and when to pause for input
      [p.70].
- [ ] **Recognise intent** against the ambiguity of natural language: people phrase requests in
      unexpected ways [p.70].
- [ ] **Calibrate answer length** — too short is unintelligible, too long overloads and irritates
      [p.70].
- [ ] **Carry emotional nuance in wording** — with no tone of voice or facial expression available,
      sympathy, friendliness or urgency exist only in carefully written text [p.70].

Fits where precision, traceability and asynchrony are valued: customer support, productivity tools,
extraction from structured bases, chat surfaces inside Slack / Teams / WhatsApp, text-heavy work
[p.70-71].

**Case pattern — the AI terminal (KU: ch03-ku02).** The classic command line punishes syntax errors
and demands memorised flags, which is why only specialists use it [p.68]. Wiring a foundation model
into the shell turns it into a conversational partner: ordinary wording becomes runnable commands
(Рис. 3.1 [p.69]). The book's examples: Warp adds natural-language command translation, intelligent
completion and contextual explanation [p.68]; Claude Code and Gemini CLI add code generation,
execution and file operations inside the terminal, so a complex task is stated as a goal in English
[p.68]. The AI terminal reads intent, suggests good practice and debugs errors as they happen [p.69];
the effect is that system operations, scripting and data flows open up to newcomers as well as
experts [p.69]. It inherits the discoverability problem of every text interface [p.69] — so §10 still
applies to it.

### 3. Graphical and generative interfaces (KU: ch03-ku04)
Where it wins: visual representation cuts cognitive load, because visual information is processed
faster than text [p.71]. The book's levers — progress indicators, colour coding, urgency icons — steer
action without lengthy explanation [p.71]; a workflow-agent dashboard shows outstanding tasks,
completed phases and error alerts, so system state reads at a glance [p.71]. Visual orchestration
tools (LangSmith, n8n, Arize, AutoGen) render agent workflows for comprehension, debugging and
analysis [p.71]: in Рис. 3.2 [p.72] the n8n canvas draws steps, tool calls, branches and results as
linked nodes, so a complex flow is readable without dropping to code [p.71-72]. Рис. 3.3 [p.73]
covers AI-enabled IDEs of the Cursor / Windsurf / Cline class, embedding natural language into the
coding flow — questions, generation, refactoring, explanation in one GUI [p.72].

**Generative UI** replaces the static dashboard: interface elements, visualisations and structured
results are produced dynamically from the user's request [p.72] — the book's example is Perplexity AI
generating knowledge maps, link lists and data tables for the specific question asked [p.72]. What it
requires to be usable [p.73]: the generated elements must be useful *and* aesthetically coherent, and
the layout must be protected from being flooded with badly organised or redundant information — which
takes deliberately chosen design patterns, frames that constrain the layout, and priority rules. The
book flags generative UI as a young direction carrying its own quality and consistency problems
[p.72-73].

Traditional GUI obligations that do not go away [p.73-74]: prioritising information within a limited
screen area; responsiveness (real-time updates and smooth state transitions while the agent works
asynchronously); adaptation across devices and screen sizes.

**The automation/control balance [p.74]:** combine the agent's autonomy with user action — approval of
a proposed decision, manual override. The book's illustration is calendar-change options rendered as
buttons so the final decision stays with the person [p.74]. Note the seam: designing *the buttons and
the moment of approval* is this skill; deciding *which classes of action require approval at all* is
`aiagents-human-in-the-loop`.

### 4. Voice: the perception-speed rule, and barge-in (KU: ch03-ku05, ch03-ku06)
The book calls the human information-processing rate the key factor in deploying voice interfaces
[p.76]. The numbers it gives: speech runs at 150–180 words per minute, average reading at 250–300,
and skimming can exceed 500 [p.76]. The consequence for a designer: on dense or tangled material the
voice channel becomes the bottleneck, because the eye takes in the same volume several times faster —
so complex content belongs on a screen rather than in a dialogue [p.76].

The selection rule as stated [p.78]: voice for short hands-free tasks, quick queries and
action-oriented flows; **not** for large volumes of information or complex decisions that need rapid
scanning or side-by-side comparison of options. Voice wins where free hands, live conversation and
immediate response outweigh the loss in perception speed [p.76] — driving, cooking, operating
machinery [p.75] — and separately as an accessibility route for people with limited vision or
movement [p.75]. Industry scenarios the book names [p.78]: clinical note-taking during a
consultation; replacing rigid IVR (interactive voice response) trees with natural dialogue in
support; equipment control and observation logs in industry without leaving the primary task.

Maturity caveat carried from the source: voice remains a frontier technology — multi-stage
context-aware voice agents have not yet reached broad industrial use [p.76]; the historical blocker
was speech-processing latency, cut down only over the two years preceding the book [p.75].

**Barge-in — interruption handling (KU: ch03-ku06).** Conversation is not linear: people interrupt,
switch topic and revise a request mid-sentence, and an agent that cannot follow that feels unnatural
[p.75]. The principle: allow the command to be interrupted without confusion, let the input be
revised, and continue from the interruption point instead of restarting [p.75]. The book's example is
a restaurant booking corrected from Friday to tomorrow mid-utterance, with the agent picking up the
correction rather than demanding the order be retyped [p.75]. This is a trust mechanism: the agent
answers real communication patterns instead of demanding rigid machine-shaped input [p.75].

Minimal implementation the book supplies [p.76-77] — a FastAPI service bridging the browser to the
OpenAI Realtime Voice API: the browser streams mono 16-bit PCM chunks as base64 over a WebSocket, the
service forwards them (`input_audio_buffer.append`) and relays the assistant's audio deltas
(`response.audio.delta`) back [p.76-77]. Constants of that example:

```
model            = gpt-4o-realtime-preview-2024-10-01
voice            = "alloy"
PCM_SR           = 16000
port             = 5050
turn_detection   = server_vad
```

The interruption mechanism itself [p.76-78]: on `input_audio_buffer.speech_started` — the user has
begun speaking — the agent sends `conversation.item.truncate` for the assistant's current `item_id`
with `audio_end_ms: 0`, which stops the assistant's output immediately and preserves the natural flow
of the conversation.

Two source-fidelity notes. The printed listing on с. 76-78 is damaged by typesetting — Python
indentation is lost and constants are split across lines — so it will not run as printed without
restoring the formatting. And the example is deliberately minimal: audio only, with a single
server-side VAD mechanism [p.77]; the tool calls that a real voice agent adds — booking meetings,
changing configurations, taking orders by voice [p.75-76] — are absent from it. The model id and
protocol field names are tied to a version of the Realtime API and will age (extractor's note).

### 5. Video: when expressiveness is worth the three risks (KU: ch03-ku07)
The upside is channel fusion — visual, spoken, overlaid text and animation combined into expressive
interaction, with simulated expression and gesture adding emotional colour [p.79]. The book's example
is a support avatar using facial expression, gesture and visible signs of empathy to rebuild the trust
of an unhappy customer [p.79].

Three risks, exactly as the book names them [p.79]:

| Risk | What it looks like in production |
|---|---|
| Technical | quality video needs substantial compute and bandwidth; a shortfall shows up as latency and pixelation [p.79] |
| «Зловещая долина» | even slightly unnatural expression, gesture or lip-sync produces discomfort instead of engagement — and many implementations still sit in that zone [p.79] |
| Конфиденциальность | some users are actively unwilling to share visual data with an AI system [p.79] |

The book's outlook [p.79-80]: growth as rendering, real-time animation and network optimisation
improve; nearest applications are agents in virtual meetings, augmented-reality (AR) overlays and
support avatars [p.79]; industries named are telemedicine, education, remote collaboration and
interactive entertainment [p.80]. That is a forecast, not a measurement — the practical instruction
that follows is to assess the maturity of the technology at the moment you design, since the book
itself classes video as a new and still-developing modality [p.79].

### 6. Combining modalities: the seam is the design (KU: ch03-ku08)
Users do not think in modality boundaries — they want to reach a goal as easily and naturally as
possible, and the best experience often comes from several modalities together [p.80]. The book's
marker of a well-designed agentic system is the ability to move between modalities seamlessly, with
state and context preserved [p.80]. Its scenarios: start by voice while driving, continue in text
during a meeting, review a graphical summary dashboard on a laptop; a voice assistant reads out a
report summary before sending the detailed text version with charts by email [p.80].

Two implementation requirements [p.80]:

1. **Careful state and context management** — information, task progress and preferences must not be
   lost at the transition.
2. **Adapt the communication style to the modality** — for example compact spoken summaries alongside
   a more detailed textual output meant for analysis.

The priority frame the book closes on [p.80]: success is not demonstrating the newest modality
integrations or generative UI, but understanding users deeply, meeting them where they are, and
building intuitive, trustworthy interactions that solve real problems.

Boundary: *whether* the state survives the jump is a storage decision — client, server or hybrid —
owned by `aiagents-context-engineering`. This skill owns the fact that the seam must be invisible and
that the style has to change with the channel.

### 7. Synchronous or asynchronous, and what each mode obliges (KU: ch03-ku10, ch01-ku07)
The classification question is whether a person is left sitting in a prolonged wait [p.84]. The rule
[p.83-84]: synchronous for immediate feedback and on-the-spot decisions (chats, voice, real-time
collaboration tools); asynchronous for long operations, background processing and tasks that do not
need continuous attention (email, task alerts, end-of-process reports). The choice follows the nature
of the task, user expectations and context [p.84], and mixed systems use both [p.84].

Restructured from гл. 3, с. 84-85 as a per-mode obligation list — the two columns are the book's own
two principle sets, not a progression between them:

| Синхронный режим must provide [p.84] | Асинхронный режим must provide [p.85] |
|---|---|
| Low latency and context awareness, against irritating pauses and repeated questions | An explicit task and result status: what the agent is doing, at which stage, when the next update comes |
| Clarity and brevity first — long explanations break the real-time rhythm | Notifications, digests and structured reports as the transparency instruments; the book's example is a reporting agent that announces the start, gives a completion estimate, and delivers a compact actionable summary |
| Turn-taking mechanics: when to answer, when to wait, when to escalate | Historical context maintained across long pauses — no re-stating information, no walking back through earlier steps |
| Visible activity cues (typing / progress indicators) so the user is sure the input is being processed | Expectation management: understandable time intervals, progress indicators and accompanying notifications, against the dissatisfaction that uncertainty breeds |
| Recovery from misunderstandings without losing the thread: clarifying questions or a gentle redirect, never a risky assumption [p.84] | — |

**The asynchronous product pattern — work arrives already prepared (KU: ch01-ku07).** Agents are built
for asynchronous operation: several tasks in parallel, fast adaptation to new information, priorities
that shift with conditions — which cuts idle time and optimises compute [p.30]. What that changes on
the surface [p.30-31]: mail arrives with draft replies ready; invoices with payment details attached;
developer tickets with a candidate fix and unit tests to check; support cases with suggested replies
and recommended actions; security alerts already verified and enriched with threat data. The human
role shifts from doing the task to overseeing it — strategic supervision, review, and the important
decisions — acting ahead of events rather than reacting [p.31].

Two boundaries on that pattern. The book states it descriptively and does not open the coordination
mechanics of asynchronous tasks (extractor's note) — so do not read it as an implementation recipe.
And *how much* authority the supervising human retains, at which point they must intervene, and how
that supervision decays, is `aiagents-human-in-the-loop`; this skill owns the delivery shape — that
the artefact reaches the person pre-assembled and reviewable rather than as raw output.

### 8. Proactivity without intrusion, and how far to personalise (KU: ch03-ku11, ch03-ku14)
The failure mode this section prevents: notifications that break the workflow and lead to the agent
being abandoned [p.85].

Two keys to the balance [p.85-86]:

1. **Contextual awareness** — the agent keeps in mind what the person is doing right now, which
   channel they prefer, and how urgent the matter is. The book's contrast: a proactive notification
   during an important video call is an obstruction, while an email notice that a task finished is
   appropriate [p.85-86].
2. **User control** — notification frequency, communication channels and escalation thresholds are
   configurable to the person's own needs [p.86].

The relevance rule [p.86]: alerts and recommendations must solve a problem or deliver something
valuable, not add information noise. The book's summary of a good design [p.86]: proactive
participation is woven into the work, improving productivity without dominating — which means
accounting for the user's workflow and current frame of mind, not only for what is technically
possible. The book gives **no numeric thresholds** for notification frequency; calibration stays a
product decision (extractor's note).

**Personalisation — three forms [p.88]:** storing preferences (notification settings, frequently
chosen options); adapting behaviour (response style and interaction flow, from observed patterns);
proactive help (anticipating needs and offering suggestions from past behaviour). Examples: a
project-management agent that recognises the preferred task-tracking style and adapts its alerts and
digests; a support agent that adjusts tone and level of detail between terse answers and full
explanations [p.89]. **These are three named forms, not three maturity levels** — the book lists them
without ordering them, so do not build a rollout ladder on top.

Safety rules the book attaches to personalisation [p.89]:

- [ ] **Transparency** — explain which data is stored and how it is used.
- [ ] **Reset and override are always available** — the balance between useful adaptivity and
      intrusiveness depends on it.
- [ ] **The benchmark**: personalisation is unobtrusive yet consequential — the agent improves the
      experience quietly, without drawing attention to the fact, like a perceptive colleague rather
      than an algorithmic instrument [p.89].

Privacy handling is a stated requirement of this section [p.89]; the perimeter and the controls that
enforce it belong to `aiagents-agent-security`.

### 9. Making the capabilities discoverable (KU: ch03-ku15)
The problem this solves: agentic systems, text and voice ones above all, lack visible affordances —
the properties that hint at what actions exist — so the user is left guessing at the boundary of what
the agent can and cannot do [p.89].

Patterns for conveying capability [p.89-90]:

- [ ] **Suggested-action buttons under the input field** — frequent or contextual actions («Отследить
      заказ», «Резюмировать», «Создать повестку встречи») route the user into supported flows without
      memorising commands.
- [ ] **A tutorial or interactive tour on first use.**
- [ ] **Expandable menus / capability cards** — a structured inventory (for instance a sidebar with
      data-loading, analysis, summarisation and automation sections): a familiar menu structure plus
      an explicit boundary of what exists.
- [ ] **Dynamic input suggestions** — typing «Назначить…» surfaces «Назначить встречу с [имя]»,
      bridging informal language and a structured tool call.
- [ ] **A proactive greeting that lists the capabilities** at the start of the session.
- [ ] **Refusal with alternatives instead of a bare rejection** — the book's own line:
      «Я не могу обрабатывать платежи напрямую, но могу обновить твои предпочтения по выставлению
      счетов или связать с оператором» [p.90].

Dosage rules [p.90] — the book is explicit that overwhelming the user with options is the opposing
failure:

- [ ] **Progressive disclosure** — basic capabilities first, advanced ones as the user's confidence
      grows.
- [ ] **Contextual relevance** — show the actions most likely given the current input, behavioural
      history, or stage of the flow.
- [ ] **Visual grouping and a clear hierarchy** of menus and actions.

Per modality [p.90-91]: text chats get quick-reply buttons and example prompts; graphical dashboards
get capability cards and tooltips; voice gets **only a few top-priority options at a time**, which the
book prescribes directly against cognitive overload; generative UI combines natural language with
dynamic visual output whose possibilities are immediately visible. The closing point [p.91]: the goal
is not enumerating functions but designing interactions in which people use those functions
confidently — which is what turns the agent from a black box into a legible working partner.

Source note: the greeting example on с. 90 contains a typo in the Russian edition («я могут помочь»
for «я могу помочь») — do not copy it verbatim into a product string.

### 10. Trust: transparency and predictability (KU: ch03-ku19)
The stake: without trust even a state-of-the-art agentic system spreads badly, whatever it can do
[p.93]. The book calls transparency and predictability the two most powerful instruments for building
it [p.93] — **two instruments, not a ranked pair**.

**Прозрачность [p.94]:**

- Communicate capabilities *and* limitations clearly, so the user is not left guessing whether a task
  is even within the agent's competence.
- Explain actions: how a recommendation was reached, why a request was declined, how an ambiguous
  instruction was read. This also lets the user sharpen their instructions, improving later
  interactions.
- Dose it: do not overload with detail — show what is needed for confidence rather than every step of
  the reasoning, using visual cues, status messages and short explanations. Transparency is therefore
  *not* a full reasoning log; excess detail creates cognitive overload [p.94].

**Предсказуемость / надёжность [p.94-95]:**

| Property | What the interface must guarantee |
|---|---|
| Consistency | the same question under the same conditions produces the same result; where variability is unavoidable — the probabilistic output of language models — signal explicitly that the answer is uncertain or context-dependent [p.94] |
| Stable demeanour | erratic behaviour undermines trust even when it is technically correct; the book's example is caution in one case and excessive confidence in a nearly identical one [p.94] |
| Predictable edge cases | a clarifying question, a neutral fallback answer, or escalation [p.95] |
| Resilience | recover from errors, hold state, prevent cascading failure; when the connection to an external API is lost — notify, explain, propose the next step, rather than fail silently [p.95] |
| Keeping promises | a task the agent claims it performs must be performed every time; broken promises damage trust more than an honest early admission of a limitation [p.95] |

Two seams to respect here. *Signalling that an answer is uncertain* is listed above as a
predictability obligation of the interface; the three ways of expressing a confidence level and the
calibration between over-hedging and over-asserting are `aiagents-human-in-the-loop`. And *escalation*
appears here only as one of the predictable edge-case outcomes — the threshold that triggers it and
the review protocol behind it are that same sibling's. The failure-behaviour checklist as a set of
invariants to be tested belongs to `aiagents-probabilistic-behaviour-checks`.

## Key facts & formulas
- Speech: 150–180 words per minute; average reading 250–300; skimming can exceed 500 [p.76].
- Voice rule: short hands-free tasks, quick queries, action-oriented flows — not large volumes of
  information or decisions needing rapid scanning and comparison [p.78].
- Four modalities and the book's prevalence labels: текст — очень часто, GUI — часто, речь — не так
  часто, видео — редко [p.66].
- Modality strengths in one line: text = clarity and traceability; graphics = visual density; voice =
  free hands; video = real-time dynamic communication [p.67].
- Realtime voice bridge constants: `gpt-4o-realtime-preview-2024-10-01`, voice `alloy`, `PCM_SR =
  16000`, port `5050`, `turn_detection: server_vad` [p.76-77]; audio is mono 16-bit PCM in base64 over
  a WebSocket [p.76].
- Barge-in wire sequence: `input_audio_buffer.speech_started` → `conversation.item.truncate` on the
  assistant's current `item_id` with `audio_end_ms: 0` [p.76-78].
- Speech-processing latency, the historical blocker for voice, dropped sharply only in the two years
  before the book [p.75].
- Three video risks: technical (compute/bandwidth → latency and pixelation), the uncanny valley,
  privacy [p.79].
- Two keys to proactivity: contextual awareness and user control over frequency, channels and
  escalation thresholds [p.85-86].
- Three forms of personalisation: preference storage, behaviour adaptation, proactive help [p.88].
- Two trust instruments: transparency and predictability [p.93].
- Source defects to know about: the Realtime listing on с. 76-78 lost its Python indentation in
  typesetting [p.76-78]; the greeting example on с. 90 has a typo in the Russian edition [p.90].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Voice for a task where the user must scan or compare many options | Speech runs 150–180 wpm against 250–300 for reading; dense material makes the voice channel the bottleneck | ch03-ku05 |
| Opening a text agent with a bare offer of help | Text carries no visible affordances, so the user probes by trial and error; the prescription is to name concrete capabilities up front | ch03-ku03, ch03-ku15 |
| A voice agent that restarts the whole request when the user corrects himself mid-sentence | Conversation is non-linear; the requirement is to accept the interruption and resume from that point | ch03-ku06 |
| Copying the printed Realtime listing straight into a project | Typesetting destroyed the Python indentation and split constants across lines — it will not run as printed | ch03-ku06 |
| Shipping a generative UI that renders whatever the model emitted | Usefulness and aesthetic coherence are requirements, and layout must be defended by design patterns, layout frames and priority rules | ch03-ku04 |
| Treating a modality demo as the product goal | The stated measure of success is understanding users and solving real problems, not showcasing the newest integration | ch03-ku08 |
| Losing task progress and preferences when the user switches channel | Seamless movement between modalities with state and context preserved is the book's marker of good agentic design | ch03-ku08 |
| Reusing one communication style across voice and text | Style has to be adapted per modality — compact spoken summaries versus detailed text for analysis | ch03-ku08 |
| A long-running async task that simply goes quiet | Asynchronous design owes explicit status, an expected interval, and a compact summary at the end | ch03-ku10 |
| Long explanations inside a real-time channel | They break the rhythm the synchronous mode depends on; brevity comes first there | ch03-ku10 |
| Guessing the user's meaning when the exchange goes off the rails | Recovery is by clarifying question or gentle redirect, never a risky assumption | ch03-ku10 |
| Handing an asynchronous result over as raw output for the human to work up from scratch | The pattern is work arriving prepared — draft reply, candidate fix with tests, verified alert — so the person supervises rather than executes | ch01-ku07 |
| A proactive notification pushed into an important meeting | Contextual awareness of what the person is doing, their preferred channel and the urgency is one of the two keys to non-intrusive proactivity | ch03-ku11 |
| No user control over notification frequency, channels or escalation thresholds | User control is the other key; without it useful proactivity turns into abandonment of the agent | ch03-ku11 |
| Personalisation with no reset or override path | The book requires both, as the balance between useful adaptivity and intrusiveness | ch03-ku14 |
| Adapting behaviour from stored history without explaining what is stored | Transparency about which data is kept and how it is used is a stated condition of personalisation | ch03-ku14 |
| Listing every capability at once, especially by voice | The prescription is progressive disclosure and, for voice specifically, only a few top-priority options at a time | ch03-ku15 |
| Rejecting an out-of-scope request flatly | The pattern is refusal with alternatives — state the limit and offer what is possible instead | ch03-ku15 |
| Exposing the entire chain of reasoning and calling it transparency | Excess detail is cognitive overload; show what is needed for confidence, via cues, status messages and short explanations | ch03-ku19 |
| Answering a near-identical question cautiously one time and confidently the next | Erratic behaviour undermines trust even when each answer is technically correct | ch03-ku19 |
| Failing silently when an external API is unreachable | The obligation is to notify, explain and propose a next step | ch03-ku19 |
| Advertising a capability the agent does not reliably deliver | Unkept promises damage trust more than an early honest admission of the limit | ch03-ku19 |
| Video avatars shipped without checking rendering quality, latency and user attitude to sharing visual data | The three named risks are technical cost, the uncanny valley, and privacy resistance | ch03-ku07 |

## Related decisions
- Chose a modality where progress and status are invisible (voice, async background work) →
  `aiagents-human-in-the-loop`: the escalation route becomes the only recovery the user has, so its
  threshold and protocol must be designed there before this interface is finalised.
- Put approval buttons on the agent's proposals (§3) → `aiagents-human-in-the-loop` decides which
  action classes may never proceed unapproved; this skill only renders the moment.
- Decided the interface must signal uncertainty (§10) → `aiagents-human-in-the-loop` for how a
  confidence level is actually expressed and calibrated.
- Committed to a seamless modality switch (§6) → `aiagents-context-engineering`: continuity is only
  as good as where the between-call state lives (client / server / hybrid) and what is re-assembled
  into the next call.
- Chose personalisation from stored history (§8) → `aiagents-knowledge-and-memory` for the mechanism
  and store behind those preferences, and `aiagents-agent-security` for handling the personal data
  the section requires you to be transparent about.
- Promised consistency as a trust property (§10) → `aiagents-probabilistic-behaviour-checks` supplies
  the run-to-run consistency and failure-behaviour tests that turn that promise into something
  measurable; `aiagents-evaluation-design` builds the instrument.
- Decided the agent is proactive and notification-driven (§8) →
  `aiagents-observability-and-drift`: notification volume and dismissal behaviour are signals worth
  instrumenting once the product is live.
- The agent is going to many teams with differing tolerance for proactive interruption →
  `aiagents-org-adoption-and-governance` for authority scope and accountability, not this skill.
- The chosen modality constrains the model (voice needs realtime audio, video needs rendering) →
  `aiagents-agent-fit-and-model-choice` for the model side of that trade.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 1 «Знакомство с агентами» (с. 30-31) и глава 3 «UX-дизайн для агентных систем» (с. 66-81,
83-86, 88-91, 93-95) — page ranges computed from the `sources:` blocks of the 14 consumed KUs.

KUs: ai-apps-ch03-p66-ku01, ku02, ku03, ku04, ku05, ku06, ku07, ku08, ku10, ku11, ku14, ku15, ku19;
ai-apps-ch01-p24-ku07. Deep reference: `references/knowledge-units.md`.

Anchor quotes for human spot-check:
- On trust: «Доверие копится по каплям, а теряется ведрами» [p.93].
- Refusal with alternatives: «Я не могу обрабатывать платежи напрямую, но могу обновить твои
  предпочтения по выставлению счетов или связать с оператором» [p.90].

## Self-check
- [x] Every criterion and anti-pattern traces to a KU listed in `derived_from`?
- [x] «Источник» pages computed from the consumed KUs' `sources:` blocks?
- [x] All 14 consumed KUs are `verified: true` — no `partial` exclusion applies in this cluster?
- [x] No escalation ladder invented over the four modalities, the three personalisation forms, or the
      two trust instruments (the book lists them without ordering)?
- [x] Uncertainty-expression (ch03-ku16) and the graceful-failure checklist (ch03-ku18) left to
      `aiagents-human-in-the-loop` and `aiagents-probabilistic-behaviour-checks` — not absorbed?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?

## Examples
- «Делаем ассистента для складских операторов — голос или экран?» → voice fits the hands-busy part:
  short action-oriented commands, equipment control, observation logs. But anything the operator must
  compare or scan goes to a screen, because speech delivers 150–180 words a minute against 250–300 for
  reading. Expect a mixed design, and plan the seam so the state survives the switch.
- "Users keep asking our chatbot things it can't do, then leave." → this is the discoverability
  failure of text interfaces: no visible affordances. Replace the generic greeting with a named list
  of capabilities, add suggested-action buttons and dynamic input suggestions, and turn every refusal
  into a refusal-with-alternatives. Disclose progressively so the list itself does not overwhelm.
- «Отчёт агент строит 20 минут — держать пользователя в чате?» → classify it as asynchronous: state
  the start, give an expected completion interval, show progress, and deliver a compact actionable
  summary at the end. Keep the historical context so the person does not have to re-explain anything
  when the result lands.
- "Our voice agent makes people repeat the whole booking when they change their mind halfway." →
  barge-in: on the user's speech-start event, truncate the assistant's current audio item and resume
  from the correction point instead of restarting. The book's minimal bridge does this with
  `input_audio_buffer.speech_started` → `conversation.item.truncate` at `audio_end_ms: 0`.
- «Хотим проактивные подсказки, но боимся, что задолбаем.» → the two keys are contextual awareness
  (what the person is doing right now, which channel, how urgent) and user control (frequency,
  channels, escalation thresholds). Every alert must solve a problem rather than add noise. The book
  gives no numeric frequency threshold — that calibration is yours to measure.
- "Should we build a talking avatar for support?" → weigh the three named risks first: compute and
  bandwidth (latency, pixelation), the uncanny valley — where many implementations still sit — and
  users who refuse to share visual data. The book classes video as the rarest modality and still
  developing; assess its maturity at the moment you design rather than on the forecast.
- «Одинаковые вопросы получают то осторожный, то уверенный ответ — пользователи жалуются.» → that is
  the predictability half of trust: same conditions, same result; where variability is inherent,
  signal it explicitly instead of letting the tone swing. Erratic behaviour costs trust even when each
  individual answer is right.
