/**
 * Per-stage cost ledger with a reconciliation invariant for feature-adr runs
 * (feature `cost-ledger`, ADR-001/ADR-002/ADR-003).
 *
 * A feature-adr run reports ONE number. The recorded run `wf_0576bd7d-797` has
 * `totalTokens: 623290` — the "623k subagent tokens" figure in project memory. That number cannot
 * be attributed to a stage, so "where the budget burns" is a feeling. feature-adr ALREADY labels
 * every stage via `stageLabel()` and the harness ALREADY persists those labels next to per-agent
 * transcripts; nothing joined labels to spend. This module is that join.
 *
 * ## What this is
 *
 * A POST-HOC DERIVER (ADR-001). It reads what is already on disk —
 * `<session>/workflows/wf_<runId>.json` for the stage labels and
 * `<session>/subagents/workflows/<runId>/agent-<agentId>.jsonl` for the spend — and never edits
 * `.claude/workflows/feature-adr.js`. A killed run is still derivable, which a stage-boundary
 * writer could not manage; 5 of 29 recorded runs on this machine are killed.
 *
 * ## The invariant (ADR-002 — the load-bearing half)
 *
 * The obvious run total, the record's own `totalTokens`, is EXACTLY `Σ workflowProgress[].tokens`
 * in 29 of 29 recorded runs. Reconciling against it can never fail: a vacuous gate that would print
 * BALANCED forever and be believed. So the right-hand side comes from the run's transcript
 * DIRECTORY LISTING — a source independent of the record — and both sides run the SAME estimator
 * (`weightedTokensOf`, shared with `dz usage`):
 *
 * ```
 *   accountedTokens + unaccountedTokens      === runTotalTokens
 *   accountedTokens + doubleAttributedTokens === stageTokensSum
 * ```
 *
 * Raw integer equality, no epsilon: rounding happens exactly once, per sample, at extraction.
 * {@link verifyCostLedgerReport} re-derives both identities from the emitted report — the writer
 * clamps, the verifier enforces raw equality (the `event-chain.ts` house pattern). A mismatch is a
 * NAMED defect from {@link COST_LEDGER_DEFECT_KINDS}, never a rounding remainder.
 *
 * ## What this is NOT — read {@link COST_LEDGER_SCOPE} before describing it to anyone
 *
 * The totals are LOCAL TRANSCRIPT ESTIMATES. No billing API is consulted. The invariant therefore
 * catches ATTRIBUTION errors — a double-counted stage, a stage missing from the ledger — and says
 * NOTHING about whether the prices are right. The USD column is a secondary figure derived from a
 * static table that has no `claude-fable` entry, so it falls back to sonnet-class pricing for the
 * default model of every recorded run; the fallback is REPORTED, per ADR-003, not hidden.
 *
 * The ADR-158 reference implementation this feature is grounded in quotes a ~50.5% figure. That
 * number is SYNTHETIC, belongs to their document, and is never a measurement of this repo.
 *
 * @packageDocumentation
 */
/** The one sentence that states what the ledger is and is not. Printed by EVERY surface (ADR-003). */
export declare const COST_LEDGER_SCOPE: string;
export type CostLedgerDefectKind = 
/** Run spend attributed to no stage — an agent transcript with no `workflowProgress[]` entry. */
'Unaccounted'
/** One usage sample claimed by more than one stage. */
 | 'DoubleAttributed'
/** A stage claims a sample absent from the run's universe — the join went outside the run. */
 | 'ForeignSample'
/** A stage present in the run record has no transcript, or a transcript with no usage samples. */
 | 'MissingStageTranscript'
/** A record or sample whose fields are missing, mistyped or non-finite — never silently ignored. */
 | 'MalformedRecord'
/** The transcript listing hit the file cap — the run total is INCOMPLETE, so no verdict may be
 *  built on it (Codex QE HIGH: a silent cap could emit BALANCED from a partial directory). */
 | 'TruncatedListing';
/**
 * The defect vocabulary, as data. Deliberately absent: any name implying these are BILLED amounts —
 * that name would assert exactly the promise {@link COST_LEDGER_SCOPE} refuses. A test pins this
 * list so the vocabulary cannot quietly grow such a name.
 */
