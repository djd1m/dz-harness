---
name: 12factor-build-release-run-separation
description: >
  How a codebase turns into a running deployment: split it into three strictly ordered, one-way
  stages — BUILD (compile a versioned commit + its dependencies into an artifact), RELEASE (bind that
  exact build to the current config, stamped with a unique immutable release id), and RUN (just launch
  the processes against a chosen release). Covers immutable append-only releases, symlink/Capistrano-style
  rollback, and pushing complexity left into build so run stays boring and safe to trigger unattended.
  NOT for where config values come from or how they are stored (→ 12factor-config-in-environment); NOT
  for how running processes stay stateless/share-nothing (→ 12factor-stateless-processes); NOT for fast
  startup/graceful shutdown mechanics (→ 12factor-disposability-fast-startup). Triggers (RU+EN): "build release run",
  "стадии деплоя", "как устроить пайплайн деплоя", "immutable releases", "неизменяемые релизы",
  "rollback через симлинк", "откат релиза", "почему нельзя править код на проде", "release management",
  "разделить сборку и запуск".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against 12factor.net Factor V to promote to Tier 1+"
derived_from: [12factor-v-ku01, 12factor-v-ku02, 12factor-v-ku03]
---

# Build, release, run — structure the deploy lifecycle as three one-way stages

## Decision
How should a codebase become a running deployment? Model it as **three distinct, ordered, one-directional
stages** and enforce hard walls between them:

1. **Build** — take the code at one specific committed version, fetch its dependencies, and compile
   binaries and assets into a single executable bundle (the *build artifact*).
2. **Release** — combine that exact build with the deploy's current config to form a *release* that is
   ready to run as-is in the target environment. Every release gets a unique, immutable id.
3. **Run** (runtime) — launch the application's processes against one chosen release.

Code (build) and config (release) meet **only** at the release stage; the run stage merely executes.
The transformation flows one way — you can never push a runtime change back into build.

## Protocol

**Stage the pipeline.**
1. Pin a **committed version** of the code before building — no building from a dirty or moving tree.
2. In **build**: resolve dependencies, compile, bundle assets → one immutable artifact.
3. In **release**: inject the deploy's config into that artifact; emit a new release with a **unique id**.
   Use a timestamp (e.g. `2011-04-06-20:32:17`) or a monotonically increasing counter (e.g. `v100`).
4. In **run**: pick a release and start the processes — nothing more.

**Make releases an append-only ledger.**
- A release, once cut, is **frozen** — never edit it in place.
- *Any* change — new code or new config — must produce a **brand-new release**, never mutate an old one.
- Because release ids never get reassigned, rollback is trivial: point the runtime back at a known-good
  prior release. Tools like Capistrano keep releases in a directory and flip a symlink at the active one,
  so rollback is an instant symlink swap.

**Push complexity left; keep run lean.**
- Builds are kicked off deliberately by a developer who is watching, so errors surface in the foreground —
  the build stage can afford to be elaborate.
- The run stage can fire on its own (a reboot, a process manager relaunching a crashed worker) at 3 a.m.
  with nobody watching — so minimize its moving parts.
- Run-stage checklist: **no** dependency fetching, **no** asset compilation, **no** config resolution
  beyond reading a prepared release — just start the processes.

**Criteria / litmus table**

| Criterion | Passes when | Fails (separation broken) when |
|-----------|-------------|--------------------------------|
| Three stages exist | build → release → run are separate, named steps | build and run blur into one script with no release boundary |
| One-way flow | a runtime edit has no path back into build | you can hot-patch live code on the server |
| Config meets code only at release | build has zero secrets/config baked in | config is compiled into the build artifact |
| Immutable release id | every release has a unique frozen id | you can change what a given release id points to |
| Trivial rollback | flip to a prior release id/symlink | rollback means re-running the whole pipeline by hand |
| Lean run stage | run only launches processes | run fetches deps / compiles assets / resolves config |

## Anti-patterns
| Anti-pattern | Why it fails |
|--------------|--------------|
| Editing code directly on a live server | There is no channel to feed the edit back through build → the change is lost on next deploy and the stages are no longer separated |
| Mutating an existing release in place | Destroys the audit trail and makes rollback unreliable — the same id now means two different things |
| Baking config/secrets into the build | Collapses the release-stage injection; one build can no longer be promoted across environments (violates config separation) |
| Fat run stage (compile/fetch/resolve at launch) | Multiplies the things that can break during an unattended 3 a.m. restart |
| No release ids, or reusable ids | Rollback and auditing lose their guarantees — you can't say what ran when |
| Keeping every release forever with no pruning | Immutable releases accumulate; without a retention policy storage bloats |

## Related decisions
- **12factor-config-in-environment** (Factor III) — the release stage assumes config lives *outside* the
  build; if config is stored in the codebase, the build↔config wall at the release stage collapses.
- **12factor-stateless-processes** (Factor VI) — the run stage executes the release as stateless
  processes; immutable releases pair with share-nothing runtime.
- **12factor-disposability-fast-startup** (Factor IX) — a lean run stage enables the fast startup / graceful shutdown
  that lets a crashed process (or a rollback) relaunch instantly.
- **12factor-backing-services-as-resources** (Factor IV) — config injected at release time is what points each
  release at its attached databases/queues as swappable resources.

## Источник
Источник: The Twelve-Factor App — V. Build, release, run, 12factor.net (CC BY 4.0), © the Twelve-Factor
authors. Paraphrased and restructured; no verbatim runs. Deep reference: `references/knowledge-units.md`.

## Self-check
- [x] Every step traces to a listed KU (3 KUs: stage-split, immutable-ledger, complexity-left)?
- [x] No verbatim run ≥ 8 words from the source?
- [x] Boundary clause names the sibling factors it is NOT?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «настраиваю деплой — как правильно разложить его на этапы?» → build (собрать артефакт из зафиксированного
  коммита + зависимостей) → release (вшить текущий конфиг, выдать уникальный id) → run (просто запустить
  процессы); правки на живом сервере запрещены — их некуда протолкнуть обратно через build.
- "how do I make rollback reliable?" → give every release a unique, immutable id and never mutate a
  release; keep releases as an append-only ledger and flip the active pointer (Capistrano-style symlink)
  back to a known-good release.
- «почему приложение падает по ночам после рестарта?» → run-стадия слишком тяжёлая; вынеси установку
  зависимостей, компиляцию ассетов и разрешение конфига в build, оставь run только запуск процессов.
- "can I just hot-patch the bug on prod?" → no — that breaks build/release/run separation; make a new
  commit, cut a new build and a new release, and deploy that.
