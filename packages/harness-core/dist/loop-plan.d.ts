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
export declare const LOOP_PLAN_SCHEMA = "loop-plan/1";
/** Blob/schema version stamp read by scripts/gen-loop-blobs.mjs (this module is NOT a blob source
 * today; the stamp keeps the convention uniform for every loop-designer module). */
export declare const LOOP_PLAN_MODULE_VERSION = "1.0.0";
export type StepKind = 'agent' | 'fanout' | 'join' | 'gate' | 'pause';
export type Deliverable = 'return-value' | 'file';
export type ConcurrencyShape = 'barrier' | 'pipeline';
export type DispatchRoute = 'inline' | 'codex-wrapper' | 'codex-exec';
/** CLOSED serializable failure-class enum (AM-4 — never a callable). */
export declare const RETRYABLE_FAILURE_CLASSES: readonly ["timeout", "transport", "malformed-output", "policy-refusal"];
export type FailureClass = (typeof RETRYABLE_FAILURE_CLASSES)[number];
/** The closed join-policy set (INV-3). `quorum:<n>` is validated by pattern. */
export declare const JOIN_POLICIES: readonly ["all-declared", "all-activated", "any"];
export declare const QUORUM_RE: RegExp;
/**
 * Retry semantics owned by THIS schema (AM-4 — no verbatim LangGraph RetryPolicy copy):
 * - `maxAttempts` INCLUDES the initial attempt: `1` = run once, never retry (the default for
 *   `kind:'agent'` steps — agent stages are expensive and rarely idempotent).
 * - `retryableFailureClasses` is a CLOSED serializable enum list — a function value is a parse error.
 *
 * v1 NARROWING (QE round 6): the retry-TIMING family — `initialDelayMs` / `backoffMultiplier` /
 * `maxDelayMs` / `jitter` — is NOT enacted by loop-plan/1 v1 and is VALIDATED-AWAY
 * (`ENACT-RETRY-TIMING`). v1 retries are IMMEDIATE. Rationale: this field family reopened a
 * reviewer blocker in every round it was "enacted" (round-4: the member projection dropped
 * `initialDelayMs`; round-5: `backoffMultiplier`/`maxDelayMs` without `initialDelayMs` validated
 * and vanished symmetrically; negative delays and a zero multiplier validated then were silently
 * skipped). A plan must not validate while promising unperformed timing — see roadmap.
 */
export interface RetryProfile {
    /** Total attempt budget, INCLUDING the initial attempt (1 = no retry). */
    maxAttempts: number;
    /** NOT ENACTED in v1 — rejected by ENACT-RETRY-TIMING (retries are immediate); see roadmap. Milliseconds. */
    initialDelayMs?: number;
    /** NOT ENACTED in v1 — rejected by ENACT-RETRY-TIMING; see roadmap. */
    backoffMultiplier?: number;
    /** NOT ENACTED in v1 — rejected by ENACT-RETRY-TIMING; see roadmap. Milliseconds. */
    maxDelayMs?: number;
    /** NOT ENACTED in v1 — rejected by ENACT-RETRY-TIMING (the sandbox has no randomness); see roadmap. */
    jitter?: 'none' | 'full' | 'deterministic';
    /** CLOSED enum of retryable failure classes — never a callable (AM-4). */
    retryableFailureClasses?: FailureClass[];
}
/**
 * Cache policy — a SEPARATE identity from checkpointing (INV-6): cache is keyed on the step's
 * NORMALIZED INPUT; a checkpoint is keyed on EXECUTION POSITION. A step may be cacheable only
 * when `idempotent: true` and its deliverable has no external side effect.
 */
