#!/usr/bin/env node
// headfirst-gate — DETERMINISTIC, zero-LLM Head-First-checklist gate (ADR-003, Plane 1).
// node builtins only; no Date/random → reproducible in CI. Reads a produced course-data JSON and
// returns a machine-checkable verdict.
//
// SCOPE (honest, per ADR-003's cost-of-detection ladder AND Codex QE 2026-07-28, CRITICAL-3):
//   This gate proves only the STRUCTURAL Head First properties a rule can decide with certainty —
//   a MEANINGFUL exercise per section, type variety, three-encoding redundancy (the concept actually
//   appears in theory AND exercise AND final test), the full reflective quartet, the running persona
//   threaded through EVERY section, a de-duplicated gamification floor, and citations that RESOLVE in
//   the shipped method-KB. It does NOT — and must never CLAIM to — judge the SEMANTIC quality of tone
//   (P3), surprise (P4), or story (P8). Those are model judgment and live ONLY in Plane 2
//   (scripts/brain-friendliness-prompt.mjs), cross-model and advisory. A green verdict here means the
//   course is structurally Head First, NOT that it reads well — that is the Plane-2 reviewer's call.
//
//   node headfirst-gate.mjs --course course.json [--kb references/head-first-method.md]
//        [--min-achievements 8] [--json report.json]
//
// Exit 0 iff PASS. FAIL-CLOSED: malformed input / parse error / absent KB → FAIL (exit 1).

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_TYPES, normalizeType, VALID_CONDITION_TYPES, exerciseNonEmpty,
  nonBlank, conceptEncodedIn, resolveMethodPatternIds, tokensOf,
  visibleExerciseText, visibleFinalTestText, canonicalConditionKey, personaNameToken,
} from './course-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_KB = join(__dirname, '..', 'references', 'head-first-method.md');
const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// ---- args (with finite clamps — the Infinity-recidivism lesson) -------------
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const has = (name) => argv.includes(`--${name}`);
const clampInt = (v, def, lo, hi) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : def; };

const courseArg = opt('course', null);
const kbArg = opt('kb', join(__dirname, '..', 'references', 'head-first-method.md'));
const MIN_ACH = clampInt(opt('min-achievements', '8'), 8, 1, 1000);
const FINAL_TEST_MIN_PASS = clampInt(opt('final-test-min-pass', '70'), 70, 0, 100);
const jsonOut = opt('json', null);

if (!courseArg || has('help') || has('h')) {
  console.error('usage: headfirst-gate --course course.json [--kb method.md] [--min-achievements 8] [--json report.json]');
  process.exit(2);
}

// ---- load (fail-closed) -----------------------------------------------------
function loadCourse(path) {
  let raw;
  try { raw = readFileSync(path, 'utf-8'); }
  catch (e) { return { error: `cannot read course file: ${e.message}` }; }
  try { return { course: JSON.parse(raw) }; }
  catch (e) { return { error: `course JSON parse error: ${e.message}` }; }
}

// The citeable pattern id set — resolved from a KB PINNED to the bundled one (round-2 HIGH #2). A
// counterfeit KB (e.g. one that adds its own `P99` index so any citation resolves) is refused: a
// non-bundled --kb must be byte-identical to the shipped references/head-first-method.md.
function loadPatternIds(kbPath) {
  try {
    const bundledHash = sha256(BUNDLED_KB);
    if (resolve(kbPath) !== resolve(BUNDLED_KB) && sha256(kbPath) !== bundledHash) {
      return { error: `--kb (${kbPath}) does not match the bundled method-KB (content-hash mismatch) — refusing a counterfeit KB` };
    }
    return { ids: resolveMethodPatternIds(kbPath) };
  } catch (e) { return { error: `cannot resolve method-KB (${kbPath}): ${e.message}` }; }
}

