---
name: aiagents-tool-design-and-selection
description: >
  DESIGN the tools an agent calls and decide HOW it picks one when the toolbox grows: tool name and
  description metadata, strict input/output schemas, the error/validation contract, stateful-tool least
  privilege, local vs API vs MCP tool types, the tool-choice mode (auto / any-required / none / pinned),
  and the selection ladder standard → semantic (embeddings + vector search) → hierarchical (group first,
  then tool), plus parallel multi-tool execution. Tool contract + selection ONLY — NOT the multi-step
  orchestration and planning of the flow itself — chain/graph topologies, ReAct, planner-executor,
  decomposition and reflection (→ `aiagents-orchestration-and-planning`),
  NOT designing a REST/GraphQL API for human consumers (→ `api-design`),
  NOT deciding whether you need an agent at all or which model to run (→ `aiagents-agent-fit-and-model-choice`),
  NOT hardening the agent's security perimeter (→ `aiagents-agent-security`, `security-audit`, `agentshield-scan`).
  Triggers (RU+EN): "как описать инструмент чтобы модель его выбрала", "агент вызывает не тот инструмент",
  "у нас 200 инструментов, как выбирать", "семантический выбор инструментов через эмбеддинги",
  "иерархические группы инструментов", "локальный инструмент, API или MCP", "tool-choice auto или required",
  "схема параметров инструмента и валидация", "агент удалил данные — как ограничить права инструмента",
  "how should I write a tool description", "agent picks the wrong tool", "too many tools for one prompt",
  "should this tool be an MCP server", "force the model to call a tool", "retry when the tool call JSON is malformed".
trust_tier: 1
trust_tier_label: "Machine-distilled from «Building Applications with AI Agents» (рус.) — routing evals passed (CP3.5 gate 2026-08-18)"
trust_tier_path: "Human review against the cited pages promotes to Tier 2"
derived_from: [ai-apps-ch02-p41-ku09, ai-apps-merged-ku02, ai-apps-ch04-p97-ku04, ai-apps-ch04-p97-ku05, ai-apps-ch04-p97-ku08, ai-apps-ch04-p97-ku09, ai-apps-ch04-p97-ku11, ai-apps-ch04-p97-ku12, ai-apps-ch04-p97-ku13, ai-apps-ch04-p97-ku14, ai-apps-ch04-p97-ku15, ai-apps-ch05-p117-ku08, ai-apps-ch05-p117-ku10, ai-apps-ch05-p117-ku11, ai-apps-ch05-p117-ku15, ai-apps-ch05-p117-ku16]
---

# Tool design & selection — make each tool unmistakable, then make picking one scale past the prompt

## Output
A tool-registry design that lands in an ADR, an architecture step or a code review:
for each tool — its type (local / API / MCP / model-generated), its metadata card (name, one-line purpose,
call example, input constraints, strict I/O schema), its privilege scope and audit-logging requirement;
and for the registry as a whole — the selection strategy (standard / semantic / hierarchical), the
per-call tool-choice mode, the parameter-validation and retry/fallback layer, and whether tools run
one at a time or in parallel.

## When to use / NOT
- Use when: writing or reviewing a tool definition an LLM will call; the agent picks the wrong tool or
  calls one it shouldn't; the toolbox outgrew "list everything in the prompt"; deciding whether a
  capability should be a local function, an HTTP wrapper or an MCP server; giving an agent write access
  to a live datastore; deciding when the model may skip tools and when a call is mandatory; hardening
  the layer that parses, validates and retries a tool call.
- NOT for: designing the multi-step plan that sequences several tools — chain and graph topologies,
  planner/executor and ReAct archetypes and the planning depth itself belong to
  `aiagents-orchestration-and-planning`; designing an HTTP API whose consumers are humans or client apps
  (→ `api-design`); choosing whether an agent is the right shape at all, or which foundation model to run
  (→ `aiagents-agent-fit-and-model-choice`); threat-modelling the agent's perimeter, guardrails and
  prompt-injection defence (→ `aiagents-agent-security`; for non-agent systems → `security-audit`,
  `security-testing`, `pentest-validation`, `agentshield-scan`).

