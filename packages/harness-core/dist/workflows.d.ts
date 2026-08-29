/**
 * RETIRED — the ADR-005 workflow templates are gone (feature loop-designer, AM-6 / architecture
 * §8.2). They emitted a pre-`meta`/`phases` format (`export default {tasks, maxConcurrency}`) the
 * current Workflow runtime cannot execute — a broken command, not a feature.
 *
 * Replacement: `dz workflow init` (scaffold a `loop-plan/1` plan), `dz workflow validate`,
 * `dz workflow render` (plan → executable region-delimited loop script), plus the sibling gates
 * `dz workflow-lint` and `dz workflow-trace`. See `loop-plan.ts` / `loop-render.ts`.
 *
 * BREAKING (deliberate, channeled): removing `WorkflowTemplate`/`WORKFLOWS`/`getWorkflow` is a
 * public API change for harness-core. harness-core is 0.x, where MINOR is this repo's breaking
 * channel; the removal is named in the CHANGELOG and README — never silent. The only internal
 * importer was `harness-cli`'s `cmdWorkflow` (MEASURED at plan time), rewritten in the same change.
 *
 * This module stays as a deprecation shim so stale imports fail LOUDLY with a pointer, not with a
 * confusing "module not found".
 */
/** The pinned retirement message the CLI prints (tested by workflow-legacy-shim.test.ts). */
export declare const WORKFLOW_TEMPLATES_RETIRED_MESSAGE = "dz workflow: the ADR-005 templates are retired (they emitted a pre-meta format the runtime cannot run) \u2014 use dz workflow init/render";
/** Empty by design: no legacy template names remain. */
export declare const WORKFLOW_NAMES: string[];
//# sourceMappingURL=workflows.d.ts.map