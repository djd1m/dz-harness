/**
 * The fail-closed veto-probe classifier (`crossrt-2-codex-hooks`, ADR-002).
 *
 * Turns the evidence of ONE live probe run into a two-axis verdict. Pure: it never reads a file,
 * never runs a command, and never consults its own emitter's intent — the whole point is that
 * "we wrote the hook" is not evidence that the hook fired.
 *
 * ## The two axes (AM-16)
 *
 * `verdict` answers *did OUR hook block the forbidden command?* and comes from the TRANSCRIPT plus
 * the sentinel side effect. `trust` answers *is the entry armed in the runtime's own view?* and
 * comes from `hooks/list`'s `trustStatus` (MEASURED available headlessly — M0 spike, probe 1).
 *
 * ## No path defaults to a pass
 *
 * Every branch states its own verdict; there is no `??` fallback and no `else` that guesses. The
 * four ways a probe can LOOK like a pass without being one, each closed here:
 *
 * 1. **A bypassed run.** `--dangerously-bypass-hook-trust` makes an UNTRUSTED hook fire, so a block
 *    observed under it says nothing about the installed state (AM-1). Decided FIRST.
 * 2. **Somebody else's block.** MEASURED (M0 §5): the runtime prefixes our stderr with its own
 *    `Command blocked by PreToolUse hook: `. That phrase WITHOUT `DZ-VETO:` means *a* hook blocked,
 *    not that ours did.
 * 3. **A command that never ran.** "the model declined" and "the command was blocked" both show an
 *    absent sentinel; only the transcript separates them (AM-36).
 * 4. **A stale transcript.** Without this run's nonce the text is evidence about some other run.
 *
 * @packageDocumentation
 */
export type VetoVerdict = 'armed' | 'not-armed' | 'inconclusive';
export type VetoTrust = 'trusted' | 'trust-pending' | 'unknown';
/** The runtime's own `HookTrustStatus` vocabulary (v2 `HooksListResponse.json`, codex 0.147.0). */
export type CodexHookTrustStatus = 'managed' | 'untrusted' | 'trusted' | 'modified';
/** Our block marker. Must appear verbatim for a block to be attributed to dz. */
export declare const DZ_VETO_MARKER = "DZ-VETO:";
/** The default-mode (warn) marker — a hit that did NOT block (G-J). */
export declare const DZ_VETO_WARN_MARKER = "DZ-VETO-WARN:";
/** The runtime's generic block phrase. Present WITHOUT our marker ⇒ not our block. */
export declare const RUNTIME_BLOCK_PHRASE = "Command blocked by PreToolUse hook";
export interface VetoProbeEvidence {
    /** stdout+stderr of the probe run, verbatim. */
    readonly transcript: string;
    /** Per-run nonce embedded in the probe command; guards against grading a stale transcript. */
    readonly nonce: string;
    /**
     * Did the sentinel side effect land? `true` ⇒ the command RAN.
     *
     * `null` ⇒ the state could NOT be established (the stat failed, or a transcript carried no
     * sentinel header). ADR-002 §2 row `sentinelExists === null` ⇒ `inconclusive`: the QE fix round
     * found the probe parser DEFAULTING a missing header to `false`, which is the difference between
     * "the command was blocked" and "we did not look" (independent review, finding 4).
     */
    readonly sentinelPresent: boolean | null;
    /**
     * Did the `codex` invocation COMPLETE? `false` ⇒ inconclusive whatever the transcript says
     * (ADR-002 §2). `null` ⇒ the caller LOOKED and could not tell ⇒ also inconclusive. Absent ⇒ the
     * caller did not report completion at all; the other evidence still decides.
     *
     * The three-way split is the fix-round-2 correction (R2-4): a recorder that cannot find its own
     * completion fields must say so EXPLICITLY, and an explicit "unknown" must not be graded like a
     * caller who simply never spoke about completion.
     */
    readonly ran?: boolean | null | undefined;
    /** The invocation's exit status. `null` ⇒ the process died / was killed / unrecorded ⇒ inconclusive. */
    readonly exitCode?: number | null | undefined;
    /** The invocation hit its timeout. `null` ⇒ recorded as unknown ⇒ inconclusive. */
    readonly timedOut?: boolean | null | undefined;
    /** Did the transcript show the model actually attempting the shell command? */
    readonly shellAttempted: boolean;
    /** Was `--dangerously-bypass-hook-trust` in play? `true` can never yield a pass. */
    readonly bypassedTrust: boolean;
    /** From `hooks/list`. Absent ⇒ trust could not be established, which is not the same as bad. */
    readonly trustStatus?: CodexHookTrustStatus | undefined;
    /** The codex version the manifest was written against. */
    readonly recordedCodexVersion?: string | undefined;
    /** The codex version observed now. A mismatch re-asserts stale facts, so it is inconclusive. */
    readonly probedCodexVersion?: string | undefined;
}
export interface VetoProbeResult {
    readonly verdict: VetoVerdict;
    readonly trust: VetoTrust;
    readonly reason: string;
}
/** Trust axis. Derived only from the runtime's own report, never from our emitter. */
export declare function classifyTrust(status: VetoProbeEvidence['trustStatus']): VetoTrust;
/** Classify one probe run. Exhaustive; no branch falls through to a pass. */
export declare function classifyVetoProbe(e: VetoProbeEvidence): VetoProbeResult;
/**
 * Exit map (ADR-002 §5). `0` demands BOTH axes: an `armed` run whose entry is only `trust-pending`
 * exits non-zero, because the next session may not fire it.
 */
export declare function verifyExitCode(r: VetoProbeResult): 0 | 1 | 3;
/** True only for the one outcome that may print a success word (AM-17 / G-G). */
export declare function isReadyVerdict(r: VetoProbeResult): boolean;
//# sourceMappingURL=codex-hooks-verify.d.ts.map