## Decision criteria

### 1. Which TYPE of tool (KU: ch02-p41-ku09, ch04-p97-ku04, ch04-p97-ku05, ch04-p97-ku08)
The book sorts an agent's tools into three categories, and reports a fourth route (model-generated) in
гл. 4. Reconstructed around the design question "where should this capability live?":

| Type | The book's description of what it does | What you pay for it |
|---|---|---|
| **Локальный** — rule-based or predefined functions, no external dependency [p.49] | Arithmetic, pulls from a local database, simple predefined-criteria decisions such as approve/reject [p.49]; explicit logic makes behaviour predictable and reliable [p.99] | Awkward to reuse across scenarios even when packaged as a library; the same tool gets copied per team, and one edit forces every dependent agent service to be re-deployed; environment or requirement changes mean recurring rework [p.99, p.100] |
| **На базе API** — reaches external services and data sources [p.49-50] | Real-time data the model was never trained on: weather, quotes, feeds [p.49-50, p.102] | External services fail and carry security exposure, so the design focus shifts to reliability, security and graceful degradation [p.104] |
| **На базе MCP** — a standardized channel that feeds structured live context into the model's reasoning [p.50] | Publish a service once through MCP, and any number of agents discover and call its methods without a bespoke adapter each; the service implementation stays decoupled from agent logic [p.109, p.111] | The base specification leaves authentication, access control and payload checking to you [p.109] — see §3 and `aiagents-agent-security` |
| **Сгенерированный моделью** (гл. 4) | Bulk wrappers over a messy API estate, produced from specs and refined by critique [p.113] | Acceptance bar and human review are non-negotiable; the runtime-codegen variant adds four risks — see §7 [p.113, p.114-115] |

Where the book points the hand-built local tool: at the places traditional programming beats a language
model — arithmetic, unit and time-zone conversion, calendar/date-time work, maps and graphs [p.99, p.100].

**Modularity rule** [p.50]: treat every tool as a self-contained module that can be swapped or added
without reworking the system — the book's growth pattern is a support bot that starts with a small
toolset and later gains dispute-resolution or deeper diagnostics without disturbing the basics.

### 2. The tool's METADATA card — this is what the model actually reads (KU: merged-ku02)
The model decides whether and how to call a tool from its metadata, which the book puts on a par with
the tool's own logic [p.99]. Two lists, one artifact:

**Three metadata rules** [p.99]
- Precise, narrowly-scoped names — an over-broad name invites calls the situation never asked for.
- Specific descriptions — vague ones, or ones that overlap between several tools, «гарантированно приведут к путанице» [p.99].
- Strict, explicit input/output schemas — they tell the model when and how to use the tool and cut false triggers.