export interface CachePolicy {
    enabled: boolean;
    /** The canonical cache-key composition (documented, fixed for schema/1). */
    keyedOn: 'workflowVersion+stageVersion+normalizedInput+model+promptHash+toolSchemaHash+parameters+artifactHashes';
    ttl?: string;
    invalidateOn?: string[];
}
export interface LoopStep {
    stepId: string;
    title?: string;
    kind: StepKind;
    /** The phase this step reports under; `meta.phases` order must match first-reference order (INV-7). */
    phase: string;
    deps?: string[];
    /** Prompt seed rendered into the GENERATED region (part of the exec fingerprint's prompt axis). */
    prompt?: string;
    artifacts?: {
        reads?: string[];
        writes?: string[];
    };
    /** For fanout members: barrier (all A, then all B) vs pipeline (per-item chains). */
    concurrency?: ConcurrencyShape;
    /** Model spec for this step (resolved by the model-resolver blob when set). */
    model?: string | null;
    /** What the step delivers: its return value, or a file written out-of-band. Default 'return-value'. */
    deliverable?: Deliverable;
    idempotent?: boolean;
    retry?: RetryProfile;
    /** Cacheable only when idempotent and side-effect-free (INV-6). */
    cacheable?: boolean;
    cache?: CachePolicy;
    /** NOT ENACTED in v1 — rejected by ENACT-CKPT-OPT (per-step checkpoint granularity is deferred;
     * `checkpointing.enabled` checkpoints EVERY top-level agent step). The field false-flipped the
     * exec fingerprint in two review rounds; see roadmap. */
    checkpoint?: boolean;
    budget?: {
        maxAgents: number;
    };
    /**
     * DECLARED MCP tool perimeter for this dispatching step (cfr-pipeline ADR-002).
     *
     * A `<server>:<capability>` allowlist (`^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)+$`, checked by the
     * `tool-perimeter-declared` lint rule, not by the schema — the schema owns only the TYPE).
     * ENACTED by `stepPromptAssembly`: a non-empty array renders a fixed contract line into the
     * step's prompt, so the perimeter is COMMUNICATED to the agent rather than decorative. An empty
     * array is meaningful and is the correct value for a step that touches no external tool.
     *
     * HONESTY, said once and never softened elsewhere: this is a DECLARATION, not enforcement.
     * `agent()` exposes no tool restriction; real enforcement lives at the MCP server. No document
     * may call this a sandbox.
     */
    tools?: string[];
    /** Dispatch route. v1 NARROWING (QE round 6): only 'inline' is enacted — 'codex-wrapper' and
     * 'codex-exec' are VALIDATED-AWAY (ENACT-DISPATCH). The fire-and-forget wrapper returns a stub
     * that reads as a clean result, and codex-exec had no live-proven enactment here; see roadmap. */
    dispatch?: DispatchRoute;
    /** For kind:'pause' — which declared pause state this step returns. */
    pauseState?: string;
    /** Extension keys (x-…) are preserved and digested, never validated. */
    [xKey: `x-${string}`]: unknown;
}
export interface LoopFanout {
    /** The stepId of the kind:'fanout' step this config belongs to. */
    stage: string;
    /** The member registry the fanout draws from — REQUIRED (INV-2). */
    registry: string[];
    /** Hard concurrency bound — REQUIRED, >= 1 (INV-2; unbounded fanout is unrepresentable-invalid). */
    maxFanout: number;
    /** Admission policy when registry length exceeds maxFanout. Absent means window: dispatch all,
     * while maxFanout bounds only concurrent work. */
    overflow?: 'window' | 'truncate';
    /** Mandatory human-readable receipt when overflow:'truncate' deliberately drops work. */
    truncateReason?: string;
    dedup?: boolean;
    reasonRequired?: boolean;
    /** Per-item step chain (pipeline shape) — stepIds run in sequence per member. */
    chain?: string[];
}
export interface LoopJoin {
    /** The stepId of the kind:'join' step. */
    stage: string;
    /** The fanout stage this join closes (INV-3: every parallel region names its join). */
    forStage: string;
    branchSchema?: {
        caveats?: string[];
    };
    /** From the closed set: all-declared | all-activated | any | quorum:<n>. */
    joinPolicy: string;
    onInvalid?: string;
}
export interface LoopGate {
    stepId: string;
    kind: string;
    failRoute?: string;
    maxRedos?: number;
}
export interface LoopPause {
    /** Typed pause state name (checkpoint-return/re-invoke — never a generic interrupt, C-4). */
    state: string;
    payloadSchema?: Record<string, unknown>;
    /** The args key a re-invoke supplies to resume past this pause. */
    resumeArg: string;
}
/** The 5 explicit opt-in subsystem booleans — default ALL false. `model-resolver` is NOT an
 * opt-in: it auto-includes whenever any `step.model` is set (DDD resolution, 04 §3.1). */
