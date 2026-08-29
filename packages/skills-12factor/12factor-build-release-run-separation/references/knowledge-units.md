# Knowledge Units — 12factor-build-release-run-separation

Deep-lookup reference for the SKILL.md decision skill. Machine-distilled from
**The Twelve-Factor App — V. Build, release, run** (12factor.net, CC BY 4.0), © the Twelve-Factor
authors. Trust tier 0 — unreviewed, paraphrased (no verbatim runs).

Each unit preserves: type, name, problem, content, applicability, limits.

---

## 12factor-v-ku01 — three-stage-lifecycle (type: decision-framework)

**Name:** Split every deploy into three ordered stages — build, release, run

**Problem:** You are defining how a codebase turns into a running deployment and want a lifecycle that
is auditable, reproducible, and safe to operate — especially before adopting deployment tooling or a
rollback workflow.

**Content:** Model the path from repo to running app as three separate, one-directional stages.
(1) *Build* — take the code at one committed version, pull in its dependencies, and compile binaries
and assets into an executable bundle (the build artifact). (2) *Release* — pair that exact build with
the deploy's current config to yield a release that runs as-is in the target environment. (3) *Run*
(runtime) — launch the app's processes against a chosen release. Keep a strict wall between the three:
code (build) and config (release) meet only at the release stage, and run merely executes. Litmus
test: it must be impossible to edit code on a live server, because there is no channel to feed such an
edit back through the build stage — if you can hot-patch running code, the separation is already
broken.

**Applicability:** Any non-development deployment pipeline; teams wanting reproducible artifacts, clear
config/code separation, and reliable rollback via release management.

**Limits:** For pure local development, three formal stages add little value. The model assumes config
lives outside the build (Factor III); if secrets are baked into the build, the release-stage config
injection collapses. Some interpreted/edge stacks blur build vs run and need adaptation.

---

## 12factor-v-ku02 — immutable-release-ledger (type: heuristic)

**Name:** Treat releases as an immutable, uniquely-identified, append-only ledger

**Problem:** Deciding how releases are versioned and whether in-place edits to an existing release are
ever allowed — the foundation for trustworthy rollback and audit.

**Content:** Give each release its own unique id — a release timestamp (e.g. `2011-04-06-20:32:17`) or
a monotonically increasing number (e.g. `v100`). Once created, a release is frozen — never mutate it.
Any change at all, whether new code or new config, must yield a brand-new release rather than altering
an existing one; think of releases as an append-only ledger. This immutability is what makes rollback
trivial and dependable: tools like Capistrano store releases in a directory and flip a symlink to mark
the active one, so a rollback command can instantly repoint at a known-good prior release. Litmus test:
if you can change what a given release id refers to, you have lost the guarantees that make rollback
and auditing reliable.

**Applicability:** Deployment systems needing safe rollback, reproducibility, and an audit trail of
what ran when; release-management tooling design.

**Limits:** Retaining every immutable release consumes storage, so you need a retention/pruning policy.
The overhead is unnecessary for throwaway or dev environments. Immutable releases do not help if config
is externally mutable at runtime in a way that bypasses the release boundary.

---

## 12factor-v-ku03 — complexity-into-build (type: heuristic)

**Name:** Concentrate complexity in build; keep run lean and boring

**Problem:** Deciding where operational complexity should live across the deploy lifecycle, given that
runtime failures often strike unattended.

**Content:** Builds are started deliberately by a developer shipping new code, so someone is present and
any error is visible in the foreground — meaning the build stage can afford to be elaborate. The run
stage is different: it can trigger on its own — a machine rebooting, a process manager relaunching a
crashed worker — potentially at 3 a.m. with nobody watching. Heuristic: push as much setup,
compilation, and heavy lifting as possible into build, and reduce run to the fewest moving parts you
can. The fewer things that can go wrong at launch, the less likely the app breaks unattended. Run-stage
checklist: no dependency fetching, no asset compilation, no config resolution beyond reading a prepared
release — just start the processes.

**Applicability:** Designing build vs runtime responsibilities; hardening production launch reliability;
on-call / operational risk reduction.

**Limits:** Some legitimately dynamic work (autoscaling, service discovery, runtime feature flags) must
happen at run time and cannot be shifted left. Overly heavy builds slow the deploy feedback loop. The
principle assumes a process manager handles restarts; environments without one need other safeguards.

---

## Citation
Источник: The Twelve-Factor App — V. Build, release, run, 12factor.net (CC BY 4.0), © the Twelve-Factor
authors. Distributed as a paraphrased, restructured derivative under CC BY 4.0 (see pack NOTICE).
