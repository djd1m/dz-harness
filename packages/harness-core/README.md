# @dzhechkov/harness-core

Shared logic for the DZ harness — the engine behind `@dzhechkov/harness-cli`
and any other consumer.

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
| `skills` | `loadSkillFromDir`, `listSkills`, `listSkillsDetailed`, `describeSkillLoadFailure`, `formatSkillLoadFailures`, `formatSkillApplyFailures`, `discoverSkillIds` | Read skill directories into `CanonicalSkill` objects. **Two listing functions, deliberately:** `listSkills` THROWS on the first unloadable skill and always will — it is a published export, and silently turning it into a skip-and-collect function would downgrade every unknown third-party consumer from fail-closed to fail-silent without their consent (an incomplete catalogue reported as complete); a pinned regression test asserts it still throws. `listSkillsDetailed` is the total variant callers ask for BY NAME: it returns `{skills, failures}` with a per-id `try/catch`, so one unparseable `SKILL.md` never hides the ones after it (order-independence is the tested property — the offender first, middle or last yields the same counts). Every failure is NAMED — `describeSkillLoadFailure` is the single place a pathless parser throw becomes `{id, absolute path, verbatim reason, first line}`, because the parser is handed only TEXT and can never supply a path. `formatSkillLoadFailures` renders that list for stderr in one of two modes chosen by the CALLER (absolute paths for `dz list`/`dz sync`; relative-to-package for `dz install`, where a `node_modules/**` path is not actionable) |
| `apply` | `applyEmitResult` | Write an adapter `EmitResult` to disk — **additively** |
| `targets` | `TARGETS`, `TargetName`, `isTargetName`, `resolveTargetName`, `TARGET_ALIASES`, `TARGET_NAMES_SORTED`, `formatTargetProblem`, `formatTargetAliasNote`, `normalizeTargetToken` | `--target` name → platform adapter, plus the resolution layer in front of it. `isTargetName`/`TARGETS`/`TARGET_NAMES` are UNCHANGED: `boundaries.json` names `isTargetName` as the scanned `--target` validation boundary, and every resolution ends in exactly that guard — the boundary is routed THROUGH, never relocated. `resolveTargetName` is total and pure, with fixed precedence: exact canonical → normalised canonical (case/padding/separators: `Claude_Code`, `claudecode`) → an explicit `TARGET_ALIASES` row → unique normalised prefix → Levenshtein ≤ 3 strictly better than the runner-up → nothing. **Aliases ACCEPT; prefix and Levenshtein only SUGGEST** — an alias row is an owner decision recorded in DATA (adding one is one line and zero control flow), while a fuzzy match is a guess, and installing to the wrong target on a guess is worse than one round-trip. An ambiguous prefix (`co` → `codex`/`copilot`) is terminal with NO suggestion, for the same reason. `formatTargetProblem` renders the two-line refusal, keeping the literal `--target must be one of:` substring that shipped assertions pin |
| `agents-policy` | `POLICY_SOURCES`, `extractPolicyBlocks`, `renderPolicySections`, `detectPolicyDrift`, `measureAgentsMdBudget` | Pure anchored policy extraction, 12-hex source stamps, drift classification and Codex project-doc byte-budget measurement. The stamps prove source/target synchronization only; they do not prove that a runtime read or obeyed the text |
| `sign` | `listPackFiles`, `listSignablePackFiles`, `verifyManifest`, `verifySbomAgainstManifest` | Shared node_modules/.git exclusions; verify sees MORE than sign (smuggled symlinks still fail). After authenticating the Ed25519 manifest, verification derives the canonical CycloneDX document from those signed entries and requires the no-follow `sbom.json` read to match it exactly. Current/v3 signing refuses malformed, duplicate-key, or precision-losing root `package.json` JSON and preserves object order throughout `exports`, `imports`, and `typesVersions`, so condition-order entry-point changes cannot hide behind packer-noise canonicalisation. Readers retain v1/v2 compatibility |
| `guard` | `evaluateGuard`, `resolveRules`, `scanSecrets`, `DEFAULT_RULES`, `parsePnpmLockImporters` | Declarative HARD/SOFT constraint engine behind `dz guard` (publish/teach/consolidate pre-flight; fail-closed). The SOFT `lockfile-in-sync` rule compares each workspace package's `@dzhechkov/*` dep specs against the specifier `pnpm-lock.yaml` records for that importer — the `ERR_PNPM_OUTDATED_LOCKFILE` CI break, caught at publish. Its lockfile reader (`parsePnpmLockImporters`) is a pure RECOGNISE-OR-REFUSE parser (no YAML dependency): it reads only the `lockfileVersion: 9`+ importer layout and returns `undefined` for a legacy v5/v6 file, a truncated one, or any shape that leaves an importer with zero specifiers — because a half-parse reports every real dependency as "not recorded". The rule FAILS OPEN on that `undefined` (no violation) and is pinned SOFT-only via `SOFT_ONLY_RULES`, so no config can turn a parser that admits uncertainty into a publish blocker. The HARD `licence-hold` rule (+ `LICENCE_HOLD_PENDING_MARKER`) is the machine side of a declared licence precondition (`package.json.licenseHold`, ADR-001 hermes-claude-adaptation): silent while the pack stays `private:true` (the npm layer refuses it), it HARD-blocks publish the moment the pack becomes publishable with the hold unsatisfied — LICENSE absent/empty or still carrying the `<!-- PENDING:` grant placeholder, no `Grant-Confirmation: <url>` line, empty THIRD_PARTY_NOTICES, or a non-SPDX license field |
| `slop-lint` | `slopLint`, `parseSlopRegistry`, `validateSlopLintConfig`, `DEFAULT_SLOP_CONFIG`, `BUNDLED_SLOP_REGISTRY_URL` | Pure deterministic EN/RU lexical-density and structural-style analysis behind advisory `dz lint`. It excludes protected Markdown, requires at least two distinct registered marker IDs in one paragraph, divides marker hits by `max(visibleWords, wordFloor)`, and reports bullet walls or registered three-adjective stacks independently. Under the default `4`/`2`/`25` policy, the distinct-ID floor owns paragraphs through 50 words and density is the dilution cap from 51 words onward. The core performs no file, network, clock, locale, or process I/O; policy/config failures are typed diagnostics rather than empty clean results. |
| `backlog` + `backlog-embed` | `dedupIdea`, `classifyDedup`, `dedupPairBand`, `dedupEmbedText`, `lexicalContainment`, `ensureBacklogEmbedForm`, `recordAbsorption`, `alignIdea`, `spinRoulette`, `readGoalMapDetailed`, `parseEffort`, `ensureBacklogGitignored`, `harmonizeBacklog`, `transitionIdeas`, `checkTransition`, `resolveIdPrefix`, `IDEA_TRANSITIONS` | The Smart Backlog engine behind `dz backlog`: status lifecycle via `transitionIdeas` (`ship`/`drop`/`reopen` against the `IDEA_TRANSITIONS` table — unique-short-prefix resolution, idempotent ship/drop no-ops, non-idempotent reopen, all-or-nothing fail-closed batches, line-preserving atomic JSONL rewrite that keeps every non-status byte of untouched records); content-addressed idea records in `.dz/backlog/ideas.jsonl`, semantic dedup over the REUSED agentdb vector namespace (`dz-backlog` — no second store), weighted-max GoalMap alignment, and a seeded weighted roulette. Dedup is TWO-SIGNAL since the register-inflation fix (MEASURED 2026-08-11 on the real 105-idea store: full-length embeds INVERTED the signal on long texts — genuine paraphrases 0.35–0.61 vs topically disjoint long-RU pairs up to 0.9195): `dedupEmbedText` embeds a bounded 400-char excerpt (`backlog-embed.ts`, one form shared by query/mirror/reindex so vectors can never split spaces; `ensureBacklogEmbedForm` re-mirrors v1 stores once, batched), and `dedupPairBand` requires a cosine-threshold DUPLICATE to also share subject vocabulary (`lexicalContainment` ≥ 0.3, else demoted to RELATED with the pair reported — the 0.941 register-only absorption) while promoting a same-idea re-capture at a different length (containment ≥ 0.95, cosine ≥ 0.75) to a subset duplicate; `recordAbsorption` keeps every absorbed text in `absorbed.jsonl` so a wrong verdict is reversible (mutation-defended: `backlog-dedup-demotion-corroboration`, hand-verified 6 red). Every band/weight decision is a PURE function. `classifyDedup` also reports the top-1 match id alongside the cosine (the calibration surface for the 0.92 duplicate band — observational, it never moves the verdict); `readGoalMapDetailed` returns the entries the defensive reader DROPPED with a reason AND the fields it REPAIRED with their raw values (a weight clamped before validation made the validator's out-of-range branch dead code), so `goals --validate` can never report a vacuous "valid (0 goals)" nor hide a `weight: 7`; `parseEffort` returns a printable note for every clamp; `ensureBacklogGitignored` gitignores the store on first write (raw ideas are private prompt-class content) — atomically, preserving the file's dominant EOL, recognising every plain spelling of an existing rule (`/.dz/`, `.dz/**`, …) via `backlogIgnoreStatus`, and obeying a `!` negation as an explicit user opt-out instead of overriding it |
| `no-stubs` | `scanStubs`, `checkNoStubs`, `scannableStubPath`, `STUB_MARKERS`, `STUB_PHRASES`, `STUB_SCAN_EXTENSIONS` | Pure unfinished-stub scanner behind the SOFT `no-stubs` publish rule (backlog 0b403a0106103901, Karpathy-Michaels rule XI): bare markers (`TODO`/`FIXME`/`HACK`/`XXX`/`PLACEHOLDER`) case-SENSITIVE with hard word boundaries (`hackathon`/`todos`/a marker inside a hash never fire; MEASURED: relaxing case doubles this repo's hits and adds only prose) + the `implement later` phrase case-insensitive. SCOPE = the CHANGE-SET (the working-tree `git status --porcelain -uall` diff — `-uall` so a brand-new untracked DIRECTORY is scanned file-by-file instead of collapsing to one invisible `?? newdir/` line; `.gitignore` semantics unchanged), never the whole tree — MEASURED: a tree-wide scan is 32+25 hits of mostly ancient legitimate markers, i.e. noise that gets a gate switched off. Markdown gets PROSE scoping (fenced blocks + backticked spans are QUOTES, not stubs). Waiver-with-REASON only, per line (`no-stubs: <reason>`) or per path (`.dz/guard.json` `stubWaivers`, the feature-adr-setup --guards shape); a reasonless waiver is REFUSED as its own finding and exempts nothing. Self-exemption is STRUCTURAL: every marker in the module and its tests is assembled from string fragments, so the gate's own source scans clean — a tested property, not a path skip. Fail-open on missing evidence (no change fact / ungathered contents ⇒ nothing reported) but never fail-SILENT: skipped scannable files (deleted/oversize/unreadable/beyond the file cap) surface as ONE aggregate `notes` entry in the `GuardResult` + audit record — information that can never move the verdict. KNOWN LIMITS are documented at the top of `no-stubs.ts` instead of implied away (whole-line inline waiver token = layer-4 auditability defence; reason QUALITY not judged; boolean fence model, not CommonMark; git-quoted paths undecoded; TS-monorepo extension allowlist; worktree-not-index reads; exact-string config-waiver paths). Mutation-defended (`no-stubs-bare-marker-fires` observed 10 red, `no-stubs-skipped-note-emitted` observed 2 red) |
| `feature-adr-setup` (P3) | `renderGuardsConfig`, `renderGuardsRunner` | Scaffolds deterministic guard tests into a TARGET project: `guards.config.json` + a zero-dependency `check.mjs` runner (loc-cap, secret-scan, frozen-file sha256 pins, waivers-with-reasons) — `dz feature-adr-setup --guards` |
| `usage` | `computeUsage`, `TOKEN_WEIGHTS`, `readUsageLimits`, `deriveUsageCalibration` | Read-only Claude usage ESTIMATE behind `dz usage`. Tokens are COST-WEIGHTED input-equivalents (input 1x, cache-write 1.25x / 1h 2x, cache-read 0.1x, output 5x) — a flat sum is 89-99.7% cache-read (MEASURED) and tracks conversation length, not work. Scans subagent transcripts too (`<session>/subagents/*.jsonl`), follows no symlinks, reads only regular files (symlinked FILES and DIRECTORY components alike are skipped), and caps the walk BY RECENCY so a huge history cannot discard current usage. `pct` stays `null` while limits are unconfigured — an unconfigured estimate is never dressed up as a number |
| `cost-ledger` | `deriveCostLedger`, `buildCostLedger`, `verifyCostLedgerReport`, `stageCostAggregates`, `renderCostLedger`, `writeCostLedgerJsonl`, `COST_LEDGER_SCOPE` | Per-stage cost ledger behind `dz usage --by-stage`. A feature-adr run reports ONE number; this joins the workflow's own `stageLabel()` strings to the per-agent transcripts the harness already writes, so a run becomes an itemized receipt. POST-HOC DERIVER, not a writer — no workflow edit, and a KILLED run is still derivable. The invariant: `accounted + unaccounted === runTotal` and `accounted + doubleAttributed === Σ stages`, RAW integer equality (rounding happens exactly once, per sample, at extraction), re-derived from the emitted report by `verifyCostLedgerReport` — the writer clamps, the verifier enforces. A mismatch is a NAMED defect (`Unaccounted`, `DoubleAttributed`, `ForeignSample`, `MissingStageTranscript`, `MalformedRecord`), never a rounding remainder, so `epsilon` defaults to 0. The run total comes from the run's transcript DIRECTORY LISTING, NOT the record's own `totalTokens` — that field is exactly `Σ workflowProgress[].tokens` in 29 of 29 recorded runs (MEASURED), so an invariant against it can never fail. Both sides share ONE estimator with `dz usage` (`weightedTokensOf`). `stageCostAggregates` is a pure feed-forward reader for auto-cost routing that EXCLUDES non-reconciling runs; wiring it into routing is deliberately out of scope. HONEST SCOPE, printed by every surface: local transcript ESTIMATES, not billed amounts — it catches ATTRIBUTION errors, NOT pricing errors; `hasKnownPricing` marks rows priced by the sonnet-class fallback. `INSUFFICIENT_DATA` is a distinct verdict, never collapsed into `BALANCED` |
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
| `statusline` | `statuslineData`, `readFeatureAdrState`, `writeFeatureAdrState`, `featureAdrStateDir`, `featureAdrStatePath`, `FeatureAdrState` | The live self-learning panel behind `dz statusline`, plus the LIVE-RUN segment two producers share. Each producer owns a per-slug slot under `.dz/feature-adr/learning-state/` and stamps `kind: 'feature-adr' \| 'loop'` (absent ⇒ `feature-adr`, so legacy states keep their meaning); `readFeatureAdrState` arbitrates by `(kind rank, ts)` — a fresh `feature-adr` state OUTRANKS any `loop` state, because a generated loop writes zero recalled/stored counters far more often and plain freshest-wins would empty the panel of the very thing it exists to show. Candidates are stat'ed and ordered newest-first BEFORE the bounded slice, so truncation can only ever drop the least-recent slot — a cap over an unsorted listing could hide the live slot behind older ones (MEASURED: 81 slots, the live one invisible). The render path is strictly READ-ONLY (~300 ms budget); housekeeping — a 24 h prune — belongs to the write path alone. Hostile slugs are sanitized to one bounded filename component and cannot escape the directory. Nothing older than 30 minutes is surfaced |
| `operations` | `runInit`, `runSync`, `runVerify`, `runDoctor` | The harness operations, returning structured reports. `InitReport` and `SyncReport` carry an additive, always-present `failures: readonly SkillLoadFailure[]` (empty when nothing failed): a single unloadable `SKILL.md` used to throw out of the whole loop, so `dz init`/`dz install`/`dz sync` reported NOTHING at all. They now skip, collect and name — skipping without a record would only trade a loud failure for a silent one. `runDoctor` is deliberately untouched: it was never a throw site, and a negative test asserts it gained no `failures` field |
| `release` | `collectPackageFacts`, `selectAffectedPackages`, `planReleaseGates`, `classifyGateExecutions`, `buildFailureIssue`, `firstOutputLine` | Pure verified-release engine behind `dz release`: plans 4 HARD gates (tests / `pnpm audit --prod` / `node --check` / bin smoke-boot) as DATA and classifies injected results fail-closed — an unbuilt package (declared `build` script, no dist JS) is a `MISSING_DIST` failure, a template-only pack is a named `SKIP_NO_ARTIFACTS` skip, `selectAffectedPackages` fail-opens to the full set when the changed-file list is unavailable |
| `parity` | `TARGET_CAPABILITIES`, `PARITY_FEATURES`, `computeParity`, `buildParityMatrix` | Declarative target-parity model behind `dz parity`: verified capability flags per target × feature FORMS with requirements; the feature×target matrix is always COMPUTED (never hand-written), and the model must classify exactly `TARGET_NAMES` — an unclassified new target refuses to compile |
| `delivery-check` | `PLANE_SPECS`, `collectDeliveryFacts`, `planDeliveryCheck`, `renderDeliveryBrief`, `classifyDelivery`, `renderDeliveryReview` | Pure portable Step-10 Delivery Gate engine behind `dz delivery-check`: the four review planes as shared DATA (prose-identical to the workflow's inline `planePrompts`, held by a drift-guard test), a deterministic plan/classify over injected facts+findings, and the FAIL-CLOSED hand-off verdict — `ready` only off complete, cross-validated, clean evidence; classification reads only numeric severity counts so injected instruction-like text cannot move the verdict. No `child_process`; the only fs is `existsSync` in `collectDeliveryFacts` |
| `skills-verify` | `scanSkillsLayout`, `parseInitFacts`, `verifyRegistration`, `registrationExitCode`, `renderRegistrationReport` | Pure registration-gate engine behind `dz skills-verify`: a static scan of `.claude/skills/` (which dirs CAN register + the shapes that never can) and a **sealed** verdict over one atomic evidence bundle (`RegistrationEvidence` = the whole scan + a tagged probe result + a provenance record). Cardinality and parse integrity are derived INSIDE from the raw `system/init` stream, so no caller can omit or falsify them. FAIL-CLOSED: an unobservable registration is `inconclusive`, never `pass`; a plugin-shaped container is advisory and its fate is decided by whether the session says that plugin LOADED, never by the layout. Also exports `findNonRegistrableSkillDirs` — the publish-time guard fact behind the `skills-registrable` rule (a pack counts only if it already has one registrable skill; a dir is flagged only when a `SKILL.md` exists inside but below depth 1 — the discriminator was chosen after MEASURING the real packs, since a naive rule flagged ~40 healthy dirs across 9 npx toolkits). Plugin containers are attributed by `init.plugins[].path`, never by directory name; a container whose plugin did not load FAILS, one that loaded PASSES with an advisory that its individual skills are unverified (modelling Claude Code's command-name resolution produced a new wrong verdict in every review round — the gap is disclosed, not guessed). Sees SLASH COMMANDS too: `InitFacts.slash_commands` carries the session's command listing (MEASURED on Claude Code 2.1.233 — `system/init` emits `slash_commands`, and a plugin command registers as `<plugin>:<file basename>`, not as its frontmatter name), `RegistrationEvidence.expectedCommands` names what must appear, and an ABSENT `slash_commands` key is `inconclusive` exactly like an absent `skills` key — never an empty list, because schema drift and "the commands did not load" are different facts. `declaredPluginSurface(dir)` derives the expected names from a plugin's own manifest so a gate run cannot drift from the manifest it checks, and returns `null` (never an empty, vacuously-passing expectation) for an unreadable one. Also ships the ADVISORY content layer (`buildContentProbePrompt` / `classifyContentProbe`): registration is not usability, so an extra model turn asks for a VERBATIM quote as evidence — advisory by construction, it never gates. No `child_process` — the CLI owns the probe |

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
  extractContractChecklist,
  renderContractChecklist,
  parseContractVerdictReport,
  verifyContractVerdicts,
} from '@dzhechkov/harness-core';
```

- `extractContractChecklist(source)` reads the exact `## Acceptance criteria` / `AC-N: ...`
  vocabulary and one exact `## Confirmation` pair from each canonical direct ADR Markdown file. It
  emits ordered `contract-checklist/1` items with contiguous `CC-N` ids or no partial contract.
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

## Status

`0.8.10` — staged, not published. Adds the four bounded `volume-shadow/v1` observations and their
immutable SOFT belt; incomplete evidence remains visible as unknown without changing the verdict.

`0.8.9` — staged, not published. Adds the pure decision-point micro-recall contract, strict
fail-open transport/receipt reducers, post-hoc numerator/denominator metrics, and mutation-defended
advisory prompt isolation. This is experiment instrumentation, not evidence of local effectiveness.

`0.8.8` — staged, not published. Adds evidence-gated `INTEGRATIONS.json` orchestration, one
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
full-store count must be updated. `0.6.1` — two new pure modules behind two new commands. `amendment-trace.ts` resolves every `AM-N`
amendment row to a test found INSIDE the file the row names — matched against the file's parsed TEST
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
