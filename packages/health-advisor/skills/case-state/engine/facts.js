'use strict';

// facts.js — a content-addressed registry of verified claims (ADR-004), with an explicit staleness
// state on the citation path (ADR-003 §4) and mutual exclusion on the one write path (ADR-007).
//
// IDENTITY HAS EXACTLY ONE DEFINITION (`factKey`, below). Normalisation is STRUCTURAL — Unicode
// composition form, whitespace runs, URL grammar — and nothing else. No synonym table, no stopword
// list, no stemmer, no case folding of the claim, no punctuation stripping. A lexical table is "an
// enumeration wearing an allowlist's clothes"; it is refuted by the next phrasing and it silently
// MERGES claims that differ, which deletes a citation. The resulting miss is stated out loud rather
// than hidden: two paraphrases of one claim are two records, and a mirror URL is a second record.
//
// TWO ORTHOGONAL DURABILITY PROPERTIES, NAMED SEPARATELY SO A FUTURE READER CANNOT CONFLATE THEM
// (ADR-007 Rationale D1):
//   • `saveFacts` writes atomically (temp file + rename) — that answers a TORN READ.
//   • `record()` runs its whole load→modify→write cycle inside `lock.withCaseLock` — that answers a
//     LOST UPDATE. Atomicity cannot prevent one; a lock cannot prevent the other.
//
// READS TAKE NO LOCK AND NO DEPENDENCY (ADR-007 D5): `loadFacts`, `get` and `makeCitedClaim` are
// synchronous and dependency-free, which is what keeps the CLI verbs testable by spawnSync.
//
// This module never requires anything under base/skills/base/goap-research-ed25519/** — that zone
// is frozen. It carries the ACL fields it already signs (`fetch_date`, `evidence_class`, `issuer`,
// `signature`, `study_population`) VERBATIM, and never verifies a signature here.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const lock = require('./lock.js');
const { FactIdentityError, FactCollisionError, StaleEvidenceError, ProfileUnreadableError, readJson, isBlank, parseIsoDate } = require('./schema.js');
const { FRESH, freshnessOf, verdictBinding, sourceKindIdentity, INVALID_SOURCE_KIND } = require('./freshness.js');

const STORE_SCHEMA = 'case-facts-v1';

/**
 * A lone surrogate makes the key STOP BEING A FUNCTION OF THE TEXT, so it is refused at the door.
 *
 * `crypto.update(s, 'utf8')` encodes a JS string as UTF-8, and UTF-8 cannot represent an unpaired
 * surrogate — every one of them is replaced by U+FFFD. The hash is therefore taken over a LOSSY
 * projection of the claim, and two strictly different claims can share a digest. MEASURED, full
 * digests verified — reproducer:
 *   A = "LDL \uD800 is elevated"   B = "LDL � is elevated"     (A !== B, and NFC-unequal)
 *   claimHash(A) === claimHash(B) === c01c2f07…4ca7707, and so does factKey for one source_url.
 * End to end that is A → {created:true}, B → {created:false, verifications:2}: ONE record, A's text
 * kept, B's text silently discarded — a deleted citation, which is the precise harm ADR-004 §4 says
 * the registry must never cause. `loadFacts` could not see it either, because the self-check
 * re-hashes through the SAME lossy encoding and the corrupted merge is self-consistent under it.
 *
 * WHY THE DOOR AND NOT A LOSSLESS ENCODING. Re-hashing over UTF-16 would also restore the function,
 * but it changes EVERY digest ever computed, so every fact store already on disk would fail its own
 * self-check on the next load — a data-destroying migration to fix an input nobody should be able to
 * write. Refusing ill-formed text leaves all well-formed digests byte-identical (the whole real
 * corpus) and makes the bad input unrepresentable. `normalizeClaim`'s NFC does not help: it neither
 * repairs nor rejects a lone surrogate.
 *
 * REACHABLE, not theoretical: `JSON.parse('"\\ud800"')` yields one, and so does any string cut at a
 * UTF-16 code-unit boundary (a truncated title, a sliced abstract).
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:^|[^\uD800-\uDBFF])([\uDC00-\uDFFF])/;

function assertWellFormed(s, what) {
  if (typeof s !== 'string') return;
  const wellFormed = typeof s.isWellFormed === 'function' ? s.isWellFormed() : !LONE_SURROGATE.test(s);
  if (!wellFormed) {
    throw new FactIdentityError(
      `${what} contains an unpaired UTF-16 surrogate, so it is not encodable as UTF-8 without loss. ` +
      'The fact key is a hash of the text, and a lossy encoding makes two DIFFERENT texts share one ' +
      'key — which merges two claims into one record and deletes a citation (ADR-004 §4). Fix the ' +
      'text at its source; case-state will not hash a string it cannot represent.'
    );
  }
}

function sha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }

/** Structural URL normalisation: lowercase scheme+host, drop a default port, drop the fragment. */
function normalizeUrl(sourceUrl) {
  if (isBlank(sourceUrl)) throw new FactIdentityError('a fact needs a non-empty source_url');
  assertWellFormed(sourceUrl, 'source_url');
  let u;
  try { u = new URL(sourceUrl.trim()); } catch (err) { throw new FactIdentityError(`source_url ${JSON.stringify(sourceUrl)} is not a URL: ${err.message}`); }
  u.hash = '';
  if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
  return u.toString();
}

