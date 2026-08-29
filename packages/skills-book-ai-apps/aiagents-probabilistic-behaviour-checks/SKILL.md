---
name: aiagents-probabilistic-behaviour-checks
description: >
  Test the NON-deterministic layer of an agent's behaviour, where the same input legitimately
  produces a different output: consistency as behaviour INVARIANTS instead of byte identity (the
  mandatory step the agent must take however the user phrases the request), coherence across a long
  multi-turn dialogue (no self-contradiction, no forced repetition, no drift off the topic), the four
  hallucination-reduction levers (grounding with cross-checked trusted sources, source freshness and
  knowledge-base audit, feedback loops, hybrid human-AI confirmation) plus the cost-of-hallucinations
  trade-off, robustness to unexpected / malformed / out-of-distribution input where the pass criterion
  is clarify-degrade-escalate rather than crash-or-fabricate, and the triage rule that separates a
  systematic failure from legitimate probabilistic variation (rerun three-to-five times, >80 % failure
  rate, in-bounds deviation logged for later drift work). The probabilistic-behaviour LAYER ONLY —
  NOT building the evaluation instrument underneath it: metric mix, evaluation set, eval-case format,
  per-tool unit tests, planner and memory scoring, the end-to-end harness and its CI wiring
  (→ `aiagents-evaluation-design`); NOT adversarial input treated as an ATTACK — prompt injection,
  jailbreak, red-teaming, threat modelling, guardrails (→ `aiagents-agent-security`), while malformed
  and out-of-distribution input as a ROBUSTNESS property is exactly what is here; NOT production
  telemetry, dashboards, alert thresholds or drift detection over time (→
  `aiagents-observability-and-drift`) — the triage tree's CLASSIFICATION rule is here, the running
  system it feeds is there; NOT release-readiness thresholds, blocking gates, canary or rollback
  (→ `aiagents-release-gates-and-rollout`); NOT the autonomy level and the escalation policy itself
  (→ `aiagents-human-in-the-loop`), NOT the product's overall interaction and trust design
  (→ `aiagents-agent-ux`) — only the observable clarify/degrade/escalate contract the robustness test
  asserts; NOT ordinary regression suites and test-case design technique (→ `ai-regression-testing`,
  `test-design-techniques`), NOT grading one model answer (→ `answer-assessor`), NOT the harness-local
  critique tooling (→ `adversarial-verifier`, `verification-quality`).
  Triggers (RU+EN): "агент даёт разные ответы на один и тот же запрос — это баг или норма",
  "агент противоречит сам себе в длинном диалоге", "как проверить, что модель не выдумывает факты",
  "снижение галлюцинаций через заземление и RAG", "опечатка в номере заказа — вызвался не тот
  инструмент", "что делать при непонятном вводе: уточнить, деградировать или эскалировать",
  "уточняющий вопрос вместо рискованного предположения", "корректное преодоление сбоя, graceful
  degradation", "сбой систематический или просто вариация", "same prompt different answer — real
  regression or noise", "test run-to-run consistency of an LLM agent", "it contradicts what it said
  ten turns ago", "feed malformed and out-of-distribution input and see what breaks", "flaky failure
  or expected non-determinism".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch09-p238-ku12, ai-apps-ch09-p238-ku13, ai-apps-ch09-p238-ku14, ai-apps-ch09-p238-ku15, ai-apps-ch03-p66-ku17, ai-apps-ch03-p66-ku18, ai-apps-ch10-p257-ku02]
---

# Probabilistic-behaviour checks — the agent is allowed to answer differently; it is not allowed to answer inconsistently

## Output
A behaviour-check plan that lands in an ADR, a test-strategy step or a code review, on top of an
already-designed evaluation harness: the list of **behaviour invariants** each critical flow must hold
under sampling variation; the **extended-dialogue simulations** that probe coherence and the
contradiction types that count as violations; the **hallucination-reduction levers** actually wired in
(grounding, source-freshness audit, feedback loop, human confirmation) and the ones consciously
skipped; the **unexpected-input suite** with its case sources and its clarify/degrade/escalate pass
criterion; the **response contract** the agent must honour when it refuses to guess or when it fails;
and the **triage rule** — the reproduction procedure and the bounds that decide whether a bad run goes
to engineering, to the drift log, or nowhere. Plus the explicit statement of the residual risk this
layer does not remove.

