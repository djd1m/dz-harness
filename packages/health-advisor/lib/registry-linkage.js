'use strict';
// ha-ca2-registry-vs-publication (ADR-002) — trial-identifier extraction + the ordered linkage
// cascade. This module decides WHETHER there is a link; it never fetches anything (architecture
// §1.1d) and it never judges anything. Fetch-free by construction — see test/registry-comparison-egress.test.js.

// AM-10 / K-18 / NFR-9: pattern SOURCES, never shared RegExp objects. A module-level `g`-flagged
// RegExp mutates its own lastIndex across calls even inside a frozen container, silently skipping
// real identifiers on alternate calls while Object.isFrozen reports green. trialIdPattern() compiles
// a FRESH RegExp per call; no shared `g` instance exists anywhere in this module.
const TRIAL_ID_PATTERN_SOURCES = Object.freeze({
  nct: '\\bNCT\\d{8}\\b',
  isrctn: '\\bISRCTN\\d{8}\\b',
});

// K-3: recognized but NEVER resolved — no repair, no inference, no lookup. The raw token is
// preserved for rendered evidence (AM-2); the registry gets a name, not a guess.
const UNSUPPORTED_REGISTRY_PATTERN_SOURCES = Object.freeze({
  eudract: '\\b\\d{4}-\\d{6}-\\d{2}\\b',
  chictr: '\\bChiCTR[-A-Z]*\\d{7,11}\\b',
  umin: '\\bUMIN\\d{9}\\b',
  anzctr: '\\bACTRN\\d{14}\\b',
  ctri: '\\bCTRI\\/\\d{4}\\/\\d{2}\\/\\d{6}\\b',
});

const ID_PROVENANCE_SOURCES = Object.freeze([
  'pubmed-databank',
  'europepmc-annotation',
  'metadata-regex',
  'body-regex',
  'crossref-corroboration',
  'user-supplied',
]);

const LINK_BASIS = Object.freeze([
  'registration-field',
  'annotated-section',
  'candidate-mention',
]);

const REGISTRATION_SECTIONS = Object.freeze(['METHODS', 'ABSTRACT', 'TRIAL REGISTRATION']);

// K-6 / FR-8: absence of a resolvable link is a property of the indexes consulted — there is no
// `not-registered` state anywhere in this slice.
const NO_LINKAGE_DISCLOSURE =
  'No registry linkage was resolved from the sources consulted (PubMed DataBankList, Europe PMC ' +
  'annotations, article metadata and text). Absence of a resolvable link is a property of those ' +
  'indexes, and this tool draws no conclusion from it about the trial\'s registration status.';

/** Fresh `g`-flagged RegExp per call (AM-10). Two calls return DISTINCT instances. */
function trialIdPattern(kind) {
  const src = TRIAL_ID_PATTERN_SOURCES[kind];
  if (!src) throw new Error(`unknown trial-id pattern kind: ${String(kind)}`);
  return new RegExp(src, 'g');
}

/** Fresh anchored (non-g) validator per call — whole-string form of one supported id. */
function trialIdValidator(kind) {
  const src = TRIAL_ID_PATTERN_SOURCES[kind];
  if (!src) throw new Error(`unknown trial-id pattern kind: ${String(kind)}`);
  return new RegExp(`^${src.replace(/\\b/g, '')}$`);
}

function scanText(text, kind) {
  if (typeof text !== 'string' || text.length === 0) return [];
  const out = [];
  const re = trialIdPattern(kind); // fresh instance — never shared (K-18)
  let m;
  while ((m = re.exec(text)) !== null) out.push(m[0]);
  return out;
}

function textFields(envelope) {
  const fields = [];
  if (envelope && typeof envelope === 'object') {
    if (typeof envelope.title === 'string') fields.push(['title', envelope.title]);
    const meta = envelope.metadata;
    if (meta && typeof meta === 'object') {
      for (const [k, v] of Object.entries(meta)) {
        if (typeof v === 'string') fields.push([`metadata.${k}`, v]);
      }
    }
    if (typeof envelope.abstract === 'string') fields.push(['abstract', envelope.abstract]);
    if (typeof envelope.fullText === 'string') fields.push(['fullText', envelope.fullText]);
  }
  return fields;
}

/**
 * Every identifier candidate in the envelope, in cascade order (ADR-002 §3):
 * pubmed-databank, then europepmc-annotation (section retained), then metadata-regex, then
 * body-regex. A pure, stateless function of its input (K-18): no module-level mutable state is read
 * or written; a malformed/partial token is simply not a mention (K-2 — no 7-digit repair, ever).
 * Returns [{kind, id, source, section, locator}].
 */
