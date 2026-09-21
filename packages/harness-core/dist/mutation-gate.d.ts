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
    /** test files that discriminate this entry; a named registry self-check must remain runnable. */
    readonly tests?: readonly string[];
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
/** Registry integrity tests add the same unrelated failure to every ordinary mutant run. */
export declare const REGISTRY_SELFCHECK_TESTS: readonly ["test/mutation-registry-freshness.test.ts", "test/mutation-registry-anchors.test.ts"];
export interface MutationTestCommand {
    readonly testCommand: string;
    readonly excluded: readonly string[];
}
/** Build the mutant-only command; baseline commands remain unchanged in the executor. */
export declare function buildMutationTestCommand(testCommand: string, entry: Pick<MutationRegistryEntry, 'tests'>): MutationTestCommand;
/**
 * mutation-gate-inject-tokens FR-1..FR-3 (D1-D4b, fix-round 1 F1-F3): inject `--maxWorkers=<n>`
 * into EVERY `vitest run` segment of a (possibly compound) test command, token-scoped — not the
 * whole-command substring append that used to (a) cap only the FIRST `vitest run` in `a && b` (D1),
 * (b) let an existing-flag SUBSTRING check be fooled by an unrelated `--maxWorkers` living inside a
 * quoted argument or another command's own flags (D2, D3), and (c) stack a second `--maxWorkers` on
 * top of a user's own `--max-workers=<n>` (D4) instead of deferring to it.
 *
 * Segmentation splits on `&&`/`||`/`;`/`|` that are OUTSIDE single/double quotes, POSIX-escape aware
 * (fix-round 1, F1 — the round-1 Codex review's HIGH finding): outside single quotes a `\` makes the
 * NEXT character literal (so `\"` cannot open/close a double-quoted span, and `\&` cannot be mistaken
 * for an operator); inside double quotes a `\` escapes at least `\"` and `\\` (so `-t "a \" && b"` stays
 * ONE segment — the escaped quote does not close the string, so the `&&` inside it is never treated as
 * a real terminator); inside single quotes nothing is special, matching POSIX. This is the fix for the
 * exploit the verdict named: `npx vitest run -t "a \" && b" --maxWorkers=1` used to be mis-split into
 * two pseudo-segments (the existing flag ending up in the "wrong" one), stacking a second flag.
 *
 * Within each segment, `vitest run` is recognised only in COMMAND POSITION (fix-round 1, F2 — the
 * round-1 Codex review's other HIGH finding): the first word token, after skipping any leading bare
 * `NAME=value` assignments and at most one runner-prefix chain (`npx`, `pnpm exec`, `pnpm dlx`, `yarn`,
 * `bunx`, or `env`/`cross-env` followed by more assignments), must have a BASENAME of `vitest`,
 * `vitest.cmd`, `vitest.mjs` or `vitest.js` (a full path like `node_modules/.bin/vitest` counts — only
 * the basename is compared), immediately followed by the literal token `run`. `echo vitest run` and
 * `node wrapper.js vitest run` are therefore NOT vitest commands (`echo`/`node` is not an allowed
 * prefix and is not itself a vitest basename) — the old scan matched `vitest`+`run` ANYWHERE in the
 * segment and would have mutated both.
 *
 * An existing ceiling flag is detected per DECODED token (fix-round 1, F3 — MEDIUM finding: the old
 * substring/regex checks compared RAW tokens, so a quoted `"--maxWorkers=1"` was invisible, and the
 * regex additionally accepted unclaimed spellings like `--maxworkers`/`--max-Workers`) via
 * `/^--(?:maxWorkers|max-workers)(?:=.*)?$/` — matches exactly `--maxWorkers=1`, `--maxWorkers 1` (the
 * bare flag token, value in the next token), `--max-workers=1`, `--max-workers 1`; does NOT match
 * `--maxWorkersFoo=9` (D3) or `--maxworkers`/`--max-Workers` (not the two claimed spellings). The scan
 * stops at a standalone `--` token (F3): everything after it is positional per POSIX, so a `--maxWorkers`
 * living there is a positional argument to vitest's OWN test-name filter, not a flag naming the ceiling.
 * When a real flag is present, the segment is left untouched (the user's explicit choice wins, D4);
 * when absent, ` --maxWorkers=<n>` is inserted immediately after the `run` token's RAW source span
 * (never the decoded one — insertion always preserves the original quoting of everything else).
 */
