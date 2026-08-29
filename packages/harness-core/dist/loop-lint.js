/**
 * `dz workflow-lint` — the layer-1 deterministic gate over Workflow loop scripts (FR-3, ADR-001).
 *
 * `lint(scriptText, {plan?, blobRegistry?, mode?}) → LintRun`. PURE — no fs (the CLI reads files).
 * Three verdicts per rule AND overall: `pass` / `fail` / `inconclusive`, and **inconclusive is
 * never a pass** (INV-13; the CLI exits 0/1/3 mirroring the consult-gate convention).
 *
 * The plan-anchored vs script-only split (architecture §5.3 — the honest scope): the hard
 * structural rules (`barrier-postdominates`, `budget-before-spawn`, `retry-idempotent`,
 * `resume-fingerprint`, `fanout-bounded` at FAIL strength, `pause-wired`, `dispatch-by-deliverable`)
 * are decidable on the PLAN graph (via `toLintProjection` — never the raw plan, AM-3). For a
 * plan-less script a full path-sensitive CFG over arbitrary JS is not honestly promisable; those
 * rules report `inconclusive` with reason `no-plan-binding` — never a silent pass.
 * Modes: `require-plan` (generated-loop CI) turns every inconclusive into a FAIL;
 * `legacy` (the two existing workflows) accepts the enumerated warn/inconclusive rows as-is.
 *
 * `barrier-postdominates` is real CFG POST-dominator analysis over the projection's synthetic
 * entry/exit (plain dominance is explicitly insufficient — Codex 04/Q1): the join must post-
 * dominate the FORK it closes, the join policy must come from the closed set, and every ACTIVATED
 * branch is an effective prerequisite (declared-but-never-dispatched branches are not required;
 * dispatched branches are never skippable).
 */
import { createHash } from 'node:crypto';
import { toLintProjection, JOIN_POLICIES, QUORUM_RE } from './loop-plan.js';
export const LINT_RULES = [
    'meta-complete',
    'phase-parity',
    'sandbox-bans',
    'shq-hygiene',
    'agent-labelled',
    'no-partial-checkpoint',
    'plan-binding',
    'blob-hash',
    'fanout-bounded',
    'barrier-postdominates',
    'budget-before-spawn',
    'retry-idempotent',
    'resume-fingerprint',
    'pause-wired',
    'dispatch-by-deliverable',
    'no-agent-outside-runstep',
    'tool-perimeter-declared',
    'size-budget',
];
/** size-budget (WARN ONLY — FR-3.10, the fa-improvements reaffirmed lesson: a blocking wc-l cap is
 * theater). Threshold chosen so both battle-grown legacy loops surface the advisory. */
export const SIZE_BUDGET_WARN_LINES = 350;
function stripComments(script) {
    // block comments, then line comments (a // preceded by start/whitespace — keeps https:// URLs
    // inside strings intact well enough for ban tokens, which never look like URLs)
    return script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}
