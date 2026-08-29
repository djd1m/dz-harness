'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, cyan, bold, dim,
  info, success, warn, error: logError,
  readManifest, fileExists,
  MANIFEST_FILE,
} = require('../utils');

function run(options) {
  const { force, dryRun, targetDir } = options;

  // ── a) Check for existing installation ──────────────────────────────────
  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError('P-Replicator is not installed in this directory.');
    info('Nothing to remove.');
    process.exit(1);
  }

  info(`Found installation v${bold(manifest.version)} (${manifest.installedAt})`);
  console.log('');

  // ── b) List files to remove ─────────────────────────────────────────────
  const files = manifest.files || [];
  const existingFiles = files.filter((f) => fileExists(path.join(targetDir, f)));

  console.log(bold('Files to remove:'));
  for (const f of existingFiles) {
    console.log(`  ${red('\u2717')} ${f}`);
  }
  console.log('');
  console.log(`  ${dim('Total:')} ${existingFiles.length} files`);
  console.log('');

  if (existingFiles.length === 0) {
    warn('No files found to remove (already cleaned up?).');
    // Dry run is a strict no-op — must NOT unregister the install (the P2 bug: this ran BEFORE the
    // dryRun guard below, so `remove --dry-run` deleted the manifest on the already-cleaned path).
    if (dryRun) {
      warn(`Dry run — would remove ${MANIFEST_FILE} to unregister the (already-empty) install. Nothing written.`);
      process.exit(0);
    }
    const manifestPath = path.join(targetDir, MANIFEST_FILE);
    if (fileExists(manifestPath)) {
      fs.unlinkSync(manifestPath);
      info(`Removed ${MANIFEST_FILE}`);
    }
    process.exit(0);
  }

  if (dryRun) {
    warn('Dry run \u2014 no files were removed.');
    process.exit(0);
  }

  // ── c) Remove files ────────────────────────────────────────────────────
  let removed = 0;
  const failed = [];
  for (const f of existingFiles) {
    const fullPath = path.join(targetDir, f);
    try {
      fs.unlinkSync(fullPath);
      removed++;
    } catch (err) {
      warn(`Could not remove: ${f} (${err.message})`);
      failed.push(f);
    }
  }

  // ── d) Clean up empty directories ──────────────────────────────────────
  const dirs = new Set();
  for (const f of existingFiles) {
    let dir = path.dirname(f);
    while (dir && dir !== '.') {
      dirs.add(dir);
      dir = path.dirname(dir);
    }
  }

  // Sort deepest first for safe removal
  const sortedDirs = [...dirs].sort((a, b) => b.split(path.sep).length - a.split(path.sep).length);
  for (const dir of sortedDirs) {
    const fullDir = path.join(targetDir, dir);
    try {
      const entries = fs.readdirSync(fullDir);
      if (entries.length === 0) {
        fs.rmdirSync(fullDir);
      }
    } catch {
      // Directory doesn't exist or not empty — skip
    }
  }

  // ── e) Remove manifest ─────────────────────────────────────────────────
  // P3: only unregister the install when EVERY tracked file was actually removed. If some failed
  // (permissions, locked, read-only mount), keep the manifest so the survivors stay tracked and a
  // later `remove`/`doctor` can still see + finish them — deleting it would strand them as orphans.
  const manifestPath = path.join(targetDir, MANIFEST_FILE);
  if (fileExists(manifestPath)) {
    if (failed.length > 0) {
      warn(`${failed.length} file(s) could not be removed — keeping ${MANIFEST_FILE} so they stay tracked (re-run remove after fixing permissions).`);
    } else {
      fs.unlinkSync(manifestPath);
    }
  }

  console.log('');
  success(`Removed ${removed} files.`);
  console.log('');
  console.log(bold('Note:'));
  console.log('  Project-specific files were NOT removed:');
  console.log(`  ${dim('\u2022')} docs/ (SPARC documentation)`);
  console.log(`  ${dim('\u2022')} CLAUDE.md, DEVELOPMENT_GUIDE.md`);
  console.log(`  ${dim('\u2022')} Generated commands (/start, /feature, /plan, etc.)`);
  console.log(`  ${dim('\u2022')} docker-compose.yml, Dockerfile`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
