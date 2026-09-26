export function decideExecClaimTakeover(input) {
    if (input.pidAlive === true)
        return { kind: 'held' };
    if (input.pid === undefined || !Number.isSafeInteger(input.pid) || input.pid <= 0) {
        return { kind: 'unknown', reason: 'no pid recorded' };
    }
    if (input.pidAlive === null)
        return { kind: 'unknown', reason: 'PID probe inconclusive' };
    const claimedMs = input.execClaimedAt === undefined ? Number.NaN : Date.parse(input.execClaimedAt);
    if (!Number.isFinite(claimedMs))
        return { kind: 'unknown', reason: 'claim time unreadable' };
    const ageMinutes = Math.floor((input.now - claimedMs) / 60_000);
    if (ageMinutes >= input.staleMinutes)
        return { kind: 'stale-dead', ageMinutes };
    return { kind: 'held' };
}
//# sourceMappingURL=round-exec-claim.js.map