'use strict';

// THE DEFECT THIS SUITE CLOSES.
//
// A worker that died looks exactly like a worker that is still running: both are silent. Silence
// therefore reads as "in progress", and a coordinator can report in good faith that a review is
// running when no review exists — the absence of a receipt is indistinguishable from unfinished
// work, so it reads as progress. The cure is to declare the RESULT of every parallel unit to be a
// FILE at a named path: no file, no work, and a machine can say so.
//
// MEASURED 2026-09-01, before this change:
//   templates/.claude/skills/cc-toolkit-generator-enhanced/references/templates/feature-lifecycle.md
//   — 22 matches for parallel-agent dispatch, 0 matches for a file-result requirement.
//   Reproducer: `grep -cE 'parallel|swarm|subagent|Task\(|Task tool' <file>` -> 22
//               `grep -c  'TRACE_PATH' <file>`                              -> 0
//
// The package had ALREADY cured itself: templates/.claude/rules/swarm-file-evidence.md, cited by
// nine of its own files. What it had not done was put the cure in the GENERATORS — the skills whose
// output is written into somebody else's project. So every toolkit this package generates inherited
// a defect its author had already fixed at home. tests/unit/honest-failure-rules.test.js P6 named
// that gap honestly as deferred; this suite is what makes the deferral over.
//
// Three sides, deliberately:
//   1. IDENTITY  — the rule the generator emits is byte-identical to the pre-shipped one.
//   2. CONTRACT  — every generator artifact that dispatches parallel agents carries the contract,
//                  proved by the same twelve-predicate checker the first-party seams use.
//   3. DISCOVERY — no generator file may dispatch parallel agents and be absent from the inventory.
//                  Without this, the next uncured generator file ships in silence.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const SKILLS = path.join(TPL, 'skills');

/** The skills whose OUTPUT is instructions written into a project this package did not create. */
const GENERATOR_SKILLS = ['cc-toolkit-generator-enhanced', 'pipeline-forge'];

/** The emitted-rule template and the pre-shipped rule it must reproduce verbatim. */
const RULE = path.join(TPL, 'rules', 'swarm-file-evidence.md');
const RULE_TEMPLATE = path.join(SKILLS, 'cc-toolkit-generator-enhanced',
  'references', 'templates', 'swarm-file-evidence.md');

/**
 * A generator file that DISPATCHES parallel agents. Deliberately broader than the seam list: this
 * is the discovery net, and a net that only matches what we already fixed would catch nothing.
 */
