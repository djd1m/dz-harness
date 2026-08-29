---
name: 12factor-config-in-environment
description: >
  Decide WHERE deploy-varying config lives — the environment, not source constants or checked-in
  config files. Covers credentials, backing-service handles (DB, cache), external API keys (S3, X),
  per-deploy hostnames, and the "could this repo go public with zero secrets exposed?" litmus. Also:
  keep every value a granular per-deploy knob, never a named `production`/`staging`/`joes-laptop`
  bundle. NOT for how the app actually CONNECTS to those services once the URL is in env
  (→ 12factor-backing-services-as-resources), NOT for keeping dev and prod similar (→ 12factor-dev-prod-parity).
  Triggers (RU+EN): "где хранить креды и секреты", "config в переменных окружения", "не коммитить
  database.yml", "один билд на все окружения", "should secrets live in env vars or a config file",
  "how to store per-deploy settings", "named environments vs env vars", "could this repo go public".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against Factor III on 12factor.net to promote to Tier 1"
derived_from: [12factor-f3-ku01, 12factor-f3-ku02]
---

# Config in the environment — store what varies per deploy in env vars, not in code

## Decision
**Where to store config that varies between deploys** — put it in OS environment variables, keep it
out of the code, out of source constants, and out of checked-in (or gitignored) config files. A second,
coupled choice: manage each value as an independent per-deploy variable, never as a named
`development`/`production`/`staging` bundle.

Draw the line first: **config = anything expected to differ from one deploy to the next**. The build
artifact stays byte-identical as it is promoted across environments; only the surrounding env vars flip.
Internal wiring that is the same on every deploy (route tables, DI/bean wiring) is *not* config and
stays in code.

## Protocol

1. **Classify each value.** Ask: does it change between staging, production, and a developer laptop? If
   yes → config → externalize. If it is identical on every deploy → it is code, leave it in the repo.
2. **Route config to environment variables.** Backing-service handles (database URL, Memcached host),
   external API keys (Amazon S3, X/Twitter), and per-deploy settings (the deploy's canonical hostname)
   go into env vars — flipped per deploy with zero code edits.
3. **Reject the two tempting-but-wrong stores:**
   - source constants baked into the build (can't vary per deploy);
   - config files committed to the repo, even gitignored ones (e.g. a Rails `database.yml`) — they leak
     by accident, sprawl across formats and locations, and tie you to one language/framework.
4. **Keep it granular, not bundled.** Treat every variable as its own knob. Do not batch values into
   named-environment profiles; each new deploy would force a new profile, and personal variants
   (`qa`, `joes-staging`, …) multiply combinatorially. Adding a deploy should just mean supplying that
   deploy's own variable values.
5. **Run the litmus test.** Could this repository be made fully public *right now* with no credentials
   exposed? If yes, config is correctly externalized. If not, something secret is still in the tree.
6. **Layer more only when scale demands it.** Env vars alone give per-deploy flipping and low
   accidental-commit risk, but not rotation, encryption-at-rest, or audit — add a secrets manager on top
   when those matter.

### Criteria / litmus table

| Question | If yes → | If no → |
|----------|----------|---------|
| Does the value differ between deploys? | It is **config** → env var | It is **code** → stays in repo |
| Would committing it leak a secret? | Must live in the environment | Safe either way, still prefer env for deploy-varying values |
| Can the repo go fully public with zero creds exposed? | Config is externalized correctly | Secret still in tree — pull it into env |
| Does adding a deploy force a new named profile? | Anti-pattern — go granular per-var | Granular model, healthy |
| Do you need rotation / encryption-at-rest / audit? | Add a secrets manager over env vars | Plain env vars suffice |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|--------------|--------------|-----|
| Hardcoding credentials/hosts as source constants | Same build can't be promoted across deploys; secrets ship in the artifact | ku01 |
| Committing a config file (even gitignored, e.g. `database.yml`) | Leaks into the repo by accident; format/location sprawl; language lock-in | ku01 |
| Using a language-specific mechanism like Java System Properties as the standard | Not OS/language-neutral; env vars are the portable standard | ku01 |
| Treating route/DI wiring as "config" to externalize | That is identical per deploy — it is code, not config | ku01 |
| Grouping config into named `production`/`staging`/`dev` bundles | Every new deploy needs a new profile; personal variants explode combinatorially → fragile releases | ku02 |
| Assuming env vars alone give rotation/audit | They flip per-deploy but don't encrypt, rotate, or audit; needs a secrets layer at scale | ku01 |

## Related decisions
- **12factor-backing-services-as-resources** — this skill decides *where the connection string lives* (an env var);
  backing-services governs how the app treats the resource behind it as an attachable, swappable
  resource. Config supplies the handle; backing-services consumes it. (config↔backing-services)
- **12factor-dev-prod-parity** — granular per-deploy env vars are what let dev, staging, and prod stay
  close while differing only in their values; parity is the goal, per-deploy config is a lever for it.
- **12factor-build-release-run-separation** — a release is a build plus its config; keeping config in the
  environment is what lets one immutable build become many releases.

## Источник
Источник: The Twelve-Factor App — Factor III: Config (Store config in the environment),
12factor.net (CC BY 4.0). © the Twelve-Factor authors. Distilled, paraphrased, unreviewed
(trust_tier 0). Knowledge units: 12factor-f3-ku01, 12factor-f3-ku02. Deep reference:
references/knowledge-units.md.

## Self-check
- [x] Both listed KUs (ku01 config-in-env, ku02 granular-not-bundled) are covered.
- [x] Decision framed as WHERE config lives, distinct from HOW services are consumed.
- [x] Boundary clause points to 12factor-backing-services-as-resources and 12factor-dev-prod-parity.
- [x] Paraphrased in own words — no verbatim run ≥ 8 words from the source.
- [x] trust_tier 0 (machine-distilled, unreviewed).

## Examples
- «где держать пароль к базе и ключ S3 — в конфиге в репозитории или в переменных окружения?» → env
  vars; run the "could the repo go public right now?" litmus; warns that even a gitignored
  `database.yml` leaks and locks you to one framework.
- "Should we keep a `production.env` and `staging.env` committed, or something else?" → don't bundle
  config into named-environment files; make each value a granular per-deploy variable so adding a deploy
  just supplies its own values.
- «один и тот же билд надо катить на staging и prod без пересборки — как?» → move everything that varies
  per deploy into env vars so the build artifact stays identical and only the environment flips.
- "Is the Rails routes file config I should externalize?" → no; routing is identical on every deploy, so
  it is code, not config — leave it in the repo.
