'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function showBanner() {
  console.log('');
  console.log(cyan('╔══════════════════════════════════════════════════════╗'));
  console.log(cyan('║') + bold('        \uD83D\uDD2C DZ-KEYSARIUM — AI Research Toolkit        ') + cyan('║'));
  console.log(cyan('║') + '     Full 7-phase pipeline for Claude Code           ' + cyan('║'));
  console.log(cyan('╚══════════════════════════════════════════════════════╝'));
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
  console.log(bold('Usage:') + ' npx @dzhechkov/keysarium ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install toolkit into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update toolkit to latest version');
  console.log('  ' + green('remove') + '    Remove toolkit from project');
  console.log('  ' + green('list') + '      List installed components');
  console.log('  ' + green('doctor') + '    Check installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--minimal') + '    Install only .claude/ directory (skills, commands, rules)');
  console.log('  ' + yellow('--force') + '      Overwrite existing files without prompting');
  console.log('  ' + yellow('--with-docs') + '  Include docs/ directory');
  console.log('  ' + yellow('--dry-run') + '    Show what would be done without making changes');
  console.log('  ' + yellow('--help, -h') + '   Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/keysarium init');
  console.log(dim('  $ ') + 'npx @dzhechkov/keysarium init --minimal --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/keysarium update --dry-run');
  console.log(dim('  $ ') + 'npx @dzhechkov/keysarium doctor');
  console.log('');
}

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = argv.slice(2);

  const flags = {
    minimal: false,
    force: false,
    withDocs: false,
    dryRun: false,
    targetDir: process.cwd(),
  };

  let command = null;

  for (const arg of args) {
    switch (arg) {
      case '--minimal':
        flags.minimal = true;
        break;
      case '--force':
        flags.force = true;
        break;
      case '--with-docs':
        flags.withDocs = true;
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
          // Reject unknown options loudly — a typo like --dry-rum or --froce must
          // never silently downgrade behavior (real install instead of dry-run, or
          // an unguarded destructive command).
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
