#!/usr/bin/env node
'use strict';

// cli.js — stdin JSON → rendered markdown on stdout.
//
// Self-contained INSIDE the skill directory, so it is present in an install: `lib/` is never copied
// into `.claude/skills/…` (lib/installer.js — `installSkill` copies only `skills/<name>/`), which is
// why the engine does not live there. `bin/health-advisor.js` is not touched by this skill.
//
// Input shape (exactly what `skills/lab-results/coworker.py` emits, plus the patient context):
//   {
//     "rows": [ { "test_name": "ApoB", "value": 106, "unit": "mg/dL",
//                 "reference_range": "-inf - inf", "status": "normal" } ],
//     "patientContext": { "sex": "male", "conditions": ["documented_atherosclerosis"] },
//     "labReport": { "ApoB": { "lo": 66, "hi": 133, "unit": "mg/dL" } }
//   }
//
// Usage: node skills/clinical-targets/engine/cli.js <input.json>
//    or: node skills/clinical-targets/engine/cli.js < input.json
//
// The file-argument form exists so the documented example is EXECUTABLE by the package's own doc
// gate (`test/output-conventions-executable.test.js` skips any documented line containing `<`,
// so a stdin-only example would be documented but never run).

const fs = require('node:fs');
const { interpretRows } = require('./index.js');

function main(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (err) {
    process.stderr.write(`clinical-targets: stdin is not valid JSON: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }

  const rows = Array.isArray(payload) ? payload : payload.rows;
  if (!Array.isArray(rows)) {
    process.stderr.write('clinical-targets: expected {"rows":[…]} (or a bare array of rows) on stdin\n');
    process.exitCode = 2;
    return;
  }

  try {
    const result = interpretRows(rows, {
      patientContext: Array.isArray(payload) ? undefined : payload.patientContext,
      labReport: Array.isArray(payload) ? undefined : payload.labReport,
      dirs: (!Array.isArray(payload) && payload.registryDirs) || [],
    });
    process.stdout.write(`${result.markdown}\n`);
  } catch (err) {
    // Fail CLOSED and loudly: a registry that cannot be constructed must never degrade into a
    // partial readout that silently drops a citation.
    process.stderr.write(`clinical-targets: ${err.message}\n`);
    process.exitCode = 1;
  }
}

const fileArg = process.argv[2];
if (fileArg) {
  try {
    main(fs.readFileSync(fileArg, 'utf8'));
  } catch (err) {
    process.stderr.write(`clinical-targets: cannot read ${fileArg}: ${err.message}\n`);
    process.exitCode = 2;
  }
} else {
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { buf += chunk; });
  process.stdin.on('end', () => main(buf));
}