export interface InjectVitestWorkerCeilingResult {
    /** the command with the ceiling injected into every eligible vitest segment. */
    readonly cmd: string;
    /** how many segments were recognised as `vitest run` (0 for a non-vitest command). */
    readonly vitestSegments: number;
    /** how many of those segments actually got `--maxWorkers=<n>` inserted (excludes ones that already named it). */
    readonly injected: number;
    /** segments where `vitest run` was found only by the LOOSE token-pair fallback (command position
     * unrecognised) — the CLI reports these so an odd wrapper shape is visible, not silent. */
    readonly looseSegments: number;
}
export declare function injectVitestWorkerCeiling(testCmd: string, maxWorkers: number): InjectVitestWorkerCeilingResult;
export interface MutationRegistry {
    /** optional suite command override for the whole registry (default `npm test`). */
    readonly testCommand?: string;
    /** opt-in proof that the suite harness reached its clean completion path. */
    readonly requireCompletionReceipt?: boolean;
    /**
     * optional per-registry suite-run ceiling in milliseconds (mutation-gate-timeout-verdict FR-3):
     * a package whose real baseline runs longer than the executor's 300000ms default (e.g. this
     * repo's core package, MEASURED ≈5-8 min) declares its own floor here so `dz mutation-gate` with
     * no `--timeout` flag still succeeds — precedence is flag > this field > the 300000ms default.
     */
    readonly timeoutMs?: number;
    /**
     * optional per-registry vitest worker ceiling (mutation-gate-baseline-honesty FR-2): baseline and
     * mutant runs spawn the package's FULL `testCommand` at vitest's default worker count (= cpu
     * cores), and under embedding-daemon tests (0.7-3.5 GB/process) this repo's core package measured
     * load 62-358 and 0.4-1.8 GB free on an 8-core/16GB box — three full runs died overnight
     * (0bb74d66). The same suite with `--maxWorkers=2` passed (6909/6909). Precedence is the
     * `--max-workers` flag > this field > `min(4, max(1, floor(cpus/2)))`.
     */
    readonly maxWorkers?: number;
    readonly entries: readonly MutationRegistryEntry[];
}
export type MutationVerdict = 'PROVEN' | 'ENTRY_INVALID' | 'COVERAGE_GAP' | 'UNDEFENDED' | 'RECEIPT_MISMATCH' | 'NOT_APPLIED' | 'BELOW_MIN' | 'MUTATION_UNPARSEABLE' | 'MUTATION_LOAD_FATAL' | 'OVER_FAILING' | 'INCONCLUSIVE';
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
    /** bounded stdout+stderr tail supplied by the executor for a RED restored-tree run. */
    readonly rebaselineOutputTail?: string;
    /**
     * path to the FULL stdout+stderr the executor saved for a RED baseline/rebaseline run (gate
     * stability, 2026-09-12) — the bounded tail above is a diagnostic teaser; a multi-entry gate run
     * that goes INCONCLUSIVE/OVER_FAILING needs the whole log to attribute the redness, and the tail
     * alone was measured to hand back three lines of an unrelated neighbour's stderr. Absent when the
     * run was green (nothing written) or the executor could not write the file.
     */
    readonly outputPath?: string;
    /**
     * set (to the caught error's message) when the executor tried and FAILED to save the full RED
     * output — EACCES/ENOSPC/EROFS/ENOTDIR and the like (fix-round-1, HIGH/MEDIUM review findings,
     * 2026-09-12). Mutually exclusive with `outputPath`: a red run either saved (path) or did not
     * (error), never both, and a green run has neither. Absent/undefined = not attempted (green) or
     * the save succeeded.
     */
    readonly outputError?: string;
    /** bounded log proving an internal runner failure received at most one retry. */
    readonly internalAttemptLog?: string;
    /**
     * Whether any suite the entry's `testCommand` selects NAMES the mutated module — see
     * {@link suiteSelectionNamesModule}. Only read on the UNDEFENDED path, and only to add a hint:
     * `false` says "check the command before the tests", never "the property is fine".
     */
    readonly suiteNamesModule?: boolean | 'unknown';
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
    /** full bounded restored-tree output tail for machine-readable reports. */
    readonly rebaselineOutputTail?: string;
    /** path to the full saved output for a RED baseline/rebaseline run; see MutationObservation. */
    readonly outputPath?: string;
    /** the save FAILED for a RED run; see MutationObservation.outputError. Mutually exclusive with `outputPath`. */
    readonly outputError?: string;
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
    /** Per-entry outcomes that need no mutation run: malformed entries and declared gaps. */
    readonly entryResults: readonly MutationEntryResult[];
    /** Every defect found. Envelope/JSON defects make registry null; entry defects are also
     *  represented as ENTRY_INVALID while valid neighbours remain executable. */
    readonly errors: readonly string[];
}
/** Parse + validate a registry JSON text. Accepts a bare array or `{testCommand?, requireCompletionReceipt?, entries}`. */
export declare function parseMutationRegistry(text: string): ParsedRegistry;
/** Entry ids present in `current` but absent from `base` (by id, not by content). A `null` base
 *  means the registry did not exist at the reference point — every current entry counts as added. */
