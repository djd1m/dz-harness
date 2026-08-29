# Knowledge Units — 12factor-stateless-processes

Deep-lookup reference for the `12factor-stateless-processes` skill. Machine-distilled
Knowledge Units from The Twelve-Factor App, Factor VI (Processes). Facts and
technique-names preserved; prose paraphrased in our own words (no verbatim runs).

---

## 12factor-vi-ku01 — Keep app processes stateless and share-nothing
- **Type:** decision-framework

**Problem.** You are deciding where an application should hold data that must survive across
requests, jobs, or restarts. This applies whenever a process caches session data, uploads,
compiled assets, or intermediate results in local memory or on local disk and later reads
them back.

**Decision.** Treat every process as disposable and stateless: it shares nothing with sibling
processes and must assume its local memory and filesystem can disappear at any moment. Anything
that must persist belongs in an external stateful store such as a database — not in-process.

**Allowed local storage.** Use memory or disk only as a short-lived scratch cache scoped to a
single transaction (for example: fetch a large file, transform it, then write the result to the
datastore). Never rely on that cached value surviving into a later request or job.

**Rationale (litmus test).** With several processes of one type running, a later request will
probably land on a different process; and even a single process gets its local state wiped by any
restart — a deploy, a config change, or the platform relocating it to different hardware. So if
correctness depends on "the same process handling the next request," the design is broken.

**Applicability.** Web apps, workers, and any long-running service deployed as multiple process
types on a platform that may scale, restart, or relocate processes — especially when introducing
caching, file uploads, or session handling.

**Limits.** A single-transaction local cache is fine and often good for performance. The rule is
not "never touch disk," it is "never assume local state persists across requests/restarts." On a
truly single-instance, never-restarted setup the risk is lower, but platform relocation and
deploy-time wipes still make reliance on local state fragile.

---

## 12factor-vi-ku02 — Never rely on sticky sessions; externalize session state
- **Type:** heuristic

**Problem.** You must persist per-user session data across requests in a multi-process web system
and are tempted to pin each visitor to one process (sticky sessions / session affinity at the load
balancer).

**Decision.** Sticky sessions — caching a user's session in one process's memory and routing that
user's later requests back to the same process — break the stateless-process rule and must not be
adopted.

**Replacement heuristic.** Move session state into an external datastore that supports time-based
expiration, such as Memcached or Redis.

**Why.** Sticky sessions reintroduce hidden per-process state, so a restart or a rebalanced request
silently loses the user's session. An external expiring store keeps sessions available to any
process and cleans itself up.

**Litmus test.** If your load balancer must send a returning visitor to a specific instance for the
app to work, you have a sticky-session violation — externalize the state instead.

**Applicability.** Any horizontally scaled web application maintaining login sessions, carts, or
per-user state behind a load balancer or across multiple instances.

**Limits.** Requires operating an external store (Memcached/Redis) and accepting its latency and
availability as a dependency. Size and expire session payloads sensibly. This addresses session
state specifically; other best-effort caches (e.g. a CDN edge cache) are a separate concern.

---

## 12factor-vi-ku03 — Precompute derived artifacts at build time, not on-request in the filesystem
- **Type:** checklist

**Problem.** Your app generates derived files — compiled/packaged assets, bundles — and a tool wants
to write them to the local filesystem the first time they are requested, then reuse them from disk.

**Decision.** Do not use the runtime filesystem as a lazy cache for compiled artifacts; produce those
artifacts during the build stage instead.

**Checklist.**
1. Identify anything a request-time process would compile-and-cache to disk (e.g. asset packaging via
   tools like django-assetpackager, Jammit, or the Rails asset pipeline).
2. Configure that tool to package/compile during build rather than at first request.
3. Ship the precomputed output with the release so every process starts with it already present.

**Rationale.** Build-time artifacts are identical across all running processes and survive restarts,
whereas a filesystem cache populated at runtime is per-process, non-durable, and inconsistent under
scaling.

**Applicability.** Front-end asset pipelines and any workload with a compile/package step whose output
is deterministic and can be generated ahead of deploy.

**Limits.** Only applies to artifacts computable before runtime from known inputs. Genuinely dynamic,
per-request outputs cannot be moved to build time and should go to a backing service if they must
persist.

---

Источник: The Twelve-Factor App — VI. Processes, 12factor.net (CC BY 4.0).
© the Twelve-Factor App authors. Licensed under Creative Commons Attribution 4.0 International.
