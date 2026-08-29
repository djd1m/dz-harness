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
export const BLOB_VERSION = '1.0.0';
export const STAGE_EFFORT = { override: {
        router: 'medium',
        requirements: 'medium',
        research: 'medium',
        adr: 'high',
        ideation: 'medium',
        ddd: 'high',
        architecture: 'high',
        plan: 'high',
        code: 'medium',
        qe: 'high',
        fleet: 'medium',
    } };
/** One-release compatibility alias for existing public imports. */
// Frozen (QE round-1 F10): the alias exports the SAME object as the live effort table, so a
// consumer mutating the compatibility alias would silently mutate shipped routing. Freezing keeps
// the read-compatibility promise while making any such write throw loudly in strict mode.
export const OVERRIDE_REASONING = Object.freeze(STAGE_EFFORT.override);
/** The flagship Codex id, independent of the spellability allowlist's insertion order. */
export function topCodexId(env) {
    return env.CODEX_MODEL !== 'auto' ? env.CODEX_MODEL : CODEX_TIERS.flagship;
}
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
export function decideUsageAction(prevOverride, signal, threshold) {
    if (signal === null || signal === undefined) {
        if (prevOverride)
            return { override: true, action: 'keep' };
        return { override: true, action: 'fail-safe-switch' };
    }
    const s = signal.sessionPct;
    const w = signal.weeklyPct;
    const sKnown = typeof s === 'number' && isFinite(s) && s >= 0;
    const wKnown = typeof w === 'number' && isFinite(w) && w >= 0;
    if ((sKnown && s >= threshold) || (wKnown && w >= threshold)) {
        return { override: true, action: prevOverride ? 'keep' : 'switch' };
    }
    if (sKnown && wKnown) {
        return { override: false, action: prevOverride ? 'restore' : 'none' };
    }
    return { override: prevOverride, action: prevOverride ? 'keep' : 'none' };
}
// ── Data tables (data-only extensibility — gpt-5.6-ready) ───────────────────
/** Known codex ids. Adding a new id (e.g. `'gpt-5.7'`) is a DATA-ONLY change. */
export const KNOWN_CODEX = { auto: 1, 'gpt-5.5': 1, 'gpt-5.6': 1, 'gpt-5.6-luna': 1, 'gpt-5.6-terra': 1, 'gpt-5.6-sol': 1 };
/**
 * Capability tiers are routing data, separate from {@link KNOWN_CODEX}'s spellability role.
 * The allowlist is not an availability check — probe every id before every run
 * (`codex exec -m <id> "Reply with exactly: OK"`); ids drift in both directions on a
 * timescale of days (probed 2026-08-18: 3 ids HTTP 400; probed 2026-08-29: all 3 exit 0).
 */
export const CODEX_TIERS = {
    flagship: 'gpt-5.6-sol',
    workhorse: 'gpt-5.6-terra',
    'high-volume': 'gpt-5.6-luna',
};
export function codexIdForTier(tier, env) {
    return env.CODEX_MODEL !== 'auto' ? env.CODEX_MODEL : CODEX_TIERS[tier];
}
export const BUDGET_PRESETS = {
    normal: { claude: 'normal', codex: 'normal' },
    eco: { claude: 'eco', codex: 'eco' },
    hybrid: { claude: 'eco', codex: 'normal' },
};
export function resolveBudgetMode(raw) {
    if (raw === undefined)
        return BUDGET_PRESETS.normal;
    if (typeof raw === 'string') {
        const preset = BUDGET_PRESETS[raw];
        if (!preset)
            throw new RangeError('budget: unknown preset "' + raw + '" — valid: normal|eco|hybrid');
        return preset;
    }
    if (raw && typeof raw === 'object') {
        const value = raw;
        for (const key of Object.keys(value)) {
            if (key !== 'claude' && key !== 'codex') {
                throw new RangeError('budget: unknown family key "' + key + '" — valid: claude|codex');
            }
        }
        for (const key of ['claude', 'codex']) {
            const level = value[key];
            if (level !== undefined && level !== 'normal' && level !== 'eco') {
                throw new RangeError('budget.' + key + ': unknown level "' + level + '" — valid: normal|eco');
            }
        }
        return {
            claude: value.claude || 'normal',
            codex: value.codex || 'normal',
        };
    }
    throw new RangeError('budget: expected a preset name or {claude,codex} object, got ' + typeof raw);
}
export function budgetPresetName(axis) {
    for (const name of ['normal', 'eco', 'hybrid']) {
        const preset = BUDGET_PRESETS[name];
        if (preset.claude === axis.claude && preset.codex === axis.codex)
            return name;
    }
    return null;
}
/** The Claude model names the Workflow runtime accepts as `agent()` `model`. */
export const CLAUDE_NAMES = { fable: 1, opus: 1, sonnet: 1, haiku: 1 };
/**
 * The codex-companion `--effort` vocabulary. `minimal` remains temporarily for compatibility
 * until a live companion probe establishes whether it can be retired; `max` is part of GPT-5.6's ladder.
 */
export const VALID_REASONING = { none: 1, minimal: 1, low: 1, medium: 1, high: 1, xhigh: 1, max: 1 };
/**
 * The proven DEFAULT TABLE, applied only when the user opts into routing.
 * `code`/`qe` are `null` SENTINELS: their defaults are DERIVED (the coder knob /
 * the cross-model rule), not fixed model names.
 */
export const DEFAULT_MODELS = {
    router: 'fable',
    requirements: 'sonnet',
    research: 'sonnet',
    adr: 'opus',
    ideation: 'sonnet',
    ddd: 'opus',
    architecture: 'opus',
    plan: 'sonnet',
    code: null,
    qe: null,
    fleet: 'sonnet',
};
/** Four family half-tables; presets compose the Claude and Codex halves independently. */
export const ROUTING_TABLES = {
    claude: {
        claude: {
            normal: { router: 'sonnet', requirements: 'sonnet', research: 'sonnet', adr: 'fable', ideation: 'sonnet', ddd: 'fable', architecture: 'fable', plan: 'opus', code: 'sonnet', fleet: 'sonnet' },
            eco: { router: 'sonnet', requirements: 'sonnet', research: 'sonnet', adr: 'opus', ideation: 'sonnet', ddd: 'opus', architecture: 'opus', plan: 'sonnet', code: 'sonnet', fleet: 'sonnet' },
        },
        codex: { normal: {}, eco: {} },
    },
    codex: {
        claude: {
            normal: { router: 'sonnet', qe: 'sonnet', fleet: 'sonnet' },
            eco: { router: 'sonnet', qe: 'sonnet', fleet: 'sonnet' },
        },
        codex: { normal: {}, eco: {} },
    },
};
function codexCell(tier, effort, env) {
    return 'codex:' + codexIdForTier(tier, env) + ':' + effort;
}
export function budgetTable(primary, mode, env) {
    const claudeHalf = ROUTING_TABLES[primary].claude[mode.claude];
    let codexHalf;
    if (primary === 'claude') {
        const qeSpec = mode.codex === 'normal'
            ? codexCell('flagship', 'high', env)
            : codexCell('workhorse', 'medium', env);
        codexHalf = { ...ROUTING_TABLES.claude.codex[mode.codex], qe: env.codexAvailable === false ? 'opus' : qeSpec };
    }
    else {
        const normal = mode.codex === 'normal';
        const design = codexCell(normal ? 'flagship' : 'workhorse', normal ? 'high' : 'medium', env);
        codexHalf = {
            requirements: design,
            research: design,
            adr: design,
            ideation: design,
            ddd: design,
            architecture: design,
            plan: codexCell(normal ? 'flagship' : 'workhorse', normal ? 'high' : 'low', env),
            code: codexCell(normal ? 'flagship' : 'workhorse', 'medium', env),
        };
    }
    return { ...claudeHalf, ...codexHalf };
}
/** Optional Claude precision review after A-normal's recall-oriented Sonnet QE. */
export function qePrecisionPassSpec(primary, budget, tier, _env) {
    if (primary !== 'codex')
        return null;
    if (budget.claude !== 'normal')
        return null;
    if (tier !== 'L' && tier !== 'XL')
        return null;
    return 'opus';
}
/** Build/test-time guard for the matrix's load-bearing cross-family property. */
export function assertCrossFamilyQe(codeSpec, qeSpec) {
    const fam = (s) => (s && String(s).split(':')[0] === 'codex') ? 'codex' : 'claude';
    if (fam(codeSpec) === fam(qeSpec)) {
        throw new Error('cross-family QE violated: code=' + codeSpec + ' qe=' + qeSpec);
    }
}
// ── Pure resolvers (byte-equivalent to the workflow's inline block) ──────────
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
export const AUTO_COST_SPEC = 'auto-cost';
export function isAutoCostSpec(spec) {
    return spec === AUTO_COST_SPEC;
}
export function specToOpts(spec, env) {
    const log = env.log || function () { };
    if (!spec)
        return {};
    const parts = String(spec).split(':');
    const head = parts[0] || '';
    if (head === 'codex') {
        let id = parts[1] || env.CODEX_MODEL;
        if (id !== 'auto' && !KNOWN_CODEX[id]) {
            log('models: unknown codex id ' + id + ' — using ' + env.CODEX_MODEL);
            id = env.CODEX_MODEL;
        }
        let reasoning = parts[2] || 'high';
        if (!VALID_REASONING[reasoning]) {
            throw new RangeError('models: invalid reasoning "' + reasoning + '" — valid: ' + Object.keys(VALID_REASONING).join('|'));
        }
        return { agentType: 'codex:codex-rescue', codexModel: id, _reasoning: reasoning };
    }
    if (CLAUDE_NAMES[head])
        return { model: head };
    log('models: unknown spec ' + spec + ' — session-inherited');
    return {};
}
/**
 * Fold the legacy `coder` knob into a spec:
 *   `codex`/`codex-fallback` → `'codex:' + CODEX_MODEL + ':high'`; else `'opus'`.
 * NOTE: a DIRECT `MODELS.code` spec bypasses this (handled in `resolveStageModel`);
 * this only maps the KNOB, which is why `coderIsCodex` (below) also inspects `MODELS.code`.
 */
export function resolveCoderSpec(env) {
    if (env.CODER === 'codex' || env.CODER === 'codex-fallback')
        return 'codex:' + env.CODEX_MODEL + ':high';
    return 'opus';
}
/**
 * Whether the RESOLVED coder is the codex family — true when the coder knob is
 * codex/codex-fallback OR a direct `MODELS.code` spec is a codex spec. The
 * cross-model QE default derives from THIS (not the knob alone), so a direct
 * `MODELS.code='codex'` still routes QE to Claude (never codex-self-QE).
 */
export function coderIsCodex(env) {
    const codeSpec = env.MODELS.code;
    if (codeSpec !== undefined && codeSpec !== null)
        return String(codeSpec).split(':')[0] === 'codex';
    if (env.CODER === 'codex' || env.CODER === 'codex-fallback')
        return true;
    return env.primary === 'codex';
}
/**
 * The CROSS-MODEL QE default (load-bearing). Called only when `MODELS.qe` is
 * unset. Resolves to the OTHER family than the coder:
 *   - coder is codex  → `'sonnet'` (the recall-oriented Claude reviewer)
 *   - coder is Claude → the Codex-budget cell (`sol:high` or `terra:medium`),
 *     or `'opus'` when Codex is unavailable (never block)
 * A pinned `CODEX_MODEL` still outranks the tier selected by the budget table.
 */
export function resolveQeSpecForCoder(coderCodex, env) {
    if (coderCodex)
        return 'sonnet';
    const CODEX_AVAILABLE = env.codexAvailable !== false;
    if (!CODEX_AVAILABLE)
        return 'opus';
    const budget = resolveBudgetMode(env.budget);
    return budget.codex === 'eco'
        ? 'codex:' + codexIdForTier('workhorse', env) + ':medium'
        : 'codex:' + codexIdForTier('flagship', env) + ':high';
}
export function resolveQeSpec(env) {
    return resolveQeSpecForCoder(coderIsCodex(env), env);
}
/**
 * Whether the caller opted into routing at all. When FALSE (no axes, `args.models`,
 * or Codex knobs), every Claude stage resolves to `{}` → byte-identical to today.
 */
