/**
 * Witnessed run records — the decision half of `dz feature-adr-record` (ADR-001 … ADR-003).
 *
 * Two durable writers in the /feature-adr workflow still handed a subagent a PRE-BAKED shell string
 * carrying their payload: the run-cost ledger and the training-pair capture. That is the shape a
 * security classifier blocked NINE times in one run — one entity instructing another to append state
 * it never verified. The checkpoint writer was migrated for that reason; these two were left behind.
 *
 * The role change is the point: the subagent stops being a COURIER (handed a shell string, appends
 * it) and becomes a CALLER (handed arguments; the command decides). A courier can neither refuse nor
 * verify.
 *
 * Pure: payload in, verdict out. The CLI owns paths, the append, the read-back and the exit code.
 */
import type { CodexRollout } from './codex-rollouts.js';
/** Structural — a caller passes `cost-scoring.ts`'s `ModelPricing`; kept local so `run-records.ts`
 *  does not have to import `cost-scoring.ts` just to name a type.
 *
 *  measurement-integrity fix-round-1/F6 (Codex r1 HIGH #6): `cacheCreation` used to be dropped here —
 *  the snapshot silently lacked the ONE rate a cache-WRITE-heavy row needs to reproduce its own cost
 *  later, even though the caller's own `ModelPricing` carries it. Now carried through verbatim. */
export interface LedgerPriceEntry {
    readonly prompt: number;
    readonly completion: number;
    readonly cachedInput: number;
    readonly cacheCreation: number;
}
/** measurement-integrity fix-round-1/F4 (Codex r1 HIGH #4): a resolvable executor spec, split into
 *  its three parts. Never invents a model: {@link parseModelSpec} returns `null` for anything it
 *  cannot resolve to exactly one model, rather than guessing. */
export interface ParsedModelSpec {
    readonly family: 'claude' | 'codex';
    readonly model: string;
    readonly effort: string | null;
}
/**
 * Parse an executor spec — the shapes actually recorded in `coder`/`reviewer` fields
 * (`codex:gpt-5.6-sol:high`, `claude:sonnet`, bare `sonnet`/`opus`, bare `codex`, bare `claude`) —
 * into `{family, model, effort}`. Pure, never throws.
 *
 * Returns `null` (never a guess) for anything that cannot be resolved to exactly ONE model:
 * - a bare `'codex'` or `'claude'` (family named, no model at all);
 * - an annotated/aggregate field such as `'claude:sonnet x2'` or `'qe-bridge:claude x2 + lead'` (real
 *   values this ledger carries for a MULTI-reviewer round) — any embedded whitespace means the field
 *   names more than one resolvable spec, and picking one would misattribute to the others;
 * - a bare model id with no family marker that is not one of the known bare Claude names (e.g. a full
 *   `'claude-sonnet-5'` — that shape is handled by the OLDER vendor-prefix path in {@link priceLookup}
 *   for backward compatibility, not by this parser).
 */
export declare function parseModelSpec(spec: unknown): ParsedModelSpec | null;
/** measurement-integrity FR-5/FR-6: enrichment the WRITER supplies at write time — the rollout logs
 *  it already read (I/O lives in the CLI; this stays pure) and the price table snapshot. Absent
 *  entirely ⇒ zero behavior change from before this feature (NFR-1). */
