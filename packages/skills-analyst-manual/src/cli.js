'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

function showBanner() {
  console.log('');
  console.log(cyan('╔══════════════════════════════════════════════════════════╗'));
  console.log(cyan('║') + bold('   ANALYST MANUAL — Strategic Analysis with Checkpoints   ') + cyan('║'));
  console.log(cyan('║') + '   explore → verified research → solve (3 phases)         ' + cyan('║'));
  console.log(cyan('╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

function getVersion() {
  const pkg = require('../package.json');
  return pkg.version;
}

function showHelp() {
  console.log(bold('Usage:') + ' npx @dzhechkov/skills-analyst-manual ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install Analyst Manual skill pack into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update Analyst Manual skill pack to latest version');
  console.log('  ' + green('remove') + '    Remove Analyst Manual skill pack from project');
  console.log('  ' + green('list') + '      List installed Analyst Manual components');
  console.log('  ' + green('doctor') + '    Check Analyst Manual installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '     Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '   Show what would be done without making changes');
  console.log('  ' + yellow('--help, -h') + '  Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-analyst-manual init');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-analyst-manual init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-analyst-manual doctor');
  console.log('');
  console.log(bold('What gets installed:'));
  console.log('  Composite skill: analyst-manual-full (orchestrator)');
  console.log('  Dependent skills: explore, goap-research-ed25519, problem-solver-enhanced');
  console.log('  Command: /analyst-manual');
  console.log('');
  console.log(bold('Self-contained:'));
  console.log('  This package includes all dependent skills. No need to install');
  console.log('  @dzhechkov/keysarium separately.');
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
