/** The outcome of running one property test in the base (pre-feature) worktree. */
export type BaseOutcome = 'pass' | 'fail' | 'error' | 'absent';
/** The outcome of the TIP control run — the same test against the LIVE tree (feature present). */
export type TipOutcome = 'pass' | 'fail' | 'error';
/** Per-property verdict after classification. Seven values (ADR-001) — the pre-epoch four collapsed
 *  absence, both-rev breakage, and a tip-red test into `DISCRIMINATES_VIA_ERROR`'s near-pass. */
export type DiscriminationVerdict = 'DISCRIMINATES' | 'DISCRIMINATES_VIA_ERROR' | 'NON_DISCRIMINATING' | 'CANNOT_ISOLATE' | 'TEST_FILE_ABSENT' | 'LOAD_ERROR_AT_BOTH_REVS' | 'FAILS_AT_TIP';
/** Runner identity for the evidence model. ADR-001's spelling is normative for the PUBLISHED type;
 *  mutation-gate's internal `RunnerKind` says `'unknown'` and is mapped here (H2) rather than renamed —
 *  mutation-gate stays untouched beyond the `detectRunnerKind` extraction. */
export type EvidenceRunner = 'vitest' | 'node-test' | 'unrecognised';
/** How the run went, as read off the output shape (mutation-gate's `RunFailureClassification.kind`
 *  plus `'none'` for a green run — `classifyRunFailure` classifies RED runs only, H3). */
export type EvidenceFailureKind = 'assertions' | 'file-load' | 'none' | 'unrecognised';
/** RECOGNIZED PROCESS-OUTPUT EVIDENCE for one run. Present in TYPE optionally (old callers still
 *  compile) but required in EFFECT for every trust verdict — that asymmetry IS the ADR-001 fix. */
export interface ExecutionEvidence {
    /** null = timeout / spawn failure. No evidence bar accepts null ⇒ reason 'timeout'. */
    readonly exitCode: number | null;
    readonly runner: EvidenceRunner;
    readonly failureKind: EvidenceFailureKind;
    /** parsed from the runner's own summary; null = unparseable (never assumed to be ≥ 1). */
    readonly testsExecuted: number | null;
    /** target identity: the named test file appears in the recognized output. */
    readonly targetSeen: boolean;
    /** the classifier's evidence string when it has one (quotable in 08_qe_report.md, K7). */
    readonly evidenceLine?: string;
}
/** Why a row degraded to CANNOT_ISOLATE. Typed so the operator repair is machine-derivable — the
 *  pre-epoch gate had one untyped bucket that read like "meh, no test", hiding a broken instrument. */
