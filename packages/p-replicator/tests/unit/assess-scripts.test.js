'use strict';

// brutal-honesty-review is Phase 4 of /feature — where a course participant meets it. Its two
// assessment scripts print verdicts and CANNOT FAIL. MEASURED 2026-08-27:
//
//   assess-code.sh  on TODO/FIXME/BUG/HACK + nested for(;;) + empty catch + eval  → 2 red, exit 0
//   assess-tests.sh on two tests, one timing-based, no edge cases                 → 6 red, exit 0
//   assess-tests.sh /nope/nope                                                    →        exit 1
//
// The semantics is INVERTED: "I could not check" is louder than "I found six violations". A
// participant sees red on screen and any automation reads success.
//
// Both scripts DETECT correctly — seven and nine verdict sites, all firing on the right inputs.
// Nothing about the detection is wrong; nobody counts. These tests RUN the real scripts.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const SCRIPTS = path.join(PKG, 'templates', '.claude', 'skills', 'brutal-honesty-review', 'scripts');
const CODE = path.join(SCRIPTS, 'assess-code.sh');
const TESTS = path.join(SCRIPTS, 'assess-tests.sh');

/** Build a throwaway target and run one script over it. `arg: null` passes no argument at all. */
function run(script, files, arg) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-assess-')));
  try {
    for (const [name, body] of Object.entries(files || {})) {
      const abs = path.join(dir, name);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const argv = arg === null ? [script] : [script, path.join(dir, arg === undefined ? 'target' : arg)];
    const r = spawnSync('bash', argv, { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const AWFUL = 'function f(){ /* TODO FIXME BUG HACK */ for(;;){for(;;){}} try{}catch(e){} eval(x); }\n';
// "Clean" BY THIS SCRIPT'S OWN STANDARDS, which are stricter than they first look: it wants
// try/catch present and a tests directory to exist. My first fixture had neither and produced two
// legitimate findings — the fixture was wrong, not the detection, which AR-1 forbids touching.
const CLEAN = 'export function add(a, b) {\n'
  + '  try {\n    if (typeof a !== "number") throw new Error("bad");\n    return a + b;\n'
  + '  } catch (e) {\n    console.error(e);\n    throw e;\n  }\n}\n';
// `tests/` sits at the fixture ROOT, not under target/: the script's testability check reads
// `[ -d "tests" ]` against the CURRENT WORKING DIRECTORY rather than against $TARGET. That is a
// pre-existing quirk — arguably its own defect — and AR-1 forbids changing detection in this
// change, so the fixture matches the script rather than the other way round. Filed separately.
const CLEAN_TREE = { 'target/add.js': CLEAN, 'tests/add.test.js': "test('adds', () => {});\n" };
const BAD_TESTS = "test('t1', () => {});\ntest('t2', () => { setTimeout(() => {}, 1) });\n";

describe('an assessment script that prints verdicts can refuse', () => {
  test('P1 - awful code exits 1, and the count is printed', () => {
    const r = run(CODE, { 'target/awful.js': AWFUL });
    assert.equal(r.code, 1, 'red verdicts on screen must reach the exit code: ' + r.out);
    assert.match(r.out, /🔴/, 'and the verdicts themselves must still appear: ' + r.out);
    assert.match(r.out, /\b[1-9]\d*\b.*(?:finding|issue|проблем|нарушен)/i,
      'the count must be stated, so a human sees the same answer as the exit code: ' + r.out);
  });

  test('P2 - bad tests exit 1', () => {
    const r = run(TESTS, { 'target/a.test.js': BAD_TESTS });
    assert.equal(r.code, 1, 'six red verdicts must not read as success: ' + r.out);
    assert.match(r.out, /🔴/, r.out);
  });

  test('P3 - could-not-check is 2, and no argument is 2', () => {
    // THE inversion. Today a nonexistent path exits 1 while six violations exit 0, so a gate
    // reading 1 cannot tell blindness from findings. A caller who passed nothing and one pointing
    // at a missing directory made the same class of mistake: the script could not look.
    for (const script of [CODE, TESTS]) {
      const missing = run(script, {}, 'nope');
      assert.equal(missing.code, 2,
        path.basename(script) + ': a target that does not exist is could-not-check: ' + missing.out);
      const noArg = run(script, {}, null);
      assert.equal(noArg.code, 2,
        path.basename(script) + ': no argument is could-not-check too: ' + noArg.out);
    }
  });

  test('P4 - clean input exits 0', () => {
    // A script that only fails is as useless as one that only passes, and without this the suite
    // could not tell them apart.
    const r = run(CODE, CLEAN_TREE);
    assert.equal(r.code, 0, 'clean code must pass: ' + r.out);
  });

  test('P5 - detection is unchanged', () => {
    // The change adds counting. If a verdict that used to fire stops firing, the exit code is right
    // for the wrong reason — and this suite would still be green.
    const r = run(CODE, { 'target/awful.js': AWFUL });
    // Only markers that DID fire before the change. `Found N loops` needs more than five lines
    // matching `for.*{` and never fired on this input — asserting it would have been a test for
    // behaviour the script never had.
    for (const marker of [/TODO\/FIXME\/BUG\/HACK/, /No test directory found/]) {
      assert.match(r.out, marker, 'a verdict that fired before must still fire: ' + r.out);
    }
  });

  test('P6 - the closing voice survives', () => {
    // The Ramsay-voice lines are the skill's character and a participant reads them. The verdict is
    // ADDED, not substituted.
    const r = run(CODE, CLEAN_TREE);
    assert.match(r.out, /wouldn't deploy this to production/i,
      'the closing prose must not be replaced by a machine verdict: ' + r.out);
  });

  test('P7 - all three verdicts from ONE script in one run', () => {
    // assess-code.sh reaches all three from fixtures.
    const seen = [
      run(CODE, CLEAN_TREE).code,
      run(CODE, { 'target/awful.js': AWFUL }).code,
      run(CODE, {}, 'nope').code,
    ];
    assert.deepEqual(seen, [0, 1, 2], 'assess-code.sh: ' + JSON.stringify(seen));
  });

  test('P8 - assess-tests.sh reaches 1 and 2; its 0 path is proven by the shared footer', () => {
    // HONEST LIMIT, stated rather than faked. assess-tests.sh RUNS the suite it is pointed at
    // ("Tests don't even pass", "Tests failed 3/3 times"), so reaching exit 0 needs a real,
    // installed, passing project — out of reach of a unit fixture. Constructing a fake green here
    // would be the class of lie this whole file exists to remove.
    //
    // What IS proven: both non-zero verdicts from fixtures, and that the exit-0 branch is the SAME
    // mechanism proven reachable in P7 — the two scripts carry a byte-identical verdict footer, so
    // demonstrating it in one demonstrates the mechanism in both.
    const seen = [
      run(TESTS, { 'target/a.test.js': BAD_TESTS }).code,
      run(TESTS, {}, 'nope').code,
    ];
    assert.deepEqual(seen, [1, 2], 'assess-tests.sh: ' + JSON.stringify(seen));

    const footer = (f) => {
      const src = fs.readFileSync(f, 'utf-8');
      const at = src.indexOf('# ── Verdict ─');
      assert.ok(at > 0, f + ' must carry the verdict footer');
      return src.slice(at);
    };
    assert.equal(footer(TESTS), footer(CODE),
      'the verdict footer must be identical in both, or P7 proves nothing about this script');
    assert.match(footer(TESTS), /VERDICT: 0 findings\./,
      'and the exit-0 branch must exist in it');
    assert.match(footer(TESTS), /\nexit 0\n?$/, 'ending in the successful exit');
  });
});