export declare function registryEntriesAddedSince(base: MutationRegistry | null, current: MutationRegistry): string[];
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
    readonly kind: 'file-load' | 'assertions' | 'runner-infrastructure' | 'unrecognised';
    /** Closed reason set for an identified runner failure with zero failing tests. */
    readonly reason?: 'worker-rpc-timeout';
    /** Evidence of the load/infrastructure failure, or what could not be classified. */
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
    /** Identified infrastructure failure from the same output; absent for all existing outcomes. */
    readonly infrastructureFailure?: RunFailureClassification;
    /** Package-relative failing paths, in first-seen order. */
    readonly failingFiles: readonly string[];
    /** Failing paths that match a registry file exactly (or by package-relative suffix). */
    readonly covered: readonly string[];
    /** Failing paths with no matching registry file. */
    readonly extraneous: readonly string[];
}
/** Parse the failing FILE paths already exposed by supported node --test and vitest shapes. */
export declare function attributeBaselineRedness(rawOutput: string, registryFiles: readonly string[]): BaselineAttribution;
export type BaselineFailureReason = 'worker-rpc-timeout' | 'runner-internal-error' | 'runner-no-exit' | 'extraneous-red-in-allowlist' | 'baseline-red-covered-files' | 'baseline-red-files-unparseable';
export interface BaselineResult {
    readonly ok: boolean;
    readonly detail: string;
    readonly reason?: BaselineFailureReason;
}
/**
 * A RED baseline in the scratch copy is a SETUP error, never a mutation result: every subsequent
 * "red under mutation" would be noise, and every "green" a lie about an unrunnable copy.
 */
export declare function classifyBaseline(exitCode: number | null, runFailureReason?: string, attribution?: BaselineAttribution, outputPath?: string, outputError?: string): BaselineResult;
/**
 * Suite paths a registry `testCommand` selects, in order. Tokens that are not suite files (the
 * runner, its flags) are ignored — the command is a shell line, not a schema, so this reads the
 * shape it actually has rather than assuming one.
 */
export declare function parseSuitePaths(testCommand: string): readonly string[];
/**
 * Does ANY suite the command selects even name the mutated module?
 *
 * Why this exists: `UNDEFENDED` reads as "this property has no test", and MEASURED 2026-09-04 that
 * reading was wrong twice in one run — both tests existed; the registry's `testCommand` simply did
 * not select the suites that import them (backlog 1f4e4f66). The author filed a finding about two
 * "unprotected properties" before checking the instrument, which is the failure this hint prevents.
 *
 * Deliberately a HINT, never a verdict: it matches the module's STEM in each suite's text, so a
 * suite that reaches the module through a transitive import is invisible to it. `'unknown'` when no
 * suite could be read — absence of evidence is not evidence, and a hint that guesses is worse than
 * no hint.
 */
export declare function suiteSelectionNamesModule(input: {
    readonly file: string;
    readonly suitePaths: readonly string[];
    readonly readSuite: (path: string) => string | null;
}): boolean | 'unknown';
export declare function classifyMutationOutcome(obs: MutationObservation): MutationEntryResult;
/** Exit contract: 0 all runnable entries proven · 1 a runnable entry failed (or red baseline) ·
 *  2 no mutation-eligible entry exists, so the registry/selection is unusable as a run. */
export declare function mutationGateExitCode(results: readonly MutationEntryResult[], baselineOk: boolean): number;
export interface MutationGateSummary {
    readonly total: number;
    readonly proven: number;
    readonly entryInvalid: number;
    readonly coverageGaps: number;
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
/** Everything the CLI knows that this pure module does not: when, in which package, and under
 *  which run. `runId` is honest-absent (`null`) when the caller has none to offer — never guessed. */
export interface MutationVerdictMeta {
    readonly ts: string;
    readonly package: string;
    readonly runId: string | null;
}
/** One durable line — append-only, one per classified registry entry. `observed` is the
 *  registry's OWN anchor (copied, never recomputed) so a reader can see the historical coverage
 *  claim next to the fresh verdict without re-opening the registry. */
export interface MutationVerdictRow {
    readonly ts: string;
    readonly package: string;
    readonly entryId: string;
    readonly verdict: MutationVerdict;
    readonly failingCount: number | null;
    readonly observed: number | null;
    readonly drop: boolean;
    readonly dropComparable: boolean;
    readonly runId: string | null;
}
/**
 * Pure: payload in, row out — no filesystem (NFR-2; the CLI owns the append). `entry` is `null`
 * for a result that never resolved to a valid registry entry (`ENTRY_INVALID` / `COVERAGE_GAP` —
 * `parseMutationRegistry` excludes those from `registry.entries` by construction, so the CALLER
 * cannot always hand one in) — `observed` then stays `null`, honestly, rather than the caller
 * inventing a fallback entry object just to satisfy this signature.
 */
export declare function mutationVerdictRow(entry: MutationRegistryEntry | null, result: MutationEntryResult, meta: MutationVerdictMeta): MutationVerdictRow;
export declare function renderMutationReport(results: readonly MutationEntryResult[], baseline: BaselineResult, packageDir: string): string;
//# sourceMappingURL=mutation-gate.d.ts.map