#!/usr/bin/env node
// brain-friendliness-prompt — the Plane-2 seam (ADR-003, layer 3, cross-model).
// This does NOT grade a course. The SEMANTIC grade (tone P3, surprise P4, story P8, analogy P6/P11) is
// the parent pipeline's cross-model Codex QE job — a FRESH reviewer, never the authoring agent. This
// module only (a) BUILDS the reviewer prompt, grounding it on the shipped page-anchored KB, and
// (b) PARSES a returned review, refusing to read an empty/gradeless answer as clean (codex-routing-
// honesty: a stub must not pass for a verdict). Both are unit-tested deterministically.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GRADES = ['A', 'B', 'C', 'D', 'F'];

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_KB = join(__dirname, '..', 'references', 'head-first-method.md');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

/**
 * FAIL-CLOSED KB precondition (backlog F3): the Plane-2 review prompt claims to be "grounded on the
 * page-anchored KB" — emitting that claim without ever OPENING the KB is the same false-green shape
 * headfirst-gate refuses. Mirror of headfirst-gate's pin: the KB must exist, be readable, and be
 * byte-identical to the bundled references/head-first-method.md (a counterfeit KB must not be able
 * to ground the semantic review any more than it can resolve citations). Pure — returns {ok:true}
 * or {ok:false, error} so the check is unit-testable without spawning the CLI.
 */
export function verifyKb(kbPath) {
  if (!kbPath || typeof kbPath !== 'string') return { ok: false, error: 'kbPath required (grounding is mandatory)' };
  if (!existsSync(kbPath)) return { ok: false, error: `method-KB not found: ${kbPath} — refusing to build a "grounded" review prompt on an absent KB` };
  try {
    if (resolve(kbPath) !== resolve(BUNDLED_KB) && sha256(kbPath) !== sha256(BUNDLED_KB)) {
      return { ok: false, error: `--kb (${kbPath}) does not match the bundled method-KB (content-hash mismatch) — refusing a counterfeit KB` };
    }
  } catch (e) {
    return { ok: false, error: `cannot read method-KB (${kbPath}): ${e.message}` };
  }
  return { ok: true };
}

// Build the reviewer prompt. Embeds the KB PATH (so the reviewer must read the method) and the course.
export function buildReviewPrompt({ kbPath, coursePath, course }) {
  if (!kbPath) throw new TypeError('buildReviewPrompt: kbPath required (grounding is mandatory)');
  const title = course && course.courseTitle ? course.courseTitle : '(course)';
  const nSections = course && Array.isArray(course.sections) ? course.sections.length : '?';
  return [
    'You are a FRESH Head First brain-friendliness reviewer. You did NOT author this course.',
    `Ground your review ONLY in the page-anchored method-KB at: ${kbPath}`,
    'Read that KB first. Then grade the SEMANTIC Head First properties a script cannot check:',
    '- P3 conversational tone (second person, informal, not a dry lecture)',
    '- P4 surprise & emotion (a twist / joke / aha, not flat even prose)',
    '- P8 stories & judgment (a narrative the reader follows and decisions they weigh)',
    '- P6/P11 analogy & metacognition quality',
    'For EACH critique you raise, cite which pattern id (P1..P12 / D1..D4) from the KB it maps to.',
    `Course under review: "${title}" (${nSections} sections)${coursePath ? ` at ${coursePath}` : ''}.`,
    '',
    'End with EXACTLY one line: "GRADE: <A|B|C|D|F>" and a one-paragraph justification.',
    'If you cannot read the KB or the course, say so plainly — do NOT emit a grade you did not earn.',
  ].join('\n');
}

// Parse a returned review. Returns { grade, gaps[], raw } on a real verdict, or NULL on
// empty/whitespace/gradeless output → the caller MUST fall back loudly and log that cross-model QE
// did NOT happen (never treat null as a clean pass).
export function parseReview(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  const m = trimmed.match(/GRADE:\s*([A-F])\b/i);
  if (!m) return null; // text without a grade is NOT a verdict
  const grade = m[1].toUpperCase();
  if (!GRADES.includes(grade)) return null;
  // gaps: lines that cite a pattern id (grounded critiques)
  const gaps = trimmed.split('\n').filter((l) => /\b[PD]\d{1,2}\b/.test(l) && !/^GRADE:/i.test(l.trim()));
  return { grade, gaps, raw: trimmed };
}

// CLI: print the prompt for a given KB + course (used by modules/04 as the dispatch payload).
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  const argv = process.argv.slice(2);
  const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
  const kbPath = opt('kb', null);
  const coursePath = opt('course', null);
  if (!kbPath || !coursePath) { console.error('usage: brain-friendliness-prompt --kb <method.md> --course <course.json>'); process.exit(2); }
  // FAIL-CLOSED (F3): an absent/counterfeit KB must not yield a confident "grounded" prompt + exit 0.
  const kb = verifyKb(kbPath);
  if (!kb.ok) { console.error(`brain-friendliness-prompt: ${kb.error}`); process.exit(1); }
  let course = null;
  try { course = JSON.parse(readFileSync(coursePath, 'utf-8')); } catch { /* prompt still builds without it — the DEGRADATION IS VISIBLE: "(course)" (? sections) */ }
  process.stdout.write(buildReviewPrompt({ kbPath, coursePath, course }) + '\n');
}
