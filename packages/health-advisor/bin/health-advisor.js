#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  SKILLS,
  BASE_SKILLS,
  C,
  getSkillsList,
  installSkill,
  installAll,
  installBase,
  installFlat,
  EXT_PREFIX,
  detectInstall,
  validateSkills,
  tierLabel,
  printBanner,
  getSkillsDir,
  getPackageVersion,
} = require('../lib/installer.js');

// Single source of truth — read from package.json so `--version` can never drift (the bin
// hard-coded 1.1.1 while package.json advanced to 1.1.13).
const VERSION = getPackageVersion();

// ── Argument parsing ──────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

// Known options. Reject anything else so a typo (e.g. --dr instead of --dir) cannot
// silently change behavior — e.g. redirect the install into the cwd (finding #18).
// NOTE (ADR-004): there is deliberately NO env-var handling here — the render template is
// overridable ONLY by the explicit --template flag, printed before use.
const VALUE_FLAGS = new Set([
  '--dir', '--out', '--template', '--lanes', '--report', '--mode', '--profile', '--expect', '--run-id',
  // intake-archive (1.7.0). Registered HERE as well as in the engine's own strict parser, because this
  // loop rejects any unknown option before dispatch — a flag the engine understands but this set does
  // not would be refused by the bin and never reach it.
  '--url', '--file', '--expect-sha256', '--workspace', '--limits', '--allow-host',
  // third-brain (1.9.0). Registered HERE as well as in the engine's own strict parser, for exactly
  // the reason the intake note above gives: this loop rejects any unknown option BEFORE dispatch, so
  // a flag the engine understands but this set does not would be refused by the bin and never reach
  // it. `--workspace` is already registered above and is shared by both verbs.
  '--case', '--kind', '--date', '--anchor', '--limit',
]);
const BOOL_FLAGS = new Set([
  '--base', '--extended', '--help', '-h', '--version', '-v', '--stdout', '--all', '--json',
  '--verify', '--dry-run',
]);
(function validateOptions() {
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('-')) continue; // positional (e.g. skill name for install/info)
    if (VALUE_FLAGS.has(a)) { i++; continue; } // consume the value token
    if (BOOL_FLAGS.has(a)) continue;
    console.error(`[ERROR] Unknown option: ${a}`);
    process.exit(1);
  }
})();

function getFlag(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] || null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

// Positional arguments after the command, with value-flag values skipped
// (e.g. `render --out x.html file.md` → ['file.md']).
function getPositionals() {
  const out = [];
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      if (VALUE_FLAGS.has(a)) i++; // skip the value token
      continue;
    }
    out.push(a);
  }
  return out;
}

// ── Commands ──────────────────────────────────────────────────────

