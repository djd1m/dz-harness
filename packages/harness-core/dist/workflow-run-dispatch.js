/**
 * `workflow-run-dispatch` — the DISPATCHER SEAM of `dz workflow run` (ADR-002 O1).
 *
 * Why a seam at all: the two runtimes disagree about almost everything that matters (stdin open vs
 * closed, envelope shape, where a deliverable appears, what a clean exit means), and the scheduler
 * must not know any of it. What it knows is: ask for a dispatch, get back a typed outcome whose
 * failure reason is a member of ONE list.
 *
 * Everything below the contract is CONVENTION — and every convention here is a MEASURED lesson, not
 * a preference. Each one is named at its definition with the observation that produced it, because
 * a convention whose reason is lost is the next thing somebody "cleans up".
 */
import { claudeProbeArgs, claudeReviewArgs, extractClaudeResult, interpretClaudeProbe } from './qe-bridge.js';
/**
 * The 4 reasons an ADAPTER may produce — the producer PARTITION of the one 22-member
 * `WF_RUN_REASONS` list (K3). There is no second taxonomy: the type stays `WfRunReason`, and this
 * array is the data a test uses to assert who is allowed to produce what. The other 18 members have
 * preflight, scheduler or state-plane producers.
 */
export const DISPATCH_REASONS = ['dispatch-timeout', 'dispatch-dead', 'prompt-over-ceiling', 'probe-failed'];
/** Measured 2026-08-12: a codex `exec` at xhigh effort needs this much wall clock at the far end of
 * its distribution. Used as the scheduler's DEFAULT per-stage timeout when the operator gives none. */
export const CODEX_EXEC_XHIGH_TIMEOUT_MS = 560_000;
/**
 * W1 — the timeout/dead discriminator, decided on the WRAPPER'S OWN FIELDS and nothing else.
 *
 * The distinction is load-bearing because the two have different retry semantics and different
 * operator meanings: a timeout says "it was still working", a dead dispatch says "nothing came
 * back". Deciding it from stderr text would make the verdict depend on a runtime's phrasing.
 *
 *   • `timedOut === true` ⇒ `timeout` — the deadline timer FIRED, full stop;
 *   • a spawn error, or `exitCode === null` WITHOUT a timeout ⇒ `dead` (the process never ran, or
 *     vanished);
 *   • anything else ⇒ `exited`, and the FAMILY parser decides. A clean exit with no parseable
 *     envelope is ALSO dead — the "spawned but mute" case — but that call belongs to the parser
 *     that knows what an envelope looks like, not to this function.
 */
export function classifyChildRun(run) {
    if (run.timedOut === true)
        return { kind: 'timeout' };
    if (run.spawnError !== null && run.spawnError !== undefined && run.spawnError !== '') {
        return { kind: 'dead', detail: run.spawnError };
    }
    if (run.exitCode === null || run.exitCode === undefined) {
        return { kind: 'dead', detail: 'the child exited with no code and the deadline never fired — it vanished' };
    }
    return { kind: 'exited', exitCode: run.exitCode };
}
// ── codexExec conventions (each one MEASURED — 02_research §5; re-measured this session) ────────
/**
 * Prepended to a RETURN-VALUE codex dispatch. Codex `exec` is an agent with a workspace, not a
 * completion endpoint: without this it will happily start reading files to answer a question whose
 * whole answer is in the prompt. Paired with `--sandbox read-only`, which makes the instruction
 * enforceable rather than advisory.
 */
export const CODEX_SCOPING_PREFIX = 'Answer directly from this prompt text alone; no commands, no files, no tools.';
/**
 * The REAL prompt ceiling for `codex exec`.
 *
 * The folk value 1200 is refuted history: it came from an era when the prompt travelled through a
 * fire-and-forget wrapper. Over-ceiling ⇒ a LOUD `prompt-over-ceiling`, never truncation — a
 * truncated prompt produces a confident answer to a question nobody asked.
 */
