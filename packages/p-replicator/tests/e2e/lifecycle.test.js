'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const CLI = path.join(PKG_DIR, 'bin', 'cli.js');
const MANIFEST = '.p-replicator.json';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-e2e-'));
}

function rmRf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function runCli(args, cwd) {
  const argv = Array.isArray(args) ? args : args.split(' ').filter(Boolean);
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...argv], {
      cwd,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, stdout: stdout || '', stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

function exists(cwd, rel) {
  return fs.existsSync(path.join(cwd, rel));
}

// ---------------------------------------------------------------------------
// --version / --help
// ---------------------------------------------------------------------------

describe('e2e: meta flags', () => {
  test('--version prints semver and exits 0', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['--version'], dir);
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
    } finally { rmRf(dir); }
  });

  test('--help shows usage with all commands', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['--help'], dir);
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /Usage:/i);
      assert.match(r.stdout, /init/);
      assert.match(r.stdout, /update/);
      assert.match(r.stdout, /remove/);
      assert.match(r.stdout, /list/);
      assert.match(r.stdout, /doctor/);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

describe('e2e: init', () => {
  test('init creates manifest and copies components', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['init'], dir);
      assert.equal(r.exitCode, 0,
        `init failed.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.ok(exists(dir, MANIFEST), 'manifest not created');

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8'));
      assert.match(manifest.version, /^\d+\.\d+\.\d+/);
      assert.deepEqual(
        manifest.components.sort(),
        ['agents', 'commands', 'hooks', 'rules', 'settings', 'skills'],
        'v1.4.1 manifest includes 6 pre-shipped components (added: hooks)'
      );
      assert.ok(manifest.files.length > 0, 'no files tracked in manifest');

      assert.ok(exists(dir, '.claude'), '.claude/ not created');
      assert.ok(exists(dir, '.claude/skills'), '.claude/skills/ not created');
      assert.ok(exists(dir, '.claude/commands/replicate.md'), 'replicate.md not installed');
      assert.ok(exists(dir, '.claude/commands/harvest.md'), 'harvest.md not installed');
    } finally { rmRf(dir); }
  });

  test('init refuses without --force when manifest exists', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['init'], dir);
      assert.equal(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /already installed/i);
    } finally { rmRf(dir); }
  });

  test('init --force overwrites existing install', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['init', '--force'], dir);
      assert.equal(r.exitCode, 0);
      assert.ok(exists(dir, MANIFEST));
    } finally { rmRf(dir); }
  });

  test('init --dry-run leaves filesystem unchanged', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['init', '--dry-run'], dir);
      assert.equal(r.exitCode, 0);
      assert.equal(exists(dir, MANIFEST), false, 'manifest should NOT be created on --dry-run');
      assert.equal(exists(dir, '.claude'), false, '.claude/ should NOT be created on --dry-run');
      assert.match(r.stdout, /Dry run/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

describe('e2e: list', () => {
  test('list shows all four component groups after init', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['list'], dir);
      assert.equal(r.exitCode, 0);
      assert.match(r.stdout, /Skills:/i);
      assert.match(r.stdout, /Commands:/i);
      assert.match(r.stdout, /Agents:/i);
      assert.match(r.stdout, /Rules:/i);
      assert.match(r.stdout, /\/replicate/);
      assert.match(r.stdout, /\/harvest/);
    } finally { rmRf(dir); }
  });

  test('list refuses when not installed', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['list'], dir);
      assert.equal(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /not installed/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// doctor
// ---------------------------------------------------------------------------

describe('e2e: doctor', () => {
  test('doctor passes after fresh init', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['doctor'], dir);
      assert.equal(r.exitCode, 0,
        `doctor failed after init.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stdout, /All checks passed/i);
    } finally { rmRf(dir); }
  });

  test('doctor exits non-zero when not installed', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['doctor'], dir);
      assert.notEqual(r.exitCode, 0);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

