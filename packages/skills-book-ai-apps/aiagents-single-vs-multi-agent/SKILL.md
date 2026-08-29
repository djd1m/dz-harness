---
name: aiagents-single-vs-multi-agent
description: >
  Decide whether ONE agent still fits or the system must become MULTI-agent: the scaling ladder you
  climb inside a single agent first (tool grouping, semantic tool selection), the crossing threshold
  (task difficulty, toolbox size, coordination demand outgrow one agent), the price of crossing —
  coordination complexity, communication cost and token consumption, inter-agent conflicts — the six
  principles of adding an agent plus the parsimony test, role specialization and the tool-partition
  procedure, and the choice of coordination scheme: democratic consensus / manager (supervisor) /
  hierarchical levels / swarm, with the actor-critic loop as an add-on. HOW MANY agents and HOW they
  coordinate ONLY — NOT the runtime plumbing that carries an already-decided multi-agent design:
  transport (in-process calls, A2A agent cards, JSON-RPC), message brokers and buses (Kafka, Redis
  Streams, NATS), actor frameworks and orchestrator/workflow products (Ray, Orleans, Akka, Temporal,
  Airflow) and the durable shared-state store (→ `aiagents-multi-agent-infrastructure`), NOT whether you
  need an agent at all or which foundation model to run
  (→ `aiagents-agent-fit-and-model-choice`), NOT the control-flow archetype and multi-step planning of a
  single agent's own flow — ReAct, planner-executor, chain/graph topologies
  (→ `aiagents-orchestration-and-planning`), NOT partitioning knowledge and memory
  across agents (→ `aiagents-knowledge-and-memory`), NOT the harness-local agent-ops skills
  `agentic-engineering`, `autonomous-loops`, `enterprise-agent-ops`.
  Triggers (RU+EN): "один агент или несколько", "когда переходить к мультиагентной системе",
  "у агента 16 инструментов, он стал ошибаться — делить?", "нужен ли супервайзер",
  "какая схема координации: консенсус, менеджер или иерархия", "мультиагентка съедает токены и время",
  "сколько агентов добавить", "рой агентов вместо ролей", "актор — критик, стоит ли",
  "single agent vs multi-agent architecture", "when should I split my agent into several agents",
  "do I need a supervisor/orchestrator agent", "multi-agent latency and token blowup",
  "how should my agents coordinate", "how many agents is too many".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-merged-ku01, ai-apps-ch08-p193-ku01, ai-apps-ch08-p193-ku04, ai-apps-ch08-p193-ku05, ai-apps-ch08-p193-ku06, ai-apps-ch08-p193-ku07, ai-apps-ch08-p193-ku08, ai-apps-ch08-p193-ku09, ai-apps-ch08-p193-ku10, ai-apps-ch08-p193-ku11, ai-apps-ch08-p193-ku12, ai-apps-ch08-p193-ku13, ai-apps-ch08-p193-ku14]
---

# Single vs multi-agent — cross only after one agent's headroom is spent, then buy the coordination bill deliberately

## Output
A staffing-and-coordination recommendation that lands in an ADR or an architecture step: the agent
count (one, or N with named roles), the tool partition per role and the shared reporting tool, the
coordination scheme (democratic / manager / hierarchical / swarm), whether an actor-critic loop sits
on top, and — stated explicitly, not implied — the costs accepted in exchange: added latency,
higher token consumption, coordination and conflict-resolution work, plus the redundancy the scheme
does or does not give you.

## When to use / NOT
- Use when: a single-agent prototype starts degrading as its toolbox and duties grow; deciding whether
  to tune one agent or split it; sizing a new system's agent count before the first line of code;
  reviewing a proposal to add "one more agent"; picking how agents decide between themselves
  (consensus, a supervisor, levels, or emergent local rules); justifying — or refusing — the latency
  and token bill of a multi-agent design; deciding whether a generate-then-judge (actor-critic) loop
  earns its extra inference passes.
- NOT for: the runtime plumbing that carries multi-agent traffic — transport and the A2A protocol,
  message buses and brokers, actor frameworks, orchestrator and workflow products, the durable shared
  store — that is `aiagents-multi-agent-infrastructure`; deciding whether an agent is the right shape at
  all, or which foundation model to run (→ `aiagents-agent-fit-and-model-choice`); designing the
  multi-step plan a single agent executes — chains, graphs, planners and the ReAct /
  planner-executor archetypes belong to `aiagents-orchestration-and-planning`;
  splitting knowledge stores, retrieval and memory across agents (→ `aiagents-knowledge-and-memory`);
  designing the tool contract and the selection strategy for one agent's toolbox
  (→ `aiagents-tool-design-and-selection`). This skill is about agent **count and coordination**, not
  about the harness-local agent-ops practice skills `agentic-engineering`, `autonomous-loops` or
  `enterprise-agent-ops`.

