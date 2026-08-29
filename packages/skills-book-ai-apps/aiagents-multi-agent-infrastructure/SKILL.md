---
name: aiagents-multi-agent-infrastructure
description: >
  Choose the RUNTIME PLUMBING that carries an already-decided multi-agent design: the transport
  (in-process calls and shared memory → the A2A protocol with agent cards, `/.well-known/agent.json`
  discovery, handshake and JSON-RPC 2.0 over HTTPS → a message broker), the broker itself
  (Apache Kafka for durable replayable logs, Redis Streams for cheap low-latency decoupling,
  RabbitMQ, NATS/JetStream for edge and real-time), the execution runtime (single-container
  monolith, event bus, actor framework — Ray `@ray.remote`, Orleans virtual actors, Akka on the JVM,
  crossing the book's more-than-10–20-agents threshold — or a workflow engine: Temporal durable
  workflows, Airflow DAGs, Dagger), per-session actor isolation keyed by `operation_id`, and the
  durable storage layer for shared state, agent memory and task metadata (PostgreSQL/Redis vs vector
  stores vs S3/Azure Blob vs a checkpointing framework); plus the chapter's closing outlook — ADAS
  and meta agent search, architectures generated and scored by a meta-agent, and the sandbox
  obligation its `exec`-based evaluation loop creates. TRANSPORT, EXECUTION RUNTIME and STORAGE
  LAYER for agent-to-agent traffic ONLY — NOT whether to go multi-agent at all, how many agents, or
  which coordination scheme (democratic / manager / hierarchical / swarm) governs them
  (→ `aiagents-single-vs-multi-agent`), NOT the control-flow archetype that sequences the steps —
  ReAct, planner-executor, decomposition, reflection (→ `aiagents-orchestration-and-planning`), NOT
  which knowledge or memory MECHANISM to build — RAG, BM25, embeddings, GraphRAG
  (→ `aiagents-knowledge-and-memory`), NOT what fits into one call's context window or where session
  state sits between calls (→ `aiagents-context-engineering`), NOT securing the channels, mTLS, DMZ
  segmentation or cross-agent memory poisoning (→ `aiagents-agent-security`), NOT generic container
  orchestration, cluster manifests, autoscaling or local compose stacks (→ `kubernetes`,
  `docker-compose`), NOT general-purpose Redis data-structure and caching craft
  (→ `redis-patterns`), NOT designing a REST/GraphQL API for human consumers (→ `api-design`) or
  consumer-driven contract verification of one (→ `contract-testing`), NOT the harness's own
  agent-operations practice (→ `agentic-engineering`, `enterprise-agent-ops`).
  Triggers (RU+EN): "агенты живут в одном процессе — когда пора разносить по сервисам",
  "какой брокер взять под мультиагентку: Kafka, Redis Stream или NATS",
  "заменить жёсткие рёбра графа на топик и подписчиков", "нужен ли нам фреймворк акторов",
  "Ray, Orleans или Akka", "изоляция состояния между сеансами в акторах",
  "supervisor раздаёт задачи синхронно, всё падает вместе — как развязать",
  "Temporal или Airflow для длинных агентных потоков", "шаг упал — как перезапустить только его",
  "где хранить память агентов и метаданные задач", "карта агента и JSON-RPC между агентами",
  "протокол A2A — стоит ли внедрять сейчас", "автоматическое проектирование агентных архитектур",
  "message bus for agent-to-agent communication", "do we need an actor framework for our agents",
  "durable workflow engine for long-running agent tasks",
  "where should shared multi-agent state live", "agent discovery and capability negotiation",
  "our in-memory agent router does not survive a restart".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from:
  - ai-apps-ch08-p193-ku15
  - ai-apps-ch08-p193-ku16
  - ai-apps-ch08-p193-ku17
  - ai-apps-ch08-p193-ku18
  - ai-apps-ch08-p193-ku19
  - ai-apps-ch08-p193-ku20
  - ai-apps-ch08-p193-ku21
  - ai-apps-ch08-p193-ku22
  - ai-apps-ch08-p193-ku23
  - ai-apps-ch08-p193-ku24
  - ai-apps-ch08-p193-ku25
  - ai-apps-ch08-p193-ku27
---

# Multi-agent infrastructure — the transport, the execution runtime and the durable store, chosen before the prototype meets the network

## Output
An infrastructure section for the ADR or the architecture step, naming four things and the price of
each: (1) the **transport** — direct calls inside one process, an A2A-style protocol between
heterogeneous services, or a broker topic — plus the message contract that rides on it; (2) the
**execution runtime** — one container, an event bus, an actor framework, or a workflow engine —
with the trigger that justified crossing to it; (3) the **durable storage layer** per class of state
(task results, interaction logs, agent memory, large artefacts), with the axis you are optimising;
(4) the **deployment shape** — process-per-specialist, cluster-distributed actors, or a managed
workflow — and what still has to be built by hand around it.

## When to use / NOT
- **Use when:** an in-process prototype has to move to separate services, containers or nodes; a
  supervisor routes work over hard-wired graph edges and every failure takes the whole flow with it;
  choosing between Kafka, Redis Streams, RabbitMQ and NATS for agent traffic; deciding whether an
  actor framework is worth its cluster; heterogeneous agents built by different teams or vendors
  must find each other and agree on how to call each other; a multi-step agent flow runs for hours
  or days and must survive a crash without redoing the successful steps; picking where shared state,
  agent memory and task metadata are persisted; reviewing an infrastructure proposal for a
  multi-agent system before it ships.