export const CODEX_EXEC_PROMPT_CEILING_CHARS = 24_000;
/**
 * argv for one codex dispatch. The prompt travels as ONE argv element (no shell, no quoting), and
 * `stdinText` is ALWAYS null for codex — MEASURED this session: with stdin left open, codex-cli
 * 0.148.0 prints `Reading additional input from stdin...` and waits. `< /dev/null` is not a style
 * choice; it is the difference between a 5.7 s answer and a hang.
 *
 * Return-value mode gets the scoping prefix AND `--sandbox read-only`. File mode gets NEITHER: the
 * step's whole deliverable is a file it must be able to write.
 */
export function codexExecArgv(modelId, prompt, deliverable) {
    const returnValue = (deliverable ?? 'return-value') !== 'file';
    const text = returnValue ? CODEX_SCOPING_PREFIX + '\n\n' + prompt : prompt;
    return ['exec', '-m', modelId, ...(returnValue ? ['--sandbox', 'read-only'] : []), text];
}
/** The liveness probe: an allowlist says an id is SPELLABLE, only a probe says it ANSWERS. */
export function codexProbeArgv(candidateId) {
    return ['exec', '-m', candidateId, '--sandbox', 'read-only', 'Reply with exactly: OK'];
}
/** Word-bounded `OK` on a clean exit — the `interpretClaudeProbe` twin. */
export function interpretCodexProbe(out) {
    if (out.exitCode !== 0)
        return false;
    return /\bOK\b/.test(String(out.stdout ?? ''));
}
/**
 * Best-effort token extraction from codex stderr — null when absent, NEVER 0 and never estimated.
 *
 * MEASURED (codex-cli 0.148.0, this session): the trailer is a TOTAL only —
 * `tokens used\n9,820` — with no input/output split. `wf-budget-1` has no field for a total, and
 * attributing a total to either half would be a fabrication, so this returns BOTH nulls for that
 * shape and the row's `tokensSource` stays null. The split branch below exists because some
 * builds/configs do print one; it is tested, not assumed. (Named consequence: codex runs report no
 * token counts today. That is the honest state, not a bug to paper over — see the manifest.)
 */
export function extractCodexTokens(stderr) {
    const text = String(stderr ?? '');
    const num = (raw) => {
        if (raw === undefined)
            return null;
        const n = Number(raw.replace(/[,_\s]/g, ''));
        return Number.isFinite(n) && n >= 0 ? n : null;
    };
    // Two accepted spellings per half: `input tokens: N` / `input: N tokens` and `tokens in: N`.
    const inMatch = /\binput\b[^\n\d]{0,20}([\d,_]+)|\btokens?\s+in\b[^\n\d]{0,10}([\d,_]+)/i.exec(text);
    const outMatch = /\boutput\b[^\n\d]{0,20}([\d,_]+)|\btokens?\s+out\b[^\n\d]{0,10}([\d,_]+)/i.exec(text);
    const tokensIn = inMatch === null ? null : num(inMatch[1] ?? inMatch[2]);
    const tokensOut = outMatch === null ? null : num(outMatch[1] ?? outMatch[2]);
    return { tokensIn, tokensOut };
}
/**
 * The claude `--output-format json` USAGE fields, pinned to the LIVE envelope shape.
 *
 * MEASURED this session (`claude -p --output-format json`, sonnet):
 * `usage.input_tokens = 2`, `usage.output_tokens = 4`, alongside `cache_read_input_tokens` and
 * `cache_creation_input_tokens`. Only the two plain counters are reported — cache tokens are a
 * SEPARATE dimension `wf-budget-1` has no field for, and silently folding them into `tokensIn`
 * would inflate every cached run's cost picture. Added to the architecture's export list; see the
 * manifest.
 */
