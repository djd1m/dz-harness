/**
 * `trace-corroborate` — the Claude host's OWN records, for the half of a trace they can witness.
 *
 * ADR-002. Pure over already-read strings: no `fs`, so it is testable with fixtures alone.
 *
 * The design is shaped by one MEASURED fact and one refuted design. The fact: the trace and the
 * host's `journal.jsonl` share NO identifier — trace dispatch events carry `invocationId` /
 * `stepId`, the journal carries `agentId` and a `v2:<sha>` key. There is no run nonce to bind them
 * with, and we do not control the host's format, so DIRECTORY CONTAINMENT is the only binding
 * available and every result says so. The refuted design: a bare `agrees` over "agent set +
 * wall-clock order", which a cross-family reviewer defeated with a trace that matched on agents
 * while inventing a join, a gate redo, a typed pause and a file deliverable — every consequential
 * claim fabricated, the verdict green. Hence `agreesWithinScope`, and hence `notWitnessed` being
 * non-empty BY TYPE rather than by discipline.
 */
/** Non-empty by construction: a tuple type, so no edit can empty it and silently unscope a result. */
export type NotWitnessed = readonly ['join', 'gate-redo', 'typed-pause', 'file-deliverable'];
export declare const NOT_WITNESSED: NotWitnessed;
export type WitnessedClaim = 'agent-multiset' | 'agent-count' | 'wall-clock-order';
export declare const WITNESSED: readonly WitnessedClaim[];
/** Deliberately NOT `agrees`. The scope lives in the word, so a stored verdict carries it too. */
export type CorroborationVerdict = 'agreesWithinScope' | 'disagrees' | 'inconclusive';
export interface CorroborationResult {
    verdict: CorroborationVerdict;
    /** The ONLY binding available — see the module note. Never omitted. */
    binding: 'by-directory';
    hostDir: string;
    witnessed: readonly WitnessedClaim[];
    notWitnessed: NotWitnessed;
    /** Why, in words, for the human-readable report. */
    detail: string;
    /** Counts, so a caller can render the disagreement rather than re-deriving it. */
    traceAgentCount: number;
    hostAgentCount: number;
}
/** One host record set, already read from disk by the caller. */
export interface HostRecords {
    /** Raw `journal.jsonl` text, or null when the file is absent/unreadable. */
    journal: string | null;
    /** Raw `agent-<id>.jsonl` texts, keyed by agent id. Empty when none were found. */
    agentTranscripts: Record<string, string>;
}
/** The trace side, projected by the caller: the agent ids the trace claims took part, in order. */
export interface TraceAgentProjection {
    agentIds: string[];
}
export declare function corroborate(trace: TraceAgentProjection, host: HostRecords, hostDir: string): CorroborationResult;
//# sourceMappingURL=trace-corroborate.d.ts.map