function showHelp() {
  console.log(`
${C.bold}Usage:${C.reset} health-advisor <command> [options]

${C.bold}Commands:${C.reset}
  init [--base|--extended]  Install flat bare skills into .claude/skills/
                            (master -> .claude/skills/health-advisor/SKILL.md,
                             each extended -> .claude/skills/health-advisor-<name>/SKILL.md)
  list [--base|--extended]  List available skills with Trust Tiers
  install <skill-name>      Install one extended skill as .claude/skills/health-advisor-<name>/
  validate                  Run BTO Layer 0 validation on installed skills
  info <skill-name>         Show details about a specific skill
  render <file.md>          Convert a patient .md into styled, self-contained HTML
                            (bundled template only; works from any cwd — see ADR-004)
  check [dir]               Pairing gate: exit 1 if any .md has no sibling .html (fail-closed)
  intake-archive --workspace <dir> (--url <https://…> --expect-sha256 <hex> | --file <path>)
                            Deterministic archive intake: verify digest → hardened unzip → ATOMIC
                            commit into sources/raw/sha256-<hex>/ + sources/manifest.json + LOG.jsonl.
                            --verify re-hashes the raw zone against the catalog. --dry-run touches
                            nothing (zero network, zero writes).
  third-brain ingest <doc.md> --case <slug> --kind <kind> --date <YYYY-MM-DD> [--anchor <id>]…
  third-brain search "<query>" [--limit N] | third-brain backlinks <doc_id>
                            The THIRD BRAIN: files FULL analytical documents into
                            <workspace>/.health-brain — the SEGREGATED store, never the shared one —
                            searchable by their own words, with VERIFIED backlinks to the manifest.
  consult-gate <synthesis.md> --lanes <dir>
                            Caveat-preservation gate (консилиум): shadow by default (report-only,
                            exit 0 by construction); --mode enforce needs the workspace policy too
  triage --profile <p.json> Deterministic emergency-threshold comparator (12 canonical rows;
                            action per row: СКОРАЯ ПОМОЩЬ / срочно к врачу — read, never inferred)

  ${C.dim}validate — проверяет УСТАНОВЛЕННЫЕ скиллы. check — проверяет ВЫХОДНЫЕ файлы воркспейса (.md ↔ .html).${C.reset}

${C.bold}Options:${C.reset}
  --base                    Base skills only (core system, modules, prompts)
  --extended                Extended skills only (21 OpenClaw medical skills)
  --dir <path>              Custom installation directory
  --out <path>              render: write HTML to this path (default: sibling <stem>.html)
  --template <path>         render: explicit template override (printed before use)
  --stdout                  render: write HTML to stdout instead of a file
  --all                     check: scan the whole tree, not just sources/research/analysis/doctors
  --json                    check/consult-gate/triage: JSON output (same exit codes as text mode)
  --lanes <dir>             consult-gate: directory of <specialty>.findings.json lane files
  --report <path>           consult-gate: also write the JSON gate report to this path; carries the
                            cross-attempt pin state (pinned_caveat_ids). MANDATORY under --mode
                            enforce; an existing report must be a schema-valid ha-gate-report-1
                            (a valid-but-wrong file is exit 2, never a silent pin reset)
  --mode <shadow|enforce>   consult-gate: enforce exits 1 on FAIL / 3 on INCONCLUSIVE — but only
                            with caveat_gate.enforce_policy:"v1" in <cwd>/.dz/config.json (else shadow)
  --expect <s1,s2,…>        consult-gate: the EXPECTED specialist roster — an expected lane with no
                            findings file becomes a NAMED 'missing' failure the synthesis must disclose.
                            MANDATORY (non-empty, no empty components, no duplicates) under --mode enforce
  --run-id <id>             consult-gate: bind the audit to ONE run — every lane file's lane.run_id
                            must byte-match, else a NAMED 'run_mismatch' failure (stale/spoofed lane).
                            MANDATORY under --mode enforce (a run-id-free lane set must not escape binding)
  --profile <path>          triage: patient labs JSON ({labs:[{analyte,value,unit}]} or an array)
  --url <https://…>         intake-archive: archive in object storage (https only)
  --file <path>             intake-archive: archive already on this machine (opens no socket)
  --expect-sha256 <hex>     intake-archive: the archive's sha256, supplied INDEPENDENTLY of it.
                            MANDATORY with --url — a digest taken from the same bytes it vouches for
                            proves only that the bytes are the bytes
  --workspace <dir>         intake-archive: the patient workspace to ingest into
  --allow-host <host>       intake-archive: a host a cross-host redirect may reach (repeatable)
  --limits <file>           intake-archive: JSON overriding the budget registry (the one limits knob)
  --dry-run                 intake-archive: validate + print the plan; zero network, zero writes
  --verify                  intake-archive: re-hash sources/raw/** against the catalog (read-only)
  --help, -h                Show this help message
  --version, -v             Show version

${C.bold}Examples:${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor init${C.reset}              ${C.dim}# install all (base + extended)${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor init --base${C.reset}       ${C.dim}# base only (modules + prompts)${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor init --extended${C.reset}   ${C.dim}# extended only (21 OpenClaw skills)${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor list --base${C.reset}       ${C.dim}# list base skills${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor list --extended${C.reset}    ${C.dim}# list extended skills${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor install pubmed-search${C.reset}
  ${C.dim}npx @dzhechkov/health-advisor info clinpgx${C.reset}
  ${C.dim}node ./bin/health-advisor.js render <file.md>${C.reset}   ${C.dim}# из дерева пакета (npx-форма render/check — с 1.5.0)${C.reset}
  ${C.dim}node ./bin/health-advisor.js check [dir]${C.reset}        ${C.dim}# exit 1, если есть .md без парного .html${C.reset}
`);
}

