/**
 * The `dz` CLI — argv parsing + dispatch over `@dzhechkov/harness-core`.
 *
 * @packageDocumentation
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { type JournalIo } from '@dzhechkov/harness-core';
import { type RoundLedgerRow, type RoundExecLedgerRow } from '@dzhechkov/harness-core';
declare module '@dzhechkov/harness-core' {
    interface RoundState {
        /** 16 random hex chars, minted once by `open`. The identity comparison `exec`/`close` use
         * instead of pid: `process.ppid` coincides for two `dz` launched from the same shell, and every
         * run-owned state carries pid 0 (teach:0ea46034 — pid is not identity). */
        readonly stateId?: string;
        /** Lead edit after Codex re-review: identity of ONE exec claim (two execs of the same round
         * instance are different claims) and when it was taken — the stale-exec warning counts from it. */
        readonly execClaimId?: string;
        readonly execClaimedAt?: string;
    }
}
import { runSyncCodexHooks, type CodexHooksSyncReport, type FetchPublished, type BridgeFamily } from '@dzhechkov/harness-core';
import type { RecallPatternsOptions, TeachGuardResult, IntegrationOutcome } from '@dzhechkov/harness-core';
/** Literal command inventory, pinned against the main dispatch switch by a layer-1 test. */
export declare const DZ_COMMANDS: readonly string[];
export interface MutationGateRunnerObservation {
    readonly exitCode: number | null;
    readonly output: string;
    readonly failureReason?: string;
}
export type MutationGateRunner = (command: string, options: {
    readonly cwd: string;
    readonly timeoutMs: number;
    readonly phase: 'baseline' | 'mutation' | 'rebaseline' | 'final-rebaseline';
    readonly entryId?: string;
    /**
     * mutation-gate-baseline-honesty FR-3: the extra env vars the REAL executor would set on top of
     * `process.env` for this run — currently just `VITEST_MAX_WORKERS`, set unconditionally
     * regardless of whether the test command is recognised as vitest (a non-vitest command still
     * gets the env var; only the command-string injection is vitest-gated). mutation-gate-inject-tokens
     * FR-4 (MEASURED vitest 3.2.4): the env is read by vitest CONFIGS that opt in (this repo's
     * `harness-core`/`harness-cli` vitest.config.ts do) — vitest itself does not read it.
     */
    readonly env: Readonly<Record<string, string>>;
}) => MutationGateRunnerObservation;
/** Output sink + working directory — injectable so the CLI is testable. */
export interface CliIo {
    readonly cwd?: string;
    readonly write?: (line: string) => void;
    /**
     * Diagnostics sink — **stderr**, defaulting to `console.error`.
     *
     * Before feature dz-cli-defects `CliIo` had no stderr seam at all, so every
     * diagnostic (including the top-level error handler) landed on stdout and
     * `dz list > skills.txt` wrote the error INTO the data file. `write` stays "data
     * only"; `writeErr` is "diagnosis only".
     *
     * There is deliberately **no** fall-back to `write`: a test that wants to assert on
     * stderr must inject `writeErr`, or the assertion would be theatre.
     */
    readonly writeErr?: (line: string) => void;
    /**
     * Pre-read STDIN content (injectable so `dz brain ground`'s hook path is testable without
     * an actual pipe). When omitted, the CLI reads fd 0 synchronously — but only for the one
     * command that needs it (`brain ground`), and never when stdin is a TTY (nothing piped).
     */
    readonly stdin?: string;
    /** Human-terminal rendering seam; production defaults to stdout TTY detection. */
    readonly interactive?: boolean;
    /** Fault seam proving that class-form recall degrades to specific recall with a stderr receipt. */
    readonly classMatcher?: RecallPatternsOptions['classMatcher'];
    /** Focused-round seams: production still uses the real store, writer, ledger tail and pid probe. */
    readonly roundNow?: () => number;
    readonly roundPid?: number;
    readonly roundRecall?: (projectRoot: string, topic: string, options: {
        readonly limit: number;
        readonly runId?: string;
    }) => Promise<readonly {
        readonly id: string;
        readonly reward: number;
        readonly domain: string;
        readonly text: string;
    }[]>;
    readonly roundLessonExists?: (projectRoot: string, id: string) => boolean;
    readonly roundLedgerWriter?: (projectRoot: string, row: RoundLedgerRow | RoundExecLedgerRow) => unknown;
    readonly roundLedgerReader?: (projectRoot: string) => string;
    /** cross-family-control-branch fix-round-1 (finding 8): reads the qe-bridge signoff FILE
     *  `dz control-review` treats as the AUTHORITATIVE claude-half record. A test seam so "the
     *  authoritative record cannot be read/parsed" (r1-8's hard refusal) is reproducible without a
     *  real disk race — production always uses `readFileSync(path, 'utf-8')`. */
    readonly readClaudeSignoffText?: (absolutePath: string) => string;
    readonly roundPidProbe?: (pid: number) => boolean | null;
    readonly roundRunRegistryReader?: (projectRoot: string) => string;
    readonly roundKillGraceMs?: number;
    /** round-state-lock NFR-2: overrides the round lock's acquisition deadline for `dz round`
     * mutations so a test can force `lock busy` deterministically. Omitted in production. */
    readonly roundLockTimeoutMs?: number;
    readonly roundSpawn?: (request: {
        readonly command: 'codex';
        readonly args: readonly string[];
        readonly cwd: string;
        readonly logPath: string;
        readonly timeoutMs: number;
        readonly killGraceMs?: number;
    }) => Promise<{
        readonly exitCode: number | null;
        readonly timedOut: boolean;
        readonly signal: NodeJS.Signals | null;
        readonly errorCode?: string;
        readonly error?: string;
    }>;
    /** Guard decision seam; production always uses the real vector-backed teach guard. */
    readonly teachGuardRunner?: (projectRoot: string, text: string, opts: {
        readonly reward?: number;
    }) => Promise<TeachGuardResult>;
    /** Reinforcement flush seam paired with `teachGuardRunner`; production uses the configured backend. */
    readonly teachReinforceRunner?: (projectRoot: string, dzId: string, reward?: number) => Promise<{
        readonly flushed: number;
        readonly dzId?: string;
    }>;
    /**
     * Test seam for `dz release`: overrides subprocess execution for gate steps and the
     * gh/git side channels (production leaves it unset → real `execSync`, stdio piped).
     * A scripted runner makes failing gates, gh outages, and git-tag failures testable
     * without spawning anything.
     */
    readonly releaseRunner?: ReleaseExecRunner;
    /** Post-publish mirror command seam; production uses synchronous shell execution. */
    readonly publishMirrorRunner?: PublishMirrorRunner;
    /**
     * Test seam for `dz publish`'s sibling-drift gate (feature publish-sibling-drift-gate):
     * overrides the registry fetch (production leaves it unset → real `npm pack` + extract into a
     * temp dir). Tests inject a local directory instead of hitting the real registry.
     */
    readonly publishSiblingDriftFetcher?: FetchPublished;
    /**
     * Test seam for `dz publish`'s packed-install smoke: overrides the pack/install/`--version`
     * subprocesses (production leaves it unset → real `execSync`, stdio piped). Mirrors
     * {@link CliIo.releaseRunner}.
     */
    readonly publishPackedInstallRunner?: ReleaseExecRunner;
    /**
     * AM-1 (feature publish-sibling-drift-gate): overrides EVERY subprocess `publishPackages` would
     * run on a LIVE publish — build, the `npm pack`/`npm publish <tgz>` packedTransport commands, and
     * the `npm view` registry probes (production leaves it unset → real `execSync`, stdio piped).
     * Threaded into `publishPackages`'s `exec` option so a test can drive the FULL live+packedTransport
     * `cmdPublish` path (pack → smoke → publish → registry-confirm) with zero network and zero real
     * `npm publish`.
     */
    readonly publishExecRunner?: (command: string, options: {
        cwd?: string | URL | undefined;
        stdio?: unknown;
        encoding?: unknown;
        timeout?: number | undefined;
        env?: NodeJS.ProcessEnv | undefined;
    }) => string;
    /**
     * Test seam for `dz publish`'s gate-audit writer (feature `publish-gate-audit-durable`, FR-2):
     * overrides the fs primitives `appendPublishGateAudit` uses for its durable append (production
     * leaves it unset → the real `node:fs` functions). Lets a test make `fsyncSync` throw to prove
     * `(audit NOT logged: …)` is printed and the write is reported as failed, without touching any
     * other seam's filesystem.
     */
    readonly publishGateAuditFsLayer?: PublishGateAuditFsLayer;
    /**
     * AM-5 (feature publish-gate-audit-durable): test seam for the sibling-drift gate's `npm pack
     * --dry-run --json` call (production leaves it unset → real `execFileSync`). Takes the package
     * dir, returns raw stdout, or throws to simulate a real `npm` failure without spawning anything.
     */
    readonly publishNpmPackRunner?: (dir: string) => string;
    /**
     * Test seam for publish's registry-CONFIRMATION step (`confirmPublished`, inside
     * `publishPackages`) — feature `publish-confirm-seam` (backlog 079ba94c). Exists so a test can
     * prove the ORDER "registry confirmed → `stage:'publish'` ledger row written" through the REAL
     * `publishPackages`, not a `vi.mock('@dzhechkov/harness-core')` that removes the confirmation
     * step entirely (a mock of `publishPackages` cannot show this order at all — see
     * `test/publish-confirm-seam.test.ts`). Production leaves this unset, so `publishPackages` falls
     * back to its own defaults (a real `npm view` probe, a real blocking `sleep`). Publish behaviour is
     * therefore unchanged when the seam is unset; the emitted options object does carry the two extra
     * keys with `undefined` values, so "unchanged behaviour" is the accurate claim, not "byte-identical
     * call" (review finding, 2026-09-18).
     */
    readonly publishRegistry?: {
        readonly probe?: (name: string, version: string) => boolean | {
            ok: boolean;
            stdout: string;
            stderr: string;
            code: number | null;
            ms: number;
        };
        readonly sleep?: (milliseconds: number) => void;
    };
    /**
     * Test seam for `dz install`: overrides the `npm install` subprocess (production leaves
     * it unset → real `execSync`, stdio piped). A stub runner that pre-stages a fixture
     * package under `node_modules/` makes `cmdInstall`'s layout resolution testable
     * offline, hermetically — mirrors the {@link CliIo.releaseRunner} idiom.
     */
    readonly installRunner?: (command: string, cwd: string) => void;
    /** Fault seam for proving mutation-gate catches and retries thrown runner internals. */
    readonly mutationGateRunner?: MutationGateRunner;
    /** Read-back fault seam; production uses the real filesystem. */
    readonly journalIo?: JournalIo;
}
/** Injected subprocess runner used by `dz release` (see {@link CliIo.releaseRunner}). */
export type ReleaseExecRunner = (cmd: string, opts: {
    readonly cwd: string;
    readonly timeoutMs: number;
}) => {
    exitCode: number;
    stdout: string;
    stderr: string;
    timedOut?: boolean;
};
export type PublishMirrorRunner = (command: string, options: {
    readonly cwd: string;
    readonly env: NodeJS.ProcessEnv;
}) => string;
type Write = (line: string) => void;
/**
 * Команда npm для установки пакета В ЦЕЛЕВОЙ КАТАЛОГ, а не куда решит npm.
 *
 * ЗАЧЕМ `--prefix`. Без него npm при отсутствии `package.json` в текущем каталоге поднимается по
 * дереву до первого найденного и мутирует ЕГО — а `dz` потом ищет пакет в
 * `<цель>/node_modules` и не находит. Место установки и место проверки были двумя независимыми
 * предположениями, и совпадали они только по удаче.
 *
 * ИЗМЕРЕНО 2026-09-03 (полевой случай владельца): установка в каталог без `package.json`
 * записала в `/home`, где лежит ЧУЖОЙ проект; ручной откат вернул `package.json`, а запись
 * `extraneous` в `/home/package-lock.json` пережила откат.
 *
 * ПОЧЕМУ НЕ ОТКАЗ (ADR-001, вариант A отвергнут). Отказ запретил бы законный сценарий: проект
 * внутри монорепо, намеренно не имеющий своего `package.json` и опирающийся на родительский
 * воркспейс. `--prefix` согласует установку с проверкой ПО ПОСТРОЕНИЮ и сценарий сохраняет.
 *
 * ЧИСТАЯ: ни файловой системы, ни запуска npm — проверяется без обоих. Путь экранируется, потому
 * что каталоги с пробелом в имени встречаются в наших же тестах.
 */
