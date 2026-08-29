/**
 * feature-adr per-stage model routing — the pure resolution core.
 *
 * This is the TESTABLE mirror of the routing block inlined into the
 * `.claude/workflows/feature-adr.js` workflow (and its byte-identical
 * skills-feature-adr template copy). The workflow is a top-level-`await`
 * SCRIPT, not an importable module — the pipeline runs on import — so the
 * pure helpers cannot be `import`-ed from it directly. Instead the workflow
 * INLINES a byte-equivalent copy of the function bodies below, and
 * `feature-adr-model-routing.test.ts` asserts the inline copy is
 * string-equivalent to this module (a drift guard tying the tested code to
 * the shipped code), then exercises these exports for the load-bearing
 * behavioral assertions (LB-A/B/C, AC-1…AC-6).
 *
 * The load-bearing property: a model that WRITES code must not also SELF-QE.
 * When `args.models.qe` is unset, the QE stage is auto-routed to the OTHER
 * family than the resolved coder (codex-coder → Claude `sonnet`; Claude-coder →
 * the Codex-budget cell, or `opus` if codex is unavailable — never a block).
 *
 * DESIGN CONSTRAINT — the Workflow parser is STRICTER than `node --check`
 * (no nested template literals, no inline `cond ? agent() : null` in arrays).
 * The function BODIES here are written parser-safe (string `+` concat, explicit
 * `if`/return, object-literal data tables) so the same source can be inlined
 * verbatim into the workflow. Keep this module and the workflow's inline block
 * in lock-step.
 *
 * @packageDocumentation
 */
/** Blob version stamp read by scripts/gen-loop-blobs.mjs (feature loop-designer, ADR-004) — the
 * ONLY loop-designer change to this canonical file; bump when any blob-exported semantic changes. */
export declare const BLOB_VERSION = "1.0.0";
/** A resolved `agent()` opts fragment: either a Claude `{model}` or a codex spec. */
export interface StageOpts {
    readonly model?: string;
    readonly agentType?: string;
    readonly codexModel?: string;
    readonly _reasoning?: string;
    /**
     * Observability marker set ONLY when the usage-adaptive override chose this stage's codex spec
     * (not on a user's explicit codex routing). `modelLabel` appends ` (usage-switched)` when present
     * so the switch is auditable in `modelsUsed` (AC-6).
     */
    _usageSwitched?: boolean;
}
/** The knobs `resolveStageModel` closes over — passed in from the workflow. */
export interface RoutingEnv {
    /** `args.models` — the per-stage override map (may be empty). */
    readonly MODELS: Record<string, string | null | undefined>;
    /** `args.codexModel` default id (default `'auto'`). */
    readonly CODEX_MODEL: string;
    /** Resolved legacy coder knob: `'claude' | 'codex' | 'codex-fallback'`. */
    readonly CODER: string;
    /** Resolved legacy qeReviewer knob: `'claude' | 'codex' | 'codex-fallback'`. */
    readonly QE_REVIEWER: string;
    /** `args.planner` shortcut (only `'codex'` is meaningful). */
    readonly PLANNER?: string;
    /**
     * Whether codex is available at qe-resolution time. Defaults true; the caller
     * passes `false` (from a pre-flight probe / `A.codexAvailable===false`) to force
     * the cross-model QE default to fall back to a Claude reviewer instead of codex.
     */
    readonly codexAvailable?: boolean;
    /** Optional log sink (the workflow passes its `log`); defaults to a no-op. */
    readonly log?: (msg: string) => void;
    /**
     * USAGE-ADAPTIVE override bit (env-threaded, non-global — LOCKED L-5). When true,
     * `resolveStageModel` routes ALL stages to `codex:<topCodexId>` REGARDLESS of `MODELS`/knobs.
     * The single mutable `let usageOverride` lives ONLY in the workflow script; the library stays
     * pure — the state travels through THIS field, never a module-level global. Absent/undefined ⇒
     * byte-identical resolution to the pre-feature behavior (NFR-2 / AC-4).
     */
    readonly usageOverride?: boolean;
    /**
     * Per-stage reasoning for the usage-override spec (merged OVER {@link STAGE_EFFORT}).
     * `args.usageReasoning` — stage → a supported reasoning level; a single stage may be overridden without
     * touching the others.
     */
    readonly usageReasoning?: Record<string, string>;
    /** Raw `args.budget`: a named preset or a per-family object. */
    readonly budget?: unknown;
    /** The productive family for design + code; absent defaults to Claude. */
    readonly primary?: 'claude' | 'codex';
}
/** A probe reading. `null` on a pct ⇔ that limit is unconfigured (unknown — never a guess). */
export interface UsageSignal {
    readonly sessionPct: number | null;
    readonly weeklyPct: number | null;
}
/**
 * The LOCKED 6-value action vocabulary (L-1). `decideUsageAction` emits the first five (probe
 * path); `'reactive-switch'` is pushed only by the workflow's belt sites — one shared type, no
 * parallel enums.
 */
export type UsageAction = 'none' | 'switch' | 'restore' | 'keep' | 'fail-safe-switch' | 'reactive-switch';
/** The `decideUsageAction` verdict: the new override bit + the event action. */
export interface UsageDecision {
    readonly override: boolean;
    readonly action: UsageAction;
}
/**
 * GPT-5.6 reasoning ladder used by the routing tables. The model default is `medium`; `xhigh`
 * and `max` stay valid explicit values but are absent from shipped defaults until evals justify them.
 */
export type ReasoningLevel = 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export declare const STAGE_EFFORT: {
    override: Record<string, ReasoningLevel>;
};
/** One-release compatibility alias for existing public imports. */
export declare const OVERRIDE_REASONING: Readonly<Record<string, ReasoningLevel>>;
/** The flagship Codex id, independent of the spellability allowlist's insertion order. */
export declare function topCodexId(env: RoutingEnv): string;
/**
 * The PURE hysteresis core (the load-bearing safety property, AC-1). Given the previous override
 * bit, a probe signal (or `null` when the probe agent itself DIED), and the threshold, decide the
 * new override bit + the event action. Total function — no input throws or returns an
 * out-of-vocabulary action.
 *
 * The load-bearing asymmetry (INV-2):
 *   - **agent-null** (`signal === null`, the probe dispatch died — OFTEN MEANS limits) ⇒ fail-safe
 *     switch TO codex (OFF→ON), or `keep` if already overridden.
 *   - **value-null** (a pct is `null` — limits unconfigured / garbled) ⇒ flips NOTHING: never
 *     switches a fresh run to codex AND never restores an active override (unknown ⇒ hysteresis, no
 *     flapping).
 *   - `>= threshold` on EITHER known metric ⇒ switch (OFF→ON) / keep (ON stays ON). Boundary `= 70`
 *     counts as over (`>=`).
 *   - ONLY a positive BOTH-below reading (both pcts known and `< threshold`) clears an override
 *     (`restore`); from OFF it is `none`.
 *
 * Non-finite pcts (`NaN`, negatives from a garbled probe) are treated as value-null.
 */
export declare function decideUsageAction(prevOverride: boolean, signal: UsageSignal | null, threshold: number): UsageDecision;
/** Known codex ids. Adding a new id (e.g. `'gpt-5.7'`) is a DATA-ONLY change. */
export declare const KNOWN_CODEX: Record<string, number>;
export type CodexTier = 'flagship' | 'workhorse' | 'high-volume';
/**
 * Capability tiers are routing data, separate from {@link KNOWN_CODEX}'s spellability role.
 * The allowlist is not an availability check — probe every id before every run
 * (`codex exec -m <id> "Reply with exactly: OK"`); ids drift in both directions on a
 * timescale of days (probed 2026-08-18: 3 ids HTTP 400; probed 2026-08-29: all 3 exit 0).
 */
export declare const CODEX_TIERS: Record<CodexTier, string>;
export declare function codexIdForTier(tier: CodexTier, env: RoutingEnv): string;
export type BudgetLevel = 'normal' | 'eco';
export interface BudgetAxis {
    readonly claude: BudgetLevel;
    readonly codex: BudgetLevel;
}
export declare const BUDGET_PRESETS: Record<'normal' | 'eco' | 'hybrid', BudgetAxis>;
export declare function resolveBudgetMode(raw: unknown): BudgetAxis;
export declare function budgetPresetName(axis: BudgetAxis): 'normal' | 'eco' | 'hybrid' | null;
/** The Claude model names the Workflow runtime accepts as `agent()` `model`. */
export declare const CLAUDE_NAMES: Record<string, number>;
/**
 * The codex-companion `--effort` vocabulary. `minimal` remains temporarily for compatibility
 * until a live companion probe establishes whether it can be retired; `max` is part of GPT-5.6's ladder.
 */
