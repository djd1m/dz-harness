# Knowledge Units — 12factor-dev-prod-parity

Deep-lookup reference for the `12factor-dev-prod-parity` skill. Machine-distilled Knowledge Units
from The Twelve-Factor App, Factor X (Dev/prod parity). Facts and technique-names preserved; prose
paraphrased in our own words.

Источник: The Twelve-Factor App — Factor X. Dev/prod parity, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.

---

## 12factor-x-ku01 — Keep the three dev/prod gaps small for continuous deployment
- **Type:** decision-framework

**Problem.** Applies when a team wants fast, low-friction releases but development and production have
drifted apart. The divergence shows up across three axes: elapsed time from writing code to shipping
it (time gap), whether the people who write code are the ones who deploy and observe it (personnel
gap), and how closely the local toolchain matches production infrastructure (tools gap).

**Content.** The decision this factor encodes is to deliberately compress all three gaps rather than
tolerate them.
- **Time gap** — aim for code reaching production within hours or minutes, not weeks or months.
- **Personnel gap** — the authors of a change should stay hands-on through its deployment and watch
  how it behaves live, instead of throwing code over the wall to a separate ops team.
- **Tools gap** — make dev and prod environments resemble each other as closely as feasible (OS, web
  server, datastore, versions).

Litmus test contrasting a traditional app vs a twelve-factor app: time between deploys measured in
weeks vs hours; separate authors and deployers vs the same people doing both; environments allowed to
diverge vs kept as similar as possible. If your answers land in the left column, the design is
fighting continuous deployment.

**Applicability.** Teams pursuing continuous deployment or frequent releases; organizations deciding
how much to invest in environment parity and how to structure the dev-to-ops handoff; anyone
diagnosing why "works on my machine" failures keep reaching production.

**Limits.** Zero gap is neither the goal nor always achievable — some latency, specialization, and
tooling difference is unavoidable. Very small teams may already have authors deploying their own code
and gain little from formalizing it. In heavily regulated or safety-critical domains, deliberate
separation of duties and slower release cadence can be required, which trades against the time and
personnel gaps this heuristic wants to shrink.

---

## 12factor-x-ku02 — Use identical backing services across every deploy
- **Type:** heuristic

**Problem.** Applies when choosing which database, queue, or cache to run in local/dev and staging
versus production. A common temptation is to run something lightweight locally (for example SQLite on
the laptop, in-process memory for caching) while production runs a heavier, more robust service (for
example PostgreSQL, Memcached).

**Content.** The heuristic: resist swapping backing-service implementations between environments —
every deploy (each developer machine, staging, and production) should run each backing service at an
identical version and type. The rationale is that even minor behavioural differences between two
implementations can let code pass in dev or staging and then break in production; that friction
discourages continuous deployment and accumulates cost across an app's lifetime. This is affordable
in practice because modern package managers (Homebrew, apt-get) make services like PostgreSQL,
Memcached, and RabbitMQ easy to install, and declarative provisioning (Chef, Puppet) plus lightweight
VMs/containers (Docker, Vagrant) let a local environment closely mirror production. Note that adapter
libraries (for example an ORM that can target MySQL, PostgreSQL, or SQLite) make switching feel safe,
but the adapter abstraction hides exactly the incompatibilities that bite in production — so the
adapter is not a substitute for running the real service locally.

**Applicability.** Selecting and provisioning databases, queues, and caches for local development;
setting up staging to match production; onboarding developers who want a quick local setup; deciding
whether an ORM/adapter's portability is enough to justify differing services.

**Limits.** Parity has a cost ceiling: some production services (large managed clusters, proprietary
cloud offerings, expensive licensed systems) cannot be feasibly reproduced on a laptop, so teams fall
back to a nearest-equivalent or a shared staging instance. Version-pinning across all environments
adds maintenance overhead. The rule targets stateful backing services where behavioural drift
matters; it is less critical for stateless components.

---

## Citation

Источник: The Twelve-Factor App — Factor X. Dev/prod parity, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.
