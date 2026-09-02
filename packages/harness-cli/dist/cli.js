/**
 * The `dz` CLI — argv parsing + dispatch over `@dzhechkov/harness-core`.
 *
 * @packageDocumentation
 */
import { appendFileSync, chmodSync, closeSync, cpSync, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request as httpsRequest } from 'node:https';
import { KNOWN_CLI_FLAGS } from './known-flags.js';
import { isBooleanFlag } from './boolean-flags.js';
import { resolveInstallSpec } from './install-spec.js';
import { execFile, execFileSync, execSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { homedir, hostname, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { isDeepStrictEqual } from 'node:util';
import { createSkill, getSkillInfo, listSkillsDetailed, formatSkillLoadFailures, formatSkillApplyFailures, resolveTargetName, formatTargetProblem, formatTargetAliasNote, TARGET_NAMES_SORTED, runDoctor, runInit, discoverSkillIds, resolveSelection, formatSelectRefusal, runIntegrationsVerify, resolvePackageSkillRoots, PACKAGE_SKILL_LAYOUTS, benchmarkSkill, benchmarkSkills, scanMcp, reconcileCapabilities, RECONCILE_BANNER, buildRegistry, discoverSkillPackDirs, discoverVerifiablePackDirs, checkUpstream, compareSkills, checkAllUpstream, sweepSkillDrift, syncCanonicalSkill, checkUpgrades, discoverPackages, discoverSourcePackages, fetchAllDownloads, filterByCategory, pretrain, recommend, generatePlugin, publishPackages, runSetup, runMigrate, searchRegistry, runSync, runVerify, runInitAgentsMd, runInitGeminiMd, runSyncAgentsPolicy, runSyncCodexHooks, resolveCodexHome, withNamedLockSync, 
// dz workflow run (feature dz-workflow-run): the pure scheduler + the dispatch adapters.
TRACE_RUNID_RE, WF_RUN_OWNER_HOST, preflight, runWorkflow, makeClaudePDispatcher, makeCodexExecDispatcher, NamedLockTimeoutError, NamedLockCompromisedError, POLICY_SOURCES, detectPolicyDrift, hasPolicyFence, TARGET_NAMES, buildParityMatrix, downgradeForStaleEvidence, findStaleTranscriptEvidence, TARGET_CAPABILITIES, TARGET_SHORT_LABELS, WORKFLOW_TEMPLATES_RETIRED_MESSAGE, parsePlan, isParseErrors, validatePlan, normalizePlan, planDigest, toTraceProjection, renderPlan, mergeRender, lint, lintExitCode, LOOP_BLOBS, parseTrace, assembleTimeline, runInvariants, deriveAttestation, stampAttestation, corroborate, NOT_WITNESSED, renderTimelineHtml, importEcc, recordPattern, recordLessonForms, normalizeLessonForms, resolveLearningBackend, storeStats, consolidateSessions, pruneNoisePatterns, lessonDeltaReport, removePatternsByIds, snapshotStore, recallHybrid, teachGuard, mirrorPatternsToVector, mirrorEntriesToVector, patternVectorEntry, readMemoryLearningConfig, promotePatterns, quarantineExpiryCandidates, pruneQuarantinePatterns, clearAgentdbQuarantine, vectorMirrorEnabled, vectorTierStatus, resolveVectorEngine, reindexVectorStore, harmonizeVectorStore, importRvfCheckpoint, statuslineData, writeFeatureAdrState, CHECKPOINT_STAGES, estimateEta, extractStageSamples, formatEta, parseCheckpointLines, segmentRun, computeUsage, deriveCostLedger, planLedgerBackfill, listCostLedgerRuns, resolveLedgerRunId, AMBIGUOUS, stampCheckpointLine, LEDGER_FILL_SOURCE, renderCostLedger, verifyCostLedgerReport, writeCostLedgerJsonl, COST_LEDGER_SCOPE, deriveUsageCalibration, normalizeClaudeUsageModelKey, readUsageLimits, parseWeeklyResetAnchor, claimCheck, summarize, BUNDLED_SLOP_REGISTRY_URL, DEFAULT_SLOP_CONFIG, parseSlopRegistry, slopLint, validateSlopLintConfig, queryBookKnowledge, loadStorePatternsSync, patternRecordId, patternIdentityOf, mergeLessonMatchedForms, loadStoreRecords, recordToPattern, bundleSkills, brainHome, listBrain, bookKbPath, promoteProjectToBrain, updateBrainSource, queryBrain, groundPrompt, expandKu, reindexBrainVectors, buildPrimer, exportBrainSlice, importBrainSlice, registerKusToBrain, RECALL_USAGE_LOG_RELATIVE, RECALL_USAGE_LOG_MAX_BYTES, parseRecallUsageLog, buildRecallUsageReport, EVENT_CHAIN_TAIL_BYTES, EMPTY_LOG_TAIL, readTailInfo, appendChainedLines, verifyEventChainText, classifyChainDefects, CHAINED_JOURNALS, buildManifest, buildSbom, resolveTrustRoot, decideVerifyPolicy, generateSigningKeypair, evaluateGuard, resolveRules, auditRecord, guardExitCode, DEFAULT_RULES, parsePnpmLockImporters, scannableStubPath, 
// guard-promotion (feature guard-promotion, scout idea #1)
assembleCandidates, renderPromotionReport, renderPromotionAdr, normalizePromotionState, nextPromotionState, recordPromotionRunEvidence, isLessonRuleContentAnchor, isOffsetIsoTimestamp, globMatch, promotionAdrRelPath, DEFAULT_WINDOW_DAYS, DEFAULT_PERIODS, MAX_CONTENT_FETCHES, BUILTIN_COVERAGE, decideProvenance, isInsideTree, signManifest, verifyManifest, listSignablePackFiles, assertKeyOutsideTree, decidePublishGate, collectPackageFacts, planReleaseGates, selectAffectedPackages, classifyGateExecutions, buildFailureIssue, buildReleaseNotes, releaseTagName, firstOutputLine, formatPublishError, MANIFEST_NAME, SBOM_NAME, buildArchitectureMap, renderMapHuman, findArchitectureDrift, renderDriftReport, scanWorkspacePackages, loadSubsystemManifest, loadProductVision, checkFeatureAgainstArchitecture, renderArchCheck, planProjectSkills, guidanceForStage, renderInjectionReport, analyzeCorpus, renderRakeReport, renderCriticSection, rakeAsLesson, rakeReward, DEFAULT_RAKE_THRESHOLDS, streamSessionEvents, findLatestTranscript, detectProcessRakes, buildRetro, renderRetro, retroLessonText, PROCESS_SIGNATURES, RETRO_DOMAIN, scanForSetup, buildSetupPlan, scaffoldFromSpec, renderScaffoldPreview, readExistingForScaffold, assembleChallengeContext, buildChallengeBrief, planDiscriminationCheck, classifyDiscrimination, classifyExecutionEvidence, pickAdversaryModel, CHALLENGE_QUESTIONS, loadOutcomes, renderOutcomes, statsForKey, selectAutoCost, recordProvisional, finalizeOutcome, harvestStageOutcomes, recommendModels, planFeed, unfedRuns, GRADE_SUCCESS_FLOOR, COST_LADDER, splitScenarios, budgetPlan, selectWinner, proseScopeOk, renderProseDiff, readScenarioIds, DEFAULT_MAX_JUDGE_RUNS, collectDeliveryFacts, planDeliveryCheck, renderDeliveryBrief, classifyDelivery, isUsablePlaneResult, renderDeliveryReview, scanSkillsLayout, declaredPluginSurface, parseInitFacts, verifyRegistration, buildContentProbePrompt, classifyContentProbe, renderContentProbe, findNonRegistrableSkillDirs, assembleCompoundingReport, buildDeadwoodReport, compactCmdUsageIfNeeded, measureCmdUsageDepthDays, recordCommandInvocation, resolveCmdUsageRoot, renderDeadwoodReport, CMD_USAGE_LOG_RELATIVE, banditStats, narrowBanditReport, renderBanditHealth, 
// Cold-vs-warm EPOCH RUNNER (feature epoch-replay) — orchestrates + scores, never calls a model.
replayableInstances, buildWorkOrder, buildJudgePrompts, unblindJudgments, verifyWorkOrder, isValidMargin, DIGEST_HONEST_SCOPE, scoreEpochReplay, generateMockOutcomes, renderEpochReplayResult, renderWorkOrderSummary, renderJudgePromptsSummary, WORK_ORDER_KIND, DEFAULT_MOCK_N, DEFAULT_MOCK_SEED, scoreRun, readQeGrade, scoreReceiptToAggregateRow, readScoreAggregateRows, dedupeScoreAggregateRows, buildScoreAggregateReport, renderScoreAggregateReport, recapWindow, decideHorizon, withinWindow, buildRecap, renderRecap, parseSourceManifest, tgPostHtmlIssues, tgVisibleLength, decideTgSend, TG_TEXT_LIMIT, countRecallEventsForRun, unknownFlagNotice, mirrorWriterExplanation, appendRecallUsage, closenessLine, anyAboveFloor, decideNameCheck, renderNameCheck, exportedNamesIn, dispatchedCommandsIn, decideSourceProvenance, renderSourceProvenance, REFUSED_HORIZONS, renderScorecard, renderCompoundingReport, readReinforcementState, readQuarantineState, registrationExitCode, renderRegistrationReport, 
// Smart Backlog (feature smart-backlog) — goal-directed idea pipeline over the Brain vector engine.
readBacklogConfig, readIdeas, writeIdeas, ideaId, dedupIdea, readGoalMap, readGoalMapDetailed, parseEffort, ensureBacklogGitignored, isSafeId, alignIdea, mirrorIdeaVector, ensureBacklogEmbedForm, readBacklogEmbedFormVersion, recordAbsorption, DEDUP_EMBED_FORM_VERSION, snapshotIdeas, spinRoulette, rankRoulette, seededRng, eligibleIdeas, stageEnrichment, buildJiraDraft, resolveJiraAdapter, makeBacklogIO, harmonizeBacklog, transitionIdeas, editIdea, clearEmbedStale, BACKLOG_BACKENDS, applyDomainBoost, DZ_OWNED_TASK_TYPES, applyExportHoldout, DEFAULT_HELD_OUT_DOMAINS, canonicalDomainKey, readAgentdbRowsByTaskType, heldOutAfterOptIn, renderHoldoutNote, renderSharedStoreAdvice, decideVectorExport, countDisplacedByCut, renderDomainBoostNote, renderDomainCutNote, parseReqeDebt, 
// qe-bridge (feature qe-bridge-claude, ADR-001): the pure half of the reverse QE bridge.
KNOWN_CLAUDE, isSafeClaudeId, claudeProbeArgs, claudeReviewArgs, interpretClaudeProbe, modelFamily, buildBridgePrompt, parseBridgeOutput, buildBridgeFailureRecord, buildBridgeSignoffRecord, renderBridgeReport, isSafeSlug, hasUnsafePathChars, hasDotDotSegment, buildReqeBrief, settleReqeDebt, renderReqeList, REQE_SCOPE, 
// Mutation gate (feature ha-mutation-gate) — break each named protection, run the suite, require red.
parseMutationRegistry, applyMutationToText, attributeBaselineRedness, countFailingTests, detectSuiteCompletionReceipt, detectSuiteReceiptMismatch, classifyBaseline, classifyRunFailure, classifyMutationOutcome, mutationGateExitCode, summarizeMutationResults, renderMutationReport, runWithOneInternalRetry, TRACE_BUNDLE_LEDGER_PATH, TRACE_BUNDLE_SCHEMA, TRACE_BUNDLE_RUN_META_FILE, buildBundle, serializeBundle, parseBundle, planImport, decideCheckpointWrite, amendmentSection, planSaysNoAmendments, parseAmendments, resolveAmendments, decideAmendmentOutcome, amendmentVerdictLine, amendmentsMissingFromPlan, AMENDMENT_VACUITY_NOTE, extractContractChecklist, parseContractVerdictReport, verifyContractVerdicts, decideSignableSet, signableSetLine, decideRecordWrite, decideReadBack, recordVerdictLine, buildCadenceReport, tgVisibleSha256, CADENCE_WINDOW_DAYS, readQeRounds, QE_ROUNDS_DEFAULT_CEILING, adviseRestart, describeStoreLocation, storeLocationLine, resolveTeachTarget, teachReasonPhrase, readTeachToConfig, TeachTargetError, mergeStoreHits, sameStore, globalStoreRoot, storeCountLabel, 
// operator-profile (ADR-001): per-user 0600 store + marked block in ~/.claude/CLAUDE.md
renderProfileBlock, readProfile, writeProfile, syncProfileBlock, checkProfileDrift, parseRegister, registerOwnerWord, profileAgeDays, parseDomainList, domainListText, parseYesNo, REGISTERS, } from '@dzhechkov/harness-core';
import { getPreset, PRESET_NAMES } from '@dzhechkov/harness-presets';
import { scanGitHub, analyzeRepo, generateReport, deepAnalyze, scanAllSources, ScoutMemory } from '@dzhechkov/scout';
/** Literal command inventory, pinned against the main dispatch switch by a layer-1 test. */
export const DZ_COMMANDS = [
    'init', 'verify', 'sync', 'update', 'list', 'create-skill', 'info', 'scout',
    'workflow', 'workflow-lint', 'workflow-trace', 'migrate', 'doctor', 'install',
    'bundle', 'teach', 'consolidate', 'recall', 'vector', 'brain', 'statusline',
    'usage', 'claim-check', 'lint', 'sign', 'sbom', 'guard', 'verify-pack', 'setup',
    'pretrain', 'compose', 'diff', 'recommend', 'upgrade', 'auto-canonicalize',
    'publish', 'release', 'parity', 'registry', 'benchmark', 'mcp-scan',
    'sync-upstream', 'drift-check', 'hooks-sync', 'integrations-verify', 'agents-sync', 'sync-canonical',
    'plugin', 'downloads', 'stats', 'architecture', 'project-skills', 'mr-rakes',
    'retro', 'feature-adr-setup', 'challenge', 'discrimination-check',
    'mutation-gate', 'delivery-check', 'skills-verify', 'compounding', 'deadwood',
    'epoch-replay', 'score', 'recap', 'cadence', 'qe-rounds', 'restart-advisor', 'tg-post',
    'name-check', 'provenance-check', 'feature-adr-record', 'amendment-check', 'contract-check',
    'feature-adr-checkpoint', 'profile', 'reqe', 'qe-bridge', 'backlog', 'routing',
    'bto-optimize', 'dashboard', 'roam', 'import-ecc', 'chain',
];
const USAGE = `dz - DZ cross-platform harness CLI

Usage:
  dz init   --target <name> [--skills-dir <dir>] [--project <dir>] [--preset <name>] [--select id,id,...] [--force] [--enrich] [--allow-integrations <sha256:digest>] [--no-integrations] [--no-hooks] [--no-verify]   (integration manifests require exact digest consent; --no-integrations = explicit skills-only)
  dz verify [--skills-dir <dir>] [--target <name>]
  dz sync   [--canonical <dir>] [--project <dir>] [--dry-run] [--force]
  dz update   (alias of sync)
  dz list   [--skills-dir <dir>]
  dz info   <skill-id> [--skills-dir <dir>]
  dz migrate [--project <dir>]
  dz create-skill --name <id> [--description <text>] [--skills-dir <dir>] [--tier <1-3>] [--with-references] [--no-evals] [--bto]
  dz scout   [--topics <list>] [--since <date>] [--deep] [--output <file>] [--diff] [--report]
  dz workflow init --name <n> [--pattern pipeline|barrier|fanout|gate] [--o <plan.json>]   (scaffold a loop-plan/1 plan)
  dz workflow validate <plan.json> [--json]                 (schema + INV-1..8 checks; CI-runnable, non-zero on failure)
  dz workflow render <plan.json> --o <script.js> [--check] [--force]   (plan → region-delimited loop script; USER regions preserved)
  dz workflow blobs [--check]                               (list/self-check the subsystem blob registry)
  dz workflow-lint <script.js> [--plan <plan.json>] [--require-plan|--legacy] [--json]   (layer-1 gate; exit 0/1/3 — inconclusive is never a pass)
  dz workflow-trace <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--corroborate <hostRunDir>] [--html <out.html>] [--json]   (timeline + SEQ invariant runner; ALWAYS reports who attested the trace — instrument|agent|unknown — and --corroborate checks the Claude host's own records for the half they can witness)
  dz workflow-trace export <run> --o <file> [--include-pairs --yes] [--strict]   (one run's telemetry as ONE movable file: events, not aggregates; degradation is typed and LOUD, --strict fails closed)
  dz workflow-trace import <bundle> --into <root> [--force] [--with-pairs]       (reconstruct that run under an explicit root; FAIL-CLOSED — never writes over a run that already has content)
  dz install <npm-pkg> [--target <name>] [--project <dir>] [--force]
  dz bundle  [--preset <name> | --select id,id,...] [--out <dir>] [--skills-dir <dir>] [--force]   (portable self-contained skill bundles for a generic/LangGraph consumer)
  dz doctor  [--project <dir>] [--pubkey <path>] [--require-signing]   (health + signature check of installed packs)
  dz upgrade [--target <name>] [--pubkey <path>] [--require-signing]   (a TAMPERED pack aborts the upgrade)
  dz sign   --pack <dir> --key <path-outside-repo>          (Ed25519 manifest + CycloneDX SBOM for a pack)
  dz verify-pack --pack <dir> [--pubkey <path>]             (signature check; fail-closed; key from the repo, never the pack)
  dz publish [--filter <name>] [--bump-only] [--claim-check <off|warn|error>] [--require-signing] [--provenance|--no-provenance]   (dry-run by default; pass --yes/--confirm/--no-dry-run to go live; claim-check gate default warn — surfaces README claim findings, never blocks; error fails an offending package)
  dz release [--filter <name>] [--tag] [--publish] [--json] [--dry-run] [--no-issue]   (VERIFIED release: 4 HARD gates in FRONT of dz publish — full package test suites, audit >=high, node --check of every dist/bin file, bin smoke-boot via "node <bin> --help" — any red gate STOPS the release (exit 1) + best-effort gh issue; all green ⇒ re-sign reminder, then prints the ready dz publish command (or chains with --publish); never duplicates publish's own gates)
  dz parity [--target <name>] [--json]   (the honest feature×target map, COMPUTED from the capability model — which harness feature is full / manual / absent on each of the ${TARGET_NAMES.length} targets, and via which form)
  dz delivery-check --slug <slug> [--context-only] [--findings <f.json>] [--strict] [--author <model>] [--json]   (portable Step-10 Delivery Gate: prints the 4-plane review brief + artifact probes; --findings classifies a fed-back review into a fail-closed ready|blocked hand-off and writes features/<slug>/10_delivery_review.md; --strict exits 1 on blocked)
  dz challenge --plan <plan.md> [--author <model>]   (the deterministic cartridge behind the challenge-panel adversarial plan-gate (R6): assembles the wide brief — plan + architecture/vision.md + testing.md + map.json + degradations.md — and prints the C1-C8 adversary prompt naming the cross-family reviewer to dispatch. exit 0 brief printed / 1 plan missing or empty)
  dz skills-verify [--dir <project>] [--expect a,b] [--static] [--strict] [--json]   (does .claude/skills/ actually REGISTER? --static = instant layout scan for CI; default reads the authoritative system/init listing from a real session. exit 0 pass / 1 fail / 2 inconclusive — never a false pass)
  dz compounding [--project <dir>] [--json]   (honest learning-loop payoff report: pool/replay/guard instrumentation + monthly eligible→attempted→accepted→executions; unavailable is NOT MEASURED, and only a named empty stage after a non-empty predecessor for 3 measured months is a funnel finding)
  dz deadwood [--weeks <n>] [--json]   (advisory zero-usage candidates for human deprecation review; safety-excluded surfaces carry reasons; never deletes or deprecates anything; shallow history says INSUFFICIENT_DATA)
  dz epoch-replay --mock [--n <N>] [--effect <-1..1>] [--tie-rate <0..1>] [--seed <N>] [--slice <name>] [--json]   ($0 synthetic run — exercises the verdict math, NOT evidence)
  dz epoch-replay --emit [--project <dir>] [--limit <N>] [--seed <N>] [--out <file>]   (cold-vs-warm work order: instances + PRE-REGISTERED blind A/B assignment; the runner never calls a model)
  dz epoch-replay --judge <filled-work-order.json> [--out <file>]   (blind judge prompts from the filled plans)
  dz epoch-replay --score <judgments.json> --work-order <file> [--slice <name>] [--json]   (un-blind against the pre-registered assignment → SUPPORTED only when the two 95% Wilson CIs are DISJOINT, else FALSIFIED / INCONCLUSIVE)
  dz score --slug <feature> [--project <dir>] [--json]   (process scorecard for ONE feature-adr run, from its artifacts: ADR confirmation, discrimination, cross-model QE grade, live verification, README-first, learning loop, amendments — descriptive-only, a low score exits 0)
  dz score --all [--project <dir>] [--json]              (sweep features/*/.fa-state/score-*.json into the append-only chained scorecards aggregate — descriptive-only, always exits 0)
  dz recap [--day|--week|--month] [--at <ISO date>] [--project <dir>] [--json]   (what was done over a window, from records only: deliveries with the grade an independent review STATED — a report naming two grades is reported ambiguous, never guessed — registry publishes, gate verdicts, knowledge reuse. --quarter/--half-year/--year are RECOGNISED and REFUSED with the real span in days: there is one complete quarter and the longest record is 174 days. Every section carries its own data-start date, and "the source was not read" never prints as zero. Contaminated measures — commit count, lines, tokens, learning-event volume, inventory counts, lesson count — are not computed, and the report says so. exit 0 reported / 2 refused)
  dz cadence [--window day|week|month|quarter|halfyear|year] [--json]   (the WHAT-SHIPPED aggregator: graded-shipment cadence by ISO week + npm-publish cadence (recap cache) + guard repeat decay on the FIXED rule set + recall reuse; a window deeper than 2× the record is REFUSED with the depth named (ADR: a cadence from one point is scale forgery); exit 0 report / 2 refused-window / 1 usage)
  dz qe-rounds (--slug <feature> | --feature-dir <abs>) [--ceiling <n>] [--project <dir>] [--json]   (how many Step-8 review rounds has this feature ALREADY had? Reads what dz qe-bridge already wrote — signoff-<runId>.json and failed-*.json under features/<slug>/.fa-state/qe-bridge — and writes nothing itself, so it can answer for runs already past. A round is a runId, not a file; an attempt with no verdict is counted SEPARATELY and never merged; an unreadable record is NAMED and the count is declared a LOWER BOUND. ONE directory, never a union across checkouts. exit 0 under the ceiling / 1 at-or-over — owner decides, the command does not judge whether the rounds were warranted / 2 NOT ESTABLISHED, which is never "zero rounds")
  dz restart-advisor --slug <s> [--threshold C|D] [--rounds N] [--json]   (read-only advisory decision over features/<slug>/.fa-state/checkpoints.jsonl and .dz/fa-training/<slug>/qe.jsonl. Defaults: threshold D, rounds 2 — both origins are printed. Equal sources corroborate; conflicts, torn/unreadable evidence, gaps, and unsafe paths are NOT ESTABLISHED. RECOMMENDATION ONLY: autoAction=false; never invokes feature-adr, deletes a stage, or writes advisor state. exit 0 established recommendation/no-recommendation / 2 NOT ESTABLISHED or invalid input / 1 unexpected runtime failure)
  dz tg-post --draft <file.html> [--manifest <sources.json>] [--channel <@name|id>] [--send --yes] [--night] [--preview] [--json]   (the sender for an APPROVED channel post, per the accepted genai-tweets-channel ADRs: HTML mode only — never MarkdownV2; link preview OFF by default (x.com previews in Telegram are broken); the 00:00-06:00 MSK quiet window refuses without an explicit --night. DEFAULT IS A DRY-RUN: it validates the draft (tag balance, allowed tags, bare &/<, the 4096 visible-character limit with the overshoot counted) and runs the provenance gate over --manifest IN-PROCESS — a draft with no manifest is refused as unchecked, and anything but ALLOWED refuses. A real send needs --send --yes, stating ADR-004's manual-publishing decision out loud each time. The token comes from TELEGRAM_BOT_TOKEN or telegram.tokenFile in .dz/config.json and is never printed. exit 0 sent or clean dry-run / 1 refused or Telegram error / 2 usage)
  dz name-check [--command <n>] [--module <basename>] [--export <a,b>] [--project <dir>] [--json]   (is this name free, BEFORE a line of code? Scans workspace SOURCE — never dist, because a stale build answers 'free' confidently. Checks a dz command name against the dispatcher AND the help block, a module basename against every package's src/, and exported identifiers against every declaration in the workspace. exit 0 all free / 1 at least one taken, naming where / 2 nothing asked or the scan did not run — an empty sweep is never a clean bill. Honest limit, printed on the passing path: it reads declarations, so a re-export under a different name stays the build's job)
  dz provenance-check --manifest <sources.json> [--project <dir>] [--json]   (nothing goes out citing a source that may not leave this machine. Checks PROVENANCE, not words: every claim names its source, and only a KNOWN kind that resolves safely is cleared. Repo paths go through 'git -C <root> check-ignore' over the RESOLVED path — a symlink into an ignored directory is REFUSED (git classifies the string and never dereferences, MEASURED), and the verdict does not change with your working directory. Store records must be named in the git-TRACKED provenance-public.json, so declaring one public is a reviewable commit rather than a field inside an ignored store. An undeclared kind is refused, never inferred from the path's shape. exit 0 allowed / 1 blocked / 3 NOT ESTABLISHED — an empty manifest, an unreadable one, or an oracle that did not run is never a pass. It proves what was CITED: it cannot see a paraphrase with no citation, nor confidential text pasted by hand into an allowed file)
  dz project-skills [--project <dir>] [--json] [--stages-json]   (polymorphic feature-adr: resolve architecture/project-skills.json — fixed roles product-vision/critic/brand/impl-bar plus an open extra[] — into per-stage guidance. READ-ONLY. --project names the root explicitly, so it works from any cwd; without it the manifest is read from the current repo. No manifest ⇒ a byte-identical generic run)
  dz discrimination-check --slug <slug> [--base <ref>] [--json]   (does the ADR's named test actually DISCRIMINATE? Re-runs it on a worktree at the pre-feature commit, where it MUST go red. A test that passes with the feature removed proves nothing; dz amendment-check proves the test exists, this proves it bites)
  dz guard [check|promote|init] [--json] [--force]   (HARD/SOFT repo rules — readme-first, lockfile-in-sync, claim tagging — run automatically as a pre-flight inside dz publish. HARD blocks, SOFT warns)
  dz architecture [--check --slug <s> --desc <text>] [--project <dir>] [--revise]   (the live product map + vision: --check is the soft Step-0 сверка of a new feature against them, reporting {signal,confidence} rather than blocking)
  dz sbom [--pack <name>] [--out <file>]   (CycloneDX software bill of materials for the workspace, or for one pack with --pack)
  dz amendment-check --slug <slug> | --feature-dir <dir> | --all [--json]   (the deterministic Step-8 amendment gate: every AM-N row must resolve to a test found INSIDE the file the row names; the PLAN is authoritative when it carries rows, and an ideation amendment the plan drops is a failure. exit 0 pass/skip, 1 fail, 3 NOT-ESTABLISHED — a section that parsed ZERO rows is never a pass. --all is a CENSUS and always exits 0. Does NOT prove non-vacuity — that is dz discrimination-check)
  dz contract-check --slug <s> [--json]   (read-only retrospective feature contract gate: extracts canonical AC-N + ADR Confirmation items, requires one artifact-anchored met|unmet|not-testable verdict per CC-N, and rejects A/B with unmet. exit 0 pass / 1 readable contract or verdict violation / 2 invalid invocation or unreadable/not-established artifacts)
  dz feature-adr-record --kind ledger|training-pair --stage <s> [--slug <s>] [--row|--pair <json>] [--mark <n>] [--once] [--json]   (the witnessed writer for the run-cost ledger and training pairs: the payload arrives as an ARGUMENT, never as shell; a malformed or wrong-kind payload is REFUSED before any write; the timestamp is stamped before serialising; the append is verified by re-reading the tail. exit 0 written|duplicate|skipped, 2 refused, 3 not-verified — a record failure is never blocking)
  dz feature-adr-checkpoint (--slug <feature> | --feature-dir <abs>) --stage <s> --input-hash <h> --result <json> [--artifact a,b] [--json]   (record a pipeline stage ONLY after measuring its artifacts on disk; refuses a null result, an absent artifact, or a stage that declares none — the subagent runs a COMMAND instead of hand-writing durable state)
  dz profile [init|show|set|sync] [--json]   (WHO the assistant is talking to — per-user store at ~/.dz/profile.json (0600, NEVER in a project), delivered as a marked block in ~/.claude/CLAUDE.md so it loads in EVERY project, dz installed or not. init = five questions (language, register, deep/weak domains as comma lists — "networking (CCIE; NSX)" keeps the parenthetical as the note, Enter skips — teaches y/n with one re-ask, never a silent default); show ALWAYS prints the store path + age + drift verdict + the rendered block; set register|language|teaches <v> or set deep|weak add|rm <tag> [note] — register accepts the owner's own words (профи / профи лайт / просто), an unknown value is REFUSED naming the accepted set; sync re-writes the block (runs automatically after init/set; foreign content byte-for-byte, timestamped backup before every modifying write). The register changes FORM, never FACTS, and governs dialogue only — never ADRs/commits/QE reports; both rules are baked into the rendered block at every level. exit 0 done / 1 no profile or failed / 2 refused input)
  dz reqe [--slug <feature> [--done --report <f>]] [--json]   (the re-QE debt ledger: a usage-switched run whose Step-8 QE ran on the coder's OWN family records a debt; list debts, print the cross-family review brief, settle FAIL-CLOSED against a graded report — the settlement lands in 08_qe_report.md)
  dz qe-bridge --family claude --slug <feature> [--coder-family codex|claude] [--model <id>] [--files a,b] [--out <f>] [--timeout <s>] [--allow-same-family] [--json]   (the REVERSE QE bridge: run an INDEPENDENT Claude reviewer over a feature's Step-8 artifacts from ANY host — a Codex session included, plain shell, no Claude agent plane needed — and land a PARSED signoff. The reviewer runs ISOLATED: an EMPTY temp cwd plus --safe-mode --strict-mcp-config --tools '' --no-session-persistence, so no CLAUDE.md/skills/plugins/hooks/MCP load, and the verdict is read from the --output-format json RESULT ENVELOPE — text a session customization printed onto the same stdout can never become a signoff. Probes the model before trusting it; sends SCOPED extracts with a loud 200k-char ceiling (never silent truncation); the grade must AGREE across three LAST-anchored channels (terminal marker line, fenced qe-bridge-signoff JSON, the report's own GRADE line) AND the marker must be the FINAL content — empty, gradeless, self-contradicting or miscounted output is one of 17 NAMED failures with an audit record under features/<slug>/.fa-state/qe-bridge/ (runId, resolved executable + binOverride, prompt sha256, channel offsets, requestedOut, reportWritten, retained raw stdout; 0600 files in a 0700 dir), never a clean review. A --coder-family that contradicts the recorded reqe debt is refused. Writes features/<slug>/08b_reqe_report.md, which dz reqe --done settles unchanged. DISCLOSURE: the extracts you scope are sent to the Claude runtime; the bridge cannot classify secrets. DZ_QE_BRIDGE_CLAUDE_BIN is a TEST SEAM, not a flag. exit 0 signoff parsed (ANY grade — it reports, it does not gate) / 1 named failure / 2 usage)
  dz mutation-gate [--package <dir>] [--registry <file>] [--test-cmd "<cmd>"] [--only <id[,id]>] [--timeout <ms>] [--rebaseline per-entry|final] [--keep-scratch] [--json]   (prove each NAMED protection has a test that DISCRIMINATES: copy the package to a scratch dir, verify the baseline suite is green, apply each registry mutation, run the suite, REQUIRE red, restore. The red must be BEHAVIOURAL: a mutation that no longer parses is MUTATION_UNPARSEABLE; a red run whose OWN output reports a test FILE failing to load (node --test file-level not-ok with exitCode, vitest Failed Suites) is MUTATION_LOAD_FATAL — the signal comes from the same run as the failing count, never from a separate isolated import; red output whose shape matches no known runner is INCONCLUSIVE (a runner-coverage gap, loud, never PROVEN); a count far above the entry's bound is OVER_FAILING; a restored tree that does not reproduce green makes the entry INCONCLUSIVE (flaky). Mutation writes are realpath-contained to the scratch copy: a symlink escape or a node_modules/ target is refused (exit 2), the real tree is never written. A mutation that does not apply, a green suite, or an inconclusive run is a FAILURE — never a skip. exit 0 all proven / 1 gate failed / 2 setup error)
  dz backlog add "<idea>" [--effort 1-5] [--proposal <text>] [--dry-run] [--project <dir>] [--json]   (capture an idea: semantic dedup against existing ideas via the Brain vector engine (DUPLICATE>=0.92 merges, RELATED links, NEW creates) + GoalMap alignment; --dry-run classifies without writing)
  dz backlog list [--status <s>] [--goal <id>] [--project <dir>] [--json]   (list captured ideas, filterable by status/goal)
  dz backlog show <id> [--project <dir>] [--json]                          (full record for one idea)
  dz backlog goals [--validate] [--project <dir>] [--json]                 (list/validate the compass at .dz/backlog/goals.json)
  dz backlog roulette [--pick <N>] [--seed <n>] [--commit] [--project <dir>] [--json]   (WEIGHTED draw over eligible ideas: alignment^alpha * recencyDecay * 1/effort, seeded; --pick N = ranked shortlist; --commit flips the pick to in-progress)
  dz backlog ship <id> [<id>…] [--reason <t>] [--dry-run] [--project <dir>] [--json]   (mark work DONE: new|enriched|in-progress → shipped, removing it from the roulette pool — run it after finishing a task; short id prefixes ok, ambiguous = loud error)
  dz backlog drop <id> [<id>…] [--reason <t>] [--dry-run] [--project <dir>] [--json]   (retire an idea: new|enriched|in-progress → dropped)
  dz backlog edit <id> --text "<new>" | --append "<more>" [--dry-run] [--project <dir>] [--json]   (rewrite ONE idea's text, preserving every other field; re-embeds the dedup vector, and on a failed re-embed MARKS the record embedStale so dedup refuses to trust it — previous text preserved in .dz/backlog/edits.jsonl)
  dz routing recommend [--tier <t>] [--apply] [--json]   (per-stage args.models suggestion from REAL telemetry — harness records + imported run-meta sidecars — printed WITH its basis + current/STALE/UNFED store receipt; qe is FORCED cross-family of code; --apply feeds .dz/routing-outcomes.json idempotently by runId)
  dz backlog reopen <id> [<id>…] [--reason <t>] [--dry-run] [--project <dir>] [--json]   (back to the pool: shipped|dropped|in-progress → new)
  dz backlog enrich <id> [--project <dir>] [--json]                        (stage the idea2prd input scaffold in features/<slug>/ and hand off to the idea2prd-manual skill — the CLI never fabricates a PRD)
  dz backlog jira <id> [--project <dir>] [--json]                          (draft a Jira issue via the configurable adapter (backlog.jira.adapter: jira-mcp|copilot-mcp|none); none writes an auditable jira-outbox/<id>.json stub)
  dz backlog harmonize [--apply] [--threshold <0-1>] [--project <dir>] [--json]   (batch semantic dedup of the backlog ideas; --dry-run default, --apply snapshots first)
  dz setup --target <name> [--preset <name>] [--select id,id,...] [--skills-dir <dir>] [--project <dir>] [--memory agentdb] [--no-memory] [--no-hooks] [--no-verify] [--install-driver] [--force] [--enrich]   (--target codex ALSO installs + LIVE-verifies the codex hooks; an unverified hook exits non-zero WITHOUT aborting the rest of setup)
  dz teach "<pattern>" [--class-form "<template with :slot>"] [--reward <0-1>] [--domain <name>] [--type rule|success-pattern|lesson-learned] [--project <dir>] [--no-mirror]   (class form is optional; rejection never blocks the specific write; --project pins the learned store to <dir>/.dz)
  dz teach --from-json <file> [--project <dir>] [--no-mirror]   (bulk-import a 'dz recall --all --json' export — share a learned store across machines)
  dz consolidate [--sessions-dir <dir>] [--project <dir>] [--no-mirror] [--prune-noise [--apply]] [--prune-quarantine [--apply]]   (both prunes: DRY-RUN by default; --apply snapshots then deletes; prune-quarantine = expired unproven lessons ONLY, never coupled to noise)
  dz recall "<query>" [--limit <N>] [--domain <name>] [--semantic | --no-semantic] [--books [--book <slug>]] [--project <dir>] | dz recall --all [--json] | dz recall --usage [--json] | dz recall --forget <dzId>[,<dzId>] [--apply] | dz recall --promote <dzId>[,<dzId>] [--apply]   (--domain <name> BOOSTS lessons of that domain without dropping foreign ones — a shared store keeps its cross-domain transfers; forget/promote: dry-run default; forget snapshots before removing; promote lifts lesson-quarantine)
  dz vector status [--project <dir>] [--json]                          (semantic tier: engine, mirrored vs lexical counts, pending queue)
  dz vector reindex [--project <dir>] [--json]                         (snapshot, re-embed learned-pattern vectors, stamp current model)
  dz vector export <path> [--project <dir>]                            (portable VECTOR form (.rvf, opt-in RVF engine); patterns ship via recall --all --json)
  dz vector import <file.rvf> [--project <dir>]                        (import a checkpoint's patterns by dzId — non-destructive upsert, orphan dzIds skipped)
  dz vector harmonize [--apply] [--threshold <0-1>] [--project <dir>]  (semantic dedup of near-duplicate patterns; --dry-run default, --apply writes a restorable backup)
  dz brain list  [--json]                                              (the durable cross-project knowledge brain)
  dz brain query "<q>" [--source <slug>] [--limit <N>] [--any] [--rerank] [--json]  (cross-source recall; --any = OR match; --rerank reorders top-K)
  dz brain add   [--source <slug>] [--project <dir>] [--from-slice <f>|--from-pack <p>|--from-kus <f> --slug <s>] [--kind <k>] [--license <spdx>] [--json]   (grow the brain: promote this project, or import a slice/pack/KU-array)
  dz brain update <slug> [--project <dir>] [--json]                    (non-destructive refresh: re-mirror a re-ingested source into the brain)
  dz brain reindex [--json]                                            (snapshot, re-embed book-KU brain vectors, stamp current model)
  dz brain primer <slug> [--json]                                     (print a source's capability card — KU-type histogram + top decision moments)
  dz brain export --source <slug> --out <file>                        (export ONE source as a portable, lexical-only books.sqlite slice)
  dz brain ground [<prompt>] [--k <N>] [--source <slug>] [--text] [--budget <N>] [--full]  (UserPromptSubmit hook; --budget inlines top-K KUs within ~N tokens; --full = ~8000)
  dz brain expand <kuId> [--source <slug>] [--json]                    (full-content lookup for a citation kuId; --json emits the full KU object)
  dz brain init  [--project <dir>] [--k <N>]                           (wire the grounding hook into .claude/settings.json — opt-in)
  dz statusline [--json] [--install] [--project <dir>]                 (live self-learning panel for Claude Code's status bar; reads the CC JSON payload from STDIN)
  dz statusline --fa-record --slug <s> --step "<label>" [--kind <feature-adr|loop>] [--recalled <n>] [--stored <n>] [--mode <m>]   (feature-adr: record live per-run learning state → 📐 panel segment)
  dz usage [--json] [--project <dir>] | dz usage --calibrate --session <pct> --weekly <pct> [--model fable=<pct>] [--project <dir>]  (ESTIMATE Claude usage from fixed reset windows; optional per-model weekly binding; exit 0 ALWAYS; pct=null when limits unconfigured)
  dz usage --by-stage [--run <runId> | --slug <slug>] [--epsilon <0..1>] [--write <file.jsonl>] [--json]   (per-stage cost ledger for ONE feature-adr run + the reconciliation invariant: accounted + unaccounted = run total; verdict BALANCED | DEFECT | INSUFFICIENT_DATA; local transcript ESTIMATES — catches ATTRIBUTION errors, not pricing errors)
  dz chain [--project <dir>] [--json]   (verify EVERY hash-chained journal in ONE command: coverage is DERIVED from the CHAINED_JOURNALS registry, never typed, so a journal cannot be given a chain and checked by nobody. An ABSENT journal is NAMED absent, never omitted — omission and cleanliness are indistinguishable in a report. Statuses: ok | healed (defects the current unbroken run has outlived — verdicts over present records are sound) | unchained (present, no chained record yet — legal) | absent | broken | unreadable. Exit 1 on broken/unreadable: a verifier that reports damage and exits 0 is one no automation can act on)
  dz claim-check [paths...] [--json] [--fail-on high|medium|none] [--project <dir>]  (enforce the Integrity Rule: flag untagged/overstated accuracy claims; default scan = root README.md + every discovered package's README.md + features/*/08_qe_report.md + docs/**/*.md (historical feature artifacts are NOT scanned — pass paths explicitly); exit 1 only at/above --fail-on, default high)
  dz lint [paths...] [--json] [--config <file>] [--registry <file>] [--project <dir>]  (advisory EN/RU prose-style lint; findings exit 0, incomplete input/policy exits 1, usage exits 2)
  dz pretrain [--project <dir>]
  dz recommend "<task description>"
  dz compose <preset1+preset2+...> [--target <name>]
  dz diff <skill-dir>
  dz auto-canonicalize --source <github-url> --pack <skills-pack>
  dz registry [search <query>] [--category <cat>]
  dz benchmark <skill-dir> [--compare <dir>] [--all]
  dz mcp-scan [path] [--json]   (static agent-permission audit; exit 0/1/2 = clean/medium/high)
  dz mcp-scan [path] --reconcile [--skills-dir <dir>] [--emit-policy [<file>]] [--fail-on-undergrant]
              (build-time: reconcile project grants vs installed skills' declared capabilities; dz never enforces — the host does)
  dz sync-upstream [--package <dir>] [--list] [--all]
  dz drift-check [--json] [--project <dir>]                             (CI gate: exit 1 if any shared skill drifted between its monorepo copies)
  dz agents-sync [--project <dir>] [--check] [--json]                   (sync/verify the always-on policy fence in root AGENTS.md; exit 0 synced/written, 1 drift, 3 inconclusive)
  dz hooks-sync --target codex [--check] [--verify] [--remove] [--json]  (install/verify the dz veto + recall hooks in $CODEX_HOME/hooks.json; exit 0 armed+trusted, 1 not armed/drift, 3 inconclusive)
  dz integrations-verify --target <name> --component <mcp|hooks> [--project <dir>] [--json]  (non-executing exact-version registration probe; exit 0 observed / 1 refused)
  dz sync-canonical <skill> [--check] [--from <dir>] [--auto] [--project <dir>]  (heal every copy from skills-meta/<skill> or --from; no canonical + --check = compare copies to each other (exit 1 on drift); no canonical + write = refuse unless --auto (LOUD, picks most-complete copy); --check writes nothing)
  dz plugin [--version <ver>]
  dz downloads
  dz stats
  dz dashboard
  dz roam   [--apply] [--slug <slug>]
  dz import-ecc [--local-path <dir>] [--select id,id,...] [--limit N] [--output <dir>] [--force]
  dz help

Global: --version | -v [--json]   (prints this CLI's own semver on one line, exit 0; "unknown" + exit 1 when unresolvable)

  dz workflow run <plan.json> [--run-id <id>] [--resume <runId>] [--arg k=v]... [--coder-family codex|claude]
              [--default-family codex|claude] [--budget <n>] [--max-wall-clock <s>] [--stage-timeout <s>]
              [--budget-extra <n>] [--wall-clock-extra <s>] [--run-dir <dir>] [--allow-same-family-qe] [--json]
              (INTERPRET a loop-plan/1 plan host-independently; writes trace/budget/checkpoints under .dz/loop-trace/<runId>/)

EXIT CODES - "workflow run" and "workflow-lint" have DIFFERENT tables, side by side:
  run   0 completed | 1 failed (named reason) | 2 usage/invalid plan | 75 typed pause (sysexits EX_TEMPFAIL)
  lint  0 clean     | 1 findings              | 3 inconclusive
  75 is NOT 3: 3 reads ignorable and collides with lint's inconclusive, while a pause strands resumable work.
  On a pause the LAST stdout line is a "wf-pause-envelope/1" JSON object; a FAILURE emits none, so a wrapper
  tells the two apart from stdout + exit code alone, without parsing prose.

Workflows: author loop-plan/1 plans with dz workflow init/validate/render; gate them with dz workflow-lint; read runs with dz workflow-trace (the ADR-005 templates are retired)

Targets: ${TARGET_NAMES.join(', ')}
Presets: ${PRESET_NAMES.join(', ')}`;
/** Parse `<command> [--key value] [--flag]` argv. */
function parseArgs(argv) {
    const options = new Map();
    const optionLists = new Map();
    const flags = new Set();
    const positional = [];
    // The command decides `--force`'s arity (valued only under `dz guard`); it is always the first
    // token when present — a leading `--flag` means there is no command at all.
    const command = (argv[0] ?? '').startsWith('--') ? '' : argv[0] ?? '';
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index] ?? '';
        // A token that BEGINS with -- but contains whitespace cannot be a flag — no real flag carries a
        // space (values arrive as separate argv tokens). It is quoted TEXT that happens to open with
        // dashes: `dz backlog add "--semantic идея…"` was rejected twice with «an idea text is
        // required» while the text sat right there, eaten as an option (f18fc89e).
        if (arg.startsWith('--') && !/\s/.test(arg)) {
            const key = arg.slice(2);
            // A DECLARED boolean flag never swallows the next token (backlog 247ddcfa: `dz sync
            // --dry-run .` used to disarm the safety flag silently and then WRITE). The declaration is
            // data with a two-way drift test — see src/boolean-flags.ts.
            if (isBooleanFlag(key, command)) {
                flags.add(key);
                continue;
            }
            const next = argv[index + 1];
            if (next !== undefined && !next.startsWith('--')) {
                options.set(key, next);
                const list = optionLists.get(key) ?? [];
                list.push(next);
                optionLists.set(key, list);
                index += 1;
            }
            else {
                flags.add(key);
            }
        }
        else {
            positional.push(arg);
        }
    }
    // Store extra positional args as _positional_0, _positional_1, ...
    for (let pi = 1; pi < positional.length; pi += 1) {
        options.set(`_positional_${pi - 1}`, positional[pi] ?? '');
    }
    return { command: positional[0] ?? '', options, optionLists, flags };
}
/**
 * Discover skill source directories: explicit `--skills-dir` if given, else
 * `.claude/skills` + every `skills-*` pack found across all `@dzhechkov` base dirs —
 * monorepo `packages/@dzhechkov`, project-local `node_modules/@dzhechkov`, **and** the
 * CLI's own install location (see {@link discoverSkillPackDirs}). The self-location scan
 * is what makes a globally-installed `dz` find its bundled packs when run in a project
 * that does not itself depend on them. Shared by `installSkills` and `bundle`.
 */
function discoverSkillsDirs(cwd, explicitSkillsDir) {
    if (explicitSkillsDir !== undefined)
        return [resolve(cwd, explicitSkillsDir)];
    const skillsDirs = [];
    const defaultDir = resolve(cwd, '.claude/skills');
    if (existsSync(defaultDir))
        skillsDirs.push(defaultDir);
    for (const { dir } of discoverSkillPackDirs(cwd)) {
        if (!skillsDirs.includes(dir))
            skillsDirs.push(dir);
    }
    if (skillsDirs.length === 0)
        skillsDirs.push(defaultDir);
    return skillsDirs;
}
/**
 * Discover skill directories (explicit > `.claude/skills` > `node_modules/@dzhechkov/skills-*`
 * > `packages/@dzhechkov/skills-*`) and compile the requested skills to `target` across all of
 * them. Shared by `dz init` and `dz setup` so both install identically.
 */
async function installSkills(opts) {
    const { target, projectRoot, cwd, explicitSkillsDir, select, force, enrich } = opts;
    const skillsDirs = discoverSkillsDirs(cwd, explicitSkillsDir);
    // PREFLIGHT (backlog 9d15b9b6, PR-A) — resolve the REQUEST once, before anything is written.
    //
    // Two defects lived in asking each root independently instead of resolving the request: a skill
    // present in two roots was installed TWICE and counted twice (the field report's `2 skill(s)` was
    // one skill installed twice), and a skill present in NO root produced a warning and exit 0 —
    // `0 skill(s)` reading as success. Both are gone once the decision happens here.
    //
    // Placement is load-bearing: an exit 1 that arrives after hooks and memory are written leaves a
    // half-configured project, which is worse than either clean outcome. This runs before the loop
    // below and before every target adapter.
    //
    // Dependency closure is deliberately NOT resolved here — that is PR-B. This preflight fixes the
    // count and the exit contract, and gives that work a base it can trust.
    if (select !== undefined) {
        const roots = skillsDirs.map((dir) => ({ dir, ids: discoverSkillIds(dir) }));
        const resolution = resolveSelection(select, roots);
        for (const shadow of resolution.shadowed) {
            opts.writeErr?.(`dz: skill '${shadow.id}' is offered by ${shadow.alsoIn.length + 1} roots; ` +
                `installing from ${shadow.chosen} (earlier root wins). Also present in: ${shadow.alsoIn.join(', ')}`);
        }
        const refusal = formatSelectRefusal(resolution, roots);
        if (refusal !== null) {
            return {
                selectRefusal: refusal,
                results: [], dirsSearched: skillsDirs.length, written: 0, skipped: 0,
                missing: [...resolution.missing], failures: [], applyFailures: [], integrations: [],
            };
        }
    }
    // agents-md and gemini are FLATTENING single-file targets: each must aggregate
    // every selected skill from ALL discovered dirs into ONE root file (AGENTS.md /
    // GEMINI.md) in a single merge. A per-dir runInit loop (like the tree targets
    // below) would let a later dir's merge replace an earlier dir's skills — so
    // route them through one aggregation.
    if (target === 'agents-md' || target === 'gemini') {
        const report = target === 'gemini'
            ? runInitGeminiMd({ skillsDirs, projectRoot, ...(select !== undefined ? { select } : {}), ...(opts.noHooks !== undefined ? { noHooks: opts.noHooks } : {}), ...(opts.noIntegrations !== undefined ? { noIntegrations: opts.noIntegrations } : {}) })
            : runInitAgentsMd({ skillsDirs, projectRoot, ...(select !== undefined ? { select } : {}), ...(opts.noHooks !== undefined ? { noHooks: opts.noHooks } : {}), ...(opts.noIntegrations !== undefined ? { noIntegrations: opts.noIntegrations } : {}) });
        const results = report.skills.map((s) => ({
            id: s.id,
            written: s.written.length,
            skipped: s.skipped.length,
        }));
        let written = 0;
        let skipped = 0;
        for (const s of results) {
            written += s.written;
            skipped += s.skipped;
        }
        return { results, dirsSearched: skillsDirs.length, written, skipped, missing: [...report.missing], failures: [...report.failures], applyFailures: [...report.applyFailures], integrations: [...report.integrations], ...(report.integrationDigest !== undefined ? { integrationDigest: report.integrationDigest } : {}) };
    }
    const results = [];
    const failures = [];
    const applyFailures = [];
    let integrations = [];
    let integrationDigest;
    const integrationManifestSources = skillsDirs.flatMap((skillsDir) => {
        const discovered = discoverSkillIds(skillsDir);
        return discovered
            .filter((id) => select === undefined || select.includes(id))
            .map((skillId) => ({ skillId, skillDir: skillsDir }));
    });
    for (const [dirIndex, skillsDir] of skillsDirs.entries()) {
        const r = await runInit({
            target,
            skillsDir,
            projectRoot,
            force,
            enrich,
            ...(select !== undefined ? { select } : {}),
            ...(opts.noHooks !== undefined ? { noHooks: opts.noHooks } : {}),
            ...(dirIndex === 0
                ? {
                    integrationManifestSources,
                    ...(opts.noIntegrations !== undefined ? { noIntegrations: opts.noIntegrations } : {}),
                }
                : { noIntegrations: true }),
            ...(opts.noVerify !== undefined ? { noVerify: opts.noVerify } : {}),
            ...(opts.allowIntegrations !== undefined ? { allowIntegrations: opts.allowIntegrations } : {}),
        });
        for (const skill of r.skills) {
            results.push({ id: skill.id, written: skill.written.length, skipped: skill.skipped.length });
        }
        failures.push(...r.failures);
        applyFailures.push(...r.applyFailures);
        if (r.integrations.some((row) => row.status !== 'not-requested'))
            integrations = [...r.integrations];
        else if (integrations.length === 0)
            integrations = [...r.integrations];
        if (r.integrationDigest !== undefined)
            integrationDigest = r.integrationDigest;
    }
    let written = 0;
    let skipped = 0;
    for (const s of results) {
        written += s.written;
        skipped += s.skipped;
    }
    const installed = new Set(results.map((s) => s.id));
    const missing = select !== undefined ? [...select].filter((id) => !installed.has(id)) : [];
    return { results, dirsSearched: skillsDirs.length, written, skipped, missing, failures, applyFailures, integrations, ...(integrationDigest !== undefined ? { integrationDigest } : {}) };
}
/** Warn about preset/select ids that weren't found in any installed pack. */
function writeMissingSkillsHint(write, missing, presetName) {
    if (missing.length === 0)
        return;
    write(`  ⚠️  ${missing.length} skill(s) not found in any installed pack: ${missing.join(', ')}`);
    const preset = presetName !== undefined ? getPreset(presetName) : undefined;
    if (preset?.toolkit !== undefined) {
        write(`     The '${preset.name}' preset is backed by a standalone toolkit. Install the full set with:`);
        write(`     npx ${preset.toolkit} init`);
    }
    else {
        write(`     Install their packs first (e.g. dz install @dzhechkov/skills-<pack>) or check the ids.`);
    }
}
async function cmdInit(options, flags, cwd, write, writeErr) {
    const targetOpt = options.get('target');
    if (targetOpt === undefined) {
        // A missing `--target` is the same accusation as an unresolvable one, so it takes
        // the same channel: diagnostics on stderr, stdout stays a data channel (ADR-002
        // §Decision 2 / driver D6; fix round 1, QE F2).
        writeErr(`dz init: --target must be one of: ${TARGET_NAMES_SORTED.join(', ')}`);
        return 1;
    }
    const resolution = resolveTargetName(targetOpt);
    if (resolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz init', resolution))
            writeErr(line);
        return 1;
    }
    const target = resolution.target;
    if (resolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz init', targetOpt, target));
    const explicitSkillsDir = options.get('skills-dir');
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const presetName = options.get('preset');
    const selectArg = options.get('select');
    let select;
    if (presetName !== undefined) {
        const preset = getPreset(presetName);
        if (preset === undefined) {
            write(`dz init: --preset must be one of: ${PRESET_NAMES.join(', ')}`);
            return 1;
        }
        select = preset.skills;
    }
    else if (selectArg !== undefined) {
        select = selectArg.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        if (select.length === 0) {
            write('dz init: --select requires comma-separated skill ids');
            return 1;
        }
    }
    // Discover skill directories + install (shared with `dz setup`).
    const r = await installSkills({
        target,
        projectRoot,
        cwd,
        explicitSkillsDir,
        select,
        writeErr,
        force: flags.has('force'),
        enrich: flags.has('enrich'),
        noHooks: flags.has('no-hooks'),
        noIntegrations: flags.has('no-integrations'),
        noVerify: flags.has('no-verify'),
        ...(options.get('allow-integrations') !== undefined ? { allowIntegrations: options.get('allow-integrations') } : {}),
    });
    // PR-A: an explicit --select that named a skill no root provides is a REFUSAL, not a warning.
    // Printed and returned here, before any target adapter runs — nothing has been written yet.
    if (r.selectRefusal !== undefined) {
        writeErr(r.selectRefusal);
        return 1;
    }
    // Codex keeps its established user-registry writer, but its result is normalized into the same
    // two-outcome contract before JSON/human rendering. A write without a live ready observation is
    // a refusal with applied=true, never a second success channel.
    let integrationOutcomes = r.integrations;
    let codexHooksOk = true;
    if (target === 'codex' && !flags.has('no-hooks')) {
        const delivery = deliverCodexHooks({ project: projectRoot, verify: !flags.has('no-verify') }, undefined, 'dz init');
        codexHooksOk = delivery.ok;
        for (const line of delivery.stdout)
            write(line);
        for (const line of delivery.stderr)
            writeErr(line);
        const hookIndex = integrationOutcomes.findIndex((row) => row.component === 'hooks' && row.status !== 'not-requested');
        if (hookIndex !== -1) {
            const hook = normalizeCodexHookOutcome(integrationOutcomes[hookIndex], delivery, flags.has('no-verify'));
            integrationOutcomes = integrationOutcomes.map((row, index) => index === hookIndex ? hook : row);
        }
    }
    if (flags.has('json')) {
        write(JSON.stringify({ target, skills: { count: r.results.length, written: r.written, skipped: r.skipped }, integrations: integrationOutcomes, integrationDigest: r.integrationDigest ?? null }));
    }
    else {
        write(`dz init --target ${target}: ${r.results.length} skill(s), ${r.written} file(s) written, ${r.skipped} skipped`);
        if (r.dirsSearched > 1)
            write(`  (searched ${r.dirsSearched} skill directories)`);
        for (const outcome of integrationOutcomes) {
            const label = outcome.component === 'mcp' ? 'MCP' : 'Hooks';
            const detail = outcome.status === 'refused'
                ? `${outcome.reasonCode ?? 'LIVE_PROBE_FAILED'}${outcome.remediation ? ` — ${outcome.remediation}` : ''}`
                : outcome.status === 'emitted'
                    ? `${outcome.carrier?.path ?? 'registered'}${outcome.registrations.some((row) => row.approval === 'pending') ? '; Pending approval; ready=false' : ''}`
                    : 'explicitly not requested';
            write(`${label}: ${outcome.status.toUpperCase()} (${detail})`);
        }
    }
    writeMissingSkillsHint(write, r.missing, presetName);
    // Skip-and-collect must not become skip-and-SILENCE: a skill that failed to load is
    // named on stderr and the command exits 1 (it exited 1 before too — by throwing).
    if (r.failures.length > 0 || r.applyFailures.length > 0) {
        // Counts first, then the named block — the same shape `dz list` uses. The block's
        // own header already says "N skipped", so this line carries what it cannot: how many
        // DID install, so a reader can tell a mostly-fine install from a mostly-broken one.
        //
        // The two failure kinds are counted and rendered SEPARATELY (fix round 1, QE F4):
        // an unwritable target directory is not a broken pack, and printing it as one names
        // the wrong file.
        const parts = [`${r.results.length} installed`];
        if (r.failures.length > 0)
            parts.push(`${r.failures.length} skipped`);
        if (r.applyFailures.length > 0)
            parts.push(`${r.applyFailures.length} failed to write`);
        writeErr(`dz init: ${parts.join(', ')}`);
        for (const line of formatSkillLoadFailures(r.failures))
            writeErr(line);
        for (const line of formatSkillApplyFailures(r.applyFailures))
            writeErr(line);
        return 1;
    }
    const integrationOk = !integrationOutcomes.some((row) => row.status === 'refused');
    return codexHooksOk && integrationOk ? 0 : 1;
}
function cmdIntegrationsVerify(options, flags, cwd, write, writeErr) {
    const targetInput = options.get('target');
    const component = options.get('component');
    if (targetInput === undefined || (component !== 'mcp' && component !== 'hooks')) {
        writeErr('dz integrations-verify: requires --target <name> --component <mcp|hooks>');
        return 1;
    }
    const resolution = resolveTargetName(targetInput);
    if (resolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz integrations-verify', resolution))
            writeErr(line);
        return 1;
    }
    if (resolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz integrations-verify', targetInput, resolution.target));
    const result = runIntegrationsVerify({
        target: resolution.target,
        component,
        projectRoot: resolve(cwd, options.get('project') ?? '.'),
    });
    if (flags.has('json'))
        write(JSON.stringify(result));
    else if (result.ok) {
        write(`dz integrations-verify: ${resolution.target}/${component} registered (runtime ${result.runtimeVersion ?? 'unknown'}; ready=${result.registrations.every((row) => row.ready === true)})`);
    }
    else {
        writeErr(`dz integrations-verify: ${resolution.target}/${component} REFUSED (${result.reasonCode ?? 'LIVE_PROBE_FAILED'}) — ${result.remediation ?? 'no qualifying receipt'}`);
    }
    return result.ok ? 0 : 1;
}
async function cmdVerify(options, cwd, write, writeErr) {
    const skillsDir = resolve(cwd, options.get('skills-dir') ?? '.claude/skills');
    const targetOpt = options.get('target');
    let target;
    if (targetOpt !== undefined) {
        const resolution = resolveTargetName(targetOpt);
        if (resolution.kind === 'unknown') {
            for (const line of formatTargetProblem('dz verify', resolution))
                writeErr(line);
            return 1;
        }
        target = resolution.target;
        if (resolution.via === 'alias')
            writeErr(formatTargetAliasNote('dz verify', targetOpt, target));
    }
    const report = await runVerify({
        skillsDir,
        ...(target !== undefined ? { target } : {}),
    });
    write(`dz verify (${report.target}): ${report.valid}/${report.total} skill(s) valid`);
    for (const skill of report.skills) {
        if (!skill.ok)
            write(`  FAIL ${skill.id}: ${skill.errors.join('; ')}`);
    }
    return report.valid === report.total ? 0 : 1;
}
async function cmdSync(options, flags, cwd, write, writeErr) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const canonicalArg = options.get('canonical');
    // Auto-discover all skills-* packs, or use explicit --canonical
    let canonicalDirs;
    if (canonicalArg !== undefined) {
        const dir = resolve(cwd, canonicalArg);
        if (!existsSync(dir)) {
            // MEASURED 2026-08-24: a TYPO here used to print `0/0 in sync` and exit 0 — green exactly
            // when nothing was compared, and in CI that reads as "all skills healthy". An explicit path
            // that does not exist is an answer about the INVOCATION, not about the skills.
            write(`dz sync: --canonical ${dir} does not exist — nothing was compared, and nothing-compared is not a clean sync`);
            return 3;
        }
        canonicalDirs = [dir];
    }
    else {
        const baseDir = join(projectRoot, 'packages', '@dzhechkov');
        canonicalDirs = existsSync(baseDir)
            ? readdirSync(baseDir, { withFileTypes: true })
                .filter((e) => e.isDirectory() && e.name.startsWith('skills-'))
                .map((e) => join(baseDir, e.name))
            : [resolve(cwd, 'packages/@dzhechkov/skills-meta')];
    }
    const report = await runSync({
        canonicalDirs,
        projectRoot,
        dryRun: flags.has('dry-run'),
        force: flags.has('force'),
    });
    const { total, inSync, missing, drift } = report.summary;
    // The DONE half, beside the SEEN half: a run that wrote its fixes used to print only what it had
    // seen before writing, and exit 1 — "returns 0 when it did nothing and 1 when it worked". Status
    // counts describe the tree as found; `wrote` describes what this run changed about it.
    const wrote = report.skills.filter((skill) => skill.written.length > 0);
    write(`dz sync${report.dryRun ? ' --dry-run' : ''}: ${inSync}/${total} in sync, ${missing} missing, ${drift} drift${wrote.length > 0 ? ` — wrote ${wrote.length} skill(s)` : ''}`);
    if (total === 0) {
        // Nothing was compared. Exit 3, the house not-established convention (`dz workflow-lint`,
        // `check-plan-completeness`) — never 0: a gate that is green when it never ran is the defect
        // this repo keeps finding elsewhere (the publish gate, the scout 401, the recall log).
        write(`dz sync: 0 canonical skill(s) found under ${canonicalDirs.join(', ')} — nothing was compared, and nothing-compared is not a clean sync`);
        return 3;
    }
    // Skip-and-collect (D1): the broken canonical skills are NAMED on stderr, and their
    // presence keeps the exit code non-zero — a partial sync is not a clean sync.
    if (report.failures.length > 0) {
        // See `cmdInit` above: counts here, names in the block below.
        writeErr(`dz sync: ${report.skills.length} compared, ${report.failures.length} skipped`);
        for (const line of formatSkillLoadFailures(report.failures))
            writeErr(line);
        return 1;
    }
    // The exit reflects the OUTCOME: a missing/drift skill this run wrote is resolved, not pending.
    // A dry run writes nothing, so its exit keeps the CI meaning — 1 whenever work exists.
    const unresolved = report.skills.filter((skill) => skill.status !== 'in-sync' && skill.written.length === 0);
    return unresolved.length === 0 ? 0 : 1;
}
function cmdCreateSkill(options, flags, cwd, write) {
    const name = options.get('name');
    if (!name) {
        write('dz create-skill: --name is required (kebab-case skill id)');
        return 1;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
        write(`dz create-skill: name "${name}" must be kebab-case (e.g., my-new-skill)`);
        return 1;
    }
    const description = options.get('description') ?? `${name} — a new agent skill.`;
    const skillsDir = resolve(cwd, options.get('skills-dir') ?? '.claude/skills');
    const trustTier = parseInt(options.get('tier') ?? '1', 10);
    const result = createSkill({
        name,
        description,
        skillsDir,
        trustTier: isNaN(trustTier) ? 1 : trustTier,
        withEvals: !flags.has('no-evals'),
        withReferences: flags.has('with-references'),
        bto: flags.has('bto'),
    });
    if (result.alreadyExists) {
        write(`dz create-skill: skill "${name}" already exists at ${result.skillDir}`);
        return 1;
    }
    write(`Created skill "${name}" at ${result.skillDir}:`);
    for (const file of result.filesCreated) {
        write(`  ${file}`);
    }
    write(`\nNext steps:`);
    write(`  1. Edit ${result.skillDir}/SKILL.md — fill in protocol and description`);
    write(`  2. dz verify --skills-dir ${skillsDir} — validate structure`);
    write(`  3. dz init --target claude-code --select ${name} — install`);
    if (flags.has('bto')) {
        write(`  4. /bto-test ${result.skillDir} — run BTO 3-layer evaluation`);
    }
    return 0;
}
/**
 * `dz list` — skip-and-collect (feature dz-cli-defects, D1).
 *
 * One unparseable `SKILL.md` used to discard the ENTIRE listing with a message naming
 * neither the file nor the count. Now the parseable skills list on stdout and the
 * broken ones are named on stderr. The whole emit contract, in one place:
 *
 * | valid | skipped | stdout | stderr | exit |
 * |-------|---------|--------|--------|------|
 * | >0    | 0       | listing | *empty* | 0 |
 * | >0    | >0      | listing of the valid ones | named summary | 1 |
 * | 0     | >0      | *nothing* | named summary | 1 |
 * | 0     | 0       | *nothing* | `no skills found in <dir>` | 1 |
 *
 * The last row is the ONE intentional departure from byte-identical output: that line
 * used to go to stdout. Moving it keeps *stdout is data, stderr is diagnosis* whole —
 * the invariant that makes `dz list > out.txt` trustworthy.
 */
function cmdList(options, cwd, write, writeErr) {
    const skillsDir = resolve(cwd, options.get('skills-dir') ?? '.claude/skills');
    const { skills, failures } = listSkillsDetailed(skillsDir);
    if (skills.length === 0 && failures.length === 0) {
        writeErr(`dz list: no skills found in ${skillsDir}`);
        return 1;
    }
    if (skills.length > 0) {
        write(`${skills.length} skill(s) in ${skillsDir}:\n`);
        for (const skill of skills) {
            const desc = skill.description.length > 80 ? skill.description.slice(0, 77) + '...' : skill.description;
            write(`  ${skill.id.padEnd(35)} ${desc}`);
        }
    }
    if (failures.length === 0)
        return 0;
    writeErr(`dz list: ${skills.length} listed, ${failures.length} skipped in ${skillsDir}`);
    for (const line of formatSkillLoadFailures(failures))
        writeErr(line);
    return 1;
}
function cmdInfo(options, args, cwd, write) {
    const skillsDir = resolve(cwd, options.get('skills-dir') ?? '.claude/skills');
    // Skill id: --id / --skill, or the first positional after `info`
    // (parseArgs stores it as _positional_0). The documented form is `dz info <skill-id>`.
    const id = options.get('id') ?? options.get('skill') ?? args.options.get('_positional_0') ?? '';
    if (id === '') {
        write('dz info: specify a skill id — dz info <skill-id>');
        return 1;
    }
    const info = getSkillInfo(skillsDir, id);
    if (info === undefined) {
        write(`dz info: skill ${JSON.stringify(id)} not found in ${skillsDir}`);
        return 1;
    }
    write(`Skill: ${info.id}`);
    write(`Name: ${info.name ?? info.id}`);
    write(`Description: ${info.description}`);
    if (info.trustTier !== undefined)
        write(`Trust Tier: ${info.trustTier}`);
    if (info.version !== undefined)
        write(`Version: ${info.version}`);
    write(`Assets: ${info.assetCount} file(s)`);
    if (info.assetCount > 0) {
        for (const path of info.assetPaths)
            write(`  ${path}`);
    }
    return 0;
}
async function cmdScout(options, flags, cwd, write) {
    const topicsArg = options.get('topics');
    const since = options.get('since');
    const outputFile = options.get('output');
    const deep = flags.has('deep');
    const showReport = flags.has('report');
    const showDiff = flags.has('diff');
    const token = process.env['GITHUB_TOKEN'];
    const memory = new ScoutMemory();
    // --report: show last saved report (offline, no network)
    if (showReport) {
        const saved = memory.loadReport();
        if (!saved) {
            write('dz scout: no saved report. Run `dz scout` first.');
            return 1;
        }
        write(saved.markdown);
        write(`\n(Saved report from ${saved.generatedAt}, ${saved.repos.length} repos)`);
        return 0;
    }
    if (!token) {
        write('dz scout: set GITHUB_TOKEN env var for higher rate limits (5000 req/hr vs 60)');
    }
    write('Scanning 9 sources (GitHub + npm + HN + MCP Registry + Glama + OSSInsight + Smithery + Semantic Scholar + arXiv)...\n');
    try {
        const scanTopics = topicsArg ? topicsArg.split(',').map((t) => t.trim()) : undefined;
        const { results: repos, totalBySource } = await scanAllSources({
            token,
            topics: scanTopics,
            since,
            maxResults: 50,
        });
        // Source provenance summary
        const sourceLines = Object.entries(totalBySource)
            .filter(([, count]) => count > 0)
            .map(([src, count]) => `${src}: ${count}`)
            .join(', ');
        write(`Sources: ${sourceLines}`);
        // Memory: diff with previous scan
        if (showDiff || memory.size > 0) {
            const diff = memory.diff(repos);
            if (diff.newRepos.length > 0 || diff.goneRepos.length > 0 || diff.changedScore.length > 0) {
                write(memory.diffMarkdown(diff));
            }
            else if (memory.size > 0) {
                write(`\nNo changes since last scan (${memory.size} repos tracked).\n`);
            }
        }
        // Memory: ingest + save — each repo is a TaggedProfile carrying its own
        // `source` provenance, which ingest() now records (no more 'unknown').
        const newCount = memory.ingest(repos);
        write(`Memory: ${memory.size} total tracked, ${newCount} new this scan.\n`);
        const report = generateReport({
            repos,
            totalFound: repos.length,
            newSinceLastScan: newCount,
            scannedAt: new Date().toISOString(),
            topics: scanTopics ?? ['github', 'npm', 'hackernews', 'mcp-registry', 'glama'],
        });
        write(report.markdown);
        // Save report for --report offline access
        memory.saveReport(report);
        let fullMarkdown = report.markdown;
        let deepReport;
        if (deep) {
            write('\nRunning deep analysis on top-scored repos...\n');
            deepReport = await deepAnalyze(repos, { token });
            write(deepReport.markdown);
            write(`\nDeep analysis: ${deepReport.analyses.length} repos analyzed, ${deepReport.gaps.length} gaps identified.`);
            fullMarkdown += '\n' + deepReport.markdown;
        }
        // Save to file if --output specified. Format is chosen by extension:
        // *.json → structured JSON (summary + repos + deep analyses/gaps); anything else → markdown.
        if (outputFile) {
            const outPath = resolve(cwd, outputFile);
            mkdirSync(dirname(outPath), { recursive: true });
            if (outPath.toLowerCase().endsWith('.json')) {
                const jsonReport = {
                    generatedAt: report.generatedAt,
                    summary: report.summary,
                    repos: report.repos,
                    ...(deepReport ? { deep: { analyses: deepReport.analyses, gaps: deepReport.gaps } } : {}),
                };
                writeFileSync(outPath, JSON.stringify(jsonReport, null, 2) + '\n');
            }
            else {
                writeFileSync(outPath, fullMarkdown);
            }
            write(`\nReport saved to: ${outPath}`);
        }
        return 0;
    }
    catch (error) {
        write(`dz scout: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}
/** Scaffold plans for `dz workflow init` — one per pattern (each validates + renders lint-clean:
 * the ADR-002 property "the generator cannot emit a script its own lint rejects" is enforced by
 * workflow-init-lint-clean.test.ts, not convention). */
function workflowInitPlan(name, pattern) {
    const base = {
        schema: 'loop-plan/1',
        name,
        description: `TODO: describe the ${name} loop`, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
        whenToUse: `TODO: when to invoke ${name}`, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
        checkpointing: { enabled: false },
        subsystems: { checkpoints: false, trainingPairs: false, usageAdaptive: false, challengePanel: false, codexDispatch: false },
        trace: { emit: true },
    };
    if (pattern === 'pipeline') {
        return {
            ...base,
            steps: [
                { stepId: 'fan', kind: 'fanout', phase: 'Work', concurrency: 'pipeline', budget: { maxAgents: 8 } },
                { stepId: 'a', kind: 'agent', phase: 'Work', prompt: 'TODO: stage A per item', budget: { maxAgents: 4 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
                { stepId: 'b', kind: 'agent', phase: 'Work', prompt: 'TODO: stage B per item', budget: { maxAgents: 4 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
                { stepId: 'jn', kind: 'join', phase: 'Work', deps: ['fan'] },
            ],
            fanouts: [{ stage: 'fan', registry: ['item1', 'item2', 'item3'], maxFanout: 3, chain: ['a', 'b'] }],
            joins: [{ stage: 'jn', forStage: 'fan', joinPolicy: 'all-activated', onInvalid: 'named-failure' }],
        };
    }
    if (pattern === 'fanout' || pattern === 'barrier') {
        return {
            ...base,
            steps: [
                { stepId: 'fan', kind: 'fanout', phase: 'Lanes', concurrency: 'barrier', budget: { maxAgents: 6 } },
                { stepId: 'lane', kind: 'agent', phase: 'Lanes', prompt: 'TODO: one lane', budget: { maxAgents: 6 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
                { stepId: 'jn', kind: 'join', phase: 'Lanes', deps: ['fan'] },
                // the consumer hangs off the BARRIER (jn), never the fork — barrier-postdominates teaches this
                { stepId: 'synthesize', kind: 'agent', phase: 'Synthesize', deps: ['jn'], prompt: 'TODO: synthesize across lanes', budget: { maxAgents: 1 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
            ],
            fanouts: [{ stage: 'fan', registry: ['lane1', 'lane2', 'lane3'], maxFanout: 3, chain: ['lane'] }],
            joins: [{ stage: 'jn', forStage: 'fan', joinPolicy: 'all-activated', onInvalid: 'named-failure' }],
        };
    }
    if (pattern === 'gate') {
        return {
            ...base,
            steps: [
                { stepId: 'work', kind: 'agent', phase: 'Work', prompt: 'TODO: produce the artifact', budget: { maxAgents: 2 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
                { stepId: 'gate', kind: 'gate', phase: 'Gate', deps: ['work'], prompt: 'TODO: gate check (parse the verdict, never synthesize one)', budget: { maxAgents: 1 }, tools: [] }, // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
            ],
            gates: [{ stepId: 'gate', kind: 'parse-verdict', failRoute: 'work', maxRedos: 1 }],
        };
    }
    // minimal default: one agent step
    return {
        ...base,
        steps: [{ stepId: 'main', kind: 'agent', phase: 'Work', prompt: 'TODO: the one step', budget: { maxAgents: 1 }, tools: [] }], // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
    };
}
/**
 * `dz workflow` — the loop-designer authoring verbs (ADR-002; the ADR-005 template emitter is
 * RETIRED — AM-6). Subverbs: init | validate | render | blobs. Any other invocation (including
 * every legacy `--task <name>` / `--name <name>` / bare positional template spelling) prints the
 * pinned retirement message and exits 1 — no legacy format is silently reachable.
 */
function cmdWorkflow(options, flags, cwd, write) {
    const sub = options.get('_positional_0') ?? '';
    const legacyTask = options.get('task') ?? options.get('name');
    if (sub === 'init') {
        const name = options.get('name') ?? options.get('_positional_1') ?? 'my-loop';
        const pattern = options.get('pattern') ?? 'pipeline';
        const outPath = resolve(cwd, options.get('o') ?? options.get('out') ?? `${name}.plan.json`);
        const planObj = workflowInitPlan(name, pattern);
        const parsed = parsePlan(planObj);
        if (isParseErrors(parsed)) {
            write(`dz workflow init: internal scaffold error — ${parsed.map((e) => e.message).join('; ')}`);
            return 1;
        }
        const diags = validatePlan(parsed);
        if (diags.length > 0) {
            write(`dz workflow init: internal scaffold failed validation — ${diags.map((d) => `${d.invariant} ${d.message}`).join('; ')}`);
            return 1;
        }
        writeFileSync(outPath, JSON.stringify(normalizePlan(parsed), null, 2) + '\n');
        write(`dz workflow init: wrote ${outPath} (pattern: ${pattern})`);
        write('Next: edit the TODO prompts, then `dz workflow validate` + `dz workflow render`.'); // no-stubs: workflow-init scaffold sentinel the author replaces (deliberate authoring cue, not unfinished code)
        return 0;
    }
    if (sub === 'validate') {
        const planPath = options.get('_positional_1') ?? options.get('plan') ?? '';
        if (planPath === '') {
            write('dz workflow validate: usage — dz workflow validate <plan.json> [--json]');
            return 1;
        }
        const abs = resolve(cwd, planPath);
        if (!existsSync(abs)) {
            write(`dz workflow validate: no such plan file: ${abs}`);
            return 1;
        }
        let raw;
        try {
            raw = JSON.parse(readFileSync(abs, 'utf8'));
        }
        catch (e) {
            write(`dz workflow validate: unparseable JSON — ${e instanceof Error ? e.message : String(e)}`);
            return 1;
        }
        const parsed = parsePlan(raw);
        if (isParseErrors(parsed)) {
            if (flags.has('json'))
                write(JSON.stringify({ ok: false, parseErrors: parsed }, null, 2));
            else
                for (const e of parsed)
                    write(`PARSE ${e.path}: ${e.message}`);
            return 1;
        }
        const diags = validatePlan(parsed);
        if (flags.has('json')) {
            write(JSON.stringify({ ok: diags.length === 0, digest: planDigest(parsed), diagnostics: diags }, null, 2));
        }
        else {
            for (const d of diags)
                write(`${d.invariant} ${d.path}: ${d.message}`);
            write(diags.length === 0 ? `dz workflow validate: OK (digest sha256:${planDigest(parsed).slice(0, 16)}…)` : `dz workflow validate: ${diags.length} invariant violation(s)`);
        }
        return diags.length === 0 ? 0 : 1;
    }
    if (sub === 'render') {
        const planPath = options.get('_positional_1') ?? options.get('plan') ?? '';
        const outPath = options.get('o') ?? options.get('out') ?? '';
        if (planPath === '' || outPath === '') {
            write('dz workflow render: usage — dz workflow render <plan.json> -o <script.js> [--check] [--force]');
            return 1;
        }
        const absPlan = resolve(cwd, planPath);
        if (!existsSync(absPlan)) {
            write(`dz workflow render: no such plan file: ${absPlan}`);
            return 1;
        }
        const parsed = parsePlan(JSON.parse(readFileSync(absPlan, 'utf8')));
        if (isParseErrors(parsed)) {
            for (const e of parsed)
                write(`PARSE ${e.path}: ${e.message}`);
            return 1;
        }
        const diags = validatePlan(parsed);
        if (diags.length > 0) {
            for (const d of diags)
                write(`${d.invariant} ${d.path}: ${d.message}`);
            write('dz workflow render: refusing to render an invalid plan');
            return 1;
        }
        const rendered = renderPlan(parsed);
        const absOut = resolve(cwd, outPath);
        const sidecar = absOut.replace(/\.js$/, '') + '.plan.json';
        const prev = existsSync(absOut) ? readFileSync(absOut, 'utf8') : '';
        const merged = prev === '' ? { text: rendered.text, conflicts: [], refused: false } : mergeRender(prev, rendered, { force: flags.has('force') });
        if (flags.has('check')) {
            const same = prev === merged.text && !merged.refused;
            write(same ? 'dz workflow render --check: up to date' : 'dz workflow render --check: DRIFT — a fresh render differs from the file on disk');
            return same ? 0 : 1;
        }
        if (merged.refused) {
            const proposed = absOut + '.proposed.js';
            writeFileSync(proposed, merged.proposedText ?? rendered.text);
            write(`dz workflow render: ${absOut} carries NO region markers (hand-written loop) — REFUSING to overwrite.`);
            write(`Proposed render written to ${proposed}; re-run with --force to replace the target.`);
            return 1;
        }
        // sidecar plan FIRST, independently of the script (FR-4.1 — the oracle diffs against it)
        writeFileSync(sidecar, rendered.planJson);
        writeFileSync(absOut, merged.text);
        for (const c of merged.conflicts)
            write(`CONFLICT step ${c.stepId}: ${c.reason}`);
        write(`dz workflow render: wrote ${sidecar} then ${absOut} (exec-fp sha256:${rendered.execFingerprint.slice(0, 16)}…, blobs: ${rendered.manifest.blobs.map((b) => b.name).join(', ') || 'none'})`);
        write('Gate it: dz workflow-lint ' + outPath + ' --plan ' + sidecar + ' --require-plan');
        return merged.conflicts.length > 0 ? 1 : 0;
    }
    if (sub === 'blobs') {
        let bad = 0;
        for (const b of Object.values(LOOP_BLOBS)) {
            const actual = createHash('sha256').update(b.code, 'utf8').digest('hex');
            const ok = actual === b.contentHash;
            if (!ok)
                bad++;
            write(`${b.name}@${b.version} sha256:${b.contentHash.slice(0, 16)}… ${ok ? 'OK' : 'HASH MISMATCH (loop-blobs.generated.ts was hand-edited — regenerate: node scripts/gen-loop-blobs.mjs)'} (requires: [${b.requires.join(', ')}])`);
        }
        if (flags.has('check')) {
            write(bad === 0 ? 'dz workflow blobs --check: registry self-consistent (authoritative canon-vs-committed diff runs in CI via loop-blobs-regen.test.ts / scripts/gen-loop-blobs.mjs --check)' : `dz workflow blobs --check: ${bad} blob(s) inconsistent`);
            return bad === 0 ? 0 : 1;
        }
        return 0;
    }
    // Everything else — the retired ADR-005 surface, BOTH spellings (bare positional task name and
    // --task/--name) — prints the pinned shim message. AM-6: never silently reachable.
    void legacyTask;
    void flags;
    write(WORKFLOW_TEMPLATES_RETIRED_MESSAGE);
    return 1;
}
/** `dz workflow-lint` — layer-1 gate; exit 0/1/3 (pass/fail/inconclusive — INV-13: inconclusive is
 * never a pass; the exit convention mirrors consult-gate). */
function cmdWorkflowLint(options, flags, cwd, write) {
    const scriptPath = options.get('_positional_0') ?? '';
    if (scriptPath === '') {
        write('dz workflow-lint: usage — dz workflow-lint <script.js> [--plan <plan.json>] [--require-plan|--legacy] [--json]');
        return 1;
    }
    const absScript = resolve(cwd, scriptPath);
    if (!existsSync(absScript)) {
        write(`dz workflow-lint: no such script: ${absScript}`);
        return 1;
    }
    const scriptText = readFileSync(absScript, 'utf8');
    const planPath = options.get('plan');
    let plan = null;
    let digestValue = null;
    if (planPath !== undefined) {
        const absPlan = resolve(cwd, planPath);
        if (!existsSync(absPlan)) {
            write(`dz workflow-lint: no such plan: ${absPlan}`);
            return 1;
        }
        const parsed = parsePlan(JSON.parse(readFileSync(absPlan, 'utf8')));
        if (isParseErrors(parsed)) {
            for (const e of parsed)
                write(`PARSE ${e.path}: ${e.message}`);
            return 1;
        }
        plan = parsed;
        digestValue = planDigest(parsed);
    }
    const mode = flags.has('require-plan') ? 'require-plan' : flags.has('legacy') ? 'legacy' : 'default';
    const run = lint(scriptText, { plan, planDigestValue: digestValue, blobRegistry: LOOP_BLOBS, mode });
    if (flags.has('json')) {
        write(JSON.stringify(run, null, 2));
    }
    else {
        for (const f of run.findings) {
            write(`${f.severity.toUpperCase().padEnd(12)} ${f.rule}: ${f.message}${f.anchor ? ` [anchor: ${f.anchor}]` : ''}`);
        }
        const counts = { fail: 0, warn: 0, inconclusive: 0 };
        for (const f of run.findings)
            if (f.severity in counts)
                counts[f.severity]++;
        write(`dz workflow-lint: ${run.verdict.toUpperCase()} (mode=${run.mode}; ${counts.fail} fail, ${counts.warn} warn, ${counts.inconclusive} inconclusive over ${Object.keys(run.rules).length} rules)`);
        if (run.verdict === 'inconclusive')
            write('inconclusive is NOT a pass (exit 3) — bind a plan (--plan … --require-plan) or acknowledge a legacy script with --legacy');
    }
    return lintExitCode(run);
}
/** `dz workflow-trace` — timeline + invariant runner over a run's trace.jsonl. Scope is CAPPED
 * (AM-8): <runDir|--slug|--run>, --invariants, --html, --json. NO watch/filter/compare/search/
 * retention/access-control — adding one needs an ADR amendment (the surface test pins this). */
/**
 * This CLI's OWN semver, read from its package.json. `unknown` is honest; a throw is not, and an
 * invented number is worse than either — a downstream version guard that is handed a fabricated
 * version happily calls a binary it should have refused.
 */
function dzOwnVersion() {
    try {
        const req = createRequire(import.meta.url);
        const pkg = req('../package.json');
        return typeof pkg.version === 'string' ? pkg.version : 'unknown';
    }
    catch {
        return 'unknown';
    }
}
/** The tool version stamped into a bundle's provenance. Unknown is honest; a throw is not. */
function traceBundleToolVersion() {
    return dzOwnVersion();
}
/** Resolve a run the SAME three ways the timeline reader does — positional, --slug, --run — so a
 * bundle can never address a run by a scheme the rest of the command does not understand. */
function resolveTraceRun(options, cwd, positional) {
    const slug = options.get('slug');
    const runId = options.get('run');
    if (positional !== undefined && positional !== '') {
        return { runDir: resolve(cwd, positional), slug: slug ?? null, runId: runId ?? null };
    }
    if (slug !== undefined)
        return { runDir: resolve(cwd, 'features', slug), slug, runId: runId ?? null };
    if (runId !== undefined)
        return { runDir: resolve(cwd, '.dz', 'loop-trace', runId), slug: slug ?? null, runId };
    return null;
}
/** Every harness workflow record under the project, already parsed. An unparseable file is SKIPPED
 * here rather than guessed at — the pure half answers `unreadable` from what it is handed. */
function readHarnessRecords(cwd) {
    const out = [];
    const base = join(cwd, 'roam', 'claude-state');
    if (!existsSync(base))
        return out;
    let sessions = [];
    try {
        sessions = readdirSync(base);
    }
    catch {
        return out;
    }
    for (const session of sessions) {
        const dir = join(base, session, 'workflows');
        if (!existsSync(dir))
            continue;
        let names = [];
        try {
            names = readdirSync(dir);
        }
        catch {
            continue;
        }
        for (const name of names) {
            if (!name.endsWith('.json'))
                continue;
            try {
                out.push(JSON.parse(readFileSync(join(dir, name), 'utf-8')));
            }
            catch { /* skipped, never guessed */ }
        }
    }
    return out;
}
/** `dz workflow-trace export` — one run's telemetry as ONE movable file. */
function cmdWorkflowTraceExport(options, flags, cwd, write) {
    const out = options.get('o') ?? options.get('out');
    const run = resolveTraceRun(options, cwd, options.get('_positional_1'));
    if (run === null || out === undefined || out === '') {
        write('dz workflow-trace export: usage — dz workflow-trace export <runDir|--slug <s>|--run <id>> --o <file> [--include-pairs --yes] [--strict]');
        return 1;
    }
    const wantPairs = flags.has('include-pairs');
    if (wantPairs && !flags.has('yes')) {
        write('dz workflow-trace export: --include-pairs needs --yes — training pairs may carry TARGET-REPO CODE and full prompts, so shipping them off this machine is a second, explicit decision');
        return 1;
    }
    const readSlot = (abs, origin) => existsSync(abs)
        ? { present: true, member: { origin, content: readFileSync(abs, 'utf-8') } }
        : { present: false, reason: `absent on disk at ${origin}` };
    const trace = readSlot(join(run.runDir, 'trace.jsonl'), 'trace.jsonl');
    const checkpoints = readSlot(join(run.runDir, '.fa-state', 'checkpoints.jsonl'), '.fa-state/checkpoints.jsonl');
    const ledgerAbs = join(cwd, TRACE_BUNDLE_LEDGER_PATH);
    // An empty trailing line is not a malformed row — hand the pure half only real lines, or the
    // bundle reports a phantom parse failure on every well-formed ledger (MEASURED on first run).
    const ledgerLines = existsSync(ledgerAbs)
        ? readFileSync(ledgerAbs, 'utf-8').split('\n').filter((line) => line.trim() !== '')
        : null;
    const pairFiles = [];
    if (wantPairs && run.slug !== null) {
        const pairDir = join(cwd, '.dz', 'fa-training', run.slug);
        if (existsSync(pairDir)) {
            for (const name of readdirSync(pairDir)) {
                if (!name.endsWith('.jsonl'))
                    continue;
                pairFiles.push({ origin: `.dz/fa-training/${run.slug}/${name}`, content: readFileSync(join(pairDir, name), 'utf-8') });
            }
        }
    }
    const bundle = buildBundle({
        sourceRoot: cwd,
        runAddress: options.get('_positional_1') ?? (run.slug !== null ? `--slug ${run.slug}` : `--run ${String(run.runId)}`),
        slug: run.slug,
        runId: run.runId,
        toolVersion: traceBundleToolVersion(),
        createdAt: null,
        trace,
        checkpoints,
        ledgerLines,
        ...(ledgerLines === null ? { ledgerReason: `no ledger at ${TRACE_BUNDLE_LEDGER_PATH}` } : {}),
        includePairs: wantPairs,
        pairFiles: wantPairs ? pairFiles : null,
        records: readHarnessRecords(cwd),
    });
    try {
        mkdirSync(dirname(resolve(cwd, out)), { recursive: true });
        writeFileSync(resolve(cwd, out), serializeBundle(bundle));
    }
    catch (err) {
        write(`dz workflow-trace export: could not write ${out} — ${err instanceof Error ? err.message : String(err)}`);
        return 1;
    }
    // Degradation is NAMED, never silent — and exactly one reason is actionable.
    let degraded = 0;
    if (!bundle.trace.present) {
        degraded++;
        write(`dz workflow-trace export: trace absent — ${bundle.trace.reason}`);
    }
    if (!bundle.checkpoints.present) {
        degraded++;
        write(`dz workflow-trace export: checkpoints absent — ${bundle.checkpoints.reason}`);
    }
    if (!bundle.ledger.present) {
        degraded++;
        write(`dz workflow-trace export: ledger absent — ${String(bundle.ledger.reason)}`);
    }
    if (!bundle.runMeta.resolved) {
        degraded++;
        const reason = bundle.runMeta.reason;
        write(reason === 'layout-unrecognised'
            ? 'dz workflow-trace export: runMeta UNRESOLVED (layout-unrecognised) — the harness workflow-record layout CHANGED; update the reader in harness-core/src/trace-bundle.ts. This is the one reason that needs action'
            : `dz workflow-trace export: runMeta unresolved (${reason}) — no action needed, this is history or absence, not a layout change`);
    }
    write(`dz workflow-trace export: wrote ${out} (${bundle.schema}; ledger rows scanned ${bundle.ledger.scanned}, matched ${bundle.ledger.matched}, malformed ${bundle.ledger.malformed})`);
    if (degraded > 0 && flags.has('strict')) {
        write(`dz workflow-trace export: --strict — ${degraded} member(s) degraded, failing closed`);
        return 1;
    }
    return 0;
}
/** `dz workflow-trace import` — reconstruct a run under an explicit root. FAIL-CLOSED. */
function cmdWorkflowTraceImport(options, flags, cwd, write) {
    const file = options.get('_positional_1');
    const into = options.get('into');
    if (file === undefined || file === '' || into === undefined || into === '') {
        write('dz workflow-trace import: usage — dz workflow-trace import <bundle.json> --into <root> [--force] [--with-pairs]');
        return 1;
    }
    const abs = resolve(cwd, file);
    if (!existsSync(abs)) {
        write(`dz workflow-trace import: no such bundle: ${file}`);
        return 1;
    }
    const parsed = parseBundle(readFileSync(abs, 'utf-8'));
    if (!parsed.ok) {
        write(parsed.reason === 'unknown-schema'
            ? `dz workflow-trace import: REFUSED — unknown bundle schema "${parsed.found}"; this dz reads ${TRACE_BUNDLE_SCHEMA}. A future bundle is never best-effort parsed`
            : parsed.reason === 'member-shape'
                ? `dz workflow-trace import: REFUSED — member "${parsed.member}" fails its shape check; a partial import is never left behind`
                : 'dz workflow-trace import: REFUSED — the bundle is not parseable JSON');
        return 1;
    }
    const bundle = parsed.bundle;
    const root = resolve(cwd, into);
    const runDirRel = bundle.provenance.slug !== null ? join('features', bundle.provenance.slug) : join('.dz', 'loop-trace', String(bundle.provenance.runId ?? 'unknown-run'));
    const runDirAbs = join(root, runDirRel);
    let runDirHasContent = false;
    try {
        runDirHasContent = existsSync(runDirAbs) && readdirSync(runDirAbs).length > 0;
    }
    catch {
        runDirHasContent = false;
    }
    let runIdentity = null;
    const metaAbs = join(runDirAbs, TRACE_BUNDLE_RUN_META_FILE);
    if (existsSync(metaAbs)) {
        try {
            const meta = JSON.parse(readFileSync(metaAbs, 'utf-8'));
            runIdentity = {
                slug: typeof meta.slug === 'string' ? meta.slug : null,
                runId: typeof meta.runId === 'string' ? meta.runId : null,
            };
        }
        catch {
            runIdentity = null;
        }
    }
    const plan = planImport(bundle, {
        runDir: runDirRel,
        existingPaths: [],
        runDirHasContent,
        runIdentity,
        force: flags.has('force'),
        withPairs: flags.has('with-pairs'),
        bundleName: basename(abs),
    });
    if (!plan.ok) {
        for (const refusal of plan.refusals)
            write(`dz workflow-trace import: REFUSED ${refusal.path} — ${refusal.reason}`);
        write('dz workflow-trace import: nothing was written');
        return 1;
    }
    let written = 0;
    const failures = [];
    for (const entry of plan.writes) {
        const target = join(root, entry.path);
        try {
            mkdirSync(dirname(target), { recursive: true });
            writeFileSync(target, entry.content);
            written++;
        }
        catch (err) {
            failures.push(`${entry.path} — ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    // Report what ACTUALLY landed, computed from the writes, not from the plan.
    for (const skipped of plan.refusals)
        write(`dz workflow-trace import: skipped ${skipped.path} — ${skipped.reason}`);
    for (const failure of failures)
        write(`dz workflow-trace import: FAILED ${failure}`);
    write(`dz workflow-trace import: wrote ${written} of ${plan.writes.length} member(s) under ${into}`);
    return failures.length > 0 ? 1 : 0;
}
function cmdWorkflowTrace(options, flags, cwd, write) {
    // Two subcommands ride the SAME run addressing as the timeline reader (AM-8 keeps the surface
    // capped; these are bundle transport, not new query verbs).
    const sub = options.get('_positional_0');
    if (sub === 'export')
        return cmdWorkflowTraceExport(options, flags, cwd, write);
    if (sub === 'import')
        return cmdWorkflowTraceImport(options, flags, cwd, write);
    const runDirArg = options.get('_positional_0');
    const slug = options.get('slug');
    const runId = options.get('run');
    let runDir;
    if (runDirArg !== undefined && runDirArg !== '')
        runDir = resolve(cwd, runDirArg);
    else if (slug !== undefined)
        runDir = resolve(cwd, 'features', slug);
    else if (runId !== undefined)
        runDir = resolve(cwd, '.dz', 'loop-trace', runId);
    else {
        write('dz workflow-trace: usage — dz workflow-trace <runDir|--slug <s>|--run <id>> [--invariants <plan.json>] [--html <out.html>] [--json]');
        return 1;
    }
    const traceFile = join(runDir, 'trace.jsonl');
    if (!existsSync(traceFile)) {
        write(`dz workflow-trace: no trace.jsonl under ${runDir} (the loop writes its own trace only when the plan sets trace.emit: true)`);
        return 1;
    }
    const traceText = readFileSync(traceFile, 'utf8');
    const ckptFile = join(runDir, '.fa-state', 'checkpoints.jsonl');
    const ledgerFile = resolve(cwd, '.dz', 'feature-adr', 'run-cost-ledger.jsonl');
    const journalFile = join(runDir, 'journal.jsonl');
    // ── provenance (feature honest-trace-provenance) ──────────────────────────────────────────────
    // The attestation is DERIVED here, from run-state.json — an artifact the sandboxed rendered
    // script cannot write. It is never read out of the trace itself (ADR-001).
    const parsedRun = parseTrace(traceText);
    const runStateFile = join(runDir, 'run-state.json');
    const runStateForAttestation = existsSync(runStateFile)
        ? (() => {
            try {
                return JSON.parse(readFileSync(runStateFile, 'utf8'));
            }
            catch {
                return null; // an unreadable state binds nothing — the reader will say `unknown`
            }
        })()
        : null;
    const attestation = deriveAttestation(parsedRun, runStateForAttestation, {
        sha256: createHash('sha256').update(traceText, 'utf8').digest('hex'),
        lines: traceText.split('\n').filter((l) => l.trim() !== '').length,
    });
    const ATTESTATION_SENTENCE = {
        instrument: 'ATTESTATION instrument — the bytes read match the identifiers, hash and line count asserted by the co-located run-state.json. That is NOT proof that dz historically wrote them, nor that this is the directory it wrote them in.',
        agent: 'ATTESTATION agent — this trace was appended by an AGENT asked to run the flush command, not by an instrument. Treat every verdict below as testimony.',
        unknown: 'ATTESTATION unknown — no binding run-state.json and no emitter declaration. Not instrument; treat as testimony.',
    };
    // ── corroboration (ADR-002, opt-in) ───────────────────────────────────────────────────────────
    // The host's OWN records, for the half they can witness. Directory containment is the ONLY
    // binding available — trace and journal.jsonl share no identifier — and every result says so.
    const corroborateDir = options.get('corroborate');
    let corroboration = null;
    if (corroborateDir !== undefined) {
        const hostDir = resolve(cwd, corroborateDir);
        const jf = join(hostDir, 'journal.jsonl');
        const transcripts = {};
        try {
            for (const f of readdirSync(hostDir)) {
                const m = /^agent-(.+)\.jsonl$/.exec(f);
                if (m)
                    transcripts[m[1]] = readFileSync(join(hostDir, f), 'utf8');
            }
        }
        catch {
            /* an unreadable host dir is INCONCLUSIVE, decided by corroborate() below — never a throw */
        }
        // The trace side, projected: the agent ids the trace claims took part, in seq order. The trace
        // has no agentId of its own, so the invocationId is what we can offer — and that is exactly why
        // the binding is by-directory and the verdict is scoped.
        const claimed = [];
        for (const e of parsedRun.events)
            if (e.event === 'dispatched')
                claimed.push(e.invocationId);
        corroboration = corroborate({ agentIds: claimed }, { journal: existsSync(jf) ? readFileSync(jf, 'utf8') : null, agentTranscripts: transcripts }, hostDir);
    }
    const timeline = assembleTimeline({
        trace: traceText,
        checkpoints: existsSync(ckptFile) ? readFileSync(ckptFile, 'utf8') : null,
        ledger: existsSync(ledgerFile) ? readFileSync(ledgerFile, 'utf8') : null,
        journal: existsSync(journalFile) ? readFileSync(journalFile, 'utf8') : null,
    });
    let verdicts = [];
    let projection = null;
    const invariantsPlan = options.get('invariants');
    if (invariantsPlan !== undefined) {
        const absPlan = resolve(cwd, invariantsPlan);
        if (!existsSync(absPlan)) {
            write(`dz workflow-trace: no such plan: ${absPlan}`);
            return 1;
        }
        const parsed = parsePlan(JSON.parse(readFileSync(absPlan, 'utf8')));
        if (isParseErrors(parsed)) {
            for (const e of parsed)
                write(`PARSE ${e.path}: ${e.message}`);
            return 1;
        }
        projection = toTraceProjection(parsed);
        verdicts = stampAttestation(runInvariants(projection, parsedRun), attestation);
    }
    const htmlOut = options.get('html');
    if (htmlOut !== undefined) {
        const absHtml = resolve(cwd, htmlOut);
        writeFileSync(absHtml, renderTimelineHtml(timeline, projection, verdicts));
        write(`dz workflow-trace: wrote ${absHtml} (self-contained: mermaid topology + HTML waterfall)`);
    }
    if (flags.has('json')) {
        write(JSON.stringify({ timeline, attestation, corroboration, verdicts }, null, 2));
        return verdicts.some((v) => v.status === 'fail') ? 1 : 0;
    }
    write(ATTESTATION_SENTENCE[attestation]);
    if (corroboration !== null) {
        write(`CORROBORATION ${corroboration.verdict} (binding: ${corroboration.binding}, ${corroboration.hostDir}) — ${corroboration.detail}`);
        write(`  witnessed: ${corroboration.witnessed.join(', ')}   NOT witnessed: ${NOT_WITNESSED.join(', ')}`);
    }
    write(`run ${timeline.runId ?? '(unknown)'}${timeline.incomplete ? ' — INCOMPLETE (no run.closed; unflushed tail may be lost)' : ''}; sources: ${timeline.sources.join(', ')}`);
    for (const r of timeline.rows.filter((x) => x.kind === 'trace')) {
        write(`  ${String(r.seq).padStart(5)}  ${r.label}  ${r.detail}${r.wallTime ? `  [wall ${r.wallTime} — diagnostic only]` : ''}`);
    }
    for (const v of verdicts)
        write(`INVARIANT ${v.status.toUpperCase().padEnd(12)} ${v.id}: ${v.message}`);
    return verdicts.some((v) => v.status === 'fail') ? 1 : 0;
}
function cmdMigrate(options, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const report = runMigrate({ projectRoot });
    if (report.detections.length === 0) {
        write('dz migrate: no legacy installations detected.');
    }
    else {
        write(`dz migrate: found ${report.detections.length} legacy installation(s):\n`);
        for (const det of report.detections) {
            write(`  ${det.manifest} — v${det.version}, ${det.components.length} components, ${det.fileCount} files`);
        }
    }
    write(`\nSkills in .claude/skills/: ${report.skillsFound}`);
    write(`\nRecommendation: ${report.recommendation}`);
    return 0;
}
async function cmdDoctor(options, flags, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const report = await runDoctor({ projectRoot });
    write(`dz doctor (${report.node}):`);
    for (const check of report.checks) {
        write(`  [${check.ok ? 'OK' : 'XX'}] ${check.name} - ${check.detail}`);
    }
    // ADR-001 (verify-apply-leg): the consumer-side apply-leg. A TAMPERED pack is fatal; an unsigned
    // pack or a missing trust root is reported. A signature proves the bytes are unmodified — never
    // that the skill is any good.
    const sigFatal = reportPackVerification(projectRoot, options.get('pubkey'), flags.has('require-signing'), write);
    return report.ok && sigFatal === 0 ? 0 : 1;
}
function cmdRoam(options, flags, cwd, write) {
    const apply = flags.has('apply');
    // Find repo root
    let repoRoot;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim();
    }
    catch {
        write('dz roam: not a git repository');
        return 1;
    }
    // The roam archive is its OWN git repository (owner decision 2026-08-20), so `git rev-parse` run
    // from inside it resolves to the archive, not the project. Left unguarded that computes
    // `<repo>/roam/roam/claude-state` and, with --apply, creates a symlink under a fabricated slug.
    // Detect the nested archive by its own shape rather than by its name alone: a directory called
    // `roam` that CONTAINS `claude-state` is the archive, wherever it lives.
    if (basename(repoRoot) === 'roam' && existsSync(join(repoRoot, 'claude-state'))) {
        write('dz roam: this is the roam ARCHIVE, not the project — its git root is its own.');
        write(`  Run from the project root instead: cd ${dirname(repoRoot)} && dz roam`);
        return 1;
    }
    const roamDir = join(repoRoot, 'roam', 'claude-state');
    const claudeProjectsDir = process.env['CLAUDE_PROJECTS_DIR'] ?? join(homedir(), '.claude', 'projects');
    // Slug: replace every : \ / with -
    const slug = options.get('slug') ?? repoRoot.replace(/[:\\/]/g, '-');
    const target = join(claudeProjectsDir, slug);
    write(`repo root : ${repoRoot}`);
    write(`roam dir  : ${roamDir}`);
    write(`slug      : ${slug}`);
    write(`target    : ${target}`);
    write(`mode      : ${apply ? 'APPLY' : 'DRY-RUN'}`);
    write('');
    // Ensure roam dir exists
    if (apply) {
        mkdirSync(roamDir, { recursive: true });
    }
    else {
        write('  would: mkdir -p ' + roamDir);
    }
    // Check current state of target
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
        const current = readlinkSync(target);
        if (current === roamDir) {
            write('  symlink already points at roam dir — nothing to do.');
            return 0;
        }
        write(`WARN: ${target} symlinks elsewhere (${current}). Resolve manually.`);
        return 3;
    }
    // Move existing content
    if (existsSync(target) && lstatSync(target).isDirectory()) {
        const entries = readdirSync(target);
        if (entries.length > 0) {
            write(`  moving ${entries.length} entries from ${target} → ${roamDir}`);
            if (apply) {
                for (const entry of entries) {
                    const dest = join(roamDir, entry);
                    if (existsSync(dest)) {
                        write(`  WARN: ${dest} already exists — skipping`);
                        continue;
                    }
                    renameSync(join(target, entry), dest);
                }
            }
        }
        if (apply) {
            rmdirSync(target);
        }
        else {
            write('  would: rmdir ' + target);
        }
    }
    // Create symlink
    if (apply) {
        mkdirSync(dirname(target), { recursive: true });
        symlinkSync(roamDir, target);
    }
    else {
        write('  would: mkdir -p ' + dirname(target));
        write(`  would: ln -s ${roamDir} ${target}`);
    }
    write('');
    write(`done. (${apply ? 'applied' : 'dry-run'})`);
    return 0;
}
function cmdBundle(options, flags, cwd, write) {
    // Resolve the skill ids — a preset or an explicit --select list.
    const presetName = options.get('preset');
    const selectArg = options.get('select');
    let ids;
    if (presetName !== undefined) {
        const preset = getPreset(presetName);
        if (preset === undefined) {
            write(`dz bundle: --preset must be one of: ${PRESET_NAMES.join(', ')}`);
            return 1;
        }
        ids = [...preset.skills];
    }
    else if (selectArg !== undefined) {
        ids = selectArg.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    }
    if (ids === undefined || ids.length === 0) {
        write('dz bundle: --preset <name> or --select id,id,... required');
        write('  Emits minimal self-contained skill bundles (SKILL.md + references/scripts/assets) for a');
        write('  generic consumer (e.g. a LangGraph app). Example: dz bundle --preset news --out ./out');
        return 1;
    }
    const outRoot = resolve(cwd, options.get('out') ?? '.');
    const skillsDirs = discoverSkillsDirs(cwd, options.get('skills-dir'));
    const r = bundleSkills({ ids, skillsDirs, outRoot, force: flags.has('force') });
    const totalFiles = r.bundled.reduce((n, b) => n + b.written, 0);
    const catalog = `${relative(cwd, outRoot) || '.'}/skills/`;
    write(`dz bundle: ${r.bundled.length} skill(s), ${totalFiles} file(s) written → ${catalog}`);
    for (const b of r.bundled) {
        for (const w of b.warnings)
            write(`  ⚠ ${w}`);
    }
    if (r.missing.length > 0) {
        write(`  ⚠️  ${r.missing.length} skill(s) not found in any skill dir: ${r.missing.join(', ')}`);
        writeMissingSkillsHint(write, r.missing, presetName);
    }
    return 0;
}
async function cmdInstall(options, flags, cwd, write, writeErr, installRunner) {
    const pkg = options.get('_positional_0');
    if (!pkg) {
        write('dz install: package name required (e.g., dz install @dzhechkov/skills-devops)');
        return 1;
    }
    // install-spec-honesty (43a52cf2 + c999786b): resolve the spec to {npmSpec, dirName} BEFORE any
    // npm process runs — the versioned form used to npm-install SUCCESSFULLY (mutating the project's
    // package.json) and then die on an invented node_modules path.
    const specResolution = resolveInstallSpec(pkg, (p) => resolve(cwd, p), {
        isFile: (p) => { try {
            return statSync(p).isFile();
        }
        catch {
            return false;
        } },
        isDir: (p) => { try {
            return statSync(p).isDirectory();
        }
        catch {
            return false;
        } },
        readTarballName: (p) => {
            try {
                const out = execSync(`tar -xzOf ${JSON.stringify(p)} package/package.json`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
                const name = JSON.parse(out).name;
                return typeof name === 'string' && name !== '' ? name : null;
            }
            catch {
                return null;
            }
        },
        readDirName: (p) => {
            try {
                const name = JSON.parse(readFileSync(join(p, 'package.json'), 'utf-8')).name;
                return typeof name === 'string' && name !== '' ? name : null;
            }
            catch {
                return null;
            }
        },
    });
    if (specResolution.kind === 'refused') {
        write(`dz install: ${specResolution.reason}`);
        write(`  ${specResolution.hint}`);
        return 1;
    }
    const targetOpt = options.get('target') ?? 'claude-code';
    const targetResolution = resolveTargetName(targetOpt);
    if (targetResolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz install', targetResolution))
            writeErr(line);
        return 1;
    }
    const target = targetResolution.target;
    if (targetResolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz install', targetOpt, target));
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    // Step 1: npm install the package (installRunner is the CliIo test seam — unset in production)
    write(`Installing ${specResolution.npmSpec}${specResolution.kind === 'name' ? '' : ` (${specResolution.kind} → node_modules/${specResolution.dirName})`}...`);
    const installCmd = `npm install ${JSON.stringify(specResolution.npmSpec)} --save-dev --no-fund --no-audit`;
    try {
        if (installRunner)
            installRunner(installCmd, projectRoot);
        else
            execSync(installCmd, { cwd: projectRoot, stdio: 'pipe', encoding: 'utf-8' });
    }
    catch (err) {
        write(`dz install: npm install failed — ${err instanceof Error ? err.message : String(err)}`);
        return 1;
    }
    // Step 2: Find SKILL.md files in the installed package — under the RESOLVED dir name, never the
    // raw spec (path.join concatenates an absolute segment; a version suffix invents a dir).
    const pkgDir = join(projectRoot, 'node_modules', specResolution.dirName);
    if (!existsSync(pkgDir)) {
        write(`dz install: package not found at ${pkgDir}`);
        return 1;
    }
    // Resolve the package's skills root across the known layouts (flat / npx-template /
    // skills-dir) — feature dz-install-npx-init. Total resolution failure is an ERROR
    // (exit 1), not the old advisory exit 0: a user asking to install skills that were
    // not installed must not see success.
    const roots = resolvePackageSkillRoots(pkgDir);
    if (roots.length === 0) {
        write(`dz install: no SKILL.md found in ${pkg}. Probed: ${PACKAGE_SKILL_LAYOUTS.map((l) => l.rel).join(', ')}.`);
        write(`If this package installs itself, try: npx -y ${pkg} init`);
        return 1;
    }
    const root = roots[0];
    // Step 3: Use dz init with the resolved skills root as source
    const report = await runInit({
        target,
        skillsDir: root.dir,
        projectRoot,
        force: flags.has('force'),
    });
    const totalWritten = report.skills.reduce((sum, s) => sum + s.written.length, 0);
    const totalSkipped = report.skills.reduce((sum, s) => sum + s.skipped.length, 0);
    // Non-flat resolutions are tagged so a mis-resolution is legible in a user's paste;
    // flat output stays byte-identical to the pre-feature behavior (NFR-1 / test T5.6).
    const layoutTag = root.layout === 'flat' ? '' : ` [layout: ${root.layout}]`;
    write(`dz install ${pkg}: ${report.skills.length} skill(s), ${totalWritten} file(s) written, ${totalSkipped} skipped${layoutTag}`);
    for (const skill of report.skills) {
        write(`  ${skill.id}: ${skill.written.length} written, ${skill.skipped.length} skipped`);
    }
    if (root.layout === 'npx-template' && root.hasCompanionAssets) {
        write(`  note: ${pkg} also ships commands/hooks/agents — \`npx -y ${pkg} init\` installs the full kit.`);
    }
    // Skip-and-collect at install time (D1 / the report's D2 amendment): the offending
    // SKILL.md came out of the DOWNLOADED TARBALL, so the path is rendered relative to
    // the package root (a `node_modules/**` absolute path is not actionable) and the
    // message says whose defect it is. Exit 1 — a pack that shipped an unloadable skill
    // did not fully install.
    if (report.failures.length > 0) {
        writeErr(`dz install: ${pkg} ships ${report.failures.length} unparseable skill(s) —`);
        for (const line of formatSkillLoadFailures(report.failures, { relativeTo: pkgDir }))
            writeErr(line);
        writeErr('This is a defect in the package, not in your project.');
        writeErr(`Workaround: npx -y ${pkg} init`);
        return 1;
    }
    return 0;
}
function cmdCompose(options, cwd, write, writeErr) {
    const combo = options.get('_positional_0');
    if (!combo) {
        write('dz compose: preset combination required (e.g., dz compose devops+mcp+web3)');
        return 1;
    }
    // --target is documented; honor it in the suggested install command (was hardcoded claude-code).
    const targetOpt = options.get('target') ?? 'claude-code';
    const composeResolution = resolveTargetName(targetOpt);
    if (composeResolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz compose', composeResolution))
            writeErr(line);
        return 1;
    }
    const target = composeResolution.target;
    if (composeResolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz compose', targetOpt, target));
    const presetNames = combo.split('+').map((s) => s.trim());
    const allSkills = new Set();
    const resolved = [];
    for (const name of presetNames) {
        const preset = getPreset(name);
        if (!preset) {
            write(`dz compose: unknown preset "${name}". Available: ${PRESET_NAMES.join(', ')}`);
            return 1;
        }
        for (const skill of preset.skills)
            allSkills.add(skill);
        resolved.push(`${name} (${preset.skills.length})`);
    }
    write(`\nComposed: ${resolved.join(' + ')}`);
    write(`Total unique skills: ${allSkills.size}\n`);
    write(`Install command:`);
    write(`  dz init --target ${target} --select ${[...allSkills].join(',')}\n`);
    write(`Skills: ${[...allSkills].sort().join(', ')}`);
    return 0;
}
function cmdDiff(options, cwd, write) {
    const skillDir = options.get('_positional_0');
    if (!skillDir) {
        write('dz diff: skill directory required (e.g., dz diff .claude/skills/terraform)');
        return 1;
    }
    const resolvedDir = resolve(cwd, skillDir);
    const skillId = basename(resolvedDir);
    const installedSkillMd = join(resolvedDir, 'SKILL.md');
    if (!existsSync(installedSkillMd)) {
        write(`dz diff: SKILL.md not found at ${installedSkillMd}`);
        return 1;
    }
    // Find canonical version
    const baseDir = join(cwd, 'packages', '@dzhechkov');
    let canonicalPath;
    if (existsSync(baseDir)) {
        for (const pack of readdirSync(baseDir, { withFileTypes: true })) {
            if (!pack.isDirectory() || !pack.name.startsWith('skills-'))
                continue;
            const candidate = join(baseDir, pack.name, skillId, 'SKILL.md');
            if (existsSync(candidate)) {
                canonicalPath = candidate;
                break;
            }
        }
    }
    if (!canonicalPath) {
        write(`dz diff: no canonical version found for "${skillId}" in skills-* packages`);
        return 0;
    }
    const installed = readFileSync(installedSkillMd, 'utf-8');
    const canonical = readFileSync(canonicalPath, 'utf-8');
    const instLines = installed.split('\n');
    const canLines = canonical.split('\n');
    if (installed === canonical) {
        write(`${skillId}: identical (${instLines.length} lines)`);
        return 0;
    }
    write(`${skillId}: differs`);
    write(`  Installed: ${instLines.length} lines (${installedSkillMd})`);
    write(`  Canonical: ${canLines.length} lines (${canonicalPath})`);
    write(`  Delta: ${Math.abs(instLines.length - canLines.length)} lines`);
    // Show first 5 differing lines
    let diffs = 0;
    for (let i = 0; i < Math.max(instLines.length, canLines.length) && diffs < 5; i++) {
        if (instLines[i] !== canLines[i]) {
            write(`  Line ${i + 1}:`);
            if (instLines[i] !== undefined)
                write(`    - ${instLines[i]?.slice(0, 80)}`);
            if (canLines[i] !== undefined)
                write(`    + ${canLines[i]?.slice(0, 80)}`);
            diffs++;
        }
    }
    if (diffs >= 5)
        write(`  ... (showing first 5 differences)`);
    write(`\nUpdate: dz init --target claude-code --select ${skillId} --force`);
    return 0;
}
/**
 * Resolve the current git branch by reading `.git/HEAD` directly — no `git` subprocess, so it
 * stays well inside the statusline's ~50ms budget. Handles a `.git` file (worktree/submodule
 * gitdir redirect) and a detached HEAD (short sha). Best-effort: any error → `undefined`.
 */
function statuslineGitBranch(projectRoot) {
    try {
        let gitDir = join(projectRoot, '.git');
        const st = statSync(gitDir);
        if (st.isFile()) {
            const redirect = readFileSync(gitDir, 'utf8').match(/^gitdir:\s*(.+)$/m);
            if (redirect === null)
                return undefined;
            gitDir = resolve(projectRoot, redirect[1].trim());
        }
        const head = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
        const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        if (ref !== null)
            return ref[1];
        return head.length >= 7 ? head.slice(0, 7) : undefined; // detached HEAD → short sha
    }
    catch {
        return undefined;
    }
}
/** Resolve the project root from a Claude Code statusline STDIN payload, else `--project`/cwd. */
function statuslineProjectRoot(stdinRaw, options, cwd) {
    const fallback = resolve(cwd, options.get('project') ?? '.');
    try {
        const trimmed = stdinRaw.trim();
        if (trimmed.length === 0)
            return fallback;
        const payload = JSON.parse(trimmed);
        const candidate = (typeof payload.workspace?.project_dir === 'string' ? payload.workspace.project_dir : undefined) ??
            (typeof payload.workspace?.current_dir === 'string' ? payload.workspace.current_dir : undefined) ??
            (typeof payload.cwd === 'string' ? payload.cwd : undefined);
        return candidate !== undefined && candidate.length > 0 ? resolve(candidate) : fallback;
    }
    catch {
        // Empty / non-JSON stdin (e.g. run by hand in a terminal) — fall back to --project/cwd.
        return fallback;
    }
}
/**
 * `dz statusline --install` — merge a `statusLine` block into `.claude/settings.json` pointing at
 * this CLI's own bin (`<abs dz bin> statusline`). NON-CLOBBERING: an existing `statusLine` is left
 * untouched (we print it + how to replace); every other settings key is preserved. Mirrors the
 * `brain init` read-merge-write discipline.
 */
function cmdStatuslineInstall(options, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    // Invoke the SAME bin this CLI runs from: dist/bin.js sits next to dist/cli.js.
    const dzBin = join(dirname(fileURLToPath(import.meta.url)), 'bin.js');
    const command = `node ${JSON.stringify(dzBin)} statusline`;
    const settingsPath = join(projectRoot, '.claude', 'settings.json');
    let settings = {};
    if (existsSync(settingsPath)) {
        try {
            const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
            if (parsed !== null && typeof parsed === 'object')
                settings = parsed;
        }
        catch {
            write(`dz statusline --install: ${settingsPath} is not valid JSON — fix it and re-run`);
            return 1;
        }
    }
    // Non-clobbering: never overwrite a statusLine the user already configured.
    const existingStatusLine = settings['statusLine'];
    if (existingStatusLine !== undefined && existingStatusLine !== null) {
        const cur = existingStatusLine.command;
        write(`dz statusline --install: a statusLine is already configured in ${settingsPath} — not overwriting`);
        if (typeof cur === 'string')
            write(`  current: ${cur}`);
        write(`  To use dz's panel instead, remove the "statusLine" block and re-run, or set it to:`);
        write(`    "statusLine": { "type": "command", "command": ${JSON.stringify(command)}, "padding": 0 }`);
        return 0;
    }
    settings['statusLine'] = { type: 'command', command, padding: 0 };
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
    write(`dz statusline --install: wired the live self-learning panel into ${settingsPath}`);
    write(`  statusLine → ${command}`);
    write(`  It's now live in Claude Code — the status bar refreshes with dz's learned-pattern +`);
    write(`  brain-source counts (every ~300ms). All other settings keys were preserved.`);
    write(`  To turn it OFF: remove the "statusLine" block from ${settingsPath}.`);
    return 0;
}
/**
 * `dz statusline --fa-record` — the entry point the `/feature-adr` pipeline calls at Steps 0/8/9 to
 * record its LIVE learning state (Pattern memory loop: pool / recalled / stored). Unlike the render
 * path this WRITES a per-slug `.dz/feature-adr/learning-state/*.json` slot (via harness-core's
 * best-effort `writeFeatureAdrState`, which itself computes `pool` from the learned-pattern count).
 *
 * GUARD (feature-adr flag discipline): `--slug` and `--step` are required; a missing one exits 1
 * with a copy-paste example. `--recalled`/`--stored` default to 0 and reject non-numeric input.
 * `--kind <feature-adr|loop>` identifies the producer, defaults to `feature-adr`, and rejects any
 * other value rather than silently weakening panel arbitration.
 */
function cmdStatuslineFaRecord(options, cwd, write) {
    const slug = (options.get('slug') ?? '').trim();
    const step = (options.get('step') ?? '').trim();
    // `--recalled auto` derives the count from the recall-usage log for `--run <id>`, replacing the
    // pipeline's hardcoded `--recalled 3` (a literal at three call sites — the fallback writer that
    // lights the panel had nowhere to get a real number until `dz recall` began recording itself).
    if ((options.get('recalled') ?? '').trim() === 'auto') {
        const runKey = (options.get('run') ?? '').trim();
        if (runKey === '') {
            write('dz statusline --fa-record: --recalled auto needs --run <id> — without a run key there is nothing to count');
            return 2;
        }
        // The COUNT's source and the PANEL's home are two different addresses. The pipeline records
        // recalls in the canonical BRAIN store while the panel state lives in the project — with a
        // separate `args.brain` the count read from `--project` would be a silent zero over the wrong
        // log (the dz sync 0/0 class, again). `--count-project` names the log's home explicitly and
        // defaults to `--project` for the common single-root case.
        const countRoot = resolve((options.get('count-project') ?? options.get('project') ?? cwd).trim() || cwd);
        const derived = countRecallEventsForRun(countRoot, runKey);
        if (derived === null) {
            // An unreadable log is not zero. Refusing keeps the panel's PREVIOUS state, which is the
            // honest outcome: no new claim, rather than a wrong one (the dz sync 0/0 class).
            write('dz statusline --fa-record: the recall-usage log could not be read — recording nothing rather than a wrong number');
            return 2;
        }
        options.set('recalled', String(derived));
    }
    if (slug === '' || step === '') {
        write('dz statusline --fa-record: --slug and --step are both required');
        write('  Example: dz statusline --fa-record --slug add-user-auth --step "Step 0" --recalled 5 --stored 2');
        return 1;
    }
    // Numeric guards: absent → 0; present-but-non-numeric → reject with a hint (never silently 0).
    const parseCount = (name) => {
        const raw = options.get(name);
        if (raw === undefined)
            return 0;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
            write(`dz statusline --fa-record: --${name} must be a non-negative integer (got "${raw}")`);
            write('  Example: dz statusline --fa-record --slug add-user-auth --step "Step 0" --recalled 5 --stored 2');
            return undefined;
        }
        return n;
    };
    const recalled = parseCount('recalled');
    if (recalled === undefined)
        return 1;
    const stored = parseCount('stored');
    if (stored === undefined)
        return 1;
    const reinforced = parseCount('reinforced');
    if (reinforced === undefined)
        return 1;
    const kindRaw = options.get('kind') ?? 'feature-adr';
    if (kindRaw !== 'feature-adr' && kindRaw !== 'loop') {
        write(`dz statusline --fa-record: --kind must be feature-adr or loop (got "${kindRaw}")`);
        write('  Example: dz statusline --fa-record --slug add-user-auth --step "Step 0" --kind feature-adr --recalled 5 --stored 2');
        return 1;
    }
    const mode = options.get('mode');
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const state = writeFeatureAdrState(projectRoot, {
        kind: kindRaw, slug, step, recalled, stored,
        ...(reinforced > 0 ? { reinforced } : {}),
        ...(mode !== undefined && mode.trim() !== '' ? { mode: mode.trim() } : {}),
    });
    if (state === undefined) {
        write(`dz statusline --fa-record: could not write learning state under ${projectRoot}/.dz/feature-adr/`);
        return 1;
    }
    write(`dz statusline: recorded /feature-adr learning state for "${slug}" (${step}) — 🎓 ${state.pool} pool · ↑${state.recalled} used · +${state.stored} new · ↻${state.reinforced ?? 0} reinforced`);
    return 0;
}
function statuslineEtaStage(step) {
    const match = step.match(/\bStep\s*-?\s*(0|[1-9](?:\.5)?)(?:\b|\s)/i);
    if (match === null)
        return undefined;
    const value = Number(match[1]);
    if (value === 0)
        return 'router';
    if (value > 0 && value < 6)
        return 'design';
    if (value === 6)
        return 'plan';
    if (value === 7)
        return 'code';
    if (value === 8)
        return 'qe';
    if (value === 9)
        return 'fleet';
    return undefined;
}
function routerMetadata(router) {
    const result = router?.result;
    if (result === null || typeof result !== 'object')
        return {};
    const record = result;
    const tier = typeof record['tier'] === 'string' && record['tier'].length > 0 ? record['tier'] : undefined;
    const activeSteps = Array.isArray(record['activeSteps'])
        ? record['activeSteps'].filter((value) => typeof value === 'number' && Number.isFinite(value))
        : undefined;
    return {
        ...(tier !== undefined ? { tier } : {}),
        ...(activeSteps !== undefined ? { activeSteps } : {}),
    };
}
function activeCheckpointStages(tier, activeSteps) {
    const stages = new Set();
    if (activeSteps !== undefined) {
        for (const step of activeSteps) {
            if (step === 0)
                stages.add('router');
            else if (step > 0 && step < 6)
                stages.add('design');
            else if (step === 6)
                stages.add('plan');
            else if (step === 7)
                stages.add('code');
            else if (step === 8)
                stages.add('qe');
            else if (step === 9)
                stages.add('fleet');
        }
    }
    else if (tier !== undefined) {
        for (const stage of CHECKPOINT_STAGES) {
            if (stage !== 'fleet' || tier === 'L' || tier === 'XL')
                stages.add(stage);
        }
    }
    return CHECKPOINT_STAGES.filter((stage) => stages.has(stage));
}
/** All checkpoint I/O for ETA lives in this CLI-only wrapper and degrades per file. */
function readEtaCorpus(projectRoot, currentSlug) {
    const trace = process.env['DZ_ETA_TRACE'];
    if (trace !== undefined && trace.length > 0) {
        try {
            appendFileSync(trace, `${JSON.stringify({ projectRoot, currentSlug, ts: new Date().toISOString() })}\n`);
        }
        catch { /* a test/debug receipt can never take down the statusline */ }
    }
    const samples = [];
    let currentSegments = [];
    let hasCurrentCheckpoints = false;
    let entries = [];
    try {
        entries = readdirSync(join(projectRoot, 'features'), { withFileTypes: true });
    }
    catch {
        return {
            history: [], currentRunSamples: [], currentTier: undefined, activeStages: [],
            lastCheckpointTsMs: undefined, hasCurrentCheckpoints: false,
        };
    }
    for (const entry of entries) {
        if (!entry.isDirectory())
            continue;
        const checkpointPath = join(projectRoot, 'features', entry.name, '.fa-state', 'checkpoints.jsonl');
        try {
            const text = readFileSync(checkpointPath, 'utf8');
            const observations = parseCheckpointLines(text, entry.name);
            const segments = segmentRun(observations);
            samples.push(...extractStageSamples(segments));
            if (entry.name === currentSlug) {
                hasCurrentCheckpoints = observations.length > 0;
                currentSegments = segments;
            }
        }
        catch {
            // Missing, unreadable, or racing append: this run contributes no evidence.
        }
    }
    const lastSegment = currentSegments.at(-1);
    const currentRouter = lastSegment?.router;
    const invocationSegments = currentRouter === undefined
        ? []
        : currentSegments.filter((segment) => segment.router === currentRouter);
    const invocationRunIds = new Set(invocationSegments.map((segment) => segment.runId));
    const currentRunSamples = extractStageSamples(invocationSegments);
    const metadata = routerMetadata(currentRouter);
    const currentTimestamps = invocationSegments
        .flatMap((segment) => segment.observations)
        .flatMap((observation) => observation.tsMs === undefined ? [] : [observation.tsMs]);
    return {
        history: samples.filter((sample) => !invocationRunIds.has(sample.runId)),
        currentRunSamples,
        currentTier: metadata.tier,
        activeStages: activeCheckpointStages(metadata.tier, metadata.activeSteps),
        lastCheckpointTsMs: currentTimestamps.length > 0 ? Math.max(...currentTimestamps) : undefined,
        hasCurrentCheckpoints,
    };
}
function statuslineEta(projectRoot, state, nowMs) {
    const currentStage = statuslineEtaStage(state.step);
    if (currentStage === undefined)
        return undefined;
    const corpus = readEtaCorpus(projectRoot, state.slug);
    const currentIndex = CHECKPOINT_STAGES.indexOf(currentStage);
    const remainingStages = corpus.activeStages.filter((stage) => CHECKPOINT_STAGES.indexOf(stage) >= currentIndex && stage !== 'router');
    // Preserve honest absence as a machine-readable union member. The text formatter intentionally
    // omits both variants, but `--json` must still distinguish no file from a file with no tier.
    const stagesForEstimate = remainingStages.length > 0
        ? remainingStages
        : (currentStage === 'router' ? [] : [currentStage]);
    if (stagesForEstimate.length === 0 && corpus.hasCurrentCheckpoints && corpus.currentTier !== undefined)
        return undefined;
    return estimateEta({
        samples: corpus.history,
        currentTier: corpus.currentTier,
        currentStage,
        remainingStages: stagesForEstimate,
        currentRunSamples: corpus.currentRunSamples,
        nowMs,
        ...(corpus.lastCheckpointTsMs !== undefined ? { lastCheckpointTsMs: corpus.lastCheckpointTsMs } : {}),
        hasCurrentCheckpoints: corpus.hasCurrentCheckpoints,
    });
}
/**
 * `dz statusline` — render dz's OWN self-learning counts as one compact, emoji-tagged line for
 * Claude Code's status bar (modeled on agentic-qe's "🎓 12 patterns"). Claude Code pipes a JSON
 * session payload on STDIN (workspace/model/cwd) and refreshes this up to ~every 300ms, so it MUST
 * be fast and MUST NEVER throw/hang — the whole body is guarded and ALWAYS exits 0, printing at
 * least a minimal `dz` even on total failure.
 *
 * Flags: `--install` wires it into settings.json; `--fa-record` records a live `/feature-adr`
 * learning state (WRITES — see {@link cmdStatuslineFaRecord}); `--json` prints the raw data object;
 * default prints the status line (with a 📐 pipeline segment prepended when a fresh run is in flight).
 */
function cmdStatusline(options, flags, cwd, write, readStdin) {
    if (flags.has('install'))
        return cmdStatuslineInstall(options, cwd, write);
    if (flags.has('fa-record'))
        return cmdStatuslineFaRecord(options, cwd, write);
    try {
        const projectRoot = statuslineProjectRoot(readStdin(), options, cwd);
        const data = statuslineData(projectRoot);
        const fa = data.featureAdr;
        let eta;
        let etaFragment;
        if (fa !== undefined && fa.kind !== 'loop') {
            try {
                eta = statuslineEta(projectRoot, fa, Date.now());
                if (eta !== undefined)
                    etaFragment = formatEta(eta);
            }
            catch {
                // ETA is advisory: any corpus/resource failure omits only this fragment.
                eta = undefined;
                etaFragment = undefined;
            }
        }
        if (flags.has('json')) {
            write(JSON.stringify({ ...data, ...(eta !== undefined ? { eta } : {}) }));
            return 0;
        }
        let line = `🎓 dz: ${data.patterns} patterns${data.usedPatterns !== undefined ? ` · ${data.usedPatterns} used` : ''} · 🧠 ${data.brainSources} sources`;
        const branch = statuslineGitBranch(projectRoot);
        if (branch !== undefined)
            line += ` · ⎇ ${branch}`;
        if (data.consolidatedAgeH !== undefined)
            line += ` · ⟳ ${data.consolidatedAgeH}h`;
        // Live /feature-adr run in flight → PREPEND the pipeline learning segment to the base dz line.
        if (fa !== undefined) {
            // The producer marker reached data and arbitration in a previous round but not this label, so the bar asserted a pipeline that was not running.
            if (fa.kind === 'loop') {
                line = `🔁 loop ${fa.step} · ${line}`;
            }
            else {
                line = `📐 feature-adr ${fa.step} · ${etaFragment !== undefined ? `${etaFragment} · ` : ''}🎓 ${fa.pool} pool · ↑${fa.recalled} used · +${fa.stored} new · ↻${fa.reinforced ?? 0} reinforced · ${line}`;
            }
        }
        write(line);
        return 0;
    }
    catch {
        // A garbled status bar is worse than a terse one — print SOMETHING minimal, never throw.
        write('dz');
        return 0;
    }
}
function isJsonRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function usageConfigPath(projectRoot) {
    return join(projectRoot, '.dz', 'config.json');
}
function readProjectConfigForUsage(projectRoot) {
    const path = usageConfigPath(projectRoot);
    try {
        if (!existsSync(path))
            return { config: {} };
        const parsed = JSON.parse(readFileSync(path, 'utf-8'));
        if (isJsonRecord(parsed))
            return { config: parsed };
        return { config: {}, warning: 'existing config is not a JSON object; writing a minimal config' };
    }
    catch {
        return { config: {}, warning: 'existing config could not be parsed; writing a minimal config' };
    }
}
function applyUsageCalibrationToConfig(config, plan) {
    const next = { ...config };
    const memory = isJsonRecord(next['memory']) ? { ...next['memory'] } : {};
    const usage = isJsonRecord(memory['usage']) ? { ...memory['usage'] } : {};
    for (const change of plan.changes) {
        if (change.key === 'session') {
            usage['sessionTokenLimit'] = change.after;
        }
        else if (change.key === 'weekly') {
            usage['weeklyTokenLimit'] = change.after;
        }
        else {
            const model = normalizeClaudeUsageModelKey(change.key);
            if (model) {
                const existingByModel = isJsonRecord(usage['weeklyTokenLimitByModel']) ? { ...usage['weeklyTokenLimitByModel'] } : {};
                existingByModel[model] = change.after;
                usage['weeklyTokenLimitByModel'] = existingByModel;
            }
        }
    }
    if (plan.changes.length > 0) {
        usage['calibratedAt'] = plan.after.calibratedAt;
        usage['source'] = plan.after.source;
        // A fresh calibration re-arms routing for THIS account and clears the legacy free-text switch:
        // the calibration is the very act the disable-note demanded.
        usage['calibrationAccount'] = plan.after.calibrationAccount ?? null;
    }
    memory['usage'] = usage;
    next['memory'] = memory;
    return next;
}
function parseUsageModelArgs(modelArgs) {
    const modelPct = {};
    const skipped = [];
    for (const raw of modelArgs) {
        const eq = raw.indexOf('=');
        if (eq <= 0 || eq === raw.length - 1) {
            skipped.push(`model ${raw}: skipped malformed model=pct argument`);
            continue;
        }
        const modelName = raw.slice(0, eq).trim();
        const model = normalizeClaudeUsageModelKey(modelName);
        if (!model) {
            skipped.push(`model ${modelName}: skipped unknown model`);
            continue;
        }
        modelPct[model] = raw.slice(eq + 1).trim();
    }
    return { modelPct, skipped };
}
function writeUsageCalibrationSummary(opts) {
    opts.write('usage calibrate: estimated local transcript counts; claude.ai/settings/usage is authoritative');
    opts.write(`usage calibrate: project ${opts.projectRoot}`);
    if (opts.configWarning)
        opts.write(`usage calibrate: ${opts.configWarning}`);
    for (const change of opts.plan.changes) {
        opts.write(`usage calibrate: ${change.key} tokens=${change.tokens} pct=${change.pct}% limit ${change.before ?? 'null'} -> ${change.after}`);
    }
    const skipped = [...opts.preSkipped, ...opts.plan.skipped];
    for (const item of skipped)
        opts.write(`usage calibrate: skipped ${item}`);
    if (opts.wrote) {
        opts.write('usage calibrate: wrote .dz/config.json with source claude.ai/settings/usage');
    }
    else {
        opts.write('usage calibrate: no config changes written');
    }
}
function cmdUsageCalibrate(options, optionLists, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const suppliedModels = optionLists.get('model') ?? [];
    const parsedModels = parseUsageModelArgs(suppliedModels);
    const modelPct = parsedModels.modelPct;
    const hasModelPct = Object.keys(modelPct).length > 0;
    const input = {
        ...(options.has('session') ? { sessionPct: options.get('session') } : {}),
        ...(options.has('weekly') ? { weeklyPct: options.get('weekly') } : {}),
        ...(hasModelPct ? { modelPct } : {}),
        calibratedAt: new Date().toISOString(),
        source: 'claude.ai/settings/usage',
    };
    const missingInputs = [];
    if (!options.has('session') && !options.has('weekly') && !hasModelPct) {
        missingInputs.push('no calibration percentages supplied');
    }
    try {
        const current = computeUsage(projectRoot);
        const before = readUsageLimits(projectRoot);
        const plan = deriveUsageCalibration(current, before, input);
        if (plan.changes.length === 0) {
            writeUsageCalibrationSummary({
                projectRoot,
                plan,
                preSkipped: [...parsedModels.skipped, ...missingInputs],
                wrote: false,
                write,
            });
            return 0;
        }
        const existing = readProjectConfigForUsage(projectRoot);
        const nextConfig = applyUsageCalibrationToConfig(existing.config, plan);
        try {
            mkdirSync(join(projectRoot, '.dz'), { recursive: true });
            writeFileSync(usageConfigPath(projectRoot), JSON.stringify(nextConfig, null, 2) + '\n');
            writeUsageCalibrationSummary({
                projectRoot,
                plan,
                preSkipped: [...parsedModels.skipped, ...missingInputs],
                configWarning: existing.warning,
                wrote: true,
                write,
            });
        }
        catch {
            writeUsageCalibrationSummary({
                projectRoot,
                plan,
                preSkipped: [...parsedModels.skipped, ...missingInputs, 'write failed'],
                configWarning: existing.warning,
                wrote: false,
                write,
            });
        }
        return 0;
    }
    catch {
        write('usage calibrate: skipped internal error; no config changes written');
        return 0;
    }
}
/**
 * `dz usage --by-stage` — the per-stage cost ledger for one feature-adr run (feature `cost-ledger`).
 *
 * A run reports ONE number; this turns it into an itemized receipt keyed by the workflow's OWN
 * `stageLabel()` strings, plus the reconciliation line that guards the bookkeeping itself. Derived
 * post-hoc from the transcripts already on disk — no workflow edit, killed runs included.
 *
 * Exit code is 0 ALWAYS, matching the rest of `dz usage`; the VERDICT (`BALANCED` / `DEFECT` /
 * `INSUFFICIENT_DATA`) is the signal, and `INSUFFICIENT_DATA` is not success.
 */
function cmdUsageByStage(options, flags, write) {
    const runId = options.get('run');
    const slug = options.get('slug');
    const epsilonRaw = options.get('epsilon');
    const epsilon = epsilonRaw === undefined ? undefined : Number(epsilonRaw);
    const report = deriveCostLedger({
        ...(runId !== undefined ? { runId } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(epsilon !== undefined && Number.isFinite(epsilon) ? { epsilon } : {}),
    });
    if (report === null) {
        // An ABSENT run is never a balanced empty report (ADR-003).
        const detail = runId !== undefined ? `run ${runId}` : slug !== undefined ? `slug ${slug}` : 'any workflow run';
        if (flags.has('json')) {
            write(JSON.stringify({ verdict: 'INSUFFICIENT_DATA', reason: `no workflow run record found for ${detail}`, rows: [], estimated: true, scope: COST_LEDGER_SCOPE }));
        }
        else {
            write(`usage --by-stage: INSUFFICIENT_DATA — no workflow run record found for ${detail}`);
            write(`usage --by-stage: scope: ${COST_LEDGER_SCOPE}`);
        }
        return 0;
    }
    // The verifier re-derives the identities from the EMITTED report — a builder bug must surface as
    // a finding, not as a plausible table.
    const verifyDefects = verifyCostLedgerReport(report);
    const outPath = options.get('write');
    let wrote = null;
    if (outPath !== undefined && outPath.length > 0)
        wrote = writeCostLedgerJsonl(resolve(outPath), report);
    if (flags.has('json')) {
        write(JSON.stringify({ ...report, verifyDefects, ...(wrote === null ? {} : { wrote, writePath: resolve(outPath ?? '') }) }));
        return 0;
    }
    write(renderCostLedger(report));
    for (const d of verifyDefects)
        write(`  verifier: ${d.kind}: ${d.detail}`);
    if (wrote !== null) {
        write(`  ${wrote ? 'wrote' : 'FAILED to write'} ${resolve(outPath ?? '')} (derived report — regenerable, never read back)`);
    }
    return 0;
}
/**
 * `dz usage` — print an ESTIMATE of Claude session + weekly usage from fixed reset windows,
 * aggregated READONLY from the local transcript store (see {@link computeUsage}). `--json` emits
 * the single-line contract the feature-adr usage-probe agent parses; `--calibrate` is the only
 * write path and records human-transcribed claude.ai percentages in `.dz/config.json`.
 *
 * **Exit code is 0 ALWAYS** — including on internal error the whole body is guarded and prints the
 * all-null JSON, so a probe can NEVER distinguish "usage unknown" from "command failed" via a
 * non-zero exit. `--project <dir>` scopes ONLY the `.dz/config.json` read/write; measurement is
 * account-wide (all projects).
 */
/**
 * dz qe-rounds — how many Step-8 review rounds has one feature already had?
 *
 * The stopping rule ("Max iterations: 3") lived ONLY as a sentence in a prose module, so every
 * restart of the agent forgot it. MEASURED 2026-08-27: one real slug reached 38 graded rounds.
 * This makes the rule answerable by a command instead of by memory — and the exit code ASKS the
 * owner rather than concluding, because whether 38 rounds were warranted is not a thing a counter
 * can know.
 */
function cmdQeRounds(options, flags, cwd, write) {
    const root = resolve(cwd, options.get('project') ?? '.');
    const slug = (options.get('slug') ?? '').trim();
    const dirOpt = (options.get('feature-dir') ?? '').trim();
    if (!slug && !dirOpt) {
        write('dz qe-rounds: need --slug <feature> or --feature-dir <abs path>');
        return 2;
    }
    // One directory, never a union. MEASURED: the slug `package-story-page-hardening` exists in two
    // checkouts holding 38 and 7 records; a tool that searched for the slug would report 45 for a run
    // that had 38, and the output would look identical to a correct one.
    const featureDir = dirOpt ? resolve(cwd, dirOpt) : join(root, 'features', slug);
    const ceilingRaw = options.get('ceiling');
    let ceiling = QE_ROUNDS_DEFAULT_CEILING;
    if (ceilingRaw !== undefined) {
        const n = Number(ceilingRaw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
            write('dz qe-rounds: --ceiling must be a positive integer, got ' + JSON.stringify(ceilingRaw));
            return 2;
        }
        ceiling = n;
    }
    const r = readQeRounds(featureDir, { ceiling });
    if (flags.has('json')) {
        write(JSON.stringify(r));
        return r.status === 'not-established' ? 2 : r.status === 'at-or-over-ceiling' ? 1 : 0;
    }
    if (r.status === 'not-established') {
        write('dz qe-rounds: NOT ESTABLISHED — ' + (r.notEstablishedReason ?? 'no readable records'));
        write('  This is not "zero rounds". Nothing was measured, so nothing follows about continuing.');
        if (r.unreadable.length) {
            write('  unreadable record(s):');
            for (const u of r.unreadable)
                write('    - ' + u.file + ' — ' + u.why);
        }
        return 2;
    }
    write('dz qe-rounds: ' + r.rounds + ' graded round(s), ceiling ' + r.ceiling
        + (r.failedAttempts.length ? ', plus ' + r.failedAttempts.length + ' attempt(s) with no verdict' : ''));
    write('  dir:    ' + r.dir);
    if (r.firstAt && r.lastAt)
        write('  window: ' + r.firstAt + ' → ' + r.lastAt);
    if (r.grades.length)
        write('  grades: ' + r.grades.join(' '));
    if (r.unreadable.length) {
        // Named, never silently skipped: a dropped record makes the count quietly too low, and in a
        // counter whose job is to STOP a loop that fails open.
        write('  ' + r.unreadable.length + ' unreadable record(s) — the count below is a LOWER BOUND:');
        for (const u of r.unreadable)
            write('    - ' + u.file + ' — ' + u.why);
    }
    if (r.status === 'at-or-over-ceiling') {
        write('  STOP: the ceiling is reached. The rule in 08-qe.md says the remaining gaps go to the');
        write('  owner for a decision. This command does not judge whether the rounds were warranted —');
        write('  it only makes sure the question gets asked.');
        return 1;
    }
    write('  under the ceiling — another round is within the documented budget');
    return 0;
}
/** Read one fixed advisor evidence path without following a symlink or escaping the project root. */
function readRestartAdvisorEvidence(root, relativePath) {
    const contained = containedUnderRoot(root, relativePath);
    if (!contained.ok) {
        return { text: null, diagnostic: `${relativePath}: ${contained.why}` };
    }
    let stat;
    try {
        stat = lstatSync(contained.path);
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return { text: null, diagnostic: null };
        return { text: null, diagnostic: `${relativePath}: evidence cannot be inspected (${error.message})` };
    }
    if (stat.isSymbolicLink()) {
        return { text: null, diagnostic: `${relativePath}: symlink evidence is refused` };
    }
    if (!stat.isFile()) {
        return { text: null, diagnostic: `${relativePath}: evidence exists but is not a regular file` };
    }
    try {
        return { text: readFileSync(contained.path, 'utf-8'), diagnostic: null };
    }
    catch (error) {
        return { text: null, diagnostic: `${relativePath}: evidence cannot be read (${error.message})` };
    }
}
/** Manual restart recommendation only. I/O ends here; the core remains deterministic and pure. */
function cmdRestartAdvisor(options, flags, cwd, write) {
    const json = flags.has('json');
    const rawSlug = options.get('slug') ?? '';
    const slug = rawSlug.trim();
    const thresholdRaw = options.get('threshold');
    const roundsRaw = options.get('rounds');
    const thresholdOrigin = thresholdRaw === undefined ? 'default' : 'flag';
    const roundsOrigin = roundsRaw === undefined ? 'default' : 'flag';
    const emit = (advice) => {
        if (json) {
            write(JSON.stringify(advice));
        }
        else {
            write(`dz restart-advisor: ${advice.recommendation} — advisory only; autoAction=false`);
            write(`  policy: threshold ${String(advice.policy.threshold)} (${advice.policy.thresholdOrigin}), rounds ${String(advice.policy.rounds)} (${advice.policy.roundsOrigin})`);
            write(`  source: ${advice.sourcePath ?? 'none'}${advice.corroborated ? ' (corroborated by both stores)' : ''}`);
            for (const diagnostic of advice.diagnostics)
                write(`  diagnostic: ${JSON.stringify(diagnostic)}`);
            if (advice.diagnosticsSummary.truncated) {
                write(`  diagnostics: ${advice.diagnosticsSummary.returned}/${advice.diagnosticsSummary.total} shown`);
            }
            write(advice.decisionLogLine);
        }
        return advice.recommendation === 'RESTART_CODE_STAGE'
            || advice.recommendation === 'NO_RESTART_RECOMMENDATION'
            ? 0
            : 2;
    };
    const inputErrors = [];
    for (const flag of flags) {
        if (flag !== 'json' && flag !== 'help')
            inputErrors.push(`--${flag} requires a value or is not supported`);
    }
    for (const key of options.keys()) {
        if (key !== 'slug' && key !== 'threshold' && key !== 'rounds') {
            inputErrors.push(key.startsWith('_positional_')
                ? `unexpected argument ${JSON.stringify(options.get(key))}`
                : `unsupported option --${key}`);
        }
    }
    if (!isSafeSlug(slug)) {
        inputErrors.push(`--slug ${JSON.stringify(rawSlug)} must be one kebab-case path segment (max 40 characters)`);
    }
    const threshold = thresholdRaw ?? 'D';
    if (threshold !== 'C' && threshold !== 'D') {
        inputErrors.push(`--threshold ${JSON.stringify(thresholdRaw)} must be exactly C or D`);
    }
    const roundsValue = roundsRaw === undefined ? 2 : Number(roundsRaw);
    if (!Number.isFinite(roundsValue) || !Number.isInteger(roundsValue) || roundsValue < 1) {
        inputErrors.push(`--rounds ${JSON.stringify(roundsRaw)} must be a positive integer`);
    }
    if (inputErrors.length > 0) {
        return emit(adviseRestart({ slug, inputErrors }, {
            thresholdOrigin,
            roundsOrigin,
        }));
    }
    const root = resolve(cwd);
    const checkpointPath = `features/${slug}/.fa-state/checkpoints.jsonl`;
    const trainingPath = `.dz/fa-training/${slug}/qe.jsonl`;
    const checkpoints = readRestartAdvisorEvidence(root, checkpointPath);
    const trainingPairs = readRestartAdvisorEvidence(root, trainingPath);
    const readDiagnostics = [checkpoints.diagnostic, trainingPairs.diagnostic]
        .filter((entry) => entry !== null);
    return emit(adviseRestart({
        slug,
        checkpointsJsonl: checkpoints.text,
        trainingPairsJsonl: trainingPairs.text,
        readDiagnostics,
    }, {
        threshold: threshold,
        rounds: roundsValue,
        thresholdOrigin,
        roundsOrigin,
    }));
}
function cmdCadence(options, flags, cwd, write) {
    const root = resolve(cwd, options.get('project') ?? '.');
    const windowRaw = (options.get('window') ?? 'week').trim();
    if (!(windowRaw in CADENCE_WINDOW_DAYS)) {
        write('dz cadence: --window must be one of ' + Object.keys(CADENCE_WINDOW_DAYS).join('|'));
        return 1;
    }
    const r = buildCadenceReport(root, windowRaw);
    if (flags.has('json')) {
        write(JSON.stringify(r));
        return r.decision.ok ? 0 : 2;
    }
    write('dz cadence — window ' + r.window + ', record depth ' + r.depthDays + ' day(s)');
    if (!r.decision.ok) {
        write('  ' + r.decision.reason);
        if (r.decision.largestAllowed)
            write('  cure: dz cadence --window ' + r.decision.largestAllowed);
        return 2;
    }
    const weeks = [...new Set([...Object.keys(r.shipments.graded), ...Object.keys(r.npmPublishes.weekly), ...Object.keys(r.recalls.weekly)])].sort();
    write('  week        shipped(graded)  npm-publishes  recalls');
    for (const w of weeks) {
        write('  ' + w.padEnd(12) + String(r.shipments.graded[w] ?? 0).padStart(15) + String(r.npmPublishes.weekly[w] ?? 0).padStart(15) + String(r.recalls.weekly[w] ?? 0).padStart(9));
    }
    write('  graded ' + r.shipments.gradedTotal + ' (' + Object.entries(r.shipments.byGrade).sort().map(([g, n]) => g + '×' + n).join(', ') + ') · UNGRADED ' + r.shipments.ungraded + ' (named, not hidden)');
    if (r.guard.decay.length > 0) {
        write('  guard repeat decay (FIXED set — rules with pre-window history only):');
        for (const d of r.guard.decay.slice(0, 8))
            write('    ' + d.rule.padEnd(28) + 'before×' + d.before + ' → in-window×' + d.inWindow);
    }
    if (r.guard.excludedNewborn.length > 0)
        write('  excluded newborn rule(s) (no pre-window history — a zero here would be youth, not virtue): ' + r.guard.excludedNewborn.join(', '));
    for (const dgr of [r.npmPublishes.degraded, r.guard.degraded, r.recalls.degraded])
        if (dgr)
            write('  DEGRADED: ' + dgr);
    return 0;
}
function cmdUsage(options, optionLists, flags, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const nullContract = () => JSON.stringify({
        sessionPct: null,
        weeklyPct: null,
        sessionTokens: 0,
        weeklyTokens: 0,
        resetsAt: { session: null, weekly: null },
        limits: { session: null, weekly: null },
        estimated: true,
    });
    try {
        if (flags.has('calibrate'))
            return cmdUsageCalibrate(options, optionLists, cwd, write);
        if (flags.has('by-stage'))
            return cmdUsageByStage(options, flags, write);
        const u = computeUsage(projectRoot);
        const lim = readUsageLimits(projectRoot);
        const modelLimits = lim.weeklyTokenLimitByModel;
        const hasModelLimits = modelLimits !== undefined && Object.keys(modelLimits).length > 0;
        if (flags.has('json')) {
            const limitsPayload = { session: lim.sessionTokenLimit ?? null, weekly: lim.weeklyTokenLimit ?? null };
            if (hasModelLimits)
                limitsPayload.weeklyByModel = { ...modelLimits };
            const payload = {
                sessionPct: u.sessionPct,
                weeklyPct: u.weeklyPct,
                sessionTokens: u.sessionTokens,
                weeklyTokens: u.weeklyTokens,
                resetsAt: { session: u.sessionResetsAt, weekly: u.weeklyResetsAt },
                limits: limitsPayload,
                estimated: true,
            };
            // ADR-001 usage-honesty: a consumer that reads null pcts deserves the WHY (closed reason
            // set), and a human deserves the raw estimates when POLICY (not measurement) nulled them.
            if (u.notEstablished.length > 0)
                payload.notEstablished = u.notEstablished;
            if (u.estimatesNotForRouting !== undefined)
                payload.estimatesNotForRouting = u.estimatesNotForRouting;
            if (hasModelLimits && u.weeklyByModel !== undefined)
                payload.weeklyByModel = u.weeklyByModel;
            // re-QE debt surfacing (backlog 6b40e667 — QE #9: the json contract must carry the debt too,
            // a probe is exactly the consumer that needs it). The field appears ONLY when a debt exists,
            // so the zero-debt contract stays byte-identical to the pinned legacy shape. Best-effort.
            try {
                const reqeCount = scanReqeDebts(resolve(cwd, options.get('project') ?? '.')).debts.length;
                if (reqeCount > 0)
                    payload.reqeDue = reqeCount;
            }
            catch { /* advisory only */ }
            write(JSON.stringify(payload));
            return 0;
        }
        if (u.sessionPct === null && u.weeklyPct === null && u.notEstablished.length > 0) {
            // Limits may be fully configured and the pcts STILL null — that is the honesty, not a config
            // gap. Say why, and show the human the raw estimates when only policy nulled them.
            write('usage: not established — ' + u.notEstablished.join(', '));
            if (u.estimatesNotForRouting !== undefined) {
                const e = u.estimatesNotForRouting;
                write('  estimates (NOT for routing): session ~' + (e.sessionPct ?? '?') + '% · week ~' + (e.weeklyPct ?? '?') + '% — recalibrate on THIS account: dz usage --calibrate --session <pct> --weekly <pct>');
            }
            else {
                write('  the scan established nothing (' + u.sessionTokens + ' session / ' + u.weeklyTokens + ' weekly tokens counted) — a percentage would be a guess, and routing must not eat guesses');
            }
            try {
                const reqe = scanReqeDebts(resolve(cwd, options.get('project') ?? '.'));
                if (reqe.debts.length > 0)
                    write('re-QE due: ' + reqe.debts.length + ' usage-switched run(s) kept same-family QE — run `dz reqe` for the cross-family pass');
            }
            catch { /* advisory only */ }
            return 0;
        }
        if (u.sessionPct === null && u.weeklyPct === null) {
            write('usage: unconfigured — set memory.usage.sessionTokenLimit / weeklyTokenLimit in .dz/config.json (percentages are ESTIMATES calibrated from observed exhaustion)');
            try {
                const reqe = scanReqeDebts(resolve(cwd, options.get('project') ?? '.'));
                if (reqe.debts.length > 0)
                    write('re-QE due: ' + reqe.debts.length + ' usage-switched run(s) kept same-family QE — run `dz reqe` for the cross-family pass');
            }
            catch { /* advisory only */ }
            return 0;
        }
        // Compact human line — a short HH:MM / weekday hint on the resets, best-effort.
        const clock = (iso) => {
            if (!iso)
                return '?';
            try {
                return new Date(iso).toISOString().slice(11, 16);
            }
            catch {
                return '?';
            }
        };
        const s = u.sessionPct === null ? 'n/a' : '~' + u.sessionPct + '%';
        const binding = hasModelLimits && u.weeklyBindingModel !== undefined ? ' ' + u.weeklyBindingModel + '-bound' : '';
        const w = u.weeklyPct === null ? 'n/a' : '~' + u.weeklyPct + '%' + binding;
        // The weekly reset is WEEKLY: print the anchor verbatim (weekday + offset), not a bare clock
        // time — 'resets 08:59' reads as daily and hides the weekday (idea c8513be9: the bare form
        // misread a Monday reading as '41 minutes after the boundary' when the boundary was Wednesday's).
        const weeklyAnchorLabel = typeof lim.weeklyResetAnchor === 'string' && lim.weeklyResetAnchor !== ''
            ? lim.weeklyResetAnchor
            : clock(u.weeklyResetsAt);
        write('usage: session ' + s + ' (resets ' + clock(u.sessionResetsAt) + ') · week ' + w + ' (resets ' + weeklyAnchorLabel + ') · estimated');
        if (typeof lim.weeklyResetAnchor === 'string' && parseWeeklyResetAnchor(lim.weeklyResetAnchor)?.offsetMinutes === undefined) {
            write('  ⚠ weeklyResetAnchor has NO utc offset — the boundary follows the SERVER timezone, not your account\'s true reset instant (measured: the same moment lands a week apart under UTC vs +03:00). Pin it: "' + lim.weeklyResetAnchor + ' +03:00" (your offset) in .dz/config.json');
        }
        // re-QE debt surfacing (backlog 6b40e667): the moment someone checks usage is the moment a
        // usage-switched self-review debt should be visible. Best-effort — never breaks the contract.
        try {
            const reqe = scanReqeDebts(resolve(cwd, options.get('project') ?? '.'));
            if (reqe.debts.length > 0)
                write('re-QE due: ' + reqe.debts.length + ' usage-switched run(s) kept same-family QE — run `dz reqe` for the cross-family pass');
        }
        catch { /* advisory only */ }
        return 0;
    }
    catch {
        // never let a probe see a non-zero exit — print the all-null contract and exit 0.
        if (flags.has('json'))
            write(nullContract());
        else
            write('usage: unconfigured — set memory.usage.sessionTokenLimit / weeklyTokenLimit in .dz/config.json');
        return 0;
    }
}
/**
 * Which store a learning WRITE belongs to, resolved once and shared.
 *
 * `dz retro` reads a recurrence ledger and then calls `cmdTeach` to append to it. Before this
 * helper existed, a session mode split the two: the ledger was read from the project while the
 * write went to the home store, so the recurrence count never advanced and the drill threshold
 * could never be reached (cross-family QE, 2026-08-27). A read and its write must resolve the
 * same way or the counter they share is a fiction.
 */
function resolveLearningStore(options, cwd) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const target = resolveTeachTarget({
        flag: options.get('to'),
        env: process.env.DZ_LEARN,
        config: readTeachToConfig(projectRoot),
    });
    return {
        projectRoot,
        storeRoot: target.store === 'global' ? globalStoreRoot() : projectRoot,
        target,
    };
}
/** The store line for a learning write, carrying the path AND what chose it. */
function learningStoreLine(storeRoot, projectOption, target, verb) {
    const reason = teachReasonPhrase(target.reason);
    return storeLocationLine(describeStoreLocation(storeRoot, projectOption, target.store === 'global' ? 'global' : undefined), verb) + (reason ? '  [' + reason + ']' : '');
}
async function runTeachGuardReinforcement(projectRoot, dzId, reward) {
    const backend = resolveLearningBackend(projectRoot);
    backend.addSample({ dzId, kind: 'reinforce', reward, ts: new Date().toISOString() });
    return backend.train();
}
async function cmdTeach(options, flags, cwd, write, writeErr = (line) => { console.error(line); }, interactive = false, guardRunner = teachGuard, reinforceRunner = runTeachGuardReinforcement) {
    // WHICH store this lesson belongs to, and WHO decided (teach-chooses-its-store).
    // `--to` → `DZ_LEARN` → `.dz/config.json` learning.teachTo → project. The owner asked for a
    // per-session choice; for a CLI every invocation is a fresh process, so the only honest session
    // is the shell, and the only honest session state is an environment variable.
    // An unknown value is REFUSED here rather than defaulted: `DZ_LEARN=globl` silently writing to
    // the project store would be precisely the invisible mislabel this mode exists to prevent.
    let resolved;
    try {
        resolved = resolveLearningStore(options, cwd);
    }
    catch (e) {
        if (e instanceof TeachTargetError) {
            write('dz teach: ' + e.message);
            return 1;
        }
        throw e;
    }
    // The default keeps writing exactly where it wrote before this feature existed — MEASURED: this
    // repo's own store holds 361 records written under that behaviour, and every other user's store
    // is the same. Only an explicit choice moves it.
    const { storeRoot, target: teachTarget } = resolved;
    // The verb is per OUTCOME, not per command: a harmonize dry-run and a failed --reinforce READ
    // the store and change nothing, so saying "written" there is a false claim about what happened
    // (cross-family QE round 2, 2026-08-27).
    const storeLine = (verb) => learningStoreLine(storeRoot, options.get('project'), teachTarget, verb);
    // Vector tier (dz-rvf-vector-bridge FR-1): best-effort mirror AFTER the lexical write is
    // durable (I-3). Auto-gated on the agentdb memory backend / an explicit vector-engine config
    // (D3) — an unconfigured project runs ZERO vector code and its output stays byte-identical
    // to the pre-feature baseline (AC-1). Failures are queued + logged by the service itself and
    // NOT printed on the default path (teach must stay quiet/scriptable); only success emits.
    const emitMirror = async (root, records, source) => {
        if (flags.has('no-mirror') || records.length === 0 || !vectorMirrorEnabled(root))
            return;
        const receipt = await mirrorPatternsToVector(root, records, source);
        if (receipt.mirrored > 0)
            write(`  ↳ mirrored to vector tier (${receipt.engine ?? 'vector'})`);
    };
    // lesson-quarantine FR-8: the fresh-teach mirror carries the qStatus marker so the hook daemon
    // (which reads only the mirror's metadata) can exclude unproven lessons from auto-inject.
    const emitMirrorQ = async (root, records, source, quarantined) => {
        if (flags.has('no-mirror') || records.length === 0 || !vectorMirrorEnabled(root))
            return;
        const entries = records
            .map((r) => patternVectorEntry(r, source, quarantined ? { quarantined: true } : {}))
            .filter((e) => e !== undefined);
        const receipt = await mirrorEntriesToVector(root, entries);
        if (receipt.mirrored > 0)
            write(`  ↳ mirrored to vector tier (${receipt.engine ?? 'vector'})${quarantined ? ' [quarantined]' : ''}`);
    };
    // `dz teach --harmonize` — documented ALIAS of `dz vector harmonize`: SEMANTIC dedup of the
    // learned store. ONE implementation (harmonizeVectorStore), two entry points (QR-6). Routed
    // BEFORE the --from-json / single-teach paths. Dry-run by default; --apply after a backup.
    if (flags.has('harmonize')) {
        // `--harmonize --apply` MUTATES this store. A forgotten session mode pointing it at ~/.dz
        // and saying nothing was the exact hazard this feature exists to close (cross-family QE).
        // Suppressed under --json: this line ahead of the report made stdout unparseable, which is a
        // worse defect than the invisibility it was closing (measured live, cross-family QE round 2).
        if (!flags.has('json'))
            write(storeLine(flags.has('apply') ? 'written' : 'read'));
        return runHarmonize(storeRoot, options, flags, write, {
            store: join(storeRoot, '.dz'),
            storeChosenBy: teachTarget.reason,
        });
    }
    // Bulk import: `dz teach --from-json <file>` ingests a `dz recall --all --json`
    // export (an array of learned patterns) — the portable way to SHARE a learned
    // store across machines/sessions. Deduplicates by exact pattern text so a
    // re-import is idempotent; never overwrites existing patterns.
    const fromJson = options.get('from-json');
    if (fromJson) {
        let raw;
        try {
            raw = readFileSync(fromJson, 'utf-8');
        }
        catch {
            write(`dz teach --from-json: cannot read ${fromJson}`);
            return 1;
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            write(`dz teach --from-json: ${fromJson} is not valid JSON`);
            return 1;
        }
        if (!Array.isArray(parsed)) {
            write('dz teach --from-json: expected a JSON array (produced by `dz recall --all --json`)');
            return 1;
        }
        const importedKey = (p) => p.lessonForm !== undefined && p.lessonPairId !== undefined
            ? `${p.pattern}\u0000${p.lessonForm}\u0000${p.lessonPairId}`
            : `legacy\u0000${p.pattern}`;
        const existing = new Set(loadStorePatternsSync(storeRoot).map(importedKey));
        let imported = 0;
        let skipped = 0;
        const importedRecs = [];
        for (const item of parsed) {
            const p = item;
            if (!p || typeof p !== 'object') {
                skipped += 1;
                continue;
            }
            const pair = (p.lessonForm === 'specific' || p.lessonForm === 'class')
                && typeof p.lessonPairId === 'string' && p.lessonPairId !== ''
                ? { lessonForm: p.lessonForm, lessonPairId: p.lessonPairId }
                : {};
            const candidate = {
                pattern: typeof p.pattern === 'string' ? p.pattern : '',
                type: (typeof p.type === 'string' ? p.type : 'lesson-learned'),
                reward: typeof p.reward === 'number' ? Math.max(0, Math.min(1, p.reward)) : 0.8,
                domain: typeof p.domain === 'string' ? p.domain : 'general',
                ts: typeof p.ts === 'string' ? p.ts : new Date().toISOString(),
                source: 'dz-teach-import',
                ...pair,
            };
            if (candidate.pattern.trim() === '' || existing.has(importedKey(candidate))) {
                skipped += 1;
                continue;
            }
            const rec = candidate;
            await recordPattern(storeRoot, rec);
            existing.add(importedKey(rec));
            importedRecs.push(rec);
            imported += 1;
        }
        write(`Imported ${imported} pattern(s) from ${fromJson}`);
        write(`  Skipped ${skipped} (duplicates already in the store, or invalid entries)`);
        // Carrying a brain to a new machine goes through this path, and the mirror gate is the SAME one
        // teach uses — so without a config the whole import lands unindexed while `vector status` still
        // prints `pending: 0`. Say it here, where the user can act on it (FR-6).
        if (imported > 0 && !flags.has('no-mirror') && !vectorMirrorEnabled(storeRoot)) {
            write(`  ⚠ the vector mirror writer is OFF — these ${imported} pattern(s) are LEXICAL ONLY`);
            write(`     enable it in .dz/config.json (memory.backend=agentdb), then run: dz vector reindex`);
        }
        // Bulk import preserves the DOMAIN of every record, so it can put medical lessons in
        // a shared store as silently as a hand-typed teach — and it returned before the
        // advice single-teach prints. The same advice, at the same point in the flow: after
        // the write, naming the choice, blocking nothing.
        let resolvedImportRoot = storeRoot;
        try {
            resolvedImportRoot = realpathSync(storeRoot);
        }
        catch { /* unresolvable is not the brain */ }
        const importedMedical = importedRecs.filter((r) => DEFAULT_HELD_OUT_DOMAINS.map(canonicalDomainKey).includes(canonicalDomainKey(r.domain)));
        if (importedMedical.length > 0) {
            const advice = renderSharedStoreAdvice(importedMedical[0]?.domain, resolvedImportRoot);
            if (advice !== '') {
                write(`  ⚠ ${importedMedical.length} of the imported lesson(s) carry a medical domain.`);
                write(advice);
            }
        }
        write(`  Backend: memory (@dzhechkov/memory)  Total now: ${loadStorePatternsSync(storeRoot).length}`);
        write(storeLine('written'));
        // ONE batched mirror call through the same seam as single-teach (QR-6 — no bespoke path).
        await emitMirror(storeRoot, importedRecs, 'dz-teach-import');
        if (imported > 0) {
            const report = await harmonizeVectorStore(storeRoot, {});
            write(`  ℹ ${imported} imported — ${report.clusters.length} near-duplicate cluster(s): review with dz vector harmonize (dry-run); merge with dz vector harmonize --apply after backup`);
        }
        return 0;
    }
    const reinforce = options.get('reinforce');
    if (reinforce !== undefined && reinforce.trim() !== '') {
        const backend = resolveLearningBackend(storeRoot);
        const sampleReward = options.has('reward') ? parseFloat(options.get('reward') ?? '0.8') : undefined;
        backend.addSample({
            dzId: reinforce,
            kind: 'reinforce',
            ts: new Date().toISOString(),
            ...(sampleReward !== undefined ? { reward: sampleReward } : {}),
        });
        const trained = await backend.train();
        if (trained.flushed > 0) {
            write(`↳ reinforced ${reinforce}`);
            // lesson-quarantine: reinforcement IS promotion — keep the hook daemon's mirror in step.
            const clearedQ = clearAgentdbQuarantine(storeRoot, [reinforce]);
            if (clearedQ.cleared > 0)
                write(`  ↳ promoted out of quarantine (mirror updated)`);
            write(storeLine('written'));
            return 0;
        }
        // HIGH-fix: a no-match must NOT auto-teach the raw argument — callers pass dzIds or truncated
        // text, so auto-teach minted garbage lessons (observed live). Fail with an honest advisory:
        // if the lesson is genuinely new, the caller teaches it EXPLICITLY with the full text.
        write(`dz teach --reinforce: no existing pattern matched ${JSON.stringify(reinforce)} — nothing reinforced`);
        write('  If this is a genuinely NEW lesson, teach it explicitly:  dz teach "<full lesson text>" --reward <0-1> --domain <area>');
        write('  To find the exact pattern to reinforce:  dz recall "<terms>"  (match by its full text)');
        // WHICH store was searched — otherwise "no existing pattern matched" reads as "this lesson is
        // new" when it may simply be sitting in the other store. `read`, because nothing was written.
        write(storeLine('read'));
        return 1;
    }
    const pattern = options.get('_positional_0');
    if (!pattern) {
        write('dz teach: pattern description required');
        write('  Example:   dz teach "Used DataLoader to fix N+1 query" --reward 0.9 --domain performance');
        write('  Import:    dz teach --from-json patterns.json   (bulk-import a `dz recall --all --json` export)');
        write('  Harmonize: dz teach --harmonize [--apply]       (semantic dedup — alias of dz vector harmonize; dry-run default)');
        write('  Store:     dz teach "<lesson>" --to project|global   (project = this repo; global = ~/.dz, shared across every project)');
        write('             session default: export DZ_LEARN=global   ·  project default: .dz/config.json → learning.teachTo');
        return 1;
    }
    const reward = parseFloat(options.get('reward') ?? '0.8');
    const domain = options.get('domain') ?? 'general';
    const classWasRequested = options.has('class-form') || flags.has('class-form');
    const lessonForms = normalizeLessonForms(pattern, options.get('class-form'));
    let guardedExisting;
    if (flags.has('guard')) {
        const verdict = await guardRunner(storeRoot, pattern, { reward: Math.max(0, Math.min(1, reward)) });
        if (verdict.action === 'reinforce') {
            if (lessonForms.classForm !== undefined) {
                const existing = loadStoreRecords(storeRoot).find((record) => record.id === verdict.dzId);
                if (existing !== undefined) {
                    guardedExisting = { dzId: verdict.dzId, cosine: verdict.cosine, pattern: recordToPattern(existing) };
                }
                else {
                    write(`dz teach --guard: matched pattern ${verdict.dzId} was not found in the lexical store — teaching the lesson normally`);
                }
            }
            else {
                const trained = await reinforceRunner(storeRoot, verdict.dzId, Math.max(0, Math.min(1, reward)));
                if (trained.flushed > 0) {
                    write(`↳ reinforced existing pattern ${verdict.dzId} (cos=${verdict.cosine.toFixed(2)}) — not re-added`);
                    const clearedQ = clearAgentdbQuarantine(storeRoot, [verdict.dzId]);
                    if (clearedQ.cleared > 0)
                        write('  ↳ promoted out of quarantine (mirror updated)');
                    return 0;
                }
                write(`dz teach --guard: reinforce of ${verdict.dzId} did not flush (backend off or write failure) — teaching the lesson normally instead`);
            }
        }
    }
    // Distill pattern into actionable rule (claude-smart inspired)
    // Convert "what happened" into "what to do next time"
    const isRule = pattern.toLowerCase().startsWith('always') || pattern.toLowerCase().startsWith('never') ||
        pattern.toLowerCase().startsWith('when') || pattern.toLowerCase().startsWith('before') ||
        pattern.toLowerCase().startsWith('after') || pattern.toLowerCase().startsWith('use') ||
        pattern.toLowerCase().startsWith('avoid') || pattern.toLowerCase().startsWith('prefer');
    const type = options.get('type') ?? (isRule ? 'rule' : reward >= 0.8 ? 'success-pattern' : 'lesson-learned');
    // Typed through the shared schema (harness-core owns PatternRecord) so the
    // write side and the read side (recommend's loadPatterns) can never drift —
    // a field rename here is a compile error, not a silently re-muted loop (audit #2).
    const entry = guardedExisting?.pattern ?? {
        pattern: lessonForms.specific,
        type: type,
        reward: Math.max(0, Math.min(1, reward)),
        domain,
        ts: new Date().toISOString(),
        source: 'dz-teach',
    };
    // Tier-2 (ADR-005): persist through the unified @dzhechkov/memory store. recordPattern
    // folds any legacy .dz/patterns.jsonl into the backend (idempotent) and returns the
    // total count. The lossy `npx agentdb add` dual-write was removed in Tier-1 (audit #6).
    // lesson-quarantine (opt-in): a fresh lesson is a HYPOTHESIS until it earns promotion.
    const quarantineOn = readMemoryLearningConfig(storeRoot).quarantine;
    const stored = await recordLessonForms(storeRoot, entry, lessonForms.classForm, quarantineOn ? { quarantine: true } : {});
    let recordsToMirror = stored.records;
    let commandFailed = stored.class === 'failed';
    let reinforced = false;
    if (guardedExisting !== undefined) {
        let reinforceId = guardedExisting.dzId;
        if (stored.class === 'stored') {
            const specificRow = stored.records.find((row) => row.lessonForm === 'specific');
            if (specificRow !== undefined)
                reinforceId = patternRecordId(specificRow);
            if (reinforceId !== guardedExisting.dzId) {
                const removed = removePatternsByIds(storeRoot, new Set([guardedExisting.dzId]));
                if (removed.error !== undefined || removed.removed === 0) {
                    commandFailed = true;
                    writeErr(`dz teach --guard: class pair stored, but old pattern cleanup failed${removed.error === undefined ? '' : ` — ${removed.error}`}`);
                }
            }
        }
        else if (stored.class === 'failed') {
            const partialSpecific = stored.records.find((row) => row.lessonForm === 'specific');
            if (partialSpecific !== undefined && patternRecordId(partialSpecific) !== guardedExisting.dzId) {
                const rolledBack = removePatternsByIds(storeRoot, new Set([patternRecordId(partialSpecific)]));
                if (rolledBack.error !== undefined)
                    writeErr(`dz teach --guard: partial enrichment rollback failed — ${rolledBack.error}`);
            }
            recordsToMirror = [];
            reinforceId = guardedExisting.dzId;
        }
        if (!commandFailed) {
            const trained = await reinforceRunner(storeRoot, reinforceId, Math.max(0, Math.min(1, reward)));
            reinforced = trained.flushed > 0;
            if (reinforced) {
                const clearedQ = clearAgentdbQuarantine(storeRoot, [reinforceId]);
                if (clearedQ.cleared > 0)
                    write('  ↳ promoted out of quarantine (mirror updated)');
            }
        }
    }
    const count = guardedExisting === undefined ? stored.count : loadStorePatternsSync(storeRoot).length;
    write(`${guardedExisting !== undefined && stored.class === 'stored' ? 'Enriched' : 'Learned'}: "${pattern.slice(0, 60)}${pattern.length > 60 ? '...' : ''}"`);
    write(`  Domain: ${entry.domain}  Reward: ${entry.reward}  Backend: memory (@dzhechkov/memory)`);
    write(`  Total patterns: ${count}`);
    // WHERE the write landed. MEASURED before this line existed: teach printed the pattern, the
    // domain, the reward and the backend — and not one word about the path, so a store written to
    // the wrong directory was indistinguishable from one written to the right one. A user running
    // this in eight project directories gets eight isolated stores and believes they accumulate.
    // ...and WHY that store. Without this a user who exported DZ_LEARN three hours ago and forgot
    // sees a path, cannot tell what chose it, and has no reason to question it. `default` adds
    // nothing, so the line stays byte-identical for everyone who set nothing.
    write(storeLine('written'));
    if (stored.class === 'stored')
        write('  Class form: stored separately and linked to the specific lesson');
    if (classWasRequested && stored.class === 'absent')
        write('  Class form: skipped; the specific lesson was saved');
    if (stored.class === 'rejected')
        writeErr(`dz teach: class form rejected — ${stored.reason ?? 'invalid class form'}; the specific lesson was saved`);
    if (stored.class === 'failed')
        writeErr(`dz teach: specific stored; class failed — ${stored.reason ?? 'unknown storage failure'}`);
    if (guardedExisting !== undefined && stored.class === 'stored') {
        write(commandFailed
            ? '  Guard: class enrichment stored; reinforcement skipped because old-pattern cleanup failed'
            : reinforced
                ? `  Guard: enriched existing pattern (cos=${guardedExisting.cosine.toFixed(2)}), then reinforced the linked specific form`
                : '  Guard: class enrichment stored; reinforcement did not flush');
    }
    if (!classWasRequested && interactive) {
        write('  Rule of one place or of a class? Optional: add --class-form when a future reader needs the why for structure, interfaces, or maintainability; skip when scope, risk, time, and cost are low or standards, policy, or documentation already cover it.');
    }
    // ADVICE, not a gate. Someone putting medical lessons in a shared store owns both
    // directories and this binary; refusing would be defending a user against themselves,
    // which this design does not attempt. Making the choice INFORMED is the part that is
    // ours to do — the write has already happened when this prints.
    // RESOLVE before deciding. A symlink named `.health-brain` pointing at a shared project
    // silenced this advice in exactly the case it exists for.
    let resolvedRoot = storeRoot;
    try {
        resolvedRoot = realpathSync(storeRoot);
    }
    catch { /* a path we cannot resolve is not the brain */ }
    const sharedAdvice = renderSharedStoreAdvice(domain, resolvedRoot);
    if (sharedAdvice !== '')
        write(sharedAdvice);
    if (quarantineOn) {
        write('  ⚠ quarantined: excluded from auto-inject, damped in recall — promote by confirming it (dz teach --reinforce "<text>") or dz recall --promote <dzId> --apply');
    }
    // The lexical write above is durable — the vector mirror is strictly best-effort (I-3).
    await emitMirrorQ(storeRoot, recordsToMirror, 'dz-teach', quarantineOn);
    return commandFailed ? 1 : 0;
}
async function cmdConsolidate(options, flags, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const sessionsDirOpt = options.get('sessions-dir');
    const pruneNoise = flags.has('prune-noise');
    // lesson-quarantine FR-7: expiry is a SEPARATE, explicit surface — never coupled to prune-noise
    // (the recalled decay-vs-noise lesson: valid-but-unproven is not garbage). Dry-run by default.
    if (flags.has('prune-quarantine')) {
        const cfg = readMemoryLearningConfig(projectRoot);
        const res = pruneQuarantinePatterns(projectRoot, { dryRun: !flags.has('apply'), expireDays: cfg.quarantineExpireDays });
        if (!flags.has('apply')) {
            write(`dz consolidate --prune-quarantine: DRY RUN — ${res.candidates.length} expired quarantined lesson(s) (> ${cfg.quarantineExpireDays}d, never reinforced)`);
            for (const c of res.candidates)
                write(`  [${c.ageDays < 0 ? '?' : c.ageDays}d] ${c.dzId} ${c.text.slice(0, 70)}`);
            if (res.candidates.length > 0)
                write('  → re-run with --apply to remove (snapshots first); or promote keepers: dz recall --promote <dzId> --apply');
            return 0;
        }
        if (res.error !== undefined) {
            write(`dz consolidate --prune-quarantine: ${res.error}`);
            return 1;
        }
        write(`dz consolidate --prune-quarantine: removed ${res.removed} expired quarantined lesson(s)`);
        if (res.snapshot !== undefined)
            write(`  snapshot: ${res.snapshot}`);
        return 0;
    }
    // --prune-noise: RETRO-PRUNE legacy noise (tool telemetry + system-wrapper "responses") from
    // the lexical store AND the agentdb vector mirror BEFORE harvesting, so this run's watermark
    // never re-learns from junk. Best-effort — a prune error is reported, never fatal.
    //
    // DRY-RUN BY DEFAULT. The learned store lives in a git-ignored `.dz/` and has no history: a
    // wrong sweep is unrecoverable. `--prune-noise` therefore only PREVIEWS; `--apply` performs the
    // deletion, and snapshots the store to a restorable JSON export first. (Behaviour change: before
    // this, `--prune-noise` deleted immediately and silently.)
    const applyPrune = flags.has('apply');
    let pruned;
    let pruneSnapshot;
    if (pruneNoise) {
        if (applyPrune) {
            const dest = join(projectRoot, '.dz', `patterns-pre-prune-${Date.now()}.json`);
            const snap = snapshotStore(projectRoot, dest);
            if (snap.error === undefined)
                pruneSnapshot = snap.path;
            else
                write(`  ⚠ snapshot failed (${snap.error}) — prune SKIPPED, the store is not versioned`);
            if (snap.error !== undefined)
                return 1; // never delete what we could not back up
        }
        pruned = pruneNoisePatterns(projectRoot, { dryRun: !applyPrune });
    }
    // Throw-safety (QE P3): this command also runs DETACHED from the SessionEnd hook (stdio
    // ignored) — an uncaught store/watermark error would be fully invisible there. Catch, leave
    // an observable note next to the session markers, and report on stdout for manual runs.
    let result;
    try {
        result = await consolidateSessions(projectRoot, {
            ...(sessionsDirOpt !== undefined ? { sessionsDir: resolve(cwd, sessionsDirOpt) } : {}),
            // --no-mirror disables the Option-C vector-index mirror; default is auto (agentdb backend only).
            ...(flags.has('no-mirror') ? { mirrorAgentdb: false } : {}),
        });
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        try {
            const { appendFileSync } = await import('node:fs');
            appendFileSync(join(projectRoot, '.dz', 'sessions.jsonl'), JSON.stringify({ event: 'consolidate', ts: new Date().toISOString(), error: msg }) + '\n');
        }
        catch { /* best-effort */ }
        write(`dz consolidate: failed — ${msg}`);
        return 1;
    }
    const sourceLabel = {
        explicit: 'explicit --sessions-dir',
        'dz-sessions': '.dz/sessions (dz hooks)',
        'claude-transcripts': 'auto-discovered Claude Code transcripts',
        none: 'none found',
    };
    // Echo active flags in the header (learned pattern: flags must be visible in command output).
    write(`dz consolidate${pruneNoise ? ' (--prune-noise)' : ''}`);
    if (pruned !== undefined) {
        const verb = pruned.dryRun === true ? 'would prune' : 'pruned';
        write(`  ${verb}: ${pruned.lexicalRemoved} lexical, ${pruned.vectorRemoved} vector`);
        for (const c of (pruned.candidates ?? []).slice(0, 10)) {
            write(`    ${c.id}  ${c.text.replace(/\s+/g, ' ').slice(0, 72)}`);
        }
        const extra = (pruned.candidates?.length ?? 0) - 10;
        if (extra > 0)
            write(`    … and ${extra} more`);
        if (pruned.dryRun === true && pruned.lexicalRemoved + pruned.vectorRemoved > 0) {
            write('  DRY RUN — nothing deleted. Re-run with --apply to remove (snapshots first).');
        }
        if (pruneSnapshot !== undefined)
            write(`  snapshot: ${pruneSnapshot}`);
        if (pruned.error !== undefined)
            write(`  Prune: ${pruned.error}`);
    }
    write(`  Sessions dir: ${result.sessionsDir}  (${sourceLabel[result.source]})`);
    if (result.harvested === 0) {
        if (result.source === 'none') {
            write(`  No transcript directory found. Auto-discovery looked in .dz/sessions and your`);
            write(`  Claude Code transcript dir; pass --sessions-dir <dir> to point at one explicitly.`);
        }
        else {
            write(`  No harvestable session signal (empty dir, or already consolidated up to the watermark).`);
        }
    }
    else {
        write(`  Harvested: ${result.harvested}  Added to memory: ${result.added}`);
        if (result.watermark !== undefined)
            write(`  Watermark: ${result.watermark}`);
        // Option C: vector-index mirror status (honest — shows why when skipped/failed).
        if (result.mirrored > 0)
            write(`  Mirrored to agentdb vector index: ${result.mirrored}`);
        if (result.mirrorError !== undefined)
            write(`  Mirror: ${result.mirrorError}`);
    }
    // SAFLA delta ranking (rUv-scout #2 Phase 2): rank lessons by payoff SLOPE from reinforce history.
    // INFORMATIONAL — deletes nothing (a stale-but-valid lesson is not "noise"). Surfaced so the operator
    // can SEE which lessons are still paying off vs going quiet, before any manual prune decision.
    try {
        const delta = lessonDeltaReport(projectRoot, { topN: 5 });
        if (delta.scored > 0) {
            write(`  SAFLA delta (payoff slope over ${delta.scored} lesson(s) with reinforce history):`);
            for (const r of delta.rising)
                write(`    ↑ ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(3)}  ${r.pattern.replace(/\s+/g, ' ').slice(0, 64)}`);
            if (delta.stale.length > 0) {
                write(`    stale (slope ≤ 0 — prune CANDIDATES, not deleted; review with dz recall):`);
                for (const r of delta.stale)
                    write(`    ↓ ${r.delta.toFixed(3)}  ${r.pattern.replace(/\s+/g, ' ').slice(0, 64)}`);
            }
        }
    }
    catch { /* best-effort — the ranking is advisory, never fails the consolidate */ }
    return 0;
}
function recallUsagePatternRefs(projectRoot) {
    return loadStoreRecords(projectRoot).map((record) => {
        const pattern = recordToPattern(record);
        return { dzId: record.id, pattern: pattern.pattern, domain: pattern.domain, reward: pattern.reward };
    });
}
function readRecallUsageReport(projectRoot) {
    let text = '';
    const logPath = join(projectRoot, RECALL_USAGE_LOG_RELATIVE);
    try {
        if (existsSync(logPath))
            text = readFileSync(logPath, 'utf-8');
    }
    catch {
        text = '';
    }
    return buildRecallUsageReport(recallUsagePatternRefs(projectRoot), parseRecallUsageLog(text));
}
function fmtUsageRow(row) {
    const last = row.lastReadAt !== undefined ? ` last=${row.lastReadAt}` : '';
    const score = row.avgScore !== undefined ? ` avg=${row.avgScore.toFixed(3)}` : '';
    const domain = row.domain !== undefined ? ` (${row.domain})` : '';
    return `${row.reads}×${last}${score} ${row.dzId}${domain} ${row.pattern.slice(0, 100)}`;
}
function cmdRecallUsage(options, flags, projectRoot, write) {
    const raw = readRecallUsageReport(projectRoot);
    // The hold-out applies to EVERY surface that hands out lesson TEXT, not only to the
    // one labelled "export". `--usage --json` prints whole lessons in its `top` and
    // `neverRead` lists, so it is an export by behaviour whatever it is called — a
    // self-audit before review found health-research lesson text sitting in both. A
    // guarantee that covers only the surface you were thinking about is not a guarantee.
    const heldOut = heldOutAfterOptIn(options.get('include-domain'));
    // EVERY list of records, not the two that were obvious. A first pass held out `top`
    // and `neverRead` and a health lesson still came out — in `all`, a third list further
    // down the same object. Enumerating the lists you remembered is how the surface leaks.
    const top = applyExportHoldout(raw.top, heldOut);
    const neverRead = applyExportHoldout(raw.neverRead, heldOut);
    // `unknown` is deliberately NOT held out: RecallUsageStat carries counters and
    // timestamps only — no domain, no lesson text — so there is nothing in it to withhold.
    // Filtering it would be theatre, and theatre in a privacy control is worse than a gap
    // because it looks like coverage.
    const every = applyExportHoldout(raw.all ?? [], heldOut);
    const withheld = top.withheld.length + neverRead.withheld.length + every.withheld.length;
    const report = {
        ...raw,
        top: top.exported,
        neverRead: neverRead.exported,
        ...(raw.all === undefined ? {} : { all: every.exported }),
    };
    const holdoutNote = renderHoldoutNote([top, neverRead, every]
        .reduce((a, b) => (b.withheld.length > a.withheld.length ? b : a)));
    if (flags.has('json')) {
        write(JSON.stringify({
            ...report,
            log: join(projectRoot, RECALL_USAGE_LOG_RELATIVE),
            retention: { maxBytes: RECALL_USAGE_LOG_MAX_BYTES },
            withheld,
            withheldDomains: [...new Set([...top.domains, ...neverRead.domains, ...every.domains])].sort(),
        }));
        if (withheld > 0 && holdoutNote !== '')
            process.stderr.write(`${holdoutNote}\n`);
        return 0;
    }
    const displayLimit = Math.max(1, parseInt(options.get('limit') ?? '20', 10) || 20);
    write(`dz recall --usage  —  ${report.usedPatterns}/${report.totalPatterns} pattern(s) read, ${report.totalReads} read event(s)`);
    write(`  log: ${RECALL_USAGE_LOG_RELATIVE} (bounded at ${RECALL_USAGE_LOG_MAX_BYTES} bytes)`);
    if (report.invalidLines > 0)
        write(`  skipped invalid/torn line(s): ${report.invalidLines}`);
    if (report.unknownReadPatterns > 0)
        write(`  usage rows for missing pattern id(s): ${report.unknownReadPatterns}`);
    write('  most read:');
    if (report.top.length === 0) {
        write('    none yet');
    }
    else {
        for (const row of report.top.slice(0, displayLimit))
            write(`    ${fmtUsageRow(row)}`);
        if (report.top.length > displayLimit)
            write(`    ... ${report.top.length - displayLimit} more (use --json for the full list)`);
    }
    write('  never read:');
    if (report.neverRead.length === 0) {
        write('    none');
    }
    else {
        for (const row of report.neverRead.slice(0, displayLimit))
            write(`    ${row.dzId}${row.domain !== undefined ? ` (${row.domain})` : ''} ${row.pattern.slice(0, 100)}`);
        if (report.neverRead.length > displayLimit)
            write(`    ... ${report.neverRead.length - displayLimit} more (use --json for the full list)`);
    }
    if (withheld > 0 && holdoutNote !== '') {
        write(holdoutNote);
    }
    return 0;
}
/**
 * `dz recall --forget <dzId>[,<dzId>…] [--apply]` — remove NAMED records from the learned store.
 *
 * `--prune-noise` only removes what `isNoiseInsight` recognises. It cannot reach the other junk
 * class: records that are structurally fine but were never lessons. This repo has two of them —
 * `mismatch probe A` / `match probe B`, written into the LIVE store on 2026-07-07 by the
 * `dz teach --project <relative>` path bug fixed in `83b1bac` (the relative root resolved to the
 * cwd store instead of the temp project). The bug is gone; its residue is not, and no predicate
 * will ever classify it.
 *
 * DRY-RUN BY DEFAULT, and it snapshots before deleting: `.dz/` is git-ignored and unversioned, so a
 * mistaken id is unrecoverable. Use `dz recall --all --json` to find ids.
 */
async function cmdRecallForget(options, flags, projectRoot, write) {
    const raw = options.get('forget') ?? '';
    const ids = new Set(raw.split(',').map((s) => s.trim()).filter((s) => s !== ''));
    if (ids.size === 0) {
        write('dz recall --forget: no ids given (comma-separated dzIds; find them with `dz recall --all --json`)');
        return 1;
    }
    // Use the CANONICAL store ids, not `patternRecordId(pattern)`. `removePatternsByIds` matches on
    // `MemoryRecord.id`, and the two coincide only for records dz itself wrote (`dz teach` stores the
    // hash as the id). A record seeded or migrated with a different id would be reported as "found",
    // then silently NOT removed — the command would claim success while deleting nothing.
    const known = new Map(loadStoreRecords(projectRoot).map((r) => [r.id, r.text]));
    const found = [...ids].filter((id) => known.has(id));
    const missing = [...ids].filter((id) => !known.has(id));
    for (const id of found)
        write(`  ${id}  ${(known.get(id) ?? '').replace(/\s+/g, ' ').slice(0, 72)}`);
    for (const id of missing)
        write(`  ${id}  (not in the store — nothing to forget)`);
    if (found.length === 0) {
        write('dz recall --forget: nothing matched.');
        return 1;
    }
    if (!flags.has('apply')) {
        write(`dz recall --forget: DRY RUN — ${found.length} record(s) would be removed. Re-run with --apply.`);
        return 0;
    }
    const dest = join(projectRoot, '.dz', `patterns-pre-forget-${Date.now()}.json`);
    const snap = snapshotStore(projectRoot, dest);
    if (snap.error !== undefined) {
        write(`dz recall --forget: snapshot failed (${snap.error}) — nothing removed; the store is not versioned`);
        return 1;
    }
    const result = removePatternsByIds(projectRoot, new Set(found));
    write(`dz recall --forget: removed ${result.removed} record(s)`);
    write(`  snapshot: ${snap.path} (${snap.count} record(s))`);
    if (result.error !== undefined)
        write(`  ⚠ ${result.error}`);
    write('  the vector mirror still holds them — run `dz vector reindex` to resync');
    return 0;
}
/**
 * Run `fn` with anything written to STDOUT by code we do not own routed to STDERR instead.
 *
 * Used to keep `--json` output parseable: a dependency that greets stdout on first load (currently
 * transformers.js) would otherwise sit in front of the JSON array. Nothing is swallowed — the text
 * still reaches the terminal, on the stream diagnostics belong on. Restoration is in `finally`, so a
 * throwing `fn` cannot leave stdout redirected.
 */
export async function withForeignStdoutOnStderr(fn) {
    // Re-entrant: a nested call must not restore stdout when the INNER scope ends, or the outer scope
    // silently loses its guard. Depth-counted, and only the outermost exit restores (found by
    // independent review). Backpressure is not proxied — every writer here emits short diagnostic
    // lines, and returning stderr's own boolean is closer to the truth than inventing one.
    // Counted for EVERY caller, nested or concurrent. The first version only incremented when it
    // installed the patch, so an overlapping call that arrived second was not counted — and when the
    // FIRST finished it restored stdout while the second was still running, leaking exactly what the
    // guard exists to catch (found by cross-family review). The original `write` is captured once, by
    // the caller that installs the patch, and restored by the last one to leave.
    if (stdoutRedirectDepth === 0) {
        originalStdoutWrite = process.stdout.write;
        process.stdout.write = ((chunk, ...rest) => process.stderr.write(chunk, ...rest));
    }
    stdoutRedirectDepth += 1;
    try {
        return await fn();
    }
    finally {
        stdoutRedirectDepth -= 1;
        // the EXACT original function, not a fresh binding of it
        if (stdoutRedirectDepth === 0 && originalStdoutWrite !== undefined) {
            process.stdout.write = originalStdoutWrite;
            originalStdoutWrite = undefined;
        }
    }
}
let stdoutRedirectDepth = 0;
let originalStdoutWrite;
/**
 * `dz recall --promote <dzId>[,<dzId>…] [--apply]` — lift quarantine from NAMED records
 * (lesson-quarantine FR-6b). Dry-run by default, the --forget symmetry. Also clears the
 * agentdb mirror's qStatus (best-effort) so the hook daemon stops excluding promoted lessons.
 */
async function cmdRecallPromote(options, flags, projectRoot, write) {
    const ids = (options.get('promote') ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    if (ids.length === 0) {
        write('dz recall --promote: no ids given (comma-separated dzIds; quarantined ones are marked ⚠q in recall)');
        return 1;
    }
    if (!flags.has('apply')) {
        const records = loadStoreRecords(projectRoot);
        const found = ids.filter((id) => records.some((r) => r.id === id));
        write(`dz recall --promote: DRY RUN — ${found.length}/${ids.length} id(s) match the store. Re-run with --apply to promote.`);
        return 0;
    }
    const res = await promotePatterns(projectRoot, ids);
    // Codex-QE finding 5: even on a mid-batch failure, the ALREADY-promoted records must get their
    // mirror rows cleared — otherwise the canonical store and the hook-visible mirror split-brain.
    if (res.promoted.length > 0) {
        const cleared = clearAgentdbQuarantine(projectRoot, res.promoted);
        if (cleared.cleared > 0)
            write(`  ↳ mirror updated (${cleared.cleared} row(s) un-quarantined in agentdb)`);
        else if (cleared.error !== undefined)
            write(`  ⚠ mirror not updated (${cleared.error}) — run dz vector reindex to resync`);
    }
    if (!res.ok) {
        write(`dz recall --promote: failed — ${res.error ?? 'unknown error'} (promoted so far: ${res.promoted.length})`);
        return 1;
    }
    write(`dz recall --promote: promoted ${res.promoted.length} record(s)`);
    if (res.notQuarantined.length > 0)
        write(`  already promoted (not quarantined): ${res.notQuarantined.join(', ')}`);
    if (res.notFound.length > 0)
        write(`  not found: ${res.notFound.join(', ')}`);
    return 0;
}
async function cmdRecall(options, flags, cwd, write, writeErr, classMatcher) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const asJson = flags.has('json');
    const all = flags.has('all');
    if (flags.has('usage'))
        return cmdRecallUsage(options, flags, projectRoot, write);
    if (options.has('forget'))
        return cmdRecallForget(options, flags, projectRoot, write);
    if (options.has('promote'))
        return cmdRecallPromote(options, flags, projectRoot, write);
    // --all: dump the entire learned store (backend-agnostic, via loadStorePatternsSync).
    // With --json this is the portable export the agentdb-memory MCP bridge consumes.
    if (all) {
        // ISOLATION (health-advisor slice H, ADR-003). This command is THE portable sharing
        // form — it is documented as such and the agentdb bridge consumes it — so it is the
        // realistic path by which a learned store leaves this machine. `health-research`
        // carries lessons drawn from one person's investigations and is held back unless the
        // caller names it. This replaced a text-inspecting privacy guard that seven rounds of
        // review could not make correct: a tag set by the writer is decidable, prose is not.
        const allPatterns = loadStorePatternsSync(projectRoot);
        const holdout = applyExportHoldout(allPatterns, heldOutAfterOptIn(options.get('include-domain')));
        const classByPair = new Map(holdout.exported
            .filter((row) => row.lessonForm === 'class' && row.lessonPairId !== undefined)
            .map((row) => [row.lessonPairId, row.pattern]));
        const patterns = holdout.exported.map((row) => {
            const classForm = row.lessonForm === 'specific' && row.lessonPairId !== undefined
                ? classByPair.get(row.lessonPairId)
                : undefined;
            return classForm === undefined ? row : { ...row, classForm };
        });
        const holdoutNote = renderHoldoutNote(holdout);
        // The opt-in is honoured without argument — and named out loud. A flag that silently
        // includes medical lessons in a portable export is a flag whose consequence the user
        // has to remember; one that says what it just handed over is a flag they can act on.
        const optedIn = options.get('include-domain');
        if (optedIn !== undefined && optedIn.trim() !== '') {
            // Count against the SPLIT list, the same way heldOutAfterOptIn parses it. Comparing
            // each record to the whole unsplit string reported `0 of 2` for a comma-separated
            // opt-in that had just exported a medical lesson — a warning that undercounts the
            // thing it warns about is worse than none.
            const optedKeys = new Set(optedIn.split(',').map((d) => canonicalDomainKey(d)).filter((d) => d !== ''));
            const medicalKeys = new Set(DEFAULT_HELD_OUT_DOMAINS.map(canonicalDomainKey));
            const releasedKeys = [...optedKeys].filter((k) => medicalKeys.has(k));
            const releasedCount = allPatterns.filter((p) => releasedKeys.includes(canonicalDomainKey(p.domain))).length;
            if (releasedKeys.length > 0) {
                process.stderr.write(`  ⚠ --include-domain ${releasedKeys.join(',')}: this export CONTAINS lessons from a medical `
                    + `domain (${releasedCount} of ${allPatterns.length}). They travel with the file wherever it `
                    + `goes. Nothing was blocked — this is your call.\n`);
            }
        }
        if (flags.has('stats')) {
            // `stats` is computed from the UNFILTERED store, and `topUses` carries whole
            // lesson text. Filtering `patterns` two lines above and serialising this untouched
            // exported exactly what had just been withheld — found by review immediately after
            // I had written the lesson "cover every surface", in the same function. The
            // per-domain histogram goes too: it names the domain and its size.
            const rawStats = storeStats(projectRoot);
            const topHoldout = applyExportHoldout(rawStats.topUses, heldOutAfterOptIn(options.get('include-domain')));
            const perDomain = Object.fromEntries(Object.entries(rawStats.perDomain).filter(([d]) => !holdout.domains.includes(canonicalDomainKey(d))));
            const generalizedPairs = new Set(patterns.flatMap((p) => p.lessonPairId === undefined ? [] : [p.lessonPairId]));
            const unpairedLessons = patterns.filter((p) => p.lessonPairId === undefined).length;
            const stats = {
                ...rawStats,
                topUses: topHoldout.exported,
                perDomain,
                generalized: generalizedPairs.size,
                logicalLessons: generalizedPairs.size + unpairedLessons,
            };
            const backendStats = resolveLearningBackend(projectRoot).getStats();
            if (asJson) {
                write(JSON.stringify({ patterns, stats, learning: backendStats, withheld: holdout.withheld.length, withheldDomains: holdout.domains }));
                if (holdoutNote !== '')
                    process.stderr.write(`${holdoutNote}\n`);
                return 0;
            }
            write(`dz recall --all --stats  —  ${patterns.length} learned pattern(s)`);
            if (holdoutNote !== '')
                write(holdoutNote);
            write(`  backend: ${backendStats.backend}${backendStats.advisory !== undefined ? ` (${backendStats.advisory})` : ''}`);
            write(`  domains: ${Object.entries(stats.perDomain).map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`);
            write(`  exact-dup groups: ${stats.exactDupGroups}`);
            write(`  generalized: ${stats.generalized} of ${stats.logicalLessons} lessons`);
            write(`  re-teach trend: ${stats.teachEvents} teach event(s), ${stats.reinforceEvents} reinforce event(s)`);
            write('  top uses:');
            for (const row of stats.topUses)
                write(`    ${row.uses}× [${row.reward.toFixed(2)}] (${row.domain}) ${row.pattern.slice(0, 80)}`);
            write('  near-dup density: run dz vector harmonize (dry-run)');
            return 0;
        }
        if (asJson) {
            // The note goes to STDERR so the JSON on stdout stays machine-parsable — but it is
            // still SAID. A silent hold-out would let the reader believe they exported the whole
            // store, and would make a broken hold-out look exactly like an empty domain.
            write(JSON.stringify(patterns));
            if (holdoutNote !== '')
                process.stderr.write(`${holdoutNote}\n`);
        }
        else {
            write(`dz recall --all  —  ${patterns.length} learned pattern(s)`);
            for (const p of patterns)
                write(`  [${p.reward.toFixed(2)}] (${p.domain}) ${p.pattern.slice(0, 80)}`);
            if (holdoutNote !== '')
                write(holdoutNote);
        }
        return 0;
    }
    const query = options.get('_positional_0');
    if (!query) {
        write('dz recall: query required (or use --all to dump every learned pattern)');
        write('  Example: dz recall "graphql api design" --limit 5');
        write('  Books:   dz recall "replication topology" --books   (search digitized-book KUs)');
        write('  Export:  dz recall --all --json   (portable store for the agentdb-memory bridge)');
        return 1;
    }
    const limit = Math.max(1, parseInt(options.get('limit') ?? '10', 10) || 10);
    // --books: lexical (FTS5) search over the digitized-book Knowledge Base (.dz/memory/books.sqlite),
    // a separate namespace from the taught-pattern store — the surface the book-digitizer skills use.
    // --book <slug> narrows it to ONE digitized book (queryBookKnowledge supports the filter natively).
    const bookFilter = options.get('book');
    if (bookFilter !== undefined && !flags.has('books')) {
        write('dz recall: --book <slug> only applies to the book KB — add --books');
        write(`  Example: dz recall "${query}" --books --book ${bookFilter}`);
        return 1;
    }
    if (flags.has('books')) {
        // Same guard as the hybrid path: book knowledge is a vector search, so it loads the same
        // embedder and greeted stdout ahead of the JSON array (found by independent review).
        const runBooks = () => queryBookKnowledge(projectRoot, query, {
            limit,
            ...(bookFilter !== undefined ? { book: bookFilter } : {}),
        });
        let booksResult;
        try {
            booksResult = asJson ? await withForeignStdoutOnStderr(runBooks) : await runBooks();
        }
        catch (err) {
            // A corrupted store used to surface as a bare top-level `dz: file is not a database` — exit 1
            // (honest) but with no path and no cure (a2a574a9/c7aec002). Name both.
            const msg = err instanceof Error ? err.message : String(err);
            write(`dz recall --books: the book store is unreadable — ${msg}`);
            write(`  store: ${join(projectRoot, '.dz', 'memory', 'books.sqlite')}`);
            write('  cure: restore it from a backup, or delete the file and re-digitize (dz brain add --from-slice / book-digitizer) — deleting loses only this project\'s local shelf, the machine-wide brain is separate');
            return 1;
        }
        const { hits, error } = booksResult;
        // f1451a6a: an EXPLICIT --semantic request whose vector instrument did not run must not read as
        // a clean 0-hit search. error!==undefined here means the INSTRUMENT failed (embedder/sqlite
        // unavailable), not that the shelf is empty — house convention exit 3 = not-established.
        const semanticNotEstablished = flags.has('semantic') && error !== undefined;
        if (asJson) {
            if (semanticNotEstablished) {
                write(JSON.stringify({ hits, notEstablished: error }));
                return 3;
            }
            write(JSON.stringify(hits));
            return 0;
        }
        write(`dz recall "${query}" --books${bookFilter !== undefined ? ` --book ${bookFilter}` : ''}  —  ${hits.length} KU hit(s)`);
        if (error !== undefined)
            write(`  (${error})`);
        if (semanticNotEstablished) {
            write('  --semantic was EXPLICIT and the vector instrument did not run — nothing was established (exit 3, not a clean 0)');
            return 3;
        }
        for (const h of hits) {
            const src = h.chapter !== undefined ? ` [${h.book} гл.${h.chapter}${h.pages ? ` с.${h.pages[0]}-${h.pages[1]}` : ''}]` : ` [${h.book}]`;
            write(`  (${h.type}) ${h.name}${src}`);
        }
        // A zero-hit search must say WHERE it looked, and — only then — whether the other shelf has
        // anything. `--books` reads THIS PROJECT's store; digitised books are promoted to a machine-wide
        // brain. MEASURED: the same query gives 3 hits in this repository, 0 in any other directory, and
        // 2 through `dz brain query` from that same other directory — with no sign that the knowledge
        // was one command away (features/books-names-the-brain).
        // A FAILED search is not an empty one. With `error` set, `hits` is empty because the store could
        // not be read — claiming it was searched, and pointing elsewhere, would turn a fault into a
        // "nothing here" (found by cross-family review; the error itself is already printed above).
        if (hits.length === 0 && error === undefined) {
            write(`  searched this project's book store: ${bookKbPath(projectRoot)}`);
            // Read the brain ONLY here: the happy path must not pay for the empty one. A brain that
            // cannot be read says NOTHING — an unreadable shelf is not an empty shelf.
            let sources;
            try {
                sources = listBrain();
            }
            catch {
                sources = undefined;
            }
            if (sources !== undefined && sources.length > 0) {
                // Deliberately NOT asserting that `--book <slug>` exists in the brain — nothing here checked
                // that, and advising a filter that will also miss is the same defect wearing a hat.
                // POSIX single-quoting: the query is USER text and lands in a command the reader will paste.
                // Interpolating it into double quotes breaks on a `"` and invites `$(…)`/backticks to be
                // read by their shell (found by cross-family review).
                const quoted = `'${query.replace(/'/g, `'\\''`)}'`;
                write(`  the machine-wide brain holds ${sources.length} source(s) — search it with: dz brain query ${quoted}`);
            }
        }
        return 0;
    }
    // Hybrid recall (dz-rvf-vector-bridge FR-3): lexical FIRST (unchanged baseline), then a
    // time-bounded semantic leg merged via RRF when a vector engine is installed. With no engine
    // the output is byte-identical to the pre-feature lexical rendering (I-1/AC-1) — modulo only
    // the FR-8 hint line below.
    const mode = flags.has('semantic')
        ? 'semantic'
        : flags.has('no-semantic') || flags.has('lexical')
            ? 'lexical'
            : 'hybrid';
    const wantedDomain = options.get('domain');
    const classRecallOptions = {
        onClassDegraded: writeErr,
        ...(classMatcher === undefined ? {} : { classMatcher }),
    };
    // OVER-FETCH before boosting (Codex QE #5): the boost used to run on hits ALREADY
    // truncated to `limit`, so an exact-domain lesson sitting at rank limit+1 could
    // never receive its promised lift — the feature was weakest in exactly the case it
    // exists for (foreign-domain dilution pushing a relevant lesson just past the cut).
    // Fetch a bounded surplus, re-rank, then trim to the limit the caller asked for.
    // EVERY value that reaches an output line goes through this, not just stored fields.
    // Round 5: `pattern` and `domain` were sanitised but the QUERY and the requested
    // domain were not, so a caller-supplied newline could still forge a line that looks
    // like the tool's own — including the boost note a peer reads as a capability probe.
    // The rule is "one line out per line of output", and it has to hold for every field.
    const oneLine = (v) => String(v).replace(/[\r\n\u2028\u2029\u0085\v\f]+/g, ' ⏎ ');
    const shownQuery = oneLine(query);
    const shownDomain = wantedDomain === undefined ? undefined : oneLine(wantedDomain);
    const fetchLimit = wantedDomain !== undefined ? Math.min(limit * 3, limit + 20) : limit;
    // `--json` promises MACHINE-READABLE stdout, and transformers.js writes `Transformers.js loaded:
    // <model>` straight to stdout when the embedding model loads — so the machine mode was unparseable
    // in exactly the mode that makes it machine-readable (MEASURED 2026-08-22: it broke this project's
    // own measurement script and produced a false result). The same noise already forced
    // `.claude/helpers/agentdb-mcp-shim.mjs` to exist for the MCP stdio channel; this is that class,
    // second occurrence. Foreign stdout is routed to stderr for the duration of the engine call — our
    // own output is written after it returns.
    const result = asJson
        ? await withForeignStdoutOnStderr(() => recallHybrid(projectRoot, query, { limit: fetchLimit, mode, deferExposures: true, ...classRecallOptions, ...(wantedDomain !== undefined ? { domain: wantedDomain } : {}) }))
        : await recallHybrid(projectRoot, query, { limit: fetchLimit, mode, deferExposures: true, ...classRecallOptions, ...(wantedDomain !== undefined ? { domain: wantedDomain } : {}) });
    if (mode === 'semantic' && result.vectorEngine === 'none') {
        // --semantic is an explicit ask — degrading it silently would be dishonest (FR-3).
        const why = result.vectorReason ?? 'no vector engine available — run: dz setup --memory agentdb';
        // …and under --json the refusal must itself be JSON. This branch wrote PROSE to stdout, so the
        // one mode that promises machine-readable output broke exactly where the feature is loudest
        // (found by cross-family review; MEASURED: `--semantic --json` with no engine printed a
        // sentence). An error the caller cannot parse is not an honest refusal, only a different lie.
        write(asJson ? JSON.stringify({ error: 'semantic-unavailable', reason: why, hits: [] }) : `dz recall --semantic: ${why}`);
        return 1;
    }
    // Domain-aware re-ranking (health-advisor slice H): `--domain <name>` lifts lessons
    // tagged with that domain WITHOUT dropping foreign ones — a boost, not a filter, so a
    // shared store keeps the cross-domain transfers that make it worth more than two stores.
    const boost = wantedDomain !== undefined ? applyDomainBoost(result.hits, wantedDomain) : null;
    // ── The cross-project store ────────────────────────────────────────────────────────────────
    //
    // Our own shipped precedent (learning_bridge.py:23): "the compounding objection was answered by
    // making RECALL read both stores rather than by merging them" — and :880, "two stores are
    // different stores". Writing needs a choice; reading almost never does, so there is no mode here.
    //
    // The global store is a project store rooted at the home directory: same code, same format.
    // It is read ONLY when it exists AND is a different store — a user recalling FROM their home
    // directory would otherwise read one file twice and see every hit doubled.
    //
    // ABSENT global store ⇒ this whole block is skipped and the output is byte-identical to before.
    // That is the load-bearing property: every existing user must be unaffected by a feature they
    // did not ask for.
    const globalRoot = globalStoreRoot();
    const readGlobal = !sameStore(projectRoot, globalRoot)
        && existsSync(join(globalRoot, '.dz', 'memory'));
    let globalHits = [];
    if (readGlobal) {
        const g = asJson
            ? await withForeignStdoutOnStderr(() => recallHybrid(globalRoot, query, { limit: fetchLimit, mode, deferExposures: true, ...classRecallOptions, ...(wantedDomain !== undefined ? { domain: wantedDomain } : {}) }))
            : await recallHybrid(globalRoot, query, { limit: fetchLimit, mode, deferExposures: true, ...classRecallOptions, ...(wantedDomain !== undefined ? { domain: wantedDomain } : {}) });
        globalHits = g.hits;
    }
    const projectHits = boost ? boost.hits : result.hits;
    // TWO different keys on purpose, and they must not be unified. The cross-store MERGE key is the
    // lesson TEXT: the same lesson taught into the project store and the global store is one lesson
    // shown once, labelled `both`, and those two records legitimately differ in timestamp, reward and
    // domain. The matchedForm LOOKUP key may be narrower. Folding the merge key into
    // patternIdentityOf (which includes ts) made two `dz teach` calls of identical text stop
    // collapsing — it reddened the pre-existing P3 case in recall-reads-both-stores.test.ts.
    const mergeKey = (hit) => hit.pattern.pattern;
    const globalByIdentity = new Map(globalHits.map((hit) => [mergeKey(hit), hit]));
    const merged = readGlobal
        ? mergeStoreHits(projectHits, globalHits, mergeKey).map((hit) => {
            if (hit.origin !== 'both')
                return hit;
            const matchedForm = mergeLessonMatchedForms(hit.matchedForm, globalByIdentity.get(mergeKey(hit))?.matchedForm);
            return matchedForm === undefined ? hit : { ...hit, matchedForm };
        })
        : projectHits;
    const hits = merged.slice(0, limit);
    // Computed ONCE, honoured by EVERY return path. It used to live only on the text tail, so the two
    // paths that return earlier — `--json` and the zero-hits branch — still reported success. That
    // made the contract change invisible to exactly the caller the ADR justifies it by: a script
    // (MEASURED: text mode exited 1, `--json` exited 0 on the same query).
    // `vectorError` is EXCLUDED on purpose: an engine that was asked and failed/timed out is the
    // documented degraded path (exit 0, 05 §2.3) and stays that way. This code is for a tier that had
    // nothing to give, not for one that broke — conflating them would make the exit status depend on a
    // timeout and so vary run to run (found by independent review).
    const semanticUnserved = mode === 'semantic' && result.vectorError === undefined && result.semanticRanked === 0;
    // The boost never drops a hit, but the CUT still can: promoting a match into the top
    // `limit` pushes the last one out, so a lesson visible WITHOUT --domain can vanish
    // WITH it. Cross-model review called this out as a lie by omission — the note said
    // "foreign-domain lessons kept" about the pre-cut list while the printed list was
    // missing one. Count it and say so; the reader can act on it (raise --limit).
    const displaced = boost !== null ? countDisplacedByCut(result.hits, boost.hits, limit) : 0;
    // lesson-bandit-rerank FR-8/AC-11: the bandit block must describe the POST-cut list the reader
    // actually sees. `dz recall` over-fetches under --domain and truncates AGAIN here, so reporting
    // the core's own (already post-merge-cut) count would still describe a list one cut too early.
    // ABSENT while disarmed — its presence is what tells a reader the feature ran.
    const shownDzIds = hits.map((h) => patternRecordId(h.pattern));
    const banditBlock = result.bandit === undefined
        ? undefined
        : narrowBanditReport(result.bandit, shownDzIds);
    // Exposures were DEFERRED (`deferExposures: true`) precisely so this cut happens first: `dz recall`
    // over-fetches under --domain and truncates again here, and counting an over-fetched hit as "seen"
    // both inflates the health metrics and mislabels a candidate the reader never laid eyes on.
    result.commitExposures?.(shownDzIds);
    const renderBanditNote = (b) => `  ℹ bandit payoff: ${b.moved} of ${b.armsConsidered} shown hit(s) moved (ctx ${b.contextKey}` +
        `, ${b.unknownArms} with no measured payoff yet, ${b.quarantinedExcluded} quarantined excluded` +
        `${b.exploration ? `, exploration ON — ${b.explored} trial impression(s)` : ''}` +
        `${b.reason !== null ? `, state ${b.reason}` : ''})`;
    if (asJson) {
        // Portable contract UNCHANGED (I-7/AC-6): a plain PatternRecord[] — round-trips through
        // `dz teach --from-json` regardless of which backend ranked each hit.
        // The RRF relevance that ranked these very records was computed and then dropped, so no
        // automated consumer could threshold on it (MEASURED: keys were exactly
        // pattern,type,reward,domain,ts,source). It rides as a COMPANION key: `dz teach --from-json`
        // ignores unknown keys, so the round-trip is preserved — PROVEN by running, not assumed.
        // `relevance` is null under `--domain`: the domain boost REORDERS the list, so the RRF score no
        // longer explains the order shown, and printing it beside a boosted ranking would be a number
        // that contradicts its own list. Null means "not applicable here", never "zero relevance".
        // The condition is the BOOST, not `'score' in h`: boosted hits carry a score too, so the first
        // version emitted the number while its own comment promised null (found by independent review).
        write(JSON.stringify(hits.map((h) => ({
            ...h.pattern,
            ...(h.matchedForm === undefined ? {} : { matchedForm: h.matchedForm }),
            relevance: boost === null && 'score' in h && typeof h.score === 'number' ? h.score : null,
            // The TRUE cosine, as a second companion key — the design named it and the first ship missed
            // it, so a scripted consumer STILL could not threshold (found while recalibrating the floors:
            // every probe returned "no similarity" through --json while the human output showed sim=).
            // Unlike `relevance` it SURVIVES a domain boost: closeness is order-independent (ADR-001 of
            // recall-true-closeness), and null means "not measured for this hit", never zero.
            similarity: 'similarity' in h && typeof h.similarity === 'number' ? h.similarity : null,
        }))));
        // The honesty notes go to STDERR here rather than being skipped: the JSON branch
        // used to return before them, so a scripted caller was told nothing about a boost
        // that had promoted a match and pushed a visible hit past the --limit cut.
        if (boost !== null && shownDomain !== undefined) {
            process.stderr.write(`${renderDomainBoostNote(boost, shownDomain)}\n`);
            const cutNoteJson = renderDomainCutNote(displaced, limit);
            if (cutNoteJson !== '')
                process.stderr.write(`${cutNoteJson}\n`);
        }
        // STDERR, not stdout: `--json`'s stdout contract is a plain PatternRecord[] that round-trips
        // through `dz teach --from-json`, and wrapping it in an object to make room for one report
        // would break every existing consumer. The block travels beside the other honesty notes.
        if (banditBlock !== undefined)
            process.stderr.write(`${JSON.stringify({ bandit: banditBlock })}\n`);
        return semanticUnserved ? 1 : 0;
    }
    if (hits.length === 0) {
        write(`dz recall "${shownQuery}"`);
        write(`  No matching patterns (teach some with \`dz teach\`, or consolidate sessions).`);
        // The domain note must print here too (Codex QE #10): a --domain run with zero hits
        // silently said nothing about the domain, so the reader could not tell whether the
        // boost had been applied and found nothing, or had not run at all.
        if (boost !== null && shownDomain !== undefined)
            write(renderDomainBoostNote(boost, shownDomain));
        return semanticUnserved ? 1 : 0;
    }
    // `vectorOn` used to mean "an engine RESOLVED", so the header claimed vector ranking over a store
    // with zero vectors while each hit's own label honestly read ⟨sqlite⟩ (MEASURED 2026-08-22).
    // It now means what it says: a vector actually ranked something (ADR-001).
    const vectorOn = result.semanticRanked > 0 && result.vectorError === undefined && mode !== 'lexical';
    const engineUp = result.vectorEngine !== 'none' && result.vectorError === undefined;
    // Whether a tier EXISTS, regardless of whether this query's search succeeded. The advice below
    // must key on existence: gated on `engineUp`, a timed-out but installed tier was told to install
    // itself, one line under "vector search degraded" (found by independent review).
    const engineInstalled = result.vectorEngine !== 'none';
    const lexLabel = result.lexicalBackend === 'sqlite' ? 'SQLite FTS5' : 'keyword (JSON)';
    const ranking = vectorOn
        ? `${lexLabel} + vector (${result.vectorEngine}) ranking`
        : engineUp && mode !== 'lexical'
            // the engine is up and returned nothing usable — name the state and the fix, do not claim a
            // ranking that did not happen and do not advise installing what is already installed
            // `semanticCandidates` earns its place here: an engine that returned candidates which were ALL
            // orphans is a different problem from an engine with nothing in it, and the fix differs too.
            ? result.semanticCandidates > 0
                ? `${lexLabel} only (the semantic tier returned ${result.semanticCandidates} stale id(s) — run: dz consolidate)`
                : `${lexLabel} only (semantic tier empty — run: dz vector reindex)`
            : `${lexLabel} ranking (lexical)`;
    // The store COUNT appears only when a second store actually contributed. Saying "1 store" where
    // nothing was said before would break the byte-identity property for every existing user; with a
    // single store the store-location line below already names WHICH one.
    const storesRead = readGlobal ? `, ${storeCountLabel(2)}` : '';
    write(`dz recall "${shownQuery}"  —  ${hits.length} hit(s), ${ranking}${storesRead}`);
    write(storeLocationLine(describeStoreLocation(projectRoot, options.get('project')), 'read'));
    if (readGlobal) {
        // Naming only the project store while the header says "2 stores" would leave the reader
        // guessing which second one answered.
        write(`  store (read): ${join(globalRoot, '.dz')}  [cross-project]`);
    }
    const classMatches = hits.filter((h) => h.matchedForm === 'class' || h.matchedForm === 'both').length;
    if (hits.some((h) => h.pattern.classForm !== undefined)) {
        write(`  class-form matches: ${classMatches} of ${hits.length}`);
    }
    let sawQuarantined = false;
    for (const h of hits) {
        const backendTag = vectorOn ? ` ⟨${h.backend}⟩` : '';
        const qTag = h.quarantined === true ? ' ⚠q' : '';
        if (h.quarantined === true)
            sawQuarantined = true;
        // ONE line per hit, always. A lesson may contain newlines, and printing them raw
        // let stored CONTENT forge lines that look like the tool's own output — including
        // the domain-boost note that learning_bridge.py reads as a capability probe. Any
        // consumer that parses this output line-wise has the same exposure, so the fix
        // belongs at the point of rendering rather than in each reader.
        // Sanitise EVERY stored field that reaches the line, and every character a reader
        // might treat as a break — not just CR/LF. Round 4 forged the domain-boost note
        // twice over: once through `domain`, which was rendered raw, and once through a
        // U+2028 that Python's splitlines() honours and this replace did not.
        // Closeness rides INSIDE the backend tag, and only when the semantic leg ran — the engine-less
        // output stays byte-identical, which a pinned test asserts. Two axes, never merged: the leading
        // number is the lesson's own reward ("what did this earn"), `sim` is closeness ("is it about
        // what you asked"). The ▲/▽ marker is the floor comparison done for the reader, against the
        // same measured per-language floors the recall hook already trusts.
        const simTag = vectorOn ? ` ${closenessLine(h.similarity, shownQuery)}` : '';
        const backendAndSim = vectorOn ? ` ⟨${h.backend}${simTag}⟩` : '';
        // 160, not 80: at 80 characters the evidence a reader needs to judge relevance sits in the
        // hidden remainder, and the cosine then appears to describe the visible fragment rather than
        // the whole lesson. `--full` prints it all, still on one line.
        const specificText = oneLine(h.pattern.pattern);
        const classText = h.pattern.classForm === undefined ? undefined : oneLine(h.pattern.classForm);
        let shown = specificText;
        if (classText !== undefined) {
            const suffix = ` [match: ${h.matchedForm ?? 'specific'}]`;
            if (flags.has('full')) {
                shown = `specific: ${specificText} · class: ${classText}${suffix}`;
            }
            else {
                const contentWidth = Math.max(2, 160 - 'specific: '.length - ' · class: '.length - suffix.length);
                const specificWidth = Math.floor(contentWidth / 2);
                shown = `specific: ${specificText.slice(0, specificWidth)} · class: ${classText.slice(0, contentWidth - specificWidth)}${suffix}`;
            }
        }
        else if (!flags.has('full')) {
            shown = shown.slice(0, 160);
        }
        // WHICH store this hit came from. A merged list that does not say re-creates the fragmentation
        // blindness the store-location line just removed, one level down: the reader would see more
        // results and have no way to tell whether the global store is even connected.
        // Empty when only one store was read, so a single-store run stays byte-identical.
        const originTag = readGlobal && 'origin' in h
            ? ` {${h.origin}}`
            : '';
        write(`  [${h.pattern.reward.toFixed(2)}] (${oneLine(h.pattern.domain)})${backendAndSim}${qTag}${originTag} ${shown}`);
    }
    // The apply leg records itself. `dz recall` wrote NOTHING to the usage log — MEASURED 2026-08-24,
    // 1106 rows before the call and 1106 after — so "how many lessons were recalled" was underivable,
    // and the pipeline banner asserted a hardcoded `--recalled 3` at three call sites instead.
    //
    // Only hits with a MEASURED cosine are recorded. The log's `score` is defined as cosine relevance
    // and its validator requires a finite number; writing an RRF rank there would mix two scales in
    // one field, which is the exact lie the closeness work just removed from the display. The gap is
    // printed rather than hidden, so an under-count can never read as "only these were read".
    if (vectorOn && hits.length > 0) {
        const measured = hits.filter((h) => typeof h.similarity === 'number' && Number.isFinite(h.similarity));
        if (measured.length > 0) {
            const runId = (options.get('run') ?? '').trim();
            appendRecallUsage({
                projectRoot: projectRoot,
                query: shownQuery,
                // `--run` threads a caller's run key into the log, so a later `--recalled auto` can count
                // THIS run's events instead of asserting a literal (the /feature-adr panel's `--recalled 3`).
                ...(runId === '' ? {} : { runId }),
                hits: measured.map((h) => ({ dzId: patternRecordId(h.pattern), score: h.similarity })),
            });
        }
        if (measured.length < hits.length) {
            write(`  ℹ ${measured.length} of ${hits.length} read(s) recorded — a hit with no measured closeness carries no score in a log whose score IS the cosine`);
        }
    }
    if (vectorOn && hits.length > 0 && !anyAboveFloor(hits.map((h) => h.similarity), shownQuery)) {
        // Said ONCE, in words, instead of leaving the reader to compare every number themselves. This
        // is the difference between "a strong match" and "the best of a weak field", and without it a
        // list of five ▽ rows reads exactly like a list of five answers.
        write(`  ℹ nothing here clears the measured similarity floor for this query — this is the best of a weak field, not a match`);
    }
    if (sawQuarantined) {
        // The loop stays VISIBLE (ADR D2): a quarantined hit is shown, marked, and explained.
        write('  ⚠q = quarantined (unproven hypothesis, rank damped) — confirm with dz teach --reinforce, or dz recall --promote <dzId> --apply');
    }
    if (banditBlock !== undefined) {
        // Say what the payoff term did — INCLUDING when it did nothing. `moved: 0` over many queries
        // means the feature is armed and inert, which is precisely the outcome nobody would notice
        // without this line.
        write(renderBanditNote(banditBlock));
    }
    if (boost !== null && shownDomain !== undefined) {
        // Say what the boost did — INCLUDING when it did nothing. A silent reorder would
        // let the reader believe the ranking was domain-aware when it had no match to work with.
        write(renderDomainBoostNote(boost, shownDomain));
        const cutNote = renderDomainCutNote(displaced, limit);
        if (cutNote !== '')
            write(cutNote);
    }
    if (result.vectorError !== undefined && mode !== 'lexical') {
        // Engine present but the semantic leg failed/timed out — one honest line, exit 0 (05 §2.3).
        write(`  ℹ vector search degraded: ${result.vectorError} — showing lexical ranking`);
    }
    // FR-8 hint swap: with an engine the old MCP-only hint is gone; without one, the SAME
    // conditional position carries an actionable enablement line instead — the only permitted
    // output change on the degraded path.
    // ... and NOT when the tier is already installed: in the repo (539 vectors, a 2.9 MB agentdb.db)
    // `--no-semantic` advised installing the tier it was deliberately not using (MEASURED 2026-08-22).
    // ... and NOT when the user explicitly asked for lexical recall. Under `--no-semantic` the result
    // reports `vectorEngine: 'none'` BY CONSTRUCTION, so this line fired over a tier that was installed
    // and full — in this repo, 539 vectors and a 2.9 MB agentdb.db, advising the user to install it
    // (MEASURED 2026-08-22). Someone who passed --no-semantic has opted out; advice is noise there.
    if (!vectorOn && !engineInstalled && mode !== 'lexical' && existsSync(join(projectRoot, '.dz', 'agentdb.db'))) {
        write(`  ℹ semantic (vector) recall needs the agentdb vector tier — run: dz setup --memory agentdb`);
    }
    // An EXPLICIT --semantic that no vector could serve is not a success. The caller who most needs to
    // know is the one that cannot read the prose above it (ADR-001; this is a contract change).
    // Exit 1, the SAME code the documented sibling case uses ("--semantic … exit 1 if no engine"):
    // an explicit ask that could not be served is one failure class, not two.
    return semanticUnserved ? 1 : 0;
}
/* ------------------------------------------------------------------ */
/*  vector — the semantic-tier observability + export surface (FR-10)  */
/* ------------------------------------------------------------------ */
/** Truncate a pattern for one-line cluster rendering. */
function truncatePattern(text) {
    return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}
/** Render a {@link HarmonizeReport} — shared by `dz vector harmonize` and `dz teach --harmonize` (QR-6). */
function renderHarmonize(report, write) {
    const head = report.mode === 'apply' ? 'dz vector harmonize --apply' : 'dz vector harmonize (dry-run)';
    const engineLabel = report.fellBackToExact
        ? `exact-text dedup (${report.engine === 'none' ? 'no vector engine' : `${report.engine} embedder unavailable`})`
        : `semantic (${report.engine}, cos ≥ ${report.threshold})`;
    write(`${head} — ${engineLabel}`);
    if (report.error !== undefined) {
        write(`  ✗ ${report.error}`);
        return;
    }
    for (const c of report.clusters) {
        write(`  [keep ${c.keep.reward.toFixed(2)}] "${truncatePattern(c.keep.text)}"`);
        for (const d of c.drops) {
            write(`    ↳ drop ${d.reward.toFixed(2)} "${truncatePattern(d.text)}"  (cos ${d.cos.toFixed(2)})`);
        }
    }
    write(`  ${report.clusters.length} cluster(s), ${report.kept} kept, ${report.dropped} dropped, ${report.unique} unique`);
    if (report.fellBackToExact && report.engine === 'none') {
        write('  ℹ no vector engine — harmonized by exact text only; semantic dedup needs the agentdb vector tier (run: dz setup --memory agentdb)');
    }
    if (report.mode === 'apply') {
        if (report.backupPath !== undefined) {
            write(`  backup: ${report.backupPath}  (restore: dz teach --from-json ${report.backupPath})`);
        }
    }
    else if (report.dropped > 0) {
        write('  re-run with --apply to collapse these (a restorable backup is written first)');
    }
}
/**
 * Run harmonize with the CLI flag guards, then render. Shared entry point for `dz vector harmonize`
 * and `dz teach --harmonize` — ONE implementation, no bespoke second path (QR-6). Guards (AC-6):
 * `--apply` + `--dry-run` together is rejected; `--threshold` must be in `(0, 1]`; no flag ⇒ dry-run.
 */
async function runHarmonize(projectRoot, options, flags, write, 
/**
 * Where this harmonize is pointed and what chose it. Under `--json` the human store line is
 * suppressed to keep stdout ONE document, so the destination has to travel INSIDE that document
 * or `--harmonize --apply --to global` mutates ~/.dz while revealing nothing (cross-family QE
 * round 3, 2026-08-27 — the round-2 fix closed a parse break and reopened the silent-store
 * hazard the whole feature exists to close).
 */
storeAnnotation) {
    const apply = flags.has('apply');
    if (apply && flags.has('dry-run')) {
        write('dz vector harmonize: --apply and --dry-run are mutually exclusive');
        return 1;
    }
    let threshold;
    if (options.has('threshold')) {
        threshold = Number(options.get('threshold'));
        if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
            write('dz vector harmonize: --threshold must be a number in (0, 1]');
            return 1;
        }
    }
    const report = await harmonizeVectorStore(projectRoot, { apply, ...(threshold !== undefined ? { threshold } : {}) });
    if (flags.has('json')) {
        write(JSON.stringify(storeAnnotation !== undefined ? { ...report, ...storeAnnotation } : report));
        return report.error !== undefined ? 1 : 0;
    }
    renderHarmonize(report, write);
    return report.error !== undefined ? 1 : 0;
}
async function cmdVector(options, flags, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const sub = options.get('_positional_0');
    if (sub === 'status') {
        const st = await vectorTierStatus(projectRoot);
        if (flags.has('json')) {
            write(JSON.stringify(st));
            return 0;
        }
        write('dz vector status');
        write(`  Engine: ${st.available ? `${st.kind} (available)` : `none — ${st.reason ?? 'no engine installed'}`}`);
        write(`  Mode: ${st.mode} (.dz/config.json → memory.vector.engine)`);
        if (st.embeddingModel !== undefined)
            write(`  Embedding model: ${st.embeddingModel}`);
        write(`  Lexical patterns: ${st.lexicalMirrorable} mirrorable (${st.lexicalTotal} total)`);
        // Each line NAMES its scope. `Mirrored vectors` used to count three task types and sit directly
        // under a one-task-type lexical count, and a reader took the pair at face value: 547 vs 274 read
        // as half the index orphaned, and a task was filed to prune it. MEASURED: 273 of those were
        // `dz-backlog` idea ids and there were ZERO orphans (ADR-001, features/mirror-counts-comparable).
        write(`  Mirrored vectors (learned patterns): ${st.mirrored !== undefined ? st.mirrored : 'n/a (no engine)'}`);
        if (st.mirroredOther !== undefined && st.mirroredOther > 0) {
            write(`  Other dz-owned vectors (backlog ideas): ${st.mirroredOther}  — counted separately, not part of the pair above`);
        }
        if (st.orphaned !== undefined && st.orphaned > 0) {
            write(`  Orphan vectors (no lexical record): ${st.orphaned}  — run: dz vector reindex`);
        }
        write(`  Pending mirror queue: ${st.pending}`);
        // `pending: 0` used to stand alone, and it reads as "no debt" when it actually means "no queue
        // was ever opened" — an unconfigured project printed the same line as a fully-mirrored store
        // (MEASURED: two projects differing by one config file, 0 vs 1 for the same record).
        // The REASON comes from the same read that decided the state. It used to be one hardcoded
        // sentence naming a single cause, so a project that set `memory.vector.engine: "off"` was
        // told it lacked `memory.backend=agentdb` — a diagnosis pointing at something that was not
        // broken (MEASURED 2026-08-24).
        write(`  Mirror writer: ${st.mirrorWriterEnabled ? 'ON' : 'OFF'} (${mirrorWriterExplanation(st.mirrorWriterState)})`);
        // "not in the mirror" is ALL the set difference proves — a vector written and later deleted is
        // indistinguishable from one never offered, so the label must not claim "never queued".
        // `undefined` has two causes and they are different advice, so they are printed differently.
        const unknownReason = st.available ? 'unknown (the engine failed to list its ids)' : 'unknown (no engine to ask)';
        write(`  Not in the mirror: ${st.unmirrored !== undefined ? st.unmirrored : unknownReason}`);
        // The old advice compared `mirrored < lexicalMirrorable`, two counts of different things — so
        // backlog ideas inflating `mirrored` could SILENCE it while patterns really were missing.
        // `unmirrored` is a set difference over ids and answers the same question correctly.
        if (st.unmirrored !== undefined && st.unmirrored > 0) {
            write(`  ℹ mirror behind the lexical store — run: dz consolidate (backfill)`);
        }
        if (st.unmirrored !== undefined && st.unmirrored > 0) {
            write(`  ℹ ${st.unmirrored} mirrorable pattern(s) are not in the vector mirror — run: dz vector reindex`);
        }
        return 0;
    }
    if (sub === 'reindex') {
        const report = await reindexVectorStore(projectRoot);
        if (flags.has('json')) {
            write(JSON.stringify(report));
            return report.error !== undefined ? 1 : 0;
        }
        if (report.error !== undefined) {
            // Honest failure/skip. Under a non-agentdb engine backlog is reported `skipped` (it never touches the
            // shared manifest); a model bump needs a FULL reindex under the agentdb engine. Surface it, exit 1.
            write(`dz vector reindex: ${report.error}`);
            return 1;
        }
        write(`dz vector reindex: re-embedded ${report.reembedded} learned vector(s) with ${report.model} (manifest v${report.version})`);
        if (report.backupPath !== undefined)
            write(`  snapshot: ${report.backupPath}`);
        if (report.staleTaskTypes !== undefined && report.staleTaskTypes.length > 0) {
            // Never leave this silent: those rows are still in the previous embedding space. Reads filter by
            // task type so nothing mixes today, but the user must know a sibling reindex is outstanding.
            write(`  ⚠ still in the previous embedding space: ${report.staleTaskTypes.join(', ')}`);
            if (report.staleTaskTypes.includes('book-knowledge'))
                write('    run \`dz brain reindex\` to rebuild the brain\'s book vectors');
        }
        return 0;
    }
    if (sub === 'export') {
        const dest = options.get('_positional_1');
        if (dest === undefined) {
            write('dz vector export: destination path required (e.g. dz vector export patterns.rvf)');
            return 1;
        }
        const resolved = resolveVectorEngine(projectRoot);
        const exporter = resolved.engine?.exportCheckpoint?.bind(resolved.engine);
        if (exporter === undefined) {
            // Honest one-liner (D7): the portable VECTOR form needs the opt-in RVF engine; the
            // patterns themselves already have a portable SHARING form.
            write('dz vector export: portable .rvf checkpoints need the opt-in RVF engine — set memory.vector.engine to "rvf" in .dz/config.json and install @ruvector/rvf.');
            write('  Patterns themselves stay portable via: dz recall --all --json  (import with: dz teach --from-json)');
            return 0;
        }
        // The vector checkpoint carries EMBEDDINGS of the lesson text, and the RVF adapter
        // copies the whole store — there is no per-record filter to apply. So this path
        // fails CLOSED: if the store holds a held-out domain, the export is refused unless
        // the caller names that domain. An embedding is not plaintext, but ADR-003's
        // question is "does patient data leave this machine?", and a checkpoint that
        // silently carried it would answer yes while the documentation said no.
        // JUDGE THE FILE THIS COMMAND EXPORTS. The decision itself lives in harness-core as
        // a pure function WITH TESTS: the RVF engine is opt-in and absent on most machines,
        // so this branch could not be exercised in a normal checkout — reasoning about a
        // safety check I could not run is exactly what this project calls unverified.
        const optIn = options.get('include-domain');
        const vecHoldout = applyExportHoldout(loadStorePatternsSync(projectRoot).map((p) => ({ domain: p.domain })), heldOutAfterOptIn(optIn));
        const decision = decideVectorExport({
            rvfExists: existsSync(join(projectRoot, '.dz', 'memory', 'patterns.rvf')),
            heldOutLexicalCount: vecHoldout.withheld.length,
            heldOutDomains: vecHoldout.domains,
            optedIn: optIn,
        });
        if (!decision.allow) {
            write(`dz vector export: REFUSED — ${decision.reason}.`);
            write(`  A forgotten lesson's embedding outlives its lexical record. To export anyway, naming what travels: dz vector export ${dest} --include-domain ${decision.optInHint}`);
            return 1;
        }
        const r = await exporter(resolve(cwd, dest));
        if (r.error !== undefined) {
            write(`dz vector export: ${r.error}`);
            return 1;
        }
        write(`dz vector export: wrote ${dest} (+ .idmap.json/.manifest.json sidecars)`);
        return 0;
    }
    // harmonize (alias: dz teach --harmonize) — SEMANTIC dedup of the learned store, NON-DESTRUCTIVE:
    // dry-run by default (previews clusters, writes nothing); --apply drops after a restorable backup.
    if (sub === 'harmonize') {
        return runHarmonize(projectRoot, options, flags, write);
    }
    // import <file.rvf> — the missing HALF of the RVF cycle: UPSERT-BY-dzId, never overwrites.
    if (sub === 'import') {
        const src = options.get('_positional_1');
        if (src === undefined || src === '') {
            write('dz vector import: source .rvf path required (e.g. dz vector import patterns.rvf)');
            return 1;
        }
        const report = await importRvfCheckpoint(projectRoot, resolve(cwd, src), {});
        if (flags.has('json')) {
            write(JSON.stringify(report));
            return report.error !== undefined ? 1 : 0;
        }
        if (report.error !== undefined) {
            write(`dz vector import: ${report.error}`);
            return 1;
        }
        // Does import overwrite? NO — upsert-by-dzId; re-importing the same file adds 0 duplicates.
        write(`dz vector import: upserted ${report.imported} vector(s) by dzId (${report.engine}); skipped ${report.skippedOrphans} orphan(s)`);
        if (report.skippedOrphans > 0) {
            write('  ↳ orphan vectors have no local pattern — import the text first: dz teach --from-json <recall-export.json>, then re-run dz vector import');
        }
        return 0;
    }
    write('dz vector — semantic (vector) tier of the learned-pattern store');
    write('  dz vector status              engine availability, mirrored vs lexical counts, pending queue');
    write('  dz vector reindex             snapshot, re-embed from lexical source-of-truth, rewrite manifest');
    write('  dz vector export <path>       portable VECTOR checkpoint (.rvf; needs the opt-in RVF engine)');
    write('  dz vector import <file.rvf>   ingest an external .rvf checkpoint — UPSERT-BY-dzId (never overwrites)');
    write('  dz vector harmonize [--apply] SEMANTIC dedup of the learned store (dry-run default; --apply after a backup)');
    return sub === undefined ? 0 : 1;
}
/* ------------------------------------------------------------------ */
/*  brain — the durable, cross-project knowledge brain (ADR §5.2 P0)    */
/* ------------------------------------------------------------------ */
/**
 * Token budget used when `dz brain ground --full` is specified (chars/4 heuristic, approximate). A
 * typical DDIA-scale KU is ~500–750 tokens; at k=5 the sum is well under 8000, so `--full` inlines
 * everything the top-K recall returns in practice. Documented in the brain usage + wiki.
 */
const GROUND_FULL_BUDGET = 8_000;
const BRAIN_USAGE = `dz brain — the durable, cross-project knowledge brain

Usage:
  dz brain list   [--json]
  dz brain query  "<q>" [--source <slug>] [--limit <N>] [--any] [--rerank] [--json]
  dz brain add    [--source <slug>] [--project <dir>] [--json]
  dz brain add    --from-slice <file.sqlite>                    [--json]
  dz brain add    --from-pack  <pkg-or-dir>                     [--json]
  dz brain add    --from-kus   <file.json> --slug <s> [--kind repo|book|paper] [--license <spdx>] [--override] [--json]
  dz brain update <slug> [--project <dir>] [--json]
  dz brain reindex [--json]
  dz brain primer <slug> [--json]
  dz brain export --source <slug> --out <file>
  dz brain ground [<prompt>] [--k <N>] [--source <slug>] [--text] [--budget <N>] [--full]
  dz brain expand <kuId>  [--source <slug>] [--json]
  dz brain init   [--project <dir>] [--k <N>]

  add:    default promotes THIS project's digitized-book KUs into the brain. The three --from-* modes
          are mutually exclusive alternate inputs:
            --from-slice  imports a standalone per-book slice (a \`dz brain export\` output).
            --from-pack   resolves a pack (node_modules pkg or local dir) and imports every
                          \`brain/<slug>.sqlite\` slice it ships.
            --from-kus    registers a JSON array of already-shaped KUs under --slug (default --kind repo).
  query:  default is pure FTS order; --rerank runs the deterministic lexical reranker (over-fetch →
          field-weighted reorder → trim) for a more on-point top-K.
  update: non-destructive refresh — the project re-ingested a source at a new corpus_version; re-reads
          its CURRENT project KUs and re-mirrors them into the brain (stale-corpus rows evicted, OTHER
          sources untouched). Reports before → after KU counts. Errors on an unknown slug / no project KUs.
  primer: prints a source's capability card (the deterministic KU-type histogram + top decision moments).
  export: writes ONE source's KUs as a portable, lexical-only \`books.sqlite\` slice (vectors re-embed on import).
  ground: the UserPromptSubmit hook entrypoint. Grounds a prompt (positional or STDIN) against
          the brain and, when relevant KUs are found, prints Claude-Code-injectable JSON on
          stdout ({"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":…}}).
          Always exits 0 — grounding is advisory and must never fail a prompt. Reranking is ON by
          default here (grounding wants the most on-point citation first). --text prints the raw
          citation block instead of the JSON wrapper (for manual inspection).
          Three grounding tiers: (1) pointer (default, no flags) — one compact citation line per KU,
          cheap every-turn; (2) model-driven expand (--budget N>0 / --full) — each citation carries
          its kuId and the directive tells the model to pull full content via \`dz brain expand\`;
          (3) budgeted eager (--budget N) — eager-inlines full content of the top-K KUs within ~N
          tokens (chars/4 approx), worth-ranked; a KU that would overflow stays a pointer. --full =
          --budget 8000. --budget 0 / absent = pointers-only.
  expand: full-content lookup by kuId — the command the grounding directive names when --budget/--full
          is used. Prints name, problem, pages, book, and the FULL content (untruncated); --json emits
          the whole KU object. Exit 1 if the kuId is not found.
  init:   wires \`brain ground\` into .claude/settings.json as an opt-in UserPromptSubmit hook.`;
/**
 * Extract the user prompt from a Claude Code `UserPromptSubmit` hook STDIN payload. Tries the
 * common JSON shapes (\`.prompt\`, \`.user_prompt\`, \`.userPrompt\`); if the payload is plain
 * non-JSON text, the whole (trimmed) text is the prompt. Empty / unrecognized → \`''\` (the caller
 * then emits nothing and exits 0 — grounding never blocks).
 */
function extractPromptFromStdin(raw) {
    const text = raw.trim();
    if (text === '')
        return '';
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        // Plain non-JSON text → treat the whole thing as the prompt.
        return text;
    }
    if (parsed !== null && typeof parsed === 'object') {
        const obj = parsed;
        for (const key of ['prompt', 'user_prompt', 'userPrompt']) {
            const v = obj[key];
            if (typeof v === 'string' && v.trim() !== '')
                return v;
        }
    }
    // Valid JSON but no recognizable prompt field (or a bare scalar) → nothing to ground.
    return '';
}
/**
 * Resolve the deps root — the directory whose `package.json` can resolve `better-sqlite3` **and**
 * `agentdb`, the native driver `book-kb` + `agentdb-index` load through. Try `cwd` first (a project
 * that ran `dz setup --memory agentdb`); if it can't resolve them — the common case for a global
 * `dz` invoked outside such a project — fall back to the CLI's own install dir, where `harness-core`
 * and the native driver are co-installed. Purely a resolution base; the `package.json` need not exist.
 */
function resolveDepsRoot(cwd) {
    const canResolve = (root) => {
        try {
            const req = createRequire(join(root, 'package.json'));
            req.resolve('better-sqlite3');
            req.resolve('agentdb');
            return true;
        }
        catch {
            return false;
        }
    };
    if (canResolve(cwd))
        return cwd;
    const cliDir = dirname(fileURLToPath(import.meta.url)); // .../@dzhechkov/harness-cli/dist
    return canResolve(cliDir) ? cliDir : cwd;
}
/**
 * Resolve a `--from-pack` spec to a pack directory: a local directory (absolute or cwd-relative)
 * wins; otherwise resolve it as an installed node package (its `package.json` from `cwd` then the
 * CLI's deps root). Returns the pack's root dir, or `undefined` if it is neither.
 */
function resolvePackDir(cwd, depsRoot, spec) {
    const asDir = resolve(cwd, spec);
    if (existsSync(asDir) && lstatSync(asDir).isDirectory())
        return asDir;
    for (const root of [cwd, depsRoot]) {
        try {
            const req = createRequire(join(root, 'package.json'));
            return dirname(req.resolve(`${spec}/package.json`));
        }
        catch {
            /* try the next resolution base */
        }
    }
    return undefined;
}
/**
 * Validate that a parsed JSON value is an array of KU-shaped objects (the `--from-kus` backend).
 * Every element must carry the required BookKU string fields; `book` is optional (the caller's
 * `--slug` is authoritative). On the first bad element returns `{ error }` naming exactly what is
 * wrong; otherwise returns clean `BookKU[]` (extra fields dropped).
 */
function validateKuArray(parsed) {
    if (!Array.isArray(parsed))
        return { error: 'expected a JSON array of KU objects at the top level' };
    if (parsed.length === 0)
        return { error: 'the KU array is empty' };
    const required = ['kuId', 'corpusVersion', 'type', 'name', 'problem', 'content'];
    const kus = [];
    for (let i = 0; i < parsed.length; i += 1) {
        const v = parsed[i];
        if (v === null || typeof v !== 'object' || Array.isArray(v)) {
            return { error: `KU #${i} is not an object` };
        }
        const o = v;
        const missing = required.filter((k) => typeof o[k] !== 'string');
        if (missing.length > 0) {
            return { error: `KU #${i} missing/invalid string field(s): ${missing.join(', ')}` };
        }
        const pages = Array.isArray(o['pages'])
            ? o['pages'].filter((n) => typeof n === 'number')
            : undefined;
        const meta = o['metadata'] !== null && typeof o['metadata'] === 'object' && !Array.isArray(o['metadata'])
            ? o['metadata']
            : undefined;
        kus.push({
            book: typeof o['book'] === 'string' ? o['book'] : '',
            kuId: o['kuId'],
            corpusVersion: o['corpusVersion'],
            type: o['type'],
            name: o['name'],
            problem: o['problem'],
            content: o['content'],
            ...(typeof o['chapter'] === 'string' ? { chapter: o['chapter'] } : {}),
            ...(pages !== undefined ? { pages } : {}),
            ...(meta !== undefined ? { metadata: meta } : {}),
        });
    }
    return { kus };
}
async function cmdBrain(options, flags, cwd, write, readStdin) {
    const sub = options.get('_positional_0');
    const asJson = flags.has('json');
    // ── dz brain list ──────────────────────────────────────────────────────────────────────────
    if (sub === 'list') {
        const sources = listBrain();
        if (asJson) {
            write(JSON.stringify(sources));
            return 0;
        }
        if (sources.length === 0) {
            write("dz brain: brain is empty — run 'dz brain add' to promote a digitized book");
            return 0;
        }
        write(`dz brain — ${sources.length} source(s) @ ${brainHome()}`);
        write('  slug                 kind   KU     corpus        added');
        for (const s of sources) {
            const slug = s.slug.padEnd(20).slice(0, 20);
            const kind = s.kind.padEnd(6).slice(0, 6);
            const ku = String(s.kuCount).padStart(5);
            const corpus = (s.corpusVersion ?? '—').slice(0, 12).padEnd(12);
            write(`  ${slug} ${kind} ${ku}  ${corpus}  ${s.addedTs}`);
        }
        return 0;
    }
    // ── dz brain query "<q>" ─────────────────────────────────────────────────────────────────────
    if (sub === 'query') {
        const query = options.get('_positional_1');
        if (!query) {
            write('dz brain query: a query is required');
            write('  Example: dz brain query "replication topology" --source ddia --limit 5');
            return 1;
        }
        const source = options.get('source');
        const limit = Math.max(1, parseInt(options.get('limit') ?? '10', 10) || 10);
        // Default recall = pure FTS order (nothing regresses). `--rerank` opts into the deterministic
        // lexical reranker (over-fetch → field-weighted reorder → trim) for a more on-point top-K.
        const rerank = flags.has('rerank');
        // Default MATCH = all (AND) — precise when it hits. If it returns zero hits, queryBrain retries
        // once with OR and labels the result as broadened. Explicit `--any` still starts broad and is not
        // labeled as a fallback. Pairs well with --rerank: over-fetch broadly, then reorder on-point first.
        const anyMatch = flags.has('any');
        const queryResult = await queryBrain({
            query,
            limit,
            depsRoot: resolveDepsRoot(cwd),
            ...(source !== undefined ? { source } : {}),
            ...(rerank ? { rerank: true } : {}),
            ...(anyMatch ? { match: 'any' } : {}),
        });
        const { hits, error, broadened } = queryResult;
        if (asJson) {
            write(JSON.stringify(broadened === true ? { hits, broadened: true } : hits));
            return 0;
        }
        write(`dz brain query "${query}"${source !== undefined ? ` --source ${source}` : ''}${anyMatch ? ' --any' : ''}${rerank ? ' --rerank' : ''}  —  ${hits.length} KU hit(s)`);
        if (broadened === true)
            write(`  broadened to any-term match: ${hits.length} hit(s)`);
        if (error !== undefined)
            write(`  (${error})`);
        for (const h of hits) {
            const loc = h.chapter !== undefined
                ? `${h.book} гл.${h.chapter}${h.pages ? ` с.${h.pages[0]}-${h.pages[h.pages.length - 1]}` : ''}`
                : h.book;
            write(`  [${loc}] (${h.type}) ${h.name}`);
        }
        return 0;
    }
    // ── dz brain primer <slug> ───────────────────────────────────────────────────────────────────
    // Print a source's capability card (KU-type histogram + top decision moments) from the brain.
    if (sub === 'primer') {
        const slug = options.get('_positional_1');
        if (!slug) {
            write('dz brain primer: a source slug is required');
            write('  Example: dz brain primer ddia');
            return 1;
        }
        const { markdown, error } = await buildPrimer({ slug, depsRoot: resolveDepsRoot(cwd) });
        if (error !== undefined) {
            write(`dz brain primer: ${error}`);
            return 1;
        }
        if (asJson) {
            write(JSON.stringify({ slug, markdown }));
            return 0;
        }
        write(markdown);
        return 0;
    }
    // ── dz brain export --source <slug> --out <file> ─────────────────────────────────────────────
    // Export ONE source's KUs as a portable, lexical-only books.sqlite slice.
    if (sub === 'export') {
        const source = options.get('source');
        const out = options.get('out') ?? (flags.has('out') ? '' : undefined);
        if (source === undefined || source === '' || out === undefined || out === '') {
            write('dz brain export: --source <slug> and --out <file> are both required');
            write('  Example: dz brain export --source ddia --out ./ddia.sqlite');
            return 1;
        }
        const outPath = resolve(cwd, out);
        const { kuCount, error } = await exportBrainSlice({ slug: source, outPath, depsRoot: resolveDepsRoot(cwd) });
        if (error !== undefined) {
            write(`dz brain export: ${error}`);
            return 1;
        }
        write(`dz brain: exported ${kuCount} KU slice → ${outPath}`);
        return 0;
    }
    // ── dz brain add ─────────────────────────────────────────────────────────────────────────────
    // Default promotes THIS project's book KB. Three mutually-exclusive --from-* modes ingest a
    // slice, a pack's shipped slices, or a raw KU array instead.
    if (sub === 'add') {
        const depsRoot = resolveDepsRoot(cwd);
        const addedTs = new Date().toISOString();
        // A `--from-* ` given without a value parses as a FLAG (missing value); treat that as '' so the
        // mode still triggers its "requires a value" guard rather than silently falling through.
        const fromSlice = options.get('from-slice') ?? (flags.has('from-slice') ? '' : undefined);
        const fromPack = options.get('from-pack') ?? (flags.has('from-pack') ? '' : undefined);
        const fromKus = options.get('from-kus') ?? (flags.has('from-kus') ? '' : undefined);
        const modes = [fromSlice, fromPack, fromKus].filter((m) => m !== undefined).length;
        if (modes > 1) {
            write('dz brain add: --from-slice, --from-pack, and --from-kus are mutually exclusive');
            return 1;
        }
        // ── mode: --from-slice <file> → import a standalone per-book slice ──────────────────────────
        if (fromSlice !== undefined) {
            if (fromSlice === '') {
                write('dz brain add: --from-slice requires a slice file path');
                return 1;
            }
            const slicePath = resolve(cwd, fromSlice);
            if (!existsSync(slicePath)) {
                write(`dz brain add: no slice at ${slicePath}`);
                return 1;
            }
            const result = await importBrainSlice({ slicePath, depsRoot, addedTs });
            if (asJson) {
                write(JSON.stringify(result));
                return result.sources.length === 0 ? 1 : 0;
            }
            if (result.sources.length === 0) {
                write(`dz brain add: ${result.error ?? 'nothing to import from the slice'}`);
                return 1;
            }
            write(`dz brain: imported ${result.kus} KU from slice → ${result.sources.length} source(s) into ${brainHome()}: ${result.sources.join(', ')}`);
            if (result.error !== undefined)
                write(`  (partial: ${result.error})`);
            return 0;
        }
        // ── mode: --from-pack <pkg-or-dir> → import every brain/<slug>.sqlite the pack ships ────────
        if (fromPack !== undefined) {
            if (fromPack === '') {
                write('dz brain add: --from-pack requires a package name or directory');
                return 1;
            }
            const packDir = resolvePackDir(cwd, depsRoot, fromPack);
            if (packDir === undefined) {
                write(`dz brain add: could not resolve pack '${fromPack}' (not a local directory, not an installed package)`);
                return 1;
            }
            const packBrainDir = join(packDir, 'brain');
            const slices = existsSync(packBrainDir)
                ? readdirSync(packBrainDir).filter((f) => f.endsWith('.sqlite')).sort()
                : [];
            if (slices.length === 0) {
                write(`dz brain add: no brain/<slug>.sqlite slice found in pack '${fromPack}' (${packDir})`);
                return 1;
            }
            const imported = [];
            for (const f of slices) {
                imported.push(await importBrainSlice({ slicePath: join(packBrainDir, f), depsRoot, addedTs }));
            }
            const allSources = imported.flatMap((r) => r.sources);
            const totalKus = imported.reduce((s, r) => s + r.kus, 0);
            const firstError = imported.find((r) => r.error !== undefined)?.error;
            if (asJson) {
                write(JSON.stringify({ sources: allSources, kus: totalKus, ...(firstError !== undefined ? { error: firstError } : {}) }));
                return allSources.length === 0 ? 1 : 0;
            }
            if (allSources.length === 0) {
                write(`dz brain add: ${firstError ?? 'nothing imported'} from pack '${fromPack}'`);
                return 1;
            }
            write(`dz brain: imported ${totalKus} KU from ${slices.length} slice(s) in pack '${fromPack}' → ${allSources.length} source(s) into ${brainHome()}: ${allSources.join(', ')}`);
            if (firstError !== undefined)
                write(`  (partial: ${firstError})`);
            return 0;
        }
        // ── mode: --from-kus <file.json> --slug <s> → register a raw KU array ───────────────────────
        if (fromKus !== undefined) {
            if (fromKus === '') {
                write('dz brain add: --from-kus requires a JSON file path');
                return 1;
            }
            const slug = options.get('slug');
            if (slug === undefined || slug === '') {
                write('dz brain add --from-kus: --slug <s> is required (every KU is registered under it)');
                return 1;
            }
            const kusPath = resolve(cwd, fromKus);
            if (!existsSync(kusPath)) {
                write(`dz brain add: no KU file at ${kusPath}`);
                return 1;
            }
            let parsed;
            try {
                parsed = JSON.parse(readFileSync(kusPath, 'utf8'));
            }
            catch (err) {
                write(`dz brain add --from-kus: invalid JSON in ${kusPath}: ${err instanceof Error ? err.message : String(err)}`);
                return 1;
            }
            const valid = validateKuArray(parsed);
            if ('error' in valid) {
                write(`dz brain add --from-kus: bad KU shape — ${valid.error}`);
                return 1;
            }
            const kind = options.get('kind') ?? 'repo';
            if (kind !== 'repo' && kind !== 'book' && kind !== 'paper') {
                write(`dz brain add --from-kus: --kind must be one of repo|book|paper (got '${kind}')`);
                return 1;
            }
            const license = options.get('license');
            const result = await registerKusToBrain({
                kus: valid.kus,
                slug,
                kind,
                depsRoot,
                addedTs,
                ...(license !== undefined ? { license } : {}),
                ...(flags.has('override') ? { override: true } : {}),
            });
            if (asJson) {
                write(JSON.stringify({ slug, kind, ...result }));
                return result.kus === 0 ? 1 : 0;
            }
            if (result.kus === 0) {
                write(`dz brain add --from-kus: ${result.error ?? 'nothing registered'}`);
                return 1;
            }
            write(`dz brain: registered ${result.kus} KU under '${slug}' (kind ${kind}) into ${brainHome()}`);
            if (result.error !== undefined)
                write(`  (partial: ${result.error})`);
            return 0;
        }
        // ── default: promote THIS project's digitized book KB ──────────────────────────────────────
        const source = options.get('source');
        const result = await promoteProjectToBrain({
            projectRoot: resolve(cwd, options.get('project') ?? '.'),
            depsRoot,
            addedTs,
            ...(source !== undefined ? { source } : {}),
        });
        if (asJson) {
            write(JSON.stringify(result));
            return result.sources.length === 0 ? 1 : 0;
        }
        // No project KB (or nothing promotable) → honest failure + the fix.
        if (result.sources.length === 0) {
            write(`dz brain add: ${result.error ?? 'nothing to promote'}`);
            write('  Digitize a book into this project first, then re-run:');
            write('    use the digitize-book skill (or `book-kb-index`) to populate .dz/memory/books.sqlite');
            return 1;
        }
        write(`dz brain: promoted ${result.kus} KU from ${result.sources.length} source(s) into ${brainHome()}: ${result.sources.join(', ')}`);
        if (result.error !== undefined)
            write(`  (partial: ${result.error})`);
        return 0;
    }
    // ── dz brain update <slug> ───────────────────────────────────────────────────────────────────
    // Non-destructive refresh: the project re-ingested a source's book at a new corpus_version; re-read
    // its CURRENT project KUs and re-mirror them into the brain (stale-corpus rows evicted, others left
    // untouched). Reports before → after KU counts. Honest failure on unknown slug / no project KUs.
    if (sub === 'update') {
        const slug = options.get('_positional_1');
        if (!slug) {
            write('dz brain update: a source slug is required');
            write('  Example: dz brain update ddia --project .');
            return 1;
        }
        const result = await updateBrainSource({
            slug,
            projectRoot: resolve(cwd, options.get('project') ?? '.'),
            depsRoot: resolveDepsRoot(cwd),
            addedTs: new Date().toISOString(),
        });
        if (asJson) {
            write(JSON.stringify(result));
            return result.error !== undefined ? 1 : 0;
        }
        if (result.error !== undefined) {
            write(`dz brain update: ${result.error}`);
            write('  Re-ingest this source into THIS project (digitize-book / book-kb-index) before updating,');
            write('  and make sure the slug is already registered — see `dz brain list`.');
            return 1;
        }
        const corpus = (result.corpusVersion ?? '—').slice(0, 12);
        write(`dz brain: updated ${slug}: ${result.before} → ${result.after} KU (corpus ${corpus})`);
        return 0;
    }
    // ── dz brain reindex ────────────────────────────────────────────────────────────────────────
    // Rebuild the brain's book-KU vector mirror from the lexical brain store and stamp the current
    // embedding model manifest. Lexical books.sqlite remains the source of truth.
    if (sub === 'reindex') {
        const result = await reindexBrainVectors({ depsRoot: resolveDepsRoot(cwd) });
        if (asJson) {
            write(JSON.stringify(result));
            return result.error !== undefined ? 1 : 0;
        }
        if (result.error !== undefined) {
            write(`dz brain reindex: ${result.error}`);
            return 1;
        }
        write(`dz brain reindex: re-embedded ${result.reembedded} KU vector(s) with ${result.model} (manifest v${result.version})`);
        if (result.backupPath !== undefined)
            write(`  snapshot: ${result.backupPath}`);
        return 0;
    }
    // ── dz brain ground [<prompt>] ───────────────────────────────────────────────────────────────
    // The UserPromptSubmit hook entrypoint. ALWAYS exits 0 — grounding is advisory and must never
    // fail a prompt. Emits nothing (silent) unless the brain has relevant citations for the prompt.
    if (sub === 'ground') {
        const positional = options.get('_positional_1');
        // Positional prompt wins; else read the hook payload from STDIN. Empty stdin → emit nothing.
        const prompt = positional !== undefined && positional !== ''
            ? positional
            : extractPromptFromStdin(readStdin());
        if (prompt.trim() === '')
            return 0;
        const source = options.get('source');
        const kRaw = options.get('k');
        const k = kRaw !== undefined ? Math.max(1, parseInt(kRaw, 10) || 5) : undefined;
        // brain-ground-expand: --budget N eager-inlines top-K KU content within ~N tokens (chars/4);
        // --full = --budget GROUND_FULL_BUDGET; --budget 0 / absent ⇒ pointers-only (byte-identical).
        const budgetRaw = options.get('budget');
        let contentBudget;
        if (budgetRaw !== undefined) {
            const parsed = parseInt(budgetRaw, 10);
            if (isNaN(parsed) || parsed < 0) {
                write('dz brain ground: --budget must be a non-negative integer');
                return 1;
            }
            contentBudget = parsed === 0 ? undefined : parsed; // 0 → pointer-only (FR-03.6)
        }
        else if (flags.has('full')) {
            contentBudget = GROUND_FULL_BUDGET;
        }
        const gopts = {
            prompt,
            depsRoot: resolveDepsRoot(cwd),
        };
        if (k !== undefined)
            gopts.k = k;
        if (source !== undefined)
            gopts.source = source;
        if (contentBudget !== undefined)
            gopts.contentBudget = contentBudget;
        const res = await groundPrompt(gopts);
        if (!res.emitted)
            return 0; // no relevant citations → inject nothing
        // --text → raw block for manual inspection; default → Claude-Code-injectable additionalContext.
        if (flags.has('text')) {
            write(res.block);
            return 0;
        }
        write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'UserPromptSubmit',
                additionalContext: res.block,
            },
        }));
        return 0;
    }
    // ── dz brain expand <kuId> ───────────────────────────────────────────────────────────────────
    // Full-content lookup by kuId — the command named in GROUNDING_DIRECTIVE_EXPAND (brain-ground-expand
    // Tier 1). Prints the FULL `content` (+ name/problem/pages/book) for one citation the model wants
    // to read; --json emits the whole KU object. Exit 1 on missing kuId / not-found.
    if (sub === 'expand') {
        const kuId = options.get('_positional_1');
        if (!kuId) {
            write('dz brain expand: a kuId is required');
            write('  Example: dz brain expand ddia-ch05-ku01');
            return 1;
        }
        const source = options.get('source');
        const res = expandKu({
            kuId,
            depsRoot: resolveDepsRoot(cwd),
            ...(source !== undefined ? { source } : {}),
        });
        if (res.error !== undefined) {
            write(`dz brain expand: ${res.error}`);
            return 1;
        }
        const ku = res.ku;
        if (asJson) {
            write(JSON.stringify(ku, null, 2));
            return 0;
        }
        const ch = ku.chapter !== undefined && ku.chapter !== '' ? `гл.${ku.chapter}` : '';
        const pg = ku.pages !== undefined && ku.pages.length > 0 ? `с.${ku.pages.join('–')}` : '';
        write(`kuId:    ${ku.kuId}`);
        write(`book:    ${ku.book}`);
        if (ch)
            write(`chapter: ${ch}`);
        if (pg)
            write(`pages:   ${pg}`);
        write(`name:    ${ku.name}`);
        write(`problem: ${ku.problem}`);
        write('');
        write('content:');
        write(ku.content);
        return 0;
    }
    // ── dz brain init ────────────────────────────────────────────────────────────────────────────
    // Opt-in: wire `dz brain ground` into .claude/settings.json as a UserPromptSubmit hook.
    // Idempotent read-merge-write — preserve every existing hook/key (e.g. the agentic-qe route hook).
    if (sub === 'init') {
        const projectRoot = resolve(cwd, options.get('project') ?? '.');
        const kRaw = options.get('k');
        const k = kRaw !== undefined ? Math.max(1, parseInt(kRaw, 10) || 5) : 5;
        // Invoke the SAME bin this CLI runs from: dist/bin.js sits next to dist/cli.js.
        const dzBin = join(dirname(fileURLToPath(import.meta.url)), 'bin.js');
        const groundCmd = `node ${JSON.stringify(dzBin)} brain ground --k ${k}`;
        const settingsPath = join(projectRoot, '.claude', 'settings.json');
        let settings = {};
        if (existsSync(settingsPath)) {
            try {
                const parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
                if (parsed !== null && typeof parsed === 'object')
                    settings = parsed;
            }
            catch {
                // Corrupt/unreadable settings → start fresh rather than crash (grounding is opt-in glue).
                settings = {};
            }
        }
        const hooks = (settings['hooks'] !== null && typeof settings['hooks'] === 'object'
            ? settings['hooks']
            : {});
        const ups = Array.isArray(hooks['UserPromptSubmit']) ? [...hooks['UserPromptSubmit']] : [];
        // The grounding hook, in Claude Code's matcher-group shape (UserPromptSubmit takes no matcher).
        const entry = { hooks: [{ type: 'command', command: groundCmd, timeout: 5000 }] };
        // Identify OUR entry by a `brain ground` command; replace in place (idempotent), else append.
        const isGroundEntry = (e) => {
            const ex = e;
            return Array.isArray(ex?.hooks)
                && ex.hooks.some((h) => typeof h?.command === 'string' && h.command.includes('brain ground'));
        };
        const idx = ups.findIndex(isGroundEntry);
        const replaced = idx >= 0;
        if (replaced)
            ups[idx] = entry;
        else
            ups.push(entry);
        hooks['UserPromptSubmit'] = ups;
        settings['hooks'] = hooks;
        mkdirSync(dirname(settingsPath), { recursive: true });
        writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
        write(`dz brain init: ${replaced ? 're-wired' : 'wired'} the grounding hook into ${settingsPath}`);
        write(`  UserPromptSubmit → ${groundCmd}`);
        write(`  Grounding is now ON for this project (k=${k}). Every prompt is screened against your brain;`);
        write(`  when ≥2 content terms co-occur in a stored KU, the retrieved citations are injected as`);
        write(`  additionalContext. The command exits 0 on any failure (empty brain, error, empty stdin),`);
        write(`  so a grounding miss can never block or fail a prompt (continueOnError-equivalent).`);
        write(`  Honesty: the hook only MECHANICALLY injects the retrieved citations — actually answering`);
        write(`  FROM them (not from model memory/drift) is agent discipline (§7.2), not something the hook`);
        write(`  can enforce.`);
        write(`  To turn it OFF: remove the "brain ground" entry under hooks.UserPromptSubmit in ${settingsPath}.`);
        return 0;
    }
    // ── unknown / absent subcommand ──────────────────────────────────────────────────────────────
    write(BRAIN_USAGE);
    return sub === undefined ? 0 : 1;
}
async function cmdSetup(options, flags, cwd, write, writeErr) {
    const targetOpt = options.get('target');
    if (!targetOpt) {
        writeErr(`dz setup: --target required (${TARGET_NAMES_SORTED.join(', ')})`);
        return 1;
    }
    const setupResolution = resolveTargetName(targetOpt);
    if (setupResolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz setup', setupResolution))
            writeErr(line);
        return 1;
    }
    const target = setupResolution.target;
    if (setupResolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz setup', targetOpt, target));
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const presetName = options.get('preset');
    // PREFLIGHT BEFORE THE FIRST WRITE (backlog 9d15b9b6, PR-A). Step 3 configures the learning
    // environment and step 4 installs skills, so refusing at step 4 would leave a project that has
    // memory and hooks but not the skills the operator asked for — a half-configured state worse than
    // either clean outcome. The request is therefore resolved HERE, before the banner's first step.
    //
    // Only an EXPLICIT --select is refused. A preset names skills the package itself ships, so a gap
    // there is our packaging defect, not the operator's typo, and it is reported by the existing
    // missing-list rather than by refusing the whole run.
    const setupSelectRaw = options.get('select');
    if (setupSelectRaw !== undefined) {
        const requested = setupSelectRaw.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
        const roots = discoverSkillsDirs(cwd, options.get('skills-dir')).map((dir) => ({ dir, ids: discoverSkillIds(dir) }));
        const resolution = resolveSelection(requested, roots);
        for (const shadow of resolution.shadowed) {
            writeErr(`dz: skill '${shadow.id}' is offered by ${shadow.alsoIn.length + 1} roots; installing from ${shadow.chosen} (earlier root wins). Also present in: ${shadow.alsoIn.join(', ')}`);
        }
        const refusal = formatSelectRefusal(resolution, roots);
        if (refusal !== null) {
            writeErr(refusal);
            return 1;
        }
    }
    write(`\n╔══════════════════════════════════════════════════════╗`);
    write(`║           DZ SETUP — Full Environment                ║`);
    write(`╠══════════════════════════════════════════════════════╣`);
    // Step 1: Run pretrain to analyze project
    write(`║  1. Analyzing project...                              ║`);
    const analysis = pretrain(projectRoot);
    write(`║     Type: ${analysis.projectType.padEnd(15)} Techs: ${String(analysis.techs.length).padStart(2)}                 ║`);
    // Step 2: Determine preset (auto or manual)
    const preset = presetName ?? analysis.recommendedPresets[0] ?? 'devops';
    write(`║  2. Preset: ${preset.padEnd(40)}║`);
    // Step 3: Run setup (hooks + memory + config)
    write(`║  3. Setting up learning environment...                ║`);
    const memoryOpt = options.get('memory');
    const setupResult = runSetup({
        projectRoot,
        target,
        preset,
        memory: memoryOpt === 'agentdb' ? 'agentdb' : undefined,
        noHooks: flags.has('no-hooks'),
        noMemory: flags.has('no-memory'),
        force: flags.has('force'),
        installDriver: flags.has('install-driver'),
    });
    for (const step of setupResult.steps) {
        const icon = step.status === 'done' ? '✓' : step.status === 'skipped' ? '○' : '✗';
        write(`║     ${icon} ${step.name.padEnd(25)} ${step.detail.slice(0, 20).padEnd(20)}║`);
    }
    // Step 4: Install skills — actually compile them to the target (shared with `dz init`).
    // Honors --select (overrides the preset); otherwise installs the resolved preset's skills.
    write(`║  4. Installing skills...                              ║`);
    const selectArg = options.get('select');
    const select = selectArg !== undefined
        ? selectArg.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        : getPreset(preset)?.skills;
    const install = select !== undefined && select.length > 0
        ? await installSkills({
            target, projectRoot, cwd, explicitSkillsDir: options.get('skills-dir'), select,
            force: flags.has('force'), enrich: flags.has('enrich'), noHooks: flags.has('no-hooks'),
            noIntegrations: flags.has('no-integrations'),
            noVerify: flags.has('no-verify'),
            ...(options.get('allow-integrations') !== undefined ? { allowIntegrations: options.get('allow-integrations') } : {}),
        })
        : undefined;
    if (install) {
        write(`║     ${String(install.results.length).padStart(2)} skill(s), ${String(install.written).padStart(3)} file(s) written${' '.repeat(15)}║`);
    }
    else {
        write(`║     (no skills resolved)                              ║`);
    }
    // Step 5 (ADR-001 §8): DELIVER the codex hooks and verify them live. Non-aborting — the rest of
    // setup has already run and the summary still prints; only the exit code carries the failure.
    let setupIntegrationOutcomes = install?.integrations ?? [];
    let codexHooksOk = true;
    if (target === 'codex' && !flags.has('no-hooks')) {
        write(`║  5. Delivering codex hooks (live verify)...           ║`);
        const delivery = deliverCodexHooks({ project: projectRoot, verify: !flags.has('no-verify') }, undefined, 'dz setup');
        codexHooksOk = delivery.ok;
        for (const line of delivery.stdout)
            write(line);
        for (const line of delivery.stderr)
            writeErr(line);
        const hookIndex = setupIntegrationOutcomes.findIndex((row) => row.component === 'hooks' && row.status !== 'not-requested');
        if (hookIndex !== -1) {
            const hook = normalizeCodexHookOutcome(setupIntegrationOutcomes[hookIndex], delivery, flags.has('no-verify'));
            setupIntegrationOutcomes = setupIntegrationOutcomes.map((row, index) => index === hookIndex ? hook : row);
        }
    }
    write(`╠══════════════════════════════════════════════════════╣`);
    write(`║  Setup: ${String(setupResult.completed).padStart(2)} done, ${String(setupResult.skipped).padStart(2)} skipped                     ║`);
    // Honest label derived from the ACTUAL wiring (runSetup's 'agentdb wiring' invariant check),
    // not from package presence — a skipped hook/MCP step must not let the summary claim a store
    // nothing writes to (audit code#3).
    const wiring = setupResult.steps.find((s) => s.name === 'agentdb wiring');
    const backendLabel = memoryOpt === 'agentdb'
        ? (wiring?.status === 'done' ? 'agentdb (.dz/agentdb.db + .dz/agentdb-mcp.db, separate stores)' : `agentdb INCOMPLETE — see setup steps`)
        : 'sessions.jsonl + patterns.jsonl';
    write(`║  Learning: ${backendLabel.padEnd(41)}║`);
    write(`║  Hooks: ${flags.has('no-hooks') ? 'disabled' : 'session-start + session-end'}${' '.repeat(flags.has('no-hooks') ? 30 : 15)}║`);
    write(`╚══════════════════════════════════════════════════════╝`);
    // Plain detail after the box (avoids box-width fragility) + missing-skill guidance.
    if (install) {
        write(`dz setup: ${install.results.length} skill(s), ${install.written} file(s) written, ${install.skipped} skipped`
            + (install.dirsSearched > 1 ? `  (searched ${install.dirsSearched} skill dirs)` : ''));
        for (const outcome of setupIntegrationOutcomes) {
            write(`dz setup integration ${outcome.component}: ${outcome.status.toUpperCase()}${outcome.reasonCode ? ` (${outcome.reasonCode})` : ''}`);
        }
        writeMissingSkillsHint(write, install.missing, selectArg !== undefined ? undefined : preset);
    }
    // A hook that was written but never witnessed firing is NOT a completed setup (ADR-002 §5): the
    // step is reported failed, the process was not aborted.
    //
    // …and neither is a setup that PRINTED an error step. The first version returned on codexHooksOk
    // alone, so `dz setup` could report `agentdb wiring: error` — the very invariant this feature
    // defends — and still exit 0, which is what a CI job reads (cross-family QE, Codex gpt-5.6-sol).
    // An exit code that disagrees with the report on screen is the same class of lie as a green run
    // on a stale build.
    const erroredSteps = setupResult.steps.filter((s) => s.status === 'error').map((s) => s.name);
    if (erroredSteps.length > 0) {
        write(`\n✗ setup reported ${erroredSteps.length} failed step(s): ${erroredSteps.join(', ')} — exit 1`);
    }
    const integrationsOk = !setupIntegrationOutcomes.some((row) => row.status === 'refused');
    return codexHooksOk && erroredSteps.length === 0 && integrationsOk ? 0 : 1;
}
function cmdPretrain(options, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const result = pretrain(projectRoot);
    write(`\n╔══════════════════════════════════════════════════════════════╗`);
    write(`║                 DZ PRETRAIN — Project Analysis              ║`);
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  Project: ${result.projectName.slice(0, 30).padEnd(30)}  Type: ${result.projectType.padEnd(17)}║`);
    write(`║  Packages: ${String(result.packageCount).padStart(3)}   Tests: ${result.hasTests ? 'yes' : 'no '}   Docker: ${result.hasDocker ? 'yes' : 'no '}   CI: ${result.hasCI ? 'yes' : 'no '}      ║`);
    write(`║  Terraform: ${result.hasTerraform ? 'yes' : 'no '}  K8s: ${result.hasKubernetes ? 'yes' : 'no '}                                ║`);
    write(`╠══════════════════════════════════════════════════════════════╣`);
    if (result.techs.length > 0) {
        write(`║  DETECTED TECHNOLOGIES (${result.techs.length})${' '.repeat(36 - String(result.techs.length).length)}║`);
        for (const tech of result.techs.slice(0, 12)) {
            const conf = `${Math.round(tech.confidence * 100)}%`;
            write(`║    ${tech.name.padEnd(18)} ${tech.category.padEnd(12)} ${conf.padStart(4)} (${tech.source.slice(0, 22)})${' '.repeat(Math.max(0, 22 - tech.source.slice(0, 22).length))}║`);
        }
        write(`║${''.padEnd(62)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  RECOMMENDED PRESETS                                        ║`);
    for (const p of result.recommendedPresets) {
        write(`║    dz init --target claude-code --preset ${p.padEnd(19)}║`);
    }
    write(`║${''.padEnd(62)}║`);
    write(`║  RECOMMENDED SKILLS (${result.recommendedSkills.length})${' '.repeat(38 - String(result.recommendedSkills.length).length)}║`);
    const skillLine = result.recommendedSkills.join(', ');
    const chunks = skillLine.match(/.{1,58}/g) ?? [skillLine];
    for (const chunk of chunks) {
        write(`║    ${chunk.padEnd(58)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  QUICK INSTALL                                              ║`);
    if (result.recommendedPresets[0]) {
        write(`║    dz init --target claude-code --preset ${result.recommendedPresets[0].padEnd(19)}║`);
    }
    write(`╚══════════════════════════════════════════════════════════════╝`);
    return 0;
}
function cmdRecommend(options, flags, cwd, write) {
    const task = options.get('_positional_0');
    if (!task) {
        write('dz recommend: task description required');
        write('  Example: dz recommend "build a REST API with PostgreSQL and deploy to K8s"');
        return 1;
    }
    const registry = buildRegistry(cwd);
    const report = recommend(task, registry, cwd);
    if (flags.has('json')) {
        write(JSON.stringify(report, null, 2));
        return 0;
    }
    write(`\n╔══════════════════════════════════════════════════════════════╗`);
    write(`║                 DZ RECOMMEND — Task Advisor                 ║`);
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  Task: ${report.task.slice(0, 52).padEnd(52)}║`);
    if (report.topicSource === 'task') {
        write(`║  Topics: ${report.topics.join(', ').slice(0, 50).padEnd(50)}║`);
    }
    else if (report.topicSource === 'project-stack') {
        write(`║  Topics: ${'not matched in the question'.padEnd(50)}║`);
    }
    else {
        write(`║  Topics: ${'not recognized — no recommendations'.padEnd(50)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    if (report.topicSource === 'project-stack') {
        write(`⚠ Тема запроса не распознана — подбор ниже сделан по СТЕКУ ПРОЕКТА, не по вашему вопросу.`);
        write(`  (topic not recognized — recommendations reflect the project stack, not the question)`);
        write(`PROJECT-STACK SUGGESTIONS`);
    }
    else if (report.topicSource === 'none') {
        write(`Тема запроса не распознана; рекомендаций нет.`);
        write(`Переформулируйте задачу или используйте dz registry search <слово> / /skill-advisor.`);
        write(`╚══════════════════════════════════════════════════════════════╝`);
        return 0;
    }
    const stackDerived = report.topicSource === 'project-stack';
    if (report.presets.length > 0) {
        write(stackDerived
            ? `║  PROJECT-STACK PRESETS                                      ║`
            : `║  RECOMMENDED PRESETS                                        ║`);
        for (const p of report.presets) {
            const matched = p.matchedSkills.length > 0 ? ` (${p.matchedSkills.slice(0, 3).join(', ')})` : '';
            write(`║    ${p.name.padEnd(15)} ${String(p.skills).padStart(2)} skills  coverage: ${String(p.coverage).padStart(2)} topics${matched.padEnd(15)}║`);
        }
        write(`║${''.padEnd(62)}║`);
    }
    if (report.skills.length > 0) {
        write(stackDerived
            ? `║  PROJECT-STACK SKILLS (top ${Math.min(report.skills.length, 8)})${' '.repeat(35)}║`
            : `║  RECOMMENDED SKILLS (top ${Math.min(report.skills.length, 8)})${' '.repeat(35)}║`);
        for (const s of report.skills.slice(0, 8)) {
            const desc = s.description.length > 35 ? s.description.slice(0, 32) + '...' : s.description;
            write(`║    ${s.id.padEnd(24)} ${desc.padEnd(36)}║`);
        }
        write(`║${''.padEnd(62)}║`);
    }
    if (report.toolkits.length > 0) {
        write(stackDerived
            ? `║  PROJECT-STACK PIPELINE (npx toolkits)                      ║`
            : `║  FULL PIPELINE (npx toolkits)                               ║`);
        for (const tk of report.toolkits) {
            const desc = tk.description.length > 44 ? tk.description.slice(0, 41) + '...' : tk.description;
            write(`║    ${tk.name.padEnd(16)} ${desc.padEnd(44)}║`);
            const inst = tk.install.length > 56 ? tk.install.slice(0, 53) + '...' : tk.install;
            write(`║      ${inst.padEnd(56)}║`);
        }
        write(`║${''.padEnd(62)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(stackDerived
        ? `║  PROJECT-STACK PLAN                                         ║`
        : `║  STEP-BY-STEP PLAN                                         ║`);
    for (const step of report.plan) {
        const line = step.length > 60 ? step.slice(0, 57) + '...' : step;
        write(`║    ${line.padEnd(58)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(stackDerived
        ? `║  PROJECT-STACK QUICK INSTALL                                ║`
        : `║  QUICK INSTALL                                              ║`);
    const cmd = report.installCommand.length > 58 ? report.installCommand.slice(0, 55) + '...' : report.installCommand;
    write(`║    ${cmd.padEnd(58)}║`);
    write(`╚══════════════════════════════════════════════════════════════╝`);
    // Bridge to the semantic, pipeline-aware recommender skill. This CLI is keyword-based;
    // skill-advisor (in skills-meta / the `meta` preset) reasons over the live registry, composes
    // multi-skill pipelines, judges toolkit-vs-loose-skills, and flags gaps honestly.
    write(`\n💡 For deeper, semantic recommendations (pipelines + npx-toolkit picks + honest gaps),`);
    write(`   run /skill-advisor in Claude Code — it improves on this keyword match.`);
    write(`   Get it: dz init --target claude-code --select skill-advisor   (or --preset meta)`);
    return 0;
}
function cmdUpgrade(options, flags, cwd, write, writeErr) {
    const targetOpt = options.get('target') ?? 'claude-code';
    const upgradeResolution = resolveTargetName(targetOpt);
    if (upgradeResolution.kind === 'unknown') {
        for (const line of formatTargetProblem('dz upgrade', upgradeResolution))
            writeErr(line);
        return 1;
    }
    // The dir map is keyed by the RESOLVED name — keying it by the raw `--target` would
    // let an alias validate and then miss the map.
    const upgradeTarget = upgradeResolution.target;
    if (upgradeResolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz upgrade', targetOpt, upgradeTarget));
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const targetDirMap = {
        'claude-code': '.claude/skills', codex: '.agents/skills', opencode: '.opencode/skills',
        hermes: '.hermes/skills', openclaude: '.openclaude/skills', copilot: '.github/instructions',
        'agents-md': 'AGENTS.md', cursor: '.cursor/rules', gemini: 'GEMINI.md',
        windsurf: '.windsurf/rules',
    };
    const mappedDir = targetDirMap[upgradeTarget];
    if (mappedDir === undefined) {
        write(`dz upgrade: no skills directory mapping for target ${upgradeTarget}`);
        return 1;
    }
    const targetDir = join(projectRoot, mappedDir);
    // Find canonical sources
    const baseDir = join(cwd, 'packages', '@dzhechkov');
    const canonicalDirs = [];
    if (existsSync(baseDir)) {
        for (const e of readdirSync(baseDir, { withFileTypes: true })) {
            if (e.isDirectory() && e.name.startsWith('skills-')) {
                canonicalDirs.push(join(baseDir, e.name));
            }
        }
    }
    const report = checkUpgrades(targetDir, canonicalDirs);
    write(`\ndz upgrade — ${upgradeTarget} (${targetDir})`);
    write(`  Installed: ${report.installed}  Needs update: ${report.needsUpdate}  Up-to-date: ${report.upToDate}  Custom: ${report.notInCanonical}\n`);
    for (const check of report.skills) {
        const icon = check.needsUpdate ? '△' : check.canonicalSize === undefined ? '?' : '✓';
        write(`  ${icon} ${check.id.padEnd(25)} ${check.reason}`);
    }
    if (report.needsUpdate > 0) {
        write(`\n${report.needsUpdate} skill(s) need update. Run: dz init --target ${upgradeTarget} --force`);
    }
    // ADR-001 (verify-apply-leg): verify what we just left on disk. A TAMPERED pack aborts.
    const sigFatal = reportPackVerification(projectRoot, options.get('pubkey'), flags.has('require-signing'), write);
    if (sigFatal !== 0) {
        write('dz upgrade: aborting — an installed pack does not match its signed manifest');
        return 1;
    }
    return 0;
}
async function cmdAutoCanonicalize(options, cwd, write) {
    const source = options.get('source');
    const pack = options.get('pack');
    if (!source || !pack) {
        write('dz auto-canonicalize: --source <github-url> and --pack <skills-pack-dir> required');
        write('  Example: dz auto-canonicalize --source github.com/user/repo --pack packages/@dzhechkov/skills-devops');
        return 1;
    }
    // Parse GitHub URL → owner/repo
    const match = /(?:github\.com\/)?([^/]+\/[^/]+)/.exec(source);
    if (!match) {
        write(`dz auto-canonicalize: cannot parse GitHub URL from "${source}"`);
        return 1;
    }
    const repo = match[1];
    write(`Scanning ${repo} for SKILL.md files...`);
    // Fetch repo tree
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); }, 15000);
        const treeUrl = `https://api.github.com/repos/${repo}/git/trees/main?recursive=1`;
        const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'dz-harness' };
        if (process.env['GITHUB_TOKEN'])
            headers['Authorization'] = `token ${process.env['GITHUB_TOKEN']}`;
        const resp = await fetch(treeUrl, { signal: controller.signal, headers });
        clearTimeout(timer);
        if (!resp.ok) {
            write(`dz auto-canonicalize: GitHub API error ${resp.status}`);
            return 1;
        }
        const tree = (await resp.json());
        const skillMds = tree.tree
            .filter((n) => n.type === 'blob' && /SKILL\.md$/i.test(n.path))
            .map((n) => n.path);
        if (skillMds.length === 0) {
            write(`dz auto-canonicalize: no SKILL.md files found in ${repo}`);
            return 0;
        }
        write(`Found ${skillMds.length} SKILL.md file(s):\n`);
        for (const path of skillMds) {
            const parts = path.split('/');
            const skillName = parts[parts.length - 2] ?? parts[0] ?? 'unknown';
            write(`  ${skillName.padEnd(30)} ${path}`);
        }
        write(`\nTo bring each skill into the canonical tree, run:`);
        const packDir = resolve(cwd, pack);
        for (const path of skillMds) {
            const parts = path.split('/');
            const skillName = parts[parts.length - 2] ?? parts[0] ?? 'unknown';
            write(`  dz create-skill --name ${skillName} --skills-dir ${packDir}`);
        }
        write(`\nThen copy content from https://raw.githubusercontent.com/${repo}/main/<path>`);
        return 0;
    }
    catch (err) {
        write(`dz auto-canonicalize: ${err instanceof Error ? err.message : String(err)}`);
        return 1;
    }
}
/** The pinned trust root. A key inside the artifact under verification is data, not a key (ADR-001). */
const TRUST_ROOT_REL = 'keys/dz.pub';
// One walk to rule both: the SIGN file list is core's listPackFiles — the SAME function verify uses for
// its added-file sweep, so the two can never drift apart again (the 10-false-TAMPERED lesson, task #36).
const packFiles = (dir) => listSignablePackFiles(dir);
/**
 * The consumer-side apply-leg (ADR-001, verify-apply-leg). All security content lives in the two pure
 * functions in harness-core; this only resolves paths, reads bytes, and reports.
 *
 * The packaged key sits inside harness-cli — the VERIFIER — and vouches for other packs. It never
 * comes from the pack under verification.
 */
function packagedTrustRootPath() {
    // dist/cli.js -> ../keys/dz.pub  (and src/cli.ts -> ../keys/dz.pub when run from source)
    const p = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'keys', 'dz.pub');
    return existsSync(p) ? p : undefined;
}
function verifyInstalledPacks(cwd, explicitPubkey) {
    // Cross-model review: `--pubkey ./missing.pub` used to fall back to the repo/packaged key and could
    // then report `verified` against a key the caller never asked for. An explicit request that cannot be
    // honoured is an error, not a suggestion.
    const explicit = explicitPubkey ? resolve(cwd, explicitPubkey) : undefined;
    if (explicit !== undefined && !existsSync(explicit)) {
        throw new Error('dz: --pubkey ' + explicit + ' does not exist — refusing to fall back to another key');
    }
    const repoKey = resolve(cwd, TRUST_ROOT_REL);
    const trustRoot = resolveTrustRoot({
        explicit: explicit && existsSync(explicit) ? explicit : undefined,
        repo: existsSync(repoKey) ? repoKey : undefined,
        packaged: packagedTrustRootPath(),
    });
    // ADR-001: verification asks "which packs carry a signature?", which is NOT the question
    // `discoverSkillPackDirs` answers. MEASURED 2026-08-21 — the prefix filter left 26 of 52 signed
    // packs invisible, `keysarium` drifted unnoticed, and the summary line read as coverage.
    const packs = discoverVerifiablePackDirs(cwd);
    // Cross-model review: `--pubkey <pack>/evil.pub` would let the artifact supply its own verifying key
    // through the caller. The tool must never verify a pack against a key that lives inside it.
    if (trustRoot?.source === 'explicit') {
        for (const { dir } of packs) {
            if (isInsideTree(trustRoot.path, dir)) {
                throw new Error('dz: --pubkey lives inside the pack being verified (' + dir + ') — refusing');
            }
        }
    }
    const checks = [];
    for (const { pack, dir } of packs) {
        if (trustRoot === null) {
            checks.push({ pack, verdict: 'no-trust-root', failures: [] });
            continue;
        }
        const manifestPath = join(dir, MANIFEST_NAME);
        if (!existsSync(manifestPath)) {
            checks.push({ pack, verdict: 'unsigned', failures: [] });
            continue;
        }
        let signed;
        try {
            signed = JSON.parse(readFileSync(manifestPath, 'utf8'));
        }
        catch {
            checks.push({ pack, verdict: 'tampered', failures: [{ path: MANIFEST_NAME, reason: 'not valid JSON' }] });
            continue;
        }
        // The key existed when the trust root was resolved; it can vanish before it is read. A crash is
        // not a verdict — fail closed with a named reason.
        let keyPem;
        try {
            keyPem = readFileSync(trustRoot.path, 'utf8');
        }
        catch {
            checks.push({ pack, verdict: 'no-trust-root', failures: [] });
            continue;
        }
        // A SOURCE tree legitimately holds files the tarball never ships (tests, coverage, CHANGELOG), so
        // the added-file sweep is meaningless there — scoping it to the manifest's own list disables it.
        // An INSTALLED pack under node_modules IS the extracted artifact, and there the sweep is the whole
        // point: it is what catches a file an attacker added. Same function, two honest modes.
        //
        // This distinction had to be drawn the moment the SIGNER started covering only the shipped set
        // (2026-08-21). Leaving it undrawn made every source pack report TAMPERED — the third time in one
        // day that a scope change on one side was not mirrored on the other.
        // An ARTIFACT is an extracted tarball, and extracted tarballs live in `node_modules`. Anything
        // else is a checkout. Deliberately NOT keyed on `cwd`: packs are also discovered from the CLI's
        // own install location, which is outside the project being checked — keying on cwd made the
        // repo's own source packs look like artifacts and report TAMPERED from a temp-dir fixture.
        // Resolve the link FIRST: pnpm links workspace packages into `node_modules`, so a source checkout
        // is reachable by a path that looks like an artifact. Judging by the given path made the repo's
        // own packs verify as tarballs and report TAMPERED (measured while wiring this).
        let realDir = dir;
        try {
            realDir = realpathSync(dir);
        }
        catch { /* keep the given path */ }
        const isSourceTree = !realDir.split(sep).includes('node_modules');
        if (isSourceTree) {
            // The manifest describes the PUBLISHED TARBALL, and a source checkout is a different object —
            // `pnpm publish` re-serialises package.json and rewrites `workspace:*`. Hash-verifying a
            // checkout against it produces a guaranteed false TAMPERED, so this reports a state of its own
            // instead of an alarm. `dz verify-pack` packs and checks the real artifact.
            checks.push({ pack, verdict: 'source-tree', failures: [] });
            continue;
        }
        const res = verifyManifest(dir, signed, keyPem);
        checks.push({
            pack,
            verdict: res.ok ? 'verified' : 'tampered',
            failures: res.failures.map((f) => ({ path: f.path, reason: f.reason })),
        });
    }
    return { trustRoot, checks };
}
/**
 * The signature verdicts as DATA. The text reporter and the `--json` output both render this, so the
 * two cannot disagree about what was found — the failure this feature removes is exactly a verdict
 * that exists in one surface and not the other.
 */
function collectPackVerification(cwd, explicitPubkey) {
    let trustRoot = null;
    let checks = [];
    try {
        ({ trustRoot, checks } = verifyInstalledPacks(cwd, explicitPubkey));
    }
    catch {
        // A refusal is a result: an empty listing with no trust root, not a crash and not a silent pass.
        return { trustRoot: null, counts: { verified: 0, unsigned: 0, tampered: 0, 'no-trust-root': 0, 'source-tree': 0 }, packs: [] };
    }
    const counts = { verified: 0, unsigned: 0, tampered: 0, 'no-trust-root': 0, 'source-tree': 0 };
    for (const c of checks)
        counts[c.verdict]++;
    return {
        trustRoot: trustRoot === null ? null : { source: trustRoot.source, path: trustRoot.path },
        counts,
        packs: checks.map((c) => ({ pack: c.pack, verdict: c.verdict, failures: [...c.failures] })),
    };
}
/** Print the pack verdicts and return 1 iff the policy says any of them is fatal. */
function reportPackVerification(cwd, explicitPubkey, requireSigning, write) {
    let trustRoot;
    let checks;
    try {
        ({ trustRoot, checks } = verifyInstalledPacks(cwd, explicitPubkey));
    }
    catch (err) {
        // A refusal is a result, not a crash: the user gets one line, not a stack trace.
        write(`  [XX] ${err.message}`);
        return 1;
    }
    if (checks.length === 0)
        return 0;
    const counts = { verified: 0, unsigned: 0, tampered: 0, 'no-trust-root': 0, 'source-tree': 0 };
    let fatal = 0;
    for (const c of checks) {
        counts[c.verdict]++;
        const decision = decideVerifyPolicy(c.verdict, requireSigning);
        // Only a FATAL verdict earns a line of its own. 22 identical "unverifiable" lines is noise, and
        // noise is how a real failure gets scrolled past.
        if (decision.action === 'fail') {
            fatal++;
            write(`  [XX] ${c.pack} - ${decision.reason}`);
            for (const f of c.failures)
                write(`         ${f.path}: ${f.reason}`);
        }
    }
    const root = trustRoot ? `${trustRoot.source} (${trustRoot.path})` : 'none';
    write(`  signatures: ${counts.verified} verified, ${counts.unsigned} unsigned, ` +
        `${counts.tampered} TAMPERED, ${counts['no-trust-root']} unverifiable, ${counts['source-tree']} source-tree (not an artifact); trust root: ${root}`);
    // A signature proves the bytes are unmodified. It never proves the skill is any good.
    return fatal > 0 ? 1 : 0;
}
function cmdSign(options, flags, cwd, write) {
    // `dz sign --init` — one-time keygen. Writes the PRIVATE key OUTSIDE the repo (default ~/.dz/keys/dz.key,
    // mode 0600) and prints the PUBLIC key for the operator to commit as keys/dz.pub. The private key never
    // touches the repo or a tarball (the hard invariant — enforced by assertKeyOutsideTree).
    if (flags.has('init')) {
        const outPath = resolve(cwd, options.get('out') ?? join(homedir(), '.dz', 'keys', 'dz.key'));
        // Resolve symlinks BEFORE the containment check: an --out (or a parent dir) that is a symlink pointing
        // INTO the repo would otherwise slip the private key inside the tree past a string-only guard — including a
        // DANGLING symlink whose target does not exist yet (existsSync follows the link and reports false, so the
        // symlink itself must be resolved via lstat/readlink, not existsSync).
        const realTarget = (() => {
            // walk up to the deepest path that exists as ANY entry (file, dir, or even a dangling symlink).
            let anc = outPath;
            const tail = [];
            for (;;) {
                try {
                    lstatSync(anc);
                    break;
                }
                catch { /* not present */ }
                const parent = dirname(anc);
                if (parent === anc)
                    return outPath; // reached root without an existing entry
                tail.unshift(basename(anc));
                anc = parent;
            }
            let base;
            try {
                base = realpathSync(anc); // resolves dirs/files and any RESOLVABLE symlink chain
            }
            catch {
                // `anc` exists but realpath threw → a dangling symlink: resolve its immediate target by hand.
                try {
                    base = resolve(dirname(anc), readlinkSync(anc));
                }
                catch {
                    return outPath;
                }
            }
            return tail.length ? join(base, ...tail) : base;
        })();
        try {
            assertKeyOutsideTree(realTarget, cwd);
        }
        catch (err) {
            write(`dz sign --init: ${err.message}`);
            write('  choose an --out path (and parent) OUTSIDE the repository (e.g. ~/.dz/keys/dz.key)');
            return 1;
        }
        if (existsSync(outPath) && !flags.has('force')) {
            write(`dz sign --init: ${outPath} already exists — refusing to overwrite (pass --force to replace)`);
            write('  overwriting a signing key orphans every pack signed with the old one.');
            return 1;
        }
        const { privateKey, publicKey } = generateSigningKeypair();
        try {
            mkdirSync(dirname(outPath), { recursive: true });
            // Unlink an existing file first: writeFileSync's `mode` is ignored when the file already exists, so a
            // pre-existing 0644 key would stay world-readable after --force. Removing it forces a fresh 0600 create.
            if (existsSync(outPath))
                rmSync(outPath, { force: true });
            writeFileSync(outPath, privateKey, { mode: 0o600 });
            chmodSync(outPath, 0o600); // belt-and-suspenders: guarantee 0600 regardless of umask/prior state
        }
        catch (err) {
            write(`dz sign --init: could not write the private key to ${outPath}: ${err.message}`);
            return 1;
        }
        write(`dz sign --init: Ed25519 keypair generated.`);
        write(`  private key → ${outPath} (mode 0600, OUTSIDE the repo — never commit it)`);
        write(`  public key  → commit the block below as ${TRUST_ROOT_REL}:`);
        write('');
        write(publicKey.trimEnd());
        write('');
        write(`  then: dz sign --pack <dir> --key ${outPath}   (sign a pack)`);
        return 0;
    }
    const pack = options.get('pack');
    const key = options.get('key');
    if (!pack || !key) {
        write('dz sign: --pack <dir> and --key <path> are both required (or: dz sign --init to generate a keypair)');
        write('  the key path MUST be outside the repository working tree (a leaked signing key is not revertible)');
        return 1;
    }
    const packDir = resolve(cwd, pack);
    if (!existsSync(packDir)) {
        write(`dz sign: no such pack: ${packDir}`);
        return 1;
    }
    try {
        assertKeyOutsideTree(resolve(cwd, key), cwd);
    }
    catch (err) {
        write(`dz sign: ${err.message}`);
        return 1;
    }
    if (!existsSync(resolve(cwd, key))) {
        write(`dz sign: private key not found: ${resolve(cwd, key)}`);
        return 1;
    }
    // The manifest covers what the CONSUMER receives. `dz sign` and the publish-time re-sign MUST use
    // the same rule, or the two produce different manifests for the same pack — a second, divergent
    // answer beside the real one, which is the class of defect this change removes.
    // Hash the EXTRACTED TARBALL, not the working tree. `pnpm publish` re-serialises package.json and
    // rewrites `workspace:*`, so a hash taken from disk is stale before the tarball exists — MEASURED
    // 2026-08-21: the published `skills-news` package.json is 1050 bytes where the tree's is 1051, and
    // that single missing newline made six freshly re-signed packs report TAMPERED to every consumer.
    // `dz sign` and the publish-time re-sign use this same path, or they produce different manifests for
    // the same pack.
    let hashRoot = packDir;
    let cleanupPack = null;
    let files = packFiles(packDir);
    try {
        const extracted = extractPublishTarball(packDir);
        hashRoot = extracted.dir;
        cleanupPack = extracted.cleanup;
        files = packFiles(hashRoot);
        write(`dz sign: hashing the packed tarball (${files.length} file(s)) — the bytes a recipient receives`);
    }
    catch (err) {
        // Not an npm package, or no pnpm: sign the tree and SAY SO. A silent fallback would restore the
        // divergence this change closes.
        write(`dz sign: could not pack this directory (${err.message.split('\n')[0]}) — signing the working tree instead`);
    }
    if (files.length === 0) {
        cleanupPack?.();
        write('dz sign: the pack contains no files — refusing to sign nothing');
        return 1;
    }
    const manifest = buildManifest(hashRoot, basename(packDir), files);
    const signed = signManifest(manifest, readFileSync(resolve(cwd, key), 'utf8'));
    writeFileSync(join(packDir, MANIFEST_NAME), JSON.stringify(signed, null, 2) + '\n');
    writeFileSync(join(packDir, SBOM_NAME), JSON.stringify(buildSbom(manifest), null, 2) + '\n');
    cleanupPack?.();
    write(`dz sign: signed ${files.length} file(s) in ${packDir}`);
    write(`  ${MANIFEST_NAME} + ${SBOM_NAME} written. Ed25519 gives tamper-evidence, never truthfulness.`);
    return 0;
}
function cmdVerifyPack(options, flags, cwd, write) {
    const pack = options.get('pack');
    if (!pack) {
        write('dz verify-pack: --pack <dir> is required');
        return 1;
    }
    const packDir = resolve(cwd, pack);
    // The key is pinned in the repo. Never read it from the pack (ADR-001, recalled lesson).
    const pubPath = resolve(cwd, options.get('pubkey') ?? TRUST_ROOT_REL);
    if (!existsSync(pubPath)) {
        write(`dz verify-pack: no trust root at ${pubPath} — refusing to verify (fail closed)`);
        return 1;
    }
    const manifestPath = join(packDir, MANIFEST_NAME);
    if (!existsSync(manifestPath)) {
        write(`dz verify-pack: ${packDir} carries no ${MANIFEST_NAME}`);
        return 1;
    }
    let signed = null;
    try {
        signed = JSON.parse(readFileSync(manifestPath, 'utf8'));
    }
    catch {
        write(`dz verify-pack: ${MANIFEST_NAME} is not valid JSON`);
        return 1;
    }
    // The verifier sweeps the directory it was handed. A caller-supplied shipment list could omit an
    // unsigned file and turn the bidirectional check off, so verification has no narrowing option.
    // Release/publish verifies an extracted tarball separately; `verify-pack` verifies this exact tree.
    const res = verifyManifest(packDir, signed, readFileSync(pubPath, 'utf8'));
    if (res.ok) {
        write(`dz verify-pack: OK — ${packDir} matches its signed manifest`);
        return 0;
    }
    write(`dz verify-pack: FAILED — ${packDir}`);
    for (const f of res.failures)
        write(`  ${f.path}: ${f.reason}`);
    return 1;
}
/**
 * `dz sbom` — emit a CycloneDX 1.5 SBOM (Software Bill of Materials) for a pack, standalone (no signing).
 * The same inventory `dz sign` writes as `sbom.json`, available on its own for audit/procurement. Components
 * are the pack's shipped files with their SHA-256 — a file-level bill of materials for the pack.
 *   --pack <dir>   the pack to inventory (required)
 *   --out <file>   write here (default: print to stdout)
 *   --json         (implied) SPDX/CycloneDX is already JSON
 */
function cmdSbom(options, flags, cwd, write) {
    const pack = options.get('pack');
    if (!pack) {
        write('dz sbom: --pack <dir> is required');
        return 1;
    }
    const packDir = resolve(cwd, pack);
    if (!existsSync(packDir)) {
        write(`dz sbom: no such pack: ${packDir}`);
        return 1;
    }
    const files = packFiles(packDir);
    if (files.length === 0) {
        write('dz sbom: the pack contains no files');
        return 1;
    }
    const manifest = buildManifest(packDir, basename(packDir), files);
    const sbom = buildSbom(manifest);
    const out = JSON.stringify(sbom, null, 2);
    const outOpt = options.get('out');
    if (outOpt !== undefined) {
        const outPath = resolve(cwd, outOpt);
        try {
            writeFileSync(outPath, out + '\n');
        }
        catch (err) {
            write(`dz sbom: could not write ${outPath}: ${err.message}`);
            return 1;
        }
        write(`dz sbom: ${sbom.components.length} component(s) → ${outPath} (CycloneDX ${sbom.specVersion})`);
        return 0;
    }
    write(out);
    return 0;
}
function cmdPublish(options, flags, cwd, write) {
    // Reject unknown flags/options so a typo (e.g. `--dry-rum`) can NEVER be
    // silently swallowed and flip the command into live-publish mode.
    const allowedFlags = new Set(['dry-run', 'no-dry-run', 'yes', 'confirm', 'bump-only', 'help', 'require-signing', 'provenance', 'no-provenance']);
    const allowedOptions = new Set(['filter', 'claim-check', 'no-guard', 'sign-key']);
    const allowedHelp = '  allowed: --dry-run (default), --yes/--confirm/--no-dry-run (go live), --bump-only, --filter <substr>, --claim-check <off|warn|error>, --no-guard "<reason>" (skip the guard pre-flight; logged)';
    for (const flag of flags) {
        if (!allowedFlags.has(flag)) {
            write(`dz publish: unknown option --${flag}`);
            write(allowedHelp);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            continue;
        if (!allowedOptions.has(key)) {
            write(`dz publish: unknown option --${key}`);
            write(allowedHelp);
            return 1;
        }
    }
    // dz guard pre-flight (ADR-002 option A): publish is the most dangerous, least-reversible self-mutation, so
    // it ALWAYS runs the declarative guard first. A HARD violation refuses the publish; `--no-guard "<reason>"`
    // is the logged escape hatch (the override lands in .dz/guard-audit.jsonl — visible, never silent).
    {
        let guardRoot = cwd;
        try {
            guardRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
        }
        catch { /* not git */ }
        const noGuard = options.get('no-guard');
        if (noGuard !== undefined && noGuard.trim() === '') {
            write('dz publish: --no-guard requires a reason (it is logged): --no-guard "hotfix, guard re-run after"');
            return 1;
        }
        const guardResult = runGuardEvaluation(guardRoot, 'publish', undefined, noGuard);
        if (guardResult.verdict === 'block' && noGuard === undefined) {
            write('dz publish: ✗ BLOCKED by dz guard (HARD invariant violated):');
            for (const v of guardResult.violations.filter((x) => x.severity === 'hard'))
                write(`  [BLOCK] ${v.rule}: ${v.detail}`);
            write('  → fix the violation(s), or override with --no-guard "<reason>" (logged to .dz/guard-audit.jsonl).');
            return 1;
        }
        if (guardResult.verdict === 'block')
            write(`dz publish: ⚠ guard BLOCK overridden via --no-guard: ${noGuard} (logged)`);
        else if (guardResult.verdict === 'warn')
            for (const v of guardResult.violations)
                write(`dz publish: ⚠ guard warn — ${v.rule}: ${v.detail}`);
        else
            write('dz publish: ✓ guard pre-flight passed');
        for (const observation of guardResult.observations ?? []) {
            write(`dz publish: ℹ guard observation — ${observation.rule} ${observation.scope}: ${observation.detail} [${observation.status}]`);
        }
        for (const n of guardResult.notes ?? [])
            write(`dz publish: ℹ guard note — ${n}`); // FN-7: on the record, never blocking
    }
    // ADR-001 (publish-provenance): decide BEFORE any work — flag validation, then a pre-flight that
    // refuses `--provenance` where no OIDC token can be minted. `off` is an escape hatch that names itself.
    if (flags.has('provenance') && flags.has('no-provenance')) {
        write('dz publish: --provenance and --no-provenance are mutually exclusive');
        return 1;
    }
    const provenance = flags.has('provenance') ? 'on' : flags.has('no-provenance') ? 'off' : 'auto';
    try {
        write(`dz publish: ${decideProvenance(provenance, process.env).reason}`);
    }
    catch (err) {
        write(err.message);
        return 1;
    }
    // Pre-publish claim-check gate strictness: reject (never coerce) an invalid value. Default 'warn'
    // per ADR-001 — findings are SURFACED on every publish, but 'warn' never changes publish status,
    // so the success path is unchanged. 'off' disables the gate; 'error' fails an offending package.
    const claimCheckRaw = options.get('claim-check');
    if (claimCheckRaw !== undefined && !['off', 'warn', 'error'].includes(claimCheckRaw)) {
        write(`dz publish: invalid --claim-check '${claimCheckRaw}' (expected off|warn|error)`);
        return 1;
    }
    const claimCheckOpt = claimCheckRaw ?? 'warn';
    const bumpOnly = flags.has('bump-only');
    const filterStr = options.get('filter');
    // SAFETY: trim + drop empty segments (mirrors --select at the top of cmdInit).
    // Without this, `--filter ""` (e.g. an unset shell var) or a stray comma yields
    // [''] / ['', 'core'], and publishPackages matches with name.includes(''), which
    // is true for EVERY package — silently turning a scoped publish into a
    // whole-monorepo publish. An empty resulting list is an explicit error, never
    // "match all".
    let filter;
    if (filterStr !== undefined) {
        filter = filterStr.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        if (filter.length === 0) {
            write('dz publish: --filter requires a non-empty comma-separated list of package-name substrings');
            return 1;
        }
    }
    // SAFETY: dry-run is the DEFAULT. A real publish requires an EXPLICIT opt-in
    // via --yes, --confirm, or --no-dry-run. Without one, we never bump or publish.
    const wantsLive = flags.has('yes') || flags.has('confirm') || flags.has('no-dry-run');
    const dryRun = !wantsLive;
    if (!dryRun) {
        // Loud confirmation banner listing exactly what is about to be published.
        const targets = discoverPackages(cwd).filter((p) => filter === undefined || filter.length === 0
            ? true
            : filter.some((f) => p.name.includes(f) || p.dir.includes(f)));
        write(`\n╔══════════════════════════════════════════════════════════════════════╗`);
        write(`║  ⚠  LIVE PUBLISH — this will bump versions and run \`pnpm publish\`      ║`);
        write(`╠══════════════════════════════════════════════════════════════════════╣`);
        if (targets.length === 0) {
            write(`║  (no packages match the current filter — nothing to publish)          ║`);
        }
        else {
            write(`║  ${String(targets.length).padStart(3)} package(s) will be published to npm:${' '.repeat(33 - String(targets.length).length)}║`);
            for (const p of targets) {
                const next = `${p.version.split('.').slice(0, 2).join('.')}.${parseInt(p.version.split('.')[2] ?? '0', 10) + 1}`;
                const line = `${p.name}  ${p.version} → ${next}`;
                write(`║    • ${line.padEnd(64)}║`);
            }
        }
        write(`╚══════════════════════════════════════════════════════════════════════╝`);
    }
    // FR-4 — the signature gate, BEFORE anything is published (ADR-001).
    // Strictness follows the trust root: with no keys/dz.pub committed there is nothing to verify
    // against, and blocking would refuse every release forever. That is stated on every run.
    {
        const trustRoot = resolve(cwd, TRUST_ROOT_REL);
        const trustRootPresent = existsSync(trustRoot);
        const requireSigning = flags.has('require-signing');
        // `filter` is a string[] of substrings (matching publishPackages' own semantics), not a string.
        const targets = discoverPackages(cwd).filter((pk) => !filter || filter.length === 0 || filter.some((f) => pk.name.includes(f)));
        let blocked = 0;
        for (const pk of targets) {
            const manifestPath = join(pk.dir, MANIFEST_NAME);
            const manifestPresent = existsSync(manifestPath);
            let verifyOk = false;
            let artifactUnavailable = false;
            if (trustRootPresent && manifestPresent) {
                // Verify the ARTIFACT, through the SAME extraction `dz sign` uses. This used to walk the
                // source TREE narrowed to a shipped-path list — a different object by construction, because
                // npm synthesises a LICENSE into the pack of a package whose tree has none and pnpm rewrites
                // package.json at pack time. So the gate named two failures that were both true about the
                // tree and both wrong about what ships, for EVERY package, and a fail-closed gate no input
                // can satisfy is a gate that gets routed around — it was: the 0.7.0 release went out through
                // `pnpm publish` and skipped re-signing (ADR-001, features/publish-gate-verifies-the-tarball).
                let cleanupGate = null;
                try {
                    const signed = JSON.parse(readFileSync(manifestPath, 'utf8'));
                    let extracted;
                    try {
                        extracted = extractPublishTarball(pk.dir);
                        cleanupGate = extracted.cleanup;
                    }
                    catch (err) {
                        // Cross-family review (codex `gpt-5.6-sol`, 2026-08-22): falling back to the working
                        // TREE here fails the gate OPEN. The gate's whole claim is "what ships matches the
                        // signature"; with no artifact, nothing was compared, and reporting a pass would be a
                        // claim about an object that was never built. Say why, and block.
                        write(`dz publish: could not pack ${pk.name} (${err.message.split('\n')[0]}) — the artifact was never built, so its signature was not checked`);
                        artifactUnavailable = true;
                    }
                    verifyOk =
                        extracted !== undefined &&
                            verifyManifest(extracted.dir, signed, readFileSync(trustRoot, 'utf8')).ok;
                }
                catch {
                    verifyOk = false;
                }
                finally {
                    cleanupGate?.();
                }
            }
            const decision = decidePublishGate({ trustRootPresent, manifestPresent, verifyOk, requireSigning, artifactUnavailable });
            if (decision.action === 'block') {
                write(`dz publish: BLOCKED ${pk.name} — ${decision.reason}`);
                blocked++;
            }
            else if (decision.action === 'publish-unsigned') {
                write(`dz publish: ${pk.name} — ${decision.reason}`);
            }
        }
        if (blocked > 0) {
            write(`dz publish: refusing to publish (${blocked} package(s) failed the signature gate)`);
            return 1;
        }
    }
    // A signed pack must be RE-SIGNED after publish's own bump and README sync (feature
    // `sign-after-bump`): publish mutates the pack, so any earlier signature describes files that no
    // longer exist. Default to the same path `dz sign --init` writes, so the ordinary operator needs no
    // new flag; `--sign-key` overrides it.
    const signKey = (options.get('sign-key') ?? join(homedir(), '.dz', 'keys', 'dz.key')).trim();
    const report = publishPackages(cwd, {
        provenance,
        dryRun,
        filter,
        bumpOnly,
        claimGate: claimCheckOpt,
        signKey: signKey === '' ? undefined : resolve(cwd, signKey),
        verifyAfterSign: (packDir) => {
            // Verify the OUTCOME against the trust root a CONSUMER would use — an existing key may be the
            // WRONG key, and enumerating that state is a losing game (round-1 review). The pack NAME travels
            // with the verdict so a pass about a different artifact cannot be mistaken for this one.
            // The identity must be the one the PUBLISHER uses — the npm package name — or the check
            // compares two vocabularies and can never agree. It did: `basename(packDir)` is `memory`
            // where the publisher says `@dzhechkov/memory`, so every scoped package (all of them here)
            // was refused as "a pass about another artifact", and the release routed around the gate
            // instead. MEASURED 2026-08-22 by running `dz publish --filter memory --yes`.
            const trustRoot = resolve(cwd, TRUST_ROOT_REL);
            const identity = packNpmName(packDir);
            const id = identity === undefined ? {} : { pack: identity };
            if (!existsSync(trustRoot))
                return { ok: false, trustRootPresent: false, ...id };
            // Verify the SAME OBJECT `reSign` hashed: the extracted tarball. Walking the source tree here
            // compares a manifest built from the artifact against files npm rewrites at pack time, so it
            // reported "does not verify — most likely the WRONG signing key" about a correctly signed pack
            // (MEASURED 2026-08-22, `dz publish --filter memory --yes`). That message sends the operator
            // hunting for a key problem that does not exist; the object was simply the wrong one.
            let cleanup = null;
            try {
                const signed = JSON.parse(readFileSync(join(packDir, MANIFEST_NAME), 'utf8'));
                const extracted = extractPublishTarball(packDir);
                cleanup = extracted.cleanup;
                const res = verifyManifest(extracted.dir, signed, readFileSync(trustRoot, 'utf8'));
                return { ok: res.ok, trustRootPresent: true, ...id };
            }
            catch {
                return { ok: false, trustRootPresent: true, ...id };
            }
            finally {
                cleanup?.();
            }
        },
        reSign: (packDir, keyPath) => {
            // The same three steps `dz sign` performs, including the SBOM — a manifest refreshed without
            // its SBOM would leave the two describing different trees.
            //
            // Path A: the manifest must cover what the CONSUMER receives, not what the author has on disk.
            // MEASURED 2026-08-21 by a live install of the published 0.6.1 — with the trust root restored,
            // six packs reported TAMPERED, and only half of that was the version bump. The rest was
            // `CHANGELOG.md: listed in the manifest but absent`: signed on disk, excluded by `files[]`,
            // therefore missing for every recipient forever. So the file list comes from `npm pack`, which
            // is the authority on what ships — we do not reimplement its globbing.
            // Hash the EXTRACTED TARBALL, not the working tree. `pnpm publish` re-serialises package.json and
            // rewrites `workspace:*`, so a hash taken from disk is stale before the tarball exists — MEASURED
            // 2026-08-21: the published `skills-news` package.json is 1050 bytes where the tree's is 1051,
            // and that one missing newline is what made six freshly re-signed packs report TAMPERED.
            const { dir: shippedDir, cleanup } = extractPublishTarball(packDir);
            try {
                const onDisk = packFiles(shippedDir);
                const packed = packFiles(shippedDir);
                const setDecision = decideSignableSet({ signable: onDisk, packed });
                write(signableSetLine(basename(packDir), setDecision));
                if (setDecision.publishedButUnsigned.length > 0) {
                    // A shipped file no signature covers is WORSE than an unsigned pack: the badge says verified
                    // while part of the payload is unchecked. Refuse rather than sign a partial claim.
                    throw new Error(`refusing to sign a pack with ${setDecision.publishedButUnsigned.length} SHIPPED BUT UNSIGNED file(s): ${setDecision.publishedButUnsigned.slice(0, 5).join(', ')}`);
                }
                const files = [...setDecision.sign];
                if (files.length === 0)
                    throw new Error(`refusing to sign an empty pack: ${packDir}`);
                // Hashes come from the extracted tarball; the manifest is WRITTEN to the source dir so the next
                // pack carries it. The re-pack normalises package.json identically (deterministic — MEASURED by
                // packing twice and comparing hashes), so the entries still describe what ships.
                const manifest = buildManifest(shippedDir, basename(packDir), files);
                const signed = signManifest(manifest, readFileSync(keyPath, 'utf-8'));
                writeFileSync(join(packDir, MANIFEST_NAME), `${JSON.stringify(signed, null, 2)}\n`);
                writeFileSync(join(packDir, SBOM_NAME), `${JSON.stringify(buildSbom(manifest), null, 2)}\n`);
            }
            finally {
                cleanup();
            }
        },
    });
    write(`\ndz publish${dryRun ? ' --dry-run' : ''}${bumpOnly ? ' --bump-only' : ''}${claimCheckOpt !== 'warn' ? ` --claim-check ${claimCheckOpt}` : ''}`);
    write(`  Published: ${report.published}  Skipped: ${report.skipped}  Errors: ${report.errors}\n`);
    for (const pkg of report.packages) {
        const icon = pkg.status === 'published' ? '✓' : pkg.status === 'skipped' ? '○' : '✗';
        // A one-line preview inline; on error the FULL captured npm error prints below (truncating a publish
        // failure to 60 chars is how a release stays undiagnosable — the reason lives past char 60).
        const detail = pkg.error && pkg.status !== 'error' ? ` (${pkg.error.slice(0, 60)})` : '';
        write(`  ${icon} ${pkg.name.padEnd(35)} ${pkg.oldVersion} → ${pkg.newVersion}  ${pkg.status}${detail}`);
        if (pkg.status === 'error' && pkg.error) {
            for (const line of pkg.error.split('\n'))
                write(`      ${line}`);
        }
        // Surface warn-mode findings that did not block the publish.
        if (pkg.claimCheck && pkg.claimCheck.findings > 0 && pkg.status !== 'error') {
            write(`      ⚠ claim-check: ${pkg.claimCheck.findings} finding(s) (${pkg.claimCheck.high} high) in README.md`);
        }
    }
    return report.errors > 0 ? 1 : 0;
}
/* ------------------------------------------------------------------ */
/*  dz parity — the honest feature×target map (target-parity-matrix,   */
/*  ADR-001): computed from the declarative model, never hand-written  */
/* ------------------------------------------------------------------ */
function cmdParity(options, flags, write, writeErr) {
    const json = flags.has('json');
    if (flags.has('help')) {
        write('dz parity [--target <name>] [--json] — the computed feature×target map (never hand-written)');
        write(`  targets: ${TARGET_NAMES.join(', ')}`);
        return 0;
    }
    const allowedFlags = new Set(['json', 'help']);
    const allowedOptions = new Set(['target']);
    // A stray positional is a typo'd invocation, not something to silently ignore (Codex QE gap 7).
    if (options.has('_positional_0')) {
        write(json ? JSON.stringify({ error: `unexpected argument "${options.get('_positional_0')}"`, exitCode: 1 }) : `dz parity: unexpected argument "${options.get('_positional_0')}"\n  allowed: --target <name>, --json`);
        return 1;
    }
    for (const flag of flags) {
        if (!allowedFlags.has(flag)) {
            write(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : `dz parity: unknown option --${flag}\n  allowed: --target <name>, --json`);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            continue;
        if (!allowedOptions.has(key)) {
            write(json ? JSON.stringify({ error: `unknown option --${key}`, exitCode: 1 }) : `dz parity: unknown option --${key}\n  allowed: --target <name>, --json`);
            return 1;
        }
    }
    const matrix = buildParityMatrix();
    // EVIDENCE staleness, folded into the report (fix round 2, R2-3). Derived from the records
    // themselves — no `codex --version`, no subprocess, so `dz parity` stays a deterministic function
    // of the model. A cell whose deciding form rests on a transcript that is older than the newest
    // recording for the SAME target is reported `inconclusive`, never `full`: the round-1 gate could
    // already tell, and nothing a user runs was asking it.
    const staleEvidence = findStaleTranscriptEvidence();
    const staleByTarget = new Map();
    for (const s of staleEvidence)
        staleByTarget.set(s.target, [...(staleByTarget.get(s.target) ?? []), s.capability]);
    const reportCell = (feature, t, cell) => downgradeForStaleEvidence(feature, cell, staleByTarget.get(t) ?? []);
    const staleNote = (t) => staleEvidence
        .filter((s) => s.target === t)
        .map((s) => `  ⚠ ${s.capability}: evidence recorded on ${s.recordedVersion ?? '(no runtime version recorded)'}, newest recording for this target is ${s.probedVersion ?? '(none)'} — INCONCLUSIVE until re-probed (${s.evidence ?? ''})`);
    // Site 8 of the D3 rewiring, closed in fix round 1 (QE F1). It shipped spelling its
    // own bare guard `TARGET_NAMES.includes(...)` and was therefore invisible to the AM-2
    // grep-guard, which searched for the token `isTargetName(` — a PRESENCE check on one
    // spelling where the property was "no call site bypasses the resolver". The guard in
    // `test/target-alias-cli.test.ts` now checks the class, and the sweep list is derived
    // from the help text so a ninth command cannot be missed the same way.
    const targetOpt = options.get('target');
    let target;
    if (targetOpt !== undefined) {
        const parityResolution = resolveTargetName(targetOpt);
        if (parityResolution.kind === 'unknown') {
            // Both forms go to stderr: an error is not data, and `dz parity --json | jq`
            // must not be fed a diagnostic (ADR-002 §Decision 2 / driver D6).
            if (json) {
                writeErr(JSON.stringify({ error: `unknown target ${JSON.stringify(targetOpt)}`, suggestion: parityResolution.suggestion, targets: TARGET_NAMES_SORTED, exitCode: 1 }, null, 2));
            }
            else {
                for (const line of formatTargetProblem('dz parity', parityResolution))
                    writeErr(line);
            }
            return 1;
        }
        target = parityResolution.target;
        if (parityResolution.via === 'alias')
            writeErr(formatTargetAliasNote('dz parity', targetOpt, target));
    }
    if (json) {
        const shown = target !== undefined ? [target] : TARGET_NAMES;
        const rows = matrix.map((r) => {
            const cells = {};
            for (const t of shown)
                cells[t] = reportCell(r.feature, t, r.cells[t]);
            return { id: r.feature.id, title: r.feature.title, cells };
        });
        // A filtered response stays internally consistent: capabilities are filtered too (Codex QE gap 9).
        const caps = target !== undefined ? { [target]: TARGET_CAPABILITIES[target] } : TARGET_CAPABILITIES;
        write(JSON.stringify({
            targets: shown,
            capabilities: caps,
            // The evidence axis travels WITH the matrix: a consumer that reads `level` must be able to
            // read why a cell is inconclusive without a second command.
            staleEvidence: staleEvidence.filter((sv) => shown.includes(sv.target)),
            features: rows,
        }, null, 2));
        return 0;
    }
    if (target !== undefined) {
        const t = target;
        write(`\ndz parity — ${t}  (capabilities: ${TARGET_CAPABILITIES[t].join(', ')})\n`);
        for (const r of matrix) {
            const c = reportCell(r.feature, t, r.cells[t]);
            const icon = c.level === 'full' ? '✓' : c.level === 'manual' ? '◐' : c.level === 'inconclusive' ? '?' : '—';
            const detail = c.level === 'none'
                ? 'not available on this target'
                : c.level === 'inconclusive'
                    ? `via ${c.via ?? ''} — INCONCLUSIVE: stale evidence for ${(c.staleEvidence ?? []).join(', ')}`
                    : `via ${c.via ?? ''}`;
            write(`  ${icon} ${r.feature.title.padEnd(58)} ${detail}`);
        }
        write('\n  ✓ full (the complete experience)   ◐ manual (works, you drive it by hand)   ? evidence stale (re-probe)   — not available');
        for (const line of staleNote(t))
            write(line);
        return 0;
    }
    // Grid: one column per target, short header, one row per feature. Computed, never hand-written;
    // the labels live NEXT TO the model (a local map here would be a second, unchecked registry).
    const short = TARGET_SHORT_LABELS;
    write('\ndz parity — feature × target (computed from the model; dz parity --target <name> for detail)\n');
    write(`  ${'feature'.padEnd(52)} ${TARGET_NAMES.map((t) => (short[t] ?? t).padStart(4)).join('')}`);
    for (const r of matrix) {
        const cells = TARGET_NAMES.map((t) => {
            const c = reportCell(r.feature, t, r.cells[t]);
            return (c.level === 'full' ? '✓' : c.level === 'manual' ? '◐' : c.level === 'inconclusive' ? '?' : '—').padStart(4);
        }).join('');
        write(`  ${r.feature.title.slice(0, 52).padEnd(52)} ${cells}`);
    }
    write('\n  ✓ full   ◐ manual (available, driven by hand)   — not available');
    write(`  columns: ${TARGET_NAMES.map((t) => `${short[t] ?? t}=${t}`).join('  ')}`);
    return 0;
}
/* ------------------------------------------------------------------ */
/*  dz release — verified-release conveyor (feature release-verified,  */
/*  ADR-001): 4 HARD gates in FRONT of the untouched dz publish.       */
/* ------------------------------------------------------------------ */
/**
 * The single executor of the pure engine's {@link GateStep} plan. ALL subprocess side effects
 * of the release live here (engine purity, NFR-1). Contract highlights:
 *
 * - ALL four gates execute even after an earlier gate fails (AM-9/FR-6 — no fail-fast hiding);
 *   one red gate still reddens the release.
 * - Smoke steps run in a THROWAWAY cwd (AM-4): skills bins are installers that mutate
 *   `.claude/` on default action.
 * - gh issue + git tag are best-effort periphery: loud on failure, NEVER verdict- or
 *   exit-code-affecting (FR-7/FR-8, AM-6).
 * - On green it never injects `--yes/--confirm/--no-dry-run` into the printed/chained publish
 *   (AM-5): live publish stays the operator's explicit act, and `--publish` chains into
 *   publish's own default (dry-run) protocol with ALL its gates untouched.
 */
function cmdRelease(options, flags, cwd, write, runner) {
    const json = flags.has('json');
    const warnings = [];
    const say = (line) => {
        if (!json)
            write(line);
    };
    const loud = (line) => {
        warnings.push(line);
        if (!json)
            write(line);
    };
    const emitJson = (obj) => {
        if (json)
            write(JSON.stringify({ ...obj, warnings }, null, 2));
    };
    // G9 reuse-never-copy: the engine's firstOutputLine, not a byte-parallel local copy.
    const oneLine = firstOutputLine;
    // Strict allowlist (cmdPublish's typo-rejection pattern) — a mistyped flag is NEVER
    // swallowed, and the rejection honors the --json contract too (AC-7).
    // `--verified` is accepted but not read: verified is the DEFAULT and only mode of
    // `dz release` in this slice — the flag exists so the branded invocation is not a typo error.
    const allowedFlags = new Set(['verified', 'tag', 'publish', 'json', 'dry-run', 'no-issue', 'affected', 'audit-dev', 'help']);
    const allowedOptions = new Set(['filter']);
    const allowedHelp = '  allowed: --verified, --filter <substr>, --affected, --audit-dev, --tag, --publish, --json, --dry-run, --no-issue';
    const rejectUnknown = (key) => {
        if (json)
            write(JSON.stringify({ error: `unknown option --${key}`, allowed: allowedHelp.trim(), publishAction: 'blocked', exitCode: 1 }, null, 2));
        else {
            write(`dz release: unknown option --${key}`);
            write(allowedHelp);
        }
        return 1;
    };
    for (const flag of flags)
        if (!allowedFlags.has(flag))
            return rejectUnknown(flag);
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            continue;
        if (!allowedOptions.has(key))
            return rejectUnknown(key);
    }
    // --filter mirrors publish semantics: trim + drop empties; empty result is an ERROR,
    // never "match all" (the publish P0 regression this deliberately copies).
    const filterStr = options.get('filter');
    let filter;
    if (filterStr !== undefined) {
        filter = filterStr.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
        if (filter.length === 0) {
            if (json)
                write(JSON.stringify({ error: '--filter requires a non-empty comma-separated list of package-name substrings', publishAction: 'blocked', exitCode: 1 }, null, 2));
            else
                write('dz release: --filter requires a non-empty comma-separated list of package-name substrings');
            return 1;
        }
    }
    // DETECT — real facts via the engine's one fs seam (discoverPackages underneath).
    let factsList;
    try {
        factsList = collectPackageFacts(cwd, filter);
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (json)
            write(JSON.stringify({ error: msg, publishAction: 'blocked', exitCode: 1 }, null, 2));
        else
            write(`dz release: ${msg}`);
        return 1;
    }
    if (factsList.length === 0) {
        // C-6: outside a workspace (or an over-narrow filter) — explain and exit non-zero, never throw.
        const msg = 'no publishable packages found under packages/@dzhechkov — run from the monorepo root (or widen --filter)';
        if (json)
            write(JSON.stringify({ error: msg, packages: [], publishAction: 'blocked', exitCode: 1 }, null, 2));
        else
            write(`dz release: ${msg}`);
        return 1;
    }
    // Executor: default = real execSync with piped stdio + timeout; injectable for tests.
    // Defined BEFORE planning because --affected needs read-only git diffs at DETECT time.
    const run = runner ??
        ((cmd, opts) => {
            try {
                const stdout = execSync(cmd, { cwd: opts.cwd, stdio: 'pipe', encoding: 'utf-8', timeout: opts.timeoutMs });
                return { exitCode: 0, stdout: stdout == null ? '' : String(stdout), stderr: '' };
            }
            catch (err) {
                const e = err;
                // execSync's timeout kills via signal and leaves status null — that IS the timeout shape.
                const timedOut = (e.status === null || e.status === undefined) && (e.signal != null || e.killed === true);
                return {
                    exitCode: typeof e.status === 'number' ? e.status : 1,
                    stdout: e.stdout == null ? '' : String(e.stdout),
                    stderr: e.stderr == null || String(e.stderr).trim() === '' ? formatPublishError(e) : String(e.stderr),
                    timedOut,
                };
            }
        });
    // AM-8/--affected: narrow the release set to packages touched by the working tree + last
    // commit. Selection is the PURE selectAffectedPackages; the two read-only git diffs are the
    // injected fact source. Any git failure ⇒ null ⇒ FAIL-OPEN to the full set (never zero).
    if (flags.has('affected')) {
        const dWork = run('git diff --name-only HEAD', { cwd, timeoutMs: 10_000 });
        const dLast = run('git diff --name-only HEAD~1..HEAD', { cwd, timeoutMs: 10_000 });
        const anyOk = dWork.exitCode === 0 || dLast.exitCode === 0;
        const changed = anyOk
            ? [dWork, dLast]
                .filter((r) => r.exitCode === 0)
                .flatMap((r) => r.stdout.split('\n'))
                .map((s) => s.trim())
                .filter((s) => s.length > 0)
            : null;
        const selected = selectAffectedPackages(changed, factsList);
        if (changed === null)
            loud('dz release --affected: ⚠ git diff unavailable — FAIL-OPEN to the full package set');
        else
            say(`dz release --affected: ${selected.length}/${factsList.length} package(s) selected from ${changed.length} changed file(s)${selected.length === factsList.length ? ' (no narrowing — full set)' : ''}`);
        factsList = selected;
    }
    const plan = planReleaseGates(factsList, {
        monorepoRoot: cwd,
        pnpmLockPresent: existsSync(join(cwd, 'pnpm-lock.yaml')),
        includeDevDeps: flags.has('audit-dev'),
    });
    // --dry-run: print the full plan, execute NOTHING (deterministic, byte-testable preview).
    if (flags.has('dry-run')) {
        if (json) {
            write(JSON.stringify({ dryRun: true, packages: plan.packages, steps: plan.steps, skips: plan.skips, warnings }, null, 2));
            return 0;
        }
        write(`\ndz release --dry-run — plan only, zero commands executed (${plan.packages.length} package(s))`);
        for (const gate of ['tests', 'audit', 'syntax', 'smoke']) {
            const steps = plan.steps.filter((s) => s.gate === gate);
            write(`  ${gate} (${steps.length} step(s)):`);
            for (const s of steps) {
                if (s.kind === 'synthetic-fail')
                    write(`    ✗ [planned ${s.failClass ?? 'FAIL'}] ${s.pkg ?? ''}: ${s.reason}`);
                else
                    write(`    · ${s.cmd}  (cwd=${s.tempCwd === true ? '<temp>' : s.cwd}, timeout=${s.timeoutMs}ms)`);
            }
            if (gate === 'tests')
                for (const sk of plan.skips)
                    write(`    ○ [${sk.class}] ${sk.pkg}: ${sk.reason}`);
        }
        write('  → run without --dry-run to execute the gates');
        return 0;
    }
    // VERIFY — execute EVERY exec step (AM-9: all 4 gates run and report even after a failure).
    const executions = [];
    let smokeTmp;
    const execSteps = plan.steps.filter((s) => s.kind !== 'synthetic-fail');
    say(`\ndz release — executing ${execSteps.length} gate step(s) across ${plan.packages.length} package(s)…`);
    for (const step of execSteps) {
        let stepCwd = step.cwd;
        if (step.tempCwd === true) {
            // AM-4: boot bins in a throwaway cwd so an installer-style bin cannot mutate the workspace.
            if (smokeTmp === undefined)
                smokeTmp = mkdtempSync(join(tmpdir(), 'dz-release-smoke-'));
            stepCwd = smokeTmp;
        }
        const started = Date.now();
        const r = run(step.cmd, { cwd: stepCwd, timeoutMs: step.timeoutMs });
        executions.push({
            stepId: step.id,
            exitCode: r.exitCode,
            stdout: r.stdout,
            stderr: r.stderr,
            durationMs: Date.now() - started,
            timedOut: r.timedOut,
        });
    }
    if (smokeTmp !== undefined) {
        try {
            rmSync(smokeTmp, { recursive: true, force: true });
        }
        catch { /* best-effort cleanup */ }
    }
    const verdict = classifyGateExecutions(plan, executions);
    // Report: per-gate ✓/✗/○ with package granularity + timestamp (NFR-5). Skips are named,
    // never folded into pass wording (AM-2: "N passed, M skipped", not "all tests passed").
    for (const g of verdict.gates) {
        const icon = g.status === 'pass' ? '✓' : g.status === 'fail' ? '✗' : '○';
        say(`  ${icon} ${g.gate.padEnd(7)} ${g.status.toUpperCase().padEnd(4)}  ${g.passed} passed, ${g.failures.length} failed, ${g.skips.length} skipped`);
        for (const f of g.failures)
            say(`      [${f.class}] ${f.pkg !== undefined ? `${f.pkg}: ` : ''}${f.reason}`);
        for (const sk of g.skips)
            say(`      [${sk.class}] ${sk.pkg}: ${sk.reason}`);
    }
    say(`  verdict at ${verdict.timestamp}: ${verdict.publishAction === 'proceed' ? '✓ all gates green' : '✗ RELEASE BLOCKED'}`);
    const invocation = `dz release${filterStr !== undefined ? ` --filter ${filterStr}` : ''}`;
    const shq = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
    if (verdict.publishAction === 'blocked') {
        say(`dz release: ✗ release STOPPED — ${verdict.blockedBy.join('; ')}`);
        // FR-7 / AM-6: best-effort issue — a courier, never a judge. Loud on any failure;
        // the verdict and exit code are ALREADY decided and cannot change here.
        let issueUrl;
        if (!flags.has('no-issue')) {
            const issue = buildFailureIssue(verdict, { invocation });
            const probe = run('command -v gh', { cwd, timeoutMs: 10_000 });
            if (probe.exitCode !== 0) {
                loud(`dz release: ⚠ gh unavailable — file the issue manually: ${issue.title}`);
            }
            else {
                const res = run(`gh issue create --title ${shq(issue.title)} --body ${shq(issue.body)}`, { cwd, timeoutMs: 30_000 });
                if (res.exitCode === 0) {
                    issueUrl = oneLine(res.stdout) || undefined;
                    say(`dz release: gh issue created${issueUrl !== undefined ? `: ${issueUrl}` : ''}`);
                }
                else {
                    loud(`dz release: ⚠ gh issue creation failed (${oneLine(res.stderr, res.stdout) || 'unknown error'}) — file the issue manually: ${issue.title}`);
                }
            }
        }
        emitJson({
            gates: verdict.gates,
            ok: verdict.ok,
            blockedBy: verdict.blockedBy,
            skipped: verdict.skipped,
            publishAction: verdict.publishAction,
            timestamp: verdict.timestamp,
            ...(issueUrl !== undefined ? { issueUrl } : {}),
            exitCode: 1,
        });
        return 1;
    }
    // Success path. FR-8: --tag is best-effort trimming — loud on failure, never gate-affecting.
    let tagName;
    if (flags.has('tag')) {
        const sha = run('git rev-parse --short HEAD', { cwd, timeoutMs: 10_000 });
        const log = run('git log --oneline -n 15 --no-decorate', { cwd, timeoutMs: 10_000 });
        const notes = buildReleaseNotes(log.exitCode === 0 ? log.stdout.split('\n') : []);
        tagName = releaseTagName(new Date(), sha.exitCode === 0 ? sha.stdout.trim() : '');
        const tag = run(`git tag -a ${tagName} -m ${shq(notes)}`, { cwd, timeoutMs: 10_000 });
        if (tag.exitCode === 0) {
            say(`dz release: tagged ${tagName} (annotated with short release notes from recent commits)`);
            say('dz release: note — the tag attests a VERIFIED tree, not a completed publish');
        }
        else {
            loud(`dz release: ⚠ git tag failed (${oneLine(tag.stderr, tag.stdout) || 'unknown error'}) — non-blocking; tag manually: git tag -a ${tagName}`);
        }
    }
    // FR-10 / AC-8: re-sign reminder BEFORE the handoff — publish's signature gate is
    // refuse-unsigned, and gates 3–4 often follow a rebuild.
    say('dz release: reminder — re-sign any rebuilt packs BEFORE publishing (dz sign --pack <dir> --key <path-outside-repo>); the publish signature gate is refuse-unsigned');
    // FR-9 / AM-5: the handoff NEVER injects --yes/--confirm/--no-dry-run — live publish stays
    // the operator's explicit, loud-bannered act inside dz publish itself.
    const publishCommand = `dz publish${filterStr !== undefined ? ` --filter ${filterStr}` : ''}`;
    let publishExit;
    let publishOutput;
    if (flags.has('publish')) {
        say(`dz release: ✓ gates green — chaining into ${publishCommand} in-process (ALL publish gates + its dry-run-by-default protocol run untouched)`);
        const pubOptions = new Map(filterStr !== undefined ? [['filter', filterStr]] : []);
        // --json contract: the chained publish must NOT print prose before the JSON envelope —
        // capture its lines and carry them INSIDE the envelope instead (stdout stays one JSON doc).
        if (json) {
            publishOutput = [];
            const captured = publishOutput;
            publishExit = cmdPublish(pubOptions, new Set(), cwd, (line) => {
                captured.push(line);
            });
        }
        else {
            publishExit = cmdPublish(pubOptions, new Set(), cwd, write);
        }
    }
    else {
        say(`dz release: ✓ all gates green — publish when ready: ${publishCommand}`);
    }
    emitJson({
        gates: verdict.gates,
        ok: verdict.ok,
        blockedBy: verdict.blockedBy,
        skipped: verdict.skipped,
        publishAction: verdict.publishAction,
        timestamp: verdict.timestamp,
        ...(tagName !== undefined ? { tag: tagName } : {}),
        publishCommand,
        ...(publishExit !== undefined ? { publishExit } : {}),
        ...(publishOutput !== undefined ? { publishOutput } : {}),
        exitCode: publishExit ?? 0,
    });
    return publishExit ?? 0;
}
function cmdRegistry(options, cwd, write) {
    const registry = buildRegistry(cwd);
    if (registry.totalSkills === 0) {
        write('dz registry: no skills found');
        return 1;
    }
    const sub = options.get('_positional_0');
    const searchQuery = sub === 'search' ? options.get('_positional_1') : sub;
    const category = options.get('category');
    // Search mode
    if (searchQuery) {
        const query = searchQuery;
        const results = searchRegistry(registry, query);
        if (results.length === 0) {
            write(`dz registry: no skills matching "${query}"`);
            return 0;
        }
        write(`\nSearch: "${query}" — ${results.length} result(s)\n`);
        for (const e of results) {
            const desc = e.description.length > 55 ? e.description.slice(0, 52) + '...' : e.description;
            write(`  ${e.id.padEnd(25)} ${e.pack.padEnd(18)} ${desc}`);
        }
        write(`\nInstall: dz init --target claude-code --select <id>`);
        return 0;
    }
    // Category filter
    if (category) {
        const results = filterByCategory(registry, category);
        if (results.length === 0) {
            write(`dz registry: no skills in category "${category}". Available: ${registry.categories.join(', ')}`);
            return 0;
        }
        write(`\nCategory: ${category} — ${results.length} skill(s)\n`);
        for (const e of results) {
            const desc = e.description.length > 55 ? e.description.slice(0, 52) + '...' : e.description;
            write(`  ${e.id.padEnd(25)} ${desc}`);
        }
        return 0;
    }
    // Full listing
    write(`\n╔══════════════════════════════════════════════════════════════════════╗`);
    write(`║                    DZ SKILL REGISTRY                               ║`);
    write(`╠══════════════════════════════════════════════════════════════════════╣`);
    write(`║  Skills: ${String(registry.totalSkills).padStart(3)}    Packs: ${String(registry.totalPacks).padStart(2)}    Categories: ${registry.categories.join(', ').padEnd(25)}║`);
    write(`╠══════════════════════════════════════════════════════════════════════╣`);
    for (const cat of registry.categories) {
        const catSkills = registry.entries.filter((e) => e.category === cat);
        write(`║  ${cat.toUpperCase()} (${catSkills.length})${' '.repeat(57 - cat.length - String(catSkills.length).length)}║`);
        for (const e of catSkills) {
            const tier = e.trustTier === 3 ? '★' : e.trustTier === 2 ? '●' : '○';
            const desc = e.description.length > 42 ? e.description.slice(0, 39) + '...' : e.description;
            write(`║    ${tier} ${e.id.padEnd(24)} ${desc.padEnd(42)}║`);
        }
        write(`║${' '.repeat(70)}║`);
    }
    write(`╚══════════════════════════════════════════════════════════════════════╝`);
    write(`\nSearch: dz registry search <query>`);
    write(`Filter: dz registry --category <${registry.categories.join('|')}>`);
    write(`Install: dz init --target claude-code --select <skill-id>`);
    return 0;
}
function cmdBenchmark(options, flags, cwd, write) {
    const skillDirArg = options.get('_positional_0');
    const compareDir = options.get('compare');
    const all = flags.has('all');
    // --all mode: benchmark all skills in a skills-* package
    if (all) {
        const packageDir = resolve(cwd, skillDirArg ?? '.');
        if (!existsSync(packageDir)) {
            write(`dz benchmark: directory not found: ${packageDir}`);
            return 1;
        }
        const entries = readdirSync(packageDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && existsSync(join(packageDir, e.name, 'SKILL.md')));
        if (entries.length === 0) {
            write(`dz benchmark: no skills found in ${packageDir}`);
            return 1;
        }
        const report = benchmarkSkills(entries.map((e) => ({ id: e.name, dir: join(packageDir, e.name) })));
        write(`\n╔══════════════════════════════════════════════════════╗`);
        write(`║          BENCHMARK REPORT — L0 Deterministic         ║`);
        write(`╠══════════════════════════════════════════════════════╣`);
        write(`║  Skills: ${String(report.skills.length).padStart(3)}  Pass rate: ${String(report.overallPassRate).padStart(3)}%  (${report.totalPassed}/${report.totalChecks})  ║`);
        write(`╠══════════════════════════════════════════════════════╣`);
        for (const s of report.skills) {
            const icon = s.grade === 'A' ? '★' : s.grade === 'B' ? '●' : s.grade === 'C' ? '○' : '✗';
            write(`║  ${icon} ${s.skillId.padEnd(30)} ${s.grade}  ${String(s.passRate).padStart(3)}%  (${s.passed}/${s.total}) ║`);
        }
        write(`╚══════════════════════════════════════════════════════╝`);
        // BTO hint
        write(`\nL0 only. For L1/L2 judge evaluation, use /bto-test <skill-dir> inside Claude Code.`);
        return report.overallPassRate >= 80 ? 0 : 1;
    }
    // --compare mode: A/B comparison
    if (compareDir) {
        if (!skillDirArg) {
            write('dz benchmark: skill dir required for compare (dz benchmark <dir-a> --compare <dir-b>)');
            return 1;
        }
        const dirA = resolve(cwd, skillDirArg);
        const dirB = resolve(cwd, compareDir);
        const idA = basename(dirA);
        const idB = basename(dirB);
        const result = compareSkills(dirA, idA, dirB, idB);
        write(`\n╔══════════════════════════════════════════════════════╗`);
        write(`║           A/B COMPARISON — L0 Deterministic          ║`);
        write(`╠══════════════════════════════════════════════════════╣`);
        write(`║  A: ${idA.padEnd(20)} ${result.skillA.grade}  ${String(result.skillA.passRate).padStart(3)}%  (${result.skillA.passed}/${result.skillA.total})    ║`);
        write(`║  B: ${idB.padEnd(20)} ${result.skillB.grade}  ${String(result.skillB.passRate).padStart(3)}%  (${result.skillB.passed}/${result.skillB.total})    ║`);
        write(`╠──────────────────────────────────────────────────────╣`);
        write(`║  Winner: ${result.winner.padEnd(41)}║`);
        if (result.deltaChecks.length > 0) {
            write(`║  Differences:                                        ║`);
            for (const d of result.deltaChecks) {
                write(`║    ${d.id}: A=${d.aPass ? 'PASS' : 'FAIL'} B=${d.bPass ? 'PASS' : 'FAIL'}${' '.repeat(33)}║`);
            }
        }
        write(`╚══════════════════════════════════════════════════════╝`);
        write(`\nFor full judge evaluation, use /bto-test inside Claude Code.`);
        return 0;
    }
    // Single skill mode
    if (!skillDirArg) {
        write('dz benchmark: skill directory required');
        write('  dz benchmark <skill-dir>              — benchmark one skill');
        write('  dz benchmark <dir> --compare <dir>    — A/B compare two skills');
        write('  dz benchmark <package-dir> --all       — benchmark all skills in a package');
        return 1;
    }
    const skillDir = resolve(cwd, skillDirArg);
    if (!existsSync(skillDir)) {
        write(`dz benchmark: not found: ${skillDir}`);
        return 1;
    }
    const score = benchmarkSkill(skillDir, basename(skillDir));
    write(`\nBenchmark: ${score.skillId}  Grade: ${score.grade}  (${score.passRate}%  ${score.passed}/${score.total})\n`);
    for (const check of score.checks) {
        const icon = check.advisory ? (check.passed ? '·' : '⚠') : check.passed ? '✓' : '✗';
        const detail = check.detail ? ` (${check.detail})` : '';
        write(`  ${icon} ${check.id.padEnd(4)} ${check.name}${detail}`);
    }
    const failedChecks = score.checks.filter((c) => !c.passed && !c.advisory);
    if (failedChecks.length > 0) {
        write(`\n${failedChecks.length} check(s) failed. Fix and re-run.`);
    }
    const advisories = score.checks.filter((c) => !c.passed && c.advisory);
    if (advisories.length > 0) {
        write(`\n${advisories.length} advisory warning(s) (not graded): ${advisories.map((a) => a.id).join(', ')}`);
    }
    write(`\nL0 only. For L1/L2 judge evaluation: /bto-test ${skillDir}`);
    return score.passRate >= 80 ? 0 : 1;
}
const SLOP_MAX_FILE_BYTES = 2 * 1024 * 1024;
const SLOP_COURSE_TEXT_KEYS = new Set([
    'back', 'courseDescription', 'courseTitle', 'description', 'explanation', 'front', 'instruction',
    'keyConcept', 'keyConcepts', 'note', 'options', 'question', 'reflection', 'shortTitle', 'strengths',
    'theory', 'title', 'weaknesses', 'wrapup',
]);
function slopDisplayPath(root, absolute) {
    const rel = relative(root, absolute);
    return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel) ? rel : absolute;
}
function slopWalk(dir, depth = 0) {
    if (depth > 16)
        return [];
    const out = [];
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return out;
    }
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build')
            continue;
        if (entry.isSymbolicLink())
            continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory())
            out.push(...slopWalk(full, depth + 1));
        else if (entry.isFile() && (['.md', '.mdx'].includes(extname(entry.name).toLowerCase()) || entry.name === 'course.json'))
            out.push(full);
    }
    return out;
}
function defaultSlopScanSet(root) {
    const paths = [];
    const readme = join(root, 'README.md');
    if (existsSync(readme))
        paths.push(readme);
    try {
        for (const pkg of discoverPackages(root)) {
            const packageReadme = join(pkg.dir, 'README.md');
            if (existsSync(packageReadme))
                paths.push(packageReadme);
        }
    }
    catch { /* a foreign project need not be a dz workspace */ }
    paths.push(...slopWalk(join(root, 'packages', '@dzhechkov', 'sitedoc', 'src', 'content'))
        .filter((path) => ['.md', '.mdx'].includes(extname(path).toLowerCase())));
    try {
        const featureDir = join(root, 'features');
        for (const entry of readdirSync(featureDir, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.isSymbolicLink())
                continue;
            const course = join(featureDir, entry.name, 'course.json');
            if (existsSync(course))
                paths.push(course);
        }
    }
    catch { /* no features directory */ }
    return [...new Set(paths.map((path) => resolve(path)))].sort((a, b) => {
        const left = slopDisplayPath(root, a);
        const right = slopDisplayPath(root, b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
}
function decodeSlopUtf8(path) {
    const stat = lstatSync(path);
    if (!stat.isFile())
        throw new Error('not a regular file');
    if (stat.size > SLOP_MAX_FILE_BYTES)
        throw new Error(`file exceeds ${SLOP_MAX_FILE_BYTES} byte limit`);
    const bytes = readFileSync(path);
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}
function projectCourseJson(text) {
    let value;
    try {
        value = JSON.parse(text);
    }
    catch {
        return null;
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value))
        return null;
    const root = value;
    if (typeof root.language !== 'string' || typeof root.courseTitle !== 'string' ||
        !Array.isArray(root.topics) || !Array.isArray(root.sections))
        return null;
    const output = [];
    const visit = (current, key = '') => {
        if (typeof current === 'string') {
            if (SLOP_COURSE_TEXT_KEYS.has(key) && current.trim() !== '')
                output.push(current);
            return;
        }
        if (Array.isArray(current)) {
            for (const item of current)
                visit(item, key);
            return;
        }
        if (current === null || typeof current !== 'object')
            return;
        for (const [childKey, child] of Object.entries(current))
            visit(child, childKey);
    };
    visit(root);
    return output.join('\n\n');
}
function slopLoadJson(path, validate) {
    const decoded = decodeSlopUtf8(path);
    let parsed;
    try {
        parsed = JSON.parse(decoded);
    }
    catch (error) {
        throw new Error(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const result = validate(parsed);
    if (!result.ok)
        throw new Error(result.errors.map((error) => `${error.field}=${JSON.stringify(error.value)}: ${error.reason}`).join('; '));
    return result.value;
}
/**
 * Read-only adapter over the pure slopLint core. Style findings are advisory by construction:
 * only usage errors return 2 and incomplete policy/input evidence returns 1.
 */
function cmdLint(options, flags, cwd, write) {
    const json = flags.has('json');
    const root = resolve(cwd, options.get('project') ?? '.');
    const usageError = (message) => {
        if (json)
            write(JSON.stringify({ schema: 'dz-slop-lint/1', advisory: true, ok: false, status: 'incomplete', findings: [], scanned: [], skipped: [], errors: [{ message }] }));
        else
            write(`dz lint: ${message}`);
        return 2;
    };
    if (flags.has('config'))
        return usageError('--config requires a file');
    if (flags.has('registry'))
        return usageError('--registry requires a file');
    let config = DEFAULT_SLOP_CONFIG;
    let registry;
    const setupErrors = [];
    try {
        if (options.has('config'))
            config = slopLoadJson(resolve(root, options.get('config')), validateSlopLintConfig);
    }
    catch (error) {
        const path = options.get('config');
        setupErrors.push({ ...(path === undefined ? {} : { path }), message: `config: ${error instanceof Error ? error.message : String(error)}` });
    }
    try {
        const registryPath = options.has('registry') ? resolve(root, options.get('registry')) : fileURLToPath(BUNDLED_SLOP_REGISTRY_URL);
        registry = slopLoadJson(registryPath, parseSlopRegistry);
    }
    catch (error) {
        const path = options.get('registry');
        setupErrors.push({ ...(path === undefined ? {} : { path }), message: `registry: ${error instanceof Error ? error.message : String(error)}` });
        registry = { schema: 'dz-slop-registry/1', metadata: {}, markers: [], adjectives: [] };
    }
    const requested = [];
    for (let index = 0;; index += 1) {
        const value = options.get(`_positional_${index}`);
        if (value === undefined)
            break;
        requested.push(resolve(root, value));
    }
    const explicit = requested.length > 0;
    const candidates = explicit ? requested.flatMap((path) => {
        try {
            const stat = lstatSync(path);
            if (stat.isSymbolicLink())
                return [path];
            return stat.isDirectory() ? slopWalk(path) : [path];
        }
        catch {
            return [path];
        }
    }) : defaultSlopScanSet(root);
    const scanSet = [...new Set(candidates.map((path) => resolve(path)))].sort((a, b) => {
        const left = slopDisplayPath(root, a);
        const right = slopDisplayPath(root, b);
        return left < right ? -1 : left > right ? 1 : 0;
    });
    const findings = [];
    const scanned = [];
    const errors = [...setupErrors];
    if (setupErrors.length === 0) {
        for (const path of scanSet) {
            const display = slopDisplayPath(root, path);
            let source;
            try {
                source = decodeSlopUtf8(path);
            }
            catch (error) {
                const message = error instanceof TypeError ? `invalid UTF-8: ${error.message}` : error instanceof Error ? error.message : String(error);
                scanned.push({ path: display, status: 'skipped', reason: message });
                errors.push({ path: display, message });
                continue;
            }
            if (basename(path) === 'course.json') {
                const projected = projectCourseJson(source);
                if (projected === null) {
                    const message = 'unsupported course.json shape';
                    scanned.push({ path: display, status: 'skipped', reason: message });
                    if (explicit)
                        errors.push({ path: display, message });
                    continue;
                }
                source = projected;
            }
            else if (!['.md', '.mdx'].includes(extname(path).toLowerCase())) {
                const message = 'unsupported input type; expected Markdown, MDX, or recognized course.json';
                scanned.push({ path: display, status: 'skipped', reason: message });
                errors.push({ path: display, message });
                continue;
            }
            const result = slopLint(source, { config, registry });
            if (result.paragraphCount === 0)
                errors.push({ path: display, message: 'no analyzable prose' });
            for (const diagnostic of result.diagnostics)
                errors.push({ path: display, message: `${diagnostic.code} at line ${diagnostic.line}: ${diagnostic.message}` });
            for (const finding of result.findings)
                findings.push({ ...finding, file: display });
            scanned.push({ path: display, status: 'scanned', paragraphs: result.paragraphCount, findings: result.findings.length });
        }
    }
    // A valid empty directory/default scope is a clean advisory no-op. Explicit missing paths stay
    // in scanSet and fail above, while a supported file containing no prose remains incomplete.
    const skipped = scanned.filter((row) => row.status === 'skipped');
    const status = errors.length > 0 ? 'incomplete' : findings.length > 0 ? 'findings' : 'clean';
    const report = {
        schema: 'dz-slop-lint/1', advisory: true, ok: errors.length === 0, status, findings, scanned, skipped, errors,
    };
    if (json)
        write(JSON.stringify(report));
    else {
        write(`dz lint: ${findings.length} finding(s), ${scanned.filter((row) => row.status === 'scanned').length} file(s) scanned — ${status}`);
        for (const finding of findings)
            write(`  [${finding.ruleId}] ${finding.file}:${finding.lineStart}:${finding.columnStart} — ${finding.excerpt}`);
        for (const error of errors)
            write(`  incomplete${error.path ? ` ${error.path}` : ''}: ${error.message}`);
    }
    return errors.length > 0 ? 1 : 0;
}
/**
 * Exit-code contract for `dz claim-check` (named in the ADR, locked by tests):
 * exit 0 when no finding at/above `failOn` exists; exit 1 only when one does.
 * `--fail-on none` never exits non-zero. Severity order: high > medium > none.
 */
function computeClaimExit(findings, failOn) {
    const rank = { none: 0, medium: 1, high: 2 };
    if (failOn === 'none')
        return 0;
    return findings.some((f) => rank[f.severity] >= rank[failOn]) ? 1 : 0;
}
/**
 * Recursively collect every `*.md` file under `dir` (case-insensitive extension), regular files
 * only. Ordering is deterministic — entries are sorted per directory — so the resulting `scanned`
 * list is stable across runs. NEVER throws: each `readdirSync` level is wrapped in try/catch, so an
 * unreadable or missing directory contributes what it could reach and is never fatal (never-throw,
 * ADR D6). Skips dot-entries (`.git`, `.dz`, …), `node_modules`, and symlinks (`isSymbolicLink()` —
 * cycle-proof; a symlink loop can never be followed). Depth-capped at 16 as a belt against
 * pathological nesting. No glob dependency — the same `readdirSync(dir, { withFileTypes: true })`
 * idiom as the callers, so no new runtime surface.
 */
function walkMarkdownFiles(dir, depth = 0) {
    const out = [];
    if (depth > 16)
        return out;
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        for (const e of entries) {
            if (e.name.startsWith('.') || e.name === 'node_modules')
                continue;
            if (e.isSymbolicLink())
                continue; // never follow links — cycle-proof
            const full = join(dir, e.name);
            if (e.isDirectory()) {
                for (const f of walkMarkdownFiles(full, depth + 1))
                    out.push(f);
            }
            else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
                out.push(full);
            }
        }
    }
    catch { /* unreadable/missing dir — return what we have, never throw */ }
    return out;
}
/**
 * Default scan set when no paths are given, in order: the repo root README; every published
 * package README under packages/@dzhechkov; every `*.md` under `features/` (recursively); and
 * every `*.md` under `docs/` (recursively). Feature artifacts and docs pages are where unverifiable
 * claims are BORN (ADR-001, driver D1) — the batch scanner now covers the same stock the
 * authoring-time hook already holds every `*.md` write to (D4). The set is HARD-CODED: there is no
 * `.dz/config.json` key that can narrow it (ADR-001 Option A) — the only narrowing mechanism is
 * explicit positional paths (`dz claim-check <paths…>`), visible per-invocation. Each README is
 * existsSync-guarded and the recursive walks are never-throw: a missing `features/`, `docs/`, or
 * packages/ dir contributes nothing and is never fatal, so a foreign repo (where `dz claim-check`
 * runs against arbitrary projects) sees at most its README, exactly as before. Paths are deduped by
 * absolute path so a nested `08_qe_report.md` under features (previously special-cased, now subsumed
 * by the recursive walk) appears exactly once.
 */
function defaultClaimScanSet(root) {
    const seen = new Set();
    const set = [];
    const add = (p) => {
        if (!seen.has(p)) {
            seen.add(p);
            set.push(p);
        }
    };
    const rootReadme = join(root, 'README.md');
    if (existsSync(rootReadme))
        add(rootReadme);
    try {
        for (const p of discoverPackages(root)) {
            const readme = join(p.dir, 'README.md');
            if (existsSync(readme))
                add(readme);
        }
    }
    catch { /* no packages/@dzhechkov dir — skip */ }
    // `features/*/08_qe_report.md` ONLY — deliberately NOT `features/**/*.md`.
    //
    // A completed ADR, an audit report, a shipped requirements doc is a HISTORICAL RECORD. It fixes what
    // was decided and what was found — including past dishonesty. Scanning them presses an author to
    // rewrite history so a counter goes green, which is the exact substitution this gate exists to
    // prevent. Observed live 2026-07-09: given the wider set, an agent backticked genuine `100%` claims
    // across 13 historical documents (audit reports among them) to silence the findings. The wider set
    // also flagged `features/audit-2026-06-11/00_audit_report.md` for QUOTING the overstatement it had
    // caught — the gate punishing the very document that recorded the dishonesty.
    //
    // So the default set covers what is PUBLISHED (READMEs), what is LIVE (`docs/`), and the QE reports
    // that grade CURRENT work. History is out of scope. Pass explicit paths to scan it deliberately.
    //
    // The unsolved prerequisite for ever widening this: the engine cannot distinguish a QUOTATION of a
    // forbidden claim from an ASSERTION of one. Until it can, a wider default manufactures the pressure
    // to launder.
    try {
        const featuresDir = join(root, 'features');
        if (existsSync(featuresDir)) {
            for (const e of readdirSync(featuresDir, { withFileTypes: true })) {
                if (!e.isDirectory())
                    continue;
                const qe = join(featuresDir, e.name, '08_qe_report.md');
                if (existsSync(qe))
                    add(qe);
            }
        }
    }
    catch { /* no features dir — skip */ }
    for (const f of walkMarkdownFiles(join(root, 'docs')))
        add(f); // docs/ — live, published guidance
    return set;
}
/** Cheap binary sniff: a NUL byte in the first 512 chars ⇒ skip (never scan binaries). */
function looksBinaryText(text) {
    const n = Math.min(text.length, 512);
    for (let i = 0; i < n; i += 1)
        if (text.charCodeAt(i) === 0)
            return true;
    return false;
}
/**
 * `dz claim-check [paths...] [--json] [--fail-on high|medium|none] [--project <dir>]`
 *
 * I/O adapter over the pure `claimCheck` engine: resolves the scan set, reads each file
 * never-throw (unreadable/binary/missing files are skipped and reported in `scanned`), merges
 * per-file findings (each enriched with its `file`), and applies the exit-code contract.
 * `--json` ALWAYS emits valid JSON `{ok, findings, scanned}`, even on the failure path.
 */
/**
 * `dz chain` — verify EVERY hash-chained journal in one command (W0-chain, backlog bc4ee35c).
 *
 * The machinery to verify a chain has worked for weeks. What was missing is the ABILITY TO ASK:
 * verification lived inside two consumers, each carrying its own hardcoded list of which files are
 * chained, so a journal could be given a chain and still be checked by nobody. Coverage here is
 * DERIVED from CHAINED_JOURNALS, never typed — adding a journal to the registry adds it to this
 * report by construction.
 *
 * An ABSENT journal is reported as `absent`, not omitted. Omission and cleanliness are
 * indistinguishable in a report, and that indistinguishability is how the original blind spot
 * survived; the same reason `broken` exits NON-ZERO rather than merely printing — a verifier that
 * reports damage and exits 0 is one no automation can act on, and this verb exists to run unattended.
 *
 * A journal that exists but carries NO chained records is `unchained`, which is legal (a log may
 * predate the chain) and therefore does not fail the command. Calling it a defect would train the
 * reader to ignore the output — the failure mode already measured once on the doctor's own line.
 */
function cmdChain(options, flags, cwd, write) {
    const root = options.get('project') ?? cwd;
    const journals = CHAINED_JOURNALS.map((journal) => {
        const path = join(root, journal.rel);
        if (!existsSync(path)) {
            return { rel: journal.rel, decides: journal.decides, status: 'absent', chained: 0, defects: 0, detail: 'file not present' };
        }
        let text = '';
        try {
            text = readFileSync(path, 'utf-8');
        }
        catch {
            // Unreadable is NOT clean. It is the one outcome that must never be quietly folded into
            // "nothing to report": we did not look, so we know nothing.
            return { rel: journal.rel, decides: journal.decides, status: 'unreadable', chained: 0, defects: 0, detail: 'file could not be read' };
        }
        const v = verifyEventChainText(text);
        if (v.chained === 0) {
            return { rel: journal.rel, decides: journal.decides, status: 'unchained', chained: 0, defects: 0, detail: 'present, but no record carries a chain (legal — the log predates chaining)' };
        }
        const total = text.split('\n').filter((l) => l.trim() !== '').length;
        const age = classifyChainDefects(v, total);
        if (v.ok) {
            return { rel: journal.rel, decides: journal.decides, status: 'ok', chained: v.chained, defects: 0, detail: `${v.chained} chained record(s), ${v.resets} recorded restart(s)` };
        }
        // A break the current unbroken run has already outlived does not make TODAY's records unsound.
        // Reporting both alike is what made the doctor's equivalent line permanently red for four weeks.
        const historical = age.inRun.length === 0 && age.runRecords > 0;
        return {
            rel: journal.rel,
            decides: journal.decides,
            status: historical ? 'healed' : 'broken',
            chained: v.chained,
            defects: v.defects.length,
            detail: historical
                ? `${v.defects.length} defect(s), all BEFORE the current run — the last ${age.runRecords} record(s) are unbroken, so verdicts over those are sound`
                : `${v.defects.length} defect(s) with NO sound records after them: verdicts computed from this log are unsafe`,
        };
    });
    const failed = journals.filter((j) => j.status === 'broken' || j.status === 'unreadable');
    const ok = failed.length === 0;
    if (flags.has('json')) {
        write(JSON.stringify({ ok, root, journals }, null, 2));
        return ok ? 0 : 1;
    }
    write(`dz chain — ${journals.length} registered journal(s) under ${root}`);
    write('');
    const MARK = { ok: '\u2713', healed: '\u2713', unchained: '\u00b7', absent: '\u00b7', broken: '\u2717', unreadable: '\u2717' };
    for (const j of journals) {
        write(`  ${MARK[j.status] ?? '?'} ${j.rel} — ${j.status}`);
        write(`      ${j.detail}`);
        write(`      decides: ${j.decides}`);
    }
    write('');
    write(ok ? '  all registered journals are sound for present verdicts' : `  ${failed.length} journal(s) UNSAFE — see above`);
    return ok ? 0 : 1;
}
function cmdClaimCheck(options, _optionLists, flags, cwd, write) {
    // Reject (never silently coerce) an invalid --fail-on.
    const failOnRaw = options.get('fail-on') ?? 'high';
    if (!['high', 'medium', 'none'].includes(failOnRaw)) {
        write(`dz claim-check: invalid --fail-on '${failOnRaw}' (expected high|medium|none)`);
        return 1;
    }
    const failOn = failOnRaw;
    const root = resolve(cwd, options.get('project') ?? '.');
    // `--json <path>` is captured by parseArgs as the OPTION `json=<path>` (the boolean flag ate the
    // next token — the same gotcha cmdMcpScan recovers). Recover both: mark json, adopt the eaten
    // token as the first path. `--json` alone (at end / before another --flag) lands as a bare flag.
    let json = flags.has('json');
    const paths = [];
    const jsonConsumed = options.get('json');
    if (jsonConsumed !== undefined) {
        json = true;
        if (jsonConsumed !== 'true')
            paths.push(jsonConsumed);
    }
    // Variadic positional paths land as _positional_0, _positional_1, … (see parseArgs).
    for (let i = 0;; i += 1) {
        const p = options.get(`_positional_${i}`);
        if (p === undefined)
            break;
        paths.push(p);
    }
    // A DIRECTORY argument used to hit EISDIR, be counted as "skipped", and still exit 0 — the gate
    // reported PASS having scanned nothing (MEASURED: `dz claim-check docs` said "1 skipped" and exited
    // 0 while `dz claim-check docs/*.md` found 7). Expand a directory into its markdown instead.
    const expandDir = (dir, depth = 0) => {
        if (depth > 6)
            return [];
        let entries;
        try {
            entries = readdirSync(dir);
        }
        catch {
            return [];
        }
        const out = [];
        for (const name of entries) {
            if (name.startsWith('.') || name === 'node_modules' || name === 'dist')
                continue;
            const full = join(dir, name);
            try {
                const st = statSync(full);
                if (st.isDirectory())
                    out.push(...expandDir(full, depth + 1));
                else if (st.isFile() && name.toLowerCase().endsWith('.md'))
                    out.push(full);
            }
            catch {
                /* unreadable entry — nothing to scan */
            }
        }
        return out;
    };
    const requested = paths.length > 0 ? paths.map((p) => resolve(root, p)) : defaultClaimScanSet(root);
    const scanSet = [];
    for (const p of requested) {
        let isDir = false;
        try {
            isDir = statSync(p).isDirectory();
        }
        catch {
            /* missing path stays in the set so it is reported as skipped, never silently dropped */
        }
        if (isDir)
            scanSet.push(...expandDir(p));
        else
            scanSet.push(p);
    }
    const findings = [];
    const scanned = [];
    for (const abs of scanSet) {
        // Show a repo-relative path for in-tree files; fall back to the absolute path for
        // anything outside root (avoids an ugly ../../.. chain for an explicit external path).
        const relRaw = relative(root, abs);
        const rel = relRaw && !relRaw.startsWith('..') ? relRaw : abs;
        let text;
        try {
            text = readFileSync(abs, 'utf-8');
        }
        catch (err) {
            scanned.push({ path: rel, status: 'skipped', reason: err instanceof Error ? err.message : 'not found' });
            continue;
        }
        if (looksBinaryText(text)) {
            scanned.push({ path: rel, status: 'skipped', reason: 'binary' });
            continue;
        }
        const result = claimCheck(text);
        for (const f of result.findings)
            findings.push({ ...f, file: rel });
        scanned.push({ path: rel, status: 'scanned', findings: result.findings.length });
    }
    const ok = findings.length === 0;
    if (json) {
        write(JSON.stringify({ ok, findings, scanned })); // ALWAYS valid JSON, pass or fail
        return computeClaimExit(findings, failOn);
    }
    // Human output.
    write(summarize({ ok, findings }));
    for (const f of findings) {
        write(`  [${f.severity}] ${f.file}:${f.line} — ${f.reason}`);
        write(`      ${f.excerpt}`);
        write(`      ↳ ${f.suggestion}`);
    }
    const skipped = scanned.filter((s) => s.status === 'skipped');
    write(`\n  ${scanned.length} file(s) in scan set, ${skipped.length} skipped.`);
    for (const s of skipped)
        write(`    skipped ${s.path} (${s.reason})`);
    // A gate that examined NOTHING must never report a pass. Previously an unreadable argument was
    // counted as "skipped" and the command still exited 0 — a clean bill of health over zero evidence.
    const readCount = scanned.filter((s) => s.status === 'scanned').length;
    if (readCount === 0 && scanned.length > 0) {
        write('  NOTHING was read — this is not a pass. Check the paths above.');
        return 1;
    }
    // Additive per-group rollup (ADR-001 C4): the widened default set can produce thousands of
    // findings; this summarizes WHERE they land (root README, packages/…, features/<slug>,
    // docs/<subdir>) WITHOUT hiding any — display-only, so `--json` shape and exit codes are
    // untouched, and every pre-existing output line above is byte-identical.
    if (findings.length > 0) {
        const groups = new Map();
        for (const f of findings) {
            const key = claimGroupKey(f.file);
            const g = groups.get(key) ?? { findings: 0, high: 0 };
            g.findings += 1;
            if (f.severity === 'high')
                g.high += 1;
            groups.set(key, g);
        }
        const rows = [...groups.entries()].sort((a, b) => b[1].findings - a[1].findings || (a[0] < b[0] ? -1 : 1));
        write(`\n  Findings by group:`);
        for (const [key, g] of rows)
            write(`    ${g.findings} finding(s), ${g.high} high — ${key}`);
    }
    return computeClaimExit(findings, failOn);
}
/**
 * Bucket a repo-relative finding path into a top-level group for the human-output rollup:
 * the root `README.md`, a package dir (`packages/@dzhechkov/<pkg>`), a feature (`features/<slug>`),
 * or a docs subdir (`docs/<subdir>`). Anything else groups under its own path. Display-only —
 * no detection or exit-code behavior depends on this.
 */
function claimGroupKey(file) {
    if (file === 'README.md')
        return 'README.md';
    const parts = file.split('/');
    if (parts[0] === 'features')
        return parts.length > 1 ? `features/${parts[1]}` : 'features';
    if (parts[0] === 'docs')
        return parts.length > 2 ? `docs/${parts[1]}` : 'docs';
    if (parts[0] === 'packages')
        return parts.slice(0, -1).join('/');
    return file;
}
function cmdMcpScan(options, flags, cwd, write) {
    // The arg parser captures `--boolFlag <next>` as an OPTION value, so a path
    // typed AFTER a boolean flag (e.g. `dz mcp-scan --reconcile .`) lands as that
    // flag's value with no positional. Recover both: set the flag, and adopt the
    // value as the scan path when it's an existing path.
    let pathArg = options.get('_positional_0');
    let json = flags.has('json');
    let reconcile = flags.has('reconcile');
    let failUnder = flags.has('fail-on-undergrant');
    for (const key of ['json', 'reconcile', 'fail-on-undergrant']) {
        const v = options.get(key);
        if (v === undefined || v === 'true')
            continue;
        if (key === 'json')
            json = true;
        else if (key === 'reconcile')
            reconcile = true;
        else
            failUnder = true;
        if (pathArg === undefined && existsSync(resolve(cwd, v)))
            pathArg = v;
    }
    const root = resolve(cwd, pathArg ?? '.');
    if (!existsSync(root)) {
        write(`dz mcp-scan: not found: ${root}`);
        return 1;
    }
    const report = scanMcp(root);
    // Phase 3: static capability reconciliation (project grants vs installed skills' declarations).
    const rec = reconcile
        ? reconcileCapabilities(report, resolve(cwd, options.get('skills-dir') ?? join(root, '.claude', 'skills')))
        : null;
    const exit = () => (failUnder && rec && rec.findings.some((f) => f.kind === 'under-grant') ? Math.max(report.exitCode, 1) : report.exitCode);
    if (json) {
        write(JSON.stringify(rec ? { ...report, reconciliation: rec } : report, null, 2));
        if (rec)
            emitPolicyIfRequested(rec, root, options, flags, write); // runs in CI/json mode too
        return exit();
    }
    const icon = report.verdict === 'high' ? '🔴' : report.verdict === 'medium' ? '🟡' : '🟢';
    const cap = report.capabilities;
    write(`\n${icon} dz mcp-scan — verdict: ${report.verdict.toUpperCase()}`);
    write(`   shell=${cap.shell} network=${cap.network} file-write=${cap.fileWrite} secrets-reachable=${cap.secretsReachable} default-deny=${cap.defaultDeny}`);
    if (report.scanned.length === 0) {
        write(`   (no .claude/settings*.json or .mcp.json found under ${root})`);
    }
    else {
        write(`   scanned: ${report.scanned.join(', ')}`);
    }
    if (report.findings.length > 0) {
        write('');
        for (const f of report.findings) {
            const sev = f.severity === 'high' ? 'HIGH' : f.severity === 'medium' ? 'MED ' : 'LOW ';
            write(`  [${sev}] ${f.id}  (${f.capability})`);
            write(`          ${f.detail}`);
            write(`          ↳ ${f.evidence}  [${f.source}]`);
        }
    }
    write(`\n  ${report.findings.length} finding(s) (low = informational). Exit ${report.exitCode} (0 clean / 1 medium / 2 high).`);
    if (rec) {
        renderReconcile(rec, write);
        emitPolicyIfRequested(rec, root, options, flags, write);
    }
    return exit();
}
function renderReconcile(rec, write) {
    write(`\n── reconcile (build-time, advisory) ─────────────────────────`);
    write(`   ${RECONCILE_BANNER}`);
    write(`   installed skills: ${rec.installedCount}${rec.installedCount === 0 ? ' (nothing to reconcile against — grants will all look over-granted)' : ''}`);
    if (rec.findings.length === 0) {
        write(`   ✓ grants match declared needs — no over/under-grant`);
    }
    else {
        for (const f of rec.findings) {
            const tag = f.kind === 'under-grant' ? 'UNDER' : 'OVER ';
            write(`   [${tag}] ${f.id}  ${f.detail}`);
            if (f.skills.length > 0)
                write(`           skills: ${f.skills.join(', ')}`);
        }
    }
    if (rec.limits) {
        const l = rec.limits;
        const parts = [
            l.toolTimeoutMs !== undefined ? `toolTimeoutMs=${l.toolTimeoutMs}` : null,
            l.maxToolCallsPerTurn !== undefined ? `maxToolCallsPerTurn=${l.maxToolCallsPerTurn}` : null,
            l.requireApprovalForDangerous ? `requireApprovalForDangerous=true` : null,
        ].filter(Boolean);
        write(`   limits (declared by ${l.declaredBy} skill(s), INERT — settings.json cannot enforce): ${parts.join(', ')}`);
    }
}
/**
 * Write the least-privilege advisory policy when `--emit-policy` is set. Runs in
 * BOTH json and text modes. Refuses to write into `.claude/` or outside the
 * project root (the artifact is generation, not activation — `.dz/` only).
 */
function emitPolicyIfRequested(rec, root, options, flags, write) {
    if (!flags.has('emit-policy') && options.get('emit-policy') === undefined)
        return;
    const opt = options.get('emit-policy');
    // custom paths resolve against the SCANNED project root (so the artifact lives
    // with the project and the escape/.claude guards below stay coherent).
    const dest = opt && opt !== 'true' ? resolve(root, opt) : join(root, '.dz', 'policy', 'mcp-policy.json');
    if (dest.split(sep).includes('.claude')) {
        write(`\n   ✗ refusing to emit policy into .claude/ — dz emits to .dz/ only (generation ≠ activation)`);
        return;
    }
    const rel = relative(root, dest);
    if (rel.startsWith('..') || isAbsolute(rel)) {
        write(`\n   ✗ refusing to emit policy outside the project root: ${dest}`);
        return;
    }
    try {
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, JSON.stringify(rec.policy, null, 2) + '\n');
        write(`\n   ✎ emitted least-privilege advisory policy → ${dest}`);
        write(`     (advisory only — a HOST must consume it; dz enforces nothing)`);
    }
    catch (err) {
        write(`\n   ✗ could not write policy: ${err instanceof Error ? err.message : String(err)}`);
    }
}
async function cmdSyncUpstream(options, flags, cwd, write) {
    // --list mode: show all packages with sources.json
    if (flags.has('list')) {
        const packages = discoverSourcePackages(cwd);
        if (packages.length === 0) {
            write('dz sync-upstream --list: no packages with sources.json found');
            return 0;
        }
        write(`\nPackages with external skill sources:\n`);
        for (const pkg of packages) {
            write(`  ${pkg.name.padEnd(20)} → ${pkg.origin.repo} (${pkg.skillCount} skills, ${pkg.origin.canonicalized})`);
        }
        write(`\nCheck all: dz sync-upstream --all`);
        write(`Check one: dz sync-upstream --package packages/@dzhechkov/${packages[0]?.name ?? 'skills-devops'}`);
        return 0;
    }
    // --all mode: check all packages
    if (flags.has('all')) {
        const reports = await checkAllUpstream(cwd);
        if (reports.length === 0) {
            write('dz sync-upstream --all: no packages with sources.json found');
            return 0;
        }
        let totalChanged = 0;
        let totalChecked = 0;
        for (const report of reports) {
            totalChanged += report.changed;
            totalChecked += report.checked;
            write(`\n${report.origin.repo} (${report.origin.branch})`);
            write(`  Checked: ${report.checked} | Changed: ${report.changed} | Up-to-date: ${report.upToDate} | Errors: ${report.errors}`);
            for (const skill of report.skills) {
                if (skill.status !== 'up-to-date') {
                    const icon = skill.status === 'changed' ? '△' : '✗';
                    const detail = skill.status === 'changed'
                        ? ` (local: ${skill.localLines}, upstream: ${skill.upstreamLines})`
                        : skill.error ? ` (${skill.error})` : '';
                    write(`    ${icon} ${skill.skillId.padEnd(25)} ${skill.status}${detail}`);
                }
            }
        }
        write(`\nTotal: ${totalChecked} skills checked across ${reports.length} packages, ${totalChanged} changed`);
        return 0;
    }
    // Single package mode
    const packageDir = resolve(cwd, options.get('package') ?? '.');
    const report = await checkUpstream(packageDir);
    if (!report) {
        write('dz sync-upstream: no sources.json found in ' + packageDir);
        write('  Try: dz sync-upstream --list  (show packages with external sources)');
        write('  Or:  dz sync-upstream --all   (check all packages)');
        return 1;
    }
    write(`Upstream: ${report.origin.repo} (${report.origin.branch})`);
    write(`Checked: ${report.checked} | Changed: ${report.changed} | Up-to-date: ${report.upToDate} | Errors: ${report.errors}\n`);
    for (const skill of report.skills) {
        const icon = skill.status === 'up-to-date' ? '✓' : skill.status === 'changed' ? '△' : '✗';
        const detail = skill.status === 'changed'
            ? ` (local: ${skill.localLines} lines, upstream: ${skill.upstreamLines} lines)`
            : skill.error ? ` (${skill.error})` : '';
        write(`  ${icon} ${skill.skillId.padEnd(25)} ${skill.status}${detail}`);
    }
    return report.errors > 0 ? 1 : 0;
}
/**
 * `dz drift-check` — the CI gate. Reports which shared skills byte-differ between their copies and
 * exits 1 iff any drift exists (0 when clean). `dz sync-upstream` only sees EXTERNAL drift; this is
 * the intra-monorepo complement that would have caught the goap-ed25519 exploit in 10/12 copies.
 */
/**
 * Read `.dz/drift-allowlist.json` — skills whose drift is ACCEPTED (documented intentional forks), so
 * the gate fails only on NEW/unexpected drift instead of being red-on-arrival. Tolerant of a bare
 * `["name", …]` array or `{ "skills": [{ "name", "reason" }, …] }`. Missing/broken file ⇒ empty.
 */
function readDriftAllowlist(root) {
    const p = join(root, '.dz', 'drift-allowlist.json');
    if (!existsSync(p))
        return [];
    try {
        const raw = JSON.parse(readFileSync(p, 'utf8'));
        const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.skills) ? raw.skills : [];
        return arr.map((e) => (typeof e === 'string' ? e : e?.name)).filter((n) => typeof n === 'string' && n.length > 0);
    }
    catch {
        return [];
    }
}
/** Refresh or verify the root AGENTS.md bearing-policy projection. */
/**
 * `dz hooks-sync --target codex` (`crossrt-2-codex-hooks`, AM-14).
 *
 * ONE verb in the existing target vocabulary (`parity`, `delivery-check`, `--target`), extensible to
 * a future runtime without a third surface. **No alias** — `dz codex-hooks` resolves to nothing.
 *
 * Exit map (ADR-002 §5, pinned by test):
 *   0 = `armed` AND `trust: 'trusted'` — the ONLY outcome that may print a success word (AM-17)
 *   1 = not armed, armed-but-trust-pending, drift, or a refusal
 *   3 = inconclusive (including "no codex binary on PATH")
 */
function cmdHooksSync(options, flags, cwd, write, writeErr) {
    const json = flags.has('json');
    const usage = 'dz hooks-sync --target codex [--check] [--verify] [--remove] [--json] [--project <dir>] [--no-verify]';
    if (flags.has('help')) {
        write(`${usage} — install/verify the dz veto + recall hooks in $CODEX_HOME/hooks.json`);
        return 0;
    }
    for (const flag of flags) {
        if (!['check', 'verify', 'no-verify', 'remove', 'json', 'help'].includes(flag)) {
            const message = `dz hooks-sync: unknown option --${flag}\n${usage}`;
            (json ? write : writeErr)(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : message);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key !== 'target' && key !== 'project' && key !== 'codex-home') {
            const message = key.startsWith('_positional_') ? `unexpected argument ${JSON.stringify(options.get(key))}` : `unknown option --${key}`;
            (json ? write : writeErr)(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz hooks-sync: ${message}\n${usage}`);
            return 1;
        }
    }
    // Every `--target` read in this CLI goes through resolveTargetName (alias support + one spelling
    // of the unknown-target message), pinned by `everyTargetGuardUsesResolveTargetName`.
    const targetOpt = options.get('target');
    if (targetOpt === undefined) {
        const message = '--target is required';
        (json ? write : writeErr)(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz hooks-sync: ${message}\n${usage}`);
        return 1;
    }
    const resolution = resolveTargetName(targetOpt);
    if (resolution.kind === 'unknown') {
        if (json) {
            write(JSON.stringify({ error: `unknown target ${targetOpt}`, exitCode: 1 }));
        }
        else {
            for (const line of formatTargetProblem('dz hooks-sync', resolution))
                writeErr(line);
        }
        return 1;
    }
    const target = resolution.target;
    if (resolution.via === 'alias')
        writeErr(formatTargetAliasNote('dz hooks-sync', targetOpt, target));
    if (target !== 'codex') {
        // Deliberately narrow: only Codex has a hook carrier today. Naming the reason keeps a future
        // reader from assuming the other nine are simply unimplemented here.
        const message = `unsupported --target ${target} (only "codex" has a hook carrier today)`;
        (json ? write : writeErr)(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz hooks-sync: ${message}\n${usage}`);
        return 1;
    }
    const codexHome = options.get('codex-home');
    const projectOpt = options.get('project');
    // `--no-verify` wins over `--verify`: an explicit refusal to measure is never overridden by the
    // flag that asks for a measurement.
    const report = runSyncCodexHooksGuarded(codexHooksSyncOptions({
        ...(codexHome !== undefined ? { codexHome } : {}),
        ...(projectOpt !== undefined ? { project: resolve(cwd, projectOpt) } : {}),
        check: flags.has('check'),
        remove: flags.has('remove'),
        verify: !flags.has('no-verify'),
    }));
    if (json) {
        write(JSON.stringify({ ...report, exitCode: report.exitCode }));
        return report.exitCode;
    }
    for (const err of report.errors)
        writeErr(`dz hooks-sync: ${err}`);
    for (const warn of report.warnings)
        writeErr(`dz hooks-sync: warning: ${warn}`);
    // SILENT in a home that never opted in — the leg-1 F12 lesson: a --check that chatters in every
    // unrelated project trains its reader to ignore it.
    if (flags.has('check') && !report.installed && report.errors.length === 0)
        return report.exitCode;
    if (flags.has('remove')) {
        write(`dz hooks-sync: removed ${report.removed} managed entr(ies) from ${report.registryPath}`);
        return report.exitCode;
    }
    // AM-17 / G-G: the success word is reachable ONLY from `report.ready` — armed AND trusted AND
    // WITNESSED blocking by a live, non-bypassed probe. The pre-fix version printed it off
    // `exitCode === 0 && trust && installed`, none of which is evidence that the guard fires.
    const summary = codexHooksSummary(report);
    for (const line of summary.stdout)
        write(line);
    for (const line of summary.stderr)
        writeErr(line);
    return report.exitCode;
}
/**
 * The argv → operation mapping, extracted so it can be PINNED.
 *
 * It is the mapping that was broken: `--verify`, `--no-verify` and `--project` were parsed,
 * validated, listed in the usage line — and then never reached `runSyncCodexHooks`, so the CRITICAL
 * finding (a `ready` with no live proof behind it) lived entirely in three missing object keys.
 * A function that returns the options object is testable without a codex binary; an inline literal
 * is not.
 */
export function codexHooksSyncOptions(input) {
    return {
        ...(input.codexHome !== undefined ? { codexHome: input.codexHome } : {}),
        ...(input.project !== undefined ? { project: input.project } : {}),
        check: input.check === true,
        remove: input.remove === true,
        verify: input.verify !== false,
    };
}
/** Map the retained Codex hook writer's one live verdict into the common integration contract. */
export function normalizeCodexHookOutcome(base, delivery, noVerify = false) {
    if (delivery.report.ready) {
        return {
            target: 'codex', component: 'hooks', status: 'emitted',
            registrations: [{ id: 'dz-codex-hooks', scope: 'user', registered: delivery.report.installed, approval: delivery.report.trust === 'trusted' ? 'approved' : 'unknown', ready: true }],
            carrier: { scope: 'user', path: '$CODEX_HOME/hooks.json' },
            ...(delivery.report.codexVersion !== null ? { runtimeVersion: delivery.report.codexVersion } : {}),
            evidenceVersion: 'codex-hooks-live-v1',
        };
    }
    return {
        ...base,
        target: 'codex', component: 'hooks', status: 'refused',
        registrations: [{ id: 'dz-codex-hooks', scope: 'user', registered: delivery.report.installed, approval: delivery.report.trust === 'trusted' ? 'approved' : 'unknown', ready: false }],
        reasonCode: 'CURRENT_LIVE_CHECK_FAILED',
        remediation: noVerify ? '--no-verify cannot establish ready; rerun with live verification' : 'approve the managed hooks and rerun the live verification',
        applied: delivery.report.written || delivery.report.installed,
    };
}
/**
 * What the user is told about a sync report — the ONE place the success word can be printed.
 *
 * `report.ready` is the whole gate: installed ∧ executable ∧ trusted ∧ a live, non-bypassed probe
 * that WITNESSED our block. Nothing else may print "ready" (AM-17 / G-G), and `--no-verify` never
 * can, because it never measured.
 */
export function codexHooksSummary(report, label = 'dz hooks-sync') {
    const stdout = [];
    const stderr = [];
    if (report.ready) {
        stdout.push(`${label}: codex hooks installed and ARMED (trust: ${report.trust}) — VERIFIED by a live veto probe — ready`);
        return { ok: true, stdout, stderr };
    }
    if (report.installed) {
        const verdict = report.verify === null ? 'not verified (no live probe ran)' : `${report.verify.verdict} — ${report.verify.reason}`;
        // Say what the report ESTABLISHED, not a hopeful summary of it: `installed+trusted` used to
        // print verbatim even when the same line went on to report `trust: unknown` (the re-QE's
        // non-closure note). A message that argues with its own parenthesis teaches the reader to skip
        // the parenthesis.
        const established = report.trust === 'trusted' ? 'installed+trusted' : `installed, trust ${report.trust}`;
        stderr.push(`${label}: ${established}, NOT verified — ARMED = NO (trust: ${report.trust}, executable: ${report.executable}, verify: ${verdict})`);
        stderr.push('→ open an interactive Codex session in this directory, approve the two dz hooks, then re-run `dz hooks-sync --target codex --verify`');
    }
    else {
        stderr.push(`${label}: ARMED = NO — the managed entries are not present in the registry`);
    }
    return { ok: false, stdout, stderr };
}
/**
 * ADR-001 §8: `dz setup` and `dz init --target codex` DELIVER the hooks and verify them.
 *
 * Non-aborting by contract (ADR-002 D6): the caller keeps going and folds `ok` into its own exit
 * code. Before this round no production path called `runSyncCodexHooks` at all — the operation, its
 * classifier and its exit map existed and were reachable only from the dedicated command
 * (independent review, finding 2).
 */
/**
 * Serialize dz's own `hooks.json` read-merge-write behind the `codex-hooks` named lock
 * (feature qe-bridge-claude, ADR-001 D4-A — the exit condition of the accepted degradation in
 * `architecture/degradations.md`).
 *
 * The lock lives BESIDE the registry it guards (`$CODEX_HOME/.dz/locks/codex-hooks.lock`), not in
 * this repo: two dz processes running from two different worktrees share a `CODEX_HOME`, not a
 * project root, so a lock under the project would serialize nothing.
 *
 * READ-ONLY runs (`--check`) are NOT locked: they write nothing, and a check that can be blocked by
 * a writer would be a new failure mode in exchange for no guarantee.
 *
 * HONEST LIMIT: this is an ADVISORY lock. It serializes dz-side writers only; a foreign installer
 * (ruvnet-brain ships its own Codex hooks bundle) never takes it. For that case the pre-existing
 * mitigations remain the backstop — foreign entries preserved byte-for-byte, a timestamped backup
 * before every modifying write, and atomic temp+rename so no reader sees a partial file.
 */
function runSyncCodexHooksLocked(options = {}) {
    if (options?.check === true)
        return runSyncCodexHooks(options);
    const codexHome = resolveCodexHome(options?.codexHome);
    // AM-35a is a SHIPPED property with a test: a run that refuses (no `codex` on PATH) must leave
    // CODEX_HOME untouched — dz does not create user-global state for a runtime that is not there.
    // Taking the lock creates `<codexHome>/.dz/locks/`, so when the guarded operation turned out to
    // write nothing, the lock scaffolding is removed again (empty-dir removals only: a directory that
    // still holds another process's live lock simply refuses to go).
    const preexisting = existsSync(join(codexHome, '.dz'));
    const tidyLockScaffold = (report) => {
        if (preexisting || report.written || report.writes.length > 0)
            return;
        for (const dir of [join(codexHome, '.dz', 'locks'), join(codexHome, '.dz')]) {
            try {
                rmdirSync(dir);
            }
            catch { /* non-empty (someone else's lock) or gone — leave it */ }
        }
    };
    // ROUND-2 C2: the lock now wraps ONLY the registry read-plan-write transaction, passed in as the
    // operation's `criticalSection` seam. It used to wrap the WHOLE operation, including a live veto
    // probe that can block for ~300s — ten times the 30s stale threshold, after which a waiter is
    // entitled to break the lock and the holder is no longer excluding anyone. The probes mutate
    // nothing shared, so they run unlocked by design.
    let lockError = null;
    const report = runSyncCodexHooks({
        ...options,
        criticalSection: (fn) => {
            try {
                return withNamedLockSync(codexHome, 'codex-hooks', fn);
            }
            catch (error) {
                if (error instanceof NamedLockTimeoutError || error instanceof NamedLockCompromisedError) {
                    lockError = error;
                    throw error;
                }
                throw error;
            }
        },
    });
    tidyLockScaffold(report);
    if (lockError !== null)
        throw lockError;
    return report;
}
/** Wrap the delivery so a lock refusal becomes a REPORT (loud, nothing written), not a stack trace. */
function runSyncCodexHooksGuarded(options = {}) {
    const codexHome = resolveCodexHome(options?.codexHome);
    try {
        return runSyncCodexHooksLocked(options);
    }
    catch (error) {
        if (error instanceof NamedLockTimeoutError || error instanceof NamedLockCompromisedError) {
            const why = error instanceof NamedLockTimeoutError
                ? `another dz process is writing ${join(codexHome, 'hooks.json')} (${error.message}) — NOTHING was written; retry once it finishes`
                : `the codex-hooks lock was broken while this run held it (${error.message}) — the registry write may have raced; re-run and re-verify`;
            return {
                codexHome,
                registryPath: join(codexHome, 'hooks.json'),
                installed: false,
                executable: false,
                written: false,
                removed: 0,
                foreignPreserved: 0,
                unattributable: 0,
                drift: [],
                trust: 'unknown',
                codexVersion: null,
                writes: [],
                verify: null,
                verified: false,
                ready: false,
                exitCode: 1,
                warnings: [],
                errors: [why],
            };
        }
        throw error;
    }
}
export function deliverCodexHooks(input, sync = runSyncCodexHooksGuarded, label = 'dz setup') {
    const report = sync(codexHooksSyncOptions(input));
    const summary = codexHooksSummary(report, label);
    const stderr = [...report.errors.map((e) => `${label}: ${e}`), ...report.warnings.map((w) => `${label}: warning: ${w}`), ...summary.stderr];
    return { ok: summary.ok, stdout: summary.stdout, stderr, report };
}
function cmdAgentsSync(options, flags, cwd, write, writeErr) {
    const json = flags.has('json');
    const usage = 'dz agents-sync [--project <dir>] [--check] [--json]';
    if (flags.has('help')) {
        write(`${usage} — sync/verify the dz:policies fence in root AGENTS.md`);
        return 0;
    }
    for (const flag of flags) {
        if (!['check', 'json', 'help'].includes(flag)) {
            const message = `dz agents-sync: unknown option --${flag}\n${usage}`;
            (json ? write : writeErr)(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : message);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key !== 'project') {
            const message = key.startsWith('_positional_') ? `unexpected argument ${JSON.stringify(options.get(key))}` : `unknown option --${key}`;
            (json ? write : writeErr)(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz agents-sync: ${message}\n${usage}`);
            return 1;
        }
    }
    const root = resolve(cwd, options.get('project') ?? '.');
    try {
        const report = runSyncAgentsPolicy({ projectRoot: root, check: flags.has('check') });
        const drifted = report.drift.filter((finding) => finding.status !== 'ok');
        const inconclusive = report.missing.length > 0;
        const failed = flags.has('check')
            ? report.changed || report.budget.overflow || drifted.length > 0
            : !report.inSync;
        const exitCode = inconclusive ? 3 : failed ? 1 : 0;
        if (json) {
            write(JSON.stringify({ ...report, sections: report.blocks, exitCode }));
            return exitCode;
        }
        if (inconclusive) {
            writeErr(`dz agents-sync: INCONCLUSIVE — unreadable or unanchored policy source(s): ${report.missing.join(', ')}`);
            writeErr('→ heal with: restore the named source anchors, then run dz agents-sync');
            return 3;
        }
        if (failed) {
            const effect = flags.has('check') ? 'AGENTS.md would change' : 'AGENTS.md was not rewritten';
            writeErr(`dz agents-sync: DRIFT — ${drifted.length} stale/missing section(s); ${effect}`);
            for (const finding of drifted)
                writeErr(`  ${finding.id}: ${finding.file} (${finding.status})`);
            if (drifted.some((finding) => finding.id === 'dz:policies')) {
                writeErr('→ heal with: repair duplicate/unmatched dz:policies markers, then run dz agents-sync');
            }
            else {
                writeErr('→ heal with: dz agents-sync');
            }
            return 1;
        }
        const verb = report.written ? 'wrote' : 'in sync';
        write(`dz agents-sync: ${verb} — ${report.blocks.length} policy section(s), ${report.budget.bytes} bytes (${report.budget.pct}% of ${report.budget.cap})`);
        for (const warning of report.warnings)
            writeErr(`dz agents-sync: warning: ${warning}`);
        return 0;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (json)
            write(JSON.stringify({ error: message, exitCode: 1 }));
        else
            writeErr(`dz agents-sync: ${message}`);
        return 1;
    }
}
function cmdDriftCheck(options, flags, cwd, write) {
    const root = resolve(cwd, options.get('project') ?? '.');
    // Default scope = PUBLISHED packages only: the `.claude/skills` dogfood copies legitimately lag the
    // published version (the repo's own `dz sync` test says so), and the dangerous drift (goap,
    // brutal-honesty) was always package-to-package. `--all` includes `.claude/skills` (raw audit).
    const scope = flags.has('all') ? 'all' : 'packages';
    const allowlist = readDriftAllowlist(root);
    const r = sweepSkillDrift(root, { scope, allowlist });
    if (flags.has('json')) {
        // The signature verdicts were printed in the TEXT output and absent from the JSON, so a CI job
        // parsing `--json` saw `drifted: 0` and concluded all was well while packs were TAMPERED. A gate
        // silent in the form CI reads is not a gate (MEASURED 2026-08-21: keys were duplicated, drifted,
        // allowlisted, scope, allowlist — and nothing else).
        const sig = collectPackVerification(root, options.get('pubkey'));
        const sigBlocking = sig.packs.filter((c) => decideVerifyPolicy(c.verdict, flags.has('require-signing')).action === 'fail').length;
        write(JSON.stringify({ ...r, scope, allowlist, signatures: sig }));
        return r.drifted.length > 0 || sigBlocking > 0 ? 1 : 0;
    }
    write(`Skills duplicated across ≥2 ${scope === 'packages' ? 'package' : ''} locations: ${r.duplicated}`);
    if (r.allowlisted.length > 0) {
        write(`allowlisted (accepted drift): ${r.allowlisted.map((d) => d.name).join(', ')}`);
    }
    write(`DRIFTED (unexpected, byte-differences between copies): ${r.drifted.length}`);
    let driftExit = 0;
    if (r.drifted.length === 0) {
        write('✓ no unexpected intra-monorepo skill drift');
    }
    else {
        write('');
        write('skill'.padEnd(34) + 'copies  drift/total');
        for (const d of r.drifted) {
            write(d.name.padEnd(34) +
                String(d.copies).padStart(4) +
                '    ' +
                `${d.driftFiles}/${d.totalFiles}` +
                (d.missingFiles ? ` (+${d.missingFiles} missing)` : ''));
        }
        write('');
        write('→ fix each: heal drift, then commit. Remediation per skill:');
        for (const d of r.drifted) {
            const hasMeta = existsSync(join(root, 'packages', '@dzhechkov', 'skills-meta', d.name));
            write(hasMeta
                ? `    dz sync-canonical ${d.name}`
                : `    dz sync-canonical ${d.name} --from <a-known-good-copy>   (no skills-meta canonical)`);
        }
        write('  (accept a drift intentionally: add its name to .dz/drift-allowlist.json with a reason)');
        driftExit = 1; // EXIT CODE 1 = the CI gate trips
    }
    // Supplementary CI check: installed-pack signatures. A TAMPERED pack trips the gate (fatal); an unsigned
    // pack or a missing trust root is reported, not fatal — the same warn/block posture as `dz doctor` (the
    // primary signature gate). drift-check surfaces it so the CI drift view also flags a tampered pack.
    write('');
    const sigFatal = reportPackVerification(root, options.get('pubkey'), flags.has('require-signing'), write);
    return driftExit || sigFatal;
}
const DEFAULT_STORE_CAP = 5000;
/**
 * Ceiling on how many changed files the no-stubs scan reads per evaluation. Deterministic (the file
 * list is `git status` order) and fail-open: files beyond it simply have no gathered contents, so
 * the rule reports nothing for them — a pre-flight must never become a filesystem sweep.
 */
const MAX_STUB_SCAN_FILES = 400;
/** Read the optional `.dz/guard.json` — `{ rules?: [...], storeCap?: number, stubWaivers?: [...] }`. Missing/broken ⇒ defaults. */
function loadGuardConfig(root) {
    const p = join(root, '.dz', 'guard.json');
    if (!existsSync(p))
        return {};
    try {
        const j = JSON.parse(readFileSync(p, 'utf8'));
        return j && typeof j === 'object' ? j : {};
    }
    catch {
        return {};
    }
}
/** Extract labelled (a,b) count pairs from the READMEs that must agree (the parity invariant, inline). */
function gatherReadmeCounts(root) {
    const read = (rel) => { try {
        return readFileSync(join(root, rel), 'utf8');
    }
    catch {
        return '';
    } };
    const rootMd = read('README.md');
    const cliMd = read('packages/@dzhechkov/harness-cli/README.md');
    const num = (s, re) => { const m = s.match(re); return m && m[1] ? Number(m[1]) : null; };
    const pairs = [];
    const cjm = num(rootMd, /## User Journey — 6 phases, (\d+) commands/);
    const cliAll = num(cliMd, /## All Commands \((\d+)\)/);
    const rootAll = num(rootMd, /## All Commands \((\d+)\)/);
    if (cjm !== null && cliAll !== null)
        pairs.push({ label: 'commands (root CJM header vs cli All Commands)', a: cjm, b: cliAll });
    if (rootAll !== null && cliAll !== null)
        pairs.push({ label: 'All Commands (root vs cli)', a: rootAll, b: cliAll });
    // sitedoc in the readme-first contour (feature sitedoc-readme-first, ADR-001 + Codex QE AM-3/AM-4):
    // the docs SITE carries the same command count as the cli README. A MISSING file skips its pair
    // (target repo without sitedoc — missing-evidence contract). But a file that EXISTS and no longer
    // matches its anchored pattern emits a MISMATCH pair (a: -1) — silent non-extraction is the exact
    // disease this contour cures (AM-1 applies to the guard path too, not only the CI test).
    const sitePair = (rel, re, label) => {
        if (cliAll === null || !existsSync(join(root, rel)))
            return;
        const found = num(read(rel), re);
        pairs.push({ label, a: found ?? -1, b: cliAll });
    };
    sitePair('packages/@dzhechkov/sitedoc/src/content/docs/cli/overview.md', /^description: All (\d+) dz commands/m, 'commands (docs-site CLI overview description vs cli All Commands)');
    sitePair('packages/@dzhechkov/sitedoc/src/content/docs/index.mdx', /^\s*tagline: "[^"]*?(\d+) commands/m, 'commands (docs-site index hero tagline vs cli All Commands)');
    return pairs;
}
const MAX_VOLUME_FILES_PER_SCOPE = 512;
const MAX_VOLUME_BYTES_PER_SCOPE = 32 * 1024 * 1024;
const CYRILLIC_CHARACTER = /\p{Script=Cyrillic}/u;
function volumePathInside(root, candidate) {
    return candidate === root || candidate.startsWith(root + sep);
}
function cyrillicUtf8Bytes(buffer) {
    let bytes = 0;
    for (const character of buffer.toString('utf8')) {
        if (CYRILLIC_CHARACTER.test(character))
            bytes += Buffer.byteLength(character, 'utf8');
    }
    return bytes;
}
function gatherTemplateVolumeTarget(packageDir, target) {
    const templateRoot = join(packageDir, 'templates', '.claude');
    if (!existsSync(templateRoot))
        return undefined;
    const files = [];
    const realFiles = new Set();
    let totalBytes = 0;
    let failure;
    let packageReal;
    let templateReal;
    try {
        packageReal = realpathSync(packageDir);
        templateReal = realpathSync(templateRoot);
        if (!volumePathInside(packageReal, templateReal)) {
            failure = { reason: 'template-root-escape', detail: templateRoot };
        }
    }
    catch (error) {
        return {
            target,
            files,
            collection: { complete: false, reason: 'template-root-unreadable', detail: error instanceof Error ? error.message : String(error) },
        };
    }
    const fail = (reason, detail) => {
        failure ??= { reason, detail: detail.replace(/\s+/g, ' ').slice(0, 240) };
    };
    const addFile = (absolute, kind) => {
        if (failure !== undefined)
            return;
        if (files.length >= MAX_VOLUME_FILES_PER_SCOPE) {
            fail('template-file-cap-exceeded', `${MAX_VOLUME_FILES_PER_SCOPE} files`);
            return;
        }
        try {
            const stat = lstatSync(absolute);
            if (!stat.isFile()) {
                fail('template-input-not-regular', absolute);
                return;
            }
            const real = realpathSync(absolute);
            if (!volumePathInside(templateReal, real)) {
                fail('template-input-escape', absolute);
                return;
            }
            if (realFiles.has(real)) {
                fail('template-input-duplicate', absolute);
                return;
            }
            if (stat.size <= 0 || stat.size > MAX_VOLUME_BYTES_PER_SCOPE - totalBytes) {
                fail(stat.size <= 0 ? 'template-input-empty' : 'template-byte-cap-exceeded', absolute);
                return;
            }
            const content = readFileSync(absolute);
            if (content.byteLength <= 0 || content.byteLength > MAX_VOLUME_BYTES_PER_SCOPE - totalBytes) {
                fail(content.byteLength <= 0 ? 'template-input-empty' : 'template-byte-cap-exceeded', absolute);
                return;
            }
            realFiles.add(real);
            totalBytes += content.byteLength;
            files.push({
                path: relative(packageDir, absolute).split(sep).join('/'),
                kind,
                bytes: content.byteLength,
                cyrillicUtf8Bytes: cyrillicUtf8Bytes(content),
            });
        }
        catch (error) {
            fail('template-input-unreadable', `${absolute}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const scanFlat = (name) => {
        const dir = join(templateRoot, name);
        if (!existsSync(dir) || failure !== undefined)
            return;
        try {
            for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
                if (!entry.name.endsWith('.md'))
                    continue;
                addFile(join(dir, entry.name), name);
            }
        }
        catch (error) {
            fail('template-directory-unreadable', `${dir}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const scanSkills = (dir) => {
        if (!existsSync(dir) || failure !== undefined)
            return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        }
        catch (error) {
            fail('template-directory-unreadable', `${dir}: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        for (const entry of entries) {
            if (failure !== undefined)
                return;
            const absolute = join(dir, entry.name);
            if (entry.isSymbolicLink()) {
                fail('template-input-not-regular', absolute);
                return;
            }
            if (entry.isDirectory())
                scanSkills(absolute);
            else if (entry.name === 'SKILL.md')
                addFile(absolute, 'skills');
        }
    };
    scanFlat('rules');
    scanFlat('commands');
    scanSkills(join(templateRoot, 'skills'));
    files.sort((a, b) => a.path.localeCompare(b.path));
    return {
        target,
        files,
        collection: failure === undefined
            ? { complete: true }
            : { complete: false, reason: failure.reason, detail: failure.detail },
    };
}
function volumeGitText(root, args, allowedStatuses = [0]) {
    const result = spawnSync('git', [...args], {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.status === null || !allowedStatuses.includes(result.status)) {
        throw result.error ?? new Error(`git ${args[0] ?? ''} exited ${String(result.status)}`);
    }
    return result.stdout ?? '';
}
function parseGuardStatusPaths(root) {
    const text = volumeGitText(root, ['status', '--porcelain', '-uall']);
    return text.split('\n').flatMap((line) => {
        if (line.length < 4)
            return [];
        const code = line.slice(0, 2);
        const raw = line.slice(3).trim();
        const path = (raw.includes(' -> ') ? raw.split(' -> ')[1] : raw)?.trim();
        return path ? [{ code, path }] : [];
    });
}
function parseFeatureTier(text) {
    const match = text.match(/^##\s+Tier:\s*(S|M|L|XL)\s*$/m);
    return match?.[1];
}
function parseFeatureActiveSteps(text) {
    const section = text.match(/^## Active steps[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/mi)?.[1];
    if (section === undefined)
        return undefined;
    const steps = [...section.matchAll(/\b(?:10|[0-9](?:\.5)?)\b/g)].map((match) => match[0]);
    return [...new Set(steps)];
}
function featureLifecycle(root, slug, assessment) {
    if (assessment !== undefined && /^Lifecycle:\s*complete\s*$/mi.test(assessment))
        return { phase: 'complete' };
    try {
        const state = JSON.parse(readFileSync(join(root, '.dz', 'feature-adr', 'learning-state', `${slug}.json`), 'utf8'));
        const match = typeof state.step === 'string' ? state.step.match(/\bStep\s+(\d+(?:\.5)?)/i) : null;
        if (!match?.[1])
            return undefined;
        const current = Number(match[1]);
        if (!Number.isFinite(current))
            return undefined;
        return { phase: 'in-progress', completedThroughStep: current <= 0 ? 0 : Math.ceil(current) - 1 };
    }
    catch {
        return undefined;
    }
}
function gatherFeatureVolumeFact(root, slug) {
    const featureDir = join(root, 'features', slug);
    const artifacts = [];
    const contents = new Map();
    let totalBytes = 0;
    let failure;
    let rootReal;
    let featureReal;
    try {
        rootReal = realpathSync(root);
        featureReal = realpathSync(featureDir);
        if (!volumePathInside(rootReal, featureReal))
            failure = { reason: 'feature-root-escape', detail: featureDir };
    }
    catch (error) {
        return { fact: {
                slug,
                artifacts,
                collection: { complete: false, reason: 'feature-root-unreadable', detail: error instanceof Error ? error.message : String(error) },
            } };
    }
    const fail = (reason, detail) => {
        failure ??= { reason, detail: detail.replace(/\s+/g, ' ').slice(0, 240) };
    };
    const addArtifact = (absolute) => {
        if (failure !== undefined)
            return;
        if (artifacts.length >= MAX_VOLUME_FILES_PER_SCOPE) {
            fail('feature-file-cap-exceeded', `${MAX_VOLUME_FILES_PER_SCOPE} files`);
            return;
        }
        try {
            const stat = lstatSync(absolute);
            if (!stat.isFile()) {
                fail('feature-input-not-regular', absolute);
                return;
            }
            const real = realpathSync(absolute);
            if (!volumePathInside(featureReal, real)) {
                fail('feature-input-escape', absolute);
                return;
            }
            if (stat.size <= 0 || stat.size > MAX_VOLUME_BYTES_PER_SCOPE - totalBytes) {
                fail(stat.size <= 0 ? 'feature-input-empty' : 'feature-byte-cap-exceeded', absolute);
                return;
            }
            const content = readFileSync(absolute);
            if (content.byteLength <= 0 || content.byteLength > MAX_VOLUME_BYTES_PER_SCOPE - totalBytes) {
                fail(content.byteLength <= 0 ? 'feature-input-empty' : 'feature-byte-cap-exceeded', absolute);
                return;
            }
            const path = relative(featureDir, absolute).split(sep).join('/');
            totalBytes += content.byteLength;
            contents.set(path, content);
            artifacts.push({ path, bytes: content.byteLength });
        }
        catch (error) {
            fail('feature-input-unreadable', `${absolute}: ${error instanceof Error ? error.message : String(error)}`);
        }
    };
    const scanNested = (dir) => {
        if (!existsSync(dir) || failure !== undefined)
            return;
        let entries;
        try {
            entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        }
        catch (error) {
            fail('feature-directory-unreadable', `${dir}: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        for (const entry of entries) {
            if (failure !== undefined)
                return;
            const absolute = join(dir, entry.name);
            if (entry.isSymbolicLink()) {
                fail('feature-input-not-regular', absolute);
                return;
            }
            if (entry.isDirectory())
                scanNested(absolute);
            else
                addArtifact(absolute);
        }
    };
    try {
        const entries = readdirSync(featureDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            if (failure !== undefined)
                break;
            const absolute = join(featureDir, entry.name);
            if (entry.name === '03_adr' || entry.name === '07_code_changes') {
                if (entry.isSymbolicLink() || !entry.isDirectory())
                    fail('feature-input-not-regular', absolute);
                else
                    scanNested(absolute);
            }
            else if (entry.name === 'README.md' || /^0[0-9](?:[_.-][^/]*)?\.md$/.test(entry.name)) {
                addArtifact(absolute);
            }
        }
    }
    catch (error) {
        fail('feature-directory-unreadable', `${featureDir}: ${error instanceof Error ? error.message : String(error)}`);
    }
    artifacts.sort((a, b) => a.path.localeCompare(b.path));
    const assessment = contents.get('00_complexity_assessment.md')?.toString('utf8');
    const tier = assessment !== undefined ? parseFeatureTier(assessment) : undefined;
    const activeSteps = assessment !== undefined ? parseFeatureActiveSteps(assessment) : undefined;
    const lifecycle = featureLifecycle(root, slug, assessment);
    const fact = {
        slug,
        ...(tier !== undefined ? { tier } : {}),
        ...(activeSteps !== undefined ? { activeSteps } : {}),
        namedConsumers: [],
        ...(lifecycle !== undefined ? { lifecycle } : {}),
        artifacts,
        collection: failure === undefined
            ? { complete: true }
            : { complete: false, reason: failure.reason, detail: failure.detail },
    };
    const manifestText = contents.get('07_code_changes/change_manifest.md')?.toString('utf8');
    return { fact, ...(manifestText !== undefined ? { manifestText } : {}) };
}
function manifestPaths(text, slug) {
    const paths = new Set();
    for (const line of text.split('\n')) {
        const match = line.match(/^\s*-\s+`?([^`]+?)`?(?:\s+[—-]\s+.*)?$/);
        if (!match?.[1])
            continue;
        const path = match[1].trim().replace(/\\/g, '/').replace(/^\.\//, '');
        if (path === '' || path.startsWith('/') || path.split('/').some((part) => part === '..'))
            continue;
        if (path.startsWith(`features/${slug}/`))
            continue;
        paths.add(path);
    }
    return [...paths].sort();
}
function attributableDiff(root, slug, feature, status, changedSlugs) {
    if (changedSlugs.length !== 1 || changedSlugs[0] !== slug) {
        return { attributable: false, reason: changedSlugs.length > 1 ? 'ambiguous-feature-attribution' : 'feature-not-attributable' };
    }
    if (feature.manifestText === undefined)
        return { attributable: false, reason: 'change-manifest-unavailable' };
    const listed = manifestPaths(feature.manifestText, slug);
    const changedByPath = new Map(status.map((item) => [item.path, item.code]));
    const changed = listed.filter((path) => changedByPath.has(path));
    if (changed.length === 0)
        return { attributable: true, bytes: 0, base: 'HEAD', head: 'working-tree', method: 'git-unified-diff-bytes/v1', excludedFeaturePath: `features/${slug}/**` };
    const tracked = [];
    const untracked = [];
    for (const path of changed) {
        const absolute = resolve(root, path);
        if (!volumePathInside(root, absolute))
            return { attributable: false, reason: 'manifest-path-escape' };
        if (changedByPath.get(path) === '??') {
            try {
                const stat = lstatSync(absolute);
                const real = realpathSync(absolute);
                if (!stat.isFile() || !volumePathInside(root, real) || stat.size > MAX_VOLUME_BYTES_PER_SCOPE) {
                    return { attributable: false, reason: 'untracked-diff-input-refused' };
                }
            }
            catch {
                return { attributable: false, reason: 'untracked-diff-input-unreadable' };
            }
            untracked.push(path);
        }
        else {
            tracked.push(path);
        }
    }
    let bytes = 0;
    try {
        if (tracked.length > 0) {
            const diff = volumeGitText(root, ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', ...tracked]);
            bytes += Buffer.byteLength(diff, 'utf8');
        }
        for (const path of untracked) {
            const diff = volumeGitText(root, ['diff', '--no-index', '--binary', '--', '/dev/null', resolve(root, path)], [0, 1]);
            bytes += Buffer.byteLength(diff, 'utf8');
            if (bytes > MAX_VOLUME_BYTES_PER_SCOPE)
                return { attributable: false, reason: 'diff-byte-cap-exceeded' };
        }
    }
    catch {
        return { attributable: false, reason: 'git-diff-failed' };
    }
    return {
        attributable: true,
        bytes,
        base: 'HEAD',
        head: 'working-tree',
        method: 'git-unified-diff-bytes/v1',
        excludedFeaturePath: `features/${slug}/**`,
    };
}
function gatherVolumeShadowFacts(root, packages) {
    const templates = packages
        .filter((item) => !item.privateFlag)
        .sort((a, b) => a.name.localeCompare(b.name) || a.dir.localeCompare(b.dir))
        .flatMap((item) => {
        const fact = gatherTemplateVolumeTarget(join(root, item.dir), item.name);
        return fact === undefined ? [] : [fact];
    });
    let status;
    try {
        status = parseGuardStatusPaths(root);
    }
    catch {
        return templates.length > 0 ? { templates } : {};
    }
    const slugs = [...new Set(status.flatMap((item) => {
            const match = item.path.match(/^features\/([^/]+)\//);
            return match?.[1] ? [match[1]] : [];
        }))].sort();
    const gathered = slugs.slice(0, 32).map((slug) => gatherFeatureVolumeFact(root, slug));
    const measuredFeatures = gathered.map((feature) => ({
        ...feature.fact,
        diff: attributableDiff(root, feature.fact.slug, feature, status, slugs),
    }));
    const cappedFeatures = slugs.slice(32).map((slug) => ({
        slug,
        artifacts: [],
        collection: {
            complete: false,
            reason: 'feature-scope-cap-exceeded',
            detail: 'only the first 32 lexicographically sorted changed feature scopes were traversed',
        },
    }));
    const features = [...measuredFeatures, ...cappedFeatures];
    return {
        ...(templates.length > 0 ? { templates } : {}),
        ...(features.length > 0 ? { features } : {}),
    };
}
/** Gather the facts one op needs. All I/O is best-effort — a missing signal skips its rule, never crashes. */
function gatherGuardFacts(op, root, text, storeCap) {
    const facts = { op };
    if (op === 'publish') {
        // Advisory I/O: unreadable telemetry or fed state is absence of evidence, never a fabricated
        // stale finding and never a publish blocker.
        try {
            const routing = readRoutingTelemetry(root);
            facts['routingFreshness'] = { unfedRunIds: unfedRuns(routing.harvest.samples, routing.alreadyFed) };
        }
        catch { /* fail-open: routing-store-stale is SOFT and needs gathered evidence */ }
        // marketplace-parity: regenerate the two published showcase manifests from the LIVE registry,
        // but redirect every write to a unique temp root. Version is operator-owned, so pinning the
        // published value into generatePlugin makes the comparison composition-only by construction.
        try {
            const showcaseDir = join(root, '.claude-plugin');
            if (!existsSync(showcaseDir)) {
                facts['marketplaceParity'] = { applicable: false };
            }
            else {
                const pluginPath = join(showcaseDir, 'plugin.json');
                const marketplacePath = join(showcaseDir, 'marketplace.json');
                const hasPlugin = existsSync(pluginPath);
                const hasMarketplace = existsSync(marketplacePath);
                const manifestFailures = [];
                const readManifest = (path, file) => {
                    try {
                        return JSON.parse(readFileSync(path, 'utf8'));
                    }
                    catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        manifestFailures.push({ file, error: message.replace(/\s+/g, ' ').slice(0, 240) });
                        return undefined;
                    }
                };
                const versionOf = (manifest) => {
                    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
                        return undefined;
                    const version = manifest['version'];
                    return typeof version === 'string' && version !== '' ? version : undefined;
                };
                const publishedPlugin = hasPlugin ? readManifest(pluginPath, 'plugin.json') : undefined;
                const publishedMarketplace = hasMarketplace ? readManifest(marketplacePath, 'marketplace.json') : undefined;
                const marketplaceRecord = publishedMarketplace && typeof publishedMarketplace === 'object' && !Array.isArray(publishedMarketplace)
                    ? publishedMarketplace
                    : undefined;
                const marketplacePlugins = marketplaceRecord !== undefined && Array.isArray(marketplaceRecord['plugins'])
                    ? marketplaceRecord['plugins']
                    : [];
                const publishedVersion = versionOf(publishedPlugin)
                    ?? versionOf(publishedMarketplace)
                    ?? versionOf(marketplacePlugins[0]);
                if (manifestFailures.length > 0) {
                    facts['marketplaceParity'] = {
                        applicable: true,
                        manifestFailures,
                        ...(publishedVersion !== undefined ? { publishedVersion } : {}),
                    };
                }
                else if (hasPlugin !== hasMarketplace) {
                    facts['marketplaceParity'] = {
                        applicable: true,
                        onlyOnePresent: true,
                        ...(publishedVersion !== undefined ? { publishedVersion } : {}),
                    };
                }
                else if (!hasPlugin) {
                    facts['marketplaceParity'] = { applicable: false };
                }
                else {
                    let scratch;
                    try {
                        const registry = buildRegistry(root);
                        scratch = mkdtempSync(join(tmpdir(), 'dz-guard-marketplace-'));
                        const generated = generatePlugin(scratch, registry, { version: publishedVersion });
                        const freshPlugin = JSON.parse(readFileSync(generated.pluginJsonPath, 'utf8'));
                        const freshMarketplace = JSON.parse(readFileSync(generated.marketplaceJsonPath, 'utf8'));
                        facts['marketplaceParity'] = {
                            applicable: true,
                            diverged: !isDeepStrictEqual(publishedPlugin, freshPlugin)
                                || !isDeepStrictEqual(publishedMarketplace, freshMarketplace),
                            ...(publishedVersion !== undefined ? { publishedVersion } : {}),
                        };
                    }
                    catch {
                        facts['marketplaceParity'] = {
                            applicable: true,
                            regenerateFailed: true,
                            ...(publishedVersion !== undefined ? { publishedVersion } : {}),
                        };
                    }
                    finally {
                        if (scratch !== undefined)
                            rmSync(scratch, { recursive: true, force: true });
                    }
                }
            }
        }
        catch { /* fail-open only on unexpected showcase-discovery failure; manifest read/parse errors are structured violations above */ }
        // agents-md-policy-sync: fixed registry, no tree walk. The pure detector
        // recomputes every expected hash from current source text; this gatherer
        // only supplies bytes. Any unexpected gather failure omits the fact, and
        // evaluateGuard records that advisory coverage gap in `notes`.
        try {
            const policyFiles = new Map();
            for (const file of new Set(POLICY_SOURCES.map((source) => source.file))) {
                try {
                    policyFiles.set(file, readFileSync(join(root, file), 'utf8'));
                }
                catch {
                    policyFiles.set(file, null);
                }
            }
            let agentsMd = null;
            try {
                agentsMd = readFileSync(join(root, 'AGENTS.md'), 'utf8');
            }
            catch { /* missing stamp evidence */ }
            const policyDrift = detectPolicyDrift(policyFiles, agentsMd, POLICY_SOURCES);
            facts['policyDrift'] = {
                applicable: policyDrift.applicable,
                // Did this repo OPT IN? A `dz:policies` fence in AGENTS.md is the only durable signal that
                // someone ran `dz agents-sync` here. Without it the advisory rule is out of scope and stays
                // silent; with it, unreadable sources become a loud note instead of a silent skip.
                fenced: hasPolicyFence(agentsMd),
                drifted: policyDrift.findings
                    .filter((finding) => finding.status !== 'ok')
                    .map((finding) => `${finding.id}:${finding.file}:${finding.status}`),
            };
        }
        catch { /* unexpected gather failure — omission becomes a visible guard note */ }
        const manifests = [];
        const located = [];
        try {
            const out = volumeGitText(root, ['ls-files', 'packages/@dzhechkov/*/package.json']);
            for (const rel of out.split('\n').map((s) => s.trim()).filter(Boolean)) {
                try {
                    const m = JSON.parse(readFileSync(join(root, rel), 'utf8'));
                    manifests.push(m);
                    located.push({ dir: rel.replace(/\/package\.json$/, ''), m });
                }
                catch { /* skip unreadable */ }
            }
        }
        catch { /* not a git repo */ }
        const versionByName = new Map();
        for (const m of manifests)
            if (m.name && typeof m.version === 'string')
                versionByName.set(m.name, m.version);
        const pnpmWorkspace = existsSync(join(root, 'pnpm-workspace.yaml'));
        const packages = [];
        for (const m of manifests) {
            if (m.private === true)
                continue; // unpublished packages are exempt
            const deps = {};
            for (const [dep, spec] of Object.entries(m.dependencies ?? {})) {
                deps[dep] = (typeof spec === 'string' && spec.startsWith('workspace:') && pnpmWorkspace && versionByName.has(dep))
                    ? versionByName.get(dep) // pnpm rewrites this to a real semver at publish → safe
                    : spec; // non-pnpm, or an unresolvable workspace dep → keep raw so the rule catches a would-ship-raw dep
            }
            packages.push({ name: m.name ?? '(unnamed)', deps });
        }
        facts['packages'] = packages;
        facts['volume'] = gatherVolumeShadowFacts(root, located.map(({ dir, m }) => ({
            dir,
            name: m.name ?? dir,
            privateFlag: m.private === true,
        })));
        // licence-hold (ADR-001, hermes-claude-adaptation): for each pack DECLARING a hold via a
        // `licenseHold` field, hand the raw evidence to the pure checker. Best-effort: an unreadable
        // LICENSE reads as absent (null), which the checker treats as a violation for a publishable
        // pack — the fail direction that protects the hold, never the publish.
        try {
            const holds = [];
            for (const { dir, m } of located) {
                if (!m || m.licenseHold === undefined || m.licenseHold === null)
                    continue;
                const read = (rel) => {
                    try {
                        return readFileSync(join(root, dir, rel), 'utf8');
                    }
                    catch {
                        return null;
                    }
                };
                holds.push({
                    name: m.name ?? dir,
                    privateFlag: m.private === true,
                    licenseText: read('LICENSE'),
                    noticesText: read('THIRD_PARTY_NOTICES.md') ?? read('THIRD_PARTY_NOTICES'),
                    licenseField: typeof m.license === 'string' ? m.license : null,
                });
            }
            facts['licenceHold'] = holds;
        }
        catch { /* unreadable tree — the rule reports nothing rather than inventing a violation */ }
        try {
            facts['drift'] = sweepSkillDrift(root, { scope: 'installs', allowlist: readDriftAllowlist(root) }).drifted.map((d) => d.name);
        }
        catch { /* skip */ }
        facts['counts'] = gatherReadmeCounts(root);
        // readme-first: from the WORKING-TREE diff (publishes happen pre-commit here), per package: does the
        // change set contain its package.json (the version-bump signal) without its README.md?
        try {
            const status = execSync('git status --porcelain -- "packages/@dzhechkov/"', { cwd: root, encoding: 'utf-8' });
            const perPack = new Map();
            for (const line of status.split('\n')) {
                const m = line.match(/packages\/@dzhechkov\/([^/]+)\/(.+)$/);
                if (!m || !m[1] || !m[2])
                    continue;
                const e = perPack.get(m[1]) ?? { pkgJson: false, readme: false };
                if (m[2] === 'package.json')
                    e.pkgJson = true;
                if (m[2] === 'README.md')
                    e.readme = true;
                perPack.set(m[1], e);
            }
            facts['readmeFirst'] = [...perPack.entries()].map(([name, e]) => ({ name: '@dzhechkov/' + name, versionBumped: e.pkgJson, readmeChanged: e.readme }));
        }
        catch { /* not a git repo — rule skips */ }
        // review-round: the same WORKING-TREE diff, asked a different question — does a package that
        // bumps its version and changes SOURCE bring a GRADED QE report with it? Scoped to source so a
        // docs-only republish is never blocked (ADR-001, features/publish-needs-a-review). A throw here
        // leaves the whole fact undefined, and the rule then reports NOTHING: absence of a report is an
        // accusation, absence of facts is ignorance, and they must not render the same.
        try {
            const status = execSync('git status --porcelain -uall', { cwd: root, encoding: 'utf-8' });
            const changed = status.split('\n').map((l) => l.slice(3).trim()).filter(Boolean);
            const perPack = new Map();
            for (const rel of changed) {
                const m = rel.match(/^packages\/@dzhechkov\/([^/]+)\/(.+)$/);
                if (!m || !m[1] || !m[2])
                    continue;
                const e = perPack.get(m[1]) ?? { versionBumped: false, sourceChanged: false };
                if (m[2] === 'package.json')
                    e.versionBumped = true;
                // SOURCE = what ships and can be wrong at runtime. Tests, docs and fixtures are excluded:
                // a test-only change still ships, but it is not the class the review gate is about, and
                // widening the scope is what makes a HARD gate get switched off.
                if (/^(src|lib|bin|skills)\//.test(m[2]) && !/\.(md|json|txt)$/.test(m[2]))
                    e.sourceChanged = true;
                perPack.set(m[1], e);
            }
            const grades = [];
            for (const rel of changed) {
                if (!/^features\/[^/]+\/08_qe_report\.md$/.test(rel))
                    continue;
                let text;
                try {
                    text = readFileSync(join(root, rel), 'utf-8');
                }
                catch {
                    continue;
                }
                // The grade the report itself STATES — `grade C`, `GRADE: B`, `**grade: A**`. A report that
                // never states one is not evidence (AM-2), so nothing is pushed for it.
                const m = text.match(/\bgrade\s*:?\s*\**\s*([ABCDF])\b/i);
                if (m && m[1])
                    grades.push({ report: rel, grade: m[1] });
            }
            const cfgMin = loadGuardConfig(root).reviewRound?.minGrade;
            const minGrade = typeof cfgMin === 'string' ? cfgMin : undefined;
            facts['reviewRound'] = {
                packages: [...perPack.entries()].map(([name, e]) => ({ name: '@dzhechkov/' + name, ...e })),
                grades,
                gathered: true,
                ...(minGrade !== undefined ? { minGrade } : {}),
            };
        }
        catch {
            // TRIED and could not read the tree. Say so on the record rather than passing silently: a HARD
            // gate that is quiet about ungathered evidence cannot be told from one that checked (raised by
            // cross-family review). It still does not BLOCK — ignorance is not an accusation.
            facts['reviewRound'] = { packages: [], grades: [], gathered: false };
        }
        // skills-registrable: every skill dir in a skill pack must carry a depth-1 SKILL.md, or it ships
        // registering nowhere (the health-advisor 1.2.0 class). Pure-toolkit packages yield nothing.
        try {
            const packsDir = join(root, 'packages', '@dzhechkov');
            const packs = readdirSync(packsDir, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name);
            const skillPacks = [];
            for (const pack of packs) {
                const nonRegistrable = findNonRegistrableSkillDirs(join(packsDir, pack));
                if (nonRegistrable.length > 0)
                    skillPacks.push({ name: '@dzhechkov/' + pack, nonRegistrable });
            }
            facts['skillPacks'] = skillPacks;
        }
        catch { /* unreadable packages dir — rule reports nothing rather than inventing a violation */ }
        // lockfile-in-sync: the ERR_PNPM_OUTDATED_LOCKFILE class — a @dzhechkov/* dep spec bumped in a
        // package.json while pnpm-lock.yaml still records the old specifier. FAIL-OPEN by construction: an
        // unreadable/unparseable lockfile yields `{parsed:false}` and the rule reports NOTHING.
        try {
            const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
            const importers = parsePnpmLockImporters(lockText);
            if (importers === undefined) {
                facts['lockfile'] = { parsed: false };
            }
            else {
                const rows = located
                    .map(({ dir, m }) => {
                    const declared = {};
                    for (const [dep, spec] of Object.entries({ ...(m.dependencies ?? {}), ...(m.devDependencies ?? {}) })) {
                        if (dep.startsWith('@dzhechkov/') && typeof spec === 'string')
                            declared[dep] = spec;
                    }
                    return { importer: dir, declared, locked: importers[dir] };
                })
                    .filter((r) => Object.keys(r.declared).length > 0);
                facts['lockfile'] = { parsed: true, importers: rows };
            }
        }
        catch {
            facts['lockfile'] = { parsed: false }; /* no lockfile (not a pnpm workspace) — rule stays silent */
        }
        // change: the working-tree diff — the notion of "changed" shared by PROMOTED (template) rules
        // and the no-stubs rule. (readme-first gathers its OWN pathspec-scoped porcelain call above and
        // does not read this fact — so the -uall widening below does not alter readme-first at all;
        // its collapsed-untracked-dir blind spot for a brand-new package dir is a separate, documented
        // limit of THAT gatherer.) Without this fact a rule written by
        // `dz guard promote --apply` would be INERT — present in the config and enforcing nothing.
        // Contents are read for the globs an active `format-match` rule asks about PLUS the changed
        // files the no-stubs scan reads (its explicit extension allowlist, capped: a pathological
        // change-set must not turn a pre-flight into a filesystem sweep — beyond the cap the rule
        // simply sees no contents for the excess files, the standing fail-open contract).
        try {
            // -uall (FN-1): without it, a brand-new DIRECTORY reports as one collapsed `?? newdir/` line
            // and every file INSIDE it is invisible to the change fact — and a fresh module directory is
            // the most stub-prone artifact there is (REPRODUCED: newdir/stub.ts with a live marker ⇒
            // PASS/0 findings). -uall lists the individual files; `.gitignore` semantics are unchanged
            // (git status never lists ignored paths, -uall or not — tested live). maxBuffer is raised
            // (default 1MB) because -uall can expand a huge untracked tree into a long listing; KNOWN
            // LIMIT: a listing beyond even this bound throws, the catch below drops the whole `change`
            // fact, and no-stubs + every template rule go silently fail-open together for that run.
            const status = execSync('git status --porcelain -uall', { cwd: root, encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
            const files = status
                .split('\n')
                .map((l) => l.slice(3).trim())
                .map((p) => (p.includes(' -> ') ? p.split(' -> ')[1].trim() : p)) // renames: the destination is the changed path
                .filter((p) => p !== '');
            const formatGlobs = (Array.isArray(loadGuardConfig(root).rules) ? loadGuardConfig(root).rules : [])
                .filter((r) => r?.template === 'format-match' && typeof r?.params?.file === 'string')
                .map((r) => r.params.file);
            const stubScannable = files.filter((f) => scannableStubPath(f));
            const stubWanted = new Set(stubScannable.slice(0, MAX_STUB_SCAN_FILES));
            // FN-7: fail-open must not be fail-SILENT. Count every stub-scannable changed file whose
            // contents we do NOT gather (beyond the cap here; deleted/non-regular/oversize/read-error
            // below) — the no-stubs rule surfaces the count as ONE aggregate note, never a violation.
            let stubSkipped = stubScannable.length - stubWanted.size;
            const contents = {};
            if (formatGlobs.length > 0 || stubWanted.size > 0) {
                for (const f of files) {
                    const wanted = stubWanted.has(f);
                    if (!wanted && !formatGlobs.some((g) => globMatch(g, f)))
                        continue;
                    const abs = resolve(root, f);
                    // Containment: a `git status` path is repo-relative, but `..` in one must never let the
                    // LIVE reader step outside the repo the HISTORICAL reader is confined to.
                    if (abs !== root && !abs.startsWith(root + sep)) {
                        if (wanted)
                            stubSkipped++;
                        continue;
                    }
                    try {
                        // lstat, NOT stat (Codex QE MED-3). `git show <sha>:<path>` yields the SYMLINK TARGET
                        // TEXT, never the file it points at, so a live reader that follows links answers a
                        // different question than the replay — and `/dev/zero` behind a symlink hangs the read.
                        // Skipping non-regular files restores replay/live equivalence and closes the DoS.
                        const st = lstatSync(abs);
                        if (!st.isFile()) {
                            if (wanted)
                                stubSkipped++;
                            continue;
                        }
                        if (st.size > MAX_CONTENT_BYTES) {
                            if (wanted)
                                stubSkipped++;
                            continue;
                        } // too large to be a spec file — undecidable, never guessed
                        contents[f] = readFileSync(abs, 'utf8');
                    }
                    catch {
                        if (wanted)
                            stubSkipped++; /* deleted — leave it undecidable, never guess */
                    }
                }
            }
            facts['change'] = { files, ...(Object.keys(contents).length > 0 ? { contents } : {}), ...(stubSkipped > 0 ? { stubSkipped } : {}) };
        }
        catch { /* not a git repo — every template rule stays silent (fail-open) */ }
        // no-stubs config waivers: `.dz/guard.json` `stubWaivers: [{path, reason}]` — path-keyed, reason
        // MANDATORY (the feature-adr-setup --guards shape; the pure checker refuses a reasonless entry).
        const stubWaivers = loadGuardConfig(root).stubWaivers;
        if (Array.isArray(stubWaivers))
            facts['stubWaivers'] = stubWaivers;
    }
    if (op === 'consolidate') {
        try {
            facts['drift'] = sweepSkillDrift(root, { scope: 'installs', allowlist: readDriftAllowlist(root) }).drifted.map((d) => d.name);
        }
        catch { /* skip */ }
    }
    if (op === 'teach' || op === 'consolidate') {
        if (op === 'teach' && text)
            facts['secretTargets'] = [{ label: 'lesson', text }];
        let count = 0;
        try {
            count = loadStorePatternsSync(root).length;
        }
        catch { /* skip → cap never trips */
            count = 0;
        }
        facts['store'] = { count, cap: storeCap };
    }
    return facts;
}
/**
 * Load config → resolve rules → gather facts → evaluate → append the audit record. The ONE evaluation path,
 * shared by `dz guard check` and the `dz publish` pre-flight (ADR-002 option A) so they can never disagree.
 * `overrideReason` (when the caller forces through a block) is logged, never silent.
 */
function runGuardEvaluation(root, op, text, overrideReason) {
    const cfg = loadGuardConfig(root);
    // Number.isFinite, not just > 0: a config `storeCap: 1e400` parses to Infinity, passes `> 0`, and would
    // silently DISABLE the cap (count <= Infinity always). Non-finite ⇒ fall back to the default.
    const storeCap = typeof cfg.storeCap === 'number' && Number.isFinite(cfg.storeCap) && cfg.storeCap > 0 ? cfg.storeCap : DEFAULT_STORE_CAP;
    const rules = resolveRules(Array.isArray(cfg.rules) ? cfg.rules : undefined);
    const facts = gatherGuardFacts(op, root, text, storeCap);
    const result = evaluateGuard(facts, rules);
    // audit (append-only). ts is real time here (a CLI, not the sandboxed workflow).
    try {
        const rec = auditRecord(result, new Date().toISOString(), overrideReason !== undefined ? { reason: overrideReason } : undefined);
        mkdirSync(join(root, '.dz'), { recursive: true });
        const auditPath = join(root, '.dz', 'guard-audit.jsonl');
        // event-chain (ADR-001): seq + prevHash derived from the LAST LINE ONLY — this file is the
        // evidence base `dz guard promote` decides on, and a rewrite that loses or duplicates a record
        // must not be able to look intact. A tail that cannot be read starts a MARKED segment rather
        // than blocking the audit: the verdict is never held hostage to a broken log.
        writeFileSync(auditPath, appendChainedLines([rec], readLogTail(auditPath)), { flag: 'a' });
    }
    catch { /* audit is best-effort, never blocks the verdict */ }
    return result;
}
function renderGuardObservation(observation) {
    const tag = observation.status === 'unknown' ? 'note' : 'observe';
    return `  [${tag}] ${observation.rule} ${observation.scope}: ${observation.detail} [${observation.status}]`;
}
/**
 * The tail facts of an append-only log, read from its END — O(1) in the file size, which is what
 * lets the chain be extended on every append without a full-file scan (FR-2). Anything unreadable
 * yields {@link EMPTY_LOG_TAIL}; the caller then starts a marked segment rather than blocking.
 */
function readLogTail(path) {
    let fd;
    try {
        if (!existsSync(path))
            return EMPTY_LOG_TAIL;
        fd = openSync(path, 'r');
        const size = fstatSync(fd).size;
        if (!Number.isFinite(size) || size <= 0)
            return EMPTY_LOG_TAIL;
        const want = Math.min(size, EVENT_CHAIN_TAIL_BYTES);
        const buf = Buffer.alloc(want);
        readSync(fd, buf, 0, want, size - want);
        return readTailInfo(buf.toString('utf-8'), { partial: want < size });
    }
    catch {
        // A read FAILURE is not an empty file (Codex re-QE LOW): EMPTY_LOG_TAIL means "there is
        // nothing", which lets the writer open an UNMARKED genesis on a file we merely failed to
        // read. An unreadable tail must force a marked reset, per the AM-6 contract.
        return { ...EMPTY_LOG_TAIL, unreadable: true };
    }
    finally {
        if (fd !== undefined) {
            try {
                closeSync(fd);
            }
            catch { /* nothing to do */ }
        }
    }
}
// ── `dz guard promote` (feature guard-promotion, scout idea #1) ─────────────────────────────────
const PROMOTIONS_DIR = join('features', 'guard-promotion', 'promotions');
const PROMOTION_STATE_FILE = join('.dz', 'promotion-state.json');
/**
 * Ceiling on a single file read, applied IDENTICALLY to the historical (`git show`) and live
 * (working-tree) readers. A `format-match` target is a spec/manifest file; anything larger is not
 * one, and an unbounded read of a symlinked `/dev/zero` is a hang, not a measurement.
 */
const MAX_CONTENT_BYTES = 1024 * 1024;
const GUARD_PROMOTE_USAGE = [
    'dz guard promote [--project <dir>] [--json] [--dry-run | --apply]',
    '                 [--window-days <N>] [--periods <N>] [--limit <N>]',
].join('\n  ');
/**
 * Read real commit history as {@link ChangeSet}s — the shadow-replay corpus. `--name-only` gives the
 * change shape every v1 template consumes. Merges are excluded (their file list is a union of the
 * branches, not a decision anyone made).
 *
 * A missing/failing `git` yields `[]`, which makes every candidate `insufficient-data` — the command
 * still exits 0 and says why. No history is not a promotion.
 */
function readGitChanges(root, sinceIso) {
    let out = '';
    try {
        // execFileSync (argv form), NOT a shell string: `--name-only` paths come straight from the repo,
        // and a filename containing `$(…)` or a backtick would EXPAND inside a double-quoted shell
        // argument. `-z` is not used because the pretty header needs line framing; the argv form removes
        // the shell entirely instead.
        out = execFileSync('git', ['log', `--since=${sinceIso}`, '--no-merges', '--name-only', '--pretty=format:%x01%H%x09%cI'], {
            cwd: root,
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
    }
    catch {
        return [];
    }
    const changes = [];
    let current = null;
    for (const raw of out.split('\n')) {
        if (raw.startsWith('\x01')) {
            if (current)
                changes.push(current);
            const [id, ts] = raw.slice(1).split('\t');
            current = { id: (id ?? '').slice(0, 12), ts: ts ?? '', files: [] };
            continue;
        }
        const line = raw.trim();
        if (line === '' || current === null)
            continue;
        current.files.push(line);
    }
    if (current)
        changes.push(current);
    return changes;
}
/**
 * Attach file text at each historical commit for the `format-match` candidates that need it.
 *
 * HARD CAP (`MAX_CONTENT_FETCHES`): over it we STOP fetching, which leaves those changes without
 * contents, which makes `templateFires` return `undecidable`, which makes the candidate
 * `insufficient-data`. What we deliberately do NOT do is fall back to the file's CURRENT content —
 * evaluating a historical commit against today's file is exactly the fabricated-win shape ADR-002
 * refused for `presence-check`.
 */
function attachChangeContents(root, changes, globs) {
    if (globs.length === 0)
        return [...changes];
    let budget = MAX_CONTENT_FETCHES;
    return changes.map((c) => {
        const wanted = c.files.filter((f) => globs.some((g) => globMatch(g, f)));
        if (wanted.length === 0)
            return c;
        const contents = {};
        for (const f of wanted) {
            if (budget <= 0)
                return c; // over cap ⇒ leave this change undecidable, never guess
            budget -= 1;
            try {
                // argv form, NOT a shell string: a repo path is untrusted input and `$(…)`/backticks would
                // expand inside a quoted shell argument. No `--` terminator — `git show -- <rev>:<path>`
                // exits 0 with EMPTY output (the terminator turns the rev-with-path into a pathspec). The
                // option-smuggling risk it would have covered is absent anyway: the argument always begins
                // with a 12-hex sha.
                const text = execFileSync('git', ['show', `${c.id}:${f}`], { cwd: root, encoding: 'utf-8', maxBuffer: MAX_CONTENT_BYTES });
                // Same size ceiling as the live reader, so replay and live agree on what is too big to judge.
                if (text.length > MAX_CONTENT_BYTES)
                    return c;
                // EMPTY OUTPUT IS NOT CONTENT. git reported this path as changed in this commit, so an
                // empty body is far more likely a failed lookup than a genuinely empty file — and treating
                // it as content is the worst possible failure: `''.includes(x)` is false, so the rule would
                // FIRE on every single file and fabricate a clean sweep of wins. Undecidable instead.
                if (text === '')
                    return c;
                contents[f] = text;
            }
            catch {
                return c; // deleted/renamed at that commit — undecidable, not clean
            }
        }
        return { ...c, contents };
    });
}
/** Every rule the engine would run: the built-ins plus any template rules already in `.dz/guard.json`. */
function existingRuleViews(root) {
    const cfg = loadGuardConfig(root);
    const configRules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const disabled = new Set(configRules.filter((r) => r?.enabled === false && typeof r.id === 'string').map((r) => r.id));
    // A built-in the operator has DISABLED does not cover anything — otherwise the promoter would
    // refuse a candidate as a duplicate of a rule that is not running, and the gap would stay open.
    const views = DEFAULT_RULES.filter((r) => !disabled.has(r.id)).map((r) => ({ id: r.id }));
    for (const o of configRules) {
        if (typeof o?.id !== 'string' || o.enabled === false)
            continue;
        // A rule op-scoped AWAY from publish covers nothing a change-shaped promotion targets — letting
        // it suppress a candidate as a "duplicate" keeps the gap open (Codex re-QE MED, mirror of the
        // disabled-builtin rationale above).
        const ops = o.ops;
        if (Array.isArray(ops) && !ops.includes('publish'))
            continue;
        if (views.some((v) => v.id === o.id))
            continue;
        views.push({ id: o.id, ...(typeof o.template === 'string' ? { template: o.template } : {}), ...(o.params && typeof o.params === 'object' ? { params: o.params } : {}) });
    }
    return views;
}
/** Atomic JSON write — tmp + rename, so a crash mid-write never leaves a half-parsed state file. */
function writeJsonAtomic(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp.${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    renameSync(tmp, path);
}
/** The rolled-up refusal record (ADR-004): one file, regenerated in place, one row per lesson. */
function renderNotPromotableRollup(report, nowTs) {
    const refused = report.candidates.filter((c) => c.verdict === 'not-promotable');
    const out = [];
    out.push('# 000 — Not promotable (rolled-up refusal record)');
    out.push('');
    out.push(`**Decision:** REFUSED · **Date:** ${nowTs} · **Count:** ${refused.length} of ${report.totalLessons} lesson(s)`);
    out.push('');
    out.push('These lessons do not reduce to a v1 `dz guard promote` rule template. Rule code is NEVER');
    out.push('synthesised from lesson text (ADR-002), so a lesson that fits no template is refused aloud');
    out.push('rather than force-fitted. This file is regenerated in place on every run.');
    out.push('');
    out.push('| lesson | reason | first 90 chars |');
    out.push('|---|---|---|');
    for (const c of refused) {
        const t = c.lessonText.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 90);
        out.push(`| \`${c.lessonId}\` | ${c.reason.replace(/\|/g, '\\|')} | ${t} |`);
    }
    return out.join('\n') + '\n';
}
/**
 * `dz guard promote` — lesson → guard-rule promotion with a "win twice to promote" gate.
 *
 * Thin by design: gather (lessons, existing rules, real commit history, state) → the PURE
 * `assembleCandidates` → render → write. Default PROPOSES (documents + journal only); `--dry-run`
 * writes nothing at all; `--apply` is the only path that touches `.dz/guard.json`, always SOFT.
 */
function cmdGuardPromote(options, flags, root, write) {
    const json = flags.has('json');
    const fail = (msg) => {
        write(json ? JSON.stringify({ error: msg, exitCode: 1 }) : `dz guard promote: ${msg}\n  usage: ${GUARD_PROMOTE_USAGE}`);
        return 1;
    };
    for (const f of flags)
        if (!['json', 'dry-run', 'apply', 'help'].includes(f))
            return fail(`unknown option --${f}`);
    for (const k of options.keys()) {
        if (k === '_positional_0')
            continue; // the `promote` subcommand token itself
        if (k.startsWith('_positional_'))
            return fail(`unexpected argument "${options.get(k)}"`);
        if (!['project', 'window-days', 'periods', 'limit'].includes(k))
            return fail(`unknown option --${k}`);
    }
    if (flags.has('help')) {
        write(`dz guard promote — promote a learned lesson to a deterministic guard rule\n  usage: ${GUARD_PROMOTE_USAGE}`);
        write('  A candidate must SHADOW-WIN twice consecutively over real commit history before it is proposed.');
        write('  Default: writes proposal/refusal documents only. --dry-run: writes nothing. --apply: writes the SOFT rule into .dz/guard.json.');
        return 0;
    }
    const dryRun = flags.has('dry-run');
    const apply = flags.has('apply');
    // NOT a silent precedence: two contradictory intents is an error, not a coin flip.
    if (dryRun && apply)
        return fail('--dry-run and --apply are mutually exclusive');
    const num = (key, dflt, lo, hi) => {
        const raw = options.get(key);
        if (raw === undefined)
            return dflt;
        const n = Number(raw);
        if (!Number.isFinite(n) || !Number.isInteger(n) || n < lo || n > hi)
            return null;
        return n;
    };
    const windowDays = num('window-days', DEFAULT_WINDOW_DAYS, 1, 365);
    if (windowDays === null)
        return fail('--window-days expects an integer in [1, 365]');
    const periods = num('periods', DEFAULT_PERIODS, 2, 52);
    if (periods === null)
        return fail('--periods expects an integer in [2, 52]');
    const limit = num('limit', 15, 1, 1000);
    if (limit === null)
        return fail('--limit expects an integer in [1, 1000]');
    const nowTs = new Date().toISOString();
    const sinceIso = new Date(Date.now() - windowDays * periods * 86_400_000).toISOString();
    // lessons — the SAME readers `dz compounding` uses; no second store.
    const lessons = loadStoreRecords(root).map((r) => ({
        dzId: r.id,
        text: typeof r.text === 'string' ? r.text : '',
        quarantined: readQuarantineState(r).quarantined,
        uses: readReinforcementState(r).uses,
    }));
    const existingRules = existingRuleViews(root);
    const changes = readGitChanges(root, sinceIso);
    // State is read on EVERY run, including --dry-run, because it carries the LOCAL-clock `firstSeen`
    // the elapsed gate reads (MED-7). --dry-run still writes nothing — which is exactly why a
    // dry-run-only workflow never starts that clock, and the wait reason says so.
    const state = normalizePromotionState((() => {
        try {
            return JSON.parse(readFileSync(join(root, PROMOTION_STATE_FILE), 'utf-8'));
        }
        catch {
            return null;
        }
    })());
    const firstSeen = {};
    for (const [id, e] of Object.entries(state.entries))
        if (e.firstSeenTs !== '')
            firstSeen[id] = e.firstSeenTs;
    // Pass 1 discovers which `format-match` candidates exist, so contents are fetched only for the
    // globs that actually need them (and only up to the cap).
    const pass1 = assembleCandidates({ lessons, existingRules, changes, nowTs, windowDays, periods, firstSeen });
    const formatGlobs = [...new Set(pass1.candidates.filter((c) => c.template === 'format-match' && typeof c.params?.file === 'string').map((c) => c.params.file))];
    const report = formatGlobs.length === 0
        ? pass1
        : assembleCandidates({ lessons, existingRules, changes: attachChangeContents(root, changes, formatGlobs), nowTs, windowDays, periods, firstSeen });
    // ── write side ────────────────────────────────────────────────────────────────────────────────
    const written = [];
    const applied = [];
    const conflicts = [];
    if (!dryRun) {
        const adrSeqs = {};
        let seq = state.nextAdrSeq;
        let allocated = 0;
        for (const c of report.candidates) {
            if (c.verdict !== 'promote' && c.verdict !== 'duplicate')
                continue;
            const key = c.ruleId;
            // ONE document per CANDIDATE, not per run — but the reused thing is the integer SEQUENCE, never
            // a path. State is attacker-shaped input (a JSON file anyone can corrupt), and a path taken
            // from it and handed to writeFileSync overwrites whatever it names — with no `--apply`, no
            // promotion, and no way to notice. The path is DERIVED from the validated id + that integer.
            const existingSeq = state.entries[key]?.adrSeq;
            const useSeq = existingSeq ?? seq;
            const rel = promotionAdrRelPath(key, useSeq);
            if (rel === null)
                continue; // an id or sequence that fails validation writes NOTHING
            if (existingSeq === undefined) {
                seq += 1;
                allocated += 1;
            }
            // Belt to the derivation's braces: resolve and assert containment before writing. A derivation
            // that is correct today is not a substitute for checking the thing you are about to write.
            const abs = resolve(root, rel);
            const dir = resolve(root, PROMOTIONS_DIR);
            if (abs !== dir && !abs.startsWith(dir + sep))
                continue;
            try {
                mkdirSync(dirname(abs), { recursive: true });
                // Lexical containment is not PHYSICAL containment (Codex re-QE HIGH): a symlinked
                // promotions/ directory (or a symlink planted at the ADR leaf) redirects the write outside
                // the repo while every string check passes. realpath the directory that actually exists on
                // disk and require it to be the real promotions dir under the real root; refuse a leaf that
                // is a symlink.
                const realDir = realpathSync(dirname(abs));
                const expectedReal = join(realpathSync(root), PROMOTIONS_DIR.split('/').join(sep));
                if (realDir !== expectedReal)
                    continue;
                if (existsSync(abs) && lstatSync(abs).isSymbolicLink())
                    continue;
                writeFileSync(abs, renderPromotionAdr(c, useSeq, nowTs), 'utf-8');
                adrSeqs[key] = useSeq;
                written.push(rel);
            }
            catch { /* a document we cannot write must not lose the verdict */ }
        }
        if (report.candidates.some((c) => c.verdict === 'not-promotable')) {
            const rel = join(PROMOTIONS_DIR, '000-not-promotable.md');
            try {
                mkdirSync(join(root, PROMOTIONS_DIR), { recursive: true });
                writeFileSync(join(root, rel), renderNotPromotableRollup(report, nowTs), 'utf-8');
                written.push(rel);
            }
            catch { /* best-effort */ }
        }
        if (apply) {
            const cfg = loadGuardConfig(root);
            const rules = Array.isArray(cfg.rules) ? [...cfg.rules] : [];
            for (const c of report.candidates) {
                if (c.verdict !== 'promote' || c.proposedRule === null)
                    continue;
                const want = c.proposedRule;
                const clash = rules.find((r) => r?.id === want.id);
                if (clash !== undefined) {
                    // ID EQUALITY IS NOT IDEMPOTENCE (Codex QE MED-5). A rule that merely SHARES the id — a
                    // hand-written bare entry, or a same-id rule with different params — is not the rule we
                    // are promoting. Skipping it silently reports "applied" while installing nothing (the bare
                    // entry does not even enforce, since resolveRules drops an unknown id with no template).
                    // Same id + same BODY is genuine idempotence; same id + different body is a conflict, and a
                    // conflict is refused out loud rather than resolved by guessing which side to keep.
                    const sameBody = clash.template === want.template && JSON.stringify(clash.params ?? null) === JSON.stringify(want.params);
                    // Same body but DISABLED (or op-scoped away from publish) is NOT idempotence: the rule
                    // exists on paper and enforces nothing — "already installed" would be a false success
                    // (Codex re-QE MED). Refuse loudly so the operator re-enables or removes it.
                    const clashEnabled = clash.enabled !== false;
                    const clashOps = clash.ops;
                    const clashCoversPublish = !Array.isArray(clashOps) || clashOps.includes('publish');
                    if (sameBody && clashEnabled && clashCoversPublish)
                        continue; // already installed AND active — genuine idempotence
                    if (sameBody) {
                        conflicts.push(`${want.id}: an identical rule exists in .dz/guard.json but is ${clashEnabled ? 'op-scoped away from publish' : 'DISABLED'} — it enforces nothing; re-enable it (or remove it and re-run --apply) instead of trusting a rule that is not running`);
                        continue;
                    }
                    conflicts.push(`${want.id}: an existing .dz/guard.json rule shares this id but has a different body (existing template=${JSON.stringify(clash.template ?? null)} params=${JSON.stringify(clash.params ?? null)}; promoted template=${JSON.stringify(want.template)} params=${JSON.stringify(want.params)}) — refusing to overwrite or to claim success; rename or remove the existing rule`);
                    continue;
                }
                rules.push(want);
                applied.push(want.id);
            }
            if (applied.length > 0)
                writeJsonAtomic(join(root, '.dz', 'guard.json'), { ...cfg, rules });
        }
        const next = nextPromotionState(state, report, nowTs, adrSeqs, allocated);
        const withApplied = applied.length === 0 ? next : {
            ...next,
            entries: Object.fromEntries(Object.entries(next.entries).map(([k, v]) => (applied.includes(k) ? [k, { ...v, appliedTs: nowTs }] : [k, v]))),
        };
        const withEvidence = recordPromotionRunEvidence(withApplied, report, nowTs);
        try {
            writeJsonAtomic(join(root, PROMOTION_STATE_FILE), withEvidence);
        }
        catch { /* best-effort */ }
    }
    // A refused conflict means the requested apply did NOT fully happen — exit non-zero rather than
    // let a zero exit report success for work that was deliberately not done.
    const exitCode = conflicts.length > 0 ? 1 : 0;
    if (json) {
        write(JSON.stringify({ ...report, mode: dryRun ? 'dry-run' : apply ? 'apply' : 'propose', written, applied, conflicts, exitCode }, null, 2));
        return exitCode;
    }
    write(renderPromotionReport(report, limit));
    write('');
    if (dryRun)
        write('  MODE: --dry-run — nothing was written (not even .dz/promotion-state.json)');
    else {
        write(`  WROTE: ${written.length === 0 ? '(no decisions to record)' : written.join(', ')}`);
        if (apply)
            write(`  APPLIED to .dz/guard.json: ${applied.length === 0 ? '(none)' : applied.join(', ')} — SOFT severity, always`);
        else
            write('  Nothing was written to .dz/guard.json — re-run with --apply to install the promoted rule(s).');
    }
    for (const c of conflicts)
        write(`  ✗ CONFLICT — ${c}`);
    return exitCode;
}
/**
 * `dz guard` — the declarative constraint layer that refuses a self-mutating op when a HARD invariant is
 * violated. Simple outside: `dz guard check --op publish` works with zero config (built-in defaults).
 *   check --op <publish|teach|consolidate|reindex> [--text <s>] [--json] [--force <reason>]
 *   --init     scaffold an editable .dz/guard.json (only if you want to customise)
 *   log [--limit N]   tail the append-only .dz/guard-audit.jsonl
 * Exit 1 on a HARD block (0 with --force <reason>, which is logged); 0 on warn/pass.
 */
function cmdGuard(options, flags, cwd, write) {
    let root = cwd;
    try {
        root = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not git */ }
    const sub = options.get('_positional_0') ?? 'check';
    if (flags.has('init') || sub === 'init') {
        const p = join(root, '.dz', 'guard.json');
        if (existsSync(p) && !flags.has('force')) {
            write(`dz guard --init: ${p} already exists (pass --force to overwrite)`);
            return 1;
        }
        const scaffold = {
            storeCap: DEFAULT_STORE_CAP,
            rules: DEFAULT_RULES.map((r) => ({ id: r.id, severity: r.severity, enabled: true, description: r.description })),
            // The scaffold QUOTES the stub marker names in the no-stubs rule description, and this file is
            // itself a scannable changed file the moment it is written — so it carries its own reasoned
            // waiver (explicit and justified, never a silent path skip).
            stubWaivers: [{ path: '.dz/guard.json', reason: 'the guard config quotes the stub marker names in the no-stubs rule description' }],
        };
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, JSON.stringify(scaffold, null, 2) + '\n');
        write(`dz guard --init: wrote ${p} (edit severity/enabled to customise; delete it to return to built-in defaults)`);
        return 0;
    }
    if (sub === 'log') {
        const p = join(root, '.dz', 'guard-audit.jsonl');
        if (!existsSync(p)) {
            write('dz guard log: no audit yet (.dz/guard-audit.jsonl)');
            return 0;
        }
        const limit = Math.max(1, Number(options.get('limit') ?? '20') || 20);
        // parse-filter BEFORE emitting: a corrupt line must not make the --json output invalid JSON.
        const rows = readFileSync(p, 'utf8').split('\n').filter(Boolean).slice(-limit)
            .map((row) => { try {
            return JSON.parse(row);
        }
        catch {
            return null;
        } })
            .filter((r) => r !== null);
        if (flags.has('json')) {
            write(JSON.stringify(rows));
            return 0;
        }
        for (const r of rows) {
            write(`${r.ts}  ${String(r.op).padEnd(11)} ${String(r.verdict).toUpperCase()}${r.override ? `  (forced: ${r.override.reason})` : ''}`);
        }
        return 0;
    }
    // `promote` — lesson → guard-rule promotion. It lives HERE, not as a top-level `dz promote`,
    // because its object IS a guard rule: its evidence is .dz/guard-audit.jsonl + real commit history
    // and its write target is .dz/guard.json (ADR-001).
    if (sub === 'promote')
        return cmdGuardPromote(options, flags, options.get('project') !== undefined ? resolve(cwd, options.get('project')) : root, write);
    if (sub !== 'check') {
        write(`dz guard: unknown subcommand '${sub}' — use: check --op <op> | promote | --init | log`);
        return 1;
    }
    // check
    const op = options.get('op');
    if (op === undefined || !['publish', 'teach', 'consolidate', 'reindex'].includes(op)) {
        write('dz guard check: --op must be one of publish | teach | consolidate | reindex');
        return 1;
    }
    const force = options.get('force');
    const forced = force !== undefined;
    const result = runGuardEvaluation(root, op, options.get('text'), force);
    if (flags.has('json')) {
        write(JSON.stringify({ ...result, forced }, null, 2));
        return guardExitCode(result, forced);
    }
    const glyph = result.verdict === 'block' ? '✗' : result.verdict === 'warn' ? '⚠' : '✓';
    write(`dz guard (${op}): ${glyph} ${result.verdict.toUpperCase()}  [checked: ${result.checked.join(', ') || 'no rules for this op'}]`);
    for (const observation of result.observations ?? [])
        write(renderGuardObservation(observation));
    for (const v of result.violations)
        write(`  [${v.severity === 'hard' ? 'BLOCK' : 'warn'}] ${v.rule}: ${v.detail}`);
    for (const n of result.notes ?? [])
        write(`  [note] ${n}`); // information, never a verdict input (FN-7)
    if (result.verdict === 'block' && forced)
        write(`  → forced through: ${force} (logged to .dz/guard-audit.jsonl)`);
    else if (result.verdict === 'block')
        write('  → blocked. Fix the HARD violation(s), or override with --force "<reason>" (logged).');
    return guardExitCode(result, forced);
}
/**
 * `dz sync-canonical <skill>` — the healer. Treats the resolved canonical (`--from` →
 * `skills-meta/<skill>` → `--auto` most-complete copy) as authoritative and overwrites every other
 * copy in the monorepo, proving byte-identity. `--check` reports drift and writes NOTHING (exit 1 on
 * drift) — the CI-safe dry-run.
 *
 * When NO canonical resolves (no `--from`, no `skills-meta`):
 *   • `--check` → canonical-free peer check: are the copies byte-identical to EACH OTHER? (exit 0
 *     identical / exit 1 drift) — makes `--check` useful for the ~half of shared skills with no
 *     `skills-meta` home.
 *   • bare write → REFUSES (exit 2, zero writes) — never guesses a canonical for a write.
 *   • `--auto` → picks the most-complete copy as canonical, prints a LOUD warning naming the pick +
 *     the exact overwrite list, then heals.
 */
function cmdSyncCanonical(options, flags, cwd, write) {
    const root = resolve(cwd, options.get('project') ?? '.');
    const skill = options.get('_positional_0');
    if (!skill) {
        write('dz sync-canonical: <skill> required');
        write('  usage: dz sync-canonical <skill> [--check] [--from <dir>] [--auto] [--project <dir>]');
        return 2;
    }
    const fromArg = options.get('from');
    const check = flags.has('check');
    const auto = flags.has('auto');
    const r = syncCanonicalSkill(root, skill, {
        check,
        auto,
        ...(fromArg !== undefined ? { from: resolve(cwd, fromArg) } : {}),
    });
    // Exit code, computed once so --json and the text paths never disagree.
    const exitCode = r.resolvedFrom === 'none'
        ? check
            ? r.copies < 2
                ? 0
                : r.drifted > 0
                    ? 1
                    : 0
            : 2 // bare write, no canonical → refuse
        : check
            ? r.drifted > 0
                ? 1
                : 0
            : 0;
    if (flags.has('json')) {
        write(JSON.stringify({ ...r, canonical: relative(root, r.canonical), wrote: r.wrote.map((w) => relative(root, w)) }));
        return exitCode;
    }
    // Always report HOW the canonical resolved (from | skills-meta | auto | none) — no invisible choice.
    write(`resolved: ${r.resolvedFrom}`);
    if (r.resolvedFrom === 'none') {
        if (check) {
            // CANONICAL-FREE peer check — compare the copies to each other (no privileged canonical).
            write(`no skills-meta canonical and no --from — comparing ${r.copies} copies to each other`);
            if (r.copies < 2) {
                write(`only ${r.copies} copy — nothing to compare (vacuously consistent)`);
                return 0;
            }
            if (r.drifted === 0) {
                write(`✓ all ${r.copies} copies are byte-identical`);
                return 0; // (a) canonical-free --check identical → exit 0 (was exit 2)
            }
            write(`✗ ${r.drifted} file(s) differ across copies (wrote nothing)`);
            return 1; // (b) canonical-free --check drift → exit 1
        }
        // Bare WRITE with no resolvable canonical → REFUSE. Safe-by-default: never guess (r.wrote is []).
        write(`dz sync-canonical: no canonical for "${skill}" (no skills-meta, no --from).`);
        write('  refusing to guess a canonical for a WRITE — a wrong pick would destroy the good copy.');
        write(`  • read-only check:       dz sync-canonical ${skill} --check`);
        write(`  • pick a known-good src:  dz sync-canonical ${skill} --from <dir>`);
        write(`  • auto-pick most complete (LOUD, opt-in): dz sync-canonical ${skill} --auto`);
        return 2; // unchanged "can't proceed" exit; ZERO writes
    }
    if (r.resolvedFrom === 'auto') {
        if (check) {
            // --auto --check: core wrote NOTHING (r.wrote is []); report drift vs the auto-picked canonical
            // and honor the --check exit contract (1 on drift) instead of the misleading "overwrote" banner.
            write(`auto-canonical (most complete) → ${relative(root, r.canonical)}`);
            write(r.drifted > 0
                ? `${r.drifted} copy(ies) drift from it (wrote nothing).`
                : `all ${r.copies} copies match it.`);
            return r.drifted > 0 ? 1 : 0;
        }
        // LOUD banner — name the picked canonical AND the exact overwrite list (the heal already ran).
        write('⚠ AUTO-CANONICAL — no skills-meta/--from; picked the MOST COMPLETE copy:');
        write(`⚠   canonical → ${relative(root, r.canonical)}`);
        write(`⚠   overwrote ${r.wrote.length} drifting copy(ies):`);
        for (const w of r.wrote)
            write(`⚠     ${relative(root, w)}`);
        write('⚠ completeness ≠ correctness — review the git diff before committing.');
        write(`synced ${r.synced}; ${r.copies - r.drifted} already matched.`);
        return 0;
    }
    // resolvedFrom === 'from' | 'skills-meta' — unchanged behavior.
    write(`canonical: ${relative(root, r.canonical)}`);
    write(`copies: ${r.copies}   drifted: ${r.drifted}`);
    if (check) {
        write(r.drifted > 0
            ? `${r.drifted} copy(ies) drift from canonical (wrote nothing).`
            : `all ${r.copies} copies match canonical.`);
        return r.drifted > 0 ? 1 : 0; // --check: report + exit 1 on drift, ZERO writes
    }
    for (const w of r.wrote)
        write(`  SYNCED ${relative(root, w)}`);
    write(`synced ${r.synced}; ${r.copies - r.drifted} already matched.`);
    return 0; // default: overwrite + prove identity, exit 0
}
function cmdPlugin(options, cwd, write) {
    const registry = buildRegistry(cwd);
    const version = options.get('version') ?? '0.1.0';
    const { pluginJsonPath, marketplaceJsonPath } = generatePlugin(cwd, registry, { version });
    write(`Generated Claude Plugin:`);
    write(`  ${pluginJsonPath}`);
    write(`  ${marketplaceJsonPath}`);
    write(`  ${registry.totalSkills} skills, ${registry.totalPacks} packs`);
    write(`\nInstall: claude plugin marketplace add djd1m/dz-harness-hub`);
    return 0;
}
async function cmdDownloads(cwd, write) {
    const packages = discoverPackages(cwd).map((p) => p.name);
    write(`Fetching npm downloads for ${packages.length} packages...`);
    const report = await fetchAllDownloads(packages);
    write(`\n╔══════════════════════════════════════════════════════╗`);
    write(`║            NPM DOWNLOADS — ${report.period.padEnd(20)}     ║`);
    write(`╠══════════════════════════════════════════════════════╣`);
    write(`║  Total: ${String(report.totalDownloads).padStart(6)}    Packages: ${String(report.packages.length).padStart(2)}                  ║`);
    write(`╠══════════════════════════════════════════════════════╣`);
    for (const pkg of report.packages) {
        const dl = String(pkg.downloads).padStart(6);
        const name = pkg.name.replace('@dzhechkov/', '').padEnd(25);
        const err = pkg.error ? ` (${pkg.error})` : '';
        write(`║  ${dl}  ${name}${err.padEnd(18)}║`);
    }
    write(`╚══════════════════════════════════════════════════════╝`);
    return 0;
}
/**
 * `dz architecture` — render the product map (subsystems = the 5 README jobs + foundation/arsenal/ops).
 *   --json          machine-readable map (or drift/сverka report with --revise/--check)
 *   --revise        drift check: tracked packages with no subsystem + commands owned by >1 subsystem (exit 1 on drift)
 *   --check         forward-looking сверка of a PROPOSED feature (feature-adr Step 0). Reads:
 *                     --slug <s> --desc "<text>" [--cmd a,b,c] [--subsystem <id>]
 *                   Exit 2 on a hard-stop (block), 0 on ok/soft-warn. Confidence-gated (ADR-001 Decision 3).
 * The pure engine lives in harness-core; this is the thin I/O shell (scan disk + git, render).
 */
function cmdArchitecture(options, flags, cwd, write) {
    // Resolve repo root: an explicit --project wins, then git toplevel, then cwd (matches cmdRoam /
    // cmdStats duality). The --project leg is the same fix as cmdProjectSkills got for field report
    // doc-25b, applied to its neighbour before it costs a second report: this command also reads an
    // `architecture/` tree, and on a feature-adr run against a target checkout the Step-0 product-vision
    // сверка silently no-ops for exactly that reason.
    const explicitRoot = (options.get('project') ?? '').trim();
    let repoRoot = explicitRoot !== '' ? resolve(cwd, explicitRoot) : cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || repoRoot;
    }
    catch { /* not a git repo — use the root as given */ }
    const manifest = loadSubsystemManifest(repoRoot);
    if (!manifest) {
        write('dz architecture: architecture/subsystems.manifest.json not found — run from the repo root.');
        return 1;
    }
    const map = buildArchitectureMap(manifest, scanWorkspacePackages(repoRoot));
    if (flags.has('check')) {
        const slug = options.get('slug') ?? options.get('_positional_0') ?? '';
        const description = options.get('desc') ?? options.get('description') ?? '';
        if (slug === '' && description === '') {
            write('dz architecture --check: needs --slug and/or --desc "<feature description>".');
            return 1;
        }
        const cmdRaw = options.get('cmd') ?? options.get('commands') ?? '';
        const proposedCommands = cmdRaw.split(',').map((s) => s.trim()).filter((s) => s !== '');
        const subsystem = options.get('subsystem');
        const result = checkFeatureAgainstArchitecture({ slug, description, proposedCommands, ...(subsystem ? { targetSubsystem: subsystem } : {}) }, map, loadProductVision(repoRoot));
        write(flags.has('json') ? JSON.stringify(result, null, 2) : renderArchCheck(result));
        return result.signal === 'block' ? 2 : 0; // 2 = hard-stop, scriptable at Step 0
    }
    if (flags.has('revise')) {
        const report = findArchitectureDrift(map, gitTrackedPackages(repoRoot));
        write(flags.has('json') ? JSON.stringify(report, null, 2) : renderDriftReport(report));
        return report.clean ? 0 : 1;
    }
    write(flags.has('json') ? JSON.stringify(map, null, 2) : renderMapHuman(map));
    return 0;
}
/**
 * `dz project-skills` — resolve the project manifest (`architecture/project-skills.json`) into per-stage
 * guidance for a polymorphic feature-adr run. The sandboxed feature-adr workflow can't import harness-core,
 * so it reads this command's `--stages-json` and folds each stage's guidance into that stage's prompt.
 *   (default)       human "who-injected" report
 *   --json          the full InjectionPlan
 *   --stages-json   { hasManifest, design, code, qe, report } — ready to thread into prompts
 * No manifest ⇒ empty guidance strings ⇒ byte-identical run (FR-7).
 */
function cmdProjectSkills(options, flags, cwd, write) {
    // `--project <dir>` names the root EXPLICITLY. Until 2026-08-25 this command took only `cwd`, so
    // the manifest was reachable exclusively from the workspace you happened to stand in — and because
    // the known-flag list is deliberately FLAT, `--project` passed validation on a command that never
    // read it: exit 0, no warning, no manifest. MEASURED that day: a feature-adr run against a target
    // repo probed with `cd REPO`, found nothing, and fell open to a generic run — the honest
    // `polymorphism:null` was recorded and not one project lens reached any stage.
    const explicitRoot = (options.get('project') ?? '').trim();
    let repoRoot = explicitRoot !== '' ? resolve(cwd, explicitRoot) : cwd;
    try {
        // stderr is SWALLOWED: a non-repo directory is an ordinary case here, and letting git print
        // "fatal: not a git repository" onto the operator's terminal made a working command look broken.
        // The sibling cmdFeatureAdrSetup already redirects; this one did not.
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || repoRoot;
    }
    catch { /* not a git repo — use the root as given */ }
    const plan = planProjectSkills(repoRoot);
    const hasManifest = plan.injections.length > 0 || plan.skipped.length > 0;
    if (flags.has('stages-json')) {
        write(JSON.stringify({
            hasManifest,
            design: guidanceForStage(plan, 'design'),
            code: guidanceForStage(plan, 'code'),
            qe: guidanceForStage(plan, 'qe'),
            report: renderInjectionReport(plan),
        }));
        return 0;
    }
    if (flags.has('json')) {
        write(JSON.stringify(plan, null, 2));
        return 0;
    }
    write(renderInjectionReport(plan));
    return 0;
}
/** Unscoped package names with ≥1 git-tracked file under packages/@dzhechkov/<name>/ (git-aware drift, FR-6). */
function gitTrackedPackages(repoRoot) {
    const set = new Set();
    try {
        const out = execSync('git ls-files packages/@dzhechkov', { cwd: repoRoot, encoding: 'utf-8' });
        for (const line of out.split('\n')) {
            const m = line.match(/^packages\/@dzhechkov\/([^/]+)\//);
            if (m && m[1])
                set.add(m[1]);
        }
    }
    catch { /* not a git repo — empty set fail-safes drift to clean rather than false-positive */ }
    return set;
}
/**
 * `dz mr-rakes` — mine the project review corpus (features' QE reports + REVIEW files) for RECURRING
 * mistakes ("rakes") and close them into self-learning (R3 mr-rake-analyzer, ADR-001).
 *   (default)               ranked rake report
 *   --json                  RakeReport as JSON
 *   --candidate N --confirmed N   recurrence thresholds (default 2 / 3)
 *   --teach                 sink A: auto dz-teach each CONFIRMED rake (reward by severity, domain "rake")
 *   --gen-critic <path>     sink B: render the confirmed-rakes project-critic section; PRINTS the block
 *   --apply                 with --gen-critic: WRITE/append the section to <path> (else propose-only)
 * Anti-noise (ADR-001 §3): a signature below the candidate threshold is a one-off, never a rake.
 */
async function cmdMrRakes(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not a git repo — use cwd */ }
    const candidate = Number.parseInt(options.get('candidate') ?? '', 10);
    const confirmed = Number.parseInt(options.get('confirmed') ?? '', 10);
    const thresholds = {
        candidate: Number.isFinite(candidate) && candidate > 0 ? candidate : DEFAULT_RAKE_THRESHOLDS.candidate,
        confirmed: Number.isFinite(confirmed) && confirmed > 0 ? confirmed : DEFAULT_RAKE_THRESHOLDS.confirmed,
    };
    const report = analyzeCorpus(repoRoot, thresholds);
    if (flags.has('json')) {
        write(JSON.stringify(report, null, 2));
        return 0;
    }
    write(renderRakeReport(report));
    const confirmedRakes = report.rakes.filter((r) => r.status === 'confirmed');
    // Sink B — propose (or --apply) the project-critic section.
    const criticPath = options.get('gen-critic');
    if (criticPath !== undefined) {
        const section = renderCriticSection(report);
        if (flags.has('apply')) {
            const abs = resolve(repoRoot, criticPath);
            const prev = existsSync(abs) ? readFileSync(abs, 'utf-8') : '';
            writeFileSync(abs, (prev.trim() === '' ? '' : prev.replace(/\n*$/, '\n\n')) + section + '\n');
            write(`\n↳ wrote project-critic section to ${criticPath} (${confirmedRakes.length} confirmed rake(s))`);
        }
        else {
            write('\n── proposed project-critic section (pass --apply to write) ──\n' + section);
        }
    }
    // Sink A — auto-teach confirmed rakes to the durable store (reuses the real teach path).
    if (flags.has('teach')) {
        if (confirmedRakes.length === 0) {
            write('\n↳ --teach: no confirmed rakes to teach.');
            return 0;
        }
        write(`\n↳ --teach: storing ${confirmedRakes.length} confirmed rake(s) in the learned store…`);
        for (const rake of confirmedRakes) {
            const opts = new Map([
                ['_positional_0', rakeAsLesson(rake)],
                ['reward', String(rakeReward(rake))],
                ['domain', 'rake'],
                ['type', 'lesson-learned'],
            ]);
            if (options.has('project'))
                opts.set('project', options.get('project'));
            if (options.has('to'))
                opts.set('to', options.get('to')); // same reason as in cmdRetro
            await cmdTeach(opts, new Set(['guard']), cwd, write);
        }
    }
    return 0;
}
/**
 * `dz retro` — per-session retrospective + co-learning (R4 session-retro-colearn, ADR-001). Mines the
 * current session transcript for recurring PROCESS rakes, drills the user (socratic + checklist), and
 * teaches/reinforces the agent — from the same mistake. The recurrence ledger IS the dz-teach store.
 *   [transcript-path]   the session JSONL (default: the project's latest roam transcript)
 *   --json              Retro as JSON
 *   --threshold N       drill threshold (default 2 — anti-noise: a first-seen rake accrues, never drills)
 *   --no-teach          drill only; do NOT write the store (skip the agent side)
 *   --project <dir>     pin the teach ledger
 *   --install-hook      print the opt-in SessionEnd hook to add (non-destructive)
 */
async function cmdRetro(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not git */ }
    if (flags.has('install-hook')) {
        write('Add this opt-in SessionEnd hook to .claude/settings.json (runs a retro when a session ends):');
        write(JSON.stringify({ hooks: { SessionEnd: [{ hooks: [{ type: 'command', command: 'dz retro' }] }] } }, null, 2));
        return 0;
    }
    const transcript = options.get('_positional_0') ?? findLatestTranscript(repoRoot);
    if (!transcript) {
        write('dz retro: no session transcript found — pass a path, or run from a project with roam state.');
        return 1;
    }
    const events = streamSessionEvents(transcript);
    const hits = detectProcessRakes(events);
    // Ledger: count prior 'retro'-domain records per signature in the dz-teach store.
    // It MUST be read from the store the co-learning write below will append to. A session mode
    // (`DZ_LEARN=global`) once split the two — the count was read from the project while the record
    // landed in the home store, so the recurrence never advanced and the drill threshold could never
    // be reached (cross-family QE, 2026-08-27). A read and its write resolve the same way, or the
    // counter they share is a fiction.
    let ledgerRoot;
    try {
        ledgerRoot = resolveLearningStore(options, cwd).storeRoot;
    }
    catch (e) {
        // Refuse HERE rather than after the whole retro has been rendered — the same refusal the
        // teach below would raise, but before any work is spent on it.
        if (e instanceof TeachTargetError) {
            write('dz retro: ' + e.message);
            return 1;
        }
        throw e;
    }
    const ledger = new Map();
    try {
        const records = loadStorePatternsSync(ledgerRoot).filter((r) => r.domain === RETRO_DOMAIN);
        for (const sig of PROCESS_SIGNATURES) {
            const lesson = retroLessonText(sig.id);
            ledger.set(sig.id, records.filter((r) => r.pattern === lesson).length);
        }
    }
    catch { /* no store yet — every rake is first-seen */ }
    const threshold = Number.parseInt(options.get('threshold') ?? '', 10);
    const retro = buildRetro(hits, ledger, events.length, Number.isFinite(threshold) && threshold > 0 ? threshold : undefined);
    if (flags.has('json')) {
        write(JSON.stringify(retro, null, 2));
        return 0;
    }
    write(`retro on ${transcript.replace(repoRoot + '/', '')}`);
    write(renderRetro(retro));
    // Co-improve (agent side): teach/reinforce each detected rake into the ledger store (unless --no-teach).
    if (!flags.has('no-teach') && hits.length > 0) {
        write(`\n↳ co-learning: recording ${hits.length} rake(s) in the store (domain ${RETRO_DOMAIN})…`);
        for (const hit of hits) {
            const opts = new Map([
                ['_positional_0', retroLessonText(hit.signature)],
                ['reward', '0.85'],
                ['domain', RETRO_DOMAIN],
                ['type', 'lesson-learned'],
            ]);
            if (options.has('project'))
                opts.set('project', options.get('project'));
            // `--to` MUST travel with it. Without this the ledger above resolves with the flag and the
            // write below resolves without it, so `dz retro --to global` counted a global ledger while
            // recording into the project — the very split Decision 5 exists to close, reopened one level
            // down (cross-family QE round 2, 2026-08-27).
            if (options.has('to'))
                opts.set('to', options.get('to'));
            await cmdTeach(opts, new Set(['guard', 'no-mirror']), cwd, write);
        }
    }
    return 0;
}
/**
 * `dz feature-adr-setup` — the deterministic engine behind the `configure-feature-adr` SKILL (R5). Scaffolds
 * the project-awareness files (vision / map / testing / project-skills) so a user configures feature-adr
 * without knowing any schema.
 *   --plan [--json]            read-only: what exists / discoverable / missing (the "which docs, where?" answer)
 *   --from-spec <spec.json>    preview the scaffold (create / augment per file); the SKILL fills the spec
 *   --apply                    with --from-spec: WRITE (create missing, AUGMENT existing — never clobber)
 */
function cmdFeatureAdrSetup(options, flags, cwd, write, writeErr) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || cwd;
    }
    catch { /* not git */ }
    // P3 (fa-improvements): --guards scaffolds the deterministic guard set (guards.config.json + the
    // zero-dependency check.mjs runner) — usable standalone (`dz feature-adr-setup --guards --apply`) or
    // together with --from-spec. --loc-cap <n> tunes the LOC cap (default 700).
    const wantGuards = flags.has('guards');
    const locCapRaw = options.get('loc-cap');
    const locCap = locCapRaw !== undefined ? Number(locCapRaw) : undefined;
    if (locCapRaw !== undefined && (!Number.isFinite(locCap) || locCap <= 0)) {
        write('dz feature-adr-setup: --loc-cap must be a positive finite number');
        return 1;
    }
    // portable-gates (direction b): --gates scaffolds the zero-config architecture/gates/delivery-check.md.
    // Its "runnable here" list is computed for --target (default agents-md, the AGENTS.md-class target class).
    const wantGates = flags.has('gates');
    const targetOpt = options.get('target');
    // Sites 7 AND 8 of the D3 rewiring. Site 8 (the coercion below) is NOT a guard — it
    // is a silent fallback, and a mechanical "replace isTargetName with resolveTargetName"
    // pass would miss it. With aliasing in place and the coercion left alone,
    // `dz feature-adr-setup --gates --target claude` would pass validation and then emit
    // for **agents-md**. So the coercion CONSUMES the resolution computed once, above;
    // `agents-md` is the default only when `--target` is ABSENT.
    let gatesTarget = 'agents-md';
    if (targetOpt !== undefined) {
        const gatesResolution = resolveTargetName(targetOpt);
        if (gatesResolution.kind === 'unknown') {
            for (const line of formatTargetProblem('dz feature-adr-setup', gatesResolution))
                writeErr(line);
            return 1;
        }
        gatesTarget = gatesResolution.target;
        if (gatesResolution.via === 'alias') {
            writeErr(formatTargetAliasNote('dz feature-adr-setup', targetOpt, gatesTarget));
        }
    }
    const specPath = options.get('from-spec');
    if (specPath === undefined && !wantGuards && !wantGates) {
        // default + --plan: the read-only "which documents, and where?" answer.
        const plan = buildSetupPlan(scanForSetup(repoRoot));
        if (flags.has('json')) {
            write(JSON.stringify(plan, null, 2));
            return 0;
        }
        write('feature-adr project setup — current state:');
        write(`  vision.md: ${plan.exists.vision ? '✓' : '✗ missing'}   manifest: ${plan.exists.manifest ? '✓' : '✗ missing'}   testing.md: ${plan.exists.testing ? '✓' : '✗ missing'}   project-skills.json: ${plan.exists.projectSkills ? '✓' : '✗ missing'}`);
        if (plan.discoveredPackages.length > 0)
            write(`  discovered ${plan.discoveredPackages.length} workspace package(s) → a map can be auto-scaffolded`);
        if (plan.suggestions.length > 0) {
            write('  next steps:');
            for (const s of plan.suggestions)
                write(`    • ${s}`);
        }
        if (plan.missing.length === 0)
            write('  all set — feature-adr is project-aware here.');
        else
            write('  → the `configure-feature-adr` skill walks you through the missing docs; or pass a filled spec with --from-spec.');
        return 0;
    }
    // --from-spec and/or --guards: scaffold (preview, or --apply to write).
    let spec;
    if (specPath !== undefined) {
        try {
            spec = JSON.parse(readFileSync(resolve(cwd, specPath), 'utf-8'));
        }
        catch (e) {
            write(`dz feature-adr-setup: cannot read spec ${specPath}: ${e instanceof Error ? e.message : String(e)}`);
            return 1;
        }
    }
    else {
        spec = {}; // --guards standalone: scaffold just the guard set
    }
    if (wantGuards)
        spec = { ...spec, guards: locCap !== undefined ? { locCap } : true };
    if (wantGates)
        spec = { ...spec, gates: true };
    const result = scaffoldFromSpec(spec, readExistingForScaffold(repoRoot), gatesTarget);
    if (flags.has('json') && !flags.has('apply')) {
        write(JSON.stringify(result, null, 2));
        return 0;
    }
    write(renderScaffoldPreview(result));
    if (!flags.has('apply')) {
        write('\n(preview only — pass --apply to write)');
        return 0;
    }
    let wrote = 0;
    for (const f of result.files) {
        if (f.action === 'unchanged')
            continue; // never clobber
        const abs = resolve(repoRoot, f.path);
        // Write-boundary augment-never-clobber guard (defense in depth): a 'create' must NEVER overwrite an
        // existing file, even if the plan (built from a caller-supplied `existing`) said create. 'augment' has
        // already union-merged the prior content, so overwriting there is the merged result, not a clobber.
        if (f.action === 'create' && existsSync(abs)) {
            write(`  · skipped ${f.path} — already exists (not overwritten)`);
            continue;
        }
        try {
            mkdirSync(dirname(abs), { recursive: true });
            writeFileSync(abs, f.content);
            write(`  ✓ ${f.action === 'create' ? 'created' : 'augmented'} ${f.path}`);
            wrote++;
        }
        catch (e) {
            write(`  ✗ ${f.path}: ${e instanceof Error ? e.message : String(e)}`);
        }
    }
    write(`\n↳ wrote ${wrote} file(s). Verify: dz project-skills   +   dz architecture --revise`);
    return 0;
}
/**
 * `dz challenge` — the deterministic "cartridge" behind the `challenge-panel` adversarial plan-gate (R6).
 * Assembles a WIDE context pack (plan + vision + testing + map + degradations) and prints the fixed C1-C8
 * "break it, don't confirm it" brief + the verdict schema. It runs NO LLM and writes nothing — the
 * `challenge-panel` SKILL fires the brief at a FRESH adversary (a model ≠ the plan author) + a mandatory
 * cross-validator. ADVISE, never block.
 *   --plan <plan.md>      the plan under review (required)
 *   --json                emit the assembled context + brief as JSON
 *   --context-only        just the assembled context summary (what the panel will read)
 *   --author <model>      the plan-author model → prints the cross-family adversary to dispatch (FR-4)
 */
function cmdChallenge(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not git */ }
    const planPath = options.get('plan');
    if (planPath === undefined) {
        write('dz challenge: pass --plan <plan.md> (the implementation plan to challenge).');
        return 1;
    }
    const ctx = assembleChallengeContext(repoRoot, planPath);
    if (ctx.plan === '') {
        write(`dz challenge: plan not found or empty: ${planPath}`);
        return 1;
    }
    const adversary = pickAdversaryModel(options.get('author') ?? 'claude');
    if (flags.has('json')) {
        write(JSON.stringify({ context: ctx, brief: buildChallengeBrief(ctx), adversary, questions: CHALLENGE_QUESTIONS }, null, 2));
        return 0;
    }
    if (flags.has('context-only')) {
        const has = (v) => (v === undefined ? '✗ (less calibration)' : `✓ ${v.length} chars`);
        write(`challenge context for ${planPath}:`);
        write(`  plan:        ✓ ${ctx.plan.length} chars`);
        write(`  vision:      ${has(ctx.vision)}`);
        write(`  testing:     ${has(ctx.testing)}`);
        write(`  map:         ${has(ctx.map)}`);
        write(`  degradations:${has(ctx.degradations)}`);
        write(`  → adversary: ${adversary.model} — ${adversary.note}`);
        return 0;
    }
    write(buildChallengeBrief(ctx));
    write(`\n── dispatch (panel ≠ plan author) ──\n${adversary.model}: ${adversary.note}`);
    return 0;
}
/**
 * `dz discrimination-check` — the §42 test-discrimination gate (feature learned from cve-bench/evaluate.mjs).
 * feature-adr Step-8 already asserts the ADR safety property HAS a test; this asserts that test DISCRIMINATES:
 * run the property test(s) in an isolated git worktree at the pre-feature base (default HEAD, since the feature
 * diff is uncommitted mid-pipeline). They MUST go red without the feature diff — a green is a false green.
 *
 *   --test <a.test.ts[,b.test.ts]>  the property test file(s) mapped from the ADR Confirmation (comma list)
 *   --base <ref>                    the base ref to fail against (default HEAD)
 *   --name '<filter>'               optional -t test-name filter applied to every target
 *   --runner '<cmd>'                test runner (default `npx vitest run`)
 *   --timeout <ms>                  per-run timeout (default 300000; a timed-out run is CANNOT_ISOLATE)
 *   --json                          machine-readable {plan, results, tipTree, perTest, aggregate,
 *                                   findings, measurementValid, primaryAction}
 *
 * This executor is THIN by design (house style: pure classifier + thin executor). It performs exactly the
 * I/O the pure gate cannot — stat, worktree, run, capture — and hands OBSERVATIONS back. It no longer
 * interprets anything: the pre-epoch load-error regex that lived here (`/cannot find module|failed to
 * load|.../i`) is DELETED, because a regex over a runner's stderr, written in the executor, is exactly the
 * probabilistic channel that minted `DISCRIMINATES` for `--runner false`.
 *
 * NEVER auto-aborts: a non-discriminating (false-green) test is reported as a HIGH finding for the owner to
 * decide (dz's rule — a false gate kills trust). Exit code is 0 on a clean run regardless of verdict; 2 only on
 * a usage/setup error, so a caller distinguishes "gate ran" from "gate could not run".
 */
function cmdDiscriminationCheck(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not git */ }
    const testArg = options.get('test');
    if (testArg === undefined || testArg.trim() === '') {
        write('dz discrimination-check: pass --test <property-test.ts[,...]> (the test(s) the ADR Confirmation names).');
        return 2;
    }
    const nameFilter = options.get('name');
    const propertyTests = testArg.split(',').map((s) => s.trim()).filter(Boolean).map((file) => nameFilter !== undefined && nameFilter.trim() !== '' ? { file, name: nameFilter.trim() } : { file });
    const baseRef = options.get('base') ?? 'HEAD';
    const runnerOpt = options.get('runner');
    // R11: a hung runner is a loud non-answer, never a pass. Same default + parse shape as mutation-gate.
    const timeoutOpt = Number(options.get('timeout') ?? '300000');
    const timeoutMs = Number.isFinite(timeoutOpt) && timeoutOpt > 0 ? timeoutOpt : 300000;
    // Runner honesty (feature instrument-honesty, ADR-001): the runner is selected from the TARGET
    // package's own scripts.test, never from a global default. The package dir is the nearest
    // ancestor of the FIRST named test that carries a package.json — walked here, at the seam,
    // because the pure half deliberately takes the script text as data and never touches the fs.
    let packageTestScript = null;
    let packageDevDependencies = [];
    let packageDir = repoRoot;
    {
        const firstTest = propertyTests[0]?.file;
        // QE-1 (instrument-honesty, HIGH): this walk runs on the RAW --test argument, BEFORE the
        // engine's sanitation — a `../` traversal made it read an arbitrary package.json OUTSIDE the
        // repo and echo its scripts.test verbatim into the JSON output (MEASURED with a planted
        // marker file). Containment first: a start point outside the repo root never gets walked,
        // the script stays null, and the engine's own path sanitation then refuses the test path.
        const walkStart = firstTest !== undefined ? resolve(cwd, dirname(firstTest)) : undefined;
        if (firstTest !== undefined && walkStart !== undefined
            && (walkStart === resolve(repoRoot) || walkStart.startsWith(resolve(repoRoot) + sep))) {
            let probe = walkStart;
            // walk up to the repo root looking for package.json (bounded by the fs root either way)
            for (;;) {
                if (existsSync(join(probe, 'package.json'))) {
                    packageDir = probe;
                    break;
                }
                const parent = dirname(probe);
                if (parent === probe || probe === repoRoot)
                    break;
                probe = parent;
            }
            try {
                const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf-8'));
                packageTestScript = typeof pkg.scripts?.test === 'string' ? pkg.scripts.test : null;
                packageDevDependencies = Object.keys(pkg.devDependencies ?? {});
            }
            catch { /* unreadable package.json → selection falls through to the honest REFUSE */ }
        }
    }
    // The pure half's path sanitation expects a REPO-RELATIVE package dir ('.'-rooted), not an
    // absolute one — an absolute path is refused as unsafe-package-dir by design.
    const packageDirRel = relative(repoRoot, packageDir) || '.';
    const planInput = runnerOpt !== undefined
        ? { baseRef, propertyTests, runner: runnerOpt, packageTestScript, packageDevDependencies, packageDir: packageDirRel }
        : { baseRef, propertyTests, packageTestScript, packageDevDependencies, packageDir: packageDirRel };
    const plan = planDiscriminationCheck(planInput);
    if (!plan.runnable) {
        // QE-2 (instrument-honesty, MEDIUM): a runner REFUSE used to be reported through the generic
        // "no property test to check"/map-a-test framing — the operator-facing surface re-created the
        // exact "instrument gap misread as test gap" class ADR-001 names as the reason three duplicate
        // backlog entries existed. The plan's own named reason is the verdict; the generic classify
        // stays only for the genuinely-empty-target case.
        const runnerRefusal = typeof plan.reason === 'string' && plan.reason.startsWith('unsupported-runner');
        if (runnerRefusal) {
            const refusal = {
                aggregate: 'CANNOT_ISOLATE',
                measurementValid: false,
                primaryAction: plan.primaryAction ?? 'fix-runner-invocation',
                finding: {
                    severity: 'high',
                    verdict: 'CANNOT_ISOLATE',
                    files: plan.targets.map((t) => t.file),
                    detail: `runner refused: ${plan.reason} — the INSTRUMENT could not run, nothing was measured; `
                        + `declare scripts.test in the target package (or pass --runner) and re-run. `
                        + `This is NOT a statement about the tests.`,
                },
            };
            if (flags.has('json')) {
                write(JSON.stringify({ plan, results: [], perTest: [], ...refusal }, null, 2));
                return 0;
            }
            write(`discrimination-check: REFUSED (${plan.reason})`);
            write(`  → ${refusal.finding.detail}`);
            return 0;
        }
        // No safe target to run → this is the existing "property untested" finding (empty propertyTests classify).
        const result = classifyDiscrimination({ propertyTests: [], results: [] });
        if (flags.has('json')) {
            write(JSON.stringify({ plan, results: [], ...result }, null, 2));
            return 0;
        }
        write(`discrimination-check: NOT RUN (${plan.reason ?? 'unknown'})`);
        if (plan.rejected.length)
            write('  rejected: ' + plan.rejected.map((r) => `${r.file} (${r.reason})`).join(', '));
        write(`  → ${result.finding?.detail ?? 'no property test to check'}`);
        return 0;
    }
    // ── (1) stat + isFile, BEFORE the worktree (AM-6 / FR-A1) ──────────────────────────────────
    // R12: `stat` FOLLOWS symlinks on purpose. A dangling symlink lstat-exists but has no readable
    // content — that IS absence of the named check. A directory stat-exists but is not a regular
    // file. Pre-epoch both reached the copy step, threw, and were caught into `outcome:'error'`,
    // which minted the near-pass DISCRIMINATES_VIA_ERROR (MEASURED — acid A1 / the dangling-symlink
    // and directory rows of features/wave1-instrument-repair/07_code_changes/acid-red-runs.md).
    const absent = [];
    const present = [];
    for (const t of plan.targets) {
        let isRegular = false;
        let isDirectory = false;
        try {
            const st = statSync(resolve(repoRoot, t.file));
            isRegular = st.isFile();
            isDirectory = st.isDirectory();
        }
        catch { /* ENOENT / dangling symlink / permission — absence, either way */ }
        if (isRegular) {
            present.push(t.name !== undefined ? { file: t.file, name: t.name } : { file: t.file });
            continue;
        }
        const row = t.name !== undefined ? { file: t.file, name: t.name, outcome: 'absent' } : { file: t.file, outcome: 'absent' };
        // Out-of-band detail channel: TEST_FILE_ABSENT is evidence-EXEMPT (its evidence is the stat
        // itself), and absent rows never consult the evidence gate — so this object cannot degrade the
        // row. It exists only so the finding can tell the operator WHY the path is not a test file.
        absent.push(isDirectory
            ? { ...row, evidence: { exitCode: null, runner: 'unrecognised', failureKind: 'unrecognised', testsExecuted: null, targetSeen: false, evidenceLine: 'not-a-regular-file' } }
            : row);
    }
    const results = [...absent];
    let tipTree = null;
    // Confirmation 12: with nothing present there is nothing to run — no worktree is built at all.
    if (present.length > 0) {
        const runner = runnerOpt !== undefined && plan.commands.some((c) => c.includes(runnerOpt)) ? runnerOpt : 'npx vitest run';
        // Execute the plan in a temp worktree WE own; substitute {{WORKTREE}} and always clean up.
        // `git worktree add` must CREATE the path, so compute a fresh non-existent one (do NOT mkdtemp it).
        const worktree = join(mkdtempSync(join(tmpdir(), 'dz-disc-')), 'wt');
        try {
            // 1) add the detached worktree at base (git creates `worktree`; its parent already exists).
            const addCmd = plan.commands[0].replace(/\{\{WORKTREE\}\}/g, worktree);
            execSync(addCmd, { cwd: repoRoot, stdio: 'pipe', encoding: 'utf-8' });
            // 1b) a fresh worktree has NO node_modules — without this, every test fails to load (runner + deps
            // unresolvable) and the gate collapses to always-VIA_ERROR, blind to false greens. Absolute-path
            // symlinks point back at the main checkout's already-installed trees, robust across pnpm's layout.
            const linkNodeModules = (relDir) => {
                const srcNm = join(repoRoot, relDir, 'node_modules');
                if (!existsSync(srcNm))
                    return;
                const dstNm = join(worktree, relDir, 'node_modules');
                if (existsSync(dstNm))
                    return;
                try {
                    mkdirSync(dirname(dstNm), { recursive: true });
                    symlinkSync(srcNm, dstNm, 'dir');
                }
                catch { /* best effort */ }
            };
            linkNodeModules('.'); // root (hoisted deps + .bin)
            const pkgDirs = new Set();
            for (const t of present) {
                let d = dirname(t.file);
                while (d && d !== '.' && d !== sep) {
                    if (existsSync(join(repoRoot, d, 'package.json'))) {
                        pkgDirs.add(d);
                        break;
                    }
                    d = dirname(d);
                }
            }
            for (const d of pkgDirs)
                linkNodeModules(d);
            // 2) copy each property test into the base worktree, then 3) run it and record the OBSERVATION.
            for (const t of present) {
                try {
                    const src = resolve(repoRoot, t.file);
                    // containment guard (defense in depth beyond planDiscriminationCheck's path sanitation).
                    if (!resolve(src).startsWith(resolve(repoRoot) + sep)) {
                        results.push(nameFor(t, 'error'));
                        continue;
                    }
                    const dst = join(worktree, t.file);
                    mkdirSync(dirname(dst), { recursive: true });
                    writeFileSync(dst, readFileSync(src));
                }
                catch {
                    // the file STAT-PASSED and the copy still failed: degrade LOUDLY as an error with NO
                    // evidence (the gate reads it as CANNOT_ISOLATE), never as absence and never as a pass.
                    results.push(nameFor(t, 'error'));
                    continue;
                }
                // t.file + t.name already passed the engine's strict sanitation (no quotes/metacharacters/leading-dash);
                // still quote + `--` so a path can never be read as a runner option or split a word.
                // Runner honesty (ADR-001): the run executes FROM the target package dir with a
                // package-relative path — a root-cwd `npx vitest run packages/...` loads the ROOT config
                // (none) and reds unclassifiably, which is exactly the CANNOT_ISOLATE artifact this
                // feature removes. The plan's own commands encode the same cd; this body mirrors it.
                const pkgRel = plan.packageDir === '.' ? '' : plan.packageDir;
                const fileInPkg = pkgRel !== '' && t.file.startsWith(pkgRel + '/') ? t.file.slice(pkgRel.length + 1) : t.file;
                const execDirBase = pkgRel === '' ? worktree : join(worktree, pkgRel);
                const execDirTip = pkgRel === '' ? repoRoot : join(repoRoot, pkgRel);
                const nameArg = t.name ? ` -t '${t.name}'` : '';
                // NO `--` before the path: MEASURED 2026-09-02 — `npx vitest run -- 'file'` IGNORES the
                // filter and runs the whole suite (5269 tests), which is the exact whole-repo artifact
                // this feature removes (QE ha-intake-archive F5). The path is engine-sanitized (no
                // leading dash, no metacharacters), so it can never be read as an option.
                const cmd = `${runner}${nameArg} '${fileInPkg}'`;
                const base = runCapturedTest(cmd, execDirBase, timeoutMs);
                // The classifier's targetSeen is a substring probe: the run now prints PACKAGE-relative
                // paths, so it must be probed with the same form, or every hit reads as target-unseen.
                const evidence = classifyExecutionEvidence(base.output, base.exitCode, fileInPkg);
                const outcome = discriminationOutcomeOf(base.exitCode, evidence);
                const row = t.name !== undefined
                    ? { file: t.file, name: t.name, outcome, evidence }
                    : { file: t.file, outcome, evidence };
                // 4) TIP CONTROL (FR-A2 + Confirmation 17). Run it for ALL non-assertion redness — file-load
                // redness (the matrix's EVIDENCED-error rows) AND unrecognised redness (so the invocation
                // ledger can prove the tip was REACHED). The CLASSIFIER still ignores the tip for unevidenced
                // base rows per the matrix; running it is cheap and only ever on an already-broken path.
                // Do NOT "simplify" this to evidenced-error-only — that silently breaks Confirmation 17.
                if (base.exitCode !== null && base.exitCode !== 0 && evidence.failureKind !== 'assertions') {
                    const tip = runCapturedTest(cmd, execDirTip, timeoutMs);
                    const tipEvidence = classifyExecutionEvidence(tip.output, tip.exitCode, fileInPkg);
                    row['tipOutcome'] = discriminationOutcomeOf(tip.exitCode, tipEvidence);
                    row['tipEvidence'] = tipEvidence;
                    // R15, named honestly: the base run is isolated in a worktree, but the tip runs in the LIVE
                    // tree, where a concurrent writer can flip the observation mid-gate. No lock is taken
                    // (deferred to backlog 9520e506); instead every tip-derived reading carries the tree
                    // CONDITIONS it was taken under, so a surprising verdict can be re-read against them.
                    if (tipTree === null)
                        tipTree = readTipTreeConditions(repoRoot);
                }
                results.push(row);
            }
        }
        catch (e) {
            if (flags.has('json')) {
                write(JSON.stringify({ plan, error: 'worktree-setup-failed', detail: String(e.message).slice(0, 300) }, null, 2));
            }
            else
                write(`discrimination-check: could not create worktree at ${baseRef}: ${String(e.message).slice(0, 200)}`);
            return 2;
        }
        finally {
            try {
                execSync(`git worktree remove --force ${worktree}`, { cwd: repoRoot, stdio: 'pipe' });
            }
            catch { /* fall through to rm */ }
            // remove the whole mkdtemp parent (worktree is `<mkdtemp>/wt`), so nothing leaks under tmp even on error.
            try {
                rmSync(dirname(worktree), { recursive: true, force: true });
            }
            catch { /* best effort */ }
            try {
                execSync('git worktree prune', { cwd: repoRoot, stdio: 'pipe' });
            }
            catch { /* best effort */ }
        }
    }
    const result = classifyDiscrimination({ propertyTests, results });
    if (flags.has('json')) {
        write(JSON.stringify({ plan, results, tipTree, ...result }, null, 2));
        return 0;
    }
    write(`discrimination-check @ ${baseRef} — verdict: ${result.aggregate}`);
    for (const p of result.perTest) {
        // FR-A6: ✓ is reserved for the two ESTABLISHED trust verdicts. Every other value — including
        // every degraded reading — renders ✗, because a ✗ the operator investigates beats a ✓ that
        // silently meant "we could not tell".
        const mark = p.verdict === 'DISCRIMINATES' || p.verdict === 'DISCRIMINATES_VIA_ERROR' ? '✓' : '✗';
        write(`  ${mark} ${p.file}${p.name ? ` (${p.name})` : ''}: ${p.verdict}${p.reason ? ` (reason: ${p.reason})` : ''}`);
    }
    write(`  measurementValid: ${String(result.measurementValid)} · primaryAction: ${result.primaryAction}`);
    // ALL findings print, not just the worst: the scalar aggregate names one state, and a corpus with
    // a false green AND an absent file has two problems, each with its own operator action.
    for (const f of result.findings)
        write(`\n  [${f.severity}] ${f.title}\n  ${f.detail}`);
    return 0;
}
/**
 * Run one test command and CAPTURE the observation — output plus the exit code, including the
 * "no exit code at all" case. `execSync`'s timeout kills the child via signal and leaves
 * `status` null; a spawn failure does the same. That null is not an error to swallow, it is the
 * evidence (`CANNOT_ISOLATE` reason `'timeout'`), so it is returned as data.
 */
function runCapturedTest(cmd, cwd, timeoutMs) {
    try {
        const stdout = execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf-8', timeout: timeoutMs });
        return { output: String(stdout ?? ''), exitCode: 0 };
    }
    catch (e) {
        const err = e;
        return {
            output: String(err.stdout ?? '') + String(err.stderr ?? ''),
            exitCode: typeof err.status === 'number' ? err.status : null,
        };
    }
}
/**
 * The outcome VALUE for one captured run. The executor's whole remaining judgment, and it is
 * mechanical: exit 0 is a pass, no exit code is an error, and a non-zero exit is an error only when
 * the classifier RECOGNISED a file-load failure. An unrecognised red is deliberately recorded as a
 * `fail` VALUE whose evidence then degrades it — exactly acid A6's pinned shape, and the reason the
 * executor no longer owns a regex.
 */
function discriminationOutcomeOf(exitCode, evidence) {
    if (exitCode === null)
        return 'error';
    if (exitCode === 0)
        return 'pass';
    return evidence.failureKind === 'file-load' ? 'error' : 'fail';
}
/** The live tree's identity at tip-run time (R15). Best-effort: unknown conditions read as such. */
function readTipTreeConditions(repoRoot) {
    let headSha = 'unknown';
    let dirtyFiles = -1;
    try {
        headSha = execSync('git rev-parse HEAD', { cwd: repoRoot, stdio: 'pipe', encoding: 'utf-8' }).trim();
    }
    catch { /* best effort */ }
    try {
        const porcelain = execSync('git status --porcelain', { cwd: repoRoot, stdio: 'pipe', encoding: 'utf-8' });
        dirtyFiles = String(porcelain).split('\n').filter((l) => l.trim() !== '').length;
    }
    catch { /* best effort */ }
    return { headSha, dirtyFiles };
}
/** small helper: build a result row, omitting `name` when absent (exactOptionalPropertyTypes). */
function nameFor(t, outcome) {
    return t.name !== undefined ? { file: t.file, name: t.name, outcome } : { file: t.file, outcome };
}
function parseCheckMutatedFile(absFile, text) {
    const ext = extname(absFile).toLowerCase();
    try {
        if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || ext === '.cts') {
            let ts = null;
            for (const from of [absFile, import.meta.url]) {
                try {
                    ts = createRequire(from)('typescript');
                    break;
                }
                catch { /* try the next resolution root */ }
            }
            if (ts === null)
                return { skipped: 'no TypeScript parser resolvable (typescript installed neither near the package nor near the CLI)' };
            const out = ts.transpileModule(text, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.Latest } });
            const first = (out.diagnostics ?? []).find((d) => d.category === ts.DiagnosticCategory.Error);
            if (first === undefined)
                return {};
            return { error: `TS${first.code}: ${ts.flattenDiagnosticMessageText(first.messageText, ' ')}` };
        }
        if (ext === '.json') {
            try {
                JSON.parse(text);
                return {};
            }
            catch (e) {
                return { error: String(e.message).slice(0, 200) };
            }
        }
        if (ext === '.js' || ext === '.cjs' || ext === '.mjs' || ext === '') {
            const checked = runWithOneInternalRetry(() => {
                try {
                    // `node --check` on the file IN PLACE, so the nearest package.json decides the module goal.
                    execFileSync(process.execPath, ['--check', absFile], { stdio: 'pipe' });
                    return {};
                }
                catch (e) {
                    const err = e;
                    // A launched parser that exits non-zero with a SyntaxError is a parse verdict. A child
                    // launch/internal error (EPERM, ENOENT, Node's thrown internal) is runner infrastructure
                    // and must take the bounded retry → INCONCLUSIVE route instead of masquerading as bad JS.
                    if (typeof err.code === 'string' || typeof err.status !== 'number')
                        throw e;
                    const stderrLines = String(err.stderr ?? '').split('\n').map((line) => line.trim()).filter((line) => line !== '');
                    const msg = [...stderrLines].reverse().find((line) => line.includes('Error'))
                        ?? stderrLines.at(-1)
                        ?? err.message
                        ?? 'node --check failed';
                    return { error: msg.slice(0, 200) };
                }
            });
            if (checked.value === null) {
                return {
                    internalFailureReason: checked.failureReason ?? 'runner-internal-error: persistent after 2/2 attempts',
                    internalAttempts: checked.attempts,
                };
            }
            return checked.internalRetries === 1
                ? { ...checked.value, internalAttempts: checked.attempts }
                : checked.value;
        }
        return { skipped: `no parser for '${ext}' files — parse-check unavailable` };
    }
    catch (e) {
        return { skipped: `parse-check errored: ${String(e.message).slice(0, 120)}` };
    }
}
function cmdMutationGate(options, flags, cwd, write, injectedRunner) {
    const json = flags.has('json');
    const fail = (what) => {
        write(json ? JSON.stringify({ error: what, exitCode: 2 }) : `dz mutation-gate: ${what}`);
        return 2;
    };
    const pkgDir = resolve(cwd, options.get('package') ?? '.');
    if (!existsSync(join(pkgDir, 'package.json'))) {
        return fail(`no package.json at ${pkgDir} — pass --package <dir>`);
    }
    const registryOpt = options.get('registry');
    const registryPath = registryOpt !== undefined
        ? resolve(cwd, registryOpt)
        : [join(pkgDir, 'test', 'mutation-registry.json'), join(pkgDir, 'mutation-registry.json')].find((p) => existsSync(p));
    if (registryPath === undefined || !existsSync(registryPath)) {
        return fail(`no mutation registry found (looked for test/mutation-registry.json and mutation-registry.json under ${pkgDir}) — pass --registry <file>`);
    }
    const parsed = parseMutationRegistry(readFileSync(registryPath, 'utf-8'));
    if (parsed.registry === null) {
        return fail(`registry ${registryPath} is invalid:\n  - ${parsed.errors.join('\n  - ')}`);
    }
    let entries = parsed.registry.entries;
    const only = options.get('only');
    if (only !== undefined) {
        const ids = only.split(',').map((s) => s.trim()).filter(Boolean);
        const known = new Set(entries.map((e) => e.id));
        const unknown = ids.filter((id) => !known.has(id));
        if (unknown.length > 0)
            return fail(`--only names unknown entry id(s): ${unknown.join(', ')}`);
        entries = entries.filter((e) => ids.includes(e.id));
    }
    const testCmdRaw = options.get('test-cmd') ?? parsed.registry.testCommand ?? 'npm test';
    if (/[\0\n\r]/.test(testCmdRaw))
        return fail('--test-cmd may not contain NUL or newline characters');
    const testCmd = testCmdRaw;
    const timeoutOpt = Number(options.get('timeout') ?? '300000');
    const timeout = Number.isFinite(timeoutOpt) && timeoutOpt > 0 ? timeoutOpt : 300000;
    // Route-b guard mode: `per-entry` (default, strongest — each red entry re-baselines the restored
    // tree, so a flaky neighbour flips THAT entry to INCONCLUSIVE) or `final` (cheap — one re-run at
    // the end; if it is not green, every red-based verdict of the run is downgraded, because any of
    // them may have been the flake). MEASURED on the 18-entry health-advisor registry (~15s/suite
    // run): per-entry ≈ 37 runs, final ≈ 20 runs vs 19 pre-fix. An unknown mode is a usage error.
    const rebaselineMode = options.get('rebaseline') ?? 'per-entry';
    if (rebaselineMode !== 'per-entry' && rebaselineMode !== 'final') {
        return fail(`--rebaseline must be 'per-entry' or 'final', got '${rebaselineMode}'`);
    }
    // Rule 3 — NEVER mutate the working tree: the package is copied into a scratch dir we own and
    // mutated THERE. The copy must actually be RUNNABLE (SPEC rule 3's note), which took three
    // measured layers on the seed package:
    //   • the package's own node_modules is symlinked back (absolute), so deps + .bin resolve;
    //   • the copy lives inside a SHADOW of the package's repo — every ancestor level mirrors the
    //     real one with SYMLINKED siblings (root node_modules for hoisted deps, sibling packages
    //     for repo-relative test paths like `../../harness-core/dist`); only the package under test
    //     is a real, mutable copy (MEASURED: without this, 30 health-advisor tests failed at
    //     baseline on ERR_MODULE_NOT_FOUND / a missing sibling dist);
    //   • the copy is `git init`-ed and committed, because hygiene tests take `git status` before
    //     and after the run — they compare before WITH after, so a pre-mutation commit keeps them
    //     discriminating (MEASURED: without it, 2 tests failed at baseline on "not a git repository").
    const scratchParent = mkdtempSync(join(tmpdir(), 'dz-mutgate-'));
    let gitTop = null;
    try {
        gitTop = execSync('git rev-parse --show-toplevel', { cwd: pkgDir, stdio: 'pipe', encoding: 'utf-8' }).trim() || null;
    }
    catch { /* not in a git repo */ }
    let copyDir = join(scratchParent, 'pkg');
    const results = [];
    const observations = [];
    const warnings = [];
    const internalRetries = [];
    let baseline;
    try {
        if (gitTop !== null && gitTop !== pkgDir && resolve(pkgDir).startsWith(resolve(gitTop) + sep)) {
            // shadow tree: mirror <gitTop>/…/<pkg> under scratch, symlinking every sibling entry.
            let realCursor = gitTop;
            let shadowCursor = join(scratchParent, 'root');
            mkdirSync(shadowCursor, { recursive: true });
            const segs = relative(gitTop, pkgDir).split(sep);
            segs.forEach((seg, i) => {
                for (const entry of readdirSync(realCursor)) {
                    if (entry === seg || entry === '.git')
                        continue;
                    try {
                        symlinkSync(join(realCursor, entry), join(shadowCursor, entry));
                    }
                    catch { /* best effort */ }
                }
                realCursor = join(realCursor, seg);
                shadowCursor = join(shadowCursor, seg);
                if (i < segs.length - 1)
                    mkdirSync(shadowCursor, { recursive: true });
            });
            copyDir = shadowCursor;
        }
        cpSync(pkgDir, copyDir, {
            recursive: true,
            filter: (src) => {
                const rel = relative(pkgDir, src);
                return rel === '' || !rel.split(sep).some((seg) => seg === 'node_modules' || seg === '.git');
            },
        });
        const srcNm = join(pkgDir, 'node_modules');
        if (existsSync(srcNm) && !existsSync(join(copyDir, 'node_modules'))) {
            symlinkSync(srcNm, join(copyDir, 'node_modules'), 'dir');
        }
        try {
            execSync('git init -q && git add -A -f . && git -c user.email=mutation-gate@dz -c user.name=mutation-gate -c commit.gpgsign=false commit -qm scratch-baseline', { cwd: copyDir, stdio: 'pipe' });
        }
        catch { /* no git available → a suite that needs it fails the BASELINE loudly, never silently */ }
        // F-2 — rule-3 containment root: the scratch copy AS THE FILESYSTEM sees it. Every mutation
        // write below is asserted to RESOLVE inside this root before it happens.
        const realScratchRoot = realpathSync(copyDir);
        const requireCompletionReceipt = parsed.registry.requireCompletionReceipt === true;
        const invokeSuite = () => {
            if (injectedRunner !== undefined) {
                return injectedRunner(testCmd, { cwd: copyDir, timeoutMs: timeout });
            }
            const run = spawnSync(testCmd, {
                cwd: copyDir,
                shell: true,
                encoding: 'utf-8',
                timeout,
                maxBuffer: 64 * 1024 * 1024,
                env: { ...process.env, FORCE_COLOR: '0' },
            });
            const errorCode = run.error && 'code' in run.error && typeof run.error.code === 'string'
                ? run.error.code
                : undefined;
            // Node may populate both `error` and a numeric `status` for an internal spawn failure. The
            // error wins except for the two already-named resource observations: a status alongside
            // EPERM/Unreachable-code is not a suite verdict and takes the one-retry internal-error path.
            if (run.error !== undefined && errorCode !== 'ETIMEDOUT' && errorCode !== 'ENOBUFS') {
                throw run.error;
            }
            const signal = typeof run.signal === 'string' ? run.signal : undefined;
            let failureReason;
            if (typeof run.status !== 'number') {
                if (errorCode === 'ETIMEDOUT')
                    failureReason = `timeout after ${timeout}ms${signal === undefined ? '' : `; signal=${signal}`}`;
                else if (errorCode === 'ENOBUFS')
                    failureReason = 'maxBuffer exceeded (ENOBUFS; 67108864-byte output ceiling)';
                else if (signal !== undefined)
                    failureReason = `child killed by signal ${signal}`;
                else if (errorCode !== undefined)
                    failureReason = `spawn failure code ${errorCode}`;
                else
                    failureReason = 'spawn failure with no error code or signal';
            }
            return {
                exitCode: typeof run.status === 'number' ? run.status : null,
                output: `${String(run.stdout ?? '')}\n${String(run.stderr ?? '')}`,
                ...(failureReason !== undefined ? { failureReason } : {}),
            };
        };
        const runSuite = (phase, entryId) => {
            const retried = runWithOneInternalRetry(invokeSuite);
            const loggedAttempts = retried.attempts.map((attempt) => {
                if (attempt.outcome !== 'completed' || retried.value === null)
                    return attempt;
                const outcome = retried.value.exitCode === null
                    ? `no exit code (${retried.value.failureReason ?? 'unnamed failure'})`
                    : `exit ${retried.value.exitCode}`;
                return { ...attempt, detail: `attempt ${attempt.attempt}: completed — ${outcome}` };
            });
            if (retried.internalRetries === 1) {
                const record = entryId === undefined
                    ? { phase, attempts: loggedAttempts }
                    : { phase, entryId, attempts: loggedAttempts };
                internalRetries.push(record);
                if (!json)
                    write(`mutation-gate: internal retry — ${loggedAttempts.map((attempt) => attempt.detail).join('; ')}`);
            }
            const internalAttemptLog = retried.internalRetries === 1
                ? loggedAttempts.map((attempt) => attempt.detail).join('; ')
                : undefined;
            if (retried.value !== null) {
                return {
                    ...retried.value,
                    ...(internalAttemptLog !== undefined ? { internalAttemptLog } : {}),
                };
            }
            return {
                exitCode: null,
                output: '',
                failureReason: retried.failureReason ?? 'runner-internal-error: persistent after 2/2 attempts',
                ...(internalAttemptLog !== undefined ? { internalAttemptLog } : {}),
            };
        };
        // Baseline BEFORE any mutation: a red copy proves nothing, and reading it as a mutation
        // result would be this gate shipping the defect class it exists to catch.
        if (!json)
            write(`mutation-gate: baseline suite in scratch copy of ${pkgDir} …`);
        const base = runSuite('baseline');
        baseline = classifyBaseline(base.exitCode, base.failureReason, base.exitCode !== null && base.exitCode !== 0
            ? attributeBaselineRedness(base.output, entries.map((entry) => entry.file))
            : undefined);
        if (!baseline.ok) {
            if (json) {
                write(JSON.stringify({ packageDir: pkgDir, registryPath, testCommand: testCmd, baseline, results: [], internalRetries, exitCode: 1 }, null, 2));
                return 1;
            }
            write(renderMutationReport([], baseline, pkgDir));
            return 1;
        }
        for (const entry of entries) {
            const filePath = join(copyDir, entry.file);
            let sourceText = null;
            try {
                sourceText = readFileSync(filePath, 'utf-8');
            }
            catch { /* missing file ⇒ occurrences 0 ⇒ NOT_APPLIED */ }
            if (sourceText === null) {
                const obs = { entry, occurrences: 0, exitCode: null, failingCount: null };
                observations.push(obs);
                results.push(classifyMutationOutcome(obs));
                continue;
            }
            const applied = applyMutationToText(sourceText, entry.mutation.find, entry.mutation.replace);
            if (!applied.ok || applied.text === undefined) {
                const obs = { entry, occurrences: applied.occurrences, exitCode: null, failingCount: null };
                observations.push(obs);
                results.push(classifyMutationOutcome(obs));
                continue;
            }
            // F-2 — rule-3 containment (SPEC "Never mutate the working tree"): `join(copyDir, file)` is
            // LEXICAL; a symlink cpSync preserved inside the package (or the intentionally symlinked
            // node_modules) makes it RESOLVE outside the scratch tree, and the "scratch" write would
            // follow the link and mutate the REAL working tree for the whole suite run — restored only
            // by the finally, so a SIGKILL mid-run leaves the real tree permanently mutated (MEASURED
            // pre-fix: a registry file behind a package-local symlink; the suite-run witness read the
            // mutated text from the REAL file). Same primitive as health-advisor lock.js's
            // realCaseDir/assertLockRootIsItself: decide on realpaths, refuse an escape — exit 2, a
            // registry/setup error, never a mutation.
            let realTarget = null;
            try {
                realTarget = realpathSync(filePath);
            }
            catch { /* vanished between read and here → refuse below */ }
            if (realTarget === null || (realTarget !== realScratchRoot && !realTarget.startsWith(realScratchRoot + sep))) {
                return fail(`entry '${entry.id}': ${entry.file} resolves to ${realTarget ?? '<unresolvable>'} — OUTSIDE the scratch copy (${realScratchRoot}). A path component is a symlink escaping the scratch tree, so writing the mutation would mutate the REAL working tree (SPEC rule 3). Refused; nothing was written.`);
            }
            if (!json)
                write(`mutation-gate: ${entry.id} — mutating ${entry.file}, running suite …`);
            let run = null;
            let parseError;
            let parseInternalFailureReason;
            let parseInternalAttemptLog;
            try {
                writeFileSync(filePath, applied.text);
                // Route-a guard: the mutated file must still PARSE — a load failure reddens the whole
                // suite for structural, not behavioural, reasons, and must never read as discrimination.
                const check = parseCheckMutatedFile(filePath, applied.text);
                if (check.skipped !== undefined) {
                    warnings.push(`${entry.id}: parse-check SKIPPED — ${check.skipped}`);
                    if (!json)
                        write(`mutation-gate: WARNING ${entry.id}: parse-check skipped — ${check.skipped}`);
                }
                if (check.internalAttempts !== undefined) {
                    internalRetries.push({ phase: 'parse-check', entryId: entry.id, attempts: check.internalAttempts });
                    parseInternalAttemptLog = check.internalAttempts.map((attempt) => attempt.detail).join('; ');
                    if (!json)
                        write(`mutation-gate: internal retry — ${parseInternalAttemptLog}`);
                }
                parseInternalFailureReason = check.internalFailureReason;
                if (check.error !== undefined) {
                    parseError = check.error; // no suite run: the verdict is MUTATION_UNPARSEABLE regardless
                }
                else if (parseInternalFailureReason === undefined) {
                    run = runSuite('mutation', entry.id);
                }
            }
            finally {
                writeFileSync(filePath, sourceText); // restore the COPY so the next entry starts pristine
            }
            // Route-a′ guard (round-6 rework): the file-load-vs-assertion signal is derived from THE
            // SAME RUN that produced the failing count — no isolated child, no environment mismatch,
            // nothing to disagree with itself (the round-5 isolated `import()` had three measured
            // false-PASS routes, all artifacts of the isolation environment differing from the runner).
            // 'file-load' ⇒ MUTATION_LOAD_FATAL (structural); 'unrecognised' ⇒ INCONCLUSIVE (a
            // runner-coverage gap of this tool, loud, never PROVEN); 'assertions' ⇒ behavioural, the
            // count-based verdicts apply.
            const completionReceipt = run === null ? undefined : detectSuiteCompletionReceipt(run.output);
            let receiptMismatch = run === null ? undefined : detectSuiteReceiptMismatch(run.output);
            if (run !== null && requireCompletionReceipt
                && completionReceipt === undefined && receiptMismatch === undefined) {
                receiptMismatch = 'required mutation-suite-receipt-ok completion receipt missing';
            }
            let fileLoadFailure;
            let outputUnrecognised;
            if (run !== null && run.exitCode !== null && run.exitCode !== 0) {
                const cls = classifyRunFailure(run.output);
                if (cls.kind === 'file-load') {
                    fileLoadFailure = cls.evidence ?? 'test file failed to load (no evidence line)';
                }
                else if (cls.kind === 'unrecognised') {
                    outputUnrecognised = cls.evidence ?? `no classifier for runner '${cls.runner}'`;
                }
            }
            // Route-b guard (per-entry mode): a red mutated run is attributable only if the RESTORED
            // tree reproduces green — otherwise a flaky neighbour may be what went red. Skipped when the
            // classification already failed the entry (file-load / unrecognised / receipt mismatch):
            // those verdicts outrank the rebaseline check, so the extra suite run would buy nothing.
            let rebaselineExitCode;
            let rebaselineFailureReason;
            let rebaselineAttribution;
            let rebaselineInternalAttemptLog;
            if (rebaselineMode === 'per-entry' && run !== null && run.exitCode !== null && run.exitCode !== 0
                && fileLoadFailure === undefined && outputUnrecognised === undefined && receiptMismatch === undefined) {
                if (!json)
                    write(`mutation-gate: ${entry.id} — re-baselining the restored tree …`);
                const rebaselineRun = runSuite('rebaseline', entry.id);
                rebaselineExitCode = rebaselineRun.exitCode;
                rebaselineFailureReason = rebaselineRun.failureReason;
                rebaselineInternalAttemptLog = rebaselineRun.internalAttemptLog;
                if (rebaselineRun.exitCode !== null && rebaselineRun.exitCode !== 0) {
                    rebaselineAttribution = attributeBaselineRedness(rebaselineRun.output, entries.map((candidate) => candidate.file));
                }
            }
            const entryRunFailureReason = run?.failureReason ?? parseInternalFailureReason;
            const entryInternalAttemptLog = [parseInternalAttemptLog, run?.internalAttemptLog, rebaselineInternalAttemptLog]
                .filter((log) => log !== undefined)
                .join('; ');
            const obs = {
                entry,
                occurrences: 1,
                exitCode: run === null ? null : run.exitCode,
                failingCount: run === null ? null : countFailingTests(run.output),
                ...(parseError !== undefined ? { parseError } : {}),
                ...(fileLoadFailure !== undefined ? { fileLoadFailure } : {}),
                ...(outputUnrecognised !== undefined ? { outputUnrecognised } : {}),
                ...(receiptMismatch !== undefined ? { receiptMismatch } : {}),
                ...(entryRunFailureReason !== undefined ? { runFailureReason: entryRunFailureReason } : {}),
                ...(entryInternalAttemptLog !== '' ? { internalAttemptLog: entryInternalAttemptLog } : {}),
                ...(rebaselineExitCode !== undefined ? { rebaselineExitCode } : {}),
                ...(rebaselineFailureReason !== undefined ? { rebaselineFailureReason } : {}),
                ...(rebaselineAttribution !== undefined ? { rebaselineAttribution } : {}),
            };
            observations.push(obs);
            results.push(classifyMutationOutcome(obs));
        }
        // Route-b guard (final mode): one re-run after all entries. Not green ⇒ EVERY red-based
        // verdict of this run is downgraded (any of them may have been the flake, and there is no
        // per-entry evidence to say which) — re-classifying with the final exit turns them
        // INCONCLUSIVE while leaving NOT_APPLIED / UNDEFENDED / MUTATION_UNPARSEABLE /
        // MUTATION_LOAD_FATAL / RECEIPT_MISMATCH untouched.
        if (rebaselineMode === 'final') {
            if (!json)
                write('mutation-gate: final re-baseline of the restored tree …');
            const finalRun = runSuite('final-rebaseline');
            const finalExit = finalRun.exitCode;
            if (finalExit !== 0) {
                const what = finalExit === null ? `no exit code: ${finalRun.failureReason ?? 'unknown timeout / spawn failure'}` : `exit ${finalExit}`;
                warnings.push(`final re-baseline NOT green (${what}) — the suite is flaky; red-based verdicts downgraded to INCONCLUSIVE`);
                if (!json)
                    write(`mutation-gate: final re-baseline NOT green (${what}) — red-based verdicts downgraded to INCONCLUSIVE`);
                const reclassified = observations.map((obs) => classifyMutationOutcome({
                    ...obs,
                    rebaselineExitCode: finalExit,
                    ...(finalRun.failureReason !== undefined ? { rebaselineFailureReason: finalRun.failureReason } : {}),
                    ...(finalRun.internalAttemptLog !== undefined
                        ? { internalAttemptLog: [obs.internalAttemptLog, finalRun.internalAttemptLog].filter((log) => log !== undefined).join('; ') }
                        : {}),
                    ...(finalExit !== null && finalExit !== 0
                        ? { rebaselineAttribution: attributeBaselineRedness(finalRun.output, entries.map((entry) => entry.file)) }
                        : {}),
                }));
                results.length = 0;
                results.push(...reclassified);
            }
        }
    }
    finally {
        if (flags.has('keep-scratch')) {
            write(`mutation-gate: scratch copy kept at ${copyDir}`);
        }
        else {
            try {
                rmSync(scratchParent, { recursive: true, force: true });
            }
            catch { /* best effort */ }
        }
    }
    const exitCode = mutationGateExitCode(results, baseline.ok);
    if (json) {
        write(JSON.stringify({ packageDir: pkgDir, registryPath, testCommand: testCmd, rebaselineMode, baseline, results, summary: summarizeMutationResults(results), warnings, internalRetries, exitCode }, null, 2));
        return exitCode;
    }
    write(renderMutationReport(results, baseline, pkgDir));
    return exitCode;
}
/**
 * `dz delivery-check` — the portable Step-10 Delivery Gate (feature portable-gates). The `manual` form that
 * travels to every `shell` target: the deterministic parts (artifact probes, hand-off arithmetic,
 * cross-validation bookkeeping) run IN the CLI; the semantic 4-plane review is DISPATCHED to the caller's own
 * agent runtime — the `dz challenge` cartridge shape. All logic lives in harness-core's pure engine; this is
 * the executor. Advisory exit codes (0 by default; `--strict` ⇒ 1 on `blocked`).
 *
 *   --slug <slug>            the feature under features/<slug> (required; featureDir derived internally)
 *   --context-only           default mode: print artifact probes + the 4-plane review brief (no verdict)
 *   --findings <f.json>      classify a fed-back findings array → write 10_delivery_review.md + print ready/blocked
 *   --strict                 with --findings: exit 1 iff handoff === 'blocked' (CI gate)
 *   --author <model>         cosmetic: the reviewer to dispatch, printed alongside the brief
 *   --json                   machine contract { planesChecked, planesSkipped, findings, handoff, artifact }
 */
/**
 * `dz score --slug <feature>` — score a feature-adr RUN's process discipline from its artifacts
 * (feature dz-score, Reading C). Descriptive-only: exit 0 on any score; non-zero only on usage errors.
 */
/** Scan features/<slug>/.fa-state/reqe-due.json under a project root. Symlinked ANCESTOR dirs are
 * skipped too, not just the leaf (Codex QE #5 — a symlinked feature dir could smuggle an outside
 * debt); an oversized or non-regular due-file counts as MALFORMED, never a silent skip (QE #8);
 * a debt whose embedded slug differs from its directory is MALFORMED — identity is the directory,
 * the JSON only confirms it (QE #4: an embedded foreign slug must not redirect settlement). */
/* ── `dz workflow run` — the impure half of the loop-plan executor (feature dz-workflow-run) ──────
 *
 * Everything DECIDABLE lives in harness-core's pure scheduler. This half owns exactly four things
 * core refuses to touch: the filesystem, the lock, the child processes, and the exit code. Keeping
 * that line sharp is what lets the whole feature be tested without a child process — so anything
 * added here that could have been a decision belongs upstream instead.
 */
/** The env TEST SEAM (the `DZ_QE_BRIDGE_CLAUDE_BIN` precedent: an env var, never a flag — a flag
 * invites production use). Recorded LOUDLY in run-state as `dispatcherOverride: true`, because a
 * test seam that leaves no trace in the artifact is indistinguishable from a real run. */
const WF_RUN_DISPATCH_SCRIPT_ENV = 'DZ_WF_RUN_DISPATCH_SCRIPT';
const WF_RUN_OWNER_FILE = 'run-owner.json';
const WF_RUN_STATE_FILE = 'run-state.json';
/**
 * THE ONE PLACE anything in the loop runner is signalled (Step-8 re-QE NEW-C4).
 *
 * Round 1 guarded `process.kill(-pid, …)` — the process-GROUP path — and left `child.kill(sig)`
 * unguarded beside it. A fake child reporting `pid: 0` therefore still received the signal through
 * the object method, which is the same defect wearing a different call shape. `process.kill(-0, …)`
 * signals the CALLER'S OWN process group; round 0 of this exact class took down the vitest worker
 * pool. Two call shapes meant two chances to forget, so now there is one.
 *
 * The guard is on the PID, not on the shape: an unsignalable pid (not an integer, or <= 1) reaches
 * NOTHING — neither `process.kill` nor `child.kill`. Returns whether a signal was actually sent, so
 * a caller can never mistake "refused" for "delivered".
 */
function signalChildSafely(child, signal, detached) {
    const raw = child?.pid;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 1)
        return false;
    try {
        if (detached)
            process.kill(-raw, signal);
        else
            child?.kill?.(signal);
        return true;
    }
    catch {
        return false; // already gone, or not ours — both mean nothing more to do
    }
}
/** Test seam for the chokepoint: NEW-C4's proof needs to call it with a hostile pid. */
export function __wfSignalChildTestSeam(child, signal, detached) {
    return signalChildSafely(child, signal, detached);
}
/** Live children, keyed by pid, for the kill-group handlers (AM-10). */
const wfLiveChildren = new Map();
let wfHandlersInstalled = false;
/** Kill the process GROUP of every live child. A detached child leads its own group, so killing the
 * leader alone would leave whatever it spawned running — that is the orphan class AM-10 closes.
 * NAMED RESIDUE: a SIGKILL of the runner itself runs no handler, so that case still orphans. */
function wfKillLiveChildren(signal = 'SIGTERM') {
    const killed = [];
    for (const [pid, child] of [...wfLiveChildren.entries()]) {
        // ONE chokepoint: group first (a detached child leads its own), then the leader. Neither shape
        // is reachable without the pid guard.
        if (signalChildSafely(child, signal, true) || signalChildSafely(child, signal, false))
            killed.push(pid);
        wfLiveChildren.delete(pid);
    }
    return killed;
}
function wfInstallKillHandlers() {
    if (wfHandlersInstalled)
        return;
    wfHandlersInstalled = true;
    process.on('exit', () => { wfKillLiveChildren(); });
    process.on('SIGTERM', () => { wfKillLiveChildren(); process.exit(143); });
    process.on('SIGINT', () => { wfKillLiveChildren(); process.exit(130); });
}
/** Exposed for the unit test: the kill set must NAME every live child's pid. */
export function __wfKillGroupTestSeam() {
    return {
        register: (pid, child) => { wfLiveChildren.set(pid, child); },
        killAll: () => wfKillLiveChildren(),
        size: () => wfLiveChildren.size,
    };
}
/** A `ChildRunner` over the generalized wrapper, registering every live child for the kill set. */
/** A `ChildRunner` bound to ONE family, so its child can only ever receive that family's
 * credentials (re-QE H9). Two runners, two credential sets, one wrapper. */
const wfChildRunnerFor = (family) => async (bin, argv, opts) => runChildBridge(bin, argv, {
    ...opts,
    // a dispatched model gets a NAMED minimal environment, never the runner's whole one (HIGH-9)
    envMode: 'allowlist',
    envExtra: CHILD_ENV_BY_FAMILY[family],
    onSpawn: (child) => {
        if (typeof child.pid !== 'number')
            return;
        const pid = child.pid;
        wfLiveChildren.set(pid, child);
        child.on('close', () => { wfLiveChildren.delete(pid); });
    },
});
/** Build the SCRIPTED dispatcher from the env seam's JSON file (test-only). */
function wfScriptedDispatcher(scriptPath, family) {
    const raw = JSON.parse(readFileSync(scriptPath, 'utf8'));
    const script = (raw['steps'] ?? raw);
    const probeId = typeof raw['probeId'] === 'string' ? raw['probeId'] : `${family}-scripted`;
    const consumed = new Map();
    return {
        probe: async (candidates) => ({ id: raw['probeFails'] === true ? null : probeId, wallMs: 1, detail: `scripted probe (${candidates.join(',') || 'defaults'})` }),
        dispatch: async (req) => {
            const key = req.itemKey === null ? req.stepId : `${req.stepId}:${req.itemKey}`;
            const entry = script[key] ?? script[req.stepId];
            const n = consumed.get(key) ?? 0;
            consumed.set(key, n + 1);
            const picked = Array.isArray(entry) ? entry[Math.min(n, entry.length - 1)] : entry;
            const base = {
                outcome: 'ok',
                text: `scripted:${key}`,
                family,
                modelUsed: req.resolvedModelId,
                wallMs: 1,
                tokensIn: null,
                tokensOut: null,
                tokensSource: null,
            };
            if (picked === undefined || picked === null)
                return base;
            // a scripted step may ask the runner to CREATE its declared writes (the landed-barrier leg)
            if (picked['writes'] === true) {
                for (const rel of req.expectedWrites) {
                    // the seam re-checks containment too — a test double that could write outside the root
                    // would be a hole in exactly the guard the real path is being tested for (CRITICAL-4)
                    const abs = wfContainedPath(req.cwd, rel);
                    if (abs === null)
                        continue;
                    mkdirSync(dirname(abs), { recursive: true });
                    writeFileSync(abs, `scripted write for ${req.stepId} attempt ${req.attempt}\n`);
                }
            }
            return { ...base, ...picked };
        },
    };
}
/** Read a small JSON file, or null. */
function wfReadJson(path) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    }
    catch {
        return null;
    }
}
/** Is a recorded pid still alive? `kill(pid, 0)` is the portable liveness probe. */
function wfPidAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (e) {
        return e.code === 'EPERM'; // alive, just not ours
    }
}
/** The fs `RunStore`. Every write that must be atomic is temp+rename; every file that must be NEW
 * is `wx`. Nothing here decides anything. */
/**
 * Containment, re-checked at the LAST possible moment (Step-8 CRITICAL-4: "repeat containment
 * immediately before filesystem access").
 *
 * Preflight validated these paths minutes earlier, against a filesystem that has since been written
 * to — by the very models this run dispatched. A symlink planted between preflight and the probe is
 * not a hypothetical here; creating files is what the file-deliverable steps DO. Returns the
 * absolute path, or null when the path no longer resolves inside the root.
 */
function wfContainedPath(targetCwd, rel) {
    const check = containedUnderRoot(targetCwd, rel);
    return check.ok ? check.path : null;
}
function wfMakeStore(runDir, repoRoot, targetCwd) {
    const statePath = join(runDir, WF_RUN_STATE_FILE);
    const tracePath = join(runDir, 'trace.jsonl');
    const stateDir = join(runDir, '.fa-state');
    const ckptPath = join(stateDir, 'checkpoints.jsonl');
    const budgetPath = join(runDir, 'budget.jsonl');
    const duePath = join(stateDir, 'reqe-due.json');
    const ledgerPath = join(repoRoot, '.dz', 'feature-adr', 'run-cost-ledger.jsonl');
    const hashOf = (abs) => {
        try {
            return createHash('sha256').update(readFileSync(abs)).digest('hex');
        }
        catch {
            return null;
        }
    };
    return {
        runDirExists: () => existsSync(runDir),
        hasTrace: () => existsSync(tracePath),
        readTraceText: () => (existsSync(tracePath) ? readFileSync(tracePath, 'utf8') : null),
        // The CONTENT half of the attestation binding. Hashes the file AS IT STANDS, so it must be
        // called after the final flush — the scheduler's stampTraceBinding is the single caller.
        measureTrace: () => {
            if (!existsSync(tracePath))
                return null;
            const text = readFileSync(tracePath, 'utf8');
            return { sha256: createHash('sha256').update(text, 'utf8').digest('hex'), lines: text.split('\n').filter((l) => l.trim() !== '').length };
        },
        readRunState: () => wfReadJson(statePath),
        writeRunState: (s) => {
            mkdirSync(runDir, { recursive: true });
            const tmp = statePath + '.tmp';
            writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n');
            renameSync(tmp, statePath); // atomic: a half-written state is a foreign run forever
        },
        appendTraceLines: (lines) => {
            if (lines.length === 0)
                return;
            mkdirSync(runDir, { recursive: true });
            appendFileSync(tracePath, lines.join('\n') + '\n');
        },
        readCheckpointsText: () => (existsSync(ckptPath) ? readFileSync(ckptPath, 'utf8') : null),
        appendCheckpointLine: (line) => {
            mkdirSync(stateDir, { recursive: true });
            appendFileSync(ckptPath, line + '\n');
        },
        appendBudgetRow: (row) => {
            mkdirSync(runDir, { recursive: true });
            appendFileSync(budgetPath, JSON.stringify(row) + '\n');
        },
        appendLedgerLine: (line) => {
            try {
                mkdirSync(dirname(ledgerPath), { recursive: true });
                appendFileSync(ledgerPath, line + '\n');
            }
            catch {
                /* telemetry is SECONDARY: a ledger failure never fails a run */
            }
        },
        probeArtifact: (rel) => {
            const abs = wfContainedPath(targetCwd, rel);
            // a path that no longer resolves inside the root is NOT LANDED, whatever is at the other end
            return abs !== null && existsSync(abs);
        },
        // re-QE R3-A: the same realpath + symlinked-ancestor discipline, for reads AND writes, at the
        // moment before the dispatch grants filesystem access
        pathContainmentOk: (rel) => wfContainedPath(targetCwd, rel) !== null,
        snapshotWrites: (rels) => {
            const out = {};
            for (const rel of rels) {
                const abs = wfContainedPath(targetCwd, rel);
                out[rel] = abs === null ? null : hashOf(abs);
            }
            return out;
        },
        writeReqeDebt: (record) => {
            mkdirSync(stateDir, { recursive: true });
            writeFileSync(duePath, JSON.stringify(record, null, 2) + '\n');
        },
    };
}
/**
 * `dz workflow run <plan.json>` — INTERPRET the plan (ADR-001). Registered inside the existing
 * `case 'workflow':` branch when `_positional_0 === 'run'`, BEFORE the sync `cmdWorkflow`.
 *
 * Exit codes (AM-11): `0` completed · `1` failed (named) · `2` usage / invalid plan ·
 * `75` typed pause (sysexits EX_TEMPFAIL). NOT `3`: that collides with workflow-lint's
 * inconclusive and reads ignorable, while a pause strands resumable progress.
 */
async function cmdWorkflowRun(options, optionLists, flags, cwd, write) {
    const json = flags.has('json');
    const usage = 'dz workflow run <plan.json> [--run-id <id>] [--resume <runId>] [--arg k=v]… '
        + '[--coder-family codex|claude] [--default-family codex|claude] [--budget <n>] [--max-wall-clock <s>] '
        + '[--stage-timeout <s>] [--budget-extra <n>] [--wall-clock-extra <s>] [--run-dir <dir>] '
        + '[--allow-same-family-qe] [--json]';
    const usageError = (message) => {
        write(json ? JSON.stringify({ ok: false, reason: 'plan-invalid', error: message, exitCode: 2 }) : `dz workflow run: ${message}\n${usage}`);
        return 2;
    };
    if (flags.has('help')) {
        write(usage);
        write('');
        write('EXIT CODES — `dz workflow run` and `dz workflow-lint` have DIFFERENT tables (AM-11):');
        write('  run   0 completed · 1 failed (named reason) · 2 usage/invalid plan · 75 typed pause (EX_TEMPFAIL)');
        write('  lint  0 clean     · 1 findings            · 3 inconclusive');
        write('  75 is NOT 3: 3 reads ignorable and collides with lint, while a pause strands resumable work.');
        write('On a pause the LAST stdout line is a `wf-pause-envelope/1` JSON object; a FAILURE emits none,');
        write('so a wrapper can tell the two apart from stdout + exit code alone, without parsing prose.');
        return 0;
    }
    // ── closed allowlists (the cmdQeBridge discipline: an unknown flag is a usage error, never a
    // silently-ignored intention) ──
    const OPTS = new Set(['run-id', 'resume', 'arg', 'coder-family', 'default-family', 'budget', 'max-wall-clock', 'stage-timeout', 'budget-extra', 'wall-clock-extra', 'run-dir', 'project', '_positional_0', '_positional_1']);
    const FLAGS = new Set(['allow-same-family-qe', 'json', 'help']);
    for (const k of options.keys())
        if (!OPTS.has(k))
            return usageError(`unknown option --${k}`);
    for (const f of flags)
        if (!FLAGS.has(f))
            return usageError(`unknown flag --${f}`);
    // ── SINGLETONS (Step-8 HIGH-8 — the recurring class) ──
    //
    // `parseArgs` keeps every occurrence in `optionLists` but the main map is LAST-WINS, so
    // `--coder-family codex --coder-family claude` was accepted and only `claude` reached preflight.
    // For a SAFETY option that is a bypass: the same-family guard compares the coder family against a
    // qe step's family, and whoever supplies the last occurrence chooses the answer. Every option here
    // is a singleton BY MEANING — a run has one coder family, one budget, one run directory — so a
    // second occurrence is not a preference, it is an ambiguity, and the only honest answer is to
    // refuse. `--arg` is deliberately absent: it is the one genuinely repeatable option.
    const SINGLETON_OPTS = ['run-id', 'resume', 'coder-family', 'default-family', 'budget', 'max-wall-clock', 'stage-timeout', 'budget-extra', 'wall-clock-extra', 'run-dir', 'project'];
    for (const key of SINGLETON_OPTS) {
        const occurrences = optionLists.get(key) ?? [];
        if (occurrences.length > 1) {
            return usageError(`--${key} was given ${occurrences.length} times (${occurrences.map((v) => JSON.stringify(v)).join(', ')}) — it is a singleton, and a second occurrence is an ambiguity, not a preference. `
                + 'Stacking a safety option would let the LAST value decide what the first one refused.');
        }
    }
    const planPath = options.get('_positional_1') ?? '';
    if (planPath === '')
        return usageError('a plan.json positional is required');
    const root = resolve(cwd, options.get('project') ?? '.');
    const absPlan = resolve(cwd, planPath);
    if (!existsSync(absPlan))
        return usageError(`no such plan file: ${absPlan}`);
    let rawPlan;
    try {
        rawPlan = JSON.parse(readFileSync(absPlan, 'utf8'));
    }
    catch (e) {
        return usageError(`unparseable plan JSON — ${e instanceof Error ? e.message : String(e)}`);
    }
    const parsed = parsePlan(rawPlan);
    if (isParseErrors(parsed)) {
        if (json)
            write(JSON.stringify({ ok: false, reason: 'plan-invalid', parseErrors: parsed, exitCode: 2 }));
        else
            for (const e of parsed)
                write(`PARSE ${e.path}: ${e.message}`);
        return 2;
    }
    const diags = validatePlan(parsed);
    if (diags.length > 0) {
        if (json)
            write(JSON.stringify({ ok: false, reason: 'plan-invalid', diagnostics: diags, exitCode: 2 }));
        else
            for (const d of diags)
                write(`${d.invariant} ${d.path}: ${d.message}`);
        return 2;
    }
    // ── numeric options ride the Number.isFinite clamp (every numeric config clamp needs it) ──
    const num = (key, scale = 1) => {
        const raw = options.get(key);
        if (raw === undefined)
            return { ok: true, value: null };
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0)
            return { ok: false, why: `--${key} must be a finite non-negative number (got ${JSON.stringify(raw)})` };
        return { ok: true, value: Math.floor(n * scale) };
    };
    const nums = {};
    for (const [key, scale] of [['budget', 1], ['max-wall-clock', 1000], ['stage-timeout', 1000], ['budget-extra', 1], ['wall-clock-extra', 1000]]) {
        const r = num(key, scale);
        if (!r.ok)
            return usageError(r.why);
        nums[key] = r.value;
    }
    const familyOpt = (key) => {
        const raw = options.get(key);
        if (raw === undefined)
            return { ok: true, value: null };
        if (raw !== 'codex' && raw !== 'openai' && raw !== 'claude')
            return { ok: false, why: `--${key} must be codex or claude (got ${JSON.stringify(raw)})` };
        return { ok: true, value: modelFamily(raw) };
    };
    const coder = familyOpt('coder-family');
    if (!coder.ok)
        return usageError(coder.why);
    const dflt = familyOpt('default-family');
    if (!dflt.ok)
        return usageError(dflt.why);
    const resumeArgs = {};
    for (const kv of optionLists.get('arg') ?? []) {
        const eq = kv.indexOf('=');
        if (eq <= 0)
            return usageError(`--arg must be k=v (got ${JSON.stringify(kv)})`);
        resumeArgs[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    const resumeId = options.get('resume') ?? null;
    const runId = options.get('run-id') ?? resumeId ?? `${parsed.name}-${randomBytes(2).toString('hex')}`;
    if (!TRACE_RUNID_RE.test(runId))
        return usageError(`runId ${JSON.stringify(runId)} fails ${String(TRACE_RUNID_RE)}`);
    if (resumeId !== null && options.get('run-id') !== undefined && options.get('run-id') !== resumeId) {
        return usageError('--run-id and --resume name different runs — a resume continues the run it names');
    }
    const runDirOpt = options.get('run-dir');
    let runDir;
    if (runDirOpt !== undefined) {
        const contained = containedUnderRoot(root, runDirOpt);
        if (!contained.ok)
            return usageError(`--run-dir ${contained.why}`);
        runDir = contained.path;
    }
    else {
        runDir = join(root, '.dz', 'loop-trace', runId); // the addressing `dz workflow-trace --run <id>` already uses
    }
    // The scripted-seam marker is established BEFORE the first refusal can emit (re-QE MINOR): an
    // EARLY refusal is still a run that would have dispatched to no real model, and a reader of that
    // envelope has the same right to know as a reader of a completed one.
    const seamScriptPath = process.env[WF_RUN_DISPATCH_SCRIPT_ENV];
    const dispatcherOverride = typeof seamScriptPath === 'string' && seamScriptPath !== '';
    const emit = (payload) => {
        write(JSON.stringify(dispatcherOverride ? { ...payload, dispatcherOverride: true } : payload));
    };
    // ── AM-7 ownership, ATOMICALLY (Step-8 HIGH-6) ──
    //
    // The previous shape read the owner marker, decided, and wrote it later — a window in which two
    // processes both saw "no live owner" and both proceeded. And the write itself was wrapped in a
    // swallowing try, so a run could execute while its durable claim silently did not exist.
    //
    // Now: check and claim happen INSIDE the named lock, the claim is `wx` (create-or-fail, so the
    // filesystem itself arbitrates), a STALE marker is only replaced under that same lock, and a
    // failure to claim FAILS THE RUN. One writer per run is not a convention here; it is an atomic
    // filesystem operation.
    const ownerPath = join(runDir, WF_RUN_OWNER_FILE);
    const startedMarker = new Date().toISOString();
    const RUN_ARTIFACTS = [WF_RUN_STATE_FILE, 'trace.jsonl', 'budget.jsonl', join('.fa-state', 'checkpoints.jsonl')];
    const claim = withNamedLockSync(root, `wf-run-${runId}`, () => {
        mkdirSync(runDir, { recursive: true });
        // ORDER MATTERS. A LIVE owner is `run-locked` whichever kind of invocation this is — that is
        // the precise fact, and it outranks "the directory has files in it". Only then does a FRESH run
        // refuse a directory that already holds a run's artifacts.
        const existingOwner = wfReadJson(ownerPath);
        if (existingOwner !== null && typeof existingOwner.pid === 'number' && wfPidAlive(existingOwner.pid)) {
            return { ok: false, reason: 'run-locked', detail: `another dz workflow run (pid ${existingOwner.pid}, started ${existingOwner.startedMarker ?? 'unknown'}) owns ${runDir} — ONE writer per run, always` };
        }
        if (resumeId === null) {
            // a FRESH run may not write into a directory that already holds ANY artifact of a run — not
            // merely one with a readable state file (a HALF-written run is exactly the dangerous case).
            // The owner marker is excluded: a dead one is stale residue, handled by the claim below.
            const found = RUN_ARTIFACTS.filter((rel) => existsSync(join(runDir, rel)));
            if (found.length > 0) {
                return {
                    ok: false,
                    reason: 'run-exists',
                    detail: `run directory ${runDir} already holds ${found.join(', ')} — pass --resume ${runId} to continue it, or choose another --run-id. A fresh run never writes into an existing run's artifacts`,
                };
            }
        }
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                writeFileSync(ownerPath, JSON.stringify({ host: WF_RUN_OWNER_HOST, pid: process.pid, runnerVersion: dzOwnVersion(), startedMarker }, null, 2) + '\n', { flag: 'wx' });
                return { ok: true };
            }
            catch (e) {
                if (e.code !== 'EEXIST') {
                    return { ok: false, reason: 'run-locked', detail: `cannot claim ${ownerPath}: ${e instanceof Error ? e.message : String(e)} — refusing to run without a durable owner record` };
                }
                const held = wfReadJson(ownerPath);
                if (held !== null && typeof held.pid === 'number' && wfPidAlive(held.pid)) {
                    return { ok: false, reason: 'run-locked', detail: `another dz workflow run (pid ${held.pid}, started ${held.startedMarker ?? 'unknown'}) owns ${runDir} — ONE writer per run, always` };
                }
                // STALE: the recorded owner is gone. Replacing it is safe HERE and only here, because this
                // whole block holds the named lock, so no concurrent claimant can be mid-decision.
                try {
                    unlinkSync(ownerPath);
                }
                catch {
                    /* someone else just cleared it; the retry's `wx` decides */
                }
            }
        }
        return { ok: false, reason: 'run-locked', detail: `could not claim ${ownerPath} after replacing a stale marker — another writer is racing for this run` };
    });
    if (!claim.ok) {
        if (json)
            emit({ schema: 'wf-run-result/1', runId, status: 'failed', reason: claim.reason, exitCode: 1 });
        else
            write(`dz workflow run: ${claim.reason} — ${claim.detail}`);
        return 1;
    }
    // ── NEW-H (re-QE): from HERE to the end, every exit path — return, throw, or completion — runs
    // the cleanup. Round 1 opened the try only around `runWorkflow`, so a `usageError` return or a
    // throw while CONSTRUCTING the dispatchers (a malformed seam file is enough) left `run-owner.json`
    // behind: a durable claim held by a process that had already exited.
    try {
        const targetCwd = root;
        const inputs = {
            plan: parsed,
            runId,
            coderFamily: coder.value ?? 'claude',
            allowSameFamilyQe: flags.has('allow-same-family-qe'),
            defaultFamily: dflt.value,
            budgetOverride: nums['budget'] ?? null,
            maxWallClockMsOverride: nums['max-wall-clock'] ?? null,
            stageTimeoutMsOverride: nums['stage-timeout'] ?? null,
            resume: resumeId,
            resumeArgs,
            budgetExtra: nums['budget-extra'] ?? null,
            wallClockExtraMs: nums['wall-clock-extra'] ?? null,
            runnerVersion: dzOwnVersion(),
            cwdRoot: targetCwd,
        };
        const pre = preflight(inputs, {
            realpath: (p) => { try {
                return realpathSync(p);
            }
            catch {
                return null;
            } },
            exists: (p) => existsSync(p),
        });
        if (!pre.ok) {
            if (json)
                emit({ schema: 'wf-run-result/1', runId, status: 'failed', reason: pre.reason, exitCode: 1 });
            else
                write(`dz workflow run: ${pre.reason} — ${pre.detail}`);
            return 1;
        }
        // ── dispatchers: the real adapters, or the scripted env TEST SEAM ──
        const scriptPath = seamScriptPath;
        let dispatchers;
        if (dispatcherOverride) {
            if (!existsSync(scriptPath))
                return usageError(`${WF_RUN_DISPATCH_SCRIPT_ENV}=${String(scriptPath)} does not exist`);
            dispatchers = { claude: wfScriptedDispatcher(scriptPath, 'claude'), openai: wfScriptedDispatcher(scriptPath, 'openai') };
        }
        else {
            wfInstallKillHandlers();
            const isolated = mkdtempSync(join(tmpdir(), 'dz-wf-run-'));
            const monotonicMs = () => Number(process.hrtime.bigint() / 1000000n);
            dispatchers = {
                claude: makeClaudePDispatcher(wfChildRunnerFor('claude'), { isolatedCwd: () => isolated, monotonicMs }),
                openai: makeCodexExecDispatcher(wfChildRunnerFor('openai'), { isolatedCwd: () => isolated, monotonicMs }),
            };
        }
        const store = wfMakeStore(runDir, root, targetCwd);
        const deps = {
            store,
            dispatchers,
            lock: (fn) => withNamedLockSync(root, `wf-run-${runId}`, fn),
            now: () => new Date().toISOString(),
            monotonicMs: () => Number(process.hrtime.bigint() / 1000000n),
            dispatcherOverride,
            planPath: relative(root, absPlan) || planPath,
            slug: parsed.name,
            // the envelope must point at THIS run's state file and reproduce THIS run's flags (HIGH-7)
            runStatePath: relative(root, join(runDir, WF_RUN_STATE_FILE)) || join(runDir, WF_RUN_STATE_FILE),
            runDirArg: runDirOpt ?? null,
            // the run-state owner records the process that actually holds the claim (HIGH-6) — `pid: 0`
            // was a durable record of a process that never existed
            ownerPid: process.pid,
            ownerStartedMarker: startedMarker,
        };
        const outcome = await runWorkflow(inputs, pre, deps);
        // A run that dispatched to NO REAL MODEL says so on every channel (Step-8 MEDIUM-11): the
        // result/pause envelope carries `dispatcherOverride`, and the human line says it in words. A seam
        // visible only inside a state file is a seam a reader of the output cannot know about.
        const seamNote = dispatcherOverride ? ' [SCRIPTED DISPATCHER — no real model ran]' : '';
        if (outcome.kind === 'paused') {
            if (!json)
                write(`dz workflow run: PAUSED (${outcome.envelope.pauseState})${seamNote} — resume with: ${outcome.envelope.resumeCmd}`);
            // the envelope is the LAST stdout line, ALWAYS (AM-16)
            emit({ ...outcome.envelope, ...(dispatcherOverride ? { dispatcherOverride: true } : {}) });
            return 75;
        }
        if (outcome.kind === 'failed') {
            if (!json)
                write(`dz workflow run: ${outcome.reason}${seamNote} — ${outcome.detail}`);
            emit(outcome.result); // a wf-run-result/1 line — and NEVER a pause envelope
            return 1;
        }
        if (!json) {
            const terminal = outcome.result.terminalRoute === undefined ? '' : ` via the plan's terminal route ${outcome.result.terminalRoute}`;
            write(`dz workflow run: completed (${runId})${terminal}${seamNote} — trace at ${join(relative(root, runDir) || '.', 'trace.jsonl')}`);
        }
        emit(outcome.result);
        return 0;
    }
    finally {
        // the claim is released exactly once, on EVERY path out of the claimed region
        try {
            unlinkSync(ownerPath);
        }
        catch { /* already gone */ }
        wfKillLiveChildren();
    }
}
function scanReqeDebts(root) {
    const out = [];
    let malformed = 0;
    /**
     * TWO scan roots (K1 — feature dz-workflow-run):
     *   `features/<slug>/.fa-state/` — the feature-adr home, the original root;
     *   `.dz/loop-trace/<runId>/.fa-state/` — the DEFAULT home of a `dz workflow run` (ADR-003).
     * Without the second root the ADR-002 waiver promise ("a waived run's debt is surfaced by
     * `dz reqe`") is FALSE for every default-homed loop run — the record would be written to a
     * directory nothing ever reads. The scan's own rules are unchanged: symlinked containers are
     * skipped, an oversize or non-plain file is NAMED as malformed rather than silently dropped, and
     * a debt whose `slug` disagrees with its directory is malformed too.
     */
    const scanRoots = [
        { base: join(root, 'features'), keyMatchesDir: true },
        // a loop run's directory is its runId; the debt's `slug` is the PLAN's name, so the two need
        // not agree — the identity check that applies under features/ does not apply here
        { base: join(root, '.dz', 'loop-trace'), keyMatchesDir: false },
    ];
    for (const scanRoot of scanRoots)
        scanOneReqeRoot(scanRoot.base, scanRoot.keyMatchesDir, out, (n) => { malformed += n; });
    return { debts: out, malformed };
}
/** One scan root's walk — extracted verbatim from the original single-root body (K1). */
function scanOneReqeRoot(featuresDir, keyMatchesDir, out, addMalformed) {
    let malformed = 0;
    let slugs = [];
    try {
        if (lstatSync(featuresDir).isSymbolicLink())
            return; // r2 #4: the container itself
        slugs = readdirSync(featuresDir);
    }
    catch {
        return;
    }
    for (const slug of slugs.sort()) {
        const dir = join(featuresDir, slug);
        const stateDir = join(dir, '.fa-state');
        const duePath = join(stateDir, 'reqe-due.json');
        try {
            if (lstatSync(dir).isSymbolicLink() || lstatSync(stateDir).isSymbolicLink())
                continue;
        }
        catch {
            continue; // no feature dir / no state dir — nothing to scan
        }
        let st;
        try {
            st = lstatSync(duePath);
        }
        catch {
            continue; // no due-file — the common, silent case
        }
        if (!st.isFile() || st.size > 64 * 1024) {
            malformed++; // exists but is not a plain small file — named, never silently dropped
            continue;
        }
        try {
            const debt = parseReqeDebt(readFileSync(duePath, 'utf-8'));
            if (debt && (!keyMatchesDir || debt.slug === slug))
                out.push({ debt, duePath, dir });
            else
                malformed++;
        }
        catch {
            malformed++;
        }
    }
    addMalformed(malformed);
}
/**
 * `dz reqe` — the re-QE debt ledger (backlog 6b40e667): list usage-switched same-family QE debts,
 * print the cross-family review brief, settle FAIL-CLOSED against a graded report.
 */
/**
 * `dz feature-adr checkpoint` — record a pipeline stage, but only after WITNESSING its artifacts.
 *
 * Why this is a command and not a line of shell (2026-08-21). The workflow script is sandboxed with
 * no filesystem, so it delegated checkpoint writes to a subagent by handing it a finished JSON line
 * and saying "append this". The subagent verified nothing. A safety classifier read that shape as one
 * party instructing another to declare a verification gate complete, and blocked NINE consecutive
 * writes in one run — router, four design substages, plan, code, qe, and the cost-ledger row. The
 * measured consequence: `.fa-state/checkpoints.jsonl` was never created, resume was silently dead,
 * and the six-hour run still reported success.
 *
 * The classifier's premise was wrong for those particular writes — every stage had run. Its instinct
 * was not: the old mechanism could not tell a real completion from a fabricated one, which is exactly
 * what a cross-family reviewer had already filed against the `fleet` stage. So the subagent now runs
 * THIS, and the verification lives in code under test instead of in the wording of a prompt.
 *
 * It measures `--artifact` paths on disk itself. A caller cannot assert presence; it can only name
 * what must be there.
 */
/**
 * `dz amendment-check` — the deterministic half of the Step-8 amendment gate (ADR-001).
 *
 * The gate used to be prompt text asking the QE agent to confirm every `AM-N` row names a real test.
 * That is layer 4 on the cost-of-detection ladder, and `features/qe-scoped-review` shipped with five
 * dangling ids and a plan recording `## Amendments: None`. This command owns I/O and the exit code;
 * `harness-core/src/amendment-trace.ts` owns the grammar and the rules.
 */
/**
 * `dz feature-adr-record` — the witnessed writer for the run-cost ledger and training pairs
 * (ADR-001 … ADR-003). The subagent stops being a COURIER handed a shell pipeline and becomes a
 * CALLER handed arguments: this command owns the paths, the refusal, the append, the READ-BACK and
 * the exit code. A courier can neither refuse nor verify, which is how four workflow runs finished
 * with no cost row at all.
 */
/**
 * The file list of the tarball `npm pack` would produce, `package/` prefix stripped. npm is the
 * authority on what `files[]` ships; reimplementing its globbing would put a second, divergent answer
 * next to the real one — which is the class of defect this whole change exists to remove.
 */
/**
 * The npm name of a pack on disk — the identity a publisher, a registry and a consumer all use.
 * `undefined` when it cannot be read, so an unestablished identity is never asserted as a match.
 */
function packNpmName(packDir) {
    try {
        const name = JSON.parse(readFileSync(join(packDir, 'package.json'), 'utf8')).name;
        return typeof name === 'string' && name !== '' ? name : undefined;
    }
    catch {
        return undefined;
    }
}
/**
 * Parse `pnpm pack --json` STDOUT robustly: a package with a `prepack` script echoes lifecycle
 * banners first, and the banner text itself may contain '[' or '{' (skills-feature-adr's guard
 * does) — so candidates are tried from the LAST line-start opener backwards; pnpm's JSON is the
 * final thing on stdout. MEASURED 2026-08-25: byte-0 parse failed on the banner, first-opener
 * parse failed on the banner's own array literal.
 */
function parsePnpmPackJson(out) {
    const starts = [];
    for (let li = 0; li < out.length; li = out.indexOf('\n', li) + 1) {
        const ch = out[li];
        if (ch === '{' || ch === '[')
            starts.push(li);
        if (out.indexOf('\n', li) === -1)
            break;
    }
    for (let ci = starts.length - 1; ci >= 0; ci--) {
        try {
            return JSON.parse(out.slice(starts[ci]));
        }
        catch { /* try an earlier candidate */ }
    }
    throw new Error('pnpm pack emitted no parseable JSON');
}
function npmPackedPaths(packDir) {
    // `pnpm`, not `npm`: the PUBLISHER is `pnpm publish` (see `publishArgv`), and the two packers do not
    // agree. MEASURED 2026-08-21 on `skills-news`: `npm pack` emits a 1051-byte package.json identical
    // to the working tree, `pnpm pack` emits 1050 — pnpm re-serialises it (dropping the trailing
    // newline, and expanding `workspace:*`). Asking one tool what ships while a different tool ships it
    // is how a signature ends up describing a file nobody receives.
    const out = execFileSync('pnpm', ['pack', '--pack-destination', mkdtempSync(join(tmpdir(), 'dz-pack-probe-')), '--json'], {
        cwd: packDir,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = parsePnpmPackJson(out);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const files = entry?.files ?? [];
    return files.map((f) => f.path.replace(/^package\//, '')).sort();
}
/**
 * Pack the package with the SAME tool that publishes it, extract the tarball, and return the directory
 * holding its contents. Hashing THAT is the only way a manifest can describe what a recipient gets:
 * `pnpm publish` re-serialises package.json and rewrites `workspace:*`, so any hash taken from the
 * working tree is stale before the tarball exists.
 */
function extractPublishTarball(packDir) {
    const tmp = mkdtempSync(join(tmpdir(), 'dz-sign-pack-'));
    try {
        return extractIntoTempDir(packDir, tmp);
    }
    catch (err) {
        // The caller never receives a cleanup for a throw, so the directory this function created must
        // be removed HERE or it leaks once per failed pack (cross-family review, 2026-08-22).
        try {
            rmSync(tmp, { recursive: true, force: true });
        }
        catch { /* best-effort */ }
        throw err;
    }
}
function extractIntoTempDir(packDir, tmp) {
    const out = execFileSync('pnpm', ['pack', '--pack-destination', tmp, '--json'], {
        cwd: packDir,
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = parsePnpmPackJson(out);
    const entry = Array.isArray(parsed) ? parsed[0] : parsed;
    const tgz = entry?.filename;
    if (tgz === undefined)
        throw new Error(`pnpm pack did not name a tarball for ${packDir}`);
    // pnpm reports an ABSOLUTE filename (it already contains --pack-destination); joining again would
    // double the directory. npm reports a bare name. Accept both rather than assuming either.
    const tgzPath = isAbsolute(tgz) ? tgz : join(tmp, tgz);
    execFileSync('tar', ['-xzf', tgzPath, '-C', tmp]);
    return { dir: join(tmp, 'package'), cleanup: () => { try {
            rmSync(tmp, { recursive: true, force: true });
        }
        catch { /* best-effort */ } } };
}
// ── `dz recap` (feature dz-recap) ────────────────────────────────────────────
//
// What was done over a day, a week or a month — and a loud refusal for anything longer, because the
// data does not reach. All the pure decisions live in harness-core/src/recap.ts; this half only
// gathers facts, and every gathering step below carries the measurement that shaped it (see
// features/dz-recap/03.5_ideation_report.md).
/** Feature-dir creation dates in ONE git pass. MEASURED: 0.099s here against 10.171s per-dir. */
function recapGitCreations(repo) {
    const dates = new Map();
    let out;
    try {
        out = execFileSync('git', ['log', '--diff-filter=A', '--name-only', '--format=%aI', '--', 'features/'], {
            cwd: repo, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024,
        });
    }
    catch {
        return { dates, ok: false };
    }
    let commitIso = '';
    for (const raw of out.split('\n')) {
        const line = raw.trim();
        if (line === '')
            continue;
        if (!line.startsWith('features/')) {
            commitIso = line;
            continue;
        }
        if (commitIso === '')
            continue;
        const parts = line.split('/');
        // `features/` also holds loose .md files committed directly into it — 5 of them, measured. A
        // naive parts[1] would file each of those as a slug.
        if (parts.length < 3)
            continue;
        // git walks newest to oldest, so the LAST write per slug is its creation. Taking the min of the
        // date STRINGS is wrong when commits carry different UTC offsets (reproduced on alpha-to-rc:
        // string-min picked 07:06:49+00:00 over 08:00:40+03:00, which is 05:00:40Z and earlier).
        dates.set(parts[1], commitIso);
    }
    return { dates, ok: true };
}
function recapDeliveries(repo, write) {
    const featuresDir = join(repo, 'features');
    if (!existsSync(featuresDir))
        return { facts: null, uncommitted: [] };
    const { dates, ok } = recapGitCreations(repo);
    if (!ok) {
        write('dz recap: git log unavailable — the deliveries section cannot be read');
        return { facts: null, uncommitted: [] };
    }
    // Scoped to the TOP-LEVEL features/ only. Six worktrees are live in this repo and one carries its
    // own diverged .dz store; a recursive walk would merge two chronologies.
    const onDisk = readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    const items = [];
    const uncommitted = [];
    for (const slug of onDisk) {
        const created = dates.get(slug);
        if (created === undefined) {
            uncommitted.push(slug);
            continue;
        }
        const reportPath = join(featuresDir, slug, '08_qe_report.md');
        if (!existsSync(reportPath)) {
            items.push({ slug, createdIso: created, gradeStatus: 'no-report', grade: null });
            continue;
        }
        let reading;
        try {
            reading = readQeGrade(readFileSync(reportPath, 'utf-8'));
        }
        catch {
            reading = { status: 'none', grade: null };
        }
        // `Delivery` is a discriminated union: `unique` MUST carry a grade, everything else MUST carry
        // null. Narrowing here is what keeps "graded" and "we have a grade" the same statement.
        items.push(reading.status === 'unique' && typeof reading.grade === 'string'
            ? { slug, createdIso: created, gradeStatus: 'unique', grade: reading.grade }
            : { slug, createdIso: created, gradeStatus: reading.status === 'unique' ? 'none' : reading.status, grade: null });
    }
    const starts = [...dates.values()].sort();
    return { facts: { dataStart: starts.length > 0 ? starts[0].slice(0, 10) : null, items }, uncommitted };
}
/** Read a JSONL store defensively: BOTH stores grew fields over time, with no schema marker. */
function recapReadJsonl(path) {
    if (!existsSync(path))
        return null;
    try {
        return readFileSync(path, 'utf-8').split('\n').filter((l) => l.trim() !== '').flatMap((l) => {
            try {
                return [JSON.parse(l)];
            }
            catch {
                return [];
            }
        });
    }
    catch {
        return null;
    }
}
function recapGuard(repo) {
    const rows = recapReadJsonl(join(repo, '.dz', 'guard-audit.jsonl'));
    if (rows === null)
        return null;
    const items = [];
    for (const r of rows) {
        const iso = typeof r['ts'] === 'string' ? r['ts'] : null;
        if (iso === null)
            continue;
        const violations = Array.isArray(r['violations']) ? r['violations'] : [];
        const rules = violations.map((v) => (typeof v['rule'] === 'string' ? v['rule'] : '')).filter((s) => s !== '');
        items.push({ iso, verdict: typeof r['verdict'] === 'string' ? r['verdict'] : 'unknown', rules });
    }
    const sorted = items.map((i) => i.iso).sort();
    return { dataStart: sorted.length > 0 ? sorted[0].slice(0, 10) : null, items };
}
/** Probe rows that join to no lesson. Measured: `teach:zzz` and `teach:probe` are test pollution. */
const RECAP_PROBE_IDS = new Set(['teach:zzz', 'teach:probe']);
function recapReuse(repo, window) {
    const rows = recapReadJsonl(join(repo, '.dz', 'recall-usage.jsonl'));
    if (rows === null)
        return null;
    const recalled = new Set();
    let eventsInWindow = 0;
    let earliest = null;
    for (const r of rows) {
        const iso = typeof r['ts'] === 'string' ? r['ts'] : null;
        const id = typeof r['dzId'] === 'string' ? r['dzId'] : null;
        if (iso === null || id === null || RECAP_PROBE_IDS.has(id))
            continue;
        if (earliest === null || iso < earliest)
            earliest = iso;
        recalled.add(id);
        if (withinWindow(window, iso))
            eventsInWindow++;
    }
    let lessonsTotal = 0;
    try {
        lessonsTotal = loadStorePatternsSync(repo).length;
    }
    catch {
        lessonsTotal = 0;
    }
    return {
        dataStart: earliest === null ? null : earliest.slice(0, 10),
        eventsInWindow,
        lessonsEverRecalled: recalled.size,
        lessonsTotal,
    };
}
/** Publishes come from a cache ONLY. 51 packages cost 18.3s over the network — never inside a report. */
function recapPublishes(repo) {
    const path = join(repo, '.dz', 'recap', 'npm-times.json');
    if (!existsSync(path))
        return null;
    try {
        const raw = JSON.parse(readFileSync(path, 'utf-8'));
        const items = [];
        for (const [pkg, entry] of Object.entries(raw.packages ?? {})) {
            for (const [version, iso] of Object.entries(entry.versions ?? {})) {
                if (version === 'created' || version === 'modified')
                    continue;
                items.push({ pkg, version, iso });
            }
        }
        const sorted = items.map((i) => i.iso).sort();
        return {
            dataStart: sorted.length > 0 ? sorted[0].slice(0, 10) : null,
            items,
            ...(typeof raw.fetchedAt === 'string' ? { fetchedAt: raw.fetchedAt } : {}),
            ...(Array.isArray(raw.failed) && raw.failed.length > 0 ? { failed: raw.failed.filter((f) => typeof f === 'string') } : {}),
        };
    }
    catch {
        return null;
    }
}
// ── `dz provenance-check` (feature provenance-gate) ──────────────────────────
//
// Nothing goes out citing a source that may not leave this machine. The decisions are pure and live
// in harness-core/src/provenance.ts; this half runs the oracle, and every step below carries the
// measurement that shaped it (features/provenance-gate/03.5_ideation_report.md).
/** The tracked file that declares which store records may be cited. Tracked ON PURPOSE (ADR-001). */
const PROVENANCE_PUBLIC_REL = 'provenance-public.json';
/**
 * Resolve one source path, and refuse anything that lands outside the repository.
 *
 * `realpathSync` is the point: `git check-ignore` classifies the STRING and never dereferences a
 * symlink, so `allowed/pointer.md → ../secret/note.md` came back "not ignored" while `cat` printed
 * the secret (MEASURED 2026-08-22 in a clean temp repo). Classifying the resolved target closes it.
 */
function provenanceResolve(repoRoot, source) {
    try {
        const abs = isAbsolute(source) ? source : join(repoRoot, source);
        const real = realpathSync(abs);
        const rootReal = realpathSync(repoRoot);
        // `startsWith` alone would accept a sibling directory whose name merely extends the root's.
        if (real !== rootReal && !real.startsWith(rootReal + sep))
            return null;
        return real;
    }
    catch {
        return null;
    }
}
/**
 * Ask git which of these paths are ignored — ONE batch call, and `null` when it did not run.
 *
 * Two measured hazards, both closed here:
 *  - `git check-ignore` resolves a relative path against the PROCESS CWD, so the same manifest that
 *    blocked from the repo root cleared everything from a subdirectory, with no error and no
 *    non-zero exit. Always `git -C <root>`, and always absolute paths.
 *  - one out-of-repo path anywhere in the batch prints the matches found so far and then dies with
 *    exit 128, dropping every path queued behind it. So callers must filter those out first, and
 *    any exit outside {0,1} is an ORACLE FAILURE for the whole batch, never partial credit.
 */
const PROVENANCE_CANARY = 'dz-provenance-canary';
/**
 * Prove the oracle actually answers before believing its silence.
 *
 * `git check-ignore` returns exit 1 for "none of these are ignored" — which is indistinguishable
 * from a `git` on PATH that does nothing and exits 1, and that reading clears EVERY path
 * (cross-family review, codex `gpt-5.6-sol`, 2026-08-22). So each run first asks a question whose
 * answer is known: a canary name made ignorable through a private excludes file. A real git says
 * "ignored"; anything that cannot is not a usable oracle.
 *
 * The private excludes file is passed only on THIS call, so it cannot alter a real verdict —
 * verified by running: with the canary file supplied, `README.md` is still not ignored.
 */
function provenanceOracleAlive(repoRoot) {
    let excludes = '';
    try {
        excludes = join(mkdtempSync(join(tmpdir(), 'dz-prov-canary-')), 'excludes');
        writeFileSync(excludes, `${PROVENANCE_CANARY}\n`);
        const probe = spawnSync('git', ['-C', repoRoot, '-c', `core.excludesFile=${excludes}`, 'check-ignore', '-q', PROVENANCE_CANARY], { encoding: 'utf-8' });
        return probe.error === undefined && probe.status === 0;
    }
    catch {
        return false;
    }
    finally {
        try {
            if (excludes !== '')
                rmSync(dirname(excludes), { recursive: true, force: true });
        }
        catch { /* best-effort */ }
    }
}
function provenanceIgnored(repoRoot, absPaths) {
    if (!provenanceOracleAlive(repoRoot))
        return null;
    if (absPaths.length === 0)
        return new Set();
    // `-z` on BOTH sides. Without it a path containing a NEWLINE splits into two records, and the
    // gate answers about a path nobody asked about — a filename may legally contain a newline on
    // Linux, and one was constructed to prove it (cross-family review, 2026-08-22).
    const res = spawnSync('git', ['-C', repoRoot, 'check-ignore', '-z', '--stdin', '--no-index'], {
        input: `${absPaths.join('\0')}\0`,
        encoding: 'utf-8',
        maxBuffer: 16 * 1024 * 1024,
    });
    // 0 = at least one ignored, 1 = none ignored. Anything else (128 fatal, a signal, a missing git)
    // means the question was not answered, and an unanswered question is not an all-clear.
    if (res.error !== undefined || res.status === null || (res.status !== 0 && res.status !== 1))
        return null;
    return new Set((res.stdout ?? '').split('\0').filter((l) => l !== ''));
}
function cmdProvenanceCheck(options, flags, cwd, write) {
    const repoRoot = resolve(options.get('project') ?? cwd);
    const json = flags.has('json');
    const manifestPath = (options.get('manifest') ?? '').trim();
    if (manifestPath === '') {
        write('dz provenance-check: --manifest <sources.json> is required');
        return 2;
    }
    let manifest = null;
    try {
        // The manifest path is the USER's, so it resolves against the CWD they typed it in — not
        // against --project, which names the repository the sources belong to. Resolving it against
        // the repo root made `--manifest ../sources.json --project ..` read a file outside the tree
        // and report NOT ESTABLISHED for a manifest that was right there.
        manifest = parseSourceManifest(readFileSync(resolve(cwd, manifestPath), 'utf-8'));
    }
    catch {
        manifest = null;
    }
    // The public-records list is read from a GIT-TRACKED, COMMITTED file, so declaring a record public
    // is an act that shows up in a diff someone reviewed. Round 2 of the cross-family review found the
    // first version calling the file "tracked" and never checking it: an untracked file the drafting
    // process wrote itself cleared any record it liked, and the whole review argument collapsed.
    //
    // Both halves are load-bearing. TRACKED alone is not enough — a tracked file with uncommitted
    // edits has been through no review either.
    const publicRecords = new Set();
    let listUntrusted = null;
    if (existsSync(join(repoRoot, PROVENANCE_PUBLIC_REL))) {
        // Read the COMMITTED blob, never the working copy. Round 5 of the cross-family review found the
        // list guarded by `git status`, which `--assume-unchanged` blinds — the same bypass already
        // closed for cited paths, left open one file away. Reading `HEAD:<path>` removes the question
        // instead of answering it: the gate sees exactly what was reviewed, whatever sits on disk.
        const show = spawnSync('git', ['-C', repoRoot, 'show', `HEAD:${PROVENANCE_PUBLIC_REL}`], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
        if (show.error !== undefined || show.status !== 0) {
            listUntrusted = `${PROVENANCE_PUBLIC_REL} is not committed, so nothing in it was ever reviewed — a record cannot be cleared by a list the drafting process could have written itself`;
        }
        else {
            try {
                const raw = JSON.parse(show.stdout ?? '');
                if (Array.isArray(raw.records))
                    for (const r of raw.records)
                        if (typeof r === 'string')
                            publicRecords.add(r);
            }
            catch {
                listUntrusted = `the committed ${PROVENANCE_PUBLIC_REL} could not be parsed`;
            }
        }
    }
    // A list that exists but cannot be trusted is NOT the same as no list: the operator plainly meant
    // to use it. Silently emptying it would refuse records for a reason that names the wrong problem.
    if (listUntrusted !== null) {
        const dead = { outcome: 'not-established', exit: 3, claims: [], reason: listUntrusted };
        if (json)
            write(JSON.stringify(dead));
        else
            for (const line of renderSourceProvenance(dead))
                write(line);
        return 3;
    }
    const resolved = new Map();
    const toAsk = [];
    for (const c of manifest?.claims ?? []) {
        if (c.kind !== 'path' || typeof c.source !== 'string' || c.source.trim() === '')
            continue;
        const src = c.source.trim();
        if (resolved.has(src))
            continue;
        const real = provenanceResolve(repoRoot, src);
        resolved.set(src, real);
        if (real !== null)
            toAsk.push(real); // out-of-repo paths NEVER reach the batch call
    }
    // Three questions, not one: ignored (refused by the owner), tracked (reviewed at all), and clean
    // (reviewed in its CURRENT state). A file the drafting process wrote a second ago answers "no" to
    // the first and would have been cleared by a gate that only asked it.
    const tracked = new Set();
    const dirty = new Set();
    if (toAsk.length > 0) {
        const ls = spawnSync('git', ['-C', repoRoot, 'ls-files', '-z', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
        if (ls.error === undefined && ls.status === 0) {
            for (const rel of (ls.stdout ?? '').split('\0'))
                if (rel !== '')
                    tracked.add(resolve(repoRoot, rel));
        }
        // "Clean" is decided by CONTENT, not by `git status`. MEASURED 2026-08-22: after
        // `git update-index --assume-unchanged cited.md`, replacing the file's contents outright leaves
        // `git status --porcelain` EMPTY, so a status-based check clears a file whose bytes no longer
        // match anything anyone reviewed (cross-family review round 4). Comparing the blob hash on disk
        // against the one in HEAD sees the swap; it also subsumes staged-but-uncommitted.
        // `--no-filters` is not a detail. A `.gitattributes` clean filter runs on hash-object, so a
        // filter that strips content makes a modified file hash IDENTICAL to its committed blob —
        // MEASURED 2026-08-22: with `filter.strip.clean = head -c 7`, appending confidential text left
        // the hash unchanged (round 6). We compare the bytes on disk, not the bytes git would store.
        const onDisk = spawnSync('git', ['-C', repoRoot, 'hash-object', '--no-filters', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
        const inHead = spawnSync('git', ['-C', repoRoot, 'ls-tree', '-z', 'HEAD', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
        if (onDisk.error !== undefined || onDisk.status !== 0 || inHead.error !== undefined || inHead.status !== 0) {
            // Cannot compare ⇒ cannot clear. Every candidate is treated as unreviewed rather than clean.
            for (const p of toAsk)
                dirty.add(p);
        }
        else {
            const diskHashes = (onDisk.stdout ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
            const headHash = new Map();
            for (const rec of (inHead.stdout ?? '').split('\0')) {
                if (rec === '')
                    continue;
                const tab = rec.indexOf('\t');
                if (tab < 0)
                    continue;
                const parts = rec.slice(0, tab).split(/\s+/);
                headHash.set(resolve(repoRoot, rec.slice(tab + 1)), parts[2] ?? '');
            }
            toAsk.forEach((abs, i) => {
                const committed = headHash.get(abs);
                if (committed === undefined || committed !== diskHashes[i])
                    dirty.add(abs);
            });
        }
    }
    const decision = decideSourceProvenance(manifest, {
        ignoredPaths: provenanceIgnored(repoRoot, toAsk),
        publicRecords,
        resolved,
        trackedPaths: tracked,
        dirtyPaths: dirty,
    });
    if (json)
        write(JSON.stringify(decision));
    else
        for (const line of renderSourceProvenance(decision))
            write(line);
    return decision.exit;
}
// ── `dz name-check` (feature name-check) ─────────────────────────────────────
//
// Is this name free, before a line of code is written? Twice in one day a collision broke the build
// outright — `dz retro` was already a command, `decideProvenance` already an export — and both were
// answerable in advance. The decisions are pure and live in harness-core/src/name-check.ts; this half
// scans the workspace SOURCE, never `dist` (ADR-001: a stale build answers "free" confidently).
function nameCheckScan(repoRoot) {
    const pkgsRoot = join(repoRoot, 'packages', '@dzhechkov');
    if (!existsSync(pkgsRoot))
        return { commands: new Set(), modules: new Map(), exports: new Map(), scanFailed: true };
    const commands = new Set();
    const modules = new Map();
    const exportsFound = new Map();
    let files = 0;
    let packages = 0;
    try {
        for (const pkg of readdirSync(pkgsRoot, { withFileTypes: true })) {
            if (!pkg.isDirectory())
                continue;
            const srcDir = join(pkgsRoot, pkg.name, 'src');
            if (!existsSync(srcDir))
                continue;
            packages++;
            for (const f of readdirSync(srcDir, { withFileTypes: true })) {
                if (!f.isFile() || !f.name.endsWith('.ts') || f.name.endsWith('.d.ts'))
                    continue;
                const rel = `${pkg.name}/src/${f.name}`;
                const base = f.name.replace(/\.ts$/, '');
                if (!modules.has(base))
                    modules.set(base, rel);
                const text = readFileSync(join(srcDir, f.name), 'utf-8');
                files++;
                // Prefer the file that DECLARES a name over an `index.ts` that merely re-exports it: the
                // author needs to know where to look, and "it is in index.ts" points at the wiring, not the
                // owner. First writer wins otherwise, so a barrel scanned first would hide every source.
                for (const n of exportedNamesIn(text)) {
                    const known = exportsFound.get(n);
                    if (known === undefined || (known.endsWith('/index.ts') && f.name !== 'index.ts'))
                        exportsFound.set(n, rel);
                }
                // Command names come from the dispatcher AND from the help block: a name that dispatches but
                // is undocumented is still taken, and so is the reverse.
                if (f.name === 'cli.ts') {
                    for (const c of dispatchedCommandsIn(text))
                        commands.add(c);
                    const help = /^\s{2}dz ([a-z][a-z0-9-]*)/gm;
                    for (let m = help.exec(text); m !== null; m = help.exec(text))
                        if (m[1] !== undefined)
                            commands.add(m[1]);
                }
            }
        }
    }
    catch {
        return { commands: new Set(), modules: new Map(), exports: new Map(), scanFailed: true };
    }
    // A scan that read nothing is not a scan. Reporting "free" off an empty sweep is the same defect
    // as a gate that passes because it never ran. What the sweep SAW travels with the facts, so the
    // operator can see whether it looked at a workspace or at a directory of the right shape.
    if (files === 0)
        return { commands: new Set(), modules: new Map(), exports: new Map(), scanFailed: true };
    return { commands, modules, exports: exportsFound, scanned: { packages, files, exports: exportsFound.size, commands: commands.size } };
}
function cmdNameCheck(options, flags, cwd, write) {
    const repoRoot = resolve(options.get('project') ?? cwd);
    const json = flags.has('json');
    const queries = [];
    const push = (kind, raw) => {
        for (const n of (raw ?? '').split(',').map((s) => s.trim()).filter((s) => s !== ''))
            queries.push({ kind, name: n });
    };
    push('command', options.get('command'));
    push('module', options.get('module'));
    push('export', options.get('export'));
    const facts = nameCheckScan(repoRoot);
    const decision = decideNameCheck(queries, facts);
    if (json)
        write(JSON.stringify(decision));
    else
        for (const line of renderNameCheck(decision, facts.scanned))
            write(line);
    return decision.exit;
}
// ── recap publish-times cache (feature recap-publish-cache) ──────────────────
//
// The Publishes section is the one recap section whose timestamps a third party holds — and the one
// that was always `unavailable`, because nothing ever filled its cache. The fetch lives HERE, behind
// an explicit flag, never inside the report: 51 packages cost 18.3s sequentially (measured in the
// recap design), and a report that does network I/O is a report that fails when the network does.
const RECAP_NPM_CACHE_REL = '.dz/recap/npm-times.json';
/**
 * Ask the registry when every non-private workspace package's versions were published.
 *
 * Genuinely parallel in batches of 8 (`execFile`, not `spawnSync` — a sync call in a loop stays
 * sequential whatever the batch size claims, which is exactly the kind of false label this pipeline
 * keeps removing): measured in the recap design at 5.7s against 18.3s sequential over 51 packages.
 * A package whose lookup fails lands in `failed`, never silently absent — the same class as the
 * scout 401 that printed `github: 0` and read as "nothing new exists".
 */
async function fetchNpmPublishTimes(repoRoot, write) {
    const pkgsRoot = join(repoRoot, 'packages', '@dzhechkov');
    const names = [];
    if (existsSync(pkgsRoot)) {
        for (const e of readdirSync(pkgsRoot, { withFileTypes: true })) {
            if (!e.isDirectory())
                continue;
            const pj = join(pkgsRoot, e.name, 'package.json');
            if (!existsSync(pj))
                continue;
            try {
                const meta = JSON.parse(readFileSync(pj, 'utf-8'));
                if (meta.private === true || typeof meta.name !== 'string' || meta.name === '')
                    continue;
                // Deduplicated: two workspace directories can declare one npm name, and a failure would
                // then count twice — "2 FAILED" about one distinct package (review round 2).
                if (!names.includes(meta.name))
                    names.push(meta.name);
            }
            catch { /* an unreadable package.json is not a publishable package */ }
        }
    }
    const packages = {};
    const failed = [];
    const one = (name) => new Promise((done) => {
        execFile('npm', ['view', name, 'time', '--json'], { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
            if (err !== null) {
                failed.push(name);
                done();
                return;
            }
            try {
                const times = JSON.parse(stdout);
                const versions = {};
                for (const [k, v] of Object.entries(times)) {
                    if (k === 'created' || k === 'modified' || typeof v !== 'string')
                        continue;
                    versions[k] = v;
                }
                // A published package has at least one version by construction — npm will not host an
                // empty one. Valid-but-empty JSON is therefore an ANOMALY, not a zero: recording it as a
                // success would let the report read "0 publishes" about a package whose answer was broken
                // (cross-family review, codex gpt-5.6-sol, 2026-08-24, grade B).
                if (Object.keys(versions).length === 0)
                    failed.push(name);
                else
                    packages[name] = { versions };
            }
            catch {
                failed.push(name);
            }
            done();
        });
    });
    const BATCH = 8;
    for (let i = 0; i < names.length; i += BATCH) {
        await Promise.all(names.slice(i, i + BATCH).map(one));
        write(`dz recap: registry queried ${Math.min(i + BATCH, names.length)}/${names.length}…`);
    }
    // `failed` sorted so the cache is deterministic for a given outcome set.
    return { version: 1, fetchedAt: new Date().toISOString(), packages, failed: [...failed].sort() };
}
// ── `dz tg-post` (feature genai-tweets-channel, стадия 0→1) ──────────────────
//
// The sender for an APPROVED draft, implementing the channel's own accepted ADRs: HTML mode (never
// MarkdownV2 — 18 escapes against 3), link preview off by default (x.com previews in Telegram have
// been broken since 2022), the 00:00-06:00 MSK quiet window, and ADR-004's standing order that
// publishing stays MANUAL — the default run is a dry-run, and a real send needs --send --yes.
//
// The provenance gate runs IN-PROCESS before any send: the draft's sources.json goes through the
// same classification `dz provenance-check` uses, and anything but ALLOWED refuses. A draft with no
// manifest is refused too — unchecked is not approved.
function tgReadToken(repoRoot, write) {
    // Token sources, in order: env, then a tokenFile named in .dz/config.json. The token itself is
    // NEVER printed, logged, or included in any error — only where it was looked for.
    const env = process.env['TELEGRAM_BOT_TOKEN'];
    if (env !== undefined && env.trim() !== '')
        return env.trim();
    try {
        const cfg = JSON.parse(readFileSync(join(repoRoot, '.dz', 'config.json'), 'utf-8'));
        const file = cfg.telegram?.tokenFile;
        if (typeof file === 'string' && file.trim() !== '' && existsSync(file)) {
            const text = readFileSync(file, 'utf-8');
            const m = /TELEGRAM_BOT_TOKEN\s*=\s*"?([^"\n]+)"?/.exec(text);
            if (m?.[1] !== undefined)
                return m[1].trim();
            const bare = text.trim();
            if (bare !== '' && !bare.includes('\n'))
                return bare;
        }
    }
    catch { /* fall through to the honest null */ }
    write('dz tg-post: no bot token — set TELEGRAM_BOT_TOKEN or telegram.tokenFile in .dz/config.json');
    return null;
}
function tgApi(token, method, body) {
    return new Promise((done) => {
        const payload = JSON.stringify(body);
        const req = httpsRequest({
            hostname: 'api.telegram.org',
            path: `/bot${token}/${method}`,
            method: 'POST',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
            timeout: 30_000,
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c.toString('utf-8'); });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    done({ ok: parsed.ok === true, ...(typeof parsed.description === 'string' ? { description: parsed.description } : {}), ...(typeof parsed.result?.message_id === 'number' ? { messageId: parsed.result.message_id } : {}) });
                }
                catch {
                    done({ ok: false, description: `unparseable response (HTTP ${res.statusCode ?? '?'})` });
                }
            });
        });
        req.on('error', (e) => done({ ok: false, description: e.message }));
        req.on('timeout', () => { req.destroy(); done({ ok: false, description: 'timeout after 30s' }); });
        req.write(payload);
        req.end();
    });
}
async function cmdTgPost(options, flags, cwd, write) {
    const repoRoot = resolve(options.get('project') ?? cwd);
    const json = flags.has('json');
    const draftPath = (options.get('draft') ?? '').trim();
    if (draftPath === '') {
        write('dz tg-post: --draft <file.html> is required');
        return 2;
    }
    let draft;
    try {
        draft = readFileSync(resolve(cwd, draftPath), 'utf-8');
    }
    catch {
        write(`dz tg-post: cannot read draft ${draftPath}`);
        return 2;
    }
    const issues = tgPostHtmlIssues(draft);
    // Provenance, in-process. `--manifest` names the draft's sources; its absence is a refusal at the
    // decision layer, not a quiet pass here.
    let provenanceOutcome = 'skipped';
    const manifestPath = (options.get('manifest') ?? '').trim();
    if (manifestPath !== '') {
        let manifest = null;
        try {
            manifest = parseSourceManifest(readFileSync(resolve(cwd, manifestPath), 'utf-8'));
        }
        catch {
            manifest = null;
        }
        const publicRecords = new Set();
        const show = spawnSync('git', ['-C', repoRoot, 'show', `HEAD:${PROVENANCE_PUBLIC_REL}`], { encoding: 'utf-8', maxBuffer: 8 * 1024 * 1024 });
        if (show.error === undefined && show.status === 0) {
            try {
                const raw = JSON.parse(show.stdout ?? '');
                if (Array.isArray(raw.records))
                    for (const r of raw.records)
                        if (typeof r === 'string')
                            publicRecords.add(r);
            }
            catch { /* an unparseable committed list clears nothing */ }
        }
        const resolved = new Map();
        const toAsk = [];
        for (const c of manifest?.claims ?? []) {
            if (c.kind !== 'path' || typeof c.source !== 'string' || c.source.trim() === '')
                continue;
            const src = c.source.trim();
            if (resolved.has(src))
                continue;
            const real = provenanceResolve(repoRoot, src);
            resolved.set(src, real);
            if (real !== null)
                toAsk.push(real);
        }
        const tracked = new Set();
        const dirty = new Set();
        if (toAsk.length > 0) {
            const ls = spawnSync('git', ['-C', repoRoot, 'ls-files', '-z', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
            if (ls.error === undefined && ls.status === 0) {
                for (const rel of (ls.stdout ?? '').split('\0'))
                    if (rel !== '')
                        tracked.add(resolve(repoRoot, rel));
            }
            const onDisk = spawnSync('git', ['-C', repoRoot, 'hash-object', '--no-filters', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
            const inHead = spawnSync('git', ['-C', repoRoot, 'ls-tree', '-z', 'HEAD', '--', ...toAsk], { encoding: 'utf-8', maxBuffer: 16 * 1024 * 1024 });
            if (onDisk.error !== undefined || onDisk.status !== 0 || inHead.error !== undefined || inHead.status !== 0) {
                for (const p of toAsk)
                    dirty.add(p);
            }
            else {
                const diskHashes = (onDisk.stdout ?? '').split('\n').map((l) => l.trim()).filter((l) => l !== '');
                const headHash = new Map();
                for (const rec of (inHead.stdout ?? '').split('\0')) {
                    if (rec === '')
                        continue;
                    const tab = rec.indexOf('\t');
                    if (tab < 0)
                        continue;
                    const parts = rec.slice(0, tab).split(/\s+/);
                    headHash.set(resolve(repoRoot, rec.slice(tab + 1)), parts[2] ?? '');
                }
                toAsk.forEach((abs, i) => {
                    const committed = headHash.get(abs);
                    if (committed === undefined || committed !== diskHashes[i])
                        dirty.add(abs);
                });
            }
        }
        const decision = decideSourceProvenance(manifest, {
            ignoredPaths: provenanceIgnored(repoRoot, toAsk),
            publicRecords,
            resolved,
            trackedPaths: tracked,
            dirtyPaths: dirty,
        });
        provenanceOutcome = decision.outcome;
        if (!json)
            for (const line of renderSourceProvenance(decision))
                write(line);
    }
    // ADR-005 autopublish guards: read the stop-cord and the send journal as FACTS, then let the pure
    // decideTgSend judge. An UNREADABLE journal stays undefined ⇒ decideTgSend fails closed on G4/G5.
    const tgDir = join(repoRoot, '.dz', 'tg-post');
    const halted = existsSync(join(tgDir, 'HALT'));
    const sha256 = tgVisibleSha256(draft);
    let sentLog;
    const sentLogPath = join(tgDir, 'sent-log.jsonl');
    if (!existsSync(sentLogPath)) {
        sentLog = []; // no journal yet is an EMPTY journal, not an unreadable one — a fresh channel sends
    }
    else {
        try {
            sentLog = [];
            for (const line of readFileSync(sentLogPath, 'utf-8').split('\n')) {
                if (line.trim() === '')
                    continue;
                const r = JSON.parse(line);
                if (typeof r.sha256 === 'string' && typeof r.ts === 'string') {
                    sentLog.push({ sha256: r.sha256, ts: r.ts, ...(r.status === 'pending' || r.status === 'sent' ? { status: r.status } : {}) });
                }
            }
        }
        catch {
            sentLog = undefined; // genuinely unreadable ⇒ fail-closed
        }
    }
    const decision = decideTgSend({
        issues,
        provenanceOutcome,
        confirmed: flags.has('send') && flags.has('yes'),
        nowUtcIso: new Date().toISOString(),
        nightOverride: flags.has('night'),
        halted,
        sha256,
        sentLog,
        maxPostsPerDay: (() => { const n = Number(options.get('max-per-day')); return Number.isFinite(n) && n > 0 ? n : 10; })(),
    });
    const visible = tgVisibleLength(draft);
    if (!json) {
        for (const i of issues)
            write(`  [${i.kind}] ${i.detail}`);
        write(`dz tg-post: ${decision.action === 'send' ? 'SENDING' : 'DRY-RUN / REFUSED'} — ${decision.reason}`);
        write(`  ${visible} visible character(s) of ${TG_TEXT_LIMIT}; provenance: ${provenanceOutcome}`);
    }
    if (decision.action !== 'send') {
        if (json)
            write(JSON.stringify({ ok: false, action: decision.action, reason: decision.reason, issues, visible, provenance: provenanceOutcome }));
        // A refused send exits 1; a clean DRY-RUN (no --send asked) exits 0 — asking to see is not a failure.
        return flags.has('send') ? 1 : issues.length > 0 ? 1 : 0;
    }
    const token = tgReadToken(repoRoot, write);
    if (token === null)
        return 2;
    const channel = (options.get('channel') ?? '').trim();
    if (channel === '') {
        write('dz tg-post: --channel @name (or a chat id) is required to send');
        return 2;
    }
    // Two-phase journal (Codex A-): write a PENDING row BEFORE the network call. If the process dies
    // between send and the sent-row, G5 dedup sees this pending row on the next run and refuses to
    // double-publish. Best-effort — a pending-write failure is warned, not fatal (better to risk one
    // duplicate than to block a legitimate send on a full disk).
    try {
        mkdirSync(tgDir, { recursive: true });
        appendFileSync(sentLogPath, JSON.stringify({ sha256, ts: new Date().toISOString(), channel, status: 'pending' }) + '\n');
    }
    catch (e) {
        write(`dz tg-post: WARNING — could not write the PENDING journal row (${e.message}); the crash-window dedup guard is degraded for this send`);
    }
    const sent = await tgApi(token, 'sendMessage', {
        chat_id: channel,
        text: draft,
        parse_mode: 'HTML',
        // ADR-004: x.com previews in Telegram are broken — never rely on them.
        link_preview_options: { is_disabled: !flags.has('preview') },
    });
    if (!sent.ok) {
        write(`dz tg-post: Telegram refused — ${sent.description ?? 'no description'}`);
        if (json)
            write(JSON.stringify({ ok: false, action: 'send', reason: sent.description ?? 'refused', visible }));
        return 1;
    }
    // Record the send AFTER Telegram accepted it (never before — a failed send must not eat the daily
    // limit or block a retry via dedup). Best-effort append; a journal write failure is logged, not
    // fatal — the post already went out.
    try {
        mkdirSync(tgDir, { recursive: true });
        appendFileSync(sentLogPath, JSON.stringify({ sha256, ts: new Date().toISOString(), channel, messageId: sent.messageId ?? null, status: 'sent' }) + '\n');
    }
    catch (e) {
        write(`dz tg-post: WARNING — sent, but could not record it in ${sentLogPath} (${e.message}) — the daily limit and dedup may under-count until fixed`);
    }
    write(`dz tg-post: sent to ${channel}${sent.messageId !== undefined ? ` (message ${sent.messageId})` : ''}`);
    if (json)
        write(JSON.stringify({ ok: true, action: 'send', channel, messageId: sent.messageId ?? null, visible }));
    return 0;
}
async function cmdRecap(options, flags, cwd, write) {
    const repo = resolve(options.get('project') ?? cwd);
    const json = flags.has('json');
    if (flags.has('refresh-publishes')) {
        const cache = await fetchNpmPublishTimes(repo, json ? () => { } : write);
        const cachePath = join(repo, ...RECAP_NPM_CACHE_REL.split('/'));
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
        if (!json) {
            write(`dz recap: publish-times cache written — ${Object.keys(cache.packages).length} package(s)${cache.failed.length > 0 ? `, ${cache.failed.length} FAILED: ${cache.failed.join(', ')}` : ''}`);
        }
    }
    // Every horizon is RECOGNISED, including the refused ones — swallowing `--year` silently would be
    // the same defect as a gate that passes because it never ran.
    const asked = ['day', 'week', 'month', ...REFUSED_HORIZONS].filter((h) => flags.has(h));
    if (asked.length > 1) {
        write(`dz recap: pick ONE horizon, not ${asked.length}`);
        return 2;
    }
    const requested = asked[0] ?? 'week';
    const at = (options.get('at') ?? new Date().toISOString()).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(at)) {
        write(`dz recap: --at must be an ISO date (YYYY-MM-DD), got ${JSON.stringify(at)}`);
        return 2;
    }
    const deliveries = recapDeliveries(repo, write);
    const guard = recapGuard(repo);
    const publishes = recapPublishes(repo);
    const starts = [deliveries.facts?.dataStart, guard?.dataStart, publishes?.dataStart]
        .filter((d) => typeof d === 'string').sort();
    const spanDays = starts.length === 0 ? 0
        : Math.max(0, Math.round((Date.parse(`${at.slice(0, 10)}T00:00:00Z`) - Date.parse(`${starts[0]}T00:00:00Z`)) / 86_400_000));
    const decision = decideHorizon({ requested, spanDays });
    if (decision.action === 'refuse') {
        if (json)
            write(JSON.stringify({ ok: false, requested, spanDays, reason: decision.reason }));
        else
            write(`dz recap: REFUSED — ${decision.reason}`);
        return 2;
    }
    const window = recapWindow(requested, at);
    const report = buildRecap({
        window, spanDays,
        deliveries: deliveries.facts, publishes, guard,
        reuse: recapReuse(repo, window),
        uncommittedSlugs: deliveries.uncommitted.sort(),
    });
    if (json) {
        write(JSON.stringify({ ...report, publishesMeta: publishes === null ? null : { fetchedAt: publishes.fetchedAt ?? null, failed: publishes.failed ?? [] } }));
    }
    else {
        for (const line of renderRecap(report))
            write(line);
        // The cache's AGE and its failures print beside the numbers they qualify: third-party
        // timestamps are only as fresh as the last explicit --refresh-publishes, and a package the
        // registry did not answer for is MISSING from the section above — said, not implied.
        if (publishes?.fetchedAt !== undefined) {
            const days = Math.floor((Date.parse(`${at.slice(0, 10)}T00:00:00Z`) - Date.parse(publishes.fetchedAt)) / 86_400_000);
            write(`  ℹ publish-times cache fetched ${publishes.fetchedAt.slice(0, 10)}${Number.isFinite(days) && days > 0 ? ` — ${days} day(s) before this report's anchor` : ''}; refresh with --refresh-publishes`);
        }
        if (publishes?.failed !== undefined) {
            write(`  ⚠ the registry did not answer for ${publishes.failed.length} package(s) at the last refresh: ${publishes.failed.join(', ')} — their publishes are MISSING above, not zero`);
        }
    }
    return 0;
}
/**
 * `dz feature-adr-record --backfill` — fill the run-cost ledger from the host workflow records.
 *
 * MEASURED 2026-08-25: of 87 ledger rows, all 20 written automatically carried
 * `tokens:null, minutes:null, agents:null`, so cost-per-feature was answerable only for the 66 rows
 * a human retyped. The numbers exist in the host record; the sandboxed workflow simply cannot reach
 * them. This is that join, run afterwards, on the dz side.
 */
function cmdLedgerBackfill(options, flags, cwd, write) {
    const json = flags.has('json');
    const apply = flags.has('yes');
    const ledgerPath = resolve(options.get('project') ?? cwd, '.dz', 'feature-adr', 'run-cost-ledger.jsonl');
    if (!existsSync(ledgerPath)) {
        const msg = `dz feature-adr-record --backfill: no ledger at ${ledgerPath}`;
        write(json ? JSON.stringify({ ok: false, reason: 'no-ledger', path: ledgerPath }) : msg);
        return 1;
    }
    const raw = readFileSync(ledgerPath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l !== '');
    const cache = new Map();
    // Only `tokens` is derived, and the scope is narrow on purpose:
    //  • minutes — CostLedgerReport exposes startedTs but no run duration; there is nothing to divide.
    //  • agents  — the ledger column means TOTAL agent invocations including infra agents, while the
    //    union of row.agentIds counts only agents that SPENT. Writing the second into the first would
    //    quietly redefine the column, which that column's own writer explicitly warns against.
    const factsFor = (runId) => {
        try {
            const report = deriveCostLedger({ runId });
            if (report === null)
                return null;
            const tokens = typeof report.recordTotalTokens === 'number' && Number.isFinite(report.recordTotalTokens)
                ? report.recordTotalTokens
                : null;
            return { tokens, minutes: null, agents: null };
        }
        catch {
            return null;
        }
    };
    const facts = (key, value) => {
        const ck = key + ':' + value;
        const hit = cache.get(ck);
        if (hit !== undefined)
            return hit;
        let out = null;
        if (key === 'runId') {
            out = factsFor(value);
        }
        else {
            // The slug is the fallback because the sandboxed workflow cannot know its own run id. It is
            // only usable when it names exactly ONE host run: deriveCostLedger resolves a slug with
            // `runs.find(...)`, which takes the FIRST match SILENTLY, so a feature run twice would have
            // one run's spend written into the other run's row and called measured. Count first, refuse
            // on more than one.
            try {
                const matches = listCostLedgerRuns().filter((r) => r.slug === value);
                if (matches.length > 1)
                    out = AMBIGUOUS;
                else if (matches.length === 1 && matches[0] !== undefined)
                    out = factsFor(matches[0].runId);
            }
            catch {
                out = null;
            }
        }
        cache.set(ck, out);
        return out;
    };
    const plan = planLedgerBackfill({ lines, facts });
    const unfilled = plan.rows.filter((r) => r.skipped !== null && r.skipped !== 'already-complete');
    if (apply && plan.filledRows > 0) {
        // Atomic replace: a torn ledger is worse than an unfilled one.
        const tmp = ledgerPath + '.backfill-tmp';
        writeFileSync(tmp, plan.lines.join('\n') + '\n', 'utf-8');
        renameSync(tmp, ledgerPath);
    }
    if (json) {
        write(JSON.stringify({
            ok: true, applied: apply && plan.filledRows > 0, filledRows: plan.filledRows,
            totalRows: lines.length, disagreements: plan.disagreements,
            unfilled: unfilled.map((r) => ({ index: r.index, runId: r.runId, reason: r.skipped })),
            source: LEDGER_FILL_SOURCE, path: ledgerPath,
        }));
        return 0;
    }
    write('dz feature-adr-record --backfill: SCOPE — only tokens is derived; minutes and agents stay null (the run record exposes no duration, and the agents column means a different quantity than the spend-bearing agent ids). A row without a runId is matched by SLUG, and only when the slug names exactly one run.');
    write(`dz feature-adr-record --backfill: ${plan.filledRows} of ${lines.length} row(s) fillable from the host record${apply ? ' — WRITTEN' : ' (dry run; pass --yes to write)'}`);
    for (const d of plan.disagreements) {
        write(`  DISAGREEMENT row ${d.index} ${d.field}: ledger says ${d.existing}, host record says ${d.derived} — the typed number stands, look at this`);
    }
    const byReason = new Map();
    for (const r of unfilled)
        byReason.set(String(r.skipped), (byReason.get(String(r.skipped)) ?? 0) + 1);
    for (const [reason, n] of byReason)
        write(`  not filled: ${n} row(s) — ${reason}`);
    return 0;
}
function cmdFeatureAdrRecord(options, flags, cwd, write) {
    const json = flags.has('json');
    // `--backfill` is a different verb on the same store: it fills the ledger's null cost fields from
    // the host's own workflow record. DRY-RUN BY DEFAULT — this rewrites an append-only log, so the
    // writing form must be asked for (`--yes`), the same contract `dz publish` and `sync-canonical`
    // already use. See ledger-backfill.ts for the four rules the plan obeys.
    if (flags.has('backfill'))
        return cmdLedgerBackfill(options, flags, cwd, write);
    const kind = (options.get('kind') ?? '').trim();
    const stage = (options.get('stage') ?? '').trim();
    const slug = (options.get('slug') ?? '').trim();
    const payloadRaw = options.get('row') ?? options.get('pair') ?? '';
    const emit = (d, extra = {}) => {
        if (json) {
            write(JSON.stringify({ ok: d.exit === 0, kind, stage, verdict: d.verdict, exit: d.exit, reason: d.reason, blocking: d.blocking, ...extra }));
        }
        else {
            write(recordVerdictLine(kind === 'ledger' || kind === 'training-pair' ? kind : 'ledger', stage, d));
        }
        return d.exit;
    };
    if (kind !== 'ledger' && kind !== 'training-pair') {
        write('dz feature-adr-record: --kind must be ledger or training-pair');
        return 2;
    }
    if (payloadRaw === '') {
        write('dz feature-adr-record: --row (ledger) or --pair (training-pair) is required');
        return 2;
    }
    const repo = (options.get('project') ?? cwd).trim() || cwd;
    const target = kind === 'ledger'
        ? join(repo, '.dz', 'feature-adr', 'run-cost-ledger.jsonl')
        : join(repo, '.dz', 'fa-training', slug === '' ? 'unknown' : slug, `${stage.replace(/[^\w.-]/g, '_')}.jsonl`);
    const markDir = join(repo, '.dz', 'fa-training', '.backfill-marks');
    const markName = (options.get('mark') ?? '').trim();
    const markPath = markName === '' ? null : join(markDir, markName.replace(/[^\w.-]/g, '_'));
    const decision = decideRecordWrite({
        kind,
        payloadRaw,
        stage,
        stageProducedResult: flags.has('no-result') ? false : true,
        markExists: markPath !== null && existsSync(markPath),
        targetExists: existsSync(target),
        targetHasPair: flags.has('once') && existsSync(target),
        timestamp: new Date().toISOString(),
        // WHO ran it: `--runner <id>` when the caller knows, otherwise this host. The workflow cannot
        // supply it — it has no host inside its sandbox — so the identity is resolved here, at the one
        // seam that runs outside. hostname() can throw on an exotic setup; an unresolvable runner stays
        // ABSENT rather than becoming the string 'unknown', which would later join as if it were one.
        runnerId: (options.get('runner') ?? '').trim() !== ''
            ? (options.get('runner') ?? '').trim()
            : (() => { try {
                return hostname();
            }
            catch {
                return null;
            } })(),
    });
    if (decision.line === null)
        return emit(decision);
    // Declared out here because the READ-BACK below must verify what was ACTUALLY written, not what
    // the decision proposed — the ledger path enriches the line with a resolved runId before the
    // append, and comparing against the pre-enrichment text made every ledger write report
    // "not-verified" (caught by running it, not by reading it).
    let lineToWrite = decision.line;
    // MEASURE, never assume: an unwritable target is a LOUD refusal, because a swallowed mkdir failure
    // is exactly how a write becomes a silent no-op (acid case A4).
    try {
        mkdirSync(dirname(target), { recursive: true });
        if (markPath !== null) {
            mkdirSync(markDir, { recursive: true });
            mkdirSync(markPath);
        }
    }
    catch (err) {
        const code = err.code;
        if (markPath !== null && code === 'EEXIST') {
            // A stale mark (target absent) was already decided as writable above; re-taking it is a no-op,
            // not a duplicate. Only a mark WITH its target means another run got here first.
            if (decision.staleMark !== true) {
                return emit({ verdict: 'duplicate', exit: 0, reason: 'a mark for this record already exists — another run captured it first', blocking: false, line: null });
            }
        }
        return emit({ verdict: 'refused', exit: 2, reason: `the target could not be prepared: ${err.message}`, blocking: false, line: null });
    }
    try {
        // WRITE-TIME RUN-ID RESOLUTION. The sandboxed workflow cannot know its own run id — it is not in
        // `args` and not a sandbox global — so 16 of 20 automatic ledger rows carried no join key at all
        // and nothing could ever be joined to them (MEASURED 2026-08-25). This command runs on the host,
        // where the records live, so it answers the question the sandbox cannot. Resolving HERE beats
        // resolving later: right now the run is in flight and is simply the newest for this slug; an hour
        // from now the same slug may have several and the choice becomes a guess. Refuses on any tie.
        lineToWrite = decision.line;
        if (kind === 'ledger') {
            try {
                const parsed = JSON.parse(decision.line);
                if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    const rowObj = parsed;
                    const resolved = resolveLedgerRunId(rowObj, listCostLedgerRuns());
                    if (resolved !== null) {
                        // Marked, because a resolved run id is our inference, not something the pipeline knew.
                        lineToWrite = JSON.stringify({ ...rowObj, runId: resolved, runIdSource: 'resolved-at-write' });
                    }
                }
            }
            catch { /* resolution is an ENRICHMENT; a failure must never cost the row itself */ }
        }
        appendFileSync(target, `${lineToWrite}\n`, 'utf-8');
    }
    catch (err) {
        return emit({ verdict: 'refused', exit: 2, reason: `the append failed: ${err.message}`, blocking: false, line: null });
    }
    // ADR-002: the write is verified against the disk, never inferred from the absence of an error.
    let lastLine = null;
    try {
        const body = readFileSync(target, 'utf-8');
        const lines = body.split('\n').filter((l) => l !== '');
        lastLine = lines.length > 0 ? lines[lines.length - 1] : null;
    }
    catch {
        lastLine = null;
    }
    return emit(decideReadBack(lineToWrite, lastLine), { target });
}
function contractRepoRoot(cwd) {
    let root = cwd;
    try {
        root = execSync('git rev-parse --show-toplevel', {
            cwd,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim() || cwd;
    }
    catch { /* temporary repository fixtures intentionally use cwd as their root */ }
    return resolve(root);
}
function contractReadConfined(repoRoot, absolute, artifact) {
    let rootReal;
    let targetReal;
    try {
        rootReal = realpathSync(repoRoot);
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'repository-unreadable', message: 'repository root cannot be resolved', artifact: '.' },
        };
    }
    try {
        targetReal = realpathSync(absolute);
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'artifact-unreadable', message: `required artifact cannot be resolved or read: ${artifact}`, artifact },
        };
    }
    const rel = relative(rootReal, targetReal);
    if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
        return {
            ok: false,
            diagnostic: { code: 'artifact-outside-repository', message: `artifact resolves outside the repository: ${artifact}`, artifact },
        };
    }
    try {
        if (!statSync(targetReal).isFile())
            throw new Error('not a regular file');
        return { ok: true, text: readFileSync(targetReal, 'utf-8'), realPath: targetReal };
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'artifact-unreadable', message: `required artifact cannot be read as a file: ${artifact}`, artifact },
        };
    }
}
function contractDirectoryConfined(repoRoot, absolute, artifact) {
    let rootReal;
    let targetReal;
    try {
        rootReal = realpathSync(repoRoot);
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'repository-unreadable', message: 'repository root cannot be resolved', artifact: '.' },
        };
    }
    try {
        targetReal = realpathSync(absolute);
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'adr-directory-unreadable', message: `required ADR directory cannot be resolved: ${artifact}`, artifact },
        };
    }
    const rel = relative(rootReal, targetReal);
    if (rel === '' || rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) {
        return {
            ok: false,
            diagnostic: { code: 'artifact-outside-repository', message: `artifact resolves outside the repository: ${artifact}`, artifact },
        };
    }
    try {
        if (!statSync(targetReal).isDirectory())
            throw new Error('not a directory');
        return { ok: true, realPath: targetReal };
    }
    catch {
        return {
            ok: false,
            diagnostic: { code: 'adr-directory-unreadable', message: `required ADR directory is not readable: ${artifact}`, artifact },
        };
    }
}
function contractDiagnosticLine(entry) {
    const where = [entry.artifact, entry.contractId ?? entry.sourceId].filter((part) => part !== undefined).join(' · ');
    return `  [${entry.code}]${where === '' ? '' : ` ${where} —`} ${entry.message}`;
}
function cmdContractCheck(options, flags, cwd, write, writeErr) {
    const json = flags.has('json');
    const emitEarly = (outcome, exitCode, diagnostics) => {
        if (json) {
            write(JSON.stringify({ outcome, exitCode, diagnostics }));
        }
        else {
            for (const entry of diagnostics)
                writeErr(contractDiagnosticLine(entry));
            write(`contract-check: ${outcome === 'fail' ? 'FAIL' : 'NOT-ESTABLISHED'} — ${diagnostics[0]?.message ?? 'no trustworthy verdict'}`);
        }
        return exitCode;
    };
    for (const flag of flags) {
        if (flag !== 'json' && flag !== 'help') {
            return emitEarly('not-established', 2, [{ code: 'usage-invalid', message: `unknown option --${flag}`, observed: `--${flag}` }]);
        }
    }
    for (const key of options.keys()) {
        if (key !== 'slug') {
            return emitEarly('not-established', 2, [{
                    code: 'usage-invalid',
                    message: key.startsWith('_positional_') ? `unexpected argument ${JSON.stringify(options.get(key))}` : `unknown option --${key}`,
                    observed: key.startsWith('_positional_') ? options.get(key) ?? '' : `--${key}`,
                }]);
        }
    }
    const slug = (options.get('slug') ?? '').trim();
    if (!isSafeSlug(slug)) {
        return emitEarly('not-established', 2, [{
                code: 'slug-invalid',
                message: 'a kebab-case --slug <feature> is required (one path segment, max 40 characters)',
                observed: slug,
            }]);
    }
    const repoRoot = contractRepoRoot(cwd);
    const featureDir = join(repoRoot, 'features', slug);
    const requirementsRel = `features/${slug}/01_requirements.md`;
    const reportRel = `features/${slug}/08_qe_report.md`;
    const requirementsRead = contractReadConfined(repoRoot, join(featureDir, '01_requirements.md'), requirementsRel);
    if (!requirementsRead.ok)
        return emitEarly('not-established', 2, [requirementsRead.diagnostic]);
    const adrDirRel = `features/${slug}/03_adr`;
    const adrDirectory = contractDirectoryConfined(repoRoot, join(featureDir, '03_adr'), adrDirRel);
    if (!adrDirectory.ok)
        return emitEarly('not-established', 2, [adrDirectory.diagnostic]);
    const adrDir = adrDirectory.realPath;
    let adrNames;
    try {
        adrNames = readdirSync(adrDir, { withFileTypes: true })
            .filter((entry) => entry.name.endsWith('.md') && (entry.isFile() || entry.isSymbolicLink()))
            .map((entry) => entry.name)
            .sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    }
    catch {
        return emitEarly('not-established', 2, [{
                code: 'adr-directory-unreadable',
                message: `required ADR directory cannot be read: ${adrDirRel}`,
                artifact: adrDirRel,
            }]);
    }
    if (adrNames.length === 0) {
        return emitEarly('not-established', 2, [{
                code: 'adr-artifacts-missing',
                message: `no direct ADR Markdown artifacts exist under ${adrDirRel}`,
                artifact: adrDirRel,
                observed: 0,
            }]);
    }
    const adrs = [];
    const adrReadErrors = [];
    for (const name of adrNames) {
        const rel = `features/${slug}/03_adr/${name}`;
        const read = contractReadConfined(repoRoot, join(adrDir, name), rel);
        if (read.ok)
            adrs.push({ path: rel, text: read.text });
        else
            adrReadErrors.push(read.diagnostic);
    }
    if (adrReadErrors.length > 0)
        return emitEarly('not-established', 2, adrReadErrors);
    const extracted = extractContractChecklist({
        requirements: { path: requirementsRel, text: requirementsRead.text },
        adrs,
    });
    if (!extracted.ok)
        return emitEarly('fail', 1, extracted.diagnostics);
    const reportRead = contractReadConfined(repoRoot, join(featureDir, '08_qe_report.md'), reportRel);
    if (!reportRead.ok)
        return emitEarly('not-established', 2, [reportRead.diagnostic]);
    const parsed = parseContractVerdictReport(reportRead.text);
    if (!parsed.ok) {
        const diagnostics = parsed.diagnostics.map((entry) => ({
            ...entry,
            artifact: entry.artifact ?? reportRel,
        }));
        return emitEarly(parsed.established ? 'fail' : 'not-established', parsed.established ? 1 : 2, diagnostics);
    }
    const evidenceCache = new Map();
    const reader = {
        reportArtifact: reportRel,
        read(artifact) {
            const cached = evidenceCache.get(artifact);
            if (cached !== undefined)
                return cached;
            const disk = contractReadConfined(repoRoot, join(repoRoot, artifact), artifact);
            let result;
            if (!disk.ok) {
                result = { ok: false, code: `evidence-${disk.diagnostic.code}`, detail: disk.diagnostic.message };
            }
            else if (disk.realPath === reportRead.realPath) {
                result = { ok: false, code: 'evidence-self-citation', detail: `${artifact} resolves to the QE verdict payload itself` };
            }
            else {
                result = { ok: true, text: disk.text };
            }
            evidenceCache.set(artifact, result);
            return result;
        },
    };
    const rawVerification = verifyContractVerdicts(extracted.checklist, parsed.report, reader);
    const withReportArtifact = (entry) => ({
        ...entry,
        artifact: entry.artifact ?? reportRel,
    });
    const verification = {
        ...rawVerification,
        diagnostics: rawVerification.diagnostics.map(withReportArtifact),
        items: rawVerification.items.map((item) => ({
            ...item,
            diagnostics: item.diagnostics.map(withReportArtifact),
        })),
    };
    if (json) {
        write(JSON.stringify({
            contract: extracted.checklist,
            report: parsed.report,
            items: verification.items,
            diagnostics: verification.diagnostics,
            counts: verification.counts,
            overallGrade: verification.overallGrade,
            outcome: verification.outcome,
            exitCode: verification.exitCode,
        }));
        return verification.exitCode;
    }
    for (const item of verification.items) {
        const reason = item.reason === undefined ? '' : ` — ${item.reason}`;
        write(`  ${item.id}: ${item.verdict ?? 'missing'} · evidence ${item.evidence}${reason}`);
    }
    write(`  counts: contract=${verification.counts.contractItems} verdict=${verification.counts.verdictItems} met=${verification.counts.met} unmet=${verification.counts.unmet} not-testable=${verification.counts.notTestable} invalid-evidence=${verification.counts.invalidEvidence}`);
    write(`  overall grade: ${verification.overallGrade}`);
    for (const entry of verification.diagnostics)
        writeErr(contractDiagnosticLine(entry));
    const summary = verification.outcome === 'pass'
        ? `${verification.counts.met} contract item(s) met`
        : `${verification.diagnostics.length} contract or evidence violation(s)`;
    write(`contract-check: ${verification.outcome === 'pass' ? 'PASS' : 'FAIL'} — ${summary}`);
    return verification.exitCode;
}
function cmdAmendmentCheck(options, flags, cwd, write) {
    const json = flags.has('json');
    const readOr = (abs) => {
        try {
            return readFileSync(abs, 'utf-8');
        }
        catch {
            return null;
        }
    };
    const checkOne = (featureDir) => {
        const slug = basename(featureDir);
        const ideation = readOr(join(featureDir, '03.5_ideation_report.md'));
        const plan = readOr(join(featureDir, '06_implementation_plan.md'));
        // A missing ideation report must NOT stop the plan from being read. It did: an S/M feature that
        // legitimately skips Step 3.5 got `skip — no Amendments section` while its plan carried a
        // complete section, and the same split produced verdicts that contradicted their own counts
        // (rows parsed from the PLAN, `sectionPresent` computed from the IDEATION report). MEASURED
        // 2026-08-24 on features/name-check: resolved 0 with 3 rows sitting in the plan.
        const sectionPresent = (ideation !== null && amendmentSection(ideation) !== null)
            || (plan !== null && amendmentSection(plan) !== null);
        const ideationRows = ideation === null ? [] : parseAmendments(ideation);
        const planRows = plan === null ? [] : parseAmendments(plan);
        // The PLAN is authoritative when it carries rows: Step 6 owes "carry AM-N into the plan
        // verbatim", and the ideation report is the historical record — rewriting its rows to match
        // tests named later would close the trail by falsifying it. Coverage keeps that honest below.
        const rows = planRows.length > 0 ? planRows : ideationRows;
        const missingFromPlan = planRows.length > 0 ? amendmentsMissingFromPlan(ideationRows, planRows) : [];
        // Paths in an amendment row are repo-relative, so they resolve against the repo root — not
        // against the feature directory, and not against wherever the caller happened to stand.
        const resolutions = resolveAmendments(rows, { readFile: (rel) => readOr(resolve(cwd, rel)) });
        const decision = decideAmendmentOutcome({
            sectionPresent,
            rows,
            resolutions,
            planSaysNone: plan !== null && planSaysNoAmendments(plan),
            missingFromPlan,
        });
        return { slug, decision, resolutions };
    };
    // --all is a CENSUS, not a gate (ADR-003): a gate that is red on arrival over 21 historical
    // features gets disabled, and then the mechanism is gone along with the debt it was to surface.
    if (flags.has('all')) {
        const featuresDir = join(cwd, 'features');
        let slugs = [];
        try {
            slugs = readdirSync(featuresDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
        }
        catch {
            if (json)
                write(JSON.stringify({ ok: true, mode: 'all', features: [], note: 'no features/ directory' }));
            else
                write('amendment traceability census: no features/ directory');
            return 0;
        }
        const rowsOut = [];
        for (const slug of slugs) {
            try {
                const r = checkOne(join(featuresDir, slug));
                rowsOut.push({ slug, outcome: r.decision.outcome, counts: r.decision.counts, reasons: r.decision.reasons.length });
            }
            catch (err) {
                // AM-6: one unreadable feature becomes its own row. Dropping it silently would make the
                // census read like coverage it does not have.
                rowsOut.push({ slug, outcome: 'read-error', error: err.message });
            }
        }
        if (json) {
            write(JSON.stringify({ ok: true, mode: 'all', note: AMENDMENT_VACUITY_NOTE, features: rowsOut }));
        }
        else {
            const tally = new Map();
            for (const r of rowsOut)
                tally.set(String(r['outcome']), (tally.get(String(r['outcome'])) ?? 0) + 1);
            for (const r of rowsOut) {
                if (r['outcome'] !== 'pass' && r['outcome'] !== 'skip')
                    write(`  [${String(r['outcome'])}] ${String(r['slug'])}`);
            }
            write(`amendment traceability census over ${rowsOut.length} feature(s): ${[...tally].map(([k, v]) => `${v} ${k}`).join(', ')}`);
            write(AMENDMENT_VACUITY_NOTE);
        }
        return 0;
    }
    const explicitDir = (options.get('feature-dir') ?? '').trim();
    const slug = (options.get('slug') ?? '').trim();
    if (explicitDir === '' && slug === '') {
        write('dz amendment-check: one of --slug / --feature-dir is required (or --all for a census)');
        return 2;
    }
    const featureDir = explicitDir !== '' ? resolve(cwd, explicitDir) : join(cwd, 'features', slug);
    const { decision, resolutions } = checkOne(featureDir);
    if (json) {
        write(JSON.stringify({
            ok: decision.outcome === 'pass' || decision.outcome === 'skip',
            slug: basename(featureDir),
            outcome: decision.outcome,
            exit: decision.exit,
            counts: decision.counts,
            reasons: decision.reasons,
            rows: resolutions,
            note: AMENDMENT_VACUITY_NOTE,
        }));
    }
    else {
        for (const r of resolutions) {
            if (r.verdict !== 'resolved')
                write(`  [${r.verdict}] ${r.id}${r.testId === null ? '' : ` \`${r.testId}\``} — ${r.detail}`);
        }
        write(AMENDMENT_VACUITY_NOTE);
        // The verdict is the LAST line, in the K2 gate's own shape, so a caller that reads the tail of
        // the output reads a verdict rather than a finding.
        write(amendmentVerdictLine(decision));
    }
    return decision.exit;
}
function cmdFeatureAdrCheckpoint(options, flags, cwd, write) {
    const json = flags.has('json');
    const emit = (payload, human, code) => {
        if (json)
            write(JSON.stringify(payload));
        else
            write(human);
        return code;
    };
    const slug = (options.get('slug') ?? '').trim();
    const stage = (options.get('stage') ?? '').trim();
    const inputHash = (options.get('input-hash') ?? '').trim();
    const resultRaw = options.get('result') ?? '';
    const artifacts = (options.get('artifact') ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a !== '');
    if ((slug === '' && (options.get('feature-dir') ?? '').trim() === '') || stage === '' || inputHash === '') {
        return emit({ ok: false, reason: 'usage' }, 'dz feature-adr checkpoint: --stage, --input-hash and one of --slug / --feature-dir are required', 2);
    }
    let result;
    try {
        result = JSON.parse(resultRaw);
    }
    catch {
        return emit({ ok: false, reason: 'result is not valid JSON' }, 'dz feature-adr checkpoint: --result must be valid JSON', 2);
    }
    // --feature-dir wins when given: the workflow knows the absolute path already, and depending on
    // cwd resolution there would make the command's behaviour depend on where the subagent happened to
    // stand. --slug stays for humans running this by hand from a repo root.
    const explicitDir = (options.get('feature-dir') ?? '').trim();
    const featureDir = explicitDir !== '' ? explicitDir : join(cwd, 'features', slug);
    // MEASURE, never trust: presence is established here, by this process, on this disk.
    const present = artifacts.filter((rel) => {
        const abs = join(featureDir, rel);
        try {
            return statSync(abs).isFile();
        }
        catch {
            return false;
        }
    });
    const verdict = decideCheckpointWrite({ stage, inputHash, result, artifacts, present });
    if (!verdict.ok) {
        return emit({ ok: false, stage, reason: verdict.reason }, 'dz feature-adr checkpoint: REFUSED — ' + verdict.reason, 1);
    }
    const stateDir = join(featureDir, '.fa-state');
    try {
        mkdirSync(stateDir, { recursive: true });
        // The CLI is the only participant with a clock — the sandboxed workflow has no `Date` — so the
        // write instant is stamped here, at the append, and nowhere inside the blob-mirrored serializer.
        appendFileSync(join(stateDir, 'checkpoints.jsonl'), stampCheckpointLine(verdict.line, new Date().toISOString()) + '\n', 'utf-8');
    }
    catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return emit({ ok: false, stage, reason }, 'dz feature-adr checkpoint: write failed — ' + reason, 1);
    }
    return emit({ ok: true, stage, witnessed: verdict.witnessed }, 'dz feature-adr checkpoint: recorded ' + stage + ' (witnessed ' + verdict.witnessed.length + ' artifact(s))', 0);
}
function cmdReqe(options, flags, cwd, write) {
    const json = flags.has('json');
    if (flags.has('help')) {
        const usage = 'dz reqe [--slug <feature> [--done --report <file>]] [--project <dir>] [--json]';
        if (json)
            write(JSON.stringify({ help: usage, exitCode: 0 }));
        else {
            write(usage + ' — the re-QE debt ledger');
            write('  (no args)              list unsettled debts (runs whose Step-8 QE ran on the coder’s own family under the usage override)');
            write('  --slug <s>             print the ready cross-family review brief for one debt');
            write('  --slug <s> --done --report <file>   settle the debt — FAIL-CLOSED: requires an existing, non-trivial, GRADED report; appends the settlement to 08_qe_report.md');
            write('  ' + REQE_SCOPE);
        }
        return 0;
    }
    for (const flag of flags) {
        if (!new Set(['json', 'help', 'done']).has(flag)) {
            write(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : `dz reqe: unknown option --${flag}\n  allowed: --slug <feature>, --done, --report <file>, --project <dir>, --json`);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_') || !new Set(['slug', 'report', 'project']).has(key)) {
            const what = key.startsWith('_positional_') ? `unexpected argument "${options.get(key)}"` : `unknown option --${key}`;
            write(json ? JSON.stringify({ error: what, exitCode: 1 }) : `dz reqe: ${what}`);
            return 1;
        }
    }
    const root = resolve(cwd, options.get('project') ?? '.');
    const slug = options.get('slug') ?? '';
    if (slug !== '' && (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug.includes('..'))) {
        write(json ? JSON.stringify({ error: 'a plain --slug <feature> is required (no path separators)', exitCode: 1 }) : 'dz reqe: a plain --slug <feature> is required (no path separators)');
        return 1;
    }
    const { debts, malformed } = scanReqeDebts(root);
    if (slug === '') {
        if (flags.has('done')) {
            write(json ? JSON.stringify({ error: '--done requires --slug', exitCode: 1 }) : 'dz reqe: --done requires --slug <feature>');
            return 1;
        }
        if (json)
            write(JSON.stringify({ debts: debts.map((d) => d.debt), malformed, scope: REQE_SCOPE, exitCode: 0 }));
        else
            for (const line of renderReqeList(debts.map((d) => d.debt), malformed))
                write(line);
        return 0;
    }
    const hit = debts.find((d) => d.debt.slug === slug) ?? null;
    if (!hit) {
        // distinguish "no debt file" from "malformed debt file" — a corrupt debt must be named
        const duePath = join(root, 'features', slug, '.fa-state', 'reqe-due.json');
        const exists = existsSync(duePath);
        const msg = exists
            ? `debt file at features/${slug}/.fa-state/reqe-due.json is MALFORMED — inspect it manually (a corrupt debt is named, never auto-cleared)`
            : `no re-QE debt recorded for "${slug}"`;
        write(json ? JSON.stringify({ error: msg, exitCode: 1 }) : `dz reqe: ${msg}`);
        return 1;
    }
    if (!flags.has('done')) {
        const brief = buildReqeBrief(hit.debt, join('features', slug));
        if (json)
            write(JSON.stringify({ debt: hit.debt, brief, exitCode: 0 }));
        else {
            write(brief.header);
            for (const line of brief.instructions)
                write('  ' + line);
            if (brief.codexCmdTemplate)
                write('  codex template: ' + brief.codexCmdTemplate);
            write('  ' + REQE_SCOPE);
        }
        return 0;
    }
    // --done: FAIL-CLOSED settlement
    const reportOpt = options.get('report') ?? '';
    if (reportOpt === '') {
        write(json ? JSON.stringify({ error: '--done requires --report <file> (the cross-family re-QE report)', exitCode: 1 }) : 'dz reqe: --done requires --report <file>');
        return 1;
    }
    const reportPath = resolve(root, reportOpt);
    const qeReportPath = join(hit.dir, '08_qe_report.md');
    // QE #1: the run's OWN same-family Step-8 report must never settle its own debt — the exact
    // laundering this ledger exists to prevent. Compared by REAL path so a symlink cannot alias it.
    try {
        const sameReal = realpathSync(reportPath) === realpathSync(qeReportPath);
        // r2 #1: a HARD LINK to the same report has a different path but the same inode — compare
        // dev+ino, not just resolved paths
        const rSt = statSync(reportPath);
        const qSt = statSync(qeReportPath);
        const sameInode = rSt.dev === qSt.dev && rSt.ino === qSt.ino;
        if (sameReal || sameInode) {
            write(json ? JSON.stringify({ error: 'the report IS this run’s own 08_qe_report.md (same file/inode) — the same-family review cannot settle its own debt; provide the independent cross-family report', exitCode: 1 }) : 'dz reqe: the report IS this run’s own 08_qe_report.md (same file/inode) — the same-family review cannot settle its own debt (fail-closed)');
            return 1;
        }
    }
    catch { /* one of the two does not resolve — the reads below decide */ }
    let reportText = '';
    try {
        const st = lstatSync(reportPath);
        if (!st.isFile())
            throw new Error('not a regular file'); // symlinked report refused (QE #5)
        reportText = readFileSync(reportPath, 'utf-8');
    }
    catch {
        write(json ? JSON.stringify({ error: `report not readable at ${reportOpt} (must be a regular file, not a symlink) — refusing to settle`, exitCode: 1 }) : `dz reqe: report not readable at ${reportOpt} (must be a regular file, not a symlink) — refusing to settle (fail-closed)`);
        return 1;
    }
    const settlement = settleReqeDebt(hit.debt, reportText, reportOpt);
    if (!settlement.ok || settlement.epilogue === null) {
        write(json ? JSON.stringify({ error: settlement.error, exitCode: 1 }) : `dz reqe: ${settlement.error}`);
        return 1;
    }
    // QE #6 ordering: rotate the debt FIRST, append the human-readable epilogue LAST — a crash may
    // leave a settled debt without its epilogue (recoverable from reqe-settled.json), never an
    // epilogue claiming clearance while the debt is still live.
    const settledBase = join(hit.dir, '.fa-state', 'reqe-settled');
    let settledPath = settledBase + '.json';
    for (let n = 2; existsSync(settledPath); n++)
        settledPath = settledBase + '-' + n + '.json'; // never overwrite prior evidence
    try {
        const settled = { ...hit.debt, settledGrade: settlement.grade, settledReport: reportOpt };
        writeFileSync(settledPath, JSON.stringify(settled) + '\n', { flag: 'wx' }); // wx: never through a planted symlink
        try {
            unlinkSync(hit.duePath);
        }
        catch (e) {
            // r2 #5: a failed unlink must not leave a settled marker beside a live debt — roll back
            try {
                unlinkSync(settledPath);
            }
            catch { /* best-effort rollback */ }
            throw e;
        }
    }
    catch {
        write(json ? JSON.stringify({ error: 'could not rotate the debt file — debt NOT cleared, nothing was appended', exitCode: 1 }) : 'dz reqe: could not rotate the debt file — debt NOT cleared, nothing was appended (fail-closed)');
        return 1;
    }
    try {
        if (lstatSync(qeReportPath).isSymbolicLink())
            throw new Error('symlinked 08_qe_report.md');
        appendFileSync(qeReportPath, settlement.epilogue);
    }
    catch {
        write(json ? JSON.stringify({ settled: true, grade: settlement.grade, warning: 'debt cleared (see .fa-state/reqe-settled*.json) but the epilogue could NOT be appended to 08_qe_report.md — append it manually', exitCode: 0 }) : 'dz reqe: debt cleared (evidence in .fa-state/) but the epilogue could NOT be appended to 08_qe_report.md — append it manually');
        return 0;
    }
    const okMsg = `debt settled: re-QE grade ${settlement.grade} (report ${reportOpt}) — settlement appended to features/${slug}/08_qe_report.md`;
    write(json ? JSON.stringify({ settled: true, grade: settlement.grade, exitCode: 0 }) : `dz reqe: ${okMsg}`);
    return 0;
}
/* -------------------------------------------------------------------------- */
/* `dz qe-bridge` — the reverse QE bridge (feature qe-bridge-claude, ADR-001)   */
/* -------------------------------------------------------------------------- */
/** Review timeout default: an adversarial QE pass legitimately takes minutes (NFR-3). */
const QE_BRIDGE_DEFAULT_TIMEOUT_S = 600;
const QE_BRIDGE_MIN_TIMEOUT_S = 30;
const QE_BRIDGE_MAX_TIMEOUT_S = 3600;
/** Probe timeout — the mirror of `codexProbeCommand`'s `timeout 60`. */
const QE_BRIDGE_PROBE_TIMEOUT_MS = 60_000;
/**
 * Run one `claude` call with the prompt on STDIN. Spawn-injectable, and NEVER throws: a missing
 * binary, a crash and a hang all come back as DATA, because the taxonomy above them can only name
 * a failure it is handed. (The first draft of this function let the ENOENT escape as an uncaught
 * exception and the command never settled — the acid A1 red, quoted in red-green.md.)
 *
 * Mirrors `probeContent`'s settled-flag + SIGTERM deadline shape (`cli.ts` probes) and scrubs
 * `PROBE_SCRUB_ENV`, so a bridge launched from inside a nested Claude session cannot inherit the
 * parent's session identity (SEC-4).
 */
export async function runClaudeBridge(bin, argv, promptStdin, timeoutMs, cwd = process.cwd(), spawnImpl = spawn) {
    // A THIN WRAPPER over runChildBridge since the loop runner needed the same machinery with two
    // extra knobs. This signature is consumed by the qe-bridge suites and MUST NOT change.
    return runChildBridge(bin, argv, { stdinText: promptStdin, timeoutMs, cwd, detached: false, spawnImpl });
}
/** How long a child's process group gets to honour SIGTERM before SIGKILL (Step-8 MEDIUM-14). */
const CHILD_SIGKILL_GRACE_MS = 2000;
/**
 * The MINIMAL environment a dispatched child gets (Step-8 HIGH-9).
 *
 * A deny-list removes what somebody remembered; an allow-list carries what the child needs and
 * nothing else. The named set is deliberately boring — enough for a binary to find itself, resolve
 * a home directory, write a temp file and talk to a proxy — plus each runtime's own credential
 * variables, which are listed because they are REQUIRED, not because they happened to be present.
 * Anything a future adapter needs is added HERE, visibly, with a reason.
 */
const CHILD_ENV_BASE = [
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ',
    'TMPDIR', 'TEMP', 'TMP',
    'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'http_proxy', 'https_proxy', 'no_proxy',
    // node itself, for a child that IS node
    'NODE_EXTRA_CA_CERTS',
];
/**
 * CREDENTIALS ARE PER FAMILY (Step-8 re-QE H9 — the round-1 allowlist shipped BOTH sets to BOTH
 * runtimes, which is a shorter list of the same mistake).
 *
 * A codex dispatch has no business holding an Anthropic key, and vice versa. The two runtimes are
 * separate blast radii precisely because the cross-model rule makes them review each other: if one
 * is compromised or simply misbehaves, it must not be carrying the other's credentials. The base
 * above is boring on purpose — enough to find a binary, a home directory and a proxy — and nothing
 * in it authenticates anything.
 */
const CHILD_ENV_BY_FAMILY = {
    claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR'],
    openai: ['OPENAI_API_KEY', 'CODEX_HOME'],
};
function buildAllowlistEnv(extra, parent = process.env) {
    const out = {};
    for (const key of [...CHILD_ENV_BASE, ...extra]) {
        const v = parent[key];
        if (typeof v === 'string')
            out[key] = v;
    }
    return out;
}
/** Test seam for H9: the exact environment ONE family's child would receive. */
export function __wfChildEnvTestSeam(family, parent) {
    return buildAllowlistEnv(CHILD_ENV_BY_FAMILY[family], parent);
}
/**
 * THE child-process wrapper both the qe-bridge and the loop runner ride (ADR-002 O1: ONE impure
 * wrapper, not two). Generalized from `runClaudeBridge` with the same guarantees — a settled flag so
 * no path resolves twice, a deadline timer that SIGTERMs, the `PROBE_SCRUB_ENV` scrub so a bridge
 * launched from inside a nested Claude session cannot inherit it, and an injectable `spawnImpl` —
 * plus the two knobs the generalization adds:
 *
 *   • `stdinText: null` ⇒ `stdio[0] = 'ignore'`. MEASURED: codex-cli 0.148.0 prints
 *     `Reading additional input from stdin...` and WAITS when stdin is left open. Passing an empty
 *     string is not the same thing as closing it.
 *   • `detached: true` ⇒ the child leads its OWN process group, so the runner can kill the whole
 *     group (AM-10). `onSpawn` hands the live child to the caller's registry at the only moment the
 *     pid is knowable.
 *
 * Never throws: a spawn failure resolves with `spawnError` set, exactly like the original.
 */
export async function runChildBridge(bin, argv, opts) {
    const spawnImpl = opts.spawnImpl ?? spawn;
    return new Promise((resolveRun) => {
        const env = opts.envMode === 'allowlist'
            ? buildAllowlistEnv(opts.envExtra ?? [])
            : { ...process.env };
        if (opts.envMode !== 'allowlist')
            for (const key of PROBE_SCRUB_ENV)
                delete env[key];
        let out = '';
        let err = '';
        let settled = false;
        let timedOut = false;
        let child;
        const finish = (spawnError, exitCode) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            // A DETACHED child leads its own group, so kill the GROUP — killing the leader alone leaves
            // whatever it spawned running (the orphan class AM-10 exists to close). SIGTERM is a REQUEST;
            // a group that ignores it would outlive the runner, so a bounded grace period later the same
            // group gets SIGKILL, which is not a request (Step-8 MEDIUM-14).
            // EVERY termination goes through the one guarded chokepoint (re-QE NEW-C4) — there is no
            // second call shape here to forget to guard.
            const sent = signalChildSafely(child, 'SIGTERM', opts.detached);
            if (sent) {
                const escalation = setTimeout(() => {
                    signalChildSafely(child, 'SIGKILL', opts.detached);
                }, CHILD_SIGKILL_GRACE_MS);
                escalation.unref?.(); // the grace timer must never hold the runner's event loop open
            }
            resolveRun({ stdout: out, stderr: err, exitCode, timedOut, spawnError });
        };
        const timer = setTimeout(() => {
            timedOut = true;
            finish(null, null);
        }, opts.timeoutMs);
        try {
            child = spawnImpl(bin, argv, {
                cwd: opts.cwd,
                env,
                detached: opts.detached,
                stdio: [opts.stdinText === null ? 'ignore' : 'pipe', 'pipe', 'pipe'],
            });
        }
        catch (error) {
            finish(`cannot run \`${bin}\`: ${error instanceof Error ? error.message : String(error)}`, null);
            return;
        }
        opts.onSpawn?.(child);
        child.on('error', (error) => finish(`cannot run \`${bin}\`: ${error.message}`, null));
        child.stdout?.on('data', (c) => { out += c.toString(); });
        child.stderr?.on('data', (c) => { err += c.toString(); });
        child.on('close', (code) => finish(null, code));
        // EPIPE when the child died before reading: already reported through 'error'/'close'.
        child.stdin?.on('error', () => { });
        if (opts.stdinText !== null) {
            try {
                child.stdin?.write(opts.stdinText);
                child.stdin?.end();
            }
            catch {
                /* the close/error handlers decide the outcome */
            }
        }
    });
}
/** stderr wording that PROVES a login problem. Anything else stays unclassified: a guessed reason
 * is a small lie, and the failure record carries the raw evidence instead (ADR-001 D3-A). */
function classifyClaudeStderr(stderr) {
    return /invalid api key|not logged in|please run \/login|unauthorized|authentication (failed|error)|oauth token (has )?expired/i.test(stderr)
        ? 'claude-not-logged-in'
        : 'exit-nonzero';
}
/** Test seam AND escape hatch for a non-standard install: the executable the bridge spawns.
 * Deliberately an ENV VAR and not a flag — a reviewer's identity should not be something a caller
 * can redirect with a casual command-line switch, and every record says loudly when it was used
 * (round-2 M3). */
const QE_BRIDGE_CLAUDE_BIN_ENV = 'DZ_QE_BRIDGE_CLAUDE_BIN';
/**
 * CRASH FAILPOINT (round-4 R4-1) — test-only, and the ONLY thing it can do is stop. Set
 * `DZ_QE_BRIDGE_FAILPOINT=hang-before-rename` and the process blocks after the temp record is
 * written and before the rename, so a test can SIGKILL it exactly inside the window the atomic
 * update exists to close. Unset (the normal case) it is one string comparison and no behaviour.
 * A crash-window property that no test can enter is a claim, not a guarantee.
 */
const QE_BRIDGE_FAILPOINT_ENV = 'DZ_QE_BRIDGE_FAILPOINT';
/** Files under `.fa-state/qe-bridge/` may quote reviewed source and reviewer prose: owner-only. */
const RECORD_FILE_MODE = 0o600;
const RECORD_DIR_MODE = 0o700;
/**
 * Write a NEW file, never through a symlink, never over an existing one, and never world-readable.
 * `wx` gives O_EXCL (no overwrite, no symlink follow at the final component); the explicit chmods
 * defeat the process umask, which `mode:` alone does not (MEASURED: under umask 022 the round-1
 * writes landed 0644/0755 — round-2 MAJOR M6).
 */
function writeNewFileOrThrow(path, content, mode = RECORD_FILE_MODE) {
    const dir = dirname(path);
    mkdirSync(dir, { recursive: true, mode: RECORD_DIR_MODE });
    try {
        chmodSync(dir, RECORD_DIR_MODE);
    }
    catch { /* not ours to tighten (a pre-existing shared dir) — the file mode below still applies */ }
    writeFileSync(path, content, { flag: 'wx', mode });
    chmodSync(path, mode);
}
/**
 * Path containment that survives a symlinked PARENT (round-2 M6). Lexical `startsWith` is not
 * containment: `features/x/` can be a symlink to `/etc`, and `wx` only refuses a symlink at the
 * FINAL component. So: walk from the deepest EXISTING ancestor, realpath it, and require the result
 * to stay under the realpath of the root — and refuse outright if any existing component on the way
 * is a symlink.
 */
function containedUnderRoot(root, target) {
    let realRoot;
    try {
        realRoot = realpathSync(root);
    }
    catch {
        return { ok: false, why: `the project root ${root} does not resolve` };
    }
    const abs = resolve(root, target);
    const rel = relative(realRoot, abs);
    if (rel === '' || rel.startsWith('..') || isAbsolute(rel))
        return { ok: false, why: `${target} resolves outside the project root` };
    // deepest existing ancestor, with every existing component checked for a symlink
    const parts = rel.split(sep).filter((p) => p !== '');
    let walked = realRoot;
    for (const part of parts) {
        const next = join(walked, part);
        let st;
        try {
            st = lstatSync(next);
        }
        catch {
            break; // this component does not exist yet: nothing below it can be a symlink either
        }
        if (st.isSymbolicLink())
            return { ok: false, why: `${target} passes through the symlink ${relative(realRoot, next)} — refusing (a symlinked parent can redirect a new file out of the repository)` };
        walked = next;
    }
    let realWalked;
    try {
        realWalked = realpathSync(walked);
    }
    catch {
        return { ok: false, why: `${target} has an unresolvable parent` };
    }
    const realRel = relative(realRoot, realWalked);
    if (realRel.startsWith('..') || isAbsolute(realRel))
        return { ok: false, why: `${target} escapes the project root through its parent directories` };
    return { ok: true, path: abs };
}
/**
 * `dz qe-bridge --family claude` — run a Claude reviewer over Step-8-scoped inputs and land a
 * PARSED signoff (feature qe-bridge-claude, ADR-001).
 *
 * The point of the command: when CODEX hosts the run there is no Claude agent plane to dispatch
 * from, so the cross-family QE rule has no vehicle — `buildReqeBrief` hands the human a `null`
 * command template for exactly this case. This is that vehicle, callable from a plain shell.
 *
 * ISOLATION (round-2 CRITICAL C1): both calls run from an EMPTY temporary directory with the
 * runtime's own `--safe-mode --strict-mcp-config --tools '' --no-session-persistence`, and the
 * verdict is read out of the `--output-format json` result envelope. Without that, the reviewer is a
 * fully customized session running INSIDE the repository under review, and hooks/plugins can print a
 * complete signoff onto the same stdout the parser reads (MEASURED — see red-green.md).
 *
 * Exit codes: 0 = a signoff was PARSED (any grade — the bridge reports, `dz reqe` gates),
 * 1 = a NAMED failure (record in `.fa-state/qe-bridge/failed-*.json`, raw output beside it,
 * never at `--out`), 2 = a usage error (nothing spawned, nothing written).
 */
async function cmdQeBridge(options, flags, cwd, write) {
    const json = flags.has('json');
    const usage = 'dz qe-bridge --family claude --slug <feature> [--coder-family codex|claude] [--model <id>] [--files a,b] [--out <file>] [--timeout <s>] [--allow-same-family] [--project <dir>] [--json]';
    const usageError = (message) => {
        write(json ? JSON.stringify({ ok: false, error: message, exitCode: 2 }) : `dz qe-bridge: ${message}\n${usage}`);
        return 2;
    };
    if (flags.has('help')) {
        if (json) {
            write(JSON.stringify({ help: usage, exitCode: 0 }));
            return 0;
        }
        write(usage);
        write('  Runs a CLAUDE reviewer over a feature’s Step-8 artifacts from ANY host (a Codex session included)');
        write('  and writes a parsed SIGNOFF. Exit 0 = a signoff was parsed (ANY grade — the bridge reports, it does');
        write('  not gate); 1 = a named failure (see features/<slug>/.fa-state/qe-bridge/failed-*.json); 2 = usage.');
        write('  --family codex is reserved: the forward bridge is `codex exec` (see .claude/rules/feature-adr-conventions.md).');
        write('  Default report: features/<slug>/08b_reqe_report.md — settle it with');
        write('    dz reqe --slug <feature> --done --report features/<feature>/08b_reqe_report.md');
        write('  DISCLOSURE: the bridge sends the extracts you scope (--files, plus the feature’s manifest/ADR/QE report)');
        write('  to the Claude runtime. It cannot classify secrets — scoping the content you scope is YOUR decision (SEC-5).');
        return 0;
    }
    const ALLOWED_FLAGS = new Set(['json', 'help', 'allow-same-family']);
    for (const flag of flags) {
        if (!ALLOWED_FLAGS.has(flag)) {
            return usageError(`unknown option --${flag}` + (['model', 'slug', 'family', 'out', 'files', 'timeout', 'coder-family', 'project'].includes(flag) ? ` (it takes a value: --${flag} <value>)` : ''));
        }
    }
    const ALLOWED_OPTIONS = new Set(['family', 'slug', 'coder-family', 'model', 'files', 'out', 'timeout', 'project']);
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            return usageError(`unexpected argument "${options.get(key)}"`);
        if (key === 'claude-bin')
            return usageError(`--claude-bin was removed in favour of the ${QE_BRIDGE_CLAUDE_BIN_ENV} environment variable — a TEST SEAM, recorded loudly in every signoff (binOverride:true). Who reviews is not a casual command-line switch.`);
        if (!ALLOWED_OPTIONS.has(key))
            return usageError(`unknown option --${key}`);
    }
    // ── family (the reserved codex direction errors with a pointer, never a silent alias) ──
    const family = options.get('family');
    if (family === undefined)
        return usageError('--family claude is required');
    if (family === 'codex' || family === 'openai') {
        return usageError('--family codex is reserved — the FORWARD bridge already exists: dispatch `codex exec -m <probed-id> --sandbox read-only "<brief>" < /dev/null` (one bridge per direction; see .claude/rules/feature-adr-conventions.md)');
    }
    if (family !== 'claude')
        return usageError(`unsupported --family ${family} (this leg ships "claude" only)`);
    const slug = options.get('slug') ?? '';
    if (!isSafeSlug(slug))
        return usageError('a kebab-case --slug <feature> is required (no path separators, max 40 chars)');
    const root = resolve(cwd, options.get('project') ?? '.');
    const featureDir = join(root, 'features', slug);
    if (!existsSync(featureDir))
        return usageError(`no feature directory at features/${slug} — the bridge reviews an existing feature’s artifacts`);
    // ── coder family: the RECORDED DEBT is the authority; the flag may only fill a gap ──
    //
    // Round-2 MAJOR M3: round 1 let `--coder-family codex` override a debt that said `claude`, which
    // turns the loud `--allow-same-family` escape into an optional formality — a Claude-coded feature
    // could be Claude-reviewed by mis-declaring one flag. The debt is written by the pipeline; the
    // flag is written by whoever is running the command.
    let coderFamily = null;
    let coderFamilySource = 'flag';
    let recordedDebtFamily = null;
    const duePath = join(featureDir, '.fa-state', 'reqe-due.json');
    if (existsSync(duePath)) {
        try {
            const debt = parseReqeDebt(readFileSync(duePath, 'utf-8'));
            if (debt)
                recordedDebtFamily = debt.coderFamily;
        }
        catch { /* unreadable debt: treated as absent, and the flag must then be given */ }
    }
    const coderOpt = options.get('coder-family');
    if (coderOpt !== undefined) {
        // The FLAG surface stays a closed allowlist (the cmdQeBridge discipline — a flag is not a
        // place to accept whatever parses); the FAMILY behind it comes from the ONE mapper the loop
        // runner also uses for its same-family comparison (ADR-002 W20/AM-17). A second normalization
        // here is how a codex-coded run comes to be reviewed by codex under a claude label — the
        // agreement between the two call sites is pinned by a test, not by care.
        const asked = coderOpt === 'codex' || coderOpt === 'openai' || coderOpt === 'claude' ? modelFamily(coderOpt) : null;
        if (asked === null)
            return usageError(`--coder-family must be codex or claude (got "${coderOpt}")`);
        if (recordedDebtFamily !== null && recordedDebtFamily !== asked) {
            return usageError(`--coder-family ${coderOpt} contradicts the recorded debt at features/${slug}/.fa-state/reqe-due.json, which says the coder family was ${recordedDebtFamily}. ` +
                'The debt is the authority: it was written by the run being reviewed, the flag by whoever is invoking this command. ' +
                'Refusing rather than letting a flag re-label who wrote the code — that label is what decides whether this review is cross-family. ' +
                'Fix the flag, or correct the debt file if IT is wrong.');
        }
        coderFamily = asked;
    }
    else if (recordedDebtFamily !== null) {
        coderFamily = recordedDebtFamily;
        coderFamilySource = 'reqe-due.json';
    }
    if (coderFamily === null) {
        return usageError(`--coder-family codex|claude is required (no readable re-QE debt at features/${slug}/.fa-state/reqe-due.json to read it from) — who WROTE the code decides whether this review is cross-family`);
    }
    // ── --out: under the repo, no traversal, no control characters, no symlinked parents ──
    const outOpt = options.get('out') ?? join('features', slug, '08b_reqe_report.md');
    if (hasUnsafePathChars(outOpt) || hasDotDotSegment(outOpt))
        return usageError('--out must not contain control characters or ".." segments');
    const outCheck = containedUnderRoot(root, outOpt);
    if (!outCheck.ok)
        return usageError(`--out ${outCheck.why}`);
    const outPath = outCheck.path;
    // ── timeouts: Number.isFinite-safe clamp (the numeric-clamp lesson) ──
    let timeoutS = QE_BRIDGE_DEFAULT_TIMEOUT_S;
    const timeoutRaw = options.get('timeout');
    if (timeoutRaw !== undefined) {
        const n = Number(timeoutRaw);
        if (!Number.isFinite(n))
            return usageError(`--timeout must be a number of seconds (got "${timeoutRaw}")`);
        timeoutS = Math.min(QE_BRIDGE_MAX_TIMEOUT_S, Math.max(QE_BRIDGE_MIN_TIMEOUT_S, Math.floor(n)));
    }
    // ── model candidates: an allowlist says a name is spellable, only the probe says it answers ──
    const modelOpt = options.get('model');
    if (modelOpt !== undefined && !isSafeClaudeId(modelOpt)) {
        return usageError(`unsafe --model id "${modelOpt}" — ids must match /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/ (a leading "-" would become an option)`);
    }
    const candidates = modelOpt !== undefined ? [modelOpt] : Object.keys(KNOWN_CLAUDE);
    const binRaw = process.env[QE_BRIDGE_CLAUDE_BIN_ENV];
    const binOverride = typeof binRaw === 'string' && binRaw.trim() !== '';
    const binOpt = binOverride ? binRaw.trim() : 'claude';
    if (hasUnsafePathChars(binOpt))
        return usageError(`${QE_BRIDGE_CLAUDE_BIN_ENV} must not contain control characters`);
    let resolvedBin = binOpt;
    if (binOverride) {
        try {
            resolvedBin = realpathSync(binOpt);
        }
        catch {
            resolvedBin = binOpt; // unresolvable: recorded as given, and the spawn will name the failure
        }
    }
    // ── extracts: SCOPED, never a repo dump ──
    const extracts = [];
    const pushIfPresent = (rel, label) => {
        const p = join(root, rel);
        try {
            if (!lstatSync(p).isFile())
                return;
            extracts.push({ label, text: readFileSync(p, 'utf-8') });
        }
        catch { /* absent: the brief says so by omission */ }
    };
    pushIfPresent(join('features', slug, '07_code_changes', 'change_manifest.md'), `features/${slug}/07_code_changes/change_manifest.md`);
    const adrDir = join(featureDir, '03_adr');
    if (existsSync(adrDir)) {
        for (const f of readdirSync(adrDir).filter((n) => n.endsWith('.md')).sort()) {
            pushIfPresent(join('features', slug, '03_adr', f), `features/${slug}/03_adr/${f}`);
        }
    }
    pushIfPresent(join('features', slug, '08_qe_report.md'), `features/${slug}/08_qe_report.md (the review ON RECORD — judge it, do not inherit it)`);
    const filesOpt = options.get('files');
    for (const rel of (filesOpt ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '')) {
        if (hasUnsafePathChars(rel) || hasDotDotSegment(rel) || isAbsolute(rel)) {
            return usageError(`--files entry "${rel}" must be a repo-relative path with no ".." segments and no control characters`);
        }
        const check = containedUnderRoot(root, rel);
        if (!check.ok)
            return usageError(`--files entry "${check.why}"`);
        let st;
        try {
            st = lstatSync(check.path);
        }
        catch {
            return usageError(`--files entry "${rel}" does not exist`);
        }
        if (!st.isFile())
            return usageError(`--files entry "${rel}" is not a regular file (symlinks are refused)`);
        extracts.push({ label: rel, text: readFileSync(check.path, 'utf-8') });
    }
    if (extracts.length === 0) {
        return usageError(`nothing to review: features/${slug} has no change manifest, ADR or QE report, and no --files were given`);
    }
    // ── run identity + the audit bundle (round-2 M7) ──
    //
    // R3-2: the state directory is checked with the SAME containment walk as `--out`, BEFORE anything
    // is created in it. Round 2 contained the record PATHS but not the directory they live in, so a
    // symlinked `.fa-state/qe-bridge` (or `.fa-state`) silently redirected every write — and every
    // chmod — outside the repository. A guard that covers the leaves but not the branch is not a guard.
    const stateDirRel = join('features', slug, '.fa-state', 'qe-bridge');
    const stateCheck = containedUnderRoot(root, stateDirRel);
    if (!stateCheck.ok)
        return usageError(`the audit state directory ${stateCheck.why}`);
    const stateDir = stateCheck.path;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const runId = `${stamp}-${randomBytes(4).toString('hex')}`;
    const requestedOut = relative(root, outPath);
    const uniquePath = (base, ext) => {
        let candidate = `${base}${ext}`;
        for (let n = 2; existsSync(candidate); n += 1)
            candidate = `${base}-${n}${ext}`;
        return candidate;
    };
    /** Retain the raw reviewer stdout. THROWS on failure (R3-3): round 2 swallowed the error and
     * recorded `rawStdoutFile: null`, which turns "we could not keep the evidence" into a field nobody
     * reads. On the success path an unretainable stdout fails the run; on a failure path the forensics
     * are best-effort, because the run is already failing for a named reason. */
    const retainRaw = (stdout, kind) => {
        if (stdout === '')
            return null;
        const p = uniquePath(join(stateDir, `${kind}-${runId}`), '.stdout.txt');
        writeNewFileOrThrow(p, stdout);
        return relative(root, p);
    };
    const retainRawBestEffort = (stdout, kind) => {
        try {
            return retainRaw(stdout, kind);
        }
        catch {
            return null;
        }
    };
    let promptSha256 = null;
    const failRun = (reason, detail, model, forensics) => {
        const emittedAt = new Date().toISOString();
        const rawStdoutFile = forensics === undefined ? null : retainRawBestEffort(forensics.stdout, 'failed');
        const record = buildBridgeFailureRecord(reason, detail, {
            slug,
            model,
            emittedAt,
            runId,
            claudeBin: resolvedBin,
            binOverride,
            requestedOut,
            reportWritten: false,
            rawStdoutFile,
            promptSha256,
        });
        let recordPath = '';
        try {
            recordPath = uniquePath(join(stateDir, `failed-${runId}`), '.json');
            writeNewFileOrThrow(recordPath, `${JSON.stringify(record, null, 2)}\n`);
            if (forensics && forensics.stderr.trim() !== '')
                writeNewFileOrThrow(uniquePath(join(stateDir, `failed-${runId}`), '.stderr.txt'), forensics.stderr);
        }
        catch (primaryError) {
            // R3-1: the one condition that breaks the record medium ITSELF (`audit-write-failed`) must
            // still leave a named record behind, or the closed taxonomy has a member nothing can evidence.
            // Fall back ONE level up, inside the same per-feature state plane — not to an invented path.
            try {
                recordPath = uniquePath(join(featureDir, '.fa-state', `qe-bridge-fallback-${runId}`), '.json');
                writeNewFileOrThrow(recordPath, `${JSON.stringify({ ...record, fallbackFrom: relative(root, stateDir), fallbackReason: String(primaryError) }, null, 2)}\n`);
            }
            catch (fallbackError) {
                write(json ? JSON.stringify({ ok: false, reason, detail, recordError: String(fallbackError), exitCode: 1 }) : `dz qe-bridge: ${reason} — ${detail}\n  (the failure record could NOT be written: ${String(fallbackError)})`);
                return 1;
            }
        }
        if (json)
            write(JSON.stringify({ ok: false, reason, detail, record: relative(root, recordPath), runId, reportWritten: false, requestedOut, exitCode: 1 }));
        else {
            write(`dz qe-bridge: FAILED — ${reason}`);
            write(`  ${detail}`);
            write(`  record: ${relative(root, recordPath)}`);
            write(`  no report was written at ${requestedOut} — an unparseable or absent review is never a passing one.`);
        }
        return 1;
    };
    // ── the prompt (built BEFORE any model call: a same-family refusal must cost nothing) ──
    const built = buildBridgePrompt({ slug, coderFamily, allowSameFamily: flags.has('allow-same-family'), extracts });
    if (!built.ok)
        return failRun(built.reason, built.detail, null);
    const prompt = built.prompt;
    promptSha256 = createHash('sha256').update(prompt).digest('hex');
    // ── the isolated working directory: an EMPTY dir, so project-scoped discovery finds nothing ──
    let isolatedCwd;
    try {
        isolatedCwd = mkdtempSync(join(tmpdir(), 'dz-qe-bridge-iso-'));
    }
    catch (error) {
        return failRun('probe-failed', `could not create an isolated working directory for the reviewer: ${String(error)}`, null);
    }
    const cleanupIsolated = () => {
        try {
            rmSync(isolatedCwd, { recursive: true, force: true });
        }
        catch { /* a leftover empty temp dir is not worth failing a review over */ }
    };
    try {
        // ── probe: the allowlist is a search order, the probe is the answer ──
        let probed = null;
        const probeNotes = [];
        for (const id of candidates) {
            const probeArgs = claudeProbeArgs(id);
            if (probeArgs === null) {
                probeNotes.push(`${id}: unsafe id, never spawned`);
                continue;
            }
            const run = await runClaudeBridge(binOpt, probeArgs, '', QE_BRIDGE_PROBE_TIMEOUT_MS, isolatedCwd);
            if (run.spawnError !== null) {
                const enoent = /ENOENT|not found|no such file/i.test(run.spawnError);
                return failRun(enoent ? 'claude-not-found' : 'probe-failed', enoent
                    ? `\`${binOpt}\` is not runnable (${run.spawnError}) — install/authenticate the Claude CLI, or point ${QE_BRIDGE_CLAUDE_BIN_ENV} at it`
                    : run.spawnError, null);
            }
            if (run.timedOut) {
                probeNotes.push(`${id}: probe timed out after ${QE_BRIDGE_PROBE_TIMEOUT_MS / 1000}s`);
                continue;
            }
            if (interpretClaudeProbe({ stdout: run.stdout, exitCode: run.exitCode ?? 1 })) {
                probed = id;
                break;
            }
            const loginish = classifyClaudeStderr(run.stderr) === 'claude-not-logged-in';
            if (loginish) {
                return failRun('claude-not-logged-in', `the liveness probe for ${id} failed with a login error: ${run.stderr.trim().split('\n')[0]}`, null, { stdout: run.stdout, stderr: run.stderr });
            }
            probeNotes.push(`${id}: exit ${String(run.exitCode)}, no model-authored \`OK\` in the result envelope (${run.stdout.length} chars of stdout)${run.stderr.trim() === '' ? '' : ` (stderr: ${run.stderr.trim().split('\n')[0]})`}`);
        }
        if (probed === null) {
            return failRun('probe-failed', `no candidate model answered the liveness probe — ${probeNotes.join('; ')}`, null);
        }
        // ── the review call ──
        const reviewArgs = claudeReviewArgs(probed);
        if (reviewArgs === null)
            return failRun('probe-failed', `the probed id ${probed} failed id validation on the review path`, probed);
        const started = Date.now();
        const review = await runClaudeBridge(binOpt, reviewArgs, prompt, timeoutS * 1000, isolatedCwd);
        const elapsedMs = Date.now() - started;
        if (review.spawnError !== null) {
            const enoent = /ENOENT|not found|no such file/i.test(review.spawnError);
            return failRun(enoent ? 'claude-not-found' : 'exit-nonzero', review.spawnError, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        if (review.timedOut) {
            return failRun('timeout', `the review call exceeded --timeout ${timeoutS}s and the child was killed (timeout-${timeoutS}s)`, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        if (review.exitCode !== 0) {
            const reason = classifyClaudeStderr(review.stderr);
            return failRun(reason, `\`${binOpt}\` exited ${String(review.exitCode)}${review.stderr.trim() === '' ? ' with no stderr' : `: ${review.stderr.trim().split('\n')[0]}`}` +
                (reason === 'exit-nonzero' ? ' — the cause is NOT classified: from outside the process a limit-exhaustion death and a crash look alike, so the raw evidence is saved instead of a guess.' : ''), probed, { stdout: review.stdout, stderr: review.stderr });
        }
        if (review.stdout.trim() === '') {
            return failRun('empty-output', `the review call exited 0 with no output (${review.stdout.length} chars) — silence is not a clean review`, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        // ── PARSE, never synthesize ──
        const emittedAt = new Date().toISOString();
        const parsed = parseBridgeOutput(review.stdout, { slug, coderFamily, model: probed, elapsedMs, promptSha256, emittedAt });
        if (!parsed.ok) {
            // No `?? <some named reason>` fallback: a state the parser did not name is its OWN failure
            // (round-2 MAJOR M5 — laundering an unknown state into `no-grade-marker` reads like a verdict
            // about the reviewer's text when it is really a verdict about our own code).
            const reason = parsed.reason;
            return failRun(reason, parsed.detail, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        const signoff = parsed.signoff;
        // ── landing (R3-3 ordering): AUDIT FIRST, then the report, then the truth about the report ──
        //
        // Round 2 wrote the report BEFORE the record, so a crash between the two left a report on disk
        // and a record that said `reportWritten:false` — metadata that lies in the direction of "no
        // review happened" while a review report sits next to it. The order below can only ever
        // understate: the record exists first saying false, the report lands, then the record is
        // corrected. A crash at any point leaves a record that is true or pessimistic, never optimistic.
        let rawStdoutFile;
        try {
            rawStdoutFile = retainRaw(review.stdout, 'signoff');
        }
        catch (error) {
            return failRun('audit-write-failed', `the review was PARSED (grade ${signoff.grade}) but its raw stdout could not be retained: ${String(error)} — an unauditable success is not a success, so the run FAILS rather than shipping a verdict nobody can re-derive`, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        const recordText = (reportWritten) => `${JSON.stringify(buildBridgeSignoffRecord(signoff, {
            runId,
            claudeBin: resolvedBin,
            binOverride,
            requestedOut,
            reportWritten,
            rawStdoutFile,
            promptSha256,
            ...(parsed.channels === undefined ? {} : { channels: parsed.channels }),
        }), null, 2)}\n`;
        let signoffPath;
        try {
            signoffPath = uniquePath(join(stateDir, `signoff-${runId}`), '.json');
            writeNewFileOrThrow(signoffPath, recordText(false));
        }
        catch (error) {
            return failRun('audit-write-failed', `the review was PARSED (grade ${signoff.grade}) but the signoff record could not be written: ${String(error)} — the verdict exists and cannot be persisted, so the run FAILS rather than reporting an unrecorded success`, probed, { stdout: review.stdout, stderr: review.stderr });
        }
        let reportError = null;
        try {
            writeNewFileOrThrow(outPath, renderBridgeReport(signoff), 0o600);
        }
        catch (error) {
            reportError = error;
        }
        if (reportError === null) {
            // the ONLY moment `reportWritten:true` may appear: after the report is on disk
            try {
                // ATOMIC (R4-1): write a sibling temp file, then rename() over the original. On the same
                // filesystem rename is atomic, so a reader — or a crash — sees the OLD complete record or
                // the NEW complete record, never a truncated one. Round 3 truncated and rewrote in place,
                // which made the "a crash leaves a record that is true or pessimistic" claim untrue in the
                // one case it was about.
                const tmpPath = `${signoffPath}.tmp.${process.pid}`;
                writeNewFileOrThrow(tmpPath, recordText(true));
                if (process.env[QE_BRIDGE_FAILPOINT_ENV] === 'hang-before-rename') {
                    // test-only: stop dead INSIDE the window, so a SIGKILL can prove the property
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 600_000);
                }
                renameSync(tmpPath, signoffPath);
                chmodSync(signoffPath, RECORD_FILE_MODE);
            }
            catch (error) {
                return failRun('audit-write-failed', `the report landed at ${requestedOut} but the signoff record could not be updated to say so: ${String(error)} — the record on disk understates (reportWritten:false); re-run rather than trusting a record that disagrees with the tree`, probed, { stdout: review.stdout, stderr: review.stderr });
            }
        }
        else {
            const detail = `the review was PARSED (grade ${signoff.grade}) but ${requestedOut} could not be written: ${String(reportError)} — prior evidence is never overwritten and a symlinked target is never followed; the verdict is preserved at ${relative(root, signoffPath)} with reportWritten:false`;
            return failRun('report-write-failed', detail, probed, { stdout: '', stderr: '' });
        }
        if (json) {
            write(JSON.stringify({
                ok: true,
                grade: signoff.grade,
                gradedBy: signoff.gradedBy,
                coderFamily: signoff.coderFamily,
                coderFamilySource,
                findings: signoff.findings.length,
                report: requestedOut,
                reportWritten: true,
                signoff: relative(root, signoffPath),
                rawStdout: rawStdoutFile,
                runId,
                binOverride,
                claudeBin: resolvedBin,
                elapsedMs,
                promptChars: prompt.length,
                promptSha256,
                channels: parsed.channels,
                exitCode: 0,
            }));
        }
        else {
            write(`dz qe-bridge: GRADE ${signoff.grade} from claude/${signoff.gradedBy.model} — ${signoff.findings.length} finding(s) in ${Math.round(elapsedMs / 1000)}s`);
            if (binOverride)
                write(`  ⚠ reviewer executable OVERRIDDEN via ${QE_BRIDGE_CLAUDE_BIN_ENV}: ${resolvedBin} (recorded as binOverride:true — this signoff does not prove Anthropic's runtime answered)`);
            write(`  report:  ${requestedOut}`);
            write(`  signoff: ${relative(root, signoffPath)}`);
            write(`  settle:  dz reqe --slug ${slug} --done --report ${requestedOut}`);
            write('  the bridge REPORTS (any grade exits 0); gating stays with dz reqe and the host pipeline.');
        }
        return 0;
    }
    finally {
        cleanupIsolated();
    }
}
function scoreReceiptFiles(root) {
    const featuresDir = join(root, 'features');
    let features;
    try {
        features = readdirSync(featuresDir, { withFileTypes: true });
    }
    catch {
        return [];
    }
    const receipts = [];
    for (const feature of features) {
        if (!feature.isDirectory())
            continue;
        const stateDir = join(featuresDir, feature.name, '.fa-state');
        let entries;
        try {
            if (lstatSync(stateDir).isSymbolicLink())
                continue;
            entries = readdirSync(stateDir, { withFileTypes: true });
        }
        catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isFile())
                continue;
            const match = /^score-(.+)\.json$/.exec(entry.name);
            if (match === null || match[1] === undefined || match[1] === '')
                continue;
            const path = join(stateDir, entry.name);
            receipts.push({ path, displayPath: relative(root, path), qeHash: match[1] });
        }
    }
    return receipts.sort((a, b) => a.displayPath < b.displayPath ? -1 : a.displayPath > b.displayPath ? 1 : 0);
}
function scoreAggregateChainLine(text) {
    if (text === '') {
        return { line: 'chain: NOT_PRESENT — no aggregate evidence file was created', verification: null, defectAges: null };
    }
    const verification = verifyEventChainText(text);
    const defectAges = classifyChainDefects(verification, verification.lines);
    const kinds = new Map();
    for (const defect of verification.defects)
        kinds.set(defect.kind, (kinds.get(defect.kind) ?? 0) + 1);
    const kindText = [...kinds.entries()].map(([kind, count]) => `${kind}: ${count}`).join(' · ');
    const line = `chain: ${verification.ok ? 'OK' : 'FAILED'} · ${verification.chained} chained · ` +
        `${verification.resets} recorded restart(s) · before-run defects ${defectAges.beforeRun.length} · ` +
        `in-run defects ${defectAges.inRun.length} · current run ${defectAges.runRecords} record(s)` +
        (kindText === '' ? '' : ` · ${kindText}`) +
        ` — ${verification.scope}`;
    return { line, verification, defectAges };
}
function cmdScoreAll(options, flags, cwd, write) {
    const json = flags.has('json');
    if (options.has('slug')) {
        write(json
            ? JSON.stringify({ error: '--all and --slug are mutually exclusive', exitCode: 1 })
            : 'dz score: --all and --slug are mutually exclusive');
        return 1;
    }
    const root = resolve(cwd, options.get('project') ?? '.');
    const receiptFiles = scoreReceiptFiles(root);
    if (receiptFiles.length === 0) {
        const report = buildScoreAggregateReport([], [], 0);
        const chain = scoreAggregateChainLine('');
        if (json)
            write(JSON.stringify({ ...report, chain: null, aggregatePath: '.dz/feature-adr/scorecards.jsonl', exitCode: 0 }, null, 2));
        else {
            write(renderScoreAggregateReport(report));
            write(chain.line);
        }
        return 0;
    }
    const ts = new Date().toISOString();
    const rows = [];
    const unreadableReceipts = [];
    for (const receipt of receiptFiles) {
        try {
            rows.push(scoreReceiptToAggregateRow({
                content: readFileSync(receipt.path, 'utf8'),
                qeHash: receipt.qeHash,
                ts,
            }));
        }
        catch {
            unreadableReceipts.push(receipt.displayPath);
        }
    }
    const storeDir = join(root, '.dz', 'feature-adr');
    const aggregatePath = join(storeDir, 'scorecards.jsonl');
    let finalText = '';
    let finalRows = rows;
    let appended = 0;
    let storeError = null;
    try {
        const result = withNamedLockSync(storeDir, 'scorecards', () => {
            let existingText = '';
            try {
                existingText = readFileSync(aggregatePath, 'utf8');
            }
            catch (error) {
                if (error.code !== 'ENOENT')
                    throw error;
            }
            const fresh = dedupeScoreAggregateRows(rows, readScoreAggregateRows(existingText));
            const appendText = appendChainedLines(fresh, readTailInfo(existingText));
            if (appendText !== '')
                appendFileSync(aggregatePath, appendText, { encoding: 'utf8', mode: 0o600 });
            const settledText = existingText + appendText;
            return { text: settledText, rows: readScoreAggregateRows(settledText), appended: fresh.length };
        });
        finalText = result.text;
        finalRows = result.rows;
        appended = result.appended;
    }
    catch (error) {
        storeError = error instanceof Error ? error.message : String(error);
    }
    const report = buildScoreAggregateReport(finalRows, unreadableReceipts, appended);
    const chain = scoreAggregateChainLine(finalText);
    if (json) {
        write(JSON.stringify({
            ...report,
            aggregatePath: '.dz/feature-adr/scorecards.jsonl',
            chain: chain.verification === null ? null : { verification: chain.verification, defectAges: chain.defectAges },
            storeError,
            exitCode: 0,
        }, null, 2));
    }
    else {
        write(renderScoreAggregateReport(report));
        write(chain.line);
        if (storeError !== null)
            write(`store error (nothing was claimed appended): ${storeError}`);
    }
    return 0;
}
function cmdScore(options, flags, cwd, write) {
    const json = flags.has('json');
    if (flags.has('help')) {
        const usage = 'dz score --slug <feature> [--project <dir>] [--json] — process scorecard for one feature-adr run (descriptive-only, never a gate)';
        if (json)
            write(JSON.stringify({ help: usage, exitCode: 0 })); // --json stays ONE document even for help
        else {
            write(usage);
            write('dz score --all [--project <dir>] [--json] — sweep immutable score receipts into the append-only chained aggregate');
            write('  disciplines: ADR confirmation · discrimination · cross-model QE · live verification · README-first · learning loop · amendments');
            write('  descriptive-only, never a gate: a low score exits 0');
        }
        return 0;
    }
    for (const flag of flags) {
        if (!new Set(['json', 'help', 'all']).has(flag)) {
            write(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : `dz score: unknown option --${flag}\n  allowed: --slug <feature>, --project <dir>, --json`);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_') || !new Set(['slug', 'project']).has(key)) {
            const what = key.startsWith('_positional_') ? `unexpected argument "${options.get(key)}"` : `unknown option --${key}`;
            write(json ? JSON.stringify({ error: what, exitCode: 1 }) : `dz score: ${what}\n  allowed: --slug <feature>, --project <dir>, --json`);
            return 1;
        }
    }
    if (flags.has('all'))
        return cmdScoreAll(options, flags, cwd, write);
    const slug = options.get('slug') ?? '';
    // The delivery-check traversal lesson, upgraded to a WHITELIST: `.` slipped the blacklist and
    // silently aggregated the entire features/ tree as one "run" (Codex QE #2).
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug) || slug === '.' || slug === '..' || slug.includes('..')) {
        write(json ? JSON.stringify({ error: 'a plain --slug <feature> is required (no path separators)', exitCode: 1 }) : 'dz score: a plain --slug <feature> is required (no path separators)');
        return 1;
    }
    const root = resolve(cwd, options.get('project') ?? '.');
    const dir = join(root, 'features', slug);
    if (!existsSync(dir)) {
        write(json ? JSON.stringify({ error: `no run at features/${slug}/`, exitCode: 1 }) : `dz score: no run at features/${slug}/`);
        return 1;
    }
    // Gather the artifact texts (bounded, best-effort — an unreadable file is skipped, not fatal).
    const artifacts = {};
    let fileBudget = 200; // a run has ~a dozen artifacts; a wide tree must degrade, not exhaust memory
    const walk = (d, prefix, depth) => {
        if (depth > 3 || fileBudget <= 0)
            return;
        let entries;
        try {
            entries = readdirSync(d);
        }
        catch {
            return;
        }
        for (const name of entries) {
            if (fileBudget <= 0)
                return;
            const full = join(d, name);
            const rel = prefix === '' ? name : `${prefix}/${name}`;
            try {
                // lstat: a symlinked artifact (or a symlinked features/<slug> subtree) could smuggle
                // OUTSIDE text into the scorecard's evidence (Codex QE #5).
                const st = lstatSync(full);
                if (st.isSymbolicLink())
                    continue;
                if (st.isDirectory())
                    walk(full, rel, depth + 1);
                else if (st.isFile() && name.endsWith('.md') && st.size < 512 * 1024) {
                    artifacts[rel] = readFileSync(full, 'utf-8');
                    fileBudget -= 1;
                }
            }
            catch {
                /* skip unreadable */
            }
        }
    };
    walk(dir, '', 0);
    const card = scoreRun(slug, artifacts);
    // re-QE debt note (backlog 6b40e667): a scorecard that praised cross-model QE while an unsettled
    // same-family debt sits on disk would be half the truth. PARSED, not existence-guessed (QE #9);
    // a malformed debt file is named. Advisory in both modes — never moves the score or exit code.
    let reqeNote = null;
    {
        const scan = scanReqeDebts(root);
        const mine = scan.debts.find((d) => d.debt.slug === slug);
        if (mine)
            reqeNote = 'UNSETTLED re-QE debt — Step-8 ran same-family under the usage override; run `dz reqe --slug ' + slug + '`';
        else if (existsSync(join(dir, '.fa-state', 'reqe-due.json')))
            reqeNote = 'a reqe-due.json exists but is MALFORMED/mismatched — inspect features/' + slug + '/.fa-state/ manually';
    }
    if (json)
        write(JSON.stringify({ ...card, reqeDebt: reqeNote, exitCode: 0 }, null, 2));
    else {
        write(renderScorecard(card));
        if (reqeNote)
            write('note: ' + reqeNote);
    }
    return 0;
}
/**
 * Read the apply-leg usage log into the shape `compounding.ts` / `epoch-replay.ts` expect.
 *
 * ONE reader, because there were two and they disagreed: the `dz compounding` fact-gatherer used
 * to drop `eventId` and `queryTruncated`, so the readiness gate counted 48 "replayable pairs" over
 * a log whose honest count is 25 (MEASURED on this repo, 2026-07-29). Both defences documented in
 * `assembleCompoundingReport` — "one prompt = one pair" (Codex #1) and "a truncated query is a
 * prefix, not the prompt" (Codex #3) — were correct in the pure function and DEAD at its only
 * caller, because the caller never passed the fields they read.
 */
function readRecallUsageEvents(root) {
    const usage = [];
    try {
        const text = readFileSync(join(root, '.dz', 'recall-usage.jsonl'), 'utf-8');
        for (const line of text.split('\n')) {
            if (line.trim() === '')
                continue;
            try {
                const o = JSON.parse(line);
                if (typeof o.dzId === 'string' && typeof o.ts === 'string' && o.kind !== 'aggregate') {
                    usage.push({
                        dzId: o.dzId,
                        ts: o.ts,
                        ...(typeof o.query === 'string' ? { query: o.query } : {}),
                        ...(typeof o.runId === 'string' ? { runId: o.runId } : {}),
                        ...(typeof o.eventId === 'string' ? { eventId: o.eventId } : {}),
                        ...(o.queryTruncated === true ? { queryTruncated: true } : {}),
                    });
                }
            }
            catch {
                /* one bad line must not kill the read */
            }
        }
    }
    catch {
        /* no log yet — callers report the absence */
    }
    return usage;
}
function readOptionalText(path) {
    try {
        return readFileSync(path, 'utf8');
    }
    catch {
        return '';
    }
}
function localEvidenceReadReason(resource, error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
    return code === 'ENOENT' ? `${resource}-missing` : `${resource}-unreadable`;
}
function unavailablePromotionEvidence(reason) {
    return { source: { status: 'not-measured', reason }, acceptances: [], truncatedPeriods: [], acceptanceHistoryComplete: false };
}
function readPromotionRunEvidence(root) {
    let raw;
    try {
        raw = JSON.parse(readFileSync(join(root, PROMOTION_STATE_FILE), 'utf-8'));
    }
    catch (error) {
        const reason = error instanceof SyntaxError
            ? 'promotion-journal-malformed'
            : localEvidenceReadReason('promotion-journal', error);
        return unavailablePromotionEvidence(reason);
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return unavailablePromotionEvidence('promotion-journal-malformed');
    }
    const record = raw;
    if (record['version'] !== 1 || !Object.hasOwn(record, 'runs')) {
        return unavailablePromotionEvidence(record['version'] === 1 ? 'promotion-history-not-recorded' : 'promotion-journal-malformed');
    }
    if (!Array.isArray(record['runs'])) {
        return unavailablePromotionEvidence('promotion-history-malformed');
    }
    const state = normalizePromotionState(raw);
    if (state.runs === undefined || state.runs.length !== record['runs'].length) {
        return unavailablePromotionEvidence('promotion-history-malformed');
    }
    if ((Object.hasOwn(record, 'acceptances') && (!Array.isArray(record['acceptances']) || state.acceptances?.length !== record['acceptances'].length)) ||
        (Object.hasOwn(record, 'truncatedRunPeriods') && (!Array.isArray(record['truncatedRunPeriods']) || state.truncatedRunPeriods?.length !== record['truncatedRunPeriods'].length)) ||
        (Object.hasOwn(record, 'acceptanceHistoryComplete') && typeof record['acceptanceHistoryComplete'] !== 'boolean')) {
        return unavailablePromotionEvidence('promotion-history-malformed');
    }
    const derivedAcceptances = state.runs.flatMap((run) => run.candidates
        .filter((candidate) => candidate.verdict === 'promote' && candidate.ruleContentAnchor !== null)
        .map((candidate) => ({ ruleContentAnchor: candidate.ruleContentAnchor, acceptedTs: run.ts })));
    const claimedAcceptanceComplete = state.acceptanceHistoryComplete ??
        ((state.truncatedRunPeriods?.length ?? 0) === 0 && state.runs.every((run) => run.complete === true));
    if (claimedAcceptanceComplete && state.acceptances !== undefined && derivedAcceptances.some((derived) => !state.acceptances.some((stored) => stored.ruleContentAnchor === derived.ruleContentAnchor &&
        Date.parse(stored.acceptedTs) <= Date.parse(derived.acceptedTs)))) {
        return unavailablePromotionEvidence('promotion-history-malformed');
    }
    const acceptancesByAnchor = new Map();
    for (const acceptance of [...(state.acceptances ?? []), ...derivedAcceptances]) {
        const prior = acceptancesByAnchor.get(acceptance.ruleContentAnchor);
        if (prior === undefined || Date.parse(acceptance.acceptedTs) < Date.parse(prior.acceptedTs)) {
            acceptancesByAnchor.set(acceptance.ruleContentAnchor, acceptance);
        }
    }
    return {
        source: { status: 'measured', rows: state.runs },
        acceptances: [...acceptancesByAnchor.values()],
        truncatedPeriods: state.truncatedRunPeriods ?? [],
        acceptanceHistoryComplete: claimedAcceptanceComplete,
    };
}
function readGuardAuditEvidence(root) {
    let text;
    try {
        text = readFileSync(join(root, '.dz', 'guard-audit.jsonl'), 'utf-8');
    }
    catch (error) {
        return {
            source: { status: 'not-measured', reason: localEvidenceReadReason('guard-audit', error) },
            rows: [],
            text: null,
        };
    }
    const rows = [];
    let malformed = false;
    for (const line of text.split('\n')) {
        if (line.trim() === '')
            continue;
        try {
            const raw = JSON.parse(line);
            if (!isOffsetIsoTimestamp(raw['ts']) ||
                !['publish', 'teach', 'consolidate', 'reindex'].includes(String(raw['op'])) ||
                !['pass', 'warn', 'block'].includes(String(raw['verdict']))) {
                malformed = true;
                continue;
            }
            const violations = [];
            if (!Array.isArray(raw['violations'])) {
                malformed = true;
                continue;
            }
            for (const item of raw['violations']) {
                const rule = item && typeof item === 'object' ? item.rule : undefined;
                if (typeof rule !== 'string' || rule === '' || rule.length > 200) {
                    malformed = true;
                    continue;
                }
                const anchor = item.contentAnchor;
                if (anchor !== undefined && !isLessonRuleContentAnchor(anchor)) {
                    malformed = true;
                    continue;
                }
                violations.push({ rule, ...(typeof anchor === 'string' ? { contentAnchor: anchor } : {}) });
            }
            const verdict = raw['verdict'];
            if ((verdict === 'pass') !== (violations.length === 0))
                malformed = true;
            rows.push({
                ts: raw['ts'],
                op: raw['op'],
                verdict,
                rules: violations.map((item) => item.rule),
                violations,
            });
        }
        catch {
            malformed = true;
        }
    }
    return {
        source: malformed
            ? { status: 'not-measured', reason: 'guard-audit-malformed' }
            : !verifyEventChainText(text).ok
                ? { status: 'not-measured', reason: 'guard-audit-chain-corrupt' }
                : { status: 'measured', rows },
        rows,
        text,
    };
}
function deadwoodAllowlistText() {
    const require = createRequire(import.meta.url);
    const corePackage = require.resolve('@dzhechkov/harness-core/package.json');
    return readFileSync(join(dirname(corePackage), 'src', 'deadwood-allowlist.json'), 'utf8');
}
function cmdUsageDepthDays(root, now) {
    const text = readOptionalText(join(root, CMD_USAGE_LOG_RELATIVE));
    if (text === '')
        return null;
    return measureCmdUsageDepthDays(text, now);
}
/** Canonical deadwood candidates keyed to every alternate top-level dispatch token. */
const DEADWOOD_COMMAND_ALIASES = {
    sync: ['update'],
};
function deadwoodInventory(root) {
    const aliasTokens = new Set(Object.values(DEADWOOD_COMMAND_ALIASES).flat());
    const inventory = DZ_COMMANDS
        .filter((surface) => !aliasTokens.has(surface))
        .map((surface) => ({
        surface,
        kind: 'command',
        ...(DEADWOOD_COMMAND_ALIASES[surface] === undefined
            ? {}
            : { aliases: DEADWOOD_COMMAND_ALIASES[surface] }),
    }));
    for (const rule of DEFAULT_RULES)
        inventory.push({ surface: rule.id, kind: 'rule' });
    const skillDir = resolve(root, '.claude/skills');
    const { skills } = listSkillsDetailed(skillDir);
    for (const skill of skills)
        inventory.push({ surface: skill.id, kind: 'skill' });
    return inventory;
}
/** `dz deadwood` is a read-only advisory report; findings never affect the exit code. */
function cmdDeadwood(options, flags, cwd, write, writeErr) {
    if (flags.has('weeks')) {
        writeErr('dz deadwood: --weeks requires an integer value');
        return 1;
    }
    const rawWeeks = options.get('weeks') ?? '8';
    const weeks = Number(rawWeeks);
    if (!Number.isInteger(weeks) || weeks <= 0 || weeks > 520) {
        writeErr(`dz deadwood: --weeks must be an integer from 1 to 520 (received ${JSON.stringify(rawWeeks)})`);
        return 1;
    }
    const root = resolve(cwd);
    try {
        // Observe integrity before maintenance: compaction may discard malformed lines, but this run
        // still has to report that they existed rather than laundering the count to zero.
        const cmdUsageText = readOptionalText(join(resolveCmdUsageRoot(root), CMD_USAGE_LOG_RELATIVE));
        const report = buildDeadwoodReport({
            cmdUsageText,
            guardAuditText: readOptionalText(join(root, '.dz', 'guard-audit.jsonl')),
            inventory: deadwoodInventory(root),
            allowlistText: deadwoodAllowlistText(),
            weeks,
            now: new Date(),
        });
        compactCmdUsageIfNeeded(root);
        if (flags.has('json'))
            write(JSON.stringify({ ...report, exitCode: 0 }, null, 2));
        else
            write(renderDeadwoodReport(report, 'text'));
        return 0;
    }
    catch (error) {
        writeErr(`dz deadwood: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}
/**
 * `dz compounding` — does the learning loop actually PAY? (feature compounding, scout C2.)
 * Gathers the facts (store rows, apply-leg usage log, guard audit) and hands them to the PURE
 * report assembler. Gates without enough data say INSUFFICIENT_DATA — never a fake verdict.
 */
function cmdCompounding(options, flags, cwd, write) {
    const json = flags.has('json');
    if (flags.has('help')) {
        write('dz compounding [--project <dir>] [--json] — honest learning-loop payoff report');
        write('  pool payoff · guard trajectory · replay readiness · instrumentation · monthly eligible→attempted→accepted→executions funnel');
        return 0;
    }
    for (const flag of flags) {
        if (!new Set(['json', 'help']).has(flag)) {
            write(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : `dz compounding: unknown option --${flag}\n  allowed: --project <dir>, --json`);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_')) {
            write(json ? JSON.stringify({ error: `unexpected argument "${options.get(key)}"`, exitCode: 1 }) : `dz compounding: unexpected argument "${options.get(key)}"\n  allowed: --project <dir>, --json`);
            return 1;
        }
        if (key !== 'project') {
            write(json ? JSON.stringify({ error: `unknown option --${key}`, exitCode: 1 }) : `dz compounding: unknown option --${key}\n  allowed: --project <dir>, --json`);
            return 1;
        }
    }
    const root = resolve(cwd, options.get('project') ?? '.');
    // lessons — the store, with reinforcement + quarantine metadata
    const lessons = loadStoreRecords(root).map((r) => ({
        dzId: r.id,
        uses: readReinforcementState(r).uses,
        quarantined: readQuarantineState(r).quarantined,
        reward: typeof r.score === 'number' ? r.score : null,
    }));
    // apply-leg usage events (read records only; aggregate rows carry no query by construction)
    const usage = readRecallUsageEvents(root);
    const promotionEvidence = readPromotionRunEvidence(root);
    const guardEvidence = readGuardAuditEvidence(root);
    const guard = [...guardEvidence.rows];
    // The evidence logs themselves, verbatim: the report verifies their hash chains (feature
    // event-chain). Handing over the TEXT rather than a pre-computed verdict keeps one definition of
    // "the chain is intact" — a second copy here is how a gate and its report start disagreeing.
    const evidenceLogs = [];
    for (const rel of ['.dz/recall-usage.jsonl']) {
        try {
            evidenceLogs.push({ log: rel, text: readFileSync(join(root, ...rel.split('/')), 'utf-8') });
        }
        catch {
            /* absent log — reported by its own gate above, not invented here */
        }
    }
    if (guardEvidence.text !== null) {
        evidenceLogs.push({ log: '.dz/guard-audit.jsonl', text: guardEvidence.text });
    }
    const now = new Date();
    const report = assembleCompoundingReport({
        lessons,
        usage,
        guard,
        nowTs: now.toISOString(),
        evidenceLogs,
        cmdUsageDepthDays: cmdUsageDepthDays(root, now),
        lessonToRule: {
            promotionRuns: promotionEvidence.source,
            guardAudits: guardEvidence.source,
            promotionAcceptances: promotionEvidence.acceptances,
            truncatedPromotionPeriods: promotionEvidence.truncatedPeriods,
            acceptanceHistoryComplete: promotionEvidence.acceptanceHistoryComplete,
        },
    });
    // lesson-bandit-rerank §11: the payoff axis joins THIS report rather than growing a private
    // dashboard — the `rewardEvents : exposureEvents` row asks exactly the question this command
    // already asks of the reinforcement loop (is the apply leg alive, or is it a write-only log?).
    // Read-only, and INSUFFICIENT_DATA on an absent state file — never a fake verdict.
    const bandit = banditStats(root);
    if (json)
        write(JSON.stringify({ ...report, bandit, exitCode: 0 }, null, 2));
    else
        write(`${renderCompoundingReport(report)}\n\n${renderBanditHealth(bandit)}`);
    return 0;
}
// ── `dz epoch-replay` (feature epoch-replay) ────────────────────────────────────────────────────
const EPOCH_REPLAY_DIR = join('.dz', 'epoch-replay');
const EPOCH_REPLAY_USAGE = [
    'dz epoch-replay --mock  [--n <N>] [--effect <-1..1>] [--tie-rate <0..1>] [--seed <N>] [--slice <name>] [--margin <0..1>] [--json]',
    'dz epoch-replay --emit  [--project <dir>] [--limit <N>] [--seed <N>] [--margin <0..0.5>] [--out <file>] [--json]',
    'dz epoch-replay --judge <filled-work-order.json> [--out <file>] [--json]',
    'dz epoch-replay --score <judgments.json> --work-order <file> [--slice <name>] [--json]   (margin comes from the work order)',
].join('\n  ');
/** Read a JSON file into an object, or return a parse/IO error string. */
function readJsonFile(path) {
    try {
        return { value: JSON.parse(readFileSync(path, 'utf-8')) };
    }
    catch (e) {
        return { error: `cannot read ${path}: ${e instanceof Error ? e.message : String(e)}` };
    }
}
/**
 * Integrity-check a parsed work order. Checking `kind` + `Array.isArray(items)` was VACUOUS: a
 * hand-written file with those two fields and a fabricated `warmIsA` bought whatever verdict its
 * author wanted (Codex QE HIGH-2). `verifyWorkOrder` recomputes the digest AND re-derives every
 * assignment from the stated seed.
 */
function asVerifiedWorkOrder(value) {
    const v = verifyWorkOrder(value);
    if (!v.ok)
        return { problems: v.problems };
    return { order: value };
}
function writeJsonOut(path, value) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}
/** Numeric option parsing that never silently accepts garbage. */
function numOpt(options, key) {
    const raw = options.get(key);
    if (raw === undefined)
        return null;
    const n = Number(raw);
    if (!Number.isFinite(n))
        return { error: `--${key} expects a finite number, got ${JSON.stringify(raw)}` };
    return { value: n };
}
/**
 * `dz epoch-replay` — the executable cold-vs-warm epoch runner (feature epoch-replay, scout #4).
 *
 * `dz compounding` says whether a replay CAN be run; this says what it FOUND. The runner never
 * calls a model: real mode emits a work order, renders blind judge prompts, and scores filled
 * judgments; `--mock` exercises the same verdict math on seeded synthetic outcomes at $0.
 */
function cmdEpochReplay(options, flags, cwd, write) {
    const json = flags.has('json');
    const fail = (msg) => {
        write(json ? JSON.stringify({ error: msg, exitCode: 1 }) : `dz epoch-replay: ${msg}\n  usage:\n  ${EPOCH_REPLAY_USAGE}`);
        return 1;
    };
    if (flags.has('help')) {
        write(`dz epoch-replay — cold (epoch 0) vs warm (epoch 1), Wilson-CI three-valued verdict\n  ${EPOCH_REPLAY_USAGE}`);
        write('');
        write('  ONE binomial over DECISIVE pairs (ties carry no direction and are excluded from the test).');
        write('  SUPPORTED only when the paired lift interval lies ENTIRELY above zero.');
        write('  FALSIFIED only on HARM (entirely below zero), or on a passed NON-SUPERIORITY test (the');
        write('  lift upper bound below the PRE-REGISTERED margin, default 0.05). Otherwise INCONCLUSIVE —');
        write('  a first-class honest outcome; a tie is UNDER-POWERED, never "refuted".');
        write('  The margin is pre-registered at --emit and stored in the work order; --score reads it there.');
        write('  This runner ORCHESTRATES and SCORES; it never calls a model. The judge-facing file holds');
        write('  {id, prompt} and nothing else; --score refuses any work order whose digest or seed-derived');
        write('  assignment does not check out, and refuses duplicate judgement ids.');
        return 0;
    }
    const allowedFlags = new Set(['mock', 'emit', 'json', 'help']);
    for (const flag of flags) {
        if (!allowedFlags.has(flag))
            return fail(`unknown option --${flag}`);
    }
    const allowedOptions = new Set(['judge', 'score', 'work-order', 'project', 'out', 'n', 'effect', 'tie-rate', 'seed', 'slice', 'limit', 'margin']);
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            return fail(`unexpected argument "${options.get(key)}"`);
        if (!allowedOptions.has(key))
            return fail(`unknown option --${key}`);
    }
    // Exactly ONE mode. A command whose default mode is a report can silently swallow a typo'd mode
    // flag and print something that reads like a result — so there is NO default mode here.
    const modes = [
        flags.has('mock') ? 'mock' : null,
        flags.has('emit') ? 'emit' : null,
        options.has('judge') ? 'judge' : null,
        options.has('score') ? 'score' : null,
    ].filter((m) => m !== null);
    if (modes.length === 0)
        return fail('pick exactly one mode: --mock | --emit | --judge <file> | --score <file>');
    if (modes.length > 1)
        return fail(`modes are exclusive, got: ${modes.join(', ')}`);
    const mode = modes[0];
    const num = (key) => {
        const r = numOpt(options, key);
        if (r === null)
            return undefined;
        if ('error' in r)
            return r;
        return r.value;
    };
    // ── --mock: seeded synthetic outcomes, $0, exercises the real verdict math ──
    if (mode === 'mock') {
        for (const key of ['judge', 'score', 'work-order', 'project', 'out', 'limit']) {
            if (options.has(key))
                return fail(`--${key} is not valid with --mock`);
        }
        const parsed = {};
        for (const key of ['n', 'effect', 'tie-rate', 'seed']) {
            const v = num(key);
            if (typeof v === 'object' && v !== null)
                return fail(v.error);
            parsed[key] = v;
        }
        const outcomes = generateMockOutcomes({
            n: parsed.n ?? DEFAULT_MOCK_N,
            effect: parsed.effect ?? 0,
            tieRate: parsed['tie-rate'] ?? 0,
            seed: parsed.seed ?? DEFAULT_MOCK_SEED,
        });
        const marginOpt = numOpt(options, 'margin');
        if (marginOpt !== null && 'error' in marginOpt)
            return fail(marginOpt.error);
        const result = scoreEpochReplay(outcomes, {
            slice: options.get('slice') ?? 'all',
            ...(marginOpt !== null ? { margin: marginOpt.value } : {}),
        });
        if (result.refusal !== null)
            return fail(result.refusal);
        if (json) {
            write(JSON.stringify({ mode: 'mock', synthetic: true, ...result, exitCode: 0 }, null, 2));
        }
        else {
            write(renderEpochReplayResult(result));
            write('');
            write(`  SYNTHETIC (--mock): outcomes generated with seed ${parsed.seed ?? DEFAULT_MOCK_SEED} at a TRUE effect of ${parsed.effect ?? 0}. ` +
                'This exercises the protocol, it is NOT evidence about the learning loop.');
        }
        return 0;
    }
    // ── --emit: the generation work order (real mode, stage 1) ──
    if (mode === 'emit') {
        for (const key of ['judge', 'score', 'work-order', 'n', 'effect', 'tie-rate', 'slice']) {
            if (options.has(key))
                return fail(`--${key} is not valid with --emit`);
        }
        const root = resolve(cwd, options.get('project') ?? '.');
        const seed = num('seed');
        if (typeof seed === 'object' && seed !== null)
            return fail(seed.error);
        const limit = num('limit');
        if (typeof limit === 'object' && limit !== null)
            return fail(limit.error);
        // HIGH-B: the non-superiority margin is PRE-REGISTERED here, digest-covered, and read back by
        // --score. Out of range is refused, never clamped — `--margin 99` must not buy FALSIFIED.
        const emitMargin = num('margin');
        if (typeof emitMargin === 'object' && emitMargin !== null)
            return fail(emitMargin.error);
        if (typeof emitMargin === 'number' && !isValidMargin(emitMargin)) {
            return fail(`--margin ${emitMargin} must be in (0, 0.5] — refused, not clamped: an oversized margin buys FALSIFIED`);
        }
        const lessonText = new Map();
        for (const r of loadStoreRecords(root)) {
            if (typeof r.text === 'string' && r.text.trim() !== '')
                lessonText.set(r.id, r.text);
        }
        // The SAME reader `dz compounding` uses — readiness and the runner must see one corpus.
        const instances = replayableInstances(readRecallUsageEvents(root), lessonText);
        const order = buildWorkOrder(instances, {
            ...(typeof seed === 'number' ? { seed } : {}),
            ...(typeof limit === 'number' ? { limit } : {}),
            ...(typeof emitMargin === 'number' ? { margin: emitMargin } : {}),
        });
        const outPath = resolve(cwd, options.get('out') ?? join(root, EPOCH_REPLAY_DIR, 'work-order.json'));
        try {
            writeJsonOut(outPath, order);
        }
        catch (e) {
            return fail(`cannot write ${outPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (json) {
            write(JSON.stringify({ mode: 'emit', out: outPath, instances: order.items.length, seed: order.seed, margin: order.margin, digest: order.digest, corpusFingerprint: order.corpusFingerprint, emittedAt: order.emittedAt, exitCode: 0 }, null, 2));
        }
        else
            write(renderWorkOrderSummary(order, outPath));
        return 0;
    }
    // ── --judge: blind judge prompts from a FILLED work order (real mode, stage 2) ──
    if (mode === 'judge') {
        for (const key of ['score', 'work-order', 'n', 'effect', 'tie-rate', 'slice', 'limit', 'seed', 'margin']) {
            if (options.has(key))
                return fail(`--${key} is not valid with --judge`);
        }
        const inPath = resolve(cwd, options.get('judge'));
        const read = readJsonFile(inPath);
        if ('error' in read)
            return fail(read.error);
        const verified = asVerifiedWorkOrder(read.value);
        if ('problems' in verified) {
            return fail(`${inPath} is not a verifiable ${WORK_ORDER_KIND}: ${verified.problems.join('; ')} (emit one with \`dz epoch-replay --emit\`)`);
        }
        const result = buildJudgePrompts(verified.order);
        const outPath = resolve(cwd, options.get('out') ?? join(dirname(inPath), 'judge-prompts.json'));
        try {
            // The JUDGE-FACING artifact. Its whole content is {id, prompt} per item — no `warmIsA`, no
            // arm names, no path back to the work order, and NOT the `skipped` list (whose reasons name
            // arms). Anything else here hands the judge the answer key (Codex QE CRITICAL-1).
            writeJsonOut(outPath, {
                kind: 'dz-epoch-replay-judge-prompts',
                version: 1,
                prompts: result.prompts.map((p) => ({ id: p.id, prompt: p.prompt })),
            });
        }
        catch (e) {
            return fail(`cannot write ${outPath}: ${e instanceof Error ? e.message : String(e)}`);
        }
        // `skipped` is OPERATOR-facing only — stdout / --json, never the file.
        if (json)
            write(JSON.stringify({ mode: 'judge', out: outPath, prompts: result.prompts.length, skipped: result.skipped, exitCode: 0 }, null, 2));
        else
            write(renderJudgePromptsSummary(result, outPath));
        return 0;
    }
    // ── --score: un-blind + verdict (real mode, stage 3) ──
    for (const key of ['n', 'effect', 'tie-rate', 'limit', 'seed', 'out', 'project']) {
        if (options.has(key))
            return fail(`--${key} is not valid with --score`);
    }
    // HIGH-B: a margin chosen once the counts are visible is not a pre-registration — and `--margin 99`
    // at scoring time would simply buy FALSIFIED. Real mode reads it from the work order, full stop.
    if (options.has('margin')) {
        return fail('--margin is not valid with --score: the non-superiority margin is PRE-REGISTERED at --emit and stored in the work order (re-emit to change it)');
    }
    const orderPath = options.get('work-order');
    if (orderPath === undefined) {
        return fail('--score requires --work-order <file>: un-blinding must use the PRE-REGISTERED assignment, not a label in the judgments file');
    }
    const orderRead = readJsonFile(resolve(cwd, orderPath));
    if ('error' in orderRead)
        return fail(orderRead.error);
    const verifiedOrder = asVerifiedWorkOrder(orderRead.value);
    if ('problems' in verifiedOrder) {
        return fail(`${resolve(cwd, orderPath)} is not a verifiable ${WORK_ORDER_KIND} — refusing to un-blind against it: ${verifiedOrder.problems.join('; ')}`);
    }
    const order = verifiedOrder.order;
    const judgePath = resolve(cwd, options.get('score'));
    const judgeRead = readJsonFile(judgePath);
    if ('error' in judgeRead)
        return fail(judgeRead.error);
    const rawRows = Array.isArray(judgeRead.value)
        ? judgeRead.value
        : typeof judgeRead.value === 'object' && judgeRead.value !== null && Array.isArray(judgeRead.value.judgments)
            ? judgeRead.value.judgments
            : null;
    if (rawRows === null)
        return fail(`${judgePath} must be an array of {id, winner} rows (or {"judgments": [...]})`);
    const unblind = unblindJudgments(order, rawRows.map((r) => {
        const o = (typeof r === 'object' && r !== null ? r : {});
        return { id: typeof o.id === 'string' ? o.id : '', winner: typeof o.winner === 'string' ? o.winner : '' };
    }));
    // A duplicated judgement id is corrupt input, not a skippable row — refuse loudly.
    if (!unblind.ok)
        return fail(unblind.error ?? 'judgments refused');
    const { outcomes, skipped } = unblind;
    const result = scoreEpochReplay(outcomes, {
        slice: options.get('slice') ?? 'all',
        margin: order.margin, // PRE-REGISTERED in the work order, verified by the digest
    });
    if (result.refusal !== null)
        return fail(result.refusal);
    if (json) {
        write(JSON.stringify({
            mode: 'score',
            workOrder: resolve(cwd, orderPath),
            judgments: judgePath,
            scored: outcomes.length,
            skipped,
            provenance: { seed: order.seed, margin: order.margin, emittedAt: order.emittedAt, digest: order.digest, corpusFingerprint: order.corpusFingerprint, digestScope: DIGEST_HONEST_SCOPE },
            ...result,
            exitCode: 0,
        }, null, 2));
    }
    else {
        write(renderEpochReplayResult(result));
        if (skipped.length > 0) {
            write('');
            write(`  ${skipped.length} judgment(s) SKIPPED (never guessed):`);
            for (const s of skipped)
                write(`    · ${s.id}: ${s.reason}`);
        }
        // Provenance, so a reviewer can ask for the original emitted file and compare.
        write('');
        write(`  WORK ORDER: seed ${order.seed} · margin ${order.margin} (pre-registered) · emitted ${order.emittedAt}`);
        write(`    digest ${order.digest}`);
        write(`    corpus ${order.corpusFingerprint}`);
        write(`    ${DIGEST_HONEST_SCOPE}`);
    }
    return 0;
}
/**
 * Env vars an INHERITED Claude session leaks into a child. Left in place, the probe can silently
 * read the parent's project instead of the target — the exact confound that made a hand-rolled
 * 2026-07-23 probe untrustworthy until controls were added (feature skills-verify, ADR-001).
 */
const PROBE_SCRUB_ENV = [
    'CLAUDE_CODE_CHILD_SESSION',
    'CLAUDE_CODE_SESSION_ID',
    'CLAUDECODE',
    'CLAUDE_CODE_ENTRYPOINT',
    'CLAUDE_CODE_EXECPATH',
    'CLAUDE_PLUGIN_DATA',
    'AI_AGENT',
];
/**
 * Start a real Claude session in `projectDir` and capture its stream until the `system/init` event
 * lands, then kill it — the model never answers, so the probe costs ~no tokens. Never throws:
 * every failure becomes an `error` string, which the pure classifier turns into `inconclusive`.
 */
function probeInitStream(projectDir, timeoutMs, pluginDir = null) {
    return new Promise((resolveProbe) => {
        const env = { ...process.env };
        for (const key of PROBE_SCRUB_ENV)
            delete env[key];
        env.CLAUDE_PROJECT_DIR = projectDir;
        let out = '';
        let err = '';
        let settled = false;
        let child;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            try {
                child?.kill('SIGTERM');
            }
            catch {
                /* the child may already be gone */
            }
            resolveProbe({ stream: out, error });
        };
        const timer = setTimeout(() => finish(`no init event within ${Math.round(timeoutMs / 1000)}s (is \`claude\` logged in?)`), timeoutMs);
        try {
            // NOT `--bare`: that mode skips plugin credentials and fails with "Not logged in".
            const args = ['-p', 'ok', '--output-format', 'stream-json', '--verbose'];
            // Session-scoped plugin load — the marketplace-free vehicle (ADR-003 D-3). Without this the
            // probe reads a session in which the plugin was never loaded, and reports its commands
            // missing for a reason that has nothing to do with the package under test.
            if (pluginDir !== null)
                args.push('--plugin-dir', pluginDir);
            child = spawn('claude', args, {
                cwd: projectDir,
                env,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        }
        catch (error) {
            finish(`cannot run \`claude\`: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        child.stdout?.on('data', (chunk) => {
            out += chunk.toString();
            // Reuse the pure parser so a partially-flushed line simply waits for more data.
            if (parseInitFacts(out))
                finish(null);
        });
        child.stderr?.on('data', (chunk) => {
            err += chunk.toString();
        });
        child.on('error', (error) => finish(`cannot run \`claude\`: ${error.message}`));
        child.on('close', (code) => {
            if (parseInitFacts(out))
                finish(null);
            else
                finish(err.trim() || `\`claude\` exited ${code} without an init event`);
        });
    });
}
/** Run a full `claude -p` turn and return its text. Unlike the init probe this NEEDS the answer. */
function probeContent(projectDir, prompt, timeoutMs) {
    return new Promise((resolveProbe) => {
        const env = { ...process.env };
        for (const key of PROBE_SCRUB_ENV)
            delete env[key];
        env.CLAUDE_PROJECT_DIR = projectDir;
        let out = '';
        let err = '';
        let settled = false;
        let child;
        const finish = (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            try {
                child?.kill('SIGTERM');
            }
            catch {
                /* already gone */
            }
            resolveProbe({ text: out, error });
        };
        const timer = setTimeout(() => finish(`content probe timed out after ${Math.round(timeoutMs / 1000)}s`), timeoutMs);
        try {
            child = spawn('claude', ['-p', prompt, '--output-format', 'text'], { cwd: projectDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
        }
        catch (error) {
            finish(`cannot run \`claude\`: ${error instanceof Error ? error.message : String(error)}`);
            return;
        }
        child.stdout?.on('data', (c) => { out += c.toString(); });
        child.stderr?.on('data', (c) => { err += c.toString(); });
        child.on('error', (error) => finish(`cannot run \`claude\`: ${error.message}`));
        child.on('close', () => finish(out.trim() === '' ? err.trim() || 'the content probe produced no output' : null));
    });
}
/**
 * `dz skills-verify` — does this project's `.claude/skills/` actually REGISTER? (feature
 * skills-verify, ADR-001.) L1 static scan is instant and CI-safe; the live layer reads the
 * authoritative `system/init` listing. Fail-closed: unobservable ⇒ inconclusive, never pass.
 */
async function cmdSkillsVerify(options, flags, cwd, write) {
    const json = flags.has('json');
    if (flags.has('help')) {
        write('dz skills-verify [--dir <project>] [--expect a,b] [--expect-commands a,b] [--plugin-dir <dir>] [--static] [--strict] [--timeout <s>] [--json]');
        write('  Verifies that a project\'s .claude/skills/ actually register in Claude Code.');
        write('  --plugin-dir <dir>  load a plugin into the probe session (session-scoped, no marketplace);');
        write('                      with no --expect-commands, the expectation defaults to the manifest\'s own commands[]');
        write('  --expect-commands   slash commands that MUST appear in the session listing, e.g. loop-designer:init');
        write('  --static  layout scan only (no Claude session, CI-safe): flags dirs that can never register');
        write('  --live-content  ADVISORY extra turn: ask a live model to name the skills and quote one, proving');
        write('                  the CONTENT is usable — registration is not usability. Never changes the exit code.');
        write('  default   also starts a real session and reads the authoritative system/init listing');
        write('  exit: 0 pass · 1 fail · 2 inconclusive (--strict makes inconclusive exit 1)');
        return 0;
    }
    const allowedFlags = new Set(['json', 'help', 'static', 'strict', 'live-content']);
    const allowedOptions = new Set(['dir', 'expect', 'expect-commands', 'plugin-dir', 'timeout']);
    const usage = '  allowed: --dir <project>, --expect a,b, --expect-commands a,b, --plugin-dir <dir>, --timeout <s>, --static, --strict, --live-content, --json';
    if (options.has('_positional_0')) {
        const message = `unexpected argument "${options.get('_positional_0')}"`;
        write(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz skills-verify: ${message}\n${usage}`);
        return 1;
    }
    for (const flag of flags) {
        if (!allowedFlags.has(flag)) {
            write(json ? JSON.stringify({ error: `unknown option --${flag}`, exitCode: 1 }) : `dz skills-verify: unknown option --${flag}\n${usage}`);
            return 1;
        }
    }
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            continue;
        if (!allowedOptions.has(key)) {
            write(json ? JSON.stringify({ error: `unknown option --${key}`, exitCode: 1 }) : `dz skills-verify: unknown option --${key}\n${usage}`);
            return 1;
        }
    }
    const projectDir = resolve(cwd, options.get('dir') ?? '.');
    const scan = scanSkillsLayout(projectDir);
    const expected = options.has('expect')
        ? (options.get('expect') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : scan.registrable;
    // A plugin loaded with `--plugin-dir` is session-scoped, so its surface is NOT on the project's
    // disk and `scan.registrable` cannot describe it. The manifest can — and defaulting to the
    // manifest's own `commands[]` keeps the gate honest without a hand-typed list that silently
    // drifts from the manifest it is supposed to be checking. An UNREADABLE manifest is refused
    // rather than defaulted to an empty expectation: an empty expectation passes without checking.
    const pluginDir = options.has('plugin-dir') ? resolve(cwd, options.get('plugin-dir') ?? '') : null;
    let expectedCommands = options.has('expect-commands')
        ? (options.get('expect-commands') ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    if (pluginDir !== null && !options.has('expect-commands')) {
        const surface = declaredPluginSurface(pluginDir);
        if (surface === null) {
            const message = `cannot read ${join(pluginDir, '.claude-plugin', 'plugin.json')} (or it declares no name) — pass --expect-commands explicitly`;
            write(json ? JSON.stringify({ error: message, exitCode: 1 }) : `dz skills-verify: ${message}`);
            return 1;
        }
        expectedCommands = surface.commands;
    }
    // ── L1 only: deterministic, no session, safe for CI ──
    if (flags.has('static')) {
        const exitCode = scan.findings.length > 0 ? 1 : 0;
        if (json) {
            write(JSON.stringify({ mode: 'static', ...scan, expected, exitCode }, null, 2));
        }
        else {
            write(`dz skills-verify (static): ${scan.registrable.length} registrable skill dir(s) under ${scan.skillsRoot}`);
            if (!scan.exists)
                write('  no .claude/skills/ directory here');
            for (const f of scan.findings)
                write(`  [${f.kind}] ${f.detail}`);
            write(scan.findings.length ? `  ${scan.findings.length} layout problem(s) — these can never register` : '  no layout problems found');
            // Advisories were collected but never PRINTED in static mode: a `.claude-plugin/plugin.json`
            // under `.claude/skills` produced "no layout problems found" and nothing else, so the one
            // shape most likely to be a silent non-registration was invisible in exactly the mode CI and
            // humans run most. Reported, still never fatal (that distinction is the whole point).
            for (const a of scan.advisories)
                write(`  [${a.kind}] ADVISORY: ${a.detail}`);
            write('  (static is a PROXY — run without --static to read the real registration listing)');
        }
        return exitCode;
    }
    // ── L2: the authoritative listing ──
    const timeoutSec = Number(options.get('timeout') ?? '180');
    const timeoutMs = Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec * 1000 : 180_000;
    if (!json)
        write(`dz skills-verify: starting a session in ${projectDir} to read the real registration listing…`);
    const { stream, error } = await probeInitStream(projectDir, timeoutMs, pluginDir);
    // `init.skills` carries names, not provenance: a USER-level skill of the same name would satisfy
    // the expectation while the project's own copy stays broken. Collect the collisions so the
    // classifier can refuse to attribute registration to this project (Codex QE #2).
    const userSkillsDir = join(homedir(), '.claude', 'skills');
    const ambiguous = expected.filter((name) => existsSync(join(userSkillsDir, name, 'SKILL.md')));
    // realpath so a symlinked project still matches its canonical cwd (Codex QE #6).
    const canonical = (p) => {
        try {
            return realpathSync(p);
        }
        catch {
            return resolve(p);
        }
    };
    const result = verifyRegistration({
        projectDir,
        scan,
        probe: error === null ? { ok: true, stream } : { ok: false, error },
        // The provenance check RAN (that is what `checked: true` asserts) — see `ambiguous` above.
        provenance: { checked: true, ambiguous },
        ...(options.has('expect') ? { expected } : {}),
        ...(expectedCommands.length > 0 ? { expectedCommands } : {}),
    }, { resolvePath: canonical });
    const exitCode = registrationExitCode(result.verdict, flags.has('strict'));
    // ADVISORY layer: registration is not usability. Costs a real model turn, so it is opt-in, and it
    // can never change the exit code — a model-mediated signal must not gate anything.
    let content = null;
    if (flags.has('live-content') && result.verdict === 'pass' && expected.length > 0) {
        const probe = await probeContent(projectDir, buildContentProbePrompt(expected), timeoutMs);
        content = classifyContentProbe(probe.error === null ? probe.text : '', expected.slice(0, 6));
    }
    if (json)
        write(JSON.stringify({ mode: 'live', ...result, ...(content ? { contentProbe: content } : {}), skillsRoot: scan.skillsRoot, exitCode }, null, 2));
    else {
        write(renderRegistrationReport(result, scan));
        if (content)
            write(renderContentProbe(content));
    }
    return exitCode;
}
function cmdDeliveryCheck(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || cwd;
    }
    catch { /* not git */ }
    const json = flags.has('json');
    const errOut = (error) => {
        if (json)
            write(JSON.stringify({ error, planesChecked: [], planesSkipped: [], findings: [], handoff: null, artifact: 'not-written' }, null, 2));
        else {
            write(`dz delivery-check: ${error}`);
            write('  allowed: --slug <slug>, --findings <f.json>, --author <model>, --context-only, --strict, --json');
        }
        return 1;
    };
    // Strict allowlist (delivery finding: a typo'd --findings silently downgraded the --strict CI
    // gate to a vacuous exit-0 pass — a mistyped option must be an ERROR, never a mode change).
    const allowedFlags = new Set(['context-only', 'strict', 'json', 'help']);
    const allowedOptions = new Set(['slug', 'findings', 'author']);
    for (const flag of flags)
        if (!allowedFlags.has(flag))
            return errOut(`unknown option --${flag}`);
    for (const key of options.keys()) {
        if (key.startsWith('_positional_'))
            return errOut(`unexpected argument "${options.get(key)}"`);
        if (!allowedOptions.has(key))
            return errOut(`unknown option --${key}`);
    }
    const slug = options.get('slug');
    if (slug === undefined || slug.trim() === '')
        return errOut('pass --slug <slug> (the feature under features/<slug>)');
    // Slug convention is a SECURITY boundary here (delivery finding, CONFIRMED traversal reproducer:
    // --slug '../../outside/evil' wrote 10_delivery_review.md outside the repo). kebab-case Latin,
    // <=40 chars — the repo's own slug rule as a layer-1 three-line check.
    const slugTrimmed = slug.trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slugTrimmed) || slugTrimmed.length > 40) {
        return errOut(`invalid --slug "${slugTrimmed}" — kebab-case Latin, max 40 chars (a path-like slug would redirect the report write)`);
    }
    const featureDir = join(repoRoot, 'features', slugTrimmed);
    // --context-only is a real mode flag, not decoration: combining it with --findings contradicts
    // itself (delivery finding — the flag was accepted and silently ignored).
    if (flags.has('context-only') && options.get('findings') !== undefined) {
        return errOut('--context-only and --findings are mutually exclusive (context-only prints the brief; findings classifies the verdict)');
    }
    // git status --porcelain — CLI layer only (the `no child_process in core` contract); a non-git target
    // degrades to an empty list, which is honest (AM-10: changed-files is informational, never a required gate).
    let changedFiles = [];
    try {
        const out = execSync('git status --porcelain', { cwd: repoRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
        changedFiles = out.split('\n').map((l) => l.slice(3).trim()).filter((s) => s.length > 0);
    }
    catch { /* non-git / unavailable → empty (honest) */ }
    const facts = collectDeliveryFacts(featureDir, { changedFiles, repoRoot });
    const plan = planDeliveryCheck(facts);
    const author = options.get('author');
    const findingsPath = options.get('findings');
    if (findingsPath === undefined) {
        // Default / --context-only: emit the led protocol (probes + brief). No verdict — the CLI has no model.
        if (json) {
            write(JSON.stringify({
                planesChecked: [],
                planesSkipped: plan.planes.map((p) => p.id),
                findings: [],
                handoff: null,
                artifact: 'not-written',
                probes: plan.probes,
            }, null, 2));
            return 0;
        }
        write(`dz delivery-check — ${slug} (portable 4-plane hand-off protocol; you drive the review)`);
        for (const p of plan.probes) {
            const mark = p.passed === true ? '✓' : p.passed === false ? '✗' : '○';
            write(`  ${mark} ${p.description}${p.required ? ' [required]' : ' [informational]'}`);
        }
        write('');
        write(renderDeliveryBrief(plan, facts));
        // The hand-off criterion the verdict will be judged by, shown UP FRONT (this also makes
        // plan.criterionTemplate a consumed surface, not dead product code — delivery finding).
        write('\n── hand-off criterion (all must PASS for ready) ──');
        for (const c of plan.criterionTemplate)
            write(`  ○ ${c.label}`);
        if (author !== undefined && author.trim() !== '')
            write(`\n── reviewer to dispatch ──\n${author.trim()}`);
        write('\n(next: run the four planes, then `dz delivery-check --slug ' + slug + ' --findings findings.json` for the verdict)');
        return 0;
    }
    // --findings mode: parse (malformed/missing ⇒ [], a failed-plane input — fail-closed, never a throw).
    let reviewResults = [];
    try {
        const parsed = JSON.parse(readFileSync(resolve(cwd, findingsPath), 'utf-8'));
        if (Array.isArray(parsed))
            reviewResults = parsed;
        else if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.planes))
            reviewResults = parsed.planes;
        else
            reviewResults = [];
    }
    catch {
        reviewResults = [];
    }
    const verdict = classifyDelivery(plan, reviewResults);
    // The SAME predicate as the fail-closed verdict (core-exported) — a local copy was a drift channel.
    const planesChecked = plan.planes.filter((_, i) => isUsablePlaneResult(reviewResults[i])).map((p) => p.id);
    const planesSkipped = plan.planes.filter((_, i) => !isUsablePlaneResult(reviewResults[i])).map((p) => p.id);
    // Write the regenerable report (NOT augment-never-clobber — deliberately overwritten each run).
    let artifact = 'not-written';
    try {
        const reviewPath = join(featureDir, '10_delivery_review.md');
        mkdirSync(dirname(reviewPath), { recursive: true });
        writeFileSync(reviewPath, renderDeliveryReview(verdict, facts));
        artifact = 'written';
    }
    catch { /* best-effort — the verdict is still returned */ }
    if (json) {
        write(JSON.stringify({ planesChecked, planesSkipped, findings: verdict.findings, handoff: verdict.handoff, artifact }, null, 2));
    }
    else {
        write(`dz delivery-check — ${slug}: ${verdict.handoff}`);
        for (const c of verdict.criterion) {
            const mark = c.status === 'PASS' ? '✓' : c.status === 'FAIL' ? '✗' : '○';
            write(`  ${mark} ${c.label}: ${c.status}${c.detail ? ` — ${c.detail}` : ''}`);
        }
        write(artifact === 'written' ? `\n↳ wrote features/${slug}/10_delivery_review.md` : '\n↳ 10_delivery_review.md NOT written (verdict above is authoritative)');
    }
    if (flags.has('strict') && verdict.handoff === 'blocked')
        return 1;
    return 0;
}
/* ------------------------------------------------------------------ */
/*  backlog — the Smart Backlog idea pipeline (feature smart-backlog)   */
/* ------------------------------------------------------------------ */
/** Thin dispatcher — ALL logic lives in harness-core/src/backlog.ts (05 architecture: handlers stay dumb). */
async function cmdBacklog(options, flags, cwd, write) {
    const projectRoot = resolve(cwd, options.get('project') ?? '.');
    const json = flags.has('json');
    const sub = options.get('_positional_0');
    const cfg = readBacklogConfig(projectRoot);
    const emitErr = (msg) => {
        write(json ? JSON.stringify({ error: msg, exitCode: 1 }) : `dz backlog: ${msg}`);
        return 1;
    };
    if (sub === 'add') {
        const text = (options.get('_positional_1') ?? '').trim();
        if (text === '')
            return emitErr('an idea text is required: dz backlog add "<idea>"');
        // The clamp is ECHOED, never silent (idea 86096d6d): `--effort 13` used to store 5 and say nothing.
        const eff = parseEffort(options.get('effort'), cfg.roulette.defaultEffort);
        if (eff.adjusted && !json && eff.note !== undefined)
            write(`dz backlog: ${eff.note}`);
        const dryRun = flags.has('dry-run');
        // Embed-form migration (register-inflation fix): v1 vectors are FULL-TEXT embeds, v2 queries are
        // bounded excerpts — comparing across the forms is a query-vs-row space split. Re-mirror once
        // (idempotent upsert), before the dedup search. Dry-run writes nothing, so it only WARNS.
        if (dryRun) {
            if (readBacklogEmbedFormVersion(projectRoot) < DEDUP_EMBED_FORM_VERSION && readIdeas(projectRoot).length > 0 && !json) {
                write(`dz backlog: ⚠ idea vectors are in the old (full-text) embed form — dedup may be unreliable until a non-dry add or \`dz backlog harmonize\` migrates them`);
            }
        }
        else {
            const form = await ensureBacklogEmbedForm(projectRoot);
            if (form.action === 'migrated' && !json) {
                write(`dz backlog: re-embedded ${form.remirrored} idea vector(s) into the bounded dedup embed form (v${form.version})`);
            }
            else if (form.action === 'deferred' && !json) {
                write(`dz backlog: ⚠ embed-form migration deferred (${form.error ?? 'unknown error'}) — semantic dedup may compare against stale full-text vectors`);
            }
        }
        const verdict = await dedupIdea(projectRoot, text, cfg);
        // The TOP-MATCH pair (id @ cosine) is the ADR-002 calibration surface (idea ce914ac2) — observational
        // only: the band itself is unchanged, but a RELATED verdict now shows WHICH idea produced the cosine.
        // A negative cosine is a VALID observation (anti-correlated embedding) — only non-finite is absent
        // (Codex re-QE LOW: `>= 0` suppressed a legitimate negative top match).
        const topMatch = verdict.topMatchId !== undefined && Number.isFinite(verdict.cosine)
            ? { id: verdict.topMatchId, cosine: verdict.cosine }
            : undefined;
        if (verdict.action === 'duplicate') {
            // DUPLICATE ⇒ snapshot + reinforce the existing root; NO new record (ADR-002 T-002b).
            const ideas = readIdeas(projectRoot);
            const match = ideas.find((i) => i.id === verdict.matchedId);
            let absorbErr;
            if (!dryRun && match !== undefined) {
                const snap = snapshotIdeas(projectRoot, join(projectRoot, '.dz', 'backlog', `ideas.pre-merge-${Date.now()}.jsonl`));
                if (snap.error !== undefined)
                    return emitErr(snap.error);
                // The absorbed TEXT is preserved (absorbed.jsonl) — a duplicate verdict must never destroy
                // user text: two documented false absorptions (2026-08-05, 2026-08-11) were unrecoverable.
                absorbErr = recordAbsorption(projectRoot, {
                    ts: new Date().toISOString(),
                    matchedId: match.id,
                    cosine: verdict.cosine,
                    ...(verdict.containment !== undefined ? { containment: verdict.containment } : {}),
                    ...(verdict.subsetMatch === true ? { subsetMatch: true } : {}),
                    text,
                }).error;
                match.uses += 1;
                writeIdeas(projectRoot, ideas);
            }
            if (json)
                write(JSON.stringify({ action: 'duplicate', matchedId: verdict.matchedId, cosine: verdict.cosine, ...(verdict.containment !== undefined ? { containment: verdict.containment } : {}), ...(verdict.subsetMatch === true ? { subsetMatch: true } : {}), ...(topMatch !== undefined ? { topMatch } : {}), ...(eff.note !== undefined ? { effortNote: eff.note } : {}), ...(dryRun ? {} : { absorbedLogged: absorbErr === undefined, ...(absorbErr !== undefined ? { absorbedLogError: absorbErr } : {}) }), exitCode: 0 }, null, 2));
            else {
                const via = verdict.subsetMatch === true
                    ? `subset match: containment ${(verdict.containment ?? 0).toFixed(3)} ≥ ${cfg.dedup.subsetContainment}, cosine ${verdict.cosine.toFixed(3)}`
                    : `cosine ${verdict.cosine.toFixed(3)}${verdict.exactTextOnly ? ', exact-text' : ''}`;
                write(`dz backlog: DUPLICATE of ${verdict.matchedId} (${via}) — reinforced, no new record`);
                if (topMatch !== undefined)
                    write(`  top match ${topMatch.id} @ cosine ${topMatch.cosine.toFixed(3)} (DUPLICATE band ≥ ${cfg.dedup.duplicateThreshold})`);
                if (!dryRun) {
                    write(absorbErr === undefined
                        ? '  absorbed text kept in .dz/backlog/absorbed.jsonl (re-add it from there if this verdict was wrong)'
                        : `  ⚠ could NOT log the absorbed text (${absorbErr}) — if this verdict is wrong, the wording above is the only copy`);
                }
            }
            return 0;
        }
        const goalMap = readGoalMap(projectRoot);
        const align = await alignIdea(projectRoot, text, goalMap);
        const createdTs = new Date().toISOString();
        const rec = {
            id: ideaId(text, createdTs),
            text,
            status: 'new',
            createdTs,
            effort: eff.effort,
            goalId: align.goalId,
            goalAlignment: align.goalAlignment,
            relatedIds: [...verdict.relatedIds],
            uses: 0,
            tags: [],
        };
        const proposal = options.get('proposal');
        if (proposal !== undefined)
            rec.proposal = proposal; // agent prose ONLY — the CLI never fabricates it
        // A demotion (≥-threshold cosine that failed lexical corroboration) is NEVER silent — it is the
        // register-only false-duplicate surface (the 2026-08-05 zombie x publish-gate absorption).
        const demotedLine = verdict.demoted !== undefined
            ? `  near-duplicate demoted: ${verdict.demoted.id} @ cosine ${verdict.demoted.cosine.toFixed(3)} cleared the band but shares no subject vocabulary (containment ${verdict.demoted.containment.toFixed(3)} < ${cfg.dedup.corroborationFloor}) — kept as related`
            : undefined;
        if (dryRun) {
            if (json)
                write(JSON.stringify({ action: verdict.action, dryRun: true, idea: rec, ...(verdict.demoted !== undefined ? { demoted: verdict.demoted } : {}), ...(topMatch !== undefined ? { topMatch } : {}), ...(eff.note !== undefined ? { effortNote: eff.note } : {}), exitCode: 0 }, null, 2));
            else {
                write(`dz backlog (dry-run): ${verdict.action.toUpperCase()} — would create ${rec.id}; align ${rec.goalAlignment.toFixed(3)}${rec.goalId !== null ? ` → ${rec.goalId}` : ''}`);
                // The calibration surface belongs on the dry-run too (QE LOW-8) — a dry-run is exactly where a
                // user checks whether a near-duplicate should have crossed the band.
                if (topMatch !== undefined)
                    write(`  top match ${topMatch.id} @ cosine ${topMatch.cosine.toFixed(3)} (DUPLICATE band ≥ ${cfg.dedup.duplicateThreshold})`);
                if (demotedLine !== undefined)
                    write(demotedLine);
            }
            return 0;
        }
        // Privacy scaffold (idea ec4cd60d): the store we are about to create holds raw prompt-class ideas —
        // ensure `.dz/backlog/` is gitignored BEFORE the first write. No-op once covered.
        const ignore = ensureBacklogGitignored(projectRoot);
        const ideas = readIdeas(projectRoot);
        ideas.push(rec);
        writeIdeas(projectRoot, ideas);
        const mirror = await mirrorIdeaVector(projectRoot, rec); // best-effort — never blocks capture
        if (json)
            write(JSON.stringify({ action: verdict.action, idea: rec, related: verdict.relatedIds, ...(verdict.demoted !== undefined ? { demoted: verdict.demoted } : {}), ...(topMatch !== undefined ? { topMatch } : {}), ...(eff.note !== undefined ? { effortNote: eff.note } : {}), gitignore: ignore, exitCode: 0 }, null, 2));
        else {
            write(`dz backlog: ${verdict.action.toUpperCase()} — captured ${rec.id}`);
            if (verdict.action === 'related' && topMatch !== undefined) {
                write(`  top match ${topMatch.id} @ cosine ${topMatch.cosine.toFixed(3)} (DUPLICATE band ≥ ${cfg.dedup.duplicateThreshold})`);
            }
            if (demotedLine !== undefined)
                write(demotedLine);
            if (rec.goalId !== null)
                write(`  top goal: ${rec.goalId} (alignment ${rec.goalAlignment.toFixed(3)})`);
            if (verdict.relatedIds.length > 0)
                write(`  related: ${verdict.relatedIds.join(', ')}`);
            if (ignore.action === 'created' || ignore.action === 'appended') {
                write(`  privacy: ${ignore.action} \`.dz/backlog/\` in ${ignore.path} (ideas are private prompt-class content)`);
            }
            else if (ignore.action === 'skipped') {
                // A privacy scaffold that FAILED must never be silent (QE MED-5): the store now holds raw ideas
                // that git can see, and only the user can fix it.
                write(`  ⚠ privacy: could NOT gitignore \`.dz/backlog/\` (${ignore.reason ?? 'unknown error'}) — your ideas are visible to git; add \`.dz/backlog/\` to ${ignore.path} yourself`);
            }
            else if (ignore.action === 'user-opted-out') {
                write('  privacy: `.dz/backlog/` is explicitly un-ignored (a `!` negation in .gitignore) — respecting that; ideas WILL be tracked by git');
            }
            write('  proposal: (write your own — dz backlog add --proposal "<text>"; the CLI never fabricates it)');
            if (mirror.error !== undefined)
                write(`  ↳ vector mirror deferred: ${mirror.error}`);
        }
        return 0;
    }
    if (sub === 'list') {
        let ideas = readIdeas(projectRoot);
        const status = options.get('status');
        const goal = options.get('goal');
        if (status !== undefined)
            ideas = ideas.filter((i) => i.status === status);
        if (goal !== undefined)
            ideas = ideas.filter((i) => i.goalId === goal);
        if (json) {
            write(JSON.stringify({ ideas, exitCode: 0 }, null, 2));
            return 0;
        }
        if (ideas.length === 0) {
            write('dz backlog: no ideas' + (status !== undefined || goal !== undefined ? ' match the filter' : ' yet — dz backlog add "<idea>"'));
            return 0;
        }
        write(`dz backlog — ${ideas.length} idea(s)`);
        for (const i of ideas)
            write(`  ${i.id}  [${i.status}] e${i.effort} align ${i.goalAlignment.toFixed(2)}${i.goalId !== null ? ` (${i.goalId})` : ''}  ${i.text.slice(0, 70)}`);
        return 0;
    }
    if (sub === 'show') {
        const id = options.get('_positional_1');
        if (id === undefined)
            return emitErr('an idea id is required: dz backlog show <id>');
        const rec = readIdeas(projectRoot).find((i) => i.id === id);
        if (rec === undefined)
            return emitErr(`no idea ${id}`);
        write(json ? JSON.stringify({ idea: rec, exitCode: 0 }, null, 2) : JSON.stringify(rec, null, 2));
        return 0;
    }
    if (sub === 'goals') {
        if (flags.has('validate')) {
            // A vacuous "valid (0 goal(s))" HID the user's mistake (idea 960c9f26): the defensive reader silently
            // dropped every malformed entry (e.g. `text` where `statement` belongs). Validate reads the DETAILED
            // view, warns per dropped entry, and refuses to call a fully-dropped compass valid.
            const detail = readGoalMapDetailed(projectRoot);
            const goalMap = detail.goalMap;
            const problems = [];
            const warnings = [];
            if (detail.parseError !== undefined)
                problems.push(detail.parseError);
            for (const d of detail.dropped)
                warnings.push(`goal[${d.index}]: ${d.reason} — dropped`);
            // The reader CLAMPS a bad weight before any validation could see it, so validating the clamped
            // value can only ever pass (QE MED-7 — the branch below was dead code). Warn from the RAW value
            // the user wrote, and say which value the runtime is actually using.
            for (const r of detail.repaired)
                warnings.push(`goal[${r.index}] (${r.id}): ${r.reason} — using ${r.used}`);
            const seen = new Set();
            for (const g of goalMap.goals) {
                if (seen.has(g.id))
                    problems.push(`duplicate goal id: ${g.id}`);
                seen.add(g.id);
                if (g.statement.trim() === '')
                    problems.push(`goal ${g.id} has an empty statement`);
                // Defence in depth: the reader guarantees the clamp, so this can only fire if that ever regresses.
                if (!(g.weight > 0 && g.weight <= 1))
                    problems.push(`goal ${g.id} weight ${g.weight} is out of (0,1]`);
            }
            // A compass whose entries were ALL dropped is a user error, not an empty compass.
            const allDropped = detail.present > 0 && goalMap.goals.length === 0;
            if (allDropped)
                problems.push(`all ${detail.present} goal entr${detail.present === 1 ? 'y was' : 'ies were'} dropped as malformed — the compass is EMPTY, not valid`);
            const valid = problems.length === 0;
            if (json) {
                write(JSON.stringify({ valid, problems, warnings, dropped: detail.dropped, repaired: detail.repaired, goals: goalMap.goals.length, present: detail.present, exitCode: valid ? 0 : 1 }, null, 2));
            }
            else {
                for (const w of warnings)
                    write(`dz backlog goals: WARNING ${w}`);
                if (valid)
                    write(`dz backlog goals: valid (${goalMap.goals.length} goal(s)${detail.dropped.length > 0 ? `, ${detail.dropped.length} dropped` : ''})`);
                else {
                    write('dz backlog goals: INVALID');
                    for (const p of problems)
                        write(`  - ${p}`);
                }
            }
            return valid ? 0 : 1;
        }
        const goalMap = readGoalMap(projectRoot);
        if (json) {
            write(JSON.stringify({ goals: goalMap.goals, exitCode: 0 }, null, 2));
            return 0;
        }
        if (goalMap.goals.length === 0) {
            write('dz backlog goals: no compass — create .dz/backlog/goals.json ({ "version":1, "goals":[{ "id","statement","weight","keywords" }] })');
            return 0;
        }
        write(`dz backlog — ${goalMap.goals.length} goal(s)`);
        for (const g of goalMap.goals)
            write(`  ${g.id} (w=${g.weight}): ${g.statement}`);
        return 0;
    }
    if (sub === 'roulette') {
        const ideas = readIdeas(projectRoot);
        const pool = eligibleIdeas(ideas);
        // ── Commit-argument validation runs BEFORE any early return (QE HIGH-2): an empty eligible pool
        // used to return 0 first, so `--commit <garbage>` reported success having validated nothing. A
        // mutation request is answered on its own merits, whatever the pool looks like.
        // parseArgs turns `--commit <id>` into an OPTION and a bare `--commit` into a FLAG. A trailing
        // positional id is only a commit target when --commit was actually passed (QE HIGH-1): a bare
        // `dz backlog roulette <id>` must never mutate.
        const positionalId = options.get('_positional_1');
        const commitOpt = options.get('commit');
        const wantsCommit = flags.has('commit') || commitOpt !== undefined;
        if (!wantsCommit && positionalId !== undefined) {
            return emitErr(`an idea id alone does not start it — a spin never mutates. Use: dz backlog roulette --commit ${positionalId}`);
        }
        const commitId = wantsCommit ? commitOpt ?? positionalId : undefined;
        if (wantsCommit && commitId !== undefined) {
            if (!isSafeId(commitId))
                return emitErr(`refusing an unsafe idea id: ${JSON.stringify(commitId)}`);
            const target = ideas.find((i) => i.id === commitId);
            if (target === undefined)
                return emitErr(`no idea ${commitId} — run dz backlog list to see the ids`);
            // TERMINAL ideas must not be silently resurrected (Codex re-QE). in-progress is allowed —
            // re-committing it is an idempotent no-op, not a resurrection.
            if (target.status === 'shipped' || target.status === 'dropped') {
                return emitErr(`idea ${commitId} is ${target.status} — a terminal idea cannot be (re)started`);
            }
        }
        // `--pick N` is a read-only ranking view; combining it with a mutation request is ambiguous and was
        // silently ignoring the commit (Codex re-QE) — refuse the combination explicitly.
        if (wantsCommit && options.get('pick') !== undefined) {
            return emitErr('--pick cannot be combined with --commit — commit a single explicit id without --pick');
        }
        if (pool.length === 0 && commitId === undefined) {
            // A bare `--commit` with nothing to spin cannot name a pick to paste, so it says exactly that.
            if (wantsCommit)
                return emitErr('roulette --commit requires an idea id, and there is no eligible idea to suggest one — run dz backlog list');
            write(json ? JSON.stringify({ pick: null, eligible: 0, exitCode: 0 }) : 'dz backlog roulette: no eligible ideas (status new/enriched)');
            return 0;
        }
        const now = Date.now();
        const pickN = options.get('pick');
        if (pickN !== undefined) {
            const n = Math.max(1, Math.floor(Number(pickN)) || 1);
            const ranked = rankRoulette(ideas, cfg.roulette, now).slice(0, n);
            if (json)
                write(JSON.stringify({ ranked, exitCode: 0 }, null, 2));
            else {
                write(`dz backlog roulette — top ${ranked.length} by weight`);
                for (const i of ranked)
                    write(`  ${i.id}  align ${i.goalAlignment.toFixed(2)} e${i.effort}  ${i.text.slice(0, 60)}`);
            }
            return 0;
        }
        const seedOpt = options.get('seed');
        const seed = seedOpt !== undefined && Number.isFinite(Number(seedOpt)) ? Number(seedOpt) : Math.floor(Math.random() * 2 ** 31);
        // With an empty pool but a valid --commit id, there is nothing to spin — the commit still stands.
        const spun = pool.length > 0 ? spinRoulette(ideas, cfg.roulette, seededRng(seed), now) : undefined;
        if (wantsCommit && commitId === undefined) {
            // --commit takes an EXPLICIT id (idea 5fcd9a2d): the spin is a function of the CURRENT pool, so a
            // bare `--commit` after the pool changed could start a DIFFERENT idea than the dry-run showed. The
            // id the user saw is the id that gets committed — the spin no longer decides a mutation.
            const msg = `roulette --commit requires the idea id you are committing to: dz backlog roulette --commit ${spun.id} (this spin's pick) — a bare --commit could start a different idea than the one you were shown`;
            if (json)
                write(JSON.stringify({ error: msg, pickId: spun.id, exitCode: 1 }, null, 2));
            else
                write(`dz backlog: ${msg}`);
            return 1;
        }
        let pick = spun;
        let committed = false;
        if (commitId !== undefined) {
            // Validated above (safe id + known id) BEFORE any early return.
            const idx = ideas.findIndex((i) => i.id === commitId);
            ideas[idx].status = 'in-progress';
            writeIdeas(projectRoot, ideas);
            pick = ideas[idx];
            committed = true;
        }
        if (json)
            write(JSON.stringify({ pick: pick ?? null, seed, committed, exitCode: 0 }, null, 2));
        else if (pick !== undefined) {
            write(`dz backlog roulette (seed ${seed}): ${pick.id} — ${pick.text.slice(0, 70)}`);
            write(`  align ${pick.goalAlignment.toFixed(3)}${pick.goalId !== null ? ` (${pick.goalId})` : ''} · effort ${pick.effort}${committed ? ' · → in-progress' : ` · (start it with: dz backlog roulette --commit ${pick.id})`}`);
        }
        return 0;
    }
    // ── ship | drop | reopen — the status-transition surface (the missing verb that let the roulette
    // keep re-drawing already-shipped work: without it, work finished WITHOUT `roulette --commit` —
    // the normal flow — stayed `new` forever). ALL logic lives in transitionIdeas (harness-core):
    // short-prefix resolution (unique or a loud error), the IDEA_TRANSITIONS legality table,
    // idempotent no-ops, all-or-nothing fail-closed batches, line-preserving atomic writes.
    if (sub === 'ship' || sub === 'drop' || sub === 'reopen') {
        const prefixes = [];
        for (let i = 1;; i += 1) {
            const p = options.get(`_positional_${i}`);
            if (p === undefined)
                break;
            prefixes.push(p);
        }
        if (prefixes.length === 0)
            return emitErr(`an idea id is required: dz backlog ${sub} <id> [<id>…]`);
        const report = transitionIdeas(projectRoot, sub, prefixes, {
            ...(options.get('reason') !== undefined ? { reason: options.get('reason') } : {}),
            dryRun: flags.has('dry-run'),
        });
        if (json) {
            write(JSON.stringify({ verb: sub, ...report, exitCode: report.ok ? 0 : 1 }, null, 2));
            return report.ok ? 0 : 1;
        }
        for (const e of report.errors)
            write(`dz backlog ${sub}: ${e}`);
        for (const c of report.changes) {
            if (c.action === 'noop')
                write(`dz backlog ${sub}: ${c.id} is already ${c.to} — no-op`);
            else
                write(`dz backlog ${sub}${report.dryRun ? ' (dry-run)' : ''}: ${c.id} ${c.from} → ${c.to}  ${c.text}`);
        }
        if (!report.ok)
            write(`  nothing was written (all-or-nothing: fix the batch and re-run)`);
        else if (report.dryRun && report.changes.some((c) => c.action === 'transitioned'))
            write('  (dry-run — nothing written; re-run without --dry-run to apply)');
        return report.ok ? 0 : 1;
    }
    // ── edit — replace/extend ONE idea's text (idea 1fde7bf6). The verb exists because a hand-edit
    // does not re-embed: the dedup vector keeps describing the OLD text. editIdea owns the text change
    // and MARKS the record embedStale; this layer owns the async re-embed and clears the mark ONLY
    // after the vector tier confirms. A failed re-embed is loud here AND enforced at the harm point:
    // classifyDedup refuses vector candidacy for a marked record (ADR-001).
    if (sub === 'edit') {
        const id = options.get('_positional_1');
        if (id === undefined)
            return emitErr('an idea id is required: dz backlog edit <id> --text "<new>" | --append "<more>" [--dry-run]');
        const report = editIdea(projectRoot, id, {
            ...(options.get('text') !== undefined ? { text: options.get('text') } : {}),
            ...(options.get('append') !== undefined ? { append: options.get('append') } : {}),
            dryRun: flags.has('dry-run'),
        });
        let embed = 'skipped';
        if (report.ok && report.written && report.id !== undefined) {
            const updated = readIdeas(projectRoot).find((i) => i.id === report.id);
            if (updated !== undefined) {
                const mirror = await mirrorIdeaVector(projectRoot, updated);
                if (mirror.mirrored > 0 && mirror.error === undefined && clearEmbedStale(projectRoot, report.id))
                    embed = 'ok';
                else
                    embed = 'stale';
            }
            else
                embed = 'stale';
        }
        if (json) {
            write(JSON.stringify({ verb: 'edit', ...report, embed, exitCode: report.ok ? (embed === 'stale' ? 1 : 0) : 1 }, null, 2));
            return report.ok ? (embed === 'stale' ? 1 : 0) : 1;
        }
        for (const e of report.errors)
            write(`dz backlog edit: ${e}`);
        if (report.ok && report.id !== undefined) {
            if (!report.written && !report.dryRun)
                write(`dz backlog edit: ${report.id} — text unchanged, nothing to do`);
            else
                write(`dz backlog edit${report.dryRun ? ' (dry-run)' : ''}: ${report.id}\n  was: ${report.previousText?.slice(0, 100)}\n  now: ${report.newText?.slice(0, 100)}`);
            if (report.written) {
                if (embed === 'ok')
                    write('  vector re-embedded (dedup form) — the record is fully consistent');
                else
                    write('  ⚠ vector NOT re-embedded — the record is MARKED embedStale: dedup will refuse to trust its similarity until `dz vector reindex` repairs it (the text edit itself landed)');
            }
            if (report.dryRun)
                write('  (dry-run — nothing written; re-run without --dry-run to apply)');
        }
        return report.ok ? (embed === 'stale' ? 1 : 0) : 1;
    }
    if (sub === 'enrich') {
        const id = options.get('_positional_1');
        if (id === undefined)
            return emitErr('an idea id is required: dz backlog enrich <id>');
        const ideas = readIdeas(projectRoot);
        const rec = ideas.find((i) => i.id === id);
        if (rec === undefined)
            return emitErr(`no idea ${id}`);
        const goalMap = readGoalMap(projectRoot);
        const related = ideas.filter((i) => rec.relatedIds.includes(i.id));
        const staging = stageEnrichment(projectRoot, rec, related, goalMap);
        rec.status = 'enriched';
        rec.enrichedPath = `features/${staging.slug}`;
        writeIdeas(projectRoot, ideas);
        if (json)
            write(JSON.stringify({ slug: staging.slug, scaffoldPath: staging.scaffoldPath, handoff: 'idea2prd-manual', exitCode: 0 }, null, 2));
        else {
            write(`dz backlog enrich: staged ${rec.id} → ${staging.scaffoldPath}`);
            write('  HAND OFF to the idea2prd-manual skill (agent phase) — the CLI stages the input; the agent writes the PRD.');
            write('  honesty/verification (claim-check, red-team, Brain recall) live at THIS layer, not assumed from idea2prd.');
        }
        return 0;
    }
    if (sub === 'jira') {
        const id = options.get('_positional_1');
        if (id === undefined)
            return emitErr('an idea id is required: dz backlog jira <id>');
        const ideas = readIdeas(projectRoot);
        const rec = ideas.find((i) => i.id === id);
        if (rec === undefined)
            return emitErr(`no idea ${id}`);
        const adapter = resolveJiraAdapter(cfg);
        const draft = buildJiraDraft(rec, readGoalMap(projectRoot));
        const ref = await adapter.createIssue(draft, makeBacklogIO(projectRoot));
        rec.jiraKey = ref.key ?? `outbox:${rec.id}`;
        writeIdeas(projectRoot, ideas);
        const verify = await adapter.verify();
        if (json)
            write(JSON.stringify({ ref, verify, adapter: adapter.backend, exitCode: 0 }, null, 2));
        else {
            write(`dz backlog jira: ${adapter.backend} → ${ref.stub ? 'stub' : 'live'} ${ref.key ?? '(no key)'}`);
            write(`  outbox: ${ref.outboxPath}`);
            if (!verify.ready)
                write(`  ⚠ manual wiring: ${verify.instruction}`);
        }
        return 0;
    }
    if (sub === 'harmonize') {
        const apply = flags.has('apply');
        const thr = options.get('threshold');
        // Harmonize is the batch maintenance surface — migrate the mirrored vectors to the current
        // bounded embed form here too (idempotent; a deferral is warned, never fatal).
        const form = await ensureBacklogEmbedForm(projectRoot);
        if (form.action === 'migrated' && !json)
            write(`dz backlog: re-embedded ${form.remirrored} idea vector(s) into the bounded dedup embed form (v${form.version})`);
        else if (form.action === 'deferred' && !json)
            write(`dz backlog: ⚠ embed-form migration deferred (${form.error ?? 'unknown error'})`);
        const report = await harmonizeBacklog(projectRoot, { apply, ...(thr !== undefined ? { threshold: Number(thr) } : {}) });
        if (json) {
            write(JSON.stringify({ ...report, exitCode: 0 }, null, 2));
            return 0;
        }
        write(`dz backlog harmonize (${report.mode}${report.fellBackToExact ? ', exact-text' : ''}): ${report.kept} cluster(s), ${report.dropped} merge-able, ${report.unique} unique (θ ${report.threshold})`);
        for (const c of report.clusters)
            write(`  keep ${c.keep} ← ${c.drops.join(', ')}`);
        if (report.snapshotPath !== undefined)
            write(`  snapshot: ${report.snapshotPath}`);
        if (report.pruneError !== undefined)
            write(`  ⚠ ${report.pruneError} — run dz vector reindex or re-run harmonize when the store is available`);
        if (!apply && report.dropped > 0)
            write('  (dry-run — re-run with --apply to merge, after the snapshot)');
        return 0;
    }
    // bare / unknown sub — help.
    write('dz backlog — the Smart Backlog: a goal-directed idea pipeline over the Brain vector engine');
    write('  add "<idea>" [--effort N][--proposal <t>][--dry-run]   capture (semantic dedup + GoalMap alignment)');
    write('  list [--status <s>][--goal <id>]                       list ideas');
    write('  show <id>                                              full record');
    write('  goals [--validate]                                     the compass (.dz/backlog/goals.json)');
    write('  roulette [--pick N][--seed n][--commit <id>]           weighted draw; --commit takes the id you saw');
    write('  ship <id> [<id>…] [--reason <t>][--dry-run]            mark done (new|enriched|in-progress → shipped) — run it after finishing a task, or the roulette re-draws it forever');
    write('  drop <id> [<id>…] [--reason <t>][--dry-run]            retire an idea (→ dropped)');
    write('  reopen <id> [<id>…] [--reason <t>][--dry-run]          back to the pool (shipped|dropped|in-progress → new)');
    write('  enrich <id>                                            stage the idea2prd hand-off (agent expands)');
    write(`  jira <id>                                              draft a Jira issue (adapter: ${[...BACKLOG_BACKENDS].join('|')})`);
    write('  harmonize [--apply][--threshold 0-1]                   batch semantic dedup of the backlog');
    return sub === undefined ? 0 : 1;
}
/** Read the recommender's existing telemetry planes plus its idempotency receipt. One adapter is
 * shared by `recommend` and the publish advisory so their freshness definitions cannot drift. */
function readRoutingTelemetry(repoRoot) {
    const records = readHarnessRecords(repoRoot);
    for (const base of [join(repoRoot, 'features'), join(repoRoot, '.dz', 'loop-trace')]) {
        if (!existsSync(base))
            continue;
        let names = [];
        try {
            names = readdirSync(base);
        }
        catch {
            continue;
        }
        for (const name of names) {
            const sidecar = join(base, name, 'run-meta.json');
            if (!existsSync(sidecar))
                continue;
            try {
                const meta = JSON.parse(readFileSync(sidecar, 'utf-8'));
                if (meta.runMeta?.resolved === true && Array.isArray(meta.runMeta.records))
                    records.push(...meta.runMeta.records);
            }
            catch { /* an unreadable sidecar contributes no asserted record */ }
        }
    }
    let alreadyFed = [];
    const fedPath = join(repoRoot, '.dz', 'routing-fed.json');
    if (existsSync(fedPath)) {
        const parsed = JSON.parse(readFileSync(join(repoRoot, '.dz', 'routing-fed.json'), 'utf-8'));
        if (!Array.isArray(parsed))
            throw new Error('.dz/routing-fed.json must be a JSON array of runIds');
        if (parsed.some((v) => typeof v !== 'string'))
            throw new Error('.dz/routing-fed.json contains a non-string runId');
        alreadyFed = parsed;
    }
    return { harvest: harvestStageOutcomes(records), alreadyFed };
}
/**
 * `dz routing` — inspect the learned cost-optimal routing outcome store (feature learned-cost-routing). Shows
 * what `args.models[stage]='auto-cost'` currently believes per (stage, complexity-tier, model): gated
 * attempts / successes / rate. Read-only.
 *   --stage <s>   filter to one pipeline stage (code, qe, plan, …)
 *   --json        raw store JSON
 */
function cmdRouting(options, flags, cwd, write) {
    let repoRoot = cwd;
    try {
        repoRoot = execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf-8' }).trim() || cwd;
    }
    catch { /* not git */ }
    // ── recommend — harvest real telemetry, print per-stage picks WITH THE BASIS, optionally feed the
    // store (a9c3dd5c fn 3, ADR-001). Sources: live harness records + imported run-meta.json sidecars.
    if (options.get('_positional_0') === 'recommend') {
        let routing;
        try {
            routing = readRoutingTelemetry(repoRoot);
        }
        catch (e) {
            write(`dz routing recommend: cannot read routing freshness state — ${e.message}`);
            return 1;
        }
        const harvest = routing.harvest;
        let rec = recommendModels(harvest, {
            ...(options.get('tier') !== undefined ? { tier: options.get('tier') } : {}),
            alreadyFed: routing.alreadyFed,
        });
        if (flags.has('apply')) {
            const fedPath = join(repoRoot, '.dz', 'routing-fed.json');
            const plan = planFeed(harvest.samples, routing.alreadyFed);
            for (const sample of plan.toFeed)
                finalizeOutcome(repoRoot, sample.stage, sample.tier, sample.model, sample.success);
            try {
                mkdirSync(join(repoRoot, '.dz'), { recursive: true });
                writeFileSync(fedPath, JSON.stringify(plan.fedAfter));
            }
            catch (e) {
                write(`dz routing recommend: fed ${plan.toFeed.length} sample(s) but could NOT persist the fed-set — a re-apply WILL double-count: ${e.message}`);
                return 1;
            }
            rec = recommendModels(harvest, {
                ...(options.get('tier') !== undefined ? { tier: options.get('tier') } : {}),
                alreadyFed: plan.fedAfter,
            });
            write(`dz routing recommend --apply: fed ${plan.toFeed.length} sample(s) into .dz/routing-outcomes.json${plan.skippedRuns.length > 0 ? `; skipped ${plan.skippedRuns.length} already-fed run(s) (idempotent by runId)` : ''}`);
        }
        if (flags.has('json')) {
            write(JSON.stringify({ recommendation: rec, exitCode: 0 }, null, 2));
            return 0;
        }
        write(`dz routing recommend — args.models suggestion from ${rec.basis.runsUsed} run(s)${rec.basis.window !== null ? ` (${rec.basis.window.min.slice(0, 10)}..${rec.basis.window.max.slice(0, 10)})` : ''}:`);
        for (const s of rec.perStage) {
            write(`  ${s.stage.padEnd(14)} ${s.spec.padEnd(20)} ${s.insufficientData ? '[insufficient data — cold-start pick]' : '[quality bar met]'} ${s.pick.evidence}`);
        }
        write(`  basis: ${rec.basis.rule}`);
        if (rec.basis.freshness === 'current')
            write('  store: current (0 unharvested runs)');
        else if (rec.basis.freshness === 'stale')
            write(`  store: STALE — ${rec.basis.unfed.count} run(s) harvested but never fed; auto-cost is routing from an older snapshot — run \`dz routing recommend --apply\``);
        else
            write('  store: UNFED — auto-cost has no learned rows; picks below are cold-start');
        write(`  basis: skipped records — no result ${rec.basis.skipped.noResult}, no modelsUsed ${rec.basis.skipped.noModels} (predates model routing — history, not an error), no grade ${rec.basis.skipped.noGrade}, unknown model ${rec.basis.skipped.unknownModel}`);
        write(`  basis: ${rec.basis.crossFamilyNote}`);
        return 0;
    }
    const stage = options.get('stage');
    const tier = options.get('tier');
    const model = options.get('model');
    // --select: resolve an `auto-cost` stage → the concrete model + escalate chain (the workflow shells out here
    // because it is sandboxed with no fs). --family restricts to the coder's cross-family (qe guard); --ladder is
    // the probe-filtered id set (account-specific Codex ids that answered).
    if (flags.has('select')) {
        if (!stage || !tier) {
            write('dz routing --select needs --stage and --tier');
            return 1;
        }
        const fam = options.get('family');
        const family = fam === 'claude' || fam === 'openai' ? fam : undefined;
        const ladderCsv = options.get('ladder');
        let ladder;
        if (ladderCsv !== undefined) {
            const ids = new Set(ladderCsv.split(',').map((s) => s.trim()).filter(Boolean));
            ladder = COST_LADDER.filter((r) => ids.has(r.id));
        }
        const statsFor = statsForKey(loadOutcomes(repoRoot), stage, tier);
        const pick = selectAutoCost(stage, tier, statsFor, { ...(family ? { family } : {}), ...(ladder ? { ladder } : {}) });
        write(JSON.stringify(pick));
        return 0;
    }
    // --record-provisional / --finalize: the two-phase outcome label. The workflow calls these at stage end
    // (provisional) and at the downstream gate (finalize, authoritative).
    if (flags.has('record-provisional')) {
        if (!stage || !tier || !model) {
            write('dz routing --record-provisional needs --stage --tier --model');
            return 1;
        }
        recordProvisional(repoRoot, stage, tier, model, flags.has('weak'));
        write(`recorded provisional: ${stage}/${tier}/${model}${flags.has('weak') ? ' (weak-credit)' : ''}`);
        return 0;
    }
    if (flags.has('finalize')) {
        if (!stage || !tier || !model) {
            write('dz routing --finalize needs --stage --tier --model --success <true|false>');
            return 1;
        }
        const success = options.get('success') === 'true';
        finalizeOutcome(repoRoot, stage, tier, model, success);
        write(`finalized: ${stage}/${tier}/${model} → ${success ? 'success' : 'FAILURE'}`);
        return 0;
    }
    // default / --json: inspect the learned table.
    const store = loadOutcomes(repoRoot);
    if (flags.has('json')) {
        write(JSON.stringify(store, null, 2));
        return 0;
    }
    write(renderOutcomes(store, stage));
    return 0;
}
/**
 * `dz bto-optimize` — the deterministic engine BEHIND the `/bto-optimize` skill (feature bto-optimize-holdout).
 * Adds dspy-MIPROv2 rigor the current evolutionary loop lacks: a hold-out split, a hard budget cap, and a
 * no-regress-on-holdout winner selector. NOT a rival command — the skill delegates these steps; candidate-prose
 * generation + judge scoring stay skill-side. `--json` on every subcommand.
 *   --split --scenarios <csv|@file> [--holdout <r>]                 deterministic tune/holdout split
 *   --plan --candidates K --rounds R --tune N --holdout M [--max C]  budget plan (trims to the cap)
 *   --select --baseline <@json> --candidates <@json> [--tolerance t] accept only on holdout no-regress
 *   --scope-check --original <f> --candidate <f>                     prose-only guard
 *   --diff --original <f> --candidate <f>                            the prose diff to confirm
 */
function cmdBtoOptimize(options, flags, cwd, write) {
    const json = flags.has('json');
    const emit = (o) => { write(JSON.stringify(o, null, json ? 2 : 0)); return 0; };
    const readContained = (rel) => {
        // Containment (QE #traversal): an @file must stay under cwd — `@../../etc/passwd` must not read outside.
        const rootAbs = resolve(cwd);
        const abs = resolve(rootAbs, rel);
        if (abs !== rootAbs && !abs.startsWith(rootAbs + sep))
            throw new Error(`path escapes the working directory: ${rel}`);
        return readFileSync(abs, 'utf-8');
    };
    const readJson = (spec) => {
        if (spec === undefined)
            return undefined;
        const raw = spec.startsWith('@') ? readContained(spec.slice(1)) : spec;
        return JSON.parse(raw);
    };
    try {
        if (flags.has('split')) {
            const sc = options.get('scenarios');
            if (sc === undefined) {
                write('dz bto-optimize --split needs --scenarios <csv|@file>');
                return 1;
            }
            const ids = sc.startsWith('@') ? readScenarioIds(resolve(cwd, sc.slice(1))) : sc.split(',').map((s) => s.trim()).filter(Boolean);
            const ratio = Number.parseFloat(options.get('holdout') ?? '');
            const split = splitScenarios(ids, Number.isFinite(ratio) ? ratio : undefined);
            if (json)
                return emit(split);
            write(`tune (${split.tune.length}): ${split.tune.join(', ')}`);
            write(`holdout (${split.holdout.length}): ${split.holdout.join(', ')}`);
            return 0;
        }
        if (flags.has('plan')) {
            const n = (k, d) => { const v = Number.parseInt(options.get(k) ?? '', 10); return Number.isFinite(v) ? v : d; };
            const max = Number.parseInt(options.get('max') ?? '', 10);
            const plan = budgetPlan({ candidates: n('candidates', 5), rounds: n('rounds', 1), tuneCount: n('tune', 3), holdoutCount: n('holdout', 2) }, Number.isFinite(max) ? max : DEFAULT_MAX_JUDGE_RUNS);
            if (json)
                return emit(plan);
            write(`budget plan: ${plan.candidates} candidates × ${plan.rounds} round(s) → ${plan.tuneRuns} tune + ${plan.holdoutRuns} holdout = ${plan.totalRuns} judge run(s) (cap ${plan.cap}, ${plan.withinCap ? 'within cap' : 'OVER CAP'})`);
            if (plan.trimmed)
                write(`  trimmed to fit: ${plan.trimmed}`);
            return 0;
        }
        if (flags.has('select')) {
            const baseline = readJson(options.get('baseline'));
            const candidates = readJson(options.get('candidates'));
            if (!baseline || !Array.isArray(candidates)) {
                write('dz bto-optimize --select needs --baseline <@json {holdout}> and --candidates <@json [..]>');
                return 1;
            }
            const tol = Number.parseFloat(options.get('tolerance') ?? '');
            const result = selectWinner(baseline, candidates, Number.isFinite(tol) ? { tolerance: tol } : {});
            if (json)
                return emit(result);
            write(result.winner ? `✓ winner: ${result.winner} — ${result.reason}` : `✗ no winner — ${result.reason}`);
            return 0;
        }
        if (flags.has('scope-check') || flags.has('diff')) {
            const o = options.get('original');
            const c = options.get('candidate');
            if (o === undefined || c === undefined) {
                write('needs --original <file> and --candidate <file>');
                return 1;
            }
            const origText = readContained(o);
            const candText = readContained(c);
            if (flags.has('scope-check')) {
                const r = proseScopeOk(origText, candText);
                if (json)
                    return emit(r);
                write(r.ok ? `✓ prose-only: ${r.reason}` : `✗ out of scope: ${r.reason}`);
                return r.ok ? 0 : 1;
            }
            write(renderProseDiff(origText, candText));
            return 0;
        }
        write('dz bto-optimize: pass --split | --plan | --select | --scope-check | --diff (see docs)');
        return 1;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (json) {
            write(JSON.stringify({ error: msg }));
            return 1;
        }
        write(`dz bto-optimize: ${msg}`);
        return 1;
    }
}
function cmdStats(cwd, write) {
    const baseDir = join(cwd, 'packages', '@dzhechkov');
    if (!existsSync(baseDir)) {
        write('dz stats: no packages/@dzhechkov found');
        return 1;
    }
    const dirs = readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    const packages = dirs.length;
    // Backlog e160aeee. This used to walk the tree ITSELF, and was wrong in two independent ways:
    // it counted only packages whose NAME starts with `skills-` (health-advisor, p-replicator,
    // keysarium and trip-planner were therefore invisible), and it knew only ONE of the three skill
    // layouts. Result: 203 here against 250 from `dz registry` on the same tree — two counters of one
    // quantity, each unable to refute the other because neither knew the other existed.
    //
    // The fix is structural, not arithmetic: there is now ONE enumerator, and both commands ask it.
    // Pinned by test/stats-registry-parity.test.ts, whose red half is this exact divergence.
    // The registry already PUBLISHES these totals; recomputing them from `entries` here would be a
    // third implementation of the same count, which is the very defect being fixed.
    const registry = buildRegistry(cwd);
    const totalSkills = registry.totalSkills;
    const skillPacks = registry.totalPacks;
    const targets = TARGET_NAMES.length;
    const presets = PRESET_NAMES.length;
    write(`dz stats — DZ Harness Hub`);
    write(`  Packages:    ${packages}`);
    write(`  Skill packs: ${skillPacks}`);
    write(`  Total skills: ${totalSkills}`);
    write(`  Targets:     ${targets} (${TARGET_NAMES.join(', ')})`);
    write(`  Presets:     ${presets} (${PRESET_NAMES.join(', ')})`);
    // Learn-loop state for the current project (if .dz exists)
    if (existsSync(join(cwd, '.dz'))) {
        const patterns = loadStorePatternsSync(cwd).length;
        let consolidated;
        try {
            consolidated = JSON.parse(readFileSync(join(cwd, '.dz', 'memory', 'consolidate.json'), 'utf-8')).lastConsolidatedTs;
        }
        catch { /* not consolidated yet */ }
        write(`  Learn loop:  ${patterns} learned pattern(s)${consolidated ? `, consolidated up to ${consolidated}` : ', not consolidated yet'}`);
    }
    return 0;
}
function cmdDashboard(cwd, write) {
    const baseDir = join(cwd, 'packages', '@dzhechkov');
    if (!existsSync(baseDir)) {
        write('dz dashboard: no packages/@dzhechkov found');
        return 1;
    }
    const dirs = readdirSync(baseDir, { withFileTypes: true }).filter((e) => e.isDirectory());
    // Categorize packages
    const adapters = [];
    const skillPacks = [];
    const core = [];
    for (const dir of dirs) {
        const name = dir.name;
        if (name.startsWith('adapter-')) {
            adapters.push(name.replace('adapter-', ''));
        }
        else if (name.startsWith('skills-')) {
            const skillDir = join(baseDir, name);
            const count = readdirSync(skillDir, { withFileTypes: true })
                .filter((e) => e.isDirectory() && existsSync(join(skillDir, e.name, 'SKILL.md'))).length;
            skillPacks.push({ name, count });
        }
        else {
            core.push(name);
        }
    }
    const totalSkills = skillPacks.reduce((sum, p) => sum + p.count, 0);
    write('');
    write('╔══════════════════════════════════════════════════════════════╗');
    write('║               DZ HARNESS HUB — DASHBOARD                   ║');
    write('╠══════════════════════════════════════════════════════════════╣');
    write(`║  Packages: ${String(dirs.length).padStart(3)}    Targets: ${String(TARGET_NAMES.length).padStart(2)}    Presets: ${String(PRESET_NAMES.length).padStart(2)}    Skills: ${String(totalSkills).padStart(3)} ║`);
    write('╠══════════════════════════════════════════════════════════════╣');
    write('║  TARGETS                                                    ║');
    for (const t of TARGET_NAMES) {
        write(`║    ${t.padEnd(56)}║`);
    }
    write('╠──────────────────────────────────────────────────────────────╣');
    write('║  SKILL PACKS                                                ║');
    for (const sp of skillPacks) {
        write(`║    ${sp.name.padEnd(35)} ${String(sp.count).padStart(3)} skills          ║`);
    }
    write('╠──────────────────────────────────────────────────────────────╣');
    write('║  PRESETS                                                     ║');
    for (const p of PRESET_NAMES) {
        write(`║    ${p.padEnd(56)}║`);
    }
    write('╠──────────────────────────────────────────────────────────────╣');
    write('║  CORE                                                        ║');
    for (const c of core) {
        write(`║    ${c.padEnd(56)}║`);
    }
    write('╠──────────────────────────────────────────────────────────────╣');
    write('║  ADAPTERS                                                    ║');
    for (const a of adapters) {
        write(`║    ${a.padEnd(56)}║`);
    }
    write('╚══════════════════════════════════════════════════════════════╝');
    write('');
    return 0;
}
/**
 * Run the `dz` CLI. Returns a process exit code; never calls `process.exit`,
 * so it is safe to call from tests. Output and working directory are injectable.
 */
async function cmdImportEcc(options, flags, cwd, write) {
    const localPath = options.get('local-path');
    const selectRaw = options.get('select');
    const limitRaw = options.get('limit');
    const outputDir = options.get('output') ?? join(cwd, 'imported-ecc-skills');
    const existingSkillsDir = join(cwd, '.claude', 'skills');
    write(`dz import-ecc: importing skills from ${localPath ?? 'github.com/affaan-m/ECC'}...`);
    const importOpts = {
        existingSkillsDir,
        outputDir,
        force: flags.has('force'),
        ...(selectRaw ? { select: selectRaw.split(',') } : {}),
        ...(limitRaw ? { limit: parseInt(limitRaw, 10) } : {}),
        ...(localPath ? { localPath } : {}),
    };
    const report = await importEcc(importOpts);
    write(`\n╔══════════════════════════════════════════════════════════════╗`);
    write(`║              DZ IMPORT-ECC — Skill Importer                 ║`);
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  Source: ${(report.source).slice(0, 51).padEnd(51)}║`);
    write(`║  Fetched: ${String(report.totalFetched).padStart(4)} | Imported: ${String(report.imported).padStart(4)} | Dupes: ${String(report.skippedDuplicate).padStart(4)} | Err: ${String(report.skippedError).padStart(3)}║`);
    write(`╠══════════════════════════════════════════════════════════════╣`);
    if (report.imported > 0) {
        write(`║  IMPORTED (${report.imported})${' '.repeat(47 - String(report.imported).length)}║`);
        for (const s of report.skills.filter((s) => s.status === 'imported').slice(0, 20)) {
            write(`║    ✓ ${s.id.padEnd(55)}║`);
        }
        if (report.imported > 20)
            write(`║    ... and ${report.imported - 20} more${' '.repeat(45)}║`);
    }
    if (report.skippedDuplicate > 0) {
        write(`║  SKIPPED (duplicate): ${report.skippedDuplicate}${' '.repeat(38 - String(report.skippedDuplicate).length)}║`);
    }
    write(`╠══════════════════════════════════════════════════════════════╣`);
    write(`║  Output: ${outputDir.slice(0, 51).padEnd(51)}║`);
    write(`║  Next: dz init --target claude-code --skills-dir ${outputDir.split('/').pop()?.slice(0, 10).padEnd(10)}║`);
    write(`╚══════════════════════════════════════════════════════════════╝`);
    return report.skippedError > 0 && report.imported === 0 ? 1 : 0;
}
// ── dz profile (feature operator-profile, ADR-001) ─────────────────────────────────────────────
//
// WHO the assistant is talking to: a per-user store at ~/.dz/profile.json (0600, NEVER under a
// project root) delivered as a marked block in ~/.claude/CLAUDE.md — loaded in every project on
// the machine, dz installed or not. Four subcommands: init (five questions), show (path + age +
// rendered block — the path ALWAYS prints, per the teach-target announce-the-store precedent),
// set (register / language / teaches / deep|weak add|rm), sync (write the block; runs
// automatically after init and set). An unknown register is REFUSED naming the accepted set —
// never silently defaulted.
/** The refusal line for a bad register — one place, so init/set refuse identically. */
function profileRegisterRefusal(raw) {
    return `dz profile: unknown register ${JSON.stringify(raw)} — accepted: ${REGISTERS.join(' | ')} (или своими словами: профи | профи лайт | просто)`;
}
function profileRegisterEcho(register) {
    return `${register} (${registerOwnerWord(register)})`;
}
/** Shared epilogue of init/set/sync: push the block into ~/.claude/CLAUDE.md and say what happened. */
function profileSyncAndReport(profile, write, writeErr) {
    const res = syncProfileBlock(profile);
    if (res.problem !== null) {
        writeErr(`dz profile: sync failed: ${res.problem}`);
        return 1;
    }
    if (res.changed) {
        const backupNote = res.backup === null ? '' : ' (backup: ' + res.backup + ')';
        write(`synced block into ${res.target}` + backupNote);
    }
    else {
        write(`block in ${res.target} already up to date`);
    }
    return 0;
}
async function cmdProfile(options, flags, write, writeErr) {
    const sub = options.get('_positional_0') ?? 'show';
    const json = flags.has('json');
    // --json contract (cross-family finding, 2026-08-28): stdout carries exactly ONE JSON document
    // per invocation. Before this, `set --json` printed a human field echo BEFORE the JSON and the
    // sync status line AFTER it, `sync --json` ignored json entirely and `init --json` emitted its
    // prompts to stdout — none of the three parsed. Human lines now go through `say` (dropped in
    // json mode) and every refusal in json mode IS the one document.
    const say = (line) => { if (!json)
        write(line); };
    const fail = (code, error) => {
        if (json)
            write(JSON.stringify({ ok: false, error }));
        else
            writeErr(error);
        return code;
    };
    if (sub === 'show') {
        const { profile, path, problem } = readProfile();
        if (profile === null) {
            // The path prints on EVERY exit — announcing the store is the point (ADR Decision 4).
            if (json) {
                write(JSON.stringify({ path, profile: null, problem }));
                return 1;
            }
            write(`store:   ${path}`);
            writeErr(`dz profile: ${problem === 'missing' ? 'no profile yet — run `dz profile init`' : problem}`);
            return 1;
        }
        const age = profileAgeDays(profile);
        const drift = checkProfileDrift();
        const block = renderProfileBlock(profile);
        if (json) {
            write(JSON.stringify({ path, ageDays: age, drift, profile, block }));
            return 0;
        }
        write(`store:    ${path}`);
        const ageNote = age === null ? '' : ' (' + age + (age === 1 ? ' day' : ' days') + ' ago)';
        write(`updated:  ${profile.updatedAt}` + ageNote);
        write(`register: ${profileRegisterEcho(profile.register)} · language: ${profile.language} · teaches: ${profile.teaches ? 'yes' : 'no'}`);
        write(`block:    ${drift.verdict}` + (drift.verdict === 'in-sync' ? '' : ' — ' + drift.detail));
        write('');
        write(block);
        return 0;
    }
    if (sub === 'init') {
        // Five questions, node:readline, under two minutes. An existing profile pre-fills every
        // default (domains included) — init is safe to re-run; Enter keeps what is stored.
        const existing = readProfile().profile;
        const { createInterface } = await import('node:readline');
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        // Buffered ask, not rl.question(): with PIPED stdin the answer lines can all arrive while no
        // question is pending, and readline DROPS a 'line' nobody listens for — the next question()
        // then never settles and the process dies with an unsettled top-level await (MEASURED on the
        // first smoke of this command, exit 13). Buffering every line makes piped `printf 'a\nb\nc' |
        // dz profile init` and an interactive TTY behave identically. null = stdin closed early.
        const buffered = [];
        let pendingAsk = null;
        let stdinClosed = false;
        rl.on('line', (line) => {
            if (pendingAsk !== null) {
                const resolve = pendingAsk;
                pendingAsk = null;
                resolve(line);
            }
            else
                buffered.push(line);
        });
        rl.on('close', () => {
            stdinClosed = true;
            if (pendingAsk !== null) {
                const resolve = pendingAsk;
                pendingAsk = null;
                resolve(null);
            }
        });
        const ask = (prompt) => {
            // In --json mode the prompts go to STDERR — stdout must stay exactly one JSON document.
            (json ? process.stderr : process.stdout).write(prompt);
            if (buffered.length > 0)
                return Promise.resolve(buffered.shift());
            if (stdinClosed)
                return Promise.resolve(null);
            return new Promise((resolve) => { pendingAsk = resolve; });
        };
        const eofRefusal = () => fail(1, 'dz profile: stdin closed before the five questions were answered — nothing written');
        // Domain question: an EXISTING list renders as the default an Enter keeps; on a fresh
        // profile Enter honestly means "none" — onboarding never forces an answer.
        const askDomains = async (prompt, current) => {
            const hint = current.length > 0 ? ' [' + domainListText(current) + ']' : ' (Enter — пропустить)';
            const answer = await ask(prompt + hint + ': ');
            if (answer === null)
                return null;
            if (answer.trim() === '')
                return current;
            return parseDomainList(answer);
        };
        // y/n: an unrecognised answer RE-ASKS once; a second unrecognised answer takes the
        // documented default and SAYS so. Measured defect this closes: a domains line fed to the
        // old y/n question silently became `teaches: no`.
        const askYesNo = async (prompt, dflt) => {
            for (let attempt = 0; attempt < 2; attempt++) {
                const answer = await ask(prompt + ' y/n [' + (dflt ? 'y' : 'n') + ']: ');
                if (answer === null)
                    return null;
                if (answer.trim() === '')
                    return dflt;
                const parsed = parseYesNo(answer);
                if (parsed !== null)
                    return parsed;
                if (attempt === 0)
                    writeErr('dz profile: did not understand ' + JSON.stringify(answer.trim()) + ' — answer y or n (да/нет)');
            }
            (json ? writeErr : write)('unrecognised again — taking the default: ' + (dflt ? 'yes' : 'no'));
            return dflt;
        };
        try {
            const langDefault = existing?.language ?? 'ru';
            const langAnswer = await ask(`1/5 Dialogue language (ru, en, …) [${langDefault}]: `);
            if (langAnswer === null)
                return eofRefusal();
            const language = langAnswer.trim() === '' ? langDefault : langAnswer.trim();
            const regDefault = existing?.register ?? 'pro-lite';
            let register = null;
            while (register === null) {
                const regAnswer = await ask(`2/5 Default register — pro / pro-lite / plain (профи / профи лайт / просто) [${profileRegisterEcho(regDefault)}]: `);
                if (regAnswer === null)
                    return eofRefusal();
                const regRaw = regAnswer.trim();
                if (regRaw === '') {
                    register = regDefault;
                    break;
                }
                register = parseRegister(regRaw);
                if (register === null)
                    writeErr(profileRegisterRefusal(regRaw));
            }
            // ADR Decision 2: a single register dial cannot express the owner — the domain lists ARE
            // the profile, and the weak list is the load-bearing one. So onboarding asks for BOTH,
            // phrased so no self-assessment is needed (the design-report wording, tested with the owner).
            const deepDomains = await askDomains('3/5 Назовите 2–4 области, где вам НЕ нужно пояснять термины (сертификации, чем занимались 5+ лет) — через запятую', existing?.deepDomains ?? []);
            if (deepDomains === null)
                return eofRefusal();
            const weakDomains = await askDomains('4/5 Где наоборот — терминам нужна одна поясняющая фраза? — через запятую', existing?.weakDomains ?? []);
            if (weakDomains === null)
                return eofRefusal();
            const teaches = await askYesNo('5/5 Do you teach — must explanations be re-tellable?', existing?.teaches ?? true);
            if (teaches === null)
                return eofRefusal();
            const profile = {
                version: 1,
                updatedAt: new Date().toISOString(),
                language,
                register,
                deepDomains,
                weakDomains,
                teaches,
            };
            const initWrite = writeProfile(profile);
            if (initWrite.problem !== undefined)
                return fail(2, `dz profile: ${initWrite.problem}`);
            const { path } = initWrite;
            say(`wrote ${path} (0600) — register ${profileRegisterEcho(register)}, language ${language}, teaches ${teaches ? 'yes' : 'no'}`);
            say('deep: ' + (deepDomains.length > 0 ? domainListText(deepDomains) : '(none)') + ' · weak: ' + (weakDomains.length > 0 ? domainListText(weakDomains) : '(none)'));
            if (deepDomains.length === 0 && weakDomains.length === 0) {
                say('no domains yet — the profile is a single dial until you add them: `dz profile set deep add <tag> [note]` · `dz profile set weak add <tag>`');
            }
            if (json) {
                const sync = syncProfileBlock(profile);
                write(JSON.stringify({ ok: sync.problem === null, path, profile, sync }));
                return sync.problem === null ? 0 : 1;
            }
            return profileSyncAndReport(profile, write, writeErr);
        }
        finally {
            rl.close();
        }
    }
    if (sub === 'set') {
        const read = readProfile();
        if (read.profile === null) {
            return fail(1, 'dz profile: ' + (read.problem === 'missing' ? 'no profile at ' + read.path + ' — run `dz profile init` first' : read.path + ': ' + read.problem));
        }
        const key = options.get('_positional_1') ?? '';
        const val = options.get('_positional_2') ?? '';
        let next;
        // The field echo is DEFERRED until writeProfile succeeds (round-5 P2-3): `dz profile set
        // language '<marker>'` used to print `language: <marker>` BEFORE the write check exited 2 —
        // a success-looking confirmation of a mutation that was never applied. In --json mode nothing
        // changes: echoes go through `say`, which json drops.
        let echo;
        if (key === 'register') {
            const register = parseRegister(val);
            if (register === null) {
                return fail(2, profileRegisterRefusal(val));
            }
            next = { ...read.profile, register };
            echo = `register: ${profileRegisterEcho(register)}`;
        }
        else if (key === 'language') {
            if (val.trim() === '') {
                return fail(2, 'dz profile: usage: dz profile set language <code>');
            }
            next = { ...read.profile, language: val.trim() };
            echo = `language: ${next.language}`;
        }
        else if (key === 'teaches') {
            const t = val.trim().toLowerCase();
            if (!['on', 'off', 'true', 'false', 'yes', 'no', 'y', 'n', 'да', 'нет'].includes(t)) {
                return fail(2, 'dz profile: usage: dz profile set teaches on|off');
            }
            next = { ...read.profile, teaches: ['on', 'true', 'yes', 'y', 'да'].includes(t) };
            echo = `teaches: ${next.teaches ? 'yes' : 'no'}`;
        }
        else if (key === 'deep' || key === 'weak') {
            const op = val;
            const tag = (options.get('_positional_3') ?? '').trim();
            const note = options.get('_positional_4');
            const listKey = key === 'deep' ? 'deepDomains' : 'weakDomains';
            const list = read.profile[listKey];
            if (op === 'add') {
                if (tag === '') {
                    return fail(2, `dz profile: usage: dz profile set ${key} add <tag> [note]`);
                }
                const rest = list.filter((d) => d.tag !== tag);
                const domain = note === undefined || note.trim() === '' ? { tag } : { tag, note: note.trim() };
                next = { ...read.profile, [listKey]: [...rest, domain] };
                echo = key + ': + ' + (domain.note ? tag + ' (' + domain.note + ')' : tag);
            }
            else if (op === 'rm') {
                if (tag === '') {
                    return fail(2, `dz profile: usage: dz profile set ${key} rm <tag>`);
                }
                if (!list.some((d) => d.tag === tag)) {
                    return fail(1, `dz profile: no ${key} domain ${JSON.stringify(tag)} — have: ${list.map((d) => d.tag).join(', ') || '(none)'}`);
                }
                next = { ...read.profile, [listKey]: list.filter((d) => d.tag !== tag) };
                echo = `${key}: - ${tag}`;
            }
            else {
                return fail(2, `dz profile: usage: dz profile set ${key} add|rm <tag> [note]`);
            }
        }
        else {
            return fail(2, 'dz profile: usage: dz profile set register|language|teaches|deep|weak …');
        }
        const stamped = { ...next, updatedAt: new Date().toISOString() };
        const setWrite = writeProfile(stamped);
        // A refused write must never fall through to sync: syncing an unwritten profile would put the
        // poisoned value into CLAUDE.md while the store still holds the old one (round-4 fix). And it
        // must never have echoed either — the echo below only runs on an APPLIED mutation.
        if (setWrite.problem !== undefined)
            return fail(2, `dz profile: ${setWrite.problem}`);
        say(echo);
        const { path } = setWrite;
        if (json) {
            const sync = syncProfileBlock(stamped);
            write(JSON.stringify({ ok: sync.problem === null, path, profile: stamped, sync }));
            return sync.problem === null ? 0 : 1;
        }
        return profileSyncAndReport(stamped, write, writeErr);
    }
    if (sub === 'sync') {
        const read = readProfile();
        if (read.profile === null) {
            return fail(1, 'dz profile: ' + (read.problem === 'missing' ? 'no profile at ' + read.path + ' — run `dz profile init` first' : read.path + ': ' + read.problem));
        }
        if (json) {
            const res = syncProfileBlock(read.profile);
            write(JSON.stringify({ ok: res.problem === null, target: res.target, changed: res.changed, backup: res.backup, problem: res.problem }));
            return res.problem === null ? 0 : 1;
        }
        return profileSyncAndReport(read.profile, write, writeErr);
    }
    return fail(2, `dz profile: unknown subcommand ${JSON.stringify(sub)} — accepted: init | show | set | sync`);
}
export async function runCli(argv, io = {}) {
    const cwd = io.cwd ?? process.cwd();
    const write = io.write ?? ((line) => { console.log(line); });
    // Diagnostics go to stderr so `dz <cmd> > out.txt` yields clean data (feature dz-cli-defects).
    const writeErr = io.writeErr ?? ((line) => { console.error(line); });
    // Lazy STDIN reader — only `dz brain ground` reads it, and only when no positional prompt is
    // given. Never blocks: injected `io.stdin` wins; else read fd 0 synchronously, but bail to '' on
    // a TTY (nothing piped) or any read error. Grounding must never hang waiting on an empty pipe.
    const readStdin = () => {
        if (io.stdin !== undefined)
            return io.stdin;
        try {
            if (process.stdin.isTTY)
                return '';
            return readFileSync(0, 'utf8');
        }
        catch {
            return '';
        }
    };
    const { command, options, optionLists, flags } = parseArgs(argv);
    // An unrecognised `--flag` must not pass in silence. MEASURED 2026-08-24: `dz recall "x" --breif
    // --limit 2` printed the full ordinary output and exited 0, so a typo read as "the mode worked".
    // It WARNS rather than refuses, and the reason is measured, not cautious: 53 of the names this CLI
    // reads appear nowhere in help, and static extraction over the dispatch table lost `--week` from
    // `dz recap` — a refusal built on either list would reject working commands, which is a worse
    // failure than the one being fixed. Goes to STDERR so a `--json` consumer's stdout stays clean.
    if (command !== 'contract-check') {
        for (const notice of unknownFlagNotice([...flags, ...options.keys()].filter((k) => !k.startsWith('_positional_')), KNOWN_CLI_FLAGS)) {
            writeErr(notice.line);
        }
    }
    // ── `dz --version` / `dz -v` / `dz version` — PRE-DISPATCH, before the help branch ──
    //
    // Until now `dz --version` printed the whole USAGE manual and exited 0 (MEASURED 2026-08-17,
    // reproducer `node dist/bin.js --version`). Exit 0 plus prose is the worst possible answer for a
    // caller that must decide whether a `dz` it found on PATH is safe to invoke: the status code says
    // "fine" and there is no number to parse. Any wrapper guarding a version range needs exactly one
    // parseable line. Recognised only as the FIRST token (or the `version` subcommand) so that a
    // later positional `-v` belonging to a subcommand keeps its own meaning.
    if (argv[0] === '--version' || argv[0] === '-v' || command === 'version') {
        const version = dzOwnVersion();
        if (flags.has('json')) {
            write(JSON.stringify({ name: 'dz', version, node: process.version, schemas: { loopPlan: 'loop-plan/1' } }));
        }
        else {
            write(version);
        }
        // An unresolvable version is a FAILURE, not a value: exiting 0 with the literal `unknown` would
        // let a guard treat "I could not tell you" as "I answered you".
        return version === 'unknown' ? 1 : 0;
    }
    // `-h` is the most-typed help flag and is NOT a command: before the unknown-command contract
    // landed it fell through to the switch and still printed usage; afterwards it would have died
    // with exit 2 and an empty stdout (measured regression, cross-model QE M1). It belongs beside
    // `-v` above — an argv-level flag, resolved before command dispatch.
    if (argv[0] === '-h') {
        write(USAGE);
        return 0;
    }
    // A bare `--typo` leaves the command empty, so the usage branch reported SUCCESS on a misspelled
    // FLAG exactly as it used to on a misspelled VERB (cross-model QE M2): `dz --frobnicate` exited 0
    // with 30 KB of usage. The refusal is deliberately narrowed to the no-command case, because the
    // warn-don't-refuse decision above is measured and still stands: with a command present, an
    // unrecognised name may simply be missing from KNOWN_CLI_FLAGS and refusing would break working
    // invocations. With NO command there is nothing the flag could belong to, so it is a usage error.
    if (command === '') {
        const strayNames = unknownFlagNotice([...flags, ...options.keys()].filter((k) => !k.startsWith('_positional_')), KNOWN_CLI_FLAGS).map((n) => n.name);
        if (strayNames.length > 0) {
            writeErr(`dz: unknown option --${strayNames[0]} — run 'dz help' for usage`);
            return 2;
        }
    }
    if (command === '' || command === 'help' || (flags.has('help') && DZ_COMMANDS.includes(command))) {
        write(USAGE);
        return 0;
    }
    // Only registered command identifiers are telemetry. An unknown first argv token may be a path,
    // typo, or secret-like value; persisting it would violate the command-name-only privacy boundary.
    // `contract-check` has an explicit byte-for-byte read-only contract: even the advisory command
    // usage ledger would mutate the repository being audited and invalidate its own safety proof.
    if (command !== 'contract-check') {
        recordCommandInvocation(cwd, DZ_COMMANDS.includes(command) ? command : '', new Date());
    }
    try {
        switch (command) {
            case 'init':
                return await cmdInit(options, flags, cwd, write, writeErr);
            case 'verify':
                return await cmdVerify(options, cwd, write, writeErr);
            case 'sync':
            case 'update':
                return await cmdSync(options, flags, cwd, write, writeErr);
            case 'list':
                return cmdList(options, cwd, write, writeErr);
            case 'create-skill':
                return cmdCreateSkill(options, flags, cwd, write);
            case 'info':
                return cmdInfo(options, { command, options, optionLists, flags }, cwd, write);
            case 'scout':
                return await cmdScout(options, flags, cwd, write);
            case 'workflow':
                // `run` is ASYNC (it drives child processes); every other subcommand stays sync.
                if ((options.get('_positional_0') ?? '') === 'run')
                    return await cmdWorkflowRun(options, optionLists, flags, cwd, write);
                return cmdWorkflow(options, flags, cwd, write);
            case 'workflow-lint':
                return cmdWorkflowLint(options, flags, cwd, write);
            case 'workflow-trace':
                return cmdWorkflowTrace(options, flags, cwd, write);
            case 'migrate':
                return cmdMigrate(options, cwd, write);
            case 'doctor':
                return await cmdDoctor(options, flags, cwd, write);
            case 'install':
                return await cmdInstall(options, flags, cwd, write, writeErr, io.installRunner);
            case 'bundle':
                return cmdBundle(options, flags, cwd, write);
            case 'teach':
                return await cmdTeach(options, flags, cwd, write, writeErr, io.interactive ?? process.stdout.isTTY === true, io.teachGuardRunner ?? teachGuard, io.teachReinforceRunner ?? runTeachGuardReinforcement);
            case 'consolidate':
                return await cmdConsolidate(options, flags, cwd, write);
            case 'recall':
                return await cmdRecall(options, flags, cwd, write, writeErr, io.classMatcher);
            case 'vector':
                return await cmdVector(options, flags, cwd, write);
            case 'brain':
                return await cmdBrain(options, flags, cwd, write, readStdin);
            case 'statusline':
                return cmdStatusline(options, flags, cwd, write, readStdin);
            case 'usage':
                return cmdUsage(options, optionLists, flags, cwd, write);
            case 'chain':
                return cmdChain(options, flags, cwd, write);
            case 'claim-check':
                return cmdClaimCheck(options, optionLists, flags, cwd, write);
            case 'lint':
                return cmdLint(options, flags, cwd, write);
            case 'sign':
                return cmdSign(options, flags, cwd, write);
            case 'sbom':
                return cmdSbom(options, flags, cwd, write);
            case 'guard':
                return cmdGuard(options, flags, cwd, write);
            case 'verify-pack':
                return cmdVerifyPack(options, flags, cwd, write);
            case 'setup':
                return await cmdSetup(options, flags, cwd, write, writeErr);
            case 'pretrain':
                return cmdPretrain(options, cwd, write);
            case 'compose':
                return cmdCompose(options, cwd, write, writeErr);
            case 'diff':
                return cmdDiff(options, cwd, write);
            case 'recommend':
                return cmdRecommend(options, flags, cwd, write);
            case 'upgrade':
                return cmdUpgrade(options, flags, cwd, write, writeErr);
            case 'auto-canonicalize':
                return await cmdAutoCanonicalize(options, cwd, write);
            case 'publish':
                return cmdPublish(options, flags, cwd, write);
            case 'release':
                return cmdRelease(options, flags, cwd, write, io.releaseRunner);
            case 'parity':
                return cmdParity(options, flags, write, writeErr);
            case 'registry':
                return cmdRegistry(options, cwd, write);
            case 'benchmark':
                return cmdBenchmark(options, flags, cwd, write);
            case 'mcp-scan':
                return cmdMcpScan(options, flags, cwd, write);
            case 'sync-upstream':
                return await cmdSyncUpstream(options, flags, cwd, write);
            case 'drift-check':
                return cmdDriftCheck(options, flags, cwd, write);
            case 'hooks-sync':
                return cmdHooksSync(options, flags, cwd, write, writeErr);
            case 'integrations-verify':
                return cmdIntegrationsVerify(options, flags, cwd, write, writeErr);
            case 'agents-sync':
                return cmdAgentsSync(options, flags, cwd, write, writeErr);
            case 'sync-canonical':
                return cmdSyncCanonical(options, flags, cwd, write);
            case 'plugin':
                return cmdPlugin(options, cwd, write);
            case 'downloads':
                return await cmdDownloads(cwd, write);
            case 'stats':
                return cmdStats(cwd, write);
            case 'architecture':
                return cmdArchitecture(options, flags, cwd, write);
            case 'project-skills':
                return cmdProjectSkills(options, flags, cwd, write);
            case 'mr-rakes':
                return await cmdMrRakes(options, flags, cwd, write);
            case 'retro':
                return await cmdRetro(options, flags, cwd, write);
            case 'feature-adr-setup':
                return cmdFeatureAdrSetup(options, flags, cwd, write, writeErr);
            case 'challenge':
                return cmdChallenge(options, flags, cwd, write);
            case 'discrimination-check':
                return cmdDiscriminationCheck(options, flags, cwd, write);
            case 'mutation-gate': {
                try {
                    return cmdMutationGate(options, flags, cwd, write, io.mutationGateRunner);
                }
                catch (error) {
                    const raw = error instanceof Error ? error.message : String(error);
                    const head = Array.from(raw.split(/\r?\n/, 1)[0]?.trim() || 'unknown internal error').slice(0, 160).join('');
                    if (flags.has('json')) {
                        write(JSON.stringify({ verdict: 'INCONCLUSIVE', reason: 'runner-internal-error', error: head, exitCode: 1 }));
                    }
                    else {
                        write(`mutation-gate: INTERNAL ERROR (${head}) — verdict INCONCLUSIVE, exit 1`);
                    }
                    return 1;
                }
            }
            case 'delivery-check':
                return cmdDeliveryCheck(options, flags, cwd, write);
            case 'skills-verify':
                return cmdSkillsVerify(options, flags, cwd, write);
            case 'compounding':
                return cmdCompounding(options, flags, cwd, write);
            case 'deadwood':
                return cmdDeadwood(options, flags, cwd, write, writeErr);
            case 'epoch-replay':
                return cmdEpochReplay(options, flags, cwd, write);
            case 'score':
                return cmdScore(options, flags, cwd, write);
            case 'recap':
                return cmdRecap(options, flags, cwd, write);
            case 'cadence':
                return cmdCadence(options, flags, cwd, write);
            case 'qe-rounds':
                return cmdQeRounds(options, flags, cwd, write);
            case 'restart-advisor':
                return cmdRestartAdvisor(options, flags, cwd, write);
            case 'tg-post':
                return cmdTgPost(options, flags, cwd, write);
            case 'name-check':
                return cmdNameCheck(options, flags, cwd, write);
            case 'provenance-check':
                return cmdProvenanceCheck(options, flags, cwd, write);
            case 'feature-adr-record':
                return cmdFeatureAdrRecord(options, flags, cwd, write);
            case 'amendment-check':
                return cmdAmendmentCheck(options, flags, cwd, write);
            case 'contract-check':
                return cmdContractCheck(options, flags, cwd, write, writeErr);
            case 'feature-adr-checkpoint':
                return cmdFeatureAdrCheckpoint(options, flags, cwd, write);
            case 'profile':
                return await cmdProfile(options, flags, write, writeErr);
            case 'reqe':
                return cmdReqe(options, flags, cwd, write);
            case 'qe-bridge':
                return await cmdQeBridge(options, flags, cwd, write);
            case 'backlog':
                return await cmdBacklog(options, flags, cwd, write);
            case 'routing':
                return cmdRouting(options, flags, cwd, write);
            case 'bto-optimize':
                return cmdBtoOptimize(options, flags, cwd, write);
            case 'dashboard':
                return cmdDashboard(cwd, write);
            case 'roam':
                return cmdRoam(options, flags, cwd, write);
            case 'import-ecc':
                return await cmdImportEcc(options, flags, cwd, write);
            default:
                writeErr(`dz: unknown command ${JSON.stringify(command)} — run 'dz help' for the command list`);
                return 2;
        }
    }
    catch (error) {
        // stderr, not stdout: an uncaught failure is a diagnostic, and routing it through
        // `write` is what made `dz list > skills.txt` write the error into the data file.
        writeErr(`dz: ${error instanceof Error ? error.message : String(error)}`);
        return 1;
    }
}
//# sourceMappingURL=cli.js.map