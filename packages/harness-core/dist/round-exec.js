/** Pure parsing and classification for one `dz round exec` subprocess receipt. */
export function parseCodexTokens(logText) {
    const matches = [...logText.matchAll(/^tokens used[ \t]*\r?\n([0-9][0-9, \t]*)[ \t]*$/gmi)];
    const raw = matches.at(-1)?.[1];
    if (raw === undefined)
        return null;
    const parsed = Number(raw.replace(/[ ,\t]/g, ''));
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
export function classifyRoundExecOutcome(input) {
    if (input.timedOut)
        return 'timeout';
    if (/rate limit|usage limit|limit reached/i.test(input.tail))
        return 'session-limit';
    if (/HTTP 400|not supported when using Codex/i.test(input.tail))
        return 'model-refused';
    if (input.exitCode === 0 && input.bytes > 0) {
        const marker = input.tail.lastIndexOf('\ncodex\n');
        const finalLine = marker < 0 ? '' : input.tail.slice(marker + '\ncodex\n'.length).split(/\r?\n/, 1)[0]?.trim() ?? '';
        if (finalLine !== '')
            return 'done';
    }
    if (input.exitCode === 0 && input.bytes === 0)
        return 'empty';
    return 'failed';
}
export function buildRoundExecRow(input) {
    return {
        stage: 'round-exec',
        slug: input.slug,
        round: input.round,
        coder: `codex:${input.model}:${input.effort}`,
        minutes: input.minutes,
        tokens: input.tokens,
        agents: 1,
        outcome: input.outcome,
        exitCode: input.exitCode,
        bytes: input.bytes,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        log: input.log,
        brief: input.brief,
    };
}
//# sourceMappingURL=round-exec.js.map