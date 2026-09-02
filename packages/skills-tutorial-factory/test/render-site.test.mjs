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
const GATE = join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'headfirst-gate.mjs');

const tmp = () => mkdtempSync(join(tmpdir(), 'tf-seam-'));
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf-8' });
const render = (dir, course, out = join(dir, 'site', 'index.html')) => {
  const cp = join(dir, 'course.json');
  writeFileSync(cp, JSON.stringify(course));
  return { out, res: run(RENDER, ['--course', cp, '--out', out, '--no-stamp']) };
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
  // exactly three script elements: course-data JSON + ui-strings JSON + the runtime.
  // A successful breakout would mint a FOURTH — the count IS the injection assertion.
  assert.equal((html.match(/<\/script>/g) || []).length, 3);
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

// ---- footer: channel links are emitted by default, overridable, and never dangerous ----

test('footer: default channel links (t.me/llm_notes + aicoding.space) are emitted and verify passes', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  assert.match(html, /<footer id="site-footer">/);
  assert.match(html, /href="https:\/\/t\.me\/llm_notes"/);
  assert.match(html, /href="https:\/\/aicoding\.space"/);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /footer\.renders/);
  // navigation anchors must NOT trip the self-contained load scan
  assert.match(v.stdout, /site\.self-contained/);
  assert.doesNotMatch(v.stdout, /external load/);
});

test('footer: course.footer.links overrides the defaults', () => {
  const dir = tmp();
  const course = { ...compliantCourse(), footer: { links: [{ label: 'My site', href: 'https://example.org' }] } };
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  assert.match(html, /href="https:\/\/example\.org"/);
  assert.doesNotMatch(html, /t\.me\/llm_notes/);
});