export declare function buildInstallArgs(npmSpec: string, projectRoot: string): readonly string[];
/**
 * Та же команда СТРОКОЙ — только для показа человеку и для тестового шва.
 *
 * НЕ ДЛЯ ИСПОЛНЕНИЯ, и это не стилистическая оговорка. `JSON.stringify` НЕ является экранированием
 * для оболочки: внутри двойных кавычек оболочка по-прежнему выполняет `$(...)` и обратные кавычки.
 * ИЗМЕРЕНО 2026-09-03 — `execSync('echo ' + JSON.stringify('pkg$(touch ФАЙЛ)'))` создал файл.
 * Прежняя редакция этого комментария утверждала «путь экранируется»; это было неверно, и находку
 * предъявило кросс-семейное ревью (gpt-5.6-sol), а я подтвердил её пробой.
 *
 * Боевой путь исполняется через `execFileSync` массивом аргументов — оболочки в цепочке нет вовсе,
 * поэтому подставлять некуда. Это структурное лечение, а не более хитрое экранирование.
 */
export declare function buildInstallCommand(npmSpec: string, projectRoot: string): string;
/**
 * Run `fn` with anything written to STDOUT by code we do not own routed to STDERR instead.
 *
 * Used to keep `--json` output parseable: a dependency that greets stdout on first load (currently
 * transformers.js) would otherwise sit in front of the JSON array. Nothing is swallowed — the text
 * still reaches the terminal, on the stream diagnostics belong on. Restoration is in `finally`, so a
 * throwing `fn` cannot leave stdout redirected.
 */
