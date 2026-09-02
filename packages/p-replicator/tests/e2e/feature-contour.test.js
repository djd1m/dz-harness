'use strict';

// Assert lifecycle contract content, not a template hash: a sha256 pin detects any change but
// cannot distinguish a defect from an intentional edit that preserves every required gate.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(PACKAGE_ROOT, 'tests', 'fixtures', 'feature-contour');
const CHECKER = path.join(PACKAGE_ROOT, 'scripts', 'check-pipeline-gaps.sh');
const REVIEW_HOOK = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'hooks', 'check-review-contract.cjs',
);
const FEATURE_TEMPLATE = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'commands', 'feature.md',
);

// The fixture ships only the consumer's OWN files (docs/, tests/). The two shipped templates the
// checker reads for its role maps are materialised from templates/ at run time, byte-identical:
// a stub copy inside the fixture would be a third copy of a canonical skill and trip no-skill-drift.
const TEMPLATE_FILES = [
  ['commands', 'feature.md'],
  ['skills', 'sparc-prd-mini', 'SKILL.md'],
];

function project(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-contour-e2e-'));
  fs.cpSync(FIXTURE, root, { recursive: true });
  for (const parts of TEMPLATE_FILES) {
    const target = path.join(root, '.claude', ...parts);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(PACKAGE_ROOT, 'templates', '.claude', ...parts), target);
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function execute(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 10000 });
  return {
    status: result.status,
    signal: result.signal,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function checker(root, flags = [
  '--traceability', '--completion', '--report-revision', '--criterion-scenarios',
]) {
  return execute('bash', [CHECKER, root, ...flags], root);
}

function hook(root) {
  return execute(process.execPath, [REVIEW_HOOK, root, 'demo-gate'], root);
}

function replace(root, relative, transform) {
  const target = path.join(root, relative);
  fs.writeFileSync(target, transform(fs.readFileSync(target, 'utf8')));
}

function phase(text, number, nextNumber) {
  const start = text.indexOf(`### Phase ${number}:`);
  assert.notEqual(start, -1, `Phase ${number} heading missing`);
  const end = nextNumber === undefined ? text.length : text.indexOf(`### Phase ${nextNumber}:`, start);
  assert.notEqual(end, -1, `Phase ${nextNumber} heading missing`);
  return text.slice(start, end);
}

describe('feature contour consumer contract', () => {
  test('green fixture binds specification, validation, completion, review, and executable evidence', (t) => {
    const root = project(t);
    const specification = fs.readFileSync(path.join(
      root, 'docs', 'features', 'demo-gate', '01_specification.md',
    ));
    const validation = fs.readFileSync(path.join(
      root, 'docs', 'features', 'demo-gate', 'validation-report.md',
    ), 'utf8');
    const expectedDigest = crypto.createHash('sha256').update(specification).digest('hex');
    assert.match(validation, new RegExp(`^Spec revision: sha256:${expectedDigest}$`, 'm'),
      'the checked-in fixture revision must match the specification bytes');

    const gate = checker(root);
    assert.equal(gate.status, 0, gate.output);
    assert.match(gate.output, /VERDICT traceability=PASS/);
    assert.match(gate.output, /VERDICT completion=PASS/);
    assert.match(gate.output, /VERDICT report-revision=PASS/);
    assert.match(gate.output, /VERDICT criterion-scenarios=PASS/);

    const review = hook(root);
    assert.equal(review.status, 0, review.output);
    const fixtureTests = execute(process.execPath, ['--test', 'tests/demo.test.js'], root);
    assert.equal(fixtureTests.status, 0, fixtureTests.output);
  });

  test('deleting AC-demo-gate-2 coverage is a named completion gap', (t) => {
    const root = project(t);
    replace(root, 'docs/features/demo-gate/05_completion.md', (body) =>
      body.replace(/^\| AC-demo-gate-2 .*\n/m, ''));
    const result = checker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /GAP contour=demo-gate completion AC-demo-gate-2 has no row in Criterion coverage/);
  });

  test('changing specification bytes invalidates both report revision contracts', (t) => {
    const root = project(t);
    fs.appendFileSync(path.join(
      root, 'docs', 'features', 'demo-gate', '01_specification.md',
    ), '\n');
    const revision = checker(root, ['--report-revision']);
    assert.equal(revision.status, 1, revision.output);
    assert.match(revision.output,
      /GAP contour=demo-gate report-revision validation-report\.md sha256:.* != specification sha256:/);

    const review = hook(root);
    assert.equal(review.status, 1, review.output);
    assert.match(review.output, /GAP Spec revision mismatch report=.* specification=/);
  });

  test('removing Reviewer family is a named review-contract gap', (t) => {
    const root = project(t);
    replace(root, 'docs/features/demo-gate/review-report.md', (body) =>
      body.replace(/^Reviewer family:.*\n/m, ''));
    const review = hook(root);
    assert.equal(review.status, 1, review.output);
    assert.match(review.output, /GAP Reviewer family line missing/);
  });

  test('changing a test title breaks completion evidence by name', (t) => {
    const root = project(t);
    replace(root, 'tests/demo.test.js', (body) =>
      body.replace('rejects an invalid value', 'declines an invalid value'));
    const result = checker(root, ['--completion']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /AC-demo-gate-2 test file tests\/demo\.test\.js does not contain title "rejects an invalid value"/);
  });

  test('deleting AC-demo-gate-1 scenario is a named traceability-floor gap', (t) => {
    const root = project(t);
    replace(root, 'docs/features/demo-gate/validation-report.md', (body) =>
      body.replace(/^\| AC-demo-gate-1 .*\n/m, ''));
    const result = checker(root, ['--criterion-scenarios']);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output,
      /GAP contour=demo-gate criterion-scenarios AC-demo-gate-1 has no scenario row/);
  });

  test('feature template carries each blocking gate in its owning phase and AUTO mode', () => {
    const template = fs.readFileSync(FEATURE_TEMPLATE, 'utf8');
    const phase2 = phase(template, 2, 3);
    const phase3 = phase(template, 3, 4);
    const phase4 = phase(template, 4);
    assert.match(phase2, /--report-revision/);
    assert.match(phase2, /--criterion-scenarios/);
    assert.match(phase3, /--completion/);
    assert.match(phase3, /## Criterion coverage/);
    assert.match(phase4, /check-review-contract\.cjs/);

    const autoStart = template.indexOf('## AUTO mode');
    const autoEnd = template.indexOf('\n## Related', autoStart);
    assert.notEqual(autoStart, -1, 'AUTO mode heading missing');
    assert.notEqual(autoEnd, -1, 'AUTO mode boundary missing');
    const auto = template.slice(autoStart, autoEnd);
    assert.match(auto, /--report-revision/);
    assert.match(auto, /--criterion-scenarios/);
    assert.match(auto, /--completion/);
  });
});
