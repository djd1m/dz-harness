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
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG, 'templates', '.claude');
const CHECK = path.join(TPL, 'hooks', 'check-ports.cjs');

const dockerVersion = spawnSync('docker', ['--version'], { encoding: 'utf8' });
const composeVersion = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' });
const dockerInfo = spawnSync('docker', ['info'], { encoding: 'utf8' });
const DOCKER = !dockerVersion.error && dockerVersion.status === 0;
const COMPOSE = !composeVersion.error && composeVersion.status === 0;
const DOCKER_DAEMON = !dockerInfo.error && dockerInfo.status === 0;

/** Write a compose file into a throwaway directory and run the real check over it. */
function check(compose, opts) {
  const o = opts || {};
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-ports-')));
  try {
    if (compose !== null) fs.writeFileSync(path.join(dir, 'docker-compose.yml'), compose);
    const env = Object.assign({}, process.env, o.env || {});
    if (o.noDocker) env.PATH = dir;            // an empty PATH: docker cannot be found
    const r = spawnSync(process.execPath, [CHECK, dir], { encoding: 'utf8', env });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** Run the delivered checker with stdout/stderr kept separate. */
function runCheck(args, opts) {
  const o = opts || {};
  const env = Object.assign({}, process.env, o.env || {});
  return spawnSync(process.execPath, [CHECK].concat(args || []), {
    cwd: o.cwd,
    encoding: 'utf8',
    env,
    timeout: o.timeout || 10000,
  });
}

/** A recording Docker boundary for deterministic inventory/inspect/exec failure cases. */
function fakeDockerCheck(scenario, args, opts) {
  const o = opts || {};
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-fake-docker-')));
  const scenarioFile = path.join(dir, 'scenario.json');
  const historyFile = path.join(dir, 'history.jsonl');
  const project = path.join(dir, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'docker-compose.yml'), 'services: {}\n');
  fs.writeFileSync(scenarioFile, JSON.stringify(scenario));
  const fake = path.join(dir, 'docker');
  fs.writeFileSync(fake, `#!${process.execPath}
'use strict';
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_DOCKER_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_DOCKER_HISTORY, JSON.stringify(args) + '\\n');
const op = args[0];
if (scenario.hang === op) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000000);
if (op === 'compose' && scenario.delegateCompose) {
  const result = spawnSync(process.env.REAL_DOCKER, args, { encoding: 'utf8' });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status === null ? 2 : result.status);
}
const configured = scenario[op];
if (configured && !Array.isArray(configured) && typeof configured === 'object'
    && Object.prototype.hasOwnProperty.call(configured, 'status')) {
  process.stdout.write(configured.stdout || '');
  process.stderr.write(configured.stderr || '');
  process.exit(configured.status);
}
if (op === 'ps') {
  for (const row of scenario.ps || []) process.stdout.write(
    (typeof row === 'string' ? row : JSON.stringify(row)) + '\\n');
  process.exit(0);
}
if (op === 'inspect') {
  process.stdout.write(JSON.stringify(scenario.inspect || []));
  process.exit(0);
}
if (op === 'exec') {
  const answer = (scenario.exec || {})[args[1]] || { status: 2, stderr: 'unknown container' };
  process.stdout.write(answer.stdout || '');
  process.stderr.write(answer.stderr || '');
  process.exit(answer.status);
}
if (op === 'compose') {
  process.stdout.write(scenario.compose || '');
  process.exit(0);
}
process.stderr.write('unexpected fake docker operation');
process.exit(2);
`);
  fs.chmodSync(fake, 0o755);
  try {
    const env = Object.assign({}, process.env, o.env || {}, {
      PATH: dir,
      FAKE_DOCKER_SCENARIO: scenarioFile,
      FAKE_DOCKER_HISTORY: historyFile,
      REAL_DOCKER: spawnSync('which', ['docker'], { encoding: 'utf8' }).stdout.trim(),
    });
    const actualArgs = (args || []).map((arg) => arg === '$PROJECT' ? project : arg);
    const result = runCheck(actualArgs, { env, timeout: o.timeout || 10000 });
    const history = fs.existsSync(historyFile)
      ? fs.readFileSync(historyFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
      : [];
    return { result, history };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const inspectRecord = (id, image, options) => {
  const o = options || {};
  return {
    Id: id,
    Name: '/' + (o.name || id),
    Config: { Image: image, Cmd: o.cmd || [], Env: o.env || [], Labels: o.labels || {} },
    HostConfig: { NetworkMode: o.networkMode || 'bridge' },
    NetworkSettings: { Ports: o.ports || {} },
    Mounts: o.mounts || [],
  };
};

function removeContainer(name) {
  spawnSync('docker', ['rm', '-f', name], { encoding: 'utf8' });
}

function waitForContainer(name) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const state = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], {
      encoding: 'utf8',
    });
    if (state.status === 0 && state.stdout.trim() === 'true') return;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  assert.fail('container did not reach running state: ' + name);
}

function preflightHostPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => reject(new Error(
      'live fixture host port ' + port + ' is not free; proof cannot run: ' + error.message)));
    server.listen({ host: '0.0.0.0', port, exclusive: true }, () => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });
}