export function extractClaudeUsage(stdout) {
    const env = extractClaudeResult(String(stdout ?? ''));
    if (!env.ok)
        return { tokensIn: null, tokensOut: null };
    // re-scan for the envelope object itself: extractClaudeResult hands back only the text
    const lines = String(stdout ?? '').split(/\r?\n/);
    const candidates = [String(stdout ?? '').trim(), ...lines.map((l) => l.trim())].filter((c) => c.startsWith('{') && c.endsWith('}'));
    let usage = null;
    for (const c of candidates) {
        let obj;
        try {
            obj = JSON.parse(c);
        }
        catch {
            continue;
        }
        if (obj === null || typeof obj !== 'object')
            continue;
        const u = obj['usage'];
        if (u !== null && typeof u === 'object' && !Array.isArray(u))
            usage = u;
    }
    if (usage === null)
        return { tokensIn: null, tokensOut: null };
    const pick = (k) => {
        const v = usage?.[k];
        return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
    };
    return { tokensIn: pick('input_tokens'), tokensOut: pick('output_tokens') };
}
// ── the adapter factories (pure over the injected ChildRunner) ───────────────────────────────────
function failed(family, model, wallMs, reason, detail, outcome = 'null') {
    return {
        outcome,
        text: null,
        family,
        modelUsed: model,
        wallMs,
        tokensIn: null,
        tokensOut: null,
        tokensSource: null,
        failure: { reason, detail },
    };
}
/**
 * The codex adapter. Conventions, each a Confirmation-1 assertion:
 * stdin ALWAYS closed; the prompt as one argv element; scoping prefix + `--sandbox read-only` on
 * return-value and NEITHER on file mode; `detached: true` on every spawn (AM-10).
 */
export function makeCodexExecDispatcher(run, opts) {
    const bin = opts?.bin ?? 'codex';
    const ceiling = opts?.ceilingChars ?? CODEX_EXEC_PROMPT_CEILING_CHARS;
    // A PROBE has no target tree. the current working directory is the CLI’s business — core never reaches for it,
    // which is what keeps the purity grep over this package honest.
    // The adapter CLOCKS ITSELF, through an INJECTED monotonic source. Core may not reach for a real
    // clock (that is what makes every property in this feature reproducible), so the default is a
    // fixed 0 and the CLI injects the real one; the scheduler's own delta fills in when it is 0. A
    // live probe MEASURED the un-clocked version reporting `wallMs: 0` on a 4.4 s real dispatch —
    // per-dispatch wall clock is the one thing budget.jsonl exists to carry, so a 0 there is a lie.
    const clock = opts?.monotonicMs ?? (() => 0);
    const isolatedCwd = opts?.isolatedCwd ?? (() => '.');
    return {
        probe: async (candidates) => {
            const t0 = clock();
            const list = candidates.length > 0 ? candidates : ['gpt-5.5'];
            const started = [];
            for (const id of list) {
                const r = await run(bin, codexProbeArgv(id), { stdinText: null, timeoutMs: 120_000, cwd: isolatedCwd(), detached: true });
                started.push(id);
                if (interpretCodexProbe(r))
                    return { id, wallMs: clock() - t0, detail: `codex answered on ${id}` };
            }
            return { id: null, wallMs: clock() - t0, detail: `no codex candidate answered a probe (tried: ${started.join(', ')}) — an allowlist says an id is spellable, only a probe says it answers` };
        },
        dispatch: async (req) => {
            const t0 = clock();
            if (req.prompt.length > ceiling) {
                return failed('openai', req.resolvedModelId, 0, 'prompt-over-ceiling', `assembled prompt is ${req.prompt.length} chars, over the ${ceiling}-char codex exec ceiling — refusing LOUDLY rather than truncating, because a truncated prompt produces a confident answer to a question nobody asked`, 'error');
            }
            const r = await run(bin, codexExecArgv(req.resolvedModelId, req.prompt, req.deliverable), {
                stdinText: null, // MEASURED: codex waits on an open stdin
                timeoutMs: req.timeoutMs,
                cwd: req.cwd,
                detached: true,
            });
            const cls = classifyChildRun(r);
            if (cls.kind === 'timeout')
                return failed('openai', req.resolvedModelId, req.timeoutMs, 'dispatch-timeout', `the ${req.timeoutMs}ms deadline fired on step ${req.stepId}`);
            if (cls.kind === 'dead')
                return failed('openai', req.resolvedModelId, clock() - t0, 'dispatch-dead', cls.detail);
            const text = String(r.stdout ?? '').trim();
            if (cls.exitCode !== 0 || text === '') {
                return failed('openai', req.resolvedModelId, clock() - t0, 'dispatch-dead', `codex exited ${cls.exitCode} with ${text === '' ? 'NO stdout' : String(text.length) + ' chars of stdout'} — a clean exit with nothing to read is the spawned-but-mute case, not an empty success`);
            }
            const tokens = extractCodexTokens(r.stderr);
            return {
                outcome: 'ok',
                text,
                family: 'openai',
                modelUsed: req.resolvedModelId,
                wallMs: clock() - t0,
                tokensIn: tokens.tokensIn,
                tokensOut: tokens.tokensOut,
                tokensSource: tokens.tokensIn === null && tokens.tokensOut === null ? null : 'codex-stderr',
            };
        },
    };
}
/**
 * The claude adapter. Return-value mode is the `dz qe-bridge` ISOLATION discipline verbatim:
 * `claudeReviewArgs(model)` (which carries `CLAUDE_ISOLATION_ARGS`: `--output-format json`,
 * `--safe-mode`, `--strict-mcp-config`, `--tools ''`, `--no-session-persistence`), an EMPTY temp
 * cwd so no project state leaks in, the prompt on STDIN (no ARG_MAX ceiling, no shell), and a
 * LAST-anchored envelope parse so anything a customization printed first is structurally outside
 * the reviewed text.
 *
 * File mode drops `--tools ''` and `--safe-mode` (the step's deliverable is a file it must write)
 * and runs in `req.cwd`, but keeps `--output-format json` and the envelope parse — and the
 * scheduler's landed barrier still has the last word.
 */
