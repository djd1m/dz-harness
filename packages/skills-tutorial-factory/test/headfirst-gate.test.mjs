// ADR-003 Confirmation — the deterministic Head-First gate DISCRIMINATES (§42).
// PASS on a compliant course; FAIL on each single mutated property; flipping the property flips the
// verdict. Plane-2: the reviewer prompt embeds the KB path and an empty review is a loud fallback,
// never a clean pass. Run: node --test test/headfirst-gate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compliantCourse, clone, MUTATORS } from './_fixtures.mjs';
import { buildReviewPrompt, parseReview, verifyKb } from '../package-tutorial-factory/scripts/brain-friendliness-prompt.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GATE = join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'headfirst-gate.mjs');
const KB = join(__dirname, '..', 'package-tutorial-factory', 'references', 'head-first-method.md');

function runGate(course) {
  const dir = mkdtempSync(join(tmpdir(), 'hf-gate-'));
  const cf = join(dir, 'course.json');
  const jf = join(dir, 'report.json');
  writeFileSync(cf, JSON.stringify(course));
  const r = spawnSync(process.execPath, [GATE, '--course', cf, '--json', jf], { encoding: 'utf-8' });
  let report = null;
  try { report = JSON.parse(readFileSync(jf, 'utf-8')); } catch { /* */ }
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, stdout: r.stdout, report };
}

test('compliant course PASSES the gate (exit 0)', () => {
  const { code, report } = runGate(compliantCourse());
  assert.equal(code, 0, `expected PASS; failures: ${JSON.stringify(report && report.failures)}`);
  assert.equal(report.pass, true);
});

test('each single mutated property FAILS the gate — discrimination', () => {
  for (const [name, mutate] of Object.entries(MUTATORS)) {
    // base passes
    const basePass = runGate(compliantCourse());
    assert.equal(basePass.code, 0, `base should pass before ${name}`);
    // mutated fails
    const mutated = mutate(clone(compliantCourse()));
    const { code, report } = runGate(mutated);
    assert.equal(code, 1, `mutation "${name}" should FAIL the gate but it passed`);
    assert.equal(report.pass, false, `mutation "${name}" report.pass should be false`);
    assert.ok(report.failures.length >= 1, `mutation "${name}" should record >=1 failure`);
  }
});

test('each Codex-named "presence not meaning" evasion trips the RIGHT check (pinned P1 proof)', () => {
  // mutator name → the gate check id that MUST appear in report.failures
  const expect = {
    'blank-but-present-exercise': 'P5.do-something',
    'quiz-options-blank': 'P5.do-something',
    'concept-not-in-exercise': 'P2.redundancy-three-encodings',
    'concept-not-in-final': 'P2.redundancy-three-encodings',
    'marker-only-D2': 'D2.reflective-quartet',
    'quartet-missing-wrapup': 'D2.reflective-quartet',
    'persona-missing-one-section': 'D1.running-persona-every-section',
    'bogus-citation-P99': 'method.per-section-citation-resolves',
    'duplicate-achievement-condition': 'gamification.achievement-floor',
    'blank-achievement-id': 'gamification.achievement-floor',
    // round-2 deeper bypasses
    'concept-only-in-metadata': 'P2.redundancy-three-encodings',
    'persona-generic-token-only': 'D1.running-persona-every-section',
    'achievement-reordered-condition-dupe': 'gamification.achievement-floor',
    'achievement-permuted-ids-dupe': 'gamification.achievement-floor',
    'quiz-options-invisible': 'P5.do-something',
  };
  for (const [name, checkId] of Object.entries(expect)) {
    const mutated = MUTATORS[name](clone(compliantCourse()));
    const { code, report } = runGate(mutated);
    assert.equal(code, 1, `"${name}" must FAIL the gate`);
    const failedIds = report.failures.map((f) => f.id);
    assert.ok(failedIds.includes(checkId), `"${name}" must trip ${checkId}; tripped ${JSON.stringify(failedIds)}`);
  }
});

test('PART-A1 narrowed promise: persona is a PRESENCE check — a generic name ("Developer") PASSES', () => {
  // The gate proves the persona NAME token is threaded through every section; it does NOT require a
  // proper noun / vivid character (that is Plane-2). A course naming its persona "Developer" and using
  // that token in every section must PASS — documenting the honest, narrowed promise.
  const c = clone(compliantCourse());
  c.persona = { name: 'Developer', description: 'the reader' };
  for (const s of c.sections) s.theory = `Developer, you and ${s.keyConcept} meet here. ${s.keyConcept} clicks for the Developer.`;
  const { code } = runGate(c);
  assert.equal(code, 0, 'a presence-check persona (generic name, threaded everywhere) must PASS');
});

