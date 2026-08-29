# 07. Changelog (краткая версия)

Эволюция пакета по релизам. Полные detail'и — в `../../CHANGELOG.md`
(авторитетный источник).

## v1.5.14 — 2026-07-28

**Фиксы документации и упаковки** (по результатам верификации пакета; код
рантайма не менялся).

- 📚 Закрыт пробел changelog v1.5.5–v1.5.13 в `CHANGELOG.md` + README
- 📦 `CHANGELOG.md` / `KNOWN_LIMITATIONS.md` / `MULTIPLATFORM_ROADMAP.md` /
  `tests/` теперь входят в tarball (ссылки в доках работают; `npm test`
  работает в установленном пакете — MEASURED: 105/105 в распакованном паке)
- 🔗 Ссылки GitHub → монорепо `github.com/djd1m/dz-harness-hub`
  (`packages/@dzhechkov/p-replicator`)
- 🔢 Число символов скиллов в npm description 194K+ → 880K+ (MEASURED:
  `find templates/.claude/skills -type f -exec cat {} + | wc -c` → 880,679)

## v1.5.13 — 2026-07-10

- 🐛 `brutal-honesty-review/schemas/output.json`: `trustTier` `const: 3` →
  диапазон 1–3

## v1.5.11 / v1.5.12 — 2026-07-06

- ✨ `brutal-honesty-review` получил `evals/`, `schemas/output.json`,
  `scripts/validate-config.json` (baseline-heal); v1.5.12 = только синк версий

## v1.5.9 / v1.5.10 — 2026-07-06

- 🔒 Честный rewrite `goap-research-ed25519`: Ed25519 = provenance +
  tamper-evidence под pinned issuer-ключами, НЕ анти-галлюцинация (нетто
  −1,696 строк — MEASURED: `git diff --stat 9f18ec43 41ec8d36`)
- 🐛 `remove --dry-run` больше не удаляет манифест; `remove` сохраняет
  манифест, если часть файлов не удалилась; v1.5.10 = только синк версий

## v1.5.8 — 2026-06-29

- 🆕 `trust_tier` frontmatter у vendored-скиллов + ADR-0001 `sources.json`
  (provenance) + опциональная секция UI-репликации (`clone-website`)
  (MEASURED: `git diff c9225e8f 9f18ec43 -- packages/@dzhechkov/p-replicator`)

## v1.5.7 — 2026-06-16

- 🐛 Неизвестные опции / лишние аргументы CLI теперь дают exit 1
- 🐛 Манифест `init` строится по TEMPLATE-источнику, а не сканом назначения

## v1.5.5 / v1.5.6 — 2026-06-11

- 📦 Первые релизы из монорепо (`dz-harness-hub`); удалён деструктивный
  `prepublishOnly` sync-хук; `explore` получил `trust_tier` frontmatter

## v1.5.4 — 2026-05-13

- 🐛 URL `$schema` в settings.json → вариант `json.schemastore.org` (вариант
  `www.` заставлял Claude Code пропускать весь settings-файл)

## v1.5.1 – v1.5.3 — 2026-05-07

- 📚 Только документация: workflow existing-docs (v1.5.1), Mode 2 (v1.5.2),
  npm README расширен ~14.6 kB → ~50 kB (v1.5.3)

## v1.5.0 — 2026-05-07

**Две фичи + 12 новых тестов.**

- ✨ **Statusline dashboard** (RuFlo-style 6-line multi-line status bar) через
  `templates/.claude/hooks/statusline.cjs`
- ✨ **`--feature-branches` flag** для `/run` и `/go` (workflow для обучения /
  демо: каждая фича на отдельной ветке `feature/{NNN}-{id}`)
- 🆕 `state-update.cjs` — argv-driven helper для pipeline команд писать прогресс
- 🆕 Roadmap schema расширена: `number` (auto-assigned), `branch` (populated при
  done)
- 🆕 `--auto-merge` companion flag (off by default)
- 📊 105 tests / 36 suites / 113 → 115 файлов в snapshot baseline

## v1.4.3 — 2026-05-07

**Orphan hook detection.**

- 🐛 **Closed last v1.4.2 limitation:** `mergeSettingsJson` теперь cleans
  hooks которые были shipped в прошлой версии но удалены в новой
- 🆕 `manifest.shippedDefaults['settings.json']` — baseline для orphan detection
- 🆕 `removeOrphanHooks(existing, oldTpl, newTpl)` helper
- 🐛 **Bonus fix:** `update.js` теперь тоже использует merge-логику (был bug:
  blindly overwrite settings.json)
