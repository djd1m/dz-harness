'use strict';

const { bold, cyan, dim, green, yellow, error, COMPONENTS } = require('./utils');

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function showBanner() {
  console.log('');
  console.log(cyan('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'));
  console.log(cyan('\u2551') + bold('   P-REPLICATOR \u2014 AI Product Replicator for Claude Code ') + cyan('\u2551'));
  console.log(cyan('\u2551') + '   AI-assisted product development (Vibe Coding)        ' + cyan('\u2551'));
  console.log(cyan('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D'));
  console.log('');
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------
function getVersion() {
  const pkg = require('../package.json');
  return pkg.version;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------
function showHelp() {
  console.log(bold('Usage:') + ' npx @dzhechkov/p-replicator ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install P-Replicator into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update to latest version');
  console.log('  ' + green('remove') + '    Remove P-Replicator from project');
  console.log('  ' + green('list') + '      List installed components');
  console.log('  ' + green('doctor') + '    Check installation health (pre-shipped artifacts)');
  console.log('  ' + green('verify') + '    Verify pre-shipped + post-/replicate artifacts');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '      Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '    Show what would be done without making changes');
  console.log('  ' + yellow('--reset-settings') + ' Force-overwrite settings.json (default: merge with user customizations)');
  console.log('  ' + yellow('--help, -h') + '   Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/p-replicator init');
  console.log(dim('  $ ') + 'npx @dzhechkov/p-replicator init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/p-replicator update --dry-run');
  console.log(dim('  $ ') + 'npx @dzhechkov/p-replicator doctor');
  console.log('');
  // Counts derived from utils.COMPONENTS.items (SSOT) — fixes prior "1 rule" drift.
  const c = {
    skills:   Object.keys(COMPONENTS.skills.items).length,
    commands: Object.keys(COMPONENTS.commands.items).length,
    agents:   Object.keys(COMPONENTS.agents.items).length,
    rules:    Object.keys(COMPONENTS.rules.items).length,
  };
  console.log(bold('What gets installed:'));
  console.log(`  ${c.skills} skills      SPARC docs, research, problem-solving, validation, review,`);
  console.log('                 reverse engineering, toolkit generation, pipeline forge,');
  console.log('                 knowledge extraction, task exploration');
  console.log(`  ${c.commands} commands     /replicate (full pipeline), /harvest (knowledge extraction)`);
  console.log(`  ${c.agents} agents       replicate-coordinator, product-discoverer, doc-validator,`);
  console.log('                 harvest-coordinator');
  console.log(`  ${c.rules} rule${c.rules === 1 ? '' : 's'}        replicate-pipeline, skill-interface-protocol`);
  console.log('');
  console.log(bold('After installation:'));
  console.log('  1. Open ' + cyan('Claude Code') + ' in this directory');
  console.log('  2. Run ' + cyan('/replicate "Your product idea"'));
  console.log('  3. Follow the 4-5 phase pipeline with checkpoints');
  console.log('');
  console.log(bold('Integration:'));
  console.log('  Works alongside @dzhechkov/keysarium. Install both for the full toolkit.');
  console.log('');
}

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);

  const flags = {
    force: false,
    dryRun: false,
    resetSettings: false,
    targetDir: process.cwd(),
  };

  let command = null;

  for (const arg of args) {
    switch (arg) {
      case '--force':
        flags.force = true;
        break;
      case '--dry-run':
        flags.dryRun = true;
        break;
      case '--reset-settings':
        flags.resetSettings = true;
        break;
      case '--help':
      case '-h':
        command = 'help';
        break;
      case '--version':
      case '-v':
        command = 'version';
        break;
      default:
        if (arg.startsWith('-')) {
          error(`Unknown option: ${arg}`);
          process.exit(1);
        } else if (command === null) {
          command = arg;
        } else {
          error(`Unexpected argument: ${arg}`);
          process.exit(1);
        }
        break;
    }
  }

  return { command, flags };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { command, flags } = parseArgs(process.argv);

  if (command === 'version') {
    console.log(getVersion());
    return;
  }

  showBanner();

  if (command === 'help') {
    showHelp();
    return;
  }

  const resolvedCommand = command || 'init';

  switch (resolvedCommand) {
    case 'init':
      require('./commands/init')(flags);
      break;

    case 'update':
      require('./commands/update')(flags);
      break;

    case 'remove':
      require('./commands/remove')(flags);
      break;

    case 'list':
      require('./commands/list')(flags);
      break;

    case 'doctor':
      require('./commands/doctor')(flags);
      break;

    case 'verify':
      require('./commands/verify')(flags);
      break;

    default:
      error(`Unknown command: "${resolvedCommand}"`);
      console.log('');
      showHelp();
      process.exitCode = 1;
      break;
  }
}

main();
