/**
 * One name per measured quantity — copied, not imported.
 *
 * THE PROBLEM (MEASURED 2026-08-25). Fifteen telemetry stores in this repo, each naming the same
 * thing differently: `durationMs` here, `minutes` there, `wallMs` in a third; `tokens` vs
 * `totalTokens` vs `tokensIn`/`tokensOut`. Joining two of them was interpretation, not lookup, which
 * is why cost-per-feature was 76% typed by a human.
 *
 * WHY LITERALS AND NOT A DEPENDENCY. OpenTelemetry's `gen_ai.*` conventions are the right vocabulary
 * and there is no package to depend on:
 *   • `@opentelemetry/semantic-conventions-genai` → 404 on npm (verified 2026-08-25);
 *   • in semconv v1.42.0 every `gen_ai.*` convention was DEPRECATED out of the main repo and moved
 *     to a new one with zero tags and zero releases;
 *   • 197 of 197 documents in that spec carry `stability: development`, which its own status page
 *     defines as "SHOULD NOT be used in production";
 *   • 40 fragments are queued, 6 of them breaking — and FOUR of those six are agent-layer.
 * So: copy the names, version the copy, and mark the volatile half. A rename upstream then becomes a
 * data migration against ONE file instead of a code change across call sites.
 *
 * WHAT THIS DOES NOT DO. It renames nothing. Migrating the existing stores onto these names is a
 * separate change with its own risk; this module only makes the join possible.
 *
 * NOT in the loop-blob registry, deliberately: a module mirrored into the sandboxed workflow drags a
 * registry regeneration and a region re-render behind every edit to it.
 *
 * @packageDocumentation
 */
/**
 * The contract's own version. Bump it when a name changes, and the change is then a migration
 * against a versioned file — which is the whole point of copying rather than depending.
 */
export const TELEMETRY_VOCAB_VERSION = 'dz-telemetry-vocab-1';
/** Every member of the closed set, as data for reachability checks. */
export const RUN_OUTCOMES = [
    'completed', 'completed-unverified', 'refused-repo-root', 'refused-design',
    'refused-plan', 'paused-checkpoint', 'crashed', 'unclassified',
];
export function runOutcomeOf(input) {
    if (input.phase === 'repo-root-mismatch')
        return 'refused-repo-root';
    if (input.phase === 'design-incomplete')
        return 'refused-design';
    if (input.phase === 'plan-gate-failed')
        return 'refused-plan';
    if (input.phase === 'checkpoint-after-plan')
        return 'paused-checkpoint';
    const gates = input.gates;
    if ((input.phase === null || input.phase === undefined || input.phase === '')
        && gates !== null && typeof gates === 'object') {
        const codeCompleted = gates.code === 'produced' || gates.code === 'landed';
        const qe = gates.qe;
        if (codeCompleted && typeof qe === 'string' && qe !== 'not-run' && qe !== 'ran' && qe !== '') {
            return 'completed';
        }
        return 'completed-unverified';
    }
    // A crashed run cannot classify itself; an external consumer assigns that outcome later.
    return 'unclassified';
}
/**
 * The vocabulary. Keys are stable identifiers for OUR code to reference; `field` is what goes on
 * disk, so an upstream rename touches the value and never the call sites.
 */
