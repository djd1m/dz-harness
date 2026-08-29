'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, cyan, bold, dim,
  info, warn, error: logError,
  fileExists, readManifest, getRelativePaths,
  COMPONENTS, MANIFEST_FILE,
} = require('../utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Count files on disk for a given component in the target directory.
 * Returns the number of files that actually exist.
 */
function countComponentFiles(comp, targetDir) {
  const destPath = path.join(targetDir, comp.src);

  if (!fileExists(destPath)) {
    return 0;
  }

  if (comp.isFile) {
    return 1;
  }

  try {
    const stat = fs.statSync(destPath);
    if (stat.isDirectory()) {
      return getRelativePaths(destPath).length;
    }
  } catch {
    return 0;
  }

  return 0;
}

/**
 * Pad or truncate a string to a fixed width.
 */
function padRight(str, width) {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/keysarium list` — Show installed components and their status.
 *
 * @param {object} options
 * @param {string}  options.targetDir — Project root directory
 */
async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read manifest ───────────────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    warn('Keysarium is not installed in this directory.');
    info(`Run ${cyan('npx @dzhechkov/keysarium init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError('Failed to read .keysarium.json — file may be corrupted.');
    process.exit(1);
  }

  const installedKeys = new Set(manifest.components || []);

  // ── Header ─────────────────────────────────────────────────────────────
  console.log('');
  console.log(bold(`@dzhechkov/keysarium v${manifest.version}`));
  console.log(`Installed: ${manifest.installedAt ? manifest.installedAt.split('T')[0] : 'unknown'}`);
  if (manifest.updatedAt) {
    console.log(`Updated:   ${manifest.updatedAt.split('T')[0]}`);
  }
  console.log('');

  // ── b) Component table ─────────────────────────────────────────────────
  const nameWidth = 28;
  const statusWidth = 18;

  console.log(
    padRight(bold('Component'), nameWidth) +
    padRight(bold('Status'), statusWidth) +
    bold('Files')
  );
  console.log('\u2500'.repeat(55));

  const allKeys = Object.keys(COMPONENTS);
  let totalFiles = 0;

  for (const key of allKeys) {
    const comp = COMPONENTS[key];
    const isInstalled = installedKeys.has(key);

    // ── c) Count actual files on disk ───────────────────────────────────
    let fileCount = 0;
    let statusText;

    if (isInstalled) {
      fileCount = countComponentFiles(comp, targetDir);
      totalFiles += fileCount;

      if (fileCount > 0) {
        statusText = green('\u2713 OK');
      } else {
        statusText = red('\u2717 Missing');
      }
    } else {
      statusText = dim('\u2717 Not installed');
    }

    // Extract short label (before the parenthetical)
    const shortLabel = comp.label.split('(')[0].trim();
    const filesStr = isInstalled ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : '';

    console.log(
      padRight(shortLabel, nameWidth) +
      padRight(statusText, statusWidth + 9) + // +9 to account for ANSI escape codes
      dim(filesStr)
    );
  }

  console.log('\u2500'.repeat(55));
  console.log(
    padRight(bold('Total'), nameWidth) +
    padRight('', statusWidth) +
    bold(`${totalFiles} files`)
  );
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
