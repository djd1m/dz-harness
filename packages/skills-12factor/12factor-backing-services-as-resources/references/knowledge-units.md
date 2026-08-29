# Knowledge Units — 12factor-backing-services-as-resources

Deep-lookup reference for the `12factor-backing-services-as-resources` skill. Machine-distilled
Knowledge Units from The Twelve-Factor App, Factor IV (Backing services). Facts and technique-names
preserved; prose paraphrased in our own words.

Источник: The Twelve-Factor App — Factor IV. Backing services, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.

---

## 12factor-iv-ku01 — Treat every backing service as a swappable attached resource
- **Type:** decision-framework

**Problem.** You are wiring an app to its datastores, queues, caches, SMTP relays, or third-party
APIs and must decide how tightly the code should know those services. The question arises for any
dependency consumed over the network during normal operation, when you want to be able to replace or
relocate that service without touching code.

**Content.** Model each distinct networked dependency as an independent resource that is only
*attached* to a running deploy, not welded into it. Examples span datastores (MySQL, CouchDB),
message queues (RabbitMQ, Beanstalkd), outbound mail (Postfix, Postmark), caches (Memcached), and
metrics/asset/API services (New Relic, S3, Twitter-style consumer APIs). Heuristic: the code should
reach every such dependency only through a locator — a URL, credentials, or connection string — that
lives in config, never through values hardcoded in source. Counting rule: each independent endpoint
is its own resource, so two MySQL instances used for app-layer sharding count as two resources, not
one. Because the binding stays loose, resources can be attached and detached at will while the deploy
keeps running.

**Applicability.** Any service the app talks to over the network in normal operation:
relational/NoSQL databases, message queues, caches, SMTP relays, metrics collectors, blob stores,
and external consumer APIs.

**Limits.** Purely in-process libraries or embedded components not accessed over the network are not
backing services, and this framing adds no value for them. The pattern assumes the dependency is
reachable via a locator plus credentials; services that need bespoke code-level integration (rather
than just a handle) fall outside the clean-swap model.

---

## 12factor-iv-ku02 — Local and third-party services must be indistinguishable to the code (litmus test)
- **Type:** heuristic

**Problem.** You must decide whether a self-hosted service and a vendor-managed equivalent should be
handled differently in the codebase — e.g. local MySQL vs a managed RDS-style database, or a local
SMTP daemon vs Postmark. This applies whenever some dependencies are run by your own admins and
others come from third parties.

**Content.** Design so the code cannot tell whether a dependency is locally managed or vendor-hosted;
both are just attached resources reached through a config handle. Litmus test for compliance: you can
swap a self-run service for a third-party equivalent (local MySQL → managed RDS-style DB; local SMTP
→ hosted mail sender) with the *only* change being the resource handle in config — zero edits to
application source. Operational corollary: if a database misbehaves from hardware trouble, an
operator can restore a fresh instance from backup, detach the old one, and attach the new one,
all without a code change or a source redeploy. If either swap forces a code edit, the dependency is
not being treated as an attached resource.

**Applicability.** Mixed environments where some backing services are self-hosted and others are
SaaS/third-party; migration (self-hosted → managed), failover, and disaster recovery where a resource
must be replaced live.

**Limits.** Holds when the alternative is protocol-compatible so only the connection handle differs.
If the replacement exposes a materially different API or semantics, a pure config swap is not
achievable and code changes are unavoidable — the litmus test then legitimately fails rather than
signalling a design smell. Also assumes locators/credentials are already externalized to config
(depends on Factor III).

---

## Citation

Источник: The Twelve-Factor App — Factor IV. Backing services, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.
