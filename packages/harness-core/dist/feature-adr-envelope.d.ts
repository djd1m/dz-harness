/**
 * The experiment envelope (ADR-001, experiment-envelope). Pure data, built ONCE per run right after
 * the Step-0 router and before Step 1, then carried unchanged into every autorow the pipeline writes
 * (the run-cost ledger, training pairs, the round state). It answers two questions the pipeline used
 * to leave unanswered: what STRATUM was this run (task kind, tier, priority) and what DECISION did
 * routing make (which arms were considered, which one was chosen, by which policy, evaluated by whom).
 *
 * D1 (ADR-001): collecting these fields per-writer let three sources disagree — `mode` and `runId`
 * already drifted across the ledger (133/343 and 34/343 respectively, MEASURED in Step 0). Building
 * the envelope once and threading the same object through every writer removes that class of drift
 * by construction.
 */
export declare const ENVELOPE_SCHEMA: 1;
export declare const TASK_KINDS: readonly ["feature", "bugfix", "refactor", "tooling", "docs", "research"];
export type TaskKind = typeof TASK_KINDS[number];
export declare const PRIORITIES: readonly ["speed", "balance", "quality", "unset"];
export type EnvelopePriority = typeof PRIORITIES[number];
export declare const TIERS: readonly ["S", "M", "L", "XL"];
export type EnvelopeTier = typeof TIERS[number];
export interface ExperimentEnvelopeArms {
    readonly mode: readonly string[];
    readonly stages: Readonly<Record<string, readonly string[]>>;
}
export interface ExperimentEnvelopeChosen {
    readonly mode: string;
    readonly stages: Readonly<Record<string, string>>;
    /** Lead delta after Codex r2 (HIGH): a stage whose chosen spec was NOT among the offered arms
     * (usage-override, session-inherited fallback) is recorded HERE explicitly — arms stay the set that
     * was actually offered; the winner is never appended to them after the fact. */
    readonly overrides?: Readonly<Record<string, string>>;
    /**
     * ablation-c-start (ADR-001, T3; fix-round-1 BLOCKER #2): the pre-registered ablation-C arm
     * (`direct` | `reference`) for THIS run, filled only when `args.experiment`/`args.taskId` were
     * given AND the workflow successfully RESOLVED an existing assignment for that task via
     * `dz experiment resolve` — never taken from a caller-supplied arm option (that was the BLOCKER
     * fix-round-1 found: a caller could set the arm to anything, with zero journal entry). Deliberately
     * a SEPARATE field from `mode` — `mode` already means "same-family vs cross-family reviewer" (a
     * different axis) — so setting `qeMode` never redefines what `mode` has always meant. Absent (not
     * `null`) when no arm was resolved, so `JSON.stringify` drops the key and an unflagged run's
     * envelope stays byte-identical to before this feature (NFR-2).
     */
    readonly qeMode?: string;
}
export interface ExperimentEnvelopePolicy {
    readonly name: string;
    readonly version: string;
    readonly propensity: number | null;
}
export interface ExperimentEnvelopeEvaluator {
    readonly family: 'claude' | 'codex' | null;
    readonly model: string | null;
    readonly source: 'planned' | 'actual';
}
export interface ExperimentEnvelope {
    readonly schema: 1;
    readonly runId: string;
    /**
     * fix-round-1/F4: `null` when the persistent `.fa-state/attempt` counter probe failed — never a
     * fabricated guess (the old `resumedStages.length > 0 ? 2 : 1` heuristic silently reported "2" for
     * every third-and-later retry). Mirrors the `treeSha`/`treeShaReason` null+reason shape below.
     */
    readonly attempt: number | null;
    /** Required (non-empty) exactly when `attempt` is null; null whenever `attempt` is a real count. */
    readonly attemptReason: string | null;
    readonly taskKind: TaskKind;
    readonly tier: EnvelopeTier;
    readonly priority: EnvelopePriority;
    readonly treeSha: string | null;
    readonly treeShaReason: string | null;
    readonly arms: ExperimentEnvelopeArms;
    readonly chosen: ExperimentEnvelopeChosen;
    readonly policy: ExperimentEnvelopePolicy;
    readonly evaluator: ExperimentEnvelopeEvaluator;
}
export interface BuildExperimentEnvelopeInput {
    readonly runId: string;
    readonly attempt: number | null;
    readonly attemptReason?: string | null;
    readonly taskKind: TaskKind;
    readonly tier: EnvelopeTier;
    readonly priority: EnvelopePriority;
    readonly treeSha: string | null;
    readonly treeShaReason?: string | null;
    readonly arms: ExperimentEnvelopeArms;
    readonly chosen: ExperimentEnvelopeChosen;
    readonly policy: ExperimentEnvelopePolicy;
    readonly evaluator: ExperimentEnvelopeEvaluator;
}
/**
 * Assembles the normalized envelope object from already-resolved inputs. This function does not
 * derive routing decisions itself (the caller — the Step-0-adjacent block in the workflow — resolves
 * `arms`/`chosen`/`evaluator` from the routing tables); it only shapes the result consistently and
 * fills the one field that has a computed default: `treeShaReason` is populated only when `treeSha`
 * is null, and cleared when it is not.
 */
export declare function buildExperimentEnvelope(input: BuildExperimentEnvelopeInput): ExperimentEnvelope;
/**
 * Validates an envelope value field by field, IN ORDER, and returns the FIRST invalid field by name
 * (never a batch of errors — the refusal channel this feeds, `run-records.ts` FR-5, prints one reason
 * line and that line must name something actionable).
 */
export declare function validateExperimentEnvelope(value: unknown): {
    ok: true;
} | {
    ok: false;
    reason: string;
};
//# sourceMappingURL=feature-adr-envelope.d.ts.map