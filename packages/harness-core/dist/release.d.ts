/**
 * Verified-release engine (`dz release`, feature release-verified, ADR-001).
 *
 * VERIFY phase of the DETECT→VERIFY→ANALYZE→RELEASE conveyor (grounded in open-claude-code
 * ADR-003 nightly-verified-release): four HARD gates — tests / audit / syntax / smoke-boot —
 * planned and classified here as PURE functions over injected data, executed only by the CLI.
 *
 * Architecture contract (ADR-001, D1–D4):
 * - NO `node:child_process` anywhere in this file — the engine plans commands as DATA
 *   (`GateStep.cmd` strings a test can assert, `publishArgv` precedent) and classifies
 *   injected execution results. The CLI (`cmdRelease`) is the single executor.
 * - The only fs access lives in {@link collectPackageFacts} (readFileSync/readdirSync/statSync,
 *   `discoverPackages` precedent); everything downstream of the facts is pure.
 * - The existing publish gates (guard, claim-check, signature, provenance, files-whitelist)
 *   are NEVER duplicated here: a green release hands off to the untouched `dz publish`,
 *   and an anti-duplication test greps every planned command for gate keywords.
 * - Fail-closed: any `fail` ⇒ `publishAction: 'blocked'`; a planned-but-unexecuted step is a
 *   FAILURE (an under-executed plan can never pass); all-skip is NOT `proceed` (nothing
 *   verified is not verified).
 *
 * @packageDocumentation
 */
/** The four HARD verify gates, in execution order. */
export type ReleaseGateId = 'tests' | 'audit' | 'syntax' | 'smoke';
/** Order the CLI executes and the verdict reports gates in. */
export declare const RELEASE_GATE_ORDER: readonly ReleaseGateId[];
/**
 * Classified failure kinds. Classifications are DATA, not prose (AM-1/2/3/4): the report and
 * the auto-issue name the class, and tests pin each class to its triggering input.
 */
export type ReleaseFailureClass = 'EXIT_NONZERO' | 'TIMEOUT' | 'VULNS_HIGH' | 'AUDIT_ERROR' | 'STALE_DIST' | 'MISSING_DIST' | 'SMOKE_TIMEOUT' | 'MISSING_BIN' | 'UNEXECUTED_STEP';
/** Skip kinds — surfaced per-package, never aggregated into PASS wording (AM-2). */
export type ReleaseSkipClass = 'SKIP_NO_TEST_SCRIPT' | 'SKIP_NO_ARTIFACTS';
/** One `bin` entry of a package, resolved to an absolute path. */
export interface ReleaseBinEntry {
    readonly name: string;
    /** Absolute path to the bin file (the `./`-less package.json shape is normalized). */
    readonly path: string;
    readonly exists: boolean;
}
/** Facts about one publishable package — the injected input of the pure planner. */
export interface ReleasePackageFacts {
    readonly name: string;
    readonly dir: string;
    readonly version: string;
    readonly hasTestScript: boolean;
    /** `scripts.build` declared — the AM-10 discriminator between "unbuilt" and "template-only". */
    readonly hasBuildScript: boolean;
    readonly bins: readonly ReleaseBinEntry[];
    /** `dist/**\/*.js` files, relative to the package dir. */
    readonly distJs: readonly string[];
    /** Newest src/ mtime > newest dist/ mtime (only set when both dirs exist) — AM-3 input. */
    readonly srcNewerThanDist?: boolean | undefined;
}
/** One concrete verification step — data, not action. */
export interface GateStep {
    readonly id: string;
    readonly gate: ReleaseGateId;
    readonly pkg?: string | undefined;
    /** The exact command the CLI will execute; empty for `synthetic-fail` steps. */
    readonly cmd: string;
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly reason: string;
    /**
     * `exec` (default): the CLI runs `cmd`. `synthetic-fail`: the PLAN already knows this step
     * fails (missing bin, stale dist) — classification sees it without any execution.
     */
    readonly kind?: 'exec' | 'synthetic-fail' | undefined;
    /** For `synthetic-fail` steps: the failure class the verdict must carry. */
    readonly failClass?: ReleaseFailureClass | undefined;
    /**
     * Smoke steps run in a THROWAWAY cwd (AM-4): skills bins are installers that mutate
     * `.claude/` on default action. Scope honesty: the temp cwd only diverts RELATIVE-path
     * writes; a bin resolving the workspace via env/__dirname can still reach it — inherent
     * to executing bins at all, which is the point of the smoke gate.
     */
    readonly tempCwd?: boolean | undefined;
}
/** An honestly-reported skip (e.g. a package with no `test` script). */
export interface GateSkip {
    readonly gate: ReleaseGateId;
    readonly pkg: string;
    readonly reason: string;
    readonly class: ReleaseSkipClass;
}
/** The full plan for one release run: ordered steps + per-package skip records. */
export interface GatePlan {
    readonly steps: readonly GateStep[];
    readonly skips: readonly GateSkip[];
    /** Package names in the release set (dependency order). */
    readonly packages: readonly string[];
}
/** The CLI's record of running one exec step. */
export interface GateExecution {
    readonly stepId: string;
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly durationMs: number;
    readonly timedOut?: boolean | undefined;
}
/** One classified failure inside a gate. */
export interface GateFailure {
    readonly pkg?: string | undefined;
    readonly reason: string;
    readonly class: ReleaseFailureClass;
}
/** Per-gate verdict. `skip` = the gate had nothing to execute (still not a pass). */
export interface GateResult {
    readonly gate: ReleaseGateId;
    readonly status: 'pass' | 'fail' | 'skip';
    readonly passed: number;
    readonly failures: readonly GateFailure[];
    readonly skips: readonly GateSkip[];
}
/** The verdict — single input for report/issue/tag/handoff decisions. */
export interface ReleaseVerdict {
    readonly gates: readonly GateResult[];
    readonly ok: boolean;
    readonly blockedBy: readonly string[];
    readonly skipped: readonly GateSkip[];
    /** Fail-closed decision point: `'proceed'` iff every gate is clean AND something ran. */
    readonly publishAction: 'proceed' | 'blocked';
    readonly timestamp: string;
}
/** Default per-step timeouts (NFR-4: a hung child is a classified failure, not a hung release). */
export declare const RELEASE_TIMEOUTS: {
    readonly testMs: 600000;
    readonly auditMs: 120000;
    readonly syntaxMs: 30000;
    readonly smokeMs: 20000;
};
/**
 * Gather {@link ReleasePackageFacts} for the release set: `discoverPackages` +
 * `orderByDependencies` (imported from publish — reuse, never copy: G9) plus each package's
 * `scripts.test` / `bin` / `dist/**\/*.js` and dist-vs-src staleness (AM-3 input).
 *
 * `filter` mirrors `dz publish --filter` substring semantics (name OR dir); an explicitly
 * empty filter is REJECTED (throws) — "match all on empty" was the publish P0 this mirrors.
 *
 * Failure contract (load-bearing path — fail FAST, not open): a corrupt `package.json`
 * throws up to the caller; a missing/foreign root degrades to `[]` per the
 * `discoverPackages` contract (the CLI reports "no publishable packages" and exits non-zero).
 */
