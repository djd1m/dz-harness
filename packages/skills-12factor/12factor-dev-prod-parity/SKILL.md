---
name: 12factor-dev-prod-parity
description: >
  Decide how far your DEVELOPMENT, STAGING and PRODUCTION environments are allowed to DIVERGE, and
  choose to keep the three DEV/PROD GAPS small so continuous deployment stays cheap. The gaps are:
  the TIME gap (code-written → code-shipped, weeks vs hours), the PERSONNEL gap (do the authors of a
  change also deploy and watch it, or is it thrown over the wall to ops), and the TOOLS gap (does the
  local toolchain — OS, web server, datastore, versions, backing-service TYPE — mirror production, or
  run a lightweight substitute like SQLite-on-laptop vs Postgres-in-prod). The PARITY / gap-management
  model ONLY — NOT how config/credentials are externalized (→ 12factor-config-in-environment), NOT the
  attached-resource swap/coupling model for a single dependency (→ 12factor-backing-services-as-resources).
  Triggers (RU+EN): "работает у меня, падает на проде", "стоит ли гонять SQLite локально а Postgres в
  проде", "насколько dev должен совпадать с prod", "хотим катить фичи в прод по несколько раз в день",
  "environment parity", "keep dev and prod the same", "works on my machine but breaks in production",
  "should staging match production", "why does prod behave differently from local".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net Factor X to promote to Tier 1"
derived_from: [12factor-x-ku01, 12factor-x-ku02]
---

# 12-Factor Dev/Prod Parity — keep dev and prod similar by shrinking the time, personnel and tools gaps

## Decision
How much drift between your development and production environments will you tolerate — and how do
you manage the gap between the two?

**Choice: deliberately keep dev and prod as SIMILAR as feasible by compressing three distinct gaps
at once, so continuous deployment stays low-friction.** The three axes:
- **Time gap** — how long a change waits between being written and reaching production.
- **Personnel gap** — whether the people who wrote the change are the ones who deploy it and watch it
  run live.
- **Tools gap** — how closely the local stack (OS, web server, datastore, versions, and especially
  the TYPE of each backing service) resembles the production stack.

The traditional app lets all three widen; a twelve-factor app narrows them on purpose. Zero gap is
neither realistic nor the target — the goal is to keep each gap small enough that "it passed locally"
is a trustworthy signal about production.

## Protocol
1. **Shrink the time gap.** Aim for a change to reach production within hours or minutes of being
   written, not weeks or months. Fast, frequent deploys are the design target; anything that forces a
   long batch-and-wait cycle works against parity.
2. **Shrink the personnel gap.** The author of a change stays hands-on through its deployment and
   observes its live behaviour, instead of handing it to a separate ops team to ship blind.
3. **Shrink the tools gap.** Run each backing service at an identical version and type across every
   environment — every developer laptop, staging, and production. Resist the temptation to run a
   lightweight substitute locally (e.g. SQLite or in-process caching) while production runs a heavier
   service (e.g. Postgres, Memcached): even small behavioural differences let code pass in dev and
   staging, then break in prod.
4. **Make parity affordable.** Modern package managers (Homebrew, apt-get) make services like
   Postgres, Memcached, and RabbitMQ trivial to install locally; declarative provisioning (Chef,
   Puppet) and lightweight VMs/containers (Docker, Vagrant) let a local box closely mirror prod.
5. **Do not trust adapter portability as a substitute.** An ORM or adapter that can target
   MySQL/Postgres/SQLite makes swapping FEEL safe, but the abstraction hides exactly the
   incompatibilities that bite in production. Portability of the client is not parity of the service —
   run the real service locally.
6. **Diagnose with the litmus table.** If your answers land in the "traditional app" column, the
   setup is fighting continuous deployment.

**Criteria / litmus table**

| Gap | Traditional app (fighting CD) | Twelve-factor app (parity) | If you're on the left |
|---|---|---|---|
| **Time** | Deploys spaced weeks or months apart | Deploys within hours/minutes of writing code | Long feedback loop; regressions surface late |
| **Personnel** | Separate authors and deployers; code thrown over the wall to ops | Same people write, deploy, and watch it run | Authors never see how their change behaves live |
| **Tools** | Environments allowed to drift; lightweight local substitute vs heavy prod service | Same backing-service type + version everywhere | "works on my machine" failures reach production |

**Boundary:** some latency, specialization, and tooling difference is unavoidable, so zero gap is not
the aim. Certain production services (large managed clusters, proprietary cloud offerings, expensive
licensed systems) cannot be reproduced on a laptop — fall back to a nearest-equivalent or a shared
staging instance. In regulated or safety-critical domains, deliberate separation of duties and a
slower cadence may be mandated, which legitimately trades against the time and personnel gaps here.

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|---|---|---|
| SQLite (or in-process cache) on the laptop, Postgres/Memcached in prod | Behavioural drift lets code pass locally and break in production | ku02 |
| Batching changes into a release that ships weeks after it was written | Wide time gap delays feedback and stacks up risky diffs | ku01 |
| Authors hand finished code to a separate ops team and never watch it deploy | Wide personnel gap: nobody who understands the change sees it run live | ku01 |
| Trusting an ORM/adapter's portability instead of running the real service locally | The adapter hides the exact incompatibilities that surface in prod | ku02 |
| Letting each environment's OS / web server / datastore versions drift freely | Divergence accumulates until "works on my machine" is meaningless | ku01 |

## Related decisions
- `12factor-backing-services-as-resources` (Factor IV) — that skill governs how LOOSELY the code
  binds to a single dependency (swap via config, local≡vendor); THIS skill says the TYPE/version of
  that dependency must be the SAME across every environment. Parity↔backing-services: loose binding
  lets you swap, parity says don't swap the *implementation* between dev and prod.
- `12factor-config-in-environment` (Factor III) — externalized config is what lets one codebase run
  in dev and prod at all; this skill decides how alike those environments themselves must be.
- `12factor-build-release-run-separation` (Factor V) — a fast, repeatable build→release→run pipeline
  is the mechanism that keeps the *time* gap small.

## Источник
Источник: The Twelve-Factor App — Factor X. Dev/prod parity, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors. Deep reference: references/knowledge-units.md.
KUs: 12factor-x-ku01 (three-gaps decision framework), 12factor-x-ku02 (identical backing services across deploys).

## Self-check
- [x] Every criterion traces to a listed KU (ku01/ku02)?
- [x] Boundary clause distinguishes this from config storage and the backing-service swap model?
- [x] No verbatim run ≥ 8 words from the source (prose paraphrased in own words)?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «работает у меня локально, но на проде отваливается — почему?» → most often a tools-gap problem:
  dev runs a lighter substitute than prod. Run the same backing-service type and version everywhere so
  local success predicts production behaviour.
- "should we keep SQLite for local dev and Postgres in production for speed?" → no — the drift between
  the two lets bugs pass locally and break in prod; install Postgres locally (it's cheap via Homebrew/
  apt-get or a container) so every deploy runs the same service.
- «хотим катить в прод несколько раз в день, но релиз готовится неделями» → compress the time gap:
  small changes deployed within hours, with the authors watching them go live, not a separate ops team.
- "our ORM lets us swap MySQL/Postgres/SQLite, so does the local DB even matter?" → yes — adapter
  portability hides exactly the incompatibilities that bite in prod; parity means running the real
  production service locally, not relying on the abstraction.