## Decision criteria

### 1. What dominates the requirements (KU: merged-ku01)
The book states the choice through what the system is optimising for. Restructured around
"which requirement dominates?" — the column headers below report the book's own claims for each row
and nothing beyond them:

| If this dominates… | The book's answer | What it costs you |
|---|---|---|
| A hard latency requirement | One agent — multi-agent schemes normally need many information exchanges between agents, which raises user-visible latency [p.193] | Scales poorly to especially complex, many-sided tasks [p.194] |
| A bounded task area and a small toolbox | One agent — faster and cheaper than the multi-agent alternative [p.193] | With a large tool set the quality of tool choice falls [p.199] |
| Getting a base function validated quickly | One agent as the starting point — teams check the hypothesis and iterate efficiently [p.194] | The move to multi-agent is worth considering once difficulty, toolbox or coordination demand exceed one agent's capacity [p.194] |
| Heterogeneous competences and tool sets | Several agents — specialization means assigning roles and areas of competence [p.200] | Coordination complexity grows; well-tuned communications and synchronisation become a requirement [p.208] |
| Parallel processing of tasks | Several agents [p.200, p.204] | Communication cost: frequent exchange for consistency slows the system and raises resource demands [p.208] |
| Adaptability in a dynamic environment | Several agents — roles and duties can be reassigned as circumstances change [p.207] | Conflicts over overlapping goals → conflict-resolution and resource-allocation protocols are needed [p.208] |
| Surviving one node's failure | Several agents — one agent's failure (e.g. an API outage) does not halt the whole process [p.207] | Extra planning for the complexity and coordination the design itself creates [p.208] |

The three benefits the book names for the single-agent scheme, in its own structure: simplicity
(easier implementation and management), lower resource demand, and latency — a faster answer for the
user [p.193-194]. Its listed niches: simple FAQ/order-tracking chatbots, data-entry and file-management
automation, support chatbots, general-purpose assistants and code-generation agents [p.58].
Multi-agent niches: complex distributed tasks and work needing specialization between components —
financial trading, cyber-incident investigation, collaborative AI research platforms [p.59-60].
The three selection criteria stated in гл. 2 are task complexity, the need for scalability, and the
system's expected lifetime [p.60].

**Fidelity notes on this KU.** It is `verified: partial` by inheritance — its гл. 2 half was partial and
the merge record does not name which claim the judge refused (see «Источник»). Every row above is
therefore restricted to material the corpus states directly; the KU's own applicability framing (that
the choice be revisited at every noticeable expansion of scope) is **not** asserted here as the book's.
Second, the KU itself flags an unresolved tension: гл. 8 claims multi-agent configurations shorten
response time in large-scale logistics [p.204] while also saying coordination adds latency [p.206] —
the book does not reconcile the two, so do not quote either as a general performance promise.

### 2. The scaling ladder — spend the single-agent headroom first (KU: ch08-p193-ku01)
The chapter's base rule: start simple, and add complexity only where it genuinely improves
performance [p.193]. Three variables drive both the agent count and their organisation: task
difficulty, the environment, and the size of the toolbox [p.193].

Order of steps **before** a second agent exists [p.199-200]:

1. **Register the symptom.** As tools and duties grow, critical bottlenecks appear; concretely, tool
   choice degrades as the number of candidate tools rises [p.199].
2. **Scale inside the single-agent scheme first** — encapsulate tools into larger groupings
   (hierarchical tool selection), or apply semantic tool selection backed by a vector database
   (the гл. 5 material, owned by `aiagents-tool-design-and-selection`) [p.199-200].
3. **Only if that is not enough**, decompose the tools into agents with matching duties: reliability
   and performance improve, at the cost of extra coordination work [p.200].

The crossing trigger is stated explicitly: consider the more complex multi-agent architecture once the
scenario's difficulty, the volume of tooling, or the coordination demands outgrow what one agent can
do [p.194]. **The book gives no numeric threshold** — no "more than N tools means split". The boundary
is qualitative and symptom-driven, which makes step 1 an observation you must actually make, not a
prediction you may assert.

