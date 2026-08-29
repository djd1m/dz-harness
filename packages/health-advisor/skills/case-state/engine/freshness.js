'use strict';

// freshness.js — how old is OUR COPY of a source (ADR-003, ADR-005).
//
// THE ONE HOME of `ageDays > ttlDays`. Strictly greater: `ageDays === ttlDays` is still FRESH.
// facts.js and render.js CONSUME the verdict object; neither recomputes it. That is what makes the
// discrimination proof (DP-2) a single deletion.
//
// THERE IS NO SOURCE-KIND LITERAL IN THIS FILE — no `guideline`, no `meta_analysis`, no `price`,
// and not even the fallback row's own name: `fallback_row_kind` is read from the DATA, so the code
// asks only "does the table have a row named <whatever the data said>?", never "is this kind X?".
// A `switch (kind)` added here is the exact regression that guard exists to catch (ADR-005 D3),
// and case-state-facts-freshness.test.js greps for every shipped kind, read from the data file.
//
// THERE IS NO `Date.now()` IN THIS FILE — `asOf` is required, so verdicts are reproducible.
//
// FAIL-SAFE DIRECTION (DP-3): an unmatched kind, an absent table, a deleted data file — every one
// of them degrades toward *not fresh*. Nothing degrades toward FRESH.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { ProfileUnreadableError, readJson, parseIsoDate, SHIPPED_REGISTRY_DIR } = require('./schema.js');

const FRESH = 'FRESH';
const STALE_NEEDS_REFETCH = 'STALE_NEEDS_REFETCH';
const FRESHNESS_UNKNOWN = 'FRESHNESS_UNKNOWN';
const STATES = Object.freeze([FRESH, STALE_NEEDS_REFETCH, FRESHNESS_UNKNOWN]);
const DAY_MS = 86400000;

class TtlTableError extends Error {
  constructor(message) { super(message); this.name = 'TtlTableError'; }
}

/**
 * Load the TTL table. `dirs` is the injection seam that makes "extensible by DATA only" a TEST
 * rather than a promise (ADR-005 D2): the shipped directory first, then each injected directory,
 * later rows overriding earlier ones by `kind`.
 *
 * FAIL-CLOSED: one malformed row throws naming the file and row index, and the table loads ZERO
 * rows — never "skip the bad row", because a skipped row means a fact silently inherits a default.
 */
function loadTtlTable(opts = {}) {
  const shipped = opts.shipped === false ? [] : [SHIPPED_REGISTRY_DIR];
  const scan = [...shipped, ...(opts.dirs || [])];
  const rows = new Map();
  let fallbackKind = null;
  for (const dir of scan) {
    const file = path.join(dir, 'recheck-ttl.json');
    if (!fs.existsSync(file)) continue;
    const data = readJson(file, ProfileUnreadableError);
    if (!Array.isArray(data.rows)) throw new TtlTableError(`${file}: "rows" must be an array`);
    if (data.fallback_row_kind !== undefined) {
      if (typeof data.fallback_row_kind !== 'string' || data.fallback_row_kind.trim() === '') {
        throw new TtlTableError(`${file}: "fallback_row_kind" must be a non-empty string when present`);
      }
      fallbackKind = data.fallback_row_kind.trim();
    }
    const staged = [];
    data.rows.forEach((row, i) => {
      const where = `${file}[${i}]`;
      if (row === null || typeof row !== 'object') throw new TtlTableError(`${where}: row must be an object`);
      if (typeof row.kind !== 'string' || row.kind.trim() === '') throw new TtlTableError(`${where}: "kind" must be a non-empty string`);
      const n = row.recheck_ttl_days;
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        throw new TtlTableError(`${where}: "recheck_ttl_days" must be a finite positive integer, got ${JSON.stringify(n)}`);
      }
      if (typeof row.rationale !== 'string' || row.rationale.trim() === '') throw new TtlTableError(`${where}: "rationale" must be non-empty`);
      staged.push([row.kind.trim(), Object.freeze({ ...row, sourceFile: file })]);
    });
    for (const [kind, row] of staged) rows.set(kind, row);
  }
  return Object.freeze({ rows, kinds: Object.freeze([...rows.keys()]), fallbackKind, policyId: policyIdOf(rows, fallbackKind) });
}