## When to use / NOT
- **Use when:** the agent passes its eval suite but behaves differently run to run and nobody can say
  whether that is a defect; a long conversation degrades — the agent contradicts an earlier turn,
  forgets a stated constraint, or makes the user repeat themselves; the agent fabricates facts and you
  need to choose which reduction lever to build first; you are assembling a robustness suite of
  malformed, ambiguous, jargon-laden or partially-failing inputs and need a pass criterion for it;
  you must specify what the agent does when it will not guess (ask, degrade, escalate) and how it
  behaves at the moment of failure; a single bad production result has arrived and you need a rule for
  classifying it as a systematic failure versus expected variation before spending engineering time.
- **NOT for:** constructing the measuring instrument itself — the metric mix, the evaluation set, the
  eval-case format, per-tool unit tests, planner/memory scoring, the end-to-end harness and its
  lifecycle wiring: that is `aiagents-evaluation-design`, and this skill is the layer that runs **on**
  it. Not adversarial input as an ATTACK — prompt injection, jailbreak, red-teaming, MAESTRO threat
  modelling, guardrail design (→ `aiagents-agent-security`); the robustness half — malformed,
  out-of-distribution and merely hostile-looking input that must not crash the agent — is here. Not
  production instrumentation, alert thresholds or drift detection as an ops discipline
  (→ `aiagents-observability-and-drift`). Not deployment gates, canary or rollback
  (→ `aiagents-release-gates-and-rollout`). Not the autonomy level and escalation policy itself
  (→ `aiagents-human-in-the-loop`), nor the product's wider interaction and trust design
  (→ `aiagents-agent-ux`). Not generic regression suites or test-design technique
  (→ `ai-regression-testing`, `test-design-techniques`), single-answer grading (→ `answer-assessor`),
  or the harness-local critique loops (→ `adversarial-verifier`, `verification-quality`).

## Decision criteria

### 1. Name the property before you write the test (KU: ch09-p238-ku12, ch09-p238-ku13)
Two different failures hide behind "the agent is unreliable", and they need different test shapes. The
rows below are the two properties the book tests in separate sections; the table does **not** claim one
subsumes the other or that they fail in a fixed order.

| Property | The test holds this stable | A violation looks like | Test shape | Anchor |
|---|---|---|---|---|
| **Согласованность / consistency** | The agent's behaviour across probabilistic variation of the same request | A mandatory step is skipped when the user phrases the request differently; the answer drifts away from the input it was given | Repeat the same intent in many wordings; assert the invariant, not the string | [p.250-251] |
| **Связность / coherence** | The logic and the retained context inside ONE extended interaction | The agent contradicts an earlier turn, makes the user repeat information already given, issues conflicting recommendations, or misses a dependency | Simulate an extended interaction and check the state picture and the action chain | [p.252] |

*Extractor's reading, not a sentence from the book:* consistency is stability of behaviour under
probabilistic variation of the input; coherence is logical integrity within a single long interaction.
Use it as a sorting heuristic only.

Third question, separate from both: is this bad result a defect at all? That is §8.

### 2. Consistency: invariants, not byte identity (KU: ch09-p238-ku12)
The premise is that identical input does not guarantee identical output from an LLM-backed agent, so
the classical determinism check does not apply [p.250]. What you assert instead:

- **Behaviour invariants.** Fix the steps the flow must always perform, whatever the phrasing. The
  book's worked case: the support agent always asks for a photograph of the damaged item **before** it
  calls `issue_refund`, across differently-worded user requests [p.250].
- **Extended dialogues.** Performance degrades over the length of an interaction, so consistency is
  probed with extended simulated dialogues: the agent must not contradict what it already established
  and must not wander off the subject. The book's example is an intent switch mid-conversation —
  refund → cancellation — where the agent must stay compatible with the order status it already knows
  [p.250-251].
- **Scaling the check with LLM judges.** LLM-based evaluation compares the agent's results against
  expectations; supplying the judges with few-shot examples of what a consistent and relevant answer
  looks like is the named way to raise the judges' own reliability [p.251].
- **Actor-critic as one instrument, not the verdict.** An actor generates, a critic scores against
  predefined criteria of correspondence and relevance. The book is explicit that on its own this is
  insufficient for complex or dynamic scenarios — combine it with LLM-based evaluation and human
  feedback [p.251].
