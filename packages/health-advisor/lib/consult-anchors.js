'use strict';

// consult-anchors.js — fence-aware lexer for the `<!-- ha:… -->` anchor vocabulary in a consult
// synthesis document (architecture §3.2). Every rule is fail-closed in BOTH directions (the
// appraisal-egress-scan lexer lesson: a lexer that mis-scopes is a silent hole both ways):
//
//   1. FENCED CODE IS NOT ANCHOR SPACE — an anchor inside ``` fences is ignored both ways: hiding
//      a required anchor in a fence fails recall; forging one there cannot inflate precision.
//   2. ha:value / ha:caveat NEST EXACTLY ONE LEVEL inside ha:finding. A ha:caveat outside any
//      finding is ORPHAN_CAVEAT (a precision violation, never silently ignored) — with ONE
//      carve-out: a ha:caveat directly inside ha:ungated is the AM-2 cited-claim mechanism and is
//      collected as an ungated caveat anchor, not an orphan.
//   3. AN UNCLOSED ANCHOR IS INCONCLUSIVE, not best-effort.
//   4. UNKNOWN ATTRIBUTES ARE A STRICT ERROR (same posture as the CLI's unknown-flag rejection).
//
// The lexer only LEXES: it resolves nothing against lane data. Resolution is the gate's job.

const OPEN_RE = /<!--\s*ha:([a-z-]+)((?:\s+[a-z-]+="[^"]*")*)\s*-->/g;
const CLOSE_RE = /<!--\s*\/ha:([a-z-]+)\s*-->/g;
const ATTR_RE = /([a-z-]+)="([^"]*)"/g;

const KNOWN_ATTRS = Object.freeze({
  finding: ['id', 'severity'],
  value: ['ref', 'value', 'unit'],
  caveat: ['id', 'applies-to'],
  'lane-failed': ['specialty', 'reason'],
  ungated: ['label'],
  'not-carried': ['id', 'reason', 'note'],
});

// Standalone anchors: no closing tag expected.
const STANDALONE = Object.freeze(['lane-failed', 'not-carried']);

