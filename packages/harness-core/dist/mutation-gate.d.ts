/** One named safety property: mutate the protection, run the suite, require red. */
export interface MutationRegistryEntry {
    /** stable kebab-case id, unique within the registry. */
    readonly id: string;
    /** the sentence the code claims — named so a failure report can say WHAT is undefended. */
    readonly property: string;
    /** package-relative path of the file carrying the protection. */
    readonly file: string;
    /** exact text surgery: `find` must occur EXACTLY ONCE in the file (rule 1). */
    readonly mutation: {
        readonly find: string;
        readonly replace: string;
    };
    /** how many tests MUST go red under the mutation (default 1). */
    readonly minFailing?: number;
    /** how many actually did at the time of writing — makes a coverage DROP visible. */
    readonly observed?: number;
    /**
     * the MOST tests that may go red before the redness stops being attributable to THIS protection
     * (route-c guard — see effectiveMaxFailing for the default when absent). A structural blow-up
     * (broken export surface, dead import) reddens the whole suite; that is not discrimination.
     */
    readonly maxFailing?: number;
}
export interface MutationRegistry {
    /** optional suite command override for the whole registry (default `npm test`). */
    readonly testCommand?: string;
    /** opt-in proof that the suite harness reached its clean completion path. */
    readonly requireCompletionReceipt?: boolean;
    readonly entries: readonly MutationRegistryEntry[];
}
export type MutationVerdict = 'PROVEN' | 'UNDEFENDED' | 'RECEIPT_MISMATCH' | 'NOT_APPLIED' | 'BELOW_MIN' | 'MUTATION_UNPARSEABLE' | 'MUTATION_LOAD_FATAL' | 'OVER_FAILING' | 'INCONCLUSIVE';
export interface MutationObservation {
    readonly entry: MutationRegistryEntry;
    /** how many times `find` occurred in the file text (1 = applied). Missing file ⇒ 0. */
    readonly occurrences: number;
    /** the suite's exit code under the mutation; null when it produced none (killed / spawn error). */
    readonly exitCode: number | null;
    /** best-effort failing-test count parsed from runner output; null when unparseable. */
    readonly failingCount: number | null;
    /**
     * set (to the parser's message) when the MUTATED file failed to parse as its own language —
     * the executor checks BEFORE running the suite. Absent/undefined = parsed fine or not checked.
     */
    readonly parseError?: string;
    /**
     * set (to the classifier's evidence line) when THE SUITE RUN's own output reports a test FILE
     * failing to LOAD under the mutation — the route-a′ guard, round-6 rework. The signal comes from
     * the SAME run that produced the failing count (no isolated child, no environment mismatch — the
     * round-5 isolated `import()` had three measured false-PASS routes precisely because an isolated
     * import is a DIFFERENT environment than the test runner). A file-load failure means the redness
     * is STRUCTURAL — the mutation broke the module, so the count is not attributable to the
     * protection. Absent/undefined = the red output showed test ASSERTION failures (behavioural —
     * redness IS the deleted protection), or the run was green / never ran.
     */
    readonly fileLoadFailure?: string;
    /**
     * set (to an explanation) when the suite went RED but the output SHAPE matched no runner the
     * classifier knows (`classifyRunFailure` returned 'unrecognised') — a runner-coverage gap of
     * THIS TOOL, not a property of the module under test. The verdict is INCONCLUSIVE (a loud
     * failure), NEVER PROVEN: redness that cannot be attributed proves nothing.
     */
    readonly outputUnrecognised?: string;
    /**
     * set to the marker text when the suite harness declares its own execution-receipt contract
     * violated, or to the missing-receipt detail for an opted-in registry. Either condition
     * invalidates both green and count-based readings of the same run.
     */
    readonly receiptMismatch?: string;
    /** named reason from spawnSync when no exit code exists (timeout, signal, maxBuffer, spawn). */
    readonly runFailureReason?: string;
    /**
     * exit code of the suite re-run on the RESTORED tree after this entry (the attribution check
     * for flaky neighbours). undefined = not run; 0 = reproducibly green; any other value (or null)
     * = the "green" baseline is not reproducible, so the red under mutation is not attributable.
     */
    readonly rebaselineExitCode?: number | null;
    /** named no-exit reason for the restored-tree attribution run, when it produced none. */
    readonly rebaselineFailureReason?: string;
    /** parsed failing files from a RED restored-tree run; absent when no red rebaseline ran. */
    readonly rebaselineAttribution?: BaselineAttribution;
    /** bounded log proving an internal runner failure received at most one retry. */
    readonly internalAttemptLog?: string;
}
export interface MutationEntryResult {
    readonly id: string;
    readonly property: string;
    readonly file: string;
    readonly applied: boolean;
    readonly occurrences: number;
    readonly exitCode: number | null;
    readonly failingCount: number | null;
    readonly verdict: MutationVerdict;
    /** true when the count is reliable, non-zero, and LOWER than `observed` — the early warning that
     *  arrives before the property breaks. A WARNING, not a failure — see classifyMutationOutcome. */
    readonly drop: boolean;
    /**
     * QE round-7 honesty (loop-designer, cross-family reviewer): a coverage DROP can only ever be
     * DETECTED for an entry that carries an `observed` anchor — `drop` is computed as
     * `failingCount < observed`, so an entry with only a `minFailing` threshold is structurally
     * incapable of reporting one. `"0 coverage drops"` therefore means *"0 drops among the entries
     * where a drop is comparable at all"*, and the report must say which denominator that is instead
     * of letting the reader assume it covers every entry.
     */
    readonly dropComparable: boolean;
    /** human sentence for the report line — names the undefended property on a green suite. */
    readonly detail: string;
}
export type InternalRunnerAttemptOutcome = 'completed' | 'runner-internal-error';
export interface InternalRunnerAttempt {
    readonly attempt: 1 | 2;
    readonly outcome: InternalRunnerAttemptOutcome;
    readonly detail: string;
}
export interface InternalRunnerRetryResult<T> {
    /** The completed attempt's value. null means both attempts threw internally. */
    readonly value: T | null;
    readonly attempts: readonly InternalRunnerAttempt[];
    /** Closed by construction: a runner receives either zero retries or exactly one. */
    readonly internalRetries: 0 | 1;
    /** Named reason consumed by the existing no-exit → INCONCLUSIVE arm. */
    readonly failureReason?: `runner-internal-error: ${string}`;
}
/**
 * Run one internal runner invocation. Only a THROWN internal error is retried; normal green/red
 * observations and ordinary no-exit observations are values and therefore never retried.
 */
