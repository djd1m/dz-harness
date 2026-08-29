---
name: 12factor-concurrency-process-model
description: >
  Decide HOW an app scales: make the process the first-class unit of scale — model work as named
  process types (web for HTTP, worker for background jobs), let the count of each type form the
  app's process formation, and scale OUT by starting more processes across hosts rather than only
  growing one runtime with threads/evented handlers. Second coupled choice: never self-daemonize —
  run in the foreground, no PID files, write logs to stdout, and hand crash-restart / shutdown to
  an external process manager (systemd, a PaaS, Foreman locally). In-process concurrency (threads,
  EventMachine, Twisted, Node.js) is a secondary vertical optimization capped at one machine.
  NOT for whether a process may hold local state (→ 12factor-stateless-processes),
  NOT for fast boot / graceful SIGTERM shutdown mechanics (→ 12factor-disposability-fast-startup),
  NOT for where logs are routed once on stdout (→ 12factor-logs-as-streams).
  Triggers (RU+EN): "как масштабировать приложение под нагрузкой", "потоки внутри процесса или
  больше процессов", "разделить web и worker процессы", "нужно ли демонизировать процесс и писать
  pid-файл", "процесс должен сам рестартиться при падении", "process types и Procfile",
  "how to scale out under load", "threads vs more processes", "should the app daemonize itself",
  "who restarts a crashed process", "web vs worker process formation", "handle 10x traffic".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net/concurrency to promote to Tier 2"
derived_from: [12factor-viii-ku01, 12factor-viii-ku02]
---

# 12-Factor Concurrency — scale out with process types, not one big runtime

## Decision
How should the app absorb more load and mixed kinds of work?

**Choice:** make the **OS process** the first-class unit of scale, in the spirit of the classic Unix
service daemon. Map each kind of work to its own named **process type** — a *web* process for HTTP
requests, a *worker* process for long-running background jobs, and so on. The complete set of process
types plus how many copies of each are running is the app's **process formation**. To add capacity or
handle a new workload class, increase the count of the right process type across more machines.

Treat **horizontal scale-out (more processes) as the primary axis** and **in-process multiplexing
(threads inside the VM, or evented runtimes like EventMachine, Twisted, Node.js) as a secondary,
vertical optimization** — useful, but bounded by a single machine's ceiling. A second, tightly coupled
choice: processes must **not manage their own lifecycle** — no self-daemonizing, no PID files. They run
in the foreground and let an external **process manager** own start, crash-restart, and shutdown.

## Protocol

1. **Name a process type per workload class.** Split distinct work into distinct types — HTTP handling
   into a *web* type, batch/async jobs into a *worker* type — instead of cramming everything into one
   runtime. Diverse work maps cleanly onto diverse process types.
2. **Express capacity as a process formation.** Think in terms of "N web + M worker"; adding capacity or
   a new workload kind means adjusting those counts, not rewriting the app.
3. **Scale out first, up second.** When load rises, start more processes of the needed type on more
   hosts. Keep in-process concurrency (threads, evented I/O) as an internal optimization within each
   process — never as the only way to grow.
4. **Stay share-nothing so scaling is a count change.** Because each process holds no shared state (see
   stateless-processes), reliably adding concurrency reduces to increasing a process count — no redesign.
5. **Run in the foreground; delegate the lifecycle.** Do not daemonize, do not fork into the background,
   do not write PID files. Let the surrounding environment supervise: **systemd** on one host, a
   platform's distributed process manager in production, **Foreman** (Procfile) in local dev.
6. **Let the manager own output, crashes, and restarts.** Write logs to **stdout** and let the manager
   capture/route them (see logs). The manager restarts crashed processes and carries out operator
   restarts and shutdowns — including graceful stop on **SIGTERM**.

### Criteria / litmus table

