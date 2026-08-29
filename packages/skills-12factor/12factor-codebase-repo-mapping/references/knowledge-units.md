# Knowledge Units — 12factor-codebase-repo-mapping

Deep-lookup reference for the `12factor-codebase-repo-mapping` skill. Machine-distilled
Knowledge Units from The Twelve-Factor App, Factor I: Codebase. Prose paraphrased in our own
words; technique/tool names (git, mercurial, subversion, dependency manager) preserved.

---

## 12factor-i-ku01 — One codebase per app, tracked in version control
- **Type:** decision-framework

**Problem.** You are standing up a new application and must decide how its source lives in
revision control, and whether shared or split repositories are acceptable. Applies whenever you
map git / mercurial / subversion repos onto deployable applications.

**Content.** Every twelve-factor app is kept in a version control system, and its codebase — a
single repo, or a set of repos that share one root commit — maps one-to-one with the app. Two
litmus tests catch a bad mapping:
- **(a)** If more than one codebase feeds what you call "one app", you do not have an app; you have
  a distributed system. Treat each component as its own app that independently follows
  twelve-factor.
- **(b)** If two or more apps draw from the same shared codebase, the rule is broken.

When apps genuinely need common functionality, do not share the codebase. Pull that code out into
libraries and consume them through the dependency manager.

**Applicability.** Bootstrapping any deployable app; settling a monorepo-vs-polyrepo debate;
splitting a growing system into services; resolving duplicated code across teams.

**Limits.** The one-to-one rule is codebase↔app, not repo-count vs deploy-count — many deploys of a
single app are expected. It forbids shared *codebases*, not shared *code*; the escape hatch is
extracting libraries. For genuinely distributed systems the rule reframes rather than restricts:
each service is simply its own app.

---

## 12factor-i-ku02 — Many deploys from one codebase, revisions may differ
- **Type:** heuristic

**Problem.** You need a mental model for how a single app's code relates to its running
environments (production, staging, each developer's laptop) and why they can hold different
revisions yet still be the same app.

**Content.** Hold the codebase fixed at one per app and let the deploys multiply. A deploy is any
running instance: production, one or more staging sites, and every developer's local environment
each count as a separate deploy. All of them draw from the identical codebase, but the active
revision can differ — a developer may hold commits not yet on staging, and staging may hold commits
not yet in production. That shared codebase across differing versions is exactly what lets you
recognize them as separate deploys of one app rather than separate apps.

**Applicability.** Reasoning about environment-promotion pipelines; explaining why local, staging,
and prod are the same app; designing a release flow where revisions propagate outward from developer
→ staging → production.

**Limits.** Different active versions per deploy is normal and does not signal separate apps; the
invariant is a common codebase, not identical checked-out commits. This is a modeling heuristic, not
a deployment tool — it says nothing about how builds or config differ between deploys (see the
build/release/run and config factors).

---

Источник: The Twelve-Factor App — Factor I: Codebase, 12factor.net (CC BY 4.0),
© the Twelve-Factor authors.
