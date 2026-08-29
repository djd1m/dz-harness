'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const utils = require('../../src/utils');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'p-rep-utils-'));
}

function rmRf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// createManifest
// ---------------------------------------------------------------------------

describe('createManifest', () => {
  test('returns object with version, installedAt, components, files', () => {
    const m = utils.createManifest('1.0.0', ['a', 'b'], ['x.md', 'y.md']);
    assert.equal(m.version, '1.0.0');
    assert.deepEqual(m.components, ['a', 'b']);
    assert.deepEqual(m.files, ['x.md', 'y.md']);
    assert.ok(m.installedAt, 'installedAt missing');
    assert.ok(!Number.isNaN(Date.parse(m.installedAt)), 'installedAt is not parseable ISO');
  });
});

// ---------------------------------------------------------------------------
// readJSON / writeJSON
// ---------------------------------------------------------------------------

describe('readJSON/writeJSON', () => {
  test('round-trip preserves data', () => {
    const dir = tmpDir();
    try {
      const p = path.join(dir, 'x.json');
      utils.writeJSON(p, { foo: 'bar', n: 42, list: [1, 2] });
      assert.deepEqual(utils.readJSON(p), { foo: 'bar', n: 42, list: [1, 2] });
    } finally { rmRf(dir); }
  });

  test('readJSON returns null for nonexistent path', () => {
    assert.equal(utils.readJSON(path.join(os.tmpdir(), 'definitely-missing-12345.json')), null);
  });

  test('readJSON returns null for malformed JSON', () => {
    const dir = tmpDir();
    try {
      const p = path.join(dir, 'bad.json');
      fs.writeFileSync(p, '{ not json }');
      assert.equal(utils.readJSON(p), null);
    } finally { rmRf(dir); }
  });

  test('writeJSON creates parent directories', () => {
    const dir = tmpDir();
    try {
      const p = path.join(dir, 'a', 'b', 'c.json');
      utils.writeJSON(p, { ok: true });
      assert.ok(fs.existsSync(p));
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// fileExists
// ---------------------------------------------------------------------------

describe('fileExists', () => {
  test('returns true for existing file', () => {
    const dir = tmpDir();
    try {
      const p = path.join(dir, 'x.txt');
      fs.writeFileSync(p, 'hi');
      assert.equal(utils.fileExists(p), true);
    } finally { rmRf(dir); }
  });

  test('returns true for existing directory', () => {
    const dir = tmpDir();
    try {
      assert.equal(utils.fileExists(dir), true);
    } finally { rmRf(dir); }
  });

  test('returns false for nonexistent path', () => {
    assert.equal(utils.fileExists(path.join(os.tmpdir(), 'no-such-thing-987654321')), false);
  });
});

// ---------------------------------------------------------------------------
// ensureDir
// ---------------------------------------------------------------------------

describe('ensureDir', () => {
  test('creates nested directories', () => {
    const dir = tmpDir();
    try {
      const p = path.join(dir, 'a', 'b', 'c');
      utils.ensureDir(p);
      assert.equal(fs.statSync(p).isDirectory(), true);
    } finally { rmRf(dir); }
  });

  test('does not error if directory already exists', () => {
    const dir = tmpDir();
    try {
      utils.ensureDir(dir);
      utils.ensureDir(dir);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// getRelativePaths
// ---------------------------------------------------------------------------

describe('getRelativePaths', () => {
  test('returns empty array for empty dir', () => {
    const dir = tmpDir();
    try {
      assert.deepEqual(utils.getRelativePaths(dir), []);
    } finally { rmRf(dir); }
  });

  test('returns single file in flat dir', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
      assert.deepEqual(utils.getRelativePaths(dir), ['a.txt']);
    } finally { rmRf(dir); }
  });

  test('returns nested files using OS path separator', () => {
    const dir = tmpDir();
    try {
      fs.mkdirSync(path.join(dir, 'sub'));
      fs.writeFileSync(path.join(dir, 'a.txt'), 'a');
      fs.writeFileSync(path.join(dir, 'sub', 'b.txt'), 'b');
      const paths = utils.getRelativePaths(dir).sort();
      assert.deepEqual(paths, ['a.txt', path.join('sub', 'b.txt')]);
    } finally { rmRf(dir); }
  });

  test('returns empty for nonexistent dir', () => {
    assert.deepEqual(
      utils.getRelativePaths(path.join(os.tmpdir(), 'no-dir-xyz-321')),
      []
    );
  });
});

// ---------------------------------------------------------------------------
// copyDirRecursive
// ---------------------------------------------------------------------------

describe('copyDirRecursive', () => {
  test('copies single file (creates parent dirs)', () => {
    const dir = tmpDir();
    try {
      const src = path.join(dir, 'a.txt');
      const dst = path.join(dir, 'sub', 'a.txt');
      fs.writeFileSync(src, 'hello');
      utils.copyDirRecursive(src, dst);
      assert.equal(fs.readFileSync(dst, 'utf8'), 'hello');
    } finally { rmRf(dir); }
  });

  test('copies directory tree preserving content and structure', () => {
    const dir = tmpDir();
    try {
      const src = path.join(dir, 'src');
      const dst = path.join(dir, 'dst');
      fs.mkdirSync(path.join(src, 'sub'), { recursive: true });
      fs.writeFileSync(path.join(src, 'a.txt'), 'A');
      fs.writeFileSync(path.join(src, 'sub', 'b.txt'), 'B');

      utils.copyDirRecursive(src, dst);

      assert.equal(fs.readFileSync(path.join(dst, 'a.txt'), 'utf8'), 'A');
      assert.equal(fs.readFileSync(path.join(dst, 'sub', 'b.txt'), 'utf8'), 'B');
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// copyDirFiltered
// ---------------------------------------------------------------------------

describe('copyDirFiltered', () => {
  test('only copies top-level entries matching filter', () => {
    const dir = tmpDir();
    try {
      const src = path.join(dir, 'src');
      const dst = path.join(dir, 'dst');
      fs.mkdirSync(src, { recursive: true });
      fs.writeFileSync(path.join(src, 'replicate.md'), 'A');
      fs.writeFileSync(path.join(src, 'other.md'), 'B');
      fs.writeFileSync(path.join(src, 'harvest.md'), 'C');

      const filter = (name) => name.startsWith('replicate') || name.startsWith('harvest');
      utils.copyDirFiltered(src, dst, filter);

      assert.equal(fs.readFileSync(path.join(dst, 'replicate.md'), 'utf8'), 'A');
      assert.equal(fs.readFileSync(path.join(dst, 'harvest.md'), 'utf8'), 'C');
      assert.equal(fs.existsSync(path.join(dst, 'other.md')), false);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// diffFiles
// ---------------------------------------------------------------------------

describe('diffFiles', () => {
  function setup(dir, srcMap, dstMap) {
    const srcDir = path.join(dir, 'src');
    const dstDir = path.join(dir, 'dst');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(dstDir, { recursive: true });
    for (const [rel, content] of Object.entries(srcMap)) {
      const p = path.join(srcDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    for (const [rel, content] of Object.entries(dstMap)) {
      const p = path.join(dstDir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    return { srcDir, dstDir };
  }

  test('identical dirs: all files unchanged', () => {
    const dir = tmpDir();
    try {
      const { srcDir, dstDir } = setup(dir, { 'a.md': 'X' }, { 'a.md': 'X' });
      const r = utils.diffFiles(srcDir, dstDir);
      assert.deepEqual(r.unchanged, ['a.md']);
      assert.deepEqual(r.added, []);
      assert.deepEqual(r.modified, []);
      assert.deepEqual(r.missing, []);
    } finally { rmRf(dir); }
  });

  test('new file in src: classified as added', () => {
    const dir = tmpDir();
    try {
      const { srcDir, dstDir } = setup(dir, { 'a.md': 'X', 'b.md': 'Y' }, { 'a.md': 'X' });
      const r = utils.diffFiles(srcDir, dstDir);
      assert.deepEqual(r.added, ['b.md']);
      assert.deepEqual(r.unchanged, ['a.md']);
    } finally { rmRf(dir); }
  });

  test('modified content: classified as modified', () => {
    const dir = tmpDir();
    try {
      const { srcDir, dstDir } = setup(dir, { 'a.md': 'NEW' }, { 'a.md': 'OLD' });
      const r = utils.diffFiles(srcDir, dstDir);
      assert.deepEqual(r.modified, ['a.md']);
      assert.deepEqual(r.unchanged, []);
    } finally { rmRf(dir); }
  });

  test('file only in dest: classified as missing', () => {
    const dir = tmpDir();
    try {
      const { srcDir, dstDir } = setup(dir, {}, { 'a.md': 'X' });
      const r = utils.diffFiles(srcDir, dstDir);
      assert.deepEqual(r.missing, ['a.md']);
    } finally { rmRf(dir); }
  });

  test('both empty: all categories empty', () => {
    const dir = tmpDir();
    try {
      const { srcDir, dstDir } = setup(dir, {}, {});
      const r = utils.diffFiles(srcDir, dstDir);
      assert.deepEqual(r.added, []);
      assert.deepEqual(r.modified, []);
      assert.deepEqual(r.unchanged, []);
      assert.deepEqual(r.missing, []);
    } finally { rmRf(dir); }
  });
});

// ---------------------------------------------------------------------------
// COMPONENTS / MANIFEST_FILE
// ---------------------------------------------------------------------------

describe('COMPONENTS', () => {
  test('every pre-shipped component has src, label, group fields', () => {
    for (const [key, comp] of Object.entries(utils.COMPONENTS)) {
      if (comp.kind !== 'pre-shipped') continue;
      assert.ok(comp.src, `${key} missing src`);
      assert.ok(comp.label, `${key} missing label`);
      assert.ok(comp.group, `${key} missing group`);
    }
  });

  test('all pre-shipped component sources point under .claude/', () => {
    for (const [key, comp] of Object.entries(utils.COMPONENTS)) {
      if (comp.kind !== 'pre-shipped') continue;
      assert.match(comp.src, /^\.claude\//, `${key}.src does not start with .claude/`);
    }
  });

  test('every project-generated component has label, group, items', () => {
    for (const [key, comp] of Object.entries(utils.COMPONENTS)) {
      if (comp.kind !== 'project-generated') continue;
      assert.ok(comp.label, `${key} missing label`);
      assert.ok(comp.group, `${key} missing group`);
      assert.ok(comp.items, `${key} missing items`);
    }
  });
});

describe('MANIFEST_FILE constant', () => {
  test('is .p-replicator.json', () => {
    assert.equal(utils.MANIFEST_FILE, '.p-replicator.json');
  });
});

// ---------------------------------------------------------------------------
// SSOT: COMPONENTS.items (single source of truth for component names)
// ---------------------------------------------------------------------------

describe('COMPONENTS.items SSOT', () => {
  test('every component declares an items map', () => {
    for (const [key, comp] of Object.entries(utils.COMPONENTS)) {
      assert.ok(comp.items, `${key} missing items`);
      assert.equal(typeof comp.items, 'object', `${key}.items is not an object`);
      assert.ok(Object.keys(comp.items).length > 0, `${key}.items is empty`);
    }
  });

  test('item counts: 10 skills, 11 commands, 4 agents, 6 rules, 1 settings', () => {
    assert.equal(Object.keys(utils.COMPONENTS.skills.items).length, 10, 'skills count');
    assert.equal(Object.keys(utils.COMPONENTS.commands.items).length, 11, 'commands count (post v1.4: + 9 generic commands)');
    assert.equal(Object.keys(utils.COMPONENTS.agents.items).length, 4, 'agents count');
    assert.equal(Object.keys(utils.COMPONENTS.rules.items).length, 6, 'rules count (post v1.4: + 3 generic rules; + docker-ports)');
    assert.ok(utils.COMPONENTS.settings, 'settings component group added in v1.4');
    assert.equal(Object.keys(utils.COMPONENTS.settings.items).length, 1, 'settings.json count');
  });

  test('v1.4 generic commands present in items', () => {
    const generic = ['start', 'plan', 'feature', 'go', 'run', 'next', 'docs', 'deploy', 'myinsights'];
    for (const cmd of generic) {
      assert.ok(cmd in utils.COMPONENTS.commands.items,
        `${cmd} should be in COMPONENTS.commands.items (added in v1.4)`);
    }
  });

  test('v1.4 generic rules present in items', () => {
    const generic = ['git-workflow', 'insights-capture', 'feature-lifecycle'];
    for (const rule of generic) {
      assert.ok(rule in utils.COMPONENTS.rules.items,
        `${rule} should be in COMPONENTS.rules.items (added in v1.4)`);
    }
  });

  test('every item has a non-empty string description', () => {
    for (const [groupKey, comp] of Object.entries(utils.COMPONENTS)) {
      for (const [name, desc] of Object.entries(comp.items)) {
        assert.equal(typeof desc, 'string', `${groupKey}.${name} desc not string`);
        assert.ok(desc.length > 0, `${groupKey}.${name} desc empty`);
      }
    }
  });

  test('expected canonical names present in items', () => {
    const expectedSkills = [
      'explore', 'sparc-prd-mini', 'goap-research-ed25519',
      'problem-solver-enhanced', 'requirements-validator',
      'brutal-honesty-review', 'cc-toolkit-generator-enhanced',
      'reverse-engineering-unicorn', 'pipeline-forge', 'knowledge-extractor',
    ];
    for (const skill of expectedSkills) {
      assert.ok(skill in utils.COMPONENTS.skills.items, `missing skill: ${skill}`);
    }

    assert.ok('replicate' in utils.COMPONENTS.commands.items);
    assert.ok('harvest' in utils.COMPONENTS.commands.items);

    const expectedAgents = [
      'replicate-coordinator', 'product-discoverer',
      'doc-validator', 'harvest-coordinator',
    ];
    for (const a of expectedAgents) {
      assert.ok(a in utils.COMPONENTS.agents.items, `missing agent: ${a}`);
    }

    assert.ok('replicate-pipeline' in utils.COMPONENTS.rules.items);
    assert.ok('skill-interface-protocol' in utils.COMPONENTS.rules.items);
  });
});

// ---------------------------------------------------------------------------
// v1.4.1: kind discrimination + project-generated SSOT + cross-platform hooks
// ---------------------------------------------------------------------------

describe('COMPONENTS.kind SSOT (v1.4.1)', () => {
  test('every component has kind: pre-shipped | project-generated', () => {
    for (const [key, comp] of Object.entries(utils.COMPONENTS)) {
      assert.ok(
        ['pre-shipped', 'project-generated'].includes(comp.kind),
        `${key}.kind must be pre-shipped or project-generated, got ${JSON.stringify(comp.kind)}`
      );
    }
  });

  test('pre-shipped groups include hooks (post v1.4.1)', () => {
    const preShipped = Object.entries(utils.COMPONENTS)
      .filter(([, c]) => c.kind === 'pre-shipped')
      .map(([k]) => k)
      .sort();
    assert.ok(preShipped.includes('hooks'), 'hooks group added in v1.4.1');
    assert.ok(preShipped.length >= 6, `expected ≥ 6 pre-shipped groups, got ${preShipped.length}`);
  });

  test('project-generated groups added (post v1.4.1)', () => {
    const projectGen = Object.entries(utils.COMPONENTS)
      .filter(([, c]) => c.kind === 'project-generated')
      .map(([k]) => k);
    assert.ok(projectGen.length >= 3,
      `expected ≥ 3 project-generated groups, got ${projectGen.length}: ${projectGen.join(',')}`);
  });

  test('hooks group items include 4 v1.4.1 + 2 v1.5.0 scripts', () => {
    assert.ok(utils.COMPONENTS.hooks, 'hooks component should exist');
    const hookKeys = Object.keys(utils.COMPONENTS.hooks.items);
    // v1.4.1 baseline: 4 cross-platform scripts
    for (const k of ['autocommit-insights', 'autocommit-plans', 'autocommit-roadmap', 'session-insights']) {
      assert.ok(hookKeys.includes(k), `${k} should be present (v1.4.1 baseline)`);
    }
    // v1.5.0 added: statusline + state-update
    assert.ok(hookKeys.includes('statusline'), 'statusline added in v1.5.0');
    assert.ok(hookKeys.includes('state-update'), 'state-update added in v1.5.0');
  });
});

describe('utils.getItemRelativePath (v1.4.1 helper)', () => {
  test('handles isFile components (settings.json)', () => {
    const comp = utils.COMPONENTS.settings;
    assert.equal(utils.getItemRelativePath(comp, 'settings.json'), '.claude/settings.json');
  });

  test('skills: <src>/<name>/SKILL.md', () => {
    const result = utils.getItemRelativePath(utils.COMPONENTS.skills, 'explore');
    assert.match(result.replace(/\\/g, '/'), /\.claude\/skills\/explore\/SKILL\.md/);
  });

  test('commands: <src>/<name>.md', () => {
    const result = utils.getItemRelativePath(utils.COMPONENTS.commands, 'run');
    assert.match(result.replace(/\\/g, '/'), /\.claude\/commands\/run\.md/);
  });

  test('hooks: <src>/<name>.cjs', () => {
    const result = utils.getItemRelativePath(utils.COMPONENTS.hooks, 'session-insights');
    assert.match(result.replace(/\\/g, '/'), /\.claude\/hooks\/session-insights\.cjs/);
  });

  test('project-generated: items keys are full paths', () => {
    const [, comp] = Object.entries(utils.COMPONENTS)
      .find(([, c]) => c.kind === 'project-generated') || [];
    assert.ok(comp, 'should have at least one project-generated component');
    const sampleKey = Object.keys(comp.items)[0];
    const result = utils.getItemRelativePath(comp, sampleKey);
    assert.equal(result, sampleKey,
      `project-generated items use full paths as keys; got '${result}' for '${sampleKey}'`);
  });
});

// ---------------------------------------------------------------------------
// v1.4.2: settings.json merge (preserve user customizations)
// ---------------------------------------------------------------------------

describe('utils.mergeSettingsJson (v1.4.2)', () => {
  test('null existing returns template untouched', () => {
    const tpl = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'x' }] }] } };
    assert.deepEqual(utils.mergeSettingsJson(null, tpl), tpl);
  });

  test('null template returns existing untouched', () => {
    const ex = { hooks: { Stop: [] } };
    assert.deepEqual(utils.mergeSettingsJson(ex, null), ex);
  });

  test('preserves user-only event types (e.g., PreToolUse)', () => {
    const ex = { hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ command: 'audit' }] }] } };
    const tpl = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'auto' }] }] } };
    const merged = utils.mergeSettingsJson(ex, tpl);
    assert.ok(merged.hooks.PreToolUse, 'user PreToolUse preserved');
    assert.ok(merged.hooks.Stop, 'template Stop added');
    assert.equal(merged.hooks.PreToolUse[0].hooks[0].command, 'audit');
  });

  test('merges hooks within same event + matcher, de-duped by command string', () => {
    const ex = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'user-custom' }] }] },
    };
    const tpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'template-default' }] }] },
    };
    const merged = utils.mergeSettingsJson(ex, tpl);
    const cmds = merged.hooks.Stop[0].hooks.map((h) => h.command);
    assert.ok(cmds.includes('user-custom'), 'user hook preserved');
    assert.ok(cmds.includes('template-default'), 'template hook added');
    assert.equal(cmds.length, 2, 'no duplication');
  });

  test('does NOT duplicate template hook if user already has identical command', () => {
    const ex = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'same' }] }] } };
    const tpl = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'same' }] }] } };
    const merged = utils.mergeSettingsJson(ex, tpl);
    assert.equal(merged.hooks.Stop[0].hooks.length, 1, 'no duplication of identical commands');
  });

  test('different matchers are kept separately within same event', () => {
    const ex = { hooks: { Stop: [{ matcher: 'Bash', hooks: [{ command: 'audit' }] }] } };
    const tpl = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'auto' }] }] } };
    const merged = utils.mergeSettingsJson(ex, tpl);
    assert.equal(merged.hooks.Stop.length, 2, 'two distinct matchers');
  });

  test('preserves user top-level fields not in template', () => {
    const ex = { customField: 'preserved', hooks: {} };
    const tpl = { hooks: { Stop: [] } };
    const merged = utils.mergeSettingsJson(ex, tpl);
    assert.equal(merged.customField, 'preserved');
  });
});

