'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PKG_DIR = path.resolve(__dirname, '..', '..');
const TEMPLATES = path.join(PKG_DIR, 'templates');
const BASELINE = path.join(__dirname, 'baseline.json');
const DETECTION_LADDER = '.claude/rules/cost-of-detection-ladder.md';
const PACK_LADDER = `templates/${DETECTION_LADDER}`;
const MANIFEST = path.join(PKG_DIR, '.dz-manifest.json');
const SBOM = path.join(PKG_DIR, 'sbom.json');

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

function integrityProblems(signed, sbom, file, digest) {
  const problems = [];
  const manifestEntry = signed.manifest.files.find((entry) => entry.path === file);
  if (!manifestEntry) problems.push(`manifest missing ${file}`);
  else if (manifestEntry.sha256 !== digest) problems.push(`manifest digest mismatch for ${file}`);

  const component = sbom.components.find((entry) => entry.name === file);
  if (!component) problems.push(`SBOM missing ${file}`);
  else if (component.hashes.find((entry) => entry.alg === 'SHA-256')?.content !== digest) {
    problems.push(`SBOM digest mismatch for ${file}`);
  }
  return problems;
}

describe('snapshot: templates/', () => {
  test('baseline.json exists', () => {
    assert.ok(
      fs.existsSync(BASELINE),
      'tests/snapshot/baseline.json missing — run `npm run snapshot:baseline` to create it'
    );
  });

  test('baseline explicitly registers the consumer detection ladder', () => {
    const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    assert.match(
      baseline.files[DETECTION_LADDER] || '',
      /^[a-f0-9]{64}$/,
      `${DETECTION_LADDER} must have a SHA-256 entry in baseline.json`
    );
  });

  test('signed manifest and SBOM register the settled detection-ladder digest', () => {
    const digest = sha256(path.join(TEMPLATES, DETECTION_LADDER));
    const signed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
    const sbom = JSON.parse(fs.readFileSync(SBOM, 'utf8'));
    assert.deepEqual(integrityProblems(signed, sbom, PACK_LADDER, digest), []);

    const omitted = JSON.parse(JSON.stringify(signed));
    omitted.manifest.files = omitted.manifest.files.filter((entry) => entry.path !== PACK_LADDER);
    assert.deepEqual(integrityProblems(omitted, sbom, PACK_LADDER, digest),
      [`manifest missing ${PACK_LADDER}`],
      'removing the real manifest entry must fire the integrity safeguard');

    const changed = JSON.parse(JSON.stringify(sbom));
    const component = changed.components.find((entry) => entry.name === PACK_LADDER);
    component.hashes.find((entry) => entry.alg === 'SHA-256').content = '0'.repeat(64);
    assert.deepEqual(integrityProblems(signed, changed, PACK_LADDER, digest),
      [`SBOM digest mismatch for ${PACK_LADDER}`],
      'changing the real SBOM digest must fire the integrity safeguard');
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