test('round-2 HIGH #2: a COUNTERFEIT --kb (adds its own P99 index) is REFUSED by content-hash pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hf-kb-'));
  // a counterfeit KB whose id index would make ANY citation (incl. P99) resolve
  const fakeKb = join(dir, 'fake-method.md');
  writeFileSync(fakeKb, '# fake\n\n## Pattern index\n\n`P1 P2 P3 P4 P5 P6 P7 P8 P9 P10 P11 P12 P99 D1 D2 D3 D4`\n');
  // a course whose section cites P99 — would PASS against the counterfeit KB, must FAIL when pinned
  const course = clone(compliantCourse());
  course.sections[0].methodPattern = 'P99';
  const cf = join(dir, 'course.json');
  writeFileSync(cf, JSON.stringify(course));
  const r = spawnSync(process.execPath, [GATE, '--course', cf, '--kb', fakeKb], { encoding: 'utf-8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1, 'a counterfeit --kb must be refused (hash mismatch), never trusted');
  assert.match(r.stdout + r.stderr, /counterfeit|hash/i, 'the refusal reason should name the hash mismatch');
});

test('malformed input FAILS closed (never a vacuous pass)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hf-bad-'));
  const cf = join(dir, 'bad.json');
  writeFileSync(cf, '{ this is not json');
  const r = spawnSync(process.execPath, [GATE, '--course', cf], { encoding: 'utf-8' });
  rmSync(dir, { recursive: true, force: true });
  assert.equal(r.status, 1, 'malformed course must fail closed');
});

test('non-finite --min-achievements clamps to default (Infinity-recidivism)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hf-inf-'));
  const cf = join(dir, 'course.json');
  writeFileSync(cf, JSON.stringify(compliantCourse()));
  const r = spawnSync(process.execPath, [GATE, '--course', cf, '--min-achievements', 'Infinity'], { encoding: 'utf-8' });
  rmSync(dir, { recursive: true, force: true });
  // Infinity would make the 8-achievement course fail; a proper clamp keeps it passing (default 8).
  assert.equal(r.status, 0, 'Infinity must clamp to the default, not become an unreachable floor');
});

// --- Plane 2 seam (ADR-003, codex-routing-honesty) ---
test('reviewer prompt embeds the KB path (grounding is mandatory)', () => {
  const prompt = buildReviewPrompt({ kbPath: KB, coursePath: '/x/course.json', course: compliantCourse() });
  assert.ok(prompt.includes(KB), 'prompt must embed the method-KB path');
  assert.ok(/P3|P4|P8/.test(prompt), 'prompt must name the semantic patterns to grade');
});

test('empty / gradeless review → loud fallback (null), a real grade parses', () => {
  assert.equal(parseReview(''), null, 'empty review must NOT read as clean');
  assert.equal(parseReview('   \n  '), null, 'whitespace review must NOT read as clean');
  assert.equal(parseReview('Looks good to me, nice course.'), null, 'text without a GRADE is not a verdict');
  const v = parseReview('The tone is dry (P3).\nGRADE: C\nJustification here.');
  assert.ok(v && v.grade === 'C', 'a real grade must parse');
  assert.ok(v.gaps.some((g) => /P3/.test(g)), 'grounded critique lines are captured');
});

test('buildReviewPrompt refuses to run without a KB path', () => {
  assert.throws(() => buildReviewPrompt({ coursePath: 'x', course: {} }), /kbPath required/);
});

// ── F3 (backlog 35fe94af): the Plane-2 prompt builder must FAIL CLOSED on its KB precondition ──
test('verifyKb REFUSES an absent KB (fail-closed, not a confident prompt)', () => {
  const r = verifyKb('/nonexistent-kb-for-f3-test.md');
  assert.equal(r.ok, false);
  assert.match(r.error, /not found|absent/i);
});

test('verifyKb REFUSES a counterfeit KB (content-hash mismatch, mirror of the gate pin)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f3-kb-'));
  const fake = join(dir, 'method.md');
  writeFileSync(fake, '# Fake KB\n## Pattern index\n`P99`\n');
  const r = verifyKb(fake);
  assert.equal(r.ok, false);
  assert.match(r.error, /content-hash mismatch|counterfeit/i);
  rmSync(dir, { recursive: true, force: true });
});

test('verifyKb ACCEPTS the bundled KB (the refusal is not a blanket never-pass)', () => {
  const bundled = join(__dirname, '..', 'package-tutorial-factory', 'references', 'head-first-method.md');
  assert.equal(verifyKb(bundled).ok, true);
});

test('CLI exits 1 on an absent KB and prints NO prompt (the F3 repro, was exit 0 + confident prompt)', () => {
  const r = spawnSync(process.execPath, [join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'brain-friendliness-prompt.mjs'),
    '--kb', '/nonexistent-kb.md', '--course', join(__dirname, '..', 'package-tutorial-factory', 'references', 'head-first-method.md')], { encoding: 'utf-8' });
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stdout: ${r.stdout.slice(0, 120)}`);
  assert.equal(r.stdout.trim(), '', 'no prompt may be emitted on a refused KB');
  assert.match(r.stderr, /not found|refusing/i);
});