export function routingRequested(env) {
    return (Object.keys(env.MODELS).length > 0 ||
        env.primary !== undefined ||
        env.budget !== undefined ||
        env.PLANNER === 'codex' ||
        env.CODER === 'codex' ||
        env.CODER === 'codex-fallback' ||
        env.QE_REVIEWER === 'codex' ||
        env.QE_REVIEWER === 'codex-fallback');
}
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
export function qeShouldUseCodex(env) {
    const explicit = env.MODELS.qe;
    if (explicit !== undefined && explicit !== null) {
        return String(explicit).split(':')[0] === 'codex';
    }
    if (env.QE_REVIEWER === 'codex')
        return !coderIsCodex(env);
    return routingRequested(env) && resolveQeSpec(env).split(':')[0] === 'codex';
}
/**
 * Resolve a stage to its `agent()` opts fragment.
 *   1. explicit `MODELS[stage]` wins
 *   2. else if the user did NOT opt into routing → `{}` (byte-identical BC path)
 *   3. else the primary × per-family-budget table fills the gap
 *   4. `code`/`qe` `null` sentinels resolve via the coder / cross-model rules
 */
export function resolveStageModel(stage, env) {
    if (env.usageOverride) {
        const r = (env.usageReasoning && env.usageReasoning[stage]) || STAGE_EFFORT.override[stage] || 'medium';
        const o = specToOpts('codex:' + topCodexId(env) + ':' + r, env);
        o._usageSwitched = true;
        return o;
    }
    let spec = env.MODELS[stage];
    if (spec === undefined) {
        if (!routingRequested(env))
            return {};
        if (stage === 'code' && (env.CODER === 'codex' || env.CODER === 'codex-fallback')) {
            return specToOpts(resolveCoderSpec(env), env);
        }
        if (stage === 'plan' && env.PLANNER === 'codex') {
            return specToOpts('codex:' + env.CODEX_MODEL + ':high', env);
        }
        if (stage === 'qe') {
            return specToOpts(resolveQeSpec(env), env);
        }
        const resolvedPrimary = env.primary || 'claude';
        const cell = budgetTable(resolvedPrimary, resolveBudgetMode(env.budget), env)[stage];
        spec = cell !== undefined ? cell : DEFAULT_MODELS[stage];
    }
    if (stage === 'code' && (spec === null || spec === undefined))
        return specToOpts(resolveCoderSpec(env), env);
    if (stage === 'qe' && (spec === null || spec === undefined))
        return specToOpts(resolveQeSpec(env), env);
    return specToOpts(spec, env);
}
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
export function needsLandedBarrier(opts) {
    return !!(opts && opts.agentType === 'codex:codex-rescue');
}
/**
 * The per-call Codex effort hint. Codex-rescue maps this prompt instruction to
 * `codex-companion.mjs task --effort <reasoning>`, so the resolved per-stage `_reasoning`
 * is no longer only a `modelsUsed` label. Non-Codex stages return an empty string, preserving
 * the routing-off and Claude-stage prompt text exactly.
 */
export function codexEffortHint(opts) {
    if (opts && opts.agentType === 'codex:codex-rescue' && opts._reasoning) {
        return ' (If you are the Codex runtime, run at --effort ' + opts._reasoning + '.)';
    }
    return '';
}
// ── Step-7.5 CODE landed barrier (Codex out-of-band write flush) ────────────
// Widened 2026-08-28 (MEASURED, not a guess): the dz-deadwood coder job ran 46m11s end to end, and
// the slop-lint coder was independently confirmed STILL RUNNING (codex-companion status "running",
// pid alive, mid-TDD-cycle, actively applying file changes) at 16m38s elapsed — a full 8x past the
// old 120s window. The old window declared "genuinely not landed" and fed Step-8 QE a false empty
// tree, producing a grade-D report entirely about an absence that was never real. This does not fix
// the underlying conflation of TIMEOUT with CONFIRMED-ABSENCE (filed as a backlog item — the barrier
// still cannot see the codex-companion job's own liveness) — it only narrows how often the false
// negative fires for a realistic M-tier build, at the cost of a longer worst-case wait when the
// coder truly produced nothing.
export const DEFAULT_CODE_LANDING_MAX_WAIT_MS = 1_020_000;
export const DEFAULT_CODE_LANDING_BACKOFF_MS = [
    1_000,
    2_000,
    2_000,
    5_000,
    5_000,
    10_000,
    10_000,
    15_000,
    20_000,
    25_000,
    25_000,
    30_000,
    30_000,
    60_000,
    60_000,
    60_000,
    90_000,
    90_000,
    120_000,
    120_000,
    120_000,
    120_000,
];
export const CODE_LANDED_BARRIER_SLEEPS_SECONDS = DEFAULT_CODE_LANDING_BACKOFF_MS.map((ms) => ms / 1000);
const CODE_LANDING_PIPELINE_PREFIXES = ['features/', '.dz/', '.agentic-qe/', 'roam/'];
/** Bumped whenever the landing protocol's meaning changes. Recorded on every code-stage result so a
 *  pre-protocol checkpoint reads as no-checkpoint instead of resuming into new semantics. */
export const LANDING_PROTOCOL_VERSION = 2;
/** R6: salted into the code stage's checkpoint hash PARTS (not the schema version — ADR-003 keeps
 *  `CKPT_SCHEMA_VERSION` at 'fa-ckpt-2' deliberately, so ONLY the code stage re-runs). */
export const LANDING_HASH_TOKEN = 'landing-v2';
/**
 * The CLOSED landing-predicate vocabulary, as DATA (QE F6) — exhaustive-record derived, so `tsc`
 * fails the build if the union gains or loses a member. `'expected-path'` and `'any-code-change'`
 * are DELETED; a consumer that still matches on them will find them absent from this list too.
 */
const CODE_LANDING_PREDICATE_SET = {
    'newly-changed': true,
    'no-expected-targets': true,
    'empty-before-timeout': true,
    'empty-after-timeout': true,
};
export const CODE_LANDING_PREDICATES = Object.keys(CODE_LANDING_PREDICATE_SET);
function codeLandingEmptySignal(seconds) {
    return 'changed=0 after ' + seconds + 's — genuinely not landed';
}
export function needsCodeLandedBarrier(coderUsed) {
    return coderUsed === 'codex' || coderUsed === 'codex-fallback';
}
/** The normalization half, with no accept/reject opinion. */
function stripCodeLandingPath(path) {
    let p = String(path || '').trim().replace(/\\/g, '/');
    while (p.indexOf('./') === 0)
        p = p.slice(2);
    return p.replace(/\/+/g, '/');
}
/** The rejection half, in classification order, NAMING the reason. `normalizeCodeLandingPath` and
 *  `validateExpectedTargetsBlock` both route through this, so the accept set cannot drift between
 *  "what the barrier polls" and "what the Step-6/7 boundary reports as accepted". */
function classifyCodeLandingPathReject(path) {
    const p = stripCodeLandingPath(path);
    if (!p)
        return 'empty-after-strip';
    if (p[0] === '/')
        return 'absolute-path';
    if (p === '..' || p.indexOf('../') === 0 || p.indexOf('/../') >= 0 || p.endsWith('/..'))
        return 'traversal';
    if (/[\0\r\n\t "'\x60$;&|<>*?()[\]{}!]/.test(p))
        return 'not-a-path';
    if (p.endsWith('/'))
        return 'not-a-path';
    for (const prefix of CODE_LANDING_PIPELINE_PREFIXES) {
        const bare = prefix.slice(0, -1);
        if (p === bare || p.indexOf(prefix) === 0)
            return 'pipeline-artifact-path';
    }
    return null;
}
export function normalizeCodeLandingPath(path) {
    return classifyCodeLandingPathReject(path) === null ? stripCodeLandingPath(path) : '';
}
export function filterPollableCodePaths(paths) {
    const out = [];
    const seen = new Set();
    for (const path of paths || []) {
        const normalized = normalizeCodeLandingPath(path);
        if (!normalized || seen.has(normalized))
            continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return out;
}
export function codeLandedBarrierPlan(coderUsed, expectedPaths = [], inconclusiveReason) {
    const enabled = needsCodeLandedBarrier(coderUsed);
    const pollWindowSeconds = DEFAULT_CODE_LANDING_MAX_WAIT_MS / 1000;
    if (!enabled) {
        return { enabled: false, mode: 'any-code-change', sleepsMs: [], sleepsSeconds: [], pollWindowMs: 0, pollWindowSeconds: 0, expectedPaths: [], emptySignal: '' };
    }
    const filteredExpectedPaths = filterPollableCodePaths(expectedPaths || []);
    if (filteredExpectedPaths.length === 0) {
        return {
            enabled: true,
            mode: 'inconclusive',
            inconclusiveReason: inconclusiveReason === undefined ? 'empty-plan-block' : inconclusiveReason,
            sleepsMs: [],
            sleepsSeconds: [],
            pollWindowMs: 0,
            pollWindowSeconds: 0,
            expectedPaths: [],
            emptySignal: codeLandingEmptySignal(pollWindowSeconds),
        };
    }
    return {
        enabled: true,
        mode: 'expected-files',
        sleepsMs: DEFAULT_CODE_LANDING_BACKOFF_MS,
        sleepsSeconds: CODE_LANDED_BARRIER_SLEEPS_SECONDS,
        pollWindowMs: DEFAULT_CODE_LANDING_MAX_WAIT_MS,
        pollWindowSeconds: pollWindowSeconds,
        expectedPaths: filteredExpectedPaths,
        emptySignal: codeLandingEmptySignal(pollWindowSeconds),
    };
}
/** Flatten the many shapes an expected-target value arrives in (string, array, {wrote}, {paths}). */
export function addExpectedCodeTarget(value, out) {
    if (value === null || value === undefined)
        return;
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++)
            addExpectedCodeTarget(value[i], out);
        return;
    }
    if (typeof value === 'object') {
        const obj = value;
        if (Array.isArray(obj.wrote))
            addExpectedCodeTarget(obj.wrote, out);
        if (Array.isArray(obj.paths))
            addExpectedCodeTarget(obj.paths, out);
        return;
    }
    const lines = String(value).split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        const candidate = String(lines[i] || '').replace(/^[-*]\s+/, '').replace(/^\x60+|\x60+$/g, '').trim();
        if (candidate)
            out.push(candidate);
    }
}
/** Read the `EXPECTED_CODE_TARGETS:` block out of arbitrary text. The block ends at the next
 *  ALL-CAPS heading line — the shared grammar, used for BOTH the plan block (which establishes)
 *  and the Codex scrape (which only ever diagnoses). */
export function extractExpectedCodeTargetsFromText(text) {
    const out = [];
    const lines = String(text || '').split(/\r?\n/);
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = String(lines[i] || '').trim();
        if (/^EXPECTED_CODE_TARGETS:\s*$/i.test(trimmed)) {
            inBlock = true;
            continue;
        }
        if (!inBlock)
            continue;
        if (!trimmed)
            continue;
        if (/^[A-Z][A-Z0-9_ -]*:\s*$/.test(trimmed))
            break;
        out.push(trimmed.replace(/^[-*]\s+/, '').replace(/^\x60+|\x60+$/g, '').trim());
    }
    return out;
}
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
export function sourceExpectedCodeTargets(argTargets, planBlockText, codexText) {
    const scrapeRaw = [];
    addExpectedCodeTarget(extractExpectedCodeTargetsFromText(codexText), scrapeRaw);
    const scrapeDiagnostic = filterPollableCodePaths(scrapeRaw);
    const argRaw = [];
    addExpectedCodeTarget(argTargets, argRaw);
    if (argRaw.length > 0) {
        const argPaths = filterPollableCodePaths(argRaw);
        if (argPaths.length > 0)
            return { targets: argPaths, establishedBy: 'args', scrapeDiagnostic: scrapeDiagnostic };
        return { targets: [], establishedBy: null, reason: 'override-unpollable', scrapeDiagnostic: scrapeDiagnostic };
    }
    if (planBlockText === null || planBlockText === undefined) {
        return { targets: [], establishedBy: null, reason: 'no-plan-block', scrapeDiagnostic: scrapeDiagnostic };
    }
    const planRaw = [];
    addExpectedCodeTarget(extractExpectedCodeTargetsFromText(planBlockText), planRaw);
    const planPaths = filterPollableCodePaths(planRaw);
    if (planPaths.length > 0)
        return { targets: planPaths, establishedBy: 'plan', scrapeDiagnostic: scrapeDiagnostic };
    return { targets: [], establishedBy: null, reason: 'empty-plan-block', scrapeDiagnostic: scrapeDiagnostic };
}
/**
 * Line-level validation of the plan's block at the Step-6/7 boundary (R13) — BEFORE Step 7 spends
 * tokens. Every rejected line is reported WITH its reason, so a whole-block typo can never present
 * as "no block declared".
 */
