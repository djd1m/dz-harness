'use strict';

// source-anchor.js — THE ONE definition of `source_anchor`: the manifest-anchored provenance value
// object (feature ha-manifest-provenance, ADR-001 D1–D4).
//
// An analytical document — a `labs[]` row, an `ha-finding-1` quoted value, a folded reading — may
// carry a POINTER back to the primary document it was transcribed from. The pointer is an ADDRESS,
// never a copy: `{entry_id, path, sha256}` names one row of `sources/manifest.json`, which names one
// immutable file in the raw zone. That is the llm-wiki citation template applied to a patient's own
// corpus: an analytical claim carries a reference that resolves to unchanged primary material.
//
// WHY THIS FILE LIVES UNDER skills/case-state/engine/ AND NOT UNDER lib/ (deviation AM-10, recorded
// rather than made silently). `lib/installer.js` installs `skills/case-state/` as a STANDALONE
// directory (`.claude/skills/health-advisor-case-state/`) — lib/ is not copied with it, and
// test/case-state-packaging.test.js RUNS the installed `engine/cli.js`. A `require('../../../lib/…')`
// from `schema.js` therefore resolves to nothing for exactly the users who installed the skill.
// The plan's `lib/source-anchor.js` still exists and still exports every name — as a ONE-LINE
// re-export of this file, so there is exactly one implementation and one function object (NFR-5,
// SP-7), reachable from both layouts.
//
// THE ANCHOR IS OVER-DETERMINED, ON PURPOSE (D2). `entry_id = sha256(JSON([path, sha256]))[:32]`, so
// the three mandatory fields must AGREE. A hand-edited anchor that renames the path while keeping the
// id is refused by arithmetic, before any file is opened.
//
// THE ANCHOR NEVER CARRIES CONTENT (NFR-1, §7 of 05_architecture.md). Not an excerpt, not the fetch
// origin (`url_redacted` / `url_sha256` / `local_path`), not the filesystem address (`stored_at`).
// Two independent fences, because "the caller is careful" is a convention and this value lands in a
// durable file inside a patient's folder:
//   1. the field set is CLOSED — anything outside ANCHOR_FIELDS is refused;
//   2. `assertNoContent` refuses the content/origin key names EXPLICITLY, at mint time — the
//      manifest.js `assertRedactedSource` posture (a fence at the write site).
// Both are exercised: neutering either one turns test/anchor-carries-no-content.test.js RED.
//
// THE PATH IS LOGICAL, NEVER ABSOLUTE (AM-5). `path` is the manifest row's repo-relative logical
// path, reused VERBATIM. An absolute OS path, a `..` segment, a backslash or a NUL is refused at the
// door — a write site that re-derives its own path is a write site that can point outside the corpus.

const crypto = require('node:crypto');

const ANCHOR_SCHEMA = 'ha-source-anchor-1';

/** The CLOSED field set (D1). A strict subset of a manifest row — no `stored_at`, no `source`. */
const ANCHOR_FIELDS = Object.freeze(['schema', 'entry_id', 'path', 'sha256', 'archive_id', 'ingested_at']);
const ANCHOR_REQUIRED_FIELDS = Object.freeze(['schema', 'entry_id', 'path', 'sha256']);
/** Present when the manifest row has them; an older row predating a column still stamps. */
const ANCHOR_OPTIONAL_FIELDS = Object.freeze(['archive_id', 'ingested_at']);

/**
 * The key names an anchor may never carry, refused BY NAME (fence 2). `url` is matched as a PREFIX
 * (`url`, `url_redacted`, `url_sha256`) because every one of them is fetch origin.
 */
const FORBIDDEN_CONTENT_KEYS = Object.freeze([
  'content', 'text', 'excerpt', 'bytes', 'data', 'body', 'blob',
  'stored_at', 'local_path', 'source',
]);
const FORBIDDEN_KEY_PREFIXES = Object.freeze(['url']);

