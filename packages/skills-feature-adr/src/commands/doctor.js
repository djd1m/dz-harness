'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError,
  fileExists, readJSON, readManifest,
  MANIFEST_FILE, fromManifestPath, getComponentFilter, COMPONENTS,
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
    const resolvedTarget = path.resolve(targetDir);
    const missing = [];
    const suspicious = [];

    for (const relPath of files) {
      // Normalize both separator kinds — old manifests may carry native
      // (backslash) separators written on another OS.
      const absPath = path.resolve(resolvedTarget, fromManifestPath(relPath));

      // Manifest entries must stay inside the project — anything that
      // resolves outside is suspicious (possible tampering), not checked.
      if (absPath !== resolvedTarget && !absPath.startsWith(resolvedTarget + path.sep)) {
        suspicious.push(relPath);
        continue;
      }

      if (!fileExists(absPath)) {
        missing.push(relPath);
      }
    }

    if (suspicious.length > 0) {
      return {
        passed: false,
        detail: `${suspicious.length} suspicious manifest entr${suspicious.length === 1 ? 'y' : 'ies'} outside the project (possible tampering): ${suspicious.slice(0, 5).join(', ')}${suspicious.length > 5 ? '...' : ''}`,
        fix: `Inspect ${cyan(MANIFEST_FILE)} and remove entries pointing outside the project, or reinstall with ${cyan('@dzhechkov/skills-feature-adr init --force')}.`,
      };
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
      fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore missing files.`,
    };
  });
}

function checkSkillComplete(targetDir) {
  return check('Feature ADR skill pack', () => {
    const skillDir = path.join(targetDir, '.claude', 'skills', 'feature-adr');

    if (!fileExists(skillDir)) {
      return {
        passed: false,
        detail: '.claude/skills/feature-adr/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore skill.`,
      };
    }

    const skillMdPath = path.join(skillDir, 'SKILL.md');
    if (!fileExists(skillMdPath)) {
      return {
        passed: false,
        detail: '.claude/skills/feature-adr/SKILL.md not found',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore SKILL.md.`,
      };
    }

    // Check for modules directory
    const modulesDir = path.join(skillDir, 'modules');
    let moduleCount = 0;
    if (fileExists(modulesDir)) {
      try {
        const entries = fs.readdirSync(modulesDir);
        moduleCount = entries.filter((e) => e.endsWith('.md')).length;
      } catch {
        // ignore
      }
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
      detail: `SKILL.md present, ${moduleCount} modules, ${refCount} references`,
    };
  });
}

function checkModulesComplete(targetDir) {
  return check('Pipeline modules (11)', () => {
    const modulesDir = path.join(targetDir, '.claude', 'skills', 'feature-adr', 'modules');

    if (!fileExists(modulesDir)) {
      return {
        passed: false,
        detail: 'modules/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore modules.`,
      };
    }

    const expectedModules = [
      '00-complexity-router.md',
      '01-requirements.md',
      '02-research.md',
      '03-adr.md',
      '03.5-ideation-swarm.md',
      '04-ddd.md',
      '05-architecture.md',
      '06-implementation-plan.md',
      '07-code.md',
      '08-qe.md',
      '09-fleet-qe.md',
    ];

    const missing = [];
    for (const mod of expectedModules) {
      if (!fileExists(path.join(modulesDir, mod))) {
        missing.push(mod);
      }
    }

    if (missing.length === 0) {
      return {
        passed: true,
        detail: `All 11 pipeline modules present`,
      };
    }

    return {
      passed: false,
      detail: `${missing.length} module(s) missing: ${missing.join(', ')}`,
      fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore modules.`,
    };
  });
}

function checkCommandPresent(targetDir) {
  return check('Feature ADR command', () => {
    const commandsDir = path.join(targetDir, '.claude', 'commands');

    if (!fileExists(commandsDir)) {
      return {
        passed: false,
        detail: '.claude/commands/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore command.`,
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

    const featureAdrCommands = entries.filter(
      (e) => e.startsWith('feature-adr') && e.endsWith('.md')
    );

    if (featureAdrCommands.length === 0) {
      return {
        passed: false,
        detail: 'No Feature ADR command files found (expected feature-adr*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore command.`,
      };
    }

    return {
      passed: true,
      detail: `${featureAdrCommands.length} command(s): ${featureAdrCommands.join(', ')}`,
    };
  });
}

function checkRulesPresent(targetDir) {
  return check('Feature ADR rules', () => {
    const rulesDir = path.join(targetDir, '.claude', 'rules');

    if (!fileExists(rulesDir)) {
      return {
        passed: false,
        detail: '.claude/rules/ directory not found',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore rules.`,
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

    const featureAdrRules = entries.filter(
      (e) => e.startsWith('feature-adr') && e.endsWith('.md')
    );

    if (featureAdrRules.length === 0) {
      return {
        passed: false,
        detail: 'No Feature ADR rule files found (expected feature-adr*.md)',
        fix: `Run ${cyan('@dzhechkov/skills-feature-adr update')} to restore rules.`,
      };
    }

    return {
      passed: true,
      detail: `${featureAdrRules.length} rule(s): ${featureAdrRules.join(', ')}`,
    };
  });
}

function checkKeysariumIntegration(targetDir) {
  return check('Keysarium integration', () => {
    const keysariumPath = path.join(targetDir, '.keysarium.json');

    if (!fileExists(keysariumPath)) {
      return {
        passed: true,
        detail: 'Not installed (standalone Feature ADR mode)',
      };
    }

    const keysariumManifest = readJSON(keysariumPath);
    if (!keysariumManifest) {
      return {
        passed: true,
        detail: '⚠ .keysarium.json exists but is unreadable (corrupted?) — treating as not installed',
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
    logError('Feature ADR skill pack is not installed in this directory.');
    info(`Run ${cyan('@dzhechkov/skills-feature-adr init')} to install.`);
    process.exit(1);
  }

  const manifest = readManifest(targetDir);
  if (!manifest) {
    logError(`Failed to read ${MANIFEST_FILE} \u2014 file may be corrupted.`);
    process.exit(1);
  }

  console.log('');
  info(bold(`Running health checks for @dzhechkov/skills-feature-adr v${manifest.version}...`));
  console.log('');

  // ── b) Run all checks ─────────────────────────────────────────────────
  const results = [
    checkFilesExist(manifest, targetDir),
    checkSkillComplete(targetDir),
    checkModulesComplete(targetDir),
    checkCommandPresent(targetDir),
    checkRulesPresent(targetDir),
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
    success(bold(`${passedCount}/${total} checks passed \u2014 Feature ADR installation is healthy!`));
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