export function makeClaudePDispatcher(run, opts) {
    const bin = opts?.bin ?? 'claude';
    const clock = opts?.monotonicMs ?? (() => 0);
    const isolatedCwd = opts?.isolatedCwd ?? (() => '.');
    return {
        probe: async (candidates) => {
            const t0 = clock();
            const list = candidates.length > 0 ? candidates : ['sonnet'];
            const tried = [];
            for (const id of list) {
                const argv = claudeProbeArgs(id);
                tried.push(id);
                if (argv === null)
                    continue; // an unsafe id is not spellable, let alone answerable
                const r = await run(bin, argv, { stdinText: null, timeoutMs: 120_000, cwd: isolatedCwd(), detached: true });
                if (interpretClaudeProbe({ stdout: r.stdout, exitCode: r.exitCode ?? 1 }))
                    return { id, wallMs: clock() - t0, detail: `claude answered on ${id}` };
            }
            return { id: null, wallMs: clock() - t0, detail: `no claude candidate answered a probe (tried: ${tried.join(', ')})` };
        },
        dispatch: async (req) => {
            const t0 = clock();
            const fileMode = req.deliverable === 'file';
            const argv = fileMode ? claudeFileArgs(req.resolvedModelId) : claudeReviewArgs(req.resolvedModelId);
            if (argv === null) {
                return failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `model id ${JSON.stringify(req.resolvedModelId)} is not a safe claude id`);
            }
            const r = await run(bin, argv, {
                stdinText: req.prompt, // MEASURED: `printf … | claude -p` answers, so there is no ARG_MAX ceiling
                timeoutMs: req.timeoutMs,
                cwd: fileMode ? req.cwd : isolatedCwd(),
                detached: true,
            });
            const cls = classifyChildRun(r);
            if (cls.kind === 'timeout')
                return failed('claude', req.resolvedModelId, req.timeoutMs, 'dispatch-timeout', `the ${req.timeoutMs}ms deadline fired on step ${req.stepId}`);
            if (cls.kind === 'dead')
                return failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', cls.detail);
            // The EXIT CODE and the ENVELOPE must agree (Step-8 HIGH-10). A parseable success envelope
            // from a process that exited nonzero is a CONTRADICTION, not a success: the runtime told us
            // twice and the two answers differ, so believing the friendlier one is how a failed dispatch
            // becomes a green step. The codex adapter already required exit 0; this one did not.
            if (cls.exitCode !== 0) {
                return failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `claude exited ${cls.exitCode} — a nonzero exit is a failed dispatch even when stdout carries a parseable success envelope; the two disagree and the exit code is the runtime's own verdict`);
            }
            const env = extractClaudeResult(r.stdout);
            if (!env.ok) {
                return failed('claude', req.resolvedModelId, clock() - t0, 'dispatch-dead', `claude exited ${cls.exitCode} but the reply is not readable as a result envelope: ${env.detail}`);
            }
            const usage = extractClaudeUsage(r.stdout);
            return {
                outcome: 'ok',
                text: env.text,
                family: 'claude',
                modelUsed: req.resolvedModelId,
                wallMs: clock() - t0,
                tokensIn: usage.tokensIn,
                tokensOut: usage.tokensOut,
                tokensSource: usage.tokensIn === null && usage.tokensOut === null ? null : 'claude-envelope',
            };
        },
    };
}
/**
 * FILE-mode claude argv: the isolation set MINUS the two flags that would make writing impossible
 * (`--tools ''` and `--safe-mode`). Everything that makes the reply READABLE stays — the envelope
 * is how the runner tells an answer from a banner, in either mode.
 */
