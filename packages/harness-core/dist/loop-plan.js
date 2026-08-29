/**
 * `loop-plan/1` — the versioned, typed workflow-plan schema of the loop-designer meta-factory
 * (feature loop-designer, ADR-001).
 *
 * ONE semantic source of truth (the plan) with THREE derived analytical projections (AM-3 /
 * Codex 04/Q1's "one plan, three projections" correction):
 *   - `toOracleProjection`  → graph-diff against a hand-authored, requirement-derived oracle;
 *   - `toLintProjection`    → CFG with synthetic entry/exit + explicit fork/join pairs for
 *                             `loop-lint.ts` (barrier post-dominance, budget, reachability);
 *   - `toTraceProjection`   → expected runtime invariants for `loop-trace.ts::runInvariants`.
 * No consumer reads `plan.steps`/`plan.deps`/… directly — enforced by the layer-1 source grep
 * `loop-projection-consumers.test.ts` (empty allowlist).
 *
 * This schema deliberately carries NO LangGraph branding and adopts none of LangGraph's execution
 * semantics (AM-7): it is an internally-versioned typed plan that names its own semantics —
 * `RetryProfile.maxAttempts` INCLUDES the initial attempt (AM-4), retryable failure classes are a
 * CLOSED serializable enum (never a callable), `cache` (keyed on normalized input) is a SEPARATE
 * identity from `checkpointing` (keyed on execution position — INV-6).
 *
 * Extension point: any top-level or per-step key matching /^x-/ is accepted by `parsePlan`,
 * preserved by `normalizePlan` in canonical order (so it participates in `planDigest`), and
 * ignored by `validatePlan` and all three projections (narrowing N-2 — vendor/consumer data such
 * as a cfr case-set rides as `x-caseSet` without schema surgery).
 *
 * Everything here is pure (node:crypto for the digest only — no fs, no clock, no randomness).
 */
import { createHash } from 'node:crypto';
import { TRACE_KEY_RE } from './loop-trace.js';
// The ONE ceiling formula (ADR-004 Confirmation-2) — imported so the run projection's
// `budgetTotal` and the rendered script's `__budget` constant cannot drift into two ceilings.
// loop-run-semantics has no runtime import of its own, so this edge introduces no cycle.
import { computeBudgetTotal } from './loop-run-semantics.js';
export const LOOP_PLAN_SCHEMA = 'loop-plan/1';
/** Blob/schema version stamp read by scripts/gen-loop-blobs.mjs (this module is NOT a blob source
 * today; the stamp keeps the convention uniform for every loop-designer module). */
export const LOOP_PLAN_MODULE_VERSION = '1.0.0';
/** CLOSED serializable failure-class enum (AM-4 — never a callable). */
export const RETRYABLE_FAILURE_CLASSES = ['timeout', 'transport', 'malformed-output', 'policy-refusal'];
/** The closed join-policy set (INV-3). `quorum:<n>` is validated by pattern. */
export const JOIN_POLICIES = ['all-declared', 'all-activated', 'any'];
export const QUORUM_RE = /^quorum:[1-9][0-9]*$/;
const STEP_ID_RE = /^[a-z0-9_.:-]{1,64}$/;
/**
 * THE ItemKey domain — ONE regex object, shared by the PLAN layer (`fanouts[].registry` items) and
 * the TRACE layer (`loop-trace.ts`'s dispatch-event `itemKey`/`stepId` VO check). It is the SAME
 * object, not a copy: `ITEM_KEY_RE === TRACE_KEY_RE` is asserted by test, so the two layers can
 * never drift apart.
 *
 * QE round-7 (Codex round-6 R2/R3, MEASURED): `registry: ["hello world"]` parsed and validated
 * with ZERO findings — INV-2 checked only that the registry was a non-empty string array — and the
 * run then behaved DIFFERENTLY depending on a field that is supposed to be observational only:
 * with `trace.emit:false` it COMPLETED with one member call; with `trace.emit:true` it died BEFORE
 * the member call with `loop-trace: refusing non-conforming event (itemKey fails its VO regex)`.
 * A declared, retained field whose plan-domain and runtime-domain disagree is exactly the "a valid
 * plan promises what the runtime will not perform" class; the domain is now ONE, checked at parse.
 */
export const ITEM_KEY_RE = TRACE_KEY_RE;
/** The ItemKey validator both layers use (the plan half; the trace half calls the same regex). */
export function isItemKey(v) {
    return typeof v === 'string' && ITEM_KEY_RE.test(v);
}
/**
 * COLLISION-RESISTANT stepId → JS-identifier lowering, with parse-time collision rejection by
 * IDENT-1 (QE round-6; the round-5 reviewer's named third class: `a-b` and `a.b` both lowered to
 * `a_b`, so two LEGAL distinct stepIds rendered `SyntaxError: Identifier 'USER_PROMPT_a_b' has
 * already been declared`). A lossless id (already a pure `[A-Za-z0-9_]` word) lowers to itself; a
 * LOSSY sanitization always appends an 8-hex sha256 suffix of the ORIGINAL id, so two distinct ids
 * no longer collide by ACCIDENT. The IDENT-1 parse check is the belt — both for crafted names that
 * imitate the suffix form and for the (astronomically unlikely by accident, cheap for an attacker)
 * truncated-hash collision. This function is NOT injective; see the honesty note below.
 *
 * HONESTY NOTE (QE round-7 — the round-6 reviewer's caveat, CONCEDED verbatim: "an 8-hex truncated
 * hash is not itself mathematically injective; the parse belt supplies the actual safety"). A
 * 32-bit truncation of sha256 is COLLISION-RESISTANT, not INJECTIVE: over a 32-bit codomain,
 * distinct originals with the same sanitized stem CAN in principle share a suffix (finding such a
 * pair costs ~2^16 tries by the birthday bound — cheap for an ATTACKER, unreachable by accident).
 * So the guarantee this function carries alone is "no ACCIDENTAL collision"; the guarantee that a
 * plan with two ids lowering to one identifier is REJECTED is IDENT-1's (parsePlan), which
 * compares the ACTUAL lowered strings and needs no injectivity assumption. IDENT-1 is the safety
 * belt; widening the suffix would only move the bound, never remove the need for the belt.
 */
