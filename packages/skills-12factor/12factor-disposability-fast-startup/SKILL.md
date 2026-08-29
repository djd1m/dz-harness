---
name: 12factor-disposability-fast-startup
description: >
  Decide HOW a process should start and stop so the platform can create or destroy it at any
  instant: boot in a few seconds up to accepting traffic/jobs, drain cleanly on SIGTERM (a web
  process stops taking new connections and lets in-flight requests finish; a worker returns its
  current job to the queue), AND stay correct on sudden death — crash-only design where an
  abrupt SIGKILL / OOM / hardware failure re-enqueues work automatically. Litmus: can you kill
  and relaunch any process at a random moment with no user-visible errors and no orphaned work?
  NOT for WHERE a process holds state (→ 12factor-stateless-processes),
  NOT for the scale-out process-formation / process-type model (→ 12factor-concurrency-process-model),
  NOT for attaching the queue/datastore as a resource (→ 12factor-backing-services-as-resources).
  Triggers (RU+EN): "почему деплой вызывает даунтайм / долгий старт процесса",
  "как обработать SIGTERM без потери запросов", "воркер потерял задачу при рестарте",
  "graceful shutdown web-сервера / дренаж соединений", "job disappears when the worker dies",
  "process takes too long to boot for autoscaling", "handle SIGTERM to finish in-flight requests",
  "return the job to the queue on shutdown (NACK / release)", "crash-only recovery after OOM kill",
  "no data loss when a busy worker is SIGKILLed after the grace period".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net/disposability to promote to Tier 2"
derived_from: [12factor-ix-ku01, 12factor-ix-ku02]
---

# 12-Factor Disposability — start fast, stop clean, survive sudden death

## Decision
How should application processes start up and shut down?

**Choice:** make every process **disposable** — cheap for the platform to spin up or tear down at
any moment, on both ends of its life:

1. **Fast startup.** From the launch command to the point where the process accepts requests or
   pulls jobs should take on the order of a **few seconds**, so schedulers can relocate processes
   and roll releases out quickly.
2. **Graceful shutdown on SIGTERM.** React to the termination signal by **draining**, not by dying
   abruptly. A web process stops accepting new connections on its port and lets in-flight requests
   finish; a worker hands its current job **back to the queue** before it exits.
3. **Crash-only robustness.** Do not depend on shutdown handlers alone — the process may vanish with
   no chance to run cleanup (hardware fault, network partition, OOM kill, or a forced SIGKILL after
   the grace window). Design so the **same recovery path** covers both a polite stop and a sudden
   death, and so all in-progress work is recoverable or automatically retried.

The moment your correctness depends on "the process always got to shut down cleanly," the design is
already broken.

## Protocol

1. **Budget the boot.** Measure launch-command → ready-to-serve. Aim for a few seconds. If a slow
   warm-up (large in-memory cache, JIT, model load, connection pools) blows that budget, use a warm
   pool or prefetch rather than pretending boot is instant.
2. **Trap SIGTERM in web processes.** On the signal, stop accepting new connections on the listening
   port, finish the requests already in flight, then exit. Never hard-kill mid-request.
3. **Trap SIGTERM in workers.** On the signal, put the job currently being processed **back on the
   queue** before exiting — e.g. NACK on RabbitMQ, automatic release on Beanstalkd, or freeing the
   lock in Delayed Job — so a sibling picks it up.
4. **Bound the drain.** Give shutdown a finite timeout, because the platform sends SIGKILL after a
   grace period. Any work that cannot finish inside that window must be made **resumable**, not
   merely waited on.
5. **Push durability into the backend (crash-only).** Prefer a queue that reclaims work when a
   consumer disconnects or times out (Beanstalkd is the canonical example): an abandoned task simply
   becomes available again, so an abrupt kill needs no special-case cleanup code.
6. **Make retried handlers idempotent.** Since re-delivery can happen, design handlers to be
   idempotent or transactional, and use visibility timeouts + dedup keys so a slow-but-alive worker
   is not double-processed.

### Criteria / litmus table