export declare const COST_LEDGER_DEFECT_KINDS: readonly CostLedgerDefectKind[];
/**
 * Three values, not two. `INSUFFICIENT_DATA` is NOT success: a caller must not read
 * `verdict !== 'DEFECT'` as "reconciled" (ADR-003).
 */
export type CostLedgerVerdict = 'BALANCED' | 'DEFECT' | 'INSUFFICIENT_DATA';
export declare const COST_LEDGER_VERDICTS: readonly CostLedgerVerdict[];
/**
 * Default reconciliation tolerance, as a FRACTION of the run total. Zero, because the arithmetic is
 * exact integer — there is no rounding remainder for a tolerance to absorb, so any remainder is a
 * defect. A caller may raise it to tolerate small orphans; its value is always printed.
 */
export declare const DEFAULT_COST_LEDGER_EPSILON = 0;
/** One deduped usage sample extracted from a transcript. */
export interface CostLedgerSample {
    /** Dedup key: `message.id + ':' + requestId`, or a content key when both are absent. */
    readonly key: string;
    /** Epoch ms, or `null` when the record carried no parseable timestamp. */
    readonly ts: number | null;
    /** Cost-weighted input-equivalent tokens, ROUNDED — the single rounding point of the feature. */
    readonly weighted: number;
    readonly input: number;
    readonly cacheWrite: number;
    readonly cacheRead: number;
    readonly output: number;
    readonly model: string | null;
}
/** One `type: "workflow_agent"` entry of a run record, after clamping. */
export interface WorkflowStageEntry {
    /** `stageLabel()` output, VERBATIM — the ledger invents no taxonomy (FR-2). */
    readonly label: string;
    readonly agentId: string;
    readonly model: string;
    readonly phase: string | null;
    readonly startedAtMs: number | null;
    readonly durationMs: number | null;
    readonly state: string | null;
    /** The record's own per-agent token count. Reported for traceability; NOT the invariant's input. */
    readonly recordTokens: number | null;
}
/** A parsed `wf_<runId>.json` workflow run record. */
export interface WorkflowRunRecord {
    readonly runId: string;
    readonly workflowName: string | null;
    readonly slug: string | null;
    readonly status: string | null;
    readonly startedAtMs: number | null;
    readonly durationMs: number | null;
    /** The record's cached `Σ workflowProgress[].tokens` — RAW, unweighted, and NOT the run total. */
    readonly recordTotalTokens: number | null;
    readonly stages: readonly WorkflowStageEntry[];
    /** Non-fatal problems found while parsing — surfaced as `MalformedRecord` defects. */
    readonly malformed: readonly string[];
}
/** One ledger row: a stage's aggregated spend (FR-1). */
export interface CostLedgerRow {
    readonly runId: string;
    readonly slug: string | null;
    /** `stageLabel()` output, verbatim. */
    readonly stage: string;
    readonly phase: string | null;
    /** The stage's model id, or `'mixed'` when several agents share a label with different models. */
    readonly model: string;
    readonly agentIds: readonly string[];
    readonly tokensIn: number;
    readonly tokensCacheWrite: number;
    readonly tokensCacheRead: number;
    readonly tokensOut: number;
    /** Cost-weighted input-equivalent tokens — the PRIMARY number of the row. */
    readonly weightedTokens: number;
    /** Secondary, derived estimate. `pricingKnown === false` ⇒ sonnet-class fallback pricing. */
    readonly costUsd: number;
    readonly pricingKnown: boolean;
    /** ISO, from the run record's stage boundaries (ADR-001) — `null` when the record lacked them. */
    readonly startedTs: string | null;
    readonly endedTs: string | null;
    /** Number of deduped usage samples (billed calls) attributed to this stage. */
    readonly calls: number;
}
export interface CostLedgerDefect {
    readonly kind: CostLedgerDefectKind;
    readonly detail: string;
    /** Weighted tokens implicated, when the defect is quantitative. */
    readonly tokens?: number;
    /** Stage labels or agent ids implicated, when the defect is locatable. */
    readonly subjects?: readonly string[];
}
export interface CostLedgerReconciliation {
    /** RIGHT side — dedup-union over the run's transcript DIRECTORY (independent of the record). */
    readonly runTotalTokens: number;
    /** Dedup-union of samples claimed by at least one stage. */
    readonly accountedTokens: number;
    /** Σ of the per-stage sums. Exceeds `accountedTokens` exactly when a sample is double-claimed. */
    readonly stageTokensSum: number;
    /** `runTotalTokens - accountedTokens`. */
    readonly unaccountedTokens: number;
    /** `stageTokensSum - accountedTokens`. */
    readonly doubleAttributedTokens: number;
    /** Tolerance as a FRACTION of the run total; `0` by default (ADR-002). */
    readonly epsilon: number;
    /** Both raw integer identities held when the report was built. */
    readonly identityHolds: boolean;
    readonly verdict: CostLedgerVerdict;
    readonly defects: readonly CostLedgerDefect[];
}
export interface CostLedgerReport {
    readonly runId: string;
    readonly slug: string | null;
    readonly workflowName: string | null;
    readonly status: string | null;
    readonly startedTs: string | null;
    readonly rows: readonly CostLedgerRow[];
    readonly reconciliation: CostLedgerReconciliation;
    /** The record's cached raw sum — reported, never the invariant's right-hand side (ADR-002). */
    readonly recordTotalTokens: number | null;
    readonly totalCostUsd: number;
    /** Model ids whose USD figures used sonnet-class fallback pricing (ADR-003). */
    readonly pricingFallbackModels: readonly string[];
    /** ALWAYS `true` — a local aggregation, not an official API (mirrors `dz usage`). */
    readonly estimated: true;
    /** ALWAYS {@link COST_LEDGER_SCOPE}. */
    readonly scope: string;
}
/** FR-8 feed-forward aggregate. WIRING INTO auto-cost ROUTING IS OUT OF SCOPE — this is a reader. */
export interface StageCostAggregate {
    readonly stage: string;
    readonly model: string;
    readonly avgTokens: number;
    readonly runs: number;
    readonly totalTokens: number;
    readonly avgCostUsd: number;
}
/**
 * Extract deduped, weighted usage samples from ONE transcript's text. Pure and never-throw — a
 * corrupt line is skipped, exactly as `computeUsage` does.
 *
 * `weighted` is `Math.round(weightedTokensOf(...))`: the SINGLE rounding point of the feature, so
 * every sum downstream is exact integer arithmetic and the reconciliation identity is raw equality
 * rather than a float comparison (ADR-002).
 */