// ---- checks -----------------------------------------------------------------
function runChecks(course, patternIds) {
  const checks = [];
  const add = (id, pass, detail) => checks.push({ id, pass: !!pass, detail });

  if (!course || typeof course !== 'object' || !Array.isArray(course.sections) || course.sections.length === 0) {
    add('structural.sections-present', false, 'course.sections[] missing or empty');
    return checks;
  }
  const sections = course.sections;
  const N = sections.length;

  // --- structural validity: unique kebab ids, valid types, in-bounds answers, one finalTest/section
  const ids = sections.map((s) => s && s.id);
  const kebab = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const idsUnique = new Set(ids).size === ids.length && ids.every((id) => typeof id === 'string' && kebab.test(id));
  add('structural.unique-kebab-ids', idsUnique, idsUnique ? `${N} unique kebab ids` : `bad or duplicate section ids: ${JSON.stringify(ids)}`);

  // topics[] Step-0 projection (backlog F4): modules/02 + method-to-edusite-map REQUIRE the course to
  // carry the projection, but nothing gated it — so the shipped dogfood example silently diverged from
  // the contract authors copy. Layer-1: present, same cardinality, ids match sections 1:1 (in order),
  // exactly what `toStepZero` derives.
  const topicsOk = Array.isArray(course.topics)
    && course.topics.length === N
    && course.topics.every((t, i) => t && typeof t === 'object' && t.id === sections[i].id);
  add('structural.topics-projection', topicsOk, topicsOk
    ? `topics[] projection present, ${N} ids match sections 1:1`
    : `topics[] missing or diverged from sections (the toStepZero projection is REQUIRED by modules/02)`);

  const typesValid = sections.every((s) => CANONICAL_TYPES.includes(normalizeType(s && s.interactiveType)));
  add('structural.valid-exercise-types', typesValid, typesValid ? 'all interactiveType in canonical enum' : 'a section has an unknown interactiveType');

  const finalTestOk = sections.every((s) => {
    const ft = s && s.finalTest;
    return ft && ft.sectionId === s.id && nonBlank(ft.question) && Array.isArray(ft.options) && ft.options.length >= 2
      && ft.options.every(nonBlank) && Number.isInteger(ft.correctAnswer) && ft.correctAnswer >= 0 && ft.correctAnswer < ft.options.length;
  });
  add('structural.one-finaltest-per-section', finalTestOk, finalTestOk ? 'each section has exactly one meaningful in-bounds finalTest' : 'a section is missing a valid finalTest');

  // --- P5 do-something: MEANINGFUL exercise for the section's type (no blank/null shells)
  const p5Fail = sections.filter((s) => !exerciseNonEmpty(s)).map((s) => s.id);
  add('P5.do-something', p5Fail.length === 0, p5Fail.length === 0 ? 'every section has a meaningful, content-bearing exercise' : `sections with an empty/blank exercise: ${JSON.stringify(p5Fail)}`);

  // --- exercise diversity (P7): no 3+ consecutive same type; all 6 present when N>=6
  const seq = sections.map((s) => normalizeType(s.interactiveType));
  let maxRun = 1, run = 1;
  for (let i = 1; i < seq.length; i++) { if (seq[i] === seq[i - 1]) { run++; maxRun = Math.max(maxRun, run); } else run = 1; }
  add('P7.no-3-consecutive-same-type', maxRun < 3, maxRun < 3 ? `max consecutive run = ${maxRun}` : `${maxRun} consecutive sections share an exercise type`);
  const distinct = new Set(seq);
  const allSix = N < 6 || CANONICAL_TYPES.every((t) => distinct.has(t));
  add('P7.all-six-types-when-N>=6', allSix, allSix ? (N < 6 ? 'N<6, rule N/A' : 'all 6 types present') : `N>=6 but missing types: ${CANONICAL_TYPES.filter((t) => !distinct.has(t)).join(',')}`);

  // --- P2 redundancy: the keyConcept is ENCODED in VISIBLE learner text — theory prose, the exercise's
  // visible fields, and the finalTest's visible fields — NOT in id/marker/metadata (round-2 CRITICAL #1)
  const redundancyFail = sections.filter((s) => {
    const concept = s.keyConcept;
    if (!nonBlank(concept)) return true;
    const inTheory = conceptEncodedIn(concept, s.theory || '');
    const inExercise = conceptEncodedIn(concept, visibleExerciseText(s));
    const inFinal = conceptEncodedIn(concept, visibleFinalTestText(s));
    return !(inTheory && inExercise && inFinal && exerciseNonEmpty(s));
  }).map((s) => s.id);
  add('P2.redundancy-three-encodings', redundancyFail.length === 0, redundancyFail.length === 0 ? 'each concept is encoded in theory + exercise + finalTest' : `concept not re-encoded across all three in: ${JSON.stringify(redundancyFail)}`);

  // --- D2 reflective quartet: the FULL quartet, each part non-empty (marker-only is rejected)
  const quartetFail = sections.filter((s) => {
    const r = s.reflection;
    const ratingOk = r && (nonBlank(r.rating) || Number.isFinite(r.rating));
    return !(r && nonBlank(r.strengths) && nonBlank(r.weaknesses) && ratingOk && nonBlank(r.wrapup));
  }).map((s) => s.id);
  add('D2.reflective-quartet', quartetFail.length === 0, quartetFail.length === 0 ? 'each section carries the full quartet (strengths, weaknesses, rating, wrap-up)' : `incomplete reflective quartet in: ${JSON.stringify(quartetFail)}`);

  // --- D1 running persona: the persona's NAME TOKEN must appear in EVERY section's theory. This is a
  // PRESENCE/consistency check, NOT a name-quality check (persona.name="Developer" is accepted) — vivid-
  // character quality is a Plane-2 judgment (round-3 PART-A1).
  const personaName = course.persona && course.persona.name ? String(course.persona.name).trim() : '';
  const personaToken = nonBlank(personaName) ? personaNameToken(personaName) : null;
  const personaMissing = personaToken
    ? sections.filter((s) => !tokensOf(s.theory || '').includes(personaToken)).map((s) => s.id)
    : sections.map((s) => s.id);
  const personaOk = !!personaToken && personaMissing.length === 0;
  add('D1.running-persona-every-section', personaOk, personaOk ? `persona "${personaToken}" threaded through all ${N} sections` : (personaToken ? `persona name "${personaToken}" missing from sections: ${JSON.stringify(personaMissing)}` : 'no distinctive course-level persona.name'));

  // --- gamification floor (P4/P11 gamification, NOT surprise-quality): dedup + meaningful metadata
  const ach = Array.isArray(course.achievements) ? course.achievements : [];
  const achStateValid = ach.every((a) => {
    if (!a || !nonBlank(a.id) || !a.conditionRef || !VALID_CONDITION_TYPES.has(a.conditionRef.type)) return false;
    const cr = a.conditionRef;
    if (cr.type === 'sections-completed') return Number.isInteger(cr.n) && cr.n >= 1;
    if (cr.type === 'final-test-pass') return Number.isFinite(cr.min) && cr.min >= 0 && cr.min <= 100;
    if (cr.type === 'section-group') return Array.isArray(cr.ids) && cr.ids.length >= 1 && cr.ids.every(nonBlank);
    return true; // all-sections, perfect-section
  });
  const achMetaOk = ach.every((a) => a && nonBlank(a.title) && nonBlank(a.description));
  const achIds = ach.map((a) => (a && typeof a.id === 'string' ? a.id.trim() : ''));
  const achIdsUnique = achIds.every(nonBlank) && new Set(achIds).size === achIds.length;
  const condKeys = ach.map((a) => canonicalConditionKey(a && a.conditionRef)); // set-like ids canonicalized (round-3 A2)
  const condDistinct = new Set(condKeys).size === condKeys.length;
  const achFloorOk = ach.length >= MIN_ACH && achStateValid && achMetaOk && achIdsUnique && condDistinct;
  add('gamification.achievement-floor', achFloorOk, achFloorOk ? `${ach.length} distinct, well-formed achievements` : `achievements: n=${ach.length}(need ${MIN_ACH}) stateValid=${achStateValid} metaOk=${achMetaOk} idsUnique=${achIdsUnique} condDistinct=${condDistinct}`);

  const passThresh = Number.isFinite(course.finalTestPassThreshold) ? course.finalTestPassThreshold : NaN;
  const passOk = Number.isFinite(passThresh) && passThresh >= FINAL_TEST_MIN_PASS;
  add('gamification.final-test-pass-threshold', passOk, passOk ? `finalTestPassThreshold=${passThresh}` : `finalTestPassThreshold must be >= ${FINAL_TEST_MIN_PASS}, got ${course.finalTestPassThreshold}`);

  // --- method grounding (ADR-001): every section cites a pattern id that RESOLVES in the shipped KB
  const citeFail = sections.filter((s) => !(typeof s.methodPattern === 'string' && patternIds.has(s.methodPattern.trim()))).map((s) => `${s.id}:${s.methodPattern}`);
  add('method.per-section-citation-resolves', citeFail.length === 0, citeFail.length === 0 ? `every section cites a KB-resolvable pattern id (${patternIds.size} citeable)` : `unresolvable/absent citations: ${JSON.stringify(citeFail)}`);

  return checks;
}

