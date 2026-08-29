'use strict';

const fs = require('fs');
const path = require('path');
const {
  green, cyan, bold, dim, yellow,
  info, warn,
  readManifest, fileExists,
  MANIFEST_FILE, COMPONENTS,
} = require('../utils');

// ---------------------------------------------------------------------------
// Display details \u2014 pulled from utils.COMPONENTS.items (SSOT)
// ---------------------------------------------------------------------------

const SKILL_DETAILS   = COMPONENTS.skills.items;
const COMMAND_DETAILS = COMPONENTS.commands.items;
const AGENT_DETAILS   = COMPONENTS.agents.items;

function run(options) {
  const { targetDir } = options;

  const manifest = readManifest(targetDir);
  if (!manifest) {
    warn('P-Replicator is not installed in this directory.');
    info(`Run ${cyan('npx @dzhechkov/p-replicator init')} to install.`);
    process.exit(1);
  }

  console.log(bold('P-Replicator') + dim(` v${manifest.version}`));
  console.log(dim(`Installed: ${manifest.installedAt}`));
  console.log('');

  // ── Skills ──────────────────────────────────────────────────────────────
  const skillsDir = path.join(targetDir, '.claude', 'skills');
  console.log(bold('Skills:'));
  if (fileExists(skillsDir)) {
    const skills = fs.readdirSync(skillsDir).filter((d) => {
      return fs.statSync(path.join(skillsDir, d)).isDirectory();
    });
    for (const skill of skills.sort()) {
      const desc = SKILL_DETAILS[skill] || '';
      const hasSkillMd = fileExists(path.join(skillsDir, skill, 'SKILL.md'));
      const status = hasSkillMd ? green('\u2713') : yellow('?');
      console.log(`  ${status} ${skill}` + (desc ? dim(` \u2014 ${desc}`) : ''));
    }
    console.log(dim(`  Total: ${skills.length} skills`));
  } else {
    console.log(dim('  No skills directory found.'));
  }
  console.log('');

  // ── Commands ────────────────────────────────────────────────────────────
  const commandsDir = path.join(targetDir, '.claude', 'commands');
  console.log(bold('Commands:'));
  if (fileExists(commandsDir)) {
    const commands = fs.readdirSync(commandsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
    for (const cmd of commands.sort()) {
      const desc = COMMAND_DETAILS[cmd] || '';
      console.log(`  ${green('\u2713')} /${cmd}` + (desc ? dim(` \u2014 ${desc}`) : ''));
    }
    console.log(dim(`  Total: ${commands.length} commands`));
  } else {
    console.log(dim('  No commands directory found.'));
  }
  console.log('');

  // ── Agents ──────────────────────────────────────────────────────────────
  const agentsDir = path.join(targetDir, '.claude', 'agents');
  console.log(bold('Agents:'));
  if (fileExists(agentsDir)) {
    const agents = fs.readdirSync(agentsDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
    for (const agent of agents.sort()) {
      const desc = AGENT_DETAILS[agent] || '';
      console.log(`  ${green('\u2713')} ${agent}` + (desc ? dim(` \u2014 ${desc}`) : ''));
    }
    console.log(dim(`  Total: ${agents.length} agents`));
  } else {
    console.log(dim('  No agents directory found.'));
  }
  console.log('');

  // ── Rules ───────────────────────────────────────────────────────────────
  const rulesDir = path.join(targetDir, '.claude', 'rules');
  console.log(bold('Rules:'));
  if (fileExists(rulesDir)) {
    const rules = fs.readdirSync(rulesDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
    for (const rule of rules.sort()) {
      console.log(`  ${green('\u2713')} ${rule}`);
    }
    console.log(dim(`  Total: ${rules.length} rules`));
  } else {
    console.log(dim('  No rules directory found.'));
  }
  console.log('');

  // ── File count ──────────────────────────────────────────────────────────
  const totalFiles = (manifest.files || []).length;
  console.log(dim(`Total tracked files: ${totalFiles}`));
  console.log('');

  process.exit(0);
}

module.exports = run;
module.exports.run = run;