export function stepIdent(stepId) {
    const clean = stepId.replace(/[^A-Za-z0-9_]/g, '_');
    if (clean === stepId)
        return stepId;
    return clean + '_' + createHash('sha256').update(stepId, 'utf8').digest('hex').slice(0, 8);
}
function isRecord(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isStringArray(v) {
    return Array.isArray(v) && v.every((s) => typeof s === 'string');
}
/** Keys are `<Interface>.<field>` plus `<inlineField>.<sub>` — EXACTLY the keys the honesty test
 * extracts from this file's interface source (both directions asserted there). */
export const FIELD_DOMAINS = {
    // ── LoopPlan ──
    'LoopPlan.schema': { t: 'bespoke' },
    'LoopPlan.name': { t: 'bespoke' },
    'LoopPlan.description': { t: 'bespoke' },
    'LoopPlan.whenToUse': { t: 'bespoke' },
    'LoopPlan.steps': { t: 'bespoke' },
    'LoopPlan.gates': { t: 'record[]' },
    'LoopPlan.fanouts': { t: 'record[]' },
    'LoopPlan.joins': { t: 'record[]' },
    'LoopPlan.pauses': { t: 'record[]' },
    'LoopPlan.checkpointing': { t: 'record' },
    'LoopPlan.subsystems': { t: 'record' },
    'LoopPlan.trace': { t: 'record' },
    'checkpointing.enabled': { t: 'boolean' },
    'checkpointing.schemaVersion': { t: 'string' },
    'trace.emit': { t: 'boolean' },
    // ── LoopSubsystems ──
    'LoopSubsystems.checkpoints': { t: 'boolean' },
    'LoopSubsystems.trainingPairs': { t: 'boolean' },
    'LoopSubsystems.usageAdaptive': { t: 'boolean' },
    'LoopSubsystems.challengePanel': { t: 'boolean' },
    'LoopSubsystems.codexDispatch': { t: 'boolean' },
    // ── LoopStep ──
    'LoopStep.stepId': { t: 'bespoke' },
    'LoopStep.title': { t: 'string' },
    'LoopStep.kind': { t: 'bespoke' },
    'LoopStep.phase': { t: 'bespoke' },
    'LoopStep.deps': { t: 'bespoke' },
    'LoopStep.prompt': { t: 'string' },
    'LoopStep.artifacts': { t: 'record' },
    'LoopStep.concurrency': { t: 'enum', values: ['barrier', 'pipeline'] },
    'LoopStep.model': { t: 'string|null' },
    'LoopStep.deliverable': { t: 'enum', values: ['return-value', 'file'] },
    'LoopStep.idempotent': { t: 'boolean' },
    'LoopStep.retry': { t: 'bespoke' },
    'LoopStep.cacheable': { t: 'boolean' },
    'LoopStep.cache': { t: 'record' },
    'LoopStep.checkpoint': { t: 'boolean' },
    'LoopStep.budget': { t: 'record' },
    'LoopStep.tools': { t: 'string[]' },
    'LoopStep.dispatch': { t: 'enum', values: ['inline', 'codex-wrapper', 'codex-exec'] },
    'LoopStep.pauseState': { t: 'string' },
    'artifacts.reads': { t: 'string[]' },
    'artifacts.writes': { t: 'string[]' },
    'budget.maxAgents': { t: 'number' },
    // ── RetryProfile ──
    // QE round-5 B1 (Codex R4: "retry.maxAttempts: 0 parses and validates … the runtime silently
    // clamps it to one attempt"): the DOMAIN owns the minimum — 0/negative/fractional is a PARSE
    // error, never a silent clamp. The emitted runtime keeps its >=1 guard as defense-in-depth only.
    'RetryProfile.maxAttempts': { t: 'posInt' },
    'RetryProfile.initialDelayMs': { t: 'number' },
    'RetryProfile.backoffMultiplier': { t: 'number' },
    'RetryProfile.maxDelayMs': { t: 'number' },
    'RetryProfile.jitter': { t: 'enum', values: ['none', 'full', 'deterministic'] },
    'RetryProfile.retryableFailureClasses': { t: 'bespoke' },
    // ── CachePolicy ──
    'CachePolicy.enabled': { t: 'boolean' },
    'CachePolicy.keyedOn': { t: 'enum', values: ['workflowVersion+stageVersion+normalizedInput+model+promptHash+toolSchemaHash+parameters+artifactHashes'] },
    'CachePolicy.ttl': { t: 'string' },
    'CachePolicy.invalidateOn': { t: 'string[]' },
    // ── LoopFanout ──
    'LoopFanout.stage': { t: 'string' },
    'LoopFanout.registry': { t: 'string[]' },
    'LoopFanout.maxFanout': { t: 'number' },
    'LoopFanout.overflow': { t: 'enum', values: ['window', 'truncate'] },
    'LoopFanout.truncateReason': { t: 'string' },
    'LoopFanout.dedup': { t: 'boolean' },
    'LoopFanout.reasonRequired': { t: 'boolean' },
    'LoopFanout.chain': { t: 'string[]' },
    // ── LoopJoin ──
    'LoopJoin.stage': { t: 'string' },
    'LoopJoin.forStage': { t: 'string' },
    'LoopJoin.branchSchema': { t: 'record' },
    'LoopJoin.joinPolicy': { t: 'string' }, // the closed SET is INV-3's (semantic); the raw TYPE is a string
    'LoopJoin.onInvalid': { t: 'string' }, // the enacted set is ENACT-JOIN's
    'branchSchema.caveats': { t: 'string[]' },
    // ── LoopGate ──
    'LoopGate.stepId': { t: 'string' },
    'LoopGate.kind': { t: 'string' },
    'LoopGate.failRoute': { t: 'string' },
    'LoopGate.maxRedos': { t: 'number' }, // integer/range semantics are GATE-1's
    // ── LoopPause ──
    'LoopPause.state': { t: 'string' },
    'LoopPause.payloadSchema': { t: 'record' },
    'LoopPause.resumeArg': { t: 'string' }, // non-emptiness is INV-5's
};
// ─────────────────────────────────────────────────────────────────────────────
// CLOSED-WORLD KEY SETS (QE round-7 B1 class-kill; Codex round-6 R1/R3 BLOCKER, MEASURED: five
// unknown non-`x-` keys — `steps[].retry.delayMs`, `steps[].dispatchRoute:"codex-exec"`,
// `subsystems.codexExec:true`, `checkpointing.version`, top-level `retryTiming` — parsed with ZERO
// diagnostics, were preserved into the plan digest, and did NOTHING at runtime; typos `trcae` /
// `promtp` did the same. `checkDomains` accepted any key whose FIELD_DOMAINS lookup was absent
// (`dom === undefined || domainAccepts(...)`), so the published contract "everything else is
// REJECTED with a named diagnostic" was false for the whole second-spelling/sibling-field space.
//
// THE MECHANISM (deliberately NOT a second hand-list): the known-key set per record kind is
// DERIVED from FIELD_DOMAINS — the same table the honesty enumeration pins, in BOTH directions,
// against the interface SOURCE of this file ("EVERY field declared in loop-plan.ts has a
// FIELD_DOMAINS entry, and no entry is stale"). Therefore: adding an interface field WITHOUT a
// domain entry fails the honesty test; adding it WITH one makes it known here automatically. There
// is exactly one roster, and it is the source's.
//
// WHAT THIS PROVES (updated 2026-08-17, idea d25a3c8a — the round-7 not-met bar item is now MET).
// PROVEN, and tested: every record path wired here is closed, the accepted roster is the source's,
// AND the roster is COMPLETE against the interface graph: `loop-plan-graph.ts` walks the interfaces
// reachable from LoopPlan in this file's SOURCE and the honesty test requires reachable == wired ==
// SCANNED. The reviewer's constructive counterexample (`LoopStep.extra?: ExtraPolicy` with a
// parent-only domain entry) is the ACCEPTANCE TEST: it goes red naming ExtraPolicy, by
// construction, before any hand step. Still out of scope, said plainly: interfaces referenced only
// through type ALIASES are followed one identifier deep (the graph collects declared-interface
// names from the field's type text); an alias chain that hides an interface behind a non-interface
// alias would need the alias declared in this file to be walked.
//
// EXTENSION CONVENIENCE (no longer load-bearing — the graph-completeness test reddens on a missed
// step by construction; this list just tells you what the red means). When you add a NEW nested
// record-typed field: 1) add `<NewIface>.<field>` entries to FIELD_DOMAINS for every field of the new interface
// (not just the `{t:'record'}` entry on its PARENT); 2) add the new interface to the honesty test's
// `SCANNED`; 3) add an `INJECT` site for it in the closed-world fuzz; 4) descend into it in
// `checkKeys`. A structural fix that derives 2–4 from the interface graph — so a new record kind is
// either wired automatically or fails LOUDLY as unknown — is filed as backlog idea
// `d25a3c8aef603921` (`dz backlog show d25a3c8aef603921`); until it lands, this list is the
// contract, and it lives one ladder-layer weaker than the property it protects.
// ─────────────────────────────────────────────────────────────────────────────
/** `<iface>` → its accepted field names, derived from FIELD_DOMAINS (never hand-written). */
export const KNOWN_KEYS = (() => {
    const m = {};
    for (const k of Object.keys(FIELD_DOMAINS)) {
        const dot = k.indexOf('.');
        const iface = k.slice(0, dot);
        const field = k.slice(dot + 1);
        const set = m[iface] ?? new Set();
        set.add(field);
        m[iface] = set;
    }
    return m;
})();
/** The record kinds that carry the documented `[xKey: \`x-${string}\`]` vendor escape — i.e. the
 * ONLY scopes where an `x-` key is accepted (Codex round-6: "Restrict `x-` acceptance to its
 * documented scopes"). The honesty test derives this set from the interface SOURCE (which
 * interfaces declare the index signature) in both directions, so it cannot drift either. */
export const X_KEY_IFACES = new Set(['LoopPlan', 'LoopStep']);
/**
 * REQUIRED fields per record kind (QE round-6; Codex round-5 R1 blocker 1: a `fanouts[]` record
 * with the REQUIRED `stage` field ABSENT parsed, validated, and rendered a zero-agent COMPLETED
 * run — `parsePlan` checked only PRESENT fields and XREF-1 skipped `undefined` targets).
 * Same discipline as FIELD_DOMAINS: the table is TOTAL over the schema's record kinds, and the
 * honesty test derives the expected sets from the interface SOURCE (fields declared without `?`),
 * so a new required field cannot ship unenforced and a stale entry cannot linger.
 *
 * Keys marked in OWNED_ABSENCE have dedicated absence diagnostics in parsePlan (kept verbatim for
 * message stability); the REQUIRED pass enforces everything else.
 */
export const REQUIRED_FIELDS = {
    LoopPlan: ['schema', 'name', 'description', 'whenToUse', 'steps'],
    LoopStep: ['stepId', 'kind', 'phase'],
    RetryProfile: ['maxAttempts'],
    CachePolicy: ['enabled', 'keyedOn'],
    LoopFanout: ['stage', 'registry', 'maxFanout'],
    LoopJoin: ['stage', 'forStage', 'joinPolicy'],
    LoopGate: ['stepId', 'kind'],
    LoopPause: ['state', 'resumeArg'],
    LoopSubsystems: [],
    checkpointing: ['enabled'],
    trace: ['emit'],
    artifacts: [],
    budget: ['maxAgents'],
    branchSchema: [],
};
/** `<iface>.<field>` keys whose ABSENCE is reported by a dedicated (pre-round-6) parse check —
 * the REQUIRED pass skips them so one absence yields one diagnostic. */
const OWNED_ABSENCE = new Set([
    'LoopPlan.schema',
    'LoopPlan.name',
    'LoopPlan.description',
    'LoopPlan.whenToUse',
    'LoopPlan.steps',
    'LoopStep.stepId',
    'LoopStep.kind',
    'LoopStep.phase',
    'RetryProfile.maxAttempts',
]);
function domainAccepts(dom, v) {
    switch (dom.t) {
        case 'bespoke':
            return true;
        case 'string':
            return typeof v === 'string';
        case 'boolean':
            return typeof v === 'boolean';
        case 'number':
            return typeof v === 'number' && Number.isFinite(v);
        case 'posInt':
            return typeof v === 'number' && Number.isInteger(v) && v >= 1;
        case 'enum':
            return typeof v === 'string' && dom.values.includes(v);
        case 'string[]':
            return isStringArray(v);
        case 'record':
            return isRecord(v);
        case 'record[]':
            return Array.isArray(v) && v.every(isRecord);
        case 'string|null':
            return v === null || typeof v === 'string';
    }
}
function describeDomain(dom) {
    switch (dom.t) {
        case 'bespoke':
            return 'checked by dedicated logic';
        case 'posInt':
            return 'an integer >= 1';
        case 'enum':
            return `one of ${dom.values.join('|')}`;
        case 'string[]':
            return 'a string array';
        case 'record':
            return 'an object';
        case 'record[]':
            return 'an array of objects';
        case 'string|null':
            return 'a string or null';
        default:
            return `a ${dom.t}`;
    }
}
/** KIND-APPLICABILITY matrix (QE round-4 B1, Codex R4: "a pause with deliverable:'file' and
 * artifacts.writes validated … and performed zero landed polls"): which LoopStep fields loop-render/1
 * ENACTS per step kind, declared as DATA and validated from it (KIND-1). A field present on a kind
 * that never enacts it is an unperformed promise and is REJECTED. Fanout chain members are kind
 * 'agent', so member fields ride the agent column (MEMBER-1 further restricts them). */
const ALL_KINDS = ['agent', 'fanout', 'join', 'gate', 'pause'];
const DISPATCHING_KINDS = ['agent', 'gate'];
export const STEP_FIELD_KINDS = {
    stepId: ALL_KINDS,
    title: ALL_KINDS,
    kind: ALL_KINDS,
    phase: ALL_KINDS,
    deps: ALL_KINDS,
    budget: ALL_KINDS, // budget is an ACCOUNTING weight — summed into the rendered budget guard for every kind
    prompt: DISPATCHING_KINDS,
    artifacts: DISPATCHING_KINDS,
    // the perimeter rides the PROMPT, so it enacts exactly where a prompt is dispatched — `tools`
    // on a fanout/join/pause step would be an unperformed promise (KIND-1 rejects it).
    tools: DISPATCHING_KINDS,
    model: DISPATCHING_KINDS,
    deliverable: DISPATCHING_KINDS,
    idempotent: DISPATCHING_KINDS,
    retry: DISPATCHING_KINDS,
    cacheable: DISPATCHING_KINDS,
    cache: DISPATCHING_KINDS,
    dispatch: DISPATCHING_KINDS,
    checkpoint: ['agent'], // historical granularity row — the FIELD itself is validated-away in v1 (ENACT-CKPT-OPT); only top-level agent steps checkpoint, as a renderer fact
    concurrency: ['fanout'],
    pauseState: ['pause'],
};
export const CROSS_REFS = [
    {
        ref: 'steps[].deps[]',
        targetKinds: ['agent', 'fanout', 'join', 'gate', 'pause'],
        consumes: 'dep ordering + checkpoint input hash + causedBy wiring',
        get: (p) => p.steps.flatMap((s, i) => (s.deps ?? []).map((d) => ({ target: d, path: `$.steps[${i}].deps` }))),
    },
    {
        ref: 'gates[].stepId',
        targetKinds: ['gate'],
        consumes: 'the gate step render .find()s its config (verdict routing)',
        get: (p) => (p.gates ?? []).map((g, i) => ({ target: g.stepId, path: `$.gates[${i}].stepId` })),
    },
    {
        ref: 'gates[].failRoute',
        targetKinds: ['agent'],
        allowTerminal: true,
        consumes: 'the redo loop re-dispatches __dispatch_<failRoute>',
        get: (p) => (p.gates ?? []).map((g, i) => ({ target: g.failRoute, path: `$.gates[${i}].failRoute` })),
    },
    {
        ref: 'fanouts[].stage',
        targetKinds: ['fanout'],
        consumes: 'the fanout step render .find()s its config (registry/cap/chain)',
        get: (p) => (p.fanouts ?? []).map((f, i) => ({ target: f.stage, path: `$.fanouts[${i}].stage` })),
    },
    {
        ref: 'fanouts[].chain[]',
        targetKinds: ['agent'],
        consumes: 'dispatched per item inside the region (a pause/join/gate in a chain would be mis-dispatched as an agent)',
        get: (p) => (p.fanouts ?? []).flatMap((f, i) => (f.chain ?? []).map((c) => ({ target: c, path: `$.fanouts[${i}].chain` }))),
    },
    {
        ref: 'joins[].stage',
        targetKinds: ['join'],
        consumes: 'skipped as a top-level step; its joinRegion call closes the region (naming an agent here would silently skip that agent)',
        get: (p) => (p.joins ?? []).map((j, i) => ({ target: j.stage, path: `$.joins[${i}].stage` })),
    },
    {
        ref: 'joins[].forStage',
        targetKinds: ['fanout'],
        consumes: 'the fanout region render .find()s its join policy',
        get: (p) => (p.joins ?? []).map((j, i) => ({ target: j.forStage, path: `$.joins[${i}].forStage` })),
    },
];
/**
 * Parse a raw JSON value into a LoopPlan, or return the ParseError list (union return per the
 * behavioral contract). Structural only — semantic invariants live in `validatePlan`.
 * `x-` keys at the top level and per step are accepted and carried through verbatim.
 * A callable/`function` value anywhere in a retry field is a PARSE error (AM-4).
 */
export function parsePlan(json) {
    const errors = [];
    if (!isRecord(json))
        return [{ path: '$', message: 'plan must be a JSON object' }];
    // ── raw-domain validation (QE round-4 B1): every PRESENT declared field is checked against its
    // FIELD_DOMAINS entry BEFORE the cast — an out-of-domain value is a named PARSE error, never a
    // silently-ignored value the runtime's `=== true` / `?? default` logic quietly normalizes away.
    const checkDomains = (obj, iface, basePath) => {
        const known = KNOWN_KEYS[iface];
        const xScoped = X_KEY_IFACES.has(iface);
        for (const [k, v] of Object.entries(obj)) {
            // CLOSED-WORLD key check (QE round-7 B1): only the source-derived documented fields plus the
            // `x-` vendor escape AT ITS DOCUMENTED SCOPES are accepted. An unknown non-`x-` key is a
            // second spelling or a sibling field that would parse, ride the digest, and do NOTHING.
            if (k.startsWith('x-')) {
                if (!xScoped) {
                    errors.push({ path: `${basePath}.${k}`, message: `x- vendor keys are accepted only at their documented scopes (${[...X_KEY_IFACES].sort().join(', ')}) — "${k}" on ${iface} is outside them, so it would be digested but never carried anywhere a consumer reads it` });
                }
                continue;
            }
            if (known === undefined || !known.has(k)) {
                errors.push({ path: `${basePath}.${k}`, message: `unknown key "${k}" on ${iface} — loop-plan/1 is CLOSED-WORLD: only the documented fields (derived from this file's interface source via FIELD_DOMAINS) and x- vendor keys are accepted; an unknown non-x- key parses, digests, and enacts NOTHING, which is exactly the "a valid plan promises unperformed behavior" defect this schema forbids` });
                continue;
            }
            if (v === undefined)
                continue;
            const dom = FIELD_DOMAINS[`${iface}.${k}`];
            if (dom === undefined || domainAccepts(dom, v))
                continue;
            errors.push({ path: `${basePath}.${k}`, message: `${k} must be ${describeDomain(dom)} (raw-domain check) — got ${typeof v === 'string' ? JSON.stringify(v) : typeof v === 'object' ? (Array.isArray(v) ? 'an array' : 'an object') : String(v)}` });
        }
        // REQUIRED-fields presence (QE round-6): an ABSENT required field is a PARSE error — round-5's
        // zero-agent completion rode a fanouts[] record whose required `stage` was simply missing.
        for (const req of REQUIRED_FIELDS[iface] ?? []) {
            if (OWNED_ABSENCE.has(`${iface}.${req}`))
                continue;
            if (obj[req] === undefined) {
                errors.push({ path: `${basePath}.${req}`, message: `${req} is REQUIRED on ${iface} (REQUIRED_FIELDS) — an absent required field must fail parse, never render a silently-skipped record` });
            }
        }
    };
    checkDomains(json, 'LoopPlan', '$');
    if (isRecord(json['checkpointing']))
        checkDomains(json['checkpointing'], 'checkpointing', '$.checkpointing');
    if (isRecord(json['subsystems']))
        checkDomains(json['subsystems'], 'LoopSubsystems', '$.subsystems');
    if (isRecord(json['trace']))
        checkDomains(json['trace'], 'trace', '$.trace');
    for (const [arrKey, iface] of [['gates', 'LoopGate'], ['fanouts', 'LoopFanout'], ['joins', 'LoopJoin'], ['pauses', 'LoopPause']]) {
        const arr = json[arrKey];
        if (!Array.isArray(arr))
            continue;
        arr.forEach((entry, i) => {
            if (!isRecord(entry))
                return; // the record[] domain check on the array itself already errored
            checkDomains(entry, iface, `$.${arrKey}[${i}]`);
            if (iface === 'LoopJoin' && isRecord(entry['branchSchema']))
                checkDomains(entry['branchSchema'], 'branchSchema', `$.${arrKey}[${i}].branchSchema`);
            // ITEM-KEY DOMAIN (QE round-7 B1): registry items become the runtime's `itemKey` — they must
            // live in the ONE shared ItemKey domain, checked HERE at parse rather than discovered by the
            // trace plane at dispatch time (Codex round-6: `"hello world"` validated clean, then trace-on
            // refused the event BEFORE the member call while trace-off COMPLETED).
            if (iface === 'LoopFanout' && Array.isArray(entry['registry'])) {
                entry['registry'].forEach((item, ri) => {
                    if (typeof item !== 'string')
                        return; // the string[] raw-domain check owns the type
                    if (!isItemKey(item)) {
                        errors.push({ path: `$.${arrKey}[${i}].registry[${ri}]`, message: `registry item ${JSON.stringify(item)} is not an ItemKey (${String(ITEM_KEY_RE)}) — registry items become the runtime itemKey of every member dispatch, and the trace plane REFUSES a non-conforming event, so an out-of-domain item makes trace.emit decide whether the plan can run at all` });
                    }
                });
            }
        });
    }
    if (json['schema'] !== LOOP_PLAN_SCHEMA) {
        errors.push({ path: '$.schema', message: `schema must be "${LOOP_PLAN_SCHEMA}"` });
    }
    for (const key of ['name', 'description', 'whenToUse']) {
        if (typeof json[key] !== 'string' || json[key] === '') {
            errors.push({ path: `$.${key}`, message: `${key} must be a non-empty string` });
        }
    }
    if (!Array.isArray(json['steps']) || json['steps'].length === 0) {
        errors.push({ path: '$.steps', message: 'steps must be a non-empty array' });
        return errors;
    }
    const steps = json['steps'];
    steps.forEach((raw, i) => {
        if (!isRecord(raw)) {
            errors.push({ path: `$.steps[${i}]`, message: 'step must be an object' });
            return;
        }
        checkDomains(raw, 'LoopStep', `$.steps[${i}]`);
        if (isRecord(raw['artifacts']))
            checkDomains(raw['artifacts'], 'artifacts', `$.steps[${i}].artifacts`);
        if (isRecord(raw['budget']))
            checkDomains(raw['budget'], 'budget', `$.steps[${i}].budget`);
        if (isRecord(raw['retry']))
            checkDomains(raw['retry'], 'RetryProfile', `$.steps[${i}].retry`);
        if (isRecord(raw['cache']))
            checkDomains(raw['cache'], 'CachePolicy', `$.steps[${i}].cache`);
        if (typeof raw['stepId'] !== 'string' || !STEP_ID_RE.test(raw['stepId'])) {
            errors.push({ path: `$.steps[${i}].stepId`, message: `stepId must match ${String(STEP_ID_RE)}` });
        }
        if (!['agent', 'fanout', 'join', 'gate', 'pause'].includes(String(raw['kind']))) {
            errors.push({ path: `$.steps[${i}].kind`, message: 'kind must be one of agent|fanout|join|gate|pause' });
        }
        if (typeof raw['phase'] !== 'string' || raw['phase'] === '') {
            errors.push({ path: `$.steps[${i}].phase`, message: 'phase must be a non-empty string' });
        }
        if (raw['deps'] !== undefined && !isStringArray(raw['deps'])) {
            errors.push({ path: `$.steps[${i}].deps`, message: 'deps must be a string array' });
        }
        const retry = raw['retry'];
        if (retry !== undefined) {
            if (!isRecord(retry) || typeof retry['maxAttempts'] !== 'number') {
                errors.push({ path: `$.steps[${i}].retry`, message: 'retry.maxAttempts (number, INCLUDES the initial attempt) is required' });
            }
            else {
                for (const [k, v] of Object.entries(retry)) {
                    if (typeof v === 'function') {
                        errors.push({ path: `$.steps[${i}].retry.${k}`, message: 'retry fields are data-only — a callable is not a valid failure predicate (closed failure-class enum only)' });
                    }
                }
                const rfc = retry['retryableFailureClasses'];
                if (rfc !== undefined) {
                    if (!Array.isArray(rfc) || rfc.some((c) => !RETRYABLE_FAILURE_CLASSES.includes(c))) {
                        errors.push({
                            path: `$.steps[${i}].retry.retryableFailureClasses`,
                            message: `retryableFailureClasses must be a subset of the closed enum [${RETRYABLE_FAILURE_CLASSES.join(', ')}]`,
                        });
                    }
                }
            }
        }
    });
    // Duplicate stepIds are a PARSE error (QE round-6; Codex round-5: two steps named 'a' validated
    // cleanly, then rendering died with "Identifier 'USER_PROMPT_a' has already been declared").
    const seenIds = new Map();
    steps.forEach((raw, i) => {
        if (!isRecord(raw) || typeof raw['stepId'] !== 'string')
            return;
        const id = raw['stepId'];
        const first = seenIds.get(id);
        if (first !== undefined) {
            errors.push({ path: `$.steps[${i}].stepId`, message: `duplicate stepId "${id}" (first declared at $.steps[${first}]) — stepIds must be unique; a duplicate renders colliding const declarations (an unparseable script)` });
        }
        else {
            seenIds.set(id, i);
        }
    });
    // IDENT-1 (QE round-6, the collision belt): distinct stepIds must lower to distinct generated
    // identifiers. stepIdent() is COLLISION-RESISTANT, not injective (8-hex = 32-bit truncated
    // sha256) — so this check, which compares the ACTUAL lowered strings, is what supplies the
    // safety: it catches a crafted clean name that imitates another id's suffixed form AND any
    // truncated-hash collision, without assuming injectivity anywhere.
    const identSeen = new Map();
    for (const [id] of seenIds) {
        const low = stepIdent(id);
        const prior = identSeen.get(low);
        if (prior !== undefined && prior !== id) {
            errors.push({ path: '$.steps', message: `stepIds "${prior}" and "${id}" lower to the same generated identifier "${low}" (IDENT-1) — distinct stepIds must lower to distinct generated identifiers; rename one` });
        }
        else {
            identSeen.set(low, id);
        }
    }
    if (errors.length > 0)
        return errors;
    return json;
}
/** True when a parsePlan return is the error branch of the union. */
export function isParseErrors(v) {
    return Array.isArray(v);
}
function stepDefault(step) {
    return {
        deliverable: step.deliverable ?? 'return-value',
        idempotent: step.idempotent ?? false,
        maxAttempts: step.retry?.maxAttempts ?? 1,
    };
}
/**
 * Semantic validation — INV-1…8 (one diagnostic per violated invariant instance, each naming the
 * invariant it defends). Pure; never throws.
 */
export function validatePlan(plan) {
    const out = [];
    const ids = new Set(plan.steps.map((s) => s.stepId));
    const byId = new Map(plan.steps.map((s) => [s.stepId, s]));
    // INV-1: reference closure + acyclicity (excluding gate redo/fail routes).
    const refCheck = (path, target) => {
        if (target !== undefined && !ids.has(target) && !target.startsWith('terminal:')) {
            out.push({ invariant: 'INV-1', path, message: `reference "${target}" resolves to no stepId` });
        }
    };
    plan.steps.forEach((s, i) => {
        for (const d of s.deps ?? [])
            refCheck(`$.steps[${i}].deps`, d);
    });
    (plan.gates ?? []).forEach((g, i) => {
        refCheck(`$.gates[${i}].stepId`, g.stepId);
        refCheck(`$.gates[${i}].failRoute`, g.failRoute);
    });
    (plan.fanouts ?? []).forEach((f, i) => {
        refCheck(`$.fanouts[${i}].stage`, f.stage);
        for (const c of f.chain ?? [])
            refCheck(`$.fanouts[${i}].chain`, c);
    });
    (plan.joins ?? []).forEach((j, i) => {
        refCheck(`$.joins[${i}].stage`, j.stage);
        refCheck(`$.joins[${i}].forStage`, j.forStage);
    });
    // acyclicity over deps (redo/failRoute edges are deliberately excluded — they are loops by design)
    const state = new Map();
    const dfs = (id, trail) => {
        const st = state.get(id) ?? 0;
        if (st === 1) {
            out.push({ invariant: 'INV-1', path: '$.steps', message: `dependency cycle: ${[...trail, id].join(' → ')}` });
            return;
        }
        if (st === 2)
            return;
        state.set(id, 1);
        for (const d of byId.get(id)?.deps ?? []) {
            if (ids.has(d))
                dfs(d, [...trail, id]);
        }
        state.set(id, 2);
    };
    for (const id of ids)
        if ((state.get(id) ?? 0) === 0)
            dfs(id, []);
    // ORDER-1 (QE round-4 B1; REBUILT round 6 on EFFECTIVE EXECUTION POSITIONS — Codex round-5:
    // "ORDER-1 compares raw steps[] indexes, but members and joins are skipped at those positions
    // and execute at their fanout's position"; measured dispatch order was `consumer` then `m:i1`).
    // A fanout chain member and a join step EXECUTE at their region's (fanout's) plan position, so
    // the comparison anchors every step there. A dep on a step whose EFFECTIVE position is later is
    // REJECTED, never silently misordered. Additionally: a dep TARGETING a chain member from outside
    // its region is rejected — members settle PER-ITEM, so the dependency's causedBy wiring is
    // unrepresentable (depend on the region's join step instead).
    const planIndex = new Map(plan.steps.map((s, i) => [s.stepId, i]));
    const memberRegion = new Map(); // chain member -> its fanout stage
    for (const f of plan.fanouts ?? [])
        for (const c of f.chain ?? [])
            if (!memberRegion.has(c))
                memberRegion.set(c, f.stage);
    const joinRegion = new Map(); // join step -> its fanout stage
    for (const j of plan.joins ?? [])
        if (!joinRegion.has(j.stage))
            joinRegion.set(j.stage, j.forStage);
    const effIdx = (id) => {
        const anchor = memberRegion.get(id) ?? joinRegion.get(id) ?? id;
        return planIndex.get(anchor) ?? planIndex.get(id);
    };
    plan.steps.forEach((s, i) => {
        for (const d of s.deps ?? []) {
            const di = effIdx(d);
            const si = effIdx(s.stepId);
            if (di !== undefined && si !== undefined && di > si) {
                out.push({ invariant: 'ORDER-1', path: `$.steps[${i}].deps`, message: `"${s.stepId}" (effective execution position ${si}) depends on "${d}", whose EFFECTIVE execution position is ${di} (members/joins execute at their fanout's position, not their declaration index) — loop-render/1 executes in effective plan order, so this dependency cannot be honored; reorder or re-anchor it` });
            }
            if (memberRegion.has(d) && memberRegion.get(s.stepId) !== memberRegion.get(d)) {
                out.push({ invariant: 'ORDER-1', path: `$.steps[${i}].deps`, message: `"${s.stepId}" depends on "${d}", a fanout chain member — members settle PER-ITEM at their region's position, so this dependency's causedBy wiring is unrepresentable; depend on the region's join step instead` });
            }
        }
    });
    // XREF-1 (QE round-5 B1 class-kill, driven by the CROSS_REFS table): a stepId reference must
    // target a step of a LEGAL KIND, not merely an existing one. Codex R3's decisive counterexample:
    // joins[{stage:'a', forStage:'a'}] on an ordinary agent validated, the renderer skipped 'a' as a
    // join step, and the run COMPLETED with ZERO agent calls. Kind-checking by table means a new
    // referencing field cannot ship with existence-only validation.
    for (const x of CROSS_REFS) {
        for (const { target, path } of x.get(plan)) {
            if (target === undefined)
                continue;
            if (x.allowTerminal === true && target.startsWith('terminal:'))
                continue;
            const t = byId.get(target);
            if (t === undefined)
                continue; // nonexistence is INV-1's
            if (!x.targetKinds.includes(t.kind)) {
                out.push({ invariant: 'XREF-1', path, message: `${x.ref} reference "${target}" targets a kind:'${t.kind}' step — legal target kinds: ${x.targetKinds.join('|')} (consumption: ${x.consumes}); a mis-kinded reference is skipped or mis-dispatched, never enacted` });
            }
        }
    }
    // UNCONSUMED-1 (QE round-5 B1): every record/step a renderer would SKIP without consuming is
    // rejected. A kind:'join' step named by no joins[].stage renders as dead code (its region-closing
    // joinRegion call is emitted only by the fanout region that finds it via joins[]).
    const joinStages = new Set((plan.joins ?? []).map((j) => j.stage));
    plan.steps.forEach((s, i) => {
        if (s.kind === 'join' && !joinStages.has(s.stepId)) {
            out.push({ invariant: 'UNCONSUMED-1', path: `$.steps[${i}]`, message: `kind:'join' step "${s.stepId}" is consumed by no joins[] record — the renderer would emit it as dead code (no joinRegion call closes anything through it)` });
        }
    });
    // KIND-1 (QE round-4 B1, Codex R4 kind-applicability): a field declared on a step kind that never
    // enacts it (per the STEP_FIELD_KINDS matrix — data, not case law) is an unperformed promise.
    // The observed counterexample: a pause with deliverable:'file' + artifacts.writes validated and
    // completed with ZERO landed polls — the barrier exists only in the agent/gate branch.
    plan.steps.forEach((s, i) => {
        if (!ALL_KINDS.includes(s.kind))
            return; // parse layer owns the kind enum
        for (const k of Object.keys(s)) {
            if (k.startsWith('x-'))
                continue;
            const kinds = STEP_FIELD_KINDS[k];
            if (kinds === undefined || kinds.includes(s.kind))
                continue;
            out.push({ invariant: 'KIND-1', path: `$.steps[${i}].${k}`, message: `"${s.stepId}" declares "${k}" on a kind:'${s.kind}' step — loop-render/1 enacts this field only for kind ${kinds.join('|')} (a declared field the renderer ignores would be an unperformed promise)` });
        }
    });
    // DUP-1 (QE round-4 B1, Codex R4 duplicate-gate falsifier): the renderer binds configs with
    // `.find()`, so only the FIRST config per key is ever enacted — a duplicate would be silently
    // ignored. Duplicates are rejected for every .find()-bound config surface, not only gates.
    const dupCheck = (label, arr, keyField) => {
        const seen = new Set();
        arr.forEach((x, i) => {
            const k = x[keyField];
            if (typeof k !== 'string')
                return;
            if (seen.has(k)) {
                out.push({ invariant: 'DUP-1', path: `$.${label}[${i}]`, message: `duplicate ${label} config for ${keyField} "${k}" — loop-render/1 enacts only the FIRST (.find()); a second config would be silently ignored, so it is rejected` });
            }
            seen.add(k);
        });
    };
    dupCheck('gates', (plan.gates ?? []), 'stepId');
    dupCheck('fanouts', (plan.fanouts ?? []), 'stage');
    dupCheck('joins', (plan.joins ?? []), 'forStage');
    // QE round-5: joins are ALSO keyed by stage (two records sharing one join step would render one
    // region-closing call and silently orphan the other record).
    dupCheck('joins', (plan.joins ?? []), 'stage');
    dupCheck('pauses', (plan.pauses ?? []), 'state');
    // MEMBER-2 (QE round-5 B1): fanout chains have a renderable SHAPE — at least one member, exactly
    // one under the barrier shape (loop-render/1 dispatches exactly one member step per item there;
    // extra barrier chain entries were silently never dispatched), and no step in two chain
    // positions (each member renders its USER/prompt consts exactly once — a repeat would emit
    // colliding const declarations, an unparseable script).
    const chainSeen = new Set();
    plan.steps.forEach((s, i) => {
        if (s.kind !== 'fanout')
            return;
        const f = (plan.fanouts ?? []).find((x) => x.stage === s.stepId);
        if (!f)
            return; // INV-2 owns the missing-config case
        const chain = f.chain ?? [];
        if (chain.length === 0) {
            out.push({ invariant: 'MEMBER-2', path: `$.steps[${i}]`, message: `fanout "${s.stepId}" declares no chain member — a region needs at least one kind:'agent' member step (loop-render/1 dispatches chain members per item; an empty chain has nothing to dispatch)` });
            return;
        }
        if ((s.concurrency ?? 'barrier') === 'barrier' && chain.length > 1) {
            out.push({ invariant: 'MEMBER-2', path: `$.steps[${i}]`, message: `barrier-shape fanout "${s.stepId}" declares ${chain.length} chain members — loop-render/1 dispatches exactly ONE member step per item under the barrier shape (the extra members would silently never dispatch); use concurrency:'pipeline' for per-item chains` });
        }
        for (const c of chain) {
            if (chainSeen.has(c)) {
                out.push({ invariant: 'MEMBER-2', path: `$.steps[${i}]`, message: `step "${c}" appears in more than one fanout chain position — each member renders its USER/prompt consts exactly once, so a repeated member is unrenderable` });
            }
            chainSeen.add(c);
        }
    });
    // INV-2: every fanout step declares maxFanout >= 1 AND a non-empty registry.
    const fanoutByStage = new Map((plan.fanouts ?? []).map((f) => [f.stage, f]));
    plan.steps.forEach((s, i) => {
        if (s.kind !== 'fanout')
            return;
        const f = fanoutByStage.get(s.stepId);
        if (!f) {
            out.push({ invariant: 'INV-2', path: `$.steps[${i}]`, message: `fanout step "${s.stepId}" has no fanouts[] config — unbounded fanout is invalid` });
            return;
        }
        if (typeof f.maxFanout !== 'number' || !Number.isFinite(f.maxFanout) || f.maxFanout < 1) {
            out.push({ invariant: 'INV-2', path: `$.fanouts[${f.stage}].maxFanout`, message: 'maxFanout must be a finite number >= 1' });
        }
        if (!Array.isArray(f.registry) || f.registry.length === 0) {
            out.push({ invariant: 'INV-2', path: `$.fanouts[${f.stage}].registry`, message: 'a fanout requires a non-empty member registry' });
        }
        if (f.overflow !== undefined && f.overflow !== 'window' && f.overflow !== 'truncate') {
            out.push({ invariant: 'INV-2b', path: `$.fanouts[${f.stage}].overflow`, message: `overflow must be one of window|truncate (received ${JSON.stringify(f.overflow)})` });
        }
        else if (f.overflow === 'truncate' && (typeof f.truncateReason !== 'string' || f.truncateReason.trim() === '')) {
            out.push({ invariant: 'INV-2b', path: `$.fanouts[${f.stage}].overflow`, message: 'overflow:"truncate" requires a non-blank truncateReason — deliberate dropped work needs a receipt' });
        }
    });
    // INV-3: every fanout (parallel region) names an explicit join with a closed-set joinPolicy.
    const joinsFor = new Map((plan.joins ?? []).map((j) => [j.forStage, j]));
    plan.steps.forEach((s, i) => {
        if (s.kind !== 'fanout')
            return;
        const j = joinsFor.get(s.stepId);
        if (!j) {
            out.push({ invariant: 'INV-3', path: `$.steps[${i}]`, message: `parallel region "${s.stepId}" names no join — concurrent work without a join is unrepresentable` });
            return;
        }
        const ok = JOIN_POLICIES.includes(j.joinPolicy) || QUORUM_RE.test(j.joinPolicy);
        if (!ok) {
            out.push({ invariant: 'INV-3', path: `$.joins[${j.stage}].joinPolicy`, message: `joinPolicy "${j.joinPolicy}" is not in the closed set (all-declared|all-activated|any|quorum:<n>)` });
        }
    });
    // INV-4: retry.maxAttempts > 1 only on idempotent steps.
    plan.steps.forEach((s, i) => {
        const d = stepDefault(s);
        if (d.maxAttempts > 1 && d.idempotent !== true) {
            out.push({ invariant: 'INV-4', path: `$.steps[${i}].retry`, message: `maxAttempts ${d.maxAttempts} > 1 requires idempotent: true (maxAttempts INCLUDES the initial attempt)` });
        }
    });
    // INV-5 (plan half): every declared pause state is carried by a reachable pause step, with a resumeArg.
    const pauseStates = new Set(plan.steps.filter((s) => s.kind === 'pause').map((s) => s.pauseState ?? s.stepId));
    (plan.pauses ?? []).forEach((p, i) => {
        if (typeof p.resumeArg !== 'string' || p.resumeArg === '') {
            out.push({ invariant: 'INV-5', path: `$.pauses[${i}].resumeArg`, message: `pause "${p.state}" declares no resumeArg — a pause a re-invoke cannot resume is a lie` });
        }
        if (!pauseStates.has(p.state)) {
            out.push({ invariant: 'INV-5', path: `$.pauses[${i}].state`, message: `declared pause state "${p.state}" is returned by no pause step` });
        }
    });
    // INV-6: cacheable only when idempotent AND side-effect-free (deliverable return-value, no writes).
    plan.steps.forEach((s, i) => {
        const d = stepDefault(s);
        const writes = s.artifacts?.writes ?? [];
        if (s.cacheable === true && (d.idempotent !== true || d.deliverable === 'file' || writes.length > 0)) {
            out.push({ invariant: 'INV-6', path: `$.steps[${i}].cacheable`, message: `"${s.stepId}" is cacheable but not side-effect-free (cache is keyed on normalized input and is NOT a checkpoint)` });
        }
    });
    // INV-8 (retired in round 6, SUBSUMED by ENACT-DISPATCH): "a return-value deliverable may never
    // ride the fire-and-forget wrapper" is now unrepresentable — the wrapper route itself is
    // validated-away for every step, so the property holds vacuously and needs no separate check.
    // ── Schema/runtime contract closure (QE round-3 B1): a plan must not VALIDATE while promising
    // behavior the generated workflow does not perform. Every declared field is either ENACTED by
    // loop-render/1 or REJECTED here with a named "not yet enacted" diagnostic — never a silent no-op.
    // The enumeration is machine-checked by loop-plan-honesty.test.ts.
    // ENACT-CACHE: keyed cache lookup/store is NOT enacted by loop-render/1 (a persistent keyed store
    // + normalized-input capture is not available in the fs-less sandbox this round). `cacheable`
    // stays a validated CAPABILITY declaration (INV-6); an ENABLED cache policy is a behavior promise.
    plan.steps.forEach((s, i) => {
        if (s.cache?.enabled === true) {
            out.push({ invariant: 'ENACT-CACHE', path: `$.steps[${i}].cache.enabled`, message: `"${s.stepId}" declares cache.enabled — cache execution is not yet enacted by loop-render/1, and a plan must not validate while promising unperformed caching; set enabled:false (cacheable remains the capability declaration) or wait for a renderer that performs the keyed lookup` });
        }
    });
    // ENACT-RETRY-TIMING (QE round-6 NARROWING): the retry-TIMING family is not enacted in
    // loop-plan/1 v1 — retries are IMMEDIATE. This field family reopened a blocker in every round it
    // was "enacted" (round-4: the member projection dropped initialDelayMs; round-5: backoff/cap
    // without initialDelayMs validated and vanished SYMMETRICALLY — invisible to a parity proof by
    // construction; negative delays and a zero multiplier validated then were silently skipped).
    // v1 retry is {maxAttempts, retryableFailureClasses} ONLY; the timing family is deferred to the
    // roadmap, per the round-3 cache precedent: a plan must not validate while promising unperformed
    // behavior.
    plan.steps.forEach((s, i) => {
        for (const k of ['initialDelayMs', 'backoffMultiplier', 'maxDelayMs', 'jitter']) {
            if (s.retry?.[k] !== undefined) {
                out.push({ invariant: 'ENACT-RETRY-TIMING', path: `$.steps[${i}].retry.${k}`, message: `retry.${k} is not enacted in loop-plan/1 v1 (retries are IMMEDIATE; the timing family — delay/backoff/cap/jitter — is deferred, see roadmap) — v1 retry is {maxAttempts, retryableFailureClasses} only` });
            }
        }
    });
    // ENACT-SUBSYS: usageAdaptive and challengePanel select their blobs but loop-render/1 emits no
    // call site for them yet — enabling either would promise unperformed behavior.
    if (plan.subsystems?.usageAdaptive === true) {
        out.push({ invariant: 'ENACT-SUBSYS', path: '$.subsystems.usageAdaptive', message: 'usage-adaptive routing is not yet enacted by loop-render/1 (the blob would be injected with no probe call sites) — remove the opt-in until a renderer version enacts it' });
    }
    if (plan.subsystems?.challengePanel === true) {
        out.push({ invariant: 'ENACT-SUBSYS', path: '$.subsystems.challengePanel', message: 'the challenge panel is not yet enacted by loop-render/1 (the blob would be injected with no call sites) — remove the opt-in until a renderer version enacts it' });
    }
    if (plan.subsystems?.codexDispatch === true) {
        out.push({ invariant: 'ENACT-SUBSYS', path: '$.subsystems.codexDispatch', message: 'codex dispatch is not enacted in loop-plan/1 v1 (dispatch routes other than inline are validated-away by ENACT-DISPATCH, so the blob would be injected with no call sites) — see roadmap' });
    }
    // ENACT-DISPATCH (QE round-6 NARROWING): only 'inline' dispatch is enacted in v1. The
    // fire-and-forget codex wrapper returns a STUB that reads as a clean result (the codex-rescue
    // lesson), and the codex-exec thunk had no live-proven enactment in this pipeline — both routes
    // are rejected loudly instead of carried as risk. See roadmap.
    plan.steps.forEach((s, i) => {
        if (s.dispatch !== undefined && s.dispatch !== 'inline') {
            out.push({ invariant: 'ENACT-DISPATCH', path: `$.steps[${i}].dispatch`, message: `dispatch "${s.dispatch}" is not enacted in loop-plan/1 v1 — every step dispatches inline (codex routes are deferred; see roadmap)` });
        }
    });
    // ENACT-CKPT-OPT (QE round-6 NARROWING): checkpoint GRANULARITY/SCHEMA options are not enacted
    // in v1 — checkpointing.enabled checkpoints EVERY top-level agent step, stamped 'loop-ckpt-1'.
    // Both option fields false-flipped the exec fingerprint across review rounds (schemaVersion in
    // round 3, per-step checkpoint in round 4); v1 removes the option surface instead of normalizing
    // it a third time. See roadmap.
    plan.steps.forEach((s, i) => {
        if (s.checkpoint !== undefined) {
            out.push({ invariant: 'ENACT-CKPT-OPT', path: `$.steps[${i}].checkpoint`, message: `per-step checkpoint granularity is not enacted in loop-plan/1 v1 — checkpointing.enabled checkpoints every top-level agent step (see roadmap); remove the field` });
        }
    });
    if (plan.checkpointing?.schemaVersion !== undefined) {
        out.push({ invariant: 'ENACT-CKPT-OPT', path: '$.checkpointing.schemaVersion', message: `checkpointing.schemaVersion is not enacted in loop-plan/1 v1 — the schema stamp is pinned to 'loop-ckpt-1' (see roadmap); remove the field` });
    }
    // ENACT-FANOUT / ENACT-JOIN: reasonRequired and branchSchema have no runtime enactment.
    (plan.fanouts ?? []).forEach((f, i) => {
        if (f.reasonRequired === true) {
            out.push({ invariant: 'ENACT-FANOUT', path: `$.fanouts[${i}].reasonRequired`, message: 'reasonRequired is not enacted by loop-render/1 — omit it (dedup IS enacted)' });
        }
    });
    (plan.joins ?? []).forEach((j, i) => {
        if (j.branchSchema !== undefined) {
            out.push({ invariant: 'ENACT-JOIN', path: `$.joins[${i}].branchSchema`, message: 'branchSchema is not enacted by loop-render/1 — omit it' });
        }
        if (j.onInvalid !== undefined && j.onInvalid !== 'named-failure') {
            out.push({ invariant: 'ENACT-JOIN', path: `$.joins[${i}].onInvalid`, message: `onInvalid "${j.onInvalid}" is not in the enacted set — loop-render/1 enacts exactly 'named-failure' (the join throws a named error)` });
        }
    });
    // GATE-1: gate redo/fail routing must be STRUCTURALLY enactable — the generated redo loop
    // re-dispatches an EARLIER agent step; anything else cannot be honestly rendered.
    const stepOrder = new Map(plan.steps.map((s, i) => [s.stepId, i]));
    const memberIds = new Set();
    for (const f of plan.fanouts ?? [])
        for (const c of f.chain ?? [])
            memberIds.add(c);
    (plan.gates ?? []).forEach((g, i) => {
        // (gate/failRoute target KINDS are XREF-1's, from the CROSS_REFS table — round 5)
        if (g.maxRedos !== undefined && (typeof g.maxRedos !== 'number' || !Number.isFinite(g.maxRedos) || g.maxRedos < 0 || Math.floor(g.maxRedos) !== g.maxRedos)) {
            out.push({ invariant: 'GATE-1', path: `$.gates[${i}].maxRedos`, message: 'maxRedos must be a finite integer >= 0' });
        }
        const redos = typeof g.maxRedos === 'number' && Number.isFinite(g.maxRedos) ? g.maxRedos : 0;
        const routeIsTerminal = typeof g.failRoute === 'string' && g.failRoute.startsWith('terminal:');
        if (typeof g.failRoute === 'string' && !routeIsTerminal && ids.has(g.failRoute)) {
            const gi = stepOrder.get(g.stepId);
            const fi = stepOrder.get(g.failRoute);
            if (gi !== undefined && fi !== undefined && fi >= gi) {
                out.push({ invariant: 'GATE-1', path: `$.gates[${i}].failRoute`, message: `failRoute "${g.failRoute}" does not PRECEDE gate "${g.stepId}" in plan order — a redo can only re-dispatch an earlier step` });
            }
            const routeStep = byId.get(g.failRoute);
            if (routeStep && routeStep.kind === 'agent' && memberIds.has(g.failRoute)) {
                // (a non-agent failRoute is XREF-1's; the MEMBER restriction stays GATE-1's)
                out.push({ invariant: 'GATE-1', path: `$.gates[${i}].failRoute`, message: `failRoute "${g.failRoute}" must be a top-level kind:'agent' step (fanout members cannot be re-dispatched individually)` });
            }
        }
        if (redos > 0 && (g.failRoute === undefined || routeIsTerminal)) {
            out.push({ invariant: 'GATE-1', path: `$.gates[${i}].maxRedos`, message: 'maxRedos > 0 requires a step failRoute (a terminal or absent route has nothing to re-dispatch)' });
        }
    });
    // CKPT-1 (retired in round 6, SUBSUMED by ENACT-CKPT-OPT): the per-step checkpoint opt-in field
    // is validated-away whole, so "only top-level agent steps checkpoint" is now a renderer fact
    // (checkpointing.enabled checkpoints exactly the top-level agent steps), not a per-field check.
    // DELIV-1: a file deliverable must declare the writes its landed barrier verifies.
    plan.steps.forEach((s, i) => {
        const d = stepDefault(s);
        if (d.deliverable === 'file' && (s.artifacts?.writes ?? []).length === 0) {
            out.push({ invariant: 'DELIV-1', path: `$.steps[${i}].deliverable`, message: `"${s.stepId}" declares a file deliverable but no artifacts.writes — the landed barrier would have nothing to verify (a stub return would read as a delivered file)` });
        }
    });
    // DISPATCH-1 (retired in round 6, SUBSUMED by ENACT-DISPATCH): codex routes are validated-away
    // for every step, so the "codex route requires the codex-dispatch subsystem" pairing rule has
    // no representable trigger left.
    // MEMBER-1: fanout chain members render INSIDE their region — the per-member call path enacts
    // model + retry (G5) and OUTSIDE-region deps (their settles ride the member's causedBy — round
    // 6), but not file deliverables, write barriers, or deps BETWEEN members (chain order IS the
    // region's ordering; a member-to-member dep would be a decorative duplicate of the chain).
    // Declaring those on a member would be an unperformed promise. (The per-member dispatch leg was
    // retired in round 6 — non-inline dispatch is validated-away globally by ENACT-DISPATCH.)
    plan.steps.forEach((s, i) => {
        if (!memberIds.has(s.stepId))
            return;
        const d = stepDefault(s);
        if (d.deliverable === 'file' || (s.artifacts?.writes ?? []).length > 0) {
            out.push({ invariant: 'MEMBER-1', path: `$.steps[${i}]`, message: `fanout member "${s.stepId}" declares file writes/deliverable — the landed barrier is not enacted per member (declare it on a post-join step instead)` });
        }
        for (const dep of s.deps ?? []) {
            if (memberIds.has(dep)) {
                out.push({ invariant: 'MEMBER-1', path: `$.steps[${i}].deps`, message: `fanout member "${s.stepId}" depends on member "${dep}" — deps between chain members are not enacted (chain order is the region's ordering); remove the dep or express it via the chain` });
            }
        }
    });
    return out;
}
/** Cosmetic fields stripped by normalization (excluded from the digest). */
const COSMETIC_STEP_FIELDS = new Set(['title']);
function canonicalize(value) {
    if (Array.isArray(value))
        return value.map(canonicalize);
    if (isRecord(value)) {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            const v = value[key];
            if (v === undefined)
                continue;
            out[key] = canonicalize(v);
        }
        return out;
    }
    return value;
}
/**
 * Canonical form: object keys sorted (x- keys included, so they participate in the digest),
 * cosmetic fields stripped, undefined dropped, step/array ORDER preserved (order is semantic —
 * INV-7 phase order derives from it).
 */
