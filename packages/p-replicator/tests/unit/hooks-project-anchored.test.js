'use strict';

// The six shipped hooks resolved BOTH their own file and their own data against a directory that
// drifts. One `cd` inside a Bash tool call broke all six for the rest of the session, silently,
// because hooks are non-blocking.
//
// Two independent resolutions, failing differently:
//   - the HOST resolves the command string  -> wrong: MODULE_NOT_FOUND, loud;
//   - the SCRIPT resolves its own data      -> wrong: exit 0 having done nothing, silent.
//
// This suite is deliberately BEHAVIOURAL where it can be. The field report's own verification
// looped the hooks from a subdirectory and checked the exit code: all four returned 0 while
// committing nothing and injecting nothing. An exit code proves the module LOADED. P4/P5/P6 assert
// an EFFECT, and P5 is the one that fails if either half of the fix is missing.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const TPL = path.join(PKG_DIR, 'templates', '.claude');
const HOOKS = ['autocommit-roadmap', 'autocommit-insights', 'autocommit-plans',
  'session-insights', 'statusline', 'state-update'];

const readTpl = (rel) => fs.readFileSync(path.join(TPL, rel), 'utf-8');

/** Source with comments removed. Cross-family QE: the first version of P3 was satisfied by the
 *  explanatory comment that NAMES both CLAUDE_PROJECT_DIR and __dirname, while the executable code
 *  could still anchor anywhere. A mention is not a use. */
function code(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const settings = () => JSON.parse(readTpl('settings.json'));

/** Every command string the host will spawn: the four hooks plus the status line. */
function allCommands() {
  const s = settings();
  const out = [];
  if (s.statusLine && s.statusLine.command) out.push(s.statusLine.command);
  for (const entries of Object.values(s.hooks || {})) {
    for (const entry of entries) for (const h of entry.hooks || []) out.push(h.command);
  }
  assert.ok(out.length >= 5, 'expected at least the 4 hooks + statusLine, got ' + out.length);
  return out;
}

/** A throwaway git project with the shipped hooks installed and a subdirectory to run them from. */
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-anchor-'));
  const real = fs.realpathSync(dir);            // macOS /var -> /private/var, else git paths differ
  fs.mkdirSync(path.join(real, '.claude', 'hooks'), { recursive: true });
  for (const h of HOOKS) {
    fs.copyFileSync(path.join(TPL, 'hooks', h + '.cjs'),
      path.join(real, '.claude', 'hooks', h + '.cjs'));
  }
  fs.mkdirSync(path.join(real, 'projects', '01-sub'), { recursive: true });
  const git = (args) => execFileSync('git', args, { cwd: real, stdio: 'ignore' });
  git(['init', '-q']);
  git(['config', 'user.email', 'test@example.invalid']);
  git(['config', 'user.name', 'test']);
  return { root: real, sub: path.join(real, 'projects', '01-sub'), git };
}