export declare const VALID_REASONING: Record<string, number>;
/**
 * The proven DEFAULT TABLE, applied only when the user opts into routing.
 * `code`/`qe` are `null` SENTINELS: their defaults are DERIVED (the coder knob /
 * the cross-model rule), not fixed model names.
 */
export declare const DEFAULT_MODELS: Record<string, string | null>;
type FamilyRoutingTables = Record<'claude' | 'codex', Record<BudgetLevel, Partial<Record<string, string | null>>>>;
/** Four family half-tables; presets compose the Claude and Codex halves independently. */
export declare const ROUTING_TABLES: Record<'claude' | 'codex', FamilyRoutingTables>;
export declare function budgetTable(primary: 'claude' | 'codex', mode: BudgetAxis, env: RoutingEnv): Partial<Record<string, string | null>>;
/** Optional Claude precision review after A-normal's recall-oriented Sonnet QE. */
export declare function qePrecisionPassSpec(primary: 'claude' | 'codex', budget: BudgetAxis, tier: 'S' | 'M' | 'L' | 'XL', _env: RoutingEnv): string | null;
/** Build/test-time guard for the matrix's load-bearing cross-family property. */
export declare function assertCrossFamilyQe(codeSpec: string | null, qeSpec: string | null): void;
/**
 * Turn a compact model SPEC into `agent()` opts.
 *   - falsy               → `{}`               (session-inherited — the BC path)
 *   - `'codex[:id[:r]]'`  → `{agentType:'codex:codex-rescue', codexModel, _reasoning}`
 *   - `'fable'|'opus'|…`  → `{model}`
 *   - unknown             → warn + `{}` (Claude) / `CODEX_MODEL` (codex id)
 */
/**
 * The learned cost-optimal routing spec (feature learned-cost-routing). A stage whose spec is `'auto-cost'`
 * is resolved by the WORKFLOW against the live outcome store + probed ladder (I/O there; pure selection in
 * `routing-outcomes.ts`), NOT here — so `specToOpts`/`resolveStageModel` stay byte-identical when it is absent.
 * `specToOpts('auto-cost')` deliberately degrades to session-inherited if it ever leaks through.
 */
export declare const AUTO_COST_SPEC = "auto-cost";
export declare function isAutoCostSpec(spec: string | null | undefined): boolean;
export declare function specToOpts(spec: string | null | undefined, env: RoutingEnv): StageOpts;
/**
 * Fold the legacy `coder` knob into a spec:
 *   `codex`/`codex-fallback` → `'codex:' + CODEX_MODEL + ':high'`; else `'opus'`.
 * NOTE: a DIRECT `MODELS.code` spec bypasses this (handled in `resolveStageModel`);
 * this only maps the KNOB, which is why `coderIsCodex` (below) also inspects `MODELS.code`.
 */
export declare function resolveCoderSpec(env: RoutingEnv): string;
/**
 * Whether the RESOLVED coder is the codex family — true when the coder knob is
 * codex/codex-fallback OR a direct `MODELS.code` spec is a codex spec. The
 * cross-model QE default derives from THIS (not the knob alone), so a direct
 * `MODELS.code='codex'` still routes QE to Claude (never codex-self-QE).
 */
export declare function coderIsCodex(env: RoutingEnv): boolean;
/**
 * The CROSS-MODEL QE default (load-bearing). Called only when `MODELS.qe` is
 * unset. Resolves to the OTHER family than the coder:
 *   - coder is codex  → `'sonnet'` (the recall-oriented Claude reviewer)
 *   - coder is Claude → the Codex-budget cell (`sol:high` or `terra:medium`),
 *     or `'opus'` when Codex is unavailable (never block)
 * A pinned `CODEX_MODEL` still outranks the tier selected by the budget table.
 */
export declare function resolveQeSpecForCoder(coderCodex: boolean, env: RoutingEnv): string;
export declare function resolveQeSpec(env: RoutingEnv): string;
/**
 * Whether the caller opted into routing at all. When FALSE (no axes, `args.models`,
 * or Codex knobs), every Claude stage resolves to `{}` → byte-identical to today.
 */
export declare function routingRequested(env: RoutingEnv): boolean;
/**
 * Whether the Step-8 QE reviewer should be CODEX. This is the load-bearing cross-model gate — it must
 * NEVER let the model that wrote the code also self-QE. Order:
 *   1. an explicit `MODELS.qe` spec wins outright (user opt-in — even a codex qe against a codex coder).
 *   2. else the legacy `QE_REVIEWER==='codex'` knob asks for codex, but is HONORED ONLY when the coder is
 *      NOT codex — a codex coder + `qeReviewer:'codex'` would be codex-self-QE (the anti-pattern this whole
 *      feature exists to prevent), so cross-model wins and QE stays Claude.
 *   3. else fall to the cross-model DEFAULT (`resolveQeSpec`): codex iff the coder is Claude & codex is
 *      available & routing was opted into. No routing → false → today's Claude QE (byte-identical BC).
 * NOTE: the previous inline gate re-added `QE_REVIEWER==='codex'` AFTER the safe resolver, so a codex
 * coder with the legacy knob silently self-QE'd. This function is the single tested source of that truth.
 */
export declare function qeShouldUseCodex(env: RoutingEnv): boolean;
/**
 * Resolve a stage to its `agent()` opts fragment.
 *   1. explicit `MODELS[stage]` wins
 *   2. else if the user did NOT opt into routing → `{}` (byte-identical BC path)
 *   3. else the primary × per-family-budget table fills the gap
 *   4. `code`/`qe` `null` sentinels resolve via the coder / cross-model rules
 */
export declare function resolveStageModel(stage: string, env: RoutingEnv): StageOpts;
/**
 * Does a DESIGN/PLAN stage (one that writes an artifact FILE a later stage then reads) need a
 * Codex-landed barrier before its consumer runs?
 *
 * Codex applies writes OUT-OF-BAND — the codex-rescue subagent returns a stub and the file lands
 * asynchronously when it picks `--background` — so without a wait a downstream stage can read an
 * empty/absent artifact (the same race the Step-7.5 code barrier already guards). The barrier
 * engages ONLY when the stage resolved to Codex. A Claude stage is synchronous (the file is on disk
 * the moment `agent()` returns), so this returns `false` and the workflow does ZERO extra work — no
 * barrier agent is ever spawned. Therefore an all-Claude run, and a Claude-design + Codex-QE run
 * (QE writes no consumed design artifact), are byte-identical to today.
 */
export declare function needsLandedBarrier(opts: StageOpts | null | undefined): boolean;
/**
 * The per-call Codex effort hint. Codex-rescue maps this prompt instruction to
 * `codex-companion.mjs task --effort <reasoning>`, so the resolved per-stage `_reasoning`
 * is no longer only a `modelsUsed` label. Non-Codex stages return an empty string, preserving
 * the routing-off and Claude-stage prompt text exactly.
 */
export declare function codexEffortHint(opts: StageOpts | null | undefined): string;
export declare const DEFAULT_CODE_LANDING_MAX_WAIT_MS = 1020000;
export declare const DEFAULT_CODE_LANDING_BACKOFF_MS: readonly [1000, 2000, 2000, 5000, 5000, 10000, 10000, 15000, 20000, 25000, 25000, 30000, 30000, 60000, 60000, 60000, 90000, 90000, 120000, 120000, 120000, 120000];
export declare const CODE_LANDED_BARRIER_SLEEPS_SECONDS: number[];
export type CodeLandedBarrierCoder = 'claude' | 'codex' | 'codex-fallback';
/** Probe-side landing status. `'inconclusive'` (NEW) is the honest fourth state: the barrier RAN
 *  but established nothing — an empty target set, an unverifiable baseline, a dead or unparseable
 *  probe. Pre-epoch there were only three values, so "the instrument did not answer" had to be
 *  spelled as one of the three answers, and it was spelled `landed`. */
export type CodeLandingStatus = 'landed' | 'not-yet-flushed' | 'genuinely-not-landed' | 'inconclusive';
/** Code-STAGE result domain (ADR-003 Condition 3). `'synchronous'` is deliberately NOT in the probe
 *  union: only the non-barrier (Claude-coder) branch may set it, so a codex run can never LABEL its
 *  way past the persist allowlist. `'not-yet-flushed'` is likewise absent — it is a mid-poll state,
 *  never a stage outcome. */
