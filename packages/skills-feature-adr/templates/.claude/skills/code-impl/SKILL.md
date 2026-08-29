---
name: code-impl
description: |
  Quality bar for designing and implementing changes in backend service
  code. Read this BEFORE planning, designing, or coding any non-trivial
  feature, refactor, or bug fix. The PRINCIPLES are portable; the concrete
  rules assume a Python / async-web / relational-DB / k8s backend stack —
  translate them to yours.

  Skip when the task is read-only Q&A, exploration, or documentation
  lookup that does not produce code changes.

  Contains: top-level principles, stack realities, project invariants,
  god-object hard rule, reuse map (canonical implementations),
  security invariants, anti-pattern principles (the classes of mistakes,
  not concrete bug list), decision discipline, done-ness criteria,
  workflow.

  Goal: when you write code following this skill, the result should be
  production-shippable on the first or second pass — no major
  architectural rework required.
---

# Implementer Quality Bar (v2)

> **Stack assumptions.** The *principles* here are portable. The concrete
> rules and examples assume a **Python / async-web (FastAPI-style) /
> relational-DB (SQLAlchemy + Alembic-style) / k8s + Prometheus** backend.
> On a different stack, keep the principle and swap the mechanism (your
> ORM/session/migration tool, your orchestrator/network policy, your
> metrics + CI). This is a backend-service quality bar, not a universal one.

This skill is loaded before you design or implement non-trivial changes.
It is principle-based: each rule names a class of mistake, not a specific
bug. Examples are illustrations, not the entire detection surface.

The principles here generalize across backend services, distilled from real codebase
audits and agent-session failure modes. Ground them in YOUR project by
mining its recurring mistakes (`dz mr-rakes`) and its reuse map (a per-repo
`AGENTS.md`, see the `agents-md-creator` skill). Where a concrete example
is given, it is one illustration of the principle — the principle
generalizes well beyond it.

---

## Top 5 hard rules (if you read nothing else)

1. **Do not grow god-object files.** New methods/classes/routes go in a
   new file or after splitting. See section 3.
2. **No internal service-to-service auth in k8s.** Inside the cluster,
   services trust each other via NetworkPolicy. Three-question gate in
   section 7 before proposing any auth mechanism between in-cluster
   services. The one transitional carve-out (a hop that crosses a
   k8s-namespace / separate-deployment boundary) is named in Section 7.3.
3. **Do not swallow exceptions to keep code "running".** Catching broad
   exceptions and silently substituting a default is how programming
   bugs become production mysteries. See P1 in section 6.
4. **Do not block the event loop on async paths.** Sync HTTP, sync DB,
   `time.sleep`, sync subprocess from `async def` pause every concurrent
   request. Bridge via `await run_in_threadpool(...)`. See P3 in section 6.
5. **Validate the FINAL code, not the plan.** Run tests/validators on the
   actual diff after you're done editing, not on intermediate states.
   Done report includes a real artifact (stack trace gone, curl passes,
   screenshot) — never just "tests passed". See section 9.

Everything else in this document derives from these.

When the work is **designing new product functionality** — auth boundary,
scale-sensitive code, a write-side operation (creating an external
issue/record and similar), a new env-var, an MCP/UI surface decision, or
anything scope-sensitive — consult your project's **`architecture/vision.md`**
before writing the plan. This document’s PRINCIPLES generalize (its examples assume the backend stack above); `architecture/vision.md`
carries the project-specific reality (audience, scale envelope, write-side
rules, closed architectural decisions) plus `architecture/degradations.md` (accepted degradations) that decide
whether a "defensive" addition is warranted or a false positive. (Scaffold
it with `dz feature-adr-setup`; absent it, apply the principles neutrally.)
Skip when the work is a pure
refactor or a localized bugfix without scope change.

For the **sequence and pause-points** of feature work — Discovery →
Decisions → Plan → Pre-impl validation → Implementation → Code review
→ Manual QA, scaled by Tier 1-4 — consult the `feature-adr`
skill. This document covers the quality bar for each step; the
pipeline skill covers how they fit together.

---