export declare function runWithOneInternalRetry<T>(runner: () => T): InternalRunnerRetryResult<T>;
export interface ParsedRegistry {
    readonly registry: MutationRegistry | null;
    /** every defect found — ANY error makes the registry unusable (a half-valid registry that runs
     *  its valid half reports a partial scan as a full one). */
    readonly errors: readonly string[];
}
/** Parse + validate a registry JSON text. Accepts a bare array or `{testCommand?, requireCompletionReceipt?, entries}`. */
export declare function parseMutationRegistry(text: string): ParsedRegistry;
export interface AppliedMutation {
    readonly ok: boolean;
    readonly occurrences: number;
    /** the mutated text when ok. */
    readonly text?: string;
}
/** Count NON-OVERLAPPING occurrences and apply only when the count is exactly 1. */
export declare function applyMutationToText(source: string, find: string, replace: string): AppliedMutation;
/**
 * The route-c upper bound: the most failing tests a mutation may cause and still be read as
 * BEHAVIOURAL redness attributable to this one protection. Explicit `maxFailing` wins; otherwise
 * `max(anchor*5, anchor+10)` where anchor = `observed` (the measured blast radius) falling back to
 * `minFailing`. k=5 / N=10 justification, MEASURED on the live data: every health-advisor registry
 * entry has observed 1–4 ⇒ bounds 11–20, so legitimate growth (more tests covering the property —
 * 5× proportional, or +10 absolute so tiny `observed` is not strangled) still passes, while the
 * two measured structural blow-ups (route a: whole 484-test suite dead on a parse error; route c:
 * 200+ failing vs observed 1) exceed the bound by an order of magnitude. NEVER unbounded — an
 * entry with no `observed` anchors on its own minFailing contract.
 */