// ---- run + report -----------------------------------------------------------
const { course, error: loadErr } = loadCourse(courseArg);
const { ids: patternIds, error: kbErr } = loadPatternIds(kbArg);
let checks;
if (loadErr) checks = [{ id: 'input.parse', pass: false, detail: loadErr }];
else if (kbErr) checks = [{ id: 'input.kb-precondition', pass: false, detail: kbErr }];
else checks = runChecks(course, patternIds);

const failures = checks.filter((c) => !c.pass);
const pass = failures.length === 0 && !loadErr && !kbErr;

const report = {
  tool: 'headfirst-gate',
  scope: 'structural Head First properties ONLY; tone/surprise/story quality are Plane-2 (advisory), not gated here',
  course: courseArg,
  kb: kbArg,
  config: { minAchievements: MIN_ACH, finalTestMinPass: FINAL_TEST_MIN_PASS },
  sections: (loadErr || kbErr) ? 0 : (course.sections || []).length,
  checks,
  failures: failures.map((f) => ({ id: f.id, detail: f.detail })),
  pass,
};

const line = '─'.repeat(64);
console.log(line);
console.log('headfirst-gate — Head First STRUCTURAL checklist (Plane 1, ADR-003)');
console.log('(tone/surprise/story quality is Plane-2, cross-model, advisory — NOT gated here)');
console.log(line);
for (const c of checks) console.log(`  ${c.pass ? 'ok  ' : 'FAIL'}  ${c.id}${c.pass ? '' : ` — ${c.detail}`}`);
console.log(line);
console.log(pass ? `PASS — ${checks.length} structural Head First properties hold.`
  : `FAIL — ${failures.length}/${checks.length} structural properties broken.`);
console.log(line);

if (jsonOut) { writeFileSync(jsonOut, JSON.stringify(report, null, 2)); console.log(`report → ${jsonOut}`); }

process.exit(pass ? 0 : 1);