/** Compute [start,end) spans of fenced code blocks — text inside them is not anchor space. */
function fencedSpans(text) {
  const spans = [];
  const re = /^[ \t]*(```|~~~)/gm;
  let open = null;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (open === null) open = m.index;
    else { spans.push([open, re.lastIndex]); open = null; }
  }
  if (open !== null) spans.push([open, text.length]); // an unclosed fence swallows the rest
  return spans;
}

function inSpans(pos, spans) { return spans.some(([a, b]) => pos >= a && pos < b); }

function parseAttrs(kind, raw, pos, errors) {
  const attrs = {};
  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(raw || '')) !== null) {
    const [, name, value] = m;
    if (!(KNOWN_ATTRS[kind] || []).includes(name)) {
      errors.push({ code: 'UNKNOWN_ATTRIBUTE', anchor: kind, attribute: name, pos });
      continue;
    }
    attrs[name] = value;
  }
  return attrs;
}

/**
 * lexAnchors(text) → {
 *   findings: [{id, severity, start, end, contentStart, contentEnd, values:[], caveats:[]}],
 *   orphanCaveats: [], ungated: [{label, start, end, contentStart, contentEnd, caveats:[], findingIdsCited: null}],
 *   laneFailedNotices: [{specialty, reason, pos}], notCarried: [{id, reason, note, pos}],
 *   errors: [{code, …}], inconclusive: boolean
 * }
 * `inconclusive` is true iff an anchor was left unclosed, mis-nested, or carried an unknown
 * attribute — the gate maps that to the INCONCLUSIVE verdict (never a pass).
 */
function lexAnchors(text) {
  const spans = fencedSpans(text);
  const tokens = [];
  let m;
  OPEN_RE.lastIndex = 0;
  while ((m = OPEN_RE.exec(text)) !== null) {
    if (inSpans(m.index, spans)) continue; // rule 1
    tokens.push({ type: 'open', kind: m[1], rawAttrs: m[2], start: m.index, end: OPEN_RE.lastIndex });
  }
  CLOSE_RE.lastIndex = 0;
  while ((m = CLOSE_RE.exec(text)) !== null) {
    if (inSpans(m.index, spans)) continue;
    tokens.push({ type: 'close', kind: m[1], start: m.index, end: CLOSE_RE.lastIndex });
  }
  tokens.sort((a, b) => a.start - b.start);

  const errors = [];
  const findings = [];
  const orphanCaveats = [];
  const ungated = [];
  const laneFailedNotices = [];
  const notCarried = [];

  let openFinding = null;
  let openUngated = null;
  let openInner = null; // {kind:'value'|'caveat', …} currently open inside a finding/ungated

  for (const tok of tokens) {
    if (tok.type === 'open') {
      const kind = tok.kind;
      if (!(kind in KNOWN_ATTRS)) { errors.push({ code: 'UNKNOWN_ANCHOR', anchor: kind, pos: tok.start }); continue; }
      const attrs = parseAttrs(kind, tok.rawAttrs, tok.start, errors);

      if (STANDALONE.includes(kind)) {
        if (kind === 'lane-failed') laneFailedNotices.push({ specialty: attrs.specialty || null, reason: attrs.reason || null, pos: tok.start });
        else notCarried.push({ id: attrs.id || null, reason: attrs.reason || null, note: attrs.note || null, pos: tok.start });
        continue;
      }
      if (kind === 'finding') {
        if (openFinding || openUngated || openInner) { errors.push({ code: 'BAD_NESTING', anchor: 'finding', pos: tok.start }); continue; }
        openFinding = { id: attrs.id || null, severity: attrs.severity || null, start: tok.start, contentStart: tok.end, values: [], caveats: [] };
        continue;
      }
      if (kind === 'ungated') {
        if (openFinding || openUngated || openInner) { errors.push({ code: 'BAD_NESTING', anchor: 'ungated', pos: tok.start }); continue; }
        openUngated = { label: attrs.label || null, start: tok.start, contentStart: tok.end, caveats: [] };
        continue;
      }
      // value / caveat — one level inside finding (value) or finding/ungated (caveat, AM-2 carve-out)
      if (openInner) { errors.push({ code: 'BAD_NESTING', anchor: kind, pos: tok.start }); continue; }
      if (kind === 'value') {
        if (!openFinding) { errors.push({ code: 'VALUE_OUTSIDE_FINDING', pos: tok.start }); continue; }
        openInner = { kind, ref: attrs.ref || null, value: attrs.value != null ? attrs.value : null, unit: attrs.unit != null ? attrs.unit : null, start: tok.start, contentStart: tok.end };
        continue;
      }
      // caveat
      openInner = { kind, id: attrs.id || null, appliesTo: attrs['applies-to'] ? attrs['applies-to'].split(',').map((s) => s.trim()).filter(Boolean).sort() : [], start: tok.start, contentStart: tok.end, host: openFinding ? 'finding' : (openUngated ? 'ungated' : 'none') };
      continue;
    }

    // close token
    const kind = tok.kind;
    if (openInner && openInner.kind === kind) {
      const inner = openInner;
      openInner = null;
      inner.contentEnd = tok.start;
      inner.end = tok.end;
      inner.text = text.slice(inner.contentStart, inner.contentEnd);
      if (kind === 'value') { openFinding.values.push(inner); continue; }
      // caveat
      if (inner.host === 'finding') openFinding.caveats.push(inner);
      else if (inner.host === 'ungated') openUngated.caveats.push(inner);
      else orphanCaveats.push(inner); // rule 2 — precision violation, surfaced, never ignored
      continue;
    }
    if (kind === 'finding' && openFinding && !openInner) {
      openFinding.contentEnd = tok.start;
      openFinding.end = tok.end;
      findings.push(openFinding);
      openFinding = null;
      continue;
    }
    if (kind === 'ungated' && openUngated && !openInner) {
      openUngated.contentEnd = tok.start;
      openUngated.end = tok.end;
      openUngated.text = text.slice(openUngated.contentStart, openUngated.contentEnd);
      ungated.push(openUngated);
      openUngated = null;
      continue;
    }
    errors.push({ code: 'UNMATCHED_CLOSE', anchor: kind, pos: tok.start });
  }

  // rule 3 — unclosed = INCONCLUSIVE, never best-effort
  if (openInner) errors.push({ code: 'UNCLOSED_ANCHOR', anchor: openInner.kind, pos: openInner.start });
  if (openFinding) errors.push({ code: 'UNCLOSED_ANCHOR', anchor: 'finding', pos: openFinding.start });
  if (openUngated) errors.push({ code: 'UNCLOSED_ANCHOR', anchor: 'ungated', pos: openUngated.start });

  const inconclusive = errors.some((e) => ['UNCLOSED_ANCHOR', 'BAD_NESTING', 'UNKNOWN_ATTRIBUTE', 'UNKNOWN_ANCHOR', 'UNMATCHED_CLOSE'].includes(e.code));
  return { findings, orphanCaveats, ungated, laneFailedNotices, notCarried, errors, inconclusive, fencedSpans: spans };
}

module.exports = { lexAnchors, fencedSpans };
