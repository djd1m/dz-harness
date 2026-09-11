/** Prefix of a BLOCKING message. Must appear verbatim for a block to be attributed to this guard. */
export declare const DESTRUCTIVE_REFUSE_MARKER = "DZ-DESTRUCTIVE:";
/** Prefix of a non-blocking message: an `undecidable` verdict, or our own failure to read. */
export declare const DESTRUCTIVE_WARN_MARKER = "DZ-DESTRUCTIVE-WARN:";
/**
 * Which host contract the payload follows. The two differ in ONE measured respect, so the
 * difference is a parameter rather than a guess:
 *
 * - `claude` — Claude Code sends `tool_name` for every tool and the registered matcher is `^Bash$`.
 *   A payload whose `tool_name` is not a shell tool is skipped WITHOUT looking at any command field,
 *   which is what the host contract promises and what the test pins.
 * - `codex` — AM-8 of `crossrt-2-codex-hooks`: key on the PRESENCE of `tool_input.command`, never on
 *   `tool_name` equality. Codex's shell tool has been observed under more than one name
 *   (`Bash|shell|local_shell` is the matcher the emitted registry entry already carries), so a
 *   tool_name test there would silently disarm the guard the day the runtime renames its tool.
 */
export type DestructiveHookHost = 'claude' | 'codex';
export interface DestructiveHookDecision {
    /** 2 = block the call (the host contract on BOTH runtimes). 0 = let it through. */
    readonly exitCode: 0 | 2;
    /** Exactly what the hook body writes to stderr. Empty string ⇒ write nothing at all. */
    readonly stderr: string;
    /**
     * What happened, for tests and for the helper's own notes log:
     * `refuse` / `allow` / `undecidable` are the classifier's three outcomes;
     * `skipped` = not a shell command, the classifier was never consulted;
     * `unreadable` = the payload or the classifier failed us, and we passed rather than guessed.
     */
    readonly outcome: 'refuse' | 'allow' | 'undecidable' | 'skipped' | 'unreadable';
    /** The rule id from a refusal, so a note can record WHICH rule fired without the command line. */
    readonly rule: string | null;
}
/**
 * Turn one hook payload into an exit code and a piece of text. The whole policy, both hosts.
 *
 * @param payload the parsed stdin object, or `null`/anything else when it did not parse.
 * @param host    which host contract the payload follows — see {@link DestructiveHookHost}.
 */
export declare function decideDestructiveHook(payload: unknown, host: DestructiveHookHost): DestructiveHookDecision;
//# sourceMappingURL=destructive-guard-hook.d.ts.map