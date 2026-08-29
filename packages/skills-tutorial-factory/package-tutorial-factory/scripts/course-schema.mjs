#!/usr/bin/env node
// course-schema — shared, zero-dep helpers for the produced course object.
// node builtins only; deterministic (no Date/random). Imported by headfirst-gate.mjs and the tests.
//
// HARDENING (Codex QE 2026-07-28, P1 property): every "non-empty" check here verifies MEANINGFUL
// content, not mere presence. A blank/null shell — `["",""]`, `[null]`, whitespace strings, an empty
// exercise object — is rejected, so a content-free box-ticked course can NOT pass the gate.

import { readFileSync } from 'node:fs';

// The 6 canonical edu-site exercise types + accepted aliases → canonical form.
export const CANONICAL_TYPES = ['quiz', 'flashcards', 'matching', 'drag-and-drop', 'builder', 'scenario'];
const TYPE_ALIASES = { ordering: 'drag-and-drop', simulation: 'scenario' };
export const normalizeType = (t) => (typeof t === 'string' ? (TYPE_ALIASES[t] || t) : t);

export const VALID_CONDITION_TYPES = new Set([
  'sections-completed', 'all-sections', 'perfect-section', 'final-test-pass', 'section-group',
]);

// --- meaningful-content primitives -------------------------------------------
// Zero-width / default-ignorable characters (shared with the IP gate). A string of only these — or of
// only whitespace/punctuation — is NOT meaningful.
export const IGNORABLE_CHARS = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFF9-\uFFFB]|\p{Default_Ignorable_Code_Point}/gu;
// A string is "meaningful" only if, AFTER stripping zero-width/ignorables, at least one LETTER or DIGIT
// remains (round-2 #5: U+200B/U+200C-only strings must be rejected).
export const nonBlank = (s) => typeof s === 'string' && /[\p{L}\p{N}]/u.test(s.normalize('NFKC').replace(IGNORABLE_CHARS, ''));
// Every element of an array must be a meaningful string.
const allNonBlankStrings = (arr) => Array.isArray(arr) && arr.length > 0 && arr.every(nonBlank);

// Normalize text for token matching (NFKC, lowercase, de-hyphenate, punctuation handled by tokenizer).
export function normalizeForMatch(s) {
  return String(s == null ? '' : s)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/­/g, '')                              // soft hyphen
    .replace(/(\p{L})[-‐-―−]\s*(\p{L})/gu, '$1$2'); // join intra-word hyphenation
}
export function tokensOf(s) {
  return (normalizeForMatch(s).match(/[\p{L}\p{N}]+/gu) || []);
}
// The distinctive words of a concept phrase (len >= 4, minus a tiny stoplist).
const STOP = new Set(['into', 'that', 'this', 'with', 'from', 'your', 'page', 'them', 'they', 'when', 'what', 'which', 'their', 'about', 'been', 'have', 'will']);
export function significantWords(s) {
  return [...new Set(tokensOf(s).filter((w) => w.length >= 4 && !STOP.has(w)))];
}
// Does `text` MEANINGFULLY encode a significant word of `concept`? Exact token match, or a shared
// 5-char stem (so "distill"↔"distilled", "skill"↔"skills" count) — but generic filler that shares no
// distinctive word still fails, preserving discrimination.
export function conceptEncodedIn(concept, text) {
  const words = significantWords(concept);
  if (words.length === 0) return false;
  const textTokens = new Set(tokensOf(text).filter((w) => w.length >= 4));
  const stemSet = new Set([...textTokens].filter((w) => w.length >= 5).map((w) => w.slice(0, 5)));
  for (const w of words) {
    if (textTokens.has(w)) return true;
    if (w.length >= 5 && stemSet.has(w.slice(0, 5))) return true;
  }
  return false;
}