export declare function withForeignStdoutOnStderr<T>(fn: () => Promise<T>): Promise<T>;
export declare function partitionPrivatePackages<T extends {
    name: string;
    dir: string;
    version: string;
}>(packages: readonly T[], readPkgJson: (dir: string) => string): {
    targets: T[];
    skipped: import("@dzhechkov/harness-core").PublishResult[];
    lines: string[];
};
/**
 * The version cell of one publish plan row (first-publish-not-offline, ADR-001 D2/D4; Step-8 MEDIUM: the LIVE
 * `unknown` row used to print a bare "NOT ESTABLISHED" while the dry-run row named the npm code). One rule for
 * both modes: an `unknown` probe prints `NOT ESTABLISHED (registry unreachable: <code>)` whenever the row's error
 * carries the code; `never-published` prints `<version> (first publish)`; everything else `<old> → <new>`.
 */
export declare function renderPublishVersionCell(pkg: {
    readonly oldVersion: string;
    readonly newVersion: string;
    readonly probe?: string | undefined;
    readonly firstPublish?: boolean | undefined;
    readonly error?: string | undefined;
}): string;
export declare function cmdPublish(options: Map<string, string>, flags: Set<string>, cwd: string, writeOutput: Write, mirrorRunner?: PublishMirrorRunner, siblingDriftFetcher?: FetchPublished, packedInstallRunner?: ReleaseExecRunner, publishExecRunner?: (command: string, options: {
    cwd?: string | URL | undefined;
    stdio?: unknown;
    encoding?: unknown;
    timeout?: number | undefined;
    env?: NodeJS.ProcessEnv | undefined;
}) => string, gateAuditFsLayer?: PublishGateAuditFsLayer, 
/**
 * AM-5 (feature publish-gate-audit-durable): test seam for the sibling-drift gate's `npm pack
 * --dry-run --json` call — production leaves it unset (real `execFileSync`). Takes the package
 * dir, returns raw stdout, or THROWS to simulate a real `npm` failure — a test can then prove the
 * failure reaches `parseNpmPackInventory`'s caller as `unavailable`, never a real subprocess.
 */
npmPackRunner?: (dir: string) => string, 
/**
 * publish-confirm-seam: test seam for the registry-confirmation step inside `publishPackages`
 * (see {@link CliIo.publishRegistry} for the full rationale). Production leaves it unset.
 */
registrySeam?: {
    readonly probe?: (name: string, version: string) => boolean | {
        ok: boolean;
        stdout: string;
        stderr: string;
        code: number | null;
        ms: number;
    };
    readonly sleep?: (milliseconds: number) => void;
}): number;
export interface CodexHooksSyncInput {
    readonly codexHome?: string | undefined;
    readonly project?: string | undefined;
    readonly check?: boolean;
    readonly remove?: boolean;
    /** `false` = the user's `--no-verify`. Anything else runs the live probe. */
    readonly verify?: boolean;
}
/**
 * The argv → operation mapping, extracted so it can be PINNED.
 *
 * It is the mapping that was broken: `--verify`, `--no-verify` and `--project` were parsed,
 * validated, listed in the usage line — and then never reached `runSyncCodexHooks`, so the CRITICAL
 * finding (a `ready` with no live proof behind it) lived entirely in three missing object keys.
 * A function that returns the options object is testable without a codex binary; an inline literal
 * is not.
 */
