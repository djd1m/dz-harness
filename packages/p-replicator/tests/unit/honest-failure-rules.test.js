'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const ROOT = path.join(PKG, 'templates', '.claude');
const CLI = path.join(PKG, 'bin', 'cli.js');
const RULES = ['honest-configuration', 'swarm-file-evidence'];
/**
 * The PREIMAGE of the current change: the always-loaded corpus (rules + commands + every SKILL.md)
 * as it stood BEFORE this change, measured by measureCorpus() below.
 *
 * It must be RE-PINNED with each deliberate corpus growth, and here is why: the guard measures a
 * DELTA against a "before". Left pinned at an older change's preimage, "before" silently stops
 * meaning "before this change" and the trigger degenerates into a permanent ceiling — the package
 * could never add another rule or command again, however small, because the previous change had
 * already spent most of the budget. That is not the property the guard names ("context delta uses
 * fresh measurement"), and it would be a ceiling nobody chose.
 *
 * `ESTIMATED_TRIGGER` is deliberately NOT touched when the preimage moves. Re-pinning the preimage
 * restores the measurement; changing the threshold would relax it, and those are different acts.
 *
 * Re-pinned 2026-09-01 by the LEAD agent after merging THREE parallel branches — `incoming-webhooks`
 * (2658f5a7), `long-running-job` (22885752) and `model-call-cost` (1f4ea077). Each branch measured
 * its own delta against the SAME preimage and each fitted the trigger ALONE; none of them could see
 * the other two. The preimage is therefore pinned to the state BEFORE ALL THREE, not to the last of
 * them: pinning to the last would let the gate weigh one contribution and stay silent about two,
 * which is the exact form of dishonesty this gate exists to prevent. The owner instructed that
 * `ESTIMATED_TRIGGER` NOT be raised under any result — a red gate telling the truth is worth more
 * than a green one bought by moving the line.
 *
 * Preimage = the `embeddable-widget` pin (backlog 23ed5f5c), which is the last state preceding all
 * three merged rules. Reproducer: measureCorpus() over templates/.claude/{rules,commands}/*.md plus
 * every SKILL.md under skills/, run on the commit that shipped embeddable-widget.
 */
const FRESH_BEFORE = { files: 31, bytes: 356009, estimatedTokens: 91951.85 };
const ESTIMATED_TRIGGER = 4037.75;
const SEAMS = [
  ['commands/feature.md', 'both'],
  ['rules/feature-lifecycle.md', 'both'],
  ['commands/harvest.md', 'both'],
  ['commands/replicate.md', 'both'],
  ['commands/go.md', 'both'],
  ['commands/start.md', 'both'],
  ['skills/knowledge-extractor/modules/01-agent-review.md', 'both'],
  ['agents/harvest-coordinator.md', 'both'],
];

const read = (rel) => fs.readFileSync(path.join(PKG, rel), 'utf8');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const cleanup = (dir) => fs.rmSync(dir, { recursive: true, force: true });

function swarmContractProblems(text, profile = 'both') {
  const problems = [];
  const dispatch = profile === 'both' || profile === 'dispatch';
  const receipt = profile === 'both' || profile === 'receipt';
  if (dispatch) {
    if (!/WORK_UNIT_ID/.test(text)) problems.push('dispatch does not name WORK_UNIT_ID');
    if (!/TRACE_PATH/.test(text)) problems.push('dispatch does not name TRACE_PATH');
    if (!/absolute/i.test(text)) problems.push('TRACE_PATH is not resolved as absolute');
    if (!/(?:unique|different|distinct)[\s\S]{0,100}(?:WORK_UNIT_ID|TRACE_PATH)|(?:WORK_UNIT_ID|TRACE_PATH)[\s\S]{0,100}(?:unique|different|distinct)/i.test(text)) {
      problems.push('trace path is not unique per work unit');
    }
    const write = text.search(/write[\s\S]{0,100}TRACE_PATH/i);
    const reportAfterWrite = write < 0 ? -1 : text.slice(write)
      .search(/one-line[\s\S]{0,40}(?:pointer|report)|(?:pointer|report)[\s\S]{0,40}one-line/i);
    if (write < 0 || reportAfterWrite < 0) problems.push('worker does not write before report');
  }
  if (receipt) {
    const required = [
      [/regular/i, 'regular-file check missing'],
      [/non-symlink|not a symlink/i, 'symlink refusal missing'],
      [/non-(?:empty|whitespace)|substantive/i, 'substantive-body check missing'],
      [/post-launch|after[\s\S]{0,40}launch|pre-dispatch/i, 'freshness boundary missing'],
      [/Status: completed/, 'completed terminal marker missing'],
      [/Status: failed/, 'failed terminal marker missing'],
      [/(?:narrative|chat)[\s\S]{0,80}(?:not|never)[\s\S]{0,40}(?:receipt|result)|silence[\s\S]{0,80}(?:not|never)/i,
        'narrative or silence can still act as a receipt'],
      [/(?:refuse|block|must not)[\s\S]{0,100}(?:merge|synthesis|aggregation|completion)/i,
        'invalid receipt does not block aggregation'],
    ];
    for (const [pattern, message] of required) if (!pattern.test(text)) problems.push(message);
  }
  return problems;
}

