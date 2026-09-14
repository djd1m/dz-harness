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
import type { PackedInstallPlan } from './packed-install-smoke.js';
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
    /**
     * AM-7 (feature publish-sibling-drift-gate): the packed-install sub-plan, carried through so
     * {@link classifyGateExecutions} can re-judge its `bin-version`/`bin-exists` steps through the
     * SAME judge `dz publish` uses (`judgePackedInstallSmoke`: exit 0 AND non-empty stdout, AND the
     * declared bin must exist post-install) instead of the generic exit-code-only check every other
     * step gets. Without this, a silently no-op bin could pass `dz release` while `dz publish`
     * refuses it — the two doors would not be equal, contradicting FR-6's own claim.
     */
    readonly packedInstallPlan?: PackedInstallPlan | undefined;
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
    /**
     * Feature release-gate-output-tail (AM-4): the last non-empty lines of the step's stdout and
     * stderr, KEPT SEPARATE — each stream through {@link outputTail} on its own, never merged —
     * so a reader can tell which stream a line came from. Set for `tests`/`syntax`/`smoke`
     * EXIT_NONZERO/TIMEOUT failures; absent for `audit` (its own detail line already summarizes)
     * and for failures with no execution record (e.g. UNEXECUTED_STEP).
     *
     * Scope honesty (AM-4): the two streams are captured independently, so a printed/issued
     * `stdout:`/`stderr:` pair does NOT reconstruct the chronological interleaving of the two
     * streams as the process actually emitted them — only each stream's own tail order is
     * preserved. Documented in the CLI README (AM-8), not silently implied.
     */
    readonly tails?: {
        readonly stdout: string;
        readonly stderr: string;
    };
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
    /**
     * FR-6 (feature publish-sibling-drift-gate): real tmp dirs for the packed-install smoke,
     * supplied by the CLI (planning stays pure — it never calls mkdtemp itself). Omitted ⇒ no
     * packed-install steps are planned, byte-identical to the pre-feature behavior.
     */
    readonly packedInstall?: {
        readonly packDir: string;
        readonly installDir: string;
    } | undefined;
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
 * Feature release-gate-output-tail (FR-1, amended AM-2): a one-line-ish detail for a
 * `tests`/`syntax`/`smoke` EXIT_NONZERO/TIMEOUT failure that names the ACTUAL failure — not
 * just the first output line, which for `pnpm test`/vitest is routinely an unrelated
 * vite/esbuild deprecation warning (MEASURED 2026-09-13 16:05/18:52).
 *
 * AM-2: ANSI escapes are stripped FIRST (a coloured runner must match the same patterns as a
 * plain one). Recognised shapes, collected in this priority order and joined:
 * 1. vitest summary lines (`Tests …`, `Test Files …`);
 * 2. up to 5 `FAIL …` / `× …` / `❯ …` lines (failing test names/paths);
 * 3. node:test (TAP) lines: `not ok N - name` and `# fail N`.
 *
 * If NONE of the above is present (a non-vitest, non-TAP failure, or empty output), fall back
 * to the prior `firstLine` behavior, marked `(no test-runner summary recognised)` so a reader
 * knows the detail is a guess, not a parsed summary — UNLESS `firstLine` itself is empty (no
 * output at all), in which case the mark would manufacture a synthetic line where none existed
 * and is withheld. Capped at 600 chars — a detail line, not a dump.
 */
export declare function testsFailureDetail(stdout: unknown, stderr: unknown): string;
/**
 * Feature release-gate-output-tail (FR-2/FR-3, amended AM-3): the last non-empty lines of ONE
 * stream (call separately for stdout and stderr — AM-4), bounded on BOTH axes (line count and
 * byte size) so a runaway suite cannot blow up a report or an issue body.
 *
 * AM-3 bounds, each an explicit branch rather than an emergent `Array.slice(-0)` accident
 * (`slice(-0)` returns the WHOLE array, not `[]` — the pre-amendment bug):
 * - `maxLines <= 0` → `''`; `maxBytes <= 0` → `''`.
 * - Whole-line selection: lines are pulled from the END while the running BYTE total (each
 *   line's UTF-8 byte length plus its joining `\n`) stays `<= maxBytes` — never a partial line.
 * - A single most-recent line that ALONE exceeds `maxBytes` is truncated at a UTF-8 CHARACTER
 *   boundary (never splitting a multi-byte codepoint) and marked `… (line truncated)`.
 *
 * Empty/whitespace-only output → `''` (never a synthetic line).
 */
export declare function outputTail(stdout: unknown, stderr: unknown, maxLines?: number, maxBytes?: number): string;
/**
 * Feature release-gate-output-tail (AM-1): redact secret-shaped substrings before ANY tail text
 * reaches a GitHub issue body. Patterns, each independently redacted:
 * - `token`/`secret`/`password` (case-insensitive) as a `key: value` or `key=value` pair — the
 *   KEY survives, only the value is replaced;
 * - `Bearer <token>` HTTP auth headers;
 * - vendor-prefixed tokens: `npm_…`, `ghp_…`, `sk-…`, `AKIA…`;
 * - long opaque strings (base64/hex-ish, `[A-Za-z0-9+/=]{32,}`) that look like a key/secret even
 *   without a recognisable prefix.
 * Order matters: prefixed/labelled patterns run BEFORE the generic long-opaque-string pattern so
 * a `Bearer …` token is redacted as a whole rather than surviving as a shorter unlabelled blob.
 */
export declare function redactSecrets(text: string): string;
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
 *
 * AM-1/AM-4/AM-5: every tail is (a) redacted (secret-shaped substrings replaced — see
 * {@link redactSecrets}) and ANSI-stripped BEFORE it is ever considered for the body; (b) shown
 * per STREAM, labelled `stdout:`/`stderr:` — AM-4's scope note applies here too: the two labelled
 * blocks do NOT reconstruct chronological interleaving between the streams; (c) fenced so the
 * payload cannot break out of its code block; (d) the WHOLE body is capped at
 * {@link MAX_ISSUE_BODY_BYTES} — when it would exceed the cap, every tail is shrunk EVENLY
 * (byte-proportional), not by dropping some tails whole while keeping others untouched.
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