export declare function codexHooksSyncOptions(input: CodexHooksSyncInput): Parameters<typeof runSyncCodexHooks>[0];
export interface CodexHooksSummary {
    readonly ok: boolean;
    readonly stdout: readonly string[];
    readonly stderr: readonly string[];
}
/** Map the retained Codex hook writer's one live verdict into the common integration contract. */
export declare function normalizeCodexHookOutcome(base: IntegrationOutcome, delivery: CodexHooksSummary & {
    readonly report: CodexHooksSyncReport;
}, noVerify?: boolean): IntegrationOutcome;
/**
 * What the user is told about a sync report — the ONE place the success word can be printed.
 *
 * `report.ready` is the whole gate: installed ∧ executable ∧ trusted ∧ a live, non-bypassed probe
 * that WITNESSED our block. Nothing else may print "ready" (AM-17 / G-G), and `--no-verify` never
 * can, because it never measured.
 */
export declare function codexHooksSummary(report: CodexHooksSyncReport, label?: string): CodexHooksSummary;
export declare function deliverCodexHooks(input: CodexHooksSyncInput, sync?: (options: Parameters<typeof runSyncCodexHooks>[0]) => CodexHooksSyncReport, label?: string): CodexHooksSummary & {
    readonly report: CodexHooksSyncReport;
};
/**
 * fs primitives `appendPublishGateAudit` needs for its durable write (FR-2), injectable so a test
 * can make `fsyncSync` throw without touching the real filesystem underneath every OTHER seam this
 * function shares with production. Left unset in production → the real `node:fs` functions above.
 */
