/**
 * stage-line-before-dispatch — the two-phase stage announcement renderer used by feature-adr
 * dispatch points (historical feature name `stage-line-before-dispatch`, ADR-001). The workflow's
 * sole dispatch seam prints an intent line before the runtime call and a distinct final outcome
 * line after the same attempt settles.
 *
 * WHY this file is standalone and import-free: the workflow script runs in a sandbox with no
 * imports, so this module is projected into `.claude/workflows/feature-adr.js` VERBATIM by
 * `scripts/gen-loop-blobs.mjs` (blob `stage-line`) and byte-checked there by
 * `loop-blobs-regen.test.ts`. The generator FAILS CLOSED on any cross-file import, so the decision
 * shape below is declared STRUCTURALLY here rather than imported from `feature-adr-routing.ts`.
 *
 * The line is PURE TEXT ASSEMBLY: every field comes from the decision the resolver returned or from
 * the constant label table below. No model ever writes a word of it (AC-6), it reads nothing, and it
 * prints nothing — the caller does the printing (AC-3).
 *
 * DESIGN CONSTRAINT (shared with feature-adr-routing.ts): the Workflow parser is stricter than
 * `node --check` — string `+` concatenation only, explicit `if`/`return`, object-literal tables.
 *
 * @packageDocumentation
 */
/** Blob version stamp read by scripts/gen-loop-blobs.mjs; bump on any semantic change here. */
export declare const STAGE_LINE_BLOB_VERSION = "2.0.0";
/**
 * The decision shape `renderStageLine` consumes — structurally identical to
 * `StageDecision` from `feature-adr-routing.ts`, declared locally because a cross-file import
 * would make this file unprojectable into the sandboxed workflow (see the file header).
 */
export interface StageLineDecision {
    readonly opts: {
        readonly agentType?: string;
        readonly model?: string;
    };
    readonly spec: string | null;
    readonly reason: string;
}
export type StageLineOutcomeState = 'dispatched' | 'probe-failed' | 'refused-before-dispatch';
/** Final state of this exact rung. Selection reasons never travel through this shape. */
export interface StageLineOutcome {
    readonly state: StageLineOutcomeState;
    readonly reason: string | null;
}
/**
 * Human signature per resolver branch — a CLOSED table over `StageDecisionReason`. A reason with no
 * entry is a hole, and `stage-line.test.ts` proves the table has none: a newcomer reading `· ` and
 * then a raw enum token learns nothing, which is the whole failure this feature exists to prevent.
 */
export declare const STAGE_LINE_REASON_LABELS: Record<string, string>;
/** Stages that write an artifact FILE out of band when they resolve to Codex, and therefore wait on
 *  the Codex-landed barrier before their consumer runs. Naming it in the line tells the reader why
 *  the run is about to sit still.
 *
 *  The four DESIGN stages belong here too (R4-F5, cross-family review round 3): `designStage` runs an
 *  out-of-band artifact probe for any codex-resolved design stage, exactly as code and plan do, so a
 *  roster of only {code, plan} left the line silent about a barrier that was actually engaged. QE is
 *  deliberately absent — its codex path is a synchronous `codex exec`, not the wrapper — and so is
 *  delivery, whose planes never run on codex at all. */
export declare const STAGE_LINE_BARRIER_STAGES: Record<string, number>;
/** Timely statement of what the workflow is about to try. It is explicitly not proof of dispatch. */
export declare function renderStageIntentLine(stage: string, decision: StageLineDecision): string;
/**
 * Final fact for one rung. It deliberately ignores the selection reason: the outcome owns only
 * this rung's state and refusal detail, so another rung's reason cannot leak into it.
 */
export declare function renderStageOutcomeLine(stage: string, decision: StageLineDecision, outcome: StageLineOutcome): string;
/** One-release compatibility alias: the historical renderer is now explicitly the intent half. */
export declare function renderStageLine(stage: string, decision: StageLineDecision): string;
//# sourceMappingURL=stage-line.d.ts.map