export type CodeStageLandingStatus = 'landed' | 'genuinely-not-landed' | 'inconclusive' | 'synchronous';
/** Bumped whenever the landing protocol's meaning changes. Recorded on every code-stage result so a
 *  pre-protocol checkpoint reads as no-checkpoint instead of resuming into new semantics. */
export declare const LANDING_PROTOCOL_VERSION = 2;
/** R6: salted into the code stage's checkpoint hash PARTS (not the schema version — ADR-003 keeps
 *  `CKPT_SCHEMA_VERSION` at 'fa-ckpt-2' deliberately, so ONLY the code stage re-runs). */
export declare const LANDING_HASH_TOKEN = "landing-v2";
/** Why a landing verdict is INCONCLUSIVE. Typed, because "we do not know" needs to say WHICH
 *  unknown — the operator repair differs per reason and a single untyped bucket reads as noise. */
export type LandingInconclusiveReason = 'empty-plan-block' | 'override-unpollable' | 'no-plan-block' | 'no-baseline' | 'baseline-unverified' | 'probe-failure' | 'malformed-signal';
export interface GitStatusEntry {
    readonly raw: string;
    readonly path: string;
    readonly status?: string;
    readonly previousPath?: string;
}
export interface CodeLandingSnapshot {
    readonly elapsedMs: number;
    readonly maxWaitMs: number;
    readonly expectedPaths: readonly string[];
    readonly changedEntries: readonly GitStatusEntry[];
    /** the pre-Step-7 baseline. Absent/null ⇒ 'no-baseline' (the delta cannot be computed). */
    readonly baseline?: BaselineVerification | null;
    /** path → `git hash-object` NOW, for the paths in `changedEntries`. */
    readonly currentHashes?: Readonly<Record<string, string>>;
}
export interface CodeLandingDecision {
    readonly status: CodeLandingStatus;
    readonly reason?: LandingInconclusiveReason;
    readonly changed: number;
    readonly elapsedMs: number;
    readonly elapsedSeconds: number;
    readonly expectedPaths: readonly string[];
    /** NEWLY-CHANGED matches only — a path that was already dirty before the coder ran is not a match. */
    readonly matchedExpectedPaths: readonly string[];
    readonly changedPaths: readonly string[];
    /** `'expected-path'` and `'any-code-change'` are DELETED with their branches (ADR-003 / H4):
     *  matching an ESTABLISHED target is now the only landing predicate, and "any code change" was
     *  the fallback that read an unrelated dirty file as Codex's work. */
    readonly predicate: 'newly-changed' | 'no-expected-targets' | 'empty-before-timeout' | 'empty-after-timeout';
    readonly qeSignalLine: string;
}
export declare const CODE_LANDING_PREDICATES: readonly CodeLandingDecision["predicate"][];
export interface CodeLandedBarrierPlan {
    readonly enabled: boolean;
    /** `'any-code-change'` survives ONLY as the disabled-barrier placeholder — it is unreachable
     *  while `enabled` is true (an enabled barrier with no targets is now `'inconclusive'`). */
    readonly mode: 'expected-files' | 'any-code-change' | 'inconclusive';
    /** set iff mode === 'inconclusive'. */
    readonly inconclusiveReason?: LandingInconclusiveReason;
    readonly sleepsMs: readonly number[];
    readonly sleepsSeconds: readonly number[];
    readonly pollWindowMs: number;
    readonly pollWindowSeconds: number;
    readonly expectedPaths: readonly string[];
    readonly emptySignal: string;
}
export declare function needsCodeLandedBarrier(coderUsed: string | null | undefined): boolean;
/** Why a declared expected-target line was refused. Pre-epoch `normalizeCodeLandingPath` returned
 *  `''` for every reject with NO reason, so a plan whose whole block was mistyped looked exactly
 *  like a plan with no block — and both degraded to "any code change counts". */
export type ExpectedTargetRejectReason = 'empty-after-strip' | 'absolute-path' | 'traversal' | 'pipeline-artifact-path' | 'not-a-path';
export interface ExpectedTargetsValidation {
    /** the EXPECTED_CODE_TARGETS: block exists in the plan text at all. */
    readonly present: boolean;
    readonly accepted: readonly string[];
    readonly rejected: readonly {
        readonly line: string;
        readonly reason: ExpectedTargetRejectReason;
    }[];
}
export declare function normalizeCodeLandingPath(path: string): string;
export declare function filterPollableCodePaths(paths: readonly string[]): readonly string[];
export declare function codeLandedBarrierPlan(coderUsed: string | null | undefined, expectedPaths?: readonly string[], inconclusiveReason?: LandingInconclusiveReason): CodeLandedBarrierPlan;
export interface SourcedCodeTargets {
    /** the match set IS the established set — a path that did not ESTABLISH cannot MATCH. */
    readonly targets: readonly string[];
    readonly establishedBy: 'args' | 'plan' | null;
    readonly reason?: 'override-unpollable' | 'empty-plan-block' | 'no-plan-block';
    /** what the coder SAID it would write. Diagnostic only: NEVER unioned into targets, NEVER matched.
     *  Pre-epoch this was unioned in, which let the agent under test declare its own success criteria. */
    readonly scrapeDiagnostic: readonly string[];
}
/** Flatten the many shapes an expected-target value arrives in (string, array, {wrote}, {paths}). */
export declare function addExpectedCodeTarget(value: unknown, out: string[]): void;
/** Read the `EXPECTED_CODE_TARGETS:` block out of arbitrary text. The block ends at the next
 *  ALL-CAPS heading line — the shared grammar, used for BOTH the plan block (which establishes)
 *  and the Codex scrape (which only ever diagnoses). */
export declare function extractExpectedCodeTargetsFromText(text: string | null | undefined): string[];
/**
 * Where the barrier's expected targets come from, in ADR-003's precedence: an explicit non-empty
 * ARGS override REPLACES the plan (never unions with it); otherwise the PLAN's block establishes;
 * the Codex scrape establishes NOTHING.
 *
 * The override is NARROWING-ONLY on purpose: args provided but all-unpollable returns an EMPTY
 * target set with reason 'override-unpollable' and does NOT fall through to the plan. A silent
 * fall-through would mean "I asked you to watch exactly these files" quietly became "watch the
 * plan's files", i.e. the operator's narrowing was ignored without a word.
 */
export declare function sourceExpectedCodeTargets(argTargets: unknown, planBlockText: string | null, codexText: string): SourcedCodeTargets;
/**
 * Line-level validation of the plan's block at the Step-6/7 boundary (R13) — BEFORE Step 7 spends
 * tokens. Every rejected line is reported WITH its reason, so a whole-block typo can never present
 * as "no block declared".
 */
export declare function validateExpectedTargetsBlock(planText: string | null): ExpectedTargetsValidation;
export interface BaselineEntry {
    /** `git hash-object` of the path at capture time; `'-'` when unhashable (deleted, unreadable). */
    readonly hash: string;
    readonly path: string;
}
export interface BaselineVerification {
    readonly ok: boolean;
    readonly reason?: 'no-baseline' | 'baseline-unverified';
    /** [] unless ok — a baseline that failed verification has no usable entries, by construction. */
    readonly entries: readonly BaselineEntry[];
}
/**
 * POSIX `cksum` CRC (polynomial 0x04C11DB7, length-augmented, final complement) — the PURE twin of
 * the shell trailer the capture command writes. Known vector: the empty body is 4294967295, and the
 * test suite cross-checks one fixture against a REAL `cksum` run (H7) so the twin cannot drift.
 */
export declare function posixCksum(body: string): number;
/**
 * Parse + VERIFY a captured baseline. The trailer (`count=<n> cksum=<c>`) is not decoration: a
 * baseline is the only thing standing between "this path changed" and "this path was ALREADY dirty
 * when the coder started", so a truncated or edited baseline must read as UNKNOWN, never as a
 * smaller-but-fine baseline. Every trailer failure collapses to 'baseline-unverified'.
 *
 * A valid trailer with ZERO entries is OK — that is a clean tree, a real and common state.
 */
export declare function verifyPreCodeBaseline(text: string | null | undefined): BaselineVerification;
/** Parsed verdict of a baseline CAPTURE attempt (QE F2). The capture agent's stdout is a signal the
 *  workflow must READ, not a formality: a capture that failed leaves either no file or a stale one
 *  from an earlier attempt, and both make the barrier's later answer meaningless. */