/** Run one hook FROM THE SUBDIRECTORY — the only place this defect is visible. */
function runFromSub(p, hook, { withEnv = true, args = [] } = {}) {
  const env = { ...process.env };
  if (withEnv) env.CLAUDE_PROJECT_DIR = p.root;
  else delete env.CLAUDE_PROJECT_DIR;
  try {
    const stdout = execFileSync(process.execPath,
      [path.join(p.root, '.claude', 'hooks', hook + '.cjs'), ...args],
      { cwd: p.sub, env, encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout: stdout || '' };
  } catch (err) {
    return { code: err.status ?? 1, stdout: err.stdout?.toString() ?? '' };
  }
}

describe('hooks resolve against the project, not the drifting cwd (PR-013)', () => {
  test('P1 — no command the host spawns resolves relatively', () => {
    for (const cmd of allCommands()) {
      assert.doesNotMatch(cmd, /node\s+["']?\.claude[/\\]/,
        'a relative script path resolves against the drifting cwd, not settings.json: ' + cmd);
      assert.match(cmd, /CLAUDE_PROJECT_DIR/,
        'every command must be anchored at the project root: ' + cmd);
      // A correctly-spelled anchor in front of a script that does not exist is still a dead hook.
      const named = cmd.match(/hooks\/([A-Za-z0-9._-]+\.cjs)/);
      assert.ok(named, 'the command must name a .cjs script: ' + cmd);
      assert.ok(fs.existsSync(path.join(TPL, 'hooks', named[1])),
        'settings.json points at a script this package does not ship: ' + named[1]);
    }
  });

  test('P2 — the anchor is the PowerShell-safe braced form, and the rejected spellings stay rejected', () => {
    for (const cmd of allCommands()) {
      // MEASURED from the Claude Code binary: it rewrites the exact token ${CLAUDE_PROJECT_DIR}
      // to ${env:CLAUDE_PROJECT_DIR} for PowerShell, and warns that the UNBRACED $CLAUDE_PROJECT_DIR
      // "PowerShell reads as an undefined variable ($null)".
      assert.match(cmd, /\$\{CLAUDE_PROJECT_DIR\}/,
        'must use the braced form the host rewrites for PowerShell: ' + cmd);
      // ${CLAUDE_PROJECT_DIR:-.} is what this repo's own config uses and is REJECTED here: the
      // rewrite is a literal replaceAll of "${CLAUDE_PROJECT_DIR}", so the :- form never matches
      // and stays a POSIX-only construct — against the template's own cross-platform promise.
      assert.doesNotMatch(cmd, /\$\{CLAUDE_PROJECT_DIR:-/,
        'the POSIX default-expansion form is not cross-platform: ' + cmd);
      assert.doesNotMatch(cmd, /\$CLAUDE_PROJECT_DIR[^{]/,
        'the unbraced form is null on PowerShell: ' + cmd);
      assert.match(cmd, /"\$\{CLAUDE_PROJECT_DIR\}[^"]*"/,
        'the path must be double-quoted — a project path may contain spaces: ' + cmd);
    }
  });

  test('P3 — no hook reads process.cwd(); all six are anchored', () => {
    for (const h of HOOKS) {
      const src = code(readTpl(path.join('hooks', h + '.cjs')));
      assert.doesNotMatch(src, /process\.cwd\(\)/,
        h + '.cjs still anchors on the drifting cwd — settings.json alone only makes it RUN');
      assert.match(src, /process\.env\.CLAUDE_PROJECT_DIR/,
        h + '.cjs must consult the host first — it is authoritative about the project');
      assert.match(src, /__dirname/,
        h + '.cjs must fall back to its own location, so it works with the variable absent');
      // A truthy but RELATIVE host value would still resolve against the drifting cwd — the very
      // bug this anchor removes. Truthiness is not enough; absoluteness is the property.
      assert.match(src, /path\.isAbsolute\(/,
        h + '.cjs must require the host value to be ABSOLUTE, not merely non-empty');
    }
  });

  test('P4 — with CLAUDE_PROJECT_DIR UNSET, a hook still finds the project', () => {
    // This is what makes the settings fix non-load-bearing for correctness: an older host, a
    // hand-run, a CI shell. It also pins the || ordering: remove the __dirname fallback and this
    // is the assertion that goes red.
    const p = project();
    try {
      fs.mkdirSync(path.join(p.root, '.claude', 'insights'), { recursive: true });
      fs.writeFileSync(path.join(p.root, '.claude', 'insights', 'index.md'),
        '## Insight one\n\nbody one\n');
      const r = runFromSub(p, 'session-insights', { withEnv: false });
      assert.equal(r.code, 0, 'the hook must stay non-blocking');
      assert.match(r.stdout, /Insight one/,
        'with no env var and cwd in a subdirectory, the hook must still read the ROOT index');
    } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
  });

  test('P5 — EFFECT from a subdirectory: the roadmap is actually committed', () => {
    // The property the whole feature exists for. An exit-code check passes on the broken hook;
    // this does not. Fails if EITHER half of the fix is missing.
    const p = project();
    try {
      fs.writeFileSync(path.join(p.root, '.claude', 'feature-roadmap.json'), '{"v":1}\n');
      p.git(['add', '-A']);
      p.git(['commit', '-q', '-m', 'base']);
      fs.writeFileSync(path.join(p.root, '.claude', 'feature-roadmap.json'), '{"v":2}\n');

      const before = execFileSync('git', ['rev-list', '--count', 'HEAD'],
        { cwd: p.root, encoding: 'utf8' }).trim();
      const r = runFromSub(p, 'autocommit-roadmap');
      assert.equal(r.code, 0, 'the hook must stay non-blocking');
      const after = execFileSync('git', ['rev-list', '--count', 'HEAD'],
        { cwd: p.root, encoding: 'utf8' }).trim();

      assert.equal(Number(after), Number(before) + 1,
        'a changed roadmap must be COMMITTED when the hook runs from a subdirectory — '
        + 'this is the assertion the report\'s exit-code check could not make');
      const clean = execFileSync('git', ['status', '--porcelain', '--', '.claude/feature-roadmap.json'],
        { cwd: p.root, encoding: 'utf8' });
      assert.equal(clean.trim(), '', 'and the file must be left clean, not merely staged');
    } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
  });

  test('P7 — every autocommit hook puts -m BEFORE the `--`, or it commits nothing', () => {
    // Found BY P5, not by review: everything after `--` is a pathspec, so
    // ['commit','--only','--',RELATIVE,'-m',MSG] made git look for files literally named '-m' and
    // 'docs(roadmap): auto-update'. It failed from EVERY directory, and the hook exits 0 on failure,
    // so three autocommit hooks had never committed anything and nothing said so. P5 proves the
    // behaviour for one of the three; this pins the shape for all three, since the other two have
    // no git fixture of their own.
    for (const h of ['autocommit-roadmap', 'autocommit-insights', 'autocommit-plans']) {
      const src = readTpl(path.join('hooks', h + '.cjs'));
      const m = src.match(/git\(\[('commit'[^\]]*)\]\)/);
      assert.ok(m, h + '.cjs must invoke git commit');
      const args = m[1];
      // Cross-family QE: comparing indexOf directly made a MISSING -m pass, since -1 is less than
      // any real index. Presence first, then order.
      const mi = args.indexOf("'-m'");
      const dd = args.indexOf("'--'");
      assert.ok(mi >= 0, h + ".cjs: git commit must carry -m at all: " + args);
      assert.ok(dd >= 0, h + ".cjs: git commit must carry the `--` pathspec separator: " + args);
      assert.ok(mi < dd,
        h + ".cjs: -m must precede `--`, else the message is parsed as a pathspec: " + args);
    }
  });

  test('P6 — writer and reader agree on ONE path, from any cwd', () => {
    // state-update.cjs writes the state, statusline.cjs reads it. Two drifting anchors can
    // disagree, and a status line reading a file nobody wrote is worse than none.
    const p = project();
    try {
      // A DISTINCTIVE value: cross-family QE noted that matching /replicate|VALIDATE/ would pass on
      // any static status output that happens to contain those words, without reading the file at
      // all. A token that appears nowhere else can only have come through the state file.
      const TOKEN = 'ZQPHASE7X';
      const w = runFromSub(p, 'state-update',
        { args: ['--command', '/replicate', '--phase', TOKEN, '--index', '2', '--total', '4'] });
      assert.equal(w.code, 0, 'the writer must stay non-blocking');
      const stateFile = path.join(p.root, '.claude', '.p-replicator-state.json');
      assert.ok(fs.existsSync(stateFile),
        'the writer must publish state at the PROJECT root, not under the subdirectory it ran from');
      assert.doesNotMatch(
        fs.existsSync(path.join(p.sub, '.claude')) ? 'stray' : 'clean', /stray/,
        'and must not have created a second .claude tree under the subdirectory');

      const r = runFromSub(p, 'statusline');
      assert.equal(r.code, 0, 'the reader must stay non-blocking');
      assert.match(r.stdout, new RegExp(TOKEN),
        'the reader must echo the DISTINCTIVE token the writer just published — a token that '
        + 'appears nowhere else can only have arrived through the state file');
    } finally { fs.rmSync(p.root, { recursive: true, force: true }); }
  });
});
