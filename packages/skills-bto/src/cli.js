'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function showBanner() {
  console.log('');
  console.log(cyan('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'));
  console.log(cyan('\u2551') + bold('   DZ-SKILLS-BTO \u2014 Build\u00B7Benchmark\u00B7Test\u00B7Optimize          ') + cyan('\u2551'));
  console.log(cyan('\u2551') + '   Deterministic benchmarking + multi-agent evaluation   ' + cyan('\u2551'));
  console.log(cyan('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D'));
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
  console.log(bold('Usage:') + ' npx @dzhechkov/skills-bto ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install BTO skill pack into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update BTO skill pack to latest version');
  console.log('  ' + green('remove') + '    Remove BTO skill pack from project');
  console.log('  ' + green('list') + '      List installed BTO components');
  console.log('  ' + green('doctor') + '    Check BTO installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '      Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '    Show what would be done without making changes');
  console.log('  ' + yellow('--help, -h') + '   Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-bto init');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-bto init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-bto update --dry-run');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-bto doctor');
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

  // Handle version early (no banner)
  if (command === 'version') {
    console.log(getVersion());
    return;
  }

  showBanner();

  // Handle help early
  if (command === 'help') {
    showHelp();
    return;
  }

  // Route to command handlers
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

    default:
      error(`Unknown command: "${resolvedCommand}"`);
      console.log('');
      showHelp();
      process.exitCode = 1;
      break;
  }
}

main();