- **NOT for:** deciding *whether* the system should be multi-agent, how many agents to staff, how to
  partition tools into roles, or which coordination scheme governs them — that is
  `aiagents-single-vs-multi-agent`, and this skill starts only after it has answered. Not the
  control-flow archetype that decides which step runs next
  (→ `aiagents-orchestration-and-planning`) — §7 here picks the *engine* that executes and retries
  a flow, not the reasoning shape of the flow. Not which knowledge or memory mechanism exists at all
  (→ `aiagents-knowledge-and-memory`); not what is packed into one model call, nor where session
  context lives between calls (→ `aiagents-context-engineering` — §8 here owns the storage-layer
  table that sibling defers). Not the security perimeter around these channels — authorization,
  mTLS, segmentation, cross-agent poisoning (→ `aiagents-agent-security`). Not generic platform
  work: cluster manifests, autoscaling policies, ingress and pod scheduling (→ `kubernetes`), local
  multi-container development stacks (→ `docker-compose`), Redis as a general-purpose cache or data
  structure server (→ `redis-patterns`), REST/GraphQL design for human-facing APIs (→ `api-design`)
  or consumer-driven contract verification (→ `contract-testing`). Not the harness's own practice of
  running long-lived agent workloads (→ `agentic-engineering`, `enterprise-agent-ops`).

## Decision criteria

### 1. The first fork: has the system left one process? (KU: ch08-p193-ku18)
While everything runs in one process on one machine, agents talk through direct function calls,
shared memory, or an in-process message queue. The book calls these simple and efficient, and says
plainly that they scale badly [p.221]. The moment agents are separated into distinct services,
containers or nodes, the exchange must become explicit, asynchronous and able to survive failures
[p.221].

Four factors the chapter names as what erodes the in-process scheme [p.220]:

- the system's scope grows;
- the number of agents grows;
- the agents become geographically distributed;
- deployment itself becomes complex.

The practical boundary is stated through an example rather than a rule: local deployments on
frameworks such as AutoGen are often built on in-memory routers that carry both inter-agent message
passing and tool invocation [p.221]. For research work and prototypes — the more so single-threaded
and single-agent — that is enough; production operation requires moving **both** communication
**and** state management outside those bounds [p.221].

**Honest scope of this section.** It hands you the axes of the compromise — development effort,
latency, scalability, reliability, cost [p.221] — and explicitly does not hand you a rule for
picking a concrete technology [p.221]. Sections 2-7 below are the option space, not a decision
procedure the book endorses.

### 2. Transport between heterogeneous agents: the A2A protocol (KU: ch08-p193-ku19)
A2A (agent-to-agent), developed at Google, is a standardised cross-platform mechanism: agents locate
peers, agree the terms of an interaction, and send each other structured requests without exposing
their internal logic or implementation details [p.221]. It rides on HTTP-based transport, and the
stated ambition is to make multi-agent coordination as unremarkable as API calls between
microservices [p.221].

**The agent card** is the unit that makes this work: a machine-readable JSON descriptor each agent
publishes, carrying identity, capabilities, endpoints and supported authentication methods [p.221].
Capabilities are declared explicitly (`generateReport`, `summarizeLegalDocument`) together with
input and output schemas — that pairing is what makes agent workflows structurally composable
[p.221]. Versioning and supported transfer facilities are optional metadata [p.221]. The book's
example [p.222]:

```python
agent_card = {
"identity": "SummarizerAgent",
"capabilities": ["summarizeText"],
"schemas": {
"summarizeText": {
"input": {"text": "string"},
"output": {"summary": "string"}
}
},
"endpoint": "http://localhost:8000/api",
"auth_methods": ["none"],  # В продакшене: OAuth2, API-ключи и т. д.
"version": "1.0"
}
```

**The five steps** [p.222-224]:

1. Publish the card at a discovery endpoint — the book's example is
   `/.well-known/agent.json` [p.222].
2. Find a peer through a registry of cards, which may be centralised or distributed [p.222].
3. The initiating agent performs a handshake: cards are exchanged and session parameters agreed —
   protocol version, timeout expectations, payload limits [p.222].
4. The client checks compatibility before it calls anything [p.222-223]:

   ```python
   if agent_card['version'] != '1.0':
   raise ValueError("Несовместимая версия протокола")
   if "summarizeText" not in agent_card['capabilities']:
   raise ValueError("Требуемая возможность не поддерживается")
   ```

5. The call itself goes out as a JSON-RPC request, and a server-side failure comes back in the same
   envelope [p.223-224]:

   ```python
   rpc_request = {
   "jsonrpc": "2.0",
   "method": "summarizeText",
   "params": {"text": "..."},
   "id": 123  # Уникальный идентификатор запроса
   }
   # Ошибка возвращается тем же конвертом:
   "error": {"code": -32601, "message": "Метод не найден"}
   ```

**Transport independence.** The reference implementation is `JSON-RPC 2.0` over `HTTPS`, but the
protocol is designed to be transport-agnostic, which opens integration over gRPC, WebSocket and
other streaming or multiplexed protocols [p.222]. JSON-RPC is what gives uniform handling of
requests, responses and errors — a shared semantic model for agents written in different languages
and frameworks [p.222].

**Maturity is a first-class input to this decision** [p.224]. The protocol is at an early stage.
Authentication is supported through plugin mechanisms, but robust authorization, rate limiting,
trust establishment and abuse resistance are far from solved. The book's own counsel is enthusiasm
with caution: early adopters should budget in advance for security holes, unfinished implementations
and shifting specifications, and whether A2A becomes a standard is too early to say [p.224]. So an
A2A bet today is a bet on an unsettled spec, and the ADR should say so in those words.

### 3. Choosing a message broker (KU: ch08-p193-ku20)
The question this answers: point-to-point interactions between agents have become brittle and
inflexible, and you are scaling past a synchronous graph [p.225]. Restructured from the chapter's
list of options, с. 225-226, around *what this system values most* — the cells report only what the
book credits each option with:

| Приоритет | Вариант | Что даёт и чем ограничен |
|---|---|---|
| Durability and a replayable history | **Apache Kafka** — a high-throughput distributed event-streaming platform [p.225] | Strong durability, topic partitioning for parallelism, consumer groups for coordination; called out as especially good for log-based architectures where every interaction is retained and can be replayed [p.225] |
| Simple deployment and low latency at moderate throughput | **Redis Stream, RabbitMQ** [p.225] | Lightweight alternatives; Redis Stream gives fast in-memory communication, with reliability described as somewhat limited [p.225] |
| Low latency plus high throughput in microservice and edge settings | **NATS** (Neural Autonomic Transport System) [p.225] | Publish/subscribe and request/response, and with JetStream long-lived message streams and replay; the emphasis is simplicity, speed and scalability at minimal resource cost [p.225-226] |

