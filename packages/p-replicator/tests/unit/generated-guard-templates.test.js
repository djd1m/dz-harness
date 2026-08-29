'use strict';

// The toolkit generator writes these guards into EVERY project it bootstraps, out of fenced blocks
// in a markdown reference. They did not inherit the three-code discipline the package's own
// checkers have, and the result was measured on 2026-08-27 with the threshold substituted to 2:
//
//   four `class …Entity` on FOUR lines            → ❌ VIOLATION, exit 1   correct
//   the SAME four minified onto ONE line          → ✅ Aggregate size OK, exit 0
//   the file does not exist                       → ✅ Aggregate size OK, exit 0
//   the placeholder never substituted             → ✅ Aggregate size OK, exit 0   GREEN FOREVER
//
// The last is not in the field report and is the worst: `[ 4 -gt "{{MAX_ENTITIES_FROM_FITNESS}}" ]`
// is an invalid integer comparison, bash errors, the `if` is false, and the script falls through to
// success. A generator that ever fails to substitute produces a guard that can never refuse.
//
// These tests EXTRACT the blocks and RUN them. The defect passed every reading; only execution
// against real fixtures proves anything.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const MD = path.join(PKG, 'templates', '.claude', 'skills', 'cc-toolkit-generator-enhanced',
  'references', 'templates', 'ddd-hooks-commands.md');

/** Every fenced shell block, in order — the same text the generator copies out. */
function blocks() {
  const md = fs.readFileSync(MD, 'utf-8');
  const out = [];
  const re = /^```(?:bash|sh)\s*\n([\s\S]*?)^```/gm;
  for (let m = re.exec(md); m !== null; m = re.exec(md)) out.push(m[1]);
  return out;
}

const named = (needle) => {
  const b = blocks().find((x) => x.includes(needle));
  assert.ok(b, 'no fenced block containing ' + needle + ' — the generator has nothing to write');
  return b;
};

/**
 * Run a block the way the generator would: substitute the placeholders, write it out, execute it.
 * `substitute: false` leaves the placeholders intact — the un-substituted case.
 */
function runBlock(code, args, opts) {
  const o = opts || {};
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-gen-')));
  try {
    let script = code;
    if (o.substitute !== false) {
      script = script
        .replace(/\{\{MAX_ENTITIES_FROM_FITNESS\}\}/g, String(o.maxEntities ?? 2))
        .replace(/\{\{MAX_METHODS_FROM_FITNESS\}\}/g, String(o.maxMethods ?? 10));
    }
    const sh = path.join(dir, 'guard.sh');
    fs.writeFileSync(sh, script);
    for (const [name, body] of Object.entries(o.files || {})) {
      const abs = path.join(dir, name);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    const r = spawnSync('bash', [sh, ...(args || [])], { cwd: dir, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const FOUR_LINES = 'class AEntity {}\nclass BEntity {}\nclass CEntity {}\nclass DEntity {}\n';
const FOUR_MINIFIED = 'class AEntity {} class BEntity {} class CEntity {} class DEntity {}\n';

describe('a generated guard inherits the discipline the shipped ones have', () => {
  test('P1 - four declarations are four, on four lines or on one', () => {
    // The measured false-green. grep -c counts LINES, so the minified form counted as 1 and the
    // guard blessed four entities against a limit of two.
    const g = named('Aggregate size');
    for (const [label, body] of [['four lines', FOUR_LINES], ['one line', FOUR_MINIFIED]]) {
      const r = runBlock(g, ['src/a.ts'], { files: { 'src/a.ts': body }, maxEntities: 2 });
      assert.equal(r.code, 1, 'four entities over a limit of two must be a VIOLATION (' + label + '): ' + r.out);
      assert.match(r.out, /4/, 'and the count must be reported (' + label + '): ' + r.out);
    }
  });

  test('P2 - a missing file is exit 2 and is NAMED', () => {
    const g = named('Aggregate size');
    const r = runBlock(g, ['src/nope.ts'], { maxEntities: 2 });
    assert.equal(r.code, 2, 'could-not-read is not "within limits": ' + r.out);
    assert.match(r.out, /nope\.ts/, 'the unreadable path must be named: ' + r.out);
  });

  test('P3 - an unsubstituted placeholder is exit 2', () => {
    // The mode the field report does not name, and the reason the discipline must hold BEFORE
    // substitution: requiring the generator to always substitute correctly puts the property back
    // on the generator's memory, which is layer 4.
    const g = named('Aggregate size');
    const r = runBlock(g, ['src/a.ts'], { files: { 'src/a.ts': FOUR_LINES }, substitute: false });
    assert.equal(r.code, 2,
      'an unsubstituted threshold made this guard green FOREVER: ' + r.out);
    assert.match(r.out, /MAX_ENTITIES_FROM_FITNESS/,
      'and the placeholder must be named so the generator failure is findable: ' + r.out);
  });

  test('P4 - the guard can still PASS', () => {
    // A guard that only fails is as useless as one that only passes, and this suite would not tell
    // them apart without this case.
    const g = named('Aggregate size');
    const r = runBlock(g, ['src/a.ts'],
      { files: { 'src/a.ts': 'class AEntity {}\nclass BEntity {}\n' }, maxEntities: 2 });
    assert.equal(r.code, 0, 'two entities under a limit of two is within limits: ' + r.out);
  });

  test('P5 - the advisory sibling stays advisory and says so', () => {
    // `exit 0 # Warnings only, don't block` is HONEST, and generated projects may rely on it not
    // blocking. The defect was never the exit code; it was that nothing said so where a user looks.
    const g = named('DDD pattern');
    const r = runBlock(g, ['src/a.ts'], { files: { 'src/a.ts': 'class Thing {}\n' } });
    assert.equal(r.code, 0, 'the advisory reporter must keep exit 0: ' + r.out);
    assert.match(r.out, /advisory|не блокирует|never blocks/i,
      'and must say in its OWN OUTPUT that it does not gate: ' + r.out);
  });

  test('P6 - all three exit codes come from ONE block in one run', () => {
    // Each case above asserts one direction; a constant-answering script could pass a subset.
    const g = named('Aggregate size');
    const seen = [
      runBlock(g, ['src/a.ts'], { files: { 'src/a.ts': 'class AEntity {}\n' }, maxEntities: 2 }).code,
      runBlock(g, ['src/a.ts'], { files: { 'src/a.ts': FOUR_MINIFIED }, maxEntities: 2 }).code,
      runBlock(g, ['src/nope.ts'], { maxEntities: 2 }).code,
    ];
    assert.deepEqual(seen, [0, 1, 2], 'expected within/over/could-not-check: ' + JSON.stringify(seen));
  });
});
