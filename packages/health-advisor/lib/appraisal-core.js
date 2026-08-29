'use strict';
// ha-ca1-deterministic-appraisal — the shared contract of the deterministic critical-appraisal
// layer (feature ADR-001, rules-ADR-001..005, AM-7). Constants, construction-time validation,
// rendering, and the derived functions. This module performs NO I/O and reads NO clock.
//
// The kernel import below is the ONE permitted cross-slice import (AM-13): the post-completion-edit
// predicate lives in lib/registry-edit-timing.js and is IMPORTED, never re-declared — not even
// byte-identically. TIMING_DISCLOSURE is rendered verbatim, never re-worded.

const {
  TIMING_DISCLOSURE,
} = require('./registry-edit-timing.js');

// ── Closed enumerations (04_domain_model.md §6) ────────────────────────────────────────────────

const FINDING_VERDICTS = Object.freeze(['no-concern', 'concern', 'unknown']);

const FINDING_KEYS = Object.freeze([
  'domain', 'verdict', 'evidence', 'refutable_by', 'tier', 'author_response_state',
]); // rules-ADR-001 Decision 1 — the ONLY emittable keys

// CA-1's own axis — 6 values, DISJOINT from APPRAISAL_DOMAINS (feature ADR-001, AM-1).
const TRANSPARENCY_DOMAINS = Object.freeze([
  'retraction-status',
  'cites-retracted-work',
  'registration-timing',
  'registry-record-changed-after-completion', // AM-11/X5 — the neutral dated-fact name (shipped T-13)
  'enrollment-reporting-fidelity',
  'results-reporting-timeliness',
]);

// rules-ADR-001's bias-axis vocabulary — declared so axisOf() is total, PRODUCED BY NOTHING here.
const APPRAISAL_DOMAINS = Object.freeze([
  'randomization', 'deviations', 'missing-data', 'measurement',
  'selection', 'statistical-integrity', 'reporting',
]);

const AUTHOR_RESPONSE_STATES = Object.freeze([
  'not-contacted', 'awaiting', 'answered', 'declined',
]); // rules-ADR-005 clause 2; default 'not-contacted'

// rules-ADR-004's four Tier-B members + CA-1's eight (04_domain_model.md §6 — counted off that table).
const UNKNOWN_REASONS = Object.freeze([
  // rules-ADR-004
  'full-text-unavailable',
  'section-absent',
  'section-ambiguous',
  'check-not-applicable',
  // CA-1
  'registry-record-absent',
  'field-absent',
  'field-estimated-not-actual',
  'endpoint-unavailable',
  'index-unavailable',
  'index-coverage-partial',
  'single-source-only',
  'not-orderable-at-available-precision',
  // CA-1 QE F1 — the string has ISO shape but names no day on the calendar (2021-02-29, 2020-13).
  // Distinct from 'not-orderable-at-available-precision': the precision is fine, the DATE is not.
  'date-not-a-calendar-date',
  // CA-1 QE F4 — the record carries the field but does not state it as ACTUAL, and is not ESTIMATED
  // either (type null/absent/'UNKNOWN'). `!== 'ESTIMATED'` is a NEGATION, not the required
  // `=== 'ACTUAL'`; arithmetic on an unlabelled date is arithmetic on an unknown provenance.
  'field-not-recorded-as-actual',
  // CA-1 QE round 3, C3-6 — the check itself THREW on a malformed upstream field. The runner
  // degrades that ONE finding to unknown under this reason instead of aborting the whole appraisal;
  // the degraded quote names the CHECK failing and never reproduces the field's content (the
  // content may be exactly the text the prose gates refuse).
  'check-errored',
]);

// The export shipped CA-2 code folds into VOCABULARY_SOURCE.union (T-14).
// I-23: substring-disjoint from TRANSPARENCY_DOMAINS — shipped T-13 substring-scans every domain
// identifier against this list, so a member appearing INSIDE one of our own identifiers reddens
// the package instantly.
const FORBIDDEN_INTENT_TERMS = Object.freeze([
  'deliberately', 'intentionally', 'in order to hide', 'to conceal', 'p-hacked',
  'gamed', 'manipulated the', 'covered up',
]);

// ADR-011 clause 3 — substitution-judgement vocabulary, banned from every rendered surface and from
// skills/critical-appraisal/**. This definition site is the ONE place these strings may appear in lib/.
const FORBIDDEN_SWITCHING_TERMS = Object.freeze([
  'outcome switching', 'outcome-switching', 'switched', 'swapped', 'substituted',
  'подмена', 'подменил', 'подменены',
]);

// feature ADR-001 clause 4 / I-9 — C7 reports elapsed time, never a legal determination.
// 'violat' is a stem: it catches violation/violated/violates.
const FORBIDDEN_LEGAL_CLAIMS = Object.freeze([
  'violat', 'non-compliant', 'noncompliance', 'unlawful',
]);