## Section 1. Stack realities (know yours)

Generic FastAPI/SQLAlchemy/Pydantic (or whatever your stack is) best
practices do NOT all apply — the right call depends on your codebase's
actual setup. Before a point fix, verify the realities that change the
answer, e.g.:

- **Concurrency model.** Is the code sync-`def`-in-a-threadpool, or truly
  async? `requests` from a sync route in a threadpool is fine; the same
  call on the event loop is a block. Do NOT introduce an `AsyncSession`
  (or flip sync↔async) in a point fix — that is a full refactor.
- **DB session scoping.** Sessions are usually request-scoped (e.g.
  `Depends(get_db)`). Opening a fresh `SessionLocal()` inside middleware
  or a helper bypasses transaction scope and the pool. Don't add the next
  one just because an existing place does it wrong.
- **Streaming holds resources.** A sync route + request-scoped session +
  `StreamingResponse` holds the DB session for the whole stream (minutes)
  — pool exhaustion under load. Know whether your endpoints do this.

The point: read the actual setup (and your `AGENTS.md`) before applying a
"best practice" that assumes a different one.

---

## Section 2. Project invariants (know yours)

Every product has things that ARE true by construction. A branch that
handles their violation is usually **defensive overshoot, not safety** —
code for a state that cannot occur. Your project's invariants live in
`architecture/vision.md` (closed decisions, what the product does / does
not do) and are enforced at a boundary (auth, create/edit validation).
Examples of the SHAPE (yours will differ):

- "A user always belongs to at least one group" (enforced at signup) →
  `if not user.groups:` is suspect.
- "An entity always has at least one of X or Y" (validated on create) →
  the empty case cannot exist.
- "Inside one trust boundary, services do not re-authenticate to each
  other" → a new in-boundary S2S token is overshoot (see the cross-
  deployment carve-out in Section 7.3).

Before adding a defensive branch, ask: is the invariant actually
violated here, or am I writing code for a state my project guarantees
cannot occur? When unsure, consult `architecture/vision.md`.

## Section 3. God-object hard rule

**Rule:** New methods, classes, routes, or event types are not added to
files that already aggregate too many concerns. New surface area lives
in a new file. If the new code logically belongs in the god-object,
split the god-object first.

**What counts as MODIFICATION (allowed):**

- In-place change to existing logic in an existing method.
- Adding a parameter to an existing method **that does not change the
  semantics of the method** (e.g., a feature flag, a logging hint).
- 1-2 lines for an obvious in-place fix.
- **Decomposition:** extracting a private helper from an existing
  method, where the helper is called only from the original method
  and net file LOC decreases. This is good — do it.

**What counts as NEW CODE (forbidden in god-object):**

- A new public method, new class, new FastAPI route, new event handler.
- A non-trivial nested function defined inside an existing method body
  (this is a smuggled new responsibility).
- A new branch (`if action == "X": ...`) that dispatches to a
  substantial body — substantial = a new domain concept, not a
  one-line guard.
- A new parameter that introduces a new domain semantic (a new mode of
  operation, a new dispatch axis).

**Off-limits files:** maintain your project's freeze table (the list of
already-known ≥700-LOC god-objects with measured LOC) in a per-repo
`AGENTS.md` — the `code-critic` skill (Section A) enforces the same list
at review. The size threshold is **700 LOC**: any module at or above it
is a god-object, including brand-new files. Common shapes: services
with many methods, large schema files, API route files, god-facade
clients aggregating multiple domains, cache modules with duplicated
cache classes. Function-level analogs (a single huge orchestration
function, e.g. a stream/sync entrypoint) follow the same rule: treat
each as its own off-limits surface.

If your work logically belongs in one of these and is not a
modification — split first or write to a new file.

---

## Section 4. Reuse map — canonical implementations

For each canonical pattern below: use it. Reinventing is the largest
single source of "we redid this three times" pain.

The list is not exhaustive — when in doubt, search the repo for an
existing analogous concept before writing your own.