/** This module's own closed reason taxonomy (AM-3: intake's REFUSALS stays at sixteen). */
const ANCHOR_REFUSALS = Object.freeze(['anchor_shape', 'anchor_content']);

const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const ARCHIVE_ID = /^sha256:[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

class SourceAnchorInvalidError extends Error {
  constructor(reason, message, details = {}) {
    super(message);
    this.name = 'SourceAnchorInvalidError';
    this.code = SourceAnchorInvalidError.code;
    this.reason = reason;
    for (const [k, v] of Object.entries(details)) {
      if (k === 'name' || k === 'code' || k === 'message' || k === 'stack' || k === 'reason') continue;
      this[k] = v;
    }
  }

  toJSON() {
    return { name: this.name, code: this.code, reason: this.reason, message: this.message };
  }
}
SourceAnchorInvalidError.code = 'ESOURCEANCHORINVALID';

/**
 * entryId(logicalPath, sha256) — MOVED VERBATIM from skills/intake-archive/engine/manifest.js, which
 * now imports it back. Byte-identical output is the point (SP-7): the manifest's idempotency oracle
 * is that a re-intake of identical content produces an identical row, and an anchor that computed a
 * DIFFERENT id would be unresolvable against every corpus already on disk.
 */
function entryId(logicalPath, sha256) {
  // DETERMINISTIC, so a re-intake of identical content produces an identical row and the manifest is
  // byte-identical. A random id would make idempotency unobservable in the file it is a property of.
  return crypto.createHash('sha256').update(JSON.stringify([logicalPath, sha256])).digest('hex').slice(0, 32);
}

/**
 * THE ABSOLUTE-PATH FENCE (AM-5). A logical path is what the manifest row holds: relative, forward
 * slashes, no traversal. Refusing here — at the value object, before any write site — is what makes
 * "the write site reuses the manifest's own path verbatim" enforceable rather than advisory.
 *
 * Returns a problem string, or `null` when the path is a legal logical path.
 */
function logicalPathProblem(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'must be a non-empty string';
  if (value.includes('\0')) return 'must not contain a NUL byte';
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')) {
    return `must be the manifest row's LOGICAL path, not an absolute filesystem path (${JSON.stringify(value)})`;
  }
  if (value.includes('\\')) return 'must use forward slashes — a backslash is a directory separator on the machine that matters';
  if (value.split('/').some((seg) => seg === '..' || seg === '.')) return 'must not contain "." or ".." segments';
  return null;
}

/**
 * assertNoContent(fields) — fence 2, by NAME. Called from inside `makeAnchor` at mint time and
 * exported so a write site can assert it directly.
 */
function assertNoContent(fields) {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new SourceAnchorInvalidError('anchor_shape', 'a source anchor must be a plain object');
  }
  for (const key of Object.keys(fields)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_CONTENT_KEYS.includes(lower) || FORBIDDEN_KEY_PREFIXES.some((p) => lower.startsWith(p))) {
      throw new SourceAnchorInvalidError(
        'anchor_content',
        `a source anchor may never carry ${JSON.stringify(key)} — an anchor is an ADDRESS (entry_id, ` +
        'path, sha256), never the primary content, an excerpt of it, its fetch origin or its ' +
        'filesystem address. It travels into durable files in a patient\'s folder (NFR-1).',
        { key }
      );
    }
  }
}

/**
 * validateAnchor(value, where, problems) — THE ONE shared validator (NFR-5). Non-throwing: it
 * appends to the caller-supplied accumulator, matching `schema.js`'s and `consult-finding-schema.js`'s
 * existing `problems[]` convention, so a malformed anchor is reported alongside every other problem
 * in the same document rather than short-circuiting the report.
 */