/** The claim half of the identity: NFC, whitespace runs collapsed, trimmed. Nothing else. */
function normalizeClaim(claim) {
  if (isBlank(claim)) throw new FactIdentityError('a fact needs a non-empty claim');
  assertWellFormed(claim, 'claim');
  return claim.normalize('NFC').replace(/\s+/g, ' ').trim();
}

// The NUL separator of ADR-004 §1: it makes the concatenation unambiguous, so no claim/URL pair can
// be re-split into a different pair. `06_implementation_plan.md` T2.1 wrote a SPACE here; a space is
// exactly the character a whitespace-collapsed claim is full of, so the ADR's NUL governs (the
// plan's own rule: where two upstream documents disagree, the later and more specific one wins).
const KEY_SEPARATOR = String.fromCharCode(0);

/** THE ONE DEFINITION of fact identity (ADR-004 §1). */
function factKey({ claim, sourceUrl }) {
  return sha256Hex(normalizeClaim(claim) + KEY_SEPARATOR + normalizeUrl(sourceUrl));
}

function claimHash(claim) { return sha256Hex(normalizeClaim(claim)); }

function emptyStore(storePath) {
  return { schema: STORE_SCHEMA, storePath: path.resolve(storePath), records: Object.create(null) };
}

/**
 * Load a store. FAIL-CLOSED: a conflicting key collision throws `FactCollisionError` and the
 * registry loads ZERO records — a silent merge of two different claims under one key deletes a
 * citation invisibly (ADR-004 §4). Throwing costs a run; merging costs the evidence.
 *
 * WHAT A COLLISION ACTUALLY LOOKS LIKE HERE, stated because ADR-004 §4 describes it as "two records
 * claiming the same key": a JSON object cannot hold two entries under one key — `JSON.parse` keeps
 * the last. So the reachable form of that defect is a record whose STORED `(claim, source_url)` does
 * not hash to the key it sits under: two different claims filed as one, one of them now invisible.
 * That is what the check below detects. Writing a duplicate-key branch instead would have been dead
 * code wearing a guard's clothes — green forever, catching nothing.
 */