function inspectReceipt({ workUnitId, tracePath, launchMs, liveness = 'unknown', probeError = false,
  forceReadError = false }) {
  if (!workUnitId || !path.isAbsolute(tracePath)) return { state: 'undelivered', reason: 'assignment' };
  if (probeError) return { state: 'inconclusive', reason: 'liveness-probe-error' };
  let stat;
  try { stat = fs.lstatSync(tracePath); } catch (error) {
    if (error.code !== 'ENOENT') return { state: 'inconclusive', reason: 'unreadable' };
    if (liveness === 'live') return { state: 'waiting', reason: 'positive-liveness-only' };
    return { state: 'undelivered', reason: liveness === 'dead' ? 'dead-worker' : 'missing' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { state: 'undelivered', reason: 'not-regular' };
  if (stat.mtimeMs <= launchMs) return { state: 'undelivered', reason: 'stale' };
  let body;
  try {
    if (forceReadError) throw new Error('fixture read failure');
    body = fs.readFileSync(tracePath, 'utf8');
  } catch { return { state: 'inconclusive', reason: 'unreadable' }; }
  if (!body.trim()) return { state: 'undelivered', reason: 'empty' };
  const lines = body.trimEnd().split(/\r?\n/);
  const terminal = lines.at(-1);
  if (!/^Status: (completed|failed)$/.test(terminal)) return { state: 'undelivered', reason: 'non-terminal' };
  if (!lines.slice(0, -1).join('\n').trim()) return { state: 'undelivered', reason: 'empty-payload' };
  return terminal === 'Status: completed'
    ? { state: 'completed', reason: 'terminal-receipt' }
    : { state: 'failed', reason: 'delivered-failure' };
}

function decideConfiguration(fixture) {
  if (fixture.optionalDependency && fixture.fallbackCannotAlterExternalOutput) return 'OPTIONAL_FALLBACK';
  if (fixture.phase === 'build' && fixture.cannotEmitExternalOutput) return 'BOUNDED_BUILD_SUBSTITUTE';
  if (fixture.declared && !fixture.readByDecision) return 'REFUSE';
  if (fixture.authority === 'unreachable') return 'UNKNOWN';
  if (fixture.ratio && fixture.ratio.denominator === 0) return 'UNAVAILABLE';
  if (fixture.required && fixture.value === undefined) return 'REFUSE';
  if (fixture.required && fixture.value === '') return 'REFUSE';
  if (fixture.value === '/' && fixture.kind === 'base-url') return 'REFUSE';
  if (fixture.kind === 'cidr' && fixture.value === '/0' && fixture.derivedFromEmpty) return 'REFUSE';
  if (fixture.kind === 'allowlist' && Array.isArray(fixture.value) && fixture.value.length === 0) return 'REFUSE';
  if (fixture.recognized === false) return 'REFUSE';
  return 'ACCEPT';
}

function parseDecisionRows(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\|\s*(CFG-[SI]\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|/);
    if (match) rows.set(match[1], { signal: match[2].trim(), response: match[3].trim() });
  }
  return rows;
}

function configurationContractProblems(text) {
  const problems = [];
  if (!/^### Substitution axis$/m.test(text)) problems.push('substitution axis missing');
  if (!/^### Interpretation axis$/m.test(text)) problems.push('interpretation axis missing');
  const rows = parseDecisionRows(text);
  const required = {
    'CFG-S1': /REFUSE/,
    'CFG-S2': /REFUSE/,
    'CFG-I1': /REFUSE|UNKNOWN/,
    'CFG-I2': /REFUSE/,
    'CFG-I3': /REFUSE/,
    'CFG-I4': /REFUSE|UNKNOWN/,
    'CFG-I5': /REFUSE/,
    'CFG-I6': /REFUSE/,
    'CFG-I7': /UNAVAILABLE|UNKNOWN/,
    'CFG-I8': /CODE-OWNED/,
  };
  for (const [id, allowed] of Object.entries(required)) {
    const row = rows.get(id);
    if (!row) problems.push(`${id} missing`);
    else if (!allowed.test(row.response)) problems.push(`${id} is fail-open: ${row.response}`);
  }
  const collapsed = rows.get('CFG-I1')?.signal === rows.get('CFG-I2')?.signal;
  if (collapsed) problems.push('undefined and empty string are collapsed');
  return problems;
}

function ruleShapeProblems(text) {
  const problems = [];
  for (const heading of ['Rule', 'Mechanics', 'Bounded exception', 'Observable violation → replacement', 'Self-check']) {
    if (!new RegExp(`^## ${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm').test(text)) {
      problems.push(`${heading} section missing`);
    }
  }
  if (/be careful|будьте внимательны/i.test(text)) problems.push('non-actionable admonition');
  if (/\/home\/|dz brain|dz-harness-hub/.test(text)) problems.push('private runtime dependency');
  return problems;
}

function walkSkills(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walkSkills(file, out);
    else if (entry.name === 'SKILL.md') out.push(file);
  }
}

function measureCorpus(root) {
  const files = [];
  for (const dir of ['rules', 'commands']) {
    for (const name of fs.readdirSync(path.join(root, dir)).sort()) {
      if (name.endsWith('.md')) files.push(path.join(root, dir, name));
    }
  }
  walkSkills(path.join(root, 'skills'), files);
  const rows = files.map((file) => {
    const bytes = fs.readFileSync(file);
    const cyrillic = (bytes.toString('utf8').match(/[\u0400-\u04ff]/g) || []).length;
    const divisor = (cyrillic * 2) / bytes.length > 0.5 ? 2.5 : 4;
    return { file, bytes: bytes.length, estimatedTokens: bytes.length / divisor };
  });
  return rows.reduce((total, row) => ({
    files: total.files + 1,
    bytes: total.bytes + row.bytes,
    estimatedTokens: total.estimatedTokens + row.estimatedTokens,
  }), { files: 0, bytes: 0, estimatedTokens: 0 });
}

function deltaProblems({ before, after, labels, complete = true }) {
  const problems = [];
  if (!complete) problems.push('measurement input unreadable');
  if (!labels.includes('unconditional rules+commands')) problems.push('unconditional load surface unlabeled');
  if (!labels.includes('invocation-dependent skills')) problems.push('skills mislabeled as unconditional');
  if (after.estimatedTokens - before.estimatedTokens > ESTIMATED_TRIGGER) problems.push('compression required');
  return problems;
}

function boundaryProblems(slugs) {
  const actual = [...slugs].sort();
  return actual.length === 2 && RULES.every((slug) => actual.includes(slug))
    ? [] : [`expected exactly ${RULES.join(' + ')}, got ${actual.join(' + ')}`];
}

function seamInventoryProblems(paths) {
  const expected = SEAMS.map(([file]) => file).sort();
  const actual = [...new Set(paths)].sort();
  return actual.length === expected.length && expected.every((file) => actual.includes(file))
    ? [] : [`owned seam inventory mismatch: ${actual.join(', ')}`];
}

function countClaimProblems(text, expected) {
  const claim = /(\d+)\s+rules\b|(\d+)\s+правил|Rules[ \t]+(?:●|\()?(\d+)|\*\*(\d+) rules\*\*/g;
  return [...text.matchAll(claim)]
    .map((match) => Number(match[1] || match[2] || match[3] || match[4]))
    .filter((number) => number === expected || number === 7)
    .filter((number) => number !== expected)
    .map((number) => `current rule count says ${number}, expected ${expected}`);
}

function packageExportProblems(files) {
  const required = ['templates', 'tests', '.dz-manifest.json', 'sbom.json'];
  const normalized = files.map((entry) => entry.replace(/\/$/, ''));
  return required.filter((entry) => !normalized.includes(entry)).map((entry) => `package export omits ${entry}`);
}

function assignmentProblems(assignments) {
  const problems = [];
  const paths = assignments.map((entry) => entry.tracePath);
  if (paths.some((tracePath) => !path.isAbsolute(tracePath))) problems.push('TRACE_PATH is not absolute');
  if (new Set(paths).size !== paths.length) problems.push('duplicate TRACE_PATH');
  if (new Set(assignments.map((entry) => entry.workUnitId)).size !== assignments.length) {
    problems.push('duplicate WORK_UNIT_ID');
  }
  return problems;
}

function runCli(dir, command, extra = []) {
  const result = spawnSync(process.execPath, [CLI, command, ...extra], {
    cwd: dir, encoding: 'utf8', timeout: 30000,
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

test('P0 - ADR boundary is one feature with exactly two non-duplicated rules', () => {
  assert.deepEqual(boundaryProblems(RULES), []);
  assert.equal(boundaryProblems(['honest-failure']).length, 1,
    'one catch-all rule must not erase the two reader decisions');
  assert.equal(boundaryProblems(['swarm-file-evidence', 'silent-substitution', 'fail-closed']).length, 1,
    'three intake labels must not become three always-loaded files');
  for (const slug of RULES) {
    assert.ok(fs.existsSync(path.join(ROOT, 'rules', `${slug}.md`)), `missing chosen rule ${slug}`);
  }
});

test('P1 - registry and rule filesystem agree on the thirteen-rule contract', () => {
  const registry = JSON.parse(read('src/rule-components.json'));
  const files = fs.readdirSync(path.join(ROOT, 'rules'))
    .filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3)).sort();
  assert.equal(Object.keys(registry).length, 13, 'the canonical registry must carry thirteen rules');
  assert.deepEqual(Object.keys(registry).sort(), files, 'registry and canonical rule files diverged');
  for (const slug of RULES) assert.ok(registry[slug], `registry missing ${slug}`);
});

test('P2 - receipt matrix refuses missing empty stale partial and non-terminal traces', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-receipt-')));
  const launchMs = Date.now() - 1000;
  const trace = (name) => path.join(dir, `${name}.md`);
  try {
    assert.deepEqual(inspectReceipt({ workUnitId: 'missing', tracePath: trace('missing'), launchMs }),
      { state: 'undelivered', reason: 'missing' });
    assert.equal(inspectReceipt({ workUnitId: 'live', tracePath: trace('live'), launchMs,
      liveness: 'live' }).state, 'waiting', 'a live PID may extend waiting but is not delivery');
    assert.deepEqual(inspectReceipt({ workUnitId: 'dead', tracePath: trace('dead'), launchMs,
      liveness: 'dead' }), { state: 'undelivered', reason: 'dead-worker' });
    assert.equal(inspectReceipt({ workUnitId: 'probe', tracePath: trace('probe'), launchMs,
      probeError: true }).state, 'inconclusive');

    fs.writeFileSync(trace('empty'), ' \n');
    assert.equal(inspectReceipt({ workUnitId: 'empty', tracePath: trace('empty'), launchMs }).reason, 'empty');
    fs.writeFileSync(trace('stale'), 'payload\nStatus: completed\n');
    fs.utimesSync(trace('stale'), new Date(launchMs - 5000), new Date(launchMs - 5000));
    assert.equal(inspectReceipt({ workUnitId: 'stale', tracePath: trace('stale'), launchMs }).reason, 'stale');
    fs.writeFileSync(trace('partial'), 'payload without terminal marker\n');
    assert.equal(inspectReceipt({ workUnitId: 'partial', tracePath: trace('partial'), launchMs }).reason,
      'non-terminal');
    fs.writeFileSync(trace('failed'), 'diagnostic\nStatus: failed\n');
    assert.equal(inspectReceipt({ workUnitId: 'failed', tracePath: trace('failed'), launchMs }).state, 'failed');
    fs.writeFileSync(trace('complete'), 'substantive result\nStatus: completed\n');
    assert.equal(inspectReceipt({ workUnitId: 'complete', tracePath: trace('complete'), launchMs }).state,
      'completed');
    assert.equal(inspectReceipt({ workUnitId: 'unreadable', tracePath: trace('complete'), launchMs,
      forceReadError: true }).state, 'inconclusive');
    fs.symlinkSync(trace('complete'), trace('link'));
    assert.equal(inspectReceipt({ workUnitId: 'link', tracePath: trace('link'), launchMs }).reason,
      'not-regular');
    assert.deepEqual(assignmentProblems([
      { workUnitId: 'a', tracePath: trace('shared') },
      { workUnitId: 'b', tracePath: trace('shared') },
    ]), ['duplicate TRACE_PATH']);
    assert.deepEqual(assignmentProblems([
      { workUnitId: 'a', tracePath: trace('a') },
      { workUnitId: 'b', tracePath: trace('b') },
    ]), []);
  } finally { cleanup(dir); }
});

test('P3 - absent malformed and unreachable external inputs refuse instead of becoming plausible output', () => {
  const cases = [
    [{ required: true, value: undefined }, 'REFUSE', 'absent required value'],
    [{ required: true, value: '' }, 'REFUSE', 'empty differs from undefined'],
    [{ required: true, value: '/', kind: 'base-url' }, 'REFUSE', "BASE_URL='/'"],
    [{ required: true, value: '/0', kind: 'cidr', derivedFromEmpty: true }, 'REFUSE', 'empty CIDR'],
    [{ required: true, value: [], kind: 'allowlist' }, 'REFUSE', 'empty allowlist'],
    [{ required: true, value: 'tyop', recognized: false }, 'REFUSE', 'unknown tariff'],
    [{ required: true, value: 'cached', authority: 'unreachable' }, 'UNKNOWN', 'unreachable authority'],
    [{ required: true, value: 'declared', declared: true, readByDecision: false }, 'REFUSE',
      'declared-but-unread input'],
    [{ ratio: { numerator: 0, denominator: 0 } }, 'UNAVAILABLE', '0/0'],
    [{ required: true, value: '/', kind: 'base-url', failureSentinel: false }, 'REFUSE',
      'invalid obtained value bypassed the failure sentinel'],
    [{ required: true, value: 'https://example.test', recognized: true }, 'ACCEPT', 'explicit valid value'],
    [{ optionalDependency: true, fallbackCannotAlterExternalOutput: true }, 'OPTIONAL_FALLBACK',
      'legitimate optional dependency'],
    [{ phase: 'build', cannotEmitExternalOutput: true }, 'BOUNDED_BUILD_SUBSTITUTE',
      'named non-emitting build phase'],
  ];
  for (const [fixture, expected, label] of cases) {
    assert.equal(decideConfiguration(fixture), expected, label);
  }

  const source = read('templates/.claude/rules/honest-configuration.md');
  assert.deepEqual(configurationContractProblems(source), []);
  const substitutionMutant = source.replace(/(\|\s*CFG-S1\s*\|[^|]+\|)\s*REFUSE/, '$1 DEFAULT');
  assert.ok(configurationContractProblems(substitutionMutant).some((p) => p.includes('CFG-S1')),
    'weakening substitution must fire independently');
  const interpretationMutant = source.replace(/(\|\s*CFG-I2\s*\|[^|]+\|)\s*REFUSE/, '$1 ALLOW');
  assert.ok(configurationContractProblems(interpretationMutant).some((p) => p.includes('CFG-I2')),
    'weakening interpretation must fire independently');
});

test('P4 - both rules use actionable rule mechanics exception and self-check sections', () => {
  const clean = [
    '# Fixture',
    '## Rule',
    'Refuse the operation.',
    '## Mechanics',
    'Inspect the value.',
    '## Bounded exception',
    'None.',
    '## Observable violation → replacement',
    'DEFAULT is the violation; REFUSE instead.',
    '## Self-check',
    'Run the bad and good fixtures.',
  ].join('\n');
  assert.deepEqual(ruleShapeProblems(clean), []);
  for (const heading of ['Rule', 'Mechanics', 'Bounded exception', 'Observable violation → replacement',
    'Self-check']) {
    const malformed = clean.replace(`## ${heading}`, `## Missing ${heading}`);
    assert.ok(ruleShapeProblems(malformed).some((problem) => problem.includes(heading)),
      `malformed fixture did not detect missing ${heading}`);
  }
  for (const slug of RULES) {
    assert.deepEqual(ruleShapeProblems(read(`templates/.claude/rules/${slug}.md`)), [], slug);
  }
});

test('P5 - context delta uses fresh measurement and honest load-surface labels', () => {
  const live = measureCorpus(ROOT);
  assert.ok(live.files >= FRESH_BEFORE.files, 'adding rules cannot reduce the measured same-set file count');
  assert.ok(live.bytes >= FRESH_BEFORE.bytes, 'fresh preimage must remain the lower attribution boundary');
  assert.deepEqual(deltaProblems({
    before: FRESH_BEFORE,
    after: live,
    labels: ['unconditional rules+commands', 'invocation-dependent skills'],
  }), []);
  assert.deepEqual(deltaProblems({
    before: FRESH_BEFORE,
    after: { ...FRESH_BEFORE, estimatedTokens: FRESH_BEFORE.estimatedTokens + ESTIMATED_TRIGGER + 1 },
    labels: ['unconditional rules+commands', 'invocation-dependent skills'],
  }), ['compression required']);
  assert.ok(deltaProblems({ before: FRESH_BEFORE, after: FRESH_BEFORE,
    labels: ['unconditional rules+commands'], complete: false }).length >= 2,
  'unreadable or mislabeled measurement must not become a zero delta');
});

test('P6 - the owned inventory is eight first-party seams, and the generators have their own', () => {
  const files = SEAMS.map(([file]) => file);
  assert.deepEqual(seamInventoryProblems(files), []);
  assert.equal(seamInventoryProblems(files.slice(0, -1)).length, 1,
    'omitting an owned seam must be observable');
  assert.equal(seamInventoryProblems([...files, 'skills/generator/example.md']).length, 1,
    'this list is FIRST-PARTY only; a generator seam belongs to the generator inventory');

  // Until 2026-09-01 this test asserted that generator coverage was DEFERRED, and said so honestly.
  // It is no longer deferred: the contract now travels with the toolkits this package generates,
  // and its inventory, its twelve-predicate check, its discovery net and its mutation proof live in
  // tests/unit/generator-swarm-contract.test.js. Leaving the old wording here would have turned an
  // honest deferral into a false one — the same substitution the whole feature refuses.
  const generatorSuite = path.join(PKG, 'tests', 'unit', 'generator-swarm-contract.test.js');
  assert.ok(fs.existsSync(generatorSuite),
    'the generator half must be proved somewhere, or this file is silently the only claim');
  const generatorSource = fs.readFileSync(generatorSuite, 'utf8');
  assert.match(generatorSource, /const GENERATOR_SEAMS = \[/,
    'the generator inventory must be enumerated, not implied');
  assert.match(generatorSource, /uncoveredDispatchers/,
    'an inventory without a discovery net cannot notice the NEXT uncured generator file');
});

test('P7 - current package inventories derive the thirteen-rule count', () => {
  assert.deepEqual(countClaimProblems('Pre-shipped: 12 rules. Rules ●11+2. **12 rules**', 11), []);
  assert.equal(countClaimProblems('Pre-shipped: 7 rules.', 11).length, 1,
    'the deliberately stale count fixture must fire');
  const docs = [
    'README.md',
    'MULTIPLATFORM_ROADMAP.md',
    'README/eng/01_quickstart.md',
    'README/eng/02_user_guide.md',
    'README/eng/03_admin_guide.md',
    'README/eng/README.md',
    'README/ru/01_quickstart.md',
    'README/ru/02_user_guide.md',
    'README/ru/03_admin_guide.md',
    'README/ru/README.md',
    'README/ru/html/index.html',
    'templates/.claude/commands/replicate.md',
    'templates/.claude/rules/replicate-pipeline.md',
  ];
  const wrong = docs.flatMap((file) => countClaimProblems(read(file), 11).map((problem) => `${file}: ${problem}`));
  assert.deepEqual(wrong, []);
});

test('P8 - every owned group-A swarm seam requires a named trace before synthesis', () => {
  for (const [file, profile] of SEAMS) {
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.deepEqual(swarmContractProblems(source, profile), [], file);
    assert.ok(swarmContractProblems(source.replace(/WORK_UNIT_ID/g, 'UNIT'), profile)
      .some((problem) => problem.includes('WORK_UNIT_ID')), `${file}: dispatch mutant survived`);
    assert.ok(swarmContractProblems(source.replace(/Status: completed/g, 'Status: done'), profile)
      .some((problem) => problem.includes('completed terminal')), `${file}: receipt mutant survived`);
  }

  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-honest-init-')));
  try {
    const init = runCli(project, 'init');
    assert.equal(init.code, 0, init.out);
    for (const [file, profile] of SEAMS) {
      const installed = fs.readFileSync(path.join(project, '.claude', file), 'utf8');
      assert.deepEqual(swarmContractProblems(installed, profile), [], `fresh init: ${file}`);
    }
  } finally { cleanup(project); }
});

test('P9 - targeted honest-failure mutation and runner wiring are discriminating', () => {
  const packageJson = JSON.parse(read('package.json'));
  for (const runner of ['test', 'test:unit']) {
    assert.match(packageJson.scripts[runner], /tests\/unit\/honest-failure-rules\.test\.js/,
      `${runner} omits the focused oracle`);
  }
  const registry = JSON.parse(read('test/mutation-registry.json'));
  const entry = registry.entries.find((candidate) =>
    candidate.id === 'honest-failure-swarm-receipt-required');
  assert.ok(entry, 'focused mutation id is not registered');
  assert.equal(entry.file, 'templates/.claude/commands/feature.md');
  assert.ok(entry.mutation.find.includes('\n'), 'the production anchor must be multiline');
  assert.ok(entry.mutation.find.length > 100, 'the anchor must be specific enough to stay unique');
  assert.ok(/P2/.test(entry.property) && /P8/.test(entry.property) && /P9/.test(entry.property),
    'the property must name the real receipt, live-seam, and wiring oracles');
  assert.ok(Number.isInteger(entry.minFailing) && entry.minFailing >= 1);
  const target = read(entry.file);
  assert.equal(target.split(entry.mutation.find).length - 1, 1, 'mutation anchor must occur exactly once');
  const mutant = target.replace(entry.mutation.find, entry.mutation.replace);
  assert.ok(swarmContractProblems(mutant).length > 0, 'registered source mutation does not weaken P8');
});

test('P10 - fresh init pack registry manifest and SBOM carry both rules', () => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-honest-dist-')));
  try {
    const init = runCli(project, 'init');
    assert.equal(init.code, 0, init.out);
    for (const slug of RULES) {
      const installed = path.join(project, '.claude', 'rules', `${slug}.md`);
      assert.ok(fs.readFileSync(installed, 'utf8').trim(), `fresh init omitted ${slug}`);
    }
    const verify = runCli(project, 'verify');
    assert.equal(verify.code, 0, verify.out);
    const doctor = runCli(project, 'doctor');
    assert.equal(doctor.code, 0, doctor.out);
    fs.rmSync(path.join(project, '.claude', 'rules', `${RULES[0]}.md`));
    const update = runCli(project, 'update');
    assert.equal(update.code, 0, update.out);
    assert.ok(fs.readFileSync(path.join(project, '.claude', 'rules', `${RULES[0]}.md`), 'utf8').trim(),
      'update did not restore a registered canonical rule');
  } finally { cleanup(project); }

  const packageJson = JSON.parse(read('package.json'));
  assert.deepEqual(packageExportProblems(packageJson.files), []);
  assert.deepEqual(packageExportProblems(packageJson.files.filter((entry) => entry !== 'templates/')),
    ['package export omits templates'], 'the deliberately incomplete package allowlist must fire');
  const manifest = JSON.parse(read('.dz-manifest.json'));
  const sbom = JSON.parse(read('sbom.json'));
  for (const slug of RULES) {
    const relative = `templates/.claude/rules/${slug}.md`;
    const digest = hash(path.join(PKG, relative));
    const signed = manifest.manifest.files.find((entry) => entry.path === relative);
    assert.equal(signed?.sha256, digest, `manifest missing or stale for ${relative}`);
    const component = sbom.components.find((entry) => entry.name === relative);
    assert.equal(component?.hashes.find((entry) => entry.alg === 'SHA-256')?.content, digest,
      `SBOM missing or stale for ${relative}`);
  }
});