export interface LedgerEnrichInput {
    /** Parsed Codex rollout logs for the window the CLI read — usually every rollout from the days the
     *  window spans. Pure data; the CLI is the one that walked `~/.codex/sessions`. */
    readonly rollouts?: readonly CodexRollout[];
    /** The stage's own time window — usually [the previous ledger row's `ts`, this write's `ts`], or
     *  an explicit `--window-from/--window-to`. Omitted ⇒ no rollout match is even attempted. */
    readonly window?: {
        readonly from: string;
        readonly to: string;
    };
    /** Narrows an otherwise-ambiguous match — usually the repo root the stage ran in. */
    readonly cwd?: string;
    /** A model-pricing table SNAPSHOT (FR-6) — the CALLER's table, captured at write time, never the
     *  ledger's own idea of "current" pricing (ADR-001 D4 rejects re-pricing after the fact). */
    readonly prices?: Readonly<Record<string, LedgerPriceEntry>>;
}
export declare const INCOMPLETE_REASON_CODES: readonly ["sandbox-metrics-unavailable", "manual-entry"];
export type IncompleteReasonCode = typeof INCOMPLETE_REASON_CODES[number];
export type RecordKind = 'ledger' | 'training-pair';
export type RecordVerdict = 
/** the line was appended AND read back equal */
'written'
/** a mark shows another run got here first — nothing written, nothing wrong */
 | 'duplicate'
/** the target already held this pair — nothing written, nothing wrong */
 | 'skipped'
/** the payload was rejected before any write; the target is untouched */
 | 'refused'
/** the append happened but the read-back disagreed — the caller MUST treat this as NOT written */
 | 'not-verified';
export interface RecordDecision {
    readonly verdict: RecordVerdict;
    /** One mapping, never two: 0 written|duplicate|skipped · 2 refused · 3 not-verified. */
    readonly exit: 0 | 2 | 3;
    readonly reason: string;
    /**
     * ALWAYS false. A cost row and a training pair are observability, and observability must not take
     * the run down with it (ADR-003). The field exists so the property is assertable rather than
     * merely intended — a thrown refusal would turn bookkeeping into an outage.
     */
    readonly blocking: false;
    /** The exact line to append, or null when nothing may be written. */
    readonly line: string | null;
    /** Set when a mark was found without its target — the previous holder died before writing. */
    readonly staleMark?: boolean;
}
/** A serialised record line above this is refused rather than truncated (acid case A2). */
export declare const RECORD_MAX_LINE_CHARS = 24000;
export declare function decideRecordWrite(input: {
    kind: RecordKind;
    /** The raw `--row` / `--pair` argument, exactly as the caller passed it. */
    payloadRaw: string;
    /** The stage this record belongs to; a record for a stage that produced nothing is refused. */
    stage: string;
    stageProducedResult?: boolean;
    /** A backfill mark already present ⇒ another run got here first — unless the target is absent. */
    markExists?: boolean;
    /** Whether the target file exists; a mark without a target is a STALE mark, not a duplicate. */
    targetExists?: boolean;
    /** The target already holds this pair. */
    targetHasPair?: boolean;
    /** Stamped INTO the object before serialising — never rewritten in the shell afterwards (FR-7). */
    timestamp?: string | null;
    /**
     * ledger-stage-minutes FR-2/FR-3: the `ts` of the LAST ledger row that shares this row's `runId`,
     * found by the CALLER (the CLI reads the file; this function stays pure). Absent/null means "no
     * such row, or it had no `ts`" — both collapse to the same honest `unavailable`, never a guess.
     */
    previousRowTs?: string | null;
    /** The runId this row WILL carry after write-time resolution, when the payload itself has none. */
    effectiveRunId?: string | null;
    /** Who ran it. Supplied by the CALLER, which lives outside the workflow sandbox and can see the
     *  host; absent stays absent (see the stamping comment below). */
    runnerId?: string | null;
    /** fix-round-1/F2: the CLI's own trusted `--auto` flag — see the comment inside `shapeMismatch`. */
    auto?: boolean;
    maxChars?: number;
    /** measurement-integrity FR-5/FR-6: rollout-log + price enrichment for a ledger row. Absent ⇒ zero
     *  behavior change (NFR-1). */
    enrich?: LedgerEnrichInput;
    /**
     * instrument-round-b FR-4/A5 (ADR-001 D4), fix-round-1 (Codex r1 HIGH finding 3): an AUTO ledger
     * row that would be written `complete:false` is refused (exit 2, before any write) UNLESS the
     * actual incompleteness is fully covered by this NAMED, SCOPED allowance — the CLI's
     * `--allow-incomplete <fields>`. A field this row is incomplete in that is NOT in this set still
     * refuses, naming exactly the uncovered field(s). `--no-strict` (a blanket opt-out) is gone —
     * see {@link INCOMPLETE_REASON_CODES}.
     */
    allowIncomplete?: readonly string[];
    /**
     * instrument-round-b fix-round-1 (Codex r1 HIGH finding 3): WHY the row is legitimately
     * incomplete — the CLI's `--incomplete-reason <code>`, required alongside `allowIncomplete` and
     * validated against the closed {@link INCOMPLETE_REASON_CODES} set. An unrecognized or absent
     * reason refuses the write even when every incomplete field IS named in `allowIncomplete`.
     */
    incompleteReason?: string | null;
}): RecordDecision;
/** The read-back verdict (ADR-002): equal bytes or NOT written. Never inferred from the absence of an error. */
export declare function decideReadBack(appended: string, lastLineOnDisk: string | null): RecordDecision;
/** The one line every caller reads last, in the shape the other gates use. */
export declare function recordVerdictLine(kind: RecordKind, stage: string, d: RecordDecision): string;
/** experiment-instrument FR-1/FR-3 (ADR-001): what `round.ts`'s `readOpenRoundTaskId` returns — the
 *  single source `applyTaskId` fills from. Duplicated here rather than imported so this pure module
 *  never depends on `round.ts`'s own shape; the CLI is the one holding both and wiring them together.
 *  r1-1/r1-2 (Codex r1 #1/#2): extended with `'derived-legacy'` and `'unavailable'` to stay in
 *  lockstep with `round.ts`'s own `readOpenRoundTaskId` return type. */