**Five-point description checklist** [p.123]
1. A short, meaningful name — the book's contrast is `calculate_sum` over `process_numbers`.
2. A one-sentence summary of the tool's main purpose.
3. A call example with typical input and output, to ground the model on specifics.
4. Input constraints — types and ranges (the book's example bounds two integers to 0–1000) — which cut
   ambiguous matches and rule irrelevant tools out.
5. Iterative testing on representative prompts, then rewording — this lifts selection accuracy with no
   fine-tuning and no new infrastructure.

This card applies to every tool type and under every selection strategy. Note the KU's own caveat: the
гл. 4 rules were stated in the local-tools section [p.99]; carrying them to API and MCP tools is the
extractor's inference from the shared metadata structure, not a claim the book makes for all types.

### 3. Statefulness and least privilege (KU: ch04-p97-ku11)
The moment a tool writes to durable state, tool design becomes a blast-radius decision. The book's own
incident: an agent "optimising" database performance deleted half the rows of a working table [p.111];
even with no bad intent a model can turn a harmless request into a destructive command [p.111].

Design the registration surface, not the guard afterwards [p.111, p.112]:
- Register only narrow operations — `add_new_customer(record)`, `get_user_profile(user_id)` — each
  backed by exactly one vetted query. No endpoint that executes arbitrary SQL.
- An agent that only reads never gets delete or update rights.
- If free-form queries are unavoidable: strict sanitisation plus access control — the OWASP GenAI
  Security Project flags SQL injection here, and input checking must reject constructs such as `DROP`
  or `ALTER`.
- Parameter binding / prepared statements against injection.
- Give the agent's database account the minimum privileges its permitted queries need.
- Log every tool invocation; the trail is what makes an anomaly visible and what any later analysis
  rests on. Add immediate alerts for the suspicious — an implausible volume of deletions, a schema
  edit — and you intervene before a small failure becomes an incident.

The book's four-word formula for this: capability restriction, input sanitisation, minimum privileges,
full observability [p.112]. It does not promise the risk disappears — logging and alerting are there
precisely because it doesn't [p.112]. **Related-decisions note:** this KU is deliberately shared with
`aiagents-agent-security`; here it is a *tool-design property* (what you register and with what rights),
there it is the perimeter/guardrail angle. Do not resolve perimeter questions from this section.

### 4. SELECTION strategy, chosen by toolbox size (KU: ch05-p117-ku08, ch05-p117-ku10, ch05-p117-ku16)
Restructured from табл. 5.2 around one question — how many tools are you selecting from?

| Toolbox | Strategy | How it works | Cost / failure mode |
|---|---|---|---|
| Few | **Стандартный** | Every definition and description goes to the model, which picks [p.122] | Simple, no infrastructure and no training; scales badly as tools multiply [p.122]; an extra model call can add seconds of latency [p.123] |
| Many (the typical case) | **Семантический** | Tool descriptions are embedded and indexed; retrieval narrows the candidates, the model makes the final pick [p.125] | The book calls it the most common pattern and recommends it for most scenarios [p.127]; semantic collisions between look-alike descriptions cost accuracy [p.122] |
| Very many, and semantically similar | **Иерархический** | Tools are grouped, each group described; pick the group first, then the tool inside it [p.130] | Accuracy bought with latency and complexity; building and maintaining groups takes real effort, so reserve it for a genuinely large toolbox [p.129-130] |

The book gives no numeric threshold for "few" vs "many" — you find your own boundary empirically.

**Semantic pipeline** [p.125-128]
1. Offline, once: embed each tool's definition + description with an encoder-only model (the book names
   Ada, Titan, Embed, ModernBERT) [p.125] and index the vectors in a vector database [p.126]. Re-embed
   only when the catalogue changes [p.128].
2. At runtime: encode the current context/query with **the same** embedding model, and retrieve the
   top-k relevant tools [p.126].
3. Hand the candidates to the foundation model, which makes the final choice and fills the parameters;
   the tool result is then turned into the user's answer [p.126].

The book's worked example normalises vectors (L2) so the index behaves as a cosine-similarity search
(FAISS `IndexFlatL2` + `normalize_L2`) [p.127].

**Hierarchical pipeline** [p.129-133] — splitting one hard choice into two easier ones «часто приводит
к более высокой точности выбора» [p.130]:
1. Partition the toolbox into groups and describe each group — the book's example uses Computation
   (maths and data analysis), Automation (workflow automation and service integration) and Communication
   (messaging) [p.130-131].
2. Assign tools to groups: `query_wolfram_alpha` → Computation, `trigger_zapier_webhook` → Automation,
   `send_slack_message` → Communication [p.132].
3. Step 1 of selection — choose the best-fitting group for the request; the mechanism can itself be
   standard or semantic [p.129], and in the book's code it is a dedicated model call [p.132].
4. Step 2 — search only inside the chosen group, a second model call [p.132-133].
5. Resolve arguments and invoke; the example request to solve `2x + 3 = 7` routes to the computation
   group and ends at `query_wolfram_alpha` [p.130, p.133].

Price: slower, and parallelising it costs extra [p.130]. The book offers no rule for when to rebuild
groups as tools are added.