/**
 * THE IDENTITY OF THE POLICY A VERDICT WAS COMPUTED UNDER.
 *
 * A verdict is `ageDays > ttlDays` — a claim about a fact AND about the table that supplied the
 * TTL. `dirs` is a documented injection seam (ADR-005 D2), so two tables that disagree about the
 * same kind are ordinary inputs, not an attack: a table giving `price` 3650 days makes an 8-day-old
 * price FRESH. Without an identity, that verdict is indistinguishable from one computed under the
 * shipped 7-day row, and `makeCitedClaim` would honour it in a context governed by the shipped
 * table. So the table gets a digest over exactly what decides a verdict — every kind, its TTL, and
 * the fallback kind — and the digest is bound into the receipt.
 *
 * THE DIGEST IS OVER THE POLICY, NOT OVER WHERE IT WAS READ FROM (F3-4). It used to include each
 * row's absolute `sourceFile`, so ONE byte-identical TTL file loaded via a relative vs an absolute
 * `dirs` spelling, or through a symlink alias, yielded a DIFFERENT id — and `makeCitedClaim` threw
 * `StaleEvidenceError` on a genuine verdict (MEASURED: three spellings of one file, three ids).
 * The path never decided a verdict; only `ageDays > ttlDays` does. Sensitivity is unchanged where
 * it matters and is under test: a TTL value change, a kind added, and a fallback change each flip
 * the id — including a directory-precedence override, because the digest is over the
 * post-override map. `sourceFile` stays on the ROW (verdicts still report `ttlSource`); it simply
 * no longer masquerades as policy.
 *
 * It is an IDENTITY, not a secret: it makes two policies distinguishable, which is all a binding
 * needs. Nothing here claims a caller cannot name its own policy.
 */
