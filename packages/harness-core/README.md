# @dzhechkov/harness-core

Shared logic for the DZ harness — the engine behind `@dzhechkov/harness-cli`
and any other consumer.

## Test execution

`npx vitest run` uses two projects and returns one combined verdict: `parallel` runs the ordinary
suites concurrently, while `serial` runs process-spawning and real-time suites one file at a time.
The serial paths in `test/serial-suites.txt` are regenerated from
`test/serial-suites-census.test.ts`, which scans test sources for process and timing markers,
including `execSync(` and `execFile(`, and fails when the list and census differ.

### Full-suite worker ceiling (`CORE_MAX_WORKERS`, `vitest.config.ts`)

The root `test` block caps `maxWorkers` at `CORE_MAX_WORKERS` (2, `minWorkers: 1`), so
`npx vitest run` with no flags is safe by default. **The ceiling lives on the root `test` block,
not on the `parallel` project's `poolOptions`** — an earlier version of this config set
`poolOptions.forks.maxForks` on the `parallel` project instead, and that was a false guarantee: a
fix-round measurement (2026-09-16) compared process names (`node (vitest N)`, polled from
`/proc/<pid>/cmdline`) over the same 30-file parallel set and saw names `vitest 1`..`vitest 7`
(14 workers observed) under the project-level `poolOptions`, against never more than
`vitest 1`/`vitest 2` under either a `--maxWorkers=2` CLI flag or `maxWorkers` on the root `test`
block. Vitest 3.2.4 simply does not honour `poolOptions.forks.maxForks` set on a project the way it
honours the root-level knob (or the equivalent CLI flag) — full proof in
`features/core-suite-memory-ceiling/07_code_changes/change_manifest.md`, section "Фикс-раунд 1".

The number itself is not "8 minus a guess" — it is arithmetic from a MEASURED trace (see the
comment above the constant in `vitest.config.ts`): the memory pressure is NOT the embedding model
loaded inside the vitest worker (that guess is REFUTED), it is a CHILD process that some tests
spawn per file (an embedding daemon, or a `dz teach` invocation). On 2026-09-16 three full-suite
runs were traced with the same instruments, and each number below
says WHICH run produced it, because two of the three runs did not have a ceiling that actually
bound:

| run | ceiling | tree peak | minimum free | result |
|---|---|---|---|---|
| 06:24–06:29 | `--maxWorkers=2` CLI flag (binds) | 5721 MB | 2995 MB | green, 7018 passed, 281 s |
| 06:46–06:49 | `poolOptions` on the `parallel` project (does NOT bind — effectively unbounded) | 8207 MB | 804 MB | green, but see below |
| 07:01–07:06 | root `test.maxWorkers` (binds), **no flags** | 5383 MB | 3804 MB | green, 333 files, 7024 passed, 275 s |

The last row is the profile of the shipped configuration — the command a person actually types.
The middle row is the DEFECT being measured, not this configuration, and it is where the
per-process-class peaks come from: a `vitest` process 2324 MB, an embedding-daemon child spawned by
a test 2321 MB, a child `dz teach --from-json` 1786 MB, with up to 4 daemon children alive at once
(3917 MB combined). Those per-class numbers are real, but quoting them as the memory profile of the
2-worker run would be a misattribution — a Codex round-2 finding, fixed here.

The load-bearing fact stays: the memory is NOT the embedding model inside the vitest worker, it is
in the CHILD processes the tests spawn, and the ceiling bounds how many worker-plus-child pairs are
alive together. `CORE_MAX_WORKERS` must not be raised without a fresh trace of the last shape.

`vitest.config.ts` also fails LOUD at config-load time if `CORE_MAX_WORKERS` is ever set to
something other than a positive integer (0, negative, or fractional) — a Codex fix-round finding
that a ceiling accepting those values is not a ceiling at all.

`test/mutation-registry.json`'s `maxWorkers` is kept equal to this same constant
(`test/suite-worker-ceiling.test.ts` reddens if either drifts from the other).

`findExactLesson(records, text, domain?)` finds the earliest lesson whose trimmed,
whitespace-collapsed text matches exactly (case-sensitive), optionally within one metadata domain,
and reports whether that existing lesson is quarantined.

Карантин: источник правды — лексический стор; зеркало — проекция; `dz vector reindex`
пересобирает зеркало из лексических записей и восстанавливает паритет меток. Прямая правка
зеркала не меняет авторитетное состояние и при следующем перестроении будет утрачена.

`countLearningStoreRowsReadonly()` reports the mirror as TWO figures, deliberately not one.
`vectorRows` stays the whole mirror (lessons + backlog ideas + book units) because the store guard
reads it as an integrity signal against a recorded high-water mark; narrowing it would present a
healthy store as a collapse. `vectorLessonRows` counts mirrored LESSONS only (`dz-teach` and
`dz-learning`) and is the figure comparable with `lexicalRows`. It survives the metadata fallback
path whenever `task_type` is still readable, and is absent when the mirror cannot be decomposed —
absent means "unknown", which the panel must report rather than treat as agreement.
If a readonly guard count meets another SQLite writer, the guard reports `busy`: the write is not
refused, health is explicitly not measured for that run, and the high-water mark does not move.
`statuslineData().patternMirror` is absent on equal counts AND when there is no mirror at all —
nothing to compare, and a permanently-lit indicator on every project without a vector tier would
carry no information. It is `{ state: 'different', lexical, vector }` on divergence, and
`{ state: 'unavailable' }` only when the mirror EXISTS but cannot be read or decomposed: that is a
tool failure and it is worth saying out loud. `statuslineData().brainKuCounts` carries the KU volume of each brain source in
brain order; an empty array means the volumes could not be listed, never that the sources are empty.

## Core boundary checks

Run `npx vitest run test/core-boundary.test.ts` from this package. Rule A scans top-level
`src/*.ts` (excluding `*.generated.ts`) for `process.argv` and `process.exit` in code using
TypeScript's AST. Comments and literal text are excluded; expressions inside template
interpolations are code. The scanner is internal to this test and is not exported from `index.ts`.

`rule A: debt` remains red while existing violations remain; it has no exceptions.
`rule A: scanner` separately compares the measured locations with the pinned requirements list.
The corrected list contains two debts: `brain.ts:995` and `integration-probe-worker.ts:304`.
Measured with `npx vitest run test/core-boundary.test.ts -t 'rule A: (scanner|debt)'`: the scanner
test passes and the debt test fails with those locations. `integration-probe-worker.ts:308`
uses `process.exitCode`, and `setup.ts:172` is template text; neither violates rule A.
No debt is repaired by this change.

The IO ratchet pins **57 files / 66 imports** in `test/core-boundary-ratchet.json`, measured with
`npx vitest run test/core-boundary.test.ts -t 'IO ratchet'`. It counts import declarations,
import-equals, dynamic imports and `require(...)` for `node:fs`, `node:child_process`, `node:https`,
their bare forms (`fs`, `child_process`, `https`) and subpaths (such as `node:fs/promises`),
excluding mentions inside comments and strings. The expanded set was remeasured and the totals
remain unchanged on this tree. Both totals may decrease;
neither may increase. Updating the baseline requires an explicit edit; tests never rewrite it.
A source file that cannot be read aborts the measurement instead of counting as zero.

Subpath membership has a separate test, `IO imports: subpath-only source belongs to the IO set`:
the growth ratchet alone cannot detect an undercount. The current `src/loop-lint.ts` has no imports
from the configured IO modules, so it cannot serve as a live witness for subpath membership.
The causal probe replaces ``specifier.text === name || specifier.text.startsWith(`${name}/`)``
with `specifier.text === name` in a temporary copy of the scanner and runs
`npx vitest run test/core-boundary.test.ts -t 'IO imports: subpath-only|IO ratchet'`.
The membership test fails, the ratchet passes; restoring the scanner makes both pass.

Rules B and C are **measurement only**: the test prints direct `child_process`/`https` imports in
`harness-cli/src/cli.ts`; a pure directory has not been designated, so rule C is not measurable.
Neither rule is enforced by assertions.

Mutation entries `rule-a-tokenizer-not-regex` and `ratchet-refuses-unreadable` were both PROVEN
(respectively 2 and 1 failing tests under mutation) after fresh core and CLI builds:

```bash
npm run build && npm --prefix ../harness-cli run build
node ../harness-cli/dist/bin.js mutation-gate --only rule-a-tokenizer-not-regex,ratchet-refuses-unreadable --test-cmd "npx vitest run test/core-boundary.test.ts -t '^(?!.*rule A: debt)'" --json
```

Only the intentionally red debt test is excluded from that gate's baseline. The scanner accuracy
test remains included.

## Shared Markdown masking

`maskMarkdown` in `src/markdown-masker.ts` is the single implementation used by amendment-trace
and swarm-brief; the standalone plan-completeness gate carries a byte-identical `.mjs` copy.
It blanks fenced blocks and HTML comments while preserving UTF-16 offsets and newlines.
It is not a complete CommonMark parser. Reader policies remain explicit: amendment-trace restores
unclosed blocks; swarm-brief and K2 hide them through EOF. Brief also retains list barriers and
nested-comment ambiguity diagnostics through the line callbacks. Its `inlineComments` policy also
retains comments after prose, while paired backtick runs on the same line protect code-span delimiters.

The four-space indented-code gap is **not closed** for amendment-trace or K2 in this feature.
Its single implementation address is `src/markdown-masker.ts`. Contrary to the original plan's
premise, swarm-brief already masked indented code; its `indentedCode` option preserves that behavior.
The default remains off. Future work must decide the other readers' policy at this one address.
Regenerate every gate copy from this source and run `npx vitest run test/markdown-masker.test.ts`
from this package; byte equality is tested, including the installed and packaged gate locations.

## Per-turn admission debt (`session-retro.ts`)

The engine behind `dz retro` and `dz retro --scan-tail`: it turns a session transcript into events,
detects recurring PROCESS rakes, and folds an **admission debt** — an error narrated in chat with no
`dz teach` behind it.

Public surface used by the CLI: `streamSessionEvents`, `parseSessionJsonl`, `detectProcessRakes`,
`buildRetro`, `renderRetro`, `renderDrill`, `retroLessonText`, `foldAdmissionDebt`, `runRetroTailScan`,
`retroSentinelIsFresh`, `renderRetroDebtDirective`, `findLatestTranscript`, **`resolveScanTailTranscript`**
(new), plus the types `SessionEvent`, `RetroPendingSentinel`, `TailScanOutcome` and **`ScanTailSource`**
(new), and the constants `RETRO_DEBT_MARKER`, `RETRO_PENDING_FILE`, `RETRO_SCAN_STATE_FILE`,
`RETRO_SCAN_LOCK_NAME`, `PROCESS_SIGNATURES`, `DEFAULT_DRILL_THRESHOLD`.

`SessionEvent` carries an optional `toolUseId` — `tool_use.id` on a call, `tool_result.tool_use_id` on
its result — which is the pairing key the debt fold needs to tell WHICH command a result belongs to.

Load-bearing properties, each pinned by a test that goes RED when the property is mutated out
(`test/session-retro.test.ts`, `test/retro-scan-tail-source.test.ts`, registry ids in
`test/mutation-registry.json`):
- **Block order survives parsing.** An admission text block is emitted BEFORE the `tool_use` of the same
  message, so admitting and teaching in one turn reads as settled (`retro-p1-1-block-order`).
- **Only an executed Bash teach can pay.** A `tool_result` echoing the phrase, an `echo`/`grep` decoy, or
  a non-Bash tool call never settles anything (`retro-p1-2-bash-only-teach`).
- **A newline is a command boundary.** The dominant field form (`DZ=…\n$DZ teach … --project $B`) pays;
  every decoy still stays armed (`retro-adr5-newline-boundary`).
- **The RECEIPT settles, not the command text.** A teach with a `tool_use_id` is registered by its call
  and cleared only by that call's own result carrying a line `dz teach` prints on a real write — so
  `exit 0\ndz teach "never runs"` pays nothing (`retro-r1-teach-receipt-required`).
- **Every awaiting teach is retained.** Two parallel teach calls cannot cancel each other out; if both
  results come back receipt-less the debt stays armed (`retro-r3-retain-awaiting-teaches`).
- **An admission is a confession, not a bug-fix report.** The Russian branch is an allowlist of verb and
  adverb forms, so «Я ошибку валидации исправил» — a NOUN in a completion report — arms nothing
  (`retro-r3-admission-verb-only`).
- **The scan never guesses its transcript.** `resolveScanTailTranscript` takes an explicit flag, then a
  positional path, then the Stop hook's stdin `transcript_path`; with none it returns
  `{path: null, reason}` rather than the newest file on disk.
- **No lost update.** The whole read→fold→write tail-scan transaction runs under the `retro-scan` named
  lock beside the store it guards; contention advances nothing (`retro-p1-3-unlocked-scan`).

## Lesson payoff (bandit re-rank)

`lesson-bandit.ts` / `lesson-payoff.ts` add a **payoff axis** to lesson recall: a Beta posterior per
`(domain, lesson)` that answers *"has this lesson ever actually helped?"* — the question neither
cosine similarity nor SAFLA-delta asks.

Public surface: `contextKeyFor`, `classifySignal`, `makeRewardEvent`, `recordReward`,
`recordExposures`, `payoffTermsFor`, `narrowBanditReport`, `banditStats`, `renderBanditHealth`,
`resolveBanditConfig`, and the vendored `LessonBandit` engine.

Load-bearing properties, each pinned by a test that goes RED when the property is mutated out:
- **Disarmed by default.** `memory.learning.banditRerank` absent ⇒ the module is not even loaded and
  ranking is byte-identical.
- **A view is not a reward.** `kind:'recall-hit'` is recorded as an EXPOSURE; only an explicit
  confirmation moves the posterior.
- **Quarantine-closed.** Quarantined lessons never receive trial impressions unless
  `banditExploration` is armed explicitly — that flag weakens an existing guarantee, so it ships off.
- **Bounded.** The term is added, never assigned, and capped; similarity still selects the candidates.
- **No lost update.** State writes go through a named lock; the reproducer test asserts both halves.
- **Unicode-scoped.** Domain keys keep letters in any script — Cyrillic and CJK domains stay distinct
  instead of sharing one posterior.

The engine is vendored (215 lines, MIT, zero imports) rather than imported: its upstream path is not
in `agentdb`'s exports map, and a ranking feature that quietly stops ranking looks exactly like one
that works.

## Per-stage Codex model matrix

With `primary: 'codex'`, the budget table always selects models by stage. The
optional `RoutingEnv.complexityTier` (`S`, `M`, `L`, or `XL`) affects only planning;
the workflow twins read it from `args.tier`. Omitting the tier selects S/M planning:
flagship (workhorse in eco). Explicit model overrides retain their existing precedence.

| Stage | Normal / hybrid Codex axis | Eco Codex axis |
|---|---|---|
| Router | Terra · medium | Luna · medium |
| Requirements | Sol · medium | Terra · medium |
| Research (evidence collection) | Terra · medium | Luna · medium |
| ADR | Astra · high | Sol · high |
| QCSD / ideation | Sol · high | Terra · high |
| DDD | Sol · high | Terra · high |
| Architecture | Astra · high | Sol · high |
| Plan · S/M | Sol · high | Terra · high |
| Plan · L/XL | Astra · high | Sol · high |
| Code | Sol · high | Terra · high |
| QE | Claude Sonnet (independent family) | Claude Sonnet (independent family) |
| Fleet | Sol · high | Terra · high |

`CODEX_TIERS` names roles: **premium** (`gpt-6-astra`) for consequential decisions;
**flagship** (`gpt-5.6-sol`) for direct work; **workhorse** (`gpt-5.6-terra`) for
evidence; **high-volume** (`gpt-5.6-luna`) for mechanics. Eco lowers each selected
Codex tier by one level; these are capability assignments, not measured prices.
Claude-primary cells and the cross-family QE rule retain their existing behavior.

## Experiment envelope (`feature-adr-envelope.ts`, ADR-001 envelope-before-dispatch)

The feature-adr conveyor writes an OUTCOME per run (grade, some tokens) but never used to write the
DECISION behind it — what kind of task this was, how big, at what priority, which model arms the
router considered, which one it picked, and who judged it. `buildExperimentEnvelope` assembles that
as one plain-data object, built exactly ONCE per run (right after the Step-0 router, once `tier` and
`taskKind` are known, and before Step 1 dispatches anything), then threaded byte-for-byte into every
place the run reports itself:

- every autowritten run-cost ledger row (`.dz/feature-adr/run-cost-ledger.jsonl`, field `envelope`);
- every captured training pair (`.dz/fa-training/<slug>/<stage>.jsonl`, field `envelope`, alongside
  the narrower legacy `budgetMode` — not instead of it);
- the round state opened via `dz round open --envelope <json>`, copied into the round's ledger row
  by `closeRound` on `dz round close`.

Shape (`ExperimentEnvelope`): `schema:1`, `runId`, `attempt` (integer ≥ 1), `taskKind` (one of
`feature|bugfix|refactor|tooling|docs|research`), `tier` (`S|M|L|XL`), `priority`
(`speed|balance|quality|unset`), `treeSha` (40-hex or `null` + `treeShaReason`), `arms` (`{mode:
string[], stages: {stage: string[]}}` — what the routing tables OFFERED), `chosen` (`{mode, stages:
{stage: spec}}` — what was actually resolved), `policy` (`{name, version, propensity}`), `evaluator`
(`{family, model, source: 'planned'|'actual'}`). `validateExperimentEnvelope(value)` returns
`{ok:true}` or `{ok:false, reason}` naming the FIRST invalid field.

**The writer refuses an automated row without one (FR-5, D2).** In `run-records.ts`,
`decideRecordWrite` for `kind:'ledger'` refuses (`exit 2`) an `auto:true` row that carries no
`envelope`, and refuses ANY row (auto or manual) whose present `envelope` fails validation. A manual
row without `auto`/`envelope` is unaffected — the old shape still writes exactly as before (C-3).
Read it back with `jq '.envelope' .dz/feature-adr/run-cost-ledger.jsonl`.

**`args.priority` (FR-4).** A learning-stratum LABEL, one level above `budget`/`deliveryGate` — an
explicit knob always wins over the preset:

| `priority` | `budget` preset | `deliveryGate` |
|---|---|---|
| `speed` | `eco` | `false` |
| `balance` | `normal` | `false` |
| `quality` | `normal` | `true` |
| `unset` (default) | whatever `args.budget` says | whatever `args.deliveryGate` says |

`PRIORITY_PRESETS` + `resolvePriority(raw)` + `applyPriorityPreset(priority, explicit)` live next to
`BUDGET_PRESETS` in `feature-adr-routing.ts`; an unknown priority is a startup error naming the valid
list, never a silent `unset`. Setting `priority` alone (no other routing knob) turns routing on.

## What it provides

### Evidence-gated companion integrations

`runInit` reads and aggregates adjacent `INTEGRATIONS.json` manifests once per run. Requested
components always produce one of two explicit outcomes: a receipt-backed emission or a named refusal.
The current measured admission set is one cell—Claude Code `2.1.235`, project MCP—qualified by a
non-executing live registration probe. The other 19 cells refuse by stable reason code. A
pending/committed `.dz/integrations-ownership.json` journal prevents an observed user value or forged
ledger from becoming overwrite authority; AgentDB setup uses this same writer and adopts only its
known historical shape.

`--allow-integrations <sha256:…>` binds consent to the exact aggregate. `--no-integrations` is an
explicit skills-only short circuit. `--no-verify` cannot authorize emission. A Claude
`Pending approval` observation is registered but `ready: false`.

