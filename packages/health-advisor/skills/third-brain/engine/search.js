'use strict';

// search.js — THE READ SIDE: ranked `search()` and exhaustive `backlinks()` (ADR-001 D-5, D-6).
//
// NO PROCESS MODULE IS IMPORTED HERE, DELIBERATELY. Both legs shell `dz`, and both do it through
// `write.js`'s exported `runDz` — the SOLE_SPAWN_SITE that lib/appraisal-egress-scan.js permits
// (D-10). One door means one place where argv is assembled: `runDz` takes an ARGV ARRAY, never a
// shell string, which is why a query containing `;` or `$(` is a weird query and not a command. The
// mutation `third-brain-second-spawn-site` plants a process import in THIS file, and
// test/third-brain-no-network-one-spawn-site.test.js turns red on it.
//
// SEARCH NEVER READS THE SHARED STORE. `learning_bridge.recall()` reads BOTH stores on purpose — a
// medical investigation benefits from an engineering method lesson. A DOCUMENT search that reached
// the shared brain would answer a medical question with engineering lessons, and would make the
// two-store boundary ambiguous in the one command most likely to end up in a script. `--project`
// always points inside `<workspace>/.health-brain` (SP-6, pinned by argv capture).
//
// `--json` IS MANDATORY ON EVERY `dz recall` CALL, not a preference: the text renderer truncates a
// pattern at 80 characters, so a passage-level hit read from text output would arrive with its
// header line intact and its body cut — a search result that LOOKS complete and is not.
//
// BACKLINKS IS A LOOKUP, NOT A RANKED SEARCH (SP-16). It reads the store EXHAUSTIVELY with
// `--all --json --include-domain health-research` and filters locally on `doc_id=`. A ranked recall
// with a `--limit` would silently return the top-k chunks of a document and report them as all of
// them; `--include-domain` is mandatory on the `--all` branch because that branch applies the export
// hold-out, which withholds exactly this domain (the same trap `_brain_count` documents).

const fs = require('node:fs');
const path = require('node:path');

const { runDz } = require('./write.js');
const { headerOf, bodyOf } = require('./plan.js');
const {
  ThirdBrainUsageError, ThirdBrainDzUnavailableError, ThirdBrainWriteUnverifiedError,
  ThirdBrainAnchorUnresolvableError,
} = require('./errors.js');
const { HEALTH_BRAIN_DIRNAME } = require('../../../lib/workspace-layout.js');
const { stampFromManifest, resolveAnchor } = require('../../../lib/source-anchor-store.js');

const RECORD_DOMAIN = 'health-research';

/**
 * `<workspace>/.health-brain` — the ONE store either read leg may be pointed at.
 *
 * REALPATHED, exactly as `write.js` realpaths the workspace it ingests into. Without it, `ha
 * third-brain search --workspace /link/to/case` would open a DIFFERENT path from the one the ingest
 * wrote to and report zero hits for a document that is filed — indistinguishable, to the operator,
 * from a document that was never filed. A workspace that does not exist yet keeps its lexical path
 * rather than becoming a silent `null`.
 */
function realWorkspace(workspace) {
  const abs = path.resolve(String(workspace === undefined ? '.' : workspace));
  try { return fs.realpathSync(abs); } catch (err) { if (err.code !== 'ENOENT') throw err; return abs; }
}

function brainDir(workspace) {
  return path.join(realWorkspace(workspace), HEALTH_BRAIN_DIRNAME);
}

/**
 * dzJson(args, opts) -> parsed JSON array
 *
 * A `dz` that is not installed is a NAMED refusal here too (D-5): a search that silently returns
 * zero hits because the mechanism is absent is indistinguishable from a search that found nothing,
 * and an operator would conclude the document was never filed.
 */
function dzJson(args, opts = {}) {
  const res = runDz(args, opts);
  if (res.spawnError !== null && res.spawnError.code === 'ENOENT') {
    throw new ThirdBrainDzUnavailableError(
      'REFUSED — `dz` is not on PATH, so the health brain cannot be read. A search that returned zero hits ' +
      'here would be indistinguishable from a search that found nothing. Install it: npm i -g @dzhechkov/harness-cli',
      { detail: 'dz unavailable' }
    );
  }
  if (res.timedOut) {
    throw new ThirdBrainWriteUnverifiedError(
      `REFUSED — \`dz ${args[0]}\` did not finish in time and was killed. The store was not read.`,
      { detail: 'dz timeout' }
    );
  }
  if (res.code !== 0) {
    throw new ThirdBrainWriteUnverifiedError(
      `REFUSED — \`dz ${args[0]}\` exited ${res.code}: ${res.err.trim() || res.out.trim() || '(no output)'}`,
      { detail: 'dz nonzero' }
    );
  }
  const text = res.out.trim();
  if (text === '') return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    throw new ThirdBrainWriteUnverifiedError(
      `REFUSED — \`dz ${args[0]} --json\` did not return parseable JSON (${err.message}). The store was read but ` +
      'the answer cannot be trusted, so none is given.',
      { detail: 'dz unparseable json' }
    );
  }
}

