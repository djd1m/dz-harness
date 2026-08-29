'use strict';

// attach.js — the merge, and the second half of the chokepoint (05_architecture.md §5.3).
//
// `MergedObservation` is constructible ONLY here, and its `audit` field is non-optional, because
// it is carried across from the readout the ticket was minted for. There is no path from raw
// third-party JSON to a rendered interpretation that does not pass through this function.
//
// THE off-ticket check below is the discrimination target named in the plan (§5): delete its
// condition and T5 / T16(b) must go red.

const { WITHHELD_REASONS } = require('./conditions.js');
const ticketing = require('./ticket.js');
const acl = require('./acl-lab-results.js');

/**
 * attach(ticket, coworkerJson) → MergedReadout
 *
 * Throws TicketMismatch for an off-ticket analyte, a reused ticket, or a foreign ticket.
 * An unusable engine response is NOT an error and NOT "no findings": every admitted observation
 * degrades to withheld/`engine_unavailable`. Fail-closed, the same shape the package already uses
 * for `LISTING_ONLY` and "emptiness is unevaluable, not clean".
 */
function attach(ticket, coworkerJson) {
  const rec = ticketing.consume(ticket); // throws: foreign / reused
  const readout = rec.readout;
  // QE F4: the AUTHORITATIVE admitted set is the ledger's, not the caller's `ticket.admitted`.
  // `Object.freeze` never froze a Set's contents, so the old `ticket.admitted.has(...)` could be
  // widened from outside this module and the off-ticket refusal simply stopped firing.
  const admitted = rec.admitted;

  const unavailable = acl.isUnavailable(coworkerJson);
  const rows = acl.fromEngineOutput(coworkerJson);

  // ── the off-ticket refusal ────────────────────────────────────────────────────────────────
  // Anything the engine interpreted that this ticket did not admit means the engine was shown a
  // value the guard withheld. Refuse the whole merge; do not scrub and continue.
  for (const row of rows) {
    if (!admitted.has(row.analyte_id)) {
      throw new ticketing.TicketMismatch(
        'off-ticket',
        'the engine returned an interpretation for ' + JSON.stringify(row.analyte_id) +
        ', which this ticket never admitted — the engine was shown a withheld value'
      );
    }
  }

  const byAnalyte = new Map(rows.map((r) => [r.analyte_id, r]));

  const merged = readout.observations.map((o) => {
    if (!o.interpretable) return Object.freeze({ ...o, engine: null });
    if (unavailable) {
      return Object.freeze({
        ...o,
        interpretable: false,
        withheld_reason: WITHHELD_REASONS.ENGINE_UNAVAILABLE,
        engine: null,
      });
    }
    const row = byAnalyte.get(o.analyte_id) || null;
    if (row === null) {
      // Admitted, sent, and nothing came back for it — the same fail-closed direction.
      return Object.freeze({
        ...o,
        interpretable: false,
        withheld_reason: WITHHELD_REASONS.ENGINE_UNAVAILABLE,
        engine: null,
      });
    }
    return Object.freeze({ ...o, engine: row });
  });

  const suppressed = merged.filter((o) => !o.interpretable).map((o) => o.analyte_id);

  return Object.freeze({
    produced_at: readout.produced_at,
    merged_at: new Date().toISOString(),
    conditions: readout.conditions,
    observations: Object.freeze(merged),
    requirements: readout.requirements,
    unencoded: readout.unencoded,
    suppressed: Object.freeze(suppressed),
    engine_available: !unavailable,
    engine_aggregates: acl.aggregatesOf(coworkerJson),
    total_observed: readout.observations.length,
  });
}

module.exports = { attach, TicketMismatch: ticketing.TicketMismatch };
