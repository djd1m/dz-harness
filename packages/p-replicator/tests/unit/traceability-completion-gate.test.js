'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const CHECKER = path.join(PACKAGE_ROOT, 'scripts', 'check-pipeline-gaps.sh');
const TRACEABILITY_FIXTURE = path.join(PACKAGE_ROOT, 'tests', 'fixtures', 'prep-traceability-fixture');
const FEATURE_TEMPLATE = path.join(PACKAGE_ROOT, 'templates', '.claude', 'commands', 'feature.md');
const PROJECT_TEMPLATE = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md',
);

const ROLES = {
  specification: '01_specification.md',
  pseudocode: '02_pseudocode.md',
  architecture: '03_architecture.md',
  refinement: '04_refinement.md',
  completion: '05_completion.md',
};

function write(root, relative, body) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return target;
}

function roleMap(root, relative, heading) {
  const rows = Object.entries(ROLES).map(([role, target]) => `  ${role}: ${target}`);
  return write(root, relative,
    `${heading}\n\n\`\`\`yaml\nDOCUMENT_ROLE_MAP:\n${rows.join('\n')}\n\`\`\`\n`);
}

function temp(t, prefix = 'traceability-completion-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function createContour(root, options = {}) {
  const slug = options.slug || 'demo';
  const prefix = path.join('docs', 'features', slug);
  const specification = options.specification || [
    `# ${slug} specification`,
    '',
    `### FR-${slug}-1 — feature requirement`,
    '',
    `### AC-${slug}-1 — accepts a valid request`,
    '',
    `### AC-${slug}-2 — rejects an invalid request`,
    '',
  ].join('\n');
  const digest = crypto.createHash('sha256').update(specification).digest('hex');
  write(root, path.join(prefix, ROLES.specification), specification);
  write(root, path.join(prefix, ROLES.pseudocode), [
    `### Algorithm: ${slug}`,
    `REQUIREMENT: \`FR-${slug}-1\``,
    `REQUIREMENT: \`AC-${slug}-1\``,
    `REQUIREMENT: \`AC-${slug}-2\``,
    '',
  ].join('\n'));
  write(root, path.join(prefix, ROLES.architecture), '# Architecture\n');
  write(root, path.join(prefix, ROLES.refinement), '# Refinement\n');
  write(root, path.join(prefix, ROLES.completion), options.completion || [
    '# Completion',
    '',
    '## Criterion coverage',
    '| Criterion | Test file | Test title |',
    '|-----------|-----------|------------|',
    `| AC-${slug}-1 | tests/${slug}.test.js | accepts a valid request |`,
    `| AC-${slug}-2 | tests/${slug}.test.js | rejects an invalid request |`,
    '',
  ].join('\n'));
  write(root, path.join(prefix, 'validation-report.md'), options.validation || [
    '# Validation report',
    `Spec revision: sha256:${digest}`,
    '',
    '## Criterion scenarios',
    '| Criterion | Scenario |',
    '|-----------|----------|',
    `| AC-${slug}-1 | accepts a valid request |`,
    `| AC-${slug}-2 | rejects an invalid request |`,
    '',
  ].join('\n'));
  write(root, path.join('tests', `${slug}.test.js`), options.testBody || [
    "test('accepts a valid request', () => {});",
    "test('rejects an invalid request', () => {});",
    '',
  ].join('\n'));
  return { slug, prefix, digest, specification };
}

function maps(root) {
  return {
    feature: roleMap(root, 'feature-map.md', '### Phase 1 document role map'),
    project: roleMap(root, 'project-map.md', '### Project-level default'),
  };
}

