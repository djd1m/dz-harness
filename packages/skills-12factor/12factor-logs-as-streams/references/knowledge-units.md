# Knowledge Units — 12factor-logs-as-streams

Deep-lookup reference for the SKILL.md decision skill. Source: The Twelve-Factor App — Factor XI:
Logs (Treat logs as event streams), 12factor.net (CC BY 4.0). Machine-distilled, paraphrased,
unreviewed (trust_tier 0). © the Twelve-Factor authors.

---

## 12factor-f11-ku01 — Write logs as an unbuffered event stream to stdout, not to app-owned files
*type: heuristic · factor: XI · skill_worthiness: high*

**Problem:** A running app needs to surface operational visibility — behavior, errors, request activity.
This decision governs where and how it emits that output, i.e. the moment you would reach for a logging
library that opens a file, rotates it, or ships it somewhere.

**Content (paraphrased):** Think of logs as a continuous, time-ordered flow of events rather than files
the app owns. Each process writes its events unbuffered to `stdout`, one event per line, with multi-line
backtraces as the only exception. The app stays intentionally ignorant of routing and storage: it does
not open, rotate, or ship logfiles. Compliance criteria — (1) output goes to stdout, not to a path the
app picks; (2) writes are unbuffered so events appear immediately; (3) the code assumes nothing about the
final destination. Litmus: in local development the engineer just watches the stream in the terminal
foreground; in staging/production the execution environment captures every process's stream, collates
them, and routes them to destinations the app can neither see nor configure. A logfile on disk, when one
exists, is merely one output format the environment chose — not something the code manages.

**Applicability:** Any process type (web, worker, one-off admin task) in a twelve-factor app; especially
when moving from local development to staged/production deploys where many process streams must be
aggregated centrally.

**Limits:** The factor deliberately hands routing and storage to the execution environment, so it assumes
such an environment exists — a router like Fluentd or Logplex, or a platform that captures stdout. On
bare processes with no capturing layer, stdout-only logging can be lost; you must supply the router
rather than reintroduce in-app file management. High-volume structured logging and indexing (Splunk,
Hadoop/Hive) still happen, but downstream of the app, not inside it.

---

## 12factor-f11-ku02 — Separate log emission (app) from log handling (environment)
*type: decision-framework · factor: XI · skill_worthiness: high*

**Problem:** During deploy architecture and observability setup you must decide responsibility
boundaries: should the app or the platform own capturing, routing, archival, and analysis of logs? This
also drives the choice between an in-app logging framework and environment-level collection.

**Content (paraphrased):** Split the concern into emission (the app's job) and handling (the
environment's job). The app only produces the stdout stream. Everything after that — capturing each
process's stream, collating them across the whole app, routing to one or more destinations, and long-term
archival — belongs to the execution environment. Because the app never binds to a destination, the same
stream can be tailed live, written to a file, fed to a log-indexing/analysis system, or piped into a
general data warehouse. That downstream layer is what makes it possible to search historical events,
graph trends such as requests per minute, and fire threshold alerts (e.g. errors per minute exceeding a
limit). Rule of thumb: if app code knows the archival location, the boundary is broken — those
destinations should be invisible to and unconfigurable by the app.

**Applicability:** Platform/deploy design, observability tooling selection, and reviewing whether a
logging dependency is doing environment work (rotation, shipping) that should be externalized to a router.

**Limits:** Requires a competent execution environment to actually capture and route stdout; on minimal
setups the team must stand up the router (Logplex, Fluentd) or equivalent. Fine-grained per-app control
over archival is intentionally surrendered, which can conflict with strict compliance/retention rules
that demand app-level guarantees.

---

## Citation
Источник: The Twelve-Factor App — Factor XI: Logs (Treat logs as event streams), 12factor.net
(CC BY 4.0). © the Twelve-Factor authors.