// rules-ADR-003 clause 4 — banned claim forms for package prose (README, SKILL.md, references).
const BANNED_QUALITY_CLAIMS = Object.freeze([
  'accurate', 'validated', 'expert-level', 'as good as a human reviewer',
]);

// rules-ADR-002 — refutable_by must be specific; these are not refutation paths.
const GENERIC_REFUTATION_FILLER = Object.freeze([
  'n/a', 'none', 'unknown', 'more information', 'further evidence', 'additional data', 'tbd',
]);

// rules-ADR-004 clause 2 — the concern channel's vocabulary. The unknown channel shares NO member.
const CONCERN_VOCABULARY = Object.freeze([
  'failed', 'missing', 'not met', 'insufficient', 'poor',
]);

// ── CA-1 QE F3: the free-text evidence channel ─────────────────────────────────────────────────
//
// assertFindingWellFormed used to check `typeof quote === 'string'` — a TYPE check standing in for a
// CONTENT check — and renderAppraisal emits the quote verbatim. MEASURED: a finding with
// verdict:'unknown' and quote `field-absent: composite trustworthiness 17% — poor transparency`
// rendered a composite score and a concern-channel word into the table while BOTH named gates
// stayed green. The key allowlist (FINDING_KEYS) is sound; this channel ran underneath it.
//
// A score is not only the key `overallScore`. It is any claim that COMPRESSES the findings into one
// magnitude — and prose is a perfectly good place to write one.
const SCORE_SHAPED_TERMS = Object.freeze([
  'composite', 'score', 'scored', 'scores', 'scoring', 'rating', 'ratings', 'rated',
  'grade', 'graded', 'stars', 'percentile', 'trustworthiness', 'overall quality',
  'out of 10', '/10', 'out of 100', '/100',
]);

/** A bare percentage is a magnitude claim in the one place this package promises none. */
const PERCENTAGE_RE = /\d+(?:\.\d+)?\s*%/;

/** Word-boundary match for alphabetic terms, plain substring for punctuated ones ('/10'). */
function containsTerm(haystack, term) {
  const lower = String(haystack).toLowerCase();
  if (!/^[a-z][a-z ]*$/.test(term)) return lower.includes(term);
  return new RegExp(`\\b${term.replace(/ /g, '\\s+')}\\b`).test(lower);
}

/**
 * CA-1 QE round 2, C-1 — PROVENANCE, NOT VOCABULARY, is what separates "the tool asserts a score"
 * from "the tool quotes the registry". Bare `score`/`grade`/`rating` are standard clinical endpoint
 * nouns (a pain score, a Gleason grade) and a responder-rate endpoint IS a percentage — the round-1
 * bans, written so the tool cannot EMIT a composite, ended up refusing the package's OWN fixture
 * text ("Pain score change"; "Proportion achieving HbA1c < 7.0% at 24 weeks") and forbade an
 * unknown finding from quoting a retraction sentence containing 'failed'.
 *
 * CA-1 QE round 3, C3-1 — round 2's conditioning was a SHAPE check standing in for a VALIDITY
 * check: "non-empty locator" accepted `locator: 'x'`, which re-admitted the round-1 F3 exploit
 * string verbatim (MEASURED), and the comment's claimed control ("WHO is speaking, visibly, in the
 * record") did not exist — renderAppraisal emitted no marker. The door STAYS OPEN (the package
 * must be able to quote its own fixtures — the round-2 legitimate case), but both halves are now
 * real:
 *   - the exemption is grantable only against the MATERIAL the appraisal was built from:
 *     `makeFinding(fields, { material })` — the locator must RESOLVE (a known scheme AND the
 *     identity it names present in the branded bundle: verbatimLocatorResolution below). No
 *     material, no exemption; a wrong identity, no exemption. Construction still cannot prove the
 *     QUOTE is the source's text — what it now proves is that the named source was actually in
 *     front of the tool, and the render marker puts the claim where review sees it;
 *   - the rendered surfaces (renderAppraisal, draftAuthorLetter) mark every verbatim quote
 *     `[verbatim from <locator>]`, so a source quote is never byte-identical to a tool assertion;
 *   - an unknown finding's FIRST evidence quote is the tool's own reason token BY DEFINITION and
 *     may NEVER be verbatim (a "verbatim" head with token-shaped text was the reopened exploit);
 *   - the exemption covers ONLY that item's quote. Non-verbatim quotes, EVERY locator, and
 *     refutable_by remain the tool's own prose and stay under the full content gate.
 */
function isVerbatimSourceQuote(item) {
  return !!item && item.verbatim === true;
}

