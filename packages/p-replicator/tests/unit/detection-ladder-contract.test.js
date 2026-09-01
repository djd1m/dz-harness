'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const RULE_DIR = path.join(PKG_DIR, 'templates', '.claude', 'rules');
const RULE_FILE = 'cost-of-detection-ladder.md';
const RULE_PATH = path.join(RULE_DIR, RULE_FILE);
const TEST_PATH = 'tests/unit/detection-ladder-contract.test.js';
const CLI = path.join(PKG_DIR, 'bin', 'cli.js');

const read = (file) => fs.readFileSync(file, 'utf8');

function npmPackDryRunFiles() {
  const npmCli = process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)
    ? process.env.npm_execpath
    : path.join(
      path.dirname(require.resolve('npm/package.json', { paths: Module.globalPaths })),
      'bin',
      'npm-cli.js');
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-npm-pack-cache-'));

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const worker = new Worker(`
      const { workerData } = require('node:worker_threads');
      process.argv = ['node', 'npm', 'pack', workerData.pkgDir, '--dry-run', '--json'];
      process.env.npm_config_cache = workerData.cache;
      require(workerData.npmCli);
    `, {
      eval: true,
      workerData: { npmCli, pkgDir: PKG_DIR, cache },
      stdout: true,
      stderr: true,
    });
    worker.stdout.setEncoding('utf8');
    worker.stderr.setEncoding('utf8');
    worker.stdout.on('data', (chunk) => { stdout += chunk; });
    worker.stderr.on('data', (chunk) => { stderr += chunk; });
    worker.once('error', (error) => {
      fs.rmSync(cache, { recursive: true, force: true });
      reject(error);
    });
    worker.once('exit', (code) => {
      fs.rmSync(cache, { recursive: true, force: true });
      if (code !== 0) {
        reject(new Error(`npm pack --dry-run --json exited ${code}: ${stderr}`));
        return;
      }
      try {
        const result = JSON.parse(stdout);
        resolve(result[0].files.map((entry) => entry.path));
      } catch (error) {
        reject(new Error(`npm pack --dry-run --json returned invalid JSON: ${error.message}`));
      }
    });
  });
}

function ladderProblems(text) {
  const problems = [];
  const layers = [
    /### Layer 1 — Deterministic test, CI check, or static guard/i,
    /### Layer 2 — Always-loaded governance/i,
    /### Layer 3 — Pipeline gate/i,
    /### Layer 4 — Skill or reviewer judgment/i,
    /### Layer 5 — Agent memory or informal recall/i,
  ];
  let previous = -1;
  for (const layer of layers) {
    const index = text.search(layer);
    if (index < 0) problems.push(`missing ${layer}`);
    if (index >= 0 && index <= previous) problems.push(`out of order ${layer}`);
    previous = Math.max(previous, index);
  }
  if (!/strongest layer that can reliably express the property/i.test(text)) {
    problems.push('missing strongest-capable-layer rule');
  }
  if (!/critic\/reviewer will catch it/i.test(text)) {
    problems.push('missing critic/reviewer anti-pattern');
  }
  if (!/deterministic propert(?:y|ies)[\s\S]{0,180}(?:must not|never)[\s\S]{0,120}probabilistic review/i.test(text)) {
    problems.push('anti-pattern does not protect deterministic properties');
  }
  return problems;
}

function bookReinforcementProblems(text) {
  const problems = [];
  const mappings = [
    /Static structure or format\s*\|\s*Static check or deterministic test/i,
    /Local behavior\s*\|\s*Unit test/i,
    /Component interaction\s*\|\s*Integration or contract test/i,
    /Behavior over time\s*\|\s*Monitor with a defined threshold or invariant/i,
    /Runtime quantity\s*\|\s*Metric and threshold alert/i,
    /Discrete transition\s*\|\s*Event or audit check/i,
    /Failure resilience\s*\|\s*Controlled fault injection/i,
    /Semantic or adversarial property\s*\|\s*Independent model-backed review gate/i,
  ];
  if (!/check kind and enforcement layer are separate axes/i.test(text)) {
    problems.push('missing two-axis decision');
  }
  for (const mapping of mappings) {
    if (!mapping.test(text)) problems.push(`missing signal mapping ${mapping}`);
  }
  if (!/\| Cause \/ property \| Observable signal \| Check kind \| Layer \| Trigger \/ cadence \| Reaction \| Owner \|/i.test(text)) {
    problems.push('missing closed-loop Reaction column');
  }
  if (!/Reaction must name a concrete action/i.test(text)) {
    problems.push('Reaction is not mandatory and concrete');
  }
  if (!/block or return the change|repair the practice|revisit the decision/i.test(text)) {
    problems.push('missing concrete reaction choices');
  }
  return problems;
}