export function claudeFileArgs(model) {
    const review = claudeReviewArgs(model);
    if (review === null)
        return null;
    const drop = new Set(['--safe-mode']);
    const out = [];
    for (let i = 0; i < review.length; i++) {
        const a = review[i];
        if (drop.has(a))
            continue;
        if (a === '--tools' && review[i + 1] === '') {
            i++; // skip the empty allowlist value too
            continue;
        }
        out.push(a);
    }
    return out;
}
// ── ingress defang (ADR-002 Confirmation-3 — the defangSignoffEchoes pattern, retargeted) ────────
/** The neutralization marker. Visible on purpose: an operator reading a prompt must be able to SEE
 * that a quoted verdict was defanged rather than wonder why a reply looks odd. */
const GATE_QUOTED_MARKER = '[quoted-gate-verdict]';
/**
 * Neutralize anchored `GATE: PASS|FAIL` lines inside UPSTREAM text before it is spliced into a
 * DOWNSTREAM prompt.
 *
 * Why this exists as a second defence, when `gateVerdict` is already LAST-anchored: the two attacks
 * are different. The egress parser stops a single reply from smuggling a verdict past its own
 * terminal line. This stops a reply that legitimately CONTAINS a verdict — an upstream gate's own
 * answer — from becoming the terminal line of a DOWNSTREAM step's reply once the model quotes its
 * input back. Without it, "please review the previous verdict" is a working exploit against a plan
 * that never did anything wrong.
 *
 * NEUTRALIZATION, not deletion: the words survive so the downstream model can still read what the
 * upstream said. Only the ANCHORED grammar is broken. Idempotent — defanging twice is defanging
 * once, so a value that travels through three steps is not progressively mangled.
 */
export function defangGateEchoes(text) {
    return String(text ?? '').replace(GATE_ECHO_RE, (_m, lead, verdict) => `${lead}${GATE_QUOTED_MARKER} ${verdict}`);
}
/**
 * ONE grammar for both halves (Step-8 MEDIUM-12).
 *
 * The parser (`gateVerdict`) matches `/^\s*GATE:\s*(PASS|FAIL)\s*$/` — JavaScript `\s`, which
 * includes NBSP, the various Unicode spaces, and `\r`. The defanger used `[ \t]`, ASCII only. The
 * gap was demonstrable: an NBSP-prefixed `GATE: PASS` was PARSED as a verdict and NOT defanged, so
 * an upstream reply could still mint a downstream verdict by prefixing one non-breaking space.
 * `[^\S\n]` is exactly "`\s` except the line separator" — the same character class the parser sees
 * once the reply has been split into lines.
 */
const GATE_ECHO_RE = /^([^\S\n]*(?:[>*~-][^\S\n]*)*)(?:\*{0,2}#{0,4}[^\S\n]*)?GATE[^\S\n]*[:=][^\S\n]*(PASS|FAIL)[^\S\n]*$/gm;
//# sourceMappingURL=workflow-run-dispatch.js.map