**Enforcement at write time (not review time).** Declaring the rule is
not enough — six copies of `_build_retrying_session` and a parallel
crypto scheme shipped past an implementer who had read this file.
Before writing a new **reusable / shared / infra** module (HTTP client,
retry wrapper, crypto, cache, sync primitive — anything a second caller
could want):
1. grep the canonical list below + the target repo for an analogous
   concept;
2. record one explicit line — in the plan, the done-report, or the
   commit message, whichever exists in this workflow: "reusing X" or
   "not reusing X because Y".
A private helper local to one function/module needs only the search,
not the written line. "Repeat an existing fix" tasks: first locate and
cite the reference commit/branch, then port — never re-derive from
memory.
**Build your project's reuse-map.** The canonical implementations are
project-specific — record them in a per-repo `AGENTS.md` (see the
`agents-md-creator` skill), and mine the recurring "we redid this" pain
with `dz mr-rakes`. Before writing a new reusable/shared/infra module,
check that map + grep the repo for an analogous concept.

**The classes of concern that almost always already have a canonical**
(look for yours before writing a new one):

- **HTTP client / retry / backoff** — one shared retrying session, not a
  hand-rolled `for attempt in range(...)` per call site.
- **Cache (TTL / key)** — one cache primitive, not a parallel dict-with-timestamps.
- **Auth / identity / JWKS-OIDC key cache** — one verification path.
- **External-system sync services** — one shape (fetch → diff → upsert),
  not a bespoke loop per source.
- **Cross-repo / cross-service schema sharing** — one source of truth for
  the shared DTOs, not re-declared models.
- **Long-running background work** — one job/worker abstraction.
- **Configuration loading** — one typed config, one resolution order.
- **Run/operation completion persistence** — defined once.
- **Error rendering to the user / to storage** — one path.
- **Human-in-the-loop + write-op idempotency** — the approval +
  idempotency-key pattern (a new external write-op reuses this shape).
- **Cross-deployment / namespace-crossing bridge** — one outbound client
  per boundary; do not add a second, and keep in-namespace hops token-free.
- **Layered service module** — DTO / policy / repo / sql / presentation
  split when a concern outgrows the god-object cap.
- **Domain metrics** — a dedicated metrics module; RED/HTTP metrics come
  from your shared observability layer, not per-endpoint counters.

For each: **use the canonical**. Reinventing is the largest single source
of "we redid this three times" pain. Record one explicit line — "reusing
X" or "not reusing X because Y" — in the plan/done-report/commit.

## Section 5. Security invariants

Five rules. Each is grounded in concrete defects from the audit, but
the rule is the principle, not the bug.

### S1. SQL is parameterized; safety is enforced at the DB role, not by string filters.

- Never build a query by concatenating runtime values into the SQL text
  (f-strings, `%`, `.format()`).
- Never rely on a denylist (`if "drop table" in query: reject`) for
  safety. It is bypassable in any SQL dialect.
- Read-only access enforced via a DB user that lacks DDL/DML — not by
  `SET TRANSACTION READ ONLY` in user code (which can be silently
  swallowed).

### S2. Auth never short-circuits on an environment flag.

- `if not settings.enable_auth: return AdminIdentity(...)` is a
  vulnerability, regardless of the developer's intent for "dev only".
- If a dev-mode auth bypass is genuinely needed, fail at startup when
  the environment is anything other than `dev`.

### S3. Security-material caches require TTL + async lock + negative cache.

- JWKS, OIDC keys, signing keys: rotation = silent breakage if the
  cache holds forever.
- Concurrent refresh = N parallel HTTP calls and undefined state
  without a lock.
- Missing-kid lookup must be cached negatively (else every wrong-kid
  request hits the issuer).

### S4. Credentials, full session IDs, bearer tokens — never logged at full length.

- Prefix-only (8 chars) is the convention. Anything longer in
  `extra={...}` of a structured log is a leak.
- This applies to DB columns too: do not persist full tokens in
  audit/event tables.

### S5. Endpoints that mutate per-key shared state serialize per that key.

- `/ingest` for a `(context, source)` pair: two concurrent calls
  without an advisory lock or per-key queue produce duplicates,
  collection races, lost-update on cursors.