- **Manual review stays in the loop.** Automated evaluation can miss rare but critical edge cases that
  lie outside the test set, so ongoing manual review and periodic refreshes of the evaluation data are
  part of the method [p.251].

**Residual risk you sign up for:** even with the methods combined, a small chance of missing rare cases
remains [p.251]. Plan for it; do not report it away.

### 3. Coherence: logic and context retention across the whole interaction (KU: ch09-p238-ku13)
Coherence is the property of the outputs staying logical, contextually relevant and mutually
non-contradictory for the duration of the interaction: the agent builds on what was said before and
does not force the user to repeat themselves [p.252].

Method — simulate extended interactions and check two things at once [p.252]:

1. the agent's picture of the system state does not come apart as the interaction lengthens;
2. its actions add up to a purposeful chain rather than a sequence of locally-plausible replies.

Contradictions are what you flag: conflicting recommendations, missed dependencies [p.252]. The book's
worked case: when confirming the refund the agent refers back to the original damage report and the
photograph that was sent, and refunds only the mug out of a multi-item order rather than the whole
order [p.252].

**Limit:** this cannot be established with single-step checks; it requires extended-interaction
simulation [p.252]. Budget for it — a coherence suite is slower and more expensive per case than a
one-shot suite.

### 4. Hallucination reduction — four levers and their price (KU: ch09-p238-ku14)
The failure mode is the agent producing incorrect, meaningless or fabricated information [p.252]. The
book names four levers [p.253]. The table is an inventory of what it prescribes under each; the rows
are not a ladder and the book does not rank them or claim one replaces another.

| Lever | What the book prescribes under it | Anchor |
|---|---|---|
| **Grounding** | Base results on verified data — RAG with cross-checking against trusted sources. The book observes that legal AI tools, which always do this, show a significantly lower hallucination level than general-purpose models | [p.253] |
| **Source quality** | Output reliability tracks the quality of the data sources; stale, incomplete or poorly vetted sources raise the risk. Tests check that the agent draws on accurate, relevant and fresh sources; the knowledge base is audited regularly | [p.253] |
| **Feedback mechanisms** | Machinery that flags inaccuracies for analysis and correction; human-in-the-loop cycles where domain experts refine the responses over time; automated mechanisms that catch divergence between the agent's predictions and actual outcomes and trigger an update of the models or the sources | [p.253] |
| **Hybrid human-AI loops in real time** | Experts correct invented facts before they propagate; automated detection combined with human confirmation for critical domains such as healthcare and law | [p.253] |

**Economics.** Cost-aware evaluation is gaining ground: a "cost of hallucinations" figure weighs the
accuracy gain against the additional computational cost [p.253-254]. Use it to decide how far up the
lever list a given flow is worth taking — it is the book's own framing of the trade-off, and it fixes
no numbers.

**Limit:** grounding and knowledge-base auditing are continuous processes, not a one-time setup
[p.253]. A hallucination-reduction design with no owner for the recurring audit is unfinished.

### 5. Unexpected input: the robustness suite (KU: ch09-p238-ku15)
Real environments are unpredictable — malformed, ambiguous and even malicious input is unavoidable
[p.254]. Integration tests deliberately feed input outside the assumptions made during training and
design: unexpected data formats, jargon, typos, partial failures of external services [p.254].

**The pass criterion is behavioural, not textual** [p.254]: the agent does not crash and does not emit
a harmful result; instead it does one of three things —

| Response | When it is the right one |
|---|---|
| Ask for clarification | The input is ambiguous or under-specified and a question resolves it — see §6 |
| Reduce functionality | The agent can still deliver part of the task, or a degraded channel is available — see §7 |
| Escalate | Neither of the above closes the gap safely — see §7 |

The book's worked cases: a typo in an order identifier during a refund; a cancellation requested for an
order that has already been delivered. In both the agent is expected to clarify or escalate rather than
proceed into an erroneous `issue_refund` call [p.254].

**Where the cases come from** [p.254]: not only random corruption of inputs, but a systematic study of
edge cases derived from historical incidents and from vulnerability analysis.

**Safety-critical addition** [p.254]: a separate stress loop checks three properties under pressure —
confidential information does not leave, policy is not violated, and downstream processing does not
break.

**Limit:** the anomaly set needs continuous replenishment as the system evolves [p.254]. Treat it like
the evaluation set it sits beside: a living artifact with a growth rule.