What the broker pattern itself buys, independent of which one you take: senders are separated from
receivers and interaction becomes asynchronous through a shared mechanism, which yields scalable,
fault-tolerant and observable workflows in loosely coupled architectures [p.225]. What it costs:
consistency is only eventual, and error handling becomes markedly harder [p.227].

> **A claim deliberately not made here.** A broker or bus is *not* presented as a damper on the
> communication cost of a multi-agent design. A cross-model judge already refused exactly that
> formulation when it was written into the coordination-cost material of
> `aiagents-single-vs-multi-agent`: с. 225 credits brokers with loose coupling, scalability and
> asynchrony, and with nothing about lowering the cost of agents exchanging information. If you are
> reaching for a broker to cut inter-agent chatter, that is your own hypothesis to measure.

The book's own worked choice is a prototype-grade one: in the supply-chain example it takes Redis
Stream because the decoupling comes out cheap and responsive, which is enough for a prototype
[p.226]. No criteria for the production-stage choice are given at that point.

### 4. Replacing hard graph edges with a topic (KU: ch08-p193-ku21)
The starting shape: a supervisor routes requests along graph edges directly, which welds the nodes
together [p.225]. The transformation [p.225]: the supervisor publishes tasks to a shared topic (in
the example, `supply-chain-tasks`), and specialists subscribe asynchronously and process only the
messages that concern them. Three consequences the book names [p.225]:

1. **Independent scaling** — for instance, replicating the inventory instances alone.
2. **Fault tolerance** — missed messages can be replayed.
3. **Extensibility** — new agents join without rewriting the graph.

Implementation on Redis Streams (`docker run -p 6379:6379 redis`, `pip install redis`) [p.226]:

```python
# 1. Supervisor publishes the task
task_id = str(uuid.uuid4())
task_message = {
'task_id': task_id,
'agent': agent_name,
'operation': operation,
'messages': serialize_messages(messages)
}
r.xadd('supply-chain-tasks', {'data': json.dumps(task_message)})

# 2. Specialist consumer loop: read, filter by agent name, answer on a separate stream
msgs = r.xread({'supply-chain-tasks': last_id}, count=1, block=5000)
if task['agent'] == 'inventory':
    r.xadd('supply-chain-responses', {'data': json.dumps(response)})
    last_id = entry_id

# 3. Correlate the answer by task_id, with a timeout
def wait_for_response(task_id, timeout=60):
    raise TimeoutError("Нет ответа")
```

Specialists are recommended to run as separate processes — a multi-process layout — which gives fast
asynchronous coordination in which, say, the supplier specialist can work through a compliance check
without blocking the others [p.227].

**What you buy and what you pay** [p.227]: loose coupling, elastic scaling, observability through
log pipelines and replay of failed or missed messages — against eventual-consistency problems and
distinctly harder error handling.

**Source gap to close yourself.** Message serialisation and deserialisation is required, and the
book leaves `deserialize_messages` as a stub pointing at the full code listing [p.226] —
reconstructing the message types (`HumanMessage`, `AIMessage`) is left to the reader.

### 5. When an actor framework earns its infrastructure bill (KU: ch08-p193-ku22)
**The distinction from a bus** [p.228]: buses primarily decouple components by routing events
asynchronously — the focus is the data flow, not execution control. Actor frameworks unify message
passing *and* computation in one model: actors encapsulate their own state and behaviour and process
messages sequentially, which removes the races and shared-state bugs typical of multi-threaded
systems [p.228].

**The baseline it is set against** [p.228]: a monolithic deployment of the agent service in a single
container with centralised logic, synchronous model calls and in-memory orchestration. Simple for
prototypes; at scale it produces single points of failure, wasteful resource use while idle, and
difficulty parallelising different agent roles.

**The threshold rule as the book states it** [p.228]: on small, low-traffic installations the extra
complexity of actors does not pay for itself — buses or a monolithic service are the better fit; but
once the number of agents grows past 10-20, or latency requirements tighten, actors deliver
elasticity and fault tolerance the book calls incomparable. This is the one numeric marker in the
whole section; everything else in it is qualitative.

**Where actors are said to pay off** [p.228]: fine-grained distribution, stability and dynamic
scaling — multi-agent models with long-lived agent memory (dialogue history, learned behaviour),
highly concurrent environments (real-time bidding, IoT coordination), systems mixing heterogeneous
agents across clusters; agent swarms in real operation where downtime is expensive; and the move
from local prototypes to cloud deployments. The capabilities bought with that infrastructure:
location-transparent activation — actors migrate and replicate without code changes — and built-in
supervision with automatic recovery after failures [p.228].

| Фреймворк | Что даёт | Где книга его размещает |
|---|---|---|
| **Ray** | Distributed computing for Python; actors declared with the `@ray.remote` decorator, methods called asynchronously while internal state persists between calls; Ray handles distribution itself, with resource-aware scheduling, fault tolerance through restarts and retries, and clustering [p.228-229] | Combines naturally with AutoGen and LangGraph; the pick where ease of use and fast prototyping matter more than JVM-specific performance tuning [p.228-229] |
| **Orleans** | The *virtual actor* model: logical addressing, automatic instantiation on demand, suspension and restoration; state persistence, concurrency and lifecycle management with almost no boilerplate [p.229] | Each agent is treated as a dynamically scalable service that keeps its state and identity [p.229] |
| **Akka** | An actor framework of the JVM ecosystem (Java and Scala): high performance, fine-grained control over actor behaviour, and with clusters — sharding, durable storage, supervision and adaptive load distribution [p.229] | Low-latency, high-throughput applications that need tight control over concurrency [p.229] |

**The language tax is real.** Orleans is primarily .NET-based and Akka is JVM-based, so the book's
Python examples port to them only with language-level adaptation [p.230]. That is a staffing
question as much as an architecture one.