export declare function effectiveMaxFailing(entry: MutationRegistryEntry): number;
/**
 * Parse a failing-test count from runner output. Order of preference:
 *   1. node --test / TAP summary `# fail N` (authoritative for TAP);
 *   2. vitest/jest summary `Tests  N failed` / `N failed`;
 *   3. top-level (unindented) `not ok` line count.
 * Returns null when nothing parses — the verdict then rests on the exit code ALONE, by design:
 * count parsing failure must never flip red/green (SPEC design decision).
 */
export declare function countFailingTests(rawOutput: string): number | null;
/** Return the first suite-harness receipt error at column 0, with SGR removed. */
export declare function detectSuiteReceiptMismatch(rawOutput: string): string | undefined;
/** Return the first suite-harness clean-completion receipt at column 0, with SGR removed. */
export declare function detectSuiteCompletionReceipt(rawOutput: string): {
    lanes: number;
    names: number;
} | undefined;
export type RunnerKind = 'node-test' | 'vitest' | 'unknown';
/**
 * Which runner's output shape is this? Extracted VERBATIM from `classifyRunFailure`'s two shape
 * checks so the discrimination gate's evidence model can identify the runner of a GREEN run too —
 * `classifyRunFailure` classifies RED runs only (its green branch returns a red-worded
 * 'unrecognised'), so it cannot answer "which runner produced this pass?".
 *
 * ONE regex family per package (the ADR-001 driver): every runner-shape regex in harness-core
 * lives here, and discrimination-gate.ts consumes this function instead of growing a second copy.
 * Detection is from the OUTPUT SHAPE, not the command (an `npm test` alias hides the runner):
 * node --test needs the TAP header AND node's `# duration_ms` trailer (tape emits TAP + `# fail`
 * but not `# duration_ms`); vitest needs its `RUN v<semver>` banner or `Test Files` summary line.
 * Anything else is 'unknown' — the honest, narrowed gap, never a silent trust mint.
 */
export declare function detectRunnerKind(rawOutput: string): RunnerKind;
export interface RunFailureClassification {
    /** which runner's output shape was recognised. */
    readonly runner: RunnerKind;
    /**
     * 'file-load'    — the run reported a test FILE failing to load: STRUCTURAL, the mutation broke
     *                  the module and the failing count is not attributable to the protection;
     * 'assertions'   — the red is test ASSERTION failures inside running tests: BEHAVIOURAL, the
     *                  redness IS the deleted protection;
     * 'unrecognised' — the output shape matched no known runner (or a known runner's red output
     *                  carried no classifiable failure): a runner-coverage gap of this tool — the
     *                  verdict must be INCONCLUSIVE, never PROVEN.
     */
    readonly kind: 'file-load' | 'assertions' | 'unrecognised';
    /** for 'file-load': the evidence line; for 'unrecognised': what could not be classified. */
    readonly evidence?: string;
}
/**
 * Classify a RED suite run's output: did a test FILE fail to LOAD (structural) or did test
 * ASSERTIONS fail (behavioural)? This is the round-6 replacement for the isolated-child
 * `import()` load-check, whose three false-PASS routes were ALL artifacts of the isolated import
 * being a DIFFERENT environment than the test runner (env-dependent module goals, unsettled
 * top-level await draining a child's event loop, non-deterministic load aborts dodging a second
 * spawn). The correct signal comes from the SAME run that produced the failing count — no second
 * child, no environment mismatch, nothing to disagree with itself.
 *
 * Runner shapes, both MEASURED (node v22.22.0, vitest 3.2.4 — reproducers in
 * harness-cli/test/mutation-gate-cli.test.ts and this file's unit tests):
 *
 * node --test (flat TAP): every failure is a column-0 `not ok N - <name>` followed by an indented
 * YAML diagnostic block. A test FILE that dies (throw at load, `process.exit` at import, unsettled
 * top-level await ⇒ exit 13, dead require) is reported as a file-named test point whose block
 * carries an `exitCode:` field (and `signal:` when killed) — `failureType: 'testCodeFailure'`,
 * `error: 'test failed'`, `code: 'ERR_TEST_FAILURE'`. An ASSERTION failure — and equally a plain
 * throw INSIDE a running test — NEVER carries `exitCode:`/`signal:`: those fields describe the
 * spawned per-file process, which only appears when the file itself died. That asymmetry is the
 * discriminator, and it is exactly the honest-mutation boundary: delete a guard clause and the
 * file loads, assertions fire, no `exitCode:` field ⇒ behavioural.
 *
 * vitest (`vitest run`): a load/transform/collection error is reported under a `Failed Suites N`
 * section as `FAIL <path> [ <path> ]` (the bracketed suite name repeats the path) with the error
 * where a test name would be, and the summary counts it under `Test Files N failed` while `Tests`
 * shows `no tests` for that file. Assertion failures appear under `Failed Tests N` as
 * `FAIL <path> > <test name>` with `Tests N failed` in the summary. (An unsettled top-level await
 * HANGS vitest rather than failing the file — the suite times out, exitCode null, INCONCLUSIVE —
 * measured, and honestly out of scope for this classifier.)
 *
 * Runner detection is from the OUTPUT SHAPE, not the command (a `npm test` alias hides the
 * runner): node --test requires the TAP header AND node's `# duration_ms` trailer (tape emits TAP
 * + `# fail` but not `# duration_ms`); vitest requires its `RUN v<semver>` banner or `Test Files`
 * summary line. Anything else — jest, mocha, tape, a bare script — is 'unknown'/'unrecognised':
 * the honest, narrowed gap. It is about THIS TOOL's runner coverage, fails LOUD (INCONCLUSIVE),
 * and never silently passes on output it cannot read.
 */
