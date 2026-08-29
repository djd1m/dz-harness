/**
 * `@dzhechkov/harness-core` — shared harness logic behind `@dzhechkov/harness-cli`.
 *
 * @packageDocumentation
 */
import { createRequire } from 'node:module';
/** Package version — single source of truth, read from package.json (no drift). */
export const HARNESS_CORE_VERSION = createRequire(import.meta.url)('../package.json').version;
export * from './skills.js';
export * from './apply.js';
export { bundleSkills } from './bundle.js';
export * from './targets.js';
// Target-parity model (feature target-parity-matrix, ADR-001) — the computed feature×target map.
export { RUNTIME_CAPABILITIES, TARGET_CAPABILITIES, PARITY_FEATURES, TARGET_SHORT_LABELS, GATE_FEATURE_IDS, computeParity, buildParityMatrix, CAPABILITY_EVIDENCE, findUnbackedCapabilities, findStaleTranscriptEvidence, newestRecordedRuntimeVersion, downgradeForStaleEvidence, } from './parity.js';
export * from './operations.js';
// workflows.ts: the ADR-005 templates are RETIRED (feature loop-designer, AM-6) — the module is a
// deprecation shim (empty WORKFLOW_NAMES). BREAKING for external harness-core consumers of
// WorkflowTemplate/WORKFLOWS/getWorkflow — deliberately channeled through the 0.x MINOR bump and
// named in the CHANGELOG; replacement: dz workflow init/validate/render + workflow-lint/-trace.
export * from './workflows.js';
// loop-designer (feature loop-designer): loop-plan/1 schema + generator + lint + trace planes.
export * from './loop-plan.js';
export * from './loop-plan-graph.js';
// loop-run-semantics: the ONE home of the enactment DECISIONS both enactors use — the generated
// Claude-host script (via the always-on `loop-semantics` blob) and `dz workflow run` (by import).
export * from './loop-run-semantics.js';
export * from './loop-render.js';
// dz workflow run (feature dz-workflow-run): the pure scheduler + the dispatcher seam.
export * from './workflow-run.js';
export * from './workflow-run-dispatch.js';
// loop-lint: EXPLICIT export list (QE round-2 G14) — `dominators`, the deliberately-WEAKER
// analysis kept in src/loop-lint.ts solely as AM-1's mutation seam, is NOT part of the published
// API surface; the in-package tests reach it via the module path directly.
export { lint, lintExitCode, postDominators, LINT_RULES, SIZE_BUDGET_WARN_LINES, } from './loop-lint.js';
export * from './loop-trace.js';
export * from './trace-corroborate.js';
export * from './trace-bundle.js';
export { BLOBS as LOOP_BLOBS, LOOP_BLOB_NAMES, BLOB_COVERAGE_MANIFEST } from './loop-blobs.generated.js';
export * from './sign.js';
export * from './skill-schema.js';
export { createSkill } from './create-skill.js';
export { checkUpstream, checkAllUpstream, discoverSourcePackages, loadSourcesManifest } from './sync-upstream.js';
export { sweepSkillDrift, syncCanonicalSkill } from './skill-drift.js';
export { SKILL_INSTALL_ROOTS, SKILL_INSTALL_ROOT_BY_TARGET, DEV_SKILL_ROOT, TARGET_ENRICHMENT_ASSETS } from './skill-install-roots.js';
export { stampCheckpointLine } from './checkpoint-stamp.js';
export { TELEMETRY_VOCAB_VERSION, TELEMETRY_FIELDS, PROVISIONAL_TELEMETRY_FIELDS, LOCAL_FIELD_ALIASES, telemetryFieldFor } from './telemetry-vocabulary.js';
export { planLedgerBackfill, LEDGER_FILL_SOURCE, AMBIGUOUS, resolveLedgerRunId } from './ledger-backfill.js';
// project-skills root resolution (field report doc-25b): the ONE builder behind both the Step-0
// probe and the PS_GUIDANCE paragraph, so the two can never look at different roots again.
export { projectSkillsOneRoot, projectSkillsProbeCommand } from './project-skills-root.js';
export { benchmarkSkill, benchmarkSkills, compareSkills } from './benchmark.js';
export { buildRegistry, searchRegistry, filterByCategory, skillPackBaseDirs, discoverSkillPackDirs, discoverVerifiablePackDirs } from './registry.js';
// Package skill-layout resolution (feature dz-install-npx-init) — the ONE seam that knows where an
// npm package keeps its skills (flat / templates/.claude/skills / skills). `cmdInstall` calls it;
// `dz init`/`dz registry` are the filed follow-up consumers.
export * from './package-skill-layouts.js';
export { recommend } from './recommend.js';
export { pretrain } from './pretrain.js';
export { loadPatterns, loadSessions, computePatternBoost, readLearningConfig, readMemoryLearningConfig, BOOST_CAP, recordPattern, loadStorePatternsSync, loadStoreRecords, patternToRecord, recordToPattern, patternRecordId, patternIdentityOf, dreamRecordId, isMirrorableLearning, consolidateSessions, recallPatterns, pruneNoisePatterns, removePatternsByIds, snapshotStore, readReinforcementState, encodeReinforcementState, reinforcePattern, updateReinforcementState, storeStats, lessonDeltaReport, lessonDeltaMap, readQuarantineState, encodeQuarantineState, promotePatterns, quarantineExpiryCandidates, pruneQuarantinePatterns } from './patterns.js';
export { withStoreLock, withStoreLockSync, storeLockPath, StoreLockTimeoutError, StoreLockCompromisedError, STALE_LOCK_MS, LOCK_TIMEOUT_MS } from './store-lock.js';
export { withNamedLockSync, namedLockPath, isSafeLockName, NamedLockNameError, NamedLockTimeoutError, NamedLockCompromisedError } from './named-lock.js';
export { QE_BRIDGE_SCHEMA, QE_BRIDGE_FAILURE_SCHEMA, CLAUDE_BRIDGE_PROMPT_CEILING_CHARS, KNOWN_CLAUDE, BRIDGE_MARKER, BRIDGE_FENCE_LABEL, BRIDGE_EXTRACT_END, isSafeClaudeId, CLAUDE_ISOLATION_ARGS, BRIDGE_FAILURE_REASONS, extractClaudeResult, buildBridgeSignoffRecord, claudeProbeArgs, interpretClaudeProbe, claudeReviewArgs, defangSignoffEchoes, buildBridgePrompt, parseBridgeOutput, buildBridgeFailureRecord, renderBridgeReport, } from './qe-bridge.js';
export { DEFAULT_REINFORCE_THRESHOLD, NoopLearningBackend, NativeReinforcementBackend, resolveLearningBackend, isLearningSignalBackend, applyLearningSignals, applyLearningSignalsWithDelta, applyLearningSignalsWithTerms } from './learning-backend.js';
// lesson-bandit-rerank (I-8): the ACL's public surface only. The vendored engine class is
// deliberately NOT exported — `selectArm`'s "pick one and commit" is authority this domain denies
// the ranker, and a foreign, invariant-blind API has no business on our safety-critical seam.
export { resolveBanditConfig, payoffTermsFor, recordReward, recordExposures, contextKeyFor, banditStats, renderBanditHealth, narrowBanditReport, loadBanditState, banditStatePath, banditStateDir, freshBanditEnvelope, makeRewardEvent, classifySignal, BANDIT_LOCK_NAME, BANDIT_STATE_SCHEMA } from './lesson-payoff.js';
export { DEFAULT_VECTOR_TIMEOUT_MS, DEFAULT_HARMONIZE_THRESHOLD, REINFORCE_RRF_CAP, BANDIT_RRF_CAP, withVectorTimeout, isVectorNoise, patternVectorEntry, dreamVectorEntry, memoryRecordVectorEntry, readVectorEngineMode, readHarmonizeThreshold, vectorMirrorEnabled, mirrorWriterReason, mirrorWriterExplanation, resolveVectorEngine, mirrorEntriesToVector, mirrorPatternsToVector, backfillVectorMirror, mergeHybridHits, recallHybrid, teachGuard, vectorTierStatus, reindexVectorStore, harmonizeVectorStore, selectClusterKeeper, importRvfCheckpoint, } from './vector-tier.js';
export { runSetup, generateHooksConfig, generateAgentdbWriter, writerVersionOf, AGENTDB_WRITER_VERSION, agentdbStorePath, agentdbMcpStorePath, agentdbStoreSeparationProblem } from './setup.js';
export { statuslineData, readFeatureAdrState, writeFeatureAdrState, featureAdrStateDir, featureAdrStatePath } from './statusline.js';
export { indexPatternsToAgentdb, resolveAgentdbPath, searchAgentdbPatterns, listAgentdbDzIds, resolveAgentdbEmbedder, cosineSimilarity, importVectorsToAgentdb, reindexAgentdbRows, bumpAgentdbUses, clearAgentdbQuarantine, deleteAgentdbByDzIds, readAgentdbRowsByTaskType, DZ_OWNED_TASK_TYPES } from './agentdb-index.js';
export { DEFAULT_EMBED_MODEL, LEGACY_EMBED_MODEL, DEFAULT_EMBED_DIM, KNOWN_EMBED_DIMS, resolveEmbedModel, readEmbedManifest, writeEmbedManifest, embedManifestPath, legacyEmbedManifest } from './embedding-config.js';
export { putBookKnowledge, queryBookKnowledge, bookKbPath } from './book-kb.js';
export { brainHome, brainBooksPath, brainAgentdbPath, brainRegistryPath, readRegistry, writeRegistry, listBrain, promoteProjectToBrain, updateBrainSource, queryBrain, searchBrainVectors, reindexBrainVectors, rerankHits, groundPrompt, expandKu, buildPrimer, writePrimer, readBookKus, exportBrainSlice, importBrainSlice, registerKusToBrain, } from './brain.js';
export { generatePlugin } from './plugin.js';
export { claimCheck, summarize, decideClaimCheckText, severityCounts, isGated } from './claim-check.js';
export { BUNDLED_SLOP_REGISTRY_URL, DEFAULT_SLOP_CONFIG, parseSlopRegistry, slopLint, validateSlopLintConfig, } from './slop-lint.js';
export { hookDecision, isFenced, isNewLine, ESCAPE_TEACHING } from './claim-check-hook-policy.js';
export { step8ClaimGate } from './feature-adr-claim-gate.js';
export { CHECKPOINT_STAGES, STAGE_ARTIFACTS, CHECKPOINT_MAX_RESULT_CHARS, CHECKPOINT_LS_SENTINEL, CKPT_SCHEMA_VERSION, fnv1a, fnv1a64, checkpointInputHash, resumeMode, decideCheckpointResume, serializeCheckpoint, decideCheckpointWrite, parseCheckpointRead, checkpointReadCmd, checkpointAppendCmd, TRAINPAIR_SCHEMA_VERSION, TRAINPAIR_MAX_IO_CHARS, TRAINPAIR_PRIVACY_NOTE, trainingPairFamily, buildTrainingPair, serializeTrainingPair, trainingPairPath, trainingPairAppendCmd, 
// operator-profile (ADR-001 Decision 5): the profile block never reaches .dz/fa-training/.
redactProfileBlock, TP_PROFILE_MARKER_START, TP_PROFILE_MARKER_END, TP_PROFILE_REDACTED, 
// wave1-instrument-repair (ADR-003 Condition 3): the persist allowlist + composite shape check.
codeCheckpointPersistAllowed, codeStageResultShapeValid, } from './feature-adr-checkpoints.js';
// amendment-traceability (ADR-001/002/003): the deterministic half of the Step-8 amendment gate.
export { MIN_MATCHABLE_ID_LENGTH, AMENDMENT_VACUITY_NOTE, normalizeTestId, amendmentSection, planSaysNoAmendments, parseAmendments, resolveAmendments, decideAmendmentOutcome, amendmentVerdictLine, amendmentsMissingFromPlan, amendmentSubject, extractTestTitles, } from './amendment-trace.js';
export { RECORD_MAX_LINE_CHARS, decideRecordWrite, decideReadBack, recordVerdictLine, } from './run-records.js';
export { decidePublishSigning, decidePostSigningVerification, decideSignableSet, publishSigningLine, signableSetLine } from './publish-signing.js';
// contract-checklist (ADR-001): pure extraction, canonical rendering, typed report parsing, and
// exact per-item verification. Filesystem discovery/containment stays in harness-cli.
export { extractContractChecklist, renderContractChecklist, parseContractVerdictReport, verifyContractVerdicts, } from './contract-checklist.js';
export { DOMAIN_LIFT_EXACT, DOMAIN_LIFT_RELATED, normalizeDomain, domainMatch, applyDomainBoost, countDisplacedByCut, renderDomainBoostNote, renderDomainCutNote, } from './recall-domain-boost.js';
export { DEFAULT_HELD_OUT_DOMAINS, applyExportHoldout, canonicalDomainKey, heldOutAfterOptIn, renderHoldoutNote, renderSharedStoreAdvice, decideVectorExport, } from './export-holdout.js';
export { REQE_SCHEMA, REQE_SCOPE, modelFamily, shouldEmitReqeDebt, buildReqeDebt, parseReqeDebt, buildReqeBrief, extractReportGrade, settleReqeDebt, renderReqeList, } from './reqe.js';
export { detectQueryLang, relevanceFloorFor, selectHookHits, renderHookContext, hasEnoughSignal, DEFAULT_RECALL_FLOORS, DEFAULT_RECALL_HOOK_LIMIT, DEFAULT_RECALL_HOOK_BUDGET_CHARS, MIN_PROMPT_CHARS, MIN_CONTENT_TOKENS, closenessLine, anyAboveFloor, } from './recall-hook-policy.js';
export { RECALL_USAGE_LOG_RELATIVE, RECALL_USAGE_LOG_MAX_BYTES, RECALL_USAGE_COMPACT_TARGET_BYTES, formatRecallUsageRecord, buildRecallUsageRecord, parseRecallUsageLog, aggregateRecallUsage, buildRecallUsageReport, shouldCompactRecallUsageLogSize, compactRecallUsageLog, compactRecallUsageLogChecked, appendRecallUsage, countRecallEventsForRun, runtimeOf, RUNTIMES, } from './recall-usage.js';
/* crossrt-2-codex-hooks (leg 2 of umbrella 98ed3967) */
export { mergeManagedHookEntries, hookCommandsOf } from './managed-hooks.js';
export { CODEX_MANAGED_HOOKS, DZ_HOOK_HELPER_VERSION, DZ_HOOK_TIMEOUT_SECONDS, DZ_VETO_MATCHER, buildHookCommand, buildManagedEntries, buildCodexHookManifest, codexHooksPaths, diffCodexHooks, emitterWriteSet, expectedTrustKey, isDzManagedEntry, isSafeForSingleQuote, looksLikeDzEntry, managedByEvent, parseCodexRegistry, parseCodexHookManifest, planCodexHooks, removeCodexHooks, renderTrustBlock, runtimeWriteSet, selectOwnHookMetadata, serializeCodexRegistry, codexHookSha256, trustEventName, upsertTrustBlock, } from './codex-hooks.js';
export { DZ_VETO_MARKER, DZ_VETO_WARN_MARKER, RUNTIME_BLOCK_PHRASE, classifyTrust, classifyVetoProbe, isReadyVerdict, verifyExitCode, } from './codex-hooks-verify.js';
export { SHELL_VETO_RULE_ID, resolveVetoMode, vetoShellCommand } from './shell-veto-policy.js';
export { generateCodexHelpers, generateCodexRecallHelper, generateCodexVetoHelper } from './codex-hooks-assets.js';
export { EVENT_CHAIN_SCOPE, EVENT_CHAIN_GENESIS_HASH, EVENT_CHAIN_TAIL_BYTES, EVENT_CHAIN_FIELD_OVERHEAD_BYTES, EVENT_CHAIN_LEDGER_KIND, EVENT_CHAIN_DEFECT_KINDS, fnv1a32, chainHashOf, chainLinesOf, lastChainLine, readTailInfo, appendChainedLines, EMPTY_LOG_TAIL, nextChainFields, withChainFields, chainRecordLines, chainRewrite, defaultEventWeight, eventWeightOfText, verifyEventChain, verifyEventChainText, renderEventChainVerification, rewriteSnapshot, rewriteSnapshotUnchanged, guardedRewrite, DEFAULT_REWRITE_ATTEMPTS, liveSegmentStart, classifyChainDefects, } from './event-chain.js';
export { decideProvenance, environmentCanMintProvenance, publishArgv, discoverPackages, publishPackages, bumpPatch, compareVersions, findUnpackagedSkills, findUnpublishedWorkspaceFloors, orderByDependencies, syncReadmeVersion, isChangelogEntryLine, changelogRegion } from './publish.js';
export { fetchAllDownloads } from './downloads.js';
export { discoverInstalled, checkUpgrades } from './upgrade.js';
// Verified-release engine (feature release-verified, ADR-001) — pure VERIFY-phase planner +
// classifier in front of the untouched publish path. formatPublishError is re-exported for the
// CLI executor's captured-output discipline.
export { collectPackageFacts, selectAffectedPackages, planReleaseGates, classifyGateExecutions, buildFailureIssue, buildReleaseNotes, releaseTagName, firstOutputLine, RELEASE_GATE_ORDER, RELEASE_TIMEOUTS, } from './release.js';
export { formatPublishError } from './publish.js';
export { computeRiskScore } from './risk-scoring.js';
export { MODEL_PRICES, pricingFor, hasKnownPricing, normalizeUsage, usageCost, invocationCost, costEfficiency, estimateSkillCost, } from './cost-scoring.js';
export { importEcc } from './import-ecc.js';
export { scanMcp, parseGrant } from './mcp-scan.js';
export { detectScriptCapabilities, parseDeclaredCapabilities, parseDeclaredLimits, stripCodeNoise, toolKind, } from './capability-vocab.js';
export { reconcileCapabilities, RECONCILE_BANNER } from './reconcile.js';
export { specToOpts, resolveStageModel, resolveCoderSpec, coderIsCodex, resolveQeSpec, resolveQeSpecForCoder, crossFamilyQe, decideModeBScope, partitionReviewFindings, parseHashProbe, changedFromHashes, changeSetProbeCmd, routingRequested, mergeOpts, DEFAULT_MODELS, KNOWN_CODEX, CLAUDE_NAMES, VALID_REASONING, topCodexId, decideUsageAction, OVERRIDE_REASONING, needsLandedBarrier, codexEffortHint, modelLabel, stageLabel, needsCodeLandedBarrier, codeLandedBarrierPlan, codeLandedBarrierHasLanded, 
// decideCodeLanding was NEVER in this named list (a pre-existing omission found by the ADR-002
// Confirmation-1 sweep). Its `predicate` union NARROWS in this release, which is a breaking change
// to a published output type — so it has to actually BE published to be honest about it.
decideCodeLanding, CODE_LANDED_BARRIER_SLEEPS_SECONDS, 
// wave1-instrument-repair (ADR-003): the landed-barrier honesty surface. This list is NAMED, so a
// missing entry silently drops the export from the published package — ADR-002 Confirmation 1 is
// the test that catches exactly that.
LANDING_PROTOCOL_VERSION, LANDING_HASH_TOKEN, addExpectedCodeTarget, extractExpectedCodeTargetsFromText, sourceExpectedCodeTargets, validateExpectedTargetsBlock, posixCksum, verifyPreCodeBaseline, preCodeBaselineCaptureCmd, parseBaselineCapture, CODE_LANDING_PREDICATES, parseLandingSignal, codeLandingProbeCmd, 
// fa-plan-gate-wiring: the K2 plan-completeness gate halves. NAMED here on purpose — an omission
// silently drops them from the published package (the ADR-002 Confirmation-1 lesson).
PLAN_GATE_SCRIPT, planCompletenessGateCmd, parsePlanGateVerdict, 
// p16-non-js-portability: the gate-script search chain's operator note (ADR-002/AM-7) and the
// dzBin absolutization (ADR-003). Named for the same reason as the three above.
refusalNoteFor, normalizeDzBin, 
// qe-bridge-claude: the bridge's path/slug hygiene reuses these rather than minting a second
// definition of "safe" (ADR-001 D5-A).
isSafeSlug, hasUnsafePathChars, hasDotDotSegment, 
// qe-scoped-review: the two scoped Codex QE dispatch modes + the LOCKED decline taxonomy. NAMED
// one by one on purpose — an omission here silently drops the export from the published package
// while the suite stays green (the ADR-002 Confirmation-1 lesson, re-learnt on 2026-08-21 when a
// fixed export shipped behind two stale workflow mirrors).
CODEX_REVIEW_TIMEOUT_SECONDS, CODEX_REVIEW_DEFAULT_EFFORT, CODEX_TIMEOUT, CODEX_QE_SIGNAL_PREFIX, CODEX_QE_DECLINE_KINDS, SCOPED_QE_MAX_FILES, SCOPED_QE_MAX_QUESTIONS, SCOPED_QE_MAX_PATH_CHARS, SCOPED_QE_MAX_QUESTION_CHARS, SCOPED_QE_PROMPT_MAX_CHARS, isSafeCodexRef, codexReviewCommand, codexExecCommand, codexReviewMissedItsFiles, CODEX_EXEC_TIMEOUT_SECONDS, timeoutBinOrDefault, TIMEOUT_BINS, codexQeSignalCommand, scopedQePrompt, parseCodexReviewSignal, parseCodexReviewFindings, gradeFromReviewFindings, classifyCodexQeOutcome, codexQeDeclineReason, codexDeclineReason, parseCodexReviewResult, } from './feature-adr-routing.js';
export { PARSER_SAFE_REGION_START, PARSER_SAFE_REGION_END, checkParserSafeRegion, } from './parser-safe-region.js';
export { CLAUDE_USAGE_MODELS, computeUsage, deriveUsageCalibration, fixedBlockWindowFor, normalizeClaudeUsageModel, normalizeClaudeUsageModelKey, parseWeeklyResetAnchor, readUsageLimits, weeklyWindowFor, } from './usage.js';
export { claudeProjectsRoot, rawTokenMixOf, weightedTokensOf } from './usage.js';
// Per-stage cost ledger + reconciliation invariant (feature cost-ledger, ADR-001/002/003).
export { COST_LEDGER_SCOPE, COST_LEDGER_DEFECT_KINDS, COST_LEDGER_VERDICTS, DEFAULT_COST_LEDGER_EPSILON, extractCostSamples, parseWorkflowRunRecord, buildCostLedger, verifyCostLedgerReport, stageCostAggregates, renderCostLedger, costLedgerJsonl, listCostLedgerRuns, deriveCostLedger, deriveStageCostAggregates, writeCostLedgerJsonl, } from './cost-ledger.js';
export * from './safla-delta.js';
export * from './architecture.js';
export * from './project-skills.js';
export * from './rake-analyzer.js';
export * from './session-retro.js';
export * from './feature-adr-setup.js';
export * from './challenge-panel.js';
export * from './routing-outcomes.js';
export * from './model-recommender.js';
export * from './bto-optimize.js';
export * from './discrimination-gate.js';
export * from './guard.js';
// Root AGENTS.md policy projection: pure anchor extraction/render/hash drift +
// the shared-emitter I/O entry point exported from operations.
export * from './agents-policy.js';
// Lesson → guard-rule PROMOTION (feature guard-promotion, scout idea #1) — the cost-of-detection
// ladder's elevator: moves a lesson from layer 5 (agent memory) to layer 1 (a deterministic rule),
// but only after TWO consecutive shadow wins replayed over REAL commits. Never synthesises rule code.
export * from './guard-promotion.js';
export * from './delivery-check.js';
// Skill-registration gate (feature skills-verify, ADR-001) — static layout scan + the deterministic
// `system/init` listing. Fail-closed: an unobservable registration is `inconclusive`, never `pass`.
export * from './skills-verify.js';
// Learning-loop payoff measurement (feature compounding, scout C2) — seeded stats ported verbatim
// from darwin-mode; measurements are dz-native and NEVER fake a verdict (INSUFFICIENT_DATA is a
// finding, not a pass).
export * from './compounding.js';
// Advisory command-invocation telemetry + deadwood report (feature dz-deadwood).
export * from './cmd-usage.js';
// Cold-vs-warm EPOCH RUNNER (feature epoch-replay, scout idea #4) — the RESULT leg to compounding's
// readiness leg. Orchestrates + scores; never calls a model. SUPPORTED requires two DISJOINT Wilson
// intervals; INCONCLUSIVE is a first-class honest outcome.
// NOTE: `replayableInstances` / `ReplayInstance` are OWNED by compounding.js and merely re-exported
// there, so this star-export must not re-export them again (duplicate-export error).
export { WILSON_Z, MIN_INSTANCES, FALSIFY_NO_LIFT_MIN_N, NO_LIFT_MARGIN, MARGIN_MAX, MARGIN_MIN_EXCLUSIVE, DIGEST_HONEST_SCOPE, WORK_ORDER_KIND, WORK_ORDER_VERSION, DEFAULT_WORD_MIN, DEFAULT_WORD_MAX, DEFAULT_MOCK_N, DEFAULT_MOCK_SEED, wilsonInterval, liftInterval, corpusFingerprint, isValidMargin, workOrderDigest, verifyWorkOrder, buildWorkOrder, buildJudgePrompts, unblindJudgments, scoreEpochReplay, generateMockOutcomes, renderEpochReplayResult, renderWorkOrderSummary, renderJudgePromptsSummary, } from './epoch-replay.js';
// Run-process scorecard (feature dz-score, Reading C) — scores the DISCIPLINE of a feature-adr run
// from its artifacts. Descriptive-only, permanently: it never gates.
export * from './score.js';
export * from './recap.js';
export * from './provenance.js';
export * from './name-check.js';
export * from './cli-flag-notice.js';
export * from './tg-post.js';
// Mutation gate (feature ha-mutation-gate) — deliberately break each NAMED protection in a scratch
// copy, run the suite, REQUIRE red. Proves a test DISCRIMINATES, not merely that it is green.
// Pure half of `dz mutation-gate`; the copy/run/restore I/O lives in the CLI executor.
export * from './mutation-gate.js';
// Smart Backlog (feature smart-backlog) — goal-directed idea pipeline: capture → semantic dedup
// against the EXISTING Brain vector engine (ADR-001, no 2nd store) → GoalMap alignment (ADR-003) →
// weighted roulette (ADR-004) → idea2prd enrich hand-off → stub-first Jira adapter seam (ADR-006).
export * from './backlog.js';
// no-stubs (backlog 0b403a0106103901) — deterministic unfinished-stub-marker scan over the
// CHANGE-SET, wired as the `no-stubs` SOFT publish guard rule + the feature-adr Step-8 QE item.
export * from './no-stubs.js';
export { quiescenceProbeScript, decideWriterQuiescence, WQ_WINDOW_SECONDS, WQ_MAX_WINDOWS, WQ_REQUIRED_QUIET } from './writer-quiescence.js';
export { decideCadenceWindow, isoWeekOf, weeklyBuckets, guardRepeatDecay, buildCadenceReport, CADENCE_WINDOW_DAYS } from './cadence.js';
export { readQeRounds, countQeRounds, QE_ROUNDS_DEFAULT_CEILING } from './qe-rounds.js';
export { adviseRestart, decideRestartRecommendation, parseCheckpointQeHistory, parseTrainingPairQeHistory, renderRestartDecisionLog, RESTART_ADVISOR_SCHEMA, RESTART_ADVISOR_MAX_DIAGNOSTICS, RESTART_ADVISOR_MAX_EVIDENCE, } from './restart-advisor.js';
export { describeStoreLocation, storeLocationLine } from './store-location.js';
export { mergeStoreHits, sameStore, globalStoreRoot, storeCountLabel } from './store-merge.js';
export { resolveTeachTarget, teachReasonPhrase, readTeachToConfig, TeachTargetError, TEACH_STORES } from './teach-target.js';
export { probeNativeDep, describeNativeDep, exerciseSqliteOpen } from './native-dep-probe.js';
// Operator profile (feature operator-profile, ADR-001) — WHO the assistant is talking to: a
// per-user 0600 store under homedir(), rendered into a marked block in ~/.claude/CLAUDE.md
// (layer 2 — loaded in every project, no dz required). The register changes FORM, never FACTS.
export { renderProfileBlock, readProfile, writeProfile, validateProfile, profileStorePath, claudeMdPath, syncProfileBlock, checkProfileDrift, mergeProfileBlock, extractProfileBlock, wrapProfileBlock, parseRegister, registerOwnerWord, profileAgeDays, parseDomainList, domainListText, parseYesNo, PROFILE_MARKER_START, PROFILE_MARKER_END, REGISTERS, } from './profile.js';
//# sourceMappingURL=index.js.map