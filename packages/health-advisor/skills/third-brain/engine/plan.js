'use strict';

// plan.js — THE PURE HALF (ADR-002). Chunking, the document id, and the `ha-doc-1` header's one
// minter plus its one parser. Zero I/O, zero clock, zero spawn, zero `require` of anything outside
// `node:crypto` — so every leg downstream (write, search, backlinks) can be built and tested
// against a REAL chunker from day one instead of a JSON fixture that drifts from it.
//
// WHY THE HEADER IS A LINE OF TEXT AND NOT A FIELD. `dz teach --from-json` accepts exactly
// `{pattern, type, reward, domain, ts}` and drops every other key (MEASURED — reproducer: read
// `cmdTeach`'s `--from-json` branch at packages/@dzhechkov/harness-cli/src/cli.ts:2356), and
// `PatternRecord['type']` is the closed union 'rule' | 'success-pattern' | 'lesson-learned'. A
// record therefore has no metadata slot at all: `kind`, `case`, `date`, `chunk` and the anchor ids
// travel in the FIRST LINE of `pattern` or they do not travel (ADR-001 D-4, AM-2). The coarse
// `type: 'lesson-learned'` is a compromise recorded in the ADR's Consequences; the TRUE kind is
// `kind=` below.
//
// THE PARSER REFUSES AN UNKNOWN VERSION PREFIX RATHER THAN GUESSING. `ha-doc-1` is a wire format
// with records already on disk: a future `ha-doc-2` that this parser silently half-understood would
// hand back a header whose fields mean something else, and a search result is exactly the place a
// half-understood record looks like a correct one.

const crypto = require('node:crypto');

/**
 * ADR-002's ONE knob, and it is a module constant rather than a CLI flag: a per-invocation budget
 * would make chunk boundaries depend on how the operator typed the command, and a re-ingest under a
 * different budget would mint a SECOND full copy of the document under the same `doc_id`.
 *
 * `skills/third-brain/engine/limits.js` RE-EXPORTS this value (never re-declares it) — one source,
 * because two names for one budget is two budgets the day somebody edits the wrong one.
 */
const CHUNK_BUDGET = 1200;

const HEADER_VERSION = 'ha-doc-1';

// The header's field order is FIXED and the parser does not depend on it — but the renderer keeps it
// stable so a stored record diffs cleanly against another stored record.
const HEADER_FIELDS = Object.freeze([
  'doc_id', 'case', 'kind', 'date', 'chunk', 'doc_sha256', 'doc_path', 'anchors',
]);

/** The sentinel for "this document has no anchors". An EMPTY value would be indistinguishable from
 *  a truncated line, and `anchors=` with nothing after it is exactly what a naive renderer emits. */
const NO_ANCHORS = '-';

class ThirdBrainHeaderError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ThirdBrainHeaderError';
    this.code = 'ETHIRDBRAINHEADER';
    for (const [k, v] of Object.entries(details)) this[k] = v;
  }
}

/** Line endings normalised to `\n`, and nothing else — ADR-002 step 1. No trimming, no case fold,
 *  no entity rewrite: the passage text is a verbatim slice of the document. */
