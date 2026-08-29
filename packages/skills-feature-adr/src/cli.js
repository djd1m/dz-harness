'use strict';

const path = require('path');
const { bold, cyan, dim, green, yellow, red, info, error } = require('./utils');

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------
function showBanner() {
  console.log('');
  console.log(cyan('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557'));
  console.log(cyan('\u2551') + bold('   FEATURE-ADR \u2014 Adaptive Feature Development          ') + cyan('\u2551'));
  console.log(cyan('\u2551') + '   11-step pipeline with Complexity Router (S/M/L/XL)  ' + cyan('\u2551'));
  console.log(cyan('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D'));
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
  console.log(bold('Usage:') + ' npx @dzhechkov/skills-feature-adr ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install Feature ADR skill pack into current project ' + dim('(default)'));
  console.log('  ' + green('update') + '    Update Feature ADR skill pack to latest version');
  console.log('  ' + green('remove') + '    Remove Feature ADR skill pack from project');
  console.log('  ' + green('list') + '      List installed Feature ADR components');
  console.log('  ' + green('doctor') + '    Check Feature ADR installation health');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '                Overwrite existing files without prompting');
  console.log('  ' + yellow('--dry-run') + '              Show what would be done without making changes');
  console.log('  ' + yellow('--with-learning') + '        Add reward learning (memory protocol + reward tracker)');
  console.log('  ' + yellow('--knowledge-extractor') + '  Add knowledge extractor skill (/harvest)');
  console.log('  ' + yellow('--help, -h') + '             Show this help message');
  console.log('  ' + yellow('--version, -v') + '          Show version number');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-feature-adr init');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-feature-adr init --with-learning');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-feature-adr init --with-learning --knowledge-extractor');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-feature-adr init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/skills-feature-adr doctor');
  console.log('');
  console.log(bold('Integration:'));
  console.log('  Works alongside @dzhechkov/keysarium and @dzhechkov/skills-bto.');
  console.log('  If @dzhechkov/keysarium is already installed, --with-learning and');
  console.log('  --knowledge-extractor are not needed (already included in keysarium).');
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
    withLearning: false,
    knowledgeExtractor: false,
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
      case '--with-learning':
        flags.withLearning = true;
        break;
      case '--knowledge-extractor':
        flags.knowledgeExtractor = true;
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
      return require('./commands/init')(flags);

    case 'update':
      return require('./commands/update')(flags);

    case 'remove':
      return require('./commands/remove')(flags);

    case 'list':
      return require('./commands/list')(flags);

    case 'doctor':
      return require('./commands/doctor')(flags);

    default:
      error(`Unknown command: "${resolvedCommand}"`);
      console.log('');
      showHelp();
      process.exitCode = 1;
      break;
  }
}

// Command handlers may be async — catch rejections so they never surface as
// unhandled promise rejections (finding: un-awaited run()).
Promise.resolve()
  .then(() => main())
  .catch((err) => {
    console.error('✗ ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