// ---------------------------------------------------------------------------
// v1.4.3: removeOrphanHooks (orphan detection on upgrade)
// ---------------------------------------------------------------------------

describe('utils.removeOrphanHooks (v1.4.3)', () => {
  test('returns existing unchanged when oldTemplate is null (first upgrade)', () => {
    const ex = { hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'A' }] }] } };
    const result = utils.removeOrphanHooks(ex, null, { hooks: {} });
    assert.deepEqual(result, ex);
  });

  test('removes hook that was in oldTemplate but not in newTemplate (orphan)', () => {
    const existing = {
      hooks: {
        Stop: [{
          matcher: '*',
          hooks: [
            { command: 'OLD_DEFAULT' },
            { command: 'USER_CUSTOM' },
          ],
        }],
      },
    };
    const oldTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'OLD_DEFAULT' }] }] },
    };
    const newTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'NEW_DEFAULT' }] }] },
    };

    const cleaned = utils.removeOrphanHooks(existing, oldTpl, newTpl);
    const cmds = cleaned.hooks.Stop[0].hooks.map((h) => h.command);
    assert.ok(!cmds.includes('OLD_DEFAULT'),
      'OLD_DEFAULT (was default, no longer shipped) should be removed');
    assert.ok(cmds.includes('USER_CUSTOM'),
      'USER_CUSTOM (never in oldTemplate) preserved');
  });

  test('keeps hook that is still in newTemplate (not an orphan)', () => {
    const existing = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'STILL_THERE' }] }] },
    };
    const oldTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'STILL_THERE' }] }] },
    };
    const newTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'STILL_THERE' }] }] },
    };
    const cleaned = utils.removeOrphanHooks(existing, oldTpl, newTpl);
    const cmds = cleaned.hooks.Stop[0].hooks.map((h) => h.command);
    assert.ok(cmds.includes('STILL_THERE'));
  });

  test('user-modified default (different command-string) preserved as user-added', () => {
    const existing = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'modified-by-user' }] }] },
    };
    const oldTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'original-default' }] }] },
    };
    const newTpl = {
      hooks: { Stop: [{ matcher: '*', hooks: [{ command: 'original-default' }] }] },
    };
    const cleaned = utils.removeOrphanHooks(existing, oldTpl, newTpl);
    const cmds = cleaned.hooks.Stop[0].hooks.map((h) => h.command);
    // 'modified-by-user' was not in oldTpl, so not orphan
    assert.ok(cmds.includes('modified-by-user'),
      'user-modified default treated as user-added; preserved');
  });

  test('does not crash on missing hooks property', () => {
    assert.doesNotThrow(() =>
      utils.removeOrphanHooks({}, { hooks: { Stop: [] } }, { hooks: {} })
    );
  });
});

// ---------------------------------------------------------------------------
// v1.5.0: statusline metadata in COMPONENTS.hooks.items
// ---------------------------------------------------------------------------

describe('COMPONENTS.hooks (v1.5.0)', () => {
  test('hooks group includes statusline + state-update scripts', () => {
    const hookKeys = Object.keys(utils.COMPONENTS.hooks.items).sort();
    assert.ok(hookKeys.includes('statusline'),
      'statusline.cjs added in v1.5.0');
    assert.ok(hookKeys.includes('state-update'),
      'state-update.cjs added in v1.5.0');
  });

  test('hooks group has at least 6 items (4 v1.4.1 + 2 v1.5.0)', () => {
    const hookCount = Object.keys(utils.COMPONENTS.hooks.items).length;
    assert.ok(hookCount >= 6,
      `expected >= 6 hook scripts (post v1.5.0), got ${hookCount}`);
  });
});
