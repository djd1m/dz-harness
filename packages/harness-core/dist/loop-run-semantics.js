/**
 * `loop-run-semantics` — the ONE home of loop-designer's ENACTMENT DECISIONS (feature
 * dz-workflow-run, ADR-001 W4).
 *
 * Before this module these semantics existed ONLY as template strings inside
 * `loop-render.ts:renderRuntime` — readable by the generated Claude-host script and by nobody
 * else. A second enactor (`dz workflow run`) would have had to COPY them, and two copies of a
 * gate-verdict grammar is exactly how a runner comes to synthesize a pass the render would have
 * refused. So the decisions move here once and are consumed twice:
 *   • the generated script gets them as a BLOB (`scripts/gen-loop-blobs.mjs`, blob `loop-semantics`,
 *     always on — the base runtime references errText/classifyFailure in every script);
 *   • the dz runner imports them directly.
 * "Imported, not copied" stops being an intention and becomes a fact a test can check.
 *
 * SCOPE, honestly (ADR-001 names it): what moves is DECISION semantics. `__drainAll`,
 * `runStep` and `__settleStep` do NOT move — they are HOST-STRUCTURAL (they wrap the sandbox's
 * `parallel()`/`agent()` and its settle discipline); the runner has its own structured concurrency
 * and its own settle path.
 *
 * BLOB-SOURCE DISCIPLINE (same rule as `loop-trace.ts`): this module has NO RUNTIME IMPORT — its
 * single `import type` is erased at compile time, so the generator can slice declarations out of it
 * with no import to resolve. The generator's INV-12 output ban (fs / clock / randomness / process)
 * holds here by construction: every function below is pure.
 *
 * One consequence of that discipline is visible in the signatures: the six BLOB-EXPORTED functions
 * may not mention an IMPORTED type by bare name (the slicer would see an unresolvable cross-file
 * reference and fail closed), so `classifyFailure` spells its return type as the inline import type
 * `import('./loop-plan.js').FailureClass`. It is the SAME closed enum — one domain, not a restated
 * copy — written in the one form the slicer can carry.
 */
/** Blob version stamp read by scripts/gen-loop-blobs.mjs. */
export const LOOP_RUN_SEMANTICS_BLOB_VERSION = '1.0.0';
/**
 * TOTAL error-to-text (the ha-consilium 5b totality lesson): the writer's own settle event must
 * survive a hostile error object. `String(err)` throws on a null-prototype object and a throwing
 * `.message` getter throws on access — both are caught here, so rendering a message can never
 * replace the original failure or lose the settle. `.message` is read ONCE into a local (a one-shot
 * getter answered the `typeof` probe and vanished on the value read — snapshot-once defeats it).
 */
export function errText(err) {
    try {
        if (err !== null && typeof err === 'object') {
            const m = err.message;
            if (typeof m === 'string')
                return m;
        }
        return String(err);
    }
    catch (_e) {
        try {
            return Object.prototype.toString.call(err);
        }
        catch (_e2) {
            return '[unrenderable error]';
        }
    }
}
/**
 * The `err.cause` chain, bounded (depth 5), cycle-safe and getter-safe. The standard Node fetch
 * shape `TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })` hides its real class one
 * link down, so classification must see the whole chain, not the outermost error.
 */
export function causeChain(err) {
    const chain = [];
    let cur = err;
    for (let d = 0; d < 5; d++) {
        if (cur === null || cur === undefined)
            break;
        if (chain.indexOf(cur) !== -1)
            break; // cycle-safe
        chain.push(cur);
        try {
            cur = typeof cur === 'object' ? cur.cause : undefined;
        }
        catch (_e) {
            cur = undefined; // getter-safe
        }
    }
    return chain.length > 0 ? chain : [err];
}
/**
 * ONE snapshot PER FAILURE. The earlier shape snapshotted `.message` once per `errText` CALL, not
 * once per failure — so logging read it, classification read it AGAIN, and a one-shot `.message`
 * getter answered the log and defeated the classifier (2 getter reads, 1 attempt, MEASURED). The
 * catch site builds this snapshot once; the log line and the classifier both consume the SNAPSHOT,
 * so `.code` / `.name` / `.message` are each read exactly once per failure, over the whole chain.
 */
