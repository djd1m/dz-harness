#!/usr/bin/env node
'use strict';

/**
 * P-Replicator statusline (v1.5.0)
 *
 * Invoked by Claude Code via settings.json `statusLine` config. Output to
 * stdout becomes the status bar above the prompt. Multi-line + ANSI colors.
 *
 * Sources: filesystem heuristics + optional state-file (.claude/.p-replicator-state.json)
 * written by /run, /feature, /replicate via .claude/hooks/state-update.cjs.
 *
 * Defensive: every section is wrapped in try/catch with sensible fallback,
 * so a parse error in any single source never breaks the whole status bar.
 */

const fs = require('node:fs');
const path = require('node:path');

// The project root, never the process cwd: a `cd` inside any tool call moves cwd for the rest of
// the session, and these hooks are non-blocking, so a wrong anchor fails SILENTLY. CLAUDE_PROJECT_DIR
// first — the host is authoritative about what the project is. `__dirname` second: a hook always
// lives at <project>/.claude/hooks/<x>.cjs, so its own location settles the root with no cooperation
// from anyone, which is what keeps this working when the variable is absent (hand-run, older host).
const ENV_ROOT = process.env.CLAUDE_PROJECT_DIR;
// isAbsolute, not just truthy: a RELATIVE value would still be resolved against the drifting
// cwd, which is the very bug this anchor exists to remove.
const ROOT = (ENV_ROOT && path.isAbsolute(ENV_ROOT))
  ? ENV_ROOT
  : path.resolve(__dirname, '..', '..');

const CWD = ROOT;

// Two questions, two names. WHERE THE INSTRUMENTS ARE is answered by the hook's own location and is
// correct from any cwd; WHICH PROJECT'S ROADMAP TO SHOW is a different question, answered by the
// survey below. Collapsing them into one anchor is what made the status line report half the truth
// from every directory: the toolkit half from the project directory, the roadmap half from the root.
const TOOLKIT_ROOT = ROOT;
const NOW = Date.now();

// ─── ANSI helpers ─────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  red:    '\x1b[31m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
};
function color(c, s) { return c + s + C.reset; }
function bold(s)  { return C.bold + s + C.reset; }
function dim(s)   { return C.dim + s + C.reset; }
function green(s) { return C.green + s + C.reset; }
function yellow(s){ return C.yellow + s + C.reset; }
function red(s)   { return C.red + s + C.reset; }
function cyan(s)  { return C.cyan + s + C.reset; }
function gray(s)  { return C.gray + s + C.reset; }

// ─── safe wrappers ────────────────────────────────────────────────────────
function safeRun(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}
function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function safeReadText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function safeListDir(p) {
  try { return fs.readdirSync(p); } catch { return []; }
}
function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

// ─── parsers (heuristic) ──────────────────────────────────────────────────

function parseManifest() {
  return safeReadJson(path.join(CWD, '.p-replicator.json'));
}

function parseState() {
  const p = path.join(CWD, '.claude', '.p-replicator-state.json');
  const state = safeReadJson(p);
  if (!state) return null;
  // Stale check: state older than 30 min — treat as not-running
  if (state.updatedAt) {
    const age = NOW - new Date(state.updatedAt).getTime();
    if (age > 30 * 60 * 1000) return null;
  }
  return state;
}

function summariseRoadmap(file) {
  const r = safeReadJson(file);
  if (!r || !Array.isArray(r.features)) return null;
  const features = r.features;
  const total = features.length;
  const done = features.filter((f) => f.status === 'done').length;
  const inProgress = features.find((f) => f.status === 'in_progress');
  const blocked = features.filter((f) => f.status === 'blocked').length;
  const mvp = features.filter((f) => f.priority === 'mvp');
  const mvpDone = mvp.filter((f) => f.status === 'done').length;
  // A roadmap that does not match the schema used to render "mvp 0/0" and say nothing, so the
  // divergence became permanent: the number was right, the reader learned nothing. `priority` is a
  // CLOSED set (.claude/commands/next.md). Anything else — a value like "critical", or MVP moved
  // into `tags` leaving no `priority` at all — is marked, never silently counted as zero.
  const PRIORITIES = ['mvp', 'high', 'medium', 'low'];
  // EVERY feature must carry a priority from the set. Counting only the ones that already have a
  // string hid the mixed case: one valid entry beside a missing or non-string sibling passed
  // silently, which is the most likely real roadmap of all.
  const offSchemaCount = features.filter(
    (f) => typeof f.priority !== 'string' || !PRIORITIES.includes(f.priority)).length;
  return { total, done, inProgress, blocked, mvpTotal: mvp.length, mvpDone, offSchemaCount };
}