### 3. If you cross: partition the toolbox into roles (KU: ch08-p193-ku04, ch08-p193-ku05)
The chapter's worked procedure turns 16 tools into three specialists — inventory and warehouse,
transport and logistics, supplier relations and compliance — with a supervisor agent routing requests,
which is the manager-coordination pattern in practice [p.200].

Steps [p.200-204]:

1. **Pull out a shared reporting tool** (in the example `send_logistics_response`) so every specialist
   reports results in one consistent style; this removes duplicated functionality while execution
   stays decentralised [p.200].
2. **Group the remaining tools by area of responsibility.** In the code that is three lists —
   `INVENTORY_TOOLS`, `TRANSPORTATION_TOOLS`, `SUPPLIER_TOOLS` — and the shared reporting tool is
   included in **each** of them [p.202-204].
3. **Bind each group to its own model instance** [p.204]:

   ```python
   inventory_llm = llm.bind_tools(INVENTORY_TOOLS)
   transportation_llm = llm.bind_tools(TRANSPORTATION_TOOLS)
   supplier_llm = llm.bind_tools(SUPPLIER_TOOLS)
   ```

4. **Give each specialist its own system prompt.** Wording tuned to the role, plus less context per
   agent, raises that agent's focus and effectiveness [p.204].

The stated mechanism of the win: specialization is achieved by narrowing each agent's toolbox and
prompt, which cuts selection errors and raises reliability [p.200]. The specialist node template is
identical across roles in the example — only the bound model and the prompt differ [p.205-206].

**Routing with an explicit fallback** [p.204-207]. The supervisor analyses the request and hands it to
a specialist, which gives simplified decision-making without the cost of reaching full consensus
[p.204]. Its prompt lists the team and demands the chosen specialist's name and nothing else
[p.204-205]. The routing function normalises the model's answer (`strip` + `lower`), matches it against
the three names, and returns `END` on no match — that `else` branch is where an off-script model output
is caught [p.206]. Because the supervisor's output selects the flow, the system handles varying
conditions without hard-wired predefined paths, and one agent's failure does not stop the whole
process [p.207].

**Two source caveats you must not design around** — both recorded in the KUs:
- Inside `specialist_node` the tool lookup runs over the concatenation
  `all_tools = INVENTORY_TOOLS + TRANSPORTATION_TOOLS + SUPPLIER_TOOLS` [p.205]. The narrowing acts at
  the model's *selection* step only; the execution half is not restricted to the specialist's own
  group. A code comment notes the assumption that tool names are unique [p.205].
- The prose describes a transport specialist and an inventory specialist working in parallel [p.207],
  but the graph shown routes to exactly one specialist and terminates (`add_edge("inventory", END)`
  and so on) [p.207]. **Parallelism is named as a potential extension, not implemented in the example**
  [p.207]. If you need it, you are designing it yourself.

Inherited weakness: this layout is manager coordination, so it inherits the supervisor's single point
of failure and bottleneck risk (§6.2) [p.213].

### 4. The three systemic costs of going multi — and what the book actually offers against them (KU: ch08-p193-ku06)
Restructured from the chapter's list of difficulties, с. 208. The right-hand column reports **only**
what the book itself puts forward against each cost; where it names nothing, the cell says so rather
than inventing a damper:

| Cost | How it shows up | What the book names against it |
|---|---|---|
| Coordination complexity | Several interacting agents require well-tuned communications and synchronisation for the work to stay high quality [p.208] | Establish reliable communication protocols as part of the coordination principle [p.210-211] |
| Communication cost | Agents must exchange information often to stay consistent and avoid duplicated action; that need slows the system and adds resource demands, especially in large-scale applications [p.208] | No damper is claimed at this point in the chapter. The only lever the book states in the same breath is parsimony — each added agent creates communication cost, coordination complexity and resource demand, so add the minimum number that delivers the function [p.210] (§5) |
| Conflicts between agents | Arise when agents pursue overlapping goals or cannot prioritise effectively [p.208] | Protocols for conflict resolution and resource allocation [p.208, p.211] |

The chapter's own summary: the advantages on many-sided tasks are real, but they demand careful
planning for exactly the complexity and coordination the multi-agent choice itself creates [p.208].
The levers it names for performance and flexibility are: different roles for agents, parallel
processing, adaptability, and redundancy [p.208].