function validateAnchor(value, where, problems) {
  const push = (m) => problems.push(`${where}: ${m}`);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    push('source_anchor must be an object');
    return problems;
  }

  for (const key of Object.keys(value)) {
    const lower = key.toLowerCase();
    if (FORBIDDEN_CONTENT_KEYS.includes(lower) || FORBIDDEN_KEY_PREFIXES.some((p) => lower.startsWith(p))) {
      push(`carries ${JSON.stringify(key)} — an anchor is an address, never content, fetch origin or a filesystem path (anchor_content)`);
      continue;
    }
    if (!ANCHOR_FIELDS.includes(key)) {
      push(`unknown field ${JSON.stringify(key)} — the anchor field set is CLOSED (${ANCHOR_FIELDS.join(', ')})`);
    }
  }
  for (const field of ANCHOR_REQUIRED_FIELDS) {
    if (value[field] === undefined) push(`missing required field "${field}"`);
  }

  if (value.schema !== undefined && value.schema !== ANCHOR_SCHEMA) {
    push(`schema must be ${JSON.stringify(ANCHOR_SCHEMA)}, got ${JSON.stringify(value.schema)}`);
  }
  if (value.path !== undefined) {
    const problem = logicalPathProblem(value.path);
    if (problem !== null) push(`path ${problem}`);
  }
  if (value.sha256 !== undefined && (typeof value.sha256 !== 'string' || !HEX64.test(value.sha256))) {
    push(`sha256 must be 64 lowercase hex characters, got ${JSON.stringify(value.sha256)}`);
  }
  if (value.entry_id !== undefined && (typeof value.entry_id !== 'string' || !HEX32.test(value.entry_id))) {
    push(`entry_id must be 32 lowercase hex characters, got ${JSON.stringify(value.entry_id)}`);
  }
  if (value.archive_id !== undefined && (typeof value.archive_id !== 'string' || !ARCHIVE_ID.test(value.archive_id))) {
    push(`archive_id must be "sha256:<64 hex>", got ${JSON.stringify(value.archive_id)}`);
  }
  if (value.ingested_at !== undefined) {
    const t = value.ingested_at;
    if (typeof t !== 'string' || !ISO_INSTANT.test(t) || !Number.isFinite(Date.parse(t))) {
      push(`ingested_at must be an ISO-8601 UTC instant, got ${JSON.stringify(t)}`);
    }
  }

  // D2 — the over-determination check, and it is the LAST one: it is only meaningful once the three
  // parts are individually well-formed, and reporting it on top of a malformed sha256 would be noise.
  if (typeof value.path === 'string' && typeof value.sha256 === 'string'
      && typeof value.entry_id === 'string' && HEX64.test(value.sha256) && HEX32.test(value.entry_id)) {
    const expected = entryId(value.path, value.sha256);
    if (value.entry_id !== expected) {
      push(
        `entry_id ${value.entry_id} is not recomputable from (path, sha256) — expected ${expected}. ` +
        'The anchor is over-determined on purpose: a renamed path with a kept id is a hand edit, not a citation.'
      );
    }
  }
  return problems;
}

/** Deep-freeze an anchor object: a mutable `sha256` would let a holder rewrite the address the resolver checks. */
function freezeAnchor(anchor) {
  if (anchor === null || typeof anchor !== 'object') return anchor;
  for (const v of Object.values(anchor)) if (v !== null && typeof v === 'object') Object.freeze(v);
  return Object.freeze(anchor);
}

/**
 * makeAnchor(fields) → a frozen, valid anchor. THROWS on anything else — this is the mint, and a
 * "best effort" anchor is a claim about a corpus nobody checked.
 *
 * `entry_id` is RECOMPUTED from `(path, sha256)`; supplying a disagreeing one is a refusal, not a
 * silent correction (D2).
 */
