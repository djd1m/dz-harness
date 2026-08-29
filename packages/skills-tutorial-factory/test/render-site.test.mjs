// render-site + verify-site — the factory's executable render seam (dogfood finding F2).
// Every test drives the REAL scripts via spawnSync(node …): the thing under test is the seam
// itself (course.json → site → driven verification), not an importable approximation of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { compliantCourse } from './_fixtures.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RENDER = join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'render-site.mjs');
const VERIFY = join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'verify-site.mjs');

const tmp = () => mkdtempSync(join(tmpdir(), 'tf-seam-'));
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf-8' });
const render = (dir, course, out = join(dir, 'site', 'index.html')) => {
  const cp = join(dir, 'course.json');
  writeFileSync(cp, JSON.stringify(course));
  return { out, res: run(RENDER, ['--course', cp, '--out', out]) };
};

test('roundtrip: gated fixture course renders and the driven verifier passes every check', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0, res.stderr);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /PASS — \d+ behavioural checks hold/);
  // the verifier must have actually driven the exercises, not skipped them
  assert.match(v.stdout, /exercise\.topic-1\.completable/);
});

test('determinism: rendering the same course twice emits byte-identical output', () => {
  const dir = tmp();
  const a = render(dir, compliantCourse(), join(dir, 'a.html'));
  const b = render(dir, compliantCourse(), join(dir, 'b.html'));
  assert.equal(a.res.status, 0);
  assert.equal(b.res.status, 0);
  assert.equal(readFileSync(a.out, 'utf-8'), readFileSync(b.out, 'utf-8'));
});

test('injection: a </script> payload in course data cannot break out of the data block', () => {
  const dir = tmp();
  const course = compliantCourse();
  course.courseDescription = 'evil </script><script>globalThis.pwned=1</script> tail';
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // exactly two script elements: the JSON data block and the runtime
  assert.equal((html.match(/<\/script>/g) || []).length, 2);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout);
});

test('shape guard: a non-course JSON dies loudly with named reasons, never a blank page', () => {
  const dir = tmp();
  const { res } = render(dir, { hello: 'world' });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /not a gated course object/);
  assert.match(res.stderr, /sections missing\/empty/);
  assert.match(res.stderr, /persona\.name missing/);
});

test('discrimination: a sabotaged site (runtime stripped) turns the verifier RED', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0);
  const html = readFileSync(out, 'utf-8');
  // remove the runtime script (the LAST <script>…</script>, after the style block)
  const sab = html.replace(/<script>[\s\S]*<\/script>\n/, '');
  const sabPath = join(dir, 'sabotaged.html');
  writeFileSync(sabPath, sab);
  const v = run(VERIFY, ['--site', sabPath]);
  assert.equal(v.status, 1, 'verifier must fail on a page without its runtime');
});

test('generalization: optional authored fields land verbatim; absent fields fall back generic', () => {
  const dir = tmp();
  // absent → generic heading, no fabricated intro note
  const plain = render(dir, compliantCourse(), join(dir, 'plain.html'));
  const plainHtml = readFileSync(plain.out, 'utf-8');
  assert.ok(plainHtml.includes('What you will learn'));
  // regression guard: the harness-cli course's hardcoded strings must never reappear in the runtime
  assert.ok(!plainHtml.includes('you can drive the harness'));
  assert.ok(!plainHtml.includes('was run against the real CLI'));
  assert.ok(!plainHtml.includes('The eight moves'));

  // authored → verbatim in the page, and the site still verifies green
  const course = compliantCourse();
  course.introNote = 'Every example here was run against version 9.9 of the tool.';
  course.introHeading = 'The six moves';
  course.outro = { pass: 'you can drive the tool.', next: 'Go explore the advanced guide.' };
  const authored = render(dir, course, join(dir, 'authored.html'));
  const html = readFileSync(authored.out, 'utf-8');
  assert.ok(html.includes('The six moves'));
  assert.ok(html.includes('version 9.9'));
  assert.ok(html.includes('you can drive the tool.'));
  const v = run(VERIFY, ['--site', authored.out]);
  assert.equal(v.status, 0, v.stdout);
});

// ---- Codex QE round-1 fixes (2026-07-30) ----

test('QE#1 published artifact completeness: npm pack includes the runtime app.src.js', () => {
  const res = spawnSync('npm', ['pack', '--dry-run', '--json'], { cwd: join(__dirname, '..'), encoding: 'utf-8' });
  assert.equal(res.status, 0, res.stderr);
  const files = JSON.parse(res.stdout)[0].files.map((f) => f.path);
  assert.ok(files.includes('package-tutorial-factory/scripts/app.src.js'), `pack omits package-tutorial-factory/scripts/app.src.js — installed render-site would ENOENT. Packed: ${files.filter((f) => f.includes('/scripts/')).join(', ')}`);
  assert.ok(files.includes('package-tutorial-factory/scripts/render-site.mjs'));
  assert.ok(files.includes('package-tutorial-factory/scripts/verify-site.mjs'));
});

