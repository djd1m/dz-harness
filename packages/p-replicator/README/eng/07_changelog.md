# 07. Changelog (concise)

Per-release evolution. Full details — in `../../CHANGELOG.md` (authoritative).

## v1.5.14 — 2026-07-28

**Docs & packaging fixes** (package-verification findings; no runtime code changes).

- 📚 Changelog gap v1.5.5–v1.5.13 closed in `CHANGELOG.md` + README highlights
- 📦 `CHANGELOG.md` / `KNOWN_LIMITATIONS.md` / `MULTIPLATFORM_ROADMAP.md` /
  `tests/` now ship in the tarball (doc links resolve; `npm test` works in the
  installed package — MEASURED: 105/105 in the unpacked pack)
- 🔗 GitHub links → monorepo `github.com/djd1m/dz-harness-hub`
  (`packages/@dzhechkov/p-replicator`)
- 🔢 npm description skill char-count 194K+ → 880K+ (MEASURED:
  `find templates/.claude/skills -type f -exec cat {} + | wc -c` → 880,679)

## v1.5.13 — 2026-07-10

- 🐛 `brutal-honesty-review/schemas/output.json`: `trustTier` `const: 3` →
  range 1–3

## v1.5.11 / v1.5.12 — 2026-07-06

- ✨ `brutal-honesty-review` gained `evals/`, `schemas/output.json`,
  `scripts/validate-config.json` (baseline-heal); v1.5.12 = version-sync only

## v1.5.9 / v1.5.10 — 2026-07-06

- 🔒 `goap-research-ed25519` honesty rewrite: Ed25519 = provenance +
  tamper-evidence under pinned issuer keys, NOT anti-hallucination (net
  −1,696 lines — MEASURED: `git diff --stat 9f18ec43 41ec8d36`)
- 🐛 `remove --dry-run` no longer deletes the manifest; `remove` keeps the
  manifest when some files fail to delete; v1.5.10 = version-sync only

## v1.5.8 — 2026-06-29

- 🆕 `trust_tier` frontmatter on vendored skills + ADR-0001 `sources.json`
  provenance record + optional `clone-website` UI-replication section
  (MEASURED: `git diff c9225e8f 9f18ec43 -- packages/@dzhechkov/p-replicator`)

## v1.5.7 — 2026-06-16

- 🐛 Unknown options / unexpected CLI arguments now exit 1
- 🐛 `init` manifest tracks the TEMPLATE source, never a destination scan

## v1.5.5 / v1.5.6 — 2026-06-11

- 📦 First monorepo releases (`dz-harness-hub`); destructive `prepublishOnly`
  sync hook removed; `explore` skill gained `trust_tier` frontmatter

## v1.5.4 — 2026-05-13

- 🐛 settings.json `$schema` URL → `json.schemastore.org` variant (the `www.`
  variant made Claude Code skip the whole settings file)

## v1.5.1 – v1.5.3 — 2026-05-07

- 📚 Docs-only patches: existing-docs workflow (v1.5.1), Mode 2 formalized
  (v1.5.2), npm README expanded ~14.6 kB → ~50 kB (v1.5.3)

## v1.5.0 — 2026-05-07

**Two features + 12 new tests.**

- ✨ **Statusline dashboard** (RuFlo-style 6-line multi-line status bar) via
  `templates/.claude/hooks/statusline.cjs`
- ✨ **`--feature-branches` flag** for `/run` and `/go` (teaching/demo workflow:
  each feature on its own branch `feature/{NNN}-{id}`)
- 🆕 `state-update.cjs` — argv-driven helper for pipeline commands to publish progress
- 🆕 Roadmap schema extended: `number` (auto-assigned), `branch` (populated when done)
- 🆕 `--auto-merge` companion flag (off by default)
- 📊 105 tests / 36 suites / 113 → 115 files in snapshot baseline

## v1.4.3 — 2026-05-07

**Orphan hook detection.**

- 🐛 **Closed last v1.4.2 limitation:** `mergeSettingsJson` now cleans hooks
  shipped previously but removed in newer template
- 🆕 `manifest.shippedDefaults['settings.json']` — baseline for orphan detection
- 🆕 `removeOrphanHooks(existing, oldTpl, newTpl)` helper
- 🐛 **Bonus fix:** `update.js` now also uses merge logic (was a bug: blindly
  overwrote settings.json)
- 📊 93 tests, +8 from v1.4.2

## v1.4.2 — 2026-05-06

**3 v1.4.1 limitations resolved.**