function loadFacts(storePath) {
  const abs = path.resolve(storePath);
  if (!fs.existsSync(abs)) return emptyStore(abs);
  const data = readJson(abs, ProfileUnreadableError);
  if (data === null || typeof data !== 'object' || data.records === null || typeof data.records !== 'object') {
    throw new ProfileUnreadableError(`${abs}: a facts store must be an object with a "records" object`);
  }
  const records = Object.create(null);
  for (const [key, rec] of Object.entries(data.records)) {
    if (rec === null || typeof rec !== 'object') throw new FactCollisionError(`${abs}: record "${key}" is not an object`);
    let expected;
    try {
      expected = factKey({ claim: rec.claim, sourceUrl: rec.source_url });
    } catch (err) {
      // THE SELF-CHECK CAN NOW SEE THE ILL-FORMED CLASS. Before the door check, a lone surrogate
      // was invisible here by construction: the check re-hashed through the same lossy UTF-8
      // projection that caused the merge, so the corrupted store agreed with itself. An identity
      // that cannot be COMPUTED is reported as an untrustworthy store — the same fail-closed
      // outcome as a mismatching key, and named, rather than a raw FactIdentityError escaping a
      // read path that documents itself as throwing FactCollisionError.
      if (err instanceof FactIdentityError) {
        throw new FactCollisionError(
          `${abs}: record "${key}" has no computable identity — ${err.message}\n` +
          '  ZERO records were loaded; a key that is not a function of its own text can hide a merge.'
        );
      }
      throw err;
    }
    if (expected !== key) {
      throw new FactCollisionError(
        `${abs}: record stored under key ${key} hashes to ${expected} — the stored claim/source_url ` +
        'pair does not match its own key; the store is not trustworthy and ZERO records were loaded'
      );
    }
    // THE DATE FIELDS MUST AGREE WITH THE LEDGER THEY SUMMARISE. `record()` maintains
    // `first_fetch_date` = the creating verification and `last_fetch_date` = the newest one; a store
    // whose summary diverges from its own `verifications[]` renders a fetch_date that was never
    // verified, and every freshness verdict computed from it is wrong. Read paths take no lock and
    // do no repair, so this is the only place the divergence can be caught — and, like the key
    // check, it costs a run rather than the evidence.
    if (!Array.isArray(rec.verifications) || rec.verifications.length === 0) {
      throw new FactCollisionError(
        `${abs}: record ${key} carries no verifications[] — a fact with no recorded verification is ` +
        'not a verified claim, and "we never checked" must not be loadable as "we did"'
      );
    }
    // A NULL fetch_date is LEGITIMATE and stays so: `record()` refuses to WRITE one ("we never
    // recorded one" must not be writable as "fresh"), but a store may already carry an ASSERTED
    // record whose date is genuinely unknown, and freshnessOf answers FRESHNESS_UNKNOWN for it. What
    // is checked here is AGREEMENT, not presence — a date that is not a string and not null is
    // neither, and is what made `first_fetch_date: {toString:null, valueOf:null}` reach a template
    // literal and throw "Cannot convert object to primitive value" from the CLI.
    const asDate = (d) => (d === undefined || d === null ? null : d);
    for (const [field, v] of [['first_fetch_date', rec.first_fetch_date], ['last_fetch_date', rec.last_fetch_date]]) {
      if (v !== null && v !== undefined && typeof v !== 'string') {
        throw new FactCollisionError(`${abs}: record ${key} has a ${field} that is neither a date string nor null (${typeof v})`);
      }
    }
    const dates = rec.verifications.map((v, i) => {
      if (v === null || typeof v !== 'object') throw new FactCollisionError(`${abs}: record ${key} verifications[${i}] is not an object`);
      if (v.fetch_date !== null && v.fetch_date !== undefined && typeof v.fetch_date !== 'string') {
        throw new FactCollisionError(`${abs}: record ${key} verifications[${i}].fetch_date is neither a date string nor null`);
      }
      return asDate(v.fetch_date);
    });
    const known = dates.filter((d) => d !== null);
    const newest = known.length === 0 ? null : known.reduce((a, b) => (a > b ? a : b));
    if (asDate(rec.last_fetch_date) !== newest) {
      throw new FactCollisionError(
        `${abs}: record ${key} says last_fetch_date ${JSON.stringify(rec.last_fetch_date)} but its ` +
        `newest verification is ${JSON.stringify(newest)} — the summary and the ledger disagree, so ` +
        'every freshness verdict computed from this record would be wrong'
      );
    }
    if (asDate(rec.first_fetch_date) !== dates[0]) {
      throw new FactCollisionError(
        `${abs}: record ${key} says first_fetch_date ${JSON.stringify(rec.first_fetch_date)} but its ` +
        `first verification is ${JSON.stringify(dates[0])} — first_fetch_date is immutable after ` +
        'creation (ADR-004 §3), so a divergence means it was rewritten'
      );
    }
    records[key] = rec;
  }
  return { schema: data.schema || STORE_SCHEMA, storePath: abs, records };
}