### 6. Session isolation with actors: one actor per specialist type per session (KU: ch08-p193-ku23)
The problem this pattern solves: shared state across sessions pollutes agent context, and concurrent
calls into a single agent create races.

The scheme [p.230]: wrap each specialist agent as a Ray actor scoped to a session. The session is
identified by `operation_id`, and a **separate** actor instance is created under it for each
specialist type. The result is per-session history and caches, sequential task execution within a
session, no cross-session data contamination, and parallel processing *between* sessions across the
cluster [p.230]. A session manager tracks sessions and creates them on demand [p.230].

```python
@ray.remote
class SpecialistActor:
def __init__(self, name: str, specialist_llm, tools: list,
system_prompt: str):
self.name = name
self.llm = specialist_llm
self.tools = {t.name: t for t in tools}
self.prompt = system_prompt
self.internal_state = {}

@ray.remote
class SessionManager:
def __init__(self):
self.sessions: dict[str, dict[str, ray.actor.ActorHandle]] = {}
def get_or_create_actor(self, session_id: str, agent_name: str,
llm, tools: list, prompt: str):
if session_id not in self.sessions:
self.sessions[session_id] = {}
if agent_name not in self.sessions[session_id]:
actor = SpecialistActor.remote(agent_name, llm, tools, prompt)
self.sessions[session_id][agent_name] = actor
return self.sessions[session_id][agent_name]
```

Concurrent requests to one Ray actor are queued and executed one at a time, so ordering and state
integrity hold [p.231]. The `internal_state` dictionary is locked inside the session, so data such
as completed stages lives long without shared-memory risk [p.231]. Ray spreads actors over cluster
nodes, and a state read of the form
`ray.get(manager.get_session_state.remote(session_id, agent_name))` retrieves session data without
any global shared access [p.231-232]; `get_session_state` returns a future [p.231].

**The guarantee and the ceiling are the same property.** Sequential execution inside one actor is
what protects integrity, and it is also a per-actor throughput limit [p.231]; the chapter's own
summary table lists per-actor sequential constraints as a drawback [p.237]. If one session's
specialist becomes a hot spot, the actor model will not fan it out for you.

The section's closing claim: actor frameworks give a proven scalable basis for treating each agent
as an autonomous self-sufficient unit able to run asynchronous flows, hold long-term memory and fit
into distributed infrastructure [p.232].

### 7. A workflow engine on top of the transport (KU: ch08-p193-ku24)
Reliable message delivery is not enough on its own: something still has to order the tasks, provide
retries, track dependencies and handle failures between agents [p.232].

**When the book says you need one** [p.232]: unreliable external dependencies (APIs, foundation
models, human approvals), plausible failures, and long-running operations — supply-chain flows that
stretch over days because of asynchronous agent actions or real-world delays. By preserving state
and automating recovery, these mechanisms prevent data loss and repeated work [p.232].
**When you do not** [p.232]: fast, low-risk experiments are adequately served by ordinary scripts.
Named indications for adoption [p.232]: scaling a prototype to a stable deployment, especially in
financial transactions, heavily regulated operations and distributed AI agents.

| Инструмент | Что даёт | Где уместен |
|---|---|---|
| **Temporal** | Durable stateful workflows, long-running tasks, retries, recovery after failure; a flow resumes from the last successful step even after a crash [p.232-233] | Multi-agent systems where each agent performs asynchronous multi-step actions [p.232] |
| **Apache Airflow** | Coordination of agent flows as DAGs; a mature ecosystem and visualisation tooling [p.234] | Periodic pipelines with many dependencies — ETL jobs, ML training; explicitly **not** for real-time work or dynamic agent interactions [p.234] |
| **Dagger** | Workflows as code over containers, foundation models and other resources, with automatic caching and type safety [p.234] | Local prototyping of orchestration before scaling; consistency across local development, CI/CD and production [p.234] |

The Temporal pattern in the example (`pip install temporalio`) sequences agent steps — inventory,
then transport, then supplier verification — with automatic retries and durable state [p.232-233]:

```python
inventory_result = await workflow.execute_activity(
"inventory_activity",
{"operation": operation, "messages": initial_messages},
start_to_close_timeout=timedelta(seconds=30),
retry_policy=RetryPolicy(maximum_attempts=3)
)
```

The property all of this is for: if the transport step fails, that step is what repeats — the
inventory agent is not restarted [p.234]. For long-running processes, signals are added for user
input or suspension [p.234]. Generalised: workflow mechanisms sit at a higher level of abstraction,
separating coordination logic from the communication mechanism, and supply idempotency,
recoverability and state durability [p.234].

**Do not read the numbers as advice.** The 30-second timeout and three attempts are the example's
parameters, not a recommendation the book makes.

### 8. The durable storage layer (KU: ch08-p193-ku25)
The need: a multi-agent system must carry shared state, agent memory and task metadata across many
executions, workflows and restarts [p.234]. Restructured from табл. 8.1 («Обзор вариантов
долговременного хранения»), с. 234-236, around *what price of control you are willing to pay* —
each cell reports the book's own claim for that row:

| Что вам нужнее всего | Слой | Чем платите |
|---|---|---|
| Flexibility, ad-hoc queries, low cost | **Stateful databases** — PostgreSQL and Redis are the ones named — for task results, interaction logs and agent memory [p.234] | Manual management and a risk of inconsistency [p.235]; you own schema design, read/write consistency, caching and recovery logic yourself — extra engineering effort and non-obvious bugs [p.234-235] |
| Semantic search and scalable embeddings | **Vector stores** (Pinecone in the example) [p.235] | Higher cost and specialised configuration; the niche is knowledge-intensive agents [p.235] |
| Cheap storage of large unstructured artefacts | **Object stores** (Amazon S3, Azure Blob Storage) for plans, tool traces, large JSON objects [p.235] | Slow access and no built-in indexing — you need separate indexing or tracking mechanisms tying artefacts back to tasks and agent state [p.235] |
| Automatic recovery with minimal boilerplate | **Stateful orchestration frameworks**: Temporal checkpoints on its own, replays deterministically and handles failures invisibly to the developer; Orleans keeps durable event-managed state behind each actor [p.235] | Framework lock-in: serialisation formats, execution models and language bindings do not suit every architecture [p.235] |