export function normalizePlan(plan) {
    const steps = plan.steps.map((s) => {
        const copy = {};
        for (const [k, v] of Object.entries(s)) {
            if (COSMETIC_STEP_FIELDS.has(k))
                continue;
            copy[k] = v;
        }
        if (copy['retry'] === undefined && s.kind === 'agent') {
            // schema default made explicit so the digest is stable against later default-filling
            copy['retry'] = { maxAttempts: 1 };
        }
        return copy;
    });
    const top = { ...plan, steps };
    return canonicalize(top);
}
/** sha256 over the canonical JSON of the normalized plan. */
export function planDigest(plan) {
    const canon = JSON.stringify(normalizePlan(plan));
    return createHash('sha256').update(canon, 'utf8').digest('hex');
}
/** Normalized logical graph for the oracle diff: steps + typed transitions + region membership,
 * canonical (sorted) ordering, cosmetic fields gone. */
export function toOracleProjection(plan) {
    const norm = normalizePlan(plan);
    const steps = norm.steps
        .map((s) => ({ id: s.stepId, kind: s.kind, phase: s.phase }))
        .sort((a, b) => a.id.localeCompare(b.id));
    const transitions = [];
    for (const s of norm.steps) {
        for (const d of s.deps ?? [])
            transitions.push({ from: d, to: s.stepId, kind: 'dep' });
    }
    transitions.sort((a, b) => (a.from + '→' + a.to).localeCompare(b.from + '→' + b.to));
    const joins = new Map((norm.joins ?? []).map((j) => [j.forStage, j]));
    const regions = (norm.fanouts ?? [])
        .map((f) => {
        const j = joins.get(f.stage);
        return {
            fanout: f.stage,
            join: j?.stage ?? '',
            joinPolicy: j?.joinPolicy ?? '',
            maxFanout: f.maxFanout,
            registry: [...f.registry].sort(),
            chain: [...(f.chain ?? [])],
        };
    })
        .sort((a, b) => a.fanout.localeCompare(b.fanout));
    return { kind: 'oracle-projection/1', steps, transitions, regions };
}
/** Control-flow/dependency graph with synthetic entry/exit and explicit fork/join pairs —
 * the ONLY plan view `loop-lint.ts` consumes. */
