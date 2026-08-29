'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError,
  fileExists, readJSON, readManifest, getTemplateFileNames,
  MANIFEST_FILE,
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
      fix: `Run ${cyan('npx @dzhechkov/keysarium update')} to restore missing files.`,
    };
  });
}

/**
 * Check 2: CLAUDE.md contains key sections.
 */
function checkClaudeMd(targetDir) {
  return check('CLAUDE.md valid', () => {
    const claudePath = path.join(targetDir, 'CLAUDE.md');

    if (!fileExists(claudePath)) {
      return {
        passed: false,
        detail: 'CLAUDE.md not found',
        fix: `Run ${cyan('npx @dzhechkov/keysarium update')} or ${cyan('npx @dzhechkov/keysarium init --force')} to restore.`,
      };
    }

    const content = fs.readFileSync(claudePath, 'utf8');
    const requiredSections = ['Pipeline', 'Skills'];
    const missingSections = [];

    for (const section of requiredSections) {
      // Case-insensitive search for the section heading or keyword
      if (!content.toLowerCase().includes(section.toLowerCase())) {
        missingSections.push(section);
      }
    }

    if (missingSections.length === 0) {
      return {
        passed: true,
        detail: 'Contains required sections (Pipeline, Skills)',
      };
    }

    return {
      passed: false,
      detail: `Missing sections: ${missingSections.join(', ')}`,
      fix: 'Restore CLAUDE.md from the template or add the missing sections manually.',
    };
  });
}

/**
 * Check 3: Each skill directory has SKILL.md.
 */