export function validateExpectedTargetsBlock(planText) {
    const text = String(planText || '');
    const present = /^EXPECTED_CODE_TARGETS:\s*$/im.test(text);
    const lines = extractExpectedCodeTargetsFromText(text);
    const accepted = [];
    const rejected = [];
    const seen = new Set();
    for (const line of lines) {
        const reason = classifyCodeLandingPathReject(line);
        if (reason !== null) {
            rejected.push({ line: line, reason: reason });
            continue;
        }
        const normalized = normalizeCodeLandingPath(line);
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        accepted.push(normalized);
    }
    return { present: present, accepted: accepted, rejected: rejected };
}
let CKSUM_TABLE = null;
function cksumTable() {
    if (CKSUM_TABLE !== null)
        return CKSUM_TABLE;
    const table = [];
    for (let i = 0; i < 256; i++) {
        let c = i << 24;
        for (let k = 0; k < 8; k++)
            c = (c & 0x80000000) !== 0 ? ((c << 1) ^ 0x04c11db7) >>> 0 : (c << 1) >>> 0;
        table.push(c >>> 0);
    }
    CKSUM_TABLE = table;
    return table;
}
/** UTF-8 bytes without TextEncoder — the workflow mirror runs in a sandbox with no host globals. */
function utf8Bytes(s) {
    const out = [];
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) {
            out.push(c);
            continue;
        }
        if (c < 0x800) {
            out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
            continue;
        }
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
            const next = s.charCodeAt(i + 1);
            if (next >= 0xdc00 && next <= 0xdfff) {
                const cp = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
                i++;
                continue;
            }
        }
        out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return out;
}
/**
 * POSIX `cksum` CRC (polynomial 0x04C11DB7, length-augmented, final complement) — the PURE twin of
 * the shell trailer the capture command writes. Known vector: the empty body is 4294967295, and the
 * test suite cross-checks one fixture against a REAL `cksum` run (H7) so the twin cannot drift.
 */
export function posixCksum(body) {
    const table = cksumTable();
    const bytes = utf8Bytes(body === null || body === undefined ? '' : String(body));
    let crc = 0;
    for (let i = 0; i < bytes.length; i++) {
        crc = ((crc << 8) ^ (table[((crc >>> 24) ^ (bytes[i] || 0)) & 0xff] || 0)) >>> 0;
    }
    let len = bytes.length;
    while (len > 0) {
        crc = ((crc << 8) ^ (table[((crc >>> 24) ^ (len & 0xff)) & 0xff] || 0)) >>> 0;
        len = Math.floor(len / 256);
    }
    return (~crc) >>> 0;
}
/**
 * Parse + VERIFY a captured baseline. The trailer (`count=<n> cksum=<c>`) is not decoration: a
 * baseline is the only thing standing between "this path changed" and "this path was ALREADY dirty
 * when the coder started", so a truncated or edited baseline must read as UNKNOWN, never as a
 * smaller-but-fine baseline. Every trailer failure collapses to 'baseline-unverified'.
 *
 * A valid trailer with ZERO entries is OK — that is a clean tree, a real and common state.
 */
export function verifyPreCodeBaseline(text) {
    if (text === null || text === undefined)
        return { ok: false, reason: 'no-baseline', entries: [] };
    const raw = String(text);
    if (raw.trim() === '')
        return { ok: false, reason: 'no-baseline', entries: [] };
    const lines = raw.split('\n');
    let trailerIndex = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (String(lines[i] || '').trim() === '')
            continue;
        trailerIndex = i;
        break;
    }
    if (trailerIndex < 0)
        return { ok: false, reason: 'no-baseline', entries: [] };
    const trailer = /^count=(\d+) cksum=(\d+)$/.exec(String(lines[trailerIndex] || '').trim());
    if (trailer === null)
        return { ok: false, reason: 'baseline-unverified', entries: [] };
    const bodyLines = lines.slice(0, trailerIndex);
    const body = bodyLines.length > 0 ? bodyLines.join('\n') + '\n' : '';
    const entries = [];
    for (const line of bodyLines) {
        const trimmed = String(line || '');
        if (trimmed.trim() === '')
            continue;
        const m = /^(\S+) (.+)$/.exec(trimmed);
        if (m === null)
            return { ok: false, reason: 'baseline-unverified', entries: [] };
        entries.push({ hash: String(m[1] || ''), path: String(m[2] || '') });
    }
    if (entries.length !== Number(trailer[1]))
        return { ok: false, reason: 'baseline-unverified', entries: [] };
    if (posixCksum(body) !== Number(trailer[2]))
        return { ok: false, reason: 'baseline-unverified', entries: [] };
    return { ok: true, entries: entries };
}
/** PARSE-NEVER-SYNTHESIZE for the capture step: empty/garbage stdout is `no-signal`, an explicit
 *  failure line is `capture-failed`, and ONLY a well-formed `BASELINE-CAPTURED entries=<n>
 *  cksum=<c>` line is success. Never infer success from the absence of an error. */
