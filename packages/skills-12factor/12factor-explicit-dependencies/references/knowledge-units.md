# Knowledge Units — 12factor-explicit-dependencies

Deep-lookup reference for the SKILL.md decision skill. Source: The Twelve-Factor App — II. Dependencies
(Explicitly declare and isolate dependencies), 12factor.net (CC BY 4.0). Machine-distilled, paraphrased,
unreviewed (trust_tier 0).

---

## 12factor-ii-ku01 — Explicit dependency manifest over implicit system packages
*type: decision-framework · source: Factor II · skill_worthiness: high*

**Problem:** Whenever code needs third-party libraries, you must decide how those libraries become
available at build and run time. The trap shows up when onboarding new developers, moving between machines,
or promoting from dev to prod — cases where "it works because this box happens to have that library"
silently breaks.

**Content (paraphrased):** Do not lean on packages that merely happen to be pre-installed on the host.
Instead, enumerate every dependency — completely and precisely — in a manifest committed to the repo, and
pair it with a runtime isolation tool so nothing from the surrounding system quietly leaks into the app.
Two distinct mechanisms are required *together*: (1) declaration (the manifest) and (2) isolation (a
sandbox/scoping tool during execution). Doing only one is insufficient. The same declared set is applied
identically to production and development. **Litmus test:** a brand-new developer can clone the repo onto a
bare machine that has only the language runtime and package manager, run a single deterministic build
command, and get a working setup — nothing else assumed present. Tooling per ecosystem: Ruby uses a Gemfile
plus bundler (`bundle install` / `bundle exec`); Python splits the roles — Pip for declaration, Virtualenv
for isolation; even C can use Autoconf for declaration and static linking for isolation.

**Applicability:** Any app with external library dependencies, especially those deployed across
heterogeneous or future environments, or handed off between developers / CI / prod.

**Limits:** Declaration alone (a manifest with no isolation) or isolation alone does not satisfy the factor.
Some ecosystems require stitching two separate tools together. Fully pinning and vendoring adds maintenance
overhead and larger artifacts — heavy for a throwaway script — but the payoff is reproducibility, so the
tradeoff favors anything long-lived or shared.

---

## 12factor-ii-ku02 — Vendor system tools instead of assuming they exist
*type: heuristic · source: Factor II · skill_worthiness: high*

**Problem:** Applies when the app shells out to an external command-line utility (image processors, HTTP
fetchers, etc.) rather than a language-level library. A tool present on today's box is not guaranteed on
every future host — and even if present, its version may be incompatible.

**Content (paraphrased):** Treat host-provided command-line tools as an implicit, unreliable dependency —
the same trap as system-wide packages. If the app must invoke such a tool, bring a known-good copy of it
inside the app (vendor it) so its presence and version are controlled by the repo, not the environment.
Risky examples: calling ImageMagick or curl and trusting the OS to supply them. **Litmus test:** could the
app run on a freshly provisioned machine with none of these utilities pre-installed? If not, the tool needs
to be vendored.

**Applicability:** Any app that spawns subprocesses to OS-level binaries, or depends on CLI utilities for
tasks like media conversion or network calls.

**Limits:** Vendoring binaries increases artifact size and cross-platform build complexity, and shifts
responsibility for patching that tool onto you. For a genuinely universal, version-stable utility this can
feel like overkill — but the factor's position is that no such guarantee actually holds across future
systems.

---

## Citation
Источник: The Twelve-Factor App — II. Dependencies (Explicitly declare and isolate dependencies),
12factor.net (CC BY 4.0), © the Twelve-Factor App authors. This is a paraphrased, restructured derivative
with no verbatim runs, distributed under CC BY 4.0.
