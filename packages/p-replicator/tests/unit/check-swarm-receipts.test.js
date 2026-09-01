'use strict';

// The deterministic half of the swarm contract. The rule text is prose a model reads — layer 2,
// violated in silence. This is layer 1, and only for whoever runs it.
//
// The load-bearing property is the THIRD exit code, for the same reason it is in check-ports and
// check-growth-trace: a checker that answers "clean" when it could not look converts an unknown
// into a reassurance. Here the unknown has a specific and very common cause — a worker whose PID is
// still alive and whose trace has not appeared yet. That is not delivery and it is not failure; it
// is "not yet", and reading it as either would be a lie in a different direction each time.
//
// These are BEHAVIOUR tests: the real utility, real files, real exit codes.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-swarm-receipts.cjs');

/**
 * Build a throwaway run directory, write the traces described, and run the real checker.
 *
 * `traces` maps a unit id to a body, or to `null` for "this unit never wrote anything". The
 * manifest's `launchMs` defaults to one second in the PAST, so a file written by this helper is
 * legitimately post-launch — the freshness boundary is exercised explicitly by its own case.
 */
function check({ units, traces = {}, launchMs, manifest: override, raw }) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-receipts-')));
  try {
    const resolved = (units || []).map((u) => ({
      ...u,
      tracePath: u.tracePath === undefined ? path.join(dir, u.workUnitId + '.md') : u.tracePath,
    }));
    for (const unit of resolved) {
      const body = traces[unit.workUnitId];
      if (body === undefined || body === null) continue;
      fs.writeFileSync(unit.tracePath, body);
    }
    const file = path.join(dir, 'receipts.json');
    if (raw !== undefined) fs.writeFileSync(file, raw);
    else {
      const m = override || { runId: 'r1', launchMs: launchMs ?? Date.now() - 1000, units: resolved };
      fs.writeFileSync(file, JSON.stringify(m));
    }
    const r = spawnSync(process.execPath, [CHECK, file], { encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), dir };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const DONE = 'Implemented the parser and its two tests.\nStatus: completed';
const FAILED = 'Could not build: the fixture is missing.\nStatus: failed';

describe('the swarm-receipt checker answers three questions, and never confuses two of them', () => {
  test('P1 - every unit delivered a terminal completed receipt: exit 0', () => {
    const r = check({
      units: [{ workUnitId: 'api' }, { workUnitId: 'docs' }],
      traces: { api: DONE, docs: DONE },
    });
    assert.equal(r.code, 0, 'two good receipts must pass: ' + r.out);
    assert.match(r.out, /все 2 квитанций/, r.out);
    assert.match(r.out, /ДОСТАВЛЕНА, а не что она верна/,
      'the receipt proves delivery, never correctness — the limit must be stated');
  });

  test('P2 - a missing trace from a worker with no liveness claim: exit 1, unit named', () => {
    const r = check({
      units: [{ workUnitId: 'api' }, { workUnitId: 'docs' }],
      traces: { api: DONE },
    });
    assert.equal(r.code, 1, 'a missing receipt must refuse aggregation: ' + r.out);
    assert.match(r.out, /docs \[undelivered\/missing\]/, r.out);
    assert.match(r.out, /ЗАПРЕЩЕНЫ/, 'the refusal must be stated, not implied: ' + r.out);
  });

  test('P3 - a live PID with no trace is exit 2, a dead PID with no trace is exit 1', () => {
    // The asymmetry is the whole rule: liveness may only EXTEND waiting; it can never deliver.
    const live = check({ units: [{ workUnitId: 'api', pid: process.pid }] });
    assert.equal(live.code, 2, 'a live worker is "not yet", never "clean": ' + live.out);
    assert.match(live.out, /positive-liveness-only/, live.out);

    // A pid that is certainly gone: spawn a child, wait for it, then reuse its pid.
    const gone = spawnSync(process.execPath, ['-e', 'process.exit(0)']);
    const dead = check({ units: [{ workUnitId: 'api', pid: gone.pid }] });
    assert.equal(dead.code, 1, 'a dead worker with no trace is a delivered failure: ' + dead.out);
    assert.match(dead.out, /dead-worker/, dead.out);
  });

  test('P4 - empty, whitespace-only, and marker-only bodies are all undelivered', () => {
    for (const [label, body, reason] of [
      ['empty', '', 'empty'],
      ['whitespace', '   \n\t\n', 'empty'],
      ['marker with no work above it', 'Status: completed', 'empty-payload'],
    ]) {
      const r = check({ units: [{ workUnitId: 'api' }], traces: { api: body } });
      assert.equal(r.code, 1, label + ' must not pass: ' + r.out);
      assert.match(r.out, new RegExp(reason), label + ': ' + r.out);
    }
  });

  test('P5 - a body without the terminal line is PARTIAL, not success', () => {
    const r = check({
      units: [{ workUnitId: 'api' }],
      traces: { api: 'I am half way through writing this file.' },
    });
    assert.equal(r.code, 1, 'a partial write must not read as delivery: ' + r.out);
    assert.match(r.out, /non-terminal/, r.out);
  });

  test('P6 - a delivered Status: failed blocks the aggregate exactly like a missing one', () => {
    const r = check({ units: [{ workUnitId: 'api' }], traces: { api: FAILED } });
    assert.equal(r.code, 1, 'a delivered failure is still a refusal: ' + r.out);
    assert.match(r.out, /delivered-failure/, r.out);
  });

  test('P7 - a file that predates the launch is STALE, however good it looks', () => {
    // The single case a naive checker gets wrong: last run's trace, still on disk, fully terminal.
    const r = check({
      units: [{ workUnitId: 'api' }],
      traces: { api: DONE },
      launchMs: Date.now() + 60_000,   // launch is in the future relative to the file
    });
    assert.equal(r.code, 1, 'a pre-launch file is not this run\'s evidence: ' + r.out);
    assert.match(r.out, /stale/, r.out);
  });

  test('P8 - a symlink is not a regular file, even when its target is perfect', () => {
    const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-link-')));
    try {
      const real = path.join(dir, 'real.md');
      const link = path.join(dir, 'api.md');
      fs.writeFileSync(real, DONE);
      fs.symlinkSync(real, link);
      const file = path.join(dir, 'receipts.json');
      fs.writeFileSync(file, JSON.stringify({
        runId: 'r1', launchMs: Date.now() - 1000,
        units: [{ workUnitId: 'api', tracePath: link }],
      }));
      const r = spawnSync(process.execPath, [CHECK, file], { encoding: 'utf8' });
      assert.equal(r.status, 1, 'a symlinked trace must be refused: ' + r.stdout);
      assert.match(r.stdout, /not-regular/, r.stdout);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test('P9 - a malformed ASSIGNMENT is exit 2, because the dispatch was wrong, not the delivery', () => {
    const cases = [
      [{ units: [{ workUnitId: 'api', tracePath: 'relative/path.md' }] }, /assignment/,
        'a relative TRACE_PATH cannot be verified'],
      [{ units: [{ workUnitId: 'api' }, { workUnitId: 'api' }] }, /WORK_UNIT_ID повторяется/,
        'one id for two units would let one receipt clear both'],
      [{ manifest: { launchMs: 1, units: [] } }, /ноль рабочих единиц/,
        'an empty swarm has nothing to prove'],
      [{ manifest: { units: [{ workUnitId: 'a', tracePath: '/tmp/a.md' }] } }, /launchMs/,
        'without a launch instant, freshness is unknowable'],
      [{ raw: 'not json at all' }, /не разбирается как JSON/, 'a broken manifest is an unknown'],
      [{ raw: '[1,2,3]' }, /не является объектом/, 'an array is not a manifest'],
    ];
    for (const [input, pattern, why] of cases) {
      const r = check(input);
      assert.equal(r.code, 2, why + ' — got ' + r.code + ': ' + r.out);
      assert.match(r.out, /проверка НЕ выполнена/, why + ': ' + r.out);
      assert.match(r.out, pattern, why + ': ' + r.out);
    }
  });

  test('P9b - two units sharing one TRACE_PATH is exit 2, not a lucky pass', () => {
    // The second writer overwrites the first and BOTH report success — the silent lost update.
    const r = check({
      units: [{ workUnitId: 'a', tracePath: '/tmp/shared-trace.md' },
        { workUnitId: 'b', tracePath: '/tmp/shared-trace.md' }],
    });
    assert.equal(r.code, 2, 'a shared path is a malformed dispatch: ' + r.out);
    assert.match(r.out, /TRACE_PATH повторяется/, r.out);
  });

  test('P10 - a proven violation OUTRANKS an unresolved unit', () => {
    // One unit is definitively undelivered while another is still live. Exit 1 is the actionable
    // truth: aggregation is already forbidden, and saying "could not check" would be softer than
    // the facts allow.
    const r = check({
      units: [{ workUnitId: 'dead' }, { workUnitId: 'busy', pid: process.pid }],
      traces: {},
    });
    assert.equal(r.code, 1, 'a proven miss must not be downgraded to inconclusive: ' + r.out);
    assert.match(r.out, /dead \[undelivered\/missing\]/, r.out);
    assert.match(r.out, /busy \[waiting\/positive-liveness-only\]/,
      'the unresolved unit must still be NAMED, not swallowed: ' + r.out);
  });

  test('P11 - no manifest argument, and a manifest that does not exist, are both exit 2', () => {
    const bare = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
    assert.equal(bare.status, 2, 'no argument is not a clean bill: ' + bare.stdout);
    assert.match(bare.stdout, /не передан путь/, bare.stdout);

    const absent = spawnSync(process.execPath, [CHECK, '/nonexistent/receipts.json'],
      { encoding: 'utf8' });
    assert.equal(absent.status, 2, 'an unreadable manifest is an unknown: ' + absent.stdout);
    assert.match(absent.stdout, /не читается манифест/, absent.stdout);
  });

  test('P12 - it is a hooks component wired to NO event, and the three counters agree', () => {
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-swarm-receipts'],
      'it must be registered, or init/doctor/verify will not know it');
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-swarm-receipts'),
      'it must not be wired to an event: this package\'s hooks are non-blocking by contract, so a '
      + 'hook could only print — it could never refuse anything');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(m, 'statusline must declare hooksExpected');
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
    assert.equal(Number(m[1]), fs.readdirSync(path.join(TPL, 'hooks')).filter((f) => f.endsWith('.cjs')).length,
      'the shipped hook FILES must match the declared count — the counter drifted twice before');
  });

  test('P13 - MUTATION: turning the third exit code into a pass is caught', () => {
    // The registered mutation in test/mutation-registry.json flips cannotCheck's exit(2) to exit(0).
    // Assert here that at least one real input DEPENDS on that distinction, so the mutant has a
    // killer: without this, the registry entry would name a property nothing proves.
    const source = fs.readFileSync(CHECK, 'utf-8');
    assert.match(source, /process\.exit\(2\);/, 'cannotCheck must exit 2');
    const live = check({ units: [{ workUnitId: 'api', pid: process.pid }] });
    assert.equal(live.code, 2, 'the live-worker case is the killer input for that mutant');
  });
});