test('footer: a javascript:/http: link never reaches the page, and an all-invalid override fails verify loudly', () => {
  const dir = tmp();
  const course = { ...compliantCourse(), footer: { links: [{ label: 'evil', href: 'javascript:alert(1)' }, { label: 'plain', href: 'http://insecure.example' }] } };
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // курс целиком лежит инертным JSON-блоком в странице, поэтому проверяем ССЫЛКИ (href=), не весь текст
  assert.doesNotMatch(html, /href="javascript:/);
  assert.doesNotMatch(html, /href="http:\/\/insecure\.example/);
  const v = run(VERIFY, ['--site', out]);
  // всё отфильтровано → пустой футер → footer.renders обязан упасть, а не молча пройти
  assert.notEqual(v.status, 0, 'verify must fail loudly on a footer with zero valid links');
  assert.match(v.stdout, /footer\.renders/);
});

test('locale: language=ru renders Russian chrome and the verifier drives it in Russian', () => {
  const dir = tmp();
  const course = { ...compliantCourse(), language: 'ru' };
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // таблица локали вшита и содержит русские строки хрома
  assert.match(html, /<script type="application\/json" id="ui-strings">/);
  assert.match(html, /Финальный тест/);
  assert.match(html, /Проверить порядок|Проверить команду/);
  // верификатор водит сайт по ТОЙ ЖЕ таблице — все проверки держатся на русском хроме
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test('locale: language=en keeps the English chrome byte-for-byte (no ui-strings override)', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  assert.match(html, /<script type="application\/json" id="ui-strings">null<\/script>/);
  assert.doesNotMatch(html, /Финальный тест/);
});

test('probe honesty: a theory whose opening carries a markdown link still verifies (url innards are not visible text)', () => {
  const dir = tmp();
  const course = compliantCourse();
  // ссылка в самом начале теории: её URL даёт слова https/npmjs/package, которых в видимом
  // тексте нет — зонд обязан брать слова из ВИДИМОГО текста, иначе валит корректный рендер
  course.sections[0].theory = `Курс про [@scope/pkg](https://www.npmjs.com/package/@scope/pkg) — ` + course.sections[0].theory;
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // ссылка теории рисуется РАНТАЙМОМ (в статическом HTML лежат только данные + скрипт),
  // поэтому проверяем: (1) разметка доехала в блок данных, (2) верификатор, который РЕАЛЬНО
  // исполняет страницу, видит секцию отрендеренной — это и есть регрессия, которую ловим
  assert.match(html, /npmjs\.com/);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /section\..*\.renders/);
});

test('probe honesty: an inflected Russian concept word still counts as encoded (gate and verifier judge alike)', () => {
  const dir = tmp();
  const course = compliantCourse();
  const s = course.sections[0];
  // «одиннадцать шагов» в понятии, «одиннадцати шагов» в тексте — русский падеж; собственная
  // подстрочная проверка верификатора этого не видела и валила корректный рендер
  s.keyConcept = 'одиннадцать шагов конвейера';
  s.theory = `Конвейер состоит из одиннадцати шагов, и ${course.persona.name} держит их список перед глазами. ` + s.theory;
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test('feedback: course.feedback renders a prefilled new-issue link naming the right package', () => {
  const dir = tmp();
  const course = { ...compliantCourse(), language: 'ru', feedback: { repo: 'djd1m/dz-harness', packagePath: 'packages/harness-cli' } };
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  assert.match(html, /Что-то работает не так\?/);
  assert.match(html, /href="https:\/\/github\.com\/djd1m\/dz-harness\/issues\/new\?title=/);
  // заголовок issue несёт ИМЯ ПАКЕТА — иначе отчёт уедет не в тот адрес
  assert.match(html, /title=%5Bharness-cli%5D/);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test('feedback: a malformed or absent feedback block yields NO link rather than a broken one', () => {
  const dir = tmp();
  for (const fb of [undefined, { repo: 'not a repo', packagePath: 'packages/x' }, { repo: 'a/b' }]) {
    const course = { ...compliantCourse(), feedback: fb };
    const { out, res } = render(tmp(), course);
    assert.equal(res.status, 0, res.stderr);
    assert.doesNotMatch(readFileSync(out, 'utf-8'), /issues\/new/);
  }
  void dir;
});

test('docs: the same feedback block also yields a README link on the public mirror', () => {
  const dir = tmp();
  const course = { ...compliantCourse(), language: 'ru', feedback: { repo: 'djd1m/dz-harness', packagePath: 'packages/harness-cli' } };
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  assert.match(html, /Полная документация пакета/);
  assert.match(html, /href="https:\/\/github\.com\/djd1m\/dz-harness\/blob\/main\/packages\/harness-cli\/README\.md"/);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

// ---- diagrams: optional by design, strict once declared, and injection-proof by construction ----

const withDiagram = (course, sectionIndex = 0) => {
  const c = JSON.parse(JSON.stringify(course));
  c.sections[sectionIndex].diagram = {
    kind: 'flow',
    title: 'Три шага',
    cycle: true,
    nodes: [
      { id: 'one', label: 'Первый', note: 'что происходит сначала' },
      { id: 'two', label: 'Второй', note: 'что потом' },
      { id: 'three', label: 'Третий' },
    ],
  };
  return c;
};

test('diagram: a declared flow is drawn with every label, note and caption', () => {
  const dir = tmp();
  const { out, res } = render(dir, withDiagram(compliantCourse()));
  assert.equal(res.status, 0, res.stderr);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /diagram\.renders/);
  assert.match(v.stdout, /1 diagram\(s\) drawn/);
});

test('diagram: a course without diagrams stays green — the feature is optional, never required', () => {
  const dir = tmp();
  const { out, res } = render(dir, compliantCourse());
  assert.equal(res.status, 0, res.stderr);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
  assert.match(v.stdout, /nothing to draw/);
});

// THE discriminating test for the security property: markup in a label must reach the page as
// LETTERS. Cross-model review measured a hand-written SVG pulling the network through <image href>
// while the verifier stayed green; the answer was to remove author markup entirely. This test goes
// red the day someone swaps the text insertion back for an HTML one.
test('diagram: markup inside a label is rendered as text, never as an element', () => {
  const dir = tmp();
  const course = withDiagram(compliantCourse());
  course.sections[0].diagram.nodes[0].label = '<i id="inj">x</i>';
  const { out, res } = render(dir, course);
  assert.equal(res.status, 0, res.stderr);
  const html = readFileSync(out, 'utf-8');
  // the string exists in the inert data block, but never as a live element in the page shell
  assert.doesNotMatch(html.replace(/<script type="application\/json"[\s\S]*?<\/script>/, ''), /<i id="inj">/);
  const v = run(VERIFY, ['--site', out]);
  assert.equal(v.status, 0, v.stdout + v.stderr);
});

test('diagram gate: an unknown key is REFUSED rather than silently ignored', () => {
  const dir = tmp();
  const course = withDiagram(compliantCourse());
  course.sections[0].diagram.edges = [['one', 'two']]; // not part of the declared shape
  const cp = join(dir, 'course.json');
  writeFileSync(cp, JSON.stringify(course));
  const g = run(GATE, ['--course', cp]);
  assert.notEqual(g.status, 0, 'an unknown diagram key must fail the gate');
  assert.match(g.stdout, /diagram-shape/);
});

test('diagram gate: one node, a bad id or an over-long label are each refused', () => {
  const dir = tmp();
  for (const mutate of [
    (d) => { d.nodes = [d.nodes[0]]; },
    (d) => { d.nodes[1].id = 'Not Kebab'; },
    (d) => { d.nodes[1].label = 'x'.repeat(25); },
    (d) => { d.kind = 'mindmap'; },
  ]) {
    const course = withDiagram(compliantCourse());
    mutate(course.sections[0].diagram);
    const cp = join(tmp(), 'course.json');
    writeFileSync(cp, JSON.stringify(course));
    const g = run(GATE, ['--course', cp]);
    assert.notEqual(g.status, 0, `gate must refuse: ${JSON.stringify(course.sections[0].diagram).slice(0, 80)}`);
  }
  void dir;
});