### 5. Per-call TOOL-CHOICE mode (KU: ch04-p97-ku14)
Foundation-model APIs expose a tool-choice parameter [p.115]. Pick per call site, not per project:

| Mode | Pick when | Nature |
|---|---|---|
| `auto` | General use — the model judges from context whether to call anything [p.115] | Maximum flexibility |
| `any` / `required` | The step cannot continue without a tool's result [p.115] | Guarantees at least one call |
| `none` | Controlled output and test environments [p.115] | Blocks all tool calls |
| Pinned tool | You need predictable, reproducible operation flows [p.115] | Supported only by some interfaces [p.115] |

The axis the book names is flexibility versus reliability and predictability — hand the model the reins,
or impose your own frame [p.115]. Verify exact parameter spelling against your vendor's docs; the book
itself cites the middle mode under two names [p.115].

### 6. PARAMETERS and the post-call contract (KU: ch05-p117-ku15, ch04-p97-ku15)
**Filling parameters** [p.134]: task-progress state goes into the context and the model fills arguments
according to the types the function definition expects; external signals such as current time or user
location belong in the context for functions that depend on them. Run the input through a basic parser
that checks the elementary type criteria, and when that check fails, ask the foundation model to correct
the values it passed. Tune timeout and retry logic to the latency and throughput the scenario needs.
The parser only catches type-level violations — semantically wrong-but-well-typed arguments slip past it.

**After every model response, check three things** [p.115]: were the right tools called, is the generated
JSON well-formed, did execution finish without a runtime error. Then:
- Validate the result against a schema (`jsonschema`, Pydantic) to surface missing fields and malformed
  structures [p.115].
- A skipped tool call → trigger it yourself; malformed JSON → send the model a correction prompt [p.115].
- Structure the retries: exponential backoff for transient failures, and regenerate only the offending
  fragment rather than replaying the whole message exchange [p.115].
- Define fallback for retry exhaustion: switch to a backup model or service, ask the user to clarify,
  serve cached data, or return to a safe default state [p.115].
- Log all of it — the prompt, each tool invocation, each failed check, each retry, each rollback; that
  record is what observability, debugging and gradual improvement stand on [p.116].

The book frames this whole layer as the shift from random failures to managed, predictable behaviour,
and calls that transition important for agents ready for real operation [p.116]. It fixes no numeric
retry or backoff thresholds.

### 7. Letting a model BUILD the tools (KU: ch04-p97-ku12, ch04-p97-ku13)
Two different regimes — do not conflate them.

**Reviewed generation, offline** [p.113] — for wrapping a sprawling API estate without weeks of
hand-written, brittle glue:
1. Give the model the specs or input examples (an OpenAPI spec link works) → it drafts wrappers, helpers
   and atomic operations.
2. Run the generated stubs in a safe sandbox.
3. Correct with natural-language critique — the book's own example tells the model an endpoint answered
   400 and to adjust the request parameters [p.113].
4. A few fast iterations yield a set of tested, narrow-scope tools agents call directly.
5. **Human review before anything enters the CI/CD pipeline** — that is what buys safety and correctness.
6. When the API changes, run the cycle again, or the tools drift away from reality.

Preconditions the book states: an explicit acceptance bar (tests, response parsing, schema checks) and
developer oversight; edge cases, vulnerabilities and business-logic fit stay a human responsibility [p.113].

**Runtime code generation** [p.114-115] — the agent writes and executes code mid-task:

| | |
|---|---|
| For | Meets a new API or unknown task by generating interaction code on the spot; analyse → draft → run → revise on failure, learning from each attempt; needs are met immediately without a human, which the book calls critical for dynamic problem solving [p.114] |
| Against — quality control | Low-quality code causes system failures and vulnerabilities [p.114] |
| Against — security | Executing self-generated code is a malware-injection vector: data breach, unauthorized access [p.114] |
| Against — reproducibility | Tools are rebuilt from scratch each time; one successful call does not predict the next, and small prompt changes or a model update lead down entirely different code paths — debugging, testing and compliance all suffer [p.114] |
| Against — resources | Generating and running naive solutions eats significant CPU and memory; performance-oriented guardrails help [p.114-115] |