/** A stored record → a third-brain hit, or `null` when the record is not one of ours (an ordinary
 *  distilled LESSON living in the same brain is not a document passage and must not be rendered as
 *  one). The discriminator is the `ha-doc-1 ` prefix — the same one the writer mints. */
function toHit(record, query) {
  const header = headerOf(record.pattern);
  if (header === null) return null;
  const body = bodyOf(record.pattern);
  return {
    ...header,
    body,
    matched: matchedLine(body, query),
    ts: typeof record.ts === 'string' ? record.ts : null,
    domain: typeof record.domain === 'string' ? record.domain : null,
    type: typeof record.type === 'string' ? record.type : null,
  };
}

/** The first body line containing any query term, or the first non-empty line. Presentation only —
 *  the full passage travels in `body`, so `--json` consumers are never given a truncated answer. */
function matchedLine(body, query) {
  const lines = body.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return '';
  const terms = String(query === undefined ? '' : query).toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (terms.some((t) => lower.includes(t))) return line.trim();
  }
  return lines[0].trim();
}

/**
 * search(query, {workspace, limit, env}) -> { query, brain, hits[] }
 */
function search(query, opts = {}) {
  if (typeof query !== 'string' || query.trim() === '') {
    throw new ThirdBrainUsageError('search needs a non-empty query.', { reason: 'missing_query' });
  }
  const limit = Number.isFinite(opts.limit) && opts.limit >= 1 ? Math.floor(opts.limit) : 10;
  const brain = brainDir(opts.workspace);
  const records = dzJson(
    ['recall', query, '--domain', RECORD_DOMAIN, '--limit', String(limit), '--project', brain, '--json'],
    opts,
  );
  const hits = records.map((r) => toHit(r, query)).filter((h) => h !== null);
  return Object.freeze({ query, brain, limit, hits });
}

/** `[<kind> <date> chunk n/m] <doc_path> — <matched line>` — D-6's rendering, one renderer. */
function renderHits(result) {
  if (result.hits.length === 0) {
    return `no third-brain documents match ${JSON.stringify(result.query)} in ${result.brain}`;
  }
  return result.hits
    .map((h) => `[${h.kind} ${h.date} chunk ${h.chunk}/${h.m}] ${h.doc_path} — ${h.matched}`)
    .join('\n');
}

/**
 * backlinks(docId, {workspace, env}) -> { doc_id, brain, chunks, expected, incomplete, anchors[] }
 *
 * EXHAUSTIVE BY CONSTRUCTION, and `incomplete: true` when the records found are fewer than the
 * `chunk=n/m` count the headers THEMSELVES declare. The document's own header is the oracle: asking
 * the store how many records it has would be asking the thing under test to grade itself.
 *
 * Every anchor id in the header goes back through the SHIPPED pair — `stampFromManifest` then
 * `resolveAnchor` — so a drift found here is the same named refusal it would be at ingest, not a
 * warning printed beside a result. `caseDir: workspace` is the registered narrowing (see
 * architecture/degradations.md); the write-side integrity of `case=` is what pins the guarantee.
 */