export declare function classifyRunFailure(rawOutput: string): RunFailureClassification;
export type BaselineAttributionSource = 'node-test' | 'vitest' | 'unparseable';
export interface BaselineAttribution {
    readonly parsedFrom: BaselineAttributionSource;
    /** Package-relative failing paths, in first-seen order. */
    readonly failingFiles: readonly string[];
    /** Failing paths that match a registry file exactly (or by package-relative suffix). */
    readonly covered: readonly string[];
    /** Failing paths with no matching registry file. */
    readonly extraneous: readonly string[];
}
/** Parse the failing FILE paths already exposed by supported node --test and vitest shapes. */
export declare function attributeBaselineRedness(rawOutput: string, registryFiles: readonly string[]): BaselineAttribution;
export type BaselineFailureReason = 'runner-internal-error' | 'runner-no-exit' | 'extraneous-red-in-allowlist' | 'baseline-red-covered-files' | 'baseline-red-files-unparseable';
export interface BaselineResult {
    readonly ok: boolean;
    readonly detail: string;
    readonly reason?: BaselineFailureReason;
}
/**
 * A RED baseline in the scratch copy is a SETUP error, never a mutation result: every subsequent
 * "red under mutation" would be noise, and every "green" a lie about an unrunnable copy.
 */
export declare function classifyBaseline(exitCode: number | null, runFailureReason?: string, attribution?: BaselineAttribution): BaselineResult;
export declare function classifyMutationOutcome(obs: MutationObservation): MutationEntryResult;
/** Exit contract: 0 all proven · 1 any entry failed (or red baseline) · (2 = usage/setup, CLI-side). */
export declare function mutationGateExitCode(results: readonly MutationEntryResult[], baselineOk: boolean): number;
export interface MutationGateSummary {
    readonly total: number;
    readonly proven: number;
    readonly undefended: number;
    readonly receiptMismatch: number;
    readonly notApplied: number;
    readonly belowMin: number;
    readonly unparseable: number;
    readonly loadFatal: number;
    readonly overFailing: number;
    readonly inconclusive: number;
    readonly drops: number;
    /** how many entries a drop is COMPARABLE for (they carry an `observed` anchor) — the honest
     *  denominator of `drops`. `drops: 0` over `dropComparable: 23` of `total: 62` says what it can
     *  and cannot see; a bare "0 coverage drops" over-reads as "all 62 checked" (QE round-7). */
    readonly dropComparable: number;
}
export declare function summarizeMutationResults(results: readonly MutationEntryResult[]): MutationGateSummary;
export declare function renderMutationReport(results: readonly MutationEntryResult[], baseline: BaselineResult, packageDir: string): string;
//# sourceMappingURL=mutation-gate.d.ts.map