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
export declare const CANONICAL_STAGES: readonly ["router", "requirements", "research", "adr", "ideation", "ddd", "architecture", "plan", "code", "qe", "fleet", "infra"];
export type CanonicalStage = (typeof CANONICAL_STAGES)[number];
export interface KnownStageResult {
    readonly stage: CanonicalStage;
    /** The INPUT label, verbatim and unmodified — the classifier never rewrites what it classifies. */
    readonly label: string;
    readonly known: true;
}
export interface UnknownStageResult {
    readonly stage: 'unknown';
    readonly label: string;
    readonly known: false;
}
export type StageCanonResult = KnownStageResult | UnknownStageResult;
export interface StageLabelRule {
    /** Tested against the label's PREFIX (everything before a ` · model` suffix, when present). */
    readonly test: RegExp;
    readonly stage: CanonicalStage;
}
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
export declare const STAGE_LABEL_RULES: readonly StageLabelRule[];
/**
 * Classify one `stageLabel()` string. A label of the shape `requirements · sonnet` (verbatim label
 * plus a ` · model` suffix — the shape `cost-ledger.ts` rows already carry for a mixed-model bucket)
 * is matched on the part BEFORE ` · `; the returned `label` is always the untouched input.
 *
 * Never throws. A non-string or empty label is `unknown`, same as one that matches no rule.
 */
export declare function canonicalStage(label: string): StageCanonResult;
//# sourceMappingURL=feature-adr-stage-canon.d.ts.map