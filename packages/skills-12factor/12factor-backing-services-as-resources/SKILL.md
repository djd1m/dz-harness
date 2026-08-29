---
name: 12factor-backing-services-as-resources
description: >
  Decide how tightly your code should know its BACKING SERVICES — databases, queues, caches,
  SMTP relays, blob stores, metrics collectors, external APIs. Treat each networked dependency as
  an ATTACHED RESOURCE reached only through a locator (URL + credentials) held in config, so it can
  be swapped or relocated with zero code change; local and vendor-hosted equivalents stay
  indistinguishable to the app. The COUPLING/swap model ONLY — NOT where the connection string and
  secrets physically live (→ 12factor-config-in-environment), NOT how deps are declared/installed
  (→ 12factor-explicit-dependencies).
  Triggers (RU+EN): "как подключиться к базе данных", "захардкодить ли connection string",
  "перенести на managed RDS без правки кода", "локальный SMTP или Postmark", "поменять кэш на лету",
  "how do I connect to the database", "swap local MySQL for managed RDS", "should the queue URL be
  hardcoded", "attach S3/Twilio/Postmark as a resource", "failover a broken database without redeploy".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net Factor IV to promote to Tier 1"
derived_from: [12factor-iv-ku01, 12factor-iv-ku02]
---

# 12-Factor Backing Services — every networked dependency is an attached resource, swappable via config

## Decision
How should your code treat the databases, queues, caches, SMTP relays, blob stores, metrics
collectors, and third-party APIs it talks to over the network?

**Choice: model each one as an independent RESOURCE that is merely *attached* to a running deploy,
never baked into it.** The app reaches every dependency only through a locator — a URL, connection
string, or credential pair — that lives in config. Because the binding is loose, a resource can be
attached, detached, or replaced live without editing or redeploying source. Self-hosted and
vendor-managed equivalents are reached the same way, so the code cannot tell them apart.

## Protocol
1. **Enumerate every networked dependency** the app uses during normal operation: relational/NoSQL
   datastores (MySQL, CouchDB), message queues (RabbitMQ, Beanstalkd), caches (Memcached), outbound
   mail (Postfix, Postmark), plus metrics/asset/API services (New Relic, S3, Twitter/Twilio-style APIs).
2. **Give each one a locator in config**, never a value hardcoded in source. The locator carries
   host, port, and credentials — nothing about the dependency leaks into the code itself. (Where and
   how that config is stored is a separate decision → `12factor-config-in-environment`.)
3. **Count each independent endpoint as its own resource.** Two MySQL instances used for app-layer
   sharding are two resources, not one — each gets its own handle.
4. **Erase the local-vs-vendor distinction.** Self-run and SaaS equivalents must both be plain
   attached resources; the code path is identical.
5. **Prove looseness with the swap tests** below. If any swap forces a source edit, the dependency
   is still baked in, not attached.

**Criteria / litmus table**

| Test | What must be true | If it fails |
|---|---|---|
| **Locator-only reach** | Code touches the dependency solely through a handle from config (no hardcoded host/creds in source) | Dependency is baked in, not attached |
| **Vendor swap** | Replace self-hosted with a managed equivalent (local MySQL → managed RDS-style DB; local SMTP → Postmark) changing *only* the config handle | Not treated as a resource — code is coupled to the specific deployment |
| **Count rule** | Each independent endpoint = one resource (2 shard DBs = 2 handles) | Under-counting hides a hardcoded second connection |
| **Live failover / DR** | Operator can restore a fresh instance from backup, detach the broken one, attach the new one — no code change, no source redeploy | Recovery requires an engineer + deploy, not just ops |

**Boundary:** the swap model holds only when the alternative is protocol-compatible so just the
handle differs. If the replacement exposes materially different semantics or API, a pure config swap
is genuinely impossible and code changes are legitimate — the litmus test rightly fails there rather
than flagging a design smell. In-process libraries or embedded components not reached over the
network are not backing services at all; this framing adds nothing for them.

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| Hardcoding a database host / connection string / API key in source | Relocating or replacing the service now needs a code edit + redeploy | ku01 |
| Treating a self-hosted service and its managed equivalent as different code paths | A migration from local to managed (or back) can't be a pure config change | ku02 |
| Counting two sharded MySQL instances as "one database" | The second endpoint ends up hardcoded or mis-configured; it needs its own handle | ku01 |
| DR runbook that requires an engineer to change code when a DB dies | Restore-detach-attach should be an ops action on config, not a source deploy | ku02 |
| Bespoke, deep code integration where a simple handle would do | Loses the attach/detach-at-will property; the resource is welded to the app | ku01 |

## Related decisions
- `12factor-config-in-environment` (Factor III) — this skill says the locator lives *in config*;
  that skill decides *how* config (incl. these credentials) is externalized. Config↔backing-services:
  externalized config is a prerequisite for a clean resource swap.
- `12factor-explicit-dependencies` (Factor II) — declaring/installing the client libraries you use
  to *reach* these resources; distinct from how loosely you *bind* to the running service.
- `12factor-disposability-fast-startup` (Factor IX) — the live restore-detach-attach failover here relies on
  processes that start and stop fast and tolerate resources appearing/disappearing.
- `12factor-stateless-processes` (Factor VI) — state that would otherwise live in-process is pushed
  into exactly these attached backing services.

## Источник
Источник: The Twelve-Factor App — Factor IV. Backing services, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors. Deep reference: references/knowledge-units.md.
KUs: 12factor-iv-ku01 (attached-resource framing), 12factor-iv-ku02 (local≡third-party litmus test).

## Self-check
- [x] Every criterion traces to a listed KU (ku01/ku02)?
- [x] Boundary clause distinguishes this from config storage and dependency declaration?
- [x] No verbatim run ≥ 8 words from the source (prose paraphrased in own words)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «как правильно подключиться к базе — захардкодить строку или вынести?» → put the connection string
  in config, reach the DB only through that handle; the DB becomes an attached resource you can
  relocate without a code change.
- "we want to move from our self-hosted MySQL to a managed RDS-style database" → if the swap is more
  than editing one config handle, the app was coupled to the deployment; fix the coupling so vendor
  and self-hosted are indistinguishable.
- «база упала из-за железа, как поднять новую без релиза?» → restore from backup, detach the broken
  instance, attach the fresh one — all as a config/ops action, no source redeploy.
- "should each of our two shard databases get its own connection config?" → yes — each independent
  endpoint is its own resource, so two shards = two handles, never one.
