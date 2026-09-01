'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..', '..');
const CHECKER = path.join(PACKAGE_ROOT, 'scripts', 'check-pipeline-gaps.sh');
const FEATURE_TEMPLATE = path.join(PACKAGE_ROOT, 'templates', '.claude', 'commands', 'feature.md');
const PROJECT_TEMPLATE = path.join(
  PACKAGE_ROOT, 'templates', '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md',
);

const DEFAULT_ROLES = {
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

function roleMap(root, name, heading, roles = DEFAULT_ROLES, extra = '') {
  const rows = Object.entries(roles).map(([role, target]) => `  ${role}: ${target}`);
  return write(root, name, `${heading}\n\n\`\`\`yaml\nDOCUMENT_ROLE_MAP:\n${rows.join('\n')}\n${extra}\`\`\`\n`);
}

function documents(root, slug, specification, pseudocode, roles = DEFAULT_ROLES) {
  const prefix = path.join('docs', 'features', slug);
  write(root, path.join(prefix, roles.specification), specification);
  write(root, path.join(prefix, roles.pseudocode), pseudocode);
}

function algorithm(id, name = 'trace') {
  return `### Algorithm: ${name}\n\nREQUIREMENT: \`${id}\`\n`;
}

function run(root, options = {}) {
  const featureMap = options.featureMap || roleMap(
    root, 'feature-map.md', '### Phase 1 document role map', options.roles || DEFAULT_ROLES,
  );
  const projectMap = options.projectMap || roleMap(
    root, 'project-map.md', '### Project-level default',
    options.projectRoles || options.roles || DEFAULT_ROLES,
  );
  const result = spawnSync('bash', [
    options.checker || CHECKER, root, '--traceability', '--role-map-source', featureMap,
    '--project-role-map-source', projectMap,
  ], { encoding: 'utf8', timeout: options.timeout || 10000 });
  return { status: result.status, signal: result.signal,
    output: `${result.stdout || ''}${result.stderr || ''}` };
}

function temp(t, prefix = 'traceability-machine-ids-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

describe('traceability machine IDs', () => {
  test('P1 — source-only and target-only gaps independently fail with exact directions', (t) => {
    const root = temp(t);
    documents(root, 'orders', [
      '### FR-orders-1 — declared and claimed',
      '### FR-orders-2 — no algorithm',
      '',
    ].join('\n'), [
      algorithm('FR-orders-1', 'known'),
      algorithm('FR-orders-3', 'dangling'),
    ].join('\n'));

    const result = run(root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /GAP orders specification->pseudocode FR-orders-2/);
    assert.match(result.output, /GAP orders pseudocode->specification FR-orders-3/);
    assert.match(result.output, /missing-algorithm=1 orphan-algorithm=1/);
  });

  test('P2 — FR NFR and AC are distinct structural keys', (t) => {
    const root = temp(t);
    documents(root, 'billing', [
      '### FR-billing-1 — functional',
      '### NFR-billing-2 — quality',
      '### AC-billing-3 — acceptance',
      'Prose FR-billing-9 is not a declaration.',
      '### SC-FR-billing-1-1 — nested scenario',
      '',
    ].join('\n'), [
      algorithm('FR-billing-1'),
      'Scenario table mentions NFR-billing-2 and AC-billing-3.',
      algorithm('NFR-billing-4', 'dangling quality'),
    ].join('\n'));

    const result = run(root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /GAP billing specification->pseudocode AC-billing-3/);
    assert.match(result.output, /GAP billing specification->pseudocode NFR-billing-2/);
    assert.match(result.output, /GAP billing pseudocode->specification NFR-billing-4/);
    assert.doesNotMatch(result.output, /GAP .*FR-billing-9/);
    assert.doesNotMatch(result.output, /GAP .*SC-FR/);
  });

  test('P3 — renamed role targets work and malformed maps trigger inconclusive', (t) => {
    const root = temp(t);
    const roles = {
      specification: 'requirements custom.md',
      pseudocode: 'algorithm custom.md',
      architecture: 'design custom.md',
      refinement: 'risks custom.md',
      completion: 'proof custom.md',
    };
    documents(root, 'renamed', '### FR-renamed-1 — mapped\n', algorithm('FR-renamed-1'), roles);
    write(root, path.join('docs', roles.specification), '### FR-project-1 — root mapped\n');
    write(root, path.join('docs', roles.pseudocode), algorithm('FR-project-1'));

    const clean = run(root, { roles, projectRoles: roles });
    assert.equal(clean.status, 0, clean.output);
    assert.match(clean.output, /TRACE contour=project/);
    assert.match(clean.output, /TRACE contour=renamed/);

    const brokenRoles = { ...roles };
    delete brokenRoles.pseudocode;
    const brokenMap = roleMap(
      root, 'broken-map.md', '### Phase 1 document role map', brokenRoles,
    );
    const broken = run(root, { roles, featureMap: brokenMap, projectRoles: roles });
    assert.equal(broken.status, 2, broken.output);
    assert.match(broken.output, /NOT-ESTABLISHED.*pseudocode/);

    const invalidMaps = [
      {
        name: 'unknown-map.md',
        map: roleMap(root, 'unknown-map.md', '### Phase 1 document role map', roles,
          '  mystery: surprise.md\n'),
        expected: /unknown role=mystery/,
      },
      {
        name: 'empty-map.md',
        map: roleMap(root, 'empty-map.md', '### Phase 1 document role map',
          { ...roles, pseudocode: '' }),
        expected: /role=pseudocode empty target/,
      },
      {
        name: 'escaping-map.md',
        map: roleMap(root, 'escaping-map.md', '### Phase 1 document role map',
          { ...roles, specification: '../outside.md' }),
        expected: /role=specification escaping target/,
      },
    ];
    for (const fixture of invalidMaps) {
      const rejected = run(root, { roles, featureMap: fixture.map, projectRoles: roles });
      assert.equal(rejected.status, 2, `${fixture.name}: ${rejected.output}`);
      assert.match(rejected.output, fixture.expected, fixture.name);
    }

    const renamedFeatureHeading = roleMap(
      root, 'renamed-feature-heading.md', '### Phase 1 role map', roles,
    );
    const featureHeadingResult = run(root, {
      roles, featureMap: renamedFeatureHeading, projectRoles: roles,
    });
    assert.equal(featureHeadingResult.status, 2, featureHeadingResult.output);
    assert.match(featureHeadingResult.output,
      /NOT-ESTABLISHED role-map=.* heading=### Phase 1 document role map has no DOCUMENT_ROLE_MAP/);

    const renamedProjectHeading = roleMap(
      root, 'renamed-project-heading.md', '### Project default', roles,
    );
    const projectHeadingResult = run(root, {
      roles, projectMap: renamedProjectHeading, projectRoles: roles,
    });
    assert.equal(projectHeadingResult.status, 2, projectHeadingResult.output);
    assert.match(projectHeadingResult.output,
      /NOT-ESTABLISHED role-map=.* heading=### Project-level default has no DOCUMENT_ROLE_MAP/);
  });

  test('P4 — one executable preserves clean gap and inconclusive exit codes through the pipeline caller', (t) => {
    const root = temp(t);
    const caller = fs.readFileSync(FEATURE_TEMPLATE, 'utf8');
    assert.match(caller,
      /require\.resolve\('@dzhechkov\/p-replicator\/scripts\/check-pipeline-gaps\.sh'\)/);
    assert.doesNotMatch(caller, /\.claude\/hooks\/check-pipeline-gaps\.sh/);
    assert.match(caller, /Exit `0` is the only advancing result/);
    documents(root, 'clean', '### FR-clean-1 — ok\n', algorithm('FR-clean-1'));
    assert.equal(run(root).status, 0);

    write(root, 'docs/features/clean/02_pseudocode.md', algorithm('FR-clean-2'));
    const gap = run(root);
    assert.equal(gap.status, 1, gap.output);
    assert.match(gap.output, /VERDICT traceability=FAIL/);

    fs.unlinkSync(path.join(root, 'docs', 'features', 'clean', '02_pseudocode.md'));
    const inconclusive = run(root);
    assert.equal(inconclusive.status, 2, inconclusive.output);
    assert.match(inconclusive.output, /VERDICT traceability=NOT-ESTABLISHED/);
  });

  test('P5 — packed and freshly initialized consumer contains and runs the checker', (t) => {
    const root = temp(t, 'p-replicator-consumer-');
    write(root, 'package.json', '{"private":true}\n');
    const packJson = path.join(root, 'npm-pack.json');
    const packErr = path.join(root, 'npm-pack.stderr');
    const packOutFd = fs.openSync(packJson, 'w');
    const packErrFd = fs.openSync(packErr, 'w');
    const packed = spawnSync('npm', ['pack', '--json', '--pack-destination', root], {
      cwd: PACKAGE_ROOT,
      timeout: 30000,
      stdio: ['ignore', packOutFd, packErrFd],
      env: { ...process.env, npm_config_cache: path.join(root, 'npm-cache') },
    });
    fs.closeSync(packOutFd);
    fs.closeSync(packErrFd);
    const packedOutput = fs.readFileSync(packJson, 'utf8');
    const packedError = fs.readFileSync(packErr, 'utf8');
    assert.equal(packed.status, 0, `${packed.error?.message ?? ''}\n${packedError}`);
    const packReceipt = JSON.parse(packedOutput)[0];
    const files = packReceipt.files.map((entry) => entry.path);
    assert.ok(files.includes('scripts/check-pipeline-gaps.sh'), JSON.stringify(files));
    assert.ok(!files.includes('scripts/sync-templates.js'), 'build-only sync script must stay excluded');

    const tarball = path.join(root, packReceipt.filename);
    const npmEnv = { ...process.env, npm_config_cache: path.join(root, 'npm-cache') };
    const install = spawnSync('npm', [
      'install', '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund',
      '--omit=optional', tarball,
    ], { cwd: root, encoding: 'utf8', timeout: 30000, env: npmEnv });
    assert.equal(install.status, 0, `${install.stdout}\n${install.stderr}`);

    const resolved = spawnSync(process.execPath, [
      '-p', "require.resolve('@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh')",
    ], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(resolved.status, 0, `${resolved.stdout}\n${resolved.stderr}`);
    const installedChecker = resolved.stdout.trim();
    assert.equal(fs.existsSync(installedChecker), true, installedChecker);

    const installedPackage = path.dirname(path.dirname(installedChecker));
    const init = spawnSync(process.execPath, [path.join(installedPackage, 'bin', 'cli.js'), 'init'], {
      cwd: root, encoding: 'utf8', timeout: 30000, env: npmEnv,
    });
    assert.equal(init.status, 0, `${init.stdout}\n${init.stderr}`);
    const installedFeature = fs.readFileSync(path.join(root, '.claude', 'commands', 'feature.md'), 'utf8');
    assert.match(installedFeature,
      /require\.resolve\('@dzhechkov\/p-replicator\/scripts\/check-pipeline-gaps\.sh'\)/,
      'fresh init must retain a package-resolved checker invocation');
    assert.equal(fs.existsSync(path.join(root, '.claude', 'hooks', 'check-pipeline-gaps.sh')), false,
      'the Node-only hook surface must not carry a shell projection');
    documents(root, 'installed', '### FR-installed-1 — shipped\n', algorithm('FR-installed-1'));
    const clean = spawnSync('bash', [installedChecker, root, '--traceability',
      '--role-map-source', path.join(root, '.claude', 'commands', 'feature.md'),
      '--project-role-map-source', path.join(root, '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md'),
    ], { encoding: 'utf8' });
    assert.equal(clean.status, 0, `${clean.stdout}\n${clean.stderr}`);

    write(root, 'docs/features/installed/02_pseudocode.md', algorithm('FR-installed-2'));
    const orphan = spawnSync('bash', [installedChecker, root, '--traceability',
      '--role-map-source', path.join(root, '.claude', 'commands', 'feature.md'),
      '--project-role-map-source', path.join(root, '.claude', 'skills', 'sparc-prd-mini', 'SKILL.md'),
    ], { encoding: 'utf8' });
    assert.equal(orphan.status, 1, `${orphan.stdout}\n${orphan.stderr}`);
    assert.match(`${orphan.stdout}${orphan.stderr}`,
      /GAP installed pseudocode->specification FR-installed-2/);
  });

  test('P6 — every feature contour is checked without unsafe symlink traversal', (t) => {
    const root = temp(t);
    documents(root, 'alpha', '### FR-alpha-1 — clean\n', algorithm('FR-alpha-1'));
    documents(root, 'middle-feature', '### FR-middle-feature-1 — gap\n', '');
    documents(root, 'zulu', '### FR-zulu-1 — clean\n', algorithm('FR-zulu-1'));
    const outside = temp(t, 'traceability-outside-');
    fs.symlinkSync(outside, path.join(root, 'docs', 'features', 'escape'));

    const result = run(root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /GAP middle-feature specification->pseudocode FR-middle-feature-1/);
    assert.match(result.output, /NOT-ESTABLISHED.*escape.*symlink/);
    assert.match(result.output, /TRACE contour=alpha/);
    assert.match(result.output, /TRACE contour=zulu/);

    const nestedRoot = temp(t, 'traceability-nested-symlink-');
    const nestedRoles = {
      ...DEFAULT_ROLES,
      specification: 'mapped/requirements.md',
      pseudocode: 'mapped/algorithms.md',
    };
    const contour = path.join(nestedRoot, 'docs', 'features', 'nested-symlink');
    fs.mkdirSync(contour, { recursive: true });
    fs.symlinkSync(outside, path.join(contour, 'mapped'));
    const nested = run(nestedRoot, { roles: nestedRoles, projectRoles: nestedRoles });
    assert.equal(nested.status, 2, nested.output);
    assert.match(nested.output, /NOT-ESTABLISHED.*mapped.*symlink is not allowed/);
  });

  test('P7 — duplicate declarations are rejected as non-unique keys', (t) => {
    const root = temp(t);
    documents(root, 'duplicate', [
      '### FR-duplicate-1 — first',
      '### FR-duplicate-1 — second',
      '',
    ].join('\n'), [
      '### Algorithm: first',
      'REQUIREMENT: `FR-duplicate-1`',
      'REQUIREMENT: `FR-duplicate-1`',
      '',
    ].join('\n'));

    const result = run(root);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /DUPLICATE duplicate specification FR-duplicate-1/);
    assert.match(result.output, /DUPLICATE duplicate pseudocode FR-duplicate-1/);

    write(root, 'docs/features/duplicate/01_specification.md',
      '### FR-duplicate-X — malformed ordinal\n');
    write(root, 'docs/features/duplicate/02_pseudocode.md', [
      '### Algorithm: malformed claim',
      'REQUIREMENT: `FR-duplicate-X`',
      '### Algorithm: missing claim',
      'STEPS:',
      '1. Do work.',
      '',
    ].join('\n'));
    const malformed = run(root);
    assert.equal(malformed.status, 1, malformed.output);
    assert.match(malformed.output, /MALFORMED duplicate specification/);
    assert.match(malformed.output, /MALFORMED duplicate pseudocode/);
    assert.match(malformed.output, /GAP duplicate pseudocode unkeyed-algorithm/);
  });

  test('P8 — supported formatting passes without decoy false positives', async (t) => {
    const liveSpecification = [
      '### FR-formatting-1',
      '### NFR-formatting-2 — Windows line endings',
      '### AC-formatting-3 - ASCII title separator',
      'Prose mentions FR-formatting-99.',
      '| NFR-formatting-98 | table only |',
      '<!-- ### AC-formatting-97 -->',
      '### SC-FR-formatting-1-1 — nested scenario',
    ];
    const livePseudocode = [
      '### Algorithm: formatter',
      'REQUIREMENT: `FR-formatting-1`',
      'REQUIREMENT: `NFR-formatting-2`',
      'REQUIREMENT: `AC-formatting-3`',
      'Comment FR-formatting-99 is not evidence.',
      '| REQUIREMENT: `NFR-formatting-98` | table |',
      '<!-- REQUIREMENT: `AC-formatting-97` -->',
    ];

    await t.test('fenced specification heading is not a declared requirement', (caseTest) => {
      const root = temp(caseTest);
      const specification = [...liveSpecification,
        '```markdown',
        '### FR-formatting-96 — fenced documentation example',
        '```',
        '',
      ].join('\r\n');
      documents(root, 'formatting', specification, [...livePseudocode, ''].join('\r\n'));

      const result = run(root);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /requirements=3 algorithms=3/);
      assert.doesNotMatch(result.output, /FR-formatting-96/);
    });

    await t.test('fenced algorithm claims create neither orphan nor duplicate keys', (caseTest) => {
      const root = temp(caseTest);
      const pseudocode = [...livePseudocode,
        '```text',
        '### Algorithm: fenced decoy',
        'REQUIREMENT: `FR-formatting-95`',
        'REQUIREMENT: `FR-formatting-1`',
        '```',
        '',
      ].join('\r\n');
      documents(root, 'formatting', [...liveSpecification, ''].join('\r\n'), pseudocode);

      const result = run(root);
      assert.equal(result.status, 0, result.output);
      assert.match(result.output, /requirements=3 algorithms=3/);
      assert.doesNotMatch(result.output, /FR-formatting-95|DUPLICATE/);
    });
  });

  test('P9 — large contour traversal stays within the measured budget', (t) => {
    const root = temp(t);
    const featureCount = 60;
    const idsPerFeature = 20;
    for (let featureIndex = 0; featureIndex < featureCount; featureIndex++) {
      const slug = `scale-${String(featureIndex).padStart(3, '0')}`;
      const ids = Array.from({ length: idsPerFeature }, (_, idIndex) =>
        `FR-${slug}-${idIndex + 1}`);
      const specification = ids.map((id) => `### ${id} — generated`).join('\n') + '\n';
      const claimed = featureIndex === featureCount - 1 ? ids.slice(0, -1) : ids;
      documents(root, slug, specification, claimed.map((id) => algorithm(id)).join('\n'));
    }

    const started = Date.now();
    const result = run(root, { timeout: 20000 });
    const elapsedMs = Date.now() - started;
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /GAP scale-059 specification->pseudocode FR-scale-059-20/);
    assert.match(result.output, /VERDICT traceability=FAIL features=60 gaps=1 inconclusive=0/);
    assert.ok(elapsedMs < 15000, `measured ${elapsedMs}ms exceeds the 15000ms contract budget`);
  });
});
