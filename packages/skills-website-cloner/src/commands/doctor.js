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
      fix: `Run ${cyan('@dzhechkov/skills-website-cloner update')} to restore missing files.`,
    };
  });
}

function checkSkillCloneWebsite(targetDir) {
  return check('Website Cloner Full skill', () => {
    const skillDir = path.join(targetDir, '.claude', 'skills', 'clone-website');

    if (!fileExists(skillDir)) {
      return {
        passed: false,
        detail: '.claude/skills/clone-website/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-website-cloner update')} to restore skill.`,
      };
    }

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fileExists(skillMdPath)) {
      return {
        passed: false,
        detail: '.claude/skills/clone-website/SKILL.md not found',
        fix: `Run ${cyan('@dzhechkov/skills-website-cloner update')} to restore SKILL.md.`,
      };
    }

    // Check for references directory
    const refsDir = path.join(skillDir, 'references');
    let refCount = 0;
    if (fileExists(refsDir)) {
      try {
        const entries = fs.readdirSync(refsDir);
        refCount = entries.filter((e) => e.endsWith('.md')).length;
      } catch {
        // ignore
      }
    }

    return {
      passed: true,
      detail: `SKILL.md present, ${refCount} references`,
    };
  });
}

function checkCommandPresent(targetDir) {
  return check('Website Cloner command', () => {
    const commandsDir = path.join(targetDir, '.claude', 'commands');

    if (!fileExists(commandsDir)) {
      return {
        passed: false,
        detail: '.claude/commands/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-website-cloner update')} to restore command.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(commandsDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/commands/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const cloneCommands = entries.filter(
      (e) => e.startsWith('clone-website') && e.endsWith('.md')
    );

    if (cloneCommands.length === 0) {
      return {
        passed: false,
        detail: 'No Website Cloner command files found (expected clone-website*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-website-cloner update')} to restore command.`,
      };
    }

    return {
      passed: true,
      detail: `${cloneCommands.length} command(s): ${cloneCommands.join(', ')}`,
    };
  });
}

function checkKeysariumIntegration(targetDir) {
  return check('Keysarium integration', () => {
    const keysariumPath = path.join(targetDir, '.keysarium.json');

    if (!fileExists(keysariumPath)) {
      return {
        passed: true,
        detail: 'Not installed (standalone Website Cloner mode)',
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

async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check manifest exists ──────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Website Cloner skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-website-cloner init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    process.exit(1);
  }

  console.log('');
  info(bold(`Running health checks for @dzhechkov/skills-website-cloner v${manifest.version}...`));
  console.log('');

  // ── b) Run all checks ─────────────────────────────────────────────────
  const results = [
    checkFilesExist(manifest, targetDir),
    checkSkillCloneWebsite(targetDir),
    checkCommandPresent(targetDir),
    checkKeysariumIntegration(targetDir),
  ];

  // ── c) Display results ────────────────────────────────────────────────
  let passedCount = 0;
  const failures = [];

  for (const result of results) {
    const icon = result.passed ? green('\u2713') : red('\u2717');
    const statusColor = result.passed ? green : red;
    const detailStr = result.detail ? dim(` \u2014 ${result.detail}`) : '';

    console.log(`  ${icon} ${statusColor(result.name)}${detailStr}`);

    if (result.passed) {
      passedCount++;
    } else {
      failures.push(result);
    }
  }

  // ── d) Summary ────────────────────────────────────────────────────────
  console.log('');
  const total = results.length;

  if (passedCount === total) {
    success(bold(`${passedCount}/${total} checks passed \u2014 Website Cloner installation is healthy!`));
    console.log('');
    process.exit(0);
  }

  warn(bold(`${passedCount}/${total} checks passed`));
  console.log('');

  // ── e) Show fix suggestions ───────────────────────────────────────────
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