export declare function extractCostSamples(text: string): CostLedgerSample[];
/**
 * Parse a `wf_<runId>.json` object into a {@link WorkflowRunRecord}. Pure and never-throw; every
 * number is clamped and every unusable field is RECORDED in `malformed` rather than dropped, so it
 * can surface as a `MalformedRecord` defect (the vocabulary refuses silent ignores).
 *
 * `args` is stored as a JSON STRING in the recorded runs on this machine and as an object in
 * others; both shapes are accepted.
 */
export declare function parseWorkflowRunRecord(raw: unknown): WorkflowRunRecord | null;
/** Per-stage sample sets, keyed by the `stageLabel()` string. */
export interface StageSampleSet {
    readonly stage: string;
    readonly samples: readonly CostLedgerSample[];
}
export interface BuildCostLedgerInput {
    readonly record: WorkflowRunRecord;
    /** LEFT side — one entry per `agentId` that had a transcript. */
    readonly stageSamples: readonly {
        readonly agentId: string;
        readonly samples: readonly CostLedgerSample[];
    }[];
    /** RIGHT side — the dedup-union over the run's transcript DIRECTORY (ADR-002). */
    readonly runSamples: readonly CostLedgerSample[];
    /** Agent transcripts present in the run directory with no `workflowProgress[]` entry. */
    readonly orphanAgentIds?: readonly string[];
    /** Fraction of the run total tolerated as unaccounted. Default {@link DEFAULT_COST_LEDGER_EPSILON}. */
    readonly epsilon?: number;
    /** True when the transcript listing hit the file cap — the run total is incomplete (Codex QE HIGH). */
    readonly transcriptListingTruncated?: boolean;
}
/**
 * Build the report and evaluate the invariant. PURE — no filesystem, no clock. Every number that
 * enters is clamped here (the writer clamps; {@link verifyCostLedgerReport} enforces raw equality).
 */