function parseRoadmap() {
  return summariseRoadmap(path.join(CWD, '.claude', 'feature-roadmap.json'));
}

// A SURVEY, not a guess. The roadmap may live one level DOWN (a course with projects/01-app), which
// is why walking upward does not treat this symptom. Enumerating is honest where guessing is not,
// and a cwd-based guess is exactly the drift this whole line of work removed.
// This runs on EVERY prompt, so the survey is bounded on both axes: how many entries it will look
// at, and how large a file it will parse. Without those bounds a projects/ directory with hundreds
// of entries, or one enormous roadmap, would add its cost to every keystroke's status line.
const SUB_SCAN_LIMIT = 24;              // entries examined per render
const SUB_ROADMAP_MAX_BYTES = 512 * 1024;

function parseSubProjects() {
  const base = path.join(CWD, 'projects');
  const out = [];
  let looked = 0;
  for (const name of safeListDir(base).sort()) {       // sorted: the same render every time
    if (looked >= SUB_SCAN_LIMIT) break;
    looked += 1;
    const dir = path.join(base, name);
    if (!safeRun(() => fs.statSync(dir).isDirectory(), false)) continue;   // a FILE named projects/x
    const file = path.join(dir, '.claude', 'feature-roadmap.json');
    const size = safeRun(() => fs.statSync(file).size, -1);
    if (size < 0 || size > SUB_ROADMAP_MAX_BYTES) continue;                // absent or absurd
    const sum = summariseRoadmap(file);
    if (sum) out.push({ name, ...sum });                                   // malformed → skipped
  }
  return out;
}

function parseSparcDocs() {
  const docsDir = path.join(CWD, 'docs');
  const expectedSparc = [
    'PRD.md', 'Solution_Strategy.md', 'Specification.md', 'Pseudocode.md',
    'Architecture.md', 'Refinement.md', 'Completion.md',
    'Research_Findings.md', 'Final_Summary.md', 'C4_Diagrams.md', 'ADR.md',
  ];
  const present = expectedSparc.filter((f) => exists(path.join(docsDir, f)));
  return { present: present.length, total: expectedSparc.length };
}

function parseValidationScore() {
  const p = path.join(CWD, 'docs', 'validation-report.md');
  const text = safeReadText(p);
  if (!text) return null;
  // Look for "Average Score: XX/100" or "Score: XX" patterns
  const m = text.match(/(?:average\s+)?score[:\s]+(\d{1,3})(?:\s*\/\s*100)?/i);
  if (!m) return null;
  const score = parseInt(m[1], 10);
  let verdict;
  if (score >= 70) verdict = 'READY';
  else if (score >= 50) verdict = 'CAVEATS';
  else verdict = 'NEEDS_WORK';
  return { score, verdict };
}