interface PublishGateAuditFsLayer {
    readonly existsSync: (path: string) => boolean;
    readonly mkdirSync: (path: string, opts: {
        recursive: boolean;
    }) => void;
    readonly openSync: (path: string, flags: number) => number;
    /**
     * AM-2 (Codex round-1 review, finding 2, high): `Buffer`, not `string` — a SHORT write must
     * resume at the exact BYTE it stopped at, and a string-based API cannot express that safely once
     * the data contains any multi-byte UTF-8 character (re-encoding a slice of an already-partial
     * string can silently produce different bytes than the ones actually pending). The real
     * `node:fs.writeSync` accepts a `Buffer` directly (no re-encoding), so this changes nothing about
     * what production writes.
     */
    readonly writeSync: (fd: number, data: Buffer) => number;
    readonly fsyncSync: (fd: number) => void;
    readonly closeSync: (fd: number) => void;
}
export declare function discriminationCompat(result: {
    readonly findings: readonly {
        readonly detail: string;
    }[];
}): {
    finding: {
        readonly detail: string;
    } | null;
    deprecated: {
        finding: string;
    };
};
export declare function boundedMutationGateOutputTail(output: string): string | undefined;
/** Test seam for the chokepoint: NEW-C4's proof needs to call it with a hostile pid. */
export declare function __wfSignalChildTestSeam(child: unknown, signal: string, detached: boolean): boolean;
/** Exposed for the unit test: the kill set must NAME every live child's pid. */
export declare function __wfKillGroupTestSeam(): {
    register: (pid: number, child: ChildProcess) => void;
    killAll: () => number[];
    size: () => number;
};
/** Git effects are injected; the core owns eligibility and the explicit apply boundary. */
export declare function cmdRunsClean(options: Map<string, string>, flags: Set<string>, cwd: string, write: Write, exec?: (command: string, options: {
    cwd: string;
    encoding: 'utf8';
    stdio: ['ignore', 'pipe', 'pipe'];
}) => string | Buffer): number;
type RoundSpawnReceipt = {
    readonly exitCode: number | null;
    readonly timedOut: boolean;
    readonly signal: NodeJS.Signals | null;
    readonly errorCode?: string;
    readonly error?: string;
};
export declare function spawnRoundCodex(request: {
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd: string;
    readonly logPath: string;
    readonly timeoutMs: number;
    readonly killGraceMs?: number;
}): Promise<RoundSpawnReceipt>;
export interface ClaudeBridgeRun {
    stdout: string;
    stderr: string;
    exitCode: number | null;
    timedOut: boolean;
    spawnError: string | null;
}
/**
 * Run one `claude` call with the prompt on STDIN. Spawn-injectable, and NEVER throws: a missing
 * binary, a crash and a hang all come back as DATA, because the taxonomy above them can only name
 * a failure it is handed. (The first draft of this function let the ENOENT escape as an uncaught
 * exception and the command never settled — the acid A1 red, quoted in red-green.md.)
 *
 * Mirrors `probeContent`'s settled-flag + SIGTERM deadline shape (`cli.ts` probes) and scrubs
 * `PROBE_SCRUB_ENV`, so a bridge launched from inside a nested Claude session cannot inherit the
 * parent's session identity (SEC-4).
 */