describe('e2e: update', () => {
  test('update --dry-run reports up-to-date right after init', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['update', '--dry-run'], dir);
      assert.equal(r.exitCode, 0);
      // Either "Already up to date" or "0 new files\n0 modified files"
      assert.match(
        r.stdout,
        /up to date|0 new files[\s\S]*0 modified files/i
      );
    } finally { rmRf(dir); }
  });

  test('update refuses when not installed', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['update'], dir);
      assert.equal(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /not installed/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// remove
// ---------------------------------------------------------------------------

describe('e2e: remove', () => {
  test('remove deletes manifest and tracked files', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      assert.ok(exists(dir, MANIFEST), 'precondition: manifest must exist');
      assert.ok(exists(dir, '.claude/commands/replicate.md'), 'precondition: replicate.md must exist');

      const r = runCli(['remove'], dir);
      assert.equal(r.exitCode, 0);

      assert.equal(exists(dir, MANIFEST), false, 'manifest should be removed');
      assert.equal(
        exists(dir, '.claude/commands/replicate.md'),
        false,
        'tracked files should be removed'
      );
    } finally { rmRf(dir); }
  });

  test('remove --dry-run keeps files intact', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['remove', '--dry-run'], dir);
      assert.equal(r.exitCode, 0);
      assert.ok(exists(dir, MANIFEST), 'dry-run should not remove manifest');
      assert.match(r.stdout, /Dry run/i);
    } finally { rmRf(dir); }
  });

  test('remove refuses when not installed', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['remove'], dir);
      assert.equal(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /not installed/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// unknown command
// ---------------------------------------------------------------------------

describe('e2e: unknown command', () => {
  test('exits 1 and shows help on unknown command', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['nonsense-command'], dir);
      assert.equal(r.exitCode, 1);
      assert.match(r.stdout + r.stderr, /Unknown command/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// Regression: --help component counts (SSOT)
// Bug fixed: cli.js used to say "1 rule" while EXPECTED_RULES had 2 entries.
// ---------------------------------------------------------------------------

describe('e2e: --help shows correct component counts', () => {
  test('--help agrees with COMPONENTS for every group', () => {
    // DERIVED, not hardcoded. This assertion has now gone stale twice for the same reason — the
    // comment above records "cli.js used to say 1 rule while EXPECTED_RULES had 2 entries", and
    // adding the docker-ports rule broke it again with a literal 5. cli.js:57 already computes the
    // numbers from COMPONENTS; a test that re-types them is a second source of truth, which is the
    // very defect it was written to catch.
    const { COMPONENTS } = require(path.join(PKG_DIR, 'src', 'utils.js'));
    const dir = tmpDir();
    try {
      const r = runCli(['--help'], dir);
      assert.equal(r.exitCode, 0);
      for (const group of ['skills', 'commands', 'agents', 'rules']) {
        const n = Object.keys(COMPONENTS[group].items).length;
        // singular/plural: cli.js prints "1 rule" but "6 rules"
        const word = n === 1 ? group.replace(/s$/, '') : group;
        assert.match(r.stdout, new RegExp(n + '\\s+' + word, 'i'),
          '--help must say "' + n + ' ' + word + '" to match COMPONENTS.' + group);
      }
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4: Pre-shipped post-/replicate workflow artifacts
// init MUST install all 9 generic commands + 3 generic rules + settings.json
// so /replicate Phase 3 can ENHANCE rather than CREATE them.
// ---------------------------------------------------------------------------

describe('e2e: v1.4 pre-shipped generic toolkit', () => {
  test('init installs all 11 generic commands', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const expected = [
        'replicate', 'harvest',
        'start', 'plan', 'feature', 'go', 'run', 'next',
        'docs', 'deploy', 'myinsights',
      ];
      for (const cmd of expected) {
        assert.ok(
          exists(dir, `.claude/commands/${cmd}.md`),
          `${cmd}.md should be installed by init (v1.4 pre-shipped)`
        );
      }
    } finally { rmRf(dir); }
  });

  test('init installs all 5 generic rules', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const expected = [
        'replicate-pipeline',
        'skill-interface-protocol',
        'git-workflow',
        'insights-capture',
        'feature-lifecycle',
      ];
      for (const rule of expected) {
        assert.ok(
          exists(dir, `.claude/rules/${rule}.md`),
          `${rule}.md should be installed by init (v1.4 pre-shipped)`
        );
      }
    } finally { rmRf(dir); }
  });

  test('init installs settings.json with hooks', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      assert.ok(fs.existsSync(settingsPath), 'settings.json should exist');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.ok(settings.hooks, 'settings.json should have hooks key');
    } finally { rmRf(dir); }
  });

  test('doctor passes with v1.4 expanded contract', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['doctor'], dir);
      assert.equal(r.exitCode, 0,
        `doctor failed with v1.4 contract.\nstdout:\n${r.stdout}`);
      assert.match(r.stdout, /All checks passed/i);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4: New `verify` command — post-/replicate state check
// Captures the user's manual verification prompt as a re-runnable check.
// ---------------------------------------------------------------------------

describe('e2e: verify command', () => {
  test('verify reports pre-shipped artifacts after init', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['verify'], dir);
      assert.equal(r.exitCode, 0,
        `verify failed.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);
      assert.match(r.stdout, /Pre-shipped/i);
      assert.match(r.stdout, /\/run/);
      assert.match(r.stdout, /\/next/);
    } finally { rmRf(dir); }
  });

  test('verify exits non-zero when not installed', () => {
    const dir = tmpDir();
    try {
      const r = runCli(['verify'], dir);
      assert.notEqual(r.exitCode, 0,
        'verify on a clean dir should exit non-zero (not installed)');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4.1: cross-platform hooks (Node scripts vs bash)
// ---------------------------------------------------------------------------

describe('e2e: v1.4.1 cross-platform hooks', () => {
  test('init installs 4 hook scripts in .claude/hooks/', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const expected = [
        'session-insights',
        'autocommit-roadmap',
        'autocommit-insights',
        'autocommit-plans',
      ];
      for (const hook of expected) {
        assert.ok(
          exists(dir, `.claude/hooks/${hook}.cjs`),
          `${hook}.cjs should be installed (cross-platform Node script, v1.4.1)`
        );
      }
    } finally { rmRf(dir); }
  });

  test('settings.json references Node scripts, not bash chains', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settings = JSON.parse(
        fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')
      );
      // Collect all hook commands
      const allCmds = [];
      for (const event of Object.values(settings.hooks || {})) {
        for (const matcher of event) {
          for (const h of matcher.hooks || []) {
            if (h.command) allCmds.push(h.command);
          }
        }
      }
      assert.ok(allCmds.length > 0, 'no hook commands found');
      for (const cmd of allCmds) {
        // No bash-specific redirect operators
        assert.doesNotMatch(cmd, /2>\/dev\/null/,
          `bash-specific 2>/dev/null in: ${cmd}`);
        assert.doesNotMatch(cmd, /\|\|\s*true/,
          `bash-specific || true in: ${cmd}`);
        // Each command should invoke node + a script
        // Anchored at the project root, not the drifting cwd (PR-013): still node + the exact
        // script, and now additionally the anchor — strictly stronger than the old assertion.
        assert.match(cmd, /node\s+"\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/[A-Za-z0-9._-]+\.cjs"/,
          `expected 'node "\${CLAUDE_PROJECT_DIR}/.claude/hooks/<script>.cjs"', got: ${cmd}`);
      }
    } finally { rmRf(dir); }
  });

  test('hook scripts are syntactically valid Node modules', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const hooks = ['session-insights', 'autocommit-roadmap', 'autocommit-insights', 'autocommit-plans'];
      for (const hook of hooks) {
        const hookPath = path.join(dir, `.claude/hooks/${hook}.cjs`);
        const r = (() => {
          try {
            require('child_process').execFileSync(
              process.execPath, ['--check', hookPath], { stdio: 'pipe' }
            );
            return { ok: true };
          } catch (err) {
            return { ok: false, msg: err.stderr?.toString() ?? err.message };
          }
        })();
        assert.ok(r.ok, `${hook}.cjs has syntax error: ${r.msg}`);
      }
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4.1: meta-tests for replicate.md ↔ replicate-pipeline.md consistency
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// v1.4.2: settings.json merge preserves user customizations
// ---------------------------------------------------------------------------

describe('e2e: v1.4.2 settings.json merge on --force', () => {
  const USER_HOOK_COMMAND = 'echo "USER-CUSTOM-HOOK-MARKER-12345"';

  test('init --force preserves user-added hooks in settings.json', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      // Add a user hook to existing Stop event
      settings.hooks.Stop[0].hooks.push({
        type: 'command',
        command: USER_HOOK_COMMAND,
        timeout: 5,
      });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const r = runCli(['init', '--force'], dir);
      assert.equal(r.exitCode, 0);

      const merged = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allCmds = merged.hooks.Stop.flatMap((m) => m.hooks).map((h) => h.command);
      assert.ok(allCmds.includes(USER_HOOK_COMMAND),
        'user-added hook should survive init --force');
      // Template hooks also present
      assert.ok(allCmds.some((c) => c.includes('autocommit-roadmap')),
        'template hooks also present');
    } finally { rmRf(dir); }
  });

  test('init --force --reset-settings overwrites user settings', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.hooks.Stop[0].hooks.push({
        type: 'command',
        command: USER_HOOK_COMMAND,
        timeout: 5,
      });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const r = runCli(['init', '--force', '--reset-settings'], dir);
      assert.equal(r.exitCode, 0);

      const reset = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allCmds = reset.hooks.Stop.flatMap((m) => m.hooks).map((h) => h.command);
      assert.ok(!allCmds.includes(USER_HOOK_COMMAND),
        'user hook should be removed by --reset-settings');
    } finally { rmRf(dir); }
  });

  test('user-added new event type (PreToolUse) is preserved', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.hooks.PreToolUse = [{
        matcher: 'Bash',
        hooks: [{ type: 'command', command: 'audit-bash', timeout: 5 }],
      }];
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      runCli(['init', '--force'], dir);

      const merged = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      assert.ok(merged.hooks.PreToolUse,
        'user-added PreToolUse event type should survive --force');
      assert.equal(merged.hooks.PreToolUse[0].hooks[0].command, 'audit-bash');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4.3: shippedDefaults baseline + orphan hook detection on upgrade
// ---------------------------------------------------------------------------

describe('e2e: v1.4.3 manifest tracks shippedDefaults baseline', () => {
  test('init populates manifest.shippedDefaults["settings.json"]', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const manifest = JSON.parse(
        fs.readFileSync(path.join(dir, '.p-replicator.json'), 'utf8')
      );
      assert.ok(manifest.shippedDefaults,
        'manifest should have shippedDefaults (v1.4.3+)');
      assert.ok(manifest.shippedDefaults['settings.json'],
        'should track settings.json template content');
      assert.ok(manifest.shippedDefaults['settings.json'].hooks,
        'should include the hooks structure');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.5.0: statusline dashboard
// ---------------------------------------------------------------------------

describe('e2e: v1.5.0 statusline dashboard', () => {
  test('init installs statusline.cjs and state-update.cjs', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      assert.ok(exists(dir, '.claude/hooks/statusline.cjs'),
        'statusline.cjs should be installed in v1.5.0');
      assert.ok(exists(dir, '.claude/hooks/state-update.cjs'),
        'state-update.cjs should be installed in v1.5.0');
    } finally { rmRf(dir); }
  });

  test('settings.json registers statusLine config', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settings = JSON.parse(
        fs.readFileSync(path.join(dir, '.claude/settings.json'), 'utf8')
      );
      assert.ok(settings.statusLine, 'statusLine field should be present in settings.json');
      assert.equal(settings.statusLine.type, 'command');
      assert.match(settings.statusLine.command,
        /node\s+"\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/statusline\.cjs"/,
        'should invoke statusline.cjs via node, anchored at the project root (PR-013)');
    } finally { rmRf(dir); }
  });

  test('statusline.cjs runs cleanly after init (exit 0)', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const result = (() => {
        try {
          const stdout = require('child_process').execFileSync(
            process.execPath,
            [path.join(dir, '.claude/hooks/statusline.cjs')],
            { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
          );
          return { exitCode: 0, stdout };
        } catch (err) {
          return { exitCode: err.status ?? 1, stdout: err.stdout?.toString() ?? '', stderr: err.stderr?.toString() ?? '' };
        }
      })();
      assert.equal(result.exitCode, 0,
        `statusline failed: ${result.stderr || 'no stderr'}`);
      assert.ok(result.stdout.length > 0, 'statusline should produce output');
    } finally { rmRf(dir); }
  });

  test('statusline output mentions package name and 5 section markers', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const stdout = require('child_process').execFileSync(
        process.execPath,
        [path.join(dir, '.claude/hooks/statusline.cjs')],
        { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
      );
      // Strip ANSI escape codes for content checks
      const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
      assert.match(plain, /P-Replicator/i, 'should show package name');
      assert.match(plain, /Pipeline/i, 'Pipeline section');
      assert.match(plain, /Roadmap/i, 'Roadmap section');
      assert.match(plain, /SPARC/i, 'SPARC section');
      assert.match(plain, /Toolkit|Skills/i, 'Toolkit section');
      assert.match(plain, /Insights|Tests|MCP/i, 'Status section');
    } finally { rmRf(dir); }
  });

  test('statusline shows ADRs and Plans counts', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      // Create a fake plan and an ADR doc
      fs.mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'docs/plans/sample.md'), '# Plan\n');
      fs.writeFileSync(path.join(dir, 'docs/ADR.md'),
        '# ADR\n\n## ADR-001\n\n## ADR-002\n');

      const stdout = require('child_process').execFileSync(
        process.execPath,
        [path.join(dir, '.claude/hooks/statusline.cjs')],
        { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
      );
      const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
      assert.match(plain, /Plans[^|]*1/, 'should show 1 plan');
      assert.match(plain, /ADR[^|]*2/, 'should show 2 ADRs');
    } finally { rmRf(dir); }
  });

  test('statusline shows roadmap progress when feature-roadmap.json exists', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(dir, '.claude/feature-roadmap.json'), JSON.stringify({
        version: '1.0',
        features: [
          { id: 'a', priority: 'mvp', status: 'done' },
          { id: 'b', priority: 'mvp', status: 'next' },
          { id: 'c', priority: 'high', status: 'planned' },
        ],
      }));
      const stdout = require('child_process').execFileSync(
        process.execPath,
        [path.join(dir, '.claude/hooks/statusline.cjs')],
        { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
      );
      const plain = stdout.replace(/\x1b\[[0-9;]*m/g, '');
      assert.match(plain, /1.*\/.*3/, 'should show 1/3 done');
    } finally { rmRf(dir); }
  });

  test('statusline does NOT throw when optional files are missing', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      // Don't create any optional files (no docs/, no roadmap, no insights)
      const result = (() => {
        try {
          require('child_process').execFileSync(
            process.execPath,
            [path.join(dir, '.claude/hooks/statusline.cjs')],
            { cwd: dir, encoding: 'utf8', stdio: 'pipe' }
          );
          return true;
        } catch { return false; }
      })();
      assert.ok(result, 'statusline should be defensive against missing files');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.5.0: --feature-branches flag in /run, /go, /next
// ---------------------------------------------------------------------------

describe('meta: v1.5.0 --feature-branches flag documented', () => {
  const TEMPLATES = path.resolve(__dirname, '..', '..', 'templates');

  test('/run.md mentions --feature-branches and feature/{NNN}-{id} format', () => {
    const content = fs.readFileSync(
      path.join(TEMPLATES, '.claude/commands/run.md'), 'utf8'
    );
    assert.match(content, /--feature-branches/,
      'run.md should document --feature-branches');
    assert.match(content, /feature\/\{?NNN\}?-\{?id\}?|feature\/\d{3}-/,
      'run.md should mention feature/{NNN}-{id} branch format');
    assert.match(content, /--auto-merge/i,
      'run.md should mention --auto-merge companion flag');
    assert.match(content, /auto-stash|stash/i,
      'run.md should mention auto-stash for dirty working tree');
  });

  test('/go.md mentions --feature-branches', () => {
    const content = fs.readFileSync(
      path.join(TEMPLATES, '.claude/commands/go.md'), 'utf8'
    );
    assert.match(content, /--feature-branches/,
      'go.md should document --feature-branches');
  });

  test('/next.md mentions number and branch fields in roadmap schema', () => {
    const content = fs.readFileSync(
      path.join(TEMPLATES, '.claude/commands/next.md'), 'utf8'
    );
    assert.match(content, /"number"/, 'next.md should mention "number" field');
    assert.match(content, /"branch"/, 'next.md should mention "branch" field');
  });
});

describe('e2e: v1.4.3 orphan hook detection on init --force', () => {
  test('removes hook that was in old shippedDefaults but no longer in current template', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      const manifestPath = path.join(dir, '.p-replicator.json');

      // Step 1: simulate "user has been running v1.x with hook OBSOLETE"
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.hooks.Stop[0].hooks.push({
        type: 'command',
        command: 'OBSOLETE_HOOK_FROM_v1.x',
        timeout: 5,
      });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      // Step 2: rewrite manifest's shippedDefaults to claim "old version included OBSOLETE"
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.shippedDefaults['settings.json'].hooks.Stop[0].hooks.push({
        type: 'command',
        command: 'OBSOLETE_HOOK_FROM_v1.x',
        timeout: 5,
      });
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Step 3: now init --force — current template does NOT have OBSOLETE
      runCli(['init', '--force'], dir);

      // Step 4: verify OBSOLETE was detected as orphan and removed
      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allCmds = after.hooks.Stop.flatMap((m) => m.hooks).map((h) => h.command);
      assert.ok(
        !allCmds.includes('OBSOLETE_HOOK_FROM_v1.x'),
        'orphan (in old shippedDefaults, not in current template) should be removed'
      );
    } finally { rmRf(dir); }
  });

  test('user-added hook preserved alongside orphan removal', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const settingsPath = path.join(dir, '.claude/settings.json');
      const manifestPath = path.join(dir, '.p-replicator.json');

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      settings.hooks.Stop[0].hooks.push(
        { type: 'command', command: 'USER_CUSTOM_HOOK', timeout: 5 },
        { type: 'command', command: 'OBSOLETE_v1', timeout: 5 }
      );
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.shippedDefaults['settings.json'].hooks.Stop[0].hooks.push(
        { type: 'command', command: 'OBSOLETE_v1', timeout: 5 }
      );
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      runCli(['init', '--force'], dir);

      const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const allCmds = after.hooks.Stop.flatMap((m) => m.hooks).map((h) => h.command);
      assert.ok(allCmds.includes('USER_CUSTOM_HOOK'),
        'user-added (never in old shippedDefaults) should survive');
      assert.ok(!allCmds.includes('OBSOLETE_v1'),
        'orphan (in old shippedDefaults but not in current) should be removed');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// v1.4.2: doctor reports git on PATH
// ---------------------------------------------------------------------------

describe('e2e: v1.4.2 doctor checks git prerequisite', () => {
  test('doctor mentions git in Prerequisites section', () => {
    const dir = tmpDir();
    try {
      runCli(['init'], dir);
      const r = runCli(['doctor'], dir);
      // Whether pass or fail, doctor should display 'Prerequisites' + 'git'
      assert.match(r.stdout, /Prerequisites/i, 'doctor should have a Prerequisites section');
      assert.match(r.stdout, /git/i, 'doctor should mention git');
    } finally { rmRf(dir); }
  });
});

describe('meta: doc-consistency replicate.md ↔ replicate-pipeline.md', () => {
  const TEMPLATES = path.resolve(__dirname, '..', '..', 'templates');
  const REPLICATE_MD = path.join(TEMPLATES, '.claude/commands/replicate.md');
  const RULE_MD = path.join(TEMPLATES, '.claude/rules/replicate-pipeline.md');

  test('replicate-pipeline.md mentions every pre-shipped command name', () => {
    const ruleContent = fs.readFileSync(RULE_MD, 'utf8');
    const utils = require('../../src/utils');
    for (const cmd of Object.keys(utils.COMPONENTS.commands.items)) {
      // Match either /cmd (with word boundary) OR `cmd` (backticked)
      const slashRe = new RegExp(`/${cmd}\\b`);
      const tickRe = new RegExp('`' + cmd + '`');
      const matched = slashRe.test(ruleContent) || tickRe.test(ruleContent);
      assert.ok(
        matched,
        `replicate-pipeline.md should mention '${cmd}' as /${cmd} or \`${cmd}\` (drift detected)`
      );
    }
  });

  test('replicate.md Phase 3 does NOT claim to generate any pre-shipped command (v1.4.2 stronger)', () => {
    const replicateContent = fs.readFileSync(REPLICATE_MD, 'utf8');
    const utils = require('../../src/utils');
    // Capture only the Phase 3 section
    const phase3Match = replicateContent.match(/### Phase 3:[\s\S]*?(?=### Phase 4:|$)/);
    assert.ok(phase3Match, 'Phase 3 section not found');
    const phase3 = phase3Match[0];

    // Scope to the "Generate these project-specific files" sub-section — that's
    // where drift would manifest. The "do NOT overwrite" sub-section legitimately
    // mentions pre-shipped command names.
    const splitMarker = /Generate these project-specific files/i;
    const generationSection = splitMarker.test(phase3)
      ? phase3.split(splitMarker)[1] || ''
      : '';

    if (!generationSection) {
      // No explicit "to generate" section — drift unlikely (acceptable)
      return;
    }

    // Allowlist: commands that Phase 3 LEGITIMATELY may generate (conditional)
    const allowedToGenerate = new Set(['feature-ent']);

    for (const cmd of Object.keys(utils.COMPONENTS.commands.items)) {
      if (allowedToGenerate.has(cmd)) continue;

      // Pattern A: explicit verb + filename
      // generate / create / produce / write / make .../<cmd>.md
      const verbRe = new RegExp(
        `(generate|create|produce|write|make|output)\\s+[^\\n]{0,80}?[/\\\\]?${cmd}\\.md`,
        'i'
      );
      // Pattern B: list-style — `cmd.md` in a bullet (— or -) within generation section
      const listRe = new RegExp(
        `[-*]\\s*\`${cmd}\\.md\``
      );

      const verbMatched = verbRe.test(generationSection);
      const listMatched = listRe.test(generationSection);
      assert.ok(
        !verbMatched && !listMatched,
        `Phase 3 should NOT list pre-shipped /${cmd} as generated ` +
        `(drift: verb=${verbMatched}, list=${listMatched})`
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Regression: update.js manifest preservation (data loss bug)
//
// Pre-fix bug: update.js called getRelativePaths(projectClaude), which walked
// the user's full .claude/ tree — capturing project-generated files (e.g.
// /replicate output: start.md, feature.md, plan.md). These were written to
// manifest.files; a subsequent `remove` would then delete them, contradicting
// remove.js's own footer guarantee.
// ---------------------------------------------------------------------------

describe('e2e: update.js manifest preservation', () => {
  // To trigger the bug we need a real diff in update — otherwise update.js exits early
  // with "Already up to date" before reaching the manifest-rewrite path. We force a
  // modified file by overwriting a template-tracked file in the project, simulating a
  // real "template upstream changed since install" scenario.
  function setupWithDiff(dir, generatedFile, generatedContent) {
    runCli(['init'], dir);
    // Force `modified[]` to be non-empty so update reaches the manifest rewrite path.
    fs.writeFileSync(
      path.join(dir, '.claude/commands/replicate.md'),
      '# locally drifted content forcing diff\n'
    );
    // Project-generated file (simulates /replicate output):
    fs.writeFileSync(path.join(dir, generatedFile), generatedContent);
  }

  test('update does NOT track project-generated files in manifest', () => {
    const dir = tmpDir();
    try {
      // Use a file that is NOT pre-shipped (start.md is now pre-shipped in v1.4).
      // .claude/agents/planner.md is generated by /replicate Phase 3 only.
      const generated = '.claude/agents/planner.md';
      setupWithDiff(dir, generated, '# Generated by /replicate\n');

      const r = runCli(['update'], dir);
      assert.equal(r.exitCode, 0,
        `update failed.\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`);

      const manifest = JSON.parse(fs.readFileSync(path.join(dir, '.p-replicator.json'), 'utf8'));
      const hasGenerated = manifest.files.some((f) =>
        f.replace(/\\/g, '/').endsWith('agents/planner.md')
      );
      assert.equal(hasGenerated, false,
        'project-generated planner.md should NOT be tracked in manifest after update');
    } finally { rmRf(dir); }
  });

  test('remove after update keeps project-generated files intact', () => {
    const dir = tmpDir();
    try {
      // Use a file that is NOT pre-shipped (start.md is now pre-shipped in v1.4).
      // .claude/agents/planner.md is generated by /replicate Phase 3 only.
      const generated = '.claude/agents/planner.md';
      setupWithDiff(dir, generated, '# Generated by /replicate\n');

      runCli(['update'], dir);
      const r = runCli(['remove'], dir);
      assert.equal(r.exitCode, 0);

      assert.ok(
        exists(dir, generated),
        'project-generated planner.md should NOT be deleted by remove (was never package-tracked)'
      );
    } finally { rmRf(dir); }
  });
});