/**
 * verbatimLocatorResolution(locator, material) -> null when the locator names a source that is
 * actually present in the material the appraisal was built from; otherwise the reason it does not.
 * Closed scheme grammar — `scheme:identifier[#fragment]` — resolved against the branded bundle:
 *   ctgov:<nctId>   the material's answered ctgov record carries EXACTLY this id
 *   doi:<doi>       the doi is the subject, the fetched crossref work, one of its references or
 *                   notices, or a member of the retraction index the material carries
 *   pmid:<digits>   the pmid is the subject
 * An unknown scheme is unresolvable BY DESIGN: a scheme this list cannot check is a locator this
 * gate cannot validate, and an unvalidatable locator is round 2's non-empty string again.
 */
function verbatimLocatorResolution(locator, material) {
  if (!isBundle(material)) {
    return 'no source material was supplied (makeFinding(fields, { material }))';
  }
  const m = /^([a-z][a-z-]*):([^#]+)(?:#.+)?$/.exec(String(locator).trim());
  if (!m) return 'the locator has no scheme:identifier form';
  const scheme = m[1];
  const id = m[2].trim();
  if (id.length === 0) return 'the locator names no identifier';
  const sources = material.sources || {};
  if (scheme === 'ctgov') {
    const reg = sources.ctgovV2;
    if (!reg || reg.answered === false || typeof reg.nctId !== 'string') {
      return 'the material carries no answered registry record';
    }
    if (reg.nctId.toUpperCase() !== id.toUpperCase()) {
      return `the material's registry record is ${reg.nctId}, not ${id}`;
    }
    return null;
  }
  if (scheme === 'doi') {
    const doi = id.toLowerCase();
    const subject = material.subject;
    if (subject && subject.kind === 'doi' && subject.value === doi) return null;
    const cr = sources.crossref;
    if (cr) {
      if (cr.doi === doi) return null;
      if (Array.isArray(cr.referenceDois) && cr.referenceDois.includes(doi)) return null;
      const noticeHas = (list) => Array.isArray(list)
        && list.some((n) => n && typeof n.noticeDoi === 'string' && n.noticeDoi === doi);
      if (noticeHas(cr.notices) || noticeHas(cr.updateTo)) return null;
    }
    const ri = sources.retractionIndex;
    if (ri && ri.retractedDois instanceof Set && ri.retractedDois.has(doi)) return null;
    return `the material carries no record of doi ${doi}`;
  }
  if (scheme === 'pmid') {
    const subject = material.subject;
    if (subject && subject.kind === 'pmid' && String(subject.value) === id) return null;
    return `the material carries no record of pmid ${id}`;
  }
  return `unresolvable locator scheme '${scheme}'`;
}

// ── ADR-001: verbatim CONTAINMENT — the quote text must appear in its resolved record ───────────
//
// `verbatimLocatorResolution` above answers WHO (the locator names a real fetched record).
// `verbatimContainmentReason` answers WHAT (the quote is text that record actually carries). Both
// are required for a `verbatim:true` item; together they turn a layer-4 reviewer check into a
// layer-1 deterministic one.

/** Recursively collect every string leaf of a plain object/array. Pure; ignores non-plain values. */
function stringLeaves(value, out = []) {
  if (typeof value === 'string') { out.push(value); return out; }
  if (Array.isArray(value)) { for (const v of value) stringLeaves(v, out); return out; }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) stringLeaves(v, out);
  }
  return out;
}

/** "verbatim modulo insignificant whitespace": NFC, collapse internal whitespace, trim. Case kept. */
function normalizeVerbatim(s) {
  return String(s).normalize('NFC').replace(/\s+/g, ' ').trim();
}

/**
 * The SPECIFIC record a locator's scheme:id resolves to — the one whose text a verbatim quote must
 * be contained in. Returns the record object, or null when the locator resolves to identity-only
 * with no retrievable text (a subject doi/pmid the material never fetched a text record for).
 * Mirrors the scheme dispatch of verbatimLocatorResolution; only reaches records already proven to
 * exist by that identity check, so it makes no fresh identity decision.
 */