export interface ParsedBaselineCapture {
    readonly ok: boolean;
    /** the baseline file THIS attempt actually wrote, as reported by the capture itself. */
    readonly path: string | null;
    readonly entries: number | null;
    readonly cksum: number | null;
    readonly reason?: 'capture-failed' | 'no-signal' | 'unsafe-path';
}
/** PARSE-NEVER-SYNTHESIZE for the capture step: empty/garbage stdout is `no-signal`, an explicit
 *  failure line is `capture-failed`, and ONLY a well-formed `BASELINE-CAPTURED entries=<n>
 *  cksum=<c>` line is success. Never infer success from the absence of an error. */
export declare function parseBaselineCapture(text: string | null | undefined, expectedPrefix?: string): ParsedBaselineCapture;
/**
 * The shell the capture agent runs immediately BEFORE the coder is dispatched.
 *
 * FAIL-CLOSED (QE F2), at EVERY step. The pre-fix pipeline sent `git status` through a pipe with
 * its stderr discarded and its exit status unchecked, so a FAILED status call produced an empty
 * path list and therefore a checksum-VALID, ZERO-ENTRY baseline — a baseline that verifies
 * perfectly and claims the tree was clean. Every later path then looks absent-from-baseline, i.e.
 * newly changed, i.e. LANDED. Round-2 QE found the SAME shape one layer down: the five transforms
 * after the status call were themselves an unchecked pipeline. So each step now writes its own file
 * and its status is checked individually; any failure emits `BASELINE-CAPTURE-FAILED` and writes
 * NOTHING. The file is published (atomic `mv`) only after the
 * trailer is written, so a failed attempt leaves the previous state untouched rather than a
 * half-baseline — and the caller must PARSE the success signal (`parseBaselineCapture`) rather than
 * assume the file on disk belongs to this attempt.
 *
 * ATTEMPT-UNIQUE, decided SHELL-SIDE (QE F2). A single stable path let a baseline from an EARLIER,
 * failed attempt survive and be read by a later probe as if it belonged to that run — and a stale
 * baseline verifies perfectly while answering about a tree it never saw. The caller passes a
 * PREFIX; the shell appends `$(date +%s).$$` and REPORTS the path it wrote, so the only path any
 * consumer can use is the one this execution produced. The uniqueness cannot be generated by the
 * caller: the workflow that calls this runs in a sandbox with no clock and no randomness (INV-12 —
 * `Date.now(` and `Math.random(` are lint-banned there, MEASURED via `loop-lint`), so a
 * caller-side stamp would be a token that cannot exist at the only call site that needs it.
 *
 * `--untracked-files=all` (QE F3) is load-bearing, not tidiness: without it a brand-new file inside
 * a brand-new directory is reported as `?? dir/` — the DIRECTORY, not the file — and the barrier's
 * exact-match predicate can never match the expected path.
 */
export declare function preCodeBaselineCaptureCmd(repo: string, baselinePathPrefix: string): string;
export declare function codeLandedBarrierHasLanded(changedPaths: readonly string[], expectedPaths?: readonly string[], baseline?: BaselineVerification | null, currentHashes?: Readonly<Record<string, string>>): boolean;
export declare function decideCodeLanding(snapshot: CodeLandingSnapshot): CodeLandingDecision;
export interface ParsedLandingSignal {
    readonly status: 'landed' | 'genuinely-not-landed' | 'inconclusive';
    readonly reason?: LandingInconclusiveReason;
}
/**
 * PARSE-NEVER-SYNTHESIZE, applied to the barrier the same way ADR-001 applies it to a QE verdict:
 * a probe that returned nothing, or text with no signal line, is NOT a clean "not landed" and NOT
 * a landed — it is `inconclusive` with the reason naming which failure it was. An unknown status
 * token (including a stray mid-poll `not-yet-flushed` reaching a terminal position) is malformed,
 * never trusted. Every consumer reads THIS function's output; no consumer re-regexes the note.
 */
export declare function parseLandingSignal(probeText: string | null | undefined): ParsedLandingSignal;
/**
 * The probe shell (pure half of the workflow's inline copy). Obligations, in order:
 *
 *   1. mode 'inconclusive' short-circuits — polling with no established target is exactly what
 *      produced the false "any code change" landing verdict.
 *   2. VERIFY the baseline trailer BEFORE any absent-from-baseline reasoning, because a truncated
 *      baseline makes every missing path look newly changed, i.e. makes everything look LANDED.
 *   3. only then poll with the newly-changed predicate: in the porcelain AND (absent from the
 *      baseline OR `git hash-object` differs).
 *
 * Terminal landed / genuinely-not-landed lines keep today's grammar so parseLandingSignal covers all.
 *
 * Three properties of the POLL that are load-bearing rather than stylistic:
 *
 * - `--untracked-files=all` (QE F3): without it git reports a brand-new file inside a brand-new
 *   directory as `?? dir/` — the DIRECTORY — so an exact match against the expected FILE path can
 *   never fire and a genuinely landed file reads as not-landed.
 * - the match set is NEVER truncated (QE F3): the pre-fix probe piped the porcelain through
 *   `head -200` and then searched THAT, so on any tree with more than 200 dirty entries the
 *   predicate silently stopped seeing the tail. Our own settled tree had 292. The cap now applies
 *   ONLY to the human-readable file list that gets echoed.
 * - the probe's own scratch files live in `mktemp` space, NOT beside the baseline: a redirection
 *   creates its target BEFORE the command writes to it, so a scratch file next to the baseline
 *   appears in the very `git status` it is about to feed (MEASURED — a capture into a fixture repo
 *   recorded its own `.raw` file as the tree's only dirty entry). In production the path sits under
 *   `features/` and the pipeline-prefix filter hid it; the filter is not the guarantee.
 * - the baseline lookup compares the path as a LITERAL (QE F4): it used to interpolate the path into
 *   a `sed -E` pattern, where `.` and `+` — both legal in the accepted path grammar — are regex
 *   metacharacters, so `a.b.ts` could match the recorded line for `axb.ts` and pick up the WRONG
 *   hash. `awk -v` with a field-split equality has no pattern semantics at all.
 */
export declare function codeLandingProbeCmd(repo: string, plan: CodeLandedBarrierPlan, baselineAbsPath: string): string;
/**
 * The RESOLVED model of a stage, for the run report AND the live label: a Codex spec renders as
 * `codex:<id>:<reasoning>` (plus ` (usage-switched)` when the usage-adaptive override chose it), a
 * Claude spec as its bare model name, and an unrouted stage as `'session'` (inherits the main loop).
 */
export declare function modelLabel(opts: StageOpts | null | undefined): string;
/**
 * Decorate a stage's base agent label with its RESOLVED model so the /workflows tree shows true
 * per-stage model participation — the auto model-badge can't be overridden and shows the
 * `codex:codex-rescue` Claude WRAPPER (the session model), never `codex`, so the label text is the
 * only honest vehicle. An unrouted (`'session'`) stage gets NO suffix, so a routing-off run is
 * byte-identical to today. Because the suffix is derived from THIS opts object, a Claude fallback's
 * opts (no `agentType: codex`) can never render as codex — fallback honesty is structural, not a rule.
 */
export declare function stageLabel(base: string, opts: StageOpts | null | undefined): string;
/** Spread-merge a resolved opts fragment onto a call's base opts (extra wins). */
export declare function mergeOpts<B extends object, E extends object>(base: B, extra: E): B & E;
export type CodexDispatch = 'wrapper' | 'exec';
/** Dispatch by what the stage's deliverable IS, never by which knob named it. */
export declare function codexDispatchMode(stage: string): CodexDispatch;
/**
 * A SANITY bound on prompt size, not a stall guard.
 *
 * The earlier 1200-char ceiling was justified by "codex exec stalls on a 55-line payload". Twin
 * experiments refuted that (2026-07-10): 4000 chars of padding answered in 4s, and a 3156-char /
 * 56-line adversarial code review answered in 14s. The stalls are INTERMITTENT latency — the same
 * input hung at 60s and answered at 14s minutes apart. Size is not the variable.
 *
 * DEMOTED 2026-08-21 (feature qe-scoped-review, ADR 001). This constant used to be described as the
 * stall guard. That is now REFUTED by measurement: a 19 038-char QE prompt sat under this 24 000
 * ceiling with ~5 000 chars of headroom and still spent 280 s / exit 124 producing no verdict, twice.
 * The variable is not SIZE, it is whether the model is allowed to roam the tree. The defence is
 * SCOPE — `codexReviewCommand` (the diff defines it) and `scopedQePrompt` ("read ONLY these files").
 * This constant is retained as a sanity bound on an absurd payload, and is no longer claimed as the
 * thing that prevents a stall.
 */
