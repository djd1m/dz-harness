// ADR-002 Confirmation — default doc-harvest produces a usable brief WITHOUT understand-anything;
// a doc-thin fixture trips the min-topics floor and signals escalation. Run:
//   node --test test/extract-brief.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTRACT = join(__dirname, '..', 'package-tutorial-factory', 'scripts', 'extract-brief.mjs');
const REPO = resolve(__dirname, '..', '..', '..', '..'); // repo root
const BOOK_DIGITIZER = join(REPO, 'packages', '@dzhechkov', 'skills-book-digitizer');

function run(pkgDir, extra = []) {
  const dir = mkdtempSync(join(tmpdir(), 'brief-'));
  const jf = join(dir, 'brief.json');
  const r = spawnSync(process.execPath, [EXTRACT, '--pkg', pkgDir, '--json', jf, ...extra], { encoding: 'utf-8' });
  let brief = null;
  try { brief = JSON.parse(readFileSync(jf, 'utf-8')); } catch { /* */ }
  rmSync(dir, { recursive: true, force: true });
  return { code: r.status, stdout: r.stdout, brief };
}

test('doc-rich pack (skills-book-digitizer) → >=3 topics, source provenance, NO escalation', () => {
  const { code, brief, stdout } = run(BOOK_DIGITIZER);
  assert.equal(code, 0, 'doc-rich pack must not escalate (exit 0)');
  assert.ok(brief, 'brief JSON must be written');
  assert.equal(brief.generatedFrom, 'doc-harvest');
  assert.equal(brief.escalate, null, 'no escalation for a doc-rich pack');
  assert.ok(brief.topics.length >= 3, `expected >=3 topics, got ${brief.topics.length}`);
  for (const t of brief.topics) {
    assert.ok(Array.isArray(t.keyConcepts) && t.keyConcepts.length >= 1, `topic ${t.id} needs keyConcepts`);
    assert.ok(typeof t.source === 'string' && t.source.length > 0, `topic ${t.id} needs a source provenance pointer`);
  }
  // understand-anything was NOT invoked: the extractor is pure fs, no KG artifact is written.
  assert.ok(!/understand-anything/i.test(stdout) || /no escalation/i.test(stdout),
    'doc-harvest must not invoke understand-anything for a doc-rich pack');
});

test('doc-thin pack (source files, empty README) → trips floor, escalate: understand-anything', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'thin-'));
  writeFileSync(join(pkg, 'README.md'), ''); // empty README
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'thin-pkg', main: 'src/index.js' }));
  mkdirSync(join(pkg, 'src'));
  // several real source files, NO SKILL.md, NO real docs
  for (let i = 0; i < 8; i++) writeFileSync(join(pkg, 'src', `mod${i}.js`), `export function f${i}(){ return ${i}; }\n`);
  const { code, brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.equal(brief.escalate, 'understand-anything', `expected understand-anything escalation, got ${brief && brief.escalate}`);
  assert.ok(brief.topics.length < brief.minTopics, 'thin pack must fall below the floor rather than emit a full course');
  assert.equal(code, 3, 'escalation uses the distinct exit code 3 so a caller can branch');
});

test('non-finite --min-topics clamps (Infinity-recidivism)', () => {
  const { code } = run(BOOK_DIGITIZER, ['--min-topics', 'Infinity']);
  // Infinity floor would force escalation on everything; a clamp keeps the doc-rich pack usable.
  assert.equal(code, 0, 'Infinity min-topics must clamp to the default, not escalate everything');
});

// ---- F1 (backlog 48efd82c): the 2-topic ceiling for no-SKILL.md packs ----

const section = (title, sentences = 3) =>
  `## ${title}\n\n` + Array.from({ length: sentences }, (_, i) =>
    `The ${title.toLowerCase()} step number ${i} explains how this part of the tool behaves in practice and why it matters for real users.`).join(' ') + '\n\n';

