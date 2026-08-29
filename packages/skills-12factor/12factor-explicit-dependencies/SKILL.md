---
name: 12factor-explicit-dependencies
description: >
  Decide HOW third-party libraries and OS-level tools are made available to an app: a complete dependency
  manifest checked into the repo PLUS a runtime isolation/sandbox tool — never leaning on whatever packages
  or CLI utilities happen to be pre-installed on the host. Declaration AND isolation together; vendor
  shelled-out binaries (ImageMagick, curl) instead of assuming they exist. NOT for injecting values that
  vary per deploy — that is config in the environment (→ 12factor-config-in-environment); NOT for attaching to databases,
  queues, or SMTP as swappable resources (→ 12factor-backing-services-as-resources).
  Triggers (RU+EN): "работает у меня локально но падает на CI", "нужен ли requirements.txt / Gemfile",
  "as-yet новая машина клонирует репо и всё ставится одной командой", "приложение вызывает imagemagick/curl —
  надо ли вендорить", "как изолировать зависимости", "pin dependencies", "why does it break on a fresh box",
  "do I need a virtualenv / bundler", "vendoring system tools", "explicit dependency manifest".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net Factor II to promote to Tier 1"
derived_from: [12factor-ii-ku01, 12factor-ii-ku02]
---

# Explicitly declare and isolate dependencies — pick a repo-owned manifest + runtime isolation, never the host's ambient packages

## Decision
How to make an app's third-party libraries (and any external command-line tools it calls) available at
build and run time. The twelve-factor stance: **declare every dependency explicitly in a manifest that
lives in the repository, and isolate the app at runtime so nothing ambient on the host leaks in.** Two
mechanisms are mandatory *together* — a declaration (the manifest) and an isolation step (a sandbox/scoping
tool). Doing only one does not satisfy the factor. The same declared set is applied identically in
development and in production. External binaries you shell out to are treated as dependencies too: bring a
known-good copy inside the app rather than trusting the OS to supply it.

## Protocol

1. **Write a manifest, completely and precisely.** List *every* library the code imports, in a file that
   is committed to version control. No dependency may be satisfied merely because some machine already has
   it installed. (Ruby → `Gemfile`; Python → Pip requirements; Node → `package.json`; C → Autoconf.)
2. **Add a runtime isolation step.** Pair the manifest with a tool that scopes the app's dependencies so
   the surrounding system's packages cannot bleed in. (Ruby → `bundle exec`; Python → Virtualenv; C →
   static linking.) Declaration without isolation, or isolation without a manifest, both fail the factor.
3. **Apply the same set to every environment.** The declared dependencies used in production are exactly
   those used in development — no "prod also happens to have X" assumptions.
4. **Vendor shelled-out system tools.** If the app spawns an OS binary (image processors, HTTP fetchers,
   etc.), ship a controlled copy of that tool with the app so its presence *and its version* are fixed by
   the repo, not by the host.
5. **Run the litmus test on a bare machine** before trusting the setup (see table).

### Criteria / litmus table

| Question to ask | Passing answer | Failing signal |
|-----------------|----------------|----------------|
| Is every library named in a committed manifest? | Yes — nothing relies on a pre-installed package | "It imports fine because this box already had it" |
| Is there a runtime isolation/scoping tool in play? | Yes — a sandbox stops system packages leaking in | Manifest exists but the global site-packages are still visible |
| Do dev and prod use the same declared set? | Identical declaration in both | Prod quietly carries extra ambient packages |
| Does the app call any OS command-line tool? | If yes, that tool is vendored into the app | It assumes ImageMagick/curl are on every host |
| **The bare-machine test:** a new dev clones the repo onto a machine with only the language runtime + package manager, runs one deterministic build command | Working setup, nothing else assumed present | Extra manual "first install X and Y" steps needed |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|--------------|--------------|-----|
| Relying on a library because the host happens to have it installed | Breaks silently on a new machine, on onboarding, or when promoting dev→prod | ku01 |
| Shipping a manifest but no isolation | Ambient system packages still leak into the app; version conflicts reappear | ku01 |
| Isolating at runtime but with no committed manifest | Nothing reproducibly describes what to install | ku01 |
| Letting dev and prod carry different implicit dependency sets | "Works in dev" tells you nothing about prod | ku01 |
| Calling out to ImageMagick / curl and trusting the OS to provide them | A future host may lack the tool, or ship an incompatible version | ku02 |
| Assuming a CLI utility is "universal and stable enough" to skip vendoring | No such guarantee holds across every future/provisioned machine | ku02 |

## Related decisions
- **12factor-config-in-environment** — this factor pins *what code* is present; config pins *what per-deploy values* it
  reads. Keep credentials and environment-specific values in the environment, not baked into vendored deps.
- **12factor-backing-services-as-resources** — a vendored driver/library is declared here; the *running resource* it
  talks to (DB, cache, queue, SMTP) is an attachable backing service, swappable via config.
- **12factor-build-release-run-separation** — the declared manifest is resolved and vendored during the **build**
  stage, producing a self-contained artifact; this factor is what makes that build reproducible.
- **12factor-dev-prod-parity** — applying the identical declared dependency set to dev and prod is a
  concrete instance of keeping the two environments as similar as possible.

## Источник
Источник: The Twelve-Factor App — II. Dependencies (Explicitly declare and isolate dependencies),
12factor.net (CC BY 4.0), © the Twelve-Factor App authors. Paraphrased/restructured derivative, no
verbatim runs. Deep reference: references/knowledge-units.md.

## Self-check
- [x] Both mechanisms (declaration + isolation) are stated as jointly required.
- [x] The bare-machine / one-command litmus test is captured.
- [x] Vendoring of shelled-out OS tools is covered (ku02).
- [x] Boundary clauses point config and backing-services to their sibling skills.
- [x] trust_tier 0 (machine-distilled, unreviewed); no source sentence copied ≥ 8 words.

## Examples
- «Работает локально, но на CI падает с ModuleNotFoundError» → the missing lib was ambient on the dev box;
  add it to a committed manifest and run under an isolation tool (virtualenv/bundler), then re-test on a
  clean image.
- "Do I really need a Gemfile if the server already has the gems?" → yes: declare them + `bundle exec`, so
  a fresh clone builds with one command and prod stops depending on pre-installed gems.
- «Наше приложение зовёт imagemagick через subprocess — этого достаточно?» → no; vendor a known-good
  ImageMagick copy so its presence and version are controlled by the repo, not the host.
- "New hire needs two days to get the app running" → failing the bare-machine litmus test; the setup relies
  on undocumented pre-installed packages/tools — move them into the manifest and vendor the binaries.