- Use a Postgres advisory lock keyed on `(context_id, source_name)`,
  or a per-key queue, before mutating shared per-key state.

---

## Section 6. Anti-pattern principles

Each principle names a class of mistake. Examples illustrate; the class
generalizes.

### P1. Defensive exception swallowing

Catching broad exceptions and converting failure into a silent default
masks programming bugs from the caller. The user can no longer
distinguish a broken feature from a feature-off condition.

- **Distinguish:** optional-infrastructure unavailability (Redis cache
  miss, optional integration disabled) is a legitimate fallback —
  catch the **specific** exception class (`RedisError`, not
  `Exception`), log informatively, return null.
- **Anti-pattern:** broad `except Exception:` + log at warning + return
  None for what is supposed to be a domain operation.
- ~280 occurrences of broad-swallow already exist in the codebase; do not
  add the next.

### P2. Hand-rolled retry

Retry policy belongs on the HTTP client/transport, not in business
code. Hand-rolled loops accumulate divergent status sets, missing
jitter, ignored `Retry-After`.

Use the canonical HTTP retry/backoff wrapper (Section 4).

### P3. Blocking I/O on async paths

Sync HTTP, sync DB, `time.sleep`, sync subprocess from `async def`
pauses the event loop for the duration — every concurrent request
waits.

- **Bridge:** `await run_in_threadpool(...)` / `await asyncio.to_thread(...)`
  / `await loop.run_in_executor(...)`.
- New async code that needs sync libraries goes through the bridge,
  not direct calls.

### P4. Untyped data structures across boundaries

`dict[str, Any]` / bare `Any` for values whose keys you read in the
same function — the structure is known, type it.

- **Disqualification rule:** if your code reads specific keys
  (`x['foo']`, `x.get('bar')`), it is not unknown — use TypedDict /
  Pydantic / discriminated union.
- **Acceptable:** generic passthrough proxies that intentionally do
  not narrow upstream types.

### P5. Per-endpoint plumbing duplication

Each new HTTP-call site re-implementing status check, response parse,
multi-tier exception handling, logging — with only the URL/parser
changing — is a refactor signal, not 10 independent functions.

When you write the third near-copy, stop and extract.

### P6. Sync↔async or near-twin duplication

When two functions exist in parallel forms (sync/async, vN/vN+1,
single/batch) with ~80%+ identical bodies, drift will happen — already
observed in this codebase. If the parallel form is unavoidable,
generate one from the other; never maintain both by hand.

### P7. Process-global mutation in request path

Mutating library globals (`Settings.X`), module-level dicts, class
objects — from request handlers — concurrent requests interleave;
mutations outlive the request.

OK at startup (lifespan, `__init__` time). Not OK during a request.

### P8. Fire-and-forget without strong reference

`asyncio.create_task(coro)` whose handle is not retained is a GC
hazard mid-flight.

- **Exception:** lifespan/startup tasks with app-lifetime scope — the
  event loop holds the reference.
- **Per-request tasks:** retain in a set, attach a `done_callback`
  that removes from the set.

### P9. TOCTOU lock release before background work

`acquire → release → schedule background` is a race regardless of
whether the scheduler is `BackgroundTasks` or a durable background-job service. The
lock must be held inside the background task or transferred via a
release token.

### P10. Direct LLM invocation outside the agent's middleware

A tool, middleware, or service that calls `model.invoke(...)` /
`chat_model.ainvoke(...)` directly bypasses token counting,
cancellation, Langfuse tracing, and call-limit enforcement — silently.

All LLM calls go through the agent's middleware-wrapped model. If you
need an LLM call from a tool, plumb it through your runtime/agent context, not
through a fresh client.

### P11. DB columns are contracts, not afterthoughts

A new SQLAlchemy column declares what values are valid, what happens
on delete, what is unique. If the column represents a bounded set,
the bound is encoded. If it points at another row, the lifecycle is
named. If it owns external resources (S3 blob, file on disk), the
cascade story is named. Schema gaps don't appear as errors — they
appear as silent data corruption months later.