| Module | Exports | Purpose |
|---|---|---|
| `skills` | `loadSkillFromDir`, `listSkills`, `listSkillsDetailed`, `describeSkillLoadFailure`, `formatSkillLoadFailures`, `formatSkillApplyFailures`, `discoverSkillIds`, `walkFiles`, `isSkillJunkFile`, `SKILL_JUNK_DIRS`, `SKILL_JUNK_FILES` | Read skill directories into `CanonicalSkill` objects. **Two listing functions, deliberately:** `listSkills` THROWS on the first unloadable skill and always will — it is a published export, and silently turning it into a skip-and-collect function would downgrade every unknown third-party consumer from fail-closed to fail-silent without their consent (an incomplete catalogue reported as complete); a pinned regression test asserts it still throws. `listSkillsDetailed` is the total variant callers ask for BY NAME: it returns `{skills, failures}` with a per-id `try/catch`, so one unparseable `SKILL.md` never hides the ones after it (order-independence is the tested property — the offender first, middle or last yields the same counts). Every failure is NAMED — `describeSkillLoadFailure` is the single place a pathless parser throw becomes `{id, absolute path, verbatim reason, first line}`, because the parser is handed only TEXT and can never supply a path. `formatSkillLoadFailures` renders that list for stderr in one of two modes chosen by the CALLER (absolute paths for `dz list`/`dz sync`; relative-to-package for `dz install`, where a `node_modules/**` path is not actionable). **Symlinks and junk (feature `skills-walk-symlinks-and-junk`):** `walkFiles`, the asset-discovery loop `loadSkillFromDir` and `getSkillInfo` both run on, resolves every symlink with `statSync` before deciding whether it names a file or a directory — a `Dirent` from `readdirSync` answers `false` to BOTH `isDirectory()` and `isFile()` for a symlink entry, so trusting those two checks alone silently drops every symlinked asset (MEASURED: 2 of 4 fixture assets vanished, exit 0, before this fix). A symlink whose target cannot be `stat`'d is a *broken symlink*; a directory (reached directly or through a symlink) whose `realpath` is already on the current ANCESTOR chain ends the walk there instead of recursing — the guard tracks the recursion path, not every directory ever visited, so two non-cyclic aliases of one directory (`alias1 -> shared`, `alias2 -> shared`) are both walked under their own logical paths (Codex r2, lead fix) (`walk-guards-cycles`, its own dedicated mutation entry as of fix-round 1 — the symlink-resolution mutation alone cannot prove the guard, because disabling symlink-following ALSO stops any cycle from ever being reached), which is what stops an `a -> ..` cycle from hanging. **Containment (fix-round 1, lead item AM-8):** a symlink is followed only when its RESOLVED target's real path lies within the skill directory's own real path — `assets/secret -> /etc/hostname`, or a relative `-> ../../..` that escapes upward, is refused with reason `'symlink escapes the skill directory'` and never bundled, whether the escaping target is a file or a directory; only a `..` path COMPONENT counts as an escape — a file legitimately named `..asset` is inside the root (Codex r2, lead fix). `SKILL.md` itself gets the same check BEFORE it is read: a `SKILL.md` that is a symlink escaping the skill directory makes the whole skill REFUSED with a named error (it is mandatory, so it cannot merely be skipped); an in-tree `SKILL.md` symlink still loads (Codex r2 CRITICAL, lead fix) (an escaping directory is not recursed into either — nothing beneath it is walked). **What counts as junk IS THE PUBLISHED CONTRACT** (fix-round 1 HIGH-1 — Codex's finding that this contradicts "never drops a legitimate skill asset" is REFUTED-BY-CONTRACT, not a bug: a skill cannot ship an asset under one of these exact names, on purpose or by accident, and that is the deliberate trade this design makes, not an oversight to be widened into content-sniffing): directories `__pycache__`, `node_modules`, `.git`, `__MACOSX`, `.pytest_cache`, `.mypy_cache` (`SKILL_JUNK_DIRS`); files named exactly `.DS_Store` or `Thumbs.db`, or matching `*.pyc`, `*.pyo`, `*.swp`, `*.swo`, or `.#*` (`SKILL_JUNK_FILES` + `isSkillJunkFile`) — a trailing `~` (editor backup) is deliberately NOT on the list: it is the one pattern a legitimate asset name can plausibly end with (`notes~`), and the list is conservative by contract — a false positive would silently drop a real asset (Codex r2, lead decision). This is NOT a whitelist — any other file (including a skill author's own `notes.local.txt`) is kept as a real asset; filtering someone else's files by name is not this list's job. Every junk entry, broken symlink, escaping symlink, and detected cycle is counted and NAMED, never silently dropped: `walkFiles` returns `{files, skipped}` where `skipped` is `{path, reason}[]` and `reason` NAMES the matched pattern (`'junk file (*.pyc)'`, `'junk directory (__pycache__)'`, not a bare `'junk file'` — fix-round 1 HIGH-1(b)), and `loadSkillFromDir` threads that list onto its `CanonicalSkill` result as an *optional* `skipped` field (present only when something was actually skipped, so every existing consumer that only reads the `CanonicalSkill` shape is unaffected). An unreadable directory (`readdirSync` throwing — fix-round 1 MEDIUM-3) is *also* a named `'unreadable directory (<errno>)'` skip, never a throw out of `loadSkillFromDir`. `dz install` sums the junk-tagged entries across the installed package's skills and prints one line — `skills: skipped N junk entr(y|ies) (…)` — only when N > 0; the count is ENTRIES, not files (a skipped junk directory is one entry regardless of how many files sit underneath it, since `walkFiles` never descends into it to count those), and a directory path in the list is shown with a trailing `/` (fix-round 1 MEDIUM-4) |
| `apply` | `applyEmitResult` | Write an adapter `EmitResult` to disk — **additively** |
| `repo-boundary` | `isRepoBoundary`, `RepoBoundaryIo` | A repository boundary is a `.git` directory with a real `HEAD` file or a worktree `gitdir:` redirect; an empty or unrelated `.git` entry is not a boundary, so `dz` run from a directory such as `/tmp` with a stray empty `.git` no longer treats it as a project root (and no longer creates a `.dz` store there). Named locks are unchanged: `<root>/.dz/locks/<name>.lock`, a pure function of the root. |
| `targets` | `TARGETS`, `TargetName`, `isTargetName`, `resolveTargetName`, `TARGET_ALIASES`, `TARGET_NAMES_SORTED`, `formatTargetProblem`, `formatTargetAliasNote`, `normalizeTargetToken` | `--target` name → platform adapter, plus the resolution layer in front of it. `isTargetName`/`TARGETS`/`TARGET_NAMES` are UNCHANGED: `boundaries.json` names `isTargetName` as the scanned `--target` validation boundary, and every resolution ends in exactly that guard — the boundary is routed THROUGH, never relocated. `resolveTargetName` is total and pure, with fixed precedence: exact canonical → normalised canonical (case/padding/separators: `Claude_Code`, `claudecode`) → an explicit `TARGET_ALIASES` row → unique normalised prefix → Levenshtein ≤ 3 strictly better than the runner-up → nothing. **Aliases ACCEPT; prefix and Levenshtein only SUGGEST** — an alias row is an owner decision recorded in DATA (adding one is one line and zero control flow), while a fuzzy match is a guess, and installing to the wrong target on a guess is worse than one round-trip. An ambiguous prefix (`co` → `codex`/`copilot`) is terminal with NO suggestion, for the same reason. `formatTargetProblem` renders the two-line refusal, keeping the literal `--target must be one of:` substring that shipped assertions pin |
| `agents-policy` | `POLICY_SOURCES`, `extractPolicyBlocks`, `renderPolicySections`, `detectPolicyDrift`, `measureAgentsMdBudget` | Pure anchored policy extraction, 12-hex source stamps, drift classification and Codex project-doc byte-budget measurement. The stamps prove source/target synchronization only; they do not prove that a runtime read or obeyed the text |
| `sign` | `listPackFiles`, `listSignablePackFiles`, `verifyManifest`, `verifySbomAgainstManifest` | Shared node_modules/.git exclusions; verify sees MORE than sign (smuggled symlinks still fail). After authenticating the Ed25519 manifest, verification derives the canonical CycloneDX document from those signed entries and requires the no-follow `sbom.json` read to match it exactly. Current/v3 signing refuses malformed, duplicate-key, or precision-losing root `package.json` JSON and preserves object order throughout `exports`, `imports`, and `typesVersions`, so condition-order entry-point changes cannot hide behind packer-noise canonicalisation. Readers retain v1/v2 compatibility |
| `guard` | `evaluateGuard`, `resolveRules`, `scanSecrets`, `DEFAULT_RULES`, `parsePnpmLockImporters` | Declarative HARD/SOFT constraint engine behind `dz guard` (publish/teach/consolidate pre-flight; fail-closed). The SOFT `signature-fresh` rule warns before publish when a changed pack no longer verifies against its signed `.dz-manifest.json`; all manifest, key, and filesystem reads remain in the CLI fact gatherer. The SOFT `lockfile-in-sync` rule compares each workspace package's `@dzhechkov/*` dep specs against the specifier `pnpm-lock.yaml` records for that importer — the `ERR_PNPM_OUTDATED_LOCKFILE` CI break, caught at publish. Its lockfile reader (`parsePnpmLockImporters`) is a pure RECOGNISE-OR-REFUSE parser (no YAML dependency): it reads only the `lockfileVersion: 9`+ importer layout and returns `undefined` for a legacy v5/v6 file, a truncated one, or any shape that leaves an importer with zero specifiers — because a half-parse reports every real dependency as "not recorded". The rule FAILS OPEN on that `undefined` (no violation) and is pinned SOFT-only via `SOFT_ONLY_RULES`, so no config can turn a parser that admits uncertainty into a publish blocker. The HARD `licence-hold` rule (+ `LICENCE_HOLD_PENDING_MARKER`) is the machine side of a declared licence precondition (`package.json.licenseHold`, ADR-001 hermes-claude-adaptation): silent while the pack stays `private:true` (the npm layer refuses it), it HARD-blocks publish the moment the pack becomes publishable with the hold unsatisfied — LICENSE absent/empty or still carrying the `<!-- PENDING:` grant placeholder, no `Grant-Confirmation: <url>` line, empty THIRD_PARTY_NOTICES, or a non-SPDX license field |
| `slop-lint` | `slopLint`, `parseSlopRegistry`, `validateSlopLintConfig`, `DEFAULT_SLOP_CONFIG`, `BUNDLED_SLOP_REGISTRY_URL` | Pure deterministic EN/RU lexical-density and structural-style analysis behind advisory `dz lint`. It excludes protected Markdown, requires at least two distinct registered marker IDs in one paragraph, divides marker hits by `max(visibleWords, wordFloor)`, and reports bullet walls or registered three-adjective stacks independently. Under the default `4`/`2`/`25` policy, the distinct-ID floor owns paragraphs through 50 words and density is the dilution cap from 51 words onward. The core performs no file, network, clock, locale, or process I/O; policy/config failures are typed diagnostics rather than empty clean results. |
| `stem` | `tokenize`, `stemToken`, `stems` | Zero-dependency EN/RU word-form normalisation (light suffix stripping applied to BOTH sides of a match) behind registry search and `recommend`, so «анализы» finds «анализ»; a RU topic dictionary maps Russian queries onto catalogue topics, and an unmapped topic is reported as a miss rather than silently widened. |
| `course-staleness` | `classifyCourseStaleness`, `CourseStalenessState`, `CourseStalenessInput`, `CourseStalenessResult` | Pure tutorial/package parity classifier. It distinguishes `S0 SHIPPED`, `S3 TUTORIAL_STALE`, `S4 PACKAGE_BEHIND`, malformed/mismatched/unknown registry inputs, and—load-bearing—`E2 UNSTAMPED`; an absent source stamp can never collapse into shipped. The caller supplies registry facts, so classification performs no file, process, clock, or network I/O. |
| `backlog` + `backlog-embed` | `dedupIdea`, `classifyDedup`, `dedupPairBand`, `dedupEmbedText`, `lexicalContainment`, `ensureBacklogEmbedForm`, `recordAbsorption`, `alignIdea`, `spinRoulette`, `readGoalMapDetailed`, `parseEffort`, `ensureBacklogGitignored`, `harmonizeBacklog`, `transitionIdeas`, `checkTransition`, `resolveIdPrefix`, `IDEA_TRANSITIONS` | The Smart Backlog engine behind `dz backlog`: status lifecycle via `transitionIdeas` (`ship`/`drop`/`reopen` against the `IDEA_TRANSITIONS` table — unique-short-prefix resolution, idempotent ship/drop no-ops, non-idempotent reopen, all-or-nothing fail-closed batches, line-preserving atomic JSONL rewrite that keeps every non-status byte of untouched records); content-addressed idea records in `.dz/backlog/ideas.jsonl`, semantic dedup over the REUSED agentdb vector namespace (`dz-backlog` — no second store), weighted-max GoalMap alignment, and a seeded weighted roulette. Dedup is TWO-SIGNAL since the register-inflation fix (MEASURED 2026-08-11 on the real 105-idea store: full-length embeds INVERTED the signal on long texts — genuine paraphrases 0.35–0.61 vs topically disjoint long-RU pairs up to 0.9195): `dedupEmbedText` embeds a bounded 400-char excerpt (`backlog-embed.ts`, one form shared by query/mirror/reindex so vectors can never split spaces; `ensureBacklogEmbedForm` re-mirrors v1 stores once, batched), and `dedupPairBand` requires a cosine-threshold DUPLICATE to also share subject vocabulary (`lexicalContainment` ≥ 0.3, else demoted to RELATED with the pair reported — the 0.941 register-only absorption) while promoting a same-idea re-capture at a different length (containment ≥ 0.95, cosine ≥ 0.75) to a subset duplicate; `recordAbsorption` keeps every absorbed text in `absorbed.jsonl` so a wrong verdict is reversible (mutation-defended: `backlog-dedup-demotion-corroboration`, hand-verified 6 red). Every band/weight decision is a PURE function. `classifyDedup` also reports the top-1 match id alongside the cosine (the calibration surface for the 0.92 duplicate band — observational, it never moves the verdict); `readGoalMapDetailed` returns the entries the defensive reader DROPPED with a reason AND the fields it REPAIRED with their raw values (a weight clamped before validation made the validator's out-of-range branch dead code), so `goals --validate` can never report a vacuous "valid (0 goals)" nor hide a `weight: 7`; `parseEffort` returns a printable note for every clamp; `ensureBacklogGitignored` gitignores the store on first write (raw ideas are private prompt-class content) — atomically, preserving the file's dominant EOL, recognising every plain spelling of an existing rule (`/.dz/`, `.dz/**`, …) via `backlogIgnoreStatus`, and obeying a `!` negation as an explicit user opt-out instead of overriding it |
| `no-stubs` | `scanStubs`, `checkNoStubs`, `scannableStubPath`, `STUB_MARKERS`, `STUB_PHRASES`, `STUB_SCAN_EXTENSIONS` | Pure unfinished-stub scanner behind the SOFT `no-stubs` publish rule (backlog 0b403a0106103901, Karpathy-Michaels rule XI): bare markers (`TODO`/`FIXME`/`HACK`/`XXX`/`PLACEHOLDER`) case-SENSITIVE with hard word boundaries (`hackathon`/`todos`/a marker inside a hash never fire; MEASURED: relaxing case doubles this repo's hits and adds only prose) + the `implement later` phrase case-insensitive. SCOPE = the CHANGE-SET (the working-tree `git status --porcelain -uall` diff — `-uall` so a brand-new untracked DIRECTORY is scanned file-by-file instead of collapsing to one invisible `?? newdir/` line; `.gitignore` semantics unchanged), never the whole tree — MEASURED: a tree-wide scan is 32+25 hits of mostly ancient legitimate markers, i.e. noise that gets a gate switched off. Markdown gets PROSE scoping (fenced blocks + backticked spans are QUOTES, not stubs). Waiver-with-REASON only, per line (`no-stubs: <reason>`) or per path (`.dz/guard.json` `stubWaivers`, the feature-adr-setup --guards shape); a reasonless waiver is REFUSED as its own finding and exempts nothing. Self-exemption is STRUCTURAL: every marker in the module and its tests is assembled from string fragments, so the gate's own source scans clean — a tested property, not a path skip. Fail-open on missing evidence (no change fact / ungathered contents ⇒ nothing reported) but never fail-SILENT: skipped scannable files (deleted/oversize/unreadable/beyond the file cap) surface as ONE aggregate `notes` entry in the `GuardResult` + audit record — information that can never move the verdict. KNOWN LIMITS are documented at the top of `no-stubs.ts` instead of implied away (whole-line inline waiver token = layer-4 auditability defence; reason QUALITY not judged; boolean fence model, not CommonMark; git-quoted paths undecoded; TS-monorepo extension allowlist; worktree-not-index reads; exact-string config-waiver paths). Mutation-defended (`no-stubs-bare-marker-fires` observed 10 red, `no-stubs-skipped-note-emitted` observed 2 red) |
| `feature-adr-setup` (P3) | `renderGuardsConfig`, `renderGuardsRunner` | Scaffolds deterministic guard tests into a TARGET project: `guards.config.json` + a zero-dependency `check.mjs` runner (loc-cap, secret-scan, frozen-file sha256 pins, waivers-with-reasons) — `dz feature-adr-setup --guards` |
| `usage` | `computeUsage`, `TOKEN_WEIGHTS`, `readUsageLimits`, `deriveUsageCalibration` | Read-only Claude usage ESTIMATE behind `dz usage`. Tokens are COST-WEIGHTED input-equivalents (input 1x, cache-write 1.25x / 1h 2x, cache-read 0.1x, output 5x) — a flat sum is 89-99.7% cache-read (MEASURED) and tracks conversation length, not work. Scans subagent transcripts too (`<session>/subagents/*.jsonl`), follows no symlinks, reads only regular files (symlinked FILES and DIRECTORY components alike are skipped), and caps the walk BY RECENCY so a huge history cannot discard current usage. `pct` stays `null` while limits are unconfigured — an unconfigured estimate is never dressed up as a number |
| `cost-ledger` | `deriveCostLedger`, `buildCostLedger`, `verifyCostLedgerReport`, `stageCostAggregates`, `renderCostLedger`, `writeCostLedgerJsonl`, `COST_LEDGER_SCOPE` | Per-stage cost ledger behind `dz usage --by-stage`. A feature-adr run reports ONE number; this joins the workflow's own `stageLabel()` strings to the per-agent transcripts the harness already writes, so a run becomes an itemized receipt. POST-HOC DERIVER, not a writer — no workflow edit, and a KILLED run is still derivable. The invariant: `accounted + unaccounted === runTotal` and `accounted + doubleAttributed === Σ stages`, RAW integer equality (rounding happens exactly once, per sample, at extraction), re-derived from the emitted report by `verifyCostLedgerReport` — the writer clamps, the verifier enforces. A mismatch is a NAMED defect (`Unaccounted`, `DoubleAttributed`, `ForeignSample`, `MissingStageTranscript`, `MalformedRecord`), never a rounding remainder, so `epsilon` defaults to 0. The run total comes from the run's transcript DIRECTORY LISTING, NOT the record's own `totalTokens` — that field is exactly `Σ workflowProgress[].tokens` in 29 of 29 recorded runs (MEASURED), so an invariant against it can never fail. Both sides share ONE estimator with `dz usage` (`weightedTokensOf`). `stageCostAggregates` is a pure feed-forward reader for auto-cost routing that EXCLUDES non-reconciling runs (now also `INCOMPLETE_INVENTORY` runs — the `!== 'BALANCED'` gate already excludes it, no second branch to forget); wiring it into routing is deliberately out of scope. HONEST SCOPE, printed by every surface: local transcript ESTIMATES, not billed amounts — it catches ATTRIBUTION errors, NOT pricing errors; `hasKnownPricing` marks rows priced by the sonnet-class fallback. `INSUFFICIENT_DATA` is a distinct verdict, never collapsed into `BALANCED`. **measurement-integrity (ADR-001 D1/D2):** every row also carries `stageCanonical` (the verbatim `stage` classified against `feature-adr-stage-canon.ts`'s one ordered table — see that module below — `'unknown'` when no rule matches, never silently folded into `infra`) plus `attempt`/`attempts` (a label repeated N times in one run is N separate rows, each tagged `attempt: i` of `attempts: N`, instead of one row silently summing them). The report gains `byCanonicalStage` (every canonical stage + `unknown` + `unattributed`, `{tokens, agents, attempts}`) and `reconciliation.orphanTranscripts` (`{count, tokens, ids, method}` — transcripts present in the run directory with NO `workflowProgress[]` entry; `method: 'per-transcript'` is an exact sum over each orphan's own samples, `'count-fallback'` is the best estimate when only ids are known). A run whose ONLY problem is a named orphan (nothing else defective) reports verdict `INCOMPLETE_INVENTORY` — outranks `BALANCED`, outranked by `DEFECT` — never the old `Unaccounted`/`DEFECT` pair that used to swallow the orphan into the generic bucket |
| `feature-adr-stage-canon` | `CANONICAL_STAGES`, `STAGE_LABEL_RULES`, `canonicalStage` | measurement-integrity ADR-001 D1: the canonical stage taxonomy — 11 pipeline stages (`router`, `requirements`, `research`, `adr`, `ideation`, `ddd`, `architecture`, `plan`, `code`, `qe`, `fleet`) + `infra` for the bookkeeping/plumbing labels around them. `canonicalStage(label)` classifies ONE verbatim `stageLabel()` string against ONE ordered prefix table (first match wins; a `label · model` suffix is matched on the part before ` · `) and returns `{stage, label, known}` — the input label is NEVER rewritten, only classified next to it. An unrecognised label is `{stage:'unknown', known:false}`, never silently `infra`. The completeness fixture (`test/feature-adr-stage-canon.test.ts`) is 47 labels copied verbatim from a live recorded run (`wf_5a7755c7-f92`) — Step 0's assessment counted 48 on the same record; a live reproducer counted 47, and the one-label gap does not change which prefixes are needed. Pure — no filesystem, no clock; the `core-boundary` ratchet pins it at zero `node:fs` imports |
| `codex-rollouts` | `parseCodexRollout`, `matchCodexRollouts` | measurement-integrity ADR-001 D3: a pure reader for Codex CLI rollout logs (`~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl`) — 130 of 156 recorded Codex ledger rows carry `tokens: null` even though the spend is sitting on disk, because the pipeline dispatches `codex exec` without an explicit session id. `parseCodexRollout(text, fileName?)` extracts `{id, cwd, model, startedAt, endedAt, totals}` from one file's TEXT (never opens a file itself — the CLI does that); it accepts BOTH the schema Step 0 documented (`type:"token_count"`, `payload.info.total_token_usage`) AND the schema actually observed live on this machine 2026-09-16, `cli_version 0.154.0` (`type:"token_usage_record"`, `payload.usage`; `model` on `turn_context`, not `session_meta`) — a reader that understood only a shape nothing on disk still emits would fail at the exact thing it exists to fix. `matchCodexRollouts(rollouts, {from, to, cwd?, model?})` joins a stage's time window to the rollout that produced its spend by INTERVAL OVERLAP, never "nearest in time" (two reviews back to back would misattribute) — `0` matches is `{status:'none'}`, `1` is `{status:'one', rollout}`, `>1` is `{status:'ambiguous', candidates}`, never a first-pick. Pure — the `core-boundary` ratchet pins it at zero `node:fs` imports |
| `compounding` | `mulberry32`, `bootstrapDelta`, `decidePromotion`, `assembleCompoundingReport`, `assembleLessonToRuleFunnel` | Pure learning-loop payoff engine behind `dz compounding`: seeded deterministic bootstrap (conservative nearest-rank lower-95), promotion that refuses non-finite/malformed input and anything under 5 samples per arm, and dz-native measurements (pool write-only ratio, guard trajectory by RATE, replay readiness over unique untruncated prompt events). Its lesson-to-rule funnel reports UTC calendar-month `eligible → attempted → accepted → executions` counts from prospective promotion-run and anchored guard-audit evidence. Zero alone is not a finding: only a non-empty predecessor followed by an empty named successor in three consecutive measured months produces one; unavailable evidence remains `NOT MEASURED` with its reason. Compaction keeps the newest query-bearing rows verbatim and aggregates ONLY the rest (read totals are invariant across compactions). Also reports EVENT-CHAIN health of the evidence logs it computed from (`evidenceLogs` in, `instrumentation.chains` out) — verified / defect kinds / uncovered pre-chain prefix, with no logs handed in producing no line at all rather than a vacuous "clean" |
| `event-chain` | `fnv1a32`, `nextChainFields`, `appendChainedLines`, `chainRewrite`, `guardedRewrite`, `verifyEventChain`, `EVENT_CHAIN_SCOPE` | Pure hash-chain over the two learning-evidence logs (`.dz/recall-usage.jsonl`, `.dz/guard-audit.jsonl`): each appended record carries `seq` + `prevHash` (FNV-1a over the previous line AS WRITTEN, so key order cannot make writer and verifier disagree), derived from the LAST LINE ONLY so a per-prompt hook stays O(1). `verifyEventChain` names eight classes — `BrokenLink`, `DuplicateSeq`, `NonMonotonicSeq`, `TornTail`, `DoubleCounted`, `LedgerImbalance`, `MalformedLedger`, `ClaimInterrupted`. The last four exist because a rewriter must not be able to certify itself: the compaction ledger's arithmetic (`Σ weight + dropped === source`, `dropped ∈ [0, source]`) is enforced with NO clamps in the verifier (the clamp belongs to the writer), a damaged ledger line is a defect rather than a silently-disabled check, and a claim that never reached its `throughSeq` — because the segment restarted or the file ended — is reported instead of escaping through the discontinuity. `guardedRewrite` is the concurrency guard for any whole-file rewrite: exclusive lock, plus a re-read of the live file after computing the new text and BEFORE the rename, so a concurrent append aborts the attempt and is folded into a bounded retry rather than overwritten (it narrows the read→rename window; it cannot close it, and says so). Records written before chaining existed stay LEGAL and are counted as an uncovered `preChainPrefix`; an unreadable tail never blocks a write (fresh MARKED segment — an unreadable tail WINDOW is distinguished from an empty file — and the appender starts on a new line so one torn write cannot eat the next record); an unmarked restart is reported once and then re-anchored, so one incident is one defect instead of a cascade. HONEST SCOPE, carried in every result and printed by every surface: corruption detection for our own bugs — FNV-1a is not cryptography, its collisions are constructible, the threat model has no adversary, and a regression test fails if the module regrows tamper-proofing vocabulary |
| `feature-adr-checkpoints` | `checkpointInputHash`, `decideCheckpointResume`, `parseCheckpointRead`, `serializeCheckpoint`, `fnv1a64`, `CKPT_SCHEMA_VERSION`, `STAGE_ARTIFACTS`, `DESIGN_SUBSTAGES`, `designStageKey`, `decideDesignFanResume`, `parseArtifactProbe` | The PURE half of feature-adr's durable per-stage checkpoints (`features/<slug>/.fa-state/checkpoints.jsonl`): a dead L/XL run — or the standard stop-after-plan re-invoke — resumes completed stages instead of re-spending them. Resume = INPUT-identity (64-bit salted FNV over a schema-versioned JSON tuple incl. upstream stage results) + presence of EVERY tier-required artifact; a stale-input hash never resumes in ANY mode (`force` relaxes only the artifact probe — the tested load-bearing property). HONEST SCOPE: it does NOT fingerprint the working tree (a crash-resume legitimately sees the dead run's uncommitted writes) — after manual edits use `resume:'never'` and re-QE. Null results are never persisted or resumable; a stage-identifiable corrupt record ERASES its older entry (last-wins holds for corruption too); the code stage's persist predicate is now an ALLOWLIST (`codeCheckpointPersistAllowed` + `codeStageResultShapeValid`, ADR-003 Condition 3): ONLY `landed` on a barrier-required run and `synchronous` on a non-barrier run may be checkpointed — inconclusive, not-landed, garbage and a mislabeled `synchronous` are all refused, and the `landing-v2` hash token makes every pre-protocol code checkpoint stale. **Since 0.5.3 the design fan is checkpointed PER SIBLING** (`design:requirements` / `adr` / `qcsd` / `architecture` via `designStageKey`), so one dead agent no longer discards three finished siblings, and a fix to one step's instructions invalidates that step alone. What may be CONSUMED is judged separately from what may be WRITTEN: `decideDesignFanResume` returns a named reason (`substage-missing` / `artifact-missing` / `probe-not-established` / `ok`) and the workflow REFUSES at the Step-5/6 boundary rather than planning off a partial design. The artifact half is judged against a POST-RUN probe that never prints filenames (`[ -f <exact rel> ]` per required artifact) — a listing is a list of filenames, and a file whose NAME ends in a newline was measured satisfying the requirement for the real file. `parseArtifactProbe` then validates the WHOLE transcript, because the probe is relayed by a model: an agent that merely NARRATES the expected output emits the token byte-identically. Inconclusive is never a pass. The workflow mirrors this inline (wiring-guarded); RU: чекпоинт после каждой дорогой стадии — упавший ран возобновляется, а не пере-тратит завершённое; веер проектирования — по каждому участнику отдельно, а неполный веер получает отказ, а не запись в лог |
| `feature-adr-decision-recall` | `buildDecisionContext`, `normalizeDecisionRecall`, `parseDecisionRecallFrame`, `mergeDecisionRecallEvents`, `reduceDecisionRecallMetrics`, `summarizeDecisionRecallReceipts`, command builders | The PURE half of an advisory experiment at two live feature-adr decisions: Step 3 ADR-alternative selection and Step 6 plan-route selection. Each context has its own coarse lesson-bandit domain; a strict framed transport accepts at most three complete hits and every empty/error/timeout/parse/transport case returns an empty prompt block. Versioned `entered` / `recalled` / `applied` / optional `owner-label` events in `features/<slug>/.fa-state/decision-recall.jsonl` retain logical decision and attempt identity, per-lesson collision witnesses, exact application dispositions, unknown/conflict populations, and explicit numerators/denominators for offline receipt, application, relevance, and repeat-hit analysis. No metric or threshold can affect a stage verdict. The timing hypothesis is external `[SRC], n=1`; book queries did not supply evidence about when retrieval should run. |
| `eta` | `parseCheckpointLines`, `segmentRun`, `extractStageSamples`, `estimateEta`, `formatEta`, `ETA_MAX_STAGE_MS` | Pure feature-adr ETA calibration over already-read checkpoint JSONL: malformed/unstamped records stay unknown, resume slices reduce to one sample per run and stage, tier comes only from `router.result.tier`, and every remaining `(tier, stage)` needs at least three distinct runs. Codex-shaped code timing folds dispatch through its next landing witness and renders p25–p75; the typed insufficient/no-checkpoint variants cannot carry a numeric estimate. No filesystem or ambient clock lives in this module — the CLI owns both. |
| `discrimination-gate` | `planDiscriminationCheck`, `classifyExecutionEvidence`, `classifyDiscrimination`, `DiscriminationVerdict`, `BaseOutcome`, `TipOutcome`, `ExecutionEvidence`, `CannotIsolateReason`, `DiscriminationFinding`, `MeasurementValid`, `PrimaryAction` | The PURE §42 test-discrimination engine behind `dz discrimination-check`: it plans the pre-feature worktree check and classifies the observations the executor feeds back. **Every trust verdict is gated on execution evidence** (ADR-001, feature wave1-instrument-repair): `classifyExecutionEvidence` turns one captured run into `{exitCode, runner, failureKind, testsExecuted, targetSeen}` off the MEASURED vitest / node --test output shapes (reusing `mutation-gate`'s single regex family), and a row whose outcome VALUE is not backed by that evidence degrades to `CANNOT_ISOLATE` with a typed reason instead of minting trust. **Seven verdicts** (was four): `DISCRIMINATES` (assertion-red at base, evidenced) · `DISCRIMINATES_VIA_ERROR` (evidenced load error at base + evidenced pass at TIP) · `NON_DISCRIMINATING` (evidenced pass at base — a proven false green) · `TEST_FILE_ABSENT` (the named check is not a regular file — stat+isFile, before any worktree) · `LOAD_ERROR_AT_BOTH_REVS` (could not execute at EITHER rev — zero signal) · `FAILS_AT_TIP` (the feature's own test is red WITH the feature) · `CANNOT_ISOLATE` (no established observation; reason ∈ no-execution-evidence | unrecognised-runner-output | no-tests-executed | inconsistent-evidence | tip-control-missing | tip-evidence-missing | timeout). The result carries `findings[]` (one per distinct non-clean verdict — the scalar `aggregate` can only name the worst), plus two ORTHOGONAL axes: `measurementValid` (did the instrument measure at all: `true | false | 'partial'`) and `primaryAction` (the single most urgent operator repair). PARSE-NEVER-SYNTHESIZE: an outcome contradicted by its own evidence is rejected as `inconsistent-evidence`, never reinterpreted. HONEST SCOPE: the bar is "a recognized runner demonstrably executed the named test", NOT resistance to an output-imitating runner; recognising vitest/node --test shapes is in scope, CHOOSING the runner is not. The singular `finding` remains as a DEPRECATED one-release alias for `findings[0] ?? null`. RU: вердикт доверия теперь требует доказательства исполнения — «упало» без доказательства больше не считается доказательством |
| `feature-adr-routing` (landed barrier) | `sourceExpectedCodeTargets`, `validateExpectedTargetsBlock`, `codeLandedBarrierPlan`, `decideCodeLanding`, `codeLandedBarrierHasLanded`, `codeLandingProbeCmd`, `parseLandingSignal`, `verifyPreCodeBaseline`, `preCodeBaselineCaptureCmd`, `posixCksum`, `LANDING_PROTOCOL_VERSION`, `LANDING_HASH_TOKEN` | The PURE half of feature-adr's Step-7.5 Codex landing barrier (ADR-003, feature wave1-instrument-repair). Expected targets are SOURCED with an explicit precedence — a non-empty `args` override REPLACES the plan's `EXPECTED_CODE_TARGETS:` block (and narrowing to an all-unpollable set returns EMPTY with reason `override-unpollable`, never a silent fall-through), while Codex's own self-declared paths land in `scrapeDiagnostic` and can NEVER establish or match — the agent under test does not declare its own success criteria. An enabled barrier with no established target is `mode:'inconclusive'`, not the deleted `any-code-change` fallback that read an unrelated dirty file as landed. Landing is a DELTA, not dirtiness: `preCodeBaselineCaptureCmd` records `git hash-object` per pre-existing dirty path with a `count=/cksum=` trailer, `verifyPreCodeBaseline` refuses any truncated or edited baseline as `baseline-unverified` (a truncated baseline makes everything look landed), and a path counts only when it is absent from the baseline or its hash CHANGED. `parseLandingSignal` is the single normalization point — empty stdout is `probe-failure`, unparseable text is `malformed-signal`, and neither is ever a landing. RU: «файл грязный» ≠ «кодер его написал»; барьер теперь умеет сказать «не знаю» |
| `feature-adr-training-pairs` (in `feature-adr-checkpoints`) | `buildTrainingPair`, `serializeTrainingPair`, `trainingPairPath`, `trainingPairAppendCmd`, `modelFamily`, `TRAINPAIR_SCHEMA_VERSION`, `TRAINPAIR_MAX_IO_CHARS`, `TRAINPAIR_PRIVACY_NOTE` | The PURE half of feature-adr TRAINING-PAIR capture (backlog 70e0f083): every checkpointed stage emits one SFT-ready JSONL record — STAGE INPUT (full prompt/context) → STAGE OUTPUT (artifact/result) → EVALUATION {QE grade, gradedBy, lessonsInjected} with provenance {model, FAMILY ∈ claude/codex, role} — to `.dz/fa-training/<slug>/<stage>.jsonl` (one file per stage), raw material for future local-model fine-tuning. FAMILY is load-bearing: the downstream dataset must honour the cross-model rule (QE pairs from a DIFFERENT family than the coder). Oversize guard: input+output over 48k chars is TRUNCATED with a named marker + full-text fnv1a64 — never silently dropped, never unbounded. A stage without a QE grade (router) records `grade:null` honestly. Deterministic: `ts` is passed in (the workflow fills it shell-side). Capture is default-ON in the workflow, opt-out `args.captureTrainingPairs:false`, non-blocking (a capture failure never fails the run). PRIVACY: pairs may contain target-repo code; the capture dir carries a README note; NOT gitignored by explicit owner decision. RU: тренировочные пары вход→выход→оценка с каждого прогона feature-adr — сырьё для будущей локальной модели |
| `reqe` | `shouldEmitReqeDebt`, `buildReqeDebt`, `parseReqeDebt`, `buildReqeBrief`, `extractReportGrade`, `settleReqeDebt`, `renderReqeList`, `REQE_SCOPE` | The pure half of `dz reqe` — the re-QE debt ledger: when feature-adr's usage-adaptive override made Step-8 QE run on the coder's OWN family (the cross-model guard consciously suspended, FR-2.9), the run records a debt in `features/<slug>/.fa-state/reqe-due.json`. Emission is the NARROW case only (same-family + the ` (usage-switched)` label — never every switch, never the no-override Claude belt); settlement is FAIL-CLOSED: an existing, non-trivial report naming exactly ONE line-anchored grade (`GRADE A-F` boilerplate and `A through F` ranges refused, ambiguity refused), never the run's own 08_qe_report.md. Debts carry the emitting run's stamp so an old settlement never immunizes a fresh run. HONEST SCOPE printed everywhere: nothing re-runs QE automatically; the validator proves procedural soundness, not authorship. RU: снятый под лимитом гард «кодер не ревьюит сам себя» становится долгом на диске, а не памяткой |
| `trace-bundle` | `buildBundle`, `serializeBundle`, `parseBundle`, `selectLedgerRows`, `resolveRunMeta`, `foldAttribution`, `planImport` | The PURE half of `dz workflow-trace export/import` — one run's telemetry as one movable file. No fs, no clock, no randomness: it DECIDES and the caller does the I/O, which is what makes the fail-closed import testable without ever pointing a test at a real project (`planImport` returns the refusals as a VALUE, not as a side effect). Run addressing is the existing one, reused rather than rebuilt. Carries EVENTS, not aggregates: the single derived value travels alongside the records it was folded from, marked derived and naming its rule, so deleting it loses nothing but convenience — last-writer-wins by timestamp is a stated CHOICE, not a truth. `resolveRunMeta` reads the harness's own workflow records and judges each RECORD, not the slug: one historical sibling must not poison a usable one (MEASURED: 1 slug of 32 was being thrown away whole). Its reason set is closed and exactly one value is ACTIONABLE — `layout-unrecognised` means the harness layout changed; `predates-model-routing` means history. That split exists because the actionable reason fired on 3 of 32 slugs of untouched data, and an alarm that sounds on normal operation is not an alarm. RECOGNISE-OR-REFUSE: a record whose fields are gone yields a reason and NO data, never a half-parse that would report a model-blind run as model-known |
| `statusline` | `statuslineData`, `readFeatureAdrState`, `writeFeatureAdrState`, `writeFeatureAdrStateDetailed`, `renderFeatureAdrPhaseLine`, `featureAdrStateDir`, `featureAdrStatePath`, `FeatureAdrState`, `WriteFeatureAdrStateInput`, `WriteFeatureAdrStateResult` | The live self-learning panel behind `dz statusline`, plus the LIVE-RUN segment two producers share. Each producer owns a per-slug slot under `.dz/feature-adr/learning-state/` and stamps `kind: 'feature-adr' \| 'loop'` (absent ⇒ `feature-adr`, so legacy states keep their meaning); `readFeatureAdrState` arbitrates by `(kind rank, ts)` — a fresh `feature-adr` state OUTRANKS any `loop` state, because a generated loop writes zero recalled/stored counters far more often and plain freshest-wins would empty the panel of the very thing it exists to show. Candidates are stat'ed and ordered newest-first BEFORE the bounded slice, so truncation can only ever drop the least-recent slot — a cap over an unsorted listing could hide the live slot behind older ones (MEASURED: 81 slots, the live one invisible). The render path is strictly READ-ONLY (~300 ms budget); housekeeping — a 24 h prune — belongs to the write path alone. Hostile slugs are sanitized to one bounded filename component and cannot escape the directory. Nothing older than 30 minutes is surfaced |

`writeFeatureAdrStateDetailed` scopes its monotonic guard by equal, non-empty `runId` values;
different ids open a new phase and two absent ids retain legacy behavior. The staged workflow mints
and carries such an id in its shell command, and the CLI adapter forwards every non-empty `--run-id`
into this core input. Empty or omitted values are still absent from state, preserving the legacy
compatibility path.
| `operations` | `runInit`, `runSync`, `runVerify`, `runDoctor` | The harness operations, returning structured reports. `InitReport` and `SyncReport` carry an additive, always-present `failures: readonly SkillLoadFailure[]` (empty when nothing failed): a single unloadable `SKILL.md` used to throw out of the whole loop, so `dz init`/`dz install`/`dz sync` reported NOTHING at all. They now skip, collect and name — skipping without a record would only trade a loud failure for a silent one. `runDoctor` is deliberately untouched: it was never a throw site, and a negative test asserts it gained no `failures` field |
| `release` | `collectPackageFacts`, `selectAffectedPackages`, `planReleaseGates`, `classifyGateExecutions`, `buildFailureIssue`, `firstOutputLine` | Pure verified-release engine behind `dz release`: plans 4 HARD gates (tests / `pnpm audit --prod` / `node --check` / bin smoke-boot) as DATA and classifies injected results fail-closed — an unbuilt package (declared `build` script, no dist JS) is a `MISSING_DIST` failure, a template-only pack is a named `SKIP_NO_ARTIFACTS` skip, `selectAffectedPackages` fail-opens to the full set when the changed-file list is unavailable |
| `publish-sibling-drift` | `detectSiblingDrift`, `normalizedPackageJsonText` | Pure sibling-drift detector behind the `dz publish` gate: for every `workspace:*` sibling, the registry tarball's dist/files/bin and the SHIPPING fields of package.json (name/type/main/module/types/exports/bin/files/engines/os/cpu + dependency names) are hashed against the workspace; any difference is a named violation that blocks the batch unless the sibling joins it (`--include-drifted`). |
| `packed-install-smoke` | `planPackedInstallSmoke`, `judgePackedInstallSmoke`, `packedTarballName` | Pure plan/judge halves of the post-bump smoke: pack each package that declares a `bin` (workspace specs rewritten to exact sibling versions), install the tarballs into a clean directory under `/var/tmp` (npm no-ops `file:` tarballs under `/tmp`), run `<bin> --version`; exit 0 with non-empty stdout is the only PASS. |
| `setup` (memory backend) | `resolveSetupMemoryBackend`, `memoryBackendSourceLabel` | `dz setup` backend resolution flag > `.dz/config.json` > default, with the source named (`flag`/`config`/`default`/`default-unreadable`/`disabled`); a downgrade rewrites only `memory.backend`. |
| `embed-socket-path` | `resolveEmbedSocketPath`, `embedSocketPointerPath`, `readEmbedSocketPointer`, `resolveEffectiveEmbedSocketPath`, `EMBED_SOCKET_PATH_BYTES_LIMIT` | Unix-socket path resolver shared by the embed daemon, the recall hook and `dz doctor`: env override > project `.dz/embed.sock` when ≤ 100 bytes > `<tmpdir>/dz-<uid>/embed-<sha1[12]>.sock` (`tooLong` when even that overflows); the pointer file `.dz/embed.sock.path` is trusted only while its target exists. |
| `parity` | `TARGET_CAPABILITIES`, `PARITY_FEATURES`, `computeParity`, `buildParityMatrix` | Declarative target-parity model behind `dz parity`: verified capability flags per target × feature FORMS with requirements; the feature×target matrix is always COMPUTED (never hand-written), and the model must classify exactly `TARGET_NAMES` — an unclassified new target refuses to compile |
| `delivery-check` | `PLANE_SPECS`, `collectDeliveryFacts`, `planDeliveryCheck`, `renderDeliveryBrief`, `classifyDelivery`, `renderDeliveryReview` | Pure portable Step-10 Delivery Gate engine behind `dz delivery-check`: the four review planes as shared DATA (prose-identical to the workflow's inline `planePrompts`, held by a drift-guard test), a deterministic plan/classify over injected facts+findings, and the FAIL-CLOSED hand-off verdict — `ready` only off complete, cross-validated, clean evidence; classification reads only numeric severity counts so injected instruction-like text cannot move the verdict. No `child_process`; the only fs is `existsSync` in `collectDeliveryFacts` |
| `skills-verify` | `scanSkillsLayout`, `parseInitFacts`, `verifyRegistration`, `registrationExitCode`, `renderRegistrationReport` | Pure registration-gate engine behind `dz skills-verify`: a static scan of `.claude/skills/` (which dirs CAN register + the shapes that never can) and a **sealed** verdict over one atomic evidence bundle (`RegistrationEvidence` = the whole scan + a tagged probe result + a provenance record). Cardinality and parse integrity are derived INSIDE from the raw `system/init` stream, so no caller can omit or falsify them. FAIL-CLOSED: an unobservable registration is `inconclusive`, never `pass`; a plugin-shaped container is advisory and its fate is decided by whether the session says that plugin LOADED, never by the layout. Also exports `findNonRegistrableSkillDirs` — the publish-time guard fact behind the `skills-registrable` rule (a pack counts only if it already has one registrable skill; a dir is flagged only when a `SKILL.md` exists inside but below depth 1 — the discriminator was chosen after MEASURING the real packs, since a naive rule flagged ~40 healthy dirs across 9 npx toolkits). Plugin containers are attributed by `init.plugins[].path`, never by directory name; a container whose plugin did not load FAILS, one that loaded PASSES with an advisory that its individual skills are unverified (modelling Claude Code's command-name resolution produced a new wrong verdict in every review round — the gap is disclosed, not guessed). Sees SLASH COMMANDS too: `InitFacts.slash_commands` carries the session's command listing (MEASURED on Claude Code 2.1.233 — `system/init` emits `slash_commands`, and a plugin command registers as `<plugin>:<file basename>`, not as its frontmatter name), `RegistrationEvidence.expectedCommands` names what must appear, and an ABSENT `slash_commands` key is `inconclusive` exactly like an absent `skills` key — never an empty list, because schema drift and "the commands did not load" are different facts. `declaredPluginSurface(dir)` derives the expected names from a plugin's own manifest so a gate run cannot drift from the manifest it checks, and returns `null` (never an empty, vacuously-passing expectation) for an unreadable one. Also ships the ADVISORY content layer (`buildContentProbePrompt` / `classifyContentProbe`): registration is not usability, so an extra model turn asks for a VERBATIM quote as evidence — advisory by construction, it never gates. No `child_process` — the CLI owns the probe |

### Mutation registry: entry-scoped refusal and declared gaps

Every new mutable registry entry must carry an `observed` count measured by running
`dz mutation-gate --only <id>`. Legacy entries without that field are tracked as debt: the current
ceiling lives in `test/observed-debt-ceiling.json` and may move only downward.

Run outcomes distinguish **green**, **tests-failed**, **runner-infrastructure**, and
**unknown-nonzero**. The existing API keeps its names: the exit code identifies green;
`classifyRunFailure(output)` classifies nonzero runs as `assertions` (tests-failed),
`runner-infrastructure`, or `unrecognised` (unknown-nonzero), with `file-load` retained for
collection/import failures. Callers must check the exit code before classifying a red run.

`runner-infrastructure` requires both an explicitly parsed zero failing-test count and the
Vitest pattern `[vitest-worker]: Timeout calling "<method>"`. Its closed reason is
`worker-rpc-timeout`; evidence names the actual RPC method. A missing count or a zero without
that pattern remains `unrecognised`. Existing assertion and collection checks take precedence;
the `node --test` / TAP classification is unchanged.

**`runner-infrastructure` is NOT green.** It renames a red run, it never passes one: a run that
carries it still fails, and no caller may treat it as success. The point is that the operator is
told *what* broke — the runner's own worker RPC, with zero failing tests — instead of reading a
bare nonzero exit code and guessing. `discrimination-gate` deliberately narrows the new kind back
to `unrecognised` at its intake: that gate has no infrastructure policy, so its behaviour stays
byte-identical, and the narrowing is a single commented line rather than a silent widening of its
own `EvidenceFailureKind` vocabulary.

**Infrastructure is not green.** The baseline and restored-baseline reports name the cause
through `attributeBaselineRedness`; the baseline stays an error and the restored run stays
`INCONCLUSIVE`. Under mutation, the parsed zero fails the minimum-failing-test contract
(`BELOW_MIN`), never `PROVEN`. Unknown nonzero runs also remain failures. This identifies a
runner timeout; it does not fix the contention that caused it or suppress unhandled errors.

`parseMutationRegistry` keeps valid mutation entries executable when a neighbouring entry is malformed.
The malformed row becomes `ENTRY_INVALID`, is counted as `entryInvalid`, and still makes the aggregate
gate verdict fail. Invalid JSON or an invalid registry envelope remains a setup error; entry-scoped
handling does not reinterpret a document that cannot be parsed.

An unexecutable protection can be declared in the registry without supplying a mutation:

```json
{
  "id": "workflow-outside-package",
  "property": "The workflow keeps its cross-family QE guard.",
  "file": "../../../.claude/workflows/feature-adr.js",
  "uncoverable": true,
  "reason": "The mutation executor is confined to its package scratch copy."
}
```

The reason must be a non-empty string. A reason-bearing declaration becomes `COVERAGE_GAP`, is counted
separately as `coverageGaps`, runs no mutation, and — since the owner's decision of 2026-09-09
(option A) — does **not** fail the aggregate verdict. A declared gap is a DEBT, not a breakage: some
protections are uncoverable by construction (the orchestrator script lives outside every package),
so failing on them would pin this package's gate red forever, and a lamp that is always on is read
exactly like a lamp that is off. What the mechanism owes is COUNTABILITY, and the summary delivers
it: gaps get their own line, their own per-entry verdict, and a `⚠` marker distinct from a failure's
`✗`, so a gap can never be mistaken for a proven protection. `ENTRY_INVALID` still fails — a
malformed entry is a broken claim rather than a declared one, and its author can fix it today.
This is an author's
visible declaration, not measured proof that the stated reason is correct. In particular, declaring an
outside-package file does not make that path mutable: an ordinary mutation entry with the same path is
still `ENTRY_INVALID`, and the executor's package boundary is unchanged.

## The additive guarantee

`applyEmitResult` is the only part of the harness that writes to disk. It is
**additive** (ADR-001): it creates new files and directories, it never deletes,
and it never overwrites an existing file unless `force: true` is passed
explicitly. Operations that would overwrite are reported as `skipped`.

## Loop plans and the workflow factory (`loop-plan/1`)

Custom Workflow loops used to be written by copy-pasting a 1470-line battle script. harness-core
now ships the loop-designer meta-factory:

- **`loop-plan/1`** — an internally-versioned typed workflow-plan schema (steps/deps/typed pauses/
  windowed fanout with a mandatory registry + `maxFanout` concurrency (every item dispatches by
  default; deliberate prefix sampling requires `overflow:'truncate'` + `truncateReason` and emits
  banner/stderr/trace receipts)/failure-class retries defaulting to
  `maxAttempts: 1` for agent stages/`CachePolicy` keyed on normalized input as a SEPARATE identity
  from position-keyed checkpoints). `parsePlan` / `validatePlan` (INV-1…8) / `normalizePlan` /
  `planDigest`, plus an `x-` extension point (vendor keys ride the digest, never validation).
  **v1 enacts a deliberately NARROW surface completely** — anything else is rejected with a named
  diagnostic instead of silently promised: retry is `{maxAttempts, retryableFailureClasses}` with
  IMMEDIATE retries (the timing family `initialDelayMs`/`backoffMultiplier`/`maxDelayMs`/`jitter`
  is validated-away, `ENACT-RETRY-TIMING`); dispatch is `inline` only (`codex-wrapper`/`codex-exec`
  are validated-away, `ENACT-DISPATCH`); checkpointing is all-or-nothing per run with a pinned
  schema stamp (`step.checkpoint` and `checkpointing.schemaVersion` are validated-away,
  `ENACT-CKPT-OPT`). Required fields are enforced by a source-derived `REQUIRED_FIELDS` table
  (an absent required field is a parse error), stepIds must be unique AND must lower to DISTINCT
  generated identifiers — the lowering is collision-resistant (an 8-hex truncated-sha256 suffix on
  a lossy sanitization), NOT injective, so the actual guarantee is the `IDENT-1` parse check, which
  compares the lowered strings and rejects any collision — and dependency ordering is checked at
  EFFECTIVE execution positions
  (fanout members/joins execute at their region's position). The schema is **CLOSED-WORLD**: an
  unknown non-`x-` key is a parse error at EVERY level (top-level, per step, and every nested
  record — retry/artifacts/budget/cache/checkpointing/trace/subsystems/gates/fanouts/joins/pauses),
  and `x-` vendor keys are accepted only at their documented scopes, so a second spelling such as
  `retry.delayMs` or `dispatchRoute` can no longer parse, ride the plan digest and enact nothing.
  `fanouts[].registry` items are checked against the ONE ItemKey domain the trace plane uses, so
  turning tracing on can never change whether a valid plan runs. The deferred options live on the
  roadmap — a plan must not validate while promising unperformed behavior.

  **What "closed-world" proves, precisely** (the cross-family reviewer's one conceded caveat, kept
  here rather than in a design doc): every record path the schema CURRENTLY wires is closed, and no
  present-day key spelling reaches the plan without a named diagnostic. It does NOT prove that a
  record kind added in the FUTURE is closed automatically — the parser's descent and the honesty
  suite's interface roster are bounded by hand, so a new nested record-typed field whose own
  interface is never added to them can escape while the equality guards stay green. The four-step
  extension discipline that closes that gap is documented in `loop-plan.ts` at the CLOSED-WORLD KEY
  SETS block; deriving it from the interface graph is a filed backlog item.
- **Scope: this package AUTHORS, GATES and READS loops — it never RUNS one.** `renderPlan` emits a
  script; EXECUTION is the Claude Code host's `Workflow({scriptPath})` runtime, which owns the agent
  dispatch the generated script calls into. Every claim above is therefore about the plan, the
  generated text, the lint verdict, and a trace file a host run already wrote — never about runtime
  behaviour this package could observe itself.
- **One plan, three projections** — `toOracleProjection` (requirement-oracle graph diff),
  `toLintProjection` (CFG with synthetic entry/exit + fork/join pairs), `toTraceProjection`
  (expected runtime invariants). No consumer reads raw plan fields — a layer-1 source-grep test
  enforces it with an empty allowlist.
- **`loop-render`** — schema-driven generator: ONE region-delimited script (`BLOB` = verbatim
  registry bytes, `GENERATED` = plan-derived incl. the unconditional `runStep` choke point,
  `USER` = hand-editable, preserved byte-for-byte on re-render) + a sidecar plan written FIRST.
  The exec fingerprint hashes topology/prompts/models/tools INDEPENDENTLY — changing any single
  axis refuses a resume.
- **`LoopStep.tools?: string[]`** — the DECLARED per-step MCP tool perimeter
  (`<server>:<capability>` entries, e.g. `['gitlab:read', 'jira:read']`). Enacted, not decorative: a
  non-empty array renders a fixed contract line into that step's prompt, and `validatePlan` rejects
  the field on a non-dispatching step kind. `tools: []` is the meaningful value for a step that
  touches no external tool. **It is a DECLARATION, not enforcement** — `agent()` exposes no tool
  restriction, real enforcement lives at the MCP server, and no document may call this a sandbox.
- **`loop-lint`** — 18 deterministic rules with a 3-valued verdict per rule and overall;
  `inconclusive` is never a pass. Barrier checking is real CFG POST-dominance (plain dominance is
  insufficient); unbounded fanout is a plan-layer hard FAIL; script size is WARN-only.
  `tool-perimeter-declared` (the 18th) checks that every dispatching step declares a well-formed
  `tools` perimeter — **absence FLAGS: silence is never permission** — and is staged in severity:
  WARN by default, FAIL only under `--require-plan`, so the published 0.4.x lint contract stays
  non-breaking.
- **`loop-trace`** — the loop is its own sequencer: `seq` is allocated at the dispatch/settle
  transition by one serialized counter (never at the journal write); `wallTime` is diagnostic
  only. Readers: `parseTrace`, `assembleTimeline` (the host journal is agentId-correlation only,
  never ordering), `runInvariants` (one implementation, two call sites: fitness suite + CLI),
  `renderTimelineHtml` (mermaid topology + an HTML waterfall — never a second mermaid diagram).
  Trace projection v2 additionally proves fanout admission per registry position under
  `region-dispatch-completeness:<fanout>`; legacy projection v1 is `inconclusive`, never a guessed
  pass. The committed `pkg-audit-1` 3-of-6 incident is the regression fixture.
- **Subsystem blobs** (`loop-blobs.generated.ts`, machine-owned): checkpoints, training-pairs
  (default OFF — the health-advisor PHI lesson), model-resolver (auto-included when any
  `step.model` is set), usage-probes, codex-dispatch, challenge-panel, trace — regenerated from
  the canonical TS by `scripts/gen-loop-blobs.mjs`; CI diffs committed-vs-regenerated ("test the
  generator once"). Coverage is SCOPED by `BLOB_COVERAGE_MANIFEST`: today it lists
  `feature-adr.js` (checkpoint region), its published twin, and `health-advisor.js`
  (ha-consult-router region); the remaining hand-mirrors carry in-file "stage 2 pending" notes and
  a tracked backlog item — never a blanket closure claim.

**BREAKING in 0.4.3** (0.x minor is this package's breaking channel): the ADR-005 workflow
templates are retired — `WorkflowTemplate`/`WORKFLOWS`/`getWorkflow` removed, `WORKFLOW_NAMES`
now empty. Replacement: `dz workflow init/validate/render` + `dz workflow-lint`/`dz workflow-trace`
(see the CHANGELOG).

## Always-on policy sync for Codex

`runSyncAgentsPolicy` is the I/O shell around the pure `agents-policy` module. It reads the fixed
anchor registry from `CLAUDE.md` and `.claude/rules/*.md`, renders those clauses verbatim, and
updates only the independent `dz:policies` fence in the root `AGENTS.md`. The write path is the
same `writeManagedMarkdown` helper used by `runInitAgentsMd`; `--check` callers never write.

Use it after changing an anchored bearing rule, and in CI before publish. Missing sources are
`inconclusive` rather than a pass, oversized output is refused before any write, and hand-authored
content plus the existing `dz:skills` fence is preserved.

## Codex hook carrier (`hooks-sync --target codex`)

Five modules deliver the dz veto + auto-recall hooks to Codex's user-global registry, and one of them
is shared with the Claude Code path rather than duplicated:

| Module | What it is |
|---|---|
| `managed-hooks.ts` | `mergeManagedHookEntries` — the **one** event-level hook merge, used by BOTH targets. Foreign entries are kept byte-for-byte; the attribution predicate is the only parameter that differs (substring for Claude, sha-over-manifest for Codex). |
| `codex-hooks.ts` | paths (all `CODEX_HOME`-relative), the two managed entries, sha attribution, manifest, drift, and the `config.toml` trust block. Pure. |
| `codex-hooks-verify.ts` | `classifyVetoProbe` — a fail-closed two-axis classifier (`verdict` × `trust`). No branch defaults to a pass; a `--dangerously-bypass-hook-trust` run can never yield one. |
| `shell-veto-policy.ts` | `vetoShellCommand` + `resolveVetoMode`. ONE rule, `ssh-explicit-auth-weakening`; **warn by default**, block only on explicit project opt-in. Pure, no I/O. |
| `codex-hooks-assets.ts` | the two emitted `.cjs` helper bodies (the `generateAgentdbWriter` pattern). |

`runSyncCodexHooks` (in `operations.ts`) is the I/O shell: refuse → read → merge → back up → atomic
write → helpers → **install-time liveness self-probe** → arm trust → manifest → **live veto probe**.

The last step is the one that decides what may be printed. `runCodexVetoProbe` drives ONE
non-bypassed `codex exec` in a hermetic, consenting workspace with a nonce-scoped sentinel, and
`classifyVetoProbe` grades it; the report's `ready` is `installed ∧ executable ∧ trusted ∧ a
witnessed block`, and nothing else may reach a success word. `verify: false` (the CLI's
`--no-verify`) never yields exit 0 — a refusal to measure is inconclusive, not success. This is the
independent review's CRITICAL finding: the classifier and its exit map existed and were never called
from any production path.

Two spellings that are NOT the same fact, both MEASURED on codex-cli 0.148.0: a trust KEY embeds
`pre_tool_use`, while `hooks/list`'s `eventName` FIELD says `preToolUse`. `sameHookEvent` normalises
both — pinning either alone matches zero rows, writes no trust, and the guard stops firing while
every unit test stays green (it did; the live probe caught it).

Two runtime facts it encodes, both MEASURED on `codex-cli 0.147.0` and RE-CONFIRMED on `0.148.0` at
the independent-QE fix round (a capability grant now records the runtime version it was measured on,
and a grant whose recorded version is not the installed one is reported `stale-runtime-version` —
inconclusive until re-probed). Both are load-bearing:

- **Hooks are trust-gated.** A written entry is silently never run until trust is recorded per entry
  in `$CODEX_HOME/config.toml` as `[hooks.state."<key>"] trusted_hash = "<currentHash>"`. Both values
  are READ from codex's own `hooks/list` app-server RPC — never computed — so dz cannot arm an entry
  it did not just emit, and editing a helper disarms it rather than inheriting its trust.
- **The runner spawns via `$SHELL -lc`.** A bare `node` is frequently absent from a non-interactive
  login shell, and the helper then exits **127**, which the runtime reads as **ALLOW** — a blocking
  guard silently dead in the fail-open direction. So the interpreter is an absolute `process.execPath`,
  both paths are single-quoted, and install runs a liveness self-probe through the same shell. A hook
  that cannot execute is reported **not armed**, never "installed".

`appendRecallUsage` in `recall-usage.ts` is the single chained writer both runtimes call; rows carry
`runtime: 'claude-code' | 'codex'` (absent ⇒ `claude-code`), and the compaction aggregate carries a
`runtimes` set union so provenance survives the lossy path.

## Destructive-command guard (`classifyDestructive` / `decideDestructiveHook`)

A pre-execution veto on the ONE class of loss the harness has actually suffered: a literal shell
deletion aimed at its own stores. `classifyDestructive(command)` is pure and returns one of three
verdicts — `refuse` (a deletion verb with a literal operand inside `.dz/`, `.agentic-qe/`, or a
database file such as `*.db` / `*.sqlite`), `allow`, or `undecidable` (the operand is built by the
shell: `$var`, `$(…)`, globs, a `bash -c` string that itself expands something). Every refusal names
the path AND the rule id from `DESTRUCTIVE_RULES`; `undecidable` is printed, never silently mapped
to either side.

The scope is narrow by DECIDABILITY, not by taste — MEASURED by
`bash scratchpad/corpus2.sh r17` on a 20 938-command corpus of real session commands: 35 refusals
(0.167 %), 45 undecidable, the rest allowed; both verdict lists are byte-identical to R16. Four
limits are printed with every verdict
so nobody reads more into it than it does: (1) it sees the command text, never the filesystem;
(2) an operand assembled at runtime is `undecidable`; (3) only the four deletion verbs `rm`, `rmdir`, `unlink`, `shred` are heads — `git rm`, `find -delete`
and a `>` truncation are deliberately outside the scope;
(4) quotes are decoded ONLY under a deletion verb or a table-declared shell command carrier:
shell `-c`, npm/npx `-c`/`--call`, or pnpm's global `-c`/`--shell-mode` before `exec`. Under any
other head the quoted text is text ABOUT a command, and heredoc / comment bodies are never read.

Wrapper command location is declared once in `COMMAND_WRAPPER_STRATEGIES`: first positional argv,
option value, shell `-c` string, or named external script, together with `execution: argv|shell`.
R17 removed the two parallel wrapper registries that let npm/npx/pnpm shell carriers fall between
branches. The same round restores function bodies after brace-expanding call words and respects
`POSIXLY_CORRECT` when deciding whether a late `--help` is a mode or an operand.

`decideDestructiveHook(payload, host)` in `destructive-guard-hook.ts` is the host adapter. Both
hosts call the SAME function: Claude Code through `.claude/hooks/destructive-guard.cjs`
(`PreToolUse` on `Bash`, exit 2 + `DZ-DESTRUCTIVE-REFUSE:` on stderr), and Codex through the
emitted veto helper (`hooks-sync --target codex`, helper version 6). The helper loads the decider
with `import()` — on Node < 20.19 a CommonJS `require()` of this ESM package throws
`ERR_REQUIRE_ESM`, and the previous body turned that into a silent exit 0 (MEASURED: exit 0, empty
stderr). A decider that fails to load now prints ONE `DZ-DESTRUCTIVE-WARN: guard not loaded —
<reason>` line and records `destructive-not-loaded` in `helper-errors.jsonl`; it still fails open,
but never quietly.

The Claude hook has three operating states:

| State | Behaviour |
| --- | --- |
| Full: the decider loads and returns a readable verdict | Existing policy: refuse with exit 2, allow silently, or pass an undecidable command with its warning and limits. The built-in literal check does not participate. |
| Narrow: no decider loads | Refuse textual literal recursive `rm` commands (for example `rm -rf .dz`); pass everything else with exactly one `DZ-DESTRUCTIVE-WARN:` stderr line on **every** invocation, including repeated commands. The line explicitly names partial protection, the observed loading failure, and how to restore full protection. Bootstrap commands such as `npm ci`, `npm install`, `npm run build`, and `pnpm install` can run. |
| Runtime failure: loading unexpectedly rejects, or the loaded decider throws/returns an unreadable verdict | Existing behaviour: exit 0 with a warning; this is not an established safety verdict. |

The narrow check recognises the literal `rm` word followed by short options containing `r`/`R`
or `--recursive`. It is a textual pattern, not a shell parser: quoting, substitutions and nested
shell constructs are not interpreted, so crafted deletion can pass and quoted command-like text
can be refused. Non-recursive deletion such as `rm .dz/agentdb.db` also passes in this state.
Missing build output does **not** imply that the project contains no valuable data. Full protection
requires a working decider: build harness-core in this repository, or reinstall the CLI and repeat
`dz setup --target claude-code` for a consumer installation. The Codex helper's loading-failure
behaviour described above is unchanged.

The registry currently contains 121 `guard-*` entries. R17's exhaustive anchor census identifies
the anchors displaced by the source refactor; new/repointed entries are staged separately under
`scratchpad/` until the owner lands the registry mutation. `dz mutation-gate` proves each accepted
protection by making at least one named test red; each
protection, when deleted from the source, turns at least one named test red. Design record:
`features/destructive-command-guard/03_adr/001-narrow-by-decidability.md`.

## Apply-leg module (`apply-leg.ts`) — the third self-learning leg, shipped by `dz setup`

Self-learning is COLLECT (session hooks → store) → RANK (`dz teach`/`dz recall`/`dz consolidate`) →
APPLY (a `UserPromptSubmit` hook injects ranked lessons back into the next prompt). Before this
module, `runSetup` shipped the first two legs; the third existed only as two hand-committed files
in this repo's own `.claude/helpers/` — every OTHER project that ran `dz setup --memory agentdb`
got collection and ranking but never automatic recall injection (MEASURED 2026-09-12: a clean
scratch install on 0.8.10/0.8.22, with or without `--memory agentdb`, wrote no `UserPromptSubmit`
hook entry at all).

`apply-leg.ts` is the versioned SOURCE of that leg, in the same shape `AGENTDB_WRITER_VERSION`/
`generateAgentdbWriter` already used for the session-hook writer:

- `APPLY_LEG_VERSION` / `applyLegVersionOf(content)` — the `// dz-apply-leg-version: N` stamp
  (line 2 of both generated files) and its parser. Unlike `writerVersionOf` (floors an absent stamp
  at `0`), `applyLegVersionOf` returns `-1` for "never installed" so `applyLegStatus` can tell that
  apart from "installed at v0".
- `recallHookSource(coreDistDir)` / `embedDaemonSource()` — the two generated files, byte-for-byte
  identical to the pre-existing hand-committed hub copies except for the version stamp and (recall
  hook only) the resolve-candidate list. `coreDistDir` is baked in as the FIRST candidate
  `loadCoreModule` tries — an absolute path the CALLER resolves (the installing CLI's own
  `@dzhechkov/harness-core`, or the hub's own `harnessCoreDistDir()` for its own copies) — replacing
  a hard-coded `/usr/lib/node_modules/...` guess that failed on any other npm prefix (nvm,
  `/usr/local`, a differently-rooted global install).
- `applyLegHookEntries(installRoot?)` — the exact `UserPromptSubmit`/`SessionStart` hook-registry
  entries `runSetup` merges into `.claude/settings.json` (a swallowed non-zero exit on the recall
  hook so a broken body never blocks a prompt; a detached `nohup` spawn for the daemon so
  `SessionStart` never waits on the ~1.5 s model load). `installRoot` — an ABSOLUTE path — bakes both
  commands as `node "<installRoot>/.claude/helpers/<file>" …`; omitting it (every zero-arg caller
  before feature `apply-leg-install-root`) keeps the original `${CLAUDE_PROJECT_DIR:-.}`-relative
  form. See "Install-root resolution" below for why the absolute form exists.
- `applyLegStatus(root)` — the ONE measurement `dz doctor` and `dz parity` both read: do both helper
  files exist, at what version, and does `settings.json` actually reference them? Neither surface
  may declare the leg "installed" from a static capability table again (ADR-001 Decision 3) — a
  project with `memory.backend=agentdb` configured and nothing else gets a NAMED red row from
  `dz doctor` (`apply-leg installed`, `ok:false`) and a `manual` cell from `dz parity`, never a
  silent `✓`.

`runSetup`'s "Install apply-leg" step (agentdb backend only — jsonl reports `skipped` with the
named reason: the embed daemon needs agentdb's transitive transformers dependency) also creates an
EMPTY, schema-only `.dz/agentdb.db` via `ensureAgentdbSchema` (`agentdb-index.ts`, reusing
`REASONING_BANK_SCHEMA` verbatim — never a second, duplicated schema string) when the file does not
already exist, so `dz teach` has somewhere to mirror into before any session has ever ended.

The hub regenerates its OWN `.claude/helpers/recall-hook.cjs`/`dz-embed-daemon.mjs` from this same
generator (with the hub's own `coreDistDir`, via `harnessCoreDistDir()`) — a twins test
(`test/apply-leg-twins.test.ts`) keeps the two byte-identical, the same discipline `feature-adr`'s
workflow twins test applies to its own generated scripts.

### Short socket path for deeply nested projects (`embed-socket-path.ts`)

A unix domain socket path is capped by the platform's `sun_path` buffer — 108 bytes on Linux, 104 on
macOS, NUL included — measured in BYTES (`Buffer.byteLength`, not `.length`: a multi-byte path
component costs more bytes than characters). Past that limit the embed daemon's `.dz/embed.sock`
bind used to fail while everything ELSE about the daemon looked healthy — the daemon logged "ready",
and the recall hook and `dz doctor` both independently recomputed the SAME too-long path and reported
it absent, three consumers agreeing on a wrong answer for three unrelated reasons.

`resolveEmbedSocketPath(projectRoot, env?)` is the ONE resolver all three now share: `DZ_EMBED_SOCKET`
wins if set; otherwise `<projectRoot>/.dz/embed.sock` if its byte length is ≤100 (a safety margin
under both platform limits); otherwise a short, deterministic path under `os.tmpdir()` keyed by a
12-hex-char SHA-1 of `projectRoot` (`{reason: 'tmpdir-short'}`). When the daemon binds on the
tmpdir-short branch it writes `<projectRoot>/.dz/embed.sock.path` — a pointer to the path it actually
bound — so a reader whose `os.tmpdir()` might differ (a different `TMPDIR`) still finds it via
`resolveEffectiveEmbedSocketPath`, which prefers the pointer ONLY on that branch (the `env`/`project`
branches don't depend on `os.tmpdir()`, so there is nothing for a pointer to protect against there).
The daemon and the recall hook — both standalone generated files that cannot `import` a compiled
module — carry this logic inlined as TEXT, kept in lockstep with the exported function by
`test/apply-leg-twins.test.ts`; `dz doctor`'s liveness check is a real `import` and now names the
ACTUAL resolved path (`embed socket present at <path> (tmpdir-short: project path N bytes > 100)`)
instead of only ever checking the plain project path. The daemon also now prints `ready` ONLY after
`existsSync(SOCKET)` confirms the bind landed post-`listen()` — a bind failure logs `bind failed: …
(path N bytes)` and exits non-zero, never a silent "ready" for a socket that was never created
(`APPLY_LEG_VERSION` bumped 3→4 for this and the resolver change).

`probeApplyLeg` (and `probeHookLiveness` beneath it) now report **`groupKillAttempted`** — whether the
liveness probe actually issued its process-group `SIGKILL` (attempted after EVERY probe outcome — timeout, exit, spawn error; ESRCH still counts as attempted) — as an OBSERVED field,
set in the `finally` right after the kill attempt and present only on branches that reached a spawn.
A test can therefore assert "the kill was attempted" separately from "the child is dead" instead of
inferring the first from the source (feature `full-suite-flake-fixes-3`, Codex HIGH-1; the mutant
that never reports the attempt is registry entry `probe-group-kill-attempted`).

### One recall engine for hook and CLI (`hook-recall-hybrid-parity`, ADR-001, `APPLY_LEG_VERSION` 4→5)

The daemon's `op: recall` handler used to run its own brute-force cosine loop over the in-memory
mirror — a SECOND engine, diverging from `dz recall`'s `recallHybrid` (FTS5 lexical + semantic +
RRF). MEASURED (record 097ca040): 41.8% of taught lessons went unretrieved by either path over 48
days, and an exact lexical match at cosine 0.39 was silently dropped by the hook's cosine floor.

`embedDaemonSource(coreDistDir?)` now takes the SAME `coreDistDir` parameter `recallHookSource`
already had (default `null`, the hub's own portable marker) and inlines the SAME `loadCoreModule`
candidate-list pattern the hook uses, loading `index.js` from the resolved `CORE_DIST_DIR` to reach
`recallHybrid`/`patternRecordId`. `answerRecall(prompt, limit)` — the whole `op: recall` answer —
tries `hybridRecall` first: `core.recallHybrid(PROJECT, prompt, { limit, mode: 'hook',
deferExposures: true })`, raced via `Promise.race` against a `HOOK_RECALL_BUDGET_MS` timer (env,
default 500, always below the hook's own 800 ms socket timeout). On success the reply carries
`engine: 'hybrid'` and `hits[].score` normalized from the raw RRF sum into `[0,1]`
(`score / (2/(RRF_K+1))`, `RRF_K=60` — duplicated from `vector-tier.ts`'s own constant since this is
standalone generated text; `apply-leg-twins.test.ts` does not currently pin the two numerically
equal, only that both exist as literals — a numeric drift would need to be caught by the parity
test's own live assertions). On budget overrun / engine error / no resolvable core module, it falls
straight through to TODAY'S cosine leg (byte-identical) with `engine: 'cosine-fallback'` and a
`reason`.

`HybridRecallMode` in `vector-tier.ts` gained a fourth literal, `'hook'` — ranked identically to
`'hybrid'` (no semantic-weight change); its only role is to travel end to end for observability. The
ACTUAL mechanism that keeps a per-prompt recall from moving the lesson-bandit's exposure counters is
`deferExposures: true` plus never calling the returned `commitExposures(...)` — `recallHybrid`
already supported deferral for `dz recall --domain`'s own over-fetch-and-truncate case; the daemon is
simply a second caller of the same contract.

`pickEngine` (the one seam `recallHybrid`, `mirrorPatternsToVector`, `teachGuard` etc. all resolve
their engine through) now routes through `getOrOpenEngine(projectRoot)` instead of calling
`resolveVectorEngine` directly — a per-process cache keyed by `realpath(projectRoot)`, invalidated
whenever `.dz/agentdb.db`'s mtime, size, inode, OR write-generation counter (see "Store
write-generation counter" below) changes, so a long-lived caller (the daemon) pays the
`isPackageInstalled`/`probeNativeDep` walk once, not once per prompt. A short-lived CLI invocation is
unaffected (the cache is populated and discarded within one process either way — I-1 parity holds).
`getOrOpenEngine`'s second parameter is an injectable resolver (default `resolveVectorEngine`) purely
for spy-testability — two functions in the same ES module cannot be reliably intercepted by
`vi.spyOn` when one calls the other by its local name.

### Install-root resolution (`apply-leg-install-root`, ADR-001, `APPLY_LEG_VERSION` 6→7)

Both generated files used to resolve their own store from `CLAUDE_PROJECT_DIR || cwd()` — the
SESSION's project, never the project the leg was actually installed into. A user-level install
(`dz setup --target claude-code --memory agentdb --project $HOME` — the owner's own layout, expecting
the leg everywhere `~/.claude/settings.json` is read) silently looked up a DIFFERENT project's `.dz/`
from every other session (issue #2, MEASURED on 0.8.25), and when `project === $HOME` the settings
command (`node "${CLAUDE_PROJECT_DIR:-.}/.claude/helpers/recall-hook.cjs"`) broke down to `Cannot
find module` from a foreign session, swallowed by `2>/dev/null || true`.

- **The hook and daemon now resolve `PROJECT` install-root-first.** `INSTALL_ROOT =
  path.resolve(__dirname, '..', '..')` (the hook, `.cjs`) / `dirname(dirname(fileURLToPath(import.meta.url)))`
  (the daemon, ESM) — the precedent is `claude-hooks-assets.ts`'s own `path.resolve(__dirname, '..',
  '..')` for the destructive-guard hook. Order for the hook: `INSTALL_ROOT` (used when it owns a
  `.dz/`) → `CLAUDE_PROJECT_DIR` → `cwd()`. Order for the daemon is the same shape but
  `DZ_PROJECT_ROOT` stays the TOP override (an explicit project root always wins over the install
  root) → `INSTALL_ROOT` → `cwd()`. The hook's existing `[dz-recall] engine=…` diagnostic line (stderr
  only, never `additionalContext`) now also names `root=<path> (install|env|cwd)`.
- **`dz setup` now bakes an ABSOLUTE command.** `applyLegHookEntries(opts.projectRoot)` writes
  `node "<installRoot>/.claude/helpers/recall-hook.cjs" …` instead of the
  `${CLAUDE_PROJECT_DIR:-.}`-relative form — the deployed helper already bakes an absolute
  `CORE_DIST_DIR`, so the relative command only masked that non-portability. `hookCommandInvokes` (and
  therefore `applyLegStatus`) recognizes BOTH forms — a command is "ours" once the helper's full
  `.claude/helpers/<file>` path follows a `node` invocation, whatever the prefix. A re-`dz setup` over
  a pre-feature relative entry REPLACES it in place (same array position — `addIfMissing` in
  `setup.ts` is now add-or-replace, never reorders), so an upgrade never leaves two entries for one
  event.
- **Limits, named plainly.** One store per install: from a foreign project's session the hook injects
  the INSTALL ROOT's lessons, not the session project's — that is the requested behavior (a
  per-project store alongside a user-level one is a separate feature). The Codex host's own hook
  (`codex-hooks-assets.ts:232`/`:373`) resolves its root from `payload.cwd || PWD || cwd()` via a
  single shared `resolveHookRoot(payload)` and now NAMES a not-found root on stderr instead of a
  silent early return (`codex-hook-root-provenance`, below); a live probe (T1, codex-cli 0.154.0,
  re-run correctly in fix-round 1 — see that feature's own change manifest) found `payload.cwd`
  always present and equal to `PWD`/`cwd()` across 3 scenarios / 6 captures, so no explicit-override
  knob was added — a SCOPED finding, not a claim that no producer could ever send a different value.

#### Codex hook root provenance (`codex-hook-root-provenance`)

Both Codex hooks (`dz-codex-veto`, `dz-codex-recall`) share ONE `resolveHookRoot(payload)` instead of
two copies of the `payload.cwd || PWD || cwd()` fallback, and a `root === null` early return now
prints one line to stderr — `[dz-codex-<hook>] skipped reason=no-project-root start=<startDir>
(<source>)` — so a hook that never found a project is distinguishable from one that is silently dead;
a found root stays silent unless `DZ_CODEX_HOOK_DEBUG` is set. Interpolated paths are escaped (C0
control range + DEL) before printing, so a hostile `cwd` cannot turn the "ONE line" promise into
several — the tradeoff is that the line still discloses the absolute directory the hook was asked
about (which can embed a username or a project name) to stderr, accepted because it is a diagnostic
for the person running the hook, not a return value. A live probe (three real `codex exec` sessions —
project root, a nested subdirectory, a directory with no `.dz` anywhere — each with BOTH hook events,
`PreToolUse` and `UserPromptSubmit`, captured separately; corrected in fix-round 1 after the original
reproducer's unexported `BASE` measured the wrong file) found `payload.cwd` always correct in every
one of the 6 captures, so there is no `DZ_PROJECT_ROOT`-style override — stated as "not observed on
codex-cli 0.154.0 across 3 scenarios / 6 captures", not as a claim that the "hook read the wrong
project" class cannot exist elsewhere.

### Store write-generation counter (`store-generation-counter`, `agentdb-index.ts`/`vector-tier.ts`)

`getOrOpenEngine`'s cache above invalidates on `.dz/agentdb.db`'s mtime/size/inode — AM-6 already
covers a temp+rename replace that preserves mtime (size or inode still differs), but a write of the
SAME byte length landing inside the same filesystem-mtime TICK, in place (no rename), could leave
all three signals coincidentally unchanged, serving the daemon a stale engine that never sees the
lesson `dz teach` just wrote. `indexPatternsToAgentdb` (`agentdb-index.ts` — the single write seam,
QR-6, every `dz teach`/consolidate/reindex/brain-mirror write) now bumps a sidecar counter file,
`<dbFile>.generation` (atomic tmp+`wx`+rename, next to the store itself so it travels with any copy),
on every successful write: `bumpStoreGeneration(projectRoot, dbPath?)` reads the current value via
`readStoreGeneration(projectRoot, dbPath?)` (missing/corrupt file degrades to `0` — the compatibility
floor for a store that predates this feature; a corrupt-but-numeric-looking value like `12junk` also
degrades to `0` — the parse is strict, `/^\d+$/`, not `Number.parseInt`'s leading-digits tolerance)
and writes `current + 1`. **Every exported store mutator bumps it** on its success path, not only
`indexPatternsToAgentdb`: `importVectorsToAgentdb`, `clearAgentdbQuarantine`, `deleteAgentdbByDzIds`,
`bumpAgentdbUses` and `reindexAgentdbRows` all call the same `bumpStoreGeneration` when they actually
changed a row (fix-round after independent Codex review, AM-1). The read-modify-write itself runs
under `withNamedLockSync(dirname(dbFile), 'store-generation', …)` (`named-lock.ts` — the repo's
advisory lock for a read-modify-write file store, `.claude/rules/cross-runtime-concurrency.md`; same
`dirname(dbFile)`-addressed pattern as `agentdb-reindex-marker.ts`'s `withAgentdbSnapshotLock`), with
the counter RE-READ from disk inside the lock — a bare read→compute→rename would let two concurrent
writers both publish the same `N+1` (one bump silently lost) or let a delayed writer overwrite a
later value with an earlier one (AM-2). Inside `indexPatternsToAgentdb`/`importVectorsToAgentdb` the
bump runs IMMEDIATELY after the row commit, BEFORE `writeEmbedManifest` — if the manifest write then
throws, the generation is already correct for the rows already on disk (AM-3). A write failure (a
jammed counter path, a full disk, an unresolvable path, or a lock that could not be acquired by its
deadline) is reported honestly on the index result (`generationBumped: false, generationReason`) but
NEVER fails the store write it accompanies, and `bumpStoreGeneration` itself never throws — telemetry
is not a gate (FR-4/AM-2/AM-4).

`getOrOpenEngine`'s cache-invalidation stat (`AgentdbDbStat`, `vector-tier.ts`) now carries
`generation` as a FOURTH independent signal alongside mtime/size/inode — a monotonically increasing
counter can never coincidentally match a stale cache entry the way mtime/size/inode occasionally can
on a coarse filesystem. Both public functions are exported from the package root
(`readStoreGeneration`, `bumpStoreGeneration`).

`dz doctor`'s "apply-leg alive (embed daemon)" check now sends one live `op: recall` probe
(`probeRecallEngine`, `operations.ts`, 1000 ms default — comfortably above the 500 ms production
budget default) when the socket exists, and appends `(engine: hybrid)` / `(engine: cosine-fallback)`
to the detail line on a successful reply. A non-listening path (every non-live doctor fixture in this
repo writes a plain file, never a real socket) fails the probe near-instantly, so every pre-existing
detail string is untouched.

**Honest NFR-1 finding.** MEASURED against the real 743-pattern production store on this machine,
100 real prompts from `.dz/recall-usage.jsonl`, under the documented default budget: EVERY reply
fell back to `cosine-fallback` — `resolveAgentdbEmbedder` (`agentdb-index.ts`) reconstructs the
transformers pipeline on every call with no cross-call caching (measured standalone: 2–3.6 s/call,
no warm-up across repeats in one process), so a cold semantic leg routinely exceeds the 500 ms
budget. The p95/p50/reproducer script live in
`features/hook-recall-hybrid-parity/07_code_changes/change_manifest.md`. Fixing the embedder's own
cache is `agentdb-index.ts` work, outside this feature's touched files — named here as a follow-up,
not silently absorbed into a passing-looking number.

### Green means injected, not merely present (`apply-leg-never-silent`, ADR-001, `APPLY_LEG_VERSION` 8→9)

Issue #2's second half: the recall hook exited 0 with NO stderr on every early-return path, and
`dz setup`'s own UserPromptSubmit command swallowed even a `Cannot find module` behind
`2>/dev/null || true` — a MEASURED state where `dz doctor` printed three green checks
(`apply-leg installed`, `apply-leg alive`, `memory hooks match config`) and `dz parity` printed
`✓ Self-learning … via UserPromptSubmit hook (auto recall)` while the leg injected nothing in every
session but one. Both instruments were reading FILE PRESENCE and STRUCTURAL WIRING as proof of
FUNCTION — the same class of defect ADR-001 Decision 3 already named for `applyLegStatus`, one layer
deeper.

- **The hook never exits silently now (FR-1).** Every early return in `main()` — `store-not-found`
  (no `.dz/` under the resolved `PROJECT`), `socket-absent` (no daemon listening), `core-unavailable`
  (`recall-hook-policy.js` unresolvable), `empty-prompt`, `no-hits` — prints exactly one line,
  `[dz-recall] skipped reason=<reason> root=<path> (<source>) session=<path>`, on stderr before
  returning. Exit code stays 0 — NEVER-BLOCK is unchanged; only the silence is gone.
- **`dz setup`'s own command no longer swallows that line (FR-2).** `applyLegHookEntries()`'s
  UserPromptSubmit command dropped `2>/dev/null` (both the legacy relative form and the
  `installRoot`-given absolute form); `|| true` stays, so a broken hook body still never fails a
  prompt. **Where that line actually goes, MEASURED against the real Claude Code binary** (strings
  extracted from `bin/claude.exe`, the `UserPromptSubmit` entry in its own hook-reference table):
  `Exit code 0 - stdout shown to Claude` / `Exit code 2 - block processing, erase original prompt,
  and show stderr to user only` / `Other exit codes - show stderr to user only` — on exit 0
  (NEVER-BLOCK's exit code), stderr is named NOWHERE in that table. So the reason line is NOT for a
  user watching Claude Code's own transcript (that channel does not exist for this hook on exit 0,
  whatever "verbose mode" might suggest) — it is for the two readers who actually read a spawned
  child's stderr directly: `probeApplyLeg`'s own `child_process` call below, and a human running the
  hook by hand from a terminal.
- **A live, end-to-end probe replaces "files present" as the proof of function (FR-3/FR-4, ADR-001
  Decision 1).** `probeApplyLeg(root, opts?)` — new export — spawns the REAL configured
  UserPromptSubmit command (read back from `.claude/settings.json`, never reconstructed — a
  reconstruction would silently stop testing the legacy relative form's own `${CLAUDE_PROJECT_DIR:-.}`
  shell-expansion dependency) from a TEMPORARY cwd with `CLAUDE_PROJECT_DIR` pointing at that same
  temp dir — the shape of a real session, never the project root itself. It writes a throwaway
  "beacon" lesson into the lexical store via `recordPattern` (the same seam `dz teach` uses — no
  embedding needed; the daemon's `recallHybrid` runs its LEXICAL leg synchronously and always, so an
  exact-token beacon is found even under a starved hybrid budget) immediately before the probe and
  removes it via `removePatternsByIds` in a `finally` — unconditionally, so a probe that throws,
  times out, or never finds the leg alive still leaves the store exactly as it found it (proven by a
  count-before == count-after test, not merely claimed). `ok: true` ONLY when the beacon's own token
  comes back inside `additionalContext`; every other outcome is `ok: false` with a `reason` — taken
  from the hook's own `[dz-recall] skipped reason=…` line when present (FR-1 feeding FR-3 directly),
  else a best-effort description.
  - `dz doctor` gains `apply-leg injects (live probe)`, evaluated whenever the existing
    `apply-leg alive (embed daemon)` row's `applyLegWired` gate is true — green with the elapsed
    time on success, red with the probe's `reason` on failure. A dedicated `try`/`catch`, separate
    from the socket-alive check beside it: a probe failure must never suppress that already-useful
    row, and vice versa.
  - `dz parity`'s Self-learning cell now gates on `probeApplyLeg(cwd).ok`, not
    `applyLegStatus(cwd).installed` alone — `computeParity` itself is untouched (FR-5 of the earlier
    feature). A structurally-installed-but-silent leg reads `◐ … installed but silent: <reason>`,
    never `✓ full`; the SAME `reason` `dz doctor`'s row prints, so the two instruments cannot
    disagree about WHY a leg is dead, matching the fix-round-1 discipline `applyLegReasonMessage`
    already established for `stale-version`/`unreadable`.
  - `probeHookLiveness` (`operations.ts`) gained optional `cwd`/`env`/`timeoutMs` overrides (additive
    — every pre-existing 2-arg call site, the Codex veto-hook liveness checks, is unaffected) and now
    also returns `stdout` alongside `status`/`stderr`, reused by `probeApplyLeg` via a dynamic
    `import()` rather than duplicating a `child_process` surface in `apply-leg.ts` (the core-boundary
    IO ratchet stayed at its pinned `files:63 imports:69` — no new top-level IO import anywhere).
  - `timeoutMs` defaults to 8000 ms. Measured (this environment, 2026-09-14/15): a
    `store-not-found`/`socket-absent` probe returns in well under 200 ms; a live-daemon probe answers
    in ~100-200 ms (matching ADR-001's own estimate) once warm. `dz doctor`/`dz parity` are
    measurably slower by one probe's worth of wall time when the leg is wired — named here, not
    hidden.
- **A limit, named plainly.** Under HEAVY concurrent load (this repo's own ~2700-test suite run in
  one process), a live probe against a just-spawned daemon can occasionally exceed the hook's own
  hardcoded 800 ms client-side socket timeout even when the daemon itself answers — a CPU-contention
  flake, not a correctness defect; the daemon's own `HOOK_RECALL_BUDGET_MS` is independently
  widenable, and `probeApplyLeg`'s `env` option exists for exactly this in tests. A real single
  `dz doctor`/`dz parity` invocation never contends with 100+ concurrent test files.
- **Every probe beacon now carries an owner and a TTL (feature `apply-leg-daemon-hygiene`, FR-3).**
  The pre-probe scavenger used to delete EVERY `apply-leg-probe`-domain record unconditionally,
  which was safe against a probe killed mid-flight but WRONG the moment two probes from two
  different sessions run against the same store concurrently — the second probe's scavenge could
  delete the first probe's still-in-flight beacon, producing a false-red `dz doctor`/`dz parity`
  parity check with no real defect behind it. Each beacon now embeds `probe-owner=<pid>:<startedMs>`
  in its own text (no schema change), and `scavengeStaleProbeBeacons` (exported) removes ONLY a
  beacon whose owner is dead (`process.kill(pid, 0)` ⇒ ESRCH) or older than 60 s — a live, in-budget
  beacon from a different concurrent probe is left untouched. A scavenge failure is now a named fact
  (`ApplyLegProbeResult.scavengeError`), never a swallowed exception.

## Run a plan without the Claude host

`runWorkflow` (`workflow-run.ts`) is the PURE scheduler behind `dz workflow run`: it INTERPRETS a
`loop-plan/1` plan instead of executing a rendered script, dispatching each step through
`workflow-run-dispatch.ts` (`codex exec`, or an isolated `claude -p`) over a single injected child
seam. Every one of its 24 failure reasons has a named producer, so the taxonomy is reachable in
tests without a child process. `loop-run-semantics.ts` is the single blob SOURCE for the gate / join
/ failure constants, which is what makes "imported, not copied" true by construction.

**How far the cross-host equivalence claim reaches (MEASURED 2026-08-20).** `dz workflow run` writes
`trace.jsonl` from the `dz` process itself on BOTH families — instrument-written. The rendered
script under the Claude host cannot (the sandbox has no filesystem), so there the trace is appended
by an AGENT the script asks to run the flush command — agent-attested. The host's own records cannot
close the gap: `journal.jsonl` carries `type` / `key` / `agentId` / `result` and neither `seq` nor
`ts`; the per-agent transcripts carry `timestamp` and `uuid`/`parentUuid` and can order AGENTS, but a
join, a gate redo and a typed pause are steps of the loop, not agents, and appear nowhere. So the
equivalence proved by the committed `pkg-audit-1` fixture covers a bounded fanout, an all-activated
join, a dep chain and a gate — and NOT the gate redo route, the typed terminal route, the typed
pause or the file deliverable.

## Live publish success requires a registry receipt

On the live `publishPackages` path, `status: 'published'` means the registry returned the exact new
`name@version`, not merely that the `pnpm publish` subprocess exited zero. The publisher uses
90 probes × 10 s (15 min); measured registry visibility lag was 3 to >5 min on 2026-09-10. It
reports `registryProbes` on confirmation and restores
the package bump if no receipt arrives. Dry-run and bump-only do not make a publication and never run
this receipt probe; their existing statuses retain their preview/staging meaning. Registry probes run
`npm view … --prefer-online`, because the publisher itself warms the packument cache before publishing
(measured 2026-09-10: 30 misses on a landed package; the cache diagnosis itself comes from the npm
cacache index read afterwards, not from a network trace). Known limit: an `offline` or `prefer-offline`
setting in any `.npmrc` wins over `--prefer-online` (npm checks those first), so such an environment
still probes a stale cache.

Every live receipt attempt is retained in the package result as `probeLog`; an exhausted probe cycle
keeps the same complete log on its `error` result, including captured stdout/stderr, exit code, and
elapsed milliseconds. Within one publish batch, a package whose workspace dependency already ended in
`error` is held before its version bump or any network action; the dependent result names the failed
dependency and carries its reason.

## The publish gate asks whether anyone but the author read the code

`DEFAULT_RULES` gained `review-round` (HARD, publish): a package that bumps its version AND changes
source must bring a GRADED `features/*/08_qe_report.md` in the same change. Pure over injected facts
like every rule — `{packages: [{name, versionBumped, sourceChanged}], grades: [{report, grade}],
minGrade?, gathered?}`. A grade must BE a letter, not merely start with one. `gathered: false` means
the caller TRIED and could not read the change: that produces a NOTE, never a violation, because
absence of a report is an accusation and absence of facts is ignorance.

## The vector tier reports what the RUN did, not what the config allows

Four changes, each replacing a statement derived from configuration with one derived from the run:

- **`mergeHybridHits` keeps the top lexical hit under emphasis.** With `RRF_K = 60` and
  `semanticWeight = 2`, a lexical hit at rank `r` loses to every semantic hit at rank `s ≤ 61 + 2r`,
  and the semantic list is capped at `limit·2` — so `--semantic` did not emphasise the semantic leg,
  it REPLACED the lexical one, and exact matches on rare identifiers vanished. The lexical top-1 now
  keeps a reserved seat (taken from the weakest non-`both` place, never from a hit both legs found),
  and ties break by evidence rather than by the id alphabet.
- **Recall's ordering contract is score DESC → evidence → `dzId` ASC everywhere, via one exported
  `compareHybridHits`** (`feature recall-parity-tie-break`) — `mergeHybridHits`, `dampQuarantined`,
  and `enhance()`'s reinforcement/bandit re-rank (via `orderHitsForReRank`, its pre-sort) all share
  it, and the comparator is total even for `NaN`/±Infinity keys (a `NaN` sorts deterministically
  last, never a coincidental tie). The daemon's own `recall-hit` exposure write stays
  fire-and-forget — awaiting it cost +55–131 ms per recall against a 500 ms hook budget without
  fully closing the race anyway; parity between the daemon and `dz recall` is instead proven with a
  byte-level store snapshot taken before the comparison, so no write can reach the read it's
  compared against.
- **`HybridRecall` carries `semanticCandidates` and `semanticRanked`** — what the engine returned and
  what actually entered the merge, so a caller can tell "the tier is empty" from "the tier returned
  only stale ids", which need different fixes.
- **`VectorTierStatus` counts like with like.** `mirrored` covers exactly the scope
  `lexicalMirrorable` covers; `mirroredOther` names vectors of other dz-owned task types (backlog
  ideas); `orphaned` is a pattern-scope vector with no record — which nothing computed before. The
  single old number counted three task types while being printed beside a one-task-type count.
- **`unmirrored` is mirror DEBT as a set difference.** `pending: 0` used to stand alone for "no
  debt", though it means "no queue was ever opened". The difference is over ids and accepts EITHER
  key a record can be mirrored under, because the teach and backfill seams write different ones.

A count that cannot be computed is reported as `undefined` — never as `0`.

## The operator profile module (`profile.ts`)

WHO is being talked to, as data: register (`pro | pro-lite | plain`), dialogue language, deep
domains (full pro, no scaffolding) and weak domains (one plain sentence every time), stored per
USER at `~/.dz/profile.json` — written `0600`, never inside a project, because a project `.dz/`
gets committed and personal data there would leak by construction. Delivery is a marked block in
`~/.claude/CLAUDE.md` (`renderProfileBlock` + `mergeProfileBlock`): foreign content survives
byte-for-byte, every modifying write leaves a timestamped backup, and a malformed marker state is
REFUSED with a named kind rather than guessed at. `checkProfileDrift` says whether the block still
matches the store.

Contracts the exports actually keep (each with its proving test in `test/profile.test.ts`):

- **`validateProfile` is TOTAL.** It is the boundary every no-throw caller (`readProfile`,
  `writeProfile`, `syncProfileBlock`) relies on, so it may never leak a throw: a shape check that
  itself throws (`JSON.stringify(2n)` is a TypeError) becomes a refusal verdict, and the catch
  path formats the thrown value under its own try with a fixed fallback — conversion hooks run on
  the THROWN value, so a hostile getter throwing `Object.create(null)` must not blow up the catch
  either.
- **No profile field may contain a block marker literal.** A marker smuggled into a value poisons
  every later sync (the first writes it INSIDE the generated block, the next reads it as legacy
  nested state and refuses). Refused at the one validation seam all write paths cross — `set`,
  `--json`, init, and a hand-edited store file; `updatedAt` included, because an unparseable one
  is rendered into the block heading.
- **`syncProfileBlock` revalidates its input.** It is a public write path; a consumer calling it
  directly with a poisoned in-memory profile skips `writeProfile` entirely. Invalid → verdict, no
  write, no backup.

## Contract checklist API

`contract-checklist.ts` is the dependency-free policy behind retrospective feature-contract checks.
It performs no filesystem, process, network, clock, locale, or model I/O. Callers supply artifact
bytes and an injected evidence reader:

```ts
import {
  checkConfirmationFiles,
  extractContractChecklist,
  renderContractChecklist,
  parseContractVerdictReport,
  verifyContractVerdicts,
} from '@dzhechkov/harness-core';
```

- `extractContractChecklist(source)` reads `## Acceptance criteria` or `## Критерии приёмки` with
  `AC-N: ...` rows and one `## Confirmation…`-prefixed pair from each canonical direct ADR Markdown file. It
  emits ordered `contract-checklist/1` items with contiguous `CC-N` ids or no partial contract. Empty ADR input
  remains an `adr-input-empty` refusal unless the caller explicitly supplies `adrsOptional: true`; even then, a
  combined contract with no acceptance criteria remains a `contract-empty` refusal.
- `checkConfirmationFiles(adrTexts, exists)` is the pure half of the single mandatory Step-8 ADR
  gate: every parsed Confirmation test path must resolve to a readable regular file. Missing paths
  fail; parse/read errors are refused; a feature with no ADR returns the explicit `no-adr` skip.
- `renderContractChecklist(checklist)` serializes one deterministic fenced `contract-checklist`
  block for a future producer integration.
- `parseContractVerdictReport(text)` accepts one `## Contract checklist` fenced JSON object with
  schema `contract-checklist-verdict/1`, rejects duplicate JSON members and closed-schema drift, and
  requires payload `overallGrade` to equal the human Grade.
- `verifyContractVerdicts(checklist, report, evidenceReader)` requires exact ordered coverage,
  repository-relative artifact syntax, one exact quote occurrence, verdict/outcome polarity, and
  rejects grade A/B when any item is `unmet`.

This is a structural assurance boundary. It proves grammar, identity completeness, evidence
containment/uniqueness, polarity, and grade coherence. It does not judge whether a quote semantically
proves a criterion, execute a cited test, replace ADR Confirmation, or replace independent QE.
The remaining 13-point ADR fitness checklist, discrimination check, and mutation check stay advisory;
the Confirmation file-existence/readability check alone forces a non-passing Step-8 verdict.

## Feature tier API

`feature-tier.ts` is the dependency-free boundary for reading a feature tier from its complexity
assessment. `parseFeatureTier(text)` recognizes the measured English `Tier` and Russian `Тир`
Markdown forms and returns `S`, `M`, `L`, `XL`, or `null` when no unambiguous tier is established.
`readFeatureTier(read, slug)` requests
`features/<slug>/00_complexity_assessment.md` through the caller-supplied reader and delegates to the
same parser; filesystem access therefore remains in the adapter that owns it.

## Restart advisor API

`restart-advisor.ts` is the pure policy behind the manual `dz restart-advisor` command. It accepts
JSONL bytes and an explicit threshold/round count; it performs no filesystem, process, environment,
clock, network, or model I/O. The public value exports are:

```ts
import {
  parseCheckpointQeHistory,
  parseTrainingPairQeHistory,
  decideRestartRecommendation,
  adviseRestart,
  renderRestartDecisionLog,
} from '@dzhechkov/harness-core';
```

The versioned `restart-advisor/1` result returns one of `RESTART_CODE_STAGE`,
`NO_RESTART_RECOMMENDATION`, `NOT_ESTABLISHED`, or `INVALID_INPUT`. Only the adjacent trailing
streak counts. The checkpoint and training-pair histories are never unioned: when both carry QE
rounds they must normalize to the same identities and grades, or advice is not established. A
firing result is still data only: `autoAction` is always `false`, and
`renderRestartDecisionLog` exposes the effective policy, evidence, source, and reason without
persisting anything or restarting a stage.

## Volume shadow observations

Publish guard evaluation accepts an optional `GuardFacts.volume` input and emits four additive,
versioned `volume-shadow/v1` observations: `template-context-token-weight`,
`template-context-largest-file-share`, `feature-artifact-diff-ratio`, and
`feature-tier-artifact-set`. The template total reports standing rules/commands separately from
conditional full-skill bodies; their sum is a configured/invokable context envelope, not measured
per-session consumption. Feature ratios retain numerator, git base/head, feature-path exclusion,
and the `git-unified-diff-bytes/v1` proxy method.

The measured 2026-08-30 ranges are dated starting points, not norms. Missing, incomplete, escaped,
ambiguous, capped, and zero-denominator evidence becomes a typed `unknown` observation. Every volume
rule is forced SOFT even under hostile HARD configuration, and observations do not participate in
the verdict reducer. Source comments, comment density, and prose classification are outside this
decision domain: justification is neither scored nor offered as a trimming target.

## Reads from a read-only-mounted store (ADR-001, `store-readonly-reads`)

`dz recall`, `dz recall --books`, and `dz brain query`/`dz brain ground` read the pattern store
(`patterns.sqlite`) and the book KB (`books.sqlite`) through `@dzhechkov/memory`'s
`openSqliteReadOnly` ladder rather than the writer's `SqliteBackend.open`/`openDb`. Observable
consequences: these commands now work when their store's directory is mounted read-only (e.g. a
sandboxed runtime) — falling back to a temporary copy when the file cannot be opened in place —
and, on the common case (a writable directory), the read no longer runs `CREATE TABLE`/FTS-rebuild
DDL on every invocation. `recallPatterns`/`loadStorePatternsSync` keep their existing
graceful-empty contract on any open failure (they fall through to the JSON store); `dz recall
--books` keeps its throw-vs-`{error}` distinction (an unreadable store still exits non-zero naming
the cause — see `books-recall-honesty` coverage in `book-kb.ts`). A residual (`readonly-residuals`):
the post-open `busy_timeout` pragma on both readonly wrappers now goes through
`applyReadonlyPragmas`, which closes the connection and cleans up a tmp-copy before rethrowing if
the pragma itself throws, instead of leaking both on that failure; and `recallPatterns`/
`loadStorePatternsSync` distinguish "native `better-sqlite3` unavailable" (silent JSON fallback,
unchanged) from "the store file itself is unreadable" (corrupt file, permission failure), printing
one `dz: <path> unreadable (<cause>) — falling back to the JSON store` line on stderr per process in
the second case, so a broken store no longer looks like plain "fewer lessons".

## Embedder cache (`agentdb-index.ts` — `resolveAgentdbEmbedder`)

`resolveAgentdbEmbedder(projectRoot, dbPath?)` builds the `@huggingface/transformers` pipeline
**directly** — MEASURED 2026-09-14 at 2-3.6s per call
(`features/agentdb-embedder-cache/00_complexity_assessment.md`), because the model+dim+dtype for a
project never changes within one process. Feature `embed-daemon-memory` (ADR-001 D1) moved this off
agentdb's own `EmbeddingService` class: the same `pipeline(text, { pooling: 'mean', normalize: true })`
call `EmbeddingService.embed` makes internally, called straight from core, so a process building
BOTH the write path (`indexPatternsToAgentdb`) and the read path (`searchAgentdbPatterns`) — or the
embed daemon, when it can reach this same cache (see below) — stands up **one** pipeline instance,
not one per code path. Cached at module scope, keyed by `${agentdbDir}|${model}|${dim}|${dtype}` (so
a `DZ_EMBED_MODEL`/`.dz/config.json` change — a different `resolveEmbedModel` result, or a different
dtype — gets its own entry rather than reusing a stale pipeline):

- Repeat calls for the same key return the **same object**, not a re-initialized one — MEASURED
  2026-09-14 (`test/agentdb-embedder-cache.test.ts`, live model): cold call `2117ms`, warm call
  `1ms` (budget: ≤50ms).
- The **promise** is cached, not the awaited result, so concurrent first callers for the same key
  join one in-flight initialization instead of racing two pipelines (`getAgentdbEmbedderCacheStats()`
  reports `initializations: 1` for two parallel first calls).
- An `{error}` outcome (or a rejection) evicts its own cache entry immediately, so a failed init
  never "sticks" — the next call retries against the current config.
- `resetAgentdbEmbedderCache()` clears the cache and the `initializations` counter; it exists for
  tests and future warm-start use only — `vector-tier.ts`/`backlog.ts` call sites are unaffected.
- `getAgentdbEmbedderCacheStats()` returns `{ entries, initializations }` (`entries` = currently
  cached successful pipelines, `initializations` = pipelines actually started since the last reset).
- **COMPAT FALLBACK** (dtype `fp32` only): when `@huggingface/transformers`/`@xenova/transformers`
  cannot be resolved directly from the project (nor via `agentdb`'s own declared dependency), this
  falls back to agentdb's `EmbeddingService` — the pre-T2 behaviour — so a project whose only route
  to an embedder is through agentdb's own installed copy still works. A requested `dtype: 'q8'` never
  takes this fallback (NFR-4): a quantized store with no reachable transformers install is a hard
  `{error}` naming the model/dtype, never a silent fp32 downgrade.

### dtype: `fp32` vs `q8` (`memory.embed.dtype`, ADR-001 D2)

A single fp32 instance of the default model (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) costs
~1.2 GB RSS once warm (816 MB immediately, ~1219 MB 1-2s after the first embed — a second, native
weight read inside `onnxruntime`, library behaviour, not something this package controls). The
quantized `q8` variant (`{ dtype: 'q8' }` at pipeline construction, needs `model_quantized.onnx` in
the transformers cache) costs ~0.55 GB — roughly half — at a MEASURED (2026-09-16, 14-lesson RU/EN
fixture, `features/embed-daemon-memory/07_code_changes/measure-q8-parity.mjs`) cosine parity of
min=0.9900/mean=0.9929 against fp32 for the SAME text, and top-1 query agreement 5/5.

- `memory.embed.dtype` in `.dz/config.json` (`'fp32'` default, `'q8'` opt-in) selects the dtype for a
  **new** index or a `dz vector reindex` — it does **not** retroactively change an existing store.
- The **store's manifest** (`<dbFile>.embed-manifest.json`) records the dtype it was actually built
  with; every query is embedded with the **manifest's** dtype (`resolveStoreEmbedDtype`), never
  blindly with the configured one — a manifest with no `dtype` field (every store written before
  this feature) reads as `fp32`, so existing stores are unaffected.
- `guardEmbedSpace` now checks dtype the same way it already checks model/dim: a store built at one
  dtype and configured for the other is refused with `embedding dtype mismatch: index built with
  <m>, configured <c>; run <reindexHint>` — never a silent mixed-dtype read (store fp32, query q8),
  which the ADR names as the concrete risk a default flip would have created.
- Switching a store to `q8` is exactly `dz vector reindex` after setting `memory.embed.dtype: 'q8'`
  — the ONLY point the dtype actually changes; an ordinary incremental index always embeds new rows
  in the store's EXISTING dtype, never the config's, so two partial writes can never leave one store
  split across two embedding spaces.
- `q8` needs `model_quantized.onnx` already in the transformers cache — a fresh install with no
  cached weights would need network access on first use; confirm the file is present under the
  transformers cache dir (or that the machine has network access) before flipping `memory.embed.dtype`
  to `q8` and running `dz vector reindex`.

## Consistent pre-reindex snapshot + rollback (`agentdb-snapshot.ts`)

The pre-reindex snapshot `reindexAgentdbRows` takes before every reindex used to be a bare
`copyFileSync(dbFile, backupPath)` — one file, no `-wal` sidecar. A WAL-mode sqlite database can
hold committed rows in `-wal` that never reached the main file (autocheckpoint disabled, or simply
a writer connection still open between commits), so copying only the main file silently drops them
— the "undo point" a rollback relies on could already be missing exactly the rows a rollback is
meant to restore. MEASURED (scratch repro, 2026-09-13, real `better-sqlite3`): a schema + one row
checkpointed, then a second row inserted on a connection kept open (`wal_autocheckpoint = 0`) —
`copyFileSync` alone produces a backup with 1 row; `VACUUM INTO` on a fresh read-only connection to
the SAME live db produces 2.

- `snapshotSqliteDatabase(Database, dbFile, backupPath, opts?)` — default strategy: opens `dbFile`
  READ-ONLY and runs `VACUUM INTO '<backupPath>'` (the path is escaped as a single-quoted sqlite
  string literal). One output file, every committed transaction including `-wal` frames, and the
  live database is untouched — MEASURED: the main file's hash and the `-wal` file's size are
  identical before and after the call. On any failure (older sqlite without `VACUUM INTO`, a
  locked/foreign file, no free disk) — or when `opts.strategy: 'copy+wal'` forces it — falls back to
  `copyFileSync(dbFile, backupPath)` plus a copy of `dbFile-wal` to `backupPath-wal` when the WAL
  sibling exists and is non-empty. The outcome always names how it actually happened:
  `{ method: 'vacuum-into' | 'copy+wal' | 'copy', note?: string }` — `note` carries the fallback
  reason, so a caller/report never claims a stronger guarantee than it got. **Refuses an existing,
  non-empty `backupPath` before any write** (fix round AM-4, Codex review Grade C) — throws
  `snapshot target exists and is non-empty: <path>` rather than silently clobbering whatever the
  path already held; the target is left byte-identical. Also clears any `backupPath-wal`/`-shm`
  sidecar BEFORE either strategy writes anything, and again right after a successful `VACUUM INTO`
  (AM-1) — a leftover sidecar from an earlier, unrelated snapshot family reusing the same path must
  never sit next to (and later be mistaken for part of) a fresh snapshot. The `-wal` size probe now
  calls `statSync` directly and treats only a confirmed `ENOENT` as "no WAL, method: copy" (AM-2) —
  any other stat error (`EACCES`, `EIO`, a raced deletion) aborts the whole snapshot with a thrown
  exception instead of silently degrading to a weaker, falsely-honest-looking `copy`.
- `restoreSqliteSnapshot(dbFile, backupPath, method)` — the paired rollback. `method` is the EXACT
  `SnapshotMethod` the paired `snapshotSqliteDatabase` call returned (AM-1, fix round) — never
  re-derived from whether `backupPath-wal` happens to exist on disk, which a stale sidecar from an
  unrelated earlier snapshot at the same path could satisfy and cause the wrong generation of `-wal`
  to be restored. Copies `backupPath` over `dbFile`; when `method === 'copy+wal'`, also restores
  `backupPath-wal` to `dbFile-wal` — otherwise (`'vacuum-into'` or `'copy'`) removes any LIVE
  `dbFile-wal` instead. MEASURED: skipping that removal leaves a reopened "restored" db replaying
  the stale WAL's frames (a since-superseded write) on top of the reverted main file — rows come
  back EMPTY instead of the restored set. `dbFile-shm` is always removed (its offsets are only valid
  for the `-wal` that no longer matches). **The caller must close its write connection to `dbFile`
  before calling this** — it is a plain file copy, not a sqlite-mediated rollback, and a live handle
  can reintroduce exactly the frames being undone. Returns `{ ok: true }` or `{ ok: false, error }`
  (AM-3, fix round) — a failing restore (e.g. the destination path unwritable) is reported, never
  silently swallowed as if the rollback had succeeded.

`reindexAgentdbRows` wires both in: sqlite now resolves (`require.resolve('better-sqlite3')` +
dynamic `import`) BEFORE any snapshot is attempted, so an unavailable dependency aborts with
`DEPS_MISSING` and no new `pre-reindex-*` file on disk (previously a snapshot could be taken and
then immediately discarded by a deps-missing error — a mixed-signal failure). `opts.backupPath`,
when given, must resolve INSIDE `dirname(dbFile)` (AM-5, fix round — checked via `resolve` +
`relative`, so neither a `..`-escaping relative path nor a foreign absolute path can steer the
snapshot outside the db's own directory); violating it aborts with no snapshot attempted at all. The
result gains `snapshotMethod?` / `snapshotNote?`, named whenever a snapshot ran (including when a
LATER best-effort step, like copying the sibling embed-manifest, fails) — "absence of a receipt is
not success". On a reindex failure, the result also gains `rollback: 'restored' | 'failed'` and
`rollbackError?` (AM-3, fix round) — `rollback()` now closes over `restoreSqliteSnapshot`'s
`{ ok, error }` outcome instead of a bare `copyFileSync` it used to fire-and-forget, and a failed
restore is folded into the top-level `error` string as `"<reindex error>; rollback failed: <why>"`
rather than reported as if the rollback had quietly succeeded. `rollback()` only ever runs after
every write connection this function opened has already been closed (the DELETE's own
`finally { db.close() }`, and `indexPatternsToAgentdb`'s own). Test:
`opts.snapshotStrategy?: 'vacuum-into' | 'copy+wal'` forces the fallback path for deterministic
coverage of `method: 'copy+wal'` without needing an actually-broken sqlite.

## Pre-reindex snapshot rotation (`agentdb-snapshot-rotation.ts`)

`reindexAgentdbRows` (`agentdb-index.ts`) copies the store to `<db>.pre-reindex-<ms>.bak` (+
`.embed-manifest.json`/`-shm`/`-wal` siblings) before every reindex, as an undo point — and nothing
had ever pruned them: 13 snapshots / 50 MB observed on the owner's own hub. `agentdb-snapshot-rotation.ts`
is the fix, split PURE/effect (NFR-2):

- `listPreReindexSnapshots(dbFile)` — reads the directory next to `dbFile`, groups matches of the
  STRICT regex `^<basename>\.pre-reindex-(\d+)\.bak(\.embed-manifest\.json|-shm|-wal)?$` into
  families by their `<ms>` timestamp. Nothing else in the directory is a candidate — `agentdb.db.bak`
  and `other.pre-reindex-1.bak` next to `agentdb.db` are left alone. Symlinks are never followed and
  never rotated (`lstatSync`, never `stat`): a matching NAME that resolves to a symlink is excluded
  entirely, not "rotated by its link size". An orphaned sibling with no `.bak` (e.g. a lone `-shm`)
  still forms its own one-file family under its own `<ms>`.
- `planSnapshotRotation(families, { keep, protectMs, now, graceMs })` — pure decision, zero fs: the
  newest `keep` families survive; the family just created by THIS call (`protectMs`) is rescued even
  beyond `keep` and even at `keep=0` — the boundary case named by the requirement — but is NOT
  double-counted when it already falls inside the top-`keep` slice (the ordinary case, since a fresh
  backup is normally the newest family already). **Grace period (fix-round AM-3):** ANY family
  younger than `graceMs` (default 10 minutes; `ms > now - graceMs`) is rescued too, even past `keep`
  — a snapshot from a DIFFERENT process/run than the one calling this must never look "old" just
  because nobody named it via `protectMs`. There is no CLI flag to shorten or disable it; `now`/
  `graceMs` exist only so tests can be deterministic.
- `rotatePreReindexSnapshots(dbFile, { keep = 3, protectPath })` — the fs-effect wrapper: list, plan,
  `unlinkSync` each file of every removed family. Three fix-round hardenings, all closing a real
  Codex-review Grade-D finding:
  - **`keep` is validated before anything is read or deleted** (AM-1): `Number.isSafeInteger(keep)
    && keep >= 0`, else the call returns `{ kept: [], removed: [], errors: ['invalid keep: …'] }` and
    touches nothing. The bug this closes: `Math.max(0, NaN)` is `NaN`, and `sorted.slice(0, NaN)` is
    `[]` — an EMPTY kept slice, so a `NaN`/negative `keep` used to delete every existing family.
  - **A scan error blocks deletion, not just gets logged** (AM-4): a `readdirSync`/`lstatSync`
    failure other than ENOENT lands in `report.scanErrors: string[]` and this call removes NOTHING —
    an incomplete candidate list can never be safely read as "these are all the old ones".
  - **Within a family, siblings unlink first and `.bak` last, and only if every sibling
    succeeded** (AM-2): a failed sibling unlink leaves the `.bak` — the one file that alone still
    proves the snapshot existed — in place, and names the family's `<ms>` in
    `report.partialFamilies: number[]`, rather than guessing the family is gone.
  - A per-file failure still lands in `report.errors[]` and never stops the rest of the rotation or
    the caller's own success — "no receipt is not success", so every removed file is named, never
    just counted.
  - An absurd `<ms>` in a matching filename (not a safe non-negative integer, or beyond `Date`'s
    representable `±8.64e15`) is never grouped into a candidate family (AM-5) — it never reaches
    `new Date(ms)`, which throws `RangeError` past that bound.

`reindexAgentdbRows` calls this automatically on its SUCCESS path only (`opts.keepSnapshots ?? 3`),
adding a `snapshots?: SnapshotRotationReport` field to its result; an `error` return never rotates
anything (old snapshots may be the only working copy left at that moment). `reindexBrainVectors`
(`brain.ts`) forwards the same field verbatim, so `dz brain reindex` reports it too.

For rotation WITHOUT running a reindex — the owner's hub forbids a live reindex there today, and
had 13 unrotated snapshots regardless — see `dz brain snapshots [--keep N] [--prune]` in the CLI
README.

## Snapshot lock + reindex-in-progress marker (`agentdb-reindex-marker.ts`)

**Recovery-required marker (lead edit after Codex re-review, 2026-09-13).** When a reindex fails AND its rollback
fails too, the marker is rewritten (owner token, atomic tmp+rename) with `requiresRecovery: true`. Such a marker never
expires: rotation keeps protecting its family and prints a note, and every new reindex of that store is refused with
`recovery required: … restore <snapshot> manually, then remove marker <path>`. Every marker mutation (create, stale
replacement, clear, recovery flag) runs under the same `agentdb-snapshot` lock, so compare-and-delete cannot
interleave with another owner. A snapshot that throws inside the locked section clears its own marker before the
error propagates.

Snapshot creation (`reindexAgentdbRows`), rotation (`rotatePreReindexSnapshots`) and restore
(`restoreSqliteSnapshot` via rollback) are three writers of ONE directory — before this feature they
had NO mutual exclusion, and only the 10-minute grace period above stood between a concurrent
`rotate --keep 0` and the very snapshot family a live reindex was relying on as its undo point.

- `withAgentdbSnapshotLock(dbFile, fn, opts?)` — a thin, `dbFile`-addressed wrapper over
  `withNamedLockSync`: the lock lives at `<dirname(dbFile)>/.dz/locks/agentdb-snapshot.lock`, a pure
  function of the database's OWN directory, never of `process.cwd()` — a project store and the home
  brain each get their own lock. All three snapshot writers now run their file operations
  (`VACUUM INTO`/copy, unlink, restore) under this lock; a `NamedLockTimeoutError` propagates as an
  explicit `error` (`reindexAgentdbRows`: `"snapshot lock busy: …"`, no snapshot, no db change;
  `rotatePreReindexSnapshots`: `{ removed: [], errors: ['lock busy: …'] }`) — never a silent skip.
  The critical section stays SHORT and SYNCHRONOUS by design: re-embedding (the network/CPU-bound
  part of a reindex) runs OUTSIDE the lock, exactly as the store-lock/named-lock lesson requires.
- **The lock is never acquired twice in one call stack** (NFR-2): `rotatePreReindexSnapshotsUnlocked`
  is the pure fs-effect primitive with no lock of its own; the PUBLIC `rotatePreReindexSnapshots`
  wraps it in one lock acquisition, and `reindexAgentdbRows`'s own success-path rotation wraps it in
  its OWN separate acquisition — never through the public wrapper, which would try to take the same
  named lock a second time while the first was still logically "in flight" for this call.
- `writeReindexMarker(dbFile, { ms, pid, startedAt, backupPath? })` / `clearReindexMarker(dbFile,
  token)` — a `<dbFile>.reindex-inprogress.json` marker written at the start of `reindexAgentdbRows`,
  INSIDE the same locked critical section as the snapshot itself (never before the lock is even
  attempted, so a busy lock leaves the directory byte-identical — no snapshot AND no marker). Removed
  in `finally` on every path EXCEPT one (below). `ms` is recomputed from the actual `backupPath`'s
  filename, not from whatever internal counter built the default one — a non-standard `backupPath`
  (no `.pre-reindex-<n>.bak` suffix) names no family, so the marker carries `ms: null` plus the
  literal `backupPath` for an operator to identify it by.
- **Marker OWNERSHIP (fix-round, 2026-09-13).** `writeReindexMarker` creates the file EXCLUSIVELY
  (`openSync(path, 'wx')`) and stamps it with a random 16-hex-char `token`. A LIVE marker already at
  that path — a genuinely concurrent reindex of the SAME store — refuses the call outright:
  `{ ok: false, error: 'reindex already in progress (marker <path>)' }`, with NO snapshot ever taken
  for the refused attempt (nothing was deleted, so there is nothing to roll back). A marker at or past
  the TTL is replaced. `clearReindexMarker` is compare-and-delete: it removes the marker ONLY when the
  caller's `token` matches the one on disk — a process can never tear down a marker it does not own —
  returning `{ cleared: false, reason }` otherwise (an absent marker is treated as an idempotent
  `{ cleared: true }`).
- **A rollback that cannot re-take the lock leaves the marker in place (fix-round, 2026-09-13).** If
  the forward reindex fails and needs to roll back, and the rollback's OWN lock re-acquisition times
  out, the marker is deliberately NOT cleared — its family may be the only intact copy of the
  pre-reindex state, and clearing the marker would let a concurrent `dz brain snapshots --prune`
  delete it out from under an operator who has not yet acted. The returned `error` names BOTH paths
  explicitly (`"…; snapshot at <backupPath> was not confirmed restored; marker at <path> is left in
  place — requires manual recovery"`), and `rollback: 'failed'` / `rollbackError` surface the
  underlying reason (typically `lock busy: …`). Recovery is manual: inspect the snapshot at the named
  path, restore it by hand if needed, then remove the marker file directly.
- `readLiveReindexMarkers(dbFile, now?)` — a marker younger than `REINDEX_MARKER_TTL_MS` (60 min)
  rescues its `ms` from rotation, even at `keep=0` and `graceMs=0` (a `ms: null` marker protects
  nothing — there is no family to protect); a marker at or past the TTL is abandoned — removal is
  attempted and the outcome is reported HONESTLY in the rotation report's `notes: string[]` field:
  `"… ignored and removed"` only once the removal actually succeeded, `"… ignored, removal failed:
  <err>"` when it did not (fix-round, 2026-09-13 — the previous wording always said "removed" even
  when the underlying `rmSync` failed). **`pid` is recorded for operator debugging only and is NEVER
  consulted for liveness** — the same "pid is not authority" lesson `store-lock.ts`/`named-lock.ts`
  already encode for lock staleness; a marker with an obviously-dead `pid` and a fresh `startedAt` is
  still treated as live.
- **Stale threshold: 5 minutes (fix-round, 2026-09-13).** `withAgentdbSnapshotLock` defaults
  `staleMs` to `AGENTDB_SNAPSHOT_LOCK_STALE_MS` (300 000 ms) rather than named-lock's ordinary 30s
  default — MEASURED: `VACUUM INTO` on an 8.45 MB agentdb store took 96 ms, so 5 minutes leaves
  roughly 3000x headroom while staying inside named-lock's own 600 000 ms environment-override
  ceiling. **A database whose snapshot genuinely takes longer than 5 minutes needs external
  coordination** (a bigger default is not the fix); a caller doing something unusual may still pass
  its own `staleMs`.
- **`rotatePreReindexSnapshotsUnlocked` is package-internal only (fix-round, 2026-09-13).** It is no
  longer exported from this package's public barrel — the public rotation API is
  `rotatePreReindexSnapshots`, which always takes the snapshot lock. Exporting the unlocked primitive
  would hand outside callers a way to rotate with no mutual exclusion at all.

## Findings ledger + machine-readable QE verdict (`qe-findings.ts`, ADR-001 `qe-findings-record`)

`readQeGrade` (`score.ts`) used to read only PROSE — a report fixed after a `Grade: C` round-1
review, ending `Grade: B`, read back as `ambiguous`, and a report whose only "Grade" mention was a
stray round-1 line read as a confidently-WRONG `unique C` even when its final verdict was `B`
(MEASURED, `00_complexity_assessment.md`: 41 of 100 feature reports came back ambiguous; `dz score`
returned `C` for a report whose stated outcome was `B`). This feature adds ONE machine-readable
surface on top of the prose, never replacing it:

- **A verdict line**: `QE-VERDICT: <A|A-|A+|B|B+|B-|C|C+|C-|D>` (`QE_VERDICT_RE`, `qe-findings.ts`).
  `readQeGrade` checks it FIRST: exactly one → `{status:'unique', source:'verdict-line'}`; more than
  one → `{status:'ambiguous', source:'verdict-line'}` (never "last wins", even when both name the
  same grade — two lines is a fact about the report); zero → the pre-existing prose scan runs
  exactly as before, tagged `source:'prose'` (or `'none'`). `GradeReading` gained the `source` field;
  every prior caller of `readQeGrade`/`extractQeGrade` is unaffected (NFR-1).
- **A Findings ledger table** under the exact header `QE_FINDINGS_HEADER` = `| Finding | Severity |
  Status | Round | Author | Title |`. `parseQeFindings(md)` returns `{status:'absent'}` when no such
  table exists (406 pre-existing reports; the common case, and the ONLY case for anything written
  before this feature), or `{status:'present', hollow, rows, refused, summary}`. Three closed
  dictionaries — Severity `BLOCKER|CRITICAL|HIGH|MEDIUM|LOW|INFO`, Status
  `confirmed|fixed|partial|refuted|named-limit|open`, Author `codex|claude|lead` — plus Round (an
  integer ≥ 1) and a whitespace-free Finding id. **A row outside any dictionary is REFUSED
  (`{line, text, reason}`), never coerced to the nearest known value** — coercion would make the
  resulting severity/status tally unprovable (ADR-001 D2). **A second table is refused WHOLE**, its
  header the anchor, reason `duplicate table` — its rows are never parsed individually. **A
  header-only table is `hollow: true`** — worse than no table at all (ADR-001 D3, the same principle
  `readMutationEvidence`'s `present-unproven` already applies to the mutation-gate table).
- `qe-findings.ts` is PURE (no `node:fs`) — file reads stay in the CLI, guarded by the same
  `core-boundary.ts` IO ratchet every other core module answers to.
- `scoreRun` (`score.ts`) now returns `gradeSource` and `findings` (a lighter `{status, hollow?,
  summary?, refused?}` projection of `parseQeFindings`'s full result) — both ADDITIVE, the same
  optional-field discipline `mutationEvidence` already uses. `renderScorecard`/`renderFindingsLine`
  print a one-line findings summary (`findings: 3 HIGH / 2 MEDIUM; 1 refused (line 84: severity
  "Major" not in dictionary)`) only when a table exists — the common case (no table) stays silent.
- `dz feature-adr-record --kind ledger --stage full` enriches the row with `findings`/`gradeSource`
  computed by this parser over the row's own `features/<slug>/08_qe_report.md` (fill-only-null,
  best-effort — a missing/unreadable report never blocks the write). See the CLI README for the
  producer-side prompt wiring (Step 8's `QE-VERDICT:` + table instruction) and the six September
  reports hand-marked from their own prose as the real-corpus proof (`qe-findings-corpus.test.ts`).

## Task identity (`round.ts` + `run-records.ts`, experiment-instrument ADR-001)

A prospective audit found no task identifier joining ledger rows, review signoffs, control rows and
training pairs across the whole pipeline — three writers each minting (or not minting) their own idea
of "what this run was about". This feature mints `taskId` in exactly ONE place and propagates it
fill-only-null everywhere else, never guessing.

- **`openRound` mints it.** A new optional `RoundState.taskId`/`RoundLedgerRow.taskId` field: `--task
  <id>` (validated — non-empty, ≤120 chars, no control characters, else `{ok:false, exit:2}`), or the
  default `<slug>@<startedAt>`. `closeRound` copies it into every row; a state predating this feature
  carries no `taskId` key on disk, so `closeRound` derives the SAME default and marks
  `taskIdSource:'derived-legacy'` on the row (never on a fresh round's row).
- **`closeRound` also carries the ship anchor**, entirely as CLI-supplied data (the core never shells
  out — `git rev-parse` lives in the cli): `shipSha: string | null` and an optional `shipShaReason`,
  present only for a FINISHED outcome (`shipped|refuted`), alongside `shippedAt` (= this row's own
  `closedAt`). A finished row with a null sha ALWAYS carries a non-empty `shipShaReason` (`'not
  provided'` when the caller gave none). Because `HEAD` does not identify a dirty working tree, the
  same row also carries `shipTreeDirty: boolean` (resolved by the cli from `git status --porcelain`)
  or, when unresolved, a non-empty `shipTreeDirtyReason` (`'not provided'` default) — one of the two is
  always present on a finished row; a dirty tree is recorded, never refused. `blocked|abandoned`
  carries none of these, even when a sha is passed in.
- **`readOpenRoundTaskId(states, slug)`** is the single pure lookup every OTHER writer in the pipeline
  consults: `{taskId, source}` where `source` is `'open-round'` (exactly one match — `taskId` is its
  own), `'derived-legacy'` (exactly one match whose state predates this feature — the default is
  derived, and the label says so), `'no-open-round'` (zero matches — `taskId: null`), `'ambiguous'`
  (two or more, or a readable state next to an unreadable one — `taskId: null`, never "the latest
  wins") or `'unavailable'` (only unreadable matching state files — an unreadable round is never read
  as absence). It does not touch a filesystem; the caller (the cli, walking `.dz/rounds/<slug>-*.json`)
  hands in the already-read states plus the count it could not parse.
- **`applyTaskId(row, lookup)`** (`run-records.ts`) fills a ledger/training-pair payload's `taskId`
  from that lookup, fill-only-null: a payload that already names a non-empty `taskId` is left alone
  UNLESS it disagrees with `lookup.taskId`, in which case the disagreement is recorded as
  `taskIdConflict: {payload, round}` (the payload's own value still wins — never silently overwritten).
  A payload with no `taskId` is filled, including the honest `null` case (`taskIdSource` names why) —
  absence with a reason beats silent absence.
- **`decideRecordWrite` also judges AUTO-ROW COMPLETENESS.** For `kind:'ledger'` with `auto:true`:
  `minutes` is fill-only-null from a payload `wallSec` (`minutes = round(wallSec/60, 1)`,
  `minutesSource:'wallSec'`); a row that ends up with neither a real `minutes` nor a resolvable
  `tokens` (no number, no `tokensSource`) is written `complete:false` with `incompleteReasons`
  (`['minutes']`, `['tokens']`, or both) — new optional `strict?: boolean` turns that into a refusal
  (`exit 2`, nothing written) instead. A manual (non-`auto`) row gains none of these three keys, ever.

All new fields are additive, appended after every existing key (NFR-1) — every pre-existing test of
`round.ts`/`run-records.ts` keeps passing unmodified except the handful of exact key-order/exact-value
assertions that the new fields legitimately extend (documented in the feature's own change manifest).

## Reviewer price on the round ledger row (`review-cost.ts`, ADR-001 `review-cost-ledger`)

Cross-family review cost sat un-tracked: the qe-bridge reviewer's own price (Claude CLI's
`total_cost_usd`/`usage.*`/`duration_ms` on the last line of its raw stdout) was measured 40/40 for
every recent signoff, but nothing in `harness-core` read it, and a finished (`shipped|refuted`) round
could close with no reviewer named at all — unmeasurable by definition.

- **`parseQeBridgeStdoutCost(text)`** (new module `review-cost.ts`, exported from `index.ts`) is a
  pure parser over the reviewer's raw stdout TEXT (this module owns no filesystem access — NFR-2). It
  reads the LAST non-empty line and returns `{status:'ok', costUsd, tokens:{input, output,
  cacheCreation, cacheRead, total, tokensPartial?}, durationMs, numTurns}` for a usable JSON cost
  object, `{status:'absent', reason?}` when there is no non-empty line at all, or
  `{status:'unparseable', reason}` for anything else (not JSON, not an object, a missing/negative/NaN
  `total_cost_usd`) — a price is NEVER guessed from an absence, and a missing usage component becomes
  `0` with `tokensPartial:true` rather than silently blending with a genuine zero.
- **`closeRound` gains `reviewSidecar.cost?: QeBridgeCost`** and, on the row, `reviewerCostUsd`,
  `reviewerTokens` (sum of the four components — `null` when the sidecar's own sum was only partial,
  see below), `reviewerTokensBreakdown:{input, output, cacheCreation, cacheRead, partial?}`,
  `reviewerCostSource:'qe-bridge-stdout'|'unavailable'` and (only when `'unavailable'`)
  `reviewerCostReason` — additive, appended after every existing key (NFR-1; a round closed with no
  sidecar is byte-identical to before this feature).
- **Reviewer identity is TIED to the sidecar (ADR-001 п.2, amended by fix-round-1 after Codex r1's
  BLOCKER/CRITICAL pair) in exactly two cases**: (a) `reviewer` is FILLED from the sidecar (no explicit
  `--reviewer`), or (b) an explicit `--reviewer` AGREES with the sidecar's own `gradedBy`
  (case-insensitive `family:model` equality, or a family-only flag like `claude` matching the sidecar's
  family) — `reviewSource:'flag+qe-bridge'` names that second case. This exists because the pipeline's
  normal path ALWAYS passes `--reviewer` (`.claude/workflows/feature-adr.js`); under the pre-fix-round-1
  rule ("an explicit reviewer never trusts the sidecar for cost, ever") the price this feature exists
  to record was never written on that path. A `--reviewer` that DISAGREES with a real sidecar `gradedBy`
  is refused outright, `exit 2`, naming both values — the same discipline `--grade` already follows
  against a disagreeing sidecar grade — never a silent win and never a silent price omission. The price
  itself is written ONLY in the two tied cases above; a sidecar that is NOT tied to the row's reviewer
  (an empty `gradedBy` — the CLI's Codex-no-signoff synthesis, below) can still explain a NAMED limit,
  but an `'ok'`-status price on an untied sidecar is NEVER attributed, whatever the number.
- **A finished review now REQUIRES a reviewer.** `closeRound` refuses `exit 2` (reason names
  `--reviewer`) for `outcome ∈ {shipped, refuted}` with neither an explicit `--reviewer` nor one filled
  from the sidecar — a row with no reviewer named is not auditable. `blocked|abandoned` carry no such
  requirement, same as they carry no grade requirement.
- **A partial token sum never reads as an exact zero.** When the sidecar's own `tokens.tokensPartial`
  is `true` (at least one usage component was missing from the source JSON), `reviewerTokens` is `null`
  and `reviewerTokensBreakdown.partial` is `true` — the price stays valid, only the aggregate count is
  withheld, so a genuinely partial review is never indistinguishable from a real zero-token one.
- **Every token component is validated as a nonnegative safe integer** (`Number.isSafeInteger`); the
  four-way sum is checked the same way. A component that is fractional, negative, or beyond
  `Number.MAX_SAFE_INTEGER` (adversarial: `1e308`) turns the WHOLE result `unparseable` with a reason
  naming the offending field, rather than silently overflowing into `Infinity` (which used to serialize
  as `null` on the row while the in-memory type still claimed `number`).
- **The cli (`readQeBridgeCostSidecar`, next to `findQeBridgeSignoffForRound`)** reads a found
  signoff's own `rawStdoutFile` (repo-relative, resolved from the project root; an absolute path or one
  escaping the root via `..` is rejected, never read) and parses it best-effort — never throws; any
  failure (removed file, unreadable, unsafe path) becomes `reviewerCostSource:'unavailable'` with a
  named reason, same as an intact-but-unparseable stdout. The path is additionally scoped to THIS
  round's own `features/<slug>/.fa-state/qe-bridge/signoff-<runId>.stdout.txt` — a path that resolves
  inside the repository root but under a DIFFERENT slug's directory, or names a DIFFERENT signoff's
  runId, is rejected before it is opened (never another review's price silently imported), followed by
  an `lstat` check that the resolved file exists and is not a symlink. A Codex reviewer supplied via
  `--reviewer` with NO matching bridge signoff (structural — Codex reviews leave none, so their tokens
  are never visible to this instrument) still gets an honest `reviewerCostSource:'unavailable'` +
  `reviewerCostReason:'no qe-bridge signoff for this round (codex tokens are not visible to the
  instrument)'`, while the reviewer identity itself stays the flag's value.
- **The `/feature-adr` conveyor's own `round close` now passes `--grade` and `--reviewer`.** Measured
  2026-09-17: `roundCloseCmd` in `.claude/workflows/feature-adr.js` (and its packaged twin) omitted
  BOTH since the measurement-integrity feature made `--grade` mandatory — every ultracode-graded run
  closed with `roundClosed:false`. Both flags are now built from the same values the run already
  computed (`roundGrade`, `modelsUsed.qe || qeReviewerUsed`); the wiring test pins the literal
  construction and reproduces the regression as a RED/GREEN mutation (removing either flag on one twin
  fails the pin).

## Status

`next` — staged, not yet versioned or published. Feature `measurement-integrity` (ADR-001, tier M): five
measurement holes in the SDD pipeline get an explicit status instead of a convenient number. **D1/D2** land in
`cost-ledger.ts` and the new `feature-adr-stage-canon.ts` (see the module table above) — canonical stage
taxonomy + `INCOMPLETE_INVENTORY`/`orphanTranscripts`. **D3** is the new `codex-rollouts.ts` (module table
above) — a pure Codex rollout-log reader. **D3/D4** land in `run-records.ts`: `decideRecordWrite` gains an
OPT-IN `enrich?: LedgerEnrichInput` (`{rollouts?, window?, cwd?, prices?}`) — a ledger row with a codex-family
`coder`/`reviewer` and `tokens: null`, given a time window, is enriched via `matchCodexRollouts`:
`status:'one'` fills `tokens`/`minutes`/`tokensSource:'codex-rollout'`/`rolloutId`; `'none'`/`'ambiguous'`
stamp `tokensSource:'codex-rollout:'+status` with NO number (NFR-3 — never a guess); no `window` at all
stamps `tokensSource:'unavailable'` rather than attempting nothing silently. Independently, ANY ledger row
given a `prices` table gets a `prices: {snapshotAt, table: {model: {prompt, completion, cachedInput}},
unknown?: [model,…]}` snapshot for every model it names (`coder`/`reviewer`/`envelope.chosen.stages`) — a
longest-prefix match against the CALLER'S OWN table (never `cost-scoring.ts`'s live constant), so a future
repricing never rewrites a historical row (ADR-001 D4). Omitting `enrich` entirely is byte-identical to
before this feature. **D5** lands in `round.ts`: `closeRound` gains `grade?`/`reviewSidecar?
(RoundReviewSidecar: {gradedBy, elapsedMs, grade?})`. `grade` is now MANDATORY for `outcome ∈
{shipped,refuted}` (refusal exit 2, `'grade required for a finished review'`) and a warned-and-DROPPED no-op
for `blocked|abandoned` (the close still succeeds; `result.warnings` names why nothing was written).
`RoundLedgerRow.grade` is `string | null` (was always `null`). When `--reviewer` is absent, `reviewer` /
`reviewMinutes` (`elapsedMs / 60000`, 1 decimal) / `reviewSource:'qe-bridge'` are filled from the sidecar; a
`--grade` that disagrees with the sidecar's OWN grade is refused naming both. The CLI (`dz round close
--grade`) reads the sidecar from `features/<slug>/.fa-state/qe-bridge/signoff-*.json`, latest by `emittedAt`
— `round.ts` itself opens no file. `dz feature-adr-record --kind ledger` grows `--window-from/--window-to`
+ `--codex-sessions <dir>` (default `~/.codex/sessions`) to drive the FR-5 enrichment; every ledger write
always carries the FR-6 price snapshot.

`plan-inherits-requirements`: the pure halves of the
feature-adr plan-repair round now live here and are body-pinned against the workflow's inline copies by the
drift guard — `shellQuote` (POSIX single-quote escaping), `planBackupCmd` / `planRestoreCmd` /
`planArchiveBackupCmd` (backup before the ONE repair round, proven restore on rejection, archive into
`.fa-state/` on acceptance), `planSnapshotCmd` (byte length, POSIX `cksum`, the `EXPECTED_CODE_TARGETS` lines
and the task-heading lines), `snapshotBlock` / `snapshotNumber` (whole-line markers, first start to last end —
a plan line spelling a marker lands inside its block) and `parsePlanSnapshot` (null = the probe never completed;
the caller rejects on null, never reads it as "nothing to compare"). `planCompletenessGateCmd` gained
`opts.requireRequirements`, which emits `--require-requirements` so the K2 gate's new C8 (every id declared in
`01_requirements.md` is referenced by the plan) fails per id instead of warning with a count.
Also in this staged release (feature `coder-reads-and-recall`): the decision-recall kind union gained
`'code-implementation'` (stage `step-7`, bandit context `feature-adr-decision-code-implementation`) so the
Step-7 coder receives the same ≤3-lesson recall block the Step-6 planner already gets, bundled into the code
stage's checkpoint composite exactly like `planComposite` — a resumed stage restores the recalled prompt for
the training-pair capture instead of re-spending recall. Measured motive: after the by-name input directive,
Claude coders opened `01_requirements.md` in 5 of 7 runs (39 % before), while 37 of 48 post-directive coders
were Codex, whose file reads are invisible to the transcript instrument.

`0.8.37` — this release (night 16→17.09). Five changes live in this package, each through the full pipeline with a
cross-family Codex review: **qe-findings** — every Step-8 report now carries one machine-readable `QE-VERDICT:` line
and a `## Findings ledger` table in a closed vocabulary (`parseQeFindings`, `readQeGrade` with its source; masks for
fenced code, blockquotes incl. CommonMark lazy continuation, HTML comments/blockquotes; a near-miss table is refused
loudly, never read as absent); **cross-family-control** — `diffFamilyFindings`/`aggregateByFamily` for `dz
control-review`: two independent reviews over one tree, automatic pairs are CANDIDATES (maximum-cardinality
matching), confirmed overlap only by adjudication, incomplete rows excluded from measured figures;
**measurement-integrity** — canonical stages, `INCOMPLETE_INVENTORY`, per-turn Codex rollout deltas, price
snapshots, `round close --grade` mandatory for shipped/refuted; **experiment-envelope** — every automatic ledger row
carries `envelope.{taskKind,priority,arms,chosen,evaluator}` (verified live: 1 of 1 new auto rows); **qe-bridge** —
the reviewer prompt demands ONE grade letter with no +/− suffix (a live `B-` was refused as no-grade-marker).

`0.8.36` — (night 15→16.09). Three changes live in this package: `recallHybrid` orders equal-scoring
hits through ONE comparator (score desc → evidence rank → `dzId` asc, NaN last), so the embed daemon and
`dz recall` agree; the apply-leg test helpers prove a daemon stop by OBSERVING `/proc` until nothing serves the
root and gate every SIGKILL on a freshly-read identity plus containment under the test root (three-valued —
"could not read" is never "does not match"), while the probe beacon carries its own owner, raw start ticks and
expiry; and both generated Codex hooks resolve the project root through one `resolveHookRoot`, with
`reportRootProvenance` naming the source and start directory on stderr, silent on the success path and with
control characters escaped. The environment override originally planned for the hooks was dropped after a live
measurement showed the payload's `cwd` present and correct in all six captures (3 scenarios × 2 hook events,
codex-cli 0.154.0).

`dz guard check --op publish` now warns when either release line disagrees with the core/CLI package versions, and a registry-confirmed live core or CLI publish synchronizes the first such line in both release READMEs: each README is rewritten atomically; the pair is not one transaction (dry-run and bump-only never write them).

`0.8.12` — **staged, not published.** The `/feature-adr` phase panel + per-phase ledger telemetry,
with the four cross-family review findings of the feature's first landing closed with proof: a
monotone step guard on the write path, the `fa-phase-slot` named lock around the whole slot
transition (plus a refusal REASON the CLI can print), and `kind`-carrying ledger rows made invisible
to every cost reader (`planLedgerBackfill`, `selectLedgerRows`, `assembleTimeline`). See the phase
telemetry paragraph above. Seven named guards in this package are `DEFENDED` under `dz mutation-gate`.

`0.8.28` — **registry probe budget 90 × 10 s (15 min)** after the measured visibility lag. MEASURED on this release: the registry confirmed core at probe 32 (~5.3 min) — the previous 30-probe budget would have rolled the bump back a third time.

`0.8.27` — **every registry probe is on the record** (`probeLog`: code, stderr, ms — in the report and in `--json`), and a batch never publishes a dependent after its dependency failed. MEASURED on this release: the registry answered `E404 No match found for version 0.8.27` for 18 probes (~3 min) before confirming — a registry-side visibility lag, not a client cache; `0.8.26`'s `--prefer-online` was therefore not the fix.

`0.8.25` — **`published` means the registry answered, not the child exit code** (30 probes × 10 s, never on `--dry-run`/`--bump-only`); `dz runs-clean` (plan by default, `--apply` removes only merged + clean + older than retention, a dirty worktree is never removed by any flag) and `dz runs --settle` / the `stalled` state; `contract-check` reads the feature tier (an S feature without `03_adr` is established, not "unreadable"); `dz teach` with an exact re-teach reinforces instead of duplicating.

`0.8.24` — **the run verdict, the routing table, the panel and the registry all stopped overstating
what they know.** `classifyRunFailure` gains the kind `runner-infrastructure` with the closed reason
`worker-rpc-timeout`: it is claimed only when the parsed failing-test count is exactly zero AND the
runner's own worker-RPC pattern is present, so a nonzero exit with no explanation stays
`unrecognised` rather than being guessed at — and the new kind is narrowed back to `unrecognised` at
`discrimination-gate`'s intake by one commented line, because that gate has no policy for it and its
behaviour must not change. `budgetTable`'s Codex half is now PER-STAGE (premium for ADR and
architecture, flagship for direct work, workhorse for evidence gathering), with `CODEX_TIERS.premium
= gpt-6-astra` and an optional `RoutingEnv.complexityTier` whose absence means S/M rather than
switching the matrix off. `countLearningStoreRowsReadonly` reports the mirror as TWO figures:
`vectorRows` stays the whole mirror because the store guard reads it as an integrity signal against
a recorded high-water mark, while the new `vectorLessonRows` is the lesson-only count the panel
compares with the lexical tier. `statuslineData` gains `patternMirror` (absent on parity AND when
there is no mirror at all; `unavailable` only when a mirror EXISTS and cannot be read or decomposed)
and `brainKuCounts`. Registry entries may declare `uncoverable: true` with a mandatory `reason`:
such an entry becomes `COVERAGE_GAP`, is counted separately, carries a `⚠` marker distinct from a
failure's `✗`, and — by owner decision — does not fail the aggregate verdict, while `ENTRY_INVALID`
still does.

Unreleased — adds the pure `course-staleness` classifier. Missing provenance is explicitly
`E2 UNSTAMPED` and is tested not to equal `S0 SHIPPED`; version ordering uses the existing semver
comparator while all registry and filesystem I/O remains outside the classifier.

`0.8.15` — **staged, not published.** `amendment-trace.ts` now keeps the `CP-` prefix in the
amendment id: `AM-CP-N` and `AM-N` are DISTINCT ids, so a challenge-panel row appended by the
feature-adr workflow can no longer collide with the ideation's `AM-N`. Until this release the prefix
was matched by a non-capturing group and thrown away at id construction, and the subject guard —
which exists because comparing ids alone let a plan swap one change for another under the same id —
fired on plans whose subject WAS carried verbatim. MEASURED TWICE on 2026-09-05, on two independent
worktrees: the authors of `run-registry-liveness` and `core-boundary-guard` each re-numbered or
refused the `AM-CP-N` form to get past the instrument. K2 (`check-plan-completeness.mjs`) has always
kept the whole token and REQUIRES those rows inside `## Amendments`, so the pipeline's own gate was
forcing rows into the position this module misread — two tools, one text, two contracts. The
`amendmentSubject` furniture stripper learned the prefix too, so a CP row's subject is its text
rather than its own id. **JSON surface (`dz amendment-check --json`):** no field is renamed, but a
consumer that keyed on `AM-\d+` will now see the id VALUE `AM-CP-<n>` where a colliding `AM-<n>`
used to appear. Backlog `a7d0aece023774a0`; the prefix-drop mutant is registered as
`amendment-trace-cp-prefix-is-identity` and reported PROVEN with 7 failing tests under
`dz mutation-gate --only amendment-trace-cp-prefix-is-identity --test-cmd "npx vitest run
test/amendment-trace.test.ts test/amendment-grammar-agreement.test.ts test/score.test.ts"`. The
registry-wide `testCommand` reports the SAME failing count and answers INCONCLUSIVE on a loaded
machine for this entry AND for an untouched control entry, both for the same reason —
`test/eta.test.ts` times out at 5 s in the re-baseline — so that verdict is a property of the
runner, not of this protection. The Russian challenge-panel placeholder `названный кодером при реализации — заменить на имя реального теста` is classified as a placeholder rather than as a missing file name.

**QE fix round (same `0.8.15`, cross-family review 2026-09-06).** The release note above claimed to
end the two-reader disagreement; the review found a THIRD reader with a THIRD contract, and it is
closed here. (1) `score.ts` scanned plans and QE reports with its own `/AM-\d+/g`, which does not
match `AM-CP-1` at all (MEASURED — `'AM-CP-1'.match(/AM-\d+/g)` → `null`), so a plan whose
amendments were all challenge-panel rows scored an EMPTY planned set and the whole
`amendment-confirmation` discipline was skipped with no `absent` and no `partial` — a check that
silently checked nothing. Coverage one line below was `qeText.includes(id)`, so a planned `AM-1` read
as covered by a report that only ever mentions `AM-10` (MEASURED — `'AM-10'.includes('AM-1')` →
`true`). Both are closed by ONE exported reader, `amendmentIdsIn` / `mentionsAmendmentId`, living
beside the row grammar in `amendment-trace.ts` and pinned against K2's token by
`test/amendment-grammar-agreement.test.ts`; narrowing it back is the registered mutant
`amendment-token-cp-prefix-shared-reader` (PROVEN, 4 failing). (2) `decideAmendmentOutcome` now tells
an explicit "None" from a silent grammar failure: a `## Amendments` section that declares
`None`/`нет`/`n/a` and parses zero rows is a **skip** (exit 0, stated reason), where it used to
return NOT-ESTABLISHED (exit 3) on a plan that was complete — MEASURED on this feature's own plan
(backlog `ce2da797e17a7a7f`). The skip is GUARDED: it never fires while an ideation amendment the
plan dropped is outstanding, so an absence can still never silence a real gap. Blast radius over the
363-feature census: exactly 2 features move `not-established` → `skip`
(`amendment-trace-cp-prefix`, `doctor-insight-flow-check`), both plans declaring None in prose. (3)
**Cross-family round 2** found the explicit-None contract half-honoured: the pipeline's own Step-8
module documents the INLINE form `## Amendments: None`
(`.claude/skills/feature-adr/modules/08-qe.md:166`), and there `amendmentSection` ate `: None` as
part of the heading and returned an EMPTY body, so the skip branch never ran and the gate still
answered NOT-ESTABLISHED (exit 3) — MEASURED on the built module: section `""`, `saysNone false`,
exit 3. The declaration is now read from BOTH homes, the section body and the heading suffix, and it
must BE a declaration: a separator (`:` or a dash), then a WHOLE remainder from the closed set
`None`/`N/A`/`нет`, optionally with a full stop. Before that exact comparison, an optional
whitespace-separated CommonMark closing hash sequence is removed as heading furniture. That rule
was chosen from the corpus, not invented — the 363 features carry
`## Amendments (carried verbatim into the plan)` (8×), `## Amendments — conditions before
plan/code`, `## Amendments applied before Step 6`, `## Amendments and confirmation obligations`, and
none of them may read as "none". Registered mutant `amendment-explicit-none-on-the-heading`
(refreshed against the current return path; PROVEN, 5 failing). Census: **zero** features use the inline form today, so the tally is unchanged
at `fail 48 · pass 82 · skip 200 · not-established 33` over 363 — this half of the fix honours a
DOCUMENTED contract rather than moving a live verdict. (7) **Cross-family round 6** replaced the mask
with a BLOCK READER, and the reason is the shape of the previous five rounds rather than any single
defect: `<!--` and `-->` written inside INLINE CODE SPANS in ordinary prose were read as a comment
spanning a real section, so `amendmentSection` returned null and the gate answered skip/exit 0
(MEASURED). Each mask had been born to close the previous one's hole — the signature of reading at
the wrong level. `maskNonRendered` is now one length-preserving block scan implementing CommonMark
§4.5 (fenced code), §4.6 type 2 (`<!-- … -->`, whose START CONDITION is line-start after at most
three spaces — which is what makes a code-spanned delimiter a non-event by construction) and §4.2
(headings matched only in what survives); §6.1 code spans are deliberately not parsed, because no
inline construct may open a block. NOT implemented, so the gap is auditable: indented code blocks,
HTML block types 1 and 3–7, block quotes and list containers, tabs as indentation, link reference
definitions. One deliberate deviation: an UNCLOSED block is reverted rather than run to end of
document, because hiding a real section would turn the gate into exit 0. Also in this round: a
document that opens more than one RENDERED `## Amendments` section at the same depth or shallower is
NOT-ESTABLISHED with a named reason, never a skip — a stale `## Amendments: None` above the real
section used to answer for it. The depth rule is corpus-derived: counting a `###` subsection as a
rival moved `p16-non-js-portability` from an honest `fail` to `not-established`, which is a
regression dressed as caution. Registered mutants `amendment-comment-start-is-a-block-condition` and
`amendment-duplicate-sections-are-not-established` (PROVEN, 1 failing each); fourteen `amendment-*`
entries are 12/12 proven with 0 drops among 12/12 anchored. STILL OPEN and named: K2
(`check-plan-completeness.mjs`) keeps the old any-run-of-three fence closer, so on a `````md` fence
containing a ```` ``` ```` line K2 now FAILS a plan this checker reads correctly — one reader for both
consumers is a feature, not a fix round (six copies, three published packages, standalone
execution). (4) **Cross-family round 3** found the skip
FORGEABLE and one of its spellings unreachable, both in the same reader. A plan may SHOW the form it
is allowed to write, and a fenced `## Amendments: None` above the real section won the raw heading
search: the fence's own body parsed as zero rows and the gate exited 0 WITHOUT LOOKING at the real
section, which carried an unresolvable `AM-1` — the new false pass NFR-3 forbids. Headings, section
boundaries and rows are now found in a length-preserving FENCE MASK and sliced from the original, so
an example illustrates the form and never answers for the document; an UNCLOSED fence is reverted
rather than trusted, because losing an example is cheap and hiding a real section would manufacture
the very skip the mask exists to prevent. In the same reader, JavaScript's `\b` was wrong in BOTH
directions at once: Cyrillic is not `\w`, so `нет` was REJECTED against the contract these READMEs
print, while a hyphen IS a word boundary, so a body opening `none-blocking follow-ups` was ACCEPTED
and exited 0. The current reader is stronger: the whole heading remainder or first paragraph must
match the closed set, so both longer-word and qualified-sentence forms are refused.
Registered mutants `amendment-explicit-none-not-forgeable-by-a-fence` (PROVEN, 2 failing) and
the stable registry id `amendment-none-declaration-unicode-guard` (retargeted from the deleted
constant to the current exact reader; PROVEN, 6 failing). Census after: 363 features,
`fail 48 · pass 82 · skip 200 · not-established 33` — and this time not one feature moved even in
its per-verdict COUNTS, so the masking cost the corpus nothing. (5) **Cross-family round 4** found two defects
in that fence mask itself, both again exit-0 answers over unresolved work. The mask was used for
FINDING and not for READING: row starts were located in the mask while each row's text was sliced
from the original, so a testless `AM-1` followed by a fenced example carrying a complete
`→ test … in …` pointer borrowed that pointer, resolved, and the gate answered **pass** (MEASURED —
`{"ids":["AM-1"],"testIds":[["a_long_enough_test_id"]],"verdicts":["AM-1:resolved"],"outcome":"pass","exit":0}`).
Every semantic read of a row — pointer, file, retraction, subject — now goes through a masked slice
of the SAME length carried on the row itself (`AmendmentRow.scan`, a new required field). And the
mask closed a fence on any run of three or more, while CommonMark §4.5 closes only on a run of the
SAME character at least as long as the opener: a standalone ` ``` ` line inside a ` ```` ` fence
re-opened the document mid-fence and a fenced `## Amendments: None` was selected again (MEASURED —
`{"saysNone":true,"outcome":"skip","exit":0}` with the real section's amendment never parsed). Both
reproducers now answer `fail`, exit 1. Registered mutants
`amendment-row-pointers-read-the-masked-slice`, `amendment-retraction-reads-the-masked-slice` and
`amendment-fence-closer-must-match-the-opener` (PROVEN, 1 failing each); the eight `amendment-*`
entries are 8/8 proven with 0 coverage drops among 8/8 anchored. Census unchanged again: 363
features, `fail 48 · pass 82 · skip 200 · not-established 33`, zero features moved even in their
per-verdict counts. HONEST LIMIT: the subject read shares the fix but has no discriminating test —
a fenced example can only APPEND to a row, and subject comparison is containment-tolerant in both
directions, so no fixture flips a verdict; the read is corrected, not proven. (6) **Cross-family round 5** raised the first two
P1s of this feature. An HTML-commented template — `<!-- … ## Amendments: None … -->` kept above the
real section, as plans legitimately do — was still read as the document's own declaration, so the
gate answered skip/exit 0 with the real section's unresolved `AM-1` never parsed (MEASURED —
`{"ids":[],"saysNone":true,"outcome":"skip","exit":0}`). The mask now blanks fences AND HTML
comments, both length-preserving, fences first; an unclosed comment is left visible for the same
reason an unclosed fence is reverted — masking may lose a comment, never hide a section. Fourth
instance of one class, after the fenced heading, the fenced row and the fenced pointer. Second P1:
round 4 made `AmendmentRow.scan` REQUIRED, which breaks any downstream constructor of a row the
previous release accepted — a legacy row reaching `amendmentsMissingFromPlan` threw
`TypeError: Cannot read properties of undefined (reading 'split')`. The field is **optional** again
and every semantic read goes through a fallback to `raw`, so a hand-built or deserialised row is
read slightly more generously instead of crashing. Registered mutants
`amendment-html-comment-is-not-a-declaration` (PROVEN, 1) and `amendment-row-scan-falls-back-to-raw`
(PROVEN, 3); the ten `amendment-*` entries are 10/10 proven, 0 drops among 10/10 anchored. Census
unchanged again — 363 features, zero moved, counts included — and zero of the 397 plan/ideation
documents on disk hold a commented `## Amendments` heading today, so this too closes a forgery route
rather than moving a live verdict.

**Cross-family rounds 7–8 (same staged `0.8.15`).** The exported declaration predicate now accepts
only a whole first paragraph or heading remainder from the closed set `None`/`N/A`/`нет`, optionally
with a full stop; qualified text such as `None of the required rows has been written yet.` is not an
absence declaration. The companion exported ambiguity predicate scans rendered text below the
section heading: when a declaration exists, zero rows parse, and AM-like content remains, the
decision is NOT-ESTABLISHED rather than skip. Round 8 also removes an optional whitespace-separated
CommonMark closing hash sequence before the exact heading comparison, so
`## Amendments: None ##` is accepted while `## Amendments: None##` remains text. The focused mutation
reproducer for the two refreshed declaration entries plus the closing-hash and ambiguity entries
reported 4/4 PROVEN (5, 6, 1 and 1 failing tests respectively) with no NOT_APPLIED or UNDEFENDED:
`dz mutation-gate --package . --only amendment-explicit-none-on-the-heading,amendment-none-declaration-unicode-guard,amendment-explicit-none-closing-hashes,amendment-explicit-none-ambiguity-fails-closed --test-cmd "npx vitest run test/amendment-trace.test.ts"`.

`0.8.11` — **published 2026-09-02.** Russian catalogue: `stem.ts` word-form normalisation on both sides of
registry search plus a RU topic dictionary with an observable miss in `recommend` (feature
`ru-catalog-discovery`, ADR 001/002, cross-family QE grade B). Honesty instruments: the
`dz discrimination-check` / `dz mutation-gate` seams are fixed — the CLI now passes the package test
script, a root-relative `packageDir` is accepted, and the vitest filter is no longer dropped by a stray
`--` (MEASURED: that ran all 5269 repo tests instead of one file). Also in this version: `dz chain`
(verify every chained journal in one command), `dz score --all` (a chained scorecard aggregate that
says `INSUFFICIENT_DATA` instead of a fake zero), mutation verdicts counted rather than read from
prose, `runnerId` stamped on the run ledger, a closed `RunOutcome` set in the telemetry vocabulary
wired into all five pipeline returns and the cost ledger, the catalogue counting invocable skills
(202 → 249) instead of prefix-named packs, `--select` refusing closed and installing a skill exactly
once, and one Codex invocation path that cannot return silence with a layer-1 guard against the stub
wrapper.

`0.8.10` — published 2026-08-31. Adds the four bounded `volume-shadow/v1` observations and their
immutable SOFT belt; incomplete evidence remains visible as unknown without changing the verdict.

`0.8.9` — never published as-is; shipped inside 0.8.10 (2026-08-31). Adds the pure decision-point micro-recall contract, strict
fail-open transport/receipt reducers, post-hoc numerator/denominator metrics, and mutation-defended
advisory prompt isolation. This is experiment instrumentation, not evidence of local effectiveness.

`0.8.8` — never published as-is; shipped inside 0.8.10 (2026-08-31). Adds evidence-gated `INTEGRATIONS.json` orchestration, one
receipt-qualified Claude project-MCP emitter, explicit refusal outcomes, and the ownership journal.

`0.8.7` — **pure same-tier feature-adr ETA calibration.** `eta.ts` parses timestamped checkpoint
history, refuses any remaining stage with fewer than three distinct runs, folds Codex dispatch to
its next landing witness, applies bounded current-run pace evidence, and returns a typed point/range/
insufficient result with an explicit date window. Filesystem reads remain in harness-cli.

`0.8.5` — **the pure `restart-advisor/1` API for an explicit, advisory-only code-stage
restart recommendation.** The CLI supplies D/2 defaults; core itself refuses absent policy.
Publication and live feature-adr integration remain outside this implementation step.

`0.8.3` — **staged: the pure `contract-checklist/1` extraction and
`contract-checklist-verdict/1` verification API, alongside bilingual advisory `dz lint`.** The
contract module is string/object-in and typed-decision-out; publication remains outside this
implementation step.

`0.8.2` — **the operator profile module, hardened by four cross-family review rounds until round 8
came back clean** (the contract list above IS the round-by-round finding list — echo deferral lives
in the CLI, the two totality fixes and the seam refusals live here). Tests: `test/profile.test.ts`
22/22 (MEASURED — reproducer `npx vitest run test/profile.test.ts`).

`0.7.11` — **the observability pass, and a publisher that stops rewriting history.** Republished so the newest heading matches the version that carries it: `0.7.10` shipped with its own heading reading `0.7.9`, because no changelog entry syncs automatically any more and the author writes that line. Five gaps were measured in this repo's own telemetry and
closed. `CheckpointEntry` gains an optional `ts` and `stampCheckpointLine` applies it at the append —
deliberately OUTSIDE the blob-mirrored serializer, because the sandboxed workflow has no `Date` and a
clock has no business in a function the clockless copy also runs. An absent stamp reads as UNKNOWN,
never zero; a malformed one is dropped, because a wrong instant is worse than an absent one.
**Phase telemetry, and why `planLedgerBackfill` now skips rows (v0.8.12).** `writeFeatureAdrState`
stores a `tier` and a `phaseStartTs` on the slot, and on a step-label CHANGE appends ONE
`{"kind":"phase",…,"wallSec","ts"}` row to the EXISTING `.dz/feature-adr/run-cost-ledger.jsonl`
(never creating one). `renderFeatureAdrPhaseLine` turns the slot alone into the panel's second line.
Three properties are load-bearing and each has a `dz mutation-gate` entry:
- **Monotone.** A plain `Step <n>` label going BACKWARDS against a slot younger than 90 minutes is
  absorbed — counters land, the step and phase clock stand, no phase row. `⛔`/`⏸` labels and a
  stale slot are the two escape hatches for a legitimate regression.
- **Serialized.** The whole read → compare → append → write transaction runs inside
  `withNamedLockSync(root, 'fa-phase-slot', …)`; pattern counting and directory housekeeping stay
  outside it. A lock timeout REFUSES the write. `writeFeatureAdrStateDetailed` returns
  `{state}` or `{refused:'<reason>'}` so a caller can be LOUD about it (`writeFeatureAdrState` is the
  back-compatible façade returning `state | undefined`). `WriteFeatureAdrStateInput._unsafeSkipLock`
  and `._unsafeHoldMs` are **TEST-ONLY seams** for that lock's own RED half — no shipped caller sets
  them, and `statusline-phase-lock.test.ts` asserts neither is spellable from the CLI.
- **Never a cost claim.** `kind`-carrying rows are telemetry. `isNonRunRow` is exported from
  `ledger-backfill` and used by all three cost readers, so one definition covers them:
  `planLedgerBackfill` skips such rows in claimant counting AND in filling (reporting
  `skipped:'non-run-row'`), `selectLedgerRows` no longer pulls them into a run's evidence bundle
  through its slug fallback, and `assembleTimeline` no longer labels them `cost` in a run timeline.
  The last two were MEASURED leaking on 2026-09-06 — running each consumer with and without a phase
  row changed its output — not assumed clean. `cadence` is untouched: it needs a string `date`,
  which a phase row never carries.

`planLedgerBackfill` + `resolveLedgerRunId` let the run-cost ledger fill itself from the host's own
workflow record: a run id is resolved at WRITE time (the only moment it is unambiguous), a slug is
the fallback only when it names exactly ONE run, and a run claimed by more than one row fills
NEITHER — writing the same total into an L/XL feature's `plan` and `full` rows would double-count it
for anyone who sums the column. `runDoctor` reads `.agentic-qe/integrity-log.jsonl`, which had 1508
rows of genuinely instrument-witnessed corruption data and zero readers.

New `telemetry-vocabulary.ts` — zero imports — copies the OpenTelemetry `gen_ai.*` names as string
LITERALS with their own version, because there is no package to depend on
(`@opentelemetry/semantic-conventions-genai` is 404 on npm and 197 of 197 spec documents are marked
`development`). Every field declares its `unit`; the agent-layer names are separated as PROVISIONAL,
where four of six queued upstream breaking changes land. An unknown local name resolves to NOTHING —
a vocabulary that guesses produces a join that is silently wrong.

`scoreRun` gains an `observability-declared` discipline and `observabilityAnswer` behind it: does the
architecture artifact say how anyone would know the feature works? DESCRIPTIVE, never a gate — 107 of
108 existing artifacts predate the requirement. Hardened by cross-family review through nine
findings, six of them in this checker: fenced blocks are stripped, the heading shape is CommonMark,
every matching section is read so a decoy cannot mask a real answer, and an EMPTY section is reported
as `partial` instead of passing as an answer.

`syncReadmeVersion` no longer rewrites CHANGELOG ENTRIES. It kept the README footer in lock-step
with the bump by replacing every occurrence of the outgoing version — including the heading that
documents what that release contained. MEASURED 2026-08-25: four headings in one shipped README had
collapsed onto a single version, and an entry that went out in `0.7.5` was labelled `0.7.6`. Its own
comment claimed historical notes were safe; they were, except for the one release a fresh entry
cites most — the one it supersedes. A backticked version opening a line before a dash is now treated
as an entry and left alone; footers, badges, install examples and pins still move.

**Feature publish-readme-stamp-scope (2026-09-15, fix-round 1 2026-09-15): the sync outside the
changelog region is a real POSITIVE ALLOWLIST — not a denylist, and not a denylist that calls itself
one.** MEASURED 2026-09-15: a live `dz publish --yes` rewrote five historical lines — a second `##
Status` region's own changelog entry (`changelogRegion` protected only the FIRST run, so a `memory`
README's later `0.2.21` entry sat bare) and four prose CITATIONS of the outgoing version as a past
fact (`MEASURED on 0.8.25`, two `Previous release (vA / v0.8.25)` parentheticals, `on 0.8.10 and
0.8.25 alike`). The FIRST fix (same day) replaced that with a denylist of exactly those three phrase
shapes (`isCitationContext`) — narrower than the incident, but still a denylist: any FOURTH prose
shape citing the outgoing version ("since X", "measured against X", "X behaviour", a bare "X" in a
sentence) would have rewritten by default until someone thought to deny it too, and the README
documented it as an "allowlist" while the code rewrote by default — a cross-model review caught both.
`planReadmeVersionSync(text, old, new)` now inverts the default: outside a changelog region, a token
rewrites ONLY when `isAllowlistedRewriteContext` recognises one of six shapes — the lock-step feature
this sync exists for, and nothing beyond it:

1. a release-line token — `` `harness-core vX` · `harness-cli vY` `` and any generalised
   `` `<name> vX` `` on the same line, including a trailing `` · `memory vZ` `` segment
   (`release-line.ts` `isReleaseLineToken`/`GENERIC_RELEASE_TOKEN_RE`, unchanged since the earlier fix).
2. a current-release FOOTER prefix — `Status:`/`Version:`/`Current release:`/`Current status:`/
   `Released as` (case-insensitive, optional leading `**`/`-`), POSITION-aware: only the token
   immediately after the label is allowed, so a footer sentence that also cites an unrelated older
   release later in the same line (`Current release: X. (Previous release (vA / vB) …)`) allows the
   first token and still protects the second.
3. an install/dependency-pin context — the token immediately follows `@` (`npm i
   @dzhechkov/harness-core@X`), or sits in a JSON-pin shape `"<package-name>": "X"`.
4. the `dz publish: tarball <name>@X sha256:…` example line.
5. a `<!-- dz:version -->` marker on the line — forces the rewrite regardless of EVERY other
   protection, including the changelog region (the author's explicit override, AC-3).
6. a shields.io-style badge URL segment — `badge/npm-vX-…` / `badge/version-X-…`.

Every OTHER shape — whatever prose it is written in, today or in the future — is HISTORY by default,
the same as a changelog entry. `syncReadmeVersion` stays a thin, atomic-write wrapper around the
plan, returning exactly what it always returned (the pre-sync text, or `undefined` when nothing
moved) — every existing caller is byte-compatible. The plan itself is never silent, and locates BOTH
sides of its report: `dz publish` prints `readme sync <pkg>: would rewrite N line(s) (L…); M version
token(s) kept as history (L…)` on a dry run and `rewrote N line(s) …` on a live publish — attached on
every publish path (the main live publish, `--bump-only`, and the packed-transport batch), and
`--json` carries the same `readmeSync` summary (`rewrittenLines`, `lines`, `skippedHistorical`,
`historyLines`) per package.

Also: skill-enrichment ownership is anchored at the skill dir rather than searched across the whole
absolute path, and enrichment is excluded from canonical SELECTION as well as from the destination
set — otherwise a `--auto` canonical could propagate one target's metadata into every copy.


`0.7.6` — **skill-drift discovery stops being a `.claude/skills` gate.** `findSkillDirs` is the one
seam behind both the `no-skill-drift` HARD rule and `dz sync-canonical`, and it searched `packages/`
plus a single hardcoded install root. The repo installs into ten targets, five of which emit
`SKILL.md` dirs, so four install trees were ungated — measurably: the Codex install of `feature-adr`
under `.agents/skills` drifted for a day while `--check` reported "all 3 copies match canonical",
and the copy was missing both the K1 section of its `SKILL.md` and the C6 amendment-integrity check
of its K2 script. The new zero-import `skill-install-roots.ts` exports `SKILL_INSTALL_ROOTS` (the
five per-target roots) and `findSkillDirs` seeds `scope:'all'` from it; `scope:'packages'` is
unchanged. Roots stay ANCHORED at the repo root — a recursive `*/skills` search was rejected because
a stale agent worktree holds a full second copy of every tree in the repo. **The guard legitimately
gets STRICTER: a publish that passed before can now be BLOCKED by real drift in a non-`.claude` root
— that is the gate working, not a regression.** A root that is absent or holds no `SKILL.md` is
inert, so listing all five costs a single-target repo nothing.

Two things the first cut got wrong, both caught before landing. The HARD rule gathers its facts at
`scope: 'packages'`, so widening `'all'` never reached it — there is now a third scope `'installs'`
(packages + every install root EXCEPT the dev tree `DEV_SKILL_ROOT`), which is what the rule uses:
`'all'` cannot be a gate because the hand-edited `.claude/skills` legitimately lags, and `'packages'`
is how the Codex install went ungated. And `dz init --enrich` writes per-target metadata INSIDE the
installed skill dir (`agents/openai.yaml` for codex, `hermes-config.yaml` for hermes) — a naive
byte-comparison would call that permanent drift AND the healer would DELETE it, so
`TARGET_ENRICHMENT_ASSETS` is exempt from both. New exports: `SKILL_INSTALL_ROOTS`,
`SKILL_INSTALL_ROOT_BY_TARGET`, `DEV_SKILL_ROOT`, `TARGET_ENRICHMENT_ASSETS`.

`0.7.6` — `tg-post.ts` and `provenance.ts` grow the pure half of the channel sender's fail-closed
autopublish guards. `decideTgSend` gains four inputs (`halted`, `sha256`, `sentLog`, `maxPostsPerDay`)
and judges them in a FIXED order: the stop-cord first (it halts even a perfect post, before any
cheaper check, so no bug in a later gate can route around it), then formatting/provenance/hours as
before, then dedup, then the trailing-24h daily ceiling (default 10). Two properties are load-bearing
and tested: an `undefined` `sentLog` — an UNREADABLE journal — REFUSES, because an unreadable counter
does not prove the ceiling is unreached; and only `status:'sent'` rows count against the ceiling,
while a `'pending'` row still blocks a duplicate. `tgVisibleSha256` keys dedup on the post's VISIBLE
text (markup stripped) rather than its bytes, so two drafts that render identically in Telegram are
one post. `classifySource` adds the `public-url` / `malformed-url` verdicts: a well-formed http(s)
`kind: url` is public by construction and clears, while a `file://`, a bare path or any non-URL is
refused and never inferred from its shape. The pure half reads no files — the CLI passes facts in.

`0.7.5` — a signature-only republish: `0.7.0` went out without the re-signing step, so its published
manifest was stale against its own shipped files. No behaviour changes.

`0.7.0` — the publish gate gained `review-round`, and the vector tier reports what the run did (both above): `mergeHybridHits` keeps the top
lexical hit under `--semantic`, `HybridRecall` gains `semanticCandidates` / `semanticRanked`, and
`VectorTierStatus` gains `mirrorWriterEnabled`, `unmirrored`, `mirroredOther` and `orphaned`.
**`mirrored` CHANGES MEANING** to the pattern scope only — a consumer comparing it against a
full-store count must be updated. `0.6.1` — two new pure modules behind two new commands. `amendment-trace.ts` resolves every `AM-N` and
`AM-CP-N` amendment row (two DISTINCT ids since `0.8.15`: a challenge-panel `AM-CP-1` never collides
with the ideation's `AM-1`) to a test found INSIDE the file the row names — matched against the file's parsed TEST
TITLES, because whole-file matching was forgeable by two comment lines whose letters spell the id, and
because an existing FILE never stands in for an existing TEST. `run-records.ts` decides whether a
run-cost row or a training pair may be written: it refuses bad JSON, a wrong-kind payload, an EMPTY
required field (an empty array or object is not "present"), a stage disagreement and an over-cap line;
it stamps the timestamp BEFORE serialising; and it treats a mark whose target is absent as STALE
rather than as a duplicate, because a run that died between taking the mark and writing must not lose
the record forever. **BEHAVIORAL:** the workflow's ledger and training-pair writers no longer hand a
subagent a pre-baked shell string — a malformed row is refused instead of appended.

**0.6.0** — **BEHAVIORAL:** `STAGE_ARTIFACTS.router` is `'00_complexity_assessment.md'`, was `null`, so a
consumer reading that constant now gets a filename. Step 0 owes a written artifact and its checkpoint
is witnessed by one; MEASURED 2026-08-21, 66 of 199 features carried that file and the last four in a
row did not, which is how a run's tier became unreadable while it was alive and how the K2 acid check
lost its input in silence. New: `ROUTER_CONTRACT_TOKEN` (a pre-contract router checkpoint can no
longer resume into the new contract), `crossFamilyQe` (a QE review that fell back to the coder's own
family reports the loss of independence instead of reading like a deliberate same-family review),
`decideModeBScope`, `partitionReviewFindings` (a finding whose location cannot be parsed is
`unlocatable` and stays in the graded set — it used to be filed as someone else's dirt),
`changeSetProbeCmd` / `parseHashProbe` / `changedFromHashes` (the QE change set is this run's DELTA,
not the tree's current dirt), and `decideCheckpointWrite`. Full detail in [CHANGELOG.md](CHANGELOG.md).

**0.5.4** — published (0.5.3 is deprecated: it was pushed with `npm publish`, which does not expand `workspace:*`, so it cannot be installed). **BEHAVIORAL:** `decideDesignFanResume` takes the design fan's LIVE results, not
the start-of-run checkpoint snapshot, and gained `artifacts` + `postRunListing`; `CKPT_SCHEMA_VERSION`
is `fa-ckpt-3`, so every existing `.fa-state/checkpoints.jsonl` reads as no checkpoint and each
in-flight feature re-runs router+design+plan once. Adds the per-sibling design checkpoint above and
`parseArtifactProbe`. Full detail in [CHANGELOG.md](CHANGELOG.md).

**0.5.1.** **BEHAVIORAL:** `parseTrace` orders events by `seq`, not by file order (§42
`CANNOT_ISOLATE` semantics unchanged from 0.5.0) — a stored verdict computed over a non-sequential
trace is not comparable with one computed here. Adds the plan enactor above, `qe-bridge.ts`
(cross-family QE hand-off with reviewer isolation, 17-reason taxonomy) and `named-lock.ts`
(`withNamedLockSync` for read-modify-write file stores outside the worktree). Full detail in
[CHANGELOG.md](CHANGELOG.md).

**0.4.8.** Adds the Codex hook carrier above, the shared
`mergeManagedHookEntries` extraction, the `runtime`/`runtimes` provenance on recall-usage, and the
granular `hooks-write` / `hooks-shell` / `hooks-prompt` parity capabilities with an evidence gate.

**New in 0.4.7:** the anchored policy emitter/drift detector, reusing the existing AGENTS.md
managed-write path.

**New in 0.4.6** (feature `dz-cli-defects`, slice A): `listSkillsDetailed` /
`describeSkillLoadFailure` / `formatSkillLoadFailures` (skip-and-collect skill listing —
`listSkills` still throws, on purpose) and `resolveTargetName` / `TARGET_ALIASES` /
`formatTargetProblem` / `formatTargetAliasNote` / `TARGET_NAMES_SORTED` (`--target` alias
resolution + did-you-mean). Both additive — no existing export changed shape or behaviour.
`InitReport` / `SyncReport` gained an always-present `failures` array.

**Fix round 1 (still 0.4.6, unpublished).** `SkillApplyFailure` / `formatSkillApplyFailures` and an
always-present `InitReport.applyFailures`: `runInit`'s per-id `try` is now scoped to
`loadSkillFromDir` alone (as ADR-001 decided), so a compile-or-write error is reported under its own
header naming the TARGET, instead of masquerading as an "unparseable `SKILL.md`" against a valid
source file. `normalizeTargetToken` is now exported (the alias-reachability check asks the production
normaliser rather than keeping a copy of the rule). Four `TARGET_ALIASES` rows were deleted as
UNREACHABLE — `claude_code`, `claudecode`, `agentsmd`, `agents.md` all normalise onto a canonical name
and were resolved by precedence step 2 before the table was ever consulted; every one of those inputs
still resolves, so the deletion is observably a no-op.

## Публичный снимок бэклога — `buildPublicSnapshot` / `assertPublicSafe`

Две функции, отдающие наружу агрегаты очереди задач так, чтобы тексты задач не покидали машину.

```ts
import { buildPublicSnapshot, assertPublicSafe } from '@dzhechkov/harness-core';

const built = buildPublicSnapshot(records, '2026-09-03');   // чистая: записи + дата, без файлов и часов
if (!built.ok) throw new Error(`${built.code}: ${built.reason}`);

const verdict = assertPublicSafe(JSON.stringify(built.snapshot));  // независимая застава на выходе
if (!verdict.ok) throw new Error(`${verdict.code}: ${verdict.reason}`);
```

**Порождение, а не фильтрация.** Публичный объект не проверяется после сборки — он собирается
перечислением разрешённых агрегатов, и приватное поле ни разу не читается на пути к выходу.
Проверяющий поверх готового файла ловит то, о чём подумали, и пропускает поле, которое добавят
завтра.

**Застава несёт СВОЮ копию перечня** и не импортирует схему у порождения: иначе одна ошибка
проходила бы обе проверки. Она проверяет БАЙТЫ, а не разобранный объект — измерено, что
`{"receipt":{"text":"…"},"receipt":{…}}` проходит разбор чистым, а наружу уезжают оба ключа.

**Чего в схеме нет намеренно:** максимума, минимума и процентилей. Крайнее значение по определению
принадлежит ровно одной записи, то есть указывает на неё. Вместо них медиана и гистограмма, и порог
малых групп применяется к каждой корзине.

Пять каналов утечки закрыты по итогу трёх проходов кросс-семейного ревью: вложенное поле
разрешённого ключа, пустой объект как чистый снимок, дубликат ключа в байтах, свободная строка в
массиве правил, приватный текст в имени ключа словаря. Каждый воспроизведён прогоном до починки.

## Журнал переходов статуса — `appendTransition` / `readTransitions`

Запись бэклога хранит ровно один переход, последний. Журнал `.dz/backlog/status-log.jsonl` копит
все: строка на переход, дозапись без чтения файла целиком.

```ts
import { appendTransition, readTransitions } from '@dzhechkov/harness-core';
appendTransition(root, { id, from: 'new', to: 'shipped', ts, by: 'backlog ship' });
```

Никогда не бросает: журнал — наблюдение, а не гейт, и его поломка не должна ронять команду, которая
меняла статус. Битая строка при чтении пропускается — файл дозаписывается конкурентно.

## Контракт вывода роя — `checkSwarmBrief` / `SWARM_BRIEF_CONTRACT`

Разбирает бриф роя агентов и отвечает, объявлен ли в нём контракт вывода: куда писать
(`OUTPUT_DIR`), какие единицы работы (`UNITS`) и какая из них сборочная (`ASSEMBLY_UNIT`).
Заведён после инцидента, где рой получил бриф «пришли один отчёт в конце», умер посреди работы,
и восстанавливать оказалось нечего.

Вся ценность модуля в одном свойстве: **вердикт нельзя подделать текстом, который он же и судит.**
Отсюда форма проверок — не «есть ли такие слова», а «объявлено ли это ОДНОЗНАЧНО»:

- объявление внутри забора кода или HTML-комментария не считается объявлением; закрывающий забор
  обязан быть не короче открывающего, а комментарий, пытающийся вложиться, даёт отказ, а не тихое
  открытие после внутреннего `-->`;
- украшенный ключ (жирный, цитата, обратные кавычки) **считается** в счётчик повторов: спрятать
  одно объявление за оформлением и получить тихий выбор другого нельзя — будет отказ по
  неоднозначности;
- перечень единиц никогда не усекается молча. Пустая строка или любая строка-не-пункт, за которой в
  том же блоке ещё есть пункты, — отказ, **называющий эту строку**; так же считается заслонённая
  строка. Причина: `units` — тот самый машинный перечень, с которым потом сверяют каталог, и тихая
  потеря его хвоста делает сверку ложно-успешной;
- строка-не-пункт ПОСЛЕ последнего пункта — нормальное окончание списка, а не нарушение: проверка,
  изобретающая нарушения, хуже отсутствующей;
- `OUTPUT_DIR` проверяется как ПУТЬ: абсолютный, переход вверх, обратная косая, управляющие байты и
  сегменты, не являющиеся именами, отвергаются;
- имя `plan` зарезервировано — его файл есть файл плана, который рой пишет первым;
- длина имени единицы ограничена, число единиц ограничено, проверка дубликатов линейная;
- любое значение из брифа, доходящее до терминала, обезврежено: байт `ESC` не перерисует строку
  отказа в «OK».

Все перечисленные защиты имеют записи в реестре мутаций и доказаны прогоном
(`dz mutation-gate … → 7/7 proven, verdict PASS`).

Честный предел, который печатается вместе с зелёным ответом: проверка удостоверяет, что бриф
ОБЪЯВИЛ контракт, а не что рой ему последует.

## Двухфазная строка стадии — intent до модели, outcome после

Резолвер моделей теперь возвращает не только `StageOpts`, но и **причину**: `resolveStageDecision(stage, env)
→ {opts, spec, reason}`, где `reason` — закрытое перечисление из **двадцати** (20) значений:
восемь веток резолвера, две деградации спецификации и десять причин уровня диспатча, которых чистый
резолвер знать не может. Канонический порядок совпадает с экспортом `STAGE_DECISION_REASONS`:

<!-- stage-decision-reasons:start -->
- `usage-override`
- `explicit-models`
- `routing-not-requested`
- `coder-knob-codex`
- `planner-knob-codex`
- `qe-cross-family`
- `budget-table-cell`
- `default-models`
- `codex-id-substituted`
- `spec-unrecognised`
- `coder-fallback`
- `codex-unsupported-at-dispatch`
- `fallback-after-no-deliverable`
- `precision-second-pass`
- `auto-cost`
- `qe-same-family-degraded`
- `challenge-panel`
- `codex-probe-failed`
- `codex-refused-before-dispatch`
- `fallback-rung`
<!-- stage-decision-reasons:end -->

Причины первых двух групп вычисляются резолвером; причины последней группы описывают выбор текущей
ступени, включая откаты, второй precision-проход, challenge panel и learned-cost. `fallback-rung`
намеренно не пересказывает исход предыдущей ступени: тот уже принадлежит её собственной строке outcome.
В staged workflow общий блок Claude-плана задаёт причину условно на шве dispatch: только
`planIsCodex === true` означает, что перед ним уже была Codex-попытка и потому ставится
`fallback-rung`; при первичном выборе Claude сохраняется исходная причина маршрута.
Отдельно стоит `codex-refused-before-dispatch`: id ответил на пробу, но ступень так и не построила
диспатч (непригодный ref области ревью, небезопасный id, отклонённый exec-план). Ни один агент не
запускался, поэтому следующая ступень — НЕ `fallback-after-no-deliverable`: та причина утверждает, что
ступень отработала и ничего не отдала. Исход ступени трёхзначен (`dispatched` / `probe-failed` /
`refused-before-dispatch`) и остаётся на holder этой конкретной попытки; булев флаг сваливал всякий
не-пробный отказ в ветку «оно запускалось».
Исход принадлежит КОНКРЕТНОМУ вызову, а не модулю: дизайн-стадии идут конкурентно
(`await parallel(designThunks)`), и общая переменная, прочитанная после `await`, содержала бы то,
что записал последний сосед — измерено: стадия, чей собственный диспатч Codex ОТРАБОТАЛ, объявляла
свой откат как `codex-probe-failed`, позаимствовав факт у соседки. Отдельный случай — рантайм не
знает типа агента `codex:codex-rescue`: это тоже отказ ДО запуска, и он докладывается уже имевшейся
причиной `codex-unsupported-at-dispatch`, а не «ступень отработала и ничего не отдала».
`resolveStageDecision` не эмитит ни одну из десяти — это закреплено тестом. `resolveStageModel`
остался тонкой обёрткой с байт-идентичным результатом. Чистые `renderStageIntentLine` и
`renderStageOutcomeLine` проецируются генератором в оба зеркальных скрипта. Единственный шов
`dispatchAgent` печатает `▸ code · opus · budget table cell · intent` непосредственно перед
`agent(...)`, а после окончательного исхода той же попытки — `◆ code · opus · outcome: dispatched`
либо точный отказ/провал пробы. Только outcome добавляется в `dispatchOutcomes`, авторитетный отчёт
«кто-что-делал»; intent остаётся живым предупреждением. Свёрнутые стадии (`research`, `ddd`) отдельных
строк не получают — у них нет отдельного диспатча.


### Run registry

`dz runs --project <repo> [--json]` reads `.dz/runs/registry.jsonl`. The feature-adr workflow
appends `started`, a `heartbeat` at each phase boundary, and `finished` through `dz runs-record`.
Each invocation allocates its own run ID. Pass Workflow `args.runPid` for an explicit host PID,
and `args.parentRunId` when nesting runs; otherwise the writer resolves the Claude ancestor PID
and refuses if it cannot establish one. The courier checks the write response. Registry failures
log `run registry: <event> UNVERIFIED — <reason>` and mark the registry outcome `unverified`;
the workflow continues. Finalization runs on normal returns and exceptions; host termination
can leave a started run without finished.

`live` requires a responding PID. `orphaned` requires a recorded finish or confirmed absent PID;
missing parents, inaccessible PID probes and unreadable registries remain `inconclusive`, with
a reason. A confirmed live PID with a heartbeat older than `--stall-minutes` (default 120)
is `stalled`; a missing heartbeat remains `live`. Stalled parents remain alive for their children. Completed runs display
`finished`; a child of a finished parent is `orphaned`. An unreadable registry exits 1.
Before the first run, an absent registry reports `нет реестра: .dz/runs/registry.jsonl ещё не создан (ни одного прогона)`
and exits 0 (`status: "missing"` in JSON).

The core exports `appendRunEvent`, `readRunRegistry`, `probePid`, `liveness`, `liveParents`, and
`runRecordCommand`. Appends preserve event identity and bound diagnostic `reason` text below
PIPE_BUF with `truncated: true`; oversized identity fields are refused.

### Day-file action journal

`JOURNAL_KINDS`, `formatLine`, `parseLine`, `selectWindow`, and `appendWitnessed` support
`dz journal` over the existing `docs/journal/YYYY-MM-DD.md` files. The first `·` separates
time from category; the last separates the reference, preserving middle dots in event text.
Malformed events retain their raw line and `unparsed` status. The injected `JournalIo` writer
re-reads the appended tail and throws if verification fails. Windows use UTC; a week is seven
calendar days ending on the selected date.


### Run cleanup and settlement

`dz runs --settle` appends `finished` with outcome `died` only for confirmed absent PIDs.
A second invocation reports `nothing to settle`. `inconclusive` is preserved. Use
`dz runs --stall-minutes 150` to change the heartbeat threshold; `stalled` only changes the display.

```bash
dz runs-clean --project /path/to/repo                 # inspect the plan first
dz runs-clean --project /path/to/repo --retention-days 7 --json
# After reviewing the plan, explicitly apply:
dz runs-clean --project /path/to/repo --retention-days 7 --apply
```

Only non-main worktrees merged into `main`, clean, and strictly older than the retention
(default 2 days, measured from their latest commit) qualify. Detached worktrees use their HEAD's
ancestry. Dirty worktrees stay, with the file count and first five paths printed. Unknown merge
or commit-age facts stay; unreadable status refuses cleanup. Removal uses Git without force and
is reported successful only after rereading the worktree list.

With `--apply`, whole finished or confirmed-dead run histories whose newest event exceeds retention
move to `.dz/runs/registry.archive.jsonl`; live and inconclusive runs stay in `registry.jsonl`.
CLI appends, settlement, and archive read/plan/rewrite share the named `run-registry-archive` lock
under `.dz/runs`. Archive writes append before temp-file rename; a crash between those operations
can duplicate archive events on retry. A worktree removal that already succeeded (and was confirmed by
re-listing) is not undone when the archive step fails afterwards: the command exits 1 and the printed lines
name what did happen — `git worktree remove` has no rollback. Direct API writers must coordinate with that same lock.

Core APIs: `settleDeadRuns` and `planRegistryArchive` are pure registry decisions;
`planWorktreeCleanup` accepts injected `WorktreeFact` values and returns remove/keep decisions;
`renderCleanupPlan` renders them. `worktreeRemovalsToApply` selects removals only when apply is true.
No process is terminated and no branch is deleted.