function extractTrialIds(envelope) {
  const out = [];
  if (!envelope || typeof envelope !== 'object') return out;

  // 1 — pubmed-databank (structured registration field)
  const banks = envelope.metadata && Array.isArray(envelope.metadata.databankList)
    ? envelope.metadata.databankList : [];
  for (const bank of banks) {
    if (!bank || typeof bank !== 'object') continue;
    const numbers = Array.isArray(bank.accessionNumbers) ? bank.accessionNumbers : [];
    for (const acc of numbers) {
      for (const kind of Object.keys(TRIAL_ID_PATTERN_SOURCES)) {
        if (typeof acc === 'string' && trialIdValidator(kind).test(acc)) {
          out.push({ kind, id: acc, source: 'pubmed-databank', section: null, locator: 'metadata.databankList' });
        }
      }
    }
  }

  // 2 — europepmc-annotation (Accession Numbers; `section` KEPT — K-5, the mandated case's locator)
  const annotations = Array.isArray(envelope.annotations) ? envelope.annotations : [];
  for (const ann of annotations) {
    if (!ann || typeof ann !== 'object') continue;
    if (ann.type !== 'Accession Numbers') continue;
    const exact = ann.exact;
    for (const kind of Object.keys(TRIAL_ID_PATTERN_SOURCES)) {
      if (typeof exact === 'string' && trialIdValidator(kind).test(exact)) {
        const section = typeof ann.section === 'string' ? ann.section : null;
        out.push({ kind, id: exact, source: 'europepmc-annotation', section, locator: section });
      }
    }
  }

  // 3 — metadata-regex, then body-regex, via trialIdPattern() (fresh per call)
  for (const [locator, text] of textFields(envelope)) {
    const isBody = locator === 'abstract' || locator === 'fullText';
    const source = isBody ? 'body-regex' : 'metadata-regex';
    for (const kind of Object.keys(TRIAL_ID_PATTERN_SOURCES)) {
      for (const id of scanText(text, kind)) {
        out.push({ kind, id, source, section: null, locator });
      }
    }
  }

  return out;
}

/**
 * Recognized-but-unsupported registry tokens (K-3), raw text preserved for rendered evidence
 * (AM-2). Never resolved, never repaired, never looked up. Returns [{registry, token, locator}].
 */
function findUnsupportedRegistryTokens(envelope) {
  const out = [];
  for (const [locator, text] of textFields(envelope)) {
    for (const [registry, src] of Object.entries(UNSUPPORTED_REGISTRY_PATTERN_SOURCES)) {
      const re = new RegExp(src, 'g'); // fresh per call — same AM-10 rule
      let m;
      while ((m = re.exec(text)) !== null) out.push({ registry, token: m[0], locator });
    }
  }
  return out;
}

function distinctIds(candidates) {
  return [...new Set(candidates.map((c) => c.id))];
}

/**
 * The ORDERED cascade (ADR-002 §3 / §Decision): pubmed-databank, europepmc-annotation,
 * metadata-regex, body-regex. First non-empty step wins; crossref-corroboration is NEVER a
 * resolving step. Within the winning step, more than one DISTINCT id is ambiguous and resolves to
 * null (the caller renders `no-registry-linkage`, never a guess). A body-only identifier resolves
 * with the SAME shape as a metadata one (K-5 — the mandated case, not an edge case).
 * Returns { trial_id, id_provenance, link_basis } | null.
 */
function resolveLinkage(envelope) {
  const all = extractTrialIds(envelope);

  const steps = [
    ['pubmed-databank', () => ({ basisOf: () => 'registration-field', provenance: (c) => ({ source: 'pubmed-databank' }) })],
    ['europepmc-annotation', () => ({
      basisOf: (c) => {
        const sec = typeof c.section === 'string' ? c.section.toUpperCase() : null;
        return sec && REGISTRATION_SECTIONS.includes(sec) ? 'annotated-section' : 'candidate-mention';
      },
      provenance: (c) => ({ source: 'europepmc-annotation', section: c.section }),
    })],
    ['metadata-regex', () => ({ basisOf: () => 'registration-field', provenance: () => ({ source: 'metadata-regex' }) })],
    ['body-regex', () => ({ basisOf: () => 'candidate-mention', provenance: () => ({ source: 'body-regex' }) })],
  ];

  for (const [source, make] of steps) {
    const candidates = all.filter((c) => c.source === source);
    if (candidates.length === 0) continue;
    const ids = distinctIds(candidates);
    if (ids.length !== 1) return null; // ambiguous within the winning step — no guessing
    const winner = candidates[0];
    const { basisOf, provenance } = make();
    const linkage = {
      trial_id: winner.id,
      id_provenance: provenance(winner),
      link_basis: basisOf(winner),
    };
    assertLinkageWellFormed(linkage);
    return linkage;
  }
  return null;
}

/** Fail-closed (K-4): throws on any non-null linkage whose provenance or basis is off the frozen sets. */
function assertLinkageWellFormed(x) {
  if (x === null || x === undefined) return;
  if (typeof x !== 'object') throw new TypeError('linkage must be an object or null');
  if (typeof x.trial_id !== 'string' || x.trial_id.length === 0) {
    throw new TypeError('linkage.trial_id must be a non-empty string');
  }
  const source = x.id_provenance && x.id_provenance.source;
  if (!ID_PROVENANCE_SOURCES.includes(source)) {
    throw new TypeError(`linkage.id_provenance.source not in ID_PROVENANCE_SOURCES: ${String(source)}`);
  }
  if (!LINK_BASIS.includes(x.link_basis)) {
    throw new TypeError(`linkage.link_basis not in LINK_BASIS: ${String(x.link_basis)}`);
  }
}

module.exports = {
  TRIAL_ID_PATTERN_SOURCES,
  UNSUPPORTED_REGISTRY_PATTERN_SOURCES,
  ID_PROVENANCE_SOURCES,
  LINK_BASIS,
  REGISTRATION_SECTIONS,
  NO_LINKAGE_DISCLOSURE,
  trialIdPattern,
  extractTrialIds,
  findUnsupportedRegistryTokens,
  resolveLinkage,
  assertLinkageWellFormed,
};