export const TELEMETRY_FIELDS = {
    requestModel: { field: 'gen_ai.request.model', source: 'otel', means: 'the model id a stage asked for', unit: null },
    // The upstream field means the SERVICE PROVIDER — anthropic, openai — not the product family.
    // Cross-family review caught this being described as "claude, codex", which are our model
    // families; those now have their own local field below rather than being smuggled in here.
    providerName: { field: 'gen_ai.provider.name', source: 'otel', means: 'the inference provider — anthropic, openai', unit: null },
    operationName: { field: 'gen_ai.operation.name', source: 'otel', means: 'what the call was: invoke_agent, invoke_workflow, plan, execute_tool', unit: null },
    inputTokens: { field: 'gen_ai.usage.input_tokens', source: 'otel', means: 'tokens SENT — not a total', unit: 'tokens' },
    outputTokens: { field: 'gen_ai.usage.output_tokens', source: 'otel', means: 'tokens PRODUCED — not a total', unit: 'tokens' },
    evaluationLabel: { field: 'gen_ai.evaluation.score.label', source: 'otel', means: 'a graded verdict — our QE letter grade', unit: null },
    // OpenTelemetry carries elapsed time as span structure, not as an attribute, so there is no
    // upstream name to copy for a JSONL row. Ours, and said so.
    durationMs: { field: 'dz.duration_ms', source: 'local', means: 'elapsed wall time of a stage or run', unit: 'ms' },
    runOutcome: { field: 'dz.run_outcome', source: 'local', means: 'terminal outcome of one feature-adr pipeline run', unit: null },
    // Upstream splits usage into input and output and has no TOTAL. Ours are totals, and folding them
    // into input_tokens would silently change the measured quantity (cross-family review).
    totalTokens: { field: 'dz.total_tokens', source: 'local', means: 'input + output for a run or stage', unit: 'tokens' },
    // Our routing families (claude, codex) are not providers; see providerName above.
    modelFamily: { field: 'dz.model_family', source: 'local', means: 'the routing family — claude, codex', unit: null },
    runId: { field: 'dz.run_id', source: 'local', means: 'the host workflow run a record belongs to', unit: null },
    stage: { field: 'dz.stage', source: 'local', means: 'the feature-adr stage a record is about', unit: null },
};
/**
 * The names whose upstream churn is highest — the agent layer, where FOUR of the six queued breaking
 * changes land (`gen_ai.agent.version` removed from internal invoke_agent spans,
 * `gen_ai.provider.name` dropped as required, `gen_ai.agent.id` scope changed).
 *
 * Separated by NAME rather than by footnote so a reader can tell "safe to build on" from "expect this
 * to move" without reading a comment. Build on these only where a rename is cheap.
 */
export const PROVISIONAL_TELEMETRY_FIELDS = {
    agentId: { field: 'gen_ai.agent.id', source: 'otel', means: 'PROVISIONAL — the agent instance', unit: null },
    agentName: { field: 'gen_ai.agent.name', source: 'otel', means: 'PROVISIONAL — the agent role/label', unit: null },
    agentVersion: { field: 'gen_ai.agent.version', source: 'otel', means: 'PROVISIONAL — slated for removal from internal spans', unit: null },
};
/**
 * What this repo already writes → which vocabulary key it means.
 *
 * Without this the contract is a glossary nobody can act on. With it, the cost join that was hand
 * work becomes a lookup. Wrong BY OMISSION for any store added without updating it — which is why
 * {@link telemetryFieldFor} returns nothing rather than guessing.
 */
export const LOCAL_FIELD_ALIASES = {
    durationMs: 'durationMs',
    wallMs: 'durationMs',
    // `minutes` is DELIBERATELY absent. It names the same quantity in a different unit, and an alias
    // carries no conversion — following it would write minutes into a field whose name ends `_ms`.
    // An unmapped name is visible at the call site; a wrong unit is not (cross-family review).
    tokens: 'totalTokens',
    totalTokens: 'totalTokens',
    recordTotalTokens: 'totalTokens',
    tokensIn: 'inputTokens',
    tokensOut: 'outputTokens',
    model: 'requestModel',
    coder: 'modelFamily',
    family: 'modelFamily',
    grade: 'evaluationLabel',
    runId: 'runId',
    stage: 'stage',
    outcome: 'runOutcome',
};
/**
 * The vocabulary field a local name means, or `undefined` when we do not know.
 *
 * The unknown case is the load-bearing one. A vocabulary that invents a mapping for a field it has
 * never seen produces a join that is silently wrong; one that returns nothing makes the gap visible
 * at the call site, where somebody can fix it.
 */
export function telemetryFieldFor(localName) {
    const key = LOCAL_FIELD_ALIASES[localName];
    if (key === undefined)
        return undefined;
    return TELEMETRY_FIELDS[key] ?? PROVISIONAL_TELEMETRY_FIELDS[key];
}
//# sourceMappingURL=telemetry-vocabulary.js.map