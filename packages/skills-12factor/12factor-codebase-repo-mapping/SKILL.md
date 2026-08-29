---
name: 12factor-codebase-repo-mapping
description: >
  Draw the boundary between a CODEBASE, an APP, and a DEPLOY when you set up version control:
  one repo (or one set of shared-root git repos) per app, one-to-one, with many deploys
  (prod, staging, every laptop) running possibly different revisions of that single codebase.
  The repo↔app↔deploy MAPPING and monorepo-vs-polyrepo call ONLY — NOT how each deploy pins its
  library versions (→ 12factor-explicit-dependencies), NOT how per-deploy config/credentials differ
  (→ 12factor-config-in-environment), NOT how a commit becomes a running process via build→release→run
  (→ 12factor-build-release-run-separation).
  Triggers (RU+EN): "один репозиторий или несколько для этого приложения", "monorepo или polyrepo",
  "как разложить сервисы по репозиториям", "два приложения из одного репо — это нормально?",
  "shared codebase between two apps", "map repos to apps", "split this system into services",
  "duplicate code across teams — extract a library?", "сколько репозиториев на приложение".
trust_tier: 0
trust_tier_label: "Machine-distilled from The Twelve-Factor App (CC BY 4.0, unreviewed)"
derived_from: [12factor-i-ku01, 12factor-i-ku02]
---

# 12-Factor Codebase — one codebase per app in version control, many deploys of it

## Decision
How to map code repositories to apps and deploys when you bootstrap a project: keep exactly
**one codebase per app**, tracked in a version control system (git/mercurial/subversion), and let
that single codebase fan out into **many deploys** — production, one or more staging sites, and
every developer's local checkout — each of which may sit on a different revision. This settles the
monorepo-vs-polyrepo and "can two apps share a repo?" arguments at the repo↔app↔deploy boundary.

A "codebase" here is a single repo, or a group of repos that all descend from one root commit.
A "deploy" is any running instance of the app.

## Protocol
1. **Establish the codebase.** Put the app's source under version control. If you have several repos
   that only make sense together (they share a root commit), treat that group as the one codebase.
2. **Enforce the one-to-one mapping.** One codebase corresponds to exactly one app, and one app is
   backed by exactly one codebase. Apply the two litmus tests below before you accept any layout.
3. **Count deploys freely, not codebases.** Spin up as many deploys as you need — prod, staging(s),
   each laptop. They are the *same* app precisely because they draw from the *same* codebase, even
   when their active revisions diverge (a dev holds unmerged commits; staging is ahead of prod).
4. **When two apps want the same code, extract a library.** Do not let them share a codebase.
   Factor the common code into a separate library published through the dependency manager, and have
   each app depend on it (this hands off to the dependencies factor).
5. **When "one app" turns out to have multiple codebases, rename it a system.** It is a distributed
   system of several apps; give each component its own codebase and apply twelve-factor to each.

Restructured criteria / litmus table:

| You observe | Verdict | Corrective action |
|---|---|---|
| One codebase ↔ one app, N deploys on possibly different revisions | ✅ Compliant | Nothing — divergent revisions across deploys are expected |
| More than one codebase feeding a single thing you call "one app" | ❌ It's a distributed system, not an app | Split: each component is its own app with its own codebase, each following twelve-factor |
| One shared codebase feeding two or more apps | ❌ Violates the rule | Extract the shared parts into a library consumed via the dependency manager |
| Same app, but prod, staging, and laptops hold different commits | ✅ Normal | These are just distinct deploys of the one codebase |

## Anti-patterns

| Anti-pattern | Why it fails | Source |
|---|---|---|
| Two deployable apps committing into one shared codebase | Breaks the one-to-one rule; changes to one app churn the other's history and coupling grows silently | ku01 |
| Calling a multi-repo bundle "one app" | If several codebases are needed, it is really a distributed system — hiding that obscures ownership and independent deployability | ku01 |
| Copy-pasting common code between apps to avoid a shared repo | Duplication drifts out of sync; the sanctioned escape hatch is a versioned library, not sharing a codebase and not cloning source | ku01 |
| Treating differing revisions across prod/staging/laptop as "different apps" | The invariant is a common codebase, not identical checked-out commits — you'd wrongly fork tooling and process | ku02 |
| Assuming one-to-one means one deploy per codebase | The rule constrains codebase↔app, not deploy count; many deploys of one app is the whole point | ku02 |

## Related decisions
- Two apps needed the same code → `12factor-explicit-dependencies`: the extracted shared code becomes
  a declared, version-pinned dependency instead of a shared codebase.
- One codebase, many deploys that must behave differently per environment →
  `12factor-config-in-environment`: what varies between those deploys is config, which lives in the
  environment, not in the codebase.
- Turning a revision of the codebase into a running deploy →
  `12factor-build-release-run-separation`: the build/release/run pipeline is how a single codebase produces each
  deploy without ever forking the source.

## Источник
Источник: The Twelve-Factor App — Factor I: Codebase, 12factor.net (CC BY 4.0), © the Twelve-Factor
authors. Machine-distilled, paraphrased derivative — no verbatim runs from the source.
KUs: 12factor-i-ku01, 12factor-i-ku02. Deep reference: references/knowledge-units.md.

## Self-check
- [x] Every protocol step traces to a listed KU (ku01 = mapping/litmus/library; ku02 = deploys/revisions)?
- [x] Decision framed as a repo↔app↔deploy boundary, not a broader "how to do 12-factor"?
- [x] Boundary clause names the sibling factors that own config, dependencies, and build/release/run?
- [x] No verbatim run ≥ 8 words from the source; attribution present?
- [x] trust_tier 0 (machine-distilled, unreviewed)?

## Examples
- «у нас монорепо, и оттуда деплоятся два разных сервиса — это по 12-факторам ок?» → нет: один
  codebase не должен питать два приложения; вынести общий код в библиотеку через менеджер зависимостей,
  либо признать это распределённой системой из двух app-ов, у каждого свой codebase (Factor I).
- "we call it one app but it's actually five repos wired together — is that fine?" → that's a
  distributed system, not one app; give each component its own codebase and apply twelve-factor to each.
- «на ноутбуке разработчика коммиты, которых нет на staging и на проде — мы что, разные приложения?» →
  нет: общий codebase при разных ревизиях как раз и делает их разными deploy-ями одного приложения.
- "two teams keep copy-pasting the same auth helpers between services" → extract them into a versioned
  library published through the dependency manager; do not share a codebase (hand-off to the
  dependencies factor).