export function parseBaselineCapture(text, expectedPrefix) {
    const raw = text === null || text === undefined ? '' : String(text);
    if (raw.trim() === '')
        return { ok: false, path: null, entries: null, cksum: null, reason: 'no-signal' };
    if (/BASELINE-CAPTURE-FAILED/.test(raw))
        return { ok: false, path: null, entries: null, cksum: null, reason: 'capture-failed' };
    const m = /BASELINE-CAPTURED path=(\S+) entries=(\d+) cksum=(\d+)/.exec(raw);
    if (m === null)
        return { ok: false, path: null, entries: null, cksum: null, reason: 'no-signal' };
    const path = String(m[1] || '');
    // The path arrives via an agent-relayed stdout, so it is UNTRUSTED text that later becomes a shell
    // argument. Refuse anything with a metacharacter, and — when the caller says where it asked for the
    // file — refuse a path outside that prefix. A capture that reports a path we did not ask for is a
    // failed capture, not a relocated one.
    if (path === '' || /[\0\r\n\t "'\x60$;&|<>*?()[\]{}!]/.test(path)) {
        return { ok: false, path: null, entries: null, cksum: null, reason: 'unsafe-path' };
    }
    if (expectedPrefix !== undefined && path.indexOf(expectedPrefix) !== 0) {
        return { ok: false, path: null, entries: null, cksum: null, reason: 'unsafe-path' };
    }
    return { ok: true, path: path, entries: Number(m[2]), cksum: Number(m[3]) };
}
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
export function preCodeBaselineCaptureCmd(repo, baselinePathPrefix) {
    // Every step is status-checked and writes to its OWN file in a scratch dir. The pre-fix version
    // ran the five transforms as one pipeline whose status nobody read (QE round-2 F2b): a failing
    // stage produced an EMPTY path list, which then produced a checksum-VALID zero-entry baseline —
    // a baseline that verifies perfectly and claims the tree was clean, after which every path looks
    // absent-from-baseline, i.e. newly changed, i.e. LANDED. Same failure shape as the unchecked
    // `git status`, one layer down.
    //
    // `grep` needs its own rule: exit 1 means "no line matched", which is LEGAL and common — at
    // Step-7 time the only dirty files are often the pipeline's own `features/<slug>/…` artifacts,
    // and filtering all of them away is the correct answer, not a failure. Only exit > 1 is an error.
    // (This is why the alternative "empty result from non-empty input ⇒ transform-failed" rule was
    // NOT used: it would fail-closed on the normal feature-adr run.)
    const fail = (reason) => 'rm -rf "$sc"; echo "BASELINE-CAPTURE-FAILED reason=' + reason + '"; exit 1';
    return ('repo=' + codeLandingShellQuote(repo) + '; pre=' + codeLandingShellQuote(baselinePathPrefix) + '; ' +
        'sc=$(mktemp -d) || { echo "BASELINE-CAPTURE-FAILED reason=mktemp-failed"; exit 1; }; ' +
        'mkdir -p "$(dirname -- "$pre")" || { ' + fail('mkdir-failed') + '; }; ' +
        'out="$pre.$(date +%s).$$.txt"; tmp="$sc/base"; ' +
        'if ! git -C "$repo" status --porcelain --untracked-files=all > "$sc/0"; then ' + fail('git-status-failed') + '; fi; ' +
        'if ! sed -E "s/^...//" "$sc/0" > "$sc/1"; then ' + fail('transform-failed') + '; fi; ' +
        'if ! sed -E "s/.* -> //" "$sc/1" > "$sc/2"; then ' + fail('transform-failed') + '; fi; ' +
        'grep -vE "^(features/|[.]dz/|[.]agentic-qe/|roam/)" "$sc/2" > "$sc/3"; g=$?; ' +
        'if [ "$g" -gt 1 ]; then ' + fail('transform-failed') + '; fi; ' +
        'if ! sed "/^$/d" "$sc/3" > "$sc/4"; then ' + fail('transform-failed') + '; fi; ' +
        'if ! sort "$sc/4" > "$sc/paths"; then ' + fail('transform-failed') + '; fi; ' +
        ': > "$tmp" || { ' + fail('transform-failed') + '; }; ' +
        'while IFS= read -r p; do h=$(git -C "$repo" hash-object -- "$p" 2>/dev/null); ' +
        '[ -z "$h" ] && h="-"; printf "%s %s\\n" "$h" "$p" >> "$tmp"; done < "$sc/paths"; ' +
        'if ! sort -o "$tmp" "$tmp"; then ' + fail('transform-failed') + '; fi; ' +
        'n=$(wc -l < "$tmp" | tr -d " "); c=$(cksum < "$tmp" | awk "{print \\$1}"); ' +
        'if [ -z "$n" ] || [ -z "$c" ]; then ' + fail('transform-failed') + '; fi; ' +
        'printf "count=%s cksum=%s\\n" "$n" "$c" >> "$tmp" || { ' + fail('transform-failed') + '; }; ' +
        'if ! mv "$tmp" "$out"; then ' + fail('publish-failed') + '; fi; ' +
        'rm -rf "$sc"; ' +
        'echo "BASELINE-CAPTURED path=$out entries=$n cksum=$c"');
}
/** Was `path` changed BY THE CODER, rather than already dirty when the baseline was taken?
 *  Absent from the baseline ⇒ yes. Present with a DIFFERENT current hash ⇒ yes. Present with the
 *  same hash, or present with no current hash to compare ⇒ NO (fail-closed: without hash evidence
 *  a pre-dirty path must not read as landed — that read is exactly acid 003-5a). */
function isNewlyChanged(path, baseline, currentHashes) {
    if (!baseline || !baseline.ok)
        return false;
    let recorded = null;
    for (const entry of baseline.entries) {
        if (entry.path === path) {
            recorded = entry.hash;
            break;
        }
    }
    if (recorded === null)
        return true;
    const now = currentHashes ? currentHashes[path] : undefined;
    if (now === undefined)
        return false;
    return now !== recorded;
}
export function codeLandedBarrierHasLanded(changedPaths, expectedPaths = [], baseline, currentHashes) {
    const filteredChangedPaths = filterPollableCodePaths(changedPaths);
    const filteredExpectedPaths = filterPollableCodePaths(expectedPaths);
    // ADR-003: an EMPTY expected set can never establish landing. The pre-epoch `return
    // filteredChangedPaths.length > 0` here is why an unrelated dirty file read as Codex's work.
    if (filteredExpectedPaths.length === 0)
        return false;
    const changed = new Set(filteredChangedPaths);
    for (const expectedPath of filteredExpectedPaths) {
        if (!changed.has(expectedPath))
            continue;
        // no baseline supplied ⇒ this is the plain dirty-match question (decideCodeLanding does the
        // delta filtering itself); with a baseline ⇒ the newly-changed predicate.
        if (baseline === undefined)
            return true;
        if (isNewlyChanged(expectedPath, baseline, currentHashes))
            return true;
    }
    return false;
}
export function decideCodeLanding(snapshot) {
    const maxWaitMs = Math.max(0, snapshot.maxWaitMs);
    const elapsedMs = Math.max(0, snapshot.elapsedMs);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const expectedPaths = filterPollableCodePaths(snapshot.expectedPaths);
    const changedPaths = filterPollableCodePaths(snapshot.changedEntries.map(function (entry) { return entry.path; }));
    // (1) nothing was ESTABLISHED to watch for. Pre-epoch this fell through to "any code change
    // counts" and returned status=landed off an unrelated dirty file.
    if (expectedPaths.length === 0) {
        return {
            status: 'inconclusive',
            reason: 'empty-plan-block',
            changed: 0,
            elapsedMs: elapsedMs,
            elapsedSeconds: elapsedSeconds,
            expectedPaths: expectedPaths,
            matchedExpectedPaths: [],
            changedPaths: changedPaths,
            predicate: 'no-expected-targets',
            qeSignalLine: 'CODEX-LANDING-SIGNAL status=inconclusive predicate=no-expected-targets reason=empty-plan-block',
        };
    }
    // (2) without a VERIFIED baseline the newly-changed delta cannot be computed at all. Answering
    // the dirty-match question instead would silently re-open acid 003-5a, so we answer "unknown".
    const baseline = snapshot.baseline;
    if (!baseline || !baseline.ok) {
        const reason = baseline && baseline.reason ? baseline.reason : 'no-baseline';
        return {
            status: 'inconclusive',
            reason: reason,
            changed: 0,
            elapsedMs: elapsedMs,
            elapsedSeconds: elapsedSeconds,
            expectedPaths: expectedPaths,
            matchedExpectedPaths: [],
            changedPaths: changedPaths,
            predicate: 'newly-changed',
            qeSignalLine: 'CODEX-LANDING-SIGNAL status=inconclusive predicate=newly-changed reason=' + reason,
        };
    }
    const changed = new Set(changedPaths);
    const matchedExpectedPaths = expectedPaths.filter(function (path) {
        return changed.has(path) && isNewlyChanged(path, baseline, snapshot.currentHashes);
    });
    if (matchedExpectedPaths.length > 0) {
        return {
            status: 'landed',
            changed: matchedExpectedPaths.length,
            elapsedMs: elapsedMs,
            elapsedSeconds: elapsedSeconds,
            expectedPaths: expectedPaths,
            matchedExpectedPaths: matchedExpectedPaths,
            changedPaths: changedPaths,
            predicate: 'newly-changed',
            qeSignalLine: 'CODEX-LANDING-SIGNAL status=landed changed=' +
                matchedExpectedPaths.length +
                ' after=' +
                elapsedSeconds +
                's predicate=newly-changed matched=' +
                matchedExpectedPaths.join(','),
        };
    }
    if (elapsedMs < maxWaitMs) {
        return {
            status: 'not-yet-flushed',
            changed: 0,
            elapsedMs: elapsedMs,
            elapsedSeconds: elapsedSeconds,
            expectedPaths: expectedPaths,
            matchedExpectedPaths: [],
            changedPaths: changedPaths,
            predicate: 'empty-before-timeout',
            qeSignalLine: 'CODEX-LANDING-SIGNAL status=not-yet-flushed changed=0 after ' + elapsedSeconds + 's — not yet flushed',
        };
    }
    const terminalSeconds = Math.ceil(maxWaitMs / 1000);
    return {
        status: 'genuinely-not-landed',
        changed: 0,
        elapsedMs: elapsedMs,
        elapsedSeconds: terminalSeconds,
        expectedPaths: expectedPaths,
        matchedExpectedPaths: [],
        changedPaths: changedPaths,
        predicate: 'empty-after-timeout',
        qeSignalLine: 'CODEX-LANDING-SIGNAL status=genuinely-not-landed ' + codeLandingEmptySignal(terminalSeconds),
    };
}
/**
 * PARSE-NEVER-SYNTHESIZE, applied to the barrier the same way ADR-001 applies it to a QE verdict:
 * a probe that returned nothing, or text with no signal line, is NOT a clean "not landed" and NOT
 * a landed — it is `inconclusive` with the reason naming which failure it was. An unknown status
 * token (including a stray mid-poll `not-yet-flushed` reaching a terminal position) is malformed,
 * never trusted. Every consumer reads THIS function's output; no consumer re-regexes the note.
 */
export function parseLandingSignal(probeText) {
    const text = probeText === null || probeText === undefined ? '' : String(probeText);
    if (text.trim() === '')
        return { status: 'inconclusive', reason: 'probe-failure' };
    const lines = text.split(/\r?\n/);
    let signal = '';
    for (let i = 0; i < lines.length; i++) {
        if (String(lines[i] || '').indexOf('CODEX-LANDING-SIGNAL status=') >= 0) {
            signal = String(lines[i] || '');
            break;
        }
    }
    if (signal === '')
        return { status: 'inconclusive', reason: 'malformed-signal' };
    const m = /CODEX-LANDING-SIGNAL status=([A-Za-z-]+)/.exec(signal);
    const status = m === null ? '' : String(m[1] || '');
    if (status === 'landed')
        return { status: 'landed' };
    if (status === 'genuinely-not-landed')
        return { status: 'genuinely-not-landed' };
    if (status !== 'inconclusive')
        return { status: 'inconclusive', reason: 'malformed-signal' };
    const r = /reason=([a-z-]+)/.exec(signal);
    const reason = r === null ? '' : String(r[1] || '');
    switch (reason) {
        case 'empty-plan-block':
        case 'override-unpollable':
        case 'no-plan-block':
        case 'no-baseline':
        case 'baseline-unverified':
        case 'probe-failure':
        case 'malformed-signal':
            return { status: 'inconclusive', reason: reason };
        default:
            return { status: 'inconclusive', reason: 'malformed-signal' };
    }
}
function codeLandingShellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\"'\"'") + "'";
}
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
export function codeLandingProbeCmd(repo, plan, baselineAbsPath) {
    if (plan.mode === 'inconclusive') {
        const reason = plan.inconclusiveReason === undefined ? 'empty-plan-block' : plan.inconclusiveReason;
        return 'echo "CODEX-LANDING-SIGNAL status=inconclusive predicate=no-expected-targets reason=' + reason + '"; echo "files:"; echo "(none)"';
    }
    const expectedList = plan.expectedPaths.length > 0 ? plan.expectedPaths.map(codeLandingShellQuote).join(' ') : "''";
    return ('repo=' + codeLandingShellQuote(repo) + '; base=' + codeLandingShellQuote(baselineAbsPath) + '; ' +
        'sleeps="' + plan.sleepsSeconds.join(' ') + '"; expected_count=' + plan.expectedPaths.length + '; elapsed=0; ' +
        'if [ ! -f "$base" ]; then echo "CODEX-LANDING-SIGNAL status=inconclusive predicate=newly-changed reason=no-baseline"; echo "files:"; echo "(none)"; exit 0; fi; ' +
        'body=$(mktemp) || { echo "CODEX-LANDING-SIGNAL status=inconclusive predicate=newly-changed reason=probe-failure"; echo "files:"; echo "(none)"; exit 0; }; ' +
        'pfile=$(mktemp) || { rm -f "$body"; echo "CODEX-LANDING-SIGNAL status=inconclusive predicate=newly-changed reason=probe-failure"; echo "files:"; echo "(none)"; exit 0; }; ' +
        'bl=$(wc -l < "$base" | tr -d " "); head -n $((bl - 1)) "$base" > "$body"; ' +
        'tr_line=$(tail -n 1 "$base"); tr_n=$(printf "%s" "$tr_line" | sed -nE "s/^count=([0-9]+) cksum=([0-9]+)$/\\1/p"); ' +
        'tr_c=$(printf "%s" "$tr_line" | sed -nE "s/^count=([0-9]+) cksum=([0-9]+)$/\\2/p"); ' +
        'n_body=$(wc -l < "$body" | tr -d " "); c_body=$(cksum < "$body" | awk "{print \\$1}"); ' +
        'if [ -z "$tr_n" ] || [ "$tr_n" != "$n_body" ] || [ "$tr_c" != "$c_body" ]; then rm -f "$body" "$pfile"; echo "CODEX-LANDING-SIGNAL status=inconclusive predicate=newly-changed reason=baseline-unverified"; echo "files:"; echo "(none)"; exit 0; fi; ' +
        'newly(){ recorded=$(awk -v want="$1" \'{ i = index($0, " "); if (i > 0 && substr($0, i + 1) == want) { print substr($0, 1, i - 1); exit } }\' "$body"); ' +
        'if [ -z "$recorded" ]; then return 0; fi; now=$(git -C "$repo" hash-object -- "$1" 2>/dev/null); ' +
        'if [ -z "$now" ] || [ "$now" = "$recorded" ]; then return 1; fi; return 0; }; ' +
        'poll(){ git -C "$repo" status --porcelain --untracked-files=all 2>/dev/null | sed -E "s/^...//" | sed -E "s/.* -> //" | grep -vE "^(features/|[.]dz/|[.]agentic-qe/|roam/)" | sed "/^$/d" > "$pfile"; ' +
        'n=$(wc -l < "$pfile" | tr -d " "); ' +
        'matched=""; for p in ' + expectedList + '; do [ -z "$p" ] && continue; ' +
        'if grep -Fx -- "$p" "$pfile" >/dev/null && newly "$p"; then matched="$p"; break; fi; done; ' +
        'if [ -n "$matched" ]; then echo "CODEX-LANDING-SIGNAL status=landed changed=1 after=${elapsed}s predicate=newly-changed"; echo "matched=$matched"; echo "files:"; head -40 "$pfile"; rm -f "$body" "$pfile"; exit 0; fi; }; ' +
        'poll; for wait in $sleeps; do sleep "$wait"; elapsed=$((elapsed + wait)); poll; done; ' +
        'echo "CODEX-LANDING-SIGNAL status=genuinely-not-landed ' + plan.emptySignal + '"; echo "predicate=newly-changed observed=$n"; ' +
        'echo "files:"; if [ -s "$pfile" ]; then head -40 "$pfile"; else echo "(none)"; fi; rm -f "$body" "$pfile"');
}
/**
 * The RESOLVED model of a stage, for the run report AND the live label: a Codex spec renders as
 * `codex:<id>:<reasoning>` (plus ` (usage-switched)` when the usage-adaptive override chose it), a
 * Claude spec as its bare model name, and an unrouted stage as `'session'` (inherits the main loop).
 */
export function modelLabel(opts) {
    if (opts && opts.agentType === 'codex:codex-rescue') {
        const base = 'codex:' + opts.codexModel + ':' + opts._reasoning;
        return opts._usageSwitched ? base + ' (usage-switched)' : base;
    }
    if (opts && opts.model)
        return opts.model;
    return 'session';
}
/**
 * Decorate a stage's base agent label with its RESOLVED model so the /workflows tree shows true
 * per-stage model participation — the auto model-badge can't be overridden and shows the
 * `codex:codex-rescue` Claude WRAPPER (the session model), never `codex`, so the label text is the
 * only honest vehicle. An unrouted (`'session'`) stage gets NO suffix, so a routing-off run is
 * byte-identical to today. Because the suffix is derived from THIS opts object, a Claude fallback's
 * opts (no `agentType: codex`) can never render as codex — fallback honesty is structural, not a rule.
 */
