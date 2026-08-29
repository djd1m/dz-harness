/**
 * loop-render — the schema-driven GENERATOR of loop-designer (ADR-002): `loop-plan/1` plan →
 * ONE region-delimited, self-contained Workflow script + a sidecar `<name>.plan.json` (the plan is
 * written BEFORE and independently of the script — FR-4.1: the oracle diff compares against an
 * artifact the renderer has not touched).
 *
 * Region contract (architecture §3.1):
 *   BLOB      — verbatim bytes from the blob registry; replaced wholesale on re-render (INV-10).
 *   GENERATED — derived from the plan; replaced wholesale (lint rule `plan-binding`).
 *   USER      — the ONLY hand-editable regions; preserved BYTE-FOR-BYTE on re-render (INV-11).
 *
 * The exec fingerprint (FR-1.6 / AM-10) hashes ALL FOUR axes independently-sensitively:
 * topology (structural plan shape) + prompts (per-step prompt text ONLY) + models (per-step
 * declared model ONLY) + tools (the declared blob set with content hashes). The axis inputs are
 * NON-REDUNDANT by construction (QE round-2 G2): no axis embeds rendered text that would let it
 * subsume another. Changing ANY ONE axis alone changes the fingerprint, so a resume against a
 * stale fingerprint is REFUSED (the generated resume-guard call site supplies this hash where the
 * legacy feature-adr call site supplies inputHash alone — physical duplication only, no canonical-
 * file change).
 *
 * Merge is propose-never-clobber (§3.2): a target with no markers is refused (write
 * `<script>.proposed.js` + require --force); a USER region whose step vanished from the plan is a
 * NAMED conflict, never silently dropped.
 *
 * Pure: no fs (the CLI does the writes), no clock, no randomness.
 */
import { createHash } from 'node:crypto';
import { normalizePlan, planDigest, stepIdent, } from './loop-plan.js';
import { BLOBS } from './loop-blobs.generated.js';
import { computeBudgetTotal, stepContractLines } from './loop-run-semantics.js';
export const LOOP_RENDER_GENERATOR = 'loop-render/1';
/** The checkpoint schema stamp — PINNED in v1 (QE round-6 narrowing: `checkpointing.schemaVersion`
 * is validated-away by ENACT-CKPT-OPT; the omitted-vs-explicit-default distinction false-flipped
 * the topology axis in round 3 and is now unrepresentable). Both the rendered runtime and the
 * fingerprint axis input carry this one constant. */
