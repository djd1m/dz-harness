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
export const NOT_WITNESSED: NotWitnessed = ['join', 'gate-redo', 'typed-pause', 'file-deliverable'] as const;

export type WitnessedClaim = 'agent-multiset' | 'agent-count' | 'wall-clock-order';
export const WITNESSED: readonly WitnessedClaim[] = ['agent-multiset', 'agent-count', 'wall-clock-order'] as const;

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

/**
 * Read the agent ids the host journal STARTED, or null when the journal cannot be trusted to be
 * complete. QE round 1 closed three ways this used to lie:
 *   H4 — a `started` row whose `agentId` is not a string was silently DROPPED, so a malformed row
 *        that may well represent a real extra agent made the sets look equal.
 *   M2 — a non-empty journal with zero usable start rows returned `[]`, and an empty trace then
 *        "agreed" with it. A journal that records no starts is not evidence that none happened.
 *   M3 — `JSON.parse('null')` is valid JSON, and indexing the result threw.
 */
function journalAgentIds(journal: string): string[] | null {
  const ids: string[] = [];
  let sawAny = false;
  for (const line of journal.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    sawAny = true;
    let o: unknown;
    try {
      o = JSON.parse(t);
    } catch {
      // A malformed journal is INCONCLUSIVE, not "the agents we could still parse". A partially
      // readable independent record is not an independent record.
      return null;
    }
    // M3: `null`, a number and a string are all valid JSON and none of them are records.
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    const rec = o as Record<string, unknown>;
    if (rec['type'] !== 'started') continue;
    // H4: a start row we cannot read is a start row we cannot account for.
    if (typeof rec['agentId'] !== 'string' || rec['agentId'] === '') return null;
    ids.push(rec['agentId']);
  }
  // M2: a non-empty journal that yielded no starts tells us nothing about how many agents ran.
  if (!sawAny || ids.length === 0) return null;
  return ids;
}

/**
 * The FIRST readable timestamp in a transcript, or null when the answer cannot be trusted.
 *
 * QE round 1 / M1: this used to skip unparseable lines and keep scanning. But an unparseable line
 * EARLIER in the file may carry an earlier timestamp — so a corrupt prefix does not just cost us a
 * line, it invalidates the whole "first" claim. Returning the next readable stamp presents a
 * possibly-late time as the earliest one, which is exactly how a wrong order reads as right.
 */
function firstTimestamp(text: string): number | null {
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t === '') continue;
    let o: unknown;
    try {
      o = JSON.parse(t);
    } catch {
      return null; // a corrupt line before any stamp ⇒ the earliest is unknowable
    }
    if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
    const ts = (o as Record<string, unknown>)['timestamp'];
    if (typeof ts === 'string') {
      const ms = Date.parse(ts);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return null;
}

function multisetEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const count = new Map<string, number>();
  for (const x of a) count.set(x, (count.get(x) ?? 0) + 1);
  for (const x of b) {
    const n = count.get(x);
    if (n === undefined || n === 0) return false;
    count.set(x, n - 1);
  }
  return true;
}

export function corroborate(trace: TraceAgentProjection, host: HostRecords, hostDir: string): CorroborationResult {
  const base = {
    binding: 'by-directory' as const,
    hostDir,
    witnessed: WITNESSED,
    notWitnessed: NOT_WITNESSED,
    traceAgentCount: trace.agentIds.length,
  };

  if (host.journal === null) {
    return { ...base, verdict: 'inconclusive', hostAgentCount: 0, detail: 'no host journal at ' + hostDir + ' — absent evidence is never agreement' };
  }
  const hostIds = journalAgentIds(host.journal);
  if (hostIds === null) {
    return { ...base, verdict: 'inconclusive', hostAgentCount: 0, detail: 'the host journal is empty or malformed — a partially readable record is not an independent one' };
  }

  // COUNT and MULTISET before ordering: a mismatch here is a real disagreement, and comparing the
  // order of two different sets would be meaningless anyway.
  if (!multisetEqual(trace.agentIds, hostIds)) {
    return {
      ...base,
      verdict: 'disagrees',
      hostAgentCount: hostIds.length,
      detail: `the trace claims ${trace.agentIds.length} agent run(s), the host journal records ${hostIds.length}` +
        (trace.agentIds.length === hostIds.length ? ' — same count, different ids' : ''),
    };
  }

  // Wall-clock order, from the per-agent transcripts (the journal carries no ts). An agent with no
  // readable timestamp makes the ORDER unwitnessable — inconclusive, not a pass on the rest.
  //
  // QE round 1 / M4: `host.agentTranscripts[id]` walks the PROTOTYPE, so an agent literally named
  // `__proto__` (or `constructor`, `toString`, …) read a function off Object.prototype and threw.
  // An own-property check is the fix; the id is data from an outside file and must be treated as such.
  const own = (o: Record<string, string>, k: string): string | undefined =>
    Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined;

  const stamps: Array<{ id: string; at: number }> = [];
  for (const id of hostIds) {
    const text = own(host.agentTranscripts, id);
    const at = typeof text !== 'string' ? null : firstTimestamp(text);
    if (at === null) {
      return { ...base, verdict: 'inconclusive', hostAgentCount: hostIds.length, detail: `no readable timestamp for agent ${id} — the wall-clock order cannot be witnessed` };
    }
    stamps.push({ id, at });
  }

  // QE round 1 / H3: two agents sharing a timestamp make their relative order UNKNOWABLE. A stable
  // sort preserved the journal's own order and reported agreement — the sort's tie-breaking rule
  // was silently doing duty as evidence.
  const sorted = [...stamps].sort((a, b) => a.at - b.at);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.at === sorted[i - 1]!.at) {
      return { ...base, verdict: 'inconclusive', hostAgentCount: hostIds.length, detail: `agents ${sorted[i - 1]!.id} and ${sorted[i]!.id} share a timestamp — their relative order cannot be witnessed` };
    }
  }

  // QE round 1 / H2: compare ELEMENT-WISE. `join('|')` collapsed ['x','x|x'] and ['x|x','x'] to the
  // same string, so a reversed order read as agreement — a delimiter chosen for display doing duty
  // as an equality operator.
  const byClock = sorted.map((sv) => sv.id);
  const orderMatches = byClock.length === trace.agentIds.length && byClock.every((id, i) => id === trace.agentIds[i]);
  if (!orderMatches) {
    return { ...base, verdict: 'disagrees', hostAgentCount: hostIds.length, detail: 'the host wall-clock order of the agents differs from the order the trace claims' };
  }

  return {
    ...base,
    verdict: 'agreesWithinScope',
    hostAgentCount: hostIds.length,
    detail: 'the host records agree on which agents ran and in what order. They CANNOT witness ' +
      NOT_WITNESSED.join(', ') + ' — a fabricated one of those would still land here, which is why this is never a bare "agrees"',
  };
}