function isolatedDockerOrSkip(t) {
  const running = spawnSync('docker', ['ps', '-q'], { encoding: 'utf8' });
  assert.equal(running.error, undefined, 'isolated Docker inventory failed: ' + running.error);
  assert.equal(running.status, 0, 'isolated Docker inventory failed: ' + running.stderr);
  if (running.stdout.trim() !== '') {
    // Ambient containers are not a defect of this package, but they DO change what
    // `--machine` scans, so the live discrimination proof cannot be trusted here.
    // A shared dev host therefore SKIPS (loudly, like the no-daemon case above);
    // an isolated CI context sets DZ_REQUIRE_LIVE_PORTS=1, where skipping is forbidden
    // and this becomes the hard failure it must be for the gate-tracked proof.
    if (process.env.DZ_REQUIRE_LIVE_PORTS === '1') {
      assert.fail('live proof requires an isolated Docker context; ambient containers make the '
        + 'result non-proving, and DZ_REQUIRE_LIVE_PORTS=1 forbids skipping');
    }
    t.skip('ambient containers present — live proof not provable on a shared host '
      + '(DZ_REQUIRE_LIVE_PORTS=1 in an isolated context forces it)');
    return false;
  }
  return true;
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

  test('E2 — Class A and Class B exposure warnings stay mechanically distinct',
    { skip: !DOCKER }, () => {
      const classA = ['postgres', 'mysql', 'mariadb', 'mongo'];
      const classB = ['redis', 'valkey', 'keydb', 'memcached'];
      const exposure = (image) => {
        const result = check('services:\n  storage:\n    image: ' + image + ':latest\n'
          + '    ports: ["15432:5432"]\n');
        assert.equal(result.code, 1, image + ' must remain a publication violation: ' + result.out);
        const line = result.out.split('\n').find((row) => row.includes('• storage: порт')) || '';
        assert.match(line, /storage: порт 15432 → 5432/,
          image + ' warning must retain the observed service and binding: ' + result.out);
        assert.match(line, /Убрать ports:.*compose-сет/,
          image + ' warning must give the concrete replacement: ' + result.out);
        return line;
      };

      for (const image of classA) {
        const line = exposure(image);
        assert.match(line, /слабый или подобранный пароль/,
          image + ' must name the Class A password threat: ' + line);
        assert.match(line, /COPY .* TO PROGRAM/,
          image + ' must name the Class A server-capability consequence: ' + line);
        assert.doesNotMatch(line, /доступ без аутентификации/,
          image + ' must not receive the Class B mechanism: ' + line);
      }

      for (const image of classB) {
        const line = exposure(image);
        assert.match(line, /по умолчанию не требует пароля/,
          image + ' must name the Class B default: ' + line);
        assert.match(line, /доступ без аутентификации/,
          image + ' must name the Class B immediate consequence: ' + line);
        assert.doesNotMatch(line, /слабый или подобранный пароль|COPY .* TO PROGRAM/,
          image + ' must never receive the Class A mechanism: ' + line);
      }

      for (const [image, target] of [['elasticsearch:8', 9200], ['acme/custom-store:1', 5432]]) {
        const result = check('services:\n  storage:\n    image: ' + image + '\n'
          + '    ports: ["15432:' + target + '"]\n');
        assert.equal(result.code, 1, image + ' must remain recognized: ' + result.out);
        const line = result.out.split('\n').find((row) => row.includes('• storage: порт')) || '';
        assert.match(line, /хранилище опубликовано наружу/,
          image + ' must retain the neutral exposure warning: ' + result.out);
        assert.doesNotMatch(line,
          /слабый или подобранный пароль|COPY .* TO PROGRAM|по умолчанию не требует пароля|доступ без аутентификации/,
          image + ' must not receive an invented authentication class: ' + line);
      }
    });

  test('E2 — recognition literals, verdict codes and loopback exception remain frozen',
    { skip: !DOCKER }, () => {
      const source = fs.readFileSync(CHECK, 'utf8');
      const namesMatch = source.match(/const STORAGE_NAMES = \/\^\(([^)]+)\)\$\/i;/);
      const portsMatch = source.match(/const STORAGE_PORT = new Set\(\[([\s\S]*?)\]\);/);
      assert.ok(namesMatch, 'the existing STORAGE_NAMES literal must remain readable');
      assert.ok(portsMatch, 'the existing STORAGE_PORT literal must remain readable');
      assert.deepEqual(namesMatch[1].split('|'), [
        'postgres', 'postgresql', 'pgvector', 'mysql', 'mariadb', 'percona', 'mongo', 'mongodb',
        'redis', 'valkey', 'keydb', 'elasticsearch', 'opensearch', 'minio', 'rabbitmq',
        'memcached', 'clickhouse', 'cassandra', 'scylla', 'neo4j', 'influxdb', 'timescaledb',
        'mssql', 'sqlserver', 'couchdb', 'etcd', 'qdrant',
      ]);
      assert.deepEqual([...portsMatch[1].matchAll(/\d+/g)].map((match) => Number(match[0])), [
        5432, 3306, 27017, 6379, 9200, 9300, 5672, 11211, 9000, 8123, 1433, 9042, 7687,
        8086, 2379, 5984, 6333,
      ]);
      const proxiesMatch = source.match(/const PROXY_NAMES = \/\^\(([^)]+)\)\$\/i;/);
      assert.ok(proxiesMatch, 'the existing PROXY_NAMES literal must remain readable');
      assert.deepEqual(proxiesMatch[1].split('|'), [
        'caddy', 'nginx', 'traefik', 'haproxy', 'envoy', 'openresty',
      ]);

      const seen = [
        check('services:\n  db:\n    image: postgres:16\n').code,
        check(storagePublished).code,
        check(null).code,
      ];
      assert.deepEqual(seen, [0, 1, 2], 'clean / violation / not-performed codes must stay fixed');

      const portOnly = check('services:\n  db:\n    image: acme/custom-store:1\n'
        + '    ports: ["15432:5432"]\n');
      assert.equal(portOnly.code, 1, 'known storage ports must remain recognized: ' + portOnly.out);
      const lookalike = check('services:\n  ui:\n    image: rediscommander/redis-commander:latest\n'
        + '    ports: ["8081:8081"]\n');
      assert.equal(lookalike.code, 0, 'lookalike image names must remain rejected: ' + lookalike.out);
      for (const bind of ['127.0.0.1:55432:5432', '[::1]:55432:5432']) {
        const loopback = check('services:\n  db:\n    image: postgres:16\n'
          + '    ports: ["' + bind + '"]\n');
        assert.equal(loopback.code, 0, bind + ' must remain inside the loopback exception: '
          + loopback.out);
      }
    });

  test('E2 — the same publication shape emits different Class A and Class B text',
    { skip: !DOCKER }, () => {
      const warningFor = (image) => {
        const result = check('services:\n  storage:\n    image: ' + image + '\n'
          + '    ports: ["15432:5432"]\n');
        assert.equal(result.code, 1, result.out);
        return result.out.split('\n').find((row) => row.includes('• storage: порт')) || '';
      };
      const classA = warningFor('postgres:16');
      const classB = warningFor('redis:7');
      assert.notEqual(classA, classB,
        'postgres and redis must not collapse to one generic publication warning');
      assert.match(classA, /слабый или подобранный пароль/);
      assert.match(classB, /доступ без аутентификации/);
    });

  test('E2 — checker and docker-ports rule carry the same class mechanics and remedy',
    { skip: !DOCKER }, () => {
      const rule = fs.readFileSync(path.join(TPL, 'rules', 'docker-ports.md'), 'utf8');
      const warningFor = (image) => {
        const result = check('services:\n  storage:\n    image: ' + image + '\n'
          + '    ports: ["15432:5432"]\n');
        assert.equal(result.code, 1, result.out);
        return result.out.split('\n').find((row) => row.includes('• storage: порт')) || '';
      };
      const classA = warningFor('postgres:16');
      const classB = warningFor('redis:7');

      for (const text of [rule, classA]) {
        assert.match(text, /слабый или подобранный пароль/,
          'Class A must retain its password threat in rule and checker');
        assert.match(text, /COPY .* TO PROGRAM/,
          'Class A must retain the concrete server-capability consequence');
      }
      for (const text of [rule, classB]) {
        assert.match(text, /по умолчанию не требует пароля/,
          'Class B must retain its no-password default in rule and checker');
        assert.match(text, /доступ без аутентификации/,
          'Class B must retain its immediate consequence in rule and checker');
      }
      for (const text of [rule, classA, classB]) {
        assert.match(text, /[Уу]брать `?ports:`?.*compose-сет/s,
          'rule and checker must prescribe removing ports: and using the compose network');
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

  test('P18 — clean receipts name catalog or machine snapshot scope', () => {
    const catalog = fakeDockerCheck({ compose: 'services:\n  db:\n    image: postgres:16\n' },
      ['$PROJECT']);
    assert.equal(catalog.result.status, 0, catalog.result.stdout + catalog.result.stderr);
    assert.match(catalog.result.stdout, /каталог .*docker-compose\.yml/i,
      'catalog success must name the selected catalog file: ' + catalog.result.stdout);

    const machine = fakeDockerCheck({ ps: [] }, ['--machine']);
    assert.equal(machine.result.status, 0, machine.result.stdout + machine.result.stderr);
    assert.match(machine.result.stdout, /снимок.*Docker-контекст/i,
      'machine success must be a point-in-time current-context receipt');
    assert.ok(!/ни одно хранилище не публикует/.test(machine.result.stdout),
      'the former scope-free receipt is not a machine-wide claim');
  });

  test('P29 — qdrant exposure extends the recognized storage class', () => {
    const qdrant = fakeDockerCheck({ compose: 'services:\n  qdrant:\n'
      + '    image: qdrant/qdrant:latest\n'
      + '    ports:\n      - target: 6333\n        published: 6333\n' }, ['$PROJECT']);
    assert.equal(qdrant.result.status, 1,
      'qdrant/qdrant:latest on 6333 must not retain the old green receipt: '
      + qdrant.result.stdout + qdrant.result.stderr);
    assert.match(qdrant.result.stdout, /qdrant/);
    assert.match(qdrant.result.stdout, /6333/);
    assert.doesNotMatch(qdrant.result.stdout, /✅/);
  });

  test('P30 — openresty makes a directly published app a proxy bypass', () => {
    const bypass = fakeDockerCheck({ compose: 'services:\n  gateway:\n'
      + '    image: openresty/openresty:alpine\n'
      + '    ports:\n      - target: 80\n        published: 80\n'
      + '  app:\n    image: node:22\n'
      + '    ports:\n      - target: 3000\n        published: 3000\n' }, ['$PROJECT']);
    assert.equal(bypass.result.status, 1,
      'OpenResty must establish the reverse-proxy class before bypass analysis: '
      + bypass.result.stdout + bypass.result.stderr);
    assert.match(bypass.result.stdout, /app/);
    assert.match(bypass.result.stdout, /reverse-proxy.*gateway/i);
    assert.doesNotMatch(bypass.result.stdout, /✅/);
  });

  test('P31 — honest exit 0 receipt counts scope and names an unchecked published app', () => {
    const catalog = fakeDockerCheck({ compose: 'services:\n  db:\n    image: postgres:16\n'
      + '  web:\n    image: node:22\n'
      + '    ports:\n      - target: 3000\n        published: 3000\n' }, ['$PROJECT']);
    assert.equal(catalog.result.status, 0, catalog.result.stdout + catalog.result.stderr);
    assert.match(catalog.result.stdout,
      /из 2 сервисов распознано хранилищ 1, reverse-proxy 0/i);
    assert.match(catalog.result.stdout,
      /НЕ распознаны и не проверялись: web \(порт 3000 наружу\)/i);
    assert.doesNotMatch(catalog.result.stdout, /ни одно хранилище не публикует/i,
      'a roster-scoped check must not certify an absolute class claim');
  });

  test('P19 — catalog mode preserves P12 and never invokes machine or runtime Docker commands',
    { skip: !COMPOSE }, () => {
      const absent = check('services:\n  cache:\n    image: redis:7\n');
      assert.equal(absent.code, 1, 'positive absent-auth config evidence is a violation: ' + absent.out);
      assert.match(absent.out, /аутентификац/i, absent.out);

      const mounted = check('services:\n  cache:\n    image: redis:7\n'
        + '    volumes:\n      - "./redis.conf:/usr/local/etc/redis/redis.conf"\n');
      assert.equal(mounted.code, 2, 'a mounted config makes auth indeterminate: ' + mounted.out);
      assert.match(mounted.out, /проверка НЕ выполнена/, mounted.out);

      const dataOnly = check('services:\n  cache:\n    image: redis:7\n'
        + '    volumes:\n      - "redis-data:/data"\nvolumes:\n  redis-data:\n');
      assert.equal(dataOnly.code, 1,
        'an explicit data-only target does not hide auth config: ' + dataOnly.out);

      const customBuild = check('services:\n  cache:\n    image: redis:7\n    build: .\n');
      assert.equal(customBuild.code, 2, 'a custom build can embed unseen auth config: ' + customBuild.out);

      const secret = 'P19_SENTINEL_DO_NOT_PRINT';
      const authenticated = check('services:\n  cache:\n    image: redis:7\n'
        + '    command: redis-server --requirepass ${REDIS_PASSWORD:?}\n',
      { env: { REDIS_PASSWORD: secret } });
      assert.equal(authenticated.code, 0, authenticated.out);
      assert.ok(!(authenticated.out || '').includes(secret), 'config secrets must not reach output');

      const envAuthenticated = check('services:\n  cache:\n    image: redis:7\n'
        + '    environment:\n      REDIS_PASSWORD: ${REDIS_PASSWORD:?}\n',
      { env: { REDIS_PASSWORD: secret } });
      assert.equal(envAuthenticated.code, 0, envAuthenticated.out);
      assert.ok(!envAuthenticated.out.includes(secret), 'environment secrets must not reach output');

      for (const environment of [
        'REDIS_PASSWORD: ""', 'REDIS_PASSWORD: "   "', 'ALLOW_EMPTY_PASSWORD: "yes"',
        'REDIS_AUTH_ENABLED: "false"',
      ]) {
        const passwordless = check('services:\n  cache:\n    image: redis:7\n'
          + '    environment:\n      ' + environment + '\n');
        assert.equal(passwordless.code, 1,
          environment + ' is not positive password evidence: ' + passwordless.out);
      }

      const derived = check('services:\n  cache:\n    image: acme/redis:7\n');
      assert.equal(derived.code, 2, 'a derived image can embed unseen auth config: ' + derived.out);

      const emptyCommand = check('services:\n  cache:\n    image: redis:7\n'
        + '    command: redis-server --requirepass ""\n');
      assert.equal(emptyCommand.code, 1, 'an empty --requirepass is passwordless: ' + emptyCommand.out);
      const whitespaceCommand = check('services:\n  cache:\n    image: redis:7\n'
        + '    command: redis-server --requirepass "   "\n');
      assert.equal(whitespaceCommand.code, 1,
        'a whitespace-only --requirepass is passwordless: ' + whitespaceCommand.out);

      const official = check('services:\n  cache:\n    image: docker.io/library/redis:7\n');
      assert.equal(official.code, 1, 'the canonical official image is not an invented custom build');

      const memcached = check('services:\n  cache:\n    image: memcached:1.6\n');
      assert.equal(memcached.code, 1, 'Memcached shares the config evidence policy: ' + memcached.out);

      const loopback = check('services:\n  cache:\n    image: redis:7\n'
        + '    ports: ["127.0.0.1:6379:6379"]\n');
      assert.equal(loopback.code, 0, 'P12 remains the catalog exception: ' + loopback.out);
      assert.ok(!/cache/.test(loopback.out), 'the legal loopback cache must not be an offender');

      const recordedMatrix = [
        [1, 'services:\n  cache:\n    image: redis:7\n'],
        [2, 'services:\n  cache:\n    image: redis:7\n    volumes:\n      - type: bind\n        target: /etc/redis.conf\n'],
        [1, 'services:\n  cache:\n    image: redis:7\n    volumes:\n      - type: volume\n        target: /data\n'],
        [2, 'services:\n  cache:\n    image: redis:7\n    build:\n      context: /fixture\n'],
        [0, 'services:\n  cache:\n    image: redis:7\n    command:\n      - redis-server\n      - --requirepass\n      - secret\n'],
        [0, 'services:\n  cache:\n    image: redis:7\n    environment:\n      REDIS_PASSWORD: secret\n'],
        [1, 'services:\n  cache:\n    image: redis:7\n    environment:\n      REDIS_PASSWORD: ""\n'],
        [0, 'services:\n  cache:\n    image: redis:7\n    ports:\n      - target: 6379\n        published: 6379\n        host_ip: 127.0.0.1\n'],
        [1, 'services:\n  cache:\n    image: memcached:1.6\n'],
        [2, 'services:\n  cache:\n    image: acme/redis:7\n'],
        [1, 'services:\n  cache:\n    image: docker.io/library/redis:7\n'],
      ];
      for (const [expected, compose] of recordedMatrix) {
        const recorded = fakeDockerCheck({ compose }, ['$PROJECT']);
        assert.equal(recorded.result.status, expected, recorded.result.stdout + recorded.result.stderr);
        assert.deepEqual(recorded.history.map((entry) => entry[0]), ['compose'],
          'every catalog auth branch may call compose only: ' + JSON.stringify(recorded.history));
      }
    });

  test('P20 — partial machine observations reduce to exit 2 without hiding violations', () => {
    const exposedId = 'a'.repeat(64);
    const missingId = 'b'.repeat(64);
    const exposed = inspectRecord(exposedId, 'registry.example/team/postgres:16', {
      name: 'partial-exposed',
      ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '15432' }] },
      labels: { 'com.docker.compose.project': 'partial-project' },
    });
    const malformedInventory = fakeDockerCheck({
      ps: [{ ID: exposedId, Image: 'registry.example/team/postgres:16', Names: 'partial-exposed' },
        '{not-json'],
      inspect: [exposed],
    }, ['--machine']);
    assert.equal(malformedInventory.result.status, 2,
      malformedInventory.result.stdout + malformedInventory.result.stderr);
    assert.match(malformedInventory.result.stdout, /partial-project/,
      'the established sibling violation and its owner must remain visible');
    assert.match(malformedInventory.result.stderr, /проверка НЕ выполнена/);
    assert.ok(!/✅/.test(malformedInventory.result.stdout + malformedInventory.result.stderr));
    assert.deepEqual(malformedInventory.history[0],
      ['ps', '--no-trunc', '--format', '{{json .}}'],
      'inventory must remain structured JSON-lines rather than human port parsing');

    const partialInspect = fakeDockerCheck({
      ps: [
        { ID: exposedId, Image: 'postgres:16', Names: 'partial-exposed' },
        { ID: missingId, Image: 'postgres:16', Names: 'vanished' },
      ],
      inspect: [exposed],
    }, ['--machine']);
    assert.equal(partialInspect.result.status, 2,
      partialInspect.result.stdout + partialInspect.result.stderr);
    assert.match(partialInspect.result.stdout, /storage-exposure|экспозиц|наружу/i);
    assert.match(partialInspect.result.stderr, /inspect|проверка НЕ выполнена/i);

    const unknownOnly = fakeDockerCheck({ ps: ['not-json-at-all'] }, ['--machine']);
    assert.equal(unknownOnly.result.status, 2, unknownOnly.result.stdout + unknownOnly.result.stderr);
    assert.equal(unknownOnly.history.filter((entry) => entry[0] === 'inspect').length, 0,
      'there is no trustworthy ID to inspect');

    const malformedPorts = fakeDockerCheck({
      ps: [{ ID: missingId, Image: 'postgres:16', Names: 'bad-ports-shape' }],
      inspect: [inspectRecord(missingId, 'postgres:16', { ports: [] })],
    }, ['--machine']);
    assert.equal(malformedPorts.result.status, 2,
      'an array is not a valid Docker port map: '
      + malformedPorts.result.stdout + malformedPorts.result.stderr);

    const emptyBindings = fakeDockerCheck({
      ps: [{ ID: missingId, Image: 'postgres:16', Names: 'empty-bindings' }],
      inspect: [inspectRecord(missingId, 'postgres:16', {
        ports: { ['5432/tcp\u202e forged']: [] },
      })],
    }, ['--machine']);
    assert.equal(emptyBindings.result.status, 2,
      'an empty bindings array is malformed, not an unpublished clean state');
    assert.ok(!(emptyBindings.result.stdout + emptyBindings.result.stderr).includes('\u202e'),
      'malformed target diagnostics remove terminal-direction controls');

    const malformedAuth = inspectRecord(missingId, 'memcached:1.6', {
      ports: { '11211/tcp': [{ HostIp: '127.0.0.1', HostPort: '11211' }] },
    });
    malformedAuth.Config.Env = [{ MEMCACHED_PASSWORD: 'invented' }];
    const malformedMetadata = fakeDockerCheck({
      ps: [{ ID: missingId, Image: 'memcached:1.6', Names: 'bad-auth-shape' }],
      inspect: [malformedAuth],
    }, ['--machine']);
    assert.equal(malformedMetadata.result.status, 2,
      'malformed required auth metadata cannot become an invented verdict');
  });

  test('P17 — machine scope discriminates the live bind address',
    { skip: !DOCKER_DAEMON }, async (t) => {
      const suffix = process.pid + '-' + Date.now();
      const name = 'p-rep-e1-postgres-' + suffix;
      const owner = 'p-rep-e1-owner-' + suffix;
      if (!isolatedDockerOrSkip(t)) return;
      await preflightHostPort(15432);
      const base = ['run', '-d', '--name', name,
        '--label', 'com.docker.compose.project=' + owner,
        '--label', 'com.docker.compose.project.config_files=/fixture/docker-compose.yml',
        '-e', 'POSTGRES_PASSWORD=e1-live-fixture-password'];
      try {
        let started = spawnSync('docker', base.concat(
          ['-p', '127.0.0.1:15432:5432', 'postgres:16-alpine']), { encoding: 'utf8' });
        assert.equal(started.status, 0, 'loopback fixture failed to start: ' + started.stderr);
        waitForContainer(name);
        const loopback = runCheck(['--machine']);
        assert.equal(loopback.status, 0, loopback.stdout + loopback.stderr);
        assert.match(loopback.stdout, /снимок.*Docker-контекст/i);

        removeContainer(name);
        started = spawnSync('docker', base.concat(
          ['-p', '15432:5432', 'postgres:16-alpine']), { encoding: 'utf8' });
        assert.equal(started.status, 0, 'wildcard fixture failed to start: ' + started.stderr);
        waitForContainer(name);
        const wildcard = runCheck(['--machine']);
        assert.equal(wildcard.status, 1, wildcard.stdout + wildcard.stderr);
        assert.match(wildcard.stdout, new RegExp(owner));
        assert.match(wildcard.stdout, /15432/);
      } finally {
        removeContainer(name);
      }
    });

  test('P21 — runtime cache auth evidence is tri-state and secret-safe',
    { skip: !DOCKER_DAEMON }, async (t) => {
      const suffix = process.pid + '-' + Date.now();
      const name = 'p-rep-e1-redis-' + suffix;
      const owner = 'p-rep-e1-cache-' + suffix;
      const secret = 'P21_SENTINEL_' + suffix;
      if (!isolatedDockerOrSkip(t)) return;
      await preflightHostPort(16379);
      const base = ['run', '-d', '--name', name,
        '--label', 'com.docker.compose.project=' + owner,
        '-p', '127.0.0.1:16379:6379', 'redis:7-alpine'];
      try {
        let started = spawnSync('docker', base, { encoding: 'utf8' });
        assert.equal(started.status, 0, 'passwordless Redis failed to start: ' + started.stderr);
        waitForContainer(name);
        const unprotected = runCheck(['--machine']);
        assert.equal(unprotected.status, 1, unprotected.stdout + unprotected.stderr);
        assert.match(unprotected.stdout, /live-cache-no-auth|живой.*без аутентификац/i);

        removeContainer(name);
        started = spawnSync('docker', base.concat(['redis-server', '--requirepass', secret]),
          { encoding: 'utf8' });
        assert.equal(started.status, 0, 'protected Redis failed to start: ' + started.stderr);
        waitForContainer(name);
        const protectedRun = runCheck(['--machine']);
        assert.equal(protectedRun.status, 0, protectedRun.stdout + protectedRun.stderr);
        assert.ok(!(protectedRun.stdout + protectedRun.stderr).includes(secret),
          'the runtime password must never reach either stream');
      } finally {
        removeContainer(name);
      }
    });

  test('P21b — a failed runtime auth probe is indeterminate and secret-safe', () => {
    const id = 'f'.repeat(64);
    const secret = 'P21B_SENTINEL_DO_NOT_PRINT';
    const failedProbe = fakeDockerCheck({
      ps: [{ ID: id, Image: 'redis:7', Names: 'probe-failed' }],
      inspect: [inspectRecord(id, 'redis:7', {
        name: 'probe-failed',
        ports: { '6379/tcp': [{ HostIp: '127.0.0.1', HostPort: '6379' }] },
      })],
      exec: { [id]: { status: 1, stderr: secret } },
    }, ['--machine']);
    assert.equal(failedProbe.result.status, 2,
      failedProbe.result.stdout + failedProbe.result.stderr);
    assert.match(failedProbe.result.stderr, /проверка НЕ выполнена/);
    assert.ok(!(failedProbe.result.stdout + failedProbe.result.stderr).includes(secret),
      'probe errors must not relay secret-bearing stderr');

    const unpublished = fakeDockerCheck({
      ps: [{ ID: id, Image: 'redis:7', Names: 'private-redis' }],
      inspect: [inspectRecord(id, 'redis:7', { name: 'private-redis' })],
    }, ['--machine']);
    assert.equal(unpublished.result.status, 0,
      'a container with no live publication has no machine auth axis: '
      + unpublished.result.stdout + unpublished.result.stderr);
    assert.equal(unpublished.history.filter((entry) => entry[0] === 'exec').length, 0);

    const memId = '9'.repeat(64);
    const loopback = { '11211/tcp': [{ HostIp: '127.0.0.1', HostPort: '11211' }] };
    const memcachedCases = [
      [1, inspectRecord(memId, 'memcached:1.6', { ports: loopback })],
      [1, inspectRecord(memId, 'memcached:1.6', {
        ports: loopback, env: ['MEMCACHED_PASSWORD=', 'OTHER=x'],
      })],
      [0, inspectRecord(memId, 'memcached:1.6', { ports: loopback, cmd: ['memcached', '-S'] })],
      [2, inspectRecord(memId, 'memcached:1.6', {
        ports: loopback, mounts: [{ Destination: '/etc/sasl2' }],
      })],
    ];
    for (const [expected, detail] of memcachedCases) {
      const run = fakeDockerCheck({
        ps: [{ ID: memId, Image: 'memcached:1.6', Names: 'live-memcached' }], inspect: [detail],
      }, ['--machine']);
      assert.equal(run.result.status, expected, run.result.stdout + run.result.stderr);
      assert.equal(run.history.filter((entry) => entry[0] === 'exec').length, 0,
        'Memcached must never borrow the Redis runtime probe');
    }
  });

  test('P24 — live host networking is a machine exposure violation',
    { skip: !DOCKER_DAEMON }, (t) => {
      const suffix = process.pid + '-' + Date.now();
      const name = 'p-rep-e1-hostnet-' + suffix;
      const owner = 'p-rep-e1-hostnet-owner-' + suffix;
      if (!isolatedDockerOrSkip(t)) return;
      try {
        const started = spawnSync('docker', ['run', '-d', '--name', name, '--network', 'host',
          '--label', 'com.docker.compose.project=' + owner,
          '--entrypoint', 'sleep', 'postgres:16-alpine', '60'], { encoding: 'utf8' });
        assert.equal(started.status, 0, 'host-network fixture failed to start: ' + started.stderr);
        waitForContainer(name);
        const result = runCheck(['--machine']);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout, /host-network|network_mode: host/i);
        assert.match(result.stdout, new RegExp(owner));
      } finally {
        removeContainer(name);
      }
    });

  test('P22 — machine recognition and owner attribution share the catalog seam', () => {
    const storageId = 'c'.repeat(64);
    const unlabeledId = '8'.repeat(64);
    const emptyLabelId = '7'.repeat(64);
    const lookalikeId = 'd'.repeat(64);
    const scenario = {
      ps: [
        { ID: storageId, Image: 'registry.example:5000/team/postgres:16', Names: 'real-storage' },
        { ID: unlabeledId, Image: 'postgres:16', Names: 'unlabeled-storage' },
        { ID: emptyLabelId, Image: 'postgres:16', Names: 'empty-label-storage' },
        { ID: lookalikeId, Image: 'rediscommander/redis-commander:latest', Names: 'redis-ui' },
      ],
      inspect: [inspectRecord(storageId, 'registry.example:5000/team/postgres:16', {
        name: 'real-storage',
        ports: { '5432/tcp': [{ HostIp: '', HostPort: '15432' }] },
        labels: {
          'com.docker.compose.project': 'hostile\u202e✅ forged receipt',
          'com.docker.compose.project.config_files': '/tmp/compose.yml',
        },
      }), inspectRecord(unlabeledId, 'postgres:16', {
        name: 'unlabeled-storage',
        ports: { '5432/tcp': [{ HostIp: '0.0.0.0\u202e', HostPort: '25432' }] },
      }), inspectRecord(emptyLabelId, 'postgres:16', {
        name: 'empty-label-storage',
        ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '35432' }] },
        labels: { 'com.docker.compose.project': '' },
      })],
    };
    const run = fakeDockerCheck(scenario, ['--machine']);
    assert.equal(run.result.status, 1, run.result.stdout + run.result.stderr);
    assert.match(run.result.stdout, /real-storage/);
    assert.match(run.result.stdout, /unknown owner/i,
      'malformed ownership is diagnostic-only and must become unknown');
    assert.ok(!/forged receipt/.test(run.result.stdout + run.result.stderr),
      'control-bearing labels cannot smuggle terminal output');
    assert.ok(!(run.result.stdout + run.result.stderr).includes('\u202e'),
      'untrusted binding fields cannot retain bidi controls');
    assert.match(run.result.stdout, /unlabeled-storage/);
    assert.match(run.result.stdout, /empty-label-storage/);
    assert.ok((run.result.stdout.match(/unknown owner/gi) || []).length >= 3,
      'malformed, absent, and empty ownership all remain diagnostic-only');
    const inspectCall = run.history.find((entry) => entry[0] === 'inspect');
    assert.ok(inspectCall, JSON.stringify(run.history));
    assert.ok(inspectCall.includes(storageId), 'registry/path image is recognized');
    assert.ok(inspectCall.includes(unlabeledId) && inspectCall.includes(emptyLabelId));
    assert.ok(!inspectCall.includes(lookalikeId), 'redis-commander is not storage');

    const catalog = fakeDockerCheck({ compose: 'services:\n  db:\n'
      + '    image: registry.example:5000/team/postgres:16\n'
      + '    ports:\n      - target: 5432\n        published: 15432\n' }, ['$PROJECT']);
    assert.equal(catalog.result.status, 1, catalog.result.stdout + catalog.result.stderr);
    assert.deepEqual(catalog.history.map((entry) => entry[0]), ['compose'],
      'the same registry/path image is storage in catalog mode without machine probes');
  });

  test('P23 — machine subprocess timeout safeguard triggers on a hanging Docker command', () => {
    const started = Date.now();
    const run = fakeDockerCheck({ hang: 'ps' }, ['--machine'], { timeout: 8000 });
    const elapsed = Date.now() - started;
    assert.equal(run.result.status, 2, run.result.stdout + run.result.stderr);
    assert.ok(run.history.some((entry) => entry[0] === 'ps'),
      'the safeguard must fire on a real hanging subprocess');
    assert.ok(elapsed >= 500 && elapsed < 7000, 'timeout must trigger and remain bounded: ' + elapsed);
    assert.match(run.result.stderr, /проверка НЕ выполнена/);
    assert.ok(!/✅/.test(run.result.stdout + run.result.stderr));
  });

  test('P25 — machine verdict matrix observes 0, 1, and 2', () => {
    const id = 'e'.repeat(64);
    const cases = [
      fakeDockerCheck({ ps: [] }, ['--machine']).result,
      fakeDockerCheck({
        ps: [{ ID: id, Image: 'postgres:16', Names: 'matrix-exposed' }],
        inspect: [inspectRecord(id, 'postgres:16', {
          name: 'matrix-exposed',
          ports: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '15432' }] },
        })],
      }, ['--machine']).result,
      fakeDockerCheck({ ps: { status: 1, stderr: 'daemon unavailable' } }, ['--machine']).result,
    ];
    assert.deepEqual(cases.map((result) => result.status), [0, 1, 2],
      cases.map((result) => result.stdout + result.stderr).join('\n---\n'));
    assert.match(cases[2].stderr, /проверка НЕ выполнена/);
    assert.ok(!/✅/.test(cases[2].stdout + cases[2].stderr));
  });

  test('P25b — machine mode fails closed when the Docker executable is absent', () => {
    const emptyPath = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-no-docker-')));
    try {
      const result = runCheck(['--machine'], { env: { PATH: emptyPath } });
      assert.equal(result.status, 2, result.stdout + result.stderr);
      assert.match(result.stderr, /проверка НЕ выполнена/);
      assert.match(result.stderr, /docker недоступен/i);
      assert.ok(!/✅/.test(result.stdout + result.stderr));
    } finally { fs.rmSync(emptyPath, { recursive: true, force: true }); }
  });

  test('P25c — machine mode fails closed on an unbound Docker resource', { skip: !DOCKER }, () => {
    const result = runCheck(['--machine'], { env: {
      DOCKER_HOST: 'tcp://127.0.0.1:1', DOCKER_CONTEXT: '', DOCKER_TLS_VERIFY: '',
    } });
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /проверка НЕ выполнена/);
    assert.match(result.stderr, /docker ps/i);
    assert.ok(!/✅/.test(result.stdout + result.stderr));
  });

  test('P27 — machine argv is unambiguous', () => {
    for (const args of [['--machine', 'extra'], ['--machines'], ['--unknown']]) {
      const run = fakeDockerCheck({ ps: [] }, args);
      assert.equal(run.result.status, 2, JSON.stringify(args) + ': '
        + run.result.stdout + run.result.stderr);
      assert.match(run.result.stderr, /проверка НЕ выполнена/i);
      assert.match(run.result.stderr, /usage|использование/i);
      assert.deepEqual(run.history, [], 'malformed argv must make no Docker probe: ' + JSON.stringify(args));
    }
  });

  test('P28 — package README documents catalog and machine receipts', () => {
    const readme = fs.readFileSync(path.join(PKG, 'README.md'), 'utf8');
    const start = readme.indexOf('### `check-ports.cjs`');
    const end = readme.indexOf('\n### ', start + 1);
    assert.ok(start >= 0 && end > start, 'README must retain the check-ports section');
    const section = readme.slice(start, end);
    assert.match(section, /check-ports\.cjs \.?\s*(?:#.*)?$/m, 'catalog invocation is documented');
    assert.match(section, /check-ports\.cjs --machine/, 'machine invocation is documented');
    assert.match(section, /каталог|catalog/i, 'catalog receipt is bounded');
    assert.match(section, /снимок|point-in-time/i, 'machine receipt is a snapshot, not monitoring');
    assert.match(section, /Docker-контекст|Docker context/i, 'the active context boundary is explicit');
    assert.match(section, /Redis\/Memcached[\s\S]{0,240}absence[\s\S]{0,120}`1`/i,
      'catalog authentication consequences are discoverable in the package README');
    assert.match(section, /`2`[^\n]*(?:НЕ ВЫПОЛНЕНА|did not run)/i,
      'exit 2 remains not-performed, not a violation or clean result');
  });
  test('P9 — a clean compose exits 0', { skip: !DOCKER }, () => {
    const r = check('services:\n  db:\n    image: postgres:16\n'
      + '  web:\n    image: node:22\n    ports: ["3000:3000"]\n');
    assert.equal(r.code, 0, 'a storage service with no publication is exactly right: ' + r.out);
  });
});
