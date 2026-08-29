'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError,
  fileExists, readJSON, readManifest,
  MANIFEST_FILE, getComponentFilter, COMPONENTS,
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
      fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore missing files.`,
    };
  });
}

/**
 * Check 2: BTO skill directory has SKILL.md.
 */
function checkBtoSkillComplete(targetDir) {
  return check('BTO skill pack', () => {
    const btoSkillDir = path.join(targetDir, '.claude', 'skills', 'bto');

    if (!fileExists(btoSkillDir)) {
      return {
        passed: false,
        detail: '.claude/skills/bto/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore BTO skill.`,
      };
    }

    const skillMdPath = path.join(btoSkillDir, 'SKILL.md');
    if (!fileExists(skillMdPath)) {
      return {
        passed: false,
        detail: '.claude/skills/bto/SKILL.md not found',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore SKILL.md.`,
      };
    }

    // Check for BTO sub-modules
    let entries;
    try {
      entries = fs.readdirSync(btoSkillDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/skills/bto/ directory',
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
 * Check 3: BTO commands are present (bto*.md files in .claude/commands/).
 */
function checkBtoCommandsPresent(targetDir) {
  return check('BTO commands', () => {
    const commandsDir = path.join(targetDir, '.claude', 'commands');

    if (!fileExists(commandsDir)) {
      return {
        passed: false,
        detail: '.claude/commands/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore commands.`,
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

    // Filter for BTO commands only (bto*.md)
    const btoCommands = entries.filter((e) => e.startsWith('bto') && e.endsWith('.md'));

    if (btoCommands.length === 0) {
      return {
        passed: false,
        detail: 'No BTO command files found (expected bto*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore BTO commands.`,
      };
    }

    return {
      passed: true,
      detail: `${btoCommands.length} BTO command(s): ${btoCommands.join(', ')}`,
    };
  });
}

/**
 * Check 4: BTO rules are present (bto-*.md files in .claude/rules/).
 */
function checkBtoRulesPresent(targetDir) {
  return check('BTO rules', () => {
    const rulesDir = path.join(targetDir, '.claude', 'rules');

    if (!fileExists(rulesDir)) {
      return {
        passed: false,
        detail: '.claude/rules/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore rules.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(rulesDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/rules/ directory',
        fix: 'Check directory permissions.',
      };
    }

    // Filter for BTO rules only (bto-*.md)
    const btoRules = entries.filter((e) => e.startsWith('bto-') && e.endsWith('.md'));

    if (btoRules.length === 0) {
      return {
        passed: false,
        detail: 'No BTO rule files found (expected bto-*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore BTO rules.`,
      };
    }

    return {
      passed: true,
      detail: `${btoRules.length} BTO rule(s): ${btoRules.join(', ')}`,
    };
  });
}

/**
 * Check 5: BTO agent templates are present (bto-*.md files in .claude/agents/).
 */
function checkBtoAgentsPresent(targetDir) {
  return check('BTO agents', () => {
    const agentsDir = path.join(targetDir, '.claude', 'agents');

    if (!fileExists(agentsDir)) {
      return {
        passed: false,
        detail: '.claude/agents/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore agents.`,
      };
    }

    let entries;
    try {
      entries = fs.readdirSync(agentsDir);
    } catch {
      return {
        passed: false,
        detail: 'Cannot read .claude/agents/ directory',
        fix: 'Check directory permissions.',
      };
    }

    // Filter for BTO agents only (bto-*.md)
    const btoAgents = entries.filter((e) => e.startsWith('bto-') && e.endsWith('.md'));

    if (btoAgents.length === 0) {
      return {
        passed: false,
        detail: 'No BTO agent files found (expected bto-*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-bto update')} to restore BTO agent templates.`,
      };
    }

    return {
      passed: true,
      detail: `${btoAgents.length} BTO agent(s): ${btoAgents.join(', ')}`,
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
        detail: 'Not installed (standalone BTO mode)',
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
 * `@dzhechkov/skills-bto doctor` — Health check for the BTO skill pack installation.
 *
 * @param {object} options
 * @param {string}  options.targetDir — Project root directory
 */
async function run(options) {
  const { targetDir } = options;
  const manifestPath = path.join(targetDir, MANIFEST_FILE);

  // ── a) Check manifest exists ───────────────────────────────────────────
  if (!fileExists(manifestPath)) {
    logError('BTO skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-bto init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} — file may be corrupted.`);
    process.exit(1);
  }

  console.log('');
  info(bold(`Running health checks for @dzhechkov/skills-bto v${manifest.version}...`));
  console.log('');

  // ── b) Run all checks ─────────────────────────────────────────────────
  const results = [
    checkFilesExist(manifest, targetDir),
    checkBtoSkillComplete(targetDir),
    checkBtoCommandsPresent(targetDir),
    checkBtoRulesPresent(targetDir),
    checkBtoAgentsPresent(targetDir),
    checkKeysariumIntegration(targetDir),
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
    success(bold(`${passedCount}/${total} checks passed — BTO installation is healthy!`));
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