// Extract ONLY the learner-VISIBLE text of a section's primary exercise (round-2 CRITICAL #1). A
// concept hidden in an `id`/`marker`/metadata key must NOT count — only what the learner reads:
// questions, prompts, options, answers, card faces, labels, step text, feedback.
const push = (arr, ...xs) => { for (const x of xs) if (typeof x === 'string') arr.push(x); };
export function visibleExerciseText(section) {
  const t = normalizeType(section && section.interactiveType);
  const ex = (section && section.exercise) || {};
  const out = [];
  if (t === 'quiz') {
    for (const q of (section && section.quiz) || []) { push(out, q && q.question, q && q.explanation); if (q && Array.isArray(q.options)) push(out, ...q.options); }
  } else if (t === 'flashcards') {
    for (const c of ex.cards || []) push(out, c && c.front, c && c.back);
  } else if (t === 'matching') {
    for (const p of ex.pairs || []) push(out, p && p.left, p && p.right);
  } else if (t === 'drag-and-drop') {
    push(out, ex.instruction);
    for (const it of ex.items || []) push(out, it && it.label); // it.id is metadata → excluded
  } else if (t === 'builder') {
    push(out, ex.instruction, ex.correctCommand);
    if (Array.isArray(ex.parts)) push(out, ...ex.parts);
    if (Array.isArray(ex.hints)) push(out, ...ex.hints);
  } else if (t === 'scenario') {
    push(out, ex.title, ex.scenario);
    for (const st of ex.steps || []) { push(out, st && st.description); for (const o of (st && st.options) || []) push(out, o && o.text, o && o.feedback); }
  }
  return out.join(' ');
}
// Learner-visible fields of the finalTest: the question + options only (NOT id/sectionId).
export function visibleFinalTestText(section) {
  const ft = (section && section.finalTest) || {};
  const out = [];
  push(out, ft.question);
  if (Array.isArray(ft.options)) push(out, ...ft.options);
  return out.join(' ');
}

// Order-insensitive, stable serialization: object keys sorted. NOTE this does NOT canonicalize array
// MEMBER order — use canonicalConditionKey for set-like arrays (round-3 PART-A2).
export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}

// Canonical key for an achievement conditionRef dedupe (round-3 PART-A2). The `ids` array of a
// `section-group` is SET-LIKE, so its member order is not significant — sort it before serializing so
// two conditions with the SAME ids in a different order are recognized as duplicates.
export function canonicalConditionKey(cr) {
  if (!cr || typeof cr !== 'object') return stableStringify(cr);
  const c = { ...cr };
  if (Array.isArray(c.ids)) c.ids = [...c.ids].map((x) => String(x)).sort();
  return stableStringify(c);
}

// The persona's name token — the FIRST meaningful token of `persona.name` (round-3 PART-A1).
// HONEST SCOPE: this is a PRESENCE check, not a name-quality check. It does NOT verify the token is a
// proper noun or a non-role word — `persona.name = "Developer"` is accepted. The gate only proves the
// author's chosen persona name is THREADED CONSISTENTLY through every section; whether the persona is a
// vivid, story-worthy character is a Plane-2 (cross-model review) judgment, not this gate's.
export function personaNameToken(name) {
  const toks = tokensOf(name).filter((w) => w.length >= 3);
  return toks.length ? toks[0] : null;
}