(Critic Section T3 carries the concrete detection cues; the rule
here is "the column carries its contract on its face".)

### P12. Defensive overshoot

A new kill-switch, startup gate, capability token, or inflated env
knob is justified only when you can answer the section 7 gates —
name the wrong input, name the threat, name the attacker. If you
can't, you're solving for "I don't trust the next person", which is
not the threat model.

The signal: a new gate or knob whose detection-of-wrongness fires
on something you yourself just wrote. That is a contract problem
(the API permits the misuse), not a security problem. Fix the
contract — clarify, simplify, remove the misuse path. Tripwires
accumulate; the system gets harder to use, not safer.

### P13. New state/abstraction duplicating existing info ("bandaid")

A new flag, scoreboard, "publishable", "hot_refresh", "ALLOW_FALLBACK",
"scope budget" introduced to fix a bug — frequently the data needed
to fix it correctly already flows in the system. Trace the data flow
before introducing new state.

Lexical signals (`*_publishable`, `*_hot`, `ALLOW_*`, `*_FALLBACK`)
are not definitive but warrant a second look.

### P14. Edge-case blindness

For any new feature / new code path, sweep:
- Empty input
- Large input (>300 items, paginated)
- Concurrent calls
- Delete path (what if the entity is deleted mid-operation?)
- Restart mid-operation (what does the system look like after a
  process restart in the middle of this?)
- Schema mismatch / version skew

If your tests cover only the golden path, you don't know if the code
works.

### P15. Defensive branches against documented invariants

`if not user.groups:` / `if not context.repos:` / `if not
allowed_groups:` against invariants from section 2. The code path is
unreachable and accumulates as bug magnet.

If you genuinely think the invariant might be violated, that is
either: (a) a real product bug to escalate, or (b) a misunderstanding —
clarify before defending against it.

### P16. Manual error rendering

Putting `repr(e)`, `str(exc)`, traceback text into HTTP response body
or persistent DB columns. Use the canonical error-rendering path (Section 4).

### P17. Stale-spec / phasing as bandaid

- Planning against an outdated spec (MCP, OAuth, OpenAPI, internal
  API doc) wastes work. Locate the current authoritative version
  before designing against it.
- "Phase 2" containing the actually hard parts is deferring, not
  phasing — name what each phase ships, and if phase 2 is the
  problem, discuss with the user instead of committing the bandaid.

### P18. Cargo cult

`try: log(); except: pass` — log functions don't raise.
`enumerate(flat)[1:] if False else flat` — broken slicing dressed as
logic. If you don't understand why a piece of code exists, find out
before propagating it.

### P19. Anti-drift: major invariants are pinned, everything else you decide

At the start of work, fix the **major invariants** from the user's
brief. These are short and few:

- The named target / scale / SLA (e.g., "5M files", "p95 < 3s",
  "all 48 repos").
- The user's terminology and concepts (build "Skills" because the
  user said Skills — do not silently substitute "tools + runtime").
- The major surface area (which repos, which user-visible flows).
- Major external dependencies / integrations the user named.

**Inside the envelope, you decide without asking.** Library choice,
file layout, refactor scope, function shapes, internal abstractions,
choice of canonical pattern — all of these are agent territory. The
default is decide; ask is the exception.

**Ask only when a major invariant is about to change.** Concretely:

- You are about to test/measure at smaller scale than the user named
  (100k when target is 5M, `max_results=200` when SLA is on
  worst-case). Stop, surface the gap, don't dress partial as full.
- You are about to substitute your concept for the user's term. Stop,
  confirm the term means what you think it means.
- You are about to add a major new architectural element not in the
  brief and visible to the user — new external integration, new
  service-to-service flow, new persistent state, new background
  worker, new product concept.
- You are about to declare done when the named target was not met.

**Do not ask** about implementation choices, small interpretations of
ambiguous phrases, edge cases inside the envelope, or reasonable
defaults. Pick and proceed.

The test, applied silently on every decision: would the user,
returning, say "this isn't what I asked for"? — that's a major
invariant violation, surface before. Would they say "this is what I
asked for, with reasonable implementation choices"? — that's the
agent doing its job, ship it.

