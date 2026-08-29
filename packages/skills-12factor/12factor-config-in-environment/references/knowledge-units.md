# Knowledge Units — 12factor-config-in-environment

Deep-lookup reference for the SKILL.md decision skill. Source: The Twelve-Factor App — Factor III:
Config (Store config in the environment), 12factor.net (CC BY 4.0). Machine-distilled, paraphrased,
unreviewed (trust_tier 0). © the Twelve-Factor authors.

---

## 12factor-f3-ku01 — Store deploy-varying config in environment variables, not code
*type: decision-framework · factor: III · skill_worthiness: high*

**Problem:** Some values differ from one deploy to the next — service credentials, database and cache
handles, per-deploy hostnames. You must decide where they live so a single build can be promoted across
staging, production, and a laptop, and so secrets never leak into the repo.

**Content (paraphrased):** Define config as everything expected to vary between deploys; the code itself
is identical across every deploy. Do not bake such values in as source constants, and do not lean on
config files committed to the repo — even gitignored ones like a Rails `database.yml` still leak by
accident, sprawl across formats and locations, and pin you to a specific language or framework. Put the
values in OS environment variables: they change per deploy without touching code, are far less likely to
be committed by mistake, and are a language- and OS-neutral standard (unlike, for instance, Java System
Properties). Litmus test: could this repository be open-sourced right now with no credentials exposed?
If yes, config is externalized correctly. Typical config includes handles to backing services (database,
Memcached), keys for external APIs (Amazon S3, X), and per-deploy settings such as the deploy's
canonical hostname.

**Applicability:** Deciding where credentials, backing-service handles, and per-environment settings
belong for any app deployed to more than one environment or intended for open-sourcing.

**Limits:** Does not cover internal wiring that is identical on every deploy — e.g. Rails route
definitions or Spring bean wiring — which legitimately stays in code. Env vars by themselves do not
provide secret rotation, encryption at rest, or audit; larger setups typically add a secrets manager on
top.

---

## 12factor-f3-ku02 — Keep env vars granular per deploy, never bundled into named environments
*type: heuristic · factor: III · skill_worthiness: high*

**Problem:** With many config values, it is tempting to batch them under named profiles
(`development`, `test`, `production`, then `staging`, `qa`, `joes-staging`, …). This choice decides
whether config management stays manageable as the number of deploys grows.

**Content (paraphrased):** Reject grouping config into named "environment" bundles tied to particular
deploys. Each new deploy then forces a new named profile, and the set of profiles multiplies
combinatorially as developers spin up personal variants, making releases brittle. Instead, treat every
variable as an independent per-deploy knob managed on its own. This granular model scales cleanly as an
app accumulates deploys over its lifetime: adding a deploy just means supplying that deploy's own
variable values rather than minting a whole new named profile.

**Applicability:** Structuring config for apps that will accumulate multiple or unpredictable numbers of
deploys — per-developer, per-region, or ephemeral preview environments.

**Limits:** For a fixed, tiny set of long-lived environments, full granularity can feel heavier than a
single named-profile file; the payoff grows with deploy count and variety. Granular variables still need
some external tooling or convention to stay organized and documented.

---

## Citation
Источник: The Twelve-Factor App — Factor III: Config (Store config in the environment), 12factor.net
(CC BY 4.0). © the Twelve-Factor authors.
