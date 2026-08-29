# Changelog

All notable changes to `@dzhechkov/p-replicator` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.10.0] - 2026-08-27

**Every guard in this package can now be shown to fail — and three that could not, now can.**
MINOR: no pre-shipped contract change, but the exit-code semantics of two shipped scripts changed.

### Fixed — guards that could not refuse

- **`check-ports.cjs` resolved one path in two frames of reference.** A relative argument was
  re-applied by docker, so `check-ports.cjs projects/01` reported
  `…/projects/01/projects/01/docker-compose.yml`. Worse, it fired BEFORE docker parsed the file and
  so MASKED real config errors, and the cure it printed was the invocation that SUCCEEDS. Two edits:
  absolutise at the boundary, and delete the `cwd:` override — measured to buy nothing on Compose v2+.
- **The generated aggregate guard was false-green on 3 of 4 inputs**, and the generator writes it
  into every bootstrapped project. Four declarations minified onto ONE line reported OK; so did a
  missing file; so did an **unsubstituted `{{…}}` placeholder — forever**. Now 0/1/2, counting
  occurrences rather than lines.
- **`assess-code.sh` and `assess-tests.sh` printed red verdicts and exited 0**, while a nonexistent
  path exited 1 — blindness outranked findings. Now 1 on findings, 2 on could-not-check. Detection
  unchanged.
- **`verify` and `doctor` were blind to an EMPTY file.** 31 artifacts truncated to zero bytes and
  both reported clean; a zero-byte `settings.json` — no hooks wired at all — got a checkmark.
  Three states now, reported as three.

### Added

- **`dz mutation-gate` enrolment** — `test/mutation-registry.json`, six entries, every mutation
  demonstrated red by hand before the registry was trusted. Gate: 6/6 PROVEN.
- **`tests/unit/guard-forms.test.js`** — a layer-1 refusal of five shell shapes that make a guard
  unable to fail. It caught the aggregate guard, and later confirmed its own fix: inventory 2 → 0.
- **`check-docs-complete.cjs`** at the Phase 1→2 boundary, with a confidence split: `{{…}}` and
  TODO/TBD/XXX block; bracketed prose is NAMED but never blocks, because it cannot be told from a
  mermaid label — and blocking on it refused every project the bundled skill generates.

### Changed — honesty in shipped documents

- `myinsights.md` no longer claims insights are injected "when their tags match the current task".
  The hook runs at `SessionStart`, before anything has been said, so there is no task to match
  against; it injects the three most recent entries. The reason and the consequence are both stated,
  and a test pins the document to the code.
- The insights carrier now reports THREE states — not started / zero entries / N recorded — in
  `doctor`, `verify` and the statusline. Absent and empty rendering identically is what let 27
  recorded insights become 0 across four real projects with every surface reporting fine.

### Verified differently this time

The shipped suite now runs from a TARBALL, not only locally: **288/296 exit 1 → 311/311 exit 0**.
Two tests are monorepo-only by construction and skip loudly outside it — permitted only because a
guard asserts they RUN inside, so the skip is provably not taken where it matters.

## [1.9.0] - 2026-08-27

**MINOR — hooks 8 → 9** (`check-docs-complete`). After `update`, `doctor` and `verify` expect the new count.

### Added
- **`check-docs-complete.cjs`** — the cheap question, asked before the expensive one. Phase 2 used to
  launch a swarm of validation agents over whatever Phase 1 produced; existence, emptiness and
  unfilled placeholders are decidable by forty lines. `/replicate` now runs it at the Phase 1→2
  boundary and does not start the swarm on exit 1.
- **A resume section in `/replicate`** — the three signals that already answer "where did we stop":
  the per-phase commits, this checker, and `verify`. Automated phase detection was deliberately NOT
  added; the reasoning is recorded there so it can be revisited on evidence.

### Changed
- **`prepublishOnly` now runs the snapshot test before signing.** `tests/` is in `files[]`, so a
  baseline drifted from the templates used to be signed, shipped and wrong — `dz sign` states its own
  limit: tamper-evidence, never truthfulness.

### Honest limit
The completeness check proves the documents were WRITTEN, not that they are correct. Correctness is
what the Phase-2 swarm is for. It blocks only on shapes that cannot be anything else (`{{…}}`,
TODO/TBD/XXX/FIXME); bracketed prose is NAMED as a warning and never blocks, because it cannot be
told from a mermaid label without understanding the document — and `[GAP: …]` always reaches Phase 2,
which owns it.

## [1.8.0] - 2026-08-27

**MINOR — the ten shipped skills no longer depend on a rewrite rule being read.**

### Changed
- **Skill paths are pre-baked.** They referenced each other by claude.ai `/mnt/skills/user/<name>/`
  paths and worked only because two rules files tell the model to rewrite them at read time — layer
  4, silent when it lapses. 27 references now resolve directly.
- Two skills referenced but NOT shipped (`frontend-design`, `idea2prd-manual`) are declared OPTIONAL
  with a fallback rather than rewritten. A local-looking path that resolves to nothing is worse than
  an obviously foreign one.
- 56 occurrences are DELIBERATELY preserved: the toolkit generator's own instructions to scan its
  output for unrewritten paths, and the rewrite tables. Rewriting them would blind the self-check.
- The rewrite rules stay — a skill YOU bring from claude.ai still needs them.

### Fixed
- `03-generate-p0.md` named `.claude/skills/goap-research/` as an output path two lines under a note
  saying that name is an alias which never exists as a directory.

## [1.7.0] - 2026-08-27

**Growth stops being analysis and becomes an obligation.** Two features, both cross-family reviewed
(grades B and C); artifacts in `features/growth-requirements-bridge/` and
`features/growth-list-and-compliance/`.

**MINOR — the pre-shipped contract changed again.** Hooks 7 → 8 (`check-growth-trace`). After
`update`, `doctor` and `verify` expect the new count.

### Added

- **Phase 0 now writes `docs/product-discovery-brief.md`.** MEASURED before this change: it never
  did. The brief was passed to Phase 1 in conversation and evaporated, so the M5 growth analysis had
  no artifact anything downstream could read. Nothing was ignoring it — there was nothing to ignore.
- **`Growth Requirements Seed`** in M5: `FR-GROWTH-nnn` DRAFT obligations, each naming its source
  block, carrying that block's confidence verbatim, and now carrying a compliance verdict.
- **Growth type is two independent axes** — a go-to-market MOTION and a growth LOOP — plus the three
  mechanics the old list omitted (badge/embed, one- and two-sided incentivised referral, network
  effect). `No loop` is a real answer and skips the loop-only output instead of demanding an
  invented flywheel.
- **A compliance checklist** before any technique becomes a requirement. It cites the norm and where
  to check it, and carries no amount, threshold or statute: those are jurisdiction-specific and go
  stale within a year. A `no` answer is recorded against the requirement and blocks its promotion.
- **`Growth Traceability`** in `requirements-validator` — CONDITIONAL, scored `+5 / +0 / -10`
  OUTSIDE the 100-point table. A project with no acquisition objective, or one that never ran
  Phase 0, scores `+0` and never a penalty.
- **`.claude/hooks/check-growth-trace.cjs`** — the deterministic counterpart. Exit `0` traced ·
  `1` analysed then dropped · `2` **the check did not run**. Wired to no event, like `check-ports`.
- **README:** a usage-scenario section for both deliberately-invoked checks, closing a gap 1.6.0 left
  when `check-ports` shipped without one.

### Fixed

- The pipeline rule listed **four** hook files when eight ship, and the components table said
  **Rules 5** when six do — both stale since 1.6.0.

### Honest limits, stated in the shipped artifacts

The seed proves an obligation was carried forward, never that it was built. The compliance checklist
asks its questions and records the answers; it does not establish that anything is lawful. And the
validator criterion is prose read by a model — layer 3. Only `check-growth-trace.cjs` is
deterministic, and only when someone runs it.

## [1.6.0] - 2026-08-27

**Seventeen features** across two days, from the field-report sweep (PR-003, PR-005+010, PR-008,
PR-009+004, PR-010, PR-011, PR-012, PR-013, PR-007 G5) plus a latent publish hazard, a silent-failure
class, a growth-module gate and three regressions found in passing. Every one went through the full
design→plan→code→cross-family-QE pipeline; artifacts live in `features/<slug>/` in the source repo.

**MINOR, not patch — the pre-shipped contract changed twice.** Rules went 5 → 6 (`docker-ports`) and
hooks 6 → 7 (`check-ports`). After `update`, `doctor` and `verify` expect the new counts.