export const CKPT_SCHEMA_DEFAULT = 'loop-ckpt-1';
function sha256(s) {
    return createHash('sha256').update(s, 'utf8').digest('hex');
}
/** Which blobs a plan pulls in (opt-in subsystems + auto rules + requires closure). */
export function selectBlobs(plan) {
    const names = new Set();
    // The ENACTMENT-DECISION blob is UNCONDITIONAL (ADR-001 W4): the base runtime aliases
    // errText/errSnap/classifyFailure in every script, so there is no plan that does not need it.
    // gateVerdict/joinRegion are inert function declarations in a plan with no gate/fanout — the
    // alternative (a conditional roster) would make the exec fingerprint's `tools` axis depend on
    // plan shape twice, and would let a semantics-carrying script exist without the semantics.
    names.add('loop-semantics');
    const sub = plan.subsystems ?? {};
    if (plan.checkpointing?.enabled === true || sub.checkpoints === true)
        names.add('checkpoints');
    // AM-9: training pairs are injected ONLY on an explicit opt-in — never by default (PHI lesson).
    if (sub.trainingPairs === true)
        names.add('training-pairs');
    if (sub.usageAdaptive === true)
        names.add('usage-probes');
    if (sub.challengePanel === true)
        names.add('challenge-panel');
    if (sub.codexDispatch === true)
        names.add('codex-dispatch');
    // model-resolver is NOT a user-facing opt-in: it auto-includes whenever any step.model is set.
    if (plan.steps.some((s) => typeof s.model === 'string' && s.model !== ''))
        names.add('model-resolver');
    if (plan.trace?.emit === true)
        names.add('trace');
    // requires closure (e.g. training-pairs → checkpoints for the shared fnv helpers)
    let grew = true;
    while (grew) {
        grew = false;
        for (const n of [...names]) {
            for (const req of BLOBS[n]?.requires ?? []) {
                if (!names.has(req)) {
                    names.add(req);
                    grew = true;
                }
            }
        }
    }
    // stable roster order
    const order = Object.keys(BLOBS);
    return order.filter((n) => names.has(n)).map((n) => BLOBS[n]);
}
const B = (name, version, hash, src) => `// ── BEGIN BLOB ${name}@${version} sha256:${hash} src=${src} ──`;
const BE = (name, version) => `// ── END BLOB ${name}@${version} ──`;
const G = (label) => `// ── BEGIN GENERATED ${label} ──`;
const GE = (label) => `// ── END GENERATED ${label} ──`;
const U = (label) => `// ── BEGIN USER ${label} ──`;
const UE = (label) => `// ── END USER ${label} ──`;
function jsString(s) {
    return JSON.stringify(String(s));
}
/** Render-time single-quote shell escaping for PLAN-LITERAL paths (writes are plan data). */
function shqRender(s) {
    return "'" + String(s).replace(/'/g, "'\\''") + "'";
}
/** The landed-barrier block (QE round-3 B1): a step with declared artifacts.writes polls until
 * every declared write EXISTS (relative to TRACE_DIR), then proceeds — or fails LOUDLY. This is
 * the generic form of feature-adr's Step-7.5 codex-landed barrier: a settled dispatch is not a
 * delivered file. */
function landedBarrier(id, phase, writes, pad) {
    const testExpr = writes.map((w) => `[ -e ${shqRender(w)} ]`).join(' && ');
    return [
        `${pad}// landed barrier: the declared write(s) must EXIST before the loop proceeds (a stub or`,
        `${pad}// out-of-band writer settling early must not read as a delivered file)`,
        `${pad}{`,
        `${pad}  const probeCmd = 'cd ' + shqRt(TRACE_DIR === null ? '.' : TRACE_DIR) + ${jsString(' && ' + testExpr + ' && echo LANDED || echo NOT-LANDED')}`,
        `${pad}  let landed = false`,
        `${pad}  for (let p = 0; p < 5 && !landed; p++) {`,
        `${pad}    __agentCalls++`,
        `${pad}    const probe = await agent('Run EXACTLY this one shell command via your Bash tool and reply with ONLY its raw stdout: ' + probeCmd, { label: ${jsString('landed:' + id)}, phase: ${jsString(phase)}, effort: 'low' }) // loop-lint: infra-agent`,
        `${pad}    landed = typeof probe === 'string' && probe.indexOf('NOT-LANDED') === -1 && probe.indexOf('LANDED') !== -1`,
        `${pad}  }`,
        `${pad}  if (!landed) { await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(phase)}, outcome: 'failed', error: new Error(${jsString(`step ${id}: declared write(s) never landed (${writes.join(', ')}) — failing LOUDLY (deliverable contract)`)}) }) }`,
        `${pad}}`,
    ];
}
/** THE single USER-region emitter — top-level steps and fanout members alike. */
function stepUserLines(s) {
    const id = s.stepId;
    return [
        U(`step:${id}/body`),
        `const USER_PROMPT_${ident(id)} = ${jsString(s.prompt ?? `TODO: prompt for step ${id} (phase ${s.phase})`)}`, // no-stubs: rendered-script default prompt sentinel the author replaces (authoring cue)
        UE(`step:${id}/body`),
    ];
}
/** THE single prompt-assembly emitter: USER prompt + GENERATED artifact-contract/gate-protocol
 * lines — the plan's reads/writes/deliverable/gate declarations are COMMUNICATED to the agent
 * (enacted, not decorative) wherever the step renders. Round-4's B1 counterexample (a fanout
 * member's `artifacts.reads` silently dropped) is unrepresentable here BY CONSTRUCTION: members
 * have no separate assembly path. */
function stepPromptAssembly(s, plan) {
    const id = s.stepId;
    const lines = [];
    const gateCfg = s.kind === 'gate' ? (plan.gates ?? []).find((g) => g.stepId === id) : undefined;
    lines.push(`const P_${ident(id)} = [`);
    lines.push(`  USER_PROMPT_${ident(id)},`);
    // The contract lines themselves come from ONE function shared with the dz runner
    // (loop-run-semantics.stepContractLines, ADR-001 Confirmation-5) — the render's only remaining
    // job is JS-quoting them. ENACTS artifacts.reads/writes/deliverable, LoopStep.tools and the gate
    // protocol: the plan's declarations are COMMUNICATED to the agent in FIXED wording, so their
    // presence is greppable by a layer-1 test and IDENTICAL under both enactors.
    for (const line of stepContractLines({
        reads: s.artifacts?.reads ?? [],
        writes: s.artifacts?.writes ?? [],
        deliverable: s.deliverable ?? 'return-value',
        tools: s.tools ?? [],
        gate: s.kind === 'gate' ? { kind: gateCfg?.kind ?? 'gate' } : null,
    })) {
        lines.push(`  ${jsString(line)},`);
    }
    lines.push(`].join('\\n')`);
    return lines;
}
/** THE single dispatch-call emitter (QE round-5 B1 class-kill; NARROWED round 6): agent opts,
 * the ONE inline thunk, and runStep opts — the v1 retry profile (maxAttempts + classes; the
 * timing family is VALIDATED-AWAY, ENACT-RETRY-TIMING), model, and the causedBy settles of the
 * step's declared deps — are built HERE for top-level steps AND fanout members. A member is the
 * same step with an item binding, never a reduced projection that carries only what someone
 * remembered to copy (the round-2 G5 → round-4 initialDelayMs/reads B1 family). Codex dispatch
 * routes are validated-away (ENACT-DISPATCH), so exactly ONE thunk form exists. The
 * member-parity tests + the single-emission source guard keep this the only path. */
function stepCallExpr(s, depSettles, member) {
    const id = s.stepId;
    const optsParts = [
        member === null ? `label: ${jsString(id)}` : `label: ${jsString(id)} + ':' + it`,
        `phase: ${jsString(s.phase)}`,
    ];
    if (typeof s.model === 'string' && s.model !== '')
        optsParts.push(`model: ${jsString(s.model)}`);
    const promptExpr = member === null
        ? `P_${ident(id)}`
        : `P_${ident(id)} + '\\nitem: ' + it${member.inputExpr === null ? '' : ` + '\\ninput: ' + JSON.stringify(${member.inputExpr})`}`;
    const thunk = `() => agent(${promptExpr}, { ${optsParts.join(', ')} })`;
    // causedBy = the declared deps' settles (ONE path for both placements — round 6: member deps
    // used to be silently replaced by the positional chain entry) + the member's chain predecessor.
    const causedByEntries = depSettles.map((d) => `__settleSeqOf(${jsString(d)})`);
    if (member !== null && member.chainCausedBy !== null)
        causedByEntries.push(member.chainCausedBy);
    const runOptsParts = [
        `itemKey: ${member === null ? 'null' : 'it'}`,
        // PER-OCCURRENCE branch identity (QE round-7; Codex round-6 R2 MEASURED: with `dedup:false` and
        // registry ["x","x"], BOTH pipeline branches shared the settle slot `__settled["a\0x"]`, the
        // second settle overwrote the first, and both downstream `b` dispatches recorded causedBy=[5] —
        // the first should point at seq 4). Identity is the OCCURRENCE (index-qualified), never the
        // VALUE: two branches over the same registry value are two branches.
        `occurrence: ${member === null ? 'null' : '__ix'}`,
        // the EFFECTIVE model rides runStep opts too (QE round-7; Codex round-6 R2 MEASURED: a step
        // declaring model:"sonnet" dispatched with that agent option but traced `model:null`, because
        // the trace hook reads opts.model and only the agent opts carried it).
        `model: ${typeof s.model === 'string' && s.model !== '' ? jsString(s.model) : 'null'}`,
        `retryMaxAttempts: ${s.retry?.maxAttempts ?? 1}`,
        `retryOn: ${JSON.stringify(s.retry?.retryableFailureClasses ?? [])}`,
        `causedBy: [${causedByEntries.join(', ')}]`,
    ];
    return `runStep(${jsString(id)}, ${jsString(s.phase)}, ${thunk}, { ${runOptsParts.join(', ')} })`;
}
/** Emit the per-step GENERATED wiring + its USER region — ENACTING the plan (QE round-3 B1):
 * checkpoint consult + resume-skip + persist, gate verdict parsing with redo/fail routing, the
 * landed barrier for declared writes, dispatch routes, and artifact-contract prompt lines. A plan
 * field renderStep cannot enact is REJECTED by validatePlan (ENACT-x / KIND-1 / XREF-1 diagnostics),
 * never a silent no-op — the loop-plan-honesty enumeration test machine-checks the closure.
 * All dispatch surfaces come from the SHARED emitters above (round-5 B1). */
function renderStep(v, plan, env) {
    const s = v.step;
    const id = s.stepId;
    const lines = [];
    // USER region FIRST: `const` is block-scoped (TDZ) — the GENERATED wiring below reads it.
    lines.push(...stepUserLines(s));
    lines.push(G(`step:${id} kind=${s.kind} phase=${s.phase}`));
    lines.push(...stepPromptAssembly(s, plan));
    const writes = s.artifacts?.writes ?? [];
    const gateCfg = s.kind === 'gate' ? (plan.gates ?? []).find((g) => g.stepId === id) : undefined;
    if (s.kind === 'agent' || s.kind === 'gate') {
        const runExpr = stepCallExpr(s, v.depSettles, null);
        const ckpt = env.ckptOn && s.kind === 'agent' && !env.memberIds.has(id);
        const tp = env.tpOn;
        const isTarget = env.gateTargets.has(id);
        const needsFn = isTarget || s.kind === 'gate';
        // upstream results in the checkpoint input hash: a re-run upstream invalidates downstream
        // (only deps with a rendered r_ variable — region results are covered transitively via their
        // member steps and EXEC_FP).
        const depVars = (s.deps ?? [])
            .filter((d) => {
            const ds = plan.steps.find((x) => x.stepId === d);
            return ds !== undefined && (ds.kind === 'agent' || ds.kind === 'gate' || ds.kind === 'pause') && !env.memberIds.has(d);
        })
            .map((d) => `r_${ident(d)}`);
        const hashParts = `[P_${ident(id)}${depVars.length > 0 ? ', ' + depVars.join(', ') : ''}]`;
        const artifactRel = writes.length > 0 ? JSON.stringify(writes) : 'null';
        const tpLine = (pad, resumed) => `${pad}await __tpCapture(${jsString(id)}, ${jsString(s.phase)}, P_${ident(id)}, r_${ident(id)}, ${typeof s.model === 'string' && s.model !== '' ? jsString(s.model) : 'null'}, ${resumed ? 'true' : 'false'})`;
        // ROUND-6 B3 SHAPE: `let r_x` + (optional) dispatch-fn declaration form the await-free
        // preamble; then exactly ONE settle-routed try wraps EVERY await this step performs —
        // dispatch, landed probes, redo loop, verdict settles. A REJECTED await (the round-5 landed
        // probe hole: `await agent(...)` outside any settle-routed try ⇒ 0 flushes, 0 durable events)
        // now routes into __settleStep structurally; the shape is asserted by the structural source
        // guard in loop-render.test.ts, which beats the retired six-token list.
        lines.push(`let r_${ident(id)} = null`);
        if (needsFn) {
            // re-dispatchable form: this step is a gate, or a gate's failRoute target — the redo loop
            // re-invokes __dispatch_<id>(true) (live: a redo NEVER resumes from the checkpoint it just
            // wrote). The DECLARATION executes no await; every CALL site sits inside the try below.
            lines.push(`async function __dispatch_${ident(id)}(__live) {`);
            if (ckpt) {
                lines.push(`  const __h = __ckptInputHash(${jsString(id)}, ${hashParts})`);
                lines.push(`  if (__live !== true && __ckptResume(${jsString(id)}, __h, ${artifactRel})) {`);
                lines.push(`    r_${ident(id)} = __ckptEntries[${jsString(id)}].result`);
                lines.push(`    log(${jsString(`checkpoint: step ${id} RESUMED (fingerprint+artifact match) — dispatch skipped`)})`);
                if (tp)
                    lines.push(tpLine('    ', true));
                lines.push(`    return r_${ident(id)}`);
                lines.push(`  }`);
            }
            lines.push(`  r_${ident(id)} = await ${runExpr}`);
            if (writes.length > 0)
                lines.push(...landedBarrier(id, s.phase, writes, '  '));
            if (ckpt)
                lines.push(`  await __ckptAppend(${jsString(id)}, ${jsString(s.phase)}, __h, r_${ident(id)})`);
            if (tp)
                lines.push(tpLine('  ', false));
            lines.push(`  return r_${ident(id)}`);
            lines.push(`}`);
        }
        lines.push(`try {`);
        if (!needsFn) {
            if (ckpt) {
                lines.push(`  const __h_${ident(id)} = __ckptInputHash(${jsString(id)}, ${hashParts})`);
                lines.push(`  if (__ckptResume(${jsString(id)}, __h_${ident(id)}, ${artifactRel})) {`);
                lines.push(`    r_${ident(id)} = __ckptEntries[${jsString(id)}].result`);
                lines.push(`    log(${jsString(`checkpoint: step ${id} RESUMED (fingerprint+artifact match) — dispatch skipped`)})`);
                if (tp)
                    lines.push(tpLine('    ', true));
                lines.push(`  } else {`);
                lines.push(`    r_${ident(id)} = await ${runExpr}`);
                if (writes.length > 0)
                    lines.push(...landedBarrier(id, s.phase, writes, '    '));
                lines.push(`    await __ckptAppend(${jsString(id)}, ${jsString(s.phase)}, __h_${ident(id)}, r_${ident(id)})`);
                if (tp)
                    lines.push(tpLine('    ', false));
                lines.push(`  }`);
            }
            else {
                lines.push(`  r_${ident(id)} = await ${runExpr}`);
                if (writes.length > 0)
                    lines.push(...landedBarrier(id, s.phase, writes, '  '));
                if (tp)
                    lines.push(tpLine('  ', false));
            }
        }
        else {
            lines.push(`  await __dispatch_${ident(id)}()`);
            if (s.kind === 'gate') {
                // gate redo/fail routing (enacts plan gates[] EXACTLY: failRoute + maxRedos; absent config
                // means no redo and a loud failure — kind:'gate' is never a decorative label)
                const redos = typeof gateCfg?.maxRedos === 'number' && Number.isFinite(gateCfg.maxRedos) && gateCfg.maxRedos > 0 ? Math.floor(gateCfg.maxRedos) : 0;
                const route = typeof gateCfg?.failRoute === 'string' ? gateCfg.failRoute : null;
                const routeIsTerminal = route !== null && route.startsWith('terminal:');
                lines.push(`  let __v_${ident(id)} = __gateVerdict(r_${ident(id)})`);
                if (redos > 0 && route !== null && !routeIsTerminal) {
                    lines.push(`  let __redo_${ident(id)} = 0`);
                    lines.push(`  while (__v_${ident(id)} !== 'pass' && __redo_${ident(id)} < ${redos}) {`);
                    lines.push(`    __redo_${ident(id)}++`);
                    lines.push(`    log('gate ${id}: verdict ' + __v_${ident(id)} + ${jsString(` — redo `)} + __redo_${ident(id)} + ${jsString(`/${redos} re-dispatches failRoute ${route} (plan gates[]; checkpoints bypassed on redo)`)})`);
                    lines.push(`    await __dispatch_${ident(route)}(true)`);
                    lines.push(`    await __dispatch_${ident(id)}(true)`);
                    lines.push(`    __v_${ident(id)} = __gateVerdict(r_${ident(id)})`);
                    lines.push(`  }`);
                }
                if (routeIsTerminal) {
                    lines.push(`  if (__v_${ident(id)} !== 'pass') {`);
                    lines.push(`    // typed terminal failure route (plan gates[].failRoute) — a NAMED phase, never a silent pass; settled durably through the single exit (round-5 B3)`);
                    lines.push(`    await __ledgerAppend(${jsString(s.phase)}, ${jsString(route.slice('terminal:'.length))})`);
                    lines.push(`    return await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(s.phase)}, outcome: 'terminal', value: { phase: ${jsString(route)}, gate: ${jsString(id)}, verdict: __v_${ident(id)} } })`);
                    lines.push(`  }`);
                }
                else {
                    lines.push(`  if (__v_${ident(id)} !== 'pass') {`);
                    lines.push(`    // the flush rides INSIDE __settleStep now — a flush rejection can no longer replace the gate error (Codex R2, round-5 B3)`);
                    lines.push(`    await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(s.phase)}, outcome: 'failed', error: new Error('gate ${id} FAILED (verdict ' + __v_${ident(id)} + ') — failing the run LOUDLY (a failed or unparseable gate verdict is never a silent pass)') })`);
                    lines.push(`  }`);
                }
            }
        }
        lines.push(`} catch (__stepErr) { await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(s.phase)}, outcome: 'failed', error: __stepErr }) }`);
    }
    else if (s.kind === 'pause') {
        const pauseState = s.pauseState ?? id;
        const pause = (plan.pauses ?? []).find((p) => p.state === pauseState);
        const resumeArg = pause?.resumeArg ?? 'resume';
        lines.push(`if (A[${jsString(resumeArg)}] === undefined) {`);
        lines.push(`  // typed pause (checkpoint-return/re-invoke — never a generic interrupt): re-invoke with args.${resumeArg}; settled durably through the single exit (round-5 B3)`);
        if (pause?.payloadSchema !== undefined) {
            // enacts pauses[].payloadSchema: the pause return CARRIES the declared payload shape, so the
            // re-invoking caller sees what the resume arg must contain.
            lines.push(`  await __ledgerAppend(${jsString(s.phase)}, ${jsString(pauseState)})`);
            lines.push(`  return await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(s.phase)}, outcome: 'terminal', value: { phase: ${jsString(pauseState)}, resumeArg: ${jsString(resumeArg)}, payloadSchema: ${JSON.stringify(pause.payloadSchema)} } })`);
        }
        else {
            lines.push(`  await __ledgerAppend(${jsString(s.phase)}, ${jsString(pauseState)})`);
            lines.push(`  return await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(s.phase)}, outcome: 'terminal', value: { phase: ${jsString(pauseState)}, resumeArg: ${jsString(resumeArg)} } })`);
        }
        lines.push(`}`);
        lines.push(`const r_${ident(id)} = A[${jsString(resumeArg)}]`);
    }
    lines.push(GE(`step:${id}`));
    return lines.join('\n');
}
/** Identifier lowering is loop-plan's COLLISION-RESISTANT stepIdent (QE round-6; the round-5 third
 * class: `a-b` and `a.b` both lowered to `a_b` and the rendered script died with a redeclaration
 * SyntaxError). One implementation, shared with the IDENT-1 parse check — and IDENT-1, not the
 * lowering, is what REJECTS a colliding plan (the 8-hex suffix is not injective; QE round-7). */
const ident = stepIdent;
/** Fanout region render (QE round-5 B1 class-kill): members are STEPS with an item binding —
 * their USER region, prompt assembly (reads-contract lines included) and dispatch call all ride
 * the SAME emitters as top-level steps (stepUserLines/stepPromptAssembly/stepCallExpr). The old
 * reduced member projection (per-member agent opts + retry copied by hand) — the root cause of the
 * whole B1 family (G5 → round-4 initialDelayMs/reads) — no longer exists; the source guard in
 * loop-render.test.ts asserts no second member-emission path can reappear. Chain shape (non-empty,
 * one member under barrier, no repeats) is MEMBER-2's; member kinds are XREF-1's. */
function renderFanout(plan, fanoutStep) {
    const f = (plan.fanouts ?? []).find((x) => x.stage === fanoutStep.stepId);
    const j = (plan.joins ?? []).find((x) => x.forStage === fanoutStep.stepId);
    const chain = f?.chain ?? [];
    if (!f || !j || chain.length === 0)
        return `// (fanout ${fanoutStep.stepId}: missing fanouts/joins/chain config — validatePlan rejects this plan)`;
    const id = fanoutStep.stepId;
    const shape = fanoutStep.concurrency ?? 'barrier';
    const byId = new Map(plan.steps.map((s) => [s.stepId, s]));
    const members = chain.map((c) => byId.get(c)).filter((s) => s !== undefined);
    // a member's DECLARED deps ride its causedBy through the same depSettles path as a top-level
    // step (round 6 — they used to be silently replaced by the positional chain entry; deps
    // targeting members and member-to-member deps are validated-away, so these are outside-region).
    const memberDeps = (ms) => (ms.deps ?? []).filter((d) => byId.has(d) && !chain.includes(d));
    const lines = [];
    lines.push(G(`step:${id} kind=fanout shape=${shape} maxFanout=${f.maxFanout}`));
    for (const ms of members)
        lines.push(...stepPromptAssembly(ms, plan));
    lines.push(`const REGISTRY_${ident(id)} = ${JSON.stringify(f.registry)}`);
    // dedup (enacted — QE round-3 B1): a declared dedup DEDUPLICATES the registry before admission.
    const registryExpr = f.dedup === true ? `REGISTRY_${ident(id)}.filter(function (x, i) { return REGISTRY_${ident(id)}.indexOf(x) === i })` : `REGISTRY_${ident(id)}`;
    if (f.overflow === 'truncate') {
        const reason = f.truncateReason ?? '';
        const commentReason = reason.replace(/\r?\n/g, ' ').replace(/\*\//g, '* /');
        lines.push(`// ==================== FANOUT TRUNCATION DECLARED: ${commentReason} ====================`);
        lines.push(`const MEMBERS_${ident(id)} = ${registryExpr}.slice(0, ${f.maxFanout}) // declared truncation (INV-2b): intentionally drops registry positions beyond maxFanout`);
        lines.push(`console.error('[fanout-truncated] ${id}: ' + MEMBERS_${ident(id)}.length + ' of ' + REGISTRY_${ident(id)}.length + ' items — ' + ${jsString(reason)})`);
        lines.push(`if (__hooks.onFanoutTruncated) { __hooks.onFanoutTruncated({ stage: ${jsString(id)}, registrySize: REGISTRY_${ident(id)}.length, dispatched: MEMBERS_${ident(id)}.length, reason: ${jsString(reason)} }) }`);
    }
    else {
        lines.push(`const MEMBERS_${ident(id)} = ${registryExpr} // full registry (INV-2b): every item dispatched; maxFanout bounds CONCURRENCY, not work`);
    }
    // ROUND-6 B3 SHAPE: the region's awaits (member dispatches via parallel + the join) ride ONE
    // settle-routed try, mirroring the per-step shape. Member runStep failures settle themselves
    // durably before rejecting; the outer catch is the structural belt for the region as a whole.
    lines.push(`let R_${ident(id)} = null`);
    lines.push(`let J_${ident(id)} = null`);
    lines.push(`try {`);
    if (shape === 'pipeline') {
        // PIPELINED per-item chains inside ONE __drainAll — the discriminating render shape (§3.3):
        // dispatch(B:item1) is allocated a seq before settle(A:item3). Predecessor by POSITION (G15),
        // qualified by the branch OCCURRENCE (round 7 — duplicate registry values are distinct
        // branches, so a chain predecessor is looked up per occurrence, never per value).
        lines.push(`  R_${ident(id)} = await __drainAllWindowed(MEMBERS_${ident(id)}.map((it, __ix) => async () => {`);
        let prev = null;
        for (let ci = 0; ci < members.length; ci++) {
            const cs = members[ci];
            const call = stepCallExpr(cs, memberDeps(cs), {
                chainCausedBy: ci === 0 ? null : `__settleSeqOf(${jsString(members[ci - 1].stepId)}, it, __ix)`,
                inputExpr: prev,
            });
            lines.push(`    const v_${ident(cs.stepId)} = await ${call}`);
            prev = `v_${ident(cs.stepId)}`;
        }
        lines.push(`    return ${prev ?? 'null'}`);
        lines.push(`  }), ${f.maxFanout})`);
    }
    else {
        // BARRIER shape: all members dispatched, one join closes the region (exactly one member step —
        // MEMBER-2; extra barrier chain entries used to be silently never dispatched).
        const ms = members[0];
        const call = stepCallExpr(ms, memberDeps(ms), { chainCausedBy: null, inputExpr: null });
        lines.push(`  R_${ident(id)} = await __drainAllWindowed(MEMBERS_${ident(id)}.map((it, __ix) => () => ${call}), ${f.maxFanout})`);
    }
    lines.push(`  J_${ident(id)} = await __joinSettled(${jsString(j.stage)}, ${jsString(fanoutStep.phase)}, R_${ident(id)}, { policy: ${jsString(j.joinPolicy)}, onInvalid: ${jsString(j.onInvalid ?? 'named-failure')}, region: ${jsString(id)} })`);
    lines.push(`} catch (__stepErr) { await __settleStep({ stepId: ${jsString(id)}, phase: ${jsString(fanoutStep.phase)}, outcome: 'failed', error: __stepErr }) }`);
    lines.push(GE(`step:${id}`));
    const userLines = [];
    for (const ms of members)
        userLines.push(...stepUserLines(ms));
    return [...userLines, ...lines].join('\n');
}
/** The base runtime — emitted UNCONDITIONALLY in every rendered script (the plan's DECIDED note:
 * `runStep` is part of the base GENERATED region, never an opt-in blob; the trace/checkpoints blobs
 * attach hooks INSIDE it, and when opted out the hook sites are no-ops). */
function renderRuntime(plan, planDig, execFp, blobs) {
    const traceOn = plan.trace?.emit === true;
    const hasDeclaredTruncation = (plan.fanouts ?? []).some((f) => f.overflow === 'truncate');
    const ckptOn = plan.checkpointing?.enabled === true || plan.subsystems?.checkpoints === true;
    // budget: declared per-step budgets PLUS the declared gate-redo allowance (QE round-3 B1 — a
    // plan-declared redo must be affordable; an undeclared one still hits the guard loudly). The
    // FORMULA lives in loop-run-semantics (ADR-004 Confirmation-2) so the dz runner reserves against
    // the same ceiling this script spends against — one formula, two enactors.
    const budgetTotal = computeBudgetTotal(plan);
    const lines = [];
    lines.push(G('runtime'));
    lines.push(`const A = typeof args === 'string' ? JSON.parse(args) : (args || {})`);
    lines.push(`const PLAN_DIGEST = ${jsString(planDig)}`);
    lines.push(`const EXEC_FP = ${jsString(execFp)} // full execution fingerprint: topology+prompts+models+tools (FR-1.6)`);
    lines.push(`function shqRt(s) { return "'" + String(s).replace(/'/g, "'\\\\''") + "'" }`);
    lines.push(`const RUN_ID = (typeof A.runId === 'string' && /^[a-z0-9-]{1,40}$/.test(A.runId)) ? A.runId : 'run-1'`);
    lines.push(`const TRACE_DIR = (typeof A.traceDir === 'string' && A.traceDir.charAt(0) === '/') ? A.traceDir.replace(/\\/+$/, '') : null`);
    lines.push(`const TRACE_FILE = TRACE_DIR === null ? null : TRACE_DIR + '/trace.jsonl'`);
    lines.push(`const REPO_DIR = (typeof A.repo === 'string' && A.repo.charAt(0) === '/') ? A.repo.replace(/\\/+$/, '') : null`);
    lines.push(`const DZ_BIN = (typeof A.dz === 'string' && A.dz !== '') ? A.dz : 'dz'`);
    lines.push(`const LOOP_SLUG = ${jsString(plan.name)}`);
    lines.push(`// budget guard — spent BEFORE every spawn; retries consume budget (lint: budget-before-spawn)`);
    lines.push(`const __budget = { left: ${budgetTotal} }`);
    lines.push(`// Total agent invocations this run made — model dispatches AND infra agents. The ledger's`);
    lines.push(`// \`agents\` column means agent_count from the completion notification (ALL subagents), so the`);
    lines.push(`// automated row must count every dispatch, never the trace's model-dispatch subset (QE F1).`);
    lines.push(`let __agentCalls = 0`);
    lines.push(`let __ledgerDone = false`);
    if (traceOn)
        lines.push(`let __faLegWarned = false`);
    lines.push(`function __spendBudget(stepId) { if (__budget.left <= 0) { throw new Error('loop budget exhausted before ' + stepId) } __budget.left-- }`);
    lines.push(`const __hooks = { onDispatch: null, onSettle: null${hasDeclaredTruncation ? ', onFanoutTruncated: null' : ''} }`);
    lines.push(`const __settled = {}`);
    lines.push(`// settle identity is PER-OCCURRENCE (round-7; Codex round-6 R2: with dedup:false and a`);
    lines.push(`// duplicated registry value, two branches shared one (stepId,itemKey) slot — the second`);
    lines.push(`// settle overwrote the first and BOTH downstream dispatches recorded the LATER seq as`);
    lines.push(`// their causedBy). The occurrence INDEX (the branch's position in the capped member`);
    lines.push(`// list) qualifies the key, so each branch's causedBy points at its OWN upstream settle.`);
    lines.push(`function __settleKey(stepId, itemKey, occ) { return stepId + '\\u0000' + (itemKey == null ? '' : itemKey) + '\\u0000' + (occ == null ? '' : occ) }`);
    lines.push(`function __settleSeqOf(stepId, itemKey, occ) { const v = __settled[__settleKey(stepId, itemKey, occ)]; return typeof v === 'number' ? v : -1 }`);
    lines.push(`let __invocationN = 0`);
    lines.push(`let __seqFallback = 0 // used only when the trace blob is opted out (hooks are no-ops)`);
    lines.push(`// The enactment DECISIONS below are ALIASES onto the always-on \`loop-semantics\` blob`);
    lines.push(`// (ADR-001 W4): errText/causeChain/errSnap/classifyFailure/gateVerdict/joinRegion have ONE`);
    lines.push(`// implementation, sliced into this script from harness-core/src/loop-run-semantics.ts and`);
    lines.push(`// IMPORTED (not copied) by the dz runner. The __-prefixed names are kept so every call site`);
    lines.push(`// in this runtime reads exactly as it did when the bodies lived here.`);
    lines.push(`const __errText = errText`);
    lines.push(`const __causeChain = causeChain`);
    lines.push(`const __errSnap = errSnap`);
    lines.push(`const __classifyFailure = classifyFailure`);
    lines.push(`// __settleStep — THE single terminal exit of every step path (QE round-5 B3 class-kill;`);
    lines.push(`// round-6: SUCCESS-PATH PARITY — Codex round-5 showed __settleStep({outcome:'ok'}) returned`);
    lines.push(`// BEFORE flushing, leaving success durability on a naked phase-boundary await whose rejection`);
    lines.push(`// REPLACED the successful result with 'Error: phase flush down'). EVERY outcome now FLUSHES`);
    lines.push(`// FIRST: ok and 'terminal' (gate terminal route, pause, run epilogue) flush then return the`);
    lines.push(`// value; a failure flushes then throws the ORIGINAL error. A flush failure is ALWAYS a logged`);
    lines.push(`// SECONDARY event; it never replaces the primary outcome — success included (the ha-consilium`);
    lines.push(`// totality lesson at the flush layer).`);
    lines.push(`async function __settleStep(o) {`);
    lines.push(`  try { await __traceFlushNow(o.phase, o.stepId) } catch (_fe) { log('settle flush for ' + o.stepId + ' threw: ' + __errText(_fe) + ' — primary outcome preserved') }`);
    if (plan.subsystems?.trainingPairs === true) {
        lines.push(`  // The ONE producer of the captureFailures channel on terminal values — the four terminal call sites never carry the key, so future routes inherit it.`);
        lines.push(`  if (o.outcome === 'terminal' && o.value !== null && typeof o.value === 'object') { o.value.captureFailures = __captureFailures }`);
    }
    lines.push(`  if (o.outcome === 'failed') { throw o.error }`);
    lines.push(`  return o.value`);
    lines.push(`}`);
    lines.push(`// __phaseFlush — the TOTAL phase-boundary flush (round-6 B3): its rejection is a logged`);
    lines.push(`// secondary event, never a replaced outcome (the naked await __traceFlushNow at phase`);
    lines.push(`// boundaries was the round-5 success-replacement hole).`);
    lines.push(`async function __phaseFlush(phaseName) {`);
    lines.push(`  try { await __traceFlushNow(phaseName, null) } catch (_fe) { log('phase flush threw: ' + __errText(_fe) + ' — outcome preserved (flush failure is secondary)') }`);
    lines.push(`}`);
    lines.push(`// join failures route through the single exit too (joinRegion throws; the wrapper settles)`);
    lines.push(`async function __joinSettled(joinStepId, phaseName, results, o) {`);
    lines.push(`  try { return joinRegion(results, o) } catch (err) { return await __settleStep({ stepId: joinStepId, phase: phaseName, outcome: 'failed', error: err }) }`);
    lines.push(`}`);
    lines.push(`// runStep — the SINGLE choke point (every agent() call rides through here; lint:`);
    lines.push(`// no-agent-outside-runstep). Round-5 B3: a THIN wrapper — every outcome (the settled value`);
    lines.push(`// OR any throw out of the attempt loop, __spendBudget included) routes through __settleStep;`);
    lines.push(`// no step path can exit around the durable settle.`);
    lines.push(`async function runStep(stepId, phaseName, thunk, o) {`);
    lines.push(`  let __v`);
    lines.push(`  try { __v = await __runStepAttempts(stepId, phaseName, thunk, o) }`);
    lines.push(`  catch (err) { return await __settleStep({ stepId: stepId, phase: phaseName, outcome: 'failed', error: err }) }`);
    lines.push(`  return await __settleStep({ stepId: stepId, phase: phaseName, outcome: 'ok', value: __v })`);
    lines.push(`}`);
    lines.push(`// the attempt loop. Order per invocation attempt: budget → seq(dispatch) → call`);
    lines.push(`// → seq(settle) → retry decision. seq allocation and the call are the SAME synchronous`);
    lines.push(`// statement pair — never separable by an async write (AM-2).`);
    lines.push(`async function __runStepAttempts(stepId, phaseName, thunk, o) {`);
    lines.push(`  const opts = o || {}`);
    lines.push(`  const maxAttempts = typeof opts.retryMaxAttempts === 'number' && opts.retryMaxAttempts >= 1 ? opts.retryMaxAttempts : 1 // INCLUDES the initial attempt (parse-layer posInt is the real gate; this is defense-in-depth)`);
    lines.push(`  let lastErr = null`);
    lines.push(`  let lastSnap = []`);
    lines.push(`  for (let attempt = 1; attempt <= maxAttempts; attempt++) {`);
    lines.push(`    __spendBudget(stepId)`);
    lines.push(`    const invocationId = stepId + (opts.itemKey == null ? '' : ':' + opts.itemKey) + '#' + (++__invocationN)`);
    lines.push(`    // dispatch transition — seq allocated synchronously, immediately before the call`);
    lines.push(`    if (__hooks.onDispatch) { __hooks.onDispatch({ invocationId: invocationId, stepId: stepId, itemKey: opts.itemKey == null ? null : String(opts.itemKey), attempt: attempt, phase: phaseName, model: opts.model == null ? null : String(opts.model), causedBy: (opts.causedBy || []).filter(function (n) { return typeof n === 'number' && n > 0 }) }) } else { __seqFallback++ }`);
    lines.push(`    let value = null`);
    lines.push(`    let outcome = 'ok'`);
    lines.push(`    try {`);
    lines.push(`      __agentCalls++`);
    lines.push(`      value = await thunk()`);
    lines.push(`      if (value === null || value === undefined) outcome = 'null'`);
    lines.push(`    } catch (err) {`);
    lines.push(`      outcome = 'error'`);
    lines.push(`      lastErr = err`);
    lines.push(`      lastSnap = __errSnap(err) // ONE snapshot per failure — log AND classify consume it (round-6 B3)`);
    lines.push(`    }`);
    lines.push(`    // settle transition — seq allocated synchronously in the continuation, BEFORE any message`);
    lines.push(`    // rendering (QE round-3 B3: a null-prototype throw must not lose the settle event — the`);
    lines.push(`    // round-2 catch logged via String(err) FIRST, which itself threw and replaced the failure)`);
    lines.push(`    let settleSeq = -1`);
    lines.push(`    if (__hooks.onSettle) { settleSeq = __hooks.onSettle({ invocationId: invocationId, outcome: outcome }) } else { settleSeq = ++__seqFallback }`);
    lines.push(`    __settled[__settleKey(stepId, opts.itemKey, opts.occurrence)] = settleSeq`);
    lines.push(`    if (outcome === 'error') { log('runStep ' + stepId + ' attempt ' + attempt + '/' + maxAttempts + ' threw: ' + (lastSnap.length > 0 ? lastSnap[0].text : '[no failure snapshot]')) }`);
    lines.push(`    if (outcome === 'ok') return value`);
    lines.push(`    // retry decision (G4): the failure is CLASSIFIED against the closed enum and retried ONLY`);
    lines.push(`    // when its class is in this step's retryOn list — retryOn: [] means ONE attempt, always.`);
    lines.push(`    // A non-array retryOn is treated as [] (schema validation upstream owns the shape; the`);
    lines.push(`    // runtime never lets a string's indexOf smuggle a class in — QE round-3 B3 hardening).`);
    lines.push(`    const failureClass = __classifyFailure(outcome, lastSnap)`);
    lines.push(`    const retryList = Array.isArray(opts.retryOn) ? opts.retryOn : []`);
    lines.push(`    const retryable = attempt < maxAttempts && failureClass !== null && retryList.indexOf(failureClass) !== -1`);
    lines.push(`    if (!retryable) {`);
    lines.push(`      // the durable flush of a terminal failure now lives in __settleStep (round-5 B3): this`);
    lines.push(`      // throw — like the budget guard's — is caught by the runStep wrapper and settled there.`);
    lines.push(`      if (outcome === 'error') { throw lastErr }`);
    lines.push(`      return null // a dead agent is a named null, never a fake result`);
    lines.push(`    }`);
    lines.push(`    // v1 retries are IMMEDIATE (round-6 narrowing): the retry-timing family`);
    lines.push(`    // (initialDelayMs/backoffMultiplier/maxDelayMs/jitter) is validated-away at the plan`);
    lines.push(`    // layer (ENACT-RETRY-TIMING) — no delay code exists here to drift, mis-copy, or skip.`);
    lines.push(`    log('runStep ' + stepId + ': attempt ' + attempt + ' ' + outcome + ' (class ' + failureClass + ') — retrying IMMEDIATELY (idempotent step, closed failure classes; v1 has no retry timing)')`);
    lines.push(`  }`);
    lines.push(`  if (lastErr !== null) throw lastErr`);
    lines.push(`  return null`);
    lines.push(`}`);
    lines.push(`// join helper — explicit policy from the closed set; a dispatched branch is never skippable.`);
    lines.push(`// The DECISION lives in the loop-semantics blob above (\`joinRegion\`), called directly here.`);
    if (plan.steps.some((s) => s.kind === 'fanout')) {
        // ── QUIESCENCE (QE round-7 B3, the round-6 reviewer's FOURTH CLASS: structured-concurrency /
        // quiescence ownership). MEASURED by Codex on the previous shape: the region awaited a
        // FAIL-FAST parallel(...), so when member `m:i1` rejected, `m:i2` was still PENDING — the
        // workflow reached a terminal rejection with a dispatched invocation still LIVE and able to
        // settle (and write trace) AFTER terminal exit. "The structural source guard passes because
        // every lexical await is inside a try; containment is not quiescence."
        //
        // __drainAll gives the region ALL-SETTLED semantics: every branch thunk is wrapped so it can
        // never reject, so the underlying parallel() awaits EVERY activated branch to settlement (each
        // one recording its own durable settle through runStep/__settleStep) before this function
        // returns. Only then does the PRIMARY failure propagate — and "primary" is the branch that
        // settled its failure FIRST (the exact error fail-fast would have raised), not the
        // lowest-indexed one. On the success path the values array is byte-for-byte what parallel()
        // returned, so the join sees the same input it always did.
        lines.push(`async function __drainAll(thunks) {`);
        lines.push(`  const __out = []`);
        lines.push(`  let __order = 0`);
        lines.push(`  const __wrapped = thunks.map(function (t, i) {`);
        lines.push(`    return async function () {`);
        lines.push(`      try { const v = await t(); __out[i] = { ok: true, value: v, at: __order++ }; return v }`);
        lines.push(`      catch (e) { __out[i] = { ok: false, error: e, at: __order++ }; return null }`);
        lines.push(`    }`);
        lines.push(`  })`);
        lines.push(`  const __results = await parallel(__wrapped) // no branch can reject ⇒ every activated branch is awaited to SETTLEMENT`);
        lines.push(`  let __primary = null`);
        lines.push(`  for (let i = 0; i < __out.length; i++) {`);
        lines.push(`    const o = __out[i]`);
        lines.push(`    if (o && o.ok !== true && (__primary === null || o.at < __primary.at)) { __primary = o }`);
        lines.push(`  }`);
        lines.push(`  if (__primary !== null) { throw __primary.error } // drained FIRST, then the primary failure propagates`);
        lines.push(`  return __results`);
        lines.push(`}`);
        lines.push(`async function __drainAllWindowed(thunks, limit) {`);
        lines.push(`  const __limit = Math.max(1, Math.floor(Number(limit) || 1))`);
        lines.push(`  if (thunks.length <= __limit) { return __drainAll(thunks) }`);
        lines.push(`  const __out = new Array(thunks.length)`);
        lines.push(`  const __values = new Array(thunks.length)`);
        lines.push(`  let __next = 0`);
        lines.push(`  let __order = 0`);
        lines.push(`  const __workers = []`);
        lines.push(`  const __workerCount = Math.min(__limit, thunks.length)`);
        lines.push(`  for (let w = 0; w < __workerCount; w++) {`);
        lines.push(`    __workers.push(async function () {`);
        lines.push(`      while (__next < thunks.length) {`);
        lines.push(`        const i = __next++`);
        lines.push(`        try { const v = await thunks[i](); __values[i] = v; __out[i] = { ok: true, value: v, at: __order++ } }`);
        lines.push(`        catch (e) { __out[i] = { ok: false, error: e, at: __order++ } }`);
        lines.push(`      }`);
        lines.push(`    })`);
        lines.push(`  }`);
        lines.push(`  await parallel(__workers) // workers never reject ⇒ all registry positions drain to SETTLEMENT`);
        lines.push(`  let __primary = null`);
        lines.push(`  for (let i = 0; i < __out.length; i++) {`);
        lines.push(`    const o = __out[i]`);
        lines.push(`    if (o && o.ok !== true && (__primary === null || o.at < __primary.at)) { __primary = o }`);
        lines.push(`  }`);
        lines.push(`  if (__primary !== null) { throw __primary.error }`);
        lines.push(`  return __values`);
        lines.push(`}`);
    }
    if (traceOn) {
        lines.push(`// trace wiring (blob-provided emitter; hooks INSIDE runStep — ADR-003)`);
        lines.push(`const __traceState = traceInit(RUN_ID, PLAN_DIGEST, EXEC_FP, 'rendered-script')`);
        lines.push(`__hooks.onDispatch = function (e) { return traceOnDispatch(__traceState, e) }`);
        lines.push(`__hooks.onSettle = function (e) { return traceOnSettle(__traceState, e) }`);
        if (hasDeclaredTruncation) {
            lines.push(`__hooks.onFanoutTruncated = function (e) {`);
            lines.push(`  const ev = { v: 1, runId: __traceState.runId, seq: ++__traceState.seq, event: 'fanout-truncated', stage: e.stage, registrySize: e.registrySize, dispatched: e.dispatched, reason: e.reason }`);
            lines.push(`  __traceState.buffer.push(JSON.stringify(ev))`);
            lines.push(`  return ev.seq`);
            lines.push(`}`);
        }
        lines.push(`async function __traceFlushNow(phaseName, stepLabel) {`);
        lines.push(`  if (TRACE_FILE === null) { return }`);
        lines.push(`  // cmd must be let: the trace payload stays LEFT and must never be replaced by the fa-record panel leg; both ride the SAME writer agent.`);
        lines.push(`  let cmd = traceFlushCmd(__traceState, TRACE_FILE)`);
        lines.push(`  if (cmd === null) { return }`);
        lines.push(`  const fa = traceFaRecordCmd(DZ_BIN, LOOP_SLUG, (typeof stepLabel === 'string' && stepLabel !== '') ? stepLabel : phaseName, REPO_DIR)`);
        lines.push(`  if (fa !== null) { cmd = cmd + ' && { ' + fa + ' || true; }' }`);
        lines.push(`  else if (REPO_DIR === null && !__faLegWarned) { __faLegWarned = true; log('fa-record leg skipped — the live panel was not updated because no args.repo was given (the trace flush still runs)') }`);
        lines.push(`  // the flush agent is infra, not a step (it would otherwise recurse) // loop-lint: infra-agent`);
        lines.push(`  __agentCalls++`);
        lines.push(`  await agent('Run EXACTLY this one shell command via your Bash tool and reply with only OK: ' + cmd, { label: 'trace:flush', phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`}`);
        lines.push(`async function __ledgerAppend(phaseName, outcome) {`);
        lines.push(`  if (__ledgerDone) { return } __ledgerDone = true`);
        lines.push(`  // Ledger telemetry is SECONDARY: this whole body is total and can never fail the run.`);
        lines.push(`  try {`);
        lines.push(`    if (REPO_DIR === null) { log('ledger:append skipped — ledger row was not written because no args.repo was given'); return }`);
        lines.push(`    // + 1 is THIS ledger writer, which is about to be invoked and not yet counted.`);
        lines.push(`    const line = traceLedgerLine({ slug: LOOP_SLUG, runId: RUN_ID, planDigest: PLAN_DIGEST, agents: __agentCalls + 1, outcome: outcome, date: A.date })`);
        lines.push(`    if (line === null) { log('ledger:append skipped — traceLedgerLine returned null'); return }`);
        lines.push(`    const cmd = traceLedgerAppendCmd(REPO_DIR, line)`);
        lines.push(`    if (cmd === null) { log('ledger:append skipped — traceLedgerAppendCmd returned null'); return }`);
        lines.push(`    __agentCalls++`);
        lines.push(`    const reply = await agent('Run EXACTLY this one shell command via your Bash tool and reply with only its stdout: ' + cmd, { label: 'ledger:append', phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`    if (!/LEDGER-OK/.test(String(reply))) { log('ledger:append UNVERIFIED — ledger row write was not confirmed; run continues') }`);
        lines.push(`  } catch (_le) { log('ledger:append failed as a SECONDARY event: ' + __errText(_le) + ' — run continues') }`);
        lines.push(`}`);
    }
    else {
        lines.push(`async function __traceFlushNow(phaseName, stepLabel) { /* trace.emit=false — no trace plane; fitness-suite verification is NOT claimable for this loop */ }`);
        lines.push(`async function __ledgerAppend(phaseName, outcome) { /* trace off — no agents counted, no ledger row */ }`);
    }
    if (ckptOn) {
        lines.push(`// checkpoint wiring (blob-provided pure half; the read/write agents are infra) — the resume`);
        lines.push(`// guard hashes the FULL exec fingerprint (EXEC_FP), not inputHash alone (AM-10), plus the`);
        lines.push(`// plan-declared checkpoint schema version (a schema bump invalidates every prior resume).`);
        lines.push(`// QE round-3 B1: these helpers are INVOKED by every checkpointed step's generated wiring —`);
        lines.push(`// __ckptLoad reads the store once at run start, __ckptResume decides skip-vs-run per step`);
        lines.push(`// (fingerprint + artifact match via the blob's decideCheckpointResume), __ckptAppend persists`);
        lines.push(`// after settle. Round 2 defined them and never called them — the schema promised a resume the`);
        lines.push(`// workflow did not perform.`);
        lines.push(`const CKPT_DIR = TRACE_DIR === null ? null : TRACE_DIR + '/.fa-state'`);
        lines.push(`const CKPT_SCHEMA = ${jsString(CKPT_SCHEMA_DEFAULT)} // v1 pins the schema stamp (checkpointing.schemaVersion is validated-away — ENACT-CKPT-OPT)`);
        lines.push(`const __ckptMode = resumeMode(A.resume)`);
        lines.push(`let __ckptEntries = {}`);
        lines.push(`let __ckptListing = new Set()`);
        lines.push(`function __ckptInputHash(stage, parts) { return checkpointInputHash(stage, [EXEC_FP, CKPT_SCHEMA].concat(parts)) }`);
        lines.push(`// __ckptLoad is TOTAL (round-6 B3: a rejected infra await must not exit around the settle`);
        lines.push(`// discipline): a failed read is NAMED and the run continues LIVE — the safe direction`);
        lines.push(`// (nothing resumes; nothing is falsely resumed).`);
        lines.push(`async function __ckptLoad(phaseName) {`);
        lines.push(`  if (CKPT_DIR === null) { log('checkpointing enabled but no traceDir given — running LIVE; nothing resumes, nothing persists (named, never silent)'); return }`);
        lines.push(`  try {`);
        lines.push(`    const cmd = checkpointReadCmd(TRACE_DIR)`);
        lines.push(`    __agentCalls++`);
        lines.push(`    const out = await agent('Run EXACTLY this one shell command via your Bash tool and reply with ONLY its raw stdout: ' + cmd, { label: 'ckpt:read', phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`    const parsed = parseCheckpointRead(typeof out === 'string' ? out : '')`);
        lines.push(`    __ckptEntries = parsed.entries`);
        lines.push(`    __ckptListing = parsed.listing`);
        lines.push(`    if (parsed.malformedLines > 0) { log('checkpoint read: ' + parsed.malformedLines + ' malformed line(s) — counted, never silently ignored') }`);
        lines.push(`  } catch (_ce) { log('checkpoint read threw: ' + __errText(_ce) + ' — running LIVE (named, never silent; nothing resumes)') }`);
        lines.push(`}`);
        lines.push(`function __ckptResume(stage, inputHash, artifactRel) {`);
        lines.push(`  if (CKPT_DIR === null) { return false }`);
        lines.push(`  const d = decideCheckpointResume({ mode: __ckptMode, entry: __ckptEntries[stage], inputHash: inputHash, artifactRel: artifactRel, listing: __ckptListing })`);
        lines.push(`  if (!d.resume && d.reason !== 'no-checkpoint' && d.reason !== 'mode-never') { log('checkpoint: ' + stage + ' NOT resumed (' + d.reason + ') — running live') }`);
        lines.push(`  return d.resume`);
        lines.push(`}`);
        lines.push(`// __ckptAppend is TOTAL (round-6 B3): a failed append is NAMED and the run continues — the`);
        lines.push(`// step itself succeeded, and an infra-write failure must never replace that outcome (the`);
        lines.push(`// next run simply re-runs the un-checkpointed step).`);
        lines.push(`async function __ckptAppend(stage, phaseName, inputHash, result) {`);
        lines.push(`  if (CKPT_DIR === null) { return }`);
        lines.push(`  const line = serializeCheckpoint(stage, inputHash, result)`);
        lines.push(`  if (line === null) { log('checkpoint: ' + stage + ' not persisted (null/oversize/unserializable — named, never silent)'); return }`);
        lines.push(`  try {`);
        lines.push(`    const cmd = checkpointAppendCmd(TRACE_DIR, line)`);
        lines.push(`    __agentCalls++`);
        lines.push(`    await agent('Run EXACTLY this one shell command via your Bash tool and reply with only OK: ' + cmd, { label: 'ckpt:write:' + stage, phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`  } catch (_ce) { log('checkpoint append for ' + stage + ' threw: ' + __errText(_ce) + ' — run continues (the step outcome stands; the next run re-runs this step)') }`);
        lines.push(`}`);
    }
    if (plan.subsystems?.trainingPairs === true) {
        lines.push(`// training-pair capture wiring (AM-9: reached ONLY via the explicit opt-in; QE round-3 B1:`);
        lines.push(`// the blob helpers are now INVOKED — one pair per settled top-level agent step, per-stage`);
        lines.push(`// granularity). ts is null (the sandbox has no clock — honest, never a fake timestamp).`);
        lines.push(`// __tpCapture is TOTAL (round-6 B3 + the capture contract: a capture failure never fails`);
        lines.push(`// the run) — a failed write is NAMED and the run continues. ROUND-7 (Codex round-6 R2`);
        lines.push(`// MEASURED): totality used to start at the WRITE — buildTrainingPair/serializeTrainingPair`);
        lines.push(`// ran BEFORE the try, so an agent returning a null-prototype object carrying a BigInt threw`);
        lines.push(`// 'TypeError: Cannot convert object to primitive value' out of the serializer and REPLACED a`);
        lines.push(`// SUCCESSFUL step (the step's own catch settled it as failed). The whole capture — pair`);
        lines.push(`// construction, serialization and write — now rides ONE catch, the same discipline as`);
        lines.push(`// __errText/__phaseFlush: a capture failure is a SECONDARY logged event, never an outcome.`);
        lines.push(`const __captureFailures = []`);
        lines.push(`async function __tpCapture(stage, phaseName, input, output, model, resumed) {`);
        lines.push(`  if (TRACE_DIR === null) { return }`);
        lines.push(`  let __captureMode = null`);
        lines.push(`  try {`);
        lines.push(`    // enabled is true because this entire wiring block is gated at render time by the subsystem opt-in.`);
        lines.push(`    const recordCount = output === null || output === undefined ? 0 : 1`);
        lines.push(`    const mode = decideCaptureMode({ enabled: true, resumed: resumed === true, recordCount: recordCount })`);
        lines.push(`    __captureMode = mode`);
        lines.push(`    if (mode === 'skip-disabled') { return }`);
        lines.push(`    if (mode === 'skip-empty') { log('training-pair: ' + stage + ' not captured (null/undefined output — named, never silent)'); __captureFailures.push(captureFailureRecord(stage, mode, 'empty-output', null)); return }`);
        lines.push(`    const pair = buildTrainingPair({ slug: RUN_ID, stage: stage, ts: null, input: input, output: output, evaluation: null, provenance: { model: model === null ? 'unknown' : model, role: stage }, captureMode: mode === 'backfill' ? 'backfill' : 'capture', resumed: resumed === true })`);
        lines.push(`    const line = serializeTrainingPair(pair)`);
        lines.push(`    if (line === null) { log('training-pair: ' + stage + ' not captured (unserializable) — named, never silent'); __captureFailures.push(captureFailureRecord(stage, mode, 'unserializable', null)); return }`);
        lines.push(`    if (mode === 'capture') {`);
        lines.push(`      const cmd = trainingPairAppendCmd(TRACE_DIR, RUN_ID, stage, line)`);
        lines.push(`      __agentCalls++`);
        lines.push(`      await agent('Run EXACTLY this one shell command via your Bash tool and reply with only OK: ' + cmd, { label: 'tp:write:' + stage, phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`      return`);
        lines.push(`    }`);
        lines.push(`    if (mode === 'backfill') {`);
        lines.push(`      // Exclude pair.slug (RUN_ID) and pair.ts (null) from the mark key: normalized input/output`);
        lines.push(`      // identify the pair across runIds, which is the cross-run at-most-once property.`);
        lines.push(`      const markKey = fnv1a64(stage + '\\0' + pair.input + '\\0' + pair.output)`);
        lines.push(`      const cmd = trainingPairBackfillCmd(TRACE_DIR, RUN_ID, stage, [line], markKey)`);
        lines.push(`      __agentCalls++`);
        lines.push(`      const readback = await agent('Run EXACTLY this one shell command via your Bash tool and reply with ONLY its raw stdout: ' + cmd, { label: 'tp:backfill:' + stage, phase: phaseName, effort: 'low' }) // loop-lint: infra-agent`);
        lines.push(`      const status = typeof readback === 'string' ? readback.trim() : ''`);
        lines.push(`      if (status === TP_BACKFILL_OK) { log('training-pair: ' + stage + ' backfilled from the checkpoint'); return }`);
        lines.push(`      if (status === TP_BACKFILL_SKIP) { log('training-pair: ' + stage + ' pair file already existed; nothing written'); return }`);
        lines.push(`      if (status === TP_BACKFILL_DUP) { log('training-pair: ' + stage + ' another run already captured this pair; nothing written'); return }`);
        lines.push(`      log('training-pair: ' + stage + ' checkpoint backfill UNVERIFIED: ' + __errText(readback))`);
        lines.push(`      __captureFailures.push(captureFailureRecord(stage, mode, 'backfill-unverified', readback))`);
        lines.push(`    }`);
        lines.push(`  } catch (_ce) { log('training-pair capture for ' + stage + ' threw: ' + __errText(_ce) + ' — run continues (capture is never load-bearing)'); __captureFailures.push(captureFailureRecord(stage, __captureMode, 'threw', __errText(_ce))) }`);
        lines.push(`}`);
    }
    if (plan.steps.some((s) => s.kind === 'gate')) {
        lines.push(`// gate verdict parsing (QE round-3 B1, tightened round-4) — parse-NEVER-synthesize, with the`);
        lines.push(`// EXACTLY-ONE-ENDING-LINE protocol enforced: the verdict must be an ANCHORED line ("GATE: PASS"`);
        lines.push(`// or "GATE: FAIL" alone on its line), it must be the LAST non-empty line of the reply, and it`);
        lines.push(`// must be the ONLY anchored verdict line. Embedded mid-reply "GATE: PASS" text never counts,`);
        lines.push(`// "GATE: PASS" followed by trailing prose is invalid, and "GATE: FAIL … GATE: PASS" is an`);
        lines.push(`// INVALID verdict (never a success) — routed like a failure (redo/fail route), never a pass.`);
        lines.push(`// The grammar itself lives in the loop-semantics blob, shared with the dz runner.`);
        lines.push(`const __gateVerdict = gateVerdict`);
    }
    lines.push(GE('runtime'));
    return lines.join('\n');
}
/** The four axis INPUT strings, built so no axis subsumes another (QE round-2 G2: the round-1
 * prompts axis embedded the full rendered step text, which already carried dep wiring and per-step
 * models — three of the four "independent" axes were mutually redundant, and deleting two of them
 * left every test green while a real resume-guard hole opened):
 *   topology — structural plan shape (ids, kinds, phases, deps, retry/budget/pause config,
 *              fanouts/joins/pauses) with prompt and model EXCLUDED;
 *   prompts  — per-step prompt text ONLY;
 *   models   — per-step declared model ONLY (covers fanout chain members too);
 *   tools    — the selected blob roster with content hashes.
 */
export function computeExecAxisInputs(plan) {
    const norm = normalizePlan(plan);
    const blobs = selectBlobs(norm);
    const ckptOn = norm.checkpointing?.enabled === true || norm.subsystems?.checkpoints === true;
    const traceOn = norm.trace?.emit === true;
    const axMemberIds = new Set();
    for (const f of norm.fanouts ?? [])
        for (const c of f.chain ?? [])
            axMemberIds.add(c);
    return {
        topology: JSON.stringify({
            steps: norm.steps.map((s) => ({
                id: s.stepId,
                kind: s.kind,
                phase: s.phase,
                deps: s.deps ?? [],
                concurrency: s.concurrency ?? null,
                retry: s.retry ?? null,
                budget: s.budget ?? null,
                pauseState: s.pauseState ?? null,
                idempotent: s.idempotent ?? false,
                // QE round-3 B1/B2: these fields now DRIVE generated wiring (landed barrier, checkpoint
                // consult, dispatch route, prompt artifact-contract lines) — effective values, so the
                // omitted-vs-explicit-default collapse the round-2 reviewer confirmed stays intact.
                deliverable: s.deliverable ?? 'return-value',
                dispatch: s.dispatch ?? 'inline',
                // QE round-6 (narrowing): the per-step checkpoint OPT-OUT field is validated-away
                // (ENACT-CKPT-OPT), so the axis records the pure DERIVED value — a top-level agent step
                // checkpoints iff checkpointing is on. The round-4/5 false-flip family (omitted vs
                // explicit `false`) is unrepresentable: there is no field left to disagree with the
                // effective value.
                checkpoint: ckptOn && s.kind === 'agent' && !axMemberIds.has(s.stepId),
                writes: s.artifacts?.writes ?? [],
                reads: s.artifacts?.reads ?? [],
            })),
            gates: norm.gates ?? [],
            fanouts: norm.fanouts ?? [],
            joins: norm.joins ?? [],
            pauses: norm.pauses ?? [],
            // QE round-3 B2 (reviewer R1, CONFIRMED): enacted-WIRING flags that can change the generated
            // runtime WITHOUT changing the blob roster. checkpointing.enabled flips checkpoint wiring even
            // when the checkpoints blob was already selected through the training-pairs requires-closure —
            // the round-2 fingerprint missed that (changedAxes=[] on a real wiring change). The selection
            // REASON is fingerprinted here, not only the resulting roster.
            // QE round-6 (narrowing): schemaVersion is validated-away (ENACT-CKPT-OPT) — the stamp is
            // PINNED, so the axis records the pin, and the round-3 false-flip is unrepresentable.
            wiring: { checkpoints: ckptOn, ckptSchema: ckptOn ? CKPT_SCHEMA_DEFAULT : null, trace: traceOn },
        }),
        // QE round-3 B2 (reviewer R1, CONFIRMED): JSON-encoded per-step prompts — a LENGTH-SAFE
        // encoding. The round-2 `${id}:${prompt}` newline join let two different prompt sets serialize
        // identically across step boundaries (a.prompt="A\nb:B",b.prompt="C" vs a.prompt="A",
        // b.prompt="B\nb:C") — a genuine resume-guard hole.
        prompts: JSON.stringify(norm.steps.map((s) => ({ id: s.stepId, prompt: s.prompt ?? null }))),
        models: JSON.stringify(norm.steps.map((s) => ({ id: s.stepId, model: s.model ?? null }))),
        tools: JSON.stringify(blobs.map((b) => ({ name: b.name, version: b.version, contentHash: b.contentHash }))),
    };
}
/** Per-axis hashes — exposed so the AM-10 test can assert each axis INDEPENDENTLY (a single-axis
 * plan change must flip exactly its own axis hash), not only the aggregate. */
export function execFingerprintAxisHashes(input) {
    return {
        topology: sha256(input.topology),
        prompts: sha256(input.prompts),
        models: sha256(input.models),
        tools: sha256(input.tools),
    };
}
/** Independent-axes execution fingerprint (FR-1.6/AM-10): each axis hashed separately, then the
 * four axis hashes hashed together — a change in ANY ONE axis flips the fingerprint. */
export function computeExecFingerprint(input) {
    const h = execFingerprintAxisHashes(input);
    const axes = [
        'topology:' + h.topology,
        'prompts:' + h.prompts,
        'models:' + h.models,
        'tools:' + h.tools,
    ];
    return sha256(axes.join('\n'));
}
/** Render a plan to a full script. Deterministic. */
export function renderPlan(plan) {
    const norm = normalizePlan(plan);
    const digest = planDigest(plan);
    const blobs = selectBlobs(norm);
    // meta (GENERATED from the plan; INV-7: phases in first-reference order)
    const phaseOrder = [];
    for (const s of norm.steps)
        if (!phaseOrder.includes(s.phase))
            phaseOrder.push(s.phase);
    const metaLines = [];
    metaLines.push(`export const meta = {`);
    metaLines.push(`  name: ${jsString(norm.name)},`);
    metaLines.push(`  description: ${jsString(norm.description)},`);
    metaLines.push(`  whenToUse: ${jsString(norm.whenToUse)},`);
    metaLines.push(`  phases: [`);
    for (const p of phaseOrder)
        metaLines.push(`    { title: ${jsString(p)}, detail: ${jsString('phase ' + p)} },`);
    metaLines.push(`  ],`);
    metaLines.push(`}`);
    // step bodies in plan order; fanout steps render their region, members render inside it
    const fanoutMembers = new Set();
    for (const f of norm.fanouts ?? [])
        for (const c of f.chain ?? [])
            fanoutMembers.add(c);
    const joinSteps = new Set((norm.joins ?? []).map((j) => j.stage));
    const env = {
        ckptOn: norm.checkpointing?.enabled === true || norm.subsystems?.checkpoints === true,
        tpOn: norm.subsystems?.trainingPairs === true,
        gateTargets: new Set((norm.gates ?? [])
            .filter((g) => typeof g.failRoute === 'string' && !g.failRoute.startsWith('terminal:'))
            .map((g) => g.failRoute)),
        memberIds: fanoutMembers,
    };
    const stepChunks = [];
    const phaseCalls = new Set();
    // QE round-3 B1: the checkpoint store is CONSULTED — loaded once at run start, before any
    // dispatch. __ckptLoad is TOTAL (round-6), so this top-level await cannot reject.
    if (env.ckptOn)
        stepChunks.push(`await __ckptLoad(${jsString(norm.steps[0]?.phase ?? 'Start')})`);
    for (const s of norm.steps) {
        if (fanoutMembers.has(s.stepId))
            continue; // rendered inside their fanout region
        if (joinSteps.has(s.stepId))
            continue; // the join is rendered by its fanout region (joinRegion call)
        if (!phaseCalls.has(s.phase)) {
            phaseCalls.add(s.phase);
            stepChunks.push(`phase(${jsString(s.phase)})`);
        }
        if (s.kind === 'fanout')
            stepChunks.push(renderFanout(norm, s));
        else
            stepChunks.push(renderStep({ step: s, depSettles: (s.deps ?? []).filter((d) => norm.steps.some((x) => x.stepId === d)) }, norm, env));
        // flush at each step boundary via the TOTAL __phaseFlush (round-6 B3: the naked
        // `await __traceFlushNow` here was the hole whose rejection REPLACED a successful outcome;
        // zero extra agent calls when the buffer is empty)
        stepChunks.push(`await __phaseFlush(${jsString(s.phase)})`);
    }
    const blobChunks = blobs.map((b) => [B(b.name, b.version, b.contentHash, b.sourcePath), b.code, BE(b.name, b.version)].join('\n'));
    // fingerprint axes (G2: non-redundant inputs — computed from the PLAN, never the rendered text,
    // so no axis subsumes another; the runtime is rendered with the final value)
    const execFp = computeExecFingerprint(computeExecAxisInputs(norm));
    const header = `// ── LOOP-PLAN plan=loop-plan/1 digest=sha256:${digest} exec-fp=sha256:${execFp} generator=${LOOP_RENDER_GENERATOR} ──`;
    const runtime = renderRuntime(norm, digest, execFp, blobs);
    const completedValue = `{ phase: 'COMPLETED', runId: RUN_ID, planDigest: PLAN_DIGEST, execFp: EXEC_FP }`;
    const ending = [
        G('epilogue'),
        `traceCloseIfOn()`,
        `function traceCloseIfOn() { ${norm.trace?.emit === true ? 'traceClose(__traceState)' : '/* trace off */'} }`,
        `await __phaseFlush(${jsString(phaseOrder[phaseOrder.length - 1] ?? 'End')})`,
        `await __ledgerAppend(${jsString(phaseOrder[phaseOrder.length - 1] ?? 'End')}, 'completed')`,
        `// the COMPLETED return rides the single exit too (round-5 B3): the epilogue flush happens inside`,
        `// __settleStep, so a flush rejection is a logged secondary event, never a replaced COMPLETED.`,
        `return await __settleStep({ stepId: '__epilogue__', phase: ${jsString(phaseOrder[phaseOrder.length - 1] ?? 'End')}, outcome: 'terminal', value: ${completedValue} })`,
        GE('epilogue'),
    ].join('\n');
    const text = [
        metaLines.join('\n'),
        header,
        ...blobChunks,
        runtime,
        `try {`,
        ...stepChunks,
        ending,
        norm.subsystems?.trainingPairs === true
            ? `} catch (__runErr) { await __ledgerAppend(${jsString(phaseOrder[phaseOrder.length - 1] ?? 'End')}, 'failed'); if (__captureFailures.length > 0) { log('training-pair capture failures this run: ' + __captureFailures.length + ' — ' + __captureFailures.map(function (f) { return f.stage + ':' + f.reason }).join(', ')) } throw __runErr }`
            : `} catch (__runErr) { await __ledgerAppend(${jsString(phaseOrder[phaseOrder.length - 1] ?? 'End')}, 'failed'); throw __runErr }`,
        '',
    ].join('\n\n');
    const userRegions = [...text.matchAll(/BEGIN USER (\S+)/g)].map((m) => m[1]);
    return {
        text,
        planJson: JSON.stringify(norm, null, 2) + '\n',
        execFingerprint: execFp,
        manifest: {
            planDigest: digest,
            execFingerprint: execFp,
            blobs: blobs.map((b) => ({ name: b.name, version: b.version, contentHash: b.contentHash })),
            steps: norm.steps.map((s) => s.stepId),
            userRegions,
        },
    };
}
const USER_RE = /\/\/ ── BEGIN USER (\S+) ──\n([\s\S]*?)\/\/ ── END USER \1 ──/g;
/** Extract USER regions keyed by label. */
export function extractUserRegions(text) {
    const out = new Map();
    for (const m of text.matchAll(USER_RE))
        out.set(m[1], m[2]);
    return out;
}
/**
 * Merge a fresh render over an existing target (propose-never-clobber, §3.2):
 * - target has markers → splice: new BLOB/GENERATED + OLD USER bytes (byte-for-byte, INV-11);
 *   a USER region with no counterpart in the new render is a NAMED conflict, never dropped.
 * - target has NO markers (hand-written) → refuse; return proposedText for `<script>.proposed.js`;
 *   `--force` (the caller's flag) overwrites explicitly.
 */
export function mergeRender(prevText, next, opts) {
    const prevUsers = extractUserRegions(prevText);
    if (prevUsers.size === 0 && prevText.trim() !== '') {
        if (opts?.force === true)
            return { text: next.text, conflicts: [], refused: false };
        return {
            text: prevText,
            conflicts: [],
            refused: true,
            proposedText: next.text,
        };
    }
    const nextUsers = extractUserRegions(next.text);
    let text = next.text;
    for (const [label, body] of nextUsers) {
        const prev = prevUsers.get(label);
        if (prev !== undefined && prev !== body) {
            text = text.replace(`// ── BEGIN USER ${label} ──\n${body}// ── END USER ${label} ──`, `// ── BEGIN USER ${label} ──\n${prev}// ── END USER ${label} ──`);
        }
    }
    const conflicts = [];
    for (const [label] of prevUsers) {
        if (!nextUsers.has(label)) {
            conflicts.push({ stepId: label.replace(/^step:/, '').replace(/\/body$/, ''), reason: `USER region ${label} has no counterpart step in the new plan — its content was NOT carried over; recover it from the previous file` });
        }
    }
    return { text, conflicts, refused: false };
}
//# sourceMappingURL=loop-render.js.map