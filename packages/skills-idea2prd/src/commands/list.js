'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, cyan, bold, dim,
  info, warn, error: logError,
  fileExists, readManifest, getRelativePaths, getRelativePathsFiltered,
  COMPONENTS, MANIFEST_FILE, getComponentFilter,
} = require('../utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countComponentFiles(comp, targetDir) {
  const destPath = path.join(targetDir, comp.src);

  if (!fileExists(destPath)) {
    return 0;
  }

  try {
    const stat = fs.statSync(destPath);
    if (stat.isDirectory()) {
      const filterFn = getComponentFilter(comp);
      if (filterFn) {
        return getRelativePathsFiltered(destPath, filterFn).length;
      }
      return getRelativePaths(destPath).length;
    }
  } catch {
    return 0;
  }

  return 0;
}

function padRight(str, width) {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Read manifest ──────────────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    warn('Idea2PRD Manual skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-idea2prd init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    process.exit(1);
  }

  const installedKeys = new Set(manifest.components || []);

  // ── Header ────────────────────────────────────────────────────────────
  console.log('');
  console.log(bold(`@dzhechkov/skills-idea2prd v${manifest.version}`));
  console.log(`Installed: ${manifest.installedAt ? manifest.installedAt.split('T')[0] : 'unknown'}`);
  if (manifest.updatedAt) {
    console.log(`Updated:   ${manifest.updatedAt.split('T')[0]}`);
  }
  console.log('');

  // ── b) Component table ────────────────────────────────────────────────
  const nameWidth = 40;
  const statusWidth = 18;

  console.log(
    padRight(bold('Component'), nameWidth) +
    padRight(bold('Status'), statusWidth) +
    bold('Files')
  );
  console.log('\u2500'.repeat(68));

  const allKeys = Object.keys(COMPONENTS);
  let totalFiles = 0;

  for (const key of allKeys) {
    const comp = COMPONENTS[key];
    const isInstalled = installedKeys.has(key);

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

    const shortLabel = comp.label.split('(')[0].trim();
    const filesStr = isInstalled ? `${fileCount} file${fileCount !== 1 ? 's' : ''}` : '';
    const filterTag = comp.filter ? dim(` [${comp.filter}*]`) : '';

    console.log(
      padRight(shortLabel, nameWidth) +
      padRight(statusText, statusWidth + 9) +
      dim(filesStr) +
      filterTag
    );
  }

  console.log('\u2500'.repeat(68));
  console.log(
    padRight(bold('Total'), nameWidth) +
    padRight('', statusWidth) +
    bold(`${totalFiles} files`)
  );
  console.log('');

  // ── c) Integration info ───────────────────────────────────────────────
  const keysariumPath = path.join(targetDir, '.keysarium.json');
  if (fileExists(keysariumPath)) {
    info(`Keysarium integration: ${green('active')}`);
  }

  const btoPath = path.join(targetDir, '.skills-bto.json');
  if (fileExists(btoPath)) {
    info(`BTO integration: ${green('active')}`);
  }

  console.log('');
  process.exit(0);
}

module.exports = run;
module.exports.run = run;
