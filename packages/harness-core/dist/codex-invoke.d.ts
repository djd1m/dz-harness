/**
 * The one supported way to invoke Codex from a Claude Code session.
 *
 * Three failure modes were measured on 2026-08-31, each violating knowledge we had already
 * written down and could not enforce: the fire-and-forget wrapper returning a dispatch stub for a
 * stage whose deliverable is its return value; a prompt passed as a shell ARGUMENT whose backticks
 * the shell read as command substitution, leaving codex to read an empty stdin and hang for 26
 * minutes; and an unscoped run spending its whole budget exploring the tree and returning no
 * verdict at all.
 *
 * The cure is structural, not advisory: this module has no parameter that accepts a prompt STRING
 * (so a shell can never mangle it), a timeout is always present, and the outcome set is CLOSED —
 * either the model's text, or one of five named refusals. There is no third state, which is the
 * property the tests pin.
 */
/** Every way this can fail, enumerated. A refusal outside this set is a bug, not a new case. */
export type CodexRefusal = 'timeout' | 'no-output' | 'model-unavailable' | 'tool-error' | 'bad-usage';
export interface CodexOk {
    readonly ok: true;
    readonly text: string;
    readonly model: string;
    readonly elapsedMs: number;
}
export interface CodexRefused {
    readonly ok: false;
    readonly refusal: CodexRefusal;
    /** Human-readable, names WHAT was observed — never a guess at the cause. */
    readonly detail: string;
    readonly model?: string;
    readonly elapsedMs?: number;
}
export type CodexOutcome = CodexOk | CodexRefused;
export declare const CODEX_DEFAULT_TIMEOUT_MS = 600000;
export declare const CODEX_PROBE_TIMEOUT_MS = 90000;
/** Model ids this account has been seen to answer on. A name here is spellable, never available. */
export declare const CODEX_KNOWN_MODELS: readonly ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5"];
export interface CodexRunInput {
    /** Absolute path to a file holding the prompt. There is deliberately no string variant. */
    readonly promptFile: string;
    readonly model: string;
    readonly timeoutMs?: number;
    /**
     * Files the model may read. REQUIRED for review-shaped work: an unscoped run was measured at
     * 280s / exit 124 / 416KB of exploration and no verdict, while the same question scoped to two
     * named files answered in 41s. Empty means "no scope declared" and is allowed only for a
     * self-contained question that needs no repository access.
     */
    readonly scope?: readonly string[];
    readonly effort?: 'low' | 'medium' | 'high' | 'xhigh';
}
/** What a runner must provide. Kept tiny so tests can substitute it without spawning anything. */
export interface CodexRunner {
    (argv: readonly string[], timeoutMs: number): {
        readonly status: number | null;
        readonly stdout: string;
        readonly stderr: string;
        readonly timedOut: boolean;
    };
}
/** Build the argv. Exported so a test can assert the prompt never rides on the command line. */
export declare function codexArgv(input: CodexRunInput): string[];
/** Turn a raw runner result into the closed outcome set. */
export declare function classifyCodexResult(raw: {
    status: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}, model: string, elapsedMs: number): CodexOutcome;
/** Compose the prompt file's content: the task, plus the scope fence when one is declared. */
export declare function codexPromptBody(task: string, scope?: readonly string[]): string;
/** True when the outcome may be consumed as an answer. Exists so callers cannot forget the check. */
export declare function codexAnswered(outcome: CodexOutcome): outcome is CodexOk;
//# sourceMappingURL=codex-invoke.d.ts.map