Token consumption is the related cost from гл. 2: multi-agent systems often — though not always —
consume more tokens, because agents interact frequently and exchange context; that raises compute cost
and can slow the system when communications and coordination are not optimised [p.59]. Resource
management is therefore called out as especially important [p.59] (KU: merged-ku01).

**Exclusion note (this KU is `verified: partial`).** The cross-model judge refused the extractor's
framing that message brokers and buses damp communication cost — с. 225 credits them with loose
coupling, scalability and asynchrony, not with lowering that cost. That claim is excluded above, and
broker/bus infrastructure belongs to **`aiagents-multi-agent-infrastructure`** anyway. Also refused and
therefore absent: the wording that protocols are «устанавливаемые заранее», and the applicability claim
that the list is used before implementation. The three costs and their formulations from с. 208 were
confirmed accurate.

**No metric is offered.** The chapter gives no measurement by which to size communication cost, so any
budget you set here is your own engineering judgement, not the book's.

### 5. Six principles for adding an agent, and the parsimony test (KU: ch08-p193-ku08, ch08-p193-ku09)
Checklist from the «Принципы добавления агентов» section, с. 209-211 — run it per proposed agent:

- [ ] **Task decomposition** — break the complex work into smaller subtasks so each agent owns one
      concrete aspect of the load; clearly drawn task boundaries cut overlap and redundancy, and also
      make coordination and scaling simpler [p.209-210].
- [ ] **Specialization** — assign roles that match agents' strengths; specialised agents are more
      competent at their type of work, which converts into better performance and faster completion,
      and a spread of duties covers cross-disciplinary questions [p.210].
- [ ] **Parsimony (экономность)** — add the minimum number of agents sufficient for the needed
      functionality; every additional agent creates communication cost, raises coordination complexity
      and increases resource demands [p.210].
- [ ] **Coordination** — establish reliable communication protocols, and include conflict-resolution
      protocols in the coordination mechanisms, especially where tasks and resource claims overlap
      [p.210-211].
- [ ] **Fault tolerance** — build in redundancy: agents that activate when others fail, and workflows
      that survive unexpected interruptions such as network failures or nodes going down [p.211].
- [ ] **Efficiency** — weigh each added agent's gain against the growth in compute requirements and
      coordination cost [p.211].

**The parsimony test — the gate before a new agent exists** [p.210]: first check whether existing
nodes already take this task on, either directly or after their functions are extended. The stated
reason: an unjustified increase in agent count complicates maintenance and creates potential
performance bottlenecks [p.210]. Parsimony demands that each agent's role be assessed and agents
assigned with discipline, so that the value of any addition is evident [p.210]; the result of honouring
it is compact multi-agent systems where functionality is maximal and complexity-driven risk and cost
are reduced [p.210]. The book supplies no criterion for what makes value "evident" — that judgement
stays with the reviewer.

The principles are top-level: **no quantitative criteria** (how many agents, how much redundancy) are
given anywhere in this section.

### 6. Choosing the coordination scheme (KU: ch08-p193-ku10)
Effective coordination is called critical to a multi-agent system's success [p.211]. The chapter
presents three schemes. The framing below — "what is most expensive for this system to lose" — is the
extractor's presentation device and is **not** a formulation the book uses; the cells report the book's
own benefits and costs:

| Most expensive to lose… | Scheme | What you pay |
|---|---|---|
| Objectivity, and survival under failures | **Democratic** — all agents hold equal decision-making authority, no leader is appointed, and there is no single point of failure [p.212] | Reaching consensus takes extensive communication, decisions come slower, and the protocol is complex to implement [p.212] |
| Decision speed, and freedom from duplicated effort | **Manager coordination** — managers decide, distribute tasks and resolve conflicts; communication paths simplify because subordinates mostly talk to the manager [p.212-213] | Single point of failure; the manager becomes a bottleneck as load grows; reduced adaptability to local, real-time change [p.213] |
| Manageability at a large agent count | **Hierarchical** — several levels, upper levels supervising lower ones while subordinates keep some autonomy; coordination responsibility is spread across levels, which yields redundancy [p.213] | Substantial design complexity per level, communication delays as information crosses levels, and waiting on instructions from above [p.213-214] |

Named niches: democratic — distributed sensor networks and collective robotic systems, where each
agent's contribution matters and consensus is critical [p.212]; manager — structured hierarchical
settings such as manufacturing systems and customer support centres [p.213]; hierarchical — large
complex systems such as supply-chain management or military operations, needing both a strategic level
and tactical execution [p.214].

