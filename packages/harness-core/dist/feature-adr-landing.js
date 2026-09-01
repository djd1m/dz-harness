/** Pure decisions for the Step-7.5 Codex companion liveness barrier. */
export const DEFAULT_CODE_LANDING_CEILING_MS = 7_200_000;
export const CODE_LANDING_CEILING_ENV = 'DZ_FEATURE_ADR_CODE_LANDING_CEILING_MS';
export function decideCodeLandingLiveness(input) {
    const status = typeof input.companionStatus === 'string' ? input.companionStatus.trim().toLowerCase() : '';
    const elapsedMs = Number.isFinite(input.elapsedMs) ? Math.max(0, input.elapsedMs) : 0;
    const ceilingMs = Number.isFinite(input.ceilingMs) && input.ceilingMs > 0 ? input.ceilingMs : DEFAULT_CODE_LANDING_CEILING_MS;
    const live = status === 'running' || status === 'queued';
    const terminal = status === 'completed' || status === 'failed' || status === 'cancelled';
    if (live && input.recordedPidAlive === false) {
        return { verdict: 'dead-worker', reason: 'recorded-pid-absent' };
    }
    if (live && input.recordedPidAlive === true) {
        if (elapsedMs >= ceilingMs)
            return { verdict: 'inconclusive', reason: 'ceiling-exceeded' };
        return { verdict: 'coder-running', reason: 'recorded-pid-alive' };
    }
    if (live)
        return { verdict: 'inconclusive', reason: 'recorded-pid-unavailable' };
    if (terminal) {
        if (input.targetsChanged === true)
            return { verdict: 'landed', reason: 'terminal-companion' };
        if (input.targetsChanged === false) {
            if (input.reportedTouchedFiles === 0) {
                return { verdict: 'exited-without-edits', reason: 'reported-zero-touched-files' };
            }
            return { verdict: 'genuinely-not-landed', reason: 'terminal-companion' };
        }
        return { verdict: 'inconclusive', reason: 'git-evidence-unavailable' };
    }
    return {
        verdict: 'inconclusive',
        reason: status === '' ? 'companion-probe-error' : 'unparseable-companion-status',
    };
}
export function extractCodexCompanionJobId(text) {
    const match = /\bstarted in the background as (task-[a-z0-9]+(?:-[a-z0-9]+)*)\b/i.exec(String(text ?? ''));
    return match && match[1] ? match[1] : null;
}
export function parseCodeLandingLivenessSignal(text) {
    const source = String(text ?? '');
    // touched-files is OPTIONAL in the grammar: an older probe, or a state record we could not read,
    // simply omits it and the field stays null — which keeps the verdict at genuinely-not-landed
    // rather than inventing a clean exit. Absence is never evidence here.
    const match = /^CODEX-LIVENESS-SIGNAL companion=([a-z-]+) pid-alive=(true|false|unknown) targets-changed=(true|false|unknown) elapsed-ms=(\d+) ceiling-ms=(\d+) start-ms=(\d+)(?: touched-files=(\d+|unknown))?[ \t]*$/m.exec(source);
    if (!match)
        return null;
    const asTriState = (value) => value === 'true' ? true : value === 'false' ? false : null;
    return {
        companionStatus: String(match[1]),
        recordedPidAlive: asTriState(String(match[2])),
        targetsChanged: asTriState(String(match[3])),
        elapsedMs: Number(match[4]),
        ceilingMs: Number(match[5]),
        startMs: Number(match[6]),
        reportedTouchedFiles: match[7] === undefined || match[7] === 'unknown' ? null : Number(match[7]),
    };
}
//# sourceMappingURL=feature-adr-landing.js.map