function privateMarkerHits(text) {
  const markers = [
    /dz-harness-hub/i,
    /\/home\/dz-projects-2026/i,
    /packages\/@dzhechkov/i,
    /\.claude\/rules\/feature-adr-conventions\.md/i,
    /harness-core|harness-cli|health-advisor/i,
    /\bdz guard\b/i,
    /\bfeatures\//i,
    /claim-check|discrimination-check|amendment gate|fa-improvements/i,
  ];
  return markers.filter((marker) => marker.test(text)).map(String);
}

function backlinkProblems(ruleDir) {
  const allusion = /cost.of.detection|strongest.*layer|layer [1-5]|слой [1-5]|лестниц/i;
  const linked = /\[[^\]]+\]\((?:\.\/)?cost-of-detection-ladder\.md\)/i;
  const linkLine = /\[[^\]]+\]\((?:\.\/)?cost-of-detection-ladder\.md\)/i;
  const problems = [];
  for (const name of fs.readdirSync(ruleDir).filter((entry) => entry.endsWith('.md'))) {
    if (name === RULE_FILE) continue;
    const text = read(path.join(ruleDir, name));
    const allusionText = text
      .split(/\r?\n/)
      .filter((line) => !linkLine.test(line))
      .join('\n');
    if (allusion.test(allusionText) && !linked.test(text)) problems.push(name);
  }
  return problems;
}

function registryProblems(ruleDir, registryKeys) {
  const files = fs.readdirSync(ruleDir)
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.basename(entry, '.md'))
    .sort();
  const keys = [...registryKeys].sort();
  return files.length === keys.length && files.every((name, index) => name === keys[index])
    ? []
    : [`template rules ${JSON.stringify(files)} != registry ${JSON.stringify(keys)}`];
}

function runnerProblems(pkg) {
  return ['test', 'test:unit'].filter((script) => !pkg.scripts?.[script]?.includes(TEST_PATH));
}

function packagingProblems(pkg) {
  return pkg.files?.includes('templates/') ? [] : ['package files[] omits templates/'];
}

function scopeProblems(files) {
  const packagePrefix = 'packages/@dzhechkov/p-replicator/';
  const manifest = 'features/ship-detection-ladder/07_code_changes/change_manifest.md';
  return files.filter((file) => !file.startsWith(packagePrefix) && file !== manifest);
}

test('P1 — consumer ladder preserves the ordered contract and rejects an unlinked real mention', () => {
  const canonical = read(RULE_PATH);
  assert.deepEqual(ladderProblems(canonical), []);
  assert.deepEqual(backlinkProblems(RULE_DIR), []);

  const withoutLayerThree = canonical.replace(
    /\n### Layer 3 — Pipeline gate[\s\S]*?(?=\n### Layer 4)/, '');
  assert.ok(ladderProblems(withoutLayerThree).length > 0,
    'removing a load-bearing layer must fire the ordered-contract safeguard');

  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ladder-link-'));
  try {
    fs.writeFileSync(path.join(fixture, RULE_FILE), canonical);
    fs.writeFileSync(path.join(fixture, 'unlinked-rule.md'), 'Put this safeguard on layer 3.\n');
    assert.deepEqual(backlinkProblems(fixture), ['unlinked-rule.md'],
      'a real unlinked allusion must fire the backlink safeguard');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }

  for (const requiredRule of ['skill-interface-protocol.md', 'feature-lifecycle.md']) {
    const withoutLink = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ladder-required-link-'));
    try {
      fs.cpSync(RULE_DIR, withoutLink, { recursive: true });
      const requiredPath = path.join(withoutLink, requiredRule);
      fs.writeFileSync(requiredPath, read(requiredPath).replace(
        /\[([^\]]+)\]\((?:\.\/)?cost-of-detection-ladder\.md\)/i,
        '$1'));
      assert.deepEqual(backlinkProblems(withoutLink), [requiredRule],
        `removing the ADR-required link from ${requiredRule} must fire the backlink safeguard`);
    } finally {
      fs.rmSync(withoutLink, { recursive: true, force: true });
    }
  }
});

