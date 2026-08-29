# Changelog

## [1.5.1] - 2026-08-21

### Changed — the Step-8 amendment gate is a COMMAND, and the durable writers are witnessed

- `AMENDMENT_GATE` no longer asks the QE agent to judge whether every `AM-N` row names a real test.
  It runs `dz amendment-check --slug <slug> --json` and reports the parsed verdict; the old judgement
  wording is REMOVED from both workflow copies and all four `modules/08-qe.md` copies, not
  accompanied. MEASURED 2026-08-21: `features/qe-scoped-review` shipped with five named amendment
  test ids of which none existed, while its plan recorded `## Amendments: None`.
- the run-cost ledger and the training-pair capture (including backfill) stop handing a subagent a
  pre-baked shell string carrying their payload — the shape a security classifier blocked nine times
  in one run. Both now call `dz feature-adr-record`. The `sed` that rewrote `"date":null` / `"ts":null`
  inside an already-serialised document is gone: the command stamps before serialising.
- a record failure still NEVER fails the run, but now survives it: `recordFailures` is returned from
  every exit instead of scrolling past inside one log line.

Requires `@dzhechkov/harness-core >= 0.6.1`.

## [1.5.0] - 2026-08-21

### Changed — feature `qe-scoped-review`

### Changed — Step-8 Codex QE is SCOPED, and every fallback names its cause

Not published. Behaviour change to the Step-8 QE dispatch only; routing, the Claude belt, checkpoints
and training-pair capture are untouched.

- **The measurement that forced it** (same question, same model `gpt-5.6-sol` at effort `high`,
  2026-08-21): an UNSCOPED `codex exec` QE prompt of 19 038 chars spent 280 s, exited 124 and produced
  416 KB of exploration with NO verdict — and did it again under a 1500 s ceiling. The same question
  scoped to two named files answered in 41 s with `Grade: B`; `codex review --commit` answered in
  146 s with the scope derived from the diff. The budget went on RECONNAISSANCE, so raising the
  timeout buys more of it, and the prompt ceiling was never the binding constraint (19 038 < 24 000,
  with ~5 000 chars of headroom). The harm was not the minutes: on timeout the dispatch returns null,
  the belt runs a Claude reviewer, and cross-family QE is lost SILENTLY on exactly the large features
  that need it most.
- **Mode A — `codex review`** is now the primary Step-8 Codex pass; the diff defines the scope.
  Default `--uncommitted`, overridable with `args.qeScope` / `args.qeScopeRef`. The builder can never
  emit `-m` and never appends a positional prompt: MEASURED, `codex review` rejects `-m` with exit 2,
  and EVERY scope flag (`--commit`, `--base`, `--uncommitted`) rejects `[PROMPT]` with exit 2. Either
  mistake would present as a review that silently did not happen.
- **Mode B — a NARROWED `codex exec`** carries our own questions over at most 3 named files and ends
  with `Grade: <A|B|C|D>`. An unscoped mode-B dispatch is not constructible: an empty file list yields
  `''`, and `codexExecPlan` now refuses an unscoped `qe` prompt outright.
- **A locked decline taxonomy** — `timeout | no-verdict | tool-error | unusable-output | unavailable |
  over-ceiling` — replaces the single generic reason. A timeout ("narrow the scope") and a broken
  invocation ("fix the command") can no longer render the same string inside
  `opus (cross-family QE DID NOT happen — …)`. An unknown kind throws rather than rendering something
  plausible.
- **A machine sentinel** (`CODEX-QE-SIGNAL exit=… elapsed=…s bytes=…`, the Step-7.5 landing-signal
  grammar) carries the exit code past the shell agent, so a timeout is knowable without asking a model
  to self-report its own failure. A MISSING sentinel is classified `tool-error` on the pipeline path —
  never a pass.
- **Zero findings is never an `A`.** Mode A cannot be asked for a letter, so its grade is derived from
  the severities the reviewer reported and labelled `gradeSource: 'derived-from-findings'`; an empty or
  unparseable finding set yields `null` and declines. MEASURED: `codex review` on a clean tree exits 0
  with a well-formed, entirely empty review — the exact input that a default letter would have turned
  into a clean bill of health.
- **`qe` now returns `gaps` from the reviewer's actual findings**, plus `gradeSource` and
  `qeScope {mode, ref, files}`; the review scope enters the `qe` checkpoint hash so a resume cannot
  present a mode-B verdict as a mode-A one.
- **`CODEX_EXEC_PROMPT_CEILING_CHARS` is retained but DEMOTED** — it is a sanity bound on an absurd
  payload, and is no longer documented as the thing that prevents a stall. The defence is scope.
- **Unchanged on purpose:** `resolveQeSpec` / `coderIsCodex` / `qeShouldUseCodex` (verified correct by
  direct call), the `crossFamilyQe` label format, and the Claude belt — the pipeline still never blocks
  on Codex.