export declare const CODEX_EXEC_PROMPT_CEILING_CHARS = 24000;
/** The sentinel an exec agent returns when the command failed, timed out, or Codex refused. */
export declare const CODEX_UNAVAILABLE = "CODEX_UNAVAILABLE";
export interface CodexExecPlanInput {
    readonly stage: string;
    readonly promptChars: number;
    readonly probedId: string | null;
    /**
     * TRUE only when the prompt was built by `scopedQePrompt` — i.e. it NAMES the files to read and
     * forbids exploring. Absent/false on the `qe` stage routes to Claude instead of `exec`.
     *
     * MEASURED 2026-08-21: an unscoped 19 038-char QE prompt spent 280 s and exit 124 on
     * reconnaissance and returned no verdict, TWICE (the retry ran at a 1500 s ceiling). The ceiling
     * did not stop it — 19 038 sat under 24 000. Scope is the guard; this input is where it binds.
     */
    readonly scoped?: boolean;
}
export interface CodexExecPlanResult {
    readonly mode: 'exec' | 'wrapper' | 'claude';
    readonly reason: string;
}
/** Decide, before spending an agent, whether Codex can honestly serve this stage. */
export declare function codexExecPlan(input: CodexExecPlanInput): CodexExecPlanResult;
/** A model id is user input (`args.codexModel`) and lands in a shell command. Shell-safe ids only. */
export declare function isSafeCodexId(id: string): boolean;
/**
 * A liveness probe. The allowlist says a name is spellable; only this says it answers.
 *
 * Found by cross-model review (codex exec, 2026-07-10): the id was interpolated into a shell command
 * unquoted, so a malformed `args.codexModel` could corrupt or extend the command the agent runs.
 * Reject anything that is not a plain id, and single-quote it anyway.
 */
/**
 * Which binary bounds a dispatched run. `timeout(1)` is GNU coreutils and is NOT on macOS; brew's
 * coreutils installs it as `gtimeout`.
 *
 * An ALLOWLIST rather than a free string, because this value is interpolated into a shell command.
 *
 * MEASURED 2026-08-25 (field report, and reproduced here): with neither binary present the dispatch
 * exits 127 and cross-family QE — a NAMED safety property, that the model which wrote the code must
 * not review it — silently did not happen for a whole run.
 *
 * Deliberately NOT the portable `perl -e 'alarm N; exec @ARGV'` the report proposed: MEASURED on
 * this machine, that form exits **142** (SIGALRM kills the exec'd process) while GNU timeout exits
 * **124**, and `classifyCodexQeOutcome` keys `timeout` on `exit === 124` — a rule its own comment
 * says wins over every content rule. The suggested remedy would have silently reclassified every
 * timeout as a tool error. A remedy that breaks the classifier is worse than the defect.
 */
export declare const TIMEOUT_BINS: Readonly<Record<string, true>>;
/** The requested timeout binary if it is one we allow, else the default. Never a free string. */
export declare function timeoutBinOrDefault(bin: unknown): string;
export declare function codexProbeCommand(id: string, timeoutBin?: string): string | null;
export interface CodexProbeOutput {
    readonly stdout: string;
    readonly exitCode: number;
}
export declare function interpretCodexProbe(out: CodexProbeOutput): boolean;
/** First id that actually answers. `null` means: route this stage to Claude. */
export declare function pickAvailableCodexId(ids: readonly string[], probe: (id: string) => Promise<boolean>): Promise<string | null>;
export interface CodexExecResult {
    readonly ok: boolean;
    readonly text: string;
    readonly reason: string;
}
/**
 * Risk R2, the most dangerous line in this change: an EMPTY reply must never read as "no findings".
 * A genuine clean review has to say something. Empty, whitespace, or the sentinel ⇒ not ok ⇒ the
 * caller falls back to a Claude reviewer.
 */
/**
 * Extract an A–D grade. Cross-model review flagged that "Looks good" would otherwise pass as a
 * review; a verdict must NAME its grade. No grade ⇒ no verdict ⇒ the caller falls back to Claude.
 */
export declare function parseCodexGrade(text: string): string | null;
export declare function parseCodexExecResult(text: string | null | undefined): CodexExecResult;
/** Mode-A wall-clock bound. Run 3 measured 146 s; 600 s is ~4× headroom and still bounded. */
export declare const CODEX_REVIEW_TIMEOUT_SECONDS = 600;
/** The `codex exec` wall-clock bound. Mirrors the workflow's own constant (field report 27). */
export declare const CODEX_EXEC_TIMEOUT_SECONDS = 280;
/** MEASURED (probe 0.3): `codex review` accepts and echoes `reasoning effort: high`. */
export declare const CODEX_REVIEW_DEFAULT_EFFORT = "high";
/** The sentinel a wrapper returns when the command hit its `timeout` — distinct from CODEX_UNAVAILABLE. */
export declare const CODEX_TIMEOUT = "CODEX_TIMEOUT";
/** Machine sentinel appended by the dispatch command itself (grammar of the Step-7.5 landing signal). */
export declare const CODEX_QE_SIGNAL_PREFIX = "CODEX-QE-SIGNAL";
/** Mode-B bounds, set FROM the measurement above (run 2 = 2 files / 1 461 chars), not from the ceiling. */
export declare const SCOPED_QE_MAX_FILES = 3;
export declare const SCOPED_QE_MAX_QUESTIONS = 4;
export declare const SCOPED_QE_MAX_PATH_CHARS = 200;
export declare const SCOPED_QE_MAX_QUESTION_CHARS = 200;
export declare const SCOPED_QE_PROMPT_MAX_CHARS = 2000;
/**
 * A git ref reaches a shell command, exactly like a model id does. Same discipline as
 * {@link isSafeCodexId}: plain refs only, and single-quoted at the call site anyway.
 *
 * Deliberately STRICTER than git: `HEAD~1`, `a..b` with `~`/`^`, and any leading `-` (which the CLI
 * would read as a flag) are rejected. A rejected ref returns `{cmd: null}` → mode A is skipped and
 * mode B / the Claude belt runs. Refusing to build is always cheaper than building something odd.
 */
export declare function isSafeCodexRef(ref: string): boolean;
export interface CodexReviewCommandInput {
    /** `'commit' | 'base' | 'uncommitted'`. Default `'uncommitted'` — see the scope note below. */
    readonly scope?: string | null;
    readonly ref?: string | null;
    readonly modelId?: string | null;
    readonly reasoning?: string | null;
    /**
     * Which binary bounds the run — `timeout` (default) or `gtimeout` on a mac with brew coreutils.
     * An INPUT rather than a platform sniff inside the builder, so the function stays pure and every
     * pinned command string in the tests stays byte-identical when it is omitted.
     */
    readonly timeoutBin?: string | null;
    /**
     * The repo the review must run IN. Field report 27: `codex review` was dispatched with no working
     * directory at all, so it ran in the SESSION cwd — on a run against an external checkout it read a
     * different tree, resolved `--uncommitted` / `--base` against the wrong git repo, and still exited 0
     * with a `Grade:` line that the pipeline recorded as a verdict. `codex review` has NO `-C` flag
     * (MEASURED on codex-cli 0.149.1: `codex exec --help` carries `-C, --cd <DIR>`, `codex review --help`
     * does not), so the working directory can only be set by a `cd` prefix. Omitted ⇒ no prefix, which
     * keeps every previously pinned command string byte-identical.
     */
    readonly repo?: string | null;
    /**
     * Accepted and DELIBERATELY IGNORED. MEASURED 2026-08-21: every scope flag refuses a positional
     * prompt — `--commit`, `--base <BRANCH>` and `--uncommitted` each exit 2 with
     * "the argument '<flag>' cannot be used with '[PROMPT]'". Silently appending one would present as
     * a review that never happened. Our own questions go to mode B ({@link scopedQePrompt}).
     */
    readonly prompt?: string | null;
    readonly timeoutSeconds?: number | null;
}
export interface CodexReviewCommandResult {
    readonly cmd: string | null;
    /** Always `false` today, and KEPT as a field: it is the one boolean a future CLI would flip. */
    readonly carriesPrompt: boolean;
    readonly scope: string;
    readonly reason: string | null;
}
/**
 * The `codex exec` dispatch, built as a pure string so the working directory is pinned by a test
 * rather than by whichever directory the dispatching agent happened to stand in (field report 27).
 * `-C` is real on codex-cli 0.149.1 and MEASURED: `-C <this repo>` answered in 4.6 s exit 0, while
 * `-C /tmp` exited 1 with "Not inside a trusted directory" — so the flag genuinely changes the tree,
 * and a non-git target is a LOUD failure rather than a quiet read of the wrong one.
 */
