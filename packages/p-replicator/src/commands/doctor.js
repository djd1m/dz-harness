'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  green, red, yellow, cyan, bold, dim,
  info, success, warn, error: logError,
  readManifest, fileExists, artifactState,
  MANIFEST_FILE, COMPONENTS,
} = require('../utils');

// ---------------------------------------------------------------------------
// Expected components — derived from utils.COMPONENTS.items (SSOT)
// ---------------------------------------------------------------------------

const EXPECTED_SKILLS   = Object.keys(COMPONENTS.skills.items);
const EXPECTED_COMMANDS = Object.keys(COMPONENTS.commands.items);
const EXPECTED_AGENTS   = Object.keys(COMPONENTS.agents.items);
const EXPECTED_RULES    = Object.keys(COMPONENTS.rules.items);

const FIX_COMMIT_SUBJECT = /^fix(?:\([^\r\n()]+\))?:/;
const INSIGHT_RECORD_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s+—(?:\s|$)/gm;

function localDate(date) {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function insightFlowWindow(referenceTime) {
  const end = new Date(referenceTime.getFullYear(), referenceTime.getMonth(), referenceTime.getDate());
  const start = new Date(end);
  start.setDate(start.getDate() - 2);
  return { startDate: localDate(start), endDate: localDate(end) };
}

function notPerformed(window, reason) {
  return { state: 'not-performed', ...window, reason };
}

function measureInsightFlow(targetDir, referenceTime) {
  const window = insightFlowWindow(referenceTime);
  const gitOptions = {
    cwd: targetDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  };

  const repository = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], gitOptions);
  if (repository.status !== 0) {
    if (repository.error && repository.error.code === 'ENOENT') {
      return notPerformed(window, 'git unavailable');
    }
    const gitMarker = path.join(targetDir, '.git');
    return notPerformed(window,
      fs.existsSync(gitMarker) ? 'no readable git history' : 'not a git repository');
  }
  if (repository.stdout.trim() !== 'true') return notPerformed(window, 'not a git repository');

  const head = spawnSync('git', ['rev-parse', '--verify', 'HEAD'], gitOptions);
  if (head.status !== 0) {
    // Unreadable history is unknown, never a measured zero; mutation-gate protects this branch.
    return {
      state: 'not-performed',
      startDate: window.startDate,
      endDate: window.endDate,
      reason: 'no readable git history',
    };
  }

  const history = spawnSync('git', [
    'log', '--format=%s',
    `--since=${window.startDate} 00:00:00`,
    `--until=${window.endDate} 23:59:59`,
  ], gitOptions);
  if (history.status !== 0) {
    return notPerformed(window, 'git history query failed');
  }
  const fixCommits = history.stdout.split(/\r?\n/).filter((subject) =>
    FIX_COMMIT_SUBJECT.test(subject)).length;

  const insightsIndex = path.join(targetDir, '.claude', 'insights', 'index.md');
  let insights;
  try {
    insights = fs.readFileSync(insightsIndex, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') insights = '';
    else return notPerformed(window, 'insight carrier is unreadable');
  }
  const insightRecords = Array.from(insights.matchAll(INSIGHT_RECORD_HEADING))
    .filter((match) => match[1] >= window.startDate && match[1] <= window.endDate).length;

  return { state: 'measured', ...window, fixCommits, insightRecords };
}