### 6. Response contract, part one — ask instead of assuming (KU: ch03-p66-ku17)
No agent interprets ambiguous, unclear or contradictory input perfectly, and assumptions turn into
errors [p.92]. This is the behaviour §5's tests assert. Checklist [p.92]:

- [ ] On ambiguity, ask a useful, substantive question instead of emitting a generic default answer.
      The book's example: to «Купи мне билет в Чикаго» [p.92] the agent replies with a question —
      «Только в Чикаго или в оба конца, и на какие даты?» [p.92].
- [ ] Keep the questions clear, polite and context-aware — not mechanical, not repetitive.
- [ ] Reuse what the user already answered earlier in the dialogue rather than starting over.
- [ ] Say why the clarification is needed: «Мне нужно чуть больше информации, чтобы продолжить» [p.92].
- [ ] Do not fire many questions at once — that reads as an interrogation. Order them, starting from
      the most important ambiguity.

Effect the book claims: uncertainty is converted into productive collaboration with a sense of
partnership and shared control [p.92].

**The boundary the book leaves open:** it sets no confidence threshold below which the agent should
ask. Where that line sits is your design decision, and it belongs in the ADR rather than being read
out of the source.

### 7. Response contract, part two — fail gracefully (KU: ch03-p66-ku18)
Failures are unavoidable — incomplete data, ambiguous input, technical limits, edge cases — and the
book rates the agent's conduct at the moment of failure as **no less important** than its conduct in
normal operation [p.92]. *(A stronger equality formulation was removed here: the source's wording
allows failure behaviour to be more important, so an "exactly as much" claim would over-read it.)*

Core of the pattern: transparently name the problem, explain it usefully, and offer the next actions
[p.92]. The book's example reply — «Мне не удалось найти информацию, которую ты ищешь; хочешь, чтобы я
передал запрос оператору?» [p.92] — is preferred over returning a wrong or meaningless result [p.92].

Checklist [p.93]:

- [ ] Anticipate the frequent failure points and define fallback mechanisms in advance. The book's
      example: a voice agent that fails to understand after several attempts switches to a text
      channel.
- [ ] Preserve state when a multi-step task fails, so that after the obstacle clears the user continues
      from where they stopped rather than from the beginning.
- [ ] Acknowledge the failure in a human, caring tone, not with faceless technical error text.
- [ ] Give clear resolution paths — remedial actions, handover to a human operator, an alternative
      resource — so the user always knows the available options.
- [ ] Learn from failures: log the failure points, analyse recurring problems, feed the findings back
      into development.

**Limits to carry.** The book qualifies learning-from-own-mistakes as something to do «where possible»
and names only its components — logging failure points, analysing recurring problems, returning
feedback into development [p.93]; it gives no technical implementation of the iterative
self-improvement. *Source-quality note:* the phrase «сочувственный и оправдательный тон» on p.93 reads
like a translation calque, most likely of English *apologetic*.

### 8. Triage — systematic failure or expected variation (KU: ch10-p257-ku02)
**This is the half of the seam this skill owns:** the classification rule applied to a single
unsatisfactory result. The production monitoring it plugs into — what to instrument, which drift tests
to run, which alert fires — belongs to `aiagents-observability-and-drift`.

The book offers a decision tree as a simple way of managing the process [p.258-259]:

| Step | Check | Branch |
|---|---|---|
| 1 | Does the result meet the success criteria? Threshold given as an example: «например, оценка >0,8» [p.258] | Yes → no action needed, just watch the trend [p.258]. No → step 2 |
| 2 | Reproducibility: rerun three to five times [p.258] | «частота сбоев >80 % указывает на систематическую ошибку» [p.258] → engineering analysis. Not reproducing → step 3 |
| 3 | Confidence / deviation, thresholds again introduced by example: «например, оценка LLM >0,7, дивергенция Кульбака — Лейблера <0,2 от базовой линии» [p.258] | In bounds → expected deviation; write it to the log so drift can be detected later [p.259]. Out of bounds → anomalous failure; the book's trigger example is input drift by population stability index >0,1, which launches remediation — retraining or protective constraints [p.259] |

Purpose of the procedure: avoid over-reacting to noise while still catching real degradation early; the
book notes it is applied in tools such as Grafana [p.259].