The section states plainly that these are the leading methods and that new ones are likely to appear
[p.211] — treat the list as open, not exhaustive.

#### 6.1 Democratic coordination — consensus among equals (KU: ch08-p193-ku11)
Every agent gets equal decision authority and no leader is appointed; agents cooperate and exchange
information on an equal footing, each contributing its own findings so a decision is reached jointly
[p.212].

- Benefits [p.212]: **fault tolerance** — no dominant role, no single point of failure, and the failure
  of one or several agents does not stop the system; **flexibility** — open cooperation adapts quickly
  to environmental change through updated collective input; **equality** — an equal voice for every
  participant leads to fairer outcomes.
- Costs [p.212]: extensive communication for consensus is a significant expense; aligning positions
  slows decisions and creates delay exactly where fast reaction is needed; the protocol itself is
  complex, requiring well-defined communications and conflict-resolution mechanisms.

Pick it when objectivity and fault tolerance come first — the stated applications are distributed
sensor networks and collective robotics [p.212]. Do not pick it for reaction-time-critical work [p.212].

#### 6.2 Manager coordination — a decision without negotiation (KU: ch08-p193-ku12)
One or several agents are designated managers, responsible for tracking and directing subordinate
agents: they take decisions, distribute tasks and resolve conflicts inside their group [p.212].

- Benefits [p.212-213]: **simplified decision-making** — the manager acts on the group's behalf, with
  no lengthy alignment round; **clear assignment** of tasks and duties, so agents focus on specific
  goals without duplicated effort or conflict; **simplified communication paths** — subordinates talk
  mainly to the manager rather than to each other, which lowers coordination complexity.
- Vulnerabilities [p.213]: **single point of failure** — a manager going down can bring the whole
  system with it; **scaling** — the manager becomes the bottleneck as the volume of tasks and
  interactions grows; **reduced adaptability** — centralised decisions do not always account for
  real-time changes in each subordinate's environment.

This is the scheme the supply-chain supervisor example implements (§3) [p.200]. So the moment you adopt
that worked pattern, you have adopted this failure profile with it.

#### 6.3 Hierarchical coordination — levels between central control and autonomy (KU: ch08-p193-ku13)
A multi-level approach combining centralised and decentralised elements: agents are split into levels,
upper levels supervise and direct lower ones, and subordinates retain some autonomy [p.213].

- Benefits [p.213]: **scalability** — coordination duties are spread over several levels, so agents are
  led more effectively than in a fully centralised model; **redundancy** — tasks can be managed at
  different levels, improving fault tolerance; **clear lines of authority** — the top level handles
  strategic decisions, lower levels tactical execution.
- Costs [p.213-214]: significant design complexity — each level must be structured so cross-level
  coordination stays smooth; communication delays as information passes through several levels slow the
  reaction to urgent change; upper-level decisions add latency because lower levels wait for instructions.

Poorly compatible with a requirement for immediate reaction to urgent change [p.213-214].

### 7. Swarms — the decentralised alternative to assigned roles (KU: ch08-p193-ku07)
A swarm is an architecture approach inspired by natural decentralised systems — bird flocks, fish
schools, ant colonies [p.208]. The contrast the book draws: traditional multi-agent architectures are
*often* based on explicit role assignment and centralised coordination, whereas swarms prefer
decentralisation and self-organisation [p.208]. Each agent follows its own set of local policies,
usually with no global view of the system; group behaviour emerges from repeated local interactions —
mass-broadcasting small updates, reacting to neighbours' actions, adapting on shared signals [p.208].

Four named advantages [p.208-209]:

1. **Scalability** — loose coupling and local control let the system grow to hundreds or thousands of
   nodes with minimal coordination cost [p.208].
2. **Fault tolerance** — no single point of failure; one agent's failure does not significantly degrade
   performance [p.209].
3. **Flexibility** — real-time adaptation to changing goals or environment [p.209].
4. **Distributed problem solving** — exploration, monitoring, consensus formation, distributed search
   [p.209].

Named design problems: predictability, observability and efficiency [p.209] — the three properties an
operable production system usually needs most, which is why this is a niche choice, not a default. The
niche where swarms do best is distributed environments — edge computing, sensor networks, collective
real-time systems; the deciding sign is that flexibility and stability outrank accuracy and centralised
control [p.209]. They are explicitly said not to suit every domain [p.209].