export interface LoopSubsystems {
    checkpoints?: boolean;
    /** Default OFF — the health-advisor PHI lesson (AM-9): capture is never on by default. */
    trainingPairs?: boolean;
    usageAdaptive?: boolean;
    challengePanel?: boolean;
    /** NOT ENACTED in v1 — enabling it is rejected (ENACT-SUBSYS): codex dispatch routes are
     * validated-away (ENACT-DISPATCH), so the subsystem blob would inject with no call sites. */
    codexDispatch?: boolean;
}
export interface LoopPlan {
    schema: typeof LOOP_PLAN_SCHEMA;
    name: string;
    description: string;
    whenToUse: string;
    steps: LoopStep[];
    gates?: LoopGate[];
    fanouts?: LoopFanout[];
    joins?: LoopJoin[];
    pauses?: LoopPause[];
    /** `schemaVersion` is NOT ENACTED in v1 — rejected by ENACT-CKPT-OPT (v1 pins `loop-ckpt-1`);
     * the declared-vs-default distinction false-flipped the fingerprint in round 3; see roadmap. */
    checkpointing?: {
        enabled: boolean;
        schemaVersion?: string;
    };
    subsystems?: LoopSubsystems;
    trace?: {
        emit: boolean;
    };
    [xKey: `x-${string}`]: unknown;
}
export interface ParseError {
    path: string;
    message: string;
}
export interface Diagnostic {
    invariant: string;
    path: string;
    message: string;
}
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
export declare const ITEM_KEY_RE: RegExp;
/** The ItemKey validator both layers use (the plan half; the trace half calls the same regex). */
export declare function isItemKey(v: unknown): v is string;
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
export declare function stepIdent(stepId: string): string;
export type FieldDomain = {
    t: 'bespoke';
} | {
    t: 'string';
} | {
    t: 'boolean';
} | {
    t: 'number';
} | {
    t: 'posInt';
} | {
    t: 'enum';
    values: readonly string[];
} | {
    t: 'string[]';
} | {
    t: 'record';
} | {
    t: 'record[]';
} | {
    t: 'string|null';
};
/** Keys are `<Interface>.<field>` plus `<inlineField>.<sub>` — EXACTLY the keys the honesty test
 * extracts from this file's interface source (both directions asserted there). */
export declare const FIELD_DOMAINS: Record<string, FieldDomain>;
/** `<iface>` → its accepted field names, derived from FIELD_DOMAINS (never hand-written). */
export declare const KNOWN_KEYS: Record<string, ReadonlySet<string>>;
/** The record kinds that carry the documented `[xKey: \`x-${string}\`]` vendor escape — i.e. the
 * ONLY scopes where an `x-` key is accepted (Codex round-6: "Restrict `x-` acceptance to its
 * documented scopes"). The honesty test derives this set from the interface SOURCE (which
 * interfaces declare the index signature) in both directions, so it cannot drift either. */
export declare const X_KEY_IFACES: ReadonlySet<string>;
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
export declare const REQUIRED_FIELDS: Record<string, readonly string[]>;
export declare const STEP_FIELD_KINDS: Record<string, readonly StepKind[]>;
export interface CrossRef {
    /** '<collection>[].<field>' — the referencing field, as documented in diagnostics. */
    ref: string;
    /** Legal target step kinds. A reference to an existing step of another kind is XREF-1. */
    targetKinds: readonly StepKind[];
    /** 'terminal:<name>' allowed in place of a stepId (gate terminal routes). */
    allowTerminal?: true;
    /** How the renderer CONSUMES an accepted record (doc — the UNCONSUMED-1 checks assert the
     * reverse direction where a skip/no-op is otherwise possible). */
    consumes: string;
    /** Enumerate every reference instance this field carries in a plan (the table is self-contained:
     * a new entry cannot ship without its accessor, so it cannot silently validate nothing). */
    get: (plan: LoopPlan) => {
        target: string | undefined;
        path: string;
    }[];
}
export declare const CROSS_REFS: readonly CrossRef[];
/**
 * Parse a raw JSON value into a LoopPlan, or return the ParseError list (union return per the
 * behavioral contract). Structural only — semantic invariants live in `validatePlan`.
 * `x-` keys at the top level and per step are accepted and carried through verbatim.
 * A callable/`function` value anywhere in a retry field is a PARSE error (AM-4).
 */