Rule of thumb: dynamic environments where the needed toolset is unknown in advance justify it [p.114];
for stable, repeatable tasks the reproducibility risk points at a pre-built toolbox instead.

### 8. One call or several at once (KU: ch05-p117-ku11)
When a task needs several independent actions and you cannot tell in advance how many tools that is —
gathering a customer picture from separate sources — the book's shape is retrieve-then-filter [p.136]:
1. Semantic selection retrieves the **maximum** plausibly-applicable tools (five in the example).
2. A second foundation-model call filters the candidates down to the genuinely necessary ones.
3. Variant: call the model repeatedly, passing which tools are already chosen, until it stops adding.
4. Build parameters independently per selected tool and execute them in parallel.
5. Feed all results back to the model to synthesise the answer.

Each filtering round is an extra model call [p.136] — that is the price of the latency saving.
Sequencing several *dependent* steps (chain, graph, planner) belongs to
`aiagents-orchestration-and-planning` — do not fold it in here.

## Key facts & formulas
- Three metadata rules: narrow names, specific descriptions, strict input/output schemas [p.99].
- Five-point description checklist; the naming contrast is `calculate_sum` vs `process_numbers`, and the
  input-constraint example bounds two integers to the range 0–1000 [p.123].
- API-tool implementation patterns: a ready-made tool class (`WikipediaQueryRun` over
  `WikipediaAPIWrapper`, bound to the model with `bind_tools`) [p.102], or your own HTTP wrapper
  registered with a `@tool` decorator — `get_stock_price(ticker)` with `requests.get`, checking
  `status_code == 200` and raising `ValueError` otherwise [p.103-104].
- API-tool checklist: fallbacks or clear error messages, HTTPS with strong authentication, rate-limit
  awareness, personal-data anonymisation or masking, resilient error handling, and where feasible
  multiple providers [p.104]. No numeric timeout or retry limits are given.
- MCP: an open standard put forward by Anthropic and then adopted by OpenAI, Google DeepMind and
  Microsoft; the book's metaphor is a USB-C port for AI [p.108].
- MCP mechanics: JSON-RPC 2.0 over HTTPS or WebSocket; the server publishes methods such as `listFiles`,
  `getRecord`, `runAnalysis` together with input and output schemas, and the client loads that method
  catalogue for the model to reason over [p.108-109].
- MCP security: «базовая спецификация MCP не требует единого стандартизированного решения в области
  безопасности» [p.109] — organisations close the gap with extra network policies or intermediate layers,
  while authentication, fine-grained access control and payload checking remain active engineering areas [p.109, p.111].
- Least-privilege incident: an agent deleted half the rows of a working table while "optimising" the
  database [p.111]; the agent's DB account gets minimum privileges [p.112].
- Selection strategies and their trade-offs come from табл. 5.2 [p.122]; the extra model call in standard
  selection can add several seconds of latency [p.123].
- Embedding models named for semantic selection: Ada (OpenAI), Titan (Amazon), Embed (Cohere),
  ModernBERT [p.125]; the example index uses FAISS `IndexFlatL2` with `normalize_L2` [p.127].
- Hierarchical example groups: Computation, Automation, Communication [p.130-131]; routing example —
  solve `2x + 3 = 7` → Computation → `query_wolfram_alpha` [p.130, p.133].
- Parallel execution: retrieve the maximum candidates (five in the example), then filter to five or
  fewer with a second model call [p.136].
- Tool-choice modes: `auto`, `any`/`required`, `none`, plus pinning a specific tool where the interface
  supports it [p.115].
- Post-response validation: three checks, schema validation via `jsonschema` or Pydantic, exponential
  backoff for transient failures, regenerate only the failing fragment [p.115].