### Added — a check that can fail, for the rule that could not

`.claude/hooks/check-ports.cjs` enforces «Правило №0» against a real `docker compose config`, in Node
so it runs where the package promises to run. **Three exit codes: 0 clean, 1 violation, 2 THE CHECK
DID NOT RUN** — no compose, no docker, an unparseable config. A check that answers "clean" when it
could not look turns an unknown into a reassurance.

It is a rewrite, not a transcription: the bash original never looked at `network_mode: host`, which
the rule forbids. It is not registered as an event hook — invoke it deliberately:

```bash
node .claude/hooks/check-ports.cjs .
```

### Added — a recorded decision cannot be quietly left unbuilt

Phase 2 closes with a decision-coverage step: every `ADR-<nnn>` in `docs/ADR.md` must be named
downstream, and every downstream reference must match a real decision. Both directions, both able to
say `none`. It establishes that a decision is NAMED, not that it was implemented, and says so.

### Changed — deleting an artifact is now recorded

The three autocommit hooks treated a deleted roadmap as "nothing to do". A deletion is now committed
with its own `auto-remove` subject, classified from what git actually staged — so deleting one file
inside a surviving directory counts too. A project that never had the artifact stays silent.

### Fixed — the status line stops saying untrue things

The progress bar was built from done/total and captioned `mvp`; it now carries the caption it draws.
And the domain guess had no word boundaries, so "healthchecks" made a project medical and "slack"
made it enterprise. Boundaries are Unicode lookarounds, not `\b` — `\b` does not work around
Cyrillic at all.

### Fixed — the project scanner could not recognise its own output

Seven probes resolved from one parameter and disagreed about what it was; the two that decide whether
a project is SPARC-shaped looked exactly where the pipeline does not write.

### Fixed — the growth module was gated off for the type it handles itself

Two callers disabled it for B2B while the module branches on type internally. The condition is now
about applicability, not product type.

**The version number and the decision to publish were the owner's**; both were given on 2026-08-27.
npm's latest before this release was 1.5.18; 1.5.19 was staged and never published.

### Fixed — the shipped hooks did not work from a subdirectory, and never committed anything

- `settings.json` pinned all five commands to `${CLAUDE_PROJECT_DIR}` (braced, quoted — the form
  Claude Code rewrites for PowerShell). Relative paths resolve against the process cwd, which drifts
  the moment any tool call runs `cd`, so every `Stop` hook died with `MODULE_NOT_FOUND` — silently,
  because hooks are non-blocking.
- All six hooks now anchor their DATA at an absolute `CLAUDE_PROJECT_DIR`, falling back to their own
  `__dirname`. Fixing only `settings.json` would have made them run and silently do nothing.
- The three autocommit hooks passed `-m` AFTER `--`, so git parsed the commit message as a pathspec
  and the commit failed from every directory, always. They had never committed anything.

### Fixed — the status line told half the truth from every directory

Toolkit counts now resolve from the project root regardless of cwd, and the roadmap is a survey of
`projects/*` rather than a guess — sub-project figures are labelled as theirs and never merged into
the root's own counters. The survey is bounded (24 entries, 512 KB per file) because it renders on
every prompt.

### Added — the pipeline can now refuse to build on unvalidated input

- A blocking FLOOR on the requirements gate: `Testable = 0` or `Completeness = 0` blocks whatever the
  total says. A story with no acceptance criteria totalled 72/100 and read as "fix minor issues".
- Phase 3 has a checkable precondition — the validation report must exist and its FIRST
  `**Verdict:**` line must be green or yellow — replacing an unenforceable "never skip validation".
- An External Dependencies inventory in `Architecture.md` plus a sixth Phase-2 lens: every external
  capability a requirement rests on carries evidence (a citation WITH a verbatim quote) and one of
  three verdicts. An unconfirmed capability stops the requirements that rest on it, not the run.
- Scenario↔algorithm traceability: scenario IDs in Phase 3, `REALISES:` in Phase 4 algorithms, and a
  coverage reconciliation that runs BOTH ways. It establishes that a claim exists — not that the
  algorithm performs the check, and it says so in the template.

### Added — `.claude/rules/docker-ports.md` (6th pre-shipped rule)

"Правило №0": storage has no host publication except a loopback bind. Every forbidden form is named
— `0.0.0.0`, `[::]`, a single explicit public address, and `network_mode: host`, which needs no
`ports:` entry at all. The rule states that the package does NOT check your compose file, so nobody
infers a guarantee from its presence.

**This changes the pre-shipped contract from 5 rules to 6.** `doctor`, `verify`, the status line and
the READMEs move together, and a test now holds every count site to `COMPONENTS.rules.items`.

### Fixed — one schema for `feature-roadmap.json`

It was documented twice, incompatibly, both copies claiming to be canonical. `commands/next.md` is
now the schema; the other document points at it. The status line marks a roadmap whose `priority`
values are off-schema instead of rendering a confident `mvp 0/0`.

### Fixed — `/start` no longer discards what `/replicate` wrote

Both wrote `docker-compose.yml`, `.gitignore` and `README.md`, and `/replicate` recommends running
`/start` afterwards — so the collision was the normal path. Both sides now guard: if the file exists,
make the minimal targeted edit, inspect the diff, and name every changed hunk.

### Security — `scripts/sync-templates.js` fails closed

It copied a discovered repo root's `.claude/` over `templates/` — the npm tarball — and inside a
monorepo the walk-up finds the MONOREPO. It was safe only because nothing called it, while a test
helper and an architecture doc both invited the call. It now refuses unless the root carries a
regular `.p-replicator-sync-source` file with an exact declaration.

### Changed — a hook that cannot commit no longer says nothing

A real git failure now prints ONE line to **stdout** naming the hook, the artifact and git's own
reason, and still exits 0. The ordinary "nothing to commit" path stays silent.

The stream matters and was wrong at first: MEASURED in the Claude Code binary, a hook exiting 0 has
its **stderr discarded** (*"Exit code 0 - stdout/stderr not shown"*) while stdout can be surfaced
(*"Exit code 0 - stdout shown in transcript mode (ctrl+o)"*). "Visible" here means transcript mode
and the debug log — not an interruption: a `Stop` hook cannot put a line in front of you without
blocking your session, and blocking is worse.

Still open, and it is the owner's call: whether a DELETED target should be auto-committed.

### Tests

**116 → 235** (MEASURED — reproducer `npm test` in this package; 116 before the first of these
features, 235 after the last). Every feature's guard is proven by mutation: apply it, watch a
specific assertion go red, restore, watch it pass.

## [1.5.19] - 2026-08-25

### Fixed

- **The ADR chain was dead for every `/replicate` project.** The scanner required a directory of
  `docs/adr/*.md`, which is the idea2prd-manual shape; a `/replicate` project writes a single
  `docs/ADR.md`, so decisions were recorded and never read. The scanner now accepts both shapes.

## [1.5.18] - 2026-08-25

### Changed

- Version bump only, as part of a 51-package publish sweep — signatures re-verified against the
  published tarballs. No behaviour change in this package.

## [1.5.17] - 2026-08-25

### Fixed

- Slice-H cross-model QE round 5 in `learning_bridge.py`. Recorded honestly at the time: the finding
  count across five rounds went 11 → 10 → 5 → 3 → 6 and **did not converge**.

## [1.5.16] - 2026-08-25

### Fixed

- Slice-H QE round 4: acronym-versus-name confusion, laundered identifiers, and a forgeable probe.
  The acronym test had been wrong in BOTH directions — it accepted `McDonald` and rejected `apoB`,
  an example from this package's own README.

## [1.5.15] - 2026-08-25

### Fixed

- Slice-H QE round 3: the `learning_bridge.py` guard became a token allowlist rather than an
  enumeration of bad cases, with evidence-provenance tests added.

> These five entries were reconstructed from git history on 2026-08-27 (backlog `2b286239`). They are
> accurate about what changed and why; they are terser than a contemporaneous entry would have been.

## [1.5.14] - 2026-07-28

### Fixed — Documentation & packaging (package-verification findings)

Fixes for the 2026-07-28 published-artifact verification of 1.5.13
(no runtime code changes; `src/`, `bin/`, `templates/` untouched —
MEASURED: `git diff v-prev -- src bin templates` is empty for this release):

- **Changelog gap closed.** Versions 1.5.5–1.5.13 shipped with no changelog
  trail; this file now documents every one of them (entries below,
  reconstructed from the monorepo git history — reproducer:
  `git log --follow -- packages/@dzhechkov/p-replicator/package.json`).
  README "Changelog Highlights" and `README/{eng,ru}/07_changelog.md`
  extended to match.
