import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { builtinModules } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';

import {
  countSourceLines,
  extractPackageEvidence,
  noFollowReadFlags,
  PACKAGE_JSON_BYTE_LIMIT,
  readDescriptorBounded,
  SOURCE_AGGREGATE_BYTE_LIMIT,
  SOURCE_BYTE_LIMIT,
} from '../package-story-page/scripts/extract-package-evidence.mjs';
import { buildBlindPrompt, frontmatterDescription, parseClaudeEnvelope, parseRouting, scoreRouting } from '../package-story-page/evals/run-pair-routing.mjs';
import { CHROME_COPY, renderStoryPage, validateChromeCopyParity } from '../package-story-page/scripts/render-story-page.mjs';
import { canonicalJsonText, escapeHtml, sha256Text, validateBrief, validateEvidence } from '../package-story-page/scripts/story-schema.mjs';
import { SEMANTIC_CHECK_IDS, verifyStorySemantics } from '../package-story-page/scripts/verify-story-semantics.mjs';
import * as browserVerifier from '../package-story-page/scripts/verify-story-page-browser.mjs';
import {
  BRIEF_BYTE_LIMIT,
  CSS_BLOCK_LIMIT,
  CSS_NESTING_LIMIT,
  EVIDENCE_BYTE_LIMIT,
  EXPECTED_SEMANTIC_CHECK_IDS,
  PAGE_BYTE_LIMIT,
  PARSER_BUNDLE_BYTE_LIMIT,
  PREIMPORT_MODULE_BYTE_LIMIT,
  PROVENANCE_FILE_BYTE_LIMIT,
  SEMANTIC_PROJECTION_SHA256,
  STRUCTURED_DEPTH_LIMIT,
  classifyStaticModuleParserRun,
  evaluateStoryCssPolicies,
  moduleRequestSpecifiers,
  parserChildEnvironment,
  parseStaticModuleSpecifiers,
  parseBudgetedJson,
  safeJsonBudget,
  scanExecutableCapabilities,
  scanSemanticImportGraph,
  verifyStoryPage,
} from '../package-story-page/scripts/verify-story-page.mjs';

const { verifyBrowserLayout } = browserVerifier;

const root = fileURLToPath(new URL('..', import.meta.url));
const scripts = join(root, 'package-story-page', 'scripts');
const PREIMPORT_PATHS = [
  'scripts/verify-story-semantics.mjs',
  'vendor/parse5.bundle.mjs',
  'scripts/extract-package-evidence.mjs',
  'scripts/render-story-page.mjs',
  'scripts/story-schema.mjs',
];

function authorizePreImportProjection(wrapperSource, projectionRoot) {
  let authorized = wrapperSource;
  for (const path of PREIMPORT_PATHS) {
    const digest = createHash('sha256').update(readFileSync(join(projectionRoot, path))).digest('hex');
    const marker = `'${path}': '`;
    const at = authorized.indexOf(marker);
    assert.notEqual(at, -1, `pre-import hash marker missing: ${path}`);
    const digestAt = at + marker.length;
    assert.match(authorized.slice(digestAt, digestAt + 64), /^[a-f0-9]{64}$/, `pre-import hash malformed: ${path}`);
    authorized = `${authorized.slice(0, digestAt)}${digest}${authorized.slice(digestAt + 64)}`;
  }
  return authorized;
}

const tempDirectories = [];

function temp(label) {
  const dir = mkdtempSync(join(tmpdir(), `${label}-`));
  tempDirectories.push(dir);
  return dir;
}

function cleanupTempDirectories() {
  for (const dir of tempDirectories) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Keep cleaning: one stubborn fixture must not strand every directory created after it.
    }
  }
}

// Later this suite asserts that a sibling script calls rmSync; follow the cleanup discipline it polices.
after(cleanupTempDirectories);
process.on('exit', cleanupTempDirectories);
for (const signal of ['SIGINT', 'SIGTERM']) {
  const handler = () => {
    cleanupTempDirectories();
    try {
      process.removeListener(signal, handler);
      process.kill(process.pid, signal);
    } catch {
      // A cleanup or re-raise failure must never escape from a signal handler.
    }
  };
  process.on(signal, handler);
}

function fixturePackage() {
  const dir = temp('story-package');
  mkdirSync(join(dir, 'test'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@fixture/health-note',
    version: '1.2.3',
    description: 'Turns a synthetic health diary into a question list for a clinician.',
    scripts: { check: 'node check.mjs' },
  }, null, 2));
  writeFileSync(join(dir, 'README.md'), [
    '# Health note',
    '',
    'Use synthetic diary rows and inspect the Markdown result.',
    '',
    '```json',
    '{"sleepHours":6,"symptoms":["fatigue"]}',
    '```',
    '',
    '```bash',
    'npx health-note diary.json --format md',
    '```',
    '',
  ].join('\n'));
  writeFileSync(join(dir, 'test', 'contract.test.mjs'), 'export const output = "questions.md";\n');
  return dir;
}

function brief(evidence) {
  const packageSource = evidence.sources.find((source) => source.path === 'package.json').id;
  const readmeSource = evidence.sources.find((source) => source.path === 'README.md').id;
  return {
    schema: 'package-story-brief/1',
    language: 'ru',
    package: { name: evidence.package.name, version: evidence.package.version },
    audience: 'Человек, который хочет подготовиться к разговору с врачом',
    sources: evidence.sources.map(({ id, path, lines, sha256 }) => ({ id, path, sha256, lineRange: [1, Math.min(40, Math.max(1, lines))] })),
    claims: [
      { id: 'purpose', text: evidence.package.description, status: 'evidenced', sourceIds: [packageSource] },
      {
        id: 'version', text: `Версия ${evidence.package.version}`, status: 'evidenced', sourceIds: [packageSource],
        numericEvidence: [{ token: evidence.package.version, context: 'version', sourceId: packageSource }],
      },
    ],
    hero: { eyebrow: 'Пакет в действии', title: 'Из дневника — в вопросы, а не в диагноз', subtitle: 'Посмотрите на результат до объяснений.', cta: 'Показать пример' },
    example: {
      title: 'Один синтетический дневник',
      input: '{"sleepHours":6,"symptoms":["fatigue"]}',
      process: ['Проверить структуру', 'Отделить факты от предположений', 'Собрать Markdown-артефакт'],
      output: { format: 'Markdown', preview: '# Вопросы врачу\n- Что уточнить о продолжительности усталости?\n- Какие наблюдения взять на приём?' },
      sourceIds: [readmeSource],
      synthetic: true,
    },
    why: { title: 'Не ставит диагноз — готовит разговор', body: 'Пакет превращает записи в проверяемый артефакт и оставляет медицинское решение врачу.', sourceIds: [packageSource] },
    mechanism: [
      { id: 'input', label: 'Вход', explanation: 'Читает локальный дневник.', guardrail: 'Только синтетические данные в демонстрации.', sourceIds: [readmeSource] },
      { id: 'structure', label: 'Структура', explanation: 'Проверяет форму записей.', guardrail: 'Не додумывает пропущенные факты.', sourceIds: [readmeSource] },
      { id: 'artifact', label: 'Артефакт', explanation: 'Формирует список вопросов.', guardrail: 'Не диагностирует и не назначает лечение.', sourceIds: [packageSource] },
    ],
    install: [{ label: 'Запуск из npm', command: 'npx health-note diary.json --format md', sourceIds: [readmeSource] }],
    reuse: [
      { host: 'Codex', status: 'unknown', note: 'Поддержка хоста не подтверждена этим fixture.', sourceIds: [] },
      { host: 'Локальный CLI', status: 'evidenced', note: 'README показывает npx-команду.', sourceIds: [readmeSource] },
    ],
    limits: [
      { category: 'safety', title: 'Не медицинское устройство', text: 'Результат не заменяет врача.', status: 'evidenced', sourceIds: [packageSource] },
      { category: 'cost', title: 'Цена неизвестна', text: 'В fixture нет подтверждённой цены.', status: 'unknown', sourceIds: [] },
      { category: 'freshness', title: 'Без внешних фактов', text: 'Страница не утверждает актуальность сторонних данных.', status: 'unknown', sourceIds: [] },
    ],
    visuals: {
      example: { kind: 'artifact', direction: 'Показать вход рядом с проверяемым Markdown-результатом.' },
      why: { kind: 'comparison', direction: 'Сопоставить сырые записи и подготовленные вопросы.' },
      mechanism: { kind: 'flow', direction: 'Показать путь от дневника к артефакту.' },
      install: { kind: 'decision-card', direction: 'Отделить команду запуска от пояснения.' },
      reuse: { kind: 'comparison', direction: 'Развести подтверждённые и неизвестные хосты.' },
      limits: { kind: 'decision-card', direction: 'Показать каждую границу отдельной карточкой.' },
    },
    cta: { title: 'Попробуйте на синтетическом файле', body: 'Сначала проверьте артефакт, затем решайте, подходит ли пакет.', label: 'К установке' },
  };
}

function fixtureStory() {
  const packageRoot = fixturePackage();
  const evidence = extractPackageEvidence(packageRoot);
  return { packageRoot, evidence, story: brief(evidence) };
}

function externalSource(fixture, id, url) {
  const checkedAt = '2026-08-21';
  const receiptPath = `evidence/${id}.md`;
  const body = `Source URL: ${url}\nChecked at: ${checkedAt}\nVendor documentation describes an optional mode.\n`;
  mkdirSync(join(fixture.packageRoot, 'evidence'), { recursive: true });
  writeFileSync(join(fixture.packageRoot, receiptPath), body);
  return {
    id, url, checkedAt, receiptPath,
    sha256: sha256Text(body), lines: countSourceLines(body), lineRange: [1, countSourceLines(body)],
  };
}

function fixtureFieldRows(story) {
  return [
    ['hero.eyebrow', story.hero.eyebrow], ['hero.title', story.hero.title],
    ['hero.subtitle', story.hero.subtitle], ['hero.cta', story.hero.cta],
    ['claims.purpose.text', story.claims[0].text], ['claims.version.text', story.claims[1].text],
    ['example.title', story.example.title], ['example.input', story.example.input],
    ['example.process.0', story.example.process[0]], ['example.process.1', story.example.process[1]],
    ['example.process.2', story.example.process[2]], ['example.output.format', story.example.output.format],
    ['example.output.preview', story.example.output.preview], ['why.title', story.why.title], ['why.body', story.why.body],
    ['mechanism.input.label', story.mechanism[0].label], ['mechanism.input.explanation', story.mechanism[0].explanation],
    ['mechanism.input.guardrail', story.mechanism[0].guardrail], ['mechanism.structure.label', story.mechanism[1].label],
    ['mechanism.structure.explanation', story.mechanism[1].explanation], ['mechanism.structure.guardrail', story.mechanism[1].guardrail],
    ['mechanism.artifact.label', story.mechanism[2].label], ['mechanism.artifact.explanation', story.mechanism[2].explanation],
    ['mechanism.artifact.guardrail', story.mechanism[2].guardrail], ['install.0.label', story.install[0].label],
    ['install.0.command', story.install[0].command], ['reuse.0.host', story.reuse[0].host],
    ['reuse.0.note', story.reuse[0].note], ['reuse.1.host', story.reuse[1].host], ['reuse.1.note', story.reuse[1].note],
    ['limits.0.title', story.limits[0].title], ['limits.0.text', story.limits[0].text],
    ['limits.1.title', story.limits[1].title], ['limits.1.text', story.limits[1].text],
    ['limits.2.title', story.limits[2].title], ['limits.2.text', story.limits[2].text],
    ['cta.title', story.cta.title], ['cta.body', story.cta.body], ['cta.label', story.cta.label],
  ];
}

function expectedFieldPathOrder(story) {
  return [
    ...(typeof story.hero.eyebrow === 'string' && story.hero.eyebrow !== '' ? ['hero.eyebrow'] : []),
    'hero.title', 'hero.subtitle', 'hero.cta',
    ...story.claims.map((item) => `claims.${item.id}.text`),
    'example.title', 'example.input',
    ...story.example.process.map((_, index) => `example.process.${index}`),
    'example.output.format', 'example.output.preview', 'why.title', 'why.body',
    ...story.mechanism.flatMap((item) => [
      `mechanism.${item.id}.label`, `mechanism.${item.id}.explanation`, `mechanism.${item.id}.guardrail`,
    ]),
    ...story.install.flatMap((_, index) => [`install.${index}.label`, `install.${index}.command`]),
    ...story.reuse.flatMap((_, index) => [`reuse.${index}.host`, `reuse.${index}.note`]),
    ...story.limits.flatMap((_, index) => [`limits.${index}.title`, `limits.${index}.text`]),
    'cta.title', 'cta.body', 'cta.label',
  ];
}

const AUTHORED_FIELD_KINDS = [
  'hero.eyebrow', 'hero.title', 'hero.subtitle', 'hero.cta', 'claim.text',
  'example.title', 'example.input', 'example.process', 'example.output.format', 'example.output.preview',
  'why.title', 'why.body', 'mechanism.label', 'mechanism.explanation', 'mechanism.guardrail',
  'install.label', 'install.command', 'reuse.host', 'reuse.note', 'limitation.title', 'limitation.text',
  'cta.title', 'cta.body', 'cta.label',
];

function authoredFieldKind(path) {
  if (/^claims\.[^.]+\.text$/.test(path)) return 'claim.text';
  if (/^example\.process\.\d+$/.test(path)) return 'example.process';
  if (/^mechanism\.[^.]+\.(label|explanation|guardrail)$/.test(path)) return `mechanism.${path.split('.').at(-1)}`;
  if (/^install\.\d+\.(label|command)$/.test(path)) return `install.${path.split('.').at(-1)}`;
  if (/^reuse\.\d+\.(host|note)$/.test(path)) return `reuse.${path.split('.').at(-1)}`;
  if (/^limits\.\d+\.(title|text)$/.test(path)) return `limitation.${path.split('.').at(-1)}`;
  return path;
}

function expectedBrowserSemantics(story) {
  const copy = story.language === 'en'
    ? { show: 'View example', input: 'Input', synthetic: 'synthetic data', result: 'Result', mechanism: 'From input to artifact', install: 'Run it locally', reuse: 'Where to reuse it', limits: 'Safety, cost, and freshness', sources: 'Sources and evidence' }
    : { show: 'Смотреть пример', input: 'Вход', synthetic: 'синтетические данные', result: 'Результат', mechanism: 'Путь от входа к артефакту', install: 'Запустить у себя', reuse: 'Где переиспользовать', limits: 'Безопасность, цена, свежесть', sources: 'Источники и доказательства' };
  const headings = [
    ['H1', story.hero.title], ['H2', story.example.title],
    ['H3', `${copy.input} · ${copy.synthetic}`], ['H3', `${copy.result} · ${story.example.output.format} · ${copy.synthetic}`],
    ['H2', story.why.title], ['H2', copy.mechanism], ['H2', copy.install], ['H2', copy.reuse],
    ...story.reuse.map((item) => ['H3', item.host]), ['H2', copy.limits],
    ...story.limits.map((item) => ['H3', item.title]), ['H2', story.cta.title],
  ].map(([tag, text]) => ({ tag, text }));
  const focusTargets = [
    { tag: 'A', key: null, text: copy.show, href: '#example' },
    { tag: 'A', key: null, text: story.hero.cta, href: '#example' },
    ...story.mechanism.map((item, index) => ({ tag: 'SUMMARY', key: item.id, text: `${String(index + 1).padStart(2, '0')}${item.label}`, href: null })),
    { tag: 'SUMMARY', key: 'sources', text: copy.sources, href: null },
    ...story.sources.filter((source) => source.url).map((source) => ({
      tag: 'A', key: null,
      text: `${source.url} · ${story.language === 'en' ? 'checked' : 'проверено'} ${source.checkedAt} · ${source.receiptPath}:L${source.lineRange[0]}-L${source.lineRange[1]}`,
      href: source.url,
    })),
    { tag: 'A', key: null, text: story.cta.label, href: '#install' },
  ];
  return { headings, focusTargets };
}

function addLocalSource(fixture, { id, path, body, lineRange }) {
  const absolute = join(fixture.packageRoot, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, body);
  const recorded = { id, path, sha256: sha256Text(body), lines: countSourceLines(body) };
  const source = { id, path, sha256: recorded.sha256, lineRange };
  fixture.evidence.sources.push(recorded);
  fixture.evidence.truncation.sourceFiles.found += 1;
  fixture.evidence.truncation.sourceFiles.included += 1;
  fixture.story.sources.push(source);
  return source;
}

const verify = ({ packageRoot, evidence, story }, html = renderStoryPage(story)) =>
  verifyStoryPage(story, html, { evidence, packageRoot });