export declare function parsePlan(json: unknown): LoopPlan | ParseError[];
/** True when a parsePlan return is the error branch of the union. */
export declare function isParseErrors(v: LoopPlan | ParseError[]): v is ParseError[];
/**
 * Semantic validation — INV-1…8 (one diagnostic per violated invariant instance, each naming the
 * invariant it defends). Pure; never throws.
 */
export declare function validatePlan(plan: LoopPlan): Diagnostic[];
/**
 * Canonical form: object keys sorted (x- keys included, so they participate in the digest),
 * cosmetic fields stripped, undefined dropped, step/array ORDER preserved (order is semantic —
 * INV-7 phase order derives from it).
 */
export declare function normalizePlan(plan: LoopPlan): LoopPlan;
/** sha256 over the canonical JSON of the normalized plan. */
export declare function planDigest(plan: LoopPlan): string;
export interface OracleProjection {
    kind: 'oracle-projection/1';
    steps: {
        id: string;
        kind: StepKind;
        phase: string;
    }[];
    transitions: {
        from: string;
        to: string;
        kind: 'dep';
    }[];
    regions: {
        fanout: string;
        join: string;
        joinPolicy: string;
        maxFanout: number;
        registry: string[];
        chain: string[];
    }[];
}
/** Normalized logical graph for the oracle diff: steps + typed transitions + region membership,
 * canonical (sorted) ordering, cosmetic fields gone. */
export declare function toOracleProjection(plan: LoopPlan): OracleProjection;
export interface LintProjection {
    kind: 'lint-projection/1';
    /** CFG nodes: synthetic 'entry'/'exit' + every stepId. */
    nodes: string[];
    /** Directed edges entry→roots, dep edges, leaves→exit. */
    edges: {
        from: string;
        to: string;
    }[];
    /** Explicit fork/join pairs with the branches activated between them. */
    forkJoinPairs: {
        fork: string;
        join: string;
        policy: string;
        branches: string[];
        maxFanout: number;
        registrySize: number;
    }[];
    /** Phase first-reference order (INV-7 cross-check). */
    phaseOrder: string[];
    /** Per-step lint facts (budget, retry, dispatch, deliverable, cache) — the rule inputs. */
    facts: {
        id: string;
        kind: StepKind;
        budgetMaxAgents: number | null;
        maxAttempts: number;
        idempotent: boolean;
        deliverable: Deliverable;
        dispatch: DispatchRoute;
        cacheable: boolean;
        writes: string[];
        /** DECLARED tool perimeter, or `null` when the step declares none (ADR-002: absence FLAGS —
         * silence is never permission, so `null` and `[]` must stay distinguishable here). */
        tools: string[] | null;
    }[];
    pauses: {
        state: string;
        resumeArg: string;
    }[];
    checkpointingEnabled: boolean;
    traceEmit: boolean;
}
/** Control-flow/dependency graph with synthetic entry/exit and explicit fork/join pairs —
 * the ONLY plan view `loop-lint.ts` consumes. */
