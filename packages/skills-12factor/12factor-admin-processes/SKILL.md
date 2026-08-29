---
name: 12factor-admin-processes
description: >
  Decide HOW to run a one-off admin/management task — migrations, backfills, data fixes, a REPL to
  inspect live models — as a short-lived one-off process against a specific release, using the app's
  exact codebase, config, and dependency isolation. Covers `rake db:migrate` / `manage.py migrate`,
  committed fix scripts, and the "same runtime as the web dyno" litmus. NOT for the long-running
  web/worker process types themselves (→ 12factor-stateless-processes), NOT for how the build/release/run
  stages are separated (→ 12factor-build-release-run-separation). Triggers (RU+EN): "как запустить
  миграцию против прода", "REPL к живой базе в том же окружении", "разовый скрипт для фикса данных",
  "куда положить one-off script", "how do I run a database migration safely", "run a one-off admin task",
  "should I run this cleanup script from my laptop or the release".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
trust_tier_path: "Human-review against Factor XII on 12factor.net to promote to Tier 1"
derived_from: [12factor-f12-ku01]
---

# Admin processes — run one-off management tasks in an identical environment

## Decision
**How to run a one-off admin/management task** (a migration, a backfill, a data-cleanup script, or a
REPL session against the live app) — run it as its own short-lived, one-off process bound to a specific
release, executing the *same* codebase and config and using the *same* dependency-isolation mechanism as
the app's regular web/worker process types.

Split the work into two categories first: the long-running process types that serve ongoing operations
(HTTP requests, background workers) versus the throwaway admin tasks that run once and exit. Admin tasks
are not a special environment — they are just another process launched against the deployed release.

## Protocol

1. **Classify the task.** Is it a one-time or occasional management action (schema change, backfill, data
   repair, live inspection) rather than steady-state serving? If yes → run it as a one-off process, not
   baked into the app and not from an unrelated machine.
2. **Bind it to a release.** The task must execute against the same release (codebase + config) as the
   regular processes currently running, so it can never drift out of sync with the deployed app.
3. **Reuse the app's dependency isolation.** Launch it through the identical isolation mechanism the app
   uses for its other process types — the same vendored interpreter or bundler, not a different runtime
   or dependency set.
4. **Commit one-time scripts.** Any ad hoc script (e.g. a data-fix) lives in the repo alongside the app,
   never run from an arbitrary local copy that no one else can reproduce.
5. **Choose the launch mechanism by location.** Locally, run the one-off process straight from a shell in
   the app's checkout directory. In production, launch it through SSH or whatever remote command runner
   the deploy platform provides — still against the deployed release.

### Criteria / litmus table

| Question | If yes → healthy | If no → factor violated |
|----------|------------------|-------------------------|
| Does the task run against the same release (code + config) as the live processes? | One-off process is in sync | It can drift from what is actually deployed |
| Does it use the same dependency isolation as the web/worker types? | Reuses the app's runtime | Different runtime/deps reintroduce mismatch bugs |
| Is the one-time script committed to the repo? | Reproducible for everyone | A local-only copy is unauditable and unrepeatable |
| Litmus: if web starts via `bundle exec thin start`, does migrate run via `bundle exec rake db:migrate`? | Same bundler/interpreter → pass | Launched through another runtime → fail |

## Anti-patterns

| Anti-pattern | Why it fails | KU |
|--------------|--------------|-----|
| Running a migration or fix from a developer laptop against a different codebase/config | Diverges from the deployed release → environment-mismatch bugs | ku01 |
| Invoking the admin command through a runtime or dependency set unlike the app's | Breaks dependency-isolation parity; the task sees a different world than the app | ku01 |
| Keeping the one-time cleanup script only on one machine, uncommitted | Not reproducible, not reviewable, disappears after the run | ku01 |
| Baking admin logic into the always-on app instead of a discrete one-off process | Blurs the two process categories; recurring/long-running jobs are not one-off admin runs | ku01 |

## Related decisions
- **12factor-stateless-processes** — that skill governs the long-running web/worker process *formation*;
  this one covers the throwaway one-off admin runs. Same execution model (a process against a release),
  different lifetime. (processes↔admin-processes)
- **12factor-build-release-run-separation** — an admin task binds to a specific *release* (build + config);
  this skill relies on that release identity so the one-off run matches exactly what is deployed.
- **12factor-explicit-dependencies** — the "same dependency isolation" criterion is exactly the vendored
  interpreter/bundler from explicit dependencies, reused for admin runs instead of a stray global runtime.
- **12factor-config-in-environment** — the one-off process reads the same env-var config as the live
  processes, which is what keeps it from drifting.

## Источник
Источник: The Twelve-Factor App — Factor XII (Admin processes), 12factor.net (CC BY 4.0). © the
Twelve-Factor authors. Distilled, paraphrased, unreviewed (trust_tier 0). Knowledge unit:
12factor-f12-ku01. Deep reference: references/knowledge-units.md.

## Self-check
- [x] The listed KU (ku01 admin-tasks-as-one-off-processes) is covered.
- [x] Decision framed as HOW to run one-off admin tasks in an identical environment.
- [x] Boundary clause points to 12factor-stateless-processes and 12factor-build-release-run-separation.
- [x] Paraphrased in own words — no verbatim run ≥ 8 words from the source.
- [x] Facts (`rake db:migrate`, `manage.py migrate`, `bundle exec`, vendored interpreter, SSH) kept accurate.
- [x] trust_tier 0 (machine-distilled, unreviewed).

## Examples
- «нужно накатить миграцию схемы на прод — запускать со своего ноутбука или как-то иначе?» → run it as a
  one-off process against the deployed release, via SSH/remote runner, using the same bundler/interpreter
  as the web process (`bundle exec rake db:migrate` if web is `bundle exec thin start`) — never from an
  out-of-sync local copy.
- "I want to open a REPL to inspect and fix live model data — how do I do it without drift?" → launch the
  console as a one-off process on the same release, with the app's vendored runtime and config, so it sees
  exactly what production sees.
- «есть разовый скрипт fix_bad_records — куда его положить и как гонять?» → commit it into the repo and run
  it as a one-off process (`php scripts/fix_bad_records.php`) against the release, not from an ad hoc file
  living only on one machine.
- "Python app on Virtualenv — how do I run a `manage.py migrate` so it matches the web server?" → invoke
  the vendored `bin/python` for the management command just as the web server does, keeping the same
  dependency isolation for both.
