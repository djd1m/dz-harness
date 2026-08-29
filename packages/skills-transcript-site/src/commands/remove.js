'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  fileExists, readManifest,
  MANIFEST_FILE,
} = require('../utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prompt the user for confirmation via readline.
 * Resolves to true if user answers 'y' or 'yes', false otherwise.
 */
function confirmPrompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Remove a file if it exists. Returns true if removed, false otherwise.
 */
function removeFile(filePath) {
  try {
    if (fileExists(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    warn(`Could not remove ${filePath}: ${err.message}`);
  }
  return false;
}

/**
 * Remove a directory if it exists and is empty.
 * Walks up the directory tree removing empty parents up to (but not including) stopDir.
 */
function removeEmptyDirs(dirPath, stopDir) {
  try {
    let current = dirPath;
    while (current !== stopDir && current !== path.dirname(current)) {
      if (!fileExists(current)) {
        current = path.dirname(current);
        continue;
      }

      const stat = fs.statSync(current);
      if (!stat.isDirectory()) break;

      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  } catch {
    // Silently ignore — directory cleanup is best-effort
  }
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/skills-transcript-site remove` — Clean uninstall of the skill pack.
 *
 * @param {object} options
 * @param {boolean} options.force     — Skip confirmation prompt
 * @param {boolean} options.dryRun    — Preview without removing anything
 * @param {string}  options.targetDir — Project root directory
 */
async function run(options) {
  const { force, dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read manifest ───────────────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    warn('Transcript Site skill pack is not installed in this directory -- nothing to remove.');
    process.exit(0);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} -- file may be corrupted.`);
    info(`You can manually delete ${MANIFEST_FILE} and the installed files.`);
    process.exit(1);
  }

  const files = manifest.files || [];
  const components = manifest.components || [];

  // ── b) Show what will be removed ───────────────────────────────────────
  console.log('');
  info(bold('The following Transcript Site components will be removed:'));
  console.log('');

  for (const key of components) {
    console.log(`  ${red('-')} ${key}`);
  }

  console.log('');
  console.log(`  ${dim(`${files.length} file(s) total`)}`);
  console.log(`  ${dim(`+ ${MANIFEST_FILE} manifest`)}`);
  console.log('');

  // Check for keysarium presence
  const keysariumPath = path.join(targetDir, '.keysarium.json');
  if (fileExists(keysariumPath)) {
    info('@dzhechkov/keysarium detected -- shared directories will be preserved.');
  }

  if (dryRun) {
    console.log(bold('Files to be removed:'));
    for (const relPath of files) {
      const absPath = path.join(targetDir, relPath);
      const exists = fileExists(absPath);
      const marker = exists ? red('- DEL') : dim('- N/A');
      console.log(`  ${marker}  ${relPath}`);
    }
    console.log(`  ${red('- DEL')}  ${MANIFEST_FILE}`);
    console.log('');
    warn('Dry run -- no files were removed.');
    process.exit(0);
  }

  // ── c) Confirm unless --force ──────────────────────────────────────────
  if (!force) {
    const confirmed = await confirmPrompt(
      yellow('This will remove all Transcript Site skill pack files. Continue? (y/N) ')
    );

    if (!confirmed) {
      info('Aborted -- no files were removed.');
      process.exit(0);
    }
  }

  // ── d) Remove files ────────────────────────────────────────────────────
  let removedCount = 0;
  let skippedCount = 0;
  const dirsToCheck = new Set();

  for (let i = 0; i < files.length; i++) {
    const relPath = files[i];
    const absPath = path.join(targetDir, relPath);

    step(i + 1, files.length, `Removing ${relPath}`);

    if (removeFile(absPath)) {
      removedCount++;
      // Track parent directories for cleanup
      dirsToCheck.add(path.dirname(absPath));
    } else {
      skippedCount++;
    }
  }

  // Remove empty directories (bottom-up)
  const sortedDirs = Array.from(dirsToCheck).sort((a, b) => b.length - a.length);
  for (const dir of sortedDirs) {
    removeEmptyDirs(dir, targetDir);
  }

  // ── e) Remove manifest ─────────────────────────────────────────────────
  removeFile(manifestPath);
  info(`Removed ${MANIFEST_FILE} manifest`);

  // ── f) Summary ─────────────────────────────────────────────────────────
  console.log('');
  success(bold('Transcript Site skill pack removal complete!'));
  console.log(`  ${green('\u2713')} ${removedCount} file(s) removed`);
  if (skippedCount > 0) {
    console.log(`  ${dim('-')} ${skippedCount} file(s) already missing (skipped)`);
  }
  console.log('');
  info(`To reinstall, run: ${cyan('@dzhechkov/skills-transcript-site init')}`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
