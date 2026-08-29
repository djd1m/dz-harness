# Known Limitations

Open limitations of `@dzhechkov/p-replicator` that are accepted trade-offs in
the current version but warrant attention in future iterations. Each item
lists severity, version introduced, proposed fix, and effort estimate.

For *resolved* limitations, see [CHANGELOG.md](./CHANGELOG.md).

---

## Medium priority

### M1. `--feature-branches` behavior tested only via documentation-presence

- **Introduced:** v1.5.0
- **Status:** open
- **Severity:** Medium
- **Tags:** testing, e2e, git-workflow

**Why it's a limitation:**
The flag's docs are validated by meta-tests (`/run.md` and `/go.md` mention
`--feature-branches`, `feature/{NNN}-{id}` format, `--auto-merge`,
`auto-stash`). But the actual git workflow (branch creation, push, roadmap
update, optional merge, recovery from dirty tree) is **not** exercised in any
test. Regression in the documented workflow would slip past the suite.

**Proposed fix:**
Add an e2e test that:
1. Initializes a tmp project with `git init`
2. Creates a fake `.claude/feature-roadmap.json` with 2-3 features
3. Spawns Claude Code (or simulates the workflow with a stub) running
   `/run mvp --feature-branches --auto-merge`
4. Asserts: feature branches created with correct names, pushed (to local
   bare remote), roadmap updated with `number`+`branch`, main contains merge
   commits.

**Effort:** Tier M (~3-4 hours). Requires git stub or real spawn of Claude
Code which complicates CI portability. Could use `simple-git` library or
shell out to git directly.

**Workaround until fixed:** Manual smoke test in a real Claude Code session.

---

### M2. No formal `--from-docs` CLI flag for /replicate

- **Introduced:** v1.5.1 (workflow documented but invocation is heuristic)
- **Status:** open
- **Severity:** Medium
- **Tags:** cli, ergonomics, replicate-flow

**Why it's a limitation:**
The "starting from existing technical docs" workflow (added in v1.5.1 to all
documentation surfaces — README.md root, RU/EN user guides, replicate.md spec,
replicate-pipeline.md rule) is invoked via natural-language overrides in
`/replicate` input ("use my docs in `<path>`, skip Phase 0"). There is no
formal CLI flag like `/replicate --from-docs <path> --skip-discovery` that the
LLM can detect deterministically. The trigger detection is heuristic — it works
in practice but isn't easy to test or guarantee.

**Proposed fix:**
1. Extend `templates/.claude/commands/replicate.md` with explicit flag-parsing
   instructions in the command's frontmatter (`argument-hint: --from-docs <path>`)
2. Add deterministic flag-detection logic at the start of /replicate:
   - Parse `--from-docs <path>` and `--skip-discovery` from the command input
   - Set state-file fields: `entry_mode: "from-docs"`, `existing_docs_path: <path>`
3. Document the formal flags in the user guide (RU + EN) Path A snippet
4. Optionally — add a thin wrapper command `/replicate-from-docs <path>` that
   delegates to `/replicate` with pre-set overrides
5. Add a meta-test asserting that the documented flags are consistently mentioned
   in spec + rule + user guides

**Effort:** Tier S (~2-3 hours). Pure markdown spec + docs sync. No CLI code
changes (the flag is parsed by the LLM, not by `bin/cli.js`).

**Workaround until fixed:** Use natural-language pattern documented in
`README/{ru,eng}/02_user_guide.md` "Starting from existing tech docs" / "Альтернативный вход".

---

### M3. `/feature` requires standard SPARC doc paths (no `--prd-path` flag)

- **Introduced:** v1.5.2 (Mode 2 workflow formalized but doc paths are hardcoded)
- **Status:** open
- **Severity:** Medium
- **Tags:** ergonomics, feature-flow, doc-paths, mode-2

**Why it's a limitation:**
The "Feature workflow in existing project" scenario (Mode 2, added in v1.5.2 to
all documentation surfaces — README.md root, RU/EN quickstart + user guides,
feature.md spec, feature-lifecycle.md rule) requires the user to have their PRD,
Specification, and Architecture docs at standard SPARC paths (`docs/PRD.md`,
`docs/Specification.md`, `docs/Architecture.md`). There are no `--prd-path`,
`--spec-path`, or `--docs-dir` flags for `/feature`. Existing projects with
docs at non-standard locations (e.g., `docs/product/PRD.md`,
`documentation/architecture.md`) must rename files or create symlinks one-time.