const DISPATCH = /Task tool|Task\(|[Ss]pawn (?:parallel|concurrent|one|specialized|multiple)|parallel (?:agents?|Task|validators?|tasks)|parallel Tasks/;

/**
 * The inventory, split by how much of the contract each file must carry.
 *
 * `full` — the file IS a dispatch instruction (or the template of one), so it must stand alone:
 *          somebody reads only this file and runs a swarm from it.
 * `pointer` — the file SUMMARISES or ORCHESTRATES; it must name the rule and the two silences, so a
 *          reader knows a contract exists and where it lives, without paying for it twice.
 *
 * The distinction is not cosmetic. Requiring the full block in an index would spend the
 * always-loaded budget on repetition; accepting a pointer in a command template would ship a
 * dispatch instruction whose contract lives somewhere the executing agent never opens.
 */
const GENERATOR_SEAMS = [
  ['cc-toolkit-generator-enhanced/references/templates/feature-lifecycle.md', 'full'],
  ['cc-toolkit-generator-enhanced/references/templates/feature-lifecycle-ent.md', 'full'],
  ['cc-toolkit-generator-enhanced/references/templates/start-command.md', 'full'],
  ['cc-toolkit-generator-enhanced/references/templates/automation-commands.md', 'full'],
  ['cc-toolkit-generator-enhanced/references/templates/swarm-file-evidence.md', 'full'],
  ['pipeline-forge/references/patterns-catalog.md', 'full'],
  ['cc-toolkit-generator-enhanced/SKILL.md', 'pointer'],
  ['cc-toolkit-generator-enhanced/references/claude-md-strategy.md', 'pointer'],
  ['cc-toolkit-generator-enhanced/modules/03-generate-p0.md', 'pointer'],
  ['cc-toolkit-generator-enhanced/modules/04-generate-p1.md', 'pointer'],
  ['cc-toolkit-generator-enhanced/modules/06-package-deliver.md', 'pointer'],
  ['pipeline-forge/SKILL.md', 'pointer'],
  ['pipeline-forge/references/self-extracted-patterns.md', 'pointer'],
  ['pipeline-forge/examples/replicate-analysis.md', 'pointer'],
];

const read = (rel) => fs.readFileSync(path.join(SKILLS, rel), 'utf8');

/**
 * The twelve predicates of the file-receipt contract, in the same shape
 * tests/unit/honest-failure-rules.test.js applies to the eight first-party seams. Kept as a local
 * copy on purpose: importing a `.test.js` would execute its suite, and a shared helper module for
 * two callers is a worse trade than a duplicated function that both sides can mutate against.
 */
function swarmContractProblems(text) {
  const problems = [];
  // MEASURED 2026-09-01: the twelve keyword predicates below are all satisfied by a block retitled
  // "Coordination note" whose opening imperative was softened to "Where convenient". A registered
  // mutation doing exactly that SURVIVED the first version of this suite — so the vocabulary of the
  // contract was tested and its FORCE was not. These two predicates are that gap closed: the
  // heading must say the block is required, and the worker obligation must read `must`, never a
  // suggestion. An optional receipt is not a receipt.
  if (!/Positive file receipt \(required\)/.test(text)) {
    problems.push('the receipt block is not titled as required');
  }
  if (!/must write[\s\S]{0,160}TRACE_PATH/i.test(text)) {
    problems.push('the worker obligation is advisory, not imperative');
  }
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
  return problems;
}

/**
 * What a POINTER owes its reader: where the contract lives, that a file is the result, and that
 * silence proves nothing. Weaker than the full block by design — and still falsifiable, which is
 * the only property that matters.
 */
function pointerProblems(text) {
  const problems = [];
  if (!/swarm-file-evidence\.md/.test(text)) problems.push('does not name the rule file');
  if (!/TRACE_PATH/.test(text)) problems.push('does not name TRACE_PATH');
  if (!/silent|silence/i.test(text)) problems.push('does not say that silence proves nothing');
  return problems;
}

/** Every file under the generator skills, as skill-relative POSIX paths. */
function walk(dir, base, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else out.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return out;
}

function generatorFiles() {
  const out = [];
  for (const skill of GENERATOR_SKILLS) out.push(...walk(path.join(SKILLS, skill), SKILLS));
  return out;
}

/**
 * The discovery verdict: which dispatching generator files are NOT in the inventory.
 *
 * This is the half that survives the next change. A contract test proves the files we already
 * fixed stayed fixed; only this one fires when somebody adds a sixteenth generator file that
 * launches agents and requires nothing.
 */
function uncoveredDispatchers(files, inventory) {
  const declared = new Set(inventory.map(([file]) => file));
  return files.filter((rel) => {
    if (!/\.(md|cjs|js)$/.test(rel)) return false;
    return DISPATCH.test(fs.readFileSync(path.join(SKILLS, rel), 'utf8')) && !declared.has(rel);
  });
}

describe('the swarm file contract reached the GENERATORS, not only the package itself', () => {
  test('G1 - the emitted rule is byte-identical to the pre-shipped rule', () => {
    const canonical = fs.readFileSync(RULE, 'utf8').trimEnd();
    const template = fs.readFileSync(RULE_TEMPLATE, 'utf8');
    const fenced = /```markdown\n([\s\S]*?)\n```/.exec(template);
    assert.ok(fenced, 'the template must carry the rule body in a markdown fence');
    assert.equal(fenced[1], canonical,
      'the generated rule drifted from the pre-shipped one — two copies of a contract that '
      + 'disagree are worse than one, because each side believes it is authoritative');

    // Mutation: a single weakened word in the copy must be observable.
    const mutant = template.replace('silence is\nneither progress nor completion',
      'silence may be read as progress');
    assert.notEqual(mutant, template, 'mutation fixture did not apply — the anchor text moved');
    const mutated = /```markdown\n([\s\S]*?)\n```/.exec(mutant)[1];
    assert.notEqual(mutated, canonical, 'a weakened copy must not compare equal');
  });

  test('G2 - every full-contract generator seam carries all twelve predicates', () => {
    for (const [file, profile] of GENERATOR_SEAMS) {
      if (profile !== 'full') continue;
      assert.deepEqual(swarmContractProblems(read(file)), [], file);
    }
  });

  test('G2m - MUTATION: removing the receipt block from a seam turns it red', () => {
    const file = 'cc-toolkit-generator-enhanced/references/templates/feature-lifecycle.md';
    const source = read(file);
    assert.deepEqual(swarmContractProblems(source), [], 'precondition: the real file is green');

    // Strip exactly what the change added: every "Positive file receipt (required)" block.
    const stripped = source.replace(/#### Positive file receipt \(required\)[\s\S]*?non-atomic-write exception\.\n/g, '');
    assert.notEqual(stripped, source, 'mutation fixture did not apply — the block heading moved');
    const problems = swarmContractProblems(stripped);
    assert.ok(problems.length >= 6,
      'a seam without the block must fail on most predicates, got: ' + problems.join(', '));
    // The two terminal markers are the receipt's whole point: without them a "trace" is a note.
    assert.ok(problems.includes('completed terminal marker missing'), problems.join(', '));
    assert.ok(problems.includes('failed terminal marker missing'), problems.join(', '));
    assert.ok(problems.includes('invalid receipt does not block aggregation'), problems.join(', '));

    // The FORCE of the block, separately from its vocabulary. Downgrading the heading alone leaves
    // every keyword in place — that is how the registered start-command mutation first survived.
    const softened = source.replaceAll('#### Positive file receipt (required)', '#### Coordination note');
    assert.notEqual(softened, source, 'mutation fixture did not apply — the heading moved');
    assert.deepEqual(swarmContractProblems(softened),
      ['the receipt block is not titled as required'],
      'a retitled block must fire exactly the mandate predicate and nothing else');

    // And each predicate must fire INDEPENDENTLY, or one weakened word could hide behind another.
    const weakened = source.replaceAll('Narrative output or\nsilence is never a receipt.', '');
    assert.ok(swarmContractProblems(weakened)
      .includes('narrative or silence can still act as a receipt'),
    'deleting only the silence clause must fire only that predicate');
  });

  test('G3 - every pointer names the rule, the trace path, and the silence', () => {
    for (const [file, profile] of GENERATOR_SEAMS) {
      if (profile !== 'pointer') continue;
      assert.deepEqual(pointerProblems(read(file)), [], file);
    }
    assert.deepEqual(pointerProblems('Spawn parallel agents via Task tool.'),
      ['does not name the rule file', 'does not name TRACE_PATH',
        'does not say that silence proves nothing'],
      'a bare dispatch instruction must fail all three');
  });

  test('G4 - DISCOVERY: no generator file dispatches agents outside the inventory', () => {
    const files = generatorFiles();
    assert.ok(files.length > 20, 'the walk found suspiciously few generator files: ' + files.length);
    assert.deepEqual(uncoveredDispatchers(files, GENERATOR_SEAMS), [],
      'these generator files launch parallel agents and are not covered by the contract');

    // Mutation: shrink the inventory and the net must catch what it no longer declares.
    const short = GENERATOR_SEAMS.filter(([f]) => f !== 'pipeline-forge/SKILL.md');
    assert.deepEqual(uncoveredDispatchers(files, short), ['pipeline-forge/SKILL.md'],
      'dropping a declared seam must reappear as an uncovered dispatcher');
  });

  test('G5 - the deterministic half is registered and wired to no event', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-swarm-receipts'],
      'unregistered, init/doctor/verify would never require the checker');
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-swarm-receipts'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract, so a '
      + 'hook could only print — it could never refuse anything');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(m, 'statusline must declare hooksExpected');
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
    const rule = fs.readFileSync(path.join(TPL, 'rules', 'replicate-pipeline.md'), 'utf-8');
    assert.match(rule, /check-swarm-receipts\.cjs/,
      'the pre-shipped inventory must list it, or the third counter drifts from the other two');
  });

  test('G6 - the generator EMITS the rule and the checker, not just prose about them', () => {
    const p0 = read('cc-toolkit-generator-enhanced/modules/03-generate-p0.md');
    assert.match(p0, /Item 9b: swarm-file-evidence\.md rule/,
      'the P0 item list must carry the rule as a generated artifact');
    assert.match(p0, /\.claude\/rules\/swarm-file-evidence\.md/, 'the output path must be named');
    assert.match(p0, /check-swarm-receipts\.cjs/,
      'the deterministic half must travel with the text half — text alone is layer 2');
    assert.match(p0, /Do NOT overwrite/,
      'a project initialised by p-replicator already has the rule; regenerating it would fight the '
      + 'do-not-overwrite gate');

    const deliver = read('cc-toolkit-generator-enhanced/modules/06-package-deliver.md');
    assert.match(deliver, /CHECK 7b/, 'delivery must gate on the contract having reached the toolkit');
    assert.match(deliver, /FAIL-CLOSED/,
      'a delivery check that passes on absence is the same substitution this whole feature refuses');
  });
});