export declare function runClaudeBridge(bin: string, argv: string[], promptStdin: string, timeoutMs: number, cwd?: string, spawnImpl?: typeof spawn): Promise<ClaudeBridgeRun>;
/** Test seam for H9: the exact environment ONE family's child would receive. */
export declare function __wfChildEnvTestSeam(family: BridgeFamily, parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
/**
 * THE child-process wrapper both the qe-bridge and the loop runner ride (ADR-002 O1: ONE impure
 * wrapper, not two). Generalized from `runClaudeBridge` with the same guarantees — a settled flag so
 * no path resolves twice, a deadline timer that SIGTERMs, the `PROBE_SCRUB_ENV` scrub so a bridge
 * launched from inside a nested Claude session cannot inherit it, and an injectable `spawnImpl` —
 * plus the two knobs the generalization adds:
 *
 *   • `stdinText: null` ⇒ `stdio[0] = 'ignore'`. MEASURED: codex-cli 0.148.0 prints
 *     `Reading additional input from stdin...` and WAITS when stdin is left open. Passing an empty
 *     string is not the same thing as closing it.
 *   • `detached: true` ⇒ the child leads its OWN process group, so the runner can kill the whole
 *     group (AM-10). `onSpawn` hands the live child to the caller's registry at the only moment the
 *     pid is knowable.
 *
 * Never throws: a spawn failure resolves with `spawnError` set, exactly like the original.
 */
export declare function runChildBridge(bin: string, argv: string[], opts: {
    stdinText: string | null;
    timeoutMs: number;
    cwd: string;
    detached: boolean;
    spawnImpl?: typeof spawn;
    onSpawn?: (child: ChildProcess) => void;
    /**
     * `'scrub'` (default) — inherit the parent environment minus `PROBE_SCRUB_ENV`. The historical
     * qe-bridge posture; unchanged so its suites keep their meaning.
     * `'allowlist'` — build the child's environment from a NAMED list and nothing else
     * (Step-8 HIGH-9). A deny-list can only remove what somebody thought of; every cloud token,
     * registry credential and unrelated secret in the parent survived it. The loop runner uses this.
     */
    envMode?: 'scrub' | 'allowlist';
    /** Extra variable names the allowlist should carry (a family's own auth, named by the caller). */
    envExtra?: readonly string[];
}): Promise<ClaudeBridgeRun>;
/**
 * r1-7 (Codex r1 HIGH #7): the honest fallback reason for a failed claude-half bridge call in
 * `dz control-review` — NEVER an empty string. The old inline expression fell straight to
 * `bridgeOut.join(' | ')` whenever the parsed JSON carried no `detail` string, and `''` for a
 * genuinely EMPTY `bridgeOut` array. `isValidControlRefusedRow` (cross-family-control.ts) rejects a
 * blank `reason`, so the very row this refusal writes to PROVE "the run happened" was itself
 * unreadable — counted as aggregation noise instead of the refusal it actually was. Exported and
 * pure (no I/O) so this exact defect is directly, deterministically testable without reconstructing
 * the rare real-world shape that triggers it end to end.
 */
export declare function claudeHalfFailureReason(bridgeExit: number, bridgeResult: Record<string, unknown> | null, bridgeOut: readonly string[]): string;
/**
 * How many PACKAGES live under `baseDir` — a directory counts when, and only when, it carries a
 * `package.json`. Backlog c632bde4: this used to be `readdirSync(...).filter(isDirectory).length`,
 * which answers a DIFFERENT question — "how many folders are here". The two questions agreed until
 * a tool dropped a data store beside the packages: MEASURED 2026-09-19, `packages/@dzhechkov/`
 * held 58 directories and 57 manifests, the extra one being the gitignored `.agentic-qe` store
 * (`memory.db`, `brain.rvf`). `dz stats` printed 58 here and the CI runner, which never sees an
 * ignored directory, computed 57 — three README-alignment cases were red there and green here
 * (run 35434913155). The runner was RIGHT.
 *
 * The test is the MANIFEST, deliberately not a name filter: a skip-list of names (or "ignore
 * dot-directories") goes stale in silence, while "a package is a directory that declares itself
 * one" cannot. Pinned by test/stats-counts-packages.test.ts, whose red half is this exact case.
 */
export declare function countPackageDirs(baseDir: string): number;
export declare function runCli(argv: string[], io?: CliIo): Promise<number>;
export {};
//# sourceMappingURL=cli.d.ts.map