export declare function collectPackageFacts(monorepoRoot: string, filter?: readonly string[]): ReleasePackageFacts[];
/**
 * AM-8: affected-package selection is a PURE function of an injected changed-file list.
 * `null` (diff unavailable), an empty list, or a list matching zero packages all FAIL OPEN
 * to the full set — a release can never pass on zero verified packages.
 */
export declare function selectAffectedPackages(changedFiles: readonly string[] | null, facts: readonly ReleasePackageFacts[]): ReleasePackageFacts[];
export interface PlanReleaseGatesOptions {
    readonly monorepoRoot: string;
    /** pnpm is the workspace manager here (AM-1); npm audit only when no pnpm lockfile. */
    readonly pnpmLockPresent: boolean;
    /**
     * AM-11: the audit gate scopes to PRODUCTION dependencies by default — a dev-only advisory
     * (e.g. a vite chain nothing ships) making every release permanently red is a false gate,
     * and a false gate kills trust in the real one. `true` (CLI `--audit-dev`) widens to all deps.
     */
    readonly includeDevDeps?: boolean | undefined;
    readonly testTimeoutMs?: number | undefined;
    readonly auditTimeoutMs?: number | undefined;
    readonly syntaxTimeoutMs?: number | undefined;
    readonly smokeTimeoutMs?: number | undefined;
}
/**
 * Plan the four gates from injected facts. Pure: same facts ⇒ byte-identical plan; nothing
 * is executed; every command is an assertable string. Anti-duplication (ADR D1): no step may
 * re-enact a publish gate — the dedicated test greps `cmd`s for guard/claim/sign/provenance.
 */
export declare function planReleaseGates(facts: readonly ReleasePackageFacts[], opts: PlanReleaseGatesOptions): GatePlan;
/**
 * First non-empty output line, for one-line failure reasons; hostile input coerced safely.
 * Exported so the CLI reuses it for gh/tag periphery messages (G9 reuse-never-copy).
 */
export declare function firstOutputLine(...chunks: readonly unknown[]): string;
/**
 * Merge plan + executions into the {@link ReleaseVerdict} — the single fail-closed decision
 * point (ADR load-bearing property):
 *
 * - any `fail` ⇒ `publishAction: 'blocked'`, `ok: false`;
 * - a planned exec step with NO execution record ⇒ `UNEXECUTED_STEP` failure;
 * - all-skip (nothing executed anywhere) ⇒ NOT `proceed` — nothing verified is not verified;
 * - never throws on hostile input (`formatPublishError` discipline).
 */
export declare function classifyGateExecutions(plan: GatePlan, executions: readonly GateExecution[], now?: Date): ReleaseVerdict;
export interface FailureIssueContext {
    /** How the release was invoked (for reproduction), e.g. `dz release --filter foo`. */
    readonly invocation?: string | undefined;
    readonly repo?: string | undefined;
}
/**
 * gh-2.4-safe `gh issue create` payload (only `--title`/`--body` are assumed downstream).
 * Pure + deterministic for a fixed verdict — the issue is the verdict's echo, never its judge.
 */
export declare function buildFailureIssue(verdict: ReleaseVerdict, ctx?: FailureIssueContext): {
    title: string;
    body: string;
};
/** Short, bounded release notes from injected `git log --oneline`-style lines. */
export declare function buildReleaseNotes(gitLogLines: readonly string[], limit?: number): string;
/** Deterministic tag name from injected data: `release-<yyyymmdd>-<shortsha>`. */
export declare function releaseTagName(now: Date, shortSha: string): string;
//# sourceMappingURL=release.d.ts.map