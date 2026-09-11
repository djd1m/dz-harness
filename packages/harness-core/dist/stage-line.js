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
export const STAGE_LINE_BLOB_VERSION = '2.0.0';
/**
 * Human signature per resolver branch — a CLOSED table over `StageDecisionReason`. A reason with no
 * entry is a hole, and `stage-line.test.ts` proves the table has none: a newcomer reading `· ` and
 * then a raw enum token learns nothing, which is the whole failure this feature exists to prevent.
 */
export const STAGE_LINE_REASON_LABELS = {
    'usage-override': 'usage override (Claude limit pressure)',
    'explicit-models': 'explicit args.models',
    'routing-not-requested': 'routing not requested',
    'coder-knob-codex': 'coder knob = codex',
    'planner-knob-codex': 'planner knob = codex',
    'qe-cross-family': 'cross-family QE (the coder never self-reviews)',
    'budget-table-cell': 'budget table cell',
    'default-models': 'default models table',
    'codex-id-substituted': 'unknown codex id — substituted',
    'spec-unrecognised': 'unrecognised spec — session-inherited',
    // dispatch-level (11-20): what the runtime or current fallback selection did.
    'coder-fallback': 'coder fallback ladder',
    'codex-unsupported-at-dispatch': 'codex unsupported at this dispatch — Claude',
    'fallback-after-no-deliverable': 'fallback — the previous rung delivered nothing',
    'precision-second-pass': 'independent precision second pass',
    'auto-cost': 'learned-cost routing',
    'qe-same-family-degraded': 'same-family QE — cross-family review NOT obtained',
    'challenge-panel': 'adversarial plan-gate panel',
    'codex-probe-failed': 'codex probe found no usable id — Claude',
    'codex-refused-before-dispatch': 'codex refused before dispatching — nothing ran',
    'fallback-rung': 'fallback rung (prior outcome reported separately)',
};
/** Stages that write an artifact FILE out of band when they resolve to Codex, and therefore wait on
 *  the Codex-landed barrier before their consumer runs. Naming it in the line tells the reader why
 *  the run is about to sit still.
 *
 *  The four DESIGN stages belong here too (R4-F5, cross-family review round 3): `designStage` runs an
 *  out-of-band artifact probe for any codex-resolved design stage, exactly as code and plan do, so a
 *  roster of only {code, plan} left the line silent about a barrier that was actually engaged. QE is
 *  deliberately absent — its codex path is a synchronous `codex exec`, not the wrapper — and so is
 *  delivery, whose planes never run on codex at all. */
export const STAGE_LINE_BARRIER_STAGES = {
    code: 1,
    plan: 1,
    requirements: 1,
    adr: 1,
    ideation: 1,
    architecture: 1,
};
/**
 * One deterministic line: `▸ <stage> · <model or "session"> · <branch signature>`, plus
 * ` · landed barrier` when this stage resolved to Codex AND uses the barrier.
 *
 * PURE: reads nothing, prints nothing, and depends on no state beyond its two arguments (AC-3).
 */
function renderStagePrefix(stage, decision) {
    let model = 'session';
    if (decision && decision.spec)
        model = decision.spec;
    return '▸ ' + stage + ' · ' + model;
}
/** Timely statement of what the workflow is about to try. It is explicitly not proof of dispatch. */
export function renderStageIntentLine(stage, decision) {
    let signature = '';
    if (decision) {
        const labelled = STAGE_LINE_REASON_LABELS[decision.reason];
        if (labelled)
            signature = labelled;
    }
    // An unlabelled reason must be VISIBLE, never silently blank: print the raw token so the hole is
    // reportable from a real run instead of reading as "no reason at all".
    if (!signature) {
        signature = 'unlabelled branch';
        if (decision && decision.reason)
            signature = 'unlabelled branch: ' + decision.reason;
    }
    let line = renderStagePrefix(stage, decision) + ' · ' + signature;
    if (STAGE_LINE_BARRIER_STAGES[stage] && decision && decision.opts && decision.opts.agentType === 'codex:codex-rescue') {
        line = line + ' · landed barrier';
    }
    return line + ' · intent';
}
/**
 * Final fact for one rung. It deliberately ignores the selection reason: the outcome owns only
 * this rung's state and refusal detail, so another rung's reason cannot leak into it.
 */
export function renderStageOutcomeLine(stage, decision, outcome) {
    let model = 'session';
    if (decision && decision.spec)
        model = decision.spec;
    let label = 'dispatched';
    if (outcome && outcome.state === 'probe-failed')
        label = 'probe found no usable model';
    else if (outcome && outcome.state === 'refused-before-dispatch')
        label = 'refused before dispatch';
    let line = '◆ ' + stage + ' · ' + model + ' · outcome: ' + label;
    if (outcome && outcome.state === 'refused-before-dispatch' && outcome.reason === 'codex-unsupported-at-dispatch') {
        line = line + ' · codex agent type unsupported';
    }
    else if (outcome && outcome.state === 'refused-before-dispatch' && outcome.reason) {
        line = line + ' · reason: ' + outcome.reason;
    }
    return line;
}
/** One-release compatibility alias: the historical renderer is now explicitly the intent half. */
export function renderStageLine(stage, decision) {
    const intent = renderStageIntentLine(stage, decision);
    return intent.slice(0, intent.length - ' · intent'.length);
}
//# sourceMappingURL=stage-line.js.map