/**
 * Atomic write (temp file + rename). Answers a TORN READ — see the header; it is NOT the lock.
 *
 * IT NOW REFUSES WITHOUT THE LOCK. This function is exported and used to write unconditionally:
 * MEASURED — reproducer: pre-create the lock directory so `withCaseLock` genuinely refuses with
 * `StoreLockTimeoutError`, then call `saveFacts` directly — it wrote the file anyway. That is the
 * LOST UPDATE the lock exists to prevent, reachable from the public API, and the grep-shaped guard
 * in test/case-state-store-mutual-exclusion.test.js part 4(b) cannot see it: it proves where the
 * CALLS in this file sit, not that whoever called the exported function holds anything.
 */
function saveFacts(store) {
  const abs = path.resolve(store.storePath);
  lock.assertCaseLockHeld(path.dirname(abs), 'facts.saveFacts');
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
  fs.writeFileSync(tmp, `${JSON.stringify({ schema: store.schema || STORE_SCHEMA, records: store.records }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, abs);
}

/**
 * Read one record. Synchronous, no lock, no dependency, and NO PURGE — an expired record is
 * returned with an explicit verdict, never deleted and never hidden (ADR-003 §3).
 * `freshness` is computed only when `asOf` and `ttlTable` are supplied.
 */
function get(store, key, opts = {}) {
  const record = store.records[key];
  if (record === undefined) return Object.freeze({ key, record: null, freshness: null });
  const freshness = (opts.asOf !== undefined && opts.ttlTable !== undefined)
    ? freshnessOf({ fetchDate: record.last_fetch_date, sourceKind: record.source_kind, asOf: opts.asOf, ttlTable: opts.ttlTable })
    : null;
  return Object.freeze({ key, record, freshness });
}

/** Every record with its verdict, in key order. Read-only. */
function survey(store, { asOf, ttlTable }) {
  return Object.keys(store.records).sort().map((key) => get(store, key, { asOf, ttlTable }));
}

/**
 * THE ONE MUTATING PATH. `async` because the lock is (ADR-007 D5). The entire load→modify→write
 * cycle is inside `lock.withCaseLock` — a `CaseLockUnavailableError` / `StoreLockTimeoutError` /
 * `StoreLockCompromisedError` propagates and NOTHING is written.
 *
 * Re-verification APPENDS to `verifications[]`; it never duplicates and never overwrites.
 * `first_fetch_date` is immutable after creation, and no existing verification entry is ever
 * mutated (ADR-004 §3).
 */
async function record({ caseDir, storePath, claim, sourceUrl, sourceKind, fetchDate, evidenceClass, issuer, signature, studyPopulation }) {
  const key = factKey({ claim, sourceUrl });          // throws FactIdentityError before any I/O
  if (isBlank(fetchDate)) throw new FactIdentityError('a verification needs a fetch_date — "we never recorded one" must not be writable as "fresh"');
  // THE SOURCE KIND IS TYPE-CHECKED AT THE WRITE DOOR, BY THE ONE DEFINITION (F-5's
  // `sourceKindIdentity`, imported — never a second local notion of "a valid kind"). The citation
  // path already answers a non-string kind fail-closed (FRESHNESS_UNKNOWN), but that guard sits at
  // layer 3 of the cost-of-detection ladder and only fires if someone reaches a citation; the error
  // ORIGINATES here, so the deterministic check belongs here (layer 1). A fact whose provenance kind
  // is not even a NAME must not enter a medical evidence store at all.
  //
  // TYPE, NOT MEMBERSHIP: a typo like "prcie" is a valid STRING and passes this door — the TTL table
  // is the one home of "which names exist", and it answers a typo with FRESHNESS_UNKNOWN downstream.
  // Enumerating kinds here would be a second definition of that question in a second place (the
  // recurring defect class F-5 removed). undefined/null/blank stay accepted: "no kind was declared"
  // is legitimate and is the fallback row's documented job.
  if (sourceKindIdentity(sourceKind) === INVALID_SOURCE_KIND) {
    // The description of the refused value must itself be TOTAL: JSON.stringify throws on a BigInt
    // and on a circular object, and either would replace this clear TypeError with a serialization
    // error naming nothing. The FALLBACK must be total too — `String(v)` throws on its own for a
    // circular object with a throwing `toString`/`Symbol.toPrimitive`, a null-prototype object, or a
    // revoked Proxy (MEASURED 2026-08-11, cross-model QE Q-5: all three escaped as `Error: toString
    // bomb` / `Cannot convert object to primitive value` / `Cannot perform 'get' on a proxy…`, none
    // naming source_kind). `Object.prototype.toString.call(v)` is NOT a safe last resort either — it
    // reads Symbol.toStringTag and so throws on a revoked Proxy. Only a CONSTANT cannot throw.
    let shown;
    try { shown = JSON.stringify(typeof sourceKind === 'symbol' ? sourceKind.toString() : sourceKind) ?? String(sourceKind); }
    catch {
      try { shown = String(sourceKind); }
      catch { shown = '<undescribable value>'; }
    }
    // The TYPE LABEL must be total as well: `Array.isArray` throws on a revoked Proxy ("Cannot
    // perform 'IsArray' on a proxy that has been revoked") — MEASURED, caught by assertion 5b after
    // the value-renderer alone was made total. `typeof` is the only operator here that never throws.
    let kindLabel;
    try { kindLabel = Array.isArray(sourceKind) ? 'array' : typeof sourceKind; }
    catch { kindLabel = typeof sourceKind; }
    throw new TypeError(
      `record(): source_kind must be a string naming the kind, or be omitted/null (= undeclared), ` +
      `got ${kindLabel} ${shown}. ` +
      'A TTL row is selected by NAME; a value that is not a name is not provenance, and it must be ' +
      'refused at the write door rather than stored and answered FRESHNESS_UNKNOWN forever downstream.'
    );
  }
  // THE LOCK SCOPE IS DERIVED FROM THE STORE, never from a caller-supplied sibling (QE G6): with
  // `caseDir || dirname(storePath)`, two writers to the SAME file could take two DIFFERENT locks —
  // the silent lost update ADR-007 exists to prevent, reachable through the documented API. A
  // caseDir that is not the store's own directory is therefore a refusal, not an alternative scope.
  const dir = path.dirname(path.resolve(storePath));
  if (caseDir !== undefined && path.resolve(caseDir) !== dir) {
    throw new TypeError(
      `record(): caseDir ${JSON.stringify(caseDir)} is not the store's own directory ${JSON.stringify(dir)} — ` +
      'the lock scope is derived from the store path, so a sibling caseDir would let a second writer ' +
      'to the same store take a different lock (ADR-007, QE G6)'
    );
  }

  return lock.withCaseLock(dir, async () => {
    const store = loadFacts(storePath);
    const verification = Object.freeze({
      fetch_date: fetchDate,
      evidence_class: evidenceClass === undefined ? null : evidenceClass,
      issuer: issuer === undefined ? null : issuer,
      signature: signature === undefined ? null : signature,
      study_population: studyPopulation === undefined ? null : studyPopulation,
    });
    const existing = store.records[key];
    if (existing === undefined) {
      store.records[key] = {
        key,
        claim,                                   // VERBATIM, so the normalisation stays auditable
        claim_hash: claimHash(claim),
        source_url: normalizeUrl(sourceUrl),
        source_kind: sourceKind === undefined ? null : sourceKind,   // a string or null — the door check above refused everything else
        first_fetch_date: fetchDate,
        last_fetch_date: fetchDate,
        verifications: [verification],
      };
      saveFacts(store);
      return Object.freeze({ key, created: true, verifications: 1 });
    }
    existing.verifications = [...existing.verifications, verification];
    existing.last_fetch_date = existing.last_fetch_date > fetchDate ? existing.last_fetch_date : fetchDate;
    if (sourceKind !== undefined && existing.source_kind === null) existing.source_kind = sourceKind;
    saveFacts(store);
    return Object.freeze({ key, created: false, verifications: existing.verifications.length });
  });
}

