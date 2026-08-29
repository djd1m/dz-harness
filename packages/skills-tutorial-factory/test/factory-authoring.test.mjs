// ADR-001 Confirmation — authoring output is a valid edu-site Step-0 object AND every section cites a
// method pattern id that RESOLVES in the shipped KB. Zero citations / missing contract fields FAIL;
// an absent KB is a loud precondition failure (grounding is not optional).
//   node --test test/factory-authoring.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { toStepZero, resolveMethodPatternIds, CANONICAL_TYPES, normalizeType } from '../package-tutorial-factory/scripts/course-schema.mjs';
import { compliantCourse, clone } from './_fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KB = join(__dirname, '..', 'package-tutorial-factory', 'references', 'head-first-method.md');

test('PART-A3: resolver reads ONLY the authoritative index block — a stray out-of-index `P99` is IGNORED', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-idx-'));
  const f = join(dir, 'kb.md');
  // a stray pure-id code span OUTSIDE the index section must NOT be citeable
  writeFileSync(f, '# KB\n\nSome prose with a stray span `P99` here.\n\n## Pattern index (machine-resolvable ids)\n\nResolve against exactly these:\n\n`P1 P2 P3 D1`\n');
  const ids = resolveMethodPatternIds(f);
  rmSync(dir, { recursive: true, force: true });
  assert.ok(ids.has('P1') && ids.has('D1'), 'index-block ids resolve');
  assert.ok(!ids.has('P99'), 'a P99 span outside the index block must NOT resolve');
});

test('PART-A3: a KB with NO index block throws (loud precondition, not a silent empty set)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-noidx-'));
  const f = join(dir, 'kb.md');
  writeFileSync(f, '# KB\n\nStray `P1` `P2` spans but no index heading.\n');
  assert.throws(() => resolveMethodPatternIds(f), /index/i);
  rmSync(dir, { recursive: true, force: true });
});

// The acceptance predicate the authoring step must satisfy (mirrors the ADR-001 Confirmation).
function validateAuthoring(course, kbPath) {
  const ids = resolveMethodPatternIds(kbPath); // throws if KB absent → precondition
  const step0 = toStepZero(course);
  const errors = [];
  if (!step0.language) errors.push('missing language');
  if (!step0.courseTitle) errors.push('missing courseTitle');
  if (!Array.isArray(step0.topics) || step0.topics.length < 3) errors.push('need >=3 topics');
  for (const t of step0.topics || []) {
    if (!Array.isArray(t.keyConcepts) || t.keyConcepts.length < 1) errors.push(`topic ${t.id}: no keyConcepts`);
    if (!CANONICAL_TYPES.includes(normalizeType(t.suggestedExercise))) errors.push(`topic ${t.id}: bad suggestedExercise`);
    if (!t.methodPattern || !ids.has(t.methodPattern)) errors.push(`topic ${t.id}: method citation "${t.methodPattern}" does not resolve in KB`);
  }
  const citationCount = (step0.topics || []).filter((t) => t.methodPattern && ids.has(t.methodPattern)).length;
  if (citationCount === 0) errors.push('ZERO method citations — grounding is decorative, not wired');
  return { ok: errors.length === 0, errors, step0, citationCount };
}

test('KB resolves a non-empty set of pattern ids', () => {
  const ids = resolveMethodPatternIds(KB);
  assert.ok(ids.has('P5') && ids.has('P2') && ids.has('D1'), 'KB must expose the canonical pattern ids');
});

test('valid authored course PASSES (Step-0 valid + every section cites a resolving pattern)', () => {
  const res = validateAuthoring(compliantCourse(), KB);
  assert.ok(res.ok, `expected pass; errors: ${JSON.stringify(res.errors)}`);
  assert.ok(res.citationCount >= 3, 'every section should carry a resolving citation');
  // Step-0 contract fields present
  assert.ok(res.step0.topics.every((t) => t.id && t.title && t.suggestedExercise));
});

test('zero method citations → FAIL (grounding is wired, not decorative)', () => {
  const c = clone(compliantCourse());
  for (const s of c.sections) delete s.methodPattern;
  const res = validateAuthoring(c, KB);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /ZERO method citations/.test(e)));
});

test('a citation that does not resolve in the KB → FAIL', () => {
  const c = clone(compliantCourse());
  c.sections[0].methodPattern = 'P99'; // not in the KB
  const res = validateAuthoring(c, KB);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /does not resolve/.test(e)));
});

test('missing edu-site contract field (topics) → FAIL', () => {
  const c = clone(compliantCourse());
  c.sections = c.sections.slice(0, 2); // only 2 topics → below the >=3 floor
  const res = validateAuthoring(c, KB);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /need >=3 topics/.test(e)));
});

test('KB absent → loud precondition failure (throws), never a silent pass', () => {
  assert.throws(() => validateAuthoring(compliantCourse(), join(__dirname, 'no-such-kb.md')), /ENOENT|no such file/i);
});
