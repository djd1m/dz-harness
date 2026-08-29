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
import type { Deliverable, LoopPlan } from './loop-plan.js';
/** Blob version stamp read by scripts/gen-loop-blobs.mjs. */
export declare const LOOP_RUN_SEMANTICS_BLOB_VERSION = "1.0.0";
export interface ErrSnapLink {
    code: string | null;
    name: string | null;
    text: string;
}
/**
 * TOTAL error-to-text (the ha-consilium 5b totality lesson): the writer's own settle event must
 * survive a hostile error object. `String(err)` throws on a null-prototype object and a throwing
 * `.message` getter throws on access — both are caught here, so rendering a message can never
 * replace the original failure or lose the settle. `.message` is read ONCE into a local (a one-shot
 * getter answered the `typeof` probe and vanished on the value read — snapshot-once defeats it).
 */
export declare function errText(err: unknown): string;
/**
 * The `err.cause` chain, bounded (depth 5), cycle-safe and getter-safe. The standard Node fetch
 * shape `TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })` hides its real class one
 * link down, so classification must see the whole chain, not the outermost error.
 */
export declare function causeChain(err: unknown): unknown[];
/**
 * ONE snapshot PER FAILURE. The earlier shape snapshotted `.message` once per `errText` CALL, not
 * once per failure — so logging read it, classification read it AGAIN, and a one-shot `.message`
 * getter answered the log and defeated the classifier (2 getter reads, 1 attempt, MEASURED). The
 * catch site builds this snapshot once; the log line and the classifier both consume the SNAPSHOT,
 * so `.code` / `.name` / `.message` are each read exactly once per failure, over the whole chain.
 */
export declare function errSnap(err: unknown): ErrSnapLink[];
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
export declare function classifyFailure(outcome: 'null' | 'error', snap: ErrSnapLink[]): import('./loop-plan.js').FailureClass | null;
export type GateVerdict = 'pass' | 'fail' | 'invalid';
/**
 * Gate verdict parsing — parse-NEVER-synthesize, with the EXACTLY-ONE-ENDING-LINE protocol
 * enforced: the verdict must be an ANCHORED line ("GATE: PASS" or "GATE: FAIL" alone on its line),
 * it must be the LAST non-empty line of the reply, and it must be the ONLY anchored verdict line.
 * Embedded mid-reply "GATE: PASS" text never counts, "GATE: PASS" followed by trailing prose is
 * invalid, and "GATE: FAIL … GATE: PASS" is an INVALID verdict (never a success) — routed like a
 * failure (redo / fail route), never a pass.
 */
export declare function gateVerdict(reply: unknown): GateVerdict;
export interface JoinOutcome {
    ok: true;
    values: unknown[];
    failures: number[];
}
/**
 * The join decision — explicit policy from the closed set; a dispatched branch is never skippable.
 * `any` fails only when EVERY branch failed; `quorum:<n>` needs n non-failing branches; every other
 * policy (the `all-*` family) fails on the first failing branch. Throws with a NAMED message, which
 * the caller settles through its own single terminal exit.
 */
export declare function joinRegion(results: unknown[], o: {
    policy: string;
    onInvalid: string;
    region: string;
}): JoinOutcome;
export interface ContractInputs {
    reads: string[];
    writes: string[];
    deliverable: Deliverable;
    tools: string[];
    gate: {
        kind: string;
    } | null;
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
export declare function stepContractLines(c: ContractInputs): string[];
/**
 * THE budget ceiling formula (ADR-004 Confirmation-2): declared per-step budgets PLUS the declared
 * gate-redo allowance — a plan-declared redo must be AFFORDABLE (an undeclared one still hits the
 * guard loudly). A gate whose failRoute is a `terminal:` route reserves nothing: a terminal route
 * ends the run, it does not re-run anything.
 *
 * This is the number the rendered script carries as `const __budget = { left: N }`; the runner reads
 * it from HERE, so the two enactors cannot drift into two ceilings.
 */
export declare function computeBudgetTotal(plan: LoopPlan): number;
//# sourceMappingURL=loop-run-semantics.d.ts.map