export function toLintProjection(plan) {
    const norm = normalizePlan(plan);
    const ids = norm.steps.map((s) => s.stepId);
    const idSet = new Set(ids);
    const edges = [];
    const hasIncoming = new Set();
    const hasOutgoing = new Set();
    const addEdge = (from, to) => {
        edges.push({ from, to });
        hasIncoming.add(to);
        hasOutgoing.add(from);
    };
    for (const s of norm.steps) {
        for (const d of s.deps ?? []) {
            if (!idSet.has(d))
                continue;
            addEdge(d, s.stepId);
        }
    }
    // fanout-region structure: fork → chain[0] → … → chain[last] → join (the region edges the
    // dep list does not carry — chain members are dispatched BY the fork, closed BY the join)
    const joinFor = new Map((norm.joins ?? []).map((j) => [j.forStage, j.stage]));
    for (const f of norm.fanouts ?? []) {
        const chain = (f.chain ?? []).filter((c) => idSet.has(c));
        let prev = idSet.has(f.stage) ? f.stage : null;
        for (const c of chain) {
            if (prev !== null)
                addEdge(prev, c);
            prev = c;
        }
        const join = joinFor.get(f.stage);
        if (prev !== null && join !== undefined && idSet.has(join))
            addEdge(prev, join);
    }
    for (const id of ids)
        if (!hasIncoming.has(id))
            edges.push({ from: 'entry', to: id });
    for (const id of ids)
        if (!hasOutgoing.has(id))
            edges.push({ from: id, to: 'exit' });
    const joins = new Map((norm.joins ?? []).map((j) => [j.forStage, j]));
    const forkJoinPairs = (norm.fanouts ?? []).map((f) => {
        const j = joins.get(f.stage);
        return {
            fork: f.stage,
            join: j?.stage ?? '',
            policy: j?.joinPolicy ?? '',
            branches: [...(f.chain ?? [])],
            maxFanout: typeof f.maxFanout === 'number' ? f.maxFanout : 0,
            registrySize: Array.isArray(f.registry) ? f.registry.length : 0,
        };
    });
    const phaseOrder = [];
    for (const s of norm.steps)
        if (!phaseOrder.includes(s.phase))
            phaseOrder.push(s.phase);
    const facts = norm.steps.map((s) => {
        const d = stepDefault(s);
        return {
            id: s.stepId,
            kind: s.kind,
            budgetMaxAgents: s.budget?.maxAgents ?? null,
            maxAttempts: d.maxAttempts,
            idempotent: d.idempotent,
            deliverable: d.deliverable,
            dispatch: s.dispatch ?? 'inline',
            cacheable: s.cacheable === true,
            writes: s.artifacts?.writes ?? [],
            tools: Array.isArray(s.tools) ? [...s.tools] : null,
        };
    });
    return {
        kind: 'lint-projection/1',
        nodes: ['entry', ...ids, 'exit'],
        edges,
        forkJoinPairs,
        phaseOrder,
        facts,
        pauses: (norm.pauses ?? []).map((p) => ({ state: p.state, resumeArg: p.resumeArg })),
        checkpointingEnabled: norm.checkpointing?.enabled === true,
        traceEmit: norm.trace?.emit === true,
    };
}
/** Expected runtime invariants — the ONLY plan view `loop-trace.ts::runInvariants` consumes. */
export function toTraceProjection(plan) {
    const norm = normalizePlan(plan);
    const byId = new Map(norm.steps.map((s) => [s.stepId, s]));
    const dispatches = (id) => {
        const k = byId.get(id)?.kind;
        return k === 'agent' || k === 'gate';
    };
    const happensBefore = [];
    for (const s of norm.steps) {
        if (!dispatches(s.stepId))
            continue;
        for (const d of s.deps ?? []) {
            if (dispatches(d))
                happensBefore.push({ step: s.stepId, afterSettleOf: d });
        }
    }
    const joins = new Map((norm.joins ?? []).map((j) => [j.forStage, j]));
    const shapes = new Map(norm.steps.map((s) => [s.stepId, s.concurrency ?? 'barrier']));
    const regions = (norm.fanouts ?? []).map((f) => {
        const j = joins.get(f.stage);
        const joinId = j?.stage ?? '';
        const after = norm.steps
            .filter((s) => dispatches(s.stepId) && (s.deps ?? []).some((d) => d === f.stage || (joinId !== '' && d === joinId)))
            .map((s) => s.stepId);
        return {
            fanout: f.stage,
            join: joinId,
            joinPolicy: j?.joinPolicy ?? '',
            maxFanout: typeof f.maxFanout === 'number' ? f.maxFanout : 0,
            members: [...(f.chain ?? [])],
            shape: shapes.get(f.stage) ?? 'barrier',
            after,
            registry: [...f.registry],
            registrySize: f.registry.length,
            overflow: f.overflow ?? 'window',
            dedup: f.dedup === true,
        };
    });
    return {
        kind: 'trace-projection/2',
        happensBefore,
        regions,
        expectedSteps: norm.steps.filter((s) => s.kind === 'agent' || s.kind === 'gate').map((s) => s.stepId),
    };
}
/** The ONLY plan view `workflow-run.ts` consumes (AM-3, fourth consumer). */
export function toRunProjection(plan) {
    const norm = normalizePlan(plan);
    const byId = new Map(norm.steps.map((s) => [s.stepId, s]));
    const gatesById = new Map((norm.gates ?? []).map((g) => [g.stepId, g]));
    const pausesByState = new Map((norm.pauses ?? []).map((p) => [p.state, p]));
    const fanouts = norm.fanouts ?? [];
    const joinsByForStage = new Map((norm.joins ?? []).map((j) => [j.forStage, j]));
    /** member stepId → its owning fanout stage; join stepId → its owning fanout stage. */
    const ownedByRegion = new Map();
    for (const f of fanouts) {
        for (const c of f.chain ?? [])
            ownedByRegion.set(c, f.stage);
        const j = joinsByForStage.get(f.stage);
        if (j !== undefined)
            ownedByRegion.set(j.stage, f.stage);
    }
    const specOf = (s) => {
        const g = s.kind === 'gate' ? gatesById.get(s.stepId) : undefined;
        return {
            stepId: s.stepId,
            kind: s.kind === 'gate' ? 'gate' : 'agent',
            phase: s.phase,
            prompt: typeof s.prompt === 'string' ? s.prompt : null,
            model: typeof s.model === 'string' && s.model !== '' ? s.model : null,
            deliverable: s.deliverable ?? 'return-value',
            reads: [...(s.artifacts?.reads ?? [])],
            writes: [...(s.artifacts?.writes ?? [])],
            tools: [...(s.tools ?? [])],
            retryMaxAttempts: typeof s.retry?.maxAttempts === 'number' && s.retry.maxAttempts >= 1 ? Math.floor(s.retry.maxAttempts) : 1,
            retryOn: [...(s.retry?.retryableFailureClasses ?? [])],
            maxAgents: typeof s.budget?.maxAgents === 'number' ? s.budget.maxAgents : 1,
            qeRole: s['x-role'] === 'qe',
            gate: g === undefined
                ? null
                : {
                    kind: typeof g.kind === 'string' ? g.kind : 'gate',
                    failRoute: typeof g.failRoute === 'string' ? g.failRoute : null,
                    maxRedos: typeof g.maxRedos === 'number' && Number.isFinite(g.maxRedos) && g.maxRedos > 0 ? Math.floor(g.maxRedos) : 0,
                },
        };
    };
    /** A declared dep resolved to the BOUNDARY that must have settled before this one dispatches. */
    const depBoundary = (dep) => ownedByRegion.get(dep) ?? dep;
    const boundaries = [];
    for (const s of norm.steps) {
        if (ownedByRegion.has(s.stepId))
            continue; // members and joins are rendered inside their region
        const deps = [...new Set((s.deps ?? []).map(depBoundary).filter((d) => d !== s.stepId))];
        if (s.kind === 'fanout') {
            const f = fanouts.find((x) => x.stage === s.stepId);
            const j = f === undefined ? undefined : joinsByForStage.get(f.stage);
            boundaries.push({
                boundaryId: s.stepId,
                kind: 'region',
                deps,
                region: {
                    fanout: s.stepId,
                    join: j?.stage ?? '',
                    joinPolicy: j?.joinPolicy ?? '',
                    onInvalid: j?.onInvalid ?? 'named-failure',
                    maxFanout: typeof f?.maxFanout === 'number' ? f.maxFanout : 0,
                    registry: [...(f?.registry ?? [])],
                    dedup: f?.dedup === true,
                    overflow: f?.overflow ?? 'window',
                    truncateReason: typeof f?.truncateReason === 'string' ? f.truncateReason : null,
                    shape: s.concurrency ?? 'barrier',
                    chain: (f?.chain ?? []).map((c) => byId.get(c)).filter((c) => c !== undefined).map(specOf),
                },
            });
            continue;
        }
        if (s.kind === 'pause') {
            const state = typeof s.pauseState === 'string' ? s.pauseState : '';
            const declared = pausesByState.get(state);
            boundaries.push({
                boundaryId: s.stepId,
                kind: 'pause',
                deps,
                pause: {
                    state,
                    resumeArg: declared?.resumeArg ?? '',
                    payloadSchema: declared?.payloadSchema ?? null,
                },
            });
            continue;
        }
        if (s.kind === 'gate') {
            boundaries.push({ boundaryId: s.stepId, kind: 'gate', deps, stage: specOf(s) });
            continue;
        }
        boundaries.push({ boundaryId: s.stepId, kind: 'stage', deps, stage: specOf(s) });
    }
    return {
        kind: 'run-projection/1',
        boundaries,
        budgetTotal: computeBudgetTotal(norm),
        resumeArgKeys: (norm.pauses ?? []).map((p) => p.resumeArg).filter((k) => typeof k === 'string' && k !== ''),
        traceEmit: norm.trace?.emit === true,
    };
}
//# sourceMappingURL=loop-plan.js.map