#!/usr/bin/env node
'use strict';

/**
 * update-baseline.js
 *
 * Computes SHA-256 of every file under templates/ and writes the result to
 * tests/snapshot/baseline.json. Run after intentional template changes:
 *
 *   npm run snapshot:baseline
 *
 * The L3 snapshot test (tests/snapshot/templates.test.js) compares the live
 * templates/ tree against this baseline and fails on any drift.
 */

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
      // Forward slashes — keeps baseline.json identical across Win/Linux/macOS.
      const rel = path.relative(base, full).split(path.sep).join('/');
      out.push({ rel, full });
    }
  }
  return out;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function main() {
  if (!fs.existsSync(TEMPLATES)) {
    console.error(`[snapshot] templates/ not found at ${TEMPLATES}`);
    console.error('[snapshot] templates/ ships with this package — a missing one means a broken');
    console.error('[snapshot] checkout, not a missing build step. Restore it from git.');
    process.exit(1);
  }

  const files = walk(TEMPLATES);
  const sorted = files.sort((a, b) => a.rel.localeCompare(b.rel));
  const fileMap = {};
  for (const { rel, full } of sorted) {
    fileMap[rel] = sha256(full);
  }

  const baseline = {
    generatedAt: new Date().toISOString(),
    totalFiles: sorted.length,
    files: fileMap,
  };

  fs.writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  console.log(`[snapshot] Wrote ${sorted.length} file hashes to ${path.relative(PKG_DIR, BASELINE)}`);
}

main();