### P20. Performance — loops over external calls

A new loop that calls a remote service / DB / file system inside the
loop body, without batching, is a latency bomb. The shape repeats
across the codebase: `for x in things: client.fetch(x)` produces N
round-trips. The user notices when the feature is slow and asks why;
fixing it later means rewriting both call sites and the contract.

If the volume is small and known (≤10 items), inline is fine. If it
might be larger, batch the calls (one request per N items, or one
multi-fetch). Same applies to per-iteration tokenizer/model loads,
per-iteration template renders, per-iteration regex compilation.

### P21. Green-on-mocks: the test must be a falsifier

The most expensive bug class of 2026-05..06: code whose every test
mocks the exact thing that breaks. A mocked SQLAlchemy `Session` let
two P0s ship (500 on real Postgres — `flush()` is a no-op on
MagicMock); a Playwright e2e mocked MediaRecorder with a WAV while
real Chrome sends webm; a test mocked the wrong module and stayed
green because it never intercepted the call.

Rules:
- **New/changed repository code, transactions, constraints, migrations,
  upsert/delete, session lifecycle ⇒ integration test on real Postgres
  is mandatory.** Reference pattern:
  a real integration test that exercises the actual path. For other write-side
  touches: name the existing real-DB coverage that exercises the path,
  or add a test, or declare "code-level only, DB test not runnable" as
  an explicit risk.
- For every new code path, answer: "which test executes this path
  WITHOUT mocking the key framework (SQLAlchemy / LangGraph / Langfuse
  / real LLM input)?" No such test ⇒ the path is unverified — say so.
- A new/changed test must fail on broken code (red phase, or at least
  a stated answer to "what would make this test fail?"). Asserts on
  `inspect.getsource` / source substrings are forbidden.
- Changed a constant/set N ⇒ grep ALL asserts pinning the old value
  and rerun them (the "test expects 2 providers, service returns 6"
  bug shipped twice — backend and UI).
