'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError,
  fileExists, readJSON, readManifest,
  MANIFEST_FILE, COMPONENTS,
} = require('../utils');

// ---------------------------------------------------------------------------
// Check definitions
// ---------------------------------------------------------------------------

/**
 * Run a single check. Returns { name, passed, detail, fix }.
 */
function check(name, fn) {
  try {
    const result = fn();
    return {
      name,
      passed: result.passed,
      detail: result.detail || '',
      fix: result.fix || '',
    };
  } catch (err) {
    return {
      name,
      passed: false,
      detail: `Exception: ${err.message}`,
      fix: 'Investigate the error above.',
    };
  }
}

/**
 * Check 1: Verify every file in manifest exists on disk.
 */
function checkFilesExist(manifest, targetDir) {
  return check('Files exist', () => {
    const files = manifest.files || [];
    const missing = [];

    for (const relPath of files) {
      const absPath = path.join(targetDir, relPath);
      if (!fileExists(absPath)) {
        missing.push(relPath);
      }
    }

    if (missing.length === 0) {
      return {
        passed: true,
        detail: `All ${files.length} manifest files present`,
      };
    }

    return {
      passed: false,
      detail: `${missing.length} file(s) missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
      fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore missing files.`,
    };
  });
}

/**
 * Check 2: Transcript Site skill directory has SKILL.md.
 */
function checkSkillComplete(targetDir) {
  return check('Transcript Site skill pack', () => {
    const skillDir = path.join(targetDir, '.claude', 'skills', 'transcript-site-generator');

    if (!fileExists(skillDir)) {
      return {
        passed: false,
        detail: '.claude/skills/transcript-site-generator/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore skill.`,
      };
    }

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fileExists(skillMdPath)) {
      return {
        passed: false,
        detail: '.claude/skills/transcript-site-generator/SKILL.md not found',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore SKILL.md.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(skillDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/skills/transcript-site-generator/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const mdFiles = entries.filter((e) => e.endsWith('.md'));

    return {
      passed: true,
      detail: `SKILL.md present, ${mdFiles.length} file(s) in skill pack`,
    };
  });
}

/**
 * Check 3: Skill modules are present (6 modules: 00-05).
 */
function checkModulesPresent(targetDir) {
  return check('Skill modules', () => {
    const modulesDir = path.join(targetDir, '.claude', 'skills', 'transcript-site-generator', 'modules');

    if (!fileExists(modulesDir)) {
      return {
        passed: false,
        detail: 'modules/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore modules.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(modulesDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read modules/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const moduleFiles = entries.filter((e) => e.endsWith('.md'));

    if (moduleFiles.length === 0) {
      return {
        passed: false,
        detail: 'No module files found (expected 6 modules: 00-05)',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore modules.`,
      };
    }

    return {
      passed: true,
      detail: `${moduleFiles.length} module(s): ${moduleFiles.join(', ')}`,
    };
  });
}

/**
 * Check 4: References are present (3 files).
 */
function checkReferencesPresent(targetDir) {
  return check('References', () => {
    const refsDir = path.join(targetDir, '.claude', 'skills', 'transcript-site-generator', 'references');

    if (!fileExists(refsDir)) {
      return {
        passed: false,
        detail: 'references/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore references.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(refsDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read references/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const refFiles = entries.filter((e) => e.endsWith('.md'));

    if (refFiles.length === 0) {
      return {
        passed: false,
        detail: 'No reference files found (expected 3)',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore references.`,
      };
    }

    return {
      passed: true,
      detail: `${refFiles.length} reference(s): ${refFiles.join(', ')}`,
    };
  });
}

/**
 * Check 5: Examples are present (2 files).
 */
function checkExamplesPresent(targetDir) {
  return check('Examples', () => {
    const examplesDir = path.join(targetDir, '.claude', 'skills', 'transcript-site-generator', 'examples');

    if (!fileExists(examplesDir)) {
      return {
        passed: false,
        detail: 'examples/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore examples.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(examplesDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read examples/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const exampleFiles = entries.filter((e) => e.endsWith('.md') || e.endsWith('.html'));

    if (exampleFiles.length === 0) {
      return {
        passed: false,
        detail: 'No example files found (expected 2)',
        fix: `Run ${cyan('@dzhechkov/skills-transcript-site update')} to restore examples.`,
      };
    }

    return {
      passed: true,
      detail: `${exampleFiles.length} example(s): ${exampleFiles.join(', ')}`,
    };
  });
}

/**
 * Check 6: Keysarium integration status.
 * This is informational — not a pass/fail check, always passes.
 */
function checkKeysariumIntegration(targetDir) {
  return check('Keysarium integration', () => {
    const keysariumPath = path.join(targetDir, '.keysarium.json');

    if (!fileExists(keysariumPath)) {
      return {
        passed: true,
        detail: 'Not installed (standalone Transcript Site mode)',
      };
    }

    const keysariumManifest = readJSON(keysariumPath);
    if (!keysariumManifest) {
      return {
        passed: true,
        detail: 'Detected but manifest unreadable',
      };
    }

    return {
      passed: true,
      detail: `Active (Keysarium v${keysariumManifest.version})`,
    };
  });
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/skills-transcript-site doctor` — Health check for the installation.
 *
 * @param {object} options
 * @param {string}  options.targetDir — Project root directory
 */
async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check manifest exists ───────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Transcript Site skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-transcript-site init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} -- file may be corrupted.`);
    process.exit(1);
  }

  console.log('');
  info(bold(`Running health checks for @dzhechkov/skills-transcript-site v${manifest.version}...`));
  console.log('');

  // ── b) Run all checks ─────────────────────────────────────────────────
  const results = [
    checkFilesExist(manifest, targetDir),
    checkSkillComplete(targetDir),
    checkModulesPresent(targetDir),
    checkReferencesPresent(targetDir),
    checkExamplesPresent(targetDir),
    checkKeysariumIntegration(targetDir),
  ];

  // ── c) Display results ─────────────────────────────────────────────────
  let passedCount = 0;
  const failures = [];

  for (const result of results) {
    const icon = result.passed ? green('\u2713') : red('\u2717');
    const statusColor = result.passed ? green : red;
    const detailStr = result.detail ? dim(` -- ${result.detail}`) : '';

    console.log(`  ${icon} ${statusColor(result.name)}${detailStr}`);

    if (result.passed) {
      passedCount++;
    } else {
      failures.push(result);
    }
  }

  // ── d) Summary ─────────────────────────────────────────────────────────
  console.log('');
  const total = results.length;

  if (passedCount === total) {
    success(bold(`${passedCount}/${total} checks passed -- Transcript Site installation is healthy!`));
    console.log('');
    process.exit(0);
  }

  warn(bold(`${passedCount}/${total} checks passed`));
  console.log('');

  // ── e) Show fix suggestions ────────────────────────────────────────────
  console.log(bold('Fix suggestions:'));
  console.log('');

  for (const failure of failures) {
    console.log(`  ${red('\u2717')} ${bold(failure.name)}`);
    if (failure.detail) {
      console.log(`    ${dim(failure.detail)}`);
    }
    if (failure.fix) {
      console.log(`    ${yellow('Fix:')} ${failure.fix}`);
    }
    console.log('');
  }

  process.exit(1);
}

module.exports = run;
module.exports.run = run;
