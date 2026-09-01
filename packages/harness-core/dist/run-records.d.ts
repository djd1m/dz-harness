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
    /** Who ran it. Supplied by the CALLER, which lives outside the workflow sandbox and can see the
     *  host; absent stays absent (see the stamping comment below). */
    runnerId?: string | null;
    maxChars?: number;
}): RecordDecision;
/** The read-back verdict (ADR-002): equal bytes or NOT written. Never inferred from the absence of an error. */
export declare function decideReadBack(appended: string, lastLineOnDisk: string | null): RecordDecision;
/** The one line every caller reads last, in the shape the other gates use. */
export declare function recordVerdictLine(kind: RecordKind, stage: string, d: RecordDecision): string;
//# sourceMappingURL=run-records.d.ts.map