### Fixed — the K2 plan gate could not complete a run on a non-JS repository

- **C2 recognises test paths in every ecosystem.** The gate demanded a `.test.(ts|mjs|js)` suffix, so
  a Python/Go/Rust/JVM/.NET feature could never satisfy it (measured: 4/4 JS forms matched, 0/11
  non-JS). Replaced by a two-stage predicate — a language-neutral candidate-path extractor plus one
  `$`-anchored rule per ecosystem (JS/TS, pytest `test_*.py` + `*_test.py`, Go, Rust `tests/*.rs` +
  `tests.rs`, JVM, .NET). Widening it to "contains the word test" was rejected: `docs/testing.md`,
  `src/latest.rs` and prose are still refused. An unknown ecosystem stays a FAIL, never a WARN.
- **New opt-in `testPathRules`** in the existing `architecture/project-skills.json`: additive rules,
  each anchored by wrapping so an alternation cannot leak, capped at 200 characters, and FATAL when
  malformed (`NOT-ESTABLISHED`, exit 3) rather than silently falling back to the built-ins.
- **The gate script is resolved from the WORKSPACE first.** The command `cd`s into the target repo,
  so the repo-relative path died with `Cannot find module` on any repo without its own feature-adr
  install. Order: `args.gateScript` (new, absolute, validated) → workspace copy → repo copy, with
  `K2_GATE_SCRIPT=` / `K2_GATE_TRIED=` echoed for audit. Nothing found ⇒ reason `tooling-missing`
  (a NOT-ESTABLISHED, never a skip), and the operator note now says the gate could not be RUN and
  that this is not a plan defect — it no longer tells you to fix a plan that is fine.
- **A relative `args.dzBin` is pinned to the workspace root once**, before any `cd`, so the six
  commands that splice it stop resolving against three different bases (a null usage probe was being
  read upstream as "the Claude limit was hit").

### Changed — `EXPECTED_CODE_TARGETS` admissibility (C3)

- Dotfile targets (`.claude/…`, `.github/workflows/ci.yml`, `.gitignore`, `.env.example`) are
  admissible — previously feature-adr could not name its own files or any CI config, in any language.
- Directory-shaped targets are now REJECTED (`trailing slash — names a directory, not a file`): a bare
  directory gives plan-vs-diff matching nothing concrete to verify.
- Every refusal names its own defect instead of one catch-all: `path traversal ('..' segment)`,
  `degenerate path segment`, `empty path segment`, `path segment ends with '.'`,
  `illegal character '<c>'`, `empty stem after the leading dot`. The traversal check is a SEGMENT
  test now, so the ordinary filename `foo..bar.ts` is no longer called a path traversal.

### Requires

- Nothing new at runtime: the workflow INLINES the gate command builder and its parser (the sandbox
  cannot import), so this release is self-contained. The pure halves it mirrors live in
  `@dzhechkov/harness-core` (`planCompletenessGateCmd` gained an optional 4th argument;
  `refusalNoteFor` and `normalizeDzBin` are new) and a drift test pins the two copies together.


### Fixed — Step 0 wrote nothing down, so the tier was unreadable and the acid check had no input

- **Step 0 now WRITES `00_complexity_assessment.md`** before returning: the tier with its decisive
  criterion, the active steps, the recalled patterns, and an acid-case table whose rows are pinned to
  the exact `| A<n> | <bad input> | <what must happen> |` shape the K2 gate parses. MEASURED
  2026-08-21: 66 of 199 features carried that file and the last four in a row did not. Two silent
  consequences — the tier was recorded NOWHERE while a run was alive (the checkpoint lands at phase
  end, the result object only at the very end), and the C4 acid check quietly switched itself off,
  including for the features that introduced it. An honest no-acid-cases run still writes prose and
  no table; the gate now tells an ABSENT file from a deliberate skip.
- **A caller-forced tier is the tier of record.** `tier = args.tier || router.tier` means the run
  executes the override while Step 0 wrote down its own classification. The artifact now carries
  `Effective tier: <forced> (forced by the caller)` alongside the router's own recommendation, and
  sizes the acid table for the effective tier. With no override the prompt is byte-identical.
- **A pre-contract router checkpoint no longer resumes into the new contract** — the resume gate only
  asks whether the artifact is PRESENT, and any of the 66 features with a tableless file satisfied it.

### Fixed — the Step-8 QE stage measured the wrong thing in four different ways

- the change set is the run's DELTA (pre-code baseline vs after), not the working tree's current dirt;
- a finding whose location cannot be parsed is `unlocatable` and stays in the graded set — it used to
  be filed as someone else's dirt, i.e. unknown counted as clean;