function assertCheck(result, id, expected = false) {
  const failures = result.failures ?? result.checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`);
  assert.equal(result.checks.find((check) => check.id === id)?.pass, expected, `${id}\n${failures.join('\n')}`);
}

function mutateStoryItem(html, itemId, mutate) {
  const marker = `data-story-item-id="${itemId}"`;
  const markerAt = html.indexOf(marker);
  assert.notEqual(markerAt, -1, `missing rendered item ${itemId}`);
  const start = html.lastIndexOf('<', markerAt);
  const tag = /^<([a-z][a-z0-9-]*)\b/i.exec(html.slice(start))?.[1];
  assert.ok(tag, `cannot resolve tag for ${itemId}`);
  const close = `</${tag}>`;
  const end = html.indexOf(close, markerAt);
  assert.notEqual(end, -1, `missing closing ${tag} for ${itemId}`);
  const after = end + close.length;
  return `${html.slice(0, start)}${mutate(html.slice(start, after))}${html.slice(after)}`;
}

function replaceAuthoredValues(markup, left, right) {
  assert.equal(left.length, right.length);
  let result = markup;
  for (let index = 0; index < left.length; index += 1) {
    const token = `__PACKAGE_STORY_SWAP_${index}__`;
    result = result
      .replace(escapeHtml(left[index]), token)
      .replace(escapeHtml(right[index]), escapeHtml(left[index]))
      .replace(token, escapeHtml(right[index]));
  }
  return result;
}

function swapItemCopy(html, leftId, rightId, left, right) {
  let result = mutateStoryItem(html, leftId, (markup) => replaceAuthoredValues(markup, left, right));
  result = mutateStoryItem(result, rightId, (markup) => replaceAuthoredValues(markup, right, left));
  return result;
}

test('skill discovery contract separates a short story page from a tutorial course', () => {
  const skill = readFileSync(join(root, 'package-story-page', 'SKILL.md'), 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(skill)?.[1] ?? '';
  assert.match(frontmatter, /short, evidence-backed, examples-first story page/i);
  assert.match(frontmatter, /landing, visual explanation, or demo page rather than a full tutorial course/i);
  assert.match(skill, /Use `package-tutorial-factory` instead when the user wants a full course, exercises, achievements,\s*or a final test\./);
});

test('routing eval is bilingual and puts full courses on the tutorial-factory sibling', () => {
  const routing = readFileSync(join(root, 'package-story-page', 'evals', 'routing.yaml'), 'utf8');
  assert.match(routing, /^skill: package-story-page$/m);
  const positives = [...routing.matchAll(/^  - "(.*)"$/gm)].map((match) => match[1]);
  const negatives = [...routing.matchAll(/^  - prompt: "(.*)"$/gm)].map((match) => match[1]);
  const owners = [...routing.matchAll(/^    should_activate: "(.*)"$/gm)].map((match) => match[1]);
  assert.equal(positives.length, 12);
  assert.equal(negatives.length, 8);
  assert.equal(positives.filter((prompt) => /[А-Яа-яЁё]/.test(prompt)).length, 6);
  assert.equal(positives.filter((prompt) => !/[А-Яа-яЁё]/.test(prompt)).length, 6);
  assert.equal(negatives.filter((prompt) => /[А-Яа-яЁё]/.test(prompt)).length, 4);
  assert.equal(negatives.filter((prompt) => !/[А-Яа-яЁё]/.test(prompt)).length, 4);
  assert.deepEqual(new Set(owners), new Set(['package-tutorial-factory']));
  assert.equal(owners.length, negatives.length);

  const spec = parseRouting(routing);
  assert.throws(() => parseRouting(routing.replace(/\nnegatives:[\s\S]*$/, '\nnegatives:\n')), /incomplete/);
  const cases = [
    ...spec.positives.map((prompt, index) => ({ id: `case-${String(index + 1).padStart(3, '0')}`, prompt, expected: spec.skill })),
    ...spec.negatives.map((item, index) => ({ id: `case-${String(spec.positives.length + index + 1).padStart(3, '0')}`, prompt: item.prompt, expected: item.shouldActivate })),
  ];
  const prompt = buildBlindPrompt('- **package-story-page**: short page\n- **package-tutorial-factory**: full course', cases);
  assert.doesNotMatch(prompt, /"expected"|"shouldActivate"|"should_activate"/);
  assert.match(prompt, /case-001/);
  assert.match(prompt, /case-020/);

  const correct = cases.map((item) => ({ id: item.id, answer: item.expected, reason: 'bounded owner' }));
  assert.equal(scoreRouting(spec, correct).pass, true);
  const oneAllowedSteal = structuredClone(correct);
  oneAllowedSteal[0].answer = 'package-tutorial-factory';
  assert.equal(scoreRouting(spec, oneAllowedSteal).pass, true);
  const twoSteals = structuredClone(oneAllowedSteal);
  twoSteals[1].answer = 'package-tutorial-factory';
  assert.equal(scoreRouting(spec, twoSteals).pass, false);
  const positiveCollision = structuredClone(correct);
  for (const row of positiveCollision.slice(0, 3)) row.answer = 'package-tutorial-factory';
  assert.equal(scoreRouting(spec, positiveCollision).pass, false);
  const negativeCollision = structuredClone(correct);
  negativeCollision[spec.positives.length].answer = spec.skill;
  assert.equal(scoreRouting(spec, negativeCollision).pass, false);
  const invalid = structuredClone(correct);
  invalid[0].answer = 'not-in-catalog';
  assert.equal(scoreRouting(spec, invalid).pass, false);
  const launderingAttempt = structuredClone(correct);
  launderingAttempt[0] = {
    ...launderingAttempt[0], answer: 'package-tutorial-factory', kind: 'negative',
    expected: 'package-tutorial-factory', prompt: 'judge-controlled replacement',
  };
  const launderingScore = scoreRouting(spec, launderingAttempt);
  assert.equal(launderingScore.metrics.activationHits, spec.positives.length - 1);
  assert.equal(launderingScore.results[0].kind, 'positive');
  assert.equal(launderingScore.results[0].expected, spec.skill);
  assert.equal(launderingScore.results[0].prompt, spec.positives[0]);

  const prettyEnvelope = JSON.stringify({ type: 'result', is_error: false, result: '{"results":[]}' }, null, 2);
  assert.deepEqual(parseClaudeEnvelope(prettyEnvelope), { results: [] });

  for (const marker of ['>', '>-', '|', '|-']) {
    assert.equal(frontmatterDescription(`---\nname: demo\ndescription: ${marker}\n  Folded description.\n  Second line.\nallowed-tools: Read\n---\n`), 'Folded description. Second line.');
  }

  const storySkillText = readFileSync(join(root, 'package-story-page', 'SKILL.md'), 'utf8');
  const tutorialSkillPath = join(root, '..', 'skills-tutorial-factory', 'package-tutorial-factory', 'SKILL.md');
  const receipt = JSON.parse(readFileSync(join(root, 'package-story-page', 'evals', 'opus-receipt.json'), 'utf8'));
  assert.equal(receipt.schema, 'package-story-routing-receipt/1');
  assert.equal(receipt.judge, 'claude:opus');
  assert.deepEqual(receipt.isolation, ['safe-mode', 'strict-mcp-config', 'no-tools', 'no-session-persistence', 'empty-cwd']);
  assert.equal(receipt.scope, 'bounded pairwise routing: package-story-page vs package-tutorial-factory');
  assert.equal(new Date(receipt.measuredAt).toISOString(), receipt.measuredAt);
  assert.equal(receipt.evalSha256, sha256Text(routing));
  assert.equal(receipt.storySkillSha256, sha256Text(storySkillText));
  if (existsSync(tutorialSkillPath)) {
    const tutorialSkillText = readFileSync(tutorialSkillPath, 'utf8');
    const catalog = [
      `- **package-story-page**: ${frontmatterDescription(storySkillText)}`,
      `- **package-tutorial-factory**: ${frontmatterDescription(tutorialSkillText)}`,
    ].join('\n');
    assert.equal(receipt.tutorialSkillSha256, sha256Text(tutorialSkillText));
    assert.equal(receipt.catalogSha256, sha256Text(catalog));
    assert.equal(receipt.promptSha256, sha256Text(buildBlindPrompt(catalog, cases)));
  } else {
    for (const field of ['tutorialSkillSha256', 'catalogSha256', 'promptSha256']) {
      assert.match(receipt[field], /^[a-f0-9]{64}$/, `${field} remains a pinned external receipt field`);
    }
  }
  const measured = scoreRouting(spec, receipt.results);
  assert.equal(measured.pass, true);
  assert.deepEqual(receipt.metrics, measured.metrics);
});

test('evidence schema fail-closed branches have named red mutants', () => {
  const valid = extractPackageEvidence(fixturePackage());
  assert.equal(validateEvidence(valid).pass, true, validateEvidence(valid).failures.join('\n'));
  const cases = [
    [(value) => { value.schema = 'other'; }, 'schema must be'],
    [(value) => { value.package.version = ''; }, 'package.name/version required'],
    [(value) => { value.generatedFrom = ''; }, 'generatedFrom required'],
    [(value) => { value.sources = []; }, 'sources must be non-empty'],
    [(value) => { value.sources[0].id = '../unsafe'; }, 'every source needs a safe id'],
    [(value) => { value.sources.push(structuredClone(value.sources[0])); }, 'duplicate source id'],
    [(value) => { delete value.sources[0].sha256; }, 'must be one local record or one supplied dated HTTPS record'],
    [(value) => { value.truncation.sourceFiles.included = value.truncation.sourceFiles.limit + 1; }, 'truncation.sourceFiles'],
    [(value) => { value.truncation.sourceFiles.included -= 1; }, 'truncation.sourceFiles'],
    [(value) => { value.truncation.readmeExamples.dropped += 1; }, 'truncation.readmeExamples'],
    [(value) => { value.readmeExamples.pop(); }, 'readmeExamples must match'],
  ];
  assert.equal(cases.length, 11);
  for (const [mutate, marker] of cases) {
    const value = structuredClone(valid);
    mutate(value);
    const result = validateEvidence(value);
    assert.equal(result.pass, false, marker);
    assert.ok(result.failures.some((failure) => failure.includes(marker)), `${marker}: ${result.failures.join('; ')}`);
  }
});

test('extracts local evidence with stable provenance and exact line counts', () => {
  const packageRoot = fixturePackage();
  const evidence = extractPackageEvidence(packageRoot);
  assert.equal(evidence.schema, 'package-evidence/1');
  assert.equal(evidence.package.name, '@fixture/health-note');
  const readme = evidence.sources.find((source) => source.path === 'README.md');
  assert.equal(readme.sha256.length, 64);
  assert.equal(readme.lines, countSourceLines(readFileSync(join(packageRoot, 'README.md'), 'utf8')));
  assert.equal(countSourceLines('one\n'), 1);
  assert.equal(countSourceLines('one'), 1);
  assert.equal(evidence.readmeExamples.length, 2);
  assert.ok(evidence.commands.some((command) => command.name === 'check'));
});

test('brief sources require local SHA/line provenance or a dated HTTPS record', () => {
  const { story } = fixtureStory();
  const sourceIndex = story.sources.findIndex((source) => source.path === 'README.md');
  const original = story.sources[sourceIndex];
  story.sources[sourceIndex] = { id: original.id, path: original.path, lineRange: original.lineRange };
  assert.equal(validateBrief(story).pass, false);
  story.sources[sourceIndex] = {
    id: original.id, url: 'https://example.com/evidence', checkedAt: '2026-08-21',
    receiptPath: original.path, sha256: original.sha256, lineRange: original.lineRange,
  };
  assert.equal(validateBrief(story).pass, true);
  story.sources[sourceIndex] = { id: story.sources[sourceIndex].id, path: 'README.md', sha256: 'a'.repeat(64), lineRange: [1, 41] };
  assert.equal(validateBrief(story).pass, false);
});

test('optional eyebrow is absent or a non-blank authored field', () => {
  const absent = fixtureStory();
  delete absent.story.hero.eyebrow;
  assert.equal(validateBrief(absent.story).pass, true);
  assertCheck(verify(absent, renderStoryPage(absent.story)), 'page.copy', true);
  for (const value of ['', '   ', null]) {
    const fixture = fixtureStory();
    fixture.story.hero.eyebrow = value;
    const result = validateBrief(fixture.story);
    assert.equal(result.pass, false, JSON.stringify(value));
    assert.ok(result.failures.includes('hero.eyebrow must be non-blank when supplied'));
  }
});

test('canonical JSON accepts only JSON values and is stable across valid nested values', () => {
  const valid = { z: [null, true, false, 1.25, 'escaped\nvalue'], a: { y: 2, x: 'x' } };
  assert.equal(canonicalJsonText(valid), '{"a":{"x":"x","y":2},"z":[null,true,false,1.25,"escaped\\nvalue"]}');
  for (const value of [undefined, () => {}, Symbol('x'), 1n, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => canonicalJsonText(value), /canonical JSON/);
  }
  const cycle = {};
  cycle.self = cycle;
  assert.throws(() => canonicalJsonText(cycle), /cycles/);
});

test('brief schema rejects the ADR-named structural and authored-copy mutations', () => {
  const cases = [
    [(story) => { delete story.example; }, 'example needs'],
    [(story) => { story.example.sourceIds = ['missing-source']; }, 'references missing source'],
    [(story) => { delete story.claims[1].numericEvidence; }, 'requires one token/context proof'],
    [(story) => { delete story.claims[1].sourceIds; }, 'sourceIds must be an array'],
    [(story) => { story.claims[1].numericEvidence[0].context = story.claims[1].numericEvidence[0].token; }, 'invalid token context proof'],
    [(story) => { story.claims[1].numericEvidence[0].context = 've'; }, 'invalid token context proof'],
    [(story) => { story.claims[1].numericEvidence[0].context = 'metric 1.2.3'; }, 'invalid token context proof'],
    [(story) => { story.install[0].command = 'TODO'; }, 'placeholder token'], // no-stubs: negative fixture proves placeholder rejection
    [(story) => { story.reuse[0].note = 'TBD'; }, 'placeholder token'],
    [(story) => { story.example.output.preview = 'FIXME'; }, 'placeholder token'], // no-stubs: negative fixture proves placeholder rejection
    [(story) => { story.example.synthetic = false; }, 'synthetic=true'],
    [(story) => { story.hero.subtitle = 'Гарантирует 3 результата.'; }, 'numeric factual prose'],
    [(story) => { story.why.body = 'Экономит 20% времени.'; }, 'numeric factual prose'],
    [(story) => { story.mechanism[0].explanation = 'Проходит 4 стадии.'; }, 'numeric factual prose'],
    [(story) => { story.limits[0].text = 'Охватывает 12 порогов.'; }, 'numeric factual prose'],
    [(story) => { story.cta.body = 'Готово за 5 минут.'; }, 'numeric factual prose'],
    [(story) => { story.install[0].label = 'Запуск за 2 шага'; }, 'numeric factual prose'],
    [(story) => { story.example.title = '3 показательных дневника'; }, 'numeric factual prose'],
    [(story) => { story.example.title = '٣ показательных дневника'; }, 'numeric factual prose'],
    [(story) => { story.mechanism[1].id = story.mechanism[0].id; }, 'duplicate mechanism id'],
    [(story) => { story.example.process = ['a', 'b', 'c', 'd', 'e', 'f']; }, 'example needs'],
    [(story) => { delete story.visuals.mechanism; }, 'visuals.mechanism'],
    [(story) => { story.visuals.example.kind = 'decoration'; }, 'visuals.example'],
    [(story) => { story.limits.push({ category: '2026', title: 'Дата', text: 'Неизвестно', status: 'unknown', sourceIds: [] }); }, 'unsupported category'],
  ];
  for (const [mutate, marker] of cases) {
    const { story } = fixtureStory();
    mutate(story);
    const result = validateBrief(story);
    assert.equal(result.pass, false, marker);
    assert.ok(result.failures.some((failure) => failure.includes(marker)), `${marker}: ${result.failures.join('; ')}`);
  }
});

test('every numeric-prose surface has an explicit red mutant while artifact fields remain usable', () => {
  const numericProseMutants = [
    ['audience', (story) => { story.audience = 'Аудитория из 3 команд'; }],
    ['hero.eyebrow', (story) => { story.hero.eyebrow = 'Пакет за 5 минут'; }],
    ['hero.title', (story) => { story.hero.title = 'Получите 2 артефакта'; }],
    ['hero.subtitle', (story) => { story.hero.subtitle = 'Экономит 20% времени'; }],
    ['hero.cta', (story) => { story.hero.cta = 'Открыть 3 примера'; }],
    ['example.title', (story) => { story.example.title = '3 показательных дневника'; }],
    ['example.process[]', (story) => { story.example.process[0] = 'Пройти 4 этапа'; }],
    ['example.output.format', (story) => { story.example.output.format = 'HTML 5'; }],
    ['example.output.preview', (story) => { story.example.output.preview = '2 непроверенных результата'; }],
    ['why.title', (story) => { story.why.title = '2 причины'; }],
    ['why.body', (story) => { story.why.body = 'Экономит 20% времени'; }],
    ['mechanism[].label', (story) => { story.mechanism[0].label = 'Шаг 1'; }],
    ['mechanism[].explanation', (story) => { story.mechanism[0].explanation = 'Проходит 4 стадии'; }],
    ['mechanism[].guardrail', (story) => { story.mechanism[0].guardrail = 'Не более 2 попыток'; }],
    ['install[].label', (story) => { story.install[0].label = 'Запуск за 2 шага'; }],
    ['reuse[].host', (story) => { story.reuse[0].host = 'Codex 3'; }],
    ['reuse[].note', (story) => { story.reuse[0].note = 'Поддерживает 5 хостов'; }],
    ['limits[].title', (story) => { story.limits[0].title = '12 ограничений'; }],
    ['limits[].text', (story) => { story.limits[0].text = 'Охватывает 12 порогов'; }],
    ['visuals.example.direction', (story) => { story.visuals.example.direction = 'Показать 2 артефакта'; }],
    ['visuals.why.direction', (story) => { story.visuals.why.direction = 'Сравнить 3 подхода'; }],
    ['visuals.mechanism.direction', (story) => { story.visuals.mechanism.direction = 'Показать 4 шага'; }],
    ['visuals.install.direction', (story) => { story.visuals.install.direction = 'Показать 2 команды'; }],
    ['visuals.reuse.direction', (story) => { story.visuals.reuse.direction = 'Развести 5 хостов'; }],
    ['visuals.limits.direction', (story) => { story.visuals.limits.direction = 'Показать 3 границы'; }],
    ['cta.title', (story) => { story.cta.title = 'Попробуйте 2 варианта'; }],
    ['cta.body', (story) => { story.cta.body = 'Готово за 5 минут'; }],
    ['cta.label', (story) => { story.cta.label = 'Открыть 3 шага'; }],
  ];
  assert.equal(numericProseMutants.length, 28);
  for (const [field, mutate] of numericProseMutants) {
    const { story } = fixtureStory();
    mutate(story);
    const result = validateBrief(story);
    assert.equal(result.pass, false, field);
    assert.ok(result.failures.includes('numeric factual prose must be expressed as an evidenced claim with numericEvidence'), field);
  }

  const { story } = fixtureStory();
  story.example.input = '{"sleepHours":6}';
  story.install[0].command = 'npx health-note --limit 3';
  assert.equal(validateBrief(story).pass, true, validateBrief(story).failures.join('\n'));

});

test('Russian and English chrome have exact recursive key parity and reject omissions', () => {
  const baseline = validateChromeCopyParity();
  assert.equal(baseline.pass, true, baseline.failures.join('\n'));
  assert.ok(baseline.keys.includes('status.unknown'));
  assert.ok(baseline.keys.includes('category.freshness'));

  const missing = structuredClone(CHROME_COPY);
  delete missing.en.mechanismTitle;
  assert.equal(validateChromeCopyParity(missing).pass, false);

  const nestedMissing = structuredClone(CHROME_COPY);
  delete nestedMissing.ru.status.external;
  assert.equal(validateChromeCopyParity(nestedMissing).pass, false);

  const empty = structuredClone(CHROME_COPY);
  empty.en.footer = '   ';
  assert.equal(validateChromeCopyParity(empty).pass, false);

  const bothEmpty = structuredClone(CHROME_COPY);
  bothEmpty.en.footer = '';
  bothEmpty.ru.footer = '';
  assert.equal(validateChromeCopyParity(bothEmpty).pass, false);

  const extra = structuredClone(CHROME_COPY);
  extra.ru.unpaired = 'Лишний ключ';
  assert.equal(validateChromeCopyParity(extra).pass, false);
});

test('every selected-language chrome leaf reaches the rendered page', () => {
  const flatten = (value) => Object.values(value).flatMap((item) => (
    item && typeof item === 'object' ? flatten(item) : [item]
  ));
  for (const language of ['ru', 'en']) {
    const fixture = fixtureStory();
    fixture.story.language = language;
    const external = externalSource(fixture, 'chrome-external', 'https://example.com/chrome');
    fixture.evidence.sources.push(external);
    fixture.story.sources.push(external);
    fixture.story.claims.push({ id: 'external-note', text: 'External note', status: 'external', sourceIds: [external.id] });
    const html = renderStoryPage(fixture.story);
    const selectedLeaves = flatten(CHROME_COPY[language]);
    for (const leaf of selectedLeaves) {
      assert.ok(html.includes(escapeHtml(leaf)), `${language} chrome leaf missing: ${leaf}`);
    }
    const authored = JSON.stringify(fixture.story);
    const opposite = language === 'ru' ? 'en' : 'ru';
    for (const leaf of flatten(CHROME_COPY[opposite])) {
      if (!selectedLeaves.includes(leaf) && !authored.includes(leaf)) {
        assert.ok(!html.includes(escapeHtml(leaf)), `${opposite} chrome leaked into ${language}: ${leaf}`);
      }
    }
  }
});

test('valid brief renders deterministically and verifies against current package bytes', () => {
  const fixture = fixtureStory();
  assert.equal(validateBrief(fixture.story).pass, true, validateBrief(fixture.story).failures.join('\n'));
  const one = renderStoryPage(fixture.story);
  const two = renderStoryPage(fixture.story);
  assert.equal(one, two);
  const result = verify(fixture, one);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.ok(one.indexOf('data-story-section="example"') < one.indexOf('data-story-section="mechanism"'));
});

test('forged provenance positive line-range bounds and package identity turn their named checks red', () => {
  const shaFixture = fixtureStory();
  const shaSource = shaFixture.story.sources[0];
  shaSource.sha256 = '0'.repeat(64);
  assertCheck(verify(shaFixture), `provenance.${shaSource.id}.sha`);

  const rangeFixture = fixtureStory();
  const rangeSource = rangeFixture.story.sources[0];
  rangeSource.lineRange = [1, 9999];
  assertCheck(verifyStoryPage(rangeFixture.story, renderStoryPage(brief(rangeFixture.evidence)), {
    evidence: rangeFixture.evidence, packageRoot: rangeFixture.packageRoot,
  }), `provenance.${rangeSource.id}.range`);
  for (const invalidRange of [[2, 1], [0, 1], [1, 1.5], [1, 1, 1]]) {
    const invalidFixture = fixtureStory();
    const validHtml = renderStoryPage(invalidFixture.story);
    const invalidSource = invalidFixture.story.sources[0];
    invalidSource.lineRange = invalidRange;
    assertCheck(verifyStoryPage(invalidFixture.story, validHtml, {
      evidence: invalidFixture.evidence, packageRoot: invalidFixture.packageRoot,
    }), `provenance.${invalidSource.id}.range`);
  }

  const identityFixture = fixtureStory();
  identityFixture.story.package.name = '@forged/other-package';
  assertCheck(verify(identityFixture), 'provenance.package-name');
  identityFixture.story.package.name = identityFixture.evidence.package.name;
  identityFixture.story.package.version = '999.0.0';
  assertCheck(verify(identityFixture), 'provenance.package-version');
});

test('out-of-root and symlinked local sources fail closed with named provenance checks', () => {
  const escapedFixture = fixtureStory();
  const escapedSource = escapedFixture.story.sources.find((source) => source.path === 'README.md');
  const cleanHtml = renderStoryPage(brief(escapedFixture.evidence));
  escapedSource.path = '../outside.md';
  assertCheck(verifyStoryPage(escapedFixture.story, cleanHtml, {
    evidence: escapedFixture.evidence, packageRoot: escapedFixture.packageRoot,
  }), `provenance.${escapedSource.id}.file`);

  const symlinkFixture = fixtureStory();
  const symlinkSource = symlinkFixture.story.sources.find((source) => source.path === 'README.md');
  const outside = join(temp('story-outside'), 'README.md');
  writeFileSync(outside, readFileSync(join(symlinkFixture.packageRoot, 'README.md')));
  renameSync(join(symlinkFixture.packageRoot, 'README.md'), join(symlinkFixture.packageRoot, 'README.original.md'));
  symlinkSync(outside, join(symlinkFixture.packageRoot, 'README.md'));
  assertCheck(verify(symlinkFixture), `provenance.${symlinkSource.id}.file`);

  const oversizedFixture = fixtureStory();
  const oversizedSource = oversizedFixture.story.sources.find((source) => source.path === 'README.md');
  const oversizedBody = 'x'.repeat(PROVENANCE_FILE_BYTE_LIMIT + 1);
  writeFileSync(join(oversizedFixture.packageRoot, oversizedSource.path), oversizedBody);
  const recorded = oversizedFixture.evidence.sources.find((source) => source.id === oversizedSource.id);
  oversizedSource.sha256 = sha256Text(oversizedBody);
  oversizedSource.lineRange = [1, 1];
  recorded.sha256 = oversizedSource.sha256;
  recorded.lines = 1;
  const oversizedResult = verify(oversizedFixture);
  assertCheck(oversizedResult, `provenance.${oversizedSource.id}.file`);
  assert.match(
    oversizedResult.checks.find((check) => check.id === `provenance.${oversizedSource.id}.file`)?.detail ?? '',
    new RegExp(`exceeds ${PROVENANCE_FILE_BYTE_LIMIT} bytes before read`),
  );

  const aggregateFixture = fixtureStory();
  for (let index = 0; index < 8; index += 1) {
    addLocalSource(aggregateFixture, {
      id: `aggregate-${index}`,
      path: `test/aggregate-${index}.md`,
      body: 'a'.repeat(PROVENANCE_FILE_BYTE_LIMIT),
      lineRange: [1, 1],
    });
  }
  const aggregateResult = verify(aggregateFixture);
  assertCheck(aggregateResult, 'provenance.aggregate');
  assert.match(aggregateResult.checks.find((check) => check.id === 'provenance.aggregate')?.detail ?? '', /8388608 bytes/);
});

test('numeric support uses exact tokens in a bounded local range and rejects external numbers', () => {
  const exactFixture = fixtureStory();
  const packageSource = exactFixture.story.claims[1].sourceIds[0];
  exactFixture.story.claims.push({
    id: 'substring', text: 'Версия 1', status: 'evidenced', sourceIds: [packageSource],
    numericEvidence: [{ token: '1', context: 'version', sourceId: packageSource }],
  });
  assertCheck(verify(exactFixture), 'claim.substring.number.proof-0');

  const contextFixture = fixtureStory();
  contextFixture.story.claims[1].numericEvidence[0].context = 'name';
  assertCheck(verify(contextFixture), 'claim.version.context.proof-0');

  const rangeFixture = fixtureStory();
  const rangeSource = addLocalSource(rangeFixture, {
    id: 'bounded-metric', path: 'evidence/bounded.md',
    body: 'scope begins\nno metric here\nmetric 77 requests\n', lineRange: [1, 2],
  });
  rangeFixture.story.claims.push({
    id: 'bounded-number', text: 'Лимит 77 запросов', status: 'evidenced', sourceIds: [rangeSource.id],
    numericEvidence: [{ token: '77', context: 'metric', sourceId: rangeSource.id }],
  });
  assertCheck(verify(rangeFixture), 'claim.bounded-number.number.proof-0');
  rangeSource.lineRange = [3, 3];
  assert.equal(verify(rangeFixture).pass, true, verify(rangeFixture).failures.join('\n'));

  const separatorFixture = fixtureStory();
  const separatorSource = addLocalSource(separatorFixture, {
    id: 'separator-metric', path: 'evidence/separator.md', body: 'metric 1.234 requests\n', lineRange: [1, 1],
  });
  separatorFixture.story.claims.push({
    id: 'separator-number', text: 'Лимит 1,234 запроса', status: 'evidenced', sourceIds: [separatorSource.id],
    numericEvidence: [{ token: '1,234', context: 'metric', sourceId: separatorSource.id }],
  });
  const separatorResult = verify(separatorFixture);
  assertCheck(separatorResult, 'claim.separator-number.number.proof-0');
  assert.equal(separatorResult.checks.some((check) => check.id.includes('1,234')), false);

  const duplicateProofFixture = fixtureStory();
  const duplicateSourceId = duplicateProofFixture.story.claims[1].sourceIds[0];
  duplicateProofFixture.story.claims.push({
    id: 'duplicate-proof', text: 'Версии 1 и 1', status: 'evidenced', sourceIds: [duplicateSourceId],
    numericEvidence: [
      { token: '1', context: 'version', sourceId: duplicateSourceId },
      { token: '1', context: 'missing-context', sourceId: duplicateSourceId },
    ],
  });
  const duplicateProofResult = verify(duplicateProofFixture);
  assert.equal(duplicateProofResult.checks.filter((check) => check.id === 'claim.duplicate-proof.number.proof-0').length, 1);
  assert.equal(duplicateProofResult.checks.filter((check) => check.id === 'claim.duplicate-proof.number.proof-1').length, 1);
  assertCheck(duplicateProofResult, 'claim.duplicate-proof.context.proof-1');

  const externalFixture = fixtureStory();
  const validHtml = renderStoryPage(externalFixture.story);
  const external = externalSource(externalFixture, 'vendor-metric', 'https://example.com/metric');
  externalFixture.evidence.sources.push(external);
  externalFixture.story.sources.push(external);
  externalFixture.story.claims.push({ id: 'fake-external', text: '99% успешных запусков', status: 'external', sourceIds: [external.id] });
  const result = verifyStoryPage(externalFixture.story, validHtml, { evidence: externalFixture.evidence, packageRoot: externalFixture.packageRoot });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes('numeric claim fake-external requires current local evidence')));
  assertCheck(result, 'claim.fake-external.external-numeric');
});

test('external sources must be supplied by the original evidence artifact', () => {
  const fixture = fixtureStory();
  const external = externalSource(fixture, 'vendor-doc', 'https://example.com/docs');
  fixture.story.sources.push(external);
  fixture.story.claims.push({ id: 'vendor-note', text: 'Vendor documentation describes an optional mode.', status: 'external', sourceIds: [external.id] });
  assertCheck(verify(fixture), 'provenance.vendor-doc.record');
  fixture.evidence.sources.push(external);
  assert.equal(verify(fixture).pass, true, verify(fixture).failures.join('\n'));

  fixture.story.claims.find((claim) => claim.id === 'vendor-note').text = 'Vendor documentation promises a different mode.';
  assertCheck(verify(fixture), 'claim.vendor-note.external-content');
  fixture.story.claims.find((claim) => claim.id === 'vendor-note').text = 'Vendor documentation describes an optional mode.';

  external.lineRange = [3, 3];
  assertCheck(verify(fixture), 'provenance.vendor-doc.receipt-url');
  assertCheck(verify(fixture), 'provenance.vendor-doc.receipt-date');
  external.lineRange = [1, external.lines];

  const receiptBody = readFileSync(join(fixture.packageRoot, external.receiptPath), 'utf8').replace(external.url, 'https://example.com/other');
  writeFileSync(join(fixture.packageRoot, external.receiptPath), receiptBody);
  external.sha256 = sha256Text(receiptBody);
  external.lines = countSourceLines(receiptBody);
  assertCheck(verify(fixture), 'provenance.vendor-doc.receipt-url');
});

test('malformed briefs return a named failure report instead of throwing', () => {
  const fixture = fixtureStory();
  let result;
  assert.doesNotThrow(() => { result = verifyStoryPage({}, '', { evidence: fixture.evidence, packageRoot: fixture.packageRoot }); });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes('schema must be package-story-brief/1')));

  for (const path of ['sources', 'claims', 'mechanism', 'install', 'reuse', 'limits']) {
    const { story } = fixtureStory();
    story[path] = {};
    assert.doesNotThrow(() => { result = validateBrief(story); }, path);
    assert.equal(result.pass, false, path);
  }
  const { story } = fixtureStory();
  story.example.process = {};
  assert.doesNotThrow(() => { result = validateBrief(story); }, 'example.process');
  assert.equal(result.pass, false);

  const nestedCases = [
    ['claim.sourceIds', (value) => { value.claims[0].sourceIds = {}; }],
    ['claim.numericEvidence', (value) => { value.claims[1].numericEvidence = {}; }],
  ];
  for (const [label, mutate] of nestedCases) {
    const fixture = fixtureStory();
    const html = renderStoryPage(fixture.story);
    mutate(fixture.story);
    assert.doesNotThrow(() => {
      result = verifyStoryPage(fixture.story, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot });
    }, label);
    assert.equal(result.pass, false, label);
  }

  const evidenceFixture = fixtureStory();
  const evidenceHtml = renderStoryPage(evidenceFixture.story);
  evidenceFixture.evidence.sources = {};
  assert.doesNotThrow(() => {
    result = verifyStoryPage(evidenceFixture.story, evidenceHtml, {
      evidence: evidenceFixture.evidence, packageRoot: evidenceFixture.packageRoot,
    });
  }, 'evidence.sources');
  assert.equal(result.pass, false, 'evidence.sources');
});

test('malformed array members fail closed without throwing', () => {
  const cases = [
    ['evidence.sources', (fixture) => { fixture.evidence.sources = [null, null, ...fixture.evidence.sources]; }, 'evidence.sources[0] must be an object'],
    ['evidence.readmeExamples', (fixture) => { fixture.evidence.readmeExamples = [false, ...fixture.evidence.readmeExamples]; }, 'evidence.readmeExamples[0] must be an object'],
    ['brief.sources', (fixture) => { fixture.story.sources = [0, 0, ...fixture.story.sources]; }, 'brief.sources[0] must be an object'],
    ['brief.claims', (fixture) => { fixture.story.claims = [null, null, ...fixture.story.claims]; }, 'brief.claims[0] must be an object'],
    ['brief.numericEvidence', (fixture) => { fixture.story.claims[1].numericEvidence = [[]]; }, 'brief.claims[1].numericEvidence[0] must be an object'],
    ['brief.mechanism', (fixture) => { fixture.story.mechanism = ['bad', 'bad', ...fixture.story.mechanism]; }, 'brief.mechanism[0] must be an object'],
    ['brief.install', (fixture) => { fixture.story.install = [false, ...fixture.story.install]; }, 'brief.install[0] must be an object'],
    ['brief.reuse', (fixture) => { fixture.story.reuse = [[], ...fixture.story.reuse]; }, 'brief.reuse[0] must be an object'],
    ['brief.limits', (fixture) => { fixture.story.limits = [0, ...fixture.story.limits]; }, 'brief.limits[0] must be an object'],
  ];
  for (const [label, mutate, expectedFailure] of cases) {
    const fixture = fixtureStory();
    const html = renderStoryPage(fixture.story);
    mutate(fixture);
    let result;
    assert.doesNotThrow(() => {
      result = verifyStoryPage(fixture.story, html, {
        evidence: fixture.evidence, packageRoot: fixture.packageRoot,
      });
    }, label);
    assert.equal(result.pass, false, label);
    assert.deepEqual(
      result.failures,
      result.checks.filter((check) => !check.pass).map((check) => `${check.id}: ${check.detail}`),
      `${label}: every public failure must own one red check`,
    );
    assert.ok(result.failures.some((failure) => failure.includes(expectedFailure)), `${label}\n${result.failures.join('\n')}`);
    assert.ok(result.failures.every((failure) => !failure.includes('duplicate') || !failure.includes('undefined')), label);
  }

  const invalidIdFixture = fixtureStory();
  const invalidIdHtml = renderStoryPage(invalidIdFixture.story);
  invalidIdFixture.story.sources[0].id = 'unsafe id';
  const invalidIdResult = verifyStoryPage(invalidIdFixture.story, invalidIdHtml, {
    evidence: invalidIdFixture.evidence, packageRoot: invalidIdFixture.packageRoot,
  });
  assert.equal(invalidIdResult.pass, false);
  assert.ok(invalidIdResult.checks.some((check) => check.id.startsWith('provenance.invalid-0.')));
  assert.equal(invalidIdResult.checks.some((check) => check.id.includes('unsafe id')), false);

  const invalidClaimFixture = fixtureStory();
  const invalidClaimHtml = renderStoryPage(invalidClaimFixture.story);
  invalidClaimFixture.story.claims[1].id = 'unsafe claim id';
  invalidClaimFixture.story.claims[1].numericEvidence[0].token = 'unsafe proof token';
  const invalidClaimResult = verifyStoryPage(invalidClaimFixture.story, invalidClaimHtml, {
    evidence: invalidClaimFixture.evidence, packageRoot: invalidClaimFixture.packageRoot,
  });
  assert.equal(invalidClaimResult.pass, false);
  assert.ok(invalidClaimResult.checks.some((check) => check.id.startsWith('claim.invalid-1.number.proof-0')));
  assert.equal(invalidClaimResult.checks.some((check) => /unsafe claim id|unsafe proof token/.test(check.id)), false);

  const duplicateIdFixture = fixtureStory();
  const duplicateIdHtml = renderStoryPage(duplicateIdFixture.story);
  duplicateIdFixture.story.sources.push({ ...duplicateIdFixture.story.sources[0] });
  duplicateIdFixture.story.claims.push({ ...duplicateIdFixture.story.claims[0] });
  const duplicateIdResult = verifyStoryPage(duplicateIdFixture.story, duplicateIdHtml, {
    evidence: duplicateIdFixture.evidence, packageRoot: duplicateIdFixture.packageRoot,
  });
  assert.equal(duplicateIdResult.pass, false);
  const duplicateEnvelopeIds = duplicateIdResult.checks.map((check) => check.id);
  assert.equal(new Set(duplicateEnvelopeIds).size, duplicateEnvelopeIds.length,
    'duplicate authored source/claim ids must not create duplicate public check ids');
  assert.ok(duplicateEnvelopeIds.some((id) => id.includes('-duplicate-')));
});

test('unknown markers and evidence citations stay bound to their authored item', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const valid = verify(fixture, html);
  assertCheck(valid, 'page.item-bindings', true);

  const itemIds = [...html.matchAll(/data-story-item-id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.deepEqual(itemIds, [
    'hero:story', 'claim:purpose', 'claim:version',
    'example:scenario', 'example:output', 'why:rationale',
    'mechanism:input', 'mechanism:structure', 'mechanism:artifact',
    'install:0', 'reuse:0', 'reuse:1',
    'limit:0:safety', 'limit:1:cost', 'limit:2:freshness', 'cta:action',
  ]);

  const unknownSwap = html
    .replace('data-unknown-id="reuse:0"', 'data-unknown-id="swap-token"')
    .replace('data-unknown-id="limit:1:cost"', 'data-unknown-id="reuse:0"')
    .replace('data-unknown-id="swap-token"', 'data-unknown-id="limit:1:cost"');
  const unknownResult = verify(fixture, unknownSwap);
  assertCheck(unknownResult, 'page.item-bindings');
  assertCheck(unknownResult, 'page.unknown-labels', true);
  assertCheck(unknownResult, 'source.closure', true);

  const readmeId = fixture.story.mechanism[0].sourceIds[0];
  const packageId = fixture.story.mechanism[2].sourceIds[0];
  let citationSwap = mutateStoryItem(html, 'mechanism:input', (markup) =>
    markup.replace(`data-source-id="${readmeId}"`, `data-source-id="${packageId}"`));
  citationSwap = mutateStoryItem(citationSwap, 'mechanism:artifact', (markup) =>
    markup.replace(`data-source-id="${packageId}"`, `data-source-id="${readmeId}"`));
  const citationResult = verify(fixture, citationSwap);
  assertCheck(citationResult, 'page.item-bindings');
  assertCheck(citationResult, 'source.closure', true);
  assertCheck(citationResult, 'page.copy', true);

  const duplicateFixture = fixtureStory();
  duplicateFixture.story.mechanism[0].sourceIds.push(duplicateFixture.story.mechanism[0].sourceIds[0]);
  const duplicateHtml = renderStoryPage(duplicateFixture.story);
  const oneCitationRemoved = mutateStoryItem(duplicateHtml, 'mechanism:input', (markup) =>
    markup.replace(/<span class="evidence" data-source-id="[^"]+">[^<]+<\/span>/, ''));
  assertCheck(verify(duplicateFixture, oneCitationRemoved), 'page.item-bindings');

  const nestedItem = mutateStoryItem(html, 'claim:purpose', (markup) =>
    markup.replace('<span class="evidence"', '<span data-story-item-id="nested:forbidden" class="evidence"'));
  assertCheck(verify(fixture, nestedItem), 'page.item-bindings');

  const orphanSourceId = fixture.story.mechanism[0].sourceIds[0];
  const orphanCitation = html.replace(
    '</main>',
    `<span class="evidence" data-source-id="${orphanSourceId}">${orphanSourceId}</span></main>`,
  );
  const orphanResult = verify(fixture, orphanCitation);
  assertCheck(orphanResult, 'page.item-bindings');
  assertCheck(orphanResult, 'source.closure', true);
});

test('example and why evidence stay bound to their authored item', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  assert.match(html, /data-story-item-id="example:scenario"/);
  assert.match(html, /data-story-item-id="why:rationale"/);

  const exampleId = fixture.story.example.sourceIds[0];
  const whyId = fixture.story.why.sourceIds[0];
  let swapped = mutateStoryItem(html, 'example:scenario', (markup) =>
    markup.replace(`data-source-id="${exampleId}"`, `data-source-id="${whyId}"`));
  swapped = mutateStoryItem(swapped, 'why:rationale', (markup) =>
    markup.replace(`data-source-id="${whyId}"`, `data-source-id="${exampleId}"`));
  const result = verify(fixture, swapped);
  assertCheck(result, 'page.item-bindings');
  assertCheck(result, 'source.closure', true);
});

test('authored copy must remain in visible section text, not comments or attributes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const authored = fixture.story.hero.subtitle;
  const replacement = 'Видимый текст был подменён.';
  const heroOpen = '<section class="hero wrap" data-story-section="hero" data-story-item-id="hero:story">';
  const commentDecoy = html.replace(authored, replacement)
    .replace(heroOpen, `${heroOpen}<!-- ${authored} -->`);
  assertCheck(verify(fixture, commentDecoy), 'page.copy');

  const attributeDecoy = html.replace(authored, replacement)
    .replace('data-story-section="hero"', `data-story-section="hero" data-copy-decoy="${authored}"`);
  assertCheck(verify(fixture, attributeDecoy), 'page.copy');

  const templateDecoy = html.replace(authored, replacement)
    .replace(heroOpen, `${heroOpen}<template>${authored}</template>`);
  assertCheck(verify(fixture, templateDecoy), 'page.copy');

  const splitAt = Math.floor(authored.length / 2);
  const fragmentedDecoy = html.replace(
    authored,
    `${authored.slice(0, splitAt)}</p><p>${authored.slice(splitAt)}`,
  );
  const fragmentedResult = verify(fixture, fragmentedDecoy);
  assertCheck(fragmentedResult, 'page.copy');
  assertCheck(fragmentedResult, 'page.item-copy');
});

test('native disclosures bind details summary and content as one structural unit', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const valid = verify(fixture, html);
  assertCheck(valid, 'page.structure', true);
  assertCheck(valid, 'page.controls', true);
  assert.match(html, /<details[^>]+data-source-disclosure="sources"/);
  assert.match(html, /<summary[^>]+data-source-summary="sources"/);
  assert.match(html, /<ul[^>]+data-source-content="sources"/);

  const quotedGreater = html.replace(
    'class="flow-step" data-story-item-id="mechanism:input"',
    'class="flow-step quoted > delimiter" data-story-item-id="mechanism:input"',
  );
  assertCheck(verify(fixture, quotedGreater), 'page.html-parse', true);
  assertCheck(verify(fixture, quotedGreater), 'page.structure');
  assertCheck(verify(fixture, quotedGreater), 'page.controls', true);

  const wrappedSummary = html.replace(
    /(<summary[^>]+data-flow-summary="input"[^>]*>[\s\S]*?<\/summary>)/,
    '<div class="summary-wrapper">$1</div>',
  );
  assertCheck(verify(fixture, wrappedSummary), 'page.controls');

  const precedingElement = html.replace(
    /(<details[^>]+data-flow-step="structure"[^>]*>\s*)(<summary)/,
    '$1<span class="preceding"></span>$2',
  );
  assertCheck(verify(fixture, precedingElement), 'page.controls');

  const swappedIds = html
    .replace('data-flow-summary="input"', 'data-flow-summary="swap-token"')
    .replace('data-flow-summary="structure"', 'data-flow-summary="input"')
    .replace('data-flow-summary="swap-token"', 'data-flow-summary="structure"');
  assertCheck(verify(fixture, swappedIds), 'page.controls');

  const wrappedSourceContent = html.replace(
    /(<ul data-source-content="sources">[\s\S]*?<\/ul>)/,
    '<div class="source-wrapper">$1</div>',
  );
  assertCheck(verify(fixture, wrappedSourceContent), 'page.controls');

  const malformedStack = html.replace('</details>', '</article>');
  const malformedResult = verify(fixture, malformedStack);
  assertCheck(malformedResult, 'page.structure');

  const browserSource = readFileSync(join(scripts, 'verify-story-page-browser.mjs'), 'utf8');
  assert.doesNotMatch(browserSource, /\.open\s*=|(?:setAttribute|toggleAttribute)\s*\(\s*['"]open['"]/);
});

test('cross-nested disclosures fail page.controls', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const nestedBlock = /\n    <details class="flow-step" data-story-item-id="mechanism:structure"[\s\S]*?\n    <\/details>/.exec(html)?.[0];
  assert.ok(nestedBlock, 'structure disclosure fixture must exist');
  const withoutNested = html.replace(nestedBlock, '');
  const nested = withoutNested.replace(
    /(<details class="flow-step" data-story-item-id="mechanism:input"[\s\S]*?)(\n    <\/details>)/,
    `$1${nestedBlock}$2`,
  );
  assert.notEqual(nested, html, 'cross-nesting mutation must land');
  assert.equal((nested.match(/<details\b/g) ?? []).length, (html.match(/<details\b/g) ?? []).length);
  assert.equal((nested.match(/<summary\b/g) ?? []).length, (html.match(/<summary\b/g) ?? []).length);
  const result = verify(fixture, nested);
  assertCheck(result, 'page.structure');
  assertCheck(result, 'page.controls');
  assert.match(result.checks.find((check) => check.id === 'page.controls')?.detail ?? '', /nested disclosure owner|ancestr/i);
});

test('hidden evidence markers do not satisfy item bindings', () => {
  const surfaces = ['template', 'noscript', 'script', 'style'];
  const wrappers = ['direct', 'descendant'];
  for (const markerKind of ['source', 'unknown']) {
    for (const surface of surfaces) {
      for (const wrapper of wrappers) {
        const fixture = fixtureStory();
        const html = renderStoryPage(fixture.story);
        const target = markerKind === 'source'
          ? /<span class="evidence" data-source-id="([^"]+)">([^<]+)<\/span>/
          : /<span class="status unknown" data-status="unknown" data-unknown-id="([^"]+)">([^<]+)<\/span>/;
        const original = target.exec(html)?.[0];
        assert.ok(original, `${markerKind}/${surface}/${wrapper} marker must exist`);
        const attributes = markerKind === 'source'
          ? /data-source-id="[^"]+"/.exec(original)?.[0]
          : /data-status="unknown" data-unknown-id="[^"]+"/.exec(original)?.[0];
        assert.ok(attributes);
        const replacement = wrapper === 'direct'
          ? `<${surface} ${attributes}>hidden marker</${surface}>`
          : `<${surface}><span ${attributes}>hidden marker</span></${surface}>`;
        const mutated = html.replace(original, replacement);
        assert.notEqual(mutated, html, `${markerKind}/${surface}/${wrapper} mutation must land`);
        const result = verify(fixture, mutated);
        assertCheck(result, 'page.item-bindings');
        assert.match(result.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', new RegExp(surface, 'i'));
        if (markerKind === 'source') assertCheck(result, 'source.closure', true);
        else assertCheck(result, 'page.unknown-labels');
      }
    }
  }
});

test('semantic traversal preserves parse5 template-fragment ownership bytes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const original = /<span class="evidence" data-source-id="([^"]+)">([^<]+)<\/span>/.exec(html)?.[0];
  assert.ok(original, 'evidence marker required');
  const mutated = html.replace(original, `<template>${original}</template>`);
  const result = verifyStorySemantics(fixture.story, mutated);
  const template = result.nodes.find((node) => node.tagName === 'template');
  assert.ok(template?.content, 'parse5 template fragment required');
  assert.equal(template.content.parentNode ?? null, null, 'semantic traversal must not mutate the parse5 fragment');
  assertCheck(result, 'page.item-bindings');
});

test('empty observed source-marker closure is vacuously resolved', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const withoutMarkers = html.replace(/<span class="evidence" data-source-id="[^"]+">[^<]*<\/span>/g, '');
  const result = verifyStorySemantics(fixture.story, withoutMarkers);
  assertCheck(result, 'source.closure', true);
  assertCheck(result, 'page.item-bindings');
});

test('dynamic source checks cannot collide with fixed semantic check ids', () => {
  const fixture = fixtureStory();
  const previous = fixture.story.sources[0].id;
  fixture.story.sources[0].id = 'closure';
  fixture.evidence.sources.find((source) => source.id === previous).id = 'closure';
  for (const value of [
    ...fixture.story.claims, fixture.story.why, ...fixture.story.mechanism,
    ...fixture.story.reuse, ...fixture.story.limits,
  ]) value.sourceIds = value.sourceIds.map((id) => (id === previous ? 'closure' : id));
  const replaceScalarSourceIds = (value) => {
    if (Array.isArray(value)) value.forEach(replaceScalarSourceIds);
    else if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
      if (key === 'sourceId' && child === previous) value[key] = 'closure';
      else replaceScalarSourceIds(child);
    }
  };
  replaceScalarSourceIds(fixture.story);
  const html = renderStoryPage(fixture.story);
  const result = verify(fixture, html);
  assert.equal(result.pass, true, result.failures.join('\n'));
  assert.equal(result.checks.filter((check) => check.id === 'source.closure').length, 1);
  assert.equal(result.checks.filter((check) => check.id === 'source.rendered.closure').length, 1);
  assert.equal(new Set(result.checks.map((check) => check.id)).size, result.checks.length);

  const repeatedProofFixture = fixtureStory();
  const repeatedProofSourceId = repeatedProofFixture.story.claims[1].sourceIds[0];
  repeatedProofFixture.story.claims.push({
    id: 'repeated-proof-envelope', text: 'Версии 1 и 1', status: 'evidenced', sourceIds: [repeatedProofSourceId],
    numericEvidence: [
      { token: '1', context: 'version', sourceId: repeatedProofSourceId },
      { token: '1', context: 'missing-context', sourceId: repeatedProofSourceId },
    ],
  });
  const repeatedProofResult = verify(repeatedProofFixture);
  const repeatedProofIds = repeatedProofResult.checks.map((check) => check.id);
  assert.equal(new Set(repeatedProofIds).size, repeatedProofIds.length,
    'repeated numeric proof tokens must retain distinct index-owned public check ids');
  assertCheck(repeatedProofResult, 'claim.repeated-proof-envelope.context.proof-1');

  const duplicateIdFixture = fixtureStory();
  const duplicateIdHtml = renderStoryPage(duplicateIdFixture.story);
  duplicateIdFixture.story.sources.push({ ...duplicateIdFixture.story.sources[0] });
  duplicateIdFixture.story.claims.push({ ...duplicateIdFixture.story.claims[0] });
  const duplicateIdResult = verifyStoryPage(duplicateIdFixture.story, duplicateIdHtml, {
    evidence: duplicateIdFixture.evidence, packageRoot: duplicateIdFixture.packageRoot,
  });
  const duplicateEnvelopeIds = duplicateIdResult.checks.map((check) => check.id);
  assert.equal(new Set(duplicateEnvelopeIds).size, duplicateEnvelopeIds.length,
    'duplicate authored source/claim ids must not create duplicate public check ids');
  assert.ok(duplicateEnvelopeIds.some((id) => id.includes('-duplicate-')));
});

test('orphan semantic markers cannot borrow aggregate source closure', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const sourceId = fixture.story.sources[0].id;
  const mutated = html.replace('</main>', `<span data-source-id="${sourceId}">orphan evidence</span></main>`);
  assert.notEqual(mutated, html, 'orphan evidence mutation must land');
  const result = verify(fixture, mutated);
  assertCheck(result, 'page.structure');
  assertCheck(result, 'source.closure', true);
  assertCheck(result, 'page.item-bindings');
  assert.match(result.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /no story-item owner/);
});

test('unexpected story-item owners fail reverse totality', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mutated = html.replace('</main>', '<article class="probe" data-story-item-id="phantom"></article></main>');
  const result = verify(fixture, mutated);
  assertCheck(result, 'page.html-subset');
  assertCheck(result, 'page.item-bindings');
  assert.match(result.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /phantom: unexpected story-item owner/);

  const sourceId = fixture.story.sources[0].id;
  const fieldOnly = html.replace(
    'data-story-item-id="hero:story">',
    `data-story-item-id="hero:story"><span class="evidence" data-source-id="${sourceId}">${sourceId}</span>`,
  );
  assert.notEqual(fieldOnly, html, 'field-only owner marker mutation must land');
  const fieldOnlyResult = verify(fixture, fieldOnly);
  assertCheck(fieldOnlyResult, 'page.item-bindings');
  assert.match(fieldOnlyResult.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /hero:story: marker belongs to an owner without a binding contract/);
});

test('authored copy stays bound to each story item', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  assertCheck(verify(fixture, html), 'page.item-copy', true);

  const swaps = [
    ['claim:purpose', 'claim:version', fixture.story.claims[0], fixture.story.claims[1], ['text']],
    ['mechanism:input', 'mechanism:structure', fixture.story.mechanism[0], fixture.story.mechanism[1], ['label', 'explanation', 'guardrail']],
    ['reuse:0', 'reuse:1', fixture.story.reuse[0], fixture.story.reuse[1], ['host', 'note']],
    ['limit:0:safety', 'limit:1:cost', fixture.story.limits[0], fixture.story.limits[1], ['title', 'text']],
  ];
  for (const [leftId, rightId, left, right, fields] of swaps) {
    const mutated = swapItemCopy(html, leftId, rightId,
      fields.map((field) => left[field]), fields.map((field) => right[field]));
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.copy', true);
    assertCheck(result, 'page.item-bindings', true);
    assertCheck(result, 'page.item-copy');
  }

  const exampleValues = [fixture.story.example.input, ...fixture.story.example.process];
  let movedExample = html;
  for (const value of exampleValues) movedExample = movedExample.replace(escapeHtml(value), '');
  movedExample = movedExample.replace('<article class="artifact" data-story-item-id="example:output">', `<article class="artifact" data-story-item-id="example:output">${exampleValues.map((value) => `<p>${escapeHtml(value)}</p>`).join('')}`);
  assertCheck(verify(fixture, movedExample), 'page.copy', true);
  assertCheck(verify(fixture, movedExample), 'page.item-copy');

  const installValues = [fixture.story.install[0].label, fixture.story.install[0].command];
  let movedInstall = html;
  for (const value of installValues) movedInstall = movedInstall.replace(escapeHtml(value), '');
  movedInstall = movedInstall.replace(
    '</div></section>\n<section class="section wrap" data-story-section="reuse"',
    `${installValues.map((value) => `<p>${escapeHtml(value)}</p>`).join('')}</div></section>\n<section class="section wrap" data-story-section="reuse"`,
  );
  assertCheck(verify(fixture, movedInstall), 'page.copy', true);
  assertCheck(verify(fixture, movedInstall), 'page.item-copy');

  const missingWhy = html
    .replace(escapeHtml(fixture.story.why.title), 'removed why title')
    .replace(escapeHtml(fixture.story.why.body), 'removed why body');
  assertCheck(verify(fixture, missingWhy), 'page.copy');
  assertCheck(verify(fixture, missingWhy), 'page.item-copy');

  const duplicateFixture = fixtureStory();
  duplicateFixture.story.example.process = ['Повторяемый шаг', 'Повторяемый шаг'];
  const duplicateHtml = renderStoryPage(duplicateFixture.story);
  const duplicateRemoved = duplicateHtml.replace('<li data-story-field="example.process.0"><span>1</span>Повторяемый шаг</li>', '');
  assertCheck(verify(duplicateFixture, duplicateRemoved), 'page.copy');
  assertCheck(verify(duplicateFixture, duplicateRemoved), 'page.item-copy');

  const collisionFixture = fixtureStory();
  collisionFixture.story.install[0].label = 'Запуск';
  collisionFixture.story.install[0].command = 'Запуск расширенный';
  const collisionHtml = renderStoryPage(collisionFixture.story)
    .replace('<strong data-story-field="install.0.label">Запуск</strong>', '<strong data-story-field="install.0.label">Подмена</strong>');
  assertCheck(verify(collisionFixture, collisionHtml), 'page.copy');
  assertCheck(verify(collisionFixture, collisionHtml), 'page.item-copy');

  const withoutAudience = html.replace(
    `<div class="audience" data-story-audience>${fixture.story.audience}</div>`,
    '<div class="audience" data-story-audience></div>',
  );
  assert.notEqual(withoutAudience, html, 'audience removal must land');
  const audienceResult = verify(fixture, withoutAudience);
  assertCheck(audienceResult, 'page.item-copy');
  assert.match(audienceResult.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '',
    /audience: expected one exact value owned by hero:story/);
});

test('closed DOM independently transforms every allowed element and attribute surface', () => {
  const fixture = fixtureStory();
  const external = externalSource(fixture, 'dom-vendor', 'https://example.com/dom');
  fixture.evidence.sources.push(external);
  fixture.story.sources.push(external);
  const html = renderStoryPage(fixture.story);
  const elementRows = [
    'html', 'head', 'meta', 'title', 'style', 'body', 'div', 'nav', 'strong', 'a', 'main', 'section',
    'h1', 'h2', 'h3', 'p', 'ul', 'li', 'article', 'ol', 'span', 'pre', 'details', 'summary', 'code', 'footer',
  ];
  const classBearingTags = new Set([
    'div', 'nav', 'a', 'section', 'h1', 'h2', 'h3', 'p', 'ul', 'li', 'article', 'ol', 'span', 'details', 'footer',
  ]);
  assert.equal(elementRows.length, 26);
  for (const tag of elementRows) {
    const start = new RegExp(`<${tag}(?=[\\s>])`);
    assert.match(html, start, `canonical fixture must contain <${tag}>`);
    const opening = new RegExp(`<${tag}(?=[\\s>])[^>]*>`).exec(html)?.[0];
    assert.ok(opening, `canonical fixture must expose opening <${tag}>`);
    const classed = /\sclass(?:\s*=|\s|>)/.test(opening)
      ? html.replace(opening, opening.replace(/\sclass="([^"]*)"/, ' class="$1 probe"'))
      : html.replace(opening, opening.replace(`<${tag}`, `<${tag} class="probe"`));
    assert.notEqual(classed, html, `class mutation must land: ${tag}`);
    const classResult = verify(fixture, classed);
    assertCheck(classResult, 'page.html-subset');
    if (classBearingTags.has(tag)) {
      assert.match(classResult.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', /class inventory/);
    } else {
      assert.match(classResult.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '',
        new RegExp(`${tag}\\[class\\]: unsupported attribute`));
    }
    let mutated = html.replace(start, '<x-story-probe');
    if (tag !== 'meta') {
      const end = new RegExp(`</${tag}>`);
      assert.match(mutated, end, `canonical fixture must contain </${tag}>`);
      mutated = mutated.replace(end, '</x-story-probe>');
    }
    const result = verify(fixture, mutated);
    assert.notEqual(mutated, html, `element transform must land: ${tag}`);
    assertCheck(result, 'page.html-subset');
    assert.match(result.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', /x-story-probe: unsupported element/, `element allowlist must own failure: ${tag}`);
  }

  const attributeRows = [
    'class', 'data-story-field', 'lang', 'charset', 'name', 'content', 'data-story-schema', 'aria-label',
    'href', 'rel', 'id', 'data-story-section', 'data-story-item-id', 'data-visual-kind', 'data-story-audience',
    'data-flow-content', 'data-visual-section', 'data-source-content', 'data-claim-id', 'data-limit-category',
    'data-status', 'data-unknown-id', 'data-source-id', 'data-synthetic-label', 'data-synthetic-surface',
    'data-flow-step', 'open', 'data-source-disclosure', 'data-flow-summary', 'data-source-summary',
  ];
  assert.equal(attributeRows.length, 30);
  for (const name of attributeRows) {
    const attribute = new RegExp(`(\\s)${name}(?=[\\s=>])`);
    assert.match(html, attribute, `canonical fixture must contain ${name}`);
    const mutated = html.replace(attribute, '$1data-story-probe');
    assert.notEqual(mutated, html, `attribute transform must land: ${name}`);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.html-subset');
    assert.match(result.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', /\[data-story-probe\]: unsupported attribute/, `attribute allowlist must own failure: ${name}`);
  }

  assertCheck(verify(fixture, html.replace('</main>', '<x-story-probe></x-story-probe></main>')), 'page.html-subset');
  assertCheck(verify(fixture, html.replace('<main>', '<main data-story-probe="forbidden">')), 'page.html-subset');

});

test('head title and metadata remain semantically bound to the brief', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  assertCheck(verify(fixture, html), 'page.structure', true);
  const digest = sha256Text(canonicalJsonText(fixture.story));
  for (const [label, mutated] of [
    ['title', html.replace(`<title>${escapeHtml(fixture.story.hero.title)}</title>`, '<title>wrong title</title>')],
    ['charset', html.replace('<meta charset="utf-8">', '<meta charset="utf-16">')],
    ['viewport name', html.replace('name="viewport"', 'name="viewport-wrong"')],
    ['viewport content', html.replace('content="width=device-width,initial-scale=1"', 'content="width=320"')],
    ['digest name', html.replace('name="package-story-brief-sha256"', 'name="wrong-digest"')],
    ['digest content', html.replace(`content="${digest}"`, `content="${'0'.repeat(64)}"`)],
  ]) {
    assert.notEqual(mutated, html, `${label} mutation must land`);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.html-parse', true);
    assertCheck(result, 'page.structure');
    assert.match(result.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /head-only elements, html children, metadata, and title must match the exact brief-bound emission/);
  }

  const hiddenBodyTitle = html.replace('</main>', '<title>hidden unowned prose</title></main>');
  assert.notEqual(hiddenBodyTitle, html, 'body title mutation must land');
  const hiddenBodyTitleResult = verify(fixture, hiddenBodyTitle);
  assertCheck(hiddenBodyTitleResult, 'page.html-parse', true);
  assertCheck(hiddenBodyTitleResult, 'page.html-subset');
  assertCheck(hiddenBodyTitleResult, 'page.structure');
  assertCheck(hiddenBodyTitleResult, 'page.copy', true);
  assert.match(hiddenBodyTitleResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /head-only elements/);
  for (const markup of [
    '<meta name="body-meta" content="hidden">',
    '<style>body{color:red}</style>',
  ]) {
    const mutated = html.replace('</main>', `${markup}</main>`);
    assert.notEqual(mutated, html, 'head-only body mutation must land');
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.html-parse', true);
    assertCheck(result, 'page.html-subset');
    assertCheck(result, 'page.structure');
    assert.match(result.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /head-only elements/);
  }
});

test('authored fields stay in exact DOM reading order', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const title = /<h1 data-story-field="hero\.title">[\s\S]*?<\/h1>/.exec(html)?.[0];
  const subtitle = /<p data-story-field="hero\.subtitle">[\s\S]*?<\/p>/.exec(html)?.[0];
  assert.ok(title && subtitle, 'hero title and subtitle nodes required');
  const swapped = html.replace(title, '__TITLE__').replace(subtitle, title).replace('__TITLE__', subtitle);
  const swappedResult = verifyStorySemantics(fixture.story, swapped);
  for (const id of ['page.html-parse', 'page.html-subset', 'page.structure', 'page.copy', 'page.item-bindings']) {
    assertCheck(swappedResult, id, true);
  }
  assertCheck(swappedResult, 'page.item-copy');
  assert.match(swappedResult.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /authored field DOM order differs/);

  const ctaBody = /<p data-story-field="cta\.body">[\s\S]*?<\/p>/.exec(html)?.[0];
  const ctaLink = /<a class="button" href="#install" data-story-field="cta\.label">[\s\S]*?<\/a>/.exec(html)?.[0];
  assert.ok(ctaBody && ctaLink && html.includes(`${ctaBody}${ctaLink}`), 'adjacent CTA body and link required');
  const nested = html.replace(`${ctaBody}${ctaLink}`, ctaBody.replace('</p>', `${ctaLink}</p>`));
  const nestedResult = verifyStorySemantics(fixture.story, nested);
  assertCheck(nestedResult, 'page.html-parse', true);
  assertCheck(nestedResult, 'page.copy', true);
  assertCheck(nestedResult, 'page.item-copy');
  assert.match(nestedResult.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /authored fields cannot be nested/);

  const normalizedFixture = fixtureStory();
  normalizedFixture.story.hero.subtitle = 'alpha\rbravo\r\ncharlie';
  normalizedFixture.story.example.output.preview = '\nfirst\rsecond\r\nthird';
  normalizedFixture.story.visuals.example.direction = 'row one\r\nrow two';
  const normalizedHtml = renderStoryPage(normalizedFixture.story);
  const normalizedResult = verifyStorySemantics(normalizedFixture.story, normalizedHtml);
  for (const id of ['page.item-copy', 'page.copy', 'page.visuals']) assertCheck(normalizedResult, id, true);
  const normalizedMutant = normalizedHtml.replace('alpha\rbravo\r\ncharlie', 'alpha\rwrong\r\ncharlie');
  assert.notEqual(normalizedMutant, normalizedHtml, 'normalized authored-copy mutation must land');
  assertCheck(verifyStorySemantics(normalizedFixture.story, normalizedMutant), 'page.item-copy');
});

test('sections and story items stay in exact direct owners and brief order', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  assertCheck(verifyStorySemantics(fixture.story, html), 'page.structure', true);

  const mechanismId = fixture.story.mechanism[1].id;
  const mechanism = new RegExp(`<details class="flow-step" data-story-item-id="mechanism:${mechanismId}"[\\s\\S]*?</details>`).exec(html)?.[0];
  assert.ok(mechanism, 'mechanism block required');
  const relocated = html.replace(mechanism, '').replace('<div class="reuse-grid">', `<div class="reuse-grid">${mechanism}`);
  const relocatedResult = verifyStorySemantics(fixture.story, relocated);
  for (const id of ['page.item-bindings', 'page.copy', 'page.controls']) assertCheck(relocatedResult, id, true);
  assertCheck(relocatedResult, 'page.item-copy');
  assert.match(relocatedResult.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /authored field DOM order differs/);
  assertCheck(relocatedResult, 'page.structure');
  assert.match(relocatedResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', new RegExp(`mechanism:${mechanismId}: expected section mechanism, got reuse`));

  const firstId = fixture.story.mechanism[0].id;
  const secondId = fixture.story.mechanism[1].id;
  const first = new RegExp(`<details class="flow-step" data-story-item-id="mechanism:${firstId}"[\\s\\S]*?</details>`).exec(html)?.[0];
  const second = new RegExp(`<details class="flow-step" data-story-item-id="mechanism:${secondId}"[\\s\\S]*?</details>`).exec(html)?.[0];
  assert.ok(first && second, 'two mechanism blocks required');
  const swapped = html.replace(first, '__FIRST_ITEM__').replace(second, first).replace('__FIRST_ITEM__', second);
  const swappedResult = verifyStorySemantics(fixture.story, swapped);
  assertCheck(swappedResult, 'page.structure');
  assert.match(swappedResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /story-item order/);

  const reuse = /<section class="section wrap" data-story-section="reuse"[\s\S]*?<\/section>/.exec(html)?.[0];
  assert.ok(reuse, 'reuse section required');
  const withoutReuse = html.replace(reuse, '');
  const install = /<section id="install" class="section wrap" data-story-section="install"[\s\S]*?<\/section>/.exec(withoutReuse)?.[0];
  assert.ok(install, 'install section required');
  const nested = withoutReuse.replace(install, install.replace('</section>', `${reuse}</section>`));
  const nestedResult = verifyStorySemantics(fixture.story, nested);
  assertCheck(nestedResult, 'page.html-parse', true);
  assertCheck(nestedResult, 'page.structure');
  assertCheck(nestedResult, 'story.order');
  assert.match(nestedResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /main section tree/);
});

test('element inventory is exact and derived from brief cardinalities', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const baseline = verifyStorySemantics(fixture.story, html);
  assertCheck(baseline, 'page.html-subset', true);
  const count = (nodes) => Object.fromEntries([...nodes.reduce((map, node) => map.set(node.tagName, (map.get(node.tagName) ?? 0) + 1), new Map())].sort());
  assert.deepEqual(count(baseline.nodes), {
    a: 3, article: 8, body: 1, code: 4, details: 4, div: 31, footer: 1, h1: 1, h2: 7,
    h3: 7, head: 1, html: 1, li: 8, main: 1, meta: 3, nav: 1, ol: 1, p: 21, pre: 1,
    section: 8, span: 35, strong: 2, style: 1, summary: 4, title: 1, ul: 2,
  });

  const expanded = fixtureStory();
  expanded.story.install.push({ ...structuredClone(expanded.story.install[0]), label: 'Повторный запуск', command: 'npx health-note retry' });
  const expandedResult = verifyStorySemantics(expanded.story, renderStoryPage(expanded.story));
  assertCheck(expandedResult, 'page.html-subset', true);
  const expandedCounts = count(expandedResult.nodes);
  assert.equal(expandedCounts.article, 9);
  assert.equal(expandedCounts.div, 32);
  assert.equal(expandedCounts.strong, 3);
  assert.equal(expandedCounts.code, 5);
  assert.equal(expandedCounts.span, 36);

  const baseCounts = count(baseline.nodes);
  const dimensions = [
    ['claim', (story) => story.claims.push({ ...structuredClone(story.claims[0]), id: 'coverage-claim', text: 'Coverage claim' }), { li: 1, span: 3 }],
    ['process step', (story) => story.example.process.push('Coverage process step'), { li: 1, span: 1 }],
    ['mechanism', (story) => story.mechanism.push({ ...structuredClone(story.mechanism[0]), id: 'coverage-mechanism', label: 'Coverage mechanism' }), { details: 1, div: 2, p: 2, span: 3, summary: 1 }],
    ['install', (story) => story.install.push({ ...structuredClone(story.install[0]), label: 'Coverage install', command: 'npx coverage' }), { article: 1, code: 1, div: 1, span: 1, strong: 1 }],
    ['reuse', (story) => story.reuse.push({ ...structuredClone(story.reuse[0]), host: 'Coverage host', note: 'Coverage note', sourceIds: [] }), { article: 1, div: 1, h3: 1, p: 1, span: 1 }],
    ['local source', (story) => story.sources.push({ id: 'coverage-local', path: 'COVERAGE.md', sha256: '0'.repeat(64), lineRange: [1, 1] }), { code: 1, li: 1, span: 1 }],
    ['external source', (story) => story.sources.push({ id: 'coverage-external', url: 'https://example.com/coverage', checkedAt: '2026-08-25', receiptPath: 'evidence/coverage.md', sha256: '0'.repeat(64), lineRange: [1, 1] }), { a: 1, code: 1, li: 1 }],
    ['evidence reference', (story) => {
      const unused = story.sources.find((source) => !story.why.sourceIds.includes(source.id));
      assert.ok(unused, 'an unused source is required for the evidence delta');
      story.why.sourceIds.push(unused.id);
    }, { span: 1 }],
  ];
  for (const [label, mutate, expectedDelta] of dimensions) {
    const story = structuredClone(fixture.story);
    mutate(story);
    const result = verifyStorySemantics(story, renderStoryPage(story));
    assertCheck(result, 'page.html-subset', true);
    assertCheck(result, 'page.structure', true);
    const actual = count(result.nodes);
    const actualDelta = Object.fromEntries(Object.keys(actual).sort().flatMap((tag) => {
      const delta = actual[tag] - (baseCounts[tag] ?? 0);
      return delta === 0 ? [] : [[tag, delta]];
    }));
    assert.deepEqual(actualDelta, expectedDelta, label);
  }

  for (const tag of ['div', 'span', 'section', 'article', 'p', 'ul', 'ol', 'li', 'h3', 'strong', 'code', 'pre', 'summary', 'footer', 'main']) {
    const mutated = html.replace('</main>', `<${tag}></${tag}></main>`);
    assert.notEqual(mutated, html, `${tag} insertion must land`);
    const result = verifyStorySemantics(fixture.story, mutated);
    assertCheck(result, 'page.html-subset');
    assert.match(result.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', new RegExp(`element inventory surplus <${tag}> \\+1`));
  }
  const insideSection = html.replace('</h1>', '</h1><div></div>');
  const insideResult = verifyStorySemantics(fixture.story, insideSection);
  assertCheck(insideResult, 'page.html-subset');
  assert.match(insideResult.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', /element inventory surplus <div> \+1/);

  for (const [label, mutated] of [
    ['extra allowed meta attributes', html.replace('<meta charset="utf-8">', '<meta charset="utf-8" name="referrer" content="unsafe-url">')],
    ['extra allowed local-anchor rel', html.replace('href="#example" data-story-field="hero.cta"', 'href="#example" rel="noreferrer" data-story-field="hero.cta"')],
  ]) {
    assert.notEqual(mutated, html, `${label} mutation must land`);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.html-parse', true);
    assertCheck(result, 'page.html-subset');
    assertCheck(result, 'page.structure');
    assert.match(result.checks.find((check) => check.id === 'page.html-subset')?.detail ?? '', /attribute inventory/);
    assert.match(result.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /attribute inventory/);
  }
});

test('class id category and initial disclosure state stay on exact owners', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const classMutation = html.replace('class="section-title" data-story-field="why.title"', 'class="section-title signal" data-story-field="why.title"');
  const classResult = verifyStorySemantics(fixture.story, classMutation);
  assertCheck(classResult, 'page.item-copy', true);
  assertCheck(classResult, 'page.copy', true);
  assertCheck(classResult, 'page.structure');
  assert.match(classResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /class inventory/);

  const swappedIds = html.replace('id="example"', 'id="__SWAP__"').replace('id="install"', 'id="example"').replace('id="__SWAP__"', 'id="install"');
  const idResult = verifyStorySemantics(fixture.story, swappedIds);
  assertCheck(idResult, 'page.links', true);
  assertCheck(idResult, 'page.structure');
  assert.match(idResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /unexpected id owner/);

  const processId = html.replace('<li data-story-field="example.process.0">', '<li id="unexpected-process" data-story-field="example.process.0">');
  const processIdResult = verifyStorySemantics(fixture.story, processId);
  assertCheck(processIdResult, 'page.structure');
  assert.match(processIdResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /unexpected id owner|id inventory/);

  const [first, second] = fixture.story.mechanism;
  const openMoved = html.replace(`data-flow-step="${first.id}" open`, `data-flow-step="${first.id}"`)
    .replace(`data-flow-step="${second.id}"`, `data-flow-step="${second.id}" open`);
  const openResult = verifyStorySemantics(fixture.story, openMoved);
  assertCheck(openResult, 'page.controls');
  assert.match(openResult.checks.find((check) => check.id === 'page.controls')?.detail ?? '', /initial open state/);
  const sourcesOpenResult = verifyStorySemantics(fixture.story, html.replace('data-source-disclosure="sources"', 'data-source-disclosure="sources" open'));
  assertCheck(sourcesOpenResult, 'page.controls');

  const categories = html.replace('data-limit-category="safety"', 'data-limit-category="__SWAP__"')
    .replace('data-limit-category="cost"', 'data-limit-category="safety"')
    .replace('data-limit-category="__SWAP__"', 'data-limit-category="cost"');
  const categoryResult = verifyStorySemantics(fixture.story, categories);
  assertCheck(categoryResult, 'page.structure');
  assert.match(categoryResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /exact data-limit-category owner required/);
});

test('brief digest is stable across object key insertion order', () => {
  const fixture = fixtureStory();
  const canonical = renderStoryPage(fixture.story);
  const reorder = (value) => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)]));
    }
    return value;
  };
  const reorderedStory = reorder(fixture.story);
  assert.notEqual(JSON.stringify(reorderedStory), JSON.stringify(fixture.story));
  assert.equal(canonicalJsonText(reorderedStory), canonicalJsonText(fixture.story));
  assert.equal(renderStoryPage(reorderedStory), canonical);
  const result = verify({ ...fixture, story: reorderedStory }, canonical);
  assertCheck(result, 'brief.digest', true);
  assertCheck(result, 'page.structure', true);
  assertCheck(result, 'page.canonical', true);
});

test('story order verdict is independent from unrelated subset failures', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mutated = html.replace('<main>', '<main data-story-probe="forbidden">');
  const result = verify(fixture, mutated);
  assertCheck(result, 'page.html-subset');
  assertCheck(result, 'story.order', true);
});

test('external asset inventory covers HTML resource surfaces and changed stylesheet bytes', () => {
  const fixture = fixtureStory();
  const external = externalSource(fixture, 'vendor-doc', 'https://example.com/docs');
  fixture.evidence.sources.push(external);
  fixture.story.sources.push(external);
  fixture.story.claims.push({ id: 'vendor-note', text: 'Vendor documentation describes an optional mode.', status: 'external', sourceIds: [external.id] });
  const html = renderStoryPage(fixture.story);
  assertCheck(verify(fixture, html), 'page.external-assets', true);

  const red = [
    '<script src="https://evil.invalid/a.js"></script>',
    '<link href="https://evil.invalid/a.css" rel="stylesheet">',
    '<link imagesrcset="local.png 1x, https://evil.invalid/a.png 2x">',
    '<img src="https://evil.invalid/a.png">',
    '<img srcset="local.png 1x, https://evil.invalid/a.png 2x">',
    '<video poster="https://evil.invalid/poster.png"></video>',
    '<video poster="//evil.invalid/poster.png"></video>',
    '<input src="https://evil.invalid/button.png" TYPE="IMAGE">',
    '<video poster="h&#x74;tps://evil.invalid/poster.png"></video>',
    '<video poster="&#47;&#47;evil.invalid/poster.png"></video>',
    '<video poster="https:\n//evil.invalid/poster.png"></video>',
    '<base href="https://evil.invalid/base/">',
    '<svg><image href="https://evil.invalid/a.png"></image></svg>',
    '<svg><image xlink:href="https://evil.invalid/a.png"></image></svg>',
    '<svg><use xlink:href="https://evil.invalid/a.svg#x"></use></svg>',
    '<audio src="https://evil.invalid/a.mp3"></audio>',
    '<source src="https://evil.invalid/a.png">',
    '<source srcset="local.png 1x, https://evil.invalid/a.png 2x">',
    '<track src="https://evil.invalid/a.vtt">',
    '<embed src="https://evil.invalid/a.pdf">',
    '<object data="https://evil.invalid/a.pdf"></object>',
    '<video src="https://evil.invalid/a.mp4"></video>',
    '<iframe src="https://evil.invalid/frame"></iframe>',
    '<applet code="https://evil.invalid/app.class"></applet>',
    '<svg><feImage xlink:href="https://evil.invalid/filter.png"></feImage></svg>',
    '<video poster="h&Tab;ttps://evil.invalid/a.png"></video>',
    '<video poster="&sol;&sol;evil.invalid/a.png"></video>',
    '<img src="https://evil.invalid/first.png" src="assets/second.png">',
    String.raw`<img src="\\evil.invalid/a.png">`,
    String.raw`<img src="/\evil.invalid/a.png">`,
  ];
  for (const markup of red) {
    const result = verify(fixture, html.replace('</main>', `${markup}</main>`));
    const externalCheck = result.checks.find((check) => check.id === 'page.external-assets');
    assert.equal(externalCheck?.pass, false, `${markup}\n${result.failures.join('\n')}`);
  }
  const manifestSurface = verify(fixture, html.replace('<html lang="ru">', '<html lang="ru" manifest="https://evil.invalid/app.manifest">'));
  assertCheck(manifestSurface, 'page.external-assets');
  const frameSurface = verify(fixture, html
    .replace('<body data-story-schema="package-story-brief/1">', '<frameset><frame src="https://evil.invalid/frame">')
    .replace('</body>', '</frameset>'));
  assertCheck(frameSurface, 'page.external-assets');
  const changedCss = [
    'url(https://evil.invalid/a.png)',
    '@import "https://evil.invalid/a.css"',
    'image-set("https://evil.invalid/a.png" 1x)',
    'image-set(url(//evil.invalid/a.png) 2x)',
    '-webkit-image-set("https://evil.invalid/a.png" 1x)',
    '-webkit-image-set(url(//evil.invalid/a.png) 2x)',
    'image-set("local.png" 1x,"https://evil.invalid/a.png" 2x)',
    'image-set("https://evil.invalid/a.png" 1x',
    String.raw`url("\68 ttps://evil.invalid/a.png")`,
    String.raw`image-set("\68 ttps://evil.invalid/a.png" 1x)`,
    String.raw`@\69 mport url(https://evil.invalid/a.png)`,
    String.raw`u\72l(https://evil.invalid/a.png)`,
  ];
  for (const value of changedCss) {
    const result = verify(fixture, html.replace('</style>', `.probe{background-image:${value}}</style>`));
    assertCheck(result, 'page.style-authority');
    assertCheck(result, 'page.external-assets');
    assert.match(result.checks.find((check) => check.id === 'page.external-assets')?.detail ?? '', /style source is not approved/);
  }
  const benignStyleChange = verify(fixture, html.replace('</style>', '.benign{color:inherit}</style>'));
  assertCheck(benignStyleChange, 'page.style-authority');
  assertCheck(benignStyleChange, 'page.external-assets');
  assertCheck(benignStyleChange, 'page.unsafe-html', true);
  assert.match(benignStyleChange.checks.find((check) => check.id === 'page.external-assets')?.detail ?? '', /style source is not approved/);

  const forbiddenEvenWhenRelative = [
    '<script src="assets/a.js"></script>',
    '<link href="assets/a.css" rel="stylesheet" imagesrcset="assets/a.png 1x, assets/b.png 2x">',
    '<img src="assets/a.png" srcset="assets/a.png 1x, assets/b.png 2x">',
    '<video poster="./poster.png"></video>',
    '<input TYPE="IMAGE" src="assets/button.png">',
    '<base href="./">',
    '<svg><image href="assets/a.png"></image><use xlink:href="assets/a.svg#x"></use></svg>',
    '<audio src="assets/a.mp3"></audio>',
    '<source src="assets/a.png" srcset="assets/a.png 1x, assets/b.png 2x">',
    '<track src="assets/a.vtt">',
    '<embed src="assets/a.pdf">',
    '<object data="assets/a.pdf"></object>',
    '<video src="assets/a.mp4"></video>',
    '<iframe src="assets/frame.html"></iframe>',
    '<img src="assets/first.png" src="https://evil.invalid/ignored-duplicate.png">',
  ];
  for (const markup of forbiddenEvenWhenRelative) {
    const result = verify(fixture, html.replace('</main>', `${markup}</main>`));
    assertCheck(result, 'page.html-subset');
    assertCheck(result, 'page.external-assets');
  }
  for (const value of ['url(./a.png)', '@import "./a.css"', 'image-set("a.png" 1x)', '-webkit-image-set(url(./a.png) 2x)']) {
    assertCheck(verify(fixture, html.replace('</style>', `.probe{background-image:${value}}</style>`)), 'page.style-authority');
  }
  const inertCss = '/* image-set("https://evil.invalid/a.png" 1x) */.probe::before{content:"url(https://evil.invalid/a.png)"}@important inert-token;';
  assertCheck(verify(fixture, html.replace('</style>', `${inertCss}</style>`)), 'page.style-authority');

  for (const markup of [
    '<input src="j&#x61;vascript:alert(1)" TYPE="IMAGE">',
    '<video poster="data:text/plain,bad"></video>',
    '<img srcset="assets/a.png 1x, data:image/png;base64,x 2x">',
    '<link imagesrcset="assets/a.png 1x, javascript:alert(1) 2x">',
  ]) {
    const result = verify(fixture, html.replace('</main>', `${markup}</main>`));
    assertCheck(result, 'page.javascript');
    assertCheck(result, 'page.unsafe-html');
  }
});

