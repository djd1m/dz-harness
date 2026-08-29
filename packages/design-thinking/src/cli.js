'use strict';

/**
 * @dzhechkov/design-thinking — npx toolkit installer.
 *
 * Zero-dependency CLI. Copies the bundled Design Thinking skill set (the
 * canonical, BTO-benchmarked design-thinking orchestrator + its skill
 * dependencies), the /design-thinking command, governance rule, and shard
 * into the user's project under .claude/.
 *
 * Commands: init (default) | list | doctor | help | version
 */

const fs = require('fs');
const path = require('path');

// ── ANSI colors (zero deps) ────────────────────────────────────────────────
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, t) => (useColor ? `\x1b[${code}m${t}\x1b[0m` : t);
const green = (t) => c('32', t);
const red = (t) => c('31', t);
const yellow = (t) => c('33', t);
const cyan = (t) => c('36', t);
const bold = (t) => c('1', t);
const dim = (t) => c('2', t);
const info = (m) => console.log(c('34', '[INFO]') + ' ' + m);
const ok = (m) => console.log(green('[OK]') + '   ' + m);
const warn = (m) => console.log(yellow('[WARN]') + ' ' + m);
const err = (m) => console.log(red('[ERROR]') + ' ' + m);

const MANIFEST_FILE = '.design-thinking.json';

function getVersion() {
  return require('../package.json').version;
}

function templatesDir() {
  return path.resolve(__dirname, '..', 'templates');
}

// ── recursive copy; returns list of relative file paths written ─────────────
function copyTree(src, dest, written, force) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry), written, force);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(dest) && !force) {
      written.skipped.push(dest);
    } else {
      fs.copyFileSync(src, dest);
      written.copied.push(dest);
    }
  }
}

// ── banner / help ───────────────────────────────────────────────────────────
function banner() {
  const line = '═'.repeat(54);
  console.log('');
  console.log(cyan('╔' + line + '╗'));
  console.log(cyan('║') + bold('   DESIGN THINKING — Human-Centered Product Design    ') + cyan('║'));
  console.log(cyan('║') + '   d.school 5 phases + Validate · 25 methodologies    ' + cyan('║'));
  console.log(cyan('╚' + line + '╝'));
  console.log('');
}

function showHelp() {
  console.log(bold('Usage:') + ' npx @dzhechkov/design-thinking ' + cyan('<command>') + dim(' [options]'));
  console.log('');
  console.log(bold('Commands:'));
  console.log('  ' + green('init') + '      Install the Design Thinking toolkit into this project ' + dim('(default)'));
  console.log('  ' + green('list') + '      List the skills this toolkit bundles');
  console.log('  ' + green('doctor') + '    Check the installation in this project');
  console.log('');
  console.log(bold('Options:'));
  console.log('  ' + yellow('--force') + '        Overwrite existing files');
  console.log('  ' + yellow('--dry-run') + '      Show what would be installed without writing');
  console.log('  ' + yellow('--help, -h') + '     Show this help');
  console.log('  ' + yellow('--version, -v') + '  Show version');
  console.log('');
  console.log(bold('Examples:'));
  console.log(dim('  $ ') + 'npx @dzhechkov/design-thinking init');
  console.log(dim('  $ ') + 'npx @dzhechkov/design-thinking init --force');
  console.log(dim('  $ ') + 'npx @dzhechkov/design-thinking doctor');
  console.log('');
  console.log(bold('After install:'));
  console.log('  Open Claude Code and run ' + cyan('/design-thinking [your product problem]'));
  console.log('  or just describe a user-facing problem — the skill auto-activates.');
  console.log('');
}