function docRichNoSkillPkg(nSections, { boilerplate = true } = {}) {
  const pkg = mkdtempSync(join(tmpdir(), 'rich-'));
  let md = `# rich-cli\n\nA command-line tool with a thorough README and zero SKILL.md files.\n\n`;
  for (let i = 1; i <= nSections; i++) md += section(`Feature ${i}`);
  if (boilerplate) md += `## License\n\nMIT — this legal boilerplate is long enough to pass any length floor if it were wrongly counted as teachable: ${'x'.repeat(400)}\n\n## Changelog\n\n- 1.0.0 initial ${'y'.repeat(400)}\n`;
  writeFileSync(join(pkg, 'README.md'), md);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'rich-cli', bin: { rich: 'bin.js' } }));
  return pkg;
}

test('F1 discrimination: a doc-rich NO-SKILL.md pack harvests one topic per section and does NOT escalate', () => {
  const pkg = docRichNoSkillPkg(6);
  const { code, brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.equal(code, 0, `must not escalate: ${brief && brief.escalate}`);
  assert.equal(brief.escalate, null);
  const sections = brief.topics.filter((t) => t.kind === 'readme-section');
  assert.equal(sections.length, 6, `one topic per substantive ## section, got ${sections.length}`);
  // overview + 6 sections + api = 8 — the OLD ceiling was 2 for exactly this shape
  assert.ok(brief.topics.length >= 8, `expected >=8 topics, got ${brief.topics.length}`);
  for (const t of sections) assert.ok(t.dependsOn.length === 1, 'sections depend on the overview');
});

test('F1 boilerplate: License/Changelog sections are neither topics nor doc volume', () => {
  const withBp = docRichNoSkillPkg(4, { boilerplate: true });
  const noBp = docRichNoSkillPkg(4, { boilerplate: false });
  const a = run(withBp).brief; const b = run(noBp).brief;
  rmSync(withBp, { recursive: true, force: true }); rmSync(noBp, { recursive: true, force: true });
  const titles = a.topics.map((t) => t.title.toLowerCase());
  assert.ok(!titles.some((t) => /license|changelog/.test(t)), 'boilerplate must not become a topic');
  assert.equal(a.counts.readmeSections, 4);
  // volume exclusion asserted, not just named: adding 800+ chars of boilerplate changes NOTHING
  assert.equal(a.counts.docChars, b.counts.docChars, 'boilerplate chars must not count toward doc volume');
});

test('F1 exact-match stoplist: "License Management" is a real feature, not boilerplate', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'lm-'));
  writeFileSync(join(pkg, 'README.md'), `# lm\n\n${section('License Management')}${section('Feature A')}${section('Feature B')}`);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'lm' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.ok(brief.topics.some((t) => t.title === 'License Management'), 'prefix-matching would wrongly discard this');
});

test('F1 fence-aware: "## " lines inside code fences never become topics or pollute keyConcepts', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'fence-'));
  const md = `# f\n\n${section('Real Section')}\n\`\`\`markdown\n## Fake Section In Example\n### Fake Sub\n${'filler content long enough to clear any per-section floor. '.repeat(10)}\n\`\`\`\n\n${section('Another Real')}`;
  writeFileSync(join(pkg, 'README.md'), md);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'f' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  const titles = brief.topics.map((t) => t.title);
  assert.ok(!titles.includes('Fake Section In Example'), `fence content leaked into topics: ${titles.join(' | ')}`);
  assert.ok(!brief.topics.some((t) => t.keyConcepts.includes('Fake Sub')), 'fenced ### leaked into keyConcepts');
});

test('F1 volume floor discriminates ALONE: enough content topics but thin total volume still escalates', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'vol-'));
  // 3 sections each just over the 300-char section floor (content topics = 3 = min-topics),
  // total ~1000 chars < the 1500 doc floor → ONLY the volume condition can trigger here
  const s = (t) => `## ${t}\n\n${'Real prose about the topic that matters to a learner here. '.repeat(6)}\n\n`;
  writeFileSync(join(pkg, 'README.md'), `# v\n\n${s('One')}${s('Two')}${s('Three')}`);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'v', main: 'src/i.js' }));
  mkdirSync(join(pkg, 'src'));
  for (let i = 0; i < 8; i++) writeFileSync(join(pkg, 'src', `m${i}.js`), `export const v${i} = ${i};\n`);
  const { code, brief } = run(pkg, ['--doc-floor', '2000']);
  rmSync(pkg, { recursive: true, force: true });
  assert.ok(brief.counts.contentTopics >= brief.minTopics, `precondition: topic floor satisfied (${brief.counts.contentTopics})`);
  assert.equal(code, 3);
  assert.equal(brief.escalate, 'understand-anything', 'volume alone must decide');
});