export function stageLabel(base, opts) {
    const m = modelLabel(opts);
    return m === 'session' ? base : base + ' · ' + m;
}
/** Spread-merge a resolved opts fragment onto a call's base opts (extra wins). */
export function mergeOpts(base, extra) {
    const out = {};
    for (const k in base)
        out[k] = base[k];
    for (const k in extra)
        out[k] = extra[k];
    return out;
}
// ── CODEX DISPATCH BY DELIVERABLE (ADR-001) ──────────────────────────────────
//
// `codex:codex-rescue` is a fire-and-forget Claude WRAPPER: it dispatches to Codex and returns
// immediately, so its return value is a stub. That is correct for a stage whose deliverable is a
// FILE written out-of-band (Step 7 code, behind the Step-7.5 landed barrier) and catastrophic for a
// stage whose deliverable is its RETURN VALUE — a stub reads exactly like a clean review.
//
// The workflow script is sandboxed (no `child_process`), so it cannot shell out to `codex exec`
// itself. An ordinary Claude agent runs the command and returns Codex's stdout verbatim: the agent
// is the shell.
/**
 * Stages whose deliverable is a FILE written out-of-band, and which already verify the write landed
 * before trusting the stub. `code` polls `git status` (Step-7.5). `plan` requires its
 * `06_implementation_plan.md` to appear and otherwise falls back to the Claude planner — it never
 * fabricates. Both are legitimate wrapper users; everything else returns its deliverable.
 */
