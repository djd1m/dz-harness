'use strict';

// Deterministic filesystem/string checks plus one real local subprocess: no model or network call.
// CLAIM BOUND: P1-P3 are fixture-side evidence; P4/P5 are pipeline-side evidence.
// P1-P3 prove that this change authors a faithful gap-carrier. P4/P5 read the shipped skill.
// No assertion here proves that a live model would miss the gap.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE_FEATURE = path.join(
  PACKAGE_ROOT, 'tests', 'fixtures', 'prep-traceability-fixture',
  'docs', 'features', 'order-refund',
);
const SPECIFICATION = path.join(FIXTURE_FEATURE, '01_specification.md');
const PSEUDOCODE = path.join(FIXTURE_FEATURE, '02_pseudocode.md');
const SKILL = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md',
);
const FEATURE_COMMAND = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'commands', 'feature.md',
);
const PACKAGE_JSON = path.join(PACKAGE_ROOT, 'package.json');
const CHECKER = path.join(PACKAGE_ROOT, 'scripts', 'check-pipeline-gaps.sh');

const read = (file) => fs.readFileSync(file, 'utf8');

function h2Section(src, heading) {
  const marker = `## ${heading}`;
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `02_pseudocode.md must contain the ${heading} block`);

  const contentStart = start + marker.length;
  const tail = src.slice(contentStart);
  const nextHeading = tail.search(/^## /m);
  const endMarker = tail.indexOf(`<!-- END ${heading} -->`);
  const boundaries = [nextHeading, endMarker].filter((offset) => offset >= 0);
  const end = boundaries.length > 0
    ? contentStart + Math.min(...boundaries)
    : src.length;

  return src.slice(start, end);
}

function algorithmEvidence(src) {
  return h2Section(src, 'Core Algorithms');
}

function scenarioCoverage(src) {
  return h2Section(src, 'Scenario Coverage');
}

function markdownSection(src, heading) {
  const level = heading.match(/^#+/)[0].length;
  const start = src.indexOf(heading);
  assert.ok(start >= 0, `${heading} must remain addressable`);

  const contentStart = start + heading.length;
  const tail = src.slice(contentStart);
  const nextHeading = tail.search(new RegExp(`^#{1,${level}}\\s`, 'm'));
  const end = nextHeading >= 0 ? contentStart + nextHeading : src.length;
  return src.slice(start, end);
}

function textBetween(src, startMarker, endMarker) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `${startMarker} must precede ${endMarker}`);
  return src.slice(start, end);
}

function roleMap(section) {
  const match = section.match(/```yaml[\s\S]*?DOCUMENT_ROLE_MAP:\r?\n([\s\S]*?)```/);
  assert.ok(match, 'the scoped section must contain a DOCUMENT_ROLE_MAP YAML block');
  return Object.fromEntries(
    [...match[1].matchAll(/^  (specification|pseudocode|architecture|refinement|completion): (\S+)$/gm)]
      .map((entry) => [entry[1], entry[2]]),
  );
}

function stepInstruction(skill, startMarker, endMarker) {
  return textBetween(skill, startMarker, endMarker);
}

function registeredUnitTests(script) {
  return new Set(script.split(/\s+/).filter((part) => /^tests\/unit\/.*\.test\.js$/.test(part)));
}

function unregisteredUnitTests(fileNames, script) {
  const registered = registeredUnitTests(script);
  return fileNames
    .filter((name) => name.endsWith('.test.js'))
    .filter((name) => !registered.has(`tests/unit/${name}`))
    .sort();
}