export declare function codexExecCommand(input: {
    readonly modelId?: string | null;
    readonly reasoning?: string | null;
    readonly prompt?: string | null;
    readonly timeoutBin?: string | null;
    readonly timeoutSeconds?: number | null;
    readonly repo?: string | null;
}): string | null;
export declare function codexReviewCommand(input: CodexReviewCommandInput): CodexReviewCommandResult;
export interface ScopedQePromptInput {
    readonly files?: readonly string[] | null;
    readonly questions?: readonly string[] | null;
    readonly slug?: string | null;
}
/**
 * Build the mode-B narrow prompt. The "do NOT open any other file" clause is LOAD-BEARING TEXT: it is
 * the difference between the 41 s graded run and the 280 s ungraded one, at comparable model effort.
 *
 * An empty file list returns `''` — the caller treats that as "do not dispatch". An unscoped mode-B
 * exec is precisely the failure this feature removes, so it must not be CONSTRUCTIBLE.
 */
export declare function scopedQePrompt(input: ScopedQePromptInput): string;
/**
 * Wrap a command so its EXIT CODE survives the shell agent that runs it.
 *
 * The old wrapper collapsed every failure to `CODEX_UNAVAILABLE`, so a timeout (narrow the scope) and
 * a broken invocation (fix the command) arrived indistinguishable — and `codex review` output is
 * prose, not JSON, so the exit code is the only reliable discriminator there is. The emitted line is
 * the grammar {@link parseCodexReviewSignal} reads back, and the two are round-trip tested against a
 * REAL shell rather than against each other's regexes.
 *
 * The SUBSHELL around `inner` is load-bearing, and the round-trip test is what earned it: without it
 * the `> "$o" 2>&1` redirect binds only to the last command of a compound `inner`, and an `exit`
 * inside `inner` terminates the wrapper BEFORE the sentinel is echoed — producing exactly the
 * "signal missing" state that must mean "the command did not demonstrably run".
 */
export declare function codexQeSignalCommand(inner: string, outPath?: string | null): string;
export interface ParsedCodexQeSignal {
    readonly exit: number | null;
    readonly elapsedSeconds: number | null;
    readonly bytes: number | null;
    readonly body: string;
    readonly signalPresent: boolean;
}
/**
 * Split the machine sentinel from the reviewer's own words.
 *
 * `codex review` output is prose, not JSON, so the EXIT CODE is the only reliable discriminator — and
 * today the shell-agent wrapper throws it away. The dispatch command now appends
 * `CODEX-QE-SIGNAL exit=<n> elapsed=<n>s bytes=<n>`, the same grammar as the Step-7.5 landing signal.
 *
 * A MISSING sentinel yields `exit: null` and `signalPresent: false` — never a defaulted 0. Defaulting
 * to 0 would let "the wrapper never ran the command" read as "the command succeeded".
 */
export declare function parseCodexReviewSignal(text: string | null | undefined): ParsedCodexQeSignal;
export interface CodexQeFinding {
    readonly severity: string;
    readonly title: string;
    readonly location: string;
}
/**
 * Parse mode-A findings out of non-JSON review output, driven by a REAL saved capture
 * (`test/fixtures/codex-review-2026-08-21.txt`), never by invented text.
 *
 * Observed shape: `- [P1] <title> — <abs-path>:<line>-<line>`, and Codex prints the whole finding
 * block TWICE (once as the summary, once as the final message), hence the dedup.
 *
 * Zero parsed findings is a DATA POINT (`[]`), never "clean" — that judgment belongs to
 * {@link gradeFromReviewFindings}, which refuses to make it.
 */
export declare function parseCodexReviewFindings(body: string | null | undefined): CodexQeFinding[];
/**
 * Derive a grade from what the reviewer actually found — used ONLY on the mode-A path, where the CLI
 * structurally forbids asking for a letter (measured: every scope flag rejects `[PROMPT]`).
 *
 * Two honesty rules, and they are the highest-severity lines in this feature:
 *   1. an empty or unparseable finding set returns `null`, NEVER a default letter. MEASURED
 *      (probe 0.6): `codex review --uncommitted` on a CLEAN tree exits 0 with a polite, well-formed,
 *      completely empty review. Mapping that to `'A'` would turn a review of NOTHING into a clean
 *      bill of health — the exact `{grade:'codex-review', gaps: []}` fabrication ADR-001 deleted once;
 *   2. `'A'` is UNREACHABLE by derivation for every input. "Nothing was found" is not evidence of
 *      quality when the reviewer's own findings are the only evidence we have; only a reviewer that
 *      STATES `Grade: A` (mode B, where we can ask) may produce one.
 */
export declare function gradeFromReviewFindings(findings: readonly CodexQeFinding[] | null | undefined): string | null;
/**
 * The LOCKED decline taxonomy. A `kind` outside this set is a bug, not a new case — which is why
 * {@link codexQeDeclineReason} throws on one rather than rendering something plausible.
 */
export declare const CODEX_QE_DECLINE_KINDS: readonly string[];
export interface ClassifyCodexQeInput {
    readonly exit?: number | null;
    readonly body?: string | null;
    readonly grade?: string | null;
    readonly findings?: readonly CodexQeFinding[] | null;
    /**
     * TRUE (the default) when the caller dispatched through the sentinel-emitting wrapper, so a missing
     * sentinel means the command never ran → `tool-error`. FALSE only when parsing RAW reviewer text
     * that was never wrapped (a saved fixture, a file on disk), where content is all there is.
     */
    readonly signalExpected?: boolean;
    /**
     * The files the dispatch DECLARED it would review. Used only by the wrong-tree rule below; absent
     * ⇒ that rule cannot fire and the classifier behaves exactly as it did before field report 27.
     */
    readonly declaredFiles?: readonly string[] | null;
}
/**
 * Did the reviewer fail to FIND the very files it was told to read?
 *
 * A review dispatched into the wrong working directory does not error: the paths simply are not
 * there, the model says so in prose, and the command still exits 0 — often with a `Grade:` line,
 * which the pipeline then records as a verdict about code nobody read.
 *
 * The rule is deliberately narrow, because a review of a file-handling module may legitimately
 * DISCUSS "No such file or directory" — a mention is not a claim. So it fires only when one LINE
 * carries both the not-found phrase and one of the declared paths. With no declared paths there is
 * nothing to discriminate against and the rule stays silent rather than guessing.
 */
export declare function codexReviewMissedItsFiles(body: string | null | undefined, declaredFiles?: readonly string[] | null): boolean;
/**
 * Classify one Codex QE dispatch. The property this whole feature exists to protect lives here:
 * a TIMEOUT and an UNUSABLE OUTPUT must never collapse into the same kind, because the operator's
 * next move differs — `timeout` ⇒ narrow the scope; `tool-error` ⇒ fix the command; `unavailable` ⇒
 * fix the account/model.
 *
 * Order is deliberate. `exit === 124` wins over EVERY content rule, because the measured timeout body
 * was 416 KB of exploration — very much non-empty, and an empty-body rule would have mislabelled it
 * `unusable-output` and told the operator to fix a tool that is working fine.
 *
 * `exit !== 0` is `tool-error` — but only for exits outside {0, 124}. MEASURED (probe 0.2): a review
 * that finds a real P1 blocker still exits 0. A BAD review is a SUCCESSFUL cross-family review.
 */
export declare function classifyCodexQeOutcome(input: ClassifyCodexQeInput): {
    kind: string;
};
export interface CodexQeDeclineDetail {
    readonly elapsedSeconds?: number | string | null;
    readonly seconds?: number | string | null;
    readonly ref?: string | null;
    readonly files?: readonly unknown[] | number | null;
    readonly exit?: number | null;
    readonly chars?: number | null;
    readonly detail?: string | null;
    readonly reason?: string | null;
}
/**
 * Render the operator-facing decline reason — the string the workflow assigns to `lastCodexDecline`
 * and that `crossFamilyQe` prints inside `opus (cross-family QE DID NOT happen — …)`.
 *
 * Before this feature every decline rendered as `codex exec unusable — codex exec returned no text`,
 * so a timeout (narrow the scope) and a broken invocation (fix the command) produced an identical,
 * unactionable alarm. The two `unusable-output` / `unavailable` strings are preserved VERBATIM from
 * the two pre-existing call sites so the change adds precision without rewriting history.
 *
 * `'empty'` and `'ceiling'` are accepted as aliases (the ADR's vocabulary) of `'unusable-output'` and
 * `'over-ceiling'` (the taxonomy's). Anything else THROWS: a kind outside the locked set is a bug,
 * and rendering a plausible sentence for it would hide that bug behind a readable label.
 */