test('equals-started attribute names cannot hide the first real resource attribute', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const injected = '<img =src=assets/local.png src=https://evil.invalid/x.png>';
  assertCheck(verify(fixture, html.replace('</main>', `${injected}</main>`)), 'page.external-assets');
});

test('slashless special schemes and legacy image surfaces fail closed', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  for (const injected of [
    '<img src=https:evil.invalid/x.png>',
    '<image src=https://evil.invalid/x.png>',
    '<div background=https://evil.invalid/x.png></div>',
  ]) {
    assertCheck(verify(fixture, html.replace('</main>', `${injected}</main>`)), 'page.external-assets');
  }
});

test('canonical renderer bytes are additive tamper evidence', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  assertCheck(verify(fixture, html), 'page.canonical', true);
  for (const injected of [
    '<p>otherwise parser-valid tamper</p>',
    '<img =src=assets/local.png src=https://evil.invalid/x.png>',
    '<img src=https:evil.invalid/x.png>',
    '<div background=https://evil.invalid/x.png></div>',
  ]) {
    assertCheck(verify(fixture, html.replace('</main>', `${injected}</main>`)), 'page.canonical');
  }
});

test('semantic authority rejects a renderer regression even when page canonical is green', async () => {
  const isolated = temp('story-renderer-regression');
  const isolatedScripts = join(isolated, 'scripts');
  const isolatedVendor = join(isolated, 'vendor');
  mkdirSync(isolatedScripts, { recursive: true });
  mkdirSync(isolatedVendor, { recursive: true });
  for (const name of [
    'extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs',
    'verify-story-semantics.mjs', 'verify-story-page.mjs',
  ]) writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));

  const rendererPath = join(isolatedScripts, 'render-story-page.mjs');
  const rendererSource = readFileSync(rendererPath, 'utf8');
  const regressedRenderer = rendererSource.replace('data-story-field="hero.title"', 'data-story-field="hero.subtitle"');
  assert.notEqual(regressedRenderer, rendererSource, 'renderer regression mutation must land');
  writeFileSync(rendererPath, regressedRenderer);
  const wrapperPath = join(isolatedScripts, 'verify-story-page.mjs');
  writeFileSync(wrapperPath, authorizePreImportProjection(readFileSync(wrapperPath, 'utf8'), isolated));

  const renderer = await import(`${pathToFileURL(rendererPath).href}?renderer-regression=1`);
  const verifier = await import(`${pathToFileURL(wrapperPath).href}?renderer-regression=1`);
  const fixture = fixtureStory();
  const html = renderer.renderStoryPage(fixture.story);
  const result = verifier.verifyStoryPage(fixture.story, html, {
    evidence: fixture.evidence,
    packageRoot: fixture.packageRoot,
  });
  assertCheck(result, 'page.canonical', true);
  assertCheck(result, 'page.copy', true);
  assertCheck(result, 'page.item-copy');
  assert.match(result.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /hero\.title: expected one field, got 0; hero\.subtitle: expected one field, got 2/);
});

