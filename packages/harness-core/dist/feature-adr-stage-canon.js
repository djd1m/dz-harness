/**
 * The canonical stage taxonomy (feature `measurement-integrity`, ADR-001 D1).
 *
 * `cost-ledger.ts` keys its per-stage rows off `stageLabel()` output VERBATIM — deliberately, so the
 * ledger never invents its own taxonomy (the prior feature's FR-2). That is correct for the ledger's
 * own scope, but it leaves nothing to GROUP by: one recorded run (`wf_5a7755c7-f92`, feature-adr,
 * 66 agents) carries 47 distinct verbatim labels (`resolve-root:1`, `runs-record:heartbeat:Design`,
 * `requirements · sonnet`, `ckpt:write:plan`, `trainpair:code`, `ledger:append`, `score:auto`, …)
 * against the pipeline's own 11 canonical stages (`STAGE_EFFORT.override` in `feature-adr.js`:
 * router, requirements, research, adr, ideation, ddd, architecture, plan, code, qe, fleet). Step 0's
 * assessment counted 48 on the same record; a live reproducer today counts 47 — the one-off
 * difference is not chased here (it does not change which prefixes are needed), and every label the
 * reproducer found is in {@link STAGE_LABEL_FIXTURE} below.
 *
 * This module adds ONE thing: a pure, ordered-rule classifier from a verbatim label to a canonical
 * stage. It never replaces or rewrites the verbatim label — `cost-ledger.ts` stamps `stageCanonical`
 * NEXT TO the untouched `stage` field (ADR-001 D1). An unrecognised label is `{stage:'unknown'}`,
 * never silently folded into `infra` — a taxonomy that quietly swallows what it does not recognise
 * would hide exactly the drift this feature exists to surface (ADR-001 rejects that alternative).
 *
 * PURE. No filesystem, no clock, no process — this module must never gain a `node:fs` import; the
 * `core-boundary` ratchet (`test/core-boundary.test.ts`) pins the current count and any I/O added
 * here would grow it.
 *
 * @packageDocumentation
 */
/** The pipeline's own 11 design/work stages, plus `infra` for the bookkeeping/plumbing labels that
 *  surround them (checkpoints, run-record heartbeats, training-pair capture, the ledger writer
 *  itself, `dz score`, `dz round`, the architecture-map refresh, …). 12 values total. */
export const CANONICAL_STAGES = [
    'router',
    'requirements',
    'research',
    'adr',
    'ideation',
    'ddd',
    'architecture',
    'plan',
    'code',
    'qe',
    'fleet',
    'infra',
];
/**
 * ONE ordered table (ADR-001 D1 / C-3: "one canon table, one completeness test"). Rules are tried in
 * order and the FIRST match wins, so a more specific rule (an exact router-time probe) must be listed
 * before a broader prefix that would otherwise also claim it (the generic `arch-` → infra catch-all).
 *
 * Every entry below is justified against the 47-label fixture in
 * `test/feature-adr-stage-canon.test.ts` (copied from the live record `wf_5a7755c7-f92`):
 *
 * - `router:*`, the Step-0 decision-recall receipt, and the ONE step-0 architecture-sync probe
 *   (`arch-сverka:step0` — a Cyrillic С, copied verbatim from the label the pipeline actually emits)
 *   are ROUTER, even though the last one would otherwise fall into the generic `arch-` infra bucket.
 * - `design:*` is folded into `adr`: the S/M-tier pipeline runs ONE design agent that covers
 *   ADR+ideation+DDD+architecture at once (`feature-adr-ultracode.md`'s "design-aggregate"), so its
 *   probe labels have no separate canonical home — `adr` is the least-wrong single bucket, named here
 *   so the choice is not silent.
 * - `qe:baseline*` (the Step-7.5 Codex-landed barrier's baseline hash/targets check) is CODE, not QE:
 *   it runs as part of confirming code landed, before the QE stage proper starts.
 * - Everything else that is checkpoint/heartbeat/training-pair/ledger/score/round/architecture-map/
 *   resolve-root/usage-probe/project-skills plumbing is INFRA — it surrounds every design/work stage
 *   without belonging to any one of them.
 */
// measurement-integrity fix-round-1/F3 (Codex r1 HIGH #3): every prefix rule below is now BOUNDED —
// the literal prefix must be followed by `:` or end-of-string (or, for the one dash-separated infra
// catch-all, `-`) before it may match. The unbounded form (`/^requirements/`) let an unrelated,
// never-emitted label like `requirementsBROKEN` or `code-new-stage` silently classify as a known
// stage — exactly the silent-swallow this module's own doc comment says D1 forbids. `roundtrip` is
// the sharpest case: the OLD infra alternation `/^(...|round)/` had no boundary at all, so any label
// merely STARTING WITH "round" (never emitted, but never refused either) read as infra plumbing.
// Negative fixtures for all three land in `test/feature-adr-stage-canon.test.ts`.
export const STAGE_LABEL_RULES = [
    { test: /^router(?::|$)/, stage: 'router' },
    { test: /^decision-recall:step0(?::|$)/, stage: 'router' },
    { test: /^arch-сverka:step0$/, stage: 'router' },
    { test: /^requirements(?::|$)/, stage: 'requirements' },
    { test: /^research(?::|$)/, stage: 'research' },
    { test: /^design(?::|$)/, stage: 'adr' },
    { test: /^adr(?::|$)/, stage: 'adr' },
    { test: /^ideation(?::|$)/, stage: 'ideation' },
    { test: /^ddd(?::|$)/, stage: 'ddd' },
    { test: /^architecture(?::|$)/, stage: 'architecture' },
    { test: /^decision-recall:step6(?::|$)/, stage: 'plan' },
    { test: /^plan(?::|$)/, stage: 'plan' },
    // `qe:baseline-hash` / `qe:baseline-targets` use a DASH after the "qe:baseline" root (not a colon),
    // so the boundary set here is `[-:]` or end — never a bare "qe:baselineWHATEVER" glued on.
    { test: /^qe:baseline(?:[-:]|$)/, stage: 'code' },
    { test: /^code(?::|$)/, stage: 'code' },
    { test: /^probe:/, stage: 'code' },
    { test: /^qe(?::|$)/, stage: 'qe' },
    { test: /^fleet(?::|$)/, stage: 'fleet' },
    { test: /^(?:resolve-root|runs-record|ckpt|usage|project-skills|trainpair|ledger|score|round)(?::|$)/, stage: 'infra' },
    // `arch-` is the one DASH-bounded catch-all (the dash IS the boundary — `arch-map:refresh`), kept
    // as its own rule rather than folded into the colon-bounded alternation above.
    { test: /^arch-/, stage: 'infra' },
];
/**
 * Classify one `stageLabel()` string. A label of the shape `requirements · sonnet` (verbatim label
 * plus a ` · model` suffix — the shape `cost-ledger.ts` rows already carry for a mixed-model bucket)
 * is matched on the part BEFORE ` · `; the returned `label` is always the untouched input.
 *
 * Never throws. A non-string or empty label is `unknown`, same as one that matches no rule.
 */
export function canonicalStage(label) {
    if (typeof label !== 'string' || label.length === 0) {
        return { stage: 'unknown', label: typeof label === 'string' ? label : '', known: false };
    }
    const sepIndex = label.indexOf(' · ');
    const base = sepIndex === -1 ? label : label.slice(0, sepIndex);
    for (const rule of STAGE_LABEL_RULES) {
        if (rule.test.test(base))
            return { stage: rule.stage, label, known: true };
    }
    return { stage: 'unknown', label, known: false };
}
//# sourceMappingURL=feature-adr-stage-canon.js.map