export declare function codexQeDeclineReason(kind: string | null | undefined, detail?: CodexQeDeclineDetail | null): string;
/**
 * The ADR's spelling of {@link codexQeDeclineReason}. Accepts BOTH call shapes — the ADR's
 * `({kind, seconds, detail})` object and the taxonomy's positional `(kind, detail)` — so both cited
 * call sites resolve to one implementation instead of two that can drift.
 */
export declare function codexDeclineReason(a: unknown, b?: CodexQeDeclineDetail | null): string;
export interface CodexReviewResult {
    readonly ok: boolean;
    readonly grade: string | null;
    readonly kind: string;
    readonly gradeSource: string | null;
    readonly findings: CodexQeFinding[];
    readonly reason: string | null;
}
/**
 * The ADR's one-call parser over RAW reviewer text: signal-split → findings → grade → classify.
 * Pure composition; every rule it applies belongs to one of the four helpers above.
 *
 * `signalExpected` is passed as `sig.signalPresent` ON PURPOSE, and it is the one line here worth
 * reading twice. This function's input is text that may never have been wrapped (a saved fixture, a
 * report on disk), so a missing sentinel means "no machine signal exists", not "the tool failed".
 * The PIPELINE must not use this leniency: the workflow dispatches through the sentinel-emitting
 * wrapper and calls {@link classifyCodexQeOutcome} directly with `signalExpected: true`, so a
 * swallowed sentinel there is a `tool-error` and never a pass. A wiring test pins that.
 */
export declare function parseCodexReviewResult(text: string | null | undefined, declaredFiles?: readonly string[] | null): CodexReviewResult;
/** CX-3: a workflow that names an agent type the harness does not have must fall back, not die. */
export declare function isAgentTypeMissingError(err: unknown): boolean;
/**
 * Run a Codex-routed agent so that a missing agent type demotes to `null` (→ the caller's Claude
 * fallback) instead of throwing and killing the whole run. Any other error still propagates: we do
 * not want to swallow real bugs behind a fallback.
 */
export declare function safeCodexAgent<T>(agentFn: (prompt: string, opts: object) => Promise<T>, prompt: string, opts: object, log: (msg: string) => void): Promise<T | null>;
/** True for a POSIX absolute path. */
export declare function isAbsolutePosix(p: string): boolean;
/**
 * Collapse `a//b`, `a/./b` and a trailing slash. Deliberately does NOT resolve `..` — a workflow root
 * containing `..` is a caller error we would rather surface than silently normalise away.
 */
export declare function normalizeRepoPath(p: string): string;
/**
 * Resolve the artifact root to an absolute path.
 *
 * `raw` is `args.repo` (may be `'.'`, `'./x'`, `'x/'`, or already absolute).
 * `cwd` is the absolute working directory, obtained ONCE from a `pwd` agent — never ambient.
 * An already absolute `raw` ignores `cwd` entirely (zero agents on that path).
 */
export declare function absolutizeRepo(raw: string, cwd: string): string;
/** The instruction appended to prompts that embed an artifact path (FR-3). */
export declare const ABSOLUTE_PATH_NOTE: string;
/**
 * Pick the absolute path out of possibly chatty `pwd` output.
 *
 * Cross-model review (codex exec, 2026-07-10) found `.split('\n').pop()` selects the LAST line — so a
 * `pwd` agent that appends "Done" would degrade the run despite having printed a valid path. Take the
 * last line that actually looks like an absolute path.
 */
export declare function pickAbsolutePathLine(text: string | null | undefined): string | null;
/** `args.repo` may be anything the caller passed. A non-string must not throw on `.replace`. */
export declare function coerceRepoArg(raw: unknown): string;
export declare function hasUnsafePathChars(p: string): boolean;
export declare function hasDotDotSegment(p: string): boolean;
/** The slug names a directory under `features/`. Kebab-case, Latin, max 40 chars — the documented rule. */
export declare function isSafeSlug(slug: string): boolean;
/** Returns an error message, or `null` when the root is safe to embed in a prompt. */
export declare function checkArtifactRoot(root: string): string | null;
/** The one path the pipeline calls. Repo-relative — the command `cd`s into the repo root first. */
export declare const PLAN_GATE_SCRIPT = ".claude/skills/feature-adr/scripts/check-plan-completeness.mjs";
export interface PlanGateVerdict {
    /** 'pass' ONLY when the script's own last line AND its exit code agree on PASS. */
    verdict: 'pass' | 'fail' | 'not-established';
    /** The script's exit code as reported by the `K2_EXIT=` trailer, or null when unparseable. */
    exit: number | null;
    reason: string;
    output: string;
}
/**
 * The EXACT command the gate agent runs. `2>&1` folds stderr in (a crash must be visible, not
 * silently empty) and the `K2_EXIT=` trailer carries the exit code back through an agent that can
 * only return text.
 */
export interface PlanGateCmdOpts {
    /** An explicit ABSOLUTE path to the gate script. Validated at build time; never silently demoted. */
    gateScript?: string;
    /** Pin the workspace root instead of resolving it live with `pwd -P` (tests; deterministic pins). */
    workspace?: string;
}
/**
 * The EXACT command the gate agent runs. `2>&1` folds stderr in (a crash must be visible, not
 * silently empty) and the `K2_EXIT=` trailer carries the exit code back through an agent that can
 * only return text.
 *
 * P16/D2 — WHERE the script is looked up. The skill is installed in the WORKSPACE; the command
 * `cd`s into the TARGET repo, so a repo-relative `node .claude/skills/…` resolved against the target
 * and died with `Cannot find module` on every repo that is not itself a feature-adr install (field
 * report P16: K2_EXIT=1, verdict not-established, reason no-verdict-line). The fix is an ordered
 * candidate chain, WORKSPACE BEFORE REPO on purpose: the verdict contract is defined by the PARSER
 * inside the running workflow, so only the copy from that same installation is known to speak it —
 * a target repo may carry an older copy that prints `K2: NOT-ESTABLISHED — …`, a prefix this
 * parser does not match (a live example lives at
 * features/wave1-instrument-repair/check-plan-completeness.mjs). Nothing found ⇒ a LOUD
 * `tooling-missing` refusal with every tried path echoed — never a skip, never a pass.
 *
 * Called with three arguments the emitted string is byte-identical to the pre-P16 command; the
 * search chain appears only when `opts` is supplied. That 3-arg form exists so the pre-existing
 * byte-pin can keep asserting the OLD shape (a test-fixture role, not an API promise — the shipped
 * caller always passes `opts`).
 */
export declare function planCompletenessGateCmd(repo: string, featureDir: string, tier?: string | null, opts?: PlanGateCmdOpts): string;
/**
 * PARSE-NEVER-SYNTHESIZE. An empty reply, a reply with no verdict line, a missing/unknown exit code,
 * or a verdict line that DISAGREES with the exit code are all `not-established` — never a pass. The
 * quiet failure this forecloses: a dead or chatty agent reading as a clean gate.
 */
export declare function parsePlanGateVerdict(raw: string | null | undefined): PlanGateVerdict;
/**
 * The operator note a refused plan gate carries — ONE reason→text table, so the workflow's inline
 * copy cannot drift into telling an operator to fix a plan that is not broken.
 *
 * AM-2/AM-7: before P16 this text was inline and UNCONDITIONAL ("exit 1 ⇒ fix the FAIL lines"),
 * which is actively wrong for a gate that never RAN. Existence of a branch is not proof it fires,
 * so the table is exported and unit-tested on both reasons.
 */
export declare function refusalNoteFor(planGate: PlanGateVerdict, slug: string): string;
/**
 * ADR-003 — pin a RELATIVE `args.dzBin` to the workspace root once, at the point of definition.
 *
 * `DZ` is spliced into commands that first `cd` into the target repo, into the brain, or into
 * nothing at all (the usage probe), so a relative binary path resolves against three different
 * bases and silently returns nothing on at least two of them — and a null usage probe is read
 * upstream as "the limit was hit", which fail-safe-switches a healthy run to Codex.
 * A bare `dz` (no slash) keeps PATH resolution; an already-absolute value is returned untouched.
 */