function showVersion() {
  console.log(`health-advisor v${VERSION}`);
}

function cmdList() {
  printBanner(VERSION);

  const showBase = hasFlag('--base') || !hasFlag('--extended');
  const showExtended = hasFlag('--extended') || !hasFlag('--base');

  if (showBase) {
    console.log(`${C.bold}  Base Skills (${BASE_SKILLS.length})${C.reset} — core Health Advisor system`);
    console.log(`  ${'─'.repeat(78)}`);
    console.log(`  ${C.bold}${pad('Skill', 35)}${pad('Category', 10)}Description${C.reset}`);
    console.log(`  ${'─'.repeat(78)}`);

    for (const s of BASE_SKILLS) {
      console.log(`  ${pad(s.name, 35)}${C.cyan}${pad(s.category, 10)}${C.reset}${s.desc}`);
    }
    console.log('');
  }

  if (showExtended) {
    console.log(`${C.bold}  Extended Skills (${SKILLS.length})${C.reset} — from OpenClaw Medical Skills`);
    console.log(`  ${'─'.repeat(78)}`);
    console.log(`  ${C.bold}${pad('Skill', 40)}${pad('Tier', 6)}${pad('Score', 7)}${pad('Lang', 6)}Description${C.reset}`);
    console.log(`  ${'─'.repeat(78)}`);

    for (const s of SKILLS) {
      const tier = tierLabel(s.tier);
      console.log(`  ${pad(s.name, 40)}${tier}${pad('', 4 - stripAnsi(tier).length + 4)}${pad(typeof s.score === 'number' ? s.score.toFixed(1) : '—', 7)}${pad(s.lang ?? '—', 6)}${s.desc}`);
    }

    console.log(`  ${'─'.repeat(78)}`);
    console.log(`  ${C.green}T3${C.reset} = Trusted  ${C.yellow}T2${C.reset} = Validated  ${C.dim}T1${C.reset} = Structured`);
  }
  console.log('');
}

function cmdInit() {
  const targetDir = getFlag('--dir') || path.join(process.cwd(), '.claude', 'skills', 'health-advisor');
  const baseOnly = hasFlag('--base');
  const extendedOnly = hasFlag('--extended');
  const doBase = baseOnly || !extendedOnly;
  const doExtended = extendedOnly || !baseOnly;

  printBanner(VERSION);

  // Option B — flat, prefixed BARE skills. Claude Code auto-registers only bare skills at
  // .claude/skills/<name>/SKILL.md (EMPIRICALLY verified — a skills-directory plugin does NOT
  // register). Master → /health-advisor; each extended → /health-advisor-<name>.
  const result = installFlat(targetDir, { doBase, doExtended });

  if (doBase) {
    console.log(`  ${C.bold}${C.cyan}Master skill${C.reset} — orchestrator + co-located resources (modules, prompts, base)`);
    console.log(`  ${C.dim}Target: ${targetDir}/SKILL.md${C.reset}`);
    console.log('');
  }
  if (doExtended) {
    console.log(`  ${C.bold}${C.magenta}Extended skills${C.reset} — medical skills, prefixed ${C.dim}${EXT_PREFIX}<name>${C.reset}`);
    console.log(`  ${C.dim}Target: ${path.dirname(targetDir)}/${EXT_PREFIX}<name>/SKILL.md${C.reset}`);
    console.log('');
  }

  for (const name of result.registered) {
    const isMaster = name === 'health-advisor';
    const tag = isMaster ? `${C.cyan}[master]${C.reset}` : `${C.magenta}[ext]${C.reset}   `;
    console.log(`  ${C.green}+${C.reset} ${tag} /${name}`);
  }
  for (const f of result.failed) {
    console.log(`  ${C.red}x${C.reset} ${f.name}: ${f.error}`);
  }
  console.log('');

  console.log(`  ${C.green}${C.bold}Done!${C.reset} Installed ${result.registered.length} skills into .claude/skills/.`);

  if (result.failed.length > 0) {
    console.log(`  ${C.red}${result.failed.length} failed${C.reset} — check paths or run with --dir.`);
  }

  console.log('');
  console.log(`  ${C.dim}Next steps:${C.reset}`);
  console.log(`  ${C.dim}1. Open Claude Code in this project — skills auto-register from .claude/skills/.${C.reset}`);
  console.log(`  ${C.dim}2. Invoke: /health-advisor  (or e.g. /${EXT_PREFIX}drug-interaction-checker)${C.reset}`);
  console.log(`  ${C.dim}3. If a session was already open: /reload-plugins (or reopen) to pick up new skills.${C.reset}`);
  console.log('');

  // Exit non-zero if any component failed to install — a partial install must not
  // report success to CI or to a script that chains on the exit code (finding #17).
  if (result.failed.length > 0) {
    process.exit(1);
  }
}