describe('the per-feature traceability gap is a named negative fixture (PR-021)', () => {
  test('P1 — the fixture carries exactly one requirement with no algorithm', () => {
    const specification = read(SPECIFICATION);
    const pseudocode = read(PSEUDOCODE);
    const requirementIds = [...specification.matchAll(/^### (FR-order-refund-\d+)\b/gm)]
      .map((match) => match[1]);
    const algorithmIds = [...pseudocode.matchAll(/^REQUIREMENT: `(FR-order-refund-\d+)`$/gm)]
      .map((match) => match[1]);

    assert.deepEqual(requirementIds, [
      'FR-order-refund-1', 'FR-order-refund-2', 'FR-order-refund-3',
    ]);
    assert.deepEqual(algorithmIds, ['FR-order-refund-1', 'FR-order-refund-3']);
    assert.deepEqual(
      requirementIds.filter((id) => !algorithmIds.includes(id)),
      ['FR-order-refund-2'],
    );
    assert.doesNotMatch(algorithmEvidence(pseudocode), /FR-order-refund-2/,
      'the deliberately un-algorithmed requirement must be absent from algorithm evidence');
  });

  test('P2 — the Scenario Coverage block is structurally present with both tables', () => {
    const block = scenarioCoverage(read(PSEUDOCODE));
    assert.match(block, /^## Scenario Coverage$/m);
    assert.match(block, /Not claimed by any algorithm:\s*\n\s*\| Scenario \| Reason \|/);
    assert.match(block,
      /Claimed by an algorithm but absent from Specification\.md:\s*\n\s*\| Algorithm \| Claimed ID \|/);
  });

  test('P3 — Scenario Coverage names the missing requirement in the unclaimed table', () => {
    const block = scenarioCoverage(read(PSEUDOCODE));
    const unclaimed = textBetween(
      block,
      'Not claimed by any algorithm:',
      'Claimed by an algorithm but absent from Specification.md:',
    );
    const dangling = block.slice(block.indexOf('Claimed by an algorithm but absent from Specification.md:'));

    assert.match(unclaimed, /^\| FR-order-refund-2 \| out-of-mvp-scope \|$/m,
      'the unclaimed-scenario table must name the deliberately un-algorithmed requirement');
    assert.doesNotMatch(dangling, /FR-order-refund-2/,
      'the dangling-algorithm table must not make the opposite claim about FR-order-refund-2');
  });

  test('P4 — the skill defines the complete project-default document role map', () => {
    const contract = markdownSection(read(SKILL), '## Document Role Map Contract');
    const defaults = roleMap(markdownSection(contract, '### Project-level default'));

    assert.deepEqual(defaults, {
      specification: 'Specification.md',
      pseudocode: 'Pseudocode.md',
      architecture: 'Architecture.md',
      refinement: 'Refinement.md',
      completion: 'Completion.md',
    }, 'the project contour must retain its complete five-role filename map');
    assert.match(contract, /Resolve the active map once before Phase 3/,
      'the skill must resolve the role map before any mapped document or gate is written');
  });

  test('P5 — Scenario Coverage resolves its inputs and output through document roles', () => {
    const skill = read(SKILL);
    const instruction = stepInstruction(
      skill,
      '**Шаг 4.9 — ПОКРЫТИЕ СЦЕНАРИЕВ',
      '**[MANUAL] CP4:**',
    );

    assert.match(instruction,
      /Resolve role `specification` through `DOCUMENT_ROLE_MAP` as `SPECIFICATION_FILE`/,
      'Scenario Coverage must resolve the specification input through its role');
    assert.match(instruction,
      /Resolve role `pseudocode` through `DOCUMENT_ROLE_MAP` as `PSEUDOCODE_FILE`/,
      'Scenario Coverage must resolve the pseudocode input and output through its role');
    assert.match(instruction, /Re-read `SPECIFICATION_FILE`/,
      'Scenario Coverage must read the resolved specification target');
    assert.match(instruction, /Write a `## Scenario Coverage` block into `PSEUDOCODE_FILE`/,
      'Scenario Coverage must write to the resolved pseudocode target');
  });

  test('the skill resolves gate inputs through the role map in both the project and per-feature contours', () => {
    const skill = read(SKILL);
    const featureCommand = read(FEATURE_COMMAND);
    const contract = markdownSection(skill, '## Document Role Map Contract');
    const projectMap = roleMap(markdownSection(contract, '### Project-level default'));
    const featureMap = roleMap(markdownSection(featureCommand, '### Phase 1 document role map'));
    const scenarioGate = stepInstruction(
      skill,
      '**Шаг 4.9 — ПОКРЫТИЕ СЦЕНАРИЕВ',
      '**[MANUAL] CP4:**',
    );
    const reconciliationGate = stepInstruction(
      skill,
      '**Шаг 5.9 — СВЕРКА С ПСЕВДОКОДОМ',
      '**[MANUAL] CP5:**',
    );

    assert.deepEqual(projectMap, {
      specification: 'Specification.md',
      pseudocode: 'Pseudocode.md',
      architecture: 'Architecture.md',
      refinement: 'Refinement.md',
      completion: 'Completion.md',
    }, 'the project contour must resolve roles to the existing project-level filenames');
    assert.deepEqual(featureMap, {
      specification: '01_specification.md',
      pseudocode: '02_pseudocode.md',
      architecture: '03_architecture.md',
      refinement: '04_refinement.md',
      completion: '05_completion.md',
    }, '/feature must pass its complete per-feature role map to the skill');
    assert.doesNotMatch(skill,
      /01_specification\.md|02_pseudocode\.md|03_architecture\.md|04_refinement\.md|05_completion\.md/,
      'per-feature filenames must remain owned by the feature command, not duplicated into the skill');
    assert.match(scenarioGate,
      /Resolve role `specification` through `DOCUMENT_ROLE_MAP` as `SPECIFICATION_FILE`/,
      'Scenario Coverage must resolve its specification input by role in either contour');
    assert.match(scenarioGate,
      /Resolve role `pseudocode` through `DOCUMENT_ROLE_MAP` as `PSEUDOCODE_FILE`/,
      'Scenario Coverage must resolve its pseudocode input and output by role in either contour');
    assert.match(reconciliationGate,
      /Resolve role `pseudocode` through `DOCUMENT_ROLE_MAP` as `PSEUDOCODE_FILE`/,
      'Reconciliation must resolve its pseudocode input by role in either contour');
    assert.match(reconciliationGate,
      /Resolve role `architecture` through `DOCUMENT_ROLE_MAP` as `ARCHITECTURE_FILE`/,
      'Reconciliation must resolve its architecture input and output by role in either contour');
  });

  test('P6 — every tests/unit/*.test.js is registered in package.json', () => {
    const pkg = JSON.parse(read(PACKAGE_JSON));
    const unitFiles = fs.readdirSync(path.join(PACKAGE_ROOT, 'tests', 'unit'));

    assert.deepEqual(unregisteredUnitTests(unitFiles, pkg.scripts['test:unit']), [],
      'test:unit has a file on disk that it never executes');
    assert.deepEqual(unregisteredUnitTests(unitFiles, pkg.scripts.test), [],
      'test has a unit file on disk that it never executes');

    const probe = '__unregistered-probe.test.js';
    assert.deepEqual(
      unregisteredUnitTests([...unitFiles, probe], pkg.scripts['test:unit']),
      [probe],
      'the registration guard must fire on a real injected unregistered filename',
    );
  });

  test('P7 — the file states the bound of its own claim', () => {
    const source = read(__filename);
    assert.match(source,
      /CLAIM BOUND: P1-P3 are fixture-side evidence; P4\/P5 are pipeline-side evidence\./);
    assert.match(source, /No assertion here proves that a live model would miss the gap\./);
  });

  test('P8 — packaged checker rejects the planted FR-order-refund-2 gap and a healed twin passes', (t) => {
    const fixtureRoot = path.join(
      PACKAGE_ROOT, 'tests', 'fixtures', 'prep-traceability-fixture',
    );
    const args = [
      CHECKER, fixtureRoot, '--traceability', '--role-map-source', FEATURE_COMMAND,
      '--project-role-map-source', SKILL,
    ];
    const broken = spawnSync('bash', args, { encoding: 'utf8' });
    const brokenOutput = `${broken.stdout || ''}${broken.stderr || ''}`;
    assert.equal(broken.status, 1, brokenOutput);
    assert.match(brokenOutput,
      /GAP order-refund specification->pseudocode FR-order-refund-2/);
    assert.match(brokenOutput, /missing-algorithm=1 orphan-algorithm=0/);
    assert.doesNotMatch(brokenOutput,
      /GAP order-refund pseudocode->specification FR-order-refund-2/);

    const healedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'traceability-healed-'));
    t.after(() => fs.rmSync(healedRoot, { recursive: true, force: true }));
    fs.cpSync(fixtureRoot, healedRoot, { recursive: true });
    const healedPseudo = path.join(
      healedRoot, 'docs', 'features', 'order-refund', '02_pseudocode.md',
    );
    fs.appendFileSync(healedPseudo, [
      '',
      '### Algorithm: Notify the buyer',
      '',
      'REQUIREMENT: `FR-order-refund-2`',
      '',
    ].join('\n'));
    const healed = spawnSync('bash', [
      CHECKER, healedRoot, '--traceability', '--role-map-source', FEATURE_COMMAND,
      '--project-role-map-source', SKILL,
    ], { encoding: 'utf8' });
    assert.equal(healed.status, 0, `${healed.stdout || ''}${healed.stderr || ''}`);
  });

  // AM-1's Confirmation (plan 06, line 291): the flip must be COMPLETE, not cosmetic. P3/P4/P5 were
  // written as pins asserting the DEFECT, carrying instructions to invert them once cd0b52f6 landed.
  // Any such instruction surviving under a pin that now asserts the FIXED state is a reader trap:
  // the next maintainer either re-inverts it (breaking the guard) or trusts a stale note.
  // SCOPE NOTE, learned the hard way while writing this: the first version scanned the whole file
  // and failed on ITS OWN explanatory comment, which necessarily quotes the forbidden phrases. A
  // self-reading guard must exclude itself, so this one slices out exactly the three pin bodies.
  test('P9 — P3/P4/P5 carry only corrected positive labels and messages', () => {
    const source = read(__filename);
    const pinBody = (name) => {
      const start = source.indexOf(`test('${name} —`);
      assert.ok(start >= 0, `${name} must remain present and addressable`);
      const next = source.indexOf("\n  test('", start + 1);
      return source.slice(start, next >= 0 ? next : source.length);
    };
    const forbidden = [/INVERTED\s+PIN/i, /\bflip\b/i, /pins?\s+the\s+(?:current\s+)?defect/i,
                       /will\s+be\s+(?:flipped|inverted)/i, /cd0b52f6/];
    const positive = {
      P3: /names the missing requirement in the unclaimed table/,
      P4: /defines the complete project-default document role map/,
      P5: /resolves its inputs and output through document roles/,
    };
    for (const name of ['P3', 'P4', 'P5']) {
      const body = pinBody(name);
      for (const pattern of forbidden) {
        assert.ok(!pattern.test(body),
          `${name} still carries pre-flip language (${pattern}) — the flip was cosmetic`);
      }
      assert.match(body, positive[name],
        `${name} must state its corrected positive property, not the absence of the old defect`);
    }
  });
});
