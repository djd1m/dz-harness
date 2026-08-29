'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

function showBanner() {
  console.log('');
  console.log(cyan('╔══════════════════════════════════════════════════════════╗'));
  console.log(cyan('║') + bold('   WEBSITE CLONER — any site → pixel-perfect Next.js clone ') + cyan('║'));
  console.log(cyan('║') + '   recon → specs → parallel build (worktrees) → visual QA  ' + cyan('║'));
  console.log(cyan('╚══════════════════════════════════════════════════════════╝'));
  console.log('');
}

function getVersion() {
  const pkg = require('../package.json');
  return pkg.version;
}

function showHelp() {
  console.log(bold('Usage:') + ' npx @dzhechkov/skills-website-cloner ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install Website Cloner skill pack into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update Website Cloner skill pack to latest version');
  console.log('  ' + green('remove') + '    Remove Website Cloner skill pack from project');
  console.log('  ' + green('list') + '      List installed Website Cloner components');
  console.log('  ' + green('doctor') + '    Check Website Cloner installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '     Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '   Show what would be done without making changes');
  console.log('  ' + yellow('--help, -h') + '  Show this help message');
  console.log('  ' + yellow('--version, -v') + ' Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-website-cloner init');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-website-cloner init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-website-cloner doctor');
  console.log('');
  console.log(bold('What gets installed:'));
  console.log('  Skill: clone-website (reverse-engineer a site → Next.js clone)');
  console.log('  Command: /clone-website');
  console.log('');
  console.log(bold('Runtime prerequisites (NOT bundled — provide your own):'));
  console.log('  - A browser-automation MCP (Chrome / Playwright / Browserbase).');
  console.log('  - A Next.js 16 + React 19 + Tailwind v4 + shadcn/ui scaffold.');
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