**Proposed fix:**
1. Add `docPaths` config in `.p-replicator.json` schema:
   ```json
   {
     "docPaths": {
       "prd": "docs/product/PRD.md",
       "specification": "docs/specs/main-spec.md",
       "architecture": "docs/architecture/system.md"
     }
   }
   ```
2. `/feature` resolves paths via `docPaths.<slot>` (with fallback to standard
   `docs/<Slot>.md` if config missing)
3. `verify` validates all `docPaths` entries exist
4. `init --doc-paths-from <config>` flag for one-shot config bootstrap from
   existing project layout
5. Update RU + EN user guides with the config example
6. Add meta-test asserting docPaths resolution honored

**Effort:** Tier S (~3-4 hours). Pure config + spec read changes; no CLI
command code rewrites. Backward-compatible (default behavior preserved).

**Workaround until fixed:** Rename or symlink existing docs to standard SPARC
slot names. This is a one-time operation per project. Documented in
`README/{ru,eng}/02_user_guide.md` "Feature workflow в существующем проекте (Mode 2)" /
"Feature workflow in an existing project (Mode 2)".

---

## Low priority

### L1. `shippedDefaults` baseline tracks only `settings.json`

- **Introduced:** v1.4.3
- **Status:** open
- **Severity:** Low
- **Tags:** orphan-detection, manifest-schema, generality

**Why:**
v1.4.3's `shippedDefaults` mechanism solves orphan detection only for
`settings.json`. If a future version needs the same protection for another
shipped JSON file (e.g., `.claude/feature-roadmap.json` defaults, or a new
`.mcp.json` template) — the baseline tracking has to be extended.

**Proposed fix:**
Generalize `shippedDefaults` from a single-file snapshot to a multi-file map.
`removeOrphanHooks` would become `removeOrphanFromConfig(existing, oldTpl,
newTpl, configType)` with type-aware diff strategies (hooks for
settings.json, items for roadmap, etc.).

**Effort:** Tier S-M (~1-2 hours). Mostly schema generalization + tests.

---

### L2. Hook identity via `command` string is fragile

- **Introduced:** v1.4.2 (`mergeSettingsJson`), v1.4.3 (`removeOrphanHooks`)
- **Status:** open
- **Severity:** Low
- **Tags:** identity-model, settings-json, false-positives

**Why:**
Hook commands are compared by their `command` string for de-dup and orphan
detection. If a template changes a hook's command string slightly (e.g., adds
a flag like `--silent`), the old version is treated as orphan and the new as
addition — usually correct. But if a user customized the command (e.g.,
changed timeout from 10 to 30 — but command unchanged), they keep their
customization (correct). Edge case: user TWEAKED the command (e.g., adjusted
script path), then on upgrade the old command is removed AND the new
command is added — the user's tweak is discarded.

**Proposed fix (option A):** Add stable `_id` field to template hooks.
Identity by id, not command-string. Pollutes settings.json schema slightly.

**Proposed fix (option B):** Track per-hook ownership (template vs user) in
manifest. More intrusive but cleaner.

**Effort:** Tier M (~4 hours). Need careful migration for existing manifests.

**Workaround:** User can re-customize after upgrade if their tweaks were lost.

---

### L3. No e2e tests for `update` + orphan detection (only for `init --force`)

- **Introduced:** v1.4.3
- **Status:** open
- **Severity:** Low
- **Tags:** testing, e2e, regression-risk

**Why:**
v1.4.3 added the same `mergeSettingsJson` + `removeOrphanHooks` pipeline to
both `init.js` and `update.js`. E2E tests cover `init --force` thoroughly
(orphan removed, user-added preserved, --reset-settings resets). Equivalent
tests for `update` path don't exist — `update.js` is implicitly trusted
because it uses the same helpers.

**Proposed fix:**
Add 3 e2e tests mirroring the v1.4.3 init e2e tests, but for `update`
command. Same setup (init → mutate settings.json → modify template → call
update), same assertions.

**Effort:** Tier S (~30 min, copy-paste-adapt of existing init tests).

---

### L4. Validation score regex pattern catches only one format

- **Introduced:** v1.5.0 (statusline.cjs)
- **Status:** open
- **Severity:** Low
- **Tags:** statusline, parsing, fragility

