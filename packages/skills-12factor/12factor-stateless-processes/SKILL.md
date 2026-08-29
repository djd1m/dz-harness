---
name: 12factor-stateless-processes
description: >
  Decide WHERE a process may hold state: run every app process stateless and share-nothing,
  treat its local memory + local disk as a throwaway single-transaction scratch cache only, and
  push anything that must outlive a request/job/restart into a backing datastore. Kill sticky
  sessions / load-balancer session affinity — externalize session state to Redis/Memcached with
  expiry. Precompute compiled assets at build time, not as an on-request filesystem cache.
  NOT for how you attach/treat that datastore as a resource (→ 12factor-backing-services-as-resources),
  NOT for the scale-out process-formation model (→ 12factor-concurrency-process-model),
  NOT for fast startup / graceful SIGTERM shutdown (→ 12factor-disposability-fast-startup).
  Triggers (RU+EN): "где хранить сессию пользователя", "sticky sessions или нет",
  "кэшировать файл на диске между запросами", "почему после деплоя слетает сессия",
  "should sessions live in process memory", "session affinity on the load balancer",
  "cache uploaded file on local disk", "compile assets on first request vs at build",
  "state disappears after restart / redeploy", "share data between worker processes".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net/processes to promote to Tier 2"
derived_from: [12factor-vi-ku01, 12factor-vi-ku02, 12factor-vi-ku03]
---

# 12-Factor Stateless Processes — hold nothing locally that you can't afford to lose

## Decision
How should application processes hold state?

**Choice:** run each process as **stateless and share-nothing**. A process may share nothing with its
siblings, and it must assume its own local memory and local filesystem can vanish at any instant
(a deploy, a config change, a restart, or the platform relocating it to other hardware). Any datum
that has to survive across a request, a background job, or a restart belongs in a **stateful backing
service** — usually a database or an expiring key/value store — never in-process.

Local memory or disk is allowed only as a **short-lived scratch cache for a single transaction**:
pull a large file, transform it, write the result to the datastore, done. The moment your correctness
depends on "the same process will handle the next request," the design is already broken.

## Protocol

1. **Classify each piece of state.** For anything the process writes, ask: must it survive into a
   *later* request, job, or restart? If yes → it is durable state → route it to a backing service.
   If it only lives inside the current transaction → a local scratch cache is fine.
2. **Use local storage as scratch, never as memory.** Downloading-transforming-then-persisting within
   one request is the sanctioned pattern. Reading a cached value back in a *subsequent* request is not
   — a later request will likely land on a different process, and a lone process loses its local state
   on any restart.
3. **Externalize session state.** Put per-user session data (logins, carts, per-user context) into an
   external store with time-based expiration — Memcached or Redis. Every process can then serve any
   returning visitor, and the store expires stale sessions itself.
4. **Ban sticky sessions / session affinity.** Do not configure the load balancer to pin a visitor to
   one instance. If the app only works when a returning user is routed back to a specific process, that
   is a violation — move the state out instead.
5. **Precompute derived artifacts at build time.** For compiled/packaged assets, configure the tool
   (asset pipeline, django-assetpackager, Jammit, Rails asset pipeline, etc.) to compile during the
   **build stage** and ship the output in the release, so every process starts with it already present
   — instead of lazily writing it to the runtime filesystem on first request.

### Criteria / litmus table

| Situation | Verdict | Where it goes | Litmus test |
|---|---|---|---|
| Value must survive a later request / job / restart | Durable state | Backing service (DB / Redis / Memcached) | "Would a restart lose it?" → yes ⇒ externalize |
| Pull-transform-persist inside one request | Allowed scratch | Local memory or disk (transient) | Never read back in a *later* request |
| Per-user session behind a load balancer | Durable state | External expiring store (Redis / Memcached) | "Must the LB pin the user to one instance?" → yes ⇒ violation |
| Compiled/packaged assets, deterministic inputs | Build-time artifact | Produced in build stage, shipped in release | "Am I compiling on first request?" → yes ⇒ move to build |
| Genuinely dynamic per-request output that must persist | Durable state | Backing service | Can't be precomputed ⇒ datastore, not disk |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| Caching a value in process memory/disk and reading it back on a later request | A subsequent request usually hits a different process; a restart wipes a lone process's local state | ku01 |
| Sticky sessions / load-balancer session affinity for login state | Reintroduces hidden per-process state — a restart or a rebalanced request silently drops the user's session | ku02 |
| Storing uploads/session/compiled assets on the local filesystem as durable state | The filesystem is per-process and non-durable; scaling makes copies inconsistent, restarts erase them | ku01, ku03 |
| Lazily compiling assets to disk on first request and reusing from disk | The cache is per-process, non-durable, and inconsistent under scale-out; recompiles after every relocation | ku03 |
| Assuming a single-instance box is "safe" to keep state on | Platform relocation and deploy-time wipes still make reliance on local state fragile | ku01 |

## Related decisions
- Persisting the durable state you just externalized → `12factor-backing-services-as-resources`: the database or
  Redis/Memcached session store is an *attached resource* you bind by config, not part of the process.
- Stateless is the precondition for `12factor-concurrency-process-model`: only share-nothing processes can be scaled
  out horizontally across the process formation without corrupting shared state.
- Losing local state on shutdown is fine *because of* `12factor-disposability-fast-startup`: fast startup and
  graceful SIGTERM handling assume there is nothing local worth saving.
- The connection string for the external session store comes from `12factor-config-in-environment`,
  not from code.

## Источник
Источник: The Twelve-Factor App — VI. Processes, 12factor.net (CC BY 4.0). © the Twelve-Factor App
authors. Paraphrased and restructured derivative (no verbatim runs); deep reference in
references/knowledge-units.md. KUs: 12factor-vi-ku01, 12factor-vi-ku02, 12factor-vi-ku03.

## Self-check
- [x] Every protocol step / criterion traces to a listed KU (ku01–ku03)?
- [x] Boundary clause routes session-store persistence to backing-services, scale-out to concurrency, shutdown to disposability?
- [x] Prose paraphrased — no verbatim run ≥ 8 words from the source?
- [x] Technique/fact names kept accurate (Redis, Memcached, Jammit, django-assetpackager, Rails asset pipeline, build stage)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «где хранить сессию пользователя в горизонтально масштабируемом приложении?» → external expiring
  store (Redis/Memcached), never process memory; sticky sessions are a violation.
- "our users get logged out randomly after every deploy" → the session lives in process memory / behind
  session affinity; externalize it to Redis with expiry so any process can serve the request.
- «стоит ли кэшировать загруженный файл на локальном диске между запросами?» → only as single-transaction
  scratch (download → transform → write to datastore); never read it back in a later request.
- "should we compile front-end assets on first request and cache them on disk?" → no — compile in the
  build stage and ship the output in the release so every process starts with it present.