function makeAnchor(fields) {
  assertNoContent(fields);                                   // fence 2, before anything is copied

  // FENCE 1, AND IT REFUSES RATHER THAN DROPS. Building the result from a whitelist alone would make
  // an unknown input key vanish SILENTLY — a caller that passed `media_type` (or misspelled a real
  // field) would receive an anchor that quietly lost it and no error to read. A closed set that
  // silently discards is not a closed set; it is a lossy copy wearing one's clothes.
  const unknown = Object.keys(fields).filter((k) => !ANCHOR_FIELDS.includes(k));
  if (unknown.length > 0) {
    throw new SourceAnchorInvalidError(
      'anchor_shape',
      `source anchor field set is CLOSED — ${unknown.map((k) => JSON.stringify(k)).join(', ')} ` +
      `${unknown.length === 1 ? 'is not' : 'are not'} one of (${ANCHOR_FIELDS.join(', ')}). ` +
      'An anchor is a strict SUBSET of a manifest row (ADR-001 D1); nothing was minted.',
      { unknown }
    );
  }
  if (fields.schema !== undefined && fields.schema !== ANCHOR_SCHEMA) {
    throw new SourceAnchorInvalidError(
      'anchor_shape',
      `source anchor schema must be ${JSON.stringify(ANCHOR_SCHEMA)}, got ${JSON.stringify(fields.schema)}`
    );
  }

  const pathProblem = logicalPathProblem(fields.path);
  if (pathProblem !== null) {
    throw new SourceAnchorInvalidError('anchor_shape', `source anchor path ${pathProblem}`, { path: fields.path });
  }
  if (typeof fields.sha256 !== 'string' || !HEX64.test(fields.sha256)) {
    throw new SourceAnchorInvalidError('anchor_shape', `source anchor sha256 must be 64 lowercase hex characters, got ${JSON.stringify(fields.sha256)}`);
  }

  const computed = entryId(fields.path, fields.sha256);
  if (fields.entry_id !== undefined && fields.entry_id !== computed) {
    throw new SourceAnchorInvalidError(
      'anchor_shape',
      `source anchor entry_id ${JSON.stringify(fields.entry_id)} disagrees with (path, sha256), which ` +
      `derive ${computed} — refused rather than silently corrected (ADR-001 D2)`,
      { entry_id: fields.entry_id, expected: computed }
    );
  }

  const anchor = { schema: ANCHOR_SCHEMA, entry_id: computed, path: fields.path, sha256: fields.sha256 };
  for (const field of ANCHOR_OPTIONAL_FIELDS) {
    if (fields[field] !== undefined && fields[field] !== null) anchor[field] = fields[field];
  }

  const problems = validateAnchor(anchor, 'source_anchor', []);
  if (problems.length > 0) {
    throw new SourceAnchorInvalidError('anchor_shape', `refusing to mint an invalid source anchor:\n  - ${problems.join('\n  - ')}`, { problems });
  }
  return freezeAnchor(anchor);
}

/**
 * A canonical, key-ordered JSON rendering, used for EQUALITY (idempotent re-stamp) — never for
 * identity, which the anchor is deliberately outside of (D3, SP-5).
 */
function canonicalAnchorJson(anchor) {
  if (anchor === null || typeof anchor !== 'object') return JSON.stringify(anchor);
  const ordered = {};
  for (const field of ANCHOR_FIELDS) if (anchor[field] !== undefined) ordered[field] = anchor[field];
  return JSON.stringify(ordered);
}

function anchorsEqual(a, b) {
  return canonicalAnchorJson(a) === canonicalAnchorJson(b);
}

module.exports = {
  ANCHOR_SCHEMA, ANCHOR_FIELDS, ANCHOR_REQUIRED_FIELDS, ANCHOR_OPTIONAL_FIELDS,
  FORBIDDEN_CONTENT_KEYS, FORBIDDEN_KEY_PREFIXES, ANCHOR_REFUSALS,
  SourceAnchorInvalidError,
  entryId, logicalPathProblem, assertNoContent, validateAnchor, makeAnchor,
  freezeAnchor, canonicalAnchorJson, anchorsEqual,
};