- mode B refuses a scope built from unlanded code, an unmeasured change set or an empty intersection;
- the QE scribe is WITNESSED: the report is re-hashed before and after, so an existing file from an
  earlier run can no longer stand in for one this run never wrote.

### Fixed — durable state is written by a command, not by hand

- checkpoint lines now go through `dz feature-adr-checkpoint`. The subagent RUNS a command instead of
  hand-writing state into a file: a security classifier blocked NINE consecutive checkpoint writes in
  one run, `.fa-state/checkpoints.jsonl` was never created, resume was silently dead, and the run
  reported success.

## [1.4.0] - 2026-08-20

### Changed — the composite design checkpoint

- The Step 1–5 design fan is checkpointed **per sibling** instead of as one composite entry, so one
  dead agent no longer discards three finished siblings. Each sibling's resume key carries its own
  steering inputs, including its prompt text: fixing one step's instructions invalidates that step
  and nothing else.
- An incomplete fan is **refused** at the Step-5/6 boundary (`phase: 'design-incomplete'`) instead of
  being handed to the planner. Previously the completeness verdict was computed and only logged, and
  Step 6 planned off a null design. The refusal captures training pairs and appends a cost-ledger row
  on the way out, so a stopped run is neither silent nor invisible to cost analysis.
- Three named reasons with distinct repairs — `substage-missing`, `artifact-missing`,
  `probe-not-established`. Under `resume:'force'` the artifact-missing repair says `resume:'never'`,
  because force skips artifact probes and a plain re-invoke would loop forever.
- The artifact check no longer lists a directory: it runs `[ -f <exact path> ]` per required
  artifact. A listing is a list of filenames, and a file whose NAME ends in a newline was measured
  satisfying the requirement for the real file.
- The probe transcript is validated strictly rather than scanned. It is relayed by an agent, not read
  from a pipe, and an agent that narrates the expected output emits the token byte-identically —
  which produced a false pass on a missing artifact before this release. Inconclusive is never a pass.

### Requires

- `@dzhechkov/harness-core >= 0.5.4`. The checkpoint schema is now `fa-ckpt-3`: every existing
  `.fa-state/checkpoints.jsonl` reads as no checkpoint, so each in-flight feature re-runs
  router+design+plan once.

### Verification

Eight cross-family review rounds (Codex `gpt-5.6-sol` at xhigh, each pinned to a sha256 of the
reviewed files): D → D → D → B → C → C → D → **A**, the last with no new defects. Full ladder in
`features/feature-adr-hardening/composite-design-checkpoint.md`.


### Follow-up (QE LOW gaps closed before publish)
- **Upstream deletions**: `update` now removes files the template dropped (manifest-tracked orphans only; user-created untracked files are never touched) — previously `diff.missing` was computed but ignored. Shown in the summary + `--dry-run` (`- DEL`). Tests: Case G/H.
- Removed a dead `unchanged` branch in the directory update path (unreachable — `diff.modified` guarantees bytes differ).
- `safeHashFile` guards the TOCTOU window (file vanishing mid-update → skip+warn, not a crash).


All notable changes to `@dzhechkov/skills-feature-adr` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.23] - 2026-07-06

### Fixed

- **`update` no longer silently drops upstream changes (false "locally modified").** The manifest previously stored installed files as an array of paths only, so `update` could only do a 2-way content compare between the new template and the currently-installed file. A template file that evolved upstream but that the user never edited (`src != dest`) was wrongly classified `modified` and kept — the upstream update was silently not applied. `update` now performs a true **three-way merge** (baseline / mine / theirs): an evolved-but-unedited file **is updated**, and a genuinely user-edited file **is kept** with a now-*true* "locally modified, kept" warning.

### Added

- **Per-file SHA-256 baseline in the manifest.** `init` records a new additive `hashes` map (`{ "<relpath>": "<sha256 of the template bytes as installed>" }`) alongside the existing `files` array. `files` stays an array, so `remove` / `doctor` / `list` are unchanged. `update` reads these baselines to classify each file three-way and rewrites them to the new template's hashes afterward (idempotent re-runs).
- **`node:test` suite** (`test/`) with a `"test"` script (`node --test`), zero new dependencies. Covers the load-bearing truth table and the two inverse-error boundaries (evolved-unedited → updated; user-edited → kept), plus legacy fallback, `--force`/`.bak`, self-heal, back-compat, and idempotence.

### Notes

- **Backward compatible.** A manifest from any prior version (no `hashes` key) is treated as "legacy — no baseline": every differing file falls back to today's conservative keep+warn (no clobber). The first `update` writes a fresh `hashes` map (self-heal), so true 3-way is available from the next run. A pre-fix install whose upgrade only *modifies* existing files may need one `update` (to self-heal the baseline) or a `--force` before evolved-but-unedited files auto-apply. Old CLI versions ignore the additive `hashes` key, so a downgrade stays safe.