export function errSnap(err) {
    const chain = causeChain(err);
    const snap = [];
    for (let ci = 0; ci < chain.length; ci++) {
        let code = null;
        try {
            const c = chain[ci] !== null && typeof chain[ci] === 'object' ? chain[ci].code : null;
            code = typeof c === 'string' ? c.toUpperCase() : null;
        }
        catch (_e) {
            code = null;
        }
        let name = null;
        try {
            const n = chain[ci] !== null && typeof chain[ci] === 'object' ? chain[ci].name : null;
            name = typeof n === 'string' ? n : null;
        }
        catch (_e) {
            name = null;
        }
        snap.push({ code: code, name: name, text: errText(chain[ci]) });
    }
    return snap;
}
/**
 * The CLOSED failure classification of `loop-plan/1` (timeout | transport | malformed-output |
 * policy-refusal). THREE TIERS over the whole cause chain, strongest first:
 *   1. error CODE — works on non-Error shapes like `{code:'ECONNRESET'}`, never message-dependent
 *      (`ETIMEDOUT` is a TRANSPORT code; an earlier message regex captured it as 'timeout' first);
 *   2. error NAME — `SyntaxError` = parsing the model's output failed → malformed-output;
 *   3. message patterns, DISJOINT by precedence transport > policy-refusal > malformed-output >
 *      timeout, every alternative WORD-BOUNDED (an unbounded `rate.?limit` matched
 *      'delibeRATE LIMITation' — a substring must never smuggle a class).
 * `outcome: 'null'` (a dead/empty agent) is a delivery failure ⇒ `transport`, retryable ONLY under
 * `retryOn: ['transport']`. An UNCLASSIFIABLE failure returns null and is NEVER retried.
 */
export function classifyFailure(outcome, snap) {
    if (outcome === 'null')
        return 'transport';
    const links = Array.isArray(snap) ? snap : [];
    for (let ci = 0; ci < links.length; ci++) {
        const code = links[ci].code;
        if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EPIPE' || code === 'ECONNABORTED' || code === 'EAI_AGAIN')
            return 'transport';
    }
    for (let ci = 0; ci < links.length; ci++) {
        if (links[ci].name === 'SyntaxError')
            return 'malformed-output';
    }
    let msg = '';
    for (let ci = 0; ci < links.length; ci++)
        msg += (ci > 0 ? '\n' : '') + links[ci].text;
    msg = msg.toLowerCase();
    // rate[ -]?limit(ed|ing|s)? is RIGHT-BOUNDED: the open 'rate.?limit' matched
    // 'rate limitation: invalid JSON' as transport — a malformed-output failure smuggled a class.
    if (/\btransport\b|\beconnreset\b|\beconnrefused\b|\benotfound\b|\bepipe\b|\betimedout\b|\bsocket hang up\b|\bnetwork error\b|\brate[ -]?limit(ed|ing|s)?\b|\boverloaded\b|\bhttp 5[0-9][0-9]\b/.test(msg))
        return 'transport';
    if (/\bpolicy\b|\brefus(e|ed|es|al|ing)\b|\bdeclin(e|ed|es|ing)\b|\bcontent filter\b|\bsafety block\b/.test(msg))
        return 'policy-refusal';
    if (/\bmalformed\b|\bunparseable\b|\bparse error\b|\binvalid json\b|\bunexpected token\b|\bunexpected end of json\b|\bschema mismatch\b/.test(msg))
        return 'malformed-output';
    if (/\btimeout\b|\btimed out\b/.test(msg))
        return 'timeout';
    return null;
}
/**
 * Gate verdict parsing — parse-NEVER-synthesize, with the EXACTLY-ONE-ENDING-LINE protocol
 * enforced: the verdict must be an ANCHORED line ("GATE: PASS" or "GATE: FAIL" alone on its line),
 * it must be the LAST non-empty line of the reply, and it must be the ONLY anchored verdict line.
 * Embedded mid-reply "GATE: PASS" text never counts, "GATE: PASS" followed by trailing prose is
 * invalid, and "GATE: FAIL … GATE: PASS" is an INVALID verdict (never a success) — routed like a
 * failure (redo / fail route), never a pass.
 */
export function gateVerdict(reply) {
    if (typeof reply !== 'string')
        return 'invalid';
    const vLines = reply.split('\n');
    const vRe = /^\s*GATE:\s*(PASS|FAIL)\s*$/;
    let vCount = 0;
    let vLast = '';
    for (let i = 0; i < vLines.length; i++) {
        if (vRe.test(vLines[i]))
            vCount++;
        if (vLines[i].trim() !== '')
            vLast = vLines[i];
    }
    const vEnd = vRe.exec(vLast);
    if (vCount !== 1 || vEnd === null)
        return 'invalid';
    return vEnd[1] === 'PASS' ? 'pass' : 'fail';
}
/**
 * The join decision — explicit policy from the closed set; a dispatched branch is never skippable.
 * `any` fails only when EVERY branch failed; `quorum:<n>` needs n non-failing branches; every other
 * policy (the `all-*` family) fails on the first failing branch. Throws with a NAMED message, which
 * the caller settles through its own single terminal exit.
 */