test('style raw text cannot mint element nodes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const probe = `.probe::before{content:"<details data-flow-step='phantom'>"}\n/* <template data-story-item-id="phantom"> */\n.probe-copy::before{content:"<span data-source-id='phantom'>"}`;
  const tagShaped = html.replace('</style>', `${probe}</style>`);
  const result = verify(fixture, tagShaped);
  assertCheck(result, 'page.structure', true);
  assertCheck(result, 'page.controls', true);
  assertCheck(result, 'page.item-bindings', true);

  const mixedCaseClose = html.replace('</style>', '</StYlE>');
  assertCheck(verify(fixture, mixedCaseClose), 'page.structure', true);

  const missingClose = html.replace('</style>', '');
  let missingResult;
  assert.doesNotThrow(() => { missingResult = verify(fixture, missingClose); });
  assertCheck(missingResult, 'page.structure');
  assert.match(missingResult.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /unclosed <style>/i);

  const externalCss = html.replace('</style>', '.probe{background-image:image-set("https://evil.invalid/a.png" 1x)}</style>');
  assertCheck(verify(fixture, externalCss), 'page.structure', true);
  assertCheck(verify(fixture, externalCss), 'page.external-assets');

  const claim = fixture.story.claims[0];
  const sourceId = claim.sourceIds[0];
  const styleBlock = /<style>[\s\S]*?<\/style>/i.exec(html)?.[0] ?? '';
  const itemOpen = `<li data-story-item-id="claim:${claim.id}" data-claim-id="${claim.id}">`;
  const citation = `<span class="evidence" data-source-id="${sourceId}">${sourceId}</span>`;
  const contextualStyle = styleBlock.replace('</style>', `.owned-decoy::before{content:"<span data-source-id='${sourceId}'>"}</style>`);
  const contextualDecoy = html.replace(styleBlock, '').replace(itemOpen, `${itemOpen}${contextualStyle}`).replace(citation, '');
  const contextualResult = verify(fixture, contextualDecoy);
  assertCheck(contextualResult, 'page.item-bindings');
  assert.match(contextualResult.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /hidden by <style>/i);
});

test('HTML quote semantics cannot hide an external resource tag', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const injected = String.raw`<div data-x="foo\"><img src=https://evil.invalid/x.png><x a=">"></div>`;
  const result = verify(fixture, html.replace('</main>', `${injected}</main>`));
  assert.equal(result.pass, false);
  assertCheck(result, 'page.external-assets');
});

test('attribute tokenization rejects decoys and unquoted apostrophe swallowing', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  for (const markup of [
    '<img title=" src=assets/local.png" src="https://evil.invalid/a.png">',
    '<input title=" type=text" type="image" src="https://evil.invalid/a.png">',
    '<a title=" href=#safe" href="j&NewLine;avascript:alert(1)">active</a>',
    String.raw`<div data-x=foo'><img src=https://evil.invalid/x.png><x a='></div>`,
    '<img "src=assets/local.png" src="https://evil.invalid/a.png">',
    '<a "href=#safe" href="javascript:alert(1)">active</a>',
    '<div ="><img src=https://evil.invalid/a.png>">x</div>',
  ]) {
    const result = verify(fixture, html.replace('</main>', `${markup}</main>`));
    assert.equal(result.pass, false);
    if (markup.includes('<a ')) {
      assertCheck(result, 'page.javascript');
      assertCheck(result, 'page.unsafe-html');
    } else assertCheck(result, 'page.external-assets');
  }
});

test('HTML style self-closing syntax cannot escape raw-text handling', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const closed = html.replace('<style>', '<style/>');
  assertCheck(verify(fixture, closed), 'page.structure', true);
  const unclosed = closed.replace('</style>', '');
  const result = verify(fixture, unclosed);
  assertCheck(result, 'page.structure');
  assert.match(result.checks.find((check) => check.id === 'page.structure')?.detail ?? '', /unclosed <style>/i);
});

test('event handlers are recognized through parsed attributes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const result = verify(fixture, html.replace('</main>', '<div/onclick="alert(1)">bad</div></main>'));
  assertCheck(result, 'page.unsafe-html');
});

test('bogus comments cannot satisfy visible authored copy', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const subtitle = fixture.story.hero.subtitle;
  const mutated = html.replace(`<p data-story-field="hero.subtitle">${subtitle}</p>`, `<p data-story-field="hero.subtitle"></p></1x ${subtitle}>`);
  assert.notEqual(mutated, html, 'bogus-comment mutation must land');
  assertCheck(verify(fixture, mutated), 'page.copy');
});

test('inline style ban uses parsed attributes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const result = verify(fixture, html.replace('</main>', '<div/style="background-image:url(https://evil.invalid/a.png)">bad</div></main>'));
  assertCheck(result, 'page.inline-style');
});

test('RCDATA cannot satisfy rendered evidence ownership', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const claim = fixture.story.claims[0];
  const sourceId = claim.sourceIds[0];
  const citation = `<span class="evidence" data-source-id="${sourceId}">${sourceId}</span>`;
  const itemOpen = `<li data-story-item-id="claim:${claim.id}" data-claim-id="${claim.id}">`;
  const mutated = html.replace(citation, '').replace(itemOpen, `${itemOpen}<textarea><span data-source-id="${sourceId}">${sourceId}</span></textarea>`);
  assertCheck(verify(fixture, mutated), 'page.item-bindings');
});

test('browser-invalid spaced tag openers remain inert text', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mutated = html.replace('</main>', '<p>< details data-flow-step="phantom">x</ details></p></main>');
  const result = verify(fixture, mutated);
  assertCheck(result, 'page.html-parse');
  assertCheck(result, 'page.structure');
  assertCheck(result, 'page.controls', true);
});

test('nested-document and refresh navigation surfaces fail closed', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  for (const markup of [
    '<iframe srcdoc="&lt;img src=https://evil.invalid/x.png&gt;"></iframe>',
    '<meta http-equiv="refresh" content="0;url=https://evil.invalid/x">',
  ]) {
    const result = verify(fixture, html.replace('</main>', `${markup}</main>`));
    assertCheck(result, 'page.external-assets');
  }
});

test('semantic link authority rejects active and non-HTTPS URI anchors', () => {
  const fixture = fixtureStory();
  const source = externalSource(fixture, 'uri-source', 'https://example.com/evidence');
  fixture.evidence.sources.push(source);
  fixture.story.sources.push(source);
  const html = renderStoryPage(fixture.story);
  assertCheck(verify(fixture, html), 'page.links', true);
  assertCheck(verify(fixture, html), 'page.javascript', true);
  for (const href of [
    'javascript:alert(1)',
    'data:text/html,bad',
    'vbscript:msgbox(1)',
  ]) {
    const mutated = html.replace('https://example.com/evidence', href);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.links');
    assertCheck(result, 'page.javascript');
  }
  for (const href of [
    'http://example.com/evidence',
    '//example.com/evidence',
    'mailto:test@example.com',
  ]) {
    const mutated = html.replace('https://example.com/evidence', href);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.links');
    assertCheck(result, 'page.javascript', true);
  }
  for (const mutated of [
    html.replace('rel="noreferrer"', 'rel="wrong"'),
    html.replace('href="#example"', 'href="#missing-safe-fragment"'),
  ]) {
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.links');
    assertCheck(result, 'page.javascript', true);
  }

  const duplicateId = html.replace('</main>', '<span id="example"></span></main>');
  assert.notEqual(duplicateId, html, 'duplicate fragment target mutation must land');
  const duplicateIdResult = verify(fixture, duplicateId);
  assertCheck(duplicateIdResult, 'page.links');
  assert.match(duplicateIdResult.checks.find((check) => check.id === 'page.links')?.detail ?? '', /duplicate DOM id/);

  const extraEmptyAnchor = html.replace('</main>', '<a href="#example"></a></main>');
  assert.notEqual(extraEmptyAnchor, html, 'extra empty anchor mutation must land');
  const extraEmptyAnchorResult = verify(fixture, extraEmptyAnchor);
  assertCheck(extraEmptyAnchorResult, 'page.html-subset');
  assertCheck(extraEmptyAnchorResult, 'page.copy', true);
  assertCheck(extraEmptyAnchorResult, 'page.links');
  assert.match(extraEmptyAnchorResult.checks.find((check) => check.id === 'page.links')?.detail ?? '', /unexpected anchor outside the exact emitted inventory/);

  const heroAction = `<a class="button" href="#example" data-story-field="hero.cta">${escapeHtml(fixture.story.hero.cta)}</a>`;
  const aliasedRole = html.replace(heroAction,
    `<strong data-story-field="hero.cta">${escapeHtml(fixture.story.hero.cta)}</strong><a href="#example"></a>`);
  assert.notEqual(aliasedRole, html, 'anchor role substitution must land');
  const aliasedRoleResult = verify(fixture, aliasedRole);
  assertCheck(aliasedRoleResult, 'page.html-subset');
  assertCheck(aliasedRoleResult, 'page.item-copy', true);
  assertCheck(aliasedRoleResult, 'page.copy', true);
  assertCheck(aliasedRoleResult, 'page.links');
  assert.match(aliasedRoleResult.checks.find((check) => check.id === 'page.links')?.detail ?? '', /hero action: expected one exact anchor/);
});

test('authored copy cannot borrow renderer chrome', () => {
  for (const value of ['подтверждено', 'Как это работает']) {
    const fixture = fixtureStory();
    fixture.story.claims[0].text = value;
    const html = renderStoryPage(fixture.story);
    const mutated = html.replace(
      `<span data-story-field="claims.purpose.text">${value}</span>`,
      '<span data-story-field="claims.purpose.text"></span>',
    );
    assert.notEqual(mutated, html, `authored claim removal must land for ${value}`);
    const result = verify(fixture, mutated);
    assertCheck(result, 'page.copy');
    assertCheck(result, 'page.item-copy');
  }

  const fixture = fixtureStory();
  fixture.story.audience = fixture.story.hero.title;
  const html = renderStoryPage(fixture.story);
  const withoutAudience = html.replace(
    `<div class="audience" data-story-audience>${fixture.story.audience}</div>`,
    '<div class="audience" data-story-audience></div>',
  );
  assert.notEqual(withoutAudience, html, 'audience removal must land');
  const audienceResult = verify(fixture, withoutAudience);
  assertCheck(audienceResult, 'page.copy');
  assertCheck(audienceResult, 'page.item-copy');
  assert.match(audienceResult.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /audience: expected one exact value owned by hero:story/);

  const extraText = verify(fixture, html.replace('</main>', '<p>unexpected visible prose</p></main>'));
  assertCheck(extraText, 'page.copy');
  assert.match(extraText.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /unexpected visible prose/);

  const nonBreakingSpace = verify(fixture, html.replace('</main>', '<p>\u00a0</p></main>'));
  assertCheck(nonBreakingSpace, 'page.copy');
  assert.match(nonBreakingSpace.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /\\u00a0| /);

  const duplicateFieldOwner = verify(fixture, html.replace('</main>', '<section data-story-item-id="hero:story"></section></main>'));
  assertCheck(duplicateFieldOwner, 'page.item-copy');
  assert.match(duplicateFieldOwner.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', /hero:story: expected one field owner, got 2/);

  const fallbackEyebrowFixture = fixtureStory();
  delete fallbackEyebrowFixture.story.hero.eyebrow;
  const fallbackEyebrowHtml = renderStoryPage(fallbackEyebrowFixture.story);
  assert.match(fallbackEyebrowHtml, new RegExp(`<div class="eyebrow">${fallbackEyebrowFixture.story.package.name}</div>`));
  assertCheck(verify(fallbackEyebrowFixture, fallbackEyebrowHtml), 'page.copy', true);

  for (const [label, injection] of [
    ['class token', '<p class="signal">class-token escape</p>'],
    ['navigation ancestor', '<nav class="nav">navigation escape</nav>'],
    ['status ancestor', '<span data-status="evidenced">status escape</span>'],
  ]) {
    const escaped = verify(fixture, html.replace('</main>', `${injection}</main>`));
    assertCheck(escaped, 'page.copy');
    assert.match(escaped.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /escape/, label);
  }
});

test('synthetic labels require exact language-matched direct text', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mutated = html.replace(
    '>Вход · синтетические данные</h3>',
    '>Вход · префикс синтетические данные суффикс</h3>',
  );
  assert.notEqual(mutated, html, 'synthetic substring mutation must land');
  const result = verify(fixture, mutated);
  assertCheck(result, 'page.synthetic-label');
  assert.match(result.checks.find((check) => check.id === 'page.synthetic-label')?.detail ?? '', /inventory differs/);
});