function backlinks(docId, opts = {}) {
  if (typeof docId !== 'string' || !/^[0-9a-f]{16}$/.test(docId)) {
    throw new ThirdBrainUsageError(
      `backlinks needs a 16-hex doc_id, got ${JSON.stringify(docId)}.`, { reason: 'bad_doc_id' },
    );
  }
  const workspace = path.resolve(String(opts.workspace === undefined ? '.' : opts.workspace));
  const brain = brainDir(workspace);
  const records = dzJson(
    ['recall', '--all', '--json', '--project', brain, '--include-domain', RECORD_DOMAIN],
    opts,
  );
  const mine = [];
  for (const r of records) {
    const header = headerOf(r.pattern);
    if (header === null || header.doc_id !== docId) continue;
    mine.push(header);
  }
  if (mine.length === 0) {
    throw new ThirdBrainUsageError(
      `no records in ${brain} carry doc_id=${docId}. Nothing was resolved.`, { reason: 'doc_id_not_found' },
    );
  }
  mine.sort((a, b) => a.chunk - b.chunk);
  const expected = Math.max(...mine.map((h) => h.m));
  const seen = new Set(mine.map((h) => h.chunk));
  const missing = [];
  for (let i = 1; i <= expected; i += 1) if (!seen.has(i)) missing.push(i);

  // ONE doc_id CAN CARRY MORE THAN ONE INGEST, and that is a consequence of ADR-002 step 7 rather
  // than a bug: `doc_id = sha256(doc_sha256 + NUL + doc_path)` deliberately ignores `case`, `kind`,
  // `date` and the anchor list, so re-filing the SAME bytes at the SAME path under a different case
  // (or with a citation the first ingest forgot) produces records that share the id.
  //
  // The naive shape — read the anchors off `mine[0]` — then silently reports whichever variant
  // happened to be chunk 1, so a citation added by a later ingest is never verified and a drifted
  // primary is never noticed. So the anchors are the UNION across every record of this doc_id (every
  // citation any passage claims must resolve), and disagreeing metadata is REPORTED in `variants`
  // rather than resolved by picking one.
  const uniqueAnchors = [];
  for (const h of mine) {
    for (const id of h.anchors) if (!uniqueAnchors.includes(id)) uniqueAnchors.push(id);
  }
  const variants = [];
  for (const h of mine) {
    const key = `${h.case} ${h.kind} ${h.date}`;
    if (!variants.some((v) => v.key === key)) variants.push({ key, case: h.case, kind: h.kind, date: h.date });
  }

  const first = mine[0];
  const anchors = [];
  for (const entryId of uniqueAnchors) {
    // AM-5: an EMPTY anchor list is a successful zero-anchor resolution, not a failure — this loop
    // simply does not run, and the caller gets `anchors: []` with `ok: true`.
    //
    // WRAPPED exactly as the write leg wraps it (fix round 1, QE F12): a corrupt manifest makes
    // `stampFromManifest` THROW (e.g. `RawZoneDriftError` over invalid JSON), and calling it bare
    // reported the one condition the closed enum HAS a member for as `internal_error` / exit 2 —
    // while `ingest` named the same condition `third_brain_anchor_unresolvable` / exit 1. Same
    // input condition, one answer, on both legs.
    let anchor;
    try {
      anchor = stampFromManifest({ workspace, entryId });
    } catch (err) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — the citation ${JSON.stringify(entryId)} of doc_id=${docId} could not be stamped from ` +
        `${path.join(workspace, 'sources', 'manifest.json')}: ${err.message} The citation cannot be verified.`,
        { entry_id: entryId, cause_reason: err.reason === undefined ? null : err.reason, cause_code: err.code === undefined ? null : err.code },
      );
    }
    if (anchor === null) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — the record for doc_id=${docId} cites entry_id ${JSON.stringify(entryId)}, which the catalog at ` +
        `${path.join(workspace, 'sources', 'manifest.json')} does not index. The citation cannot be verified.`,
        { entry_id: entryId, cause_reason: 'anchor_not_in_manifest' },
      );
    }
    let resolved;
    try {
      resolved = resolveAnchor(anchor, { workspace, caseDir: workspace });
    } catch (err) {
      throw new ThirdBrainAnchorUnresolvableError(
        `REFUSED — the citation ${JSON.stringify(entryId)} of doc_id=${docId} does not resolve: ${err.message} ` +
        'A drift found on the way BACK is the same refusal it would be on the way in, never a warning beside a result.',
        { entry_id: entryId, cause_reason: err.reason === undefined ? null : err.reason },
      );
    }
    anchors.push({
      entry_id: resolved.entry_id,
      path: resolved.path,
      stored_at: resolved.storedAt,
      sha256: resolved.sha256,
      bytes: resolved.bytes,
      verified: resolved.verified === true,
    });
  }

  return Object.freeze({
    doc_id: docId,
    brain,
    case: first.case,
    kind: first.kind,
    date: first.date,
    doc_path: first.doc_path,
    doc_sha256: first.doc_sha256,
    // `chunks` counts DISTINCT chunk numbers, not records: with two ingests of one document under
    // different metadata, counting records would report 4/2 and read as "more than complete".
    chunks: seen.size,
    records: mine.length,
    expected,
    missing,
    incomplete: seen.size < expected,
    variants: variants.map((v) => ({ case: v.case, kind: v.kind, date: v.date })),
    anchors,
  });
}

/** `entry_id → stored_at → sha256 ✓` — D-5's rendering. A DRIFT never reaches here: it threw. */
function renderBacklinks(result) {
  const lines = [
    `doc_id ${result.doc_id}  [${result.kind} ${result.date}]  ${result.doc_path}`,
    `  chunks: ${result.chunks}/${result.expected}${result.incomplete ? `  INCOMPLETE — missing ${result.missing.join(',')}` : ''}`,
  ];
  if (result.variants.length > 1) {
    // Reported, never silently resolved: the operator is the one who knows which filing was meant.
    lines.push(`  NOTE: ${result.variants.length} ingests share this doc_id (same bytes, same path):`);
    for (const v of result.variants) lines.push(`    case=${v.case} kind=${v.kind} date=${v.date}`);
  }
  if (result.anchors.length === 0) {
    lines.push('  anchors: none — this document cites no primary source (a valid, ordinary case)');
  }
  for (const a of result.anchors) {
    lines.push(`  ${a.entry_id} → ${a.stored_at} → sha256 ${a.sha256.slice(0, 16)}… ✓`);
  }
  return lines.join('\n');
}

module.exports = {
  RECORD_DOMAIN,
  brainDir,
  dzJson,
  search,
  backlinks,
  renderHits,
  renderBacklinks,
  matchedLine,
  toHit,
};