export interface TaskIdLookup {
    readonly taskId: string | null;
    readonly source: 'open-round' | 'derived-legacy' | 'no-open-round' | 'ambiguous' | 'unavailable';
}
/**
 * experiment-instrument FR-1/FR-3/A8 (ADR-001): propagate `taskId` onto a ledger/training-pair payload
 * BEFORE it reaches {@link decideRecordWrite} — fill-only-null, never overwritten.
 *
 * - The payload already names a non-empty `taskId` string ⇒ it is authoritative. When it DISAGREES
 *   with the round's own current taskId, that disagreement is a real fact worth keeping — recorded as
 *   `taskIdConflict: {payload, round}` — never silently resolved either way (A8).
 * - The payload's `taskId` key is absent, or explicitly `null`/`undefined` ⇒ filled from `lookup`,
 *   INCLUDING the honest `null` case: no open round (A4) or two of them (A5) still stamps `taskId:
 *   null` + `taskIdSource` naming why, rather than leaving the field silently absent — absence with a
 *   named reason beats absence with none.
 * - r1-3 (Codex r1 HIGH #3): the payload's `taskId` key is PRESENT with a value that is neither a
 *   non-empty string nor null/undefined (a number, a boolean, an object, or a blank/whitespace-only
 *   string) ⇒ that is a present-but-INVALID value, a THIRD case distinct from both of the above. It
 *   used to be treated exactly like "absent" (`typeof !== 'string'` fell through to the fill branch),
 *   silently replacing the caller's own (malformed) value with the round's — violating both
 *   fill-only-null and "a present payload value always wins". Now: the row's own value is preserved
 *   UNTOUCHED (never replaced with a guess about what the caller meant), and the problem is named in
 *   `taskIdInvalid` so a reader can see the row was neither filled nor trusted blindly.
 *
 * Pure: no filesystem, no clock. The CALLER (the cli) is the one that read `.dz/rounds/` to build
 * `lookup` in the first place.
 */
export declare function applyTaskId(row: Record<string, unknown>, lookup: TaskIdLookup): Record<string, unknown>;
//# sourceMappingURL=run-records.d.ts.map