| Concern | Target | Concrete step | Litmus test |
|---|---|---|---|
| Startup time | A few seconds to ready | Trim boot work; warm pool / prefetch for slow warm-up | "Can the scheduler relocate this fast?" → no ⇒ shrink boot |
| Web shutdown | Drain, don't drop | Stop new connections on the port, finish in-flight, exit | "Does SIGTERM ever kill a live request?" → yes ⇒ violation |
| Worker shutdown | Return work to queue | NACK / release / free lock before exit | "Is the current job re-runnable elsewhere after exit?" → no ⇒ fix |
| Grace window | Bounded drain | Finite timeout; make overflow work resumable | "What if SIGKILL fires mid-drain?" → work lost ⇒ make resumable |
| Sudden death | Crash-only recovery | Queue re-enqueues on disconnect/timeout | "Yank the power — is every unit done or retried, no manual cleanup?" |
| Retry safety | Idempotent handlers | Dedup keys, visibility timeout, transactional writes | "Does re-delivery double-charge/double-write?" → yes ⇒ not idempotent |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| Multi-minute boot (heavy warm-up before ready) | Every scale-up or deploy becomes slow and downtime-prone; scheduler can't relocate quickly | ku01 |
| Killing a web process mid-request on SIGTERM | In-flight requests error out for real users during every deploy/rescale | ku01 |
| Worker exits without returning its job to the queue | The in-progress task is silently dropped on shutdown | ku01 |
| Unbounded drain that ignores the grace period | Platform SIGKILLs anyway; work waited-on-but-not-resumable is lost | ku01, ku02 |
| Relying on shutdown handlers as the only safety net | An OOM kill / SIGKILL / hardware fault runs no cleanup, so work is lost | ku02 |
| Non-idempotent handler on an at-least-once queue | Re-delivery double-charges, double-sends, or double-writes | ku02 |
| Presuming a slow worker is dead and re-queuing eagerly | Two workers process the same unit concurrently without a visibility timeout / dedup | ku02 |

## Related decisions
- Disposability is the *precondition* for `12factor-concurrency-process-model`: only processes that boot fast and
  die clean can be freely added, removed, and rescheduled across the process formation.
- It works *because of* `12factor-stateless-processes`: there is nothing local worth saving on
  shutdown, so a process can be killed and relaunched without loss.
- The queue/datastore that re-enqueues abandoned work is an *attached resource* from
  `12factor-backing-services-as-resources`, bound by config — not something the process owns internally.
- The connection string for that queue comes from `12factor-config-in-environment`, not from code.

## Источник
Источник: The Twelve-Factor App — IX. Disposability, 12factor.net (CC BY 4.0). © the Twelve-Factor
App authors. Paraphrased and restructured derivative (no verbatim runs); deep reference in
references/knowledge-units.md. KUs: 12factor-ix-ku01, 12factor-ix-ku02.

## Self-check
- [x] Every protocol step / criterion traces to a listed KU (ku01–ku02)?
- [x] Boundary clause routes state-location to stateless-processes, scale-out to concurrency, the queue-as-resource to backing-services?
- [x] Prose paraphrased — no verbatim run ≥ 8 words from the source?
- [x] Technique/fact names kept accurate (SIGTERM, SIGKILL, NACK/RabbitMQ, Beanstalkd release, Delayed Job lock, crash-only, visibility timeout)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «почему каждый деплой роняет часть запросов пользователей?» → web-процесс убивается по SIGTERM
  прямо на активном запросе; лови сигнал, перестань принимать новые соединения на порту, дай
  in-flight запросам завершиться, потом выходи.
- "our background worker loses the job it was processing when the dyno restarts" → on SIGTERM return
  the current job to the queue (NACK / Beanstalkd release / free the Delayed Job lock) before exit,
  and prefer a queue that re-enqueues on consumer disconnect for the sudden-kill case.
- «процесс стартует минуту — из-за этого автоскейл и выкатка тормозят» → сократи загрузочную работу
  до нескольких секунд до готовности; тяжёлый прогрев (кэш/JIT/модель) выноси в warm-pool или
  prefetch, а не жди мгновенного старта.
- "what happens if the box gets OOM-killed mid-job — can I trust my shutdown handler?" → no; go
  crash-only — let the queue reclaim the task on disconnect/timeout, and make the handler idempotent
  (dedup key + visibility timeout) so re-delivery is safe.
