---
name: 12factor-logs-as-streams
description: >
  Decide HOW a running process emits logs — as an unbuffered, time-ordered event stream to stdout, one
  event per line, with the app deliberately ignorant of routing, rotation, and storage. Covers where log
  output goes (stdout vs a file path the app opens), whether writes are buffered, and who owns capture,
  collation, archival, and alerting (the execution environment, not the code). Litmus: in dev you watch
  the stream in your terminal; in prod a router (Fluentd, Logplex) captures and ships it to destinations
  the app can't see. NOT for supplying config/credentials to a log shipper (→ 12factor-config-in-environment),
  NOT for how the app connects to a downstream indexer as an attachable resource
  (→ 12factor-backing-services-as-resources). Triggers (RU+EN): "писать логи в файл или в stdout",
  "нужно ли ротировать логфайлы в приложении", "куда приложение должно выводить логи", "буферизовать
  ли вывод логов", "should the app write logs to a file or stream to stdout", "who owns log rotation and
  shipping", "how to aggregate logs from many processes", "where should log output go in production".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against Factor XI on 12factor.net to promote to Tier 1"
derived_from: [12factor-f11-ku01, 12factor-f11-ku02]
---

# Logs as event streams — write events to stdout, let the environment handle the rest

## Decision
**How a process should handle its logs** — treat every log line as one event in a continuous,
time-ordered stream and write it unbuffered to `stdout`. Do **not** make the app open a logfile, rotate
it, choose a storage path, or ship it anywhere. Emission is the app's job; capture, routing, and archival
belong to the execution environment.

Draw the line first: **the app produces a stream, the platform decides its fate.** A logfile on disk, if
one exists at all, is just one output format the environment happened to pick — not an artifact the code
manages. The app stays deliberately ignorant of the final destination so the same stream can be tailed
live, dropped to a file, fed to an indexer, or piped into a warehouse without a code change.

## Protocol

1. **Emit, don't manage.** Write each event to `stdout`. Never call code that opens a named logfile,
   picks a directory, or rotates on size/time — that responsibility is being pushed onto the environment
   on purpose.
2. **One event per line.** Keep output line-oriented so a router can split the stream cleanly. The lone
   exception is a multi-line item such as an exception backtrace.
3. **Write unbuffered.** Flush events immediately so they surface in real time rather than sitting in an
   app-side buffer.
4. **Assume nothing about the destination.** The code must not know or configure where logs end up —
   no archival path, no index name, no shipping endpoint in app code.
5. **Local vs deployed behaves the same for the app.** In development the engineer simply watches the
   stream in the terminal foreground. In staging/prod the execution environment captures each process's
   stream, collates streams across the whole app, and routes them to one or more destinations the app
   can neither see nor set.
6. **Put handling downstream, outside the app.** Searching history, graphing trends (e.g. requests per
   minute), and threshold alerts (e.g. errors/minute over a limit) all live in the log-handling layer —
   an indexer (Splunk-class) or a general data warehouse (Hadoop/Hive-class) — fed *after* stdout, never
   inside the process.
7. **Supply a router if the platform lacks one.** stdout-only logging assumes something captures the
   stream. On bare processes with no capturing layer, stand up a router (Fluentd, Logplex) rather than
   reintroduce in-app file management.

### Criteria / litmus table

| Question | If yes → | If no → |
|----------|----------|---------|
| Does the app open/rotate/ship a logfile itself? | Anti-pattern — emit to stdout instead | Compliant — emission only |
| Is output written unbuffered, one event per line? | Events surface live and routers can split them | Fix buffering / line-orientation |
| Does app code know the archival or index destination? | Boundary violated — make it invisible to the app | Handling correctly externalized |
| Can you just watch the stream in a dev terminal? | Emission model is right | Something is intercepting/writing files in-app |
| Does a router capture and collate every process stream in prod? | Handling layer exists | Add a router before you lose logs |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|--------------|--------------|-----|
| App opens a named logfile and manages the path | Ties the app to a destination; the environment can no longer route freely | ku01 |
| In-app log rotation on size/time | Rotation is the environment's job; the process is doing platform work | ku01 |
| Buffered log writes | Events lag reality; live tailing and prompt alerting break | ku01 |
| App code shipping logs to a fixed archive/index endpoint | Crosses the emission/handling boundary; destinations should be invisible to the app | ku02 |
| A logging dependency that both emits and rotates/ships | Bundles environment concerns into the app; externalize the shipping half | ku02 |
| stdout-only on bare processes with no capturing layer | Streams vanish; you must supply a router (Fluentd/Logplex), not re-add in-app files | ku01 |

## Related decisions
- **12factor-config-in-environment** — this skill says logs must not know their destination; when a
  downstream shipper *does* need a target or credentials, those come from env vars, not app constants.
  Config supplies the shipper's handle; logs stay a naive stdout stream. (logs↔config)
- **12factor-backing-services-as-resources** — a log-indexing system is just another attachable backing
  resource consumed *downstream* of stdout; the app treats it as swappable and never wires to it directly.
- **12factor-stateless-processes** — because each process only streams events and owns no logfile, it
  keeps no local log state, reinforcing disposable, stateless processes.

## Источник
Источник: The Twelve-Factor App — Factor XI: Logs (Treat logs as event streams), 12factor.net
(CC BY 4.0). © the Twelve-Factor authors. Distilled, paraphrased, unreviewed (trust_tier 0). Knowledge
units: 12factor-f11-ku01, 12factor-f11-ku02. Deep reference: references/knowledge-units.md.

## Self-check
- [x] Both listed KUs (ku01 stream-to-stdout, ku02 emission-vs-handling boundary) are covered.
- [x] Decision framed as HOW to handle logs, distinct from config supply and resource attachment.
- [x] Boundary clause points to 12factor-config-in-environment and 12factor-backing-services-as-resources.
- [x] Paraphrased in own words — no verbatim run ≥ 8 words from the source.
- [x] trust_tier 0 (machine-distilled, unreviewed).

## Examples
- «писать логи в файл и ротировать их внутри приложения или отдавать в stdout?» → stream events to
  stdout unbuffered, one per line; drop in-app file opening and rotation — let the execution environment
  capture and route the stream.
- "Our logging library opens app.log and rotates it nightly — is that twelve-factor?" → no; the app is
  doing the environment's job. Emit to stdout and hand capture/rotation/shipping to a router.
- «как собрать логи со всех процессов и воркеров в одном месте?» → don't aggregate inside the app; each
  process just streams to stdout, and a router (Fluentd/Logplex) collates the streams and ships them.
- "Where do search, requests-per-minute graphs, and error-rate alerts belong?" → in a downstream
  log-handling layer (indexer or data warehouse) fed after stdout, never wired into the process itself.
- «у нас голые процессы без платформы, куда денутся логи из stdout?» → they can be lost — stand up a
  capturing router rather than reintroducing in-app logfile management.
