# Knowledge Units — 12factor-concurrency-process-model

Deep-lookup reference for the SKILL.md decision skill. Source: The Twelve-Factor App — VIII.
Concurrency, 12factor.net (CC BY 4.0). Machine-distilled, paraphrased, unreviewed (trust_tier 0).
© the Twelve-Factor authors.

---

## 12factor-viii-ku01 — Scale out via process types, not just in-process concurrency
*type: decision-framework · factor: VIII · skill_worthiness: high*

**Problem:** You need to add capacity to a running app and must pick between growing one VM/process
bigger (more threads, async/evented handlers inside a single runtime) versus running more independent
processes across machines. The choice recurs whenever you decide how an app absorbs increased load or
handles heterogeneous kinds of work.

**Content (paraphrased):** Model the app as a set of first-class OS processes, in the tradition of the
classic Unix service daemon, where each kind of work maps to its own named process type — for example a
web process for HTTP requests and a worker process for long-running background jobs. The full set of
process types together with the count of each is the app's *process formation*. Multiplexing inside a
single process (threads in the runtime VM, or evented frameworks such as EventMachine, Twisted, or
Node.js) is still allowed and useful, but it is only vertical scaling and hits a per-VM ceiling. The
decision rule: treat horizontal scale-out — adding more processes on more machines — as the primary axis
of growth, and treat in-process concurrency as a secondary optimization within each process. This works
because share-nothing, horizontally partitionable, stateless processes make adding concurrency a simple,
reliable operation: you just raise the count of a process type. Litmus test: can you absorb 10x load and
mixed workload kinds purely by starting more processes of the right types, with no redesign? If yes, the
process model is doing the scaling.

**Applicability:** Web/back-end services that must scale under variable load, have distinct workload
classes (request handling vs. batch/async work), and run on infrastructure where you can start multiple
process instances across hosts.

**Limits:** Not a replacement for internal concurrency — a single process can and should multiplex work,
but leaning on one big "uberprocess" (a JVM-style resource-reserving master) alone caps you at one
machine's ceiling. Horizontal scale-out assumes processes are truly stateless and share-nothing (per the
Processes factor); sticky in-memory state breaks it. For tiny apps or non-partitionable workloads,
splitting into many process types adds operational overhead without payoff.

---

## 12factor-viii-ku02 — Delegate process lifecycle to the environment — never self-daemonize
*type: checklist · factor: VIII · skill_worthiness: high*

**Problem:** Applies when deciding how processes start, stay alive, restart after a crash, and shut down,
and whether the app itself should background/daemonize or track its own PIDs.

**Content (paraphrased):** Keep each process in the foreground and let an external process manager own its
lifecycle. The decision: the app must not daemonize itself or write PID files; that responsibility sits
with the surrounding execution environment. Use the OS or platform manager — systemd on a single host, a
cloud platform's distributed process manager in production, or a dev tool like Foreman locally. The
manager captures and routes each process's output streams (the app just writes to stdout, per the Logs
factor), reacts to crashed processes by restarting them, and carries out operator-initiated restarts and
shutdowns, including graceful stop on signals such as SIGTERM. Checklist for a compliant process:
(1) runs in the foreground, (2) writes no PID file, (3) does not self-fork or background itself,
(4) emits logs to stdout instead of managing its own log files, (5) relies on the manager for crash
recovery and restarts.

**Applicability:** Any long-running service process deployed under a supervisor/init system or PaaS, and
local dev setups that use a Procfile-style runner.

**Limits:** Requires an environment that actually provides supervision; a bare foreground process with no
manager will not restart on crash. Legacy platforms that expect a traditional daemon (fork + PID file)
may not accept a foreground process without a shim. Graceful-shutdown behavior still depends on the app
handling termination signals correctly.

---

## Citation
Источник: The Twelve-Factor App — VIII. Concurrency, 12factor.net (CC BY 4.0). © the Twelve-Factor
authors.