function run(options) {
  const { targetDir } = options;

  let issues = 0;
  let warnings = 0;

  function pass(msg) { console.log(`  ${green('\u2713')} ${msg}`); }
  function fail(msg) { console.log(`  ${red('\u2717')} ${msg}`); issues++; }
  function hint(msg) { console.log(`  ${yellow('!')} ${msg}`); warnings++; }

  /**
   * One reporter for every component, because a two-way branch cannot say three things.
   *
   * The first version of this change swapped the CONDITION to artifactState and left the else
   * branch intact, so a whitespace-only artifact was reported as "missing" — the exact collapse
   * AR-4 forbids. And settings.json and the hooks were still on fileExists, so a ZERO-BYTE
   * settings.json (no hooks wired at all) and a zero-byte hook both received a checkmark.
   */
  function reportArtifact(label, filePath, missingNote) {
    const state = artifactState(filePath);
    if (state === 'present') { pass(label); return; }
    if (state === 'empty') { fail(`${label} \u2014 EMPTY, cannot load`); return; }
    fail(`${label} \u2014 missing${missingNote ? ' (' + missingNote + ')' : ''}`);
  }


  console.log(bold('P-Replicator \u2014 Health Check'));
  console.log('');

  // ── 1) Manifest ─────────────────────────────────────────────────────────
  console.log(bold('Manifest:'));
  const manifest = readManifest(targetDir);
  if (manifest) {
    pass(`${MANIFEST_FILE} found (v${manifest.version}, ${manifest.installedAt})`);
  } else {
    fail(`${MANIFEST_FILE} not found \u2014 not installed or manifest deleted`);
  }
  console.log('');

  // ── 2) .claude directory ────────────────────────────────────────────────
  console.log(bold('.claude/ directory:'));
  const claudeDir = path.join(targetDir, '.claude');
  if (fileExists(claudeDir)) {
    pass('.claude/ exists');
  } else {
    fail('.claude/ directory not found');
    console.log('');
    logError(`Run ${cyan('npx @dzhechkov/p-replicator init')} to install.`);
    process.exit(1);
  }
  console.log('');

  // ── 3) Skills ───────────────────────────────────────────────────────────
  console.log(bold(`Skills (expected ${EXPECTED_SKILLS.length}):`));
  for (const skill of EXPECTED_SKILLS) {
    const skillPath = path.join(claudeDir, 'skills', skill, 'SKILL.md');
    reportArtifact(skill, skillPath, 'SKILL.md');
  }
  console.log('');

  // ── 4) Commands ─────────────────────────────────────────────────────────
  console.log(bold(`Commands (expected ${EXPECTED_COMMANDS.length}):`));
  for (const cmd of EXPECTED_COMMANDS) {
    const cmdPath = path.join(claudeDir, 'commands', `${cmd}.md`);
    reportArtifact(`/${cmd}`, cmdPath, undefined);
  }
  console.log('');

  // ── 5) Agents ───────────────────────────────────────────────────────────
  console.log(bold(`Agents (expected ${EXPECTED_AGENTS.length}):`));
  for (const agent of EXPECTED_AGENTS) {
    const agentPath = path.join(claudeDir, 'agents', `${agent}.md`);
    reportArtifact(agent, agentPath, undefined);
  }
  console.log('');

  // ── 6) Rules ────────────────────────────────────────────────────────────
  console.log(bold(`Rules (expected ${EXPECTED_RULES.length}):`));
  for (const rule of EXPECTED_RULES) {
    const rulePath = path.join(claudeDir, 'rules', `${rule}.md`);
    reportArtifact(rule, rulePath, undefined);
  }
  console.log('');

  // ── 6b) Settings (hooks config) ─────────────────────────────────────────
  console.log(bold('Hooks (settings.json):'));
  const settingsPath = path.join(claudeDir, 'settings.json');
  reportArtifact('settings.json', settingsPath, 'SessionStart + Stop hooks not configured');
  console.log('');

  // ── 6c) Hook scripts (cross-platform Node, v1.4.1+) ─────────────────────
  if (COMPONENTS.hooks) {
    const hookKeys = Object.keys(COMPONENTS.hooks.items);
    console.log(bold(`Hook scripts (expected ${hookKeys.length}):`));
    for (const hook of hookKeys) {
      const hookPath = path.join(claudeDir, 'hooks', `${hook}.cjs`);
      reportArtifact(`${hook}.cjs`, hookPath, 'referenced by settings.json');
    }
    console.log('');
  }

  // ── 6d) Prerequisites (system tools the package relies on) ──────────────
  console.log(bold('Prerequisites:'));
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (gitVersion.status === 0) {
    pass('git on PATH');
  } else {
    fail('git NOT on PATH — autocommit hooks (roadmap, insights, plans) will silently no-op');
  }
  console.log('');

  // ── 7) Keysarium integration ────────────────────────────────────────────
  console.log(bold('Integration:'));
  const keysariumManifest = path.join(targetDir, '.keysarium.json');
  if (fileExists(keysariumManifest)) {
    pass('@dzhechkov/keysarium detected \u2014 compatible');
  } else {
    hint('@dzhechkov/keysarium not installed (optional)');
  }
  console.log('');

  // ── The insights carrier: THREE states, and none of them fails ───────────
  //
  // A project that has recorded no insight is a NEW project, and a check that refuses a new project
  // is a check people disable — taking the real signal with it. The defect was never the emptiness:
  // it was that ABSENT and EMPTY rendered identically, so a carrier that had never been created
  // looked exactly like one being used and found empty. MEASURED across four real projects on one
  // machine: 11 -> 10 -> 6 -> 0 insights, with every surface reporting OK throughout.
  const insightsIndex = path.join(claudeDir, 'insights', 'index.md');
  const insightsState = artifactState(insightsIndex);
  if (insightsState === 'missing') {
    hint('insights carrier: NOT STARTED — no .claude/insights/index.md. Record one with /myinsights');
  } else if (insightsState === 'empty') {
    hint('insights carrier: EXISTS but holds ZERO entries — nothing is injected at SessionStart');
  } else {
    const entries = (fs.readFileSync(insightsIndex, 'utf-8')
      .match(/^##\s+\d{4}-\d{2}-\d{2}/gm) || []).length;
    pass('insights carrier: ' + entries + ' entr' + (entries === 1 ? 'y' : 'ies') + ' recorded');
  }
  console.log('');

  const referenceTime = options.now === undefined ? new Date() : new Date(options.now);
  const insightFlow = measureInsightFlow(targetDir, referenceTime);
  const flowPeriod = `${insightFlow.startDate} through ${insightFlow.endDate}`;
  // This evidence is advisory: plain output keeps it outside doctor health accounting.
  if (insightFlow.state === 'measured') {
    console.log(`Insight flow (${flowPeriod}): ${insightFlow.fixCommits} fix commits and `
      + `${insightFlow.insightRecords} insight records`);
  } else {
    console.log(`Insight flow (${flowPeriod}): check NOT performed — ${insightFlow.reason}`);
  }
  console.log('');

  // ── 8) Summary ──────────────────────────────────────────────────────────
  console.log(bold('\u2500'.repeat(50)));
  if (issues === 0 && warnings === 0) {
    success(bold('All checks passed!'));
  } else if (issues === 0) {
    success(`All checks passed with ${yellow(warnings + ' warning(s)')}.`);
  } else {
    logError(`${red(issues + ' issue(s)')} found, ${yellow(warnings + ' warning(s)')}.`);
    console.log('');
    info(`Run ${cyan('npx @dzhechkov/p-replicator init --force')} to repair.`);
  }
  console.log('');

  process.exitCode = issues > 0 ? 1 : 0;
}

module.exports = run;
module.exports.run = run;