const WRAPPER_STAGES = { code: 1, plan: 1 };
/** Dispatch by what the stage's deliverable IS, never by which knob named it. */
export function codexDispatchMode(stage) {
    return WRAPPER_STAGES[stage] ? 'wrapper' : 'exec';
}
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
export const CODEX_EXEC_PROMPT_CEILING_CHARS = 24_000;
/** The sentinel an exec agent returns when the command failed, timed out, or Codex refused. */
export const CODEX_UNAVAILABLE = 'CODEX_UNAVAILABLE';
/** Decide, before spending an agent, whether Codex can honestly serve this stage. */
export function codexExecPlan(input) {
    if (codexDispatchMode(input.stage) === 'wrapper') {
        return { mode: 'wrapper', reason: 'deliverable is a file written out-of-band' };
    }
    if (!input.probedId) {
        return { mode: 'claude', reason: 'no codex model id answered the probe' };
    }
    // The `qe` stage is the one whose deliverable is a VERDICT, and the one measured to time out
    // unscoped. An unscoped exec here is not merely slow — it returns null, the belt runs a Claude
    // reviewer, and cross-family QE is lost silently. So it must not be dispatchable at all.
    if (input.stage === 'qe' && input.scoped !== true) {
        return {
            mode: 'claude',
            reason: 'qe prompt is not SCOPED — an unscoped codex exec QE buys reconnaissance, not review ' +
                '(MEASURED 2026-08-21: 19038 chars, 280s, exit 124, no verdict)',
        };
    }
    if (input.promptChars > CODEX_EXEC_PROMPT_CEILING_CHARS) {
        return {
            mode: 'claude',
            reason: 'prompt is ' +
                input.promptChars +
                ' chars, over the ' +
                CODEX_EXEC_PROMPT_CEILING_CHARS +
                '-char codex exec ceiling (it would stall)',
        };
    }
    return { mode: 'exec', reason: 'codex exec on ' + input.probedId };
}
/** A model id is user input (`args.codexModel`) and lands in a shell command. Shell-safe ids only. */
export function isSafeCodexId(id) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id);
}
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
export const TIMEOUT_BINS = { timeout: true, gtimeout: true };
/** The requested timeout binary if it is one we allow, else the default. Never a free string. */
export function timeoutBinOrDefault(bin) {
    const b = typeof bin === 'string' ? bin : '';
    return TIMEOUT_BINS[b] === true ? b : 'timeout';
}
export function codexProbeCommand(id, timeoutBin) {
    if (!isSafeCodexId(id))
        return null;
    // `< /dev/null` is not cosmetic: without it `codex exec` waits on stdin forever (measured
    // 2026-08-19, 45 minutes lost). It was present in the workflow mirror and MISSING here — a drift
    // invisible to the suite because this function is not in the lift test's function list.
    return timeoutBinOrDefault(timeoutBin) + " 60 codex exec -m '" + id + "' 'Reply with exactly: OK' < /dev/null";
}
export function interpretCodexProbe(out) {
    if (out.exitCode !== 0)
        return false;
    return /\bOK\b/.test(out.stdout);
}
/** First id that actually answers. `null` means: route this stage to Claude. */
export async function pickAvailableCodexId(ids, probe) {
    for (const id of ids) {
        if (await probe(id))
            return id;
    }
    return null;
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
export function parseCodexGrade(text) {
    const m = /\bgrade\s*[:=]?\s*([A-D])\b/i.exec(text);
    const g = m && m[1] ? m[1] : null;
    return g ? g.toUpperCase() : null;
}
export function parseCodexExecResult(text) {
    const t = typeof text === 'string' ? text.trim() : '';
    if (t.length === 0)
        return { ok: false, text: '', reason: 'codex exec returned no text' };
    if (t.indexOf(CODEX_UNAVAILABLE) !== -1) {
        return { ok: false, text: t, reason: 'codex exec reported it could not run' };
    }
    return { ok: true, text: t, reason: 'codex answered' };
}
// ── SCOPED CODEX QE (feature qe-scoped-review, ADR 001) ─────────────────────
//
// MEASURED 2026-08-21, one question, one model (`gpt-5.6-sol`, effort `high`), three dispatches:
//   1. `codex exec`, UNSCOPED, 19 038-char prompt → 280 s, exit 124, 416 KB / 4 583 lines, NO verdict
//      (retried at a 1500 s ceiling: still no verdict).
//   2. `codex exec`, SCOPED ("read ONLY these two files"), 1 461-char prompt → 41 s, exit 0, `Grade: B`.
//   3. `codex review --commit <SHA>` → 146 s, exit 0, verdict + findings, scope derived from the diff.
//
// The budget went on RECONNAISSANCE of the tree, not on reasoning about the change. So raising the
// timeout buys more reconnaissance, and the old working hypothesis — that
// `CODEX_EXEC_PROMPT_CEILING_CHARS` was the binding constraint — is REFUTED: 19 038 sat under the
// 24 000 ceiling with ~5 000 chars to spare. The defence is SCOPE. The ceiling is now a sanity bound.
//
// Why this matters beyond wall-clock: on timeout the dispatch returns null, the belt runs a Claude
// reviewer, and the cross-family QE property is lost SILENTLY on exactly the large features that need
// it most. Everything below exists so that loss is (a) rarer and (b) always attributable.
/** Mode-A wall-clock bound. Run 3 measured 146 s; 600 s is ~4× headroom and still bounded. */
export const CODEX_REVIEW_TIMEOUT_SECONDS = 600;
/** The `codex exec` wall-clock bound. Mirrors the workflow's own constant (field report 27). */
export const CODEX_EXEC_TIMEOUT_SECONDS = 280;
/** MEASURED (probe 0.3): `codex review` accepts and echoes `reasoning effort: high`. */
export const CODEX_REVIEW_DEFAULT_EFFORT = 'high';
/** The sentinel a wrapper returns when the command hit its `timeout` — distinct from CODEX_UNAVAILABLE. */
export const CODEX_TIMEOUT = 'CODEX_TIMEOUT';
/** Machine sentinel appended by the dispatch command itself (grammar of the Step-7.5 landing signal). */
export const CODEX_QE_SIGNAL_PREFIX = 'CODEX-QE-SIGNAL';
/** Mode-B bounds, set FROM the measurement above (run 2 = 2 files / 1 461 chars), not from the ceiling. */
export const SCOPED_QE_MAX_FILES = 3;
export const SCOPED_QE_MAX_QUESTIONS = 4;
export const SCOPED_QE_MAX_PATH_CHARS = 200;
export const SCOPED_QE_MAX_QUESTION_CHARS = 200;
export const SCOPED_QE_PROMPT_MAX_CHARS = 2000;
/**
 * A git ref reaches a shell command, exactly like a model id does. Same discipline as
 * {@link isSafeCodexId}: plain refs only, and single-quoted at the call site anyway.
 *
 * Deliberately STRICTER than git: `HEAD~1`, `a..b` with `~`/`^`, and any leading `-` (which the CLI
 * would read as a flag) are rejected. A rejected ref returns `{cmd: null}` → mode A is skipped and
 * mode B / the Claude belt runs. Refusing to build is always cheaper than building something odd.
 */
export function isSafeCodexRef(ref) {
    return /^[A-Za-z0-9][A-Za-z0-9._\/-]{0,199}$/.test(String(ref));
}
/**
 * Build the mode-A command. The diff defines the scope, so Codex computes for free the thing we were
 * paying a model to do badly.
 *
 * Two refusals are load-bearing, both measured (exit 2 = a silent review failure, since the pipeline
 * would read "no output" as "codex unavailable"):
 *   • never emit `-m` — `codex review` rejects it; the model goes through `-c model=`;
 *   • never append a positional prompt — no scope flag accepts one.
 *
 * Default scope is `uncommitted` (probe 0.4b: it and `--base HEAD` reviewed the identical uncommitted
 * diff, and `uncommitted` needs no ref, so it has no ref-injection surface at all).
 */
/** Shell-quote one argument. A repo path may contain a space; it must never contain a command. */
function codexSq(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
/**
 * The `cd <repo> && ` prefix, or `''` when no repo was named. Empty is not a silent default — it is
 * the pre-2026-08-25 behaviour, preserved so an omitted `repo` keeps every pinned string identical.
 */
function codexCd(repo) {
    return repo === '' ? '' : 'cd ' + codexSq(repo) + ' && ';
}
/**
 * The `codex exec` dispatch, built as a pure string so the working directory is pinned by a test
 * rather than by whichever directory the dispatching agent happened to stand in (field report 27).
 * `-C` is real on codex-cli 0.149.1 and MEASURED: `-C <this repo>` answered in 4.6 s exit 0, while
 * `-C /tmp` exited 1 with "Not inside a trusted directory" — so the flag genuinely changes the tree,
 * and a non-git target is a LOUD failure rather than a quiet read of the wrong one.
 */
export function codexExecCommand(input) {
    const o = input || {};
    const modelId = String(o.modelId === undefined || o.modelId === null ? '' : o.modelId);
    if (!isSafeCodexId(modelId))
        return null;
    const reasoning = o.reasoning === undefined || o.reasoning === null || o.reasoning === '' ? 'high' : String(o.reasoning);
    if (!VALID_REASONING[reasoning])
        return null;
    const raw = Number(o.timeoutSeconds);
    const seconds = raw === raw && raw !== Infinity && raw > 0 ? Math.floor(raw) : CODEX_EXEC_TIMEOUT_SECONDS;
    const repo = String(o.repo === undefined || o.repo === null ? '' : o.repo);
    const cd = repo === '' ? '' : ' -C ' + codexSq(repo);
    return timeoutBinOrDefault(o.timeoutBin) + ' ' + seconds + ' codex exec' + cd
        + ' -m ' + codexSq(modelId) + ' -c model_reasoning_effort=' + codexSq(reasoning)
        + ' ' + codexSq(String(o.prompt === undefined || o.prompt === null ? '' : o.prompt)) + ' < /dev/null';
}
export function codexReviewCommand(input) {
    const o = input || {};
    const scope = o.scope === undefined || o.scope === null || o.scope === '' ? 'uncommitted' : String(o.scope);
    if (scope !== 'commit' && scope !== 'base' && scope !== 'uncommitted') {
        return { cmd: null, carriesPrompt: false, scope: scope, reason: 'unknown review scope ' + scope };
    }
    const modelId = String(o.modelId === undefined || o.modelId === null ? '' : o.modelId);
    if (!isSafeCodexId(modelId)) {
        return { cmd: null, carriesPrompt: false, scope: scope, reason: 'unsafe id or ref' };
    }
    const effort = o.reasoning === undefined || o.reasoning === null || o.reasoning === '' ? CODEX_REVIEW_DEFAULT_EFFORT : String(o.reasoning);
    if (!VALID_REASONING[effort]) {
        return { cmd: null, carriesPrompt: false, scope: scope, reason: 'unknown reasoning effort ' + effort };
    }
    const ref = String(o.ref === undefined || o.ref === null ? '' : o.ref);
    if (scope !== 'uncommitted' && !isSafeCodexRef(ref)) {
        return { cmd: null, carriesPrompt: false, scope: scope, reason: 'unsafe id or ref' };
    }
    const raw = Number(o.timeoutSeconds);
    const seconds = raw === raw && raw !== Infinity && raw > 0 ? Math.floor(raw) : CODEX_REVIEW_TIMEOUT_SECONDS;
    const repo = String(o.repo === undefined || o.repo === null ? '' : o.repo);
    let cmd = codexCd(repo) + timeoutBinOrDefault(o.timeoutBin) + ' ' + seconds + " codex review -c model='" + modelId + "' -c model_reasoning_effort='" + effort + "'";
    if (scope === 'commit')
        cmd += " --commit '" + ref + "'";
    else if (scope === 'base')
        cmd += " --base '" + ref + "'";
    else
        cmd += ' --uncommitted';
    cmd += ' < /dev/null';
    return { cmd: cmd, carriesPrompt: false, scope: scope, reason: null };
}
/**
 * Build the mode-B narrow prompt. The "do NOT open any other file" clause is LOAD-BEARING TEXT: it is
 * the difference between the 41 s graded run and the 280 s ungraded one, at comparable model effort.
 *
 * An empty file list returns `''` — the caller treats that as "do not dispatch". An unscoped mode-B
 * exec is precisely the failure this feature removes, so it must not be CONSTRUCTIBLE.
 */
export function scopedQePrompt(input) {
    const o = input || {};
    const rawFiles = Array.isArray(o.files) ? o.files : [];
    const files = [];
    for (const f of rawFiles) {
        const s = String(f === undefined || f === null ? '' : f).trim();
        if (s === '')
            continue;
        if (files.indexOf(s) !== -1)
            continue;
        files.push(s.slice(0, SCOPED_QE_MAX_PATH_CHARS));
        if (files.length >= SCOPED_QE_MAX_FILES)
            break;
    }
    if (files.length === 0)
        return '';
    const rawQuestions = Array.isArray(o.questions) ? o.questions : [];
    const questions = [];
    for (const q of rawQuestions) {
        const s = String(q === undefined || q === null ? '' : q).trim().replace(/\s+/g, ' ');
        if (s === '')
            continue;
        questions.push(s.slice(0, SCOPED_QE_MAX_QUESTION_CHARS));
        if (questions.length >= SCOPED_QE_MAX_QUESTIONS)
            break;
    }
    if (questions.length === 0) {
        questions.push('Is this change correct, and does the test named by its ADR actually DISCRIMINATE (would it fail if the protection were deleted)?');
    }
    const slug = String(o.slug === undefined || o.slug === null ? '' : o.slug).trim().slice(0, 60);
    let out = 'Read ONLY these files: ' + files.join(', ') + '. Do NOT open any other file and do NOT explore the repository.';
    if (slug !== '')
        out += ' They are the changed files of feature ' + slug + '.';
    out += '\n\nAnswer these ' + questions.length + ' questions about them:\n';
    for (let i = 0; i < questions.length; i++)
        out += i + 1 + '. ' + questions[i] + '\n';
    out += '\nFinish with a single final line: Grade: <A|B|C|D>';
    return out;
}
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
export function codexQeSignalCommand(inner, outPath) {
    const raw = String(outPath === undefined || outPath === null ? '' : outPath);
    // `JSON.stringify` is JSON quoting, not SHELL quoting — inside the double quotes it emits, `$`,
    // backtick and `\` all keep their shell meaning, so a path carrying one would break out of the
    // assignment. Found by the first live mode-A review of this feature (P1, 2026-08-21). The path is
    // ours to construct, so the fix is an allowlist plus single-quoting, not an escaper: anything that
    // is not a plain POSIX path falls back to the default rather than being cleverly escaped.
    const o = /^\/[A-Za-z0-9._\/-]{1,200}$/.test(raw) ? raw : '/tmp/dz-codex-qe.out';
    return "o='" + o + "'; start=$(date +%s); ( " + String(inner) + ' ) > "$o" 2>&1; rc=$?; cat "$o"; echo; echo "' + CODEX_QE_SIGNAL_PREFIX + ' exit=$rc elapsed=$(( $(date +%s) - start ))s bytes=$(wc -c < \"$o\" | tr -d \" \")"';
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
export function parseCodexReviewSignal(text) {
    const t = typeof text === 'string' ? text : '';
    const re = /^CODEX-QE-SIGNAL exit=(-?\d+) elapsed=(\d+)s bytes=(\d+)[ \t]*$/gm;
    let m = null;
    let last = null;
    while ((m = re.exec(t)) !== null)
        last = m;
    if (last === null) {
        return { exit: null, elapsedSeconds: null, bytes: null, body: t.trim(), signalPresent: false };
    }
    const body = (t.slice(0, last.index) + t.slice(last.index + last[0].length)).trim();
    return { exit: Number(last[1]), elapsedSeconds: Number(last[2]), bytes: Number(last[3]), body: body, signalPresent: true };
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
export function parseCodexReviewFindings(body) {
    const t = String(body === undefined || body === null ? '' : body);
    const out = [];
    const seen = new Set();
    for (const rawLine of t.split('\n')) {
        const line = rawLine.trim();
        const m = /^[-*]\s*\[(P[0-4])\]\s*(.+)$/.exec(line);
        if (!m)
            continue;
        const severity = String(m[1]);
        let title = String(m[2]).trim();
        let location = '';
        const sep = title.lastIndexOf(' — ');
        if (sep !== -1) {
            const cand = title.slice(sep + 3).trim();
            if (/:\d/.test(cand) || cand.indexOf('/') !== -1) {
                location = cand;
                title = title.slice(0, sep).trim();
            }
        }
        if (title === '')
            continue;
        const key = severity + '|' + title + '|' + location;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ severity: severity, title: title, location: location });
    }
    return out;
}
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
export function gradeFromReviewFindings(findings) {
    const list = Array.isArray(findings) ? findings : [];
    let worst = null;
    for (const f of list) {
        const s = String(f && f.severity ? f.severity : '').toUpperCase();
        if (!/^P[0-4]$/.test(s))
            continue;
        const n = Number(s.slice(1));
        if (worst === null || n < worst)
            worst = n;
    }
    if (worst === null)
        return null;
    if (worst === 0)
        return 'D';
    if (worst === 1)
        return 'C';
    return 'B';
}
/**
 * The LOCKED decline taxonomy. A `kind` outside this set is a bug, not a new case — which is why
 * {@link codexQeDeclineReason} throws on one rather than rendering something plausible.
 */
export const CODEX_QE_DECLINE_KINDS = ['timeout', 'no-verdict', 'tool-error', 'unusable-output', 'unavailable', 'over-ceiling', 'wrong-tree'];
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
export function codexReviewMissedItsFiles(body, declaredFiles) {
    const text = String(body === undefined || body === null ? '' : body);
    const files = Array.isArray(declaredFiles) ? declaredFiles.filter((f) => typeof f === 'string' && f !== '') : [];
    if (text === '' || files.length === 0)
        return false;
    // Only quotes, whitespace and a colon may sit between the path and the failure. Prose may not —
    // and that single restriction is what separates "the tool could not open this path" from "this
    // finding is ABOUT this path": a review finding always names its file, so anything looser marks
    // every file-handling review as wrong-tree. (Codex, gpt-5.6-sol, on the first version of this
    // function: the finding line "- [P2] Do not swallow file not found - src/io.ts:42" plus a stated
    // grade C was classified wrong-tree, discarding a valid cross-family verdict and falling back to
    // same-family QE — the guard against a false-clean review destroying a true one.)
    const GAP = '["\'\u2018\u2019\u201c\u201d\u0060(\\[\\s:,]{0,4}';
    const NOT_FOUND = 'no such file or directory|file not found|not found|does not exist|is not present|cannot be found';
    const VERB = '(?:cannot|can\'t|could not|couldn\'t|unable to|failed to|error(?: while)?)\\s+(?:open|read|find|access|stat|locate|load)';
    for (const f of files) {
        const q = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const shapes = [
            q + GAP + '(?:' + NOT_FOUND + ')', // src/io.ts: No such file or directory
            '(?:' + NOT_FOUND + ')' + GAP + q, // No such file or directory: src/io.ts
            VERB + GAP + q, // cannot open 'src/io.ts'
        ];
        for (const shape of shapes)
            if (new RegExp(shape, 'i').test(text))
                return true;
    }
    return false;
}
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
export function classifyCodexQeOutcome(input) {
    const o = input || {};
    const body = String(o.body === undefined || o.body === null ? '' : o.body);
    const exit = o.exit === undefined || o.exit === null ? null : Number(o.exit);
    const grade = o.grade === undefined || o.grade === null || o.grade === '' ? null : String(o.grade);
    const signalExpected = o.signalExpected === undefined ? true : !!o.signalExpected;
    if (exit === 124)
        return { kind: 'timeout' };
    if (body.trim() === '')
        return { kind: 'unusable-output' };
    // The TEXT sentinels are evidence only when there is NO machine signal. FOUND BY THE FIRST LIVE
    // MODE-A RUN (2026-08-21): `codex review --uncommitted` over this very feature's diff exited 0 in
    // 482 s with six real findings, and was classified `timeout` — because the DIFF ITSELF contains the
    // line `CODEX_TIMEOUT = 'CODEX_TIMEOUT'`. A reviewer quoting the code under review is the normal
    // case for a diff-scoped review, so a content sentinel that outranks the exit code turns any review
    // of this file into a fake timeout. When the exit code is known it is authoritative.
    if (exit === null) {
        if (body.indexOf(CODEX_TIMEOUT) !== -1)
            return { kind: 'timeout' };
        if (body.indexOf(CODEX_UNAVAILABLE) !== -1)
            return { kind: 'unavailable' };
        if (signalExpected)
            return { kind: 'tool-error' };
    }
    else if (exit !== 0) {
        return { kind: 'tool-error' };
    }
    // BEFORE the grade rule, and deliberately so: a wrong-tree review usually DOES state a grade, and
    // that grade is the most dangerous output this pipeline can produce — a clean letter about code
    // nobody read, recorded while crossFamilyQe.happened stays true.
    if (codexReviewMissedItsFiles(body, input ? input.declaredFiles : null))
        return { kind: 'wrong-tree' };
    if (grade !== null)
        return { kind: 'verdict' };
    return { kind: 'no-verdict' };
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
export function codexQeDeclineReason(kind, detail) {
    const d = detail || {};
    const k = String(kind === undefined || kind === null ? '' : kind);
    const canonical = k === 'empty' ? 'unusable-output' : k === 'ceiling' ? 'over-ceiling' : k;
    const secs = d.elapsedSeconds === undefined || d.elapsedSeconds === null ? d.seconds : d.elapsedSeconds;
    const elapsed = secs === undefined || secs === null ? '?' : String(secs);
    const ref = d.ref === undefined || d.ref === null || String(d.ref) === '' ? 'unknown' : String(d.ref);
    const files = d.files === undefined || d.files === null ? '?' : String(Array.isArray(d.files) ? d.files.length : d.files);
    const exit = d.exit === undefined || d.exit === null ? '?' : String(d.exit);
    const chars = d.chars === undefined || d.chars === null ? '?' : String(d.chars);
    const extra = d.detail === undefined || d.detail === null || String(d.detail) === '' ? 'no detail' : String(d.detail);
    if (canonical === 'wrong-tree') {
        return 'codex reported that the declared file(s) do not exist — the review ran in the WRONG working directory and its verdict is about a tree nobody asked for; ' + files + ' file(s) declared, exit ' + exit + ' (' + extra + ')';
    }
    if (canonical === 'timeout') {
        return 'codex review timed out after ' + elapsed + 's on scope ' + ref + ' (' + files + ' files) — NARROW the scope (this is reconnaissance cost, not thinking time)';
    }
    if (canonical === 'no-verdict') {
        return 'codex answered in ' + elapsed + 's but named no grade — not a verdict';
    }
    if (canonical === 'tool-error') {
        return 'codex review exited ' + exit + ' — FIX the invocation (' + extra + ')';
    }
    if (canonical === 'unusable-output') {
        return 'codex exec unusable — ' + (d.reason === undefined || d.reason === null || String(d.reason) === '' ? 'codex exec returned no text' : String(d.reason));
    }
    if (canonical === 'unavailable') {
        // The detail is the ONE field that carries the shell error, and this branch used to drop it
        // while `tool-error` right above rendered it — an asymmetry that made the field report's
        // "codex exec reported it could not run" unfixable blind. Same `extra`, same shape.
        const why = d.reason === undefined || d.reason === null || String(d.reason) === '' ? 'codex exec reported it could not run' : String(d.reason);
        return 'codex not used — ' + why + (extra === 'no detail' ? '' : ' (' + extra + ')');
    }
    if (canonical === 'over-ceiling') {
        return 'prompt is ' + chars + ' chars / unscoped — refused before dispatch';
    }
    throw new Error('codexQeDeclineReason: unknown kind ' + k);
}
/**
 * The ADR's spelling of {@link codexQeDeclineReason}. Accepts BOTH call shapes — the ADR's
 * `({kind, seconds, detail})` object and the taxonomy's positional `(kind, detail)` — so both cited
 * call sites resolve to one implementation instead of two that can drift.
 */
export function codexDeclineReason(a, b) {
    if (a && typeof a === 'object') {
        const o = a;
        return codexQeDeclineReason(o.kind, o);
    }
    return codexQeDeclineReason(a, b);
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
export function parseCodexReviewResult(text, declaredFiles) {
    const sig = parseCodexReviewSignal(text);
    const findings = parseCodexReviewFindings(sig.body);
    const stated = parseCodexGrade(sig.body);
    const grade = stated !== null ? stated : gradeFromReviewFindings(findings);
    const outcome = classifyCodexQeOutcome({ exit: sig.exit, body: sig.body, grade: grade, findings: findings, signalExpected: sig.signalPresent, declaredFiles: declaredFiles === undefined ? null : declaredFiles });
    const kind = outcome.kind === 'unusable-output' ? 'empty' : outcome.kind;
    const ok = kind === 'verdict';
    const reason = ok ? null : codexQeDeclineReason(kind, { elapsedSeconds: sig.elapsedSeconds, exit: sig.exit, chars: sig.body.length });
    return {
        ok: ok,
        grade: ok ? grade : null,
        kind: kind,
        gradeSource: ok ? (stated !== null ? 'stated' : 'derived-from-findings') : null,
        findings: findings,
        reason: reason,
    };
}
/** CX-3: a workflow that names an agent type the harness does not have must fall back, not die. */
export function isAgentTypeMissingError(err) {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return /agent type .*not found|unknown agent type|no such agent/i.test(msg);
}
/**
 * Run a Codex-routed agent so that a missing agent type demotes to `null` (→ the caller's Claude
 * fallback) instead of throwing and killing the whole run. Any other error still propagates: we do
 * not want to swallow real bugs behind a fallback.
 */
export async function safeCodexAgent(agentFn, prompt, opts, log) {
    try {
        return await agentFn(prompt, opts);
    }
    catch (err) {
        if (isAgentTypeMissingError(err)) {
            log('codex: agent type unavailable — falling back to Claude (' + String(err) + ')');
            return null;
        }
        throw err;
    }
}
// ── ABSOLUTE ARTIFACT ROOT (ADR-001, absolute-artifact-paths) ────────────────
//
// `FDIR` (and `BRAIN`, which derives from the same value) used to be relative, because
// `args.repo` defaults to `'.'`. A relative path means different things to different agents: once a
// coder `cd`s elsewhere, a later agent resolves `./features/<slug>/03_adr` against another cwd, finds
// nothing, and reports a confident FALSE BLOCKER while the artifacts sit at the workflow root.
//
// The workflow script is sandboxed — no filesystem, no Node API — so it cannot call `process.cwd()`.
// The absolute root arrives either as an absolute `args.repo`, or from an agent that runs `pwd`.
// The resolver below takes `cwd` as a PARAMETER so it is testable without ambient state.
/** True for a POSIX absolute path. */
export function isAbsolutePosix(p) {
    return typeof p === 'string' && p.charAt(0) === '/';
}
/**
 * Collapse `a//b`, `a/./b` and a trailing slash. Deliberately does NOT resolve `..` — a workflow root
 * containing `..` is a caller error we would rather surface than silently normalise away.
 */
export function normalizeRepoPath(p) {
    const collapsed = p.replace(/\/{2,}/g, '/').replace(/\/\.(?=\/|$)/g, '');
    const trimmed = collapsed.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
}
/**
 * Resolve the artifact root to an absolute path.
 *
 * `raw` is `args.repo` (may be `'.'`, `'./x'`, `'x/'`, or already absolute).
 * `cwd` is the absolute working directory, obtained ONCE from a `pwd` agent — never ambient.
 * An already absolute `raw` ignores `cwd` entirely (zero agents on that path).
 */
export function absolutizeRepo(raw, cwd) {
    const r = typeof raw === 'string' && raw.length > 0 ? raw : '.';
    if (isAbsolutePosix(r))
        return normalizeRepoPath(r);
    const base = normalizeRepoPath(cwd);
    const rel = r.replace(/^\.\/+/, '').replace(/^\.$/, '');
    return rel === '' ? base : normalizeRepoPath(base + '/' + rel);
}
/** The instruction appended to prompts that embed an artifact path (FR-3). */
export const ABSOLUTE_PATH_NOTE = ' All artifact paths in this prompt are ABSOLUTE. Read and write them exactly as given; do not cd' +
    ' first and do not re-relativize them.';
/**
 * Pick the absolute path out of possibly chatty `pwd` output.
 *
 * Cross-model review (codex exec, 2026-07-10) found `.split('\n').pop()` selects the LAST line — so a
 * `pwd` agent that appends "Done" would degrade the run despite having printed a valid path. Take the
 * last line that actually looks like an absolute path.
 */
export function pickAbsolutePathLine(text) {
    if (typeof text !== 'string')
        return null;
    const abs = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => isAbsolutePosix(l));
    return abs.length ? abs[abs.length - 1] : null;
}
/** `args.repo` may be anything the caller passed. A non-string must not throw on `.replace`. */
export function coerceRepoArg(raw) {
    return typeof raw === 'string' && raw.length > 0 ? raw.replace(/\/+$/, '') : '.';
}
/**
 * Round-2 cross-model review (codex exec, 2026-07-10) — three path-safety defects, all real:
 *   1. `..` segments survived normalisation, so `args.repo='../evil'` produced an absolute-but-unstable
 *      root. Under the fail-fast stance this is a refusal, not a normalisation.
 *   2. A newline in `args.repo` could split an embedded path across lines in a prompt.
 *   3. `SLUG` was concatenated raw: `'../../outside'` escapes the `features/` directory entirely.
 */
const UNSAFE_PATH_CHARS = /[\u0000-\u001f\u007f]/;
const DOT_DOT_SEGMENT = /(^|\/)\.\.(\/|$)/;
export function hasUnsafePathChars(p) {
    return UNSAFE_PATH_CHARS.test(String(p));
}
export function hasDotDotSegment(p) {
    return DOT_DOT_SEGMENT.test(String(p));
}
/** The slug names a directory under `features/`. Kebab-case, Latin, max 40 chars — the documented rule. */
export function isSafeSlug(slug) {
    return typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(slug);
}
/** Returns an error message, or `null` when the root is safe to embed in a prompt. */
export function checkArtifactRoot(root) {
    if (!isAbsolutePosix(root))
        return 'artifact root is not absolute: ' + JSON.stringify(root);
    if (hasUnsafePathChars(root))
        return 'artifact root contains control characters';
    if (hasDotDotSegment(root))
        return 'artifact root contains a ".." segment: ' + root;
    return null;
}
// ── K2 plan-completeness gate (feature fa-plan-gate-wiring) ────────────────────────────────────
// Step 7 must not start on an incomplete plan. The gate is a SCRIPT the pipeline shells out to;
// these two pure halves build its command and PARSE its verdict. The workflow inlines byte-equivalent
// copies (drift-guarded), because the workflow sandbox cannot import.
/** The one path the pipeline calls. Repo-relative — the command `cd`s into the repo root first. */
export const PLAN_GATE_SCRIPT = '.claude/skills/feature-adr/scripts/check-plan-completeness.mjs';
/** Both interpolated knobs are shell-spliced, so both get the same build-time shape check. */
function assertAbsoluteNoTraversal(value, knob) {
    if (typeof value !== 'string' || value === '')
        throw new Error('planCompletenessGateCmd: opts.' + knob + ' must be a non-empty absolute path');
    if (value.charAt(0) !== '/')
        throw new Error('planCompletenessGateCmd: opts.' + knob + ' must be an ABSOLUTE path, got ' + JSON.stringify(value));
    if (/(^|\/)\.\.(\/|$)/.test(value))
        throw new Error("planCompletenessGateCmd: opts." + knob + " must not contain a '..' segment, got " + JSON.stringify(value));
    return value;
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
export function planCompletenessGateCmd(repo, featureDir, tier, opts) {
    const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
    const t = (typeof tier === 'string' && tier !== '') ? ' --tier=' + q(tier) : '';
    if (opts === undefined || opts === null) {
        return 'cd ' + q(repo) + ' && node ' + q(PLAN_GATE_SCRIPT) + ' ' + q(featureDir) + t + ' 2>&1; echo K2_EXIT=$?';
    }
    const explicit = (opts.gateScript === undefined || opts.gateScript === null) ? null : assertAbsoluteNoTraversal(opts.gateScript, 'gateScript');
    const ws = (opts.workspace === undefined || opts.workspace === null) ? null : assertAbsoluteNoTraversal(opts.workspace, 'workspace');
    // WS is captured BEFORE the cd — that ordering is the whole point; a 'pwd -P' after the cd would
    // report the target repo and the chain would collapse back into the defect it fixes.
    const wsAssign = ws === null ? 'WS=$(pwd -P)' : 'WS=' + q(ws);
    return [
        wsAssign + "; GS=''",
        'C1=' + (explicit === null ? "''" : q(explicit)) + '; C2="$WS/' + PLAN_GATE_SCRIPT + '"; C3=' + q(repo + '/' + PLAN_GATE_SCRIPT),
        'for c in "$C1" "$C2" "$C3"; do [ -n "$c" ] && [ -f "$c" ] && { GS="$c"; break; }; done',
        // Audit lines, printed ALWAYS and BEFORE any verdict line: which copy ran, and what was tried.
        // They are deliberately not verdict-shaped, so the parser's last-match anchoring is untouched,
        // and the tried paths live OUTSIDE the verdict line so no path can smuggle a second verdict word
        // into it.
        'echo "K2_GATE_SCRIPT=${GS:-none}"',
        'echo "K2_GATE_TRIED=C1(args.gateScript)=${C1:-<unset>} | C2(workspace)=$C2 | C3(target-repo)=$C3"',
        // A COLLAPSE is not a second candidate. When the workspace was not pinned, WS falls back to the
        // gate agent own cwd — in the field that WAS the target repo, so C2 and C3 printed the same path
        // twice and the chain silently degenerated from three candidates to two. Saying so turns a
        // puzzling duplicate into an instruction. Not verdict-shaped, so the parser anchoring is untouched.
        '[ "$C2" = "$C3" ] && echo "K2_GATE_NOTE=the workspace candidate resolved to the TARGET repo (WS==repo), so only two distinct candidates were tried; pass args.workspace or args.gateScript when the feature-adr skill is installed outside the target repo"',
        'if [ -z "$GS" ]; then echo "K2 plan-completeness: NOT-ESTABLISHED — tooling-missing: no gate script at any candidate on the K2_GATE_TRIED line above"; echo "K2_EXIT=3"; else cd ' + q(repo) + ' && node "$GS" ' + q(featureDir) + t + ' 2>&1; echo "K2_EXIT=$?"; fi',
    ].join('\n');
}
/**
 * PARSE-NEVER-SYNTHESIZE. An empty reply, a reply with no verdict line, a missing/unknown exit code,
 * or a verdict line that DISAGREES with the exit code are all `not-established` — never a pass. The
 * quiet failure this forecloses: a dead or chatty agent reading as a clean gate.
 */
export function parsePlanGateVerdict(raw) {
    const text = String(raw === null || raw === undefined ? '' : raw);
    const output = text.slice(0, 2000);
    if (text.trim() === '')
        return { verdict: 'not-established', exit: null, reason: 'empty-agent-reply', output: output };
    // G-F1 (reproduced by execution): the checker ECHOES plan-controlled content, so a forged verdict
    // line and a forged K2_EXIT trailer can appear EARLIER in this stream. The script always writes its
    // own verdict LAST, so both halves anchor to the LAST match — a first-match read let a planted
    // 'K2 plan-completeness: PASS (0) K2_EXIT=0' target line forge a pass on a genuine FAIL/1 run.
    const exitAll = text.match(/K2_EXIT=(\d+)/g);
    const lastExit = exitAll === null ? null : /K2_EXIT=(\d+)/.exec(String(exitAll[exitAll.length - 1]));
    const exitCode = lastExit === null ? null : Number(lastExit[1]);
    const verdictAll = text.match(/K2 plan-completeness:\s*(PASS|FAIL|NOT-ESTABLISHED)/g);
    if (verdictAll === null)
        return { verdict: 'not-established', exit: exitCode, reason: 'no-verdict-line', output: output };
    const lastVerdict = String(verdictAll[verdictAll.length - 1]);
    const byName = lastVerdict.indexOf('PASS') >= 0 ? 'pass' : (lastVerdict.indexOf('FAIL') >= 0 ? 'fail' : 'not-established');
    const byExit = exitCode === 0 ? 'pass' : (exitCode === 1 ? 'fail' : (exitCode === 3 ? 'not-established' : null));
    if (byExit === null)
        return { verdict: 'not-established', exit: exitCode, reason: 'unknown-exit-code', output: output };
    if (byExit !== byName)
        return { verdict: 'not-established', exit: exitCode, reason: 'verdict-exit-mismatch', output: output };
    // P16/D2: a REFINEMENT of the reason, not a new verdict. The verdict vocabulary stays three values,
    // so every banner and exit-code table pinned by tests keeps meaning what it meant. A forged
    // K2_EXIT=0 under a NOT-ESTABLISHED line still returns verdict-exit-mismatch above — the new
    // reason is read only after both halves already agree.
    const lastAt = text.lastIndexOf(lastVerdict);
    const nl = text.indexOf('\n', lastAt);
    const lastLine = nl < 0 ? text.slice(lastAt) : text.slice(lastAt, nl);
    const reason = (byName === 'not-established' && /tooling-missing:/.test(lastLine)) ? 'tooling-missing' : 'script-verdict';
    return { verdict: byName, exit: exitCode, reason: reason, output: output };
}
/**
 * The operator note a refused plan gate carries — ONE reason→text table, so the workflow's inline
 * copy cannot drift into telling an operator to fix a plan that is not broken.
 *
 * AM-2/AM-7: before P16 this text was inline and UNCONDITIONAL ("exit 1 ⇒ fix the FAIL lines"),
 * which is actively wrong for a gate that never RAN. Existence of a branch is not proof it fires,
 * so the table is exported and unit-tested on both reasons.
 */
export function refusalNoteFor(planGate, slug) {
    const exitTxt = planGate.exit === null ? 'unknown' : String(planGate.exit);
    const head = 'REFUSED at the Step-6/7 boundary: the K2 plan-completeness gate returned ' + String(planGate.verdict).toUpperCase() + ' (exit=' + exitTxt + ', reason=' + planGate.reason + '). Step 7 was NOT dispatched. ';
    if (planGate.reason === 'tooling-missing') {
        return head + 'The gate could not be RUN. This is NOT a plan defect — do NOT edit the plan. Reinstall the feature-adr skill into the workspace this run started in, or re-invoke with args.gateScript=<absolute path to check-plan-completeness.mjs>. Every path that was tried is on the K2_GATE_TRIED line of the gate output below. The plan stage is checkpointed, so once the gate is reachable a bare re-invoke resumes it and nothing is re-planned. Gate output:\n' + planGate.output;
    }
    return head + 'exit 1 ⇒ fix the plan per the FAIL lines below and re-invoke; exit 3 / not-established ⇒ INCONCLUSIVE, the gate could not read its inputs (fix them and rerun) — it is never a pass. HOW TO REPAIR (the plan stage is checkpointed, so a bare re-invoke RESUMES this same failing plan): edit features/' + slug + "/06_implementation_plan.md to fix the FAIL lines and re-invoke — the plan checkpoint is keyed on run INPUTS, not on the file, so your edit is NOT re-planned away; to force a fresh plan instead, re-invoke with args.resume='never' (or delete features/" + slug + '/.fa-state/). Gate output:\n' + planGate.output;
}
/**
 * ADR-003 — pin a RELATIVE `args.dzBin` to the workspace root once, at the point of definition.
 *
 * `DZ` is spliced into commands that first `cd` into the target repo, into the brain, or into
 * nothing at all (the usage probe), so a relative binary path resolves against three different
 * bases and silently returns nothing on at least two of them — and a null usage probe is read
 * upstream as "the limit was hit", which fail-safe-switches a healthy run to Codex.
 * A bare `dz` (no slash) keeps PATH resolution; an already-absolute value is returned untouched.
 */
export function normalizeDzBin(raw, ws) {
    const r = (typeof raw === 'string' && raw.length > 0) ? raw : 'dz';
    if (r.indexOf('/') < 0)
        return r;
    if (r.charAt(0) === '/')
        return r;
    const base = (typeof ws === 'string' && ws.length > 0) ? ws.replace(/\/+$/, '') : '';
    return base === '' ? r : base + '/' + r;
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
export function crossFamilyQe(opts) {
    // NORMALISE before comparing. A cross-family reviewer graded the first version B and named this:
    // families were compared as RAW strings, so `reviewerFamily: 'Claude'` against
    // `coderFamily: 'claude'` reported happened:true with a clean label — the same loss this helper
    // exists to expose, walking back in through letter case.
    const norm = (f) => String(f ?? '').trim().toLowerCase();
    const coderFamily = norm(opts.coderFamily);
    const reviewerFamily = norm(opts.reviewerFamily);
    // An empty family is not a family. Calling '' different from 'claude' would report a cross-family
    // review nobody can name, so an unnameable side counts as NOT cross-family.
    const nameable = coderFamily !== '' && reviewerFamily !== '';
    const happened = nameable && coderFamily !== reviewerFamily;
    const stated = opts.declineReason !== null && opts.declineReason !== undefined && String(opts.declineReason).trim() !== ''
        ? String(opts.declineReason).trim()
        : null;
    const reason = happened
        ? null
        : (stated ?? (nameable ? 'reviewer family equals coder family' : 'reviewer or coder family not named'));
    const report = {
        requested: opts.requestedSpec ?? null,
        actual: opts.actualLabel,
        coderFamily,
        reviewerFamily,
        happened,
        reason,
    };
    // The label is what a human skims. It must not read clean when the property was lost.
    const label = happened
        ? opts.actualLabel
        : `${opts.actualLabel} (cross-family QE DID NOT happen — ${reason})`;
    return { report, label };
}
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
export function decideModeBScope(opts) {
    if (opts.landingStatus === 'genuinely-not-landed') {
        return { ok: false, reason: 'the landing barrier established the code did not land — there is nothing to review' };
    }
    if (opts.changed === null || opts.changed === undefined) {
        return { ok: false, reason: 'the change set could not be measured — scope is NOT ESTABLISHED, which is never a pass' };
    }
    const planned = opts.planned.map((p) => String(p)).filter((p) => p !== '');
    if (planned.length === 0) {
        return { ok: false, reason: 'no declared targets — a scoped review needs a declared scope' };
    }
    const changedSet = new Set(opts.changed.map((c) => String(c)));
    const files = planned.filter((p) => changedSet.has(p));
    const dropped = planned.filter((p) => !changedSet.has(p));
    if (files.length === 0) {
        return { ok: false, reason: 'none of the ' + planned.length + ' declared target(s) actually changed — the review would be of unchanged code' };
    }
    return { ok: true, files, dropped };
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
export function partitionReviewFindings(findings, inScopePaths) {
    const list = Array.isArray(findings) ? findings : [];
    const paths = (inScopePaths ?? []).map((p) => String(p)).filter((p) => p !== '');
    if (paths.length === 0)
        return { inScope: [], outOfScope: [], unlocatable: list, unscoped: true };
    const belongs = (loc) => {
        const l = String(loc ?? '');
        // A location is `<path>:<line>` or `<abs-path>:<line>-<line>`; match on the path SEGMENT so an
        // absolute location still matches its repo-relative target, and a mere substring cannot.
        if (paths.some((p) => l === p || l.startsWith(p + ':') || l.includes('/' + p + ':') || l.endsWith('/' + p)))
            return true;
        // A location whose SHAPE we can parse (`<path>:<line>`) has already had its say above — a loose
        // substring must not override it, or `other/src/a.ts.bak:3` would be claimed by `src/a.ts`.
        // But a shape we CANNOT parse yet which names an in-scope file is ours (`src/a.ts line 10`):
        // reading "I could not parse this" as "it belongs to someone else" is how a finding about our own
        // file would quietly leave the grade.
        if (/[\w./-]+:\d/.test(l))
            return false;
        return paths.some((p) => l.includes(p));
    };
    const inScope = [];
    const outOfScope = [];
    const unlocatable = [];
    // A location we can PARSE and that names another file is out of scope. A location we cannot parse
    // proves nothing, so it goes to `unlocatable` and the caller must not rescore without it.
    // Purely about SHAPE now: does the location name some file at some line? If it does and it is not
    // ours, it is another file's. If it does not, we know nothing.
    const parseable = (loc) => /[\w./-]+:\d/.test(String(loc ?? ''));
    for (const f of list) {
        const loc = f && f.location ? f.location : '';
        if (belongs(loc))
            inScope.push(f);
        else if (parseable(loc))
            outOfScope.push(f);
        else
            unlocatable.push(f);
    }
    return { inScope, outOfScope, unlocatable, unscoped: false };
}
/**
 * Parse a `sha256sum` probe into a snapshot, tolerating the "no such file" lines it prints to stderr.
 *
 * Presence is not the question — CONTENT is. A file that was already dirty before Step 7 and then
 * edited by Step 7 must count as changed, and `git status` cannot tell those apart: it reports the
 * file as dirty in both cases. That is one half of why the old probe measured the wrong thing.
 */
export function parseHashProbe(text, declared) {
    const out = new Map();
    for (const p of declared)
        out.set(String(p), null);
    for (const raw of String(text ?? '').split('\n')) {
        const line = raw.trim();
        if (line === '')
            continue;
        const m = /^([0-9a-f]{64})\s+(.+)$/.exec(line);
        if (m === null || m[1] === undefined || m[2] === undefined)
            continue;
        const path = m[2].trim().replace(/^\.\//, '');
        if (out.has(path))
            out.set(path, m[1]);
    }
    return out;
}
/**
 * Which declared targets actually changed between two snapshots.
 *
 * Returns `null` when either snapshot is missing — an unmeasured delta is NOT an empty delta, and the
 * callers treat null as "scope not established", which is never a pass.
 */
export function changedFromHashes(before, after) {
    if (before === null || before === undefined || after === null || after === undefined)
        return null;
    const changed = [];
    for (const [path, afterHash] of after) {
        const beforeHash = before.has(path) ? before.get(path) ?? null : null;
        if (beforeHash !== (afterHash ?? null))
            changed.push(path);
    }
    return changed.sort();
}
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
export function changeSetProbeCmd(opts) {
    const paths = opts.paths.map((p) => String(p)).filter((p) => p !== '');
    if (paths.length === 0)
        return null;
    const quoted = paths.map(opts.quote).join(' ');
    const ref = String(opts.ref ?? '').trim();
    if (opts.scope === 'commit') {
        if (ref === '')
            return null;
        return 'git diff --name-only ' + opts.quote(ref) + '~1 ' + opts.quote(ref) + ' -- ' + quoted;
    }
    if (opts.scope === 'base') {
        if (ref === '')
            return null;
        return 'git diff --name-only ' + opts.quote(ref) + '...HEAD -- ' + quoted;
    }
    // uncommitted: hash the declared targets; the caller pairs this with a pre-code baseline.
    return 'sha256sum -- ' + quoted + ' 2>/dev/null || true';
}
//# sourceMappingURL=feature-adr-routing.js.map