test('QE#2 attribute injection: quotes in course fields cannot mint new attributes', () => {
  const dir = tmp();
  const course = compliantCourse();
  course.language = 'en" onmouseover="alert(1)';
  course.courseDescription = 'desc" onfocus="alert(2)';
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // the payload must stay INSIDE one quoted value: the tag closes right after the attribute,
  // with no raw quote terminating it early (escaped &quot; text within the value is safe)
  assert.match(html, /<html lang="[^"]*">/, 'lang attribute breakout (raw quote escaped the value)');
  assert.match(html, /<meta name="description" content="[^"]*">/, 'description attribute breakout');
});

test('QE#3 scaffold sabotage: a page stripped of its real <main> turns the verifier RED', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0);
  const html = readFileSync(out, 'utf-8');
  const sabPath = join(dir, 'no-main.html');
  writeFileSync(sabPath, html.replace('<main id="main">', '<div id="not-main">'));
  const v = run(VERIFY, ['--site', sabPath]);
  assert.equal(v.status, 1, 'verifier must fail when the emitted page lost its scaffold');
  assert.match(v.stdout, /scaffold\.emitted/);
});

test('QE#11 per-section shape guard: sections:[{}] dies with named reasons', () => {
  const dir = tmp();
  const { res } = render(dir, { courseTitle: 'x', persona: { name: 'p' }, sections: [{}], achievements: [], faqData: [] });
  assert.equal(res.status, 1);
  assert.match(res.stderr, /sections\[0\]\.id missing/);
  assert.match(res.stderr, /sections\[0\]\.theory missing/);
  assert.match(res.stderr, /sections\[0\]\.finalTest malformed/);
});

// ---- Codex QE round-2 fixes ----

test('QE-r2#9 an achievement the course promises but can never unlock turns the verifier RED', () => {
  const dir = tmp();
  const course = compliantCourse();
  course.achievements.push({ id: 'ghost', title: 'Ghost', description: 'impossible', icon: '👻', conditionRef: { type: 'section-group', ids: ['no-such-section'] } });
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 1, 'unsatisfiable promised achievement must fail verification');
  assert.match(v.stdout, /UNSATISFIABLE.*ghost/);
});

test('QE-r2#8 a shuffled course using type aliases still renders and verifies green', () => {
  const dir = tmp();
  const course = compliantCourse();
  course.sections.reverse();                                   // storage order ≠ pedagogical order
  for (const s of course.sections) {
    if (s.interactiveType === 'drag-and-drop') s.interactiveType = 'ordering';
    if (s.interactiveType === 'scenario') s.interactiveType = 'simulation';
  }
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout);
});

test('QE-r2#10 a URL as inert prose passes; a load-bearing src= fails', () => {
  const dir = tmp();
  const course = compliantCourse();
  course.courseDescription = 'Docs live at https://example.test/docs for the curious.';
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, 'inert URL text must not fail self-containment: ' + v.stdout);

  const html = readFileSync(out, 'utf-8');
  const evil = join(dir, 'with-src.html');
  writeFileSync(evil, html.replace('<div class="layout">', '<img src="https://evil.test/x.png"><div class="layout">'));
  const ve = run(VERIFY, ['--site', evil]);
  assert.equal(ve.status, 1, 'an actual external load must fail self-containment');
});

test('QE-r2#11 a section whose payload would crash the runtime dies at render, loudly', () => {
  const dir = tmp();
  const course = compliantCourse();
  delete course.sections[1].exercise;                          // flashcards section without cards
  course.sections[2].reflection = null;
  const { res } = render(dir, course);
  assert.equal(res.status, 1);
  assert.match(res.stderr, /sections\[1\]\.exercise\.cards missing/);
  assert.match(res.stderr, /sections\[2\]\.reflection missing/);
});

test('notebook device: absent everywhere is fine; present in only SOME sections is a red', () => {
  const dir = tmp();
  // all sections carry a notebook → green
  const all = compliantCourse();
  for (const s of all.sections) s.notebook = { when: `after ${s.id}`, note: `${all.persona.name} wrote down what ${s.keyConcept} really does in practice here.` };
  const a = render(dir, all, join(dir, 'all-nb.html'));
  assert.equal(a.res.status, 0);
  const va = run(VERIFY, ['--site', a.out]);
  assert.equal(va.status, 0, va.stdout);
  assert.match(va.stdout, /notebook\.topic-1\.renders/);

  // only one section carries it → device inconsistency → red
  const some = compliantCourse();
  some.sections[0].notebook = { when: 'after topic-1', note: `${some.persona.name} scribbled a long margin note about widgetone that is definitely over sixty characters.` };
  const b = render(dir, some, join(dir, 'some-nb.html'));
  assert.equal(b.res.status, 0);
  const vb = run(VERIFY, ['--site', b.out]);
  assert.equal(vb.status, 1, 'a device on only some sections must fail device-consistency');
});