- **`CHANGELOG.md` now ships in the tarball.** 10 doc references pointed to
  `./CHANGELOG.md` / `../../CHANGELOG.md` while `files[]` excluded it — dead
  link on npmjs and in `node_modules`. `files[]` now includes `CHANGELOG.md`,
  `KNOWN_LIMITATIONS.md`, `MULTIPLATFORM_ROADMAP.md` (all doc-referenced from
  README.md). MEASURED: `npm pack --dry-run` lists all three.
- **`npm test` works inside the installed package.** `scripts.test` referenced
  `tests/` which `files[]` excluded. `tests/` (5 files, 108K) now ships.
  MEASURED: `npm test` in the unpacked tarball → 105/105 pass.
- **One consistent repo URL.** Packed docs linked the pre-monorepo repo
  `github.com/dzhechko/pu-unicorn-replicate` (HTTP 404) while `package.json`
  pointed at the monorepo `github.com/djd1m/dz-harness-hub`. All doc links now
  point to `github.com/djd1m/dz-harness-hub` path
  `packages/@dzhechkov/p-replicator` (README.md, README/{eng,ru}/, ru HTML
  guide + its build.js). MEASURED: `grep -rn "pu-unicorn-replicate"` over
  shipped docs → only historical path mentions inside old changelog entries
  remain.
- **npm `description` char-count refreshed.** "194K+ chars" was ~4.5× stale;
  now "880K+ chars". MEASURED:
  `find templates/.claude/skills -type f -exec cat {} + | wc -c` → 880,679.
- **Stale pre-publish note removed** from README Contributing (the
  `prepublishOnly` sync hook was deleted in 1.5.5).

## [1.5.13] - 2026-07-10

### Fixed — brutal-honesty-review output schema

`templates/.claude/skills/brutal-honesty-review/schemas/output.json`:
`trustTier` was locked to `const: 3`; now `minimum: 1, maximum: 3` so
lower-tier runs validate. (Reproducer: `git diff bec5d86c 80542939 --
packages/@dzhechkov/p-replicator`.)

## [1.5.12] - 2026-07-06

Version-sync release after the 1.5.11 publish — no content changes to the
shipped package. (Reproducer: `git diff 1826ac63 bec5d86c --
packages/@dzhechkov/p-replicator` → package.json version line only.)

## [1.5.11] - 2026-07-06

### Changed — baseline-heal: brutal-honesty-review skill hardened

Part of the monorepo-wide "baseline-heal" pass (8 allowlisted skills healed
via per-skill feature-adr). For this package:

- `brutal-honesty-review` gained `evals/brutal-honesty-review.yaml`,
  `schemas/output.json` (291 lines), `scripts/validate-config.json`;
  `SKILL.md` updated.
- Snapshot baseline regenerated.

(Reproducer: `git diff 51a29bc7 1826ac63 -- packages/@dzhechkov/p-replicator`.)

## [1.5.10] - 2026-07-06

Version-sync release after the 1.5.9 publish — no content changes to the
shipped package. (Reproducer: `git diff 41ec8d36 51a29bc7 --
packages/@dzhechkov/p-replicator` → package.json version line only.)

## [1.5.9] - 2026-07-06

### Fixed — goap-ed25519 honesty/security rewrite + `remove` safety (audit waves 1/3/4)

- **`goap-research-ed25519` de-hyped and made cryptographically honest.**
  SKILL.md, all three `references/*.md` and the Python scripts
  (`ed25519_verifier.py`, `goap_planner.py`, `test_ed25519_verifier.py`)
  rewritten: Ed25519 provides provenance + tamper-evidence under pinned
  trusted-issuer keys — it does NOT prove truthfulness or prevent
  hallucination, and the skill no longer claims it does. Domain strings alone
  are never trusted; self-attested signatures are capped below issuer-trusted
  confidence. Net −1,696 lines across the package (MEASURED: `git diff --stat
  9f18ec43 41ec8d36 -- packages/@dzhechkov/p-replicator` → 892 insertions,
  2,588 deletions).
- **`remove --dry-run` no longer deletes the manifest** on the
  already-cleaned path (the dry-run guard ran after the manifest unlink).
- **`remove` keeps the manifest when any tracked file fails to delete**
  (permissions/locked), so survivors stay tracked instead of being stranded.
- Assorted P3 doc/script fixes (`update.js`, `assess-tests.sh`,
  `README/ru/html/build.js`, doc-count reconciliations).

## [1.5.8] - 2026-06-29

### Changed — Phase-3 toolkit drift fixes + provenance record