const NO_PLAN = {
    rule: '',
    severity: 'inconclusive',
    message: 'no-plan-binding: this rule is decidable only on the plan graph; bind a sidecar plan (--plan) or run --legacy to accept the inconclusive row',
};
function noPlan(rule) {
    return [{ ...NO_PLAN, rule }];
}
// ── rule implementations (each returns findings; empty = pass) ───────────────
function ruleMetaComplete(ctx) {
    const out = [];
    if (!/export const meta\s*=\s*\{/.test(ctx.script)) {
        return [{ rule: 'meta-complete', severity: 'fail', message: 'no `export const meta = {…}` block', anchor: 'export const meta' }];
    }
    const metaText = ctx.script.slice(ctx.script.indexOf('export const meta')).slice(0, 4000);
    for (const field of ['name', 'description', 'whenToUse', 'phases']) {
        if (!new RegExp(`\\b${field}\\s*:`).test(metaText)) {
            out.push({ rule: 'meta-complete', severity: 'fail', message: `meta.${field} missing`, anchor: `meta.${field}` });
        }
    }
    return out;
}
function metaPhaseTitles(script) {
    const metaStart = script.indexOf('export const meta');
    if (metaStart === -1)
        return [];
    const phasesStart = script.indexOf('phases', metaStart);
    if (phasesStart === -1)
        return [];
    const seg = script.slice(phasesStart, script.indexOf(']', phasesStart) + 1);
    return [...seg.matchAll(/title:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
}
function rulePhaseParity(ctx) {
    const titles = metaPhaseTitles(ctx.script);
    const calls = [];
    for (const m of ctx.code.matchAll(/(?<![.\w])phase\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const p = m[1];
        if (!calls.includes(p))
            calls.push(p);
    }
    if (titles.length === 0 || calls.length === 0)
        return []; // meta-complete owns the missing-block case
    const inTitles = calls.filter((c) => titles.includes(c));
    const expectedOrder = titles.filter((t) => inTitles.includes(t));
    if (JSON.stringify(inTitles) !== JSON.stringify(expectedOrder)) {
        return [{ rule: 'phase-parity', severity: 'fail', message: `phase() first-call order [${inTitles.join(', ')}] contradicts meta.phases order [${expectedOrder.join(', ')}] (INV-7)`, anchor: `phase('${inTitles[0]}')` }];
    }
    const unknown = calls.filter((c) => !titles.includes(c));
    if (unknown.length > 0) {
        return [{ rule: 'phase-parity', severity: 'fail', message: `phase(${unknown.map((u) => `'${u}'`).join(', ')}) not listed in meta.phases (INV-7)`, anchor: `phase('${unknown[0]}')` }];
    }
    return [];
}
const SANDBOX_BANS = ['Date.now(', 'new Date', 'Math.random(', 'require(', 'process.', 'child_process'];
function ruleSandboxBans(ctx) {
    const out = [];
    for (const token of SANDBOX_BANS) {
        if (ctx.code.includes(token)) {
            out.push({ rule: 'sandbox-bans', severity: 'fail', message: `sandbox-banned token \`${token}\` in script code (INV-12 — the workflow sandbox has no clock/randomness/require/process)`, anchor: token });
        }
    }
    // fs.: property-access form only (never the prose word "fs")
    if (/(?<![\w.])fs\.[a-zA-Z]/.test(ctx.code)) {
        out.push({ rule: 'sandbox-bans', severity: 'fail', message: 'sandbox-banned `fs.*` access in script code (the agent is the fs)', anchor: 'fs.' });
    }
    return out;
}
function ruleShqHygiene(ctx) {
    const bashPrompt = /Run EXACTLY this/i.test(ctx.script);
    const hasQuoter = /function (shq|shellQuote|shqRt|traceShellQuote)\s*\(/.test(ctx.script);
    if (bashPrompt && !hasQuoter) {
        return [{ rule: 'shq-hygiene', severity: 'fail', message: 'the script builds Bash prompts but declares no shq-shaped single-quote escaper — every interpolated value must ride through one', anchor: 'Run EXACTLY this' }];
    }
    if (/sh -c ['"]\s*\+/.test(ctx.code)) {
        return [{ rule: 'shq-hygiene', severity: 'fail', message: 'ad-hoc `sh -c` string concatenation — build commands through the shq-shaped quoter', anchor: 'sh -c' }];
    }
    return [];
}
/** Split the argument text of a call starting right after `agent(` by balancing parens/braces and
 * skipping string literals. Returns the top-level comma-separated argument texts (bounded scan). */
function callArguments(code, openIdx) {
    const args = [];
    let depth = 1;
    let cur = '';
    let i = openIdx;
    let quote = null;
    const limit = Math.min(code.length, openIdx + 6000);
    for (; i < limit && depth > 0; i++) {
        const c = code[i];
        const prev = i > 0 ? code[i - 1] : '';
        if (quote !== null) {
            cur += c;
            if (c === quote && prev !== '\\')
                quote = null;
            continue;
        }
        if (c === "'" || c === '"' || c === '`') {
            quote = c;
            cur += c;
            continue;
        }
        if (c === '(' || c === '{' || c === '[')
            depth++;
        if (c === ')' || c === '}' || c === ']') {
            depth--;
            if (depth === 0)
                break;
        }
        if (c === ',' && depth === 1) {
            args.push(cur);
            cur = '';
            continue;
        }
        cur += c;
    }
    if (cur.trim() !== '')
        args.push(cur);
    return args;
}
function ruleAgentLabelled(ctx) {
    const out = [];
    let n = 0;
    for (const m of ctx.code.matchAll(/(?<![.\w])agent\(/g)) {
        const idx = (m.index ?? 0) + 'agent('.length;
        const args = callArguments(ctx.code, idx);
        const opts = args[1]?.trim();
        let bad = null;
        if (opts === undefined) {
            // Regex literals inside the argument text (e.g. `DESC.replace(/'/g, "'\\''")`) defeat the
            // string-aware splitter — an UNDECIDABLE parse is accepted, never guessed into a finding.
            const consumed = args[0] ?? '';
            if (/\.(replace|match|split|test|exec)\s*\(\s*\//.test(consumed))
                continue;
            bad = 'no opts argument at all';
        }
        else if (opts.startsWith('{')) {
            // inline object literal — label + phase must be present in it
            if (!/label\s*:/.test(opts))
                bad = 'no label in opts';
            else if (!/phase\s*:/.test(opts))
                bad = 'no phase in opts';
        }
        // an identifier opts (e.g. `agent(prompt, routerOpts)`) is statically undecidable — accepted
        // (the opts object is built upstream; a full data-flow pass is not honestly promisable here)
        if (bad !== null) {
            n++;
            if (n <= 3) {
                out.push({ rule: 'agent-labelled', severity: 'fail', message: `agent() call with ${bad}`, anchor: ctx.code.slice(m.index ?? 0, (m.index ?? 0) + 60).split('\n')[0] ?? 'agent(' });
            }
        }
    }
    if (n > 3)
        out.push({ rule: 'agent-labelled', severity: 'fail', message: `…and ${n - 3} more unlabelled agent() call(s)` });
    return out;
}
function ruleNoPartialCheckpoint(ctx) {
    const out = [];
    const writesCheckpoints = ctx.script.includes('checkpoints.jsonl') || ctx.script.includes('serializeCheckpoint(');
    const hasParallel = /(?<![.\w])parallel\(/.test(ctx.code);
    if (writesCheckpoints && hasParallel) {
        const hasNullGuard = /some\(\s*(?:function\s*\([^)]*\)\s*\{\s*return\s+[^}]*null|\([^)]*\)\s*=>\s*[^,)]*null)/.test(ctx.code) || ctx.code.includes('=== null') || ctx.code.includes('== null');
        if (!hasNullGuard) {
            out.push({ rule: 'no-partial-checkpoint', severity: 'fail', message: 'the script checkpoints results and runs parallel() but carries no null-element guard — a parallel() result holding null must never be checkpointed (seeded defect #4)', anchor: 'parallel(' });
        }
    }
    // a catch that neither logs nor rethrows — ADVISORY (warn): an empty catch on a best-effort
    // probe is an established idiom in the legacy loops; the FAIL half of this rule is the
    // parallel-null-guard above (seeded defect #4)
    for (const m of ctx.code.matchAll(/catch\s*(?:\(([^)]*)\))?\s*\{\s*\}/g)) {
        out.push({ rule: 'no-partial-checkpoint', severity: 'warn', message: 'a catch block that neither logs nor rethrows swallows a failure silently (advisory)', anchor: m[0].slice(0, 40) });
        break;
    }
    return out;
}
const HEADER_RE = /\/\/ ── LOOP-PLAN plan=loop-plan\/1 digest=sha256:([0-9a-f]{64}) exec-fp=sha256:([0-9a-f]{64}) generator=(\S+) ──/;
function rulePlanBinding(ctx, digestOfPlan) {
    const m = HEADER_RE.exec(ctx.script);
    if (ctx.plan === null)
        return noPlan('plan-binding');
    if (!m)
        return [{ rule: 'plan-binding', severity: 'fail', message: 'plan given but the script carries no LOOP-PLAN header line', anchor: 'LOOP-PLAN' }];
    if (digestOfPlan !== null && m[1] !== digestOfPlan) {
        return [{ rule: 'plan-binding', severity: 'fail', message: `header digest sha256:${m[1].slice(0, 12)}… does not match planDigest sha256:${digestOfPlan.slice(0, 12)}… — the script was rendered from a DIFFERENT plan`, anchor: 'LOOP-PLAN' }];
    }
    return [];
}
const BLOB_RE = /\/\/ ── BEGIN BLOB (\S+)@(\S+) sha256:([0-9a-f]{64}) src=(\S+) ──\n([\s\S]*?)\n\/\/ ── END BLOB \1@\2 ──/g;
function ruleBlobHash(ctx) {
    const out = [];
    for (const m of ctx.script.matchAll(BLOB_RE)) {
        const [, name, version, declaredHash, , body] = m;
        const actual = createHash('sha256').update(body, 'utf8').digest('hex');
        if (actual !== declaredHash) {
            out.push({ rule: 'blob-hash', severity: 'fail', message: `BLOB ${name}@${version} body hashes to sha256:${actual.slice(0, 12)}… but the marker declares sha256:${declaredHash.slice(0, 12)}… — the blob was hand-edited (INV-10); edit the canonical source and regenerate`, anchor: `BEGIN BLOB ${name}@${version}` });
            continue;
        }
        const reg = ctx.blobRegistry?.[name];
        if (reg && reg.contentHash !== actual) {
            out.push({ rule: 'blob-hash', severity: 'fail', message: `BLOB ${name}@${version} matches its own marker but NOT the registry (registry sha256:${reg.contentHash.slice(0, 12)}…) — stale blob; re-render`, anchor: `BEGIN BLOB ${name}@${version}` });
        }
    }
    return out;
}
/** Two-hop assignment resolution for the script-only fanout heuristic. */
function resolveAssignChain(ctx, name, hops) {
    if (hops <= 0)
        return '';
    const m = new RegExp(`(?:const|let|var)\\s+${name}\\s*=\\s*([^\\n]+)`).exec(ctx.code);
    if (!m)
        return '';
    const rhs = m[1];
    const base = /^([A-Za-z_$][\w$]*)/.exec(rhs.trim());
    const deeper = base && base[1] !== name ? resolveAssignChain(ctx, base[1], hops - 1) : '';
    return rhs + '\n' + deeper;
}
function ruleFanoutBounded(ctx) {
    const out = [];
    if (ctx.projection) {
        for (const pair of ctx.projection.forkJoinPairs) {
            if (pair.maxFanout < 1 || pair.registrySize === 0) {
                out.push({ rule: 'fanout-bounded', severity: 'fail', message: `fanout ${pair.fork}: unbounded (maxFanout=${pair.maxFanout}, registry size ${pair.registrySize}) — a fanout without maxFanout>=1 AND a non-empty registry is a hard FAIL (INV-2)`, anchor: pair.fork });
            }
        }
    }
    // script-only heuristic (K7 — WARN, never FAIL): args-derived .map( into parallel( with no cap
    for (const m of ctx.code.matchAll(/parallel\(\s*([A-Za-z_$][\w$]*)\s*[),]/g)) {
        const arg = m[1];
        const chain = resolveAssignChain(ctx, arg, 3);
        if (!chain.includes('.map('))
            continue;
        const argsDerived = /\b(?:A|args)\s*\.|\bargs\b/.test(chain);
        const capped = /slice\(\s*0\s*,|maxFanout/i.test(chain);
        const suppressed = ctx.script.includes('// loop-lint: fanout-bound');
        if (argsDerived && !capped && !suppressed) {
            out.push({ rule: 'fanout-bounded', severity: 'warn', message: `parallel(${arg}) fans out over an args-derived .map( with no visible cap — bound it (slice(0, maxFanout)) or annotate \`// loop-lint: fanout-bound <expr>\``, anchor: `parallel(${arg})` });
        }
    }
    for (const m of ctx.code.matchAll(/parallel\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)\.map\(/g)) {
        const base = m[1].split('.')[0];
        const chain = base + '\n' + resolveAssignChain(ctx, base, 3);
        const argsDerived = /\b(?:A|args)\s*\./.test(chain) || base === 'A' || base === 'args';
        const capped = /slice\(\s*0\s*,|maxFanout/i.test(String(m[0]) + chain);
        const suppressed = ctx.script.includes('// loop-lint: fanout-bound');
        if (argsDerived && !capped && !suppressed) {
            out.push({ rule: 'fanout-bounded', severity: 'warn', message: `parallel(${m[1]}.map(…)) fans out over args-derived data with no visible cap`, anchor: `parallel(${m[1]}.map(` });
        }
    }
    if (ctx.projection === null && out.length === 0) {
        // plan half undecidable, script half clean → the FAIL-strength half is inconclusive
        return noPlan('fanout-bounded');
    }
    return out;
}
// ── post-dominator analysis (the load-bearing rule) ──────────────────────────
function successors(projection) {
    const succ = new Map();
    for (const n of projection.nodes)
        succ.set(n, []);
    for (const e of projection.edges) {
        const arr = succ.get(e.from) ?? [];
        arr.push(e.to);
        succ.set(e.from, arr);
    }
    return succ;
}
/** Classic iterative post-dominator computation over the projection CFG (exit post-dominates all). */
export function postDominators(projection) {
    const succ = successors(projection);
    const nodes = projection.nodes;
    const pdom = new Map();
    for (const n of nodes)
        pdom.set(n, n === 'exit' ? new Set(['exit']) : new Set(nodes));
    let changed = true;
    while (changed) {
        changed = false;
        for (const n of nodes) {
            if (n === 'exit')
                continue;
            const succs = succ.get(n) ?? [];
            let inter = null;
            for (const s of succs) {
                const sd = pdom.get(s) ?? new Set();
                if (inter === null) {
                    inter = new Set(sd);
                }
                else {
                    const cur = inter;
                    inter = new Set([...cur].filter((x) => sd.has(x)));
                }
            }
            const next = new Set(inter ?? []);
            next.add(n);
            const prev = pdom.get(n) ?? new Set();
            if (next.size !== prev.size || [...next].some((x) => !prev.has(x))) {
                pdom.set(n, next);
                changed = true;
            }
        }
    }
    return pdom;
}
/** Plain (forward) dominators — kept ONLY as the mutation seam for AM-1's weakening entry
 * (`barrier-postdominates-weakened-to-dominance`): swapping the call site to this function is the
 * registered mutation, and the discrimination seed must then go green (proving the gate measures
 * the analysis, not the rule's registration). Never called in production. */
export function dominators(projection) {
    const pred = new Map();
    for (const n of projection.nodes)
        pred.set(n, []);
    for (const e of projection.edges) {
        const arr = pred.get(e.to) ?? [];
        arr.push(e.from);
        pred.set(e.to, arr);
    }
    const nodes = projection.nodes;
    const dom = new Map();
    for (const n of nodes)
        dom.set(n, n === 'entry' ? new Set(['entry']) : new Set(nodes));
    let changed = true;
    while (changed) {
        changed = false;
        for (const n of nodes) {
            if (n === 'entry')
                continue;
            const preds = pred.get(n) ?? [];
            let inter = null;
            for (const p of preds) {
                const pd = dom.get(p) ?? new Set();
                if (inter === null) {
                    inter = new Set(pd);
                }
                else {
                    const cur = inter;
                    inter = new Set([...cur].filter((x) => pd.has(x)));
                }
            }
            const next = new Set(inter ?? []);
            next.add(n);
            const prev = dom.get(n) ?? new Set();
            if (next.size !== prev.size || [...next].some((x) => !prev.has(x))) {
                dom.set(n, next);
                changed = true;
            }
        }
    }
    return dom;
}
function ruleBarrierPostdominates(ctx) {
    if (ctx.projection === null)
        return noPlan('barrier-postdominates');
    const out = [];
    const pdom = postDominators(ctx.projection);
    for (const pair of ctx.projection.forkJoinPairs) {
        if (pair.join === '') {
            out.push({ rule: 'barrier-postdominates', severity: 'fail', message: `fork ${pair.fork} has no join — a parallel region without a barrier is unclosable`, anchor: pair.fork });
            continue;
        }
        const policyOk = JOIN_POLICIES.includes(pair.policy) || QUORUM_RE.test(pair.policy);
        if (!policyOk) {
            out.push({ rule: 'barrier-postdominates', severity: 'fail', message: `join ${pair.join}: policy "${pair.policy}" is not from the closed set`, anchor: pair.join });
        }
        // (a) the join POST-dominates the fork it closes — plain dominance of a consumer is NOT enough
        const forkPdom = pdom.get(pair.fork) ?? new Set();
        if (!forkPdom.has(pair.join)) {
            out.push({ rule: 'barrier-postdominates', severity: 'fail', message: `join ${pair.join} does NOT post-dominate fork ${pair.fork} — a path exits the region without passing the barrier (plain dominance is insufficient)`, anchor: pair.fork });
        }
        // (c) every activated branch is an effective prerequisite of the join
        for (const b of pair.branches) {
            const bPdom = pdom.get(b) ?? new Set();
            if (!bPdom.has(pair.join)) {
                out.push({ rule: 'barrier-postdominates', severity: 'fail', message: `activated branch ${b} can bypass join ${pair.join} — a dispatched branch is never skippable`, anchor: b });
            }
        }
    }
    return out;
}
function ruleBudgetBeforeSpawn(ctx) {
    if (ctx.projection === null)
        return noPlan('budget-before-spawn');
    const out = [];
    for (const f of ctx.projection.facts) {
        if ((f.kind === 'agent' || f.kind === 'fanout') && (f.budgetMaxAgents === null || f.budgetMaxAgents < 1)) {
            out.push({ rule: 'budget-before-spawn', severity: 'fail', message: `step ${f.id} declares no budget.maxAgents — every spawn path needs a budget guard, and retries consume budget`, anchor: f.id });
        }
    }
    // script cross-check: the generated guard must exist when the script came from a plan
    if (out.length === 0 && !ctx.code.includes('__spendBudget(')) {
        out.push({ rule: 'budget-before-spawn', severity: 'fail', message: 'plan-bound script carries no __spendBudget guard on the spawn path', anchor: '__spendBudget(' });
    }
    return out;
}
function ruleRetryIdempotent(ctx) {
    if (ctx.projection === null)
        return noPlan('retry-idempotent');
    const out = [];
    for (const f of ctx.projection.facts) {
        if (f.maxAttempts > 1 && !f.idempotent) {
            out.push({ rule: 'retry-idempotent', severity: 'fail', message: `step ${f.id}: maxAttempts ${f.maxAttempts} > 1 on a non-idempotent step (INV-4; maxAttempts includes the initial attempt)`, anchor: f.id });
        }
    }
    return out;
}
function ruleResumeFingerprint(ctx) {
    const hasResume = ctx.script.includes('checkpoints.jsonl');
    if (!hasResume) {
        return ctx.projection === null ? [] : []; // no resume machinery — nothing to check
    }
    const referencesFp = /EXEC_FP|exec-fp|execFingerprint|execFp/.test(ctx.script);
    if (referencesFp)
        return [];
    if (ctx.projection !== null) {
        return [{ rule: 'resume-fingerprint', severity: 'fail', message: 'plan-bound script resumes on inputHash alone — the resume guard must include the FULL execution fingerprint (topology+prompts+models+tools, FR-1.6/AM-10)', anchor: 'checkpoints.jsonl' }];
    }
    return [{ rule: 'resume-fingerprint', severity: 'warn', message: 'legacy resume guard hashes inputs (CKPT_SCHEMA_VERSION + inputHash) but not the full execution fingerprint (topology+prompts+models+tools) — a model/prompt edit alone will not invalidate a resume', anchor: 'checkpoints.jsonl' }];
}
function rulePauseWired(ctx) {
    if (ctx.projection === null)
        return noPlan('pause-wired');
    const out = [];
    for (const p of ctx.projection.pauses) {
        const returned = ctx.script.includes(`'${p.state}'`) || ctx.script.includes(`"${p.state}"`);
        const resumeRead = ctx.code.includes(`A['${p.resumeArg}']`) || ctx.code.includes(`A["${p.resumeArg}"]`) || ctx.code.includes(`A.${p.resumeArg}`) || ctx.code.includes(`args.${p.resumeArg}`);
        if (!returned)
            out.push({ rule: 'pause-wired', severity: 'fail', message: `declared pause state "${p.state}" is returned nowhere in the script (INV-5)`, anchor: p.state });
        if (!resumeRead)
            out.push({ rule: 'pause-wired', severity: 'fail', message: `pause "${p.state}": resumeArg "${p.resumeArg}" is read nowhere — a re-invoke could never resume`, anchor: p.resumeArg });
    }
    return out;
}
function ruleDispatchByDeliverable(ctx) {
    if (ctx.projection === null) {
        // script-only: the wrapper's presence is not a violation by itself (a file deliverable behind
        // the landed barrier is the legitimate use) — undecidable without the plan
        return ctx.script.includes('codex-rescue') ? noPlan('dispatch-by-deliverable') : [];
    }
    const out = [];
    for (const f of ctx.projection.facts) {
        if (f.deliverable === 'return-value' && f.dispatch === 'codex-wrapper') {
            out.push({ rule: 'dispatch-by-deliverable', severity: 'fail', message: `step ${f.id}: return-value deliverable routed to the fire-and-forget wrapper — its stub return would read as a clean result (INV-8)`, anchor: f.id });
        }
    }
    return out;
}
function ruleNoAgentOutsideRunstep(ctx) {
    const declaresRunStep = /async function runStep\s*\(/.test(ctx.script);
    if (!declaresRunStep) {
        // legacy/hand-written script — the choke-point contract only binds generated loops
        return ctx.projection === null ? noPlan('no-agent-outside-runstep') : [{ rule: 'no-agent-outside-runstep', severity: 'fail', message: 'plan-bound script declares no runStep choke point — every agent() call must ride through it', anchor: 'runStep' }];
    }
    const out = [];
    // find the runStep body extent (brace matching from its declaration)
    const start = ctx.script.search(/async function runStep\s*\(/);
    let depth = 0;
    let i = ctx.script.indexOf('{', start);
    let end = i;
    for (; i < ctx.script.length; i++) {
        const c = ctx.script[i];
        if (c === '{')
            depth++;
        if (c === '}') {
            depth--;
            if (depth === 0) {
                end = i;
                break;
            }
        }
    }
    for (const m of ctx.script.matchAll(/(?<![.\w])agent\(/g)) {
        const idx = m.index ?? 0;
        if (idx >= start && idx <= end)
            continue; // inside runStep
        const lineStart = ctx.script.lastIndexOf('\n', idx) + 1;
        const lineEnd = ctx.script.indexOf('\n', idx);
        const line = ctx.script.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
        if (line.includes('loop-lint: infra-agent'))
            continue; // marked infra (trace flush / ckpt write)
        if (line.includes('runStep('))
            continue; // a thunk handed TO runStep — the choke point wraps it
        const commentAt = line.indexOf('//');
        if (commentAt !== -1 && lineStart + commentAt < idx)
            continue; // prose mention in a comment
        out.push({ rule: 'no-agent-outside-runstep', severity: 'fail', message: 'agent() call outside the runStep choke point (and not marked `// loop-lint: infra-agent`) — it would escape seq/retry/budget/checkpoint discipline', anchor: line.trim().slice(0, 80) });
    }
    return out;
}
/** The `<server>:<capability>` grammar a declared perimeter entry must match (ADR-002 §1). Two or
 * more colon-separated lowercase segments — a bare `gitlab` names a server with no capability and
 * is exactly the shape that reads as "everything on that server". */
export const TOOL_PERIMETER_ENTRY_RE = /^[a-z][a-z0-9-]*(:[a-z][a-z0-9-]*)+$/;
/**
 * `tool-perimeter-declared` (cfr-pipeline ADR-002) — every DISPATCHING step (`agent`|`gate`)
 * declares its MCP tool perimeter, well-formed and without duplicates, and the rendered contract
 * line agrees with the declared array.
 *
 * GENERIC by construction: it knows nothing about GitLab, Jira, Wiki or JSM — only that a
 * dispatching step must SAY what it may touch. **Absence FLAGS: silence is never permission.**
 * `tools: []` is the correct, meaningful declaration for a step that touches no external tool.
 *
 * SEVERITY IS STAGED (checkpoint amendment 2, overriding ADR-002 §Rationale-5's FAIL-everywhere
 * stance): WARN by default, FAIL only under `--require-plan`. That keeps the published 0.4.x lint
 * contract of harness-core/harness-cli non-breaking while still making the rule a hard gate
 * exactly where cfr-pipeline runs it. Plan-less scripts report `inconclusive` (`no-plan-binding`)
 * like every other plan-anchored rule — never a silent pass.
 */
function ruleToolPerimeterDeclared(ctx) {
    if (ctx.projection === null)
        return noPlan('tool-perimeter-declared');
    const sev = ctx.mode === 'require-plan' ? 'fail' : 'warn';
    const out = [];
    for (const f of ctx.projection.facts) {
        if (f.kind !== 'agent' && f.kind !== 'gate')
            continue;
        if (f.tools === null) {
            out.push({ rule: 'tool-perimeter-declared', severity: sev, message: `dispatching step ${f.id} declares no \`tools\` perimeter — absence FLAGS: silence is never permission (declare \`tools: []\` if the step touches no external tool)`, anchor: f.id });
            continue;
        }
        const seen = new Set();
        for (const entry of f.tools) {
            if (!TOOL_PERIMETER_ENTRY_RE.test(entry)) {
                out.push({ rule: 'tool-perimeter-declared', severity: sev, message: `step ${f.id}: tool perimeter entry "${entry}" does not match <server>:<capability> (${String(TOOL_PERIMETER_ENTRY_RE)}) — a malformed entry cannot be matched against a real server inventory`, anchor: f.id });
            }
            if (seen.has(entry)) {
                out.push({ rule: 'tool-perimeter-declared', severity: sev, message: `step ${f.id}: tool perimeter entry "${entry}" is declared twice — a duplicate hides a copy/paste of the wrong stage's perimeter`, anchor: f.id });
            }
            seen.add(entry);
        }
        // script cross-check: the rendered contract line must agree with the DECLARED array — a plan
        // edit that never re-rendered would otherwise pass on the plan half alone.
        if (f.tools.length > 0) {
            const expected = 'declared MCP tool allowlist (plan tools): ' + f.tools.join(', ') + ' — use NOTHING outside it.';
            if (!ctx.script.includes(expected)) {
                out.push({ rule: 'tool-perimeter-declared', severity: sev, message: `step ${f.id}: the rendered script carries no contract line matching the declared perimeter [${f.tools.join(', ')}] — the script is stale against the plan, or the perimeter is decorative`, anchor: f.id });
            }
        }
    }
    return out;
}
function ruleSizeBudget(ctx) {
    const n = ctx.lines.length;
    if (n > SIZE_BUDGET_WARN_LINES) {
        return [{ rule: 'size-budget', severity: 'warn', message: `${n} lines > ${SIZE_BUDGET_WARN_LINES} advisory budget — consider splitting phases or moving judgment into skills (WARN only, never blocking — FR-3.10)`, anchor: 'wc -l' }];
    }
    return [];
}
export function lint(scriptText, opts = {}) {
    const mode = opts.mode ?? 'default';
    const plan = opts.plan ?? null;
    const ctx = {
        script: scriptText,
        code: stripComments(scriptText),
        lines: scriptText.split('\n'),
        plan,
        projection: plan === null ? null : toLintProjection(plan),
        blobRegistry: opts.blobRegistry ?? null,
        mode,
    };
    const findings = [];
    const rules = {};
    const run = (id, fn) => {
        const fs = fn();
        let sev = 'pass';
        for (const f of fs) {
            findings.push(f);
            if (f.severity === 'fail')
                sev = 'fail';
            else if (f.severity === 'inconclusive' && sev !== 'fail')
                sev = 'inconclusive';
            else if (f.severity === 'warn' && sev === 'pass')
                sev = 'warn';
        }
        rules[id] = sev;
    };
    run('meta-complete', () => ruleMetaComplete(ctx));
    run('phase-parity', () => rulePhaseParity(ctx));
    run('sandbox-bans', () => ruleSandboxBans(ctx));
    run('shq-hygiene', () => ruleShqHygiene(ctx));
    run('agent-labelled', () => ruleAgentLabelled(ctx));
    run('no-partial-checkpoint', () => ruleNoPartialCheckpoint(ctx));
    run('plan-binding', () => rulePlanBinding(ctx, opts.planDigestValue ?? null));
    run('blob-hash', () => ruleBlobHash(ctx));
    run('fanout-bounded', () => ruleFanoutBounded(ctx));
    run('barrier-postdominates', () => ruleBarrierPostdominates(ctx));
    run('budget-before-spawn', () => ruleBudgetBeforeSpawn(ctx));
    run('retry-idempotent', () => ruleRetryIdempotent(ctx));
    run('resume-fingerprint', () => ruleResumeFingerprint(ctx));
    run('pause-wired', () => rulePauseWired(ctx));
    run('dispatch-by-deliverable', () => ruleDispatchByDeliverable(ctx));
    run('no-agent-outside-runstep', () => ruleNoAgentOutsideRunstep(ctx));
    run('tool-perimeter-declared', () => ruleToolPerimeterDeclared(ctx));
    run('size-budget', () => ruleSizeBudget(ctx));
    const severities = Object.values(rules);
    let verdict;
    if (severities.includes('fail'))
        verdict = 'fail';
    else if (severities.includes('inconclusive')) {
        // INV-13: inconclusive is NEVER a pass. require-plan hardens it to fail; legacy ACCEPTS the
        // enumerated rows as the known honest gap of a plan-less script (still reported, never hidden).
        verdict = mode === 'require-plan' ? 'fail' : mode === 'legacy' ? 'pass' : 'inconclusive';
    }
    else
        verdict = 'pass';
    return { verdict, mode, findings, rules };
}
/** CLI exit-code convention (mirrors consult-gate: 0 pass / 1 fail / 3 inconclusive). */
export function lintExitCode(run) {
    return run.verdict === 'pass' ? 0 : run.verdict === 'fail' ? 1 : 3;
}
//# sourceMappingURL=loop-lint.js.map