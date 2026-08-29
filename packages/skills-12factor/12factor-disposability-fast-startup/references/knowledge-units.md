# Knowledge Units — 12factor-disposability-fast-startup

Deep-lookup reference for the `12factor-disposability-fast-startup` skill. Machine-distilled
Knowledge Units from The Twelve-Factor App, Factor IX (Disposability). Facts and
technique-names preserved; prose paraphrased in our own words (no verbatim runs).

---

## 12factor-ix-ku01 — Design processes to be disposable (start fast, stop clean)
- **Type:** decision-framework

**Problem.** You run stateless process types that the platform must be free to relocate, scale, or
replace — under elastic load swings, frequent code/config deploys, or when a process manager moves
work between machines. Slow boots or messy shutdowns turn every scaling or deploy event into
downtime and risk.

**Decision.** Treat each process as something the platform can create or kill at any instant, and
make both ends cheap.
- **Startup budget:** from the launch command to accepting requests/jobs should be on the order of a
  few seconds, so schedulers can move processes and roll releases out quickly.
- **Shutdown budget:** on SIGTERM, drain cleanly instead of dying abruptly. A web process stops
  accepting new connections on its listening port and lets in-flight requests finish; a worker
  returns its current job to the queue before exiting (for example NACK on RabbitMQ, automatic
  release on Beanstalkd, or freeing a lock in Delayed Job).

**Litmus test.** Can you kill and relaunch any process at a random moment with no user-visible
errors and no orphaned work? If yes, elastic scaling and fast deploys follow for free.

**Applicability.** Stateless HTTP/web process types and background worker/job-runner process types
deployed on schedulers or a PaaS that autoscales, redeploys, and reschedules frequently.

**Limits.** Not free for stateful or slow-to-warm workloads: large in-memory caches, JIT warm-up,
big model loads, or long-lived connection pools make sub-second startup impractical — mitigate with
warm pools or prefetch rather than pretending boot is instant. Graceful drain also needs a bounded
timeout, since the platform will SIGKILL after a grace period; unbounded in-flight work must be made
resumable rather than merely waited on.

---

## 12factor-ix-ku02 — Assume crash-only: survive sudden death without data loss
- **Type:** heuristic

**Problem.** A process can vanish with no warning — hardware failure, network partition, OOM kill,
or a forced SIGKILL after the grace window — and any in-progress work must not be lost, destructively
duplicated, or left corrupt.

**Decision.** Do not rely on shutdown handlers alone; graceful drain covers the polite case, but you
must also stay correct when nothing runs on the way out. Push durability into a backend that reclaims
work automatically: a queue that re-enqueues a job when its consumer disconnects or times out
(Beanstalkd is the canonical example) means an abandoned task simply becomes available again. Follow
crash-only design — the same recovery path handles both an intentional stop and an abrupt kill, so
there is no special "clean exit" code to get wrong.

**Litmus test.** Yank the power on a busy worker; after restart, is every in-flight unit either
completed or safely retried, with no manual cleanup?

**Applicability.** Job/worker pipelines, message-driven consumers, and any process holding transient
work whose loss would corrupt state or drop user tasks.

**Limits.** Automatic retry demands idempotent or transactional handlers — otherwise re-delivery
double-charges, double-sends, or double-writes. Re-queue-on-disconnect also risks duplicate
concurrent processing if a slow (not dead) worker is presumed gone; it needs visibility timeouts and
dedup keys. Truly exactly-once semantics are not achievable by queue re-delivery alone.

---

Источник: The Twelve-Factor App — IX. Disposability, 12factor.net (CC BY 4.0).
© the Twelve-Factor App authors. Licensed under Creative Commons Attribution 4.0 International.