**A defect in the source, worth knowing before you cite the table.** The first row is headed as
relational databases with PostgreSQL/Redis as the example [p.235], while the prose of the same
section places Redis among stateful databases alongside vector stores [p.234] — the row header does
not match its own content. Cite the content, not the heading.

**No numbers exist here.** The final compromise is framed on four axes — developer effort,
performance, durability, flexibility [p.236] — and the book supplies no quantitative guidance on any
of them. This is the table the context-engineering sibling defers to this skill; what crosses back
over that seam is the axis that dominates, not a recommended product.

### 9. The mechanisms at one glance — and why this is not a migration route (KU: ch08-p193-ku27)
Restructured from табл. 8.2 («Методы координации агентов»), с. 237, around the use-case column
(every row is illustrated on the same supply-chain example). Row order is the table's own:

| Потребность / сценарий | Механизм | Что покупаете | Чем расплачиваетесь |
|---|---|---|---|
| Prototype, quick experiments, a limited set of agents and tools | Single-container deployment — all logic in one container, synchronous calls, state and orchestration in memory [p.237] | Trivial setup, low latency, a prototype assembled fast [p.237] | One point of failure for the whole system, weak scalability, concurrency trouble [p.237] |
| Agents collaborating in dynamic ecosystems | A2A — discovery through agent cards, parameter negotiation, JSON-RPC over any transport (HTTP, gRPC) [p.237] | Heterogeneous agents understand each other, the system stays modular, channels are protected [p.237] | Immaturity: security holes, still-shifting specifications, and discovery itself costs resources [p.237] |
| Distributing tasks to executors: the supervisor publishes, specialists subscribe | Message brokers — Kafka where durability is needed; Redis Stream for low latency; NATS for real-time [p.237] | Coupling loosened, the system scales, failed messages are replayed [p.237] | Consistency arrives late, errors are harder to unpick, latency may grow [p.237] |
| Session-scoped agents, each with its own state | Actor frameworks — Ray in Python and distributed settings; Orleans for virtual actors; Akka on the JVM for performance [p.237] | State and behaviour fused in one object, failures healed automatically, scale grows, actor location is transparent [p.237] | Infrastructure investment required, framework lock-in appears, one actor handles tasks strictly in turn [p.237] |

**Two limits on how this table may be used.**

- **It is not a ladder and not a migration path.** The book presents these as a comparison to help
  a developer get their bearings among the options [p.237]; it states no order of adoption and no
  route from one row to the next. A header promising "when to escalate from row N to row N+1" would
  assert a progression the source never draws — so this table deliberately has no such column.
- **It is incomplete relative to the chapter.** Workflow mechanisms (Temporal, Airflow, Dagger) are
  worked through in the chapter text [p.232-234] and named again in the conclusion [p.236], but they
  never made it into табл. 8.2 — read §7 alongside this table, not the table alone.

The thesis that makes this a design table rather than a reference card: designing for effective
communication is not an implementation detail but a first-order factor shaping how agents perceive,
react to and interact with their environment [p.236-237]. The production layers the conclusion lists
are message brokers (Kafka, NATS, RabbitMQ), actor frameworks (Orleans, Akka) and workflow
mechanisms (Temporal, Conductor) — their remit is wider than message passing, covering state,
retries and execution stability [p.236].

### 10. The outlook the chapter closes on: ADAS and meta agent search (KU: ch08-p193-ku15, ch08-p193-ku16, ch08-p193-ku17)
This is the chapter's forward-looking material, kept here because its evaluation loop is an
infrastructure problem. Treat it as a direction to read about, not a pattern to adopt.

**ADAS** (automated design of agentic systems) is a development method in which agent architectures
are not designed by hand but are created, evaluated and iteratively improved by a higher-level agent,
MAS — meta agent search [p.215-216]. The idea is due to Shengran Hu, Cong Lu and Jeff Clune in a
2024 paper [p.216]; the supporting observation is that hand-designed solutions in machine learning
have historically been displaced by learned or automated alternatives [p.216]. Foundation models act
as universal flexible modules inside an agent architecture and already appear in reasoning chains,
self-reflection and Toolformer-style agents; ADAS goes further by letting agents autonomously invent
new structures and modules — prompts, logic flows, tool usage — generated dynamically by the
meta-agent [p.216]. The premise underneath is defining agents **in code**: Turing-complete languages
in principle allow any conceivable structure or behaviour to be invented, including workflows and
decision processes the designer never anticipated [p.217].

Three architecture components, from the caption of Рис. 8.1 [p.216]: the **search space** (the
region of representable agent architectures, e.g. agents defined in code), the **search algorithm**
(the strategy for exploring it, e.g. an LLM defining agents at code level), and the **evaluation
function** (an objective definition of candidate effectiveness against goals such as performance,
fault tolerance and efficiency — e.g. the share of correct results on a task).

**The MAS cycle** [p.217-218]: the meta-agent writes code defining new agents and tests them across
a body of tasks; each successful design is archived, forming a growing knowledge base for later
generations.

1. With the archive of previous agents in hand, generate a high-level design description.
2. Translate it into code, defining a `forward` function for the agent [p.217].
3. Refine through **two** self-reflection stages — on novelty, and on correctness.
4. Evaluate on validation data; errors trigger **up to five** debugging refinements.
5. Archive successful agents together with performance metrics — accuracy or F1 — which feed the
   next iterations.

The cycle balances exploring new designs against exploiting high-scoring ones, and typically runs
for **25-30 generations** [p.218]. Implementation anchors [p.217-219]: a foundation-model agent base
class (`LLMAgentBase` — wraps model calls, forces JSON output for parsing, handles errors, with
configurable role and temperature) [p.218]; the search loop; the evaluation function. Evaluation
loads the generated agent code dynamically through `exec`, applies it to task data in parallel
across threads, and computes the share of correct results by a task-specific formula [p.219]:

