'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const TEMPLATES = path.join(PKG_DIR, 'templates');
const BASELINE = path.join(__dirname, 'baseline.json');

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      walk(full, base, out);
    } else {
      const rel = path.relative(base, full).split(path.sep).join('/');
      out.push({ rel, full });
    }
  }
  return out;
}

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

describe('snapshot: templates/', () => {
  test('baseline.json exists', () => {
    assert.ok(
      fs.existsSync(BASELINE),
      'tests/snapshot/baseline.json missing — run `npm run snapshot:baseline` to create it'
    );
  });

  test('current templates match recorded baseline (no drift)', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    const current = walk(TEMPLATES);
    const currentMap = {};
    for (const { rel, full } of current) {
      currentMap[rel] = sha256(full);
    }

    const baselineKeys = Object.keys(baseline.files);
    const currentKeys = Object.keys(currentMap);

    const missing = baselineKeys.filter((k) => !(k in currentMap));
    const added = currentKeys.filter((k) => !(k in baseline.files));
    const changed = baselineKeys.filter(
      (k) => k in currentMap && baseline.files[k] !== currentMap[k]
    );

    if (missing.length || added.length || changed.length) {
      const lines = [];
      if (missing.length) {
        lines.push(`Missing (${missing.length}):\n  ${missing.slice(0, 20).join('\n  ')}`);
      }
      if (added.length) {
        lines.push(`Added (${added.length}):\n  ${added.slice(0, 20).join('\n  ')}`);
      }
      if (changed.length) {
        lines.push(`Changed (${changed.length}):\n  ${changed.slice(0, 20).join('\n  ')}`);
      }
      lines.push('');
      lines.push('If these template changes are intentional, regenerate the baseline:');
      lines.push('  npm run snapshot:baseline');

      assert.fail(lines.join('\n'));
    }

    assert.equal(
      currentKeys.length,
      baselineKeys.length,
      `file count mismatch: baseline=${baselineKeys.length}, current=${currentKeys.length}`
    );
  });

  test('every template file is non-empty', () => {
    const current = walk(TEMPLATES);
    for (const { rel, full } of current) {
      const size = fs.statSync(full).size;
      assert.ok(size > 0, `${rel} is empty (${size} bytes)`);
    }
  });
});
