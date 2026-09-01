'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const CHECKER = path.join(PACKAGE_ROOT, 'scripts', 'check-pipeline-gaps.sh');

function write(root, relative, body) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  return target;
}

function mapSource(root, relative, heading, values) {
  const lines = Object.entries(values).map(([role, value]) => `  ${role}: ${value}`);
  return write(root, relative, `${heading}\n\n\`\`\`yaml\nDOCUMENT_ROLE_MAP:\n${lines.join('\n')}\n\`\`\`\n`);
}

function run(root, featureMap, projectMap) {
  const result = spawnSync('bash', [
    CHECKER,
    root,
    '--traceability',
    '--role-map-source', featureMap,
    '--project-role-map-source', projectMap,
  ], { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout || ''}${result.stderr || ''}` };
}

describe('check-pipeline-gaps executable contract', () => {
  test('ADR Confirmation — the real process compares structural FR NFR and AC keys', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p-replicator-checker-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const roles = {
      specification: 'requirements.md',
      pseudocode: 'algorithms.md',
      architecture: 'architecture.md',
      refinement: 'refinement.md',
      completion: 'completion.md',
    };
    const featureMap = mapSource(root, 'feature-map.md', '### Phase 1 document role map', roles);
    const projectMap = mapSource(root, 'project-map.md', '### Project-level default', roles);
    write(root, 'docs/features/payments/requirements.md', [
      '### FR-payments-1 — charge',
      '### NFR-payments-2 — latency',
      '### AC-payments-3 — accepted',
      '',
    ].join('\n'));
    write(root, 'docs/features/payments/algorithms.md', [
      '### Algorithm: charge',
      'REQUIREMENT: `FR-payments-1`',
      'REQUIREMENT: `NFR-payments-2`',
      'REQUIREMENT: `AC-payments-3`',
      '',
    ].join('\n'));

    const result = run(root, featureMap, projectMap);
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /COUNT requirements=3 algorithms=3 missing-algorithm=0 orphan-algorithm=0/);
    assert.match(result.output, /VERDICT traceability=PASS features=1 gaps=0 inconclusive=0/);
  });

  test('the default mode is the same role-mapped traceability contract', (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p-replicator-default-mode-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const roles = {
      specification: 'requirements custom.md',
      pseudocode: 'algorithms custom.md',
      architecture: 'architecture custom.md',
      refinement: 'refinement custom.md',
      completion: 'completion custom.md',
    };
    const featureMap = mapSource(root, 'feature-map.md', '### Phase 1 document role map', roles);
    const projectMap = mapSource(root, 'project-map.md', '### Project-level default', roles);
    write(root, 'docs/requirements custom.md', '### FR-project-1 — mapped\n');
    write(root, 'docs/algorithms custom.md',
      '### Algorithm: mapped\nREQUIREMENT: `FR-project-1`\n');

    const result = spawnSync('bash', [
      CHECKER, root, '--role-map-source', featureMap,
      '--project-role-map-source', projectMap,
    ], { encoding: 'utf8' });
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    assert.equal(result.status, 0, output);
    assert.match(output, /TRACE contour=project/);
    assert.match(output, /VERDICT traceability=PASS features=0 gaps=0 inconclusive=0/);
  });
});