test('renderer chrome multiset is cardinality-total for eyebrow package-name collisions', () => {
  const providedFixture = fixtureStory();
  const packageName = providedFixture.story.package.name;
  providedFixture.story.hero.eyebrow = packageName;
  const providedHtml = renderStoryPage(providedFixture.story);
  assertCheck(verify(providedFixture, providedHtml), 'page.copy', true);
  const duplicatePackageName = providedHtml.replace(
    `<div class="eyebrow" data-story-field="hero.eyebrow">${packageName}</div>`,
    `<div class="eyebrow" data-story-field="hero.eyebrow">${packageName}<span>${packageName}</span></div>`,
  );
  assert.notEqual(duplicatePackageName, providedHtml, 'provided-eyebrow cardinality mutation must land');
  const duplicateResult = verify(providedFixture, duplicatePackageName);
  assertCheck(duplicateResult, 'page.html-subset');
  assertCheck(duplicateResult, 'page.item-copy', true);
  assertCheck(duplicateResult, 'page.copy');
  assert.match(duplicateResult.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /unexpected visible text occurrence x1/);

  const absentFixture = fixtureStory();
  delete absentFixture.story.hero.eyebrow;
  const absentHtml = renderStoryPage(absentFixture.story);
  assert.match(absentHtml, new RegExp(`<strong>${absentFixture.story.package.name}</strong>`));
  const missingFallback = absentHtml.replace(
    `<div class="eyebrow">${absentFixture.story.package.name}</div>`,
    '<div class="eyebrow"></div>',
  );
  assert.notEqual(missingFallback, absentHtml, 'absent-eyebrow fallback removal must land');
  const missingResult = verify(absentFixture, missingFallback);
  assertCheck(missingResult, 'page.html-subset', true);
  assertCheck(missingResult, 'page.item-copy', true);
  assertCheck(missingResult, 'page.copy');
  assert.match(missingResult.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /exact visible occurrence missing/);
});

test('status source and renderer chrome text stay in exact structural owners', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const replaceAfter = (value, marker, from, to) => {
    const markerAt = value.indexOf(marker);
    assert.ok(markerAt >= 0, `marker must exist: ${marker}`);
    const valueAt = value.indexOf(from, markerAt + marker.length);
    assert.ok(valueAt >= 0, `owned value must exist after ${marker}: ${from}`);
    return `${value.slice(0, valueAt)}${to}${value.slice(valueAt + from.length)}`;
  };
  const packageSource = fixture.story.claims[0].sourceIds[0];
  const readmeSource = fixture.story.mechanism[0].sourceIds[0];
  let swappedSources = replaceAfter(html, 'data-story-item-id="mechanism:input"', `>${readmeSource}</span>`, `>${packageSource}</span>`);
  swappedSources = replaceAfter(swappedSources, 'data-story-item-id="mechanism:artifact"', `>${packageSource}</span>`, `>${readmeSource}</span>`);
  const sourceResult = verify(fixture, swappedSources);
  assertCheck(sourceResult, 'source.closure', true);
  assertCheck(sourceResult, 'page.item-bindings');
  assert.match(sourceResult.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /source marker text differs/);

  let swappedStatuses = replaceAfter(html, 'data-story-item-id="reuse:0"', '>не подтверждено</span>', '>подтверждено</span>');
  swappedStatuses = replaceAfter(swappedStatuses, 'data-story-item-id="reuse:1"', '>подтверждено</span>', '>не подтверждено</span>');
  const statusResult = verify(fixture, swappedStatuses);
  assertCheck(statusResult, 'page.item-bindings');
  assert.match(statusResult.checks.find((check) => check.id === 'page.item-bindings')?.detail ?? '', /matching visible status text/);

  const mechanismTitle = CHROME_COPY.ru.mechanismTitle;
  const installTitle = CHROME_COPY.ru.installTitle;
  const swappedChrome = html.replace(mechanismTitle, '__CHROME_SWAP__').replace(installTitle, mechanismTitle).replace('__CHROME_SWAP__', installTitle);
  const chromeResult = verify(fixture, swappedChrome);
  assertCheck(chromeResult, 'page.copy');
  assert.match(chromeResult.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /chrome\.(mechanism|install)\.title/);

  const navigation = /<nav class="nav wrap"[\s\S]*?<\/nav>/.exec(html)?.[0] ?? '';
  assert.ok(navigation, 'canonical navigation must exist');
  const movedNavigation = html.replace(navigation, '<nav></nav>').replace('<main>', `<main>${navigation}`);
  assert.notEqual(movedNavigation, html, 'navigation ownership mutation must land');
  const navigationResult = verify(fixture, movedNavigation);
  assertCheck(navigationResult, 'page.html-subset');
  assertCheck(navigationResult, 'page.copy');
  assert.match(navigationResult.checks.find((check) => check.id === 'page.copy')?.detail ?? '', /chrome\.nav: wrong direct parent/);
});

test('visual direction and kind stay in their exact parse5 section owner', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const example = `<p class="visual-direction" data-visual-section="example">${fixture.story.visuals.example.direction}</p>`;
  const why = `<p class="visual-direction" data-visual-section="why">${fixture.story.visuals.why.direction}</p>`;
  const relocated = html.replace(example, '__VISUAL_SWAP__').replace(why, example).replace('__VISUAL_SWAP__', why);
  assert.notEqual(relocated, html, 'visual-owner relocation must land');
  const result = verify(fixture, relocated);
  assertCheck(result, 'page.copy', true);
  assertCheck(result, 'page.visuals');
  assert.match(result.checks.find((check) => check.id === 'page.visuals')?.detail ?? '', /section-owned visual direction differs/);
});

test('claim identifiers stay paired with exact story owners', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const swapped = html
    .replace('data-story-item-id="claim:purpose" data-claim-id="purpose"', 'data-story-item-id="claim:purpose" data-claim-id="__CLAIM_SWAP__"')
    .replace('data-story-item-id="claim:version" data-claim-id="version"', 'data-story-item-id="claim:version" data-claim-id="purpose"')
    .replace('data-claim-id="__CLAIM_SWAP__"', 'data-claim-id="version"');
  assert.notEqual(swapped, html, 'claim-id owner swap must land');
  const result = verify(fixture, swapped);
  assertCheck(result, 'page.item-copy', true);
  assertCheck(result, 'page.item-bindings', true);
  assertCheck(result, 'page.copy', true);
  assertCheck(result, 'page.claims');
  assert.match(result.checks.find((check) => check.id === 'page.claims')?.detail ?? '', /claim ids\/owners differ/);
});