export declare function toLintProjection(plan: LoopPlan): LintProjection;
export interface TraceProjection {
    kind: 'trace-projection/2';
    /** Expected happens-before edges: every dispatch of `step` must come after the settle of each
     * dep. Only DISPATCHING step kinds (agent/gate) appear — fanout/join/pause are structural
     * pseudo-steps that emit no trace events of their own (their ordering lives in `regions`). */
    happensBefore: {
        step: string;
        afterSettleOf: string;
    }[];
    /** Parallel regions with the runtime bound + concurrency shape the trace must exhibit.
     * `after` = the dispatching steps that depend on the region (fanout or join) — the trace-visible
     * witnesses of the barrier. */
    regions: {
        fanout: string;
        join: string;
        joinPolicy: string;
        maxFanout: number;
        members: string[];
        shape: ConcurrencyShape;
        after: string[];
        /** Projection/2 evidence used to prove positional dispatch coverage. */
        registry: string[];
        registrySize: number;
        overflow: 'window' | 'truncate';
        dedup: boolean;
    }[];
    /** Steps expected to appear in the trace, keyed by stepId (iteration/attempt keys are runtime axes). */
    expectedSteps: string[];
}
/** Expected runtime invariants — the ONLY plan view `loop-trace.ts::runInvariants` consumes. */
export declare function toTraceProjection(plan: LoopPlan): TraceProjection;
/** One dispatching step as the scheduler needs it — everything it must know to build a prompt,
 * pick a model, spend budget, retry, and verify a deliverable landed. */
export interface RunStepSpec {
    stepId: string;
    kind: 'agent' | 'gate';
    phase: string;
    /** USER prompt seed (`plan.steps[].prompt`); null means the plan declared none. */
    prompt: string | null;
    model: string | null;
    deliverable: Deliverable;
    reads: string[];
    writes: string[];
    tools: string[];
    /** INCLUDES the initial attempt (AM-4 semantics; 1 = no retry). */
    retryMaxAttempts: number;
    retryOn: FailureClass[];
    /** `budget.maxAgents ?? 1` — the per-step worst case a boundary reservation is built from. */
    maxAgents: number;
    /** `step['x-role'] === 'qe'` — the designed `x-` seam, not a schema field (fence: zero surgery). */
    qeRole: boolean;
    gate: {
        kind: string;
        failRoute: string | null;
        maxRedos: number;
    } | null;
}
/** One SCHEDULING BOUNDARY: the unit the runner reserves budget for, checkpoints, and may pause
 * BEFORE. A parallel region is ONE boundary (its worst case is reserved as a whole), which is what
 * makes "pause before the region, never mid-region" expressible. */
export interface RunBoundary {
    /** The stepId of the stage / fanout / gate / pause this boundary enacts. */
    boundaryId: string;
    kind: 'stage' | 'region' | 'gate' | 'pause';
    /** Happens-before inputs, as BOUNDARY ids: a declared dep on a join stage or a fanout member is
     * carried as its REGION, because the member and the join are not boundaries of their own. */
    deps: string[];
    /** Present for kind 'stage' | 'gate'. */
    stage?: RunStepSpec;
    /** Present for kind 'region'. */
    region?: {
        fanout: string;
        join: string;
        joinPolicy: string;
        onInvalid: string;
        maxFanout: number;
        registry: string[];
        dedup: boolean;
        overflow: 'window' | 'truncate';
        truncateReason: string | null;
        shape: ConcurrencyShape;
        chain: RunStepSpec[];
    };
    /** Present for kind 'pause'. */
    pause?: {
        state: string;
        resumeArg: string;
        payloadSchema: Record<string, unknown> | null;
    };
}
export interface RunProjection {
    kind: 'run-projection/1';
    /** Plan order — the render's enactment order, so both enactors walk the same sequence. */
    boundaries: RunBoundary[];
    /** `computeBudgetTotal(plan)` — the SAME number the rendered script spends against. */
    budgetTotal: number;
    /** Plan-declared `pauses[].resumeArg` keys — the enumerated argsHash exclusions (AM-13). */
    resumeArgKeys: string[];
    /** `plan.trace.emit === true` — the AM-6 gate input (a run with no trace plane is refused). */
    traceEmit: boolean;
}
/** The ONLY plan view `workflow-run.ts` consumes (AM-3, fourth consumer). */
export declare function toRunProjection(plan: LoopPlan): RunProjection;
//# sourceMappingURL=loop-plan.d.ts.map