```python
acc_list = evaluate_forward_fn(args, next_solution["code"], task)
next_solution['fitness'] = bootstrap_confidence_interval(acc_list)
archive.append(next_solution)

exec(forward_str, globals(), namespace)
func = namespace['forward']  # Предполагается одна функция
```

Adapting to a new task means subclassing an abstract `BaseTask` that defines data loading,
formatting and prediction parsing: for MMLU the A-D letter answers become indices compared for exact
match, and for ARC grid transformations are compared pixel by pixel [p.219].

**Reported results** [p.219, numbers as printed]. On the ARC competition (grid-transformation tasks)
MAS-generated agents beat the hand-designed baselines `Chain-of-Thought (CoT)`, `Self-Refine` and
`LLM-Debate` [p.219]:

| Бенчмарк | Результат MAS | Прирост над базовой линией |
|---|---|---|
| DROP (понимание прочитанного), F1 | 79,4 ± 0,8 | +13,6 над Role Assignment |
| MGSM (математика) | 53,4 % ± 3,5 | +14,4 % над LLM-Debate |
| MMLU (многозадачность) | 69,6 % ± 3,2 | +2 % над оптимизацией промптов OPRO |
| GPQA (научная область) | 34,6 % ± 3,2 | +1,7 % над OPRO |

Transfer did not destroy quality: the book reports agents derived on ARC then applied to MMLU, and a
change of the underlying model (GPT-3.5 → GPT-4) that likewise did not drop the level of results
[p.219]. The authors read that robustness as evidence that MAS agents carry more general principles
and adaptive structures rather than fitting one task [p.220].

**Three cautions that belong in the same breath as those numbers.**

- The gains are strongly uneven — from +14,4 % on MGSM down to +1,7 % on GPQA [p.219] — so the win
  depends on the domain; and the figures come from the ADAS source paper, not from an independent
  reproduction.
- The fitness metric is a bootstrap confidence interval over the accuracy list [p.219], and the
  evaluation executes generated code through `exec` — running unvetted code, presented without any
  discussion of isolation. If you build this loop, the sandbox is yours to design; the perimeter
  around it is `aiagents-agent-security`.
- The direction raises ethical and technical questions of safety, reliability and alignment with
  human values, and evolving agents may develop unforeseen behaviour; the balance the book names is
  freedom to innovate inside safe, predictable bounds [p.220].

## Key facts & formulas
- In-process options while everything is one process: direct function calls, shared memory, an
  in-process message queue — simple, efficient, poorly scalable [p.221]. The four factors that erode
  them: growing scope, growing agent count, geographic distribution, deployment complexity [p.220].
- Compromise axes named for the local-vs-distributed choice: development effort, latency,
  scalability, reliability, cost [p.221]. **No selection rule is given** [p.221].
- A2A agent-card contents: identity, capabilities, endpoints, supported authentication methods
  [p.221]; discovery endpoint example `/.well-known/agent.json` [p.222].
- A2A reference transport: `JSON-RPC 2.0` over `HTTPS`; the protocol is designed transport-agnostic,
  admitting gRPC, WebSocket and other streaming or multiplexed protocols [p.222]. Error envelope
  example: code `-32601` [p.224].
- Broker options and their stated priorities: Kafka — durability and replay; Redis Stream /
  RabbitMQ — lightweight, low latency, Redis reliability described as somewhat limited; NATS
  (+ JetStream) — low latency plus high throughput, edge and real time [p.225-226].
- Broker pattern payoff: sender/receiver separation, asynchrony, scalable, fault-tolerant and
  observable workflows [p.225]. Price: eventual consistency, harder error handling [p.227].
- The chapter's own prototype pick is Redis Stream, chosen as cheap and responsive for a prototype
  [p.226].
- Actor threshold: past **10-20 agents**, or under tightened latency requirements, actors are said
  to give incomparable elasticity and fault tolerance; below that, buses or a monolith [p.228].
- Actor vs bus distinction: buses route events (data flow); actors fuse messaging with computation
  and process messages sequentially, removing races [p.228].
- Actor frameworks: Ray (`@ray.remote`, Python, pairs with AutoGen and LangGraph), Orleans (virtual
  actors, .NET), Akka (JVM, sharding and durable state in clusters) [p.228-230].
- Session isolation: one actor per specialist type per `operation_id`; concurrent calls to one actor
  are queued and run one at a time [p.230-231]. That serialisation is listed as a drawback —
  per-actor sequential constraints [p.237].
- Workflow engines: Temporal (durable state, resumes from the last successful step), Airflow (DAGs,
  batch and scheduled work, explicitly not real-time), Dagger (workflows as code over containers,
  caching, type safety) [p.232-234].
- Temporal example parameters — `start_to_close_timeout` 30 s, `RetryPolicy(maximum_attempts=3)`
  [p.233] — example values, not a recommendation.
- Failure granularity that justifies the engine: the failed step repeats, the already-successful
  agent does not restart [p.234].
- Storage layers: stateful databases (PostgreSQL, Redis), vector stores (Pinecone), object stores
  (S3, Azure Blob), stateful orchestration frameworks (Temporal, Orleans) [p.234-235]. Final
  compromise on four axes — developer effort, performance, durability, flexibility — with **no
  quantitative guidance** [p.236].
- Production layers named in the conclusion: brokers (Kafka, NATS, RabbitMQ), actor frameworks
  (Orleans, Akka), workflow mechanisms (Temporal, Conductor) — covering state, retries and execution
  stability, not only messaging [p.236].
- MAS cycle: design description → code with a `forward` function → two self-reflection stages
  (novelty, correctness) → validation with up to **five** debugging refinements → archive with
  metrics; typically **25-30 generations** [p.217-218].