export function joinRegion(results, o) {
    const policy = o && o.policy ? o.policy : 'all-activated';
    const failures = [];
    for (let i = 0; i < results.length; i++) {
        if (results[i] === null || results[i] === undefined)
            failures.push(i);
    }
    if (policy === 'any') {
        if (failures.length === results.length)
            throw new Error('join ' + o.region + ': every branch failed (policy any)');
        return { ok: true, values: results, failures: failures };
    }
    const quorum = /^quorum:([1-9][0-9]*)$/.exec(policy);
    if (quorum) {
        const okN = results.length - failures.length;
        if (okN < Number(quorum[1]))
            throw new Error('join ' + o.region + ': quorum ' + quorum[1] + ' not met (' + okN + ' ok)');
        return { ok: true, values: results, failures: failures };
    }
    if (failures.length > 0)
        throw new Error('join ' + o.region + ': ' + failures.length + ' dispatched branch(es) failed under policy ' + policy + ' — a dispatched branch is never skippable');
    return { ok: true, values: results, failures: [] };
}
/**
 * THE agent-visible contract TEXT lines (ADR-001 Confirmation-5) — byte-for-byte the strings the
 * render splices after a step's USER prompt, minus the JS quoting. Both enactors assemble a step's
 * prompt from the SAME function, so a dz-hosted step and a Claude-hosted step communicate the plan's
 * declarations identically; a value-pinned wiring test compares the rendered USER-region contract
 * lines against the runner-assembled ones.
 *
 * The tools line's second sentence is not decoration — it is the honesty clause the whole feature
 * rests on: a declaration is not enforcement.
 */
export function stepContractLines(c) {
    const lines = [];
    const reads = c.reads ?? [];
    const writes = c.writes ?? [];
    const tools = c.tools ?? [];
    if (reads.length > 0)
        lines.push('declared inputs (plan artifacts.reads): ' + reads.join(', '));
    if (writes.length > 0) {
        const fileNote = (c.deliverable ?? 'return-value') === 'file' ? '; your deliverable is the written file(s), not your reply' : '';
        lines.push('declared outputs (plan artifacts.writes): ' + writes.join(', ') + ' — write them' + fileNote + '. The loop verifies they land.');
    }
    if (tools.length > 0) {
        lines.push('declared MCP tool allowlist (plan tools): ' + tools.join(', ') + ' — use NOTHING outside it. In this environment every one of these is a labeled STUB, not a live integration; enforcement lives at the MCP server, not here.');
    }
    if (c.gate !== null && c.gate !== undefined) {
        lines.push('GATE PROTOCOL (kind: ' + (c.gate.kind ?? 'gate') + '): end your reply with exactly one line "GATE: PASS" or "GATE: FAIL" — the loop PARSES this verdict and never synthesizes one.');
    }
    return lines;
}
/**
 * THE budget ceiling formula (ADR-004 Confirmation-2): declared per-step budgets PLUS the declared
 * gate-redo allowance — a plan-declared redo must be AFFORDABLE (an undeclared one still hits the
 * guard loudly). A gate whose failRoute is a `terminal:` route reserves nothing: a terminal route
 * ends the run, it does not re-run anything.
 *
 * This is the number the rendered script carries as `const __budget = { left: N }`; the runner reads
 * it from HERE, so the two enactors cannot drift into two ceilings.
 */
export function computeBudgetTotal(plan) {
    const stepBudget = plan.steps.reduce((n, s) => n + (s.budget?.maxAgents ?? 1), 0);
    const byId = new Map(plan.steps.map((s) => [s.stepId, s]));
    const gateRedoBudget = (plan.gates ?? []).reduce((n, g) => {
        const redos = typeof g.maxRedos === 'number' && Number.isFinite(g.maxRedos) && g.maxRedos > 0 ? Math.floor(g.maxRedos) : 0;
        if (redos === 0 || typeof g.failRoute !== 'string' || g.failRoute.startsWith('terminal:'))
            return n;
        return n + redos * ((byId.get(g.failRoute)?.budget?.maxAgents ?? 1) + (byId.get(g.stepId)?.budget?.maxAgents ?? 1));
    }, 0);
    return stepBudget + gateRedoBudget;
}
//# sourceMappingURL=loop-run-semantics.js.map