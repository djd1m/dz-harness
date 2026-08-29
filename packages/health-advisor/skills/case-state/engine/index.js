'use strict';

// index.js — the public import surface, and part of the guarantee is what is ABSENT.
//
// There is no `readAnalyteUnchecked`, no `makeConclusion(…, {skipReceipt})`, no `session.reopen()`,
// no `facts.get(key, {ignoreTTL})`, no `purge()`, no `compact()`, and no `{skipLock: true}`.
// A path that does not exist cannot be taken by a command nobody has written yet.
// test/case-state-read-in-same-call.test.js asserts this list exactly, so growth is a deliberate,
// visible act rather than a drift.
//
// `record` / `answer` / `withdraw` are deliberately NOT re-exported. They are the two MUTATING
// paths, they are `async` because they take the lock (ADR-007), and they stay module-internal in
// this slice — a narrower public surface than the module, by decision, not by oversight.
//
// `lock.js` is internal for the same reason: a lock on the public surface is a lock somebody
// eventually takes twice, or takes around the wrong thing.

const { openCase } = require('./session.js');
const { makeConclusion } = require('./conclusion.js');
const { freshnessOf } = require('./freshness.js');
const { factKey } = require('./facts.js');
const { ProfileError, FactError } = require('./schema.js');

module.exports = { openCase, makeConclusion, freshnessOf, factKey, ProfileError, FactError };
