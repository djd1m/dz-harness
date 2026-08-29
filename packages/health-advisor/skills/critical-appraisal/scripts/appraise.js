#!/usr/bin/env node
'use strict';
// ha-ca1 — the skill FRONT-END. No domain logic lives here: this file resolves the engine
// (lib/appraisal-run.js) through a CLOSED two-candidate resolver modelled on lib/render.js
// (ADR-004's discipline): no cwd candidate, no env candidate, no ancestor walk, and NEVER a
// private copy — a vendored engine would be a second definition of everything T-12 forbids one of.
//
//   Candidate 1 — repo / npm-package layout: this file sits inside the package.
//   Candidate 2 — flat skill install: the package is resolvable nearby.
//   Neither     — a NAMED error listing BOTH candidates and the one-line fix, exit 2.
//                 A loud failure is strictly better than a silent verdict.

const fs = require('node:fs');
const path = require('node:path');

function resolveEngine() {
  const candidate1 = path.join(__dirname, '..', '..', '..', 'lib', 'appraisal-run.js');
  const searched = [`(in-package) ${candidate1}`];
  if (fs.existsSync(candidate1)) return { enginePath: candidate1, searched };
  let candidate2 = null;
  try {
    candidate2 = require.resolve('@dzhechkov/health-advisor/lib/appraisal-run.js');
  } catch {
    candidate2 = null;
  }
  searched.push(`(flat-install) ${candidate2 || "require.resolve('@dzhechkov/health-advisor/lib/appraisal-run.js') — not resolvable"}`);
  if (candidate2 && fs.existsSync(candidate2)) return { enginePath: candidate2, searched };
  return { enginePath: null, searched };
}

function main() {
  const { enginePath, searched } = resolveEngine();
  if (enginePath === null) {
    process.stderr.write([
      '[ERROR] health-advisor-critical-appraisal: the appraisal engine could not be resolved.',
      'Searched exactly these candidates (closed set — no cwd, no env, no ancestor walk):',
      ...searched.map((s) => `  ${s}`),
      'Fix: npm i -g @dzhechkov/health-advisor',
      '',
    ].join('\n'));
    process.exit(2);
  }
  const { runCli } = require(enginePath);
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`[ERROR] appraise: ${err && err.message ? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}

module.exports = { resolveEngine };

/* istanbul ignore next -- CLI adapter */
if (require.main === module) main();