- 📊 93 tests, +8 от v1.4.2

## v1.4.2 — 2026-05-06

**3 v1.4.1 limitations устранены.**

- 🐛 `init --force` теперь MERGE settings.json (preserves user customizations)
- 🆕 `--reset-settings` flag для explicit nuclear-overwrite
- 🐛 Stronger meta-test для `replicate.md` drift (multi-axis: verbs +
  section-scope + list-style + allowlist)
- 🆕 `doctor` checks `git on PATH` (Prerequisites section) — explains why
  autocommit hooks could silently no-op
- 📊 85 tests, +11 от v1.4.1

## v1.4.1 — 2026-05-06

**3 v1.4.0 limitations + 1 critical regression discovery.**

- 🐛 **Cross-platform hooks:** заменены bash-chains на 4 Node-скрипта
  (`session-insights`, `autocommit-{roadmap,insights,plans}`)
- 🐛 **`verify.js` SSOT:** `kind: 'pre-shipped' | 'project-generated'` field
  + 3 новых project-generated groups
- 🐛 **Meta-tests** для `replicate.md` ↔ `replicate-pipeline.md` consistency
- 🐛 **Critical regression discovered + fixed:** `sync-templates.js` cleanDir
  тихо удалял pre-shipped файлы во время `npm publish --dry-run`. Switched to
  MERGE mode
- 🆕 6th COMPONENTS group: `hooks` (4 cross-platform Node scripts)
- 🆕 `getItemRelativePath()` helper для централизованного path-derivation
- 📊 74 tests, +14 от v1.4.0

## v1.4.0 — 2026-05-06

**Major release — 9 pre-shipped команд + verify command.**

- ✨ Закрыт корневой источник pain: `/replicate` Phase 3 больше не пытается
  генерировать generic команды. Все 11 commands + 5 rules + settings.json +
  4 hooks теперь pre-shipped через `init`
- ✨ **9 новых pre-shipped команд:** `/start`, `/plan`, `/feature`, `/go`,
  `/run`, `/next`, `/myinsights`, `/docs`, `/deploy`
- ✨ **3 новых pre-shipped rules:** `git-workflow`, `insights-capture`,
  `feature-lifecycle`
- ✨ **Settings.json shipped** with hooks (SessionStart insights inject + Stop
  auto-commit)
- ✨ **`verify` command** — replaces user's manual verification prompt
- 🐛 5 sources of truth divergence (`replicate.md`, `replicate-pipeline.md`,
  cc-toolkit modules, README, cli help) unified via `utils.COMPONENTS.items`
- 📊 60 tests, +8 от v1.3.1

## v1.3.1 — 2026-05-06

**Two real bug fixes.**

- 🐛 **`cli.js` --help showed «1 rule» while `EXPECTED_RULES` had 2 entries.**
  SSOT fix: `COMPONENTS.<group>.items` map is single source of truth for
  counts, used by doctor/list/cli.js help via dynamic derivation
- 🐛 **`update.js` corrupted manifest** — walked user's full `.claude/`,
  capturing project-generated files into `manifest.files`. Subsequent
  `remove` would delete them, contradicting documented behavior. Fixed by
  using `getRelativePaths(templateClaude)` instead
- 🐛 Bonus: `update` now removes orphan template files (files in old manifest
  but not in new template) — addresses original v1.3.0 concern about ignored
  `missing[]` from `diffFiles`
- 📊 52 tests, +7 от v1.3.0

## v1.3.0 (baseline)

Initial published version. 10 skills, 2 commands (`/replicate`, `/harvest`),
4 agents, 2 rules. SPARC documentation pipeline + knowledge extraction.

---

## Migration по версиям

| From → To | Команда |
|---|---|
| 1.3.x → 1.5.0 | `npx @dzhechkov/p-replicator@1.5.0 init --force` (preserves customizations) |
| Любая → latest | `npx @dzhechkov/p-replicator@latest update` |
| Полный reset | `... init --force --reset-settings` (потеряете custom hooks) |

После любого upgrade — `verify` для проверки contract:

```bash
npx @dzhechkov/p-replicator verify
```

---

## Patterns persisted в AQE memory

Каждое значимое улучшение зафиксировано как pattern (для cross-session
learning):

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

Каждый pattern содержит: context, problem, solution, verification, tradeoffs,
applied-to (version/file).

---

## Полный CHANGELOG

См. `../../CHANGELOG.md` — авторитетный источник с полным detail'ями всех
версий, migration notes, breaking changes (которых не было — все upgrade'ы
backward-compatible).