function checkSkillsComplete(targetDir) {
  return check('Skills complete', () => {
    const skillsDir = path.join(targetDir, '.claude', 'skills');

    if (!fileExists(skillsDir)) {
      return {
        passed: false,
        detail: '.claude/skills/ directory not found',
        fix: `Run ${cyan('npx @dzhechkov/keysarium update')} to restore skills.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(skillsDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/skills/ directory',
        fix: 'Check directory permissions.',
      };
    }

    const skillDirs = entries.filter((entry) => {
      const entryPath = path.join(skillsDir, entry);
      try {
        return fs.statSync(entryPath).isDirectory();
      } catch {
        return false;
      }
    });

    const missingSkillMd = [];
    for (const dir of skillDirs) {
      const skillMdPath = path.join(skillsDir, dir, 'SKILL.md');
      if (!fileExists(skillMdPath)) {
        missingSkillMd.push(dir);
      }
    }

    if (missingSkillMd.length === 0) {
      return {
        passed: true,
        detail: `${skillDirs.length} skill(s), all have SKILL.md`,
      };
    }

    return {
      passed: false,
      detail: `Missing SKILL.md in: ${missingSkillMd.join(', ')}`,
      fix: 'Each skill directory must contain a SKILL.md file. Run update to restore.',
    };
  });
}

/**
 * Shared body for the "every shipped <thing>.md is installed" checks.
 *
 * The expected list is DERIVED from the package's own templates/ tree, never hardcoded —
 * a command or rule added to templates/ is named-checked on the next run with no edit here.
 * (Regression this guards: the lists used to be frozen at a legacy 11-command / 7-rule
 * subset, so `doctor` reported "All 11 command files present" on a 19-command install and
 * newer files like feature-adr.md / dream.md / reward-learning.md were never named.)
 */
function checkComponentFilesPresent(targetDir, opts) {
  const { checkName, componentKey, dirParts, noun } = opts;

  return check(checkName, () => {
    const dir = path.join(targetDir, ...dirParts);
    const relDir = dirParts.join('/') + '/';
    const expected = getTemplateFileNames(componentKey);

    if (expected.length === 0) {
      return {
        passed: false,
        detail: `Cannot read the shipped ${noun} list from the package templates/ tree`,
        fix: 'Reinstall the package: the templates/ directory is missing or unreadable.',
      };
    }

    if (!fileExists(dir)) {
      return {
        passed: false,
        detail: `${relDir} directory not found`,
        fix: `Run ${cyan('npx @dzhechkov/keysarium update')} to restore ${noun}s.`,
      };
    }

    const missing = expected.filter((name) => !fileExists(path.join(dir, name)));

    if (missing.length === 0) {
      return {
        passed: true,
        detail: `All ${expected.length} ${noun} files present`,
      };
    }

    return {
      passed: false,
      detail: `Missing ${missing.length}/${expected.length} ${noun}(s): ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '...' : ''}`,
      fix: `Run ${cyan('npx @dzhechkov/keysarium update')} to restore missing ${noun}s.`,
    };
  });
}

/**
 * Check 4: every shipped command .md file is present.
 */
function checkCommandsPresent(targetDir) {
  return checkComponentFilesPresent(targetDir, {
    checkName: 'Commands present',
    componentKey: 'commands',
    dirParts: ['.claude', 'commands'],
    noun: 'command',
  });
}

/**
 * Check 5: every shipped rule .md file is present.
 */
function checkRulesPresent(targetDir) {
  return checkComponentFilesPresent(targetDir, {
    checkName: 'Rules present',
    componentKey: 'rules',
    dirParts: ['.claude', 'rules'],
    noun: 'rule',
  });
}

/**
 * Check 5b: every shipped governance shard is present.
 */
function checkShardsPresent(targetDir) {
  return checkComponentFilesPresent(targetDir, {
    checkName: 'Shards present',
    componentKey: 'shards',
    dirParts: ['.claude', 'shards'],
    noun: 'shard',
  });
}

/**
 * Check 6: every shipped agent template .md file is present.
 */
function checkAgentsPresent(targetDir) {
  return checkComponentFilesPresent(targetDir, {
    checkName: 'Agents present',
    componentKey: 'agents',
    dirParts: ['.claude', 'agents'],
    noun: 'agent',
  });
}

/**
 * Check 7: .claude/settings.json is valid JSON.
 */
function checkSettingsValid(targetDir) {
  return check('Settings valid', () => {
    const settingsPath = path.join(targetDir, '.claude', 'settings.json');

    if (!fileExists(settingsPath)) {
      return {
        passed: false,
        detail: '.claude/settings.json not found',
        fix: `Run ${cyan('npx @dzhechkov/keysarium update')} to restore settings.`,
      };
    }

    const data = readJSON(settingsPath);
    if (data === null) {
      return {
        passed: false,
        detail: '.claude/settings.json contains invalid JSON',
        fix: 'Fix the JSON syntax in .claude/settings.json or restore from template.',
      };
    }

    return {
      passed: true,
      detail: 'Valid JSON',
    };
  });
}

/**
 * Check 8: researches/ directory exists.
 */
function checkResearchDir(targetDir) {
  return check('Research dir', () => {
    const researchesDir = path.join(targetDir, 'researches');

    if (!fileExists(researchesDir)) {
      return {
        passed: false,
        detail: 'researches/ directory not found',
        fix: 'Create the directory: mkdir researches',
      };
    }

    try {
      const stat = fs.statSync(researchesDir);
      if (!stat.isDirectory()) {
        return {
          passed: false,
          detail: 'researches exists but is not a directory',
          fix: 'Remove the file and create a directory: rm researches && mkdir researches',
        };
      }
    } catch {
      return {
        passed: false,
        detail: 'Cannot stat researches/',
        fix: 'Check filesystem permissions.',
      };
    }

    return {
      passed: true,
      detail: 'Directory exists',
    };
  });
}

// ---------------------------------------------------------------------------
// Main command
// ---------------------------------------------------------------------------

/**
 * `@dzhechkov/keysarium doctor` — Health check for the toolkit installation.
 *
 * @param {object} options
 * @param {string}  options.targetDir — Project root directory
 */
async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check manifest exists ───────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('Keysarium is not installed in this directory.');
    info(`Run ${cyan('npx @dzhechkov/keysarium init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError('Failed to read .keysarium.json — file may be corrupted.');
    process.exit(1);
  }

  console.log('');
  info(bold(`Running health checks for @dzhechkov/keysarium v${manifest.version}...`));
  console.log('');

  // ── b) Run all checks ─────────────────────────────────────────────────
  const results = [
    checkFilesExist(manifest, targetDir),
    checkClaudeMd(targetDir),
    checkSkillsComplete(targetDir),
    checkCommandsPresent(targetDir),
    checkRulesPresent(targetDir),
    checkShardsPresent(targetDir),
    checkAgentsPresent(targetDir),
    checkSettingsValid(targetDir),
    checkResearchDir(targetDir),
  ];

  // ── c) Display results ─────────────────────────────────────────────────
  let passedCount = 0;
  const failures = [];

  for (const result of results) {
    const icon = result.passed ? green('\u2713') : red('\u2717');
    const statusColor = result.passed ? green : red;
    const detailStr = result.detail ? dim(` — ${result.detail}`) : '';

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
    success(bold(`${passedCount}/${total} checks passed — installation is healthy!`));
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