**Two source caveats you must not lose when you implement this** [from the KU's own limits]:

1. **Which numbers are hedged.** The success threshold («например, оценка >0,8») and the
   confidence/deviation pair («например, оценка LLM >0,7 … <0,2») are introduced by the source with
   "for example" [p.258]. The three-to-five reruns and the >80 % failure rate are stated without that
   hedge [p.258]. Calibrate the hedged ones on your own data; do not ship them as prescribed values.
2. **The two PSI readings in one chapter disagree.** Here PSI >0,1 is treated as an intervention
   trigger [p.259], while the chapter's drift section places the 0,1–0,25 band under insignificant
   drift requiring only monitoring [p.275]. Pick one reading consciously and write down which; do not
   wire both.

## Key facts & formulas
- Consistency invariant, the book's worked case: a photograph of the damaged item is always requested
  before the `issue_refund` call, across differently-worded requests [p.250].
- Extended interactions are where performance degrades over time, which is why consistency testing uses
  extended simulated dialogues [p.250-251].
- Few-shot examples of consistent and relevant answers raise the reliability of LLM-based judges
  [p.251].
- Actor-critic is insufficient on its own for complex or dynamic scenarios; combine with LLM-based
  evaluation and human feedback [p.251].
- Residual risk: automated evaluation can miss rare critical edge cases outside the test set — ongoing
  manual review and periodic refresh of the evaluation data [p.251].
- Coherence violations named: conflicting recommendations, missed dependencies [p.252]. Worked case:
  refund only the mug from the multi-item order, with reference to the original damage report and the
  photograph [p.252].
- Four hallucination levers: grounding (RAG + cross-checking trusted sources), source quality and
  freshness with regular knowledge-base audit, feedback mechanisms, hybrid real-time human-AI loops
  [p.253].
- Legal AI tools that always ground show a significantly lower hallucination level than general-purpose
  models — the book's observation [p.253].
- "Cost of hallucinations": accuracy gain weighed against the additional computational cost
  [p.253-254].
- Unexpected-input suite: unexpected data formats, jargon, typos, partial external-service failures
  [p.254]. Pass criterion — no crash, no harmful output; clarify, degrade, or escalate [p.254].
- Case sources for that suite: random input corruption **plus** systematic edge-case study from
  historical incidents and vulnerability analysis [p.254].
- Safety-critical stress loop checks three things under pressure: no confidential data leaves, policy
  holds, downstream processing does not break [p.254].
- Clarification example: «Купи мне билет в Чикаго» [p.92] answered with a question about one-way
  versus round trip and the dates [p.92].
- Graceful-failure fallback example: a voice agent switches to text after several failed
  understanding attempts [p.93].
- Triage tree: success threshold example >0,8; rerun three to five times; >80 % failure rate ⇒
  systematic error; confidence/deviation example — LLM score >0,7 and KL divergence <0,2 from baseline;
  in-bounds deviations are logged for drift detection; out-of-bounds example trigger — input drift with
  PSI >0,1 launching retraining or protective constraints [p.258-259].
- The tree is described as applied in tools such as Grafana [p.259].
- Source inconsistency: PSI >0,1 as an intervention trigger [p.259] versus the 0,1–0,25 insignificant-drift,
  monitor-only band [p.275].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Byte-identical output as the consistency criterion | LLM-backed agents legitimately vary; the target is invariance of behaviour, not of the string | ch09-p238-ku12 |
| Testing consistency with single-shot prompts only | Degradation shows up over the length of an interaction, which needs extended simulated dialogues | ch09-p238-ku12 |
| Taking the actor-critic verdict as sufficient | Stated as insufficient by itself for complex or dynamic scenarios | ch09-p238-ku12 |
| LLM judges deployed without few-shot anchors | Few-shot examples of consistent, relevant answers are the named way to raise judge reliability | ch09-p238-ku12 |
| Dropping manual review once the automation is green | Automation can miss rare critical cases outside the test set; periodic data refresh is part of the method | ch09-p238-ku12 |
| Declaring coherence proven from per-turn plausibility | Coherence is a property of the whole interaction — state picture plus purposeful action chain | ch09-p238-ku13 |
| Refunding the whole order when one item was damaged | The book's own coherence violation: the multi-item order's details were ignored | ch09-p238-ku13 |
| Treating grounding and knowledge-base audit as one-time setup | Both are continuous processes | ch09-p238-ku14 |
| Grounding on stale, incomplete or poorly vetted sources | Output reliability tracks source quality directly | ch09-p238-ku14 |
| Automated hallucination detection with no human confirmation in a critical domain | For healthcare and law the prescribed shape is detection plus human confirmation | ch09-p238-ku14 |
| Buying accuracy at any computational cost | The cost-aware framing weighs the accuracy gain against the extra compute | ch09-p238-ku14 |
| A robustness suite made only of random input corruption | The other named half is systematic edge-case study from historical incidents and vulnerability analysis | ch09-p238-ku15 |
| Accepting a crash — or a confident wrong tool call — on malformed input | The stated pass criterion is clarify, degrade or escalate without harmful output | ch09-p238-ku15 |
| Freezing the anomaly set after the first release | It needs continuous replenishment as the system evolves | ch09-p238-ku15 |
| Guessing an intent instead of asking | Risky assumptions on ambiguous or contradictory input turn into errors | ch03-p66-ku17 |
| Firing a burst of clarifying questions at once | Reads as an interrogation; order them from the most important ambiguity | ch03-p66-ku17 |
| Re-asking for something the user already answered | The dialogue context is there to be used instead of starting over | ch03-p66-ku17 |
| Asking without saying why | Naming the reason for the clarification is part of the pattern | ch03-p66-ku17 |
| A faceless technical error message as the failure output | The prescribed acknowledgement is human and caring, with the problem named and next actions offered | ch03-p66-ku18 |
| Restarting a multi-step task from scratch after a recoverable failure | State preservation lets the user continue from the stopping point | ch03-p66-ku18 |
| Failing with no path forward offered | The user must always know the available options — remedy, human operator, alternative resource | ch03-p66-ku18 |
| No fallback channel defined for a predictable failure point | Fallbacks are meant to be defined in advance, like the voice→text switch | ch03-p66-ku18 |
| Escalating a single non-reproducing bad result to engineering | The tree reruns first and routes non-reproducing results to the confidence/deviation check | ch10-p257-ku02 |
| Discarding an in-bounds deviation instead of logging it | The in-bounds branch exists to feed later drift detection | ch10-p257-ku02 |
| Shipping the «например» thresholds as prescribed values | The 0,8 success bar and the 0,7 / 0,2 pair are introduced by example in the source | ch10-p257-ku02 |
| Wiring PSI >0,1 as a hard trigger without noticing the chapter's other band | The same chapter puts 0,1–0,25 under insignificant drift needing only monitoring | ch10-p257-ku02 |

## Related decisions
- **`aiagents-evaluation-design`** — that skill builds the instrument (metric mix, evaluation set, case
  format, per-tool tests, planner and memory scoring, the end-to-end harness); every check here runs on
  it. The coupling is directional: a narrow or unrepresentative evaluation set caps what §2 and §3 can
  observe, and the extended-dialogue simulations of §3 are extra cases that skill's set has to carry
  and grow. Its description already hands this cluster over by name.
- **`aiagents-observability-and-drift`** — §8's in-bounds branch writes deviations to a log precisely so
  that skill can detect drift over time [p.259]. Choosing the triage bounds here fixes what that skill
  receives; choosing its drift tests there fixes what "out of bounds" can even mean. The PSI conflict
  in the Key facts is exactly where the two must agree on one reading.
- **`aiagents-agent-security`** — §5 and that skill's adversarial-input catalogue touch the same inputs
  from opposite sides: here the question is whether the agent stays intact and honest; there it is
  whether an attacker gets what they wanted. The safety-critical stress loop's three properties
  [p.254] are the overlap — decide the perimeter, sanitisation and guardrails there.
- **`aiagents-human-in-the-loop`** — §5's escalate branch and §7's handover to a human operator are the
  triggers; the autonomy level, who receives the handoff and how oversight itself degrades are decided
  there. If that skill sets a lower autonomy ceiling, more of your robustness cases resolve as escalate
  rather than degrade.
- **`aiagents-agent-ux`** — §6 and §7 specify observable agent behaviour so it can be asserted in a
  test; the wider interaction design (modality, how much autonomy to expose, transparency and trust)
  is that skill's decision, and it constrains how the clarification and failure messages are surfaced.
- **`aiagents-knowledge-and-memory`** — §4's grounding lever cashes out as a concrete retrieval and
  store design there; choosing a weaker retrieval scheme raises what §4 has to compensate for, and the
  source-freshness audit needs an owner in that design.
- **`aiagents-release-gates-and-rollout`** — the checks here produce evidence a release gate can
  consume; this skill deliberately sets no readiness threshold. Do not derive one from §8's example
  numbers.
- **`aiagents-improvement-loops`** — §7's "learn from failures" bullet and §4's feedback mechanisms end
  where the post-release cycle begins: detection → root cause → fix → prioritisation is that skill's
  territory, and the book gives no implementation of iterative self-improvement here [p.93].

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 3, с. 92–93; глава 9, с. 250–254; глава 10, с. 258–259.
KUs: ai-apps-ch03-p66-ku17, ai-apps-ch03-p66-ku18, ai-apps-ch09-p238-ku12, ai-apps-ch09-p238-ku13,
ai-apps-ch09-p238-ku14, ai-apps-ch09-p238-ku15, ai-apps-ch10-p257-ku02.
Deep reference: `references/knowledge-units.md`.
- Triage anchor: «частота сбоев >80 % указывает на систематическую ошибку» [p.258].
- Clarification anchor: «Мне нужно чуть больше информации, чтобы продолжить» [p.92].

## Self-check
- [x] Every Decision-criteria subsection and every Anti-pattern cites a KU id listed in `derived_from`?
- [x] «Источник» pages computed from the seven consumed KUs' `sources:` blocks, not typed from memory?
- [x] The one `partial` KU (`ch03-p66-ku18`) has its refused over-claim deleted and the removal marked
      in §7?
- [x] Description leads with the unique nouns of this decision and carries explicit `NOT … (→ sibling)`
      clauses for both siblings and arsenal skills?
- [x] No uncited verbatim run ≥8 words; every Russian quote is short and immediately followed by `[p.N]`?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] The `ch10-p257-ku02` seam is declared: the classification rule is owned here, production
      monitoring and drift detection point at `aiagents-observability-and-drift`?

