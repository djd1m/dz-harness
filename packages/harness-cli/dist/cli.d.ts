/**
 * The `dz` CLI — argv parsing + dispatch over `@dzhechkov/harness-core`.
 *
 * @packageDocumentation
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { runSyncCodexHooks, type CodexHooksSyncReport, type BridgeFamily } from '@dzhechkov/harness-core';
import type { RecallPatternsOptions, TeachGuardResult, IntegrationOutcome } from '@dzhechkov/harness-core';
/** Literal command inventory, pinned against the main dispatch switch by a layer-1 test. */
export declare const DZ_COMMANDS: readonly string[];
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
    /** Guard decision seam; production always uses the real vector-backed teach guard. */
    readonly teachGuardRunner?: (projectRoot: string, text: string, opts: {
        readonly reward?: number;
    }) => Promise<TeachGuardResult>;
    /** Reinforcement flush seam paired with `teachGuardRunner`; production uses the configured backend. */
    readonly teachReinforceRunner?: (projectRoot: string, dzId: string, reward: number) => Promise<{
        readonly flushed: number;
    }>;
    /**
     * Test seam for `dz release`: overrides subprocess execution for gate steps and the
     * gh/git side channels (production leaves it unset → real `execSync`, stdio piped).
     * A scripted runner makes failing gates, gh outages, and git-tag failures testable
     * without spawning anything.
     */
    readonly releaseRunner?: ReleaseExecRunner;
    /**
     * Test seam for `dz install`: overrides the `npm install` subprocess (production leaves
     * it unset → real `execSync`, stdio piped). A stub runner that pre-stages a fixture
     * package under `node_modules/` makes `cmdInstall`'s layout resolution testable
     * offline, hermetically — mirrors the {@link CliIo.releaseRunner} idiom.
     */
    readonly installRunner?: (command: string, cwd: string) => void;
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
/**
 * Run `fn` with anything written to STDOUT by code we do not own routed to STDERR instead.
 *
 * Used to keep `--json` output parseable: a dependency that greets stdout on first load (currently
 * transformers.js) would otherwise sit in front of the JSON array. Nothing is swallowed — the text
 * still reaches the terminal, on the stream diagnostics belong on. Restoration is in `finally`, so a
 * throwing `fn` cannot leave stdout redirected.
 */
export declare function withForeignStdoutOnStderr<T>(fn: () => Promise<T>): Promise<T>;
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
/** Test seam for the chokepoint: NEW-C4's proof needs to call it with a hostile pid. */
export declare function __wfSignalChildTestSeam(child: unknown, signal: string, detached: boolean): boolean;
/** Exposed for the unit test: the kill set must NAME every live child's pid. */
export declare function __wfKillGroupTestSeam(): {
    register: (pid: number, child: ChildProcess) => void;
    killAll: () => number[];
    size: () => number;
};
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
export declare function runCli(argv: string[], io?: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map