function parseAdrs() {
  // Prefer docs/ADR.md (single file with ## ADR-N headings)
  const single = path.join(CWD, 'docs', 'ADR.md');
  if (exists(single)) {
    const text = safeReadText(single) || '';
    const headings = text.match(/^#{2,3}\s+ADR/gm) || [];
    if (headings.length > 0) return headings.length;
  }
  // Or docs/adr/*.md (per-ADR files)
  const dir = path.join(CWD, 'docs', 'adr');
  const files = safeListDir(dir).filter((f) => f.endsWith('.md'));
  if (files.length > 0) return files.length;
  // Or docs/ddd/adr/*.md (DDD pipeline)
  const dddDir = path.join(CWD, 'docs', 'ddd', 'adr');
  const dddFiles = safeListDir(dddDir).filter((f) => f.endsWith('.md'));
  return dddFiles.length;
}

function parsePlans() {
  const dir = path.join(CWD, 'docs', 'plans');
  return safeListDir(dir).filter((f) => f.endsWith('.md')).length;
}

/**
 * THREE states, because two were not enough.
 *
 * `{count:0}` was returned both for a carrier that does not exist and for one that exists and holds
 * nothing — so a project that had never recorded an insight rendered identically to one being used
 * and found empty. That indistinguishability is what let 27 recorded insights become 0 across four
 * real projects without any surface saying so (MEASURED 2026-08-27).
 */
function parseInsights() {
  const p = path.join(CWD, '.claude', 'insights', 'index.md');
  const text = safeReadText(p);
  if (text === null || text === undefined) return { count: 0, lastDate: null, started: false };
  if (!text.trim()) return { count: 0, lastDate: null, started: true };
  const headings = text.match(/^##\s+\d{4}-\d{2}-\d{2}/gm) || [];
  // Last date: extract from last heading
  let lastDate = null;
  if (headings.length > 0) {
    const last = headings[headings.length - 1];
    const m = last.match(/\d{4}-\d{2}-\d{2}/);
    if (m) lastDate = m[0];
  }
  return { count: headings.length, lastDate, started: true };
}

function parseToolkit() {
  const dir = path.join(TOOLKIT_ROOT, '.claude');
  const skills = safeListDir(path.join(dir, 'skills')).filter((d) => {
    return safeRun(() => fs.statSync(path.join(dir, 'skills', d)).isDirectory(), false);
  }).length;
  const commands = safeListDir(path.join(dir, 'commands'))
    .filter((f) => f.endsWith('.md')).length;
  const agents = safeListDir(path.join(dir, 'agents'))
    .filter((f) => f.endsWith('.md')).length;
  const rules = safeListDir(path.join(dir, 'rules'))
    .filter((f) => f.endsWith('.md')).length;
  const hooks = safeListDir(path.join(dir, 'hooks'))
    .filter((f) => f.endsWith('.cjs')).length;
  return { skills, commands, agents, rules, hooks };
}

function parseExpectedToolkit() {
  // From manifest's components if shippedDefaults available; otherwise fall back to baseline
  return {
    skillsExpected: 10,
    commandsExpected: 11,
    agentsExpected: 4,    // pre-shipped only (project agents are extra)
    rulesExpected: 13,    // pre-shipped only (project rules are extra)
    hooksExpected: 25,    // 4 event hooks + statusline + state-update + writer + 15 checks + 1 capture
  };
}

function parseSettingsStatus(manifest) {
  const settingsPath = path.join(TOOLKIT_ROOT, '.claude', 'settings.json');
  if (!exists(settingsPath)) return 'missing';
  const cur = safeReadJson(settingsPath);
  if (!cur) return 'corrupt';
  const shipped = manifest && manifest.shippedDefaults && manifest.shippedDefaults['settings.json'];
  if (!shipped) return 'unknown';
  // If exact match: defaults; else: merged (user customized)
  try {
    const sortKeys = (o) => JSON.stringify(o, Object.keys(o).sort());
    return sortKeys(cur) === sortKeys(shipped) ? 'defaults' : 'merged';
  } catch {
    return 'unknown';
  }
}

function parseMcpServers() {
  const mcpJson = safeReadJson(path.join(CWD, '.mcp.json'));
  if (!mcpJson) return null;
  const servers = mcpJson.mcpServers || mcpJson.servers || {};
  return Object.keys(servers).length;
}

function parseKeysarium() {
  return exists(path.join(CWD, '.keysarium.json'));
}

function parseDomain() {
  const claudeMd = safeReadText(path.join(CWD, 'CLAUDE.md'));
  if (!claudeMd) return null;
  // Heuristic keyword search, with UNICODE word boundaries.
  //
  // Without them this was wrong in four ways at once, all reproduced: "healthchecks" made a project
  // medical, "translate" and "slack" made it enterprise (`sla` sits inside both), and "embankment"
  // made it a bank.
  //
  // `\b` is NOT the fix and would quietly break the Russian half: it is defined over \w =
  // [A-Za-z0-9_], so there is no word boundary between a space and `б`. MEASURED —
  // /\bбанк/.test('банк России') is FALSE. Hence Unicode lookarounds with the `u` flag.
  //
  // Two kinds of term, deliberately distinguished. A STEM is meant to match inflections — `банк` in
  // «банкинг», `финт` in «финтех», `рекоменд` in «рекомендательный» — so it takes a LEFT boundary
  // only. A WHOLE WORD (`sla`, `bank`, `conversion`) takes both, because matching it inside another
  // word is exactly the defect.
  const L = '(?<![\\p{L}\\p{N}])';   // start of a word, in any alphabet
  const R = '(?![\\p{L}\\p{N}])';    // end of a word
  const stem = (alts) => new RegExp(L + '(?:' + alts + ')', 'iu');
  const word = (alts) => new RegExp(L + '(?:' + alts + ')' + R, 'iu');

  // A LEFT-only boundary is not enough for every Russian stem, and cross-family QE named the
  // counter-examples: «Сервис организации банкетов» is not a bank, «Финты в футболе» is not fintech,
  // «ЦБС городской библиотеки» is not the central bank. So the ambiguous stems are spelled out with
  // their real inflections and right-bounded, and the two-letter acronym `цб` is dropped outright —
  // two letters cannot be made safe by any boundary.
  const bankingStem = stem('банковск|финтех|фз-152|фстэк');
  const bankingWord = word('банк(?:а|у|ом|е|и|ов|ам|ами|ах|инг)?|bank(?:ing|s|er|ers)?'
    + '|fintech|gigachat|yandexgpt');
  // `retail` IS a stem — "Retailer inventory analytics" is retail and whole-word-only missed it.
  // `conversion` alone is not: "Video conversion service" is not commerce. It needs its qualifier.
  const retailStem = stem('ритейл|рекоменд|retail');
  // `\\w` is [A-Za-z0-9_] and does NOT cover Cyrillic — the same trap as `\\b`, one level down:
  // «конверси» + \\w* + a right boundary fails on «конверсию», because `ю` is neither \\w nor a
  // boundary. Use \\p{L}. And the Russian term needs its qualifier for the same reason the English
  // one does: «конверсия файлов» is no more commerce than "video conversion" is.
  const retailWord = word('e-?commerce|conversion\\s+rate'
    + '|конверси\\p{L}*\\s+(?:воронк|продаж|лид)\\p{L}*');
  const enterpriseWord = word('enterprise(?:s)?|b2b|legacy|sla|change\\s*management');
  // `health` alone cannot be made right: bounded it stops matching "healthcare", unbounded it matches
  // "healthcheck". So it is replaced by the forms that actually mean the domain — including the
  // space-separated "health tech", which the first version missed.
  const healthcareStem = stem('медицин|клиник|фз-323');
  const healthcareWord = word('health[\\s-]?(?:care|tech)|healthcare|medical|hipaa');

  const banking = { test: (t) => bankingStem.test(t) || bankingWord.test(t) };
  const retail = { test: (t) => retailStem.test(t) || retailWord.test(t) };
  const enterprise = enterpriseWord;
  const healthcare = { test: (t) => healthcareStem.test(t) || healthcareWord.test(t) };
  if (banking.test(claudeMd)) return 'banking';
  if (retail.test(claudeMd)) return 'retail';
  if (enterprise.test(claudeMd)) return 'enterprise';
  if (healthcare.test(claudeMd)) return 'healthcare';
  return null;
}

function parseLastHarvest() {
  // Heuristic: TOOLKIT_HARVEST.md mtime
  const p = path.join(CWD, 'TOOLKIT_HARVEST.md');
  try {
    const stat = fs.statSync(p);
    return stat.mtime.toISOString().slice(0, 10);
  } catch { return null; }
}

function parseLastTest() {
  // Optional cache file written by users
  const p = path.join(CWD, '.claude', '.last-test.json');
  return safeReadJson(p);
}

// ─── progress bar ─────────────────────────────────────────────────────────
function bar(progress, width = 8) {
  const fill = Math.round(progress * width);
  const empty = width - fill;
  return '▓'.repeat(fill) + '░'.repeat(empty);
}
function dotBar(done, total, width = 8) {
  const w = Math.min(width, Math.max(total, 1));
  const fill = Math.round((done / Math.max(total, 1)) * w);
  return '['+ '●'.repeat(fill) + '○'.repeat(w - fill) + ']';
}

// ─── line builders ───────────────────────────────────────────────────────
function buildHeader(manifest) {
  const ver = (manifest && manifest.version) || '?';
  const user = process.env.USER || process.env.USERNAME || 'user';
  const model = process.env.CLAUDE_MODEL || process.env.MODEL || 'Claude';
  return `${cyan(bold('P-Replicator'))} ${dim('V' + ver)} ${green('●')} ${user}  ${dim('│')}  ${model}`;
}

function buildPipeline(state) {
  const parts = ['🚀 ' + bold('Pipeline')];
  if (state && state.currentCommand) {
    const cmd = state.currentCommand;
    const phase = state.currentPhase;
    if (phase) {
      const progress = typeof phase.progress === 'number' ? phase.progress : 0;
      const idx = phase.index ?? '?';
      const total = phase.total ?? '?';
      parts.push(`${cyan(cmd)} ${bar(progress)} ${Math.round(progress*100)}%`);
      parts.push(`${dim('Phase:')} ${phase.name || ''} (${idx}/${total})`);
    } else {
      parts.push(cyan(cmd));
    }
    if (state.lastCommand && state.lastCommand !== cmd) {
      parts.push(`${dim('Last:')} ${state.lastCommand}`);
    }
  } else {
    parts.push(dim('idle'));
  }
  return parts.join('  ' + dim('│') + '  ');
}

function buildRoadmap(roadmap, domain, subProjects) {
  const subs = Array.isArray(subProjects) ? subProjects : [];
  if (!roadmap) {
    // No roadmap at the root. If sub-projects have one, report THEIRS — labelled as theirs. The old
    // line said "no roadmap yet" while thirteen features sat one directory down.
    if (subs.length > 0) {
      const total = subs.reduce((n, s) => n + s.total, 0);
      const done = subs.reduce((n, s) => n + s.done, 0);
      const where = subs.length === 1 ? subs[0].name : subs.length + ' projects';
      return [
        `🎯 ${bold('Roadmap')}`,
        `${dim('in')} ${cyan(where)}`,
        `${dotBar(done, total, 8)} ${dim('Done')} ${green(done + '/' + total)}`,
      ].join(`  ${dim('│')}  `);
    }
    return `🎯 ${bold('Roadmap')}  ${dim('— no roadmap yet (run /next or /replicate)')}`;
  }
  const { total, done, inProgress, blocked, mvpTotal, mvpDone, offSchemaCount } = roadmap;
  const dotbar = dotBar(done, total, 8);
  const parts = [
    `🎯 ${bold('Roadmap')}`,
    // The bar is drawn from done/total, so it is captioned Done. It used to sit beside `mvp`, which
    // it never showed — one glyph and two different quantities, read as one statement. The bar is
    // CORRECT and stays; the caption is what was wrong, and hiding a working indicator to mask a
    // wrong caption would have been the wrong half of the fix.
    `${dotbar} ${dim('Done')} ${green(done + '/' + total)}`,
    offSchemaCount > 0
      // The known count is still knowledge — replacing it with '?' throws away what WAS established
      // and tells the reader less than before. Show both: what is counted, and how much was not.
      ? `${dim('mvp')} ${green(mvpDone + '/' + mvpTotal)} ${yellow('⚠' + offSchemaCount)} ${dim('schema')}`
      : `${dim('mvp')} ${green(mvpDone + '/' + mvpTotal)}`,
  ];
  if (inProgress) {
    parts.push(`${dim('▶')} ${cyan(inProgress.id)}`);
  }
  if (blocked > 0) {
    parts.push(`${red('Blocked')} ${blocked}`);
  }
  if (subs.length > 0) {
    const subTotal = subs.reduce((n, s) => n + s.total, 0);
    parts.push(`${dim('+' + subs.length + ' sub')} ${green(String(subTotal))}`);
  }
  if (domain) {
    parts.push(`${dim('Domain:')} ${cyan(domain)}`);
  }
  return parts.join('  ' + dim('│') + '  ');
}

function buildDocs(sparc, validation, plans, adrs, lastHarvest) {
  const parts = [`📊 ${bold('SPARC')} ${green('●' + sparc.present + '/' + sparc.total)}`];
  if (validation) {
    const verdictIcon = validation.verdict === 'READY' ? '🟢'
      : validation.verdict === 'CAVEATS' ? '🟡' : '🔴';
    parts.push(`${verdictIcon} ${validation.score}/100`);
  }
  parts.push(`${dim('Plans')} ${plans > 0 ? green('●' + plans) : '0'}`);
  parts.push(`${dim('ADRs')} ${adrs > 0 ? green('●' + adrs) : '0'}`);
  if (lastHarvest) {
    parts.push(`${dim('Harvest')} ${lastHarvest}`);
  }
  return parts.join('  ' + dim('│') + '  ');
}

function buildToolkit(toolkit, expected) {
  const dotIf = (v, e) => v >= e ? green('●' + v + '/' + e) : yellow('●' + v + '/' + e);
  const extraAgents = Math.max(0, toolkit.agents - expected.agentsExpected);
  const extraRules  = Math.max(0, toolkit.rules - expected.rulesExpected);
  const agentsLbl = toolkit.agents >= expected.agentsExpected
    ? green('●' + expected.agentsExpected + (extraAgents > 0 ? '+' + extraAgents : ''))
    : yellow('●' + toolkit.agents + '/' + expected.agentsExpected);
  const rulesLbl = toolkit.rules >= expected.rulesExpected
    ? green('●' + expected.rulesExpected + (extraRules > 0 ? '+' + extraRules : ''))
    : yellow('●' + toolkit.rules + '/' + expected.rulesExpected);
  return [
    `🛠️  ${bold('Toolkit')}`,
    `Skills ${dotIf(toolkit.skills, expected.skillsExpected)}`,
    `Cmds ${dotIf(toolkit.commands, expected.commandsExpected)}`,
    `Agents ${agentsLbl}`,
    `Rules ${rulesLbl}`,
    `Hooks ${dotIf(toolkit.hooks, expected.hooksExpected)}`,
  ].join('  ' + dim('│') + '  ');
}

function buildStatus(insights, lastTest, mcpServers, settingsStatus, keysarium) {
  const parts = [];
  // '0' meant two different things: no carrier at all, and a carrier holding nothing. A dash
  // says the first; a zero says the second. The reader can now tell which one they are looking at.
  parts.push(`💡 ${bold('Insights')} ${insights.count > 0 ? green('●' + insights.count) : insights.started ? '0' : dim('—')}` +
    (insights.lastDate ? ` ${dim('(' + insights.lastDate + ')')}` : ''));

  if (lastTest && typeof lastTest.passed === 'number') {
    const total = lastTest.total ?? lastTest.passed;
    const ok = lastTest.passed === total;
    parts.push(`${ok ? '✅' : '❌'} ${dim('Tests')} ${ok ? green(lastTest.passed + '/' + total) : red(lastTest.passed + '/' + total)}`);
  }
  if (mcpServers !== null && mcpServers !== undefined) {
    parts.push(`🔌 ${dim('MCP')} ${mcpServers > 0 ? green('●' + mcpServers) : '0'}`);
  }
  if (settingsStatus) {
    const map = { defaults: '✓ defaults', merged: '⚠️ merged', corrupt: red('🔴 corrupt'), missing: red('missing'), unknown: '?' };
    parts.push(`⚙️  ${dim('Settings')} ${map[settingsStatus] || settingsStatus}`);
  }
  if (keysarium) {
    parts.push(`🧬 ${green('Keysarium ✓')}`);
  }
  return parts.join('  ' + dim('│') + '  ');
}

// ─── main ─────────────────────────────────────────────────────────────────
function main() {
  const manifest = safeRun(() => parseManifest(), null);
  const state = safeRun(() => parseState(), null);
  const roadmap = safeRun(() => parseRoadmap(), null);
  const subProjects = safeRun(() => parseSubProjects(), []);
  const sparc = safeRun(() => parseSparcDocs(), { present: 0, total: 11 });
  const validation = safeRun(() => parseValidationScore(), null);
  const adrs = safeRun(() => parseAdrs(), 0);
  const plans = safeRun(() => parsePlans(), 0);
  const insights = safeRun(() => parseInsights(), { count: 0, lastDate: null, started: false });
  const toolkit = safeRun(() => parseToolkit(), { skills: 0, commands: 0, agents: 0, rules: 0, hooks: 0 });
  const expected = parseExpectedToolkit();
  const settingsStatus = safeRun(() => parseSettingsStatus(manifest), null);
  const mcpServers = safeRun(() => parseMcpServers(), null);
  const keysarium = safeRun(() => parseKeysarium(), false);
  const domain = safeRun(() => parseDomain(), null);
  const lastHarvest = safeRun(() => parseLastHarvest(), null);
  const lastTest = safeRun(() => parseLastTest(), null);

  const lines = [
    buildHeader(manifest),
    buildPipeline(state),
    buildRoadmap(roadmap, domain, subProjects),
    buildDocs(sparc, validation, plans, adrs, lastHarvest),
    buildToolkit(toolkit, expected),
    buildStatus(insights, lastTest, mcpServers, settingsStatus, keysarium),
  ];

  // Write to stdout, never throw
  try {
    process.stdout.write(lines.join('\n') + '\n');
  } catch { /* ignore */ }
}

main();