| Situation | Verdict | What to do | Litmus test |
|---|---|---|---|
| Load rises / new workload class appears | Scale out | Start more processes of the right type on more hosts | "Can I handle 10x + mixed work purely by starting more processes, no redesign?" → yes ⇒ process model scales |
| Single runtime tuned with more threads / evented handlers | Vertical only | Keep as in-process optimization, not the growth strategy | "Am I capped at one machine's ceiling?" → yes ⇒ add horizontal scale-out |
| Distinct kinds of work (requests vs. batch) | Separate types | One named process type per kind (web, worker) | "Does one process type mix unrelated workloads?" → yes ⇒ split |
| Process backgrounds itself / writes a PID file | Anti-pattern | Run foreground; hand lifecycle to a manager | "Does the app track its own daemon/PID?" → yes ⇒ violation |
| A process crashes | Manager's job | Rely on supervisor to restart | "Is there a supervisor watching?" → no ⇒ add one |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| Scaling only by making one runtime bigger (more threads / a single "uberprocess") | JVM-style resource-reserving masters cap you at one machine's ceiling; you cannot scale past a host | ku01 |
| Treating in-process concurrency as the whole scaling story | Vertical scale hits a hard limit; without horizontal scale-out there is nowhere to go | ku01 |
| Cramming request handling and background jobs into one undifferentiated process | Loses the process-type model; can't scale or reason about workload classes independently | ku01 |
| Splitting a tiny or non-partitionable app into many process types | Adds operational overhead with no scaling payoff | ku01 |
| App daemonizes itself and writes PID files | Duplicates and fights the environment's supervisor; brittle, non-portable lifecycle | ku02 |
| Leaving a foreground process with no manager | Nothing restarts it on crash; no graceful shutdown on SIGTERM | ku02 |
| App manages its own log files instead of writing to stdout | The manager can't capture/route output; breaks supervised operation | ku02 |

## Related decisions
- **12factor-stateless-processes** — share-nothing statelessness is the *precondition* for this factor:
  only stateless processes can be scaled out by simply raising a process-type count without corrupting
  shared state. This skill scales them; stateless decides they hold nothing local.
- **12factor-disposability-fast-startup** — the process manager restarts and stops processes here; *how* a process
  boots fast and shuts down gracefully on SIGTERM is disposability's concern.
- **12factor-logs-as-streams** — "write to stdout, let the manager route it" is the seam: concurrency says the
  manager captures the stream, logs governs treating that stream as an event stream.
- **12factor-backing-services-as-resources** — worker and web process types reach shared data through attached
  backing services, not through each other.

## Источник
Источник: The Twelve-Factor App — VIII. Concurrency, 12factor.net (CC BY 4.0). © the Twelve-Factor
authors. Paraphrased and restructured derivative (no verbatim runs); deep reference in
references/knowledge-units.md. KUs: 12factor-viii-ku01, 12factor-viii-ku02.

## Self-check
- [x] Every protocol step / criterion traces to a listed KU (ku01 process model, ku02 lifecycle)?
- [x] Boundary clause routes local-state to stateless-processes, boot/shutdown to disposability, log routing to logs?
- [x] Prose paraphrased — no verbatim run ≥ 8 words from the source?
- [x] Technique/fact names kept accurate (web/worker process types, process formation, stdout, SIGTERM, systemd, Foreman, EventMachine, Twisted, Node.js)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «как масштабировать сервис под пиковой нагрузкой — добавить потоков в один процесс или запускать
  больше процессов?» → scale out: raise the count of the right process type across hosts; threads/evented
  I/O are only a per-process vertical optimization capped at one machine.
- "we have HTTP handling and heavy background jobs in one runtime — how should we structure it?" → split
  into a *web* process type and a *worker* process type; capacity becomes a process formation you dial up.
- «должен ли наш процесс сам демонизироваться и писать pid-файл, чтобы переживать падения?» → no —
  run in the foreground, write logs to stdout, and let systemd / a PaaS / Foreman restart it and stop it
  gracefully on SIGTERM.
- "can we prove our design actually scales?" → litmus: if 10x load and mixed workloads are handled purely
  by starting more processes of the right types with no redesign, the process model is doing the scaling.