## Anti-patterns
| Anti-pattern | Why it fails | Source |
|---|---|---|
| A broad, generic tool name | Invites the model to call the tool when nothing asked for it | merged-ku02 |
| Two tools whose descriptions overlap | The book states confusion is guaranteed, and effectiveness drops | merged-ku02 |
| Loose or absent input/output schema | The model loses the signal for *when* and *how* to call, so false triggers rise | merged-ku02 |
| Registering an endpoint that runs arbitrary SQL | One model mistake becomes a destructive write on live data | ch04-p97-ku11 |
| Giving a read-only agent update or delete rights | Blast radius far larger than the agent's job needs | ch04-p97-ku11 |
| Free-form queries without sanitisation or parameter binding | SQL-injection exposure flagged by the OWASP GenAI Security Project | ch04-p97-ku11 |
| Tool invocations that are not logged | No trail to spot the anomaly on, and nothing for the later analysis to stand on | ch04-p97-ku11 |
| Listing every tool in the prompt once the toolbox is large | Standard selection scales badly with tool count | ch05-p117-ku08 |
| Hierarchical groups over a small toolbox | Buys accuracy you don't need with latency, extra calls and group maintenance | ch05-p117-ku16 |
| Encoding the runtime query with a different embedding model than the index | The pipeline requires the same embedding model on both sides | ch05-p117-ku10 |
| Re-embedding the whole tool catalogue on every request | Embedding is an offline step; recompute only when the catalogue changes | ch05-p117-ku10 |
| Leaving `auto` on a step that cannot proceed without a tool result | The mode for a mandatory result is `any`/`required` | ch04-p97-ku14 |
| Runtime code generation for stable, repeatable tasks | Tools rebuilt each time — prompt tweaks or a model update change the code path, hurting debugging, testing and compliance | ch04-p97-ku13 |
| Model-generated wrappers merged into CI/CD without human review | Edge cases, vulnerabilities and business-logic fit remain the human's responsibility | ch04-p97-ku12 |
| Generating tools once and never re-running the cycle after the API changes | The toolset drifts away from the API it wraps | ch04-p97-ku12 |
| Replaying the entire message exchange to fix one malformed tool call | Regenerating only the offending fragment is the prescribed retry shape | ch04-p97-ku15 |
| An external-API tool with no fallback path and no clear error message | External services fail, and the failure surfaces raw to the user | ch04-p97-ku05 |
| Sharing one MCP endpoint across agents on the assumption the spec secures it | Authentication, access control and payload checking are left to the implementer | ch04-p97-ku09 |
| Copy-pasting a local tool into every team's codebase | Duplication plus per-service re-deployment on every edit; the maintenance load recurs | ch04-p97-ku04 |
| Trusting a basic type parser to catch bad arguments | It validates types, not meaning — well-typed nonsense passes | ch05-p117-ku15 |

## Related decisions
- **`aiagents-agent-security`** — statefulness/least-privilege (ch04-p97-ku11) is *shared* with that skill.
  Decide the registered operation set and its rights **here**; the perimeter, guardrails and injection
  defence are decided **there**. If you register a broad write operation here, the security skill inherits
  a larger surface to defend.
- **`aiagents-agent-fit-and-model-choice`** — pinning a specific tool is supported only by some interfaces
  [p.115]; if your model/platform choice lacks it, the predictability you wanted must be bought in the
  orchestration layer instead.
- **`aiagents-knowledge-and-memory`** — semantic selection needs an embedding model and a vector index
  [p.125-126]; and MCP is described as feeding structured live context (profiles, dialogue history,
  state) into the reasoning [p.50]. Choosing semantic selection here creates a vector-store dependency
  that skill has to own.
- **`aiagents-observability-and-drift`** — this skill *requires* per-invocation logging and alerting
  [p.112, p.116]; that skill decides what to do with the stream, and where drift shows up.
- **`aiagents-evaluation-design`** — the description checklist ends in iterative testing on representative
  prompts [p.123]; selection accuracy is therefore an evaluated property, not a design-time assertion.
- **`aiagents-single-vs-multi-agent`** — publishing a service via MCP once makes it callable by any number
  of agents without a bespoke adapter each [p.109, p.111], which lowers the cost of splitting into
  several agents.