test('P2 — self-containment gate rejects a real internal-path leak fixture', () => {
  const canonical = read(RULE_PATH);
  assert.deepEqual(privateMarkerHits(canonical), []);
  const leaked = canonical + '\nSee .claude/rules/feature-adr-conventions.md for details.\n';
  assert.ok(privateMarkerHits(leaked).length > 0,
    'the literal private conventions path must fire the self-containment safeguard');
});

test('P3 — both book-grounded decisions are recorded and reflected in the template', () => {
  const canonical = read(RULE_PATH);
  assert.deepEqual(bookReinforcementProblems(canonical), []);

  const withoutKind = canonical.replace(
    /\n## Choose the check kind from the signal[\s\S]*?(?=\n## )/, '');
  assert.ok(bookReinforcementProblems(withoutKind).length > 0,
    'removing check-kind-by-signal must fire the decision guard');

  const withoutReaction = canonical.replace(
    /\n## Close the loop with a reaction[\s\S]*?(?=\n## )/, '');
  assert.ok(bookReinforcementProblems(withoutReaction).length > 0,
    'removing the mandatory Reaction contract must fire the decision guard');
});

test('P4 — rule registry rejects a real orphan and fresh init ships the ladder', () => {
  const { COMPONENTS } = require(path.join(PKG_DIR, 'src', 'utils.js'));
  const keys = Object.keys(COMPONENTS.rules.items);
  assert.deepEqual(registryProblems(RULE_DIR, keys), []);

  const orphanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ladder-orphan-'));
  try {
    fs.cpSync(RULE_DIR, orphanDir, { recursive: true });
    fs.writeFileSync(path.join(orphanDir, 'orphan.md'), '# Orphan\n');
    assert.ok(registryProblems(orphanDir, keys).length > 0,
      'a real orphan Markdown rule must fire the registry safeguard');
  } finally {
    fs.rmSync(orphanDir, { recursive: true, force: true });
  }

  assert.ok(registryProblems(RULE_DIR, keys.filter((key) => key !== 'cost-of-detection-ladder')).length > 0,
    'a cloned registry missing the ladder slug must fire the registry safeguard');

  const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ladder-consumer-'));
  try {
    execFileSync(process.execPath, [CLI, 'init'], { cwd: consumer, stdio: 'pipe' });
    const installed = read(path.join(consumer, '.claude', 'rules', RULE_FILE));
    assert.deepEqual(ladderProblems(installed), []);
  } finally {
    fs.rmSync(consumer, { recursive: true, force: true });
  }
});

test('P5 — package runner and scope guards reject omitted and out-of-scope inputs', () => {
  const pkg = JSON.parse(read(path.join(PKG_DIR, 'package.json')));
  assert.deepEqual(runnerProblems(pkg), []);

  for (const script of ['test', 'test:unit']) {
    const omitted = JSON.parse(JSON.stringify(pkg));
    omitted.scripts[script] = omitted.scripts[script].replace(TEST_PATH, '');
    assert.deepEqual(runnerProblems(omitted), [script],
      `removing the focused file from the ${script} runner must fire the safeguard`);
  }

  const allowed = [
    'packages/@dzhechkov/p-replicator/templates/.claude/rules/cost-of-detection-ladder.md',
    'features/ship-detection-ladder/07_code_changes/change_manifest.md',
  ];
  assert.deepEqual(scopeProblems(allowed), []);
  assert.deepEqual(
    scopeProblems([...allowed, 'packages/@dzhechkov/harness-cli/src/forbidden.js']),
    ['packages/@dzhechkov/harness-cli/src/forbidden.js'],
    'a real out-of-scope package path must fire the scope safeguard');
});

test('A2 — package files include templates and the actual npm pack listing contains the ladder', async () => {
  const pkg = JSON.parse(read(path.join(PKG_DIR, 'package.json')));
  assert.deepEqual(packagingProblems(pkg), []);
  const omitted = JSON.parse(JSON.stringify(pkg));
  omitted.files = omitted.files.filter((entry) => entry !== 'templates/');
  assert.deepEqual(packagingProblems(omitted), ['package files[] omits templates/'],
    'a cloned files[] without templates/ must fire the distribution safeguard');
  const packedFiles = await npmPackDryRunFiles();
  assert.ok(
    packedFiles.includes(`templates/.claude/rules/${RULE_FILE}`),
    `actual npm pack listing omits templates/.claude/rules/${RULE_FILE}`);
});