**Why:**
`statusline.cjs` extracts validation score from `docs/validation-report.md`
via regex: `(?:average\s+)?score[:\s]+(\d{1,3})(?:\s*\/\s*100)?`. This
catches "Score: 78", "Average Score: 78/100", but if a future
`requirements-validator` skill outputs a different format (e.g.,
"Total: 78", "Final: 78%", or YAML-style `score: 78`), the parser misses
and statusline shows no score badge.

**Proposed fix:**
Extend the regex with multiple patterns:
```js
const patterns = [
  /(?:average\s+)?score[:\s]+(\d{1,3})/i,
  /total[:\s]+(\d{1,3})\s*\/?\s*100/i,
  /final[:\s]+(\d{1,3})/i,
  /^score:\s*(\d{1,3})\s*$/im,
];
```
Or formalize: `requirements-validator` skill outputs a machine-readable
sidecar `docs/validation-summary.json` with `{score: N}`, parse that
directly. More robust.

**Effort:** Tier S (~30 min for regex extension, Tier M for sidecar).

---

### L5. State-file `.claude/.p-replicator-state.json` not auto-gitignored

- **Introduced:** v1.5.0 (state-update.cjs + statusline.cjs)
- **Status:** open
- **Severity:** Low
- **Tags:** gitignore, ephemeral-state, accidental-commit

**Why:**
The state-file is ephemeral — it tracks *current* command + phase + progress
for live statusline display. It changes every few seconds during a pipeline
run. If a user commits everything in `.claude/` (which is normal because
that's the project's Claude Code config), the state-file gets committed too,
then changes again, creating noisy diff churn.

**Proposed fix (option A):** `init` appends `.claude/.p-replicator-state.json`
to project's `.gitignore` if not already present. Less invasive: add to
`/start.md` template the instruction "Add `.claude/.p-replicator-state.json`
and `.claude/.last-test.json` to .gitignore".

**Proposed fix (option B):** Move ephemeral state out of `.claude/` to a
separate cache dir `.p-replicator-cache/` (which has its own gitignore
expectation). Cleaner separation of project-config vs runtime-cache.

**Effort:** Option A: Tier S (~15 min). Option B: Tier S-M (~1 hour, requires
updating statusline.cjs paths).

---

### L6. Statusline render time not measured

- **Introduced:** v1.5.0
- **Status:** open
- **Severity:** Low
- **Tags:** performance, observability

**Why:**
The statusline runs on every Claude Code prompt. If filesystem operations
get slow (very large `docs/` tree, network drives, etc.), the prompt
visibly lags. There's no instrumentation to detect or report this. User
notices "prompt is slow" without a clear signal that statusline is the
culprit.

**Proposed fix:**
Add optional `STATUSLINE_PROFILE=1` env-var that prints elapsed time per
section to stderr. Captured by Claude Code as debug output. Not visible by
default — opt-in via `STATUSLINE_PROFILE=1 claude`.

**Effort:** Tier S (~30 min, just `process.hrtime.bigint()` deltas around
each parser).

**Workaround:** None until measured. If render becomes slow, suspect
statusline first; can disable by removing `statusLine` field from
`.claude/settings.json`.

---

### L7. Statusline assumes 5 SPARC docs always required

- **Introduced:** v1.5.0
- **Status:** open
- **Severity:** Low
- **Tags:** statusline, hardcoded-list, generality

**Why:**
`statusline.cjs:parseSparcDocs()` has a hardcoded list of 11 expected SPARC
docs. If `sparc-prd-mini` skill evolves to add a 12th doc or rename one,
statusline shows incorrect "N/11". Same SSOT-divergence pattern as Fix #1
fought.

**Proposed fix:**
Source the expected list from the `sparc-prd-mini` skill itself (e.g., its
SKILL.md frontmatter or a `references/expected-outputs.json`). Statusline
reads that at runtime.

**Effort:** Tier M (~2 hours, requires schema decision in sparc-prd-mini
side too).

---

## Summary

| Priority | Count | Total effort estimate |
|----------|-------|----------------------|
| Medium   | 1     | ~3-4 hours |
| Low      | 6     | ~6-8 hours |
| **Total** | **7** | **~10-12 hours** |

Pick the items that match current goals; each is independent and can be
addressed in any order. The Medium-priority M1 (real git e2e for
`--feature-branches`) gives the highest confidence boost for the v1.5.0
teaching workflow if the package gets real classroom usage.