- MAS benchmark results [p.219]: DROP F1 79,4 ± 0,8 (+13,6); MGSM 53,4 % ± 3,5 (+14,4 %);
  MMLU 69,6 % ± 3,2 (+2 %); GPQA 34,6 % ± 3,2 (+1,7 %). Spread of gains: +14,4 % down to +1,7 %.

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| Shipping an in-memory router to production because it worked in the prototype | Such routers carry both message passing and tool invocation and are named as adequate for research and prototypes; production requires moving communication **and** state management outside them | ch08-p193-ku18 |
| Externalising communication but leaving state in process memory | The book names both as what must leave the in-process bounds; half the move buys none of the durability | ch08-p193-ku18 |
| Adopting A2A as if it were a settled standard | The protocol is at an early stage; authorization, rate limiting, trust establishment and abuse resistance are far from solved, and whether it becomes a standard is too early to say | ch08-p193-ku19 |
| Publishing an agent card without input/output schemas | Capabilities plus their schemas are exactly what makes agent workflows structurally composable | ch08-p193-ku19 |
| Calling a discovered peer without the compatibility check | The example refuses on a version mismatch and on a missing capability before any request goes out | ch08-p193-ku19 |
| Reaching for a broker to reduce inter-agent communication cost | с. 225 credits brokers with loose coupling, scalability and asynchrony — not with lowering that cost; a cross-model judge already refused that formulation in the sibling skill | ch08-p193-ku20 |
| Choosing Redis Stream for production because the book's example uses it | It is picked there as cheap and responsive for a **prototype**, and its reliability is described as somewhat limited; no production selection criteria are given at that point | ch08-p193-ku20 |
| Moving to a broker without reworking error handling | Consistency becomes eventual and error handling becomes markedly harder — that is the stated price of the pattern | ch08-p193-ku21 |
| Publishing tasks to a topic while leaving message serialisation unfinished | The example's `deserialize_messages` is a stub; message types must be reconstructed by the reader before any of this runs | ch08-p193-ku21 |
| Standing up an actor cluster for a handful of agents on low traffic | Below the 10-20 mark the added complexity is said not to pay for itself; buses or a monolithic service fit better | ch08-p193-ku22 |
| Treating an event bus and an actor framework as interchangeable | A bus routes events; actors unify messaging with computation and serialise message processing per actor | ch08-p193-ku22 |
| Picking Orleans or Akka without accounting for the runtime | Orleans is primarily .NET and Akka is JVM; the book's Python examples port only with language-level adaptation | ch08-p193-ku22 |
| Sharing one actor instance across sessions | The pattern's whole point is a separate actor per specialist type per `operation_id` — isolated history and caches, no cross-session contamination | ch08-p193-ku23 |
| Expecting one actor to absorb a concurrency spike | Calls into a single actor are queued and executed one at a time; the same property that guarantees integrity caps throughput, and the chapter lists it as a drawback | ch08-p193-ku23 |
| Wrapping a fast, low-risk experiment in a workflow engine | The book says ordinary scripts are adequate there | ch08-p193-ku24 |
| Using Airflow for real-time agent interaction | It is placed with periodic dependency-heavy pipelines and explicitly excluded from real-time and dynamic agent work | ch08-p193-ku24 |
| Copying the 30-second timeout and three attempts as a standard | Those are the example's parameters, not a recommendation the book makes | ch08-p193-ku24 |
| Restarting the whole flow after one agent's step fails | The reason to run a durable workflow engine is that the failed step repeats while the successful ones do not | ch08-p193-ku24 |
| Putting every class of state in one store | The layers are separated by need — queryable results, semantic search, large artefacts, automatic checkpointing — and each carries a different price | ch08-p193-ku25 |
| Quoting the table's relational-database row heading as the book's classification | The heading names PostgreSQL/Redis as relational while the same section's prose places Redis among stateful databases — the heading contradicts its own content | ch08-p193-ku25 |
| Choosing a stateful orchestration framework as a pure win | It buys automatic recovery with little boilerplate and costs framework lock-in — serialisation formats, execution models, language bindings | ch08-p193-ku25 |
| Reading табл. 8.2 as a maturity ladder or a migration route | The comparison exists to orient a developer among the options; no order of adoption and no path between rows is stated anywhere | ch08-p193-ku27 |
| Using табл. 8.2 as a complete inventory of the chapter's mechanisms | Workflow engines are covered in the text and named in the conclusion but are absent from that table | ch08-p193-ku27 |
| Running a MAS-style search loop without sandboxing the generated code | Evaluation executes generated agent code through `exec`; the book presents this without any discussion of isolation | ch08-p193-ku16 |
| Quoting the MAS benchmark gains as a general expectation | Gains span +14,4 % to +1,7 % depending on domain, and the numbers come from the ADAS source paper rather than an independent reproduction | ch08-p193-ku17 |

## Related decisions
- **`aiagents-single-vs-multi-agent`** — decides there whether the system is multi-agent at all, how
  many agents, how tools are partitioned into roles, and which coordination scheme runs them. That
  answer is this skill's input: a manager/supervisor scheme is what §4 converts from hard graph edges
  into a topic, and a swarm's node count is what pushes §5 past the 10-20 actor threshold. This skill
  does not revisit agent count, and does not claim brokers reduce the coordination cost that sibling
  measures.
- **`aiagents-orchestration-and-planning`** — owns the control-flow archetype and how steps chain.
  §7 here picks the *engine* that sequences, retries and durably resumes those steps; if the
  archetype changes, the workflow engine's requirements change with it, not the other way round.
- **`aiagents-context-engineering`** — owns what enters a single model call and where session state
  sits between calls; it explicitly defers the storage-layer options table (§8) to this skill. What
  crosses the seam is the dominating axis among developer effort, performance, durability and
  flexibility [p.236] — the product choice is made here.
- **`aiagents-knowledge-and-memory`** — decides which knowledge and memory mechanisms exist (RAG,
  keyword index, semantic memory, graph). §8 then places the resulting stores: a vector store is the
  layer for semantic search over embeddings [p.235], and long-lived agent memory is one of the
  scenarios that justifies actors [p.228].
- **`aiagents-agent-security`** — the transport chosen here is the surface it defends. A2A's own
  named gaps — authorization, rate limiting, trust establishment, abuse resistance [p.224] — and the
  `exec`-based MAS evaluation loop [p.219] are handed over there, not solved here.