test('mutation registry binds seventy-four live guards to named TAP owners and both execution lanes', () => {
  const registry = JSON.parse(readFileSync(join(root, 'test', 'mutation-registry.json'), 'utf8'));
  const mutationRunnerSource = readFileSync(join(root, 'test', 'run-mutation-suite.mjs'), 'utf8');
  const ids = registry.entries.map((entry) => entry.id);
  assert.equal(ids.length, 74);
  assert.equal(new Set(ids).size, 74);
  assert.equal(Object.keys(registry.owningTests).length, 74);
  assert.deepEqual(Object.keys(registry.owningTests).sort(), [...ids].sort());
  for (const owner of Object.values(registry.owningTests)) {
    assert.equal(typeof owner, 'string');
    assert.ok(readFileSync(join(root, 'test', 'story-page.test.mjs'), 'utf8').includes(`test('${owner}'`), owner);
  }
  assert.equal(registry.testCommand, 'node test/run-mutation-suite.mjs');
  for (const path of [
    'scripts/verify-story-page.mjs',
    'scripts/verify-story-semantics.mjs',
    'scripts/verify-story-page-browser.mjs',
    'scripts/story-schema.mjs',
    'vendor/parse5.bundle.mjs',
    'scripts/extract-package-evidence.mjs',
    'scripts/render-story-page.mjs',
  ]) {
    assert.ok(mutationRunnerSource.includes(sha256Text(readFileSync(join(root, 'package-story-page', path), 'utf8'))),
      `the mutation runner must classify current ${path} bytes`);
  }
  assert.match(mutationRunnerSource, /mutation runner refuses to write outside a gate-owned scratch repository/);
  assert.match(mutationRunnerSource, /const liveBrowserLanes = mutatedPaths\.length === 0 \? \[true, false\] : \[browserMutated\];/,
    'every clean baseline must execute both live-Firefox and unit-only lanes');
  assert.match(mutationRunnerSource, /if \(liveBrowser\)[\s\S]*delete childEnv\.PACKAGE_STORY_SKIP_BROWSER/,
    'live lanes must remove the skip');
  assert.match(mutationRunnerSource, /const testPattern = `\^\(\?:\$\{names\.map\(escapeRegExp\)\.join\('\|'\)\}\)\$`/,
    'selected test names must be escaped and fully anchored');
  assert.match(mutationRunnerSource, /const executionParent = mkdtempSync\(join\(tmpdir\(\), 'dz-story-mutation-runner-'\)\)/,
    'the shipped runner must create a private ephemeral execution root');
  assert.match(mutationRunnerSource, /writeFileSync\(executionWrapperPath, wrapper\)/,
    'pre-import hashes may be rebound only in the ephemeral wrapper copy');
  assert.match(mutationRunnerSource, /if \(expectedReboundPaths\.length === 0 && wrapper !== wrapperBeforeRebind\)/,
    'every lane without a mutated pre-import input must refuse constant drift rather than heal it');
  assert.match(mutationRunnerSource, /tapExecutedWithoutSkip\(childTap, FIREFOX_TEST\)/,
    'a live lane must carry an exact non-SKIP Firefox TAP receipt');
  assert.match(mutationRunnerSource, /tapHasNamedResult\(childTap, owner, 'not ok'\)/,
    'a mutant can be proven only by the exact named owning-test failure');
  assert.match(mutationRunnerSource, /ls-files', '--others', '--ignored', '--exclude-standard'/,
    'ignored paths that the ephemeral copy could include must fail closed');
  assert.match(mutationRunnerSource, /rmSync\(executionParent, \{ recursive: true, force: true \}\)/,
    'the private execution root must be removed after every child run');
  assert.match(mutationRunnerSource, /if \(statusRestored !== statusBefore\)/,
    'the runner must prove that the gate scratch remained read-only');
  const finalizationIndex = mutationRunnerSource.indexOf('} finally {');
  const scratchReceiptIndex = mutationRunnerSource.indexOf("const statusRestored = runGit(['status', '--porcelain=v1', '--untracked-files=all']);");
  const executionRethrowIndex = mutationRunnerSource.indexOf('if (executionError !== null) throw executionError;');
  assert.ok(finalizationIndex < scratchReceiptIndex && scratchReceiptIndex < executionRethrowIndex,
    'scratch immutability must be checked during finalization before an execution error is rethrown');
  assert.match(mutationRunnerSource, /new AggregateError\([\s\S]*\[executionError, \.\.\.finalizationErrors\]/,
    'a scratch failure on the throwing path must be reported alongside the original execution error');
  for (const id of [
    'story-semantic-subset-authority',
    'story-semantic-structure-authority',
    'story-semantic-parse-error-authority',
    'story-semantic-item-copy-authority',
    'story-semantic-renderer-regression-authority',
    'story-semantic-field-order-authority',
    'story-semantic-audience-authority',
    'story-semantic-item-binding-authority',
    'story-semantic-aggregate-copy-authority',
    'story-semantic-chrome-cardinality-authority',
    'story-semantic-disclosure-authority',
    'story-semantic-style-source-authority',
    'story-semantic-style-raw-slice-authority',
    'story-semantic-module-integrity-authority',
    'story-semantic-bundle-integrity-authority',
    'story-preimport-support-module-integrity-authority',
    'story-preimport-extractor-integrity-authority',
    'story-preimport-schema-integrity-authority',
    'story-preimport-atomic-order-authority',
    'story-semantic-import-graph-authority',
    'story-semantic-renderer-isolation-authority',
    'story-semantic-package-lookup-isolation-authority',
    'story-semantic-external-asset-authority',
    'story-semantic-unsafe-html-authority',
    'story-semantic-parser-exception-authority',
    'story-semantic-query-exception-authority',
    'story-canonical-renderer-exception-authority',
    'story-semantic-lexical-fail-closed-authority',
    'story-semantic-active-uri-authority',
    'story-semantic-order-authority',
    'story-semantic-input-boundary-authority',
    'story-browser-request-verdict-authority',
    'story-semantic-orphan-marker-authority',
    'story-semantic-unexpected-owner-authority',
    'story-semantic-field-only-marker-authority',
    'story-semantic-parser-environment-classification-authority',
    'story-semantic-request-api-compatibility-authority',
    'story-semantic-dynamic-import-closure-authority',
    'story-semantic-regex-import-ambiguity-authority',
    'story-semantic-outer-exception-authority',
    'story-semantic-malformed-result-authority',
    'story-semantic-result-inventory-authority',
    'story-semantic-independent-inventory-literal-authority',
    'story-provenance-line-range-lower-bound-authority',
    'story-provenance-numeric-proof-index-authority',
    'story-semantic-chrome-structure-authority',
    'story-semantic-visual-authority',
    'story-semantic-claim-id-authority',
    'story-semantic-head-placement-authority',
    'story-semantic-anchor-inventory-authority',
    'story-semantic-input-limit-exception-polarity-authority',
    'story-shared-brief-digest-authority',
    'story-semantic-brief-digest-authority',
    'story-semantic-section-tree-authority',
    'story-semantic-item-placement-order-authority',
    'story-semantic-element-inventory-authority',
    'story-semantic-attribute-inventory-authority',
    'story-semantic-initial-open-authority',
    'story-css-linear-block-authority',
    'story-css-complexity-ceiling-authority',
    'story-dynamic-check-id-uniqueness-authority',
    'story-budget-json-parse-totality-authority',
    'story-preimport-support-size-authority',
    'story-semantic-bundle-hash-exemption-authority',
    'story-semantic-unexpected-check-preservation-authority',
    'story-browser-second-origin-authorization-authority',
    'story-browser-canonical-measurement-receipt-authority',
    'story-browser-second-origin-live-wiring-authority',
    'story-parse5-direct-dom-authority',
    'story-extractor-no-follow-authority',
    'story-extractor-toctou-authority',
    'story-renderer-schema-authority',
    'story-css-block-count-ceiling-authority',
    'story-parser-bundle-byte-ceiling-authority',
  ]) assert.ok(ids.includes(id), id);
  for (const name of [
    'cross-nested disclosures fail page.controls',
    'hidden evidence markers do not satisfy item bindings',
    'authored copy stays bound to each story item',
    'authored fields stay in exact DOM reading order',
    'renderer chrome multiset is cardinality-total for eyebrow package-name collisions',
    'external asset inventory covers HTML resource surfaces and changed stylesheet bytes',
    'style raw text cannot mint element nodes',
    'unexpected story-item owners fail reverse totality',
    'load-bearing page mutations each turn a named verifier check red',
    'CSS policy predicates discriminate independently from exact style authority',
    'head title and metadata remain semantically bound to the brief',
    'brief digest is stable across object key insertion order',
    'semantic link authority rejects active and non-HTTPS URI anchors',
    'parse5 repair is rejected by the emitted subset',
    'module parser environment is fail closed while caller NODE_OPTIONS is stripped',
    'style authority hashes exact parse5-located source bytes',
    'semantic exceptions become stable named failures',
    'unexpected semantic authority exceptions become a named public verdict',
    'malformed semantic authority results become a named public verdict',
    'public verifier passes only the normalized brief and exact page to semantic authority',
    'defence-in-depth capability scanner recognises its bounded corpus',
    'static semantic import graph closes exact specifier inventory',
    'production semantic graph blocks renderer and package lookup before execution',
    'semantic integrity gate runs before every changed closure can execute',
    'semantic authority rejects a renderer regression even when page canonical is green',
    'browser disclosure failures participate in the pass fail decision',
    'browser second-origin receipt gates canonical measurement initialization',
    'status source and renderer chrome text stay in exact structural owners',
    'visual direction and kind stay in their exact parse5 section owner',
    'claim identifiers stay paired with exact story owners',
    'sections and story items stay in exact direct owners and brief order',
    'element inventory is exact and derived from brief cardinalities',
    'class id category and initial disclosure state stay on exact owners',
    'headless Firefox measures zero horizontal overflow at the four contract widths and rejects the second-loopback-origin probe',
  ]) assert.ok(mutationRunnerSource.includes(name), name);
});

test('mutation runner forwards child TAP before it can emit a receipt error', () => {
  const source = readFileSync(join(root, 'test', 'run-mutation-suite.mjs'), 'utf8');
  const forwardingSite = "process.stdout.write(childTap);\n    process.stderr.write(childStderr);";
  const forwardingIndex = source.indexOf(forwardingSite);
  const receiptErrorIndex = source.indexOf('mutation-suite-receipt-error:');
  assert.ok(source.includes("const childTap = result.stdout ?? '';"), 'receipt parsing must use the child TAP stream');
  assert.doesNotMatch(source, /tap(?:ExecutedWithoutSkip|HasNamedResult)\(childStderr/,
    'stderr must never mint a Firefox or owner TAP receipt');
  assert.ok(source.includes("const receiptNeedsLineBoundary = childStderr !== '' && !/[\\r\\n]$/.test(childStderr);"), 'a forwarded stderr tail must not push the receipt token off column zero');
  assert.notEqual(forwardingIndex, -1, 'the child stdout/stderr forwarding site must exist');
  assert.equal(source.split(forwardingSite).length - 1, 1, 'the child output forwarding site must occur exactly once');
  assert.ok(forwardingIndex < receiptErrorIndex, 'child TAP must be forwarded before the first receipt error emission');
});

test('mutation runner rejects a vacuous lane with a column-zero execution-count receipt', () => {
  const source = readFileSync(join(root, 'test', 'run-mutation-suite.mjs'), 'utf8');
  const forwardingSite = "process.stdout.write(childTap);\n    process.stderr.write(childStderr);";
  const countSite = 'const executedNames = tapExecutedNamedTests(childTap, names);';
  const markerSite = 'mutation-suite-receipt-error: lane-execution-count-mismatch expected=${names.length} observed=${observedExecuted}';
  assert.equal(source.split(countSite).length - 1, 1,
    'every lane must count exact selected, executed, non-skipped TAP points once');
  assert.ok(source.includes('const result = /^(?:ok|not ok) \\d+ - (.+)$/.exec(line);'),
    'the receipt must count top-level TAP result points rather than source-name presence');
  assert.ok(source.includes("return result !== null && expected.has(result[1]) ? [result[1]] : [];"),
    'only exact selected names may contribute to the execution count');
  assert.ok(source.includes('new Set(executedNames).size === names.length'),
    'a duplicate executed name must not mask a missing selected test');
  assert.ok(source.includes('names.every((name) => executedNames.includes(name))'),
    'every selected name must have an executed TAP point');
  assert.equal(source.split(markerSite).length - 1, 1,
    'a lane shortfall must emit one stable receipt marker');
  assert.ok(source.indexOf(forwardingSite) < source.indexOf(markerSite),
    'child TAP must be forwarded before the execution-count receipt');
  assert.ok(source.includes("if (receiptNeedsLineBoundary) process.stderr.write('\\n');\n      process.stderr.write(`mutation-suite-receipt-error: lane-execution-count-mismatch"),
    'the marker must start at column zero even after an unterminated child stderr tail');
  assert.ok(source.includes('if (!executedExactlyOnce) {'),
    'a zero-execution success must fail rather than vacuously green the lane');
});

test('retired verifier authorities and substitution seams cannot return', () => {
  const wrapperSource = readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8');
  const semanticSource = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
  const rendererSource = readFileSync(join(scripts, 'render-story-page.mjs'), 'utf8');
  const retired = /parseImpl|renderImpl|approvedStyleSha256|throwParser|throwQuery|throwRenderer|legacyVerifyStoryPage|scanDocument|parseElementTree|inspectCssResources/;
  assert.doesNotMatch(wrapperSource, retired);
  assert.doesNotMatch(semanticSource, retired);
  assert.doesNotMatch(rendererSource, retired);
  assert.doesNotMatch(wrapperSource, /expectedSemanticCheckIds|forgedBoundaryArgument/,
    'mutation-only production seams must not return');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /shipped parse5 authority/);
  assert.match(readme, /emitted closed subset/);
  assert.match(readme, /brief-declared absolute HTTPS anchors/);
  assert.match(readme, /parse5-bounded source bytes/);
  assert.match(readme, /seventy-four live production mutants/);
  assert.match(readme, /current live registry contains 74 guards/);
  assert.doesNotMatch(readme, /(?:sixty-six|seventy-two) live production mutants|current live registry contains (?:66|72) guards/);
  assert.doesNotMatch(readme, /candidate lists|CSS image-set|quote-aware first-wins|named URI control|browser-valid tag openers|RAWTEXT\/RCDATA|candidate-wise active schemes|backslash URL separators/);
});

test('full-qe command contract scopes browser skip to the focused mutation lane', () => {
  const registry = JSON.parse(readFileSync(join(root, 'test', 'mutation-registry.json'), 'utf8'));
  const runner = readFileSync(join(root, 'test', 'run-mutation-suite.mjs'), 'utf8');
  const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(registry.testCommand, 'node test/run-mutation-suite.mjs');
  assert.doesNotMatch(registry.testCommand, /PACKAGE_STORY_SKIP_BROWSER/);
  assert.match(runner, /const liveBrowserLanes = mutatedPaths\.length === 0 \? \[true, false\] : \[browserMutated\]/);
  assert.match(runner, /if \(liveBrowser\)[\s\S]*delete childEnv\.PACKAGE_STORY_SKIP_BROWSER/);
  assert.match(runner, /else \{[\s\S]*childEnv\.PACKAGE_STORY_SKIP_BROWSER = '1'/);
  assert.doesNotMatch(metadata.scripts.test, /PACKAGE_STORY_SKIP_BROWSER/);
  assert.match(metadata.scripts.test, /node --test test\/\*\.test\.mjs/);
});

test('published mutation runner refuses outside a gate-owned scratch before changing signed bytes', () => {
  const wrapperPath = join(scripts, 'verify-story-page.mjs');
  const before = readFileSync(wrapperPath);
  const run = spawnSync(process.execPath, ['test/run-mutation-suite.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /refuses to write outside a gate-owned scratch repository/);
  assert.deepEqual(readFileSync(wrapperPath), before);
});

test('load-bearing page mutations each turn a named verifier check red', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mutations = [
    ['brief.digest', html.replace('package-story-brief-sha256', 'changed-brief-digest')],
    ['story.order', html.replace('data-story-section="example"', 'data-removed="example"')],
    ['page.external-assets', html.replace('</head>', '<link rel="stylesheet" href="https://evil.invalid/x.css"></head>')],
    ['page.external-assets', html.replace('</style>', '.remote{background:url(https://evil.invalid/a.png)}</style>')],
    ['page.external-assets', html.replace('</style>', '@import "https://evil.invalid/a.css";</style>')],
    ['page.external-assets', html.replace('</main>', '<img src="local.png" srcset="https://evil.invalid/a.png 2x"></main>')],
    ['page.external-assets', html.replace('</main>', '<object data="https://evil.invalid/a.svg"></object></main>')],
    ['page.external-assets', html.replace('</main>', '<embed src="https://evil.invalid/a.svg"></main>')],
    ['page.external-assets', html.replace('</main>', '<svg><use href="https://evil.invalid/a.svg#icon"></use></svg></main>')],
    ['page.external-assets', html.replace('</main>', '<video><track src="https://evil.invalid/a.vtt"></video></main>')],
    ['page.external-assets', html.replace('</head>', '<link rel="preload" imagesrcset="https://evil.invalid/a.png 2x"></head>')],
    ['page.javascript', html.replace('</main>', '<script type="application/json">{}</script></main>')],
    ['page.unsafe-html', html.replace('</main>', '<button onclick="alert(1)">bad</button></main>')],
    ['page.javascript', html.replace('</main>', '<a href="javascript:alert(1)">bad</a></main>')],
    ['page.unsafe-html', html.replace('</main>', '<a href="javascript:alert(1)">bad</a></main>')],
    ['page.unsafe-html', html.replace('</main>', '<a href="&#x6a;avascript:alert(1)">bad</a></main>')],
    ['page.javascript', html.replace('</main>', '<iframe src="data:text/html,bad"></iframe></main>')],
    ['page.unsafe-html', html.replace('</main>', '<iframe src="data:text/html,bad"></iframe></main>')],
    ['page.inline-style', html.replace('</main>', '<div style="overflow:hidden">bad</div></main>')],
    ['page.controls', html.replace('data-flow-step="input"', 'data-flow-step="missing"')],
    ['page.focus', html.replace(':focus-visible{outline:3px', ':focus-visible{outline:none')],
    ['page.focus', html.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:3px solid var(--amber);outline-color:transparent;outline-offset:3px')],
    ['page.focus', html.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:3px solid var(--amber);outline-offset:3px;outline:none')],
    ['page.reduced-motion', html.replace('animation:none!important', 'animation:spin 1s!important')],
    ['page.reduced-motion', html.replace('animation:none!important', 'color:inherit').replace('</style>', '.outside{animation:none!important}</style>')],
    ['page.reduced-motion', html.replace('*,*:before,*:after{animation:none!important;transition:none!important}', '.no-match{animation:none!important;transition:none!important}')],
    ['page.responsive', html.replace('@media(max-width:720px)', '@media(max-width:1px)')],
    ['page.responsive', html.replace('body{margin:0;', 'body{margin:0;overflow-x:hidden;')],
    ['page.responsive', html.replace('</style>', '.wrap{overflow-x:clip}</style>')],
    ['page.responsive', html.replace('</style>', '.mask{overflow:hidden}</style>')],
    ['page.wrapping', html.replace('</style>', '.bad{word-break:break-all}</style>')],
    ['page.wrapping', html.replace('</style>', '.bad{word-break:break-word}</style>')],
    ['page.wrapping', html.replace('</style>', '.bad{overflow-wrap:anywhere}</style>')],
    ['page.wrapping', html.replace('</style>', '.bad{word-wrap:break-word}</style>')],
    ['page.wrapping', html.replace('</style>', '.bad{hyphens:auto}</style>')],
    ['page.synthetic-label', html.replaceAll('data-synthetic-label="true"', 'data-removed-synthetic-label="true"')],
    ['page.synthetic-label', html.replaceAll('синтетические данные', 'обычные данные')],
    ['page.synthetic-label', html.replace('data-synthetic-label="true" data-synthetic-surface="output"', 'data-removed-synthetic-label="true" data-synthetic-surface="output"')],
    ['page.visuals', html.replace('data-visual-kind="flow"', 'data-visual-kind="decoration"')],
    ['page.visuals', html.replace('data-story-section="why" data-visual-kind="comparison"', 'data-story-section="why" data-removed-visual-kind="comparison"')],
    ['page.visuals', html.replace('Показать путь от дневника к артефакту.', 'Скрытая подмена направления.')],
    ['page.visuals', html.replace('</main>', '<p data-visual-section="bogus">unexpected visual surface</p></main>')],
    ['page.claims', html.replace('data-claim-id=', 'data-removed-claim-id=')],
    ['limit.safety', html.replace('data-limit-category="safety"', 'data-removed-limit-category="safety"')],
    ['limit.safety', html.replace('</main>', '<article class="limit-card" data-limit-category="bogus"></article></main>')],
    [`source.rendered.${fixture.story.sources[0].id}`, html.replace(`id="source-${fixture.story.sources[0].id}"`, `data-removed-source="${fixture.story.sources[0].id}"`)],
    ['source.closure', html.replace(/data-source-id="[^"]+"/, 'data-source-id="missing-source"')],
    ['page.language', html.replace('<html lang="ru">', '<html lang="en">')],
    ['page.schema', html.replace('data-story-schema="package-story-brief/1"', 'data-story-schema="changed/1"')],
    ['page.unknown-labels', html.replace('data-unknown-id=', 'data-removed-unknown-id=')],
    ['page.copy', html.replace('Посмотрите на результат до объяснений.', 'Подменённый текст.')],
    ['page.style-count', html.replace('</head>', '<style>.second{color:red}</style></head>')],
  ];
  for (const [id, mutated] of mutations) {
    const result = verify(fixture, mutated);
    assert.equal(result.checks.find((check) => check.id === id)?.pass, false, id);
    if (['page.focus', 'page.reduced-motion', 'page.responsive', 'page.wrapping'].includes(id)) {
      assertCheck(result, 'page.style-authority');
      for (const other of ['page.focus', 'page.reduced-motion', 'page.responsive', 'page.wrapping']) {
        if (other !== id) assertCheck(result, other, true);
      }
    }
  }
  const harmlessUnsupported = verify(fixture, html.replace('</main>', '<x-story-probe>probe</x-story-probe></main>'));
  assertCheck(harmlessUnsupported, 'page.html-subset');
  assertCheck(harmlessUnsupported, 'page.external-assets', true);
  assertCheck(harmlessUnsupported, 'page.unsafe-html', true);
});

test('CSS policy predicates discriminate independently from exact style authority', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const style = /<style>([\s\S]*?)<\/style>/i.exec(html)?.[1] ?? '';
  const allGreen = { focus: true, reducedMotion: true, responsive: true, wrapping: true };
  assert.deepEqual(evaluateStoryCssPolicies(style), allGreen);
  assert.deepEqual(evaluateStoryCssPolicies(null), { focus: false, reducedMotion: false, responsive: false, wrapping: false });
  assert.deepEqual(evaluateStoryCssPolicies({}), { focus: false, reducedMotion: false, responsive: false, wrapping: false });
  assert.equal(evaluateStoryCssPolicies(`${style}a:focus{outline:none}`).focus, false,
    'a later :focus rule cannot erase the visible focus outline');
  assert.equal(evaluateStoryCssPolicies(style.replace(
    'outline:3px solid var(--amber);outline-offset:3px',
    'outline:0.5em solid var(--amber);outline-offset:3px',
  )).focus, true, 'a nonzero decimal outline width remains visible');
  assert.equal(evaluateStoryCssPolicies(style.replace(
    'outline:3px solid var(--amber);outline-offset:3px',
    'outline:3px solid var(--amber);outline-width:0.5em;outline-offset:3px',
  )).focus, true, 'a nonzero decimal outline-width longhand remains visible');
  for (const disabledOutline of [
    'outline:solid red 0px;outline-offset:3px',
    'outline:3px solid rgba(20,30,40,0);outline-offset:3px',
    'outline:3px solid hsla(20,30%,40%,0.0);outline-offset:3px',
  ]) {
    assert.equal(evaluateStoryCssPolicies(style.replace(
      'outline:3px solid var(--amber);outline-offset:3px', disabledOutline,
    )).focus, false, disabledOutline);
  }
  assert.deepEqual(evaluateStoryCssPolicies(
    `${'a:focus{'.repeat(CSS_NESTING_LIMIT + 1)}${'}'.repeat(CSS_NESTING_LIMIT + 1)}`,
  ), { focus: false, reducedMotion: false, responsive: false, wrapping: false }, 'excessive CSS nesting fails closed');
  assert.deepEqual(evaluateStoryCssPolicies('a{}'.repeat(CSS_BLOCK_LIMIT + 1)),
    { focus: false, reducedMotion: false, responsive: false, wrapping: false }, 'excessive CSS block count fails closed');

  const policyUrl = pathToFileURL(join(scripts, 'verify-story-page.mjs')).href;
  const linearProbe = spawnSync(process.execPath, ['--input-type=module', '-e', [
    `import { evaluateStoryCssPolicies } from ${JSON.stringify(policyUrl)};`,
    'const started = Date.now();',
    "evaluateStoryCssPolicies('a'.repeat(100_000));",
    "const nested=evaluateStoryCssPolicies('a:focus{'.repeat(100_000)+'}'.repeat(100_000));",
    "if(Object.values(nested).some(Boolean))throw new Error('deep nesting did not fail closed');",
    'process.stdout.write(String(Date.now() - started));',
  ].join('')], { encoding: 'utf8', timeout: 3_000 });
  assert.equal(linearProbe.status, 0, `CSS policy probe exceeded its bounded runtime\n${linearProbe.stderr}`);
  assert.ok(Number(linearProbe.stdout) < 1_000, `CSS policy probe took ${linearProbe.stdout}ms`);

  const rows = [
    ['focus', style.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:3px solid var(--amber);outline-color:transparent;outline-offset:3px')],
    ['focus', style.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:3px solid var(--amber);outline-style:none;outline-offset:3px')],
    ['focus', style.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:3px solid var(--amber);outline-width:0;outline-offset:3px')],
    ['focus', style.replace('outline:3px solid var(--amber);outline-offset:3px', 'outline:initial;outline-offset:3px')],
    ['reducedMotion', style.replace('*,*:before,*:after{animation:none!important;transition:none!important}', '.no-match{animation:none!important;transition:none!important}')],
    ['responsive', style.replace('body{margin:0;', 'body{margin:0;overflow-x:hidden;')],
    ['wrapping', `${style}.bad{word-break:break-all}`],
  ];
  for (const [name, mutated] of rows) {
    assert.notEqual(mutated, style, `${name} CSS mutation must land`);
    const result = evaluateStoryCssPolicies(mutated);
    assert.equal(result[name], false, name);
    for (const other of Object.keys(allGreen).filter((key) => key !== name)) assert.equal(result[other], true, `${name} must not mask ${other}`);
  }
});

test('all claims render and unknown proof is visibly labelled', () => {
  const fixture = fixtureStory();
  const labels = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
  for (let index = 0; index < 5; index += 1) {
    fixture.story.claims.push({ id: `extra-${index}`, text: `Additional grounded statement ${labels[index]}`, status: 'evidenced', sourceIds: [fixture.story.sources[0].id] });
  }
  fixture.story.claims.push({ id: 'unknown-claim', text: 'Adoption is not known', status: 'unknown', sourceIds: [] });
  const html = renderStoryPage(fixture.story);
  assert.equal((html.match(/data-claim-id=/g) ?? []).length, fixture.story.claims.length);
  assert.match(html, /data-unknown-id="claim:unknown-claim"/);
  const unknownIds = [...html.matchAll(/data-unknown-id="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(unknownIds).size, unknownIds.length);
  assert.equal(verify(fixture, html).pass, true, verify(fixture, html).failures.join('\n'));
});

test('English brief selects English document chrome and language', () => {
  const fixture = fixtureStory();
  fixture.story.language = 'en';
  const html = renderStoryPage(fixture.story);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Start with a working scenario/);
  assert.doesNotMatch(html, /Сначала — работающий сценарий/);
  assert.equal(verify(fixture, html).pass, true, verify(fixture, html).failures.join('\n'));
});

test('escaped artifact prose does not masquerade as active markup or CSS', () => {
  const fixture = fixtureStory();
  fixture.story.example.output.preview = '</pre><script>alert(x)</script> fetch( onload= PENDING word-break:break-all';
  const html = renderStoryPage(fixture.story);
  assert.ok(html.includes('&lt;/pre&gt;&lt;script&gt;alert(x)&lt;/script&gt;'));
  assert.equal(verify(fixture, html).pass, true, verify(fixture, html).failures.join('\n'));
});

test('extractor records every bounded truncation instead of hiding it', () => {
  const packageRoot = fixturePackage();
  for (let index = 0; index < 85; index += 1) writeFileSync(join(packageRoot, 'test', `extra-${String(index).padStart(2, '0')}.mjs`), `export const n = ${index};\n`);
  const evidence = extractPackageEvidence(packageRoot);
  assert.ok(evidence.truncation.sourceFiles.found > evidence.truncation.sourceFiles.included);
  assert.equal(evidence.sources.length, 80);
  assert.equal(evidence.sources[0].path, 'package.json');
  assert.ok(evidence.unknowns.some((item) => item.startsWith('source inventory truncated:')));

  const blocks = Array.from({ length: 14 }, (_, index) => {
    const content = index === 0 || index === 13 ? 'x'.repeat(3001) : `example-${index}`;
    return `\`\`\`text\n${content}\n\`\`\``;
  });
  writeFileSync(join(packageRoot, 'README.md'), `${blocks.join('\n\n')}\n`);
  const bounded = extractPackageEvidence(packageRoot);
  assert.deepEqual(bounded.truncation.readmeExamples, {
    found: 14, included: 12, dropped: 2, limit: 12, contentLimit: 3000, truncatedContent: 1,
  });
  assert.equal(bounded.readmeExamples.length, 12);
  assert.equal(bounded.readmeExamples[0].content.length, 3000);
  assert.equal(bounded.readmeExamples[0].contentTruncated, true);
  assert.ok(bounded.unknowns.includes('README examples truncated: 12/14'));
  assert.ok(bounded.unknowns.includes('README example content truncated: 1'));
});

test('browser disclosure failures participate in the pass fail decision', () => {
  assert.equal(typeof browserVerifier.classifyBrowserFailures, 'function');
  const healthy = {
    marker: 'package-story-brief/1', requestedWidth: 390, innerWidth: 390, clientWidth: 390, scrollWidth: 390,
    cleanReadyState: 'complete', hostReadyState: 'complete', readyState: 'complete',
    outliers: [], overflowingContainers: [], contrastFailures: [], visibilityFailures: [], focusFailure: [],
    fieldFailures: [], disclosureFailures: [], keyboardFailures: [], nameFailures: [], externalRequestFailures: [],
    proxyProbeObserved: true,
  };
  assert.deepEqual(browserVerifier.classifyBrowserFailures([healthy]), []);
  for (const mutation of [
    { disclosureFailures: [{ id: 'input', toggled: false }] },
    { keyboardFailures: [{ id: 'input', key: 'Enter' }] },
    { nameFailures: [{ kind: 'link' }] },
    { fieldFailures: [{ path: 'hero.title' }] },
    { externalRequestFailures: [{ origin: 'http://127.0.0.1:9' }] },
    { proxyProbeObserved: false },
  ]) {
    const broken = { ...healthy, ...mutation };
    assert.deepEqual(browserVerifier.classifyBrowserFailures([broken]), [broken]);
  }
});

test('browser second-origin receipt gates canonical measurement initialization', async () => {
  const proxy = await browserVerifier.startRecordingProxy('http://127.0.0.1:1');
  const probe = await browserVerifier.serveProbeTarget();
  try {
    assert.throws(() => proxy.authorizeRejectedOrigin(probe), /did not observe/);
    proxy.records.push({ method: 'GET', url: probe.url, origin: new URL(probe.url).origin, connect: false });
    const receipt = proxy.authorizeRejectedOrigin(probe);
    assert.deepEqual(browserVerifier.beginCanonicalMeasurements(receipt), []);
    assert.throws(() => browserVerifier.beginCanonicalMeasurements(null), /require a module-issued/);
    assert.throws(() => browserVerifier.beginCanonicalMeasurements(
      Object.freeze({ secondOriginRejected: true }),
    ), /require a module-issued/, 'a structurally identical forged receipt must not authorize measurements');
    assert.throws(() => proxy.authorizeRejectedOrigin(
      Object.freeze({ url: probe.url, hits: () => 0 }),
    ), /module-issued probe target/, 'forged constant authorizer arguments must not authorize measurements');
    const forwarded = await fetch(probe.url);
    assert.equal(forwarded.status, 204);
    assert.throws(() => proxy.authorizeRejectedOrigin(probe), /forwarded/);
  } finally {
    await new Promise((resolveClose) => proxy.server.close(resolveClose));
    await new Promise((resolveClose) => probe.server.close(resolveClose));
  }
  const source = readFileSync(join(scripts, 'verify-story-page-browser.mjs'), 'utf8');
  const authorizeAt = source.indexOf('const proxyProbeReceipt = recordingProxy.authorizeRejectedOrigin(probeServer);');
  const initializeAt = source.indexOf('const results = beginCanonicalMeasurements(proxyProbeReceipt);');
  assert.notEqual(authorizeAt, -1, 'the live browser path must authorize from the module-issued live proxy and target');
  assert.notEqual(initializeAt, -1, 'the live browser path must consume the receipt to initialize measurements');
  assert.ok(authorizeAt < initializeAt,
    'the production data dependency must authorize the probe before initializing canonical measurements');
});

test('headless Firefox measures zero horizontal overflow at the four contract widths and rejects the second-loopback-origin probe', {
  skip: process.env.PACKAGE_STORY_SKIP_BROWSER === '1' ? 'PACKAGE_STORY_SKIP_BROWSER=1 requested the unit-only lane' : false,
}, async () => {
  const fixture = fixtureStory();
  const external = externalSource(fixture, 'vendor-doc', 'https://example.com/docs');
  fixture.evidence.sources.push(external);
  fixture.story.sources.push(external);
  fixture.story.claims.push({ id: 'vendor-note', text: 'Vendor documentation describes an optional mode.', status: 'external', sourceIds: [external.id] });
  fixture.story.example.input = `synthetic:${'x'.repeat(600)}`;
  fixture.story.example.output.preview = `artifact:${'y'.repeat(600)}`;
  fixture.story.install[0].command = `npx health-note ${'z'.repeat(500)}`;
  const out = temp('story-browser');
  const site = join(out, 'index.html');
  writeFileSync(site, renderStoryPage(fixture.story));
  const result = await verifyBrowserLayout(site, [320, 390, 768, 1440]);
  assert.equal(result.pass, true, JSON.stringify(result.failures, null, 2));
  assert.deepEqual(result.results.map((item) => item.innerWidth), [320, 390, 768, 1440]);
  const expectedDisclosureIds = [...fixture.story.mechanism.map((step) => step.id), 'sources'];
  const expectedRuSemantics = expectedBrowserSemantics(fixture.story);
  const expectedRuFields = expectedFieldPathOrder(fixture.story);
  const ruBodyTextHash = sha256Text(result.results[0].semanticReceipt.bodyText);
  for (const viewport of result.results) {
    assert.equal(viewport.proxyProbeObserved, true);
    assert.equal(viewport.language, 'ru');
    assert.equal(viewport.cleanReadyState, 'complete');
    assert.equal(viewport.hostReadyState, 'complete');
    assert.equal(viewport.readyState, 'complete');
    assert.deepEqual(viewport.externalRequestFailures, []);
    assert.deepEqual(viewport.fieldFailures, []);
    assert.deepEqual(viewport.fieldPaths, expectedRuFields);
    assert.deepEqual(viewport.semanticReceipt.headings, expectedRuSemantics.headings);
    assert.deepEqual(viewport.semanticReceipt.focusTargets, expectedRuSemantics.focusTargets);
    assert.equal(sha256Text(viewport.semanticReceipt.bodyText), ruBodyTextHash);
    assert.deepEqual(viewport.keyboardFailures, []);
    assert.deepEqual(viewport.nameFailures, []);
    assert.equal(viewport.keyboardReceipts.length, (fixture.story.mechanism.length + 1) * 2);
    assert.ok(viewport.keyboardReceipts.every((item) => item.pass && item.labelsStable
      && item.labelBefore === item.labelAfter && item.labelAfter === item.labelRestored));
    assert.equal(viewport.disclosureFailures.length, 0, JSON.stringify(viewport.disclosureFailures));
    assert.equal(viewport.disclosures.length, fixture.story.mechanism.length + 1);
    assert.deepEqual(viewport.disclosures.map((item) => item.id), expectedDisclosureIds);
    assert.ok(viewport.disclosures.some((item) => item.initialOpen === true));
    assert.ok(viewport.disclosures.some((item) => item.initialOpen === false));
    assert.ok(viewport.disclosures.every((item) => item.toggled && item.finalOpen && item.contentVisible && item.owned));
  }

  fixture.story.language = 'en';
  writeFileSync(site, renderStoryPage(fixture.story));
  const english = await verifyBrowserLayout(site, [320, 390, 768, 1440]);
  assert.equal(english.pass, true, JSON.stringify(english.failures, null, 2));
  const expectedEnSemantics = expectedBrowserSemantics(fixture.story);
  const enBodyTextHash = sha256Text(english.results[0].semanticReceipt.bodyText);
  for (const viewport of english.results) {
    assert.equal(viewport.language, 'en');
    assert.equal(viewport.cleanReadyState, 'complete');
    assert.equal(viewport.hostReadyState, 'complete');
    assert.equal(viewport.readyState, 'complete');
    assert.deepEqual(viewport.externalRequestFailures, []);
    assert.deepEqual(viewport.fieldPaths, expectedRuFields);
    assert.deepEqual(viewport.semanticReceipt.headings, expectedEnSemantics.headings);
    assert.deepEqual(viewport.semanticReceipt.focusTargets, expectedEnSemantics.focusTargets);
    assert.equal(sha256Text(viewport.semanticReceipt.bodyText), enBodyTextHash);
    assert.ok(viewport.keyboardReceipts.every((item) => item.pass && item.labelsStable));
  }
  fixture.story.language = 'ru';

  const rawStyleProbe = renderStoryPage(fixture.story).replace(
    '</style>',
    `.probe::before{content:"<details data-flow-step='phantom'>"}/* <template data-story-item-id="phantom"> */</style>`,
  );
  writeFileSync(site, rawStyleProbe);
  const rawStyleResult = await verifyBrowserLayout(site, [390]);
  assert.equal(rawStyleResult.pass, true, JSON.stringify(rawStyleResult.failures, null, 2));
  assert.equal(rawStyleResult.results[0].disclosures.length, fixture.story.mechanism.length + 1);
  assert.deepEqual(rawStyleResult.results[0].disclosures.map((item) => item.id), expectedDisclosureIds);

  const broken = renderStoryPage(fixture.story)
    .replace('</style>', ':focus{outline:none!important}.visual-direction,[data-story-field="why.title"],.evidence,.status{display:none!important}</style>')
    .replace('</main>', '<div style="width:100px;overflow:auto"><span style="display:block;width:200px;height:1px"></span></div></main>');
  writeFileSync(site, broken);
  const brokenResult = await verifyBrowserLayout(site, [390]);
  assert.equal(brokenResult.pass, false);
  assert.ok(brokenResult.failures[0].focusFailure.length > 0);
  assert.ok(brokenResult.failures[0].overflowingContainers.length > 0);
  assert.ok(brokenResult.failures[0].visibilityFailures.some((failure) => failure.className === 'visual-direction'));
  assert.ok(brokenResult.failures[0].visibilityFailures.some((failure) => failure.className === 'evidence'));
  assert.ok(brokenResult.failures[0].visibilityFailures.some((failure) => failure.className.includes('status')));
  assert.ok(brokenResult.failures[0].fieldFailures.some((failure) => failure.path === 'why.title'));

  const contrastBroken = renderStoryPage(fixture.story)
    .replace('</style>', '.dark .evidence,.dark .status,.dark .kicker{color:#0d0021!important}</style>');
  writeFileSync(site, contrastBroken);
  const contrastResult = await verifyBrowserLayout(site, [390]);
  assert.equal(contrastResult.pass, false);
  assert.ok(contrastResult.failures[0].contrastFailures.length > 0);

  const disclosureBroken = renderStoryPage(fixture.story).replace(
    /<summary[^>]+data-flow-summary="structure"[^>]*>([\s\S]*?)<\/summary>/,
    '<div data-flow-summary="structure">$1</div>',
  );
  writeFileSync(site, disclosureBroken);
  const disclosureResult = await verifyBrowserLayout(site, [390]);
  assert.equal(disclosureResult.pass, false);
  assert.ok(disclosureResult.failures[0].disclosureFailures.some((item) => item.id === 'structure'
    && (!item.owned || !item.toggled || !item.contentVisible)));

  const emptyName = renderStoryPage(fixture.story).replace(
    /<summary data-flow-summary="input" data-story-field="mechanism\.input\.label">[\s\S]*?<\/summary>/,
    '<summary data-flow-summary="input" data-story-field="mechanism.input.label"></summary>',
  );
  writeFileSync(site, emptyName);
  const emptyNameResult = await verifyBrowserLayout(site, [390]);
  assert.equal(emptyNameResult.pass, false);
  assert.ok(emptyNameResult.failures[0].nameFailures.some((item) => item.kind === 'summary'));
});

test('installed-style CLI commands work from an external cwd', () => {
  const packageRoot = fixturePackage();
  const out = temp('story-cli');
  const evidencePath = join(out, 'evidence.json');
  const extract = spawnSync(process.execPath, [join(scripts, 'extract-package-evidence.mjs'), '--pkg', packageRoot, '--json', evidencePath], { cwd: out, encoding: 'utf8' });
  assert.equal(extract.status, 0, extract.stderr);
  const story = brief(JSON.parse(readFileSync(evidencePath, 'utf8')));
  const briefPath = join(out, 'brief.json');
  const sitePath = join(out, 'site', 'index.html');
  writeFileSync(briefPath, JSON.stringify(story));
  const render = spawnSync(process.execPath, [join(scripts, 'render-story-page.mjs'), '--brief', briefPath, '--out', sitePath], { cwd: out, encoding: 'utf8' });
  assert.equal(render.status, 0, render.stderr);
  const reportPath = join(out, 'verification.json');
  const verifyRun = spawnSync(process.execPath, [join(scripts, 'verify-story-page.mjs'), '--brief', briefPath, '--site', sitePath, '--evidence', evidencePath, '--pkg', packageRoot, '--json', reportPath], { cwd: out, encoding: 'utf8' });
  assert.equal(verifyRun.status, 0, verifyRun.stderr);
  assert.equal(existsSync(reportPath), true, `status=${verifyRun.status} signal=${verifyRun.signal}\nstdout=${verifyRun.stdout}\nstderr=${verifyRun.stderr}`);
  assert.equal(JSON.parse(readFileSync(reportPath, 'utf8')).pass, true);

  writeFileSync(briefPath, Buffer.from([0xc3, 0x28]));
  const invalidUtf8Run = spawnSync(process.execPath, [
    join(scripts, 'verify-story-page.mjs'), '--brief', briefPath, '--site', sitePath,
    '--evidence', evidencePath, '--pkg', packageRoot,
  ], { cwd: out, encoding: 'utf8' });
  assert.equal(invalidUtf8Run.status, 1);
  assert.match(invalidUtf8Run.stderr, /source is not valid UTF-8/);
  assert.doesNotMatch(invalidUtf8Run.stderr, /changed while it was being read/);
});

test('input budgets fail before parser renderer or schema traversal', () => {
  const exactJson = (bytes) => 'x'.repeat(bytes - 2);
  for (const limit of [BRIEF_BYTE_LIMIT, EVIDENCE_BYTE_LIMIT]) {
    assert.equal(safeJsonBudget(exactJson(limit - 1), limit, 'probe').pass, true);
    assert.equal(safeJsonBudget(exactJson(limit), limit, 'probe').pass, true);
    assert.equal(safeJsonBudget(exactJson(limit + 1), limit, 'probe').pass, false);
  }
  const malformedParsed = parseBudgetedJson({ pass: true, serialized: '{' }, 'probe');
  assert.equal(malformedParsed.pass, false);
  assert.equal(malformedParsed.value, null);
  assert.match(malformedParsed.detail, /^probe serialized JSON cannot be parsed:/);
  assert.deepEqual(parseBudgetedJson({ pass: true, serialized: '{"ok":true}' }, 'probe'), {
    pass: true, value: { ok: true }, detail: 'probe serialized JSON parsed',
  });

  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const cyclic = { ...fixture.story };
  cyclic.self = cyclic;
  assertCheck(verifyStoryPage(cyclic, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot }), 'brief.input');
  assertCheck(verifyStoryPage(fixture.story, html, { evidence: { value: 1n }, packageRoot: fixture.packageRoot }), 'evidence.input');
  const throwing = {};
  Object.defineProperty(throwing, 'schema', { enumerable: true, get() { throw new Error('getter sentinel'); } });
  assertCheck(verifyStoryPage(throwing, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot }), 'brief.input');

  const oversizedPage = `${html}${'x'.repeat(PAGE_BYTE_LIMIT - Buffer.byteLength(html) + 1)}`;
  const overPage = verifyStoryPage(fixture.story, oversizedPage, {
    evidence: fixture.evidence,
    packageRoot: fixture.packageRoot,
  });
  assertCheck(overPage, 'page.input');
  assert.equal(overPage.checks.some((check) => check.id === 'page.html-parser-threw'), false);
  assert.equal(overPage.checks.some((check) => check.id === 'page.canonical-renderer-threw'), false);
  const overPageSemantic = verifyStorySemantics(fixture.story, oversizedPage);
  assertCheck(overPageSemantic, 'page.html-parser-threw', true);
  assertCheck(overPageSemantic, 'page.semantic-query-threw', true);
  assert.equal(overPageSemantic.checks.find((check) => check.id === 'page.html-parser-threw')?.detail,
    'parser was not attempted after page input failure');
  assert.equal(overPageSemantic.checks.find((check) => check.id === 'page.semantic-query-threw')?.detail,
    'semantic query was not attempted after page input failure');

  const tooMany = fixtureStory();
  tooMany.story.reuse = Array.from({ length: 201 }, (_, index) => ({
    host: `host-${index}`, status: 'unknown', note: 'unknown', sourceIds: [],
  }));
  const overShape = verifyStoryPage(tooMany.story, '', {
    evidence: tooMany.evidence,
    packageRoot: tooMany.packageRoot,
  });
  assertCheck(overShape, 'brief.shape');
  assert.equal(overShape.checks.some((check) => check.id === 'page.html-parser-threw'), false);
  assert.equal(overShape.checks.some((check) => check.id === 'page.canonical-renderer-threw'), false);

  for (const [owner, mutate, checkId] of [
    ['brief', (deep) => { deep.story.deep = {}; return deep.story.deep; }, 'brief.shape'],
    ['evidence', (deep) => { deep.evidence.deep = {}; return deep.evidence.deep; }, 'evidence.shape'],
  ]) {
    const deep = fixtureStory();
    const deepHtml = renderStoryPage(deep.story);
    let cursor = mutate(deep);
    for (let depth = 0; depth <= STRUCTURED_DEPTH_LIMIT; depth += 1) {
      cursor.next = {};
      cursor = cursor.next;
    }
    let deepResult;
    assert.doesNotThrow(() => {
      deepResult = verifyStoryPage(deep.story, deepHtml, { evidence: deep.evidence, packageRoot: deep.packageRoot });
    }, `${owner} depth must return a verdict`);
    assertCheck(deepResult, checkId);
    assert.match(deepResult.checks.find((check) => check.id === checkId)?.detail ?? '', /nesting depth exceeds 64/);
  }
});

test('extractor enforces pre-read package source and aggregate byte ceilings', () => {
  const jsonAt = (bytes) => {
    const base = JSON.stringify({ name: '@fixture/budget', version: '1.0.0', pad: '' });
    return JSON.stringify({ name: '@fixture/budget', version: '1.0.0', pad: 'x'.repeat(bytes - Buffer.byteLength(base)) });
  };
  for (const delta of [-1, 0]) {
    const root = temp(`story-package-budget-${delta}`);
    writeFileSync(join(root, 'package.json'), jsonAt(PACKAGE_JSON_BYTE_LIMIT + delta));
    assert.equal(Buffer.byteLength(readFileSync(join(root, 'package.json'))), PACKAGE_JSON_BYTE_LIMIT + delta);
    assert.equal(extractPackageEvidence(root).package.name, '@fixture/budget');
  }
  const overPackage = temp('story-package-budget-over');
  writeFileSync(join(overPackage, 'package.json'), jsonAt(PACKAGE_JSON_BYTE_LIMIT + 1));
  assert.throws(() => extractPackageEvidence(overPackage), /package\.json exceeds 262144 bytes before read/);

  let oversizedReads = 0;
  const oversizedDescriptor = readDescriptorBounded(join(overPackage, 'package.json'), PACKAGE_JSON_BYTE_LIMIT, PACKAGE_JSON_BYTE_LIMIT, {
    readFileSync() { oversizedReads += 1; throw new Error('oversized file must not be read'); },
  });
  assert.equal(oversizedDescriptor.kind, 'oversized');
  assert.equal(oversizedReads, 0);
  assert.throws(() => noFollowReadFlags({ O_RDONLY: 0 }), /O_NOFOLLOW is unavailable/);
  assert.equal(noFollowReadFlags({ O_RDONLY: 1, O_NOFOLLOW: 2 }), 3,
    'descriptor reads must combine O_RDONLY with O_NOFOLLOW');

  let descriptorStats = 0;
  assert.throws(() => readDescriptorBounded('changing.md', 16, 16, {
    constants: { O_RDONLY: 1, O_NOFOLLOW: 2 },
    openSync() { return 42; },
    fstatSync() {
      descriptorStats += 1;
      return { isFile: () => true, size: descriptorStats === 1 ? 3 : 4 };
    },
    readFileSync() { return Buffer.from('abc'); },
    closeSync() {},
  }), /source changed during bounded descriptor read: changing\.md/,
  'a descriptor whose size changes across the read must fail closed');

  const invalidUtf8Root = temp('story-invalid-utf8-source');
  const invalidUtf8Path = join(invalidUtf8Root, 'invalid.md');
  writeFileSync(invalidUtf8Path, Buffer.from([0xc3, 0x28]));
  assert.throws(
    () => readDescriptorBounded(invalidUtf8Path, SOURCE_BYTE_LIMIT),
    /source is not valid UTF-8/,
  );

  for (const delta of [-1, 0, 1]) {
    const readmeRoot = fixturePackage();
    writeFileSync(join(readmeRoot, 'README.md'), 'r'.repeat(SOURCE_BYTE_LIMIT + delta));
    const evidence = extractPackageEvidence(readmeRoot);
    assert.equal(evidence.sources.some((source) => source.path === 'README.md'), delta <= 0, `README boundary delta ${delta}`);
  }

  const individual = fixturePackage();
  writeFileSync(join(individual, 'README.md'), 'r'.repeat(SOURCE_BYTE_LIMIT + 1));
  writeFileSync(join(individual, 'test', 'boundary.mjs'), 's'.repeat(SOURCE_BYTE_LIMIT));
  const individualEvidence = extractPackageEvidence(individual);
  assert.equal(individualEvidence.sources.some((source) => source.path === 'README.md'), false);
  assert.equal(individualEvidence.sources.some((source) => source.path === 'test/boundary.mjs'), true);
  assert.ok(individualEvidence.unknowns.some((value) => value.includes('oversized source skipped before read: README.md')));

  const aggregateFixture = (targetBytes, trailingBytes = 0) => {
    const aggregateRoot = temp(`story-aggregate-${targetBytes}-${trailingBytes}`);
    mkdirSync(join(aggregateRoot, 'test'));
    const packageBody = JSON.stringify({ name: '@fixture/aggregate', version: '1.0.0' });
    writeFileSync(join(aggregateRoot, 'package.json'), packageBody);
    let remaining = targetBytes - Buffer.byteLength(packageBody);
    let index = 0;
    while (remaining > 0) {
      const bytes = Math.min(SOURCE_BYTE_LIMIT, remaining);
      writeFileSync(join(aggregateRoot, 'test', `${String(index).padStart(2, '0')}.mjs`), 'a'.repeat(bytes));
      remaining -= bytes;
      index += 1;
    }
    if (trailingBytes > 0) writeFileSync(join(aggregateRoot, 'test', 'zz-extra.mjs'), 'z'.repeat(trailingBytes));
    return aggregateRoot;
  };
  for (const target of [SOURCE_AGGREGATE_BYTE_LIMIT - 1, SOURCE_AGGREGATE_BYTE_LIMIT]) {
    const evidence = extractPackageEvidence(aggregateFixture(target));
    assert.equal(evidence.truncation.sourceFiles.aggregateBytes, target);
    assert.equal(evidence.truncation.sourceFiles.aggregateSkipped, 0);
  }
  const aggregateEvidence = extractPackageEvidence(aggregateFixture(SOURCE_AGGREGATE_BYTE_LIMIT, 1));
  assert.equal(aggregateEvidence.truncation.sourceFiles.aggregateBytes, SOURCE_AGGREGATE_BYTE_LIMIT);
  assert.equal(aggregateEvidence.truncation.sourceFiles.aggregateSkipped, 1);
  assert.ok(aggregateEvidence.unknowns.some((value) => value.includes('aggregate source budget skipped before read')));
});

test('parse5 repair is rejected by the emitted subset', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const repaired = [
    html.replace('<html lang="ru">', '').replace('</html>', ''),
    html.replace('<head>', '').replace('</head>', ''),
    html.replace('<body data-story-schema="package-story-brief/1">', '').replace('</body>', ''),
    html.replace('</main>', '<table><tr><td>repair</td></tr></table></main>'),
    html.replace('</main>', '<svg><title>foreign</title></svg></main>'),
    html.replace('</main>', '<template><p>hidden</p></template></main>'),
    html.replace('</p>', ''),
    html.replace('</li>', ''),
  ];
  for (const page of repaired) assertCheck(verify(fixture, page), 'page.html-subset');

  const missingDoctype = verify(fixture, html.replace('<!doctype html>\n', ''));
  assertCheck(missingDoctype, 'page.html-parse');
  assertCheck(missingDoctype, 'page.structure');
  assert.match(missingDoctype.checks.find((item) => item.id === 'page.html-parse')?.detail ?? '', /missing-doctype/);

  const twice = verify(fixture, html.replace('</main>', '< details></ details></main>'));
  const parseCheck = twice.checks.find((item) => item.id === 'page.html-parse');
  const repeat = verify(fixture, html.replace('</main>', '< details></ details></main>'));
  const repeatCheck = repeat.checks.find((item) => item.id === 'page.html-parse');
  assert.ok(parseCheck, 'first deterministic parse receipt must exist');
  assert.ok(repeatCheck, 'repeated deterministic parse receipt must exist');
  assertCheck(twice, 'page.html-parse');
  assertCheck(repeat, 'page.html-parse');
  assert.ok(parseCheck.detail.length > 0);
  assert.equal(parseCheck.detail, repeatCheck.detail);
});

test('module parser environment is fail closed while caller NODE_OPTIONS is stripped', () => {
  assert.deepEqual(moduleRequestSpecifiers({ moduleRequests: [{ specifier: 'node:crypto' }] }), ['node:crypto']);
  assert.deepEqual(moduleRequestSpecifiers({ dependencySpecifiers: ['node:crypto'] }), ['node:crypto']);
  assert.deepEqual(moduleRequestSpecifiers({ moduleRequests: [], dependencySpecifiers: ['node:crypto'] }), ['node:crypto']);
  assert.deepEqual(moduleRequestSpecifiers({ moduleRequests: [], dependencySpecifiers: [] }), []);
  assert.equal(moduleRequestSpecifiers({}), null);
  assert.equal(moduleRequestSpecifiers({ moduleRequests: [{ specifier: 42 }], dependencySpecifiers: ['node:crypto'] }), null);
  for (const [run, detail] of [
    [{ status: 1, signal: null, stdout: '', stderr: 'environment failed' }, 'empty parser response'],
    [{ status: null, signal: 'SIGTERM', stdout: '', stderr: '' }, 'terminated by SIGTERM'],
    [{ status: 0, signal: null, stdout: 'not-json', stderr: '' }, 'invalid JSON response'],
    [{ status: 0, signal: null, stdout: '', stderr: '' }, 'empty parser response'],
    [{ status: null, signal: null, stdout: '', stderr: '', error: new Error('spawn unavailable') }, 'spawn unavailable'],
  ]) {
    const classified = classifyStaticModuleParserRun(run, 'entry.mjs');
    assert.deepEqual(classified.specifiers, []);
    assert.match(classified.failure, new RegExp(detail));
  }
  assert.deepEqual(
    classifyStaticModuleParserRun({
      status: 1, signal: null, stdout: JSON.stringify({ kind: 'source-rejection', message: 'Unexpected token' }), stderr: 'SyntaxError',
    }, 'entry.mjs'),
    { specifiers: [], failure: 'entry.mjs: Node module parser rejected source: Unexpected token' },
  );
  assert.deepEqual(
    classifyStaticModuleParserRun({
      status: 1, signal: null, stdout: JSON.stringify({ kind: 'parser-unavailable', message: 'ENV_SENTINEL' }), stderr: 'EnvironmentError',
    }, 'entry.mjs'),
    { specifiers: [], failure: 'entry.mjs: Node module parser unavailable: ENV_SENTINEL' },
  );
  assert.deepEqual(
    classifyStaticModuleParserRun({ status: 0, signal: null, stdout: JSON.stringify({ kind: 'parser-unavailable', message: 'ENV_SENTINEL' }) }, 'entry.mjs'),
    { specifiers: [], failure: 'entry.mjs: Node module parser unavailable: ENV_SENTINEL' },
  );
  assert.deepEqual(
    classifyStaticModuleParserRun({ status: 0, signal: null, stdout: JSON.stringify({ kind: 'requests', specifiers: ['node:crypto'] }) }, 'entry.mjs'),
    { specifiers: ['node:crypto'], failure: null },
  );
  assert.deepEqual(
    classifyStaticModuleParserRun({ status: 1, signal: null, stdout: JSON.stringify({ kind: 'requests', specifiers: ['node:crypto'] }) }, 'entry.mjs'),
    { specifiers: [], failure: 'entry.mjs: Node module parser unavailable: request response exited with status 1' },
  );
  assert.deepEqual(
    classifyStaticModuleParserRun({ status: 0, signal: null, stdout: JSON.stringify({ kind: 'requests', specifiers: [42] }) }, 'entry.mjs'),
    { specifiers: [], failure: 'entry.mjs: Node module parser unavailable: request response has a non-string specifier at index 0' },
  );
  const rejected = classifyStaticModuleParserRun({
    status: 0, signal: null, stdout: JSON.stringify({ kind: 'source-rejection', message: 'Unexpected token' }),
  }, 'entry.mjs');
  assert.deepEqual(rejected, { specifiers: [], failure: 'entry.mjs: Node module parser rejected source: Unexpected token' });

  const preload = 'data:text/javascript,import%20vm%20from%20%22node:vm%22%3Bimport%7BsyncBuiltinESMExports%7Dfrom%22node:module%22%3Bvm.SourceTextModule%3Dclass%7Bconstructor()%7Bconst%20e%3Dnew%20Error(%22ENV_SENTINEL%22)%3Be.name%3D%22EnvironmentError%22%3Bthrow%20e%7D%7D%3BsyncBuiltinESMExports()%3B';
  const hostileEnvironment = { ...process.env, NODE_OPTIONS: `--import=${preload}` };
  const baseline = parseStaticModuleSpecifiers("import 'node:crypto';", 'entry.mjs', process.env);
  assert.deepEqual(
    parseStaticModuleSpecifiers("import 'node:crypto';", 'entry.mjs', hostileEnvironment),
    baseline,
  );
  assert.equal(hostileEnvironment.NODE_OPTIONS, `--import=${preload}`, 'caller environment must not be mutated');
  assert.deepEqual(parserChildEnvironment({ NODE_OPTIONS: 'one', Node_Options: 'two', KEEP: 'yes' }), { KEEP: 'yes' });
});

test('style authority hashes exact parse5-located source bytes', () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const mixedCaseClose = html.replace('</style>', '</STYLE>');
  assertCheck(verify(fixture, mixedCaseClose), 'page.html-subset', true);
  assertCheck(verify(fixture, mixedCaseClose), 'page.style-authority', true);
  for (const changed of [html.replace('<style>\n', '<style>\r\n'), html.replace('<style>\n', '<style>\r')]) {
    assertCheck(verify(fixture, changed), 'page.style-authority');
  }
});

test('checked-in parser bundle stays within the reviewed byte ceiling', () => {
  const bundleBytes = statSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')).size;
  assert.ok(bundleBytes <= PARSER_BUNDLE_BYTE_LIMIT, `parse5 bundle is ${bundleBytes}/${PARSER_BUNDLE_BYTE_LIMIT} bytes`);

  const isolated = temp('story-bundle-ceiling');
  const isolatedScripts = join(isolated, 'scripts');
  const isolatedVendor = join(isolated, 'vendor');
  mkdirSync(isolatedScripts, { recursive: true });
  mkdirSync(isolatedVendor, { recursive: true });
  for (const name of [
    'extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs',
    'verify-story-semantics.mjs', 'verify-story-page.mjs',
  ]) writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), 'x'.repeat(PARSER_BUNDLE_BYTE_LIMIT + 1));
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href)});`], {
    encoding: 'utf8', timeout: 10_000,
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /semantic pre-import integrity gate failed: vendor\/parse5\.bundle\.mjs is 524289\/524288 bytes/);
});

test('all 24 authored field kinds and every fixture occurrence stay in their exact owner slot', () => {
  const fixture = fixtureStory();
  const table = fixtureFieldRows(fixture.story);
  const expected = table.map(([path]) => path);
  const html = renderStoryPage(fixture.story);
  const actual = [...html.matchAll(/data-story-field="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(actual.sort(), expected.sort());
  assert.equal(table.length, 39, 'the fixed fixture has 39 occurrences across 24 authored field kinds');
  assert.equal(AUTHORED_FIELD_KINDS.length, 24);
  assert.equal(new Set(AUTHORED_FIELD_KINDS).size, 24);
  assert.deepEqual([...new Set(table.map(([path]) => authoredFieldKind(path)))].sort(), [...AUTHORED_FIELD_KINDS].sort());
  assert.equal(new Set(actual).size, actual.length);
  assertCheck(verify(fixture, html), 'page.item-copy', true);

  for (const [path, rawValue] of table) {
    const marker = `data-story-field="${path}"`;
    const markerIndex = html.indexOf(marker);
    const value = escapeHtml(rawValue);
    const valueIndex = html.indexOf(value, markerIndex + marker.length);
    assert.ok(markerIndex >= 0 && valueIndex > markerIndex, `fixture must expose ${path} after its marker`);
    const relocated = `${html.slice(0, valueIndex)}${html.slice(valueIndex + value.length)}`
      .replace('</main>', `<p>${value}</p></main>`);
    const result = verify(fixture, relocated);
    assertCheck(result, 'page.copy', true);
    assertCheck(result, 'page.item-copy');
    assert.match(result.checks.find((check) => check.id === 'page.item-copy')?.detail ?? '', new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  delete fixture.story.hero.eyebrow;
  const without = renderStoryPage(fixture.story);
  assert.equal(without.includes('data-story-field="hero.eyebrow"'), false);
  assertCheck(verify(fixture, without), 'page.item-copy', true);
});

test('semantic exceptions become stable named failures', async () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const exceptionIds = ['page.html-parser-threw', 'page.semantic-query-threw', 'page.canonical-renderer-threw'];
  const canonicalSemantic = verifyStorySemantics(fixture.story, html);
  assert.deepEqual(canonicalSemantic.checks.map((check) => check.id), SEMANTIC_CHECK_IDS);
  assert.equal(new Set(canonicalSemantic.checks.map((check) => check.id)).size, SEMANTIC_CHECK_IDS.length);
  const overLimitSemantic = verifyStorySemantics(fixture.story, 'x'.repeat(1_048_577));
  assert.deepEqual(overLimitSemantic.checks.map((check) => check.id), SEMANTIC_CHECK_IDS);
  assert.equal(new Set(overLimitSemantic.checks.map((check) => check.id)).size, SEMANTIC_CHECK_IDS.length);
  assert.deepEqual(
    overLimitSemantic.checks.filter((check) => check.pass).map((check) => check.id),
    ['page.html-parser-threw', 'page.semantic-query-threw'],
  );
  assert.equal(overLimitSemantic.checks.find((check) => check.id === 'page.html-parser-threw')?.detail,
    'parser was not attempted after page input failure');
  assert.equal(overLimitSemantic.checks.find((check) => check.id === 'page.semantic-query-threw')?.detail,
    'semantic query was not attempted after page input failure');
  assert.ok(overLimitSemantic.checks.filter((check) => !check.pass).every((check) => /not evaluated: page exceeds/.test(check.detail)));
  for (const [fault, redId] of [
    ['parser', 'page.html-parser-threw'],
    ['query', 'page.semantic-query-threw'],
    ['renderer', 'page.canonical-renderer-threw'],
  ]) {
    const isolated = temp(`story-${fault}-exception`);
    const isolatedScripts = join(isolated, 'scripts');
    const isolatedVendor = join(isolated, 'vendor');
    mkdirSync(isolatedScripts, { recursive: true });
    mkdirSync(isolatedVendor, { recursive: true });
    for (const name of ['extract-package-evidence.mjs', 'story-schema.mjs']) {
      writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
    }
    let semanticSource = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
    let rendererSource = readFileSync(join(scripts, 'render-story-page.mjs'), 'utf8');
    if (fault === 'parser') {
      semanticSource = semanticSource.replace(
        '    document = parse(pageText, {',
        "    throw new Error('injected parser failure');\n    document = parse(pageText, {",
      );
    } else if (fault === 'query') {
      semanticSource = semanticSource.replace(
        '    const nodes = elements(document);',
        "    throw new Error('injected semantic query failure');\n    const nodes = elements(document);",
      );
    } else {
      rendererSource = rendererSource.replace(
        'export function renderStoryPage(brief) {',
        "export function renderStoryPage(brief) {\n  throw new Error('injected renderer failure');",
      );
    }
    writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), semanticSource);
    writeFileSync(join(isolatedScripts, 'render-story-page.mjs'), rendererSource);
    writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
    const wrapperSource = authorizePreImportProjection(
      readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8'), isolated,
    );
    writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), wrapperSource);
    const isolatedVerifier = await import(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?exception=${fault}`);
    const result = isolatedVerifier.verifyStoryPage(fixture.story, html, {
      evidence: fixture.evidence, packageRoot: fixture.packageRoot,
    });
    const semanticChecks = result.checks.filter((check) => SEMANTIC_CHECK_IDS.includes(check.id));
    assert.deepEqual(semanticChecks.map((check) => check.id), SEMANTIC_CHECK_IDS, `${fault}: semantic verdict inventory`);
    assert.equal(new Set(semanticChecks.map((check) => check.id)).size, SEMANTIC_CHECK_IDS.length, `${fault}: semantic verdict uniqueness`);
    for (const id of exceptionIds) {
      const matches = result.checks.filter((check) => check.id === id);
      assert.equal(matches.length, 1, `${fault}: ${id} must occur exactly once`);
      assert.equal(matches[0].pass, id !== redId, `${fault}: only ${redId} is red among exception classes`);
    }
    if (fault === 'parser') {
      assert.equal(
        result.checks.find((check) => check.id === 'page.semantic-query-threw')?.detail,
        'semantic query was not attempted after parser failure',
      );
      assert.equal(result.checks.find((check) => check.id === 'page.html-parse')?.detail, 'not evaluated: parser failed');
    }
  }
});