function cmdInstall() {
  const skillName = args[1];
  if (!skillName) {
    console.error(`${C.red}Error:${C.reset} Please specify a skill name. Run 'health-advisor list' to see available skills.`);
    process.exit(1);
  }

  const targetDir = getFlag('--dir') || path.join(process.cwd(), '.claude', 'skills', 'health-advisor');

  // `targetDir` is the MASTER's skill dir; the extended skill installs as its flat, prefixed
  // SIBLING so it actually registers (same layout `init` writes).
  const result = installSkill(skillName, targetDir);
  if (result.success) {
    console.log(`${C.green}+${C.reset} Installed ${C.bold}${skillName}${C.reset} to ${result.destDir}`);
    console.log(`  ${C.dim}Invoke: /${result.registeredName}${C.reset}`);
  } else {
    console.error(`${C.red}Error:${C.reset} ${result.error}`);
    process.exit(1);
  }
}

function cmdValidate() {
  const fs = require('fs');
  const baseDir = getFlag('--dir') || path.join(process.cwd(), '.claude', 'skills', 'health-advisor');
  // Option B: extended skills install as bare prefixed siblings of the master at
  // <skillsRoot>/health-advisor-<name>/SKILL.md. validateSkills checks that path (prefix-aware).
  const dir = path.dirname(baseDir); // the .claude/skills root

  printBanner(VERSION);
  console.log(`  ${C.bold}BTO Layer 0 Validation${C.reset}`);

  // Do NOT fall back to the package's own bundled skills — that made `validate` report
  // a healthy result in a project where nothing was installed (finding #16). But do NOT demand the
  // MASTER either: `init --extended` is an install mode this CLI offers, and after it `validate`
  // declared 21 valid registrable skills "not installed" and exited 1. Accept EITHER the master or
  // any installed `health-advisor-*` sibling, and validate what is actually there.
  const state = detectInstall(dir);
  if (!state.anythingInstalled) {
    console.log(`  ${C.red}Health Advisor is not installed here.${C.reset}`);
    console.log(`  ${C.dim}Expected: ${path.join(baseDir, 'SKILL.md')}${C.reset}`);
    console.log(`  ${C.dim}      or: ${path.join(dir, EXT_PREFIX + '<name>', 'SKILL.md')}${C.reset}`);
    console.log(`  ${C.dim}Run: npx @dzhechkov/health-advisor init${C.reset}`);
    console.log('');
    process.exit(1);
  }

  console.log(`  ${C.dim}Checking: ${dir}${C.reset}`);
  console.log('');

  const results = validateSkills(dir);

  // The master is a registrable skill in its own right — it used to get no PASS/FAIL line at all,
  // so a full 22-skill install summarised as "Total skills: 21".
  const label = (r) => (r.master ? `${r.name} ${C.dim}[master]${C.reset}` : r.name);
  for (const p of results.pass) {
    console.log(`  ${C.green}PASS${C.reset} ${label(p)} (${p.size} bytes)`);
  }
  for (const w of results.warn) {
    console.log(`  ${C.yellow}WARN${C.reset} ${label(w)} (${w.size} bytes)`);
    for (const issue of w.issues) {
      console.log(`       ${C.dim}- ${issue}${C.reset}`);
    }
  }
  for (const f of results.fail) {
    console.log(`  ${C.red}FAIL${C.reset} ${f.name}: ${f.reason}`);
  }

  const checked = results.pass.length + results.warn.length + results.fail.length;
  console.log('');
  console.log(`  === Summary ===`);
  console.log(`  ${C.green}PASS: ${results.pass.length}${C.reset} | ${C.yellow}WARN: ${results.warn.length}${C.reset} | ${C.red}FAIL: ${results.fail.length}${C.reset}`);
  console.log(`  Total skills: ${checked}${state.masterInstalled ? ' (master + ' + (checked - 1) + ' extended)' : ' (extended only)'}`);
  if (results.skipped.length > 0) {
    console.log(`  ${C.dim}Not installed here: ${results.skipped.length} of ${SKILLS.length} extended skills (not an error).${C.reset}`);
  }
  console.log('');

  if (results.fail.length > 0) {
    process.exit(1);
  }
}