## Examples
- «Агент на одинаковый запрос отвечает по-разному — как это вообще тестировать?» → stop asserting the
  string. Fix the behaviour invariants of the flow (the step that must always happen before the
  irreversible tool call), replay the same intent in many wordings, and add extended simulated dialogues
  because degradation shows up over length. Scale the judging with LLM evaluators given few-shot
  examples of a consistent answer, and keep sampled manual review — automation misses rare cases outside
  the set.
- "The agent contradicts something it confirmed ten turns earlier" → that is coherence, not consistency:
  simulate the extended interaction and check both that its picture of the state does not come apart and
  that its actions form a purposeful chain; flag conflicting recommendations and missed dependencies as
  violations. Single-step checks cannot establish it.
- «Агент выдумывает факты — с чего начать?» → four levers, and the book ranks none of them: ground the
  answers on cross-checked trusted sources; audit the knowledge base for accuracy and freshness on a
  schedule; wire a feedback mechanism that flags inaccuracies and one that catches divergence between
  predictions and outcomes; and for critical domains add human confirmation on top of automated
  detection. Weigh how far to go with the cost-of-hallucinations trade-off.
- "How do I know a fuzzed input test passed?" → not by the text: the agent must neither crash nor emit a
  harmful result, and must ask for clarification, reduce functionality, or escalate. A typo in an order
  id must produce a question or an escalation, not a confident refund call.
- «Что должен делать агент, когда он не может выполнить задачу?» → name the problem transparently,
  explain it usefully, offer next actions; keep the state so a multi-step task resumes instead of
  restarting; use a human tone rather than a raw error; and always leave a path — retry, a human
  operator, or an alternative resource. Define the fallback channel in advance, the way a voice agent
  falls back to text.
- "One production run scored badly — do we open a ticket?" → run the triage tree: if it meets the
  success criterion, only watch the trend; if not, rerun three to five times, and a failure rate above
  80 % means a systematic error worth engineering time. If it does not reproduce, assess confidence and
  deviation — in bounds, log it for later drift work; out of bounds, treat it as an anomalous failure.
  Calibrate the example thresholds yourself; the source hedges most of them.
- «У нас уже есть eval-набор и метрики — что этот слой добавляет?» → the instrument tells you the score;
  this layer tells you whether a differing score is a defect. It adds invariants under sampling
  variation, long-dialogue coherence, hallucination levers, an out-of-distribution robustness suite with
  a behavioural pass criterion, and the reproduce-then-classify rule that keeps engineering time off
  legitimate variation.