function policyIdOf(rows, fallbackKind) {
  const canonical = JSON.stringify({
    fallbackKind,
    rows: [...rows.entries()]
      .map(([kind, row]) => [kind, row.recheck_ttl_days])
      .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 32);
}

function wholeDays(fromMs, toMs) { return Math.floor((toMs - fromMs) / DAY_MS); }

/**
 * THE ONE DEFINITION OF "THE SOURCE KIND" (F-5). Both halves of the gate use it: `freshnessOf` to
 * select a TTL row, and `facts.makeCitedClaim` to decide whether a verdict's binding is about the
 * record being cited.
 *
 *   a non-empty string  ⇒ that name, trimmed          — a DECLARED kind
 *   undefined/null/''   ⇒ `null`                       — UNDECLARED; the fallback row's job
 *   anything else       ⇒ `INVALID_SOURCE_KIND`        — not a name, therefore not a kind
 *
 * There used to be two definitions in one gate, and they disagreed. `freshnessOf` required
 * `typeof === 'string'` and fell through to the 365-day fallback row for everything else, while
 * `makeCitedClaim` coerced with `String()` and therefore MATCHED. MEASURED — fact
 * `{last_fetch_date:"2026-04-07", source_kind:"price"}` at asOf 2026-04-15, verdict minted with
 * `sourceKind:["price"]`: FRESH on the 365-day row (`usedDefault:true`), binding satisfied,
 * `mustBanner:false` — where the honest answer is STALE_NEEDS_REFETCH, age 8 against a 7-day TTL.
 * A typo already buys FRESHNESS_UNKNOWN here (see below); a value that is not even a name must not
 * buy MORE than a typo does. `INVALID_SOURCE_KIND` is a Symbol so it can never equal a kind read
 * from JSON.
 */
const INVALID_SOURCE_KIND = Symbol('invalid-source-kind');

function sourceKindIdentity(sourceKind) {
  if (sourceKind === undefined || sourceKind === null) return null;
  if (typeof sourceKind !== 'string') return INVALID_SOURCE_KIND;
  const trimmed = sourceKind.trim();
  return trimmed === '' ? null : trimmed;
}

// verdict object → the QUESTION it answers: `(fetchDate, sourceKind, asOf, ttlPolicyId)`. Module-
// private, never exported as the map itself, never mutable from outside. The mechanism is
// session.js's WeakMap receipt, reused for the same reason: a verdict is a claim about ONE fact at
// ONE evaluation date under ONE policy, and without a receipt any object shaped like
// `{ state: 'FRESH' }` is indistinguishable from one — including to the code whose whole job is
// refusing to cite a stale fact. Membership cannot be copied: a spread, a clone, a JSON round-trip
// all produce a different object, which is simply not in the map.
//
// `asOf` AND `ttlPolicyId` ARE PART OF THE BINDING (F-3). The receipt bound only the fact half, so
// a GENUINE verdict was valid forever and under any policy. MEASURED — reproducer: a `price` fact
// fetched 2026-01-01, verdict minted with `asOf:"2026-01-02"` (FRESH, age 1), then cited in a
// 2026-04-15 report: `makeCitedClaim` accepted it and returned `mustBanner:false`, while the honest
// verdict for that same fact at 2026-04-15 is STALE_NEEDS_REFETCH at age 104 against a 7-day TTL.
// An output path presenting stale evidence as current is the founding harm of this slice, so the
// evaluation date is now bound, and `makeCitedClaim` requires the caller to state the date (and the
// policy) it is citing UNDER — a verdict minted for a different question is refused, never trusted.
//
// WHAT THE BINDING DOES AND DOES NOT PROMISE (F-8 — the wording, corrected against a measurement).
// It is NOT "a verdict cannot travel between facts". Freshness is a PURE FUNCTION of
// `(fetchDate, sourceKind, asOf, ttlTable)`, so two facts sharing that tuple have IDENTICAL verdicts
// (MEASURED: `vA.state === vB.state`, same ageDays, same ttlDays) and one verdict citing either of
// them is the same answer, not a wrong one. The promise is the accurate, narrower one: a verdict
// cannot travel to a fact with a DIFFERENT `(fetch_date, source_kind)`, to a DIFFERENT evaluation
// date, or to a DIFFERENT TTL policy.
//
// KNOWN CONSTRAINT OF THE MECHANISM, deliberate and left alone: because the receipt is object
// identity, a verdict cannot cross a worker, an IPC boundary or a serialising cache — on the far
// side it is an ordinary object and `makeCitedClaim` refuses it. Compute freshness where you cite it.
const VERDICTS = new WeakMap();

/** Redeem a verdict's receipt. `undefined` ⇒ this object did not come from `freshnessOf`. */
function verdictBinding(verdict) {
  if (verdict === null || typeof verdict !== 'object') return undefined;
  return VERDICTS.get(verdict);
}

function mint(verdict, binding) {
  VERDICTS.set(verdict, Object.freeze({
    fetchDate: binding.fetchDate,
    sourceKind: binding.sourceKind,
    asOf: binding.asOf,
    ttlPolicyId: binding.ttlPolicyId,
  }));
  return verdict;
}

function unknown(reason, extra = {}) {
  return Object.freeze({
    state: FRESHNESS_UNKNOWN, ageDays: null, ttlDays: null,
    matchedKind: null, usedDefault: false, reason, ...extra,
  });
}

/**
 * The three-valued verdict (ADR-003 §1).
 *   missing / unparseable / future fetchDate ⇒ FRESHNESS_UNKNOWN, the `reason` naming which
 *   ageDays  >  ttlDays                      ⇒ STALE_NEEDS_REFETCH
 *   otherwise                                ⇒ FRESH
 * An unmatched kind uses the default ROW and says so (`usedDefault:true, matchedKind:null`) —
 * deliberately NOT `TTL_DAYS.get(kind, default)`, which resolves a typo into a plausible number
 * with nothing to see (ADR-001 D6).
 */
function freshnessOf({ fetchDate, sourceKind, asOf, ttlTable }) {
  if (ttlTable === undefined || ttlTable === null || !(ttlTable.rows instanceof Map)) {
    throw new TypeError('freshnessOf() requires a ttlTable from loadTtlTable() — the table is injected data, never require()d here');
  }
  const asOfMs = parseIsoDate(asOf);
  if (asOfMs === null) throw new TypeError(`freshnessOf() requires an explicit ISO asOf date, got ${JSON.stringify(asOf)}`);
  const receipt = { fetchDate, sourceKind, asOf, ttlPolicyId: ttlTable.policyId };
  // Every verdict carries the evaluation date and the policy it was computed under, on the object
  // AND in the receipt: the object so a reader can see it, the receipt so `makeCitedClaim` can
  // refuse a verdict minted for a different question (F-3).
  const stamp = (verdict) => mint(Object.freeze({ ...verdict, asOf, ttlPolicyId: receipt.ttlPolicyId }), receipt);

  if (fetchDate === undefined || fetchDate === null || fetchDate === '') {
    return stamp(unknown('fetch_date is absent — the freshness question cannot be dodged by omitting the field'));
  }
  const fetchMs = parseIsoDate(fetchDate);
  if (fetchMs === null) return stamp(unknown(`fetch_date ${JSON.stringify(fetchDate)} is not an ISO YYYY-MM-DD calendar date`));
  if (fetchMs > asOfMs) return stamp(unknown(`fetch_date ${fetchDate} is in the future relative to asOf ${asOf} — implausible, and a future date must not be fresh forever`));

  // "NO KIND WAS DECLARED" AND "A KIND WAS DECLARED THAT THIS TABLE DOES NOT KNOW" ARE DIFFERENT
  // FACTS, AND ONLY THE FIRST MAY USE THE FALLBACK ROW.
  //
  // The header of this file promises: "an unmatched kind … degrades toward *not fresh*. Nothing
  // degrades toward FRESH." The code did the opposite, and it was MEASURED — reproducer:
  // `sourceKind:"prcie"` (one transposition away from the shipped `price`) took the 365 d fallback
  // row, so an 8-day-old price came back FRESH, while the same fact spelled `price` was
  // STALE_NEEDS_REFETCH under its 7 d row. A typo bought a 52× longer TTL. The verdict did carry
  // `usedDefault:true`, but `renderCitedClaim` returns the bare body for a FRESH verdict, so that
  // flag reached NO output surface at all — invisible in exactly the case where it mattered.
  //
  // This is also the failure ADR-001 D6 is quoted against three lines below its own violation:
  // "deliberately NOT `TTL_DAYS.get(kind, default)`, which resolves a typo into a plausible number
  // with nothing to see". A declared kind the table does not know is now FRESHNESS_UNKNOWN — the
  // state that means "we cannot answer", which is the honest answer to a name nobody defined.
  //
  // The fallback row keeps its job: a fact with NO source_kind (record() stores `null` when the
  // caller omits it) is not a typo, it is an undeclared kind, and that is what a default is for.
  //
  // AND A VALUE THAT IS NOT A NAME IS NOT A KIND (F-5). `sourceKindIdentity` is the ONE definition,
  // shared with `facts.makeCitedClaim`; a non-string used to fall through to the fallback row here
  // while the citation path's `String()` coercion matched it — 8 days old, FRESH on a 365-day row.
  // It is unanswerable, exactly like a name the table does not know, and for the same reason.
  const declared = sourceKindIdentity(sourceKind);
  if (declared === INVALID_SOURCE_KIND) {
    return stamp(unknown(
      `source kind ${JSON.stringify(String(typeof sourceKind === 'symbol' ? sourceKind.toString() : sourceKind))} ` +
      `is not a string (got ${typeof sourceKind}) — a TTL row is selected by NAME, so a value that is not a ` +
      'name selects nothing. It is not the undeclared case either: the fallback row answers "no kind was ' +
      'given", never "the kind was given as an object". Pass the kind as a string, or omit it.',
      { matchedKind: null, usedDefault: false }
    ));
  }
  const exact = declared === null ? undefined : ttlTable.rows.get(declared);
  if (declared !== null && exact === undefined) {
    return stamp(unknown(
      `source kind ${JSON.stringify(declared)} matches no row in the recheck-TTL table` +
      `${ttlTable.kinds.length === 0 ? ' (the table is empty)' : ` (known kinds: ${ttlTable.kinds.join(', ')})`}` +
      ' — a DECLARED kind the table does not know is unanswerable, never fresh by the fallback row.' +
      ' Fix the spelling, or add the row to registry/recheck-ttl.json.',
      { matchedKind: null, usedDefault: false }
    ));
  }

  const row = exact || (ttlTable.fallbackKind === null ? undefined : ttlTable.rows.get(ttlTable.fallbackKind));
  if (row === undefined) {
    return stamp(unknown(
      ttlTable.rows.size === 0
        ? 'the recheck-TTL table is empty — with no TTL, nothing can be called fresh'
        : 'no source kind was declared and the table ships no fallback row',
      { matchedKind: null, usedDefault: false }
    ));
  }

  const ageDays = wholeDays(fetchMs, asOfMs);
  const ttlDays = row.recheck_ttl_days;
  const base = {
    ageDays, ttlDays,
    matchedKind: exact === undefined ? null : declared,
    usedDefault: exact === undefined,
    ttlSource: row.sourceFile,
  };
  // THE ONE COMPARISON (DP-2). Strictly greater — ageDays === ttlDays is still FRESH.
  if (ageDays > ttlDays) {
    return stamp({ ...base, state: STALE_NEEDS_REFETCH, reason: `our copy is ${ageDays} d old, past the ${ttlDays} d re-check interval` });
  }
  return stamp({ ...base, state: FRESH, reason: `our copy is ${ageDays} d old, within the ${ttlDays} d re-check interval` });
}

module.exports = {
  FRESH, STALE_NEEDS_REFETCH, FRESHNESS_UNKNOWN, STATES,
  TtlTableError, loadTtlTable, freshnessOf, verdictBinding, wholeDays,
  sourceKindIdentity, INVALID_SOURCE_KIND,
};