Source caveat: unlike the supervisor scheme, the chapter gives **no swarm code** — this section stays
conceptual, so treat it as an architecture direction, not an implementable recipe.

### 8. Actor-critic — a second agent that judges rather than does (KU: ch08-p193-ku14)
A distinct reason to add an agent: not to split work, but to re-generate until quality clears a bar.
The actor produces candidate outputs (answers, plans, actions); the critic acts as the quality gate,
accepting or rejecting them against a predefined classification [p.214]. The actor keeps generating
until the critic judges the result to meet the desired quality threshold; the book files this under
test-time compute — extra inference passes buy reliability and performance, and the price is higher
compute cost [p.214].

Three conditions under which it is especially effective [p.214]:

1. A clear classifier or evaluation checklist exists — correctness, completeness, tone.
2. The cost of the additional generations is acceptable against the quality gain.
3. The task is fuzzy or generative by nature, where a single attempt usually loses to approaches with
   re-ranking or filtering.

**The applicability heuristic that decides it** [p.215]: the pattern pays off when evaluation is easier
than generation — when you reliably recognise a good result but cannot easily produce one first try.
The loop requires no training and is simple to implement, so it is worth trying whenever the performance
gain outweighs the extra computation.

In the chapter's example the actor generates re-order plans and the critic scores candidates 1 to 10 on
feasibility, cost and risk, picking the best if the score exceeds 8 and otherwise requesting
regeneration [p.214-215]:

```python
g.add_conditional_edges("critic", lambda s: "actor"
if "regenerate" in s["messages"][-1].content.lower() else
END)
```

Source caveats on that fragment [p.214-215]: `actor_node` writes `state["candidates"]` though
`candidates` is not declared in `AgentState` [p.204, p.214]; `critic_node` uses `all_tools` and
`send_fn`, neither defined in the shown code; and **there is no iteration counter and no cap on
retries** — the loop is bounded only by the critic's verdict. Add that bound yourself.

## Key facts & formulas
- Base rule of the chapter: start simple, add complexity only where it improves performance [p.193].
  The three variables driving agent count and organisation: task difficulty, environment, toolbox size
  [p.193].
- Single-agent benefits, in the book's own three-part structure: simplicity, lower resource demand,
  latency [p.193-194].
- The crossing trigger: difficulty, tooling or coordination needs exceed one agent's capacity [p.194].
  **No numeric tool-count threshold is given anywhere.**
- Observed symptom of the ceiling: tool-selection quality falls as the number of candidate tools grows
  [p.199].
- The worked decomposition: 16 tools → 3 specialists (inventory/warehouse, transport/logistics,
  supplier/compliance) + 1 supervisor, with one shared reporting tool present in every specialist's
  tool list [p.200, p.202-204].
- Specialist wiring: `llm.bind_tools(<GROUP>_TOOLS)` per role, one system prompt per role [p.204].
- Supervisor routing: the prompt demands only the chosen specialist's name; the router normalises with
  `strip` + `lower` and falls back to `END` on no match [p.204-206].
- The three multi-agent costs: coordination complexity, communication cost, inter-agent conflicts
  [p.208]. The four levers named for performance and flexibility: distinct roles, parallel processing,
  adaptability, redundancy [p.208].
- Token cost: multi-agent systems often — not always — consume more tokens through frequent context
  exchange, raising compute cost and potentially slowing the system [p.59].
- Six principles for adding an agent: decomposition, specialization, parsimony, coordination, fault
  tolerance, efficiency [p.209-211]. No quantitative criteria attach to any of them.
- Parsimony test: before adding an agent, check whether existing nodes already cover the task, directly
  or with extended functions [p.210].
- Swarm scale claim: hundreds to thousands of nodes with minimal coordination cost [p.208]; swarm weak
  spots: predictability, observability, efficiency [p.209].
- Actor-critic scoring example: candidates rated 1-10 on feasibility, cost and risk; a score above 8
  selects, otherwise regenerate [p.214-215]. No retry cap exists in the shown code.
