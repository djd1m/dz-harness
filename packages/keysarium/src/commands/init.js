'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, yellow, cyan, bold, dim,
  info, success, warn, error: logError, step,
  copyDirRecursive, copyDirTracked, fileExists, readJSON,
  ensureDir, getRelativePaths,
  createManifest, writeManifest, getTemplatesDir,
  COMPONENTS, MANIFEST_FILE,
} = require('../utils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Determine which component keys to install based on CLI flags.
 *   Default:  core group + lib
 *   --minimal: core group only (no lib)
 *   --with-docs: add docs group
 */
function resolveComponents(options) {
  const { minimal, withDocs } = options;
  const coreKeys = ['skills', 'commands', 'rules', 'shards', 'agents', 'hooks', 'claude_md', 'harvest'];
  const keys = [...coreKeys];

  if (!minimal) {
    keys.push('lib');
  }

  if (withDocs) {
    keys.push('docs');
  }

  return keys.filter((k) => COMPONENTS[k]);
}

/**
 * Copy a single component from templates to the target directory.
 * Returns array of relative file paths that were installed.
 */
function installComponent(comp, templatesDir, targetDir, force) {
  const src = path.join(templatesDir, comp.src);
  const dest = path.join(targetDir, comp.src);

  if (!fileExists(src)) {
    warn(`Template source not found: ${comp.src} — skipping.`);
    return [];
  }

  if (comp.isFile) {
    if (fileExists(dest) && !force) {
      // Preserve a user-modified file (e.g. their own CLAUDE.md / settings.json)
      // when re-installing without --force. It is still manifest-tracked because
      // it originates from the template.
      return [comp.src];
    }
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return [comp.src];
  }

  // Track files via the TEMPLATE source — never a scan of the destination —
  // so user-created files under dest are neither recorded nor (later) removed.
  const { copied, skipped } = copyDirTracked(src, dest, force);
  return [...copied, ...skipped].map((rel) => path.join(comp.src, rel));
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/keysarium init` — Install the toolkit into the target project.
 *
 * @param {object} options
 * @param {boolean} options.minimal   — Install only core (no lib)
 * @param {boolean} options.force     — Overwrite existing installation
 * @param {boolean} options.withDocs  — Include docs/ directory
 * @param {boolean} options.dryRun    — Preview without writing anything
 * @param {string}  options.targetDir — Destination project root
 */
async function run(options) {
  const { force, dryRun, targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check for existing installation ──────────────────────────────────
  if (fileExists(manifestPath)) {
    if (!force) {
      warn('Keysarium is already installed in this directory.');
      info(`Run ${cyan('npx @dzhechkov/keysarium update')} to update, or use ${yellow('--force')} to overwrite.`);
      process.exit(1);
    }
    warn('Existing installation found — overwriting (--force).');
  }

  // ── b) Determine components ─────────────────────────────────────────────
  const componentKeys = resolveComponents(options);
  const templatesDir = getTemplatesDir();

  // ── c) Show plan ────────────────────────────────────────────────────────
  console.log('');
  info(bold('Installation plan:'));
  console.log('');

  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('+')} ${comp.label}`);
  }

  console.log('');

  if (dryRun) {
    warn('Dry run — no files were written.');
    process.exit(0);
  }

  // ── d) Install components ───────────────────────────────────────────────
  const totalComponents = componentKeys.length;
  const installedFiles = [];

  for (let i = 0; i < totalComponents; i++) {
    const key = componentKeys[i];
    const comp = COMPONENTS[key];
    step(i + 1, totalComponents, `Installing ${comp.label}...`);

    const files = installComponent(comp, templatesDir, targetDir, force);
    installedFiles.push(...files);
  }

  // ── e) Create researches/ directory ─────────────────────────────────────
  const researchesDir = path.join(targetDir, 'researches');
  ensureDir(researchesDir);
  const gitkeepPath = path.join(researchesDir, '.gitkeep');
  if (!fileExists(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '', 'utf8');
  }
  info('Created researches/ directory with .gitkeep');

  // ── f) Write manifest ──────────────────────────────────────────────────
  const pkgPath = path.resolve(__dirname, '../../package.json');
  const pkg = readJSON(pkgPath);
  const version = pkg ? pkg.version : '0.0.0';

  const manifest = createManifest(version, componentKeys, installedFiles.sort());
  writeManifest(targetDir, manifest);
  info('Created .keysarium.json manifest');

  // ── g) Success summary ─────────────────────────────────────────────────
  console.log('');
  success(bold('Installation complete!'));
  console.log('');

  console.log(bold('Installed components:'));
  for (const key of componentKeys) {
    const comp = COMPONENTS[key];
    console.log(`  ${green('\u2713')} ${comp.label}`);
  }

  console.log('');
  console.log(bold('Next steps:'));
  console.log(`  1. Open ${cyan('Claude Code')} in this directory`);
  console.log(`  2. Run ${cyan('/casarium [your case description]')}`);
  console.log(`  3. Follow the 7-phase pipeline`);
  console.log('');
  console.log(bold('Available commands:'));
  console.log(`  ${cyan('/casarium')}          ${dim('\u2014 Full pipeline')}`);
  console.log(`  ${cyan('/new-research')}      ${dim('\u2014 New research')}`);
  console.log(`  ${cyan('/parallel-research')} ${dim('\u2014 Multiple cases in parallel')}`);
  console.log(`  ${cyan('/harvest')}           ${dim('\u2014 Extract knowledge')}`);
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
