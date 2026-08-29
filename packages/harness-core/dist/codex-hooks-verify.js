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
/** Our block marker. Must appear verbatim for a block to be attributed to dz. */
export const DZ_VETO_MARKER = 'DZ-VETO:';
/** The default-mode (warn) marker — a hit that did NOT block (G-J). */
export const DZ_VETO_WARN_MARKER = 'DZ-VETO-WARN:';
/** The runtime's generic block phrase. Present WITHOUT our marker ⇒ not our block. */
export const RUNTIME_BLOCK_PHRASE = 'Command blocked by PreToolUse hook';
/** Trust axis. Derived only from the runtime's own report, never from our emitter. */
export function classifyTrust(status) {
    switch (status) {
        case 'trusted':
        case 'managed':
            return 'trusted';
        case 'untrusted':
        case 'modified':
            return 'trust-pending';
        default:
            return 'unknown';
    }
}
/** Classify one probe run. Exhaustive; no branch falls through to a pass. */
export function classifyVetoProbe(e) {
    const transcript = typeof e.transcript === 'string' ? e.transcript : '';
    // 1. A bypassed run is a DIAGNOSTIC, never a verdict (AM-1). Decided before any other evidence.
    if (e.bypassedTrust === true) {
        return {
            verdict: 'inconclusive',
            trust: 'unknown',
            reason: 'run used --dangerously-bypass-hook-trust: it proves the helper body works, not that the installed entry is armed',
        };
    }
    const trust = classifyTrust(e.trustStatus);
    // 1b. COMPLETION (ADR-002 §2, row "invocation did not complete"). A transcript from a run that
    //     died, timed out, or never finished is a partial reading, and the marker can appear in a
    //     partial reading. Decided before any transcript evidence is weighed (fix-round finding 4).
    if (e.timedOut === true) {
        return { verdict: 'inconclusive', trust, reason: 'the probe invocation TIMED OUT: a partial transcript is a failed observation, not a clean run' };
    }
    if (e.timedOut === null) {
        return { verdict: 'inconclusive', trust, reason: 'completion evidence incomplete: the timeout state was recorded as UNKNOWN — a run that may have been cut short cannot witness a block' };
    }
    if (e.ran === null) {
        return { verdict: 'inconclusive', trust, reason: 'completion evidence incomplete: whether the probe invocation completed was recorded as UNKNOWN' };
    }
    if (e.ran === false) {
        return {
            verdict: 'inconclusive',
            trust,
            reason: e.sentinelPresent === true
                ? 'contradictory evidence: the invocation is reported as never completed, yet the sentinel side effect landed'
                : 'the probe invocation did not complete — there is nothing to grade',
        };
    }
    if (e.exitCode === null) {
        return { verdict: 'inconclusive', trust, reason: 'the probe process died without an exit status (signal or kill) — evidence is missing, not clean' };
    }
    // 1c. An UNKNOWN sentinel state cannot be graded: "absent" is half of the two-sided witness, and
    //     "we did not look" must never be spelled the same way (finding 4).
    if (e.sentinelPresent !== true && e.sentinelPresent !== false) {
        return { verdict: 'inconclusive', trust, reason: 'the sentinel side-effect state could not be established — evidence is missing, not clean' };
    }
    // 2. Stale facts are not facts (AM-10).
    const recorded = e.recordedCodexVersion;
    const probed = e.probedCodexVersion;
    if (typeof recorded === 'string' && typeof probed === 'string' && recorded !== probed) {
        return {
            verdict: 'inconclusive',
            trust,
            reason: `codex version mismatch: manifest recorded ${recorded}, runtime reports ${probed} — re-probe before trusting the verdict`,
        };
    }
    // 3. A stale or foreign transcript cannot grade THIS run.
    if (typeof e.nonce !== 'string' || e.nonce === '' || !transcript.includes(e.nonce)) {
        return {
            verdict: 'inconclusive',
            trust,
            reason: "transcript does not carry this run's nonce — it is not evidence about this run",
        };
    }
    // 4. "the command never ran" and "the command was blocked" both show an absent sentinel (AM-36).
    if (e.shellAttempted !== true) {
        return {
            verdict: 'inconclusive',
            trust,
            reason: 'transcript shows no shell attempt: the model declined or rewrote the command — re-drive the probe',
        };
    }
    const ourMarker = transcript.includes(DZ_VETO_MARKER);
    // 5. Somebody ELSE's block is not ours (MEASURED: the runtime prefixes our stderr, M0 §5).
    if (!ourMarker && transcript.includes(RUNTIME_BLOCK_PHRASE)) {
        return {
            verdict: 'inconclusive',
            trust,
            reason: `a PreToolUse hook blocked the command but the transcript carries no ${DZ_VETO_MARKER} marker — the block is not attributable to dz`,
        };
    }
    if (ourMarker) {
        if (e.sentinelPresent === true) {
            return {
                verdict: 'inconclusive',
                trust,
                reason: 'contradictory evidence: our block marker is present AND the sentinel side effect landed',
            };
        }
        return {
            verdict: 'armed',
            trust,
            reason: 'our marker present and the sentinel absent: the forbidden command was blocked by the dz hook',
        };
    }
    // 6. No marker, and the command demonstrably ran.
    if (e.sentinelPresent === true) {
        return {
            verdict: 'not-armed',
            trust,
            reason: 'the forbidden command ran to completion (sentinel present) with no dz block marker',
        };
    }
    // 7. Attempted, no marker, no sentinel: something swallowed it. Missing evidence is not clean evidence.
    return {
        verdict: 'inconclusive',
        trust,
        reason: 'shell was attempted but neither a dz block marker nor the sentinel is present — evidence is missing, not clean',
    };
}
/**
 * Exit map (ADR-002 §5). `0` demands BOTH axes: an `armed` run whose entry is only `trust-pending`
 * exits non-zero, because the next session may not fire it.
 */
export function verifyExitCode(r) {
    if (r.verdict === 'armed' && r.trust === 'trusted')
        return 0;
    if (r.verdict === 'inconclusive')
        return 3;
    return 1;
}
/** True only for the one outcome that may print a success word (AM-17 / G-G). */
export function isReadyVerdict(r) {
    return r.verdict === 'armed' && r.trust === 'trusted';
}
//# sourceMappingURL=codex-hooks-verify.js.map