test('unexpected semantic authority exceptions become a named public verdict', async () => {
  const isolated = temp('story-semantic-outer-exception');
  const isolatedScripts = join(isolated, 'scripts');
  const isolatedVendor = join(isolated, 'vendor');
  mkdirSync(isolatedScripts, { recursive: true });
  mkdirSync(isolatedVendor, { recursive: true });
  for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
    writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
  }
  let semanticSource = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
  semanticSource = semanticSource.replace(
    'export function verifyStorySemantics(brief, page) {',
    "export function verifyStorySemantics(brief, page) {\n  throw new Error('injected outer semantic failure');",
  );
  assert.match(semanticSource, /injected outer semantic failure/);
  writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), semanticSource);
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
  const wrapperSource = authorizePreImportProjection(
    readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8'), isolated,
  );
  writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), wrapperSource);
  const verifier = await import(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?outer-semantic=1`);
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  let result;
  assert.doesNotThrow(() => {
    result = verifier.verifyStoryPage(fixture.story, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot });
  });
  assertCheck(result, 'page.canonical-renderer-threw', true);
  assertCheck(result, 'page.semantic-authority-threw');
  assert.match(result.checks.find((check) => check.id === 'page.semantic-authority-threw')?.detail ?? '', /injected outer semantic failure/);
});

test('malformed semantic authority results become a named public verdict', async () => {
  const isolated = temp('story-semantic-malformed-result');
  const originalSemantic = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
  const originalWrapper = readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8');
  assert.deepStrictEqual(EXPECTED_SEMANTIC_CHECK_IDS, SEMANTIC_CHECK_IDS,
    'the wrapper-owned expected inventory must agree with the independently authored semantic module');
  for (const [label, injected, marker] of [
    ['checks', 'return { checks: null };', /malformed result/],
    ['nodes', "return { checks: SEMANTIC_CHECK_IDS.map((id) => ({ id, pass: true, detail: 'injected' })), styleText: '', nodes: {} };", /malformed result/],
    ['node-attrs', "return { checks: SEMANTIC_CHECK_IDS.map((id) => ({ id, pass: true, detail: 'injected' })), styleText: '', nodes: [{ tagName: 'main', attrs: {} }] };", /malformed node/],
    ['partial-checks', "return { checks: [{ id: 'page.html-parser-threw', pass: true, detail: 'partial' }], styleText: '', nodes: [] };", /unexpected check inventory/],
    ['reordered-checks', "return { checks: [...SEMANTIC_CHECK_IDS].reverse().map((id) => ({ id, pass: true, detail: 'reordered' })), styleText: '', nodes: [] };", /unexpected check inventory/],
  ]) {
    const caseRoot = join(isolated, label);
    const isolatedScripts = join(caseRoot, 'scripts');
    const isolatedVendor = join(caseRoot, 'vendor');
    mkdirSync(isolatedScripts, { recursive: true });
    mkdirSync(isolatedVendor, { recursive: true });
    for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
      writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
    }
    writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
    const semanticSource = originalSemantic.replace(
      'export function verifyStorySemantics(brief, page) {',
      `export function verifyStorySemantics(brief, page) {\n  ${injected}`,
    );
    writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), semanticSource);
    const wrapperSource = authorizePreImportProjection(originalWrapper, caseRoot);
    writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), wrapperSource);
    const verifier = await import(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?outer-semantic=malformed-${label}`);
    const fixture = fixtureStory();
    const html = renderStoryPage(fixture.story);
    let result;
    assert.doesNotThrow(() => {
      result = verifier.verifyStoryPage(fixture.story, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot });
    });
    assertCheck(result, 'page.semantic-authority-threw');
    assert.match(result.checks.find((check) => check.id === 'page.semantic-authority-threw')?.detail ?? '', marker);
  }

  const coDropRoot = join(isolated, 'co-dropped-check-and-module-inventory');
  const coDropScripts = join(coDropRoot, 'scripts');
  const coDropVendor = join(coDropRoot, 'vendor');
  mkdirSync(coDropScripts, { recursive: true });
  mkdirSync(coDropVendor, { recursive: true });
  for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
    writeFileSync(join(coDropScripts, name), readFileSync(join(scripts, name)));
  }
  writeFileSync(join(coDropVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
  const coDropInventoryNeedle = "'page.style-authority', 'page.links', 'page.item-copy'";
  const coDropVerdictNeedle = "    pushCheck(checks, 'page.links', linkProblems.length === 0, linkProblems.length === 0 ? 'all links are closed and data-bound' : linkProblems.join('; '));";
  assert.equal(originalSemantic.split(coDropInventoryNeedle).length - 1, 1, 'co-drop inventory target must be unique');
  assert.equal(originalSemantic.split(coDropVerdictNeedle).length - 1, 1, 'co-drop verdict target must be unique');
  const coDroppedSemantic = originalSemantic
    .replace(coDropInventoryNeedle, "'page.style-authority', 'page.item-copy'")
    .replace(coDropVerdictNeedle, '');
  assert.notEqual(coDroppedSemantic, originalSemantic, 'co-dropped semantic inventory mutation must land');
  assert.doesNotMatch(coDroppedSemantic, /pushCheck\(checks, 'page\.links'/,
    'co-drop must remove the producing verdict as well as the semantic module inventory entry');
  writeFileSync(join(coDropScripts, 'verify-story-semantics.mjs'), coDroppedSemantic);
  writeFileSync(join(coDropScripts, 'verify-story-page.mjs'), authorizePreImportProjection(originalWrapper, coDropRoot));
  const coDropVerifier = await import(`${pathToFileURL(join(coDropScripts, 'verify-story-page.mjs')).href}?outer-semantic=co-dropped-inventory`);
  const coDropFixture = fixtureStory();
  const coDropResult = coDropVerifier.verifyStoryPage(coDropFixture.story, renderStoryPage(coDropFixture.story), {
    evidence: coDropFixture.evidence, packageRoot: coDropFixture.packageRoot,
  });
  assertCheck(coDropResult, 'page.semantic-authority-threw');
  assert.match(coDropResult.checks.find((check) => check.id === 'page.semantic-authority-threw')?.detail ?? '', /unexpected check inventory/);

  const extraRoot = join(isolated, 'semantic-extra-check');
  const extraScripts = join(extraRoot, 'scripts');
  const extraVendor = join(extraRoot, 'vendor');
  mkdirSync(extraScripts, { recursive: true });
  mkdirSync(extraVendor, { recursive: true });
  for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
    writeFileSync(join(extraScripts, name), readFileSync(join(scripts, name)));
  }
  writeFileSync(join(extraVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
  const extraNeedle = 'export function verifyStorySemantics(brief, page) {\n  const checks = [];';
  assert.equal(originalSemantic.split(extraNeedle).length - 1, 1, 'extra-check injection target must be unique');
  const extraSemantic = originalSemantic.replace(
    extraNeedle,
    `${extraNeedle}\n  pushCheck(checks, 'page.unexpected-injected', true, 'injected unexpected verdict');`,
  );
  writeFileSync(join(extraScripts, 'verify-story-semantics.mjs'), extraSemantic);
  writeFileSync(join(extraScripts, 'verify-story-page.mjs'), authorizePreImportProjection(originalWrapper, extraRoot));
  const extraVerifier = await import(`${pathToFileURL(join(extraScripts, 'verify-story-page.mjs')).href}?outer-semantic=extra-check`);
  const extraFixture = fixtureStory();
  const extraResult = extraVerifier.verifyStoryPage(extraFixture.story, renderStoryPage(extraFixture.story), {
    evidence: extraFixture.evidence, packageRoot: extraFixture.packageRoot,
  });
  assertCheck(extraResult, 'page.semantic-authority-threw');
  assert.match(extraResult.checks.find((check) => check.id === 'page.semantic-authority-threw')?.detail ?? '',
    /unexpected check inventory:.*page\.unexpected-injected/);

  const repeatedProofFixture = fixtureStory();
  const repeatedProofSourceId = repeatedProofFixture.story.claims[1].sourceIds[0];
  repeatedProofFixture.story.claims.push({
    id: 'repeated-proof-envelope', text: 'Версии 1 и 1', status: 'evidenced', sourceIds: [repeatedProofSourceId],
    numericEvidence: [
      { token: '1', context: 'version', sourceId: repeatedProofSourceId },
      { token: '1', context: 'missing-context', sourceId: repeatedProofSourceId },
    ],
  });
  const repeatedProofResult = verify(repeatedProofFixture);
  const repeatedProofIds = repeatedProofResult.checks.map((check) => check.id);
  assert.equal(new Set(repeatedProofIds).size, repeatedProofIds.length, 'the public check envelope must not contain duplicate IDs');
  assertCheck(repeatedProofResult, 'claim.repeated-proof-envelope.context.proof-1');
});

test('public verifier passes only the normalized brief and exact page to semantic authority', async () => {
  const fixture = fixtureStory();
  const html = renderStoryPage(fixture.story);
  const isolated = temp('story-semantic-call');
  const isolatedScripts = join(isolated, 'scripts');
  const isolatedVendor = join(isolated, 'vendor');
  mkdirSync(isolatedScripts, { recursive: true });
  mkdirSync(isolatedVendor, { recursive: true });
  for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
    writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
  }
  let semanticSource = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
  semanticSource = semanticSource.replace(
    'export function verifyStorySemantics(brief, page) {',
    "export function verifyStorySemantics(brief, page) {\n  throw new Error('SEMANTIC_CALL:' + JSON.stringify({ argc: arguments.length, brief, page }));",
  );
  writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), semanticSource);
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
  const wrapperSource = authorizePreImportProjection(
    readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8'), isolated,
  );
  writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), wrapperSource);
  const isolatedVerifier = await import(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?semantic-call`);
  const boxed = { toJSON: () => structuredClone(fixture.story) };
  const callResult = isolatedVerifier.verifyStoryPage(boxed, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot });
  assertCheck(callResult, 'page.semantic-authority-threw');
  const callDetail = callResult.checks.find((check) => check.id === 'page.semantic-authority-threw')?.detail ?? '';
  assert.match(callDetail, /SEMANTIC_CALL:/);
  const receipt = JSON.parse(callDetail.slice(callDetail.indexOf('SEMANTIC_CALL:') + 'SEMANTIC_CALL:'.length));
  assert.deepEqual(receipt, { argc: 2, brief: fixture.story, page: html });
  assert.notEqual(receipt.brief, boxed);

  assert.doesNotThrow(() => isolatedVerifier.verifyStoryPage({ schema: 'wrong' }, html, { evidence: fixture.evidence, packageRoot: fixture.packageRoot }),
    'schema rejection must precede semantic execution');
  assert.doesNotThrow(() => isolatedVerifier.verifyStoryPage(fixture.story, 'x'.repeat(PAGE_BYTE_LIMIT + 1), { evidence: fixture.evidence, packageRoot: fixture.packageRoot }),
    'page budget rejection must precede semantic execution');
});

test('defence-in-depth capability scanner recognises its bounded corpus', () => {
  const forbidden = [
    'globalThis.fetch("https://invalid")',
    "globalThis['fe' + 'tch']('https://invalid')",
    "const n = ['fe', 'tch'].join(''); globalThis[n]('https://invalid')",
    'globalThis[String.fromCharCode(102, 101, 116, 99, 104)]("https://invalid")',
    'const g = globalThis; g.fetch("https://invalid")',
    'const {fetch: request}=globalThis; request("https://invalid")',
    'const e=eval; e("1")',
    'const F=Function; F("return 1")',
    'globalThis.f\\u0065tch("https://invalid")',
    'Reflect.get(globalThis,"fetch")("https://invalid")',
    'global.fetch("https://invalid")',
    'Reflect["get"](globalThis,"fetch")("https://invalid")',
    'const {["fetch"]: request}=globalThis; request("https://invalid")',
    'const get=Reflect.get; get(globalThis,"fetch")("https://invalid")',
    'globalThis[`fetch`]("https://invalid")',
    'globalThis["f\\u{65}tch"]("https://invalid")',
    'const {fetch:request}=globalThis; request.call(null,"https://invalid")',
    'const e=eval; (0,e)("1")',
    '(0,eval)("1")',
    'eval?.("1")',
    'Function.call(null,"return 1")',
    'let e; e=eval; e("1")',
    '({fetch:request}=globalThis); request("https://invalid")',
    '[].filter.constructor("return 1")()',
    '[].filter["con"+"structor"]("return 1")()',
    '[].filter["constru\\u{63}tor"]("return 1")()',
    '[]["filter"][`con${""}structor`]("return 7")()',
    'Object.getOwnPropertyDescriptor(Object.getPrototypeOf(()=>{}),"constructor").value("return 7")()',
    'new WebSocket("ws://invalid")',
    "process['get' + 'BuiltinModule']('node:fs')",
    "process['dl' + 'open']()",
    'eval("1")',
    "globalThis['Func' + 'tion']('return 1')",
    'WebAssembly.compile(new Uint8Array())',
    'require("node:fs")',
    'import("./late.mjs")',
    "const pattern=/'/; globalThis.fetch('https://invalid')",
    'while(false) /"/.test("x"); globalThis.fetch("https://invalid")',
    'try {} catch {} /"/.test("x"); globalThis.fetch("https://invalid")',
    'class X {} /"/.test("x"); globalThis.fetch("https://invalid")',
  ];
  for (const [index, source] of forbidden.entries()) {
    const result = scanExecutableCapabilities([{ path: `mutant-${index}.mjs`, source }]);
    assert.equal(result.pass, false, source);
  }
  for (const source of [
    '// globalThis.fetch("https://decoy.invalid")',
    'const text = "globalThis.fetch(\\"https://decoy.invalid\\")";',
    'const pattern=/[\'"\\/]/g; export { pattern };',
    'const fetch = 1; export { fetch };',
    "const cssClass = 'process'; export { cssClass };",
  ]) assert.equal(scanExecutableCapabilities([{ path: 'negative-control.mjs', source }]).pass, true, source);

  const productionSemantic = readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8');
  assert.equal(scanExecutableCapabilities([{
    path: 'scripts/verify-story-semantics.mjs', source: productionSemantic,
  }]).pass, true, 'the authored production semantic module is scanned rather than exempted');

});

test('static semantic import graph closes exact specifier inventory', () => {
  const productionProjectionPaths = Object.keys(SEMANTIC_PROJECTION_SHA256).sort();
  const canonicalFiles = productionProjectionPaths.map((path) => ({
    path, source: readFileSync(join(root, 'package-story-page', path), 'utf8'),
  }));
  const semanticSource = canonicalFiles.find((file) => file.path === 'scripts/verify-story-semantics.mjs').source;
  const bundleSource = canonicalFiles.find((file) => file.path === 'vendor/parse5.bundle.mjs').source;
  const canonicalGraph = scanSemanticImportGraph(canonicalFiles);
  assert.equal(canonicalGraph.pass, true);
  assert.deepEqual(canonicalGraph.visited, productionProjectionPaths,
    'the graph input and visited closure must come from the production semantic projection map');
  assert.deepEqual(scanSemanticImportGraph(canonicalFiles, 'scripts/verify-story-semantics.mjs'), canonicalGraph);
  const helperPath = 'scripts/semantic-helper.mjs';
  const transitiveGraph = scanSemanticImportGraph([
    ...canonicalFiles.map((file) => file.path === 'scripts/verify-story-semantics.mjs'
      ? { ...file, source: `import './semantic-helper.mjs';\n${file.source}` } : file),
    { path: helperPath, source: "import 'node:fs'; export const helper = true;" },
  ]);
  assert.ok(transitiveGraph.visited.includes(helperPath), 'a newly reachable helper must be traversed');
  assert.ok(transitiveGraph.failures.includes(`${helperPath}: forbidden specifier node:fs`),
    'the transitive helper must receive the same closed bare-import policy');
  for (const [label, target] of [
    ['resolvable', './helper.mjs'],
    ['renderer-targeted', './render-story-page.mjs'],
  ]) {
    const dynamic = scanSemanticImportGraph([
      { path: 'entry.mjs', source: `import(${JSON.stringify(target)});` },
      { path: target.slice(2), source: 'export const reachable = true;' },
    ], 'entry.mjs');
    assert.equal(dynamic.pass, false, label);
    assert.ok(dynamic.failures.includes('entry.mjs: dynamic import forbidden'),
      `${label} dynamic import must fail for dynamism, not unresolved target`);
  }
  for (const source of [
    "const target = './helper.mjs'; import(target);",
    "import('./helper' + '.mjs');",
  ]) {
    const computedDynamic = scanSemanticImportGraph([
      { path: 'entry.mjs', source },
      { path: 'helper.mjs', source: 'export const reachable = true;' },
    ], 'entry.mjs');
    assert.equal(computedDynamic.pass, false, source);
    assert.ok(computedDynamic.failures.includes('entry.mjs: dynamic import forbidden'), source);
  }
  for (const specifier of ['https://evil.invalid/module.mjs', 'data:text/javascript,export default 1', 'file:///tmp/evil.mjs']) {
    const urlGraph = scanSemanticImportGraph([{
      path: 'entry.mjs', source: `import ${JSON.stringify(specifier)};`,
    }], 'entry.mjs');
    assert.equal(urlGraph.pass, false, specifier);
    assert.ok(urlGraph.failures.includes(`entry.mjs: forbidden specifier ${specifier}`), specifier);
  }
  const changedBundleGraph = scanSemanticImportGraph([
    { path: 'vendor/parse5.bundle.mjs', source: `${bundleSource}\nconst ratio=a/b; export { ratio };` },
  ], 'vendor/parse5.bundle.mjs');
  assert.equal(changedBundleGraph.pass, false, 'bundle path alone must not receive the generated-byte exemption');
  assert.ok(changedBundleGraph.failures.some((failure) => failure.includes('unclassified slash')));
  assert.equal(scanSemanticImportGraph([{ path: 'entry.mjs', source: "import 'node:crypto';" }], 'entry.mjs').pass, true);
  const runtimeBuiltins = [...new Set(builtinModules.flatMap((name) => {
    const bare = name.startsWith('node:') ? name.slice(5) : name;
    return [bare, `node:${bare}`];
  }))].filter((name) => name !== 'node:crypto').sort();
  assert.ok(runtimeBuiltins.length > 0, 'the runtime must expose builtins for the closed allowlist test');
  for (const [kind, makeSource] of [
    ['import', (specifier) => `import ${JSON.stringify(specifier)};`],
    ['re-export', (specifier) => `export * from ${JSON.stringify(specifier)};`],
  ]) {
    const source = runtimeBuiltins.map(makeSource).join('\n');
    const result = scanSemanticImportGraph([{ path: `builtin-${kind}.mjs`, source }], `builtin-${kind}.mjs`);
    assert.equal(result.pass, false, `${kind} builtin aggregate must be rejected`);
    for (const specifier of runtimeBuiltins) {
      assert.ok(result.failures.includes(`builtin-${kind}.mjs: forbidden specifier ${specifier}`), `${kind}: ${specifier}`);
    }
  }
  assert.equal(scanSemanticImportGraph([{ path: 'entry.mjs', source: "import 'crypto';" }], 'entry.mjs').pass, false);
  assert.equal(scanSemanticImportGraph([{ path: 'entry.mjs', source: "const pattern=/import 'node:fs'/; export const ok=1;" }], 'entry.mjs').pass, true);
  assert.equal(scanSemanticImportGraph([{ path: 'entry.mjs', source: 'const ratio=a/b/c; export { ratio };' }], 'entry.mjs').pass, false,
    'authored semantic modules reject ambiguous division slashes instead of guessing regex grammar');
  for (const source of [
    "let x=1,y=1; x++ / import('./evil.mjs') / y;",
    "let x=1; x++ / import('./evil.mjs') / 2;",
    "x++ /import('./evil.mjs')/y",
  ]) {
    const result = scanSemanticImportGraph([{ path: 'entry.mjs', source }], 'entry.mjs');
    assert.equal(result.pass, false, source);
    assert.ok(result.failures.some((failure) => failure.includes('ambiguous-dynamic-import-regex')), source);
  }
  assert.equal(scanSemanticImportGraph([{ path: 'entry.mjs', source: 'import {' }], 'entry.mjs').pass, false);
  for (const source of [
    "import 'node:fs';",
    "const pattern=/'/; import 'node:fs';",
    "if (true) /'/.test('x'); import 'node:fs';",
    "if (true) {} /'/.test('x'); import 'node:fs';",
    "class X {} /'/.test('x'); import 'node:fs';",
    "import '@scope/package';",
    "import './render-story-page.mjs';",
    "export * from './helper.mjs';",
    "import/*comment*/ './helper.mjs';",
    "import './node_modules/x.mjs';",
    "import('./late.mjs');",
    "import /* comment */ ('./late.mjs');",
    "if (false) import('./late.mjs');",
  ]) {
    const files = [{ path: 'entry.mjs', source }];
    if (source.includes('helper')) files.push({ path: 'helper.mjs', source: "import 'node:fs';" });
    if (source.includes('node_modules')) files.push({ path: 'node_modules/x.mjs', source: 'export const x = 1;' });
    if (source.includes('render-story')) files.push({ path: 'render-story-page.mjs', source: 'export const render = 1;' });
    assert.equal(scanSemanticImportGraph(files, 'entry.mjs').pass, false, source);
  }
});

test('production semantic graph blocks renderer and package lookup before execution', () => {
  const cases = [
    {
      label: 'renderer-import',
      statement: "import './render-story-page.mjs';",
      sentinel: 'RENDERER_SENTINEL_EXECUTED',
      rule: /semantic graph reaches canonical renderer/,
      arrange(isolated) {
        writeFileSync(join(isolated, 'scripts', 'render-story-page.mjs'), "throw new Error('RENDERER_SENTINEL_EXECUTED');\nexport const renderStoryPage = () => '';\n");
      },
    },
    {
      label: 'renderer-re-export',
      statement: "export * from './render-story-page.mjs';",
      sentinel: 'RENDERER_SENTINEL_EXECUTED',
      rule: /semantic graph reaches canonical renderer/,
      arrange(isolated) {
        writeFileSync(join(isolated, 'scripts', 'render-story-page.mjs'), "throw new Error('RENDERER_SENTINEL_EXECUTED');\nexport const renderStoryPage = () => '';\n");
      },
    },
    {
      label: 'package-import',
      statement: "import '@story/sentinel';",
      sentinel: 'PACKAGE_SENTINEL_EXECUTED',
      rule: /forbidden specifier @story\/sentinel/,
      arrange(isolated) {
        const target = join(isolated, 'node_modules', '@story', 'sentinel');
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, 'package.json'), JSON.stringify({ name: '@story/sentinel', type: 'module', exports: './index.mjs' }));
        writeFileSync(join(target, 'index.mjs'), "throw new Error('PACKAGE_SENTINEL_EXECUTED');\n");
      },
    },
    {
      label: 'package-re-export',
      statement: "export * from '@story/sentinel';",
      sentinel: 'PACKAGE_SENTINEL_EXECUTED',
      rule: /forbidden specifier @story\/sentinel/,
      arrange(isolated) {
        const target = join(isolated, 'node_modules', '@story', 'sentinel');
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, 'package.json'), JSON.stringify({ name: '@story/sentinel', type: 'module', exports: './index.mjs' }));
        writeFileSync(join(target, 'index.mjs'), "throw new Error('PACKAGE_SENTINEL_EXECUTED');\n");
      },
    },
  ];
  for (const scenario of cases) {
    const isolated = temp(`story-semantic-${scenario.label}`);
    const isolatedScripts = join(isolated, 'scripts');
    const isolatedVendor = join(isolated, 'vendor');
    mkdirSync(isolatedScripts, { recursive: true });
    mkdirSync(isolatedVendor, { recursive: true });
    for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
      writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
    }
    writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
    const semanticSource = `${readFileSync(join(scripts, 'verify-story-semantics.mjs'), 'utf8')}\n${scenario.statement}\n`;
    writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), semanticSource);
    scenario.arrange(isolated);
    const wrapper = authorizePreImportProjection(
      readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8'), isolated,
    );
    writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), wrapper);
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href)});`], {
      encoding: 'utf8', timeout: 30_000,
    });
    assert.notEqual(run.status, 0, scenario.label);
    assert.match(run.stderr, scenario.rule, scenario.label);
    assert.doesNotMatch(run.stderr, new RegExp(scenario.sentinel), scenario.label);
  }
});