/**
 * A citation is REFUSED by default when the fact is not FRESH (ADR-003 §4). The only way past is an
 * explicit `acknowledgeStale: { reason }` with a non-empty reason — and the returned object carries
 * `mustBanner: true`, which render.js honours unconditionally. There is no flag, option or
 * environment variable that suppresses the banner.
 *
 * THE CALLER MUST STATE THE DATE AND THE POLICY IT IS CITING UNDER (`asOf`, `ttlTable`) — F-3.
 *
 * The receipt used to bind only `(fetchDate, sourceKind)`, so a GENUINE verdict was valid FOREVER.
 * MEASURED — reproducer: a `price` fact fetched 2026-01-01, verdict minted with `asOf:"2026-01-02"`
 * (FRESH, age 1), cited in a 2026-04-15 report: accepted here, `mustBanner:false`, no banner
 * rendered — while the honest verdict for that fact at 2026-04-15 is STALE_NEEDS_REFETCH, age 104
 * against a 7-day TTL. That is an output path presenting stale evidence as current, which is the
 * founding harm this slice exists to prevent, and it needed no forgery: one real verdict, kept.
 *
 * The same argument covers the TTL policy. `loadTtlTable({dirs})` is a documented seam, so a table
 * that gives `price` 3650 days is an ordinary input; a verdict minted under it says FRESH about an
 * 8-day-old price, and nothing distinguished it from one minted under the shipped 7-day row.
 *
 * So both are now part of the binding, and both are CHECKED here against what the caller declares.
 * HONEST SCOPE: `ttlTable` is an AGREEMENT check between the citing context's table and the
 * verdict's, not a capability — the policy id is a public identity, and a caller who supplies the
 * table it actually evaluated under is exactly the caller this check is for. The unforgeable half
 * is the WeakMap receipt below; this half makes a MISMATCH impossible to miss.
 */
