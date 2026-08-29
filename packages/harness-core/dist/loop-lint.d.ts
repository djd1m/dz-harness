/**
 * `dz workflow-lint` — the layer-1 deterministic gate over Workflow loop scripts (FR-3, ADR-001).
 *
 * `lint(scriptText, {plan?, blobRegistry?, mode?}) → LintRun`. PURE — no fs (the CLI reads files).
 * Three verdicts per rule AND overall: `pass` / `fail` / `inconclusive`, and **inconclusive is
 * never a pass** (INV-13; the CLI exits 0/1/3 mirroring the consult-gate convention).
 *
 * The plan-anchored vs script-only split (architecture §5.3 — the honest scope): the hard
 * structural rules (`barrier-postdominates`, `budget-before-spawn`, `retry-idempotent`,
 * `resume-fingerprint`, `fanout-bounded` at FAIL strength, `pause-wired`, `dispatch-by-deliverable`)
 * are decidable on the PLAN graph (via `toLintProjection` — never the raw plan, AM-3). For a
 * plan-less script a full path-sensitive CFG over arbitrary JS is not honestly promisable; those
 * rules report `inconclusive` with reason `no-plan-binding` — never a silent pass.
 * Modes: `require-plan` (generated-loop CI) turns every inconclusive into a FAIL;
 * `legacy` (the two existing workflows) accepts the enumerated warn/inconclusive rows as-is.
 *
 * `barrier-postdominates` is real CFG POST-dominator analysis over the projection's synthetic
 * entry/exit (plain dominance is explicitly insufficient — Codex 04/Q1): the join must post-
 * dominate the FORK it closes, the join policy must come from the closed set, and every ACTIVATED
 * branch is an effective prerequisite (declared-but-never-dispatched branches are not required;
 * dispatched branches are never skippable).
 */
import { type LoopPlan, type LintProjection } from './loop-plan.js';
import type { LoopBlob } from './loop-blobs.generated.js';
export type LintVerdict = 'pass' | 'fail' | 'inconclusive';
export type LintSeverity = 'fail' | 'warn' | 'inconclusive' | 'pass';
export type LintMode = 'default' | 'require-plan' | 'legacy';
export interface LintFinding {
    rule: string;
    severity: LintSeverity;
    message: string;
    /** Anchored code pattern (never a line number — line-numbered assertions rot). */
    anchor?: string;
}
export interface LintRun {
    verdict: LintVerdict;
    mode: LintMode;
    findings: LintFinding[];
    /** Per-rule verdict map (18 rules — every rule reports, none silently skipped). */
    rules: Record<string, LintSeverity>;
}
export declare const LINT_RULES: readonly ["meta-complete", "phase-parity", "sandbox-bans", "shq-hygiene", "agent-labelled", "no-partial-checkpoint", "plan-binding", "blob-hash", "fanout-bounded", "barrier-postdominates", "budget-before-spawn", "retry-idempotent", "resume-fingerprint", "pause-wired", "dispatch-by-deliverable", "no-agent-outside-runstep", "tool-perimeter-declared", "size-budget"];
export type LintRuleId = (typeof LINT_RULES)[number];
/** size-budget (WARN ONLY — FR-3.10, the fa-improvements reaffirmed lesson: a blocking wc-l cap is
 * theater). Threshold chosen so both battle-grown legacy loops surface the advisory. */
export declare const SIZE_BUDGET_WARN_LINES = 350;
/** Classic iterative post-dominator computation over the projection CFG (exit post-dominates all). */
export declare function postDominators(projection: LintProjection): Map<string, Set<string>>;
/** Plain (forward) dominators — kept ONLY as the mutation seam for AM-1's weakening entry
 * (`barrier-postdominates-weakened-to-dominance`): swapping the call site to this function is the
 * registered mutation, and the discrimination seed must then go green (proving the gate measures
 * the analysis, not the rule's registration). Never called in production. */
export declare function dominators(projection: LintProjection): Map<string, Set<string>>;
/** The `<server>:<capability>` grammar a declared perimeter entry must match (ADR-002 §1). Two or
 * more colon-separated lowercase segments — a bare `gitlab` names a server with no capability and
 * is exactly the shape that reads as "everything on that server". */
export declare const TOOL_PERIMETER_ENTRY_RE: RegExp;
export interface LintOptions {
    plan?: LoopPlan | null;
    planDigestValue?: string | null;
    blobRegistry?: Record<string, LoopBlob> | null;
    mode?: LintMode;
}
export declare function lint(scriptText: string, opts?: LintOptions): LintRun;
/** CLI exit-code convention (mirrors consult-gate: 0 pass / 1 fail / 3 inconclusive). */
export declare function lintExitCode(run: LintRun): number;
//# sourceMappingURL=loop-lint.d.ts.map