- 🐛 `init --force` now MERGES settings.json (preserves user customizations)
- 🆕 `--reset-settings` flag for explicit nuclear-overwrite
- 🐛 Stronger meta-test for `replicate.md` drift (multi-axis: verbs +
  section-scope + list-style + allowlist)
- 🆕 `doctor` checks `git on PATH` (Prerequisites section)
- 📊 85 tests, +11 from v1.4.1

## v1.4.1 — 2026-05-06

**3 v1.4.0 limitations + 1 critical regression discovery.**

- 🐛 **Cross-platform hooks:** replaced bash chains with 4 Node scripts
- 🐛 **`verify.js` SSOT:** `kind: 'pre-shipped' | 'project-generated'` field
  + 3 new project-generated groups
- 🐛 **Meta-tests** for `replicate.md` ↔ `replicate-pipeline.md` consistency
- 🐛 **Critical regression discovered + fixed:** `sync-templates.js` cleanDir
  silently deleted pre-shipped files during `npm publish --dry-run`. Switched
  to MERGE mode
- 🆕 6th COMPONENTS group: `hooks` (4 cross-platform Node scripts)
- 🆕 `getItemRelativePath()` helper
- 📊 74 tests, +14 from v1.4.0

## v1.4.0 — 2026-05-06

**Major release — 9 pre-shipped commands + verify command.**

- ✨ Closed root cause of pain: `/replicate` Phase 3 no longer tries to
  generate generic commands. All 11 commands + 5 rules + settings.json + 4
  hooks now pre-shipped via `init`
- ✨ **9 new pre-shipped commands:** `/start`, `/plan`, `/feature`, `/go`,
  `/run`, `/next`, `/myinsights`, `/docs`, `/deploy`
- ✨ **3 new pre-shipped rules:** `git-workflow`, `insights-capture`,
  `feature-lifecycle`
- ✨ **Settings.json shipped** with hooks
- ✨ **`verify` command** — replaces user's manual verification prompt
- 🐛 5 sources of truth divergence unified via `utils.COMPONENTS.items`
- 📊 60 tests, +8 from v1.3.1

## v1.3.1 — 2026-05-06

**Two real bug fixes.**

- 🐛 **`cli.js` --help showed "1 rule" while `EXPECTED_RULES` had 2 entries.**
  SSOT fix: `COMPONENTS.<group>.items` map is single source of truth
- 🐛 **`update.js` corrupted manifest** — captured project-generated files,
  causing data loss on subsequent `remove`. Fixed by using
  `getRelativePaths(templateClaude)` instead of `projectClaude`
- 🐛 Bonus: `update` now removes orphan template files
- 📊 52 tests, +7 from v1.3.0

## v1.3.0 (baseline)

Initial published version. 10 skills, 2 commands (`/replicate`, `/harvest`),
4 agents, 2 rules. SPARC documentation pipeline + knowledge extraction.

---

## Per-version migration

| From → To | Command |
|---|---|
| 1.3.x → 1.5.0 | `npx @dzhechkov/p-replicator@1.5.0 init --force` (preserves customizations) |
| Any → latest | `npx @dzhechkov/p-replicator@latest update` |
| Full reset | `... init --force --reset-settings` (loses custom hooks) |

After any upgrade — `verify` to confirm contract:

```bash
npx @dzhechkov/p-replicator verify
```

---

## Patterns persisted in AQE memory

Each significant improvement persisted as a pattern (cross-session learning):

- v1.3.1: `cli-package-ssot-component-lists`, `cli-package-manifest-preservation`,
  `tdd-red-test-must-trigger-bug`
- v1.4.0: `cli-package-pre-ship-vs-generate-boundary`,
  `cli-package-verify-replaces-manual-prompts`,
  `documentation-source-of-truth-divergence`
- v1.4.1: `cli-package-cross-platform-hooks-via-node-scripts`,
  `cli-package-kind-discrimination-for-ssot`,
  `npm-package-prepublish-clean-and-replace-anti-pattern`
- v1.4.2: `cli-package-settings-json-merge-vs-overwrite`,
  `meta-test-multi-axis-drift-detection`, `cli-doctor-prerequisites-section`
- v1.4.3: `cli-shipped-defaults-baseline-for-orphan-detection`,
  `cli-update-must-mirror-init-merge-logic`
- v1.5.0: `cli-statusline-multi-line-dashboard`,
  `cli-feature-branches-flag-for-teaching-workflows`

Each pattern contains: context, problem, solution, verification, tradeoffs,
applied-to (version/file).

---

## Full CHANGELOG

See `../../CHANGELOG.md` — authoritative source with full details, migration
notes, breaking changes (none — all upgrades backward-compatible).