- `trust_tier` frontmatter added to vendored skills `goap-research-ed25519`,
  `problem-solver-enhanced`, `reverse-engineering-unicorn` (bodies unchanged
  apart from the frontmatter — MEASURED: `git diff c9225e8f 9f18ec43 --
  packages/@dzhechkov/p-replicator/templates/.claude/skills` shows only
  `trust_tier*` line additions; `sources.json` records "resynced 2026-06-29 —
  added trust_tier (body identical)").
- New `sources.json` — ADR-0001 provenance record mapping each of the 10
  skills to its origin (vendored / vendored-adapted / intentional-fork /
  toolkit-original). Documentation-only, not shipped in the tarball.
- `replicate-pipeline.md` rule: new optional post-pipeline **UI replication**
  section referencing the external `clone-website` skill
  (`@dzhechkov/skills-website-cloner`) — reference, not vendored.

(Reproducer: `git diff c9225e8f 9f18ec43 -- packages/@dzhechkov/p-replicator`.)

## [1.5.7] - 2026-06-16

### Fixed — C4 audit cluster (CLI strictness + manifest safety)

- **CLI argument validation:** unknown options (`--nope`) and unexpected
  positional arguments now error with exit 1 instead of being silently
  ignored (`src/cli.js`).
- **`init` manifest tracks the TEMPLATE source, never a destination scan**
  (`src/commands/init.js`) — walking the destination would adopt user-created
  files into the manifest and a later `remove` would delete them (user data
  loss). Matches `update.js`'s invariant.
- Doc fixes in `replicate-coordinator.md`, `replicate.md`,
  `cc-toolkit-generator-enhanced` modules; snapshot baseline regenerated.

(Reproducer: `git diff 60238ced c9225e8f -- packages/@dzhechkov/p-replicator`.)

## [1.5.6] - 2026-06-11

### Changed — P6 wave: explore skill trust tier

- `explore` skill gained `trust_tier` frontmatter (Tier 1 "Structured").
- Its handoff reference changed `goap-research-ed25519` → `goap-research`
  (alias documented in `skill-interface-protocol.md`).

(Reproducer: `git diff e0be1d53 60238ced -- packages/@dzhechkov/p-replicator`.)

## [1.5.5] - 2026-06-11

### Changed — First monorepo release (dz-harness-hub)

First version published from the `dz-harness-hub` monorepo
(`packages/@dzhechkov/p-replicator`) instead of the original
`pu-unicorn-replicate` repo. Metadata-only changes:

- `repository` / `homepage` / `bugs` → `github.com/djd1m/dz-harness-hub`
  (with `directory` field).
- **Destructive `prepublishOnly` sync hook removed** (`scripts/sync-templates.js`
  no longer runs on publish — it could delete pre-shipped files when run from
  the wrong root).
- `publishConfig.access: public` added; `@dzhechkov/keysarium-core` peer range
  `^1.0.0` → `^1.1.0`.

(Reproducer: `git diff e1651fcf e0be1d53 -- packages/@dzhechkov/p-replicator`
→ package.json only.)

## [1.5.4] - 2026-05-13

### Fixed — settings.json `$schema` URL

The default `settings.json` shipped via `init` had an incorrect `$schema`
URL (`https://www.schemastore.org/claude-code-settings.json`). Claude Code's
JSON-schema validator rejected it with:

```
Settings Error
$schema: Invalid value.
Expected one of: "https://json.schemastore.org/claude-code-settings.json"
```

The validator then **skipped the entire settings file**, which silently
disabled the statusline + hooks shipped by p-replicator until the URL was
manually corrected.

**Root cause:** schemastore.org has two host aliases (`www.` and `json.`),
but Claude Code's strict-schema check accepts only the `json.` variant.

**Fix:** corrected the URL to `https://json.schemastore.org/claude-code-settings.json`
in the source `.claude/settings.json` and propagated through:

1. `pu-unicorn-replicate-main/.claude/settings.json` (source-of-truth)
2. `packages/p-replicator/templates/.claude/settings.json` (auto-synced template
   shipped by `init`)
3. `README.md` (root, code sample)
4. `README/eng/03_admin_guide.md`
5. `README/eng/04_api_reference.md`
6. `README/ru/03_admin_guide.md`
7. `README/ru/04_api_reference.md`
8. `README/ru/html/index.html`

Snapshot baseline regenerated (`tests/snapshot/baseline.json`).

**Tests:** 105/105 passing.

**Migration for existing installations:**

Option A (recommended) — run `update`:
```bash
npx @dzhechkov/p-replicator update
```
The v1.4.2+ `mergeSettingsJson` logic preserves user customizations while
correcting the `$schema` field via the `shippedDefaults` baseline diff.

Option B — manual one-line edit of `.claude/settings.json`:
```diff
- "$schema": "https://www.schemastore.org/claude-code-settings.json",
+ "$schema": "https://json.schemastore.org/claude-code-settings.json",
```

Option C — ignore. Claude Code only warns; statusline/hooks STILL load
because `init`'s code path doesn't depend on the `$schema` value being valid.
(But the warning is annoying and will appear on every session start.)

## [1.5.3] - 2026-05-07

### Changed — Comprehensive README.md expansion for npm registry

The package-root `README.md` (auto-included in npm tarball, displayed on
npmjs.com/package/@dzhechkov/p-replicator) was significantly under-detailed
compared to the bilingual `README/eng/*.md` deep-dives (8 files, ~3000 lines).
Many users landing on the npm registry page didn't see key features
(statusline, --feature-branches, Mode 2, validation thresholds, hooks system,
architecture highlights) without navigating to the eng/ folder.

**v1.5.3 expands README.md from ~14.6 kB to ~50+ kB** through strategic
consolidation of content from `README/eng/01_quickstart.md` through
`07_changelog.md`, with explicit pointers to the eng/ files for power-user
deep dives. The README now stands alone for ~95% of users.

**New sections added (or significantly expanded):**

1. **Table of Contents** — 26 anchor-linked sections (npm registry doesn't
   auto-generate TOC, so explicit links are mandatory for navigability)
2. **What is p-replicator?** — full intro with use cases, target architecture,
   2-row use-case decision table
3. **Quick Start** — preserved + clarified
4. **Already have technical documentation?** — v1.5.1 alt-entry recipe (kept)
5. **Adding features to an existing project (Mode 2)** — v1.5.2 recipe (kept,
   slightly expanded with caveats)
6. **Installation** — NEW: prerequisites, common install scenarios table
7. **What Gets Installed** — expanded to cover both pre-shipped and
   project-generated artifacts
8. **Verify the install** — NEW: doctor vs verify, exit codes
9. **Pipeline overview — `/replicate` phases** — NEW: full 5-phase walkthrough
   with validator agents table, verdict thresholds
10. **Skills Reference** — preserved + module breakdown table for
    cc-toolkit-generator-enhanced + view() syntax explanation
11. **Commands Reference** — NEW: full 11-command table with when-to-use,
    detailed sections for /run, /go, /myinsights, /harvest
12. **CLI Commands** — NEW: subcommands table, global flags, slash command flags
13. **Validation Cycle Details** — NEW: 5-agent swarm, INVEST/SMART criteria,
    verdict matrix, brutal-honesty severity classification
14. **Feature Lifecycle** — NEW: Mode 1 vs Mode 2, all 4 phases, AUTO mode
15. **Statusline Dashboard** — NEW: 6-line layout, sources matrix, defensive
    design, disable instructions
16. **Hooks System** — NEW: 6 hook scripts table, cross-platform discipline,
    state-file flow
17. **Roadmap & Insights** — NEW: feature-roadmap.json schema, lifecycle states,
    insights system entry format and conventions
18. **Architecture Highlights** — NEW: two-tier model, SSOT, settings merge
    logic, manifest schema
19. **Configuration** — NEW: settings.json default, MCP servers, Keysarium
20. **Update workflow** — NEW: 3 update strategies, merge logic algorithm
21. **Troubleshooting** — NEW: top 12 issues with diagnostics + commands
22. **Migration** — NEW: per-version migration table 1.3.x → 1.5.x
23. **Test Infrastructure** — NEW: 105 tests breakdown, meta-tests, snapshot
    baseline
24. **Known Limitations** — NEW: highlights of 8 open items + link to full file
25. **Changelog Highlights** — NEW: 9 versions summary 1.3.0 → 1.5.3 with
    feature emojis
26. **Contributing** — NEW: dev setup, pre-publish checklist, AQE pattern
    persistence model
27. **License + Links** — preserved + companion documentation index

**What's NOT in the new README (intentional):**

- Full `view()` cross-skill loading internals (in `README/eng/05_architecture.md`)
- Settings merge algorithm pseudocode (in `README/eng/05_architecture.md`)
- Statusline parser-by-parser breakdown (in `documentation/07-dashboard-howto.md`)
- All 15+ troubleshooting cases (in `README/eng/06_troubleshooting.md`)
- Full formal API schemas (in `README/eng/04_api_reference.md`)

These remain as deep-dives in eng/ — README.md links to them at appropriate spots.

**Bilingual link preservation:** RU + EN docs links remain at the top of the README.

### Tests

- Snapshot baseline NOT regenerated — README.md is at package root, NOT in
  `templates/` (snapshot only tracks templates/.claude/* contents)
- All 105 tests still green — README.md expansion has zero test surface
- npm pack dry-run: tarball grew from ~350 kB to ~390 kB (+40 kB for the
  expanded README; well below npm registry rendering thresholds)

### Visual polish (v1.5.3 final pass)

Within npm-renderer constraints (no inline `<style>`, stripped CSS classes),
applied 5 visual contrast improvements to reduce dark-blue link density and
improve readability on npmjs.com:

1. **Hero banner** — `<div align="center">` with centered title, tagline, and
   8 colored badges (npm/MIT/Node + tests/skills/commands/hooks/SPARC) using
   shields.io custom hex colors (red/green/purple/orange/blue/pink/black).
   Reduces blue-link load on first screen.

2. **Emoji-icons in TOC** — every entry got a visual anchor (📖 🚀 📑 🔧 📦
   📋 ✅ 🎯 🧠 ⚡ 💻 🎚️ 🔄 📊 🪝 🗺️ 🏛️ ⚙️ 🔄 🆘 📈 🧪 ⚠️ 📜 🤝 📃). Eye
   catches colorful icons, not 26 dark-blue text links.

3. **`<details>`/`<summary>` collapsibles** for 4 verbose sections:
   - Troubleshooting (12 cases)
   - Migration table
   - Test Infrastructure
   - Changelog Highlights (9 versions)

   Reduces visible link density in main view; expand on demand.

4. **Callout blocks** — `> ⚠️` for warnings, `> 💡` for tips, `> 📌` for
   important notes, `> ✅` for confirmations. Renders with left-border
   styling that visually pops vs plain text.

5. **Two-column TOC layout** via `<table>` with `valign="top"` — splits 26
   items into "Getting Started + Reference" (left) and "Operations + Help"
   (right). Better visual scanning than single-column list.

**What was NOT changed:**
- Link color itself (npm strips `style="color:..."` and CSS — fixed by registry)
- Information density (zero content removed; only repackaged)
- TOC anchors (all 26 links still resolve to valid section IDs)

### Migration notes

- **No breaking changes.** Pure documentation expansion + visual polish.
- Existing functionality unchanged.
- Users see significantly more content + better visual contrast on npmjs.com.
- HTML guide (`README/ru/html/index.html`) NOT regenerated for v1.5.3 since
  it's built from `README/ru/*.md` (not the package-root README.md). The RU
  HTML guide remains the authoritative single-page HTML for Russian-speaking users.

---

## [1.5.2] - 2026-05-07

### Added — Documentation & spec for "Feature workflow in existing project" (Mode 2)

`/feature` already supported the existing-project scenario via natural-language
invocation — v1.5.2 formalizes this entry mode across all documentation surfaces.
Users who already have a working project (stack defined, PRD/Specification/
Architecture/CLAUDE.md exist) can now use `/feature` to add new features with
the same SPARC-mini validation cycle that `/replicate` provides — without
regenerating their existing scaffold.

Two officially supported entry modes for `/feature`:
- **Mode 1: Post-/replicate** — project bootstrapped via /replicate (default)
- **Mode 2: Existing project** — `init` ran on top of existing project (NEW formalization)

The 4-phase pipeline (PLAN → VALIDATE → IMPLEMENT → REVIEW) is **identical** in
both modes. Same validation thresholds, same retry logic, same brutal-honesty
review.

**Spec docs (ship in npm tarball — visible to all installed users):**
- `templates/.claude/commands/feature.md` — new top-level "Use case: existing
  project (Mode 2)" section. Documents prerequisites (init + verify, standard
  SPARC paths), what does NOT happen in Mode 2 (no /start, no scaffold regen,
  no auto feature-roadmap), three sub-paths (A/B/C), verification commands.
- `templates/.claude/rules/feature-lifecycle.md` — new "Entry modes" section
  documenting Mode 1 vs Mode 2, prerequisites, detection (no automatic — same
  code path), Mode 2 caveats, test contract preservation.
- `templates/.claude/commands/replicate.md` — new "See also: existing-project
  feature workflow (Mode 2)" cross-reference in Alternative entry section,
  pointing users who only want feature additions to `/feature` instead of
  `/replicate`.

**User-facing docs (visible on GitHub + npm registry):**
- `README.md` (package root, auto-included in npm tarball) — new "Adding
  features to an existing project?" subsection right after v1.5.1's "Already
  have technical documentation?" pointer, with the recipe + 3 sub-paths +
  pointer to user guides.
- `README/ru/01_quickstart.md` — new "Добавление фич в существующий проект (Mode 2)"
  section with install steps, SPARC-path normalization, 3 sub-paths table,
  validation thresholds, init-preservation guarantees, and caveats.
- `README/eng/01_quickstart.md` — parallel English version.
- `README/ru/02_user_guide.md` — new "Feature workflow в существующем проекте (Mode 2)"
  subsection in `/feature` description (full recipe, 3-mode comparison table,
  step-by-step bash, all 3 sub-paths with code examples, init-preservation
  table, validation-thresholds, 4 enumerated caveats, verification, future
  enhancement reference to M3).
- `README/eng/02_user_guide.md` — parallel English version.

**Tracking:**
- `KNOWN_LIMITATIONS.md` — new entry M3 "`/feature` requires standard SPARC
  doc paths". Documents proposed fix (`docPaths` config in `.p-replicator.json`,
  `init --doc-paths-from <config>` flag, verify + meta-test). Effort: Tier S.

### Three supported sub-paths for Mode 2

| Path | When | Skills invoked |
|---|---|---|
| **A. /feature directly** | Single feature ≥4 files, new capability | sparc-prd-mini → requirements-validator → parallel implement → brutal-honesty-review |
| **B. /go auto-router** | Mixed complexity | Routes between /plan (≤3 files) and /feature (≥4 files) by heuristics |
| **C. Direct skill invocation** | Only validation cycle | requirements-validator + brutal-honesty-review skills directly |

### Tests

- Snapshot baseline regenerated — `templates/.claude/commands/feature.md`,
  `templates/.claude/rules/feature-lifecycle.md`, and
  `templates/.claude/commands/replicate.md` SHA-256 checksums updated.
- All 105 tests still green. No new tests added (Mode 2 has no CLI-level
  surface to assert; spec consistency covered by existing meta-tests).
- Meta-tests verified: replicate-pipeline.md still mentions all 11 pre-shipped
  commands; replicate.md Phase 3 still does NOT contain
  `Generate /commands/<pre-shipped>.md` patterns; both v1.5.1 and v1.5.2 spec
  additions coexist without conflict.

### HTML guide regeneration

`README/ru/html/index.html` regenerated via `node README/ru/html/build.js` to
pick up the new "Добавление фич в существующий проект (Mode 2)" sections in
both 01_quickstart.md and 02_user_guide.md. v1.5.1's link-rewriter
(`rewriteInternalLink`) handles cross-section anchor resolution automatically.

### Migration notes

- **No breaking changes.** Mode 2 was always supported via natural-language
  invocation — v1.5.2 simply formalizes and documents it across all surfaces.
- Users on v1.5.1 who already use this workflow continue to do so without
  changes; v1.5.2 just adds explicit spec backing and discoverability.
- `verify` and `doctor` exit codes unchanged.
- `manifest.shippedDefaults` schema unchanged.
- Pre-shipped contract unchanged (10 skills + 11 commands + 4 agents + 5 rules + settings.json).

---

## [1.5.1] - 2026-05-07

### Added — Documentation & spec for "starting from existing tech docs" workflow

A long-supported variant of `/replicate` is now formally documented across all
documentation surfaces. Users with existing technical documentation (tech spec,
architecture, API specs, design docs) can skip Phase 0 (Product Discovery) and
feed their docs directly into Phase 1 as pre-filled context.

**Spec docs (ship in npm tarball — visible to all installed users):**
- `templates/.claude/commands/replicate.md` — new top-level "Alternative entry"
  section after the Pipeline overview. Documents trigger detection (4 patterns:
  path reference, explicit skip request, statement of available docs, semantic
  flag), the modified Phase 1 behavior (AUTO mode, internal Explore/Research/Solve
  skipped, `[GAP: ...]` placeholders for missing slots), three sub-paths (A/B/C),
  caveats, verification steps, architecture-constraints reminder.
- `templates/.claude/commands/replicate.md` — Phase 0 Gate extended with a 4th
  rule: "Existing technical documentation provided → skip".
- `templates/.claude/rules/replicate-pipeline.md` — new "Alternative entry" section
  documenting the variant as officially supported, with trigger detection,
  modified flow, sub-path matrix, and explicit test-contract preservation note.

**User-facing docs (visible on GitHub + npm registry):**
- `README.md` (package root, auto-included in npm tarball) — new "Already have
  technical documentation?" subsection right after Quick Start, pointing to RU/EN
  user guides for the full recipe.
- `README/ru/01_quickstart.md` — new "Альтернативный вход — у меня уже есть
  техдокументация" section (3 sub-paths table, what changes per phase, caveats).
- `README/eng/01_quickstart.md` — parallel English version.
- `README/ru/02_user_guide.md` — new "Альтернативный вход" subsection in the
  `/replicate` description (full 3-path recipe with code examples, per-phase
  comparison table, caveats, verification, future enhancement reference).
- `README/eng/02_user_guide.md` — parallel English version.

**Tracking:**
- `KNOWN_LIMITATIONS.md` — new entry M2 "No formal `--from-docs` CLI flag for
  /replicate". The workflow is invoked via natural-language overrides; a formal
  flag with deterministic parsing is on the roadmap (Tier S effort).

### Three supported sub-paths

| Path | When | Skills invoked |
|---|---|---|
| **A. Full /replicate with override** | Have tech docs, want full pipeline + toolkit + scaffold | sparc-prd-mini (AUTO) → requirements-validator → cc-toolkit-generator-enhanced |
| **B. Direct sparc-prd-mini invocation** | Want only the 11 SPARC docs, no toolkit | sparc-prd-mini (AUTO) only |
| **C. Validation-only** | Existing docs already SPARC-shaped | requirements-validator only |

### Tests

- Snapshot baseline regenerated — `templates/.claude/commands/replicate.md` and
  `templates/.claude/rules/replicate-pipeline.md` SHA-256 checksums updated.
- All 105 tests still green. No new tests added (workflow has no CLI-level
  surface to assert; spec consistency covered by existing meta-tests).
- Meta-tests verified: replicate-pipeline.md still mentions all 11 pre-shipped
  commands; replicate.md Phase 3 still does NOT contain
  `Generate /commands/<pre-shipped>.md` patterns.

### Migration notes

- **No breaking changes.** The new entry mode is OPT-IN and additive.
- Users on v1.5.0 can already invoke this workflow via natural-language; v1.5.1
  formalizes and documents it across all surfaces.
- `verify` and `doctor` exit codes unchanged.
- `manifest.shippedDefaults` schema unchanged.
- HTML guide (`README/ru/html/index.html`) regenerated via
  `node README/ru/html/build.js` to pick up the MD updates.

---

## [1.5.0] - 2026-05-07

### Added — Two new user-facing features

#### 1. Multi-line statusLine dashboard (RuFlo-style)

Pre-shipped `statusline.cjs` script displays a dashboard above Claude Code's
prompt with real-time pipeline + roadmap + toolkit + status metrics. Six
content lines, ANSI-colored, defensive (every section wrapped in safe-guard
so a single parse error never breaks the whole bar).

**Layout:**
```
P-Replicator V1.5.0 ● user │ Sonnet 4.7
🚀 Pipeline   /<cmd> ▓▓▓░░░░ 50%  │ Phase: VALIDATE (2/4)  │ Last: /replicate
🎯 Roadmap    [●●●○○○○○] mvp 3/8   │ Done 5/12  │ ▶ auth-jwt  │ Domain: banking
📊 SPARC      ●11/11  │  🟢 78/100  │ Plans ●3  │ ADRs ●2  │ Harvest 2026-05-05
🛠️ Toolkit   Skills ●10/10 │ Cmds ●11/11 │ Agents ●4+3 │ Rules ●5+2 │ Hooks ●6/6
💡 Insights   ●12 (2026-05-06) │ Tests 85/85 ✓ │ MCP ●1/1 │ Settings ✓ │ 🧬 Keysarium ✓
```

**Sources (heuristic from filesystem + optional state-file):**
- Pipeline + phase: `.claude/.p-replicator-state.json` (commands write via `state-update.cjs`)
- Roadmap progress: `.claude/feature-roadmap.json`
- SPARC docs: `docs/PRD.md` ... `docs/ADR.md` (11 expected)
- Validation score: `docs/validation-report.md` (regex extracts `Score: NN`)
- Plans: `docs/plans/*.md` count
- ADRs: `docs/ADR.md` H2/H3 headings, or `docs/adr/*.md`, or `docs/ddd/adr/*.md`
- Insights: `.claude/insights/index.md` (`## YYYY-MM-DD` headings count + last date)
- Toolkit health: filesystem walks of `.claude/{skills,commands,agents,rules,hooks}/`
- Settings status: deep-equals `.claude/settings.json` vs `manifest.shippedDefaults` → `defaults` / `merged`
- MCP servers: `.mcp.json` server count
- Keysarium: `.keysarium.json` presence
- Domain: keyword grep in `CLAUDE.md` (banking / retail / enterprise / healthcare)
- Last harvest: `TOOLKIT_HARVEST.md` mtime
- Last test: optional `.claude/.last-test.json` cache

**Configuration:**
`templates/.claude/settings.json` registers the statusLine via Claude Code's standard config:
```json
{
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/statusline.cjs"
  }
}
```

**`state-update.cjs` companion script** — argv-driven helper for pipeline
commands. Pipeline commands can publish current state for the statusline:
```
node .claude/hooks/state-update.cjs --command /feature --phase VALIDATE --index 2 --total 4 --progress 0.5
```
Stale state (>30 min old) is automatically ignored by the statusline.

#### 2. `--feature-branches` flag for `/run` and `/go`

Per-feature git branch workflow for **teaching, code-review, and demo** use
cases. Each feature is implemented on a separate branch named
`feature/{NNN}-{id}` (e.g., `feature/001-auth-jwt`), pushed individually,
and the instructor can checkout any specific feature for demonstration.

**Usage:**
```bash
/run mvp --feature-branches              # autonomous loop, branch per feature
/run all --feature-branches --auto-merge # also merge each branch into main
/go auth-jwt --feature-branches          # single feature on its own branch
```

**Per-feature workflow (when `--feature-branches` is set):**
1. Verify on `main` (else fail with hint to switch)
2. If working tree dirty: `git stash push -u -m "auto-stash before /run feature-branches"`
3. Read roadmap entry; assign `number` if absent (`max(numbers) + 1`)
4. `git checkout -b feature/{NNN}-{id}` from main
5. Run delegated pipeline (`/plan` or `/feature`)
6. `git push origin feature/{NNN}-{id} --set-upstream`
7. Update roadmap: `status: done`, `branch: "feature/{NNN}-{id}"`
8. `git checkout main`
9. If `--auto-merge` flag: `git merge --no-ff feature/{NNN}-{id}`

**`--auto-merge` companion flag** — off by default. When passed alongside
`--feature-branches`, each feature branch is merged into `main` after the
feature completes. Without it, branches stay unmerged for instructor /
reviewer to handle (PR or manual merge).

**Roadmap schema extension:**
```json
{
  "id": "auth-jwt",
  "number": 1,                          // ← v1.5.0: auto-assigned
  "branch": "feature/001-auth-jwt",      // ← v1.5.0: populated when feature done
  ...
}
```

### Added (technical)

- `templates/.claude/hooks/statusline.cjs` (~330 LOC, standalone, zero deps)
- `templates/.claude/hooks/state-update.cjs` (~70 LOC, argv-driven)
- `statusLine` field in `templates/.claude/settings.json`
- `statusline` and `state-update` keys in `COMPONENTS.hooks.items` (now 6 hooks)
- `--feature-branches` flag documentation in `/run.md`, `/go.md`
- Roadmap schema extension (`number`, `branch` fields) documented in `/next.md`

### Tests

Suite grew from 93 to 105 (+12):
- 2 unit tests for hooks group items count (post-v1.5.0)
- 7 e2e tests for statusline (install, settings registration, exit code, output sections, ADRs/Plans counts, roadmap progress, defensive)
- 3 meta-tests for `--feature-branches` documentation in `/run.md`, `/go.md`, `/next.md`

Snapshot baseline: 113 → 115 files (+2: statusline.cjs + state-update.cjs).

### Migration notes

- **No breaking changes.** Run `npx @dzhechkov/p-replicator@1.5.0 update` or `init --force` (settings.json auto-merges, preserving customizations).
- **Statusline is opt-out via Claude Code's own config:** if you don't want it, remove the `statusLine` field from `.claude/settings.json` (the merge will preserve removal on next upgrade since the field is detected as a deletion).
- **Branch workflow is opt-in:** `--feature-branches` flag must be explicitly passed; legacy `/run mvp` works exactly as before.

## [1.4.3] - 2026-05-07

### Fixed (the v1.4.2 last known limitation)

- **Orphan hook detection on upgrade.** `mergeSettingsJson` (v1.4.2) preserved both user customizations AND old default hooks indefinitely. If a future package version removed a default hook (e.g., deprecated `autocommit-something.cjs` between v1.5 and v1.6), the user's `settings.json` would keep the obsolete hook forever — calling a script that no longer exists.

  **Solution:** v1.4.3 introduces a **shipped-defaults baseline** in the manifest. Each install/update snapshots the template's `settings.json` content into `manifest.shippedDefaults["settings.json"]`. On the next upgrade:
  - `oldTpl` = `manifest.shippedDefaults["settings.json"]` (what we shipped before)
  - `newTpl` = current `templates/.claude/settings.json`
  - Orphans = command strings in `oldTpl` but not in `newTpl`
  - User's `settings.json` is cleaned of orphans BEFORE merge

  **Identity model:** hooks are matched by their `command` string (set-comparison). User-modified defaults (different command-string) are correctly classified as user-added and preserved.

  **Backward compatibility:** Pre-1.4.3 manifests have no `shippedDefaults` field → orphan detection skipped on first upgrade (graceful degradation), then populated for next upgrade onward.

- **`update` now respects user customizations to settings.json.** Pre-v1.4.3, `npx p-replicator update` blindly overwrote `settings.json` if it appeared in the diff's `modified` array. Now it applies the same merge + orphan-cleanup logic as `init --force`. `--reset-settings` flag still available for explicit overwrite.

### Added

- `utils.removeOrphanHooks(existing, oldTemplate, newTemplate)` — orphan detection helper. Returns existing with all command-strings present in `oldTemplate` but absent in `newTemplate` removed. Pass-through if `oldTemplate` is null.
- `utils.extractCommands(hooksRoot)` — internal helper extracting Set of command strings from a hooks config.
- `manifest.shippedDefaults["settings.json"]` — snapshot of last-shipped settings template content.

### Changed

- `createManifest()` accepts optional 4th parameter `shippedDefaults`. Manifest schema is forward-compatible: old manifests without the field still load; tools without v1.4.3 logic ignore it.
- `init.js` reads `previousManifest` BEFORE overwriting; passes its `shippedDefaults` to `installComponent` for orphan detection.
- `update.js` now branches on settings.json files: regular files use `copyDirRecursive`, settings.json runs full merge + orphan-cleanup pipeline.
- `--reset-settings` flag now works for `update` too (was only init in v1.4.2).

### Tests

Suite grew from 85 to 93 (+8):
- 5 unit tests for `removeOrphanHooks` (null oldTemplate, orphan removal, kept-in-newTemplate, user-modified preserved, no-crash on missing hooks)
- 1 e2e test verifying `manifest.shippedDefaults` is populated after init
- 2 e2e tests for orphan detection on `init --force` (orphan removed, user-added preserved alongside orphan removal)

### Migration notes

- **Strictly safer behavior.** Existing customizations preserved as before; orphans now also cleaned up properly across version bumps.
- **First upgrade from pre-1.4.3** has no `shippedDefaults` baseline available, so orphan detection skips for that one upgrade. Manifest gets populated for next time onward. No user action required.
- **`update` now also merges settings.json.** If you relied on `update` overwriting custom settings, add `--reset-settings` flag.

## [1.4.2] - 2026-05-06

### Fixed (the 3 v1.4.1 known limitations)

- **`init --force` now MERGES `settings.json` with user customizations** instead of overwriting. New algorithm in `utils.mergeSettingsJson`:
  - Top-level fields: template fills only what user lacks (no overwrite of user-only fields)
  - `hooks` per event-type: template hooks added if event missing; existing matchers get template hooks appended (de-duped by command string); user-only matchers (e.g., custom `Bash` matcher) preserved
  - User-added event types (e.g., `PreToolUse`) preserved verbatim
  - Identical commands (same string) NOT duplicated
- **`--reset-settings` flag added** for explicit nuclear-overwrite of settings.json. Use when you want to discard all customizations and start from package defaults: `npx p-replicator init --force --reset-settings`.
- **Stronger meta-test for `replicate.md` Phase 3 drift.** Old test caught only `Generate \.claude/commands/<cmd>\.md` literal phrasing; new test:
  - Multi-verb pattern: `(generate|create|produce|write|make|output)\\s+...<cmd>\\.md`
  - Section-scoped to "Generate these project-specific files" sub-section (so legitimate "do NOT overwrite" mentions don't trigger false positives)
  - List-style detection: `[-*]\\s*\`<cmd>\\.md\`` catches bullet-listed filenames
  - Allowlist for `feature-ent` (legitimate Phase 3 conditional generation)
- **`doctor` now checks `git` on PATH.** New "Prerequisites" section reports: pass if `git --version` succeeds, fail with clear message if not — explains why autocommit hooks (roadmap, insights, plans) would silently no-op without git.

### Added

- `utils.mergeSettingsJson(existing, template)` — public helper for JSON-aware merge
- `utils.mergeHookEvents(existing, template)` — internal helper for per-event merge
- `utils.mergeHookMatchers(existing, template)` — internal helper for per-matcher merge with command-string de-dup
- CLI flag `--reset-settings`

### Changed

- `installComponent()` in `init.js` accepts an `options` parameter; for single-file JSON components with `fileExists(dest)`, MERGES instead of overwriting (unless `options.resetSettings` is true)
- `--help` mentions the new `--reset-settings` flag

### Tests

Suite grew from 74 to 85 (+11):
- 6 unit tests for `mergeSettingsJson` (null cases, hook merge, de-dup, custom event preservation, top-level user fields)
- 3 e2e tests for settings merge behavior (preserve, reset, custom event)
- 1 e2e test for doctor Prerequisites section
- 1 strengthened meta-test (replaces old single-verb pattern)

### Migration notes

- **No breaking changes for typical workflow.** `init --force` now PRESERVES user customizations by default — strictly safer than v1.4.1.
- **Users who relied on `init --force` to fully reset settings.json**: add `--reset-settings` flag explicitly.

## [1.4.1] - 2026-05-06

### Fixed (the 3 v1.4.0 known limitations)

- **Cross-platform hooks (no more bash dependency).** Replaced inline `git ... 2>/dev/null || true` shell chains in `settings.json` with calls to dedicated Node scripts (`node .claude/hooks/<name>.cjs`). 4 new hook scripts shipped — all use `execFileSync('git', [...])` (no shell pipes, no platform-specific redirect syntax). Works identically on Windows-cmd, macOS/Linux bash, and Git Bash on Windows.
- **`verify.js` now derives both contracts from SSOT — no more hardcoded `POST_REPLICATE_HINTS`.** `utils.COMPONENTS` extended with `kind: 'pre-shipped' | 'project-generated'` field, plus 3 new project-generated groups (`projectAgents`, `projectRules`, `projectFiles`). `verify` iterates by kind, removing the duplicated post-/replicate artifact list. Adding/removing project-specific artifacts now requires editing only `utils.js`.
- **Meta-tests for replicate.md ↔ replicate-pipeline.md consistency.** Two new tests detect future drift: (a) `replicate-pipeline.md` mentions every pre-shipped command name (drift = silent contract violation), (b) `replicate.md` Phase 3 does NOT contain `Generate .claude/commands/<pre-shipped>.md` patterns. Catches the most common drift signatures.

### Fixed (architectural sync regression discovered during v1.4.1 development)

- **`scripts/sync-templates.js` now operates in MERGE mode** (not destructive clean-and-replace). Previous behavior: `cleanDir(dest)` before `copyRecursive(src, dest)` — which silently DELETED any file in `templates/.claude/<dir>/` not present in source `.claude/<dir>/`. This caused all v1.4.0 pre-shipped commands and rules to be wiped on every `npm publish --dry-run`. New behavior: `ensureDir(dest)` + `copyRecursive(src, dest)` — source files overwrite (canonical SoT preserved), but pre-shipped target-only files survive.
- **Source repo `.claude/` updated to mirror v1.4 pre-shipped templates.** The 11 commands + 5 rules + hooks + settings.json now live in `pu-unicorn-replicate-main/.claude/` (canonical SoT), so future syncs are idempotent.

### Added

- **6th pre-shipped COMPONENTS group: `hooks`** — describes the 4 cross-platform Node hook scripts as a manifest-tracked component group. Doctor now reports a "Hook scripts (expected 4)" section.
- **`utils.getItemRelativePath(comp, itemKey)` helper** — centralizes path derivation for both pre-shipped (skills: `<src>/<name>/SKILL.md`, commands: `<src>/<name>.md`, hooks: `<src>/<name>.cjs`) and project-generated (items keys ARE full paths) groups. Used by `verify.js`.

### Changed

- **`init.js` and `update.js` filter `Object.keys(COMPONENTS)` by `kind === 'pre-shipped'`** before installing/manifest-tracking. Project-generated groups have no `src` field and are not installable.
- **`doctor.js` now uses dynamic counts** (`Skills (expected ${EXPECTED_SKILLS.length})`) and includes a hooks section.
- **Manifest grew from 5 components to 6** (added `hooks` group). `manifest.components.sort()` now equals `['agents', 'commands', 'hooks', 'rules', 'settings', 'skills']`.

### Tests

Suite grew from 60 to 74 (+14). New tests:
- 4 unit tests for `COMPONENTS.kind` discrimination + group counts
- 5 unit tests for `getItemRelativePath` (settings.json, skills, commands, hooks, project-generated)
- 3 e2e tests for hook scripts (existence, settings.json references Node not bash, syntax validity)
- 2 meta-tests for `replicate-pipeline.md` ↔ `replicate.md` consistency

Snapshot baseline regenerated: 109 → 113 files in `templates/`.

### Migration notes

- **No breaking changes.** Run `npx @dzhechkov/p-replicator@1.4.1 init --force` to update an existing project.
- **Settings.json change is NON-DESTRUCTIVE.** If a user has customized their `settings.json` with project-specific hooks, `init --force` will overwrite. Recommendation: review settings.json after upgrade and re-add custom hooks. Future enhancement: settings.json merge instead of overwrite.

## [1.4.0] - 2026-05-06

### Added — Pre-shipped post-/replicate workflow toolkit

Closes the long-standing pain where users had to manually verify (via a
dedicated prompt) that `/replicate` Phase 3 generated all expected artifacts.
Sherlock-style audit found **5 internal sources of truth had drifted** (see
`docs/ADR-001` notes below). Resolution: pre-ship project-agnostic artifacts
in the npm tarball so `/replicate` Phase 3 can ENHANCE rather than CREATE
them.

**9 new commands shipped by `init`** (added to `templates/.claude/commands/`):
- `/start` — bootstrap project from SPARC docs (4-phase: Foundation → Packages parallel → Integration → Finalize)
- `/plan` — lightweight planning to `docs/plans/<feature>.md` (auto-commit via Stop hook)
- `/feature` — full SPARC-mini feature lifecycle (PLAN → VALIDATE → IMPLEMENT → REVIEW)
- `/go` — intelligent pipeline router (delegates to `/plan` or `/feature` based on complexity scoring)
- `/run` — autonomous build loop (`/next` → `/go` → repeat over MVP or all features)
- `/next` — pick next feature from `.claude/feature-roadmap.json` (with `update` and `<feature-id>` subcommands)
- `/myinsights` — capture and recall development insights
- `/docs` — bilingual documentation generator (RU + EN)
- `/deploy` — deployment workflow (dev / staging / prod tiers)

**3 new rules shipped by `init`** (added to `templates/.claude/rules/`):
- `git-workflow` — commit/push discipline + Conventional Commits
- `insights-capture` — when/how to record development "грабли" (rakes)
- `feature-lifecycle` — `/feature` 4-phase governance + scoring thresholds

**`.claude/settings.json` shipped** with hooks:
- `SessionStart`: inject the 3 most recent insights into Claude's initial context
- `Stop`: auto-commit `.claude/feature-roadmap.json`, `.claude/insights/`, and `docs/plans/` if changed

**New CLI command — `npx @dzhechkov/p-replicator verify`:**
- Checks pre-shipped contract (10 skills + 11 commands + 4 agents + 5 rules + settings.json)
- Detects whether `/replicate` was run (via CLAUDE.md / feature-roadmap.json presence)
- Reports project-specific artifact status (planner/code-reviewer/architect agents, security/coding-style rules, project-context skill, etc.) as advisory hints
- Replaces the user's manual verification prompt with a single, repeatable command
- Exit code 0 if pre-shipped contract OK, non-zero if any pre-shipped artifact missing

### Changed

- **`utils.COMPONENTS` extended with `settings` group.** Single-file component
  (`src: '.claude/settings.json'`, `isFile: true`). `installComponent()` in
  `init.js` now handles single-file vs directory components correctly.
- **`utils.COMPONENTS.<group>.items` extended.** Commands map grew from 2 to 11
  entries; rules map grew from 2 to 5. Doctor counts (`Skills (expected N)`)
  derive `N` dynamically from `EXPECTED_*.length`, so further additions to
  `items` automatically update doctor output.
- **`templates/.claude/commands/replicate.md` Phase 3 rewritten.** Removed
  generation steps for files now pre-shipped (`start.md`, `plan.md`, `deploy.md`,
  `feature.md`, `myinsights.md`, generic rules, settings.json). Phase 3 now
  generates ONLY project-specific artifacts (project agents, security rules
  derived from NFRs, project-context skill, CLAUDE.md, scaffolds).
- **`templates/.claude/rules/replicate-pipeline.md` rewritten.** "What Gets
  Generated vs Pre-existing" section now reflects reality: 11 commands, 5
  rules, settings.json, all 4 pipeline agents, all 10 skills are pre-shipped.

### Fixed (root cause of "manual-verification pain")

Five internal sources of truth had drifted in v1.3.x:
1. `replicate.md` Phase 3 spec (line 222-225) claimed `/feature` and `/myinsights` "already exist"
2. `replicate-pipeline.md` rule listed those same commands as "Generated by /replicate"
3. `cc-toolkit-generator-enhanced/modules/04-05` had reference templates for `/run`, `/next`, `/go`, `/docs` that the LLM was expected to read and copy verbatim — but did so unreliably (skill itself documents `In a real project, skipping modules/04-generate-p1.md caused 10+ artifacts to be silently omitted`)
4. README.md promised post-pipeline commands as outputs
5. `cli.js showHelp` advertised "1 rule" while `EXPECTED_RULES` had 2 entries (regression fixed in 1.3.1)

After v1.4.0 there is **one source of truth** — `utils.COMPONENTS.items` —
consumed by all 5 surfaces (init, doctor, list, verify, cli help).

### Migration notes

- **No code changes for v1.3.x users.** Run `npx @dzhechkov/p-replicator@1.4.0 init --force` in any project to land the new pre-shipped workflow commands. Existing project-generated files (`CLAUDE.md`, `planner.md`, etc.) are not touched.
- **Existing manifest entries are preserved.** The v1.4 manifest is a superset; remove or re-init does not lose project state.
- **No breaking changes to existing commands.** `/replicate`, `/harvest`, `init`, `update`, `remove`, `list`, `doctor` behave as before — but now coexist with the new pre-shipped commands.

### Tests

Suite grew from 52 to 60 tests (45 baseline + 5 SSOT + 2 manifest preservation + 8 v1.4: 4 unit covering `COMPONENTS.items` post-v1.4 contract, 4 e2e covering pre-shipped commands/rules/settings.json + verify command). All green on baseline. Snapshot baseline regenerated: 96 → 109 files in `templates/`.

## [1.3.1] - 2026-05-06

### Fixed

- **`--help` displays correct component counts.** Previously hardcoded `"1 rule"` while `doctor.js` `EXPECTED_RULES` had two entries (`replicate-pipeline`, `skill-interface-protocol`). All counts (`10 skills`, `2 commands`, `4 agents`, `2 rules`) are now derived from `utils.COMPONENTS.items` and stay in sync automatically.
- **`update` + `remove` no longer destroys project-generated files.** `update.js` previously rebuilt `manifest.files` by walking the user's full `.claude/` directory, which captured files generated by `/replicate` (e.g. `start.md`, `feature.md`, `plan.md`) into the manifest. A subsequent `remove` would then delete those user-owned files, contradicting `remove.js`'s own footer guarantee:
  > "Project-specific files were NOT removed: Generated commands (/start, /feature, /plan, etc.)"

  `update.js` now tracks only files shipped by the package's `templates/`, so user-generated files are never recorded in `manifest.files` and are never deleted by `remove`.
- **Orphan template files are now cleaned up on update.** When a file previously shipped by the package is removed in a new version, `update` deletes it from the user's `.claude/`. Project-generated files are unaffected because they were never in the old manifest's `files` list.

### Changed

- **`utils.COMPONENTS.items` is the single source of truth for component names + descriptions.** Each component group (`skills`, `commands`, `agents`, `rules`) now declares an `items: { name: description }` map. Replaces hardcoded duplicates that previously lived independently in:
  - `doctor.js` (`EXPECTED_SKILLS`, `EXPECTED_COMMANDS`, `EXPECTED_AGENTS`, `EXPECTED_RULES`)
  - `list.js` (`SKILL_DETAILS`, `COMMAND_DETAILS`, `AGENT_DETAILS`)
  - `cli.js` `showHelp()` (count strings)
- **`update.js` manifest source switched from project to package.** New `manifest.files` is built from `getRelativePaths(templateClaude)` instead of `getRelativePaths(projectClaude)`. Closes the data-loss path described above and makes the manifest a true list of "files this package owns."

### Added

- **Regression test suite (52 tests, ~9 sec, zero runtime deps).** Three layers using the built-in `node:test` runner:

  | Layer | File | Tests | Covers |
  |-------|------|-------|--------|
  | L2 unit | `tests/unit/utils.test.js` | 30 | `createManifest`, `readJSON`/`writeJSON`, `fileExists`, `ensureDir`, `getRelativePaths`, `copyDirRecursive`, `copyDirFiltered`, `diffFiles`, `COMPONENTS` shape + `items` SSOT |
  | L1 e2e | `tests/e2e/lifecycle.test.js` | 19 | full CLI lifecycle (`--version`, `--help`, `init`, `list`, `doctor`, `update`, `remove`, unknown command) + the two regressions fixed in this release |
  | L3 snapshot | `tests/snapshot/templates.test.js` + `update-baseline.js` + `baseline.json` | 3 | SHA-256 baseline of all 96 files in `templates/` — fails on any unintended drift |

- **New npm scripts:**
  - `npm test` — full suite
  - `npm run test:unit`, `test:e2e`, `test:snapshot` — by layer
  - `npm run test:doctor` — legacy smoke (`node bin/cli.js doctor`)
  - `npm run snapshot:baseline` — regenerate `tests/snapshot/baseline.json` after intentional template changes

### Migration notes

- **No action required for existing installs.** Run `npx @dzhechkov/p-replicator@1.3.1 update` in any project. The new `update` will preserve user-generated files automatically.
- **Users on 1.3.0 who experienced data loss** from an `update → remove` sequence after running `/replicate` can simply re-run `/replicate` to regenerate the lost files. The bug is fixed going forward.

## [1.3.0]

Initial published baseline. 10 skills (foundation + composite + master orchestrator `cc-toolkit-generator-enhanced` with 9 modules), 2 commands (`/replicate`, `/harvest`), 4 agents (`replicate-coordinator`, `product-discoverer`, `doc-validator`, `harvest-coordinator`), 2 rules (`replicate-pipeline`, `skill-interface-protocol`). 5-phase pipeline: Discovery → Planning (SPARC docs) → Validation (5-agent swarm, score ≥ 70 = READY) → Toolkit Generation → Finalization.
