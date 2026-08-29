'use strict';

// The package shipped a rule saying a database must not face the internet, and the rule said of
// itself — correctly — that it was not a check. This is the check.
//
// It is a REWRITE, not a transcription. MEASURED: the bash original it replaces never looked at
// `network_mode: host` (`grep network_mode check-port-conflicts.sh` → nothing), while
// rules/docker-ports.md forbids it explicitly. A faithful copy would have shipped a check unable to
// enforce the invariant it is named after.
//
// The load-bearing property is the THIRD exit code. A check that answers "clean" when it could not
// read the config is worse than no check: it turns an unknown into a reassurance. So an absent
// compose, a missing docker and an unparseable config all exit 2, and P6/P7/P8 assert exactly that.
//
// These are BEHAVIOUR tests: they run the real utility over real compose files with real docker.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-ports.cjs');

const DOCKER = spawnSync('docker', ['--version'], { encoding: 'utf8' }).status === 0;

/** Write a compose file into a throwaway directory and run the real check over it. */
function check(compose, opts) {
  const o = opts || {};
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ports-')));
  try {
    if (compose !== null) fs.writeFileSync(path.join(dir, 'docker-compose.yml'), compose);
    const env = Object.assign({}, process.env);
    if (o.noDocker) env.PATH = dir;            // an empty PATH: docker cannot be found
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8', env });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

const storagePublished = `services:
  db:
    image: postgres:16
    ports: ["5432:5432"]
`;

describe('the storage-port rule finally has a check that can fail', () => {
  test('P1 — it ships as a hooks-directory component, not a new component kind', () => {
    // The earlier decision to defer this assumed a new `scripts/` directory and five new consumers.
    // MEASURED: hooks/ already carries a non-event utility (state-update.cjs), so an existing kind
    // and an existing counter carry this too.
    assert.ok(fs.existsSync(CHECK), 'the check must ship under templates/.claude/hooks/');
    const { COMPONENTS } = require(path.join(PKG, 'src', 'utils.js'));
    assert.ok(COMPONENTS.hooks.items['check-ports'],
      'it must be registered as a hooks component, or init/doctor/verify will not know it');
    const statusline = fs.readFileSync(path.join(TPL, 'hooks', 'statusline.cjs'), 'utf-8');
    const m = statusline.match(/hooksExpected:\s*(\d+)/);
    assert.ok(m, 'statusline must declare hooksExpected');
    assert.equal(Number(m[1]), Object.keys(COMPONENTS.hooks.items).length,
      'the status line would report a phantom missing hook: ' + m[1]);
  });

  test('P2 — it is NOT registered as an event hook', () => {
    // Registering it would run `docker compose config` on every session stop, on every project,
    // including the ones with no compose at all. It is invoked deliberately.
    const settings = fs.readFileSync(path.join(TPL, 'settings.json'), 'utf-8');
    assert.ok(!settings.includes('check-ports'),
      'check-ports must not be wired to an event — it is a utility, like state-update.cjs');
  });

  test('P3 — a loopback bind PASSES: the exception is part of the rule', { skip: !DOCKER }, () => {
    for (const bind of ['127.0.0.1:55432:5432', '[::1]:55432:5432']) {
      const r = check('services:\n  db:\n    image: postgres:16\n    ports: ["' + bind + '"]\n');
      assert.equal(r.code, 0,
        bind + ' is legitimate — a check without the exception forbids the test setup the same '
        + 'pipeline prescribes: ' + r.out);
    }
  });

  test('P4 — every forbidden form FAILS, including the one the original missed',
    { skip: !DOCKER }, () => {
      const cases = [
        ['ports: ["5432:5432"]', 'no address at all binds every interface'],
        ['ports: ["0.0.0.0:5432:5432"]', 'all interfaces, explicitly'],
        ['ports: ["203.0.113.7:5432:5432"]', 'ONE public address — not "all interfaces", equally reachable'],
        ['network_mode: host', 'no ports: entry at all, and the container listens on the host'],
      ];
      for (const [line, why] of cases) {
        const r = check('services:\n  db:\n    image: postgres:16\n    ' + line + '\n');
        assert.equal(r.code, 1, 'must be a violation (' + why + '): ' + r.out);
        assert.match(r.out, /Правило №0/, 'and must name the rule it enforces: ' + r.out);
        assert.match(r.out, /db/, 'and the service: ' + r.out);
      }
    });

  test('P5 — an app published beside a reverse-proxy FAILS', { skip: !DOCKER }, () => {
    const r = check('services:\n  proxy:\n    image: caddy:2\n    ports: ["80:80"]\n'
      + '  app:\n    image: node:22\n    ports: ["3000:3000"]\n');
    assert.equal(r.code, 1, 'the proxy is the only door: ' + r.out);
    assert.match(r.out, /app/, 'the offending service must be named, not the proxy: ' + r.out);
  });

  test('P6 — an unreadable config exits 2 and SAYS the check did not run', { skip: !DOCKER }, () => {
    // The whole point of the third exit code. "Could not look" is not "nothing found".
    const r = check('services:\n  db:\n    image: postgres:16\n'
      + '    ports: ["${UNSET_VAR:?required}:5432"]\n');
    assert.equal(r.code, 2, 'an unreadable config must not read as clean: ' + r.out);
    assert.match(r.out, /проверка НЕ выполнена/, 'and must say so in words: ' + r.out);
  });

  test('P7 — no compose file exits 2', () => {
    const r = check(null);
    assert.equal(r.code, 2, 'nothing to check is not the same as nothing wrong: ' + r.out);
    assert.match(r.out, /проверка НЕ выполнена/);
  });

  test('P8 — docker unavailable exits 2', () => {
    // Driven by an empty PATH rather than by uninstalling docker: the property is the code path,
    // and a test that needs the machine reconfigured is a test nobody runs.
    const r = check(storagePublished, { noDocker: true });
    assert.equal(r.code, 2, 'without docker the question cannot be answered: ' + r.out);
    assert.match(r.out, /docker недоступен/, 'and the reason must be named: ' + r.out);
  });

  test('P10 — one matrix, all three verdicts: a constant check cannot pass this',
    { skip: !DOCKER }, () => {
      // Cross-family QE: every earlier case asserted ONE direction, so an always-clean binary passed
      // P3 and P9, an always-failing one passed P4 and P5, and a completely non-functional one still
      // passed P1 and P2. A single run of the SAME executable must produce all three codes.
      const matrix = [
        [0, 'services:\n  db:\n    image: postgres:16\n'],
        [1, 'services:\n  db:\n    image: postgres:16\n    ports: ["5432:5432"]\n'],
        [2, null],
      ];
      const seen = matrix.map(([, compose]) => check(compose).code);
      assert.deepEqual(seen, [0, 1, 2],
        'the same binary must answer clean / violation / could-not-check: ' + JSON.stringify(seen));
    });

  test('P11 — the counter-examples the reviewer supplied', { skip: !DOCKER }, () => {
    // Each of these was a real defect in the first version, and each is named by the input that
    // produced it rather than by the rule it broke.
    const cases = [
      [0, 'services:\n  db:\n    image: postgres:16\n    command:\n      - postgres\n'
        + '      - -c\n      - "log_line_prefix=published: 6543"\n',
        'a sequence item under command: is not a published port'],
      [0, 'services:\n  ui:\n    image: rediscommander/redis-commander:latest\n'
        + '    ports: ["8081:8081"]\n',
        'a redis WEB UI is not storage — substring matching said it was'],
      [1, 'services:\n  db:\n    image: mcr.microsoft.com/mssql/server:2022-latest\n'
        + '    ports: ["1433:1433"]\n',
        'mssql on 1433 was missed by both the name list and the port set'],
      [1, 'services:\n  db:\n    image: postgres:16\n    ports: ["[::]:5432:5432"]\n',
        'the IPv6 wildcard is in the rule\'s forbidden table and was untested'],
      [1, 'services:\n  db:\n    image: myco/custom-store:1\n    ports: ["5432:5432"]\n',
        'an unrecognised engine on a well-known port is still storage'],
    ];
    for (const [expected, compose, why] of cases) {
      const r = check(compose);
      assert.equal(r.code, expected, why + ' — got ' + r.code + ': ' + r.out);
    }
  });

  test('P12 — several services, and the right one is named', { skip: !DOCKER }, () => {
    // Fields must not leak between services: the offender has to be identified, not just counted.
    const r = check('services:\n  cache:\n    image: redis:7\n    ports: ["127.0.0.1:6379:6379"]\n'
      + '  db:\n    image: postgres:16\n    ports: ["5432:5432"]\n'
      + '  web:\n    image: node:22\n    ports: ["3000:3000"]\n');
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /db/, 'the offender must be named: ' + r.out);
    assert.ok(!/cache/.test(r.out),
      'the loopback-bound cache is legal and must not be reported: ' + r.out);
    assert.ok(!/web/.test(r.out),
      'a non-storage service with no proxy present is not this rule\'s business: ' + r.out);
  });

  test('P13 — every argument shape resolves in one frame', { skip: !DOCKER }, () => {
    // The defect: `-f` stayed RELATIVE while the same spawnSync call overrode docker's cwd to the
    // directory that relative path already named, so docker re-applied the directory component.
    // MEASURED before the fix: `check-ports.cjs projects/01` from the parent reported
    // "open /tmp/X/projects/01/projects/01/docker-compose.yml".
    //
    // PR-019 diagnosed a project-root join. There is no such join in the file — proven in pure shell:
    // the SAME `-f projects/01/docker-compose.yml` succeeds from /tmp/X and doubles from
    // /tmp/X/projects/01. The cwd override IS the mechanism.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-frame-')));
    try {
      const proj = path.join(root, 'projects', '01');
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, 'docker-compose.yml'),
        'services:\n  db:\n    image: postgres:16\n');
      // Every shape in ONE run: a matrix asserted from one side only cannot be told from a constant.
      const shapes = [
        ['projects/01', root, 'a bare relative directory — the shape that was broken'],
        ['./projects/01', root, 'the ./-prefixed form, which path.join normalises identically'],
        ['projects/01/docker-compose.yml', root, 'a relative path to the file itself'],
        ['.', proj, 'the documented invocation — worked before only because it is idempotent'],
        [null, proj, 'no argument at all'],
        ['../01', proj, 'a sibling-relative path'],
        [proj, root, 'absolute, from an unrelated cwd'],
        [proj, proj, 'absolute, from inside'],
      ];
      for (const [arg, cwd, why] of shapes) {
        const argv = arg === null ? [CHECK] : [CHECK, arg];
        const r = spawnSync(process.execPath, argv, { encoding: 'utf8', cwd });
        assert.equal(r.status, 0,
          'shape must resolve (' + why + '): arg=' + JSON.stringify(arg) + ' cwd=' + cwd
          + ' -> exit ' + r.status + ': ' + (r.stdout || '') + (r.stderr || ''));
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P14 — run from a PARENT cwd with a relative argument', { skip: !DOCKER }, () => {
    // The blind spot that let this ship green. Every other case here builds its fixture with
    // realpathSync(mkdtempSync(...)) and passes it whole — ALWAYS ABSOLUTE — so all 12 tests passed
    // against the live defect. A regression test that cannot reproduce the bug it guards is not a
    // guard. This case is the one that could.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-parent-')));
    try {
      const proj = path.join(root, 'projects', '01');
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, 'docker-compose.yml'),
        'services:\n  db:\n    image: postgres:16\n    ports: ["5432:5432"]\n');
      const r = spawnSync(process.execPath, [CHECK, 'projects/01'], { encoding: 'utf8', cwd: root });
      // A real violation must be REPORTED, not lost behind a path error.
      assert.equal(r.status, 1, 'expected the published-storage violation: ' + r.stdout + r.stderr);
      assert.match(r.stdout, /Правило №0/, r.stdout);
      assert.ok(!/projects\/01\/projects\/01/.test(r.stdout + r.stderr),
        'the doubled path must be gone: ' + r.stdout + r.stderr);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P15 — a required variable is reported as itself, not masked', { skip: !DOCKER }, () => {
    // The defect fired BEFORE docker parsed the file, so a genuine config error came back as
    // "no such file". Second harm, and the one a user would waste the most time on.
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-mask-')));
    try {
      const proj = path.join(root, 'projects', '04');
      fs.mkdirSync(proj, { recursive: true });
      fs.writeFileSync(path.join(proj, 'docker-compose.yml'),
        'services:\n  db:\n    image: postgres:${PGTAG:?PGTAG must be set}\n');
      const r = spawnSync(process.execPath, [CHECK, 'projects/04'], { encoding: 'utf8', cwd: root });
      assert.equal(r.status, 2, 'an unreadable config is still exit 2: ' + r.stdout);
      assert.match(r.stdout, /PGTAG/, 'the REAL cause must reach the user: ' + r.stdout);
      assert.ok(!/no such file/i.test(r.stdout),
        'the path error must not stand in for the config error: ' + r.stdout);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P16 — the spawn overrides no cwd, and the hint neither guesses nor refutes itself', () => {
    // Structural, so the removed line cannot creep back. MEASURED on Compose v5.1.1: project name,
    // relative build contexts, .env discovery and env_file are ALL derived from the first -f file's
    // directory — a .env in the process cwd was not even used as a fallback. The override's only
    // demonstrated effect in this file's history is the defect.
    const src = fs.readFileSync(CHECK, 'utf-8');
    const at = src.indexOf('spawnSync(');
    const spawnCall = src.slice(at, at + 300);
    assert.ok(!/cwd:/.test(spawnCall),
      'the cwd override must be GONE, not neutralised — a provably-useless line still encodes the '
      + 'false premise that regrows the class: ' + spawnCall);
    // The guessed cause named an UNREACHABLE case: a plain unset ${VAR} makes compose exit 0.
    //
    // Asserted on CODE, not on the file: the fix's own comment QUOTES the removed phrase to explain
    // why it went, and a whole-file `includes` cannot tell a mention from a use. That is the same
    // trap this repo has hit repeatedly, and it caught this test on its first run.
    const code = src.split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    assert.ok(!code.includes('обычно это незаданная переменная'),
      'the hint must not name a cause that cannot produce this exit');
    assert.match(code, /повторить ровно то, что делали мы/,
      'and the cure must be presented as a reproduction of OUR invocation');
    assert.match(src, /path\.resolve\(process\.cwd\(\)/,
      'the argument must be absolutised once, at the boundary');
  });
  test('P9 — a clean compose exits 0', { skip: !DOCKER }, () => {
    const r = check('services:\n  db:\n    image: postgres:16\n'
      + '  web:\n    image: node:22\n    ports: ["3000:3000"]\n');
    assert.equal(r.code, 0, 'a storage service with no publication is exactly right: ' + r.out);
  });
});