## [1.3.13] - 2026-07-03

### Added

- **Durable half of the pattern-memory loop** via `dz teach` / `dz recall` — patterns produced by the QE steps now persist across sessions through the harness memory layer (complements the session-local aqe loop from 1.3.12).

## [1.3.12] - 2026-07-03

### Added

- **aqe pattern-memory loop in Steps 0/8/9** (Direct modes, non-blocking): query stored patterns at Step 0, store QE outcomes at Steps 8/9 — panel-recommended integration.
- Consolidation maintenance docs for the pattern memory.

## [1.3.11] - 2026-07-03

### Added

- README Troubleshooting section: running `npx` inside a monorepo with npm workspaces.

## [1.3.10] - 2026-07-03

### Fixed

- **All confirmed P1/P2 findings from the package audit** (adversarially verified):
  - Installer safety: per-file overwrite guard, path-traversal containment, keysarium-preserve behavior, `.bak` backups on `update`, `isFile` checks.
  - Metadata: removed stale `main` entry; live `bugs` / `homepage` URLs.
  - Docs: Step 3.5/9 step-count accounting corrected.

## [1.3.9] - 2026-07-03

### Changed

- Onboarding pointers now lead to the public rendered GitHub page.

## [1.3.8] - 2026-07-03

### Added

- Team Onboarding playbook now ships inside the package (`docs/`), publicly viewable via unpkg.

## [1.3.7] - 2026-07-03

### Added

- README pointer to the Team Onboarding playbook.

## [1.3.6] - 2026-07-03

### Added

- "Self-Learning Layers" section in the README.

## [1.3.5] - 2026-07-03

### Added

- "Fable?" column and model-routing guidance in the Pipeline Steps table.

## [1.3.4] - 2026-07-03

### Added

- Detailed Spec-Driven Development (SDD) section published in the npm README.

## [1.3.3] - 2026-06-16

### Fixed

- CLI rejects unknown options — a typo can no longer fall through to a destructive operation (#302).
- Template-source manifest added; `update` keeps optional components that were installed via `init` flags (#305).
- Reconciled template drift with sibling toolkits (governance pass, #310).

## [1.3.2] - 2026-06-11

### Fixed

- Defused destructive `prepublishOnly` template-sync hook (#280).
- Metadata + provenance corrections: registry category, `sources.json`, LICENSE (#286).
- Shipped as part of the P0–P5 audit publish wave (#288).

## [1.3.1] - 2026-05-06

### Fixed

- **`--with-learning` and `--knowledge-extractor` flags now actually install their components.** In 1.3.0 the flags were advertised by the CLI but the `prepublishOnly` step (`scripts/sync-templates.js`) did not bundle the corresponding template files, so `init` emitted `Template source not found` warnings and silently skipped them. The published tarball now includes:
  - `lib/memory-protocol.md`
  - `lib/reward-tracker.md`
  - `.claude/rules/reward-learning.md`
  - `.claude/skills/knowledge-extractor/` (full directory: `SKILL.md` + `modules/` + `references/` + `templates/`)
  - `.claude/commands/harvest.md`
- **`update` no longer reports `Unknown component` for skipped optional components.** When a template source was missing, `init` still recorded its key in the manifest's `components` array. On a later `update` pass, those orphan keys triggered noisy warnings. `init` now only writes optional component keys whose templates were actually present and whose installation produced files.
- The `[optional]` lines printed in the success summary now reflect what was actually installed (no longer claims `✓` for components whose templates were missing).

### Changed

- `scripts/sync-templates.js`:
  - `FEATURE_ADR_FILTERS.commands` extended to also match `harvest*.md` (alongside `feature-adr*.md`), so `templates/.claude/commands/` ships both `feature-adr.md` and `harvest.md`.
  - New step `2d` copies the three optional learning files (`lib/memory-protocol.md`, `lib/reward-tracker.md`, `.claude/rules/reward-learning.md`) when they exist in the project root.
  - New step `2e` copies the entire `.claude/skills/knowledge-extractor/` directory.
  - Each optional source is reported individually with `[OK]` / `[WARN]` lines.

### Migration notes

- **No action required for existing installs** that ran with `--with-learning` or `--knowledge-extractor` against 1.3.0 — the manifest there records the keys but the files are missing on disk. Re-run with `--force` after upgrading to refill the missing templates:
  ```bash
  npx @dzhechkov/skills-feature-adr@1.3.1 init --with-learning --knowledge-extractor --force
  ```
- Installs that used neither optional flag are unaffected.

## [1.3.0]

Initial published baseline (April 2026). 11-step pipeline with Complexity Router (S/M/L/XL), 15 agentic-qe skills, three install modes (`--full-qe`, `--full-qe-extended`, `--with-learning`, `--knowledge-extractor`).