export type CannotIsolateReason = 'no-execution-evidence' | 'unrecognised-runner-output' | 'no-tests-executed' | 'inconsistent-evidence' | 'tip-control-missing' | 'tip-evidence-missing' | 'timeout';
export declare const DISCRIMINATION_VERDICTS: readonly DiscriminationVerdict[];
export declare const CANNOT_ISOLATE_REASONS: readonly CannotIsolateReason[];
/** A property test mapped from the ADR Confirmation `Required automated check`. */
export interface PropertyTestRef {
    /** repo-relative path to the NEW test file written for the feature. */
    readonly file: string;
    /** optional test-name filter (e.g. vitest `-t`) to run just the property case. */
    readonly name?: string;
}
/** One observed row fed back by the executor. */
export interface ClassifyResultRow {
    readonly file: string;
    readonly name?: string;
    readonly outcome: BaseOutcome;
    readonly evidence?: ExecutionEvidence;
    readonly tipOutcome?: TipOutcome;
    readonly tipEvidence?: ExecutionEvidence;
}
export interface DiscriminationPlanInput {
    /** the git ref of pre-feature HEAD — the "base" the property test must fail against. */
    readonly baseRef: string;
    /** property test(s) mapped from the ADR Confirmation. Empty ⇒ CANNOT_ISOLATE. */
    readonly propertyTests: readonly PropertyTestRef[];
    /** test-runner command template; sanitized. Default `npx vitest run`. */
    readonly runner?: string;
}
export interface DiscriminationPlan {
    /** false ⇒ nothing to run (no isolable test, or every ref rejected as unsafe). */
    readonly runnable: boolean;
    /** why not runnable, when `runnable` is false. */
    readonly reason?: string;
    /** the sanitized base ref actually used. */
    readonly baseRef: string;
    /** the accepted, sanitized targets. */
    readonly targets: readonly PropertyTestRef[];
    /** refs rejected by sanitation, with the reason — surfaced so a rejection is never silent. */
    readonly rejected: readonly {
        readonly file: string;
        readonly reason: string;
    }[];
    /**
     * Ordered shell steps the caller runs: add a detached worktree at baseRef, copy each NEW property test
     * file into it (they do not exist at base), run the runner over the targets, then remove the worktree.
     * `{{WORKTREE}}` is a placeholder the caller substitutes with a fresh temp dir path it owns — the engine
     * never invents a filesystem path. Commands use only sanitized tokens.
     */
    readonly commands: readonly string[];
}
export interface ClassifyInput {
    readonly propertyTests: readonly PropertyTestRef[];
    /** observed base outcome per target file (+optional name), same identity the plan used. */
    readonly results: readonly ClassifyResultRow[];
}
export interface PerTestVerdict {
    readonly file: string;
    readonly name?: string;
    readonly verdict: DiscriminationVerdict;
    /** present iff verdict === 'CANNOT_ISOLATE'. */
    readonly reason?: CannotIsolateReason;
}
export interface DiscriminationFinding {
    /** high for every unestablished/false-green state; info only for the VIA_ERROR inference.
     *  Never a hard blocker (dz's rule — a false gate kills trust; the owner decides). */
    readonly severity: 'high' | 'info';
    /** which non-clean verdict this finding reports. */
    readonly verdict: DiscriminationVerdict;
    /** the targets carrying that verdict. */
    readonly files: readonly string[];
    readonly title: string;
    /** names THIS verdict's operator action, so nothing rides on the primaryAction tie-break. */
    readonly detail: string;
}
/** The INSTRUMENT axis, orthogonal to the product axis a single scalar was forced to carry. */
export type MeasurementValid = boolean | 'partial';
/** The single most urgent operator repair, derived from the worst-ranked verdict present. */
export type PrimaryAction = 'none' | 'strengthen-test' | 'create-missing-test' | 'fix-runner-invocation' | 'fix-red-feature-test' | 'map-a-test';
export interface DiscriminationResult {
    readonly perTest: readonly PerTestVerdict[];
    /** compat scalar: worst-of via RANK. A total order can only answer "worst thing present" —
     *  everything it destroys travels in findings[] / measurementValid / primaryAction. */
    readonly aggregate: DiscriminationVerdict;
    /** @deprecated compat alias for ONE release — always `findings[0] ?? null` (worst first).
     *  Removal in the next minor is a recorded release obligation (ADR-002 Decision item 6). */
    readonly finding: DiscriminationFinding | null;
    /** one per distinct non-clean verdict present, worst-first. */
    readonly findings: readonly DiscriminationFinding[];
    readonly measurementValid: MeasurementValid;
    readonly primaryAction: PrimaryAction;
}
/**
 * Plan the discrimination check. Pure: validates inputs, drops unsafe refs (never silently), and emits the
 * ordered worktree commands. Returns `runnable:false` with a reason when there is nothing safe to run.
 */
export declare function planDiscriminationCheck(input: DiscriminationPlanInput): DiscriminationPlan;
/**
 * Classify ONE captured run into RECOGNIZED PROCESS-OUTPUT EVIDENCE. This is the function the
 * pre-epoch gate did not have: it answers "did a runner I can read demonstrably execute THIS file?"
 * instead of trusting the caller's outcome word. Three branches, exactly as ADR-001 specifies:
 *
 *   exitCode === null  the run timed out or never spawned — nothing is known. No bar accepts it,
 *                      so the row degrades to CANNOT_ISOLATE reason 'timeout' (same posture as
 *                      mutation-gate.ts:549 — a hung runner is a loud non-answer, never a pass).
 *   exitCode === 0     green: runner from the output SHAPE, failureKind 'none', testsExecuted from
 *                      the green summary.
 *   exitCode !== 0     red: delegate to classifyRunFailure — the SAME classifier that replaced
 *                      mutation-gate's ad-hoc regexes, so load-vs-assert is decided once per repo.
 *
 * `targetSeen` is a plain substring test over the SGR-stripped output: the bar is target IDENTITY
 * ("the output names the file we asked about"), not authorship. No resistance to an output-imitating
 * runner is claimed (ADR-001 Consequences, hole b) — the honest, narrowed contract.
 */
export declare function classifyExecutionEvidence(rawOutput: string, exitCode: number | null, targetFile: string): ExecutionEvidence;
/**
 * Classify observed base outcomes (+ evidence + the tip control) into per-test verdicts, the compat
 * aggregate, the full findings[] list, and the two orthogonal axes.
 *
 * Every constituent is evidence-gated FIRST; verdict combination is consulted only over EVIDENCED
 * constituents. Old callers that pass bare outcome values (no evidence, no tipOutcome) therefore
 * degrade to a loud CANNOT_ISOLATE — never to a near-pass and never to a false DISCRIMINATES. That
 * runtime behavior change for compiling callers is the ADR-002 headline, not a side effect.
 */
export declare function classifyDiscrimination(input: ClassifyInput): DiscriminationResult;
//# sourceMappingURL=discrimination-gate.d.ts.map