- Unresolved in the source: multi-agent shortens response time in large-scale logistics [p.204] vs
  coordination adds latency [p.206] — the book does not reconcile these.

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Splitting into several agents before trying tool grouping or semantic tool selection | The single-agent headroom is the cheap fix; decomposition adds coordination cost that grouping would not have [p.199-200] | ch08-p193-ku01 |
| Choosing multi-agent under a hard latency requirement | Multi-agent schemes normally need many inter-agent exchanges, which raises user-visible latency | merged-ku01 |
| Adding an agent without checking whether an existing node could take the task | Unjustified agent growth complicates maintenance and creates performance bottlenecks | ch08-p193-ku09 |
| Adding agents one at a time with no efficiency check | Each addition brings communication cost, coordination complexity and resource demand; the gain must be weighed against them | ch08-p193-ku08 |
| Copying the supervisor example and expecting parallel specialists | The prose describes parallel work, but the shown graph routes to exactly one specialist and ends; parallelism is only named as a possible extension | ch08-p193-ku05 |
| Assuming a specialist can only execute its own tool group | Narrowing acts at model-selection time; in the example the execution lookup runs over the concatenated tool list | ch08-p193-ku04 |
| A router with no non-matching branch | The model's answer will eventually match no specialist name; the example's `else → END` is where that is caught | ch08-p193-ku05 |
| Specialists that each report in their own format | The shared reporting tool exists precisely to keep result reporting uniform while execution stays decentralised | ch08-p193-ku04 |
| A manager/supervisor scheme with no plan for the manager's failure | Single point of failure — the manager going down can take the system with it, and it bottlenecks as load grows | ch08-p193-ku12 |
| Democratic consensus where reaction time is critical | Aligning positions across equals slows decisions and introduces delay exactly there | ch08-p193-ku11 |
| Hierarchical levels for urgent, fast-changing work | Information crossing levels adds delay, and lower levels wait on instructions from above | ch08-p193-ku13 |
| A swarm where predictability and observability are required | Those, with efficiency, are the swarm's named design problems | ch08-p193-ku07 |
| Treating the three coordination schemes as the complete set | The section states these are the leading methods and expects new ones to appear | ch08-p193-ku10 |
| An actor-critic loop with no iteration cap | The shown code bounds the loop only by the critic's verdict — no counter, no retry limit | ch08-p193-ku14 |
| Actor-critic where generation is as hard as evaluation | The pattern's payoff condition is that evaluating a result is easier than producing one | ch08-p193-ku14 |
| Going multi-agent with no conflict-resolution protocol | Overlapping goals and failed prioritisation produce conflicts; the protocols are the stated response | ch08-p193-ku06 |
| Budgeting communication cost from the book's numbers | The chapter offers no metric for measuring it — any budget is your own judgement | ch08-p193-ku06 |

## Related decisions
- **`aiagents-tool-design-and-selection`** — step 2 of the scaling ladder *is* that skill: hierarchical
  grouping and semantic (embedding + vector search) tool selection are what you must exhaust before
  adding an agent [p.199-200]. If you split into specialists instead, each role's narrowed toolbox and
  prompt still have to satisfy that skill's metadata rules.
- **`aiagents-agent-fit-and-model-choice`** — decide there whether an agent is warranted at all and
  which model runs it; this skill starts after that answer is "an agent". Note the chapter's own
  example is not a clean comparison: the single-agent version and the multi-agent version run different
  models [p.198, p.204].
- **`aiagents-knowledge-and-memory`** — once several agents exist, they exchange context frequently
  [p.59, p.208]; what each agent may read and remember, and where shared state lives, is decided there.
- **`aiagents-observability-and-drift`** — a multi-agent system multiplies what has to be observed, and
  the swarm option makes observability an explicitly named weak spot [p.209]; the manager's bottleneck
  and the level-crossing delays are the metrics that skill has to expose.
- **`aiagents-evaluation-design`** — the actor-critic loop needs a predefined classifier or evaluation
  checklist [p.214]; the acceptance bar is designed there, not here.
- **`aiagents-learning-strategy`** — actor-critic is a re-generation loop bought with test-time compute
  [p.214]; if you want the improvement to persist rather than be re-paid every call, that is a learning
  decision.
- **`aiagents-agent-security`** — more agents means more tool-holding identities and a wider surface;
  role partitioning here determines what that skill has to defend.
- **`aiagents-multi-agent-infrastructure`** — the direct neighbour: transport and the A2A protocol,
  brokers and buses, actor frameworks, orchestrator/workflow products and the durable shared store.
  This skill deliberately stops at *how many agents and how they decide*; that skill starts at *what
  carries the traffic between them*, and it does not re-open the count or the scheme. Coupling runs one
  way and hard: the agent count and the coordination scheme chosen here set that skill's requirements —
  a manager scheme makes the supervisor the transport hot spot and its failure the single point of
  failure to design around; a democratic scheme's consensus traffic is what sizes the bus; a swarm's
  mass local broadcasts are what push the agent count past that skill's actor-framework threshold.
  Note the boundary it keeps in return: no broker choice made there reduces the §4 communication cost —
  that claim was refused by the cross-model judge and is not asserted on either side.
