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
export const CODEX_DEFAULT_TIMEOUT_MS = 600_000;
export const CODEX_PROBE_TIMEOUT_MS = 90_000;
/** Model ids this account has been seen to answer on. A name here is spellable, never available. */
export const CODEX_KNOWN_MODELS = ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'];
/** Build the argv. Exported so a test can assert the prompt never rides on the command line. */
export function codexArgv(input) {
    const argv = ['exec', '-m', input.model, '--skip-git-repo-check'];
    if (input.effort !== undefined)
        argv.push('-c', `model_reasoning_effort=${input.effort}`);
    return argv;
}
/** Turn a raw runner result into the closed outcome set. */
export function classifyCodexResult(raw, model, elapsedMs) {
    if (raw.timedOut) {
        return {
            ok: false,
            refusal: 'timeout',
            detail: `no answer within the deadline (${elapsedMs}ms); narrow the scope rather than raising the ceiling — an unscoped run spends the budget exploring`,
            model,
            elapsedMs,
        };
    }
    if (raw.status !== 0) {
        return {
            ok: false,
            refusal: 'tool-error',
            detail: `codex exited ${raw.status === null ? 'by signal' : String(raw.status)}: ${raw.stderr.trim().slice(0, 300) || '(no stderr)'}`,
            model,
            elapsedMs,
        };
    }
    const text = raw.stdout.trim();
    if (text === '') {
        // Silence is the failure this module exists to make impossible. A clean exit with nothing
        // written is what a mangled prompt looks like from the outside, and it must never read as ok.
        return {
            ok: false,
            refusal: 'no-output',
            detail: 'codex exited 0 but wrote nothing — an empty answer is a refusal, never a clean result',
            model,
            elapsedMs,
        };
    }
    return { ok: true, text, model, elapsedMs };
}
/** Compose the prompt file's content: the task, plus the scope fence when one is declared. */
export function codexPromptBody(task, scope) {
    const trimmed = String(task ?? '').trim();
    if (scope === undefined || scope.length === 0)
        return trimmed;
    const list = scope.map((p) => `- ${p}`).join('\n');
    return [
        trimmed,
        '',
        'SCOPE — read ONLY these files and do not open others. This bound is what makes an answer',
        'possible at all: an unscoped run was measured spending its entire budget exploring the tree',
        'and returning no verdict.',
        list,
    ].join('\n');
}
/** True when the outcome may be consumed as an answer. Exists so callers cannot forget the check. */
export function codexAnswered(outcome) {
    return outcome.ok === true;
}
//# sourceMappingURL=codex-invoke.js.map