- **`aiagents-learning-strategy`** — the runtime-codegen loop revises on failure and learns from each
  attempt [p.114]; if you take that route, the reproducibility risk becomes that skill's problem too.
- **`aiagents-orchestration-and-planning`** — chain and graph topologies, the ReAct / planner-executor
  archetypes and multi-step plan design sit outside this skill; §8 stops at parallel execution of
  *independent* calls. Coupling: the tool-choice mode and the selection strategy fixed here are what
  each step of that flow executes — an extra model call per selection round (standard, and each
  hierarchical or filtering round) is latency that skill must budget inside its chain-length cap, and a
  step that cannot proceed without a result needs `any`/`required` set here, not a retry added there.
- **`api-design`** — if the consumer is a human developer or a client app rather than a model, design the
  HTTP contract there; the metadata rules here are aimed at an LLM reader.

## Источник
Derived from «Building Applications with AI Agents» (Albada, рус. пер., ISBN 978-601-14-1158-5):
глава 2, с. 49–50; глава 4, с. 99–116; глава 5, с. 122–136.
KUs: ai-apps-ch02-p41-ku09, ai-apps-merged-ku02, ai-apps-ch04-p97-ku04, ai-apps-ch04-p97-ku05,
ai-apps-ch04-p97-ku08, ai-apps-ch04-p97-ku09, ai-apps-ch04-p97-ku11, ai-apps-ch04-p97-ku12,
ai-apps-ch04-p97-ku13, ai-apps-ch04-p97-ku14, ai-apps-ch04-p97-ku15, ai-apps-ch05-p117-ku08,
ai-apps-ch05-p117-ku10, ai-apps-ch05-p117-ku11, ai-apps-ch05-p117-ku15, ai-apps-ch05-p117-ku16.
Deep reference: `references/knowledge-units.md`.
- Metadata anchor: overlapping or vague tool descriptions «гарантированно приведут к путанице» [p.99].
- Hierarchy anchor: splitting the choice in two «часто приводит к более высокой точности выбора» [p.130].

## Self-check
- [x] Every criterion traces to a listed KU?
- [x] Facts carry page anchors?
- [x] trust_tier 1 (machine-distilled, routing-gated at CP3.5, not yet human-reviewed)?
- [x] Boundary clause routes flow design to `aiagents-orchestration-and-planning` instead of absorbing it?

## Examples
- «У нас 180 инструментов, агент стал промахиваться — что делать?» → move off standard selection: embed
  descriptions and retrieve top-k (the book's recommended default), and go hierarchical only if the tools
  are genuinely similar and accuracy is worth the extra call and latency; first re-check the description
  checklist for overlaps.
- "Should this be a local function, an HTTP tool, or an MCP server?" → local for the deterministic gaps
  (arithmetic, dates, unit conversion), API for real-time external data with a fallback + HTTPS + rate-limit
  plan, MCP when several agents or teams must reuse the same service without a per-agent adapter.
- «Агент удалил половину строк в таблице — как больше так не делать?» → the cure is at registration:
  narrow operations backed by one vetted query each, no arbitrary-SQL endpoint, read-only agents without
  write rights, parameter binding, a minimum-privilege DB account, and logging plus alerts on implausible
  volumes; perimeter questions go to `aiagents-agent-security`.
- "The model keeps skipping the tool call / returns broken JSON" → set the tool-choice mode to
  `any`/`required` where the result is mandatory, and add the post-response layer: three checks, schema
  validation, auto-trigger the missed call, a correction prompt for malformed JSON, backoff retries that
  regenerate only the failing fragment, and a defined fallback when retries run out.
- «Надо обвязать 40 внутренних API инструментами — генерировать моделью?» → yes, in the reviewed offline
  loop (specs → drafts → sandbox run → natural-language critique → human review before CI/CD), re-run on
  API change; runtime code generation is a different, riskier regime justified only when the needed
  toolset is unknown in advance.