function makeCitedClaim({ fact, freshness, asOf, ttlTable, acknowledgeStale }) {
  if (fact === null || fact === undefined) throw new StaleEvidenceError('makeCitedClaim needs a fact record');
  if (freshness === null || freshness === undefined || typeof freshness.state !== 'string') {
    throw new StaleEvidenceError('makeCitedClaim needs the freshness verdict from freshnessOf() — it never recomputes it');
  }
  if (parseIsoDate(asOf) === null) {
    throw new StaleEvidenceError(
      `makeCitedClaim needs the explicit ISO asOf date this citation is made AT, got ${JSON.stringify(asOf)}. ` +
      'A verdict is only an answer about the day it was computed for; without the date, a genuine ' +
      'FRESH verdict from months ago silently vouches for today (ADR-003 §4).'
    );
  }
  if (ttlTable === null || ttlTable === undefined || typeof ttlTable.policyId !== 'string') {
    throw new StaleEvidenceError(
      'makeCitedClaim needs the recheck-TTL table this citation is governed by (the object from ' +
      'loadTtlTable()) — a verdict computed under a different TTL policy answers a different question.'
    );
  }
  // THE VERDICT MUST BE A REAL ONE, AND IT MUST BE THIS FACT'S.
  //
  // "typeof freshness.state === 'string'" accepted ANY object, so `{ state: 'FRESH' }` removed the
  // unremovable banner — MEASURED: a decade-old fact cited with a forged verdict returned
  // `mustBanner:false`. And even a genuine verdict was unbound: nothing related it to the record it
  // was computed for, so the verdict for a fresh fact could carry a stale one. session.js solves
  // exactly this problem one file over with a module-private WeakMap receipt; freshnessOf now mints
  // the same kind of receipt, and this is where it is redeemed.
  const binding = verdictBinding(freshness);
  if (binding === undefined) {
    throw new StaleEvidenceError(
      'makeCitedClaim needs a verdict MINTED BY freshnessOf() — a look-alike object carrying ' +
      '`state: "FRESH"` is refused. A forged verdict is the one input that removes a banner ' +
      'documented as unremovable (ADR-003 §4).'
    );
  }
  // THE SOURCE KIND IS COMPARED BY THE DEFINITION THAT SELECTED THE TTL ROW (F-5), not by `String()`.
  //
  // `String()` was a SECOND definition of "the kind" living in the same gate as freshness.js's, and
  // the two disagreed: `freshnessOf` treated `["price"]` as undeclared and took the 365-day fallback
  // row, while this comparison coerced it to `"price"` and matched the record — MEASURED, an 8-day-old
  // price cited FRESH with `mustBanner:false` against a 7-day TTL. `sourceKindIdentity` is now the one
  // home for the question, so the binding can only agree when the verdict was computed for the row this
  // record's kind names.
  const asIdentity = (v) => (v === undefined || v === null || v === '' ? null : String(v));
  if (asIdentity(binding.fetchDate) !== asIdentity(fact.last_fetch_date)
      || sourceKindIdentity(binding.sourceKind) !== sourceKindIdentity(fact.source_kind)) {
    throw new StaleEvidenceError(
      `this freshness verdict was computed for fetch_date ${JSON.stringify(binding.fetchDate)} / ` +
      `source_kind ${JSON.stringify(binding.sourceKind)}, but the fact being cited carries ` +
      `${JSON.stringify(fact.last_fetch_date)} / ${JSON.stringify(fact.source_kind)}. A verdict that ` +
      'travels to a fact with a different (fetch_date, source_kind) is a fresh answer to a question ' +
      'nobody asked about this one — re-run freshnessOf() for THIS record.'
    );
  }
  if (binding.asOf !== asOf) {
    throw new StaleEvidenceError(
      `this freshness verdict was computed as-of ${JSON.stringify(binding.asOf)}, but the citation is ` +
      `being made as-of ${JSON.stringify(asOf)}. Freshness is an answer about ONE day: a FRESH verdict ` +
      'from an earlier evaluation stays FRESH forever, which is exactly how stale evidence reaches an ' +
      'output path looking current (ADR-003 §4). Re-run freshnessOf() with this asOf.'
    );
  }
  if (binding.ttlPolicyId !== ttlTable.policyId) {
    throw new StaleEvidenceError(
      `this freshness verdict was computed under recheck-TTL policy ${JSON.stringify(binding.ttlPolicyId)}, ` +
      `but the citation is governed by policy ${JSON.stringify(ttlTable.policyId)}. The TTL table decides ` +
      'the verdict, so a verdict minted under a more permissive table is not an answer under this one. ' +
      'Re-run freshnessOf() with the table this citation is governed by.'
    );
  }
  const isFresh = freshness.state === FRESH;
  if (!isFresh) {
    if (acknowledgeStale === undefined || acknowledgeStale === null) {
      throw new StaleEvidenceError(
        `refusing to cite "${fact.claim}": ${freshness.state} — ${freshness.reason}\n` +
        '  pass acknowledgeStale: { reason: "…" } to cite it anyway; the banner is then unremovable'
      );
    }
    if (isBlank(acknowledgeStale.reason)) {
      throw new StaleEvidenceError('acknowledgeStale.reason must be a non-empty string — an unexplained override is a silent one');
    }
  }
  return Object.freeze({
    claim: fact.claim,
    sourceUrl: fact.source_url,
    fetchDate: fact.last_fetch_date,
    freshness,
    acknowledged: isFresh ? null : acknowledgeStale.reason.trim(),
    mustBanner: !isFresh,
  });
}

module.exports = {
  STORE_SCHEMA, factKey, claimHash, normalizeUrl, normalizeClaim,
  loadFacts, saveFacts, get, survey, record, makeCitedClaim,
};