function runChecker(root, flags, options = {}) {
  const roleMaps = options.maps || maps(root);
  const result = spawnSync('bash', [options.checker || CHECKER, root, ...flags,
    '--role-map-source', roleMaps.feature,
    '--project-role-map-source', roleMaps.project,
  ], { cwd: options.cwd || PACKAGE_ROOT, encoding: 'utf8', timeout: 10000 });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

describe('traceability completion and report gates', () => {
  test('P1 — clean contour: --completion and --report-revision exit 0 with PASS verdicts', (t) => {
    const root = temp(t);
    createContour(root);
    const result = runChecker(root, ['--completion', '--report-revision']);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /VERDICT completion=PASS features=1 gaps=0 inconclusive=0/);
    assert.match(result.output, /VERDICT report-revision=PASS features=1 gaps=0 inconclusive=0/);
  });

  test('P2 — an AC with no coverage row is a named gap (exit 1)', (t) => {
    const root = temp(t);
    const contour = createContour(root);
    const completion = path.join(root, contour.prefix, ROLES.completion);
    fs.writeFileSync(completion, fs.readFileSync(completion, 'utf8')
      .replace(/^\| AC-demo-2 .*\n/m, ''));
    const result = runChecker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /GAP contour=demo completion AC-demo-2 has no row in Criterion coverage/);
    assert.match(result.output, /VERDICT completion=FAIL/);
  });

  test('P3 — a row whose id is not in the specification is a named gap', (t) => {
    const root = temp(t);
    const contour = createContour(root);
    const completion = path.join(root, contour.prefix, ROLES.completion);
    fs.appendFileSync(completion,
      '| AC-demo-9 | tests/demo.test.js | accepts a valid request |\n');
    const result = runChecker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /GAP contour=demo completion row AC-demo-9 is not declared in the specification/);
  });

  test('P4 — a row whose test file lacks the title is a named gap; escaping and symlinked paths are refused', (t) => {
    const root = temp(t);
    const contour = createContour(root, { testBody: "test('another title', () => {});\n" });
    const completion = path.join(root, contour.prefix, ROLES.completion);
    let result = runChecker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /AC-demo-1 test file tests\/demo\.test\.js does not contain title "accepts a valid request"/);

    fs.writeFileSync(completion, fs.readFileSync(completion, 'utf8')
      .replace('tests/demo.test.js | accepts a valid request',
        '../outside.test.js | accepts a valid request'));
    result = runChecker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /test file \.\.\/outside\.test\.js escapes the project root/);

    const outside = temp(t, 'traceability-completion-outside-');
    write(outside, 'linked.test.js', "test('accepts a valid request', () => {});\n");
    fs.symlinkSync(path.join(outside, 'linked.test.js'), path.join(root, 'tests', 'linked.test.js'));
    fs.writeFileSync(completion, fs.readFileSync(completion, 'utf8')
      .replace('../outside.test.js', 'tests/linked.test.js'));
    result = runChecker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /test file tests\/linked\.test\.js uses a symlink/);
  });

  test('P5 — a stale revision line exits 1 naming both prefixes; a missing line exits 2', (t) => {
    const root = temp(t);
    const contour = createContour(root);
    const report = path.join(root, contour.prefix, 'validation-report.md');
    const stale = 'a'.repeat(64);
    fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
      .replace(contour.digest, stale));
    let result = runChecker(root, ['--report-revision']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      new RegExp(`sha256:${stale.slice(0, 12)}… != specification sha256:${contour.digest.slice(0, 12)}…`));

    fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
      .replace(/^Spec revision:.*\n/m, ''));
    result = runChecker(root, ['--report-revision']);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output,
      /NOT-ESTABLISHED contour=demo report-revision line missing in validation-report\.md/);
  });

  test('P5b — --criterion-scenarios names missing and undeclared rows; a missing table exits 2', (t) => {
    const root = temp(t);
    const contour = createContour(root);
    const report = path.join(root, contour.prefix, 'validation-report.md');
    fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
      .replace(/^\| AC-demo-2 .*\n/m, '')
      .replace('| AC-demo-1 | accepts a valid request |', [
        '| AC-demo-1 | accepts a valid request |',
        '| AC-demo-9 | undeclared scenario |',
      ].join('\n')));
    let result = runChecker(root, ['--criterion-scenarios']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /GAP contour=demo criterion-scenarios AC-demo-2 has no scenario row/);
    assert.match(result.output,
      /GAP contour=demo criterion-scenarios row AC-demo-9 is not declared in the specification/);

    fs.writeFileSync(report, [
      '# Validation report',
      `Spec revision: sha256:${contour.digest}`,
      '',
      '## Different section',
      '',
    ].join('\n'));
    result = runChecker(root, ['--criterion-scenarios']);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /NOT-ESTABLISHED.*criterion-scenarios table missing or malformed/);
  });

  test('P6 — flags compose and the worst status wins', (t) => {
    const root = temp(t);
    const contour = createContour(root);
    const completion = path.join(root, contour.prefix, ROLES.completion);
    const report = path.join(root, contour.prefix, 'validation-report.md');
    fs.writeFileSync(completion, fs.readFileSync(completion, 'utf8')
      .replace(/^\| AC-demo-2 .*\n/m, ''));
    fs.writeFileSync(report, fs.readFileSync(report, 'utf8')
      .replace(/^Spec revision:.*\n/m, ''));
    const result = runChecker(root, [
      '--traceability', '--completion', '--report-revision', '--criterion-scenarios',
    ]);
    assert.equal(result.status, 2, result.output);
    assert.match(result.output, /VERDICT traceability=PASS/);
    assert.match(result.output, /VERDICT completion=FAIL/);
    assert.match(result.output, /VERDICT report-revision=NOT-ESTABLISHED/);
    assert.match(result.output, /VERDICT criterion-scenarios=PASS/);
  });

  test('P7 — --traceability output is byte-identical to before on the existing fixture', (t) => {
    const root = temp(t, 'traceability-legacy-checker-');
    const oldScript = path.join(root, 'check-pipeline-gaps.sh');
    const shown = spawnSync('git', ['show', 'HEAD:./scripts/check-pipeline-gaps.sh'], {
      cwd: PACKAGE_ROOT, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(shown.status, 0, `${shown.stdout}\n${shown.stderr}`);
    fs.writeFileSync(oldScript, shown.stdout, { mode: 0o755 });
    const roleMaps = { feature: FEATURE_TEMPLATE, project: PROJECT_TEMPLATE };
    const before = runChecker(TRACEABILITY_FIXTURE, ['--traceability'], {
      checker: oldScript, maps: roleMaps,
    });
    const after = runChecker(TRACEABILITY_FIXTURE, ['--traceability'], { maps: roleMaps });
    assert.equal(after.status, before.status, after.output);
    assert.equal(after.stdout, before.stdout);
    assert.equal(after.stderr, before.stderr);
  });
});