- A new test must land in a directory the CI job selectors actually
  collect — check `.gitlab-ci.yml` ("my tests would silently never
  execute" is the worst test gap).

### P22. Parallel paths and blast radius

Fixing/changing one path while its twin stays broken is a recurring
shape: parent agent fixed — child agent forgotten (skills never
reached subagents); chat SSE resets streaming on close — deep-research
SSE copy only logs; one prod overlay updated — the second one missed.

Rules:
- Changed path X ⇒ find its siblings (child/parent composition paths,
  second SSE service, all `Literal[...]` copies of an invariant, every
  prod overlay with the same env) and apply or justify skipping.
- List the UNRELATED paths your diff touches and verify each:
  a generated column touches every INSERT of that table; middleware
  ordering touches the 401 path; session lifecycle touches every ORM
  read after close.
- Durable state machines: for every DB row your code creates, answer
  "what happens if the next step never comes?" (orphan running turns,
  expired leases, idle sessions eating `max_active_sessions`).

### P23. Config must be traced to its point of use

A config key/env that is stored is not a config that works: snapshot
projections drop unknown keys; a settings-snapshot object pre-filled with
defaults makes env fallback unreachable (deployed `LLM_RETRY_*` were
silently ignored); the subagents feature flag never survived the
a cross-service projection.

Rule: for every new config key, trace the actual delivery chain and
precedence from storage to the consuming line of code, across service
boundaries, and add a test that hits the seam.

### P24. LLM-output requirements are closed by code, not by prompting harder

If an LLM must produce constrained output (no file:line suffixes, no
review-style notes, exact enum values), 2-3 failed prompt iterations
mean the next step is deterministic validation/normalization at the
boundary (validator + retry, normalizer) — not a fourth, sterner
prompt. Models also send `null` where the schema says `"none"` —
tolerate real model behavior at the parsing boundary.

### P25. I/O added to a previously-pure path needs a negative resource-down test

If your change introduces I/O (DB, network, file) into a path that was
previously I/O-free — above all a startup, lifespan, or health path —
the happy-path test is not enough. Also write the NEGATIVE test: a
broken/unbound resource handle → the path degrades per its declared
contract (fail-open for an advisory feature, explicit fail-fast for a
load-bearing one). Otherwise an outage of that resource takes down the
whole path — including health checks — for the sake of an advisory
feature, and healthy fixtures will hide it until production.

Corollary — the fixture-swap smell: if making new code pass required
replacing a "broken" test fixture with a healthy one, stop. The old
fixture was probably a negative control proving the path was I/O-free.
Keep BOTH tests (healthy = new behavior, broken = degradation
contract); never silently delete the case that proved the old property.

---

## Section 7. Decision discipline

For a class of decision, walk a small gate before committing to it.

### 7.1 New env variable

Three questions:
1. Does its prod value differ from dev/stage value?
2. Is it tuned at runtime without redeploy?
3. If both no — it is a constant. Inline it.

(In session 04, 7 of 11 newly proposed env vars failed this gate.)

### 7.2 New defensive check / gate

Three questions:
1. What input do I expect to be wrong?
2. Where does it come from?
3. Why doesn't existing validation catch it?

If you cannot name the wrong input — defensive overshoot. Don't add it.

### 7.3 New service-to-service auth (in cluster)

Three questions:
1. What threat does this defend against — name the attacker.
2. How does the attacker reach this endpoint — through which network
   path.
3. What existing layer (k8s NetworkPolicy, Keycloak SSO, ingress)
   would have already stopped them.

If you cannot answer all three concretely — do not propose the
mechanism.

**Worked example — a token that PASSES the gate (the only kind that
should).** A cross-deployment bridge crosses a k8s-namespace /
separate-deployment boundary, so NetworkPolicy is no longer the trust
layer for that hop: the outbound call carries an integration token, the
receiving deployment validates a temporary inbound bearer, and the
caller's identity rides an actor/identity header. The boundary the token
defends is concrete (a separate deployment, no shared NetworkPolicy), so
all three questions answer. Contrast an **in-namespace** hop, which stays
token-free — there NetworkPolicy already answers question 3, so a token
would fail the gate. Treat such a bridge token as transitional (it
retires if the deployments later merge); it is not license to add tokens
between in-namespace services.

### 7.4 New abstraction / state / flag

Three questions:
1. Does the information I need already flow in the system?
2. If yes, why am I introducing a parallel representation?
3. Is this a fix or a bandaid? (Fix: removes the cause. Bandaid: works
   around the symptom.)

If it's a bandaid, name it and discuss with the user; do not commit it
silently.

### 7.5 Reuse vs. write new

Before writing a helper that takes >30 LOC: search the repo for an
analogous concept by name and by shape. If you find it — use or
extend it. If you don't, ask: is the absence because nobody needs
this, or because everyone keeps re-inventing it?

### 7.6 Metrics for a new feature

Two-sided gate. First — does the feature REQUIRE a Prometheus metric?
Any "yes" means the metric ships in the same diff as the feature, not
later:

1. It calls an external dependency with a rate limit or a known
   failure mode (GitLab, LLM provider, S3, Redis) → outcome counter
   (ok / rate_limited / error), plus a duration histogram if latency
   matters. The GitLab rate-limit incident is the precedent
   (`management_gitlab_requests_total`).
2. It has a retry / fallback / degrade path that keeps the user flow
   working while hiding the failure → the degradation must be visible
   in a metric, or the only signal is user complaints
   (`code_agent_llm_retry_events_total`, `event=fallback_activated`).
3. It runs background work against a resource budget — disk, inodes,
   queue depth, sync lag → gauge (`management_system_map_root_*`).
4. It carries a business invariant the owner will judge the feature by
   (cache hit-rate, confirm/reject ratio) → event counter.

Second — when NOT to add one. The test: name the on-call / owner
question the metric answers ("are we rate-limiting GitLab again?",
"how often do we fall back to another model?"). No question — no
metric. Do not add:

- per-endpoint counters duplicating RED metrics your shared observability layer already emits;
- metrics on CRUD/read paths with no external dependency — structured
  logs with `request_id` already cover those;
- metrics for rare admin / one-off operations;
- a derived value an existing metric already yields via PromQL.

Mechanics (module shape, naming, cardinality) — the canonical domain-metrics module (Section 4).

---

## Section 8. Production safety

- **Read-only inventory before action.** When working on prod-like
  systems, look before you touch. Confirm access (`kubectl get`,
  `pg_dump --schema-only`) before assuming you can write.
- **Helm/overlay sync.** When you change the chart, search for prod
  overlays and update them. Skipping this is how a deploy breaks
  nothing in dev and everything in prod.
- **Migrations: ordered, reviewed, Alembic-only.** New schema →
  Alembic migration. Never `metadata.create_all` on startup.
- **Migrations: zero-downtime ordering for live data.** Adding a
  required column on a populated table is a multi-step dance: add
  nullable → backfill → switch readers/writers → enforce NOT NULL.
  Doing it in one migration locks the table or rejects writes for
  every row that lacks the column. Type-narrowing and column-drop
  follow the same rule — code that no longer reads/writes the
  column ships first; the migration drops it later.
- **Dev defaults.** Debug log levels, test fixtures, dev creds — must
  not reach prod. The skill is: when you set a dev-friendly default,
  also set the prod-safe default explicitly.

---

## Section 9. Done-ness criteria

You are not done until:

- **Validator was run on the FINAL code.** Not on the plan, not on an
  intermediate draft. Tests/lint/typecheck against the actual diff.
- **Symptom reproduction is in the report.** If the task had a concrete
  symptom (stack trace, error string, wrong UI, slow query), the
  done-report contains the same artifact showing the new behavior.
  "pytest passed" is never sufficient on its own.
- **Sibling sweep done.** If you fixed pattern X in file A, you
  searched for the same shape in B, C, D and either fixed or
  documented why not.
- **Multi-repo coordination acknowledged.** If your change affects
  contracts/schemas/config consumed by sibling repos, name them in
  the report.
- **No silent deferrals.** If part of the task is left for "later",
  it is named, with a reason, in the report.
- **CI-parity ran.** The exact commands from each touched repo's
  `.gitlab-ci.yml` (its own ruff config, prettier, mypy, full
  `tests/unit`) — not a hand-picked subset. Anything not runnable
  locally (rag integration needs Docker) is declared as a risk, not
  silently skipped. New tests are collected by CI job selectors.
- **Real-DB test exists for write-side SQL** (Section 6 P21) and the
  config chain is traced for new keys (P23).

If you cannot produce a real artifact (e.g., bug is hard to reproduce
manually), say so explicitly: "verified at code level only, symptom
reproduction skipped because [reason]". Don't pretend.

---

## Section 10. Workflow

1. **Pre-flight.** Skip this skill entirely for read-only Q&A.
   Otherwise read.

2. **Pin major invariants.** Read the user's brief; write down the
   target/scale/SLA, the user's terminology, the surface area, the
   named external integrations (section 6 P19). These are fixed
   until the user changes them.

3. **Plan in writing.** State the goal in 1-2 sentences. List the
   alternatives you considered and why you rejected them. Identify
   which canonical patterns from section 4 apply.

4. **God-object check.** Does the work logically belong in any
   off-limits file (section 3 / `code-critic` Section A)? If yes —
   split or new file. Decide before coding.

5. **Implement with sections 5-6 in mind.** Security invariants and
   anti-pattern principles are the "while I'm coding" bar.

6. **Pre-validation.** Re-read your diff. Apply done-ness criteria
   (section 9) to yourself.

7. **Loop bound.** If you find yourself on iteration 3+ of the same
   structural problem, the implementation approach is wrong —
   redesign, do not patch.

8. **Done report.** Artifact + sibling-sweep summary + multi-repo
   acknowledgment + any deferrals named explicitly + invariants from
   step 2 either met or gaps named.

---

## References

- Evidence base: your project's own recurring review findings — mine them with `dz mr-rakes`, record canonicals + invariants in a per-repo `AGENTS.md`, and the product boundaries in `architecture/vision.md`.
- Critic skill: `code-critic`
