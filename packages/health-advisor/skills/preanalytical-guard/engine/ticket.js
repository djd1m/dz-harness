'use strict';

// ticket.js — the STRUCTURAL CHOKEPOINT (05_architecture.md §5.3).
//
// `evaluate()` mints an AdmissionTicket naming exactly the analytes it admitted. `attach()`
// refuses any interpretation the ticket does not cover. The cheat this defeats is the obvious
// one: run the third-party engine on EVERYTHING and merge afterwards. That path now fails loudly
// instead of passing quietly.
//
// Three refusals, all of them the same refusal:
//   off-ticket  — the JSON carries an analyte this ticket never admitted
//   reused      — the ticket was already consumed by an earlier attach()
//   foreign     — the ticket was not minted by this module (or has been evicted, see below)
//
// Issued tickets are held in a bounded ledger. Eviction makes a very old ticket read as FOREIGN,
// which fails closed — the safe direction.

const crypto = require('node:crypto');

const LEDGER_LIMIT = 256;
const ledger = new Map(); // nonce → { admitted:Set<string>, readout, consumed:boolean }

class TicketMismatch extends Error {
  constructor(reason, detail) {
    super('admission ticket refused (' + reason + '): ' + detail);
    this.name = 'TicketMismatch';
    this.reason = reason;
  }
}

/**
 * A Set whose CONTENTS cannot be changed.
 *
 * QE F4 (MEASURED 2026-08-05): `Object.freeze(new Set(...))` freezes the object's own properties
 * and does NOTHING to the set's contents — `frozenSet.add('Total Testosterone')` succeeded on a
 * ticket minted empty for a withheld value. Freezing a Set is a false guarantee, so the mutators
 * are refused explicitly instead.
 *
 * This is defence in depth, not the fix. The fix is that `attach()` now reads the LEDGER copy;
 * see `admittedOf()`.
 */
function sealedSet(values) {
  const set = new Set(values);
  const refuse = (op) => () => {
    throw new TicketMismatch('tampered', 'AdmissionTicket.admitted is immutable — ' + op + '() is refused');
  };
  set.add = refuse('add');
  set.delete = refuse('delete');
  set.clear = refuse('clear');
  return Object.freeze(set);
}

function mint(admittedIds, readout) {
  const nonce = crypto.randomBytes(16).toString('hex');
  const admitted = new Set(admittedIds);
  const ticket = Object.freeze({
    nonce,
    admitted: sealedSet(admitted),
    issued_at: new Date().toISOString(),
  });
  ledger.set(nonce, { admitted, readout, consumed: false });
  while (ledger.size > LEDGER_LIMIT) ledger.delete(ledger.keys().next().value);
  return ticket;
}

/** The ledger record for a ticket, or throw. Unknown nonce ⇒ FOREIGN. */
function record(ticket) {
  if (ticket === null || typeof ticket !== 'object' || typeof ticket.nonce !== 'string') {
    throw new TicketMismatch('foreign', 'not an AdmissionTicket minted by evaluate()');
  }
  const rec = ledger.get(ticket.nonce);
  if (!rec) throw new TicketMismatch('foreign', 'nonce ' + ticket.nonce.slice(0, 8) + '… was not minted by this run');
  return rec;
}

/**
 * The AUTHORITATIVE admitted set for a ticket — the ledger's copy, never the caller's.
 *
 * QE F4: `attach()` used to check `ticket.admitted`, the copy held by whoever calls it, while the
 * ledger's `rec.admitted` was consulted by `verify()` alone. So the off-ticket refusal could be
 * disarmed from outside the module by widening the caller's own Set. Everything that DECIDES must
 * read this function; `ticket.admitted` stays as a read-only view for callers who want to look.
 */
function admittedOf(ticket) {
  return record(ticket).admitted;
}

/** True when `analyteId` is inside this ticket's admitted set. Throws for a foreign ticket. */
function verify(ticket, analyteId) {
  return admittedOf(ticket).has(analyteId);
}

/** Mark the ticket used. A second consume() throws — a ticket is single-use by construction. */
function consume(ticket) {
  const rec = record(ticket);
  if (rec.consumed) {
    throw new TicketMismatch('reused', 'this ticket was already consumed; mint a new one by re-running evaluate()');
  }
  rec.consumed = true;
  return rec;
}

/** The readout the ticket was minted for (attach() needs it to carry audits through). */
function readoutOf(ticket) {
  return record(ticket).readout;
}

module.exports = { mint, verify, consume, readoutOf, record, admittedOf, TicketMismatch, LEDGER_LIMIT };