function cmdInfo() {
  const skillName = args[1];
  if (!skillName) {
    console.error(`${C.red}Error:${C.reset} Please specify a skill name. Run 'health-advisor list' to see available skills.`);
    process.exit(1);
  }

  const skill = SKILLS.find(s => s.name === skillName);
  if (!skill) {
    console.error(`${C.red}Error:${C.reset} Unknown skill: ${skillName}`);
    console.error(`Run 'health-advisor list' to see available skills.`);
    process.exit(1);
  }

  const fs = require('fs');
  const skillDir = path.join(getSkillsDir(), skillName);

  console.log('');
  console.log(`  ${C.bold}${skill.name}${C.reset}`);
  console.log(`  ${'─'.repeat(50)}`);
  console.log(`  ${C.dim}Description:${C.reset}  ${skill.desc}`);
  console.log(`  ${C.dim}Trust Tier:${C.reset}   ${tierLabel(skill.tier)} (${skill.tier === 3 ? 'Production' : skill.tier === 2 ? 'Validated' : 'Community'})`);
  console.log(`  ${C.dim}Score:${C.reset}        ${skill.score}`);
  console.log(`  ${C.dim}Language:${C.reset}     ${skill.lang}`);

  if (fs.existsSync(skillDir)) {
    const files = [];
    listFilesRecursive(skillDir, '', files);
    console.log(`  ${C.dim}Files:${C.reset}`);
    for (const f of files) {
      console.log(`    ${f}`);
    }
  } else {
    console.log(`  ${C.dim}Files:${C.reset}        (not installed locally)`);
  }

  console.log('');
}

// ── Helpers ───────────────────────────────────────────────────────