test('F1 backstop counts content topics only: one fat section + overview + api still escalates', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'one-'));
  writeFileSync(join(pkg, 'README.md'), `# one\n\n## Only Section\n\n${'A very long single section of real teachable prose repeated many times over. '.repeat(30)}\n`);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'one', bin: { one: 'bin.js' } }));
  const { code, brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.equal(brief.counts.contentTopics, 1);
  assert.equal(code, 3, 'scaffolding (overview+api) must not vault the topic floor');
  assert.equal(brief.escalate, 'insufficient-surface');
});

test('F1 un-truncation: 10+ section headings all survive into the overview curriculum (old slice(0,8))', () => {
  const pkg = docRichNoSkillPkg(11);
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  const overview = brief.topics.find((t) => t.kind === 'overview');
  assert.equal(overview.keyConcepts.length, 11, `all 11 headings must survive, got ${overview.keyConcepts.length}`);
});

test('F1 thin sections below the section floor yield no content topics → escalation (both floors agree)', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'thin2-'));
  // 5 sections, each ABOVE the per-section floor is required to count; keep them below it
  let md = `# thin-cli\n\n`;
  for (let i = 1; i <= 5; i++) md += `## Part ${i}\n\nToo short.\n\n`;
  writeFileSync(join(pkg, 'README.md'), md);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'thin-cli', main: 'src/i.js' }));
  mkdirSync(join(pkg, 'src'));
  for (let i = 0; i < 8; i++) writeFileSync(join(pkg, 'src', `m${i}.js`), `export const v${i} = ${i};\n`);
  const { code, brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.equal(code, 3);
  assert.equal(brief.escalate, 'understand-anything', 'thin docs + real source → code-deep escalation');
});

test('F1-r2 fence mixing: ~~~ inside a backtick fence is content; real sections after it survive', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'mix-'));
  const md = `# m\n\n${section('Before')}\`\`\`text\n~~~\n## Fake Inside Backticks\n${'padding content of a realistic length for the example block here. '.repeat(8)}\n\`\`\`\n\n${section('After')}`;
  writeFileSync(join(pkg, 'README.md'), md);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'm' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  const titles = brief.topics.map((t) => t.title);
  assert.ok(!titles.includes('Fake Inside Backticks'), `~~~ falsely closed the fence: ${titles.join(' | ')}`);
  assert.ok(titles.includes('After'), 'the real section after the fence must survive');
});

test('F1-r2 unclosed fence: fenced ### cannot pollute keyConcepts even without a closing delimiter', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'open-'));
  const md = `# o\n\n## Real One\n\n${'Actual prose about the real topic, long enough for the floor. '.repeat(7)}\n\`\`\`markdown\n### Fenced Sub Never Closed\n${'code sample line here. '.repeat(20)}\n`;
  writeFileSync(join(pkg, 'README.md'), md);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'o' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.ok(!brief.topics.some((t) => t.keyConcepts.includes('Fenced Sub Never Closed')),
    'an unclosed fence must strip to EOF for keyConcepts exactly as it does for sections');
});

test('F1-r2 punctuated boilerplate: "Code-of-Conduct" still normalizes onto the stoplist', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'coc-'));
  writeFileSync(join(pkg, 'README.md'), `# c\n\n${section('Feature A')}${section('Feature B')}${section('Feature C')}## Code-of-Conduct\n\n${'Behavioral legal boilerplate text repeated to clear the section floor easily. '.repeat(6)}\n`);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'c' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  assert.ok(!brief.topics.some((t) => /code-of-conduct/i.test(t.title)), 'hyphenated boilerplate must be excluded');
});

test('F1 duplicate headings get distinct topic ids', () => {
  const pkg = mkdtempSync(join(tmpdir(), 'dup-'));
  writeFileSync(join(pkg, 'README.md'), `# dup\n\nintro text long enough to matter for the overview condition here.\n\n${section('Usage')}${section('Usage')}${section('Usage')}`);
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'dup' }));
  const { brief } = run(pkg);
  rmSync(pkg, { recursive: true, force: true });
  const ids = brief.topics.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, `topic ids must be unique: ${ids.join(', ')}`);
});