- **`aiagents-orchestration-and-planning`** — sequencing one agent's own multi-step flow: ReAct,
  planner-executor, decomposition, reflection, chain/graph topologies and their depth caps. Coupling:
  exhausting a better flow shape there is an alternative to adding an agent here, and once you do split,
  each specialist still runs a flow that skill designs.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 2, с. 57–60; глава 8, с. 193–215.
KUs: ai-apps-merged-ku01, ai-apps-ch08-p193-ku01, ai-apps-ch08-p193-ku04, ai-apps-ch08-p193-ku05,
ai-apps-ch08-p193-ku06, ai-apps-ch08-p193-ku07, ai-apps-ch08-p193-ku08, ai-apps-ch08-p193-ku09,
ai-apps-ch08-p193-ku10, ai-apps-ch08-p193-ku11, ai-apps-ch08-p193-ku12, ai-apps-ch08-p193-ku13,
ai-apps-ch08-p193-ku14. Deep reference: `references/knowledge-units.md`.

Page note: `ai-apps-ch08-p193-ku06` also carries с. 225, which is **not** used here — that page backs
the broker/bus claim the cross-model judge refused, and it belongs to `aiagents-multi-agent-infrastructure`.

- Crossing-threshold anchor: «сложность, инструментарий или потребности в координации задач превосходят возможности одного агента» [p.194].
- Actor-critic anchor: the pattern helps when «оценка проще генерации» [p.215].

Two consumed KUs are `verified: partial`:
- `ai-apps-ch08-p193-ku06` — excluded: the extractor's claim that brokers/buses damp communication cost
  (с. 225 credits them only with loose coupling, scalability, asynchrony), the phrase that protocols are
  established in advance, and the applicability claim about use before implementation.
- `ai-apps-merged-ku01` — `partial` inherited from its гл. 2 half (`ch02-p41-ku15`); the merge record
  does not name the refused claim, so the KU is used only where the corpus states the material directly,
  and its applicability framing is not asserted as the book's.

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] Both `partial` KUs' refused claims excluded and recorded?
- [x] Boundary clause routes infrastructure to `aiagents-multi-agent-infrastructure` and single-agent
      flow design to `aiagents-orchestration-and-planning` instead of absorbing them?
- [x] The four coordination KUs kept as one decision plus three distinct patterns, not blurred into one?

## Examples
- «У агента 16 инструментов, он стал промахиваться — пора делить на несколько агентов?» → not yet: first
  climb the ladder — group tools hierarchically or switch to semantic selection with a vector index; only
  if that falls short, decompose into specialists with one shared reporting tool, per-role tool lists and
  per-role prompts, under a supervisor with an explicit no-match fallback.
- "We need answers under a second — should we use a multi-agent design?" → no. Multi-agent normally means
  many inter-agent exchanges and higher user-visible latency; a single agent is the faster and cheaper
  option for a bounded task area. Note the book's own unreconciled counter-claim about large-scale
  logistics before quoting any performance promise.
- «Какую схему координации взять: консенсус, супервайзер или уровни?» → consensus when objectivity and
  survival under failure outrank speed (and you accept slow decisions plus a complex protocol); supervisor
  when you want fast unambiguous assignment (and you accept a single point of failure and a bottleneck);
  levels when the agent count outgrew one coordinator (and you accept design complexity plus cross-level
  delay).
- "The team wants to add a fourth agent — how do I argue about it?" → run the parsimony test first: can an
  existing node take this task, directly or with extended functions? Then the six principles, and
  specifically the efficiency check — gain versus added compute and coordination cost. Unjustified agent
  growth complicates maintenance and creates bottlenecks.
- «Планы, которые генерирует агент, плохи с первого раза — что делать?» → add an actor-critic loop if you
  can state a clear acceptance classifier and evaluation is easier than generation; budget the extra
  inference passes as test-time compute, and add the iteration cap the book's own example lacks.
- "Should we build a swarm?" → only in distributed settings — edge, sensor networks, collective real-time
  systems — where flexibility and stability outrank accuracy and central control. Predictability,
  observability and efficiency are its named weak spots, and the chapter provides no swarm implementation.
