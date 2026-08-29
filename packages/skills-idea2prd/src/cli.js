'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

function showBanner() {
  console.log('');
  console.log(cyan('╔══════════════════════════════════════════════════════════╗'));
  console.log(cyan('║') + bold('   IDEA2PRD MANUAL — Idea → PRD docs with Checkpoints      ') + cyan('║'));
  console.log(cyan('║') + '   analyst → PRD → DDD → C4 → pseudocode (9 checkpoints)   ' + cyan('║'));
  console.log(cyan('╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

function getVersion() {
  const pkg = require('../package.json');
  return pkg.version;
}

function showHelp() {
  console.log(bold('Usage:') + ' npx @dzhechkov/skills-idea2prd ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install Idea2PRD Manual skill pack into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update Idea2PRD Manual skill pack to latest version');
  console.log('  ' + green('remove') + '    Remove Idea2PRD Manual skill pack from project');
  console.log('  ' + green('list') + '      List installed Idea2PRD Manual components');
  console.log('  ' + green('doctor') + '    Check Idea2PRD Manual installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '     Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '   Show what would be done without making changes');
  console.log('  ' + yellow('--help, -h') + '  Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-idea2prd init');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-idea2prd init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-idea2prd doctor');
  console.log('');
  console.log(bold('What gets installed:'));
  console.log('  Composite skill: idea2prd-manual (orchestrator)');
  console.log('  Dependent skills: explore, goap-research-ed25519, problem-solver-enhanced');
  console.log('  Command: /idea2prd-manual');
  console.log('');
  console.log(bold('Self-contained:'));
  console.log('  This package bundles its dependent skills (tracked via sources.json).');
  console.log('  No need to install @dzhechkov/keysarium or skills-analyst-manual.');
  console.log('');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = { force: false, dryRun: false, targetDir: process.cwd() };
  let command = null;

  for (const arg of args) {
    switch (arg) {
      case '--force':    flags.force = true; break;
      case '--dry-run':  flags.dryRun = true; break;
      case '--help':
      case '-h':         command = 'help'; break;
      case '--version':
      case '-v':         command = 'version'; break;
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

function main() {
  const { command, flags } = parseArgs(process.argv);

  if (command === 'version') { console.log(getVersion()); return; }

  showBanner();

  if (command === 'help') { showHelp(); return; }

  const resolvedCommand = command || 'init';

  switch (resolvedCommand) {
    case 'init':    require('./commands/init')(flags); break;
    case 'update':  require('./commands/update')(flags); break;
    case 'remove':  require('./commands/remove')(flags); break;
    case 'list':    require('./commands/list')(flags); break;
    case 'doctor':  require('./commands/doctor')(flags); break;
    default:
      error(`Unknown command: "${resolvedCommand}"`);
      console.log('');
      showHelp();
      process.exitCode = 1;
      break;
  }
}

main();