test('semantic integrity gate runs before every changed closure can execute', () => {
  const isolated = temp('story-preimport-gate');
  const isolatedScripts = join(isolated, 'scripts');
  const isolatedVendor = join(isolated, 'vendor');
  mkdirSync(isolatedScripts, { recursive: true });
  mkdirSync(isolatedVendor, { recursive: true });
  for (const name of [
    'extract-package-evidence.mjs',
    'render-story-page.mjs',
    'story-schema.mjs',
    'verify-story-page.mjs',
  ]) writeFileSync(join(isolatedScripts, name), readFileSync(join(scripts, name)));
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
  const escapes = [
    'fetch("https://invalid")',
    'process.getBuiltinModule("node:fs")',
    'globalThis[`pro${"cess"}`].getBuiltinModule("node:fs")',
    'const {fetch: request}=globalThis; request("https://invalid")',
    'const e=eval; e("1")',
    'const F=Function; F("return 1")',
    'globalThis.f\\u0065tch("https://invalid")',
    'Reflect.get(globalThis,"fetch")("https://invalid")',
    'global.fetch("https://invalid")',
    'Reflect["get"](globalThis,"fetch")("https://invalid")',
    'const {["fetch"]: request}=globalThis; request("https://invalid")',
    'const get=Reflect.get; get(globalThis,"fetch")("https://invalid")',
    'globalThis[`fetch`]("https://invalid")',
    'globalThis["f\\u{65}tch"]("https://invalid")',
    'const {fetch:request}=globalThis; request.call(null,"https://invalid")',
    'const e=eval; (0,e)("1")',
    '(0,eval)("1")',
    'eval?.("1")',
    'Function.call(null,"return 1")',
    'let e; e=eval; e("1")',
    '({fetch:request}=globalThis); request("https://invalid")',
    '[].filter.constructor("return 1")()',
    '[].filter["con"+"structor"]("return 1")()',
    '[].filter["constru\\u{63}tor"]("return 1")()',
    '[]["filter"][`con${""}structor`]("return 7")()',
    'Object.getOwnPropertyDescriptor(Object.getPrototypeOf(()=>{}),"constructor").value("return 7")()',
  ];
  for (const [index, escape] of escapes.entries()) {
    writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), [
      `export const dormantEscape${index} = () => { ${escape}; };`,
      `throw new Error(${JSON.stringify(`SENTINEL_EXECUTED_${index}`)});`,
      'export const verifyStorySemantics = () => ({ checks: [] });',
    ].join('\n'));
    const run = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?escape=${index}`)});`,
    ], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(run.status, 0, `${escape}\n${run.stdout}\n${run.stderr}`);
    assert.equal(run.stderr.includes(`SENTINEL_EXECUTED_${index}`), false, `rejected semantic escape executed: ${escape}`);
    assert.match(run.stderr, /semantic pre-import integrity gate failed/);
  }
  const canonicalSemanticBytes = readFileSync(join(scripts, 'verify-story-semantics.mjs'));
  const invalidUtf8Semantic = Buffer.concat([canonicalSemanticBytes, Buffer.from([0xff])]);
  const invalidUtf8Hash = createHash('sha256').update(invalidUtf8Semantic).digest('hex');
  writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), invalidUtf8Semantic);
  const rawByteRun = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?raw-byte=1`)});`,
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(rawByteRun.status, 0, `${rawByteRun.stdout}\n${rawByteRun.stderr}`);
  assert.match(rawByteRun.stderr, /semantic pre-import integrity gate failed/);
  assert.match(rawByteRun.stderr, new RegExp(invalidUtf8Hash), 'integrity detail must report the raw-byte SHA-256');
  writeFileSync(join(isolatedScripts, 'verify-story-semantics.mjs'), readFileSync(join(scripts, 'verify-story-semantics.mjs')));
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), [
    'throw new Error("BUNDLE_SENTINEL_EXECUTED");',
    'export const parse = () => ({});',
  ].join('\n'));
  const bundleRun = spawnSync(process.execPath, [
    '--input-type=module',
    '-e',
    `await import(${JSON.stringify(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?bundle-sentinel=1`)});`,
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(bundleRun.status, 0, `${bundleRun.stdout}\n${bundleRun.stderr}`);
  assert.equal(bundleRun.stderr.includes('BUNDLE_SENTINEL_EXECUTED'), false, 'changed bundle executed before integrity rejection');
  assert.match(bundleRun.stderr, /semantic pre-import integrity gate failed/);
  writeFileSync(join(isolatedVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));

  for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs']) {
    const target = join(isolatedScripts, name);
    const original = readFileSync(join(scripts, name), 'utf8');
    const sentinel = `SUPPORT_SENTINEL_${name.replaceAll(/[^A-Za-z0-9]/g, '_')}`;
    writeFileSync(target, `${original}\nthrow new Error(${JSON.stringify(sentinel)});\n`);
    const run = spawnSync(process.execPath, [
      '--input-type=module',
      '-e',
      `await import(${JSON.stringify(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?support=${name}`)});`,
    ], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(run.status, 0, `${name}\n${run.stdout}\n${run.stderr}`);
    assert.doesNotMatch(run.stderr, new RegExp(sentinel), `${name} executed before integrity rejection`);
    assert.match(run.stderr, /semantic pre-import integrity gate failed/, name);
    writeFileSync(target, original);
  }

  const atomicInputs = [
    'scripts/verify-story-semantics.mjs',
    'vendor/parse5.bundle.mjs',
    'scripts/extract-package-evidence.mjs',
    'scripts/render-story-page.mjs',
    'scripts/story-schema.mjs',
  ];
  for (const projectionPath of atomicInputs) {
    const positiveRoot = temp(`story-preimport-atomic-positive-${atomicInputs.indexOf(projectionPath)}`);
    const positiveScripts = join(positiveRoot, 'scripts');
    const positiveVendor = join(positiveRoot, 'vendor');
    mkdirSync(positiveScripts, { recursive: true });
    mkdirSync(positiveVendor, { recursive: true });
    for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs', 'verify-story-semantics.mjs']) {
      writeFileSync(join(positiveScripts, name), readFileSync(join(scripts, name)));
    }
    writeFileSync(join(positiveVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
    const target = join(positiveRoot, projectionPath);
    const sentinel = `ATOMIC_${atomicInputs.indexOf(projectionPath)}_POSITIVE_EXECUTED`;
    writeFileSync(target, `${readFileSync(target, 'utf8')}\nthrow new Error(${JSON.stringify(sentinel)});\n`);
    const reachable = spawnSync(process.execPath, [
      '--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(target).href)});`,
    ], { encoding: 'utf8', timeout: 10_000 });
    assert.notEqual(reachable.status, 0, `${projectionPath}: positive control must reach the changed input`);
    assert.match(reachable.stderr, new RegExp(sentinel), `${projectionPath}: positive control must execute its sentinel`);
  }
  for (const authorized of atomicInputs) {
    for (const stale of atomicInputs) {
      if (stale === authorized) continue;
      const pairRoot = temp(`story-preimport-atomic-${atomicInputs.indexOf(authorized)}-${atomicInputs.indexOf(stale)}`);
      const pairScripts = join(pairRoot, 'scripts');
      const pairVendor = join(pairRoot, 'vendor');
      mkdirSync(pairScripts, { recursive: true });
      mkdirSync(pairVendor, { recursive: true });
      for (const name of ['extract-package-evidence.mjs', 'render-story-page.mjs', 'story-schema.mjs', 'verify-story-semantics.mjs']) {
        writeFileSync(join(pairScripts, name), readFileSync(join(scripts, name)));
      }
      writeFileSync(join(pairVendor, 'parse5.bundle.mjs'), readFileSync(join(root, 'package-story-page', 'vendor', 'parse5.bundle.mjs')));
      const sentinels = new Map();
      for (const projectionPath of [authorized, stale]) {
        const target = join(pairRoot, projectionPath);
        const sentinel = `ATOMIC_${atomicInputs.indexOf(projectionPath)}_${projectionPath === authorized ? 'AUTHORIZED' : 'STALE'}_EXECUTED`;
        sentinels.set(projectionPath, sentinel);
        writeFileSync(target, `${readFileSync(target, 'utf8')}\nthrow new Error(${JSON.stringify(sentinel)});\n`);
      }
      const atomicWrapperPath = join(pairScripts, 'verify-story-page.mjs');
      const atomicWrapperBefore = readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8');
      const escapedAuthorized = authorized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const authorizedHash = createHash('sha256').update(readFileSync(join(pairRoot, authorized))).digest('hex');
      const atomicWrapperAfter = atomicWrapperBefore.replace(
        new RegExp(`('${escapedAuthorized}': ')[0-9a-f]{64}(')`),
        `$1${authorizedHash}$2`,
      );
      assert.notEqual(atomicWrapperAfter, atomicWrapperBefore, `${authorized}: single-input reauthorisation must land`);
      writeFileSync(atomicWrapperPath, atomicWrapperAfter);
      const atomicRun = spawnSync(process.execPath, [
        '--input-type=module', '-e',
        `await import(${JSON.stringify(`${pathToFileURL(atomicWrapperPath).href}?authorized=${atomicInputs.indexOf(authorized)}&stale=${atomicInputs.indexOf(stale)}`)});`,
      ], { encoding: 'utf8', timeout: 10_000 });
      assert.notEqual(atomicRun.status, 0, `${authorized} / ${stale}\n${atomicRun.stdout}\n${atomicRun.stderr}`);
      assert.match(atomicRun.stderr, /semantic pre-import integrity gate failed/, `${authorized} / ${stale}`);
      for (const [projectionPath, sentinel] of sentinels) {
        assert.doesNotMatch(atomicRun.stderr, new RegExp(sentinel),
          `${projectionPath} evaluated before the complete five-hash sweep rejected ${stale}`);
      }
    }
  }

  const oversizedSupportPath = join(isolatedScripts, 'story-schema.mjs');
  const supportSource = readFileSync(join(scripts, 'story-schema.mjs'), 'utf8');
  const padding = 'x'.repeat(PREIMPORT_MODULE_BYTE_LIMIT - Buffer.byteLength(supportSource, 'utf8') + 1);
  writeFileSync(oversizedSupportPath, `${supportSource}\n/*${padding}*/`);
  writeFileSync(join(isolatedScripts, 'verify-story-page.mjs'), authorizePreImportProjection(
    readFileSync(join(scripts, 'verify-story-page.mjs'), 'utf8'), isolated,
  ));
  const oversizedSupportRun = spawnSync(process.execPath, [
    '--input-type=module', '-e',
    `await import(${JSON.stringify(`${pathToFileURL(join(isolatedScripts, 'verify-story-page.mjs')).href}?oversized-support=1`)});`,
  ], { encoding: 'utf8', timeout: 10_000 });
  assert.notEqual(oversizedSupportRun.status, 0, `${oversizedSupportRun.stdout}\n${oversizedSupportRun.stderr}`);
  assert.match(oversizedSupportRun.stderr, new RegExp(`story-schema\\.mjs is \\d+/${PREIMPORT_MODULE_BYTE_LIMIT} bytes`));
});

test('every checkpoint check and mutant has one executable semantic disposition', () => {
  const checkpointChecks = [
    'brief.digest', 'page.canonical', 'page.claims', 'page.controls', 'page.copy', 'page.external-assets',
    'page.focus', 'page.inline-style', 'page.item-bindings', 'page.item-copy', 'page.javascript', 'page.language',
    'page.reduced-motion', 'page.responsive', 'page.schema', 'page.structure', 'page.style-count',
    'page.synthetic-label', 'page.unknown-labels', 'page.unsafe-html', 'page.visuals', 'page.wrapping',
    'provenance.context', 'provenance.evidence-schema', 'provenance.generated-from', 'provenance.package-name',
    'provenance.package-version', 'source.closure', 'story.order',
  ];
  const checkpointMutants = [
    'story-record-array-member-guard', 'story-item-evidence-multiset-guard', 'story-orphan-source-owner-guard',
    'story-unknown-item-marker-guard', 'story-visible-authored-copy-guard', 'story-active-uri-guard',
    'story-browser-disclosure-verdict-guard', 'story-disclosure-direct-summary-guard', 'story-disclosure-ancestry-guard',
    'story-rendered-marker-visibility-guard', 'story-item-copy-guard', 'story-external-asset-inventory-guard',
    'story-style-raw-text-guard', 'story-attribute-tokenizer-guard', 'story-html-style-rawtext-guard',
    'story-event-attribute-guard', 'story-active-candidate-guard', 'story-backslash-url-guard',
    'story-header-state-guard', 'story-bogus-comment-guard', 'story-inline-style-attribute-guard',
    'story-attribute-equals-name-guard', 'story-special-scheme-origin-guard', 'story-image-src-surface-guard',
    'story-background-surface-guard', 'story-canonical-render-guard',
  ];
  const ledger = JSON.parse(readFileSync(join(root, 'test', 'semantic-disposition.json'), 'utf8'));
  const expected = [
    ...checkpointChecks.map((id) => `check:${id}`),
    ...checkpointMutants.map((id) => `mutant:${id}`),
  ].sort();
  const actual = ledger.rows.map((row) => `${row.kind}:${row.id}`).sort();
  assert.equal(ledger.schema, 'package-story-page-semantic-disposition/1');
  assert.equal(ledger.checkpoint, '0e93e3e7');
  assert.deepEqual(actual, expected);
  assert.equal(new Set(actual).size, actual.length);
  const testSource = readFileSync(join(root, 'test', 'story-page.test.mjs'), 'utf8');
  const declarations = testSource.split(/\r?\n/).filter((line) => line.startsWith('test('));
  const titles = declarations.map((line) => {
    const match = /^test\('([^']+)'\s*,/.exec(line);
    assert.ok(match, `unsupported test declaration grammar: ${line}`);
    return match[1];
  });
  const testTitles = new Set(titles);
  assert.equal(testTitles.size, titles.length, 'test titles must be unique');
  const wrapperOwner = 'package-story-page/scripts/verify-story-page.mjs';
  const semanticOwner = 'package-story-page/scripts/verify-story-semantics.mjs';
  const retainedMutantOwners = new Map([
    ['story-record-array-member-guard', 'package-story-page/scripts/story-schema.mjs'],
    ['story-browser-disclosure-verdict-guard', 'package-story-page/scripts/verify-story-page-browser.mjs'],
    ['story-canonical-render-guard', wrapperOwner],
  ]);
  assert.deepEqual(
    ledger.rows.filter((row) => row.kind === 'mutant' && row.disposition === 'retained').map((row) => row.id).sort(),
    [...retainedMutantOwners.keys()].sort(),
  );
  const realRoot = realpathSync(root);
  for (const row of ledger.rows) {
    assert.deepEqual(Object.keys(row).sort(), ['disposition', 'id', 'kind', 'newOwner', 'provingTest']);
    assert.ok(['retained', 'replaced', 'removed'].includes(row.disposition), row.id);
    assert.equal(isAbsolute(row.newOwner), false, `${row.id}: owner path must be relative`);
    const ownerPath = resolve(root, row.newOwner);
    assert.equal(relative(root, ownerPath), row.newOwner, `${row.id}: owner path must be normalized and contained`);
    assert.equal(existsSync(ownerPath), true, `${row.id}: ${row.newOwner}`);
    const ownerStat = lstatSync(ownerPath);
    assert.equal(ownerStat.isFile(), true, `${row.id}: owner must be a regular file`);
    assert.equal(ownerStat.isSymbolicLink(), false, `${row.id}: owner must not be a symlink`);
    assert.equal(relative(realRoot, realpathSync(ownerPath)).startsWith('..'), false, `${row.id}: owner realpath escapes package`);
    assert.equal(testTitles.has(row.provingTest), true, `${row.id}: exact proving test ${row.provingTest}`);
    if (row.kind === 'check') {
      const expectedOwner = row.disposition === 'retained' ? wrapperOwner : semanticOwner;
      assert.equal(row.newOwner, expectedOwner, `${row.id}: current check owner`);
      const ownerSource = readFileSync(ownerPath, 'utf8');
      const emittedIds = new Set([...ownerSource.matchAll(/^\s*(?:add|pushCheck|check)\(\s*(?:checks,\s*)?'([^']+)'/gm)].map((match) => match[1]));
      assert.equal(emittedIds.has(row.id), true, `${row.id}: ${row.newOwner} does not emit the check`);
    } else {
      const expectedOwner = row.disposition === 'retained' ? retainedMutantOwners.get(row.id) : semanticOwner;
      assert.equal(row.newOwner, expectedOwner, `${row.id}: replacement authority owner`);
    }
  }
});