export declare function normalizeDzBin(raw: string | null | undefined, ws: string | null | undefined): string;
/** What cross-family QE was asked for, what actually reviewed, and — when they differ — why. */
export interface CrossFamilyQeReport {
    /** The QE spec routing resolved, e.g. `codex:gpt-5.6-sol:high`. */
    readonly requested: string | null;
    /** The model label that actually produced the review, e.g. `opus`. */
    readonly actual: string;
    readonly coderFamily: string;
    readonly reviewerFamily: string;
    /** TRUE only when the reviewer's family differs from the coder's. */
    readonly happened: boolean;
    /** Why cross-family QE did not happen. `null` when it did. */
    readonly reason: string | null;
}
/**
 * Report — and LABEL — whether cross-family QE actually happened.
 *
 * The 2026-08-20 P16 run is the reason this exists. Routing correctly resolved QE to
 * `codex:gpt-5.6-sol:high` (MEASURED: `resolveQeSpec` returns exactly that for a Claude coder), the
 * codex dispatch returned null, the cross-model belt correctly fell back to a Claude reviewer so the
 * run would not block — and the result reported `modelsUsed.qe = "opus"` with nothing anywhere saying
 * the independent review had not taken place. The belt worked; its FAILURE was invisible. The only
 * reason anyone noticed is that the Claude reviewer volunteered it in prose.
 *
 * A safety property that silently degrades to its own absence is worse than one that is absent, because
 * the absence is believed to be presence. So the label carries the degradation and the caller returns
 * the report — self-review must never be able to pass for independent review by omission.
 *
 * HONEST SCOPE — what this does NOT do, named because a reader would otherwise assume it does (the
 * cross-family reviewer that graded the first version B asked for exactly this paragraph):
 *   • it does not verify the declared reviewer ACTUALLY RAN — only what the caller declares;
 *   • it does not establish genuine independence: two Claude models are one family here, and a
 *     caller free to mislabel a family can still misreport;
 *   • it does not validate the decline reason's provenance — any non-blank caller text is taken
 *     verbatim, so a stale reason from an earlier dispatch would be reported as this one's (the
 *     workflow clears `lastCodexDecline` per dispatch for exactly this reason; that discipline
 *     lives at the call site, not here);
 *   • it does not force a caller to surface the report at all.
 * It normalises family names and refuses to call an unnameable side cross-family. Beyond that it is
 * honest only when wired with truthful inputs — a REPORTING helper, not an authentication mechanism.
 */
export declare function crossFamilyQe(opts: {
    requestedSpec: string | null;
    actualLabel: string;
    coderFamily: string;
    reviewerFamily: string;
    declineReason?: string | null;
}): {
    report: CrossFamilyQeReport;
    label: string;
};
/** Whether a scoped (mode-B) cross-family review may run, and over WHICH files. */
export type ModeBScopeVerdict = {
    readonly ok: true;
    readonly files: readonly string[];
    readonly dropped: readonly string[];
} | {
    readonly ok: false;
    readonly reason: string;
};
/**
 * Decide the scope of a scoped cross-family QE review — or refuse it.
 *
 * The defect this closes (cross-family review of `qe-scoped-review`, 2026-08-21, its own first P1):
 * mode B built its file list from the PLANNED targets and never once consulted what actually changed.
 * On a run where Step 7 produced nothing, mode A reviews an empty diff and declines, mode B then
 * points the reviewer at unchanged pre-feature files and asks for a closing letter — and mode B is
 * the ONLY path that may return a STATED grade, the only one on which `A` is reachable at all. The
 * reviewer's headline stands quoted because it is exact: *"the patch can record a successful QE
 * verdict without reviewing the actual change."*
 *
 * So scope is derived from the MEASURED change set intersected with what the plan declared, and two
 * states refuse outright rather than review something else:
 *   • `genuinely-not-landed` — the landing barrier already established the code is not there;
 *   • an unknown change set — the probe could not measure. Inconclusive is never a pass, and here the
 *     honest consequence is that cross-family QE does not happen and says so, which `crossFamilyQe`
 *     now surfaces, rather than a confident grade over the wrong files.
 *
 * `dropped` is the planned-but-unchanged remainder. Callers must NOT report it as reviewed: recording
 * files the reviewer never saw is the same lie one level down (that is the report's MEDIUM-1).
 */
export declare function decideModeBScope(opts: {
    planned: readonly string[];
    changed: readonly string[] | null;
    landingStatus?: string | null;
}): ModeBScopeVerdict;
/** Findings split by whether they belong to the feature under review. */
export interface PartitionedFindings {
    readonly inScope: readonly CodexQeFinding[];
    /** Real findings about OTHER work that happened to be dirty. Reported, never graded. */
    readonly outOfScope: readonly CodexQeFinding[];
    /**
     * Findings whose location could not be MATCHED either way — no location at all, or a shape the
     * matcher does not parse (`src/a.ts line 10`). They are NOT out-of-scope: nothing proves they
     * concern another file. Suppressing them would drop a possibly-blocking finding from the grade on
     * the strength of a parsing failure, which is the "unknown counted as clean" mistake this whole
     * wave exists to remove — and which I reproduced here until cross-family review caught it.
     */
    readonly unlocatable: readonly CodexQeFinding[];
    /** True when scope could not be established, so nothing may be attributed either way. */
    readonly unscoped: boolean;
}
/**
 * Separate a mode-A review's findings into this feature's and the rest of the dirty worktree's.
 *
 * `codex review --uncommitted` reviews EVERY staged, unstaged and untracked change, and
 * `gradeFromReviewFindings` takes the worst severity over all of them. So an unrelated P0 sitting
 * dirty in the tree grades this feature D — indistinguishable from a D it earned.
 *
 * Not theoretical. In the saved live self-review fixture
 * (`test/fixtures/codex-review-selfreview-slices-2026-08-21.txt`), ONE of the six P1s is
 * `features/talk-ai-assistants/demo-site/site/dist/index.html:57-58` — unrelated work that merely
 * happened to be uncommitted at the time.
 *
 * Out-of-scope findings are NOT discarded: they are real, and dropping them silently would be its own
 * dishonesty. They are returned separately so the caller can report them as what they are.
 *
 * @param inScopePaths the MEASURED change set for this feature (repo-relative). Empty ⇒ `unscoped`,
 *        and the caller must not attribute anything — inconclusive is never a pass, and it is not a
 *        fail either.
 */
export declare function partitionReviewFindings(findings: readonly CodexQeFinding[] | null | undefined, inScopePaths: readonly string[] | null | undefined): PartitionedFindings;
/** A path → content-hash snapshot; `null` means the file was ABSENT when the snapshot was taken. */
export type FileHashSnapshot = ReadonlyMap<string, string | null>;
/**
 * Parse a `sha256sum` probe into a snapshot, tolerating the "no such file" lines it prints to stderr.
 *
 * Presence is not the question — CONTENT is. A file that was already dirty before Step 7 and then
 * edited by Step 7 must count as changed, and `git status` cannot tell those apart: it reports the
 * file as dirty in both cases. That is one half of why the old probe measured the wrong thing.
 */
export declare function parseHashProbe(text: string | null | undefined, declared: readonly string[]): FileHashSnapshot;
/**
 * Which declared targets actually changed between two snapshots.
 *
 * Returns `null` when either snapshot is missing — an unmeasured delta is NOT an empty delta, and the
 * callers treat null as "scope not established", which is never a pass.
 */
export declare function changedFromHashes(before: FileHashSnapshot | null, after: FileHashSnapshot | null): string[] | null;
/**
 * Build the probe that measures a change set, MATCHED to the review scope.
 *
 * The old code ran one `git status --porcelain` regardless of scope, which is wrong in both
 * directions (cross-family review of the 2026-08-21 wave, P1):
 *   • `uncommitted` — a target already dirty BEFORE Step 7 is reported as this run's change, so mode B
 *     could certify work the coder never touched. Hence the baseline pair rather than a single look.
 *   • `commit` / `base` — real COMMITTED changes produce no status entry at all, so the set came back
 *     empty and the scoped review was disabled on a run whose code demonstrably exists.
 *
 * @returns the shell command, or `null` when the scope needs a ref it was not given — the caller must
 *          then treat the scope as unmeasured rather than substituting a different question.
 */
export declare function changeSetProbeCmd(opts: {
    scope: string;
    ref?: string | null;
    paths: readonly string[];
    quote: (s: string) => string;
}): string | null;
export {};
//# sourceMappingURL=feature-adr-routing.d.ts.map