// Resolve citeable method-pattern ids from the KB's AUTHORITATIVE id-index block ONLY (round-3 PART-A3).
// It parses the `## Pattern index …` section and reads the pure P#/D# code span INSIDE it — a stray
// `P99` code span ELSEWHERE in the KB is NOT citeable. Throws if the KB is absent or has no index block.
export function resolveMethodPatternIds(kbPath) {
  const raw = readFileSync(kbPath, 'utf-8'); // throws ENOENT if the KB is missing → loud precondition failure
  // Isolate the "## Pattern index" section: from its heading to the next heading (or EOF).
  const start = raw.search(/^#{1,6}[^\n]*pattern index/im);
  let scope = '';
  if (start >= 0) {
    let rest = raw.slice(start);
    rest = rest.slice(rest.indexOf('\n') + 1);        // drop the heading line itself
    const next = rest.search(/^#{1,6}[ \t]/m);         // next heading
    scope = next >= 0 ? rest.slice(0, next) : rest;    // … or to EOF
  }
  const ids = new Set();
  for (const m of scope.matchAll(/`([^`]+)`/g)) {
    const inner = m[1].trim();
    if (/^[PD]\d{1,2}(?:\s+[PD]\d{1,2})*$/.test(inner)) for (const t of inner.split(/\s+/)) ids.add(t);
  }
  if (ids.size === 0) throw new Error(`method-KB at ${kbPath} has no authoritative pattern-id index block (a '## Pattern index' section with a code span listing P#/D# ids)`);
  return ids;
}

// Step-0 projection (ADR-001): derive the lightweight edu-site topics[] view from the full sections[].
export function toStepZero(course) {
  if (!course || typeof course !== 'object' || !Array.isArray(course.sections)) {
    throw new TypeError('toStepZero: course.sections[] required');
  }
  return {
    language: course.language,
    courseTitle: course.courseTitle,
    courseDescription: course.courseDescription,
    topics: course.sections.map((s) => ({
      id: s.id,
      title: s.title,
      keyConcepts: Array.isArray(s.keyConcepts) && s.keyConcepts.length
        ? s.keyConcepts
        : (s.keyConcept ? [s.keyConcept] : []),
      suggestedExercise: normalizeType(s.interactiveType),
      methodPattern: s.methodPattern,
      source: s.source || null,
    })),
  };
}

// Is the section's exercise payload MEANINGFULLY non-empty for its declared type? (P5 do-something.)
// Rejects blank/null shells: empty strings, null elements, non-distinct options, degenerate orders.
export function exerciseNonEmpty(section) {
  const t = normalizeType(section && section.interactiveType);
  const ex = (section && section.exercise) || null;
  const quizOk = (q) => q && nonBlank(q.question)
    && Array.isArray(q.options) && q.options.length >= 2 && allNonBlankStrings(q.options)
    && new Set(q.options.map((o) => o.trim())).size === q.options.length
    && Number.isInteger(q.correctAnswer) && q.correctAnswer >= 0 && q.correctAnswer < q.options.length;
  switch (t) {
    case 'quiz':
      return Array.isArray(section.quiz) && section.quiz.length >= 1 && section.quiz.every(quizOk);
    case 'flashcards':
      return !!ex && Array.isArray(ex.cards) && ex.cards.length >= 2
        && ex.cards.every((c) => c && nonBlank(c.front) && nonBlank(c.back) && c.front.trim() !== c.back.trim());
    case 'matching':
      return !!ex && Array.isArray(ex.pairs) && ex.pairs.length >= 2
        && ex.pairs.every((p) => p && nonBlank(p.left) && nonBlank(p.right));
    case 'drag-and-drop': {
      if (!ex || !Array.isArray(ex.items) || ex.items.length < 2) return false;
      if (!ex.items.every((it) => it && nonBlank(it.id) && nonBlank(it.label))) return false;
      const ids = ex.items.map((it) => it.id);
      if (new Set(ids).size !== ids.length) return false;
      return Array.isArray(ex.correctOrder) && ex.correctOrder.length === ids.length
        && new Set(ex.correctOrder).size === ids.length && ex.correctOrder.every((id) => ids.includes(id));
    }
    case 'builder':
      return !!ex && Array.isArray(ex.parts) && ex.parts.length >= 1 && allNonBlankStrings(ex.parts) && nonBlank(ex.correctCommand);
    case 'scenario':
      return !!ex && Array.isArray(ex.steps) && ex.steps.length >= 1
        && ex.steps.every((st) => st && nonBlank(st.description)
          && Array.isArray(st.options) && st.options.length >= 1 && st.options.every((o) => o && nonBlank(o.text)));
    default:
      return false; // unknown type → not a valid do-something
  }
}