export declare function buildCostLedger(input: BuildCostLedgerInput): CostLedgerReport;
/**
 * Re-derive both identities from an EMITTED report — the verifier half of the house pattern. It
 * trusts nothing the builder computed except the numbers it printed, so a future writer bug shows
 * up as a `MalformedRecord` finding instead of a plausible table.
 */
export declare function verifyCostLedgerReport(report: CostLedgerReport): readonly CostLedgerDefect[];
/**
 * Aggregate per-stage cost across runs, for a future auto-cost router that today chooses models
 * from a STATIC assumptions table.
 *
 * **WIRING INTO ROUTING IS OUT OF SCOPE for this feature** — this returns data and nothing consumes
 * it yet. That is deliberate: an ESTIMATED number must not drive an expensive routing decision
 * until it has been calibrated. Rows from runs whose verdict is not `BALANCED` are EXCLUDED, so a
 * run with a known attribution defect can never quietly become a routing input.
 */
export declare function stageCostAggregates(reports: readonly CostLedgerReport[]): StageCostAggregate[];
/** Human table + reconciliation line + verdict + the honest-scope note (ADR-003). */
export declare function renderCostLedger(report: CostLedgerReport): string;
/**
 * FR-7 serialization: one JSON object per line. The first line is a `kind: "cost-ledger-scope"`
 * header carrying {@link COST_LEDGER_SCOPE}, so the honest scope travels with the file; the last is
 * the reconciliation. This is a REGENERABLE REPORT, never a read-back source of truth (ADR-001).
 */
export declare function costLedgerJsonl(report: CostLedgerReport): string;
export interface CostLedgerIoOptions {
    /** Override the `~/.claude/projects` root. Defaults to {@link claudeProjectsRoot}. */
    readonly projectsRoot?: string;
    /** Munged project directory name (e.g. `-home-user-repo`). Absent ⇒ scan every project. */
    readonly projectDir?: string;
    readonly epsilon?: number;
}
export interface CostLedgerRunRef {
    readonly runId: string;
    readonly slug: string | null;
    readonly workflowName: string | null;
    readonly status: string | null;
    readonly startedAtMs: number | null;
    /** Absolute path of the `wf_*.json` record. */
    readonly recordPath: string;
    /** Absolute path of `<session>/subagents/workflows/<runId>` — may not exist. */
    readonly transcriptDir: string;
}
/**
 * Enumerate workflow run records, newest first. NEVER throws — an unreadable tree yields `[]`.
 * READONLY. `lstat` everywhere, so a symlinked session or run directory is never walked.
 */
export declare function listCostLedgerRuns(opts?: CostLedgerIoOptions): CostLedgerRunRef[];
export interface DeriveCostLedgerOptions extends CostLedgerIoOptions {
    /** Exact run id. Must match `[A-Za-z0-9_.-]{1,128}` — it becomes a path segment. */
    readonly runId?: string;
    /** Most recent run with this `args.slug`. Same pattern restriction. */
    readonly slug?: string;
}
/**
 * Derive the ledger for ONE run. Returns `null` when no run matches — an ABSENT run is never a
 * BALANCED empty report (ADR-003). NEVER throws; READONLY.
 */
export declare function deriveCostLedger(opts?: DeriveCostLedgerOptions): CostLedgerReport | null;
/**
 * FR-8 IO wrapper: derive every run and aggregate. Runs that do not reconcile are excluded by
 * {@link stageCostAggregates}. NEVER throws; READONLY. Still NOT wired into routing.
 */
export declare function deriveStageCostAggregates(opts?: CostLedgerIoOptions & {
    readonly maxRuns?: number;
}): StageCostAggregate[];
/**
 * FR-7 opt-in materialization. Atomic: writes a sibling `.tmp` then `renameSync`s over the target,
 * and removes the temp file if the rename fails, so a crash can never leave a half-written ledger.
 * Returns `true` on success; never throws.
 */
export declare function writeCostLedgerJsonl(path: string, report: CostLedgerReport): boolean;
//# sourceMappingURL=cost-ledger.d.ts.map