- **`aiagents-observability-and-drift`** — brokers are credited with observable workflows through log
  pipelines [p.225, p.227] and actor frameworks with built-in supervision [p.228]; what to
  instrument on top of that infrastructure and which thresholds to alert on is decided there.
- **`aiagents-evaluation-design`** — MAS scores candidate architectures with a task-specific accuracy
  formula and a bootstrap confidence interval [p.219]; any evaluation function you build for an
  automated search is designed under that skill, not this one.
- **`aiagents-human-in-the-loop`** — the book names human approvals among the unreliable dependencies
  that justify a workflow engine, and signals for user input in long-running processes [p.232, p.234];
  when and how control passes to a person is that skill's decision, the durable pause is this one's
  mechanism.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 8 «От одного агента ко многим», с. 215-237 — the union of the `sources:` page lists of the 12
consumed KUs (ADAS/MAS с. 215-220; локальные и распределённые коммуникации с. 220-221; протокол A2A
с. 221-224; брокеры сообщений с. 225-227; фреймворки акторов с. 228-232; оркестрация рабочих потоков
с. 232-234; долговременное хранение с. 234-236; сводка и заключение с. 236-237).

KUs: ai-apps-ch08-p193-ku15, ku16, ku17, ku18, ku19, ku20, ku21, ku22, ku23, ku24, ku25, ku27.
Deep reference: `references/knowledge-units.md`.

Seam note: `ai-apps-ch08-p193-ku25` appears in the T06 input as well; it is **owned here** in full,
and `aiagents-context-engineering` uses it only for the where-does-state-live-between-calls angle.

Anchor quotes for human spot-check:
- Actor threshold: «с ростом количества агентов более 10–20 или ужесточением требований к задержке акторы обеспечивают несравненную эластичность» [p.228].
- Why this chapter is a design chapter: «Проектирование с расчетом на эффективность коммуникаций — не просто подробность реализации, а первоочередной фактор» [p.236].

All 12 consumed KUs are `verified: true` — no `partial` exclusion applies within this cluster. One
external refusal is honoured: the claim that message brokers or buses damp the communication cost of
a multi-agent design was refused by a cross-model judge in `ai-apps-ch08-p193-ku06`
(`aiagents-single-vs-multi-agent`); it is not restated here from `ku20`.

## Self-check
- [x] Every Decision-criteria subsection and Anti-pattern cites a KU listed in `derived_from`?
- [x] «Источник» pages computed from the consumed KUs' `sources:` blocks, not typed from memory?
- [x] No `partial` KU in this cluster, and the external refusal about brokers and communication cost
      is honoured rather than laundered through a different citation?
- [x] Табл. 8.2 restructured **without** a maturity-ladder or migration-path header, with the
      not-a-route limit stated?
- [x] Description leads with transport / runtime / storage nouns and defers `kubernetes`,
      `docker-compose`, `redis-patterns`, `api-design`, `contract-testing` by id?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?

## Examples
- «Прототип на LangGraph: супервайзер синхронно дёргает специалистов, всё в одном контейнере. Что
  ломать первым?» → the single-container row is the prototype row: trivial setup and low latency
  against one point of failure. The first move the chapter makes is replacing the hard graph edges
  with a topic — the supervisor publishes to `supply-chain-tasks`, specialists subscribe and filter
  by agent name, answers come back on a response stream correlated by `task_id` with a timeout.
  Budget the price: eventual consistency and materially harder error handling.
- "Kafka, Redis Streams or NATS for our agent traffic?" → by priority, not by popularity: Kafka when
  you need durability and a replayable log of every interaction; Redis Streams for cheap, responsive
  in-memory decoupling with reliability described as somewhat limited; NATS (with JetStream for
  durable streams and replay) for low latency plus high throughput at the edge. Note that the book's
  own Redis choice is explicitly a prototype-grade one.
- «У нас 8 агентов и редкие обращения. Ставить Ray?» → below the book's 10-20 mark the extra
  complexity is said not to pay for itself; a bus or a monolithic service fits better. Revisit when
  the agent count crosses that band or the latency requirement tightens — and check the runtime tax
  first: Orleans is .NET, Akka is JVM, Ray is the Python-native option.
- "Sessions are bleeding context into each other and concurrent calls corrupt agent state" → the
  actor pattern keyed by session: one actor instance per specialist type per `operation_id`, created
  lazily by a session manager. You get isolated history and caches plus serialised execution inside a
  session — and you accept that the same serialisation caps a single actor's throughput.
- «Поток идёт трое суток, на третьем шаге отвалился внешний API — и мы перезапускаем всё с нуля.» →
  that is the case a durable workflow engine exists for: Temporal keeps state and resumes from the
  last successful step, so only the failed activity repeats while the already-finished agent does
  not restart; signals cover human input and suspension in long processes. Airflow is the wrong tool
  here — it is placed with periodic dependency-heavy pipelines and excluded from real-time and
  dynamic agent work.
- "Where do we put shared state, agent memory, tool traces and plans?" → split by need, not by
  habit: a stateful database (PostgreSQL/Redis) for task results, interaction logs and memory when
  you want flexible querying and low cost — and you own schema, consistency and recovery yourself; a
  vector store for semantic search over embeddings, at higher cost; object storage (S3, Azure Blob)
  for large artefacts, with your own indexing to link them back to tasks; a checkpointing framework
  (Temporal, Orleans) when you want recovery for free and accept lock-in. Four axes, no numbers.
- «Хотим внедрить A2A, чтобы наши агенты и агенты партнёра нашли друг друга.» → publish an agent
  card with identity, capabilities *and* their input/output schemas at a discovery endpoint, look up
  peers through a registry, handshake on version, timeouts and payload limits, verify compatibility
  before the first call, and then invoke over JSON-RPC. Write the maturity risk into the ADR: the
  protocol is early-stage, authorization, rate limiting, trust and abuse resistance are unsolved, and
  the specification is still moving.