function normalise(text) {
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * chunk(text, opts) -> passages[]  — ADR-002 steps 1-6, PURE.
 *
 * Each passage is `{ text, hard, lead, sep }`:
 *   • `text` — the passage as it will be STORED (what search returns);
 *   • `hard` — true when this passage came from splitting a single paragraph that was longer than
 *     the budget on its own. It is the one place a passage may end mid-sentence, and ADR-002's
 *     monitoring row REPORTS it rather than hiding it;
 *   • `lead` / `sep` — the exact source characters that precede / follow this passage's text and
 *     that are NOT stored (a blank-line separator, the document's own leading whitespace).
 *
 * `lead`/`sep` are what make ADR-002's Confirmation checkable as written — *"concatenating a
 * document's passages in chunk order, WITH PARAGRAPH SEPARATORS RESTORED, reproduces the normalised
 * source text with zero characters lost or duplicated"*. Reassembly is
 * `passages.map(p => p.lead + p.text + p.sep).join('')`, and it is exact:
 *
 *   • the separator BETWEEN two paragraphs packed into one passage is spliced back verbatim, so a
 *     `\n   \n` is not silently normalised to `\n\n` (which a naive `join('\n\n')` would do — and
 *     would then report a lossless round trip on a document it had quietly rewritten);
 *   • the whitespace a hard split cuts at travels in `sep`, so neither side of the cut keeps it and
 *     neither side loses it;
 *   • whitespace-only paragraphs emit NO passage (step 5) and their separators are carried into the
 *     neighbouring `lead`/`sep`, so "zero empty passages" and "zero characters lost" hold together
 *     rather than trading against each other.
 *
 * The greedy packer never trims a paragraph's own interior, and never drops the final partial
 * passage — the classic pack-loop bug, and the target of mutation `third-brain-chunk-lossless`.
 */
function chunk(text, opts = {}) {
  const budget = Number.isFinite(opts.budget) && opts.budget >= 1 ? Math.floor(opts.budget) : CHUNK_BUDGET;
  const normalised = normalise(text);

  // Step 2 — split on a blank line, CAPTURING the separator so it can be restored verbatim.
  // `split` with one capture group yields [para, sep, para, sep, …, para].
  const parts = normalised.split(/(\n\s*\n)/);
  const paragraphs = [];
  for (let i = 0; i < parts.length; i += 2) {
    paragraphs.push({ text: parts[i], sepAfter: parts[i + 1] === undefined ? '' : parts[i + 1] });
  }

  // Step 4 — a paragraph longer than the budget is split BEFORE packing, so the packer only ever
  // sees pieces it can place. Splitting inside the packer would have made "does this fit" depend on
  // whether the thing being placed was already a remainder.
  const pieces = [];
  for (const para of paragraphs) {
    if (para.text.length <= budget) {
      pieces.push({ text: para.text, hard: false, sepAfter: para.sepAfter });
      continue;
    }
    let rest = para.text;
    while (rest.length > budget) {
      const window = rest.slice(0, budget);
      const cut = window.search(/\s\S*$/); // the last whitespace IN RANGE
      // A paragraph with no whitespace in range (a base64 blob, a long URL) is cut at the budget.
      // Falling back to "emit the whole oversized paragraph" would silently defeat the budget.
      if (cut > 0) {
        const ws = /^\s+/.exec(rest.slice(cut))[0];
        pieces.push({ text: rest.slice(0, cut), hard: true, sepAfter: ws });
        rest = rest.slice(cut + ws.length);
      } else {
        pieces.push({ text: window, hard: true, sepAfter: '' });
        rest = rest.slice(budget);
      }
    }
    pieces.push({ text: rest, hard: true, sepAfter: para.sepAfter });
  }

  // Step 3 — greedy pack. A hard piece is never packed WITH another piece: its boundaries are
  // already artificial, and joining it to a neighbour would make the `hard` flag ambiguous about
  // which end of the passage is the artificial one.
  const passages = [];
  let current = null;
  let gap = '';   // characters belonging to no passage yet: the leading whitespace of the document,
                  // or the separators of whitespace-only paragraphs that emit nothing
  const closeCurrent = () => { if (current !== null) { passages.push(current); current = null; } };
  const absorbGap = (extra) => {
    // A dropped stretch attaches to the PREVIOUS passage's trailing `sep` when there is one, and
    // becomes the NEXT passage's `lead` when there is not. Either way it is kept, never discarded.
    if (extra === '') return;
    if (current !== null) current.sep += extra;
    else if (passages.length > 0) passages[passages.length - 1].sep += extra;
    else gap += extra;
  };

  for (const piece of pieces) {
    // Step 5 — NEVER emit an empty passage, and "empty" means WHITESPACE-ONLY, not just zero-length:
    // `'   \n\n  \n'` splits into paragraphs that are non-empty strings carrying no text at all, and
    // storing one would put a record in the brain that no query can ever legitimately match. Its
    // characters are not discarded — they are absorbed into the neighbouring gap, so "zero empty
    // passages" and "zero characters lost" hold together instead of trading against each other.
    if (piece.text.trim() === '') {
      absorbGap(piece.text + piece.sepAfter);
      continue;
    }
    if (piece.hard) {
      closeCurrent();
      passages.push({ text: piece.text, hard: true, lead: gap, sep: piece.sepAfter });
      gap = '';
      continue;
    }
    if (current === null) {
      current = { text: piece.text, hard: false, lead: gap, sep: piece.sepAfter };
      gap = '';
      continue;
    }
    if (current.text.length + current.sep.length + piece.text.length <= budget) {
      current.text += current.sep + piece.text;            // the separator, spliced back VERBATIM
      current.sep = piece.sepAfter;
      continue;
    }
    passages.push(current);
    current = { text: piece.text, hard: false, lead: '', sep: piece.sepAfter };
  }
  // THE FINAL PARTIAL PASSAGE. Dropping it is the mutation `third-brain-chunk-lossless` names, and
  // it is invisible to any assertion that only checks "every passage is within budget".
  closeCurrent();
  // A document that is entirely whitespace emits zero passages; its characters have nowhere to
  // attach and the caller refuses it as a usage error (ADR-002 step 5), so nothing is lost silently.
  if (passages.length > 0 && gap !== '') passages[passages.length - 1].sep += gap;

  return passages;
}

/**
 * docId(docSha256, docPathRelative) -> 16 lowercase hex chars — ADR-002 step 7.
 *
 * The NUL separator is load-bearing: without it `sha256('ab', 'c')` and `sha256('a', 'bc')` would
 * be the same id, and a document whose path shares a prefix boundary with its digest would collide
 * with a different document. Truncation to 16 hex is a display/lookup id, not a security claim —
 * the full `doc_sha256` travels in its own header field for that.
 */
function docId(docSha256, docPathRelative) {
  if (typeof docSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(docSha256)) {
    throw new ThirdBrainHeaderError(`docId: docSha256 must be 64 lowercase hex chars, got ${JSON.stringify(docSha256)}`);
  }
  if (typeof docPathRelative !== 'string' || docPathRelative === '') {
    throw new ThirdBrainHeaderError('docId: docPathRelative must be a non-empty workspace-relative path');
  }
  return crypto.createHash('sha256').update(`${docSha256}\0${docPathRelative}`).digest('hex').slice(0, 16);
}

function requireField(fields, name) {
  const v = fields[name];
  if (typeof v !== 'string' || v === '') {
    throw new ThirdBrainHeaderError(`renderHeader: ${name} is required and must be a non-empty string`, { field: name });
  }
  if (/\s/.test(v)) {
    // WHITESPACE is the one character class the line cannot carry: tokens are space-separated, so a
    // space inside a value would make the line ambiguous to ANY parser, including a correct one.
    //
    // A literal `=` is DELIBERATELY ALLOWED (SP-12). `kind`, `case` and `doc_path` are operator- and
    // filesystem-supplied, and refusing `=` would push the failure onto the ingest of a legitimately
    // named file. It is safe here only because `parseHeader` splits each token on its FIRST `=`; a
    // naive `split('=')` would mis-split it, which is exactly what SP-12's test pins.
    throw new ThirdBrainHeaderError(
      `renderHeader: ${name}=${JSON.stringify(v)} contains whitespace, which the one-line header cannot carry unambiguously`,
      { field: name }
    );
  }
  return v;
}

/**
 * renderHeader(meta) -> the single `ha-doc-1 …` line (ADR-001 D-4).
 *
 * `anchors` is a list of entry ids; an empty list renders as the `-` sentinel (AM-5: an anchor-less
 * document is an ORDINARY document, not a degraded one).
 */
function renderHeader(meta = {}) {
  const anchors = Array.isArray(meta.anchors) ? meta.anchors : [];
  for (const a of anchors) {
    if (typeof a !== 'string' || a === '' || /[\s,=]/.test(a)) {
      throw new ThirdBrainHeaderError(`renderHeader: anchor id ${JSON.stringify(a)} is not a bare token`, { anchor: a });
    }
  }
  const docPath = meta.doc_path === undefined ? meta.docPath : meta.doc_path;
  if (typeof docPath !== 'string' || docPath === '' || /\s/.test(docPath)) {
    throw new ThirdBrainHeaderError(
      `renderHeader: doc_path ${JSON.stringify(docPath)} must be a non-empty whitespace-free workspace-relative posix path`,
      { field: 'doc_path' }
    );
  }
  const fields = {
    doc_id: meta.doc_id === undefined ? meta.docId : meta.doc_id,
    case: meta.case,
    kind: meta.kind,
    date: meta.date,
    chunk: `${meta.chunk}/${meta.m}`,
    doc_sha256: meta.doc_sha256 === undefined ? meta.docSha256 : meta.doc_sha256,
    doc_path: docPath,
    anchors: anchors.length === 0 ? NO_ANCHORS : anchors.join(','),
  };
  const parts = HEADER_FIELDS.map((name) => `${name}=${name === 'doc_path' ? fields[name] : requireField(fields, name)}`);
  return `${HEADER_VERSION} ${parts.join(' ')}`;
}

/**
 * parseHeader(line) -> the inverse object, or throws.
 *
 * SPLIT ON THE FIRST `=` ONLY. A `kind`, a `case` slug or a `doc_path` containing a literal `=` is
 * the one input class a naive `split('=')` mangles — SP-12's dedicated case — and mangling it would
 * hand a search hit back with a truncated path that still LOOKS like a path.
 */
function parseHeader(line) {
  if (typeof line !== 'string') {
    throw new ThirdBrainHeaderError('parseHeader: expected a string');
  }
  const space = line.indexOf(' ');
  const version = space === -1 ? line : line.slice(0, space);
  if (version !== HEADER_VERSION) {
    throw new ThirdBrainHeaderError(
      `parseHeader: unknown header version ${JSON.stringify(version)} — this build reads ${HEADER_VERSION} and refuses ` +
      'to guess at a successor format rather than hand back fields that mean something else.',
      { version }
    );
  }
  const out = {};
  for (const token of line.slice(space + 1).split(' ')) {
    if (token === '') continue;
    const eq = token.indexOf('=');           // FIRST '=', never every '='
    if (eq === -1) {
      throw new ThirdBrainHeaderError(`parseHeader: token ${JSON.stringify(token)} is not a key=value pair`, { token });
    }
    out[token.slice(0, eq)] = token.slice(eq + 1);
  }
  for (const name of HEADER_FIELDS) {
    if (out[name] === undefined) {
      throw new ThirdBrainHeaderError(`parseHeader: header is missing the ${name} field`, { field: name });
    }
  }
  const m = /^(\d+)\/(\d+)$/.exec(out.chunk);
  if (m === null) {
    throw new ThirdBrainHeaderError(`parseHeader: chunk=${JSON.stringify(out.chunk)} is not <n>/<m>`, { chunk: out.chunk });
  }
  return Object.freeze({
    version: HEADER_VERSION,
    doc_id: out.doc_id,
    case: out.case,
    kind: out.kind,
    date: out.date,
    chunk: Number(m[1]),
    m: Number(m[2]),
    doc_sha256: out.doc_sha256,
    doc_path: out.doc_path,
    anchors: out.anchors === NO_ANCHORS ? [] : out.anchors.split(','),
  });
}

/** The first line of a stored `pattern`, or null when the record is not one of ours. */
function headerOf(pattern) {
  if (typeof pattern !== 'string') return null;
  const line = pattern.split('\n', 1)[0];
  if (!line.startsWith(`${HEADER_VERSION} `)) return null;
  try { return parseHeader(line); } catch { return null; }
}

/** The passage text of a stored `pattern` — everything after the header line. */
function bodyOf(pattern) {
  const nl = String(pattern).indexOf('\n');
  return nl === -1 ? '' : String(pattern).slice(nl + 1);
}

module.exports = {
  CHUNK_BUDGET,
  HEADER_VERSION,
  HEADER_FIELDS,
  NO_ANCHORS,
  ThirdBrainHeaderError,
  normalise,
  chunk,
  docId,
  renderHeader,
  parseHeader,
  headerOf,
  bodyOf,
};
