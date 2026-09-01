'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PKG = path.resolve(__dirname, '..', '..');
const HOOK = path.join(PKG, 'templates', '.claude', 'hooks', 'session-insights.cjs');
const LOCAL = 'LOCAL_ONLY';
const DZ = 'DZ_ONLY';

function loadHook() {
  delete require.cache[require.resolve(HOOK)];
  return require(HOOK);
}

function project(prefix = 'p-rep-dz-contract-') {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const index = path.join(root, '.claude', 'insights', 'index.md');
  fs.mkdirSync(path.dirname(index), { recursive: true });
  fs.writeFileSync(index, `## 2026-08-30 — ${LOCAL}\n\nlocal body\n`);
  return root;
}

function userPrompt(prompt = 'choose an optional dependency fallback') {
  return JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt });
}

function runHook(root, result, rawEvent = userPrompt()) {
  const chunks = [];
  const runner = (_file, _args, _options) => result;
  loadHook().emitInsights(root, { write: (chunk) => chunks.push(chunk) }, { rawEvent, runner });
  return chunks.join('');
}

function envelope(stdout) {
  const lines = stdout.trimEnd().split('\n');
  assert.equal(lines.length, 1, `expected one hook envelope, got ${lines.length}: ${stdout}`);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  return parsed.hookSpecificOutput.additionalContext;
}

function recalled(pattern = DZ) {
  return {
    status: 0,
    stdout: JSON.stringify([{ pattern, domain: 'p-replicator-insights' }]),
    stderr: '',
  };
}

function absent() {
  return { status: null, stdout: '', stderr: '', error: { code: 'ENOENT' } };
}

describe('PR-022 optional dz delivery contract', () => {
  test('P10 - absent dz emits local only without dz error text', () => {
    const root = project();
    try {
      const context = envelope(runHook(root, absent()));
      assert.match(context, new RegExp(LOCAL));
      assert.doesNotMatch(context, new RegExp(DZ));
      assert.doesNotMatch(context, /dz recall (unavailable|failed)/i);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P11 - armed non-empty recall emits dz only', () => {
    const root = project();
    try {
      const context = envelope(runHook(root, recalled()));
      assert.match(context, new RegExp(DZ));
      assert.doesNotMatch(context, new RegExp(LOCAL));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P12 - failing or timed-out recall names degradation and emits local only', () => {
    const root = project();
    const failures = [
      { status: 23, stdout: '', stderr: 'SECRET child stderr' },
      { status: null, stdout: '', stderr: '', error: { code: 'ETIMEDOUT' }, signal: 'SIGTERM' },
    ];
    try {
      for (const result of failures) {
        const context = envelope(runHook(root, result));
        assert.match(context, /dz recall unavailable: (exit 23|timeout); using local recent insights/i);
        assert.match(context, new RegExp(LOCAL));
        assert.doesNotMatch(context, new RegExp(DZ));
        assert.doesNotMatch(context, /SECRET child stderr/);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P13 - empty successful recall emits local only', () => {
    const root = project();
    const emptyResults = [
      { status: 0, stdout: '[]', stderr: '' },
      { status: 0, stdout: JSON.stringify([
        { pattern: DZ, domain: 'another-domain' },
        { pattern: '   ', domain: 'p-replicator-insights' },
      ]), stderr: '' },
    ];
    try {
      for (const result of emptyResults) {
        const context = envelope(runHook(root, result));
        assert.match(context, new RegExp(LOCAL));
        assert.doesNotMatch(context, new RegExp(DZ));
        assert.doesNotMatch(context, /dz recall unavailable/i);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P14 - local suppression requires armed recall and never double-injects across absent/ok/failing/empty', () => {
    const root = project();
    const states = {
      absent: absent(),
      ok: recalled(),
      failing: { status: 2, stdout: '', stderr: '' },
      empty: { status: 0, stdout: '[]', stderr: '' },
    };
    try {
      for (const [state, result] of Object.entries(states)) {
        const context = envelope(runHook(root, result));
        const hasLocal = context.includes(LOCAL);
        const hasDz = context.includes(DZ);
        assert.notEqual(hasLocal, hasDz, `${state} must select exactly one insight source`);
        assert.equal(hasDz, state === 'ok', `${state} armedness selected the wrong source`);
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P15 - malformed successful stdout cannot arm recall', () => {
    const root = project();
    try {
      for (const stdout of ['not-json', '{}']) {
        const context = envelope(runHook(root, { status: 0, stdout, stderr: '' }));
        assert.match(context, /dz recall unavailable: invalid (JSON|result)/i);
        assert.match(context, new RegExp(LOCAL));
        assert.doesNotMatch(context, new RegExp(DZ));
      }
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P15a - prompt parsing root pin argv and output bounds survive hostile input', () => {
    const api = loadHook();
    for (const key of ['prompt', 'user_prompt', 'userPrompt']) {
      assert.deepEqual(
        api.parseHookEvent(JSON.stringify({ hook_event_name: 'UserPromptSubmit', [key]: ' task ' })),
        { kind: 'user-prompt', prompt: 'task' },
      );
    }

    const root = project('p rep dz contract ');
    const calls = [];
    try {
      const result = api.recallFromDz('literal $(touch never) `echo never`', root, {
        runner(file, args, options) {
          calls.push({ file, args, options });
          return recalled('X'.repeat(20 * 1024));
        },
      });
      assert.equal(result.kind, 'ok');
      assert.ok(Buffer.byteLength(result.context, 'utf8') <= 16 * 1024,
        `rendered context exceeded 16 KiB: ${Buffer.byteLength(result.context, 'utf8')}`);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].file, 'dz');
      // The ADR's Decision pins this argv exactly, --domain included: it is a rank BOOST, and
      // without it a shared multi-domain store buries insight records below the top-12 cut, so
      // the armed state never fires. This assertion previously omitted the flag and therefore
      // cemented the very gap cross-family QE found.
      assert.deepEqual(calls[0].args, [
        'recall', 'literal $(touch never) `echo never`', '--limit', '12',
        '--domain', 'p-replicator-insights',
        '--project', root, '--json',
      ]);
      assert.equal(calls[0].options.cwd, root);
      assert.equal(calls[0].options.shell, false);
      assert.equal(calls[0].options.timeout, 1500);
      assert.equal(calls[0].options.maxBuffer, 1024 * 1024);

      const oversized = api.recallFromDz('task', root, {
        runner: () => ({ status: null, stdout: '', stderr: '', error: { code: 'ENOBUFS' } }),
      });
      assert.deepEqual(oversized, { kind: 'failing', reason: 'spawn ENOBUFS' });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  test('P19 - production comments contain no decision-history narration', () => {
    for (const file of ['session-insights.cjs', 'write-insight.cjs']) {
      const source = fs.readFileSync(path.join(PKG, 'templates', '.claude', 'hooks', file), 'utf8');
      const comments = source.split('\n').filter((line) => /^\s*(\/\/|\/\*|\*)/.test(line)).join('\n');
      assert.doesNotMatch(comments, /supersed|a0ea8b|cross-model|FIX-\d|AM-\d|third answer/i,
        `${file} contains decision history that belongs in the ADR`);
    }
  });
});