function pad(str, width) {
  if (str.length >= width) return str;
  return str + ' '.repeat(width - str.length);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function listFilesRecursive(dir, prefix, acc) {
  const fs = require('fs');
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '__pycache__') continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      listFilesRecursive(path.join(dir, entry.name), rel, acc);
    } else {
      acc.push(rel);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────

if (!command || hasFlag('--help') || hasFlag('-h')) {
  showHelp();
  process.exit(0);
}

if (hasFlag('--version') || hasFlag('-v')) {
  showVersion();
  process.exit(0);
}

switch (command) {
  case 'init':
    cmdInit();
    break;
  case 'list':
    cmdList();
    break;
  case 'install':
    cmdInstall();
    break;
  case 'validate':
    cmdValidate();
    break;
  case 'info':
    cmdInfo();
    break;
  case 'render': {
    // packageRoot from __dirname — the ONLY cwd-independent anchor (ADR-004; the template is
    // resolved from here, never from the working directory).
    const { runRender } = require('../lib/render.js');
    process.exit(
      runRender({
        input: getPositionals()[0] || null,
        out: getFlag('--out'),
        template: getFlag('--template'),
        stdout: hasFlag('--stdout'),
        packageRoot: path.join(__dirname, '..'),
      })
    );
    break;
  }
  case 'consult-gate': {
    // Caveat-preservation gate (consilium Stage 1). SHADOW by default: exit 0 by construction,
    // report-only (INV-12). Enforcement needs BOTH --mode enforce AND the versioned workspace
    // policy caveat_gate.enforce_policy:"v1" in <cwd>/.dz/config.json (ADR-002 two-switch rule).
    const { runConsultGate } = require('../lib/consult-cli.js');
    process.exit(
      runConsultGate({
        synthesis: getPositionals()[0] || null,
        lanesDir: getFlag('--lanes'),
        mode: getFlag('--mode'),
        json: hasFlag('--json'),
        report: getFlag('--report'),
        expect: getFlag('--expect'),
        runId: getFlag('--run-id'),
      })
    );
    break;
  }
  case 'triage': {
    // Deterministic emergency-threshold comparator over lib/registry/emergency-thresholds.json
    // (12 canonical rows; action per row — ambulance | doctor_24h — read, never inferred).
    const { runTriage } = require('../lib/consult-cli.js');
    process.exit(
      runTriage({
        profile: getFlag('--profile'),
        json: hasFlag('--json'),
        packageRoot: path.join(__dirname, '..'),
      })
    );
    break;
  }
  case 'check': {
    const { runCheck } = require('../lib/check.js');
    process.exit(
      runCheck({
        dir: getPositionals()[0] || getFlag('--dir') || '.',
        all: hasFlag('--all'),
        json: hasFlag('--json'),
      })
    );
    break;
  }
  case 'intake-archive': {
    // Deterministic archive intake into <workspace>/sources/raw/sha256-<hex>/ + sources/manifest.json
    // + sources/LOG.jsonl (1.7.0). The engine lives under skills/ so BOTH invocation paths reach the
    // same code: this bin, and an installed skill at
    // .claude/skills/health-advisor-intake-archive/engine/cli.js.
    //
    // REQUIRED LAZILY, INSIDE THIS BRANCH ONLY. `ha check` and `ha list` must never load the
    // network-capable surface: a module that is not loaded cannot open a socket, and that is a cheaper
    // guarantee than any amount of reasoning about which code path calls what
    // (test/intake-lazy-require.test.js asserts it against require.cache).
    const { main: intakeMain } = require('../skills/intake-archive/engine/cli.js');
    // `process.exitCode`, not `process.exit()`: a piped report must drain before the process ends. The
    // sibling engine CLI in this package MEASURED the alternative — `process.exit()` delivered a 3.45 MB
    // report as 112 KB together with a success code, because a piped stdout is asynchronous in Node and
    // everything still queued is discarded. Every other branch here is synchronous; this one awaits a
    // real run, so it sets the code and lets Node's normal shutdown drain the stream.
    intakeMain(args.slice(1)).then((code) => { process.exitCode = code; });
    break;
  }
  case 'third-brain': {
    // The third brain (1.9.0): FULL analytical documents filed into <workspace>/.health-brain — the
    // SEGREGATED store — through learning_bridge.py's existing four-check gate, with verified
    // backlinks to sources/manifest.json.
    //
    // REQUIRED LAZILY, INSIDE THIS BRANCH ONLY, for the same reason intake-archive is: the write leg
    // is this package's SOLE_SPAWN_SITE, and a module that is not loaded cannot start a process.
    // `ha check` and `ha list` must never load it.
    const { main: thirdBrainMain } = require('../skills/third-brain/engine/cli.js');
    // `process.exitCode`, not `process.exit()` — a piped report must drain before the process ends.
    thirdBrainMain(args.slice(1)).then((code) => { process.exitCode = code; });
    break;
  }
  default:
    console.error(`${C.red}Error:${C.reset} Unknown command: ${command}`);
    console.error(`Run 'health-advisor --help' to see available commands.`);
    process.exit(1);
}