function resolvedSourceRecord(locator, material) {
  if (!isBundle(material)) return null;
  const m = /^([a-z][a-z-]*):([^#]+)(?:#.+)?$/.exec(String(locator).trim());
  if (!m) return null;
  const scheme = m[1];
  const id = m[2].trim();
  const sources = material.sources || {};
  if (scheme === 'ctgov') {
    const reg = sources.ctgovV2;
    return (reg && typeof reg.nctId === 'string' && reg.nctId.toUpperCase() === id.toUpperCase()) ? reg : null;
  }
  if (scheme === 'doi') {
    const doi = id.toLowerCase();
    const cr = sources.crossref;
    // defensive lowercase: the ACL already lowercases cr.doi, but comparing both sides lowercased
    // costs nothing and does not rely on that invariant holding forever (Codex QE, doi-case).
    if (cr && typeof cr.doi === 'string' && cr.doi.toLowerCase() === doi) return cr;
    // subject-doi / referenced-doi / retraction-index resolve by IDENTITY but carry no free text a
    // prose quote could match — no text record ⇒ null ⇒ containment fails closed.
    return null;
  }
  if (scheme === 'pmid') {
    // The pubmed record (translatePubmed) carries only structured notice metadata — no free-text
    // field, no quotable prose — so a pmid locator has NOTHING a verbatim quote could be contained
    // in. Return null so containment fails closed; there is no honest verbatim over a pmid record.
    return null;
  }
  return null;
}

/**
 * null when `quote` (whitespace-normalized) is a substring of the whitespace-normalized string
 * leaves of the record `locator` resolves to; otherwise a named reason. Assumes identity already
 * passed (verbatimLocatorResolution === null); a text-less resolution is a REFUSAL, not a pass.
 */
function verbatimContainmentReason(locator, quote, material) {
  const record = resolvedSourceRecord(locator, material);
  if (record === null) return 'the resolved record carries no retrievable text (no fetched payload to verify against)';
  const haystack = normalizeVerbatim(stringLeaves(record).join('  '));
  const needle = normalizeVerbatim(quote);
  if (needle.length === 0) return 'the quote is empty after normalization';
  return haystack.includes(needle) ? null : 'the quote text does not appear in the resolved source record';
}

/** Every free-text string that is the TOOL'S OWN PROSE on the rendered surface (C-1: verbatim
 *  source quotes are excluded — they are the source speaking, and are gated by locator instead). */
function ownProseOf(finding) {
  const out = [];
  for (const item of (Array.isArray(finding.evidence) ? finding.evidence : [])) {
    if (item && typeof item.quote === 'string' && !isVerbatimSourceQuote(item)) out.push(item.quote);
    if (item && typeof item.locator === 'string') out.push(item.locator);
  }
  if (typeof finding.refutable_by === 'string') out.push(finding.refutable_by);
  return out;
}

// rules-ADR-003 — published human inter-rater agreement, reproduced with comparator + interval.
const HUMAN_AGREEMENT_CEILING = Object.freeze({
  'rob2-two-reviewers': Object.freeze({ kappa: 0.16, ci95: Object.freeze([0.08, 0.24]), source: 'RoB 2 inter-rater literature' }),
  'rob1-between-groups': Object.freeze({ kappa: 0.02, ci95: null, source: 'RoB 1 inter-group literature' }),
  'nos-reviewer-author': Object.freeze({ kappa: -0.004, ci95: null, source: 'NOS reviewer-vs-author literature' }),
});

// rules-ADR-003 — one definition, reused wherever an agreement figure could be read as quality.
const CEILING_DISCLOSURE =
  'Published human reviewers applying the same appraisal instruments reach only slight agreement ' +
  'with each other; agreement figures bound reproducibility, they do not establish correctness.';

// One questioning-voice definition (05_architecture.md §7 rule 3).
const FINDING_VOICE =
  'Each finding is a question put to the public record, not a conclusion about the authors; the ' +
  'evidence named under "what would refute it" would dissolve it.';

// P4 — total over FINDING_VERDICTS, no default branch anywhere. unknown NEVER borrows the concern
// channel or its vocabulary (asserted as set-disjointness, not a hand list).
const VERDICT_PRESENTATION = Object.freeze({
  'no-concern': Object.freeze({ channel: 'no-concern', label: 'no concern found' }),
  concern: Object.freeze({ channel: 'concern', label: 'concern' }),
  unknown: Object.freeze({ channel: 'unknown', label: 'not assessed' }),
});

// ADR-002 — the two live retraction-notice label spellings (MEASURED 2026-08-04: PubMed
// 'Retraction of Publication' -> count 0 with HTTP 200; Europe PMC carries it as its own pubType).
const RETRACTION_LABEL_ALIASES = Object.freeze({
  pubmed: Object.freeze(['Retraction Notice', 'Retracted Publication']),
  'europe-pmc': Object.freeze(['Retraction of Publication']),
});

// ── The bundle brand (04 §5.6 — what makes "is this a subject?" structural) ────────────────────

const BUNDLE_BRAND = 'ca1-source-record-bundle/1';

function isBundle(input) {
  return !!input && typeof input === 'object' && input.__bundle === BUNDLE_BRAND;
}

// ── Construction: VALIDATE, then freeze (AM-7 — pick() is deleted and must not return) ─────────

function assertFindingWellFormed(finding, context = undefined) {
  if (!finding || typeof finding !== 'object') {
    throw new TypeError('finding must be an object');
  }
  for (const key of Object.keys(finding)) {
    if (!FINDING_KEYS.includes(key)) {
      throw new TypeError(`finding key not in FINDING_KEYS: ${key}`);
    }
  }
  for (const key of FINDING_KEYS) {
    if (!(key in finding)) throw new TypeError(`finding is missing required key: ${key}`);
  }
  if (!TRANSPARENCY_DOMAINS.includes(finding.domain)) {
    throw new TypeError(`finding.domain not in TRANSPARENCY_DOMAINS: ${String(finding.domain)}`);
  }
  if (!FINDING_VERDICTS.includes(finding.verdict)) {
    throw new TypeError(`finding.verdict not in FINDING_VERDICTS: ${String(finding.verdict)}`);
  }
  if (!Array.isArray(finding.evidence)) {
    throw new TypeError('finding.evidence must be an array of {quote, locator}');
  }
  for (const item of finding.evidence) {
    if (!item || typeof item !== 'object' || typeof item.quote !== 'string') {
      throw new TypeError('every evidence item requires a string quote');
    }
    if (item.quote.trim().length === 0) {
      throw new TypeError('every evidence item requires a NON-EMPTY quote — an empty cell renders as evidence that was never shown');
    }
    // C-1 — the verbatim flag is exactly `true` and DEMANDS an attribution
    if ('verbatim' in item) {
      if (item.verbatim !== true) {
        throw new TypeError(`an evidence item's verbatim flag must be exactly true: ${String(item.verbatim)}`);
      }
      if (typeof item.locator !== 'string' || item.locator.trim().length === 0) {
        throw new TypeError('a verbatim evidence quote requires a non-empty locator naming its source — an unattributed verbatim quote is prose wearing a flag');
      }
    }
  }
  // F3 — the free-text channel is CLOSED, at construction, for every verdict. A composite claim
  // written in prose is the same claim the FINDING_KEYS allowlist forbids as a key.
  // C-1: the gate reads the TOOL'S OWN PROSE; a verbatim source quote (locator-attributed) is the
  // source speaking and may name its own endpoints ("Pain score change", "… 7.0% …").
  for (const text of ownProseOf(finding)) {
    for (const term of SCORE_SHAPED_TERMS) {
      if (containsTerm(text, term)) {
        throw new TypeError(`finding free text carries score-shaped vocabulary '${term}' — this package emits no composite (ADR-006/P1): ${text}`);
      }
    }
    if (PERCENTAGE_RE.test(text)) {
      throw new TypeError(`finding free text carries a bare percentage — a magnitude claim is a composite in prose: ${text}`);
    }
  }
  // C3-1 — the verbatim exemption must RESOLVE against the appraisal's own material. This runs
  // AFTER the own-prose gate above so a score-bearing locator is refused for what it SAYS before
  // it is refused for what it fails to name.
  for (const item of finding.evidence) {
    if (isVerbatimSourceQuote(item)) {
      const material = context && typeof context === 'object' ? context.material : undefined;
      const mat = material === undefined ? null : material;
      // (1) IDENTITY — the locator names a record actually present in the material (C3-1 round 3).
      const unresolved = verbatimLocatorResolution(item.locator, mat);
      if (unresolved !== null) {
        throw new TypeError(`a verbatim evidence quote's locator must resolve to a source in the appraisal's own material — ${unresolved}: ${String(item.locator)}`);
      }
      // (2) CONTAINMENT (ADR-001) — the quote TEXT must actually appear in that resolved record.
      // Identity certifies WHO is speaking; containment certifies WHAT was said. A locator that
      // resolves by identity-only to a record with no retrievable text (a subject doi/pmid with no
      // fetched crossref/pubmed record; a retraction record of DOIs and reason-codes) has no leaves
      // that can contain a prose sentence, so this fails closed: no fetched text ⇒ no verbatim.
      const notContained = verbatimContainmentReason(item.locator, item.quote, mat);
      if (notContained !== null) {
        throw new TypeError(`a verbatim evidence quote must be CONTAINED in its resolved source record — ${notContained}: ${JSON.stringify(item.quote)} @ ${String(item.locator)}`);
      }
    }
  }
  if (finding.tier !== 'A' && finding.tier !== 'B') {
    throw new TypeError(`finding.tier must be 'A' or 'B': ${String(finding.tier)}`);
  }
  if (!AUTHOR_RESPONSE_STATES.includes(finding.author_response_state)) {
    throw new TypeError(`finding.author_response_state not in AUTHOR_RESPONSE_STATES: ${String(finding.author_response_state)}`);
  }
  if (finding.verdict === 'concern') {
    const r = finding.refutable_by;
    if (typeof r !== 'string' || r.trim().length === 0
        || GENERIC_REFUTATION_FILLER.includes(r.trim().toLowerCase())) {
      throw new TypeError('a concern requires a specific, non-filler refutable_by (rules-ADR-002)');
    }
  }
  if (finding.verdict === 'unknown') {
    // X4/O-9: the closed-set reason travels as the first segment of the first evidence quote.
    const head = finding.evidence[0];
    // C3-1 — the head is the TOOL'S OWN reason token by definition; a "verbatim" head whose text
    // happens to spell a token was exactly how the round-1 exploit re-entered (the token check read
    // only quote.split(':')[0] while the exemption blinded every scan over the rest of the quote).
    if (isVerbatimSourceQuote(head)) {
      throw new TypeError("an unknown finding's FIRST evidence quote is the tool's own reason token — it can never be a verbatim source quote");
    }
    const token = head && typeof head.quote === 'string' ? head.quote.split(':')[0].trim() : null;
    if (token === null || !UNKNOWN_REASONS.includes(token)) {
      throw new TypeError(`an unknown finding's first evidence quote must begin with an UNKNOWN_REASONS token, got: ${String(token)}`);
    }
    // F3 — set-disjointness held between the two channels' LABELS but not their PROSE, so an
    // unknown row could carry a concern-channel word in the one cell nothing was scanning.
    // C-1: own prose only — an unknown finding may QUOTE a source sentence containing 'failed'
    // (a verbatim retraction notice) without that word becoming this tool's verdict.
    for (const text of ownProseOf(finding)) {
      for (const word of CONCERN_VOCABULARY) {
        if (containsTerm(text, word)) {
          throw new TypeError(`an unknown finding's free text carries concern-channel vocabulary '${word}' — unknown never borrows the concern channel (rules-ADR-004 clause 2): ${text}`);
        }
      }
    }
  }
  if (finding.author_response_state === 'answered') {
    // An answered finding must carry its answer (P5 — rendered output may never imply a response
    // that is not shown).
    const carried = finding.evidence.some((e) => typeof e.quote === 'string' && e.quote.startsWith('author-response:'));
    if (!carried) {
      throw new TypeError("an 'answered' finding must carry an 'author-response:' evidence quote");
    }
  }
}

// AM-7: construction VALIDATES; it never filters. There is NO pick() here and none may return —
// a path that discards keys is a path that discards evidence of a defect.
// C3-1: `context.material` (the branded bundle the appraisal was built from) is REQUIRED whenever
// any evidence item claims `verbatim: true` — the exemption resolves against it, never against a
// string alone.
function makeFinding(fields, context = undefined) {
  assertFindingWellFormed(fields, context);
  return Object.freeze({ ...fields });
}

// ── Derived functions (04 §7 — no new record keys) ─────────────────────────────────────────────

// ── The ONE `=== 'ACTUAL'` rule (CA-1 QE F4) ───────────────────────────────────────────────────
//
// A registry date struct is `{date, type}` where `type` is the registry's OWN statement about what
// that date is. Three checks used to reject only `type === 'ESTIMATED'` and then do arithmetic on
// everything else — so `type: null` rendered as "the recorded ACTUAL start date", an observation
// the record never made. A negation is not the required positive: only `=== 'ACTUAL'` licenses
// arithmetic, and only a REAL CALENDAR DATE (F1) licenses ordering.
const ACTUAL_DATE_TYPE = 'ACTUAL';

/**
 * actualDateReason(struct) -> null when the struct carries a calendar-real date the registry states
 * as ACTUAL; otherwise the UNKNOWN_REASONS token naming why arithmetic on it is REFUSED.
 * Total: every non-conforming shape gets a named reason, never a silent pass.
 */
function actualDateReason(struct) {
  if (!struct || typeof struct !== 'object' || typeof struct.date !== 'string') return 'field-absent';
  if (struct.type === 'ESTIMATED') return 'field-estimated-not-actual';
  if (struct.type !== ACTUAL_DATE_TYPE) return 'field-not-recorded-as-actual';
  // lazy require: registry-edit-timing.js is the ONE calendar definition; a static require here
  // would be a cycle (it is required at the top of this file for TIMING_DISCLOSURE — kept lazy so
  // the dependency direction stays readable).
  const { isCalendarDate } = require('./registry-edit-timing.js');
  if (!isCalendarDate(struct.date)) return 'date-not-a-calendar-date';
  return null;
}

/** Total over both axes; THROWS on an unknown domain — a silent default is how the axes merge. */
function axisOf(domain) {
  if (TRANSPARENCY_DOMAINS.includes(domain)) return 'transparency';
  if (APPRAISAL_DOMAINS.includes(domain)) return 'appraisal';
  throw new TypeError(`axisOf: unknown domain: ${String(domain)}`);
}

/** Categorical only; unknown EXCLUDED from the ranking; all-unknown => 'unknown', never 'no-concern'. */
function worstOf(findings) {
  const list = (findings || []).filter((f) => f && typeof f === 'object');
  if (list.some((f) => f.verdict === 'concern')) return 'concern';
  if (list.some((f) => f.verdict === 'no-concern')) return 'no-concern';
  return 'unknown';
}

/** {assessed, notAssessed, of} — adjacent to the table, never a headline. null results not counted. */
function coverageOf(findings) {
  const list = (findings || []).filter((f) => f && typeof f === 'object');
  const assessed = list.filter((f) => f.verdict !== 'unknown').length;
  const notAssessed = list.filter((f) => f.verdict === 'unknown').length;
  return Object.freeze({ assessed, notAssessed, of: TRANSPARENCY_DOMAINS.length });
}

// CALLER TRAP (the cost-ledger lesson, O-3): exit code 2 means "do not read this result as
// complete" — it DOMINATES 1, so a CI consumer keyed on `exit == 1` will MISS a rendered concern
// on a metadata-poor subject. If you branch on this code, treat 2 as "look at the output", never
// as "no concern". A result !== 1 must not be read as "no concern found".
function appraisalExitCode(findings) {
  const list = (findings || []).filter((f) => f && typeof f === 'object');
  if (list.length > 0) {
    const unknowns = list.filter((f) => f.verdict === 'unknown').length;
    if (unknowns / list.length > 0.5) return 2; // checked FIRST — 2 dominates 1
  }
  if (list.some((f) => f.verdict === 'concern')) return 1;
  return 0;
}

// ── The cross-slice entry point shipped T-13 calls (04 §5.6) ───────────────────────────────────

/** null (not 'unknown', not a throw) when input is not a branded SourceRecordBundle. */
function checkForDomain(domain, input) {
  if (!TRANSPARENCY_DOMAINS.includes(domain)) {
    throw new TypeError(`checkForDomain: unknown domain: ${String(domain)}`);
  }
  if (!isBundle(input)) return null; // no subject => no finding — never a verdict, never a throw
  // lazy require: core is imported by every check module; the dispatch table would be a cycle at load
  const { CHECKS_BY_DOMAIN } = require('./appraisal-run.js');
  const check = CHECKS_BY_DOMAIN[domain];
  /* istanbul ignore next -- TRANSPARENCY_DOMAINS and the check table are co-maintained */
  if (!check) throw new TypeError(`no check registered for domain: ${domain}`);
  return check.evaluate(input, { now: input.observedAt || null });
}

// ── Render (05_architecture.md §7) ─────────────────────────────────────────────────────────────

const AXIS_STATEMENT =
  'Transparency of reporting — deterministic checks on registry and publisher metadata. ' +
  'This is NOT an assessment of risk of bias; the two are empirically unrelated.';

// ── R4-1: the provenance marker is UNFORGEABLE from data ───────────────────────────────────────
//
// C3-1's `[verbatim from <locator>]` marker was plain interpolated text, and an external
// Retraction Watch reason code spelled `…" [verbatim from doi:10.9999/authoritative-source]`
// rendered a valid-looking marker out of check 02's NON-verbatim quote (MEASURED — external data
// forging the very control meant to expose it). The fix is structural, at the render sites: every
// rendered quote and locator has `\` and `"` escaped, so the ONE unescaped `"` that closes a
// rendered quote is always the renderer's own, and the marker — emitted from the item's own
// `verbatim` flag, never from text — is valid-looking only in a position no data can reach.
// ESCAPING, NOT REJECTION: a construction-time throw on external text would let that same
// external string abort the finding (check-errored degradation) and suppress a real concern —
// the forgery would become a denial-of-verdict lever. Nothing legitimate is refused: the text
// still renders, attributed, with its quote characters visibly escaped.
function escapeRenderedText(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const NOT_CONTACTED_NOTICE = 'The authors have not been contacted about any finding above.';

/**
 * Renders the subject by ITERATING FINDING_KEYS — an allowlist by construction, and therefore
 * USELESS as a no-composite gate (the gate reads the unfiltered --json path instead, §5.3).
 * BELT, labelled as one: this renderer contains no FORBIDDEN_SWITCHING_TERMS / FORBIDDEN_LEGAL_CLAIMS
 * / risk-of-bias vocabulary — the PROOF of the no-composite property is makeFinding's
 * construction-time validation plus the unfiltered --json path, not this function.
 */
function renderAppraisal(subject) {
  const findings = (subject && Array.isArray(subject.findings)) ? subject.findings : [];
  const lines = [];
  lines.push(AXIS_STATEMENT);
  lines.push('');
  lines.push('| domain | verdict | evidence | what would refute it |');
  lines.push('|---|---|---|---|');
  for (const f of findings) {
    const cells = [];
    for (const key of FINDING_KEYS) {
      const value = f[key];
      switch (key) {
        case 'domain':
          cells.push(String(value));
          break;
        case 'verdict':
          cells.push(VERDICT_PRESENTATION[value].label);
          break;
        case 'evidence':
          // C3-1: a verbatim source quote is NEVER byte-identical to a tool assertion — the marker
          // is the visible-provenance control the round-2 comment claimed and did not have.
          // R4-1: quote and locator text is escaped, so no data can close the quote and forge it.
          cells.push((value || []).map((e) => (isVerbatimSourceQuote(e)
            ? `"${escapeRenderedText(e.quote)}" [verbatim from ${escapeRenderedText(e.locator)}]`
            : `"${escapeRenderedText(e.quote)}"${e.locator ? ` (${escapeRenderedText(e.locator)})` : ''}`)).join('; '));
          break;
        case 'refutable_by':
          cells.push(value ? String(value) : '');
          break;
        case 'tier':
        case 'author_response_state':
          // rendered below the table, not as columns
          break;
        /* istanbul ignore next -- FINDING_KEYS is frozen; no other key exists */
        default:
          break;
      }
    }
    lines.push(`| ${cells.join(' | ')} |`);
    if (f.domain === 'registry-record-changed-after-completion') {
      // rule 5: imported, verbatim, unconditional on the C4/C5 row
      lines.push(`  ${TIMING_DISCLOSURE}`);
    }
    if (f.author_response_state === 'answered') {
      const answer = (f.evidence || []).find((e) => e.quote.startsWith('author-response:'));
      /* istanbul ignore else -- assertFindingWellFormed guarantees the quote exists */
      // R4-1: an author's answer is external text — escaped like every other rendered channel
      if (answer) lines.push(`  author response: ${escapeRenderedText(answer.quote.slice('author-response:'.length).trim())}`);
    }
  }
  const cov = subject && subject.coverage ? subject.coverage : coverageOf(findings);
  lines.push('');
  lines.push(`assessed ${cov.assessed} of ${cov.of} · not assessed ${cov.notAssessed} of ${cov.of}`);
  lines.push(`worst verdict recorded: ${worstOf(findings)} (unknown excluded from this ranking)`);
  if (findings.every((f) => f.author_response_state === 'not-contacted')) {
    lines.push(NOT_CONTACTED_NOTICE);
  }
  lines.push(FINDING_VOICE);
  return lines.join('\n');
}

/** Pure string builder; local session/file only — no I/O here (P5). C3-1: re-validation of a
 *  finding that carries verbatim quotes needs the same material its construction did. */
function draftAuthorLetter(finding, context = undefined) {
  assertFindingWellFormed(finding, context);
  const lines = [];
  lines.push('Dear authors,');
  lines.push('');
  lines.push(`A deterministic transparency check of the public record raised a question in the domain "${finding.domain}":`);
  for (const e of finding.evidence) {
    // R4-1: same escaping as renderAppraisal — the letter is a rendered surface too
    lines.push(isVerbatimSourceQuote(e)
      ? `  - "${escapeRenderedText(e.quote)}" [verbatim from ${escapeRenderedText(e.locator)}]`
      : `  - "${escapeRenderedText(e.quote)}"${e.locator ? ` (${escapeRenderedText(e.locator)})` : ''}`);
  }
  lines.push('');
  lines.push(`It would be dissolved by: ${finding.refutable_by}`);
  lines.push('');
  lines.push('We would welcome that evidence and will record your response beside the finding.');
  return lines.join('\n');
}

module.exports = {
  FINDING_VERDICTS,
  FINDING_KEYS,
  TRANSPARENCY_DOMAINS,
  APPRAISAL_DOMAINS,
  AUTHOR_RESPONSE_STATES,
  UNKNOWN_REASONS,
  FORBIDDEN_INTENT_TERMS,
  FORBIDDEN_SWITCHING_TERMS,
  FORBIDDEN_LEGAL_CLAIMS,
  BANNED_QUALITY_CLAIMS,
  GENERIC_REFUTATION_FILLER,
  CONCERN_VOCABULARY,
  SCORE_SHAPED_TERMS,
  HUMAN_AGREEMENT_CEILING,
  CEILING_DISCLOSURE,
  FINDING_VOICE,
  VERDICT_PRESENTATION,
  RETRACTION_LABEL_ALIASES,
  BUNDLE_BRAND,
  isBundle,
  AXIS_STATEMENT,
  NOT_CONTACTED_NOTICE,
  assertFindingWellFormed,
  makeFinding,
  verbatimLocatorResolution,
  verbatimContainmentReason,
  resolvedSourceRecord,
  stringLeaves,
  normalizeVerbatim,
  ACTUAL_DATE_TYPE,
  actualDateReason,
  axisOf,
  worstOf,
  coverageOf,
  appraisalExitCode,
  checkForDomain,
  escapeRenderedText,
  renderAppraisal,
  draftAuthorLetter,
};