// ── command: init ───────────────────────────────────────────────────────────
function cmdInit(flags) {
  const target = flags.targetDir;
  const tplRoot = path.join(templatesDir(), '.claude');
  const destRoot = path.join(target, '.claude');

  if (!fs.existsSync(tplRoot)) {
    err('Bundled templates not found — package is corrupt. Reinstall.');
    process.exit(1);
  }

  const manifestPath = path.join(target, MANIFEST_FILE);
  if (fs.existsSync(manifestPath) && !flags.force) {
    warn('Design Thinking toolkit already installed here.');
    info('Use ' + yellow('--force') + ' to overwrite, or ' + cyan('doctor') + ' to check.');
    process.exit(1);
  }

  if (flags.dryRun) {
    info(bold('Dry run — would install:'));
    const skills = fs.readdirSync(path.join(tplRoot, 'skills'));
    console.log('  ' + green('+') + ' ' + skills.length + ' skills: ' + skills.join(', '));
    console.log('  ' + green('+') + ' /design-thinking command');
    console.log('  ' + green('+') + ' design-thinking-conventions rule');
    console.log('  ' + green('+') + ' design-thinking shard');
    warn('Dry run — no files written.');
    process.exit(0);
  }

  const written = { copied: [], skipped: [] };
  copyTree(tplRoot, destRoot, written, flags.force);

  // manifest — record copied AND skipped: skipped files exist on disk and belong
  // to the toolkit (e.g. re-init after a deleted manifest), so doctor must track them.
  const rel = (p) => path.relative(target, p);
  const manifest = {
    name: '@dzhechkov/design-thinking',
    version: getVersion(),
    installedAt: new Date().toISOString().slice(0, 10),
    files: [...written.copied, ...written.skipped].map(rel).sort(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log('');
  ok(bold('Design Thinking toolkit installed!'));
  console.log('');
  console.log(bold('Bundled skills:'));
  for (const s of fs.readdirSync(path.join(destRoot, 'skills'))) {
    console.log('  ' + green('✓') + ' ' + s);
  }
  console.log('');
  console.log('  ' + dim(written.copied.length + ' files written, ' + written.skipped.length + ' skipped'));
  console.log('');
  console.log(bold('Next steps:'));
  console.log('  1. Open ' + cyan('Claude Code') + ' in this directory');
  console.log('  2. Run ' + cyan('/design-thinking [your product / user problem]'));
  console.log('  3. The skill runs Empathize → Define → Ideate → Prototype → Test → Validate');
  console.log('');
  process.exit(0);
}

// ── command: list ───────────────────────────────────────────────────────────
function cmdList() {
  const skillsDir = path.join(templatesDir(), '.claude', 'skills');
  const skills = fs.readdirSync(skillsDir);
  console.log(bold('Skills bundled in this toolkit (' + skills.length + '):'));
  for (const s of skills) {
    console.log('  ' + green('•') + ' ' + s);
  }
  console.log('');
  console.log(dim('Plus: /design-thinking command, governance rule, context shard.'));
  console.log('');
}

// ── command: doctor ─────────────────────────────────────────────────────────
function cmdDoctor(flags) {
  const target = flags.targetDir;
  const manifestPath = path.join(target, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) {
    warn('Not installed in this directory. Run ' + cyan('npx @dzhechkov/design-thinking init') + '.');
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.files)) throw new Error('files[] missing');
  } catch {
    err('Manifest ' + MANIFEST_FILE + ' is corrupt. Run ' + cyan('init --force') + ' to repair.');
    process.exit(1);
  }
  let missing = 0;
  for (const f of manifest.files) {
    if (!fs.existsSync(path.join(target, f))) {
      err('Missing: ' + f);
      missing++;
    }
  }
  if (missing === 0) {
    ok('Healthy — ' + manifest.files.length + ' files present (v' + manifest.version + ').');
  } else {
    warn(missing + ' file(s) missing. Run ' + cyan('init --force') + ' to repair.');
    process.exit(1);
  }
}

// ── arg parsing + dispatch ──────────────────────────────────────────────────
function parseArgs(argv) {
  const flags = { force: false, dryRun: false, targetDir: process.cwd() };
  let command = null;
  for (const arg of argv.slice(2)) {
    if (arg === '--force') flags.force = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--help' || arg === '-h') command = 'help';
    else if (arg === '--version' || arg === '-v') command = 'version';
    else if (arg.startsWith('-')) {
      // Reject unknown options loudly — a typo like --froce must not silently
      // downgrade the run (e.g. install without force when force was intended).
      err('Unknown option: ' + arg);
      process.exit(1);
    } else if (command === null) {
      command = arg;
    } else {
      err('Unexpected argument: ' + arg);
      process.exit(1);
    }
  }
  return { command, flags };
}

function main() {
  const { command, flags } = parseArgs(process.argv);
  if (command === 'version') {
    console.log(getVersion());
    return;
  }
  banner();
  if (command === 'help') return showHelp();

  switch (command || 'init') {
    case 'init': return cmdInit(flags);
    case 'list': return cmdList();
    case 'doctor': return cmdDoctor(flags);
    default:
      err('Unknown command: "' + command + '"');
      console.log('');
      showHelp();
      process.exitCode = 1;
  }
}

main();
